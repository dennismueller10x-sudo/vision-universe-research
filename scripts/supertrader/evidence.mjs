// Supertrader — Evidenz-Einstufung je Strategieversion.
//
// Drei getrennte Aussagen, die der Kunde sieht:
//   1. Evidenz der Version (historische Prüfung)   EVIDENCE_LEVELS
//   2. Quellenqualität der Regeln                  SOURCE_QUALITY
//   3. Datenqualität für eine historische Prüfung  DATA_QUALITY
// und eine Produktentscheidung daraus:
//   presentation CURRENT  - Setups erscheinen als aktuelle Setups (Startseite, Signale)
//                RESEARCH - Forschung / laufende Modellbeobachtung: auffindbar,
//                           Protokoll und Positionen laufen weiter, aber keine
//                           Hervorhebung als Einstiegschance
//                PARTIAL / PENDING / NAME_ONLY - wie bisher (Teilprüfung, Daten fehlen, Namenskarte)
//
// Keine Stufe ist ein Versprechen fuer kuenftige Ergebnisse. Eine Aenderung der
// Einstufung ist eine Produktentscheidung, kein Marktsignal: sie aendert kein
// Signal im Ledger und erzeugt keinen Zustandswechsel.
//
// Rechte: Solange die Veroeffentlichung aus Tiingo abgeleiteter Backtest-
// Kennzahlen nicht geklaert ist, erscheint jede intern gepruefte Version
// oeffentlich als IN_REVIEW. Das interne Ergebnis liegt verschluesselt in
// scripts/supertrader/validation/evidence-internal.sealed.json.

export const EVIDENCE_VERSION = 'supertrader-evidence-1.0.0';
export const NO_PROMISE = 'Keine Stufe ist ein Versprechen für künftige Ergebnisse.';

export const EVIDENCE_LEVELS = Object.freeze({
  NOT_TESTED: { order: 0, label: 'Noch nicht geprüft', tone: 'mute', plain: 'Für diese Regelversion gibt es noch keinen historischen Test.' },
  IN_REVIEW: { order: 1, label: 'In Prüfung', tone: 'warn', plain: 'Diese Regelversion wird historisch geprüft oder ihr Ergebnis ist noch nicht zur Veröffentlichung freigegeben.' },
  TESTED_NO_EDGE: { order: 2, label: 'Geprüft, ohne überzeugenden Vorteil', tone: 'bad', plain: 'Die Version wurde mit vorab festgelegten Kriterien historisch getestet und hat sie nicht erfüllt.' },
  CRITERIA_MET: { order: 3, label: 'Vorab festgelegte Kriterien erfüllt', tone: 'good', plain: 'Die Version hat die vorab festgelegten historischen Kriterien erfüllt. Das ist kein Versprechen für künftige Ergebnisse.' },
});

export const SOURCE_QUALITY = Object.freeze({
  ORIGINAL: { label: 'Originalregeln belegt', tone: 'good' },
  ORIGINAL_VU: { label: 'Original + VU-Umsetzung', tone: 'good' },
  SECONDARY_VU: { label: 'Sekundärquellen + VU', tone: 'warn' },
  PARTLY_UNBACKED: { label: 'Teile nicht belegt', tone: 'bad' },
  NONE: { label: 'Nicht spezifiziert', tone: 'mute' },
});
const SOURCE_FROM_CARD = {
  ORIGINAL_PRINCIPLES_VU_EXECUTION: 'ORIGINAL_VU', PRIMARY_RULES_VU_TRANSFER: 'ORIGINAL_VU', OFFICIAL_SITE_AND_REPLICATIONS: 'ORIGINAL',
  PRIMARY_SIGNALS_PARTIAL_DATA: 'ORIGINAL_VU', SECONDARY_SOURCES_VU_THRESHOLDS: 'SECONDARY_VU', SECONDARY_SOURCES_VU_BOX_DEFINITION: 'SECONDARY_VU',
  SECONDARY_SOURCES_VU_PROXIES: 'SECONDARY_VU', EXIT_NOT_SOURCE_BACKED: 'PARTLY_UNBACKED',
};

