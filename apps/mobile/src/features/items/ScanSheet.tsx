import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, AppState, Linking, View, type TextStyle, type ViewStyle } from "react-native";
import { useList } from "@/features/lists/api";
import { Events, Taps, track } from "@/lib/analytics";
import { useDelayed, useMinDuration } from "@/lib/loaderTiming";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, SEARCH_MS, SearchLoader, Sheet, SheetHeader, Text } from "@/ui";
import { handScan, resolveScan } from "./scan";

/** Retail product Barcodes only, so QR codes on shelf labels and packs are never read. */
const BARCODES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e"];
// A lookup slower than this shows the searching mascot; a faster one shows its result at once.
const SLOW_LOOKUP_MS = 400;
const CAMERA_HEIGHT = 300;
const centered: TextStyle = { textAlign: "center" };

/**
 * The scan sheet route: a live camera that reads one Barcode per opening. A found Product or Item goes back to the add
 * box that opened it (params `from`, `listId`); an unknown Barcode keeps the sheet open and reads again.
 */
export function ScanSheet() {
  const { colors, radius, space } = useTheme();
  const router = useRouter();
  const { from, listId } = useLocalSearchParams<{ from: "list" | "items"; listId?: string }>();
  const items = useList(listId || null, { poll: false }).data?.items ?? [];
  const [permission, , getPermission] = useCameraPermissions();
  // The hook reads the permission once, so read it again when the User comes back from Settings.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => state === "active" && getPermission());
    return () => sub.remove();
  }, [getPermission]);
  const [lookingUp, setLookingUp] = useState(false);
  const [unknown, setUnknown] = useState(false);
  // The camera fires many events per second, faster than state updates, so the one-read lock is a ref.
  const reading = useRef(true);
  // An unknown pack stays in front of the camera; only a different Barcode is read again.
  const lastUnknown = useRef<string | null>(null);
  // Once shown, the mascot plays one full cycle, so a lookup's result waits here until it is done.
  const searching = useMinDuration(useDelayed(lookingUp, SLOW_LOOKUP_MS), SEARCH_MS);
  const [showResult, setShowResult] = useState<() => void>();
  useEffect(() => {
    if (searching || !showResult) return;
    setShowResult(undefined);
    showResult();
  }, [searching, showResult]);

  const read = ({ data }: BarcodeScanningResult) => {
    if (!reading.current || data === lastUnknown.current) return;
    reading.current = false;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUnknown(false);
    setLookingUp(true);
    // Ends the lookup and queues `show`, which runs once the mascot (if it showed) has finished its cycle.
    const finishLookup = (show: () => void) => {
      setLookingUp(false);
      setShowResult(() => show);
    };
    resolveScan(data, items).then(
      (outcome) =>
        finishLookup(() => {
          track(Events.itemScanned, { result: outcome.kind === "returned" ? "added" : outcome.kind, from });
          if (outcome.kind !== "unknown") {
            handScan(outcome);
            router.back();
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          AccessibilityInfo.announceForAccessibility(`${t("items.scan.unknown.title")}. ${t("items.scan.unknown.body")}`);
          lastUnknown.current = data;
          setUnknown(true);
          reading.current = true;
        }),
      () =>
        finishLookup(() => {
          router.back();
          Alert.alert(t("common.error"));
        }),
    );
  };

  const card: ViewStyle = { borderRadius: radius.group, overflow: "hidden", backgroundColor: colors.surface };
  const denied = permission && !permission.granted;

  return (
    <Sheet>
      <SheetHeader title={t("items.scan")} start={{ title: t("common.cancel"), analyticsName: Taps.commonCancel, onPress: () => router.back() }} />
      {denied ? (
        <>
          <View style={[card, { minHeight: CAMERA_HEIGHT, alignItems: "center", justifyContent: "center", gap: space[3], padding: space[5] }]}>
            <CameraOff size={40} color={colors.labelSecondary} strokeWidth={1.75} />
            <Text variant="title3" accessibilityRole="header" style={centered}>
              {t("items.scan.denied.title")}
            </Text>
            <Text variant="subhead" color="labelSecondary" style={[centered, { paddingHorizontal: space[8] }]}>
              {t("items.scan.denied.body")}
            </Text>
          </View>
          <Button title={t("settings.openSettings")} analyticsName={Taps.itemsScanOpenSettings} onPress={() => Linking.openSettings()} />
        </>
      ) : (
        <>
          {searching ? (
            // No card behind the mascot: it stands on the sheet itself.
            <View style={{ height: CAMERA_HEIGHT, justifyContent: "center" }}>
              <SearchLoader label={t("items.scan.searching")} />
            </View>
          ) : (
            <View style={[card, { height: CAMERA_HEIGHT }]}>
              {permission?.granted && (
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: BARCODES }}
                  onBarcodeScanned={lookingUp ? undefined : read}
                  accessibilityLabel={t("items.scan.hint")}
                />
              )}
              <Brackets />
            </View>
          )}
          <View accessibilityLiveRegion="polite" style={{ minHeight: space[11], justifyContent: "center", gap: space[1] }}>
            {unknown ? (
              <>
                <Text variant="headline" style={centered}>{t("items.scan.unknown.title")}</Text>
                <Text variant="subhead" color="labelSecondary" style={centered}>{t("items.scan.unknown.body")}</Text>
              </>
            ) : (
              <Text variant="subhead" color="labelSecondary" style={centered}>{searching ? "" : t("items.scan.hint")}</Text>
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}

/** Four L-shaped corners framing a 250×130 window in the middle of the camera. */
function Brackets() {
  const { colors } = useTheme();
  const corner = (v: "top" | "bottom", h: "start" | "end"): ViewStyle => ({
    position: "absolute", [v]: 0, [h]: 0, width: 24, height: 24, borderColor: colors.tintOn,
    [v === "top" ? "borderTopWidth" : "borderBottomWidth"]: 3,
    [h === "start" ? "borderStartWidth" : "borderEndWidth"]: 3,
  });
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 250, height: 130 }}>
        <View style={corner("top", "start")} />
        <View style={corner("top", "end")} />
        <View style={corner("bottom", "start")} />
        <View style={corner("bottom", "end")} />
      </View>
    </View>
  );
}
