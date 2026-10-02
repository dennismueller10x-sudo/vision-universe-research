#!/usr/bin/env node
/* =========================================================================
   SETUP BACKTEST - was geschah nach einem Setup-Wechsel, gemessen an der
   point-in-time Wiederholung (scripts/quant/replay-setup-history.mjs).

   Liest:  quant/data/product/setup-replay-v1/<securityId>.json.gz
           Tageskurse zur Laufzeit: --work-dir DIR/tiingo/daily/<securityId>.json
           (runner-privat) oder quant/data/market/golden-preview/daily/<securityId>.json
           quant/data/product/setup-observation-history/setup-mapping-1.0.0/*.json.gz  (Paritaet)
           quant/data/market/multi-asset/series/SPY.json                                (Vergleich, Marktphase)
   Schreibt: quant/data/product/setup-backtest-v1.json

   Ereignisse sind dieselben Wechsel wie im Radar (build-quant-radar.mjs):
     SETUP_CONFIRMED  Wechsel nach CONFIRMED
     SETUP_NEW        Wechsel nach SETUP_FORMING von unten (Radar: "Setup entsteht")
     SETUP_WEAKENED   Abstieg aus SETUP_FORMING oder CONFIRMED
   Einstieg: Schluss des Folgetags. Rendite: TOTAL_RETURN, wo vorhanden.
   Vertragsausstieg nur mit den Pfadregeln der Setup-Methodik:
     INVALIDATION  Schluss unter der Invalidierungsmarke der vorigen Beobachtung (Regel 1)
     TARGET        Schluss an oder ueber der Zielmarke der vorigen Beobachtung (Regel 2)
     TIME_EXIT     nach 126 Handelstagen
   Ausstieg jeweils zum Schluss des Folgetags.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { fromBars } from "./lib/daily-prices.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SB = require(join(ROOT, "quant/engines/signal-backtest.js"));
const MarketQualityVersion = () => require(join(ROOT, "quant/engines/market-quality.js")).TR_CONTRACT_VERSION;
const REPLAY = join(ROOT, "quant/data/product/setup-replay-v1");
const OUT = join(ROOT, "quant/data/product/setup-backtest-v1.json");
const HIST = join(ROOT, "quant/data/product/setup-observation-history/setup-mapping-1.0.0");

export const SETUP_BACKTEST_SCHEMA = "setup-backtest-1.0.0";
export const DAY_HORIZONS = [{ id: "m1", days: 21, label: "1 Monat" }, { id: "m3", days: 63, label: "3 Monate" }, { id: "m6", days: 126, label: "6 Monate" }, { id: "m12", days: 252, label: "12 Monate" }];
export const MAX_HOLD = 126;
const UP = { NO_SETUP: 0, WATCH: 1, SETUP_FORMING: 2, CONFIRMED: 3 };
export function transitionType(a, b) {
  if (!(a in UP) || !(b in UP) || a === b) return null;
  if (b === "CONFIRMED") return "SETUP_CONFIRMED";
  if (b === "SETUP_FORMING" && UP[a] < UP.SETUP_FORMING) return "SETUP_NEW";
  if (UP[a] >= UP.SETUP_FORMING && UP[b] < UP[a]) return "SETUP_WEAKENED";
  return null;
}
const TYPES = [
  { id: "SETUP_CONFIRMED", plain: "Das Setup wechselt in den Zustand „bestätigt“.", contractTrade: true },
  { id: "SETUP_NEW", plain: "Ein Setup entsteht: Wechsel nach „Setup entsteht“ aus „kein Setup“ oder „beobachten“.", contractTrade: true },
  { id: "SETUP_WEAKENED", plain: "Das Setup schwächt sich ab: Abstieg aus „Setup entsteht“ oder „bestätigt“.", contractTrade: false }
];

/* Vertragsausstieg ueber die Beobachtungen nach dem Ereignis. */
export function contractExit(obs, j, dayIndexOf, sa, e, maxHold) {
  for (let k = j + 1; k < obs.length; k++) {
    const d = dayIndexOf(obs[k][0]);
    if (d === undefined || d <= e - 1) continue;
    if (d - e >= maxHold) break;
    const prev = obs[k - 1], close = sa[d];
    if (prev[2] !== null && close < prev[2]) return { kind: "INVALIDATION", at: d + 1 };
    if (prev[3] !== null && close >= prev[3]) return { kind: "TARGET", at: d + 1 };
  }
  return { kind: "TIME_EXIT", at: e + maxHold };
}

