import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "#/app.ts";
import { buildDeps } from "#/deps.ts";
import { loadConfig } from "#/services/config.ts";

const app = createApp(buildDeps(loadConfig()));

async function signUp(email: string, name: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "password1234", name }),
  });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

function call(cookie: string, method: string, path: string, body?: unknown) {
  return app.request(`/api/lists${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const deleteUser = (cookie?: string) =>
  app.request("/api/auth/delete-user", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: "{}",
  });

describe("delete account", () => {
  it("401 without a session", async () => {
    expect((await deleteUser()).status).toBe(401);
  });

  it("removes the user, their session and their membership of shared lists; others keep their data", async () => {
    const a = await signUp("a@delete.test", "A");
    const b = await signUp("b@delete.test", "B");
    const aList = (await (await call(a, "GET", "")).json())[0].id;
    const bList = (await (await call(b, "GET", "")).json())[0].id;
    const aId = (await (await call(a, "GET", `/${aList}`)).json()).members[0].userId;

    const aCode = (await (await call(a, "POST", `/${aList}/invite`)).json()).code;
    const bCode = (await (await call(b, "POST", `/${bList}/invite`)).json()).code;
    expect((await call(b, "POST", "/join", { code: aCode })).status).toBe(200);
    expect((await call(a, "POST", "/join", { code: bCode })).status).toBe(200);
    expect((await call(b, "POST", `/${bList}/items`, { id: randomUUID(), name: "Milk", category: "dairy" })).status).toBeLessThan(300);

    expect((await deleteUser(a)).status).toBe(200);

    const bLists: { id: string }[] = await (await call(b, "GET", "")).json();
    expect(bLists.map((l) => l.id)).not.toContain(aList);

    const res = await call(b, "GET", `/${bList}`);
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(JSON.stringify(detail)).toContain("Milk");
    expect(detail.members.map((m: { userId: string }) => m.userId)).not.toContain(aId);
    expect(JSON.stringify(detail.members)).not.toContain("a@delete.test");

    expect((await call(a, "GET", "")).status).toBe(401);
  });
});
