/** No network, provider calls, ID creation, or production writes. A reviewable
 * periodic discovery candidate path; consumes the latest audit measurements.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const out=dirname(fileURLToPath(import.meta.url)),root=join(out,'../../..');
const read=file=>JSON.parse(readFileSync(join(out,file),'utf8'));
const gap=read('tiingo_vs_vu_us_gap.json'),falseExclusions=read('vu_false_exclusions.json');
const baseline=JSON.parse(readFileSync(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'),'utf8'));
const hash=createHash('sha256').update(readFileSync(join(root,'quant/data/market/scale/universe-FULL_UNIVERSE.json'))).digest('hex');
const additions=gap.TIINGO_NOT_IN_VU.map(row=>{
 const gates={explicit_common_share:row.verified_type==='US_LISTED_COMMON_SHARE',
  account_history_available:row.account_evidence.price_support==='CONFIRMED_CURRENT_ACCOUNT',
  adjustment_quality_passed:false,provider_metadata_period_identity_verified:false,
  currency_USD:row.currency==='USD',existing_id_collision_checked:false,
  index_and_consumer_projection_tests_passed:false,canary_regression_passed:false};
 return {...row,existing_raw_or_product_ids_changed:false,proposed_securityId:null,
  readiness:Object.values(gates).every(Boolean)?'READY_FOR_REVIEW':'REVIEW_OR_MORE_EVIDENCE_REQUIRED',
  gates,minimum_technical_bars:{SMA20:20,SMA50:50,SMA200:200,high52week:252},
  import_barriers:[row.omission_reason,row.duplicate_ticker?'RECYCLED_OR_MULTILISTED_TICKER_NEEDS_LISTING_PERIOD_IDENTITY':'NO_AUTOMATIC_MEMBERSHIP_REFRESH']};
});
const result={generatedAt:new Date().toISOString(),mode:'DIAGNOSTIC_APPEND_ONLY_CANDIDATES_NOT_PUBLISHABLE',
 input_measurement_timestamp:gap.generatedAt,baseline_raw_count:baseline.securities.length,baseline_sha256:hash,
 provider_requests:0,production_mutations:0,existing_members_removed:0,existing_ids_rewritten:0,
 addition_candidates:additions,consumer_restore_candidates:falseExclusions.issuer_name_consumer_false_exclusions,
 provider_exchange_conflict_candidates:falseExclusions.important_index_unresolved_securities.filter(r=>!r.raw_member&&r.reason==='PROVIDER_CATALOG_EXCHANGE_NMFQS_DISAGREES_WITH_CURRENT_NYSE_LISTING'),
 adjustment_gate_revalidation_candidates:falseExclusions.confirmed_adjustment_gate_false_positive_examples,
 existing_listing_metadata_correction_candidates:falseExclusions.listing_period_selection_bugs,
 ambiguous_existing_listing_status_policy:'Use unique ticker + exchange + baseline start_date. If that evidence is absent keep history and IDs and REVIEW; do not choose latest or active solely.',
 intended_refresh_sequence:['One public Tiingo ZIP fetch into versioned working cache.','Compare catalog to prior snapshot and current membership, without deletion.','Join official exchange directory type/ETF/test evidence and provider metadata.','Probe only newly added/changed listings; check account entitlement, latest price and adjustment gate.','Resolve reused symbols by listing period and issuer; maintain all historical identity records.','Run existing classification, exclusions, consumer, Quant, Search, Watchlist, Chart, SuperTrader and canary gates.','Propose append-only canonical eligibility diff in separate artifact.','Production publishing remains separate and requires completed release QA; this command cannot publish.'],
 scheduling_design:'Daily/weekly catalog + directory diff and changed-candidate diagnostics; no production writes. Schedule only after request-budget bounds and deterministic artifact retention are wired.',
 unresolved_account_common_total:true,
 exact_universe_count_claim_allowed:false};
writeFileSync(join(out,'proposed_us_universe_refresh.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({candidates:additions.length,ready_for_publish:0,production_mutations:0}));
