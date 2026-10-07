// Supertrader R15 – Layer C: Portfolio- und Ausführungsregeln je Strategie, explizit und mit Herkunft je Feld.
//
// Problem (R14/R15): Strategien ohne eigene Portfolioangabe erbten still engine/backtest.mjs PORTFOLIO_DEFAULTS
// (riskPerTrade 0,5 % = Kullamägis KK-RISK-01). So kam eine Kullamägi-Zahl in Weinstein. Gleichzeitige Signale
// wurden je nach Strategie nach RS oder alphabetisch gewählt, ohne dass die Regelkarte das zeigte.
//
// Diese Datei beschreibt die LIVE-Konfiguration, ändert sie aber NICHT: resolvePortfolioPolicy(engine).cfg ist
// per Test identisch zu model-portfolio.mjs portfolioConfig(engine). Neue Engines ohne eigene Policy schlagen fehl
// (assertExplicitPolicy), statt still Defaults zu erben.
import { PROVENANCE as P } from './taxonomy.mjs';

const f = (value, provenance, source, note = '') => Object.freeze({ value, provenance, source, note });

// Gemeinsame Rahmenwerte, die keine Methodenregel sind (Modellkapital, Bewertungszins) – überall gleich und so ausgewiesen.
export const FRAME = Object.freeze({
  initialEquity: f(100000, P.VU_OWN, 'SRC-INTERNAL-VU', 'Modellkapital zur Darstellung; keine Methodenregel'),
  riskFreeRate: f(0.02, P.VU_OWN, 'SRC-INTERNAL-VU', 'nur für Kennzahlen'),
});

export const PORTFOLIO_POLICIES = Object.freeze({
  MOMENTUM_BREAKOUT: Object.freeze({
    version: '3.2.0',
    fields: {
      riskPerTrade: f(0.005, P.ORIGINAL, 'SRC-KK-FAQ (KK-RISK-01)', 'Kullamägi: meist 0,3–0,5 % Risiko je Trade'),
      maxPositionPct: f(0.25, P.ORIGINAL_INTERPRETATION, 'SRC-KK-FAQ', 'FAQ: meist 5–25 %, nie > 30 % über Nacht'),
      maxPositions: f(10, P.VU_OWN, 'SRC-INTERNAL-VU', 'Kullamägi nennt keine Höchstzahl'),
      maxExposure: f(1.0, P.VU_OWN, 'SRC-INTERNAL-VU', 'ohne Margin; Kullamägi nutzt Margin'),
      priority: f('RS', P.VU_FORMALIZATION, 'PREREGISTRATION-R10-FIXES K3', 'Kullamägi: stärkste 1–2 %; Rang am Vortag'),
    },
  }),
  WEINSTEIN_STAGE: Object.freeze({
    version: '4.0.0',
    implicitDefaults: ['riskPerTrade', 'maxPositionPct', 'maxPositions', 'maxExposure'], // Engine hat portfolio: null
    fields: {
      riskPerTrade: f(0.005, P.FOREIGN_RULE, 'engine/backtest.mjs PORTFOLIO_DEFAULTS (KK-RISK-01)', 'Kullamägis Risikozahl, still geerbt – keine Weinstein-Quelle'),
      maxPositionPct: f(0.2, P.VU_OWN, 'engine/backtest.mjs PORTFOLIO_DEFAULTS', 'still geerbt'),
      maxPositions: f(10, P.VU_OWN, 'engine/backtest.mjs PORTFOLIO_DEFAULTS', 'still geerbt'),
      maxExposure: f(1.0, P.VU_OWN, 'engine/backtest.mjs PORTFOLIO_DEFAULTS', 'still geerbt'),
      priority: f('RS', P.VU_FORMALIZATION, 'PREREGISTRATION-R10-FIXES K3', 'Weinstein: starke relative Stärke bevorzugen'),
    },
  }),
  DARVAS_BOX: Object.freeze({
    version: '3.0.2',
    fields: {
      riskPerTrade: f(0.005, P.FOREIGN_RULE, 'darvas-v3.mjs PORTFOLIO („VU-Standard“ = KK-RISK-01)', 'Zahlenwert aus Kullamägis Regel; bindet nie, weil die 1/6-Kappe greift'),
      maxPositionPct: f(1 / 6, P.ORIGINAL_INTERPRETATION, 'SRC-ND-TIME-1959', '„five or six stocks at a time“ → 1/6 je Titel'),
      maxPositions: f(6, P.ORIGINAL, 'SRC-ND-TIME-1959', '5–6 Aktien gleichzeitig'),
      maxExposure: f(1.0, P.VU_OWN, 'SRC-INTERNAL-VU', 'ohne Kredit; Darvas nutzte Kredit'),
      priority: f('RS', P.VU_FORMALIZATION, 'PREREGISTRATION-R10-FIXES K3', 'Darvas: stark steigende Aktien'),
      marketFilter: f(true, P.FOREIGN_RULE, 'SRC-TF-NEO-PP (PORT-MARKET-200)', 'TraderFox-Marktampel, keine Darvas-Regel'),
    },
  }),
  MINERVINI_VCP: Object.freeze({
    version: '2.0.0',
    fields: {
      riskPerTrade: f(0.0125, P.ORIGINAL_INTERPRETATION, 'SRC-MM-X-RISK', 'Minervini nennt Durchschnittsrisiken; genaue Zahl nicht im Abruf verifiziert'),
      maxPositionPct: f(0.25, P.ORIGINAL_INTERPRETATION, 'SRC-MM-INTERVIEWS', 'bis etwa 25 % je Position'),
      maxPositions: f(10, P.ORIGINAL_INTERPRETATION, 'SRC-MM-INTERVIEWS', '8–10(–12) Positionen'),
      maxExposure: f(1.0, P.VU_OWN, 'SRC-INTERNAL-VU', 'ohne Margin'),
      priority: f('RS', P.VU_FORMALIZATION, 'PREREGISTRATION-R10-FIXES K3', 'Minervini: Führende zuerst'),
      progressive: f({ lookback: 5, factor: 0.5 }, P.VU_FORMALIZATION, 'SRC-MM-X-RISK', 'progressive Exposition nur als Halbierung nach netto negativen 5 Trades'),
    },
  }),
  DONCHIAN_TURTLE: Object.freeze({
    version: '2.0.2',
    fields: {
      riskPerTrade: f(0.02, P.ORIGINAL, 'SRC-TURTLE-PDF (TUR-UNIT-01)', '1 % je N bei 2N-Stop = 2 % Risiko'),
      maxPositionPct: f(1.0, P.VU_OWN, 'donchian-v2.mjs PORTFOLIO', 'keine Gewichtsgrenze je Aktie – bei Futures über Margin/Units begrenzt; bei Aktien sehr hohe Einzelgewichte beobachtet'),
      maxPositions: f(12, P.ORIGINAL_INTERPRETATION, 'SRC-TURTLE-PDF', '12 Units je Richtung; hier eine Unit je Aktie (VU-Anpassung)'),
      maxExposure: f(1.0, P.VU_OWN, 'SRC-INTERNAL-VU', 'ohne Hebel; Turtles handelten gehebelte Futures'),
      priority: f('ALPHA', P.VU_OWN, 'model-portfolio.mjs RANK_RS (Turtle nicht enthalten)', 'alphabetisch – ökonomisch bedeutungslos; Turtle Rules nennen Stärke-Rang'),
      turtleNotional: f({ stepLoss: 0.1, cut: 0.2 }, P.ORIGINAL, 'SRC-TURTLE-PDF (TUR-NOTIONAL-01)', 'Notionalkonto −20 % je 10 % Verlust'),
    },
  }),
});

