#!/usr/bin/env node
/* Export der aktuellen Explore Highlights (nur lesend, aendert keine Auswahl) aus den veroeffentlichten Produktdaten.
     node scripts/technical/export-explore-highlights.mjs [--type WAVE_3] [--data DIR] [--out-base PFAD-OHNE-ENDUNG]
   Sortierung (deterministisch): aufwaerts vor abwaerts, dann Pool-Rang aufsteigend, dann Rang-Anteil, dann Ticker.
   Schreibt <out-base>.csv und <out-base>.json. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Identity = require("../../core/identity.js");   // Company-Master-Scherbe (ADR-001)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; };
const TYPE = arg("type", "WAVE_3"), DATA = arg("data", join(ROOT, "quant/data/technical-intelligence/v3"));
const readGz = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString("utf8"));
const names = {};
const nameOf = (sym) => {
  const k = Identity.shardKey(sym);
  if (!names[k]) { try { names[k] = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, "quant/data/universe/instruments", k + ".json"), "utf8")).instruments.map((i) => [i.symbol, i.companyName])); } catch { names[k] = {}; } }
  return names[k][sym] || null;
};
const zone = (t, tier) => { const z = (t.zones || []).find((x) => x.tier === tier); return z ? { low: z.display.low, high: z.display.high, pctLow: z.pctLow, pctHigh: z.pctHigh, state: z.state } : null; };
const rows = [];
for (const f of readdirSync(join(DATA, "shards")).sort()) {
  const ins = readGz(join(DATA, "shards", f)).instruments;
  for (const sym of Object.keys(ins).sort()) {
    const p = ins[sym], pr = p.projectionWeekly || p.projection; if (!pr) continue;
    for (const t of pr.exploreHighlights || []) {
      if (t.type !== TYPE) continue;
      const failed = (t.qualityGates && t.qualityGates.failed) || [];
      rows.push({
        ticker: sym, company: nameOf(sym), asOf: p.asOf, direction: t.direction, degree: t.degree, pattern: t.pattern, variant: t.variant, label: t.label,
        poolRank: t.pool.rank, poolSize: t.pool.size, rankPct: t.curation.rankPct, failedGate: failed.join("+"), failedGateTitles: ((t.qualityGates.reasons) || []).map((r) => r.title).join("; "),
        price: pr.close, base: zone(t, "BASE"), extended: zone(t, "EXTENDED"), extreme: zone(t, "EXTREME"),
        invalidation: { price: t.invalidation.display, pct: t.invalidation.pct, rule: t.invalidation.ruleId },
        trend: pr.context.trend.state, rs26: { rank: pr.context.rs.rank, state: pr.context.rs.state, trend: pr.context.rs.trend },
        marketStructure: (t.roadmap && t.roadmap.structure && t.roadmap.structure.state) || null, structureVote: pr.context.structure.vote,
        contextAgreement: t.curation.contextAgreement, projectionVersion: pr.version, engine: pr.engine,
      });
    }
  }
}
rows.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "UP" ? -1 : 1) || a.poolRank - b.poolRank || a.rankPct - b.rankPct || (a.ticker < b.ticker ? -1 : 1));
const fz = (z) => (z ? `${z.low}–${z.high} (${(z.pctLow * 100).toFixed(0)}% bis ${(z.pctHigh * 100).toFixed(0)}%) [${z.state}]` : "");   // Zustand: OPEN / INSIDE / PASSED relativ zum aktuellen Kurs
const cols = ["Ticker", "Unternehmen", "Stand", "Richtung", "Grad", "Muster", "Pool-Rang", "Pool-Groesse", "Rang-Anteil", "Verfehlte Leitplanke", "Kurs", "Basis", "Erweitert", "Extrem", "Invalidation", "Invalidation %", "Trend", "RS26 Rang", "RS26 Zustand", "Marktstruktur", "Projection Engine"];
const q = (v) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = [cols.join(";")].concat(rows.map((r) => [r.ticker, r.company, r.asOf, r.direction, r.degree, r.pattern + (r.variant ? " " + r.variant : ""), r.poolRank, r.poolSize, r.rankPct, r.failedGate, r.price, fz(r.base), fz(r.extended), fz(r.extreme), r.invalidation.price, (r.invalidation.pct * 100).toFixed(1) + "%", r.trend, r.rs26.rank, r.rs26.state, r.marketStructure, r.projectionVersion].map(q).join(";"))).join("\n") + "\n";
const base = arg("out-base", join(ROOT, "docs/technical-intelligence/data/wave3-explore-highlights"));
writeFileSync(base + ".csv", csv); writeFileSync(base + ".json", JSON.stringify({ type: TYPE, count: rows.length, sort: "UP zuerst, dann Pool-Rang, Rang-Anteil, Ticker", rows }, null, 1) + "\n");
console.log(JSON.stringify({ type: TYPE, count: rows.length, up: rows.filter((r) => r.direction === "UP").length, down: rows.filter((r) => r.direction !== "UP").length, out: base + ".csv/.json" }));
