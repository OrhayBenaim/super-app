import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fmt } from "@/features/compare/format";
import { t } from "@/lib/strings";
import { Toast } from "@/ui";
import { onItemSaveFailed } from "./api";

/**
 * The one "Couldn't save {name}" toast for every item edit. It listens to the mutation cache, not to a screen, so it still
 * shows when the edit gives up after its screen is gone. Mount once in the root layout.
 */
export function ItemSaveToast() {
  const qc = useQueryClient();
  const [failed, setFailed] = useState<{ name: string; n: number } | null>(null);
  useEffect(() => onItemSaveFailed(qc, (name) => setFailed((f) => ({ name, n: (f?.n ?? 0) + 1 }))), [qc]);
  return <Toast key={failed?.n} message={failed && fmt(t("items.saveFailed"), { name: failed.name })} onHide={() => setFailed(null)} />;
}
