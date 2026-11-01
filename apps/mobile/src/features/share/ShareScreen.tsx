import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Copy, LogOut, Share as ShareIcon, Trash2, UserPlus, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Share, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Avatar } from "@/features/lists/Avatars";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Chip, Divider, IconButton, Screen, Text, TextField } from "@/ui";
import { useShareMutations } from "./api";

const CODE_IN = FadeIn.duration(200);

export function ShareScreen() {
  const router = useRouter();
  const { colors, space, radius } = useTheme();
  const me = authClient.useSession().data?.user.id;
  const listId = useCurrentListId();
  const { data } = useList(listId);
  const { invite, join, removeMember } = useShareMutations(listId);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const isOwner = data?.list.role === "owner";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  const confirmRemove = (userId: string, name: string, self: boolean) =>
    Alert.alert(self ? t("share.leave.confirm") : t("share.remove.confirm").replace("{name}", name), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t(self ? "share.leave" : "common.remove"),
        style: "destructive",
        onPress: () =>
          removeMember.mutate({ userId, self }, { onSuccess: () => self && close(), onError: () => Alert.alert(t("common.error")) }),
      },
    ]);

  const copy = async (url: string) => {
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen scroll keyboard edges={["top", "bottom"]}>
      <Stack.Screen options={{ presentation: "modal" }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: space[3] }}>
        <Text variant="title1" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
          {data?.list.name ?? t("share.title")}
        </Text>
        <IconButton icon={X} accessibilityLabel={t("common.close")} onPress={close} />
      </View>

      <Text variant="subhead" color="textSecondary" style={{ paddingTop: space[6], paddingBottom: space[3] }}>
        {t("share.members")}
      </Text>
      {!data ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : (
        <View style={{ borderRadius: radius.lg, backgroundColor: colors.surface, overflow: "hidden" }}>
          {data.members.map((m, i) => (
            <View key={m.userId}>
              {i > 0 && <Divider style={{ marginStart: space[5] }} />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[4], minHeight: 64, paddingStart: space[5], paddingEnd: space[3] }}>
                <Avatar name={m.name} size={40} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="body" numberOfLines={1}>
                    {m.userId === me ? `${m.name} (${t("share.you")})` : m.name}
                  </Text>
                  <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                    {m.email}
                  </Text>
                </View>
                {m.role === "owner" && <Chip label={t("share.owner")} tone="primary" />}
                {isOwner && m.userId !== me && (
                  <IconButton icon={Trash2} color="danger" accessibilityLabel={`${t("common.remove")} ${m.name}`} onPress={() => confirmRemove(m.userId, m.name, false)} />
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: space[4], paddingTop: space[7] }}>
        {invite.data ? (
          <Animated.View entering={CODE_IN} style={{ gap: space[4], alignItems: "center", padding: space[6], borderRadius: radius.lg, backgroundColor: colors.primarySoft }}>
            <Text variant="footnote" color="onPrimarySoft">
              {t("share.code")}
            </Text>
            <Text variant="largeTitle" color="onPrimarySoft" tabular selectable style={{ fontSize: 40, lineHeight: 48, letterSpacing: 4 }}>
              {invite.data.code}
            </Text>
            <View style={{ flexDirection: "row", gap: space[3], alignSelf: "stretch" }}>
              <Button title={t(copied ? "share.copied" : "share.copy")} icon={Copy} variant="ghost" onPress={() => copy(invite.data.url)} style={{ flex: 1 }} />
              <Button
                title={t("share.send")}
                icon={ShareIcon}
                onPress={() => Share.share({ message: t("share.message").replace("{code}", invite.data.code).replace("{url}", invite.data.url) })}
                style={{ flex: 1 }}
              />
            </View>
          </Animated.View>
        ) : (
          <Button title={t("share.invite")} icon={UserPlus} loading={invite.isPending} disabled={!listId} onPress={() => invite.mutate(undefined, { onError: () => Alert.alert(t("common.error")) })} />
        )}
      </View>

      <View style={{ gap: space[4], paddingTop: space[8] }}>
        <Text variant="headline" accessibilityRole="header">
          {t("share.join")}
        </Text>
        <TextField
          label={t("share.join.code")}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          error={join.isError ? t("share.join.error") : undefined}
        />
        <Button
          title={t("share.join.button")}
          variant="secondary"
          disabled={!code.trim()}
          loading={join.isPending}
          onPress={() => join.mutate(code, { onSuccess: close })}
        />
      </View>

      {data && !isOwner && (
        <Button
          title={t("share.leave")}
          icon={LogOut}
          variant="ghost"
          onPress={() => me && confirmRemove(me, "", true)}
          style={{ marginTop: space[8] }}
        />
      )}
      <View style={{ height: space[8] }} />
    </Screen>
  );
}
