import * as Sentry from "@sentry/node";
import { tracesSampleRate } from "@grocer/shared/sentry";
import type { ErrorHandler } from "#/services/error-handler.ts";

/**
 * Starts Sentry once per process; call it before the server takes requests. Each HTTP request then gets its
 * own scope (so setUser stays on that request) and continues the mobile app's trace from its sentry-trace header.
 */
export function sentryErrorHandler({ dsn, environment }: { dsn: string; environment: string }): ErrorHandler {
  if (!Sentry.isInitialized())
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: tracesSampleRate(environment),
      // One project for API and mobile: filter by app. Tags label errors, attributes label logs.
      initialScope: { tags: { app: "api" }, attributes: { app: "api" } },
      // Existing console.warn/console.error calls become Sentry logs next to the errors.
      integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
    });
  return {
    report: (error) => Sentry.captureException(error),
    setUser: (id) => Sentry.setUser({ id }),
    flush: () => Sentry.flush(2000),
  };
}