export const DATA_QUALITY = Object.freeze({
  PIT_PRICES: { label: 'Kurse zum damaligen Stand', tone: 'good', plain: 'Tageskurse aller damals gelisteten US-Aktien ab 2016, einschließlich später delisteter Titel, mit Splits und Dividenden.' },
  PRICES_NO_PIT_FUNDAMENTALS: { label: 'Fundamentaldaten nicht zum Stichtag', tone: 'bad', plain: 'Gewinne und Bilanzen liegen nur als zuletzt berichtete Werte vor, nicht so, wie sie damals bekannt waren. Ein historischer Test wäre verzerrt.' },
  FIELDS_MISSING: { label: 'Pflichtdaten fehlen', tone: 'bad', plain: 'Für die Methode fehlen Pflichtfelder; weder Signale noch ein historischer Test sind möglich.' },
  INTRADAY_MISSING: { label: 'Intraday-Historie fehlt', tone: 'bad', plain: 'Die Variante braucht Intraday-Kurse, die historisch nicht vorliegen.' },
  NONE: { label: 'Keine Daten zugeordnet', tone: 'mute', plain: 'Ohne Regeln gibt es keine Datenanforderung.' },
});

// Oeffentliches Evidenz-Protokoll je Strategieversion. Jede Aenderung ist ein
// neuer Eintrag mit Datum; alte Eintraege bleiben stehen.
export const EVIDENCE_LEDGER = Object.freeze({
  DONCHIAN_TURTLE: [
    { date: '2026-09-29', version: '1.0.0', level: 'NOT_TESTED', presentation: 'CURRENT', note: 'Live-Start ohne historischen Test; explorativer Wochen-Pilot nur auf heute gelisteten Aktien.' },
    { date: '2026-10-02', version: '1.1.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION.json',
      note: 'Vorab festgelegte interne Prüfung der Tagesvariante abgeschlossen (alle damals gelisteten US-Aktien 2016–2026, einschließlich delisteter Titel). Das Ergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Neue Setups werden nicht mehr als Einstiegschance hervorgehoben; laufende Modellpositionen werden nach Regelversion 1.1.0 weiter geführt und protokolliert.' },
  
    { date: '2026-10-02', version: '2.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R8-TURTLE.json',
      note: 'Neue Regelversion aus der Volltext-Quellenprüfung (Runde 8): Kauf per Order am Ausbruchspunkt im Tagesverlauf, wie in der Originalquelle beschrieben. Vor jedem historischen Lauf festgelegt; läuft ab jetzt live zur Vorwärtsbeobachtung. Das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' }],
  MOMENTUM_BREAKOUT: [{ date: '2026-09-28', version: '1.1.0', level: 'NOT_TESTED', presentation: 'CURRENT', note: 'Live ohne historischen Test.' },
    { date: '2026-10-02', version: '1.1.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-METHODS.json',
      note: 'Vorab festgelegte interne Prüfung abgeschlossen (alle damals gelisteten US-Aktien 2016–2026, einschließlich delisteter Titel). Das Ergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Neue Setups werden nicht als Einstiegschance hervorgehoben; Protokoll und Modellpositionen laufen nach der gültigen Regelversion weiter.' },
    { date: '2026-10-02', version: '2.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R7.json',
      note: 'Neue Regelversion aus der Quellenprüfung (Runde 7), vor jedem historischen Lauf festgelegt. Sie läuft ab jetzt live zur Vorwärtsbeobachtung; das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' },
    { date: '2026-10-02', version: '3.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R8.json',
      note: 'Neue Regelversion aus der Volltext-Quellenprüfung (Runde 8): Kauf per Order am Ausbruchspunkt im Tagesverlauf, wie in der Originalquelle beschrieben. Vor jedem historischen Lauf festgelegt; läuft ab jetzt live zur Vorwärtsbeobachtung. Das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' },
    { date: '2026-10-02', version: '3.1.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R8C.json',
      note: 'Version 3.1.0 entfernt zwei VU-Zusätze, an denen Kullamägis eigenes TSLA-Beispiel (Juni 2020) scheiterte: Der Kurs muss nur über einer der steigenden 10/20-Tage-Linien liegen, nach einem verlorenen Setup gibt es keine Sperre. Vor dem Lauf festgelegt; läuft live zur Vorwärtsbeobachtung. Das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt.' },
    { date: '2026-10-02', version: '3.1.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R9B-RESOLVED.json',
      note: 'Interne Nachprüfung mit Minutenkursen (Runde 9): Ob am Kauftag das Tagestief vor oder nach dem Kauf lag, verändert das Ergebnis dieser Methode deutlich. Die frühere Auswertung auf Tagesbasis war zu günstig; die Ergebnisaussage ist entsprechend eingeschränkt. Öffentlich weiter ohne Kennzahlen.' }
  ],
  WEINSTEIN_STAGE: [{ date: '2026-09-28', version: '1.1.0', level: 'NOT_TESTED', presentation: 'CURRENT', note: 'Live ohne historischen Test.' },
    { date: '2026-10-02', version: '1.1.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-METHODS.json',
      note: 'Vorab festgelegte interne Prüfung abgeschlossen (alle damals gelisteten US-Aktien 2016–2026, einschließlich delisteter Titel). Das Ergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Neue Setups werden nicht als Einstiegschance hervorgehoben; Protokoll und Modellpositionen laufen nach der gültigen Regelversion weiter.' },
    { date: '2026-10-02', version: '2.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R7.json',
      note: 'Neue Regelversion aus der Quellenprüfung (Runde 7), vor jedem historischen Lauf festgelegt. Sie läuft ab jetzt live zur Vorwärtsbeobachtung; das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' },
    { date: '2026-10-02', version: '3.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R8B.json',
      note: 'Neue Regelversion aus der Volltext-Quellenprüfung (Runde 8): Kauf per Order am Ausbruchspunkt im Tagesverlauf, wie in der Originalquelle beschrieben. Vor jedem historischen Lauf festgelegt; läuft ab jetzt live zur Vorwärtsbeobachtung. Das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' }],
  DARVAS_BOX: [{ date: '2026-09-28', version: '1.2.0', level: 'NOT_TESTED', presentation: 'CURRENT', note: 'Live ohne historischen Test.' },
    { date: '2026-10-02', version: '1.2.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-METHODS.json',
      note: 'Vorab festgelegte interne Prüfung abgeschlossen (alle damals gelisteten US-Aktien 2016–2026, einschließlich delisteter Titel). Das Ergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Neue Setups werden nicht als Einstiegschance hervorgehoben; Protokoll und Modellpositionen laufen nach der gültigen Regelversion weiter.' },
    { date: '2026-10-02', version: '2.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R7.json',
      note: 'Neue Regelversion aus der Quellenprüfung (Runde 7), vor jedem historischen Lauf festgelegt. Sie läuft ab jetzt live zur Vorwärtsbeobachtung; das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' },
    { date: '2026-10-02', version: '3.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R8B.json',
      note: 'Neue Regelversion aus der Volltext-Quellenprüfung (Runde 8): Kauf per Order am Ausbruchspunkt im Tagesverlauf, wie in der Originalquelle beschrieben. Vor jedem historischen Lauf festgelegt; läuft ab jetzt live zur Vorwärtsbeobachtung. Das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' },
    { date: '2026-10-02', version: '3.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R9B-RESOLVED.json',
      note: 'Interne Nachprüfung mit Minutenkursen (Runde 9): Die strittigen Kauftage sind jetzt überwiegend aufgelöst. Das Ergebnis bleibt in beiden Lesarten ohne Vorteil. Öffentlich weiter ohne Kennzahlen.' }
  ],
  MINERVINI_VCP: [{ date: '2026-09-28', version: '1.1.0', level: 'NOT_TESTED', presentation: 'CURRENT', note: 'Live ohne historischen Test. Der Ausstieg (Schluss unter der 50-Tage-Linie) ist eine VU-Regel, keine belegte Minervini-Originalregel.' },
    { date: '2026-10-02', version: '1.1.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-METHODS.json',
      note: 'Vorab festgelegte interne Prüfung abgeschlossen (alle damals gelisteten US-Aktien 2016–2026, einschließlich delisteter Titel). Das Ergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Neue Setups werden nicht als Einstiegschance hervorgehoben; Protokoll und Modellpositionen laufen nach der gültigen Regelversion weiter. Geprüft wurde die VU-Formalisierung; der Ausstieg ist keine belegte Minervini-Originalregel.' },
    { date: '2026-10-02', version: '2.0.0', level: 'IN_REVIEW', presentation: 'RESEARCH', test: 'PREREGISTRATION-R7.json',
      note: 'Neue Regelversion aus der Quellenprüfung (Runde 7), vor jedem historischen Lauf festgelegt. Sie läuft ab jetzt live zur Vorwärtsbeobachtung; das interne Prüfergebnis wird bis zur Klärung der Veröffentlichungsrechte nicht gezeigt. Offene Modellpositionen der Vorversion werden nach deren Regeln zu Ende geführt.' }],
  CANSLIM: [{ date: '2026-09-29', version: '0.9.0', level: 'NOT_TESTED', presentation: 'PARTIAL', note: 'Teilprüfung; ohne Fundamentaldaten zum damaligen Stichtag nicht historisch testbar.' }],
  PIOTROSKI_F: [{ date: '2026-09-29', version: '0.9.0', level: 'NOT_TESTED', presentation: 'PARTIAL', note: 'Teilprüfung; ohne Jahresabschlüsse zum damaligen Stichtag nicht historisch testbar.' }],
  GREENBLATT_VALUE: [{ date: '2026-09-29', version: '1.0.0', level: 'NOT_TESTED', presentation: 'PENDING', note: 'Pflichtdaten fehlen.' }],
});

