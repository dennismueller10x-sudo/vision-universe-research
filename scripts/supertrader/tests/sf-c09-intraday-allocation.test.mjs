// Supertrader C09 (Kullamägi Episodic Pivot, Chart-Modell) – Entscheidungs-PR Fachmodell: Zuteilung nach Füllminute.
//
// Regressionstests der behobenen Befunde F-MC3M-01 und F-MC3M-02 (docs/SUPERTRADER_13_METHODS_EVIDENCE.md, Abschnitt 5;
// Nachweis in sf-mc3-causality-minutes.test.mjs, Tests MC3-FINDING-C09-ALLOC / MC3-FINDING-C09-DAYBAR). Eigenständig:
// die Fixtures sind hier wiederholt, keine Abhängigkeit von jener Datei.
//  - F-MC3M-01 (research/lifecycle-engine.mjs#intradayEntries): reichen Plätze (maxOpenPositions) oder Kasse am Tag T
//    nicht für alle gefüllten INTRADAY_RESOLVED-Orders, wird in der Reihenfolge der Füllminute zugeteilt (Gleichstand:
//    fillRank); ein sicherer Stopp am selben Tag gibt Platz und Kasse erst für Füllungen in einer späteren Minute frei.
//    Reicht die Kapazität, bleibt die Buchung in fillRank-Reihenfolge (bytegleich zur Engine vor diesem PR).
//  - F-MC3M-02 (research/lifecycle-engine.mjs#fillOrder): für INTRADAY_RESOLVED ist nur die offizielle Eröffnung
//    Pflichtquelle (die Minuten prüft der Adapter); Hoch/Tief des Gap-Tags sind Evidenz, keine Vorbedingung.
//  - Andere Auftragstypen (BUY_STOP, ON_OPEN) unverändert; die Golden Cases der anderen Methoden laufen unverändert.
// Synthetische Fixtures (keine Anbieterdaten, keine Secrets). VORHER_* sind die SHA-256 der Läufe mit der Engine vor
// diesem PR (origin/main 34d57f100d, lifecycle-engine.mjs 3e2cbdc8…): bei ausreichender Kapazität bytegleich.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { KK_EP_ADAPTER, EP_REFERENCE_CONFIG, epChartCandidate, resolveEpDay } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { runResearchLifecycle, fillOrder, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { fillRank } from '../source-faithful/research/minervini-execution.mjs';

const VORHER = Object.freeze({
  einzeln: 'a15ed41d43eebb8cd66acbe9c6ba171b0a61c2c4dff2424cb6557603fba7ae2f',
  zweiOhneEngpass: 'ae4891123d46f4f7dcee61aa1ec9e169a079ff0b427fe7967f57be70f11f7a5b',
  dreiOhneEngpass: '359dbb9fd0aabd5f50a129520d3a95cfd74426579e57c0e50c96ef676dddb4ab',
});

