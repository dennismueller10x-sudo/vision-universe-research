// Supertrader – Migration Phase 1 (nach R15): WAHRHEIT + BESCHRIFTUNG + VERSIONSKONSISTENZ.
// Ändert KEINE Strategieregel, keinen Code der Signal- oder Portfolio-Engine und keine Version. Diese Datei
//  1. koppelt Regeln explizit an die laufende Strategieversion (Version-zu-Regel-Zuordnung, rule_versioning):
//     jede Regel ist ACTIVE (gilt in der laufenden Version), LEGACY (galt nur in einer früheren Version) oder
//     NOT_IMPLEMENTED (Regel des Traders, im Live-Code nicht umgesetzt – nur Referenz);
//  2. ordnet jeder Regel eine R15-Herkunftsklasse zu (Original / Lesart / VU-Formalisierung / VU-eigen /
//     Fremdregel / nicht öffentlich / ungeklärt) – bei gemischten Regeln gilt die strengste Klasse;
//  3. korrigiert Texte der Registry, die vom Live-Code abweichen (Befunde R15-T05 … R15-T49, Regelkarten und DNA).
// Quelle der Befunde: scripts/supertrader/fidelity/audit/live-text-audit.json (56 Aussagen).
// Reihenfolge: nach allen Runden-Overlays (applyR7 … applyR13), vor deriveProvenance().

import { PROVENANCE as P } from './fidelity/taxonomy.mjs';
import { PROVENANCE_ORDER } from './fidelity/provenance-labels.mjs';
import { LIVE_CLASSIFICATION } from './fidelity/product-classes.mjs';

export const PHASE1_VERSION = 'supertrader-migration-phase1-1.0.0';
export const RULE_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', LEGACY: 'LEGACY', NOT_IMPLEMENTED: 'NOT_IMPLEMENTED' });
const S = RULE_STATUS;

// Quellen, die einen Trader selbst betreffen (Gegenstück: SRC-INTERNAL-VU, TraderFox, Clenow).
const TRADER_SRC = /^SRC-(KK|SW|ND|MM|BL-TURTLE|TURTLE-PDF)/;

/* ------------------------------------------------------------------ Status */
// Regeln, die der laufende Code NICHT mehr verwendet (zusätzlich zu den von R7/R8 gesetzten legacy_only-Markierungen).
const LEGACY = {
  WEINSTEIN_STAGE: {
    'WEIN-ST2-01': ['2.0.0', 'Wochenschluss-Bestätigung mit Kauf zur nächsten Eröffnung; seit 3.0.0 gilt der Kauf-Stop (WEIN-ENTRY-BS).'],
    'WEIN-STOP-VU': ['2.0.0', 'Vorgänger von WEIN-STOP-01 (derselbe Anfangsstop, seit 3.0.0 unter der neuen ID).'],
    'WEIN-VOL-03': ['2.0.0', 'Volumen ≥ 2× als Bedingung vor dem Einstieg; seit 3.0.0 wirkt das Volumen nur noch nach dem Kauf (WEIN-VOL-04).'],
  },
  MINERVINI_VCP: {
    'MIN-ENTRY-D1': ['1.1.0', 'Bestätigung ohne Volumenbedingung; seit 2.0.0 gilt MIN-ENTRY-D2 (mit ≥ 1,4× Volumen).'],
    'MIN-STOP-VU': ['1.1.0', 'Vorgänger von MIN-STOP-01 (derselbe Stop, seit 2.0.0 unter der neuen ID).'],
    'MIN-WARN-01': ['1.1.0', 'Warnregel von 1.1.0; seit 2.0.0 gilt MIN-WARN-02.'],
  },
};
// Regeln des Traders, die der Live-Code nicht umsetzt (Referenz, nicht aktiv).
const NOT_IMPL = {
  MOMENTUM_BREAKOUT: { 'KK-BO-ENTRY-ORH': 'Einstieg über dem Hoch der ersten Minuten (Opening Range): nicht umgesetzt; Live nutzt die Tageschart-Variante KK-BO-ENTRY-ORH-D.' },
  DARVAS_BOX: { 'DAR-PYR-01': 'Pyramidisieren in steigende Boxen: in Live 3.0.2 nicht umgesetzt.' },
  MINERVINI_VCP: { 'MIN-FUND-HYBRID': 'SEPA-Fundamentaldaten: Live 2.0.0 nutzt sie weder als Filter noch zur Anzeige.' },
};

/* -------------------------------------------- neue Regeln (Beschriftung) */
// id, Text, machine, params, sources, evidence, VU-Flag, status, Klasse, foreign_from, Hinweis
const ADD = {
  WEINSTEIN_STAGE: [
    ['WEIN-SIZE-VU', 'Positionsgröße im Modellportfolio: 0,5 % Risiko ÷ Stopabstand, höchstens 20 % je Position, höchstens 10 Positionen. Bisherige VU-Anpassung: Die Risikozahl stammt aus Kullamägis Risikospanne (KK-RISK-01) und wird still aus den Portfolio-Standardwerten geerbt; Weinstein nennt keine Größenregel.', 'size = 0.005 * equity / (entry - stop); size <= 0.20 * equity; positions <= 10', { riskPerTrade: 0.005, maxPositionPct: 0.2, maxPositions: 10 }, ['SRC-INTERNAL-VU', 'SRC-KK-FAQ'], 'VU_EXTENSION', true, S.ACTIVE, P.FOREIGN_RULE, 'Kullamägi', 'Risikozahl aus Kullamägis Regel; Gewichtsgrenze und Platzzahl sind VU-eigen.'],
    ['WEIN-TRAIL-ORIG', 'Weinstein (zitiert bei Bulkowski): Der Stop wird nachgezogen, unter die 30-Wochen-Linie bzw. das jeweils letzte Zwischentief; in Stufe 3 enger. In Version 4.0.0 nicht umgesetzt: es gibt keinen nachgezogenen Stop.', 'stop = min(ma30w, lastSwingLow) - buffer, nur angehoben', {}, ['SRC-SW-BULKOWSKI', 'SRC-SW-BOOK'], 'SECONDARY_ONLY', false, S.NOT_IMPLEMENTED, P.ORIGINAL_INTERPRETATION, null, 'Nur sekundär belegt (Bulkowski mit Buchzitaten).'],
    ['WEIN-HALF-ORIG', 'Weinstein: Beim Ausbruch nur eine halbe Position kaufen, den Rest beim Rücksetzer. In Version 4.0.0 nicht umgesetzt: eine Position je Titel, voll beim Ausbruch.', 'buy 0.5 at breakout; buy 0.5 at pullback', {}, ['SRC-SW-BULKOWSKI', 'SRC-SW-BOOK'], 'SECONDARY_ONLY', false, S.NOT_IMPLEMENTED, P.ORIGINAL_INTERPRETATION, null, 'Nur sekundär belegt.'],
  ],
  DARVAS_BOX: [
    ['DAR-SIZE-VU', 'Positionsgröße im Modellportfolio: 0,5 % Risiko ÷ Stopabstand („VU-Standard“). Die Zahl stammt aus Kullamägis Risikospanne; Darvas nennt keine Größenregel. Wegen des 1-%-Stops bindet die Gewichtsgrenze von 1/6 praktisch immer zuerst.', 'size = 0.005 * equity / (entry - stop); size <= equity / 6', { riskPerTrade: 0.005, maxPositionPct: 1 / 6 }, ['SRC-INTERNAL-VU', 'SRC-KK-FAQ'], 'VU_EXTENSION', true, S.ACTIVE, P.FOREIGN_RULE, 'Kullamägi', 'Risikozahl aus Kullamägis Regel.'],
  ],
  DONCHIAN_TURTLE: [
    ['TUR-RANK-ALPHA', 'Gleichzeitige Signale werden im Modellportfolio alphabetisch nach Kürzel ausgewählt. VU-eigen und ökonomisch bedeutungslos; die Originalregeln wählen die stärksten Märkte zuerst (Turtle Rules S. 29).', 'sort(signals, ticker asc)', {}, ['SRC-INTERNAL-VU'], 'VU_EXTENSION', true, S.ACTIVE, P.VU_OWN, null, 'Entspricht nicht der Originalmethode.'],
    ['TUR-PORT-VU', 'Portfolio ohne Hebel: höchstens 12 Titel (eine Unit je Aktie), kein Gewichtsdeckel je Aktie (maxPositionPct 1,0), Gesamtexposure höchstens 100 %. Bei Aktien ist die Unit-Größe 1 % ÷ N daher ein sehr großes Einzelgewicht. Das Original handelte gehebelte Futures mit Korrelationsgrenzen.', 'positions <= 12; maxPositionPct = 1.0; maxExposure = 1.0', { maxPositions: 12, maxPositionPct: 1, maxExposure: 1 }, ['SRC-INTERNAL-VU', 'SRC-TURTLE-PDF'], 'VU_EXTENSION', true, S.ACTIVE, P.VU_OWN, null, 'Anpassung von Futures auf Aktien.'],
    ['TUR-RANK-ORIG', 'Turtle Rules: Bei gleichzeitigen Signalen wurden die stärksten Märkte zuerst gekauft (Rang nach Stärke/N). In dieser Version nicht umgesetzt (die Forschungsversion 2.1.0 ging nicht live).', 'rank = (close - close[63]) / N, descending', {}, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false, S.NOT_IMPLEMENTED, P.ORIGINAL, null, 'Original (Turtle Rules S. 29).'],
    ['TUR-ADD-ORIG', 'Turtle Rules: Nachkaufen in Schritten von ½ N bis zu 4 Units je Markt, Stop mit jedem Zukauf nachziehen. Nicht umgesetzt: eine Position je Titel.', 'add 1 unit every 0.5 N, max 4 units', {}, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false, S.NOT_IMPLEMENTED, P.ORIGINAL, null, 'Original.'],
    ['TUR-LIMITS-ORIG', 'Turtle Rules: Grenzen von 4 Units je Markt, 6 je eng korrelierter Gruppe, 10 je Richtung insgesamt verwandter Märkte und 12 je Richtung. Von diesen Grenzen setzt die Live-Version nur die Zahl 12 als Titelzahl um; Korrelationsgruppen fehlen.', 'limits 4 / 6 / 10 / 12 units', {}, ['SRC-TURTLE-PDF'], 'PRIMARY_EXPLICIT', false, S.NOT_IMPLEMENTED, P.ORIGINAL, null, 'Original.'],
  ],
  MINERVINI_VCP: [
    ['MIN-SELL-ORIG', 'Minervini verkauft in die Stärke (häufig die Hälfte bei einem Vielfachen des Risikos), hat einen Zeitstop und zieht den Stop über den Einstand nach. In Version 2.0.0 nicht umgesetzt: kein Teilverkauf, kein Zeitstop, kein weiteres Nachziehen.', 'sell half at n*R; time stop; trail stop above breakeven', {}, ['SRC-MM-X-RISK', 'SRC-MM-BOOK-TLSMW'], 'MULTI_SOURCE_CONFIRMED', false, S.NOT_IMPLEMENTED, P.ORIGINAL_INTERPRETATION, null, 'Original (sekundär belegt), nicht mechanisch formalisiert.'],
  ],
};

