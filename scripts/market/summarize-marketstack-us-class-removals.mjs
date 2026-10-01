/** Read-only official SEC coverpage + Form25 crosscheck. This does not touch
 * regulatory fundamental ingestion, filing/PIT facts or canonical status.
 * A company's Form25 is never applied to another class without exact context.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeUSListingEvidence } from './summarize-marketstack-us-listing-evidence.mjs';
import { parseForm25XML } from './summarize-marketstack-us-sec-evidence.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = s => s.replace(/<[^>]+>/g, ' ').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, h, d) => String.fromCharCode(parseInt(h || d, h ? 16 : 10)))
  .replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replace(/\s+/g, ' ').trim();
const cik = value => /^\d{1,10}$/.test(String(value || '')) ? String(value).padStart(10, '0') : null;
const maxStoredTimestamp = values => { const times = values.map(v => Date.parse(v || '')).filter(Number.isFinite); return times.length ? new Date(Math.max(...times)).toISOString() : values.find(Boolean) || null; };
export function removalExchangeMic(name) {
  const text = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').replace(/^THE/, '');
  return /^NASDAQ(?:STOCKMARKET)?(?:LLC)?$/.test(text) ? 'XNAS' : /^NEWYORKSTOCKEXCHANGE(?:LLC)?$/.test(text) ? 'XNYS' :
    /^NYSEAMERICAN(?:LLC)?$/.test(text) ? 'XASE' : /^NYSEARCA(?:INC|LLC)?$/.test(text) ? 'ARCX' : null;
}
export function parseCoverIdentityHTML(html) {
  if (typeof html !== 'string' || /<!ENTITY/i.test(html)) throw new Error('Untrusted coverpage markup');
  const facts = [];
  for (const match of html.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric\s*>/gi)) {
    const name = /\bname\s*=\s*["']([^"']+)/i.exec(match[1])?.[1]?.split(':').at(-1);
    if (!['EntityCentralIndexKey', 'EntityRegistrantName', 'TradingSymbol', 'Security12bTitle', 'SecurityExchangeName'].includes(name)) continue;
    const contextRef = /\bcontextRef\s*=\s*["']([^"']+)/i.exec(match[1])?.[1] || null;
    facts.push({ concept: name, contextRef, value: decode(match[2]) });
  }
  const ciks = [...new Set(facts.filter(f => f.concept === 'EntityCentralIndexKey').map(f => cik(f.value)).filter(Boolean))];
  const groups = new Map();
  for (const fact of facts.filter(f => f.contextRef && ['TradingSymbol','Security12bTitle','SecurityExchangeName'].includes(f.concept))) {
    const group = groups.get(fact.contextRef) || { contextRef: fact.contextRef, facts: [] }; group.facts.push(fact); groups.set(fact.contextRef, group);
  }
  return { issuerCik: ciks.length === 1 ? ciks[0] : null, issuerNames: [...new Set(facts.filter(f => f.concept === 'EntityRegistrantName').map(f => f.value))],
    groups: [...groups.values()].map(g => {
      const one = name => { const values = [...new Set(g.facts.filter(f => f.concept === name).map(f => f.value))]; return values.length === 1 ? values[0] : null; };
      return { contextRef: g.contextRef, tradingSymbol: one('TradingSymbol'), securityClassTitle: one('Security12bTitle'),
        exchangeName: one('SecurityExchangeName'), mic: removalExchangeMic(one('SecurityExchangeName')) };
    }) };
}
export function parseExplicitTickerRenameHTML(html, oldSymbol, newSymbol) {
  const escaped = value => value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const text = decode(html);
  const pattern = new RegExp('new trading symbol[ \"“”\']*' + escaped(newSymbol) + '[\\s\"“”\',]*replacing its current trading symbol[ \"“”\']*' + escaped(oldSymbol) + '(?:[\\s\"“”\',.]|$)', 'i');
  const match = pattern.exec(text);
  if (!match) return null;
  const parsed = parseCoverIdentityHTML(html);
  return { oldSymbol, newSymbol, issuerCik: parsed.issuerCik, coverGroups: parsed.groups,
    explicitOldToNewDeclaration: true, quote: match[0].trim(),
    announcedCUSIP: /CUSIP[\s\S]{0,250}?will remain as ([A-Z0-9]{9})/i.exec(text)?.[1] || null,
    conditionalOnExchangeConfirmation: /subject to final processing and confirmation by Nasdaq/i.test(text),
    automaticProviderAliasApproval: false };
}
export function classDescriptor(title) {
  const text = title || '', type = /\bwarrants?\b/i.test(text) && !/\bunits?\b/i.test(text) ? 'WARRANT' : /\bunits?\b/i.test(text) ? 'UNIT' :
    /\bpreferred\b|\bpreference\b/i.test(text) ? 'PREFERRED' : /common stock|ordinary shares?/i.test(text) ? 'EQUITY_COMMON' : /\bETN\b/i.test(text) ? 'ETN' : 'UNKNOWN';
  const token = /\b(?:class|series)\s+([A-Z])\b/i.exec(text)?.[1]?.toUpperCase() || null;
  return { type, shareClassToken: type === 'WARRANT' || type === 'UNIT' ? null : token };
}
function sameTargetSymbol(target, coverSymbol) {
  if (target.providerSymbol === coverSymbol) return { matched: true, basis: 'EXACT_OFFICIAL_TRADING_SYMBOL' };
  const preferred = target.baselineInstrumentType === 'PREFERRED' ? /^(.*)-P-([A-Z])$/.exec(target.providerSymbol) : null;
  if (preferred && [preferred[1] + '.P' + preferred[2], preferred[1] + ' PR' + preferred[2]].includes(coverSymbol))
    return { matched: true, basis: 'SERIES_PRESERVING_OFFICIAL_PREFERRED_COVERPAGE_NOT_PROVIDER_ALIAS_APPROVAL' };
  return { matched: false, basis: null };
}
export function crosscheckClassRemovals(quality, submissions, covers, options = {}) {
  const asOf = quality.asOfDate;
  if (!Array.isArray(quality?.rows) || !Array.isArray(submissions?.rows) || !Array.isArray(covers?.rows)) throw new Error('Quality and verified official source records required');
  const records = quality.rows.map(target => {
    const evidence = [], rejections = [];
    const publicIssuerContextCandidates = submissions.rows.filter(s => (target.candidates || []).some(c => c.symbol === target.providerSymbol && target.expectedMics.includes(c.mic) && c.cik === s.cik)).map(s => ({
      issuerCik: s.cik, source: s.source, sha256: s.sourceSha256 || null, currentName: s.currentName || null,
      currentTickers: s.currentTickers || [], currentExchanges: s.currentExchanges || [],
      identityScope: 'PROVIDER_CANDIDATE_ISSUER_NOT_APPROVED_BASELINE_IDENTITY',
      scopedRemovalFilings: (s.terminationOrDelistingFilings || []).filter(f => ['25','25-NSE'].includes(f.form)).map(f => ({form:f.form,filingDate:f.filingDate,accessionNumber:f.accessionNumber,source:f.source||null,sha256:f.sha256||null,
        parsedIssuerCik:f.parsed?.issuerCik||null, exchangeName:f.parsed?.exchangeName||null,securityClassDescription:f.parsed?.descriptionClassSecurity||null})) }));
    const corporateActionEvidence = (options.symbolEvents?.rows || []).filter(e => e.oldSymbolCandidate === target.providerSymbol && e.verifiedTickerRename === true).map(e => ({
      source: e.source, sha256: e.sha256, filingType: e.filingType, filingDate: e.filingDate, accessionNumber:e.accessionNumber,
      issuerCik:e.parsedRename.issuerCik, oldSymbol:e.parsedRename.oldSymbol, newSymbol:e.parsedRename.newSymbol,
      declaration:e.parsedRename.quote, declaredCUSIP:e.parsedRename.announcedCUSIP, currentOfficialListing:e.currentOfficialListing,
      currentOfficialSEC:e.currentOfficialSEC, declaredChangeConditional:e.parsedRename.conditionalOnExchangeConfirmation,
      automaticAliasApproved:false, effectiveLastTradeDateKnown:false,
      providerSecurityIdentifiers: (target.candidates||[]).filter(c=>c.symbol===target.providerSymbol).map(c=>({isin:c.isin||null,cusip:c.cusip||null})),
      identityBasis:'EXPLICIT_OFFICIAL_OLD_TO_NEW_SYMBOL_DECLARATION_AND_CURRENT_INDEPENDENT_NEW_SYMBOL_ISSUER_VENUE',
      note:'Documented symbol transition. Historical share-class continuity/provider prices remain quarantined; this is not an approved Marketstack alias.' }));
    for (const cover of covers.rows) {
      if (!cover.parsed?.issuerCik || cover.parsed.issuerCik !== cover.issuerCik || cover.filingDate > asOf) continue;
      for (const group of cover.parsed.groups) {
        const symbol = sameTargetSymbol(target, group.tradingSymbol);
        if (!symbol.matched) continue;
        if (!group.mic || !target.expectedMics.includes(group.mic) || !group.securityClassTitle) { rejections.push('COVERPAGE_VENUE_OR_CLASS_UNVERIFIED'); continue; }
        if (target.identifiers?.cik && target.identifiers.cik !== cover.issuerCik) { rejections.push('BASELINE_OFFICIAL_ISSUER_CIK_CONFLICT'); continue; }
        const descriptor = classDescriptor(group.securityClassTitle);
        if (descriptor.type !== target.baselineInstrumentType) { rejections.push('COVERPAGE_BASELINE_CLASS_CONFLICT'); continue; }
        const expectedClass = descriptor.shareClassToken;
        const sameTypeGroups = cover.parsed.groups.filter(g => classDescriptor(g.securityClassTitle).type === descriptor.type);
        const sameClassGroups = sameTypeGroups.filter(g => classDescriptor(g.securityClassTitle).shareClassToken === expectedClass);
        if (sameClassGroups.length !== 1) { rejections.push('AMBIGUOUS_MULTIPLE_COVERPAGE_SECURITIES_FOR_SAME_CLASS'); continue; }
        const filings = submissions.rows.filter(s => s.cik === cover.issuerCik).flatMap(s => s.terminationOrDelistingFilings || []);
        for (const filing of filings) {
          if (!['25', '25-NSE'].includes(filing.form) || !filing.parsed || filing.filingDate > asOf || cover.filingDate > filing.filingDate ||
              filing.parsed.issuerCik !== cover.issuerCik || removalExchangeMic(filing.parsed.exchangeName) !== group.mic) continue;
          const segments = filing.parsed.descriptionClassSecurity.split(/;|,|\band\s+(?=(?:class|series|warrants?|units?)\b)/i).map(classDescriptor);
          const matched = segments.some(d => d.type === descriptor.type && (expectedClass ? d.shareClassToken === expectedClass : !d.shareClassToken && sameTypeGroups.length === 1));
          if (!matched) { rejections.push('FORM25_OTHER_SECURITY_CLASS_NOT_TARGET'); continue; }
          evidence.push({ issuerCik: cover.issuerCik, tradingSymbol: group.tradingSymbol, symbolBasis: symbol.basis,
            securityClassTitle: group.securityClassTitle, shareClassToken: expectedClass, mic: group.mic, coverContextRef: group.contextRef,
            cover: { source: cover.source, sha256: cover.sha256, filingType: cover.filingType, filingDate: cover.filingDate, acceptedAt: cover.acceptedAt || null,
              accessionNumber: cover.accessionNumber },
            removal: { source: filing.source, sha256: filing.sha256, form: filing.form, filingDate: filing.filingDate,
              accessionNumber: filing.accessionNumber, issuerName: filing.parsed.issuerName,
              securityClassDescription: filing.parsed.descriptionClassSecurity, ruleProvision: filing.parsed.ruleProvision },
            identityBasis: 'INDEPENDENT_SEC_CIK_TRADING_SYMBOL_CLASS_CONTEXT_AND_EXACT_FORM25_CLASS_VENUE',
            exactSecurityIdentifierAvailable: false, worldwideDelistingProven: false, effectiveLastTradeDateKnown: false,
            note: 'Official class/venue removal notification only. No new canonical status, provider alias, price repair or historical PIT fact.' });
        }
      }
    }
    return { securityId: target.securityId, ticker: target.ticker, originalStatus: target.latestQuality.originalStatus,
      officialScopedRemovalCorroborated: evidence.length > 0,
      expectedStaleObservationExplained: target.latestQuality.originalStatus === 'STALE_LATEST_ACTIVE' && evidence.length > 0,
      evidence, corporateActionEvidence, publicIssuerContextCandidates, rejectedCandidateReasons: [...new Set(rejections)] };
  });
  return { schemaVersion: 'marketstack-us-class-removal-crosscheck-1.0.0', generatedAt: maxStoredTimestamp([options.generatedAt, quality.generatedAt, submissions.retrievedAt, covers.retrievedAt, options.symbolEvents?.retrievedAt]),
    asOfDate: asOf, protectedBaselineSource: quality.protectedBaselineSource, canonicalWrites: 0, requestsMadeByGenerator: 0,
    sources: options.sources || [], sourcePublicRequestAccounting: { submissionsAndArchiveAttempts: submissions.publicRequests || 0,
      coverpageAttempts: covers.publicRequests || 0, symbolEventAttempts: options.symbolEvents?.publicRequests || 0, total: (submissions.publicRequests || 0) + (covers.publicRequests || 0) + (options.symbolEvents?.publicRequests || 0),
      discardedUnrelatedForm425ArchiveReads: options.discarded425 || 0, paidMarketstack: 0 },
    totals: { investigated: records.length, independentScopedRemovals: records.filter(r => r.officialScopedRemovalCorroborated).length,
      additionalStaleExplanations: records.filter(r => r.expectedStaleObservationExplained && !quality.rows.find(q => q.securityId === r.securityId).activeStatus.officialBaselineListingRemovalFiled).length,
      unrelatedOrAmbiguousClassCandidates: records.filter(r => r.rejectedCandidateReasons.length).length,
      documentedTickerChanges: records.filter(r=>r.corporateActionEvidence.length).length,
      safetyPromotions: 0 }, rows: records.filter(r => r.officialScopedRemovalCorroborated || r.rejectedCandidateReasons.length || r.publicIssuerContextCandidates.length || r.corporateActionEvidence.length) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.submissions || !args.covers || !args['documents-dir']) throw new Error('Private --submissions, --covers, --documents-dir required');
  const sources = [], load = (path, privateSource = false) => { const bytes = readFileSync(resolve(path)); sources.push({ ...(privateSource ? { privateArtifact: true } : { path }), sha256: sha(bytes) }); return JSON.parse(bytes); };
  const quality = load(args.quality || 'reports/marketstack/us_marketstack_quality_flags.json'), submissions = load(args.submissions, true), covers = load(args.covers, true);
  const discarded425 = submissions.rows.flatMap(s => s.terminationOrDelistingFilings || []).filter(f => f.form === '425' && f.status === 'FETCHED').length;
  for (const issuer of submissions.rows) for (const filing of issuer.terminationOrDelistingFilings || []) {
    if (!['25','25-NSE'].includes(filing.form) || !filing.localDocument) continue;
    const bytes = readFileSync(resolve(args['documents-dir'], filing.accessionNumber + '.xml'));
    if (sha(bytes) !== filing.sha256) throw new Error('Official Form25 bytes/hash disagreement'); filing.parsed = parseForm25XML(bytes.toString('utf8'));
  }
  for (const cover of covers.rows) {
    if (!['FETCHED', 'CACHE'].includes(cover.status)) continue;
    const bytes = readFileSync(resolve(args['documents-dir'], cover.accessionNumber + '-cover.html'));
    if (sha(bytes) !== cover.sha256) throw new Error('Official coverpage bytes/hash disagreement'); cover.parsed = parseCoverIdentityHTML(bytes.toString('utf8'));
  }
  const symbolEvents = args.events ? load(args.events, true) : null;
  if(symbolEvents) {
    if(!args.directory||!args['current-sec-map']) throw new Error('Symbol transition crosscheck requires retained official directory and current SEC map');
    const directory=load(args.directory,true),sec=load(args['current-sec-map'],true),byTicker=sec.byTicker||sec;
    for(const event of symbolEvents.rows) {
      if(!['FETCHED','CACHE'].includes(event.status))continue;
      const bytes=readFileSync(resolve(args['documents-dir'],event.accessionNumber+'-events.html'));
      if(sha(bytes)!==event.sha256)throw new Error('Official event document bytes/hash disagreement');
      const rename=parseExplicitTickerRenameHTML(bytes.toString('utf8'),event.oldSymbolCandidate,event.newSymbolCandidate);
      if(!rename||!rename.issuerCik||rename.issuerCik!==event.issuerCik)continue;
      const original=quality.rows.find(r=>r.providerSymbol===event.oldSymbolCandidate);if(!original)continue;
      const evidence=summarizeUSListingEvidence(directory,[{securityId:original.securityId,ticker:event.newSymbolCandidate,providerSymbol:event.newSymbolCandidate,baselineInstrumentType:original.baselineInstrumentType,expectedMics:original.expectedMics}],{asOfDate:quality.asOfDate});
      const listed=evidence.rows[0], currentSEC=byTicker[event.newSymbolCandidate];
      const oldGroup=rename.coverGroups.find(g=>g.tradingSymbol===event.oldSymbolCandidate&&original.expectedMics.includes(g.mic)&&classDescriptor(g.securityClassTitle).type===original.baselineInstrumentType);
      if(!evidence.completePublicDirectory||!listed.genuineCommonEquityRoleObserved||!listed.baselineVenueMatches||cik(currentSEC?.cik)!==rename.issuerCik||!oldGroup)continue;
      event.parsedRename=rename;event.currentOfficialListing=listed.currentListing;event.currentOfficialSEC={cik:cik(currentSEC.cik),name:currentSEC.name,exchange:currentSEC.exchange};event.verifiedTickerRename=true;
    }
  }
  const result = crosscheckClassRemovals(quality, submissions, covers, { sources, discarded425, symbolEvents, generatedAt: args['generated-at'] });
  writeFileSync(args.out || 'reports/marketstack/us_marketstack_class_removal_crosscheck.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ totals: result.totals, publicRequests: result.sourcePublicRequestAccounting }));
}
