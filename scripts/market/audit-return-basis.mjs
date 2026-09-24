#!/usr/bin/env node
/* =========================================================================
   FULL-UNIVERSE RETURN-BASIS AUDIT — Schritt 1: die Inputs.

   Beantwortet eine Frage und nur diese: fuer wie viele Titel des
   kanonischen Produktuniversums lassen sich BEIDE Return-Basen aus
   vorhandenen Daten bauen - und woran scheitert der Rest.

   Nichts wird geschaetzt. Ein Titel, dessen Reihe fehlt, zaehlt als
   fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas
   anderes als einer ohne Dividendenspalte, und beide werden getrennt
   gezaehlt.

   WO DIE DATEN LIEGEN

   Der kanonische Barstore ist runner-privat: der Workflow stellt ihn aus
   R2 unter --work-dir wieder her. Im Repository liegen nur die fuenf
   Golden-Preview-Reihen mit allen Spalten und die breiten
   Discover-Reihen mit EINER Spalte. Dieses Skript misst, was da ist, wo
   immer es laeuft, und sagt im Bericht welcher Bestand es war - statt aus
   einem lokalen Lauf auf das Universum zu schliessen.

   Keine neue Pipeline, kein neuer Anbieter: gelesen wird der Store, den
   build-market-factors ohnehin liest.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "quant/data/providers/return-basis-input-audit.json");

function arg(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}
const WORK_DIR = arg("--work-dir", join(ROOT, ".market-cache"));
const PROVIDER = arg("--provider", "tiingo");
const BARS_DIR = join(WORK_DIR, PROVIDER, "daily");
const GOLDEN = join(ROOT, "quant/data/market/golden-preview/daily");

const finite = (v) => typeof v === "number" && Number.isFinite(v);

function productUniverse() {
  const file = join(ROOT, "quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json");
  if (!existsSync(file)) throw new Error("no canonical product universe at " + file);
  const payload = JSON.parse(readFileSync(file, "utf8"));
  return { file: "quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json", securities: payload.securities || [] };
}

/* Der Store zuerst, die Golden Preview nur als Rueckfall - und im Bericht
   steht, welcher es war. Die fuenf Golden-Titel duerfen den Audit nicht
   als Universum ausgeben. */
function readSeries(securityId) {
  const fromStore = join(BARS_DIR, securityId + ".json");
  if (existsSync(fromStore)) return { source: "CANONICAL_STORE", payload: JSON.parse(readFileSync(fromStore, "utf8")) };
  const fromGolden = join(GOLDEN, securityId + ".json");
  if (existsSync(fromGolden)) return { source: "GOLDEN_PREVIEW", payload: JSON.parse(readFileSync(fromGolden, "utf8")) };
  return null;
}

function auditSeries(payload) {
  const bars = Array.isArray(payload.bars) ? payload.bars : [];
  if (!bars.length) return null;
  let rawClose = 0, adjustedClose = 0, splitFactor = 0, dividendColumn = 0, dividendEvents = 0, splitEvents = 0, dates = 0;
  for (const bar of bars) {
    if (finite(bar.close) && bar.close > 0) rawClose += 1;
    if (finite(bar.adjustedClose) && bar.adjustedClose > 0) adjustedClose += 1;
    /* Spalte und Ereignis sind zwei verschiedene Dinge. 1 und 0 heissen
       "an diesem Tag ist nichts passiert" - ein Befund. Nur null heisst,
       dass die Spalte fehlt. */
    if (bar.splitFactor !== null && bar.splitFactor !== undefined) splitFactor += 1;
    if (finite(bar.splitFactor) && bar.splitFactor !== 1) splitEvents += 1;
    if (bar.dividend !== null && bar.dividend !== undefined) dividendColumn += 1;
    if (finite(bar.dividend) && bar.dividend > 0) dividendEvents += 1;
    if (typeof bar.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bar.date)) dates += 1;
  }
  return {
    bars: bars.length, rawClose, adjustedClose, splitFactor, dividendColumn,
    dividendEvents, splitEvents, dates,
    adjustmentStatus: payload.adjustmentStatus || (bars[0] && bars[0].adjustmentStatus) || null,
    provider: payload.provider || null,
    dataSourceId: (bars[0] && bars[0].dataSourceId) || null,
    from: bars[0].date || null, to: bars[bars.length - 1].date || null
  };
}