/* ---------------------------------------------------- Klassen-Overrides */
// [Klasse, foreign_from, Hinweis]. Standard: siehe defaultClass(). Gemischte Regeln: strengste Klasse.
const O = P.ORIGINAL, OI = P.ORIGINAL_INTERPRETATION, VF = P.VU_FORMALIZATION, VO = P.VU_OWN, FR = P.FOREIGN_RULE, UR = P.UNRESOLVED;
const CLASS = {
  MOMENTUM_BREAKOUT: {
    'KK-BO-MOM-01': [VF, null, 'Kullamägi: stärkste 1–2 %; die Schwelle (Perzentil ≥ 98 über 1/3/6 Monate) ist VU.'],
    'KK-BO-RUN-01': [VF, null, 'Original: 30–100 % Vorlauf; das Messfenster ist VU.'],
    'KK-BO-TREND-02': [OI, null, 'Original: Kurs „surft“ die steigende 10/20-Tage-Linie; Messung VU.'],
    'KK-BO-REGIME-01': [OI, null, 'Kein Marktfilter im Code; das Regime wird nur protokolliert.'],
    'KK-BO-ENTRY-ORH-D': [OI, null, 'Original: Einstieg beim Ausbruch am Tag; hier mit Tagesbalken (5-Tage-Hoch statt Opening Range).'],
    'KK-BO-COOLDOWN-00': [VF, null, 'Keine Sperre nach einem Setup-Verlust ohne Trade ist eine VU-Wahl.'],
    'KK-BO-PORT-02': [VO, null, 'Gemischt: 0,5 % Risiko und 25 % Gewicht sind Kullamägis Angaben; die Höchstzahl 10 ist VU-eigen.'],
    'LC-BUY-STOP': [VF, null, 'Mechanische Umsetzung der Kauforder am Ausbruchspunkt mit Tagesbalken.'],
  },
  WEINSTEIN_STAGE: {
    'WEIN-MKT-01': [OI, null, 'Marktfilter nach Weinsteins Marktstufe, mechanisch als SPY über nicht fallender 30-Wochen-Linie gelesen.'],
    'WEIN-EXIT-01': [VF, null, 'VU-Vereinfachung: Weinstein zieht einen Stop nach (WEIN-TRAIL-ORIG); der Wochenschluss-Ausstieg ist nicht seine Regel.'],
    'WEIN-ENTRY-BS': [O, null, 'Weinstein, zitiert bei Bulkowski: Kauf-Stop über dem Widerstand (sekundär belegt).'],
    'WEIN-STOP-01': [VF, null, 'Original: Stop unter dem Zwischentief; 2 % unter dem tiefsten Wochenschluss der Basis ist VU.'],
    'WEIN-VOL-02': [VO, null, 'VU-Annahme: fehlendes Volumen gilt als bestätigt.'],
    'WEIN-CONT-01': [VF, null, 'Idee aus der Checkliste von stageanalysis.net (Dritter); alle Zahlen sind VU.'],
    'WEIN-BASE-02': [VO, null, ''],
  },
  DARVAS_BOX: {
    'DAR-MOM-01': [VO, null, 'Auswahl nahe dem 52-Wochen-Hoch (90 %) ist VU.'],
    'DAR-MOM-02': [VO, null, 'Ein Momentum-Ranking ist kein Darvas-Original.'],
    'DAR-BOX-01': [FR, 'TraderFox / Sekundärrekonstruktion', 'Dreitagesregel der Box: TraderFox schreibt sie Darvas zu; keine belegte Darvas-Regel.'],
    'DAR-BOX-02': [FR, 'TraderFox / Sekundärrekonstruktion', 'Dreitagesregel der Box: TraderFox schreibt sie Darvas zu; keine belegte Darvas-Regel.'],
    'DAR-STOP-01': [OI, null, 'Original: Stop mit steigender Box nachziehen; die Boxdefinition ist VU.'],
    'DAR-STOP-03': [VO, null, 'Prinzip „knapp unter der Kauforder“ ist original (TIME 1959); die Zahl 1 % ist VU.'],
    'DAR-ENTRY-BS': [O, null, 'TIME 1959: Kauforder am Ausbruchspunkt.'],
    'PORT-MARKET-200': [FR, 'TraderFox', 'Marktampel SPY > GD 200 stammt aus einer TraderFox-Variante, nicht von Darvas.'],
  },
  MINERVINI_VCP: {
    'MIN-TREND-01': [O, null, ''], 'MIN-HIGH-01': [O, null, ''], 'MIN-LOW-02': [O, null, 'Fassung 30 % über dem Tief; Quellen uneinheitlich.'],
    'MIN-TREND-02': [VF, null, 'Original: 200-Tage-Linie steigt; der Rückblick von einem Monat ist VU.'],
    'MIN-RISK-VU': [VF, null, ''],
    'MIN-ENTRY-D2': [FR, 'O’Neil-Konvention', 'Ausbruchsvolumen ≥ 1,4× stammt aus der O’Neil-Konvention, im Abruf nicht von Minervini belegt.'],
    'MIN-EXIT-02': [UR, 'vermutlich O’Neil', 'Keine Minervini-Fundstelle für „Schluss unter der 50-Tage-Linie mit Volumen“.'],
    'MIN-BE-01': [O, null, 'Einstand ab 3 Anfangsrisiken ist original (Minervini, X).'],
    'MIN-FUND-HYBRID': [OI, null, 'Original (SEPA); im Live-Code nicht verwendet.'],
    'MIN-STOP-01': [OI, null, 'Original: Verlust begrenzen (meist 7–8 %); die Kappung bei 10 % ist sekundär belegt.'],
  },
  DONCHIAN_TURTLE: {
    'TUR-UNIT-01': [VO, null, 'Gemischt: Unit 1 % je N ist original; eine Unit je Aktie ohne Hebel und höchstens 12 Titel sind VU-eigen.'],
    'TUR-NOTIONAL-01': [OI, null, 'Original; die Jahresanpassung des Kontos (bei den Turtles Ermessen von Dennis) ist hier das tatsächliche Kapital.'],
    'TUR-S1-FILTER': [OI, null, 'Original; ein noch laufender hypothetischer Ausbruch zählt hier als Gewinner (VU).'],
    'TUR-FAILSAFE-55': [OI, null, ''],
    'DON-LIQ-VU': [VF, null, 'Liquiditätsfilter für Aktien.'],
  },
  VU_TREND_52W: {
    'TR52-RANK-VU': [FR, 'Clenow', 'Clenow-Trendmaß ersetzt die nicht öffentliche „Trendstabilität“ der TraderFox-Variante.'],
  },
};

