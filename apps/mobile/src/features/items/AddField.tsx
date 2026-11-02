import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { fmt } from "@/features/compare/format";
import { useItemMutations, type Item } from "@/features/lists/api";
import { track } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, SearchField, Tap, Text } from "@/ui";
import { suggestItems } from "./autocomplete";
import { ItemRow } from "./ItemRow";

type Props = {
  listId: string | null;
  items: Item[];
  /** "list": picked and new items go on the list. "items": new items are created off the list. */
  from: "list" | "items";
  onClose: () => void;
};

/** The + add field: takes over the top of the screen with My items suggestions and a create row. Return adds the top match and keeps it open. */
export function AddField({ listId, items, from, onClose }: Props) {
  const { colors, space, motion } = useTheme();
  const { add, update } = useItemMutations(listId);
  const [query, setQuery] = useState("");
  const { matches, create } = suggestItems(query, items);
  const fail = () => Alert.alert(t("common.error"));

  const toggle = (item: Item, missing: boolean) => update.mutate({ id: item.id, missing }, { onError: fail });
  const createItem = (name: string) => {
    Haptics.selectionAsync();
    add.mutate({ name, category: t("items.category.other"), missing: from === "list" }, { onError: fail, onSuccess: () => from === "list" && track("list_item_added", { existing: false }) });
    setQuery("");
  };
  const addTop = () => {
    const top = matches[0];
    if (top) {
      if (!top.missing) {
        Haptics.selectionAsync();
        toggle(top, true);
      }
      setQuery("");
    } else if (create) createItem(create);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.base)}
      exiting={FadeOut.duration(motion.duration.fast)}
      style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, zIndex: 1 }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={onClose} style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.scrim }} />
      <View style={{ backgroundColor: colors.groupedBg, flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[5], paddingVertical: space[3] }}>
        <SearchField
          label={t("items.add.placeholder")}
          icon={Plus}
          autoFocus
          value={query}
          onChangeText={setQuery}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={addTop}
          containerStyle={{ flex: 1 }}
        />
        <Tap accessibilityLabel={t("common.cancel")} onPress={onClose} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text color="tint">{t("common.cancel")}</Text>
        </Tap>
      </View>
      {(matches.length > 0 || create) && (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space[5], paddingTop: space[3] }}>
          <Group>
            {matches.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={(missing) => toggle(item, missing)} />
            ))}
            {create && (
              <Row
                title={fmt(t(from === "list" ? "items.add.create" : "items.add.createInItems"), { name: create })}
                titleColor="tint"
                trailing={<Plus size={20} color={colors.tint} strokeWidth={2} />}
                onPress={() => createItem(create)}
              />
            )}
          </Group>
        </ScrollView>
      )}
    </Animated.View>
  );
}
