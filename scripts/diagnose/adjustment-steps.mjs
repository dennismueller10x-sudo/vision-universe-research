/* Diagnose: warum sperrt die Qualitaetspruefung eine Reihe mit
   unexplained_adjustment_step? (quant/engines/market-quality.js)

   Liest die Tagesreihen der genannten Titel NUR LESEND aus der dauerhaften
   Ablage (R2, wie sync-history-store --pull) oder aus einem lokalen
   Verzeichnis, rechnet die Pruefung mit derselben Engine nach und legt
   jeden Faktorsprung offen: Datum, Rohkurs, bereinigter Kurs, Faktor
   (adjClose/close) vorher/nachher, Sprungverhaeltnis, gemeldeter Split und
   Dividende - und welche Dividende den Sprung erklaeren wuerde.

   Keine Sonderregel fuer einzelne Titel, keine Schreibvorgaenge.

   Aufruf:
     node scripts/diagnose/adjustment-steps.mjs --tickers LOGI,AAPL [--local-root DIR] [--out FILE]
*/
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Store = require(join(root, "quant", "engines", "history-store.js"));
const Guard = require(join(root, "quant", "engines", "zero-cost-guard.js"));
const MQ = require(join(root, "quant", "engines", "market-quality.js"));

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
import { readFileSync } from "node:fs";
/* --blocked: alle Titel, die der letzte Faktorlauf mit unexplained_adjustment_step gesperrt hat. */
function blockedTickers() {
  const acc = new Set();
  const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") {
    if (o.message === "unexplained_adjustment_step" && o.ticker) acc.add(o.ticker); Object.values(o).forEach(walk); } };
  walk(JSON.parse(readFileSync(join(root, "quant", "data", "market", "factors", "factors-FULL_UNIVERSE-summary.json"), "utf8")));
  return [...acc].sort();
}

let TICKERS = [];
const r = (v, d = 6) => (typeof v === "number" && isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/** Reine Auswertung einer Reihe: jeder Faktorsprung mit Einordnung. */
export function explainSteps(bars, { tolerance = 0.002, context = 3 } = {}) {
  const steps = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1], c = bars[i];
    if (!(p.close > 0 && p.adjustedClose > 0 && c.close > 0 && c.adjustedClose > 0)) continue;
    const fp = p.adjustedClose / p.close, fc = c.adjustedClose / c.close, step = fc / fp;
    if (Math.abs(step - 1) <= tolerance) continue;
    const split = typeof c.splitFactor === "number" && Math.abs(c.splitFactor - 1) > 1e-9 ? c.splitFactor : null;
    const div = typeof c.dividend === "number" && c.dividend > 0 ? c.dividend : null;
    // Tiingo-Konvention: step = splitFactor * (1 + div/close_ex). Welche Dividende erklaerte den Sprung?
    const impliedDividend = (step / (split || 1) - 1) * c.close;
    steps.push({
      date: c.date, prevDate: p.date,
      close: [p.close, c.close], adjustedClose: [p.adjustedClose, c.adjustedClose],
      factor: [r(fp, 8), r(fc, 8)], step: r(step, 8), stepPct: r((step - 1) * 100, 4),
      reportedSplit: split, reportedDividend: div,
      impliedDividendAtExClose: r(impliedDividend, 4),
      impliedYieldPct: r((impliedDividend / c.close) * 100, 4),
      explained: !!(split || div),
      context: bars.slice(Math.max(0, i - context), Math.min(bars.length, i + context + 1))
        .map((b) => ({ date: b.date, close: b.close, adjustedClose: b.adjustedClose, dividend: b.dividend ?? null, splitFactor: b.splitFactor ?? null }))
    });
  }
  return steps;
}

/** Einordnung eines unerklaerten Sprungs gegen die gemeldeten Dividenden. */
export function classifyStep(step, bars, { window = 3, tolerance = 0.15 } = {}) {
  const i = bars.findIndex((b) => b.date === step.date);
  // Naechstgelegene passende Dividende (nicht die erste im Fenster).
  const near = [];
  for (let k = Math.max(0, i - window); k <= Math.min(bars.length - 1, i + window); k++)
    if (k !== i && bars[k].dividend > 0) near.push({ b: bars[k], d: Math.abs(k - i) });
  near.sort((a, b) => a.d - b.d);
  const hit = near.find((x) => Math.abs(x.b.dividend / step.impliedDividendAtExClose - 1) <= tolerance);
  const match = hit ? hit.b : null;
  // Wiederkehrendes Muster: in frueheren Jahren zwei Dividenden an benachbarten Handelstagen.
  const divIdx = bars.map((b, k) => (b.dividend > 0 ? k : -1)).filter((k) => k >= 0);
  const pairs = [];
  for (let k = 1; k < divIdx.length; k++) if (divIdx[k] - divIdx[k - 1] === 1) pairs.push([bars[divIdx[k - 1]].date, bars[divIdx[k]].date]);
  if (match) return { kind: pairs.length ? "DUPLICATED_DIVIDEND_ADJUSTMENT" : "DIVIDEND_ADJUSTMENT_WITHOUT_DIVCASH",
    matchedDividend: { date: match.date, amount: match.dividend }, consecutiveDividendPairs: pairs };
  return { kind: "UNEXPLAINED", consecutiveDividendPairs: pairs };
}

