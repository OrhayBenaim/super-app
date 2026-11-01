import { createAuth, type Auth } from "#/auth.ts";
import { openDb, type Db } from "#/db/index.ts";
import { fakeErrorHandler } from "#/providers/fake-error-handler/fake.ts";
import { nominatimGeocoder } from "#/providers/nominatim/nominatim.ts";
import { pricePortals } from "#/providers/price-portals/price-portals.ts";
import type { Config } from "#/services/config.ts";
import type { ErrorHandler } from "#/services/error-handler.ts";
import type { Geocoder } from "#/services/geocoder.ts";
import type { PricePortal } from "#/services/price-portal.ts";
import { systemClock, type Clock } from "#/utils/clock.ts";

export type Deps = {
  config: Config;
  db: Db;
  auth: Auth;
  clock: Clock;
  errorHandler: ErrorHandler;
  geocoder: Geocoder;
  pricePortal: PricePortal;
};

/** Composition root: builds every dependency once. Tests swap one by passing an override. */
export function buildDeps(config: Config, overrides: Partial<Deps> = {}): Deps {
  const db = overrides.db ?? openDb(config.DATABASE_URL);
  return {
    config,
    db,
    auth: createAuth(db, config),
    clock: systemClock,
    errorHandler: fakeErrorHandler(),
    geocoder: nominatimGeocoder(config.NOMINATIM_URL),
    pricePortal: pricePortals(),
    ...overrides,
  };
}
