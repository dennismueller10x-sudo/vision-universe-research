/** Official NasdaqTrader current listing/type evidence. Listed preferred ACT
 * symbols use '$' plus the venue's class token. Only an explicitly preferred
 * baseline may map '-P-' to that token; classes/series are never discarded.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const VENUE = { N: 'XNYS', A: 'XASE', P: 'ARCX', Z: 'BATS', V: 'IEXG' };
function role(name, etf, testIssue) {
  if (testIssue === 'Y') return 'TEST_SECURITY';
  if (/\bETNs?\b|exchange[- ]traded notes?/i.test(name)) return 'ETN';
  if (etf === 'Y') return 'ETF';
  if (/\bwarrants?\b/i.test(name)) return 'WARRANT';
  if (/\bpreferred\b|\bpreference\b|\bperp\.? pfd\b/i.test(name)) return 'PREFERRED';
  if (/\bunits?\b/i.test(name)) return 'UNIT';
  if (/\brights?\b/i.test(name)) return 'RIGHT';
  if (/common stock|ordinary shares?|class [a-z] (?:common )?shares/i.test(name)) return 'EQUITY_COMMON';
  return 'UNKNOWN';
}
export function summarizeUSListingEvidence(directory, rows, options = {}) {
  if (!Array.isArray(directory?.rows) || !Array.isArray(rows) || new Set(rows.map(r => r.securityId)).size !== rows.length)
    throw new Error('Official directory rows and unique investigated identities required');
  const sourceDay = footer => {
    const m = /^File Creation Time: (\d{2})(\d{2})(\d{4})/.exec(footer || ''); return m ? m[3] + '-' + m[1] + '-' + m[2] : null;
  };
  const complete = ['nasdaqlisted.txt', 'otherlisted.txt'].every(file => directory.sources?.some(s => s.status === 'FETCHED' &&
    s.url === 'https://www.nasdaqtrader.com/dynamic/SymDir/' + file && sourceDay(s.footer) === options.asOfDate));
  const listed = directory.rows.map(raw => ({ symbol: raw.Symbol || raw['ACT Symbol'],
    mic: raw._source === 'nasdaqlisted.txt' ? 'XNAS' : VENUE[raw.Exchange] || null,
    securityName: raw['Security Name'], etfFlag: raw.ETF, testIssue: raw['Test Issue'],
    cqsSymbol: raw['CQS Symbol'] || null, nasdaqSymbol: raw['NASDAQ Symbol'] || raw.Symbol || null,
    role: role(raw['Security Name'] || '', raw.ETF, raw['Test Issue']), source: raw._source }));
  const bySymbol = new Map(); for (const row of listed) { const a = bySymbol.get(row.symbol) || []; a.push(row); bySymbol.set(row.symbol, a); }
  const results = rows.map(r => {
    const preferred = r.baselineInstrumentType === 'PREFERRED' ? /^(.*)-P-([A-Z])$/.exec(r.providerSymbol) : null;
    const queries = [r.providerSymbol, ...(preferred ? [preferred[1] + '$' + preferred[2]] : [])];
    const candidates = queries.flatMap(s => bySymbol.get(s) || []);
    const selected = candidates.length === 1 ? candidates[0] : null;
    const preferredClassTokenVerified = Boolean(preferred && selected?.symbol === preferred[1] + '$' + preferred[2] && selected.role === 'PREFERRED');
    return { securityId: r.securityId, ticker: r.ticker, expectedMics: r.expectedMics,
      publicDirectoryStatus: selected ? 'CURRENT_LISTING_OBSERVED' : candidates.length ? 'AMBIGUOUS_CURRENT_LISTING' :
        complete ? 'ABSENT_FROM_CURRENT_PRIMARY_LISTING_DIRECTORY_NOT_PROVEN_DELISTED' : 'PUBLIC_DIRECTORY_INCOMPLETE',
      currentListing: selected, baselineVenueMatches: selected ? r.expectedMics.includes(selected.mic) : null,
      preferredClassTokenVerified, preferredToken: preferredClassTokenVerified ? preferred[2] : null,
      providerAlias: preferredClassTokenVerified ? preferred[1] + '-P' + preferred[2] : null,
      genuineCommonEquityRoleObserved: selected?.role === 'EQUITY_COMMON',
      currentProviderUnavailableProven: false };
  });
  return { schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(),
    protectedBaselineSource: options.baselineSource || null, scope: 'OFFICIAL_CURRENT_PRIMARY_US_LISTING_AND_INSTRUMENT_ROLE_EVIDENCE',
    retrievedAt: directory.retrievedAt, sources: directory.sources, completePublicDirectory: complete,
    totals: { investigated: results.length, currentListed: results.filter(r => r.currentListing).length,
      commonEquityRoleObserved: results.filter(r => r.genuineCommonEquityRoleObserved).length,
      verifiedPreferredClassTokens: results.filter(r => r.preferredClassTokenVerified).length,
      baselineVenueDisagreements: results.filter(r => r.baselineVenueMatches === false).length,
      providerUnavailableProven: 0 },
    limitations: ['Primary listing membership is independent exchange evidence, not provider price availability.',
      'Public directory absence is not proof of delisting; OTC and some historical instruments are outside this directory.',
      'ETF flags can include ETNs, so explicit ETN class descriptions take priority.',
      'Preferred class-token mappings preserve the full token and require explicit preferred class evidence.'], rows: results };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.directory) throw new Error('--directory=public-NasdaqTrader-snapshot.json required');
  const load = p => JSON.parse(readFileSync(resolve(p))), unmatched = load('reports/marketstack/us_marketstack_unmatched_classification.json'),
    quality = load('reports/marketstack/us_marketstack_quality_flags.json');
  const out = summarizeUSListingEvidence(load(args.directory), [...unmatched.rows, ...quality.rows], { baselineSource: unmatched.protectedBaselineSource,
    asOfDate: unmatched.asOfDate });
  writeFileSync(resolve(args.out || 'reports/marketstack/us_current_listing_evidence.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out.totals));
}
