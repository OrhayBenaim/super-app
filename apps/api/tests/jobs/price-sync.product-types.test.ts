import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { MAX_NAMES, typeProducts } from "#/ingest/product-types.ts";
import { createInternalApp } from "#/internal-app.ts";
import { searchProducts } from "#/prices/search.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { fakeClassifier } from "#/providers/openai/fake.ts";
import { fakeGeocoder } from "#/providers/nominatim/fake.ts";
import { fakePricePortal } from "#/providers/price-portals/fake.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { RateLimitError } from "#/services/classifier.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
const STORES = `Stores${OSHER}-000-20261021-080500.xml`;
const stores = new Uint8Array(readFileSync(fileURLToPath(new URL(`../__fixtures__/${STORES}`, import.meta.url))));

type Item = { code: string; name: string; manufacturer?: string; unitQty?: string; weighted?: boolean };
const item = (i: Item) =>
  `<Item><PriceUpdateDate>2026-10-21 05:16</PriceUpdateDate><ItemCode>${i.code}</ItemCode><ItemType>1</ItemType><ItemName>${i.name}</ItemName><ManufacturerName>${i.manufacturer ?? ""}</ManufacturerName><ManufactureCountry>IL</ManufactureCountry><UnitQty>${i.unitQty ?? "יחידה"}</UnitQty><Quantity>1.00</Quantity><UnitOfMeasure>100 גרם</UnitOfMeasure><bIsWeighted>${i.weighted ? 1 : 0}</bIsWeighted><QtyInPackage>0</QtyInPackage><ItemPrice>5.00</ItemPrice><UnitOfMeasurePrice>0.50</UnitOfMeasurePrice><AllowDiscount>1</AllowDiscount><ItemStatus>1</ItemStatus></Item>`;
/** A portal with the Stores fixture and one PriceFull per store number, each listing these items. */
const portal = (byStore: Record<string, Item[]>) =>
  fakePricePortal({
    [STORES]: stores,
    ...Object.fromEntries(
      Object.entries(byStore).map(([store, items]) => [
        `PriceFull${OSHER}-001-${store}-20261021-051600.xml`,
        new TextEncoder().encode(
          `<?xml version="1.0" encoding="utf-8"?><Root><ChainID>${OSHER}</ChainID><SubChainID>001</SubChainID><StoreID>${Number(store)}</StoreID><BikoretNo>6</BikoretNo><Items Count="${items.length}">${items.map(item).join("")}</Items></Root>`,
        ),
      ]),
    ),
  });

// The test codes are not valid GTINs, so every Product is keyed by its Chain, like a Chain-only code.
const sku = (i: Item) => `${OSHER}:${i.code}`;
const MILK: Item = { code: "7290000000001", name: "חלב תנובה 3%", manufacturer: "תנובה", unitQty: "ליטר" };
const TOMATO: Item = { code: "4011", name: "עגבניה", unitQty: "קילוגרם", weighted: true }; // produce: no barcode
const SOAP: Item = { code: "7290000000009", name: "סבון ידיים", manufacturer: "סנו" };

const setup = (byStore: Record<string, Item[]>, deps: Partial<Deps> = {}) =>
  buildDeps(loadConfig(), { pricePortal: portal(byStore), geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })), ...deps });
const run = (deps: Deps, id: number) =>
  deps.db.$client.prepare("SELECT status, products_typed, products_other, type_requests_failed FROM sync_runs WHERE id = ?").get(id);
const priceCount = (deps: Deps) => (deps.db.$client.prepare("SELECT count(*) AS n FROM prices").get() as { n: number }).n;
const names = (deps: Deps) =>
  Object.fromEntries((deps.db.$client.prepare("SELECT code, name FROM products ORDER BY code").all() as { code: string; name: string }[]).map((r) => [r.code, r.name]));
const types = (deps: Deps) =>
  Object.fromEntries(
    (deps.db.$client.prepare("SELECT code, product_type FROM products ORDER BY code").all() as { code: string; product_type: string | null }[]).map(
      (r) => [r.code, r.product_type],
    ),
  );

