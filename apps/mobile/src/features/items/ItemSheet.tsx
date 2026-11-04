import { useLocalSearchParams, useRouter } from "expo-router";
import { Barcode, Check, Layers } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
import { fmt } from "@/features/compare/format";
import { useCachedChainName } from "@/features/compare/api";
import { useCategories, useCurrentListId, useItemMutations, useList } from "@/features/lists/api";
import { Taps } from "@/lib/analytics";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, SearchField, Sheet, SheetHeader, SheetTextField } from "@/ui";
import { requestDelete } from "./pendingDelete";
import { GroupResult } from "./GroupResult";
import { groupTitle, productDetail } from "./labels";
import { ProductImage } from "./ProductImage";
import { splitResults, useProductImage, useProductSearch } from "./products";

export type ItemPage = "form" | "category" | "product";

/**
 * Sheet route app/item/[id]: edit name, category (picker pushes inside), product match (pushes inside), delete.
 * `page` opens straight on a pushed page, e.g. product match from Compare's what's-missing sheet.
 * `storeId` (a Missing item tapped in that store's Basket breakdown) is store mode: product search only, and one tap on a result saves it and closes.
 */
export function ItemSheet() {
  const { id, page: initialPage = "form", storeId } = useLocalSearchParams<{ id: string; page?: ItemPage; storeId?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const listId = useCurrentListId();
  const item = useList(listId, { poll: false }).data?.items.find((i) => i.id === id) ?? null;
  const chain = useCachedChainName(storeId); // as the breakdown title
  const storeMode = !!storeId;
  const { update } = useItemMutations(listId);
  const categories = useCategories(listId).data ?? [];
  const [page, setPage] = useState<ItemPage>(initialPage);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [productCode, setProductCode] = useState<string | null>(null);
  const [groupRef, setGroupRef] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const search = useProductSearch(page === "product" ? query : "", storeId);
  const found = splitResults(search.data);
  const productImage = useProductImage(productCode);

  // Seed the form once the item is known; keyed on the id because refetches hand us a fresh `item` object.
  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setCategory(item.category);
    setProductCode(item.productCode);
    setGroupRef(item.groupRef);
    setQuery(item.name);
  }, [item?.id]);

  if (!item) return null;
  const onClose = () => router.back();
  const valid = !!name.trim() && !!category.trim();
  const back = { title: t("common.back"), analyticsName: Taps.commonBack, onPress: () => setPage("form") };
  const save = () => {
    if (!valid) return;
    update.mutate({ id: item.id, name: name.trim(), category: category.trim(), productCode, groupRef }, { onError: () => Alert.alert(t("common.error")) });
    onClose();
  };
  // An item is matched to one product or one Product group (null, null: no match).
  const pick = (code: string | null, ref: string | null, shown: string | null) => {
    if (storeMode) {
      update.mutate({ id: item.id, productCode: code, groupRef: ref }, { onError: () => Alert.alert(t("common.error")) });
      return onClose();
    }
    setProductCode(code);
    setGroupRef(ref);
    setProductName(shown);
    setPage("form");
  };
  const pickCategory = (c: string) => {
    setCategory(c);
    setNewCategory(null);
    setPage("form");
  };

  return (
    <Sheet>
      {page === "form" && (
        <>
          <SheetHeader title={t("items.edit")} start={{ title: t("common.cancel"), analyticsName: Taps.commonCancel, onPress: onClose }} end={{ title: t("common.save"), analyticsName: Taps.commonSave, onPress: save, disabled: !valid }} />
          <Group footer={t("items.product.why")}>
            <SheetTextField label={t("items.name")} value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={save} />
            <Row title={t("items.category")} analyticsName={Taps.itemsCategory} value={category} chevron onPress={() => setPage("category")} />
            <Row
              title={t("items.product")}
              analyticsName={Taps.itemsProduct}
              leading={<ProductImage url={productImage} />}
              value={productName ?? (productCode ? t("items.matched") : groupRef ? t("items.matchedGroup") : t("items.product.optional"))}
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
          <SheetHeader title={chain ? fmt(t("items.product.atStore"), { chain }) : t("items.product")} start={storeMode ? { title: t("common.cancel"), analyticsName: Taps.commonCancel, onPress: onClose } : back} />
          <SearchField label={t("items.product.placeholder")} value={query} onChangeText={setQuery} returnKeyType="search" />
          {search.isFetching && <ActivityIndicator color={colors.labelSecondary} />}
          {found.groups.length > 0 && (
            <Group title={t("items.product.results")}>
              {found.groups.map((g) => (
                <GroupResult
                  key={g.ref}
                  group={g}
                  selected={g.ref === groupRef}
                  trailing={<Layers size={20} color={colors.labelSecondary} strokeWidth={1.75} />}
                  atStore={storeMode}
                  onPress={() => pick(null, g.ref, groupTitle(g, t))}
                  onRefine={(word) => setQuery(`${query.trim()} ${word}`)}
                />
              ))}
            </Group>
          )}
          {found.products.length > 0 && (
            <Group title={t(found.groups.length ? "items.product.specific" : "items.product.results")} maxRows={5}>
              {found.products.map((p) => (
                <Row
                  key={p.code}
                  title={p.name}
                  detail={productDetail(p, t, { manufacturer: true, atStore: storeMode })}
                  accessibilityState={{ selected: p.code === productCode }}
                  analyticsName={storeMode ? Taps.compareMissingPick : Taps.itemsProductPick}
                  leading={<ProductImage url={p.imageUrl} />}
                  trailing={<Barcode size={20} color={colors.labelSecondary} strokeWidth={1.75} />}
                  onPress={() => pick(p.code, null, p.name)}
                />
              ))}
            </Group>
          )}
          {search.data?.length === 0 && <Row title={chain ? fmt(t("items.product.noneAtStore"), { chain }) : t("items.product.none")} />}
          {!storeMode && (
            <Group>
              <Row
                title={t("items.product.noMatch")}
                detail={t("items.product.noMatch.detail")}
                analyticsName={Taps.itemsProductNoMatch}
                onPress={() => pick(null, null, null)}
              />
            </Group>
          )}
        </>
      )}
    </Sheet>
  );
}
