import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "react-native";
import { Taps } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { Group, Row } from "@/ui";
import { deleteAccount } from "./deleteAccount";
import { signOut as signOutAndWipe } from "./signOut";

/** Settings' Account group: email, Sign out, Delete account. The root Stack.Protected swaps to (auth) once the session clears. */
export function AccountGroup() {
  const user = authClient.useSession().data?.user;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"signOut" | "delete" | null>(null);

  const signOut = async () => {
    setBusy("signOut");
    await signOutAndWipe(queryClient).finally(() => setBusy(null));
  };
  const runDelete = async () => {
    setBusy("delete");
    const result = await deleteAccount(queryClient).finally(() => setBusy(null));
    if (result === "reauth")
      Alert.alert(t("settings.deleteReauth"), undefined, [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.signOut"), onPress: () => signOutAndWipe(queryClient) },
      ]);
    if (result === "failed") Alert.alert(t("settings.deleteFailed"));
  };

  return (
    <Group title={t("settings.account")}>
      {user && <Row title={t("auth.email")} value={user.email} />}
      <Row
        title={t("settings.signOut")}
        analyticsName={Taps.settingsSignOut}
        titleColor="danger"
        accessibilityState={{ busy: busy === "signOut" }}
        disabled={!!busy}
        onPress={signOut}
      />
      <Row
        title={t("settings.deleteAccount")}
        analyticsName={Taps.settingsDeleteAccount}
        titleColor="danger"
        accessibilityState={{ busy: busy === "delete" }}
        disabled={!!busy}
        onPress={() =>
          Alert.alert(t("settings.deleteTitle"), t("settings.deleteBody"), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.delete"), style: "destructive", onPress: runDelete },
          ])
        }
      />
    </Group>
  );
}
