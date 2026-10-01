/** Bounded history/actions diagnostics for identifier-resolved US candidates
 * with a passing latest observation. No paid calls or canonical writes here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const normalizeEndpoint = value => String(value || '').replace(/^\//, '');
function covers(existing, task) {
  const p = existing.params || {}, q = task.params;
  const raw = Array.isArray(existing.data) ? existing.data : existing.data?.data;
  const page = existing.pagination || existing.data?.pagination;
  return existing.ok === true && normalizeEndpoint(existing.endpoint) === normalizeEndpoint(task.endpoint) &&
    p.exchange === q.exchange && String(p.symbols || '').split(',').includes(q.symbols) &&
    p.date_from && p.date_from <= q.date_from && p.date_to && p.date_to >= q.date_to &&
    Array.isArray(raw) && (!page || page.total <= raw.length);
}
export function planResolvedUSHistory(resolved, probes = [], options = {}) {
  const maxCredits = options.maxCredits ?? 500, maxRequests = options.maxRequests ?? 100;
  const dateFrom = options.dateFrom || '2025-01-01', dateTo = options.dateTo || '2026-09-30';
  if (!Array.isArray(resolved?.rows) || !Number.isInteger(maxCredits) || maxCredits < 0 || maxCredits > 500 ||
    !Number.isInteger(maxRequests) || maxRequests < 0 || maxRequests > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) throw new Error('Invalid bounded resolved US history controls');
  const observed = probes.flatMap(p => p.endpoints || []), tasks = [], reused = [], deferred = [];
  const targets = resolved.rows.filter(r => r.acceptedIdentity?.identityAccepted && r.acceptedIdentity?.latestDiagnostics?.at(-1)?.validLatest);
  for (const row of targets) for (const endpoint of ['eod', 'splits', 'dividends']) {
    const c = row.acceptedIdentity, task = { id: 'us-resolved-' + endpoint + '-' + row.securityId,
      label: 'us-gap-resolved-' + (endpoint === 'eod' ? 'history' : endpoint), endpoint,
      params: { symbols: c.symbol, exchange: c.mic, date_from: dateFrom, date_to: dateTo, limit: 1000 },
      maxPages: 1, retries: 0, conservativeEstimatedCredits: 1,
      targetSecurityIds: [row.securityId], providerSymbol: c.symbol, mic: c.mic,
      identityBasis: c.identityBasis, historyDepthClaim: 'BOUNDED_WINDOW_ONLY', canonicalWritesApproved: false };
    const cache = observed.find(e => covers(e, task));
    if (cache) reused.push({ ...task, reuseReason: 'EXISTING_COMPLETE_QUALIFIED_WINDOW' });
    else if (tasks.length >= maxCredits || tasks.length >= maxRequests) deferred.push({ ...task, reason: 'CREDIT_OR_REQUEST_CEILING' });
    else tasks.push(task);
  }
  return { schemaVersion: 1, generatedAt: options.generatedAt || new Date().toISOString(), scope: 'NEW_IDENTIFIER_RESOLVED_US_BOUNDED_HISTORY_ACTION_DIAGNOSTICS',
    protectedBaselineSource: resolved.protectedBaselineSource, maxEstimatedCredits: maxCredits, maxRequests,
    estimatedCredits: tasks.length, estimatedRequests: tasks.length, resolvedLatestPassingTargets: targets.length,
    dateFrom, dateTo, maxRetries: 0, maxPagesPerTask: 1, reusedRequests: reused.length,
    instructions: ['Reserve each request before fetch, stop at shared ceilings, and do not automatically retry.',
      'History is a bounded window, not full history depth. Corporate actions are observations, not automatic adjustments.',
      'Keep raw bars and amounts private; publish only validated coverage/count/date and rejection evidence.',
      'Resolved provider aliases do not change protected universe membership or company/ETF engine roles.',
      'If a first page is incomplete, persist remaining work rather than downloading uncapped additional pages.'], tasks, reused, deferred };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(s => { const i = s.indexOf('='); return [s.slice(2, i), s.slice(i + 1)]; }));
  if (!args.out) throw new Error('--out=private-request-plan.json required');
  const load = p => JSON.parse(readFileSync(resolve(p))), result = planResolvedUSHistory(load(args.resolved || 'reports/marketstack/us_marketstack_resolved_matches.json'),
    (args.probes || '').split(',').filter(Boolean).map(load), { dateFrom: args.from, dateTo: args.to });
  writeFileSync(resolve(args.out), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: args.out, estimatedRequests: result.estimatedRequests, estimatedCredits: result.estimatedCredits,
    resolvedLatestPassingTargets: result.resolvedLatestPassingTargets, reusedRequests: result.reusedRequests }));
}
