import { Camera } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { ScanBarcode } from "lucide-react-native";
import { useCallback, type RefObject } from "react";
import { Keyboard, View, type TextInputInstance } from "react-native";
import { takeScan } from "@/features/items/scan";
import { Events, Taps, track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { SearchField, Tap, Text } from "@/ui";
import { homeScan } from "./search";

type Props = {
  query: string;
  setQuery: (q: string) => void;
  field: RefObject<TextInputInstance | null>;
  setFocused: (focused: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** Whether Cancel shows beside the field. */
  cancellable: boolean;
};

/**
 * The search field Home and Search results share: the field with its scan icon (while empty) and Cancel. Scanning asks for
 * the camera on the first tap (the sheet explains a refusal); a found Product opens its page, a name fills the field.
 */
export function SearchHeader({ query, setQuery, field, setFocused, onSubmit, onCancel, cancellable }: Props) {
  const router = useRouter();
  const { space, colors } = useTheme();
  const scan = async () => {
    Keyboard.dismiss();
    const { granted } = await Camera.requestCameraPermissionsAsync();
    if (!granted) track(Events.itemScanned, { result: "denied", from: "home" });
    router.push({ pathname: "/scan", params: { from: "home" } });
  };
  useFocusEffect(
    useCallback(() => {
      const scanned = takeScan();
      const step = scanned && homeScan(scanned);
      if (step?.go === "push") router.push(step.target);
      else if (step?.go === "fill") setQuery(step.query);
    }, [router, setQuery]),
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], paddingBottom: space[3] }}>
      <SearchField
        ref={field}
        label={t("home.search.placeholder")}
        value={query}
        onChangeText={setQuery}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        containerStyle={{ flex: 1 }}
        trailing={
          !query && (
            <Tap
              accessibilityLabel={t("items.scan")}
              analyticsName={Taps.homeScan}
              onPress={scan}
              hitSlop={8}
              style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
            >
              <ScanBarcode size={22} color={colors.tint} strokeWidth={1.75} />
            </Tap>
          )
        }
      />
      {cancellable && (
        <Tap accessibilityLabel={t("common.cancel")} analyticsName={Taps.homeSearchCancel} onPress={onCancel} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text color="tint">{t("common.cancel")}</Text>
        </Tap>
      )}
    </View>
  );
}
