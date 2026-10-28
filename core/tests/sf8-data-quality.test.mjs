/* Core · Datenqualitaet der Supertrader-8.0-Research-Kandidaten (DQ-SF8-1..8, core/data-quality.js).
   Golden Case: ein in sich stimmiger Stand; je Regel adversariale Gegenproben. Fail closed: vorbereitet ohne Daten
   ist der einzige Pass ohne Pruefung; Daten ohne Freigabe, Freigabe ohne Daten und Unlesbares sind Fehler. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DQ = require(join(ROOT, "core", "data-quality.js"));
const Identity = require(join(ROOT, "core", "identity.js"));
const PublishedClose = require(join(ROOT, "quant", "engines", "published-close.js"));

const ASOF = "2026-10-23";
const SCHEMA = "supertrader-sf8-candidates-1.0.0";
const IDS = Object.keys(DQ.SF8_CEILING);
const TICKERS = ["AAPL", "MSFT", "NVDA", "BRK.B"];
const lagFn = (d, e) => (d === e ? 0 : d === "2026-10-22" ? 1 : d === "2026-10-21" ? 2 : 5);

/* Ansicht in der Form von records.mjs (nur die gepruefen Felder). */
function view(c, t, stage, over = {}) {
  const modeled = stage === "MODELED_TRADE_PLAN", lv = DQ.SF8_STRUCTURE_LEVELS[c][0], kind = DQ.SF8_PIVOT_KINDS[c];
  return Object.assign({
    strategyId: "SF_" + c, candidateId: c, ticker: t, securityId: Identity.securityIdForTicker(t), shard: Identity.shardKey(t),
    stage, ceiling: DQ.SF8_CEILING[c], asOf: ASOF, close: 100.5,
    levels: modeled ? { ...(lv ? { [lv]: 98 } : {}), stopReference: 98 } : lv ? { [lv]: 98 } : {},
    features: modeled ? { closeVsTrigger: 0.01 } : Object.fromEntries(DQ.SF8_DESCRIPTIVE_FEATURES[c].filter((k) => !(DQ.SF8_FEATURES_HIDDEN[c] || []).includes(k)).slice(0, 2).map((k) => [k, 0.02])),
    pivot: modeled || !kind ? null : { level: 98, kind, distance: 0.02 },
    plan: modeled ? { entryType: "NEXT_OPEN", trigger: 100.5, stop: 98, hypothetical: true } : null,
    dataQuality: { status: "PASS", notPass: [], quarantinedSessions: [] }
  }, over);
}
const row = (v) => ({ c: v.candidateId, t: v.ticker, n: "Name", s: v.stage, r: 1, pd: null, v: null, m: null, q: v.dataQuality.status, sh: v.shard, x: v.close });
/* Golden Case: jede Methode mit einem Titel auf ihrer Obergrenze bzw. darunter, C12 mit modelliertem Ablauf. */
function bundle(mut) {
  const views = {};
  IDS.forEach((c, k) => {
    const stage = c === "C12" ? "MODELED_TRADE_PLAN" : DQ.SF8_CEILING[c] === "CONFIRMED_RESEARCH_SETUP" ? "CONFIRMED_RESEARCH_SETUP" : "CHART_CANDIDATE";
    views[c] = [view(c, TICKERS[k % TICKERS.length], stage)];
  });
  const b = { activation: null, recordsPresent: false, unreadable: [], strategies: {}, tickers: {}, files: [] };
  if (mut) mut(views, b);
  const all = IDS.flatMap((c) => views[c] || []);
  const byStage = { CHART_CANDIDATE: 0, CONFIRMED_RESEARCH_SETUP: 0, MODELED_TRADE_PLAN: 0 };
  all.forEach((v) => { if (byStage[v.stage] !== undefined) byStage[v.stage]++; });
  b.summary = b.summary || {
    schema: SCHEMA, asOf: ASOF,
    status: { liveReadiness: "LIVE_NOT_APPROVED", certification: "DIAGNOSTIC_NOT_CERTIFIED", validatedTradeSignal: "LOCKED_FOR_ALL_13", orders: "NONE" },
    counts: { candidates: all.length, byStage, validatedTradeSignal: 0, rejectedRecords: 0 },
    strategies: IDS.map((c) => ({ candidateId: c, strategyId: "SF_" + c, ceiling: DQ.SF8_CEILING[c], liveReadiness: "LIVE_NOT_APPROVED", counts: { published: (views[c] || []).length } })),
    tickerShards: [...new Set(all.map((v) => v.shard))].sort()
  };
  IDS.forEach((c) => { b.strategies[c] = b.strategies[c] === undefined ? { schema: SCHEMA, strategyId: "SF_" + c, candidateId: c, asOf: ASOF, views: views[c] || [] } : b.strategies[c]; });
  /* Scherben und Kurzzeilen als eigene Kopien, wie in der geschriebenen Ausgabe */
  for (const k of b.summary.tickerShards) if (b.tickers[k] === undefined) b.tickers[k] = { schema: SCHEMA, asOf: ASOF, shard: k, views: structuredClone(all.filter((v) => v.shard === k)) };
  if (b.index === undefined) b.index = { schema: SCHEMA, asOf: ASOF, status: structuredClone(b.summary.status), counts: structuredClone(b.summary.counts), candidates: all.map(row) };
  if (b.summary.top === undefined) b.summary.top = Object.fromEntries(IDS.map((c) => [c, (views[c] || []).slice(0, 5).map(row)]));
  if (!b.files.length) b.files = [{ path: "summary.json", bytes: 1000 }, ...IDS.map((c) => ({ path: "strategy/" + c + ".json", bytes: 5000 }))];
  return b;
}
const series = (t, over = {}) => Object.assign({ schemaVersion: "discover-series-1.1.0", status: "CALCULATED", source: "tiingo", provider: "tiingo", dataMode: "real", priceSeriesType: "SPLIT_ADJUSTED", currency: "USD", grain: "daily", publishBasis: "test", securityId: Identity.securityIdForTicker(t), ticker: t, instrumentId: t, asOf: ASOF, points: [["2026-10-22", 99], [ASOF, 100.5]] }, over);
const REFS = Object.fromEntries(TICKERS.map((t) => [Identity.securityIdForTicker(t), series(t)]));
const ctx = (over = {}) => Object.assign({ expectedSession: ASOF, lagFn, maxLag: 2, Identity, PublishedClose, referenceOf: (id) => REFS[id] || null }, over);
const byId = (rules) => Object.fromEntries(rules.map((r) => [r.id, r]));
const failing = (b, c) => DQ.sf8Rules(b, ctx(c)).filter((r) => r.status === "FAIL").map((r) => r.id);

