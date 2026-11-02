import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { ingestPrices, ingestStores } from "#/ingest/ingest.ts";
import { loadConfig } from "#/services/config.ts";

const OSHER = "7290103152017";
let app: ReturnType<typeof createApp>;
let cookie: string;
let listId: string;

const storesXml = `<Root><ChainId>${OSHER}</ChainId><Stores>${["1", "2"]
  .map((id) => `<Store><StoreId>${id}</StoreId><StoreName>s${id}</StoreName><Address>a</Address><City>c</City></Store>`)
  .join("")}</Stores></Root>`;
const pricesXml = (store: string, items: [code: string, name: string][]) =>
  `<Root><ChainId>${OSHER}</ChainId><StoreId>${store}</StoreId><Items>${items
    .map(([c, n]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>5</ItemPrice></Item>`)
    .join("")}</Items></Root>`;

// Two "בננה" products: 1556 is priced at both stores, 1557 at one. "חלבה" is the top search hit for "חלב".
beforeAll(async () => {
  const deps = buildDeps(loadConfig());
  app = createApp(deps);
  ingestStores(deps, "osher-ad", storesXml);
  ingestPrices(deps, "osher-ad", pricesXml("1", [["1556", "בננה"], ["1557", "בננה"], ["1558", "חלבה"]]));
  ingestPrices(deps, "osher-ad", pricesXml("2", [["1556", "בננה"], ["1558", "חלבה"]]));
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "rina@autolink.test", password: "password1234", name: "Rina" }),
  });
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  listId = (await (await app.request("/api/lists", { headers: { cookie } })).json())[0].id;
});

const add = async (body: object) =>
  (await app.request(`/api/lists/${listId}/items`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ category: "Other", ...body }) })).json();

describe("POST /api/lists/:id/items auto-links a product", () => {
  it("links an exact name to the product the most stores price", async () => {
    expect(await add({ name: "בננה" })).toMatchObject({ productCode: `${OSHER}:1556` });
  });

  it("leaves a partial name unlinked rather than guess", async () => {
    expect(await add({ name: "חלב" })).toMatchObject({ productCode: null });
  });

  it("keeps an explicit productCode, including null", async () => {
    expect(await add({ name: "בננה", productCode: null })).toMatchObject({ productCode: null });
    expect(await add({ name: "בננה", productCode: `${OSHER}:1557` })).toMatchObject({ productCode: `${OSHER}:1557` });
  });

  it("treats quotes and FTS syntax in the name as text", async () => {
    for (const name of ['קוטג"ה 5%', "a OR b", "*", "NEAR(x y)"]) expect(await add({ name })).toMatchObject({ productCode: null });
  });
});
