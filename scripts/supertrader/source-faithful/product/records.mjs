/**
 * Supertrader 8.0 – aus einer Erkennung (detectors.mjs) und der Datenqualität (data-quality.mjs) entstehen
 *  1. ein Datensatz nach dem Produktvertrag supertrader-sf-product-candidate-1.0.0 (candidate-contract.mjs) und
 *  2. eine Analyseansicht (view) für die Oberfläche: Zahlen, Gründe, fehlende Bedingungen als maschinenlesbare Codes.
 *
 * Stufe = min(Reichweite der Erkennung, Obergrenze der Strategie aus der Readiness, Obergrenze aus der Datenqualität).
 *  Reichweite: Muster erkannt -> CHART; alle mechanischen Setup-/Filter-/Einstiegsregeln erfüllt -> CONFIRMED;
 *  zusätzlich ein Plan des Research-Lifecycles für die Folgesitzung -> MODELED. VALIDATED_TRADE_SIGNAL gibt es nicht.
 * Jeder Datensatz wird mit validateCandidateRecord gegen das committete Readiness-Artefakt geprüft. Ein ungültiger
 * Datensatz wird verworfen (mit Fehlern protokolliert), nie repariert.
 */
import crypto from 'node:crypto';
import { CONTRACTS } from '../registry.mjs';
import { FOUNDATION, contractFingerprint } from '../contract.mjs';
import { SF6_READINESS_VERSION } from '../completion/sf6-readiness-criteria.mjs';
import { DQ_VERSION, EXPOSURE_LOOKBACK_DAYS } from '../integrity/discontinuity.mjs';
import {
  STAGE, STAGE_ORDER, CANDIDATE_SCHEMA, CANDIDATE_CONTRACT_VERSION, REQUIRED_STATUS, REQUIRED_DISCLAIMERS, PRICE_TRUTH, IDENTITY_SCHEME,
  ruleClasses, recordIdFor, blockReasonsFor, validateCandidateRecord,
} from './candidate-contract.mjs';
import { fileSha256 } from './eod-adapter.mjs';
import { TURTLE_VERSION } from '../methods/turtle.mjs';
import { DARVAS_LIFECYCLE_VERSION } from '../research/darvas-lifecycle.mjs';
import { WEIN_LIFECYCLE_VERSION } from '../research/weinstein-lifecycle.mjs';
import { MINERVINI_VERSION } from '../methods/minervini.mjs';
import { LIFECYCLE_VERSION as MIN_LIFECYCLE_VERSION } from '../research/minervini-lifecycle.mjs';
import { KK_LIFECYCLE_VERSION } from '../research/kk-breakout-lifecycle.mjs';
import { KK_EP_LIFECYCLE_VERSION } from '../research/kk-ep-lifecycle.mjs';
import { KK_PS_STUDY_VERSION } from '../research/kk-ps-study.mjs';
import { MOKA_LIFECYCLE_VERSION } from '../research/moka-lifecycle.mjs';
import { HG_LIFECYCLE_VERSION } from '../research/holy-grail-lifecycle.mjs';
import { DETECTORS_VERSION } from './detectors.mjs';

