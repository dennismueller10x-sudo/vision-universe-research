// Supertrader — Regelversionen 2.0.0 aus Runde 7 (Momentum, Weinstein, Darvas,
// Minervini). Eigene Datei: registry.mjs beschreibt die Methoden; hier wird die
// laufende Version umgestellt und jede geaenderte Regel mit Quelle ergaenzt.
// Regeln, die nur noch fuer offene Positionen der Vorversion gelten, bleiben
// mit legacy_only stehen (Protokoll und Positionsfuehrung bleiben lesbar).
//
// Quelle der Regeln: PREREGISTRATION-R7.json und engine/strategies/*-v2.mjs.

export const R7_VERSION = '2.0.0';

export function applyR7({ momentum, weinstein, darvas, minervini, rule }) {
  const bump = (s, legacyIds, prev) => {
    s.previous_versions = [...(s.previous_versions || []), { version: prev, note: 'Ergebnis der vorab festgelegten Prüfung bleibt gültig; offene Positionen laufen nach dieser Version weiter.' }];
    s.strategy_version = R7_VERSION;
    for (const r of s.rules) {
      r.strategy_version = R7_VERSION;
      if (legacyIds.includes(r.rule_id)) r.legacy_only = prev;
    }
    for (const c of s.rule_cards || []) c.rule_version = R7_VERSION;
  };
  const add = (s, ...rules) => s.rules.push(...rules.map((x) => rule(R7_VERSION, ...x)));
  const section = (s, key, text, ruleIds) => {
    const c = s.rule_cards[0];
    const sec = c.sections.find((x) => x.key === key || x.id === key);
    if (sec) { sec.text = text; if (ruleIds) sec.rules = ruleIds; }
  };

  /* ---------------------------------------------------------- Momentum */
  bump(momentum, ['KK-BO-TRAIL-01'], '1.1.0');
  add(momentum, ['KK-BO-TRAIL-02', 'Erst nach dem Teilverkauf: den Rest beim ersten Schlusskurs unter der 10-Tage-Linie verkaufen (zur nächsten Eröffnung). Vorher gilt nur der Stop am Tief des Ausbruchstags.', 'partialDone && close(t) < sma10(t) -> sell remainder at open(t+1)', { ma: 10 }, ['SRC-KK-SETUPS', 'SRC-KK-FAQ'], 'PRIMARY_EXPLICIT', false]);
  momentum.how_it_thinks = momentum.how_it_thinks.map((x) => (/10-Tage-Linie laufen/.test(x) ? 'Nach 3 Tagen ein Drittel verkaufen und den Rest auf Einstand absichern; erst dieser Rest läuft mit der 10-Tage-Linie' : x));
  momentum.rule_cards[0].plan.exitSummary = 'Stop (Tief des Bestätigungstags, ≤ 1 ADR) · nach 3 Sitzungen 1/3 verkaufen, Rest-Stop auf Einstand · erst danach: Rest bei Schluss unter der 10-Tage-Linie';
  section(momentum, 'hold', 'Bis zum Teilverkauf zählt nur der Anfangsstop. Nach 3 Sitzungen 1/3 zur Eröffnung verkaufen, Rest-Stop auf Einstand.', ['KK-BO-SCALE-01', 'LC-ACTIVE']);
  section(momentum, 'exit', 'Stop (ruhende Stop-Order-Annahme); nach dem Teilverkauf zusätzlich erster Schluss unter der 10-Tage-Linie → Rest zur nächsten Eröffnung.', ['KK-BO-TRAIL-02', 'LC-STOP-ORDER-ASSUMPTION']);

  /* ---------------------------------------------------------- Weinstein */
  bump(weinstein, ['WEIN-RS-01', 'WEIN-VOL-01', 'WEIN-TRAIL-VU'], '1.1.0');
  add(weinstein,
    ['WEIN-MKT-01', 'Gesamtmarkt nicht in Stufe 4: SPY schließt die Woche über seiner 30-Wochen-Linie, und diese fällt nicht. Sonst kein Einstieg.', 'spyWeekClose > spyMa30 && spyMa30(k) >= spyMa30(k-4) * (1 - 0.005)', { maWeeks: 30, slopeWeeks: 4 }, ['SRC-SW-BOOK', 'SRC-SW-BULKOWSKI', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true],
    ['WEIN-RS-02', 'Relative Stärke zum Markt positiv (Mansfield-RS über der Nulllinie) in der Ausbruchswoche. Sonst kein Einstieg.', '(close/SPY) / sma52(close/SPY) - 1 > 0', { weeks: 52 }, ['SRC-SW-BOOK', 'SRC-SW-BULKOWSKI'], 'MULTI_SOURCE_CONFIRMED', false],
    ['WEIN-VOL-03', 'Volumen der Ausbruchswoche mindestens doppelt so hoch wie der Schnitt der vier Vorwochen. Sonst kein Einstieg.', 'weekVolume >= 2 * mean(weekVolume[k-4..k-1])', { multiple: 2, weeks: 4 }, ['SRC-SW-BOOK', 'SRC-SW-BULKOWSKI'], 'MULTI_SOURCE_CONFIRMED', false],
    ['WEIN-BASE-02', 'Eine vorbereitete Basis bleibt bis zum Ausbruch, bis zum Bruch der Basis oder bis zum Zeitablauf bestehen – auch wenn die 30-Wochen-Linie vor dem Ausbruch zu steigen beginnt.', 'pending && !(close < invalidation) && sessions <= 60 -> keep trigger', {}, ['SRC-SW-BOOK', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true],
    ['WEIN-ST2-02', 'Einstieg bestätigt: Wochenschluss über dem Widerstand, Markt nicht in Stufe 4, positive relative Stärke, Volumen mindestens doppelt. Modelleinstieg zur Eröffnung der Folgewoche.', 'weekClose > resistance && WEIN-MKT-01 && WEIN-RS-02 && WEIN-VOL-03', {}, ['SRC-SW-BOOK', 'SRC-SW-BULKOWSKI'], 'MULTI_SOURCE_CONFIRMED', false],
    ['WEIN-ST2-02U', 'Wie WEIN-ST2-02, aber eine der Prüfgrößen (Volumen, Marktlinie oder relative Stärke) war nicht verfügbar – als „nicht prüfbar“ protokolliert.', 'WEIN-ST2-02 with missing input', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true],
    ['WEIN-STOP-01', 'Anfangsstop 2 % unter dem Tief der Basis.', 'stop = baseSupport * 0.98', { buffer: 0.02 }, ['SRC-SW-BOOK', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true]);
  weinstein.rule_cards[0].plan.exitSummary = 'Stop 2 % unter der Basis · Ausstieg bei Wochenschluss unter der 30-Wochen-Linie (zur nächsten Eröffnung)';
  section(weinstein, 'exit', 'Anfangsstop unter der Basis oder Wochenschluss unter der 30-Wochen-Linie → Verkauf zur nächsten Eröffnung. Kein Stop innerhalb der Woche an der Linie (das war eine VU-Regel bis 1.1.0).', ['WEIN-EXIT-01', 'WEIN-STOP-01']);

  /* ---------------------------------------------------------- Darvas */
  bump(darvas, [], '1.2.0');
  add(darvas, ['DAR-STOP-02', 'Anfangsstop knapp unter der Ausbruchsmarke: 1 % unter der Boxoberkante. Darvas legte seinen Stop „just below his buy order“ (TIME, 1959).', 'stop = boxTop * 0.99', { below: 0.01 }, ['SRC-ND-TIME-1959', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true]);
  darvas.rules.find((r) => r.rule_id === 'DAR-STOP-01').legacy_note = 'Bis 1.2.0 auch Anfangsstop an der Boxunterkante; ab 2.0.0 nur noch Nachziehen an höhere Boxen.';
  darvas.rule_cards[0].plan.exitSummary = 'Anfangsstop 1 % unter der Boxoberkante · mit jeder höheren, bestätigten Box an deren Unterkante nachgezogen';
  section(darvas, 'initialStop', '1 % unter der Boxoberkante (Ausbruchsmarke). Bis Version 1.2.0: Boxunterkante.', ['DAR-STOP-02']);

  /* ---------------------------------------------------------- Minervini */
  bump(minervini, ['MIN-LOW-01', 'MIN-EXIT-VU-01'], '1.1.0');
  add(minervini,
    ['MIN-LOW-02', 'Kurs mindestens 30 % über dem 52-Wochen-Tief (Fassung des Buchs von 2013; 1.1.0 nutzte die ältere 25-%-Fassung).', 'close >= 1.30 * low252', { lowDistance: 1.3 }, ['SRC-MM-BOOK-TLSMW', 'SRC-MM-TT-SECONDARY'], 'DISPUTED', false],
    ['MIN-ENTRY-D2', 'Einstieg bestätigt: Tagesschluss über dem Pivot bei mindestens 1,4-fachem 50-Tage-Durchschnittsvolumen. Ohne Volumen kein Einstieg.', 'close(t) > pivot && volume(t) >= 1.4 * vol50(t-1)', { volume: 1.4 }, ['SRC-MM-BOOK-TLSMW', 'SRC-MM-TT-SECONDARY'], 'SECONDARY_ONLY', false],
    ['MIN-STOP-01', 'Anfangsstop am Tief der letzten Kontraktion, höchstens 10 % unter dem Einstieg.', 'stop = max(contractionLow, open * 0.90)', { maxRisk: 0.1 }, ['SRC-MM-X-RISK', 'SRC-MM-BOOK-TLSMW'], 'SECONDARY_ONLY', false],
    ['MIN-BE-01', 'Stop auf Einstand, sobald der Schluss drei Anfangsrisiken über dem Einstieg liegt („nie einen guten Gewinn zum Verlust werden lassen“).', 'close >= entry + 3 * (entry - initialStop) -> stop = max(stop, entry)', { r: 3 }, ['SRC-MM-X-RISK'], 'PRIMARY_INFERRED', false],
    ['MIN-EXIT-02', 'Ausstieg bei Schluss unter der 50-Tage-Linie mit überdurchschnittlichem Volumen (zur nächsten Eröffnung).', 'close < sma50 && volume > vol50 -> sell at open(t+1)', { volume: 1 }, ['SRC-MM-TT-SECONDARY'], 'SECONDARY_ONLY', false],
    ['MIN-WARN-02', 'Warnung bei Schluss unter dem Pivot oder unter der 50-Tage-Linie ohne erhöhtes Volumen.', 'close < pivot || close < sma50', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true],
    ['MIN-SIZE-01', 'Modellportfolio: 1,25 % Risiko je Trade, höchstens 25 % je Position; nach netto negativen letzten fünf Trades halbes Risiko.', 'shares = equity * 0.0125 / (entry - stop), cap 25 %; progressive(5, 0.5)', { risk: 0.0125, maxPosition: 0.25 }, ['SRC-MM-X-RISK', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true]);
  minervini.rule_cards[0].plan.exitSummary = 'Stop am Kontraktionstief (≤ 10 %) · Einstand ab 3 Anfangsrisiken Gewinn · Ausstieg bei Schluss unter der 50-Tage-Linie mit erhöhtem Volumen';
  section(minervini, 'exit', 'Stop (ruhende Stop-Order-Annahme) oder Schluss unter der 50-Tage-Linie bei überdurchschnittlichem Volumen → Verkauf zur nächsten Eröffnung. Ab 3 Anfangsrisiken Gewinn liegt der Stop mindestens auf Einstand.', ['MIN-EXIT-02', 'MIN-BE-01', 'MIN-STOP-01']);
  for (const s of [momentum, weinstein, darvas, minervini]) {
    const c = s.rule_cards[0];
    c.historical_validation = { status: 'PREREGISTERED_R7', note: 'Version 2.0.0 ist vorab registriert (PREREGISTRATION-R7.json) und wird intern geprüft; das Ergebnis wird erst nach Klärung der Veröffentlichungsrechte gezeigt.' };
  }
}
