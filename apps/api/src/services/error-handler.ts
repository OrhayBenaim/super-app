/** Reports unexpected errors to an error tracker. */
export interface ErrorHandler {
  report(error: unknown): void;
}
