/** Read-only Tiingo versus VU audit. Catalog records are NOT account entitlements.
 * node audits/tiingo-2026-10-02/us/build_audit.mjs [account_evidence.json]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
const out = dirname(fileURLToPath(import.meta.url));
const root = join(out, '../../..');
const require = createRequire(import.meta.url);
const Master = require(join(root, 'quant/engines/us-security-master.js'));
const { resolveProductUniverse } = await import(join(root, 'scripts/market/universe-source.mjs'));
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const write = (file, value) => writeFileSync(join(out, file), JSON.stringify(value, null, 2) + '\n');
const date = '2026-10-02';
const stamp = new Date().toISOString();
const catalog = read('audits/tiingo-2026-10-02/endpoints/tiingo_full_symbol_master.json');
const baselineDoc = read('quant/data/market/scale/universe-FULL_UNIVERSE.json');
const baseline = baselineDoc.securities;
const eligibility = read('quant/data/market/security-master/eligibility.json');
const oldMaster = read('quant/data/market/security-master/us-security-master.json');
const names = new Map(read('quant/data/market/security-master/company-names.json').rows.map(r => [r.ticker, r]));
const product = resolveProductUniverse(root);
const productSet = new Set(product.securities.map(r => r.ticker));
const consumerSet = new Set(product.securities.filter(r => r.consumer).map(r => r.ticker));
const rawSet = new Set(baseline.map(r => r.ticker));
const decisions = new Map(eligibility.decisions.map(r => [r.ticker, r]));
const factors = read('quant/data/market/factors/factors-FULL_UNIVERSE.json');
const discoverFactorSet = new Set(factors.securities.filter(r => consumerSet.has(r.ticker)).map(r => r.ticker));
const productList = JSON.parse(gunzipSync(readFileSync(join(root, 'quant/data/product/universe-list-v1.json.gz'))));
const status = read('quant/data/market/tiingo-status.json');
const providerRows = catalog.records.map(r => ({ ...r, ticker: r.ticker.toUpperCase(), currency: r.priceCurrency }));
const fresh = Master.buildSecurityMaster({ providerRows, baseline, today: date, providerAvailable: true });
const roots = Master.collectListedRoots(providerRows, baseline);
const directory = new Map();
const directorySource = [];
for (const [file, symbolField] of [['nasdaqlisted', 'Symbol'], ['otherlisted', 'ACT Symbol']]) {
 const text = readFileSync(join(out, file + '.txt'), 'utf8');
 const lines = text.trim().split(/\r?\n/);
 const header = lines[0].split('|');
 directorySource.push({url:`https://www.nasdaqtrader.com/dynamic/SymDir/${file}.txt`,
  file_creation_time:lines.at(-1).split('|')[0],sha256:createHash('sha256').update(text).digest('hex')});
 for (const line of lines.slice(1,-1)) {
  const cells = line.split('|'), r = Object.fromEntries(header.map((key,i)=>[key,cells[i]]));
  // Only Nasdaq's explicit share-class separator normalization. Preferred '$' forms are not guessed.
  const ticker = r[symbolField].replaceAll('.', '-');
  directory.set(ticker,{ticker,name:r['Security Name'],ETF:r.ETF,test:r['Test Issue'],source:file,
   exchange:file==='nasdaqlisted'?'NASDAQ':({N:'NYSE',A:'AMEX',P:'NYSE ARCA',Z:'BATS',V:'IEX'}[r.Exchange] || r.Exchange)});
 }
}
const groups = new Map();
for (const r of providerRows) { if (!groups.has(r.ticker)) groups.set(r.ticker, []); groups.get(r.ticker).push(r); }
const currentPrimary = fresh.rows.filter(r => r.venue_tier === 'PRIMARY' && r.active_status === 'ACTIVE');
const commonCandidates = currentPrimary.filter(r => r.instrument_type === 'EQUITY_COMMON' && r.eligible_us_equity);
const count = (rows, key) => rows.reduce((a, r) => (a[r[key] ?? 'UNKNOWN'] = (a[r[key] ?? 'UNKNOWN'] || 0) + 1, a), {});
const uniq = rows => [...new Set(rows.map(r => r.ticker))].sort();
const broadMissing = currentPrimary.filter(r => r.asset_type === 'Stock' && !rawSet.has(r.ticker));
const gapCandidates = commonCandidates.filter(r => !rawSet.has(r.ticker));
const indexed = new Map();
const indexReferences=[];
for (const index of ['SP500','NDX','DJIA']) {
 const j = read(`quant/data/market/index-membership/${index}.json`);
 indexReferences.push({indexId:index,asOf:j.asOf,holdings:j.holdingsCount,matched_count:j.memberCount,
  missing_raw:(j.members||[]).filter(r=>!rawSet.has(r.ticker||r.symbol)),unmatched:j.unmatched||[]});
 for (const r of j.members || j.constituents || []) { const t = typeof r === 'string' ? r : r.ticker || r.symbol; if (!indexed.has(t)) indexed.set(t, []); indexed.get(t).push(index); }
 for (const r of j.unmatched || []) { const t=r.ticker || r.symbol; if (!indexed.has(t)) indexed.set(t, []); indexed.get(t).push(index+':UNMATCHED'); }
}
let account = null;
if (process.argv[2] && existsSync(process.argv[2])) account = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const evidence = new Map();
const endpointEvidence=new Map();
const fundamentalIdentities = new Map();
const registryByPermaTicker=new Map();
let completeRegistryResponse=null;
for (const response of account?.responses || []) {
 try{const path=new URL(response.url).pathname.toUpperCase();if(!endpointEvidence.has(path))endpointEvidence.set(path,[]);endpointEvidence.get(path).push(response);}catch{}
 for (const ref of response.references || []) if (ref.group === 'us') evidence.set(ref.id, response);
 if (response.status===200 && response.url?.includes('/tiingo/fundamentals/meta') && Array.isArray(response.payload)) {
  if(response.url==='https://api.tiingo.com/tiingo/fundamentals/meta')completeRegistryResponse=response;
  for (const row of response.payload) {
   registryByPermaTicker.set(row.permaTicker || JSON.stringify(row),row);
  }
 }
}
for(const row of registryByPermaTicker.values()){
 const ticker=String(row.ticker||'').toUpperCase();
 if(!fundamentalIdentities.has(ticker))fundamentalIdentities.set(ticker,[]);
 fundamentalIdentities.get(ticker).push(row);
}
if(completeRegistryResponse){
 const registry=completeRegistryResponse.payload;
 const active=registry.filter(r=>r.isActive===true);
 const activeNonADR=active.filter(r=>r.isADR===false),activeADR=active.filter(r=>r.isADR===true);
 const distinct=rows=>new Set(rows.map(r=>String(r.ticker).toUpperCase()));
 const nonADRSet=distinct(activeNonADR),ADRSet=distinct(activeADR);
 const literal='Field not available for free/evaluation';
 const fields={};
 for(const key of new Set(registry.flatMap(r=>Object.keys(r)))){
  fields[key]={values_available:0,plan_gated_literal:0,null_or_empty:0};
  for(const row of registry){if(row[key]===literal)fields[key].plan_gated_literal++;else if(row[key]==null||row[key]==='')fields[key].null_or_empty++;else fields[key].values_available++;}
 }
 write('tiingo_fundamental_registry_breakdown.json',{generatedAt:stamp,
  source:completeRegistryResponse.url,http_status:200,observedAt:completeRegistryResponse.observedAt,response_sha256:completeRegistryResponse.sha256,
  record_count:registry.length,unique_permaTicker_count:new Set(registry.map(r=>r.permaTicker)).size,unique_ticker_count:distinct(registry).size,
  active_flag_record_count:active.length,active_flag_unique_ticker_count:distinct(active).size,
  active_nonADR_flag_records:activeNonADR.length,active_nonADR_flag_unique_symbols:nonADRSet.size,
  active_ADR_flag_records:activeADR.length,active_ADR_flag_unique_symbols:ADRSet.size,
  symbols_with_both_active_ADR_and_nonADR_flags:[...nonADRSet].filter(t=>ADRSet.has(t)).sort(),
  field_value_availability:fields,by_reporting_currency:count(registry,'reportingCurrency'),
  limitations:['isADR is a provider flag, not independently verified legal ADR form; flags conflict with official ordinary-share listings such as DOO, BIPC, GRAB, MELI, BNS, UBS, STLA and ASML.',
   'Non-ADR does not prove common equity. Active flags do not prove current executable listing, liquidity, or EOD entitlement.',
   'Fundamental registry is not the complete EOD universe: PFBC has accessible metadata and recent daily prices but no registry row.',
   'An active fundamental ticker can refer to an old issuer after symbol reuse: GOGL fundamentals say Golden Ocean while current daily metadata/prices identify a Corgi leveraged ETF. Require current issuer and asset-form agreement before joining fundamentals to prices.',
   'Financial reportingCurrency is not price/listing currency. Plan-gated literal strings are unavailable values, not usable fields.'],
  important_current_identity_records:['DNA','BNY','Q','NRG','PFBC','DOO','CHAI','SNDK','VLTO','SKHY','CART','CRTO','OS','BIPC','GOGL'].map(t=>({ticker:t,rows:fundamentalIdentities.get(t)||[]}))});
}
const accountFor = t => {
 const metadataCandidates=endpointEvidence.get(`/TIINGO/DAILY/${t}`)||[];
 const historyCandidates=endpointEvidence.get(`/TIINGO/DAILY/${t}/PRICES`)||[];
 const metadata = evidence.get(`us-${t.toLowerCase()}-metadata`) || evidence.get(`${t.toLowerCase()}-metadata`) || metadataCandidates.find(r=>r.status===200) || metadataCandidates.at(-1);
 const history = evidence.get(`us-${t.toLowerCase()}-history`) || evidence.get(`${t.toLowerCase()}-history`) || [...historyCandidates].sort((a,b)=>(Array.isArray(b.payload)&&b.status===200?b.payload.length:-1)-(Array.isArray(a.payload)&&a.status===200?a.payload.length:-1))[0];
 const bars = history?.status === 200 && Array.isArray(history.payload) ? history.payload : [];
 const identities=fundamentalIdentities.get(t)||[];
 const activeIdentities=identities.filter(r=>r.isActive===true);
 const fold=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const matchingActiveName=metadata?.payload?.name?activeIdentities.filter(r=>fold(r.name)===fold(metadata.payload.name)):[];
 const selectedIdentity=matchingActiveName.length===1?matchingActiveName[0]:!metadata?.payload?.name&&activeIdentities.length===1?activeIdentities[0]:null;
 return { metadata_status: metadata?.status ?? 'NOT_PROBED', metadata: metadata?.payload ?? null,
  history_status: history?.status ?? 'NOT_PROBED', bar_count: bars.length,
  zero_volume_bar_count:bars.filter(b=>b.volume===0).length,
  positive_volume_bar_count:bars.filter(b=>b.volume>0).length,
  present_in_current_exchange_directory:directory.has(t),
  first_bar: bars[0] || null, latest_bar: bars.at(-1) || null,
  metadata_url:metadata?.url || null,metadata_response_sha256:metadata?.sha256 || null,
  history_url:history?.url || null,history_response_sha256:history?.sha256 || null,
  fundamental_identity_records:identities,
  current_fundamental_identity:selectedIdentity,
  fundamental_identity_selection:matchingActiveName.length===1?'UNIQUE_ACTIVE_PROVIDER_NAME_MATCH':!metadata?.payload?.name&&activeIdentities.length===1?'UNIQUE_ACTIVE_RECORD_TICKER_MATCH_ONLY':activeIdentities.length===1?'PROVIDER_NAME_CONFLICT_REVIEW':activeIdentities.length?'MULTIPLE_ACTIVE_IDENTITIES_REVIEW':identities.length?'ONLY_INACTIVE_REGISTRY_IDENTITIES':'NOT_IN_FUNDAMENTAL_REGISTRY',
  fundamental_identity_caveat:'Identification uses provider registry flags/names; isADR flag is not an independently validated legal instrument type.',
  provider_and_exchange_name_prefix_conflict:!!(metadata?.payload?.name && directory.get(t)?.name &&
   fold(metadata.payload.name.split(/\s+/)[0])!==fold(directory.get(t).name.split(/\s+/)[0])),
  metadata_warning:metadata?.payload?.description?.startsWith('DELISTED') && bars.at(-1)?.date?.slice(0,10)>='2026-09-25'
   ? 'DELISTED_DESCRIPTION_CONFLICTS_WITH_RECENT_PRICES_AND_REQUIRES_CURRENT_ISSUER_VERIFICATION' : null,
  price_support: bars.length ? 'CONFIRMED_CURRENT_ACCOUNT' : history ? 'NOT_CONFIRMED' : 'UNKNOWN_NOT_PROBED' };
};
const importantIndexOmissions=[...new Set(indexReferences.flatMap(r=>r.unmatched.map(x=>x.ticker)))].map(t=>({
 ticker:t,indexes:indexed.get(t)||[],raw_member:rawSet.has(t),product_member:productSet.has(t),consumer_eligible:consumerSet.has(t),
 raw_listing:baseline.find(r=>r.ticker===t)||null,current_decision:decisions.get(t)||null,
 exchange_directory:directory.get(t)||null,public_catalog_periods:groups.get(t)||[],account_evidence:accountFor(t),
 reason:t==='BNY'?'REUSED_TICKER_OLD_ETF_IDENTITY_COLLIDES_WITH_CURRENT_BANK_STOCK':t==='NRG'?'PROVIDER_CATALOG_EXCHANGE_NMFQS_DISAGREES_WITH_CURRENT_NYSE_LISTING':'DUPLICATE_TICKER_REVIEW_NOT_ADDED_OR_REFERENCE_IDENTIFIER_MISMATCH'}));
write('index_reference_coverage.json',{generatedAt:stamp,references:indexReferences,
 important_omissions:importantIndexOmissions,warning:'Matched constituent lists alone conceal dropped/unmatched source holdings. These are project reference snapshots, not a claim of official index membership today.'});
write('symbol_identity_hazards.json',{generatedAt:stamp,production_identity_changes:0,
 cases:['BNY','GOGL','CHAI','CRTO'].map(t=>({ticker:t,raw_member:rawSet.has(t),product_member:productSet.has(t),
  raw_listing:baseline.find(r=>r.ticker===t)||null,official_listing:directory.get(t)||null,account:accountFor(t)})),
 required_join_policy:'Verify current issuer, instrument form, and listing period before joining an active fundamental permaTicker to a price ticker. Preserve old identities/histories; conflicts require review.'});
const currentCommonCandidateSymbols=new Set(commonCandidates.map(r=>r.ticker));
const additionalMissingCurrentListings=[...endpointEvidence.keys()].map(path=>/^\/TIINGO\/DAILY\/([^/]+)$/.exec(path)?.[1])
 .filter(t=>t&&directory.get(t)?.ETF==='N'&&directory.get(t)?.test==='N'&&currentCommonCandidateSymbols.has(t)&&!rawSet.has(t));
const probedUsSymbols=[...new Set([...evidence.values()].flatMap(r=>(r.references||[]).filter(p=>p.group==='us')
 .map(p=>/^\/tiingo\/daily\/([^/]+)(?:\/prices)?$/.exec(p.path)?.[1]).filter(Boolean)).concat(additionalMissingCurrentListings))].sort();
write('tiingo_us_probe_summary.json',{generatedAt:stamp,account_run_id:account?.runId || null,
 price_support_caveat:'Recent endpoint bars alone do not establish active exchange listing, liquidity, full history depth, or backtest certification.',
 symbols:probedUsSymbols.map(t=>({ticker:t,raw_member:rawSet.has(t),product_member:productSet.has(t),
  current_exchange_listing:directory.get(t)||null,account:accountFor(t)}))});
const gaps = gapCandidates.map(r => ({ ticker: r.ticker, exchange: r.exchange, currency: r.currency,
 provider_start_date: r.start_date, provider_end_date: r.end_date,
 inferred_type: r.instrument_type, verified_type: 'UNKNOWN',
 type_limitation: 'Stock with no provider name cannot distinguish common, ADR, REIT, CEF or SPAC.',
 catalog_only: true, raw_member: false, product_member: false, consumer_member: false,
 omission_reason: r.reconciliation_reason || (r.reconciliation_status === 'ADDED' ? 'STALE_FIXED_MEMBERSHIP_NO_PERIODIC_REFRESH' : r.eligibility_reason),
 reconciliation_status: r.reconciliation_status,
 duplicate_ticker: groups.get(r.ticker).length > 1,
 memberships: indexed.get(r.ticker) || [], account_evidence: accountFor(r.ticker) }));
for (const gap of gaps) {
 const exchangeListing = directory.get(gap.ticker);
 const name = exchangeListing?.name || gap.account_evidence.metadata?.name;
 if (name) {
  const classification = Master.classifySecurity({ ticker: gap.ticker, exchange: gap.exchange, assetType: 'Stock', name, currency: gap.currency, startDate: gap.provider_start_date, endDate: gap.provider_end_date }, {today: date, listedRoots: roots});
  gap.provider_name = gap.account_evidence.metadata?.name || null;
  gap.exchange_directory_evidence = exchangeListing || null;
  gap.inferred_type_with_name = classification.instrumentType;
  // Explicit share/stock identity plus exchange is sufficient for a probed common-share sample;
  // a bare corporation name remains UNKNOWN, since ADRs can omit ADS from the metadata name.
  gap.verified_type = exchangeListing?.ETF==='N' && exchangeListing?.test==='N' &&
   /\b(common (stock|shares|subordinate)|ordinary shares|subordinate voting shares)\b/i.test(name) && classification.instrumentType === 'EQUITY_COMMON'
   ? 'US_LISTED_COMMON_SHARE' : classification.instrumentType === 'ADR' ? 'US_ADR' : 'UNKNOWN';
  gap.catalog_only = gap.account_evidence.price_support !== 'CONFIRMED_CURRENT_ACCOUNT';
 }
}
const periodBugs = [];
for (const sec of baseline) {
 const keyRows = oldMaster.rows.filter(r => r.ticker === sec.ticker && r.exchange === sec.exchange);
 const matching = keyRows.filter(r => r.start_date === sec.startDate);
 if (matching.length === 1 && keyRows[0] !== matching[0]) {
  const before = keyRows[0], after = matching[0];
  periodBugs.push({ticker: sec.ticker, name: names.get(sec.ticker)?.companyName || null, securityId: sec.securityId,
   existing_decision: decisions.get(sec.ticker), incorrect_selected_period: {start: before.start_date, end: before.end_date, active: before.active_status},
   correct_matching_period: {start: after.start_date, end: after.end_date, active: after.active_status},
   activity_changed: before.active_status !== after.active_status,
   confirmed_exclusion: false, reason: 'TICKER_EXCHANGE_FIRST_WINS_IGNORES_BASELINE_START_DATE',
   note: 'Product REVIEW retains membership; this is a listing-status defect, not proof of consumer removal.'});
 }
}
const rawCommon = eligibility.decisions.filter(r => r.instrument_type === 'EQUITY_COMMON');
const productCommon = rawCommon.filter(r => productSet.has(r.ticker));
const consumerCommon = rawCommon.filter(r => consumerSet.has(r.ticker));
const exchangeJoined = currentPrimary.filter(r=>r.asset_type==='Stock'&&directory.has(r.ticker)).map(r=>{
 const d=directory.get(r.ticker);
 const c=Master.classifySecurity({ticker:r.ticker,exchange:r.exchange,assetType:r.asset_type,name:d.name,currency:r.currency,startDate:r.start_date,endDate:r.end_date},{today:date,listedRoots:roots});
 return {ticker:r.ticker,exchange:r.exchange,listing_name:d.name,ETF:d.ETF,test:d.test,inferred_type_with_directory_name:c.instrumentType,
  verified_common_share:d.ETF==='N'&&d.test==='N'&&/\b(common (stock|shares|subordinate)|ordinary shares|subordinate voting shares)\b/i.test(d.name)&&c.instrumentType==='EQUITY_COMMON',
  raw_member:rawSet.has(r.ticker),account_entitlement:'UNKNOWN_UNLESS_SEPARATELY_PROBED'};
});
write('exchange_directory_join.json',{generatedAt:stamp,sources:directorySource,directory_listing_count:directory.size,
 directory_by_ETF_and_test:count([...directory.values()].map(r=>({kind:`ETF=${r.ETF},TEST=${r.test}`})),'kind'),
 joined_active_primary_catalog_Stock_rows:exchangeJoined.length,
 by_inferred_type:count(exchangeJoined,'inferred_type_with_directory_name'),
 verified_common_share_lower_bound:uniq(exchangeJoined.filter(r=>r.verified_common_share)).length,
 verified_common_share_lower_bound_missing_raw:uniq(exchangeJoined.filter(r=>r.verified_common_share&&!r.raw_member)).length,
 limitation:'Exchange directory validates current listing/name and ETF/test flags; joined public catalog remains unproven account access. Common-share lower bound deliberately excludes ambiguous issuer forms and ADRs.',rows:exchangeJoined});
write('tiingo_us_common_universe.json', {generatedAt:stamp,source:catalog.source,catalog_retrieved_at:catalog.retrieved_at,
 verified_discoverable_common_total: null, limitation:'Public Stock assetType does not distinguish ADR/REIT/SPAC/CEF/common and includes reserved symbols; this is a candidate universe, not an authoritative common-stock or entitlement count.',
 exchange_verified_common_share_lower_bound:uniq(exchangeJoined.filter(r=>r.verified_common_share)).length,
 catalog_active_us_primary_common_candidates: commonCandidates.length, unique_symbols:uniq(commonCandidates).length,
 current_classifier_version:Master.VERSION, candidates:commonCandidates.map(r=>({ticker:r.ticker,exchange:r.exchange,start_date:r.start_date,end_date:r.end_date,verified_type:'UNKNOWN',inferred_type:r.instrument_type}))});
write('tiingo_vs_vu_us_gap.json', {generatedAt:stamp,asOf:date,
 public_catalog_counts: {rows:catalog.records.length,unique_tickers:catalog.unique_ticker_count,active_primary_Stock_not_in_raw:broadMissing.length,active_primary_common_candidates_not_in_raw:gaps.length,
  common_candidates_matched_raw:uniq(commonCandidates).filter(t=>rawSet.has(t)).length},
 vu_counts:{raw:baseline.length,product:productSet.size,consumer_policy:consumerSet.size,consumer_materialized_factor_rows:discoverFactorSet.size,
  raw_common_classified:rawCommon.length,product_common_classified:productCommon.length,consumer_common_classified:consumerCommon.length,
  active_product_common_classified:productCommon.filter(r=>r.active_status==='ACTIVE').length},
 caveats:['VU common labels reflect current classifier, not authoritative ADR/common identity.','Active means endDate within the existing 30 calendar-day rule; it does not prove live listing status.','No exhaustive metadata/price account sweep has been performed.'],
 missing_reason_counts:count(gaps,'omission_reason'),
 VU_NOT_IN_TIINGO:baseline.filter(r=>!groups.has(r.ticker)).map(r=>({ticker:r.ticker,exchange:r.exchange,reason:'NO_PUBLIC_CATALOG_SYMBOL_MATCH_NOT_PROOF_API_UNSUPPORTED'})),
 TIINGO_NOT_IN_VU:gaps, matched:uniq(commonCandidates).filter(t=>rawSet.has(t))});
const issuerNameFalseExclusions=[{ticker:'PFBC',name:'Preferred Bank',
 official_listing:directory.get('PFBC'),existing_decision:decisions.get('PFBC'),
 accepted_production_Tiingo_evidence:status.securities.ref_PFBC,
 account_evidence:accountFor('PFBC'),
 reason:'PREFERRED_WORD_IN_ISSUER_NAME_MISCLASSIFIED_AS_SECURITY_FORM',
 consequence:'Kept in product as SEPARATE_CLASS, excluded by consumer instrument-type policy.',
 fixed_code:true,production_outputs_regenerated:false}];
const qualityReplayFile='audits/tiingo-2026-10-02/quality/fresh_gate_verification.json';
const qualityReplay=existsSync(join(root,qualityReplayFile))?read(qualityReplayFile):null;
const confirmedSplitGateExamples=(qualityReplay?.results || []).flatMap(result=>{
 const tickers=[...new Set((result.references||[]).map(ref=>/^\/tiingo\/daily\/([^/]+)\/prices$/.exec(ref.path)?.[1]).filter(Boolean))];
 return tickers.filter(t=>['DNA','AMC','BIRD','AMWL'].includes(t) && result.ok===true && result.observed?.splitEvidence?.length)
  .map(t=>({ticker:t,name:names.get(t)?.companyName||null,current_production_rejection:status.securities['ref_'+t]||null,
   independently_verified_correct_split_factor_geometry:result.observed.splitEvidence,
   fresh_response_sha256:result.sha256,corrected_gate_sample_passed:true,full_history_revalidation_complete:false,
   consumer_or_production_outputs_regenerated:false,evidence_file:qualityReplayFile}));
}).filter((row,index,rows)=>rows.findIndex(other=>other.ticker===row.ticker)===index);
write('vu_false_exclusions.json',{generatedAt:stamp,issuer_name_consumer_false_exclusions:issuerNameFalseExclusions,
 important_index_unresolved_securities:importantIndexOmissions,
 confirmed_adjustment_gate_false_positive_examples:confirmedSplitGateExamples,
 confirmed_price_supported_missing_symbols:gaps.filter(r=>r.account_evidence.price_support==='CONFIRMED_CURRENT_ACCOUNT'),
 confirmed_false_common_stock_exclusions:gaps.filter(r=>r.verified_type==='US_LISTED_COMMON_SHARE'&&!r.catalog_only),
 listing_period_selection_bugs:periodBugs,
 existing_product_exclusions_conflicting_with_official_common_listing:periodBugs.filter(r=>r.existing_decision?.product_eligibility==='EXCLUDED' && directory.get(r.ticker)?.ETF==='N' && /\bcommon\b/i.test(directory.get(r.ticker)?.name || '')),
 unverified_catalog_candidates:gaps.filter(r=>r.account_evidence.price_support!=='CONFIRMED_CURRENT_ACCOUNT'),
 production_membership_changed:false});
const dnaAccount = accountFor('DNA');
write('ginkgo_bioworks_case.json',{generatedAt:stamp,ticker:'DNA',name:'Ginkgo Bioworks Holdings Inc - Class A',raw_member:rawSet.has('DNA'),product_member:productSet.has('DNA'),consumer_policy_eligible:consumerSet.has('DNA'),
 raw_listing:baseline.find(r=>r.ticker==='DNA'),eligibility:decisions.get('DNA'),metadata_name_evidence:names.get('DNA'),
 public_catalog_periods:groups.get('DNA'),existing_master_periods:oldMaster.rows.filter(r=>r.ticker==='DNA'),
 product_list_row:productList.entries.find(r=>r.s==='DNA'),factor_row_present:factors.securities.some(r=>r.ticker==='DNA'),
 series_rejection:status.securities.ref_DNA,
 exact_consumer_omission_chain:['DNA exists in raw and product membership; consumer type policy permits it.','Tiingo series rejected by adjustmentContradicted at reverse split 2024-08-20.','No accepted working series, no factor row, therefore Discover does not materialize a DNA card.','VU2 stock list includes DNA by name with unavailable price.'],
 listing_status_bug:periodBugs.find(r=>r.ticker==='DNA'),account_evidence:dnaAccount,
 independent_quality_fix_evidence:confirmedSplitGateExamples.find(r=>r.ticker==='DNA') || null,
 quality_gate_changed_by_us_audit:false,
 quality_gate_formula_fixed_in_separate_quality_audit:qualityReplay?.codeFixApplied || false,
 production_outputs_regenerated:false});
write('tiingo_new_listing_freshness.json',{generatedAt:stamp,source_snapshot_dates:{raw:baselineDoc.generatedAt,security_master:oldMaster.generatedAt,eligibility:eligibility.generatedAt},
 dynamic_daily_price_refresh:true,periodic_symbol_refresh:false,
 workflow_evidence:{price:'.github/workflows/market-data-refresh.yml reads fixed eligibility.json daily',company_master:'.github/workflows/universe-master.yml sync is manual or [universe-sync] push; builds different master, not canonical eligibility membership',security_master:'No scheduled workflow invocation of build-us-security-master/expand-us-universe/build-us-eligibility found'},
 new_primary_Stock_missing_since_last_raw_snapshot:broadMissing.filter(r=>r.start_date>'2026-09-11'),
 new_primary_Stock_missing_since_last_raw_snapshot_count:broadMissing.filter(r=>r.start_date>'2026-09-11').length,
 initial_gate_history_requirement_years:3,
 append_only_expansion_limit:'Only ADDED + EQUITY_COMMON + primary + eligible + non-INACTIVE; duplicate new tickers get REVIEW and are skipped.',
 recent_listing_controls:['CRWV','KLAR','BULL','RDDT','ARM','CAVA','TTAN','TEM','ALAB','RBRK'].map(t=>({ticker:t,raw_member:rawSet.has(t),product_member:productSet.has(t),catalog:groups.get(t),account_evidence:accountFor(t)})),
 provider_listing_addition_latency:'UNKNOWN: a present listing date alone cannot measure first provider appearance time.',
 safe_additive_refresh_design:['Download catalog to versioned audit/cache snapshot (one public request), preserve prior snapshot.','Request metadata and latest EOD for added/changed primary candidates using existing key/header and quota controls.','Match existing listing by ticker + exchange + start date; retain ambiguous histories and IDs for review.','Classifier needs verified names/form metadata; keep UNKNOWN, do not assume Stock = common.','Generate append-only candidate changes and exclusion reasons; never silently remove existing or delisted history.','Run existing adjustment/currency/security-identity/consumer/canary gates before production-publish eligibility.','Store dry-run proposed membership separate from production, periodically schedule only candidate discovery until QA passes.']});
write('pipeline_health.json',{generatedAt:stamp,no_fixed_count_cap_in_current_product_resolver:true,historical_handover_expected_7004_is_documentary_only:true,current_product_is_data_driven_fixed_snapshot:true,
 obsolete_counts_not_current_limits:['7004 handover','5684 baseline','6875 actual current product','5953/5947 historical consumer materialization counts'],
 excluded_by_type:eligibility.excludedByClass,separate_by_type:eligibility.separateByClass,
 broad_bank_or_REIT_filter_found:false,SIC_universe_exclusion_found:false,share_class_dedupe_exclusion_found:false,
 important_missing_candidate_symbols:['CART','CRCL','FIG','FLY','BEPC','BIPC','BIOA','AIRO','ARX','CAI','SNDK','OS','CRTO','CENN','CLMT','DEC'].map(t=>gaps.find(r=>r.ticker===t)||{ticker:t,status:'NOT_IN_CURRENT_COMMON_CANDIDATE_GAP'}),
 fresh_reconciliation_counts:fresh.counts,listing_period_selection_bug_count:periodBugs.length,activity_changing_period_bugs:periodBugs.filter(r=>r.activity_changed).length});
console.log(JSON.stringify({raw:rawSet.size,product:productSet.size,consumer_policy:consumerSet.size,materialized_consumer_factors:discoverFactorSet.size,
 active_common_candidates:commonCandidates.length,missing_common_candidates:gaps.length,missing_Stock:broadMissing.length,
 period_bugs:periodBugs.length,activity_changing_period_bugs:periodBugs.filter(r=>r.activity_changed).length,account_evidence_responses:evidence.size}));
