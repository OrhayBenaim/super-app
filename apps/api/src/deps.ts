import { createAuth, type Auth } from "#/auth.ts";
import { openDb, type Db } from "#/db/index.ts";
import { nominatimGeocoder } from "#/providers/nominatim/nominatim.ts";
import { pricePortals } from "#/providers/price-portals/price-portals.ts";
import { ResendProvider } from "#/providers/resend/resend.ts";
import { fakeErrorHandler } from "#/providers/sentry/fake.ts";
import { sentryErrorHandler } from "#/providers/sentry/sentry.ts";
import type { Config } from "#/services/config.ts";
import type { ErrorHandler } from "#/services/error-handler.ts";
import type { Geocoder } from "#/services/geocoder.ts";
import { MailerService } from "#/services/mailer.ts";
import { OtpService } from "#/services/otp.ts";
import type { PricePortal } from "#/services/price-portal.ts";
import { systemClock, type Clock } from "#/utils/clock.ts";

export type Deps = {
  config: Config;
  db: Db;
  auth: Auth;
  clock: Clock;
  errorHandler: ErrorHandler;
  geocoder: Geocoder;
  mailer: MailerService;
  otp: OtpService;
  pricePortal: PricePortal;
};

/** Composition root: builds every dependency once. Tests swap one by passing an override. */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
  const db = overrides.db ?? openDb(config.DATABASE_URL);
  const clock = overrides.clock ?? systemClock;
  // Before auth, whose Password reset sends codes through the OtpService.
  const mailer = overrides.mailer ?? new MailerService(new ResendProvider(config.RESEND_API_KEY, config.EMAIL_FROM));
  const errorHandler =
    overrides.errorHandler ??
    (config.SENTRY_DSN ? sentryErrorHandler({ dsn: config.SENTRY_DSN, environment: config.SENTRY_ENVIRONMENT }) : fakeErrorHandler());
  const otp = overrides.otp ?? new OtpService({ db, mailer, clock, errorHandler });
  return {
    config,
    db,
    auth: createAuth(db, config, otp),
    clock,
    errorHandler,
    geocoder: nominatimGeocoder(config.NOMINATIM_URL),
    mailer,
    otp,
    pricePortal: pricePortals(),
    ...overrides,
  };
}
