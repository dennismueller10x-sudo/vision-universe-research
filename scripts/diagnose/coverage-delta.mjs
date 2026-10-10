#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/diagnose/coverage-delta.mjs
   WARUM HAT SICH DIE DECKUNG GEAENDERT? JE TITEL, NICHT ALS SUMME.

   Eine neue Deckungsmessung ersetzt einen abgenommenen Stand. Das ist
   nur zulaessig, wenn jede Abweichung einen belegten Grund hat ("KEIN
   neuer Nenner ohne geklaerte Ursache", reconciliation.py §4). Dieses
   Werkzeug vergleicht die frische Messung (coverage-metrics.json, mit
   Namenslisten) mit dem Bezugsstand und ordnet JEDEN geaenderten Titel
   einer Klasse zu:

     Technik (>= 300 Bars)
       DEBT_EXCLUDED          Titel ist als Schuldverschreibung aus dem
                              Produkt genommen (eligibility.json)
       POLICY_EXCLUDED        anders begruendet ausgeschlossen (Grund im
                              Wertpapierstamm, product_eligibility_reason)
       LISTING_CUT            Reihe wurde auf das juengste Listing
                              gekuerzt (listing-continuity-v1.json, #367)
       AGED_PAST_THRESHOLD    junge Reihe: am Bezugstag < 300 Bars, heute
                              >= 300 (aus der Reihe selbst gezaehlt)
       NEW_PRODUCT_MEMBER     Titel ist neu im Produktuniversum
       UNEXPLAINED            alles andere -> Exit 1
     Chart (>= 2 Bars)
       NEW_BARS_SINCE_REFERENCE  am Bezugstag < 2 Bars, heute >= 2
       NEW_LISTING_BACKFILLED    junges Listing (Beginn laut Wertpapierstamm
                              <= 30 Tage vor dem Bezug, Reihe beginnt genau
                              dort): die Messung am Bezugstag sah < 2 Bars,
                              die fruehen Kerzen wurden danach nachgeladen
       LISTING_CUT / DEBT_EXCLUDED / UNEXPLAINED wie oben

   Bezug Technik: der technische Skalierungsbericht (perSymbol fuehrt
   alles ausser TECHNICAL_READY, mit Barzahl), Stichtag = sein Datum.
   Bezug Chart: die committete coverage-metrics.json (git HEAD).

   Lesend: ein GET auf den R2-Index, ein GET je geaendertem Titel. Kein
   Schreiben, keine Kursabfrage beim Anbieter.

   node scripts/diagnose/coverage-delta.mjs [--local-root <dir>] [--report-only]
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

export const TECH_MIN = 300, CHART_MIN = 2;

/* Reine Klassifikation - ohne Speicher testbar.
   input: { productNow:Set, productBefore:Set, debt:Set, cut:Map(t->row),
            techShortNow:Set, techShortBefore:Set, techBaseDate,
            chartShortNow:Set, chartShortBefore:Set, chartBaseDate,
            barsBefore:(t,date)=>number|null,    (Bars mit Datum < date)
            listingStart:(t)=>string|null, seriesFirst:(t)=>string|null } */
export const BACKFILL_WINDOW_DAYS = 30;
const tageZwischen = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
export function classify(input) {
  const out = { technical: [], chart: [] };
  const why = (t, kind, wasShort, nowShort, baseDate, min) => {
    if (!input.productNow.has(t)) return input.debt.has(t) ? "DEBT_EXCLUDED"
      : (input.excludedReason && input.excludedReason.get(t)) ? "POLICY_EXCLUDED" : "UNEXPLAINED";
    if (!input.productBefore.has(t)) return "NEW_PRODUCT_MEMBER";
    if (!wasShort && nowShort) return input.cut.has(t) ? "LISTING_CUT" : "UNEXPLAINED";
    if (wasShort && !nowShort) {
      const b = input.barsBefore(t, baseDate);
      if (b === null || b === undefined) return "UNEXPLAINED";
      if (b < min) return kind === "technical" ? "AGED_PAST_THRESHOLD" : "NEW_BARS_SINCE_REFERENCE";
      const start = input.listingStart ? input.listingStart(t) : null;
      const first = input.seriesFirst ? input.seriesFirst(t) : null;
      if (kind === "chart" && start && first === start && tageZwischen(start, baseDate) >= 0 &&
          tageZwischen(start, baseDate) <= BACKFILL_WINDOW_DAYS) return "NEW_LISTING_BACKFILLED";
      return "UNEXPLAINED";
    }
    return null;
  };
  const alle = new Set([...input.productNow, ...input.productBefore]);
  for (const t of [...alle].sort()) {
    const tw = why(t, "technical", input.techShortBefore.has(t), input.techShortNow.has(t), input.techBaseDate, TECH_MIN);
    const inBoth = input.productNow.has(t) && input.productBefore.has(t);
    const techChanged = !inBoth || input.techShortBefore.has(t) !== input.techShortNow.has(t);
    if (techChanged && tw) out.technical.push({ ticker: t, cls: tw, before: input.techShortBefore.has(t) ? "SHORT" : "READY",
      now: input.productNow.has(t) ? (input.techShortNow.has(t) ? "SHORT" : "READY") : "OUT" });
    const chartChanged = !inBoth || input.chartShortBefore.has(t) !== input.chartShortNow.has(t);
    if (chartChanged) {
      const cw = why(t, "chart", input.chartShortBefore.has(t), input.chartShortNow.has(t), input.chartBaseDate, CHART_MIN);
      if (cw) out.chart.push({ ticker: t, cls: cw, before: input.chartShortBefore.has(t) ? "SHORT" : "OK",
        now: input.productNow.has(t) ? (input.chartShortNow.has(t) ? "SHORT" : "OK") : "OUT" });
    }
  }
  return out;
}

/* Bilanz: Bezug - Abgaenge + Zugaenge muss die neue Zahl ergeben. */
export function balance(rows, beforeOk, nowOk) {
  let net = 0;
  for (const r of rows) {
    const b = r.before === "READY" || r.before === "OK", n = r.now === "READY" || r.now === "OK";
    if (r.before !== "OUT" && b && !n) net--;
    if (r.now !== "OUT" && !b && n) net++;
  }
  return { before: beforeOk, net, expected: beforeOk + net, now: nowOk, closes: beforeOk + net === nowOk };
}

/* Der Bezugsstand.
   NAMED: die committete Messung fuehrt ihre Ausnahmen namentlich (ab der
     Neuabnahme 04.10.2026). Dann ist SIE der Bezug - mit dem
     Produktuniversum aus der eligibility.json desselben Commits. Passt deren
     Groesse nicht zum Nenner der Messung, ist der Bezug nicht bestimmbar.
   LEGACY_0920: erster Uebergang. Die Messung vom 20.09. fuehrt die
     technischen Ausnahmen nicht namentlich; Bezug ist der technische
     Skalierungsbericht, und das Produktuniversum von damals ist das heutige
     plus die seither als DEBT herausgenommenen Titel (#366). */
const ausgeschlossen = (e) => new Map(e.decisions.filter((d) => d.product_eligibility === "EXCLUDED" && d.product_eligibility_reason)
  .map((d) => [d.ticker.toUpperCase(), d.product_eligibility_reason]));
/* Wurde der Wertpapierstamm NACH der Messung neu beurteilt (z. B. Verzeichnisbeleg
   exchange-directory-class-1.0.0), traegt HEAD schon das neue Universum. Das
   Universum der Messung entsteht dann, indem jede protokollierte Aenderung
   (eligibility-reconciliation.json#changes) mit Zeitpunkt nach der Messung
   zurueckgenommen wird. Es gilt nur, wenn es den Nenner der Messung genau trifft. */
export function universumZurMessung(productHead, changes, measuredAt) {
  const u = new Set(productHead);
  let undone = 0;
  for (const c of changes || []) {
    if (!(c && c.at && measuredAt && String(c.at) > String(measuredAt))) continue;
    const t = String(c.ticker).toUpperCase();
    if (c.from.productEligibility !== "EXCLUDED") u.add(t); else u.delete(t);
    undone++;
  }
  return { universe: u, undone };
}
export function bezug({ before, eligNow, eligHead, scale, reconciliation = null }) {
  const product = (e) => new Set(e.decisions.filter((d) => d.product_eligibility !== "EXCLUDED").map((d) => d.ticker.toUpperCase()));
  const productNow = product(eligNow);
  const debt = new Set(eligNow.decisions.filter((d) => d.instrument_type === "DEBT" && d.product_eligibility === "EXCLUDED").map((d) => d.ticker.toUpperCase()));
  const T = before.TECHNICAL_HISTORY_ELIGIBILITY || {};
  if (Array.isArray(T.tooShortSymbols)) {
    if (!eligHead) throw new Error("eligibility.json des Bezugs-Commits nicht lesbar");
    let productBefore = product(eligHead), rejudged = 0;
    if (productBefore.size !== before.CHART_AVAILABILITY.denominator && reconciliation) {
      const z = universumZurMessung(productBefore, reconciliation.changes, before.generatedAt);
      if (z.undone > 0 && z.universe.size === before.CHART_AVAILABILITY.denominator) { productBefore = z.universe; rejudged = z.undone; }
    }
    if (productBefore.size !== before.CHART_AVAILABILITY.denominator)
      throw new Error(`Produktuniversum des Bezugs (${productBefore.size}) passt nicht zum Nenner der Messung (${before.CHART_AVAILABILITY.denominator})`);
    return { mode: "NAMED", rejudged, productNow, productBefore, debt, excludedReason: ausgeschlossen(eligNow),
      techShortBefore: new Set(T.tooShortSymbols.map((x) => x.toUpperCase())), techBaseDate: before.today, techBeforeOk: T.eligible };
  }
  const productBefore = new Set([...productNow, ...debt]);
  const techShortBefore = new Set(Object.entries(scale.perSymbol || {})
    .filter(([, r]) => r.technical && r.technical !== "TECHNICAL_READY").map(([t]) => t.toUpperCase()));
  return { mode: "LEGACY_0920", productNow, productBefore, debt, excludedReason: ausgeschlossen(eligNow), techShortBefore,
    techBaseDate: String(scale.generatedAt).slice(0, 10),
    techBeforeOk: [...productBefore].filter((t) => !techShortBefore.has(t)).length };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const reportOnly = argv.includes("--report-only");

  const now = read("quant/data/market/history/coverage-metrics.json");
  const T = now.TECHNICAL_HISTORY_ELIGIBILITY || {};
  if (!Array.isArray(T.tooShortSymbols)) {
    console.error("coverage-metrics.json fuehrt keine tooShortSymbols - erst build-coverage-metrics.mjs.");
    process.exit(2);
  }
  let before;
  try { before = JSON.parse(execFileSync("git", ["show", "HEAD:quant/data/market/history/coverage-metrics.json"], { cwd: root, maxBuffer: 1 << 26 }).toString()); }
  catch { console.error("Bezugsstand (git HEAD) nicht lesbar."); process.exit(2); }

  const elig = read("quant/data/market/security-master/eligibility.json");
  let eligHead = null;
  try { eligHead = JSON.parse(execFileSync("git", ["show", "HEAD:quant/data/market/security-master/eligibility.json"], { cwd: root, maxBuffer: 1 << 27 }).toString()); }
  catch { eligHead = null; }
  let reconHead = null;
  try { reconHead = JSON.parse(execFileSync("git", ["show", "HEAD:quant/data/market/security-master/eligibility-reconciliation.json"], { cwd: root, maxBuffer: 1 << 26 }).toString()); }
  catch { reconHead = null; }
  const tech = read("quant/data/technical/scale/technical-coverage-ELIGIBLE_US_EQUITY.json");
  let b;
  try { b = bezug({ before, eligNow: elig, eligHead, scale: tech, reconciliation: reconHead }); }
  catch (e) { console.error("Bezug nicht bestimmbar: " + e.message); process.exit(1); }
  const { productNow, productBefore, debt, excludedReason, techShortBefore, techBaseDate } = b;
  console.log(`  Bezug: ${b.mode}` + (b.rejudged ? ` (Universum der Messung: ${b.rejudged} spaetere Neubeurteilungen zurueckgenommen)` : ""));

  const lc = read("quant/data/market/listing-continuity-v1.json");
  const cut = new Map((lc.productUniverse && lc.productUniverse.rows || []).map((r) => [String(r[1]).toUpperCase(), r]));

  const techShortNow = new Set(T.tooShortSymbols.map((s) => s.toUpperCase()));
  const chartShortNow = new Set((now.CHART_AVAILABILITY.notRenderableSymbols || []).map((s) => s.toUpperCase()));
  const chartShortBefore = new Set((before.CHART_AVAILABILITY.notRenderableSymbols || []).map((s) => s.toUpperCase()));
  const chartBaseDate = before.today;

  /* Erst ohne Speicher klassifizieren, um die Titel zu finden, die eine
     Zaehlung aus der Reihe brauchen - nur fuer die wird gelesen. */
  const needs = new Set();
  classify({ productNow, productBefore, debt, excludedReason, cut, techShortNow, techShortBefore, techBaseDate,
    chartShortNow, chartShortBefore, chartBaseDate, barsBefore: (t) => { needs.add(t); return null; } });

  const series = new Map();
  if (needs.size) {
    const Store = require(join(root, "quant", "engines", "history-store.js"));
    const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
    const budget = Guard.createBudget({ classAOperations: 0, classBOperations: needs.size + 10 });
    const localRoot = arg("--local-root");
    const driver = localRoot
      ? (await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"))).createFsDriver(localRoot)
      : (await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"))).createS3DriverFromEnv();
    const store = Store.createHistoryStore({ driver, provider: "tiingo", market: "US", budget });
    for (const t of [...needs].sort()) {
      const s = await store.getSeries(t);
      series.set(t, s ? s.bars.map((b) => String(b.date || b.d || b[0]).slice(0, 10)) : null);
    }
  }
  const barsBefore = (t, date) => { const d = series.get(t); return d ? d.filter((x) => x < date).length : null; };
  const startByTicker = new Map(elig.decisions.map((d) => [d.ticker.toUpperCase(), d.start_date || null]));
  const listingStart = (t) => startByTicker.get(t) || null;
  const seriesFirst = (t) => { const d = series.get(t); return d && d.length ? d[0] : null; };

  const res = classify({ productNow, productBefore, debt, excludedReason, cut, techShortNow, techShortBefore, techBaseDate,
    chartShortNow, chartShortBefore, chartBaseDate, barsBefore, listingStart, seriesFirst });

  const count = (rows) => rows.reduce((a, r) => ((a[r.cls] = (a[r.cls] || 0) + 1), a), {});
  const techBeforeOk = b.techBeforeOk;
  const chartBeforeOk = before.CHART_AVAILABILITY.renderable;
  const tb = balance(res.technical, techBeforeOk, T.eligible);
  const cb = balance(res.chart, chartBeforeOk, now.CHART_AVAILABILITY.renderable);

  console.log(`VISION UNIVERSE — Deckungsabweichung je Titel (Bezug Technik ${techBaseDate}, Chart ${chartBaseDate})\n`);
  console.log("  Technik  " + JSON.stringify(count(res.technical)));
  console.log(`           Bilanz ${tb.before} ${tb.net >= 0 ? "+" : ""}${tb.net} = ${tb.expected}  gemessen ${tb.now}  ${tb.closes ? "GEHT AUF" : "GEHT NICHT AUF"}`);
  console.log("  Chart    " + JSON.stringify(count(res.chart)));
  console.log(`           Bilanz ${cb.before} ${cb.net >= 0 ? "+" : ""}${cb.net} = ${cb.expected}  gemessen ${cb.now}  ${cb.closes ? "GEHT AUF" : "GEHT NICHT AUF"}\n`);
  for (const [name, rows] of [["TECHNIK", res.technical], ["CHART", res.chart]]) {
    for (const r of rows) {
      const c = cut.get(r.ticker);
      const d = series.get(r.ticker);
      const extra = r.cls === "LISTING_CUT" && c ? ` gekuerzt ab ${c[5]} (-${c[3]} Bars)` :
        series.has(r.ticker) ? (d ? ` Bars am Bezug ${barsBefore(r.ticker, name === "TECHNIK" ? techBaseDate : chartBaseDate)}, ` +
          `heute ${d.length}, Reihe ${d[0] || "-"} .. ${d[d.length - 1] || "-"}` : " Reihe in der Ablage nicht lesbar") : "";
      console.log(`  ${name.padEnd(7)} ${r.ticker.padEnd(8)} ${r.before.padEnd(5)} -> ${r.now.padEnd(5)} ${r.cls}${extra}`);
    }
  }
  const offen = [...res.technical, ...res.chart].filter((r) => r.cls === "UNEXPLAINED").length;
  const ok = offen === 0 && tb.closes && cb.closes;
  console.log(`\n  ERGEBNIS: ${ok ? "jede Abweichung erklaert" : offen + " unerklaert" + (tb.closes && cb.closes ? "" : ", Bilanz geht nicht auf")}`);
  if (!ok && !reportOnly) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(2); });
}
