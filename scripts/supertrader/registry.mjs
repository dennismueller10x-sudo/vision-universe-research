// Supertrader — kanonische Strategy Registry (Quelle).
//
// build.mjs schreibt daraus supertrader/data/registry.json. Jede Strategie
// fuehrt alle DNA-Felder; jede Regel hat Herkunft (source_reference ->
// source-ledger.json), Evidenzstatus, VU-Formalisierungs-Flag und Version.
// Tests pruefen Vollstaendigkeit, Quellenverweise und Schreibweisen.
//
// Evidenzstatus (Research-Report): PRIMARY_EXPLICIT, PRIMARY_INFERRED,
// MULTI_SOURCE_CONFIRMED, SECONDARY_ONLY, DISPUTED, VU_FORMALIZATION,
// VU_EXTENSION, NOT_VERIFIABLE.

import { buildR4 } from './registry-r4.mjs';
export const REGISTRY_VERSION = 'supertrader-registry-1.0.0';

export const EVIDENCE = ['PRIMARY_EXPLICIT', 'PRIMARY_INFERRED', 'MULTI_SOURCE_CONFIRMED', 'SECONDARY_ONLY', 'DISPUTED', 'VU_FORMALIZATION', 'VU_EXTENSION', 'NOT_VERIFIABLE'];
export const PRODUCT_STATUS = ['RESEARCHED', 'SOURCE_PARTIAL', 'VU_FORMALIZATION', 'BACKTEST_PENDING', 'BACKTEST_RUNNING', 'BACKTEST_VALIDATED', 'LIVE_MONITORING', 'LIVE_VALIDATED', 'DATA_COVERAGE_PENDING', 'HYBRID_MODEL', 'ADVANCED_RESEARCH'];

export const DNA_FIELDS = [
  'strategy_id', 'strategy_version', 'strategy_name', 'strategy_family', 'originator', 'research_status', 'evidence_status',
  'automation_level', 'source_fidelity', 'universe', 'market', 'sector_rules', 'liquidity_rules', 'market_regime',
  'fundamental_filters', 'valuation_filters', 'growth_filters', 'estimate_filters', 'momentum_filters',
  'relative_strength_filters', 'trend_filters', 'volatility_filters', 'volume_filters', 'setup_definition', 'entry_trigger',
  'entry_zone', 'confirmation_rules', 'invalidation', 'initial_stop', 'position_sizing', 'scaling_in', 'scaling_out',
  'profit_management', 'trailing_stop', 'regular_exit', 'emergency_exit', 'time_exit', 'earnings_policy', 'gap_policy',
  'portfolio_constraints', 'drawdown_controls', 'required_data', 'data_coverage', 'data_freshness', 'known_failure_modes',
  'discretionary_elements', 'prohibited_interpretations',
];

// Feld mit Text und Evidenz. "none" = bewusst kein Bestandteil der Methode.
const f = (text, evidence, rules = []) => ({ text, evidence, rules });
const NONE = (why) => f(why, 'PRIMARY_EXPLICIT');
const NV = (why) => f(why, 'NOT_VERIFIABLE');

function rule(strategy_version, rule_id, plain, machine, params, sources, evidence, vu) {
  return {
    rule_id, plain_language_explanation: plain, machine_readable_definition: machine, parameter_set: params,
    source_reference: sources, evidence_status: evidence, VU_formalization_flag: vu, strategy_version,
  };
}

