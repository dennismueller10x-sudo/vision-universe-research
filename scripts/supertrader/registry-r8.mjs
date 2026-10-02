// Supertrader — Regelversionen aus Runde 8. Anlass: Die Originalquellen wurden
// erstmals im Volltext gelesen (Kullamägi-Website, Original-Turtle-Regeln als
// PDF, TIME 1959/1960 zu Darvas, Weinstein-Buchzitate bei Bulkowski). Alle
// Quellen beschreiben einen Kauf per Order AM Ausbruchspunkt im Tagesverlauf.
// Die Umsetzung bis Runde 7 verwendete fuer alle Methoden dieselbe VU-Konvention
// (Schlusskurs-Bestaetigung + Kauf zur naechsten Eroeffnung, LC-CONFIRM-CLOSE).
// Das war kein Lesefehler der Deep Research, sondern ein Uebertragungsfehler
// in den Code. Neue Versionen: Momentum 3.0.0, Donchian/Turtle 2.0.0, Darvas
// 3.0.0, Weinstein 3.0.0. Minervini bleibt 2.0.0 (keine frei lesbare Primaerquelle).
//
// Quelle der Regeln: PREREGISTRATION-R8*.json und engine/strategies/*-v3.mjs, donchian-v2.mjs.

export const R8 = Object.freeze({ MOMENTUM_BREAKOUT: '3.0.0', DONCHIAN_TURTLE: '2.0.0', DARVAS_BOX: '3.0.0', WEINSTEIN_STAGE: '3.0.0' });

const BUYSTOP_LC = ['LC-BUY-STOP', 'Kauforder am Ausbruchspunkt (Runde 8): Der Trigger steht seit dem Vortagesschluss fest. Steigt das Tageshoch darüber, gilt das Modell als gekauft – zum Trigger oder, bei einer Eröffnung darüber, zur Eröffnung, jeweils plus 10 bp Slippage. So beschreiben es alle Quellen; Schlusskurs-Bestätigung war eine VU-Konvention bis Runde 7.', 'high(t) > trigger(t-1) -> entry = max(open(t), trigger) * (1 + slip)'];
const SAMEDAY_LC = ['LC-SAME-DAY', 'Einstiegstag mit Tagesbalken: Schließt der Tag auf oder unter dem Stop, wurde der Stop nach dem Kauf sicher durchschritten – Ausstieg zum Stop am selben Tag. Ob ein Tagestief VOR oder NACH dem Kauf lag, zeigen Tagesbalken nicht; die vorsichtige Gegenprobe zählt jedes Tief unter dem Stop als Ausstieg.', 'close(t) <= stop -> exit at stop (t); pessimistic: low(t) <= stop -> exit'];

