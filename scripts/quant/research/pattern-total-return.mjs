#!/usr/bin/env node
// Musterstudie in Gesamtrendite neben Kursrendite (P4.1, pattern-total-return-1.0.0). Nur Research.
//
// Was: eine registrierte PATTERN_EVIDENCE-Vorlage (Muster, Horizont, Abstand, Kosten unveraendert) wird zweimal mit
// derselben Engine gerechnet (quant/engines/research-studies.cjs#runPatternStudy, unveraendert):
//   vorher   returnBasis PRICE_RETURN  - split-bereinigte Wochenschluesse (ADR-002), wie der Runner
//   nachher  returnBasis TOTAL_RETURN  - dieselben Balken, je Woche zusaetzlich returnLevel aus der kanonischen
//            Gesamtrendite (quant/engines/canonical-total-return.js, canonical-total-return-1.0.0, ueber
//            scripts/quant/lib/daily-prices.mjs#dailyOf) als Wert des letzten Handelstags der Woche
//            (scripts/quant/lib/weekly-total-return.mjs, weekly-total-return-1.0.0)
// Das Muster selbst bleibt auf Kursen definiert (Merkmale aus close); nur die Ergebnisrendite wechselt die Basis.
// Titel ohne bestaetigte Gesamtrendite (keine Tagesreihe mit Ausschuettungen, oder die Rekonstruktion lehnt ab) werden
// aus BEIDEN Laeufen ausgeschlossen und mit Grund ausgewiesen, damit die Differenz nur die Renditebasis misst.
// Benchmark: keiner (SPY liegt oeffentlich nur als Kursrendite vor; die Engine verbietet gemischte Basen,
// BENCHMARK_BASIS_MISMATCH). Der Vergleich gegen Kontrollen vom selben Datum (matchedExcess) bleibt basisgleich.
// Paritaet: der vorher-Lauf dieses Skripts wird gegen den unveraenderten Runner (backtest-runner.cjs, gleiche Spec)
// Ereignis fuer Ereignis geprueft; jede Abweichung bricht ab (der Pfad rechnet dann nicht dasselbe wie der Runner).
//
// Quellen der Tagesreihen (dailyOf): --work-dir <dir> (kanonische Historie der Pipeline, privat, tiingo/daily/<id>.json),
// sonst quant/data/market/golden-preview/daily (oeffentlich, fuenf Titel ab 2015-01-02). Kein Anbieterabruf.
// Kein Produktartefakt, keine Zahl im Produkt, keine Wirkung auf das Gate returnBasis (P4.2 = Owner-Freigabe FV-5).
//
//   node scripts/quant/research/pattern-total-return.mjs --out <bericht.json>
//        [--template pattern-2015-sideways] [--tickers AAPL,JPM,...] [--from JJJJ-MM-TT] [--to JJJJ-MM-TT] [--work-dir <dir>]
// Ohne --tickers: die Titel der oeffentlichen Golden-Preview (bzw. alle Titel der Vorlage mit --work-dir).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dailyOf } from "../lib/daily-prices.mjs";
import { weekKey, weeklyFromDaily, WEEKLY_TOTAL_RETURN_VERSION } from "../lib/weekly-total-return.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const R = require("./backtest-runner.cjs");
const B = require("./backtest-spec-builder.cjs");
const S = require("../../../quant/engines/research-studies.cjs");
const Identity = require("../../../core/identity.js");
const CTR = require("../../../quant/engines/canonical-total-return.js");

export const VERSION = "pattern-total-return-1.0.0";
export const DEFAULT_TEMPLATE = "pattern-2015-sideways";
export const GOLDEN_DIR = "quant/data/market/golden-preview/daily";
export const DEFAULT_WINDOW = Object.freeze({ from: "2015-01-01", to: "2025-06-30" }); // Golden-Preview ab 2015-01-02; 13-Wochen-Ausgaenge bis asOf 2025-12-31 reif
const GENERATED = ["quant/data", "discover/data", "supertrader/data", "social/data"];
const DAY_END = "T23:59:59.999Z";

