import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { UserMinus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { fmt } from "@/features/compare/format";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Avatar } from "@/features/lists/Avatars";
import { Taps } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { text, useTheme } from "@/theme";
import { Button, Group, IconButton, Row, SheetHeader, Text } from "@/ui";
import { useShareMutations } from "./api";

const CODE_IN = FadeIn.duration(200);

/** Share sheet (modal route): members, invite code, and "join another list" pushed inside. */
export function ShareScreen() {
  const router = useRouter();
  const { colors, space } = useTheme();
  const [joining, setJoining] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.groupedBg }}
      contentContainerStyle={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[9] }}
      keyboardShouldPersistTaps="handled"
    >
      {joining ? <Join onBack={() => setJoining(false)} onJoined={close} /> : <Members onDone={close} onJoin={() => setJoining(true)} />}
    </ScrollView>
  );
}

function Members({ onDone, onJoin }: { onDone: () => void; onJoin: () => void }) {
  const { colors, space } = useTheme();
  const me = authClient.useSession().data?.user.id;
  const listId = useCurrentListId();
  const { data } = useList(listId);
  const { invite, removeMember } = useShareMutations(listId);
  const [copied, setCopied] = useState(false);
  const isOwner = data?.list.role === "owner";
  const fail = () => Alert.alert(t("common.error"));

  const confirmRemove = (userId: string, name: string, self: boolean) =>
    Alert.alert(self ? t("share.leave.confirm") : fmt(t("share.remove.confirm"), { name }), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t(self ? "share.leave" : "common.remove"),
        style: "destructive",
        onPress: () => removeMember.mutate({ userId, self }, { onSuccess: () => self && onDone(), onError: fail }),
      },
    ]);

  // A new code replaces the old one on the server, so only make one when the user acts.
  const code = async () => invite.data ?? (await invite.mutateAsync());
  const send = async () => {
    const { code: c, url } = await code();
    await Share.share({ message: fmt(t("share.message"), { code: c, url }) });
  };
  const copy = async () => {
    await Clipboard.setStringAsync((await code()).url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SheetHeader title={data ? fmt(t("share.titleNamed"), { name: data.list.name }) : t("share.title")} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: onDone }} />
      {!data ? (
        <ActivityIndicator color={colors.labelSecondary} style={{ marginTop: space[7] }} />
      ) : (
        <Group title={t("share.members")} count={data.members.length} inset={space[5] + 32 + space[4]}>
          {data.members.map((m) => (
            <Row
              key={m.userId}
              title={m.userId === me ? `${m.name} (${t("share.you")})` : m.name}
              detail={m.email}
              leading={<Avatar name={m.name} />}
              value={m.role === "owner" ? t("share.owner") : undefined}
              trailing={
                isOwner && m.userId !== me ? (
                  <IconButton icon={UserMinus} color="danger" accessibilityLabel={`${t("common.remove")} ${m.name}`} analyticsName={Taps.shareRemoveMember} onPress={() => confirmRemove(m.userId, m.name, false)} />
                ) : undefined
              }
            />
          ))}
        </Group>
      )}

      <Group title={t("share.invite")}>
        <View style={{ alignItems: "center", gap: space[3], padding: space[5] }}>
          {invite.data && (
            <Animated.View entering={CODE_IN} style={{ alignItems: "center" }}>
              <Text variant="footnote" color="labelSecondary">
                {t("share.code")}
              </Text>
              <Text variant="priceHero" selectable style={{ letterSpacing: 4 }}>
                {invite.data.code}
              </Text>
            </Animated.View>
          )}
          <Button title={t("share.send")} analyticsName={Taps.shareSend} haptic loading={invite.isPending} disabled={!listId} onPress={() => send().catch(fail)} style={{ alignSelf: "stretch" }} />
          <Button title={t(copied ? "share.copied" : "share.copy")} analyticsName={Taps.shareCopy} variant="plain" disabled={!listId} onPress={() => copy().catch(fail)} style={{ alignSelf: "stretch" }} />
        </View>
      </Group>

      <Group style={{ marginTop: space[6] }}>
        <Row title={t("share.join")} analyticsName={Taps.shareJoin} chevron onPress={onJoin} />
      </Group>

      {data && !isOwner && (
        <Group style={{ marginTop: space[6] }}>
          <Row title={t("share.leave")} analyticsName={Taps.shareLeave} titleColor="danger" onPress={() => me && confirmRemove(me, "", true)} />
        </Group>
      )}
    </>
  );
}

function Join({ onBack, onJoined }: { onBack: () => void; onJoined: () => void }) {
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
