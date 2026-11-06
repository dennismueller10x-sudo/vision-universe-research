'use strict';
// Holdout 2008–2015 (Strang H): Protokoll gepinnt, Kandidaten fest, Einmal-Ledger, Wochenabgleich. Synthetisch, kein Netz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const PIN = require('./protocol-pin.cjs');
const QH = require('./quant-holdout.cjs');

const protocolBytes = () => fs.readFileSync(path.join(ROOT, 'docs/research/holdout/PROTOKOLL-2008-2015.json'));

test('HO-1: Protokoll vor dem Lauf festgeschrieben (SHA-256 = Pin), Zeitraum 2008–2015, Holm über 12, keine Variantensuche', () => {
  assert.equal(crypto.createHash('sha256').update(protocolBytes()).digest('hex'), PIN.PROTOCOL_SHA256);
  const p = JSON.parse(protocolBytes());
  assert.deepEqual([p.window.from, p.window.to], ['2008-01-02', '2015-12-31']);
  assert.equal(p.candidates.supertrader.length, 11); assert.equal(p.candidates.quant.length, 1);
  assert.deepEqual(p.candidates.notTestable.map((x) => x.id), ['C09', 'C10']);
  const ids = [...p.candidates.supertrader.map((x) => x.id), ...p.candidates.notTestable.map((x) => x.id)].sort();
  assert.deepEqual(ids, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13'], 'alle 13 Methoden genannt');
  assert.match(p.statistics.multipleTesting, /12 primären Hypothesen/);
  assert.match(p.singleUse, /genau einmal/);
  assert.ok(p.limitations.some((x) => /Survivorship/.test(x) && /2008–2013/.test(x)), 'Lücke delisteter Titel 2008–2013 ausdrücklich');
  assert.ok(p.limitations.some((x) => /Bereits geöffnet/.test(x)), 'frühere Öffnung offengelegt');
  assert.equal(p.data.supertraderSnapshotId, 'sts1-85959e4bab0681baa6ed221bee94821e');
  assert.equal(p.label, 'Forschung, nicht zertifiziert');
});

test('HO-2: Quant-Kandidat ist genau die E3-Variante Q-value-momentum-N20-W13-F0, unverändert', () => {
  const p = JSON.parse(protocolBytes()), v = QH.holdoutVariant(p);
  assert.equal(v.id, 'Q-value-momentum-N20-W13-F0'); assert.equal(v.profileId, 'value-momentum'); assert.equal(v.n, 20); assert.equal(v.weeks, 13); assert.equal(v.filter, false);
  assert.throws(() => QH.holdoutVariant({ candidates: { quant: [{ id: 'Q-value-momentum-N20-W13-F0' }, { id: 'Q-garp-N20-W13-F0' }] } }), /QUANT_CANDIDATES_NOT_ONE/);
});

test('HO-3: Supertrader-Methoden aus dem Protokoll sind die 11 SF6-Referenzen; Protokolländerung wird erkannt', async () => {
  const H = await import(path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-st-holdout.mjs'));
  const P = H.loadProtocol();
  assert.deepEqual(P.methods, ['TURTLE_S1', 'TURTLE_S2', 'DARVAS', 'WEINSTEIN_INVESTOR', 'WEINSTEIN_TRADER', 'MINERVINI_SEPA', 'MINERVINI_POWER_PLAY', 'KK_BREAKOUT', 'POCKET_PIVOT', 'BUYABLE_GAP_UP', 'HOLY_GRAIL_W_RAS97']);
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ho-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs/research/holdout'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'scripts/research/holdout'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs/research/holdout/PROTOKOLL-2008-2015.json'), Buffer.concat([protocolBytes(), Buffer.from(' ')]));
    fs.copyFileSync(path.join(__dirname, 'protocol-pin.cjs'), path.join(tmp, 'scripts/research/holdout/protocol-pin.cjs'));
    assert.throws(() => H.loadProtocol(tmp), /PROTOCOL_CHANGED/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('HO-4: Einmal-Ledger: STARTED vor der Rechnung, SEALED danach; danach verweigert jeder weitere Lauf', async () => {
  const LG = await import(path.join(__dirname, 'ledger.mjs'));
  const store = new Map(), driver = { get: async (k) => store.get(k) ?? null, put: async (k, b) => { store.set(k, Buffer.from(b)); } };
  const n1 = await LG.startAttempt(driver, 'quant', { runId: '1', commit: 'c', protocolSha256: PIN.PROTOCOL_SHA256 });
  // technischer Abbruch vor dem Versiegeln: ein zweiter Versuch ist erlaubt und wird gezählt
  const n2 = await LG.startAttempt(driver, 'quant', { runId: '2', commit: 'c', protocolSha256: PIN.PROTOCOL_SHA256 });
  assert.deepEqual([n1, n2], [1, 2]);
  await LG.sealAttempt(driver, 'quant', n2, { resultSha256: 'x' });
  await assert.rejects(LG.startAttempt(driver, 'quant', { runId: '3' }), /HOLDOUT_ALREADY_SEALED/);
  await assert.rejects(LG.sealAttempt(driver, 'quant', n1, { resultSha256: 'y' }), /LEDGER_ATTEMPT_INVALID|HOLDOUT_ALREADY_SEALED/);
  const l = await LG.readLedger(driver, 'quant');
  assert.deepEqual(l.attempts.map((a) => a.status), ['STARTED', 'SEALED']);
  assert.equal((await LG.readLedger(driver, 'supertrader')).attempts.length, 0, 'getrennte Ledger je Teil');
  assert.ok(Object.values(LG.LEDGER_KEYS).every((k) => k.startsWith('holdout-h-2008-2015/')));
});

test('HO-5: Wochenabgleich Strategie/SPY: letzte Sitzung je ISO-Woche, nur gemeinsame Wochen, kein Auffüllen', async () => {
  const H = await import(path.join(ROOT, 'scripts/supertrader/source-faithful/research/run-st-holdout.mjs'));
  const days = []; for (let t = Date.UTC(2008, 0, 2); t <= Date.UTC(2009, 11, 31); t += 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10)); }
  const curve = days.map((date, i) => ({ date, equity: 100000 * 1.0004 ** i }));
  const spy = days.filter((d) => d !== '2008-03-07').map((date, i) => ({ date, value: 100 * 1.0003 ** i }));
  const pw = H.pairedWeekly(curve, spy);
  assert.equal(pw.returns.length, pw.spyReturns.length); assert.equal(pw.dates.length - 1, pw.returns.length);
  assert.ok(pw.dates.every((d, k) => k === 0 || d > pw.dates[k - 1]));
  assert.ok(pw.returns.every((r) => r > 0));
  const S = require('../edge/study.cjs');
  const t = S.pairedTest(pw.returns, pw.spyReturns, { count: 199 });
  assert.ok(t.logEffect > 0 && t.pLog <= 1);
});

test('HO-6: Ausgaben nur außerhalb des Repositorys; öffentlicher Teil ohne Rendite; Workflows nach ADR-005', () => {
  const q = fs.readFileSync(path.join(__dirname, 'quant-holdout.cjs'), 'utf8');
  assert.match(q, /OUT_INSIDE_REPOSITORY/); assert.match(q, /startAttempt\(driver, 'quant'/); assert.match(q, /sealAttempt\(driver, 'quant'/);
  const w = fs.readFileSync(path.join(ROOT, '.github/workflows/quant-portfolio-research.yml'), 'utf8');
  assert.match(w, /options: \[portfolios, holdout-quant\]/);
  assert.match(w, /IN_MODE: \$\{\{ inputs\.mode \}\}/); assert.doesNotMatch(w, /run: [^\n]*\$\{\{\s*inputs\./);
  assert.match(w, /name: Ergebnis auf den aktuellen Zweig committen\n\s+if: steps\.m\.outputs\.mode != 'holdout-quant'/);
  assert.match(w, /METRIC_IN_PUBLIC_PART/);
});