const fail = (code, detail) => { const e = new Error(code + (detail !== undefined ? ":" + detail : "")); e.code = code; throw e; };
const sha = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : R.canonical(x)).digest("hex");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* Wie backtest-runner.cjs (micOfDoc, engineListing, truncate, studyBase): dieselben Eingaben, nur returnLevel kommt hinzu. */
function micOfDoc(doc) {
  if (doc.mic) return doc.mic;
  if (doc.identityEvidenceBinding) return ["XNAS", "XNYS", "XASE"].includes(doc.identityEvidenceBinding.mic) ? doc.identityEvidenceBinding.mic : null;
  return ({ NASDAQ: "XNAS", NYSE: "XNYS", AMEX: "XASE", "NYSE MKT": "XASE" })[String(doc.listingId).split(":")[1]] || null;
}
function engineListing(securityId, d, levels) {
  const lc = d.listingLifecycle || null, validTo = lc && lc.lastTradeDate ? lc.lastTradeDate : null;
  const identity = { mic: micOfDoc(d), instrumentClass: "COMMON_STOCK", primary: true, validFrom: d.listingStart, availableAt: d.masterGeneratedAt || d.asOf + "T00:00:00Z", sourceHash: d.identityHash };
  if (validTo) identity.validTo = validTo;
  const bars = d.points.filter(([date]) => !validTo || date <= validTo).map(([date, close]) => {
    const b = { date, close };
    if (levels) { const v = levels.get(date); if (v > 0) b.returnLevel = v; }
    return b;
  });
  return { listingId: d.listingId, issuerId: securityId, securityId, identity, bars };
}
function studyInput(spec, calendar, listings, returnBasis) {
  return { asOf: spec.asOf, sourceMode: "HISTORICAL_SIMULATION", cohortMode: "CONDITIONAL_CURRENT_CLASSIFICATION", executionClock: "OBSERVED_WEEKLY_DATES", returnBasis, currency: "USD",
    registration: { id: spec.id, version: spec.version || "1.0.0", frozenAt: spec.registeredAt, analysisMode: "EXPLORATORY" }, entryDelayBars: 1,
    costs: { basis: "PER_SIDE_NOTIONAL", feeBps: spec.costs.feeBps, slippageBps: spec.costs.slippageBps }, expectedCalendar: calendar,
    listings, horizonBars: spec.engine.horizonBars, pattern: spec.engine.pattern, cooldownBars: spec.engine.cooldownBars };
}

/** Wochenwerte der kanonischen Gesamtrendite auf den Wochenkalender der Studie (letzter Handelstag je Woche). */
export function weeklyLevels(daily, calendar, field = "tr") {
  const idx = new Map(calendar.map((d, i) => [weekKey(d), i]));
  const w = weeklyFromDaily(daily.dates, daily[field], idx, calendar.length);
  const out = new Map();
  for (let i = 0; i < calendar.length; i++) if (w[i] > 0) out.set(calendar[i], w[i]);
  return out;
}

function summarize(res) {
  const ev = res.events, obs = ev.filter((e) => e.state === "OBSERVED"), net = obs.map((e) => e.netReturn);
  const matched = obs.map((e) => e.matchedExcess).filter(Number.isFinite);
  const counts = { occurrences: ev.length, observed: obs.length, censored: ev.filter((e) => e.state === "CENSORED").length, immature: ev.filter((e) => e.state === "IMMATURE").length, ineligible: ev.filter((e) => e.state === "INELIGIBLE").length };
  const censoredReasons = {};
  for (const e of ev.filter((x) => x.state === "CENSORED")) for (const r of e.reasons || []) censoredReasons[r] = (censoredReasons[r] || 0) + 1;
  return { returnBasis: res.returnBasis, events: counts, censoredReasons, titles: new Set(obs.map((e) => e.issuerId)).size,
    perEvent: { n: net.length, mean: mean(net), median: median(net), hitRate: net.length ? net.filter((x) => x > 0).length / net.length : null, interval95: res.statistics.interval95 },
    matchedExcess: { n: matched.length, mean: mean(matched), median: median(matched) }, resultHash: res.resultHash };
}
const key = (e) => e.issuerId + "|" + e.signalDate;

