import { MutationObserver, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { UserMinus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Share, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { fmt } from "@/features/compare/format";
import { joinedLists, useCurrentListId, useList, useLists, type List } from "@/features/lists/api";
import { Avatar } from "@/features/lists/Avatars";
import { Taps } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, EmptyState, Group, IconButton, Row, Screen, SheetField, SheetHeader, Tap, Text } from "@/ui";
import { Join } from "./Join";
import { leaveList, useShareMutations } from "./api";

const CODE_IN = FadeIn.duration(200);

/** Share sheet (modal route): the List's members, the invite, and one action: Leave (Member) or Rename, pushed inside (Owner). */
export function ShareScreen() {
  const router = useRouter();
  const { space } = useTheme();
  const [view, setView] = useState<"main" | "rename" | "join" | "joined">("main");
  // Held here, not in Members: Rename unmounts Members, and asking for a code again would rotate the one already sent.
  const share = useShareMutations(useCurrentListId());
  const close = () => (router.canGoBack() ? router.back() : router.replace("/list"));
  const body = () => {
    if (view === "rename") return <Rename onDone={() => setView("main")} />;
    if (view === "join") return <Join onBack={() => setView("main")} onJoined={close} />;
    if (view === "joined") return <Joined onBack={() => setView("main")} onJoin={() => setView("join")} onLeftCurrent={close} />;
    return <Members share={share} onDone={close} onRename={() => setView("rename")} onJoin={() => setView("join")} onShowJoined={() => setView("joined")} />;
  };
  // The modal is full screen on Android, so it needs the top safe-area inset; on iOS it is a page sheet already below the status bar.
  return (
    <Screen scroll edges={Platform.OS === "ios" ? ["bottom"] : ["top", "bottom"]} style={{ paddingTop: space[3], paddingBottom: space[9] }}>
      {body()}
    </Screen>
  );
}

function Members({ share, onDone, onRename, onJoin, onShowJoined }: { share: ReturnType<typeof useShareMutations>; onDone: () => void; onRename: () => void; onJoin: () => void; onShowJoined: () => void }) {
  const { colors, space } = useTheme();
  const me = authClient.useSession().data?.user.id;
  const listId = useCurrentListId();
  const { data } = useList(listId);
  const { invite } = share;
  const qc = useQueryClient();
  const joinedCount = joinedLists(useLists().data ?? []).length;
  const [copied, setCopied] = useState(false);
  const isOwner = data?.list.role === "owner";
  const fail = () => Alert.alert(t("common.error"));

  const confirmRemove = (userId: string, name: string, self: boolean) =>
    Alert.alert(self ? t("share.leave.confirm") : fmt(t("share.remove.confirm"), { name }), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t(self ? "share.leave" : "common.remove"),
        style: "destructive",
        onPress: () =>
          self
            ? new MutationObserver(qc, leaveList(qc, listId ?? "")).mutate(userId).then(onDone, () => {})
            : share.removeMember.mutate(userId, { onError: fail }),
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
            <Row title={t("share.leave")} analyticsName={Taps.shareLeave} titleColor="danger" onPress={() => (me ? confirmRemove(me, "", true) : fail())} />
          )}
        </Group>
      )}
      <Group style={{ marginTop: space[6] }}>
        <Row title={t("share.join")} analyticsName={Taps.shareJoin} chevron onPress={onJoin} />
        <Row title={t("share.joined")} analyticsName={Taps.shareJoined} value={joinedCount ? String(joinedCount) : undefined} chevron onPress={onShowJoined} />
      </Group>
    </>
  );
}

/**
 * Owner's rename, pushed inside the sheet like Join: the field starts with the current name. Saving returns at once (the
 * rename is optimistic, and the mutation itself rolls back and alerts on failure, even after this view is gone).
 */
function Rename({ onDone }: { onDone: () => void }) {
  const { space } = useTheme();
  const listId = useCurrentListId();
  const { data } = useList(listId);
  const { rename } = useShareMutations(listId);
  const [name, setName] = useState(data?.list.name ?? "");
  const save = () => {
    if (!name.trim()) return;
    rename.mutate(name);
    onDone();
  };
  return (
    <View style={{ gap: space[4] }}>
      <SheetHeader
        title={t("share.rename.title")}
        start={{ title: t("common.back"), analyticsName: Taps.commonBack, onPress: onDone }}
        end={{ title: t("common.save"), analyticsName: Taps.shareRenameSave, onPress: save, disabled: !name.trim() }}
      />
      <SheetField
        accessibilityLabel={t("share.rename.field")}
        placeholder={t("share.rename.field")}
        value={name}
        onChangeText={setName}
        returnKeyType="done"
        onSubmitEditing={save}
        style={{ minHeight: 64, paddingHorizontal: space[5] }}
      />
    </View>
  );
}

/** "Lists you joined", pushed inside the sheet: every List the User is a Member of, each with a Leave that asks first. */
function Joined({ onBack, onJoin, onLeftCurrent }: { onBack: () => void; onJoin: () => void; onLeftCurrent: () => void }) {
  const { space } = useTheme();
  const lists = joinedLists(useLists().data ?? []);
  return (
    <View style={{ gap: space[4] }}>
      <SheetHeader title={t("share.joined")} start={{ title: t("common.back"), analyticsName: Taps.commonBack, onPress: onBack }} />
      {lists.length === 0 ? (
        <EmptyState title={t("share.joined.emptyTitle")} body={t("share.joined.emptyBody")} action={{ title: t("share.join"), analyticsName: Taps.shareJoin, onPress: onJoin }} />
      ) : (
        <>
          <Group>
            {lists.map((l) => (
              <JoinedRow key={l.id} list={l} onLeftCurrent={onLeftCurrent} />
            ))}
          </Group>
          <Text variant="footnote" color="labelSecondary" style={{ paddingHorizontal: space[5] }}>
            {t("share.joined.footnote")}
          </Text>
        </>
      )}
    </View>
  );
}

function JoinedRow({ list, onLeftCurrent }: { list: List; onLeftCurrent: () => void }) {
  const me = authClient.useSession().data?.user.id;
  const current = useCurrentListId();
  const leave = useMutation(leaveList(useQueryClient(), list.id));
  // The options own the failure alert. The promise (not mutate's callback) still resolves after the cache drops this row.
  const confirm = () =>
    Alert.alert(fmt(t("share.joined.confirm"), { name: list.name }), t("share.joined.confirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("share.joined.leave"), style: "destructive", onPress: () => (me ? leave.mutateAsync(me).then(() => list.id === current && onLeftCurrent(), () => {}) : Alert.alert(t("common.error"))) },
    ]);
  return (
    <Row
      title={list.name}
      detail={fmt(t("share.joined.members"), { count: list.memberCount })}
      trailing={
        <Tap
          accessibilityLabel={fmt(t("share.joined.leaveNamed"), { name: list.name })}
          analyticsName={Taps.shareJoinedLeave}
          onPress={confirm}
          style={{ minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }}
        >
          <Text color="danger">{t("share.joined.leave")}</Text>
        </Tap>
      }
    />
  );
}
