// Foundation Repair (A4/A5/A8): Regressionstests fuer den Research-Abrechnungsvertrag.
// Eingaben: eingefrorene synthetische Faelle (foundation/cases.mjs). Legacy muss bitgleich zum
// Golden (unveraenderter Stand) bleiben, RESEARCH_V1 muss jede Erhaltungsidentitaet erfuellen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, CALENDAR, buildCase } from '../foundation/cases.mjs';
import { summarizeRun } from '../foundation/summarize-run.mjs';
import { runPortfolioTR, reconcileResearch, reconcile } from '../validation/portfolio.mjs';
import * as AC from '../validation/accounting-contract.mjs';
import { segmentEndCause } from '../validation/analyze-methods.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/foundation-legacy-golden.json'), 'utf8')).cases;
const C = CALENDAR;
const run = (id, opts = {}) => { const c = CASES.find((x) => x.id === id); const { calendar, trades, cfg } = buildCase(c); return { r: runPortfolioTR(trades, calendar, cfg, { scenario: 'S1_MINUS_30', ...opts }), cfg, trades }; };
const v1 = (id, opts = {}) => run(id, { accounting: 'RESEARCH_V1', ...opts });
const settledOn = (r) => r.taken[0].settlement?.date ?? null;

test('Legacy-Pfad bleibt bitgleich zum eingefrorenen Golden (keine Live-/Altrunden-Aenderung)', () => {
  for (const c of CASES) {
    const { calendar, trades, cfg } = buildCase(c);
    assert.deepEqual(summarizeRun(runPortfolioTR(trades, calendar, cfg, { scenario: 'S1_MINUS_30' }), cfg), GOLDEN[c.id], c.id);
  }
});

test('RESEARCH_V1: jede Erhaltungsidentitaet in jedem Fall (Bargeld aus Ledger, Endwert, P&L, keine negativen Bestaende)', () => {
  for (const c of CASES) {
    const { calendar, trades, cfg } = buildCase(c);
    const r = runPortfolioTR(trades, calendar, cfg, { scenario: 'S1_MINUS_30', accounting: 'RESEARCH_V1' });
    const rc = reconcileResearch(r, cfg);
    assert.equal(rc.pass, true, `${c.id}: ${JSON.stringify(rc.checks)}`);
    assert.ok(r.minCash >= 0, `${c.id}: negatives Bargeld`);
    for (const p of r.taken) assert.ok(p.shares >= 0, `${c.id}: negative Stueckzahl`);
  }
});

test('A4 Bar vorhanden / ein Tag / mehrere Tage innerhalb der Grenze: keine Abrechnung, Ergebnis wie Legacy', () => {
  for (const id of ['C01_BAR_PRESENT', 'C02_ONE_MISSING_BAR', 'C03_MULTI_MISSING_WITHIN_LIMIT']) {
    const { r, cfg } = v1(id);
    assert.equal(settledOn(r), null, id);
    assert.equal(summarizeRun(r, cfg).finalEquity, GOLDEN[id].finalEquity, id);
    assert.equal(r.staleCounts.unavailableSettlements, 0);
  }
  assert.equal(v1('C03_MULTI_MISSING_WITHIN_LIMIT').r.staleCounts.maxObservedStaleSessions, 5);
});

test('A4 Stale-Grenze erreicht: Abrechnung in der 6. Sitzung ohne Kurs zum letzten Schluss, spaetere Ausstiege verfallen', () => {
  const { r } = v1('C04_STALE_LIMIT_REACHED');
  const p = r.taken[0];
  assert.equal(p.settlement.kind, 'SECURITY_UNAVAILABLE');
  assert.equal(p.settlement.date, C[13]); // letzter Kurs C[7], Sitzungen 8..12 stale (5), 13 = sechste
  assert.equal(p.settlement.lastClose, 10.7);
  assert.equal(p.settlement.factor, 1);
  assert.equal(p.settlement.ignoredExits, 1);
  assert.ok(r.equity.find((e) => e.date === C[12]).stale === 1);
  // Legacy hielt den alten Schluss unbegrenzt und buchte den spaeteren Ausstieg zu 20.
  assert.ok(GOLDEN.C04_STALE_LIMIT_REACHED.finalEquity > 109000);
});

test('A4 Nullvolumen bei unveraendertem Schluss setzt den Stale-Zaehler nicht zurueck', () => {
  const { r } = v1('C21_ZERO_VOLUME_STALE');
  assert.equal(r.taken[0].settlement.kind, 'SECURITY_UNAVAILABLE');
  assert.equal(r.taken[0].settlement.date, C[11]);
});

