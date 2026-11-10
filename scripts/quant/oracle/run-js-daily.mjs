// Fuehrt simulator.mjs / backtest.mjs ueber die synthetischen Tagesbalken-Faelle des Orakels (kind DAILY_EXEC).
// Nutzung: node run-js-daily.mjs <cases.json> --out <result.json>. Schreibt nie in ein committetes Artefakt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { simulate, rescaleSignal } = await imp('scripts/supertrader/engine/simulator.mjs');
const { collectTrades, runPortfolio } = await imp('scripts/supertrader/engine/backtest.mjs');
const args = process.argv.slice(2), outIdx = args.indexOf('--out');
if (args.length < 3 || outIdx < 0) { console.error('usage: run-js-daily.mjs <cases.json> --out <result.json>'); process.exit(2); }
const cases = JSON.parse(fs.readFileSync(args[0], 'utf8')).filter((c) => c.kind === 'DAILY_EXEC');

// Minimale Strategie mit festen Pegeln: gleiche Schnittstelle wie die Strategien der Engine, keine eigene Fachlogik.
function stub(c) {
  const s = {
    id: 'STUB', variant: 'STUB', version: '0.0.0', PARAMS: {},
    scan(ctx, t, params, opts) { if (opts && opts.pending) return { stage: 'SETUP', levels: { trigger: c.trigger, invalidation: c.invalidation }, facts: {}, rules: {} }; return t === c.setup_idx ? { stage: 'SETUP', levels: { trigger: c.trigger, invalidation: c.invalidation }, facts: {}, rules: {} } : null; },
    invalidate(ctx, t) { return ctx.bars.close[t] <= c.invalidation ? 'STUB-INV' : null; },
    confirm(ctx, t) { return ctx.bars.close[t] > c.trigger ? { ruleId: 'STUB-CONFIRM', basis: 'CLOSE', close: ctx.bars.close[t] } : null; },
    planEntry() { return { stop: c.stop, stopRuleId: 'STUB-STOP' }; },
    manage(ctx, t) { return c.exit_close_above && ctx.bars.close[t] >= c.exit_close_above ? { exitNextOpen: 'STUB-EXIT' } : {}; },
    intradayEntry(ctx, t) { const b = ctx.bars; if (!(b.high[t] > c.trigger)) return null; return { ruleId: 'STUB-BS', price: Math.max(b.open[t], c.trigger), stop: c.stop, stopRuleId: 'STUB-STOP', volumeRatio: null, pessimisticSameDayExit: b.low[t] <= c.stop }; },
  };
  if (c.mode === 'BUY_STOP') s.entryMode = 'BUY_STOP_INTRADAY';
  return s;
}
const ctxOf = (c) => ({ symbol: 'STUB', bars: { date: c.bars.map((b) => b.d), open: c.bars.map((b) => b.o), high: c.bars.map((b) => b.h), low: c.bars.map((b) => b.l), close: c.bars.map((b) => b.c), volume: c.bars.map(() => 1e6) }, ind: {} });
const view = (res, c) => {
  const sig = res.finished[0] || res.state.signal;
  if (!sig || !sig.entry) return { outcome: sig ? sig.state : 'NO_SIGNAL', entry: null, exit: null, openAtEnd: false };
  const idx = (d) => c.bars.findIndex((b) => b.d === d);
  return { outcome: sig.state, entry: { index: sig.entry.index, price: sig.entry.price }, exit: sig.exits[0] ? { index: sig.exits[0].index, price: sig.exits[0].price, basis: sig.exits[0].priceBasis } : null,
    openAtEnd: !res.finished.length, sameDayOrder: sig.entry.sameDayOrder || null, collected: collectTrades(stub(c), [ctxOf(c)], c.mode === 'BUY_STOP' ? {} : {}).length };
};
const out = {};
for (const c of cases) {
  const r = { };
  const run = (opts) => simulate(stub(c), ctxOf(c), opts);
  r.default = view(run({}), c);
  r.pessimistic = c.mode === 'BUY_STOP' ? view(run({ sameDayPolicy: 'PESSIMISTIC' }), c) : null;
  // Fall ohne Einstieg: Zustand + Regel
  const sim = run({}); const sg = sim.finished[0];
  r.invalidatedRule = sg && !sg.entry ? sg.transitions.at(-1).ruleId : null;
  if (c.portfolio) {
    const trades = collectTrades(stub(c), [ctxOf(c)], {});
    const cal = c.bars.map((b) => b.d);
    const priceOf = (sym, d) => { const b = c.bars.find((x) => x.d === d); return b ? b.c : null; };
    const pr = runPortfolio(trades, priceOf, cal);
    r.portfolio = { endEquity: pr.equity.at(-1).equity, taken: pr.taken.length, shares: null };
    const s = trades[0] && trades[0].signal;
    if (s) { r.portfolio.entryPrice = s.entry.price; r.portfolio.exitPrice = s.exits[0].price; r.portfolio.initialStop = s.initialStop; r.portfolio.returnPct = s.result.returnPct; }
  }
  out[c.id] = r;
}
// Split-Skalierung gespeicherter Levels
{
  const sig = { levels: { trigger: 100, invalidation: 90 }, entry: { price: 100.1 }, stop: 95, initialStop: 95, exits: [{ price: 94.905 }], transitions: [] };
  rescaleSignal(sig, 0.5, '2024-03-10');
  out.RESCALE = { entry: sig.entry.price, stop: sig.stop, initialStop: sig.initialStop, exit: sig.exits[0].price, trigger: sig.levels.trigger, invalidation: sig.levels.invalidation };
}
fs.writeFileSync(args[outIdx + 1], JSON.stringify(out, null, 1));
