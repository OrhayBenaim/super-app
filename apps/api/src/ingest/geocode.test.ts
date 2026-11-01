// QA edge cases for the pure parts of geocode.ts (no network).
import { afterEach, describe, expect, it, vi } from "vitest";
import { nominatimUrl, parseNominatim } from "./geocode.js";

const q = (address: string, city: string, name?: string) => {
  const url = nominatimUrl(address, city, name);
  return url === null ? null : decodeURIComponent(new URL(url).searchParams.get("q")!);
};

describe("nominatimUrl", () => {
  it("city present: address + city; an address that already names the city is not repeated", () => {
    expect(q("הרצל 11", "אשדוד", "ignored name")).toBe("הרצל 11, אשדוד, Israel");
    expect(q("הנדיב 71 הרצליה", "הרצליה")).toBe("הנדיב 71 הרצליה, Israel");
  });

  it("city present, no address: the city alone (name is not used when a city exists)", () => {
    expect(q("", "אשדוד", "מחסני להב")).toBe("אשדוד, Israel");
  });

  it("city empty: address + store name; no address -> name; neither -> null (skipped)", () => {
    expect(q("רחוב המפוח 11", "", "יוחננוף מפוח")).toBe("רחוב המפוח 11, יוחננוף מפוח, Israel");
    expect(q("", "", "יוחננוף בילו")).toBe("יוחננוף בילו, Israel");
    expect(q("", "")).toBeNull();
    expect(q("", "", "")).toBeNull();
    expect(nominatimUrl("", "")).toBeNull();
  });

  it("a CBS code that stayed numeric counts as no city, for any digit string (incl. '0' and '00')", () => {
    for (const code of ["0", "00", "874", "99999"]) expect(q("האומן 5", code, "תלפיות"), code).toBe("האומן 5, תלפיות, Israel");
    expect(q("", "874", "מגדל העמק")).toBe("מגדל העמק, Israel");
    expect(q("", "874")).toBeNull();
  });

  it("a city that merely contains digits is a name, not a code", () => {
    expect(q("הרצל 1", "קריית 4")).toBe("הרצל 1, קריית 4, Israel");
  });

  it("cleans the comma in 'האומן,15' only when a digit follows, keeping ', ' separators", () => {
    expect(q("האומן,15", "ירושלים")).toBe("האומן 15, ירושלים, Israel");
    expect(q("רחוב א,12 ,ב", "חיפה")).toBe("רחוב א 12 ,ב, חיפה, Israel");
    expect(q("אזור התעשיה, 11", "חיפה")).toBe("אזור התעשיה, 11, חיפה, Israel");
    expect(q("1,2,3", "חיפה")).toBe("1 2 3, חיפה, Israel");
  });

  it("encodes the query once: '&', '#', '%' and quotes cannot break out of q", () => {
    const url = nominatimUrl('רמב"ם 24 & Co #5 100%', "חיפה")!;
    expect(new URL(url).searchParams.getAll("q")).toHaveLength(1);
    expect(new URL(url).searchParams.get("q")).toBe('רמב"ם 24 & Co #5 100%, חיפה, Israel');
    expect(url).toContain("format=json&limit=1&q=");
  });

  it("a short city is not mistaken for part of the address by accident of substring (documented limit)", () => {
    // street.includes(town) is a plain substring test: city "יפו" inside "רחוב יפו 5" drops the city, which is what the cleanup intends.
    expect(q("רחוב יפו 5", "יפו")).toBe("רחוב יפו 5, Israel");
  });
});

describe("nominatimUrl base URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses NOMINATIM_URL and drops a trailing slash; defaults to openstreetmap.org", async () => {
    expect(nominatimUrl("a", "b")).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
    vi.stubEnv("NOMINATIM_URL", "http://localhost:8080/");
    vi.resetModules();
    const m = await import("./geocode.js");
    expect(m.nominatimUrl("a", "b")).toMatch(/^http:\/\/localhost:8080\/search\?format=json/);
  });
});

describe("parseNominatim", () => {
  it("parses string coordinates from the first hit only", () => {
    expect(parseNominatim([{ lat: "31.8044", lon: "34.6553" }, { lat: "1", lon: "2" }])).toEqual({ lat: 31.8044, lng: 34.6553 });
    expect(parseNominatim([{ lat: 31.8, lon: 34.6 }])).toEqual({ lat: 31.8, lng: 34.6 });
    expect(parseNominatim([{ lat: "-33.9", lon: "-0.5" }])).toEqual({ lat: -33.9, lng: -0.5 });
  });

  it("keeps a legitimate 0 coordinate", () => {
    expect(parseNominatim([{ lat: "0", lon: "34.6" }])).toEqual({ lat: 0, lng: 34.6 });
  });

  it("null for an empty array, a missing lat or lon, non-numeric, null or empty values, and non-array payloads", () => {
    for (const bad of [[], [{ lon: "34.6" }], [{ lat: "31.8" }], [{ lat: "x", lon: "y" }], [{ lat: null, lon: "34.6" }], [{ lat: "31.8", lon: "" }], [{ lat: "", lon: "" }], [{ lat: "NaN", lon: "1" }], [{ lat: "Infinity", lon: "1" }], [null], [{}], null, undefined, {}, "x", 5, { lat: "1", lon: "2" }])
      expect(parseNominatim(bad), JSON.stringify(bad)).toBeNull();
  });
});