export const RECORDS_VERSION = 'sf8-records-1.0.0';
const SF = 'scripts/supertrader/source-faithful/';
const PRODUCT_FILES = ['product/eod-adapter.mjs', 'product/data-quality.mjs', 'product/detectors.mjs', 'product/records.mjs', 'product/ranking.mjs', 'product/catalog.mjs', 'product/candidate-contract.mjs', 'integrity/discontinuity.mjs', 'common/series.mjs'];
/** Engine-Kennung, -Version und Code-Dateien je Strategie (provenance.codeSha256 = SHA-256 über Dateien + Produktcode). */
export const ENGINES = Object.freeze({
  SF_TURTLE_S1: { engineId: 'methods/turtle.mjs#entryTrigger', engineVersion: TURTLE_VERSION, files: ['methods/turtle.mjs'] },
  SF_TURTLE_S2: { engineId: 'methods/turtle.mjs#entryTrigger', engineVersion: TURTLE_VERSION, files: ['methods/turtle.mjs'] },
  SF_DARVAS_BOX: { engineId: 'research/darvas-lifecycle.mjs#DARVAS_ADAPTER', engineVersion: DARVAS_LIFECYCLE_VERSION, files: ['methods/darvas.mjs', 'research/darvas-lifecycle.mjs', 'research/lifecycle-engine.mjs'] },
  SF_WEINSTEIN_INVESTOR: { engineId: 'research/weinstein-lifecycle.mjs#WEINSTEIN_INVESTOR_ADAPTER', engineVersion: WEIN_LIFECYCLE_VERSION, files: ['methods/weinstein.mjs', 'research/weinstein-lifecycle.mjs'] },
  SF_WEINSTEIN_TRADER: { engineId: 'research/weinstein-lifecycle.mjs#WEINSTEIN_TRADER_ADAPTER', engineVersion: WEIN_LIFECYCLE_VERSION, files: ['methods/weinstein.mjs', 'research/weinstein-lifecycle.mjs'] },
  SF_MINERVINI_SEPA_VCP: { engineId: 'methods/minervini.mjs#trendTemplate', engineVersion: MINERVINI_VERSION, files: ['methods/minervini.mjs', 'research/minervini-lifecycle.mjs', 'research/minervini-components.mjs'] },
  SF_MINERVINI_POWER_PLAY: { engineId: 'research/minervini-lifecycle.mjs#powerPlaySetupAt', engineVersion: MIN_LIFECYCLE_VERSION, files: ['methods/minervini.mjs', 'research/minervini-lifecycle.mjs', 'research/minervini-components.mjs'] },
  SF_KK_BREAKOUT: { engineId: 'research/kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER', engineVersion: KK_LIFECYCLE_VERSION, files: ['methods/kullamagi.mjs', 'research/kk-breakout-lifecycle.mjs'] },
  SF_KK_EPISODIC_PIVOT: { engineId: 'research/kk-ep-lifecycle.mjs#epChartCandidate', engineVersion: KK_EP_LIFECYCLE_VERSION, files: ['methods/kullamagi.mjs', 'research/kk-ep-lifecycle.mjs'] },
  SF_KK_PARABOLIC_SHORT: { engineId: 'research/kk-ps-study.mjs#psChartCandidate', engineVersion: KK_PS_STUDY_VERSION, files: ['methods/kullamagi.mjs', 'research/kk-ps-study.mjs'] },
  SF_MOKA_POCKET_PIVOT: { engineId: 'methods/morales-kacher.mjs#pocketPivotAt', engineVersion: MOKA_LIFECYCLE_VERSION, files: ['methods/morales-kacher.mjs', 'research/moka-lifecycle.mjs'] },
  SF_MOKA_BUYABLE_GAP_UP: { engineId: 'research/moka-lifecycle.mjs#BUYABLE_GAP_UP_ADAPTER', engineVersion: MOKA_LIFECYCLE_VERSION, files: ['methods/morales-kacher.mjs', 'research/moka-lifecycle.mjs'] },
  SF_RASCHKE_HOLY_GRAIL: { engineId: 'research/holy-grail-lifecycle.mjs#HOLY_GRAIL_RESEARCH_ADAPTER', engineVersion: HG_LIFECYCLE_VERSION, files: ['methods/holy-grail.mjs', 'research/holy-grail-lifecycle.mjs'] },
});

const codeShaCache = new Map();
/** SHA-256 über die Engine-Dateien der Strategie und den Produktcode (in fester Reihenfolge, mit Pfad). */
export function codeSha256For(strategyId) {
  if (codeShaCache.has(strategyId)) return codeShaCache.get(strategyId);
  const h = crypto.createHash('sha256');
  for (const f of [...ENGINES[strategyId].files, ...PRODUCT_FILES]) { h.update(f); h.update(fileSha256(SF + f)); }
  const v = h.digest('hex'); codeShaCache.set(strategyId, v); return v;
}

const rank = (s) => STAGE_ORDER.indexOf(s);
const minStage = (...xs) => (xs.some((x) => x === null) ? null : xs.reduce((a, b) => (rank(a) <= rank(b) ? a : b)));
const contractOf = (id) => CONTRACTS.find((c) => c.strategyId === id);

/** Höchste Stufe, die die Erkennung selbst trägt (ohne Obergrenzen). */
export function detectionReach(det, rc) {
  if (!det?.detected) return null;
  const mech = new Map((det.setupRules || []).map((r) => [r.ruleId, r.met]));
  const complete = rc.mechanicalSetupRules.length > 0 && rc.mechanicalSetupRules.every((id) => mech.get(id) === true);
  if (!complete) return STAGE.CHART_CANDIDATE;
  return det.plan ? STAGE.MODELED_TRADE_PLAN : STAGE.CONFIRMED_RESEARCH_SETUP;
}

