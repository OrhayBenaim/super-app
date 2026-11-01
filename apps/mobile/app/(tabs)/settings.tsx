import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { Switch, View } from "react-native";
import { useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Screen, Text } from "@/ui";

export default function Settings() {
  const { space } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Screen edges={[]} style={{ paddingVertical: space[6], gap: space[8] }}>
      <NearbyAlerts />
      <Button
        variant="secondary"
        icon={LogOut}
        title={t("settings.signOut")}
        loading={busy}
        // The root Stack.Protected swaps back to (auth) once the session clears.
        onPress={async () => {
          setBusy(true);
          await authClient.signOut().finally(() => setBusy(false));
        }}
      />
    </Screen>
  );
}

function NearbyAlerts() {
  const { colors, radius, space } = useTheme();
  const { enabled, setEnabled, supported } = useNearbyAlerts();
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const note = !supported ? t("settings.nearbyExpoGo") : denied ? t("settings.nearbyDenied") : t("settings.nearbyWhy");
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[5], gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[4] }}>
        <Text variant="headline" style={{ flex: 1 }}>
          {t("settings.nearby")}
        </Text>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={t("settings.nearby")}
          accessibilityHint={note}
          value={enabled}
          disabled={!supported || pending}
          trackColor={{ true: colors.primary, false: colors.borderControl }}
          thumbColor={colors.surfaceRaised}
          onValueChange={async (on) => {
            setPending(true);
            setDenied(!(await setEnabled(on).finally(() => setPending(false))));
          }}
        />
      </View>
      <Text variant="footnote" color={denied ? "warning" : "textSecondary"}>
        {note}
      </Text>
    </View>
  );
}
