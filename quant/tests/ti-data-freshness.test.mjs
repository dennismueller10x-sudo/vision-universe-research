/* Datenstand-Richtlinie data-freshness-1.0.0: kundensichtbare technische Thesen nur bei aktuellen Kursdaten. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = require("../engines/technical/ti/data-freshness.js");
const PJ = require("../engines/technical/projection/elliott-projection.js");
const Alerts = require("../engines/technical/ti/alerts.js");
const AiTools = require("../engines/technical/ti/ai-tools.js");
const Ask = require(join(ROOT, "ask/engine.js"));
const L = await import("../../scripts/technical/lib/ti-projection.mjs");
const FB = await import("../../scripts/technical/lib/ti-freshness.mjs");

const REF = "2026-10-09";   // Freitag
const at = (lastBar, extra = {}) => F.classify(Object.assign({ lastBar, reference: REF, venue: "NASDAQ", active: true }, extra));

test("D-1 · FRESH bis 1 Handelstag, DELAYED 2–5, STALE ab 6 (Grenzen)", () => {
  assert.equal(at("2026-10-09").state, "FRESH"); assert.equal(at("2026-10-09").ageTradingDays, 0);
  assert.equal(at("2026-10-08").state, "FRESH"); assert.equal(at("2026-10-08").ageTradingDays, 1);
  assert.equal(at("2026-10-07").state, "DELAYED"); assert.equal(at("2026-10-07").ageTradingDays, 2);
  assert.equal(at("2026-10-02").state, "DELAYED"); assert.equal(at("2026-10-02").ageTradingDays, 5);
  assert.equal(at("2026-10-01").state, "STALE"); assert.equal(at("2026-10-01").ageTradingDays, 6);
  assert.equal(at("2026-08-17").state, "STALE");
  assert.equal(at("2026-08-17").withheld, true); assert.equal(at("2026-10-07").withheld, false);
  assert.equal(at(null).state, "STALE");
});

test("D-2 · Handelstage, nicht Kalendertage: Wochenende und Feiertage zaehlen nicht", () => {
  assert.equal(F.tradingDaysBetween("2026-10-02", "2026-10-05"), 1, "Freitag → Montag = 1 Handelstag");
  assert.equal(F.tradingDaysBetween("2026-09-04", "2026-09-08"), 1, "Labor Day (07.09.) zaehlt nicht");
  assert.equal(F.tradingDaysBetween("2026-12-24", "2026-12-28"), 1, "Weihnachten (Fr 25.12.) zaehlt nicht");
  for (const d of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25", "2027-06-18", "2022-06-20"]) assert.equal(F.isTradingDay(d), false, d);
  assert.equal(F.isTradingDay("2021-12-31"), true, "Neujahr auf Samstag entfaellt ohne Ersatztag");
  assert.equal(F.lastCompletedSession("2026-10-12T03:39:22Z"), "2026-10-09", "Montag frueh → Freitag");
  assert.equal(F.lastCompletedSession("2026-10-09T22:30:00Z"), "2026-10-09"); assert.equal(F.lastCompletedSession("2026-10-09T15:00:00Z"), "2026-10-08");
  assert.equal(F.calendarFor("XETRA"), "WEEKDAYS"); assert.equal(F.calendarFor("NYSE ARCA"), "US_EQUITY");
});

test("D-3 · Inaktiver Titel: NON_TRADING (nicht frisch), aber nie bei frischen Kursen; Grund belegt", () => {
  const a = at("2026-10-02", { active: false }); assert.equal(a.state, "NON_TRADING"); assert.equal(a.withheld, true); assert.equal(a.reason.code, "SECURITY_INACTIVE"); assert.equal(a.reason.known, true);
  assert.equal(at("2026-10-09", { active: false }).state, "FRESH");
  assert.equal(at("2026-10-02", { delistedAt: "2026-10-02" }).state, "NON_TRADING");
});

test("D-4 · Ursachen werden nur als belegt ausgewiesen, wenn der Stamm sie belegt; sonst 'nicht bestimmbar' zur Untersuchung", () => {
  const long = at("2026-08-17", { refreshedAt: "2026-09-15" }); assert.equal(long.reason.code, "NO_NEWER_BARS"); assert.equal(long.reason.known, false);
  const stop = at("2026-09-30", { refreshedAt: "2026-10-01" }); assert.equal(stop.reason.code, "REFRESH_STOPPED"); assert.equal(stop.reason.known, false);
  assert.equal(at("2026-10-09").reason, null);
});

test("D-5 · Keine Ticker-Ausnahmen: gleiche Eingabe → gleiches Ergebnis; Quelltext nennt keinen Titel", () => {
  const src = readFileSync(join(ROOT, "quant/engines/technical/ti/data-freshness.js"), "utf8") + readFileSync(join(ROOT, "scripts/technical/lib/ti-freshness.mjs"), "utf8");
  assert.ok(!/\b(TALK|AAPL|DBRG|FSEA|GBTG|NSTS|WBD|QRVO|SE|OSCR|XPEV|CGC|VTEX)\b/.test(src.replace(/\bSE\b(?=[ -])/g, "")), "kein Ticker im Quelltext");
  const a = F.classify({ lastBar: "2026-08-17", reference: REF, venue: "NASDAQ", active: true, symbol: "AAA" }), b = F.classify({ lastBar: "2026-08-17", reference: REF, venue: "NASDAQ", active: true, symbol: "ZZZ" });
  assert.deepEqual(a, b);
});

test("D-6 · Kundentexte (Deutsch) und kompakte Form", () => {
  const d = F.labels(at("2026-10-01".replace("10-01", "10-05"))); assert.equal(d.badge, "Kursdaten verzögert · letzter Stand 05.10.2026"); assert.equal(d.line, "Datenstand: 05.10.2026 · verzögert");
  const s = F.labels(at("2026-08-17")); assert.equal(s.title, "Analyse zurückgehalten"); assert.equal(s.text, "Die Kursreihe ist nicht aktuell genug für eine laufende technische These."); assert.equal(s.badge, "Zurückgehalten – Kursdaten veraltet");
  assert.equal(F.labels(at("2026-10-09")).badge, null);
  assert.deepEqual(F.compact(at("2026-08-17")), { st: "STALE", age: 38, last: "2026-08-17", ref: REF, rc: "REFRESH_STOPPED" });
});

/* ---- Zurueckhalten im Produkt ---- */
const payload = () => ({ schemaVersion: "vu-ti-api-3.0.0", symbol: "ZZT", timeframe: "1W", asOf: "2026-08-17", price: { close: 5.25, atr: 0.2 }, dataQuality: { bars: 300 }, chart: { timestamps: ["2026-08-17"], close: [5.25] }, overlays: { zones: [{ kind: "ENTRY", lo: 5.2, hi: 5.3 }], invalidations: [{ price: 5.05 }], projectedPaths: [{ pts: [1, 2] }], waves: [{ label: "C", pattern: "FLAT" }] }, versions: { api: "x" }, diagnostics: {}, history: { cases: [{ date: "2026-09-21", direction: "BULLISH", outcome: "HIT" }] },
  outlook: { label: "BULLISH", structure: "UPTREND_ADVANCING", confidence: "LOW" }, scenarios: [{ kind: "PRIMARY", direction: "BULLISH" }], alerts: { scenarioId: "s", outlook: "BULLISH", direction: "BULLISH", levels: { entryLow: 5.2 }, flags: { inEntryZone: true } },
  regime: {}, confidence: {}, confluence: {}, signature: {}, evidence: {}, timeframes: {}, clarity: {}, evidenceBadge: {}, explain: { summary: "x" }, pro: { elliott: { primary: {} } },
  projection: { status: "OK", consumerVisible: true, primary: { key: "K" } }, projectionWeekly: { status: "OK", consumerVisible: true, primary: { key: "K" }, exploreHighlights: [{ key: "H" }], exploreCandidates: [{ key: "C" }] },
  motiveCandidate: { reason: "x" }, exploreCandidates: { version: "v", reason: "r", pool: 9, eligible: 2, highlights: 1, candidates: 1 } });

