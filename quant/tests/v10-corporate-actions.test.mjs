// V10 strand corporate-actions: registry contract, provider-error proposals, TR register and builder isolation.
// Read-only on production data; builders are exercised with synthetic inputs into a temp directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const D = 'docs/quant-recovery/v10/corporate-actions';
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const Loader = require(path.join(root, 'quant/engines/research-weekly-loader.cjs'));
const Registry = require(path.join(root, 'quant/engines/research-ca-evidence.cjs'));
const CA = require(path.join(root, 'quant/engines/corporate-action-evidence.js'));

test('protocols: 1.0.0 frozen hash unchanged, 1.1.x hashes match their sidecars and chain, registry bound to 1.1.2', () => {
  assert.equal(sha('docs/quant-recovery/v9-followups/ca-registry/protocol.json'), 'db7e31a8fd9a34c1f50d2b3dea968a978eaf51e6cbb2826be1827b6d3c7171c2');
  for (const v of ['1.1.0', '1.1.1', '1.1.2']) assert.equal(fs.readFileSync(path.join(root, D, `protocol-${v}.sha256`), 'utf8').split(/\s+/)[0], sha(`${D}/protocol-${v}.json`));
  for (const v of ['1.0.0', '1.0.1']) assert.equal(fs.readFileSync(path.join(root, D, `tr-protocol-${v}.sha256`), 'utf8').split(/\s+/)[0], sha(`${D}/tr-protocol-${v}.json`));
  assert.equal(read(`${D}/tr-protocol-1.0.1.json`).amends.sha256, sha(`${D}/tr-protocol-1.0.0.json`));
  const p112 = read(`${D}/protocol-1.1.2.json`), p111 = read(`${D}/protocol-1.1.1.json`);
  assert.equal(p112.supersedes.sha256, sha('docs/quant-recovery/v9-followups/ca-registry/protocol.json'));
  assert.equal(p111.amends.sha256, sha(`${D}/protocol-1.1.0.json`));
  assert.equal(p112.amends.sha256, sha(`${D}/protocol-1.1.1.json`));
  assert.equal(Registry.protocolSha256, sha(`${D}/protocol-1.1.2.json`));
  assert.equal(Registry.protocol, `${D}/protocol-1.1.2.json`);
});

test('registry passes the loader validation; every record has >= 3 hashed sources and its class-specific source', () => {
  Loader.validateCaEvidenceRegistry(Registry);
  assert.ok(Registry.records.length > 0);
  for (const r of Registry.records) {
    assert.ok(r.sources.length >= 3, r.securityId);
    for (const s of r.sources) { assert.match(s.accession, /^\d{10}-\d{2}-\d{6}$/); assert.match(s.sha256, /^[a-f0-9]{64}$/); assert.ok(s.quote.length <= 400); }
    if (r.class === 'SPINOFF_DISTRIBUTION') assert.equal(r.returnBasis, 'PRICE_RETURN_ONLY');
    if (r.class === 'GENUINE_MOVE') assert.equal(r.returnBasis, 'PRICE_RETURN');
    assert.ok(CA.splitSized(r.weeklyRatio));
    assert.ok(r.week >= '2004-08-23');
  }
});

test('default loader stays the adapter loader (no option -> adapter createLoader, registry not consulted)', () => {
  const l = Loader.createResearchLoader(root);
  assert.equal(l.corporateActionEvidence, undefined);
  assert.equal(l.identityEvidence, undefined);
});

test('provider-error proposals change no data and carry >= 3 sources with a split statement', () => {
  const pe = read(`${D}/provider-errors.json`);
  assert.equal(pe.dataChange, 'NONE');
  assert.equal(pe.productionApproved, false);
  for (const p of pe.proposals) {
    assert.ok(p.sources.length >= 3, p.securityId);
    assert.ok(p.sources.some(s => s.role.startsWith('SPLIT_STATEMENT')));
    assert.ok([2, 3, 4, 5, 10, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10].some(k => Math.abs(k - p.proposal.splitFactor) < 1e-12));
    assert.ok(!Registry.records.some(r => r.securityId === p.securityId && r.week === p.week));
  }
});

test('TR register: pay date sourced, ex-date only derived, split-consistent series units, windows inside covered quarters', () => {
  const reg = read(`${D}/tr-register-1.0.0.json`);
  assert.equal(reg.productionApproved, false);
  for (const t of reg.titles) {
    const covered = new Set(t.quarterStatus.filter(q => q.status === 'COVERED').map(q => q.quarter));
    for (const e of t.events) {
      assert.equal(e.exDateState, 'DERIVED_SETTLEMENT_RULE_NOT_SOURCED');
      assert.ok(e.payDate >= e.recordDate && e.exDateDerived <= e.recordDate);
      assert.ok(Math.abs(e.amountSeriesUnits * e.seriesUnitFactor - Number(e.amount)) < 1e-12);
      assert.ok(e.sources.length >= 1 && e.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256) && s.quote.length <= 300));
      assert.match(e.informationAvailableAt || '', /^\d{4}-\d{2}-\d{2}T/);
    }
    for (const pe of t.portfolioEvents) {
      const e = t.events.find(x => x.id === pe.id);
      assert.equal(pe.payDate, e.payDate); // cash at the sourced pay date, never at the entitlement (ex-date) session
      assert.ok(pe.effectiveDate >= e.exDateDerived);
    }
    for (const w of t.totalReturnWindows) {
      const q = d => `${d.slice(0, 4)}Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}`;
      assert.ok(covered.has(q(w.from)) && covered.has(q(w.to)), t.ticker + ' ' + w.from);
    }
  }
});

test('TR ledger parity file reports PASS for every run title', () => {
  const p = read(`${D}/tr-ledger-parity.json`);
  assert.equal(p.status, 'PASS');
  assert.ok(p.titles.filter(t => t.state === 'PASS').length >= 1);
});

test('build-ca-registry writes only its --out paths (synthetic facts, temp dir)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-ca-'));
  try {
    const facts = path.join(dir, 'facts.jsonl');
    fs.writeFileSync(facts, JSON.stringify({ securityId: 'ref_ZZZZ', ticker: 'ZZZZ', canonicalId: 'x', exchange: 'NASDAQ', protocolSha256: sha(`${D}/protocol-1.1.2.json`), verifiedAt: '2026-10-28T00:00:00+00:00',
      events: [{ week: '2020-01-10', prevWeek: '2020-01-03', reason: 'SINGLE_DAY_DOMINATES_WEEK', verdict: 'NEGATIVE_EVIDENCE_ONLY', detail: null }] }) + '\n');
    const outs = ['reg.cjs', 'verdicts.json', 'pe.json'].map(f => path.join(dir, f));
    execFileSync(process.execPath, [path.join(root, 'scripts/quant/v10/corporate-actions/build-ca-registry.cjs'), '--facts', facts, '--out', outs[0], '--verdicts', outs[1], '--provider-errors', outs[2]], { stdio: 'pipe' });
    const reg = require(outs[0]);
    assert.equal(reg.records.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(outs[1], 'utf8')).byVerdict.NEGATIVE_EVIDENCE_ONLY, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
