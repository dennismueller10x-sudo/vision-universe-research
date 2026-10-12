#!/usr/bin/env node
/* Vollvergleich der Explore Highlights: Kundenprodukt (veroeffentlichte Shards) gegen die Registry-Rechnung - fuer ALLE Titel mit Highlights.
   Die Registry-Rechnung laeuft in einem leeren Wegwerf-Register auf den committeten Langreihen (= Eingang des Produkts); es wird nichts im echten Register geschrieben.
     node scripts/technical/elliott-registry/check-highlight-identity.mjs [--week FREITAG] [--workers N]
   Exit 0 = alle Highlights identisch (Ausnahme TIMING wird ausgewiesen), 1 = Abweichung. */
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "../lib/ti-data.mjs";
import { publishedProduct, publishedHighlights } from "./product-view.mjs";
import { register } from "./register.mjs";

const require = createRequire(import.meta.url);
const Identity = require("../../../core/identity.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; };
const LONG = join(ROOT, "quant/data/market/discover-series-long");
const fridayOf = (d0) => { const d = new Date(d0 + "T00:00:00Z"), wd = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() + (4 - wd) * 864e5).toISOString().slice(0, 10); };

import { publishedFreshness } from "./product-view.mjs";
const pub = publishedProduct(), hl = publishedHighlights(pub.dir), pfr = publishedFreshness(pub.dir);
/* Titel, die verglichen werden: alle mit Highlights und alle mit Datenstand-Hinweis oder Zurueckhaltung (nicht FRESH) */
const nonFresh = [...pfr.byTicker].filter(([, v]) => v.st !== "FRESH").map(([t]) => t), scope = new Set([...hl.keys(), ...nonFresh]);
const week = arg("week", fridayOf([...pub.bySymbol.values()].map((v) => v.asOf).sort().pop()));
const work = mkdtempSync(join(tmpdir(), "hl-identity-")), weekly = join(work, "weekly"), reg = join(work, "registry");
mkdirSync(weekly); mkdirSync(reg);
const missing = [];
for (const t of scope) { const id = Identity.securityIdForTicker(t), f = join(LONG, id + ".json"); if (existsSync(f)) copyFileSync(f, join(weekly, id + ".json")); else missing.push(t); }
let res;
try {
  res = await register({ weeklyDir: weekly, registry: reg, week, workers: +arg("workers", "4"), minCoverage: 0, productInputDir: LONG, identitySample: 40, maxWeeks: 1, freshnessTickers: [...scope], dataSource: "check-highlight-identity.mjs (Wegwerf-Register)" });
} finally { if (!process.argv.includes("--keep")) rmSync(work, { recursive: true, force: true }); }
const h = res.highlightIdentity || {};
const out = { week, publishedTitlesWithHighlights: hl.size, nonFreshTitles: nonFresh.length, freshness: res.freshnessIdentity || null, withoutInputFile: missing, compared: h.compared, identical: h.identical, timing: h.timing, productOnlyStale: res.productOnlyStale, ok: missing.length === 0 && h.compared === h.identical && (!res.freshnessIdentity || res.freshnessIdentity.different === 0) };
console.log(JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
