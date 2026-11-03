/** Product search rules. The API rejects shorter queries; the app waits until the field has this many characters. */
export const SEARCH = { minLength: 2 } as const;
