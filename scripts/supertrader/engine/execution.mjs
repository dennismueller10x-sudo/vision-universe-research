// Supertrader — Ausfuehrungsannahmen. Eine Stelle, von Live-Modell und
// Backtest gemeinsam genutzt, damit beide dieselben Preise sehen.
//
// Grundsaetze (Research-Report, "Trigger-/Stop-Ausfuehrung"):
//  * Stop-Buy: Eroeffnet der Titel ueber dem Trigger, wird zum Open gefuellt,
//    nicht zum Trigger. fill = max(trigger, open) + Slippage.
//  * Stop-Loss (long): Eroeffnet der Titel unter dem Stop, wird zum Open
//    gefuellt. fill = min(stop, open) - Slippage.
//  * Entscheidungen auf Schlusskursbasis werden fruehestens zum naechsten
//    Open ausgefuehrt.
//  * Same-Bar-Ambiguitaet: ist innerhalb eines Tagesbalkens nicht
//    entscheidbar, ob erst der Einstieg oder erst der Stop kam, gilt die
//    fuer das Modell UNGUENSTIGERE Reihenfolge.

export const DEFAULT_EXECUTION = Object.freeze({
  slippageBps: 10,       // je Seite, VU-Annahme, im Backtest variiert
  commissionBps: 1,      // je Seite
  model: 'daily-bars-conservative-v1',
});

const bps = (x) => x / 10000;

export function stopBuyFill(trigger, open, exec = DEFAULT_EXECUTION) {
  const base = Math.max(trigger, open);
  return { price: base * (1 + bps(exec.slippageBps)), gapped: open > trigger };
}

export function stopSellFill(stop, open, exec = DEFAULT_EXECUTION) {
  const base = Math.min(stop, open);
  return { price: base * (1 - bps(exec.slippageBps)), gapped: open < stop };
}

export function marketSellAtOpen(open, exec = DEFAULT_EXECUTION) {
  return { price: open * (1 - bps(exec.slippageBps)), gapped: false };
}

export function marketBuyAtOpen(open, exec = DEFAULT_EXECUTION) {
  return { price: open * (1 + bps(exec.slippageBps)), gapped: false };
}

export function commission(notional, exec = DEFAULT_EXECUTION) {
  return Math.abs(notional) * bps(exec.commissionBps);
}

export function describeExecution(exec = DEFAULT_EXECUTION) {
  return {
    model: exec.model,
    slippageBpsPerSide: exec.slippageBps,
    commissionBpsPerSide: exec.commissionBps,
    rules: [
      'Stop-Buy: Füllung zu max(Trigger, Eröffnung) zuzüglich Slippage.',
      'Stop-Loss: Füllung zu min(Stop, Eröffnung) abzüglich Slippage — Gaps werden nicht zum Stopkurs geschönt.',
      'Schlusskurs-Entscheidungen werden frühestens zur nächsten Eröffnung ausgeführt.',
      'Same-Bar-Ambiguität: Liegen Einstieg und Stop im selben Tagesbalken, gilt die für das Modell ungünstigere Reihenfolge.',
      'Gebühren und Slippage auf Kauf und Verkauf.',
    ],
  };
}
