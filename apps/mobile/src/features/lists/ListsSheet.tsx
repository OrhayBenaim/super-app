import { useRouter } from "expo-router";
import { fmt } from "@/features/compare/format";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { Group, ListRow, Sheet, SheetHeader } from "@/ui";
import { selectList, useCurrentListId, useLists } from "./api";

/** Sheet route app/lists, opened from the List tab's title: every List the User is in (oldest first), to switch between. */
export function ListsSheet() {
  const router = useRouter();
  const lists = useLists().data ?? [];
  const current = useCurrentListId();
  const close = () => router.back();
  return (
    <Sheet>
      <SheetHeader title={t("lists.title")} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: close }} />
      {/* The sheet fits its content, so many Lists scroll inside the group. */}
      <Group maxRows={6}>
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
    </Sheet>
  );
}
