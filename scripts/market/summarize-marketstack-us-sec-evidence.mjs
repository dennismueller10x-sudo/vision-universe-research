/** Summarize public official SEC symbol/submissions/Form25 evidence for the
 * investigated US gaps. No Marketstack requests, aliases accepted, or canonical
 * fundamentals/security-status changes. Form25 is scoped to a security class.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const cik = x => /^\d{1,10}$/.test(String(x || '')) ? String(x).padStart(10, '0') : null;
const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x ? x : null;
const sha = x => createHash('sha256').update(x).digest('hex');
const countBy = (rows, fn) => rows.reduce((out, r) => { const k = fn(r) || 'UNKNOWN'; out[k] = (out[k] || 0) + 1; return out; }, {});
const decode = s => s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").trim();
function officialExchangeMic(name) {
  const n = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').replace(/^THE/, '');
  return /^NASDAQ(?:STOCKMARKET)?(?:LLC)?$/.test(n) ? 'XNAS' : /^NEWYORKSTOCKEXCHANGE(?:LLC)?$/.test(n) ? 'XNYS' :
    /^NYSEAMERICAN(?:LLC)?$/.test(n) ? 'XASE' : /^NYSEARCA(?:INC|LLC)?$/.test(n) ? 'ARCX' :
      /^CBOEBZXEXCHANGE(?:INC|LLC)?$/.test(n) ? 'BATS' : null;
}

export function parseForm25XML(xml) {
  if (typeof xml !== 'string' || !/<notificationOfRemoval(?:\s|>)/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
  const tag = (text, name) => { const matches = [...text.matchAll(new RegExp('<' + name + '>([^<]*)</' + name + '>', 'g'))];
    return matches.length === 1 ? decode(matches[0][1]) : null; };
  const issuerBlock = /<issuer>([\s\S]*?)<\/issuer>/.exec(xml)?.[1], exchangeBlock = /<exchange>([\s\S]*?)<\/exchange>/.exec(xml)?.[1];
  if (!issuerBlock || !exchangeBlock) return null;
  const result = { issuerCik: cik(tag(issuerBlock, 'cik')), issuerName: tag(issuerBlock, 'entityName'),
    exchangeCik: cik(tag(exchangeBlock, 'cik')), exchangeName: tag(exchangeBlock, 'entityName'),
    descriptionClassSecurity: tag(xml, 'descriptionClassSecurity'), ruleProvision: tag(xml, 'ruleProvision'), signatureDate: day(tag(xml, 'signatureDate')) };
  return result.issuerCik && result.exchangeCik && result.descriptionClassSecurity ? result : null;
}

function describedClass(description) {
  const common = /common stock|ordinary shares?/i.test(description || ''), warrants = /warrants?/i.test(description || '');
  if (common && warrants) return 'MIXED_SECURITY_CLASSES';
  return warrants ? 'WARRANT' : common ? 'EQUITY_COMMON' : 'OTHER_SECURITY_CLASS';
}

export function summarizeUSSECEvidence(previousMap, currentMap, investigationRows, submissions = {}, form25 = {}, options = {}) {
  const previous = previousMap.byTicker || previousMap, current = currentMap.byTicker || currentMap;
  if (!currentMap.generatedAt || currentMap.status !== 'OK' || !Array.isArray(investigationRows) ||
    new Set(investigationRows.map(r => r.securityId)).size !== investigationRows.length) throw new Error('Current official SEC evidence and unique investigated identities required');
  const byIssuer = new Map(); for (const [ticker, entry] of Object.entries(current)) {
    const id = cik(entry.cik); if (!id) continue; const a = byIssuer.get(id) || []; a.push({ ticker, exchange: entry.exchange || null }); byIssuer.set(id, a);
  }
  const classByIssuer = new Map();
  for (const r of options.allBaselineRows || investigationRows) {
    const id = r.identifiers?.cik, type = r.baselineInstrumentType;
    if (!id || r.identifiers.cikConflict) continue;
    const k = id + ':' + type, a = classByIssuer.get(k) || []; a.push(r.securityId); classByIssuer.set(k, a);
  }
  const bySub = new Map((submissions.rows || []).filter(r => r.status === 'FETCHED').map(r => [r.cik, r]));
  const rows = investigationRows.map(r => {
    const old = previous[r.ticker] || null, now = current[r.ticker] || null, id = r.identifiers?.cik || null;
    const secCikConflict = now && id && cik(now.cik) !== id;
    const sub = id && !r.identifiers?.cikConflict ? bySub.get(id) : null;
    const filings = (form25.rows || []).filter(f => f.status === 'FETCHED' && f.parsed?.issuerCik === id && f.cik === id &&
      f.baselineSymbols?.includes(r.ticker) && day(f.filingDate) && f.filingDate <= options.asOfDate).map(f => {
        const cls = describedClass(f.parsed.descriptionClassSecurity), unique = (classByIssuer.get(id + ':' + cls) || []).length === 1;
        const exchangeMic = officialExchangeMic(f.parsed.exchangeName);
        const classAttributed = cls === r.baselineInstrumentType && unique && !secCikConflict && !r.identifiers?.cikConflict;
        return { form: f.form, filingDate: f.filingDate, accessionNumber: f.accessionNumber, source: f.source, sha256: f.sha256,
          issuerCik: f.parsed.issuerCik, exchangeName: f.parsed.exchangeName, exchangeCik: f.parsed.exchangeCik,
          exchangeMic, baselineVenueMatches: Boolean(exchangeMic && r.expectedMics?.includes(exchangeMic)),
          securityClassDescription: f.parsed.descriptionClassSecurity, describedClass: cls,
          ruleProvision: f.parsed.ruleProvision, classMatchesBaseline: cls === r.baselineInstrumentType,
          classAttribution: classAttributed ?
            'OFFICIAL_CLASS_FILING_SINGLE_PROTECTED_SECURITY_FOR_ISSUER_CLASS' : 'CLASS_OR_IDENTITY_AMBIGUOUS_REVIEW',
          note: 'Filing proves exchange removal notification for the named class, not Marketstack historical unavailability or global cessation of trading.' };
      });
    const classFiled = filings.some(f => f.classAttribution === 'OFFICIAL_CLASS_FILING_SINGLE_PROTECTED_SECURITY_FOR_ISSUER_CLASS');
    const baselineListingFiled = filings.some(f => f.classAttribution === 'OFFICIAL_CLASS_FILING_SINGLE_PROTECTED_SECURITY_FOR_ISSUER_CLASS' && f.baselineVenueMatches);
    const currentIssuerSymbols = byIssuer.get(id) || [], removed = !now && Boolean(old);
    const status = secCikConflict ? 'CURRENT_SEC_CIK_CONFLICT_REVIEW' : classFiled ? 'OFFICIAL_SECURITY_CLASS_DELISTING_FILED' :
      removed && (currentIssuerSymbols.some(s => s.ticker !== r.ticker) || sub?.currentTickers?.some(s => s !== r.ticker)) ? 'CURRENT_SEC_SYMBOL_REMOVED_ISSUER_OTHER_SYMBOLS_REVIEW' :
      removed ? 'CURRENT_SEC_SYMBOL_REMOVED_NOT_PROVEN_DELISTED' : !now ? 'ABSENT_FROM_CURRENT_SEC_NOT_PROVEN_UNAVAILABLE' :
      !old ? 'NEWLY_PRESENT_IN_CURRENT_SEC_MAP' : now.exchange !== old.exchange ? 'OFFICIAL_SEC_VENUE_LABEL_CHANGED' :
      now.name !== old.name ? 'OFFICIAL_SEC_ISSUER_NAME_CHANGED' : 'CURRENT_SEC_SYMBOL_METADATA_UNCHANGED';
    return { securityId: r.securityId, ticker: r.ticker, baselineInstrumentType: r.baselineInstrumentType,
      trustedBaselineCik: id, currentSECStatus: status, currentSECIssuerConflict: Boolean(secCikConflict),
      previousSEC: old ? { cik: cik(old.cik), name: old.name || null, exchange: old.exchange || null } : null,
      currentSEC: now ? { cik: cik(now.cik), name: now.name || null, exchange: now.exchange || null } : null,
      currentIssuerSymbols: currentIssuerSymbols.map(s => ({ ...s, relationship: 'ISSUER_ONLY_NOT_APPROVED_SECURITY_ALIAS' })),
      officialSecurityClassDelistingFiled: classFiled,
      officialBaselineListingRemovalFiled: baselineListingFiled,
      currentSubmissions: sub ? { source: sub.source, sha256: sub.sha256, currentName: sub.currentName || null,
        currentTickers: sub.currentTickers || [], currentExchanges: sub.currentExchanges || [],
        terminationOrDelistingFilings: (sub.terminationOrDelistingFilings || []).map(f => ({ form: f.form,
          filingDate: f.filingDate, accessionNumber: f.accessionNumber, acceptedAt: f.acceptanceDateTime || null })) } : null,
      officialForm25: filings, identityAliasAccepted: false, genuinelyProviderMissing: false };
  });
  return { schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(), asOfDate: options.asOfDate,
    scope: 'CURRENT_PUBLIC_OFFICIAL_SEC_METADATA_FOR_ALL_US_UNMATCHED_AND_QUALITY_RECORDS',
    protectedBaselineSource: options.baselineSource || null,
    sources: { previousSECAsOf: previousMap.generatedAt || null, currentSECAsOf: currentMap.generatedAt,
      currentSECSources: currentMap.sources || null, submissionsRetrievedAt: submissions.retrievedAt || null,
      form25RetrievedAt: form25.retrievedAt || null },
    requests: { marketstackPaid: 0, publicSEC: 1 + (submissions.publicRequests || 0) + (form25.publicRequests || 0) },
    totals: { investigated: rows.length, byCurrentSECStatus: countBy(rows, r => r.currentSECStatus),
      officialSecurityClassDelistingFilings: rows.filter(r => r.officialSecurityClassDelistingFiled).length,
      officialBaselineListingRemovalFilings: rows.filter(r => r.officialBaselineListingRemovalFiled).length,
      aliasesAutomaticallyAccepted: 0, providerUnavailableProven: 0, canonicalWrites: 0 },
    limitations: ['Absence from SEC ticker metadata is not proof of delisting, non-investability or provider unavailability.',
      'CIK is an issuer ID; current issuer tickers are review candidates, never security aliases by themselves.',
      'Form25 affects its named security class and exchange; historical prices and other venues may remain available.',
      'A class filing is attributed only where the protected issuer/class identity is unique; ambiguous classes remain review.',
      'This public-source investigation changes no SEC/PIT fundamentals, canonical listing status, or protected universe membership.'], rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  const load = p => JSON.parse(readFileSync(resolve(p)));
  if (!args.current || !args.submissions || !args.form25) throw new Error('Required --current=SEC-map --submissions=evidence --form25=evidence');
  const previous = load(args.previous || 'quant/data/universe/cik-map.json'), current = load(args.current);
  const unmatched = load(args.unmatched || 'reports/marketstack/us_marketstack_unmatched_classification.json');
  const quality = load(args.quality || 'reports/marketstack/us_marketstack_quality_flags.json');
  const forms = load(args.form25);
  const benchmark = load(args.benchmark || 'reports/marketstack/marketstack_tiingo_us_diff.json');
  const names = new Map(load('quant/data/market/security-master/company-names.json').rows.map(r => [r.securityId, r]));
  const allBaselineRows = benchmark.rows.map(r => {
    const a = cik(previous.byTicker?.[r.ticker]?.cik), b = cik(names.get(r.securityId)?.cik), conflict = a && b && a !== b;
    return { securityId: r.securityId, baselineInstrumentType: r.instrumentType, identifiers: { cik: conflict ? null : a || b,
      cikConflict: Boolean(conflict) } };
  });
  for (const f of forms.rows || []) if (f.status === 'FETCHED' && f.localDocument) {
    const bytes = readFileSync(resolve(f.localDocument));
    if (sha(bytes) !== f.sha256) throw new Error('SEC Form25 source hash mismatch');
    f.parsed = parseForm25XML(bytes.toString('utf8'));
  }
  const result = summarizeUSSECEvidence(previous, current, [...unmatched.rows, ...quality.rows], load(args.submissions), forms,
    { baselineSource: unmatched.protectedBaselineSource, asOfDate: unmatched.asOfDate, allBaselineRows });
  const out = args.out || 'reports/marketstack/us_sec_current_symbol_evidence.json';
  writeFileSync(resolve(out), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ output: out, totals: result.totals, requests: result.requests }));
}
