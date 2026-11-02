import { useState } from "react";
import { Alert, Linking, ScrollView, Switch, View } from "react-native";
import { AccountGroup } from "@/features/account/AccountGroup";
import { useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { Taps, trackTap } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Group, LargeTitle, Screen, Text } from "@/ui";

export default function Settings() {
  const { space } = useTheme();
  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[9] }}>
        <LargeTitle title={t("tabs.settings")} />
        <NearbyAlerts />
        <AccountGroup />
      </ScrollView>
    </Screen>
  );
}

function NearbyAlerts() {
  const { colors, space, size } = useTheme();
  const { enabled, setEnabled, supported } = useNearbyAlerts();
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const note = !supported ? t("settings.nearbyExpoGo") : denied ? t("settings.nearbyDenied") : t("settings.nearbyWhy");
  const toggle = async (on: boolean) => {
    setPending(true);
    setDenied(!(await setEnabled(on).finally(() => setPending(false))));
  };
  return (
    <View>
      <Group title={t("settings.alerts")}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: size.row, paddingHorizontal: space[5] }}>
          <Text style={{ flex: 1 }}>{t("settings.nearby")}</Text>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel={t("settings.nearby")}
            accessibilityHint={note}
            value={enabled}
            disabled={!supported || pending}
            trackColor={{ true: colors.tint, false: colors.fillControl }}
            ios_backgroundColor={colors.fillControl}
            onValueChange={(on) => {
              trackTap(Taps.settingsNearby, { on });
              if (!on) return void toggle(false);
              // Google Play's prominent disclosure: shown before, and leading straight into, the background location prompt.
              Alert.alert(t("settings.nearbyDisclosureTitle"), t("settings.nearbyDisclosureBody"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("settings.nearbyDisclosureContinue"), onPress: () => void toggle(true) },
              ]);
            }}
          />
        </View>
      </Group>
      <Text variant="footnote" color={denied ? "warning" : "labelSecondary"} style={{ paddingHorizontal: space[5], paddingTop: space[3] }}>
        {note}
      </Text>
      {denied && (
        <Button variant="plain" title={t("settings.openSettings")} analyticsName={Taps.settingsOpenSettings} onPress={() => Linking.openSettings()} style={{ alignSelf: "flex-start", minHeight: 44, paddingHorizontal: space[5] }} />
      )}
    </View>
  );
}
