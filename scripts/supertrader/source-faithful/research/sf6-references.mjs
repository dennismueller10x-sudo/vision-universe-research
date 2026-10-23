/**
 * Supertrader 6.0 – the measurable lifecycle references in one list, each runnable with a cost level and a window:
 * Turtle S1 / S2 (BASE_S0 of runner/run-research.mjs), Minervini SEPA / Power Play (REF of minervini-lifecycle.mjs) and
 * the seven sf5 lifecycles (REF of sf5-lifecycles.mjs). The configurations are the unchanged references; only the
 * platform execution costs can be set (cost sensitivity) and nothing else. Trades are normalized to
 * { id, entryDate, exitDate, exitReason, shares, status, pnl, returnPct, heldSessions }.
 */
import { runTurtle } from '../methods/turtle.mjs';
import { RUN_VARIANTS as MIN_VARIANTS } from './minervini-lifecycle.mjs';
import { buildSetupIndex, runMinerviniLifecycle, EQUITY_RESEARCH_PORTFOLIO_POLICY } from './minervini-execution.mjs';
import { runResearchLifecycle, prepareAll, PLATFORM_RESEARCH_PORTFOLIO_POLICY } from './lifecycle-engine.mjs';
import { SF5_LIFECYCLES } from './sf5-lifecycles.mjs';

/** Reference execution costs of every research run (research-v1 convention): 10 bps slippage per side, 1 bp commission. */
export const REFERENCE_COSTS = Object.freeze({ slippageBps: 10, commissionBps: 1 });

const norm = (t) => ({ id: t.id, signalDate: t.signalDate ?? null, entryDate: t.entryDate, exitDate: t.exitDate ?? null, exitReason: t.exitReason ?? null, shares: t.shares, status: t.status, pnl: t.pnl ?? null, returnPct: t.returnPct ?? null, heldSessions: t.heldSessions ?? null });

function turtle(ds, system, { from, to, costs }) {
  const r = runTurtle(ds, { system, from, to, scenario: 'S0_LAST_PRICE', slippageBps: costs.slippageBps, commissionBps: costs.commissionBps });
  const trades = r.positionTrades.map((t) => ({ id: t.id, entryDate: t.entryDate, exitDate: t.exitDate, exitReason: t.reason, shares: t.maxUnits, status: 'CLOSED', pnl: t.pnl, returnPct: t.returnPct, heldSessions: t.heldSessions }));
  return { run: r, trades, metricTrades: r.positionTrades };
}
function minervini(ds, strategy, { from, to, costs, setupIndex }) {
  const ref = MIN_VARIANTS.find((v) => v.id === 'REF'), policy = { ...EQUITY_RESEARCH_PORTFOLIO_POLICY, ...costs };
  const r = runMinerviniLifecycle(ds, { strategy, setupIndex: setupIndex ?? buildSetupIndex(ds, strategy, { from }), config: ref.config, policy, from, to });
  return { run: r, trades: r.trades.map(norm), metricTrades: r.trades.filter((t) => t.status === 'CLOSED') };
}
function sf5(ds, lc, { from, to, costs, prepared }) {
  const ref = lc.variants.find((v) => v.id === 'REF'), policy = { ...PLATFORM_RESEARCH_PORTFOLIO_POLICY, ...costs };
  const r = runResearchLifecycle(ds, { adapter: lc.adapter, config: ref.config, policy, prepared: prepared ?? prepareAll(ds, lc.adapter, ref.config), from, to });
  return { run: r, trades: r.trades.map(norm), metricTrades: r.trades.filter((t) => t.status === 'CLOSED') };
}

/**
 * prep(ds) builds the cost-independent input once (setup index / prepared adapter context); run(ds, opts) runs one
 * reference. Turtle has no separate preparation.
 */
export const SF6_REFERENCES = Object.freeze([
  Object.freeze({ key: 'TURTLE_S1', candidateId: 'C01', prep: () => null, run: (ds, o) => turtle(ds, 'S1', o) }),
  Object.freeze({ key: 'TURTLE_S2', candidateId: 'C02', prep: () => null, run: (ds, o) => turtle(ds, 'S2', o) }),
  Object.freeze({ key: 'MINERVINI_SEPA', candidateId: 'C06', prep: (ds, { from }) => ({ setupIndex: buildSetupIndex(ds, 'SEPA', { from }) }), run: (ds, o) => minervini(ds, 'SEPA', o) }),
  Object.freeze({ key: 'MINERVINI_POWER_PLAY', candidateId: 'C07', prep: (ds, { from }) => ({ setupIndex: buildSetupIndex(ds, 'POWER_PLAY', { from }) }), run: (ds, o) => minervini(ds, 'POWER_PLAY', o) }),
  ...SF5_LIFECYCLES.map((lc) => Object.freeze({ key: lc.key, candidateId: lc.candidateId, prep: (ds) => ({ prepared: prepareAll(ds, lc.adapter, lc.variants.find((v) => v.id === 'REF').config) }), run: (ds, o) => sf5(ds, lc, o) })),
]);
export const SF6_REFERENCE_KEYS = Object.freeze(SF6_REFERENCES.map((r) => r.key));
