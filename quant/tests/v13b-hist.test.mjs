// V13b HIST - fast tests without private data: frozen-rule hashes, published adjudication / registers / coverage envelopes,
// the consideration patterns of spx_terminal.py and the equivalence of qualify_110.py with qualify.py when nothing is adjudicated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DIR = path.join(ROOT, 'docs/quant-recovery/v13b/hist');
const J = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(DIR, f))).digest('hex');

test('frozen rule files match their committed SHA-256', () => {
  for (const f of ['protocol-amendment-1.1.0', 'spx-terminal-rules-1.0.0', 'spx-terminal-rules-1.0.1']) {
    const want = fs.readFileSync(path.join(DIR, f + '.sha256'), 'utf8').split(/\s+/)[0];
    assert.equal(sha(f + '.json'), want, f);
  }
  assert.equal(J('spx-terminal-rules-1.0.1.json').amends['spx-terminal-rules-1.0.0.json'], sha('spx-terminal-rules-1.0.0.json'));
  assert.equal(J('crash-adjudication-1.1.0.json').protocolSha256, sha('protocol-amendment-1.1.0.json'));
});

test('crash adjudication: 28 chains, no verification error, every quote <= 300 chars, A/B need passing checks', () => {
  const a = J('crash-adjudication-1.1.0.json');
  assert.equal(a.cases.length, 28);
  assert.deepEqual(a.errors, []);
  assert.equal(a.chainDecisions.ADJUDICATED_RESOLVED + a.chainDecisions.STAYS_CA_UNRESOLVED, 28);
  for (const c of a.cases) {
    for (const j of c.jumps) {
      for (const e of j.evidence) { assert.ok(e.quote.length <= 300); assert.ok(e.quoteFound); }
      if (j.class !== 'C_UNRESOLVED') { assert.ok(j.evidence.length > 0); assert.ok(Object.values(j.checks).every(v => v === true)); }
    }
    assert.equal(c.chainDecision === 'ADJUDICATED_RESOLVED', c.jumps.every(j => j.class !== 'C_UNRESOLVED'));
  }
});

test('register 1.1.0 changes only adjudicated chains and keeps register 1.0.0 counts as countsBefore', () => {
  const r = J('register-1.1.0.json');
  const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/quant-recovery/v13/delisted/register-1.0.0.json'), 'utf8'));
  assert.deepEqual(r.countsBefore, old.counts);
  assert.equal(Object.values(r.counts).reduce((s, v) => s + v, 0), r.rows.length);
  const adm = new Set(J('crash-adjudication-1.1.0.json').cases.filter(c => c.chainDecision === 'ADJUDICATED_RESOLVED').map(c => c.chainId));
  const byId = new Map(old.rows.map(x => [x[0], x]));
  let changed = 0;
  for (const row of r.rows) {
    if (JSON.stringify(row.slice(0, 10)) !== JSON.stringify(byId.get(row[0]))) { changed++; assert.ok(adm.has(row[0]), row[0]); }
  }
  assert.equal(changed, r.changedChains.filter(c => !c.unchangedRow).length);
  assert.equal(r.basedOn.reproducedUnchangedRows, r.rows.length - changed);
});

test('SPX terminal registers: scope, accepted rows carry evidence, completion and a return; review flags exist', () => {
  for (const v of ['1.0.0', '1.0.1']) {
    const r = J(`spx-terminal-register-${v}.json`);
    assert.equal(r.scopeRows, 502);
    assert.equal(r.rows.length, 502);
    for (const x of r.rows) {
      if (x.status === 'BOUNDED') { assert.ok(x.reason); assert.equal(x.return, undefined); continue; }
      assert.match(x.status, /^TERMINAL_(CASH|STOCK|MIXED)$/);
      assert.ok(x.evidence.quote.length <= 300 && x.completion && Number.isFinite(x.return));
      assert.ok(x.return + 1 >= 1 / 3 && x.return + 1 <= 3);
    }
  }
  const rev = J('spx-terminal-review-1.0.0.json');
  assert.equal(rev['register_1.0.0'].accepted, J('spx-terminal-register-1.0.0.json').rows.filter(x => x.status !== 'BOUNDED').length);
});

