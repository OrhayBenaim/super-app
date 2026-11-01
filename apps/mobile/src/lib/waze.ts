import { Linking, Platform } from "react-native";

export const wazeUrls = (lat: number, lng: number) => ({
  app: `waze://?ll=${lat},${lng}&navigate=yes`,
  web: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
});

/** Opens Waze navigation; the universal link opens the app when installed, else the web page. */
export async function openWaze(lat: number, lng: number) {
  const { app, web } = wazeUrls(lat, lng);
  // Android 11+ canOpenURL needs a <queries> manifest entry we don't ship; the https link opens the app there anyway.
  const useApp = Platform.OS === "ios" && (await Linking.canOpenURL(app).catch(() => false));
  try {
    await Linking.openURL(useApp ? app : web);
  } catch (e) {
    if (!useApp) throw e;
    await Linking.openURL(web); // canOpenURL said yes but the scheme failed (app removed or blocked)
  }
}
