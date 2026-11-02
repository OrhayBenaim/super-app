import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { fmt, shekels } from "@/features/compare/format";
import { useItemMutations, type Item } from "@/features/lists/api";
import { Events, Taps, track, trackTap } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, SearchField, Tap, Text } from "@/ui";
import { suggestItems } from "./autocomplete";
import { AddBadge, ItemRow } from "./ItemRow";
import { useProductSearch, type Product } from "./products";

type Props = {
  listId: string | null;
  items: Item[];
  /** "list": picked and new items go on the list. "items": new items are created off the list. */
  from: "list" | "items";
  onClose: () => void;
};

/**
 * The + add field: takes over the top of the screen with My items suggestions, matched products from the price data
 * (added already linked) and a create row (added unlinked). Return adds the top My items match or creates, and keeps it open.
 */
export function AddField({ listId, items, from, onClose }: Props) {
  const { colors, space, motion } = useTheme();
  const { add, update } = useItemMutations(listId);
  const [query, setQuery] = useState("");
  const { matches, create } = suggestItems(query, items);
  const fail = () => Alert.alert(t("common.error"));
  const linked = new Set(items.map((i) => i.productCode));
  const search = useProductSearch(query);
  // The search is debounced, so hide its last results as soon as the field is cleared.
  const searchable = query.trim().length >= 2;
  const searching = searchable && search.isFetching;
  const products = searchable ? (search.data ?? []).filter((p) => !linked.has(p.code) && !items.some((i) => i.name === p.name)) : [];

  const toggle = (item: Item, missing: boolean) => update.mutate({ id: item.id, missing }, { onError: fail });
  // New items count here; re-adds count in useItemMutations (the Undo re-create must not count as an add).
  const createItem = (name: string, productCode: string | null = null) => {
    Haptics.selectionAsync();
    add.mutate(
      { name, category: t("items.category.other"), productCode, missing: from === "list" },
      { onError: fail, onSuccess: () => from === "list" && track(Events.listItemAdded, { existing: false, matched: !!productCode }) },
    );
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

  const productRow = (p: Product) => (
    <Row
      key={p.code}
      title={p.name}
      detail={[fmt(t("items.product.from"), { price: shekels(p.minPrice) }), fmt(t("items.product.stores"), { n: p.storeCount })].join(" · ")}
      accessibilityLabel={fmt(t(from === "list" ? "items.addToList" : "items.add.createInItems"), { name: p.name })}
      analyticsName={Taps.itemsAddProduct}
      trailing={<AddBadge />}
      onPress={() => createItem(p.name, p.code)}
    />
  );

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.base)}
      exiting={FadeOut.duration(motion.duration.fast)}
      style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, zIndex: 1 }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.cancel")} onPress={() => { trackTap(Taps.itemsAddDismiss); onClose(); }} style={{ position: "absolute", top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.scrim }} />
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
        <Tap accessibilityLabel={t("common.cancel")} analyticsName={Taps.commonCancel} onPress={onClose} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text color="tint">{t("common.cancel")}</Text>
        </Tap>
      </View>
      {(matches.length > 0 || products.length > 0 || searching || create) && (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ padding: space[5], paddingTop: space[3] }}>
          <Group>
            {matches.map((item) => (
              <ItemRow key={item.id} item={item} onToggle={(missing) => toggle(item, missing)} />
            ))}
            {searching ? (
              <View accessible accessibilityRole="progressbar" accessibilityLabel={t("items.add.searching")} style={{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44, paddingHorizontal: space[5] }}>
                <ActivityIndicator color={colors.labelSecondary} />
                <Text color="labelSecondary">{t("items.add.searching")}</Text>
              </View>
            ) : (
              products.length > 0 && <Group maxRows={3}>{products.map(productRow)}</Group>
            )}
            {create && (
              <Row
                title={fmt(t(from === "list" ? "items.add.create" : "items.add.createInItems"), { name: create })}
                titleColor="tint"
                analyticsName={Taps.itemsAddCreate}
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