test("DQ-SF8 · Golden Case: stimmiger Stand besteht alle acht Regeln, alle als ERROR", () => {
  const r = DQ.sf8Rules(bundle(), ctx());
  assert.deepEqual(r.map((x) => x.id), ["DQ-SF8-1", "DQ-SF8-2", "DQ-SF8-3", "DQ-SF8-4", "DQ-SF8-5", "DQ-SF8-6", "DQ-SF8-7", "DQ-SF8-8"]);
  assert.ok(r.every((x) => x.status === "PASS" && x.severity === "ERROR"), JSON.stringify(r.filter((x) => x.status !== "PASS")));
  assert.equal(byId(r)["DQ-SF8-2"].checked, 13);
  assert.equal(byId(r)["DQ-SF8-4"].checked, 24, "nur Ansichten unterhalb MODELED, in Strategiedateien und Scherben");
  assert.equal(DQ.summarize(r).overall, "PASS");
});

test("DQ-SF8 · Aktivierungszustand fail closed: vorbereitet ohne Daten PASS, sonst Fehler", () => {
  const none = { activation: "PREPARED_DISABLED", summary: null, strategies: {}, tickers: {}, files: [], recordsPresent: false, unreadable: [] };
  const r = DQ.sf8Rules(none, ctx());
  assert.ok(r.every((x) => x.status === "PASS" && x.checked === 0));
  assert.ok(DQ.sf8Rules(Object.assign({}, none, { activation: "ACTIVATING" }), ctx()).every((x) => x.status === "PASS" && x.checked === 0), "freigegeben, erster Lauf ausstehend");
  assert.deepEqual(failing(Object.assign(bundle(), { activation: "ACTIVATING" })), [], "ACTIVATING mit Daten: voll geprueft, stimmig");
  assert.ok(failing(Object.assign(bundle((v) => { v.C04[0].stage = "MODELED_TRADE_PLAN"; }), { activation: "ACTIVATING" })).includes("DQ-SF8-3"));
  assert.equal(failing(Object.assign({}, none, { activation: "ACTIVE" })).length, 8, "unbekannter Zustand");
  assert.equal(failing(Object.assign({}, none, { unreadable: ["supertrader/data/sf-candidates/foo.json (unerwartete Datei)"] })).length, 8, "eine fremde Datei ist vorhandene Daten");
  const leaked = Object.assign(bundle(), { activation: "PREPARED_DISABLED" });
  assert.equal(failing(leaked).length, 8, "Daten ohne Freigabe: jede Regel rot");
  assert.equal(failing({ activation: "PREPARED_DISABLED", summary: null, strategies: {}, tickers: {}, files: [], recordsPresent: true, unreadable: [] }).length, 8, "auch nur records/");
  assert.equal(failing(Object.assign({}, none, { activation: null })).length, 8, "freigegeben ohne Daten: rot");
  const broken = bundle(); broken.unreadable = ["supertrader/data/sf-candidates/strategy/C03.json"];
  assert.equal(failing(broken).length, 8, "Unlesbares ist nie ein Pass");
});

test("DQ-SF8-1 · Frische: veraltet, kein Datum, Zukunft", () => {
  const b = bundle(); b.summary.asOf = "2026-10-20";
  assert.deepEqual(failing(b).filter((x) => x === "DQ-SF8-1"), ["DQ-SF8-1"]);
  const ok = bundle(); ok.summary.asOf = "2026-10-21";
  assert.ok(!failing(ok).includes("DQ-SF8-1"), "zwei Sitzungen Rueckstand sind noch zulaessig");
  const nd = bundle(); nd.summary.asOf = null; assert.ok(failing(nd).includes("DQ-SF8-1"));
  const fut = bundle(); fut.summary.asOf = "2026-10-26"; assert.ok(failing(fut).includes("DQ-SF8-1"));
  assert.ok(failing(bundle(), { lagFn: () => null }).includes("DQ-SF8-1"), "unbestimmbarer Rueckstand");
});

