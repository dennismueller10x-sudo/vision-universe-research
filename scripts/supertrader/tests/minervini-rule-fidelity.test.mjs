// Minervini Rule Fidelity RF1 – Regressionstests der Forschungsversion 1.2.0-rf1 (MR-SEPA-10, Turnaround-Klausel).
// Synthetische Faelle; keine historischen Gewinner als Fixture. Die Wirkung auf die eingefrorenen
// Ground-Truth-Faelle wird NICHT hier, sondern in rf1-validate.mjs gegen die Praeregistrierung geprueft.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { P, PARAM_TABLE } from '../replication/minervini-1.1/params.mjs';
import { ROW } from '../replication/minervini/sec-facts.mjs';
import { evaluateSepa } from '../replication/minervini/sepa.mjs';
import { evaluateSepaRf1, ttmSeries, VERSION } from '../replication/minervini-1.2-rf1/sepa-turnaround.mjs';
import { verifyFreeze } from '../replication/minervini-1.1/freeze.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const noSplit = () => 1;
const filedOf = (end) => new Date(Date.parse(end) + 40 * 864e5).toISOString().slice(0, 10);
const row = (end, val, tag = 'EarningsPerShareDiluted', extra = {}) => [end, val, extra.filed || filedOf(end), 'a-' + end, '10-Q', extra.derived || 0, tag, extra.from || null];
const ENDS = ['2020-03-31', '2020-06-30', '2020-09-30', '2020-12-31', '2021-03-31', '2021-06-30', '2021-09-30', '2021-12-31', '2022-03-31', '2022-06-30', '2022-09-30', '2022-12-31', '2023-03-31'];
// eps: Werte je Quartal in ENDS-Reihenfolge; rev: Umsatz je Quartal (Standard: steigt stetig, also gegenueber dem Vorjahresquartal)
function fund(eps, rev = ENDS.map((_, i) => 100 + 3 * i)) {
  return { eps: ENDS.map((e, i) => row(e, eps[i])), rev: ENDS.map((e, i) => row(e, rev[i], 'Revenues')), gp: [], opinc: [], ni: [] };
}
const EXEC = '2023-06-01';

test('RF1-T-VERSION: Forschungsversion, nie live', () => {
  assert.equal(VERSION, 'minervini-adaptation-1.2.0-rf1');
});

test('RF1-T-DELEGATE: positive Basis -> Ergebnis bitgleich 1.1.0 (Pass und Ablehnung)', () => {
  const pass = fund([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.3, 1.5]);
  const lowGrowth = fund([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.05, 1.1]);
  const noAccel = fund([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1.3]);
  for (const f of [pass, lowGrowth, noAccel]) {
    assert.deepEqual(evaluateSepaRf1(f, EXEC, noSplit, P), evaluateSepa(f, EXEC, noSplit, P));
    assert.deepEqual(evaluateSepaRf1(f, EXEC, noSplit, P, { acceleration: 'SWING' }), evaluateSepa(f, EXEC, noSplit, P));
  }
  assert.equal(evaluateSepaRf1(null, EXEC, noSplit, P).reason, 'SEPA_DATA_MISSING');
  assert.equal(evaluateSepaRf1(pass, '2024-06-01', noSplit, P).reason, 'SEPA_STALE');
});

function turnaround({ base = -0.5, cur = 0.2, revCur = 110, revBase = 100, prevBase = 1, prev = 1.2 } = {}) {
  // q0 = 2023-03-31, Vorjahresquartal 2022-03-31. Vorquartal 2022-12-31 mit Vorjahr 2021-12-31.
  const eps = [1, 1, 1, 1, 1, 1, 1, prevBase, base, 0.1, 0.1, prev, cur];
  const rev = ENDS.map((e) => (e === '2023-03-31' ? revCur : e === '2022-03-31' ? revBase : 100));
  return fund(eps, rev);
}

test('RF1-T-TA: Wende (Vorjahr -0.50, jetzt +0.20) -> T-A, ok', () => {
  const f = turnaround();
  assert.equal(evaluateSepa(f, EXEC, noSplit, P).ruleId, 'MR-SEPA-10');
  const r = evaluateSepaRf1(f, EXEC, noSplit, P);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.facts.turnaround.branch, 'T-A');
  assert.equal(r.facts.epsGrowth, null, 'keine Wachstumsrate auf nichtpositiver Basis');
  assert.ok(r.facts.revGrowth > 0);
});

test('RF1-T-TA-ZERO: Vorjahres-EPS genau 0 und jetzt Gewinn -> T-A (Nachtrag A1)', () => {
  assert.equal(evaluateSepaRf1(turnaround({ base: 0 }), EXEC, noSplit, P).ok, true);
});

test('RF1-T-LOSS-LOSS: Verlust bleibt Verlust (enger, gleich, weiter) -> weiterhin MR-SEPA-10', () => {
  for (const [base, cur] of [[-0.5, -0.2], [-0.5, -0.5], [-0.5, -0.8], [-0.5, 0]]) {
    const r = evaluateSepaRf1(turnaround({ base, cur }), EXEC, noSplit, P);
    assert.equal(r.ok, false, `${base} -> ${cur}`);
    assert.equal(r.ruleId, 'MR-SEPA-10'); assert.equal(r.reason, 'SEPA_BASE_NOT_POSITIVE');
  }
});

test('RF1-T-REVENUE: Umsatzregel gilt im Turnaround-Zweig unveraendert', () => {
  const r = evaluateSepaRf1(turnaround({ revCur: 95, revBase: 100 }), EXEC, noSplit, P);
  assert.equal(r.ok, false); assert.equal(r.ruleId, 'MR-SEPA-04');
  const g = evaluateSepaRf1(turnaround({ revCur: 100, revBase: 100 }), EXEC, noSplit, P);
  assert.equal(g.ruleId, 'MR-SEPA-04', 'gleicher Umsatz ist kein Wachstum');
});

