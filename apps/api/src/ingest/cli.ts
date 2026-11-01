// npm run ingest -- --chain <key> [--stores <file>] [--prices <file...>]
import { parseArgs } from "node:util";
import { ingestPrices, ingestStores, readXml } from "./ingest.js";

const { values, positionals } = parseArgs({
  options: { chain: { type: "string" }, stores: { type: "string" }, prices: { type: "string", multiple: true } },
  allowPositionals: true,
});
const files = [...(values.prices ?? []), ...positionals]; // `--prices a.gz b.gz` leaves b.gz as a positional
if (!values.chain || (!values.stores && !files.length)) {
  console.error("usage: npm run ingest -- --chain <key> [--stores <file>] [--prices <file...>]");
  process.exit(1);
}
if (values.stores) console.log(`${values.stores}: ${ingestStores(values.chain, readXml(values.stores))} stores`);
for (const f of files) {
  const t = performance.now();
  console.log(`${f}: ${ingestPrices(values.chain, readXml(f))} prices in ${Math.round(performance.now() - t)} ms`);
}
