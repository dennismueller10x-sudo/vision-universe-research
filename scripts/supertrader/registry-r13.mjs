// Supertrader — Runde 13 (forensischer Audit, PREREGISTRATION-R13-AUDIT). Keine neue Handelsregel.
// Korrektur der Bewertung: Übernahmen wurden in Szenario S1 mit −30 % gebucht (bewiesen an SYNT und SCMP);
// mit SEC-klassifizierten Delistings (S1C) wurden die eingefrorenen Entscheidungsregeln aus R11/R12 erneut
// angewendet. Folgen: Weinstein 4.0.0 (Fortsetzungskäufe) live, Turtle-Marktampel zurückgenommen (2.0.2).
// Zusätzlich je Methode die geprüften, nicht übernommenen Versionen (Versionslinie für Kunden sichtbar).
export const R13 = Object.freeze({ WEINSTEIN_STAGE: '4.0.0', DONCHIAN_TURTLE: '2.0.2' });

export const RESEARCH_VERSIONS = Object.freeze({
  MOMENTUM_BREAKOUT: [],
  WEINSTEIN_STAGE: [],
  DARVAS_BOX: [],
  MINERVINI_VCP: [{ version: '3.0.0', round: 11, status: 'RESEARCH', note: 'Gewinn- und Umsatzfilter zum damaligen SEC-Stand. Verfehlte die vorab festgelegte Bedingung an unabhängigen Fällen (weniger Gewinner-Einstiege); bleibt Forschung.' }],
  DONCHIAN_TURTLE: [
    { version: '2.1.0', round: 11, status: 'RESEARCH', note: 'Rang gleichzeitiger Einstiege nach Stärke/N (Turtle Rules). Verfehlte die Fallbedingung (Verlust aufgenommener Fehlkandidaten); bleibt Forschung. Nicht zu verwechseln mit 2.0.1/2.0.2, die nur die Marktampel betreffen.' },
    { version: '2.0.1', round: 12, status: 'WITHDRAWN', note: 'Marktampel im Modellportfolio; in Runde 13 zurückgenommen, weil sie mit korrekt gebuchten Übernahmen 2016–2020 schlechter abschnitt als ohne Ampel.' },
  ],
});

export function applyR13({ weinstein, donchian, rule, strategies }) {
  // Weinstein 4.0.0: Fortsetzungsausbrüche in Stufe 2 (Regeln aus R11 unverändert).
  {
    const s = weinstein, v = R13.WEINSTEIN_STAGE, prev = s.strategy_version;
    s.previous_versions = [...(s.previous_versions || []), { version: prev, note: 'Nur Stufe-1-Basen. Ergebnis bleibt gültig; offene Setups und Positionen laufen unter 3.0.0 weiter.' }];
    for (const c of s.rule_cards || []) { c.plans_by_version = { ...(c.plans_by_version || {}), [prev]: { ...c.plan } }; c.rule_version = v; }
    s.strategy_version = v; for (const r of s.rules) r.strategy_version = v;
    s.rules.push(rule(v, 'WEIN-CONT-01', 'Fortsetzungskauf in Stufe 2: Nach einem 52-Wochen-Hoch mindestens 8 Wochen Konsolidierung, jeder Wochenschluss über der 30-Wochen-Linie, höchstens 25 % Tiefe, steigende 10-Wochen-Linie; Kauf-Stop am höchsten Tageshoch der Basis, Stop 2 % unter dem tiefsten Wochenschluss. Quelle: Weinsteins Fortsetzungskäufe (über stageanalysis.net mit Buchzitaten); die Zahlen sind VU-Formalisierung, vorab festgelegt (R11).', 'stage2 && base>=8w above MA30 && depth<=25% && MA10 rising -> buy-stop at base high', { minWeeks: 8, maxDepth: 0.25 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true));
    for (const c of s.rule_cards || []) { const p = (c.sections || []).find((x) => x.id === 'prepared'); if (p && !p.rules.includes('WEIN-CONT-01')) { p.text += ' Ab 4.0.0 zusätzlich Fortsetzungsbasen in Stufe 2.'; p.rules.push('WEIN-CONT-01'); } }
  }
  // Turtle 2.0.2: Rücknahme der Marktampel aus 2.0.1.
  {
    const s = donchian, v = R13.DONCHIAN_TURTLE, prev = s.strategy_version;
    s.previous_versions = [...(s.previous_versions || []), { version: prev, note: 'Marktampel im Modellportfolio; zurückgenommen (Runde 13).' }];
    for (const c of s.rule_cards || []) { c.plans_by_version = { ...(c.plans_by_version || {}), [prev]: { ...c.plan } }; c.rule_version = v; }
    s.strategy_version = v;
    s.rules = s.rules.filter((r) => r.rule_id !== 'PORT-MARKET-200');
    for (const r of s.rules) r.strategy_version = v;
    s.market_regime = { text: 'Keine Marktregel (wie in den Turtle Rules). Die Marktampel aus 2.0.1 wurde in Runde 13 zurückgenommen.', evidence: 'PRIMARY_EXPLICIT', rules: [] };
  }
  for (const s of strategies) s.research_versions = RESEARCH_VERSIONS[s.strategy_id] || [];
}