export function applyR8({ momentum, weinstein, darvas, minervini, donchian, rule }) {
  const bump = (s, v, legacyIds, prev, srcAdd = []) => {
    s.previous_versions = [...(s.previous_versions || []), { version: prev, note: 'Ergebnis der vorab festgelegten Prüfung bleibt gültig; offene Positionen laufen nach ihrer Version weiter.' }];
    // Plan der Vorversion aufbewahren: offene Positionen zeigen Ein-/Ausstieg nach ihrer eigenen Version.
    for (const c of s.rule_cards || []) c.plans_by_version = { ...(c.plans_by_version || {}), [prev]: { ...c.plan } };
    s.strategy_version = v;
    for (const r of s.rules) { r.strategy_version = v; if (legacyIds.includes(r.rule_id)) r.legacy_only = prev; }
    for (const c of s.rule_cards || []) c.rule_version = v;
    s.sources = [...new Set([...s.sources, ...srcAdd])];
    s.rules.push(rule(v, ...BUYSTOP_LC, {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true), rule(v, ...SAMEDAY_LC, {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true));
  };
  const add = (s, ...rules) => s.rules.push(...rules.map((x) => rule(s.strategy_version, ...x)));
  const section = (s, key, text, ruleIds, edge = false) => {
    const c = s.rule_cards[0];
    // Sektionen sind teils gemeinsame Objekte mehrerer Karten (z. B. DAILY_EXEC):
    // ersetzen statt veraendern, sonst wandert eine Regel in fremde Methoden.
    const list = edge ? c.edge_cases : c.sections;
    const i = list.findIndex((x) => x.id === key || x.key === key);
    if (i >= 0) list[i] = { ...list[i], text, rules: ruleIds || list[i].rules };
  };
  const plan = (s, o) => Object.assign(s.rule_cards[0].plan, { confirmBasis: 'INTRADAY_BUY_STOP', confirmText: 'Kauf-Stop über', ...o });

  /* ---------------------------------------------------------- Momentum 3.0.0 */
  bump(momentum, R8.MOMENTUM_BREAKOUT, ['KK-BO-ENTRY-D1', 'KK-BO-STOP-D1', 'KK-BO-GAP-01', 'LC-CONFIRM-CLOSE'], '2.0.0', ['SRC-KK-EP']);
  add(momentum,
    ['KK-BO-ENTRY-ORH-D', 'Einstieg, sobald die Aktie im Tagesverlauf über das Hoch der letzten 5 Sitzungen steigt (Kauf-Stop). Kullamägi: „just look at the daily chart and enter when the stock is starting to break out“. Eröffnet sie darüber, Kauf zur Eröffnung.', 'high(t) > max(high[t-5..t-1]) -> entry = max(open(t), trigger)', { pivotBars: 5 }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false],
    ['KK-BO-STOP-LOD', 'Stop am Tagestief des Einstiegstags („Stop is always lows of the day“).', 'stop = low(entryDay)', {}, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false],
    ['KK-BO-STOP-ADR', 'Liegt das Tagestief weiter als eine durchschnittliche Tagesspanne (ADR, 20 Tage) unter dem Einstieg, gilt der Stop 1 ADR unter dem Einstieg („should not be wider than the ATR or ADR“).', 'stop = max(low(entryDay), entry * (1 - ADR20(t-1)))', {}, ['SRC-KK-SETUPS', 'SRC-KK-FAQ'], 'PRIMARY_EXPLICIT', false],
    ['KK-BO-PORT-02', 'Höchstens 25 % des Kontos je Position (FAQ: „generally 5%-25%“), 0,5 % Risiko je Trade, höchstens 10 Positionen (Zahl 10 ist VU).', 'positionValue <= 0.25 * equity; risk 0.5 %; maxPositions 10', { maxPositionPct: 0.25, risk: 0.005, maxPositions: 10 }, ['SRC-KK-FAQ', 'SRC-INTERNAL-VU'], 'PRIMARY_EXPLICIT', true]);
  plan(momentum, { confirmRuleId: 'KK-BO-ENTRY-ORH-D', exitSummary: 'Stop am Tagestief des Einstiegstags (≤ 1 ADR) · nach 3 Sitzungen 1/3 verkaufen, Rest-Stop auf Einstand · erst danach: Rest bei Schluss unter der 10-Tage-Linie' });
  section(momentum, 'confirmation', 'Kauf-Stop über dem Hoch der letzten 5 Sitzungen (Stand Vortagesschluss). Steigt der Kurs im Tagesverlauf darüber, gilt das Modell als gekauft.', ['KK-BO-ENTRY-ORH-D', 'KK-BO-ENTRY-ORH', 'LC-BUY-STOP']);
  section(momentum, 'execution', 'Ausführung zum Trigger oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Tagesbalken; das Opening-Range-Hoch der ersten Minuten ist mangels Intraday-Historie durch das 5-Tage-Hoch ersetzt.', ['LC-BUY-STOP', 'LC-MODEL-ENTRY']);
  section(momentum, 'initialStop', 'Tagestief des Einstiegstags, höchstens 1 ADR unter dem Einstieg. Schließt der Einstiegstag unter dem Stop, Ausstieg am selben Tag.', ['KK-BO-STOP-LOD', 'KK-BO-STOP-ADR', 'LC-SAME-DAY']);
  section(momentum, 'gap', 'Eröffnung über dem Trigger: Kauf zur Eröffnung. Keine Gap-Sperre mehr (stand nicht in der Quelle; bis 2.0.0 VU).', ['KK-BO-ENTRY-ORH-D', 'LC-BUY-STOP'], true);
  momentum.how_it_thinks = momentum.how_it_thinks.map((x) => (/Tagesschluss|Schlusskurs/.test(x) ? 'Kaufen, sobald die Aktie im Tagesverlauf aus der engen Basis ausbricht – Stop am Tagestief' : x));

  /* ---------------------------------------------------------- Donchian/Turtle 2.0.0 */
  bump(donchian, R8.DONCHIAN_TURTLE, ['DON-ENTRY-D1', 'DON-STOP-01', 'DON-EXIT-01', 'LC-CONFIRM-CLOSE'], '1.1.0', ['SRC-TURTLE-PDF']);
  add(donchian,
    ['TUR-ENTRY-S1-20', 'System 1: Kauf, sobald der Kurs das Hoch der letzten 20 Tage im Tagesverlauf überschreitet; bei Eröffnung darüber zur Eröffnung („did not wait until the daily close or the open of the following day“).', 'high(t) > max(high[t-20..t-1]) -> entry = max(open(t), trigger)', { bars: 20 }, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false],
    ['TUR-S1-FILTER', 'Ein System-1-Ausbruch wird ausgelassen, wenn der letzte Ausbruch ein Gewinner gewesen wäre – egal ob er gehandelt wurde. Verlierer: 2N gegen die Position vor einem profitablen 10-Tage-Ausstieg. Läuft der letzte gedachte Ausbruch noch, zählt er wie ein Gewinner (VU).', 'lastBreakout(hypothetical S1) in {WIN, OPEN} -> skip S1', {}, ['SRC-TURTLE-PDF', 'SRC-INTERNAL-VU'], 'PRIMARY_EXPLICIT', true],
    ['TUR-FAILSAFE-55', 'Wurde ein Ausbruch ausgelassen, Einstieg am 55-Tage-Hoch („Failsafe Breakout“).', 'skip -> trigger = max(high[t-55..t-1])', { bars: 55 }, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false],
    ['TUR-N-01', 'N = 20-Tage-EMA der True Range: N = (19 × N des Vortags + TR) / 20.', 'N(t) = (19 * N(t-1) + TR(t)) / 20', {}, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false],
    ['TUR-STOP-2N', 'Stop 2N unter dem tatsächlichen Einstieg.', 'stop = entry - 2 * N(t-1)', { multiple: 2 }, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false],
    ['TUR-EXIT-S1-10D', 'Ausstieg, sobald der Kurs im Tagesverlauf unter das Tief der letzten 10 Tage fällt (die Turtles gaben die Order, sobald der Kurs die Marke durchschritt).', 'low(t) < min(low[t-10..t-1]) -> exit at min(open, level)', { bars: 10 }, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false],
    ['TUR-UNIT-01', 'Unit: 1 % des Kontos je N (bei 2N-Stop 2 % Risiko). Höchstens 12 Units je Richtung; hier eine Unit je Aktie, also höchstens 12 Titel, ohne Hebel (VU).', 'shares = 0.01 * notional / N; maxPositions 12; exposure <= 100 %', { riskAt2N: 0.02, maxUnits: 12 }, ['SRC-TURTLE-PDF', 'SRC-INTERNAL-VU'], 'PRIMARY_EXPLICIT', true],
    ['TUR-NOTIONAL-01', 'Notionelles Konto: zu Jahresbeginn festgelegt; je 10 % Verlust wird es um 20 % verkleinert, bis der Jahresstart wieder erreicht ist.', 'notional = yearStart * 0.8^cuts', { step: 0.1, cut: 0.2 }, ['SRC-TURTLE-PDF', 'SRC-INTERNAL-VU'], 'PRIMARY_EXPLICIT', true]);
  plan(donchian, { confirmRuleId: 'TUR-ENTRY-S1-20', exitSummary: 'Stop 2N unter dem Einstieg · Ausstieg sobald das 10-Tage-Tief unterschritten wird' });
  section(donchian, 'prepared', 'Kurs höchstens 3 % unter dem Ausbruchspunkt: 20-Tage-Hoch, oder 55-Tage-Hoch, wenn der letzte Ausbruch ein Gewinner war. Invalidation = 10-Tage-Tief.', ['DON-NEAR-VU', 'TUR-S1-FILTER', 'TUR-FAILSAFE-55', 'LC-SETUP', 'LC-NEAR-TRIGGER']);
  section(donchian, 'confirmation', 'Kauf-Stop am Ausbruchspunkt: steigt der Kurs im Tagesverlauf darüber, gilt das Modell als gekauft.', ['TUR-ENTRY-S1-20', 'TUR-FAILSAFE-55', 'LC-BUY-STOP']);
  section(donchian, 'execution', 'Zum Ausbruchspunkt oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Größe: 1 % des notionellen Kontos je N.', ['LC-BUY-STOP', 'TUR-UNIT-01', 'TUR-NOTIONAL-01', 'LC-MODEL-ENTRY']);
  section(donchian, 'initialStop', '2N unter dem Einstieg (N = 20-Tage-EMA der True Range).', ['TUR-STOP-2N', 'TUR-N-01', 'LC-SAME-DAY']);
  section(donchian, 'hold', 'Position läuft, solange weder der 2N-Stop noch das 10-Tage-Tief unterschritten wird.', ['LC-ACTIVE']);
  section(donchian, 'exit', 'Unterschreitet der Kurs das 10-Tage-Tief oder den 2N-Stop, Verkauf an dieser Marke (bei Eröffnung darunter zur Eröffnung).', ['TUR-EXIT-S1-10D', 'TUR-STOP-2N', 'LC-STOP-ORDER-ASSUMPTION']);
  section(donchian, 'gap', 'Eröffnung über dem Ausbruchspunkt: Kauf zur Eröffnung, Stop 2N darunter.', ['TUR-ENTRY-S1-20', 'TUR-STOP-2N'], true);
  donchian.rule_cards[0].executable.gaps = ['Nachkaufen bis 4 Units in ½-N-Schritten nicht simuliert', 'Korrelationsgrenzen (6/10 Units) fehlen', 'System 2 (55/20) nicht umgesetzt', 'nur Long'];

  /* ---------------------------------------------------------- Darvas 3.0.0 */
  bump(darvas, R8.DARVAS_BOX, ['DAR-ENTRY-D1', 'DAR-STOP-02', 'LC-CONFIRM-CLOSE'], '2.0.0', ['SRC-ND-TIME-1959', 'SRC-ND-TIME-1960B']);
  add(darvas,
    ['DAR-ENTRY-BS', 'Kauforder an der Boxoberkante: steigt der Kurs im Tagesverlauf darüber, gilt das Modell als gekauft (TIME 1959: „places buy orders at breakout points“).', 'high(t) > boxTop -> entry = max(open(t), boxTop)', {}, ['SRC-ND-TIME-1959'], 'PRIMARY_EXPLICIT', false],
    ['DAR-STOP-03', 'Stop 1 % unter der Kauforder (TIME 1959: „just below his buy order“; 1 % ist VU für „knapp“).', 'stop = boxTop * 0.99', { below: 0.01 }, ['SRC-ND-TIME-1959', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true],
    ['DAR-PORT-01', 'Höchstens 6 Aktien gleichzeitig (TIME 1959: „five or six stocks at a time“).', 'maxPositions = 6', { maxPositions: 6 }, ['SRC-ND-TIME-1959'], 'PRIMARY_EXPLICIT', false]);
  plan(darvas, { confirmRuleId: 'DAR-ENTRY-BS', exitSummary: 'Stop 1 % unter der Kauforder · mit jeder höheren, bestätigten Box an deren Unterkante nachgezogen' });
  section(darvas, 'confirmation', 'Kauforder an der Boxoberkante; steigt der Kurs im Tagesverlauf darüber, gilt das Modell als gekauft.', ['DAR-ENTRY-BS', 'LC-BUY-STOP']);
  section(darvas, 'execution', 'Zur Oberkante oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Höchstens 6 Titel.', ['LC-BUY-STOP', 'DAR-PORT-01', 'LC-MODEL-ENTRY']);
  section(darvas, 'initialStop', '1 % unter der Kauforder (Oberkante). Bis 1.2.0: Boxunterkante; 2.0.0: gleich, aber mit Schlusskurs-Einstieg.', ['DAR-STOP-03', 'LC-SAME-DAY']);
  darvas.rule_cards[0].executable.gaps = ['Pyramiding in steigende Boxen nicht simuliert', 'Fundamentalfilter fehlt (keine Gewinndaten zum Stichtag)'];

  /* ---------------------------------------------------------- Weinstein 3.0.0 */
  bump(weinstein, R8.WEINSTEIN_STAGE, ['WEIN-ST2-02', 'WEIN-ST2-02U', 'LC-CONFIRM-CLOSE'], '2.0.0');
  add(weinstein,
    ['WEIN-ENTRY-BS', 'Kauf-Stop knapp über dem höchsten Tageshoch der Basis; ausgelöst im Tagesverlauf. Markt (SPY) und relative Stärke müssen zum letzten Wochenschluss passen. Weinstein (zitiert bei Bulkowski): „If you have purchased it with a buy-stop order …“', 'high(t) > baseHigh && WEIN-MKT-01(lastWeek) && WEIN-RS-02(lastWeek) -> entry = max(open(t), baseHigh)', {}, ['SRC-SW-BULKOWSKI', 'SRC-SW-BOOK'], 'SECONDARY_ONLY', false],
    ['WEIN-VOL-04', 'Das Volumen der Ausbruchswoche ist erst am Wochenende bekannt. Bleibt es unter dem Doppelten der vier Vorwochen, wird beim ersten Schluss über dem Einstieg verkauft („sell it for a fast profit“).', 'weekVolume(entryWeek) < 2 * avg4 && close > entry -> sell open(t+1)', { multiple: 2 }, ['SRC-SW-BULKOWSKI', 'SRC-SW-BOOK'], 'SECONDARY_ONLY', false]);
  plan(weinstein, { confirmRuleId: 'WEIN-ENTRY-BS', exitSummary: 'Stop 2 % unter der Basis · Ausstieg bei Wochenschluss unter der 30-Wochen-Linie · bei schwachem Ausbruchsvolumen Verkauf beim ersten Gewinn' });
  section(weinstein, 'confirmation', 'Kauf-Stop knapp über dem höchsten Tageshoch der Basis; Markt nicht in Stufe 4 und positive relative Stärke zum letzten Wochenschluss.', ['WEIN-ENTRY-BS', 'WEIN-MKT-01', 'WEIN-RS-02', 'LC-BUY-STOP']);
  section(weinstein, 'execution', 'Zum Ausbruchspunkt oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Volumen der Ausbruchswoche wird am Wochenende geprüft.', ['LC-BUY-STOP', 'WEIN-VOL-04', 'LC-MODEL-ENTRY']);

  /* ---------------------------------------------------------- Quellenprüfung */
  const review = (s, kind, note) => { for (const c of s.rule_cards || []) { c.source_basis.fidelityReview = kind; c.source_basis.fidelityNote = note; } };
  review(momentum, 'PERFORMED_R8_FULLTEXT', 'Quellenprüfung Runde 8: Kullamägis Beiträge („3 TIMELESS setups“, FAQ, Episodic Pivots) und die Beispielcharts im Volltext gelesen (Abruf über GitHub Actions, verschlüsselt abgelegt). Jede Regel ist als Original, Umsetzung oder VU eingeordnet.');
  review(donchian, 'PERFORMED_R8_FULLTEXT', 'Quellenprüfung Runde 8: „The Original Turtle Trading Rules“ (27 Seiten, PDF) im Volltext gelesen. Jede Regel ist als Original, Umsetzung oder VU eingeordnet.');
  review(darvas, 'PERFORMED_R8_FULLTEXT', 'Quellenprüfung Runde 8: TIME 1959 und 1960 zu Darvas im Volltext gelesen; Darvas’ Buch (1960) ist nicht frei zugänglich, die Boxdefinition bleibt sekundär.');
  review(weinstein, 'PERFORMED_R8_SECONDARY_QUOTES', 'Quellenprüfung Runde 8: Weinsteins Buch ist nicht zugänglich. Gelesen: Bulkowski (thepatternsite.com) mit wörtlichen Buchzitaten, stageanalysis.net. Regeln bleiben sekundär belegt.');
  review(minervini, 'PERFORMED_R7_SNIPPETS', 'Quellenprüfung Runde 8 ohne neuen Beleg: minervini.com ist ein Bezahlangebot ohne freie Regeln, /blog liefert 404, die Bücher sind nicht frei zugänglich. Regeln bleiben wie in Runde 7 auf Suchauszügen und Sekundärquellen.');
  for (const s of [momentum, donchian, darvas, weinstein]) {
    s.rule_cards[0].historical_validation = { status: 'PREREGISTERED_R8', note: `Version ${s.strategy_version} ist vorab registriert (PREREGISTRATION-R8*.json) und wird intern geprüft; das Ergebnis wird erst nach Klärung der Veröffentlichungsrechte gezeigt.` };
  }
}
