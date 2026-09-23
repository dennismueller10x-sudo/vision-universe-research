#!/usr/bin/env node
/* =========================================================================
   Materialize the Strategy Screening Index.

   Reads only artifacts that already exist:
     quant/data/product/factor-evidence-v1/screening.json.gz
     quant/methodology/strategy-profiles-v1.json

   Writes quant/data/product/strategy-index-v1.json.gz.

   A strategy profile answers "does this share suit this style". The other
   half of the same question is "which shares suit it", and that is the same
   predicate read the other way round - same predicateHash, no second
   formulation and no second engine.

   Unlike the setup cascade there is no precedence here: a title may suit
   several profiles, and a profile's list is exactly its predicate's hit
   set. What has to stay apart instead are two different zeros - a profile
   no title matches, and a profile whose input the universe does not carry
   at all. The first is a finding about the market. The second is a gap in
   the data, and publishing it as "0 titles match" would be a claim this
   layer has not earned.
   ========================================================================= */
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const StrategyMatch = require(join(ROOT, "quant/engines/strategy-match.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const SCREENING = join(ROOT, "quant/data/product/factor-evidence-v1/screening.json.gz");
const OUT = join(ROOT, "quant/data/product/strategy-index-v1.json.gz");
const contract = JSON.parse(readFileSync(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8"));

function main() {
  const screening = JSON.parse(gunzipSync(readFileSync(SCREENING)).toString("utf8"));
  /* The artifact stores one array per ticker against a shared field header,
     which is what keeps it small. Hydrated here exactly as the product
     service hydrates it, so the index is built over the same rows a
     screener would see rather than over a second reading of the file. */
  const fields = screening.fields || [];
  const rows = Object.keys(screening.rows || {}).map((ticker) => {
    const values = screening.rows[ticker];
    const row = { ticker };
    fields.forEach((field, i) => { row[field] = values[i]; });
    return row;
  });
  if (!rows.length) throw new Error("the factor evidence screening table is empty");

  const index = StrategyMatch.screenIndex(contract, rows, {
    evidenceNamespace: screening.namespace || "quantV2.factorEvidence"
  });

  /* The proof that the published list is the predicate's own answer, run
     through the query engine the screener uses rather than through a
     second comparison written here. An empty list is checked too: a
     profile that matches nothing must match nothing under the predicate
     as well, or the two sides have drifted. */
  const parity = index.profiles.map((entry) => {
    if (entry.availability.state !== "AVAILABLE") {
      return { profileId: entry.profileId, checked: false, reason: entry.availability.reason };
    }
    const profile = contract.profiles.find((p) => p.profileId === entry.profileId);
    const query = StrategyMatch.screenQuery(profile);
    const expected = rows.filter((row) => Query.matches(row, query.filters)).map((row) => row.ticker);
    const published = entry.tickers;
    const same = expected.length === published.length &&
      expected.slice().sort().join(",") === published.slice().sort().join(",");
    if (!same) {
      throw new Error("the published list for '" + entry.profileId + "' is not the predicate's answer: " +
        published.length + " published against " + expected.length + " matched");
    }
    return { profileId: entry.profileId, checked: true, matched: expected.length,
             predicateHash: entry.predicateHash };
  });

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const payload = {
    ...index,
    generatedAt,
    asOf: screening.asOf || null,
    evidenceMethodologyVersion: screening.methodologyVersion || null,
    parity,
    /* Stated with the data rather than in a caption: this index says which
       titles suit a style today. It says nothing about what that style
       returned, because that needs a historical factor panel which does
       not exist. */
    historicalEvidence: { state: "UNAVAILABLE", reason: "FACTOR_HISTORY_NOT_AVAILABLE" }
  };

  const bytes = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  if (bytes.length > 128 * 1024) {
    throw new Error("the strategy index is " + bytes.length + " compressed bytes, past the 128 KiB cap");
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, bytes);

  process.stdout.write("Strategy index " + index.methodologyVersion + " · " + index.universe + " Titel · " +
    (bytes.length / 1024).toFixed(1) + " KB komprimiert\n");
  for (const entry of index.profiles) {
    process.stdout.write("  " + String(entry.count === null ? "–" : entry.count).padStart(5) + "  " +
      entry.profileId.padEnd(26) + (entry.availability.state === "AVAILABLE" ? "" :
      entry.availability.reason + " " + (entry.availability.fields || []).join(",")) + "\n");
  }
}

main();
