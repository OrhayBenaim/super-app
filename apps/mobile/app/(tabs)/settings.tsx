import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Linking, ScrollView, Switch, View } from "react-native";
import { deleteAccount } from "@/features/account/deleteAccount";
import { useNearbyAlerts } from "@/features/geofence/useNearbyAlerts";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Group, LargeTitle, Row, Screen, Text } from "@/ui";

export default function Settings() {
  const { space } = useTheme();
  const user = authClient.useSession().data?.user;
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  // "deleted": the root Stack.Protected swaps to (auth) when better-auth's session signal clears the session.
  const remove = async () => {
    setDeleting(true);
    const result = await deleteAccount(queryClient).finally(() => setDeleting(false));
    if (result === "reauth")
      Alert.alert(t("settings.deleteReauth"), undefined, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.signOut"), onPress: () => authClient.signOut() },
      ]);
    if (result === "failed") Alert.alert(t("settings.deleteFailed"));
  };
  return (
    <Screen edges={["top"]} style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[9] }}>
        <LargeTitle title={t("tabs.settings")} />
        <NearbyAlerts />
        <Group title={t("settings.account")}>
          {user && <Row title={t("auth.email")} value={user.email} />}
          <Row
            title={t("settings.signOut")}
            titleColor="danger"
            accessibilityState={{ busy }}
            disabled={busy}
            // The root Stack.Protected swaps back to (auth) once the session clears.
            onPress={async () => {
              setBusy(true);
              await authClient.signOut().finally(() => setBusy(false));
            }}
          />
          <Row
            title={t("settings.deleteAccount")}
            titleColor="danger"
            accessibilityState={{ busy: deleting }}
            disabled={deleting || busy}
            onPress={() =>
              Alert.alert(t("settings.deleteTitle"), t("settings.deleteBody"), [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("common.delete"), style: "destructive", onPress: remove },
              ])
            }
          />
        </Group>
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
        <Button variant="plain" title={t("settings.openSettings")} onPress={() => Linking.openSettings()} style={{ alignSelf: "flex-start", minHeight: 44, paddingHorizontal: space[5] }} />
      )}
    </View>
  );
}
