/**
 * Share of traces sent to Sentry. API and mobile use the same rate so a trace that starts on one side and
 * continues on the other is sampled the same way. Development keeps every trace.
 */
export function tracesSampleRate(environment: string): number {
  return environment === "production" ? 0.2 : 1;
}
