/** Source-certified annual-period lineage. No period dates are synthesized. */
export const FISCAL_PERIOD_LINK_VERSION = 'source-annual-fiscal-period-links-2.0.0';
const DAY_MS = 86_400_000;
const blocked = reason => ({status: 'BLOCKED', reason, periodEnd: null, links: []});
function isoDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !isoDay(value.slice(0, 10))) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) && new Date(result).toISOString().slice(0, 19) === value.slice(0, 19) ? result : null;
}
function cik(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^\d{1,10}$/.test(text) && Number(text) > 0 ? text.replace(/^0+/, '') : null;
}
function evidence(value, issuerCik, reportAccession) {
  try {
    const url = new URL(value?.url);
    const archive = /^\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/.+/.exec(url.pathname);
    return url.protocol === 'https:' && ['www.sec.gov', 'sec.gov', 'data.sec.gov'].includes(url.hostname) &&
      !url.username && !url.password && archive && cik(archive[1]) === cik(issuerCik) &&
      archive[2] === reportAccession.replaceAll('-', '') &&
      /^[a-f0-9]{64}$/.test(value?.sha256) && typeof value?.locator === 'string' && value.locator.trim().length > 0;
  } catch {return false;}
}
const text = value => typeof value === 'string' && value.trim().length > 0;
const accession = value => typeof value === 'string' && /^(?:\d{10}-\d{2}-\d{6}|\d{18})$/.test(value);
function validateLink(link, security, requestedPeriod) {
  if (link.securityId !== security.id || cik(link.issuerCik) !== cik(security.issuerCik)) return 'FISCAL_LINK_SECURITY_IDENTITY_MISMATCH';
  if (link.currentPeriodEnd !== requestedPeriod || !isoDay(link.currentPeriodEnd) || !isoDay(link.previousPeriodEnd) ||
      !isoDay(link.currentPeriodStart) || !isoDay(link.previousPeriodStart)) return 'FISCAL_LINK_PERIOD_INVALID';
  if (!Number.isInteger(link.currentFiscalYear) || !Number.isInteger(link.previousFiscalYear) ||
      link.previousFiscalYear !== link.currentFiscalYear - 1 || link.previousPeriodEnd >= link.currentPeriodEnd ||
      link.currentPeriodStart !== new Date(Date.parse(link.previousPeriodEnd + 'T00:00:00Z') + DAY_MS).toISOString().slice(0, 10)) return 'FISCAL_LINK_NOT_CONSECUTIVE_OR_STUB';
  const gap = (Date.parse(link.currentPeriodEnd) - Date.parse(link.previousPeriodEnd)) / DAY_MS;
  const currentDays = (Date.parse(link.currentPeriodEnd) - Date.parse(link.currentPeriodStart)) / DAY_MS + 1;
  const previousDays = (Date.parse(link.previousPeriodEnd) - Date.parse(link.previousPeriodStart)) / DAY_MS + 1;
  if (![gap, currentDays, previousDays].every(days => days >= 330 && days <= 390)) return 'FISCAL_LINK_NOT_CONSECUTIVE_OR_STUB';
  const cert = link.certification;
  if (cert?.originalAnnual !== true || cert.fiscalLineageVerified !== true || cert.fiscalYearMethod !== 'DEI_CURRENT_REPORT_FOCUS_ONLY' ||
      cert.currentDurationDays !== currentDays || cert.previousDurationDays !== previousDays) return 'FISCAL_LINK_ORIGINAL_ANNUAL_NOT_CERTIFIED';
  if (!['10-K', '20-F', '40-F'].includes(link.currentForm) || !['10-K', '20-F', '40-F'].includes(link.previousForm) ||
      link.currentDocumentPeriodEnd !== link.currentPeriodEnd || link.previousDocumentPeriodEnd !== link.previousPeriodEnd ||
      !accession(link.currentAccession) || !accession(link.previousAccession) ||
      !text(link.currentFiscalPeriodId) || !text(link.previousFiscalPeriodId) ||
      !evidence(link.source?.current, link.issuerCik, link.currentAccession) ||
      !evidence(link.source?.previous, link.issuerCik, link.previousAccession)) return 'FISCAL_LINK_ORIGINAL_REPORT_EVIDENCE_MISSING';
  const currentAccepted = utcInstant(link.currentAcceptedAt), previousAccepted = utcInstant(link.previousAcceptedAt), known = utcInstant(link.knownFrom);
  if (currentAccepted === null || previousAccepted === null || known === null ||
      currentAccepted < Date.parse(link.currentPeriodEnd + 'T00:00:00Z') || previousAccepted < Date.parse(link.previousPeriodEnd + 'T00:00:00Z') ||
      known !== Math.max(currentAccepted, previousAccepted)) return 'FISCAL_LINK_ACCEPTANCE_OR_KNOWN_FROM_INVALID';
  return null;
}

