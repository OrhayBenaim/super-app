import { useLocalSearchParams, useRouter } from "expo-router";
import { missingItems, useCurrentListId, useList } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { Button, Group, Row, Sheet, SheetHeader } from "@/ui";
import { fmt, shekels } from "./format";
import type { StoreResult } from "./sort";

/** The slice of the best store the sheet shows; Compare passes it as the JSON `store` param. */
export type MissingStore = Pick<StoreResult, "chainName" | "total" | "matched" | "missingCodes">;

/** Sheet route app/missing: what the best branch's total leaves out, unmatched items (with Match) and items this branch doesn't price. */
export function MissingSheet() {
  const params = useLocalSearchParams<{ store: string }>();
  const router = useRouter();
  const store = JSON.parse(params.store) as MissingStore;
  const items = missingItems(useList(useCurrentListId(), { poll: false }).data);
  const notHere = new Set(store.missingCodes);
  const missing = items.filter((i) => !i.productCode || notHere.has(i.productCode));
  return (
    <Sheet>
      <SheetHeader title={fmt(t("compare.missing.title"), { store: store.chainName })} end={{ title: t("common.done"), onPress: () => router.back() }} />
      <Group footer={fmt(t("compare.missing.footer"), { total: shekels(store.total), n: store.matched })}>
        {missing.map((item) =>
          item.productCode ? (
            <Row key={item.id} title={item.name} detail={t("compare.missing.notHere")} />
          ) : (
            <Row
              key={item.id}
              title={item.name}
              detail={t("compare.missing.unmatched")}
              trailing={
                <Button
                  variant="plain"
                  title={t("compare.missing.match")}
                  accessibilityLabel={`${t("compare.missing.match")}: ${item.name}`}
                  onPress={() => router.replace({ pathname: "/item/[id]", params: { id: item.id, page: "product" } })}
                  style={{ paddingHorizontal: 0 }}
                />
              }
            />
          ),
        )}
      </Group>
    </Sheet>
  );
}