/** Baut den Vertragsdatensatz einer Stufe (reine Funktion). */
export function buildContractRecord({ det, sec, stage, asOf, nextSession, inputsSha256, dq, readiness }) {
  const contract = contractOf(det.strategyId), rc = ruleClasses(det.strategyId), eng = ENGINES[det.strategyId];
  const close = sec.bars.at(-1).close;
  const rec = {
    schema: CANDIDATE_SCHEMA, contractVersion: CANDIDATE_CONTRACT_VERSION, stage, recordId: null,
    strategyId: det.strategyId, candidateId: contract.candidateId,
    security: { securityId: sec.id, ticker: sec.ticker, identityScheme: IDENTITY_SCHEME },
    asOf,
    pit: { lastBarDate: asOf, barInterval: ['SF_WEINSTEIN_INVESTOR', 'SF_WEINSTEIN_TRADER'].includes(det.strategyId) ? 'WEEKLY_FROM_DAILY' : 'DAILY', usesIntraday: false, usesFundamentals: false, usesFutureBars: false },
    price: { ...PRICE_TRUTH, close, currency: 'USD' },
    provenance: {
      engineId: eng.engineId, engineVersion: eng.engineVersion, codeSha256: codeSha256For(det.strategyId),
      sourceContractVersion: contract.sourceContractVersion, contractFingerprint: contractFingerprint(contract),
      candidateContractVersion: CANDIDATE_CONTRACT_VERSION, readinessCriteriaVersion: SF6_READINESS_VERSION,
      dataSource: { kind: 'DAILY_EOD', asOf, inputsSha256 },
      ...(stage === STAGE.MODELED_TRADE_PLAN ? { accounting: FOUNDATION.accounting.mode } : {}),
    },
    pattern: { patternId: det.patternId, ruleIds: det.patternRuleIds },
    status: { ...REQUIRED_STATUS },
    disclaimers: [...REQUIRED_DISCLAIMERS[stage]],
    dataIntegrity: { quarantinePolicy: DQ_VERSION, lookbackDays: EXPOSURE_LOOKBACK_DAYS, quarantinedSessions: dq.quarantinedSessions.map((q) => ({ date: q.date, flag: q.flag })) },
    blockReasons: [],
    liveActivation: false, orderRouting: 'NONE', buyDeclarationAllowed: false,
  };
  if (rank(stage) >= rank(STAGE.CONFIRMED_RESEARCH_SETUP)) {
    rec.setup = {
      mechanicalRules: rc.mechanicalSetupRules.map((ruleId) => ({ ruleId, met: det.setupRules.find((r) => r.ruleId === ruleId)?.met === true })),
      openDiscretionaryRules: [...rc.discretionaryRules],
      ambiguousRules: rc.ambiguousRules.map((ruleId) => ({ ruleId, reading: det.ambiguousReadings.find((a) => a.ruleId === ruleId)?.reading ?? '' })),
      dataBlockedRules: [...rc.dataBlockedRules],
      manualReviewStatus: rc.discretionaryRules.length ? 'REQUIRED_PENDING' : 'NOT_REQUIRED',
    };
  }
  if (stage === STAGE.MODELED_TRADE_PLAN) {
    const p = det.plan;
    rec.plan = {
      hypothetical: true, model: { lifecycleKey: p.lifecycleKey, variantId: p.variantId },
      entry: { type: p.entry.type, trigger: p.entry.trigger, earliestSession: nextSession },
      stop: { initial: p.stop }, sizing: { method: p.sizing.method, riskFraction: p.sizing.riskFraction },
      exit: { ruleIds: [...p.exitRuleIds] }, modelAssumptions: p.modelAssumptions.map((a) => ({ ruleId: a.ruleId, assumption: a.assumption })),
      declaredDataExceptions: [...rc.dataBlockedRiskRules],
    };
  }
  rec.recordId = recordIdFor(rec);
  rec.blockReasons = blockReasonsFor(rec, readiness);
  return rec;
}

/** Codes für "warum genau diese Stufe" (maschinenlesbar, für Icons und aufklappbare Details). */
function stageReasons({ reach, ceiling, dqCap, stage, det, rc, dq }) {
  const out = [];
  if (rank(ceiling) < rank(reach)) out.push({ code: 'STRATEGY_CEILING', stage: ceiling });
  if (dqCap !== null && rank(dqCap) < rank(reach)) for (const c of dq.checks.filter((x) => x.status === 'CAP' && rank(x.caps) < rank(reach))) out.push({ code: `DATA_${c.id}`, stage: c.caps });
  for (const r of det.setupRules || []) if (!r.met) out.push(r.pending ? { code: 'RULE_READING_PENDING_OWNER_DECISION', ruleId: r.ruleId } : { code: 'SETUP_RULE_NOT_MET', ruleId: r.ruleId });
  if (reach === STAGE.CONFIRMED_RESEARCH_SETUP && rank(ceiling) >= rank(STAGE.MODELED_TRADE_PLAN)) for (const b of det.planBlockers || []) out.push({ code: 'PLAN_NOT_MODELLED', detail: b });
  if (!rc.mechanicalSetupRules.length) out.push({ code: 'NO_MECHANICAL_SETUP_RULE_IN_CONTRACT' });
  out.push({ code: 'STAGE', stage });
  return out;
}