test("DQ-SF8-2 · Identitaet: selbstgebildete securityId, falsche Scherbe, Doppelte, ungueltiger Ticker", () => {
  for (const over of [{ securityId: "ref_aapl" }, { securityId: "ref_MSFT" }, { shard: "ZZ" }, { ticker: "a b", securityId: "ref_a b" }]) {
    const b = bundle((v) => { Object.assign(v.C04[0], over); });
    assert.ok(failing(b).includes("DQ-SF8-2"), JSON.stringify(over));
  }
  const d = bundle((v) => { v.C04.push(view("C04", v.C04[0].ticker, "CHART_CANDIDATE")); });
  assert.ok(failing(d).includes("DQ-SF8-2"));
});

test("DQ-SF8-3 · Stufensperren: Stufe 4, ueber der Obergrenze, geaenderte Obergrenze, entsperrter Status", () => {
  assert.ok(failing(bundle((v) => { v.C04[0].stage = "CONFIRMED_RESEARCH_SETUP"; })).includes("DQ-SF8-3"), "C04 hoechstens Chart");
  assert.ok(failing(bundle((v) => { v.C11[0].stage = "MODELED_TRADE_PLAN"; v.C11[0].plan = { trigger: 1 }; })).includes("DQ-SF8-3"), "C11 hoechstens bestaetigt");
  assert.ok(failing(bundle((v) => { v.C12[0].stage = "VALIDATED_TRADE_SIGNAL"; })).includes("DQ-SF8-3"));
  assert.ok(failing(bundle((v) => { v.C06[0].stage = "UNKNOWN"; })).includes("DQ-SF8-3"));
  for (const mut of [(s) => { s.status.validatedTradeSignal = "UNLOCKED"; }, (s) => { s.status.liveReadiness = "LIVE_APPROVED"; }, (s) => { s.status.orders = "PAPER"; },
    (s) => { s.counts.validatedTradeSignal = 1; }, (s) => { s.counts.byStage.VALIDATED_TRADE_SIGNAL = 1; }, (s) => { s.strategies[3].ceiling = "MODELED_TRADE_PLAN"; },
    (s) => { s.strategies[0].liveReadiness = "LIVE_APPROVED"; }]) {
    const b = bundle(); mut(b.summary); assert.ok(failing(b).includes("DQ-SF8-3"), String(mut));
  }
});

test("DQ-SF8-4 · keine Order-/Stopmarke, kein Plan, keine rueckrechenbare Kennzahl unterhalb MODELED", () => {
  for (const mut of [(x) => { x.plan = { trigger: 1 }; }, (x) => { x.levels.trigger = 101; }, (x) => { x.levels.stopReference = 97; }, (x) => { x.levels.limit = 103; },
    (x) => { x.levels.initialStop = 97; }, (x) => { x.levels.entryPrice = 101; }, (x) => { x.levels.box = 1; x.levels.buyPoint = 101; }, (x) => { x.features.proposedStopRiskPct = 0.03; }, (x) => { x.features.closeVsTrigger = 0; },
    (x) => { x.features.stopLevel = 97; }, (x) => { x.features.stop = { level: 97 }; }, (x) => { x.features.entry = 101; },
    (x) => { x.pivot.kind = "ORDER_TRIGGER"; }, (x) => { x.pivot.kind = "PIVOT_PLUS_TICK"; }, (x) => { x.pivot.kind = "PIVOT"; }]) {
    assert.ok(failing(bundle((v) => mut(v.C09[0]))).includes("DQ-SF8-4"), String(mut));
  }
  /* Methoden, deren einzige Marke der Quelle die Order ist (Turtle, Holy Grail, Pocket Pivot, Parabolic Short): keine Chartmarke */
  assert.ok(failing(bundle((v) => { v.C01[0].pivot = { level: 99, kind: "BOX_TOP", distance: 0.01 }; })).includes("DQ-SF8-4"));
  assert.ok(failing(bundle((v) => { v.C13[0].levels.gapDayLow = 98; })).includes("DQ-SF8-4"), "Marke einer anderen Methode");
  assert.ok(!failing(bundle()).includes("DQ-SF8-4"), "MODELED darf Plan und Stop tragen; Statustexte und closeVsTop sind keine Order");
});

