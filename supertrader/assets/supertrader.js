/* Vision Universe® — Supertrader (Oberfläche, Runde 4)
   Eigenständiges Produkt. Liest ausschließlich die Supertrader-Artefakte
   (supertrader/data/*.json) und — für Charts — die kanonischen Kursartefakte
   über st-chart.js. Signale, Zustände, Teilprüfungen und Backtests entstehen
   deterministisch im Build; der Browser rechnet nichts davon nach. */
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
  function dateShort(d) { if (!d) return '–'; var p = String(d).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.'; }
  function byId(list, key) { var m = {}; (list || []).forEach(function (x) { m[x[key]] = x; }); return m; }
  function worldVars(s) { return s && s.theme ? { '--w': s.theme.accent, '--w2': s.theme.accent2 } : null; }
  function setWorld(s) { if (!s || !s.theme) return; document.documentElement.style.setProperty('--world', s.theme.accent); document.documentElement.style.setProperty('--world-2', s.theme.accent2); }
  function stratUrl(s) { return BASE + 'strategies/' + s.slug + '/'; }
  function stockUrl(sym) { return BASE + 'stock/' + encodeURIComponent(sym) + '/'; }
  function icon(path, cls) { var i = h('span', { class: 'st-ic' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }); i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; return i; }
  var IC = { check: '<path d="M5 12l5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', dash: '<path d="M6 12h12"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', arrow: '<path d="M9 6l6 6-6 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>' };

  /* ------------------------------------------- Produktsprache (Kunde) */
  // Phasen: strikt getrennt. „Nahe am Trigger“ ist Vorbereitung, kein Einstieg.
  var PHASE = {
    DISCOVERED: ['cand', 'Kandidat'], WATCH: ['cand', 'Kandidat'],
    SETUP: ['prep', 'Vorbereitet'], ENTRY_READY: ['prep', 'Vorbereitet · nahe Trigger'],
    TRIGGERED: ['conf', 'Einstieg bestätigt'], ACTIVE: ['pos', 'Modellposition aktiv'], WARNING: ['warn', 'Position · Warnung'],
    EXIT: ['exit', 'Ausstieg ausgelöst'], CLOSED: ['closed', 'Geschlossen'], INVALIDATED: ['inv', 'Ungültig'],
    PARTIAL: ['partial', 'Teiltreffer'], RETIRED: ['inv', 'Regelwechsel'], REASSESSED: ['inv', 'Regelwechsel'],
  };
  var PHASE_FILTERS = [['', 'Alle aktuellen'], ['prep', 'Vorbereitet'], ['watch', 'Beobachtung'], ['conf', 'Bestätigt'], ['pos', 'Position'], ['exit', 'Ausstieg'], ['obs', 'Forschung'], ['cand', 'Kandidaten'], ['partial', 'Teiltreffer'], ['closed', 'Geschlossen'], ['inv', 'Ungültig']];
  var PHASE_ORDER = ['conf', 'pos', 'warn', 'exit', 'prep', 'partial', 'watch', 'obs', 'cand', 'closed', 'inv'];
  function phaseOfState(st) { return (PHASE[st] || ['cand'])[0]; }
  function phaseBadge(st) { var p = PHASE[st] || [st, st]; return h('span', { class: 'st-phase', 'data-p': p[0], text: p[1] }); }
  // Methoden, deren wartende Setups eine breite Beobachtungsliste sind (Registry:
  // pending_semantics = WATCHLIST) - nie als „vorbereiteter Einstieg“ gezaehlt.
  var WATCH = {};
  function isWatch(s) { return !!(s && WATCH[s.strategyId] && !s.entry && (s.state === 'SETUP' || s.state === 'ENTRY_READY')); }
  function isObs(s) { return !!(s && isResearchId(s.strategyId) && !s.entry && s.state !== 'TRIGGERED' && (s.state === 'SETUP' || s.state === 'ENTRY_READY')); }
  function phaseKey(s) { return isObs(s) ? 'obs' : isWatch(s) ? 'watch' : phaseOfState(s.state || s.stage); }
  function badgeFor(s) {
    if (isObs(s)) return h('span', { class: 'st-phase', 'data-p': 'obs', text: 'Modellbeobachtung' });
    return isWatch(s) ? h('span', { class: 'st-phase', 'data-p': 'watch', text: WATCH[s.strategyId] }) : phaseBadge(s.state || s.stage);
  }
  // Regelcodes bleiben im Protokoll (title), sichtbar ist Kundensprache.
  function ruleText(id) {
    if (!id) return '';
    var lc = { 'LC-SETUP': 'Setup erkannt', 'LC-NEAR-TRIGGER': 'nahe am Trigger', 'LC-AWAY-FROM-TRIGGER': 'weiter vom Trigger entfernt', 'LC-MODEL-ENTRY': 'Modelleinstieg zur Eröffnung', 'LC-SETUP-LOST': 'Setup-Bedingungen verloren', 'LC-VERSION-RETIRED': 'Regelwechsel – neu bewertet', 'LC-OPEN-BELOW-STOP': 'Eröffnung unter dem Stop – kein Einstieg', 'LC-ACTIVE': 'Position läuft', 'LC-WARN': 'Warnsignal', 'LC-DATA-GAP': 'Kursdaten fehlen' };
    if (lc[id]) return lc[id];
    if (/-ENTRY-|-CONF/.test(id)) return 'Schluss über dem Trigger';
    if (/-STOP-/.test(id)) return 'Stop ausgelöst';
    if (/-EXIT-/.test(id)) return 'Ausstiegsregel';
    if (/-INV-/.test(id)) return 'Setup ungültig';
    if (/-WARN-/.test(id)) return 'Warnsignal';
    return 'Regel';
  }
  var MODE = { LIVE: ['Läuft live', 'good'], MODEL: ['Modelldepot · monatlich', 'good'], PARTIAL_CHECK: ['Teilprüfung', 'warn'], DATA_PENDING: ['Daten fehlen', 'bad'], RESEARCH: ['In Vorbereitung', 'mute'] };
  var SOURCE_SHORT = {
    ORIGINAL_PRINCIPLES_VU_EXECUTION: ['Original + VU-Umsetzung', 'good'], PRIMARY_RULES_VU_TRANSFER: ['Originalregeln + VU-Übertragung', 'good'],
    SECONDARY_SOURCES_VU_THRESHOLDS: ['Sekundärquellen + VU-Schwellen', 'warn'], SECONDARY_SOURCES_VU_BOX_DEFINITION: ['Sekundärquellen + VU-Boxen', 'warn'],
    EXIT_NOT_SOURCE_BACKED: ['Ausstieg nicht belegt', 'bad'], OFFICIAL_SITE_AND_REPLICATIONS: ['Offizielle Quelle', 'good'],
    SECONDARY_SOURCES_VU_PROXIES: ['Sekundärquellen + Ersatzgrößen', 'warn'], PRIMARY_SIGNALS_PARTIAL_DATA: ['Primärquelle, Daten lückenhaft', 'warn'],
  };
  function card0(s) { return (s.rule_cards || [])[0] || null; }
  function modeOf(s) { return MODE[s.mode] || MODE.RESEARCH; }
  // Migration Phase 1: Produktklasse (VU Adaptation / VU Native) im Namen und als Kennzeichen; Herkunftsklassen kommen aus registry.provenanceClasses.
  var PROVLAB = {};
  var PRODUCT_TONE = { REPLICATION: 'good', VU_ADAPTATION: 'info', VU_NATIVE: 'info' };
  function prod(s) { return (s && s.product) || null; }
  function niceName(s) { var p = prod(s); return p ? p.display_name : s.world_name; }
  function productTag(s) { var p = prod(s); return p ? h('span', { class: 'st-tag', 'data-t': PRODUCT_TONE[p.product_class] || 'info', text: p.product_class_label }) : null; }
  // Evidenz je Strategieversion (registry.evidence): Stufe, Quellen- und
  // Datenqualitaet getrennt; presentation entscheidet ueber Hervorhebung.
  function ev(s) { return (s && s.evidence) || { level: 'NOT_TESTED', levelLabel: 'Noch nicht geprüft', levelTone: 'mute', presentation: 'CURRENT', source: { label: 'Noch nicht erfasst', tone: 'mute' }, data: { label: '–', tone: 'mute' } }; }
  function isResearchS(s) { return ev(s).presentation === 'RESEARCH'; }
  var RESEARCH = {}, HAS_CURRENT = true;
  function isResearchId(id) { return !!RESEARCH[id]; }
  function historyOf(s) { var e = ev(s); return [e.levelLabel, e.levelTone]; }
  function sourceOf(s) { var e = ev(s); return [e.source.label, e.source.tone]; }
  function dataOf(s) { var e = ev(s); return [e.data.label, e.data.tone]; }
  function pill(label, val) { return h('span', { class: 'st-pill', 'data-t': val[1] }, [h('span', { class: 'k', text: label }), h('span', { class: 'v', text: val[0] })]); }
  var FSTAT = { SOURCE_FAITHFUL: ['Quellentreu', 'good'], VU_VARIANT: ['VU-Variante', 'warn'], PARTIAL_CHECK: ['Teilprüfung', 'warn'], RESEARCH: ['Forschung', 'mute'] };
  function fidelityOf(s) { var f = s.fidelity; return f && FSTAT[f.status] ? FSTAT[f.status] : sourceOf(s); }
  function threeStatus(s) { var p = prod(s); return h('div', { class: 'st-three' }, [p ? pill('Produkt', [p.product_class_label, PRODUCT_TONE[p.product_class] || 'info']) : null, pill('Regel', modeOf(s)), pill('Methodentreue', fidelityOf(s)), pill('Daten', dataOf(s)), pill('Evidenz', historyOf(s))]); }
  function evidenceTag(s) { var e = ev(s); return h('span', { class: 'st-tag', 'data-t': e.levelTone, text: e.levelLabel }); }
  function researchTag() { return h('span', { class: 'st-note-tag research', text: 'Forschung' }); }

  /* -------------------------------------------------- Datenstand */
  function tradingDaysBetween(a, b) {
    if (!a || !b || b <= a) return 0;
    var d = new Date(a + 'T12:00:00Z'), end = new Date(b + 'T12:00:00Z'), n = 0;
    while (d < end) { d.setUTCDate(d.getUTCDate() + 1); var w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }
  function staleness(D) { return tradingDaysBetween(D.signals.asOf, D.market.session && D.market.session.lastCompletedSession); }
  function freshness(D, full) {
    var asOf = D.signals.asOf, last = D.market.session && D.market.session.lastCompletedSession;
    var lag = tradingDaysBetween(asOf, last);
    var stale = lag > 0;
    var detail = stale ? 'Letzter abgeschlossener Handelstag: ' + dateDe(last) + '. Die Tageskurse sind noch nicht nachgezogen; alle Signale gelten für den ' + dateDe(asOf) + '.' : 'Signale auf Tagesschlussbasis des letzten Handelstags.';
    var head = stale ? 'Kurse vom ' + dateShort(asOf) + ' — ' + lag + ' Handelstag' + (lag === 1 ? '' : 'e') + ' alt' : 'Kurse vom ' + dateShort(asOf) + ' · aktuell';
    if (full && lag >= 3) return h('div', { class: 'st-fresh stale' }, [icon(IC.clock), h('div', null, [h('strong', { text: head }), h('span', { text: detail })])]);
    var d = h('details', { class: 'st-fresh mini' + (stale ? ' stale' : '') }, [h('summary', null, [icon(IC.clock), h('strong', { text: head })]), h('span', { text: detail })]);
    return d;
  }

  /* -------------------------------------------- Setup-Leiste (visuell) */
  // Invalidation (links) — aktueller Kurs — Trigger (rechts). Bei Positionen:
  // Stop — Einstieg — aktueller Kurs.
  function setupBar(s) {
    var p = s.plan || {}, lv = s.levels || {};
    var last = p.lastPrice ? p.lastPrice.value : s.lastPrice;
    if (s.entry && isFinite(s.stop)) {
      var lo = Math.min(s.stop, last, s.entry.price), hi = Math.max(s.stop, last, s.entry.price) * 1.02;
      var pos = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); };
      return h('div', { class: 'st-bar2 pos', role: 'img', 'aria-label': 'Stop ' + num(s.stop) + ', Einstieg ' + num(s.entry.price) + ', Kurs ' + num(last) }, [
        h('div', { class: 'track' }, [h('i', { class: 'm stop', style: { left: pos(s.stop) + '%' } }), h('i', { class: 'm entry', style: { left: pos(s.entry.price) + '%' } }), h('i', { class: 'm now', style: { left: pos(last) + '%' } })]),
        h('div', { class: 'lbl' }, [h('span', { class: 'bad', text: 'Stop ' + num(s.stop) }), h('span', { text: 'Einstieg ' + num(s.entry.price) }), h('span', { class: 'now', text: 'Kurs ' + num(last) })]),
      ]);
    }
    var trig = lv.trigger, inv = lv.invalidation;
    if (!isFinite(trig) || !isFinite(inv) || !isFinite(last)) return null;
    var lo2 = Math.min(inv, last), hi2 = Math.max(trig, last);
    var span = hi2 - lo2 || 1;
    var at = Math.max(0, Math.min(100, (last - lo2) / span * 100));
    var toTrig = trig / last - 1, toInv = inv / last - 1;
    return h('div', { class: 'st-bar2', role: 'img', 'aria-label': 'Kurs ' + num(last) + ', Trigger ' + num(trig) + ' (' + pct(toTrig, 1, true) + '), Ungültig unter ' + num(inv) }, [
      h('div', { class: 'track' }, [h('i', { class: 'fill', style: { width: at + '%' } }), h('i', { class: 'm now', style: { left: at + '%' } })]),
      h('div', { class: 'lbl' }, [h('span', { class: 'bad', text: 'Ungültig ' + num(inv) }), h('span', { class: 'now', text: s.state === 'TRIGGERED' ? 'Einstieg zur nächsten Eröffnung' : toTrig < 0.0005 ? 'am Trigger' : pct(toTrig, 1, true) + ' bis Trigger' }), h('span', { class: 'trig', text: 'Trigger ' + num(trig) })]),
    ]);
  }

  /* ------------------------------------------------------- Karten */
  function shortWhy(s) {
    var f = s.facts || {}, lv = s.levels || {};
    switch (s.strategyId) {
      case 'MOMENTUM_BREAKOUT': return f.baseLength ? 'Top-Momentum (Perzentil ' + num(f.momentumPercentile, 0) + '), ' + f.baseLength + ' Tage enge Basis nach ' + pct(f.priorRun, 0, true) : 'Top-Momentum (Perzentil ' + num(f.momentumPercentile, 0) + ')';
      case 'MINERVINI_VCP': return 'Trend Template erfüllt, RS ' + num(f.rsPercentile, 0) + (f.contractions ? ', ' + f.contractions.length + ' Kontraktionen' : '');
      case 'DARVAS_BOX': return lv.boxBottom ? 'Box ' + num(lv.boxBottom) + '–' + num(lv.boxTop) + ' (' + pct(f.boxHeight, 0) + ' hoch) nahe dem Jahreshoch' : 'Nahe dem 52-Wochen-Hoch';
      case 'WEINSTEIN_STAGE': return 'Stage-1-Basis' + (f.baseWeeks ? ' seit ' + f.baseWeeks + ' Wochen' : '') + ', relative Stärke ' + pct(f.rsChange13w, 0, true);
      case 'DONCHIAN_TURTLE': return (f.distanceToTrigger < 0.0005 ? 'Schluss am 20-Tage-Hoch (noch nicht darüber)' : pct(f.distanceToTrigger, 1) + ' unter dem 20-Tage-Hoch') + ' · Tagesspanne N ' + pct(f.atr20Pct, 1);
      default: return '';
    }
  }
  var QLABEL = { A_CANDIDATE: 'A-Kandidat', B_SETUP: 'B-Setup', A_ENTRY: 'A-Einstieg', B_ENTRY: 'B-Einstieg' };
  function stockCard(s, strat) {
    var st = s.state || s.stage;
    var q = s.quality ? h('span', { class: 'st-q', 'data-q': s.quality.tier, text: QLABEL[s.quality.label] || s.quality.tier }) : null;
    var re = s.discovery && s.discovery.kind === 'RULE_VERSION_REASSESSMENT' ? h('span', { class: 'st-note-tag', text: 'Neubewertung' }) : null;
    var res = st === 'CLOSED' && s.result ? h('div', { class: 'st-res' + (s.result.returnPct >= 0 ? ' up' : ' down') }, [h('strong', { text: pct(s.result.returnPct, 1, true) }), ' Modellergebnis · ' + (s.result.sessionsHeld || 0) + ' Sitzungen']) : null;
    return h('a', { class: 'st-card2', href: stockUrl(s.symbol), style: worldVars(strat) }, [
      h('div', { class: 'r1' }, [h('span', { class: 'sym', text: s.symbol }), badgeFor(s)]),
      h('div', { class: 'r2' }, [h('span', { class: 'meth', text: strat.world_name }), isResearchS(strat) ? researchTag() : null, q, re, h('span', { class: 'nm', text: s.companyName && s.companyName !== s.symbol ? s.companyName : '' })]),
      res || setupBar(s),
      h('div', { class: 'why', text: shortWhy(s) }),
    ]);
  }
  var CRIT_STATUS = { PASS: ['ok', '✓'], FAIL: ['no', '✕'], NO_DATA: ['nd', '?'], NOT_AVAILABLE: ['na', '–'], DISPLAY_ONLY: ['info', 'i'] };
  function critDots(criteria, order) {
    return h('div', { class: 'st-dots' }, order.map(function (k) { var c = criteria[k] || { status: 'NO_DATA' }; var m = CRIT_STATUS[c.status] || CRIT_STATUS.NO_DATA; return h('span', { class: 'd ' + m[0], title: k + ': ' + c.status }, [h('b', { text: k }), h('i', { text: m[1] })]); }));
  }
  function partialCard(row, strat, kind) {
    var isCS = kind === 'CANSLIM';
    var line = isCS
      ? 'Quartalsgewinn ' + pct(row.criteria.C.value, 0, true) + ' · 3-J.-Wachstum ' + pct(row.criteria.A.value, 0) + ' p. a. · RS ' + (row.criteria.L.value != null ? row.criteria.L.value : '–')
      : 'Teil-Score ' + row.partialScore + ' von 8 · Buch/Markt ' + num(row.bookToMarket, 2) + ' · GJ bis ' + dateShort(row.fiscalYearEnd);
    return h('a', { class: 'st-card2 partial', href: stockUrl(row.symbol), style: worldVars(strat) }, [
      h('div', { class: 'r1' }, [h('span', { class: 'sym', text: row.symbol }), phaseBadge('PARTIAL')]),
      h('div', { class: 'r2' }, [h('span', { class: 'meth', text: strat.world_name }), h('span', { class: 'nm', text: row.name || '' })]),
      isCS ? critDots(row.criteria, ['C', 'A', 'N', 'S', 'L', 'I', 'M']) : critDots(row.signals, ['ROA', 'CFO', 'DROA', 'ACCRUAL', 'DLEVER', 'DLIQUID', 'EQ_OFFER', 'DMARGIN', 'DTURN']),
      h('div', { class: 'why', text: line }),
    ]);
  }

  /* -------------------------------------------- Mini-Liniendiagramm */
  function lineChart(series, opts) {
    opts = opts || {};
    var W = 340, H = opts.height || 170, pl = 6, pr = 44, pt = 10, pb = 22;
    var all = [];
    series.forEach(function (s) { s.points.forEach(function (p) { if (p[1] > 0) all.push(p); }); });
    if (!all.length) return null;
    var dates = all.map(function (p) { return p[0]; }).sort();
    var d0 = new Date(dates[0]).getTime(), d1 = new Date(dates[dates.length - 1]).getTime();
    var vals = all.map(function (p) { return Math.log(p[1]); });
    var v0 = Math.min.apply(null, vals), v1 = Math.max.apply(null, vals);
    var x = function (d) { return pl + (new Date(d).getTime() - d0) / (d1 - d0) * (W - pl - pr); };
    var y = function (v) { return pt + (1 - (Math.log(v) - v0) / (v1 - v0 || 1)) * (H - pt - pb); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (opts.label || 'Verlauf') + '">';
    [0.25, 0.5, 1, 2, 4, 8, 16].forEach(function (g) { var lv = Math.log(g); if (lv < v0 || lv > v1) return; var yy = y(g); svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" class="grid"/><text x="' + (W - pr + 4) + '" y="' + (yy + 3) + '" class="ax">' + (g >= 1 ? g + '×' : num(g, 2) + '×') + '</text>'; });
    var years = {}; dates.forEach(function (d) { years[d.slice(0, 4)] = d; });
    Object.keys(years).forEach(function (yr) { if (+yr % 5 !== 0) return; var xx = x(yr + '-01-01'); if (xx < pl || xx > W - pr) return; svg += '<text x="' + xx + '" y="' + (H - 6) + '" class="ax" text-anchor="middle">' + yr + '</text>'; });
    // Linienfarbe als style (nicht als Attribut), damit CSS-Variablen beim
    // Wechsel des Farbschemas ohne Neuzeichnen greifen.
    series.forEach(function (s) {
      var d = ''; s.points.forEach(function (p, i) { if (!(p[1] > 0)) return; d += (d ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); });
      svg += '<path d="' + d + '" fill="none" style="stroke:' + s.color + '" stroke-width="' + (s.width || 2) + '" stroke-linejoin="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
    });
    svg += '</svg>';
    var box = h('div', { class: 'st-line' }); box.innerHTML = svg;
    return h('figure', { class: 'st-fig' }, [box, h('figcaption', { class: 'st-legend' }, series.map(function (s) { return h('span', null, [h('i', { style: { background: s.color } }), s.label]); }))]);
  }

  /* ------------------------------------------------ Grundbausteine */
  function sec(title, kids, opts) {
    opts = opts || {};
    return h('section', { class: 'st-sec', id: opts.id || null }, [h('div', { class: 'st-sec-h' }, [h('div', null, [opts.kicker ? h('div', { class: 'st-kick', text: opts.kicker }) : null, h('h2', { text: title })]), opts.more || null])].concat(kids));
  }
  function more(href, text) { return h('a', { class: 'st-more', href: href }, [text, icon(IC.arrow)]); }
  /* Link zur Discover-Aktienseite nur, wenn der Build sie nicht als fehlend
     ausweist (signals.discoverAvailability). Sonst ein Hinweis statt eines toten
     Links - das Signal selbst bleibt sichtbar. */
  var DISCOVER_UNAVAILABLE_TEXT = 'Aktienansicht vorübergehend nicht verfügbar – Daten werden geprüft.';
  function discoverLink(sym, sig, label) {
    var av = sig && sig.discoverAvailability;
    if (av && (av.unavailable || []).indexOf(sym) >= 0) return h('p', { class: 'st-hint', 'data-discover': 'unavailable', text: DISCOVER_UNAVAILABLE_TEXT });
    return h('p', null, [h('a', { class: 'st-more', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, [label, icon(IC.arrow)])]);
  }
  function emptyBox(title, text) { return h('div', { class: 'st-emptybox' }, [h('strong', { text: title }), h('p', { text: text })]); }
  function details(summary, kids, open) { var d = h('details', { class: 'st-det' }, [h('summary', { text: summary })].concat(kids)); if (open) d.open = true; return d; }
  function disclaimer(sig) {
    return h('footer', { class: 'st-foot' }, [
      h('p', { text: (sig && sig.disclaimer) || 'Modellsignale einer regelbasierten Strategie-Nachbildung. Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.' }),
      h('p', { text: 'Modellpositionen sind Simulationen nach festen Regeln — keine realen Orders. Kursdaten aus der Discovery-Dateninfrastruktur (Tiingo, split-adjustiert).' }),
    ]);
  }

  /* --------------------------------------------- Kopf & Navigation
     Kopf und Produkt-Leiste kommen aus der gemeinsamen Vision-Universe-Shell
     (assets/site-navigation.js): Supertrader | Methoden | Signale |
     Backtests | ☰. Supertrader traegt nur noch seine Produktzeile im
     Inhalt: Name, Kursstand und der Weg zu den Quellen. */
  function chrome(asOf) {
    var line = h('div', { class: 'st-productline' }, [
      h('a', { class: 'st-logo', href: BASE, 'aria-label': 'Supertrader Start' }, [h('i'), 'SUPERTRADER']),
      h('span', { class: 'st-stamp', text: asOf ? 'Kurse ' + dateShort(asOf) : '' }),
      h('a', { class: 'st-productlink', href: BASE + 'sources/', 'aria-current': page === 'sources' ? 'page' : null, text: 'Quellen' }),
    ]);
    if (page !== 'home') main.insertBefore(line, main.firstChild);
    // Produkt-Leiste der gemeinsamen Shell anfordern (aktiver Eintrag aus dem Pfad)
    if (window.VUNavigation) window.VUNavigation.dock({});
  }

  /* ============================================== Datenaufbereitung */
  function stratMap(reg) { return byId(reg.strategies, 'strategy_id'); }
  function openSignals(sig) { var out = []; Object.keys(sig.strategies).forEach(function (id) { sig.strategies[id].open.forEach(function (s) { out.push(s); }); }); return out; }
  function isB(s) { return !!(s.quality && s.quality.tier === 'B' && (s.state === 'SETUP' || s.state === 'ENTRY_READY')); }
  function dist(s) { return s.facts && isFinite(s.facts.distanceToTrigger) ? s.facts.distanceToTrigger : (s.levels && s.lastPrice ? s.levels.trigger / s.lastPrice - 1 : 9); }
  function sortSignals(a, b) { return PHASE_ORDER.indexOf(phaseKey(a)) - PHASE_ORDER.indexOf(phaseKey(b)) || dist(a) - dist(b); }

  /* ============================================================ START */
  function renderHome(D) {
    var reg = D.registry, sig = D.signals, S = stratMap(reg);
    var live = reg.strategies.filter(function (s) { return s.mode === 'LIVE'; });
    var current = live.filter(function (s) { return !isResearchS(s); });
    var research = live.filter(isResearchS);
    var partial = reg.strategies.filter(function (s) { return s.mode === 'PARTIAL_CHECK'; });
    var pending = reg.strategies.filter(function (s) { return s.mode === 'DATA_PENDING' || s.mode === 'RESEARCH'; });
    var all = openSignals(sig);
    var open = all.filter(function (s) { return !isResearchId(s.strategyId); });
    var resOpen = all.filter(function (s) { return isResearchId(s.strategyId); });
    var positions = open.filter(function (s) { return s.entry; });
    var confirmed = open.filter(function (s) { return s.state === 'TRIGGERED'; });
    var closed = 0; Object.keys(sig.strategies).forEach(function (k) { if (!isResearchId(k)) closed += sig.strategies[k].closed.length; });
    var stale = staleness(D) >= 2;

    main.appendChild(h('header', { class: 'st-hero st-home-hero vu-product-hero' }, [
      h('span', { class: 'vu-product-icon vu-product-icon--hero', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><use href="/assets/product-icons.svg#supertrader"></use></svg>' }),
      h('div', { class: 'vu-product-eyebrow', text: 'Vision Universe Supertrader' }),
      h('h1', { class: 'vu-product-title', text: 'Methoden. Setups. Klare Regeln.' }),
      h('p', { class: 'st-lead vu-product-lead', text: 'Welche Aktien regelbasierte Methoden heute beobachten, was als Nächstes passieren müsste – und wie belastbar jede Methode ist.' }),
      h('div', { class: 'vu-product-hero__actions' }, [
        h('a', { class: 'vu-product-action', href: BASE + 'strategies/' }, ['Methoden entdecken', icon(IC.arrow)]),
        h('a', { class: 'vu-product-action vu-product-action--secondary', href: BASE + 'signals/', text: 'Signale ansehen' }),
      ]),
      h('nav', { class: 'st-hero-quick', 'aria-label': 'Supertrader Schnellzugriff' }, [
        h('a', { class: 'vu-product-chip', href: BASE + 'backtests/', text: 'Backtests & Evidenz' }),
        h('a', { class: 'vu-product-chip', href: BASE + 'sources/', text: 'Quellen' }),
      ]),
    ]));
    main.appendChild(freshness(D, true));

    if (!current.length) { renderObservationHome(D, research, partial, pending, S); return; }
    // Status auf einen Blick (nur Methoden mit aktuellen Setups)
    var prepList = open.filter(function (s) { return !s.entry && s.state !== 'TRIGGERED' && !isB(s) && !isWatch(s); });
    var byM = {}; prepList.forEach(function (s) { byM[s.strategyId] = (byM[s.strategyId] || 0) + 1; });
    var prepSub = Object.keys(byM).sort(function (a, b) { return byM[b] - byM[a]; }).map(function (k) { return byM[k] + ' ' + (S[k] ? S[k].world_name : k); }).join(' · ');
    var tiles = [
      [String(prepList.length), 'Vorbereitete Einstiege', 'prep', stale ? 'Kurse veraltet – nicht hervorgehoben' : (prepSub || 'keine')],
      [String(confirmed.length) + ' / ' + String(positions.length), 'Bestätigt / Positionen', 'conf', 'Einstiege per Schlusskurs'],
      [String(closed), 'Geschlossene Trades', 'closed'],
    ];
    if (research.length) tiles.push([String(resOpen.filter(function (s) { return s.entry; }).length), 'Forschung · Modellpositionen', 'obs', research.map(function (s) { return s.world_name; }).join(' · ') + ' – weiter protokolliert']);
    main.appendChild(h('div', { class: 'st-kpis' }, tiles.map(function (t) { return h('a', { class: 'st-kpi', 'data-p': t[2], href: t[2] === 'obs' ? stratUrl(research[0]) : BASE + 'signals/?phase=' + t[2] }, [h('strong', { text: t[0] }), h('span', { text: t[1] }), t[3] ? h('em', { text: t[3] }) : null]); })));
    if (D.replay) main.appendChild(replayTeaser(D.replay));

    // Methoden mit aktuellen Setups
    main.appendChild(sec('Methoden', [
      h('div', { class: 'st-rail' }, current.concat(reg.strategies.filter(function (x) { return x.mode === 'MODEL'; }), partial).map(function (s) { return methodTile(s, D); })),
      pending.length ? h('p', { class: 'st-hint' }, ['In Vorbereitung (keine Signale): ' + pending.map(function (s) { return s.world_name; }).join(' · ') + '. ', h('a', { href: BASE + 'strategies/#vorbereitung', text: 'Warum?' })]) : null,
    ], { kicker: current.length + ' mit aktuellen Setups · ' + partial.length + ' Teilprüfung', more: more(BASE + 'strategies/', 'Vergleichen') }));

    // Nahe am Einstieg - nur Methoden mit aktuellen Setups, nie auf veralteten Kursen
    var near = open.filter(function (s) { return (s.state === 'ENTRY_READY' || s.state === 'TRIGGERED') && !isB(s) && !isWatch(s); }).sort(sortSignals);
    var perMethod = {}, pick = [];
    near.forEach(function (s) { perMethod[s.strategyId] = (perMethod[s.strategyId] || 0) + 1; if (perMethod[s.strategyId] <= 2) pick.push(s); });
    main.appendChild(sec('Am nächsten am Einstieg', [
      stale ? emptyBox('Kurse noch nicht aktuell', 'Die Tageskurse sind älter als ein Handelstag. Supertrader hebt auf veralteten Kursen keine Einstiege hervor; die Setups bleiben unter Signale einsehbar.')
        : pick.length ? h('div', { class: 'st-list' }, pick.slice(0, 8).map(function (s) { return stockCard(s, S[s.strategyId]); })) : emptyBox('Kein Setup nahe am Trigger', 'Keine Methode mit aktuellen Setups sieht heute ein Setup innerhalb von 3 % vor dem Trigger.'),
    ], { kicker: 'Vorbereitet heißt: noch kein Einstieg', more: more(BASE + 'signals/?phase=prep', 'Alle') }));

    // Laufende Modellpositionen (simuliert, keine Orders)
    if (positions.length) {
      var posSorted = positions.slice().sort(function (a, b) { return (b.entry.date || '').localeCompare(a.entry.date || '') || a.symbol.localeCompare(b.symbol); });
      main.appendChild(sec('Modellpositionen', [
        h('p', { class: 'st-hint', text: 'Modelleinstieg nach der Regel der jeweiligen Version: Momentum, Weinstein, Darvas und Turtle per Kauf-Stop am Ausbruchspunkt im Tagesverlauf, Minervini nach einem Schlusskurs über dem Pivot zur nächsten Eröffnung. Das ist die Umsetzung von Vision Universe auf Tageskursen, nicht überall wörtlich die Regel des Traders. Simulation, keine Orders.' }),
        h('div', { class: 'st-list' }, posSorted.slice(0, 3).map(function (x) { return stockCard(x, S[x.strategyId]); })),
      ], { kicker: 'Live seit ' + dateDe(firstLive(sig)), more: more(BASE + 'signals/?phase=pos', 'Alle ' + positions.length) }));
    }

    // Forschung: auffindbar, nicht hervorgehoben
    if (research.length) main.appendChild(sec('Forschung · Modellbeobachtung', research.map(function (s) {
      var st = sig.strategies[s.strategy_id] || { open: [], closed: [] };
      var pos = st.open.filter(function (x) { return x.entry; }).length, obs = st.open.filter(function (x) { return !x.entry; }).length;
      return h('a', { class: 'st-research', href: stratUrl(s), style: worldVars(s) }, [
        h('div', { class: 'r1' }, [h('strong', { text: s.world_name }), evidenceTag(s)]),
        h('p', { text: 'Neue Setups sind Modellbeobachtungen, keine Einstiegschancen. ' + pos + ' laufende Modellpositionen werden nach Regelversion ' + (ev(s).version || s.strategy_version) + ' weiter geführt; ' + obs + ' Setups in Beobachtung.' }),
      ]);
    }), { kicker: 'Weiter protokolliert, nicht hervorgehoben' }));

    // Teiltreffer CAN SLIM
    var cs = sig.partialChecks && sig.partialChecks.CANSLIM;
    if (cs && S.CANSLIM) main.appendChild(sec('CAN SLIM — Teiltreffer', [
      h('p', { class: 'st-hint', text: cs.counts.partialMatch + ' Aktien erfüllen alle 5 prüfbaren Kriterien. „I“ (Institutionen) ist nicht prüfbar — deshalb Teiltreffer, kein CAN-SLIM-Signal.' }),
      h('div', { class: 'st-list' }, cs.candidates.slice(0, 3).map(function (r) { return partialCard(r, S.CANSLIM, 'CANSLIM'); })),
    ], { kicker: 'Teilprüfung', more: more(stratUrl(S.CANSLIM), 'Alle ' + cs.counts.partialMatch) }));

    // Evidenz je Methode
    main.appendChild(sec('Wie belastbar ist welche Methode?', [evidenceList(reg.strategies.filter(function (s) { return s.mode !== 'RESEARCH'; })), h('p', { class: 'st-hint', text: (reg.evidenceScale && reg.evidenceScale.noPromise) || '' })], { kicker: 'Evidenz je Regelversion', more: more(BASE + 'backtests/', 'Details') }));
    main.appendChild(disclaimer(sig));
  }
  // Startseite, wenn keine Regelversion einen belegten Vorteil hat: alle laufenden
  // Methoden sind Modellbeobachtung. Kein Einstieg wird als Chance hervorgehoben.
  function renderObservationHome(D, research, partial, pending, S) {
    var reg = D.registry, sig = D.signals, stale = staleness(D) >= 2;
    main.appendChild(h('div', { class: 'st-evbanner', 'data-t': 'warn' }, [
      h('div', { class: 'h' }, [h('span', { class: 'k', text: 'Stand der Evidenz' }), h('span', { class: 'st-tag', 'data-t': 'warn', text: 'In Prüfung' })]),
      h('p', { class: 'res', text: 'Für keine laufende Regelversion ist bisher ein Vorteil belegt. Alle Methoden laufen deshalb als Modellbeobachtung: Setups, bestätigte Einstiege, Positionen und Ausstiege werden nach festen Regeln protokolliert – als Forschung, nicht als Empfehlung oder Einstiegschance.' }),
      h('p', { class: 'np', text: (reg.evidenceScale && reg.evidenceScale.noPromise) || '' }),
    ]));
    main.appendChild(sec('Was die Modelle gerade beobachten', research.map(function (s) {
      var st = sig.strategies[s.strategy_id] || { open: [], closed: [] };
      var prep = st.open.filter(function (x) { return !x.entry && x.state !== 'TRIGGERED'; }).length, conf = st.open.filter(function (x) { return x.state === 'TRIGGERED'; }).length, pos = st.open.filter(function (x) { return x.entry; }).length;
      return h('a', { class: 'st-research', href: stratUrl(s), style: worldVars(s) }, [
        h('div', { class: 'r1' }, [h('strong', { text: s.world_name }), evidenceTag(s)]),
        h('p', { text: s.tagline }),
        h('span', { class: 'st-obsmeta', text: (s.fidelity ? s.fidelity.statusLabel + ' · ' : '') + 'Regel v' + s.strategy_version }),
        h('div', { class: 'st-obsnums' }, [obsNum(prep, 'in Vorbereitung'), obsNum(conf, 'Einstieg bestätigt'), obsNum(pos, 'Modellpositionen'), obsNum(st.closed.length, 'geschlossen')]),
      ]);
    }), { kicker: stale ? 'Kurse veraltet – Stand ' + dateDe(sig.asOf) : 'Modellbeobachtung · Kurse vom ' + dateDe(sig.asOf), more: more(BASE + 'signals/', 'Alle Signale') }));
    var models = reg.strategies.filter(function (x) { return x.mode === 'MODEL'; });
    if (models.length) main.appendChild(sec('Modelldepots', [h('div', { class: 'st-rail' }, models.map(function (x) { return methodTile(x, D); }))], { kicker: 'Monatliche Umschichtung · Positionen, Orders und Gründe' }));
    if (D.replay) main.appendChild(replayTeaser(D.replay));
    if (partial.length) main.appendChild(sec('Teilprüfung', [h('div', { class: 'st-rail' }, partial.map(function (s) { return methodTile(s, D); })),
      pending.length ? h('p', { class: 'st-hint' }, ['In Vorbereitung (keine Signale): ' + pending.map(function (s) { return s.world_name; }).join(' · ') + '. ', h('a', { href: BASE + 'strategies/#vorbereitung', text: 'Warum?' })]) : null], { kicker: 'Kandidaten ohne Ein- und Ausstieg' }));
    main.appendChild(sec('Wie belastbar ist welche Methode?', [evidenceList(reg.strategies.filter(function (s) { return s.mode !== 'RESEARCH'; }))], { kicker: 'Evidenz je Regelversion', more: more(BASE + 'backtests/', 'Details') }));
    main.appendChild(disclaimer(sig));
  }
  function obsNum(n, label) { return h('span', null, [h('strong', { text: String(n) }), label]); }
  function evidenceList(list) {
    return h('div', { class: 'st-evlist' }, list.map(function (s) {
      return h('a', { class: 'st-evrow', href: stratUrl(s), style: worldVars(s) }, [h('span', { class: 'n', text: s.world_name + ' v' + (ev(s).version || s.strategy_version) }), evidenceTag(s)]);
    }));
  }
  function firstLive(sig) { var d = null; Object.keys(sig.strategies).forEach(function (k) { var l = sig.strategies[k].liveSince; if (l && (!d || l < d)) d = l; }); return d; }

  function countFor(s, D) {
    var sig = D.signals;
    if (s.mode === 'MODEL') { var t = D.trend52; if (!t) return [null, '']; return t.portfolio.used ? [t.portfolio.used, 'im Modelldepot'] : [t.prepared.candidates.length, 'Kandidaten']; }
    if (s.mode === 'PARTIAL_CHECK') { var pc = sig.partialChecks && sig.partialChecks[s.strategy_id]; return pc ? [pc.counts.partialMatch != null ? pc.counts.partialMatch : pc.counts.candidates, 'Teiltreffer'] : [0, 'Teiltreffer']; }
    var st = sig.strategies[s.strategy_id];
    if (!st) return [null, ''];
    if (isResearchS(s)) return [st.open.filter(function (x) { return x.entry; }).length, 'Modellpositionen'];
    if (WATCH[s.strategy_id]) return [st.open.filter(isWatch).length, 'in Beobachtung'];
    var prep = st.open.filter(function (x) { return !x.entry && x.state !== 'TRIGGERED' && !isB(x); }).length;
    return [prep, 'vorbereitet'];
  }
  function methodTile(s, D) {
    var c = countFor(s, D), m = modeOf(s);
    return h('a', { class: 'st-mtile', href: stratUrl(s), style: worldVars(s) }, [
      h('div', { class: 'top' }, [h('span', { class: 'mode', 'data-t': m[1], text: m[0] }), c[0] !== null ? h('span', { class: 'cnt' }, [h('strong', { text: String(c[0]) }), ' ' + c[1]]) : null]),
      h('h3', { text: niceName(s) }),
      h('p', { text: s.tagline }),
      h('div', { class: 'ev' }, [productTag(s), evidenceTag(s)]),
    ]);
  }

  /* ======================================================== METHODEN */
  function renderStrategies(D) {
    var reg = D.registry;
    main.appendChild(h('header', { class: 'st-hero sm' }, [h('div', { class: 'st-kick', text: 'Methoden vergleichen' }), h('h1', { text: 'Was sucht welche Methode?' }), h('p', { class: 'st-lead', text: 'Jede Methode zeigt drei getrennte Aussagen: ob ihre Regeln laufen, wie gut ihre Quellen sind und ob sie historisch geprüft ist.' })]));
    var groups = [['LIVE', 'Aktuelle Setups — mit Ein- und Ausstiegen'], ['LIVE_RESEARCH', 'Forschung · Modellbeobachtung — weiter protokolliert, nicht hervorgehoben'], ['MODEL', 'Modelldepots — monatliche Umschichtung, Positionen mit Begründung'], ['PARTIAL_CHECK', 'Teilprüfung — Kandidaten ohne Signale'], ['DATA_PENDING', 'Regeln beschrieben — Daten fehlen'], ['RESEARCH', 'In Vorbereitung']];
    groups.forEach(function (g) {
      var list = reg.strategies.filter(function (s) { return g[0] === 'LIVE' ? s.mode === 'LIVE' && !isResearchS(s) : g[0] === 'LIVE_RESEARCH' ? s.mode === 'LIVE' && isResearchS(s) : s.mode === g[0]; });
      if (!list.length) return;
      main.appendChild(sec(g[1], [h('div', { class: 'st-list' }, list.map(function (s) { return g[0] === 'RESEARCH' ? researchRow(s) : compareCard(s, D); }))], { id: g[0] === 'RESEARCH' || g[0] === 'DATA_PENDING' ? 'vorbereitung' : null }));
    });
    main.appendChild(disclaimer(D.signals));
  }
  function sectionText(card, id) { var x = card && (card.sections || []).filter(function (q) { return q.id === id; })[0]; return x ? x.text : null; }
  function compareCard(s, D) {
    var c = card0(s), cnt = countFor(s, D);
    var rows = [
      ['Sucht', s.how_it_thinks && s.how_it_thinks[0] ? s.how_it_thinks.slice(0, 2).join(' ') : s.tagline],
      ['Daten', c && c.required_data ? c.required_data.map(function (d) { return d.item; }).join(' · ') : '–'],
      ['Evidenz', ev(s).levelLabel + (ev(s).note ? ' – ' + ev(s).note : '')],
      ['Einstieg vorbereitet', s.mode === 'LIVE' || s.mode === 'MODEL' ? sectionText(c, 'prepared') : (s.mode === 'PARTIAL_CHECK' ? 'Keine Ein- und Ausstiege — nur Teilprüfung der Kriterien.' : 'Erst wenn die Daten vorliegen.')],
      ['Setup endet', s.mode === 'MODEL' ? 'Ausstieg: ' + (c.plan ? c.plan.exitSummary : '') : s.mode === 'LIVE' ? (sectionText(c, 'invalid') + ' Ausstieg: ' + (c.plan ? c.plan.exitSummary : '')) : (c && c.executable && c.executable.gaps ? 'Offen: ' + c.executable.gaps.join(' · ') : '–')],
    ];
    return h('a', { class: 'st-cmp', href: stratUrl(s), style: worldVars(s) }, [
      h('div', { class: 'top' }, [h('div', null, [h('h3', { text: niceName(s) }), h('div', { class: 'who', text: s.originator })]), cnt[0] !== null ? h('div', { class: 'cnt' }, [h('strong', { text: String(cnt[0]) }), h('span', { text: cnt[1] })]) : null]),
      threeStatus(s),
      h('dl', null, [].concat.apply([], rows.map(function (r) { return [h('dt', { text: r[0] }), h('dd', { text: r[1] || '–' })]; }))),
    ]);
  }
  function researchRow(s) {
    return h('a', { class: 'st-rrow', href: stratUrl(s) }, [h('div', null, [h('strong', { text: s.world_name }), h('span', { text: s.tagline })]), icon(IC.arrow)]);
  }

  /* =================================================== METHODE (Detail) */
  function renderStrategy(D) {
    var id = body.getAttribute('data-strategy');
    var reg = D.registry, sig = D.signals, S = stratMap(reg), s = S[id];
    if (!s) { main.appendChild(emptyBox('Methode nicht gefunden', 'Diese Methode ist nicht in der Registry.')); return; }
    setWorld(s);
    PROVLAB = (D.registry && D.registry.provenanceClasses) || {};
    var c = card0(s);
    main.appendChild(h('header', { class: 'st-hero sm world' }, [
      h('div', { class: 'st-kick', text: s.originator }),
      h('h1', { text: niceName(s) }),
      h('p', { class: 'st-lead', text: s.tagline }),
      threeStatus(s),
    ]));
    if (s.mode !== 'RESEARCH') main.appendChild(evidenceBanner(s, D));
    if (prod(s)) main.appendChild(productBlock(s, D));
    if (s.fidelity && s.fidelity.rules && s.fidelity.rules.length) main.appendChild(fidelityBanner(s));

    if (s.mode === 'RESEARCH') {
      main.appendChild(sec('Noch keine Strategie — nur eine Namenskarte', [h('p', { class: 'st-p', text: s.story }), h('p', { class: 'st-hint', text: 'Es gibt keine Regeln, keine Kandidaten und keine Signale. Supertrader stellt diese Methode nicht als fertige Strategiewelt dar.' })]));
      main.appendChild(disclaimer(sig)); return;
    }

    // So funktioniert's
    main.appendChild(sec('So denkt die Methode', [h('p', { class: 'st-p', text: s.story }), s.mode === 'LIVE' ? steps(s, c) : null], { kicker: s.strategy_family }));

    if (s.mode === 'LIVE') { var mp = D.portfolio && D.portfolio.strategies[s.strategy_id]; if (mp) main.appendChild(portfolioSection(mp, s, D)); renderLiveMethod(D, s, c); }
    else if (s.mode === 'MODEL') renderModelMethod(D, s, c);
    else if (s.mode === 'PARTIAL_CHECK') renderPartialMethod(D, s, c);
    else main.appendChild(sec('Warum heute keine Kandidaten?', [emptyBox('Pflichtdaten fehlen', (c && c.activationCondition) || 'Die Methode braucht Daten, die noch nicht vorliegen.'), c ? gapList(c) : null]));

    if (s.fidelity && s.fidelity.rules && s.fidelity.rules.length) main.appendChild(sec('Was stammt vom Trader, was von Vision Universe?', [fidelityList(s, D)], { kicker: 'Methodentreue je Regel' }));
    if (s.research_versions && s.research_versions.length) main.appendChild(sec('Geprüft, aber nicht live', [h('ul', { class: 'st-ul' }, s.research_versions.map(function (x) { return h('li', { text: 'Version ' + x.version + ' (Runde ' + x.round + ', ' + (x.status === 'WITHDRAWN' ? 'zurückgenommen' : 'Forschung') + '): ' + x.note }); })),
      h('p', { class: 'st-hint', text: 'Live läuft Version ' + s.strategy_version + '. Offene Setups und Positionen älterer Versionen laufen unter ihrer ursprünglichen Regelversion weiter.' })], { kicker: 'Versionslinie' }));
    if (s.processChain) { var PCL = { DOCUMENTED_VARIANT: ['dokumentierte Variante', 'info'], OPERATIONALIZATION: ['umgesetzt', 'info'], VU_EXTENSION: ['VU-Annahme', 'warn'], MISSING: ['fehlt', 'mute'] };
      main.appendChild(sec('Vom Kandidaten bis zur Portfoliorendite', [h('ol', { class: 'st-chain' }, s.processChain.steps.map(function (x) { var pl = PROVLAB[x.cls], c = pl ? [pl.label + (x.cls === 'FOREIGN_RULE' && x.from ? ': ' + x.from : ''), pl.tone] : (PCL[x.cls] || [x.cls, 'mute']); return h('li', null, [h('div', { class: 'h' }, [h('strong', { text: x.step }), h('span', { class: 'st-tag', 'data-t': c[1], text: c[0] })]), h('p', { text: x.rule }), h('p', { class: 'st-hint', text: 'Quelle: ' + x.source })]); })),
        s.processChain.finding ? h('p', { class: 'st-p', text: s.processChain.finding }) : null], { kicker: 'Prozesskette v' + s.processChain.version + ' · Regel, Quelle, Herkunft' })); }
    // Drei Aussagen im Detail
    if (c) main.appendChild(sec('Was ist belegt?', [assessments(s, c, D)], { kicker: 'Regel · Quellen · Daten · Evidenz' }));
    // Details
    main.appendChild(sec('Methodendetails', [
      c ? details('Regelkarte (' + c.sections.length + ' Abschnitte, v' + c.rule_version + ')', [ruleCardList(c)]) : null,
      c && c.edge_cases && c.edge_cases.length ? details('Gaps, fehlende Daten, Konflikte', [ruleCardList({ sections: c.edge_cases })]) : null,
      rulesBlock(s, D),
      s.prohibited_interpretations && s.prohibited_interpretations.length ? details('Was diese Methode nicht ist', [h('ul', { class: 'st-ul' }, s.prohibited_interpretations.map(function (p) { return h('li', { text: p }); }))]) : null,
      details('Quellen', [h('ul', { class: 'st-ul' }, (s.sources || []).map(function (sid) { var x = D.srcMap[sid]; return h('li', null, [x && x.url ? h('a', { href: x.url, rel: 'noopener', target: '_blank', text: x.title }) : (x ? x.title : sid), x ? ' — ' + x.author : '']); }))]),
      h('p', { class: 'st-hint', text: s.track_record_note || '' }),
    ]));
    main.appendChild(disclaimer(sig));
  }
  // Methodentreue (registry.fidelity): Produktstatus und Einordnung je Regel.
  var FCLS = { ORIGINAL: 'good', DOCUMENTED_VARIANT: 'info', OPERATIONALIZATION: 'info', VU_EXTENSION: 'warn', UNBACKED: 'bad', MISSING: 'mute' };
  function fidelityBanner(s) {
    var f = s.fidelity, n = f.counts || {};
    var parts = [['ORIGINAL', 'Original'], ['DOCUMENTED_VARIANT', 'dokumentierte Variante'], ['OPERATIONALIZATION', 'umgesetzt'], ['VU_EXTENSION', 'VU-eigen'], ['UNBACKED', 'unbelegt'], ['MISSING', 'fehlt']].filter(function (x) { return n[x[0]]; });
    return h('div', { class: 'st-fidban', 'data-s': f.status }, [
      h('div', { class: 'h' }, [h('span', { class: 'k', text: 'Methodentreue' }), h('strong', { text: f.statusLabel })]),
      h('p', { text: f.statusPlain }),
      h('div', { class: 'st-fidcount' }, parts.map(function (x) { return h('span', { class: 'st-tag', 'data-t': FCLS[x[0]], text: n[x[0]] + ' ' + x[1] }); })),
      f.mechanizableNote ? h('p', { class: 'mech', text: f.mechanizableNote }) : null,
    ]);
  }
  function fidelityList(s, D) {
    var f = s.fidelity, scale = (D.registry.fidelityScale || {});
    var rows = f.rules.map(function (r) {
      return h('li', { 'data-c': r.cls }, [
        h('div', { class: 'h' }, [h('strong', { text: r.area }), h('span', { class: 'st-tag', 'data-t': FCLS[r.cls], text: r.clsLabel })]),
        h('p', { class: 'src' }, [h('span', { class: 'k', text: 'Quelle: ' }), r.source + ' '], ),
        h('p', { class: 'code' }, [h('span', { class: 'k', text: 'Im Modell: ' }), r.code]),
        h('span', { class: 'acc', text: r.accessLabel + (r.note ? ' · ' + r.note : '') }),
      ]);
    });
    var chain = f.chain && f.chain.length ? h('ol', { class: 'st-chain' }, f.chain.map(function (c) { return h('li', null, [h('span', { class: 'k', text: c.step }), h('p', { text: c.text })]); })) : null;
    return h('div', null, [
      chain ? h('div', { class: 'st-chainbox' }, [h('span', { class: 'k', text: 'Von der Quelle zum Modell' }), chain]) : null,
      h('ul', { class: 'st-fidlist' }, rows),
      f.missing && f.missing.length ? h('div', { class: 'st-fidmiss' }, [h('span', { class: 'k', text: 'Fehlt im laufenden Modell' }), h('ul', { class: 'st-ul' }, f.missing.map(function (m) { return h('li', { text: m }); }))]) : null,
      f.data ? h('p', { class: 'st-hint', text: 'Daten · historisch: ' + f.data.historical + ' · live: ' + f.data.live + (f.data.gaps ? ' · Lücken: ' + f.data.gaps : '') + '.' }) : null,
      f.examples && f.examples.length ? h('div', { class: 'st-chainbox' }, [h('span', { class: 'k', text: 'Prüfung an den Beispielen des Traders' }), h('ul', { class: 'st-exlist' }, f.examples.map(function (x) { return h('li', null, [h('strong', { text: x.case }), h('span', { class: 'r', text: x.role }), h('p', { text: x.result })]); }))]) : null,
      f.sourcesRead && f.sourcesRead.length ? details('Im Volltext gelesen (' + f.sourcesRead.length + ')', [h('ul', { class: 'st-ul' }, f.sourcesRead.map(function (m) { return h('li', { text: m }); }))]) : null,
      f.failedAttempts && f.failedAttempts.length ? details('Erfolglose Quellenversuche', [h('ul', { class: 'st-ul' }, f.failedAttempts.map(function (m) { return h('li', { text: m }); }))]) : null,
      f.neededMaterial && f.neededMaterial.length ? details('Benötigtes Originalmaterial', [h('ul', { class: 'st-ul' }, f.neededMaterial.map(function (m) { return h('li', { text: m }); }))]) : null,
      scale.accessNote ? h('p', { class: 'st-hint', text: scale.accessNote }) : null,
    ]);
  }
  // Laufendes Modellportfolio (portfolio.json): Zusammensetzung, Cash, Stops.
  function portfolioSection(mp, s, D) {
    var c = mp.config || {};
    var head = h('div', { class: 'st-mphead' }, [
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Investiert' }), h('strong', { text: pct(mp.investedPct || 0, 0) })]),
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Cash' }), h('strong', { text: pct(mp.cashPct == null ? 1 : mp.cashPct, 0) })]),
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Positionen' }), h('strong', { text: (mp.openCount || 0) + ' / ' + (c.maxPositions || 10) })]),
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Risiko je Trade' }), h('strong', { text: pct(c.riskPerTrade || 0, 2) })]),
    ]);
    var rules = h('p', { class: 'st-hint', text: 'Regeln: Start 100.000 USD am ' + (mp.startDate ? dateDe(mp.startDate) : '–') + '; Positionsgröße = ' + pct(c.riskPerTrade || 0, 2) + ' des Kapitals ÷ Abstand zum Stop, höchstens ' + pct(c.maxPositionPct || 0, 0) + ' je Position und ' + (c.maxPositions || 10) + ' Positionen' + (c.progressive ? '; nach netto negativen letzten ' + c.progressive.lookback + ' Trades halbes Risiko' : '') + '. Gleichzeitige Einstiege ' + (c.simultaneousEntries || '') + '. ' + (c.source || '') });
    var kids = [head];
    if (!mp.positions || !mp.positions.length) kids.push(h('p', { class: 'st-p', text: mp.note || 'Derzeit keine Modellposition – das Kapital liegt in Cash.' }));
    else kids.push(h('ul', { class: 'st-mplist' }, mp.positions.map(function (p) {
      return h('li', null, [h('a', { href: stockUrl(p.symbol) }, [
        h('div', { class: 'r1' }, [h('strong', { text: p.symbol }), h('span', { class: 'w', text: pct(p.weightPct, 1) })]),
        h('div', { class: 'r2', text: 'Einstieg ' + dateShort(p.entryDate) + ' zu ' + num(p.entryPrice) + ' · Stop ' + num(p.stop) + ' · Risiko bis Stop ' + pct(p.riskToStopPct || 0, 2) + (p.version !== s.strategy_version ? ' · Regel v' + p.version : '') }),
      ])]);
    })));
    if (mp.notTaken && mp.notTaken.length) kids.push(details('Nicht übernommen (' + mp.notTaken.length + ')', [h('p', { class: 'st-hint', text: 'Diese Modelleinstiege stehen im Protokoll, bekamen im Modellportfolio aber keinen Platz.' }), h('ul', { class: 'st-ul' }, mp.notTaken.slice(0, 60).map(function (x) { return h('li', { text: x.symbol + ' · ' + dateShort(x.entryDate) + ' · ' + ({ MAX_POSITIONS: 'alle Plätze belegt', NO_CASH: 'kein Kapital frei', NO_RISK: 'Stop nicht unter dem Einstieg', MARKET_FILTER: 'Marktampel rot – keine neue Position' }[x.reason] || x.reason) }); }))]));
    if (mp.closed && mp.closed.length) kids.push(details('Abgeschlossen (' + mp.closed.length + ')', [h('ul', { class: 'st-ul' }, mp.closed.map(function (x) { return h('li', { text: x.symbol + ' · ' + dateShort(x.entryDate) + ' → ' + dateShort(x.exitDate) + ' · ' + ruleText(x.exitRuleId) + ' · ' + pct(x.returnPct, 1, true) }); }))]));
    kids.push(rules);
    kids.push(h('p', { class: 'st-hint', text: mp.publication || '' }));
    return sec('Modellportfolio', kids, { kicker: 'Laufend · alle Ein- und Ausstiege nach Regel' });
  }

  /* ============================================== MODELLDEPOT (Runde 12) */
  function t52Rule(id, t) { return (t && t.text) || ({ 'TR52-SELL-STALE': 'kein neues 52-Wochen-Hoch in 65 Handelstagen', 'TR52-SELL-PERF': 'weniger als 100 % über dem 52-Wochen-Tief', 'TR52-SELL-WEIGHT': 'Gewicht unter 3 %', 'TR52-TRIM': 'auf 15 % reduziert', 'TR52-CAP-MARKET': 'Marktampel rot: auf 5 % reduziert', DELISTED: 'Notierung beendet', NO_SLOT: 'kein freier Platz', MARKET_FILTER: 'Marktampel rot', NO_CASH: 'zu wenig Bargeld' }[id] || id); }
  function renderModelMethod(D, s, c) {
    var t = D.trend52;
    if (!t) { main.appendChild(emptyBox('Modelldepot noch nicht berechnet', 'Die Daten des Modelldepots liegen noch nicht vor.')); return; }
    var mk = t.market || {};
    main.appendChild(sec('Marktampel und Termine', [
      h('div', { class: 'st-mphead' }, [
        h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Marktampel' }), h('strong', { text: mk.green === true ? 'Grün' : mk.green === false ? 'Rot' : '–' })]),
        h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Nächste Entscheidung' }), h('strong', { text: dateDe(t.schedule.nextDecision) })]),
        h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Ausführung' }), h('strong', { text: dateDe(t.schedule.nextExecution) })]),
        h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Plätze belegt' }), h('strong', { text: t.portfolio.used + ' / ' + t.portfolio.slots })]),
      ]),
      h('p', { class: 'st-p', text: mk.text || '' }),
      h('p', { class: 'st-hint', text: t.schedule.note }),
    ], { kicker: 'Stand ' + dateDe(t.asOf) + ' · live seit ' + dateDe(t.liveSince) }));
    // Offene Positionen
    var pk = [h('div', { class: 'st-mphead' }, [
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Investiert' }), h('strong', { text: pct(t.portfolio.investedPct || 0, 0) })]),
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Cash' }), h('strong', { text: pct(t.portfolio.cashPct == null ? 1 : t.portfolio.cashPct, 0) })]),
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Positionen' }), h('strong', { text: t.portfolio.used + ' / ' + t.portfolio.slots })]),
      h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Zielgewicht' }), h('strong', { text: '10 %' })]),
    ])];
    if (!t.portfolio.positions.length) pk.push(h('p', { class: 'st-p', text: 'Noch keine Position. Die erste Monatsentscheidung fällt am ' + dateDe(t.schedule.nextDecision) + ' nach Handelsschluss; gekauft wird zur Eröffnung am ' + dateDe(t.schedule.nextExecution) + '. Bis dahin liegt das Modellkapital (100.000 USD) in Cash.' }));
    else pk.push(h('ul', { class: 'st-mplist' }, t.portfolio.positions.map(function (p) {
      var hold = p.holdChecks ? (p.holdChecks.perf && p.holdChecks.freshHigh ? 'Halteregeln erfüllt' : 'Verkauf am Monatsende droht: ' + (!p.holdChecks.perf ? 'unter 100 % seit Tief' : 'kein neues Hoch in 65 Tagen')) : '';
      return h('li', null, [h('a', { href: stockUrl(p.symbol) }, [
        h('div', { class: 'r1' }, [h('strong', { text: p.symbol }), h('span', { class: 'w', text: pct(p.weight, 1) })]),
        h('div', { class: 'r2', text: 'Kauf ' + dateShort(p.entryDate) + ' zu ' + num(p.entryPrice) + ' (Rang ' + (p.rankAtEntry || '–') + ') · ' + pct(p.perfSinceLow, 0) + ' über 52-W-Tief · ' + hold }),
      ])]);
    })));
    pk.push(h('p', { class: 'st-hint', text: t.publication }));
    main.appendChild(sec('Modelldepot', pk, { kicker: 'Offene Positionen · ohne Stop, Prüfung zum Monatsende' }));
    // Ausgeloeste Modellorders
    if (t.orders && (t.orders.buys.length || t.orders.sells.length)) main.appendChild(sec('Ausgelöste Modellorders', [
      h('p', { class: 'st-p', text: 'Am ' + dateDe(t.orders.decidedOn) + ' beschlossen, Ausführung zur ' + t.orders.executesAt + '.' }),
      h('ul', { class: 'st-ul' }, t.orders.sells.map(function (x) { return h('li', { text: 'Verkauf ' + x.symbol + (x.target ? ' auf ' + pct(x.target, 0) : '') + ' · ' + t52Rule(x.ruleId, x) }); }).concat(t.orders.buys.map(function (x) { return h('li', { text: 'Kauf ' + x.symbol + ' · Rang ' + x.rank + ' · 10 %' }); }))),
    ], { kicker: 'Beschlossen, noch nicht ausgeführt' }));
    // Vorbereitete Einstiege
    var pr = t.prepared || { candidates: [] };
    main.appendChild(sec('Vorbereitete Einstiege', [
      h('p', { class: 'st-p', text: pr.green === false ? 'Marktampel rot: Am Monatsende würde nicht gekauft.' : pr.free + ' freie Plätze. Diese Aktien erfüllen heute alle Kaufregeln, sortiert nach Gleichmäßigkeit des Aufwärtstrends.' }),
      pr.candidates.length ? h('ul', { class: 'st-mplist' }, pr.candidates.map(function (x) {
        return h('li', null, [h('a', { href: stockUrl(x.symbol) }, [
          h('div', { class: 'r1' }, [h('strong', { text: x.rank + '. ' + x.symbol }), h('span', { class: 'w', text: x.wouldGetSlot ? 'bekäme Platz' : 'kein Platz' })]),
          h('div', { class: 'r2', text: pct(x.perfSinceLow, 0) + ' über 52-Wochen-Tief · Trendmaß ' + num(x.score, 2) + (x.wouldGetSlot ? '' : ' · ' + (pr.green === false ? 'Marktampel rot' : 'alle freien Plätze an höhere Ränge')) }),
        ])]);
      })) : emptyBox('Heute kein Kandidat', 'Keine Aktie erfüllt alle Kaufregeln.'),
      (pr.sellsIfToday || []).length ? h('p', { class: 'st-hint', text: 'Wäre heute Monatsende: ' + pr.sellsIfToday.map(function (x) { return x.symbol + ' (' + t52Rule(x.ruleId, x) + ')'; }).join(' · ') }) : null,
      h('p', { class: 'st-hint', text: pr.note }),
    ], { kicker: 'Rangliste mit dem Schlusskurs vom ' + dateDe(pr.asOf) }));
    if (t.nearMisses && t.nearMisses.length) main.appendChild(sec('Knapp nicht aufgenommen', [
      h('p', { class: 'st-p', text: 'Starke Aktien, denen genau eine Kaufregel fehlt — deshalb nicht in der Rangliste.' }),
      h('ul', { class: 'st-ul' }, t.nearMisses.map(function (x) { return h('li', null, [h('a', { href: stockUrl(x.symbol), text: x.symbol }), ' · ' + pct(x.perfSinceLow, 0) + ' über Tief · fehlt: ' + x.text]); })),
    ], { kicker: 'Interessant, aber regelwidrig' }));
    var hist = [];
    if (t.closed && t.closed.length) hist.push(details('Geschlossene Trades (' + t.closed.length + ')', [h('ul', { class: 'st-ul' }, t.closed.map(function (x) { return h('li', { text: x.symbol + ' · ' + dateShort(x.entryDate) + ' → ' + dateShort(x.exitDate) + ' · ' + t52Rule(x.exitRuleId, { text: x.exitText }) + ' · ' + pct(x.returnPct, 1, true) }); }))]));
    if (t.notTaken && t.notTaken.length) hist.push(details('Nicht übernommen (' + t.notTaken.length + ')', [h('ul', { class: 'st-ul' }, t.notTaken.map(function (x) { return h('li', { text: dateShort(x.date) + ' · ' + x.symbol + ' · ' + t52Rule(x.reason, x) }); }))]));
    if (t.executions && t.executions.length) hist.push(details('Ausführungen (' + t.executions.length + ')', [h('ul', { class: 'st-ul' }, t.executions.map(function (x) { return h('li', { text: dateShort(x.date) + ' · ' + (x.side === 'BUY' ? 'Kauf ' : 'Verkauf ') + x.symbol + ' zu ' + num(x.price) + (x.text ? ' · ' + x.text : '') }); }))]));
    if (t.decisions && t.decisions.length) hist.push(details('Monatsentscheidungen (' + t.decisions.length + ')', [h('ul', { class: 'st-ul' }, t.decisions.map(function (d) { return h('li', { text: dateShort(d.date) + ' · Ampel ' + (d.green ? 'grün' : 'rot') + ' · ' + d.candidates + ' Kandidaten · Kauf: ' + (d.buys.join(', ') || '–') + ' · Verkauf: ' + (d.sells.map(function (x) { return x.symbol; }).join(', ') || '–') }); }))]));
    if (!hist.length) hist.push(h('p', { class: 'st-hint', text: 'Noch keine Monatsentscheidung im Protokoll — das Ledger beginnt am ' + dateDe(t.liveSince) + ' und rechnet nicht zurück.' }));
    main.appendChild(sec('Protokoll', hist, { kicker: 'Jede Entscheidung mit Regel' }));
  }
  function trend52For(D, sym) {
    var t = D.trend52; if (!t) return null;
    var p = t.portfolio.positions.filter(function (x) { return x.symbol === sym; })[0];
    if (p) return ['Im Modelldepot', 'good', 'Gewicht ' + pct(p.weight, 1) + ' · Kauf ' + dateShort(p.entryDate) + ' zu ' + num(p.entryPrice) + ' · ' + pct(p.perfSinceLow, 0) + ' über 52-Wochen-Tief'];
    var c = (t.prepared.candidates || []).filter(function (x) { return x.symbol === sym; })[0];
    if (c) return ['Kandidat · Rang ' + c.rank, 'warn', c.wouldGetSlot ? 'Würde am Monatsende einen Platz bekommen (Entscheidung ' + dateDe(t.schedule.nextDecision) + ').' : 'Erfüllt alle Kaufregeln, aber kein freier Platz.'];
    var n = (t.nearMisses || []).filter(function (x) { return x.symbol === sym; })[0];
    if (n) return ['Knapp nicht aufgenommen', 'mute', 'Fehlt: ' + n.text + '.'];
    var x = (t.closed || []).filter(function (q) { return q.symbol === sym; })[0];
    if (x) return ['Verkauft', 'mute', dateShort(x.exitDate) + ' · ' + t52Rule(x.exitRuleId, { text: x.exitText })];
    return null;
  }
  function portfolioCell(D, s) {
    var mp = D.portfolio && D.portfolio.strategies[s.strategyId];
    if (!mp || !s.entry) return null;
    var p = (mp.positions || []).filter(function (x) { return x.signalId === s.id; })[0];
    if (p) return ['Positionsgröße', pct(p.weightPct, 1), 'Modellportfolio · Risiko ' + pct(p.initialRiskPct || 0, 2)];
    var n = (mp.notTaken || []).filter(function (x) { return x.signalId === s.id; })[0];
    if (n) return n.reason === 'MARKET_FILTER' ? ['Positionsgröße', 'nicht übernommen', 'Marktampel rot (SPY unter dem 200-Tage-Durchschnitt)'] : ['Positionsgröße', 'kein Platz', 'Modellportfolio voll (' + (mp.config.maxPositions || 10) + ' Positionen)'];
    return null;
  }
  function evidenceBanner(s, D) {
    var e = ev(s);
    var kids = [h('div', { class: 'h' }, [h('span', { class: 'k', text: 'Evidenz · Version ' + (e.version || s.strategy_version) }), evidenceTag(s)]), h('p', { text: e.levelPlain || '' })];
    if (e.presentation === 'RESEARCH') kids.push(h('p', { class: 'res', text: 'Diese Methode läuft als Forschung und Modellbeobachtung weiter. Neue Setups sind keine Einstiegschancen. Laufende Modellpositionen werden nach der Regelversion geführt, unter der sie eröffnet wurden, und bis zum Ausstieg protokolliert. Die Einstufung ist eine Produktentscheidung, kein Marktsignal.' }));
    if (e.note) kids.push(h('p', { class: 'note', text: e.note }));
    kids.push(h('p', { class: 'np', text: e.noPromise || '' }));
    return h('div', { class: 'st-evbanner', 'data-t': e.levelTone }, kids);
  }
  function steps(s, c) {
    if (!c) return null;
    var ids = s.mode === 'LIVE' ? [['candidate', 'Kandidat'], ['prepared', 'Vorbereitet'], ['confirmation', 'Bestätigt'], ['exit', 'Ausstieg']] : (c.sections || []).slice(0, 4).map(function (x) { return [x.id, x.title]; });
    return h('ol', { class: 'st-steps' }, ids.map(function (p, i) { var t = sectionText(c, p[0]); return t ? h('li', null, [h('span', { class: 'n', text: String(i + 1) }), h('div', null, [h('strong', { text: p[1] }), h('p', { text: t })])]) : null; }));
  }
  function gapList(c) {
    return h('ul', { class: 'st-gaps' }, (c.executable && c.executable.gaps || []).map(function (g) { return h('li', null, [icon(IC.x, 'bad'), g]); }));
  }
  function assessments(s, c, D) {
    var hv = c.historical_validation || {}, sb = c.source_basis || {}, ex = c.executable || {};
    var hist = historyOf(s);
    var row = function (title, val, text) { return h('div', { class: 'st-assess', 'data-t': val[1] }, [h('div', { class: 'h' }, [h('span', { class: 'k', text: title }), h('strong', { text: val[0] })]), h('p', { text: text })]); };
    return h('div', { class: 'st-assessments' }, [
      row('Regel', modeOf(s), (ex.note || '') + (ex.gaps && ex.gaps.length ? ' Offen: ' + ex.gaps.join('; ') + '.' : '')),
      row('Quellen', sourceOf(s), (sb.note || '') + (sb.ruleCounts ? ' ' + ruleCountText(sb.ruleCounts, s) : '') + (s.fidelity && s.fidelity.statusLabel ? ' Methodentreue: ' + s.fidelity.statusLabel + '.' : '')),
      row('Daten', dataOf(s), ev(s).data.plain || ''),
      row('Evidenz', hist, (ev(s).levelPlain || '') + (ev(s).note ? ' ' + ev(s).note : '')),
    ]);
  }
  // Herkunft eines Abschnitts: strengste Klasse der aktiven Regeln (registry.provenanceClasses); ältere Werte bleiben lesbar.
  var PROV_OLD = { ORIGINAL: ['Original', 'good'], VU: ['VU', 'info'], MIXED: ['Original + VU', 'warn'], NONE: ['—', 'mute'] };
  function provTag(key, from) {
    var pl = PROVLAB[key], p = pl ? [pl.label + (key === 'FOREIGN_RULE' && from && from.length ? ': ' + from.join(', ') : ''), pl.tone] : (PROV_OLD[key] || PROV_OLD.NONE);
    return h('span', { class: 'st-tag', 'data-t': p[1], title: pl ? pl.plain : '', text: p[0] });
  }
  function mixText(mix) { var o = []; Object.keys(mix || {}).forEach(function (k) { var pl = PROVLAB[k]; o.push(mix[k] + ' ' + (pl ? pl.label : k)); }); return o.length > 1 ? 'Enthält: ' + o.join(' · ') : ''; }
  function ruleCardList(c) {
    return h('div', { class: 'st-rcl' }, c.sections.map(function (x) { return h('div', { class: 'row' }, [h('div', { class: 'h' }, [h('strong', { text: x.title }), provTag(x.provenance, x.foreign_from)]), h('p', { text: x.text }), x.provenance_mix && mixText(x.provenance_mix) ? h('p', { class: 'st-hint', text: mixText(x.provenance_mix) }) : null, x.rules && x.rules.length ? h('code', { text: x.rules.join(' · ') }) : null]); }));
  }
  function ruleCountText(n, s) {
    if (n.original_interpretation === undefined) return 'Regeln: ' + n.original + ' Original, ' + n.vu + ' VU.';
    var o = [n.original + ' Original', n.original_interpretation + ' Original mit VU-Lesart', n.vu_formalization + ' VU-Formalisierung', n.vu_own + ' VU-eigen'];
    if (n.foreign) o.push(n.foreign + ' Fremdregel' + (n.foreign === 1 ? '' : 'n'));
    if (n.unresolved) o.push(n.unresolved + ' mit ungeklärter Herkunft');
    return 'Aktive Regeln der Version ' + s.strategy_version + ' (' + n.active + '): ' + o.join(', ') + '.' + (n.retired ? ' ' + n.retired + ' Regeln früherer Versionen sind ausgenommen.' : '');
  }
  var EV = { PRIMARY_EXPLICIT: ['Original', 'good'], PRIMARY_INFERRED: ['Original, abgeleitet', 'good'], MULTI_SOURCE_CONFIRMED: ['Mehrfach belegt', 'good'], SECONDARY_ONLY: ['Sekundärquelle', 'warn'], DISPUTED: ['Umstritten', 'bad'], VU_FORMALIZATION: ['VU-Formalisierung', 'info'], VU_EXTENSION: ['VU-Erweiterung', 'info'], NOT_VERIFIABLE: ['Nicht belegbar', 'mute'] };
  var CONF = { HIGH: 'Belegstärke hoch', MEDIUM: 'Belegstärke mittel', LOW: 'nur Sekundärquelle' };
  function ruleRow(r, D) {
    var e = EV[r.evidence_status] || [r.evidence_status, 'mute'];
    var tags = r.provenance_class ? [provTag(r.provenance_class, r.foreign_from ? [r.foreign_from] : null), r.source_confidence && r.source_confidence !== 'NONE' && r.provenance_class !== 'VU_OWN' ? h('span', { class: 'st-tag', 'data-t': 'mute', text: CONF[r.source_confidence] }) : null] : [h('span', { class: 'st-tag', 'data-t': e[1], text: e[0] })];
    return h('div', { class: 'row' }, [h('div', { class: 'h' }, [h('code', { text: r.rule_id }), h('span', { class: 'tags' }, tags)]), h('p', { text: r.plain_language_explanation }), r.provenance_note ? h('p', { class: 'st-hint', text: r.provenance_note }) : null, h('code', { class: 'm', text: r.machine_readable_definition })]);
  }
  // Version-zu-Regel-Zuordnung: nur Regeln der laufenden Version erscheinen als aktiv.
  function rulesBlock(s, D) {
    var rules = s.rules || [], st = function (r) { return r.status || 'ACTIVE'; };
    var act = rules.filter(function (r) { return st(r) === 'ACTIVE'; }), ref = rules.filter(function (r) { return st(r) === 'NOT_IMPLEMENTED'; }), old = rules.filter(function (r) { return st(r) === 'LEGACY'; });
    var kids = [];
    if (s.rule_versioning) kids.push(h('p', { class: 'st-hint', text: s.rule_versioning.note }));
    kids.push(details('Aktive Regeln der Version ' + s.strategy_version + ' (' + act.length + ')', [h('div', { class: 'st-rules' }, act.map(function (r) { return ruleRow(r, D); }))]));
    if (ref.length) kids.push(details('Regeln des Traders, die diese Version nicht umsetzt (' + ref.length + ')', [h('div', { class: 'st-rules' }, ref.map(function (r) { return ruleRow(r, D); }))]));
    if (old.length) kids.push(details('Nicht mehr aktiv – Regeln früherer Versionen (' + old.length + ')', [h('p', { class: 'st-hint', text: 'Diese Regeln gelten nicht für Version ' + s.strategy_version + '. Sie bleiben lesbar, weil offene Positionen und Protokolleinträge älterer Versionen darauf verweisen.' }), h('div', { class: 'st-rules' }, old.map(function (r) { return h('div', { class: 'row legacy' }, [h('div', { class: 'h' }, [h('code', { text: r.rule_id }), h('span', { class: 'st-tag', 'data-t': 'mute', text: 'zuletzt gültig in v' + (r.last_active_version || r.legacy_only || '?') })]), h('p', { text: r.plain_language_explanation }), r.status_reason ? h('p', { class: 'st-hint', text: r.status_reason }) : null]); }))]));
    return h('div', null, kids);
  }
  // Produktklasse und Methodentreue je Bereich (intern; Datenbasis: registry.product).
  var FID_LABEL = { HIGH: 'hoch', MEDIUM: 'mittel', LOW: 'niedrig', UNKNOWN: 'unbekannt' };
  function productBlock(s, D) {
    var p = prod(s), pc = ((D.registry && D.registry.productClasses) || {})[p.product_class] || {};
    var required = (p.hard_gate && p.hard_gate.required) || [];
    var AREAS = [['Einstieg', 'entry_fidelity', 'entry'], ['Ausstieg', 'exit_fidelity', 'exit'], ['Positionsgröße', 'position_sizing_fidelity', 'sizing'], ['Portfolio', 'portfolio_fidelity', 'portfolio'], ['Fundamentalauswahl', 'fundamental_fidelity', 'fundamental'], ['Marktumfeld', 'market_fidelity', null]];
    return h('div', { class: 'st-fidban', 'data-s': p.product_class }, [
      h('div', { class: 'h' }, [h('span', { class: 'k', text: 'Produktklasse' }), h('strong', { text: p.product_class_label })]),
      h('p', { text: pc.plain || '' }),
      h('p', { class: 'mech', text: p.replication_claim_allowed ? 'Die Bezeichnung „Replication“ ist für diese Version zulässig.' : 'Keine Replikation: Die Bezeichnung „Replication“ ist für diese Version nicht zulässig, weil mindestens ein Kernbereich (Einstieg, Ausstieg, Positionsgröße, Portfolio, Risiko) nicht der Originalmethode entspricht.' }),
      details('Methodentreue je Bereich (intern)', [h('ul', { class: 'st-ul' }, AREAS.map(function (a) { var v = p[a[1]], na = a[2] === 'fundamental' && required.indexOf('fundamental') < 0; return h('li', { text: a[0] + ': ' + (na ? 'nicht Teil der Methode' : (FID_LABEL[v] || v)) }); }).concat([h('li', { text: 'Replikationsanspruch zulässig: ' + (p.replication_claim_allowed ? 'ja' : 'nein') })]))]),
    ]);
  }

  function renderLiveMethod(D, s, c) {
    var sig = D.signals, st = sig.strategies[s.strategy_id];
    if (!st) return;
    var open = st.open.slice().sort(sortSignals);
    var hasQ = !!s.quality_tiers;
    var main1 = hasQ ? open.filter(function (x) { return !isB(x); }) : isResearchS(s) ? open.filter(function (x) { return !x.entry; }) : open;
    var bList = hasQ ? open.filter(isB) : [];
    var kids = [];
    if (hasQ && st.quality) kids.push(h('div', { class: 'st-qsplit' }, [
      qTile(st.quality.byLabel ? st.quality.byLabel.A_ENTRY : 0, 'A-Einstiege'), qTile(st.quality.byLabel ? st.quality.byLabel.A_CANDIDATE : 0, 'A-Kandidaten'),
      qTile(st.quality.B, 'B-Setups', (st.quality.bBreakdown ? st.quality.bBreakdown.blockedOnlyByRegime + ' nur wegen Regime-Sperre (VU)' : '')),
    ]));
    kids.push(main1.length ? h('div', { class: 'st-list' }, main1.slice(0, 12).map(function (x) { return stockCard(x, s); })) : emptyBox(hasQ ? 'Heute kein A-Setup' : 'Heute kein Setup', hasQ ? 'Alle ' + bList.length + ' gültigen Boxen verfehlen mindestens ein Qualitätskriterium.' : 'Die Regeln sind heute für keinen Titel erfüllt. Supertrader erfindet kein Signal.'));
    if (main1.length > 12 || bList.length) kids.push(more(BASE + 'signals/?method=' + s.strategy_id, 'Alle ' + open.length + ' Setups' + (bList.length ? ' (inkl. ' + bList.length + ' B)' : '')));
    if (WATCH[s.strategy_id] && !isResearchS(s)) kids.unshift(h('p', { class: 'st-hint', text: 'Die Turtle-Regeln handeln jeden Ausbruch über das 20-Tage-Hoch. Das Modell nimmt Aktien erst auf, wenn sie höchstens 6 % darunter stehen (ab 3 % „vorbereitet“) – diese Abstände sind VU-Regeln, keine Turtle-Regeln, und Ausbrüche aus größerer Entfernung können dadurch verloren gehen. Die Liste ist eine Beobachtungsliste, kein vorbereiteter Einstieg. Steigt der Kurs im Tagesverlauf über den Ausbruchspunkt, kauft das Modell (Kauf-Stop); nach einem Gewinner-Ausbruch gilt das 55-Tage-Hoch.' }));
    if (isResearchS(s)) {
      kids.unshift(h('p', { class: 'st-hint', text: 'Modellbeobachtung: Die Regeln laufen unverändert weiter, damit die Beobachtung nicht rückwirkend geschönt wird. Die Liste ist keine Auswahl von Einstiegschancen.' }));
      var pos = open.filter(function (x) { return x.entry; });
      if (pos.length) main.appendChild(sec('Laufende Modellpositionen (' + pos.length + ')', [h('p', { class: 'st-hint', text: 'Ausstieg und Stop gelten nach der Regelversion, unter der die Position eröffnet wurde.' }), h('div', { class: 'st-list' }, pos.slice(0, 12).map(function (x) { return stockCard(x, s); })), pos.length > 12 ? more(BASE + 'signals/?method=' + s.strategy_id + '&phase=pos', 'Alle ' + pos.length) : null], { kicker: 'Forschung · weiter geführt' }));
    }
    main.appendChild(sec(isResearchS(s) ? 'Modellbeobachtung: aktuelle Setups' : WATCH[s.strategy_id] ? 'Beobachtungsliste: nahe dem 20-Tage-Hoch' : 'Aktien, die die Regeln heute erfüllen', kids, { kicker: 'Live seit ' + dateDe(st.liveSince) }));
    // Chart des besten Setups
    var pickS = main1[0] || open[0];
    if (pickS) { var host = h('div'); main.appendChild(sec(pickS.symbol + ' im Chart', [host], { kicker: isResearchS(s) ? 'Beispiel aus der Beobachtung' : 'Bestes Setup', more: more(stockUrl(pickS.symbol), 'Lens') })); mountSignalChart(host, pickS, s); }
    // Protokoll
    main.appendChild(sec('Protokoll', [h('div', { class: 'st-kpis small' }, [
      h('div', { class: 'st-kpi' }, [h('strong', { text: String(st.closed.length) }), h('span', { text: 'geschlossen' })]),
      h('div', { class: 'st-kpi' }, [h('strong', { text: String(st.invalidatedTotal) }), h('span', { text: 'ungültig geworden' })]),
      h('div', { class: 'st-kpi' }, [h('strong', { text: String(st.retiredTotal || 0) }), h('span', { text: 'Regelwechsel' })]),
    ]), h('p', { class: 'st-hint' }, ['Jeder Zustandswechsel wird mit Regel, Datum und Kurs protokolliert; nichts wird gelöscht. ', h('a', { href: st.ledgerPath, text: 'Ledger (JSON)' })])], { kicker: 'Seit ' + dateDe(st.liveSince) }));
  }
  function qTile(n, label, sub) { return h('div', { class: 'st-kpi' }, [h('strong', { text: String(n || 0) }), h('span', { text: label }), sub ? h('em', { text: sub }) : null]); }

  function renderPartialMethod(D, s, c) {
    var pc = D.signals.partialChecks && D.signals.partialChecks[s.strategy_id];
    if (!pc) return;
    var isCS = s.strategy_id === 'CANSLIM';
    var defs = isCS ? pc.criteria : pc.signals;
    var counts = isCS ? pc.counts.byCriterion : pc.counts.bySignal;
    // Kriterienübersicht: was ist prüfbar, wie viele erfüllen es
    var grid = h('div', { class: 'st-crit' }, defs.map(function (d) {
      var k = d.id, ct = counts[k] || {}, tot = (ct.PASS || 0) + (ct.FAIL || 0);
      var na = (isCS && (k === 'I')) || (!isCS && k === 'DLIQUID'), info = isCS && k === 'S', mkt = isCS && k === 'M';
      var stt = na ? 'na' : info ? 'info' : 'ok';
      if (mkt) return h('div', { class: 'c', 'data-s': 'ok' }, [h('div', { class: 'h' }, [h('b', { text: k }), h('strong', { text: d.label })]), h('p', { text: d.short }), h('span', { class: 'v mkt ' + (pc.market.status === 'PASS' ? 'ok' : 'no'), text: 'Gesamtmarkt heute: ' + (pc.market.status === 'PASS' ? 'erfüllt' : 'nicht erfüllt') + ' (SPY ' + pct(pc.market.value, 1, true) + ' zur 200-Tage-Linie)' })]);
      return h('div', { class: 'c', 'data-s': stt }, [
        h('div', { class: 'h' }, [h('b', { text: isCS ? k : '' }), h('strong', { text: d.label })]),
        h('p', { text: d.short }),
        na ? h('span', { class: 'v', text: 'nicht prüfbar' }) : info ? h('span', { class: 'v', text: 'nur angezeigt' }) : h('div', { class: 'meter' }, [h('i', { style: { width: (tot ? (ct.PASS / tot * 100) : 0) + '%' } }), h('span', { text: (ct.PASS || 0) + ' von ' + tot + ' erfüllt' + (ct.NO_DATA ? ' · ' + ct.NO_DATA + ' ohne Daten' : '') })]),
      ]);
    }));
    var head = isCS
      ? 'Geprüft wurden ' + pc.counts.evaluated + ' handelbare US-Aktien. ' + pc.counts.partialMatch + ' erfüllen alle fünf prüfbaren Kriterien. Marktrichtung (M) heute: ' + (pc.market.status === 'PASS' ? 'steigend' : 'nicht bestätigt') + '.'
      : 'Geprüft wurden ' + pc.counts.evaluated + ' Aktien mit Jahresabschlüssen; ' + pc.counts.valueUniverse + ' gehören zum günstigsten Fünftel, ' + pc.counts.candidates + ' davon erreichen mindestens 7 von 8 prüfbaren Signalen.';
    main.appendChild(sec(isCS ? 'Die sieben Kriterien' : 'Die neun Signale', [h('p', { class: 'st-hint', text: head }), grid, h('p', { class: 'st-hint', text: 'Daten: ' + pc.fundamentalsBasis + '. Kurse vom ' + dateDe(pc.asOf) + '.' })], { kicker: 'Was prüfbar ist' }));
    var list = pc.candidates;
    main.appendChild(sec(isCS ? 'Teiltreffer' : 'Kandidaten der Teilprüfung', [
      h('div', { class: 'st-warnbox' }, [icon(IC.info), h('span', { text: isCS ? 'Teiltreffer erfüllen alle prüfbaren Kriterien. Weil „I“ fehlt und kein Basisausbruch gerechnet wird, gibt es keinen Ein- oder Ausstieg — und kein CAN-SLIM-Signal.' : 'Ein Teil-Score ist kein F-Score: das Liquiditätssignal fehlt. Piotroski bildete einmal jährlich ein Portfolio; daraus entstehen hier keine Ein- und Ausstiege.' })]),
      list.length ? h('div', { class: 'st-list' }, list.slice(0, 30).map(function (r) { return partialCard(r, s, s.strategy_id); })) : emptyBox('Heute kein Teiltreffer', 'Keine Aktie erfüllt alle prüfbaren Kriterien.'),
    ], { kicker: list.length + ' Aktien' }));
    if (isCS && pc.near && pc.near.length) main.appendChild(sec('Fast-Treffer: ein Kriterium verfehlt', [details(pc.counts.near + ' Aktien anzeigen', [h('div', { class: 'st-list' }, pc.near.slice(0, 20).map(function (r) { return partialCard(r, s, 'CANSLIM'); }))])]));
    if (c) main.appendChild(sec('Was fehlt für die vollständige Methode?', [gapList(c)]));
  }

  /* ========================================================= SIGNALE */
  function renderSignals(D) {
    var reg = D.registry, sig = D.signals, S = stratMap(reg);
    var params = new URLSearchParams(location.search);
    var f = { method: params.get('method') || '', phase: params.get('phase') || '', quality: params.get('quality') || '', division: params.get('division') || '', q: params.get('q') || '' };
    var rows = [];
    Object.keys(sig.strategies).forEach(function (id) {
      var st = sig.strategies[id];
      st.open.forEach(function (x) { rows.push({ kind: 'sig', s: x, id: id, phase: phaseKey(x) }); });
      st.closed.forEach(function (x) { rows.push({ kind: 'sig', s: x, id: id, phase: 'closed' }); });
      st.invalidated.forEach(function (x) { rows.push({ kind: 'sig', s: x, id: id, phase: 'inv' }); });
      st.scanner.top.forEach(function (x) { rows.push({ kind: 'sig', s: Object.assign({ strategyId: id, state: x.stage }, x), id: id, phase: 'cand' }); });
    });
    ['CANSLIM', 'PIOTROSKI_F'].forEach(function (id) { var pc = sig.partialChecks && sig.partialChecks[id]; if (pc) pc.candidates.forEach(function (r) { rows.push({ kind: 'partial', s: r, id: id, phase: 'partial' }); }); });

    main.appendChild(h('header', { class: 'st-hero sm' }, [h('div', { class: 'st-kick', text: 'Signale' }), h('h1', { text: 'Setups finden' }), h('p', { class: 'st-lead', text: 'Nach Methode und Phase filtern. Vorbereitet heißt: noch kein Einstieg. Forschung heißt: Modellbeobachtung einer Methode in Prüfung – keine Einstiegschance.' })]));
    main.appendChild(freshness(D));

    var methods = reg.strategies.filter(function (s) { return s.mode === 'LIVE' || s.mode === 'PARTIAL_CHECK'; });
    var search = h('input', { type: 'search', class: 'st-search', placeholder: 'Aktie suchen (z. B. NVDA)', value: f.q, 'aria-label': 'Aktie suchen', oninput: function () { f.q = search.value.trim().toUpperCase(); update(); } });
    var methodRow = h('div', { class: 'st-chips', role: 'group', 'aria-label': 'Methode' });
    var phaseRow = h('div', { class: 'st-chips', role: 'group', 'aria-label': 'Phase' });
    var moreBtn = h('button', { type: 'button', class: 'st-morebtn', 'aria-expanded': 'false' }, [icon(IC.filter), 'Mehr Filter']);
    var divisions = {}; rows.forEach(function (r) { if (r.s.sicDivision) divisions[r.s.sicDivision] = r.s.sicDivisionName || r.s.sicDivision; });
    var qSel = h('select', { 'aria-label': 'Qualität', onchange: function () { f.quality = qSel.value; update(); } }, [h('option', { value: '', text: 'Qualität: Standard (Darvas nur A)' }), h('option', { value: 'A', text: 'Nur A (Darvas)' }), h('option', { value: 'B', text: 'Inklusive B-Setups' })]);
    qSel.value = f.quality;
    var dSel = h('select', { 'aria-label': 'Branche', onchange: function () { f.division = dSel.value; update(); } }, [h('option', { value: '', text: 'Branche: alle' })].concat(Object.keys(divisions).sort().map(function (k) { return h('option', { value: k, text: divisions[k] }); })));
    dSel.value = f.division;
    var extra = h('div', { class: 'st-extra', hidden: true }, [qSel, dSel, h('p', { class: 'st-hint', text: 'Markt: USA. Datenstand aller Setups: ' + dateDe(sig.asOf) + '.' })]);
    moreBtn.addEventListener('click', function () { extra.hidden = !extra.hidden; moreBtn.setAttribute('aria-expanded', String(!extra.hidden)); });
    var countLine = h('p', { class: 'st-count' });
    var list = h('div', { class: 'st-list' });
    var limit = 30;
    var showMore = h('button', { type: 'button', class: 'st-loadmore', onclick: function () { limit += 30; render(); } }, ['Mehr anzeigen']);

    main.appendChild(h('div', { class: 'st-filters2' }, [search, methodRow, phaseRow, h('div', { class: 'st-frow' }, [moreBtn]), extra]));
    main.appendChild(countLine); main.appendChild(list); main.appendChild(showMore);

    function filtered(ignore) {
      return rows.filter(function (r) {
        if (ignore !== 'method' && f.method && r.id !== f.method) return false;
        // Forschung: nur bei gewaehlter Methode oder im Filter „Forschung“ sichtbar.
        if (HAS_CURRENT && isResearchId(r.id) && f.method !== r.id && f.phase !== 'obs') return false;
        if (f.q && r.s.symbol.indexOf(f.q) !== 0) return false;
        if (f.division && r.s.sicDivision !== f.division) return false;
        if (ignore !== 'phase') {
          if (f.phase) { if (r.phase !== f.phase && !(f.phase === 'pos' && r.phase === 'warn')) return false; }
          else if (['closed', 'inv', 'cand'].indexOf(r.phase) >= 0) return false;
        }
        if (r.kind === 'sig' && isB(r.s) && f.quality !== 'B' && f.method !== 'DARVAS_BOX') return false;
        if (f.quality === 'A' && r.id === 'DARVAS_BOX' && !(r.s.quality && r.s.quality.tier === 'A')) return false;
        return true;
      });
    }
    var shown = [];
    function update() {
      methodRow.innerHTML = '';
      var base = filtered('method');
      [{ strategy_id: '', world_name: 'Alle Methoden' }].concat(methods).forEach(function (m) {
        var n = m.strategy_id ? (isResearchId(m.strategy_id) ? rows.filter(function (r) { return r.id === m.strategy_id && ['closed', 'inv', 'cand'].indexOf(r.phase) < 0; }).length : base.filter(function (r) { return r.id === m.strategy_id; }).length) : base.length;
        methodRow.appendChild(h('button', { type: 'button', 'data-research': isResearchId(m.strategy_id) ? 'true' : null, 'aria-pressed': String(f.method === m.strategy_id), onclick: function () { f.method = m.strategy_id; update(); } }, [m.world_name + (isResearchId(m.strategy_id) ? ' · Forschung' : ''), h('span', { class: 'n', text: String(n) })]));
      });
      phaseRow.innerHTML = '';
      var pbase = filtered('phase');
      PHASE_FILTERS.forEach(function (p) {
        var n = p[0] === 'obs' && HAS_CURRENT ? rows.filter(function (r) { return r.phase === 'obs' && (!f.method || r.id === f.method); }).length : p[0] ? pbase.filter(function (r) { return r.phase === p[0] || (p[0] === 'pos' && r.phase === 'warn'); }).length : pbase.filter(function (r) { return ['closed', 'inv', 'cand'].indexOf(r.phase) < 0; }).length;
        if (!n && p[0] && f.phase !== p[0] && ['closed', 'inv', 'cand'].indexOf(p[0]) < 0) return; // leere Phasen nicht anbieten
        phaseRow.appendChild(h('button', { type: 'button', 'data-p': p[0] || 'all', 'aria-pressed': String(f.phase === p[0]), onclick: function () { f.phase = p[0]; update(); } }, [p[1], h('span', { class: 'n', text: String(n) })]));
      });
      shown = filtered().sort(function (a, b) { return sortSignals(a.s, b.s); });
      limit = 30;
      var hiddenB = rows.filter(function (r) { return r.kind === 'sig' && isB(r.s); }).length;
      countLine.textContent = shown.length + ' Einträge' + (f.quality !== 'B' && f.method !== 'DARVAS_BOX' && hiddenB ? ' · ' + hiddenB + ' Darvas-B-Setups ausgeblendet' : '');
      var resIds = HAS_CURRENT ? Object.keys(RESEARCH).filter(function (id) { return f.method !== id && f.phase !== 'obs'; }) : [];
      if (resIds.length) countLine.appendChild(h('span', null, [' · Forschung ausgeblendet (' + resIds.map(function (id) { return S[id] ? S[id].world_name : id; }).join(', ') + ') ', h('button', { type: 'button', class: 'st-linkbtn', onclick: function () { f.method = resIds[0]; f.phase = ''; update(); }, text: 'anzeigen' })]));
      render();
      var q = new URLSearchParams(); Object.keys(f).forEach(function (k) { if (f[k]) q.set(k, f[k]); });
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    }
    function render() {
      list.innerHTML = '';
      if (!shown.length) list.appendChild(f.phase === 'closed' || f.phase === 'pos' || f.phase === 'conf' ? emptyBox('Noch keine Einträge', 'Seit Beginn des Live-Protokolls (' + dateDe(firstLive(sig)) + ') wurde kein Einstieg per Schlusskurs bestätigt. Ergebnisse werden nicht rückwirkend erzeugt.') : emptyBox('Keine Treffer', 'Für diese Filter gibt es heute keinen Eintrag.'));
      shown.slice(0, limit).forEach(function (r) { list.appendChild(r.kind === 'partial' ? partialCard(r.s, S[r.id], r.id) : stockCard(r.s, S[r.id])); });
      showMore.hidden = shown.length <= limit;
    }
    update();
    main.appendChild(disclaimer(sig));
  }

  /* ====================================================== STRATEGY LENS */
  function renderStock(D) {
    var reg = D.registry, sig = D.signals, S = stratMap(reg);
    var sym = (body.getAttribute('data-symbol') || new URLSearchParams(location.search).get('s') || '').toUpperCase();
    var entries = [], history = [];
    Object.keys(sig.strategies).forEach(function (id) {
      var st = sig.strategies[id];
      st.open.forEach(function (x) { if (x.symbol === sym) entries.push({ kind: 'sig', s: x, id: id }); });
      st.closed.concat(st.invalidated, st.retired || []).forEach(function (x) { if (x.symbol === sym) history.push({ s: x, id: id }); });
      st.scanner.top.forEach(function (x) { if (x.symbol === sym) entries.push({ kind: 'sig', s: Object.assign({ strategyId: id, state: x.stage }, x), id: id }); });
    });
    ['CANSLIM', 'PIOTROSKI_F'].forEach(function (id) { var pc = sig.partialChecks && sig.partialChecks[id]; if (!pc) return; (pc.candidates.concat(pc.near || [])).forEach(function (r) { if (r.symbol === sym) entries.push({ kind: 'partial', s: r, id: id }); }); });
    entries.forEach(function (e) { e.s.strategyId = e.s.strategyId || e.id; });
    var ph = function (e) { return e.kind === 'partial' ? 'partial' : phaseKey(e.s); };
    // Aktuelle Methoden vor Forschung, dann Phase und Abstand zum Trigger.
    // Teilpruefungen (kein Signal) stehen hinter vollstaendigen Modellen, auch hinter Forschung.
    var rank = function (e) { return e.kind === 'partial' ? 2 : isResearchId(e.id) ? 1 : 0; };
    entries.sort(function (a, b) { return rank(a) - rank(b) || PHASE_ORDER.indexOf(ph(a)) - PHASE_ORDER.indexOf(ph(b)) || dist(a.s) - dist(b.s); });
    var name = (entries[0] && (entries[0].s.companyName || entries[0].s.name)) || (history[0] && history[0].s.companyName) || '';
    main.appendChild(h('header', { class: 'st-lens-h' }, [h('div', null, [h('h1', { text: sym || '–' }), h('div', { class: 'co', text: name })]), h('div', { class: 'st-price', id: 'st-live' })]));
    var t52 = trend52For(D, sym), t52s = (reg.strategies.filter(function (x) { return x.strategy_id === 'VU_TREND_52W'; })[0]);
    if (t52 && t52s) main.appendChild(h('a', { class: 'st-research', href: stratUrl(t52s), style: worldVars(t52s) }, [h('div', { class: 'r1' }, [h('strong', { text: t52s.world_name }), h('span', { class: 'st-tag', 'data-t': t52[1], text: t52[0] })]), h('p', { text: t52[2] })]));
    if (!sym || (!entries.length && !history.length && !t52)) {
      main.appendChild(emptyBox('Kein Supertrader-Modell erkennt ' + (sym || 'diesen Titel'), 'Heute sieht keine Methode ein Setup, einen Kandidaten oder einen Teiltreffer.'));
      main.appendChild(discoverLink(sym, sig, 'In Discovery öffnen'));
      main.appendChild(disclaimer(sig)); return;
    }
    liveQuote(sym, D.market);
    var tabs = h('div', { class: 'st-chips lens', role: 'tablist' });
    var panel = h('div', { class: 'st-lens-panel' });
    var chartHost = h('div');
    function show(e) {
      var s = S[e.id]; setWorld(s);
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', String(b._e === e)); });
      panel.innerHTML = ''; chartHost.innerHTML = '';
      if (e.kind === 'partial') { panel.appendChild(partialLens(e.s, s, e.id, D)); return; }
      panel.appendChild(lensBlock(e.s, s, D));
      mountSignalChart(chartHost, e.s, s);
    }
    entries.forEach(function (e) {
      var s = S[e.id];
      var b = h('button', { type: 'button', role: 'tab', style: worldVars(s), onclick: function () { show(e); } }, [s.world_name]);
      b._e = e; tabs.appendChild(b);
    });
    main.appendChild(freshness(D));
    if (entries.length) { main.appendChild(tabs); main.appendChild(panel); main.appendChild(chartHost); show(entries[0]); }
    var hist = history.concat(entries.filter(function (e) { return e.kind === 'sig' && e.s.transitions; }));
    if (hist.length) main.appendChild(sec('Protokoll für ' + sym, [timeline(hist, S)], { kicker: 'Jeder Zustandswechsel mit Regel und Kurs' }));
    main.appendChild(discoverLink(sym, sig, 'Vollständige Aktienansicht in Discovery'));
    main.appendChild(disclaimer(sig));
  }
  function lensBlock(s, strat, D) {
    var p = s.plan;
    var st = s.state || s.stage;
    var re = s.discovery && s.discovery.kind === 'RULE_VERSION_REASSESSMENT' ? s.discovery.reassessment : null;
    var kids = [h('div', { class: 'r1' }, [badgeFor(s), p && p.since ? h('span', { class: 'since', text: 'seit ' + dateShort(p.since) }) : null])];
    if (isResearchS(strat)) kids[0].appendChild(h('span', { class: 'st-note-tag research', title: 'Forschung · Modellbeobachtung (' + ev(strat).levelLabel + '). ' + (s.entry ? 'Ausstieg nach Regelversion ' + (s.version || '') + '.' : 'Keine Einstiegschance.'), text: 'Forschung · ' + ev(strat).levelLabel }));
    if (re) kids[0].appendChild(h('span', { class: 'st-note-tag', title: 'Neubewertung nach Regelwechsel v' + re.previousVersion + ' → v' + s.version + ' auf Kursstand ' + dateShort(re.priceDataAsOf) + ' — kein neues Marktereignis. Vorgänger ' + re.previousSignalId, text: 'Regelwechsel v' + re.previousVersion + ' → v' + s.version }));
    kids.push(setupBar(s));
    if (p) {
      var cells = [
        ['Trigger', num(p.trigger.value), p.trigger.basis === 'INTRADAY_BUY_STOP' ? 'geplant · Kauf-Stop darüber' : 'geplant · ' + ({ DAILY_CLOSE: 'Schluss', WEEKLY_CLOSE: 'Wochenschluss' }[p.trigger.basis] || '') + ' darüber'],
        p.stop ? ['Stop', num(p.stop.value), 'aktueller Stop'] : ['Ungültig', num(p.invalidation.value), 'geplant · ' + (p.invalidation.basis === 'LOW' ? 'Tagestief' : 'Schluss') + ' darunter'],
        p.entry ? ['Modelleinstieg', num(p.entry.price), dateShort(p.entry.date) + (p.entry.basis === 'BUY_STOP' ? (p.entry.gappedAboveTrigger ? ' · Eröffnung über Trigger' : ' · Kauf-Stop') + (p.entry.evidence === 'INTRADAY_1MIN' ? ' · IEX-Minuten geprüft' : ' · angenommen') : ' zur Eröffnung')] : ['Modelleinstieg', 'keiner', p.trigger.basis === 'INTRADAY_BUY_STOP' ? 'sobald der Kurs den Trigger übersteigt' : p.phase === 'CONFIRMED' ? 'folgt zur Eröffnung' : 'erst nach Bestätigung'],
      ];
      var pc = D && portfolioCell(D, s); if (pc) cells.push(pc);
      kids.push(h('div', { class: 'st-cells' + (cells.length > 3 ? ' four' : '') }, cells.map(function (c, i) { return h('div', { class: 'c' + (i === 1 ? ' bad' : '') }, [h('span', { class: 'k', text: c[0] }), h('strong', { text: c[1] }), h('span', { class: 'd', text: c[2] })]); })));
      var en = evidenceNote(p, strat);
      if (en) kids.push(en);
      var nxt = p.phase === 'PREPARED' && p.trigger.basis !== 'INTRADAY_BUY_STOP' ? 'Wartet auf ' + ({ DAILY_CLOSE: 'Tagesschluss', WEEKLY_CLOSE: 'Wochenschluss' }[p.trigger.basis] || 'Schluss') + ' über ' + num(p.trigger.value) + ' — dann Modelleinstieg zur nächsten Eröffnung.' : p.nextAction.text;
      kids.push(h('div', { class: 'st-next', title: p.nextAction.text }, [h('span', { class: 'k', text: 'Nächster Schritt des Modells' }), h('p', { text: nxt }), h('span', { class: 'r', title: p.nextAction.ruleId, text: 'Kursdaten vom ' + dateDe(p.nextAction.dataAsOf) })]));
    } else {
      kids.push(h('p', { class: 'st-hint', text: 'Kandidat: Die Grundbedingungen sind erfüllt, ein Setup mit Trigger gibt es noch nicht. Kandidaten werden nicht protokolliert.' }));
    }
    kids.push(h('div', { class: 'why2' }, [h('span', { class: 'k', text: 'Warum diese Aktie?' }), h('p', { text: shortWhy(s) })]));
    if (s.quality) kids.push(qualityRow(s, strat));
    return h('div', { class: 'st-lensblock', style: worldVars(strat) }, kids);
  }
  // Runde 9: Belegart einer Kauf-Stop-Ausfuehrung. Tagesbalken zeigen, DASS der Trigger
  // erreicht wurde, nicht WANN; die Reihenfolge von Kauf und Tagestief kann offen sein.
  function evidenceNote(p, strat) {
    if (!p.entry || p.entry.basis !== 'BUY_STOP') return null;
    var sameDay = (p.exits || []).filter(function (x) { return x.date === p.entry.date; })[0];
    var txt;
    if (sameDay && sameDay.basis === 'SAME_DAY_CERTAIN' && p.entry.evidence !== 'INTRADAY_1MIN') txt = 'Ausstieg am Kauftag sicher: Der Tag schloss unter dem Stop – nach dem Kauf muss der Kurs den Stop durchschritten haben.';
    else if (p.entry.sameDayOrder === 'AMBIGUOUS') {
      var fnd = strat && strat.fidelity && strat.fidelity.sameDayFinding;
      txt = 'Reihenfolge am Kauftag offen: Das Tagestief lag unter dem Einstieg. Ob es vor oder nach dem Kauf entstand, zeigen Tageskurse nicht. Das Modell nimmt an: vorher – die Position läuft weiter. Liegt es danach, wäre sie am selben Tag zum Stop verkauft worden.'
        + (fnd === 'MOSTLY_EXIT' ? ' Eine interne Prüfung mit Minutenkursen der Börse IEX zeigt: Bei dieser Methode endeten solche Tage häufiger mit Verkauf am selben Tag – die Annahme des Modells ist hier eher zu günstig.' : fnd === 'MOSTLY_HOLD' ? ' Eine interne Prüfung mit Minutenkursen der Börse IEX zeigt: Bei dieser Methode lief die Position an solchen Tagen häufiger weiter, ein Teil endete aber am selben Tag.' : '');
    }
    else if (p.entry.evidence === 'INTRADAY_1MIN') txt = (sameDay ? 'Ausstieg am Kauftag: ' : 'Kauftag geprüft: ') + 'Die Reihenfolge von Kauf und Tagestief wurde mit Minutenkursen der Börse IEX bestimmt' + (sameDay ? ' – der Stop wurde nach dem Kauf erreicht.' : ' – der Stop hielt bis zum Schluss.') + ' IEX ist ein einzelner Handelsplatz ohne Eröffnungsauktion; geprüft wird nur, ob Tageshoch und -tief eng zum Tageskurs aller Börsen passen. Einzelne Kurse anderer Börsen können fehlen.';
    else txt = p.entry.gappedAboveTrigger ? 'Ausführung angenommen: Der Kurs eröffnete über dem Trigger, das Modell kauft zur Eröffnung.' : 'Ausführung angenommen: Das Tageshoch erreichte den Trigger. Zu welcher Uhrzeit gekauft worden wäre, zeigen Tageskurse nicht.';
    return h('p', { class: 'st-evid', 'data-k': p.entry.sameDayOrder === 'AMBIGUOUS' ? 'open' : 'assumed', text: txt });
  }
  function qualityRow(s, strat) {
    var q = s.quality, labels = (strat.quality_tiers && strat.quality_tiers.labels) || {};
    return h('div', { class: 'st-qrow2' }, [h('span', { class: 'k', text: (QLABEL[q.label] || q.tier) + ' — VU-Qualitätsstufe, nicht validiert' }), h('div', { class: 'st-dots wide' }, Object.keys(q.criteria).map(function (k) { var v = q.criteria[k]; var m = v === true ? ['ok', '✓'] : v === false ? ['no', '✕'] : ['nd', '…']; return h('span', { class: 'd ' + m[0] }, [h('i', { text: m[1] }), h('b', { text: labels[k] || k })]); }))]);
  }
  function partialLens(r, strat, id, D) {
    var isCS = id === 'CANSLIM', pc = D.signals.partialChecks[id];
    var defs = isCS ? pc.criteria : pc.signals, crit = isCS ? r.criteria : r.signals;
    var STX = { PASS: 'erfüllt', FAIL: 'nicht erfüllt', NO_DATA: 'keine Daten', NOT_AVAILABLE: 'nicht prüfbar', DISPLAY_ONLY: 'nur angezeigt' };
    var val = function (k, c) {
      if (c.value === null || c.value === undefined) return c.note || '';
      if (isCS && (k === 'C' || k === 'A')) return pct(c.value, 0, true) + (c.periodEnd ? ' · bis ' + dateShort(c.periodEnd) : '');
      if (isCS && k === 'N') return pct(c.value, 1) + ' zum Hoch';
      if (isCS && k === 'L') return 'RS ' + c.value;
      if (isCS && k === 'S') return 'Volumen 20/50 T.: ' + num(c.value, 2) + '×';
      if (isCS && k === 'M') return c.note || '';
      return '';
    };
    return h('div', { class: 'st-lensblock', style: worldVars(strat) }, [
      h('div', { class: 'r1' }, [phaseBadge('PARTIAL'), h('span', { class: 'since', text: isCS ? r.passed.length + ' von 5 prüfbaren erfüllt' : 'Teil-Score ' + r.partialScore + ' von 8' })]),
      h('div', { class: 'st-warnbox' }, [icon(IC.info), h('span', { text: isCS ? 'Teilprüfung: Kein CAN-SLIM-Signal, kein Ein- oder Ausstieg. „I“ ist nicht prüfbar.' : 'Teil-Score, kein F-Score: das Liquiditätssignal fehlt. Keine Ein- und Ausstiege.' })]),
      h('ul', { class: 'st-critlist' }, defs.map(function (d) { var c = crit[d.id] || { status: 'NO_DATA' }; var m = CRIT_STATUS[c.status] || CRIT_STATUS.NO_DATA; return h('li', { 'data-s': m[0] }, [h('span', { class: 'i', text: m[1] }), h('div', null, [h('strong', { text: (isCS ? d.id + ' · ' : '') + d.label }), h('span', { text: STX[c.status] + (val(d.id, c) ? ' · ' + val(d.id, c) : '') })])]); })),
      h('p', { class: 'st-hint', text: 'Daten: ' + pc.fundamentalsBasis + '. Kurse vom ' + dateDe(pc.asOf) + '.' }),
    ]);
  }
  function timeline(items, S) {
    var ev = [];
    // Regelwechsel ist kein Marktereignis: Das abgeloeste Setup und seine
    // Neubewertung erscheinen als EIN Eintrag "Regelwechsel", nicht als zweites
    // "Vorbereitet" am selben Kurstag.
    var hasSuccessor = {}, predecessorOf = {};
    items.forEach(function (it) { if (it.s.retiredBy && it.s.retiredBy.successorId) { hasSuccessor[it.s.id] = true; predecessorOf[it.s.retiredBy.successorId] = it.s; } });
    items.forEach(function (it) {
      (it.s.transitions || []).forEach(function (t, i) {
        if (t.ruleId === 'LC-VERSION-RETIRED' && hasSuccessor[it.s.id]) return;
        ev.push({ t: t, s: it.s, i: i, strat: S[it.id || it.s.strategyId] });
      });
    });
    ev.sort(function (a, b) { return (b.t.date || '').localeCompare(a.t.date || '') || (a.s === b.s ? b.i - a.i : 0); });
    return h('ol', { class: 'st-tl' }, ev.map(function (e) {
      // Aeltere Protokolle tragen nur origin; Vorgaengerversion dann aus dem abgeloesten Signal.
      var re = e.t.origin === 'RULE_VERSION_REASSESSMENT' ? ((e.s.discovery && e.s.discovery.reassessment) || { previousVersion: predecessorOf[e.s.id] ? (predecessorOf[e.s.id].version || '1.0.0') : '?', priceDataAsOf: e.t.date }) : null;
      var st = re ? 'REASSESSED' : e.t.state === 'INVALIDATED' && e.t.ruleId === 'LC-VERSION-RETIRED' ? 'RETIRED' : e.t.state;
      var txt = re ? 'Regel v' + re.previousVersion + ' → v' + e.s.version + ' · Setup auf Kursstand ' + dateShort(re.priceDataAsOf) + ' neu bewertet (' + (PHASE[e.t.state] || [0, e.t.state])[1] + ') — kein neues Marktereignis'
        : ruleText(e.t.ruleId) + (isFinite(e.t.price) ? ' · Kurs ' + num(e.t.price) : '');
      return h('li', { 'data-kind': re ? 'reassessed' : null }, [h('span', { class: 'dt', text: dateShort(e.t.date) }), h('div', null, [h('div', { class: 'r1' }, [phaseBadge(st), h('span', { class: 'm', text: e.strat ? e.strat.world_name : '' })]), h('span', { class: 'rule', title: e.t.ruleId + ' · v' + (e.t.ruleVersion || e.s.version), text: txt })])]);
    }));
  }
  function liveQuote(sym, market) {
    var slot = document.getElementById('st-live');
    fetch('/quant/data/market/intraday/index.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (idx) {
      var e = idx.entries && idx.entries[sym];
      if (!e || !e.path) throw 0;
      return fetch(e.path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (snap) {
        var pts = snap.points || []; if (!pts.length) throw 0;
        var last = pts[pts.length - 1];
        slot.innerHTML = '';
        slot.appendChild(h('strong', { text: num(last[1]) + ' USD' }));
        slot.appendChild(h('span', { text: (e.freshnessState === 'LIVE' && !snap.regularComplete ? 'IEX, verzögert · ' : 'Stand ') + dateShort(snap.sessionDate) + ' ' + last[0] + ' ET · nur Anzeige' }));
      });
    }).catch(function () { slot.innerHTML = ''; });
  }

  /* ---------------------------------------------------- Signal-Chart */
  function mountSignalChart(host, s, strat) {
    if (!s.chart || !window.STChart) return;
    host.innerHTML = '';
    host.appendChild(h('div', { class: 'st-hint', text: 'Chart wird geladen …' }));
    var weekly = s.strategyId === 'WEINSTEIN_STAGE';
    var p = weekly ? STChart.loadWeekly(s.chart.weeklyPath) : STChart.loadBars(s.chart.shard, s.symbol);
    p.then(function (bars) {
      host.innerHTML = '';
      var box = h('div', { class: 'st-chartbox' });
      host.appendChild(box);
      var lv = s.levels || {};
      var overlays = [], levels = [], boxes = [], markers = [];
      if (weekly) overlays.push({ id: 'ma30w', label: '30-Wochen-Linie', color: 'var(--ma30w)', values: STChart.sma(bars.close, 30) });
      else {
        var mas = s.strategyId === 'MINERVINI_VCP' ? [[50, 'var(--ma50)', true], [200, 'var(--ma200)', true]] : s.strategyId === 'MOMENTUM_BREAKOUT' ? [[10, 'var(--ma10)', true], [20, 'var(--ma20)', true]] : [[50, 'var(--ma50)', false]];
        mas.forEach(function (m) { overlays.push({ id: 'ma' + m[0], label: m[0] + '-Tage-Linie', color: m[1], values: STChart.sma(bars.close, m[0]), on: m[2] }); });
      }
      var asOf = s.plan ? ' · geplant, Stand ' + dateShort(s.plan.trigger.dataAsOf) : ' · geplant';
      if (isFinite(lv.trigger)) levels.push({ id: 'trigger', label: 'Trigger' + asOf, value: lv.trigger, color: 'var(--chart-trigger)' });
      if (s.entry) levels.push({ id: 'entry', label: 'Modelleinstieg ' + dateShort(s.entry.date), value: s.entry.price, color: 'var(--chart-entry)', dash: '2 3' });
      if (isFinite(s.stop)) levels.push({ id: 'stop', label: 'Stop', value: s.stop, color: 'var(--chart-stop)' });
      else if (isFinite(lv.invalidation)) levels.push({ id: 'inv', label: 'Ungültig unter' + asOf, value: lv.invalidation, color: 'var(--chart-stop)' });
      if (s.strategyId === 'DARVAS_BOX' && isFinite(lv.boxBottom)) boxes.push({ from: lv.boxTopDate, to: null, top: lv.boxTop, bottom: lv.boxBottom, color: 'var(--chart-box-darvas)', label: 'Darvas-Box (VU)' });
      if (s.strategyId === 'MOMENTUM_BREAKOUT' && lv.baseStartDate) boxes.push({ from: lv.baseStartDate, to: null, top: lv.baseHigh, bottom: lv.baseLow, color: 'var(--chart-box-base)', label: 'Basis (VU)' });
      if (s.confirmation) markers.push({ date: s.confirmation.date, price: s.confirmation.close, kind: 'confirm' });
      if (s.entry) markers.push({ date: s.entry.date, price: s.entry.price, kind: 'entry' });
      (s.exits || []).forEach(function (x, i, arr) { markers.push({ date: x.date, price: x.price, kind: i < arr.length - 1 || x.fraction < 1 ? 'partial' : 'exit' }); });
      STChart.render(box, { bars: bars, mode: weekly ? 'line' : 'candles', window: weekly ? 104 : 90, overlays: overlays, levels: levels, boxes: boxes, markers: markers, showVolume: !weekly, title: s.symbol,
        status: (s.entry ? 'Modelleinstieg ▲ zur Eröffnung am ' + dateDe(s.entry.date) + '. ' : 'Noch kein Modelleinstieg — Linien sind geplante Schwellen. ') + 'Kurse bis ' + dateDe(bars.date[bars.date.length - 1]) + '.' });
    }).catch(function () { host.innerHTML = ''; host.appendChild(emptyBox('Chart nicht verfügbar', 'Die Kursdaten für diesen Titel konnten nicht geladen werden. Es wird kein Ersatzchart gezeichnet.')); });
  }

  /* ======================================================== BACKTESTS */
  function pilotTeaser(pl) {
    var sm = pl.strategy.metrics.full, ew = pl.comparison.equalWeightUniverse.full, spy = pl.comparison.spy.full;
    return h('a', { class: 'st-pilot-t', href: BASE + 'backtests/' }, [
      h('div', { class: 'r1' }, [h('span', { class: 'st-tag', 'data-t': 'warn', text: 'Explorativ' }), h('span', { class: 'm', text: pl.method.label })]),
      h('div', { class: 'st-trio' }, [trio(pct(sm.cagr, 1, true), 'Regel p. a.'), trio(pct(ew.cagr, 1, true), 'Gleiche Aktien, gleich gewichtet'), trio(pct(spy.cagr, 1, true), 'SPY')]),
      h('p', { text: 'Explorativ, nicht validiert: nur heute gelistete Aktien (' + pl.period.from.slice(0, 4) + '–' + pl.period.to.slice(0, 4) + '). Die übrigen Methoden sind noch nicht historisch geprüft.' }),
    ]);
  }
  function trio(v, k) { return h('div', null, [h('strong', { text: v }), h('span', { text: k })]); }
  var BLOCKS = [['HISTORY', 'Historische Kurse'], ['SURVIVORSHIP', 'Delistete Titel'], ['UNIVERSE_PIT', 'Damaliges Universum'], ['CORPORATE_ACTIONS', 'Kapitalmaßnahmen'], ['PIT_FUNDAMENTALS', 'Fundamentaldaten zum Stichtag'], ['INTRADAY_HISTORY', 'Intraday-Historie'], ['EXECUTION_MODEL', 'Ausführungskosten'], ['USAGE_RIGHTS', 'Nutzungsrechte']];
  // Bausteine, die heute fuer JEDE Methode fehlen - einmal genannt statt je Methode wiederholt.
  var COMMON_GATES = ['SURVIVORSHIP', 'UNIVERSE_PIT', 'CORPORATE_ACTIONS', 'USAGE_RIGHTS'];
  function renderBacktests(D) {
    var bt = D.backtests, pl = D.pilot, reg = D.registry;
    var sc = reg.evidenceScale || {};
    main.appendChild(h('header', { class: 'st-hero sm' }, [h('div', { class: 'st-kick', text: 'Backtest Lab' }), h('h1', { text: 'Wie belastbar ist welche Methode?' }), h('p', { class: 'st-lead', text: 'Jeder Test prüft unsere VU-Version einer Methode – die im Code umgesetzte Lesart der Quellen –, nicht den Trader selbst und nicht seine Wettbewerbsergebnisse. Jede Regelversion trägt eine eigene Evidenzstufe, getrennt von der Qualität ihrer Quellen und ihrer Daten. ' + (sc.noPromise || '') })]));
    // Skala
    if (sc.levels) main.appendChild(sec('Die vier Stufen', [h('div', { class: 'st-scale' }, Object.keys(sc.levels).map(function (k) { var l = sc.levels[k]; return h('div', { class: 'lv', 'data-t': l.tone }, [h('strong', { text: l.label }), h('span', { text: l.plain })]); })), sc.publicationNote ? h('p', { class: 'st-hint', text: sc.publicationNote }) : null], { kicker: 'Evidenz' }));
    // Je Strategieversion
    var core = reg.strategies.filter(function (s) { return s.mode !== 'RESEARCH'; });
    main.appendChild(sec('Je Strategieversion', [h('div', { class: 'st-list' }, core.map(function (s) {
      var e = ev(s);
      return h('div', { class: 'st-btrow', style: worldVars(s) }, [
        h('div', { class: 'h' }, [h('a', { href: stratUrl(s), text: 'Test unserer VU-Version: ' + s.world_name + ' v' + (e.version || s.strategy_version) }), evidenceTag(s)]),
        h('div', { class: 'st-three' }, [pill('Methodentreue', fidelityOf(s)), pill('Daten', dataOf(s)), pill('Darstellung', [e.presentationLabel || '–', e.presentation === 'RESEARCH' ? 'warn' : 'mute'])]),
        e.note ? h('p', { class: 'st-hint', text: e.note }) : null,
      ]);
    }))], { kicker: 'Stufe · Quellen · Daten' }));
    main.appendChild(sec('Wie geprüft wird', [h('ul', { class: 'st-need' }, [
      h('li', null, [h('b', { text: 'Vorab festgelegt' }), ' – Universum, Zeitraum, Regeln, Kosten, Vergleich und Erfolgskriterien werden vor dem Test eingefroren.']),
      h('li', null, [h('b', { text: 'Damaliges Universum' }), ' – alle an jedem Tag gelisteten US-Aktien, einschließlich später delisteter Titel; neu vergebene Kürzel werden getrennt.']),
      h('li', null, [h('b', { text: 'Delistings ohne Schönrechnen' }), ' – drei vorab festgelegte Annahmen für den letzten Kurs; ein Ergebnis, das an dieser Annahme hängt, gilt nicht als belegt.']),
      h('li', null, [h('b', { text: 'Gleiche Regeln wie live' }), ' – derselbe Rechenkern erzeugt Live-Signale und historische Trades.']),
      h('li', null, [h('b', { text: 'Keine Nachoptimierung' }), ' – eine neue Parametervariante ist eine neue Hypothese und braucht eine spätere, unabhängige Prüfung.']),
    ])], { kicker: 'Methode' }));
    if (pl) {
      var sm = pl.strategy.metrics, cmp = pl.comparison, au = pl.audit || {}, prev = (pl.history || [])[0];
      main.appendChild(sec('Älterer explorativer Pilot', [details(pl.method.label + ' – nur heute gelistete Aktien, Wochenbasis', [
        h('div', { class: 'st-trio big' }, [trio(pct(sm.full.cagr, 1, true), 'Regel p. a.'), trio(pct(cmp.equalWeightUniverse.full.cagr, 1, true), 'Gleiche Aktien, gleich gewichtet'), trio(pct(cmp.spy.full.cagr, 1, true), 'SPY')]),
        h('p', { class: 'st-hint', text: 'Explorativ, nicht validiert: Getestet wurde nur auf heute noch gelisteten Aktien (' + pl.period.from.slice(0, 4) + '–' + pl.period.to.slice(0, 4) + ').' }),
        lineChart([{ label: 'Regel (nach Kosten)', color: 'var(--lc-strategy)', width: 2.4, points: pl.curves.strategy }, { label: 'Gleich gewichtet', color: 'var(--lc-ew)', points: pl.curves.equalWeightUniverse }, { label: 'SPY', color: 'var(--lc-spy)', dash: '4 3', points: pl.curves.spy }], { label: 'Wertentwicklung, logarithmisch' }),
        h('div', { class: 'st-mgrid' }, [
          mcell('Max. Rückgang', pct(sm.full.maxDrawdown, 0), 'Vergleich ' + pct(cmp.equalWeightUniverse.full.maxDrawdown, 0)),
          mcell('Schwankung p. a.', pct(sm.full.volatility, 0), 'Vergleich ' + pct(cmp.equalWeightUniverse.full.volatility, 0)),
          mcell('Trades', num(pl.strategy.trades.trades, 0), 'Trefferquote ' + pct(pl.strategy.trades.hitRate, 0)),
          mcell('Ø Gewinn / Verlust', pct(pl.strategy.trades.avgWin, 0, true) + ' / ' + pct(pl.strategy.trades.avgLoss, 0), 'Ø ' + num(pl.strategy.trades.avgWeeksHeld, 0) + ' Wochen gehalten'),
          mcell('2000–2015', pct(sm.inSample.cagr, 1, true) + ' p. a.', 'Vergleich ' + pct(cmp.equalWeightUniverse.inSample.cagr, 1, true)),
          mcell('2016–heute', pct(sm.outOfSample.cagr, 1, true) + ' p. a.', 'Vergleich ' + pct(cmp.equalWeightUniverse.outOfSample.cagr, 1, true)),
        ]),
        au.reconciliation ? h('div', { class: 'st-audit' }, [
          h('strong', { text: 'Nachgeprüft' }),
          h('ul', null, [
            h('li', { text: 'Rechnung stimmt: Endwert ' + num(au.reconciliation.finalEquity, 3) + ' = Start 1 + alle gebuchten Trades ' + num(au.reconciliation.closedPnl, 3) + ' + offene Positionen ' + num(au.reconciliation.openPnl, 3) + '. Stichprobe von ' + (au.tradeSample || []).length + ' Trades vom Rohkurs bis zur Rendite nachgerechnet.' }),
            prev ? h('li', { text: 'Zwei Buchungsfehler korrigiert: Positionen über Datenlücken eingefroren (bis zu 496 Wochen) und Kurssprünge ungleich behandelt. Vorher ' + pct(prev.metrics.cagr, 1, true) + ' p. a., jetzt ' + pct(sm.full.cagr, 1, true) + '. Regeln und Parameter unverändert.' }) : null,
            au.topContributors && au.topContributors[0] ? h('li', { text: 'Ergebnis hängt an wenigen Trades: Der größte (' + au.topContributors[0].symbol + ' ' + au.topContributors[0].entryWeek.slice(0, 4) + ') brachte ' + pct(au.topContributors[0].ret, 0, true) + ' – damals eine Penny-Aktie, die erst durch spätere Reverse-Splits über 5 USD erscheint. ' + (au.adjustedPriceArtifacts ? au.adjustedPriceArtifacts.trades + ' Trades dieser Art.' : '') }) : null,
            au.pnlByEntryPrice && au.pnlByEntryPrice['ab 50 USD'] ? h('li', { text: 'Verluste kamen vor allem aus teureren Aktien (Einstieg ab 10 USD), nicht aus Kleinstwerten.' }) : null,
          ]),
        ]) : null,
        details('Verzerrungen und Annahmen (' + pl.biases.length + ')', [h('div', { class: 'st-biases' }, pl.biases.map(function (b) { return h('div', { class: 'b' }, [icon(IC.info), h('div', null, [h('b', { text: b.label }), h('span', { text: b.effect })])]); })),
          h('div', { class: 'st-facts' }, [
            fact('Universum', pl.universe.series.toLocaleString('de-DE') + ' heute gelistete US-Aktien; ' + pl.universe.rule),
            fact('Regeln', 'Kauf bei Wochenschluss über dem 20-Wochen-Hoch, Verkauf unter dem 10-Wochen-Tief; Ausführung zum Schluss der Folgewoche; max. 20 Positionen'),
            fact('Kosten', '0,25 % je Seite; Kursrendite ohne Dividenden'),
            fact('Festlegung', au.runHistory || ''),
          ])]),
      ])], { kicker: 'Abgelöst durch die interne Prüfung · Version ' + (pl.spec.version || '1.0.0') }));
    }
    main.appendChild(sec('Nächste Schritte', [h('ol', { class: 'st-plan2' }, (bt.nextSteps || []).map(function (x) { return h('li', null, [h('strong', { text: x[0] }), h('span', { text: x[1] })]); }))], { kicker: 'Was als Nächstes kommt' }));
    main.appendChild(disclaimer(D.signals));
  }
  function mcell(k, v, d) { return h('div', { class: 'mc' }, [h('span', { class: 'k', text: k }), h('strong', { text: v }), h('span', { class: 'd', text: d })]); }
  function fact(k, v) { return h('div', { class: 'f' }, [h('span', { class: 'k', text: k }), h('span', { text: v })]); }

  /* ====================================================== BEISPIEL (REPLAY) */
  function replayTeaser(rp) {
    var e = rp && rp.examples && rp.examples[0];
    if (!e) return null;
    return h('a', { class: 'st-replay-t', href: BASE + 'beispiel/' }, [
      h('div', { class: 'r1' }, [h('span', { class: 'st-tag', 'data-t': 'mute', text: 'Historisches Beispiel' }), h('span', { class: 'm', text: e.symbol + ' · ' + dateShort(e.result.entry.date) + e.result.entry.date.slice(0, 4) })]),
      h('p', { text: 'So lief ein Zyklus unter der älteren Turtle-Regelversion ' + (rp.engine.version || '') + ' ab: Vorbereitung → Bestätigung per Schlusskurs → Einstieg zur nächsten Eröffnung → Stop → Ausstieg. Die laufende Version kauft per Kauf-Stop im Tagesverlauf. Echte Kurse, kein aktuelles Signal.' }),
    ]);
  }
  var KIND_LABEL = { CHANNEL_EXIT: 'Ausstieg über die Kanalregel', STOP: 'Ausstieg über den Stop' };
  function renderReplay(D) {
    var rp = D.replay, S = stratMap(D.registry);
    main.appendChild(h('header', { class: 'st-hero sm' }, [h('div', { class: 'st-kick', text: 'Historisches Beispiel' }), h('h1', { text: 'So läuft ein Modell-Zyklus ab' }), h('p', { class: 'st-lead', text: 'Ein vergangenes Beispiel, an echten Kursen nachgespielt – Schritt für Schritt. Es folgt der älteren Turtle-Regelversion ' + ((rp && rp.engine && rp.engine.version) || '') + ' (Bestätigung per Schlusskurs); die laufende Version kauft per Kauf-Stop im Tagesverlauf und unterscheidet sich in Einstieg und Ausstieg.' })]));
    if (!rp || !rp.examples || !rp.examples.length) { main.appendChild(emptyBox('Kein Beispiel verfügbar', 'Im vorhandenen Kurszeitraum gibt es keinen vollständig abgeschlossenen Zyklus.')); main.appendChild(disclaimer(D.signals)); return; }
    var strat = S[rp.engine.strategyId]; setWorld(strat);
    main.appendChild(h('div', { class: 'st-demo-banner' }, [icon(IC.info), h('div', null, [h('strong', { text: rp.labelText }), h('span', { text: 'Nicht im Signalprotokoll, in keiner Kennzahl, keine Empfehlung. Auswahl nach fester Regel, nicht nach Ergebnis: ' + rp.selection })])]));
    var tabs = h('div', { class: 'st-chips lens', role: 'tablist' });
    var panel = h('div');
    function show(ex) {
      Array.prototype.forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', String(b._e === ex)); });
      panel.innerHTML = '';
      var sg = ex.signal, tr = sg.transitions || [];
      var first = tr[0], conf = tr.filter(function (t) { return t.state === 'TRIGGERED'; })[0], ent = tr.filter(function (t) { return t.state === 'ACTIVE' && t.ruleId === 'LC-MODEL-ENTRY'; })[0];
      var ex1 = ex.result.exit, r = ex.result;
      var steps = [
        [first.date, 'Vorbereitet', 'Liquide Aktie nahe dem 20-Tage-Hoch. Geplanter Trigger ' + num(first.trigger || ex.checks.triggerAtConfirmation) + ', ungültig unter ' + num(first.invalidation) + '.'],
        conf ? [conf.date, 'Einstieg bestätigt', 'Tagesschluss ' + num(ex.checks.confirmationClose) + ' über dem Trigger ' + num(ex.checks.triggerAtConfirmation) + '. Gekauft wird erst am nächsten Morgen.'] : null,
        ent ? [ent.date, 'Modelleinstieg zur Eröffnung', 'Eröffnung ' + num(ex.checks.entryRawOpen) + ' + ' + num((r.entry.price / ex.checks.entryRawOpen - 1) * 100, 2) + ' % Ausführungsannahme = ' + num(r.entry.price) + '. Stop ' + num(sg.initialStop) + ' (2 × Tagesspanne N darunter).'] : null,
        [ex1.date, KIND_LABEL[ex.kind] || 'Ausstieg', (ex.kind === 'STOP' ? (ex.checks.exitBasis === 'OPEN_BELOW_STOP' ? 'Eröffnung unter dem Stop – Ausstieg zum Eröffnungskurs ' + num(ex1.price) + ' (Gap-Regel).' : 'Stop gerissen – Ausstieg zu ' + num(ex1.price) + '.') : 'Schluss unter dem 10-Tage-Tief → Ausstieg zur nächsten Eröffnung ' + num(ex1.price) + '.')],
      ].filter(Boolean);
      panel.appendChild(h('div', { class: 'st-lensblock', style: worldVars(strat) }, [
        h('div', { class: 'r1' }, [phaseBadge('CLOSED'), h('span', { class: 'since', text: KIND_LABEL[ex.kind] })]),
        h('div', { class: 'st-cells' }, [
          h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Einstieg' }), h('strong', { text: num(r.entry.price) }), h('span', { class: 'd', text: dateShort(r.entry.date) + ' Eröffnung' })]),
          h('div', { class: 'c bad' }, [h('span', { class: 'k', text: 'Stop' }), h('strong', { text: num(sg.initialStop) }), h('span', { class: 'd', text: '2N unter Einstieg' })]),
          h('div', { class: 'c' }, [h('span', { class: 'k', text: 'Ausstieg' }), h('strong', { text: num(ex1.price) }), h('span', { class: 'd', text: dateShort(ex1.date) })]),
        ]),
        h('div', { class: 'st-next' }, [h('span', { class: 'k', text: 'Ergebnis dieses Beispiels' }), h('p', { text: pct(r.returnBeforeCosts, 1, true) + ' vor Kosten nach ' + r.sessionsHeld + ' Handelstag' + (r.sessionsHeld === 1 ? '' : 'en') + '.' }), h('span', { class: 'r', text: 'Ein Einzelfall – keine Aussage über die Methode.' })]),
      ]));
      panel.appendChild(sec('Ablauf', [h('ol', { class: 'st-flow' }, steps.map(function (x) { return h('li', null, [h('span', { class: 'dt', text: dateDe(x[0]) }), h('div', null, [h('strong', { text: x[1] }), h('span', { text: x[2] })])]); }))]));
      var host = h('div'); panel.appendChild(sec(ex.symbol + ' im Chart', [host], { kicker: 'Echte Tageskurse' }));
      if (window.STChart) STChart.loadBars(ex.chart.shard, ex.symbol).then(function (bars) {
        var a = bars.date.indexOf(ex.window.from), b = bars.date.indexOf(ex.window.to);
        if (a < 0) a = 0; if (b < 0) b = bars.date.length - 1;
        var cut = {}; Object.keys(bars).forEach(function (k) { cut[k] = Array.isArray(bars[k]) ? bars[k].slice(a, b + 1) : bars[k]; });
        var box = h('div', { class: 'st-chartbox' }); host.appendChild(box);
        var markers = [];
        if (sg.confirmation) markers.push({ date: sg.confirmation.date, price: sg.confirmation.close, kind: 'confirm' });
        markers.push({ date: r.entry.date, price: r.entry.price, kind: 'entry' });
        markers.push({ date: ex1.date, price: ex1.price, kind: 'exit' });
        STChart.render(box, { bars: cut, mode: 'candles', window: cut.date.length, overlays: [], levels: [{ id: 'trig', label: 'Trigger', value: ex.checks.triggerAtConfirmation, color: 'var(--chart-trigger)' }, { id: 'stop', label: 'Stop', value: sg.initialStop, color: 'var(--chart-stop)' }], boxes: [], markers: markers, showVolume: true, title: ex.symbol, status: 'Historisch: ' + dateDe(ex.window.from) + ' – ' + dateDe(ex.window.to) + '. Kein aktuelles Signal.' });
      }).catch(function () { host.appendChild(emptyBox('Chart nicht verfügbar', 'Die Kursdaten konnten nicht geladen werden.')); });
      panel.appendChild(sec('Protokoll', [timeline([{ s: sg, id: rp.engine.strategyId }], S)], { kicker: 'Jeder Zustandswechsel mit Regel und Kurs' }));
    }
    rp.examples.forEach(function (ex) { var b = h('button', { type: 'button', role: 'tab', style: worldVars(strat), onclick: function () { show(ex); } }, [ex.symbol + ' · ' + (ex.kind === 'STOP' ? 'Stop' : 'Kanal-Ausstieg')]); b._e = ex; tabs.appendChild(b); });
    main.appendChild(tabs); main.appendChild(panel); show(rp.examples[0]);
    main.appendChild(disclaimer(D.signals));
  }

  /* ========================================================== QUELLEN */
  function renderSources(D) {
    var src = D.sources.sources, reg = D.registry;
    main.appendChild(h('header', { class: 'st-hero sm' }, [h('div', { class: 'st-kick', text: 'Quellen' }), h('h1', { text: 'Woher die Regeln stammen' }), h('p', { class: 'st-lead', text: D.sources.retrievalNote })]));
    reg.strategies.filter(function (s) { return s.sources && s.sources.length; }).forEach(function (s) {
      main.appendChild(details(s.world_name + ' (' + s.sources.length + ')', [h('ul', { class: 'st-ul' }, s.sources.map(function (sid) { var x = D.srcMap[sid]; if (!x) return h('li', { text: sid }); return h('li', null, [x.url ? h('a', { href: x.url, rel: 'noopener', target: '_blank', text: x.title }) : x.title, ' — ' + x.author + (x.url_verification === 'NO_URL_FOUND' ? ' (ohne URL)' : '') + (x.content_retrieved_by_vu ? '' : ' · Inhalt nicht von VU geprüft')]); }))]));
    });
    main.appendChild(h('p', { class: 'st-hint', text: D.sources.policy }));
    main.appendChild(disclaimer(D.signals));
  }

  /* ============================================================= BOOT */
  var NEED = { home: ['registry', 'signals', 'market', 'pilot', 'replay', 'trend52'], strategies: ['registry', 'signals', 'market', 'pilot', 'trend52'], strategy: ['registry', 'signals', 'market', 'pilot', 'sources', 'backtests', 'portfolio', 'trend52'], signals: ['registry', 'signals', 'market'], stock: ['registry', 'signals', 'market', 'portfolio', 'trend52'], backtests: ['registry', 'signals', 'market', 'backtests', 'pilot'], replay: ['registry', 'signals', 'market', 'replay'], sources: ['registry', 'signals', 'market', 'sources'] };
  var FILE = { registry: 'registry.json', signals: 'signals.json', market: 'market.json', backtests: 'backtests.json', pilot: 'pilot-backtest.json', replay: 'replay.json', sources: 'sources.json', portfolio: 'portfolio.json', trend52: 'trend52.json' };
  var need = NEED[page] || NEED.home;
  /* Signale nur so weit laden, wie die Seite sie braucht (vorher 3,3 MB auf
     jeder Seite): Aktienseite ihren Ausschnitt, Signalliste alles, der Rest
     signals-core.json. Welche Ausschnitte existieren, sagt build.json
     (slices); ohne diese Angabe (alter Datenstand) oder fuer ein Symbol ohne
     Ausschnitt laedt die Seite direkt die vollstaendige Datei - ohne
     vergebliche Anfrage. */
  var SYM = (body.getAttribute('data-symbol') || new URLSearchParams(location.search).get('s') || '').toUpperCase();
  var BUILD = null;
  function build() { return BUILD || (BUILD = getJSON('build.json').catch(function () { return null; })); }
  function load(k) {
    /* Regeltexte braucht nur die Strategie-Detailseite. */
    if (k === 'registry') return build().then(function (b) { return page !== 'strategy' && b && b.slices && b.slices.registry
      ? getJSON('registry-core.json').catch(function () { return getJSON(FILE.registry); }) : getJSON(FILE.registry); });
    if (k !== 'signals' || page === 'signals') return getJSON(FILE[k]);
    return build().then(function (b) {
      var sl = b && b.slices, part = null;
      if (sl && page === 'stock') part = (sl.stock || []).indexOf(SYM) >= 0 ? 'stock/' + SYM + '.json' : null;
      else if (sl) part = 'signals-core.json';
      if (!part) return getJSON(FILE.signals);
      return getJSON(part).then(function (s) {
        if (page === 'stock') { s.asOf = b.asOf; s.inputsGeneratedAt = b.inputsGeneratedAt; }
        return s;
      }).catch(function () { return getJSON(FILE.signals); });
    });
  }
  Promise.all(need.map(function (k) { return load(k).catch(function (e) { if (k === 'pilot' || k === 'replay' || k === 'portfolio' || k === 'trend52') return null; throw e; }); })).then(function (res) {
    var D = {}; need.forEach(function (k, i) { D[k] = res[i]; });
    D.srcMap = D.sources ? byId(D.sources.sources, 'source_id') : {};
    if (D.registry) D.registry.strategies.forEach(function (x) { if (x.pending_semantics === 'WATCHLIST' && !isResearchS(x)) WATCH[x.strategy_id] = x.watchlist_label || 'Beobachtung'; if (isResearchS(x)) RESEARCH[x.strategy_id] = true; }); if (D.registry) HAS_CURRENT = D.registry.strategies.some(function (x) { return x.mode === 'LIVE' && !isResearchS(x); });
    main.innerHTML = '';
    chrome(D.signals.asOf);
    ({ home: renderHome, strategies: renderStrategies, strategy: renderStrategy, signals: renderSignals, stock: renderStock, backtests: renderBacktests, replay: renderReplay, sources: renderSources }[page] || renderHome)(D);
  }).catch(function (e) {
    main.innerHTML = '';
    main.appendChild(emptyBox('Supertrader konnte nicht geladen werden', 'Die Daten sind gerade nicht erreichbar (' + (e && e.message) + '). Bitte später erneut versuchen.'));
  });
})();