/**
 * Kern: spec (PATTERN_EVIDENCE, benchmark NONE), population { calendar, docOf(id) }, daily(securityId) -> dailyOf-Ergebnis
 * oder null, runner(spec) -> Runner-Ergebnis mit QA-Block (Paritaet). Liefert den Bericht ohne Ereigniszeilen.
 */
export function compute({ spec, population, daily, runner }) {
  if (spec.kind !== "PATTERN_EVIDENCE") fail("KIND_NOT_SUPPORTED", spec.kind);
  if (spec.benchmark !== "NONE") fail("BENCHMARK_MUST_BE_NONE_NO_TOTAL_RETURN_BENCHMARK_IN_REPOSITORY");
  R.validateSpec(spec);
  const calendar = population.calendar.filter((d) => d <= spec.asOf);
  const requested = spec.population.tickers.map((t) => ({ ticker: t, securityId: Identity.securityIdForTicker(t) }));
  const included = [], excluded = [], sources = {};
  for (const r of requested) {
    let doc = null;
    try { doc = population.docOf(r.securityId); } catch (e) { excluded.push({ ...r, reason: "NOT_IN_POPULATION_FRAME" }); continue; }
    const d = daily(r.securityId);
    if (!d) { excluded.push({ ...r, reason: "NO_DAILY_HISTORY_WITH_DISTRIBUTIONS" }); continue; }
    if (!d.totalReturn || !d.tr) { excluded.push({ ...r, reason: "TOTAL_RETURN_NOT_CONFIRMED:" + ((d.trVerdict && d.trVerdict.reason) || "UNKNOWN"), source: d.source }); continue; }
    const truncated = { ...doc, points: doc.points.filter((p) => p[0] <= spec.asOf) };
    const levels = weeklyLevels(d, calendar);
    const inWindow = [...levels.keys()].filter((x) => x >= spec.window.from && x <= spec.window.to).length;
    if (!inWindow) { excluded.push({ ...r, reason: "TOTAL_RETURN_NOT_IN_WINDOW", source: d.source }); continue; }
    sources[r.securityId] = { ticker: r.ticker, source: d.source, trState: d.trVerdict.state, trBasis: d.trBasis || null, firstLevel: [...levels.keys()][0], lastLevel: [...levels.keys()].at(-1), weeksWithLevel: levels.size };
    included.push({ ...r, doc: truncated, levels, priceLevels: weeklyLevels(d, calendar, "close") });
  }
  if (!included.length) fail("NO_TITLE_WITH_CONFIRMED_TOTAL_RETURN");
  const cohortSpec = { ...spec, population: { ...spec.population, tickers: included.map((x) => x.ticker) } };
  const pr = R.windowed(S.runPatternStudy(studyInput(cohortSpec, calendar, included.map((x) => engineListing(x.securityId, x.doc, null)), "PRICE_RETURN")), spec.window, S);
  const tr = R.windowed(S.runPatternStudy(studyInput(cohortSpec, calendar, included.map((x) => engineListing(x.securityId, x.doc, x.levels)), "TOTAL_RETURN")), spec.window, S);
  // Kontrolle: Kursrendite aus DERSELBEN Tagesreihe (split-bereinigter Tagesschluss, ungerundet) ueber das returnLevel-Feld.
  // Zerlegt die Differenz in Ausschuettungen (Gesamtrendite minus Kontrolle) und Quelle/Rundung der Wochenreihe
  // (Kontrolle minus Kursrendite der Wochenreihe). Nur Zerlegung, kein eigenes Ergebnis.
  const pc = R.windowed(S.runPatternStudy(studyInput(cohortSpec, calendar, included.map((x) => engineListing(x.securityId, x.doc, x.priceLevels)), "TOTAL_RETURN")), spec.window, S);
  // Paritaet gegen den unveraenderten Runner (gleiche Spec, Kursrendite).
  const ref = runner(cohortSpec);
  if (ref.state !== "RESEARCH_EXECUTED") fail("RUNNER_REFERENCE_NOT_EXECUTED", ref.state);
  const refEvents = (ref.qa && ref.qa.events) || [];
  let mismatches = 0;
  if (refEvents.length !== pr.events.length) mismatches += Math.abs(refEvents.length - pr.events.length) || 1;
  const prBy = new Map(pr.events.map((e) => [key(e), e]));
  for (const e of refEvents) {
    const m = prBy.get(e.securityId + "|" + e.signalDate);
    if (!m || m.state !== e.state || (e.netReturn !== null && Math.abs(m.netReturn - e.netReturn) > 1e-12)) mismatches++;
  }
  if (mismatches) fail("PARITY_WITH_RUNNER_FAILED", mismatches);
  // Gepaarte Differenz auf denselben Ereignissen (beide beobachtet): misst nur die Ausschuettungen.
  const trBy = new Map(tr.events.map((e) => [key(e), e])), pcBy = new Map(pc.events.map((e) => [key(e), e]));
  const both = pr.events.filter((e) => e.state === "OBSERVED" && trBy.get(key(e)) && trBy.get(key(e)).state === "OBSERVED" && pcBy.get(key(e)) && pcBy.get(key(e)).state === "OBSERVED");
  const pairs = both.map((e) => trBy.get(key(e)).netReturn - e.netReturn);
  const dividends = both.map((e) => trBy.get(key(e)).netReturn - pcBy.get(key(e)).netReturn);
  const sourceNoise = both.map((e) => pcBy.get(key(e)).netReturn - e.netReturn);
  const stat = (a) => ({ mean: mean(a), median: median(a), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null });
  const body = { schemaVersion: VERSION, evidenceKind: "RESEARCH_RETURN_BASIS_COMPARISON", certification: "NOT_CERTIFIED", productionApproved: false, gateInput: false, claim: "NO_ALPHA_OR_CERTIFICATION_CLAIM",
    template: spec.id, window: spec.window, asOf: spec.asOf, pattern: { id: spec.engine.pattern.id, version: spec.engine.pattern.version }, horizonBars: spec.engine.horizonBars, cooldownBars: spec.engine.cooldownBars,
    costs: spec.costs, benchmark: "NONE",
    contracts: { totalReturn: CTR.VERSION, weekly: WEEKLY_TOTAL_RETURN_VERSION, engine: S.VERSION, runner: R.VERSION },
    cohort: { requested: requested.length, included: included.length, excluded, sources },
    parity: { reference: "backtest-runner.cjs (PRICE_RETURN, gleiche Spec)", runnerSpecHash: ref.specHash, eventsCompared: refEvents.length, mismatches },
    priceReturn: summarize(pr), totalReturn: summarize(tr),
    paired: { pairs: pairs.length, meanDifference: mean(pairs), medianDifference: median(pairs), min: pairs.length ? Math.min(...pairs) : null, max: pairs.length ? Math.max(...pairs) : null, direction: "Gesamtrendite minus Kursrendite je Ereignis",
      decomposition: { distributions: { ...stat(dividends), rule: "Gesamtrendite minus Kursrendite derselben Tagesreihe" }, weeklySeriesSource: { ...stat(sourceNoise), rule: "Kursrendite der Tagesreihe minus Kursrendite der Wochenreihe (discover-series-long, gerundete Schluesse)" } } } };
  return { ...body, reportHash: sha(body) };
}

