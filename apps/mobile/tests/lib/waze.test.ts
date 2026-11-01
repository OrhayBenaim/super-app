import { beforeEach, expect, it, vi } from "vitest";

const rn = vi.hoisted(() => ({ Platform: { OS: "ios" }, Linking: { canOpenURL: vi.fn(), openURL: vi.fn() } }));
vi.mock("react-native", () => rn);

import { openWaze, wazeUrls } from "@/lib/waze";

beforeEach(() => {
  vi.clearAllMocks();
  rn.Platform.OS = "ios";
});

it("builds app and universal links", () => {
  expect(wazeUrls(32.08, 34.78)).toEqual({
    app: "waze://?ll=32.08,34.78&navigate=yes",
    web: "https://waze.com/ul?ll=32.08,34.78&navigate=yes",
  });
});

it("opens the app scheme when Waze is installed (iOS)", async () => {
  rn.Linking.canOpenURL.mockResolvedValue(true);
  await openWaze(1, 2);
  expect(rn.Linking.openURL).toHaveBeenCalledWith("waze://?ll=1,2&navigate=yes");
});

it("falls back to the web link when Waze is missing or canOpenURL throws", async () => {
  rn.Linking.canOpenURL.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("no"));
  await openWaze(1, 2);
  await openWaze(1, 2);
  expect(rn.Linking.openURL).toHaveBeenNthCalledWith(1, "https://waze.com/ul?ll=1,2&navigate=yes");
  expect(rn.Linking.openURL).toHaveBeenNthCalledWith(2, "https://waze.com/ul?ll=1,2&navigate=yes");
});

it("uses the web link on Android without probing", async () => {
  rn.Platform.OS = "android";
  await openWaze(1, 2);
  expect(rn.Linking.canOpenURL).not.toHaveBeenCalled();
  expect(rn.Linking.openURL).toHaveBeenCalledWith("https://waze.com/ul?ll=1,2&navigate=yes");
});
