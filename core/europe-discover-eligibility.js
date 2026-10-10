/* Provider-independent Discover admission. This evidence gate never certifies
 * analytics, strategies, public display rights or fundamentals. */
(function (root, factory) {
  'use strict'; var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {}; root.VUCore.EuropeDiscoverEligibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'europe-discover-eligibility-2.0.0';
  var POLICY = Object.freeze({minimumObservations:20, minimumSpanDays:30, maximumSessionLag:3, maximumProofAgeMs:86400000});
  var SHA = /^[a-f0-9]{64}$/;
  var COUNTRIES = ['DE','FR','NL','CH','GB','UK','SE','DK','NO','FI','ES','IT','AT','BE','IE','LU','PT','PL','CZ','HU','GR','IS','EE','LV','LT'];
  function day(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value; }
  function hash(value) { return typeof value==='string' && SHA.test(value); }
  function proof(value) { return value && value.verified===true && hash(value.sha256); }
  function bound(value, security, listing) {
    return !!value && value.securityId===security.securityId && value.companyId===security.companyId &&
      value.listingId===listing.listingId && value.mic===listing.mic && value.providerSymbol===listing.providerSymbol &&
      value.currency===listing.currency && (!security.isin || value.isin===security.isin);
  }
  function identity(security, listing) {
    var s=security||{}, l=listing||{}, p=l.identityAdmission||s.identityAdmission, reasons=[];
    if (s.region!=='EUROPE' || !bound(p,s,l)) reasons.push('IDENTITY_PROOF_NOT_BOUND');
    if (!p || p.version!=='europe-discover-identity-2.0.0' || p.status!=='UNIVERSE_IDENTITY_READY') reasons.push('IDENTITY_ADMISSION_UNVERIFIED');
    if (!p || p.assetType!=='EQUITY') reasons.push('ASSET_TYPE_NOT_EQUITY');
    if (!p || !['VERIFIED_LEGAL_ISSUER','SECURITY_SCOPED_OFFICIAL_ISSUER'].includes(p.issuerBinding) || !p.securityKey) reasons.push('ISSUER_OR_SHARE_CLASS_UNRESOLVED');
    if (!p || p.active!==true || p.localListingPlausible!==true || l.country==='US') reasons.push('ACTIVE_LOCAL_LISTING_UNRESOLVED');
    if (!p || COUNTRIES.indexOf(p.issuerCountry)<0) reasons.push('EUROPE_ISSUER_DOMICILE_UNRESOLVED');
    if (!p || p.duplicateResolved!==true) reasons.push('DUPLICATE_RISK_UNRESOLVED');
    if (!p || !Array.isArray(p.evidenceRefs) || !p.evidenceRefs.length || !p.evidenceRefs.every(proof)) reasons.push('AUTHENTICATED_IDENTITY_EVIDENCE_REQUIRED');
    return {ready:reasons.length===0,reasonCodes:reasons};
  }
  function chart(security, listing, now, range) {
    var s=security||{},l=listing||{}, base=l.discoverChart, p=range && range!=='1Y' ? base && base.ranges && base.ranges[range] : base;
    var reasons=[], nowMs=Date.parse(now||new Date().toISOString()), cutoff=new Date(Number.isFinite(nowMs)?nowMs:0).toISOString().slice(0,10);
    if (!p || !bound(p,s,l)) reasons.push('CHART_PROOF_NOT_BOUND');
    if (!p || p.version!=='europe-discover-close-chart-1' || !proof(p.evidenceRef) || !hash(p.pointsSha256) || !hash(p.sourceInputSha256) || !hash(p.immutableExclusionsSha256)) reasons.push('AUTHENTICATED_CLOSE_CHART_PROOF_REQUIRED');
    var evalMs=p&&Date.parse(p.evaluatedAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(evalMs) || evalMs>nowMs || nowMs-evalMs>POLICY.maximumProofAgeMs) reasons.push('CHART_SESSION_PROOF_EXPIRED_OR_FUTURE');
    if (!p || !Number.isInteger(p.observationCount) || p.observationCount<POLICY.minimumObservations || !day(p.firstDate) || !day(p.lastDate) || p.firstDate>p.lastDate || p.lastDate>cutoff || (Date.parse(p.lastDate)-Date.parse(p.firstDate))/86400000<POLICY.minimumSpanDays) reasons.push('INSUFFICIENT_MEANINGFUL_CLOSE_HISTORY');
    if (!p || !Number.isInteger(p.sessionLag) || p.sessionLag<0 || p.sessionLag>POLICY.maximumSessionLag || !p.calendarSource) reasons.push('LAST_CLOSE_TOO_OLD_OR_UNVERIFIABLE');
    if (!p || p.priceBasis!=='RAW_UNADJUSTED' || !/^[A-Z]{3}$/.test(p.currency||'') || !/^[A-Z]{3}$/.test(p.quoteUnit||'') || !p.quoteBasis || !hash(p.quoteBasis.sourceSha256) || p.currency!==l.currency) reasons.push('QUOTE_CURRENCY_OR_UNIT_UNRESOLVED');
    var calendar=p&&p.calendarProof, next=calendar&&calendar.nextScheduledSession;
    if (!calendar || calendar.verified!==true || calendar.mic!==l.mic || !hash(calendar.sourceSha256) || calendar.sourceSha256!==p.calendarSourceSha256 || calendar.evaluatedAt!==p.evaluatedAt || !day(calendar.coverageFrom) || !day(calendar.coverageTo) || calendar.coverageFrom>cutoff || calendar.coverageTo<cutoff || !day(calendar.expectedLastCompletedSession) || calendar.expectedLastCompletedSession>cutoff || calendar.expectedLastCompletedSession< (p&&p.lastDate) || (p&&p.sessionLag===0&&calendar.expectedLastCompletedSession!==p.lastDate) || !next || !day(next.date) || next.date<=calendar.expectedLastCompletedSession || !Number.isFinite(Date.parse(next.close)) || next.close.slice(0,10)!==next.date || Date.parse(next.close)<=nowMs) reasons.push('CURRENT_EXACT_MIC_SESSION_PROOF_REQUIRED');
    var q=p&&p.quoteBasis;
    if (!q || q.mic!==l.mic || q.providerSymbol!==l.providerSymbol || q.currency!==l.currency || q.quoteUnit!==p.quoteUnit || (s.isin&&q.isin!==s.isin) || !['OFFICIAL_LISTING_QUOTE_REFERENCE','PROVIDER_DOCUMENTED_QUOTE_CONTRACT','PROVIDER_EXPLICIT_QUOTE_CURRENCY'].includes(q.kind) || p.quoteUnit!==p.currency || (q.kind==='PROVIDER_EXPLICIT_QUOTE_CURRENCY'&&(!hash(q.providerCurrencyObservationSha256)||!hash(q.contractSchemaSha256))) || (p.currency==='GBP'&&(q.kind!=='PROVIDER_DOCUMENTED_QUOTE_CONTRACT'||!hash(q.unitContractSha256)))) reasons.push('QUOTE_BASIS_NOT_BOUND');
    if (!p || !Array.isArray(p.criticalIssues) || p.criticalIssues.length || !Array.isArray(p.reasonCodes) || p.reasonCodes.length) reasons.push('CRITICAL_CLOSE_QUALITY_ISSUES');
    if (!p || !['CHART_READY','CHART_LIMITED'].includes(p.chartStatus)) reasons.push('CHART_BLOCKED');
    var ready=reasons.length===0, status=ready?(p.sessionLag>=2?'CHART_LIMITED':p.chartStatus):'CHART_BLOCKED';
    return {status:status,ready:ready,reasonCodes:reasons,sessionLag:p&&p.sessionLag!==undefined?p.sessionLag:null,
      freshness:p&&Number.isInteger(p.sessionLag)?p.sessionLag===0?'CURRENT_LAST_SESSION':p.sessionLag<=3?'DELAYED':'STALE':'UNKNOWN',
      evidence:p||null};
  }
  function evaluate(security,listing,now,range) {
    var i=identity(security,listing),c=chart(security,listing,now,range),eligible=i.ready&&c.ready;
    return {version:VERSION,UNIVERSE_IDENTITY_READY:i.ready,DISCOVER_ELIGIBLE:eligible,CHART_READY:c.status==='CHART_READY',CHART_LIMITED:c.status==='CHART_LIMITED',
      CHART:c.status,discoverReasonCodes:i.reasonCodes.concat(c.reasonCodes),chartReasonCodes:c.reasonCodes,discoverFreshness:c.freshness,sessionLag:c.sessionLag,
      BASE_SCREENER:eligible?'READY':'BLOCKED',publicationAllowed:false};
  }
  return {VERSION:VERSION,POLICY:POLICY,evaluate:evaluate,identity:identity,chart:chart};
});
