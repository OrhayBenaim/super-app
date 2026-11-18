import { create } from "zustand";
import { t } from "@/lib/strings";
import { Toast } from "@/ui";

const useSent = create<{ sent: boolean }>(() => ({ sent: false }));

/** The page closes right after a send, so its thanks lives at the root, like the item-save toast. */
export const showContactSent = () => useSent.setState({ sent: true });

export function ContactSentToast() {
  const sent = useSent((s) => s.sent);
  return <Toast message={sent ? t("contact.sent") : null} onHide={() => useSent.setState({ sent: false })} />;
}
