import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator } from "react-native";
import { useShareMutations } from "@/features/share/api";
import { takePendingInvite } from "@/features/share/pendingInvite";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { EmptyState, Screen } from "@/ui";

/** grocer://join/<code>: join, select the list, land on the shopping list. */
export default function JoinByLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { join } = useShareMutations(null);
  const started = useRef(false);

  // Opened from the Invite link itself: clear it so the next sign-in does not replay it.
  useEffect(() => {
    takePendingInvite();
  }, []);

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;
    join.mutate(code, { onSuccess: () => router.replace("/list") });
  }, [code, join, router]);

  return (
    <Screen>
      {join.isError ? (
        <EmptyState title={t("share.join.error")} action={{ title: t("list.toList"), analyticsName: Taps.listToList, onPress: () => router.replace("/list") }} />
      ) : (
        <ActivityIndicator style={{ flex: 1 }} color={colors.labelSecondary} accessibilityLabel={t("share.joining")} />
      )}
    </Screen>
  );
}
