#!/usr/bin/env node
/* =========================================================================
   METHODOLOGY FINGERPRINT - gleicher Stichtag ist nicht gleicher Stand.

   Owner-Programm 02.10.2026, §25/§26: Die Materialisierung haelt sich fuer
   erledigt, sobald der Produktstand den Stichtag der Ablage traegt. Ein
   Methodikwechsel bei gleichem Stichtag (SPY als Benchmark, strengerer
   Gesamtrendite-Vertrag, neue Ueberlebenden-Kontrolle) aendert aber das
   Ergebnis - und blieb bisher liegen, bis jemand von Hand `force` setzte.

   Dieser Fingerabdruck fasst die Teile zusammen, die das Ergebnis der
   Backtest- und Evidenzschicht bestimmen, in vier Gruppen:
     methodology    Methodikdateien (quant/methodology/*.json)
     evidence       Engines und Builder der Backtest-/Evidenzartefakte
     benchmark      Vergleichsmassstab (tiingo-scale.json benchmark, Rolle)
     returnQuality  Gesamtrendite (canonical-total-return.js), alter Vertrag
                    als Gegenprobe, Lader
     contracts      die Vertragsversionen selbst: Gesamtrendite,
                    Corporate Actions, Benchmark - eine neue Version aendert
                    den Fingerabdruck auch ohne andere Dateiaenderung
   Je Gruppe ein SHA-256 ueber den Dateiinhalt, dazu ein Gesamtwert.

   Aufruf:
     node scripts/quant/methodology-fingerprint.mjs            -> JSON auf stdout
     node scripts/quant/methodology-fingerprint.mjs --write    -> quant/data/product/methodology-fingerprint-v1.json
     node scripts/quant/methodology-fingerprint.mjs --compare  -> stdout "changed=<gruppen>" oder "changed="
   ========================================================================= */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FINGERPRINT_FILE = "quant/data/product/methodology-fingerprint-v1.json";
export const SCHEMA = "methodology-fingerprint-1.0.0";

const methodologyFiles = () => readdirSync(join(ROOT, "quant/methodology")).filter((f) => f.endsWith(".json")).sort().map((f) => "quant/methodology/" + f);
export const GROUPS = {
  methodology: methodologyFiles,
  evidence: () => [
    "quant/engines/signal-backtest.js", "quant/engines/backtest-certification.js", "quant/engines/profile-backtest.js",
    "quant/engines/survivorship-control.js",
    "scripts/quant/build-signal-backtest.mjs", "scripts/quant/build-setup-backtest.mjs", "scripts/quant/build-setup-outcomes.mjs",
    "scripts/quant/build-backtest-certification.mjs", "scripts/quant/build-backtest-readiness.mjs", "scripts/quant/build-quant-radar.mjs",
    "scripts/quant/lib/weekly-total-return.mjs"
  ],
  benchmark: () => ["scripts/market/benchmark-reference.mjs", "scripts/market/refresh-benchmark-history.mjs", "@benchmark"],
  returnQuality: () => ["quant/engines/canonical-total-return.js", "quant/engines/market-quality.js", "scripts/quant/lib/daily-prices.mjs"],
  contracts: () => ["@contracts"]
};

function contentOf(p) {
  if (p === "@contracts") {
    const src = readFileSync(join(ROOT, "quant/engines/canonical-total-return.js"), "utf8");
    const v = (name) => (src.match(new RegExp("var " + name + ' = "([^"]+)"')) || [])[1] || "<missing>";
    return JSON.stringify({ totalReturn: v("VERSION"), corporateActions: v("CORPORATE_ACTION_CONTRACT"), benchmark: v("BENCHMARK_CONTRACT") });
  }
  if (p === "@benchmark") return JSON.stringify(JSON.parse(readFileSync(join(ROOT, "quant/config/tiingo-scale.json"), "utf8")).benchmark || null);
  const f = join(ROOT, p);
  return existsSync(f) ? readFileSync(f, "utf8").replace(/\r\n/g, "\n") : "<missing>";
}

export function fingerprint() {
  const groups = {};
  for (const [name, list] of Object.entries(GROUPS)) {
    const h = createHash("sha256");
    for (const p of list()) h.update(p + "\0" + contentOf(p) + "\0");
    groups[name] = h.digest("hex").slice(0, 16);
  }
  const all = createHash("sha256").update(JSON.stringify(groups)).digest("hex").slice(0, 16);
  return { schemaVersion: SCHEMA, hash: all, groups };
}

/** Welche Gruppen weichen vom gespeicherten Stand ab? Fehlt er, gilt alles als geaendert. */
export function changedGroups(current, stored) {
  if (!stored || stored.schemaVersion !== SCHEMA || !stored.groups) return Object.keys(current.groups);
  return Object.keys(current.groups).filter((g) => current.groups[g] !== stored.groups[g]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fp = fingerprint();
  const argv = process.argv.slice(2);
  if (argv.includes("--write")) {
    writeFileSync(join(ROOT, FINGERPRINT_FILE), JSON.stringify({ ...fp, materializedAt: new Date().toISOString() }, null, 1) + "\n");
    console.log("methodology fingerprint", fp.hash);
  } else if (argv.includes("--compare")) {
    const f = join(ROOT, FINGERPRINT_FILE);
    const stored = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
    console.log("changed=" + changedGroups(fp, stored).join(","));
  } else console.log(JSON.stringify(fp, null, 1));
}
