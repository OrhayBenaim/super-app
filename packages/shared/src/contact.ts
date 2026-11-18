/** Topics of a Contact message: stable, language-neutral keys in display order. */
export const TOPICS = ["general", "bug", "improvement", "missingSupermarket", "missingProduct"] as const;
export type Topic = (typeof TOPICS)[number];

/** The longest text a Contact message may carry. */
export const CONTACT_TEXT_MAX = 2000;
