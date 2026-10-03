// Supertrader — Runde 10: Fallprüfung großer Gewinner (PREREGISTRATION-R10-CASES/-FIXES).
// Gefundene Implementierungsfehler betreffen das Modellportfolio, nicht die Signale:
//  - Darvas 3.0.1: sechs Titel haben Platz (Höchstgewicht 1/6 statt 20 %).
//  - Gleichzeitige Einstiege nach relativer Stärke statt alphabetisch (Momentum, Weinstein,
//    Darvas, Minervini; Turtle ohne Quellenregel weiter alphabetisch).
//  - Aktienuniversum ohne ETFs, ETNs und geschlossene Fonds (Stammdaten-Fehlklassifikation).
export const R10 = Object.freeze({ DARVAS_BOX: '3.0.1' });

const RANK = ['PORT-RANK-RS', 'Modellportfolio (Runde 10): Kommen mehrere Einstiege am selben Tag und reicht der Platz nicht für alle, erhalten die Aktien mit der höheren relativen Stärke am Vortag den Vorzug. Bis Runde 10 entschied das Alphabet des Kürzels. Geprüft an unabhängigen Fällen und im Vollportfolio; ein Vorteil ist damit nicht belegt.', { priority: 'RS_PREVIOUS_DAY', tieBreak: 'SYMBOL' }, {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true];
const UNIVERSE = ['UNI-STOCKS-ONLY', 'Aktienuniversum (Runde 10): ETFs, bankemittierte ETNs und geschlossene Fonds, die in den Stammdaten als Aktie geführt werden, sind ausgeschlossen – zum Beispiel gehebelte ETNs, die nur den Namen der emittierenden Bank tragen.', { exclude: ['NYSE_ARCA', 'PRODUCT_NAME', 'FUND_NAME', 'ETN_ISSUER'] }, {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true];

export function applyR10({ momentum, weinstein, darvas, minervini, donchian, rule }) {
  const prev = darvas.strategy_version;
  darvas.previous_versions = [...(darvas.previous_versions || []), { version: prev, note: 'Signale, Stops und Ausstiege unverändert; nur das Modellportfolio konnte die belegten sechs Titel nicht halten. Ergebnis der Vorversion bleibt gültig.' }];
  for (const c of darvas.rule_cards || []) { c.plans_by_version = { ...(c.plans_by_version || {}), [prev]: { ...c.plan } }; c.rule_version = R10.DARVAS_BOX; }
  darvas.strategy_version = R10.DARVAS_BOX;
  for (const r of darvas.rules) r.strategy_version = R10.DARVAS_BOX;
  darvas.rules.push(rule(R10.DARVAS_BOX, 'DAR-PORT-02', 'Höchstens sechs Titel gleichzeitig (TIME 1959); jeder Titel darf höchstens ein Sechstel des Kapitals binden, damit alle sechs Platz haben. In 3.0.0 ließ das Höchstgewicht von 20 % nur fünf volle Positionen zu.', { maxPositions: 6, maxPositionPct: 1 / 6 }, {}, ['SRC-ND-TIME-1959'], 'VU_FORMALIZATION', true));
  for (const s of [momentum, weinstein, darvas, minervini]) s.rules.push(rule(s.strategy_version, ...RANK));
  for (const s of [momentum, weinstein, darvas, minervini, donchian]) s.rules.push(rule(s.strategy_version, ...UNIVERSE));
}
