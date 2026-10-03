/* Quant Radar (quant-radar-1.2.0, Alert-Vertrag 3.0.0): taegliche Ereignisse, Setup-Lebenszyklus,
   Alert-Vertrag und Evidenz-Status. Geprueft wird gegen die
   veroeffentlichten Artefakte, nicht gegen eingefrorene Zahlen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const Radar = require("../engines/quant-radar.js");
const Service = require("../api/product-services.js");
const Policy = require("../engines/display-policy.js");
const Query = require("../engines/query.js");
const gz = (p) => JSON.parse(gunzipSync(readFileSync(new URL(p, root))));
const api = Service.create({
  loadJSON: async (p) => JSON.parse(await readFile(new URL(p.slice(1), root), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(await readFile(new URL(p.slice(1), root))).toString("utf8")),
  displayPolicy: Policy, queryEngine: Query
});
const radar = gz("quant/data/product/radar-v1.json.gz");
const lifecycle = gz("quant/data/product/setup-lifecycle-v1.json.gz");
const evidence = JSON.parse(readFileSync(new URL("quant/data/product/evidence-status-v1.json", root), "utf8"));

test("jedes veroeffentlichte Ereignis erfuellt den Alert-Vertrag", () => {
  assert.equal(radar.schemaVersion, "quant-radar-1.2.0");
  assert.equal(radar.alertContract.schema, "quant-alert-event-3.0.0");
  assert.ok(radar.events.length > 0, "ein Radar ohne Ereignis waere ein Fehler im Build");
  for (const e of radar.events) {
    assert.deepEqual(Radar.eventViolations(e), [], e.id);
    for (const f of ["securityId", "ticker", "issuerId", "eventType", "occurredAt", "effectiveAt", "detectedAt", "validUntil", "previousState", "currentState", "trigger", "invalidation",
      "explanation", "evidence", "baseRate", "backtestEvidence", "trustState", "nextCondition", "dedupeKey", "isNew"])
      assert.ok(f in e, f + " fehlt in " + e.id);
    assert.equal(e.delivery, "NOT_CONFIGURED", "Zustellung gibt es noch keine - das Ereignis darf keine behaupten");
  }
  assert.equal(radar.measures.ALERT_READY_EVENTS, radar.events.length);
});

test("Alert-Vertrag 3.0.0: Ausloeser, Invalidierung, Base Rate, Backtest-Beleg, Vertrauen, Gueltigkeit und dedupeKey werden geprueft", () => {
  const ok = radar.events.find((e) => e.backtestEvidence.state === "AVAILABLE");
  assert.ok(ok, "mindestens ein Ereignis traegt historische Evidenz");
  assert.deepEqual(Radar.eventViolations(ok), []);
  assert.ok(Radar.eventViolations({ ...ok, trigger: null }).includes("TRIGGER_REQUIRED"));
  assert.ok(Radar.eventViolations({ ...ok, invalidation: { state: "NOT_DEFINED" } }).includes("INVALIDATION_REQUIRED"));
  assert.ok(Radar.eventViolations({ ...ok, trustState: "ROBUST" }).includes("TRUST_STATE_MISMATCH"));
  assert.ok(Radar.eventViolations({ ...ok, dedupeKey: "x" }).includes("DEDUPE_KEY_MISMATCH"));
  assert.ok(Radar.eventViolations({ ...ok, detectedAt: "2020-01-01T00:00:00Z" }).includes("INVALID_DETECTED_AT"));
  assert.ok(Radar.eventViolations({ ...ok, backtestEvidence: { state: "WITHHELD", trust: "NOT_READY" }, trustState: "NOT_READY", baseRate: null }).includes("BACKTEST_WITHHELD_WITHOUT_REASON"));
  /* Eine Trefferquote ohne Base Rate, eine erfundene Base Rate und ein ungueltiger Zeitraum werden abgelehnt. */
  assert.ok(Radar.eventViolations({ ...ok, baseRate: null }).includes("BASE_RATE_REQUIRED"));
  assert.ok(Radar.eventViolations({ ...ok, baseRate: { ...ok.baseRate, delta: ok.baseRate.delta + 0.05 } }).includes("BASE_RATE_INCONSISTENT"));
  assert.ok(Radar.eventViolations({ ...ok, validUntil: "2000-01-01" }).includes("INVALID_VALID_UNTIL"));
  assert.ok(Radar.eventViolations({ ...ok, isNew: undefined }).includes("IS_NEW_REQUIRED"));
  assert.ok(Radar.eventViolations({ ...ok, backtestEvidence: { ...ok.backtestEvidence, trust: "NOT_READY" }, trustState: "NOT_READY" }).includes("BACKTEST_EVIDENCE_INCOMPLETE"),
    "freigegebene Evidenz braucht mindestens eingeschraenktes Vertrauen");
  assert.equal(new Set(radar.events.map((e) => e.dedupeKey)).size, radar.events.length, "dedupeKey ist je Ereignis eindeutig");
  for (const e of radar.events) {
    const be = e.backtestEvidence;
    if (be.state === "AVAILABLE") assert.ok(["LIMITED", "USABLE", "ROBUST"].includes(be.trust) && be.returnType && be.n > 0, e.id);
    else assert.ok(be.reason, e.id);
  }
});

