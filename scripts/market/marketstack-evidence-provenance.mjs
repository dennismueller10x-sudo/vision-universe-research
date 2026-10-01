// Cached responses retain their original run; replay is not a new retrieval.
export function responseProvenance(entry, checkpoint = {}, task = {}) {
  const explicit = entry.sourceRunId || entry.runId || task.sourceRunId || task.runId;
  if (explicit) return {sourceRunId: String(explicit), sourceRunAttribution: entry.sourceRunAttribution || task.sourceRunAttribution || 'EXPLICIT_RESPONSE_OR_TASK'};
  if (entry.seeded || task.seeded) return {sourceRunId: null, sourceRunAttribution: 'UNKNOWN_SEEDED_ORIGINAL_RUN'};
  const checked = Date.parse(entry.checkedAt || task.checkedAt || '');
  const matches = Object.entries(checkpoint.runs || {}).filter(([, run]) => {
    const start = Date.parse(run.startedAt || ''), end = Date.parse(run.finishedAt || '');
    return Number.isFinite(checked) && Number.isFinite(start) && Number.isFinite(end) && start <= checked && checked <= end;
  });
  return matches.length === 1
    ? {sourceRunId: matches[0][0], sourceRunAttribution: 'CHECKPOINT_INTERVAL_ATTRIBUTION'}
    : {sourceRunId: null, sourceRunAttribution: 'UNKNOWN_OR_AMBIGUOUS_ORIGINAL_RUN'};
}

// Original single-run Action artifacts and mixed replay containers differ.
export function probeResponseProvenance(entry, probe = {}) {
  const accounting = probe.accounting;
  const mixedLedger = accounting && typeof accounting === 'object' &&
    Object.values(accounting).some(run => run && typeof run === 'object' && run.startedAt);
  const provenance = responseProvenance(entry, mixedLedger ? {runs: accounting} : {});
  if (provenance.sourceRunId || entry.seeded) return provenance;
  const original = probe.schemaVersion === 'marketstack-probe-1.0.0' &&
    probe.run?.source === 'github-actions' && probe.run?.runId &&
    !probe.run.snapshotRunId && !probe.run.role && !mixedLedger &&
    accounting?.provider === 'marketstack' && Number.isSafeInteger(accounting.requestsAttempted);
  return original
    ? {sourceRunId: String(probe.run.runId), sourceRunAttribution: 'ORIGINAL_SINGLE_RUN_PROBE'}
    : provenance;
}
