import { MapPin } from "lucide-react-native";
import { View } from "react-native";
import { useRadius } from "@/features/compare/api";
import { Taps } from "@/lib/analytics";
import { useLocation } from "@/lib/location";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Text } from "@/ui";

/**
 * Where browse looks: Compare's radius around the User. `known` once the location is found or off (denied, failed);
 * without one, browse shows everything unpriced under the banner.
 */
export function useBrowseLocation() {
  const location = useLocation();
  const radiusKm = useRadius((s) => s.km);
  const off = location.status === "denied" || location.status === "error";
  return { location, radiusKm, coords: location.coords, off, known: off || location.status === "ready" };
}

type Location = ReturnType<typeof useLocation>;

/** "Location is off": everything is shown without prices; the button asks again, opens Settings, or retries. */
export function LocationBanner({ location }: { location: Location }) {
  const { colors, space, radius, size } = useTheme();
  const button =
    location.status === "denied"
      ? location.canAskAgain
        ? { title: t("compare.location.allow"), analyticsName: Taps.homeLocationAllow }
        : { title: t("compare.location.settings"), analyticsName: Taps.homeLocationSettings }
      : { title: t("compare.retry"), analyticsName: Taps.homeLocationRetry };
  return (
    <View style={{ flexDirection: "row", gap: space[4], backgroundColor: colors.surface, borderRadius: radius.group, paddingHorizontal: space[5], paddingVertical: space[4], marginBottom: space[4] }}>
      <MapPin size={24} color={colors.labelSecondary} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: space[1], alignItems: "flex-start" }}>
        <Text variant="headline">{t("home.location.title")}</Text>
        <Text variant="footnote" color="labelSecondary">
          {t("home.location.body")}
        </Text>
        <Button
          {...button}
          onPress={location.status === "denied" ? location.request : location.refresh}
          style={{ marginTop: space[3], minHeight: size.target, minWidth: 150 }}
        />
      </View>
    </View>
  );
}
