#!/usr/bin/env node
/**
 * Rank comparison of the six frozen tournament methods under scenarios A (original), B (confirmed VU infrastructure
 * fixes) and C (strictly independently confirmed corrections, C2), in ONE process so ranks can be formed without publishing any
 * absolute performance number. Public: ranks by CAGR, Sharpe and max drawdown, and whether the rank order changed.
 * Absolute metrics are sealed to the owner key. Diagnostic only, never certifying.
 * Usage: node ranking.mjs --base-root <#705> --v3-root <#758> --capture <dir> --sec <file> --finra <file> --public-out <file> --sealed-dir <dir>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './lib.mjs';
import { measureMethod } from './backtest-impact.mjs';

export const RANK_SCENARIOS = ['A_ORIGINAL', 'B_VU_BUGS', 'C2_STRICT'];
export const METHODS = ['cross_sectional_momentum', '52_week_high_effect', 'LOW_VOLATILITY', 'TURTLE_S2_EQUITY_DAILY', 'WEINSTEIN_STAGE_DAILY', 'KULLAMAGI_DAILY_ADAPTATION'];

/** Rank 1 = best: highest CAGR, highest Sharpe, shallowest drawdown (maxDrawdown is <= 0). */
export function ranksOf(metricsByMethod, key) {
  const ids = Object.keys(metricsByMethod).filter((m) => K.finite(metricsByMethod[m][key]));
  const sorted = ids.sort((a, b) => metricsByMethod[b][key] - metricsByMethod[a][key]);
  return Object.fromEntries(sorted.map((m, i) => [m, i + 1]));
}

export function rankTable(results) {
  const out = {};
  for (const sc of RANK_SCENARIOS) {
    const byMethod = Object.fromEntries(Object.entries(results).map(([m, r]) => [m, r.rows[sc]?.metrics ?? {}]));
    out[sc] = { cagr: ranksOf(byMethod, 'cagr'), sharpe: ranksOf(byMethod, 'sharpe'), maxDrawdown: ranksOf(byMethod, 'maxDrawdown'),
      aboveSpy: Object.fromEntries(Object.entries(results).map(([m, r]) => [m, K.finite(r.rows[sc]?.metrics?.cagr) && r.rows[sc].metrics.cagr > r.benchmark.cagr])) };
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  out.changes = Object.fromEntries(['cagr', 'sharpe', 'maxDrawdown'].map((k) => [k, { A_to_B: !same(out.A_ORIGINAL[k], out.B_VU_BUGS[k]), A_to_C2: !same(out.A_ORIGINAL[k], out.C2_STRICT[k]) }]));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = K.args(process.argv.slice(2));
  (async () => {
    const M = await K.loadModules(path.resolve(o['base-root']), path.resolve(o['v3-root']));
    const { raw, prepared } = K.loadCapture(M, o.capture);
    K.expectFingerprint(o['expect-fingerprint'], raw);
    const census = K.labelledCensus(M, prepared, K.loadSec(o.sec), K.loadFinra(o.finra, M.FDL));
    const results = {};
    for (const m of METHODS) { results[m] = measureMethod(M, prepared, m, census, { scenarios: RANK_SCENARIOS, log: (x) => process.stdout.write(JSON.stringify(x) + '\n') }); if (global.gc) global.gc(); }
    const sealed = K.sealForOwner(M, Buffer.from(JSON.stringify({ schema: 'vu-root-cause-ranking-private-1.0.0', results })), path.join(o['sealed-dir'], 'RANKING.owner.sealed.json'));
    K.writeJson(o['public-out'], { schema: 'vu-root-cause-ranking-public-1.0.0', version: K.VERSION, kind: 'DIAGNOSTIC_REPLAY_NOT_CERTIFYING', runId: process.env.GITHUB_RUN_ID ?? null,
      sourceDataFingerprint: raw.fingerprint, scenarios: RANK_SCENARIOS, ranks: rankTable(results), performanceNumbersPublished: 'RANKS_ONLY', sealed });
  })().catch((e) => { process.stderr.write(JSON.stringify({ phase: 'ROOT_CAUSE_RANKING', code: /^[A-Z0-9_:]+$/.test(e.message) ? e.message : 'PRIVATE_RUN_FAILURE', hint: /^[A-Za-z0-9 ,.:'()_\-/]{1,160}$/.test(e.message) ? e.message : null }) + '\n'); process.exitCode = 1; });
}