test("D-7 · Zurueckhalten: keine laufende These in Shard und Index, Tatsachen bleiben, Original unveraendert; Candidate Explorer ebenso", () => {
  const p = payload(), before = JSON.stringify(p), f = at("2026-08-17", { refreshedAt: "2026-09-15" });
  const w = FB.withholdPayload(p, f);
  assert.equal(JSON.stringify(p), before, "Original bleibt unveraendert");
  assert.equal(w.withheld, true); assert.equal(w.freshness.state, "STALE"); assert.equal(w.freshness.title, "Analyse zurückgehalten");
  assert.deepEqual(w.scenarios, []); assert.equal(w.alerts, null); assert.equal(w.outlook.label, "WITHHELD"); assert.equal(w.outlook.structure, null);
  for (const pr of [w.projection, w.projectionWeekly]) { assert.equal(pr.status, "WITHHELD"); assert.equal(pr.consumerVisible, false); assert.equal(pr.primary, null); assert.equal(pr.alternative, null); assert.equal(pr.motiveAlternative, null); assert.deepEqual(pr.exploreHighlights, []); assert.deepEqual(pr.exploreCandidates, []); }
  assert.equal(w.exploreCandidates.candidates, 0); assert.equal(w.exploreCandidates.highlights, 0); assert.equal(w.motiveCandidate, null);
  assert.deepEqual(w.pro, { withheld: true }, "keine Elliott-Zaehlung im Produkt");
  assert.equal(w.price.close, 5.25); assert.ok(w.chart && w.dataQuality, "Kurs, Chart und Datenqualitaet bleiben als Tatsachen");
  assert.ok(!/BULLISH|"key":"K"|"key":"H"|"key":"C"|zones|invalidations|projectedPaths|waves|ENTRY|HIT/.test(JSON.stringify(w).replace('"label":"WITHHELD"', "")), "keine These im Text (auch nicht in overlays/history)");
  assert.deepEqual(w.overlays, { withheld: true }); assert.deepEqual(w.history, { withheld: true });
  const row = FB.withheldIndexRow(p, f);
  assert.equal(row.withheld, 1); assert.equal(row.outlook, null); assert.equal(row.direction, null); assert.equal(row.entry, null); assert.equal(row.proj, null); assert.equal(row.alerts, null); assert.deepEqual(row.fr, F.compact(f));
});