function defaultClass(r, strategyId) {
  const ev = r.evidence_status, refs = r.source_reference || [];
  const trader = refs.some((x) => TRADER_SRC.test(x));
  const tf = refs.some((x) => /^SRC-TF-/.test(x));
  if (r.rule_id === 'LC-BUY-STOP') return [VF, null, 'Mechanische Umsetzung der Kauforder am Ausbruchspunkt mit Tagesbalken.'];
  if (ev === 'VU_EXTENSION') return [VO, null, ''];
  if (strategyId === 'VU_TREND_52W' && tf && !r.VU_formalization_flag) return [FR, 'TraderFox', 'Öffentlich beschriebene Regel der TraderFox-Variante, hier übernommen.'];
  if (r.VU_formalization_flag) return [trader ? VF : VO, null, ''];
  if (ev === 'PRIMARY_EXPLICIT') return [O, null, ''];
  return [OI, null, ''];
}
// Technik des Simulators (Lebenszyklus, Ausführung, Datenlücken): VU-Konventionen ohne Methodenaussage. Sie zählen in der Herkunftsliste,
// bestimmen aber nicht das Kennzeichen eines Abschnitts, solange der Abschnitt Methodenregeln enthält.
const MECHANICS = (id) => /^LC-/.test(id) && !['LC-NEAR-TRIGGER', 'LC-COOLDOWN-01'].includes(id);
const confidence = (r) => ({ PRIMARY_EXPLICIT: 'HIGH', PRIMARY_INFERRED: 'MEDIUM', MULTI_SOURCE_CONFIRMED: 'MEDIUM', SECONDARY_ONLY: 'LOW', DISPUTED: 'LOW' }[r.evidence_status] || 'NONE');

/* --------------------------------------------------------------- Helfer */
const need = (cond, msg) => { if (!cond) throw new Error(`registry-p1: ${msg}`); };
const ruleOf = (s, id) => { const r = s.rules.find((x) => x.rule_id === id); need(r, `${s.strategy_id}: Regel ${id} fehlt`); return r; };
const secOf = (s, id, edge = false) => { const c = s.rule_cards[0]; const x = (edge ? c.edge_cases : c.sections).find((y) => y.id === id); need(x, `${s.strategy_id}: Abschnitt ${id} fehlt`); return x; };
const setSec = (s, id, text, rules, edge = false) => { const x = secOf(s, id, edge); x.text = text; if (rules) x.rules = rules; };
const setText = (s, id, text) => { ruleOf(s, id).plain_language_explanation = text; };
const setDna = (s, field, text, evidence, rules = []) => { need(s[field], `${s.strategy_id}: DNA ${field} fehlt`); s[field] = { text, evidence, rules }; };
const addEdge = (s, id, title, text, rules) => { const c = s.rule_cards[0]; need(!c.edge_cases.some((x) => x.id === id), `Edge ${id} existiert`); c.edge_cases.push({ id, title, text, rules }); };

/* ----------------------------------------------------- Textkorrekturen */
const LC_MODEL_ENTRY = 'Der Modelleinstieg wird als beobachteter Kurs erfasst, nie zum idealen Triggerkurs: bei Methoden mit Kauf-Stop zum Kauf-Stop-Fill (Trigger bzw. Eröffnung darüber, plus Slippage), bei Schlusskurs-Bestätigung (Minervini) zur Eröffnung des nächsten Handelstags. Das ist keine reale Order.';

function fixKullamaegi(s) {
  setDna(s, 'trailing_stop', 'Erst nach dem Teilverkauf: erster Schluss unter der 10-Tage-Linie (Variante 10d).', 'PRIMARY_EXPLICIT', ['KK-BO-TRAIL-02']);
  setDna(s, 'entry_trigger', 'Original: Opening-Range-High (1/5/60 Min.) oder Daily Breakout. Live 3.2.0: Kauf-Stop im Tagesverlauf über dem Hoch der letzten 5 Sitzungen (Tageschart-Variante); der Opening-Range-Einstieg ist nicht umgesetzt.', 'PRIMARY_EXPLICIT', ['KK-BO-ENTRY-ORH-D', 'KK-BO-ENTRY-ORH']);
  setDna(s, 'entry_zone', 'Eröffnet der Kurs über dem Trigger, wird zur Eröffnung gekauft; es gibt keine Gap-Sperre (seit 3.0.0).', 'VU_FORMALIZATION', ['KK-BO-ENTRY-ORH-D']);
  setDna(s, 'gap_policy', 'Keine Gap-Sperre: Eröffnung über dem Trigger wird zur Eröffnung gekauft. Stop-Ausführung bei Gap zur Eröffnung.', 'VU_FORMALIZATION', ['KK-BO-ENTRY-ORH-D']);
  setDna(s, 'trend_filters', 'Kurs schließt über mindestens einer der beiden steigenden 10-/20-Tage-Linien, die 20-Tage-Linie steigt (seit 3.0.0; bis 2.0.0 über beiden).', 'PRIMARY_EXPLICIT', ['KK-BO-TREND-02']);
  setDna(s, 'profit_management', 'Rest erst nach dem Teilverkauf mit der 10-Tage-Linie führen.', 'PRIMARY_EXPLICIT', ['KK-BO-TRAIL-02']);
  setDna(s, 'initial_stop', 'Original: Tagestief des Einstiegstags, nicht breiter als 1 ADR. Live: Tagestief des Einstiegstags (Tagesbalken), höchstens 1 ADR unter dem Einstieg.', 'PRIMARY_EXPLICIT', ['KK-BO-STOP-LOD', 'KK-BO-STOP-ADR']);
  setSec(s, 'invalid', 'Schluss unter dem Basistief, 20 Sitzungen ohne Ausbruch oder Basisregel verletzt. Nach einem Setup-Verlust ohne Trade gibt es keine Sperre (VU-Wahl). Nach einem Basistief-Bruch, nach Verfall und nach jedem Trade gilt die 5-Sitzungen-Sperre (VU-eigen).', ['KK-BO-INV-01', 'KK-BO-INV-02', 'LC-SETUP-LOST', 'KK-BO-COOLDOWN-00', 'LC-COOLDOWN-01']);
  setText(s, 'KK-BO-COOLDOWN-00', 'Nach einem verlorenen Setup ohne Trade gibt es keine Sperre; die Suche läuft am nächsten Tag weiter (VU-Wahl seit 3.1.0). Nach einem Basistief-Bruch, nach Verfall und nach jedem Trade gilt weiterhin die 5-Sitzungen-Sperre (LC-COOLDOWN-01, VU-eigen).');
  setText(s, 'KK-BO-ENTRY-ORH', 'Original: Einstieg über dem Hoch der ersten 1, 5 oder 60 Minuten (Opening Range). Nicht umgesetzt; Live nutzt die Tageschart-Variante (KK-BO-ENTRY-ORH-D).');
  const c = s.rule_cards[0];
  c.source_basis.note = 'Momentumfilter, Stop am Tagestief, Teilverkauf und 10-Tage-Trailing folgen Kullamägis Beschreibung. Umgesetzt ist nur das Breakout-Setup als Tageschart-Variante (Kauf-Stop am 5-Tage-Hoch statt Opening-Range-Hoch). Basiserkennung, Liquiditätsfilter, Sperre, Zahl der Positionen und Rangfolge sind VU. Episodic Pivot, Parabolic Short, Margin und die diskretionäre Auswahl fehlen.';
  c.executable.note = 'Das Breakout-Setup ist von Kandidat bis Ausstieg mechanisch definiert und läuft im Simulator. Zwei weitere Setups, Margin und das diskretionäre Urteil sind nicht reproduziert.';
  s.prohibited_interpretations = [...new Set([...s.prohibited_interpretations, 'Live 3.2.0 setzt nur das Breakout-Setup um; Episodic Pivot und Parabolic Short haben keine Engine', 'Margin und die diskretionäre Auswahl und Größenwahl sind nicht reproduziert'])];
}