/** Requires actual UTC formation cutoff; date-only and unknown lineage fail closed. */
export function resolvePreviousFiscalPeriod(security, currentPeriodEnd, {formationCutoffUTC, steps = 1} = {}) {
  const cutoff = utcInstant(formationCutoffUTC);
  if (cutoff === null) return blocked('EXPLICIT_UTC_FORMATION_CUTOFF_REQUIRED');
  if (![1, 2].includes(steps)) return blocked('FISCAL_LINK_STEPS_UNSUPPORTED');
  if (!security || !text(security.id) || !cik(security.issuerCik) || security.issuerCikConflict === true) return blocked('FISCAL_LINK_SECURITY_IDENTITY_UNCERTIFIED');
  if (!isoDay(currentPeriodEnd) || !Array.isArray(security.fiscalPeriodLinks)) return blocked('FISCAL_PERIOD_LINK_UNSUPPORTED');
  let period = currentPeriodEnd;
  const links = [];
  for (let step = 0; step < steps; step++) {
    const candidates = [];
    for (const link of security.fiscalPeriodLinks) {
      if (!link || link.currentPeriodEnd !== period) continue;
      const known = utcInstant(link.knownFrom);
      // A future row cannot poison an earlier certified decision.
      if (known !== null && known > cutoff) continue;
      if (link.status === 'BLOCKED_ORIGINAL_FISCAL_PERIOD_CONFLICT') {
        if (known === null) return blocked('FISCAL_LINK_ACCEPTANCE_OR_KNOWN_FROM_INVALID');
        if (link.securityId !== security.id || cik(link.issuerCik) !== cik(security.issuerCik)) return blocked('FISCAL_LINK_SECURITY_IDENTITY_MISMATCH');
        return blocked('BLOCKED_ORIGINAL_FISCAL_PERIOD_CONFLICT');
      }
      const currentAccepted = utcInstant(link.currentAcceptedAt), previousAccepted = utcInstant(link.previousAcceptedAt);
      if (currentAccepted !== null && previousAccepted !== null && Math.max(currentAccepted, previousAccepted) > cutoff) continue;
      const error = validateLink(link, security, period);
      if (error) return blocked(error);
      if (links.length) {
        const parent = links.at(-1);
        if (parent.previousFiscalYear !== link.currentFiscalYear || parent.previousFiscalPeriodId !== link.currentFiscalPeriodId ||
            parent.previousAccession !== link.currentAccession || parent.previousAcceptedAt !== link.currentAcceptedAt ||
            parent.previousPeriodStart !== link.currentPeriodStart) return blocked('FISCAL_LINK_CHAIN_SOURCE_CONFLICT');
      }
      candidates.push(link);
    }
    if (!candidates.length) return blocked('FISCAL_PERIOD_LINK_UNSUPPORTED');
    // Duplicate copies are harmless. Distinct visible original report claims have no hidden precedence.
    const distinct = new Map(candidates.map(link => [JSON.stringify(link), link]));
    if (distinct.size !== 1) return blocked('FISCAL_LINK_VISIBLE_ORIGINAL_CONFLICT');
    const selected = distinct.values().next().value;
    links.push(selected);
    period = selected.previousPeriodEnd;
  }
  return {status: 'CERTIFIED', reason: null, periodEnd: period, steps, links, version: FISCAL_PERIOD_LINK_VERSION};
}
