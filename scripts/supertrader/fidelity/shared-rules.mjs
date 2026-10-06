// Supertrader R15 – Regeln, die ALLE Strategien über gemeinsame Module erben (Simulator, Ausführung, Portfolio-Engine).
// Jede Strategie muss für jede geteilte Regel eine eigene Herkunftsangabe haben: Ist die Regel für sie original,
// eine VU-Formalisierung oder eine VU-Annahme? Eine geteilte Regel ohne Angabe bricht den Test (fidelity.test).
import { PROVENANCE as P } from './taxonomy.mjs';

export const SHARED_RULES = Object.freeze([
  { id: 'SH-COOLDOWN-5', module: 'engine/simulator.mjs COOLDOWN_SESSIONS', rule: '5 Sitzungen Sperre je Titel nach Abschluss oder Ungültigkeit', area: 'Entry' },
  { id: 'SH-ONE-POSITION', module: 'engine/simulator.mjs (state.signal)', rule: 'höchstens ein Signal/eine Position je Titel – kein Nachkauf, keine Pyramidisierung', area: 'Portfolio' },
  { id: 'SH-LONG-ONLY', module: 'engine/simulator.mjs', rule: 'nur Kauf (keine Leerverkäufe)', area: 'Portfolio' },
  { id: 'SH-FILL-STOP', module: 'engine/execution.mjs stopBuyFill/stopSellFill', rule: 'Stop-Kauf/-Verkauf zum Trigger bzw. zur Eröffnung bei Lücke, 10 bp Slippage', area: 'Risk' },
  { id: 'SH-FILL-NEXT-OPEN', module: 'engine/simulator.mjs / execution.mjs', rule: 'Schlusskurs-Entscheidungen werden zur nächsten Eröffnung ausgeführt', area: 'Entry' },
  { id: 'SH-SIZE-RISK', module: 'validation/portfolio.mjs runPortfolioTR', rule: 'Stückzahl = Kapital × riskPerTrade ÷ (Einstieg − Stop), gekappt durch maxPositionPct, Bargeld, maxExposure', area: 'Sizing' },
  { id: 'SH-NO-LEVERAGE', module: 'validation/portfolio.mjs (maxExposure 1, Bargeldgrenze)', rule: 'kein Hebel, keine Margin', area: 'Sizing' },
  { id: 'SH-SELECT-SIMULTANEOUS', module: 'validation/portfolio.mjs (priority)', rule: 'Auswahl gleichzeitiger Signale nach priority (RS/ALPHA)', area: 'Portfolio' },
  { id: 'SH-DEFAULTS', module: 'engine/backtest.mjs PORTFOLIO_DEFAULTS', rule: 'Standardwerte für Engines ohne portfolio (0,5 % Risiko = KK-RISK-01, 20 %, 10 Plätze)', area: 'Sizing' },
]);

