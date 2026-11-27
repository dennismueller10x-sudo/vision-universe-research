#!/usr/bin/env node
/* Elliott-Depot-Rückwärtstest (Forschung, nicht zertifiziert): Wochenreihen delisteter Titel aus dem privaten V13-Archiv
   (quant/engines/research-delisted-series.cjs, nur im Actions-Lauf entschlüsselt) in das Format der Kursreihen
   (ref_<TICKER>__d.json mit points [[Datum, Schluss]], Split-bereinigt, nur Kurs) für depot-backtest.mjs --extra-dir.
   Schreibt nur nach --out (Runner-Verzeichnis), nie ins Repository; die Reihen sind Anbieterdaten und werden nicht committet.
   Aufruf: node scripts/technical/elliott-topdown/depot-delisted-export.mjs --delisted-dir D --out DIR */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const DIR = arg("delisted-dir", null), OUT = arg("out", null);
if (!DIR || !OUT) { console.error("--delisted-dir und --out sind Pflicht"); process.exit(2); }
const RECOVERY = { MERGER: 1, ACQUISITION: 1, MERGER_ACQUISITION_COMPLETED: 1, SERIES_END: 1, UNKNOWN: 0.7, DISTRESS: 0, BANKRUPTCY: 0 };
const D = createRequire(import.meta.url)(join(ROOT, "quant/engines/research-delisted-series.cjs"));
const { docs } = D.loadDelisted(ROOT, { dir: DIR });
mkdirSync(OUT, { recursive: true });
const seen = new Map(), kinds = {};
for (const doc of docs.values()) {
  const t = String(doc.ticker || "").toUpperCase(); if (!t || !doc.points || doc.points.length < 30) continue;
  const prev = seen.get(t); if (prev && prev.points.at(-1)[0] >= doc.points.at(-1)[0]) continue;   // gleicher Ticker mehrfach: die spätere Kette
  seen.set(t, doc);
}
for (const [t, doc] of seen) {
  const kind = String(doc.listingLifecycle.terminal?.kind || "UNKNOWN").toUpperCase();
  kinds[kind] = (kinds[kind] || 0) + 1;
  writeFileSync(join(OUT, "ref_" + t.replace(/\./g, "-") + "__d.json"), JSON.stringify({ points: doc.points, lastTradeDate: doc.listingLifecycle.lastTradeDate, terminal: { kind, recovery: RECOVERY[kind] ?? RECOVERY.UNKNOWN } }));
}
console.log(JSON.stringify({ ketten: docs.size, ticker: seen.size, endklassen: kinds }));
