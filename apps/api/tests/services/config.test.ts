import { describe, expect, it } from "vitest";
import { loadConfig as load } from "#/services/config.ts";

const loadConfig = (env: Record<string, string | undefined>) => load({ RESEND_API_KEY: "re_test", ...env });

describe("loadConfig", () => {
  it("applies defaults for an empty env", () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 3000,
      DATABASE_URL: "./data/grocer.db",
      TRUSTED_ORIGINS: [],
      APPLE_APP_BUNDLE_IDENTIFIER: "com.ottersprod.grocer",
      NOMINATIM_URL: "https://nominatim.openstreetmap.org",
    });
  });

  it("treats empty strings as unset", () => {
    const c = loadConfig({ PORT: "", DATABASE_URL: "", GOOGLE_CLIENT_ID: "", NOMINATIM_URL: "", BETTER_AUTH_URL: "" });
    expect(c.PORT).toBe(3000);
    expect(c.DATABASE_URL).toBe("./data/grocer.db");
    expect(c.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(c.NOMINATIM_URL).toBe("https://nominatim.openstreetmap.org");
    expect(c.BETTER_AUTH_URL).toBeUndefined();
  });

  it("reads TRUST_PROXY as a boolean, off by default", () => {
    expect(loadConfig({}).TRUST_PROXY).toBe(false);
    expect(loadConfig({ TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadConfig({ TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
  });

  it("splits and trims TRUSTED_ORIGINS, dropping blanks", () => {
    expect(loadConfig({ TRUSTED_ORIGINS: " http://a.test , http://b.test,, " }).TRUSTED_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("splits SYNC_TIMES into HH:MM times and rejects anything else", () => {
    expect(loadConfig({}).SYNC_TIMES).toEqual(["05:00", "12:00", "23:30"]);
    expect(loadConfig({ SYNC_TIMES: " 06:15, 00:00 " }).SYNC_TIMES).toEqual(["06:15", "00:00"]);
    for (const bad of ["5:00", "24:00", "12:60", ","]) expect(() => loadConfig({ SYNC_TIMES: bad })).toThrow();
  });

  it("coerces PORT to a number", () => {
    expect(loadConfig({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("throws on an invalid PORT", () => {
    for (const PORT of ["abc", "0", "70000", "3.5"]) expect(() => loadConfig({ PORT }), PORT).toThrow();
  });

  it("requires RESEND_API_KEY", () => {
    expect(() => load({})).toThrow();
    expect(() => load({ RESEND_API_KEY: "" })).toThrow();
  });

  it("defaults EMAIL_FROM to the placeholder sender", () => {
    expect(loadConfig({}).EMAIL_FROM).toBe("Grocer <no-reply@example.com>");
    expect(loadConfig({ EMAIL_FROM: "Me <me@test.dev>" }).EMAIL_FROM).toBe("Me <me@test.dev>");
  });
});