/** Was das Gate returnBasis (PATTERN_EVIDENCE) mit diesem Bericht sagen wuerde. Liest nur; aendert nichts. */
export function gateReading(rep, totalReturnQuality) {
  const share = rep.cohort.requested ? rep.cohort.included / rep.cohort.requested : null;
  const sig = totalReturnQuality && totalReturnQuality.signalStudy ? totalReturnQuality.signalStudy : null;
  return { gate: "PATTERN_EVIDENCE.returnBasis", today: "FAIL STUDY_RETURN_BASIS_NOT_TOTAL_RETURN (Konstante in scripts/quant/build-backtest-certification.mjs, liest keinen Bericht)",
    readsThisReport: false, cohortShareWithTotalReturn: share,
    underP42: "Die bestehende Definition (Renditebasis der Studie = Gesamtrendite) waere fuer diese Research-Kohorte erfuellt (" + rep.cohort.included + " von " + rep.cohort.requested + " Titeln mit bestaetigter Gesamtrendite, Ausschluesse ausgewiesen). Das Gate liest aber die Produkt-Musterstudie quant/data/product/pattern-research-v1/study.json (Kursrendite, Erzeuger build-pattern-research.mjs); es kippt erst, wenn deren Erzeuger in der Pipeline mit --work-dir in Gesamtrendite rechnet und der Builder die Basis aus der Studie liest (Freigabe FV-5).",
    comparableCoverage: sig ? { source: "quant/data/product/total-return-quality-v1.json signalStudy", titles: sig.titles, withTotalReturn: sig.withTotalReturn, share: sig.share, minimumShareInSignalGate: 0.95 } : null };
}