test('coverage file covers 1995-2009 and the independent check passed without failures', () => {
  const c = J('spx-terminal-coverage-1.0.0.json');
  assert.deepEqual(Object.keys(c.gapByYear), Array.from({ length: 15 }, (_, i) => String(1995 + i)));
  const p = J('python-check-1.0.0.json');
  assert.equal(p.failed, 0);
  assert.ok(p.checks > 1000);
});

const PY = (code) => execFileSync('python3', ['-I', '-B', '-c', code], { encoding: 'utf8', cwd: ROOT });

test('consideration patterns (spx_terminal.analyse) on synthetic sentences', () => {
  const out = JSON.parse(PY(`
import sys, json; sys.path.insert(0, 'scripts/quant/v13b/hist')
import spx_terminal as T
t = {'cash': "each outstanding share of Common Stock will be converted into the right to receive $45.50 in cash, without interest. ",
     'stock': "each share of XYZ common stock will be converted into the right to receive .45 shares of Acme common stock. ",
     'mixed': "each share was converted into the right to receive $39.90 in cash and 0.6272 Teva ADSs. ",
     'election': "each share will be converted into the right to receive, at the election of the holder, $30.00 in cash or 1.2 shares of Acme common stock. ",
     'preferred': "Offer to purchase all outstanding shares of series A cumulative convertible stock (the Preferred Shares) at a price of $77.29 per share, net to the seller in cash. ",
     'raised': "Purchaser amended the Offer to increase the offer price to $28.00 per Share, net to the seller in cash. The Offer to Purchase all Shares at $25.00 per Share, net to the seller in cash. "}
print(json.dumps({k: [T.analyse(v)['kind'], T.analyse(v).get('cash'), T.analyse(v).get('ratio')] for k, v in t.items()}))`));
  assert.deepEqual(out.cash, ['CASH', [45.5], []]);
  assert.deepEqual(out.stock, ['STOCK', [], [0.45]]);
  assert.deepEqual(out.mixed, ['MIXED', [39.9], [0.6272]]);
  assert.equal(out.election[0], 'AMBIGUOUS');
  assert.equal(out.preferred[0], null);
  assert.deepEqual(out.raised, ['CASH', [28], []]);
});

test('qualify_110.qualify_chain without adjudication equals qualify.py on synthetic chains; an A-adjudicated jump is accepted', () => {
  const out = JSON.parse(PY(`
import sys, json, importlib.util, datetime as dt
def load(p, n):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
Q = load('scripts/quant/v13/delisted/qualify.py', 'q'); N = load('scripts/quant/v13b/hist/qualify_110.py', 'n')
d0 = dt.date(2015, 1, 5); rows = []
for i in range(420):
    d = d0 + dt.timedelta(days=i + 2 * (i // 5))
    c = 10.0 if i < 300 else 4.9
    rows.append([d.isoformat(), c, c, 1000, None, 1.0])
s = {'ticker': 'T', 'cols': ['date', 'close', 'adjClose', 'volume', 'divCash', 'splitFactor'], 'rows': rows, 'meta': {'startDate': rows[0][0]}}
ch = {'startDate': rows[0][0], 'endDate': rows[-1][0], 'providerEnd': rows[-1][0], 'link': {'grade': 'HIGH_CURRENT_MAP', 'cik': '1'}, 'endSource': 'PROVIDER'}
a = Q.qualify_chain(ch, s, {}, {})[0]['status']; b = N.qualify_chain(Q, ch, s, {}, {}, {})[0]['status']
c = N.qualify_chain(Q, ch, s, {}, {}, {rows[300][0]: {'class': 'A_REAL_PRICE_EVENT', 'subClass': None, 'perShare': None}})[0]['status']
print(json.dumps([a, b, c]))`));
  assert.deepEqual(out, ['CA_UNRESOLVED', 'CA_UNRESOLVED', 'PRICE_ONLY_CENSORED_END']);
});