test('RF1-T-PIT: nicht sichtbare Werte zaehlen nicht (Einreichung am Ausfuehrungstag ist unsichtbar)', () => {
  const f = turnaround();
  const filed = f.eps.at(-1)[ROW.FILED];
  const same = evaluateSepaRf1(f, filed, noSplit, P);
  assert.equal(same.facts.quarterEnd, '2022-12-31', 'am Einreichungstag ist q0 noch das Vorquartal');
  const next = new Date(Date.parse(filed) + 864e5).toISOString().slice(0, 10);
  assert.equal(evaluateSepaRf1(f, next, noSplit, P).ok, true);
});

test('RF1-T-TB: Verlustquartal ohne Gewinn, aber besser als Vorjahr und TTM auf Altgipfel -> T-B', () => {
  // frueherer Gipfel: TTM 4.0 (je Quartal 1.0). Vorjahr -0.2, jetzt -0.1 (besser), TTM aber nur dann >= Gipfel, wenn Rest hoch ist
  const eps = [1, 1, 1, 1, 1, 1, 1, 1, -0.2, 2.0, 2.0, 2.0, -0.1];
  const r = evaluateSepaRf1(fund(eps), EXEC, noSplit, P);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.facts.turnaround.branch, 'T-B');
  assert.ok(r.facts.turnaround.ttm >= r.facts.turnaround.peak && r.facts.turnaround.peak > 0);
});

test('RF1-T-TB-NOPEAK: ohne positive Vorgeschichte (reiner Verlustverlauf) ist T-B nicht erfuellbar', () => {
  const eps = [-1, -1, -1, -1, -1, -1, -1, -1, -0.5, -0.4, -0.3, -0.2, -0.1];
  const r = evaluateSepaRf1(fund(eps), EXEC, noSplit, P);
  assert.equal(r.ok, false); assert.equal(r.facts.turnaround.branch, null);
});

test('RF1-T-TB-NOTUP: q0 nicht besser als das Vorjahresquartal -> T-B scheitert trotz Rekord-TTM (Nachtrag A1)', () => {
  const eps = [1, 1, 1, 1, 1, 1, 1, 1, -0.1, 3.0, 3.0, 3.0, -0.2];
  const r = evaluateSepaRf1(fund(eps), EXEC, noSplit, P);
  assert.equal(r.ok, false); assert.equal(r.ruleId, 'MR-SEPA-10');
});

test('RF1-T-TTM-SPLIT: aeltere EPS werden mit dem Split-Verhaeltnis auf die Aktienbasis von q0 gebracht', () => {
  const f = fund([1, 1, 1, 1, 1, 1, 1, 1, -0.2, 2.0, 2.0, 2.0, -0.1]);
  const half = (from, to) => (from < '2022-09-01' && to >= '2022-09-01' ? 2 : 1); // 2:1-Split am 2022-09-01
  const q0 = f.eps.at(-1);
  const a = ttmSeries(f.eps, q0, noSplit, 20).get('2023-03-31');
  const b = ttmSeries(f.eps, q0, half, 20).get('2023-03-31');
  assert.ok(b < a, 'nach dem Split ist die Summe auf der neuen Basis kleiner');
  const unknown = () => null;
  assert.equal(ttmSeries(f.eps, q0, unknown, 20).get('2023-03-31'), undefined, 'unbekannter Split -> kein TTM');
});

test('RF1-T-V2-SWING: Sensitivitaet verlangt Beschleunigung nach Swing-Konvention', () => {
  // g0 = (0.2+0.5)/0.5 = 1.4; Vorquartal: 1.2 gegen Basis 1 -> 0.2 -> beschleunigt
  assert.equal(evaluateSepaRf1(turnaround(), EXEC, noSplit, P, { acceleration: 'SWING' }).ok, true);
  // Vorquartal sehr stark (3.0 gegen 1 = +200 %) -> g0 (1.4) nicht groesser
  const r = evaluateSepaRf1(turnaround({ prev: 3.0 }), EXEC, noSplit, P, { acceleration: 'SWING' });
  assert.equal(r.ruleId, 'MR-SEPA-02'); assert.equal(r.reason, 'SEPA_NO_ACCELERATION');
  // V1 verzichtet auf die Beschleunigung
  assert.equal(evaluateSepaRf1(turnaround({ prev: 3.0 }), EXEC, noSplit, P).ok, true);
});

test('RF1-T-NO-NEW-PARAMETER: die Forschungsversion nutzt nur Parameter des Regelbuchs 1.1.0', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/supertrader/replication/minervini-1.2-rf1/sepa-turnaround.mjs'), 'utf8');
  const used = [...src.matchAll(/P\['([^']+)'\]/g)].map((m) => m[1]);
  assert.ok(used.length >= 2);
  for (const name of used) assert.ok(PARAM_TABLE[name], `Parameter ${name} ohne Regelbuch-Eintrag`);
});

test('RF1-T-FROZEN: eingefrorene Engine-Dateien 1.1.0 und Fallliste sind unveraendert', () => {
  const v = verifyFreeze();
  assert.equal(v.ok, true, JSON.stringify(v).slice(0, 400));
  const pre = JSON.parse(fs.readFileSync(path.join(root, 'scripts/supertrader/fidelity/MINERVINI-RULE-FIDELITY-PREREG.json'), 'utf8'));
  const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
  assert.equal(sha(pre.validationSet.cases), pre.validationSet.casesSha256);
  assert.equal(sha(pre.validationSet.frozenResults), pre.validationSet.frozenResultsSha256);
});