/* ------------------------------------------------------------------ */
const LIFECYCLE_COMMON = [
  ['LC-SETUP', 'Ein Titel erfüllt alle Setup-Regeln der Strategie; ab hier wird das Signal dauerhaft protokolliert.', 'scan(t).stage == SETUP'],
  ['LC-NEAR-TRIGGER', 'Der Kurs steht höchstens 3 % unter dem Trigger. „Nahe am Trigger“ ist nur eine Vorbereitung — kein Einstieg.', 'trigger / close(t) - 1 <= 0.03'],
  ['LC-AWAY-FROM-TRIGGER', 'Der Kurs hat sich wieder weiter als 3 % vom Trigger entfernt.', 'trigger / close(t) - 1 > 0.03'],
  ['LC-SETUP-LOST', 'Eine Setup-Regel ist am Tagesschluss nicht mehr erfüllt; das Setup ist ungültig.', 'scan(t).stage not in {SETUP, ENTRY_READY}'],
  ['LC-ACTIVE', 'Die Modellposition läuft ohne Warnsignal.', 'position open && !warning'],
  ['LC-RANK-AT-DISCOVERY', 'Rangfilter (Momentum-/RS-Perzentile) gelten bei der Entdeckung. Ein laufendes Setup wird nur durch seine Strukturregeln ungültig — sonst würde ein Rangwechsel von 98 auf 97 ein intaktes Setup täglich beenden.', 'pending: rankRule(t) := rankRule(t) || rankRule(createdAt)'],
  ['LC-CONFIRM-CLOSE', 'Daten- und Zeitregel: Es liegen nur Tagesbalken vor. Ob intraday über dem Trigger gehandelt wurde, ist nicht belegbar. Ein Einstieg gilt deshalb erst als bestätigt, wenn der Schlusskurs (Weinstein: der Wochenschluss) den Trigger überschreitet.', 'confirmed(t) := close(t) > trigger(t-1)'],
  ['LC-MODEL-ENTRY', 'Der Modelleinstieg wird zur Eröffnung des nächsten Handelstags erfasst — einem beobachteten Kurs, nie zum idealen Triggerkurs. Das ist keine reale Order.', 'entry = open(t+1) * (1 + slippage)'],
  ['LC-OPEN-BELOW-STOP', 'Eröffnet der Titel am Einstiegstag auf oder unter dem Stop, wird kein Modelleinstieg erfasst.', 'open(t+1) <= stop -> INVALIDATED'],
  ['LC-STOP-ORDER-ASSUMPTION', 'Stops werden als ruhende Stop-Order angenommen: Ausführung zum Stopkurs, wenn das Tagestief ihn erreicht; eröffnet der Titel darunter, zur Eröffnung. Ohne Intraday-Daten ist das eine Annahme, keine belegte Ausführung — sie ist je Ausstieg gekennzeichnet.', 'low(t) <= stop -> exit = min(stop, open(t)) * (1 - slippage)'],
  ['LC-CONFLICT-01', 'Konflikt vor dem Einstieg: Bricht ein Balken die Invalidation und schließt zugleich über dem Trigger, gilt die Invalidation.', 'invalidate(t) before confirm(t)'],
  ['LC-CONFLICT-02', 'Konflikt in der Position: Stop vor Ausstiegsregel vor Warnung. Ein fixes Kursziel gibt es in keiner Live-Variante; Teilverkäufe laufen zur nächsten Eröffnung, deshalb entsteht keine Stop-/Ziel-Mehrdeutigkeit in derselben Kerze.', 'stop(t) > exitRule(t) > warning(t)'],
  ['LC-DATA-GAP', 'Fehlt ein Balken oder ein Titel im Datenstand, trifft das Modell keine Entscheidung und erfindet keinen Kurs. Die Lücke wird protokolliert; offene Orders werden zur nächsten verfügbaren Eröffnung ausgeführt und gekennzeichnet.', 'missing bar -> no decision; log gap'],
  ['LC-VERSION-RETIRED', 'Ändert sich die Regelversion, werden wartende Setups der alten Version protokolliert beendet und nicht rückwirkend umgedeutet. Die neue Version sucht auf demselben Datenstand neu (neue Signal-ID). Modellpositionen laufen nur weiter, wenn die neue Version ihre Positionsführung ausdrücklich übernimmt.', 'version(sig) != version(engine) && pending -> INVALIDATED(LC-VERSION-RETIRED); position -> manageCompatible or fail'],
  ['LC-COOLDOWN-01', 'Nach Abschluss oder Ungültigkeit wird derselbe Titel 5 Sitzungen nicht neu eröffnet, damit ein Setup nicht täglich neu „geboren“ wird.', 'reopen allowed if t > closedAt + 5'],
];
const lifecycleRules = (v) => LIFECYCLE_COMMON.map(([id, plain, m]) => rule(v, id, plain, m, {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true));

/* ============================ GREENBLATT ============================ */
const GB_V = '1.0.0';
const greenblatt = {
  strategy_id: 'GREENBLATT_VALUE', strategy_version: GB_V, slug: 'greenblatt-value',
  strategy_name: 'Greenblatt Value Engine', world_name: 'Greenblatt Value', tagline: 'Gute Unternehmen zu günstigen Preisen — systematisch gerankt.',
  strategy_family: 'Systematisches Quality-Value-Ranking', originator: 'Joel Greenblatt',
  theme: { accent: '#d4af37', accent2: '#1f9d55', name: 'Grün / Gold' },
  product_status: ['RESEARCHED', 'DATA_COVERAGE_PENDING'],
  research_status: f('Portfoliomechanik von der offiziellen Magic-Formula-Website ausdrücklich beschrieben; Kennzahlenformeln mehrfach unabhängig bestätigt; exakte Buch-Accounting-Anpassungen noch nicht abgeglichen.', 'PRIMARY_EXPLICIT'),
  evidence_status: f('überwiegend PRIMARY_EXPLICIT; Kennzahlenformel MULTI_SOURCE_CONFIRMED', 'PRIMARY_EXPLICIT'),
  automation_level: 'FULLY_QUANTIFIABLE',
  source_fidelity: f('Hoch für Portfolioablauf; Accounting-Details der Originalformel erst nach Buchabgleich als Original einfrierbar.', 'MULTI_SOURCE_CONFIRMED'),
  story: 'Joel Greenblatt suchte eine einfache, mechanische Antwort auf eine alte Frage: Wie kauft man gute Unternehmen, ohne zu viel zu bezahlen? Seine „Magic Formula“ bewertet jedes Unternehmen nach zwei Zahlen — wie viel Gewinn es im Verhältnis zu seinem Preis abwirft und wie viel Rendite es auf das eingesetzte Kapital erzielt — und kauft die Kombination der besten Ränge. Kein Chart, kein Timing, keine Prognose.',
  how_it_thinks: ['Ist das Unternehmen günstig? (Earnings Yield = EBIT / Enterprise Value)', 'Ist es ein gutes Geschäft? (Return on Capital = EBIT / eingesetztes Kapital)', 'Beide Ränge addieren — die besten 20–30 Titel gleich gewichten', 'Etwa ein Jahr halten, dann nach aktuellem Ranking erneuern'],
  universe: f('An US-Börsen gelistete Aktien', 'PRIMARY_EXPLICIT', ['GB-UNIV-01']),
  market: f('USA (Originalvariante). Eine globale Variante wäre VU_EXTENSION und wird getrennt geführt.', 'PRIMARY_EXPLICIT'),
  sector_rules: f('Finanzwerte und Versorger ausgeschlossen', 'PRIMARY_EXPLICIT', ['GB-UNIV-01']),
  liquidity_rules: f('Mindest-Marktkapitalisierung frei wählbar; offizielle FAQ nennt größere Unternehmen (z. B. > 1 Mrd. USD) zur Volatilitätsreduktion. Kein zeitlos fester Kernwert.', 'DISPUTED', ['GB-SIZE-01']),
  market_regime: NONE('Kein taktischer Marktregime-Filter in der Originalmethode. Ein Trendfilter wäre VU_EXTENSION.'),
  fundamental_filters: f('Earnings Yield und Return on Capital', 'MULTI_SOURCE_CONFIRMED', ['GB-EY-01', 'GB-ROC-01']),
  valuation_filters: f('Earnings Yield = EBIT / Enterprise Value', 'MULTI_SOURCE_CONFIRMED', ['GB-EY-01']),
  growth_filters: NONE('Kein Wachstumsfilter in der Originalmethode.'),
  estimate_filters: NONE('Keine Analystenschätzungen in der Originalmethode.'),
  momentum_filters: NONE('Kein Momentumfilter in der Originalmethode.'),
  relative_strength_filters: NONE('Kein Relative-Stärke-Filter in der Originalmethode.'),
  trend_filters: NONE('Kein Trendfilter in der Originalmethode.'),
  volatility_filters: NONE('Kein Volatilitätsfilter in der Originalmethode.'),
  volume_filters: NONE('Kein Volumenfilter in der Originalmethode.'),
  setup_definition: f('Zulässiges Unternehmen → beide Kennzahlen → kombinierter Rang → Top-Gruppe', 'MULTI_SOURCE_CONFIRMED', ['GB-RANK-01']),
  entry_trigger: f('Periodischer Portfoliokauf zum Rebalance-Termin; kein Preisausbruch.', 'PRIMARY_EXPLICIT', ['GB-EXIT-01']),
  entry_zone: NONE('Keine Einstiegszone — Kauf zum Termin.'),
  confirmation_rules: NONE('Keine Bestätigungsregel.'),
  invalidation: f('Nur Daten- oder Zulässigkeitsfehler; kein technisches Invalidierungsniveau.', 'PRIMARY_EXPLICIT'),
  initial_stop: NONE('Kein technischer Stop. Ein Stop wäre VU_EXTENSION und nicht „Original Greenblatt“.'),
  position_sizing: f('Gleiche Dollarbeträge je Position', 'PRIMARY_EXPLICIT', ['GB-POS-01']),
  scaling_in: f('Bei großem Anlagebetrag Kauf in mehreren Tranchen über 12 Monate erwägen', 'PRIMARY_EXPLICIT', ['GB-STAGGER-01']),
  scaling_out: NONE('Nicht Teil der Originalmechanik.'),
  profit_management: f('Ungefähr ein Jahr halten; danach nach aktuellem Ranking erneuern', 'PRIMARY_EXPLICIT', ['GB-EXIT-01']),
  trailing_stop: NONE('Kein Trailing Stop.'),
  regular_exit: f('Verlierer kurz vor, Gewinner kurz nach einem Jahr verkaufen (steuerlich motiviert, US-Kontext)', 'PRIMARY_EXPLICIT', ['GB-EXIT-01']),
  emergency_exit: NONE('Kein Notfall-Exit.'),
  time_exit: f('Ja, ungefähr ein Jahr', 'PRIMARY_EXPLICIT', ['GB-EXIT-01']),
  earnings_policy: f('Positionen werden über Quartalszahlen gehalten', 'PRIMARY_INFERRED'),
  gap_policy: NONE('Keine Gap-Regel.'),
  portfolio_constraints: f('Mindestens etwa 20 Positionen, 20–30 als Diversifikationsbereich', 'PRIMARY_EXPLICIT', ['GB-DIV-01']),
  drawdown_controls: f('Keine taktische Cash-Regel; offizielle Seite empfiehlt mindestens 3 Jahre Anlagehorizont', 'PRIMARY_EXPLICIT'),
  required_data: f('PIT-EBIT, Enterprise Value (Marktkapitalisierung, Finanzschulden, liquide Mittel), Net Working Capital (Umlaufvermögen, kurzfristige Verbindlichkeiten), Sachanlagen netto, Branchenklassifikation, Kurse, historisches Universum inkl. Delistings', 'MULTI_SOURCE_CONFIRMED'),
  data_coverage: { measured: true, note: 'Wird bei jedem Lauf gegen die kanonischen Artefakte gemessen — siehe coverage.json.' },
  data_freshness: { measured: true },
  known_failure_modes: f('Lange Value-Durststrecken; Accounting-Sonderfälle; Microcap-/Liquiditätseffekte; PIT-Fehler; Delisting-Verluste', 'VU_FORMALIZATION'),
  discretionary_elements: f('Praktisch keine', 'PRIMARY_EXPLICIT'),
  prohibited_interpretations: ['Momentum-, Trend- oder Stopfilter nie als „Original Greenblatt“ ausweisen', 'Heutige Gotham-Kennzahlen nicht als Magic Formula 2005 darstellen', 'Einen ROC-Ersatz (z. B. EBIT / Bilanzsumme) nicht unter Greenblatts Namen berechnen', 'Kein „bewiesener“ Erfolg aus Buchbekanntheit ableiten'],
  lifecycle_mapping: { DISCOVERED: 'Unternehmen zulässig (US, keine Finanzwerte/Versorger)', WATCH: 'Ranking berechnet', SETUP: 'Top-Rang + freier Portfolio-Slot', ENTRY_READY: 'Rebalance-Termin erreicht', TRIGGERED: 'Modellkauf ausgeführt', ACTIVE: 'ca. 1 Jahr halten', WARNING: 'kein Original-WARNING (technische Warnung wäre VU_EXTENSION)', EXIT: 'Jahreshaltedauer erreicht', CLOSED: 'ersetzt durch aktuelles Ranking', INVALIDATED: 'nur Daten-/Zulässigkeitsfehler' },
  variants: [
    { variant_id: 'GREENBLATT_US_ORIGINAL', label: 'US-Original, 20–30 Titel, gleichgewichtet, jährlich', active: true, status: 'DATA_COVERAGE_PENDING', vu_formalization: false },
    { variant_id: 'GREENBLATT_US_STAGGERED', label: 'US-Original, monatlich gestaffelte Käufe', active: false, status: 'BACKTEST_PENDING', vu_formalization: false },
    { variant_id: 'GREENBLATT_GLOBAL_VU', label: 'Globale Übertragung (VU_EXTENSION)', active: false, status: 'ADVANCED_RESEARCH', vu_formalization: true },
  ],
  baselines: [
    { id: 'BL-VALUE-ONLY', label: 'Nur Earnings Yield (Value-only)' },
    { id: 'BL-QUALITY-ONLY', label: 'Nur Return on Capital (Quality-only)' },
    { id: 'BL-EW-UNIVERSE', label: 'Gleichgewichtetes Aktienuniversum inkl. Delistings' },
  ],
  sources: ['SRC-MF-FAQ', 'SRC-MF-HOW', 'SRC-MF-HOME', 'SRC-MF-ABOUTBOOK', 'SRC-MF-BOOK-2005', 'SRC-MF-BOOK-2010', 'SRC-MF-LUND-SE', 'SRC-MF-EUR-TENHOOR', 'SRC-MF-REVIEW-POZNAN', 'SRC-GOTHAM-STRATEGY'],
  track_record_note: 'Greenblatts persönliche Investmentbilanz ist kein Beleg für die mechanische Formel. Relevanter sind unabhängige Replikationen — und auch diese ersetzen keinen eigenen, bias-kontrollierten Test.',
  rules: [
    rule(GB_V, 'GB-UNIV-01', 'Nur US-gelistete Aktien; Finanzwerte und Versorger ausgeschlossen.', 'listing == US && !(sic in 6000-6799) && !(sic in 4900-4999)', { financialsSic: '6000-6799', utilitiesSic: '4900-4999' }, ['SRC-MF-FAQ'], 'PRIMARY_EXPLICIT', false),
    rule(GB_V, 'GB-SIZE-01', 'Mindestgröße ist wählbar; die Original-Website empfiehlt größere Firmen für weniger Schwankung.', 'marketCap >= floor, floor ∈ {50M, 200M, 1B} als getrennte Varianten', { floors: [5e7, 2e8, 1e9] }, ['SRC-MF-FAQ'], 'DISPUTED', false),
    rule(GB_V, 'GB-EY-01', 'Günstig: Wie viel operativer Gewinn entfällt auf den Unternehmenswert?', 'EBIT / (marketCap + totalDebt - cash)', {}, ['SRC-MF-EUR-TENHOOR', 'SRC-MF-LUND-SE'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(GB_V, 'GB-ROC-01', 'Gutes Geschäft: Wie viel operativer Gewinn entsteht auf das eingesetzte Kapital?', 'EBIT / (netWorkingCapital + netFixedAssets)', {}, ['SRC-MF-EUR-TENHOOR', 'SRC-MF-LUND-SE'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(GB_V, 'GB-RANK-01', 'Beide Ränge addieren; die kleinste Summe ist der beste Titel.', 'rank_asc(EY desc) + rank_asc(ROC desc) -> sort asc', {}, ['SRC-MF-HOW'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(GB_V, 'GB-POS-01', 'Jede Position erhält den gleichen Geldbetrag.', 'weight = 1 / N', {}, ['SRC-MF-FAQ'], 'PRIMARY_EXPLICIT', false),
    rule(GB_V, 'GB-DIV-01', 'Mindestens rund 20 Titel, bevorzugt 20–30.', 'N >= 20', { N: [20, 30] }, ['SRC-MF-FAQ'], 'PRIMARY_EXPLICIT', false),
    rule(GB_V, 'GB-STAGGER-01', 'Große Beträge über 12 Monate verteilt investieren.', 'monthly tranches over 12 months', {}, ['SRC-MF-HOW'], 'PRIMARY_EXPLICIT', false),
    rule(GB_V, 'GB-EXIT-01', 'Etwa ein Jahr halten; Verlierer vor, Gewinner nach einem Jahr ersetzen.', 'exit at ~1y; losers at t-1w, winners at t+1d', {}, ['SRC-MF-HOW'], 'PRIMARY_EXPLICIT', false),
  ],
};

/* ========================= MOMENTUM BREAKOUT ========================= */
const KK_V = '1.1.0';
const momentum = {
  strategy_id: 'MOMENTUM_BREAKOUT', strategy_version: KK_V, slug: 'momentum-breakout',
  strategy_name: 'Momentum Breakout Engine', world_name: 'Momentum Breakout', tagline: 'Die stärksten Aktien — erst wenn sie sich beruhigt haben.',
  strategy_family: 'Momentum-Swing-Breakout', originator: 'Research-basiert auf Kristjan Kullamägi (Common Breakout)',
  theme: { accent: '#2f7bff', accent2: '#39ff88', name: 'Elektrisches Blau / Neon-Grün' },
  product_status: ['RESEARCHED', 'LIVE_MONITORING', 'DATA_COVERAGE_PENDING'],
  research_status: f('Setup, Entry, Stop, Teilverkauf und Trailing sind von Kullamägi selbst öffentlich und konkret beschrieben.', 'PRIMARY_EXPLICIT'),
  evidence_status: f('größtenteils PRIMARY_EXPLICIT; Basiserkennung VU_FORMALIZATION', 'PRIMARY_EXPLICIT'),
  automation_level: 'HYBRID',
  source_fidelity: f('Hoch für die Regeln; die automatische Erkennung einer „engen Basis“ ist eine VU-Formalisierung.', 'PRIMARY_EXPLICIT'),
  story: 'Kristjan Kullamägi beschreibt öffentlich, wonach er sucht: Aktien, die zu den allerstärksten des Marktes gehören, kräftig gestiegen sind — und dann innehalten. Wenn die Schwankungen enger werden und die Tiefs steigen, sammelt sich Energie. Der Einstieg kommt erst, wenn der Kurs aus dieser Ruhezone ausbricht; das Risiko ist durch das Tagestief klar begrenzt.',
  how_it_thinks: ['Gehört die Aktie zu den stärksten 2 % über 1, 3 oder 6 Monate?', 'Ist sie zuvor deutlich gestiegen (30 %+)?', 'Konsolidiert sie 2 Wochen bis 2 Monate mit steigenden Tiefs und enger werdender Spanne?', 'Einstieg erst beim Ausbruch — Stop am Tagestief, nie breiter als eine durchschnittliche Tagesspanne', 'Nach 3 Tagen ein Drittel verkaufen, Rest mit der 10-Tage-Linie laufen lassen'],
  universe: f('US-Aktien und -ETFs, führende Momentumtitel', 'PRIMARY_EXPLICIT'),
  market: f('USA', 'PRIMARY_EXPLICIT'),
  sector_rules: NV('Keine feste Branchenregel belegt.'),
  liquidity_rules: f('Kurs ≥ 5 USD, durchschnittlicher Tagesumsatz ≥ 5 Mio. USD, ADR ≥ 2 %', 'VU_FORMALIZATION', ['KK-BO-LIQ-VU']),
  market_regime: f('Besonders geeignet in starkem, bullischem Momentumumfeld. In Version 1 wird das Regime angezeigt, nicht gefiltert.', 'PRIMARY_EXPLICIT', ['KK-BO-REGIME-01']),
  fundamental_filters: NONE('Kein Fundamentalfilter für den Common Breakout.'),
  valuation_filters: NONE('Kein Bewertungsfilter.'),
  growth_filters: NONE('Kein Wachstumsfilter.'),
  estimate_filters: NONE('Keine Schätzungen.'),
  momentum_filters: f('Top 1–2 % Performer über 1/3/6 Monate; typischer Vorlauf 30–100 %+ in 1–3 Monaten', 'PRIMARY_EXPLICIT', ['KK-BO-MOM-01', 'KK-BO-RUN-01']),
  relative_strength_filters: f('Über das Momentum-Perzentil abgebildet', 'VU_FORMALIZATION', ['KK-BO-MOM-01']),
  trend_filters: f('Steigende 10- und 20-Tage-Linie, Kurs darüber', 'PRIMARY_EXPLICIT', ['KK-BO-TREND-01']),
  volatility_filters: f('Konsolidierung mit enger werdender Spanne', 'PRIMARY_EXPLICIT', ['KK-BO-BASE-01']),
  volume_filters: f('Volumen als Qualitätsmerkmal, kein starres Vielfaches', 'PRIMARY_EXPLICIT'),
  setup_definition: f('Starker Vorlauf → kontrollierte Konsolidierung → Higher Lows → Volatilitätskontraktion', 'PRIMARY_EXPLICIT', ['KK-BO-BASE-01']),
  entry_trigger: f('Original: Opening-Range-High (1/5/60 Min.) oder Daily Breakout. Live-Variante: Tagesschluss über dem Hoch der vorherigen 5 Sitzungen, Modelleinstieg zur nächsten Eröffnung.', 'PRIMARY_EXPLICIT', ['KK-BO-ENTRY-D1', 'KK-BO-ENTRY-ORH']),
  entry_zone: f('Trigger-nah; Eröffnung weit über dem Trigger (> 0,5 ADR) wird nicht verfolgt', 'VU_FORMALIZATION', ['KK-BO-GAP-01']),
  confirmation_rules: NV('Keine universelle Bestätigungsregel belegt.'),
  invalidation: f('Schluss unter dem Tief der Basis oder Setup älter als 20 Sitzungen', 'VU_FORMALIZATION', ['KK-BO-INV-01', 'KK-BO-INV-02']),
  initial_stop: f('Original: Tagestief des Einstiegstags, nicht breiter als 1 ADR. Daily-Umsetzung: Tief des Bestätigungstags, höchstens 1 ADR unter der Einstiegseröffnung.', 'PRIMARY_EXPLICIT', ['KK-BO-STOP-01', 'KK-BO-STOP-D1']),
  position_sizing: f('Typisch 0,3–0,5 % Kontorisiko je Trade, selten > 1 %', 'PRIMARY_EXPLICIT', ['KK-RISK-01']),
  scaling_in: NV('Keine mechanische Nachkaufregel belegt.'),
  scaling_out: f('1/3–1/2 nach 3–5 Tagen verkaufen, Rest-Stop auf Einstand', 'PRIMARY_EXPLICIT', ['KK-BO-SCALE-01']),
  profit_management: f('Rest mit 10- oder 20-Tage-Linie führen', 'PRIMARY_EXPLICIT', ['KK-BO-TRAIL-01']),
  trailing_stop: f('Erster Schluss unter der 10-Tage-Linie (Variante 10d)', 'PRIMARY_EXPLICIT', ['KK-BO-TRAIL-01']),
  regular_exit: f('Stop, Teilverkauf, Trailing-Exit', 'PRIMARY_EXPLICIT'),
  emergency_exit: NV('Keine gesonderte Notfallregel belegt.'),
  time_exit: NV('Kein Time Exit belegt.'),
  earnings_policy: NV('Keine universelle Earnings-Regel für den Breakout belegt.'),
  gap_policy: f('Eröffnung über Trigger + 0,5 ADR: Setup wird nicht verfolgt', 'VU_FORMALIZATION', ['KK-BO-GAP-01']),
  portfolio_constraints: f('Höchstens ca. 30 % des Kontos über Nacht in einem Titel', 'PRIMARY_EXPLICIT', ['KK-BO-PORT-01']),
  drawdown_controls: f('Ziel, Drawdowns auf 15–20 % zu begrenzen; Mechanik nicht spezifiziert', 'PRIMARY_EXPLICIT'),
  required_data: f('Daily OHLCV (mehrjährig), Intraday-OHLCV für ORH-Varianten, ADR, gleitende Durchschnitte, Querschnitts-Momentumränge, historisches Universum', 'PRIMARY_EXPLICIT'),
  data_coverage: { measured: true }, data_freshness: { measured: true },
  known_failure_modes: f('Fehlausbrüche, zu breite Spanne, schwaches Momentumregime, Gaps über den Trigger', 'PRIMARY_INFERRED'),
  discretionary_elements: f('Auswahl der Leader, Qualität der Basis, „geordneter“ Rücksetzer', 'PRIMARY_EXPLICIT'),
  prohibited_interpretations: ['Kullamägis persönliche Rendite ist kein Beleg für dieses Modell', 'Die Daily-Variante ist nicht identisch mit seinem Intraday-ORH-Einstieg', 'Die automatische Basiserkennung ist eine VU-Formalisierung'],
  lifecycle_mapping: { DISCOVERED: 'Top-2-%-Momentum', WATCH: '30 %+ Vorlauf', SETUP: 'enge Basis 2 Wochen–2 Monate', ENTRY_READY: 'Kurs ≤ 3 % unter dem Trigger', TRIGGERED: 'Hoch über dem Trigger', ACTIVE: 'Position läuft', WARNING: 'unter Einstand oder nahe 10-Tage-Linie', EXIT: 'Schluss unter 10-Tage-Linie / Stop', CLOSED: 'Position vollständig geschlossen', INVALIDATED: 'Basis bricht vor dem Einstieg' },
  variants: [
    { variant_id: 'KK_COMMON_BREAKOUT_DAILY', label: 'Daily Breakout, 1/3 nach 3 Tagen, 10-Tage-Trailing, Stop gekappt auf 1 ADR', active: true, status: 'LIVE_MONITORING', vu_formalization: true },
    { variant_id: 'KK_COMMON_BREAKOUT_ORH', label: 'Opening-Range-High 1/5/60 Min. (Original-Einstieg)', active: false, status: 'DATA_COVERAGE_PENDING', vu_formalization: false },
    { variant_id: 'KK_COMMON_BREAKOUT_DAILY_SKIP', label: 'Daily, Trade wird ausgelassen statt Stop zu kappen', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
    { variant_id: 'KK_COMMON_BREAKOUT_DAILY_20D', label: 'Daily, 1/2 nach 5 Tagen, 20-Tage-Trailing', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
  ],
  baselines: [
    { id: 'BL-MOMENTUM-ONLY', label: 'Momentum-only: Top-2-% kaufen, monatlich erneuern' },
    { id: 'BL-MA-TREND', label: 'Einfacher MA-Trend: Kurs über steigender 20-Tage-Linie' },
  ],
  sources: ['SRC-KK-FAQ', 'SRC-KK-SETUPS', 'SRC-KK-140K', 'SRC-KK-X-SETUPS', 'SRC-BL-JT1993'],
  track_record_note: 'Kullamägi veröffentlicht außergewöhnliche Eigenangaben zu seiner Performance. Das belegt die Behauptung, nicht ihre unabhängige Prüfung — und schon gar nicht die Wirksamkeit dieser mechanischen Nachbildung.',
  rules: [
    rule(KK_V, 'KK-BO-MOM-01', 'Die Aktie gehört über 1, 3 oder 6 Monate zu den stärksten 2 % des Universums.', 'max(pctRank(ret21), pctRank(ret63), pctRank(ret126)) >= 98', { percentile: 98 }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-RUN-01', 'Vor der Konsolidierung stieg die Aktie um mindestens 30 %.', 'peakHigh(≤40 Sitzungen) / minLow(63 Sitzungen vor dem Hoch) - 1 >= 0.30', { minRun: 0.3, lookback: 63 }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-BASE-01', 'Seit dem Hoch 10–40 Sitzungen Konsolidierung, höchstens 25 % tief, steigende Tiefs und engere Spanne.', 'baseLen ∈ [10,40] && depth <= 0.25 && minLow(2. Hälfte) >= minLow(1. Hälfte) && avgRange(5) < avgRange(1. Hälfte)', { minBars: 10, maxBars: 40, maxDepth: 0.25 }, ['SRC-KK-SETUPS'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-TREND-01', 'Kurs über steigender 10- und 20-Tage-Linie.', 'close > sma10 && close > sma20 && sma20(t) > sma20(t-5)', {}, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-LIQ-VU', 'Ausreichend handelbar und beweglich: Kurs ab 5 USD, mindestens 5 Mio. USD Tagesumsatz und mindestens 2 % durchschnittliche Tagesspanne (schließt z. B. Titel in laufender Übernahme aus).', 'close >= 5 && sma20(close*volume) >= 5e6 && ADR20 >= 0.02', { minPrice: 5, minDollarVolume: 5e6, minAdr: 0.02 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-REGIME-01', 'Die Methode funktioniert laut Kullamägi am besten in starken Märkten; V1 zeigt das Regime, filtert aber nicht.', 'display(marketRegime)', {}, ['SRC-KK-FAQ'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-ENTRY-D1', 'Daily-Variante: Einstieg bestätigt, wenn der Tagesschluss über dem Hoch der vorherigen 5 Sitzungen liegt. Modelleinstieg zur nächsten Eröffnung.', 'close(t) > max(high[t-5..t-1]) -> CONFIRMED; entry = open(t+1) * (1 + slippage)', { pivotBars: 5 }, ['SRC-KK-SETUPS', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-ENTRY-ORH', 'Original: Einstieg über dem Hoch der ersten 1, 5 oder 60 Minuten.', 'high_intraday > openingRangeHigh(1m|5m|60m)', { ranges: ['1m', '5m', '60m'] }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-GAP-01', 'Eröffnet die Aktie am Einstiegstag mehr als eine halbe Tagesspanne über dem Trigger, wird kein Modelleinstieg erfasst.', 'open(t+1) > trigger * (1 + 0.5 * ADR20) -> NOT_TAKEN', { adrMultiple: 0.5 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-STOP-01', 'Stop am Tagestief des Einstiegstags, aber nie breiter als eine durchschnittliche Tagesspanne (ADR).', 'stop = max(low(entryDay), fill * (1 - ADR20))', {}, ['SRC-KK-SETUPS', 'SRC-KK-FAQ'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-STOP-D1', 'Daily-Umsetzung des Stops: Tief des Bestätigungstags, höchstens eine Tagesspanne (ADR) unter der Eröffnung des Einstiegstags.', 'stop = max(low(confirmDay), open(t+1) * (1 - ADR20))', {}, ['SRC-KK-SETUPS', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-RISK-01', 'Je Trade typischerweise 0,3–0,5 % des Kontos riskieren.', 'shares = equity * riskPct / (entry - stop)', { riskPct: [0.003, 0.005] }, ['SRC-KK-FAQ'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-SCALE-01', 'Nach 3 Sitzungen ein Drittel verkaufen und den Stop für den Rest auf Einstand ziehen.', 'after 3 sessions: sell 1/3 at next open; stop = max(stop, entry)', { sessions: 3, fraction: 0.3333 }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-TRAIL-01', 'Den Rest beim ersten Schlusskurs unter der 10-Tage-Linie verkaufen (zur nächsten Eröffnung).', 'close(t) < sma10(t) -> sell remainder at open(t+1)', { ma: 10 }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
    rule(KK_V, 'KK-BO-WARN-01', 'Warnung, wenn die Position unter Einstand schließt oder nahe an der 10-Tage-Linie.', 'close < entry || close < sma10 * 1.01', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-INV-01', 'Schluss unter dem Tief der Basis vor dem Einstieg: Setup ungültig.', 'close < baseLow', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-INV-02', 'Setup, das 20 Sitzungen nicht auslöst, verfällt.', 'pendingSessions > 20', { maxSessions: 20 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(KK_V, 'KK-BO-PORT-01', 'Höchstens etwa 30 % des Kontos über Nacht in einem Titel.', 'positionValue <= 0.30 * equity', { maxPositionPct: 0.3 }, ['SRC-KK-SETUPS'], 'PRIMARY_EXPLICIT', false),
  ],
};

/* ============================ WEINSTEIN ============================ */
const WE_V = '1.1.0';
const weinstein = {
  strategy_id: 'WEINSTEIN_STAGE', strategy_version: WE_V, slug: 'weinstein-stages',
  strategy_name: 'Weinstein Stage Analysis', world_name: 'Weinstein Stages', tagline: 'Jede Aktie durchläuft vier Phasen. Gekauft wird nur Phase 2.',
  strategy_family: 'Langfristiges Trend-/Phasenmodell (Wochenbasis)', originator: 'Stan Weinstein',
  theme: { accent: '#8b5cf6', accent2: '#3b82f6', name: 'Violett / Blau' },
  product_status: ['RESEARCHED', 'SOURCE_PARTIAL', 'LIVE_MONITORING', 'BACKTEST_PENDING'],
  research_status: f('Vier-Phasen-Kern breit bestätigt; exakte Volumen-, Stop- und Filterparameter erst nach Buchabgleich als Original einfrierbar.', 'MULTI_SOURCE_CONFIRMED'),
  evidence_status: f('MULTI_SOURCE_CONFIRMED (Kern), Detailparameter SECONDARY_ONLY / VU_FORMALIZATION', 'MULTI_SOURCE_CONFIRMED'),
  automation_level: 'HYBRID',
  source_fidelity: f('Kern hoch; Klassifikationsschwellen sind VU-Formalisierung.', 'MULTI_SOURCE_CONFIRMED'),
  story: 'Stan Weinstein teilt das Leben einer Aktie in vier Phasen: Basis (1), Aufwärtstrend (2), Topbildung (3) und Abwärtstrend (4). Sein Werkzeug ist ruhig und langfristig — der 30-Wochen-Durchschnitt. Gekauft wird der Übergang von einer langen Basis in Phase 2, idealerweise mit steigender relativer Stärke und kräftigem Volumen.',
  how_it_thinks: ['Wo steht die 30-Wochen-Linie — fallend, flach oder steigend?', 'Hat sich eine lange, flache Basis gebildet (Stage 1)?', 'Wird die Aktie gegenüber dem Markt stärker?', 'Einstieg erst beim Wochenschluss über dem Widerstand der Basis', 'Halten, solange Stage 2 intakt ist; raus, wenn die Aktie unter die 30-Wochen-Linie fällt'],
  universe: f('Liquide Aktien mit Markt- und Sektorvergleich', 'MULTI_SOURCE_CONFIRMED'),
  market: f('USA (Datenbestand)', 'VU_FORMALIZATION'),
  sector_rules: f('Branchenbestätigung ist Teil hochwertiger Auswahl; in V1 nicht automatisiert (SIC-Divisionen sind keine modernen Branchen).', 'MULTI_SOURCE_CONFIRMED'),
  liquidity_rules: f('Kurs ≥ 5 USD, Tagesumsatz ≥ 5 Mio. USD', 'VU_FORMALIZATION'),
  market_regime: f('Stage des Gesamtmarkts beeinflusst Aggressivität; V1 zeigt das Regime an, filtert nicht.', 'MULTI_SOURCE_CONFIRMED'),
  fundamental_filters: NONE('Keine mechanische Fundamentalvoraussetzung des Stage-Klassifikators.'),
  valuation_filters: NONE('Kein Bewertungsfilter.'),
  growth_filters: NONE('Kein Wachstumsfilter.'),
  estimate_filters: NONE('Keine Schätzungen.'),
  momentum_filters: NONE('Kein separater Momentumfilter.'),
  relative_strength_filters: f('Relative Stärke gegenüber dem Markt (Kurs / SPY) steigend', 'MULTI_SOURCE_CONFIRMED', ['WEIN-RS-01']),
  trend_filters: f('Kurs und Steigung der 30-Wochen-Linie', 'MULTI_SOURCE_CONFIRMED', ['WEIN-ST1-01', 'WEIN-ST2-01']),
  volatility_filters: NONE('Kein Volatilitätsfilter.'),
  volume_filters: f('Höheres Volumen beim Ausbruch; Vielfaches als Variante 1,5× (1,25/2/3 getrennt)', 'SECONDARY_ONLY', ['WEIN-VOL-01']),
  setup_definition: f('Stage-1-Basis ≥ 10 Wochen, Kurs nahe Widerstand, RS steigend', 'MULTI_SOURCE_CONFIRMED', ['WEIN-BASE-01']),
  entry_trigger: f('Wochenschluss über dem Widerstand der Basis, Ausführung zur nächsten Eröffnung', 'MULTI_SOURCE_CONFIRMED', ['WEIN-ST2-01']),
  entry_zone: f('Ausbruchsniveau bzw. erfolgreicher Retest (Retest-Variante nicht aktiv)', 'VU_FORMALIZATION'),
  confirmation_rules: f('Volumenbestätigung', 'SECONDARY_ONLY', ['WEIN-VOL-01']),
  invalidation: f('Schluss 2 % unter der Basis vor dem Einstieg', 'VU_FORMALIZATION', ['WEIN-INV-01']),
  initial_stop: f('2 % unter dem Basistief (Wochenschluss)', 'VU_FORMALIZATION', ['WEIN-STOP-VU']),
  position_sizing: NV('Keine belegte universelle Formel; im Backtest risikobasiert (VU).'),
  scaling_in: NV('Nicht belegt.'),
  scaling_out: NV('Nicht belegt.'),
  profit_management: f('Stage 2 halten', 'MULTI_SOURCE_CONFIRMED'),
  trailing_stop: f('2 % unter der 30-Wochen-Linie nachgezogen', 'VU_FORMALIZATION', ['WEIN-TRAIL-VU']),
  regular_exit: f('Wochenschluss unter der 30-Wochen-Linie', 'MULTI_SOURCE_CONFIRMED', ['WEIN-EXIT-01']),
  emergency_exit: NV('Nicht belegt.'),
  time_exit: NV('Nicht belegt.'),
  earnings_policy: NV('Nicht belegt.'),
  gap_policy: f('Stop-Ausführung zum Eröffnungskurs bei Gaps', 'VU_FORMALIZATION'),
  portfolio_constraints: f('Markt-/Sektorstruktur relevant; Prozentgrenzen offen', 'MULTI_SOURCE_CONFIRMED'),
  drawdown_controls: NV('Nicht belegt.'),
  required_data: f('Wöchentliche OHLCV über Jahrzehnte, 30-Wochen-Linie, Benchmark für RS, Volumen, Markt-/Sektordaten, historisches Universum', 'MULTI_SOURCE_CONFIRMED'),
  data_coverage: { measured: true }, data_freshness: { measured: true },
  known_failure_modes: f('Whipsaws an Phasengrenzen, Ausbrüche ohne Nachfrage, falsche automatische Basisklassifikation', 'VU_FORMALIZATION'),
  discretionary_elements: f('Manuelle Basis- und Widerstandserkennung im Original; hier algorithmisch', 'VU_FORMALIZATION'),
  prohibited_interpretations: ['Irgendein Kurs über der 150-Tage-Linie ist nicht automatisch Weinstein Stage 2', 'Klassische 30-Wochen-Regel und spätere 50/200-Tage-Hinweise als getrennte Varianten führen', 'Stage-4-Shorts sind Advanced Research, kein Live-Signal'],
  lifecycle_mapping: { DISCOVERED: 'Stage 1 (flache 30-Wochen-Linie)', WATCH: 'RS steigt', SETUP: 'Basis ≥ 10 Wochen', ENTRY_READY: 'Wochenschluss ≤ 3 % unter Widerstand', TRIGGERED: 'Wochenschluss über Widerstand', ACTIVE: 'Stage 2', WARNING: 'Stage 3 oder RS fällt', EXIT: 'Wochenschluss unter 30-Wochen-Linie', CLOSED: 'Position geschlossen', INVALIDATED: 'Basis bricht' },
  variants: [
    { variant_id: 'WEINSTEIN_STAGE2_WEEKLY', label: 'Stage-2-Long, 30 Wochen, Volumen 1,5×', active: true, status: 'LIVE_MONITORING', vu_formalization: true },
    { variant_id: 'WEINSTEIN_STAGE2_VOL2X', label: 'Stage-2-Long, Volumen 2×', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
    { variant_id: 'WEINSTEIN_STAGE4_SHORT', label: 'Stage-4-Short (Advanced Research)', active: false, status: 'ADVANCED_RESEARCH', vu_formalization: true },
  ],
  baselines: [{ id: 'BL-PRICE-ABOVE-MA', label: 'Kurs über 30-Wochen-Linie (ohne Basis/RS/Volumen)' }],
  sources: ['SRC-SW-BOOK', 'SRC-SW-TRADERLION-INT', 'SRC-SW-STAGE-GUIDE'],
  track_record_note: 'Für Stan Weinstein wurde keine belastbare quantitative Performancezahl gefunden. Die Methode existiert unabhängig davon — ihr Nutzen ist ungeprüft, bis ein eigener Backtest die Gates besteht.',
  rules: [
    rule(WE_V, 'WEIN-ST1-01', 'Stage 1: die 30-Wochen-Linie ist flach nach einem Abwärtstrend.', '|ma30w(k)/ma30w(k-4) - 1| <= 0.005 && letzte Trendphase fallend', { flatSlope: 0.005, slopeWeeks: 4 }, ['SRC-SW-STAGE-GUIDE', 'SRC-SW-TRADERLION-INT'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-BASE-01', 'Die Basis dauert mindestens 10 Wochen; der Kurs pendelt innerhalb ±15 % um die 30-Wochen-Linie.', 'consecutiveWeeks(flat && |close/ma30w-1| <= 0.15) >= 10', { minWeeks: 10, band: 0.15 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-RS-01', 'Relative Stärke (Kurs / SPY) ist über 13 Wochen gestiegen.', 'rs(k)/rs(k-13) - 1 > 0, rs = close/SPY', { weeks: 13 }, ['SRC-SW-STAGE-GUIDE'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-ST2-01', 'Stage 2: Wochenschluss über dem Widerstand der Basis; Kauf zur nächsten Eröffnung.', 'weeklyClose(k) > resistance(k-1) -> buy open(next session)', {}, ['SRC-SW-STAGE-GUIDE', 'SRC-SW-TRADERLION-INT'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(WE_V, 'WEIN-VOL-01', 'Der Ausbruch braucht mindestens 1,5× das durchschnittliche Wochenvolumen; ohne Volumendaten bleibt die Regel „nicht prüfbar“.', 'weeklyVolume(k) / avg(weeklyVolume, 10) >= 1.5', { multiple: 1.5, variants: [1.25, 1.5, 2, 3] }, ['SRC-SW-STAGE-GUIDE'], 'SECONDARY_ONLY', true),
    rule(WE_V, 'WEIN-VOL-02', 'Fehlt das Wochenvolumen im Tagesfenster, gilt der Ausbruch als bestätigt, die Volumenregel aber ausdrücklich als „nicht prüfbar“.', 'weeklyVolume missing -> CONFIRMED, volumeVerified = false', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-STOP-VU', 'Anfangsstop 2 % unter dem tiefsten Wochenschluss der Basis.', 'stop = baseSupport * 0.98', { buffer: 0.02 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-TRAIL-VU', 'Stop wöchentlich auf 2 % unter die 30-Wochen-Linie nachziehen.', 'stop = max(stop, ma30w * 0.98)', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-EXIT-01', 'Wochenschluss unter der 30-Wochen-Linie: Ausstieg zur nächsten Eröffnung.', 'weeklyClose < ma30w -> sell open(next)', {}, ['SRC-SW-STAGE-GUIDE'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(WE_V, 'WEIN-ST3-01', 'Warnung bei Stage 3 (Linie flacht ab) oder fallender relativer Stärke.', 'stage == 3 || rsChange13w < 0', {}, ['SRC-SW-STAGE-GUIDE'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-INV-01', 'Schluss unter dem Stopniveau der Basis vor dem Einstieg: ungültig.', 'close < baseSupport * 0.98', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(WE_V, 'WEIN-INV-02', 'Setup, das 60 Sitzungen nicht auslöst, verfällt.', 'pendingSessions > 60', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
  ],
};

/* ============================== DARVAS ============================== */
const DA_V = '1.2.0';
const darvas = {
  strategy_id: 'DARVAS_BOX', strategy_version: DA_V, slug: 'darvas-boxes',
  strategy_name: 'Darvas Box Engine', world_name: 'Darvas Boxes', tagline: 'Steigende Kisten. Kauf beim Ausbruch, Stop an der Kiste.',
  strategy_family: 'Trend-/Momentum-Breakout', originator: 'Nicolas Darvas',
  theme: { accent: '#ff7a1a', accent2: '#ef4444', name: 'Orange / Rot' },
  product_status: ['VU_FORMALIZATION', 'LIVE_MONITORING', 'BACKTEST_PENDING'],
  research_status: f('Grundgerüst mehrfach belegt; exakte Boxbildung nicht aus dem Primärwerk verifiziert.', 'MULTI_SOURCE_CONFIRMED'),
  evidence_status: f('Kern MULTI_SOURCE_CONFIRMED; Boxalgorithmus SECONDARY_ONLY/DISPUTED → VU_FORMALIZATION', 'VU_FORMALIZATION'),
  automation_level: 'HYBRID',
  source_fidelity: f('Die berechnete Box ist eine VU-Variante — nicht „die originale Darvas-Formel“.', 'VU_FORMALIZATION'),
  story: 'Nicolas Darvas, Tänzer von Beruf, beschrieb 1960, wie er Aktien in gedachten „Kisten“ beobachtete: Eine starke Aktie pendelt zwischen einer Ober- und Unterkante. Bricht sie nach oben aus, entsteht eine neue, höhere Kiste — und der Stop wandert mit. Welche genaue Regel eine Kiste definiert, ist bis heute umstritten; Vision Universe zeigt deshalb offen, welche Variante hier gerechnet wird.',
  how_it_thinks: ['Steht die Aktie nahe ihrem 52-Wochen-Hoch und gehört sie zu den momentumstarken Titeln?', 'Hat sich eine Oberkante gebildet, die 3 Sitzungen hält?', 'Hat sich darunter eine Unterkante bestätigt?', 'Kauf beim Ausbruch über die Oberkante — Stop an der Unterkante', 'Mit jeder höheren Kiste wird der Stop nachgezogen'],
  universe: f('Wachstums- und momentumstarke Aktien', 'MULTI_SOURCE_CONFIRMED'),
  market: f('USA (Datenbestand)', 'VU_FORMALIZATION'),
  sector_rules: f('Zukunftsbranchen bevorzugt; nicht automatisiert', 'SECONDARY_ONLY'),
  liquidity_rules: f('Kurs ≥ 5 USD, Tagesumsatz ≥ 5 Mio. USD', 'VU_FORMALIZATION'),
  market_regime: f('Long-Ansatz profitiert von bullischen Trends; V1 zeigt Regime an', 'MULTI_SOURCE_CONFIRMED'),
  fundamental_filters: f('Erwartete Verbesserung der Ertragskraft — in V1 nicht automatisiert', 'SECONDARY_ONLY'),
  valuation_filters: NONE('Kein Bewertungsfilter.'),
  growth_filters: f('Siehe Fundamentalfilter — nicht automatisiert', 'SECONDARY_ONLY'),
  estimate_filters: NONE('Keine Schätzungen.'),
  momentum_filters: f('Nahe neuer Hochs (≥ 90 % des 52-Wochen-Hochs, VU-Schwelle)', 'MULTI_SOURCE_CONFIRMED', ['DAR-MOM-01']),
  relative_strength_filters: f('6-Monats-Perzentil ≥ 80 als Übersetzung von „momentumstark“ — ausdrücklich VU_EXTENSION, kein Darvas-Original', 'VU_EXTENSION', ['DAR-MOM-02']),
  trend_filters: f('Steigende Boxsequenz', 'MULTI_SOURCE_CONFIRMED'),
  volatility_filters: f('Boxhöhe 3–25 %, Box an den Hochs', 'VU_FORMALIZATION', ['DAR-BOX-03', 'DAR-BOX-04']),
  volume_filters: f('Volumen als Ausbruchsindiz; kein belegtes Vielfaches', 'NOT_VERIFIABLE'),
  setup_definition: f('Bestätigte Ober- und Unterkante', 'VU_FORMALIZATION', ['DAR-BOX-01', 'DAR-BOX-02']),
  entry_trigger: f('Original: Kurs über der Boxoberkante. Live: Tagesschluss über der Oberkante, Modelleinstieg zur nächsten Eröffnung.', 'MULTI_SOURCE_CONFIRMED', ['DAR-ENTRY-01', 'DAR-ENTRY-D1']),
  entry_zone: f('Eröffnung über der Oberkante wird zum Eröffnungskurs erfasst (kein Gap-Ausschluss)', 'VU_FORMALIZATION', ['DAR-ENTRY-D1']),
  confirmation_rules: NV('Kein belegtes Volumenvielfaches.'),
  invalidation: f('Tief unter der Boxunterkante vor dem Einstieg', 'MULTI_SOURCE_CONFIRMED', ['DAR-INV-01']),
  initial_stop: f('Boxunterkante', 'VU_FORMALIZATION', ['DAR-STOP-01']),
  position_sizing: NV('Keine belegte Regel; im Backtest risikobasiert (VU).'),
  scaling_in: f('Pyramiding in steigende Boxen — in V1 nicht simuliert', 'MULTI_SOURCE_CONFIRMED', ['DAR-PYR-01']),
  scaling_out: NV('Nicht belegt.'),
  profit_management: f('Stop mit jeder höheren Box nachziehen', 'MULTI_SOURCE_CONFIRMED', ['DAR-STOP-01']),
  trailing_stop: f('Unterkante der jüngsten bestätigten Box über dem Einstieg', 'VU_FORMALIZATION', ['DAR-STOP-01']),
  regular_exit: f('Stop wird ausgelöst', 'MULTI_SOURCE_CONFIRMED'),
  emergency_exit: NV('Nicht belegt.'), time_exit: NV('Nicht belegt.'), earnings_policy: NV('Nicht belegt.'),
  gap_policy: f('Stop-Ausführung zum Eröffnungskurs bei Gaps', 'VU_FORMALIZATION'),
  portfolio_constraints: f('Keine belegte Portfolioformel', 'NOT_VERIFIABLE'),
  drawdown_controls: NV('Nicht belegt.'),
  required_data: f('Daily OHLCV mehrjährig, 52-Wochen-Hoch, historisches Universum', 'MULTI_SOURCE_CONFIRMED'),
  data_coverage: { measured: true }, data_freshness: { measured: true },
  known_failure_modes: f('Seitwärtsmärkte, Fehlausbrüche, Boxdefinition beeinflusst Ergebnis stark', 'VU_FORMALIZATION'),
  discretionary_elements: f('Ursprüngliche Boxbildung hatte Interpretationsspielraum', 'MULTI_SOURCE_CONFIRMED'),
  prohibited_interpretations: ['Niemals „exakt die originale Darvas-Formel“ behaupten', 'Die Zwei-Millionen-Dollar-Erzählung ist DISPUTED — weder als bewiesen noch als widerlegt darstellen'],
  lifecycle_mapping: { DISCOVERED: 'nahe 52-Wochen-Hoch', WATCH: 'Oberkante bestätigt', SETUP: 'Box bestätigt (A- oder B-Setup)', ENTRY_READY: 'Kurs ≤ 3 % unter Oberkante', TRIGGERED: 'Oberkante überschritten', ACTIVE: 'steigende Boxen', WARNING: 'zurück in die alte Box', EXIT: 'Stop ausgelöst', CLOSED: 'geschlossen', INVALIDATED: 'Unterkante bricht vor Einstieg' },
  quality_tiers: {
    note: 'A/B ist eine Vision-Universe-Klassifikation innerhalb derselben Setup-Regeln. Sie ist nicht backtest-validiert: ob A-Setups historisch besser waren, ist offen. Sie ordnet nur, wie sauber ein Setup aussieht.',
    A: 'A-Kandidat (vor dem Ausbruch): Regime nicht schwach, 6-Monats-Stärke Top 10 %, Box ≤ 12 %, Stop ≥ 4 % und ≥ 1 ADR entfernt. A-Einstieg (nach bestätigtem Ausbruch): zusätzlich Volumen am Bestätigungstag ≥ 1,5×.',
    phases: { A_CANDIDATE: 'A-Kandidat — vor dem Ausbruch, Volumen noch offen', B_SETUP: 'B-Setup — vor dem Ausbruch, mindestens ein Kriterium verfehlt', A_ENTRY: 'A-Einstieg — Ausbruch per Schluss bestätigt, alle Kriterien inkl. Volumen erfüllt', B_ENTRY: 'B-Einstieg — Ausbruch bestätigt, mindestens ein Kriterium verfehlt oder Volumen fehlt' },
    regimeLock: { rule: 'DAR-Q-REGIME', origin: 'VU', note: 'Keine Darvas-Originalregel. Vision-Universe-Annahme, nicht backtest-geprüft.' },
    B: 'Gültiges Darvas-Setup nach den Grundregeln, aber mindestens ein Qualitätskriterium nicht erfüllt. Nur im Signalzentrum und in der Strategy World sichtbar.',
    rules: ['DAR-Q-REGIME', 'DAR-Q-RS', 'DAR-Q-TIGHT', 'DAR-Q-STOP', 'DAR-Q-VOL'],
    labels: { 'DAR-Q-REGIME': 'Marktregime nicht schwach', 'DAR-Q-RS': 'Top 10 % Stärke (6 Monate)', 'DAR-Q-TIGHT': 'Enge Box (≤ 12 %)', 'DAR-Q-STOP': 'Stop ≥ 4 % und ≥ 1 ADR entfernt', 'DAR-Q-VOL': 'Volumen am Bestätigungstag ≥ 1,5×', 'DAR-Q-REGIME-NOTE': 'Regime-Sperre ist VU, kein Darvas-Original' },
  },
  variants: [
    { variant_id: 'DARVAS_BOX_N3_VU', label: 'Box mit 3-Sitzungen-Bestätigung (VU), Qualitätsstufen A/B', active: true, status: 'LIVE_MONITORING', vu_formalization: true },
    { variant_id: 'DARVAS_BOX_N4_VU', label: '4-Sitzungen-Bestätigung (VU)', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
    { variant_id: 'DARVAS_BOX_N5_VU', label: '5-Sitzungen-Bestätigung (VU)', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
  ],
  baselines: [{ id: 'BL-DONCHIAN-20', label: 'N-Tage-Hoch / Donchian-Breakout (20 Tage)' }],
  sources: ['SRC-ND-BOOK', 'SRC-ND-DARVAS-SECONDARY', 'SRC-ND-INVESTOPEDIA', 'SRC-ND-TIME-1960', 'SRC-ND-NYCOA-1961', 'SRC-BL-DONCHIAN', 'SRC-BL-TURTLE'],
  track_record_note: 'Darvas’ berühmte Gewinnbehauptung wurde 1960 von der New Yorker Generalstaatsanwaltschaft angegriffen, die nur rund 216.000 USD nachvollziehen konnte. Status: DISPUTED. Die Testbarkeit des Box-Konzepts ist davon unabhängig.',
  rules: [
    rule(DA_V, 'DAR-MOM-01', 'Die Aktie steht nahe ihrem 52-Wochen-Hoch (mindestens 90 %) — oder ihre Box bildet sich dort.', 'close >= 0.90 * high252 || boxTop >= 0.95 * high252', { nearHigh: 0.9, topNearHigh: 0.95 }, ['SRC-ND-DARVAS-SECONDARY'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-MOM-02', 'Die Aktie gehört über 6 Monate zu den stärksten 20 % — die messbare Übersetzung von „momentumstark“. Ein Ranking ist kein Darvas-Original.', 'pctRank(ret126) >= 80', { percentile: 80 }, ['SRC-INTERNAL-VU'], 'VU_EXTENSION', true),
    rule(DA_V, 'DAR-BOX-01', 'Oberkante: ein neues 20-Tage-Hoch, das in den folgenden 3 Sitzungen nicht überschritten wird.', 'high(i) > max(high[i-20..i-1]) && max(high[i+1..t]) < high(i) && t >= i+3', { N: 3, topLookback: 20, variants: [3, 4, 5] }, ['SRC-ND-DARVAS-SECONDARY'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-BOX-02', 'Unterkante: das tiefste Tief nach der Oberkante, das 3 Sitzungen hält.', 'floor = min(low[i+1..t]); floorIndex + 3 <= t', { N: 3 }, ['SRC-ND-DARVAS-SECONDARY'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-BOX-03', 'Die Box ist zwischen 3 % und 25 % hoch.', '0.03 <= 1 - bottom/top <= 0.25', { minHeight: 0.03, maxHeight: 0.25 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-BOX-04', 'Die Box bildet sich an den Hochs: Oberkante mindestens 95 % des 52-Wochen-Hochs.', 'boxTop >= 0.95 * high252', { topNearHigh: 0.95 }, ['SRC-ND-DARVAS-SECONDARY'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-ENTRY-01', 'Original: Kauf, sobald die Oberkante überschritten wird (Darvas nutzte Stop-Buy-Orders). Mit Tagesbalken nicht belegbar ausführbar — Live wird DAR-ENTRY-D1 gerechnet.', 'high_intraday > boxTop (reference only)', {}, ['SRC-ND-DARVAS-SECONDARY', 'SRC-ND-BOOK'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(DA_V, 'DAR-ENTRY-D1', 'Einstieg bestätigt, wenn der Tagesschluss über der Boxoberkante liegt. Modelleinstieg zur nächsten Eröffnung; Gaps werden zum Eröffnungskurs erfasst.', 'close(t) > boxTop -> CONFIRMED; entry = open(t+1) * (1 + slippage)', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-STOP-01', 'Stop an der Unterkante; mit jeder höheren bestätigten Box nachziehen.', 'stop = max(stop, latestConfirmedBoxBottom above entry)', {}, ['SRC-ND-DARVAS-SECONDARY'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-PYR-01', 'In steigende Boxen aufstocken — Version 1 simuliert das nicht.', 'add after new higher box breakout (not simulated v1)', {}, ['SRC-ND-DARVAS-SECONDARY'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(DA_V, 'DAR-Q-REGIME', 'Regime-Sperre (Vision Universe, keine Darvas-Originalregel): A nur, wenn das Marktregime nicht „breite Schwäche“ ist. Darvas beschreibt keinen solchen Marktfilter; die Sperre ist eine VU-Qualitätsannahme und nicht backtest-geprüft.', "marketRegime(runDate) != 'BROAD_WEAKNESS'", { source: 'quant/data/product/market-regime-v1.json', basis: 'Regime zum Laufzeitpunkt; keine Regimehistorie' }, ['SRC-INTERNAL-VU'], 'VU_EXTENSION', true),
    rule(DA_V, 'DAR-Q-RS', 'A-Setup nur für die stärksten 10 % über 6 Monate (strenger als die Grundregel mit 20 %).', 'pctRank(ret126) >= 90', { percentile: 90 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-Q-TIGHT', 'A-Setup nur bei enger Box: höchstens 12 % zwischen Ober- und Unterkante.', '1 - boxBottom/boxTop <= 0.12', { maxHeight: 0.12 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-Q-STOP', 'A-Setup nur, wenn der Stop weit genug unter dem Trigger liegt, um nicht vom normalen Tagesrauschen ausgelöst zu werden: mindestens 4 % und mindestens eine durchschnittliche Tagesspanne.', '1 - boxBottom/boxTop >= max(0.04, ADR20)', { minStop: 0.04, minStopAdr: 1 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-Q-VOL', 'Volumen am Bestätigungstag: Der Tag, an dem der Schluss über der Oberkante liegt, braucht mindestens das 1,5-fache des 50-Tage-Volumens. Vor dem Ausbruch ist das offen und zählt nicht gegen A-Kandidaten; fehlt das Volumen, wird der Einstieg B.', 'volume(t) / sma50(volume)(t-1) >= 1.5', { multiple: 1.5 }, ['SRC-ND-DARVAS-SECONDARY', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-WARN-01', 'Warnung, wenn der Kurs zurück unter die alte Oberkante fällt.', 'close < entryBoxTop', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(DA_V, 'DAR-INV-01', 'Tief unter der Unterkante vor dem Einstieg: Box gebrochen.', 'low(t) < boxBottom', {}, ['SRC-ND-DARVAS-SECONDARY'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(DA_V, 'DAR-INV-02', 'Box, die 30 Sitzungen nicht ausbricht, verfällt.', 'pendingSessions > 30', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
  ],
};

/* ============================ MINERVINI ============================ */
const MI_V = '1.1.0';
const minervini = {
  strategy_id: 'MINERVINI_VCP', strategy_version: MI_V, slug: 'minervini-vcp',
  strategy_name: 'Minervini SEPA / VCP', world_name: 'Minervini VCP', tagline: 'Führende Aktien, die sich zusammenziehen, bevor sie laufen.',
  strategy_family: 'Growth-/Momentum-Breakout', originator: 'Mark Minervini',
  theme: { accent: '#ffd400', accent2: '#ffffff', name: 'Gelb / Weiß / Tiefschwarz' },
  product_status: ['RESEARCHED', 'HYBRID_MODEL', 'LIVE_MONITORING', 'BACKTEST_PENDING'],
  research_status: f('Framework öffentlich bestätigt; Grenzwerte teils umstritten; Bücher als kanonische Regelquelle noch nicht abgeglichen.', 'MULTI_SOURCE_CONFIRMED'),
  evidence_status: f('MULTI_SOURCE_CONFIRMED + SECONDARY_ONLY + VU_FORMALIZATION', 'MULTI_SOURCE_CONFIRMED'),
  automation_level: 'HYBRID',
  source_fidelity: f('Trend Template gut belegt; automatische VCP-Erkennung ist VU — nicht Minervinis Charturteil.', 'VU_FORMALIZATION'),
  story: 'Mark Minervini kombiniert Trend, relative Stärke, Fundamentaldaten und ein charakteristisches Chartmuster: die Volatility Contraction — Rücksetzer, die immer kleiner werden, während das Volumen austrocknet. Das Trend Template ist nur die Eintrittskarte; das Setup entsteht erst mit der Kontraktion und dem Pivot.',
  how_it_thinks: ['Steht die Aktie in einem sauberen Aufwärtstrend über 50-, 150- und 200-Tage-Linie?', 'Ist sie nahe am Hoch und deutlich über dem Tief?', 'Gehört sie zu den relativ stärksten Titeln?', 'Werden die Rücksetzer kleiner, trocknet das Volumen aus?', 'Einstieg über dem Pivot — Stop unter der letzten Kontraktion'],
  universe: f('Führende, liquide Growth-/Momentum-Aktien', 'MULTI_SOURCE_CONFIRMED'),
  market: f('Primär USA', 'MULTI_SOURCE_CONFIRMED'),
  sector_rules: f('Starke Branchen bevorzugt; Schwellen nicht belegt, nicht automatisiert', 'SECONDARY_ONLY'),
  liquidity_rules: f('Kurs ≥ 5 USD, Tagesumsatz ≥ 5 Mio. USD', 'VU_FORMALIZATION'),
  market_regime: f('Bullisches Leader-Umfeld bevorzugt; V1 zeigt Regime an', 'PRIMARY_INFERRED'),
  fundamental_filters: f('Starkes Umsatz-/Gewinnwachstum gehört zu SEPA; Schwellen nicht primär belegt → angezeigt, nicht gefiltert', 'MULTI_SOURCE_CONFIRMED', ['MIN-FUND-HYBRID']),
  valuation_filters: NONE('Kein Bewertungsfilter.'),
  growth_filters: f('Siehe Fundamentalfilter (Anzeige)', 'MULTI_SOURCE_CONFIRMED', ['MIN-FUND-HYBRID']),
  estimate_filters: NV('Schätzungsfilter ohne PIT-Konsens nicht abbildbar.'),
  momentum_filters: f('Trend Template', 'MULTI_SOURCE_CONFIRMED', ['MIN-TREND-01', 'MIN-TREND-02']),
  relative_strength_filters: f('VU-RS-Perzentil ≥ 70 (Varianten 80/90) — kein IBD-RS', 'VU_FORMALIZATION', ['MIN-RS-01']),
  trend_filters: f('Kurs > SMA50/150/200, SMA50 > SMA150 > SMA200, SMA200 steigend', 'MULTI_SOURCE_CONFIRMED', ['MIN-TREND-01', 'MIN-TREND-02']),
  volatility_filters: f('Sukzessiv kleinere Kontraktionen', 'VU_FORMALIZATION', ['MIN-VCP-01']),
  volume_filters: f('Volumen trocknet aus (10/50 < 0,8)', 'VU_FORMALIZATION', ['MIN-VCP-02']),
  setup_definition: f('Trend Template + VCP + Pivot', 'VU_FORMALIZATION', ['MIN-VCP-01', 'MIN-VCP-02']),
  entry_trigger: f('Original: Durchbruch über den Pivot. Live: Tagesschluss über dem Pivot, Modelleinstieg zur nächsten Eröffnung.', 'MULTI_SOURCE_CONFIRMED', ['MIN-ENTRY-01', 'MIN-ENTRY-D1']),
  entry_zone: NV('Konkrete zulässige Chase-Zone nicht primär belegt.'),
  confirmation_rules: f('Volumen beim Ausbruch als Qualitätsmerkmal (angezeigt)', 'MULTI_SOURCE_CONFIRMED'),
  invalidation: f('Schluss unter dem Tief der letzten Kontraktion', 'VU_FORMALIZATION', ['MIN-INV-01']),
  initial_stop: f('Tief der letzten Kontraktion, höchstens 10 % (VU-Kappung; öffentlich kursierende 7–8 % werden NICHT als Original eingefroren)', 'VU_FORMALIZATION', ['MIN-STOP-VU']),
  position_sizing: NV('Exakte Originalformel nicht belegt; Backtest risikobasiert (VU).'),
  scaling_in: f('Progressive Exposure gehört zum System; mechanisch nicht belegt', 'PRIMARY_INFERRED'),
  scaling_out: NV('Nicht mechanisch belegt.'),
  profit_management: NV('Nicht mechanisch belegt.'),
  trailing_stop: f('Schluss unter der 50-Tage-Linie (VU)', 'VU_FORMALIZATION', ['MIN-EXIT-VU-01']),
  regular_exit: f('Stop oder technische Schwäche', 'PRIMARY_INFERRED', ['MIN-EXIT-VU-01']),
  emergency_exit: NV('Nicht belegt.'), time_exit: NV('Nicht belegt.'), earnings_policy: NV('Nicht belegt.'),
  gap_policy: f('Stop-Ausführung zum Eröffnungskurs bei Gaps', 'VU_FORMALIZATION'),
  portfolio_constraints: f('Progressive Exposure; Formel offen', 'PRIMARY_INFERRED'),
  drawdown_controls: NV('Nicht mechanisch belegt.'),
  required_data: f('Daily OHLCV, SMA, 52-Wochen-Hoch/-Tief, RS-Querschnitt, PIT-Fundamentals, ggf. Analystenschätzungen', 'MULTI_SOURCE_CONFIRMED'),
  data_coverage: { measured: true }, data_freshness: { measured: true },
  known_failure_modes: f('Fehlausbrüche, überdehnte Einstiege, schwaches Umfeld, Fehlklassifikation der VCP', 'VU_FORMALIZATION'),
  discretionary_elements: f('VCP-Qualität, Leadership, Pivot-/Basisqualität', 'MULTI_SOURCE_CONFIRMED'),
  prohibited_interpretations: ['Trend Template ist nicht die ganze Minervini-Methode', 'VU-VCP ist nicht identisch mit Minervinis Chartbeurteilung', 'VU-RS niemals „IBD RS“ nennen', 'Meisterschaftsergebnisse sind kein Backtest von SEPA/VCP'],
  lifecycle_mapping: { DISCOVERED: 'Trend Template erfüllt', WATCH: 'Kontraktionen erkannt, Volumen noch nicht trocken', SETUP: 'VCP + Pivot', ENTRY_READY: 'Kurs ≤ 3 % unter Pivot', TRIGGERED: 'Pivot überschritten', ACTIVE: 'Position läuft', WARNING: 'zurück unter Pivot', EXIT: 'Schluss unter 50-Tage-Linie / Stop', CLOSED: 'geschlossen', INVALIDATED: 'Kontraktionstief bricht' },
  variants: [
    { variant_id: 'MINERVINI_TT_VCP_A', label: 'Trend Template (25 % über Tief) + VU-VCP', active: true, status: 'LIVE_MONITORING', vu_formalization: true },
    { variant_id: 'MINERVINI_TT_VCP_B', label: 'Trend Template (30 % über Tief) + VU-VCP', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
  ],
  baselines: [{ id: 'BL-TT-NO-VCP', label: 'Trend Template ohne VCP' }, { id: 'BL-MOMENTUM-ONLY', label: 'Momentum-only' }],
  sources: ['SRC-MM-SITE', 'SRC-MM-ABOUT-MPA', 'SRC-MM-BOOK-TLSMW', 'SRC-MM-BOOK-TTLC', 'SRC-MM-VCP-PODCAST', 'SRC-MM-X-VCP', 'SRC-MM-TT-SECONDARY', 'SRC-USIC-STANDINGS', 'SRC-USIC-2021-PR'],
  track_record_note: 'Minervini gewann die U.S. Investing Championship 1997 und 2021 — belegt durch eigene und unabhängige Quellen. Das ist ein Ergebnis seines persönlichen Tradings, kein unabhängiger Backtest dieser Formalisierung.',
  rules: [
    rule(MI_V, 'MIN-TREND-01', 'Kurs über der 50-, 150- und 200-Tage-Linie.', 'close > sma50 && close > sma150 && close > sma200', {}, ['SRC-MM-TT-SECONDARY'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(MI_V, 'MIN-TREND-02', 'Die Linien sind geordnet (50 > 150 > 200) und die 200-Tage-Linie steigt seit einem Monat.', 'sma50 > sma150 > sma200 && sma200(t) > sma200(t-21)', { slopeBars: 21 }, ['SRC-MM-TT-SECONDARY'], 'MULTI_SOURCE_CONFIRMED', true),
    rule(MI_V, 'MIN-HIGH-01', 'Höchstens 25 % unter dem 52-Wochen-Hoch.', 'close >= 0.75 * high252', {}, ['SRC-MM-TT-SECONDARY'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(MI_V, 'MIN-LOW-01', 'Mindestens 25 % über dem 52-Wochen-Tief (Variante A; 30 % ist Variante B).', 'close >= 1.25 * low252', { A: 1.25, B: 1.3 }, ['SRC-MM-TT-SECONDARY'], 'DISPUTED', false),
    rule(MI_V, 'MIN-RS-01', 'Relative Stärke im oberen 30 %-Bereich des Universums (VU-Faktor, kein IBD-RS).', 'pctRank(0.4*ret63 + 0.2*ret126 + 0.2*ret189 + 0.2*ret252) >= 70', { percentile: 70, variants: [70, 80, 90] }, ['SRC-MM-TT-SECONDARY'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-VCP-01', 'Mindestens zwei Rücksetzer, jeder kleiner als der vorige; erster ≤ 35 %, letzter ≤ 10 %.', 'zigzag(4%) contractions >= 2 && depth strictly decreasing && first <= 0.35 && last <= 0.10', { zigzag: 0.04, min: 2, maxFirst: 0.35, maxLast: 0.1 }, ['SRC-MM-X-VCP', 'SRC-MM-VCP-PODCAST'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-VCP-02', 'Das Volumen trocknet aus: 10-Tage-Schnitt unter 80 % des 50-Tage-Schnitts.', 'avgVol10 / avgVol50 < 0.8', { ratio: 0.8 }, ['SRC-MM-X-VCP'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-RISK-VU', 'Abstand Pivot zu Kontraktionstief höchstens 10 %.', '1 - contractionLow / pivot <= 0.10', { maxRisk: 0.1 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-ENTRY-01', 'Original: Einstieg beim Durchbruch über den Pivot (intraday). Mit Tagesbalken nicht belegbar ausführbar — Live wird MIN-ENTRY-D1 gerechnet.', 'high_intraday > pivot (reference only)', {}, ['SRC-MM-VCP-PODCAST'], 'MULTI_SOURCE_CONFIRMED', false),
    rule(MI_V, 'MIN-ENTRY-D1', 'Einstieg bestätigt, wenn der Tagesschluss über dem Pivot liegt. Modelleinstieg zur nächsten Eröffnung.', 'close(t) > pivot -> CONFIRMED; entry = open(t+1) * (1 + slippage)', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-STOP-VU', 'Stop am Tief der letzten Kontraktion, höchstens 10 % unter dem Einstieg.', 'stop = max(contractionLow, open(t+1) * 0.90)', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-EXIT-VU-01', 'Schluss unter der 50-Tage-Linie: Ausstieg zur nächsten Eröffnung.', 'close < sma50 -> sell open(t+1)', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-WARN-01', 'Warnung, wenn der Kurs nach dem Ausbruch wieder unter den Pivot fällt.', 'close < pivot', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-INV-01', 'Schluss unter dem Kontraktionstief vor dem Einstieg: ungültig.', 'close < contractionLow', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-INV-02', 'Setup, das 20 Sitzungen nicht auslöst, verfällt.', 'pendingSessions > 20', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    rule(MI_V, 'MIN-FUND-HYBRID', 'Wachstum wird angezeigt (Umsatz TTM, Gewinnbeschleunigung), aber nicht gefiltert — die Schwellen sind nicht primär belegt.', 'display(f_revenueGrowthTTM, f_earningsAcceleration)', {}, ['SRC-MM-BOOK-TLSMW'], 'MULTI_SOURCE_CONFIRMED', true),
  ],
};

/* ===================== RUNDE 4: Donchian, CAN SLIM, Piotroski ===================== */
const { donchian, canslim, piotroski } = buildR4({ f, NONE, NV, rule, DNA_FIELDS });

/* ============================ ADVANCED ============================ */
function advanced(id, slug, name, originator, family, why, sources, status = ['ADVANCED_RESEARCH']) {
  const pending = f('Research in progress — noch nicht spezifiziert.', 'NOT_VERIFIABLE');
  const o = {
    strategy_id: id, strategy_version: '0.1.0', slug, strategy_name: name, world_name: name, tagline: why,
    strategy_family: family, originator, advanced: true,
    theme: { accent: '#6b7280', accent2: '#94a3b8', name: 'Research' },
    product_status: status, automation_level: 'NOT_SPECIFIED',
    story: why, how_it_thinks: [], lifecycle_mapping: {}, variants: [], baselines: [], rules: [], sources,
    track_record_note: 'Keine Ergebnisse, keine Signale — Research in progress.',
    prohibited_interpretations: ['Keine Ergebnisse oder Signale simulieren, solange die Research- und Datengates offen sind'],
    data_coverage: { measured: false }, data_freshness: { measured: false },
  };
  for (const k of DNA_FIELDS) if (!(k in o)) o[k] = pending;
  return o;
}

const advancedList = [
  advanced('KK_EPISODIC_PIVOT', 'kullamaegi-episodic-pivot', 'Kullamägi Episodic Pivot', 'Kristjan Kullamägi', 'Event-driven Momentum', 'Überraschender Katalysator, Gap ≥ 10 %, extremes Volumen. Blockiert durch fehlende historische Konsens-, Guidance- und News-Zeitstempel.', ['SRC-KK-SETUPS', 'SRC-KK-FAQ']),
  advanced('KK_PARABOLIC_SHORT', 'kullamaegi-parabolic-short', 'Kullamägi Parabolic Short', 'Kristjan Kullamägi', 'Exhaustion Short', 'Sein riskantestes Setup. Blockiert durch fehlende Borrow-/Locate-, Gebühren- und Intraday-Ausführungsdaten.', ['SRC-KK-SETUPS']),
  advanced('MARKET_WIZARDS_NEXT', 'market-wizards', 'Weitere Market-Wizards-Modelle', 'Schwager / Coyle (Hrsg.)', 'Diverse', 'Das neue Market-Wizards-Buch ist nur als Vorschau zugänglich und wurde NICHT vollständig gelesen. Keine Regel wird daraus abgeleitet, bevor die Kapitel vorliegen.', ['SRC-MW-NEXTGEN']),
];

// Gemeinsame Lifecycle-Regeln gehoeren zu jeder live gerechneten Strategie.
for (const s of [momentum, weinstein, darvas, minervini, donchian]) s.rules.push(...lifecycleRules(s.strategy_version));

/* ============================ REGELKARTEN ============================ */
// Eine Regelkarte je live gerechneter Variante: was vorbereitet, was bestaetigt,
// wo ungueltig, was aussteigt. Jede Sektion nennt ihre Regel-IDs; die Herkunft
// (Original / VU / gemischt) wird aus den Regeln abgeleitet, nicht behauptet.
const sec = (id, title, text, rules) => ({ id, title, text, rules });
const EDGE = {
  missingData: sec('missingData', 'Fehlende Daten', 'Fehlt ein Balken oder der Titel im Datenstand, trifft das Modell keine Entscheidung. Offene Orders laufen zur nächsten verfügbaren Eröffnung und werden als „nach Datenlücke“ gekennzeichnet.', ['LC-DATA-GAP']),
  conflictPre: sec('conflictPre', 'Konflikt vor dem Einstieg', 'Bricht derselbe Balken die Invalidation und schließt über dem Trigger, gilt die Invalidation.', ['LC-CONFLICT-01']),
  conflictPos: sec('conflictPos', 'Konflikt in der Position', 'Stop vor Ausstiegsregel vor Warnung. Kein fixes Kursziel — keine Stop-/Ziel-Mehrdeutigkeit in derselben Kerze.', ['LC-CONFLICT-02']),
  openBelowStop: sec('openBelowStop', 'Eröffnung unter dem Stop', 'Eröffnet der Titel am Einstiegstag auf oder unter dem Stop, wird kein Einstieg erfasst.', ['LC-OPEN-BELOW-STOP']),
  version: sec('version', 'Regelversion ändert sich', 'Wartende Setups der alten Version werden protokolliert beendet, nicht umgedeutet; neue Suche unter neuer Version.', ['LC-VERSION-RETIRED']),
};
const DAILY_EXEC = sec('execution', 'Ausführung', 'Datenintervall: Tagesbalken (OHLCV, split-adjustiert). Intraday nicht belegbar — deshalb Bestätigung per Tagesschluss und Modelleinstieg zur Eröffnung des nächsten Handelstags, inkl. 10 bp Slippage. Nie zum idealen Triggerkurs.', ['LC-CONFIRM-CLOSE', 'LC-MODEL-ENTRY']);

momentum.rule_cards = [{
  variant_id: 'KK_COMMON_BREAKOUT_DAILY', rule_version: KK_V, timeframe: 'daily',
  plan: { confirmRuleId: 'KK-BO-ENTRY-D1', confirmBasis: 'DAILY_CLOSE', confirmText: 'Tagesschluss über', invalidationRuleId: 'KK-BO-INV-01', invalidationBasis: 'CLOSE', invalidationText: 'Tagesschluss unter', expiryRuleId: 'KK-BO-INV-02', exitSummary: 'Stop (Tief des Bestätigungstags, ≤ 1 ADR) · nach 3 Sitzungen 1/3 verkaufen, Rest-Stop auf Einstand · Rest bei Schluss unter der 10-Tage-Linie' },
  required_data: [
    { item: 'Tages-OHLCV ≥ 127 Sitzungen', rules: ['KK-BO-MOM-01', 'KK-BO-RUN-01'] },
    { item: 'Querschnitts-Momentumränge 1/3/6 Monate', rules: ['KK-BO-MOM-01'] },
    { item: 'ADR20, SMA10, SMA20, Tagesumsatz', rules: ['KK-BO-LIQ-VU', 'KK-BO-TREND-01', 'KK-BO-GAP-01'] },
  ],
  sections: [
    sec('candidate', 'Kandidat', 'Top-2-%-Momentum über 1, 3 oder 6 Monate und mindestens 30 % Vorlauf.', ['KK-BO-MOM-01', 'KK-BO-RUN-01']),
    sec('prepared', 'Einstieg vorbereitet', 'Enge Basis 10–40 Sitzungen (≤ 25 % tief, steigende Tiefs, engere Spanne), Kurs über steigender 10/20-Tage-Linie, handelbar. Trigger = Hoch der letzten 5 Sitzungen, Invalidation = Basistief.', ['KK-BO-BASE-01', 'KK-BO-TREND-01', 'KK-BO-LIQ-VU', 'LC-SETUP', 'LC-NEAR-TRIGGER']),
    sec('confirmation', 'Trigger und Bestätigung', 'Bestätigt am Tagesschluss über dem Trigger (Stand Vortag). Ein Hoch über dem Trigger ohne Schluss darüber ist keine Bestätigung.', ['KK-BO-ENTRY-D1', 'LC-CONFIRM-CLOSE']),
    DAILY_EXEC,
    sec('initialStop', 'Anfangsstop', 'Tief des Bestätigungstags, höchstens 1 ADR unter der Einstiegseröffnung.', ['KK-BO-STOP-D1', 'KK-BO-STOP-01']),
    sec('hold', 'Halten', 'Position läuft, solange kein Stop und kein Schluss unter der 10-Tage-Linie. Nach 3 Sitzungen 1/3 zur Eröffnung verkaufen, Rest-Stop auf Einstand.', ['KK-BO-SCALE-01', 'LC-ACTIVE']),
    sec('warning', 'Warnung', 'Schluss unter Einstand oder weniger als 1 % über der 10-Tage-Linie.', ['KK-BO-WARN-01']),
    sec('exit', 'Ausstieg', 'Stop (ruhende Stop-Order-Annahme) oder erster Schluss unter der 10-Tage-Linie → Rest zur nächsten Eröffnung.', ['KK-BO-TRAIL-01', 'LC-STOP-ORDER-ASSUMPTION']),
    sec('invalid', 'Ungültig vor Einstieg', 'Schluss unter dem Basistief oder 20 Sitzungen ohne Bestätigung.', ['KK-BO-INV-01', 'KK-BO-INV-02', 'LC-SETUP-LOST']),
  ],
  edge_cases: [
    sec('gap', 'Gap über den Trigger', 'Eröffnung > Trigger + 0,5 ADR am Einstiegstag: kein Modelleinstieg. Darunter: Einstieg zum Eröffnungskurs (nicht zum Trigger).', ['KK-BO-GAP-01', 'LC-MODEL-ENTRY']),
    sec('volume', 'Fehlendes Volumen', 'Volumen ist für diese Variante kein Pflichtkriterium; fehlt es, ändert sich nichts an Bestätigung oder Ausstieg.', []),
    EDGE.missingData, EDGE.conflictPre, EDGE.conflictPos, EDGE.openBelowStop, EDGE.version,
  ],
  executable: { status: 'EXECUTABLE', gaps: [], note: 'Alle Phasen von Kandidat bis Ausstieg sind mechanisch definiert und laufen im Simulator.' },
  source_basis: { status: 'ORIGINAL_PRINCIPLES_VU_EXECUTION', note: 'Momentumfilter, Teilverkauf und 10-Tage-Trailing folgen Kullamägis eigener Beschreibung. Einstieg per Tagesschluss, enge Basis, Gap- und Invalidationsregeln sind VU; der Original-Einstieg (Opening Range) ist mangels Intraday-Historie nicht abgebildet.', fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quellen nur per Suchtreffer bestätigt, Inhalte nicht direkt abgerufen; der Source-Fidelity-Pass steht aus. Originaltreue ist damit nicht geprüft.' },
  historical_validation: { status: 'NOT_VALIDATED', note: 'Kein Backtest hat die Datengates bestanden; keine Aussage über historische Wirksamkeit.' },
}];

weinstein.rule_cards = [{
  variant_id: 'WEINSTEIN_STAGE2_WEEKLY', rule_version: WE_V, timeframe: 'weekly',
  plan: { confirmRuleId: 'WEIN-ST2-01', confirmBasis: 'WEEKLY_CLOSE', confirmText: 'Wochenschluss über', invalidationRuleId: 'WEIN-INV-01', invalidationBasis: 'CLOSE', invalidationText: 'Tagesschluss unter', expiryRuleId: 'WEIN-INV-02', exitSummary: 'Stop 2 % unter der Basis, wöchentlich 2 % unter die 30-Wochen-Linie nachgezogen · Wochenschluss unter der 30-Wochen-Linie' },
  required_data: [
    { item: 'Wochenschlusskurse (lange Reihe) und 30-Wochen-Linie', rules: ['WEIN-ST1-01', 'WEIN-BASE-01'] },
    { item: 'SPY-Wochenreihe für relative Stärke', rules: ['WEIN-RS-01'] },
    { item: 'Wochenvolumen (nur aus dem ~1-Jahres-Tagesfenster)', rules: ['WEIN-VOL-01', 'WEIN-VOL-02'] },
  ],
  sections: [
    sec('candidate', 'Kandidat', 'Stage 1: flache 30-Wochen-Linie nach Abwärtstrend; relative Stärke steigt.', ['WEIN-ST1-01', 'WEIN-RS-01']),
    sec('prepared', 'Einstieg vorbereitet', 'Basis ≥ 10 Wochen; Trigger = Widerstand der Basis, Invalidation = 2 % unter dem tiefsten Wochenschluss.', ['WEIN-BASE-01', 'LC-SETUP', 'LC-NEAR-TRIGGER']),
    sec('confirmation', 'Trigger und Bestätigung', 'Bestätigt nur am Wochenschluss (letzter Handelstag der Woche) über dem Widerstand, mit ≥ 1,5× Wochenvolumen. Ein Tagesschluss darüber innerhalb der Woche bestätigt nicht.', ['WEIN-ST2-01', 'WEIN-VOL-01', 'LC-CONFIRM-CLOSE']),
    sec('execution', 'Ausführung', 'Tagesbalken, zu Wochen aggregiert. Modelleinstieg zur Eröffnung des nächsten Handelstags nach dem Wochenschluss, inkl. Slippage.', ['LC-MODEL-ENTRY']),
    sec('initialStop', 'Anfangsstop', '2 % unter dem tiefsten Wochenschluss der Basis.', ['WEIN-STOP-VU']),
    sec('hold', 'Halten', 'Stage 2: Stop wöchentlich auf 2 % unter die 30-Wochen-Linie nachziehen.', ['WEIN-TRAIL-VU', 'LC-ACTIVE']),
    sec('warning', 'Warnung', 'Stage 3 (Linie flacht ab) oder fallende relative Stärke.', ['WEIN-ST3-01']),
    sec('exit', 'Ausstieg', 'Wochenschluss unter der 30-Wochen-Linie → zur nächsten Eröffnung; Stop als ruhende Stop-Order-Annahme.', ['WEIN-EXIT-01', 'LC-STOP-ORDER-ASSUMPTION']),
    sec('invalid', 'Ungültig vor Einstieg', 'Schluss unter dem Stopniveau der Basis, Ausbruch ohne Volumen oder 60 Sitzungen ohne Bestätigung.', ['WEIN-INV-01', 'WEIN-INV-02', 'WEIN-VOL-01', 'LC-SETUP-LOST']),
  ],
  edge_cases: [
    sec('gap', 'Gap über den Trigger', 'Keine Gap-Sperre belegt: Einstieg zum Eröffnungskurs nach dem Wochenschluss, wie hoch er auch ist.', ['LC-MODEL-ENTRY']),
    sec('volume', 'Fehlendes Volumen', 'Fehlt das Wochenvolumen, gilt der Ausbruch als bestätigt, die Volumenregel wird als „nicht prüfbar“ ausgewiesen.', ['WEIN-VOL-02']),
    EDGE.missingData, EDGE.conflictPre, EDGE.conflictPos, EDGE.openBelowStop, EDGE.version,
  ],
  executable: { status: 'EXECUTABLE', gaps: ['Volumenregel nur im ~1-Jahres-Tagesfenster prüfbar; sonst „nicht prüfbar“ (WEIN-VOL-02)'], note: 'Alle Phasen mechanisch definiert.' },
  source_basis: { status: 'SECONDARY_SOURCES_VU_THRESHOLDS', note: 'Phasenmodell, Wochenschluss-Ausbruch und 30-Wochen-Ausstieg sind in Sekundärquellen mehrfach beschrieben; das Buch wurde nicht vollständig gelesen. Stage-Klassifikator, Basislänge, Stop-Abstände und Volumenvielfaches sind VU.', fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quellen nur per Suchtreffer bestätigt, Inhalte nicht direkt abgerufen; der Source-Fidelity-Pass steht aus. Originaltreue ist damit nicht geprüft.' },
  historical_validation: { status: 'NOT_VALIDATED', note: 'Kein Backtest hat die Datengates bestanden; keine Aussage über historische Wirksamkeit.' },
}];

darvas.rule_cards = [{
  variant_id: 'DARVAS_BOX_N3_VU', rule_version: DA_V, timeframe: 'daily',
  plan: { confirmRuleId: 'DAR-ENTRY-D1', confirmBasis: 'DAILY_CLOSE', confirmText: 'Tagesschluss über', invalidationRuleId: 'DAR-INV-01', invalidationBasis: 'LOW', invalidationText: 'Tagestief unter', expiryRuleId: 'DAR-INV-02', exitSummary: 'Stop an der Boxunterkante, mit jeder höheren bestätigten Box nachgezogen · kein Kursziel' },
  required_data: [
    { item: 'Tages-OHLCV mit Hoch/Tief (Boxbildung)', rules: ['DAR-BOX-01', 'DAR-BOX-02'] },
    { item: '52-Wochen-Hoch, 6-Monats-Rang', rules: ['DAR-MOM-01', 'DAR-MOM-02', 'DAR-BOX-04'] },
    { item: 'Volumen (nur für Qualitätsstufe am Bestätigungstag)', rules: ['DAR-Q-VOL'] },
    { item: 'Marktregime (nur für Qualitätsstufe)', rules: ['DAR-Q-REGIME'] },
  ],
  sections: [
    sec('candidate', 'Kandidat', 'Nahe dem 52-Wochen-Hoch, 6-Monats-Stärke Top 20 %.', ['DAR-MOM-01', 'DAR-MOM-02']),
    sec('prepared', 'Einstieg vorbereitet', 'Box bestätigt: Oberkante hält 3 Sitzungen, Unterkante hält 3 Sitzungen, Höhe 3–25 %, an den Hochs. Trigger = Oberkante, Invalidation = Unterkante. Qualität vor dem Ausbruch: A-Kandidat oder B-Setup.', ['DAR-BOX-01', 'DAR-BOX-02', 'DAR-BOX-03', 'DAR-BOX-04', 'DAR-Q-REGIME', 'DAR-Q-RS', 'DAR-Q-TIGHT', 'DAR-Q-STOP', 'LC-SETUP', 'LC-NEAR-TRIGGER']),
    sec('confirmation', 'Trigger und Bestätigung', 'Bestätigt am Tagesschluss über der Oberkante. Erst jetzt wird das Volumen des Bestätigungstags geprüft: A-Einstieg oder B-Einstieg.', ['DAR-ENTRY-D1', 'DAR-Q-VOL', 'LC-CONFIRM-CLOSE']),
    DAILY_EXEC,
    sec('initialStop', 'Anfangsstop', 'Boxunterkante.', ['DAR-STOP-01']),
    sec('hold', 'Halten', 'Stop mit jeder höheren, bestätigten Box nachziehen. Pyramiding wird nicht simuliert.', ['DAR-STOP-01', 'DAR-PYR-01', 'LC-ACTIVE']),
    sec('warning', 'Warnung', 'Schluss zurück unter der alten Oberkante.', ['DAR-WARN-01']),
    sec('exit', 'Ausstieg', 'Nur der (nachgezogene) Stop; ruhende Stop-Order-Annahme.', ['DAR-STOP-01', 'LC-STOP-ORDER-ASSUMPTION']),
    sec('invalid', 'Ungültig vor Einstieg', 'Tagestief unter der Unterkante oder 30 Sitzungen ohne Ausbruch.', ['DAR-INV-01', 'DAR-INV-02', 'LC-SETUP-LOST']),
  ],
  edge_cases: [
    sec('gap', 'Gap über den Trigger', 'Keine Gap-Sperre: Einstieg zum Eröffnungskurs, der Abstand zum Trigger wird ausgewiesen.', ['DAR-ENTRY-D1', 'LC-MODEL-ENTRY']),
    sec('volume', 'Volumen vor und nach dem Ausbruch', 'Vor dem Ausbruch ist das Volumen offen und zählt nicht gegen einen A-Kandidaten. Am Bestätigungstag gemessen; fehlt es, wird der Einstieg B.', ['DAR-Q-VOL']),
    sec('regime', 'Regimewechsel', 'Die Regime-Sperre ist VU. Der Regimestand wird täglich neu gelesen; ein vorbereitetes Setup kann dadurch zwischen A-Kandidat und B-Setup wechseln. Ab der Bestätigung ist die Stufe eingefroren.', ['DAR-Q-REGIME']),
    EDGE.missingData, EDGE.conflictPre, EDGE.conflictPos, EDGE.openBelowStop, EDGE.version,
  ],
  executable: { status: 'EXECUTABLE', gaps: ['Pyramiding (DAR-PYR-01) nicht simuliert'], note: 'Alle Phasen mechanisch definiert.' },
  source_basis: { status: 'SECONDARY_SOURCES_VU_BOX_DEFINITION', note: 'Ausbruch über die Box und nachgezogener Stop sind mehrfach belegt; die konkrete Boxdefinition, Qualitätsstufen und die Regime-Sperre sind VU. Darvas’ eigene Ergebnisse sind umstritten.', fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quellen nur per Suchtreffer bestätigt, Inhalte nicht direkt abgerufen; der Source-Fidelity-Pass steht aus. Originaltreue ist damit nicht geprüft.' },
  historical_validation: { status: 'NOT_VALIDATED', note: 'Kein Backtest hat die Datengates bestanden; keine Aussage über historische Wirksamkeit.' },
}];

minervini.rule_cards = [{
  variant_id: 'MINERVINI_TT_VCP_A', rule_version: MI_V, timeframe: 'daily',
  plan: { confirmRuleId: 'MIN-ENTRY-D1', confirmBasis: 'DAILY_CLOSE', confirmText: 'Tagesschluss über', invalidationRuleId: 'MIN-INV-01', invalidationBasis: 'CLOSE', invalidationText: 'Tagesschluss unter', expiryRuleId: 'MIN-INV-02', exitSummary: 'Stop am Kontraktionstief (≤ 10 %) · Schluss unter der 50-Tage-Linie (VU-Hilfsregel)' },
  required_data: [
    { item: 'Tages-OHLCV ≥ 252 Sitzungen, SMA50/150/200', rules: ['MIN-TREND-01', 'MIN-TREND-02', 'MIN-HIGH-01', 'MIN-LOW-01'] },
    { item: 'RS-Querschnitt', rules: ['MIN-RS-01'] },
    { item: 'Volumen 10/50 Tage', rules: ['MIN-VCP-02'] },
  ],
  sections: [
    sec('candidate', 'Kandidat', 'Trend Template erfüllt, RS im oberen 30 %-Bereich.', ['MIN-TREND-01', 'MIN-TREND-02', 'MIN-HIGH-01', 'MIN-LOW-01', 'MIN-RS-01']),
    sec('prepared', 'Einstieg vorbereitet', 'VCP: mindestens zwei kleiner werdende Kontraktionen, Volumen trocknet aus, Risiko ≤ 10 %. Trigger = Pivot, Invalidation = Kontraktionstief.', ['MIN-VCP-01', 'MIN-VCP-02', 'MIN-RISK-VU', 'LC-SETUP', 'LC-NEAR-TRIGGER']),
    sec('confirmation', 'Trigger und Bestätigung', 'Bestätigt am Tagesschluss über dem Pivot.', ['MIN-ENTRY-D1', 'LC-CONFIRM-CLOSE']),
    DAILY_EXEC,
    sec('initialStop', 'Anfangsstop', 'Kontraktionstief, höchstens 10 % unter der Einstiegseröffnung.', ['MIN-STOP-VU']),
    sec('hold', 'Halten', 'Position läuft bis Stop oder Schluss unter der 50-Tage-Linie. Minervinis eigene Verkaufsregeln (Stärke-Verkäufe, Einstand) sind nicht mechanisch belegt.', ['LC-ACTIVE']),
    sec('warning', 'Warnung', 'Schluss zurück unter dem Pivot.', ['MIN-WARN-01']),
    sec('exit', 'Ausstieg', 'Stop (ruhende Stop-Order-Annahme) oder Schluss unter der 50-Tage-Linie → zur nächsten Eröffnung.', ['MIN-EXIT-VU-01', 'LC-STOP-ORDER-ASSUMPTION']),
    sec('invalid', 'Ungültig vor Einstieg', 'Schluss unter dem Kontraktionstief oder 20 Sitzungen ohne Bestätigung.', ['MIN-INV-01', 'MIN-INV-02', 'LC-SETUP-LOST']),
  ],
  edge_cases: [
    sec('gap', 'Gap über den Trigger', 'Keine Gap-Sperre belegt: Einstieg zum Eröffnungskurs; der Stop bleibt auf 10 % unter dieser Eröffnung gekappt.', ['MIN-STOP-VU', 'LC-MODEL-ENTRY']),
    sec('volume', 'Fehlendes Volumen', 'Ohne Volumen ist MIN-VCP-02 nicht erfüllt — es entsteht kein Setup. Das Ausbruchsvolumen wird angezeigt, nicht gefiltert.', ['MIN-VCP-02']),
    EDGE.missingData, EDGE.conflictPre, EDGE.conflictPos, EDGE.openBelowStop, EDGE.version,
  ],
  executable: { status: 'EXECUTABLE', gaps: [], note: 'Technisch ausführbar — der Ausstieg allerdings nur über eine VU-Hilfsregel.' },
  source_basis: { status: 'EXIT_NOT_SOURCE_BACKED', note: 'Trend Template ist mehrfach belegt; die VCP-Erkennung ist VU. Für den Ausstieg gibt es keine belastbare, mechanisch belegte Originalregel — MIN-EXIT-VU-01 (Schluss unter 50-Tage-Linie) ist eine Hilfsregel.', fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quellen nur per Suchtreffer bestätigt, Inhalte nicht direkt abgerufen; der Source-Fidelity-Pass steht aus. Originaltreue ist damit nicht geprüft.' },
  historical_validation: { status: 'NOT_VALIDATED', note: 'Kein Backtest hat die Datengates bestanden; keine Aussage über historische Wirksamkeit.' },
}];

greenblatt.rule_cards = [{
  variant_id: 'GREENBLATT_US_ORIGINAL', rule_version: GB_V, timeframe: 'annual', inactive: true, activationStatus: 'DATA_COVERAGE_PENDING',
  activationCondition: 'Aktiviert erst, wenn Umlaufvermögen, kurzfristige Verbindlichkeiten und Sachanlagen im kanonischen Fundamentaldatensatz vorliegen (ROC-Nenner) und Point-in-Time-Stände je Stichtag verfügbar sind.',
  plan: null,
  required_data: [
    { item: 'EBIT, Marktkapitalisierung, Finanzschulden, Kasse', rules: ['GB-EY-01'] },
    { item: 'Umlaufvermögen, kurzfristige Verbindlichkeiten, Sachanlagen (fehlen)', rules: ['GB-ROC-01'] },
    { item: 'SIC für Ausschluss Finanzwerte/Versorger', rules: ['GB-UNIV-01'] },
  ],
  sections: [
    sec('candidate', 'Zulässig', 'US-Aktie, keine Finanzwerte oder Versorger, über der gewählten Mindestgröße.', ['GB-UNIV-01', 'GB-SIZE-01']),
    sec('ranking', 'Ranking', 'Rang nach Earnings Yield plus Rang nach Return on Capital; kleinste Summe zuerst.', ['GB-EY-01', 'GB-ROC-01', 'GB-RANK-01']),
    sec('rebalance', 'Rebalancing', '20–30 Titel, gleich gewichtet; große Beträge über 12 Monate gestaffelt. Kein Kurs-Trigger, kein technischer Stop.', ['GB-DIV-01', 'GB-POS-01', 'GB-STAGGER-01']),
    sec('exit', 'Ausstieg', 'Nach etwa einem Jahr ersetzen: Verlierer kurz vor, Gewinner kurz nach einem Jahr. Kein Stop, kein Kursziel — beides wäre nicht Greenblatt.', ['GB-EXIT-01']),
  ],
  edge_cases: [],
  executable: { status: 'NOT_EXECUTABLE', gaps: ['Pflichtfelder für Return on Capital fehlen', 'Point-in-Time-Fundamentaldaten nur für 5 Titel'], note: 'Eigene Ranking-/Rebalancing-Logik, bewusst ohne Stop/Take-Profit. Keine Signale, bis die Daten vorliegen.' },
  source_basis: { status: 'OFFICIAL_SITE_AND_REPLICATIONS', note: 'Portfoliomechanik laut offizieller Website; Kennzahlenformel über unabhängige Replikationen bestätigt.', fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quellen nur per Suchtreffer bestätigt, Inhalte nicht direkt abgerufen; der Source-Fidelity-Pass steht aus. Originaltreue ist damit nicht geprüft.' },
  historical_validation: { status: 'NOT_VALIDATED', note: 'Kein Backtest hat die Datengates bestanden; keine Aussage über historische Wirksamkeit.' },
}];

// Herkunft je Sektion aus den Regeln ableiten.
for (const s of [momentum, weinstein, darvas, minervini, greenblatt, donchian, canslim, piotroski]) {
  const byId = new Map(s.rules.map((r) => [r.rule_id, r]));
  for (const card of s.rule_cards) {
    for (const x of [...card.sections, ...card.edge_cases]) {
      const flags = x.rules.map((id) => byId.get(id)).filter(Boolean).map((r) => r.VU_formalization_flag);
      x.provenance = !flags.length ? 'NONE' : flags.every(Boolean) ? 'VU' : flags.some(Boolean) ? 'MIXED' : 'ORIGINAL';
    }
    // Quellenlage in Zahlen: wie viele der Regeln dieser Karte sind Original, wie viele VU.
    const ids = [...new Set([...card.sections, ...card.edge_cases].flatMap((x) => x.rules))].map((id) => byId.get(id)).filter(Boolean);
    card.source_basis.ruleCounts = { original: ids.filter((r) => !r.VU_formalization_flag).length, vu: ids.filter((r) => r.VU_formalization_flag).length };
  }
}

export const STRATEGIES = [momentum, weinstein, darvas, minervini, donchian, canslim, piotroski, greenblatt, ...advancedList];
// Produktmodus: LIVE (Ein-/Ausstiege werden gerechnet), PARTIAL_CHECK (nur
// pruefbare Kriterien, keine Signale), DATA_PENDING (Regeln beschrieben, Daten
// fehlen), RESEARCH (nur Namenskarte, keine Regeln).
for (const s of STRATEGIES) if (!s.mode) s.mode = s.advanced ? 'RESEARCH' : s.strategy_id === 'GREENBLATT_VALUE' ? 'DATA_PENDING' : 'LIVE';

export const INTERNAL_SOURCES = [
  { source_id: 'SRC-INTERNAL-VU', title: 'Vision-Universe-Formalisierung (Supertrader Registry)', author: 'Vision Universe', publisher_or_site: 'research.visionuniverse.de', url: null, source_type: 'VU_INTERNAL', level: null, access: 'PUBLIC_FULL', retrieved_at: null, url_verification: 'NOT_APPLICABLE', content_retrieved_by_vu: true, used_for: [], claims_supported: 'Messbare Übersetzung qualitativer Regeln. Keine Aussage über die Originalmethode.', evidence_status_ceiling: 'VU_FORMALIZATION', notes: 'Jede Regel mit dieser Quelle trägt VU_formalization_flag = true.' },
];