test("der Vertrag weist verbotene Felder und unbekannte Typen zurueck", () => {
  const ok = radar.events[0];
  assert.ok(Radar.eventViolations({ ...ok, hitRate: 0.7 }).includes("FORBIDDEN_KEY_hitRate"));
  assert.ok(Radar.eventViolations({ ...ok, expectedReturn: 0.1 }).includes("FORBIDDEN_KEY_expectedReturn"));
  assert.ok(Radar.eventViolations({ ...ok, eventType: "BUY_SIGNAL" }).includes("UNKNOWN_EVENT_TYPE"));
  assert.ok(Radar.eventViolations({ ...ok, evidence: [] }).includes("EVIDENCE_REQUIRED"));
  const { nextCondition, ...ohne } = ok;
  assert.ok(Radar.eventViolations(ohne).includes("MISSING_nextCondition"));
});

test("jedes Setup-Ereignis ist ein Wechsel zwischen den letzten beiden Setup-Staenden", () => {
  const dir = new URL("quant/data/product/setup-observation-history/setup-mapping-1.0.0/", root);
  const dates = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort();
  const cur = gz("quant/data/product/setup-observation-history/setup-mapping-1.0.0/" + dates.at(-1) + ".json.gz").rows;
  const prev = gz("quant/data/product/setup-observation-history/setup-mapping-1.0.0/" + dates.at(-2) + ".json.gz").rows;
  const setupEvents = radar.events.filter((e) => e.source === "SETUP");
  assert.ok(setupEvents.length > 0);
  for (const e of setupEvents) {
    assert.equal(e.occurredAt, dates.at(-1));
    assert.equal(e.previousState.setupState, prev[e.ticker][0], e.id);
    assert.equal(e.currentState.setupState, cur[e.ticker][0], e.id);
    assert.notEqual(e.previousState.setupState, e.currentState.setupState);
    if (e.eventType === "SETUP_CONFIRMED") assert.equal(e.currentState.setupState, "CONFIRMED");
    if (e.eventType === "SETUP_NEW") assert.equal(e.currentState.setupState, "SETUP_FORMING");
  }
});

test("geschlossene Engine-Zustaende werden nicht aus eigener Rechnung ausgerufen", () => {
  const typ = Object.fromEntries(radar.eventTypes.map((t) => [t.id, t]));
  assert.equal(typ.SETUP_INVALIDATED.state, "CLOSED");
  assert.equal(typ.SETUP_INVALIDATED.reason, "PATH_DEPENDENT_STATES_NOT_ACTIVATED");
  assert.equal(radar.events.filter((e) => e.eventType === "SETUP_INVALIDATED").length, 0);
  if (typ.PATTERN_MATCH_NEW.state === "CLOSED") assert.equal(radar.events.filter((e) => e.eventType === "PATTERN_MATCH_NEW").length, 0);
  /* Ein Lebenszyklus-Zustand jenseits der entscheidbaren Stufe steht nicht in der Tabelle. */
  for (const row of Object.values(lifecycle.rows)) assert.ok(["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED"].includes(row[0]));
  assert.equal(lifecycle.pathTier.state, "CLOSED");
});

test("die Kartenreihenfolge ist die offen gelegte Sortierregel - keine Note", () => {
  assert.equal(radar.priorityRule.version, "radar-priority-1.0.0");
  for (let i = 1; i < radar.cards.length; i++) assert.ok(Radar.compareCards(radar.cards[i - 1], radar.cards[i]) <= 0, "Karte " + i + " steht falsch");
  const keys = JSON.stringify(radar.cards[0]);
  for (const verboten of ["score\"", "rank\"", "grade", "totalScore", "composite"]) assert.ok(!keys.includes(verboten), "Karte traegt " + verboten);
});

