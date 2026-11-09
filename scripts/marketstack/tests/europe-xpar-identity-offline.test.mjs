import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealPrivateEvidence } from '../europe-live-private-archive.mjs';
import { compareIdentity, evaluateSealed, formatTable, tickerObject, PARIS, RUN } from '../europe-xpar-identity-offline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const catalog = JSON.parse(readFileSync(join(ROOT, 'discover/data/europe/catalog.json'), 'utf8'));
const isinOf = sym => catalog.securities.find(s => s.listings?.find(l => l.listingId === s.primaryListingId)?.providerSymbol === sym)?.isin;
const sha = x => createHash('sha256').update(x).digest('hex');
const entry = (endpoint, purpose, httpStatus, body) => { const rawText = JSON.stringify(body); return { endpoint, purpose, httpStatus, bodySha256: sha(rawText), rawText }; };
const NAMES = { 'AC.PA': 'ACCOR SA', 'AI.PA': "L'Air Liquide S.A.", 'AIR.PA': 'Airbus SE', 'CDI.PA': 'Christian Dior SE', 'CS.PA': 'AXA SA', 'DG.PA': 'Vinci SA',
  'EL.PA': 'EssilorLuxottica', 'ERF.PA': 'Eurofins Scientific', 'MC.PA': 'LVMH Moet Hennessy', 'SOI.PA': 'Soitec SA', 'SU.PA': 'Schneider Electric SE',
  'TEP.PA': 'Teleperformance SE', 'VIE.PA': 'Veolia Environnement' };
function responses({ mutate = () => {} } = {}) {
  const lines = [];
  for (const p of PARIS) {
    lines.push(entry('/tickers/' + p.symbol, 'PARIS_OLD_SYMBOL_METADATA', 406, { error: { code: 'the_requested_data_is_not_available' } }));
    const cand = p.symbol.replace('.PA', '.XPAR');
    // Flat v2 TickerResponse, as observed (no data wrapper).
    const body = { name: NAMES[p.symbol], symbol: cand, isin: isinOf(p.symbol), has_eod: true, stock_exchange: { name: 'Euronext Paris', mic: 'XPAR' } };
    mutate(p.symbol, body);
    lines.push(entry('/tickers/' + cand, 'PARIS_CANDIDATE_METADATA', 200, body));
  }
  return lines.map(l => JSON.stringify(l)).join('\n') + '\n';
}

test('flat and wrapped ticker shapes are unpacked', () => {
  assert.equal(tickerObject({ symbol: 'A.XPAR', isin: 'X' }).isin, 'X');
  assert.equal(tickerObject({ data: { symbol: 'A.XPAR', isin: 'Y' } }).isin, 'Y');
  assert.equal(tickerObject({ error: { code: 'x' } }), null);
});

test('all 13 match: proven, next step limited to 13 symbols, no prices or names in output', () => {
  const r = compareIdentity(responses(), catalog);
  assert.equal(r.identityProven, 13);
  assert.equal(r.nextStepEod.maxCredits, 13);
  assert.equal(r.nextStepEod.params.symbols.split(',').length, 13);
  const text = JSON.stringify(r) + formatTable(r);
  assert.ok(!/close|rawText|Euronext Paris|Christian Dior SE/.test(text));
});

test('ISIN, MIC, name or hash deviations block only that stock', () => {
  const r = compareIdentity(responses({ mutate: (s, b) => {
    if (s === 'AC.PA') b.isin = 'FR0000000000';
    if (s === 'MC.PA') b.stock_exchange.mic = 'XETR';
    if (s === 'SOI.PA') b.name = 'Something Else';
  } }), catalog);
  const by = Object.fromEntries(r.rows.map(x => [x.symbol, x]));
  assert.equal(by['AC.PA'].reason, 'ISIN_MISMATCH');
  assert.equal(by['MC.PA'].reason, 'MIC_MISMATCH');
  assert.equal(by['SOI.PA'].reason, 'NAME_MISMATCH');
  assert.equal(r.identityProven, 10);
  const tampered = responses().replace('"httpStatus":200', '"httpStatus":200,"x":1').split('\n').map(l => l && JSON.parse(l)).filter(Boolean);
  tampered[1].rawText = tampered[1].rawText.replace('true', 'false');
  const t = compareIdentity(tampered.map(x => JSON.stringify(x)).join('\n'), catalog);
  assert.equal(t.rows[0].reason, 'BODY_HASH_UNVERIFIED');
});

test('sealed archive round trip: decrypts in temp, deletes plaintext, binds the run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xpar-id-test-'));
  try {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    writeFileSync(join(dir, 'pub.pem'), publicKey); writeFileSync(join(dir, 'key.pem'), privateKey);
    mkdirSync(join(dir, 'src')); writeFileSync(join(dir, 'src', 'responses.jsonl'), responses());
    await sealPrivateEvidence({ sourceRoot: join(dir, 'src'), out: join(dir, 'sealed'), publicKeyPath: join(dir, 'pub.pem'), ...RUN });
    const before = readdirSync(tmpdir()).filter(n => n.startsWith('vu-xpar-identity-')).length;
    const r = await evaluateSealed({ sealed: join(dir, 'sealed'), privateKey: join(dir, 'key.pem') });
    assert.equal(r.identityProven, 13);
    assert.equal(r.runId, '41661792038');
    assert.equal(readdirSync(tmpdir()).filter(n => n.startsWith('vu-xpar-identity-')).length, before, 'plaintext removed');
    await assert.rejects(evaluateSealed({ sealed: 'rel', privateKey: join(dir, 'key.pem') }), /USAGE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