function fixWeinstein(s) {
  s.how_it_thinks = [
    'Wo steht die 30-Wochen-Linie — fallend, flach oder steigend?',
    'Hat sich eine lange, flache Basis gebildet (Stage 1) oder eine Fortsetzungsbasis in Stage 2?',
    'Passen Gesamtmarkt und relative Stärke zum letzten Wochenschluss?',
    'Kauf-Stop knapp über dem höchsten Tageshoch der Basis; ausgelöst im Tagesverlauf',
    'Raus bei Wochenschluss unter der 30-Wochen-Linie (VU-Vereinfachung); Weinsteins nachgezogener Stop ist nicht umgesetzt',
  ];
  s.prohibited_interpretations = [...new Set([...s.prohibited_interpretations,
    'Die Positionsgröße (0,5 % Risiko) ist keine Weinstein-Regel, sondern Kullamägis Risikospanne – eine bisherige VU-Anpassung',
    'Der Ausstieg bei Wochenschluss unter der 30-Wochen-Linie ist eine VU-Vereinfachung; es gibt keinen nachgezogenen Stop',
  ])];
  setDna(s, 'trend_filters', 'Kurs und Steigung der 30-Wochen-Linie (Stufenklassifikation, Schwellen VU).', 'MULTI_SOURCE_CONFIRMED', ['WEIN-ST1-01']);
  setDna(s, 'confirmation_rules', 'Keine Volumenbestätigung vor dem Kauf. Marktfilter und relative Stärke werden beim Kauf-Stop geprüft; das Volumen wirkt nur nach dem Kauf (Schnellverkauf).', 'SECONDARY_ONLY', ['WEIN-MKT-01', 'WEIN-RS-02', 'WEIN-VOL-04']);
  setDna(s, 'profit_management', 'Stage 2 halten bis zum Wochenschluss unter der 30-Wochen-Linie; kein nachgezogener Stop.', 'MULTI_SOURCE_CONFIRMED', ['WEIN-EXIT-01']);
  setDna(s, 'trailing_stop', 'Nicht umgesetzt: Weinstein zieht den Stop nach. Version 4.0.0 führt keinen Stop nach; bis zum Ausstieg gilt der Anfangsstop.', 'SECONDARY_ONLY', ['WEIN-TRAIL-ORIG']);
  setDna(s, 'volume_filters', 'Kein Volumenfilter vor dem Kauf. Nur der Schnellverkauf nach dem Kauf: bleibt das Volumen der Ausbruchswoche unter dem Doppelten der vier Vorwochen, wird beim ersten Schluss über dem Einstieg verkauft. Fehlt das Volumen, gilt der Ausbruch als bestätigt.', 'SECONDARY_ONLY', ['WEIN-VOL-04', 'WEIN-VOL-02']);
  setDna(s, 'market_regime', 'Marktfilter: kein Einstieg, wenn SPY zum letzten Wochenschluss unter seiner 30-Wochen-Linie schließt oder diese fällt (seit 3.0.0).', 'MULTI_SOURCE_CONFIRMED', ['WEIN-MKT-01']);
  setDna(s, 'entry_trigger', 'Kauf-Stop knapp über dem höchsten Tageshoch der Basis, ausgelöst im Tagesverlauf (seit 3.0.0). Markt und relative Stärke werden zum letzten Wochenschluss geprüft.', 'SECONDARY_ONLY', ['WEIN-ENTRY-BS']);
  setDna(s, 'initial_stop', '2 % unter dem tiefsten Wochenschluss der Basis (VU-Wert; Weinstein: unter dem nächsten Zwischentief).', 'VU_FORMALIZATION', ['WEIN-STOP-01']);
  setDna(s, 'relative_strength_filters', 'Mansfield-RS über der Nulllinie zum letzten Wochenschluss, geprüft erst beim Kauf-Stop. Die 13-Wochen-Steigung gilt seit 2.0.0 nicht mehr.', 'MULTI_SOURCE_CONFIRMED', ['WEIN-RS-02']);
  setDna(s, 'position_sizing', 'Keine Weinstein-Regel bekannt (Buch nicht abgerufen). Das Modellportfolio rechnet 0,5 % Risiko ÷ Stopabstand, höchstens 20 % je Position – eine bisherige VU-Anpassung; die 0,5 % stammen aus Kullamägis Risikospanne (Fremdregel).', 'NOT_VERIFIABLE', ['WEIN-SIZE-VU']);
  setDna(s, 'portfolio_constraints', 'Weinsteins Größen- und Streuungsregeln sind nicht belegt. Höchstens 10 Positionen und 20 % je Position sind VU-eigen (aus den Portfolio-Standardwerten geerbt).', 'NOT_VERIFIABLE', ['WEIN-SIZE-VU']);
  setDna(s, 'scaling_in', 'Weinstein: halbe Position beim Ausbruch, Rest beim Rücksetzer. Nicht umgesetzt.', 'SECONDARY_ONLY', ['WEIN-HALF-ORIG']);
  setDna(s, 'source_fidelity', 'Nur die Einstiegsidee ist belegt (Stufenmodell, Kauf-Stop, Marktfilter, Volumen-Schnellverkauf). Positionsgröße, Anfangsstop und Hauptausstieg sind VU-Anpassungen oder Fremdregeln.', 'VU_FORMALIZATION');
  const c = s.rule_cards[0];
  c.plan.exitSummary = 'Anfangsstop 2 % unter der Basis · Ausstieg bei Wochenschluss unter der 30-Wochen-Linie (kein nachgezogener Stop) · bei schwachem Ausbruchsvolumen Verkauf beim ersten Gewinn';
  setSec(s, 'candidate', 'Stage 1: flache 30-Wochen-Linie nach Abwärtstrend (Basis ≥ 10 Wochen) oder ab 4.0.0 eine Fortsetzungsbasis in Stage 2. Die relative Stärke wird erst beim Kauf-Stop geprüft, Wochenvolumen ist kein Kandidatenfilter.', ['WEIN-ST1-01', 'WEIN-CONT-01']);
  setSec(s, 'execution', 'Zum Ausbruchspunkt oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Das Volumen der Ausbruchswoche ist erst am Wochenende bekannt; ist es schwach, gilt die Volumen-Schnellverkaufsregel (Verkauf beim ersten Gewinn).', ['LC-BUY-STOP', 'WEIN-VOL-04', 'LC-MODEL-ENTRY']);
  setSec(s, 'initialStop', '2 % unter dem tiefsten Wochenschluss der Basis (VU-Wert).', ['WEIN-STOP-01']);
  setSec(s, 'hold', 'Stage 2: Es gibt keinen nachgezogenen Stop. Die Position läuft bis zum Anfangsstop oder zum Ausstieg bei Wochenschluss unter der 30-Wochen-Linie. Weinsteins Nachziehen des Stops ist nicht umgesetzt.', ['LC-ACTIVE', 'WEIN-TRAIL-ORIG']);
  setSec(s, 'exit', 'Anfangsstop oder Wochenschluss unter der 30-Wochen-Linie → Verkauf zur nächsten Eröffnung. Kein Stop innerhalb der Woche an der Linie, kein nachgezogener Stop. Der Wochenschluss-Ausstieg ist eine VU-Vereinfachung, nicht Weinsteins Stop-Regel.', ['WEIN-EXIT-01', 'WEIN-STOP-01']);
  setSec(s, 'invalid', 'Schluss unter dem Stopniveau der Basis oder 60 Sitzungen ohne Bestätigung. Ein fehlendes Ausbruchsvolumen macht ein Setup nicht ungültig.', ['WEIN-INV-01', 'WEIN-INV-02', 'LC-SETUP-LOST']);
  setSec(s, 'volume', 'Das Volumen wirkt nur nach dem Kauf (Schnellverkauf bei schwachem Ausbruchsvolumen). Fehlt das Wochenvolumen oder der Vierwochenschnitt, wird nicht verkauft: Der Ausbruch gilt wie bestätigt (VU-Annahme).', ['WEIN-VOL-02', 'WEIN-VOL-04'], true);
  setSec(s, 'gap', 'Keine Gap-Sperre belegt: Eröffnet der Titel über dem Trigger, wird zur Eröffnung gekauft.', ['LC-BUY-STOP'], true);
  setText(s, 'WEIN-VOL-02', 'Fehlt das Wochenvolumen (oder der Vierwochenschnitt), wird WEIN-VOL-04 nicht ausgelöst: Der Ausbruch gilt als bestätigt, die Volumenregel als „nicht prüfbar“. VU-Annahme.');
  setText(s, 'WEIN-EXIT-01', 'Wochenschluss unter der 30-Wochen-Linie: Ausstieg zur nächsten Eröffnung. VU-Vereinfachung; Weinstein zieht dagegen einen Stop nach (WEIN-TRAIL-ORIG).');
  setText(s, 'WEIN-CONT-01', ruleOf(s, 'WEIN-CONT-01').plain_language_explanation.replace('Quelle: Weinsteins Fortsetzungskäufe (über stageanalysis.net mit Buchzitaten)', 'Idee: Fortsetzungskäufe nach einer Checkliste von stageanalysis.net (Dritter, mit Buchzitaten)'));
  c.executable.gaps = ['Volumenregel nur im ~1-Jahres-Tagesfenster prüfbar; sonst „nicht prüfbar“', 'Nachgezogener Stop, Halbposition mit Rücksetzerkauf und Gruppenfilter sind nicht umgesetzt'];
  c.source_basis.note = 'Phasenmodell, Kauf-Stop über der Basis und der Volumen-Schnellverkauf sind in Sekundärquellen mit Buchzitaten belegt; das Buch wurde nicht gelesen. Stage-Klassifikator, Basislänge, Anfangsstop, Hauptausstieg und die Portfoliogrößen sind VU-Anpassungen oder Fremdregeln (0,5 % Risiko: Kullamägi).';
}