// Selektionsregel bei gleichzeitigen Signalen: Herkunft und ob eine VU-Formalisierung noch fehlt (R15 Abschnitt 22).
export const SELECTION_POLICY = Object.freeze({
  RS: { economic: true, tieBreak: 'listingId alphabetisch nur bei exakt gleicher RS (selten)' },
  SCORE: { economic: true, tieBreak: 'listingId alphabetisch nur bei exakt gleichem Score' },
  ALPHA: { economic: false, tieBreak: 'alphabetisch nach listingId – entscheidet direkt', requires: 'VU_FORMALIZATION_REQUIRED' },
  RALPHA: { economic: false, tieBreak: 'umgekehrt alphabetisch (nur Gegenprobe)', requires: 'VU_FORMALIZATION_REQUIRED' },
});

export class ImplicitPolicyError extends Error {}

// Live-Engines ohne eigene Portfolioangabe, die bis zu einer neuen Version geduldet und als Befund ausgewiesen werden.
export const LEGACY_IMPLICIT = new Set(['WEINSTEIN_STAGE']);

export function assertExplicitPolicy(engine) {
  const pol = PORTFOLIO_POLICIES[engine.id];
  if (!pol) throw new ImplicitPolicyError(`${engine.id}: keine explizite Portfolio-Policy (Layer C) – stilles Erben von Defaults ist nicht erlaubt`);
  if (!engine.portfolio && !LEGACY_IMPLICIT.has(engine.id)) throw new ImplicitPolicyError(`${engine.id}@${engine.version}: Engine ohne eigene portfolio-Angabe`);
  return pol;
}

// Baut die Konfiguration ausschließlich aus der expliziten Policy (+ Rahmenwerte).
export function resolvePortfolioPolicy(engine) {
  const pol = assertExplicitPolicy(engine);
  const cfg = { initialEquity: FRAME.initialEquity.value, riskFreeRate: FRAME.riskFreeRate.value };
  for (const [k, v] of Object.entries(pol.fields)) cfg[k] = v.value;
  return { cfg, policy: pol, selection: SELECTION_POLICY[cfg.priority || 'ALPHA'] };
}

// Felder je Strategie, deren Herkunft einen Replication-Claim im Portfolio-/Sizing-Bereich verbietet.
export function blockingFields(strategyId) {
  const pol = PORTFOLIO_POLICIES[strategyId];
  return Object.entries(pol.fields).filter(([, v]) => v.provenance === P.FOREIGN_RULE || v.provenance === P.VU_OWN || v.provenance === P.UNRESOLVED).map(([k, v]) => ({ field: k, provenance: v.provenance, note: v.note }));
}
