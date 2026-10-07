// Minervini Ground Truth Replay – Diagnosemodus. Prueft die praeregistrierten Definitionen (Toleranzklassen,
// Anker, Pivot-Umrechnung, Kontrollauswahl) und dass der Replay dieselben Setups wie die eingefrorene Engine sieht.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { P } from '../replication/minervini-1.1/params.mjs';
import { scanSegment } from '../replication/minervini/signal-engine.mjs';
import { makeSplitRatio } from '../replication/minervini/sepa.mjs';
import { timingClass, replayCase, yearlyFunnel, seededSample, engineSignals, attribute, DETECTION_TOLERANCE } from '../ground-truth/replay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function dates(n, start = '2020-01-01') {
  const out = []; const d = new Date(start + 'T00:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function pathBars(start, legs) {
  const close = [start];
  for (const [n, to] of legs) { const from = close[close.length - 1]; for (let k = 1; k <= n; k++) close.push(from + (to - from) * k / n); }
  const date = dates(close.length);
  return { date, open: close.slice(), high: close.map((c) => c * 1.002), low: close.map((c) => c * 0.998), close, volume: close.map(() => 1e6) };
}
const q = (end, val, filed) => [end, val, filed, 'a-' + end, '10-Q', 0, 'EarningsPerShareDiluted', null];

// Gleiche Konstruktion wie MR-T-SCAN-INTEGRATION (Setup am letzten Basistag), plus Ausbruch am Folgetag.
function fixture({ breakout = true, rawFactor = 1 } = {}) {
  const b = pathBars(40, [[300, 100], [10, 88], [10, 98], [6, 92], [6, 97], [4, 94.5], [3, 96]]);
  const n = b.close.length;
  for (let i = n - 7; i < n; i++) b.volume[i] = 4e5;
  const raw = dates(1400, '2018-01-01').map((d) => ({ date: d, splitFactor: 1 }));
  const lastDate = b.date[n - 1];
  const filedLast = new Date(Date.parse(lastDate) - 30 * 864e5).toISOString().slice(0, 10);
  const end0 = new Date(Date.parse(lastDate) - 70 * 864e5).toISOString().slice(0, 10);
  const shiftQ = (d, k) => new Date(Date.parse(d) - k * 91.3125 * 864e5).toISOString().slice(0, 10);
  const ends = [5, 4, 3, 2, 1, 0].map((k) => shiftQ(end0, k));
  const epsV = [1, 1, 1, 1, 1.3, 1.5];
  const filed = (x, i) => (i === 5 ? filedLast : new Date(Date.parse(x) + 40 * 864e5).toISOString().slice(0, 10));
  const fund = { eps: ends.map((x, i) => q(x, epsV[i], filed(x, i))), rev: ends.map((x, i) => q(x, i === 5 ? 130 : 100, filed(x, i))), gp: [], opinc: [], ni: [] };
  for (const k of ['open', 'high', 'low', 'close', 'volume']) b[k].push(b[k][n - 1]);
  b.date.push(dates(n + 1)[n]);
  if (breakout) b.high[n] = 99;
  const ctx = { bars: b, rawClose: b.close.map((c) => c * rawFactor), rsPct: b.close.map(() => 85), fund, splitRatio: makeSplitRatio(raw) };
  return { ctx, setupIndex: n - 1, signalIndex: n };
}

test('GT-T-TIMING: Toleranzklassen sind fest (EXACT, +-1, +-3, +-5, MISS)', () => {
  assert.equal(DETECTION_TOLERANCE, 5);
  assert.deepEqual([0, 1, -1, 2, -3, 4, 5, -5, 6, null].map(timingClass),
    ['EXACT', 'PLUS_MINUS_1', 'PLUS_MINUS_1', 'PLUS_MINUS_3', 'PLUS_MINUS_3', 'PLUS_MINUS_5', 'PLUS_MINUS_5', 'PLUS_MINUS_5', 'MISS', 'MISS']);
  const prereg = JSON.parse(read('scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-PREREG.json'));
  assert.equal(prereg.timingTolerance.fixedBeforeAnalysis, true);
  assert.match(prereg.detection.DETECTED_entryKnown, /\+-5/);
});

