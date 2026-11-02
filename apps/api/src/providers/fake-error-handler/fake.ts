import type { ErrorHandler } from "#/services/error-handler.ts";

// Used when SENTRY_DSN is unset: app.onError already logs every error, this only keeps the latest for tests.
export function fakeErrorHandler() {
  const reported: unknown[] = [];
  const fake = {
    reported,
    user: undefined as string | undefined,
    report(error: unknown) {
      reported.push(error);
      if (reported.length > 100) reported.shift(); // bounded: deps.ts uses this fake in production too
    },
    setUser(id: string) {
      fake.user = id;
    },
  };
  return fake satisfies ErrorHandler;
}
