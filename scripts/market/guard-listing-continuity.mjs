#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — guard-listing-continuity.mjs

   EIN KUERZEL IST KEINE IDENTITAET - AUCH NICHT IN DER KURSREIHE.

   Der Anbieter liefert unter einem Kuerzel die Kerzen jeder Firma, die es
   je trug. Gemessen am 03.10.2026 in den veroeffentlichten Reihen: DINE
   2010-05-11..2011-01-03 (um 12) und ab 2026-05-05 (um 25), 15 Jahre ohne
   Kerze dazwischen; 127 Reihen mit einer Luecke ueber einem Jahr in ihren
   letzten 270 Kerzen. Chart, 12-Monats-Rendite, 200-Tage-Schnitt und
   Discover-Kennzahlen rechneten ueber diese Luecke - also ueber zwei
   Wertpapiere.

   Dieser Schritt laeuft nach Abruf und Gesamtrendite-Reparatur, vor allen
   Ableitungen. Er kuerzt jede Reihe der Arbeitsablage auf ihr juengstes
   Listing (survivorship-control.js currentListingSegment: nach einer
   Luecke von mehr als 365 Kalendertagen beginnt ein neues Listing) und
   vermerkt den Schnitt in der Reihe (listingContinuity). Der Abgleich mit
   der dauerhaften Ablage ersetzt so vermerkte Reihen, statt sie
   zusammenzufuehren - sonst kaemen die alten Kerzen beim naechsten Ziehen
   zurueck.

   Kursabfragen: 0. Der Bericht nennt je gekuerztem Titel des
   Produktuniversums nur Daten und Zaehler, keine Kurse.

   Aufruf:
     node scripts/market/guard-listing-continuity.mjs [--work-dir .market-cache]
       [--report <pfad>] [--public <pfad>] [--dry-run]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveProductUniverse } from "./universe-source.mjs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require(join(root, "quant", "engines", "survivorship-control.js"));

export const SCHEMA = "listing-continuity-1.0.0";

/** Reine Entscheidung je Reihe - testbar ohne Dateien. */
export function guardPayload(payload, at) {
  if (!payload || !Array.isArray(payload.bars)) return null;
  const seg = SC.currentListingSegment(payload.bars);
  if (!seg.cut) return null;
  const bars = seg.bars;
  return {
    ...payload, bars, barCount: bars.length,
    first: bars.length ? bars[0].date : null, last: bars.length ? bars[bars.length - 1].date : null,
    listingContinuity: { ...seg.cut, rule: "GAP_OVER_" + SC.LISTING_GAP_DAYS + "_DAYS_STARTS_NEW_LISTING", engine: SC.VERSION, at,
      previous: payload.listingContinuity || null }
  };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
  const DRY = argv.includes("--dry-run");
  const work = arg("--work-dir", join(root, ".market-cache"));
  const dir = join(work, "tiingo", "daily");
  const at = new Date().toISOString();
  const out = { schemaVersion: SCHEMA, generatedAt: at, engine: SC.VERSION, maxGapDays: SC.LISTING_GAP_DAYS,
    seriesChecked: 0, seriesCut: 0, barsDropped: 0, productUniverse: { checked: 0, cut: 0, rows: [] } };
  if (!existsSync(dir)) { out.state = "NO_WORKING_STORE"; return finish(out, arg); }
  const product = new Map(resolveProductUniverse(root).securities.map((s) => [s.securityId, s.ticker]));
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const id = f.slice(0, -5);
    let payload;
    try { payload = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
    out.seriesChecked++;
    if (product.has(id)) out.productUniverse.checked++;
    const next = guardPayload(payload, at);
    if (!next) continue;
    out.seriesCut++; out.barsDropped += next.listingContinuity.droppedBars;
    if (product.has(id)) {
      out.productUniverse.cut++;
      const c = next.listingContinuity;
      out.productUniverse.rows.push([id, product.get(id), c.gapDays, c.droppedBars, c.droppedTo, c.keptFrom]);
    }
    if (!DRY) writeFileSync(join(dir, f), JSON.stringify(next));
  }
  out.productUniverse.columns = ["securityId", "ticker", "gapDays", "droppedBars", "droppedTo", "keptFrom"];
  out.state = DRY ? "DRY_RUN" : "DONE";
  finish(out, arg);
}

function finish(out, arg) {
  const text = JSON.stringify(out, null, 1) + "\n";
  for (const p of [arg("--report"), arg("--public")]) if (p) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); }
  console.log(`Listing-Kontinuitaet: ${out.seriesCut} von ${out.seriesChecked} Reihen gekuerzt (${out.barsDropped} Kerzen), ` +
    `im Produktuniversum ${out.productUniverse.cut} von ${out.productUniverse.checked}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