function parse(argv) {
  const o = {};
  const flags = { "--out": "out", "--template": "template", "--tickers": "tickers", "--from": "from", "--to": "to", "--work-dir": "workDir" };
  for (let i = 0; i < argv.length; i++) { const k = flags[argv[i]]; if (!k || !argv[i + 1] || o[k] !== undefined) fail("INVALID_ARGUMENTS", argv[i]); o[k] = argv[++i]; }
  if (!o.out) fail("OUT_REQUIRED");
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith("..") && GENERATED.some((g) => rel === g || rel.startsWith(g + path.sep))) fail("OUT_INSIDE_GENERATED_DATA", rel);
  return o;
}
export function specFor(o, templates = B.loadTemplates()) {
  const t = templates.get(o.template || DEFAULT_TEMPLATE);
  if (!t) fail("TEMPLATE_UNKNOWN", o.template);
  if (t.kind !== "PATTERN_EVIDENCE") fail("KIND_NOT_SUPPORTED", t.kind);
  const golden = fs.readdirSync(path.join(ROOT, GOLDEN_DIR)).filter((f) => /^ref_.+\.json$/.test(f)).map((f) => f.slice(4, -5)).sort();
  const tickers = o.tickers ? o.tickers.split(",").map((x) => x.trim()).filter(Boolean) : o.workDir ? t.population.tickers.slice() : golden;
  const spec = JSON.parse(JSON.stringify(t));
  delete spec.methods;
  spec.id = (t.id + "-p41-total-return").slice(0, 120);
  spec.description = "P4.1 Gesamtrendite neben Kursrendite aus " + t.id;
  spec.benchmark = "NONE";
  spec.window = { from: o.from || DEFAULT_WINDOW.from, to: o.to || DEFAULT_WINDOW.to };
  spec.population = { profile: t.population.profile, tickers };
  return spec;
}

export function main(argv = process.argv.slice(2), io = { log: (s) => console.log(s) }) {
  const o = parse(argv);
  const spec = specFor(o);
  const Pop = require("./research-population.cjs");
  const pop = Pop.buildPopulation({ profile: spec.population.profile });
  const population = { calendar: pop.calendar, docOf: (id) => { const d = pop.listings.get(id); if (!d) fail("NOT_IN_POPULATION_FRAME", id); return d; } };
  const daily = (id) => { try { return dailyOf(id, o.workDir || null, { asOf: spec.asOf }); } catch (e) { return { source: "READ_FAILED", totalReturn: false, tr: null, trVerdict: { reason: "READ_FAILED" } }; } };
  const rep = compute({ spec, population, daily, runner: (s) => R.runBacktest(s, {}) });
  const tq = path.join(ROOT, "quant/data/product/total-return-quality-v1.json");
  const out = { ...rep, gate: gateReading(rep, fs.existsSync(tq) ? JSON.parse(fs.readFileSync(tq, "utf8")) : null),
    dailySource: o.workDir ? "CANONICAL_HISTORY (--work-dir, privat)" : GOLDEN_DIR + " (oeffentlich)" };
  const tmp = o.out + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 1) + "\n"); fs.renameSync(tmp, o.out);
  io.log("[pattern-total-return] " + rep.cohort.included + "/" + rep.cohort.requested + " Titel, Paritaet " + rep.parity.eventsCompared + "/0 Abweichungen, Paare " + rep.paired.pairs + " · " + o.out);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
