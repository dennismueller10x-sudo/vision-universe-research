// Supertrader — Methoden aus Runde 4: Donchian/Turtle (live), CAN SLIM und
// Piotroski (Teilpruefung). Eigene Datei, damit die bestehende Registry nicht
// umgeschrieben wird; registry.mjs bindet sie ein.
//
// Kennzeichnung: "mode" trennt LIVE (Ein-/Ausstiege werden gerechnet und
// protokolliert) von PARTIAL_CHECK (nur pruefbare Kriterien, keine Signale).

export function buildR4({ f, NONE, NV, rule, DNA_FIELDS }) {
  const fill = (o) => { for (const k of DNA_FIELDS) if (!(k in o)) o[k] = NV('Nicht Bestandteil der belegten Methode bzw. nicht spezifiziert.'); return o; };

  /* ============================ DONCHIAN / TURTLE ============================ */
  const DT_V = '1.1.0';
  const donchian = fill({
    strategy_id: 'DONCHIAN_TURTLE', strategy_version: DT_V, slug: 'donchian-turtle', mode: 'LIVE',
    // Turtle-Regeln kaufen JEDEN Ausbruch ueber das 20-Tage-Hoch. Was vor dem
    // Ausbruch steht, ist deshalb eine breite Beobachtungsliste (heute ~8 % des
    // Universums), kein selektiv vorbereiteter Einstieg - so wird es gezeigt
    // und gezaehlt (getrennt von „vorbereitet“).
    pending_semantics: 'WATCHLIST', watchlist_label: 'Beobachtung · nahe 20-Tage-Hoch',
    strategy_name: 'Donchian / Turtle Trend', world_name: 'Donchian Turtle', tagline: 'Kaufen, was ausbricht — verkaufen, wenn der Trend bricht.',
    strategy_family: 'Trendfolge (Kanal-Ausbruch)', originator: 'Richard Donchian / Richard Dennis (Turtle Traders)',
    theme: { accent: '#14b8a6', accent2: '#a7f3d0', name: 'Petrol / Mint' },
    product_status: ['RESEARCHED', 'LIVE_MONITORING', 'VU_FORMALIZATION', 'DATA_COVERAGE_PENDING'],
    research_status: f('Die Turtle-Regeln wurden 2003 vollständig veröffentlicht (Curtis Faith). Einstieg, Stop und Ausstieg sind dort mechanisch beschrieben.', 'PRIMARY_EXPLICIT'),
    evidence_status: f('Regeln PRIMARY_EXPLICIT; Übertragung auf Aktien und Tagesschluss-Bestätigung VU', 'PRIMARY_EXPLICIT'),
    automation_level: 'FULLY_QUANTIFIABLE',
    source_fidelity: f('Hoch für Kanal, Stop und Ausstieg. Abweichung: Aktien statt Futures, Schluss-Bestätigung statt Intraday-Stop-Order, kein Pyramiding und keine Unit-Größen.', 'VU_FORMALIZATION'),
    story: 'Die Turtle-Trader kauften nicht, weil eine Aktie „günstig“ war, sondern weil sie ein neues 20-Tage-Hoch erreichte. Viele Ausbrüche scheitern, die Verluste bleiben klein. Wenige große Trends tragen das Ergebnis. Supertrader überträgt dieses System auf liquide US-Aktien.',
    how_it_thinks: ['Ist die Aktie liquide und beweglich genug (≥ 10 USD, ≥ 20 Mio. USD Tagesumsatz, ≥ 1 % Tagesspanne)?', 'Steht der Kurs nahe am höchsten Hoch der letzten 20 Tage?', 'Schließt der Tag darüber, ist der Einstieg bestätigt — gekauft wird zur nächsten Eröffnung.', 'Stop 2 × ATR unter dem Einstieg; Ausstieg, sobald der Kurs unter dem 10-Tage-Tief schließt.'],
    universe: f('Liquide US-Aktien (VU); Original: Futures', 'VU_EXTENSION', ['DON-LIQ-VU']),
    market: f('USA', 'VU_EXTENSION'),
    liquidity_rules: f('Kurs ≥ 10 USD, Tagesumsatz ≥ 20 Mio. USD, Tagesspanne ≥ 1 %, Kanalbreite ≥ 2 %', 'VU_FORMALIZATION', ['DON-LIQ-VU']),
    market_regime: NONE('Kein Marktfilter im Original.'),
    momentum_filters: NONE('Kein Momentum-Ranking — jeder Ausbruch zählt.'),
    trend_filters: f('Der Ausbruch selbst ist der Trendfilter', 'PRIMARY_EXPLICIT', ['DON-ENTRY-01']),
    setup_definition: f('Kurs höchstens 3 % unter dem 20-Tage-Hoch (VU-Definition von „vorbereitet“)', 'VU_FORMALIZATION', ['DON-NEAR-VU']),
    entry_trigger: f('Original: Ausbruch über das 20-Tage-Hoch (Stop-Order). Live: Tagesschluss darüber, Einstieg zur nächsten Eröffnung.', 'PRIMARY_EXPLICIT', ['DON-ENTRY-01', 'DON-ENTRY-D1']),
    invalidation: f('Schluss unter dem 10-Tage-Tief oder 10 Sitzungen ohne Ausbruch', 'VU_FORMALIZATION', ['DON-INV-01', 'DON-INV-02']),
    initial_stop: f('2N unter dem Einstieg (N = 20-Tage-ATR)', 'PRIMARY_EXPLICIT', ['DON-STOP-01']),
    position_sizing: f('Original: 1 Unit = 1 % des Kontos je N; nicht simuliert', 'PRIMARY_EXPLICIT'),
    scaling_in: f('Original: bis 4 Units, je ½N; nicht simuliert', 'PRIMARY_EXPLICIT'),
    regular_exit: f('Bruch des 10-Tage-Tiefs (System 1)', 'PRIMARY_EXPLICIT', ['DON-EXIT-01']),
    trailing_stop: f('Der 10-Tage-Kanal wirkt als nachgezogener Ausstieg', 'PRIMARY_EXPLICIT', ['DON-EXIT-01']),
    gap_policy: f('Kein Gap-Ausschluss; Einstieg zum Eröffnungskurs, Stop-Ausführung bei Gap zur Eröffnung', 'VU_FORMALIZATION'),
    required_data: f('Tages-OHLCV mit Hoch/Tief, 20-Tage-ATR, Liquidität', 'PRIMARY_EXPLICIT'),
    data_coverage: { measured: true }, data_freshness: { measured: true },
    known_failure_modes: f('Viele Fehlausbrüche in Seitwärtsmärkten; Ergebnis hängt an wenigen großen Trends', 'PRIMARY_INFERRED'),
    discretionary_elements: NONE('Vollständig mechanisch.'),
    prohibited_interpretations: ['Die Turtle-Ergebnisse der 1980er (Futures) sind kein Beleg für diese Aktien-Übertragung', 'Ein bestätigter Ausbruch ist keine Kaufempfehlung'],
    lifecycle_mapping: { DISCOVERED: '—', WATCH: '3–6 % unter dem 20-Tage-Hoch (Beobachtung)', SETUP: '— (direkt „nahe Trigger“)', ENTRY_READY: '≤ 3 % unter dem 20-Tage-Hoch', TRIGGERED: 'Schluss über dem 20-Tage-Hoch', ACTIVE: 'Trend läuft', WARNING: 'unter Einstand', EXIT: 'Schluss unter dem 10-Tage-Tief / Stop', CLOSED: 'geschlossen', INVALIDATED: 'Schluss unter dem 10-Tage-Tief vor dem Einstieg' },
    variants: [
      { variant_id: 'DONCHIAN_TURTLE_S1_DAILY', label: 'System 1: 20/10 Tage, Stop 2N, Tagesschluss', active: true, status: 'LIVE_MONITORING', vu_formalization: true },
      { variant_id: 'DONCHIAN_TURTLE_S2_DAILY', label: 'System 2: 55/20 Tage', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
    ],
    baselines: [{ id: 'BL-EW-UNIVERSE', label: 'Gleichgewichtetes Universum (gleiches Datenuniversum)' }, { id: 'BL-SPY', label: 'SPY Kursindex' }],
    sources: ['SRC-BL-TURTLE', 'SRC-BL-DONCHIAN'],
    track_record_note: 'Die Turtle-Experimente (1983–1988) betrafen Futures und sind öffentlich nur anekdotisch belegt. Ein eigener Aktien-Pilot auf Wochenbasis liegt im Backtest Lab — explorativ, nicht validiert.',
    rules: [
      rule(DT_V, 'DON-ENTRY-01', 'Original: Kauf beim Ausbruch über das Hoch der letzten 20 Tage (System 1).', 'high_intraday > max(high[t-20..t-1]) (reference only)', { bars: 20 }, ['SRC-BL-TURTLE'], 'PRIMARY_EXPLICIT', false),
      rule(DT_V, 'DON-ENTRY-D1', 'Live: Einstieg bestätigt, wenn der Tagesschluss über dem 20-Tage-Hoch liegt; Modelleinstieg zur nächsten Eröffnung.', 'close(t) > max(high[t-20..t-1]) -> CONFIRMED; entry = open(t+1)', { bars: 20 }, ['SRC-BL-TURTLE', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(DT_V, 'DON-STOP-01', 'Stop 2N unter dem Einstieg; N ist die durchschnittliche Tagesspanne der letzten 20 Tage (ATR).', 'stop = entry - 2 * ATR20', { n: 20, multiple: 2 }, ['SRC-BL-TURTLE'], 'PRIMARY_EXPLICIT', false),
      rule(DT_V, 'DON-EXIT-01', 'Ausstieg, wenn der Kurs unter das Tief der letzten 10 Tage fällt (live: Tagesschluss, Ausführung zur nächsten Eröffnung).', 'close(t) < min(low[t-10..t-1]) -> sell open(t+1)', { bars: 10 }, ['SRC-BL-TURTLE'], 'PRIMARY_EXPLICIT', false),
      rule(DT_V, 'DON-LIQ-VU', 'Nur liquide, bewegliche Aktien: Kurs ab 10 USD, mindestens 20 Mio. USD Tagesumsatz, mindestens 1 % durchschnittliche Tagesspanne und ein Kanal von mindestens 2 % Breite (schließt festhängende Kurse aus, z. B. während eines Übernahmeangebots).', 'close >= 10 && sma20(close*volume) >= 2e7 && ADR20 >= 0.01 && max(high,20)/min(low,10) - 1 >= 0.02', { minPrice: 10, minDollarVolume: 2e7, minAdr: 0.01, minChannelWidth: 0.02 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(DT_V, 'DON-NEAR-VU', 'Beobachtungsliste, wenn der Kurs höchstens 3 % unter dem 20-Tage-Hoch steht (protokolliert); 3–6 % nur Momentaufnahme.', 'max(high[t-19..t]) / close(t) - 1 <= 0.03', { ready: 0.03, watch: 0.06 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(DT_V, 'DON-INV-01', 'Schluss unter dem 10-Tage-Tief vor dem Einstieg: Setup beendet.', 'close < min(low[t-9..t])', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(DT_V, 'DON-INV-02', 'Setup, das 10 Sitzungen nicht ausbricht, verfällt.', 'pendingSessions > 10', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(DT_V, 'DON-WARN-01', 'Warnung, wenn die Position unter Einstand schließt.', 'close < entry', {}, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    ],
  });

  /* ================================= CAN SLIM ================================= */
  const CS_V = '0.9.0';
  const canslim = fill({
    strategy_id: 'CANSLIM', strategy_version: CS_V, slug: 'can-slim', mode: 'PARTIAL_CHECK',
    strategy_name: 'CAN SLIM (Teilprüfung)', world_name: 'CAN SLIM', tagline: 'Wachstum, Führung, Marktrichtung — geprüft, soweit die Daten reichen.',
    strategy_family: 'Growth-Momentum', originator: 'William J. O’Neil',
    theme: { accent: '#f59e0b', accent2: '#fde68a', name: 'Bernstein' },
    product_status: ['SOURCE_PARTIAL', 'DATA_COVERAGE_PENDING', 'VU_FORMALIZATION'],
    research_status: f('Die sieben Kriterien sind breit beschrieben; das Originalbuch wurde nicht inhaltlich geprüft.', 'SECONDARY_ONLY'),
    evidence_status: f('Kriterien und Schwellen aus Sekundärquellen; Ersatzgrößen VU', 'SECONDARY_ONLY'),
    automation_level: 'HYBRID',
    source_fidelity: f('Teilweise: 5 von 7 Kriterien prüfbar, zwei davon nur mit Ersatzgrößen; „I“ fehlt ganz.', 'VU_FORMALIZATION'),
    story: 'O’Neil suchte Aktien mit stark wachsenden Gewinnen, die bereits Marktführer sind und in einem steigenden Gesamtmarkt neue Hochs erreichen. Supertrader prüft davon, was die öffentlichen Daten tragen — und zeigt offen, was fehlt.',
    how_it_thinks: ['C: Ist der Gewinn im letzten Quartal um mindestens 25 % gestiegen?', 'A: Ist der Jahresgewinn drei Jahre in Folge gewachsen, um mindestens 25 % pro Jahr?', 'N: Steht der Kurs nahe einem neuen Hoch?', 'L: Gehört die Aktie zu den stärksten 20 %?', 'M: Steigt der Gesamtmarkt?', 'S und I: angezeigt bzw. nicht prüfbar.'],
    universe: f('US-Aktien ab 5 USD und 5 Mio. USD Tagesumsatz (VU)', 'VU_FORMALIZATION'),
    market: f('USA', 'SECONDARY_ONLY'),
    growth_filters: f('C und A über Nettogewinn (VU-Ersatz für EPS)', 'VU_FORMALIZATION', ['CS-C-01', 'CS-A-01']),
    relative_strength_filters: f('VU-RS-Perzentil ≥ 80 (kein IBD-RS)', 'VU_FORMALIZATION', ['CS-L-01']),
    market_regime: f('M über SPY-Trend (VU-Ersatz für Follow-Through-Days)', 'VU_FORMALIZATION', ['CS-M-VU']),
    entry_trigger: f('Original: Kauf am Pivot eines Basisausbruchs mit deutlich erhöhtem Volumen — in der Teilprüfung NICHT gerechnet', 'SECONDARY_ONLY', ['CS-BUY-REF']),
    initial_stop: f('Original: Verluste bei 7–8 % begrenzen — in der Teilprüfung NICHT gerechnet', 'SECONDARY_ONLY', ['CS-SELL-REF']),
    required_data: f('Quartals- und Jahresgewinne zum Stichtag, Fondsbestände je Aktie über mehrere Quartale, Index-Volumen, Kurshistorie', 'SECONDARY_ONLY'),
    data_coverage: { measured: true }, data_freshness: { measured: true },
    known_failure_modes: f('Teiltreffer ohne Institutionen- und Basisprüfung; Gewinne sind zuletzt berichtete statt damals bekannte Werte', 'VU_FORMALIZATION'),
    discretionary_elements: f('Basisqualität (Cup with Handle), neue Produkte/Management', 'SECONDARY_ONLY'),
    prohibited_interpretations: ['Ein Teiltreffer ist kein CAN-SLIM-Signal', 'VU-RS ist kein IBD-RS-Rating', 'Ohne „I“ und ohne Basisausbruch keine Kauf- oder Verkaufsaussage'],
    lifecycle_mapping: {},
    variants: [
      { variant_id: 'CANSLIM_PARTIAL', label: 'Teilprüfung C · A · N · L · M (S angezeigt, I fehlt)', active: true, status: 'DATA_COVERAGE_PENDING', vu_formalization: true },
      { variant_id: 'CANSLIM_FULL', label: 'Vollständiges CAN SLIM mit Basisausbruch und Fondsbeständen', active: false, status: 'DATA_COVERAGE_PENDING', vu_formalization: false },
    ],
    baselines: [{ id: 'BL-MOMENTUM-ONLY', label: 'Nur relative Stärke (L)' }],
    sources: ['SRC-CS-ONEIL-BOOK', 'SRC-BL-CANSLIM', 'SRC-BL-CANSLIM-IBD'],
    track_record_note: 'O’Neils eigene Studien zu Gewinneraktien sind keine unabhängige Prüfung. Für diese Teilprüfung gibt es keinen Backtest.',
    rules: [
      rule(CS_V, 'CS-C-01', 'C: Gewinn des letzten Quartals mindestens 25 % über dem Vorjahresquartal, beide positiv. Gerechnet mit Nettogewinn, weil die EPS-Historie split-inkonsistent ist.', 'NI(q) / NI(q-4) - 1 >= 0.25 && NI(q-4) > 0', { minGrowth: 0.25 }, ['SRC-BL-CANSLIM', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(CS_V, 'CS-A-01', 'A: Jahresgewinn drei Jahre in Folge gestiegen, mindestens 25 % pro Jahr (Nettogewinn statt EPS).', 'NI(y) > NI(y-1) > NI(y-2) > NI(y-3) > 0 && CAGR3 >= 0.25', { minCagr: 0.25, years: 3 }, ['SRC-BL-CANSLIM', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(CS_V, 'CS-N-VU', 'N: nur der Kursteil — höchstens 15 % unter dem 52-Wochen-Hoch. Neue Produkte oder neues Management sind nicht maschinell prüfbar.', 'close >= 0.85 * high252', { maxBelowHigh: 0.15 }, ['SRC-BL-CANSLIM', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(CS_V, 'CS-S-INFO', 'S: Aktienzahl und Volumenverhältnis werden angezeigt, nicht bewertet (keine belegte Schwelle).', 'display(sharesOutstanding, vol20/vol50)', {}, ['SRC-BL-CANSLIM', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(CS_V, 'CS-L-01', 'L: relative Stärke im oberen 20-%-Bereich (VU-RS, kein IBD-Rating).', 'rsPercentile >= 80', { percentile: 80 }, ['SRC-BL-CANSLIM', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(CS_V, 'CS-I-NA', 'I: institutionelle Nachfrage ist nicht prüfbar — es gibt keine Fondsbestände je Aktie über mehrere Quartale.', 'NOT_AVAILABLE', {}, ['SRC-BL-CANSLIM'], 'SECONDARY_ONLY', false),
      rule(CS_V, 'CS-M-VU', 'M: Gesamtmarkt steigt — SPY über steigender 200-Tage-Linie und über der 50-Tage-Linie (Ersatz für Follow-Through-Days).', 'SPY > SMA50 && SPY > SMA200 && SMA200 rising(21d)', {}, ['SRC-BL-CANSLIM', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(CS_V, 'CS-BUY-REF', 'Original-Kaufpunkt: Ausbruch aus einer korrekten Basis am Pivot mit deutlich erhöhtem Volumen. Wird nicht gerechnet.', 'reference only', {}, ['SRC-BL-CANSLIM', 'SRC-CS-ONEIL-BOOK'], 'SECONDARY_ONLY', false),
      rule(CS_V, 'CS-SELL-REF', 'Original-Verlustregel: Verluste bei 7–8 % unter dem Kaufkurs begrenzen. Wird nicht gerechnet.', 'reference only', {}, ['SRC-BL-CANSLIM', 'SRC-CS-ONEIL-BOOK'], 'SECONDARY_ONLY', false),
    ],
  });

  /* ================================ PIOTROSKI ================================ */
  const PI_V = '0.9.0';
  const piotroski = fill({
    strategy_id: 'PIOTROSKI_F', strategy_version: PI_V, slug: 'piotroski-f-score', mode: 'PARTIAL_CHECK',
    strategy_name: 'Piotroski F-Score (Teilprüfung)', world_name: 'Piotroski F-Score', tagline: 'Günstige Aktien — aber nur die mit gesunden Bilanzen.',
    strategy_family: 'Value-Quality', originator: 'Joseph D. Piotroski',
    theme: { accent: '#22c55e', accent2: '#bbf7d0', name: 'Grün' },
    product_status: ['RESEARCHED', 'DATA_COVERAGE_PENDING', 'VU_FORMALIZATION'],
    research_status: f('Primärquelle (Fachaufsatz 2000) mit neun klar definierten Signalen.', 'PRIMARY_EXPLICIT'),
    evidence_status: f('Signale PRIMARY_EXPLICIT; ein Signal fehlt, zwei mit Ersatzgrößen', 'PRIMARY_EXPLICIT'),
    automation_level: 'FULLY_QUANTIFIABLE',
    source_fidelity: f('8 von 9 Signalen prüfbar; Verschuldung und Aktienausgabe mit VU-Ersatz.', 'VU_FORMALIZATION'),
    story: 'Piotroski zeigte, dass sich unter billigen Aktien die gesunden von den kranken trennen lassen: mit neun einfachen Ja/Nein-Fragen an den Jahresabschluss. Supertrader prüft acht davon für die günstigsten 20 % des Marktes.',
    how_it_thinks: ['Gehört die Aktie zu den günstigsten 20 % nach Buchwert zu Börsenwert?', 'Ist sie profitabel und erwirtschaftet Cash?', 'Werden Rentabilität, Marge und Kapitalumschlag besser?', 'Sinkt die Verschuldung, ohne neue Aktien auszugeben?'],
    universe: f('US-Aktien, oberes Quintil Buch-/Marktwert', 'PRIMARY_EXPLICIT', ['PIO-BM-01']),
    market: f('USA', 'PRIMARY_EXPLICIT'),
    fundamental_filters: f('Neun Bilanzsignale, davon acht prüfbar', 'PRIMARY_EXPLICIT', ['PIO-ROA-01', 'PIO-CFO-01', 'PIO-DROA-01', 'PIO-ACC-01', 'PIO-LEV-VU', 'PIO-LIQ-NA', 'PIO-EQ-VU', 'PIO-GM-01', 'PIO-TURN-01']),
    valuation_filters: f('Oberes Quintil Buch-/Marktwert', 'PRIMARY_EXPLICIT', ['PIO-BM-01']),
    entry_trigger: f('Original: Portfolio einmal jährlich nach Veröffentlichung der Abschlüsse; in der Teilprüfung keine Signale', 'PRIMARY_EXPLICIT'),
    regular_exit: f('Original: Haltedauer ein Jahr', 'PRIMARY_EXPLICIT'),
    required_data: f('Jahresabschlüsse zum Stichtag inkl. Umlaufvermögen, Buchwert, Börsenwert', 'PRIMARY_EXPLICIT'),
    data_coverage: { measured: true }, data_freshness: { measured: true },
    known_failure_modes: f('Restatements und verspätete Abschlüsse; kleine, illiquide Value-Titel', 'PRIMARY_INFERRED'),
    discretionary_elements: NONE('Vollständig mechanisch.'),
    prohibited_interpretations: ['Ein Teil-Score ist kein F-Score', 'Die Renditen der Studie (1976–1996) sind kein Beleg für heute'],
    lifecycle_mapping: {},
    variants: [
      { variant_id: 'PIOTROSKI_PARTIAL', label: 'Teil-Score 0–8 (Liquiditätssignal fehlt), oberes B/M-Quintil', active: true, status: 'DATA_COVERAGE_PENDING', vu_formalization: true },
      { variant_id: 'PIOTROSKI_F_FULL', label: 'Vollständiger F-Score 0–9 mit Jahresportfolio', active: false, status: 'DATA_COVERAGE_PENDING', vu_formalization: false },
    ],
    baselines: [{ id: 'BL-VALUE-ONLY', label: 'Nur Buch-/Marktwert (Value-only)' }],
    sources: ['SRC-BL-PIOTROSKI'],
    track_record_note: 'Piotroskis Studie (1976–1996) fand deutliche Renditeunterschiede innerhalb günstiger Aktien. Das ist ein Forschungsergebnis, kein Test dieser Teilprüfung.',
    rules: [
      rule(PI_V, 'PIO-BM-01', 'Nur Aktien im oberen Fünftel nach Buchwert zu Börsenwert.', 'equity / (shares * close) >= quantile(0.8)', { quantile: 0.8 }, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-ROA-01', 'Gewinn bezogen auf die Bilanzsumme des Vorjahres ist positiv.', 'NI(y) / TA(y-1) > 0', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-CFO-01', 'Operativer Cashflow ist positiv.', 'CFO(y) > 0', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-DROA-01', 'Gesamtkapitalrendite ist gegenüber dem Vorjahr gestiegen.', 'ROA(y) > ROA(y-1)', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-ACC-01', 'Cashflow übersteigt den Gewinn (Gewinnqualität).', 'CFO(y)/TA(y-1) > ROA(y)', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-LEV-VU', 'Verschuldung gesunken: langfristige Schulden / Bilanzsumme (Original: durchschnittliche Bilanzsumme).', 'LTD(y)/TA(y) <= LTD(y-1)/TA(y-1)', {}, ['SRC-BL-PIOTROSKI', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(PI_V, 'PIO-LIQ-NA', 'Umlaufquote gestiegen — nicht prüfbar, Umlaufvermögen und kurzfristige Verbindlichkeiten fehlen.', 'NOT_AVAILABLE', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-EQ-VU', 'Keine neuen Aktien ausgegeben; Sprünge der Aktienzahl ≥ 1,8× oder ≤ 0,55× gelten als Split und sind nicht prüfbar.', 'shares(y) <= shares(y-1)', {}, ['SRC-BL-PIOTROSKI', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(PI_V, 'PIO-GM-01', 'Bruttomarge ist gegenüber dem Vorjahr gestiegen.', 'GP/REV(y) > GP/REV(y-1)', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-TURN-01', 'Kapitalumschlag (Umsatz / Bilanzsumme Vorjahr) ist gestiegen.', 'REV(y)/TA(y-1) > REV(y-1)/TA(y-2)', {}, ['SRC-BL-PIOTROSKI'], 'PRIMARY_EXPLICIT', false),
      rule(PI_V, 'PIO-CAND-VU', 'Kandidat der Teilprüfung: alle acht prüfbaren Signale berechenbar und mindestens sieben erfüllt.', 'checked == 8 && partialScore >= 7', { minPartialScore: 7 }, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
    ],
  });

  // Regelkarten
  const sec = (id, title, text, rules) => ({ id, title, text, rules });
  donchian.rule_cards = [{
    variant_id: 'DONCHIAN_TURTLE_S1_DAILY', rule_version: DT_V, timeframe: 'daily',
    plan: { confirmRuleId: 'DON-ENTRY-D1', confirmBasis: 'DAILY_CLOSE', confirmText: 'Tagesschluss über', invalidationRuleId: 'DON-INV-01', invalidationBasis: 'CLOSE', invalidationText: 'Tagesschluss unter', expiryRuleId: 'DON-INV-02', exitSummary: 'Stop 2N unter dem Einstieg · Ausstieg bei Schluss unter dem 10-Tage-Tief' },
    required_data: [{ item: 'Tages-OHLCV (Hoch/Tief), 20-Tage-ATR, Tagesumsatz', rules: ['DON-ENTRY-D1', 'DON-STOP-01', 'DON-LIQ-VU'] }],
    sections: [
      sec('candidate', 'Kandidat', 'Liquide Aktie, Kurs 3–6 % unter dem 20-Tage-Hoch.', ['DON-LIQ-VU', 'DON-NEAR-VU']),
      sec('prepared', 'Einstieg vorbereitet', 'Kurs höchstens 3 % unter dem 20-Tage-Hoch. Trigger = 20-Tage-Hoch, Invalidation = 10-Tage-Tief.', ['DON-NEAR-VU', 'LC-SETUP', 'LC-NEAR-TRIGGER']),
      sec('confirmation', 'Trigger und Bestätigung', 'Bestätigt am Tagesschluss über dem 20-Tage-Hoch.', ['DON-ENTRY-D1', 'DON-ENTRY-01', 'LC-CONFIRM-CLOSE']),
      sec('execution', 'Ausführung', 'Modelleinstieg zur Eröffnung des nächsten Handelstags, nie zum Triggerkurs.', ['LC-MODEL-ENTRY']),
      sec('initialStop', 'Anfangsstop', '2N unter der Einstiegseröffnung (N = 20-Tage-ATR).', ['DON-STOP-01']),
      sec('hold', 'Halten', 'Position läuft, solange kein Stop und kein Schluss unter dem 10-Tage-Tief.', ['LC-ACTIVE']),
      sec('warning', 'Warnung', 'Schluss unter Einstand.', ['DON-WARN-01']),
      sec('exit', 'Ausstieg', 'Schluss unter dem 10-Tage-Tief → zur nächsten Eröffnung; Stop als ruhende Stop-Order-Annahme.', ['DON-EXIT-01', 'LC-STOP-ORDER-ASSUMPTION']),
      sec('invalid', 'Ungültig vor Einstieg', 'Schluss unter dem 10-Tage-Tief oder 10 Sitzungen ohne Ausbruch.', ['DON-INV-01', 'DON-INV-02', 'LC-SETUP-LOST']),
    ],
    edge_cases: [
      sec('gap', 'Gap über den Trigger', 'Keine Gap-Sperre: Einstieg zum Eröffnungskurs, der Stop bezieht sich auf diese Eröffnung.', ['DON-STOP-01', 'LC-MODEL-ENTRY']),
      sec('volume', 'Fehlendes Volumen', 'Volumen ist nur für die Liquiditätsgrenze nötig; fehlt es, entsteht kein Setup.', ['DON-LIQ-VU']),
      sec('missingData', 'Fehlende Daten', 'Keine Entscheidung ohne Balken; Orders zur nächsten verfügbaren Eröffnung.', ['LC-DATA-GAP']),
      sec('conflictPre', 'Konflikt vor dem Einstieg', 'Invalidation vor Bestätigung.', ['LC-CONFLICT-01']),
      sec('conflictPos', 'Konflikt in der Position', 'Stop vor Ausstiegsregel vor Warnung.', ['LC-CONFLICT-02']),
      sec('version', 'Regelversion ändert sich', 'Wartende Setups werden protokolliert beendet, nicht umgedeutet.', ['LC-VERSION-RETIRED']),
    ],
    executable: { status: 'EXECUTABLE', gaps: ['Unit-Größen und Pyramiding nicht simuliert', 'System-1-Filter nicht simuliert'], note: 'Alle Phasen mechanisch definiert.' },
    source_basis: { status: 'PRIMARY_RULES_VU_TRANSFER', note: 'Kanal, Stop und Ausstieg folgen den 2003 veröffentlichten Turtle-Regeln; Aktien statt Futures, Schluss-Bestätigung und Liquiditätsgrenze sind VU.', fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quelle per Suchtreffer bestätigt, Inhalt nicht direkt abgerufen.' },
    historical_validation: { status: 'NOT_VALIDATED', note: 'Ein explorativer Wochen-Pilot liegt vor (Backtest Lab); er ist wegen Survivorship Bias kein Nachweis.' },
  }];
  const critCard = (s, items, extraNote) => [{
    variant_id: s.variants[0].variant_id, rule_version: s.strategy_version, timeframe: 'snapshot', partial: true,
    plan: null, required_data: items.required,
    sections: items.sections, edge_cases: [],
    executable: { status: 'PARTIAL_CHECK', gaps: items.gaps, note: extraNote },
    source_basis: { status: items.sourceStatus, note: items.sourceNote, fidelityReview: 'NOT_PERFORMED', fidelityNote: 'Quellen nur bibliografisch bzw. per Suchtreffer bestätigt; Originaltreue nicht geprüft.' },
    historical_validation: { status: 'NOT_VALIDATED', note: 'Kein Backtest: Gewinne und Bilanzen liegen nur als zuletzt berichtete Werte vor, nicht zum damaligen Stichtag.' },
  }];
  canslim.rule_cards = critCard(canslim, {
    required: [
      { item: 'Quartals- und Jahresgewinne (SEC, zuletzt berichtet)', rules: ['CS-C-01', 'CS-A-01'] },
      { item: 'Tageskurse: 52-Wochen-Hoch, relative Stärke', rules: ['CS-N-VU', 'CS-L-01'] },
      { item: 'SPY-Tagesschlüsse', rules: ['CS-M-VU'] },
      { item: 'Fondsbestände je Aktie über mehrere Quartale (fehlt)', rules: ['CS-I-NA'] },
    ],
    sections: [
      sec('C', 'C — Quartalsgewinn', 'Gewinn ≥ +25 % ggü. Vorjahresquartal (Nettogewinn statt EPS).', ['CS-C-01']),
      sec('A', 'A — Jahresgewinne', 'Drei Jahre in Folge gestiegen, ≥ 25 % p. a.', ['CS-A-01']),
      sec('N', 'N — Neues Hoch', 'Nur Kursteil: ≤ 15 % unter dem 52-Wochen-Hoch.', ['CS-N-VU']),
      sec('S', 'S — Angebot/Nachfrage', 'Angezeigt, nicht bewertet.', ['CS-S-INFO']),
      sec('L', 'L — Marktführer', 'Relative Stärke ≥ 80. Perzentil (VU-RS).', ['CS-L-01']),
      sec('I', 'I — Institutionen', 'Nicht prüfbar.', ['CS-I-NA']),
      sec('M', 'M — Marktrichtung', 'SPY über steigender 200-Tage-Linie und über der 50-Tage-Linie.', ['CS-M-VU']),
      sec('buy', 'Kauf- und Verlustregel (Original)', 'Pivot-Ausbruch mit erhöhtem Volumen; Verluste bei 7–8 % begrenzen. Wird in der Teilprüfung nicht gerechnet.', ['CS-BUY-REF', 'CS-SELL-REF']),
    ],
    gaps: ['I (Institutionen) fehlt', 'Basisausbruch nicht gerechnet → keine Ein-/Ausstiege', 'C und A über Nettogewinn statt EPS'],
    sourceStatus: 'SECONDARY_SOURCES_VU_PROXIES', sourceNote: 'Kriterien aus Sekundärquellen; Originalbuch nur bibliografisch erfasst. C, A, N, L, M mit VU-Ersatzgrößen.',
  }, 'Prüft 5 von 7 Kriterien; ein Titel, der alle fünf erfüllt, ist ein Teiltreffer — kein CAN-SLIM-Signal.');
  piotroski.rule_cards = critCard(piotroski, {
    required: [
      { item: 'Jahresabschlüsse (SEC, zuletzt berichtet): Gewinn, Cashflow, Bilanzsumme, Schulden, Aktienzahl, Bruttogewinn, Umsatz, Eigenkapital', rules: ['PIO-ROA-01', 'PIO-CFO-01', 'PIO-LEV-VU', 'PIO-EQ-VU', 'PIO-GM-01', 'PIO-TURN-01', 'PIO-BM-01'] },
      { item: 'Umlaufvermögen und kurzfristige Verbindlichkeiten (fehlen)', rules: ['PIO-LIQ-NA'] },
    ],
    sections: [
      sec('value', 'Günstige Aktien', 'Oberes Fünftel nach Buch-/Marktwert.', ['PIO-BM-01']),
      sec('profit', 'Rentabilität', 'Gewinn positiv, Cashflow positiv, Rendite steigt, Cashflow > Gewinn.', ['PIO-ROA-01', 'PIO-CFO-01', 'PIO-DROA-01', 'PIO-ACC-01']),
      sec('finance', 'Finanzierung', 'Verschuldung sinkt, keine neuen Aktien; Liquidität nicht prüfbar.', ['PIO-LEV-VU', 'PIO-EQ-VU', 'PIO-LIQ-NA']),
      sec('ops', 'Effizienz', 'Bruttomarge und Kapitalumschlag steigen.', ['PIO-GM-01', 'PIO-TURN-01']),
      sec('candidate', 'Kandidat der Teilprüfung', 'Alle 8 prüfbaren Signale berechenbar, mindestens 7 erfüllt.', ['PIO-CAND-VU']),
    ],
    gaps: ['Liquiditätssignal fehlt', 'keine Erstmeldungen (Restatements)', 'kein Jahresportfolio → keine Ein-/Ausstiege'],
    sourceStatus: 'PRIMARY_SIGNALS_PARTIAL_DATA', sourceNote: 'Signale aus der Primärquelle (Fachaufsatz 2000); zwei Signale mit VU-Ersatzgrößen, eines fehlt.',
  }, 'Prüft 8 von 9 Signalen; ausgewiesen wird ein Teil-Score 0–8, nie ein F-Score.');
  return { donchian, canslim, piotroski };
}
