import type { Topic } from "@grocer/shared/contact";

const TOPIC_LABELS: Record<Topic, string> = {
  general: "General",
  bug: "Bug",
  improvement: "Improvement",
  missingSupermarket: "Missing supermarket",
  missingProduct: "Missing product",
};

/** A Contact message for the support inbox: plain text, English, the User's address as Reply-To. */
export function contactEmail(to: string, m: { topic: Topic; text: string; email: string; appVersion: string; os: string }) {
  const preview = m.text.replace(/\s+/g, " ").slice(0, 60);
  return {
    to,
    replyTo: m.email,
    subject: `[Grocer] ${TOPIC_LABELS[m.topic]}: ${preview}`,
    text: `${m.text}\n\n--\n${m.email}\nApp version: ${m.appVersion}\nOS: ${m.os}`,
  };
}
