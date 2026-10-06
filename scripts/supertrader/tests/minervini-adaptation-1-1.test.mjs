// Minervini Adaptation 1.1.0 (Phase 2B) – Regel-, Provenienz-, Era- und Freeze-Tests; Margen-Regressionstests
// gegen die eingefrorenen 2A-Module. Synthetische Faelle, keine historischen Gewinner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { P, PARAM_TABLE, RULEBOOK, withMaxPositionPct, MissingProvenanceError } from '../replication/minervini-1.1/params.mjs';
import { buildParamTable, paramAccessor, P as P2A, PARAM_TABLE as T2A, RULEBOOK as RB2A } from '../replication/minervini/params.mjs';
import { exposureStage, reserveOrdersStaged, rankOrders, STAGE } from '../replication/minervini-1.1/portfolio-policy.mjs';
import { simulatePortfolio } from '../replication/minervini-1.1/portfolio-sim.mjs';
import { simulatePortfolio as simulate2A } from '../replication/minervini/portfolio-sim.mjs';
import { industryRecord } from '../replication/minervini-1.1/industry-record.mjs';
import { classify, reportAreas } from '../replication/minervini-1.1/engine.mjs';
import { build as buildRulebook, RULEBOOK_11, DELTA, BASELINE, CHANGES } from '../replication/minervini-1.1/build-rulebook.mjs';
import { sourceCap } from '../replication/minervini-1.1/fidelity-2b.mjs';
import { verifyFreeze as verify11, FREEZE_PATH as FREEZE_11 } from '../replication/minervini-1.1/freeze.mjs';
import { verifyFreeze as verify2A } from '../replication/minervini/freeze.mjs';
import { releasesDuringHold } from '../replication/minervini-1.1/measure.mjs';
import { extractCompanyFacts, quarterlyFirst, ROW } from '../replication/minervini/sec-facts.mjs';
import { marginsAt } from '../replication/minervini/sepa.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const DIR = path.join(root, 'scripts/supertrader/replication/minervini-1.1');
const LAYER = path.join(root, 'scripts/supertrader/data-layer/sec');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mjs = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.mjs')).map((f) => path.join(d, f));

// ---------------------------------------------------------------- Phase 2A bleibt unveraendert
test('MR11-T-BASELINE: 2A-Freeze gueltig; Baseline-, Delta- und 1.1-Regelbuch-Dateien sind aktuell aus dem 2A-Stand erzeugt', () => {
  const v = verify2A();
  assert.equal(v.ok, true, v.reason);
  const { rb11, delta, baseline } = buildRulebook();
  const fmt = (o) => JSON.stringify(o, null, 2) + '\n';
  assert.equal(fs.readFileSync(RULEBOOK_11, 'utf8'), fmt(rb11), 'Regelbuch 1.1.0 veraltet: build-rulebook.mjs --write');
  assert.equal(fs.readFileSync(DELTA, 'utf8'), fmt(delta));
  assert.equal(fs.readFileSync(BASELINE, 'utf8'), fmt(baseline));
  assert.equal(baseline.freeze.status, 'FROZEN');
  assert.equal(baseline.classification.canonicalName, 'minervini-adaptation-1.0.0');
  assert.equal(RULEBOOK.engine.parent.version, '1.0.0');
});

// ---------------------------------------------------------------- Keine versteckten Defaults
test('MR11-T-PARAMS-PROVENANCE: jeder 1.1-Parameter hat Rule-ID und Herkunft; unbekannter Name wirft', () => {
  for (const [name, e] of Object.entries(PARAM_TABLE)) { assert.ok(e.ruleId, name); assert.ok(['ORIGINAL', 'ORIGINAL_INTERPRETATION', 'VU_FORMALIZATION', 'VU_OWN'].includes(e.provenance), name); }
  assert.throws(() => P['pf.initialExposureCeilling'], MissingProvenanceError);
  const Ps = withMaxPositionPct(P, 0.05);
  assert.equal(Ps['size.maxPositionPct'], 0.05); assert.equal(Ps['size.riskPerTrade'], P['size.riskPerTrade']);
  assert.throws(() => Ps['nicht.vorhanden'], MissingProvenanceError);
  assert.throws(() => withMaxPositionPct(P, undefined), MissingProvenanceError);
});