function fixDarvas(s) {
  s.how_it_thinks = [
    'Steht die Aktie nahe ihrem 52-Wochen-Hoch und gehört sie zu den momentumstarken Titeln?',
    'Hat sich eine Oberkante gebildet, die 3 Sitzungen hält? (Die Dreitagesregel schreibt TraderFox Darvas zu; sie ist keine belegte Darvas-Regel.)',
    'Hat sich darunter eine Unterkante bestätigt?',
    'Kauf-Stop an der Oberkante der Box; Stop 1 % unter der Kauforder (VU-Wert)',
    'Mit jeder höheren Kiste wird der Stop auf deren Unterkante nachgezogen',
  ];
  s.prohibited_interpretations = [...new Set([...s.prohibited_interpretations,
    'Der 1-%-Stop ist kein Darvas-Original: Darvas legte den Stop „knapp unter“ die Kauforder, eine Zahl ist nicht belegt',
    'Die Marktampel (SPY über GD 200) und die Dreitagesregel stammen aus TraderFox-Beschreibungen, nicht von Darvas',
    'Die 100-%-Regel seit dem Jahrestief gehört zur TraderFox-Variante bzw. zu VU Trendfolge 52W, nicht zu dieser Methode',
  ])];
  setDna(s, 'trailing_stop', 'Unterkante der jüngsten bestätigten Box über dem Einstieg (Prinzip nach Darvas; die Boxdefinition ist VU bzw. TraderFox).', 'VU_FORMALIZATION', ['DAR-STOP-01']);
  setDna(s, 'initial_stop', '1 % unter der Kauforder (Boxoberkante × 0,99). Darvas: Stop knapp unter der Kauforder (TIME 1959) ohne Zahl; die 1 % sind VU.', 'VU_FORMALIZATION', ['DAR-STOP-03']);
  setDna(s, 'entry_trigger', 'Kauf-Stop an der Boxoberkante: Steigt der Kurs im Tagesverlauf darüber, gilt das Modell als gekauft (seit 3.0.0). Darvas: Kauforder am Ausbruchspunkt (TIME 1959).', 'PRIMARY_EXPLICIT', ['DAR-ENTRY-BS']);
  setDna(s, 'entry_zone', 'Eröffnet der Kurs über der Oberkante, wird zur Eröffnung gekauft (kein Gap-Ausschluss).', 'VU_FORMALIZATION', ['DAR-ENTRY-BS']);
  setDna(s, 'market_regime', 'Marktampel im Modellportfolio (seit 3.0.2 live): keine neue Position, wenn SPY am Vortag unter seinem 200-Tage-Durchschnitt schloss. Die Ampel stammt aus einer TraderFox-Variante, nicht von Darvas.', 'VU_FORMALIZATION', ['PORT-MARKET-200']);
  setDna(s, 'position_sizing', 'Keine Darvas-Regel. Das Modellportfolio rechnet 0,5 % Risiko ÷ Stopabstand (Zahl aus Kullamägis Risikospanne), begrenzt auf 1/6 je Titel (VU).', 'NOT_VERIFIABLE', ['DAR-SIZE-VU', 'DAR-PORT-02']);
  setDna(s, 'portfolio_constraints', 'Höchstens 6 Titel (Darvas, TIME 1959). Das Höchstgewicht 1/6 je Titel ist VU, die Marktampel stammt von TraderFox.', 'PRIMARY_EXPLICIT', ['DAR-PORT-01', 'DAR-PORT-02', 'PORT-MARKET-200']);
  setDna(s, 'fundamental_filters', 'Darvas verlangte wachsende Firmen mit möglicher Gewinnverdopplung (TIME 1959). Live 3.0.2 hat keinen Gewinn- oder Wachstumsfilter. Zeitpunktgenaue EPS- und Umsatzdaten liegen privat vor, sind aber nicht integriert.', 'SECONDARY_ONLY');
  setDna(s, 'growth_filters', 'Siehe Fundamentalfilter – im Live-Modell nicht umgesetzt.', 'SECONDARY_ONLY');
  setDna(s, 'source_fidelity', 'Original: Kauforder am Ausbruchspunkt, Stop knapp darunter, nachgezogener Stop, 5–6 Titel. VU: Boxdefinition, 1-%-Stop, Auswahl nach Momentum, 1/6-Kappe, A/B-Stufen. TraderFox: Marktampel, Dreitagesbox. Kullamägi: 0,5 % Risiko.', 'VU_FORMALIZATION');
  const c = s.rule_cards[0];
  setSec(s, 'execution', 'Zur Oberkante oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Höchstens 6 Titel, Höchstgewicht 1/6 je Titel (VU). Keine neue Position, wenn SPY am Vortag unter seinem 200-Tage-Durchschnitt schloss (Marktampel, TraderFox-Regel).', ['LC-BUY-STOP', 'DAR-PORT-01', 'DAR-PORT-02', 'PORT-MARKET-200', 'LC-MODEL-ENTRY']);
  setSec(s, 'initialStop', '1 % unter der Kauforder (Boxoberkante). Darvas nennt nur „knapp unter der Kauforder“; die 1 % sind VU. Schließt der Einstiegstag auf oder unter dem Stop, Ausstieg am selben Tag.', ['DAR-STOP-03', 'LC-SAME-DAY']);
  setSec(s, 'hold', 'Der Stop wird mit jeder höheren, bestätigten Box auf deren Unterkante nachgezogen. Pyramidisieren (Darvas) ist nicht umgesetzt.', ['DAR-STOP-01', 'DAR-PYR-01', 'LC-ACTIVE']);
  setSec(s, 'gap', 'Keine Gap-Sperre: Eröffnet der Kurs über der Oberkante, wird zur Eröffnung gekauft; der Abstand zum Trigger wird ausgewiesen.', ['DAR-ENTRY-BS', 'LC-MODEL-ENTRY'], true);
  setText(s, 'DAR-ENTRY-01', 'Original: Kauf, sobald die Oberkante überschritten wird (Darvas nutzte Stop-Buy-Orders). Live (seit 3.0.0): Kauf-Stop im Tagesverlauf, Regel DAR-ENTRY-BS.');
  setText(s, 'DAR-STOP-01', 'Stop nachziehen: Mit jeder höheren, bestätigten Box wird der Stop auf deren Unterkante angehoben, nie gesenkt. Der Anfangsstop ist DAR-STOP-03.');
  setText(s, 'DAR-PYR-01', 'Darvas: In steigende Boxen aufstocken. Live 3.0.2 simuliert das nicht.');
  setText(s, 'PORT-MARKET-200', 'Marktampel (Runde 12): Schließt SPY unter seinem 200-Tage-Durchschnitt, nimmt das Modellportfolio keine neue Position auf; Signale und offene Positionen laufen weiter. Die Ampel stammt aus einer öffentlich beschriebenen TraderFox-Variante, nicht von Darvas; Darvas verließ den Markt in schwachen Phasen über seine Stops. Im Vollportfolio vorab festgelegt geprüft; ein Vorteil gegenüber dem Markt ist damit nicht belegt.');
  c.executable.gaps = ['Pyramiding in steigende Boxen nicht simuliert', 'Fundamentalfilter fehlt (zeitpunktgenaue SEC-Gewinndaten liegen privat vor, sind aber nicht integriert)'];
  c.source_basis.note = 'Kauforder am Ausbruchspunkt, Stop knapp darunter, nachgezogener Stop und 5–6 Titel sind in TIME 1959/1960 belegt. Boxdefinition (inkl. Dreitagesregel, TraderFox-Zuschreibung), 1-%-Stop, Auswahl nach Momentum, 1/6-Kappe und Qualitätsstufen sind VU. Marktampel und 0,5 % Risiko stammen nicht von Darvas (TraderFox bzw. Kullamägi). Darvas’ eigene Ergebnisse sind umstritten.';
}

