import type { Item } from "@/features/lists/api";
import { t } from "@/lib/strings";
import { Button, Group, Row, Sheet, SheetHeader } from "@/ui";
import { fmt, shekels } from "./format";
import type { StoreResult } from "./sort";

type Props = { open: boolean; onClose: () => void; store: StoreResult | null; items: Item[]; onMatch: (item: Item) => void };

/** What the best branch's total leaves out: unmatched items (with Match) and items this branch doesn't price. */
export function MissingSheet({ open, onClose, store, items, onMatch }: Props) {
  const notHere = new Set(store?.missingCodes);
  const missing = items.filter((i) => !i.productCode || notHere.has(i.productCode));
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetHeader title={store ? fmt(t("compare.missing.title"), { store: store.chainName }) : ""} end={{ title: t("common.done"), onPress: onClose }} />
      {store && (
        <Group footer={fmt(t("compare.missing.footer"), { total: shekels(store.total), n: store.matched })}>
          {missing.map((item) =>
            item.productCode ? (
              <Row key={item.id} title={item.name} detail={t("compare.missing.notHere")} />
            ) : (
              <Row
                key={item.id}
                title={item.name}
                detail={t("compare.missing.unmatched")}
                trailing={<Button variant="plain" title={t("compare.missing.match")} accessibilityLabel={`${t("compare.missing.match")}: ${item.name}`} onPress={() => onMatch(item)} style={{ paddingHorizontal: 0 }} />}
              />
            ),
          )}
        </Group>
      )}
    </Sheet>
  );
}