test('GT-T-DETECTED-EXACT: Anker am Signaltag -> DETECTED/EXACT, Pivotabweichung 0 bei gleichem Rohpreis', () => {
  const { ctx, signalIndex, setupIndex } = fixture();
  const r = replayCase(ctx, { anchorDate: ctx.bars.date[signalIndex], documentedPivot: 97 * 1.002, classGroup: 'POSITIVE' }, P);
  assert.equal(r.decision, 'DETECTED', JSON.stringify(r.attribution));
  assert.equal(r.timing.class, 'EXACT');
  assert.equal(r.evaluatedClose, ctx.bars.date[setupIndex]);
  assert.equal(r.setupAtTStar, true);
  assert.ok(Math.abs(r.pivot.pctDeviation) < 1e-12);
  assert.equal(r.layers.vcp.pivot, undefined, 'keine Preise in der oeffentlichen Ausgabe');
});

test('GT-T-PIVOT-RAW: VU-Pivot wird auf den damaligen Rohpreis umgerechnet (Split-bereinigt -> roh)', () => {
  const { ctx, signalIndex } = fixture({ rawFactor: 2 }); // damals doppelter Rohpreis (spaeterer 2:1-Split)
  const r = replayCase(ctx, { anchorDate: ctx.bars.date[signalIndex], documentedPivot: 2 * 97 * 1.002, classGroup: 'POSITIVE' }, P);
  assert.ok(Math.abs(r.pivot.pctDeviation) < 1e-12);
});

test('GT-T-OFFSET: Anker 3 Handelstage nach dem Signal -> PLUS_MINUS_3 mit negativem Vorzeichen (VU frueher)', () => {
  const { ctx, signalIndex } = fixture();
  for (const k of ['open', 'high', 'low', 'close', 'volume']) for (let j = 0; j < 4; j++) ctx.bars[k].push(ctx.bars[k].at(-1));
  ctx.bars.date = dates(ctx.bars.date.length + 4).slice(0, ctx.bars.close.length);
  ctx.rawClose = ctx.bars.close.slice(); ctx.rsPct = ctx.bars.close.map(() => 85);
  const r = replayCase(ctx, { anchorDate: ctx.bars.date[signalIndex + 3], classGroup: 'POSITIVE' }, P);
  assert.equal(r.detected, true);
  assert.equal(r.timing.offsetSessions <= -3, true);
  assert.notEqual(r.timing.class, 'MISS');
});

test('GT-T-REJECTED: ohne Ausbruch kein Signal -> REJECTED; Anker ohne Setup liefert Regel-Attribution', () => {
  const { ctx, signalIndex } = fixture({ breakout: false });
  const r = replayCase(ctx, { anchorDate: ctx.bars.date[signalIndex], classGroup: 'POSITIVE' }, P);
  assert.equal(r.decision, 'REJECTED');
  assert.equal(r.timing.class, 'MISS');
  const early = replayCase(ctx, { anchorDate: ctx.bars.date[200], classGroup: 'POSITIVE' }, P);
  assert.equal(early.decision, 'NOT_EVALUABLE', 'Historie < 252 fuer SMA200/52W');
  const mid = replayCase(ctx, { anchorDate: ctx.bars.date[ctx.bars.date.length - 30], classGroup: 'POSITIVE' }, P);
  assert.equal(mid.decision, 'REJECTED');
  assert.ok(mid.attribution.length >= 1);
  for (const a of mid.attribution) assert.ok(['TREND_MISMATCH', 'VCP_MISMATCH', 'FUNDAMENTAL_MISMATCH', 'DATA_MISSING', 'DATA_DEFINITION_MISMATCH'].includes(a.category));
});