const x = (provenance, note) => ({ provenance, note });
// Herkunft je Strategie und geteilter Regel.
export const SHARED_RULE_PROVENANCE = Object.freeze({
  MOMENTUM_BREAKOUT: {
    'SH-COOLDOWN-5': x(P.VU_OWN, 'Kullamägi: keine Sperre; 3.1.0 setzt die Sperre nach verlorenem Setup aus (KK-BO-COOLDOWN-00), nach Trades bleibt sie'),
    'SH-ONE-POSITION': x(P.VU_OWN, 'Kullamägi stockt intraday auf – fehlt'),
    'SH-LONG-ONLY': x(P.VU_OWN, 'Parabolic Short nicht umgesetzt'),
    'SH-FILL-STOP': x(P.VU_FORMALIZATION, 'Einstieg über Eröffnungsspanne → 5-Tage-Hoch als Kauf-Stop'),
    'SH-FILL-NEXT-OPEN': x(P.VU_FORMALIZATION, 'nur für Schlusskurs-Ausstiege (MA-Trail)'),
    'SH-SIZE-RISK': x(P.ORIGINAL_INTERPRETATION, 'Risiko je Trade ÷ Stopabstand entspricht seiner Beschreibung'),
    'SH-NO-LEVERAGE': x(P.VU_OWN, 'Kullamägi nutzt Margin'),
    'SH-SELECT-SIMULTANEOUS': x(P.VU_FORMALIZATION, 'RS am Vortag'),
    'SH-DEFAULTS': x(P.ORIGINAL, 'nicht genutzt; eigene Policy (Quelle der Default-Zahl ist KK-RISK-01)'),
  },
  WEINSTEIN_STAGE: {
    'SH-COOLDOWN-5': x(P.VU_OWN, 'keine Weinstein-Quelle'),
    'SH-ONE-POSITION': x(P.VU_OWN, 'Weinstein: halbe Position beim Ausbruch, Rest beim Rücksetzer – fehlt'),
    'SH-LONG-ONLY': x(P.VU_OWN, 'Stage-4-Leerverkauf nicht umgesetzt'),
    'SH-FILL-STOP': x(P.ORIGINAL, 'Buy-Stop über dem Widerstand'),
    'SH-FILL-NEXT-OPEN': x(P.VU_FORMALIZATION, 'Wochenschluss-Ausstiege zur nächsten Eröffnung'),
    'SH-SIZE-RISK': x(P.VU_OWN, 'Weinstein nennt keine Risikoformel'),
    'SH-NO-LEVERAGE': x(P.VU_OWN, ''),
    'SH-SELECT-SIMULTANEOUS': x(P.VU_FORMALIZATION, 'RS'),
    'SH-DEFAULTS': x(P.FOREIGN_RULE, 'erbt still 0,5 % (Kullamägi), 20 %, 10 Plätze'),
  },
  DARVAS_BOX: {
    'SH-COOLDOWN-5': x(P.VU_OWN, 'keine Darvas-Quelle'),
    'SH-ONE-POSITION': x(P.VU_OWN, 'Darvas pyramidisierte in Gewinner – fehlt'),
    'SH-LONG-ONLY': x(P.ORIGINAL, 'Darvas kaufte nur'),
    'SH-FILL-STOP': x(P.ORIGINAL_INTERPRETATION, 'automatische Kauf- und Stop-Order (TIME 1959)'),
    'SH-FILL-NEXT-OPEN': x(P.VU_FORMALIZATION, ''),
    'SH-SIZE-RISK': x(P.VU_OWN, 'Darvas: Kapital in wenigen Titeln; die 1/6-Kappe bindet'),
    'SH-NO-LEVERAGE': x(P.VU_OWN, 'Darvas nutzte Kredit'),
    'SH-SELECT-SIMULTANEOUS': x(P.VU_FORMALIZATION, 'RS'),
    'SH-DEFAULTS': x(P.FOREIGN_RULE, '0,5 %-Zahl übernommen („VU-Standard“)'),
  },
  MINERVINI_VCP: {
    'SH-COOLDOWN-5': x(P.VU_OWN, 'Minervini kauft Rückkehrer erneut (Re-Entry) – Sperre ist VU'),
    'SH-ONE-POSITION': x(P.VU_OWN, 'Pilotkauf und Aufstocken fehlen'),
    'SH-LONG-ONLY': x(P.ORIGINAL_INTERPRETATION, 'Minervini handelt überwiegend long'),
    'SH-FILL-STOP': x(P.VU_FORMALIZATION, ''),
    'SH-FILL-NEXT-OPEN': x(P.VU_FORMALIZATION, 'Einstieg zum nächsten Open nach Schluss über Pivot statt im Tagesverlauf'),
    'SH-SIZE-RISK': x(P.ORIGINAL_INTERPRETATION, 'Risiko je Trade ÷ Stopabstand'),
    'SH-NO-LEVERAGE': x(P.VU_OWN, 'Minervini nutzt Margin bei Stärke'),
    'SH-SELECT-SIMULTANEOUS': x(P.VU_FORMALIZATION, 'RS'),
    'SH-DEFAULTS': x(P.ORIGINAL, 'nicht genutzt'),
  },
  DONCHIAN_TURTLE: {
    'SH-COOLDOWN-5': x(P.VU_OWN, 'Turtles: keine Sperre, stattdessen Skip-Regel nach Gewinner-Ausbruch (umgesetzt)'),
    'SH-ONE-POSITION': x(P.VU_OWN, 'Turtles stocken bis 4 Units je Markt im Abstand ½ N auf – fehlt'),
    'SH-LONG-ONLY': x(P.VU_OWN, 'Turtles handelten long und short'),
    'SH-FILL-STOP': x(P.ORIGINAL, 'Ausbruch intraday am Kanal, Stop 2N'),
    'SH-FILL-NEXT-OPEN': x(P.VU_FORMALIZATION, ''),
    'SH-SIZE-RISK': x(P.ORIGINAL, 'Unit = 1 % je N (2 % bei 2N-Stop)'),
    'SH-NO-LEVERAGE': x(P.VU_OWN, 'Futures sind gehebelt – strukturelle Anpassung'),
    'SH-SELECT-SIMULTANEOUS': x(P.VU_OWN, 'ALPHA (alphabetisch) – ökonomisch bedeutungslos'),
    'SH-DEFAULTS': x(P.ORIGINAL, 'nicht genutzt'),
  },
});