/**
 * Erkennung + DQ -> { record, view } oder { rejected }. readiness / ceilings werden einmal je Lauf übergeben.
 */
/**
 * Öffentliche Chartmarken einer Karte (Review SF8-R2 BLOCKING/HIGH).
 *
 * Unterhalb von MODELED_TRADE_PLAN gehen keine Order-, Stop- oder Limitmarken der Quelle in die Ansicht, auch nicht
 * umbenannt. Denn der Vertrag erlaubt sie erst mit einem modellierten Ablauf (STAGE_MIXING). Übrig bleibt nur die
 * Chartstruktur, an der die Methode erkannt wurde: Boxgrenzen, Widerstand, Basis- oder Gap-Tief, gleitende
 * Durchschnitte. Wo die einzige Marke der Quelle die Einstiegsorder ist (Turtle-Kanal, Holy-Grail-Touch-Hoch),
 * gibt es unterhalb von MODELED keine Marke. In MODELED zeigt die Karte die Engine-Marken und den Plan.
 */
export const STRUCTURE_LEVELS = Object.freeze({
  C01: ['channelDays', 'exitChannelDays'], C02: ['channelDays', 'exitChannelDays'],
  C03: ['top', 'bottom', 'box'], C04: ['resistance', 'ma30w', 'breakoutWeek', 'breakoutDay'], C05: ['resistance', 'ma30w', 'breakoutWeek', 'breakoutDay'],
  C06: ['pivot', 'ma50', 'ma150', 'ma200'], C07: ['pivot'], C08: ['breakoutLevel'], C09: ['gapDayLow', 'priorClose'],
  C10: ['ma10', 'ma20'], C11: ['ma10', 'ma50', 'signalDayLow'], C12: ['gapDayLow', 'priorClose'], C13: ['ema20', 'impulseHigh', 'swingLow'],
});
// Chartmarke je Strategie unterhalb von MODELED: [Schlüssel in levels, Art] oder null (die einzige Marke wäre die Order)
const STRUCTURE_MARK = Object.freeze({
  C01: null, C02: null, C03: ['top', 'BOX_TOP'], C04: ['resistance', 'WEEKLY_RESISTANCE'], C05: ['resistance', 'WEEKLY_RESISTANCE'],
  C06: ['pivot', 'VCP_PROXY_PIVOT'], C07: ['pivot', 'RUN_UP_HIGH'], C08: ['breakoutLevel', 'CONSOLIDATION_10_LEVEL'], C09: ['gapDayLow', 'GAP_DAY_LOW'],
  C10: null, C11: null, C12: ['gapDayLow', 'GAP_DAY_LOW'], C13: null,
});
export function chartMarks(det, stage, close) {
  if (stage === STAGE.MODELED_TRADE_PLAN) return { pivot: det.pivot ?? null, levels: det.levels ?? {} };
  const src = det.levels ?? {}, keep = STRUCTURE_LEVELS[det.strategyId] ?? [];
  const levels = Object.fromEntries(keep.filter((k) => src[k] !== undefined && src[k] !== null).map((k) => [k, src[k]]));
  const mark = STRUCTURE_MARK[det.strategyId], level = mark ? src[mark[0]] : null;
  const pivot = Number.isFinite(level) && level > 0 ? { level, kind: mark[1], distance: Number.isFinite(close) ? Math.round((close / level - 1) * 1e4) / 1e4 : null } : null;
  return { pivot, levels };
}

// Kennzahlen, aus denen sich Order- oder Stopmarken der Quelle zurückrechnen ließen (Abstand zum Trigger, Risiko
// bis zum Stop, Verkaufsführung): unterhalb von MODELED nicht öffentlich.
export const ORDER_DERIVED_FEATURES = Object.freeze(['closeVsTrigger', 'proposedStopRiskPct', 'riskGuide15pct', 'plannedLossAtPivot', 'sellGuide']);
export function publicFeatures(det, stage) {
  const f = det.features ?? {};
  if (stage === STAGE.MODELED_TRADE_PLAN) return f;
  return Object.fromEntries(Object.entries(f).filter(([k]) => !ORDER_DERIVED_FEATURES.includes(k)));
}

