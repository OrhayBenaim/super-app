/** Product search rules. The API rejects shorter or longer queries; the app waits until the field has minLength characters. */
export const SEARCH = { minLength: 2, maxLength: 100 } as const;
