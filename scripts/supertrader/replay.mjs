// Supertrader — historisches Replay (Demonstration, KEIN Live-Signal).
//
// Zweck: zeigen, dass Bestaetigung, Modelleinstieg zur naechsten Eroeffnung,
// Stop, Ausstieg und Protokoll in der Kundenansicht funktionieren - auch wenn
// es im aktuellen Datenstand (noch) keinen bestaetigten Einstieg gibt.
//
// Regeln dieser Demonstration:
//   - dieselbe Engine und Regelversion wie live (Donchian/Turtle), echte
//     vorhandene Tagesbalken der kanonischen Materialisierung;
//   - die Ergebnisse gehen in KEIN Signalprotokoll (Ledger), zaehlen in keiner
//     Kennzahl und tragen eigene IDs mit dem Praefix REPLAY:;
//   - Auswahl vorab festgelegt und unabhaengig vom Ergebnis: je Ausstiegsart
//     (Kanal-Ausstieg, Stop) der liquideste Titel (Median-Dollarumsatz der 50
//     Sitzungen vor dem Setup) mit einem vollstaendig abgeschlossenen Zyklus,
//     bei Gleichstand alphabetisch.
import { simulate } from './engine/simulator.mjs';

export const REPLAY_SELECTION = 'Je Ausstiegsart der liquideste Titel (Median-Dollarumsatz der 50 Sitzungen vor dem Setup) mit vollständig abgeschlossenem Zyklus; unabhängig von Gewinn oder Verlust.';

function medianDollarVolume(bars, endIdx, n = 50) {
  const v = [];
  for (let k = Math.max(0, endIdx - n); k < endIdx; k++) {
    const x = bars.close[k] * bars.volume[k];
    if (Number.isFinite(x)) v.push(x);
  }
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

export function findReplayCycles(engine, instruments, ctxOf, { warmup = 60 } = {}) {
  const cycles = [];
  for (const inst of instruments.values()) {
    const n = inst.bars.date.length;
    if (n <= warmup + 5) continue;
    const res = simulate(engine, ctxOf(inst), { from: warmup, to: n - 1, recordedAt: null });
    for (const s of res.finished) {
      if (s.state !== 'CLOSED' || !s.entry || !(s.exits || []).length) continue;
      const created = inst.bars.date.indexOf(s.transitions[0].date);
      const last = s.exits[s.exits.length - 1];
      cycles.push({ inst, s, exitRuleId: last.ruleId, liquidity: medianDollarVolume(inst.bars, created) });
    }
  }
  return cycles;
}

export function pickReplays(cycles, kinds) {
  const out = [];
  for (const [kind, test] of kinds) {
    const c = cycles.filter((x) => test(x.exitRuleId)).sort((a, b) => b.liquidity - a.liquidity || a.inst.symbol.localeCompare(b.inst.symbol))[0];
    if (c) out.push({ kind, ...c });
  }
  return out;
}

export function buildReplayArtifact({ engine, instruments, ctxOf, planOf, asOf, generatedAt }) {
  const cycles = findReplayCycles(engine, instruments, ctxOf);
  const picks = pickReplays(cycles, [
    ['CHANNEL_EXIT', (r) => r === 'DON-EXIT-01'],
    ['STOP', (r) => r === 'DON-STOP-01'],
  ]);
  const examples = picks.map(({ kind, inst, s, liquidity }) => {
    const signal = { ...s, id: `REPLAY:${engine.variant}:${s.symbol}:${s.transitions[0].date}:v${engine.version}`, strategyId: engine.id, version: engine.version };
    delete signal.index;
    const i0 = inst.bars.date.indexOf(s.transitions[0].date);
    const iX = inst.bars.date.indexOf(s.exits[s.exits.length - 1].date);
    const entryIdx = inst.bars.date.indexOf(s.entry.date);
    const conf = s.confirmation;
    const exit = s.exits[s.exits.length - 1];
    const ret = exit.price / s.entry.price - 1;
    return {
      kind, symbol: s.symbol,
      selection: { medianDollarVolume50: Math.round(liquidity) },
      window: { from: inst.bars.date[Math.max(0, i0 - 40)], to: inst.bars.date[Math.min(inst.bars.date.length - 1, iX + 10)] },
      chart: { shard: inst.shard },
      checks: {
        confirmationClose: conf ? conf.close : null,
        triggerAtConfirmation: s.levels?.trigger ?? null,
        confirmedAboveTrigger: !!conf && conf.close > s.levels.trigger,
        entryIsNextSessionOpen: entryIdx === inst.bars.date.indexOf(conf.date) + 1,
        entryRawOpen: inst.bars.open[entryIdx],
        exitBasis: exit.priceBasis,
      },
      result: { entry: { date: s.entry.date, price: s.entry.price }, exit: { date: exit.date, price: exit.price, ruleId: exit.ruleId }, returnBeforeCosts: Math.round(ret * 10000) / 10000, sessionsHeld: iX - entryIdx },
      signal: { ...signal, plan: planOf(signal) },
    };
  });
  return {
    schema: 'supertrader-replay-1.0.0',
    label: 'HISTORICAL_REPLAY_DEMO',
    labelText: 'Historisches Beispiel – kein aktuelles Signal',
    purpose: 'Zeigt an echten vergangenen Kursen, wie ein Modell-Zyklus abläuft: vorbereitet → bestätigt → Einstieg zur nächsten Eröffnung → Stop → Ausstieg. Nicht im Signalprotokoll, nicht in Kennzahlen.',
    selection: REPLAY_SELECTION,
    engine: { strategyId: engine.id, variant: engine.variant, version: engine.version },
    dataAsOf: asOf, generatedAt,
    cyclesFound: cycles.length,
    examples,
  };
}