test("DQ-SF8-4 · Owner-Entscheidung 28.10.: closeVsGapLow (C12) beschreibend erlaubt; Turtle-N unterhalb MODELED nicht mehr (Owner 28.10., zweite Entscheidung)", () => {
  const ok = bundle((v) => { v.C12[0].stage = "CONFIRMED_RESEARCH_SETUP"; v.C12[0].plan = null; v.C12[0].levels = { gapDayLow: 98 }; v.C12[0].pivot = { level: 98, kind: "GAP_DAY_LOW", distance: 0.02 };
    v.C12[0].features = { closeVsGapLow: 0.0255, gapInAtr: 1.2 }; v.C01[0].features = { path: "FAILSAFE_55", breakoutAtOpen: false }; });
  assert.ok(!failing(ok).includes("DQ-SF8-4"), "beschreibend zulaessig");
  /* Turtle: N und nPct ergeben mit dem Trigger den Stop (Trigger - 2N); die fruehere Ausnahme gilt nicht mehr */
  for (const [c, f] of [["C01", { N: 0.64 }], ["C01", { nPct: 0.027 }], ["C02", { N: 0.64 }], ["C02", { nPct: 0.027 }]]) assert.ok(failing(bundle((v) => { const x = v[c][0]; x.stage = "CONFIRMED_RESEARCH_SETUP"; x.plan = null; x.features = f; })).includes("DQ-SF8-4"), c + " " + Object.keys(f));
  for (const [c, k] of [["C12", "stopDistance"], ["C12", "stopReference"], ["C12", "gapLowStop"], ["C01", "entryN"], ["C01", "stopN"], ["C01", "limitPrice"], ["C01", "triggerLevel"]]) {
    const b = bundle((v) => { const x = v[c][0]; if (x.stage === "MODELED_TRADE_PLAN") { x.stage = "CONFIRMED_RESEARCH_SETUP"; x.plan = null; } x.features[k] = 0.64; });
    assert.ok(failing(b).includes("DQ-SF8-4"), c + " features." + k);
  }
  /* unabhaengige Nachpruefung: ein umbenannter Orderpreis unter neutralem Namen faellt auf (Allowlist statt Sperrliste) */
  for (const [c, k] of [["C12", "orderPrice"], ["C12", "gapLowRiskReference"], ["C01", "channelHigh"], ["C01", "buyPoint"], ["C03", "boxTopPrice"], ["C13", "pullbackLevel"]]) {
    const b = bundle((v) => { const x = v[c][0]; if (x.stage === "MODELED_TRADE_PLAN") { x.stage = "CONFIRMED_RESEARCH_SETUP"; x.plan = null; } x.features[k] = 12.34; });
    assert.ok(failing(b).includes("DQ-SF8-4"), c + " features." + k);
  }
  /* zweite unabhaengige Nachpruefung: auch ausserhalb von features und verschachtelt (Mutationen A1-A8) */
  const probes = {
    "Feld oben": (v) => { v.C03[0].buyPoint = 22.9; },
    "trend": (v) => { v.C03[0].trend = { close: 22.66, buyPoint: 22.9 }; },
    "sortKeys": (v) => { v.C03[0].sortKeys = { stage: 0, entryPrice: 22.9 }; },
    "verschachtelt features": (v) => { v.C08[0].features = { momentum: { p1m: 0.9, buyPoint: 4.68 } }; },
    "Objekt features": (v) => { v.C08[0].features = { priorMove: { stop: 4.1 } }; },
    "verschachtelt levels": (v) => { v.C03[0].levels = { top: 98, box: { from: "2026-10-01", top: 98, bottom: 90, protective: 89 } }; },
    "Chartmarke nicht aus der Struktur": (v) => { v.C03[0].pivot = { level: 99.2, kind: "BOX_TOP", distance: 0.01 }; },
    "Feld in pivot": (v) => { v.C03[0].pivot = { level: 98, kind: "BOX_TOP", distance: 0.02, stop: 90 }; },
    "Preis im Text": (v) => { v.C03[0].planBlockers = ["BUY_STOP_22.9065_STOP_20.75"]; },
    "Preis in why": (v) => { v.C03[0].why = [{ code: "SETUP", detail: "Einstieg ab $22" }]; },
    "trailing als Zahl": (v) => { v.C13[0].features = { trailing: 41.2 }; },
    "Zahl in why": (v) => { v.C03[0].why = [{ code: "SETUP", ref: 23 }]; },
    "Zahl in dataQuality": (v) => { v.C03[0].dataQuality = { status: "PASS", notPass: [], quarantinedSessions: [], level: 22.9 }; },
    "Zahl in planBlockers": (v) => { v.C03[0].planBlockers = [23]; }
  };
  for (const [name, mut] of Object.entries(probes)) assert.ok(failing(bundle(mut)).includes("DQ-SF8-4"), name);
  /* vierte Nachpruefung (M2): Lesarten der Strategie und Kurzzeilen */
  const rd = (r) => { const b = bundle(); b.summary.strategies[0].readings = [r]; return failing(b).includes("DQ-SF8-4"); };
  assert.ok(rd({ ruleId: "TUR-SF-S1-OPEN-BREAKOUT", reading: "openBreakout=SKIP (Kanalhoch 348.37)" }), "Preis in einer Lesart");
  assert.ok(rd({ ruleId: "TUR-SF-S1-OPEN-BREAKOUT", reading: "x", level: 348 }), "Feld in einer Lesart");
  assert.ok(!rd({ ruleId: "MOKA-SF-BGU-VOLWINDOW", reading: "MA-MOKA-BGU-VOLWINDOW 50 sessions (owner decision D-BGU-VOLWINDOW)" }), "echte Lesart bleibt gruen");
  const rowProbe = bundle(); rowProbe.summary.top = { C03: [{ c: "C03", t: "AAPL", s: "CHART_CANDIDATE", q: "PASS", trigger: 101.2 }] };
  assert.ok(failing(rowProbe).includes("DQ-SF8-4"), "Feld in einer Kurzzeile");
  const rj = (r) => { const b = bundle(); b.index.rejectedRecords = [r]; return failing(b).includes("DQ-SF8-4"); };
  assert.ok(rj({ strategyId: "SF_C12", ticker: "AAPL", reason: "CONTRACT_VALIDATION_FAILED", stage: "MODELED_TRADE_PLAN", errors: ["PLAN_STOP_NOT_BELOW_ENTRY:98.2>=97.1"] }), "Preis im Ablehnungsgrund");
  assert.ok(rj({ strategyId: "SF_C12", ticker: "AAPL", reason: "CONTRACT_VALIDATION_FAILED", stop: 98 }), "Feld im Ablehnungsgrund");
  assert.ok(!rj({ strategyId: "SF_C12", ticker: "AAPL", reason: "CONTRACT_VALIDATION_FAILED", stage: "MODELED_TRADE_PLAN", errors: ["PLAN_STOP_NOT_BELOW_ENTRY", "UNKNOWN_FIELD:security.x"] }), "echte Codes bleiben gruen");
  /* die echten Formen bleiben gruen: Statuscodes mit Datum, verschachtelte VCP-Spur (seit #1056 ohne Tiefen), Box als Objekt */
  assert.ok(!failing(bundle((v) => {
    v.C06[0].features = { vcpFootprint: { contractions: 3, contractingLeftToRight: false } };
    v.C08[0].interpretations = [{ ruleId: "KK-SF-BO-MOMENTUM", id: "MI-SF8-KK-MOMENTUM-P98", ownerDecision: "O-6 (2026-10-26)" }];
    v.C03[0].levels = { top: 98, box: { from: "2026-10-01", to: "2026-10-23", top: 98, bottom: 90 } };
  })).includes("DQ-SF8-4"));
  /* Statustexte unter Order-Namen bleiben zulaessig, Zahlen nicht (C11 stop, C10 entry, C13 trailing) */
  assert.ok(!failing(bundle((v) => { v.C11[0].features = { stop: "NOT_IN_SOURCE (MOKA-SF-PP-STOP manuell)" }; v.C10[0].features = { entry: "DATA_BLOCKED (Intraday)" }; })).includes("DQ-SF8-4"));
  assert.ok(failing(bundle((v) => { v.C11[0].features = { stop: 41.2 }; })).includes("DQ-SF8-4"));
  /* auch als Marke: eine Risikoreferenz ist keine Strukturmarke */
  assert.ok(failing(bundle((v) => { v.C12[0].stage = "CHART_CANDIDATE"; v.C12[0].plan = null; v.C12[0].levels = { gapDayLow: 98, stopReference: 98 }; })).includes("DQ-SF8-4"));
});

