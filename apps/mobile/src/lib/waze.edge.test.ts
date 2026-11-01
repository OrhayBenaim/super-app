import { beforeEach, describe, expect, it, vi } from "vitest";

const rn = vi.hoisted(() => ({ Platform: { OS: "ios" }, Linking: { canOpenURL: vi.fn(), openURL: vi.fn() } }));
vi.mock("react-native", () => rn);

import { openWaze, wazeUrls } from "./waze";

beforeEach(() => {
  vi.resetAllMocks();
  rn.Platform.OS = "ios";
  rn.Linking.openURL.mockResolvedValue(true);
});

describe("wazeUrls", () => {
  it("keeps full float precision and never inserts spaces", () => {
    const { app, web } = wazeUrls(32.0853123456789, 34.7818123456789);
    expect(app).toBe("waze://?ll=32.0853123456789,34.7818123456789&navigate=yes");
    expect(web).toBe("https://waze.com/ul?ll=32.0853123456789,34.7818123456789&navigate=yes");
    expect(app + web).not.toMatch(/\s/);
  });
  it("negative and zero coordinates", () => {
    expect(wazeUrls(-33.8688, 0).web).toBe("https://waze.com/ul?ll=-33.8688,0&navigate=yes");
    expect(wazeUrls(0, -0.5).app).toBe("waze://?ll=0,-0.5&navigate=yes");
  });
  it("both URLs carry navigate=yes and a single ll param with a comma separator", () => {
    for (const u of Object.values(wazeUrls(1.5, 2.5))) {
      const q = new URL(u.replace("waze://", "https://x/")).searchParams;
      expect(q.get("navigate")).toBe("yes");
      expect(q.get("ll")).toBe("1.5,2.5");
    }
  });
});

describe("openWaze", () => {
  it("iOS + canOpenURL true opens waze:// exactly once, probing the app scheme", async () => {
    rn.Linking.canOpenURL.mockResolvedValue(true);
    await openWaze(32.1, 34.2);
    expect(rn.Linking.canOpenURL).toHaveBeenCalledWith("waze://?ll=32.1,34.2&navigate=yes");
    expect(rn.Linking.openURL).toHaveBeenCalledTimes(1);
    expect(rn.Linking.openURL).toHaveBeenCalledWith("waze://?ll=32.1,34.2&navigate=yes");
  });
  it("iOS + canOpenURL false falls back to https", async () => {
    rn.Linking.canOpenURL.mockResolvedValue(false);
    await openWaze(32.1, 34.2);
    expect(rn.Linking.openURL).toHaveBeenCalledTimes(1);
    expect(rn.Linking.openURL).toHaveBeenCalledWith("https://waze.com/ul?ll=32.1,34.2&navigate=yes");
  });
  it("iOS + canOpenURL rejecting falls back to https", async () => {
    rn.Linking.canOpenURL.mockRejectedValue(new Error("boom"));
    await openWaze(1, 2);
    expect(rn.Linking.openURL).toHaveBeenCalledWith("https://waze.com/ul?ll=1,2&navigate=yes");
  });
  it("Android goes straight to https and never probes (even if canOpenURL would be true)", async () => {
    rn.Platform.OS = "android";
    rn.Linking.canOpenURL.mockResolvedValue(true);
    await openWaze(1, 2);
    expect(rn.Linking.canOpenURL).not.toHaveBeenCalled();
    expect(rn.Linking.openURL).toHaveBeenCalledTimes(1);
    expect(rn.Linking.openURL).toHaveBeenCalledWith("https://waze.com/ul?ll=1,2&navigate=yes");
  });
  it("other platforms (web) use https", async () => {
    rn.Platform.OS = "web";
    await openWaze(1, 2);
    expect(rn.Linking.openURL).toHaveBeenCalledWith("https://waze.com/ul?ll=1,2&navigate=yes");
  });
  it("propagates an https openURL failure to the caller", async () => {
    rn.Platform.OS = "android";
    rn.Linking.openURL.mockRejectedValue(new Error("no handler"));
    await expect(openWaze(1, 2)).rejects.toThrow("no handler");
  });
  it("BUG waze.ts:13 if openURL(waze://) throws on iOS (canOpenURL true but app removed/blocked) the error propagates and the tap does nothing; fix: `try { await Linking.openURL(useApp ? app : web) } catch (e) { if (!useApp) throw e; await Linking.openURL(web) }`", async () => {
    rn.Linking.canOpenURL.mockResolvedValue(true);
    rn.Linking.openURL.mockRejectedValueOnce(new Error("scheme fail")).mockResolvedValueOnce(true);
    await openWaze(1, 2);
    expect(rn.Linking.openURL).toHaveBeenLastCalledWith("https://waze.com/ul?ll=1,2&navigate=yes");
  });
});
