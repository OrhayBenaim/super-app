/** Reports unexpected errors to an error tracker. */
export interface ErrorHandler {
  report(error: unknown): void;
  /** Tags later reports in this request with the signed-in user's id, the same id the mobile app sets. */
  setUser(id: string): void;
}