test("Einstieg, Stop und Ziele einer Karte stammen aus dem veroeffentlichten Trade-Setup", () => {
  const card = radar.cards.find((c) => c.trade && c.trade.state === "AVAILABLE");
  assert.ok(card, "keine angereicherte Karte");
  const shard = gz("quant/data/product/technical-signals-v1/" + (card.ticker + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_") + ".json.gz");
  const ts = shard.instruments[card.ticker].bundle.tradeSetup;
  assert.deepEqual(card.trade.entry, [ts.entry.zoneLow, ts.entry.zoneHigh]);
  assert.equal(card.trade.invalidation, ts.analysisInvalidation.price);
  assert.deepEqual(card.trade.targets[0], [ts.targets[0].zoneLow, ts.targets[0].zoneHigh]);
});

test("Vergleichsfaelle einer Karte erscheinen nur ueber der Schwelle", () => {
  for (const c of radar.cards) {
    if (!c.replay || c.replay.sufficient) continue;
    for (const k of ["positiveShare", "medianReturn", "medianDrawdown", "chanceRisk"]) assert.equal(c.replay[k] ?? null, null, c.ticker + " " + k);
  }
  assert.ok(radar.cards.some((c) => c.replay && c.replay.sufficient && c.replay.completed >= 10));
});

test("Lebenszyklus: 'seit' ist der erste Stichtag der laufenden Folge", () => {
  const dates = lifecycle.snapshots;
  const snaps = dates.map((d) => gz("quant/data/product/setup-observation-history/setup-mapping-1.0.0/" + d + ".json.gz").rows);
  let geprueft = 0;
  for (const [t, row] of Object.entries(lifecycle.rows).slice(0, 400)) {
    const k = dates.indexOf(row[1]);
    assert.ok(k >= 0, t);
    for (let i = k; i < dates.length; i++) assert.equal(snaps[i][t][0], row[0], t + " " + dates[i]);
    if (k > 0 && snaps[k - 1][t]) { assert.notEqual(snaps[k - 1][t][0], row[0]); assert.equal(row[3], snaps[k - 1][t][0]); assert.equal(row[2], 0); }
    else { assert.equal(row[2], 1, "eine Folge ab der ersten Beobachtung ist eine Untergrenze"); assert.equal(row[3], null); }
    geprueft++;
  }
  assert.ok(geprueft > 100);
});

test("Dienste liefern Radar, Lebenszyklus und Evidenz-Status", async () => {
  const r = await api.getQuantRadar();
  assert.equal(r.state, "AVAILABLE");
  assert.equal(r.dropped, 0);
  assert.equal(r.cards.length, radar.cards.length);
  const card = await api.getRadarCard(radar.cards[0].ticker);
  assert.equal(card.state, "AVAILABLE");
  assert.deepEqual(card.card.events.map((e) => e.id), radar.cards[0].events.map((e) => e.id), "der Titel-Shard traegt dieselbe Karte wie der Radar");
  const l = await api.getSetupLifecycle("NVDA");
  assert.equal(l.state, "AVAILABLE");
  assert.equal(l.current, lifecycle.rows.NVDA[0]);
  assert.equal((await api.getSetupLifecycle("ZZZZZZ")).state, "UNAVAILABLE");
  const s = await api.getEvidenceStatus();
  assert.equal(s.state, "AVAILABLE");
});

test("Evidenz-Status: fünf Arten, getrennt; geschlossene Arten nennen gemessene Bedingungen", () => {
  assert.deepEqual(evidence.kinds.map((k) => k.id), ["HISTORICAL_REPLAY", "PATTERN_EVIDENCE", "STRATEGY_BACKTEST", "SETUP_BACKTEST", "SIGNAL_BACKTEST"]);
  const byId = Object.fromEntries(evidence.kinds.map((k) => [k.id, k]));
  assert.equal(byId.STRATEGY_BACKTEST.state, "WITHHELD");
  assert.equal(byId.SETUP_BACKTEST.state, "WITHHELD");
  for (const k of [byId.STRATEGY_BACKTEST, byId.SETUP_BACKTEST]) {
    assert.ok(k.checks.length >= 3);
    assert.ok(k.checks.some((c) => c.state === "FAIL"), "eine geschlossene Art ohne fehlschlagende Bedingung waere ein Widerspruch");
    for (const c of k.checks) assert.ok(c.required && c.measured !== undefined, c.id);
  }
  /* Keine Zahl einer geschlossenen Art. */
  for (const k of [byId.STRATEGY_BACKTEST, byId.SETUP_BACKTEST]) for (const verboten of ["hitRate", "cagr", "sharpe", "medianReturn", "positiveShare"]) assert.ok(!JSON.stringify(k).includes(verboten));
  assert.ok(evidence.measures.HISTORICAL_REPLAY_COVERAGE.sufficient.m6 > 0);
  /* Der Signal-Backtest nennt je Regel seine Stufe; veroeffentlicht nur mit mindestens eingeschraenktem Vertrauen. */
  for (const r of byId.SIGNAL_BACKTEST.rules) assert.equal(r.displayAllowed, ["LIMITED", "USABLE", "ROBUST"].includes(r.trust), r.id);
});

test("eine Karten-Invalidierung liegt immer unter dem Kurs (Aufwaerts-Setup)", () => {
  for (const c of radar.cards) {
    if (c.setup && typeof c.setup.invalidation === "number") assert.ok(c.setup.invalidation < c.setup.close, c.ticker + ": Invalidierung ueber dem Kurs");
    if (c.trade && c.trade.state === "AVAILABLE") assert.ok(c.trade.invalidation < c.trade.entry[0], c.ticker + ": Trade-Invalidierung nicht unter der Einstiegszone");
  }
});

test("QUANT_DECISION_INTELLIGENCE ist gemessen und jedes Kriterium belegt", () => {
  const di = JSON.parse(readFileSync(new URL("quant/data/product/decision-intelligence-v1.json", root), "utf8"));
  assert.equal(di.schemaVersion, "decision-intelligence-1.0.0");
  assert.equal(di.criteria.length, 8);
  for (const c of di.criteria) assert.ok(typeof c.measured === "string" && c.measured.length > 5, c.question);
  assert.equal(di.verdict, di.criteria.every((c) => c.pass) ? "PASS" : "FAIL");
  /* Die Stichprobe deckt die verlangten Faelle ab - auch die schwierigen. */
  for (const k of ["Bank", "REIT", "junge Aktie", "datenarme Aktie", "Small Cap"]) assert.ok(di.sample.some((r) => r.kind === k), k);
});

test("alert ledger: a key alarms once, a re-run of the same radar date keeps it new", () => {
  const ev = () => [{ dedupeKey: "A" }, { dedupeKey: "B" }];
  const keys = {};
  const first = ev(); Radar.markSeen(keys, first, "2026-09-30", "2026-10-01T05:00:00Z");
  assert.deepEqual(first.map((e) => e.isNew), [true, true]);
  /* Wiederholter Lauf zum selben Stichtag: weiter neu, erste Erkennung bleibt. */
  const rerun = ev(); Radar.markSeen(keys, rerun, "2026-09-30", "2026-10-01T13:00:00Z");
  assert.deepEqual(rerun.map((e) => e.isNew), [true, true]);
  assert.equal(rerun[0].detectedAt, "2026-10-01T05:00:00Z");
  /* Naechster Stichtag: derselbe Zustand alarmiert nicht noch einmal, ein neuer schon. */
  const next = [{ dedupeKey: "A" }, { dedupeKey: "C" }]; Radar.markSeen(keys, next, "2026-10-01", "2026-10-02T05:00:00Z");
  assert.deepEqual(next.map((e) => e.isNew), [false, true]);
  /* Sabotage: eine Ledger-Regel, die jeden bekannten Schluessel als alt meldet, faellt hier durch. */
  const broken = (k, es) => es.forEach((e) => { e.isNew = !k[e.dedupeKey]; k[e.dedupeKey] = k[e.dedupeKey] || ["x", "2026-09-30"]; });
  const k2 = {}; broken(k2, ev()); const again = ev(); broken(k2, again);
  assert.notDeepEqual(again.map((e) => e.isNew), rerun.map((e) => e.isNew));
});

test("Startseite: die Radar-Projektion ist eine Teilmenge desselben Radars, beobachtete Titel kommen aus den Scherben", async () => {
  /* Gemessen 03.10.2026: der ganze Radar (211 KB) hob die Startseite ueber
     ihr Ressourcenbudget. Die Projektion darf nichts Eigenes rechnen. */
  const home = gz("quant/data/product/radar-home-v1.json.gz");
  assert.equal(home.schemaVersion, Radar.HOME_PROJECTION_SCHEMA);
  assert.equal(home.asOf, radar.asOf);
  assert.deepEqual(home.summary, radar.summary);
  assert.deepEqual(home.sources, radar.sources);
  assert.equal(home.cardCount, radar.cards.length);
  assert.deepEqual(home.cards, radar.cards.slice(0, Radar.HOME_CARDS));
  const ids = new Set(home.cards.flatMap((c) => c.events.map((e) => e.id)));
  assert.deepEqual(home.events.map((e) => e.id).sort(), [...ids].sort(), "die Projektion traegt genau die Ereignisse ihrer Karten");
  assert.deepEqual(Radar.homeProjection(radar), { ...home, generatedAt: radar.generatedAt });
  const svc = await api.getQuantRadarHome();
  assert.equal(svc.state, "AVAILABLE");
  assert.ok(svc.cards.length >= 1 && svc.cards.length <= Radar.HOME_CARDS);
  /* Beobachtete Titel: dieselben Karten wie im ganzen Radar. */
  const watched = radar.cards.slice(10, 14).map((c) => c.ticker).concat(["ZZZZZZ"]);
  const cards = await api.getRadarCards(watched);
  assert.deepEqual(cards.map((c) => c.ticker).sort(), radar.cards.slice(10, 14).map((c) => c.ticker).sort());
  for (const c of cards) assert.deepEqual(c, radar.cards.find((x) => x.ticker === c.ticker));
  /* Die Startseite laedt den ganzen Radar nicht mehr. */
  const pages = readFileSync(new URL("quant/app/pages.js", root), "utf8");
  const start = pages.indexOf("async function home("), end = pages.indexOf("async function", start + 10);
  assert.ok(start > 0 && !/getQuantRadar\(\)/.test(pages.slice(start, end)), "die Startseite liest wieder den ganzen Radar");
});

/* =========================================================================
   METHODIKWECHSEL IST KEIN MARKTEREIGNIS (quant-radar-1.3.0, 03.10.2026)

   Gemessen am 02.10.2026: 571 "Evidenz veraendert", 670 "neues Muster",
   117 Faktor- und 55 Strategie-Wechsel entstanden aus der DEBT-Umstufung
   und der neuen Grundgesamtheit der Faktorevidenz - nicht aus der Aktie.
   ========================================================================= */
test("MC1 · gleiche Methodik: Uebergaenge werden Ereignisse (Gegenprobe)", () => {
  const m = Radar.snapshotMethod({ engine: "x-1.0.0", universe: "u1" });
  const r = Radar.compareSnapshots("EVIDENCE", { asOf: "2026-10-01", method: m }, { asOf: "2026-10-02", method: Radar.snapshotMethod({ universe: "u1", engine: "x-1.0.0" }) }, [1, 2, 3]);
  assert.deepEqual(r.transitions, [1, 2, 3]);
  assert.equal(r.rebase, null);
});

test("MC2 · andere Methodik oder unbelegte Methodik: kein Ereignis, nur ein internes METHOD_REBASE", () => {
  const a = Radar.snapshotMethod({ engine: "x-1.0.0", securityMaster: "us-security-master-1.2.0" });
  const b = Radar.snapshotMethod({ engine: "x-1.0.0", securityMaster: "us-security-master-1.3.0" });
  const r = Radar.compareSnapshots("EVIDENCE", { asOf: "2026-10-01", method: a }, { asOf: "2026-10-02", method: b }, [1, 2, 3]);
  assert.deepEqual(r.transitions, []);
  assert.equal(r.rebase.eventType, "METHOD_REBASE");
  assert.equal(r.rebase.reason, "METHOD_CHANGED");
  assert.deepEqual(r.rebase.changed, [{ component: "securityMaster", from: "us-security-master-1.2.0", to: "us-security-master-1.3.0" }]);
  assert.equal(r.rebase.suppressedTransitions, 3);
  assert.equal(r.rebase.userVisible, false); assert.equal(r.rebase.alerts, false); assert.equal(r.rebase.watchlist, false);
  /* Fehlt die Angabe, ist Gleichheit nicht belegt. */
  for (const [p, c, reason] of [[null, b, "PREVIOUS_SNAPSHOT_UNVERSIONED"], [a, null, "CURRENT_SNAPSHOT_UNVERSIONED"]]) {
    const x = Radar.compareSnapshots("FACTOR", { asOf: "a", method: p }, { asOf: "b", method: c }, [1]);
    assert.deepEqual(x.transitions, []); assert.equal(x.rebase.reason, reason);
  }
  /* METHOD_REBASE ist keine Ereignisart des Alert-Vertrags. */
  assert.equal(Radar.TYPE.METHOD_REBASE, undefined);
});

test("MC3 · der veroeffentlichte Radar: ein Methodikwechsel erzeugt weder Radar-, Watchlist- noch Alert-Ereignisse", () => {
  const rebases = radar.methodRebase || [];
  assert.equal(radar.measures.METHOD_REBASES, rebases.length);
  assert.equal(radar.measures.TRANSITIONS_SUPPRESSED_BY_METHOD_CHANGE, rebases.reduce((n, r) => n + r.suppressedTransitions, 0));
  const typesOf = { EVIDENCE: ["EVIDENCE_CHANGED"], PATTERN: ["PATTERN_MATCH_NEW"], FACTOR: ["FACTOR_CHANGED", "RISK_RISING"], STRATEGY: ["STRATEGY_MATCH_NEW", "STRATEGY_MATCH_LOST"] };
  const history = gz("quant/data/product/radar-history/events/" + radar.asOf + ".json.gz");
  for (const r of rebases) {
    assert.equal(r.userVisible, false);
    const types = typesOf[r.source];
    assert.ok(types, "unbekannte Quelle " + r.source);
    const leak = radar.events.filter((e) => types.includes(e.eventType) && e.occurredAt === r.asOf && e.previousAsOf === r.previousAsOf);
    assert.deepEqual(leak.map((e) => e.id), [], r.source + ": Ereignis trotz Methodikwechsel");
    assert.equal(radar.cards.some((c) => c.events.some((e) => types.includes(e.eventType) && e.occurredAt === r.asOf)), false, r.source + " in einer Karte");
    assert.equal(history.rows.some((row) => types.includes(row[1]) && row[3] === r.asOf), false, r.source + " in der Watchlist-Historie");
  }
  /* Nichts davon steht in den Ereignissen selbst. */
  assert.equal(radar.events.some((e) => e.eventType === "METHOD_REBASE"), false);
});

test("MC4 · unabhaengig nachgerechnet: wo die Staende keine belegt gleiche Methodik tragen, steht ein REBASE und kein Ereignis", () => {
  const latestTwo = (dir) => {
    const dates = readdirSync(new URL(dir, root)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort();
    return dates.length >= 2 ? dates.slice(-2).map((f) => gz(dir + f)) : null;
  };
  const factorDir = "quant/data/product/factor-evidence-history/" + readdirSync(new URL("quant/data/product/factor-evidence-history/", root)).filter((d) => /^vu-factor-evidence-/.test(d)).sort().pop() + "/";
  const cases = [["EVIDENCE", "quant/data/product/radar-history/replay-evidence/", ["EVIDENCE_CHANGED"]],
    ["PATTERN", "quant/data/product/radar-history/pattern-holds/", ["PATTERN_MATCH_NEW"]],
    ["FACTOR", factorDir, ["FACTOR_CHANGED", "RISK_RISING"]]];
  let geprueft = 0;
  for (const [source, dir, types] of cases) {
    const pair = latestTwo(dir);
    if (!pair) continue;
    const [a, b] = pair;
    const belegtGleich = !!(a.method && b.method && a.method.id && a.method.id === b.method.id);
    const rebase = (radar.methodRebase || []).find((r) => r.source === source && r.asOf === b.asOf);
    const events = radar.events.filter((e) => types.includes(e.eventType) && e.occurredAt === b.asOf);
    if (belegtGleich) assert.equal(rebase, undefined, source + ": REBASE trotz gleicher Methodik");
    else {
      geprueft++;
      assert.ok(rebase, source + ": Methodik nicht belegt gleich, aber kein REBASE");
      assert.deepEqual(events.map((e) => e.id), [], source + ": Ereignisse trotz Methodikwechsel");
    }
  }
  assert.ok(geprueft + cases.length > 0);
});
