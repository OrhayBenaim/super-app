import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { UserMinus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Share, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { fmt } from "@/features/compare/format";
import { useCurrentListId, useList } from "@/features/lists/api";
import { Avatar } from "@/features/lists/Avatars";
import { Taps } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { text, useTheme } from "@/theme";
import { Button, Group, IconButton, Row, Screen, SheetHeader, Text } from "@/ui";
import { useShareMutations } from "./api";

const CODE_IN = FadeIn.duration(200);

/** Share sheet (modal route): the List's members, the invite, and one action: Leave (Member) or Rename, pushed inside (Owner). */
export function ShareScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const [renaming, setRenaming] = useState(false);
  // Here, not in Rename: the view is gone by the time a failed save answers.
  const { rename } = useShareMutations(useCurrentListId());
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));
  const save = (name: string) => {
    setRenaming(false);
    rename.mutate(name, { onError: () => Alert.alert(t("common.error")) });
  };
  // The modal is full screen on Android, so it needs the top safe-area inset; on iOS it is a page sheet already below the status bar.
  return (
    <Screen scroll edges={Platform.OS === "ios" ? ["bottom"] : ["top", "bottom"]} style={{ paddingTop: space[3], paddingBottom: space[9] }}>
      {renaming ? <Rename onBack={() => setRenaming(false)} onSave={save} /> : <Members onDone={close} onRename={() => setRenaming(true)} />}
    </Screen>
  );
}

function Members({ onDone, onRename }: { onDone: () => void; onRename: () => void }) {
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
        onPress: () => removeMember.mutate(userId, { onSuccess: () => self && onDone(), onError: fail }),
      },
    ]);

  // A new code replaces the old one on the server, so only make one when the user acts.
  const code = async () => invite.data ?? (await invite.mutateAsync());
  const send = async () => {
    const { code: c, url } = await code();
    await Share.share({ message: fmt(t("share.message"), { code: c, url }) });
  };
  const copy = async () => {
    await Clipboard.setStringAsync((await code()).code);
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

      {data && (
        <Group style={{ marginTop: space[6] }}>
          {isOwner ? (
            <Row title={t("share.rename")} analyticsName={Taps.shareRename} chevron onPress={onRename} />
          ) : (
            <Row title={t("share.leave")} analyticsName={Taps.shareLeave} titleColor="danger" onPress={() => me && confirmRemove(me, "", true)} />
          )}
        </Group>
      )}
    </>
  );
}

/** Owner's rename, pushed inside the sheet like Join: the field starts with the current name. */
function Rename({ onBack, onSave }: { onBack: () => void; onSave: (name: string) => void }) {
  const { colors, radius, space } = useTheme();
  const { data } = useList(useCurrentListId());
  const [name, setName] = useState(data?.list.name ?? "");
  const save = () => name.trim() && onSave(name);
  return (
    <View style={{ gap: space[4] }}>
      <SheetHeader
        title={t("share.rename.title")}
        start={{ title: t("common.back"), analyticsName: Taps.commonBack, onPress: onBack }}
        end={{ title: t("common.save"), analyticsName: Taps.shareRenameSave, onPress: save, disabled: !name.trim() }}
      />
      <TextInput
        accessibilityLabel={t("share.rename.field")}
        placeholder={t("share.rename.field")}
        placeholderTextColor={colors.labelSecondary}
        selectionColor={colors.tint}
        value={name}
        onChangeText={setName}
        maxLength={200}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        style={[text("body"), { minHeight: 64, paddingHorizontal: space[5], textAlign: "center", color: colors.label, backgroundColor: colors.surface, borderRadius: radius.group }]}
      />
    </View>
  );
}