test("D-8 · DELAYED und FRESH: Payload unveraendert nutzbar; Hinweis nur bei DELAYED", () => {
  const f = at("2026-10-05"), blk = FB.shardBlock(f);
  assert.equal(blk.withheld, false); assert.equal(blk.badge, "Kursdaten verzögert · letzter Stand 05.10.2026"); assert.equal(blk.line, "Datenstand: 05.10.2026 · verzögert");
  assert.equal(FB.shardBlock(at("2026-10-09")).badge, null);
});

test("D-9 · Statistik: betroffene Thesen werden vor dem Zurueckhalten gezaehlt (Primaer, Alternativen, Highlights, Candidates)", () => {
  const s = FB.newStats(REF), p = payload(); p.projectionWeekly.alternative = { key: "A" }; p.projectionWeekly.motiveAlternative = { key: "M" };
  FB.addStats(s, p, at("2026-08-17")); FB.addStats(s, payload(), at("2026-10-09")); FB.addStats(s, payload(), at("2026-10-07"));
  assert.deepEqual(s.states, { STALE: 1, FRESH: 1, DELAYED: 1 }); assert.equal(s.affected.titles, 1); assert.equal(s.affected.primary, 1); assert.equal(s.affected.alternative, 1); assert.equal(s.affected.motiveAlternative, 1);
  assert.equal(s.affected.exploreHighlights, 1); assert.equal(s.affected.exploreCandidates, 1); assert.equal(s.delayedWithNotice, 1); assert.deepEqual(s.withheldTitles, ["ZZT"]);
  assert.equal(s.ageBuckets["21-40"], 1);
});