test("DQ-SF8-4 · Vertrag = Erzeuger (#1056): keine Marke, die in ihrer Quelle der Orderpreis ist; Korrekturtiefe und 52-Wochen-Hoch dort ausgeblendet", () => {
  const red = (mut) => failing(bundle(mut)).includes("DQ-SF8-4");
  /* Marken, die in der Quelle Einstieg, Stop oder Teil der Order sind */
  assert.ok(red((v) => { v.C06[0].levels = { ma50: 9, pivot: 10 }; }), "C06 Pivot als Marke");
  assert.ok(red((v) => { v.C06[0].pivot = { level: 10, kind: "VCP_PROXY_PIVOT", distance: 0.01 }; v.C06[0].levels = { ma50: 9, pivot: 10 }; }), "C06 Chartmarke Pivot");
  assert.ok(red((v) => { v.C07[0].levels = { pivot: 10 }; v.C07[0].pivot = { level: 10, kind: "RUN_UP_HIGH", distance: 0.01 }; }), "C07 Pivot");
  assert.ok(red((v) => { v.C13[0].levels = { ema20: 9, swingLow: 8 }; }), "C13 swingLow = Stop");
  assert.ok(red((v) => { v.C13[0].levels = { ema20: 9, impulseHigh: 11 }; }), "C13 impulseHigh");
  assert.ok(red((v) => { v.C11[0].levels = { ma10: 9, signalDayLow: 8 }; }), "C11 signalDayLow");
  /* rechnerische Order-Groessen unter beschreibendem Namen */
  assert.ok(red((v) => { v.C07[0].features = { correction: 0.08 }; }), "C07 Korrekturtiefe = geplanter Verlust am Pivot");
  /* SEPA (Review 28.10.): Abstand zum Hoch und Basistiefe ergaeben das ausgeblendete Hoch wieder */
  assert.ok(red((v) => { v.C06[0].features = { pctBelowHigh52w: 0.0513 }; }), "C06 pctBelowHigh52w");
  assert.ok(red((v) => { v.C06[0].features = { largestCorrection: 0.13 }; }), "C06 largestCorrection");
  assert.ok(red((v) => { v.C06[0].features = { vcpFootprint: { contractions: 2, depths: [0.13, 0.08] } }; }), "C06 vcpFootprint.depths");
  assert.ok(!red((v) => { v.C06[0].features = { pctAboveLow52w: 1.25, vcpFootprint: { contractions: 2, contractingLeftToRight: true }, rangesContracting: true }; }), "C06 Beschreibung ohne Tiefen und ohne Basislaenge");
  /* Owner 28.10. (Rueckrechenbarkeit mit Tageskursen): Fenster und Anker, die Einstieg oder Stop ergeben */
  for (const [c, f, name] of [["C06", { baseLengthSessions: 40 }, "C06 baseLengthSessions"], ["C06", { vcpFootprint: { contractions: 2, baseSessions: 40 } }, "C06 vcpFootprint.baseSessions"],
    ["C07", { consolidationSessions: 19 }, "C07 consolidationSessions"], ["C13", { impulseHighDate: "2026-10-01" }, "C13 impulseHighDate"], ["C13", { adxAbove30Since: "2026-09-20" }, "C13 adxAbove30Since"],
    ["C07", { startVolumeVs50d: 2.4 }, "C07 startVolumeVs50d"], ["C06", { vcpFootprint: { contractions: 2, lastContractionVolumeVs50d: 0.9181395143618434 } }, "C06 vcpFootprint.lastContractionVolumeVs50d"],
    ["C04", { baseWeeks: 6 }, "C04 baseWeeks"], ["C05", { baseWeeks: 6 }, "C05 baseWeeks"]]) assert.ok(red((v) => { v[c][0].features = f; }), name);
  assert.ok(!red((v) => { v.C13[0].features = { adx: 0.31, closeVsEma20: 0.01 }; v.C04[0].features = { breakoutWeek: "2026-W43", breakoutDay: "2026-10-23", ma30w: 100 }; v.C03[0].features = { boxTopDate: "2026-10-01" }; }), "Ausbruchstag, Box-Daten, ADX bleiben");
  assert.ok(!red((v) => { v.C03[0].features = { boxDepth: 0.12 }; }), "andere Methoden: Tiefen bleiben");
  for (const c of ["C06", "C07", "C13"]) for (const k of ["high252", "belowHigh252"]) assert.ok(red((v) => { v[c][0].trend = { close: 10, [k]: k === "high252" ? 10.2 : 0.02 }; }), `${c} trend.${k}`);
  /* erlaubt bleibt: allgemeines 52-Wochen-Hoch anderer Methoden, Strukturmarken der Tabelle */
  assert.ok(!red((v) => { v.C03[0].trend = { close: 10, high252: 10.2, belowHigh252: 0.02 }; v.C11[0].trend = { close: 10, high252: 12, belowHigh252: 0.17 }; }), "C03/C11 52-Wochen-Hoch");
  assert.ok(!red((v) => { v.C06[0].levels = { ma50: 9, ma150: 8, ma200: 7 }; v.C13[0].levels = { ema20: 9 }; v.C07[0].levels = {}; v.C07[0].features = { reviewReasons: ["CONSOLIDATION_BEYOND_TYPICAL_DURATION"] }; }), "Tabelle des Erzeugers");
  /* die Tabellen sind festgeschrieben (Aenderung = fachliche Aenderung mit Gegenstueck im Erzeuger) */
  assert.deepEqual(DQ.SF8_STRUCTURE_LEVELS.C06, ["ma50", "ma150", "ma200"]); assert.deepEqual(DQ.SF8_STRUCTURE_LEVELS.C07, []);
  assert.deepEqual(DQ.SF8_STRUCTURE_LEVELS.C11, ["ma10", "ma50"]); assert.deepEqual(DQ.SF8_STRUCTURE_LEVELS.C13, ["ema20"]);
  assert.deepEqual(Object.keys(DQ.SF8_PIVOT_KINDS).sort(), ["C03", "C08", "C09", "C12"]);
  assert.deepEqual(DQ.SF8_FEATURES_HIDDEN, { C01: ["N", "nPct"], C02: ["N", "nPct"], C04: ["baseWeeks"], C05: ["baseWeeks"], C06: ["pctBelowHigh52w", "largestCorrection", "baseLengthSessions"], C07: ["correction", "consolidationSessions", "startVolumeVs50d"], C13: ["impulseHighDate", "adxAbove30Since"] });
  assert.deepEqual(DQ.SF8_SUBFIELDS_HIDDEN, { C06: { vcpFootprint: ["depths", "baseSessions", "lastContractionVolumeVs50d"] } });
  assert.deepEqual(DQ.SF8_PIVOT_LEVEL, { C03: "top", C08: "breakoutLevel", C09: "gapDayLow", C12: "gapDayLow" });
  /* Owner-Entscheidung 28.10.2026 (Weinstein): weder genauer Widerstand noch Chartmarke unterhalb von MODELED */
  for (const c of ["C04", "C05"]) {
    assert.ok(failing(bundle((v) => { v[c][0].levels = { ma30w: 20, resistance: 22.3 }; })).includes("DQ-SF8-4"), c + " levels.resistance");
    assert.ok(failing(bundle((v) => { v[c][0].levels = { ma30w: 20, resistance: 22.3 }; v[c][0].pivot = { level: 22.3, kind: "WEEKLY_RESISTANCE", distance: 0.01 }; })).includes("DQ-SF8-4"), c + " Chartmarke");
    assert.ok(!failing(bundle((v) => { v[c][0].levels = { ma30w: 20, breakoutWeek: "2026-W43", breakoutDay: "2026-10-20" }; v[c][0].pivot = null; })).includes("DQ-SF8-4"), c + " 30-Wochen-Linie, Ausbruchswoche und -tag bleiben");
  }
  assert.deepEqual(DQ.SF8_TREND_HIDDEN, { C06: ["high252", "belowHigh252"], C07: ["high252", "belowHigh252"], C13: ["high252", "belowHigh252"] });
});