function fixMinervini(s) {
  s.story += ' Das Live-Modell 2.0.0 setzt den Trend- und Chartteil um. Die Fundamentalprüfung (SEPA) verwendet es nicht: Zeitpunktgenaue EPS- und Umsatzdaten liegen vor und sind nur in der Forschungsversion 3.0.0 genutzt, die nicht live ging.';
  s.how_it_thinks = [
    'Steht die Aktie in einem sauberen Aufwärtstrend über 50-, 150- und 200-Tage-Linie?',
    'Ist sie nahe am Hoch und mindestens 30 % über dem Tief?',
    'Gehört sie nach dem VU-Perzentil zu den relativ stärksten Titeln?',
    'Werden die Rücksetzer kleiner, trocknet das Volumen aus?',
    'Einstieg über dem Pivot bei erhöhtem Volumen — Stop unter der letzten Kontraktion',
    'Fundamentaldaten (SEPA) prüft das Live-Modell nicht',
  ];
  s.prohibited_interpretations = [...new Set([...s.prohibited_interpretations,
    'Live 2.0.0 prüft keine SEPA-Fundamentaldaten (weder Filter noch Anzeige) und bildet SEPA nicht ab',
    'Der Ausstieg bei Schluss unter der 50-Tage-Linie mit Volumen hat keine Minervini-Fundstelle; Verkauf in die Stärke fehlt',
    'Das Ausbruchsvolumen ≥ 1,4× ist eine O’Neil-Konvention, keine belegte Minervini-Regel',
  ])];
  setDna(s, 'trailing_stop', 'Kein nachgezogener Stop. Ab 3 Anfangsrisiken Gewinn liegt der Stop mindestens auf Einstand; sonst gilt der Ausstieg bei Schluss unter der 50-Tage-Linie mit Volumen.', 'PRIMARY_INFERRED', ['MIN-BE-01']);
  setDna(s, 'regular_exit', 'Stop oder Schluss unter der 50-Tage-Linie bei überdurchschnittlichem Volumen (Herkunft ungeklärt, keine Minervini-Fundstelle). Verkauf in die Stärke fehlt.', 'SECONDARY_ONLY', ['MIN-EXIT-02', 'MIN-STOP-01']);
  setDna(s, 'position_sizing', '1,25 % Risiko je Trade und höchstens 25 % je Position (Minervini, X); höchstens 10 Positionen (Zahl VU); nach netto negativen letzten fünf Trades halbes Risiko (VU-Formalisierung der progressiven Exposition).', 'PRIMARY_INFERRED', ['MIN-SIZE-01']);
  setDna(s, 'volume_filters', 'Ausbruch nur mit mindestens dem 1,4-Fachen des 50-Tage-Volumens (die Schwelle stammt aus einer O’Neil-Konvention) und Volumenrückgang vor dem Ausbruch.', 'SECONDARY_ONLY', ['MIN-ENTRY-D2', 'MIN-VCP-02']);
  setDna(s, 'entry_trigger', 'Original: Durchbruch über den Pivot (intraday). Live 2.0.0: Tagesschluss über dem Pivot bei mindestens 1,4-fachem 50-Tage-Volumen, Modelleinstieg zur nächsten Eröffnung.', 'MULTI_SOURCE_CONFIRMED', ['MIN-ENTRY-01', 'MIN-ENTRY-D2']);
  setDna(s, 'initial_stop', 'Tief der letzten Kontraktion, höchstens 10 % unter der Einstiegseröffnung (10 % als Höchstverlust: sekundär belegt).', 'SECONDARY_ONLY', ['MIN-STOP-01']);
  setDna(s, 'confirmation_rules', 'Bestätigung am Tagesschluss über dem Pivot bei mindestens 1,4-fachem 50-Tage-Volumen (die Schwelle ist eine O’Neil-Konvention). Ohne Bestätigung kein Einstieg.', 'SECONDARY_ONLY', ['MIN-ENTRY-D2']);
  setDna(s, 'profit_management', 'Ab 3 Anfangsrisiken Gewinn liegt der Stop mindestens auf Einstand. Verkauf in die Stärke und Zeitstop fehlen.', 'PRIMARY_INFERRED', ['MIN-BE-01', 'MIN-SELL-ORIG']);
  setDna(s, 'fundamental_filters', 'SEPA verlangt Gewinn-, Umsatz- und Margenwachstum. Live 2.0.0 verwendet keine Fundamentaldaten (weder Filter noch Anzeige). Zeitpunktgenaue EPS- und Umsatzdaten liegen vor; die Forschungsversion 3.0.0 nutzt Teile davon und ging nicht live. Margen ließen sich aus vorhandenen SEC-Daten ergänzen. Analystenschätzungen, Überraschungen, institutionelle Eigentümer und ein belastbarer Branchenrang fehlen.', 'MULTI_SOURCE_CONFIRMED', ['MIN-FUND-HYBRID']);
  setDna(s, 'growth_filters', 'Siehe Fundamentalfilter – im Live-Modell 2.0.0 nicht umgesetzt.', 'MULTI_SOURCE_CONFIRMED', ['MIN-FUND-HYBRID']);
  setDna(s, 'scaling_in', 'Progressive Exposure gehört zum System. Pilotkäufe, Startquote und Aufstocken sind nicht umgesetzt; nur die Halbierung des Risikos nach einer Verlustserie (VU).', 'PRIMARY_INFERRED');
  setDna(s, 'scaling_out', 'Verkauf in die Stärke, Teilverkäufe und Zeitstop sind nicht umgesetzt.', 'MULTI_SOURCE_CONFIRMED', ['MIN-SELL-ORIG']);
  setDna(s, 'portfolio_constraints', '1,25 % Risiko, 25 % je Position, 10 Positionen (Zahl VU), Risikohalbierung nach Verlustserie (VU-Formalisierung). Startquote und Aufstocken der progressiven Exposition fehlen.', 'PRIMARY_INFERRED', ['MIN-SIZE-01']);
  setDna(s, 'source_fidelity', 'Trend Template belegt. VCP-Erkennung, RS-Perzentil und Risikofilter sind VU; das Ausbruchsvolumen ist eine Fremdregel (O’Neil-Konvention); der Ausstieg bei Schluss unter der 50-Tage-Linie hat keine Minervini-Fundstelle. SEPA und Verkauf in die Stärke fehlen.', 'VU_FORMALIZATION');
  const c = s.rule_cards[0];
  c.plan.confirmRuleId = 'MIN-ENTRY-D2';
  setSec(s, 'candidate', 'Trend Template (Kurs über 50/150/200-Tage-Linie, Linien geordnet, mindestens 30 % über dem 52-Wochen-Tief, höchstens 25 % unter dem Hoch) und VU-Relative-Stärke im oberen 30 %-Bereich.', ['MIN-TREND-01', 'MIN-TREND-02', 'MIN-HIGH-01', 'MIN-LOW-02', 'MIN-RS-01']);
  setSec(s, 'confirmation', 'Bestätigt am Tagesschluss über dem Pivot bei mindestens 1,4-fachem 50-Tage-Volumen; ohne diese Volumenbestätigung wird das Signal nicht genommen. Ist das Volumen nicht prüfbar, entfällt die Bedingung.', ['MIN-ENTRY-D2', 'LC-CONFIRM-CLOSE']);
  setSec(s, 'initialStop', 'Kontraktionstief, höchstens 10 % unter der Einstiegseröffnung.', ['MIN-STOP-01']);
  setSec(s, 'hold', 'Die Position läuft bis zum Stop, zum Einstand-Stop (ab 3 Anfangsrisiken Gewinn) oder zum Schluss unter der 50-Tage-Linie bei überdurchschnittlichem Volumen. Verkauf in die Stärke, Teilverkäufe, Zeitstop und Aufstocken (Minervini) sind nicht umgesetzt.', ['LC-ACTIVE', 'MIN-BE-01', 'MIN-SELL-ORIG']);
  setSec(s, 'warning', 'Schluss unter dem Pivot oder unter der 50-Tage-Linie ohne erhöhtes Volumen.', ['MIN-WARN-02']);
  setSec(s, 'exit', 'Stop (ruhende Stop-Order-Annahme) oder Schluss unter der 50-Tage-Linie bei überdurchschnittlichem Volumen → Verkauf zur nächsten Eröffnung. Ab 3 Anfangsrisiken Gewinn liegt der Stop mindestens auf Einstand. Die 50-Tage-Regel hat keine Minervini-Fundstelle (Herkunft ungeklärt).', ['MIN-EXIT-02', 'MIN-BE-01', 'MIN-STOP-01']);
  setSec(s, 'gap', 'Keine Gap-Sperre belegt: Einstieg zum Eröffnungskurs; der Stop bleibt auf 10 % unter dieser Eröffnung gekappt.', ['MIN-STOP-01', 'LC-MODEL-ENTRY'], true);
  setSec(s, 'volume', 'Ohne Volumen ist die Volumen-Austrocknung nicht erfüllt — es entsteht kein Setup. Das Ausbruchsvolumen ist seit 2.0.0 Bedingung des Einstiegs; fehlt es am Bestätigungstag, entfällt diese Bedingung.', ['MIN-VCP-02', 'MIN-ENTRY-D2'], true);
  setText(s, 'MIN-FUND-HYBRID', 'SEPA-Fundamentaldaten (Gewinn, Umsatz, Margen) gehören zu Minervinis Methode. Live 2.0.0 verwendet sie weder als Filter noch zur Anzeige. Die Forschungsversion 3.0.0 nutzt zeitpunktgenaue EPS- und Umsatzdaten (SEC-Erstmeldungen); sie ging nicht live.');
  setText(s, 'MIN-ENTRY-01', 'Original: Einstieg beim Durchbruch über den Pivot (intraday). Mit Tagesbalken nicht belegbar ausführbar — Live 2.0.0 wird MIN-ENTRY-D2 gerechnet.');
  setText(s, 'MIN-ENTRY-D2', ruleOf(s, 'MIN-ENTRY-D2').plain_language_explanation.replace('Ohne Volumen kein Einstieg.', 'Die Schwelle 1,4× stammt aus einer O’Neil-Konvention (Fremdregel).'));
  setText(s, 'MIN-EXIT-02', 'Ausstieg bei Schluss unter der 50-Tage-Linie mit überdurchschnittlichem Volumen (zur nächsten Eröffnung). Herkunft ungeklärt: keine Minervini-Fundstelle, eher eine O’Neil-Verkaufsregel.');
  c.executable.note = 'Technisch ausführbar. Der Ausstieg bei Schluss unter der 50-Tage-Linie hat keine Minervini-Fundstelle; Fundamentaldaten (SEPA) werden nicht geprüft.';
  c.executable.gaps = ['SEPA-Fundamentaldaten (Live 2.0.0 ohne Filter und ohne Anzeige)', 'Verkauf in die Stärke, Zeitstop, Pilotkäufe und Aufstocken'];
  c.source_basis.note = 'Trend Template ist mehrfach belegt; die VCP-Erkennung ist eine VU-Umsetzung. Das Ausbruchsvolumen ≥ 1,4× ist eine O’Neil-Konvention (Fremdregel). Der Ausstieg bei Schluss unter der 50-Tage-Linie mit Volumen hat keine Minervini-Fundstelle. Der Einstand ab 3 Anfangsrisiken ist original (Minervini auf X). Fundamentaldaten (SEPA) nutzt Live 2.0.0 nicht.';
}

