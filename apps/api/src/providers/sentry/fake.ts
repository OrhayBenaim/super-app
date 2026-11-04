import type { ErrorHandler } from "#/services/error-handler.ts";

// Used when SENTRY_DSN is unset: app.onError already logs every error, this only keeps the latest for tests.
export function fakeErrorHandler() {
  const reported: unknown[] = [];
  const warnings: { message: string; details: Record<string, unknown> }[] = [];
  const fake = {
    reported,
    warnings,
    user: undefined as string | undefined,
    report(error: unknown) {
      reported.push(error);
      if (reported.length > 100) reported.shift(); // bounded: deps.ts uses this fake in production too
    },
    warn(message: string, details: Record<string, unknown>) {
      warnings.push({ message, details });
      if (warnings.length > 100) warnings.shift();
    },
    setUser(id: string) {
      fake.user = id;
    },
    flush: async () => true,
  };
  return fake satisfies ErrorHandler;
}
