/**
 * Supertrader 5.0 – registry of the trade lifecycles on the shared research engine (research/lifecycle-engine.mjs):
 * adapter, reference configuration, pre-registered variants and model assumptions per strategy. Read by the snapshot
 * runner (run-sf5-lifecycle.mjs) and the readiness artifact (completion/build-sf5-lifecycle.mjs). The Minervini
 * lifecycle of Supertrader 4.0 keeps its own executor (minervini-execution.mjs) and is not re-registered here.
 */
import crypto from 'node:crypto';
import { DARVAS_ADAPTER, DARVAS_REFERENCE_CONFIG, DARVAS_RUN_VARIANTS, DARVAS_MODEL_ASSUMPTIONS } from './darvas-lifecycle.mjs';
import { KK_BREAKOUT_ADAPTER, KK_REFERENCE_CONFIG, KK_RUN_VARIANTS, KK_MODEL_ASSUMPTIONS } from './kk-breakout-lifecycle.mjs';
import { POCKET_PIVOT_ADAPTER, BUYABLE_GAP_UP_ADAPTER, PP_REFERENCE_CONFIG, BGU_REFERENCE_CONFIG, PP_RUN_VARIANTS, BGU_RUN_VARIANTS, MOKA_MODEL_ASSUMPTIONS } from './moka-lifecycle.mjs';
import { WEINSTEIN_INVESTOR_ADAPTER, WEINSTEIN_TRADER_ADAPTER, WEIN_INVESTOR_REFERENCE_CONFIG, WEIN_TRADER_REFERENCE_CONFIG, WEIN_INVESTOR_RUN_VARIANTS, WEIN_TRADER_RUN_VARIANTS, WEIN_MODEL_ASSUMPTIONS } from './weinstein-lifecycle.mjs';
import { HOLY_GRAIL_RESEARCH_ADAPTER, HG_REFERENCE_CONFIG, HG_RUN_VARIANTS, HG_MODEL_ASSUMPTIONS } from './holy-grail-lifecycle.mjs';
import { ENGINE_VERSION, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';

const mokaFor = (s) => MOKA_MODEL_ASSUMPTIONS.filter((m) => m.strategies.includes(s));
const weinFor = (s) => WEIN_MODEL_ASSUMPTIONS.filter((m) => m.strategies.includes(s));

export const SF5_LIFECYCLES = Object.freeze([
  Object.freeze({ key: 'DARVAS', strategyId: 'SF_DARVAS_BOX', candidateId: 'C03', adapter: DARVAS_ADAPTER, reference: DARVAS_REFERENCE_CONFIG, variants: DARVAS_RUN_VARIANTS, modelAssumptions: DARVAS_MODEL_ASSUMPTIONS, sourceStatus: 'CONTRACT_SOURCES' }),
  Object.freeze({ key: 'KK_BREAKOUT', strategyId: 'SF_KK_BREAKOUT', candidateId: 'C08', adapter: KK_BREAKOUT_ADAPTER, reference: KK_REFERENCE_CONFIG, variants: KK_RUN_VARIANTS, modelAssumptions: KK_MODEL_ASSUMPTIONS, sourceStatus: 'CONTRACT_SOURCES' }),
  Object.freeze({ key: 'POCKET_PIVOT', strategyId: 'SF_MOKA_POCKET_PIVOT', candidateId: 'C11', adapter: POCKET_PIVOT_ADAPTER, reference: PP_REFERENCE_CONFIG, variants: PP_RUN_VARIANTS, modelAssumptions: mokaFor('POCKET_PIVOT'), sourceStatus: 'CONTRACT_SOURCES' }),
  Object.freeze({ key: 'BUYABLE_GAP_UP', strategyId: 'SF_MOKA_BUYABLE_GAP_UP', candidateId: 'C12', adapter: BUYABLE_GAP_UP_ADAPTER, reference: BGU_REFERENCE_CONFIG, variants: BGU_RUN_VARIANTS, modelAssumptions: mokaFor('BUYABLE_GAP_UP'), sourceStatus: 'CONTRACT_SOURCES' }),
  Object.freeze({ key: 'WEINSTEIN_INVESTOR', strategyId: 'SF_WEINSTEIN_INVESTOR', candidateId: 'C04', adapter: WEINSTEIN_INVESTOR_ADAPTER, reference: WEIN_INVESTOR_REFERENCE_CONFIG, variants: WEIN_INVESTOR_RUN_VARIANTS, modelAssumptions: weinFor('INVESTOR'), sourceStatus: 'CONTRACT_SOURCES_WITH_DATA_EXCEPTION' }),
  Object.freeze({ key: 'WEINSTEIN_TRADER', strategyId: 'SF_WEINSTEIN_TRADER', candidateId: 'C05', adapter: WEINSTEIN_TRADER_ADAPTER, reference: WEIN_TRADER_REFERENCE_CONFIG, variants: WEIN_TRADER_RUN_VARIANTS, modelAssumptions: weinFor('TRADER'), sourceStatus: 'CONTRACT_SOURCES_WITH_DATA_EXCEPTION' }),
  Object.freeze({ key: 'HOLY_GRAIL_W_RAS97', strategyId: 'SF_RASCHKE_HOLY_GRAIL', candidateId: 'C13', adapter: HOLY_GRAIL_RESEARCH_ADAPTER, reference: HG_REFERENCE_CONFIG, variants: HG_RUN_VARIANTS, modelAssumptions: HG_MODEL_ASSUMPTIONS, sourceStatus: 'RESEARCH_VARIANT_SOURCE_PENDING_OWNER_DECISION' }),
]);
export const SF5_KEYS = Object.freeze(SF5_LIFECYCLES.map((l) => l.key));

/**
 * Fingerprint of every pre-registered configuration (reference + variants) and the platform policy. Pinned in a test and
 * written into every snapshot receipt: a change after results exist needs an owner decision.
 */
export function sf5VariantRegistrySha256() {
  return crypto.createHash('sha256').update(JSON.stringify({ engine: ENGINE_VERSION, policy: PLATFORM_RESEARCH_PORTFOLIO_POLICY, lifecycles: SF5_LIFECYCLES.map((l) => ({ key: l.key, adapter: l.adapter.version, reference: l.reference, variants: l.variants.map((v) => ({ id: v.id, changes: v.changes })) })) })).digest('hex');
}