test("DQ-SF8-5 · Quarantaene und DQ-Grenzen: Quarantaene ueber Chart, veroeffentlichtes FAIL, CAP ueberschritten", () => {
  assert.ok(failing(bundle((v) => { v.C11[0].dataQuality.quarantinedSessions = [{ date: "2026-05-01", flag: "DQ-K5" }]; })).includes("DQ-SF8-5"));
  assert.ok(!failing(bundle((v) => { v.C04[0].dataQuality.quarantinedSessions = [{ date: "2026-05-01", flag: "DQ-K5" }]; })).includes("DQ-SF8-5"), "Chart-Kandidat mit Quarantaene ist zulaessig");
  for (const mut of [(dq) => { dq.status = "FAIL"; }, (dq) => { delete dq.quarantinedSessions; }, (dq) => { dq.status = "CAP"; dq.notPass = [{ id: "PRICE_PARITY", status: "FAIL" }]; },
    (dq) => { dq.status = "CAP"; dq.notPass = [{ id: "SESSIONS", status: "CAP", caps: "CHART_CANDIDATE" }]; }, (dq) => { dq.notPass = [{ id: "ADJUSTMENT", status: "CAP", caps: "CHART_CANDIDATE" }]; }]) {
    assert.ok(failing(bundle((v) => mut(v.C13[0].dataQuality))).includes("DQ-SF8-5"), String(mut));
  }
  assert.ok(!failing(bundle((v) => { v.C13[0].dataQuality.notPass = [{ id: "PRICE_HISTORY_PARITY", status: "INFO" }]; })).includes("DQ-SF8-5"), "INFO ohne Stufenwirkung");
});