/* ---- Alerts ---- */
test("D-10 · Alerts: zurueckgehaltene Titel erzeugen weder beim Zurueckhalten noch bei der Wiederaufnahme Ereignisse", () => {
  const live = { t: "X", asOf: "2026-10-02", alerts: { scenarioId: "s1", direction: "BULLISH", confidence: "HIGH", flags: { inEntryZone: false }, levels: {} } };
  const hold = { t: "X", asOf: "2026-10-09", withheld: 1, alerts: null };
  const resumed = { t: "X", asOf: "2026-10-16", alerts: { scenarioId: "s2", direction: "BEARISH", confidence: "LOW", flags: { inEntryZone: true }, levels: { entryLow: 1, entryHigh: 2 } } };
  assert.equal(Alerts.diffRun({ methodologyKey: "m", rows: [live] }, { methodologyKey: "m", rows: [hold] }).events.length, 0);
  assert.equal(Alerts.diffRun({ methodologyKey: "m", rows: [hold] }, { methodologyKey: "m", rows: [resumed] }).events.length, 0, "Wiederaufnahme = neuer Ausgangszustand");
  assert.ok(Alerts.diffRun({ methodologyKey: "m", rows: [live] }, { methodologyKey: "m", rows: [Object.assign({}, resumed, { asOf: "2026-10-09" })] }).events.length > 0, "Gegenprobe: ohne Zurueckhalten entstehen Ereignisse");
});

/* ---- VU Ask ---- */
const idxRow = (o) => Object.assign({ t: "ZZT", tf: "1W", asOf: "2026-08-17", close: 5.25, outlook: "BULLISH", structure: "UPTREND_ADVANCING", confidence: "LOW", direction: "BULLISH", template: "CONTINUATION", status: "IN_ENTRY_ZONE", entry: [5.2, 5.3], invalidation: 5.05, t1: null, elliottApplicable: "MODERATE", elliott: "FLAT:C" }, o);

test("D-11 · VU Ask beschreibt zurueckgehaltene Titel nie als aktuell; verzoegerte mit Hinweis; frische unveraendert", () => {
  const wh = AiTools.situation(idxRow({ withheld: 1, outlook: null, direction: null, entry: null, invalidation: null, elliott: null, fr: { st: "STALE", age: 38, last: "2026-08-17", ref: REF, rc: "NO_NEWER_BARS" } }), { symbol: "ZZT" });
  assert.equal(wh.withheld, true); assert.equal(wh.outlook, null); assert.equal(wh.primaryScenario, null); assert.equal(wh.elliott.abstained, true);
  assert.match(wh.notice, /Analyse zurückgehalten\. Die Kursreihe ist nicht aktuell genug für eine laufende technische These\. Letzter Stand: 17\.08\.2026\./);
  const sentence = Ask.chartbildSentence(wh); assert.ok(/zurückgehalten/.test(sentence) && !/Ausblick|Hauptszenario|Aufwärts/.test(sentence), sentence);
  /* selbst ein Index, der die These noch traegt (aelterer Lauf), wird anhand des Zustands zurueckgehalten */
  const leak = AiTools.situation(idxRow({ fr: { st: "STALE", age: 38, last: "2026-08-17", ref: REF, rc: "NO_NEWER_BARS" } }), { symbol: "ZZT" });
  assert.equal(leak.withheld, true); assert.equal(leak.primaryScenario, null);
  const de = AiTools.situation(idxRow({ asOf: "2026-10-05", fr: { st: "DELAYED", age: 4, last: "2026-10-05", ref: REF, rc: "REFRESH_STOPPED" } }), { symbol: "ZZT" });
  assert.equal(de.withheld, undefined); assert.equal(de.delayed, true); assert.equal(de.notice, "Kursdaten verzögert · letzter Stand 05.10.2026"); assert.ok(de.primaryScenario, "These bleibt sichtbar");
  assert.ok(/Kursdaten verzögert/.test(Ask.chartbildSentence(de)));
  const fresh = AiTools.situation(idxRow({ asOf: "2026-10-09" }), { symbol: "ZZT" }); assert.equal(fresh.withheld, undefined); assert.equal(fresh.delayed, false); assert.equal(fresh.notice, null);
});

