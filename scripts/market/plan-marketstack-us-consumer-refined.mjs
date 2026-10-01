/** Cache-first bounded diagnostic of independently explicit common-share
 * classes omitted by the initial public-directory role parser. No requests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractUSLatestDiagnostics } from './classify-marketstack-us-gaps.mjs';
import { probeResponseProvenance } from './marketstack-evidence-provenance.mjs';
export function inventoryRefinedConsumerRequests(consumer, probes, options = {}) {
  const maxCredits = options.maxCredits ?? 45;
  if (!Array.isArray(consumer?.rows) || !Array.isArray(probes) || !Number.isInteger(maxCredits) || maxCredits < 0 || maxCredits > 45)
    throw new Error('Consumer census, cached probes and bounded max45 credits required');
  const targets = consumer.rows.filter(r => r.common_class_refinement_missing_original_directory_coverage === true);
  const endpoints = probes.flatMap(p => (p.endpoints || []).map(e => ({ ...e, ...probeResponseProvenance(e, p) })));
  const rows = targets.map(r => {
    const relevant = endpoints.filter(e => {
      const path = String(e.endpoint || '').replace(/^\//, ''), ticker = /^tickers\/([^/]+)\/eod\/latest$/.exec(path);
      return e.params?.exchange === r.current_mic && (path === 'eod/latest' && String(e.params?.symbols || '').split(',').includes(r.provider_symbol) || ticker?.[1] === r.provider_symbol);
    });
    const diagnostics = extractUSLatestDiagnostics([{ endpoints: relevant.map(e => ({ ...e, label: 'us-current-common-gap-latest' })) }], r.provider_symbol, r.current_mic,
      { securityId: r.security_id, ticker: r.symbol, instrumentType: r.baseline_instrument_type, activeStatus: r.baseline_active_status, consumer: true }, consumer.asOfDate);
    return { securityId: r.security_id, symbol: r.provider_symbol, mic: r.current_mic, currentSecurityName: r.current_security_name,
      publicRoleEvidence: 'LITERAL_OFFICIAL_CURRENT_COMMON_OR_ORDINARY_SHARE_CLASS', cachedExactCurrentMicRequests: relevant.length,
      cachedDiagnostics: diagnostics, lastObservedStatus: diagnostics.at(-1)?.status || 'NOT_TESTED',
      priceObservationPassing: diagnostics.at(-1)?.validLatest === true, identityApproved: false, canonicalWrites: 0 };
  });
  const pending = rows.filter(r => !r.cachedExactCurrentMicRequests).sort((a,b) => a.mic.localeCompare(b.mic) || a.symbol.localeCompare(b.symbol));
  const selected = pending.slice(0, maxCredits), tasks = [];
  for (const mic of [...new Set(selected.map(r => r.mic))]) {
    const members = selected.filter(r => r.mic === mic);
    tasks.push({ id: 'us-refined-current-common-' + mic, label: 'us-current-common-refined-gap-coverage', endpoint: '/eod/latest',
      params: { symbols: members.map(r => r.symbol).join(','), exchange: mic, limit: 1000 }, maxPages: 1, retries: 0,
      cacheTtlMs: 0, conservativeEstimatedCredits: members.length,
      targets: members.map(r => ({ symbol:r.symbol,mic:r.mic,securityIds:[r.securityId],currentSecurityName:r.currentSecurityName,identityApproval:false })) });
  }
  const uniqueBatches = [...new Map(rows.flatMap(r => r.cachedDiagnostics).map(d => [d.responseBatchKey, d])).values()];
  return { schemaVersion:'marketstack-refined-us-consumer-cache-1.0.0',generatedAt: options.generatedAt || consumer.generatedAt, asOfDate:consumer.asOfDate,
    protectedBaselineSource:consumer.protectedBaselineSource, requestsMade:0, canonicalWrites:0,
    totals:{newLiteralCommonShareCandidates:rows.length,cachedExactCurrentMic:rows.filter(r=>r.cachedExactCurrentMicRequests).length,
      lackingExactCurrentMic:pending.length,observedUniqueResponseBatches:uniqueBatches.length,
      rawReturnedBatchRows:uniqueBatches.reduce((n,d)=>n+(d.rawBatchRowCount||0),0),
      identityBearingObjectRows:uniqueBatches.reduce((n,d)=>n+(d.identityBearingObjectRows||0),0),
      emptyArrayPlaceholderRows:uniqueBatches.reduce((n,d)=>n+(d.emptyArrayPlaceholderRows||0),0),
      estimatedAdditionalCredits:selected.length,estimatedAdditionalRequests:tasks.length},
    rows, plan:{ maxEstimatedCredits:maxCredits,estimatedCredits:selected.length,estimatedRequests:tasks.length, tasks, deferred:pending.slice(maxCredits) } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return[s.slice(2,i),s.slice(i+1)];}));
  if(!args.probes||!args['request-plan'])throw new Error('--probes=private-cache and --request-plan=private-output required');
  const load=p=>JSON.parse(readFileSync(resolve(p)));
  const result=inventoryRefinedConsumerRequests(load(args.consumer||'reports/marketstack/us_marketstack_consumer_final.json'),args.probes.split(',').map(load),{generatedAt:args['generated-at']});
  const {plan,...publicInventory}=result;
  writeFileSync(args.out||'reports/marketstack/us_marketstack_consumer_refined_cache.json',JSON.stringify(publicInventory,null,2)+'\n');
  writeFileSync(args['request-plan'],JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify(result.totals));
}
