// node src/worker.ts <job> [--chain key] [--out dir] [--stores file] [--prices file...] [--stores-only] [--max-stores N]
// Runs one job and exits. npm scripts: fetch (fetch-prices), ingest (ingest-prices), geocode (geocode-stores),
// sync (price-sync: one Price sync now), worker (sync-worker: long-running, Scheduled and Manual syncs).
import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { buildDeps, type Deps } from "#/deps.ts";
import { fetchPricesJob } from "#/jobs/fetch-prices.ts";
import { geocodeStoresJob } from "#/jobs/geocode-stores.ts";
import { ingestPricesJob } from "#/jobs/ingest-prices.ts";
import { priceSyncJob } from "#/jobs/price-sync.ts";
import { syncWorkerJob } from "#/jobs/sync-worker.ts";
import { loadConfig } from "#/services/config.ts";

const jobs = {
  "fetch-prices": fetchPricesJob,
  "ingest-prices": ingestPricesJob,
  "geocode-stores": geocodeStoresJob,
  "price-sync": priceSyncJob,
  "sync-worker": syncWorkerJob,
};

const [name, ...args] = process.argv.slice(2);
if (!name || !(name in jobs)) {
  console.error(`usage: node src/worker.ts <${Object.keys(jobs).join("|")}> [--flags]`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  args,
  options: {
    chain: { type: "string" },
    out: { type: "string" },
    stores: { type: "string" },
    prices: { type: "string", multiple: true },
    "stores-only": { type: "boolean" },
    "max-stores": { type: "string" },
  },
  allowPositionals: true,
});
const data = {
  chain: values.chain,
  out: values.out,
  stores: values.stores,
  prices: [...(values.prices ?? []), ...positionals], // `--prices a.gz b.gz` leaves b.gz as a positional
  storesOnly: values["stores-only"],
  maxStores: values["max-stores"],
};

// A Price sync stops after its current Chain; other jobs ignore the signal and finish.
const controller = new AbortController();
process.once("SIGTERM", () => {
  console.log("SIGTERM: finishing the running job, then exiting");
  controller.abort();
});

type Job = (deps: Deps) => (data: never, signal: AbortSignal) => Promise<unknown>;
try {
  // Each job validates its own data with Zod.
  await (jobs[name as keyof typeof jobs] as Job)(buildDeps(loadConfig()))(data as never, controller.signal);
} catch (error) {
  console.error(error instanceof z.ZodError ? z.prettifyError(error) : error);
  process.exit(1);
}
