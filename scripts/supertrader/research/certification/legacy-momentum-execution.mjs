// Research-only bug-fix gate. The live strategy, original simulator and original
// daily assumptions remain immutable. No Tournament method is registered here.
export const LEGACY_EXECUTION_VERSION = 'LEGACY_KK_ENTRY_TIME_EVIDENCE_V1';

// Evidence must describe the instant of the stop-buy fill, not the completed
// minute/day candle containing it. Source/range selection thresholds are unchanged.
export function certifiedLegacyMomentumEntry(ctx, t, pending, evidence) {
  const date = ctx.bars.date[t], trigger = pending?.levels?.trigger;
  if (!evidence || evidence.status !== 'ENTRY_TIME_OBSERVATION_CERTIFIED')
    return {notTaken:true,ruleId:'LEGACY_ENTRY_TIME_DATA_UNAVAILABLE',note:'Research gate: daily bars cannot certify entry-time day low.'};
  const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  if (!stamp.test(evidence.entryTimestamp || '') || !Number.isFinite(Date.parse(evidence.entryTimestamp)) ||
      new Date(evidence.entryTimestamp).toISOString().slice(0,19)!==evidence.entryTimestamp.slice(0,19) || evidence.entryTimestamp.slice(0,10) !== date ||
      evidence.observedThrough !== evidence.entryTimestamp || evidence.snapshotKind !== 'INSTANT_AT_ENTRY' ||
      evidence.sourceContract !== 'NO_OBSERVATION_AFTER_ENTRY' || !/^[a-f0-9]{64}$/i.test(evidence.sourceHash||'') ||
      !(Number.isFinite(trigger) && trigger>0) || !(Number.isFinite(evidence.sessionOpen) && evidence.sessionOpen>0) ||
      !(Number.isFinite(evidence.lowObservedThroughEntry) && evidence.lowObservedThroughEntry>0) ||
      evidence.lowObservedThroughEntry>evidence.sessionOpen || evidence.triggerReached !== true)
    return {notTaken:true,ruleId:'LEGACY_ENTRY_TIME_EVIDENCE_INVALID',note:'Research gate: certified instant observation required.'};
  const fill=Math.max(evidence.sessionOpen,trigger);
  if(evidence.lowObservedThroughEntry>fill)
    return {notTaken:true,ruleId:'LEGACY_ENTRY_TIME_EVIDENCE_INVALID',note:'Entry-time low exceeds entry reference.'};
  // Original ADR lookup/cap and 0.9999 convention, without execution-day OHLC.
  const adr=ctx.ind.adr20[t-1]??pending.levels.adr20;
  const cap=Number.isFinite(adr)?fill*(1-adr):-Infinity;
  const lod=evidence.lowObservedThroughEntry,stop=Math.max(Math.min(lod,fill*0.9999),cap);
  return {ruleId:'KK-BO-ENTRY-ORH-D',price:fill,stop,stopRuleId:lod>=cap?'KK-BO-STOP-LOD':'KK-BO-STOP-ADR',
    volumeRatio:null,pessimisticSameDayExit:false,sameDayExitStatus:'REQUIRES_CLOSED_SESSION_PHASE',
    executionCertification:LEGACY_EXECUTION_VERSION,entryTimestamp:evidence.entryTimestamp};
}

// Preserves the original unfavorable-close policy, but only in its later closed
// session phase. It is not an input to entry-time stop/risk certification.
export function legacyClosedSessionExitPolicy({close,entryPrice,stop,sessionDate,sessionClockStatus,sessionClosedAt,asOfTimestamp}) {
  const utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const valid=x=>typeof x==='string'&&utc.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
  if(sessionClockStatus!=='EXCHANGE_CALENDAR_CERTIFIED'||!valid(sessionClosedAt)||!valid(asOfTimestamp)||
     sessionClosedAt.slice(0,10)!==sessionDate||asOfTimestamp.slice(0,10)<sessionDate||
     Date.parse(asOfTimestamp)<Date.parse(sessionClosedAt)||![close,entryPrice,stop].every(Number.isFinite))
    return {available:false,reason:'CLOSED_SESSION_OBSERVATION_REQUIRED'};
  return {available:true,pessimisticSameDayExit:close<entryPrice,certainSameDayExit:close<=stop};
}
