/* Practitioner Reference Benchmark — Pipeline-Tests (Mission V §124).
   Alle Referenzen hier sind ausdruecklich TEST_FIXTURE (sourceId 'test-fixture-*', URLs https://example.invalid/…) und
   duerfen nie in einen Bericht gelangen. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as C from "../../scripts/technical/practitioner/cutoff.mjs";
import * as L from "../../scripts/technical/practitioner/lib.mjs";
import * as R from "../../scripts/technical/practitioner/replay.mjs";
import * as K from "../../scripts/technical/practitioner/compare.mjs";
import * as O from "../../scripts/technical/practitioner/outcome.mjs";
import { runBenchmark } from "../../scripts/technical/practitioner/run-benchmark.mjs";
import { runOutcome } from "../../scripts/technical/practitioner/run-outcome.mjs";
import { createRequire } from "node:module";
const Core = createRequire(import.meta.url)("../research/elliott-practitioners/reference-core.js");

const tmp = () => mkdtempSync(join(tmpdir(), "vu-practitioner-"));
const clone = (o) => JSON.parse(JSON.stringify(o));
function deepMerge(a, b) { for (const [k, v] of Object.entries(b)) { if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object") deepMerge(a[k], v); else a[k] = v; } return a; }

/** TEST_FIXTURE: S&P 500 Cash, Montag 17.10.2022 09:00 New York → Stichtag Freitag 14.10.2022.
    Szenario: neue Impulswelle (1) seit dem Tief 3491 laeuft aufwaerts (directionalBias UP = laufende Bewegung), danach (2) abwaerts. */
function fx(over = {}) {
  const base = {
    referenceId: "pr_test_fixture_spx_a", caseId: "test-fixture-alpha|SPY|2022-10-17|1", version: 1, revisionOf: null, viewKind: "ORIGINAL_PUBLISHED",
    sourceId: "test-fixture-alpha", sourceType: "YOUTUBE", sourceUrl: "https://example.invalid/alpha/spx-2022-10-17", crossPosts: [],
    publication: { timestamp: "2022-10-17T09:00:00-04:00", timestampPrecision: "MINUTE", timezone: "America/New_York", basis: "TEST", editedAfterPublication: "NO", editNote: null },
    instrument: { asShown: "S&P 500", instrumentType: "INDEX_CASH", priceAdjustment: "UNKNOWN", vuSymbol: "SPY", mappingQuality: "PROXY_DIFFERENT_INSTRUMENT", levelScale: 0.1 },
    timeframe: "1W", analysisCutoff: "2022-10-14", elliottSchool: "CLASSICAL",
    primary: { pattern: "IMPULSE", family: "MOTIVE", degreeLabel: "(1)", degreeRank: 2, currentWave: "(1)", currentWaveRole: "MOTIVE", state: "DEVELOPING", waveStartDate: "2022-10-13", waveStartPrice: 3491, nextMoveAfterCurrent: "DOWN" },
    alternatives: [{ pattern: "ZIGZAG", currentWave: "C", directionalBias: "DOWN", trigger: null, note: null }],
    directionalBias: "UP", structuralScenario: "TEST", keySupportZones: [], entryZones: [], targetZones: [{ low: 4100, high: 4200, label: "T1" }, { low: 4500, high: 4600, label: "T2" }],
    invalidation: { price: 3490, direction: "below", basis: "CLOSE" }, commentarySummary: "TEST FIXTURE – keine echte Analyse",
    extraction: { confidence: "HIGH", extractor: "test", method: "HUMAN_FROM_PRIMARY", secondPass: null, ambiguities: [] },
    evidence: [{ field: "primary", locator: "00:00", note: "TEST FIXTURE" }], referenceQuality: "A", status: "TEST_FIXTURE", exclusionReason: null, split: "UNASSIGNED"
  };
  return deepMerge(clone(base), over);
}
const pub = (timestamp, timezone, timestampPrecision = "MINUTE") => ({ timestamp, timezone, timestampPrecision, basis: "TEST" });

