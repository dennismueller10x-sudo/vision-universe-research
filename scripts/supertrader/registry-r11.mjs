// Supertrader — Runde 11 (PREREGISTRATION-R11). Live übernommen wird nur die Fehlerkorrektur
// Momentum 3.2.0: Der Stop des Rests wandert erst auf den Einstiegskurs, wenn ein Schlusskurs darüber
// liegt. Bis 3.1.0 stand der Stop nach drei Tagen auch dann auf Einstand, wenn der Kurs darunter lag –
// ein Verkaufsstop über dem Markt, der den Rest am nächsten Morgen verkaufte.
// Weinstein 4.0.0 (Fortsetzungsausbrüche), Minervini 3.0.0 (Gewinnfilter) und Turtle 2.1.0 (Rang nach
// Stärke) verfehlten je eine vorab festgelegte Übernahmebedingung und bleiben Forschung.
export const R11 = Object.freeze({ MOMENTUM_BREAKOUT: '3.2.0' });
const OLD = 'Rest-Stop auf Einstand';
const NEW = 'Rest-Stop auf Einstand, sobald ein Schlusskurs über dem Einstieg liegt';

export function applyR11({ momentum, rule }) {
  const prev = momentum.strategy_version;
  momentum.previous_versions = [...(momentum.previous_versions || []), { version: prev, note: 'Fallprüfung (Runde 11): Nach drei Tagen wanderte der Stop auch dann auf Einstand, wenn der Kurs darunter lag – der Rest wurde am nächsten Morgen verkauft. Ergebnis der vorab festgelegten Prüfung bleibt gültig; offene Positionen laufen nach ihrer Version weiter.' }];
  for (const c of momentum.rule_cards || []) {
    c.plans_by_version = { ...(c.plans_by_version || {}), [prev]: { ...c.plan } };
    c.rule_version = R11.MOMENTUM_BREAKOUT;
    for (const s of c.sections || []) if (typeof s.text === 'string' && s.text.includes(OLD) && !s.text.includes(NEW)) { s.text = s.text.replace(OLD, NEW); if (Array.isArray(s.rules) && !s.rules.includes('KK-BO-BE-02')) s.rules.push('KK-BO-BE-02'); }
  }
  momentum.strategy_version = R11.MOMENTUM_BREAKOUT;
  for (const r of momentum.rules) {
    r.strategy_version = R11.MOMENTUM_BREAKOUT;
    if (r.rule_id === 'KK-BO-SCALE-01' && typeof r.plain_language_explanation === 'string') r.plain_language_explanation = r.plain_language_explanation.replace('den Stop für den Rest auf Einstand ziehen', 'den Stop für den Rest auf Einstand ziehen, sobald ein Schlusskurs über dem Einstieg liegt (KK-BO-BE-02)');
  }
  momentum.rules.push(rule(R11.MOMENTUM_BREAKOUT, 'KK-BO-BE-02', 'Einstand erst im Gewinn: Nach dem Teilverkauf wandert der Stop für den Rest auf den Einstiegskurs, sobald ein Schlusskurs darüber liegt. Liegt der Kurs darunter, bleibt der bisherige Stop – ein Verkaufsstop über dem Markt würde den Rest sofort verkaufen. Quelle: „sell 1/3 to 1/2 of the position after 3-5 days, and then move the stop to break even“.', 'if (partialDone or held >= 3) and close > entry and stop < entry: stop = entry', { condition: 'CLOSE_ABOVE_ENTRY' }, ['SRC-KK-SETUPS'], 'VU_FORMALIZATION', true));
}