test("DQ-SF8-6 · Ergebnisvertraege: Schema, Methoden, fehlende Teile, Zaehlungen, Stand, Scherben, records/", () => {
  const cases = {
    schema: (b) => { b.summary.schema = "supertrader-sf8-candidates-0.9.0"; },
    records: (b) => { b.recordsPresent = true; },
    methode: (b) => { b.summary.strategies.pop(); },
    dateiFehlt: (b) => { b.strategies.C05 = null; },
    kopf: (b) => { b.strategies.C05.asOf = "2026-10-22"; },
    zaehlung: (b) => { b.summary.counts.candidates += 1; },
    stufenZaehlung: (b) => { b.summary.counts.byStage.CHART_CANDIDATE -= 1; },
    published: (b) => { b.summary.strategies[1].counts.published = 9; },
    fremdeAnsicht: (b) => { b.strategies.C05.views[0] = Object.assign({}, b.strategies.C05.views[0], { candidateId: "C06" }); },
    scherbeFehlt: (b) => { b.tickers[b.summary.tickerShards[0]] = null; },
    scherbeVerwaist: (b) => { b.tickers.ZZ = { schema: SCHEMA, asOf: ASOF, shard: "ZZ", views: [] }; },
    ansichtNichtInScherbe: (b) => { const k = b.summary.tickerShards[0]; b.tickers[k] = Object.assign({}, b.tickers[k], { views: b.tickers[k].views.slice(1) }); },
    ansichtNurInScherbe: (b) => { const k = b.summary.tickerShards[0]; b.tickers[k] = Object.assign({}, b.tickers[k], { views: b.tickers[k].views.concat([view("C04", "ZZZZ", "CHART_CANDIDATE")]) }); }
  };
  for (const [name, mut] of Object.entries(cases)) { const b = bundle(); mut(b); assert.ok(failing(b).includes("DQ-SF8-6"), name); }
});