test('A5 spaetere Quarantaene: Buchung erst in der ersten Sitzung ab observedAt, Faktor 1 statt 0,7', () => {
  const late = v1('C08_LATE_OBSERVED_QUARANTINE').r, ontime = v1('C09_ONTIME_QUARANTINE').r;
  assert.equal(settledOn(late), C[15]);
  assert.equal(late.taken[0].settlement.kind, 'DATA_QUARANTINE');
  assert.equal(settledOn(ontime), C[12]);
  assert.equal(late.taken[0].settlement.factor, 1);
  // Bewertung bis zur Buchung: letzter gueltiger Schluss, keine spaetere Information.
  for (let i = 12; i < 15; i++) assert.equal(late.equity[i].n, 1);
  assert.equal(late.equity[15].n, 0);
  // Sensitivitaeten bleiben verfuegbar.
  assert.equal(v1('C08_LATE_OBSERVED_QUARANTINE', { dataEventScenario: 'UNKNOWN_PROCEEDS_MINUS_30_PERCENT' }).r.taken[0].settlement.factor, 0.7);
  assert.equal(v1('C08_LATE_OBSERVED_QUARANTINE', { dataEventScenario: 'ZERO_PROCEEDS' }).r.taken[0].settlement.factor, 0);
  assert.throws(() => v1('C08_LATE_OBSERVED_QUARANTINE', { dataEventScenario: 'MADE_UP' }), /UNKNOWN_DATA_EVENT_SCENARIO/);
});

test('A5 kein Lookahead: eine erst spaeter beobachtete Quarantaene aendert nichts vor observedAt', () => {
  const c = CASES.find((x) => x.id === 'C17_NO_LOOKAHEAD_QUARANTINE');
  const { calendar, trades, cfg } = buildCase(c);
  const withQ = runPortfolioTR(trades, calendar, cfg, { accounting: 'RESEARCH_V1' });
  const noQ = runPortfolioTR(buildCase(c).trades.map((t) => ({ ...t, terminal: null })), calendar, cfg, { accounting: 'RESEARCH_V1' });
  assert.deepEqual(withQ.equity.map((e) => e.equity), noQ.equity.map((e) => e.equity));
  // Die Stale-Grenze rechnet frueher ab (als SECURITY_UNAVAILABLE), nie spaeter.
  assert.equal(withQ.taken[0].settlement.kind, 'SECURITY_UNAVAILABLE');
  assert.ok(withQ.taken[0].settlement.date < C[30]);
});

test('A5 Datenluecke ist kein wirtschaftliches Delisting; echtes Delisting bleibt beim Protokoll (-30 %)', () => {
  const gap = v1('C06_GAP_SEGMENT_END').r, delist = v1('C07_ECONOMIC_DELISTING');
  assert.equal(gap.taken[0].settlement.kind, 'SECURITY_UNAVAILABLE');
  assert.equal(gap.taken[0].settlement.factor, 1);
  assert.equal(gap.taken[0].settlement.date, C[18]);
  assert.equal(summarizeRun(delist.r, delist.cfg).finalEquity, GOLDEN.C07_ECONOMIC_DELISTING.finalEquity);
  assert.equal(delist.r.book.terminalCount, 1);
  assert.equal(segmentEndCause(0, 2, true), 'DATA_GAP');
  assert.equal(segmentEndCause(0, 2, false), 'DATA_GAP');
  assert.equal(segmentEndCause(1, 2, false), 'LISTING_INACTIVE');
  assert.equal(segmentEndCause(0, 1, true), 'ACTIVE');
});

test('A5 synthetischer Terminal-Bar: Reihenende vor Fensterende wird nicht am letzten Balken verkauft (dessen Ende war unbekannt)', () => {
  const { r } = v1('C05_PREMATURE_SERIES_END');
  assert.equal(r.ledger.filter((x) => x.side === 'SELL').length, 0);
  assert.equal(r.taken[0].settlement.kind, 'SECURITY_UNAVAILABLE');
  assert.equal(r.taken[0].settlement.date, C[18]);
});

test('A5 nicht ausfuehrbarer synthetischer Bar: kein Fill ohne realen Quellbalken', () => {
  const { r, trades } = v1('C15_EXIT_WITHOUT_SOURCE_BAR');
  assert.deepEqual(r.rejections.map((x) => x.reason), ['EXIT_WITHOUT_SOURCE_BAR']);
  const marks = trades[0].marks;
  for (const row of r.ledger.filter((x) => x.side === 'BUY' || x.side === 'SELL')) assert.ok(marks.has(row.date), `Fill am ${row.date} ohne Quellbalken`);
  // Legacy fuellte den Ausstieg an einem Tag ohne Balken.
  assert.ok(GOLDEN.C15_EXIT_WITHOUT_SOURCE_BAR.taken[0].closed);
});

