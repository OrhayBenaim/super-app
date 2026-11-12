import { Camera } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { Plus, ScanBarcode } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { SEARCH } from "@grocer/shared/search";
import { fmt } from "@/features/compare/format";
import { useItemMutations, type Item } from "@/features/lists/api";
import { Events, Taps, track, trackTap } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, SearchField, Tap, Text, Toast } from "@/ui";
import { suggestItems } from "./autocomplete";
import { GroupResult } from "./GroupResult";
import { AddBadge, ItemRow } from "./ItemRow";
import { groupTitle, productDetail } from "./labels";
import { ProductImage } from "./ProductImage";
import { splitResults, useProductSearch, type Product, type ProductGroup } from "./products";
import { takeScan } from "./scan";

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
  const linked = new Set(items.flatMap((i) => [i.productCode, i.groupRef]));
  const search = useProductSearch(query);
  // The search is debounced, so hide its last results as soon as the field is cleared.
  const searchable = query.trim().length >= SEARCH.minLength;
  const searching = searchable && search.isFetching;
  const found = splitResults(searchable ? search.data : []);
  const groups = found.groups.filter((g) => !linked.has(g.ref));
  const products = found.products.filter((p) => !linked.has(p.code) && !items.some((i) => i.name === p.name));

  const toggle = (item: Item, missing: boolean) => update.mutate({ id: item.id, missing });
  // New items count here; re-adds count in useItemMutations (the Undo re-create must not count as an add).
  const createItem = (name: string, match: { productCode: string } | { groupRef: string } | null = null) => {
    Haptics.selectionAsync();
    const matchedKind = match ? ("groupRef" in match ? "group" : "product") : null;
    add.mutate(
      { name, category: t("items.category.other"), ...match, missing: from === "list" },
      { onSuccess: () => from === "list" && track(Events.listItemAdded, { existing: false, matched: !!match, ...(matchedKind && { matchedKind }) }) },
    );
    setQuery("");
  };

  // Scanning: ask for the camera on the first tap; the sheet explains a refusal. What it finds comes back here on return.
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; at: number } | null>(null);
  const scan = async () => {
    Keyboard.dismiss();
    const { granted } = await Camera.requestCameraPermissionsAsync();
    if (!granted) track(Events.itemScanned, { result: "denied", from });
    router.push({ pathname: "/scan", params: { from, listId: listId ?? "" } });
  };
  useFocusEffect(
    useCallback(() => {
      const found = takeScan();
      const showToast = (key: "items.scan.added" | "items.scan.alreadyOnList", name: string) => setToast({ message: fmt(t(key), { name }), at: Date.now() });
      switch (found?.kind) {
        case "named":
          // Open Food Facts' name becomes the query, so the User picks from the usual results (the API rejects longer ones).
          return setQuery(found.name.slice(0, SEARCH.maxLength));
        case "added":
          createItem(found.product.name, { productCode: found.product.code });
          return showToast("items.scan.added", found.product.name);
        case "returned":
          toggle(found.item, true);
          return showToast("items.scan.added", found.item.name);
        case "alreadyOnList":
          return showToast("items.scan.alreadyOnList", found.item.name);
      }
      // createItem and toggle only call stable mutate functions and setters, so a re-render can't leave them stale.
    }, [listId, from]),
  );
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
      detail={productDetail(p, t)}
      accessibilityLabel={fmt(t(from === "list" ? "items.addToList" : "items.add.createInItems"), { name: p.name })}
      analyticsName={Taps.itemsAddProduct}
      leading={<ProductImage url={p.imageUrl} />}
      trailing={<AddBadge />}
      onPress={() => createItem(p.name, { productCode: p.code })}
    />
  );
  const groupRow = (g: ProductGroup) => (
    <GroupResult key={g.ref} group={g} trailing={<AddBadge />} onPress={() => createItem(groupTitle(g, t), { groupRef: g.ref })} onRefine={(word) => setQuery(`${query.trim()} ${word}`)} />
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
          trailing={
            !query && (
              <Tap accessibilityLabel={t("items.scan")} analyticsName={Taps.itemsScan} onPress={scan} hitSlop={8} style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
                <ScanBarcode size={22} color={colors.tint} strokeWidth={1.75} />
              </Tap>
            )
          }
        />
        <Tap accessibilityLabel={t("common.cancel")} analyticsName={Taps.commonCancel} onPress={onClose} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text color="tint">{t("common.cancel")}</Text>
        </Tap>
      </View>
      {(matches.length > 0 || groups.length > 0 || products.length > 0 || searching || create) && (
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
              [
                ...groups.map(groupRow),
                products.length > 0 && (
                  <Group key="products" title={groups.length ? t("items.product.specific") : undefined} maxRows={3}>
                    {products.map(productRow)}
                  </Group>
                ),
              ]
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
      <Toast key={toast?.at} message={toast?.message ?? null} onHide={() => setToast(null)} />
    </Animated.View>
  );
}