test("D-12 · Kundentexte in VU Ask und Richtlinie sind wortgleich", () => {
  for (const f of [at("2026-10-05"), at("2026-08-17"), at("2026-10-02", { active: false })]) {
    const a = AiTools.freshnessInfo(F.compact(f), { asOf: f.lastBar }), b = F.labels(f);
    assert.equal(a.badge, b.badge); assert.equal(a.title, b.title); assert.equal(a.text, b.text);
  }
});

/* ---- Lebenszyklus ---- */
const LABELS = { IMPULSE: ["1", "2", "3", "4", "5"], FLAT: ["A", "B", "C"], ZIGZAG: ["A", "B", "C"] };
function count(pattern, prices, o = {}) {
  const waves = []; for (let k = 1; k < prices.length; k++) waves.push({ label: LABELS[pattern][k - 1], fromTime: "2020-01-" + String(k).padStart(2, "0"), toTime: "2020-01-" + String(k + 1).padStart(2, "0"), fromPrice: prices[k - 1], toPrice: prices[k], status: o.complete || k < prices.length - 1 ? "CONFIRMED" : "DEVELOPING" });
  const up = prices[1] > prices[0];
  return { pattern, patternName: pattern, variant: null, direction: up ? "UP" : "DOWN", complete: !!o.complete, currentWave: o.complete ? { label: "nach", role: "COMPLETE" } : { label: LABELS[pattern][waves.length - 1], wave: waves.length }, nextMove: o.nextMove || null, waves,
    invalidation: o.invalidation === undefined ? { price: prices[0], direction: up ? "below" : "above", ruleId: "W2_NOT_BEYOND_W1_ORIGIN", kind: "HARD_RULE" } : o.invalidation, revision: o.revision || null, persistenceKey: o.key === undefined ? null : o.key, ruleAudit: { validity: "VALID", openRules: [], hardRules: ["W2_NOT_BEYOND_W1_ORIGIN"] }, countQuality: null };
}
const corr = () => Object.assign(count("FLAT", [30, 20, 29, 21], { complete: true, nextMove: "UP", invalidation: null, revision: { price: 21, direction: "below", ruleId: "PATTERN_END" } }), { persistenceKey: "FLAT|30|-1" });
const E = (primary) => ({ engineVersion: "elliott-3.2.2", ruleSetVersion: "elliott-rules-3.1.0", applicability: { abstain: false, level: "LOW" }, primary, alternatives: [], higherDegree: null, dataQuality: { suspectedSplits: 0 } });
const G = () => ({ G2: { passed: false, value: 0.4, threshold: 1 }, G3: { passed: true, value: 4, threshold: 3 }, G4: { passed: true, value: 40, threshold: 26 }, G5: { passed: true, value: 1, threshold: 0.5 } });
const mkProj = () => PJ.build(Object.assign(E(corr()), { explore: { version: "explore-pool-1.0.0", items: [{ count: count("IMPULSE", [10, 30, 16]), rank: 5, pool: 171, gates: G(), failed: ["G2"] }] } }),
  { close: 22, asOf: "2020-02-01", timeframe: "1W", trend: { state: "UP" }, structureVote: 1, rs: { rank: 0.5, rankPrev: 0.5, universe: 100 } });