test('GT-T-NEGATIVE: Signal bei einem Negativfall ist FALSE_POSITIVE, sonst CORRECT_REJECT', () => {
  const a = fixture();
  assert.equal(replayCase(a.ctx, { anchorDate: a.ctx.bars.date[a.signalIndex], classGroup: 'NEGATIVE' }, P).decision, 'FALSE_POSITIVE');
  const b = fixture({ breakout: false });
  assert.equal(replayCase(b.ctx, { anchorDate: b.ctx.bars.date[b.signalIndex], classGroup: 'NEGATIVE' }, P).decision, 'CORRECT_REJECT');
});

test('GT-T-WINDOW: Fenster-Anker erkennt Signal im Fenster; Anker ausserhalb der Reihe -> NOT_EVALUABLE', () => {
  const { ctx, signalIndex } = fixture();
  const r = replayCase(ctx, { window: [ctx.bars.date[signalIndex - 10], ctx.bars.date[signalIndex]], classGroup: 'POSITIVE' }, P);
  assert.equal(r.decision, 'DETECTED'); assert.equal(r.timing.class, 'IN_WINDOW');
  assert.equal(replayCase(ctx, { anchorDate: '2099-01-01', classGroup: 'POSITIVE' }, P).decision, 'NOT_EVALUABLE');
  assert.equal(replayCase(ctx, {}, P).decision, 'NOT_EVALUABLE');
});

test('GT-T-SAME-SETUPS: Replay-Signale und Jahrestrichter stimmen mit scanSegment ueberein', () => {
  const { ctx } = fixture();
  const scan = scanSegment(ctx, P);
  const sig = engineSignals(ctx, scan.setups);
  for (const s of sig) assert.ok(scan.setups.has(s.setupIndex) && ctx.bars.high[s.signalIndex] > s.pivot);
  const years = yearlyFunnel(ctx, P);
  const sum = (k) => Object.values(years).reduce((a, y) => a + y[k], 0);
  assert.equal(sum('evaluated'), scan.stats.evaluated);
  assert.equal(sum('universe'), scan.stats.universe);
  assert.equal(sum('trend'), scan.stats.trend);
  assert.equal(sum('vcp'), scan.stats.vcp);
  assert.equal(sum('setups'), scan.stats.setups);
  assert.equal(sum('signals'), sig.length);
});

test('GT-T-CONTROLS-SEED: Kontrollauswahl ist deterministisch aus SHA-256(case_id)', () => {
  const items = Array.from({ length: 200 }, (_, i) => 'T' + i);
  const seed = crypto.createHash('sha256').update('GT-001').digest('hex');
  const a = seededSample(items, 10, seed), b = seededSample(items, 10, seed);
  assert.deepEqual(a, b); assert.equal(new Set(a).size, 10);
  const c = seededSample(items, 10, crypto.createHash('sha256').update('GT-002').digest('hex'));
  assert.notDeepEqual(a, c);
});

