import { createAuth, type Auth } from "#/auth.ts";
import { openDb, type Db } from "#/db/index.ts";
import { fakeErrorHandler } from "#/providers/fake-error-handler/fake.ts";
import { nominatimGeocoder } from "#/providers/nominatim/nominatim.ts";
import { ResendProvider } from "#/providers/resend/resend.ts";
import { pricePortals } from "#/providers/price-portals/price-portals.ts";
import type { Config } from "#/services/config.ts";
import type { ErrorHandler } from "#/services/error-handler.ts";
import type { Geocoder } from "#/services/geocoder.ts";
import { MailerService } from "#/services/mailer.ts";
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
  pricePortal: PricePortal;
};

/** Composition root: builds every dependency once. Tests swap one by passing an override. */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
  const db = overrides.db ?? openDb(config.DATABASE_URL);
  // Before auth, which sends email through the mailer and reports failed sends.
  const mailer = overrides.mailer ?? new MailerService(new ResendProvider(config.RESEND_API_KEY, config.EMAIL_FROM));
  const errorHandler = overrides.errorHandler ?? fakeErrorHandler();
  return {
    config,
    db,
    auth: createAuth(db, config, mailer, errorHandler),
    clock: systemClock,
    errorHandler,
    geocoder: nominatimGeocoder(config.NOMINATIM_URL),
    mailer,
    pricePortal: pricePortals(),
    ...overrides,
  };
}