const item = (proj, freshness, asOf, bars) => ({ symbol: "X", tf: "1W", proj, bars, asOf, freshness });
const FR = (st, withheld) => ({ st, age: withheld ? 38 : 0, last: "2020-02-01", ref: "2020-03-27", rc: withheld ? "NO_NEWER_BARS" : null, withheld });

test("D-13 · Lebenszyklus: Zurueckhalten haengt WITHHELD_STALE_DATA an (einmal), Historie und Zustand bleiben, Wiederaufnahme haengt VISIBILITY_RESTORED an – nur anhaengen", () => {
  const proj = mkProj(); assert.ok(proj.exploreHighlights.length >= 1, "Fixture hat ein Highlight");
  const bars = { t: ["2020-02-01"], c: [22] };
  const a = L.advanceStore(null, [item(proj, FR("FRESH", false), "2020-02-01", bars)], { projection: PJ.VERSION });
  const id = Object.keys(a.store.theses)[0], t0 = a.store.theses[id];
  const b = L.advanceStore(a.store, [item(proj, FR("STALE", true), "2020-02-01", bars)], { projection: PJ.VERSION });
  const t1 = b.store.theses[id];
  assert.equal(t1.visibility, "WITHHELD"); assert.equal(t1.state, t0.state, "Zustand der These unveraendert"); assert.equal(t1.revisions.length, t0.revisions.length, "Revisionen unveraendert");
  assert.deepEqual(t1.events.slice(0, t0.events.length), t0.events, "bestehende Ereignisse unveraendert (nur angehaengt)");
  const w = t1.events.filter((e) => e.type === "WITHHELD_STALE_DATA"); assert.equal(w.length, 1); assert.equal(w[0].lastBar, "2020-02-01"); assert.equal(w[0].ageTradingDays, 38); assert.equal(w[0].freshness, "STALE");
  /* Wiederholung: kein zweites Ereignis */
  const c = L.advanceStore(b.store, [item(proj, FR("STALE", true), "2020-02-01", bars)], { projection: PJ.VERSION });
  assert.equal(c.store.theses[id].events.filter((e) => e.type === "WITHHELD_STALE_DATA").length, 1);
  /* die vollstaendige These bleibt auch fuer ein zurueckgehaltenes Produkt im Store (Historie) */
  assert.ok(c.store.theses[id].revisions.length >= 1 && c.store.theses[id].key);
  /* frische Daten: Sichtbarkeit wieder hergestellt, ueber ein neues Ereignis */
  const d = L.advanceStore(c.store, [item(proj, FR("FRESH", false), "2020-02-01", bars)], { projection: PJ.VERSION });
  assert.equal(d.store.theses[id].visibility, "VISIBLE"); assert.equal(d.store.theses[id].events.filter((e) => e.type === "VISIBILITY_RESTORED").length, 1);
  assert.deepEqual(d.store.theses[id].events.slice(0, c.store.theses[id].events.length), c.store.theses[id].events);
  const e2 = L.advanceStore(d.store, [item(proj, FR("FRESH", false), "2020-02-01", bars)], { projection: PJ.VERSION });
  assert.equal(e2.store.theses[id].events.length, d.store.theses[id].events.length, "idempotent");
});

test("D-14 · Frische Titel ohne Vorgeschichte bekommen weder Sichtbarkeitsfeld noch Ereignis", () => {
  const proj = mkProj(), a = L.advanceStore(null, [item(proj, FR("FRESH", false), "2020-02-01", { t: ["2020-02-01"], c: [22] })], { projection: PJ.VERSION });
  for (const e of Object.values(a.store.theses)) { assert.equal(e.visibility, undefined); assert.ok(!e.events.some((x) => /WITHHELD_STALE_DATA|VISIBILITY_RESTORED/.test(x.type))); }
});