const norm = (x) => JSON.stringify(x ?? null, (k, v) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
const sha = (x) => crypto.createHash('sha256').update(norm(x)).digest('hex');
const runOut = ({ trades, ledger, curve, counts, rejections, openAtEnd, reconciliation }) => ({ trades, ledger, curve, counts, rejections, openAtEnd, reconciliation });

// ------------------------------------------------------------------------------------------------ Fixtures (wie MC3)

function sessions(n, start) {
  const out = [], d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const quiet = (k, base = 50) => base + ((k % 5) - 2) * 0.1;
const bar = (date, open, close, extra = {}) => ({ date, open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close, volume: 1e6, rawClose: close, splitAdj: 1, ...extra });
const m = (k, open, high, low, close, volume = 1000) => ({ k, open, high, low, close, volume });

// Gap-Tag T = 80 (Eröffnung 57,50 über Vortagsschluss 50,20), Kauf-Stopp 57,81, Stopp = Tief vor der Füllung 57,00
const EP_T = 80, EP_FILL_K = 6, EP_BASELINE = 20000;
function epBars(start = '2023-01-03', n = 100) {
  const d = sessions(n, start), out = [];
  for (let k = 0; k < EP_T; k++) out.push(bar(d[k], k ? quiet(k - 1) : quiet(0), quiet(k)));
  out.push({ date: d[EP_T], open: 57.5, high: 60, low: 56.5, close: 59, volume: 5e6, rawClose: 59, splitAdj: 1 });
  for (let k = EP_T + 1; k < n; k++) out.push(bar(d[k], 59 + 0.05 * (k - EP_T - 1), 59 + 0.05 * (k - EP_T)));
  return out;
}
function epMinutes() {
  const out = [m(0, 57.5, 57.8, 57.3, 57.6, 3000), m(1, 57.6, 57.7, 57.2, 57.4, 3000), m(2, 57.4, 57.5, 57.0, 57.1, 3000), m(3, 57.1, 57.4, 57.05, 57.3, 3000), m(4, 57.3, 57.6, 57.25, 57.55, 3000), m(5, 57.55, 57.75, 57.45, 57.7, 3000), m(6, 57.7, 58.1, 57.65, 58.0, 3000)];
  for (let k = 7; k < 390; k++) { const p = 58 + 0.005 * (k - 6); out.push(m(k, p - 0.002, p + 0.03, p - 0.03, p)); }
  return out;
}
/** Füllung erst in Minute `fillK` (bis dahin unter dem Kauf-Stopp). */
function epMinutesLate(fillK) {
  const out = epMinutes().slice(0, 6);
  for (let k = 6; k < fillK; k++) out.push(m(k, 57.6, 57.75, 57.5, 57.6));
  out.push(m(fillK, 57.7, 58.1, 57.65, 58.0));
  for (let k = fillK + 1; k < 390; k++) { const p = 58 + 0.005 * (k - fillK); out.push(m(k, p - 0.002, p + 0.03, p - 0.03, p)); }
  return out;
}
/** Füllung in Minute 6, sicherer Stopp am selben Tag in Minute `stopK` (Tief 56,90 unter dem Stopp 57,00). */
const epMinutesStopAt = (stopK) => epMinutes().map((x) => (x.k === stopK ? { ...x, open: 57.2, low: 56.9, close: 57.1 } : x));
const epIntraday = (byKey, baseline = EP_BASELINE) => ({ minutes: (t, d) => byKey[`${t}|${d}`], iexBaseline: () => baseline });
const T = epBars()[EP_T].date, tk = (id) => id.split(':')[2];
/** ids in fillRank-Reihenfolge des Gap-Tags */
const ranked = (ids) => [...ids].sort((a, b) => fillRank(T, a) - fillRank(T, b));
/** Lauf über mehrere Wertpapiere mit gleichem Gap-Tag; minutesOf(id) liefert die Minuten des Gap-Tags. */
function runEp(ids, minutesOf, policy = PLATFORM_RESEARCH_PORTFOLIO_POLICY, barsOf = () => epBars()) {
  const mins = Object.fromEntries(ids.map((id) => [`${tk(id)}|${T}`, minutesOf(id)]));
  const ds = { calendar: epBars().map((x) => x.date), securities: ids.map((id) => ({ id, bars: barsOf(id), terminal: null })), kkIntraday: epIntraday(mins) };
  return runResearchLifecycle(ds, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG, policy });
}
const ONE = { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, maxOpenPositions: 1 };
const entries = (r) => r.trades.map((t) => [t.id, t.intradayEvidence.entryMinute]);

// ------------------------------------------------------------------------------------------------ F-MC3M-01

test('C09-ALLOC-MINUTE: F-MC3M-01 behoben – bei einem freien Platz bekommt ihn die früher gefüllte Order, unabhängig vom fillRank', () => {
  const [first, second] = ranked(['US:EQ:EPA', 'US:EQ:EPB']);
  // Befundfall: die Order mit dem kleineren Rang füllt erst in Minute 300, die andere in Minute 6
  const r = runEp([first, second], (id) => (id === first ? epMinutesLate(300) : epMinutes()), ONE);
  assert.deepEqual(entries(r), [[second, EP_FILL_K]], 'Zuteilung hängt von der späteren Füllung ab (F-MC3M-01)');
  assert.deepEqual(r.rejections.map((x) => [x.id, x.reason]), [[first, 'REJECT_MAX_OPEN_POSITIONS']]);
  assert.equal(r.counts.intradayAllocationByMinute, 1);
  // gespiegelt: füllt die Order mit dem kleineren Rang zuerst, behält sie den Platz
  const s = runEp([first, second], (id) => (id === second ? epMinutesLate(300) : epMinutes()), ONE);
  assert.deepEqual(entries(s), [[first, EP_FILL_K]]);
  assert.deepEqual(s.rejections.map((x) => [x.id, x.reason]), [[second, 'REJECT_MAX_OPEN_POSITIONS']]);
  // die zugeteilte Position ist dieselbe wie im Einzellauf (Stück, Einstieg, Stopp)
  const alone = runEp([second], () => epMinutes(), ONE);
  assert.equal(norm(r.trades.map((t) => [t.entryFill, t.initialStop, t.shares])), norm(alone.trades.map((t) => [t.entryFill, t.initialStop, t.shares])));
  // Kausalität: Minuten der später gefüllten Order nach Minute 6 vergiften ändert die Zuteilung nicht
  const late = epMinutesLate(300), poisoned = late.map((x) => (x.k > EP_FILL_K ? { ...x, high: x.k === 300 ? 1e6 : x.high, volume: 1e9 } : x));
  assert.deepEqual(entries(runEp([first, second], (id) => (id === first ? poisoned : epMinutes()), ONE)), [[second, EP_FILL_K]]);
});

test('C09-ALLOC-TIE: gleiche Füllminute – der bisherige fillRank entscheidet (stabiler Tiebreak)', () => {
  const ids = ranked(['US:EQ:EPA', 'US:EQ:EPB', 'US:EQ:EPC']);
  const r = runEp(ids, () => epMinutes(), ONE);
  assert.deepEqual(entries(r), [[ids[0], EP_FILL_K]]);
  assert.deepEqual(r.rejections.map((x) => [x.id, x.reason]), [[ids[1], 'REJECT_MAX_OPEN_POSITIONS'], [ids[2], 'REJECT_MAX_OPEN_POSITIONS']]);
  // zwei Plätze, Minuten 40 / 6 / 6: die beiden Minute-6-Orders in fillRank-Reihenfolge, die Minute-40-Order abgewiesen
  const two = runEp(ids, (id) => (id === ids[0] ? epMinutesLate(40) : epMinutes()), { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, maxOpenPositions: 2 });
  assert.deepEqual(entries(two), [[ids[1], EP_FILL_K], [ids[2], EP_FILL_K]]);
  assert.deepEqual(two.rejections.map((x) => [x.id, x.reason]), [[ids[0], 'REJECT_MAX_OPEN_POSITIONS']]);
});

test('C09-ALLOC-CASH: knappe Kasse – die später gefüllte Order wird gekappt bzw. abgewiesen, nicht die frühere', () => {
  // Gewichtsgrenze 25 % je Position: vier gleichzeitige Füllungen brauchen mit Kosten mehr als die Kasse; die drei
  // Minute-6-Füllungen (75 %) passen, die Minute-300-Order bekommt den Rest
  const ids = ranked(['US:EQ:EPA', 'US:EQ:EPB', 'US:EQ:EPC', 'US:EQ:EPD']), lateId = ids[0];
  const r = runEp(ids, (id) => (id === lateId ? epMinutesLate(300) : epMinutes()));
  const full = runEp([ids[1]], () => epMinutes()).trades[0].shares;
  for (const t of r.trades.filter((x) => x.id !== lateId)) assert.equal(t.shares, full, `${t.id}: frühere Füllung gekappt`);
  const late = r.trades.find((x) => x.id === lateId);
  assert.ok(!late || late.shares < full, 'die Minute-300-Order hat volle Stückzahl erhalten');
  assert.ok(!late || r.counts.cappedByCash === 1);
  assert.equal(r.reconciliation.pass, true);
  assert.equal(r.counts.intradayAllocationByMinute, 1, 'Kasse reicht: kein Engpass');
});

test('C09-ALLOC-SAMEDAY-STOP: ein Stopp am selben Tag gibt den Platz erst für Füllungen nach der Stoppminute frei', () => {
  const [a, b] = ranked(['US:EQ:EPA', 'US:EQ:EPB']);
  // a füllt in Minute 6; b in Minute 300. Stopp von a in Minute 350: um 300 ist der Platz noch belegt
  const after = runEp([a, b], (id) => (id === a ? epMinutesStopAt(350) : epMinutesLate(300)), ONE);
  assert.deepEqual(entries(after), [[a, EP_FILL_K]]);
  assert.equal(after.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN');
  assert.deepEqual(after.rejections.map((x) => [x.id, x.reason]), [[b, 'REJECT_MAX_OPEN_POSITIONS']]);
  // Stopp von a in Minute 100: der Platz ist um 300 frei, b wird ausgeführt (Kasse aus dem Verkauf verfügbar)
  const before = runEp([a, b], (id) => (id === a ? epMinutesStopAt(100) : epMinutesLate(300)), ONE);
  assert.deepEqual(entries(before), [[a, EP_FILL_K], [b, 300]]);
  assert.equal(before.trades[0].exitReason, 'STOP_SAME_BAR_CERTAIN');
  assert.deepEqual(before.rejections, []);
  // Ledger in Zeitfolge: Kauf a, Verkauf a (Minute 100), Kauf b (Minute 300)
  assert.deepEqual(before.ledger.filter((x) => x.date === T).map((x) => [x.id, x.side]), [[a, 'BUY'], [a, 'SELL'], [b, 'BUY']]);
  assert.equal(before.reconciliation.pass, true);
});

test('C09-ALLOC-NO-SCARCITY: ohne knappe Kapazität (Referenz: 20 Positionen) bytegleich zur Engine vor diesem PR', () => {
  const [first, second] = ranked(['US:EQ:EPA', 'US:EQ:EPB']);
  const one = runEp(['US:EQ:EPX'], () => epMinutes());
  assert.equal(one.trades.length, 1);
  assert.equal(sha(runOut(one)), VORHER.einzeln);
  // zwei Orders, Minuten 300 / 6: beide ausgeführt, Buchung weiter in fillRank-Reihenfolge (Trade-Ids, Ledger, Rundung)
  const two = runEp([first, second], (id) => (id === first ? epMinutesLate(300) : epMinutes()));
  assert.deepEqual(entries(two), [[first, 300], [second, EP_FILL_K]]);
  assert.equal(two.counts.intradayAllocationByMinute, undefined, 'Zähler nur an Engpasstagen (sonst gleiche Schlüssel wie vorher)');
  assert.equal(sha(runOut(two)), VORHER.zweiOhneEngpass);
  // drei Orders mit Stopp am selben Tag und späten Füllungen (Minuten 300 / 6 mit Stopp in 350 / 40), Kasse und Plätze reichen
  const ids = ranked(['US:EQ:EPA', 'US:EQ:EPB', 'US:EQ:EPC']);
  const three = runEp(ids, (id) => [epMinutesLate(300), epMinutesStopAt(350), epMinutesLate(40)][ids.indexOf(id)]);
  assert.equal(three.trades.length, 3);
  assert.equal(three.counts.sameBarStopCertain, 1);
  assert.equal(sha(runOut(three)), VORHER.dreiOhneEngpass);
});

// ------------------------------------------------------------------------------------------------ F-MC3M-02

test('C09-DAYBAR: F-MC3M-02 behoben – fehlende Hoch/Tief des Gap-Tags verhindern die Minutenfüllung nicht mehr', () => {
  const runWith = (bars) => runEp(['US:EQ:EPX'], () => epMinutes(), PLATFORM_RESEARCH_PORTFOLIO_POLICY, () => bars);
  const withDay = (f) => epBars().map((x, k) => (k === EP_T ? f(x) : x));
  const base = runWith(epBars());
  assert.equal(base.trades.length, 1);
  const key = (r) => norm(r.trades.map((t) => [t.entryDate, t.entryFill, t.initialStop, t.shares, t.intradayEvidence.entryMinute]));
  for (const [name, f] of Object.entries({ hochTiefNaN: (x) => ({ ...x, high: NaN, low: NaN }), hochNaN: (x) => ({ ...x, high: NaN }), tiefNaN: (x) => ({ ...x, low: NaN }), hochTiefExtrem: (x) => ({ ...x, high: 1e9, low: 1e-9 }) })) {
    const r = runWith(withDay(f));
    assert.equal(key(r), key(base), `${name}: Einstieg hängt von Hoch/Tief des Gap-Tags ab`);
    assert.equal(r.counts.notExecutedNoSourceBar, 0, name);
  }
  // fillOrder direkt: INTRADAY_RESOLVED löst ohne Hoch/Tief auf, Pflichtquelle bleibt die offizielle Eröffnung;
  // die Tagesbalken-Aufträge verlangen Hoch und Tief weiter
  const b = { ...epBars()[EP_T], high: NaN, low: NaN };
  const resolve = (x) => resolveEpDay({ minutes: epMinutes(), bar: x, rawFactor: 1, adrPct: epChartCandidate(epBars(), EP_T).adr20, iexBaseline: EP_BASELINE, cfg: EP_REFERENCE_CONFIG });
  assert.equal(fillOrder(b, { type: 'INTRADAY_RESOLVED', resolve }).status, 'FILLED');
  assert.equal(fillOrder({ ...b, open: NaN }, { type: 'INTRADAY_RESOLVED', resolve }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
  assert.equal(fillOrder(b, { type: 'BUY_STOP', level: 57.81, stop: 57 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
  assert.equal(fillOrder(b, { type: 'ON_OPEN', stop: 57 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
  assert.equal(fillOrder({ ...b, high: 60 }, { type: 'BUY_STOP', level: 57.81, stop: 57 }).status, 'NOT_EXECUTED_NO_SOURCE_BAR');
});

test('C09-OTHER-ORDER-TYPES: BUY_STOP / ON_OPEN füllen unverändert (Tagesbalken-Engine)', () => {
  const b = { date: T, open: 57.5, high: 60, low: 56.5, close: 59 };
  assert.deepEqual(fillOrder(b, { type: 'BUY_STOP', level: 57.81, stop: 57 }), { status: 'FILLED', fill: 57.81, basis: 'INTRADAY_LEVEL_TOUCH', plannedLoss: 1 - 57 / 57.81, sameBarStop: 'AMBIGUOUS' });
  assert.deepEqual(fillOrder(b, { type: 'BUY_STOP', level: 57, stop: 56.6 }), { status: 'FILLED', fill: 57.5, basis: 'OPEN_GAP_AT_OR_ABOVE_LEVEL', plannedLoss: 1 - 56.6 / 57.5, sameBarStop: 'CERTAIN' });
  assert.deepEqual(fillOrder(b, { type: 'ON_OPEN', stop: 55 }), { status: 'FILLED', fill: 57.5, basis: 'OPEN', plannedLoss: 1 - 55 / 57.5, sameBarStop: null });
  assert.deepEqual(fillOrder(b, { type: 'BUY_STOP', level: 61, stop: 57 }), { status: 'NOT_TRIGGERED' });
});