// ================================================================== Zeitstempel / Zeitzonen / Stichtag
test("cutoff: US-Schluss 16:00 New York, strikt vor Veroeffentlichung", () => {
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-05T16:30:00-04:00", "America/New_York"), "US_EQUITY").analysisCutoff, "2024-06-05");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-05T15:59:00-04:00", "America/New_York"), "US_EQUITY").analysisCutoff, "2024-06-04");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-05T16:00:00-04:00", "America/New_York"), "US_EQUITY").analysisCutoff, "2024-06-04", "genau 16:00 → Schluss noch nicht bekannt");
  // HOUR-Genauigkeit: 16:xx → Beginn der Stunde 16:00 → konservativ Vortag
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-05T16:00:00-04:00", "America/New_York", "HOUR"), "US_EQUITY").analysisCutoff, "2024-06-04");
  // Wochenende → Freitag
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-09T12:00:00+02:00", "Europe/Berlin"), "US_EQUITY").analysisCutoff, "2024-06-07");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-10T09:00:00+02:00", "Europe/Berlin"), "US_EQUITY").analysisCutoff, "2024-06-07");
});
test("cutoff: Sommerzeit-Luecke USA/Europa (Maerz und Oktober/November 2024)", () => {
  // 08.03. (USA noch EST): 21:30 Berlin = 20:30 UTC = 15:30 New York → Boerse offen → Vortag
  assert.equal(C.computeAnalysisCutoff(pub("2024-03-08T21:30:00+01:00", "Europe/Berlin"), "US_EQUITY").analysisCutoff, "2024-03-07");
  // 15.03. (USA EDT seit 10.03., Berlin noch MEZ): 21:30 Berlin = 16:30 New York → geschlossen → selber Tag
  assert.equal(C.computeAnalysisCutoff(pub("2024-03-15T21:30:00+01:00", "Europe/Berlin"), "US_EQUITY").analysisCutoff, "2024-03-15");
  // 28.10. (Berlin MEZ seit 27.10., USA noch EDT): 21:30 Berlin = 16:30 New York → selber Tag
  assert.equal(C.computeAnalysisCutoff(pub("2024-10-28T21:30:00+01:00", "Europe/Berlin"), "US_EQUITY").analysisCutoff, "2024-10-28");
  // 04.11. (USA EST seit 03.11.): 21:30 Berlin = 15:30 New York → Freitag 01.11.
  assert.equal(C.computeAnalysisCutoff(pub("2024-11-04T21:30:00+01:00", "Europe/Berlin"), "US_EQUITY").analysisCutoff, "2024-11-01");
  // Xetra 17:30 Berlin, im Sommer
  assert.equal(C.computeAnalysisCutoff(pub("2024-07-01T17:45:00+02:00", "Europe/Berlin"), "XETRA").analysisCutoff, "2024-07-01");
  assert.equal(C.computeAnalysisCutoff(pub("2024-07-01T17:15:00+02:00", "Europe/Berlin"), "XETRA").analysisCutoff, "2024-06-28");
  // DST-Umstellungsnacht selbst: 31.03.2024 03:30 Berlin (+02:00) ist gueltig
  assert.equal(C.zonedToUtc("2024-03-31", 3, 30, "Europe/Berlin"), Date.parse("2024-03-31T01:30:00Z"));
  assert.equal(C.closeInstant("2024-03-08", "US_EQUITY"), Date.parse("2024-03-08T21:00:00Z"));
  assert.equal(C.closeInstant("2024-03-11", "US_EQUITY"), Date.parse("2024-03-11T20:00:00Z"));
});
test("cutoff: Krypto-Tagesbar endet 00:00 UTC; DAY-Genauigkeit konservativ", () => {
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-01T00:30:00Z", "UTC"), "CRYPTO").analysisCutoff, "2024-05-31");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-01T00:00:00Z", "UTC"), "CRYPTO").analysisCutoff, "2024-05-30");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-01T23:00:00+02:00", "Europe/Berlin"), "CRYPTO").analysisCutoff, "2024-05-31");
  // DAY: letzter Schluss VOR dem Datum, auch wenn der Zeitstempel (00:00) spaet im Tag haette liegen koennen
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-05T00:00:00+02:00", "Europe/Berlin", "DAY"), "US_EQUITY").analysisCutoff, "2024-06-04");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-05T00:00:00+09:00", "Asia/Tokyo", "DAY"), "US_EQUITY").analysisCutoff, "2024-06-03", "Tokio-Mitternacht liegt vor dem US-Schluss des 04.06.");
  assert.equal(C.computeAnalysisCutoff(pub("2024-06-03T00:00:00+02:00", "Europe/Berlin", "DAY"), "US_EQUITY").analysisCutoff, "2024-05-31");
});
test("cutoff: Offset/Zone-Widerspruch und fehlender Offset werden erkannt", () => {
  assert.ok(C.timestampConsistency(pub("2024-07-01T10:00:00+01:00", "Europe/Berlin")));
  assert.equal(C.timestampConsistency(pub("2024-07-01T10:00:00+02:00", "Europe/Berlin")), null);
  assert.throws(() => C.parsePublication(pub("2024-07-01T10:00:00", "Europe/Berlin")), /Offset/);
  assert.throws(() => C.parsePublication(pub("2024-07-01T10:00:00Z", "Mars/Olympus")), /IANA/);
  assert.throws(() => C.parsePublication({ timestamp: "2024-07-01T10:00:00Z", timezone: "UTC", timestampPrecision: "SECOND" }), /Genauigkeit|timestampPrecision/);
});
test("cutoff: Eigenschaftstest – Stichtag nie nach der Veroeffentlichung (6000 Zufallszeitpunkte)", () => {
  let s = 20261004; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const zones = ["America/New_York", "Europe/Berlin", "UTC", "Asia/Tokyo", "Australia/Sydney", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"];
  const markets = Object.keys(C.MARKETS), precs = ["MINUTE", "HOUR", "DAY"];
  const t0 = Date.parse("2000-01-01T00:00:00Z"), t1 = Date.parse("2030-12-31T00:00:00Z");
  for (let i = 0; i < 6000; i++) {
    const ms = Math.floor(t0 + rnd() * (t1 - t0)), tz = zones[Math.floor(rnd() * zones.length)], mk = markets[Math.floor(rnd() * markets.length)], prec = precs[Math.floor(rnd() * 3)];
    const p = C.zonedParts(ms, tz), off = C.tzOffsetMinutes(ms, tz), sg = off < 0 ? "-" : "+", ao = Math.abs(off);
    const two = (n) => String(n).padStart(2, "0");
    const hh = prec === "DAY" ? 0 : p.hour, mi = prec === "DAY" ? 0 : p.minute;
    let ts = `${p.year}-${two(p.month)}-${two(p.day)}T${two(hh)}:${two(mi)}:00${sg}${two(Math.floor(ao / 60))}:${two(ao % 60)}`;
    const P = pub(ts, tz, prec);
    if (C.timestampConsistency(P)) continue;   // DAY-00:00 in einer DST-Luecke
    const c = C.computeAnalysisCutoff(P, mk), pp = C.parsePublication(P);
    const ci = C.closeInstant(c.analysisCutoff, mk);
    assert.ok(ci < pp.earliestMs && pp.earliestMs <= pp.instantMs, `${ts} ${tz} ${mk}: Schluss ${new Date(ci).toISOString()} nicht vor Veroeffentlichung`);
    assert.ok(C.isSessionDay(c.analysisCutoff, mk));
    assert.ok(c.analysisCutoff <= C.localDate(pp.instantMs, C.MARKETS[mk].tz));
    // maximal: die naechste Sitzung war zum Veroeffentlichungszeitpunkt noch nicht geschlossen
    let d = C.addDays(c.analysisCutoff, 1); while (!C.isSessionDay(d, mk)) d = C.addDays(d, 1);
    assert.ok(C.closeInstant(d, mk) >= pp.earliestMs);
  }
});
test("cutoff: Wochenabschluss und Feiertage aus der Reihe", () => {
  assert.equal(C.lastCompleteWeekEnd("2024-06-06", "US_EQUITY"), "2024-05-31");   // Do → Vorwoche
  assert.equal(C.lastCompleteWeekEnd("2024-06-07", "US_EQUITY"), "2024-06-07");   // Fr
  assert.equal(C.lastCompleteWeekEnd("2024-06-08", "US_EQUITY"), "2024-06-07");   // Sa
  assert.equal(C.lastCompleteWeekEnd("2024-06-08", "CRYPTO"), "2024-06-02");      // Krypto-Woche endet Sonntag
  assert.equal(C.lastCompleteWeekEnd("2024-06-09", "CRYPTO"), "2024-06-09");
  assert.equal(C.lastCompleteWeekEnd("2024-03-29", "US_EQUITY"), "2024-03-29");   // Karfreitag: Woche endet (Bar Do 28.03.)
  const dates = ["2024-07-01", "2024-07-02", "2024-07-03", "2024-07-05"];          // 04.07. Feiertag
  assert.deepEqual(C.snapToBars(dates, "2024-07-04"), { index: 2, date: "2024-07-03" });
  assert.equal(C.snapToBars(dates, "2024-06-30"), null);
  assert.equal(C.sessionDaysBetween("2024-06-07", "2024-06-14", "US_EQUITY"), 5);
  assert.equal(C.sessionDaysBetween("2024-06-14", "2024-06-07", "US_EQUITY"), -5);
});

// ================================================================== Datenleck / blinde Wiedergabe
const realLoader = R.defaultLoader;
function poisonedLoader(cutoff, factor) {
  return (sym, src, grain) => (realLoader(sym, src, grain) || []).map(([d, c]) => (d > cutoff ? [d, c * factor + (d.charCodeAt(9) % 7)] : [d, c]));
}
const PROJ = Object.freeze({ referenceId: "pr_test_fixture_spx_a", vuSymbol: "SPY", seriesSource: "multi-asset", market: "US_EQUITY", timeframe: "1D", analysisCutoff: "2022-10-14" });
test("leakage: Wiedergabe uebergibt keinen Bar nach dem Stichtag; vergiftete Zukunft aendert nichts", () => {
  const seen = [];
  const spy = (s, src, g) => { const pts = realLoader(s, src, g); seen.push(pts.length); return pts; };
  const a = R.replayOne(PROJ, { loader: spy });
  assert.equal(a.status, "OK");
  assert.ok(a.lastBarDate <= PROJ.analysisCutoff);
  assert.equal(a.lastBarDate, "2022-10-14");
  for (const f of [10, 0.01, -1]) {
    const b = R.replayOne(PROJ, { loader: poisonedLoader(PROJ.analysisCutoff, f) });
    assert.deepEqual(b.vu, a.vu, "VU-Ausgabe haengt von Kursen nach dem Stichtag ab");
    assert.deepEqual(b.market, a.market);
  }
  assert.throws(() => R.assertNoLeak([["2022-10-14", 1], ["2022-10-17", 2]], "2022-10-14"), /LEAKAGE/);
});
test("leakage: Woche – nur abgeschlossene Wochen; Mittwochs-Stichtag nutzt Vorwoche", () => {
  const p = Object.assign({}, PROJ, { timeframe: "1W", analysisCutoff: "2022-10-12" });
  const { bars, limit } = R.barsUntil(p, p.analysisCutoff);
  assert.equal(limit, "2022-10-07");
  assert.equal(bars[bars.length - 1][0], "2022-10-07");
  const a = R.replayOne(Object.freeze(p)), b = R.replayOne(Object.freeze(p), { loader: poisonedLoader("2022-10-07", 3) });
  assert.deepEqual(b.vu, a.vu, "laufende (unvollstaendige) Woche darf nicht einfliessen");
  // Wochen aus Tagen: letzter Handelstag je Woche
  assert.deepEqual(R.weeklyFromDaily([["2024-06-03", 1], ["2024-06-07", 2], ["2024-06-10", 3]]), [["2024-06-07", 2], ["2024-06-10", 3]]);
});
test("leakage: Replay erhaelt nur die Projektion; Praktikerfelder aendern das Ergebnis nicht", () => {
  const ref = fx({ timeframe: "1D" }), m = L.effectiveMapping(ref);
  assert.throws(() => R.replayOne(ref), /Praktikerfelder|genau/);
  assert.throws(() => R.replayOne(Object.assign({}, PROJ, { directionalBias: "UP" })), /Praktikerfelder|genau/);
  const p1 = R.replayProjection(ref, m), p2 = R.replayProjection(fx({ timeframe: "1D", directionalBias: "DOWN", invalidation: { price: 1, direction: "above" }, primary: { pattern: "IMPULSE" } }), m);
  assert.deepEqual(Object.keys(p1).sort(), [...R.PROJECTION_KEYS].sort());
  assert.ok(Object.isFrozen(p1));
  assert.deepEqual(R.replayOne(p1).vu, R.replayOne(p2).vu);
  const src = readFileSync(new URL("../../scripts/technical/practitioner/replay.mjs", import.meta.url), "utf8");
  for (const f of ["directionalBias", "targetZones", "currentWaveRole", "extraction", "evidence", "commentarySummary", "structuralScenario", "keySupportZones", "entryZones", "publication", "instrument", "sourceId", "degreeRank"])
    assert.ok(!new RegExp(`\\.${f}\\b|\\[["']${f}["']\\]`).test(src), "replay.mjs liest Praktikerfeld " + f);
});
test("replay: Engine-Version eingefroren; Abweichung bricht ab", () => {
  assert.equal(R.ENGINE_VERSION, "elliott-3.2.2");
  assert.throws(() => R.replayOne(PROJ, { expectedEngine: "elliott-9.9.9" }), /Engine/);
  assert.throws(() => R.checkEngineVersion("elliott-3.3.0"), /--engine-version/);
});
test("replay: UNMAPPED, nicht rekonstruierbar, zu wenig Daten", () => {
  assert.equal(R.replayOne(Object.freeze(Object.assign({}, PROJ, { vuSymbol: null, seriesSource: null, market: "XETRA" }))).status, "UNMAPPED");
  assert.equal(R.replayOne(Object.freeze(Object.assign({}, PROJ, { timeframe: "INTRADAY" }))).status, "NOT_REPRODUCIBLE");
  assert.equal(R.replayOne(Object.freeze(Object.assign({}, PROJ, { analysisCutoff: "1995-03-01" }))).status, "INSUFFICIENT_DATA");
});

// ================================================================== Validierung / Parsing
test("validation: gueltige TEST_FIXTURE besteht Schema und Fachregeln", () => {
  const v = L.validateReference(fx());
  assert.deepEqual(v.errors, []);
});
test("validation: Schema- und Fachfehler werden gemeldet", () => {
  const cases = [
    [(r) => { delete r.sourceUrl; }, /sourceUrl: Pflichtfeld/],
    [(r) => { r.timeframe = "4H"; }, /timeframe: Wert/],
    [(r) => { r.extra = 1; }, /extra: Feld im Schema nicht erlaubt/],
    [(r) => { r.sourceUrl = "notaurl"; }, /http\(s\)-URL/],
    [(r) => { r.referenceId = "PR-Upper"; }, /referenceId: entspricht nicht/],
    [(r) => { r.commentarySummary = "x".repeat(401); }, /400 Zeichen/],
    [(r) => { r.evidence = []; }, /mindestens 1/],
    [(r) => { r.version = 0; }, /kleiner als 1/],
    [(r) => { r.analysisCutoff = "2022-10-17"; }, /nie von Hand/],
    [(r) => { r.publication.timestamp = "2022-10-17T09:00:00-05:00"; }, /passt nicht zu America\/New_York/],
    [(r) => { r.viewKind = "LATER_REVISION"; }, /LATER_REVISION erfordert revisionOf/],
    [(r) => { r.sourceUrl = "https://www.youtube.com/watch?v=x"; }, /\.invalid-URL/],
    [(r) => { r.status = "INCLUDED"; }, /nur mit status TEST_FIXTURE/],
    [(r) => { r.primary.currentWave = "(iii]"; }, /Label-Syntax/],
    [(r) => { r.primary.family = "CORRECTIVE"; }, /widerspricht Muster/],
    [(r) => { r.primary.degreeRank = 7; }, /-2\.\.5/],
    [(r) => { r.primary.degreeRank = -3; }, /-2\.\.5/],
    [(r) => { r.targetZones = [{ low: 5, high: 4 }]; }, /low > high/],
    [(r) => { r.instrument.vuSymbol = "QQQ"; }, /≠ Karte SPY/],
    [(r) => { r.status = "EXCLUDED"; r.sourceId = "real-x"; r.caseId = "real-x|SPY|2022-10-17|1"; r.sourceUrl = "https://example.org/a"; }, /exclusionReason/]
  ];
  for (const [mut, re] of cases) { const r = fx(); mut(r); const v = L.validateReference(r); assert.ok(v.errors.some((e) => re.test(e)), `erwartet ${re}, erhalten ${JSON.stringify(v.errors)}`); }
  // Quelle muss im Verzeichnis stehen (Array-Form wie source-registry.json)
  const r = fx({ status: "CANDIDATE", sourceId: "unknown-src", sourceUrl: "https://example.org/x" });
  assert.ok(L.validateReference(r, { registry: { sources: [{ sourceId: "hkcm" }] } }).errors.some((e) => /source-registry/.test(e)));
});
test("parsing: JSONL mit Zeilennummern, Kommentare/Leerzeilen ignoriert", () => {
  const { rows, errors } = L.parseJsonl(`${JSON.stringify(fx())}\n\n// Kommentar\n{kaputt\n[1,2]\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].__line, 1);
  assert.deepEqual(errors.map((e) => e.line), [4, 5]);
  assert.deepEqual(L.validateReference(rows[0]).errors, [], "interne __line-Metadaten sind kein Schemafehler");
});
test("labels: Syntax, Normalisierung und Rollen", () => {
  for (const ok of ["3", "(iii)", "[C]", "((v))", "Primary 4", "Minor (B)", "w", "X2"]) assert.ok(L.labelSyntaxOk(ok), ok);
  for (const bad of ["(iii]", "6", "vi", "wave 3", "F", ""]) assert.ok(!L.labelSyntaxOk(bad), bad);
  assert.equal(L.normalizeWaveLabel("(iii)"), "3");
  assert.equal(L.normalizeWaveLabel("[c]"), "C");
  assert.equal(L.normalizeWaveLabel("Primary 4"), "4");
  assert.equal(L.normalizeWaveLabel("X₂"), "X");
  assert.equal(L.roleOfLabel("C", "FLAT"), "MOTIVE");
  assert.equal(L.roleOfLabel("A", "FLAT"), "CORRECTIVE");
  assert.equal(L.roleOfLabel("A", "ZIGZAG"), "MOTIVE");
  assert.equal(L.roleOfLabel("4", "IMPULSE"), "CORRECTIVE");
  assert.equal(L.roleOfLabel("A", null), "UNKNOWN");
});

// ================================================================== Duplikate, Cross-Posts, Reposts
test("duplicates: Cross-Post (Video + X am selben Tag) = ein Fall, Original behalten", () => {
  const a = fx();
  const b = fx({ referenceId: "pr_test_fixture_spx_x", sourceType: "X", sourceUrl: "https://example.invalid/alpha/x-post", publication: { timestamp: "2022-10-17T11:00:00-04:00" } });
  const d = L.detectDuplicates([b, a]);
  assert.deepEqual(d.duplicates.map((x) => [x.originalId, x.duplicateId, x.reason]), [[a.referenceId, b.referenceId, "CROSS_POST"]]);
  assert.deepEqual(d.keep.map((r) => r.referenceId), [a.referenceId]);
});
test("duplicates: dieselbe Analyse erneut gepostet (innerhalb 2 Tagen) / gleiche URL / keine Duplikate", () => {
  const a = fx();
  const re = fx({ referenceId: "pr_test_fixture_spx_r", sourceUrl: "https://example.invalid/alpha/repost", publication: { timestamp: "2022-10-18T20:00:00-04:00" }, analysisCutoff: "2022-10-18" });
  assert.equal(L.detectDuplicates([a, re]).duplicates[0].reason, "REPOST_SAME_ANALYSIS");
  const late = fx({ referenceId: "pr_test_fixture_spx_l", sourceUrl: "https://example.invalid/alpha/late", publication: { timestamp: "2022-10-20T09:00:00-04:00" }, analysisCutoff: "2022-10-19" });
  assert.equal(L.detectDuplicates([a, late]).duplicates.length, 0, "3 Tage spaeter ist eine neue Analyse");
  const other = fx({ referenceId: "pr_test_fixture_spx_o", sourceUrl: "https://example.invalid/alpha/o", directionalBias: "DOWN" });
  assert.equal(L.detectDuplicates([a, other]).duplicates.length, 0, "andere Richtung = andere Aussage");
  const otherSrc = fx({ referenceId: "pr_test_fixture_spx_b", sourceId: "test-fixture-beta", caseId: "test-fixture-beta|SPY|2022-10-17|1", sourceUrl: "https://example.invalid/beta/1" });
  assert.equal(L.detectDuplicates([a, otherSrc]).duplicates.length, 0, "andere Quelle ist unabhaengig");
  const sameUrl = fx({ referenceId: "pr_test_fixture_spx_u", sourceId: "test-fixture-beta", caseId: "test-fixture-beta|SPY|2022-10-17|1", sourceUrl: "https://example.invalid/beta/1", crossPosts: ["https://example.invalid/alpha/spx-2022-10-17#t=10"] });
  assert.equal(L.detectDuplicates([a, sameUrl]).duplicates[0].reason, "SAME_URL");
});

// ================================================================== Revisionen
function revision() {
  return fx({ referenceId: "pr_test_fixture_spx_a_v2", version: 2, revisionOf: "pr_test_fixture_spx_a", viewKind: "LATER_REVISION", sourceUrl: "https://example.invalid/alpha/update",
              publication: { timestamp: "2022-10-24T09:00:00-04:00" }, analysisCutoff: "2022-10-21", invalidation: { price: 3600, direction: "below", basis: "CLOSE" } });
}
test("revisions: Kette, Original bleibt erhalten, juengste Sicht getrennt", () => {
  const a = fx(), b = revision();
  assert.deepEqual(L.validateReference(b).errors, []);
  const { chains, errors } = L.revisionChains([b, a]);
  assert.deepEqual(errors, []);
  const ch = chains.get(a.referenceId);
  assert.deepEqual(ch.map((r) => r.referenceId), [a.referenceId, b.referenceId]);
  const v = L.chainViews(ch);
  assert.equal(v.original.invalidation.price, 3490, "verschobene Invalidation ersetzt nie die urspruengliche");
  assert.equal(v.latest.invalidation.price, 3600);
  assert.equal(L.chainViews(ch, Date.parse("2022-10-20T00:00:00Z")).latest.referenceId, a.referenceId);
  assert.equal(L.detectDuplicates([a, b]).duplicates.length, 0, "Revision ist kein Duplikat");
});
test("revisions: Ueberschreiben verboten, fehlerhafte Ketten gemeldet", () => {
  const a = fx(), changed = fx({ invalidation: { price: 3600, direction: "below", basis: "CLOSE" } });
  assert.throws(() => L.appendReferences([a], [changed]), /Ueberschreiben verboten/);
  assert.equal(L.appendReferences([a], [clone(a)]).length, 1);
  assert.ok(L.revisionChains([a, changed]).errors.some((e) => /anderem Inhalt/.test(e)));
  const wrongVer = Object.assign(revision(), { version: 3 });
  assert.ok(L.revisionChains([a, wrongVer]).errors.some((e) => /version 3/.test(e)));
  const earlier = deepMerge(revision(), { publication: { timestamp: "2022-10-16T09:00:00-04:00" } });
  assert.ok(L.revisionChains([a, earlier]).errors.some((e) => /nicht nach der Vorfassung/.test(e)));
  const orphan = Object.assign(revision(), { revisionOf: "pr_missing" });
  assert.ok(L.revisionChains([orphan]).errors.some((e) => /existiert nicht/.test(e)));
  const otherSrc = Object.assign(revision(), { sourceId: "test-fixture-beta" });
  assert.ok(L.revisionChains([a, otherSrc]).errors.some((e) => /anderen Quelle/.test(e)));
});

// ================================================================== Instrumentabbildung
test("mapping: Proxy-Skalierung, Vorrang der Referenz-Skala, UNMAPPED", () => {
  const m = L.effectiveMapping(fx());
  assert.equal(m.vuSymbol, "SPY"); assert.equal(m.mappingQuality, "PROXY_DIFFERENT_INSTRUMENT"); assert.equal(m.levelScale, 0.1); assert.ok(m.levelsComparable);
  const own = L.effectiveMapping(fx({ instrument: { levelScale: 0.0995 } }));
  assert.equal(own.levelScale, 0.0995);
  const P = K.practitionerView(fx(), m);
  assert.equal(P.invalidation.price, 349);
  assert.deepEqual(P.targets[0], { low: 410, high: 420 });
  for (const [asShown, type, sym, q] of [["NQ1!", "FUTURE", "QQQ", "PROXY_DIFFERENT_INSTRUMENT"], ["US100", "CFD", "QQQ", "PROXY_DIFFERENT_INSTRUMENT"], ["DJI", "INDEX_CASH", "DIA", "PROXY_DIFFERENT_INSTRUMENT"],
    ["RUT", "INDEX_CASH", "IWM", "PROXY_DIFFERENT_INSTRUMENT"], ["BTCUSD", "CRYPTO_SPOT", "BTCUSD", "EXACT"], ["Gold", "COMMODITY_SPOT", "XAUUSD", "EXACT"], ["USOIL", "CFD", "WTI", "PROXY_SAME_UNDERLYING"],
    ["AAPL", "STOCK", "AAPL", "EXACT"], ["GER40", "CFD", null, "UNMAPPED"], ["DAX", "INDEX_CASH", null, "UNMAPPED"], ["ZZZNOTREAL", "STOCK", null, "UNMAPPED"]]) {
    const r = L.resolveInstrument({ asShown, instrumentType: type });
    assert.equal(r.vuSymbol, sym, asShown); assert.equal(r.mappingQuality, q, asShown);
  }
  assert.equal(L.resolveInstrument({ asShown: "BTCUSD", instrumentType: "CRYPTO_SPOT" }).market, "CRYPTO");
  // Proxy ohne Skala (Euro Stoxx → FEZ in USD): Niveaus nicht vergleichbar
  const es = L.effectiveMapping({ instrument: { asShown: "Euro Stoxx 50", instrumentType: "INDEX_CASH", vuSymbol: "FEZ", mappingQuality: "PROXY_DIFFERENT_INSTRUMENT", levelScale: null } });
  assert.equal(es.levelsComparable, false);
  assert.equal(K.practitionerView(fx(), es).invalidation, null);
});
test("mapping: UNMAPPED (DAX) wird gezaehlt, aber nicht gerechnet", () => {
  const dax = fx({ referenceId: "pr_test_fixture_dax", caseId: "test-fixture-alpha|UNMAPPED:DAX|2022-10-17|1", instrument: { asShown: "DAX", instrumentType: "INDEX_CASH", vuSymbol: null, mappingQuality: "UNMAPPED", levelScale: null },
    publication: { timestamp: "2022-10-17T09:00:00+02:00", timezone: "Europe/Berlin" }, analysisCutoff: "2022-10-14" });
  assert.deepEqual(L.validateReference(dax).errors, []);
  const m = L.effectiveMapping(dax);
  assert.equal(m.market, "XETRA");
  const rec = R.replayOne(R.replayProjection(dax, m));
  assert.equal(rec.status, "UNMAPPED");
  const row = K.compareCase(dax, m, rec);
  assert.equal(row.category, "UNMAPPED");
  assert.equal(row.metrics, undefined);
  assert.equal(L.buildCaseId(dax), "test-fixture-alpha|UNMAPPED:DAX|2022-10-17|1");
});
test("plausibility: Niveaus ±60 % um den VU-Schluss, nach Skalierung", () => {
  const r = fx();
  assert.deepEqual(L.plausibilityChecks(r, { closeAtCutoff: 357.63, levelScale: 0.1 }).errors, []);
  const unscaled = L.plausibilityChecks(r, { closeAtCutoff: 357.63, levelScale: 1 });
  // Nachtrag 4: Band je Zeitrahmen (Fixture 1W: Zonen −90 %/+400 %); unskalierte SPX-Ziele (×11) fallen weiterhin durch
  assert.ok(unscaled.errors.length >= 3 && unscaled.errors.every((e) => /> (±60 %|−90 %\/\+400 %|Faktor \d+)/.test(e)));
  assert.ok(L.plausibilityChecks(r, { closeAtCutoff: 357.63, levelScale: null }).warnings.some((w) => /nicht pruefbar/.test(w)));
  const tf = L.plausibilityChecks(fx({ timeframe: "1W", primary: { waveStartDate: "2022-10-10" } }), { closeAtCutoff: 357.63, levelScale: 0.1 });
  assert.ok(tf.warnings.some((w) => /Wochenchart/.test(w)));
});

// ================================================================== Aufteilung und Freeze
test("splits: HOLDOUT_SOURCE (zweitgroesste Nicht-HKCM-Quelle), HOLDOUT_TEMPORAL, Hash 70/30 deterministisch", () => {
  const mk = (src, i, date) => ({ referenceId: `pr_${src}_${i}`, caseId: `${src}|SPY|${date}|1`, sourceId: src, version: 1, viewKind: "ORIGINAL_PUBLISHED", revisionOf: null,
    instrument: { vuSymbol: "SPY" }, publication: { timestamp: `${date}T12:00:00Z`, timezone: "UTC", timestampPrecision: "MINUTE" } });
  const refs = [];
  for (let i = 0; i < 6; i++) refs.push(mk("hkcm", i, `2023-0${1 + i}-10`));
  for (let i = 0; i < 4; i++) refs.push(mk("srcb", i, `2023-0${1 + i}-11`));
  for (let i = 0; i < 3; i++) refs.push(mk("srcc", i, `2023-0${1 + i}-12`));
  refs.push(mk("srcb", 9, "2025-02-03"));
  const s = L.assignSplits(refs);
  assert.equal(s.holdoutSource, "srcc");
  assert.ok(refs.filter((r) => r.sourceId === "srcc").every((r) => s.byCase[r.caseId] === "HOLDOUT_SOURCE"));
  assert.equal(s.byCase["srcb|SPY|2025-02-03|1"], "HOLDOUT_TEMPORAL");
  assert.deepEqual(L.assignSplits(refs.slice().reverse()).byCase, s.byCase);
  assert.ok(Object.values(s.byCase).every((x) => ["DEVELOPMENT", "VALIDATION", "HOLDOUT_SOURCE", "HOLDOUT_TEMPORAL"].includes(x)));
  let dev = 0; for (let i = 0; i < 2000; i++) if (L.hashUnit("case" + i) < 0.7) dev++;
  assert.ok(dev > 1300 && dev < 1500);
  assert.ok(L.isHkcmDefault("phantom-hkcm"));
});
test("freeze: verweigert TEST_FIXTURE, LOW, LLM_DRAFT_UNREVIEWED, fehlende Evidenz", () => {
  const out = tmp();
  assert.throws(() => L.freezeReferences([fx()], { outDir: out }), (e) => e instanceof L.FreezeRefusedError && e.reasons.some((x) => /TEST_FIXTURE/.test(x)));
  // auch eine als INCLUDED getarnte Testzeile
  assert.throws(() => L.freezeReferences([fx({ status: "INCLUDED" })], { outDir: out }), /TEST_FIXTURE|Testquelle/);
  // Fachsperren (im Selbsttest-Modus geprueft, damit die Zeilen gekennzeichnete Testdaten bleiben)
  const opt = { outDir: out, version: "TEST_FREEZE", selfTestMode: true };
  assert.throws(() => L.freezeReferences([fx({ extraction: { confidence: "LOW" } })], opt), /LOW/);
  assert.throws(() => L.freezeReferences([fx({ extraction: { method: "LLM_DRAFT_UNREVIEWED" } })], opt), /LLM_DRAFT_UNREVIEWED/);
  assert.throws(() => L.freezeReferences([fx({ evidence: [] })], opt), /evidence/);
  assert.throws(() => L.freezeReferences([fx(), fx({ referenceId: "pr_test_fixture_spx_x", sourceType: "X", sourceUrl: "https://example.invalid/x" })], opt), /Duplikat/);
  // Selbsttest-Modus ist fuer echte Versionen/Pfade gesperrt
  assert.throws(() => L.freezeReferences([fx()], { outDir: out, selfTestMode: true }), /selfTestMode/);
  assert.throws(() => L.freezeReferences([fx()], { outDir: join(L.PV1, "freeze"), version: "TEST_X", selfTestMode: true }), /selfTestMode/);
  assert.ok(!existsSync(join(out, "PRACTITIONER_REFERENCE_V1.jsonl")));
});
test("freeze: sortiert, SHA-256 stabil, Manifest, keine stille Neufassung", () => {
  const out = tmp(), opt = { outDir: out, version: "TEST_FREEZE", selfTestMode: true, now: "2026-10-04T00:00:00Z" };
  const b = fx({ referenceId: "pr_test_fixture_spx_b", sourceId: "test-fixture-beta", caseId: "test-fixture-beta|SPY|2022-10-17|1", sourceUrl: "https://example.invalid/beta/1" });
  const r1 = L.freezeReferences([b, fx(), revision()], opt);
  const lines = readFileSync(r1.file, "utf8").trim().split("\n");
  assert.deepEqual(lines.map((l) => JSON.parse(l).referenceId), ["pr_test_fixture_spx_a", "pr_test_fixture_spx_a_v2", "pr_test_fixture_spx_b"]);
  // beta = Holdout-Quelle; alpha (SPY, gleicher Stichtag) liegt in deren Marktfenster → QUARANTINE (Zeile: UNASSIGNED)
  assert.equal(r1.manifest.splits.byCase["test-fixture-beta|SPY|2022-10-17|1"], "HOLDOUT_SOURCE");
  assert.equal(r1.manifest.splits.byCase["test-fixture-alpha|SPY|2022-10-17|1"], "QUARANTINE");
  assert.deepEqual(lines.map((l) => JSON.parse(l).split), ["UNASSIGNED", "UNASSIGNED", "HOLDOUT_SOURCE"]);
  assert.match(r1.manifest.sha256, /^[0-9a-f]{64}$/);
  assert.equal(r1.manifest.label, "PRACTITIONER REFERENCE — PILOT");
  assert.ok(r1.manifest.qualityGate.failed.includes("cases"));
  assert.ok(L.verifyFreeze(r1.manifestFile));
  const r2 = L.freezeReferences([revision(), b, fx()], opt);   // andere Reihenfolge → gleiche Pruefsumme
  assert.equal(r2.manifest.sha256, r1.manifest.sha256);
  assert.throws(() => L.freezeReferences([fx(), b], opt), /neue Version/);
  writeFileSync(r1.file, readFileSync(r1.file, "utf8").replace("3490", "3491"));
  assert.equal(L.verifyFreeze(r1.manifestFile), false);
});

// ================================================================== Kennzahlen auf Handfixtures
const view = (o) => Object.assign({ pattern: null, family: null, label: null, completeLabel: null, inferredNext: null, role: null, state: null, direction: null, impliedTrend: null,
  degreeRank: null, invalidation: null, targets: [], alternatives: [], levelsComparable: true, abstain: false }, o);
test("metrics: A–K und S auf handgemachten Sichten", () => {
  const P = view({ actor: "PRACTITIONER", pattern: "IMPULSE", family: "MOTIVE", label: "3", role: "MOTIVE", state: "DEVELOPING", currentMove: "UP", nextMove: "DOWN", impliedTrend: "UP", degreeRank: 2,
    invalidation: { price: 95, direction: "below" }, targets: [{ low: 110, high: 120 }, { low: 130, high: 140 }], alternatives: [{ pattern: "ZIGZAG", label: "C", direction: "DOWN" }] });
  const V = view({ actor: "VU", pattern: "ZIGZAG", family: "CORRECTIVE", label: "C", role: "MOTIVE", state: "DEVELOPING", currentMove: "UP", nextMove: "UP", impliedTrend: "DOWN", degreeRank: 1,
    invalidation: { price: 90, direction: "below" }, targets: [{ low: 118, high: 125 }], alternatives: [] });
  const r = K.compareViews(P, V, { close: 100, atr: 2.5, absoluteComparable: true });
  assert.deepEqual(r.metrics, { A1: "MATCH", A2: "MISMATCH", B: "MISMATCH", C: "MISMATCH", D: "MISMATCH", E: "MATCH", F: "MISMATCH", G: "MATCH", K: "MATCH", S: "MISMATCH" });
  assert.deepEqual(r.sDetail, { currentMove: "MATCH", role: "MATCH", impliedTrend: "MISMATCH", strict: false });
  assert.deepEqual(r.H, { result: "COMPUTED", absolute: 5, pct: 5, atr: 2, sameSide: true });
  assert.deepEqual(r.I, { result: "COMPUTED", anyOverlap: true, shareOfFirstZonesHit: 0.5, shareOfSecondZonesHit: 1, nearestCenterPct: 6.5, nearestCenterAtr: 2.6 });
  // Proxy: kein absoluter Abstand; Praktiker-Trend unbekannt → S nur aus Richtung + Rolle
  const r2 = K.compareViews(Object.assign({}, P, { impliedTrend: null }), V, { close: 100, atr: 2.5, absoluteComparable: false });
  assert.equal(r2.H.absolute, null);
  assert.equal(r2.metrics.S, "MATCH");
  // unbekannte Richtung → nicht vergleichbar
  assert.equal(K.compareViews(Object.assign({}, P, { currentMove: null }), V, {}).metrics.S, "NOT_COMPARABLE");
  // Grad unbekannt auf einer Seite → D/E nicht vergleichbar
  const r3 = K.compareViews(Object.assign({}, P, { degreeRank: null }), V, {});
  assert.equal(r3.metrics.D, "NOT_COMPARABLE"); assert.equal(r3.metrics.E, "NOT_COMPARABLE");
  assert.equal(K.compareViews(P, V, {}).H.result, "NOT_COMPARABLE");
});
test("metrics: uebergeordnete Richtung des Praktikers nur aus Wellenstart (nicht aus dem Bias)", () => {
  const m = L.effectiveMapping(fx());
  // Zigzag-Welle (C) seit 430,5 (skaliert) bei Schluss 357,63 abwaerts → Korrektur gegen einen Aufwaertstrend
  const zz = (o = {}) => fx(deepMerge({ primary: { pattern: "ZIGZAG", family: "CORRECTIVE", currentWave: "(C)", currentWaveRole: "MOTIVE", waveStartPrice: 4305 } }, o));
  assert.equal(K.practitionerView(zz(), m, { close: 357.63 }).impliedTrend, "UP");
  assert.equal(K.practitionerView(zz({ directionalBias: "UP" }), m, { close: 357.63 }).impliedTrend, "UP", "Bias aendert die Trendableitung nicht");
  assert.equal(K.practitionerView(zz(), m, {}).impliedTrend, null, "ohne Schluss nicht ableitbar");
  assert.equal(K.practitionerView(zz({ primary: { waveStartPrice: null } }), m, { close: 357.63 }).impliedTrend, null);
  assert.equal(K.practitionerView(fx(), m, { close: 357.63 }).impliedTrend, "UP", "Impulswelle 1 seit 349,1 aufwaerts");
  const imp = fx({ primary: { pattern: "IMPULSE", family: "MOTIVE", currentWave: "4", currentWaveRole: "CORRECTIVE", waveStartPrice: 4000 } });
  assert.equal(K.practitionerView(imp, m, { close: 357.63 }).impliedTrend, "UP", "Welle 4 abwaerts in Aufwaertsimpuls");
});
test("metrics: laufende Welle bei abgeschlossenem VU-Muster (naechstes Label des hoeheren Grades)", () => {
  const V = view({ actor: "VU", pattern: "ZIGZAG", family: "CORRECTIVE", completeLabel: "C", inferredNext: "3", state: "CONFIRMED_COMPLETE", role: "MOTIVE", currentMove: "UP" });
  assert.equal(K.compareViews(view({ label: "3" }), V).metrics.C, "MATCH");
  assert.equal(K.compareViews(view({ label: "5" }), V).metrics.C, "MISMATCH");
  assert.equal(K.compareViews(view({ completeLabel: "C", state: "CONFIRMED_COMPLETE" }), V).metrics.C, "MATCH");
  // Praktiker-Notation wird vor dem Vergleich normalisiert: '(iii)' ≙ '3'
  const P = K.practitionerView(fx({ primary: { pattern: "IMPULSE", family: "MOTIVE", currentWave: "(iii)", currentWaveRole: "MOTIVE" } }), L.effectiveMapping(fx()));
  assert.equal(P.label, "3");
  assert.equal(K.compareViews(P, V).metrics.C, "MATCH");
});
test("metrics: Grad-Heuristik (Naeherung) und Cohens κ", () => {
  assert.deepEqual([1, 2, 3, 5, 14, 59, 60, 179, 180, 729, 730, 3649, 3650].map(L.degreeRankFromDays), [-1, -1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  assert.equal(L.degreeRankFromDays(null), null);
  const pairs = [...Array(20).fill(["UP", "UP"]), ...Array(5).fill(["UP", "DOWN"]), ...Array(10).fill(["DOWN", "UP"]), ...Array(15).fill(["DOWN", "DOWN"])];
  assert.ok(Math.abs(K.cohenKappa(pairs) - 0.4) < 1e-12);
  assert.equal(K.cohenKappa([["UP", "UP"], ["DOWN", "DOWN"]]), 1);
});
function aggRow(i, cat, A, fam, sym) {
  return { referenceId: "r" + i, sourceId: fam, sourceFamily: fam, vuSymbol: sym, category: cat, J: { vuAbstain: cat === "VU_ABSTAINED", vuApplicability: cat === "VU_ABSTAINED" ? "LOW" : "MODERATE" },
    metrics: { A1: A, A2: "NOT_COMPARABLE", B: "MATCH", C: "NOT_COMPARABLE", D: "NOT_COMPARABLE", E: "NOT_COMPARABLE", F: "NOT_COMPARABLE", G: "NOT_COMPARABLE", K: "MATCH", S: A },
    notComparableReason: {}, H: { result: "NOT_COMPARABLE" }, I: { result: "NOT_COMPARABLE" }, _a1: ["UP", A === "MATCH" ? "UP" : "DOWN"], _a2: [null, null], _fam: ["MOTIVE", "MOTIVE"] };
}
test("metrics: Aggregat mit und ohne Enthaltung; unter 5 Clustern kein CI, κ erst ab 20 Paaren (H7)", () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(aggRow(i, i % 3 === 0 ? "VU_ABSTAINED" : "VU_APPLICABLE", i % 3 === 0 ? "MISMATCH" : i % 2 ? "MATCH" : "MISMATCH", "s" + (i % 3), ["SPY", "QQQ"][i % 2]));
  rows.push({ referenceId: "u", sourceId: "s0", vuSymbol: null, category: "UNMAPPED" });
  const a = K.aggregate(rows);
  assert.equal(a.cases, 13);
  assert.equal(a.categories.UNMAPPED, 1);
  const A1 = a.metrics.A1;
  assert.equal(A1.includingAbstained.n, 12); assert.equal(A1.excludingAbstained.n, 8); assert.equal(A1.excludingAbstained.match, 4);
  assert.equal(A1.includingAbstained.rate, 0.3333); assert.equal(A1.excludingAbstained.rate, 0.5);
  assert.equal(A1.includingAbstained.ci95, null, "3 Familien / 2 Instrumente → kein CI");
  assert.match(A1.includingAbstained.ciReason, /INSUFFICIENT_CLUSTERS/);
  assert.equal(a.metrics.C.includingAbstained.n, 0);
  assert.equal(a.J.vuAbstainShare, 0.333);
  assert.equal(a.kappa.currentMove.n, 12); assert.equal(a.kappa.currentMove.kappa, null); assert.match(a.kappa.currentMove.reason, /INSUFFICIENT_PAIRS/);
  assert.deepEqual(a.kappa.currentMove.prevalence.first, { DOWN: 0, UP: 12 });
  // genug Cluster und Paare → CI und κ
  const big = [];
  for (let i = 0; i < 40; i++) big.push(aggRow(i, "VU_APPLICABLE", i % 4 === 0 ? "MISMATCH" : "MATCH", "fam" + (i % 6), ["SPY", "QQQ", "DIA", "IWM", "EEM", "BTCUSD"][Math.floor(i / 7) % 6]));
  for (const r of big) r._a1 = [i2dir(r), r.metrics.A1 === "MATCH" ? i2dir(r) : opp(i2dir(r))];
  const b = K.aggregate(big);
  assert.ok(Array.isArray(b.metrics.A1.includingAbstained.ci95));
  assert.ok(b.metrics.A1.includingAbstained.ci95[0] <= 0.75 && b.metrics.A1.includingAbstained.ci95[1] >= 0.75);
  assert.equal(typeof b.kappa.currentMove.kappa, "number");
});
const i2dir = (r) => (+r.referenceId.slice(1) % 3 === 0 ? "DOWN" : "UP"), opp = (d) => (d === "UP" ? "DOWN" : "UP");
test("human–human: Paarungsregel (gleiches Instrument/Zeitrahmen, ≤ 5 Handelstage, andere Quelle, naechste)", () => {
  const mk = (id, src, ts, tf = "1W", sym = "S&P 500") => fx({ referenceId: id, sourceId: src, caseId: `${src}|SPY|x|1`, sourceUrl: `https://example.invalid/${id}`, timeframe: tf, instrument: { asShown: sym }, publication: { timestamp: ts } });
  const refs = [
    mk("pr_a1", "test-fixture-alpha", "2022-10-17T09:00:00-04:00"),
    mk("pr_b1", "test-fixture-beta", "2022-10-24T09:00:00-04:00"),       // 5 Handelstage → Paar
    mk("pr_b2", "test-fixture-beta", "2022-10-19T09:00:00-04:00"),       // naeher → ersetzt b1 fuer a1
    mk("pr_c1", "test-fixture-gamma", "2022-10-25T09:00:00-04:00"),      // 6 Handelstage zu a1, aber Paar mit b1/b2
    mk("pr_a2", "test-fixture-alpha", "2022-10-18T09:00:00-04:00"),      // gleiche Quelle wie a1 → nie mit a1
    mk("pr_d1", "test-fixture-delta", "2022-10-18T09:00:00-04:00", "1D"),  // anderer Zeitrahmen
    mk("pr_e1", "test-fixture-eps", "2022-10-18T09:00:00-04:00", "1W", "NDX")  // anderes Instrument
  ];
  const pairs = K.pairHumanHuman(refs, (r) => L.effectiveMapping(r)).map((p) => [p.a.r.referenceId, p.b.r.referenceId, p.sessionsApart]);
  const has = (x, y) => pairs.some(([a, b]) => (a === x && b === y) || (a === y && b === x));
  assert.ok(has("pr_a1", "pr_b2")); assert.ok(!has("pr_a1", "pr_c1")); assert.ok(!has("pr_a1", "pr_a2"));
  assert.ok(!has("pr_a1", "pr_d1")); assert.ok(!has("pr_a1", "pr_e1")); assert.ok(has("pr_b1", "pr_c1"));
  assert.ok(pairs.every(([, , s]) => s <= 5));
  const hp = K.compareHumanPair(K.pairHumanHuman(refs.slice(0, 3), (r) => L.effectiveMapping(r))[0], () => null);
  assert.equal(hp.agreement, "HIGH_PRACTITIONER_AGREEMENT");
  assert.equal(hp.metrics.F, "MATCH");
});
test("outcome: Ziel/Invalidation, gleicher Bar → Invalidation zuerst, MFE/MAE", () => {
  const base = { direction: "UP", entryClose: 100, invalidation: { price: 95, direction: "below" }, targets: [{ low: 110, high: 115 }, { low: 120, high: 125 }, { low: 98, high: 102 }] };
  const a = O.evaluateOutcome(Object.assign({}, base, { bars: [["d1", 104], ["d2", 111], ["d3", 97], ["d4", 121], ["d5", 94]] }));
  assert.equal(a.firstEvent, "T1"); assert.deepEqual(a.t1, { date: "d2", bars: 2 }); assert.deepEqual(a.t2, { date: "d4", bars: 4 });
  assert.deepEqual(a.invalidation, { date: "d5", bars: 5 }); assert.equal(a.mfePct, 21); assert.equal(a.maePct, -6); assert.equal(a.alreadyInZone, 1);
  // Ziel und Invalidation auf demselben Bar (Zielzone unterhalb der Invalidation ist konstruiert; Regel: Invalidation zuerst)
  const b = O.evaluateOutcome({ direction: "DOWN", entryClose: 100, invalidation: { price: 90, direction: "above" }, targets: [{ low: 80, high: 95 }], bars: [["d1", 94]] });
  assert.equal(b.firstEvent, "INVALIDATION"); assert.equal(b.t1, null);
  const c = O.evaluateOutcome({ direction: "DOWN", entryClose: 100, invalidation: { price: 105, direction: "above" }, targets: [{ low: 85, high: 90 }], bars: [["d1", 98], ["d2", 89], ["d3", 106]] });
  assert.equal(c.firstEvent, "T1"); assert.equal(c.mfePct, 11); assert.equal(c.maePct, -6); assert.deepEqual(c.invalidation, { date: "d3", bars: 3 });
  assert.equal(O.evaluateOutcome({ direction: "UP", entryClose: 100, invalidation: null, targets: [], bars: [["d1", 101]] }).firstEvent, "NO_LEVELS");
});
test("separation: compare.mjs importiert outcome.mjs nicht", () => {
  const src = readFileSync(new URL("../../scripts/technical/practitioner/compare.mjs", import.meta.url), "utf8");
  assert.ok(!/from\s+["'][^"']*outcome/.test(src) && !/import\([^)]*outcome/.test(src));
});

// ================================================================== Ende-zu-Ende (Bausteine) und NO_REFERENCES
test("e2e: Projektion → Replay → Vergleich → getrennte Ergebnisstudie auf echter SPY-Reihe", () => {
  const ref = fx(), m = L.effectiveMapping(ref);
  const rec = R.replayOne(R.replayProjection(ref, m), { dynamics: { before: 2, after: 2 } });
  assert.equal(rec.status, "OK"); assert.equal(rec.timeframeUsed, "1W"); assert.equal(rec.lastBarDate, "2022-10-14");
  assert.ok(rec.vu.hasCount && rec.vu.primary.degree.approximate);
  assert.ok(rec.dynamics.points.some((p) => p.offsetBars === 0) && rec.dynamics.usesPostCutoffData);
  assert.deepEqual(L.plausibilityChecks(ref, { closeAtCutoff: rec.market.closeAtCutoff, levelScale: m.levelScale }).errors, []);
  const row = K.compareCase(ref, m, rec);
  assert.ok(["VU_ABSTAINED", "VU_APPLICABLE"].includes(row.category));
  for (const k of K.METRICS_BINARY) assert.ok(["MATCH", "MISMATCH", "NOT_COMPARABLE"].includes(row.metrics[k]), k);
  assert.equal(row.H.result, "COMPUTED"); assert.equal(row.H.absolute, null, "Proxy: kein absoluter Abstand");
  const lat = K.detectionLatency(ref, m, rec);
  assert.ok(["FOUND", "NOT_IN_WINDOW"].includes(lat.status));
  assert.ok(K.vuRelabel(rec));
  const oc = O.outcomeForCase(ref, m, rec, [ref, revision()]);
  assert.equal(oc.status, "OK"); assert.equal(oc.horizonBars, 52);
  assert.ok(oc.barsAvailable > 0);
  assert.equal(oc.practitioner.revisionBeforeOutcome !== null, true);
});
test("NO_REFERENCES: ohne INCLUDED-Referenzen wird nichts erfunden", () => {
  const dir = tmp(), refs = join(dir, "references.jsonl"), out = join(dir, "bench");
  writeFileSync(refs, "");
  const r = runBenchmark({ refsPath: refs, outDir: out, now: "2026-10-04T00:00:00Z" });
  assert.equal(r.summary.status, "NO_REFERENCES");
  assert.equal(r.summary.input.includedRows, 0);
  for (const f of ["benchmark-summary.json", "replay-results.json", "comparison.json"]) assert.equal(JSON.parse(readFileSync(join(out, f), "utf8")).status, "NO_REFERENCES");
  assert.ok(!existsSync(join(out, "outcome.json")), "Ergebnisstudie ist ein eigener Schritt (run-outcome.mjs)");
  assert.equal(r.summary.metrics, undefined);
  // nur TEST_FIXTURE und Kandidaten → ebenfalls NO_REFERENCES; Testzeilen tauchen in keiner Zaehlung auf
  writeFileSync(refs, [fx(), fx({ referenceId: "pr_cand", status: "CANDIDATE", sourceId: "hkcm", caseId: "hkcm|SPY|2022-10-17|1", sourceUrl: "https://example.org/c" })].map((x) => JSON.stringify(x)).join("\n"));
  const r2 = runBenchmark({ refsPath: refs, outDir: out });
  assert.equal(r2.summary.status, "NO_REFERENCES");
  assert.deepEqual(r2.summary.input.byStatus, { CANDIDATE: 1 });
  assert.ok(!JSON.stringify(r2.summary).includes("test-fixture"));
  // getarnte Testzeile als INCLUDED → lauter Abbruch
  writeFileSync(refs, JSON.stringify(fx({ status: "INCLUDED" })));
  assert.throws(() => runBenchmark({ refsPath: refs, outDir: out }), /TEST_FIXTURE/);
  writeFileSync(refs, "{kaputt");
  assert.throws(() => runBenchmark({ refsPath: refs, outDir: out }), /Zeile 1/);
});
test("Datensatz: references.jsonl enthaelt keine Testdaten; Kartendatei vollstaendig", () => {
  const { rows, errors } = L.loadReferences();
  assert.deepEqual(errors, []);
  assert.ok(rows.every((r) => !L.isTestFixtureLike(r)), "TEST_FIXTURE in references.jsonl");
  const map = L.loadInstrumentMap();
  const q = new Set(["EXACT", "PROXY_SAME_UNDERLYING", "PROXY_DIFFERENT_INSTRUMENT", "UNMAPPED"]);
  for (const e of map.entries) {
    assert.ok(q.has(e.mappingQuality), e.id);
    assert.ok(Object.keys(C.MARKETS).includes(e.market), e.id);
    if (e.vuSymbol) assert.ok(existsSync(join(L.ROOT, "quant/data/market/multi-asset/series", e.vuSymbol + ".json")), e.id);
    else assert.equal(e.mappingQuality, "UNMAPPED");
  }
});

// ================================================================== Red-Team-Regressionen (docs/technical-intelligence/reviews/PRACTITIONER_PIPELINE_REDTEAM.md)
/** Kuenstlicher VU-Replay-Datensatz (nur VU-Felder) fuer Kennzahltests. */
function fakeRec(primary, extra = {}) {
  return Object.assign({ status: "OK", projection: { referenceId: "x", vuSymbol: "SPY", seriesSource: "multi-asset", market: "US_EQUITY", timeframe: "1W", analysisCutoff: "2022-10-14" },
    lastBarDate: "2022-10-14", timeframeUsed: "1W", market: { closeAtCutoff: 357.63, atr14Close: 11 },
    vu: { status: "OK", hasCount: true, applicability: { level: "LOW", abstain: true }, primary: Object.assign({ alternatives: [], targets: [], invalidation: null, degree: { rank: 2 } }, primary), alternatives: [], higherDegree: null } }, extra);
}
test("C1: gleiche Zaehlung → A1/A2/S MATCH (laufende Welle vs. VU currentWave.direction, danach vs. VU nextMove)", () => {
  // README-Beispiel: Impuls, Welle (iii) laeuft aufwaerts; danach (iv) abwaerts. VU: identische Zaehlung, nextMove = DOWN.
  const ref = fx({ timeframe: "1D", primary: { pattern: "IMPULSE", family: "MOTIVE", currentWave: "(iii)", currentWaveRole: "MOTIVE", nextMoveAfterCurrent: "DOWN", waveStartPrice: null } });
  const rec = fakeRec({ pattern: "IMPULSE", family: "MOTIVE", direction: "UP", impliedTrend: "UP", complete: false, nextMove: "DOWN",
                        currentWave: { label: "3", normLabel: "3", role: "MOTIVE", direction: "UP" } });
  const row = K.compareCase(ref, L.effectiveMapping(ref), rec);
  for (const k of ["A1", "A2", "B", "C", "F", "G", "K", "S"]) assert.equal(row.metrics[k], "MATCH", k);
  // Gegenprobe: alte (falsche) Gleichsetzung directionalBias ≙ nextMove waere hier MISMATCH
  assert.notEqual(ref.directionalBias, rec.vu.primary.nextMove);
  // abgeschlossenes VU-Muster: nextMove ist die laufende Gegenbewegung → A2 nicht vergleichbar
  const done = fakeRec({ pattern: "ZIGZAG", family: "CORRECTIVE", direction: "DOWN", impliedTrend: "UP", complete: true, nextMove: "UP", currentWave: { label: "nach C", normLabel: "C", role: "COMPLETE", direction: "UP" } });
  const r2 = K.compareCase(ref, L.effectiveMapping(ref), done);
  assert.equal(r2.metrics.A1, "MATCH"); assert.equal(r2.metrics.A2, "NOT_COMPARABLE");
  // kein nextMoveAfterCurrent → A2 nicht vergleichbar, A1 unberuehrt
  const r3 = K.compareCase(fx({ primary: { nextMoveAfterCurrent: undefined } }), L.effectiveMapping(fx()), rec);
  assert.equal(r3.metrics.A2, "NOT_COMPARABLE"); assert.equal(r3.metrics.A1, "MATCH");
});
test("C1: SIDEWAYS gegen VU ist NOT_COMPARABLE (eigener Grund), zwischen Praktikern vergleichbar", () => {
  const ref = fx({ directionalBias: "SIDEWAYS" }), m = L.effectiveMapping(ref);
  const rec = fakeRec({ pattern: "IMPULSE", family: "MOTIVE", direction: "UP", impliedTrend: "UP", complete: false, nextMove: "DOWN", currentWave: { label: "1", normLabel: "1", role: "MOTIVE", direction: "UP" } });
  const row = K.compareCase(ref, m, rec);
  assert.equal(row.metrics.A1, "NOT_COMPARABLE"); assert.equal(row.metrics.S, "NOT_COMPARABLE");
  assert.equal(row.notComparableReason.A1, "SIDEWAYS_VU_HAS_NO_SIDEWAYS");
  assert.equal(K.aggregate([row]).practitionerSidewaysNotComparable, 1);
  const P = K.practitionerView(ref, m);
  assert.equal(K.compareViews(P, Object.assign({}, P)).metrics.A1, "MATCH");
});
test("C1: Ergebnisstudie nutzt die laufende Bewegung (VU currentWave.direction), nicht nextMove", () => {
  const ref = fx(), m = L.effectiveMapping(ref);
  const rec = fakeRec({ pattern: "IMPULSE", family: "MOTIVE", direction: "UP", impliedTrend: "UP", complete: false, nextMove: "DOWN", currentWave: { label: "1", normLabel: "1", role: "MOTIVE", direction: "UP" } });
  const oc = O.outcomeForCase(ref, m, rec, [ref]);
  assert.equal(oc.vu.direction, "UP"); assert.equal(oc.practitioner.direction, "UP");
});
test("C1: Trajektorie traegt die laufende Bewegung; Latenz vergleicht A1 + Rolle", () => {
  const ref = fx(), m = L.effectiveMapping(ref);
  const rec = fakeRec({}, { dynamics: { status: "OK", points: [
    { date: "a", offsetBars: -1, currentMove: "DOWN", nextMove: "UP", role: "MOTIVE", impliedTrend: "UP" },
    { date: "b", offsetBars: 0, currentMove: "UP", nextMove: "DOWN", role: "MOTIVE", impliedTrend: "UP" }] } });
  assert.deepEqual(K.detectionLatency(ref, m, rec).offsetBars, 0);
  const real = R.replayOne(R.replayProjection(ref, m), { dynamics: { before: 1, after: 0 } });
  assert.ok(real.dynamics.points.every((p) => p.currentMove === "UP" || p.currentMove === "DOWN"));
});

test("H1: Bar-Schlusszeit je VU-Reihe (Metalle/Krypto 24:00 UTC, EIA 24:00 New York, N225 15:30 Tokio, US-ETFs 16:00)", () => {
  // Gold-Beitrag 12.03.2024 18:30 EDT: Tiingo-Bar 12.03. schliesst erst 13.03. 00:00 UTC (20:00 EDT) → Stichtag 11.03.
  const gold = { timestamp: "2024-03-12T18:30:00-04:00", timezone: "America/New_York", timestampPrecision: "MINUTE" };
  assert.equal(C.computeAnalysisCutoff(gold, C.marketForSymbol("XAUUSD")).analysisCutoff, "2024-03-11");
  assert.equal(C.computeAnalysisCutoff({ ...gold, timestamp: "2024-03-12T20:01:00-04:00" }, "FX_METALS_UTC").analysisCutoff, "2024-03-12");
  assert.equal(C.computeAnalysisCutoff({ ...gold, timestamp: "2024-03-12T23:30:00-04:00" }, "US_ENERGY_EIA").analysisCutoff, "2024-03-11");
  assert.equal(C.computeAnalysisCutoff({ ...gold, timestamp: "2024-03-13T00:30:00-04:00" }, "US_ENERGY_EIA").analysisCutoff, "2024-03-12");
  assert.equal(C.computeAnalysisCutoff({ timestamp: "2024-03-12T15:20:00+09:00", timezone: "Asia/Tokyo", timestampPrecision: "MINUTE" }, "JP_EQUITY").analysisCutoff, "2024-03-11");
  // Metalle: Montag 01:00 UTC → Sonntagsbar (geschlossen) ist der Stichtag; kein Samstag
  assert.equal(C.computeAnalysisCutoff({ timestamp: "2024-03-11T01:00:00Z", timezone: "UTC", timestampPrecision: "MINUTE" }, "FX_METALS_UTC").analysisCutoff, "2024-03-10");
  assert.equal(C.computeAnalysisCutoff({ timestamp: "2024-03-10T12:00:00Z", timezone: "UTC", timestampPrecision: "MINUTE" }, "FX_METALS_UTC").analysisCutoff, "2024-03-08");
  // Abbildung und Kartendatei
  const map = L.loadInstrumentMap();
  for (const [sym, mk] of Object.entries(C.SYMBOL_MARKET)) assert.equal(map.seriesMarkets.symbols[sym].market, mk, sym);
  const want = { "tiingo-equity": "US_EQUITY", "tiingo-crypto": "CRYPTO", "tiingo-fx-metals": "FX_METALS_UTC", eia: "US_ENERGY_EIA", "fred-index": "JP_EQUITY" };
  for (const sym of Object.keys(C.SYMBOL_MARKET)) {
    const src = JSON.parse(readFileSync(join(L.ROOT, "quant/data/market/multi-asset/series", sym + ".json"), "utf8")).source;
    assert.equal(C.SYMBOL_MARKET[sym], want[src], `${sym} (${src})`);
  }
  for (const e of map.entries.filter((x) => x.vuSymbol)) assert.equal(e.market, C.SYMBOL_MARKET[e.vuSymbol], e.id);
  assert.equal(L.resolveInstrument({ asShown: "GC1!", instrumentType: "FUTURE" }).market, "FX_METALS_UTC");
  assert.equal(L.resolveInstrument({ asShown: "USOIL", instrumentType: "CFD" }).market, "US_ENERGY_EIA");
  assert.equal(L.resolveInstrument({ asShown: "AAPL", instrumentType: "STOCK" }).market, "US_EQUITY");
  // Wochenbars Metalle: Sonntagsbar gehoert zur Folgewoche (ersetzt nicht den Freitagsschluss)
  assert.deepEqual(R.weeklyFromDaily([["2024-03-08", 1], ["2024-03-10", 2], ["2024-03-15", 3]], "FX_METALS_UTC"), [["2024-03-08", 1], ["2024-03-15", 3]]);
  const p = Object.freeze({ referenceId: "x", vuSymbol: "XAUUSD", seriesSource: "multi-asset", market: "FX_METALS_UTC", timeframe: "1W", analysisCutoff: "2024-03-11" });
  const { bars, limit } = R.barsUntil(p, p.analysisCutoff);
  assert.equal(limit, "2024-03-08"); assert.ok(bars.every((b) => C.dow(b[0]) !== 0), "kein Sonntagsbar als Wochenschluss");
});
test("H2: Formular und Pipeline – eine Stichtagsregel (Wochenende, Karfreitag, 1W), Roundtrip Formular → Validierung", () => {
  assert.equal(C.computeAnalysisCutoff, Core.CUTOFF.computeAnalysisCutoff, "cutoff.mjs re-exportiert die Seitenlogik");
  const cases = [
    ["2024-03-13T18:00:00+01:00", "Europe/Berlin", "MINUTE", "1W", "2024-03-12"],     // Red-Team-Repro: Seite gab 2024-03-08
    ["2024-03-30T12:00:00+01:00", "Europe/Berlin", "MINUTE", "1D", "2024-03-29"],     // Karfreitag: Kalender kennt keinen Feiertag
    ["2024-03-30T12:00:00+01:00", "Europe/Berlin", "MINUTE", "1W", "2024-03-29"],
    ["2024-06-09T12:00:00+02:00", "Europe/Berlin", "DAY", "1D", "2024-06-07"],        // Sonntag
    ["2024-06-08T10:00:00-04:00", "America/New_York", "HOUR", "1W", "2024-06-07"]     // Samstag, Woche
  ];
  const spyDates = R.defaultLoader("SPY", "multi-asset", "daily").map((x) => x[0]);
  for (const [ts, tz, prec, tf, want] of cases) {
    const page = Core.computeCutoff({ timestamp: ts, precision: prec, timezone: tz, market: "US_EQUITY", timeframe: tf, dates: spyDates });
    const lib = C.computeAnalysisCutoff({ timestamp: ts, timezone: tz, timestampPrecision: prec }, "US_EQUITY").analysisCutoff;
    assert.equal(page.date, want, ts + " " + tf); assert.equal(lib, want, ts + " " + tf);
  }
  // Einrasten (Karfreitag) und Woche nur im Replay
  const gf = R.barsUntil(Object.freeze({ referenceId: "x", vuSymbol: "SPY", seriesSource: "multi-asset", market: "US_EQUITY", timeframe: "1D", analysisCutoff: "2024-03-29" }), "2024-03-29");
  assert.equal(gf.bars[gf.bars.length - 1][0], "2024-03-28");
  assert.equal(Core.computeCutoff({ timestamp: "2024-03-30T12:00:00+01:00", precision: "MINUTE", timezone: "Europe/Berlin", market: "US_EQUITY", timeframe: "1D", dates: spyDates }).lastVuBar, "2024-03-28");
  // Roundtrip: Formular-Zeile (Seitenlogik) besteht die Stichtagspruefung der Pipeline, auch fuer Gold (H1) und 1W
  for (const [asShown, type, sym, q, tf, local, tz] of [["S&P 500", "INDEX_CASH", "SPY", "PROXY_DIFFERENT_INSTRUMENT", "1W", "2024-03-13T18:00", "Europe/Berlin"],
                                                        ["XAUUSD", "COMMODITY_SPOT", "XAUUSD", "EXACT", "1D", "2024-03-12T18:30", "America/New_York"]]) {
    const st = { sourceId: "test-fixture-form", sourceType: "WEBSITE", sourceUrl: "https://example.invalid/form/" + sym, localDateTime: local, timezone: tz, precision: "MINUTE", timestampBasis: "TEST", edited: "NO",
      asShown, instrumentType: type, priceAdjustment: "UNKNOWN", vuSymbol: sym, mappingQuality: q, levelScale: q === "EXACT" ? "" : "0,1", timeframe: tf, elliottSchool: "CLASSICAL",
      pPattern: "IMPULSE", pFamily: "MOTIVE", pCurrentWave: "3", pRole: "MOTIVE", pState: "DEVELOPING", directionalBias: "UP", summary: "TEST FIXTURE", confidence: "HIGH", method: "HUMAN_FROM_PRIMARY",
      extractor: "TEST-EXT1", evidence: [{ field: "primary", locator: "00:00", note: "TEST FIXTURE" }], status: "TEST_FIXTURE" };
    st.timestamp = Core.localToIso(st.localDateTime, st.timezone);
    st.analysisCutoff = Core.computeCutoff({ timestamp: st.timestamp, precision: st.precision, timezone: st.timezone, market: Core.guessMarket(type, sym, asShown), timeframe: tf }).date;
    const rec = Core.buildRecord(st);
    const errs = L.validateReference(rec).errors.filter((e) => /analysisCutoff|cutoff/i.test(e));
    assert.deepEqual(errs, [], sym + ": " + JSON.stringify(errs));
  }
});

/** Referenz-Minimalform fuer Split-Tests (nur Felder, die assignSplits liest). */
const sref = (id, fam, sym, cutoff, pubDate = cutoff, extra = {}) => Object.assign({ referenceId: id, caseId: `${fam}|${sym}|${pubDate}|1`, sourceId: fam, version: 1, revisionOf: null, viewKind: "ORIGINAL_PUBLISHED",
  instrument: { vuSymbol: sym }, analysisCutoff: cutoff, publication: { timestamp: `${pubDate}T22:00:00Z`, timezone: "UTC", timestampPrecision: "MINUTE" } }, extra);
test("H3: Splits nach Marktfenster-Clustern, Erben von Revisionen/Duplikaten, QUARANTINE-Schutz", () => {
  const refs = [
    sref("pr_a1", "fa", "SPY", "2023-03-01"), sref("pr_a2", "fa", "SPY", "2023-03-03"),           // Nachbarn → gleicher Split
    sref("pr_a3", "fa", "QQQ", "2023-05-02"), sref("pr_a4", "fa", "DIA", "2023-07-03"),
    sref("pr_b1", "fb", "IWM", "2023-01-10"), sref("pr_b2", "fb", "IWM", "2023-06-01"), sref("pr_b3", "fb", "EEM", "2023-08-01"),
    sref("pr_c1", "fc", "SPY", "2023-03-08"), sref("pr_c2", "fc", "XAUUSD", "2023-09-01"),       // fc = zweitgroesste Familie → HOLDOUT_SOURCE
    sref("pr_d1", "fd", "QQQ", "2024-12-20"), sref("pr_e1", "fe", "QQQ", "2025-01-06", "2025-01-06"),  // DEV neben HOLDOUT_TEMPORAL
    sref("pr_a1_v2", "fa", "SPY", "2025-02-03", "2025-02-03", { version: 2, revisionOf: "pr_a1", viewKind: "LATER_REVISION", caseId: "fa|SPY|2023-03-01|1" })
  ];
  const s = L.assignSplits(refs);
  assert.equal(s.holdoutSource, "fb");
  const by = s.byReference;
  assert.ok(["HOLDOUT_SOURCE"].includes(by.pr_b1) && by.pr_b2 === "HOLDOUT_SOURCE");
  assert.equal(by.pr_e1, "HOLDOUT_TEMPORAL");
  assert.equal(by.pr_d1, "QUARANTINE", "DEV-Fall 20.12.2024 liegt im Fenster des Holdout-Falls 06.01.2025 (QQQ)");
  assert.equal(by.pr_a1, by.pr_a2, "SPY-Nachbarn im selben Split");
  assert.equal(by.pr_c1, by.pr_a1, "auch quellenuebergreifend: gleicher Marktausschnitt → gleicher Split");
  assert.equal(by.pr_a1_v2, by.pr_a1, "Revision erbt die Aufteilung des Originals (auch wenn 2025 veroeffentlicht)");
  assert.deepEqual(L.splitGuardViolations(refs, s.byCase), []);
  assert.ok(s.quarantine.some((q) => q.caseId === "fd|QQQ|2024-12-20|1" && q.collidesWith === "fe|QQQ|2025-01-06|1"));
  // Duplikat erbt
  const d = L.assignSplits(refs, { duplicates: [{ originalId: "pr_a3", duplicateId: "pr_a3_x" }] });
  assert.equal(d.byReference.pr_a3_x, d.byReference.pr_a3);
  // vorgegebene Holdout-Quelle (aus dem Manifest) wird uebernommen, nicht neu gerechnet
  assert.equal(L.assignSplits(refs, { holdoutSource: "fa" }).byReference.pr_a4, "HOLDOUT_SOURCE");
  // Schutz greift auch fuer Revisionen: Revision 2025 (SPY 03.02.2025) neben einem Holdout-Temporal-Fall
  const r2 = refs.concat([sref("pr_f1", "ff", "SPY", "2025-02-10", "2025-02-10")]);
  const s2 = L.assignSplits(r2);
  assert.equal(s2.byReference.pr_f1, "HOLDOUT_TEMPORAL");
  assert.equal(s2.byReference.pr_a1, "QUARANTINE", "Kette mit Revision im Fenster eines Holdout-Falls → QUARANTINE");
  assert.deepEqual(L.splitGuardViolations(r2, s2.byCase), []);
});
test("H7: hkcm und phantom-hkcm sind eine Quellenfamilie (Paarung, Cluster, Holdout)", () => {
  const reg = L.loadSourceRegistry();
  assert.equal(L.sourceFamily("phantom-hkcm", reg), L.sourceFamily("hkcm", reg));
  assert.equal(L.sourceFamily("phantom-hkcm"), "hkcm");
  assert.notEqual(L.sourceFamily("ewf", reg), L.sourceFamily("hkcm", reg));
  const treg = { sources: [{ sourceId: "test-fixture-house-a", sourceFamily: "test-house" }, { sourceId: "test-fixture-house-b", sourceFamily: "test-house" }, { sourceId: "test-fixture-other", sourceFamily: "test-other" }] };
  const mk = (id, src, ts) => fx({ referenceId: id, sourceId: src, caseId: `${src}|SPY|x|1`, sourceUrl: `https://example.invalid/${id}`, publication: { timestamp: ts } });
  const refs = [mk("pr_h1", "test-fixture-house-a", "2022-10-17T09:00:00-04:00"), mk("pr_h2", "test-fixture-house-b", "2022-10-18T09:00:00-04:00"), mk("pr_o1", "test-fixture-other", "2022-10-19T09:00:00-04:00")];
  const pairs = K.pairHumanHuman(refs, (r) => L.effectiveMapping(r), 5, (id) => L.sourceFamily(id, treg)).map((p) => [p.a.r.referenceId, p.b.r.referenceId].join("+"));
  assert.ok(!pairs.includes("pr_h1+pr_h2"), "gleiches Haus ist keine unabhaengige Zweitmeinung");
  assert.ok(pairs.includes("pr_h1+pr_o1") || pairs.includes("pr_h2+pr_o1"));
  const row = K.compareCase(refs[1], L.effectiveMapping(refs[1]), { status: "UNMAPPED" }, { registry: treg });
  assert.equal(row.sourceFamily, "test-house");
});
test("M5: unbekannte Felder auch verschachtelt abgelehnt, Zeichenlaengen begrenzt; nextMoveAfterCurrent ist die einzige Erweiterung", () => {
  const bad = [
    [(r) => { r.publication.transcript = "x".repeat(20000); }, /publication\.transcript: Feld im Schema nicht erlaubt/],
    [(r) => { r.extraction.fullText = "y"; }, /extraction\.fullText/],
    [(r) => { r.primary.notes = "z"; }, /primary\.notes/],
    [(r) => { r.evidence[0].screenshot = "data:"; }, /evidence\[0\]\.screenshot/],
    [(r) => { r.targetZones[0].comment = "q"; }, /targetZones\[0\]\.comment/],
    [(r) => { r.structuralScenario = "s".repeat(401); }, /structuralScenario: laenger als 400/],
    [(r) => { r.extraction.ambiguities = ["a".repeat(401)]; }, /ambiguities\[0\]: laenger als 400/],
    [(r) => { r.alternatives[0].note = "n".repeat(20000); }, /alternatives\[0\]\.note: laenger/],
    [(r) => { r.publication.editNote = "e".repeat(401); }, /editNote: laenger/],
    [(r) => { r.primary.nextMoveAfterCurrent = "LATER"; }, /nextMoveAfterCurrent: Wert/]
  ];
  for (const [mut, re] of bad) { const r = fx(); mut(r); const errs = L.validateReference(r).errors; assert.ok(errs.some((e) => re.test(e)), `${re} → ${JSON.stringify(errs)}`); }
  assert.deepEqual(L.validateReference(fx()).errors, [], "nextMoveAfterCurrent ist erlaubt");
  assert.equal(L.validateSchema({ x: "y".repeat(500) }, { type: "object", properties: { x: { type: "string" } } }).length, 1);
  assert.equal(L.validateSchema({ x: "y".repeat(500) }, { type: "object", properties: { x: { type: "string" } } }, undefined, "$", [], false).length, 0, "nicht-strikter Modus nur fuer Altdaten");
});
test("M6: deterministische Auswahl der Zweitextraktion (Seed 20261004, 25 %)", () => {
  const ids = Array.from({ length: 41 }, (_, i) => `test-fixture-x|SPY|2023-01-${String((i % 28) + 1).padStart(2, "0")}|${i}`);
  const a = L.selectSecondPass(ids), b = L.selectSecondPass(ids.slice().reverse().concat(ids.slice(0, 3)));
  assert.equal(a.length, 11); assert.deepEqual(a, b, "unabhaengig von Reihenfolge und Wiederholungen");
  assert.ok(a.every((x) => ids.includes(x)));
  assert.notDeepEqual(L.selectSecondPass(ids, { seed: 1 }), a);
  assert.equal(L.SECOND_PASS_SEED, 20261004);
});

/** Selbsttest-Datensatz: sichtbar (DEV/VAL), versiegelt (HOLDOUT_*), QUARANTINE, UNMAPPED, Cross-Post, Revision. */
function selfTestRows() {
  const at = (id, fam, over) => fx(deepMerge({ referenceId: id, sourceId: "test-fixture-" + fam, caseId: `test-fixture-${fam}|SPY|x|${id}`, sourceUrl: `https://example.invalid/${fam}/${id}` }, over));
  const qqq = { instrument: { asShown: "QQQ", instrumentType: "ETF", vuSymbol: "QQQ", mappingQuality: "EXACT", levelScale: null }, timeframe: "1D", targetZones: [], invalidation: null, primary: { waveStartPrice: null } };
  const a = at("pr_tf_a", "alpha", { caseId: "test-fixture-alpha|SPY|2022-10-17|1" });
  const rev = deepMerge(revision(), { sourceId: "test-fixture-alpha", caseId: "test-fixture-alpha|SPY|2022-10-17|1", revisionOf: "pr_tf_a", referenceId: "pr_tf_a_v2" });
  const cross = at("pr_tf_a_x", "alpha", { caseId: "test-fixture-alpha|SPY|2022-10-17|1", sourceType: "X" });
  const g = at("pr_tf_g", "gamma", { publication: { timestamp: "2022-10-19T18:00:00+02:00", timezone: "Europe/Berlin" }, analysisCutoff: "2022-10-18", directionalBias: "DOWN" });
  const dax = at("pr_tf_dax", "alpha", { caseId: "test-fixture-alpha|UNMAPPED:DAX|2022-10-17|1", instrument: { asShown: "DAX", instrumentType: "INDEX_CASH", vuSymbol: null, mappingQuality: "UNMAPPED", levelScale: null },
    publication: { timestamp: "2022-10-17T09:00:00+02:00", timezone: "Europe/Berlin" } });
  const btc = at("pr_tf_btc", "beta", { timeframe: "1D", instrument: { asShown: "BTCUSD", instrumentType: "CRYPTO_SPOT", vuSymbol: "BTCUSD", mappingQuality: "EXACT", levelScale: null },
    publication: { timestamp: "2023-06-15T10:00:00+02:00", timezone: "Europe/Berlin" }, analysisCutoff: "2023-06-14", primary: { waveStartPrice: 25000 },
    targetZones: [{ low: 30000, high: 31000, label: "T1" }], invalidation: { price: 24000, direction: "below", basis: "CLOSE" } });
  const b2 = at("pr_tf_b2", "beta", deepMerge(clone(qqq), { publication: { timestamp: "2023-03-15T10:00:00-04:00" }, analysisCutoff: "2023-03-14" }));
  const z = at("pr_tf_z", "zeta", deepMerge(clone(qqq), { publication: { timestamp: "2023-03-10T10:00:00-05:00" }, analysisCutoff: "2023-03-09" }));       // QUARANTINE (Fenster von b2)
  const d = at("pr_tf_d", "delta", { publication: { timestamp: "2025-02-04T10:00:00-05:00" }, analysisCutoff: "2025-02-03", targetZones: [], invalidation: null, primary: { waveStartPrice: null } });  // HOLDOUT_TEMPORAL
  return [a, rev, cross, g, dax, btc, b2, z, d];
}
test("H4 + M8: versiegelte Holdouts, Holdout-Quelle aus dem Manifest, Entsiegelung genau einmal, Ergebnisstudie nur nach Siegel", () => {
  const dir = tmp(), src = join(dir, "fixtures.jsonl"), fz = join(dir, "freeze"), out = join(dir, "bench");
  const rows = selfTestRows();
  // Cross-Post vor dem Freeze aufloesen (Freeze verweigert ungeklaerte Duplikate)
  assert.throws(() => L.freezeReferences(rows, { outDir: fz, version: "TEST_FREEZE", selfTestMode: true }), /Duplikat/);
  const fr = L.freezeReferences(rows.filter((r) => r.referenceId !== "pr_tf_a_x"), { outDir: fz, version: "TEST_FREEZE", selfTestMode: true, now: "2026-10-04T00:00:00Z" });
  const sp = fr.manifest.splits.byCase;
  assert.equal(fr.manifest.holdoutSource, "test-fixture-beta");
  assert.equal(sp["test-fixture-beta|SPY|x|pr_tf_btc"], "HOLDOUT_SOURCE");
  assert.equal(sp["test-fixture-delta|SPY|x|pr_tf_d"], "HOLDOUT_TEMPORAL");
  assert.equal(sp["test-fixture-zeta|SPY|x|pr_tf_z"], "QUARANTINE");
  const lines = readFileSync(fr.file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(lines.every((l) => l.split !== "QUARANTINE"), "Schema kennt QUARANTINE nicht → Zeile UNASSIGNED, Tabelle im Manifest");
  // Ergebnisstudie vor dem Vergleich → verweigert
  assert.throws(() => runOutcome({ refsPath: fr.file, benchDir: out, selfTestMode: true }), /versiegelter Vergleich fehlt/);
  assert.throws(() => runOutcome({ refsPath: src, benchDir: out, selfTestMode: true }), /nicht eingefroren/);
  // Vergleich: nur DEV/VAL sichtbar
  const r = runBenchmark({ refsPath: fr.file, outDir: out, selfTestMode: true, dynamicsBefore: 1, dynamicsAfter: 1 });
  assert.equal(r.summary.status, "SELF_TEST"); assert.match(r.summary.label, /NOT A RESULT/);
  assert.equal(r.summary.splits.provisional, false); assert.equal(r.summary.splits.holdoutSource, "test-fixture-beta");
  assert.deepEqual(r.summary.splits.sealed, { HOLDOUT_SOURCE: 2, HOLDOUT_TEMPORAL: 1 });
  const txt = readFileSync(join(out, "comparison.json"), "utf8") + readFileSync(join(out, "replay-results.json"), "utf8") + readFileSync(join(out, "benchmark-summary.json"), "utf8");
  for (const id of ["pr_tf_btc", "pr_tf_b2", "pr_tf_d", "pr_tf_z"]) assert.ok(!txt.includes(`"${id}"`), id + " darf versiegelt nicht erscheinen");
  assert.ok(!Object.keys(r.comparison.vuVsPractitioner.bySplit).some((k) => k.startsWith("HOLDOUT") || k === "QUARANTINE"));
  assert.equal(r.comparison.vuVsPractitioner.all.cases, 3);                     // a, g, dax
  assert.equal(r.comparison.vuVsPractitioner.all.categories.UNMAPPED, 1);
  assert.ok(r.comparison.vuVsPractitioner.latestView);
  assert.equal(r.comparison.humanHuman.pairs, 1);
  assert.equal(r.comparison.humanPairs[0].metrics.A1, "MISMATCH");
  assert.ok(r.comparison.rows.every((x) => !Object.keys(x).some((k) => k.startsWith("_"))));
  const repl = JSON.parse(readFileSync(join(out, "replay-results.json"), "utf8"));
  for (const x of repl.results) assert.deepEqual(Object.keys(x.projection).sort(), [...R.PROJECTION_KEYS].sort());
  // Ergebnisstudie: nur nach Siegel, nur fuer sichtbare Faelle; Manipulation wird erkannt
  const oc = runOutcome({ refsPath: fr.file, benchDir: out, selfTestMode: true });
  assert.equal(oc.status, "SELF_TEST"); assert.equal(oc.freeze.sha256, fr.manifest.sha256);
  assert.deepEqual(oc.rows.map((x) => x.referenceId).sort(), ["pr_tf_a", "pr_tf_dax", "pr_tf_g"]);
  assert.equal(oc.rows.filter((x) => x.status === "OK").length, 2);
  writeFileSync(join(out, "comparison.json"), readFileSync(join(out, "comparison.json"), "utf8").replace('"OK"', '"0K"'));
  assert.throws(() => runOutcome({ refsPath: fr.file, benchDir: out, selfTestMode: true }), /nach der Versiegelung veraendert/);
  // Siegel eines anderen Freezes
  const out2 = join(dir, "bench2"), fz2 = join(dir, "freeze2");
  const fr2 = L.freezeReferences(rows.filter((x) => !["pr_tf_a_x", "pr_tf_g"].includes(x.referenceId)), { outDir: fz2, version: "TEST_FREEZE", selfTestMode: true });
  runBenchmark({ refsPath: fr2.file, outDir: out2, selfTestMode: true, dynamicsBefore: 0, dynamicsAfter: 0 });
  assert.throws(() => runOutcome({ refsPath: fr.file, benchDir: out2, selfTestMode: true }), /anderen Freeze/);
  // Entsiegelung: nur mit Manifest, genau einmal je Holdout und Freeze
  assert.throws(() => runBenchmark({ refsPath: src, outDir: join(dir, "b3"), selfTestMode: true, unsealHoldout: "HOLDOUT_SOURCE" }), /eingefrorenen Datensatz/);
  assert.throws(() => runBenchmark({ refsPath: fr.file, outDir: out, selfTestMode: true, unsealHoldout: "DEVELOPMENT" }), /erwartet/);
  const u = runBenchmark({ refsPath: fr.file, outDir: out, selfTestMode: true, unsealHoldout: "HOLDOUT_SOURCE", dynamicsBefore: 0, dynamicsAfter: 0 });
  assert.equal(u.unsealed, "HOLDOUT_SOURCE"); assert.ok(existsSync(u.file));
  assert.deepEqual(u.comparison.rows.map((x) => x.referenceId).sort(), ["pr_tf_b2", "pr_tf_btc"]);
  assert.match(readFileSync(join(out, "unseal-log.jsonl"), "utf8"), new RegExp(fr.manifest.sha256));
  assert.throws(() => runBenchmark({ refsPath: fr.file, outDir: out, selfTestMode: true, unsealHoldout: "HOLDOUT_SOURCE" }), /genau einmal/);
  // Selbsttest-Modus nie in practitioner-v1
  assert.throws(() => runBenchmark({ refsPath: fr.file, outDir: join(L.PV1, "benchmark"), selfTestMode: true }), /selfTestMode/);
});

/* Protokoll-Nachtrag 2: LLM_DUAL_INDEPENDENT_PRIMARY nur mit zwei verschiedenen Durchgaengen und dokumentierter Kernfeld-Uebereinstimmung */
test("Nachtrag 2: LLM_DUAL_INDEPENDENT_PRIMARY freeze guards", () => {
  const base = { referenceId: "pr_x_spy_20240312_abcdef_v1", status: "INCLUDED", evidence: [{ field: "primary", note: "Labels sichtbar" }] };
  const mk = (extraction) => Object.assign({}, base, { extraction });
  const has = (r, re) => L.freezeBlockers(r).some((m) => re.test(m));
  assert.ok(has(mk({ confidence: "HIGH", extractor: "llm-a", method: "LLM_DUAL_INDEPENDENT_PRIMARY" }), /zwei verschiedene Durchgaenge/));
  assert.ok(has(mk({ confidence: "HIGH", extractor: "llm-a", method: "LLM_DUAL_INDEPENDENT_PRIMARY", passes: { a: "p1", b: "p1", coreFieldAgreement: {} } }), /zwei verschiedene/));
  assert.ok(has(mk({ confidence: "HIGH", extractor: "llm-a", method: "LLM_DUAL_INDEPENDENT_PRIMARY", passes: { a: "p1", b: "p2", coreFieldAgreement: { family: true, currentWave: false } } }), /HIGH trotz abweichender/));
  assert.ok(!has(mk({ confidence: "MEDIUM", extractor: "llm-a", method: "LLM_DUAL_INDEPENDENT_PRIMARY", passes: { a: "p1", b: "p2", coreFieldAgreement: { family: true, currentWave: false } } }), /Durchgaenge|abweichender|coreField/));
  assert.ok(L.loadSchema().properties.extraction.properties.method.enum.includes("LLM_DUAL_INDEPENDENT_PRIMARY"));
});

test("Nachtrag 4: Wochen-/Monatszaehlung mit Invalidation am Welle-II-Tief ist plausibel, Skalenfehler nicht", () => {
  const base = { timeframe: "1M", invalidation: { price: 4.87, direction: "below", basis: "UNKNOWN" }, targetZones: [], keySupportZones: [{ low: 93.96, high: 189.12 }], entryZones: [], alternatives: [], primary: null };
  assert.deepEqual(L.plausibilityChecks(base, { closeAtCutoff: 246.89, levelScale: 1 }).errors, []);
  assert.ok(L.plausibilityChecks(Object.assign({}, base, { timeframe: "1D" }), { closeAtCutoff: 246.89, levelScale: 1 }).errors.length >= 1);
  assert.ok(L.plausibilityChecks(base, { closeAtCutoff: 246.89, levelScale: 0.001 }).errors.some((e) => /Faktor 100/.test(e)));
});

// ================================================================== Nachtrag 6 (Red-Team §122)
test("Nachtrag 6 a: abgeschlossenes VU-Muster → B/F gegen die enthaltende Struktur, sonst NOT_COMPARABLE", () => {
  const rec = (higherDegree) => ({ status: "OK", vu: { status: "OK", applicability: { abstain: true, level: "LOW" }, alternatives: [{ pattern: "TRIANGLE", complete: true, currentWave: { normLabel: "E", direction: "DOWN" } }], higherDegree,
    primary: { pattern: "WXY", family: "CORRECTIVE", complete: true, currentWave: { normLabel: "Y", direction: "UP", role: "CORRECTIVE" }, nextMove: null, impliedTrend: null, degree: { rank: 1 }, invalidation: null, targets: [] } } });
  const noHd = K.vuView(rec(null));
  assert.equal(noHd.ownPattern, "WXY");
  assert.equal(noHd.pattern, null);
  assert.equal(noHd.family, null);
  assert.equal(noHd.alternatives[0].pattern, null);
  const P = view({ actor: "PRACTITIONER", pattern: "IMPULSE", family: "MOTIVE", label: "3", role: "MOTIVE", state: "DEVELOPING", currentMove: "UP" });
  const r = K.compareViews(P, noHd, { close: 100 });
  assert.equal(r.metrics.B, "NOT_COMPARABLE");
  assert.equal(r.metrics.F, "NOT_COMPARABLE");
  assert.equal(r.notComparableReason.B, "VU_PATTERN_COMPLETE_NO_CONTAINING_STRUCTURE");
  const withHd = K.vuView(rec({ pattern: "IMPULSE", currentLabel: "2", nextLabel: "3", role: "CORRECTIVE", direction: "DOWN" }));
  assert.equal(withHd.pattern, "IMPULSE");
  assert.equal(withHd.family, "MOTIVE");
  const r2 = K.compareViews(P, withHd, { close: 100 });
  assert.equal(r2.metrics.B, "MATCH");
  assert.equal(r2.metrics.F, "MATCH");   // IMPULSE, laufende Welle 3 = naechstes Label des hoeheren Grades
  // laufendes VU-Muster: unveraendert die eigene Familie
  const run = K.vuView({ status: "OK", vu: Object.assign(rec(null).vu, { primary: Object.assign(rec(null).vu.primary, { complete: false }) }) });
  assert.equal(run.family, "CORRECTIVE");
  assert.equal(run.pattern, "WXY");
});
test("Nachtrag 6 c/d: kein Folgebar → NO_FORWARD_DATA; Latenz zaehlt linkszensierte Treffer", () => {
  const ref = fx();
  const out = O.outcomeForCase(ref, L.effectiveMapping(ref), { status: "OK", timeframeUsed: "1D", lastBarDate: "2099-12-30", projection: R.replayProjection(ref, L.effectiveMapping(ref)), market: { closeAtCutoff: 100 }, vu: null }, [ref]);
  assert.equal(out.status, "NO_FORWARD_DATA");
  assert.equal(O.aggregateOutcomes([out]).cases, 0);
  assert.equal(R.FAR_FUTURE, "2099-12-31");
  assert.notEqual(C.lastCompleteWeekEnd(R.FAR_FUTURE, "CRYPTO").length, 0);
  assert.match(C.lastCompleteWeekEnd(R.FAR_FUTURE, "CRYPTO"), /^\d{4}-\d{2}-\d{2}$/);
  const s = K.dynamicsSummary(new Map(), [{ status: "FOUND", offsetBars: -10, window: [-10, 10] }, { status: "FOUND", offsetBars: 3, window: [-10, 10] }, { status: "NOT_IN_WINDOW" }], []);
  assert.equal(s.detectionLatency.leftCensored, 1);
  assert.equal(s.detectionLatency.found, 2);
});
