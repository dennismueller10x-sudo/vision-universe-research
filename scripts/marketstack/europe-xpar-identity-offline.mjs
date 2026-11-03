/** Offline owner evaluation of the sealed diagnostics run 41661792038
 * (owner approval of 03.11.2026, step 1). Zero provider requests.
 *
 * The private recipient key of the audit store is NOT an Actions secret, so
 * this runs only on the owner's machine:
 *   1. download artifact `marketstack-diagnostics-sealed-41661792038`,
 *   2. node scripts/marketstack/europe-xpar-identity-offline.mjs \
 *        --sealed=/abs/path/to/unzipped-artifact --privateKey=/abs/path/key.pem \
 *        [--json=/abs/path/identity.json]
 *
 * The archive is decrypted into a fresh 0700 temp directory outside the
 * repository and deleted again in `finally`. Output (stdout and --json) holds
 * only public identifiers and booleans: catalog ISIN, provider ISIN, MIC,
 * name match, hashes. No prices, no raw bodies, no provider names. */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unsealPrivateEvidence } from './europe-live-private-archive.mjs';

export const VERSION = 'vu-europe-xpar-identity-offline-1';
export const RUN = Object.freeze({ runId: '41661792038', sourceCommit: '88c72f19fe9d09bac739547bedc85bb3191987d0',
  planSha256: 'e2d4194425949f06e0915c16844ead84944b42cfe3f1237b06c17567b39e117e' });
// Same fixed list and search terms as europe-marketstack-diagnostics-once.mjs.
export const PARIS = Object.freeze([
  ['AC.PA', 'Accor'], ['AI.PA', 'Air Liquide'], ['AIR.PA', 'Airbus'], ['CDI.PA', 'Dior'], ['CS.PA', 'AXA'],
  ['DG.PA', 'Vinci'], ['EL.PA', 'Essilor'], ['ERF.PA', 'Eurofins'], ['MC.PA', 'LVMH'], ['SOI.PA', 'Soitec'],
  ['SU.PA', 'Schneider'], ['TEP.PA', 'Teleperformance'], ['VIE.PA', 'Veolia']].map(([symbol, search]) => Object.freeze({ symbol, search })));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = x => createHash('sha256').update(x).digest('hex');
const norm = x => String(x ?? '').normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ').toUpperCase().split(/\s+/).filter(Boolean).join(' ');

/** v2 /tickers/{symbol} answers flat (TickerResponse); older shapes wrap it in data. */
export function tickerObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data) && ('symbol' in body.data || 'isin' in body.data)) return body.data;
  if (Array.isArray(body.data)) return body.data.length === 1 ? body.data[0] : null;
  if ('symbol' in body || 'isin' in body) return body;
  return null;
}
export const micsOf = t => [...new Set([t?.stock_exchange?.mic, ...(Array.isArray(t?.stock_exchanges) ? t.stock_exchanges : []).map(e => e?.mic ?? e?.exchange_mic)].filter(Boolean))];

