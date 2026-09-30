/* Vision Universe® — Supertrader
   Eigenständige Produktoberfläche. Liest nur die Supertrader-Artefakte
   (supertrader/data/*.json) und — für Charts — die kanonischen Kursartefakte
   über st-chart.js. Keine Berechnung von Signalen im Browser: Signale,
   Zustände und Gates entstehen deterministisch im Build. */
(function () {
  'use strict';
  var BASE = '/supertrader/';
  var DATA = BASE + 'data/';
  var body = document.body;
  var page = body.getAttribute('data-page');
  var main = document.getElementById('st-main');

  /* ------------------------------------------------------------ Helfer */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') for (var s in v) e.style.setProperty(s, v[s]);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function getJSON(name) { return fetch(DATA + name, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(name + ' HTTP ' + r.status); return r.json(); }); }
  function num(v, d) { if (v === null || v === undefined || !isFinite(v)) return '–'; return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }); }
  function pct(v, d, signed) { if (v === null || v === undefined || !isFinite(v)) return '–'; var s = num(v * 100, d === undefined ? 1 : d) + ' %'; return signed && v > 0 ? '+' + s : s; }
  function dateDe(d) { if (!d) return '–'; var p = String(d).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function lockIcon() { return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 1 0-3 0v2Z"/></svg>'; }

  var STATUS_TEXT = {
    RESEARCHED: 'Research abgeschlossen', SOURCE_PARTIAL: 'Quellen teilweise', VU_FORMALIZATION: 'VU-Formalisierung', BACKTEST_PENDING: 'Backtest ausstehend',
    BACKTEST_RUNNING: 'Backtest läuft', BACKTEST_VALIDATED: 'Backtest validiert', LIVE_MONITORING: 'Live-Beobachtung', LIVE_VALIDATED: 'Live validiert',
    DATA_COVERAGE_PENDING: 'Datenabdeckung ausstehend', DATA_COVERAGE_INSUFFICIENT: 'Datenabdeckung unzureichend', HYBRID_MODEL: 'Hybrid-Modell',
    ADVANCED_RESEARCH: 'Research in progress', BACKTEST_READY: 'Backtest-bereit', NOT_COMPARABLE: 'Nicht vergleichbar',
  };
  var STATUS_TONE = { RESEARCHED: 'good', LIVE_MONITORING: 'info', HYBRID_MODEL: 'warn', VU_FORMALIZATION: 'warn', SOURCE_PARTIAL: 'warn', DATA_COVERAGE_PENDING: 'bad', DATA_COVERAGE_INSUFFICIENT: 'bad', BACKTEST_PENDING: '', ADVANCED_RESEARCH: '' };
  var EVIDENCE_TEXT = { PRIMARY_EXPLICIT: 'Original, ausdrücklich', PRIMARY_INFERRED: 'Original, abgeleitet', MULTI_SOURCE_CONFIRMED: 'Mehrfach bestätigt', SECONDARY_ONLY: 'Nur Sekundärquelle', DISPUTED: 'Umstritten', VU_FORMALIZATION: 'VU-Formalisierung', VU_EXTENSION: 'VU-Erweiterung', NOT_VERIFIABLE: 'Nicht belegbar' };
  var EVIDENCE_TONE = { PRIMARY_EXPLICIT: 'good', PRIMARY_INFERRED: 'good', MULTI_SOURCE_CONFIRMED: 'good', SECONDARY_ONLY: 'warn', DISPUTED: 'bad', VU_FORMALIZATION: 'info', VU_EXTENSION: 'info', NOT_VERIFIABLE: '' };
  // Nutzerphasen: strikt getrennt. „Nahe am Trigger“ ist Vorbereitung, kein Einstieg.
  var STATE_LABEL = { DISCOVERED: 'Kandidat', WATCH: 'Kandidat', SETUP: 'Einstieg vorbereitet', ENTRY_READY: 'Vorbereitet · nahe Trigger', TRIGGERED: 'Einstieg bestätigt', ACTIVE: 'Modellposition aktiv', WARNING: 'Warnung', EXIT: 'Ausstieg ausgelöst', CLOSED: 'Geschlossen', INVALIDATED: 'Ungültig' };
  var BASIS_SHORT = { DAILY_CLOSE: 'Schluss', WEEKLY_CLOSE: 'Wochenschluss', CLOSE: 'Schluss', LOW: 'Tief' };
  function dateShort(d) { return d ? dateDe(d) : '–'; }
  var BASIS_TEXT = { DAILY_CLOSE: 'Tagesschluss', WEEKLY_CLOSE: 'Wochenschluss', CLOSE: 'Tagesschluss', LOW: 'Tagestief', NEXT_OPEN: 'Eröffnung Folgetag', STOP_ORDER_ASSUMPTION: 'Stop-Order-Annahme', OPEN_BELOW_STOP: 'Eröffnung unter Stop', OPEN: 'Eröffnung' };
  var QLABEL = { A_CANDIDATE: 'A-Kandidat', B_SETUP: 'B-Setup', A_ENTRY: 'A-Einstieg', B_ENTRY: 'B-Einstieg' };
  var LIVE_ORDER = ['ENTRY_READY', 'TRIGGERED', 'ACTIVE', 'WARNING', 'EXIT', 'SETUP'];

  function chip(text, tone, title) { return h('span', { class: 'st-chip' + (tone ? ' ' + tone : ''), title: title || null }, [h('span', { class: 'dot' }), text]); }
  function statusChip(s) { return chip(STATUS_TEXT[s] || s, STATUS_TONE[s], s); }
  function evidenceChip(e) { return chip(EVIDENCE_TEXT[e] || e, EVIDENCE_TONE[e], e); }
  function stateTag(s) { return h('span', { class: 'st-state', 'data-s': s, text: STATE_LABEL[s] || s }); }
  function section(title, kicker, kids, more) {
    return h('section', { class: 'st-section' }, [h('header', null, [h('div', null, [kicker ? h('div', { class: 'st-kicker', text: kicker }) : null, h('h2', { text: title })]), more || null])].concat(kids));
  }
  function empty(title, text) { return h('div', { class: 'st-empty' }, [h('h3', { text: title }), h('p', { text: text })]); }
  function worldVars(s) { return { '--w': s.theme.accent, '--w2': s.theme.accent2 }; }
  function setWorld(s) { if (!s) return; document.documentElement.style.setProperty('--world', s.theme.accent); document.documentElement.style.setProperty('--world-2', s.theme.accent2); }
  function stratUrl(s) { return BASE + 'strategies/' + s.slug + '/'; }
  function stockUrl(sym) { return BASE + 'stock/' + encodeURIComponent(sym) + '/'; }

  /* ------------------------------------------------ Kopf & Navigation */
  var NAV = [
    ['home', 'Start', BASE, '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
    ['signals', 'Signale', BASE + 'signals/', '<path d="M3 17l5-6 4 3 6-8 3 3"/><circle cx="21" cy="9" r="0"/>'],
    ['strategies', 'Strategien', BASE + 'strategies/', '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'],
    ['backtests', 'Backtests', BASE + 'backtests/', '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'],
    ['sources', 'Quellen', BASE + 'sources/', '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h6"/>'],
  ];
  function chrome(asOf) {
    var current = page === 'strategy' ? 'strategies' : (page === 'stock' ? 'signals' : page);
    var tabs = h('nav', { class: 'st-tabs', 'aria-label': 'Supertrader' }, NAV.map(function (n) { return h('a', { href: n[2], 'aria-current': n[0] === current ? 'page' : null, text: n[1] }); }));
    var bar = h('div', { class: 'st-bar' }, [h('div', { class: 'st-bar-inner' }, [
      h('a', { class: 'st-logo', href: BASE, 'aria-label': 'Supertrader Start' }, [h('i'), 'SUPERTRADER']), tabs,
      h('span', { class: 'st-stamp', text: asOf ? 'Stand ' + dateDe(asOf) : '' }),
    ])]);
    var bottom = h('nav', { class: 'st-bottom', 'aria-label': 'Supertrader mobil' }, NAV.map(function (n) {
      var a = h('a', { href: n[2], 'aria-current': n[0] === current ? 'page' : null });
      a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + n[3] + '</svg><span>' + n[1] + '</span>';
      return a;
    }));
    main.innerHTML = '';
    main.appendChild(bar);
    document.body.appendChild(bottom);
  }
  function disclaimer(sig) {
    return h('footer', { class: 'st-disclaimer' }, [
      h('p', { text: (sig && sig.disclaimer) || 'Modellsignale einer regelbasierten Strategie-Nachbildung. Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.' }),
      h('p', { text: 'Supertrader ist ein eigenständiges Vision-Universe-Produkt. Kursdaten stammen aus der bestehenden Discovery-Dateninfrastruktur (Tiingo, split-adjustiert, Tagesschluss); Signale gelten für den letzten vollständigen Handelstag.' }),
    ]);
  }

  /* ------------------------------------------------ Signal-Texte */
  function whyText(s) {
    var f = s.facts || {}, lv = s.levels || {};
    switch (s.strategyId) {
      case 'MOMENTUM_BREAKOUT':
        if (f.baseLength) return 'Gehört zu den stärksten Aktien (Momentum-Perzentil ' + num(f.momentumPercentile, 0) + ') und konsolidiert seit ' + f.baseLength + ' Sitzungen nach ' + pct(f.priorRun, 0, true) + ' Vorlauf.';
        if (f.priorRun !== undefined) return 'Momentum-Perzentil ' + num(f.momentumPercentile, 0) + ', Vorlauf ' + pct(f.priorRun, 0, true) + ' — noch keine enge Basis.';
        return 'Momentum-Perzentil ' + num(f.momentumPercentile, 0) + ' — noch ohne ausreichenden Vorlauf.';
      case 'MINERVINI_VCP':
        if (f.contractions) return 'Trend Template erfüllt, RS-Perzentil ' + num(f.rsPercentile, 0) + ', Rücksetzer ' + f.contractions.map(function (c) { return num(c, 1); }).join(' → ') + ' %' + (f.volumeRatio ? ', Volumen ' + num(f.volumeRatio * 100, 0) + ' % des Schnitts.' : '.');
        return 'Trend Template erfüllt (RS-Perzentil ' + num(f.rsPercentile, 0) + ') — noch keine Volatilitätskontraktion.';
      case 'DARVAS_BOX':
        if (lv.boxBottom) return 'Box ' + num(lv.boxBottom) + ' – ' + num(lv.boxTop) + ' (' + pct(f.boxHeight, 1) + ' hoch) nahe dem 52-Wochen-Hoch.';
        var r = s.rules || {};
        if (lv.boxTop && r['DAR-BOX-02'] && r['DAR-BOX-03'] === false) return 'Box unter ' + num(lv.boxTop) + ' ist ' + pct(f.boxHeight, 1) + ' hoch — außerhalb der zulässigen 3–25 %.';
        if (lv.boxTop && r['DAR-BOX-02'] && r['DAR-BOX-04'] === false) return 'Box unter ' + num(lv.boxTop) + ' liegt unterhalb des Hochbereichs (Oberkante < 95 % des 52-Wochen-Hochs).';
        if (lv.boxTop) return 'Oberkante ' + num(lv.boxTop) + ' bestätigt — die Unterkante bildet sich noch.';
        return 'Nahe dem 52-Wochen-Hoch (' + pct(f.distanceTo52wHigh, 1) + ') — noch keine Box.';
      case 'WEINSTEIN_STAGE':
        return 'Stage ' + (f.stage || 1) + (f.baseWeeks ? ' seit ' + f.baseWeeks + ' Wochen' : '') + ', 30-Wochen-Linie ' + (Math.abs(f.maSlope4w || 0) <= 0.005 ? 'flach' : (f.maSlope4w > 0 ? 'steigend' : 'fallend')) + ', relative Stärke ' + pct(f.rsChange13w, 1, true) + ' in 13 Wochen.';
      default: return '';
    }
  }
  function stateSentence(s) {
    var lv = s.levels || {};
    switch (s.state || s.stage) {
      case 'DISCOVERED': case 'WATCH': return 'Nur Beobachtung — es gibt noch kein Setup.';
      case 'SETUP': return 'Einstieg vorbereitet, Kurs noch mehr als 3 % unter dem Trigger. Erst ein ' + (s.strategyId === 'WEINSTEIN_STAGE' ? 'Wochenschluss' : 'Tagesschluss') + ' über ' + num(lv.trigger) + ' bestätigt den Einstieg.';
      case 'ENTRY_READY': return 'Kurs nahe am Trigger — das ist noch kein Einstieg. Erst ein ' + (s.strategyId === 'WEINSTEIN_STAGE' ? 'Wochenschluss' : 'Tagesschluss') + ' über ' + num(lv.trigger) + ' bestätigt ihn.';
      case 'TRIGGERED': return 'Einstieg am ' + dateDe(s.confirmation ? s.confirmation.date : lastT(s).date) + ' per Schlusskurs bestätigt. Der Modelleinstieg folgt zur nächsten Eröffnung — noch keine Ausführung.';
      case 'ACTIVE': return 'Modellposition aktiv (keine reale Order); der Stop liegt bei ' + num(s.stop) + '.';
      case 'WARNING': return 'Modellposition läuft mit Warnsignal; der Stop liegt bei ' + num(s.stop) + '.';
      case 'EXIT': return 'Ausstiegsregel ausgelöst — Ausführung zur nächsten Eröffnung.';
      case 'CLOSED': return 'Modellposition geschlossen mit ' + pct(s.result && s.result.returnPct, 1, true) + '.';
      case 'INVALIDATED': return lastT(s).ruleId === 'LC-VERSION-RETIRED' ? 'Durch neue Regelversion abgelöst — nicht umgedeutet, sondern unter der neuen Version neu gesucht.' : 'Setup ungültig geworden (' + lastT(s).ruleId + ').';
      default: return '';
    }
  }
  function lastT(s) { return (s.transitions && s.transitions[s.transitions.length - 1]) || {}; }
  function riskOf(s) {
    var lv = s.levels || {};
    if (s.entry && isFinite(s.stop)) return 1 - s.stop / s.entry.price;
    if (s.strategyId === 'MOMENTUM_BREAKOUT' && isFinite(lv.adr20)) return lv.adr20;
    if (isFinite(lv.trigger) && isFinite(lv.invalidation)) return 1 - lv.invalidation / lv.trigger;
    return null;
  }

  /* ---------------------------------------------- Transparenz (überall) */
  var TRUST = { bt: null, cov: null };
  function activeVariant(strat) { return (strat.variants || []).filter(function (v) { return v.active; })[0] || null; }
  function btRun(strat) { if (!TRUST.bt) return null; var v = activeVariant(strat); return TRUST.bt.runs.filter(function (r) { return r.strategyId === strat.strategy_id && (!v || r.variantId === v.variant_id); })[0] || null; }
  function dataLabel(strat) {
    var c = TRUST.cov && TRUST.cov.coverage; if (!c) return null;
    if (strat.strategy_id === 'WEINSTEIN_STAGE') return 'Daten: Wochenschluss ' + num(c.weeklyCloseYears, 0) + ' J., Volumen ' + num(c.dailyOhlcvYears, 1) + ' J.';
    if (strat.strategy_id === 'GREENBLATT_VALUE') return 'Daten: 3 Pflichtfelder fehlen';
    return 'Daten: Tages-OHLCV ' + num(c.dailyOhlcvYears, 1) + ' J.';
  }
  function methodLabel(strat) {
    if (strat.product_status.indexOf('HYBRID_MODEL') >= 0) return 'Hybrid-Modell (VU-Formalisierung)';
    var v = activeVariant(strat);
    if (v && v.vu_formalization) return 'VU-Formalisierung';
    return strat.advanced ? 'Research' : 'Originalregeln';
  }
  function statusLabel(strat) {
    if (strat.advanced) return 'Research in progress';
    if (!strat.engine) return 'Keine Signale (Datenabdeckung)';
    return 'Live-Beobachtung seit Tagesschluss';
  }
  // Kompakte Leiste auf jeder Karte: Status · Daten · Methode · Validierung.
  function trustStrip(strat) {
    var r = btRun(strat), c = TRUST.cov && TRUST.cov.coverage;
    var data = !c ? null : strat.strategy_id === 'WEINSTEIN_STAGE' ? 'Woche ' + num(c.weeklyCloseYears, 0) + ' J.' : 'Tagesdaten ' + num(c.dailyOhlcvYears, 1) + ' J.';
    var method = methodLabel(strat).indexOf('Hybrid') === 0 ? 'Hybrid · VU' : methodLabel(strat);
    return h('div', { class: 'st-trust', 'aria-label': 'Transparenz: ' + statusLabel(strat) + ', ' + (dataLabel(strat) || '') + ', ' + methodLabel(strat) + ', nicht backtest-validiert' + (r ? ' (' + (STATUS_TEXT[r.status] || r.status) + ')' : '') }, [
      chip(strat.engine ? 'Live' : 'Kein Live', strat.engine ? 'info' : ''),
      data ? chip(data, 'warn') : null,
      chip(method, method === 'Originalregeln' ? 'good' : 'warn'),
      chip('Nicht validiert', 'bad', r ? 'Backtest: ' + (STATUS_TEXT[r.status] || r.status) : null),
    ]);
  }
  // Großes Panel für Strategie- und Lens-Seiten.
  function trustPanel(strat) {
    var r = btRun(strat), c = TRUST.cov && TRUST.cov.coverage;
    var failed = r ? r.gates.filter(function (g) { return !g.pass; }).map(function (g) { return g.label; }) : [];
    return h('div', { class: 'st-grid g1 g2w st-trust-panel' }, [
      h('div', { class: 'st-tile' }, [h('div', { class: 'k', text: 'Strategie-Status' }), h('div', { class: 'v s', text: statusLabel(strat) }), h('div', { class: 'd', text: strat.product_status.map(function (p) { return STATUS_TEXT[p] || p; }).join(' · ') })]),
      h('div', { class: 'st-tile' }, [h('div', { class: 'k', text: 'Datenabdeckung' }), h('div', { class: 'v s', text: dataLabel(strat) ? dataLabel(strat).replace('Daten: ', '') : '–' }), h('div', { class: 'd', text: c ? 'Survivorship-Kontrolle: ' + (c.survivorshipControls ? 'aktiv' : 'fehlt') + ' · Intraday-Historie: ' + c.intradaySessionsRetained + ' Sitzungen · PIT-Bilanzen: ' + c.pitFundamentalSymbols + ' Titel' : '' })]),
      h('div', { class: 'st-tile' }, [h('div', { class: 'k', text: 'Formalisierung' }), h('div', { class: 'v s', text: methodLabel(strat) }), h('div', { class: 'd', text: (strat.rules || []).filter(function (x) { return x.VU_formalization_flag; }).length + ' von ' + (strat.rules || []).length + ' Regeln sind Vision-Universe-Übersetzungen, nicht Originalregeln.' })]),
      h('div', { class: 'st-tile st-tile-bad' }, [h('div', { class: 'k', text: 'Backtest-Validierung' }), h('div', { class: 'v s', text: 'Nicht validiert' }), h('div', { class: 'd', text: r ? (STATUS_TEXT[r.status] || r.status) + ' — offen: ' + failed.join(', ') + '. Deshalb keine Rendite-, Drawdown- oder Trefferquoten-Zahl.' : 'Kein Backtest definiert.' })]),
    ]);
  }
  function qualityBadge(s) {
    if (!s.quality) return null;
    var q = s.quality;
    return h('span', { class: 'st-q st-q-' + q.tier, title: 'VU-Qualitätsstufe, nicht backtest-validiert' }, [(QLABEL[q.label] || q.tier + '-Setup') + (q.label === 'A_CANDIDATE' ? ' · Volumen offen' : '')]);
  }

  // Ein-/Ausstiegsblock: Status, geplante Schwellen mit Datenstand, tatsächliche
  // Modellausführung (nur wenn vorhanden) und nächste Handlung mit Regel.
  function planRows(p) {
    var rows = [];
    var inPos = !!p.entry;
    rows.push(['Trigger', num(p.trigger.value), 'geplant · ' + (BASIS_SHORT[p.trigger.basis] || '') + ' > · Stand ' + dateShort(p.trigger.dataAsOf)]);
    if (p.stop) rows.push(['Stop', num(p.stop.value), p.stop.ruleId + ' · Stand ' + dateDe(p.stop.dataAsOf), 'bad']);
    else rows.push(['Ungültig', num(p.invalidation.value), 'geplant · ' + (BASIS_SHORT[p.invalidation.basis] || '') + ' < · Stand ' + dateShort(p.invalidation.dataAsOf), 'bad']);
    if (p.confirmation && !inPos) rows.push(['Bestätigt', num(p.confirmation.close), (BASIS_TEXT[p.confirmation.basis] || '') + ' ' + dateDe(p.confirmation.date)]);
    rows.push(inPos ? ['Modell\u00ADeinstieg', num(p.entry.price), (BASIS_TEXT[p.entry.basis] || '') + ' ' + dateDe(p.entry.date) + (p.entry.gappedAboveTrigger ? ' · Gap' : '')] : ['Modell\u00ADeinstieg', 'keiner', p.phase === 'CONFIRMED' ? 'folgt zur Eröffnung' : 'erst nach Bestätigung']);
    var lastExit = p.exits && p.exits.length ? p.exits[p.exits.length - 1] : null;
    if (lastExit) rows.push(['Ausstieg', num(lastExit.price), (BASIS_TEXT[lastExit.basis] || lastExit.basis) + ' ' + dateDe(lastExit.date) + ' · ' + lastExit.ruleId]);
    return rows;
  }
  function entryExitBlock(s, compact) {
    var p = s.plan;
    if (!p) return null;
    return h('div', { class: 'st-plan' + (compact ? ' compact' : ''), 'data-phase': p.phase }, [
      h('div', { class: 'st-plan-status' }, [h('span', { class: 'ph', text: p.phaseLabel }), h('span', { class: 'since', text: 'seit ' + dateDe(p.since) + ' · ' + (p.sinceRuleId || '') })]),
      h('div', { class: 'st-plan-grid' }, planRows(p).map(function (r) { return h('div', { class: 'c' }, [h('div', { class: 'k', text: r[0] }), h('div', { class: 'v' + (r[3] ? ' ' + r[3] : ''), text: r[1] }), h('div', { class: 'd', text: r[2] })]); })),
      h('div', { class: 'st-plan-next' }, [h('span', { class: 'k', text: 'Nächste Handlung des Modells' }), h('p', { text: p.nextAction.text }), h('span', { class: 'r', text: 'Regel ' + p.nextAction.ruleId + ' · Datenstand ' + dateDe(p.nextAction.dataAsOf) + (p.reason ? ' · ' + p.reason : '') })]),
      s.dataStatus ? h('div', { class: 'st-banner', text: s.dataStatus.note }) : null,
    ]);
  }

  function signalCard(s, strat) {
    var st = s.state || s.stage;
    var open = !!s.entry;
    var lv = s.levels || {};
    var levels = open ? [
      ['Einstieg', num(s.entry.price)], ['Stop', num(s.stop), 'bad'], ['Modell live', isFinite(s.lastPrice) ? pct(s.lastPrice / s.entry.price - 1, 1, true) : '–'],
    ] : st === 'CLOSED' ? [
      ['Einstieg', num(s.entry && s.entry.price)], ['Ausstieg', num(s.exits && s.exits.length ? s.exits[s.exits.length - 1].price : null)], ['Live-Ergebnis', pct(s.result && s.result.returnPct, 1, true)],
    ] : [
      ['Trigger', num(lv.trigger)], ['Ungültig', num(lv.invalidation), 'bad'], ['Risiko', riskOf(s) !== null ? pct(riskOf(s), 1) : '–'],
    ];
    return h('a', { class: 'st-sig', href: stockUrl(s.symbol), style: worldVars(strat) }, [
      h('div', { class: 'top' }, [h('span', { class: 'strat', text: strat.world_name }), h('span', { class: 'st-tags' }, [qualityBadge(s), stateTag(st)])]),
      h('div', null, [h('div', { class: 'sym', text: s.symbol }), h('div', { class: 'name', text: s.companyName || '' })]),
      h('div', { class: 'why', text: whyText(s) }),
      s.plan ? entryExitBlock(s, true) : (lv.trigger || open || st === 'CLOSED') ? h('div', { class: 'st-levels' }, levels.map(function (l) { return h('div', null, [h('div', { class: 'k', text: l[0] }), h('div', { class: 'v' + (l[2] ? ' ' + l[2] : ''), text: l[1] })]); })) : null,
      s.plan ? null : h('div', { class: 'st-small', text: stateSentence(s) }),
      open || st === 'CLOSED' ? h('div', { class: 'st-small', text: 'Werte aus dem Live-Protokoll des Modells, kein Backtest, keine reale Order.' }) : null,
      trustStrip(strat),
    ]);
  }

  function allLive(sig) {
    var out = [];
    Object.keys(sig.strategies).forEach(function (id) { sig.strategies[id].open.forEach(function (s) { out.push(s); }); });
    return out;
  }
  function stratById(reg) { var m = {}; reg.strategies.forEach(function (s) { m[s.strategy_id] = s; }); return m; }

  /* ================================================================ HOME */
  function renderHome(D) {
    var reg = D.registry, sig = D.signals, mk = D.market, bt = D.backtests;
    var S = stratById(reg);
    var core = reg.strategies.filter(function (s) { return !s.advanced; });
    var adv = reg.strategies.filter(function (s) { return s.advanced; });
    var live = allLive(sig);
    var dq = sig.strategies.DARVAS_BOX && sig.strategies.DARVAS_BOX.quality;
    var focusable = function (s) { return !s.quality || s.quality.tier === 'A'; };
    var c = sig.counts;

    main.appendChild(h('div', { class: 'st-hero' }, [
      h('div', { class: 'st-kicker', text: 'Vision Universe® · Strategy Intelligence' }),
      h('h1', null, [h('span', { text: 'SUPERTRADER' })]),
      h('div', { class: 'st-claim', text: 'Great strategies. Clear signals. Every result visible.' }),
      h('p', { class: 'st-lead', text: 'Sieh, wie bewährte Strategien denken. Prüfe, was historisch passiert wäre — sobald die Daten es ehrlich erlauben. Verfolge, was die Modelle heute sehen.' }),
      h('div', { class: 'st-hero-meta' }, [chip('Letzter Handelstag ' + dateDe(sig.asOf), 'world'), chip('Signale auf Tagesschlussbasis'), chip('Keine Anlageberatung')]),
    ]));

    // Market Pulse
    var triggeredToday = live.filter(function (s) { return s.state === 'TRIGGERED'; }).length;
    var activeCnt = live.filter(function (s) { return s.entry; }).length;
    main.appendChild(section('Market Pulse', 'Heute', [h('div', { class: 'st-grid g3 g6' }, [
      h('div', { class: 'st-tile', style: { 'grid-column': 'span 2' } }, [h('div', { class: 'k', text: 'Marktregime (Produktuniversum)' }), h('div', { class: 'v s', text: mk.regime.label }), h('div', { class: 'd', text: mk.regime.plain || '' })]),
      tile('Strategy Worlds live', String(core.filter(function (s) { return s.engine; }).length) + ' / ' + core.length, 'Greenblatt wartet auf Datenfelder'),
      tile('Setups im Fokus', String(live.filter(function (s) { return !s.entry && focusable(s); }).length), live.filter(function (s) { return s.state === 'ENTRY_READY' && focusable(s); }).length + ' nahe am Trigger' + (dq ? ' · ohne ' + dq.B + ' Darvas-B' : '')),
      tile('Einstieg bestätigt', String(triggeredToday), triggeredToday ? 'Modelleinstieg zur nächsten Eröffnung' : 'noch kein bestätigter Einstieg'),
      tile('Modellpositionen', String(activeCnt), activeCnt ? 'aktiv, Warnung oder Ausstieg · keine realen Orders' : 'keine — es gab noch keinen Modelleinstieg'),
    ]), h('p', { class: 'st-note', text: 'Datenfrische: Tageskurse bis ' + dateDe(mk.freshness.barsThrough) + ' (kanonische Materialisierung ' + dateDe((mk.freshness.barsGeneratedAt || '').slice(0, 10)) + '). ' + (mk.regime.notAForecast || '') })]));

    // Heute im Fokus
    // Prominent nur, was die Qualitätsschwelle erfüllt: Darvas ausschließlich als A-Setup.
    var focus = live.filter(focusable).sort(function (a, b) { return LIVE_ORDER.indexOf(a.state) - LIVE_ORDER.indexOf(b.state); }).slice(0, 10);
    main.appendChild(section('Heute im Fokus', 'Setups & Signale', [
      h('div', { class: 'st-banner', style: { 'margin-bottom': '12px' }, text: 'Kein Supertrader-Modell ist backtest-validiert. Signale zeigen, was eine Regel heute erkennt — nicht, dass sie historisch funktioniert hat.' }),
      focus.length
      ? h('div', { class: 'st-rail' }, focus.map(function (s) { return signalCard(s, S[s.strategyId]); }))
      : empty('Heute kein Setup', 'Keine der Strategien sieht auf dem letzten Tagesschluss ein Setup. Supertrader erzeugt keine künstlichen Signale — der Scanner beobachtet weiter.'),
      dq ? h('p', { class: 'st-note', style: { 'margin-top': '10px' } }, ['Darvas Boxes zeigt hier nur A: heute ' + ((dq.byLabel || {}).A_CANDIDATE || 0) + ' A-Kandidaten (vor dem Ausbruch) und ' + ((dq.byLabel || {}).A_ENTRY || 0) + ' A-Einstiege (Ausbruch bestätigt). ' + (D.market.regime.id === 'BROAD_WEAKNESS' ? 'Die Regime-Sperre (VU, keine Darvas-Originalregel) schließt A bei „breiter Schwäche“ aus. ' : '') + dq.B + ' B-Setups stehen im ', h('a', { href: BASE + 'signals/?strategy=DARVAS_BOX&quality=B', text: 'Signalzentrum' }), '.']) : null],
    h('a', { class: 'st-more', href: BASE + 'signals/', text: 'Alle Signale →' })));

    // Strategy Worlds
    main.appendChild(section('Strategy Worlds', 'Fünf Methoden, eine Engine', [
      h('div', { class: 'st-rail' }, core.map(worldCard)),
      h('div', { class: 'st-rail', style: { 'margin-top': '4px' } }, adv.map(worldCard)),
    ], h('a', { class: 'st-more', href: BASE + 'strategies/', text: 'Alle Strategien →' })));

    // Vergleich
    main.appendChild(section('Strategien im Vergleich', 'Backtest Lab', [
      h('p', { class: 'st-lead', text: 'Rendite und Drawdown erscheinen erst, wenn ein Backtest alle Datengates besteht. Heute fehlen vor allem delistete Titel (Survivorship Bias) und eine mehrjährige Tageshistorie in den öffentlichen Artefakten — deshalb steht hier bewusst keine Zahl.' }),
      compareList(core, bt, mk),
    ], h('a', { class: 'st-more', href: BASE + 'backtests/', text: 'Zum Backtest Lab →' })));

    // Was würde diese Strategie heute tun?
    main.appendChild(section('Was würde diese Strategie heute tun?', 'Im Klartext', [h('div', { class: 'st-grid g1 g2w' }, core.map(function (s) {
      return h('a', { class: 'st-card', href: stratUrl(s), style: Object.assign({ 'text-decoration': 'none', 'border-left': '3px solid ' + s.theme.accent }, {}) }, [
        h('div', { class: 'st-kicker', style: { color: s.theme.accent }, text: s.world_name }),
        h('p', { style: { 'margin-top': '6px' }, text: todaySentence(s, sig, mk) }),
      ]);
    }))]));

    // Alle Modellresultate
    var closed = 0, inv = 0, since = null;
    Object.keys(sig.strategies).forEach(function (k) { closed += sig.strategies[k].closed.length; inv += sig.strategies[k].invalidated.length; var l = sig.strategies[k].liveSince; if (l && (!since || l < since)) since = l; });
    main.appendChild(section('Alle Modellresultate bleiben sichtbar', 'Transparenz', [h('div', { class: 'st-grid g3' }, [
      tile('Live-Protokoll seit', dateDe(since), 'kein rückwirkendes Auffüllen'),
      tile('Abgeschlossene Signale', String(closed), 'Gewinner und Verlierer'),
      tile('Ungültig gewordene Setups', String(inv), 'bleiben ebenfalls stehen'),
    ]), h('p', { class: 'st-note', style: { 'margin-top': '10px' }, text: sig.policy })], h('a', { class: 'st-more', href: BASE + 'signals/?status=CLOSED', text: 'Historie →' })));
    main.appendChild(disclaimer(sig));
  }
  function tile(k, v, d) { return h('div', { class: 'st-tile' }, [h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v }), d ? h('div', { class: 'd', text: d }) : null]); }

  function worldCard(s) {
    return h('a', { class: 'st-world' + (s.advanced ? ' adv' : ''), href: stratUrl(s), style: s.advanced ? null : worldVars(s) }, [
      h('div', { class: 'who', text: s.originator }),
      h('h3', { text: s.world_name }),
      h('div', { class: 'tag', text: s.tagline }),
      h('div', { class: 'foot' }, s.product_status.slice(0, 3).map(statusChip).concat(s.advanced ? [] : [chip('Nicht backtest-validiert', 'bad')])),
    ]);
  }

  function activeRun(bt, id) { var r = bt.runs.filter(function (x) { return x.strategyId === id && x.active; })[0]; return r || bt.runs.filter(function (x) { return x.strategyId === id; })[0]; }
  function locked(k, reason) { var v = h('div', { class: 'v locked', title: reason }); v.innerHTML = lockIcon() + 'gesperrt'; return h('div', { class: 'st-metric' }, [h('div', { class: 'k', text: k }), v]); }
  function metric(k, v, wide) { return h('div', { class: 'st-metric' + (wide ? ' wide' : '') }, [h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v })]); }
  function regimeFit(s, mk) {
    var weak = mk.regime.id === 'BROAD_WEAKNESS';
    if (s.strategy_id === 'GREENBLATT_VALUE') return 'Regimeunabhängig — das Original hat keinen Marktfilter';
    return weak ? 'Laut Methode ungünstig: breite Schwäche' : (mk.regime.id === 'BROAD_STRENGTH' ? 'Laut Methode günstig: breite Stärke' : 'Gemischtes Umfeld');
  }
  function compareList(core, bt, mk) {
    return h('div', { class: 'st-cmp' }, core.map(function (s) {
      var r = activeRun(bt, s.strategy_id);
      var reason = r ? 'Gesperrt: ' + r.failedGates.join(', ') : '';
      return h('a', { class: 'st-cmp-row', href: stratUrl(s) + '#backtest', style: worldVars(s) }, [
        h('div', null, [h('div', { class: 'name', text: s.world_name }), h('div', { class: 'st-chips', style: { 'margin-top': '6px' } }, [statusChip(r ? r.status : 'BACKTEST_PENDING')])]),
        h('div', { class: 'st-cmp-metrics' }, [
          metric('Zeitraum', '–'), locked('CAGR', reason), locked('Max. Drawdown', reason), locked('Trust Score', reason),
          locked('Trades', reason), metric('Regime-Fit', regimeFit(s, mk), true),
        ]),
      ]);
    }));
  }
  function todaySentence(s, sig, mk) {
    var st = sig.strategies[s.strategy_id];
    if (!st) return s.strategy_id === 'GREENBLATT_VALUE' ? 'Heute kein Ranking: Für „Return on Capital“ fehlen im kanonischen Fundamentaldatensatz Umlaufvermögen, kurzfristige Verbindlichkeiten und Sachanlagen. Ein Ersatz unter Greenblatts Namen wäre eine andere Strategie — deshalb zeigt Supertrader hier bewusst nichts.' : '';
    var ready = st.open.filter(function (x) { return x.state === 'ENTRY_READY'; }).length;
    var setup = st.open.filter(function (x) { return x.state === 'SETUP'; }).length;
    var pos = st.open.filter(function (x) { return x.entry; }).length;
    var parts = [];
    parts.push(s.world_name + ' sieht ' + (setup + ready) + ' Setup' + (setup + ready === 1 ? '' : 's') + (ready ? ', davon ' + ready + ' nahe am Trigger' : '') + '.');
    parts.push(pos ? pos + ' Modellposition' + (pos === 1 ? ' läuft' : 'en laufen') + '.' : 'Keine laufende Modellposition.');
    parts.push(st.scanner.watch + ' Titel stehen auf der Beobachtungsliste, ' + st.scanner.discovered + ' sind entdeckt.');
    if (mk.regime.id === 'BROAD_WEAKNESS' && s.strategy_id !== 'WEINSTEIN_STAGE') parts.push('Das Marktumfeld ist breit schwach — laut Methode kein Rückenwind; Version 1 zeigt das an, filtert aber nicht.');
    if (s.strategy_id === 'WEINSTEIN_STAGE') parts.push('Entscheidungen fallen nur zum Wochenschluss.');
    return parts.join(' ');
  }

  /* ========================================================== STRATEGIES */
  function renderStrategies(D) {
    var reg = D.registry;
    main.appendChild(h('div', { class: 'st-hero st-hero-sm' }, [h('div', { class: 'st-kicker', text: 'Strategy Worlds' }), h('h1', null, [h('span', { text: 'Strategien' })]), h('p', { class: 'st-lead', text: 'Jede Strategie läuft über dieselbe versionierte Engine: gleiche Lebenszyklus-Zustände, gleiche Ausführungsannahmen, gleiche Gates. Originalregeln und Vision-Universe-Formalisierungen sind getrennt ausgewiesen.' })]));
    main.appendChild(section('Live-Welten', null, [h('div', { class: 'st-grid g1 g2w' }, reg.strategies.filter(function (s) { return !s.advanced; }).map(worldCard))]));
    main.appendChild(section('Advanced / Coming Next', 'Research in progress', [h('p', { class: 'st-lead', text: 'Diese Methoden sind als Architektur vorbereitet. Sie zeigen keine Ergebnisse und keine Signale, bis Research- und Datengates bestanden sind.' }), h('div', { class: 'st-grid g1 g2w' }, reg.strategies.filter(function (s) { return s.advanced; }).map(worldCard))]));
    main.appendChild(disclaimer());
  }

  /* ============================================================ STRATEGY */
  function renderStrategy(D) {
    var id = body.getAttribute('data-strategy');
    var reg = D.registry, sig = D.signals, bt = D.backtests, cov = D.coverage, src = D.sources;
    var s = stratById(reg)[id];
    if (!s) { main.appendChild(empty('Strategie nicht gefunden', 'Diese Strategie ist nicht in der Registry.')); return; }
    setWorld(s);
    var srcMap = {}; src.sources.forEach(function (x) { srcMap[x.source_id] = x; });
    var st = sig.strategies[id];

    main.appendChild(h('div', { class: 'st-hero' }, [
      h('div', { class: 'st-kicker', text: s.originator + ' · ' + s.strategy_family }),
      h('h1', null, [h('span', { text: s.world_name })]),
      h('div', { class: 'st-claim', text: s.tagline }),
      h('div', { class: 'st-hero-meta' }, s.product_status.map(statusChip).concat([chip('Version ' + s.strategy_version), chip('Automatisierung: ' + ({ FULLY_QUANTIFIABLE: 'voll quantifizierbar', HYBRID: 'hybrid', NOT_SPECIFIED: 'offen' }[s.automation_level] || s.automation_level))])),
    ]));

    if (s.advanced) {
      main.appendChild(section('Research in progress', null, [empty('Noch keine Ergebnisse, keine Signale', s.story), sourcesBlock(s, srcMap)]));
      main.appendChild(disclaimer(sig));
      return;
    }

    main.appendChild(section('Auf einen Blick', 'Transparenz', [trustPanel(s)]));
    main.appendChild(h('nav', { class: 'st-seg', 'aria-label': 'Abschnitte', style: { 'margin-top': '16px' } }, [['story', 'Story'], ['signale', 'Signale'], ['regelkarte', 'Regelkarte'], ['backtest', 'Backtest'], ['regeln', 'Regeln'], ['historie', 'Historie'], ['quellen', 'Quellen']].map(function (x) { return h('button', { type: 'button', onclick: function () { var t = document.getElementById(x[0]); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, text: x[1] }); })));

    // Story
    var story = section('So denkt dieses Modell', 'Strategie-Story', [
      h('p', { class: 'st-lead', text: s.story }),
      h('ol', { class: 'st-steps', style: { 'margin-top': '14px' } }, s.how_it_thinks.map(function (t) { return h('li', { text: t }); })),
      h('div', { class: 'st-banner info', style: { 'margin-top': '14px' }, text: s.track_record_note }),
    ]);
    story.id = 'story'; main.appendChild(story);

    // Research-/Evidenzstatus
    main.appendChild(section('Research- und Evidenzstatus', null, [h('dl', { class: 'st-kv st-card' }, [
      h('dt', { text: 'Research' }), h('dd', null, [s.research_status.text, ' ', evidenceChip(s.research_status.evidence)]),
      h('dt', { text: 'Evidenz' }), h('dd', { text: s.evidence_status.text }),
      h('dt', { text: 'Quellentreue' }), h('dd', null, [s.source_fidelity.text, ' ', evidenceChip(s.source_fidelity.evidence)]),
      h('dt', { text: 'Automatisierung' }), h('dd', { text: s.automation_level + (s.automation_level === 'HYBRID' ? ' — einzelne Zustände beruhen auf einer algorithmischen Musterklassifikation, die das diskretionäre Urteil des Originals nicht ersetzt.' : '') }),
    ])]));

    // Signale (Scanner + aktuelle)
    var sigSec;
    if (st) {
      var liveKids = [];
      var sorted = st.open.slice().sort(function (a, b) { return LIVE_ORDER.indexOf(a.state) - LIVE_ORDER.indexOf(b.state); });
      if (s.quality_tiers) {
        var A = sorted.filter(function (x) { return x.quality && x.quality.tier === 'A'; });
        var Acand = A.filter(function (x) { return x.quality.label === 'A_CANDIDATE'; }), Aentry = A.filter(function (x) { return x.quality.label === 'A_ENTRY'; });
        var B = sorted.filter(function (x) { return !x.quality || x.quality.tier !== 'A'; });
        liveKids.push(qualityExplainer(s, st, A.length, B.length));
        liveKids.push(h('h3', { class: 'st-h3', text: 'A-Einstiege — Ausbruch per Schluss bestätigt (' + Aentry.length + ')' }));
        liveKids.push(Aentry.length ? h('div', { class: 'st-rail' }, Aentry.slice(0, 24).map(function (x) { return signalCard(x, s); })) : empty('Kein A-Einstieg', 'Es gibt noch keinen bestätigten Darvas-Ausbruch, der alle Kriterien inklusive Volumen am Bestätigungstag erfüllt.'));
        liveKids.push(h('h3', { class: 'st-h3', text: 'A-Kandidaten — vor dem Ausbruch (' + Acand.length + ')' }));
        liveKids.push(Acand.length ? h('div', { class: 'st-rail' }, Acand.slice(0, 24).map(function (x) { return signalCard(x, s); })) : empty('Heute kein A-Kandidat', (D.market.regime.id === 'BROAD_WEAKNESS' ? 'Die Regime-Sperre (VU, keine Darvas-Originalregel) schließt A bei „breiter Schwäche“ aus. ' : '') + 'Kein Setup erfüllt alle Kriterien vor dem Ausbruch.'));
        liveKids.push(h('h3', { class: 'st-h3', text: 'B-Setups (' + B.length + ') — gültig, aber nicht im Fokus' }));
        liveKids.push(B.length ? h('div', { class: 'st-rail' }, B.slice(0, 12).map(function (x) { return signalCard(x, s); })) : empty('Keine B-Setups', ''));
        if (B.length > 12) liveKids.push(h('a', { class: 'st-more', href: BASE + 'signals/?strategy=' + id + '&quality=B', text: 'Alle ' + B.length + ' B-Setups im Signalzentrum →' }));
      } else {
        liveKids.push(st.open.length ? h('div', { class: 'st-rail' }, sorted.slice(0, 24).map(function (x) { return signalCard(x, s); }))
          : empty('Aktuell kein Setup', 'Die Regeln dieser Strategie sind heute für keinen Titel erfüllt. Supertrader zeigt das so, statt ein Signal zu erfinden.'));
      }
      if (st.open.length > 24) liveKids.push(h('a', { class: 'st-more', href: BASE + 'signals/?strategy=' + id, text: 'Alle ' + st.open.length + ' Signale →' }));
      var chartHost = h('div', { style: { 'margin-top': '14px' } });
      liveKids.push(chartHost);
      var chartPick = sorted.filter(function (x) { return !x.quality || x.quality.tier === 'A'; })[0] || sorted[0];
      if (chartPick) mountSignalChart(chartHost, chartPick, s);
      liveKids.push(h('h3', { style: { 'margin-top': '22px', 'font-size': '17px' }, text: 'Setup Scanner — Beobachtungsliste' }));
      liveKids.push(h('p', { class: 'st-note', text: st.scanner.watch + ' Titel „Beobachten“, ' + st.scanner.discovered + ' „Entdeckt“ (Momentaufnahme ' + dateDe(sig.asOf) + '). Kandidaten werden nicht protokolliert — erst ab „Einstieg vorbereitet“.' }));
      liveKids.push(scannerTable(st.scanner.top.slice(0, 25), s));
      sigSec = section('Aktuelle Signale', 'Live-Beobachtung seit ' + dateDe(st.liveSince), liveKids);
    } else {
      sigSec = section('Aktuelle Signale', null, [empty('Keine Signale — Datenabdeckung ausstehend', 'Für diese Strategie fehlen Pflichtfelder im kanonischen Datensatz. Sie erzeugt keine Signale, bis die Datengrundlage vollständig ist.'), greenblattCoverage(cov)]);
    }
    sigSec.id = 'signale'; main.appendChild(sigSec);

    // Backtest
    var runs = bt.runs.filter(function (r) { return r.strategyId === id; });
    var btSec = section('Backtest', 'Historische Prüfung', [backtestPanel(runs, cov, s), variantsTable(s, runs)]);
    btSec.id = 'backtest'; main.appendChild(btSec);

    // Regelkarte
    if (s.rule_cards && s.rule_cards.length) { var rcSec = section('Regelkarte: Einstieg, Invalidation, Ausstieg', 'Maschinenlesbar · ' + s.rule_cards[0].variant_id, [ruleCardBlock(s, s.rule_cards[0])]); rcSec.id = 'regelkarte'; main.appendChild(rcSec); }

    // Regeln
    var orig = s.rules.filter(function (r) { return !r.VU_formalization_flag; });
    var vu = s.rules.filter(function (r) { return r.VU_formalization_flag; });
    var rulesSec = section('Regeln: Original und VU-Formalisierung', 'Einstieg, Ausstieg, Risiko', [
      h('div', { class: 'st-split' }, [
        h('div', null, [h('h3', { style: { 'font-size': '16px', 'margin-bottom': '8px' }, text: 'Originalmethode (' + orig.length + ')' }), h('div', { class: 'st-rules' }, orig.map(function (r) { return ruleCard(r, srcMap); }))]),
        h('div', null, [h('h3', { style: { 'font-size': '16px', 'margin-bottom': '8px' }, text: 'Vision-Universe-Formalisierung (' + vu.length + ')' }), h('div', { class: 'st-rules' }, vu.map(function (r) { return ruleCard(r, srcMap); }))]),
      ]),
      h('details', { class: 'st-details', style: { 'margin-top': '14px' } }, [h('summary', { text: 'Vollständige Strategy-DNA (' + reg.dnaFields.length + ' Felder)' }), h('div', null, [dnaTable(s, reg.dnaFields)])]),
      h('details', { class: 'st-details', style: { 'margin-top': '8px' } }, [h('summary', { text: 'Lebenszyklus dieser Strategie' }), h('div', null, [lifecycleTable(s)])]),
      h('details', { class: 'st-details', style: { 'margin-top': '8px' } }, [h('summary', { text: 'Verbotene Interpretationen' }), h('div', null, [h('ul', null, s.prohibited_interpretations.map(function (p) { return h('li', { text: p }); }))])]),
    ]);
    rulesSec.id = 'regeln'; main.appendChild(rulesSec);

    // Historie
    var histSec = section('Vollständige Signalhistorie', 'Nichts wird gelöscht', st ? [historyTable(st.closed.concat(st.invalidated), s), h('p', { class: 'st-note', style: { 'margin-top': '8px' } }, ['Alle ' + st.closed.length + ' abgeschlossenen Signale sind oben aufgeführt; von ' + st.invalidatedTotal + ' ungültig gewordenen Setups die jüngsten ' + st.invalidated.length + '. Das vollständige, maschinenlesbare Protokoll: ', h('a', { href: st.ledgerPath, text: 'Ledger (JSON)' })])] : [empty('Noch keine Historie', 'Diese Strategie erzeugt noch keine Signale.')]);
    histSec.id = 'historie'; main.appendChild(histSec);

    var srcSec = section('Quellen und Methodik', null, [sourcesBlock(s, srcMap)]);
    srcSec.id = 'quellen'; main.appendChild(srcSec);
    main.appendChild(disclaimer(sig));
  }

  function qualityExplainer(s, st, nA, nB) {
    var byId = {}; s.rules.forEach(function (r) { byId[r.rule_id] = r; });
    var counts = {}; st.open.forEach(function (x) { if (!x.quality) return; Object.keys(x.quality.criteria).forEach(function (k) { var v = x.quality.criteria[k]; counts[k] = counts[k] || { t: 0, f: 0, n: 0 }; counts[k][v === true ? 't' : v === false ? 'f' : 'n']++; }); });
    return h('div', { class: 'st-card', style: { 'margin-bottom': '12px' } }, [
      h('div', { class: 'st-kicker', text: 'Qualitätsstufen A / B · VU-Formalisierung' }),
      h('p', { style: { 'margin-top': '6px' }, text: s.quality_tiers.note }),
      h('div', { class: 'st-qrows' }, s.quality_tiers.rules.map(function (k) {
        var c = counts[k] || { t: 0, f: 0, n: 0 };
        return h('div', { class: 'st-qrow', title: byId[k] ? byId[k].plain_language_explanation : '' }, [
          h('div', null, [h('strong', { text: (s.quality_tiers.labels || {})[k] || k }), h('div', { class: 'st-small', text: k + (k === 'DAR-Q-REGIME' ? ' · VU-Sperre, kein Darvas-Original' : '') })]),
          h('div', { class: 'st-qcounts' }, [h('span', { class: 'ok', text: '✓ ' + c.t }), h('span', { class: 'no', text: '✕ ' + c.f }), h('span', { class: 'op', text: '… ' + c.n })]),
        ]);
      })),
      h('details', { class: 'st-details', style: { 'margin-top': '8px' } }, [h('summary', { text: 'Kriterien im Wortlaut' }), h('div', null, [h('ul', null, s.quality_tiers.rules.map(function (k) { return h('li', { text: k + ': ' + (byId[k] ? byId[k].plain_language_explanation : '') }); }))])]),
      st.quality && st.quality.bBreakdown ? h('div', { class: 'st-bsplit' }, [
        h('div', null, [h('div', { class: 'v', text: String(st.quality.bBreakdown.blockedOnlyByRegime) }), h('div', { class: 'k', text: 'B nur wegen Regime-Sperre' })]),
        h('div', null, [h('div', { class: 'v', text: String(st.quality.bBreakdown.failOtherCriteria) }), h('div', { class: 'k', text: 'B wegen weiterer Kriterien' })]),
      ]) : null,
      h('p', { class: 'st-small', style: { 'margin-top': '8px' }, text: 'Heute ' + nA + ' A und ' + nB + ' B. Die Regime-Sperre ist eine Vision-Universe-Annahme — keine Darvas-Originalregel und nicht backtest-geprüft. „Offen“ beim Volumen heißt: wird erst am Bestätigungstag geprüft und zählt vorher nicht gegen A.' }),
    ]);
  }

  var PROV_TEXT = { ORIGINAL: 'Original', VU: 'VU-Formalisierung', MIXED: 'Original + VU', NONE: 'keine Regel' };
  var PROV_TONE = { ORIGINAL: 'good', VU: 'info', MIXED: 'warn', NONE: '' };
  function ruleCardBlock(s, card) {
    var c = card.completeness || {};
    var tone = c.status === 'COMPLETE' ? 'info' : c.status === 'INACTIVE' ? '' : 'warn';
    var row = function (x) { return h('div', { class: 'st-rc-row' }, [h('div', { class: 'h' }, [h('strong', { text: x.title }), chip(PROV_TEXT[x.provenance] || x.provenance, PROV_TONE[x.provenance])]), h('p', { text: x.text }), x.rules.length ? h('div', { class: 'st-small', text: x.rules.join(' · ') }) : null]); };
    return h('div', { class: 'st-rc' }, [
      h('div', { class: 'st-banner ' + tone, text: (c.status === 'COMPLETE' ? 'Regeln vollständig mechanisch. ' : c.status === 'INACTIVE' ? 'Inaktiv — ' + (card.activationCondition || '') + ' ' : 'Unvollständig: ' + (c.incomplete || []).join('; ') + '. ') + (c.note || '') + (c.status === 'COMPLETE' && c.incomplete && c.incomplete.length ? ' Offen: ' + c.incomplete.join('; ') + '.' : '') }),
      h('div', { class: 'st-rc-meta st-small', text: 'Regelversion ' + card.rule_version + ' · Zeitbasis ' + ({ daily: 'Tagesbalken', weekly: 'Wochenschluss', annual: 'jährliches Rebalancing' }[card.timeframe] || card.timeframe) + ' · Herkunft je Abschnitt aus den Regel-IDs abgeleitet' }),
      h('div', { class: 'st-rc-list' }, card.sections.map(row)),
      card.edge_cases && card.edge_cases.length ? h('details', { class: 'st-details', style: { 'margin-top': '8px' } }, [h('summary', { text: 'Gaps, fehlendes Volumen, fehlende Daten, Konflikte (' + card.edge_cases.length + ')' }), h('div', { class: 'st-rc-list' }, card.edge_cases.map(row))]) : null,
      h('details', { class: 'st-details', style: { 'margin-top': '8px' } }, [h('summary', { text: 'Benötigte Daten' }), h('ul', null, card.required_data.map(function (d) { return h('li', { text: d.item + ' — ' + d.rules.join(', ') }); }))]),
    ]);
  }

  function ruleCard(r, srcMap) {
    return h('div', { class: 'st-rule' }, [
      h('div', { class: 'h' }, [h('span', { class: 'id', text: r.rule_id }), evidenceChip(r.evidence_status)]),
      h('p', { style: { margin: '6px 0 0' }, text: r.plain_language_explanation }),
      h('code', { text: r.machine_readable_definition }),
      h('div', { class: 'st-small', style: { 'margin-top': '6px' }, text: 'Quelle: ' + r.source_reference.map(function (id) { var x = srcMap[id]; return x ? x.title : id; }).join(' · ') + ' · v' + r.strategy_version }),
    ]);
  }
  function dnaTable(s, fields) {
    return h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'Feld' }), h('th', { text: 'Inhalt' }), h('th', { text: 'Evidenz' })])]), h('tbody', null, fields.map(function (k) {
      var v = s[k], text, ev = null;
      if (v && typeof v === 'object' && 'text' in v) { text = v.text + (v.rules && v.rules.length ? ' [' + v.rules.join(', ') + ']' : ''); ev = v.evidence; }
      else if (Array.isArray(v)) text = v.join(' · ');
      else if (v && typeof v === 'object') text = v.measured ? 'bei jedem Lauf gemessen (siehe Backtest / Datenabdeckung)' : 'noch nicht gemessen';
      else text = String(v);
      return h('tr', null, [h('td', { text: k }), h('td', { text: text }), h('td', null, [ev ? evidenceChip(ev) : ''])]);
    }))])]);
  }
  function lifecycleTable(s) {
    var m = s.lifecycle_mapping || {};
    return h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('tbody', null, Object.keys(STATE_LABEL).map(function (k) { return h('tr', null, [h('td', null, [stateTag(k)]), h('td', { text: m[k] || '–' })]); }))])]);
  }
  function scannerTable(rows, s) {
    if (!rows.length) return empty('Beobachtungsliste leer', 'Heute erfüllt kein Titel die Vorstufen.');
    return h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'Titel' }), h('th', { text: 'Status' }), h('th', { text: 'Warum' })])]), h('tbody', null, rows.map(function (r) {
      var x = Object.assign({ strategyId: s.strategy_id }, r);
      return h('tr', null, [h('td', null, [h('a', { href: stockUrl(r.symbol), text: r.symbol }), h('div', { class: 'st-small', text: r.companyName })]), h('td', null, [stateTag(r.stage)]), h('td', { text: whyText(x) })]);
    }))])]);
  }
  function historyTable(list, s) {
    if (!list.length) return empty('Noch keine abgeschlossenen Signale', 'Das Live-Protokoll hat gerade erst begonnen. Jedes Signal ab „Setup“ erscheint hier nach Abschluss oder Ungültigkeit — Gewinner wie Verlierer, dauerhaft.');
    return h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'Titel' }), h('th', { text: 'Status' }), h('th', { text: 'Eröffnet' }), h('th', { text: 'Ende' }), h('th', { text: 'Regel' }), h('th', { text: 'Live-Ergebnis' })])]), h('tbody', null, list.map(function (x) {
      var r = x.result && x.result.returnPct;
      return h('tr', null, [h('td', null, [h('a', { href: stockUrl(x.symbol), text: x.symbol })]), h('td', null, [stateTag(x.state)]), h('td', { text: dateDe(x.createdAt) }), h('td', { text: dateDe(lastT(x).date) }), h('td', { text: lastT(x).ruleId || '' }), h('td', { class: 'num ' + (r > 0 ? 'pos' : r < 0 ? 'neg' : ''), text: r === undefined || r === null ? '–' : pct(r, 1, true) })]);
    }))])]);
  }
  function sourcesBlock(s, srcMap) {
    return h('div', { class: 'st-grid g1' }, (s.sources || []).map(function (id) {
      var x = srcMap[id]; if (!x) return null;
      return h('div', { class: 'st-src' }, [
        h('strong', { text: x.title }),
        h('span', { class: 'st-small', text: [x.author, x.publisher_or_site, x.source_type, 'Level ' + (x.level || '–'), 'Zugang: ' + x.access].filter(Boolean).join(' · ') }),
        x.url ? h('a', { href: x.url, rel: 'noopener noreferrer', target: '_blank', text: x.url }) : h('span', { class: 'st-small', text: 'Keine dauerhafte URL gefunden — nicht als Beleg verwendet.' }),
        h('span', { class: 'st-small', text: 'Stützt: ' + x.claims_supported }),
        h('span', { class: 'st-chips' }, [evidenceChip(x.evidence_status_ceiling), chip(x.url_verification === 'SEARCH_RESULT_MATCH' ? 'URL per Suche bestätigt · ' + dateDe(x.retrieved_at) : x.url_verification)]),
      ]);
    }));
  }

  function gatesList(run) {
    return h('ul', { class: 'st-gates' }, run.gates.map(function (g) { return h('li', { class: g.pass ? 'pass' : 'fail' }, [h('span', { class: 'i', text: g.pass ? '✓' : '✕', 'aria-label': g.pass ? 'bestanden' : 'nicht bestanden' }), h('span', null, [g.label, h('span', { class: 'm', text: g.measured })])]); }));
  }
  function backtestPanel(runs, cov, s) {
    var run = runs.filter(function (r) { return r.active; })[0] || runs[0];
    if (!run) return empty('Kein Backtest definiert', '');
    var c = cov.coverage;
    var histYears = s.strategy_id === 'WEINSTEIN_STAGE' ? c.weeklyCloseYears : c.dailyOhlcvYears;
    return h('div', { class: 'st-grid g1 g2w' }, [
      h('div', { class: 'st-card' }, [
        h('div', { class: 'st-chips' }, [statusChip(run.status), chip(run.variantId)]),
        h('h3', { style: { 'margin': '12px 0 6px', 'font-size': '18px' }, text: run.metricsPublishable ? 'Backtest bereit' : 'Warum hier noch keine Rendite steht' }),
        h('p', { class: 'st-lead', text: run.metricsPublishable ? 'Alle Gates bestanden.' : 'Ein Backtest ohne delistete Titel, ohne historisches Universum und mit zu kurzer Historie würde systematisch zu gut aussehen. Supertrader zeigt deshalb keine Kennzahl, sondern die offenen Gates.' }),
        h('div', { class: 'st-small', style: { 'margin-top': '10px' }, text: 'Kurshistorie: ' + num(histYears, 1) + ' von mindestens ' + cov.minHistoryYears + ' Jahren' }),
        h('div', { class: 'st-progress', style: { 'margin-top': '6px' } }, [h('i', { style: { width: Math.min(100, (histYears || 0) / cov.minHistoryYears * 100) + '%' } })]),
        h('div', { class: 'st-grid g3', style: { 'margin-top': '14px' } }, ['CAGR', 'Max. Drawdown', 'Sharpe', 'Trefferquote', 'Profit Factor', 'Trust Score'].map(function (k) { return h('div', { class: 'st-tile', style: { 'min-height': '70px' } }, [h('div', { class: 'k', text: k }), (function () { var v = h('div', { class: 'd st-metric' }); v.innerHTML = '<span class="v locked">' + lockIcon() + 'gesperrt</span>'; return v; })()]); })),
        h('p', { class: 'st-small', style: { 'margin-top': '10px' }, text: 'Backtest-Chart, Drawdown und Performance nach Marktregime erscheinen erst nach bestandenen Gates. ' + run.trustScore.reason }),
        h('p', { class: 'st-small', text: 'Kontrollstrategien: ' + run.baselines.map(function (b) { return b.label; }).join(' · ') }),
      ]),
      h('div', null, [h('div', { class: 'st-kicker', style: { 'margin-bottom': '8px' }, text: 'Gates dieser Variante' }), gatesList(run)]),
    ]);
  }
  function variantsTable(s, runs) {
    return h('details', { class: 'st-details', style: { 'margin-top': '12px' } }, [h('summary', { text: 'Vorab definierte Varianten (' + s.variants.length + ') — keine nachträgliche Auswahl' }), h('div', null, [h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'Variante' }), h('th', { text: 'Beschreibung' }), h('th', { text: 'Live' }), h('th', { text: 'Status' })])]), h('tbody', null, s.variants.map(function (v) {
      var r = runs.filter(function (x) { return x.variantId === v.variant_id; })[0];
      return h('tr', null, [h('td', { text: v.variant_id }), h('td', { text: v.label + (v.vu_formalization ? ' · VU' : '') }), h('td', { text: v.active ? 'ja' : 'nein' }), h('td', null, [statusChip(r ? r.status : v.status)])]);
    }))])])])]);
  }
  function greenblattCoverage(cov) {
    var g = cov.greenblatt;
    return h('div', { class: 'st-card', style: { 'margin-top': '12px' } }, [
      h('h3', { style: { 'font-size': '16px', 'margin-bottom': '8px' }, text: 'Datenabdeckung Magic Formula (gemessen ' + dateDe(cov.asOf) + ')' }),
      h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'Pflichtfeld' }), h('th', { text: 'Regel' }), h('th', { text: 'Titel mit Wert' })])]), h('tbody', null, g.fieldCoverage.map(function (f) { return h('tr', null, [h('td', { text: f.role }), h('td', { text: f.rule }), h('td', { class: 'num ' + (f.available ? '' : 'neg'), text: f.available + ' / ' + g.universe }) ]); }))])]),
      h('p', { class: 'st-small', style: { 'margin-top': '8px' }, text: 'Zulässig nach Branche (keine Finanzwerte/Versorger): ' + g.eligible + ' · ausgeschlossen: ' + g.excludedFinancialsUtilities + ' · ohne Branchencode: ' + g.unknownSector + '. Earnings Yield wäre für ' + g.earningsYieldComputable + ' Titel berechenbar — ein halbes Ranking wird bewusst nicht gezeigt. ' + g.sectorNote }),
    ]);
  }

  /* ---------------------------------------------------- Signal-Chart */
  function mountSignalChart(host, s, strat) {
    if (!s.chart || !window.STChart) return;
    host.innerHTML = '';
    host.appendChild(h('div', { class: 'st-note', text: 'Chart wird geladen …' }));
    var weekly = s.strategyId === 'WEINSTEIN_STAGE';
    var p = weekly ? STChart.loadWeekly(s.chart.weeklyPath) : STChart.loadBars(s.chart.shard, s.symbol);
    p.then(function (bars) {
      host.innerHTML = '';
      host.appendChild(h('div', { class: 'st-kicker', style: { margin: '0 0 6px' }, text: s.symbol + ' · ' + (weekly ? 'Wochenschlusskurse' : 'Tageskerzen') + ' · ' + strat.world_name }));
      var box = h('div');
      host.appendChild(box);
      var lv = s.levels || {};
      var overlays = [], levels = [], boxes = [], markers = [];
      if (weekly) {
        overlays.push({ id: 'ma30w', label: '30-Wochen-Linie', color: 'var(--ma30w)', values: STChart.sma(bars.close, 30) });
      } else {
        var closes = bars.close;
        var mas = s.strategyId === 'MINERVINI_VCP' ? [[50, 'var(--ma50)', true], [150, 'var(--ma150)', true], [200, 'var(--ma200)', true]] : s.strategyId === 'MOMENTUM_BREAKOUT' ? [[10, 'var(--ma10)', true], [20, 'var(--ma20)', true], [50, 'var(--ma50)', false]] : [[50, 'var(--ma50)', false]];
        mas.forEach(function (m) { overlays.push({ id: 'ma' + m[0], label: m[0] + '-Tage-Linie', color: m[1], values: STChart.sma(closes, m[0]), on: m[2] }); });
      }
      var pAsOf = s.plan ? ' · geplant, Stand ' + dateDe(s.plan.trigger.dataAsOf) : ' · geplant';
      if (isFinite(lv.trigger)) levels.push({ id: 'trigger', label: (s.strategyId === 'WEINSTEIN_STAGE' ? 'Widerstand' : (s.strategyId === 'MINERVINI_VCP' ? 'Pivot' : 'Trigger')) + pAsOf, value: lv.trigger, color: '#fde047' });
      if (s.entry) levels.push({ id: 'entry', label: 'Modelleinstieg ' + dateDe(s.entry.date) + ' (Eröffnung)', value: s.entry.price, color: '#4ade80', dash: '2 3' });
      if (isFinite(s.stop)) levels.push({ id: 'stop', label: 'Stop (' + (s.stopRuleId || '') + ')', value: s.stop, color: '#e66767' });
      else if (isFinite(lv.invalidation)) levels.push({ id: 'inv', label: 'Ungültig unter' + pAsOf, value: lv.invalidation, color: '#e66767' });
      if (s.strategyId === 'DARVAS_BOX' && isFinite(lv.boxBottom)) boxes.push({ from: lv.boxTopDate, to: null, top: lv.boxTop, bottom: lv.boxBottom, color: '#ff7a1a', label: 'Darvas-Box (VU)' });
      if (s.strategyId === 'MOMENTUM_BREAKOUT' && lv.baseStartDate) boxes.push({ from: lv.baseStartDate, to: null, top: lv.baseHigh, bottom: lv.baseLow, color: '#2f7bff', label: 'Basis (VU)' });
      if (s.strategyId === 'WEINSTEIN_STAGE' && lv.baseStartDate) boxes.push({ from: nearestDate(bars.date, lv.baseStartDate), to: null, top: lv.resistance, bottom: lv.baseSupport, color: '#8b5cf6', label: 'Stage-1-Basis' });
      if (s.confirmation) markers.push({ date: s.confirmation.date, price: s.confirmation.close, kind: 'confirm' });
      if (s.entry) markers.push({ date: s.entry.date, price: s.entry.price, kind: 'entry' });
      (s.exits || []).forEach(function (x, i, arr) { markers.push({ date: x.date, price: x.price, kind: i < arr.length - 1 || x.fraction < 1 ? 'partial' : 'exit' }); });
      STChart.render(box, { bars: bars, mode: weekly ? 'line' : 'candles', window: weekly ? 156 : 130, overlays: overlays, levels: levels, boxes: boxes, markers: markers, showVolume: !weekly, title: s.symbol + ' mit Strategie-Overlays',
        status: (s.entry ? 'Modelleinstieg ▲ zur Eröffnung am ' + dateDe(s.entry.date) + '. ' : 'Noch kein Modelleinstieg — Trigger und Invalidation sind geplante Schwellen, keine Ausführungen. ') + weekly ? 'Wöchentliche Schlusskurse aus der kanonischen Langzeitreihe; Volumenprüfung nur, soweit Tagesdaten vorliegen.' : 'Split-adjustierte Tageskerzen der kanonischen Materialisierung (' + (bars.date.length) + ' Sitzungen, bis ' + dateDe(bars.date[bars.date.length - 1]) + '). Ältere Historie ist öffentlich nicht verfügbar und wird nicht vorgetäuscht.' });
    }).catch(function (e) {
      host.innerHTML = '';
      host.appendChild(empty('Chart nicht verfügbar', e && e.message === 'GZIP_DECOMPRESSION_UNSUPPORTED' ? 'Dieser Browser kann die komprimierten Kursdaten nicht entpacken.' : 'Die Kursdaten für diesen Titel konnten nicht geladen werden. Es wird kein Ersatzchart gezeichnet.'));
    });
  }
  function nearestDate(dates, d) { for (var i = 0; i < dates.length; i++) if (dates[i] >= d) return dates[i]; return dates[dates.length - 1]; }

  /* ============================================================ SIGNALS */
  function renderSignals(D) {
    var reg = D.registry, sig = D.signals;
    var S = stratById(reg);
    var params = new URLSearchParams(location.search);
    var f = { status: params.get('status') || 'LIVE', strategy: params.get('strategy') || '', horizon: params.get('horizon') || '', division: params.get('division') || '', rstatus: params.get('rstatus') || '', quality: params.get('quality') || '' };
    var rows = [];
    Object.keys(sig.strategies).forEach(function (id) {
      var st = sig.strategies[id];
      st.open.concat(st.closed, st.invalidated).forEach(function (x) { rows.push(x); });
      st.scanner.top.forEach(function (x) { rows.push(Object.assign({ strategyId: id, state: x.stage, scanner: true }, x)); });
    });
    main.appendChild(h('div', { class: 'st-hero st-hero-sm' }, [h('div', { class: 'st-kicker', text: 'Signalzentrum' }), h('h1', null, [h('span', { text: 'Signale' })]), h('p', { class: 'st-lead', text: 'Jeder Zustand entsteht aus einer deterministischen Regel. Ab „Einstieg vorbereitet“ wird jedes Signal mit allen Wechseln, Regelversion und Datenstand protokolliert — auch Verlierer, ungültige und durch neue Regelversionen abgelöste Setups.' })]));

    var groups = [['LIVE', 'Live'], ['BSETUP', 'Darvas B-Setups'], ['WATCH', 'Kandidaten'], ['SETUP', 'Vorbereitet'], ['ENTRY_READY', 'Nahe Trigger'], ['TRIGGERED', 'Einstieg bestätigt'], ['ACTIVE', 'Modellposition'], ['WARNING', 'Warnung'], ['EXIT', 'Ausstieg ausgelöst'], ['CLOSED', 'Geschlossen'], ['INVALIDATED', 'Ungültig']];
    var seg = h('div', { class: 'st-seg', role: 'group', 'aria-label': 'Status' });
    var list = h('div', { class: 'st-grid g1 g2w', style: { 'margin-top': '8px' } });
    var countNote = h('p', { class: 'st-note' });
    // B-Setups erscheinen nur im eigenen Reiter (oder mit Qualitätsfilter B),
    // damit das Signalzentrum nicht wie ein breiter Screener wirkt.
    function isB(x) { return !!(x.quality && x.quality.tier === 'B' && (x.state === 'SETUP' || x.state === 'ENTRY_READY')); }
    function matchStatus(x, s) {
      if (s === 'BSETUP') return !x.scanner && isB(x);
      if (isB(x) && f.quality !== 'B') return false;
      if (s === 'LIVE') return !x.scanner && LIVE_ORDER.indexOf(x.state) >= 0;
      if (s === 'WATCH') return x.scanner;
      return x.state === s && !x.scanner;
    }
    function sel(label, key, opts) {
      var s = h('select', { 'aria-label': label, onchange: function () { f[key] = s.value; update(); } }, [h('option', { value: '', text: label + ': alle' })].concat(opts.map(function (o) { return h('option', { value: o[0], text: o[1], selected: f[key] === o[0] ? true : null }); })));
      return s;
    }
    var core = reg.strategies.filter(function (s) { return !s.advanced; });
    var divisions = {}; rows.forEach(function (x) { if (x.sicDivision) divisions[x.sicDivision] = x.sicDivisionName || x.sicDivision; });
    var filters = h('div', { class: 'st-filters' }, [
      sel('Strategie', 'strategy', core.map(function (s) { return [s.strategy_id, s.world_name]; })),
      sel('Zeithorizont', 'horizon', [['daily', 'Tagesbasis (Swing)'], ['weekly', 'Wochenbasis (Position)']]),
      sel('Branche (SIC)', 'division', Object.keys(divisions).sort().map(function (k) { return [k, divisions[k]]; })),
      sel('Research-Status', 'rstatus', [['HYBRID_MODEL', 'Hybrid-Modell'], ['VU_FORMALIZATION', 'VU-Formalisierung'], ['RESEARCHED', 'Research abgeschlossen']]),
      sel('Qualität (Darvas)', 'quality', [['A', 'A-Setups'], ['B', 'B-Setups']]),
      h('select', { 'aria-label': 'Markt', disabled: true }, [h('option', { text: 'Markt: USA' })]),
      h('select', { 'aria-label': 'Marktregime', disabled: true }, [h('option', { text: 'Regime: ' + D.market.regime.label })]),
    ]);
    function update() {
      var base = rows.filter(function (x) {
        var s = S[x.strategyId];
        if (f.strategy && x.strategyId !== f.strategy) return false;
        if (f.horizon && (s.engine && s.engine.timeframe) !== f.horizon) return false;
        if (f.division && x.sicDivision !== f.division) return false;
        if (f.rstatus && s.product_status.indexOf(f.rstatus) < 0) return false;
        if (f.quality && !(x.quality && x.quality.tier === f.quality)) return false;
        return true;
      });
      seg.innerHTML = '';
      groups.forEach(function (g) {
        var n = base.filter(function (x) { return matchStatus(x, g[0]); }).length;
        seg.appendChild(h('button', { type: 'button', 'aria-pressed': String(f.status === g[0]), onclick: function () { f.status = g[0]; update(); } }, [g[1], h('span', { class: 'n', text: String(n) })]));
      });
      var shown = base.filter(function (x) { return matchStatus(x, f.status); }).sort(function (a, b) { return LIVE_ORDER.indexOf(a.state) - LIVE_ORDER.indexOf(b.state) || (lastT(b).date || '').localeCompare(lastT(a).date || ''); });
      list.innerHTML = '';
      countNote.textContent = shown.length + ' Einträge · Stand ' + dateDe(sig.asOf) + (f.status === 'WATCH' ? ' · Beobachtungsliste zeigt je Strategie die 60 stärksten Kandidaten; insgesamt ' + (sig.counts.WATCH) + ' „Beobachten“ und ' + sig.counts.DISCOVERED + ' „Entdeckt“.' : '');
      if (!shown.length) list.appendChild(empty('Keine Signale in dieser Auswahl', f.status === 'CLOSED' || f.status === 'INVALIDATED' ? 'Das Live-Protokoll läuft seit ' + dateDe(firstLive(sig)) + '. Abgeschlossene Signale erscheinen hier dauerhaft — es werden keine Ergebnisse rückwirkend erzeugt.' : 'Für diese Filter gibt es heute keinen Eintrag.'));
      shown.slice(0, 120).forEach(function (x) { list.appendChild(signalCard(x, S[x.strategyId])); });
      var q = new URLSearchParams(); Object.keys(f).forEach(function (k) { if (f[k] && !(k === 'status' && f[k] === 'LIVE')) q.set(k, f[k]); });
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    }
    main.appendChild(h('section', { class: 'st-section' }, [h('div', { class: 'st-banner', style: { 'margin-bottom': '12px' }, text: 'Alle Signale stammen aus nicht backtest-validierten Regelmodellen. Darvas-B-Setups sind gültig nach den Grundregeln, erfüllen aber nicht alle Qualitätskriterien.' }), filters, seg, countNote, list]));
    update();
    main.appendChild(disclaimer(sig));
  }
  function firstLive(sig) { var d = null; Object.keys(sig.strategies).forEach(function (k) { var l = sig.strategies[k].liveSince; if (l && (!d || l < d)) d = l; }); return d; }

  /* =========================================================== BACKTESTS */
  function renderBacktests(D) {
    var reg = D.registry, bt = D.backtests, cov = D.coverage;
    var core = reg.strategies.filter(function (s) { return !s.advanced; });
    var c = cov.coverage;
    main.appendChild(h('div', { class: 'st-hero st-hero-sm' }, [h('div', { class: 'st-kicker', text: 'Backtest Lab' }), h('h1', null, [h('span', { text: 'Backtests' })]), h('p', { class: 'st-lead', text: 'Keine Strategie gilt als erfolgreich, weil sie berühmt ist. Supertrader prüft jede vorab definierte Variante mit derselben Engine wie die Live-Signale — und zeigt eine Zahl erst, wenn die Datengrundlage sie trägt.' })]));

    main.appendChild(h('div', { class: 'st-banner', style: { 'margin-top': '18px' }, text: 'Stand heute: keine Strategie ist backtest-validiert, keine Variante besteht alle Datengates. Supertrader zeigt deshalb keine Rendite, keinen Drawdown, keine Trefferquote und keinen Trust Score.' }));
    main.appendChild(section('Warum noch keine Renditezahlen?', 'Ebene 1 · Im Klartext', [h('div', { class: 'st-grid g1 g2w' }, [
      h('div', { class: 'st-card' }, [h('h3', { style: { 'font-size': '17px', 'margin-bottom': '6px' }, text: 'Die Gewinner von heute verzerren die Vergangenheit' }), h('p', { class: 'st-lead', text: 'Wer nur Aktien testet, die es heute noch gibt, lässt Pleiten und Übernahmen aus. Das macht fast jede Strategie besser, als sie war. Die öffentlichen Artefakte enthalten ' + c.delistedWithPriceHistory + ' Kursreihen inaktiver Titel, aber keine aktive Survivorship-Kontrolle und nur ' + c.historicalMembershipDates + ' historische Stichtage der Indexzugehörigkeit.' })]),
      h('div', { class: 'st-card' }, [h('h3', { style: { 'font-size': '17px', 'margin-bottom': '6px' }, text: 'Ein Jahr ist kein Marktzyklus' }), h('p', { class: 'st-lead', text: 'Öffentlich liegen Tageskerzen für ' + num(c.dailyOhlcvYears, 1) + ' Jahre vor, Wochenschlusskurse für im Median ' + num(c.weeklyCloseYears, 1) + ' Jahre (ohne Volumen). Für Out-of-Sample- und Walk-forward-Tests verlangt Supertrader mindestens ' + cov.minHistoryYears + ' Jahre.' })]),
      h('div', { class: 'st-card' }, [h('h3', { style: { 'font-size': '17px', 'margin-bottom': '6px' }, text: 'Opening Range braucht Intraday-Historie' }), h('p', { class: 'st-lead', text: 'Kullamägis Original-Einstieg nutzt das Hoch der ersten 1, 5 oder 60 Minuten. Vorgehalten werden ' + c.intradaySessionsRetained + ' Sitzungen im 5-Minuten-Takt, nur Schlusskurse. Die ORH-Variante bleibt DATA_COVERAGE_PENDING.' })]),
      h('div', { class: 'st-card' }, [h('h3', { style: { 'font-size': '17px', 'margin-bottom': '6px' }, text: 'Value braucht Point-in-Time-Bilanzen' }), h('p', { class: 'st-lead', text: 'Greenblatt darf nur mit Zahlen rechnen, die am Stichtag bekannt waren. Öffentlich liegt eine Revisionshistorie für ' + c.pitFundamentalSymbols + ' Titel vor — und drei Pflichtfelder für Return on Capital fehlen ganz.' })]),
    ])]));

    main.appendChild(section('Strategien im Vergleich', 'Ebene 2 · Status je Variante', [compareList(core, bt, D.market)]));

    main.appendChild(section('Gates je Strategie', 'Ebene 3 · Methodik', core.map(function (s) {
      var runs = bt.runs.filter(function (r) { return r.strategyId === s.strategy_id; });
      return h('details', { class: 'st-details', style: { 'margin-bottom': '8px', 'border-left': '3px solid ' + s.theme.accent } }, [h('summary', null, [s.world_name, h('span', { class: 'st-chips' }, [statusChip((runs.filter(function (r) { return r.active; })[0] || runs[0]).status)])]), h('div', null, runs.map(function (r) {
        return h('div', { style: { 'margin-bottom': '14px' } }, [h('div', { class: 'st-chips', style: { 'margin-bottom': '6px' } }, [chip(r.variantId), statusChip(r.status), r.active ? chip('Live-Variante', 'info') : null]), h('p', { class: 'st-small', text: r.label }), r.gates.length ? gatesList(r) : h('p', { class: 'st-small', text: r.status === 'ADVANCED_RESEARCH' ? 'Research-Variante: noch keine Gate-Definition, daher keine Kennzahl.' : 'Keine Gate-Definition — nicht vergleichbar, keine Kennzahl.' })]);
      }))]);
    })));

    var ex = bt.execution;
    main.appendChild(section('Ausführungsannahmen und Validierungsdesign', null, [h('div', { class: 'st-grid g1 g2w' }, [
      h('div', { class: 'st-card' }, [h('h3', { style: { 'font-size': '16px', 'margin-bottom': '8px' }, text: 'Ausführung (' + ex.model + ')' }), h('ul', null, ex.rules.map(function (r) { return h('li', { text: r }); })), h('p', { class: 'st-small', text: 'Slippage ' + ex.slippageBpsPerSide + ' bp und Gebühren ' + ex.commissionBpsPerSide + ' bp je Seite.' })]),
      h('div', { class: 'st-card' }, [h('h3', { style: { 'font-size': '16px', 'margin-bottom': '8px' }, text: 'Validierung' }), h('dl', { class: 'st-kv' }, [
        h('dt', { text: 'In-Sample' }), h('dd', { text: (bt.validationDesign.inSampleShare * 100) + ' % des Zeitraums, nur zur Parameterdefinition' }),
        h('dt', { text: 'Out-of-Sample' }), h('dd', { text: bt.validationDesign.outOfSample }),
        h('dt', { text: 'Walk-forward' }), h('dd', { text: bt.validationDesign.walkForward }),
        h('dt', { text: 'Sensitivität' }), h('dd', { text: bt.validationDesign.sensitivity }),
        h('dt', { text: 'Benchmark' }), h('dd', { text: bt.validationDesign.benchmark }),
        h('dt', { text: 'Portfolio' }), h('dd', { text: 'Risiko ' + (bt.portfolioDefaults.riskPerTrade * 100) + ' % je Trade, max. ' + bt.portfolioDefaults.maxPositions + ' Positionen, max. ' + (bt.portfolioDefaults.maxPositionPct * 100) + ' % je Titel' }),
      ])]),
    ]), h('details', { class: 'st-details', style: { 'margin-top': '10px' } }, [h('summary', { text: 'Pflichtkennzahlen, sobald Gates bestanden sind (' + bt.requiredMetrics.length + ')' }), h('div', null, [h('div', { class: 'st-chips' }, bt.requiredMetrics.map(function (m) { return chip(m); }))])])]));
    main.appendChild(disclaimer());
  }

  /* ============================================================== STOCK */
  function renderStock(D) {
    var reg = D.registry, sig = D.signals;
    var S = stratById(reg);
    var sym = body.getAttribute('data-symbol') || new URLSearchParams(location.search).get('s') || '';
    sym = sym.toUpperCase();
    var entries = [];
    Object.keys(sig.strategies).forEach(function (id) {
      var st = sig.strategies[id];
      st.open.concat(st.closed, st.invalidated).forEach(function (x) { if (x.symbol === sym) entries.push(x); });
      st.scanner.top.forEach(function (x) { if (x.symbol === sym) entries.push(Object.assign({ strategyId: id, state: x.stage, scanner: true }, x)); });
    });
    var name = entries[0] ? entries[0].companyName : '';
    main.appendChild(h('div', { class: 'st-lens-head' }, [h('div', null, [h('div', { class: 'st-kicker', text: 'Strategy Lens' }), h('h1', { text: sym || '–' }), h('div', { class: 'co', text: name })]), h('div', { class: 'st-price', id: 'st-live' })]));
    if (!sym || !entries.length) {
      main.appendChild(section('Kein Supertrader-Modell erkennt diesen Titel', null, [empty('Aktuell nicht im Fokus', 'Kein Modell sieht heute ein Setup oder eine Beobachtung für ' + (sym || 'diesen Titel') + '. Die vollständige Aktienansicht bleibt in Discovery.'), h('a', { class: 'st-more', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym), text: 'In Discovery öffnen →' })]));
      main.appendChild(disclaimer(sig));
      return;
    }
    liveQuote(sym, D.market);
    var current = entries.filter(function (x) { return !x.scanner && LIVE_ORDER.indexOf(x.state) >= 0; });
    var pick = current[0] || entries[0];
    setWorld(S[pick.strategyId]);
    var tabs = h('div', { class: 'st-tabsx', role: 'tablist', 'aria-label': 'Strategien für ' + sym });
    var card = h('div');
    var chartHost = h('div', { style: { 'margin-top': '14px' } });
    function show(x) {
      var s = S[x.strategyId];
      setWorld(s);
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', String(b._x === x)); });
      card.innerHTML = '';
      card.appendChild(h('div', { class: 'st-grid g1 g2w' }, [x.plan ? h('div', { class: 'st-lens-plan', style: worldVars(s), 'aria-label': s.world_name + ' · Ein- und Ausstieg' }, [entryExitBlock(x, false), qualityBadge(x)]) : signalCard(x, s), h('div', { class: 'st-card' }, [
        h('div', { class: 'st-kicker', text: 'Warum wird die Aktie gezeigt?' }), h('p', { style: { 'margin-top': '6px' }, text: whyText(x) }),
        h('div', { class: 'st-kicker', style: { 'margin-top': '10px' }, text: 'Status' }), h('p', { style: { 'margin-top': '6px' }, text: stateSentence(x) }),
        x.plan ? h('p', { class: 'st-small', text: 'Ausstieg laut Regelkarte: ' + x.plan.exitSummary + '.' }) : null,
        x.levels && x.levels.stopPlan ? h('div', null, [h('div', { class: 'st-kicker', style: { 'margin-top': '10px' }, text: 'Risiko' }), h('p', { style: { 'margin-top': '6px' }, text: x.levels.stopPlan + '.' })]) : null,
        h('div', { class: 'st-kicker', style: { 'margin-top': '10px' }, text: 'Methodentreue' }), h('p', { style: { 'margin-top': '6px' }, text: fidelityText(s) }),
        x.fundamentalsDisplay ? h('p', { class: 'st-small', text: 'Fundamentals (nur Anzeige, kein Filter): Umsatzwachstum TTM ' + pct(x.fundamentalsDisplay.revenueGrowthTTM, 1, true) + ', Gewinnbeschleunigung ' + pct(x.fundamentalsDisplay.earningsAcceleration, 1, true) + ' · Stand ' + dateDe(x.fundamentalsDisplay.asOf) }) : null,
        rulesPassed(x, s),
        x.quality ? qualityList(x, s) : null,
      ])]));
      card.appendChild(h('div', { style: { 'margin-top': '12px' } }, [trustPanel(s)]));
      mountSignalChart(chartHost, x, s);
    }
    entries.forEach(function (x) {
      var s = S[x.strategyId];
      var b = h('button', { type: 'button', role: 'tab', style: worldVars(s), onclick: function () { show(x); } }, [s.world_name + ' · ' + (STATE_LABEL[x.state] || x.state)]);
      b._x = x; tabs.appendChild(b);
    });
    main.appendChild(tabs);
    main.appendChild(card);
    main.appendChild(chartHost);
    main.appendChild(section('Signalhistorie für ' + sym, null, [historyOf(entries, S)]));
    main.appendChild(h('p', { style: { 'margin-top': '18px' } }, [h('a', { class: 'st-more', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym), text: 'Vollständige Aktienansicht in Discovery →' })]));
    main.appendChild(disclaimer(sig));
    show(pick);
  }
  function fidelityText(s) {
    return { MOMENTUM_BREAKOUT: 'Momentumfilter, Stop- und Ausstiegsprinzip stammen aus Kullamägis Originalbeschreibung; die automatische Erkennung der „engen Basis“ und der Daily-Trigger sind Vision-Universe-Formalisierungen.', DARVAS_BOX: 'Ausbruch über die Box und nachgezogener Stop sind mehrfach belegt; die konkrete Boxdefinition (3-Sitzungen-Bestätigung) ist eine VU-Variante — nicht die „originale Darvas-Formel“.', MINERVINI_VCP: 'Das Trend Template ist breit belegt; die automatische VCP-Erkennung ist eine VU-Formalisierung und ersetzt nicht Minervinis Charturteil (HYBRID).', WEINSTEIN_STAGE: 'Vier Phasen und 30-Wochen-Linie sind mehrfach belegt; die Schwellen des Stage-Klassifikators sind VU-Formalisierung.', GREENBLATT_VALUE: 'Portfoliomechanik laut offizieller Website; Kennzahlenformel mehrfach bestätigt.' }[s.strategy_id] || '';
  }
  function rulesPassed(x, s) {
    if (!x.rules) return null;
    var byId = {}; s.rules.forEach(function (r) { byId[r.rule_id] = r; });
    return h('div', { style: { 'margin-top': '10px' } }, [h('div', { class: 'st-kicker', text: 'Geprüfte Regeln' }), h('ul', { class: 'st-gates', style: { 'margin-top': '6px' } }, Object.keys(x.rules).map(function (k) {
      var r = byId[k];
      return h('li', { class: x.rules[k] ? 'pass' : 'fail' }, [h('span', { class: 'i', text: x.rules[k] ? '✓' : '✕' }), h('span', null, [k, h('span', { class: 'm', text: r ? r.plain_language_explanation : '' })])]);
    }))]);
  }
  function qualityList(x, s) {
    var byId = {}; s.rules.forEach(function (r) { byId[r.rule_id] = r; });
    var q = x.quality;
    return h('div', { style: { 'margin-top': '10px' } }, [h('div', { class: 'st-kicker', text: (QLABEL[q.label] || 'Qualitätsstufe ' + q.tier) + ' (VU, nicht validiert)' }), h('ul', { class: 'st-gates', style: { 'margin-top': '6px' } }, Object.keys(q.criteria).map(function (k) {
      var v = q.criteria[k];
      return h('li', { class: v === true ? 'pass' : v === false ? 'fail' : 'open' }, [h('span', { class: 'i', text: v === true ? '✓' : v === false ? '✕' : '…' }), h('span', null, [(s.quality_tiers && s.quality_tiers.labels && s.quality_tiers.labels[k]) || k, h('span', { class: 'm', text: k + (v === null && k === 'DAR-Q-VOL' ? (q.phase === 'CONFIRMED' ? ' · Volumen fehlt — nicht prüfbar' : ' · wird am Bestätigungstag geprüft') : '') + (k === 'DAR-Q-REGIME' ? ' · VU-Sperre, kein Darvas-Original' : '') })])]);
    }))]);
  }
  function historyOf(entries, S) {
    var persisted = entries.filter(function (x) { return !x.scanner; });
    if (!persisted.length) return empty('Noch keine protokollierten Signale', 'Für diesen Titel gibt es bisher nur Beobachtungen. Protokolliert wird ab „Einstieg vorbereitet“.');
    return h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'Datum' }), h('th', { text: 'Strategie' }), h('th', { text: 'Zustand' }), h('th', { text: 'Regel' }), h('th', { text: 'Kurs' })])]), h('tbody', null, [].concat.apply([], persisted.map(function (x) {
      return x.transitions.map(function (t) { return h('tr', null, [h('td', { text: dateDe(t.date) }), h('td', { text: S[x.strategyId].world_name }), h('td', null, [stateTag(t.state)]), h('td', { text: t.ruleId + ' · v' + (t.ruleVersion || x.version) + (t.ruleId === 'LC-VERSION-RETIRED' ? ' · durch neue Regelversion abgelöst' : ''), title: t.note || null }), h('td', { class: 'num', text: num(t.price) + (t.priceBasis ? ' ' + (BASIS_TEXT[t.priceBasis] || t.priceBasis) : '') })]); });
    })).sort(function (a, b) { return 0; }))])]);
  }
  // Letzter Kurs aus der bestehenden Discovery-Intraday-Auslieferung (IEX,
  // verzoegert). Nur Anzeige — Signale bleiben auf Tagesschlussbasis.
  function liveQuote(sym, market) {
    var slot = document.getElementById('st-live');
    fetch('/quant/data/market/intraday/index.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (idx) {
      var e = idx.entries && idx.entries[sym];
      if (!e || !e.path) throw 0;
      return fetch(e.path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (snap) {
        var pts = snap.points || []; if (!pts.length) throw 0;
        var last = pts[pts.length - 1];
        var live = e.freshnessState === 'LIVE' && !snap.regularComplete;
        slot.innerHTML = '';
        slot.appendChild(document.createTextNode(num(last[1]) + ' USD '));
        slot.appendChild(chip(live ? 'IEX, verzögert · ' + last[0] + ' ET' : 'Letzter Stand ' + dateDe(snap.sessionDate) + ' ' + last[0] + ' ET', live ? 'info' : ''));
      });
    }).catch(function () {
      slot.innerHTML = '';
      slot.appendChild(chip('Letzter Handelstag ' + dateDe(market.session.lastCompletedSession)));
    });
  }

  /* ============================================================ SOURCES */
  function renderSources(D) {
    var reg = D.registry, src = D.sources;
    main.appendChild(h('div', { class: 'st-hero st-hero-sm' }, [h('div', { class: 'st-kicker', text: 'Quellen & Methodik' }), h('h1', null, [h('span', { text: 'Quellen' })]), h('p', { class: 'st-lead', text: src.policy })]));
    main.appendChild(h('div', { class: 'st-banner', style: { 'margin-top': '18px' }, text: src.retrievalNote }));
    var used = {}; reg.strategies.forEach(function (s) { (s.sources || []).forEach(function (id) { (used[id] = used[id] || []).push(s.world_name); }); });
    main.appendChild(section('Source Ledger (' + src.sources.length + ')', 'Dauerhafte Quellen', [h('div', { class: 'st-table-wrap' }, [h('table', { class: 'st-table' }, [h('thead', null, [h('tr', null, [h('th', { text: 'ID' }), h('th', { text: 'Quelle' }), h('th', { text: 'Typ / Level' }), h('th', { text: 'Evidenz' }), h('th', { text: 'Verwendet in' })])]), h('tbody', null, src.sources.map(function (x) {
      return h('tr', null, [h('td', { text: x.source_id }), h('td', null, [h('strong', { text: x.title }), h('div', { class: 'st-small', text: [x.author, x.publisher_or_site].filter(Boolean).join(' · ') }), x.url ? h('a', { href: x.url, rel: 'noopener noreferrer', target: '_blank', class: 'st-small', style: { color: 'var(--st-info)' }, text: x.url }) : h('div', { class: 'st-small', text: 'keine URL' }), h('div', { class: 'st-small', text: x.claims_supported })]), h('td', { text: x.source_type + ' · ' + (x.level || '–') + ' · ' + x.access }), h('td', null, [evidenceChip(x.evidence_status_ceiling)]), h('td', { text: (used[x.source_id] || []).join(', ') })]);
    }))])])]));
    main.appendChild(section('Offene Source-Fidelity-Entscheidungen', 'Owner', [h('p', { class: 'st-lead', text: 'Folgende Primärwerke sind nur bibliografisch oder als Vorschau zugänglich. Solange sie nicht legal vorliegen, bleiben die betroffenen Detailregeln als VU-Formalisierung oder „umstritten“ markiert.' }), h('ul', null, ['Mark Minervini — Trade Like a Stock Market Wizard / Think & Trade Like a Champion (Trend-Template-Grenzen, VCP-Details, Stops, Progressive Exposure)', 'Nicolas Darvas — How I Made $2,000,000 in the Stock Market (Boxdefinition, Stops, Pyramiding)', 'Stan Weinstein — Secrets for Profiting in Bull and Bear Markets (Stage-Grenzen, Volumen, Stops)', 'Joel Greenblatt — The Little Book That (Still) Beats the Market (Accounting-Anpassungen)', 'Schwager/Coyle — Market Wizards: The Next Generation (nur Vorschau; nicht vollständig gelesen)'].map(function (t) { return h('li', { text: t }); }))]));
    main.appendChild(section('Datenfluss', 'Architektur', [h('div', { class: 'st-flow' }, ['Discovery-Datenarchitektur', 'kanonische Artefakte (read-only)', 'Supertrader Build (Regeln, Gates)', 'supertrader/data', 'Supertrader-Oberfläche'].map(function (t, i, a) { return [h('span', { text: t }), i < a.length - 1 ? h('b', { text: '→' }) : null]; }).reduce(function (a, b) { return a.concat(b); }, [])), h('p', { class: 'st-note', style: { 'margin-top': '10px' }, text: 'Keine neue Datenpipeline, keine zweite Fundamentals-Normalisierung, keine neuen Anbieter oder Secrets. Discovery und Quant 2.0 bleiben unverändert.' })]));
    main.appendChild(disclaimer());
  }

  /* ============================================================== Boot */
  var NEEDS = { home: ['registry', 'signals', 'market', 'backtests', 'coverage'], strategies: ['registry', 'backtests', 'coverage'], strategy: ['registry', 'signals', 'backtests', 'coverage', 'sources', 'market'], signals: ['registry', 'signals', 'market', 'backtests', 'coverage'], backtests: ['registry', 'backtests', 'coverage', 'market'], stock: ['registry', 'signals', 'market', 'backtests', 'coverage'], sources: ['registry', 'sources'] };
  var need = NEEDS[page] || ['registry'];
  Promise.all(need.map(function (n) { return getJSON(n + '.json'); })).then(function (res) {
    var D = {}; need.forEach(function (n, i) { D[n] = res[i]; });
    TRUST.bt = D.backtests || null; TRUST.cov = D.coverage || null;
    chrome((D.signals && D.signals.asOf) || (D.coverage && D.coverage.asOf) || null);
    ({ home: renderHome, strategies: renderStrategies, strategy: renderStrategy, signals: renderSignals, backtests: renderBacktests, stock: renderStock, sources: renderSources }[page] || renderHome)(D);
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }).catch(function (e) {
    main.innerHTML = '';
    main.appendChild(empty('Supertrader konnte nicht geladen werden', 'Die Strategie-Artefakte sind gerade nicht erreichbar (' + (e && e.message) + '). Es werden keine Ersatzdaten angezeigt.'));
  });
})();
