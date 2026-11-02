import { useLocalSearchParams, useRouter } from "expo-router";
import { Barcode, Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, useWindowDimensions } from "react-native";
import { fmt, shekels } from "@/features/compare/format";
import { useCategories, useCurrentListId, useItemMutations, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, SearchField, Sheet, SheetHeader, SheetTextField } from "@/ui";
import { requestDelete } from "./pendingDelete";
import { useProductSearch } from "./products";

export type ItemPage = "form" | "category" | "product";

/**
 * Sheet route app/item/[id]: edit name, category (picker pushes inside), product match (pushes inside), delete.
 * `page` opens straight on a pushed page, e.g. product match from Compare's what's-missing sheet.
 */
export function ItemSheet() {
  const { id, page: initialPage = "form" } = useLocalSearchParams<{ id: string; page?: ItemPage }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const listId = useCurrentListId();
  const item = useList(listId, { poll: false }).data?.items.find((i) => i.id === id) ?? null;
  const { update } = useItemMutations(listId);
  const categories = useCategories(listId).data ?? [];
  const [page, setPage] = useState<ItemPage>(initialPage);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [productCode, setProductCode] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const products = useProductSearch(page === "product" ? query : "");

  // Seed the form once the item is known; keyed on the id because refetches hand us a fresh `item` object.
  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setCategory(item.category);
    setProductCode(item.productCode);
    setQuery(item.name);
  }, [item?.id]);

  if (!item) return null;
  const onClose = () => router.back();
  const valid = !!name.trim() && !!category.trim();
  const back = { title: t("common.back"), analyticsName: Taps.commonBack, onPress: () => setPage("form") };
  const save = () => {
    if (!valid) return;
    update.mutate({ id: item.id, name: name.trim(), category: category.trim(), productCode }, { onError: () => Alert.alert(t("common.error")) });
    onClose();
  };
  const pickCategory = (c: string) => {
    setCategory(c);
    setNewCategory(null);
    setPage("form");
  };

  return (
    // The product page loads in (spinner, then results): start it at 40% so it only grows, upward.
    <Sheet minHeight={page === "product" ? height * 0.4 : undefined}>
      {page === "form" && (
        <>
          <SheetHeader title={t("items.edit")} start={{ title: t("common.cancel"), analyticsName: Taps.commonCancel, onPress: onClose }} end={{ title: t("common.save"), analyticsName: Taps.commonSave, onPress: save, disabled: !valid }} />
          <Group footer={t("items.product.why")}>
            <SheetTextField label={t("items.name")} value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={save} />
            <Row title={t("items.category")} analyticsName={Taps.itemsCategory} value={category} chevron onPress={() => setPage("category")} />
            <Row
              title={t("items.product")}
              analyticsName={Taps.itemsProduct}
              value={productCode ? (productName ?? t("items.matched")) : t("items.product.optional")}
              chevron
              onPress={() => setPage("product")}
            />
          </Group>
          <Group>
            <Row
              title={t("items.delete")}
              analyticsName={Taps.itemsDelete}
              titleColor="danger"
              onPress={() => {
                requestDelete(item);
                onClose();
              }}
            />
          </Group>
        </>
      )}

      {page === "category" && (
        <>
          <SheetHeader title={t("items.category")} start={back} />
          <Group footer={t("items.category.why")}>
            {categories.map((c) => (
              <Row
                key={c}
                title={c}
                accessibilityState={{ selected: c === category }}
                analyticsName={Taps.itemsCategoryPick}
                trailing={c === category ? <Check size={20} color={colors.tint} strokeWidth={2} /> : undefined}
                onPress={() => pickCategory(c)}
              />
            ))}
            {newCategory === null ? (
              <Row title={t("items.category.new")} analyticsName={Taps.itemsCategoryNew} titleColor="tint" onPress={() => setNewCategory("")} />
            ) : (
              <SheetTextField
                label={t("items.category.new")}
                autoFocus
                value={newCategory}
                onChangeText={setNewCategory}
                returnKeyType="done"
                onSubmitEditing={() => newCategory.trim() && pickCategory(newCategory.trim())}
              />
            )}
          </Group>
        </>
      )}

      {page === "product" && (
        <>
          <SheetHeader title={t("items.product")} start={back} />
          <SearchField label={t("items.product.placeholder")} value={query} onChangeText={setQuery} returnKeyType="search" />
          {products.isFetching && <ActivityIndicator color={colors.labelSecondary} />}
          {!!products.data?.length && (
            <Group title={t("items.product.results")} maxRows={5}>
              {products.data.map((p) => (
                <Row
                  key={p.code}
                  title={p.name}
                  detail={[p.manufacturer, fmt(t("items.product.from"), { price: shekels(p.minPrice) }), fmt(t("items.product.stores"), { n: p.storeCount })].filter(Boolean).join(" · ")}
                  accessibilityState={{ selected: p.code === productCode }}
                  analyticsName={Taps.itemsProductPick}
                  trailing={<Barcode size={20} color={colors.labelSecondary} strokeWidth={1.75} />}
                  onPress={() => {
                    setProductCode(p.code);
                    setProductName(p.name);
                    setPage("form");
                  }}
                />
              ))}
            </Group>
          )}
          {products.data?.length === 0 && <Row title={t("items.product.none")} />}
          <Group>
            <Row
              title={t("items.product.noMatch")}
              detail={t("items.product.noMatch.detail")}
              analyticsName={Taps.itemsProductNoMatch}
              onPress={() => {
                setProductCode(null);
                setProductName(null);
                setPage("form");
              }}
            />
          </Group>
        </>
      )}
    </Sheet>
  );
}