test('Ausfuehrung: jeder Fill in jedem Fall liegt auf einem realen Quellbalken der Position', () => {
  for (const c of CASES) {
    const { calendar, trades, cfg } = buildCase(c);
    const r = runPortfolioTR(trades, calendar, cfg, { accounting: 'RESEARCH_V1' });
    const byId = new Map(trades.map((t) => [t.id, t]));
    for (const row of r.ledger.filter((x) => x.side === 'BUY' || x.side === 'SELL')) assert.ok(byId.get(row.id).marks.has(row.date), `${c.id} ${row.side} ${row.date}`);
  }
});

test('Schlussbewertung: offene Position am Fensterende wird bewertet, nicht als Order verkauft', () => {
  const { r, cfg } = v1('C18_FINAL_VALUATION');
  assert.equal(r.openAtEnd.length, 1);
  assert.equal(r.ledger.filter((x) => x.side === 'SELL').length, 0);
  assert.equal(r.endingPositionCheck.status, 'PASS');
  const rc = reconcile(r, cfg);
  assert.ok(Math.abs(rc.end - rc.expected) < 1e-6);
});

test('A8 Vollverkauf, Teilverkauf, Bruchteilsaktien: exakte Stueckzahl, kein Rest', () => {
  for (const id of ['C10_FULL_SALE', 'C11_PARTIAL_THIRDS', 'C12_FRACTIONAL_SHARES']) {
    const { r } = v1(id);
    assert.equal(r.taken[0].shares, 0, id);
    const sold = r.ledger.filter((x) => x.side === 'SELL').reduce((a, x) => a + x.shares, 0);
    assert.equal(sold, r.taken[0].entryShares, id);
  }
  assert.ok(!Number.isInteger(v1('C12_FRACTIONAL_SHARES').r.taken[0].entryShares));
  assert.equal(v1('C10_FULL_SALE').r.book.dividends, 250);
});

test('A8 Rundungsreste: Legacy loescht einen Rest still, RESEARCH_V1 verkauft exakt den Bestand', () => {
  const { r } = v1('C13_ROUNDING_RESIDUAL');
  const sold = r.ledger.filter((x) => x.side === 'SELL').reduce((a, x) => a + x.shares, 0);
  assert.equal(sold, r.taken[0].entryShares);
  assert.ok(GOLDEN.C13_ROUNDING_RESIDUAL.finalEquity < summarizeRun(r, buildCase(CASES.find((c) => c.id === 'C13_ROUNDING_RESIDUAL')).cfg).finalEquity);
});

test('A8 Ueberverkauf: keine kuenstlich erzeugte Liquiditaet, keine negative Stueckzahl', () => {
  const { r, cfg } = v1('C14_OVERSHOOT_FRACTION');
  const sold = r.ledger.filter((x) => x.side === 'SELL').reduce((a, x) => a + x.shares, 0);
  assert.equal(sold, r.taken[0].entryShares);
  assert.ok(summarizeRun(r, cfg).finalEquity < GOLDEN.C14_OVERSHOOT_FRACTION.finalEquity);
});

test('A8 Dust: Rest unter 0,01 wird mit Wert im Ledger abgeschrieben; Rest mit Wert bleibt auf dem Buch', () => {
  const { r } = v1('C19_DUST_BELOW_LIMIT');
  assert.equal(r.dustWriteOffs.length, 1);
  assert.ok(r.dustWriteOffs[0].markValue < AC.POLICY.dustValueLimit && r.dustWriteOffs[0].markValue > 0);
  assert.equal(r.ledger.filter((x) => x.side === 'DUST_WRITE_OFF').length, 1);
  // V3-52W-Regression: ~8e-11 Stueck bei 1,97e11 sind ~15,8 wert und duerfen nicht verschwinden.
  const hi = v1('C20_HIGH_PRICE_RESIDUAL').r;
  assert.equal(hi.dustWriteOffs.length, 0);
  assert.equal(AC.dustDecision(8e-11, 1.97e11).action, 'KEEP');
  assert.ok(Math.abs(AC.dustDecision(8e-11, 1.97e11).value - 15.76) < 1e-9);
  for (const c of CASES) { const x = v1(c.id).r; for (const w of x.dustWriteOffs) assert.ok(w.markValue < AC.POLICY.dustValueLimit, c.id); }
});