test("D-15 · Ereignisnamen sind im Chartbild beschriftet", () => {
  assert.equal(PJ.STATE_DE.WITHHELD_STALE_DATA, "Zurückgehalten – Kursdaten veraltet"); assert.equal(PJ.STATE_DE.VISIBILITY_RESTORED, "Wieder angezeigt – Kursdaten aktuell");
});

test("D-16 · Richtlinie ist eingefroren und nennt Version und Schwellen", () => {
  assert.equal(F.VERSION, "data-freshness-1.0.0"); assert.equal(F.POLICY.freshMaxTradingDays, 1); assert.equal(F.POLICY.delayedMaxTradingDays, 5); assert.throws(() => { "use strict"; F.POLICY.freshMaxTradingDays = 9; });
});


test("D-17 · Systemischer Ausfall: mehr als 20 % zurueckgehalten → Build bricht ab; Bezugstag wird validiert", () => {
  const s = FB.newStats(REF); for (let i = 0; i < 10; i++) FB.addStats(s, payload(), at(i < 3 ? "2026-08-17" : "2026-10-09"));
  const c = FB.systemicCheck(s); assert.equal(c.systemic, true); assert.equal(c.share, 0.3);
  const ok = FB.newStats(REF); for (let i = 0; i < 100; i++) FB.addStats(ok, payload(), at(i < 5 ? "2026-08-17" : "2026-10-09")); assert.equal(FB.systemicCheck(ok).systemic, false);
  assert.equal(FB.validReference("2026-10-09"), true); for (const bad of ["foo", "2026-13-40", "09.10.2026", undefined]) assert.equal(FB.validReference(bad), false, String(bad));
});

test("D-18 · VU Ask: getChartbild/-Alternatives tragen bei verzoegerten Daten den Hinweis, bei zurueckgehaltenen nur den Zustand", async () => {
  const reg = { tools: {}, register(def, fn) { this.tools[def.name] = fn; } };
  const analysis = (extra) => Object.assign({ asOf: "2026-10-05", timeframe: "1W", explain: { facts: ["x"], summary: "s", evidence: "e" }, scenarios: [{ kind: "PRIMARY", direction: "BULLISH" }], pro: { elliott: null } }, extra);
  const mk = (a) => ({ getAnalysis: () => Promise.resolve({ state: "AVAILABLE", analysis: a }) });
  AiTools.register(reg, mk(analysis({ freshness: { state: "DELAYED", lastBar: "2026-10-05", ageTradingDays: 4, badge: "Kursdaten verzögert · letzter Stand 05.10.2026" } })));
  const d = await reg.tools.getChartbild({ symbol: "ZZT" }); assert.equal(d.found, true); assert.equal(d.notice, "Kursdaten verzögert · letzter Stand 05.10.2026"); assert.equal(d.freshness.state, "DELAYED");
  const da = await reg.tools.getChartbildAlternatives({ symbol: "ZZT" }); assert.equal(da.notice, "Kursdaten verzögert · letzter Stand 05.10.2026");
  AiTools.register(reg, mk(analysis({ withheld: true, freshness: { state: "STALE", lastBar: "2026-08-17", ageTradingDays: 38, reason: { code: "NO_NEWER_BARS" }, title: "Analyse zurückgehalten", text: "Die Kursreihe ist nicht aktuell genug für eine laufende technische These." } })));
  const w = await reg.tools.getChartbild({ symbol: "ZZT" }); assert.equal(w.withheld, true); assert.equal(w.facts, undefined); assert.equal(w.summaryText, undefined); assert.match(w.notice, /Analyse zurückgehalten\. Die Kursreihe ist nicht aktuell genug/);
  const wa = await reg.tools.getChartbildAlternatives({ symbol: "ZZT" }); assert.equal(wa.withheld, true); assert.equal(wa.scenarios, undefined);
});