test('MR11-T-PARAMS-DELTA: gegenueber 2A aendern sich genau die erklaerten Parameter', () => {
  const changedValue = [], changedProv = [], added = [], removed = [];
  for (const [n, e] of Object.entries(PARAM_TABLE)) {
    if (!T2A[n]) { added.push(n); continue; }
    if (JSON.stringify(e.value) !== JSON.stringify(T2A[n].value)) changedValue.push(n);
    if (e.provenance !== T2A[n].provenance) changedProv.push(n);
  }
  for (const n of Object.keys(T2A)) if (!PARAM_TABLE[n]) removed.push(n);
  assert.deepEqual(changedValue, ['pf.initialExposureCeiling']);
  assert.deepEqual(changedProv.sort(), ['pf.initialExposureCeiling', 'pf.maxPositions', 'size.maxPositionPct']);
  assert.deepEqual(added.sort(), ['ind.fallbackLevel', 'ind.groupLevel', 'ind.minMembers', 'ind.topN', 'pf.initialMaxPositionPct']);
  assert.deepEqual(removed, []);
  assert.equal(P['pf.initialExposureCeiling'], 0.25); assert.equal(P['pf.initialMaxPositionPct'], 0.05);
});

test('MR11-T-NO-HIDDEN-DEFAULTS: 1.1-Code und Datenlayer ohne numerische Ersatzwerte; jeder Regelbuch-Parameter wird genutzt', () => {
  for (const f of [...mjs(DIR), ...mjs(LAYER)]) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /(\?\?|\|\|)\s*-?\d*\.?\d+(?![\w.'"])/, `${f}: numerischer Ersatzwert`);
    assert.doesNotMatch(src, /\(\s*[^)]*\b\w+\s*=\s*-?\d*\.?\d+\s*[,)]/, `${f}: numerischer Default-Parameter`);
    assert.doesNotMatch(src, /PORTFOLIO_DEFAULTS|engine\/simulator\.mjs|validation\/portfolio\.mjs|strategies\/minervini/, `${f}: Legacy-Logik`);
  }
  const used = new Set();
  const files = [...mjs(DIR), ...mjs(path.join(root, 'scripts/supertrader/replication/minervini'))];
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/P\['([\w.]+)'\]/g)) used.add(m[1]);
  const external = new Set(['rs.definitionId', 'rs.weights', 'rs.horizons']);
  for (const n of Object.keys(PARAM_TABLE)) if (!external.has(n)) assert.ok(used.has(n), `${n} ungenutzt`);
});

// ---------------------------------------------------------------- MR-PF-02 Startstufe
test('MR11-T-PF-STAGE: Startstufe 25 % / 5 %, nach Gewinn 100 % / 25 %, nach Verlust oder Null zurueck', () => {
  assert.deepEqual(exposureStage(null, P), { stage: STAGE.PILOT, ceiling: 0.25, maxPositionPct: 0.05 });
  assert.deepEqual(exposureStage(10, P), { stage: STAGE.FULL, ceiling: 1, maxPositionPct: 0.25 });
  assert.equal(exposureStage(-1, P).stage, STAGE.PILOT); assert.equal(exposureStage(0, P).stage, STAGE.PILOT);
  const g = rankOrders([{ segId: 'A', rsScore: 1, stopPct: 0.03, pivot: 100, stop: 97, unit: 1 }]);
  const pilot = reserveOrdersStaged(g, { equity: 1e5, openValue: 0, openCount: 0, cash: 1e5 }, exposureStage(null, P), P);
  assert.ok(pilot[0].cost <= 5000 + 1e-6 && pilot[0].cost > 4800, `Startstufe ${pilot[0].cost}`);
  const full = reserveOrdersStaged(g, { equity: 1e5, openValue: 0, openCount: 0, cash: 1e5 }, exposureStage(1, P), P);
  assert.ok(full[0].cost <= 25000 + 1e-6 && full[0].cost > 24000, `volle Stufe ${full[0].cost}`);
  // Startstufe: Obergrenze 25 % Exposure -> bei 22 % offen bleiben 3 %
  const capped = reserveOrdersStaged(g, { equity: 1e5, openValue: 22000, openCount: 4, cash: 78000 }, exposureStage(null, P), P);
  assert.ok(capped[0].cost <= 3000 + 1e-6);
});

