import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Screen } from "@/ui";

export default function Settings() {
  const { space } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Screen edges={[]} style={{ paddingVertical: space[6] }}>
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