/**
 * Planansicht eines modellierten Ablaufs. Hat die Order der Referenz einen höchsten geplanten Verlust (KK-Breakout
 * NEXT_OPEN: ADR20, Lifecycle-Regel NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX), entsteht daraus das Ausführungsfenster
 * der Eröffnung: über dem Stop und höchstens Stop × (1 + maxPlannedLoss). `referenceInFillWindow` sagt, ob der
 * Schlusskurs (die Referenz) darin liegt; die Regel selbst wird nicht verändert, nur sichtbar gemacht.
 */
export function planView(p, nextSession) {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const upTo = Number.isFinite(p.maxPlannedLoss) && Number.isFinite(p.stop) ? r4(p.stop * (1 + p.maxPlannedLoss)) : null;
  return {
    entryType: p.entry.type, trigger: p.entry.trigger, stop: p.stop, earliestSession: nextSession,
    plannedRiskPct: p.entry.trigger > 0 ? r4(1 - p.stop / p.entry.trigger) : null,
    limit: p.limit ?? null, maxPlannedLoss: p.maxPlannedLoss ?? null,
    fillWindow: upTo !== null ? { above: p.stop, upTo, rule: 'NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX' } : null,
    referenceInFillWindow: upTo !== null ? p.entry.trigger > p.stop && p.entry.trigger <= upTo : null,
    sizing: p.sizing.method, riskFraction: p.sizing.riskFraction,
    exitRuleIds: p.exitRuleIds, modelAssumptions: p.modelAssumptions.map((a) => a.ruleId), lifecycle: `${p.lifecycleKey}/${p.variantId}`, hypothetical: true,
  };
}

export function buildCandidate({ det, sec, dq, asOf, nextSession, inputsSha256, readiness, ceilings, common, meta }) {
  if (!det?.detected) return null;
  const rc = ruleClasses(det.strategyId), ceiling = ceilings.get(det.strategyId);
  const reach = detectionReach(det, rc), dqCap = dq.maxStage;
  if (dqCap === null) return { rejected: { strategyId: det.strategyId, ticker: sec.ticker, reason: 'DATA_QUALITY_FAIL', checks: dq.checks.filter((c) => c.status === 'FAIL').map((c) => c.id) } };
  const stage = minStage(reach, ceiling, dqCap);
  if (stage === null) return { rejected: { strategyId: det.strategyId, ticker: sec.ticker, reason: 'NO_ISSUABLE_STAGE' } };
  const record = buildContractRecord({ det, sec, stage, asOf, nextSession, inputsSha256, dq, readiness });
  const v = validateCandidateRecord(record, { readiness });
  if (!v.ok) return { rejected: { strategyId: det.strategyId, ticker: sec.ticker, reason: 'CONTRACT_VALIDATION_FAILED', stage, errors: v.errors } };
  const plan = stage === STAGE.MODELED_TRADE_PLAN ? planView(det.plan, nextSession) : null;
  const view = {
    strategyId: det.strategyId, candidateId: record.candidateId, ticker: sec.ticker, securityId: sec.id,
    companyName: meta?.companyName ?? null, exchange: meta?.exchange ?? null, shard: meta?.shard ?? null,
    stage, reach, ceiling, asOf, close: record.price.close, recordId: record.recordId,
    pattern: det.patternId, met: (det.setupRules || []).filter((r) => r.met && !r.vacuous).map((r) => r.ruleId).concat(det.patternRuleIds.filter((id) => !(det.setupRules || []).some((r) => r.ruleId === id))),
    pending: (det.setupRules || []).filter((r) => r.pending).map((r) => ({ ruleId: r.ruleId, status: r.pending })),
    interpretations: det.interpretations ?? [],
    notMet: (det.setupRules || []).filter((r) => !r.met && !r.pending).map((r) => r.ruleId),
    ...chartMarks(det, stage, record.price.close), features: publicFeatures(det, stage), trend: common,
    plan, planBlockers: stage === STAGE.MODELED_TRADE_PLAN ? [] : det.planBlockers ?? [],
    why: stageReasons({ reach, ceiling, dqCap, stage, det, rc, dq }),
    dataQuality: { status: dq.status, notPass: dq.checks.filter((c) => c.status !== 'PASS').map((c) => ({ id: c.id, status: c.status, ...(c.caps ? { caps: c.caps } : {}) })), quarantinedSessions: dq.quarantinedSessions },
    blockReasons: record.blockReasons.map((b) => b.code).filter((c, k, a) => a.indexOf(c) === k),
  };
  return { record, view };
}
