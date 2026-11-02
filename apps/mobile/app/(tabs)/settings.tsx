import { useState } from "react";
import { Linking, ScrollView, Switch, View } from "react-native";
import { AccountGroup } from "@/features/account/AccountGroup";
import { useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { track } from "@/lib/analytics";
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
            onValueChange={async (on) => {
              track("tap", { name: "settings.nearby", on });
              setPending(true);
              setDenied(!(await setEnabled(on).finally(() => setPending(false))));
            }}
          />
        </View>
      </Group>
      <Text variant="footnote" color={denied ? "warning" : "labelSecondary"} style={{ paddingHorizontal: space[5], paddingTop: space[3] }}>
        {note}
      </Text>
      {denied && (
        <Button variant="plain" title={t("settings.openSettings")} analyticsName="settings.openSettings" onPress={() => Linking.openSettings()} style={{ alignSelf: "flex-start", minHeight: 44, paddingHorizontal: space[5] }} />
      )}
    </View>
  );
}
