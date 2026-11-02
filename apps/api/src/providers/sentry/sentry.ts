import * as Sentry from "@sentry/node";
import type { ErrorHandler } from "#/services/error-handler.ts";

/**
 * Starts Sentry once per process; call it before the server takes requests. Each HTTP request then gets its
 * own scope (so setUser stays on that request) and continues the mobile app's trace from its sentry-trace header.
 */
export function sentryErrorHandler({ dsn, tracesSampleRate }: { dsn: string; tracesSampleRate: number }): ErrorHandler {
  if (!Sentry.isInitialized())
    Sentry.init({
      dsn,
      tracesSampleRate,
      initialScope: { tags: { app: "api" } }, // one project for API and mobile: filter by app
      // Existing console.warn/console.error calls become Sentry logs next to the errors.
      integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
    });
  return {
    report: (error) => Sentry.captureException(error),
    setUser: (id) => Sentry.setUser({ id }),
    flush: () => Sentry.flush(2000),
  };
}