/* Tageskurse eines Replays: splitbereinigt (Marken, Ausloeser) und
   Gesamtrendite (Ergebnis). Nur zur Laufzeit, nie im Artefakt. Derselbe
   Lader und derselbe Gesamtrendite-Vertrag wie die Signal-Studie
   (scripts/quant/lib/daily-prices.mjs fromBars -> market-quality.js
   totalReturnVerdict): eine Reihe mit nicht eingerechneter Ausschuettung
   traegt keine Gesamtrendite. */
function dailyOf(securityId, workDir) {
  const candidates = [workDir ? join(workDir, "tiingo", "daily", securityId + ".json") : null, join(ROOT, "quant/data/market/golden-preview/daily", securityId + ".json")].filter(Boolean);
  const file = candidates.find((f) => existsSync(f));
  if (!file) return null;
  const d = fromBars(JSON.parse(readFileSync(file, "utf8")));
  return { rows: d.dates.map((date, i) => [date, d.close[i], d.high[i], d.tr ? d.tr[i] : null]), totalReturn: d.totalReturn, legacyTotalReturn: d.legacyTotalReturn, trVerdict: d.trVerdict };
}

function main() {
  const argv = process.argv.slice(2);
  const wi = argv.indexOf("--work-dir"), workDir = wi >= 0 ? argv[wi + 1] : null;
  const files = existsSync(REPLAY) ? readdirSync(REPLAY).filter((f) => f.endsWith(".json.gz")).sort() : [];
  const loaded = files.map((f) => JSON.parse(gunzipSync(readFileSync(join(REPLAY, f))).toString("utf8")));
  const replays = [], withoutPrices = [];
  for (const r of loaded) { const d = dailyOf(r.securityId, workDir); if (d) { r.daily = d; r.totalReturn = d.totalReturn ? "AVAILABLE" : "UNAVAILABLE"; replays.push(r); } else withoutPrices.push(r.ticker); }
  const F = SB.frictionFactor();
  const certification = (JSON.parse(readFileSync(join(ROOT, "quant/methodology/setup-state-v1.json"), "utf8")).requirements || {}).backtestCertification || "NOT_CERTIFIED";

  /* SPY taeglich: Vergleich und Marktphase (126 Handelstage, +-5 %). */
  const spyPts = JSON.parse(readFileSync(join(ROOT, "quant/data/market/multi-asset/series/SPY.json"), "utf8")).points;
  const spyIdx = new Map(spyPts.map(([d], i) => [d, i]));
  const spyRet = (d0, d1) => { const a = spyIdx.get(d0), b = spyIdx.get(d1); return a !== undefined && b !== undefined ? (spyPts[b][1] / spyPts[a][1]) * F - 1 : null; };
  const regimeAt = (d) => { const i = spyIdx.get(d); if (i === undefined || i < 126) return null; const r = spyPts[i][1] / spyPts[i - 126][1] - 1; return r > 0.05 ? "UP" : r < -0.05 ? "DOWN" : "SIDEWAYS"; };

  /* Paritaet: dieselben Stichtage wie die veroeffentlichte Setup-Historie. */
  let parityChecked = 0, parityMismatch = 0;
  const parityRows = [];
  if (existsSync(HIST)) for (const f of readdirSync(HIST).filter((x) => x.endsWith(".json.gz"))) {
    const h = JSON.parse(gunzipSync(readFileSync(join(HIST, f))).toString("utf8"));
    for (const r of replays) {
      /* Nachrechnung genau dieses Stichtags, Marken in der Skala des Stichtags. */
      const pub = h.rows[r.ticker], mine = (r.parity || []).find((x) => x[0] === h.asOf);
      if (!pub || !mine) continue;
      const same = pub[0] === mine[1] && pub[1] === mine[4] && pub[2] === mine[5];
      parityChecked++; if (!same) parityMismatch++;
      parityRows.push({ ticker: r.ticker, asOf: h.asOf, published: pub, replay: [mine[1], mine[4], mine[5]], same });
    }
  }
  const pitViolations = replays.reduce((s, r) => s + r.pitViolations, 0);
  /* Gesamtrendite-Vertrag: Replays ohne bestaetigte Gesamtrendite fallen
     heraus (gezaehlt), solange >= 95 % bestaetigt sind - dann rechnet die
     Studie rein in Gesamtrendite. Darunter rechnet sie rein in Kursrendite.
     Nie gemischt. */
  const trReasons = {};
  for (const r of replays) { const k = r.daily.trVerdict.confirmed ? "TOTAL_RETURN_CONFIRMED" : "TOTAL_RETURN_REJECTED_" + r.daily.trVerdict.reason; trReasons[k] = (trReasons[k] || 0) + 1; }
  const trConfirmed = replays.filter((r) => r.totalReturn === "AVAILABLE");
  const trQuality = { contract: MarketQualityVersion(), replays: replays.length, confirmed: trConfirmed.length, legacyConfirmed: replays.filter((r) => r.daily.legacyTotalReturn).length,
    share: replays.length ? SB.round(trConfirmed.length / replays.length, 3) : null, reasons: trReasons, excluded: [] };
  const allTR = replays.length > 0 && trConfirmed.length / replays.length >= 0.95;
  if (allTR && trConfirmed.length < replays.length) {
    trQuality.excluded = replays.filter((r) => r.totalReturn !== "AVAILABLE").map((r) => ({ ticker: r.ticker, reason: r.daily.trVerdict.reason }));
    replays.splice(0, replays.length, ...trConfirmed);
  }

  const studies = TYPES.map((type) => {
    const per = DAY_HORIZONS.map(() => ({ rets: [], exSpy: [], dd: [], mae: [], mfe: [] }));
    const base = DAY_HORIZONS.map(() => []);
    const trades = { INVALIDATION: [], TARGET: [], TIME_EXIT: [] };
    const touch = { UP: 0, DOWN: 0, NONE: 0, wUp: [], wDown: [] };
    const path = Array.from({ length: 127 }, () => []);
    const regimes = { UP: [], DOWN: [], SIDEWAYS: [] };
    const years = new Map();
    const events = [];
    let reversals = 0, withNext = 0, closed = 0, complete = 0, lookahead = 0;
    const titles = new Set();
    for (const r of replays) {
      const daily = r.daily.rows, dayIdx = new Map(daily.map(([d], i) => [d, i]));
      const sa = Float64Array.from(daily.map((x) => x[1])), tr = Float64Array.from(daily.map((x) => (allTR ? x[3] : x[1])));
      const obs = r.rows.filter((x) => x[1] in UP);
      /* Basis derselben Titel: jeder Beobachtungstag. */
      for (const o of obs) { const e = dayIdx.get(o[0]) + 1; DAY_HORIZONS.forEach((h, hi) => { const x = SB.outcome(tr, e, h.days); if (x) base[hi].push(x.ret); }); }
      for (let j = 1; j < obs.length; j++) {
        if (transitionType(obs[j - 1][1], obs[j][1]) !== type.id) continue;
        const d = dayIdx.get(obs[j][0]), e = d + 1;
        if (e <= d) lookahead++;
        if (e >= daily.length) continue;
        titles.add(r.ticker);
        const ev = { ticker: r.ticker, date: obs[j][0], from: obs[j - 1][1], to: obs[j][1], ex6: null };
        events.push(ev);
        if (j + 1 < obs.length) { withNext++; if (obs[j + 1][1] !== obs[j][1]) reversals++; }
        let all = true;
        DAY_HORIZONS.forEach((h, hi) => {
          const x = SB.outcome(tr, e, h.days);
          if (!x) { all = false; return; }
          const P = per[hi]; P.rets.push(x.ret); P.dd.push(x.maxDrawdown); P.mae.push(x.mae); P.mfe.push(x.mfe);
          const s = spyRet(daily[e][0], daily[e + h.days][0]);
          if (s !== null) { P.exSpy.push(x.ret - s); if (h.id === "m6") ev.ex6 = x.ret - s; }
          if (h.id === "m6") {
            const rg = regimeAt(obs[j][0]); if (rg) regimes[rg].push({ r: x.ret, x: ev.ex6 });
            const y = obs[j][0].slice(0, 4); if (!years.has(y)) years.set(y, { r: [], x: [] }); years.get(y).r.push(x.ret); if (ev.ex6 !== null) years.get(y).x.push(ev.ex6);
          }
        });
        if (e + 252 < daily.length) { closed++; if (all) complete++; }
        const ft = SB.firstTouch(sa, e, 252);
        if (ft) { touch[ft.first]++; if (ft.first === "UP") touch.wUp.push(ft.weeks); if (ft.first === "DOWN") touch.wDown.push(ft.weeks); }
        if (type.contractTrade && e + MAX_HOLD < daily.length) {
          const x = contractExit(obs, j, (dd) => dayIdx.get(dd), sa, e, MAX_HOLD);
          if (x.at < daily.length && tr[x.at] > 0 && tr[e] > 0) trades[x.kind].push({ ret: (tr[x.at] / tr[e]) * F - 1, days: x.at - e });
        }
        if (e + 126 < daily.length) for (let k = 0; k <= 126; k++) path[k].push(tr[e + k] / tr[e] - 1);
      }
    }

    const horizons = {};
    DAY_HORIZONS.forEach((h, hi) => {
      const P = per[hi], s = SB.summarize(P.rets), b = SB.summarize(base[hi]);
      const mfe = SB.median(P.mfe), mae = SB.median(P.mae);
      horizons[h.id] = { days: h.days, label: h.label, ...s,
        base: { n: b.n, positiveShare: b.positiveShare, median: b.median, plain: "alle Beobachtungstage derselben Titel" },
        vsSpy: { n: P.exSpy.length, medianExcess: SB.round(SB.median(P.exSpy)), shareAboveSpy: P.exSpy.length ? SB.round(P.exSpy.filter((x) => x > 0).length / P.exSpy.length) : null },
        maxDrawdown: { median: SB.round(SB.median(P.dd)) }, adverse: { median: SB.round(mae) }, favorable: { median: SB.round(mfe) },
        chanceRisk: mae < 0 && mfe !== null ? SB.round(mfe / -mae, 2) : null };
    });
    const allTrades = [...trades.INVALIDATION, ...trades.TARGET, ...trades.TIME_EXIT];
    const tradeOut = type.contractTrade ? {
      semantics: { entry: "NEXT_CLOSE", exits: ["INVALIDATION", "TARGET", "TIME_EXIT"], maxHoldDays: MAX_HOLD, exitFill: "NEXT_CLOSE" },
      n: allTrades.length, ...SB.summarize(allTrades.map((t) => t.ret)),
      medianHoldingDays: SB.median(allTrades.map((t) => t.days)),
      byExit: Object.fromEntries(Object.entries(trades).map(([k, v]) => [k, { n: v.length, share: allTrades.length ? SB.round(v.length / allTrades.length) : null, median: SB.round(SB.median(v.map((t) => t.ret))), medianDays: SB.median(v.map((t) => t.days)) }]))
    } : { state: "NOT_DEFINED_BY_CONTRACT", reason: "WEAKENING_IS_NOT_AN_ENTRY" };

    const m6 = events.filter((ev) => ev.ex6 !== null);
    const seg = (list, from, to) => ({ from, to, n: list.length, medianExcess: SB.round(SB.median(list.map((x) => x.ex6))) });
    const oos = { statistic: "Median der 6-Monats-Gesamtrendite über SPY im selben Fenster",
      train: seg(m6.filter((x) => x.date < "2020-01-01"), null, "2020-01-01"), validation: seg(m6.filter((x) => x.date >= "2020-01-01" && x.date < "2023-01-01"), "2020-01-01", "2023-01-01"),
      test: seg(m6.filter((x) => x.date >= "2023-01-01"), "2023-01-01", null) };
    const sign = (x) => (x === null ? null : Math.abs(x) < 0.0025 ? 0 : x > 0 ? 1 : -1);
    const oosPass = oos.test.n >= 30 && oos.train.n >= 30 && sign(oos.train.medianExcess) === sign(oos.test.medianExcess) && sign(oos.train.medianExcess) === sign(oos.validation.medianExcess);
    const sorted = m6.slice().sort((a, b) => (a.date < b.date ? -1 : 1)), size = Math.floor(sorted.length / 5), folds = [];
    for (let k = 1; k < 5 && size > 0; k++) {
      const test = sorted.slice(k * size, k === 4 ? sorted.length : (k + 1) * size), start = test[0].date;
      const cut = new Date(Date.parse(start) - 183 * 86400000).toISOString().slice(0, 10);
      const train = sorted.slice(0, k * size).filter((x) => x.date < cut);
      const a = SB.median(train.map((x) => x.ex6)), b = SB.median(test.map((x) => x.ex6));
      folds.push({ fold: k, from: start, trainN: train.length, testN: test.length, trainMedianExcess: SB.round(a), testMedianExcess: SB.round(b), agree: sign(a) === sign(b) });
    }
    const agreeShare = folds.length ? folds.filter((f) => f.agree).length / folds.length : 0;
    const regimeOut = Object.fromEntries(Object.entries(regimes).map(([k, l]) => [k, { n: l.length, positiveShare: l.length ? SB.round(l.filter((x) => x.r > 0).length / l.length) : null, median: SB.round(SB.median(l.map((x) => x.r))) }]));
    const sample = { n: horizons.m6.n, titles: titles.size };
    const completeness = closed ? complete / closed : 0;
    const checks = {
      pit: pitViolations === 0 && parityChecked > 0 && parityMismatch === 0
        ? { state: "PASS", value: "Jeder Stichtag nur mit Daten bis zum Stichtag; " + parityChecked + " von " + parityChecked + " veröffentlichten Setup-Ständen exakt nachgerechnet" }
        : { state: "FAIL", reason: parityChecked === 0 ? "PARITY_NOT_MEASURED" : "PIT_OR_PARITY_MISMATCH", value: { pitViolations, parityChecked, parityMismatch } },
      lookahead: lookahead === 0 ? { state: "PASS", value: "Einstieg zum Schluss des Folgetags" } : { state: "FAIL", reason: "ENTRY_NOT_AFTER_SIGNAL", value: lookahead },
      sample: { state: SB.sampleLevel(sample.n, sample.titles) === "NOT_READY" ? "FAIL" : "PASS", reason: SB.sampleLevel(sample.n, sample.titles) === "NOT_READY" ? "TOO_FEW_TITLES_OR_CASES" : null,
        value: sample.n + " Fälle aus " + sample.titles + " Titeln (nötig für eingeschränkt: " + SB.TRUST_RULE.sample.LIMITED.n + " aus " + SB.TRUST_RULE.sample.LIMITED.titles + ")", level: SB.sampleLevel(sample.n, sample.titles) },
      oos: { state: oosPass ? "PASS" : "FAIL", reason: oosPass ? null : "OOS_DIRECTION_NOT_CONFIRMED", value: oos },
      walkForward: { state: agreeShare >= 0.75 ? "PASS" : "FAIL", reason: agreeShare >= 0.75 ? null : "FOLDS_DISAGREE", value: Math.round(agreeShare * folds.length) + " von " + folds.length + " Folds in derselben Richtung" },
      survivorship: { state: "FAIL", reason: "HAND_PICKED_SURVIVORS", value: "Nur Titel mit vollständiger Tageshistorie im Repository (" + replays.map((r) => r.ticker).join(", ") + "); alle heute gelistet" },
      returnBasis: allTR ? { state: "PASS", value: "Gesamtrendite mit Dividenden" } : { state: "FAIL", reason: "TOTAL_RETURN_COVERAGE_SHORT", value: "Kursrendite ohne Dividenden (Gesamtrendite nur für " + trQuality.confirmed + " von " + trQuality.replays + " Titeln bestätigt)" },
      costs: { state: "PASS", value: SB.FRICTIONS.roundTripBps + " bps je Runde" },
      slippage: { state: "PASS", value: SB.FRICTIONS.slippageBps + " bps je Runde" },
      benchmark: { state: "PASS", value: "SPY-Kurs über dasselbe Fenster; Basis aller Beobachtungstage derselben Titel" },
      regimeDiversity: { state: Object.values(regimeOut).every((x) => x.n >= 30) ? "PASS" : "FAIL", reason: Object.values(regimeOut).every((x) => x.n >= 30) ? null : "REGIME_UNDERSAMPLED", value: Object.entries(regimeOut).map(([k, x]) => k + " " + x.n).join(", ") },
      parameterStability: { state: "FAIL", reason: "FIXED_MAPPING_NOT_SWEPT", value: "Die freigegebene Zuordnung hat keine Parameter, die hier variiert werden dürfen" },
      independence: (() => {
        const q = m6.map((x) => x.date.slice(0, 4) + "Q" + (Math.floor((Number(x.date.slice(5, 7)) - 1) / 3) + 1));
        const cm = SB.clusterMean(m6.map((x) => x.ex6), q);
        const pass = !!cm && cm.clusters >= 40 && cm.maxClusterShare <= 0.1;
        return { state: pass ? "PASS" : "FAIL", reason: pass ? null : "CLUSTERED_SAMPLE", value: cm ? cm.clusters + " Quartale, größter Anteil " + Math.round(cm.maxClusterShare * 100) + " %" : "–" };
      })(),
      completeness: { state: completeness >= 0.95 ? "PASS" : "FAIL", reason: completeness >= 0.95 ? null : "OUTCOMES_INCOMPLETE", value: SB.round(completeness, 3) + " der abgeschlossenen Fälle mit allen vier Zeiträumen" }
    };
    const trust = SB.trustState(checks, sample);
    const pathOut = { days: [], median: [], p25: [], p75: [] };
    for (let k = 0; k <= 126; k += 3) { const s = Float64Array.from(path[k]).sort(); pathOut.days.push(k); pathOut.median.push(SB.round(SB.quantile(s, 0.5))); pathOut.p25.push(SB.round(SB.quantile(s, 0.25))); pathOut.p75.push(SB.round(SB.quantile(s, 0.75))); }
    const m = horizons.m6;
    return {
      id: type.id, plain: type.plain, returnType: allTR ? "TOTAL_RETURN" : SB.RETURN_TYPE, grain: "DAILY",
      semantics: { version: SB.SEMANTICS.version, entry: "NEXT_CLOSE", exit: "TIME_EXIT", contractExit: type.contractTrade, frictionsBps: SB.FRICTIONS.roundTripBps + SB.FRICTIONS.slippageBps },
      occurrences: events.length, titles: titles.size, reversalNextObservation: withNext ? SB.round(reversals / withNext) : null,
      horizons, contractTrade: tradeOut,
      timeToOutcome: { threshold: SB.TOUCH_THRESHOLD, unit: "Handelstage", n: touch.UP + touch.DOWN + touch.NONE, upFirstShare: SB.round(touch.UP / Math.max(1, touch.UP + touch.DOWN + touch.NONE)), downFirstShare: SB.round(touch.DOWN / Math.max(1, touch.UP + touch.DOWN + touch.NONE)), medianDaysUp: SB.median(touch.wUp), medianDaysDown: SB.median(touch.wDown) },
      distribution: { horizon: "m6", events: SB.histogram(per[2].rets), base: SB.histogram(base[2]) },
      path: pathOut, rolling: [...years.entries()].sort().map(([y, v]) => ({ year: y, n: v.r.length, median: SB.round(SB.median(v.r)), positiveShare: SB.round(v.r.filter((x) => x > 0).length / v.r.length), medianExcess: SB.round(SB.median(v.x)) })),
      regimes: regimeOut, oos, walkForward: { folds, agreeShare: SB.round(agreeShare) },
      timeline: events.map((ev) => [ev.ticker, ev.date, ev.from]),
      checks, sample, trust, trustLabel: SB.TRUST_LABEL[trust], trustReasons: SB.trustReasons(checks),
      display: { allowed: SB.displayAllowed(trust, certification), sentence: SB.observedSentence(events.length, "Dieser Setup-Wechsel"),
        caveats: SB.trustReasons(checks).map((x) => x.label).concat(certification === "CERTIFIED" ? [] : ["Methodische Freigabe der Setup-Ausgänge"]) },
      card: { n: m.n, positiveShare: m.positiveShare, median: m.median, typicalDrawdown: m.maxDrawdown.median, chanceRisk: m.chanceRisk, medianExcess: m.vsSpy.medianExcess, trust, horizon: "m6" }
    };
  });

  const out = {
    schemaVersion: SB.STUDY_SCHEMA, kind: "SETUP_BACKTEST", setupSchema: SETUP_BACKTEST_SCHEMA, engineVersion: SB.VERSION, generatedAt: new Date().toISOString(),
    asOf: replays.length ? replays.map((r) => r.to).sort().at(-1) : null,
    source: { replay: "quant/data/product/setup-replay-v1", replaysWithoutPriceSource: withoutPrices, totalReturnQuality: trQuality, prices: workDir ? "runner-private canonical history + golden preview" : "golden preview", titles: replays.map((r) => ({ ticker: r.ticker, from: r.rows[0]?.[0] || null, to: r.to, observations: r.rows.length, cadence: r.cadence })),
      setupEngine: replays[0]?.engine || null },
    returnType: allTR ? "TOTAL_RETURN" : SB.RETURN_TYPE, semantics: SB.SEMANTICS.setup, frictions: SB.FRICTIONS, horizons: DAY_HORIZONS, maxHoldDays: MAX_HOLD,
    parity: { checked: parityChecked, mismatches: parityMismatch, rows: parityRows },
    pitViolations, trustRule: SB.TRUST_RULE, trustChecks: SB.TRUST_CHECKS,
    certification, certificationSource: "quant/methodology/setup-state-v1.json requirements.backtestCertification",
    certificationPlain: "Die Setup-Methodik gibt Ausgangszahlen erst nach ihrer Zertifizierung frei. Die Zertifizierung ist eine Owner-Entscheidung auf Grundlage dieser Messung.",
    rules: studies,
    scaleUp: { state: "CI_ONLY", reason: "FULL_DAILY_HISTORY_ONLY_IN_PRIVATE_HISTORY_STORE",
      plain: "Die volle Tageshistorie des Universums liegt nur im privaten Historienspeicher der Pipeline. Dieselbe Wiederholung läuft dort mit --source .market-cache/tiingo/daily; bis dahin bleibt der Setup-Backtest auf die fünf Titel mit Tageshistorie im Repository beschränkt." }
  };
  const errors = SB.studyViolations(out);
  if (errors.length) { console.error(errors); process.exit(1); }
  writeFileSync(OUT, JSON.stringify(out) + "\n");
  for (const s of studies) console.log(s.id.padEnd(16), "occ", s.occurrences, "titles", s.titles, "m6", s.horizons.m6.n, s.horizons.m6.positiveShare, s.horizons.m6.median, "trade", s.contractTrade.n ?? "-", "rev", s.reversalNextObservation, "trust", s.trust, s.trustReasons.map((x) => x.id).join(","));
  console.log("parity", parityChecked, "mismatch", parityMismatch, "pitViolations", pitViolations);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
