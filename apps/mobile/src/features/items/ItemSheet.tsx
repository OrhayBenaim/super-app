import { Barcode, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, View, type TextInputInstance } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { fmt, shekels } from "@/features/compare/format";
import { useCategories, useItemMutations, type Item } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Button, Chip, Divider, IconButton, Sheet, SheetTextField, Tap, Text } from "@/ui";
import { suggestCategories } from "./autocomplete";
import { useProductSearch } from "./products";

const CHIP_IN = FadeIn.duration(200);

export type ItemSheetProps = { open: boolean; onClose: () => void; listId: string | null; item: Item | null };

/** Add (rapid entry: stays open, clears) or edit (`item` set) an item. */
export function ItemSheet({ open, onClose, listId, item }: ItemSheetProps) {
  const { colors, space, radius } = useTheme();
  const { add, update, remove } = useItemMutations(listId);
  const categories = useCategories(listId).data ?? [];
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [productCode, setProductCode] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [categoryFocused, setCategoryFocused] = useState(false);
  const [added, setAdded] = useState<Item[]>([]);
  const nameRef = useRef<TextInputInstance>(null);
  const categoryRef = useRef<TextInputInstance>(null);
  const products = useProductSearch(productCode ? "" : productQuery);

  // Reset per opening; keyed on the id because polling hands us a fresh `item` object every few seconds.
  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCategory(item?.category ?? "");
    setProductCode(item?.productCode ?? null);
    setProductQuery("");
    setAdded([]);
  }, [open, item?.id]);

  const valid = !!name.trim() && !!category.trim();
  const body = { name: name.trim(), category: category.trim(), productCode };
  const fail = () => Alert.alert(t("common.error"));

  const submitAdd = () => {
    if (!valid || add.isPending) return;
    add.mutate(body, {
      onSuccess: (created) => {
        setAdded((a) => [...a, created]);
        setName("");
        setCategory("");
        setProductCode(null);
        setProductQuery("");
        nameRef.current?.focus();
      },
      onError: fail,
    });
  };
  const save = () => {
    if (!item || !valid) return;
    update.mutate({ id: item.id, ...body }, { onError: fail });
    onClose();
  };
  const confirmDelete = () => {
    if (!item) return;
    Alert.alert(t("items.delete.title").replace("{name}", item.name), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          remove.mutate(item.id, { onError: fail });
          onClose();
        },
      },
    ]);
  };

  const suggestions = categoryFocused ? suggestCategories(category, categories) : null;
  const pickCategory = (c: string) => {
    setCategory(c);
    setCategoryFocused(false);
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
        <Text variant="title3" accessibilityRole="header">
          {t(item ? "items.edit" : "items.add")}
        </Text>
        {item && <IconButton icon={Trash2} color="danger" accessibilityLabel={t("common.delete")} onPress={confirmDelete} />}
      </View>

      <SheetTextField
        ref={nameRef}
        label={t("items.name")}
        placeholder={t("items.name.placeholder")}
        value={name}
        onChangeText={setName}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => categoryRef.current?.focus()}
      />

      <View style={{ gap: space[2] }}>
        <SheetTextField
          ref={categoryRef}
          label={t("items.category")}
          placeholder={t("items.category.placeholder")}
          value={category}
          onChangeText={(v) => {
            setCategory(v);
            setCategoryFocused(true);
          }}
          onFocus={() => setCategoryFocused(true)}
          onBlur={() => setCategoryFocused(false)}
          returnKeyType={item ? "done" : "send"}
          onSubmitEditing={item ? save : submitAdd}
          submitBehavior={item ? "blurAndSubmit" : "submit"}
        />
        {suggestions && (suggestions.matches.length > 0 || suggestions.create) && (
          <View accessibilityRole="menu" style={{ borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
            {suggestions.matches.map((c, i) => (
              <View key={c}>
                {i > 0 && <Divider />}
                <SuggestionRow label={c} onPress={() => pickCategory(c)} />
              </View>
            ))}
            {suggestions.create && (
              <>
                {suggestions.matches.length > 0 && <Divider />}
                <SuggestionRow label={t("items.category.create").replace("{name}", suggestions.create)} create onPress={() => pickCategory(suggestions.create!)} />
              </>
            )}
          </View>
        )}
      </View>

      <View style={{ gap: space[3] }}>
        {productCode ? (
          <View style={{ gap: space[3] }}>
            <Text variant="subhead" color="textSecondary">
              {t("items.product")}
            </Text>
            <Chip label={productCode} icon={Barcode} tone="primary" onClear={() => setProductCode(null)} />
          </View>
        ) : (
          <SheetTextField
            label={t("items.product")}
            placeholder={t("items.product.placeholder")}
            value={productQuery}
            onChangeText={setProductQuery}
            returnKeyType="search"
          />
        )}
        {!productCode && products.isFetching && <ActivityIndicator color={colors.textSecondary} />}
        {!productCode &&
          products.data?.slice(0, 4).map((p) => (
            <Tap
              key={p.code}
              accessibilityLabel={p.name}
              onPress={() => {
                setProductCode(p.code);
                if (!name.trim()) setName(p.name);
              }}
              style={{ paddingVertical: space[3] }}
            >
              <Text variant="callout" numberOfLines={1}>
                {p.name}
              </Text>
              <Text variant="footnote" color="textSecondary" tabular numberOfLines={1}>
                {[p.manufacturer, shekels(p.minPrice), fmt(t("items.product.stores"), { n: p.storeCount })].filter(Boolean).join(" · ")}
              </Text>
            </Tap>
          ))}
        {!productCode && products.data?.length === 0 && (
          <Text variant="footnote" color="textTertiary">
            {t("items.product.none")}
          </Text>
        )}
      </View>

      {added.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }} accessibilityLiveRegion="polite">
          {added.map((a) => (
            <Animated.View key={a.id} entering={CHIP_IN}>
              <Chip label={a.name} tone="primary" />
            </Animated.View>
          ))}
        </View>
      )}

      {item ? (
        <Button title={t("common.save")} disabled={!valid} onPress={save} />
      ) : (
        <View style={{ flexDirection: "row", gap: space[3] }}>
          <Button title={t("common.done")} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button title={t("items.addButton")} haptic icon={Plus} disabled={!valid} loading={add.isPending} onPress={submitAdd} style={{ flex: 2 }} />
        </View>
      )}
    </Sheet>
  );
}

function SuggestionRow({ label, create, onPress }: { label: string; create?: boolean; onPress: () => void }) {
  const { space } = useTheme();
  return (
    <Tap accessibilityRole="menuitem" accessibilityLabel={label} onPress={onPress} scaleTo={1} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space[5] }}>
      <Text variant="callout" color={create ? "primary" : "text"} numberOfLines={1}>
        {label}
      </Text>
    </Tap>
  );
}
