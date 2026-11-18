// Android implies a required android.hardware.wifi from NetInfo's ACCESS_WIFI_STATE and a required
// android.hardware.screen.portrait from the portrait lock; Play then hides the app from devices without them.
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL = ["android.hardware.wifi", "android.hardware.screen.portrait"];

module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-feature"] = [
      ...(manifest["uses-feature"] ?? []).filter((f) => !OPTIONAL.includes(f.$["android:name"])),
      ...OPTIONAL.map((name) => ({ $: { "android:name": name, "android:required": "false" } })),
    ];
    return config;
  });