async function makeStore() {
  const budget = Guard.createBudget({ classAOperations: 0, classBOperations: TICKERS.length });
  const local = arg("--local-root");
  if (local) {
    const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));
    return Store.createHistoryStore({ driver: createFsDriver(local), provider: "tiingo", market: "US", budget });
  }
  const { createS3DriverFromEnv } = await import(join(root, "scripts", "market", "storage", "s3-driver.mjs"));
  return Store.createHistoryStore({ driver: createS3DriverFromEnv(), provider: "tiingo", market: "US", budget });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  TICKERS = (argv.includes("--blocked") ? blockedTickers() : String(arg("--tickers", "")).split(","))
    .map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!TICKERS.length || TICKERS.some((t) => !/^[A-Z0-9.\-]{1,12}$/.test(t))) { console.error("--tickers A,B,C"); process.exit(2); }
  const store = await makeStore();
  const report = { generatedAt: new Date().toISOString(), tickers: {} };
  for (const t of TICKERS) {
    const doc = await store.getSeries(t);
    if (!doc) { report.tickers[t] = { state: "NOT_IN_STORE" }; console.log(`${t}: nicht in der Ablage`); continue; }
    const bars = doc.bars;
    const verdict = MQ.validateAdjustmentConsistency(bars, { claimedStatus: doc.adjustmentStatus, dividendConvention: "TIINGO_REINVESTMENT_CLOSE" });
    const steps = explainSteps(bars);
    const divs = bars.filter((b) => b.dividend > 0).map((b) => ({ date: b.date, dividend: b.dividend, close: b.close }));
    report.tickers[t] = {
      state: "READ", first: doc.first, last: doc.last, barCount: doc.barCount, adjustmentStatus: doc.adjustmentStatus,
      findings: verdict.findings, dividendsReported: divs, splitsReported: bars.filter((b) => b.splitFactor && b.splitFactor !== 1).map((b) => ({ date: b.date, splitFactor: b.splitFactor })),
      unexplainedSteps: steps.filter((s) => !s.explained).map((s) => ({ ...s, classification: classifyStep(s, bars) })),
      explainedSteps: steps.filter((s) => s.explained).length
    };
    console.log(`\n== ${t} (${doc.first} .. ${doc.last}, ${doc.barCount} Bars)`);
    console.log(`Befunde: ${verdict.findings.filter((f) => f.severity === "error").map((f) => f.code + "@" + (f.details && f.details.date || "")).join(", ") || "keine Fehler"}`);
    console.log(`Gemeldete Dividenden: ${divs.map((d) => d.date + " " + d.dividend).join(" | ") || "keine"}`);
    for (const s of steps.filter((x) => !x.explained).slice(-3)) {
      const cl = classifyStep(s, bars);
      console.log(`EINORDNUNG ${cl.kind}${cl.matchedDividend ? " (passt zu Dividende " + cl.matchedDividend.amount + " am " + cl.matchedDividend.date + ")" : ""}; Dividendenpaare an Folgetagen: ${cl.consecutiveDividendPairs.map((p) => p.join("/")).join(", ") || "keine"}`);
      console.log(`UNERKLAERT ${s.prevDate} -> ${s.date}: close ${s.close.join(" -> ")}, adj ${s.adjustedClose.join(" -> ")}, Faktor ${s.factor.join(" -> ")}, Sprung ${s.stepPct} %, entspraeche Dividende ${s.impliedDividendAtExClose} (${s.impliedYieldPct} %)`);
      for (const b of s.context) console.log(`   ${b.date}  close=${b.close}  adj=${b.adjustedClose}  div=${b.dividend}  split=${b.splitFactor}`);
    }
  }
  const kinds = {};
  for (const [t, v] of Object.entries(report.tickers)) for (const s of v.unexplainedSteps || []) (kinds[s.classification.kind] = kinds[s.classification.kind] || []).push(t + "@" + s.date);
  report.summary = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { count: v.length, steps: v }]));
  console.log("\nJE TITEL (Titel | Reihe | gemeldete Dividenden | unerklaerte Spruenge | Einordnung | erster..letzter | Median-Sprung %)");
  for (const [t, v] of Object.entries(report.tickers)) {
    const u = v.unexplainedSteps || [];
    const k = {}; u.forEach((s) => { k[s.classification.kind] = (k[s.classification.kind] || 0) + 1; });
    const y = u.map((s) => s.stepPct).sort((a, b) => a - b);
    console.log(`TITEL ${t} | ${v.first || "-"}..${v.last || "-"} | ${(v.dividendsReported || []).length} | ${u.length} | ${JSON.stringify(k)} | ${u[0] ? u[0].date : "-"}..${u.length ? u[u.length - 1].date : "-"} | ${y.length ? y[Math.floor(y.length / 2)] : "-"}`);
  }
  console.log("\nZUSAMMENFASSUNG " + JSON.stringify(Object.fromEntries(Object.entries(report.summary).map(([k, v]) => [k, v.count]))));
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
}