/** Pure comparison over decrypted responses.jsonl text and the catalog. */
export function compareIdentity(responsesText, catalog) {
  const entries = responsesText.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const bySymbol = new Map();
  for (const s of catalog.securities) {
    const l = s.listings?.find(x => x.listingId === s.primaryListingId) ?? {};
    bySymbol.set(l.providerSymbol ?? s.ticker, { securityId: s.securityId, isin: s.isin, mic: l.mic, identityStatus: s.identity?.status ?? null });
  }
  const rows = PARIS.map(p => {
    const stored = bySymbol.get(p.symbol) ?? {};
    const candidate = p.symbol.replace(/\.PA$/, '.XPAR');
    const hits = entries.filter(e => e.endpoint === '/tickers/' + candidate && e.purpose === 'PARIS_CANDIDATE_METADATA');
    const old = entries.find(e => e.endpoint === '/tickers/' + p.symbol && e.purpose === 'PARIS_OLD_SYMBOL_METADATA');
    const base = { symbol: p.symbol, candidate, securityId: stored.securityId ?? null, catalogIsin: stored.isin ?? null, catalogMic: stored.mic ?? null,
      catalogIdentityStatus: stored.identityStatus, oldSymbolHttp: old?.httpStatus ?? null };
    if (hits.length !== 1) return { ...base, metadataResponses: hits.length, providerIsin: null, providerMics: [], isinMatches: false, micMatches: false,
      symbolMatches: false, nameMatches: false, hasEod: null, bodyHashVerified: false, metadataBodySha256: null, identityProven: false, reason: hits.length ? 'AMBIGUOUS_RESPONSES' : 'NO_CANDIDATE_RESPONSE' };
    const e = hits[0];
    let body = null; try { body = JSON.parse(e.rawText); } catch {}
    const t = tickerObject(body), mics = micsOf(t);
    const bodyHashVerified = typeof e.rawText === 'string' && sha(e.rawText) === e.bodySha256;
    const r = { ...base, metadataResponses: 1, metadataHttp: e.httpStatus, providerIsin: t?.isin ?? null, providerMics: mics,
      isinMatches: !!t?.isin && !!stored.isin && t.isin === stored.isin, micMatches: mics.includes('XPAR'),
      symbolMatches: t?.symbol === candidate, nameMatches: !!t && norm(t.name).includes(norm(p.search)),
      hasEod: t?.has_eod ?? null, bodyHashVerified, metadataBodySha256: e.bodySha256 ?? null };
    r.identityProven = e.httpStatus === 200 && r.isinMatches && r.micMatches && r.symbolMatches && r.nameMatches && bodyHashVerified
      && stored.mic === 'XPAR' && stored.identityStatus === 'VERIFIED';
    r.reason = r.identityProven ? 'ISIN_MIC_SYMBOL_NAME_MATCH' : !t ? 'UNPARSEABLE_METADATA' : !r.isinMatches ? 'ISIN_MISMATCH' : !r.micMatches ? 'MIC_MISMATCH'
      : !r.symbolMatches ? 'SYMBOL_MISMATCH' : !r.nameMatches ? 'NAME_MISMATCH' : !bodyHashVerified ? 'BODY_HASH_UNVERIFIED' : 'CATALOG_NOT_VERIFIED_XPAR';
    return r;
  });
  const proven = rows.filter(r => r.identityProven).map(r => r.candidate);
  return { schema: VERSION, ...RUN, providerRequests: 0, pricesIncluded: false, rawBodiesIncluded: false,
    responsesJsonlSha256: sha(responsesText), catalogSha256: catalog.__sha256 ?? null, rows,
    identityProven: proven.length, identityNotProven: rows.length - proven.length, provenCandidates: proven,
    nextStepEod: proven.length ? { endpoint: '/eod', params: { symbols: proven.join(','), exchange: 'XPAR', date_from: '2026-09-28', date_to: '2026-11-02' }, maxCredits: proven.length } : null };
}

export function formatTable(result) {
  const head = ['symbol', 'candidate', 'catalogIsin', 'providerIsin', 'isin', 'mic', 'name', 'symbol=', 'hash', 'PROVEN'];
  const lines = result.rows.map(r => [r.symbol, r.candidate, r.catalogIsin ?? '-', r.providerIsin ?? '-', r.isinMatches, r.providerMics.join('/') || '-',
    r.nameMatches, r.symbolMatches, r.bodyHashVerified, r.identityProven].map(String));
  const w = head.map((h, i) => Math.max(h.length, ...lines.map(l => l[i].length)));
  const fmt = l => l.map((c, i) => c.padEnd(w[i])).join('  ');
  return [fmt(head), fmt(w.map(n => '-'.repeat(n))), ...lines.map(fmt), '',
    `identity proven: ${result.identityProven}/${result.rows.length}; responses.jsonl sha256 ${result.responsesJsonlSha256}`].join('\n');
}

export async function evaluateSealed({ sealed, privateKey, root = ROOT }) {
  if (!isAbsolute(sealed || '') || !isAbsolute(privateKey || '')) throw Error('USAGE: --sealed=<abs dir> --privateKey=<abs pem> [--json=<abs file>]');
  const envelopeBytes = readFileSync(join(sealed, 'envelope.json'));
  const scratch = mkdtempSync(join(tmpdir(), 'vu-xpar-identity-'));
  try {
    const out = join(scratch, 'plain');
    await unsealPrivateEvidence({ sealedRoot: resolve(sealed), out, privateKeyPath: privateKey, ...RUN });
    const p = join(out, 'responses.jsonl');
    if (!existsSync(p)) throw Error('RESPONSES_JSONL_MISSING');
    const catalogBytes = readFileSync(join(root, 'discover/data/europe/catalog.json'));
    const catalog = JSON.parse(catalogBytes); catalog.__sha256 = sha(catalogBytes);
    return { ...compareIdentity(readFileSync(p, 'utf8'), catalog), envelopeSha256: sha(envelopeBytes) };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
  const result = await evaluateSealed({ sealed: args.sealed, privateKey: args.privateKey });
  console.log(formatTable(result));
  if (args.json) { if (!isAbsolute(args.json)) throw Error('JSON_PATH_MUST_BE_ABSOLUTE'); writeFileSync(args.json, JSON.stringify(result, null, 1) + '\n'); }
}