function fixTurtle(s) {
  s.story = 'Die Turtle-Trader kauften nicht, weil eine Aktie „günstig“ war, sondern weil sie ein neues 20-Tage-Hoch erreichte. Viele Ausbrüche scheitern, die Verluste bleiben klein. Wenige große Trends tragen das Ergebnis. Supertrader übernimmt nur die Signale von System 1 (Kanalausbruch, Stop, Ausstieg) für liquide US-Aktien. Das Original war ein Futures-System mit Long und Short, Aufstocken und Korrelationsgrenzen. Die Live-Version ist eine VU Equity Adaptation, keine Replikation.';
  s.how_it_thinks = [
    'Ist die Aktie liquide und beweglich genug (≥ 10 USD, ≥ 20 Mio. USD Tagesumsatz, ≥ 1 % Tagesspanne)?',
    'Steht der Kurs höchstens 6 % unter dem höchsten Hoch der letzten 20 Tage (VU-Beobachtung; ab 3 % „vorbereitet“)?',
    'Kauf-Stop am Ausbruchspunkt: Steigt der Kurs im Tagesverlauf darüber, gilt das Modell als gekauft (bei Eröffnung darüber zur Eröffnung).',
    'Stop 2N unter dem Einstieg (N = 20-Tage-EMA der True Range); Ausstieg am 10-Tage-Tief im Tagesverlauf.',
  ];
  s.prohibited_interpretations = [...new Set([...s.prohibited_interpretations,
    'Keine Replikation des Futures-Systems: kein Short, kein System 2, kein Aufstocken, keine Korrelationsgrenzen, kein Hebel',
    'Der Lebenszyklus (3 % und 6 % Abstand, Verfall nach 10 Sitzungen, Sperre 5) ist VU-eigen; dadurch können echte Turtle-Ausbrüche verloren gehen',
    'Die alphabetische Auswahl gleichzeitiger Signale entspricht nicht der Originalmethode (die stärksten Märkte zuerst)',
  ])];
  setDna(s, 'trailing_stop', 'Der 10-Tage-Kanal wirkt als Ausstieg; ein nachgezogener Stop (Zukäufe) ist nicht umgesetzt.', 'PRIMARY_EXPLICIT', ['TUR-EXIT-S1-10D']);
  setDna(s, 'regular_exit', 'Bruch des 10-Tage-Tiefs im Tagesverlauf (System 1).', 'PRIMARY_EXPLICIT', ['TUR-EXIT-S1-10D']);
  setDna(s, 'initial_stop', '2N unter dem Einstieg (N = 20-Tage-EMA der True Range).', 'PRIMARY_EXPLICIT', ['TUR-STOP-2N', 'TUR-N-01']);
  setDna(s, 'entry_trigger', 'Kauf-Stop über dem 20-Tage-Hoch im Tagesverlauf (bei Eröffnung darüber zur Eröffnung), wie im Original. VU-Einschränkung: Das Setup muss vorher in die Beobachtung gelangt sein (Kurs höchstens 6 % unter dem Ausbruchspunkt); ein Ausbruch aus größerer Entfernung kann verloren gehen.', 'PRIMARY_EXPLICIT', ['TUR-ENTRY-S1-20', 'DON-NEAR-VU']);
  setDna(s, 'position_sizing', 'Unit-Formel wie im Original: 1 % des notionellen Kontos je N, bei 2N-Stop 2 % Risiko. Ohne Hebel entsteht bei Aktien ein sehr hohes Einzelgewicht (kein Gewichtsdeckel, VU). Unit-Skalierung und Gewichtsgrenze fehlen.', 'PRIMARY_EXPLICIT', ['TUR-UNIT-01', 'TUR-PORT-VU']);
  setDna(s, 'scaling_in', 'Original: bis 4 Units, je ½ N. Nicht umgesetzt (eine Position je Titel).', 'PRIMARY_EXPLICIT', ['TUR-ADD-ORIG']);
  setDna(s, 'portfolio_constraints', '12 Titel ohne Hebel (Original: 12 Units je Richtung, Grenzen 4/6/10/12 mit Korrelationsgruppen – nicht umgesetzt). Bei gleichzeitigen Signalen wählt das Modell alphabetisch (VU-eigen).', 'PRIMARY_EXPLICIT', ['TUR-PORT-VU', 'TUR-RANK-ALPHA', 'TUR-LIMITS-ORIG']);
  setDna(s, 'source_fidelity', 'Kanal, Stop 2N, Ausstieg und Unit-Formel folgen den Original-Turtle-Regeln. Abweichungen: Aktien statt Futures, nur long, kein Aufstocken, keine Korrelationsgrenzen, VU-Lebenszyklus (3 %/6 % Nähe, Verfall nach 10 Sitzungen, Sperre 5) und alphabetische Auswahl.', 'VU_FORMALIZATION');
  const c = s.rule_cards[0];
  setSec(s, 'candidate', 'Liquide Aktie, Kurs höchstens 6 % unter dem 20-Tage-Hoch (VU-Beobachtung; höchstens 3 % = vorbereitet). Aktien, die aus größerer Entfernung (z. B. per Kurslücke) ausbrechen, werden nicht erfasst.', ['DON-LIQ-VU', 'DON-NEAR-VU']);
  setSec(s, 'prepared', 'Kurs höchstens 3 % unter dem Ausbruchspunkt (VU): 20-Tage-Hoch, oder 55-Tage-Hoch, wenn der letzte Ausbruch ein Gewinner war. Invalidation = 10-Tage-Tief; ein Setup verfällt nach 10 Sitzungen ohne Ausbruch (VU).', ['DON-NEAR-VU', 'TUR-S1-FILTER', 'TUR-FAILSAFE-55', 'DON-INV-02', 'LC-SETUP', 'LC-NEAR-TRIGGER']);
  setSec(s, 'execution', 'Zum Ausbruchspunkt oder zur Eröffnung, wenn diese darüber liegt, plus 10 bp Slippage. Größe: 1 % des notionellen Kontos je N, ohne Hebel und ohne Gewichtsgrenze (VU).', ['LC-BUY-STOP', 'TUR-UNIT-01', 'TUR-NOTIONAL-01', 'TUR-PORT-VU', 'LC-MODEL-ENTRY']);
  addEdge(s, 'lifecycle', 'VU-Lebenszyklus kann Ausbrüche verlieren', 'Nähe 3 % bzw. 6 %, Verfall nach 10 Sitzungen und die 5-Sitzungen-Sperre sind VU-Regeln, keine Turtle-Regeln: Die Turtles handelten jeden Ausbruch. Dadurch können echte Turtle-Ausbrüche verloren gehen, etwa ein Kurssprung aus mehr als 6 % Abstand, ein Ausbruch nach Ablauf der 10 Sitzungen oder innerhalb der Sperre.', ['DON-NEAR-VU', 'DON-INV-02', 'LC-COOLDOWN-01']);
  addEdge(s, 'ranking', 'Auswahl gleichzeitiger Signale', 'Das Modellportfolio wählt gleichzeitige Signale alphabetisch nach Kürzel (VU-eigen). Die Originalregeln kaufen die stärksten Märkte zuerst (Turtle Rules S. 29); diese Regel ist nicht umgesetzt.', ['TUR-RANK-ALPHA', 'TUR-RANK-ORIG']);
  setText(s, 'DON-NEAR-VU', 'VU-Beobachtungsliste: Kurs höchstens 3 % unter dem 20-Tage-Hoch (vorbereitet, protokolliert); 3–6 % nur Momentaufnahme. Die Turtles handelten jeden Ausbruch; diese Regel kann Ausbrüche aus größerer Entfernung verlieren.');
  setText(s, 'DON-INV-02', 'VU-Verfall: Ein Setup, das 10 Sitzungen nicht ausbricht, verfällt. Die Turtles kannten keinen Verfall.');
  c.executable.gaps = [...new Set([...c.executable.gaps, 'Gleichzeitige Signale werden alphabetisch statt nach Stärke gewählt'])];
  c.source_basis.note = 'Kanal, Stop und Ausstieg folgen den 2003 veröffentlichten Turtle-Regeln (Futures). Aktien statt Futures, Liquiditätsgrenze, Lebenszyklus (3 %/6 % Nähe, Verfall nach 10 Sitzungen, Sperre 5), alphabetische Auswahl und das Portfolio ohne Hebel sind VU. Fehlend: Aufstocken, Short, System 2, Korrelationsgrenzen, Stärke-Rang.';
}