test('A8 Dust-Summe ueber der Buchgrenze scheitert geschlossen', () => {
  const marks = new Map(C.slice(1, 30).map((d) => [d, 10]));
  const trades = Array.from({ length: 150 }, (_, k) => ({ id: 'T' + String(k).padStart(3, '0'), listingId: 'T' + String(k).padStart(3, '0'), entry: { date: C[1], price: 10 }, initialStop: 9, marks, divs: new Map(), terminal: null, exits: [{ date: C[5], price: 10, fraction: 1 - 9e-5, ruleId: 'X' }] }));
  assert.throws(() => runPortfolioTR(trades, [...C], { initialEquity: 1e5, riskPerTrade: 0.001, maxPositionPct: 0.001, maxPositions: 200, maxExposure: 1 }, { accounting: 'RESEARCH_V1' }), /DUST_BOOK_VALUE_CAP_EXCEEDED/);
});

test('Order unter dem Mindestwert wird nicht gefuellt; Bargeld knapp: keine negativen Bestaende', () => {
  assert.deepEqual(v1('C16_TINY_ORDER').r.skipped.map((s) => s.reason), ['BELOW_MIN_ORDER_VALUE']);
  const { r } = v1('C22_TWO_POSITIONS_CASH');
  assert.ok(r.skipped.some((s) => s.reason === 'NO_CASH'));
  assert.ok(r.minCash >= 0);
});

test('Vertrag: Portierung aus V4 (#705) mit denselben Ergebnissen wie die V4-Tests', () => {
  // V4-Test A5: from 01-03, observedAt 01-05 (Sonntag) -> erste Sitzung 01-06.
  assert.equal(AC.causalTerminalDate(['2020-01-02', '2020-01-03', '2020-01-06', '2020-01-07'], { from: '2020-01-03', observedAt: '2020-01-05' }), '2020-01-06');
  // V4-Test A4: nach 5 Sitzungen ohne Balken noch nichts, in der 6. die Abrechnung.
  const t = AC.createStaleTracker();
  t.observe(['x'], new Map([['x', { close: 10, volume: 5 }]]));
  for (let i = 0; i < 5; i++) assert.deepEqual(t.observe(['x'], new Map()), []);
  assert.deepEqual(t.observe(['x'], new Map()), ['x']);
  const u = AC.createStaleTracker();
  u.observe(['x'], new Map([['x', { close: 10, volume: 5 }]]));
  u.observe(['x'], new Map([['x', { close: 10, volume: 0 }]]));
  assert.equal(u.staleSessions('x'), 1);
  assert.equal(AC.POLICY.staleCarryMaxSessions, 5);
  assert.equal(AC.POLICY.dustValueLimit, 0.01);
  assert.equal(AC.POLICY.dustBookValueCap, 1);
  assert.equal(AC.POLICY.minOrderValue, 1e-6);
  assert.equal(AC.isExecutableBar({ open: 10, synthetic: true }), false);
  assert.equal(AC.isExecutableBar({ open: 0 }), false);
  assert.equal(AC.isExecutableBar(undefined), false);
  assert.equal(AC.isExecutableBar({ open: 10 }), true);
  assert.equal(AC.sellQuantity(100, 0.5, 0.5 + 5e-10), 100);
  assert.equal(AC.sellQuantity(100, 0.6 + 1e-12, 0.6), 100);
  assert.equal(AC.sellQuantity(100, 0.25, 0.5), 50);
});

test('Unbekannter Abrechnungsmodus scheitert geschlossen', () => {
  assert.throws(() => run('C01_BAR_PRESENT', { accounting: 'RESEARCH_V2' }), /UNKNOWN_ACCOUNTING_MODE/);
  assert.throws(() => reconcileResearch(run('C01_BAR_PRESENT').r, buildCase(CASES[0]).cfg), /RESEARCH_V1_RUN_REQUIRED/);
});

test('Nachweis-Artefakte sind deterministisch und entsprechen dem eingecheckten Stand', async () => {
  const { buildEvidence } = await import('../foundation/build-accounting-evidence.mjs');
  const e = buildEvidence();
  const dir = path.join(here, '../foundation/artifacts');
  assert.deepEqual(JSON.parse(JSON.stringify(e.accounting)), JSON.parse(fs.readFileSync(path.join(dir, 'SUPERTRADER-ACCOUNTING-REGRESSION.json'), 'utf8')));
  assert.deepEqual(JSON.parse(JSON.stringify(e.execution)), JSON.parse(fs.readFileSync(path.join(dir, 'SUPERTRADER-EXECUTION-REGRESSION.json'), 'utf8')));
  const rc = JSON.parse(fs.readFileSync(path.join(dir, 'SUPERTRADER-A4-A5-A8-ROOT-CAUSES.json'), 'utf8'));
  assert.deepEqual(rc.findings.map((f) => f.id), ['A4', 'A5', 'A8']);
  assert.equal(e.accounting.summary.researchV1AllReconciled, true);
  assert.deepEqual(e.execution.summary.researchV1FillsWithoutSourceBar, []);
});
