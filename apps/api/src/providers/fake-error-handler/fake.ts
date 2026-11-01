import type { ErrorHandler } from "#/services/error-handler.ts";

// Stand-in until Sentry is added: app.onError already logs every error, this only keeps the latest for tests.
export function fakeErrorHandler() {
  const reported: unknown[] = [];
  const fake = {
    reported,
    report(error: unknown) {
      reported.push(error);
      if (reported.length > 100) reported.shift(); // bounded: deps.ts uses this fake in production too
    },
  };
  return fake satisfies ErrorHandler;
}