/* ------------------------------------------------ Namen und Herkunft */
// Ehrliche Benennung (Produktklasse im Namen): keine Live-Version erweckt den Eindruck einer Replikation.
const ORIGINATOR = {
  MOMENTUM_BREAKOUT: 'VU-Adaption nach Kristjan Kullamägi (Breakout-Setup)',
  WEINSTEIN_STAGE: 'VU-Adaption nach Stan Weinstein',
  DARVAS_BOX: 'VU-Adaption nach Nicolas Darvas',
  MINERVINI_VCP: 'VU-Adaption nach Mark Minervini',
  DONCHIAN_TURTLE: 'VU-Equity-Adaption nach Richard Donchian / Richard Dennis (Turtle Traders)',
};

/* ----------------------------------------------------------- Prüfung */
// Versionskonsistenz einer Strategie: Regelkarte (Abschnitte, Randfälle) und DNA-Felder dürfen keine Regel führen, die für die
// laufende Version nicht mehr gilt, und keine unbekannte Regel. Gleiche Prüfung im Build und im Test (Phase-1-Regressionstest A).
export function versionProblems(s) {
  const id = s.strategy_id, problems = [], st = new Map(s.rules.map((r) => [r.rule_id, r.status]));
  const c = s.rule_cards?.[0];
  for (const x of [...(c?.sections || []), ...(c?.edge_cases || [])]) {
    const legacy = x.rules.filter((rid) => st.get(rid) === RULE_STATUS.LEGACY);
    if (legacy.length) problems.push(`${id}/${x.id}: Abschnitt führt Legacy-Regeln ${legacy.join(', ')}`);
    for (const rid of x.rules) if (!st.has(rid)) problems.push(`${id}/${x.id}: Regel ${rid} unbekannt`);
  }
  for (const [k, val] of Object.entries(s)) if (val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.rules) && 'evidence' in val) {
    const legacy = val.rules.filter((rid) => st.get(rid) === RULE_STATUS.LEGACY);
    if (legacy.length) problems.push(`${id}/DNA.${k}: führt Legacy-Regeln ${legacy.join(', ')}`);
  }
  return problems;
}

/* ----------------------------------------------------------- Anwendung */
export function applyPhase1({ strategies, rule }) {
  const problems = [];
  const byId = Object.fromEntries(strategies.map((s) => [s.strategy_id, s]));
  const live = ['MOMENTUM_BREAKOUT', 'WEINSTEIN_STAGE', 'DARVAS_BOX', 'MINERVINI_VCP', 'DONCHIAN_TURTLE', 'VU_TREND_52W'].map((id) => { need(byId[id], `Strategie ${id} fehlt`); return byId[id]; });

  // 0. Namen: Produktklasse im Strategienamen
  for (const s of live) {
    const cls = LIVE_CLASSIFICATION[s.strategy_id];
    need(cls && cls.version === s.strategy_version, `${s.strategy_id}: Produktklasse passt nicht zur Version ${s.strategy_version}`);
    s.strategy_name = cls.displayName;
    if (ORIGINATOR[s.strategy_id]) s.originator = ORIGINATOR[s.strategy_id];
  }

  // 1. neue Regeln (Beschriftung) – vor den Textkorrekturen, die sie referenzieren
  const addMeta = {};
  for (const [id, list] of Object.entries(ADD)) {
    const s = byId[id];
    for (const [rid, text, machine, params, sources, evidence, vu, status, cls, from, note] of list) {
      need(!s.rules.some((r) => r.rule_id === rid), `${id}: Regel ${rid} existiert schon`);
      s.rules.push(rule(s.strategy_version, rid, text, machine, params, sources, evidence, vu));
      addMeta[`${id}:${rid}`] = { status, cls, from, note };
    }
  }

  // 2. Textkorrekturen
  fixKullamaegi(byId.MOMENTUM_BREAKOUT); fixWeinstein(byId.WEINSTEIN_STAGE); fixDarvas(byId.DARVAS_BOX); fixMinervini(byId.MINERVINI_VCP); fixTurtle(byId.DONCHIAN_TURTLE);
  for (const s of live) if (s.strategy_id !== 'VU_TREND_52W') ruleOf(s, 'LC-MODEL-ENTRY').plain_language_explanation = LC_MODEL_ENTRY;

  // 3. Status, Klasse, Konfidenz je Regel
  for (const s of live) {
    const id = s.strategy_id, v = s.strategy_version;
    for (const r of s.rules) {
      const add = addMeta[`${id}:${r.rule_id}`];
      let status = S.ACTIVE, last = null, reason = null;
      if (r.legacy_only) { status = S.LEGACY; last = r.legacy_only; reason = 'Gilt nur für offene Positionen und Setups der früheren Version.'; }
      const lg = LEGACY[id]?.[r.rule_id];
      if (lg) { status = S.LEGACY; [last, reason] = lg; r.legacy_only = last; }
      const ni = NOT_IMPL[id]?.[r.rule_id];
      if (ni) { status = S.NOT_IMPLEMENTED; reason = ni; }
      if (add) { status = add.status; if (status === S.NOT_IMPLEMENTED) reason = 'Regel des Traders, im Live-Code nicht umgesetzt.'; }
      const [cls, from, note] = add ? [add.cls, add.from, add.note] : (CLASS[id]?.[r.rule_id] || defaultClass(r, id));
      r.status = status;
      r.active_in_version = status === S.ACTIVE ? v : null;
      r.last_active_version = status === S.LEGACY ? last : null;
      r.status_reason = reason;
      r.provenance_class = cls;
      r.foreign_from = from || null;
      r.provenance_note = note || null;
      r.rule_kind = MECHANICS(r.rule_id) ? 'MECHANICS' : 'METHOD';
      r.source_confidence = confidence(r);
    }
    // 4. Regelkarte und DNA dürfen keine LEGACY-Regel als aktive Regel führen
    problems.push(...versionProblems(s));
    // 5. Version-zu-Regel-Zuordnung
    const c = s.rule_cards[0];
    const ids = (status) => s.rules.filter((r) => r.status === status).map((r) => r.rule_id);
    s.rule_versioning = {
      schema: PHASE1_VERSION, live_version: v,
      note: `Aktive Regeln gelten ausschließlich für Version ${v}. Regeln früherer Versionen stehen getrennt als „nicht mehr aktiv“; sie fließen weder in Regelkarte noch in Zähler oder Herkunftsangaben der laufenden Version ein. Offene Positionen älterer Versionen laufen unter der Regelversion ihres Einstiegs weiter.`,
      active_rule_ids: ids(S.ACTIVE),
      not_implemented_rule_ids: ids(S.NOT_IMPLEMENTED),
      retired_rules: s.rules.filter((r) => r.status === S.LEGACY).map((r) => ({ rule_id: r.rule_id, last_active_version: r.last_active_version, reason: r.status_reason })),
      versions_with_plans: Object.keys(c.plans_by_version || {}),
    };
  }
  need(!problems.length, `Versionskonsistenz verletzt:\n  ${problems.join('\n  ')}`);
  return strategies;
}

/* ----------------------------------------- Herkunft und Zähler (aktiv) */
export const strictest = (classes) => PROVENANCE_ORDER.find((k) => classes.includes(k)) || null;

export function derivePhase1Provenance(strategies) {
  for (const s of strategies) {
    if (!s.rule_versioning) continue;
    const byId = new Map(s.rules.map((r) => [r.rule_id, r]));
    for (const card of s.rule_cards || []) {
      for (const x of [...card.sections, ...card.edge_cases]) {
        const rs = x.rules.map((id) => byId.get(id)).filter((r) => r && r.status === RULE_STATUS.ACTIVE);
        const classes = rs.map((r) => r.provenance_class), method = rs.filter((r) => r.rule_kind !== 'MECHANICS').map((r) => r.provenance_class);
        x.provenance = classes.length ? strictest(method.length ? method : classes) : 'NONE';
        x.provenance_mix = Object.fromEntries(PROVENANCE_ORDER.filter((k) => classes.includes(k)).map((k) => [k, classes.filter((c) => c === k).length]));
        x.foreign_from = [...new Set(rs.filter((r) => r.provenance_class === P.FOREIGN_RULE && r.foreign_from).map((r) => r.foreign_from))];
      }
      const act = s.rules.filter((r) => r.status === RULE_STATUS.ACTIVE);
      const n = (k) => act.filter((r) => r.provenance_class === k).length;
      card.source_basis.ruleCounts = {
        active: act.length, original: n(P.ORIGINAL), original_interpretation: n(P.ORIGINAL_INTERPRETATION), vu_formalization: n(P.VU_FORMALIZATION),
        vu_own: n(P.VU_OWN), foreign: n(P.FOREIGN_RULE), unresolved: n(P.UNRESOLVED), not_public: n(P.NOT_PUBLIC),
        not_implemented: s.rules.filter((r) => r.status === RULE_STATUS.NOT_IMPLEMENTED).length, retired: s.rules.filter((r) => r.status === RULE_STATUS.LEGACY).length,
        vu: n(P.VU_FORMALIZATION) + n(P.VU_OWN),
      };
      card.source_basis.ruleCountsNote = `Gezählt werden nur die aktiven Regeln der Version ${s.strategy_version}; Regeln früherer Versionen und nicht umgesetzte Originalregeln sind ausgenommen.`;
    }
  }
}