test('GT-T-ATTRIBUTION: mechanische Erstzuordnung; SEPA-Datenluecken getrennt von Regelverstoessen (Nachtrag A1)', () => {
  const layers = { universe: { ok: true }, trend: { ok: false, rules: { 'MR-TT-01': true, 'MR-TT-08': false } }, vcp: { ok: false, reason: 'NOT_CONTRACTING' }, sepa: { ok: false, ruleId: 'MR-SEPA-01', reason: 'SEPA_EPS_GROWTH_LOW' } };
  assert.deepEqual(attribute(layers).map((x) => x.category + ':' + x.layer), ['TREND_MISMATCH:MR-TT-08', 'VCP_MISMATCH:VCP', 'FUNDAMENTAL_MISMATCH:MR-SEPA-01']);
  const base = { ...layers, trend: { ok: true, rules: {} }, vcp: { ok: true } };
  assert.deepEqual(attribute({ ...base, sepa: { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_DATA_MISSING' } }).map((x) => x.category), ['DATA_MISSING']);
  assert.deepEqual(attribute({ ...base, sepa: { ok: false, ruleId: 'MR-SEPA-02', reason: 'SEPA_ACCEL_NOT_DEMONSTRABLE' } }).map((x) => x.category), ['DATA_MISSING']);
  assert.deepEqual(attribute({ ...base, sepa: { ok: false, ruleId: 'MR-PIT-01', reason: 'SEPA_STALE' } }, ['FOREIGN_PRIVATE_ISSUER_NO_10Q']).map((x) => x.category), ['DATA_DEFINITION_MISMATCH']);
  const bnp = attribute({ ...base, sepa: { ok: false, ruleId: 'MR-SEPA-10', reason: 'SEPA_BASE_NOT_POSITIVE' } })[0];
  assert.equal(bnp.category, 'FUNDAMENTAL_MISMATCH'); assert.ok(bnp.also.includes('EPS_DEFINITION_GAAP_VS_ADJUSTED_POSSIBLE'));
});

test('GT-T-ISOLATION: Replay ist reine Diagnose (kein Portfolio, keine Engine-Aenderung, keine Rueckschreibung)', () => {
  const src = read('scripts/supertrader/ground-truth/replay.mjs');
  assert.doesNotMatch(src, /portfolio-sim|portfolio-policy|exit-policy|writeFileSync|ledger|registry/);
  assert.match(src, /from '\.\.\/replication\/minervini\/signal-engine\.mjs'/);
});

test('GT-T-PUBLIC-VIEW: oeffentliche Sicht ohne Kurse; Identitaet ueber Ticker und Datum (damaliges Listing)', async () => {
  const { publicView, resolveSegment } = await import('../ground-truth/run-replay.mjs');
  const { ctx, signalIndex } = fixture();
  const r = replayCase(ctx, { anchorDate: ctx.bars.date[signalIndex], documentedPivot: 97, classGroup: 'POSITIVE' }, P);
  const v = JSON.stringify(publicView(r));
  assert.doesNotMatch(v, /"pivot":|"stop":|"close"|"high"|"low"|"price"/);
  assert.match(v, /"decision":"DETECTED"/);
  const seg = (id, a, b) => ({ id, raw: [{ date: a }, { date: b }] });
  const segs = [seg('tiingo:NASDAQ:RNA:2020-06-12', '2020-06-12', '2026-01-02'), seg('tiingo:NASDAQ:RNA:2026-05-01', '2026-05-01', '2026-09-30')];
  assert.equal(resolveSegment(segs, 'RNA', '2024-11-13').seg.id, 'tiingo:NASDAQ:RNA:2020-06-12', 'wiederverwendeter Ticker -> damaliges Listing');
  assert.equal(resolveSegment(segs, 'RNA', '2026-03-01').seg, null);
  assert.equal(resolveSegment([...segs, seg('tiingo:NYSE:RNA:2019-01-02', '2019-01-02', '2025-01-02')], 'RNA', '2024-11-13').ambiguous, true, 'mehrdeutig -> keine stille Wahl');
  assert.equal(resolveSegment([seg('tiingo:NASDAQ:GEN:2015-01-02', '2015-01-02', '2026-09-30')], ['NLOK', 'GEN'], '2020-08-10').seg.id, 'tiingo:NASDAQ:GEN:2015-01-02', 'Aliasliste');
  const { previousSession } = await import('../ground-truth/run-replay.mjs');
  assert.equal(previousSession(['2020-09-14', '2020-09-15', '2020-09-16'], '2020-09-16'), '2020-09-15');
  assert.equal(previousSession(['2020-09-16'], '2020-09-16'), null);
});

test('GT-T-CASES: Fallliste nur aus eigenen Beitraegen; LOW nie ausgewertet; keine geratenen Preise; MAIN strukturell sauber', async () => {
  const { buildCases, postDate, postTime } = await import('../ground-truth/build-cases.mjs');
  const j = buildCases();
  assert.equal(postDate('1006531423380103168'), '2018-06-12');
  assert.deepEqual(JSON.parse(read('scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-CASES.json')), JSON.parse(JSON.stringify(j)), 'Artefakt = Erzeuger');
  for (const c of j.cases) {
    if (c.replay_spec) { assert.notEqual(c.source_confidence, 'LOW', c.case_id); assert.equal(c.source.kind, 'X_POST_OWN', c.case_id); assert.ok(c.control_seed_key.includes(c.source.statusId), c.case_id); }
    assert.equal(c.documented_pivot, null); assert.equal(c.documented_entry.price, null);
  }
  for (const c of j.cases.filter((x) => x.evaluation_group === 'MAIN')) {
    assert.ok(['POST_DAY', 'PREVIOUS_DAY_STATED', 'DATE_STATED', 'WEEKDAY_STATED'].includes(c.anchor_basis), c.case_id);
    assert.ok(c.stratum, c.case_id);
    assert.ok(c.own_trade === true || ['BUY_SETUP'].includes(c.minervini_classification), c.case_id);
    assert.ok(!c.tags.includes('ENTRY_PULLBACK') && !c.tags.includes('ENTRY_PRE_BREAKOUT'), c.case_id);
    assert.ok(c.identity.expected_cik, c.case_id);
    // Beitrag in der Handelszeit, sonst muss der Anker der Vortag sein (vorboerslich "gestern").
    if (!c.source.postTime.inSession) assert.equal(c.anchor_basis, 'PREVIOUS_DAY_STATED', c.case_id);
  }
  assert.equal(postTime('1306216940868960256').et, '09:02', 'RVNC vorboerslich -> Anker Vortag');
  const ids = j.cases.filter((c) => c.replay_spec).map((c) => c.control_seed_key);
  assert.equal(new Set(ids).size, ids.length, 'Seed-Schluessel eindeutig');
});

test('GT-T-RESULTS: Auswertung aus oeffentlichen Logzeilen (Recall, Fehlermatrix, Kontrollen, Baum)', async () => {
  const { parseLog, evaluate } = await import('../ground-truth/build-results.mjs');
  const ok = { universe: { ok: true }, trend: { ok: true, failed: [] }, vcp: { ok: true }, sepa: { ok: true } };
  const mk = (id, group, decision, patch = {}, extra = {}) => ({ case_id: id, ticker: id, group, replay: { decision, setupAtTStar: decision === 'DETECTED', timing: { class: decision === 'DETECTED' ? 'EXACT' : 'MISS' }, ...ok, ...patch }, ...extra });
  const ctl = { controls: { n: 10, setupAtTStar: 1, detected: 1, trend: 3, vcp: 2, sepa: 4 } };
  const lines = [
    mk('A', 'MAIN', 'DETECTED', {}, ctl), mk('B', 'MAIN', 'REJECTED', { vcp: { ok: false, reason: 'NOT_CONTRACTING' } }, ctl),
    mk('C', 'MAIN', 'REJECTED', { sepa: { ok: false, ruleId: 'MR-SEPA-01', reason: 'SEPA_EPS_GROWTH_LOW' }, vcp: { ok: false, reason: 'STOP_TOO_WIDE' } }, ctl),
    mk('E', 'MAIN', 'REJECTED', { sepa: { ok: false, ruleId: 'MR-SEPA-00', reason: 'SEPA_DATA_MISSING' } }, ctl),
    { case_id: 'D', ticker: 'D', group: 'MAIN', replay: { decision: 'NOT_EVALUABLE', reason: 'SECURITY_MAPPING_NOT_IN_PROVIDER_LIST' } },
    mk('N', 'NEGATIVE', 'CORRECT_REJECT'),
  ].map((x) => `[gt-replay DEV +1s] FALL ${JSON.stringify(x)}`).join('\n') + '\n[gt-replay DEV +2s] TRICHTER {"2020|UP":{"evaluated":10,"universe":8,"trend":4,"vcp":2,"setups":1,"signals":1}}';
  const { cases, funnels } = parseLog(lines);
  const r = evaluate(cases, funnels);
  assert.equal(r.recall.MAIN.evaluable, 4); assert.equal(r.recall.MAIN.detected, 1);
  assert.equal(r.recall.MAIN.notEvaluable.SECURITY_MAPPING_NOT_IN_PROVIDER_LIST, 1);
  assert.equal(r.failureMatrix.byLayer.VCP.cases, 2); assert.equal(r.failureMatrix.byLayer.FUNDAMENTALS_RULE.cases, 1); assert.equal(r.failureMatrix.byLayer.FUNDAMENTALS_DATA.cases, 1);
  assert.equal(r.failureMatrix.soleBlockingLayer.VCP, 1); assert.equal(r.failureMatrix.soleBlockingLayer.FUNDAMENTALS_DATA, 1);
  assert.match(String(r.precision), /NOT_MEASURABLE/);
  assert.equal(r.controls.universeOnly.detectedRate, 0.1);
  assert.deepEqual(r.decisionTree, ['B', 'E'], 'Datenluecken loesen D nicht aus');
  assert.equal(r.funnel[0].perYear['2020'].setupsPer1000, 125);
});

test('GT-T-FREEZE: Freeze deckt Fallliste, Praeregistrierung und Replay-Code ab', async () => {
  const { FROZEN_FILES, verifyGtFreeze } = await import('../ground-truth/freeze.mjs');
  for (const f of ['MINERVINI-GROUND-TRUTH-CASES.json', 'MINERVINI-GROUND-TRUTH-PREREG.json', 'replay.mjs', 'run-replay.mjs', 'build-results.mjs']) assert.ok(FROZEN_FILES.some((x) => x.endsWith(f)), f);
  const r = verifyGtFreeze();
  if (fs.existsSync(path.join(root, 'scripts/supertrader/fidelity/MINERVINI-GROUND-TRUTH-FREEZE.json'))) assert.equal(r.ok, true, JSON.stringify(r));
  else assert.equal(r.reason, 'NO_FREEZE');
});

test('GT-T-EXPLORE-TAGS: Erstmeldung ueber Tags hinweg (TNDM-Muster: 10-Q unter BasicAndDiluted, 10-K unter Diluted)', async () => {
  const { earliestAcrossTags } = await import('../ground-truth/explore-sec-tags.mjs');
  const row = (start, end, val, form, filed) => ({ start, end, val, form, filed, accn: form + filed });
  const tax = {
    EarningsPerShareDiluted: { units: { 'USD/shares': [row('2020-01-01', '2020-03-31', -0.25, '10-K', '2021-02-24')] } },
    EarningsPerShareBasicAndDiluted: { units: { 'USD/shares': [row('2020-01-01', '2020-03-31', -0.25, '10-Q', '2020-04-30')] } },
  };
  const r = earliestAcrossTags(tax, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], 'USD/shares');
  assert.equal(r[0][2], '2020-04-30', 'frueheste Einreichung, nicht die erste Tag-Prioritaet');
  const { seriesWithFallback } = await import('../replication/minervini/sec-facts.mjs');
  assert.equal(seriesWithFallback(tax, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'], 'USD/shares')[0][2], '2021-02-24', 'Befund: eingefrorene Extraktion sieht das Quartal erst mit dem 10-K');
});

test('GT-T-PUBLIC-ARTIFACTS: RESULTS/FAILURES ohne Kurse; Freeze gueltig; Engine unveraendert', () => {
  for (const f of ['MINERVINI-GROUND-TRUTH-RESULTS.json', 'MINERVINI-GROUND-TRUTH-FAILURES.json']) {
    const p = path.join(root, 'scripts/supertrader/fidelity', f);
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    assert.doesNotMatch(s, /"(pivot|stop|close|open|high|low|price|entryPrice|exitPrice)":\s*-?\d/, f);
    const j = JSON.parse(s);
    assert.equal(j.engine.name, 'minervini-adaptation-1.1.0');
  }
});
