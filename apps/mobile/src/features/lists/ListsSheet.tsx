import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { fmt } from "@/features/compare/format";
import { createList } from "@/features/share/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, ListRow, Row, Sheet, SheetField, SheetHeader } from "@/ui";
import { selectList, useCurrentListId, useLists } from "./api";

/** Sheet route app/lists, opened from the List tab's title: every List the User is in (oldest first), and New list pushed inside. */
export function ListsSheet() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const lists = useLists().data ?? [];
  const current = useCurrentListId();
  const close = () => router.back();
  if (creating) {
    return (
      <Sheet>
        <NewList onBack={() => setCreating(false)} onCreated={close} />
      </Sheet>
    );
  }
  return (
    <Sheet>
      <SheetHeader title={t("lists.title")} end={{ title: t("common.done"), analyticsName: Taps.commonDone, onPress: close }} />
      {/* The sheet fits its content, so many Lists scroll inside the group and New list stays on screen. */}
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
      <Group>
        <Row title={t("lists.new")} analyticsName={Taps.listsNew} chevron onPress={() => setCreating(true)} />
      </Group>
    </Sheet>
  );
}

/** Name view pushed inside the sheet, built like Rename but not optimistic: it closes on success; a failure alerts (in createList) and keeps the name. */
function NewList({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const { space } = useTheme();
  const create = useMutation(createList(useQueryClient()));
  const [name, setName] = useState("");
  const save = () => {
    if (!name.trim() || create.isPending) return;
    create.mutate(name, { onSuccess: onCreated });
  };
  return (
    <View style={{ gap: space[4] }}>
      <SheetHeader
        title={t("lists.new")}
        start={{ title: t("common.back"), analyticsName: Taps.commonBack, onPress: onBack }}
        end={{ title: t("lists.new.create"), analyticsName: Taps.listsCreate, onPress: save, disabled: !name.trim() || create.isPending }}
      />
      <SheetField
        accessibilityLabel={t("lists.new.field")}
        placeholder={t("lists.new.field")}
        value={name}
        onChangeText={setName}
        returnKeyType="done"
        onSubmitEditing={save}
        style={{ minHeight: 64, paddingHorizontal: space[5] }}
      />
    </View>
  );
}
