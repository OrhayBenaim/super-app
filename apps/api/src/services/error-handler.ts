/** Reports unexpected errors to an error tracker. */
export interface ErrorHandler {
  report(error: unknown): void;
  /** Sends something the operator should fix that is not an error (sent at warning level), with its details. */
  warn(message: string, details: Record<string, unknown>): void;
  /** Tags later reports in this request with the signed-in user's id, the same id the mobile app sets. */
  setUser(id: string): void;
  /** Waits for queued reports to send; call before process.exit, which would drop them. */
  flush(): Promise<unknown>;
}
