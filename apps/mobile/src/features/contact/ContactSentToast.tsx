import { create } from "zustand";
import { t } from "@/lib/strings";
import { Toast } from "@/ui";

// Counts sends, so a second send while the toast is up restarts it (its `key`).
const useSent = create<{ n: number; shown: boolean }>(() => ({ n: 0, shown: false }));

/** The page closes right after a send, so its thanks lives at the root, like the item-save toast. */
export const showContactSent = () => useSent.setState((s) => ({ n: s.n + 1, shown: true }));

export function ContactSentToast() {
  const { n, shown } = useSent();
  return <Toast key={n} message={shown ? t("contact.sent") : null} onHide={() => useSent.setState({ shown: false })} />;
}