test("DQ-SF8 · jede veroeffentlichte Ansicht zaehlt: Scherben, index.json, summary.top, fremde Strategiedatei (Review HIGH 2)", () => {
  const shard = (mut) => { const b = bundle(); const k = b.summary.tickerShards[0]; mut(b.tickers[k].views[0]); return failing(b); };
  assert.ok(shard((v) => { v.stage = "VALIDATED_TRADE_SIGNAL"; }).includes("DQ-SF8-3"), "Scherbe mit Stufe 4");
  assert.ok(shard((v) => { if (v.stage !== "MODELED_TRADE_PLAN") { v.plan = { entry: 1, stop: 0.9 }; v.levels.stopReference = 0.9; } else { v.stage = "VALIDATED_TRADE_SIGNAL"; } }).some((x) => x === "DQ-SF8-4" || x === "DQ-SF8-3"));
  assert.ok(shard((v) => { v.close = 1; }).includes("DQ-SF8-6"), "Scherbe weicht von der Strategiedatei ab");
  const idx = bundle(); idx.index.candidates[0].s = "VALIDATED_TRADE_SIGNAL"; assert.ok(failing(idx).includes("DQ-SF8-3"));
  const idx2 = bundle(); idx2.index.status.orders = "LIVE"; assert.ok(failing(idx2).includes("DQ-SF8-3"));
  const idx3 = bundle(); idx3.index.candidates[0].x = 1; assert.ok(failing(idx3).includes("DQ-SF8-6"));
  const idx4 = bundle(); idx4.index.candidates.pop(); assert.ok(failing(idx4).includes("DQ-SF8-6"));
  const idx5 = bundle(); idx5.index.candidates[0].q = "FAIL"; assert.ok(failing(idx5).includes("DQ-SF8-5"));
  const top = bundle(); top.summary.top.C04[0].s = "VALIDATED_TRADE_SIGNAL"; assert.ok(failing(top).includes("DQ-SF8-3"));
  const top2 = bundle(); top2.summary.top.C04.push(row(view("C04", "ZZZZ", "CHART_CANDIDATE"))); assert.ok(failing(top2).includes("DQ-SF8-6"));
  const noIdx = bundle(); noIdx.index = null; assert.ok(failing(noIdx).includes("DQ-SF8-6"), "index.json Pflicht");
  const extra = bundle(); extra.strategies.C14 = { schema: SCHEMA, strategyId: "SF_C14", candidateId: "C14", asOf: ASOF, views: [view("C04", "ZZZZ", "VALIDATED_TRADE_SIGNAL", { candidateId: "C14" })] };
  const f = failing(extra); assert.ok(f.includes("DQ-SF8-6") && f.includes("DQ-SF8-3"), "C14 ist keine Methode und wird trotzdem geprueft");
});

test("DQ-SF8-7 · Budget: eine Datei ueber 2 MB, zusammen ueber 16 MB", () => {
  const big = bundle(); big.files.push({ path: "strategy/C06.json", bytes: 2 * 1024 * 1024 + 1 });
  assert.ok(failing(big).includes("DQ-SF8-7"));
  const sum = bundle(); sum.files = Array.from({ length: 9 }, (_, k) => ({ path: "ticker/" + k + ".json", bytes: 1.9 * 1024 * 1024 }));
  assert.ok(failing(sum).includes("DQ-SF8-7"));
  const edge = bundle(); edge.files = [{ path: "strategy/C06.json", bytes: 2 * 1024 * 1024 }];
  assert.ok(!failing(edge).includes("DQ-SF8-7"), "genau 2 MB ist zulaessig");
});

test("DQ-SF8-8 · eine Preiswahrheit: ohne Toleranz, gleiche Sitzung, gleiche Identitaet", () => {
  const cent = bundle((v) => { v.C04[0].close = 100.51; });
  assert.ok(failing(cent).includes("DQ-SF8-8"), "ein Cent");
  assert.ok(!failing(bundle((v) => { v.C04[0].close = 100.504; })).includes("DQ-SF8-8"), "Rundungsregel der Veroeffentlichung");
  const id0 = Identity.securityIdForTicker("AAPL");
  for (const ref of [null, series("AAPL", { asOf: "2026-10-26", points: [[ASOF, 100.5], ["2026-10-26", 101]] }), series("AAPL", { asOf: "2026-10-22", points: [["2026-10-22", 100.5]] }),
    series("AAPL", { currency: "EUR" }), series("AAPL", { ticker: "AAPL.L" }), series("AAPL", { instrumentId: "AAPL.MX" }), series("AAPL", { securityId: "ref_X" }), series("AAPL", { dataMode: "mock" }), series("AAPL", { priceSeriesType: "RAW" })]) {
    const refs = Object.assign({}, REFS, { [id0]: ref });
    assert.ok(failing(bundle(), { referenceOf: (id) => refs[id] || null }).includes("DQ-SF8-8"), JSON.stringify(ref && { asOf: ref.asOf, currency: ref.currency, ticker: ref.ticker, dataMode: ref.dataMode, priceSeriesType: ref.priceSeriesType }));
  }
});

test("DQ-SF8 · Repository-Stand: vorbereitet, keine Daten -> alle Regeln PASS; --sf8-activated ohne Daten -> streng rot", () => {
  const run = (args) => spawnSync(process.execPath, [join(ROOT, "scripts", "core", "data-quality.mjs"), "--only=sf8", "--json", ...args], { encoding: "utf8" });
  const repo = run([]);
  assert.equal(repo.status, 0, repo.stderr);
  const rep = JSON.parse(repo.stdout);
  assert.equal(rep.rules.length, 8); assert.ok(rep.rules.every((r) => r.status === "PASS" && r.checked === 0));
  const empty = mkdtempSync(join(tmpdir(), "sf8-dq-"));
  try {
    const r = run(["--sf8-dir=" + empty, "--sf8-activated", "--strict"]);
    assert.equal(r.status, 2, "freigegeben ohne Daten faellt");
    mkdirSync(join(empty, "strategy")); writeFileSync(join(empty, "summary.json"), "{kaputt"); writeFileSync(join(empty, "fremd.txt"), "x");
    const r2 = run(["--sf8-dir=" + empty, "--sf8-activated", "--strict"]);
    assert.equal(r2.status, 2);
    assert.ok(JSON.parse(r2.stdout).rules.every((x) => x.status === "FAIL"));
  } finally { rmSync(empty, { recursive: true, force: true }); }
});
