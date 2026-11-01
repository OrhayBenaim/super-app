import { Barcode, Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert } from "react-native";
import { fmt, shekels } from "@/features/compare/format";
import { useCategories, useItemMutations, type Item } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { useTheme } from "@/theme";
import { Group, Row, SearchField, Sheet, SheetHeader, SheetTextField } from "@/ui";
import { useProductSearch } from "./products";

export type ItemPage = "form" | "category" | "product";

export type ItemSheetProps = {
  open: boolean;
  onClose: () => void;
  listId: string | null;
  item: Item | null;
  /** Open straight on a pushed page, e.g. product match from Compare's what's-missing sheet. */
  page?: ItemPage;
  /** Delete with an Undo toast; owned by the screen so the toast outlives the sheet. */
  onDelete: (item: Item) => void;
};

/** Edit item: name, category (picker pushes inside), product match (pushes inside), delete. */
export function ItemSheet({ open, onClose, listId, item, page: initialPage = "form", onDelete }: ItemSheetProps) {
  const { colors } = useTheme();
  const { update } = useItemMutations(listId);
  const categories = useCategories(listId).data ?? [];
  const [page, setPage] = useState<ItemPage>("form");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [productCode, setProductCode] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const products = useProductSearch(page === "product" ? query : "");

  // Reset per opening; keyed on the id because polling hands us a fresh `item` object every few seconds.
  useEffect(() => {
    if (!open || !item) return;
    setPage(initialPage);
    setName(item.name);
    setCategory(item.category);
    setNewCategory(null);
    setProductCode(item.productCode);
    setProductName(null);
    setQuery(item.name);
  }, [open, item?.id, initialPage]);

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const valid = !!name.trim() && !!category.trim();
  const back = { title: t("common.back"), onPress: () => setPage("form") };
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
    <Sheet open={open} onClose={onClose}>
      {page === "form" && (
        <>
          <SheetHeader title={t("items.edit")} start={{ title: t("common.cancel"), onPress: onClose }} end={{ title: t("common.save"), onPress: save, disabled: !valid }} />
          <Group footer={t("items.product.why")}>
            <SheetTextField label={t("items.name")} value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={save} />
            <Row title={t("items.category")} value={category} chevron onPress={() => setPage("category")} />
            <Row
              title={t("items.product")}
              value={productCode ? (productName ?? t("items.matched")) : t("items.product.optional")}
              chevron
              onPress={() => setPage("product")}
            />
          </Group>
          <Group>
            <Row
              title={t("items.delete")}
              titleColor="danger"
              onPress={() => {
                onClose();
                onDelete(item);
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
                trailing={c === category ? <Check size={20} color={colors.tint} strokeWidth={2} /> : undefined}
                onPress={() => pickCategory(c)}
              />
            ))}
            {newCategory === null ? (
              <Row title={t("items.category.new")} titleColor="tint" onPress={() => setNewCategory("")} />
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
          <SearchField inSheet label={t("items.product.placeholder")} value={query} onChangeText={setQuery} returnKeyType="search" />
          {products.isFetching && <ActivityIndicator color={colors.labelSecondary} />}
          {!!products.data?.length && (
            <Group title={t("items.product.results")}>
              {products.data.slice(0, 5).map((p) => (
                <Row
                  key={p.code}
                  title={p.name}
                  detail={[p.manufacturer, fmt(t("items.product.from"), { price: shekels(p.minPrice) }), fmt(t("items.product.stores"), { n: p.storeCount })].filter(Boolean).join(" · ")}
                  accessibilityState={{ selected: p.code === productCode }}
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
