import { useRouter } from "expo-router";
import { useState } from "react";
import { fmt } from "@/features/compare/format";
import { Join } from "@/features/share/Join";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { Group, ListRow, Row, Sheet, SheetHeader } from "@/ui";
import { selectList, useCurrentListId, useLists } from "./api";

/** Sheet route app/lists, opened from the List tab's title: every List the User is in (oldest first), and Join pushed inside. */
export function ListsSheet() {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const lists = useLists().data ?? [];
  const current = useCurrentListId();
  const close = () => router.back();
  if (joining) {
    return (
      <Sheet>
        <Join onBack={() => setJoining(false)} onJoined={close} />
      </Sheet>
    );
  }
  return (
    <Sheet>
      <SheetHeader title={t("lists.title")} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: close }} />
      <Group>
        {lists.map((l) => (
          <ListRow
            key={l.id}
            name={l.name}
            detail={l.memberCount > 1 ? fmt(t("lists.members"), { n: l.memberCount }) : undefined}
            selected={l.id === current}
            analyticsName={Taps.listsPick}
            onPress={() => {
              selectList(l.id);
              close();
            }}
          />
        ))}
      </Group>
      <Group>
        <Row title={t("share.join")} analyticsName={Taps.listsJoin} chevron onPress={() => setJoining(true)} />
      </Group>
    </Sheet>
  );
}
