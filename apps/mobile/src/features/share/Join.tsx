import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { text, useTheme } from "@/theme";
import { SheetHeader, Text } from "@/ui";
import { useShareMutations } from "./api";

/** "Join another list", pushed inside a sheet: enter an Invite code. Joining selects the joined List. */
export function Join({ onBack, onJoined }: { onBack: () => void; onJoined: () => void }) {
  const { colors, radius, space } = useTheme();
  const { join } = useShareMutations(null);
  const [code, setCode] = useState("");
  const submit = () => code.trim() && !join.isPending && join.mutate(code, { onSuccess: onJoined });
  return (
    <View style={{ gap: space[4] }}>
      <SheetHeader title={t("share.join")} start={{ title: t("common.back"), analyticsName: Taps.commonBack, onPress: onBack }} end={{ title: t("share.join.button"), analyticsName: Taps.shareJoinButton, onPress: submit, disabled: !code.trim() || join.isPending }} />
      <Text variant="subhead" color="labelSecondary" style={{ paddingHorizontal: space[5] }}>
        {t("share.join.hint")}
      </Text>
      <TextInput
        accessibilityLabel={t("share.join.code")}
        accessibilityHint={join.isError ? t("share.join.error") : undefined}
        placeholder={t("share.join.code")}
        placeholderTextColor={colors.labelSecondary}
        selectionColor={colors.tint}
        value={code}
        onChangeText={setCode}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={submit}
        style={[
          text("title3"),
          {
            minHeight: 56,
            letterSpacing: 4,
            textAlign: "center",
            color: colors.label,
            backgroundColor: colors.surface,
            borderRadius: radius.group,
            borderWidth: join.isError ? 1 : 0,
            borderColor: colors.danger,
          },
        ]}
      />
      {join.isPending && <ActivityIndicator color={colors.labelSecondary} />}
      {join.isError && (
        <Text variant="footnote" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: space[5] }}>
          {t("share.join.error")}
        </Text>
      )}
    </View>
  );
}
