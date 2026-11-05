import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { prices, products, stores } from "#/db/appSchema.ts";
import { buildDeps, type Deps } from "#/deps.ts";
import { createInternalApp } from "#/internal-app.ts";
import { loadConfig } from "#/services/config.ts";

const TOKEN = "test-sync-token";
const RAMI = "7290058140886";
const OSHER = "7290103152017";
const BULGUR = encodeURIComponent("בורגול");

const setup = () => buildDeps(loadConfig({ ...process.env, SYNC_TOKEN: TOKEN }));
const get = (deps: Deps, path: string, auth = `Bearer ${TOKEN}`) => createInternalApp(deps).request(path, { headers: { Authorization: auth } });

/** Bulgur in 500 g and 1 kg packs, fine and coarse, at two stores; a bulgur dish that is not in the group; an unpriced one. */
function seed(deps: Deps) {
  const store = (chainId: string, name: string) => ({ id: `${chainId}-1`, chainId, storeId: "1", subChainId: "1", name, address: "רחוב 1", city: "תל אביב" });
  deps.db.insert(stores).values([store(RAMI, "רמי לוי תלפיות"), store(OSHER, "אושר עד גבעת שאול")]).run();
  deps.db
    .insert(products)
    .values([
      { code: "7290000000011", name: "בורגול דק סוגת", unitQty: "500 גרם" },
      { code: "7290000000028", name: "בורגול דק מיה", unitQty: "500 גרם" },
      { code: "7290000000035", name: "בורגול עבה סוגת", unitQty: "1 קילוגרם" },
      { code: "7290000000042", name: "בורגול עבה מיה", unitQty: "1 קילוגרם" },
      { code: "7290000000059", name: "בורגול עם גרגירי חומוס", unitQty: "400 גרם" },
      { code: "7290000000066", name: "בורגול דק לא נמכר", unitQty: "500 גרם" },
    ])
    .run();
  deps.db
    .insert(prices)
    .values([
      { storeId: `${OSHER}-1`, code: "7290000000011", price: 3.7 },
      { storeId: `${RAMI}-1`, code: "7290000000011", price: 3.5 },
      { storeId: `${OSHER}-1`, code: "7290000000028", price: 3.9 },
      { storeId: `${OSHER}-1`, code: "7290000000035", price: 6.8 },
      { storeId: `${RAMI}-1`, code: "7290000000042", price: 7.2 },
      { storeId: `${OSHER}-1`, code: "7290000000059", price: 12 },
    ])
    .run();
}

type Group = { ref: string; members: { code: string }[] } & Record<string, unknown>;

describe("GET /groups (private)", () => {
  it("returns the group the words name: its measure, commonest pack, refinements and members, cheapest per kilo first", async () => {
    const deps = setup();
    seed(deps);
    const res = await get(deps, `/groups?q=${BULGUR}`);
    expect(res.status).toBe(200);
    const { groups } = (await res.json()) as { groups: Group[] };
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      ref: "בורגול|kg", name: "בורגול", measure: "kg", soldBy: "unit", size: 0.5, minPrice: 6.8, productCount: 4, storeCount: 2,
      refinements: expect.arrayContaining(["דק", "עבה"]),
    });
    // Per kilo: 6.80, 7.00 (3.50 for 500 g), 7.20, 7.80; the dish and the unpriced product are not members.
    expect(groups[0]!.members).toEqual([
      { code: "7290000000035", name: "בורגול עבה סוגת", measure: "kg", size: 1, soldBy: "unit", minPrice: 6.8, storeCount: 1 },
      { code: "7290000000011", name: "בורגול דק סוגת", measure: "kg", size: 0.5, soldBy: "unit", minPrice: 3.5, storeCount: 2 },
      { code: "7290000000042", name: "בורגול עבה מיה", measure: "kg", size: 1, soldBy: "unit", minPrice: 7.2, storeCount: 1 },
      { code: "7290000000028", name: "בורגול דק מיה", measure: "kg", size: 0.5, soldBy: "unit", minPrice: 3.9, storeCount: 1 },
    ]);
  });

  it("matches the groups the app's search returns for the same words", async () => {
    const deps = setup();
    seed(deps);
    const { groups } = (await (await get(deps, `/groups?q=${BULGUR}`)).json()) as { groups: Group[] };

    const app = createApp(deps);
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", password: "password1234", name: "A" }),
    });
    const cookie = signUp.headers.getSetCookie().map((h) => h.split(";")[0]).join("; ");
    const pub = (await (await app.request(`/api/products/search?q=${BULGUR}`, { headers: { cookie } })).json()) as { kind: string }[];
    const pubGroups = pub.filter((r) => r.kind === "group").map(({ kind: _, ...g }) => g);
    expect(pubGroups).toHaveLength(1);
    expect(groups.map(({ members: _, ...g }) => g)).toEqual(pubGroups);
  });

  it("narrows to a refinement, and finds no group for words nothing starts with", async () => {
    const deps = setup();
    seed(deps);
    const fine = (await (await get(deps, `/groups?q=${encodeURIComponent("בורגול דק")}`)).json()) as { groups: Group[] };
    expect(fine.groups.map((g) => g.ref)).toEqual(["בורגול דק|kg"]);
    expect(fine.groups[0]!.members.map((m) => m.code)).toEqual(["7290000000011", "7290000000028"]);
    expect(await (await get(deps, `/groups?q=${encodeURIComponent("חומוס")}`)).json()).toEqual({ groups: [] });
  });

  it("400 for missing, too short or too long words", async () => {
    const deps = setup();
    for (const q of ["", "?q=a", `?q=${"א".repeat(101)}`]) expect((await get(deps, `/groups${q}`)).status).toBe(400);
  });

  it("401 without the token or with a wrong one", async () => {
    const deps = setup();
    expect((await createInternalApp(deps).request(`/groups?q=${BULGUR}`)).status).toBe(401);
    expect((await get(deps, `/groups?q=${BULGUR}`, "Bearer wrong")).status).toBe(401);
  });
});