function main() {
  const universe = productUniverse();
  const counters = {
    CANONICAL_PRODUCT_UNIVERSE: universe.securities.length,
    CANONICAL_HISTORY_UNIVERSE: 0,
    RAW_CLOSE_AVAILABLE: 0,
    SPLIT_FACTOR_AVAILABLE: 0,
    DIVIDEND_COLUMN_AVAILABLE: 0,
    DIVIDEND_EVENTS_AVAILABLE: 0,
    ADJUSTED_CLOSE_AVAILABLE: 0,
    TRADING_DATES_AVAILABLE: 0,
    ADJUSTMENT_STATUS_PRESENT: 0,
    RETURN_BASIS_IDENTIFIABLE_UNIVERSE: 0
  };
  const bySource = {};
  const byAdjustmentStatus = {};
  const exclusions = {};
  const bySector = {};
  const rows = [];

  for (const security of universe.securities) {
    const found = readSeries(security.securityId);
    if (!found) { exclusions.NO_SERIES = (exclusions.NO_SERIES || 0) + 1; continue; }
    bySource[found.source] = (bySource[found.source] || 0) + 1;
    const audit = auditSeries(found.payload);
    if (!audit) { exclusions.EMPTY_SERIES = (exclusions.EMPTY_SERIES || 0) + 1; continue; }

    counters.CANONICAL_HISTORY_UNIVERSE += 1;
    byAdjustmentStatus[audit.adjustmentStatus || "(none)"] =
      (byAdjustmentStatus[audit.adjustmentStatus || "(none)"] || 0) + 1;

    /* Eine Spalte gilt als vorhanden, wenn sie ueber die GANZE Reihe
       traegt, nicht wenn sie irgendwo auftaucht - eine Luecke mitten in
       der Historie macht die Reihe fuer eine Return-Basis unbrauchbar. */
    const full = (n) => n === audit.bars;
    if (full(audit.rawClose)) counters.RAW_CLOSE_AVAILABLE += 1;
    if (full(audit.adjustedClose)) counters.ADJUSTED_CLOSE_AVAILABLE += 1;
    if (full(audit.splitFactor)) counters.SPLIT_FACTOR_AVAILABLE += 1;
    if (full(audit.dividendColumn)) counters.DIVIDEND_COLUMN_AVAILABLE += 1;
    if (audit.dividendEvents > 0) counters.DIVIDEND_EVENTS_AVAILABLE += 1;
    if (full(audit.dates)) counters.TRADING_DATES_AVAILABLE += 1;
    if (audit.adjustmentStatus) counters.ADJUSTMENT_STATUS_PRESENT += 1;

    /* BEIDE Basen baubar heisst: eine splitbereinigte Reihe (aus close +
       splitFactor) UND eine Gesamtrendite-Reihe (adjustedClose, deren
       Total-Return-Eigenschaft verifiziert ist). Fehlt eines davon, ist
       der Titel fuer den Vergleich ungeeignet - mit benanntem Grund. */
    const missing = [];
    if (!full(audit.rawClose)) missing.push("RAW_CLOSE");
    if (!full(audit.splitFactor)) missing.push("SPLIT_FACTOR");
    if (!full(audit.adjustedClose)) missing.push("ADJUSTED_CLOSE");
    if (!full(audit.dates)) missing.push("TRADING_DATES");
    if (!audit.adjustmentStatus) missing.push("ADJUSTMENT_STATUS");
    if (missing.length) {
      const key = missing.join("+");
      exclusions[key] = (exclusions[key] || 0) + 1;
    } else {
      counters.RETURN_BASIS_IDENTIFIABLE_UNIVERSE += 1;
      const sector = security.sector || "(unclassified)";
      bySector[sector] = (bySector[sector] || 0) + 1;
      rows.push({ securityId: security.securityId, ticker: security.ticker, sector,
        bars: audit.bars, from: audit.from, to: audit.to,
        dividendEvents: audit.dividendEvents, splitEvents: audit.splitEvents,
        adjustmentStatus: audit.adjustmentStatus, source: found.source });
    }
  }

  const storeSeen = bySource.CANONICAL_STORE || 0;
  const report = {
    schemaVersion: "return-basis-input-audit-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    versions: { audit_logic: "1.0.0" },
    universeFile: universe.file,
    barsDir: BARS_DIR.replace(ROOT, "."),
    /* Ohne den kanonischen Store ist dieser Lauf kein Universumsaudit,
       sondern eine Messung an fuenf Titeln. Das steht im Bericht, damit
       ihn niemand als das eine liest, wenn er das andere ist. */
    scope: storeSeen > 0 ? "CANONICAL_HISTORY" : "REPOSITORY_ONLY",
    scopeNote: storeSeen > 0
      ? "Gelesen wurde der wiederhergestellte kanonische Barstore."
      : "Der kanonische Barstore war nicht verfuegbar. Gemessen wurde ausschliesslich, was im Repository liegt - das sind die fuenf Golden-Preview-Reihen. Dieser Lauf ist KEIN Universumsaudit und darf nicht als einer gelesen werden.",
    counters,
    bySource,
    byAdjustmentStatus,
    exclusions,
    identifiableBySector: bySector,
    series: rows
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");

  process.stdout.write("FULL-UNIVERSE RETURN-BASIS AUDIT · Schritt 1 Inputs\n");
  process.stdout.write("  Bestand: " + report.scope + "\n");
  for (const [key, value] of Object.entries(counters)) {
    process.stdout.write("  " + key.padEnd(38) + String(value).padStart(6) + "\n");
  }
  process.stdout.write("  Quellen: " + JSON.stringify(bySource) + "\n");
  process.stdout.write("  adjustmentStatus: " + JSON.stringify(byAdjustmentStatus) + "\n");
  const top = Object.entries(exclusions).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    process.stdout.write("  Ausschluesse:\n");
    for (const [reason, count] of top) process.stdout.write("    " + String(count).padStart(6) + "  " + reason + "\n");
  }
  process.stdout.write("  Bericht: " + OUT.replace(ROOT, ".") + "\n");
}

main();
