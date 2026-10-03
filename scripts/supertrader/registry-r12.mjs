// Supertrader — Runde 12 (PREREGISTRATION-R12): VU Trendfolge 52W als eigene Vision-Universe-Methode.
// Gestützt auf öffentlich beschriebene Regeln einer TraderFox-Variante („NEO-DARVAS mit Pivotal-Points“);
// weder Darvas-Original noch TraderFox-System. Ersatzannahmen sind als VU gekennzeichnet.
// mode 'MODEL': Modelldepot mit monatlicher Umschichtung (eigenes Ledger, data/trend52.json).

export const TR52_V = '1.0.0';

export function buildR12({ f, NONE, NV, rule, DNA_FIELDS }) {
  const fill = (o) => { for (const k of DNA_FIELDS) if (!(k in o)) o[k] = NV('Nicht Bestandteil der beschriebenen Regeln bzw. nicht spezifiziert.'); return o; };
  const V = TR52_V;
  const TF = ['SRC-TF-NEO-PP'], TF18 = ['SRC-TF-NEO-2018'];
  const sec = (id, title, text, rules) => ({ id, title, text, rules });
  const trend = fill({
    strategy_id: 'VU_TREND_52W', strategy_version: V, slug: 'vu-trendfolge-52w', mode: 'MODEL',
    strategy_name: 'VU Trendfolge 52W', world_name: 'VU Trendfolge 52W', tagline: 'Die stärksten Aktien halten, bis der Trend nachlässt — monatlich geprüft.',
    strategy_family: 'Trendfolge (Momentum-Depot)', originator: 'Vision Universe · nach öffentlich beschriebenen Regeln einer TraderFox-Variante',
    theme: { accent: '#6366f1', accent2: '#c7d2fe', name: 'Indigo' },
    product_status: ['VU_FORMALIZATION', 'LIVE_MONITORING', 'HYBRID_MODEL'],
    research_status: f('Regeln aus öffentlich zugänglichen TraderFox-Beiträgen (2018/2019) im Volltext gelesen; die Rangfolge „Trendstabilität“ ist nicht öffentlich und durch ein offengelegtes Trendmaß ersetzt.', 'SECONDARY_ONLY'),
    evidence_status: f('Dokumentierte Variante eines Drittanbieters plus VU-Ersatzannahmen; keine Primärquelle eines Traders', 'SECONDARY_ONLY'),
    automation_level: 'FULLY_QUANTIFIABLE',
    source_fidelity: f('Eigene VU-Methode. Kauf- und Verkaufsregeln, Depotgröße und Termine folgen der veröffentlichten TraderFox-Beschreibung; Universum (1.800 umsatzstärkste statt größte Unternehmen), SPY statt S&P 500 und der Rang sind VU-Ersatz.', 'VU_FORMALIZATION'),
    story: 'Statt einzelne Ausbrüche mit engem Stop zu handeln, hält dieses Modelldepot bis zu zehn der stärksten US-Aktien: Titel, die sich vom 52-Wochen-Tief mindestens verdoppelt haben, gerade ein neues Jahreshoch markierten und mit einer Kurslücke Interesse zeigten. Verkauft wird erst, wenn der Trend nachlässt — kein neues Hoch in 65 Handelstagen oder weniger als 100 % über dem Tief. Eine Marktampel (SPY über seinem 200-Tage-Durchschnitt) entscheidet, ob neu gekauft wird. Die Idee, nur Aktien zu kaufen, die bereits stark steigen, schreibt TraderFox Nicolas Darvas zu; die Regeln selbst sind TraderFox’ Variante, umgesetzt und geprüft von Vision Universe.',
    how_it_thinks: ['Ist die Marktampel grün (SPY über seinem 200-Tage-Durchschnitt)?', 'Hat sich die Aktie seit dem 52-Wochen-Tief mindestens verdoppelt und in den letzten 20 Handelstagen ein neues Jahreshoch markiert — mit einer Kurslücke von mindestens 6 %?', 'Freie Plätze gehen an die Aktien mit dem gleichmäßigsten Aufwärtstrend; Kauf zur Eröffnung am ersten Handelstag des Monats, 10 % je Position.', 'Verkauf am Monatsende, wenn 65 Handelstage kein neues Hoch kam oder der Vorsprung über dem Tief unter 100 % fällt.'],
    universe: f('Die 1.800 umsatzstärksten US-Aktien (63-Tage-Durchschnitt) ohne ETFs, ETNs und Fonds — Ersatz für „größte 1.800 Unternehmen“', 'VU_FORMALIZATION', ['TR52-UNIV-VU']),
    market: f('USA', 'SECONDARY_ONLY'),
    liquidity_rules: f('Mindestens 1 Mio. USD durchschnittlicher Tagesumsatz', 'SECONDARY_ONLY', ['TR52-LIQ']),
    market_regime: f('Marktampel: Neukäufe nur bei SPY über GD 200; sonst jede Position auf höchstens 5 %', 'SECONDARY_ONLY', ['TR52-MARKET']),
    momentum_filters: f('≥ 100 % seit 52-Wochen-Tief, neues Jahreshoch in 20 Handelstagen, Kurslücke ≥ 6 % in 20 Handelstagen', 'SECONDARY_ONLY', ['TR52-PERF', 'TR52-HIGH20', 'TR52-GAP']),
    trend_filters: f('Rang nach Clenow-Trendmaß (Steigung × R², 90 Tage) — Ersatz für die nicht öffentliche „Trendstabilität“', 'VU_FORMALIZATION', ['TR52-RANK-VU']),
    setup_definition: f('Kandidat = erfüllt alle Kaufregeln am Monatsende', 'SECONDARY_ONLY', ['TR52-PERF', 'TR52-HIGH20', 'TR52-GAP', 'TR52-LIQ']),
    entry_trigger: f('Monatliche Umschichtung: Entscheidung am letzten Handelstag, Kauf zur Eröffnung am ersten Handelstag des Folgemonats', 'VU_FORMALIZATION', ['TR52-SCHEDULE']),
    invalidation: NONE('Keine Invalidierung zwischen den Monatsterminen; Kandidaten werden jeden Monat neu bestimmt.'),
    initial_stop: NONE('Kein Stop — Verkauf nur nach den Monatsregeln (wie in der beschriebenen Variante).'),
    position_sizing: f('10 % Zielgewicht je Neukauf, höchstens 10 Positionen, ohne Hebel', 'SECONDARY_ONLY', ['TR52-SIZE']),
    scaling_in: NONE('Kein Nachkaufen.'),
    regular_exit: f('Kein neues 52-Wochen-Hoch in 65 Handelstagen, weniger als 100 % seit Tief oder Gewicht unter 3 %', 'SECONDARY_ONLY', ['TR52-SELL-STALE', 'TR52-SELL-PERF', 'TR52-SELL-WEIGHT']),
    trailing_stop: NONE('Kein Trailing-Stop; die 65-Tage-Regel wirkt als langsamer Trendausstieg.'),
    scaling_out: f('Gewicht über 20 % wird auf 15 % reduziert; Marktampel rot: jede Position auf höchstens 5 %', 'SECONDARY_ONLY', ['TR52-TRIM', 'TR52-MARKET']),
    gap_policy: f('Kauf zur Eröffnung, gleich wie hoch sie liegt; 10 bp Slippage', 'VU_FORMALIZATION', ['TR52-SCHEDULE']),
    required_data: f('Tages-OHLCV mit Eröffnung (für Kurslücken), 252 Sitzungen Historie, Tagesumsatz, SPY', 'SECONDARY_ONLY'),
    data_coverage: { measured: true }, data_freshness: { measured: true },
    known_failure_modes: f('Kauft nach starken Anstiegen; in schnellen Marktwenden verkauft das Modell erst zum Monatsende. Zehn Positionen sind wenig gestreut; Einzelwerte können stark fallen.', 'VU_FORMALIZATION'),
    discretionary_elements: NONE('Vollständig mechanisch (die von TraderFox im Echtgeld-Handel genutzten Pivotal-News-Points sind nicht abgebildet).'),
    prohibited_interpretations: ['Keine originale Darvas-Methode und nicht das TraderFox-System', 'TraderFox-Renditen sind nicht von Vision Universe reproduziert', 'Ein Platz im Modelldepot ist keine Kaufempfehlung'],
    lifecycle_mapping: { DISCOVERED: '—', WATCH: 'knapp verfehlt (eine Kaufregel fehlt)', SETUP: 'Kandidat in der Rangliste', ENTRY_READY: 'würde am Monatsende einen Platz bekommen', TRIGGERED: 'Modellorder am Monatsende beschlossen', ACTIVE: 'im Modelldepot', WARNING: '—', EXIT: 'Verkauf am Monatsende beschlossen', CLOSED: 'verkauft', INVALIDATED: '—' },
    variants: [
      { variant_id: 'VU_TREND_52W_PP', label: 'Primär: Regeln „mit Pivotal-Points“ (100 %, Kurslücke, Gewichtsregeln), Clenow-Rang', active: true, status: 'LIVE_MONITORING', vu_formalization: true },
      { variant_id: 'VU_TREND_52W_BASE', label: 'Sensitivität: Regeln 2018 (70 %, ohne Kurslücke)', active: false, status: 'BACKTEST_PENDING', vu_formalization: true },
    ],
    baselines: [{ id: 'BL-SPY', label: 'SPY Gesamtrendite' }],
    sources: ['SRC-TF-NEO-PP', 'SRC-TF-NEO-2018', 'SRC-CLENOW-2015', 'SRC-INTERNAL-VU'],
    track_record_note: 'TraderFox nennt für seine Variante einen Point-in-Time-Backtest seit 1999 und ein Live-Musterdepot seit 2018. Diese Angaben sind nicht von Vision Universe reproduziert. Die eigene VU-Prüfung ist vorab festgelegt (PREREGISTRATION-R12).',
    rules: [
      rule(V, 'TR52-UNIV-VU', 'Universum: die 1.800 US-Aktien mit dem höchsten durchschnittlichen Tagesumsatz der letzten 63 Handelstage (ohne ETFs, ETNs, Fonds). Ersatz für „größte 1.800 Unternehmen“, weil keine historische Marktkapitalisierung vorliegt.', 'rank(sma63(close*volume)) <= 1800', { size: 1800, days: 63 }, ['SRC-TF-NEO-PP', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(V, 'TR52-LIQ', 'Mindestens 1 Mio. USD durchschnittlicher Tagesumsatz (20 Tage).', 'sma20(close*volume) >= 1e6', { min: 1e6 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-PERF', 'Kauf nur, wenn der Kurs mindestens 100 % über dem tiefsten Kurs der letzten 52 Wochen liegt.', 'close / min(low, 252) - 1 >= 1.0', { minPerf: 1.0 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-HIGH20', 'Neues 52-Wochen-Hoch in den letzten 20 Handelstagen.', 'max(high, 20) >= max(high, 252)', { days: 20 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-GAP', 'Mindestens eine Kurslücke nach oben von 6 % (Eröffnung über dem Vortagesschluss) in den letzten 20 Handelstagen.', 'exists i in last 20: open[i]/close[i-1] - 1 >= 0.06', { gap: 0.06, days: 20 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-MARKET', 'Marktampel: Neukäufe nur, wenn SPY über seinem 200-Tage-Durchschnitt schließt (Ersatz für den S&P 500); bei roter Ampel wird jede Position auf höchstens 5 % reduziert.', 'spy > sma200(spy) ? buy : cap 5%', { ma: 200, cap: 0.05 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-RANK-VU', 'Freie Plätze gehen an die Kandidaten mit dem höchsten Clenow-Trendmaß (annualisierte Steigung der Log-Kurs-Regression über 90 Tage × R²). Offengelegter Ersatz für TraderFox’ nicht öffentliche „Trendstabilität“; Gleichstand alphabetisch.', 'score = (exp(slope*252)-1) * R2 over 90d', { days: 90 }, ['SRC-CLENOW-2015', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(V, 'TR52-SCHEDULE', 'Entscheidung nach Handelsschluss am letzten Handelstag des Monats, Ausführung zur Eröffnung am ersten Handelstag des Folgemonats (10 bp Slippage, 1 bp Gebühr).', 'decide(lastTradingDay(month)); execute open(firstTradingDay(nextMonth))', { slippageBps: 10, commissionBps: 1 }, ['SRC-TF-NEO-PP', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true),
      rule(V, 'TR52-SIZE', 'Zielgewicht 10 % des Depotwerts je Neukauf, höchstens 10 Positionen, ohne Hebel; reicht das Bargeld nicht für mindestens 3 %, kein Kauf.', 'buy value = 10% equity; max 10 positions', { target: 0.1, slots: 10 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-SELL-STALE', 'Verkauf, wenn in den letzten 65 Handelstagen kein neues 52-Wochen-Hoch erreicht wurde.', 'no new 252d high in last 65 sessions -> sell', { days: 65 }, [...TF, ...TF18], 'SECONDARY_ONLY', false),
      rule(V, 'TR52-SELL-PERF', 'Verkauf, wenn der Kurs weniger als 100 % über dem 52-Wochen-Tief liegt.', 'close / min(low, 252) - 1 < 1.0 -> sell', { minPerf: 1.0 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-SELL-WEIGHT', 'Verkauf, wenn die Position weniger als 3 % des Depots ausmacht.', 'weight < 0.03 -> sell', { min: 0.03 }, TF, 'SECONDARY_ONLY', false),
      rule(V, 'TR52-TRIM', 'Macht eine Position mehr als 20 % des Depots aus, wird sie auf 15 % reduziert.', 'weight > 0.20 -> reduce to 0.15', { max: 0.2, to: 0.15 }, TF, 'SECONDARY_ONLY', false),
    ],
  });
  trend.rule_cards = [{
    variant_id: 'VU_TREND_52W_PP', rule_version: V, timeframe: 'monthly',
    plan: { confirmRuleId: 'TR52-SCHEDULE', confirmBasis: 'MONTH_END_CLOSE', confirmText: 'Monatsende', invalidationRuleId: null, exitSummary: 'Monatsende: kein neues 52-Wochen-Hoch in 65 Handelstagen · < 100 % seit Tief · Gewicht < 3 % · > 20 % → 15 % · Marktampel rot → höchstens 5 %' },
    required_data: [
      { item: 'Tages-OHLCV mit Eröffnung, ≥ 252 Sitzungen', rules: ['TR52-PERF', 'TR52-HIGH20', 'TR52-GAP'] },
      { item: 'Tagesumsatz (Universum, Liquidität)', rules: ['TR52-UNIV-VU', 'TR52-LIQ'] },
      { item: 'SPY-Schlusskurse ≥ 200 Sitzungen', rules: ['TR52-MARKET'] },
    ],
    sections: [
      sec('candidate', 'Kandidat', 'Unter den 1.800 umsatzstärksten US-Aktien: ≥ 100 % über dem 52-Wochen-Tief, neues Jahreshoch und eine Kurslücke ≥ 6 % in den letzten 20 Handelstagen, ≥ 1 Mio. USD Tagesumsatz.', ['TR52-UNIV-VU', 'TR52-PERF', 'TR52-HIGH20', 'TR52-GAP', 'TR52-LIQ']),
      sec('ranking', 'Rangfolge', 'Freie Plätze nach dem gleichmäßigsten Aufwärtstrend (Clenow-Trendmaß, 90 Tage).', ['TR52-RANK-VU']),
      sec('prepared', 'Einstieg vorbereitet', 'Täglich aktualisierte Rangliste; verbindlich ist die Entscheidung am letzten Handelstag des Monats. Marktampel grün ist Pflicht.', ['TR52-MARKET', 'TR52-SCHEDULE']),
      sec('confirmation', 'Modellorder', 'Am Monatsende beschlossen, Ausführung zur Eröffnung des ersten Handelstags im Folgemonat; 10 % je Position.', ['TR52-SCHEDULE', 'TR52-SIZE']),
      sec('hold', 'Halten', 'Kein Stop zwischen den Terminen. Gewicht über 20 % → auf 15 % reduzieren.', ['TR52-TRIM']),
      sec('exit', 'Ausstieg', 'Am Monatsende: kein neues 52-Wochen-Hoch in 65 Handelstagen, weniger als 100 % über dem Tief oder Gewicht unter 3 %. Marktampel rot: jede Position auf höchstens 5 %.', ['TR52-SELL-STALE', 'TR52-SELL-PERF', 'TR52-SELL-WEIGHT', 'TR52-MARKET']),
      sec('invalid', 'Nicht aufgenommen', 'Kein freier Platz, Marktampel rot oder zu wenig Bargeld — jeweils mit Grund im Protokoll.', ['TR52-SIZE', 'TR52-MARKET']),
    ],
    edge_cases: [
      sec('missingData', 'Fehlende Daten', 'Fehlt am Ausführungstag ein Kurs, wird ein Verkauf zur nächsten verfügbaren Eröffnung nachgeholt; ein Kauf entfällt und wird protokolliert.', ['TR52-SCHEDULE']),
    ],
    executable: { status: 'EXECUTABLE', gaps: [], note: 'Alle Schritte von Kandidat bis Verkauf sind mechanisch definiert; Live-Ledger schreibt nur fort (keine Rückrechnung).' },
    source_basis: { status: 'DOCUMENTED_VARIANT_VU_EXECUTION', note: 'Kauf-/Verkaufsregeln, Depotgröße und Termine nach öffentlicher TraderFox-Beschreibung; Universum, Index-Ersatz und Rang sind VU.', fidelityReview: 'PERFORMED', fidelityNote: 'Runde 12: TraderFox-Beiträge im Volltext gelesen (verschlüsselt abgelegt).' },
    historical_validation: { status: 'NOT_VALIDATED', note: 'Vorab festgelegte interne Prüfung (PREREGISTRATION-R12); öffentlich ohne Kennzahlen.' },
  }];
  return { trend };
}

// Marktampel (PORT-MARKET-200) fuer Darvas 3.0.2 und Turtle 2.0.1: vorab festgelegt im Vollportfolio bestanden.
// Signale, Stops und Ausstiege unveraendert; nur das Modellportfolio nimmt bei roter Ampel keine neue Position auf.
export const R12 = Object.freeze({ DARVAS_BOX: '3.0.2', DONCHIAN_TURTLE: '2.0.1' });
export function applyR12({ darvas, donchian, rule }) {
  const bump = (s, v, src, evidence, vu, note) => {
    const prev = s.strategy_version;
    s.previous_versions = [...(s.previous_versions || []), { version: prev, note: 'Signale, Stops und Ausstiege unverändert; neue Version ergänzt nur die Marktampel im Modellportfolio. Ergebnis der Vorversion bleibt gültig.' }];
    for (const c of s.rule_cards || []) { c.plans_by_version = { ...(c.plans_by_version || {}), [prev]: { ...c.plan } }; c.rule_version = v; }
    s.strategy_version = v;
    for (const r of s.rules) r.strategy_version = v;
    s.rules.push(rule(v, 'PORT-MARKET-200', note, 'spy(t-1) <= sma200(spy)(t-1) -> skip new model position (reason MARKET_FILTER)', { ma: 200 }, src, evidence, vu));
    s.market_regime = { text: 'Marktampel im Modellportfolio: keine neue Position, wenn SPY am Vortag unter seinem 200-Tage-Durchschnitt schloss (seit Runde 12).', evidence, rules: ['PORT-MARKET-200'] };
  };
  bump(darvas, R12.DARVAS_BOX, ['SRC-TF-NEO-PP', 'SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true, 'Marktampel (Runde 12): Schließt SPY unter seinem 200-Tage-Durchschnitt, nimmt das Modellportfolio keine neue Position auf; Signale und offene Positionen laufen weiter. Darvas verließ den Markt in schwachen Phasen über seine Stops; die Ampel selbst stammt aus einer dokumentierten Drittvariante. Im Vollportfolio vorab festgelegt geprüft; ein Vorteil gegenüber dem Markt ist damit nicht belegt.');
  bump(donchian, R12.DONCHIAN_TURTLE, ['SRC-INTERNAL-VU'], 'VU_FORMALIZATION', true, 'Marktampel (Runde 12): Schließt SPY unter seinem 200-Tage-Durchschnitt, nimmt das Modellportfolio keine neue Position auf; Signale und offene Positionen laufen weiter. Für die Turtles ist keine Marktregel belegt – VU-Annahme, im Vollportfolio vorab festgelegt geprüft; ein Vorteil gegenüber dem Markt ist damit nicht belegt.');
}