describe("priceSyncJob: Product types", () => {
  it("the database holds the 15 Product types in display order, Other last", () => {
    const deps = setup({});
    expect(deps.db.$client.prepare("SELECT id FROM product_types ORDER BY position").pluck().all()).toEqual([
      "dairy-eggs", "meat-fish", "produce", "bakery", "drinks", "snacks-sweets", "pantry", "frozen", "canned", "cleaning-home",
      "personal-care", "baby", "pets", "alcohol", "other",
    ]);
  });

  it("gives every untyped Product with a current price a Product type, including Products with no barcode", async () => {
    const classifier = fakeClassifier({ "חלב תנובה 3%": "dairy-eggs", עגבניה: "produce" });
    const deps = setup({ "001": [MILK, TOMATO, SOAP] }, { classifier });
    await priceSyncJob(deps)({});

    expect(types(deps)).toEqual({ [sku(MILK)]: "dairy-eggs", [sku(TOMATO)]: "produce", [sku(SOAP)]: "other" });
    expect(classifier.calls.flat()).toContainEqual({ name: "עגבניה", manufacturer: null, size: "1 kg", soldBy: "weight" });

    // What a User then sees: Home's Product types (no location: every store).
    const app = createApp(deps);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "types@sync.test", password: "password1234", name: "Tal" }),
    });
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const res = await app.request("/api/browse/types", { headers: { cookie } });
    expect(await res.json()).toEqual([{ type: "dairy-eggs", cardCount: 1 }, { type: "produce", cardCount: 1 }, { type: "other", cardCount: 1 }]);
  });

  it("records how many Products got a type, how many became Other, and how many requests failed", async () => {
    const deps = setup({ "001": [MILK, TOMATO, SOAP] }, { classifier: fakeClassifier({ "חלב תנובה 3%": "dairy-eggs" }) });
    const id = await priceSyncJob(deps)({});
    expect(run(deps, id)).toEqual({ status: "finished", products_typed: 3, products_other: 2, type_requests_failed: 0 });
  });

  it("sends each distinct name once and saves the answer on every Product of that name", async () => {
    const a: Item = { code: "111", name: "במבה  אסם " };
    const b: Item = { code: "222", name: "במבה אסם" };
    const classifier = fakeClassifier({ "במבה אסם": "snacks-sweets" });
    const deps = setup({ "001": [a, MILK], "002": [b, MILK] }, { classifier });
    const id = await priceSyncJob(deps)({});

    expect(classifier.calls.flat().map((p) => p.name).sort()).toEqual(["במבה אסם", "חלב תנובה 3%"]);
    expect(types(deps)).toMatchObject({ [sku(a)]: "snacks-sweets", [sku(b)]: "snacks-sweets" });
    expect(run(deps, id)).toMatchObject({ products_typed: 3 });
  });

  it("never sends a typed Product again, and sends it again once its type is cleared", async () => {
    const classifier = fakeClassifier();
    const deps = setup({ "001": [MILK, SOAP] }, { classifier });
    await priceSyncJob(deps)({});
    await priceSyncJob(deps)({});
    expect(classifier.calls).toHaveLength(1);

    deps.db.$client.prepare("UPDATE products SET product_type = NULL WHERE code = ?").run(sku(SOAP));
    await priceSyncJob(deps)({});
    expect(classifier.calls.map((c) => c.map((p) => p.name))).toEqual([["חלב תנובה 3%", "סבון ידיים"], ["סבון ידיים"]]);
  });

  it("never changes a Product type set on the Internal dashboard, and Home shows the Product under it", async () => {
    const classifier = fakeClassifier({ "חלב תנובה 3%": "dairy-eggs" });
    const deps = setup({ "001": [MILK, SOAP] }, { classifier });
    deps.config.SYNC_TOKEN = "test-sync-token";
    await priceSyncJob(deps)({});
    expect(types(deps)[sku(SOAP)]).toBe("other");

    const set = await createInternalApp(deps).request(`/products/${encodeURIComponent(sku(SOAP))}/type`, {
      method: "PUT",
      headers: { Authorization: "Bearer test-sync-token", "content-type": "application/json" },
      body: JSON.stringify({ productType: "cleaning-home" }),
    });
    expect(set.status).toBe(200);
    await priceSyncJob(deps)({});
    await priceSyncJob(deps)({});

    expect(types(deps)).toEqual({ [sku(MILK)]: "dairy-eggs", [sku(SOAP)]: "cleaning-home" });
    expect(classifier.calls).toHaveLength(1);
    const app = createApp(deps);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "set@sync.test", password: "password1234", name: "Tal" }),
    });
    const cookie = signUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const res = await app.request("/api/browse/types", { headers: { cookie } });
    expect(await res.json()).toEqual([{ type: "dairy-eggs", cardCount: 1 }, { type: "cleaning-home", cardCount: 1 }]);
  });

  it("skips Products with no current price", async () => {
    const classifier = fakeClassifier();
    const deps = setup({ "001": [MILK] }, { classifier });
    deps.db.$client.prepare("INSERT INTO products (code, name) VALUES ('old', 'מוצר שירד מהמדף')").run();
    await priceSyncJob(deps)({});

    expect(classifier.calls.flat().map((p) => p.name)).toEqual(["חלב תנובה 3%"]);
    expect(types(deps).old).toBeNull();
  });

  it("an answer outside the fixed list leaves that Product untyped and the rest typed", async () => {
    const deps = setup({ "001": [MILK, SOAP] }, { classifier: fakeClassifier({ "חלב תנובה 3%": null }) });
    const id = await priceSyncJob(deps)({});
    expect(types(deps)).toEqual({ [sku(MILK)]: null, [sku(SOAP)]: "other" });
    expect(run(deps, id)).toMatchObject({ status: "finished", products_typed: 1, type_requests_failed: 0 });
  });

  it("a failing request leaves its Products untyped, fails no Chain and still saves prices; the next sync sends them again", async () => {
    let down = true;
    const classifier = fakeClassifier((p) => {
      if (down) throw new Error("HTTP 503");
      return p.name === MILK.name ? "dairy-eggs" : "other";
    });
    const deps = setup({ "001": [MILK, SOAP] }, { classifier });
    const id = await priceSyncJob(deps)({});

    expect(run(deps, id)).toEqual({ status: "finished", products_typed: 0, products_other: 0, type_requests_failed: 1 });
    expect(deps.db.$client.prepare("SELECT status FROM sync_chain_results WHERE sync_run_id = ? AND chain_id = ?").get(id, OSHER)).toEqual({ status: "ok" });
    expect(priceCount(deps)).toBe(2);
    expect(types(deps)).toEqual({ [sku(MILK)]: null, [sku(SOAP)]: null });

    down = false;
    await priceSyncJob(deps)({});
    expect(types(deps)).toEqual({ [sku(MILK)]: "dairy-eggs", [sku(SOAP)]: "other" });
  });

  it("a rate limit stops the step for this sync: typed Products keep their type, the rest stay untyped for the next", async () => {
    const items = Array.from({ length: 60 }, (_, i): Item => ({ code: String(1000 + i), name: `מוצר ${i}` }));
    let limited = true;
    const classifier = fakeClassifier((p) => {
      if (limited && Number(p.name.split(" ")[1]) >= 25) throw new RateLimitError("llm: HTTP 429");
      return "pantry";
    });
    const errorHandler = fakeErrorHandler();
    const deps = setup({ "001": items }, { classifier, errorHandler });
    const id = await priceSyncJob(deps)({});

    expect(classifier.calls.map((c) => c.length)).toEqual([25, 25]);
    expect(run(deps, id)).toEqual({ status: "finished", products_typed: 25, products_other: 0, type_requests_failed: 1 });
    const typed = Object.values(types(deps));
    expect(typed.filter((t) => t === "pantry")).toHaveLength(25);
    expect(typed.filter((t) => t === null)).toHaveLength(35);
    expect(errorHandler.warnings).toEqual([
      { message: "product types: 1 classifier requests failed", details: { productsTyped: 25, productsOther: 0, typeRequestsFailed: 1, error: "llm: HTTP 429" } },
    ]);

    limited = false;
    await priceSyncJob(deps)({});
    expect(Object.values(types(deps))).not.toContain(null);
  });

  it("stopping the sync mid-request hands the classifier the signal and isn't counted as a failed request", async () => {
    const items = Array.from({ length: 60 }, (_, i): Item => ({ code: String(1000 + i), name: `מוצר ${i}` }));
    const stop = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const fake = fakeClassifier(() => "pantry");
    const classifier = {
      ...fake,
      async classify(products: Parameters<typeof fake.classify>[0], signal?: AbortSignal) {
        signals.push(signal);
        if (signals.length === 2) {
          stop.abort();
          throw signal!.reason;
        }
        return fake.classify(products);
      },
    };
    const errorHandler = fakeErrorHandler();
    const deps = setup({ "001": items }, { classifier, errorHandler });
    const id = await priceSyncJob(deps)({}, stop.signal);

    expect(signals).toEqual([stop.signal, stop.signal]);
    expect(run(deps, id)).toEqual({ status: "interrupted", products_typed: 25, products_other: 0, type_requests_failed: 0 });
    expect(errorHandler.warnings).toEqual([]);
  });

  it("other failed requests don't stop the step, and the warning names the first failure's error", async () => {
    const items = Array.from({ length: 60 }, (_, i): Item => ({ code: String(1000 + i), name: `מוצר ${i}` }));
    const classifier = fakeClassifier((p) => {
      const n = Number(p.name.split(" ")[1]);
      if (n < 25) throw new Error("llm: HTTP 503");
      if (n < 50) throw new Error("llm: HTTP 500");
      return "pantry";
    });
    const errorHandler = fakeErrorHandler();
    const deps = setup({ "001": items }, { classifier, errorHandler });
    await priceSyncJob(deps)({});

    expect(classifier.calls).toHaveLength(3);
    expect(errorHandler.warnings).toEqual([
      { message: "product types: 2 classifier requests failed", details: { productsTyped: 10, productsOther: 0, typeRequestsFailed: 2, error: "llm: HTTP 503" } },
    ]);
  });

  it("classifies in batches of 25", async () => {
    const items = Array.from({ length: 60 }, (_, i): Item => ({ code: String(1000 + i), name: `מוצר ${i}` }));
    const classifier = fakeClassifier();
    await priceSyncJob(setup({ "001": items }, { classifier }))({});
    expect(classifier.calls.map((c) => c.length)).toEqual([25, 25, 10]);
  });

  it(`stops at ${MAX_NAMES} names, and the next sync continues`, async () => {
    const items = Array.from({ length: MAX_NAMES + 1 }, (_, i): Item => ({ code: String(100000 + i), name: `מוצר ${i}` }));
    const deps = setup({ "001": items }, { classifier: fakeClassifier() });
    const first = await priceSyncJob(deps)({});
    expect(run(deps, first)).toMatchObject({ products_typed: MAX_NAMES });
    expect(Object.values(types(deps)).filter((t) => t === null)).toHaveLength(1);

    const second = await priceSyncJob(deps)({});
    expect(run(deps, second)).toMatchObject({ products_typed: 1 });
    expect(Object.values(types(deps))).not.toContain(null);
  }, 30_000);

  it("writes the Product name in full with the type, and search finds the full name; a later ingest keeps it", async () => {
    const cheese: Item = { code: "5001", name: "גב.גאודה חצי קשה28%" };
    const full = "גבינה גאודה חצי קשה 28%";
    const deps = setup({ "001": [cheese] }, { classifier: fakeClassifier({ "גב.גאודה חצי קשה28%": "dairy-eggs" }, { "גב.גאודה חצי קשה28%": full }) });
    await priceSyncJob(deps)({});
    expect(names(deps)).toEqual({ [sku(cheese)]: full });
    expect(searchProducts(deps.db, "גבינה גאודה", 10).filter((r) => r.kind === "product").map((r) => r.name)).toContain(full);

    await priceSyncJob(deps)({});
    expect(names(deps)).toEqual({ [sku(cheese)]: full });
  });

  it("rejects a name whose numbers changed, in content or order: the type is saved, the name stays", async () => {
    const a: Item = { code: "5001", name: "גב.גאודה 28% 200 גרם" };
    const b: Item = { code: "5002", name: "חטיף 3 פס 40 גרם" };
    const c: Item = { code: "5003", name: "קפה 100 גרם" };
    const classifier = fakeClassifier(() => "dairy-eggs", { [a.name]: "גבינה גאודה 20% 200 גרם", [b.name]: "חטיף 40 פס 3 גרם", [c.name]: "קפה נמס 100 גרם" });
    const deps = setup({ "001": [a, b, c] }, { classifier });
    const id = await priceSyncJob(deps)({});
    expect(names(deps)).toEqual({ [sku(a)]: a.name, [sku(b)]: b.name, [sku(c)]: "קפה נמס 100 גרם" });
    expect(types(deps)).toEqual({ [sku(a)]: "dairy-eggs", [sku(b)]: "dairy-eggs", [sku(c)]: "dairy-eggs" });
    expect(run(deps, id)).toMatchObject({ products_typed: 3 });
  });

  it("a rejected type leaves the name unchanged too", async () => {
    const deps = setup({ "001": [MILK] }, { classifier: fakeClassifier(() => null, { [MILK.name]: "חלב טרי תנובה 3%" }) });
    await priceSyncJob(deps)({});
    expect(names(deps)).toEqual({ [sku(MILK)]: MILK.name });
    expect(types(deps)).toEqual({ [sku(MILK)]: null });
  });

  describe("full mode", () => {
    const ABBR: Item = { code: "6001", name: "גב.גאודה 28%" };
    const names2 = { [ABBR.name]: "גבינה גאודה 28%", [SOAP.name]: "סבון ידיים נוזלי", [MILK.name]: "חלב טרי תנובה 3%" };
    /** As if the sync had typed them before names were written out (the catalog this mode cleans). */
    const typedBefore = (deps: Deps) => deps.db.$client.exec("UPDATE products SET name_written = 0");

    it("sends typed Products for their name only and keeps their type; Other and untyped get both", async () => {
      const deps = setup({ "001": [MILK, SOAP, ABBR] }, { classifier: fakeClassifier({ [MILK.name]: "dairy-eggs", [ABBR.name]: null }) });
      await priceSyncJob(deps)({});
      expect(types(deps)).toEqual({ [sku(MILK)]: "dairy-eggs", [sku(SOAP)]: "other", [sku(ABBR)]: null });
      typedBefore(deps);

      const classifier = fakeClassifier((p) => (p.type ? "pets" : p.name === SOAP.name ? "cleaning-home" : "pantry"), names2);
      expect(await typeProducts({ ...deps, classifier }, undefined, { full: true })).toMatchObject({ productsTyped: 2, typeRequestsFailed: 0 });

      expect(classifier.calls.flat().find((p) => p.name === MILK.name)).toMatchObject({ type: "dairy-eggs" });
      expect(classifier.calls.flat().find((p) => p.name === SOAP.name)?.type).toBeUndefined();
      expect(types(deps)).toEqual({ [sku(MILK)]: "dairy-eggs", [sku(SOAP)]: "cleaning-home", [sku(ABBR)]: "pantry" });
      expect(names(deps)).toEqual({ [sku(MILK)]: names2[MILK.name], [sku(SOAP)]: names2[SOAP.name], [sku(ABBR)]: names2[ABBR.name] });
    });

    it("a name shared by a typed and an untyped Product is sent without a type; only the untyped one takes the answer", async () => {
      const a: Item = { code: "6101", name: "גב.גאודה 28%" };
      const b: Item = { code: "6102", name: "גב.גאודה 28%" };
      const deps = setup({ "001": [a, b] }, { classifier: fakeClassifier({ [a.name]: "dairy-eggs" }) });
      await priceSyncJob(deps)({});
      deps.db.$client.prepare("UPDATE products SET product_type = 'pets' WHERE code = ?").run(sku(a));
      deps.db.$client.prepare("UPDATE products SET product_type = NULL WHERE code = ?").run(sku(b));
      typedBefore(deps);

      const classifier = fakeClassifier(() => "pantry", { [a.name]: "גבינה גאודה 28%" });
      expect(await typeProducts({ ...deps, classifier }, undefined, { full: true })).toMatchObject({ productsTyped: 1 });

      expect(classifier.calls.flat()).toHaveLength(1);
      expect(classifier.calls.flat()[0]!.type).toBeUndefined();
      expect(types(deps)).toEqual({ [sku(a)]: "pets", [sku(b)]: "pantry" });
      expect(names(deps)).toEqual({ [sku(a)]: "גבינה גאודה 28%", [sku(b)]: "גבינה גאודה 28%" });
    });

    it("is not capped", async () => {
      const items = Array.from({ length: MAX_NAMES + 1 }, (_, i): Item => ({ code: String(100000 + i), name: `מוצר ${i}` }));
      const deps = setup({ "001": items }, { classifier: fakeClassifier() });
      await priceSyncJob(deps)({});
      typedBefore(deps);
      const classifier = fakeClassifier();
      await typeProducts({ ...deps, classifier }, undefined, { full: true });
      expect(classifier.calls.flat()).toHaveLength(MAX_NAMES + 1);
    }, 60_000);

    it("a rate limit leaves Products as they were", async () => {
      const deps = setup({ "001": [MILK] }, { classifier: fakeClassifier() });
      await priceSyncJob(deps)({});
      typedBefore(deps);
      const classifier = fakeClassifier(() => { throw new RateLimitError("llm: HTTP 429"); });
      expect(await typeProducts({ ...deps, classifier }, undefined, { full: true })).toMatchObject({ productsTyped: 0, typeRequestsFailed: 1 });
      expect(names(deps)).toEqual({ [sku(MILK)]: MILK.name });
    });

    it("running it again carries on: only names with no answer yet, and untyped Products, are sent again", async () => {
      const deps = setup({ "001": [MILK, SOAP, ABBR] }, { classifier: fakeClassifier({ [MILK.name]: "dairy-eggs" }) });
      await priceSyncJob(deps)({});
      typedBefore(deps);
      await typeProducts({ ...deps, classifier: fakeClassifier({ [ABBR.name]: null }, names2) }, undefined, { full: true });
      expect(names(deps)).toEqual({ [sku(MILK)]: names2[MILK.name], [sku(SOAP)]: names2[SOAP.name], [sku(ABBR)]: ABBR.name }); // ABBR's type was rejected

      const again = fakeClassifier({}, names2);
      await typeProducts({ ...deps, classifier: again }, undefined, { full: true });
      expect(again.calls.flat().map((p) => p.name)).toEqual([ABBR.name]);
      expect(names(deps)).toEqual({ [sku(MILK)]: names2[MILK.name], [sku(SOAP)]: names2[SOAP.name], [sku(ABBR)]: names2[ABBR.name] });
    });
  });

  it("has a classifier only with LLM_BASE_URL, LLM_API_KEY and LLM_MODEL all set", () => {
    const llm = { LLM_BASE_URL: "https://llm.test/v1", LLM_API_KEY: "key", LLM_MODEL: "model" };
    expect(buildDeps({ ...loadConfig(), ...llm }).classifier).not.toBeNull();
    for (const unset of Object.keys(llm)) expect(buildDeps({ ...loadConfig(), ...llm, [unset]: undefined }).classifier, unset).toBeNull();
  });

  it("without all three LLM settings skips the step, logs it once and records no counts", async () => {
    const log = vi.spyOn(console, "log");
    const deps = buildDeps({ ...loadConfig(), LLM_API_KEY: "key" }, { pricePortal: portal({ "001": [MILK] }), geocoder: fakeGeocoder(() => ({ lat: 32, lng: 34 })) });
    const id = await priceSyncJob(deps)({});
    const skipped = log.mock.calls.filter(([m]) => String(m).includes("LLM_MODEL"));
    log.mockRestore();

    expect(deps.classifier).toBeNull();
    expect(skipped).toHaveLength(1);
    expect(types(deps)).toEqual({ [sku(MILK)]: null });
    expect(run(deps, id)).toEqual({ status: "finished", products_typed: null, products_other: null, type_requests_failed: null });
  });
});
