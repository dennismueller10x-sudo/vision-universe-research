// Supertrader Master Completion 3.0 / S2 – Kausalität und Determinismus von C09 (Kullamägi Episodic Pivot, Chart-Modell)
// und C10 (Parabolic Short, Chart-Modell) an der Eröffnung der Folgesitzung auf IEX-Minuten.
//
// Nur Tests, keine Engine-, Regel-, Parameter- oder Registrierungsänderung. Synthetische Tages- und Minuten-Fixtures
// (keine Anbieterdaten, keine Secrets) durchlaufen genau die Codepfade der Research-Läufe:
//  - C09: research/kk-ep-lifecycle.mjs (epChartCandidate, resolveEpDay, KK_EP_ADAPTER) über research/lifecycle-engine.mjs
//    (Auftragstyp INTRADAY_RESOLVED, fillOrder) und den Produktdetektor product/detectors.mjs;
//  - C10: research/kk-ps-study.mjs (psChartCandidate, psEntry, runPsCandidate, evaluatePsCandidates) und der
//    Produktdetektor (Platzhalter der Folgesitzung, detectors.mjs#withNextSession);
//  - gemeinsam: research/kk-intraday.mjs (toSession, openingRange, runningVwap, fiveMinuteCandles, Identitätsprüfung).
// Entscheidungszeitpunkt t: C09 die Füllminute am Gap-Tag T (erlaubt: Tagesbalken <= T - 1, die offizielle Eröffnung
// von T und die Minuten <= t); C10 der Schluss von t - 1 für den Kandidaten und die Füllminute am Handelstag für den
// Einstieg. Alles danach (spätere Minuten, Hoch/Tief/Schluss/Volumen von T, Folgetage) ist Ergebnis, nicht Entscheidung.
//  - MC3-CAUSAL-*: Zukunft vergiften (NaN, Extremwerte, Entfernen) lässt die Entscheidung unverändert; Gegenprobe:
//    dieselbe Vergiftung vor t ändert sie (oder verhindert sie); MC3-CAUSAL-MINUTES-PROBE: ein absichtlich in die
//    Zukunft greifender Entscheider wird erkannt.
//  - MC3-DETERMINISTIC-*: zwei Läufe auf tief eingefrorenen Eingaben sind gleich (SHA-256), die Eingaben unverändert.
//  - MC3-EDGE-*: fehlende Minuten, Handelsunterbrechung / Gap, Sitzungsbeginn.
//  - MC3-FINDING-*: Befunde (nicht repariert, Fachmodell): als Freigabevorschlag im Evidenzdokument geführt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { KK_EP_ADAPTER, EP_REFERENCE_CONFIG, EP_RUN_VARIANTS, epChartCandidate, resolveEpDay } from '../source-faithful/research/kk-ep-lifecycle.mjs';
import { PS_REFERENCE_CONFIG, PS_RUN_VARIANTS, psChartCandidate, psEntry, runPsCandidate, evaluatePsCandidates } from '../source-faithful/research/kk-ps-study.mjs';
import { toSession, sessionMinute } from '../source-faithful/research/kk-intraday.mjs';
import { runResearchLifecycle, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from '../source-faithful/research/lifecycle-engine.mjs';
import { fillRank } from '../source-faithful/research/minervini-execution.mjs';
import { withNextSession, DETECTORS } from '../source-faithful/product/detectors.mjs';

// Abdeckung dieser Datei (der Erzeuger des Evidenzdokuments liest diese Zeile; MC3-COVERAGE-MINUTES prüft sie gegen die Titel)
const MC3M_COVERED = Object.freeze({ C09: ['MC3-CAUSAL-C09-OPEN', 'MC3-CAUSAL-C09-MINUTES', 'MC3-CAUSAL-C09-ENGINE', 'MC3-DETERMINISTIC-C09', 'MC3-EDGE-C09'], C10: ['MC3-CAUSAL-C10-CLOSE', 'MC3-CAUSAL-C10-MINUTES', 'MC3-DETERMINISTIC-C10', 'MC3-EDGE-C10'] });
// Befunde dieser Datei (Erzeuger: Blocker der Dimension „reproduzierbare Berechnung“, Freigabevorschlag)
const MC3M_FINDINGS = Object.freeze({ 'F-MC3M-01': ['C09', 'MC3-FINDING-C09-ALLOC'], 'F-MC3M-02': ['C09', 'MC3-FINDING-C09-DAYBAR'] });

const norm = (x) => JSON.stringify(x ?? null, (k, v) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
const sha = (x) => crypto.createHash('sha256').update(norm(x)).digest('hex');
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const clone = (x) => structuredClone(x);

// ------------------------------------------------------------------------------------------------ Fixtures

function sessions(n, start) {
  const out = [], d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) { const w = d.getUTCDay(); if (w > 0 && w < 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
/** Ruhige Tagesreihe um 50 (Spanne ~2 %, ADR20 ~2,2 %), Rohpreise = bereinigte Preise (splitAdj 1). */
const quiet = (k, base = 50) => base + ((k % 5) - 2) * 0.1;
const bar = (date, open, close, extra = {}) => ({ date, open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close, volume: 1e6, rawClose: close, splitAdj: 1, ...extra });
const m = (k, open, high, low, close, volume = 1000) => ({ k, open, high, low, close, volume });

// C09: Gap-Tag T = 80 (Eröffnung 57,50 über Vortagsschluss 50,20 = +14,5 %), Füllminute 6
const EP_T = 80, EP_FILL_K = 6, EP_BASELINE = 20000;
function epBars(start = '2023-01-03', n = 100) {
  const d = sessions(n, start), out = [];
  for (let k = 0; k < EP_T; k++) out.push(bar(d[k], k ? quiet(k - 1) : quiet(0), quiet(k)));
  out.push({ date: d[EP_T], open: 57.5, high: 60, low: 56.5, close: 59, volume: 5e6, rawClose: 59, splitAdj: 1 });
  for (let k = EP_T + 1; k < n; k++) out.push(bar(d[k], 59 + 0.05 * (k - EP_T - 1), 59 + 0.05 * (k - EP_T)));
  return out;
}
/** Minuten des Gap-Tags: Eröffnungsspanne der ersten Minute 57,80 -> Kauf-Stopp 57,81; Füllung in Minute 6; Tief davor 57,00. */
function epMinutes() {
  const out = [m(0, 57.5, 57.8, 57.3, 57.6, 3000), m(1, 57.6, 57.7, 57.2, 57.4, 3000), m(2, 57.4, 57.5, 57.0, 57.1, 3000), m(3, 57.1, 57.4, 57.05, 57.3, 3000), m(4, 57.3, 57.6, 57.25, 57.55, 3000), m(5, 57.55, 57.75, 57.45, 57.7, 3000), m(6, 57.7, 58.1, 57.65, 58.0, 3000)];
  for (let k = 7; k < 390; k++) { const p = 58 + 0.005 * (k - 6); out.push(m(k, p - 0.002, p + 0.03, p - 0.03, p)); }
  return out;
}
/** Minuten mit Füllung erst in Minute `fillK` (bis dahin unter dem Kauf-Stopp). */
function epMinutesLate(fillK) {
  const out = epMinutes().slice(0, 6);
  for (let k = 6; k < fillK; k++) out.push(m(k, 57.6, 57.75, 57.5, 57.6));
  out.push(m(fillK, 57.7, 58.1, 57.65, 58.0));
  for (let k = fillK + 1; k < 390; k++) { const p = 58 + 0.005 * (k - fillK); out.push(m(k, p - 0.002, p + 0.03, p - 0.03, p)); }
  return out;
}
const epSecurity = (id = 'US:EQ:EPX', start) => ({ id, ticker: id.split(':')[2], terminal: null, bars: epBars(start) });
const epIntraday = (byKey, baseline = EP_BASELINE) => ({ minutes: (t, d) => byKey[`${t}|${d}`], iexBaseline: () => baseline });

/** Entscheidung von C09 (ohne Ergebnis: Stopp am selben Tag, Ausstiegskurs, Tagesspannen-Evidenz). */
const epDecision = (r) => ({ status: r.status, fill: r.fill ?? null, stop: r.stop ?? null, entryMinute: r.evidence?.entryMinute ?? null, stopDistancePct: r.evidence?.stopDistancePct ?? null, limitPct: r.evidence?.limitPct ?? null, relVol: r.evidence?.relativeIexVolumeAtEntry ?? null, openIdentityGap: r.evidence?.openIdentityGap ?? null });
/** Adapterpfad des Research-Laufs: prepare -> signalAt am Vortag -> eligibility -> order.resolve am Gap-Tag. */
function epAdapterPath(sec, dataset, cfg = EP_REFERENCE_CONFIG) {
  const ctx = KK_EP_ADAPTER.prepare(sec, cfg, dataset);
  const setup = ctx ? KK_EP_ADAPTER.signalAt(ctx, EP_T - 1, cfg) : null;
  if (!setup) return { setup: null };
  const el = KK_EP_ADAPTER.eligibility({ ctx, setup, bars: sec.bars, i: EP_T - 1, cfg });
  return { setup: { i: setup.i, armIndex: setup.armIndex, gap: setup.gap, adr20: setup.adr20, priorRun63: setup.priorRun63, priorRange63: setup.priorRange63 }, state: el.state, decision: epDecision(el.order.resolve(sec.bars[EP_T])) };
}

// C10: Aufwärtsserie +2 / +3 / +4 % an den Balken 41–43, Handelstag t = 44; Leerverkauf unter ORL_5 in Minute 7
const PS_T = 44;
function psBars(start = '2023-01-03', n = 60) {
  const d = sessions(n, start), out = [];
  for (let k = 0; k < 40; k++) out.push(bar(d[k], k ? quiet(k - 1) : quiet(0), quiet(k)));
  out.push(bar(d[40], quiet(39), 50.3)); // +0,2 %: vierter Aufwärtstag (ALT-STREAK4)
  let c = out[40].close;
  for (const [k, r] of [[41, 0.02], [42, 0.03], [43, 0.04]]) { const o = c; c = o * (1 + r); out.push({ date: d[k], open: o, high: c * 1.01, low: o * 0.99, close: c, volume: 1e6, rawClose: c, splitAdj: 1 }); }
  out.push({ date: d[PS_T], open: 55.0, high: 55.5, low: 52.0, close: 52.5, volume: 3e6, rawClose: 52.5, splitAdj: 1 });
  for (let k = PS_T + 1; k < n; k++) { const o = 52.5 - 0.3 * (k - PS_T - 1), cl = 52.5 - 0.3 * (k - PS_T); out.push({ date: d[k], open: o, high: o * 1.005, low: cl * 0.995, close: cl, volume: 1e6, rawClose: cl, splitAdj: 1 }); }
  return out;
}
function psMinutes() {
  const out = [m(0, 55.0, 55.4, 54.9, 55.2, 2000), m(1, 55.2, 55.5, 55.1, 55.3, 2000), m(2, 55.3, 55.45, 55.0, 55.1, 2000), m(3, 55.1, 55.2, 54.8, 54.9, 2000), m(4, 54.9, 55.0, 54.7, 54.75, 2000), m(5, 54.75, 54.8, 54.72, 54.74, 2000), m(6, 54.74, 54.76, 54.71, 54.72, 2000), m(7, 54.72, 54.73, 54.5, 54.55, 2000)];
  for (let k = 8; k < 390; k++) {
    if (k === 10) { out.push(m(10, 54.49, 55.0, 54.45, 54.48)); continue; } // Rücklauf an die IEX-VWAP, Schluss darunter
    const p = 54.5 - 0.004 * (k - 7); out.push(m(k, p + 0.002, p + 0.05, p - 0.05, p));
  }
  return out;
}
const PS_FILLED = new Set(['CLOSED', 'OPEN_AT_DATA_END']);
/** Entscheidung von C10 (Einstieg und Stopp; Deckungen und Rendite sind Ergebnis). */
const psDecision = (r) => ({ status: PS_FILLED.has(r.status) ? 'FILLED' : r.status, entryDate: r.trade?.entryDate ?? null, entryMinute: r.trade?.entryMinute ?? null, entryAdj: r.trade?.entryAdj ?? null, stopAdj: r.trade?.stopAdj ?? null });
const psCand = (bars, cfg = PS_REFERENCE_CONFIG) => psChartCandidate(bars, PS_T, cfg);

// Vergiftungen
const NAN_BAR = (b) => ({ date: b.date, open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN, rawClose: NaN, splitAdj: NaN });
const EXT_BAR = (b, k) => ({ date: b.date, open: k % 2 ? 1e9 : 1e-9, high: 1e9, low: 1e-9, close: k % 2 ? 1e-9 : 1e9, volume: 1e15, rawClose: 1e9, splitAdj: k % 2 ? 1e6 : 1e-6 });
const NAN_MIN = (x) => ({ k: x.k, open: NaN, high: NaN, low: NaN, close: NaN, volume: NaN });
const EXT_MIN = (x) => ({ k: x.k, open: x.k % 2 ? 1e9 : 1e-9, high: 1e9, low: 1e-9, close: x.k % 2 ? 1e-9 : 1e9, volume: 1e12 });
const CRASH_MIN = (x) => ({ k: x.k, open: 1, high: 1, low: 0.5, close: 1, volume: 0 });
const barsAfter = (bars, t, f) => bars.map((b, k) => (k > t ? f(b, k) : b));
/** Minuten nach dem Index j (nicht nach der Minute k): fünf Vergiftungsarten, darunter Entfernen und Absturz. */
const minuteFutures = (mins, j) => ({
  nan: mins.map((x, q) => (q > j ? NAN_MIN(x) : x)),
  extreme: mins.map((x, q) => (q > j ? EXT_MIN(x) : x)),
  crash: mins.map((x, q) => (q > j ? CRASH_MIN(x) : x)),
  dropped: mins.slice(0, j + 1),
  spike: mins.map((x, q) => (q > j ? { ...x, high: 1e6, volume: 1e9 } : x)),
});
/** Hoch, Tief, Schluss und Volumen des Entscheidungstags sind erst am Schluss bekannt. */
const DAY_FIELDS_LATE = Object.freeze({
  nan: (b) => ({ ...b, high: NaN, low: NaN, close: NaN, volume: NaN, rawClose: NaN }),
  extreme: (b) => ({ ...b, high: 1e9, low: 1e-9, close: 1e-9, volume: 1e15, rawClose: 1e-9 }),
});
const diffsOf = (base, variants, decide) => Object.entries(variants).filter(([, v]) => norm(decide(v)) !== norm(base)).map(([k]) => k);

// ------------------------------------------------------------------------------------------------ C09 Episodic Pivot

test('MC3-CAUSAL-C09-OPEN: Kandidat und Order am Vortag hängen nur von Balken <= T - 1 und der Eröffnung von T ab', () => {
  const sec = epSecurity(), mins = { [`EPX|${sec.bars[EP_T].date}`]: epMinutes() }, ds = { kkIntraday: epIntraday(mins) };
  const base = epAdapterPath(sec, ds);
  assert.ok(base.setup && base.setup.i === EP_T && base.setup.armIndex === EP_T - 1, 'die Prüfung wäre leer: kein Kandidat am Gap-Tag');
  assert.equal(base.decision.status, 'FILLED');
  // nur die Eröffnung von T ist bekannt: Platzhalter ohne Hoch/Tief/Schluss/Volumen, keine Folgetage
  const known = { ...sec, bars: [...sec.bars.slice(0, EP_T), { date: sec.bars[EP_T].date, open: sec.bars[EP_T].open, high: NaN, low: NaN, close: NaN, volume: NaN, splitAdj: sec.bars[EP_T].splitAdj }] };
  assert.equal(norm(epAdapterPath(known, ds)), norm(base), 'Sicht an der Eröffnung von T ungleich der Sicht aus der ganzen Reihe');
  const future = {
    folgetageNaN: { ...sec, bars: barsAfter(sec.bars, EP_T, NAN_BAR) },
    folgetageExtrem: { ...sec, bars: barsAfter(sec.bars, EP_T, EXT_BAR) },
    folgetageEntfernt: { ...sec, bars: sec.bars.slice(0, EP_T + 1) },
    tagesfelderNaN: { ...sec, bars: sec.bars.map((b, k) => (k === EP_T ? DAY_FIELDS_LATE.nan(b) : b)) },
    tagesfelderExtrem: { ...sec, bars: sec.bars.map((b, k) => (k === EP_T ? DAY_FIELDS_LATE.extreme(b) : b)) },
  };
  assert.deepEqual(diffsOf(base, future, (s) => epAdapterPath(s, ds)), [], 'Blick in die Zukunft');
  for (const v of Object.values(future)) assert.equal(norm(epChartCandidate(v.bars, EP_T)), norm(epChartCandidate(sec.bars, EP_T)));
  // Gegenprobe zur Gegenprobe: dieselbe Art Vergiftung VOR T ändert die Entscheidung
  const past = {
    vortagsschlussNaN: (b, k) => (k === EP_T - 1 ? { ...b, close: NaN } : b),
    vortagsschlussHoch: (b, k) => (k === EP_T - 1 ? { ...b, close: 56 } : b),
    eroeffnungNaN: (b, k) => (k === EP_T ? { ...b, open: NaN } : b),
    spanneT5: (b, k) => (k === EP_T - 5 ? { ...b, high: 80 } : b),
  };
  for (const [name, f] of Object.entries(past)) assert.notEqual(norm(epAdapterPath({ ...sec, bars: sec.bars.map(f) }, ds)), norm(base), `Vergiftung vor t ohne Wirkung: ${name}`);
});

test('MC3-CAUSAL-C09-MINUTES: Einstieg, Stopp und KK-034 hängen nur von den Minuten <= Füllminute ab', () => {
  const b = epBars()[EP_T], adrPct = epChartCandidate(epBars(), EP_T).adr20;
  let checked = 0;
  for (const v of EP_RUN_VARIANTS) {
    const run = (mins) => epDecision(resolveEpDay({ minutes: mins, bar: b, rawFactor: 1, adrPct, iexBaseline: EP_BASELINE, cfg: v.config }));
    const base = run(epMinutes());
    if (base.status !== 'FILLED') continue;
    checked++;
    const j = epMinutes().findIndex((x) => x.k === base.entryMinute);
    assert.ok(j >= 0);
    assert.deepEqual(diffsOf(base, minuteFutures(epMinutes(), j), run), [], `${v.id}: Blick in spätere Minuten`);
    // Hoch/Tief/Schluss des Tagesbalkens: nur die Tagesspannen-Evidenz (dayRangeAgreement) liest sie, nie die Entscheidung
    for (const f of Object.values(DAY_FIELDS_LATE)) assert.equal(norm(epDecision(resolveEpDay({ minutes: epMinutes(), bar: f(b), rawFactor: 1, adrPct, iexBaseline: EP_BASELINE, cfg: v.config }))), norm(base), `${v.id}: Tagesfelder`);
    // Gegenprobe zur Gegenprobe: Vergiftung vor der Füllminute
    const before = (q, f) => epMinutes().map((x, p) => (p === q ? f(x) : x));
    assert.notEqual(norm(run(before(2, (x) => ({ ...x, low: 55.0 })))), norm(base), `${v.id}: Tief vor der Füllung ohne Wirkung`);
    assert.notEqual(norm(run(before(0, NAN_MIN))), norm(base), `${v.id}: Eröffnungsminute ohne Wirkung`);
  }
  assert.ok(checked >= 7, `zu wenige Varianten mit Füllung (${checked})`);
  // Volumentempo (PACE_20): ein höheres Volumen nach der Füllminute ändert nichts, eines davor schon
  const run = (mins, base = EP_BASELINE) => epDecision(resolveEpDay({ minutes: mins, bar: b, rawFactor: 1, adrPct, iexBaseline: base, cfg: EP_REFERENCE_CONFIG }));
  assert.equal(run(epMinutes(), 1e9).status, 'NOT_TRIGGERED', 'Gegenprobe: unerreichbares Volumentempo verhindert den Einstieg');
});

test('MC3-CAUSAL-C09-ENGINE: im Lebenszyklus (INTRADAY_RESOLVED) bleibt der Einstieg bei vergifteter Zukunft gleich', () => {
  const sec = epSecurity(), key = `EPX|${sec.bars[EP_T].date}`;
  const runWith = (bars, mins) => runResearchLifecycle({ calendar: bars.map((x) => x.date), securities: [{ id: sec.id, bars, terminal: null }], kkIntraday: epIntraday({ [key]: mins }) }, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  const entry = (r) => r.trades.map((t) => ({ id: t.id, setupDate: t.setupDate, signalDate: t.signalDate, entryDate: t.entryDate, entryFill: t.entryFill, initialStop: t.initialStop, shares: t.shares, entryMinute: t.intradayEvidence?.entryMinute ?? null }));
  const base = runWith(sec.bars, epMinutes());
  assert.equal(base.trades.length, 1, 'kein Einstieg: Prüfung leer');
  assert.equal(base.trades[0].entryDate, sec.bars[EP_T].date);
  assert.equal(base.trades[0].signalDate, sec.bars[EP_T - 1].date, 'Order am Vortag scharf (technisches Vehikel, reserviert nichts)');
  const j = epMinutes().findIndex((x) => x.k === EP_FILL_K), fm = minuteFutures(epMinutes(), j);
  const cases = {
    minutenNaN: [sec.bars, fm.nan], minutenAbsturz: [sec.bars, fm.crash], minutenEntfernt: [sec.bars, fm.dropped],
    folgetageNaN: [barsAfter(sec.bars, EP_T, NAN_BAR), epMinutes()], folgetageExtrem: [barsAfter(sec.bars, EP_T, EXT_BAR), epMinutes()],
    tagesfelderExtrem: [sec.bars.map((x, k) => (k === EP_T ? DAY_FIELDS_LATE.extreme(x) : x)), epMinutes()],
  };
  for (const [name, [bars, mins]] of Object.entries(cases)) assert.equal(norm(entry(runWith(bars, mins))), norm(entry(base)), `Blick in die Zukunft: ${name}`);
  // ein Absturz NACH der Füllminute ist Ergebnis: Stopp am selben Tag (KK-027), der Einstieg bleibt
  const crash = runWith(sec.bars, fm.crash);
  assert.equal(crash.trades[0].exitReason ?? crash.trades[0].events?.at(-1)?.reason ?? null, 'STOP_SAME_BAR_CERTAIN');
  // Gegenprobe zur Gegenprobe: ein tieferes Tief VOR der Füllminute ändert den Stopp bzw. verhindert den Einstieg
  const lowBefore = epMinutes().map((x) => (x.k === 3 ? { ...x, low: 56.9 } : x));
  assert.notEqual(norm(entry(runWith(sec.bars, lowBefore))), norm(entry(base)));
  const wide = epMinutes().map((x) => (x.k === 3 ? { ...x, low: 55.0 } : x));
  const r = runWith(sec.bars, wide);
  assert.equal(r.trades.length, 0);
  assert.deepEqual(r.rejections.map((x) => x.reason), ['NOT_EXECUTED_KK034_WIDE_STOP']);
});

test('MC3-DETERMINISTIC-C09: zwei Läufe auf tief eingefrorenen Eingaben sind gleich; Eingaben unverändert', () => {
  const sec = epSecurity(), key = `EPX|${sec.bars[EP_T].date}`, mins = epMinutes();
  const dataset = { calendar: sec.bars.map((x) => x.date), securities: [{ id: sec.id, bars: sec.bars, terminal: null }] };
  deepFreeze(sec); deepFreeze(mins); deepFreeze(dataset);
  const before = sha({ sec, mins, dataset, cfg: EP_REFERENCE_CONFIG });
  const ds = () => ({ ...dataset, kkIntraday: epIntraday({ [key]: mins }) });
  const once = () => ({
    adapter: epAdapterPath(sec, ds()),
    variants: EP_RUN_VARIANTS.map((v) => resolveEpDay({ minutes: mins, bar: sec.bars[EP_T], rawFactor: 1, adrPct: epChartCandidate(sec.bars, EP_T).adr20, iexBaseline: EP_BASELINE, cfg: v.config })),
    engine: (({ trades, ledger, curve, counts, rejections }) => ({ trades, ledger, curve, counts, rejections }))(runResearchLifecycle(ds(), { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG })),
  });
  const a = sha(once()), b = sha(once());
  assert.equal(a, b, 'zwei Läufe ungleich');
  assert.equal(sha({ sec, mins, dataset, cfg: EP_REFERENCE_CONFIG }), before, 'Eingaben verändert');
  // die Vorbereitung ist von der Reihenfolge der Aufrufe unabhängig (kein Zustand zwischen den Läufen)
  const c = sha(once()); epAdapterPath(epSecurity(), { kkIntraday: epIntraday({}) }); assert.equal(sha(once()), c);
});

test('MC3-EDGE-C09: fehlende Minuten, Identität am Sitzungsbeginn, Unterbrechung mit Gap, Sitzungsbeginn, vor IEX-Historie', () => {
  const b = epBars()[EP_T], adrPct = epChartCandidate(epBars(), EP_T).adr20;
  const R = (mins, cfg = EP_REFERENCE_CONFIG, extra = {}) => resolveEpDay({ minutes: mins, bar: b, rawFactor: 1, adrPct, iexBaseline: EP_BASELINE, cfg, ...extra });
  const NOVOL = { ...EP_REFERENCE_CONFIG, volumeRule: 'NONE' }, OR5 = { ...EP_REFERENCE_CONFIG, orMinutes: 5 };
  // nicht abgerufen / abgerufen, aber leer: nie simuliert, nie aus dem Tagesbalken abgeleitet
  assert.equal(R(undefined).status, 'NOT_EXECUTED_INTRADAY_NOT_FETCHED');
  assert.equal(R([]).status, 'NOT_EXECUTED_NO_INTRADAY_DATA');
  // erste IEX-Notiz erst in Minute 7 (nach dem Fenster von 5 Minuten): Identität am Sitzungsbeginn nicht prüfbar
  assert.equal(R(epMinutes().filter((x) => x.k >= 7)).status, 'NOT_EXECUTED_IDENTITY_NO_OPENING_PRINT');
  // erste Notiz in Minute 2: Identität ok, aber keine 1-Minuten-Eröffnungsspanne; ORH_5 füllt frühestens ab Minute 5
  assert.equal(R(epMinutes().filter((x) => x.k >= 2)).status, 'NOT_EXECUTED_NO_OPENING_RANGE');
  const or5 = R(epMinutes().filter((x) => x.k >= 2), { ...OR5, volumeRule: 'NONE' });
  assert.ok(or5.status === 'NOT_TRIGGERED' || or5.evidence.entryMinute >= 5, `ORH_5 vor Minute 5: ${or5.evidence.entryMinute}`);
  // Eröffnung 10 % neben der offiziellen Eröffnung (wiederverwendeter Ticker): nicht ausgeführt
  assert.equal(R(epMinutes().map((x) => (x.k === 0 ? { ...x, open: 63.3 } : x))).status, 'NOT_EXECUTED_IDENTITY_MISMATCH');
  // fehlende Minuten 1–5: kein erfundenes Tief und kein erfundenes Volumen
  const gap15 = epMinutes().filter((x) => x.k === 0 || x.k >= 6);
  const nv = R(gap15, NOVOL);
  assert.equal(nv.status, 'FILLED'); assert.equal(nv.evidence.entryMinute, 6); assert.equal(nv.stop, 57.3, 'Tief nur aus vorhandenen Minuten und der offiziellen Eröffnung');
  assert.equal(R(gap15).status, 'NOT_TRIGGERED', 'fehlende Minuten zählen kein IEX-Volumen: Volumentempo PACE_20 nicht erreicht');
  // Unterbrechung (Minuten 6–40 fehlen), Wiederaufnahme mit Gap über den Kauf-Stopp: Füllung zur Eröffnung der Minute, nie zum Level
  const halt = [...epMinutes().slice(0, 6).map((x) => ({ ...x, volume: 3500 })), m(41, 58.2, 58.4, 58.1, 58.3, 2000), ...epMinutes().filter((x) => x.k > 41)];
  const h = R(halt);
  assert.equal(h.status, 'FILLED'); assert.equal(h.evidence.entryMinute, 41); assert.equal(h.fill, 58.2); assert.equal(h.stop, 57.0);
  // Sitzungsbeginn: Minute 0 bildet die Spanne und füllt nie; Minute 1 nur mit Volumentempo aus Minute 0
  const early = epMinutes().map((x) => (x.k === 1 ? { ...x, high: 57.9 } : x));
  assert.equal(R(early).evidence.entryMinute, 1);
  assert.notEqual(R(early.map((x) => (x.k === 0 ? { ...x, volume: 500 } : x))).evidence?.entryMinute, 1, 'Minute 1 ohne Volumentempo gefüllt');
  assert.ok(R(early, OR5).status !== 'FILLED' || R(early, OR5).evidence.entryMinute >= 5);
  // Gap-Tag vor der IEX-Historie (2017-01-03): nicht ausgeführt; zu kurze Historie: kein Kandidat
  const old = epSecurity('US:EQ:OLD', '2016-08-01');
  assert.ok(old.bars[EP_T].date < '2017-01-03');
  const ctx = KK_EP_ADAPTER.prepare(old, EP_REFERENCE_CONFIG, { kkIntraday: epIntraday({}) }), s = KK_EP_ADAPTER.signalAt(ctx, EP_T - 1);
  assert.equal(KK_EP_ADAPTER.eligibility({ ctx, setup: s, bars: old.bars, i: EP_T - 1, cfg: EP_REFERENCE_CONFIG }).order.resolve(old.bars[EP_T]).status, 'NOT_EXECUTED_BEFORE_IEX_HISTORY');
  assert.equal(epChartCandidate(epBars().slice(EP_T - 63), 63), null, 'Gap ohne 64 Vorsitzungen ist kein Kandidat');
  // Sitzungsminuten aus Zeitstempeln: 09:30 ET = Minute 0 in Winter- und Sommerzeit; vor/nach der Sitzung und ungültige Notizen fallen weg
  assert.equal(sessionMinute('2023-01-04T14:30:00Z'), 0); assert.equal(sessionMinute('2023-07-05T13:30:00Z'), 0); assert.equal(sessionMinute('2023-01-04T20:59:00Z'), 389);
  const ses = toSession([
    { date: '2023-01-04T14:35:00Z', open: 1, high: 1, low: 1, close: 1, volume: 5 }, { date: '2023-01-04T14:29:00Z', open: 1, high: 1, low: 1, close: 1, volume: 5 },
    { date: '2023-01-04T14:30:00Z', open: 2, high: 2, low: 2, close: 2 }, { date: '2023-01-04T21:00:00Z', open: 1, high: 1, low: 1, close: 1, volume: 5 },
    { date: '2023-01-04T14:31:00Z', open: NaN, high: 1, low: 1, close: 1, volume: 5 },
  ]);
  assert.deepEqual(ses.map((x) => [x.k, x.volume]), [[0, 0], [5, 5]]);
});

test('MC3-FINDING-C09-ALLOC: F-MC3M-01 – bei knapper Kapazität vergibt die Engine den Platz in fillRank-Reihenfolge, nicht nach der Füllminute', () => {
  // Befund (nicht repariert, Fachmodell): Die Engine verarbeitet am Tag T die am Vortag scharfen Orders in der neutralen
  // Reihenfolge fillRank(Datum, id) (research/lifecycle-engine.mjs, Schritt 2). Bei INTRADAY_RESOLVED kennt sie die
  // Füllminute; ist nur ein Platz frei, bekommt ihn die Order mit dem kleineren Rang, auch wenn sie erst Stunden NACH
  // der anderen füllt. Die Zuteilung in Minute 6 hängt damit davon ab, dass die andere Order in Minute 300 füllen wird.
  const T = epBars()[EP_T].date, ids = ['US:EQ:EPA', 'US:EQ:EPB'].sort((a, b) => fillRank(T, a) - fillRank(T, b));
  const [first, second] = ids, tk = (id) => id.split(':')[2];
  const mins = { [`${tk(first)}|${T}`]: epMinutesLate(300), [`${tk(second)}|${T}`]: epMinutes() };
  const ds = { calendar: epBars().map((x) => x.date), securities: ids.map((id) => ({ id, bars: epBars(), terminal: null })), kkIntraday: epIntraday(mins) };
  const one = { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, maxOpenPositions: 1 };
  const r = runResearchLifecycle(ds, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG, policy: one });
  assert.deepEqual(r.trades.map((t) => [t.id, t.intradayEvidence.entryMinute]), [[first, 300]], 'Befund nicht mehr reproduzierbar: Evidenzdokument und Freigabevorschlag anpassen');
  assert.deepEqual(r.rejections.map((x) => [x.id, x.reason]), [[second, 'REJECT_MAX_OPEN_POSITIONS']]);
  // Beleg, dass die abgewiesene Order zeitlich zuerst füllt (Minute 6) und allein ausgeführt würde
  const alone = runResearchLifecycle({ ...ds, securities: ds.securities.filter((s) => s.id === second) }, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG, policy: one });
  assert.deepEqual(alone.trades.map((t) => [t.id, t.intradayEvidence.entryMinute]), [[second, EP_FILL_K]]);
  // ohne Kapazitätsgrenze (Referenz: 20 Positionen, Risiko 0,5 %) entstehen beide Einstiege: der Befund wirkt nur bei knapper Kapazität
  assert.equal(runResearchLifecycle(ds, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG }).trades.length, 2);
});

test('MC3-FINDING-C09-DAYBAR: F-MC3M-02 – fillOrder prüft für INTRADAY_RESOLVED die Endlichkeit von Hoch/Tief des Entscheidungstags', () => {
  // Befund (nicht repariert, Engine): fillOrder verlangt fin(bar.high) && fin(bar.low) des Gap-Tags, bevor es die Minuten
  // auflöst. Hoch und Tief sind erst am Schluss bekannt. Ihr WERT ändert nichts (Extremwerte: gleicher Einstieg), nur ihr
  // Fehlen (NaN) macht aus der Füllung NOT_EXECUTED_NO_SOURCE_BAR, obwohl Eröffnung und Minuten vorliegen.
  const sec = epSecurity(), key = `EPX|${sec.bars[EP_T].date}`;
  const runWith = (bars) => runResearchLifecycle({ calendar: bars.map((x) => x.date), securities: [{ id: sec.id, bars, terminal: null }], kkIntraday: epIntraday({ [key]: epMinutes() }) }, { adapter: KK_EP_ADAPTER, config: EP_REFERENCE_CONFIG });
  const withDay = (f) => sec.bars.map((x, k) => (k === EP_T ? f(x) : x));
  const base = runWith(sec.bars), ext = runWith(withDay(DAY_FIELDS_LATE.extreme));
  assert.equal(base.trades.length, 1);
  assert.equal(norm(ext.trades.map((t) => [t.entryFill, t.initialStop, t.shares])), norm(base.trades.map((t) => [t.entryFill, t.initialStop, t.shares])), 'Werte von Hoch/Tief wirken auf den Einstieg');
  const nan = runWith(withDay((x) => ({ ...x, high: NaN, low: NaN })));
  assert.deepEqual([nan.trades.length, nan.rejections.map((x) => x.reason)], [0, ['NOT_EXECUTED_NO_SOURCE_BAR']], 'Befund nicht mehr reproduzierbar: Evidenzdokument und Freigabevorschlag anpassen');
  // der Adapter selbst entscheidet ohne Hoch/Tief identisch (nur die Tagesspannen-Evidenz fehlt)
  const r = resolveEpDay({ minutes: epMinutes(), bar: DAY_FIELDS_LATE.nan(sec.bars[EP_T]), rawFactor: 1, adrPct: epChartCandidate(sec.bars, EP_T).adr20, iexBaseline: EP_BASELINE, cfg: EP_REFERENCE_CONFIG });
  assert.equal(r.status, 'FILLED');
});

// ------------------------------------------------------------------------------------------------ C10 Parabolic Short

test('MC3-CAUSAL-C10-CLOSE: der Kandidat für t hängt nur von Balken <= t - 1 ab; Produkt-Platzhalter = echter Folgebalken', () => {
  const bars = psBars(), base = psCand(bars);
  assert.ok(base && base.t === PS_T && base.upStreak >= 3, 'die Prüfung wäre leer: kein PS-Kandidat');
  const futures = {
    handelstagNaN: bars.map((b, k) => (k >= PS_T ? { ...NAN_BAR(b), splitAdj: 1 } : b)),
    handelstagExtrem: bars.map((b, k) => (k >= PS_T ? EXT_BAR(b, k) : b)),
    platzhalter: withNextSession(bars.slice(0, PS_T), bars[PS_T].date),
  };
  for (const v of PS_RUN_VARIANTS) {
    const b0 = psCand(bars, v.config);
    assert.ok(b0, `${v.id}: kein Kandidat – Prüfung leer`);
    assert.deepEqual(diffsOf(b0, futures, (x) => psCand(x, v.config)), [], `${v.id}: Blick in die Zukunft`);
  }
  // Produktdetektor (Stichtag = t - 1, Folgesitzung als Platzhalter) liefert denselben Kandidaten wie die Research-Sicht
  const det = DETECTORS.SF_KK_PARABOLIC_SHORT({ id: 'US:EQ:PSX', bars: bars.slice(0, PS_T) }, { nextSession: bars[PS_T].date });
  assert.equal(det.detected, true); assert.equal(det.features.upStreak, base.upStreak);
  // Gegenprobe zur Gegenprobe: Vergiftung vor t
  for (const [name, f] of Object.entries({ schlussNaN: (b) => ({ ...b, close: NaN }), schlussTief: (b) => ({ ...b, close: 52 }) })) {
    assert.notEqual(norm(psCand(bars.map((b, k) => (k === PS_T - 1 ? f(b) : b)))), norm(base), `Vergiftung vor t ohne Wirkung: ${name}`);
  }
});

test('MC3-CAUSAL-C10-MINUTES: Einstieg und Stopp hängen nur von Minuten <= Füllminute, der Eröffnung und Balken <= t - 1 ab', () => {
  const bars = psBars();
  let checked = 0;
  for (const v of PS_RUN_VARIANTS) {
    const cand = psCand(bars, v.config); if (!cand) continue;
    const run = (mins, bs = bars) => psDecision(runPsCandidate({ bars: bs, cand, minutes: mins, cfg: v.config }));
    const base = run(psMinutes());
    assert.equal(base.status, 'FILLED', `${v.id}: kein Einstieg (${base.status})`);
    checked++;
    const e = psEntry(psMinutes(), bars[PS_T], v.config, 1), j = e.minuteIndex;
    assert.equal(psMinutes()[j].k, base.entryMinute);
    assert.deepEqual(diffsOf(base, minuteFutures(psMinutes(), j), run), [], `${v.id}: Blick in spätere Minuten`);
    assert.deepEqual(diffsOf(e, minuteFutures(psMinutes(), j), (mins) => psEntry(mins, bars[PS_T], v.config, 1)), [], `${v.id}: psEntry`);
    // Folgetage und Hoch/Tief/Schluss des Handelstags sind Ergebnis
    const later = { folgetageNaN: barsAfter(bars, PS_T, NAN_BAR), folgetageExtrem: barsAfter(bars, PS_T, EXT_BAR), tagesfelderNaN: bars.map((b, k) => (k === PS_T ? DAY_FIELDS_LATE.nan(b) : b)), tagesfelderExtrem: bars.map((b, k) => (k === PS_T ? DAY_FIELDS_LATE.extreme(b) : b)) };
    assert.deepEqual(diffsOf(base, later, (bs) => run(psMinutes(), bs)), [], `${v.id}: Blick in Tagesfelder/Folgetage`);
    // Gegenprobe zur Gegenprobe: Vergiftung vor der Füllminute bzw. vor t
    const before = (q, f) => psMinutes().map((x, p) => (p === q ? f(x) : x));
    assert.notEqual(norm(run(before(1, (x) => ({ ...x, high: 56.5 })))), norm(base), `${v.id}: Hoch vor der Füllung ohne Wirkung`);
    assert.notEqual(norm(run(psMinutes(), bars.map((b, k) => (k === PS_T ? { ...b, open: NaN } : b)))), norm(base), `${v.id}: Eröffnung ohne Wirkung`);
    assert.notEqual(norm(run(psMinutes(), bars.map((b, k) => (k === PS_T - 3 ? { ...b, close: 400 } : b)))), norm(base), `${v.id}: MA-Ziel aus Balken vor t ohne Wirkung`);
  }
  assert.equal(checked, PS_RUN_VARIANTS.length);
  // Auswertung über evaluatePsCandidates (beide Überlappungsregeln): Zukunft nach dem Handelstag ändert die Einstiege nicht
  const ev = (bs, mins) => ['INDEPENDENT', 'ONE_POSITION_PER_TICKER'].map((overlap) => evaluatePsCandidates({ cands: [{ id: 'US:EQ:PSX', ticker: 'PSX', i: PS_T, date: bars[PS_T].date }], barsOf: () => bs, minutesOf: () => mins, cfg: PS_REFERENCE_CONFIG, overlap }))
    .map((r) => [...r.closed, ...r.open].map((t) => [t.key, t.entryMinute, t.entryAdj, t.stopAdj]));
  const j = psEntry(psMinutes(), bars[PS_T], PS_REFERENCE_CONFIG, 1).minuteIndex;
  assert.equal(norm(ev(barsAfter(bars, PS_T, NAN_BAR), minuteFutures(psMinutes(), j).extreme)), norm(ev(bars, psMinutes())));
});

test('MC3-DETERMINISTIC-C10: zwei Läufe auf tief eingefrorenen Eingaben sind gleich; Eingaben unverändert', () => {
  const bars = deepFreeze(psBars()), mins = deepFreeze(psMinutes()), before = sha({ bars, mins });
  const once = () => PS_RUN_VARIANTS.map((v) => {
    const cand = psCand(bars, v.config);
    return { cand, entry: psEntry(mins, bars[PS_T], v.config, 1), run: cand ? runPsCandidate({ bars, cand, minutes: mins, cfg: v.config }) : null };
  }).concat([evaluatePsCandidates({ cands: [{ id: 'US:EQ:PSX', ticker: 'PSX', i: PS_T, date: bars[PS_T].date }], barsOf: () => bars, minutesOf: () => mins, cfg: PS_REFERENCE_CONFIG, overlap: 'ONE_POSITION_PER_TICKER' })]);
  const a = sha(once());
  assert.equal(sha(once()), a, 'zwei Läufe ungleich');
  assert.equal(sha({ bars, mins }), before, 'Eingaben verändert');
  assert.equal(sha(clone(once())), a, 'Ergebnis enthält nicht serialisierbaren Zustand');
});

test('MC3-EDGE-C10: fehlende Minuten, Sitzungsbeginn (ORL_5 / erste rote 5-Minuten-Kerze), Unterbrechung mit Gap, Gap über den Stopp', () => {
  const bars = psBars(), cand = psCand(bars), cfg = PS_REFERENCE_CONFIG;
  const R = (mins, c = cfg, bs = bars) => runPsCandidate({ bars: bs, cand: psChartCandidate(bs, PS_T, c) ?? cand, minutes: mins, cfg: c });
  assert.equal(R(undefined).status, 'NOT_EXECUTED_INTRADAY_NOT_FETCHED');
  assert.equal(R([]).status, 'NOT_EXECUTED_NO_INTRADAY_DATA');
  assert.equal(R(psMinutes().filter((x) => x.k >= 6)).status, 'NOT_EXECUTED_IDENTITY_NO_OPENING_PRINT');
  // Sitzungsbeginn: ORL_5 nie vor Minute 5, die erste rote Kerze nie vor ihrem Abschluss; ein tiefes Tief in Minute 2 ist Teil der Spanne
  for (const v of PS_RUN_VARIANTS) {
    const r = R(psMinutes().map((x) => (x.k === 2 ? { ...x, low: 53.0 } : x)), v.config);
    if (PS_FILLED.has(r.status) && v.config.entry !== 'FAILED_VWAP_RETEST') assert.ok(r.trade.entryMinute >= 5, `${v.id}: Einstieg in Minute ${r.trade.entryMinute}`);
  }
  // fehlende Minuten 1–4: Spanne nur aus Minute 0 und der offiziellen Eröffnung, kein erfundener Wert
  const sparse = R(psMinutes().filter((x) => x.k === 0 || x.k >= 5));
  assert.ok(PS_FILLED.has(sparse.status)); assert.equal(sparse.trade.entryAdj, Math.min(54.9 - 0.01, 54.75), 'Level aus vorhandenen Minuten');
  // Unterbrechung (Minuten 5–30 fehlen), Wiederaufnahme mit Gap unter das Level: Füllung zur Eröffnung, nie zum Level
  const halt = [...psMinutes().slice(0, 5), m(31, 54.0, 54.1, 53.9, 54.0, 2000), ...psMinutes().filter((x) => x.k > 31)];
  const h = R(halt);
  assert.ok(PS_FILLED.has(h.status)); assert.equal(h.trade.entryMinute, 31); assert.equal(h.trade.entryAdj, 54.0);
  // Gap über den Stopp am Folgetag: Stop-Market zur Eröffnung (KK-027)
  const gapUp = bars.map((b, k) => (k === PS_T + 1 ? { ...b, open: 60, high: 61, low: 59, close: 60.5 } : b));
  const g = R(psMinutes(), cfg, gapUp);
  assert.ok(PS_FILLED.has(g.status));
  assert.deepEqual(g.trade.fills.map((x) => [x.reason, x.priceAdj]), [['PS_STOP_HOD_GAP_OPEN', 60]]);
  // fehlender Folgebalken (ausgesetzter Handel, NaN): übersprungen, kein Absturz, keine erfundene Deckung
  const halted = bars.map((b, k) => (k === PS_T + 1 ? NAN_BAR(b) : b));
  assert.ok(PS_FILLED.has(R(psMinutes(), cfg, halted).status));
  // Handelstag vor der IEX-Historie
  const old = psBars('2016-10-03'); assert.ok(old[PS_T].date < '2017-01-03');
  assert.equal(runPsCandidate({ bars: old, cand: psCand(old), minutes: psMinutes(), cfg }).status, 'NOT_EXECUTED_BEFORE_IEX_HISTORY');
});

// ------------------------------------------------------------------------------------------------ Gegenprobe, Abdeckung

test('MC3-CAUSAL-MINUTES-PROBE: Gegenprobe – ein Entscheider mit Blick auf spätere Minuten bzw. den Tagesschluss wird erkannt', () => {
  const b = epBars()[EP_T], adrPct = epChartCandidate(epBars(), EP_T).adr20;
  const honest = (mins) => epDecision(resolveEpDay({ minutes: mins, bar: b, rawFactor: 1, adrPct, iexBaseline: EP_BASELINE, cfg: EP_REFERENCE_CONFIG }));
  const peekLast = (mins) => ({ ...honest(mins), peek: mins.at(-1)?.close ?? null });
  const base = honest(epMinutes()), j = epMinutes().findIndex((x) => x.k === base.entryMinute);
  assert.deepEqual(diffsOf(base, minuteFutures(epMinutes(), j), honest), []);
  assert.ok(diffsOf(peekLast(epMinutes()), minuteFutures(epMinutes(), j), peekLast).length > 0, 'Blick auf die letzte Minute bleibt unerkannt');
  // PS: ein Level aus dem Tagestief statt aus der Eröffnungsspanne wird an der Vergiftung der Tagesfelder erkannt
  const bars = psBars();
  const peekDay = (bs) => { const e = psEntry(psMinutes(), bs[PS_T], PS_REFERENCE_CONFIG, 1); return { ...e, peek: bs[PS_T].low }; };
  assert.ok(diffsOf(peekDay(bars), { x: bars.map((x, k) => (k === PS_T ? DAY_FIELDS_LATE.extreme(x) : x)) }, peekDay).length > 0);
});

test('MC3-COVERAGE-MINUTES: erklärte Abdeckung und Befunde entsprechen den Testtiteln dieser Datei', () => {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const titles = [...src.matchAll(/^test\('([A-Z0-9-]+):/gm)].map((x) => x[1]);
  for (const ids of Object.values(MC3M_COVERED)) for (const id of ids) assert.ok(titles.includes(id), `${id} ohne Test`);
  for (const [f, [cid, id]] of Object.entries(MC3M_FINDINGS)) { assert.ok(titles.includes(id), `${f}: ${id} ohne Test`); assert.ok(MC3M_COVERED[cid], f); }
  assert.deepEqual(Object.keys(MC3M_COVERED), ['C09', 'C10']);
});
