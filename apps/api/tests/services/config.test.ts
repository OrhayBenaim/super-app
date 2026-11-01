import { describe, expect, it } from "vitest";
import { loadConfig } from "#/services/config.ts";

describe("loadConfig", () => {
  it("applies defaults for an empty env", () => {
    expect(loadConfig({})).toMatchObject({
      PORT: 3000,
      DATABASE_URL: "./data/grocer.db",
      TRUSTED_ORIGINS: [],
      APPLE_APP_BUNDLE_IDENTIFIER: "com.grocer.app",
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

  it("splits and trims TRUSTED_ORIGINS, dropping blanks", () => {
    expect(loadConfig({ TRUSTED_ORIGINS: " http://a.test , http://b.test,, " }).TRUSTED_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
  });

  it("coerces PORT to a number", () => {
    expect(loadConfig({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("throws on an invalid PORT", () => {
    for (const PORT of ["abc", "0", "70000", "3.5"]) expect(() => loadConfig({ PORT }), PORT).toThrow();
  });
});