function dates(n, start = '2021-01-04') {
  const out = []; const d = new Date(start + 'T00:00:00Z');
  while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function seg(id, closes, setups = {}, extra = {}) {
  const n = closes.length, date = dates(n);
  return { id, date, rawClose: closes.slice(), open: extra.open || closes.slice(), high: extra.high || closes.map((c) => c * 1.01), low: extra.low || closes.map((c) => c * 0.99), close: closes.slice(),
    volume: closes.map(() => 1e6), volAvg: closes.map(() => 1e6), divAdj: closes.map(() => 0), delisted: !!extra.delisted,
    setups: new Map(Object.entries(setups).map(([k, v]) => [Number(k), { stopPct: 1 - v.stop / v.pivot, rsScore: 0.5, rsPct: 80, ...v }])) };
}
test('MR11-T-PF-STAGE-SIM: erste Position hoechstens 5 %; nach einem Gewinn-Trade bis 25 %', () => {
  const a = seg('A', [100, 103, 110], { 0: { pivot: 101, stop: 97, baseStart: 0 } }, { delisted: true });
  const b = seg('B', [50, 50, 50, 50, 55, 56], { 2: { pivot: 51, stop: 49.5, baseStart: 0 } });
  b.open[3] = 50; b.high[3] = 52;
  const r = simulatePortfolio([a, b], b.date, P);
  const ta = r.trades.find((t) => t.segId === 'A'), tb = r.trades.find((t) => t.segId === 'B');
  assert.ok(ta.pnl > 0);
  // Hoechstgewicht gilt zum geplanten Kurs (Pivot + Slippage, wie MR-SIZ-02 in 2A); ein Gap darf es beim Fuellen leicht ueberschreiten.
  assert.ok((101 * 1.001 * ta.shares0) / 1e5 <= 0.05 + 1e-9, 'Startstufe');
  const eq = r.curve.find((c) => c.date === b.date[2]).equity;
  assert.ok((tb.entryPrice * tb.shares0) / eq > 0.2 && (51 * 1.001 * tb.shares0) / eq <= 0.25 + 1e-9, 'volle Stufe');
  assert.equal(r.curve[0].stage, STAGE.PILOT); assert.equal(r.curve.find((c) => c.date === b.date[3]).stage, STAGE.FULL);
});

test('MR11-T-SIM-EQUIV: mit den 2A-Stufenwerten handelt die 1.1-Simulation identisch zur eingefrorenen 2A-Simulation', () => {
  const rb = JSON.parse(JSON.stringify(RULEBOOK));
  const pf2 = rb.rules.find((r) => r.id === 'MR-PF-02').formalization.parameters;
  pf2['pf.initialExposureCeiling'].value = P2A['pf.initialExposureCeiling'];
  pf2['pf.initialMaxPositionPct'].value = P2A['size.maxPositionPct'];
  const Peq = paramAccessor(buildParamTable(rb));
  const worlds = [
    () => { const a = seg('A', [100, 103, 110], { 0: { pivot: 101, stop: 97, baseStart: 0 } }, { delisted: true }); const b = seg('B', [50, 50, 50, 50, 55, 56], { 2: { pivot: 51, stop: 49.5, baseStart: 0 } }); b.open[3] = 50; b.high[3] = 52; return [[a, b], b.date]; },
    () => { const s = seg('X', [100, 100, 90, 90, 90, 90, 100, 100], { 0: { pivot: 99, stop: 95, baseStart: 0 }, 4: { pivot: 91, stop: 88, baseStart: 3 } }); s.high[1] = 101; s.open[2] = 90; s.low[2] = 89; s.high[5] = 92; return [[s], s.date]; },
    () => { const xs = ['A', 'B', 'C', 'D'].map((id, k) => seg(id, [100, 100, 104 + k, 108 + k, 120, 90, 95], { 1: { pivot: 101, stop: 95 + k, baseStart: 0, rsScore: 0.1 * k } })); return [xs, xs[0].date]; },
  ];
  for (const w of worlds) {
    const [s1, cal] = w(), [s2] = w();
    const r11 = simulatePortfolio(s1, cal, Peq), r2a = simulate2A(s2, cal, P2A);
    assert.deepEqual(r11.trades, r2a.trades);
    assert.deepEqual(r11.curve.map(({ stage, ...c }) => c), r2a.curve);
  }
});

// ---------------------------------------------------------------- MR-SEPA-12 Protokoll
test('MR11-T-IND-RECORD: Rang in der SIC-Gruppe point-in-time, nur Protokoll; unbekannte SIC und Mantel ausgewiesen', () => {
  const m = [{ id: 'S', sic: '7372', rsPct: 90 }, { id: 'a', sic: '7371', rsPct: 95 }, { id: 'b', sic: '7374', rsPct: 70 }, { id: 'c', sic: '7379', rsPct: 60 }, { id: 'd', sic: '7373', rsPct: 50 }, { id: 'e', sic: '7375', rsPct: 99 }, { id: 'x', sic: null, rsPct: 100 }];
  const r = industryRecord(m, 'S', P);
  assert.equal(r.known, true); assert.equal(r.level, 3); assert.equal(r.group, '737'); assert.equal(r.rank, 3); assert.equal(r.topN, true); assert.equal(r.groupSize, 6);
  assert.equal(industryRecord(m, 'x', P).reason, 'SIC_UNKNOWN_AT_DATE');
  assert.equal(industryRecord([{ id: 'z', sic: '6770', rsPct: 1 }], 'z', P).reason, 'SPAC_SHELL');
  assert.equal(industryRecord([{ id: 'S', sic: '1000', rsPct: 50 }], 'S', P).reason, 'GROUP_TOO_SMALL');
  const rule = RULEBOOK.rules.find((x) => x.id === 'MR-SEPA-12');
  assert.equal(rule.implementation.status, 'RECORDED_ONLY');
  // Protokoll wirkt nicht auf Auswahl: die Signal-/Portfolio-Module lesen ind.* nicht.
  for (const f of ['portfolio-sim.mjs', 'portfolio-policy.mjs']) assert.doesNotMatch(fs.readFileSync(path.join(DIR, f), 'utf8'), /industry|ind\./);
});

test('MR11-T-ERN-RECORD: Mitteilungen waehrend der Haltedauer (ex post) zaehlen nur Original-8-K mit entry <= Einreichung < exit', () => {
  const ev = [['2021-01-10', 'a', '8-K', 'EARNINGS_RELEASE'], ['2021-01-12', 'b', '8-K', 'EARNINGS_RELEASE_DUPLICATE'], ['2021-02-01', 'c', '8-K/A', 'EARNINGS_RELEASE_AMENDMENT'], ['2021-03-01', 'd', '8-K', 'EARNINGS_RELEASE']];
  assert.equal(releasesDuringHold(ev, '2021-01-10', '2021-03-01'), 1);
  assert.equal(releasesDuringHold(ev, '2021-01-11', '2021-03-02'), 1);
  assert.equal(releasesDuringHold(ev, '2021-01-01', '2021-04-01'), 2);
  const rule = RULEBOOK.rules.find((x) => x.id === 'MR-ERN-01');
  assert.equal(rule.implementation.status, 'NOT_IMPLEMENTED'); assert.equal(rule.reproducibility, 'NOT_REPRODUCIBLE_WITH_CURRENT_DATA');
});

// ---------------------------------------------------------------- Quellen, Era, Fidelity
test('MR11-T-SOURCE-PROVENANCE: HIGH nur mit Primaerquelle im Volltext oder zwei eigenen Beitraegen; jede Aenderung vollstaendig dokumentiert', () => {
  const byId = new Map(RULEBOOK.sources.map((s) => [s.id, s]));
  for (const s of RULEBOOK.sources) { assert.ok(s.tier, s.id); assert.ok(s.era, s.id); }
  for (const r of RULEBOOK.rules.filter((x) => x.layer === 'A_CANONICAL')) {
    if (r.sourceConfidence === 'HIGH') {
      const tiers = r.sources.map((id) => byId.get(id).tier);
      assert.ok(tiers.includes('PRIMARY_DIRECT') || tiers.filter((t) => t === 'OWN_POST_INDEX').length >= 2, `${r.id}: HIGH ohne Primaerbeleg`);
    }
    if (r.sources.every((id) => byId.get(id).tier === 'SECONDARY')) assert.notEqual(r.sourceConfidence, 'HIGH');
  }
  assert.equal(sourceCap({ layer: 'A_CANONICAL', sources: ['SRC-SECONDARY-WEB-2026'] }, byId), 'LOW');
  assert.equal(sourceCap({ layer: 'A_CANONICAL', sources: ['SRC-BOOK-TLSMW', 'SRC-NOTES-WHB-2014-05-04'] }, byId), 'MEDIUM');
  for (const c of RULEBOOK.changes) for (const k of ['ruleId', 'source', 'newData', 'old', 'new', 'why']) assert.ok(c[k], `${c.ruleId}: ${k} fehlt`);
  assert.equal(RULEBOOK.changes.length, CHANGES.length);
  assert.doesNotMatch(JSON.stringify(RULEBOOK.changes), /CAGR|Sharpe|Drawdown|Rendite|Backtest-Ergebnis/i, 'keine Aenderung mit Messergebnis begruendet');
});

test('MR11-T-ERA: Methodenaera 2013-2022; kein wirkender Parameter beruht allein auf Quellen ab 2023', () => {
  assert.equal(RULEBOOK.methodEra.id, 'SEPA-PUBLISHED-2013-2022');
  const byId = new Map(RULEBOOK.sources.map((s) => [s.id, s]));
  for (const r of RULEBOOK.rules) {
    if (r.implementation.status !== 'IMPLEMENTED' || !Object.keys(r.formalization.parameters).length || r.layer !== 'A_CANONICAL') continue;
    const eras = r.sources.map((id) => byId.get(id).era);
    assert.ok(eras.some((e) => e !== 'CURRENT_PUBLIC'), `${r.id} beruht nur auf CURRENT_PUBLIC`);
  }
  const conflicts = JSON.parse(read('scripts/supertrader/fidelity/MINERVINI-SOURCE-CONFLICTS.json'));
  assert.equal(conflicts.methodEra.id, RULEBOOK.methodEra.id);
  for (const c of conflicts.conflicts) assert.ok(RULEBOOK.rules.some((r) => r.id === c.ruleId), c.id);
});

test('MR11-T-CLASSIFICATION: Name minervini-adaptation-1.1.0; Hard Gate verbietet Replication; Delta passt zur Engine', () => {
  const c = classify();
  assert.equal(c.canonicalName, 'minervini-adaptation-1.1.0'); assert.equal(c.replicationClaimAllowed, false); assert.equal(c.productClass, 'VU_ADAPTATION');
  const delta = JSON.parse(fs.readFileSync(DELTA, 'utf8'));
  assert.deepEqual(delta.gateAreas.phase2B, c.areas);
  assert.deepEqual(Object.fromEntries(delta.areas.map((a) => [a.area, a.phase2B])), reportAreas());
  assert.deepEqual(delta.areas.map((a) => a.area), ['trend', 'fundamental', 'vcp', 'entry', 'exit', 'sizing', 'portfolio', 'risk', 'market', 'industry']);
  assert.deepEqual(delta.hardQuestion.improvedRulesVsRescored2A.sort(), ['MR-PF-02', 'MR-SEPA-12']);
});

test('MR11-T-ISOLATION: Live-Build, Ledger und andere Produkte kennen 1.1 und den Datenlayer nicht', () => {
  assert.doesNotMatch(read('scripts/supertrader/build.mjs'), /minervini-1\.1|data-layer\/sec|replication\//);
  assert.equal(RULEBOOK.engine.status, 'RESEARCH_ONLY_NOT_LIVE');
  for (const f of mjs(DIR)) assert.doesNotMatch(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), /ledger|writeFileSync\([^)]*supertrader\/data/i, f);
});

test('MR11-T-FREEZE: ein vorhandener 1.1-Freeze passt zu Regelbuch, Quellen, Delta, Schema und Code; Eltern-Freeze 2A unveraendert', () => {
  if (!fs.existsSync(FREEZE_11)) return; // Kandidat vor dem Freeze
  const v = verify11();
  assert.equal(v.ok, true, v.reason);
  const f = JSON.parse(fs.readFileSync(FREEZE_11, 'utf8'));
  assert.equal(f.parent.name, 'minervini-adaptation-1.0.0');
  for (const p of ['scripts/supertrader/replication/minervini/portfolio-sim.mjs', 'scripts/supertrader/data-layer/sec/industry-sic.mjs']) assert.ok(f.codeFiles.some((x) => x.path === p), p);
});

// ---------------------------------------------------------------- Margen-Regression (eingefrorene 2A-Module)
const e = (start, end, val, filed, form = '10-Q', accn = null) => ({ start, end, val, filed, form, accn: accn || `${filed}-${end}` });
const cfOf = (tags) => ({ facts: { 'us-gaap': Object.fromEntries(Object.entries(tags).map(([t, units]) => [t, { units }])) } });
test('MR11-T-MARGIN-YTD: Bruttogewinn nur als Halbjahreswert -> keine Quartalsmarge (YTD wird nie als Quartal gelesen)', () => {
  const f = extractCompanyFacts(cfOf({
    EarningsPerShareDiluted: { 'USD/shares': [e('2023-04-01', '2023-06-30', 1, '2023-08-01')] },
    Revenues: { USD: [e('2023-04-01', '2023-06-30', 100, '2023-08-01'), e('2023-01-01', '2023-06-30', 190, '2023-08-01')] },
    GrossProfit: { USD: [e('2023-01-01', '2023-06-30', 80, '2023-08-01')] },
  }));
  assert.equal(f.gp.length, 0);
  assert.equal(marginsAt(f, '2023-08-02', '2023-06-30', 14).gross.margin, null);
});
test('MR11-T-MARGIN-AMEND: spaetere Aenderung (10-Q/A) und Vergleichsspalten aendern die Marge nicht', () => {
  const f = extractCompanyFacts(cfOf({
    EarningsPerShareDiluted: { 'USD/shares': [e('2023-01-01', '2023-03-31', 1, '2023-05-01')] },
    Revenues: { USD: [e('2023-01-01', '2023-03-31', 100, '2023-05-01'), e('2023-01-01', '2023-03-31', 80, '2023-06-20', '10-Q/A'), e('2023-01-01', '2023-03-31', 90, '2024-05-01')] },
    GrossProfit: { USD: [e('2023-01-01', '2023-03-31', 40, '2023-05-01')] },
  }));
  assert.equal(marginsAt(f, '2024-06-01', '2023-03-31', 14).gross.margin, 0.4);
});
test('MR11-T-MARGIN-UNIT: Zaehler und Umsatz nur in derselben Waehrung (keine Mischung)', () => {
  const f = extractCompanyFacts(cfOf({
    EarningsPerShareDiluted: { 'USD/shares': [e('2023-01-01', '2023-03-31', 1, '2023-05-01')] },
    Revenues: { USD: [e('2023-01-01', '2023-03-31', 100, '2023-05-01'), e('2022-01-01', '2022-03-31', 90, '2022-05-01')] },
    GrossProfit: { EUR: [e('2023-01-01', '2023-03-31', 40, '2023-05-01')] },
  }));
  assert.equal(f.units.money, 'USD'); assert.equal(f.gp.length, 0);
  assert.equal(marginsAt(f, '2023-05-02', '2023-03-31', 14).gross.margin, null);
});
test('MR11-T-MARGIN-Q4: Q4-Marge aus abgeleiteten Werten (Jahr - 3 Quartale) erst nach dem 10-K sichtbar', () => {
  const qs = (v) => [e('2023-01-01', '2023-03-31', v, '2023-05-01'), e('2023-04-01', '2023-06-30', v, '2023-08-01'), e('2023-07-01', '2023-09-30', v, '2023-11-01')];
  const f = extractCompanyFacts(cfOf({
    EarningsPerShareDiluted: { 'USD/shares': [e('2023-01-01', '2023-03-31', 1, '2023-05-01')] },
    Revenues: { USD: [...qs(100), e('2023-01-01', '2023-12-31', 500, '2024-02-20', '10-K')] },
    GrossProfit: { USD: [...qs(40), e('2023-01-01', '2023-12-31', 230, '2024-02-20', '10-K')] },
  }));
  const q4 = f.gp.find((r) => r[ROW.END] === '2023-12-31');
  assert.equal(q4[ROW.DERIVED], 1); assert.equal(q4[ROW.VALUE], 110);
  assert.equal(marginsAt(f, '2024-02-20', '2023-12-31', 14).gross.margin, null);
  assert.equal(marginsAt(f, '2024-02-21', '2023-12-31', 14).gross.margin, 110 / 200);
});
test('MR11-T-MARGIN-PERIOD: Marge nur bei gleichem Periodenende (Toleranz), Umsatz <= 0 ergibt keine Marge', () => {
  const r = (end, v, filed) => [end, v, filed, 'a' + end, '10-Q', 0, 'T', null];
  const fund = { rev: [r('2023-03-31', 100, '2023-05-01'), r('2023-06-30', 0, '2023-08-01')], gp: [r('2023-04-30', 40, '2023-05-01'), r('2023-06-30', 10, '2023-08-01')], opinc: [], ni: [] };
  assert.equal(marginsAt(fund, '2023-09-01', '2023-03-31', 14).gross.margin, null, 'Zaehler 30 Tage versetzt');
  assert.equal(marginsAt(fund, '2023-09-01', '2023-06-30', 14).gross.margin, null, 'Umsatz 0');
  assert.equal(quarterlyFirst([e('2023-01-01', '2023-03-31', 5, '2023-05-01', '10-K')], 'T').length, 1, 'Quartalswert aus einem 10-K zaehlt (Formular periodisch)');
});