const DATA_FOR = {
  MOMENTUM_BREAKOUT: 'PIT_PRICES', WEINSTEIN_STAGE: 'PIT_PRICES', DARVAS_BOX: 'PIT_PRICES', MINERVINI_VCP: 'PIT_PRICES', DONCHIAN_TURTLE: 'PIT_PRICES',
  CANSLIM: 'PRICES_NO_PIT_FUNDAMENTALS', PIOTROSKI_F: 'PRICES_NO_PIT_FUNDAMENTALS', GREENBLATT_VALUE: 'FIELDS_MISSING',
};
const PRESENTATION_LABEL = { CURRENT: 'Aktuelle Setups', RESEARCH: 'Forschung · Modellbeobachtung', PARTIAL: 'Teilprüfung', PENDING: 'Daten fehlen', NAME_ONLY: 'In Vorbereitung' };

// Evidenzblock einer Strategie fuer registry.json (oeffentlich).
export function evidenceFor(strategy) {
  const id = strategy.strategy_id;
  const hist = EVIDENCE_LEDGER[id] || [];
  const cur = hist[hist.length - 1] || { version: strategy.strategy_version, level: 'NOT_TESTED', presentation: strategy.mode === 'RESEARCH' ? 'NAME_ONLY' : 'CURRENT', date: null, note: '' };
  const card = (strategy.rule_cards || [])[0];
  const src = card ? SOURCE_FROM_CARD[card.source_basis?.status] || 'SECONDARY_VU' : 'NONE';
  const data = DATA_FOR[id] || 'NONE';
  const level = EVIDENCE_LEVELS[cur.level];
  return {
    schema: EVIDENCE_VERSION,
    version: cur.version, level: cur.level, levelLabel: level.label, levelTone: level.tone, levelPlain: level.plain,
    presentation: cur.presentation, presentationLabel: PRESENTATION_LABEL[cur.presentation], decidedAt: cur.date, note: cur.note,
    source: { id: src, ...SOURCE_QUALITY[src] },
    data: { id: data, ...DATA_QUALITY[data] },
    noPromise: NO_PROMISE,
    history: hist.map((h) => ({ date: h.date, version: h.version, level: h.level, presentation: h.presentation })),
  };
}

export function isResearch(strategyOrEvidence) {
  const ev = strategyOrEvidence?.evidence || strategyOrEvidence;
  return ev?.presentation === 'RESEARCH';
}
