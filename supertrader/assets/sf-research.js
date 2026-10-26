/* Vision Universe® — Supertrader: quellentreue Research-Kandidaten (Supertrader 8.0)
   Wird von supertrader.js bei Bedarf nachgeladen (Start, Methoden, Aktienseite). Liest ausschließlich
   /supertrader/data/sf-candidates/ (summary.json, strategy/<Cxx>.json, ticker/<shard>.json) und für den Chart die
   kanonischen Kursartefakte über STChart. Der Browser rechnet keine Stufe und keinen Plan nach: er zeigt, was im
   Datensatz steht. Stufen: Chart-Kandidat, bestätigtes Research-Setup, modellierter Handelsablauf. Die höchste Stufe
   ist für alle 13 Methoden gesperrt. Keine Empfehlungen, keine Orders. */
(function () {
  'use strict';
  var DATA = '/supertrader/data/sf-candidates/';
  var STAGES = ['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN'];
  var STAGE_TXT = {
    CHART_CANDIDATE: ['Chart-Kandidat', 'chart', 'Ein Chartmuster der Methode ist erkannt. Keine Aussage über ein vollständiges Setup.'],
    CONFIRMED_RESEARCH_SETUP: ['Bestätigtes Setup', 'setup', 'Alle mechanischen Setup-Regeln der Methode sind am Stichtag erfüllt. Ermessensfragen bleiben offen.'],
    MODELED_TRADE_PLAN: ['Modellierter Ablauf', 'model', 'Das Forschungsmodell liefert zusätzlich hypothetische Einstiegs- und Stop-Marken. Keine Order, keine Empfehlung.'],
  };
  var LOCKED_TXT = 'Die oberste Stufe ist für alle 13 Methoden gesperrt: keine Freigabe, kein Live-Betrieb.';
  var DISCLAIMER = 'Research-Ergebnisse regelbasierter Modelle. Keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung, keine Aussage zur Handelbarkeit.';
  var WHY_TXT = {
    STRATEGY_CEILING: 'Die Methode ist heute höchstens bis zu dieser Stufe freigegeben',
    SETUP_RULE_NOT_MET: 'Mechanische Regel nicht erfüllt',
    PLAN_NOT_MODELLED: 'Kein modellierter Ablauf',
    NO_MECHANICAL_SETUP_RULE_IN_CONTRACT: 'Die Methode hat keine mechanische Setup-Regel – nur Chart-Kandidaten',
    DATA_QUARANTINE_V4_D1: 'Auffällige Kurssprünge im Rückblick (Quarantäne)',
    DATA_QUARANTINE_LOOKBACK_COVERAGE: 'Rückblick der Kursdaten nicht vollständig prüfbar',
    DATA_SESSIONS: 'Fehlende Handelstage in der Kursreihe',
    DATA_LIQUIDITY_RESEARCH_UNIVERSE: 'Unter der Liquiditätsgrenze des Forschungsuniversums',
    DATA_IDENTITY_INSTRUMENT_TYPE: 'Instrument nicht im Security Master bestätigt',
    DATA_IDENTITY_SPAC_NAME_HINT: 'Mantelgesellschaft (SPAC): Kursmuster ohne Aussagekraft',
    DATA_IDENTITY_LISTING_CONTINUITY: 'Reihe nach Listing-Unterbrechung neu begonnen',
    DATA_ADJUSTMENT: 'Abgleich der Corporate Actions unbekannt',
  };
  var PLAN_BLOCK_TXT = {
    TURTLE_ENTRY_IS_INTRADAY_ON_ASOF_NOT_MODELLED_FOR_NEXT_SESSION: 'Der Einstieg der Quelle liegt intraday am Stichtag; für die Folgesitzung ist kein Ablauf freigegeben.',
    NO_SETUP_PROXY_BREAKOUT_AT_ASOF: 'Kein Ausbruch aus der Konsolidierung am Stichtag.',
    MANUAL_REVIEW_SETUP: 'Korrektur über 10 %: VCP-Charakter muss geprüft werden.',
    CONTEXT_PROXY_MA50_NOT_MET: 'Schluss vor dem Gap nicht über der 50-Tage-Linie.',
    NOT_ALL_TIME_HIGH_LONG_HISTORY: 'Kein Allzeithoch in der langen Kurshistorie.',
    ATH_NOT_CHECKABLE_NO_LONG_SERIES: 'Allzeithoch nicht prüfbar: keine lange Kursreihe.',
    ALREADY_ABOVE_PIVOT: 'Schluss bereits über dem Pivot.',
    PLANNED_LOSS_ABOVE_10PCT: 'Geplanter Verlust bis zum Stop über 10 %.',
    OUTSIDE_RESEARCH_UNIVERSE: 'Außerhalb des Forschungsuniversums.',
    VOLUME_BELOW_STANDARD_EXCEPTION_REVIEW: 'Volumen unter dem 1,5-fachen Durchschnitt.',
  };
  var DQ_TXT = {
    QUARANTINE_V4_D1: 'Kurssprung im Rückblick', QUARANTINE_LOOKBACK_COVERAGE: 'Rückblick unvollständig', SESSIONS: 'Handelstage fehlen',
    LIQUIDITY_RESEARCH_UNIVERSE: 'geringe Liquidität', IDENTITY_SPAC_NAME_HINT: 'Mantelgesellschaft', IDENTITY_ADR_LISTING: 'ADR-Listing',
    IDENTITY_INSTRUMENT_TYPE: 'Identität offen', IDENTITY_LISTING_CONTINUITY: 'Listing-Unterbrechung', ADJUSTMENT: 'Adjustierung offen',
  };

  /* ------------------------------------------------------------ Helfer */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var cache = {};
  function getJSON(rel) { if (!cache[rel]) cache[rel] = fetch(DATA + rel, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); return cache[rel]; }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, d) { if (!fin(v)) return '–'; return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }); }
  function usd(v) { return fin(v) ? num(v) + ' $' : '–'; }
  function pct(v, d, signed) { if (!fin(v)) return '–'; var s = num(v * 100, d === undefined ? 1 : d) + ' %'; return signed && v > 0 ? '+' + s : s; }
  function times(v) { return fin(v) ? num(v, 1) + '×' : '–'; }
  function dateDe(d) { if (!d) return '–'; var p = String(d).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function icon(path) { var i = h('span', { class: 'st-ic', 'aria-hidden': 'true' }); i.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; return i; }
  var IC = { check: '<path d="M5 12l5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', open: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', arrow: '<path d="M9 6l6 6-6 6"/>', alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>' };
  function stageBadge(st) { var t = STAGE_TXT[st] || [st, 'chart']; return h('span', { class: 'sf-stage', 'data-s': t[1], text: t[0] }); }
  function stockUrl(sym) { return '/supertrader/stock/?s=' + encodeURIComponent(sym) + '#sf'; }
  function stratUrl(cid) { return '/supertrader/strategies/?sf=' + encodeURIComponent(cid); }
  function ruleText(L, id) { return (L && L[id]) || 'Regel der Methode'; }
  function sec(title, kids, opts) {
    opts = opts || {};
    return h('section', { class: 'st-sec vu-sec sf-sec', id: opts.id || null }, [h('div', { class: 'st-sec-h vu-sec-head' }, [h('div', null, [opts.kicker ? h('div', { class: 'st-kick vu-eyebrow', text: opts.kicker }) : null, h('h2', { class: 'vu-sec-title', text: title })]), opts.more || null])].concat(kids));
  }
  function moreBox(summary, kids) { return h('details', { class: 'vu-more st-vmore sf-more' }, [h('summary', { text: summary }), h('div', { class: 'vu-more-body' }, kids)]); }
  function kpis(list) { return h('ul', { class: 'vu-kpis st-vkpis sf-kpis' }, list.map(function (k) { return h('li', { class: 'vu-kpi' }, [h('span', { class: 'vu-kpi-label', text: k[1] }), h('strong', { class: 'vu-kpi-value', text: k[0] }), k[2] ? h('span', { class: 'vu-kpi-sub', text: k[2] }) : null]); })); }
  function empty(title, text) { return h('div', { class: 'st-emptybox sf-empty' }, [h('strong', { text: title }), h('p', { text: text })]); }
  function unavailable() {
    return empty('Research-Kandidaten noch nicht verfügbar', 'Die Erkennung für die 13 quellentreuen Methoden ist vorbereitet, aber der tägliche Datenlauf ist noch nicht freigeschaltet. Sobald er läuft, erscheinen hier die erkannten Aktien mit Datenstand.');
  }
  function stagesLegend() {
    return h('ul', { class: 'sf-legend' }, STAGES.map(function (s) { return h('li', null, [stageBadge(s), h('span', { text: STAGE_TXT[s][2] })]); }).concat([h('li', null, [h('span', { class: 'sf-stage', 'data-s': 'locked' }, [icon(IC.lock), 'Oberste Stufe']), h('span', { text: LOCKED_TXT })])]));
  }
  function footnote(sum) {
    return h('p', { class: 'sf-foot', text: (sum ? 'Datenstand ' + dateDe(sum.asOf) + ' (Tagesschluss). ' : '') + DISCLAIMER });
  }
  function stratName(S, cid) { var s = S[cid]; return s ? s.name : cid; }
  function byCid(sum) { var m = {}; (sum.strategies || []).forEach(function (s) { m[s.candidateId] = s; }); return m; }

  /* ----------------------------------------------- kompakte Kandidatenzeile */
  function row(r, S, opts) {
    opts = opts || {};
    var dist = fin(r.pd) ? h('span', { class: 'sf-num', title: 'Abstand des Schlusskurses zum Pivot', text: pct(r.pd, 1, true) }) : null;
    return h('a', { class: 'sf-row', href: stockUrl(r.t), 'data-stage': r.s }, [
      h('div', { class: 'sf-row-main' }, [h('strong', { class: 'sf-sym', text: r.t }), h('span', { class: 'sf-nm', text: r.n || '' })]),
      h('div', { class: 'sf-row-meta' }, [opts.hideStrategy ? null : h('span', { class: 'sf-meth', text: stratName(S, r.c) }), stageBadge(r.s)]),
      h('div', { class: 'sf-row-num' }, [dist, fin(r.v) ? h('span', { class: 'sf-num sf-dim', title: 'Volumen ggü. 50-Tage-Schnitt', text: times(r.v) }) : null, icon(IC.arrow)]),
    ]);
  }

  /* ================================================== START: Übersicht */
  function mountHome(main) {
    var host = h('div', { class: 'sf-host', id: 'sf' });
    var hero = main.querySelector('.st-hero');
    if (hero && hero.nextSibling) main.insertBefore(host, hero.nextSibling); else main.appendChild(host);
    getJSON('summary.json').then(function (sum) {
      var S = byCid(sum), c = sum.counts.byStage, filter = { stage: null, cid: null };
      var list = h('div', { class: 'sf-rows' });
      function draw() {
        var rows = [];
        Object.keys(sum.top).forEach(function (cid) { if (!filter.cid || filter.cid === cid) rows = rows.concat(sum.top[cid]); });
        rows = rows.filter(function (r) { return !filter.stage || r.s === filter.stage; });
        rows.sort(function (a, b) { return STAGES.indexOf(b.s) - STAGES.indexOf(a.s) || a.r - b.r || (a.c < b.c ? -1 : 1); });
        list.replaceChildren.apply(list, rows.length ? rows.slice(0, filter.cid ? 5 : 6).map(function (r) { return row(r, S, { hideStrategy: !!filter.cid }); }) : [empty('Keine Kandidaten', 'Für diese Auswahl erkennt heute keine Methode eine Aktie.')]);
      }
      var stageChips = chipRow([[null, 'Alle', sum.counts.candidates]].concat(STAGES.slice().reverse().map(function (s) { return [s, STAGE_TXT[s][0], c[s]]; })), function (v) { filter.stage = v; draw(); });
      var stratChips = chipRow([[null, 'Alle Methoden', null]].concat(sum.strategies.map(function (s) { return [s.candidateId, s.name.replace(/ \(.*\)$/, ''), s.counts.published]; })), function (v) { filter.cid = v; draw(); });
      draw();
      host.appendChild(sec('Heute erkannte Aktien', [
        kpis([[num(sum.counts.candidates, 0), 'Kandidaten', '13 Methoden'], [num(c.MODELED_TRADE_PLAN, 0), 'Modellierte Abläufe'], [num(c.CONFIRMED_RESEARCH_SETUP, 0), 'Bestätigte Setups'], [dateDe(sum.asOf), 'Datenstand', 'Tagesschluss']]),
        stageChips, stratChips, list,
        h('p', null, [h('a', { class: 'st-more', href: '/supertrader/strategies/#sf' }, ['Alle 13 Methoden', icon(IC.arrow)])]),
        moreBox('Was bedeuten die Stufen?', [stagesLegend(), h('p', { class: 'st-hint', text: 'Je Methode zählt eine eigene Reihenfolge (Stufe, Datenqualität, dann Abstand zum Pivot, Volumen oder Momentum). Die Methoden werden nicht miteinander verrechnet.' })]),
        footnote(sum),
      ], { kicker: 'Quellentreue Methoden · Research', id: 'sf-home' }));
    }).catch(function () { host.appendChild(sec('Heute erkannte Aktien', [unavailable(), stagesLegend()], { kicker: 'Quellentreue Methoden · Research', id: 'sf-home' })); });
  }
  function chipRow(items, onPick) {
    var wrap = h('div', { class: 'st-chips sf-chips', role: 'group' });
    items.forEach(function (it, i) {
      var b = h('button', { type: 'button', 'aria-pressed': i === 0 ? 'true' : 'false', onclick: function () { Array.prototype.forEach.call(wrap.children, function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); onPick(it[0]); } }, [it[1], fin(it[2]) ? h('span', { class: 'n', text: num(it[2], 0) }) : null, it[3] ? stageBadge(it[3]) : null]);
      wrap.appendChild(b);
    });
    return wrap;
  }

  /* ======================================== METHODEN: Liste und Ansicht */
  function mountStrategies(main) {
    var cid = new URLSearchParams(location.search).get('sf');
    if (cid) return mountStrategy(main, cid);
    var host = h('div', { class: 'sf-host', id: 'sf' });
    var foot = main.querySelector('.st-foot');
    main.insertBefore(host, foot || null);
    getJSON('summary.json').then(function (sum) {
      host.appendChild(sec('Quellentreue Methoden (13)', [
        h('p', { class: 'st-hint', text: 'Regeln nach den Originalquellen, getrennt von den Modellbeobachtungen oben. Jede Methode erkennt heutige Kandidaten auf Tagesschlusskursen.' }),
        h('div', { class: 'st-list sf-strats' }, sum.strategies.map(function (s) { return stratCard(s); })),
        moreBox('Was bedeuten die Stufen?', [stagesLegend()]), footnote(sum),
      ], { kicker: 'Research · alle nicht für den Live-Betrieb freigegeben' }));
    }).catch(function () { host.appendChild(sec('Quellentreue Methoden (13)', [unavailable()], { kicker: 'Research' })); });
  }
  function stratCard(s) {
    var b = s.counts.byStage;
    return h('a', { class: 'sf-strat', href: stratUrl(s.candidateId) }, [
      h('div', { class: 'top' }, [h('div', null, [h('h3', { text: s.name }), h('div', { class: 'who', text: s.author + ' · ' + s.family + ' · ' + s.timeframe })]), h('div', { class: 'cnt' }, [h('strong', { text: num(s.counts.published, 0) }), h('span', { text: 'heute' })])]),
      h('div', { class: 'sf-strat-st' }, [h('span', { class: 'sf-cap', text: 'höchstens' }), stageBadge(s.ceiling), b.MODELED_TRADE_PLAN ? h('span', { class: 'sf-mini', text: num(b.MODELED_TRADE_PLAN, 0) + ' modelliert' }) : null, s.direction === 'SHORT_RESEARCH_ONLY' ? h('span', { class: 'st-tag', 'data-t': 'warn', text: 'Short · nur Forschung' }) : null]),
      h('p', { class: 'sf-strat-why', text: s.short }),
    ]);
  }

  function mountStrategy(main, cid) {
    // eigene Ansicht der Methode: der Inhalt der Methodenliste wird ersetzt, Kopf, Produktzeile und Dock bleiben
    var keep = main.querySelector('.st-productline'), foot = main.querySelector('.st-foot');
    main.replaceChildren.apply(main, [keep].filter(Boolean));
    var host = h('div', { class: 'sf-host sf-view', id: 'sf' });
    main.appendChild(host); if (foot) main.appendChild(foot);
    Promise.all([getJSON('summary.json'), getJSON('strategy/' + cid + '.json')]).then(function (res) {
      var sum = res[0], data = res[1], S = byCid(sum), s = S[cid];
      if (!s) throw new Error('unbekannt');
      document.title = s.name + ' – quellentreu · Supertrader';
      var L = sum.ruleLabels, views = data.views, state = { stage: null, q: '', sort: 'default', limit: 30 };
      var byS = s.counts.byStage;
      host.appendChild(h('header', { class: 'st-hero sm sf-hero' }, [h('div', { class: 'st-kick', text: s.author + ' · quellentreu · Stand ' + dateDe(data.asOf) }), h('h1', { text: s.name }), h('p', { class: 'st-lead', text: s.short }), h('div', { class: 'sf-strat-st' }, [h('span', { class: 'sf-cap', text: 'höchstens' }), stageBadge(s.ceiling)])]));
      host.appendChild(kpis([[num(views.length, 0), 'Kandidaten', s.recognises], [num(byS.MODELED_TRADE_PLAN || 0, 0), 'Modelliert'], [num(byS.CONFIRMED_RESEARCH_SETUP || 0, 0), 'Bestätigt']]));
      var list = h('div', { class: 'sf-cards' });
      var sorts = [['default', 'Methodenreihenfolge']].concat(Object.keys(sum.sortKeys).filter(function (k) { return k !== 'stage' && (k !== 'momentum' || cid === 'C08') && (k !== 'streak' || cid === 'C10') && (k !== 'setupState' || cid === 'C06'); }).map(function (k) { return [k, sum.sortKeys[k].label]; }));
      var sel = h('select', { class: 'sf-select', 'aria-label': 'Sortierung', onchange: function () { state.sort = sel.value; state.limit = 30; draw(); } }, sorts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      var search = h('input', { class: 'sf-search', type: 'search', placeholder: 'Ticker oder Name', 'aria-label': 'Kandidaten durchsuchen', oninput: function () { state.q = search.value.trim().toLowerCase(); state.limit = 30; draw(); } });
      var counts = {}; views.forEach(function (v) { counts[v.stage] = (counts[v.stage] || 0) + 1; });
      var chips = chipRow([[null, 'Alle', views.length]].concat(STAGES.slice().reverse().filter(function (x) { return counts[x]; }).map(function (x) { return [x, STAGE_TXT[x][0], counts[x]]; })), function (v) { state.stage = v; state.limit = 30; draw(); });
      function keyOf(v, k) { var x = v.sortKeys ? v.sortKeys[k] : null; return x === undefined ? null : x; }
      function draw() {
        var vs = views.filter(function (v) { return (!state.stage || v.stage === state.stage) && (!state.q || v.ticker.toLowerCase().indexOf(state.q) >= 0 || String(v.companyName || '').toLowerCase().indexOf(state.q) >= 0); });
        if (state.sort !== 'default') { var dir = sum.sortKeys[state.sort].dir === 'asc' ? 1 : -1; vs = vs.slice().sort(function (a, b) { var x = keyOf(a, state.sort), y = keyOf(b, state.sort); if (x === y) return a.rank - b.rank; if (x === null) return 1; if (y === null) return -1; return (x < y ? -1 : 1) * dir; }); }
        var shown = vs.slice(0, state.limit);
        var kids = shown.length ? shown.map(function (v) { return card(v, s, L, { compact: true }); }) : [empty('Keine Kandidaten', views.length ? 'Kein Kandidat passt zur Auswahl.' : 'Heute erkennt die Methode keine Aktie. Das ist ein gültiges Ergebnis, kein Fehler.')];
        if (vs.length > shown.length) kids.push(h('button', { type: 'button', class: 'sf-moreBtn', onclick: function () { state.limit += 30; draw(); }, text: 'Weitere ' + Math.min(30, vs.length - shown.length) + ' von ' + (vs.length - shown.length) + ' anzeigen' }));
        list.replaceChildren.apply(list, kids);
      }
      sorts[0][1] = 'Methodenreihenfolge (' + s.sortOrder.filter(function (k) { return k !== 'ticker'; }).map(function (k) { return (sum.sortKeys[k] || {}).label || k; }).join(', ') + ')';
      sel.options[0].textContent = sorts[0][1];
      host.appendChild(sec('Kandidaten', [h('div', { class: 'sf-tools' }, [search, sel]), chips, list], { kicker: 'Rangliste' }));
      draw();
      host.appendChild(sec('Methode und Grenzen', [
        moreBox('Was die Erkennung prüft', [ruleList(s.rules.mechanicalSetupRules, L, 'check'), h('p', { class: 'st-hint', text: 'Datenbedarf: ' + s.dataNeeds.why + '.' })]),
        s.rules.discretionaryRules.length ? moreBox('Offen für die eigene Prüfung (' + s.rules.discretionaryRules.length + ')', [ruleList(s.rules.discretionaryRules, L, 'open'), h('p', { class: 'st-hint', text: 'Diese Regeln verlangen nach der Quelle ein Urteil. Die Erkennung entscheidet sie nicht.' })]) : null,
        s.rules.dataBlockedRules.length ? moreBox('Ohne Daten nicht prüfbar (' + s.rules.dataBlockedRules.length + ')', [ruleList(s.rules.dataBlockedRules, L, 'lock'), h('p', { class: 'st-hint', text: 'Ein Ersatzwert hebt diese Sperre nicht auf.' })]) : null,
        s.readings.length ? moreBox('Gewählte Lesarten mehrdeutiger Regeln', [ruleList(s.readings.map(function (r) { return r.ruleId; }), L, 'open')]) : null,
        moreBox('Stufen', [stagesLegend()]),
      ], { kicker: 'Aufklappbar' }));
      host.appendChild(footnote(sum));
    }).catch(function () { host.appendChild(empty('Methode nicht verfügbar', 'Für diese Methode liegen keine Research-Kandidaten vor.')); host.appendChild(unavailable()); });
  }
  function ruleList(ids, L, kind) {
    return h('ul', { class: 'sf-rules' }, ids.map(function (id) { return h('li', { 'data-k': kind }, [icon(IC[kind] || IC.check), h('span', { text: ruleText(L, id) })]); }));
  }

  /* ----------------------------------------------- Kandidatenkarte */
  function card(v, s, L, opts) {
    opts = opts || {};
    var p = v.pivot, t = v.trend || {};
    var head = h('div', { class: 'sf-card-h' }, [
      h('div', { class: 'sf-card-id' }, opts.compact ? [h('a', { class: 'sf-sym', href: stockUrl(v.ticker), text: v.ticker }), h('span', { class: 'sf-nm', text: v.companyName || '' })] : [h('strong', { class: 'sf-meth', text: s ? s.name : v.candidateId })]),
      stageBadge(v.stage),
    ]);
    var nums = h('dl', { class: 'sf-nums' }, [
      pair('Schluss', usd(v.close)),
      p ? pair('Pivot', usd(p.level), pct(p.distance, 1, true)) : null,
      pair('Volumen', times(t.volumeVs50d), '50-Tage-Schnitt'),
      pair('Trend', pct(t.ret63, 0, true), '63 Tage'),
    ]);
    var met = (v.met || []).map(function (id) { return h('li', { 'data-k': 'check' }, [icon(IC.check), h('span', { text: ruleText(L, id) })]); });
    var notMet = (v.notMet || []).map(function (id) { return h('li', { 'data-k': 'x' }, [icon(IC.x), h('span', { text: ruleText(L, id) })]); });
    var why = (v.why || []).filter(function (w) { return w.code !== 'STAGE' && w.code !== 'SETUP_RULE_NOT_MET'; }).map(function (w) {
      var txt = w.code === 'PLAN_NOT_MODELLED' ? (PLAN_BLOCK_TXT[w.detail] || 'Für diese Aktie entsteht kein modellierter Ablauf.') : WHY_TXT[w.code] || 'Begrenzung der Stufe';
      return h('li', { 'data-k': 'lock' }, [icon(IC.lock), h('span', { text: txt + (w.stage && w.code === 'STRATEGY_CEILING' ? ': ' + STAGE_TXT[w.stage][0] : '') })]);
    });
    var dq = (v.dataQuality.notPass || []).map(function (d) { return DQ_TXT[d.id] || null; }).filter(Boolean);
    var body = [
      nums,
      h('div', { class: 'sf-why' }, [h('h4', { text: 'Warum erkannt' }), h('ul', { class: 'sf-rules' }, met.length ? met : [h('li', { 'data-k': 'check' }, [icon(IC.check), h('span', { text: 'Chartmuster der Methode am Stichtag' })])])]),
      notMet.length || why.length ? h('div', { class: 'sf-why' }, [h('h4', { text: 'Warum diese Stufe' }), h('ul', { class: 'sf-rules' }, notMet.concat(why))]) : null,
      v.plan ? planBlock(v) : null,
      dq.length ? h('p', { class: 'sf-dq' }, [icon(IC.alert), 'Datenhinweis: ' + dq.join(' · ')]) : null,
    ];
    return h('article', { class: 'sf-card', 'data-stage': v.stage }, opts.compact ? [head, nums, moreBox('Warum erkannt, warum diese Stufe', body.slice(1))] : [head].concat(body));
  }
  function pair(k, v, sub) { return h('div', null, [h('dt', { text: k }), h('dd', null, [h('strong', { text: v }), sub ? h('small', { text: sub }) : null])]); }
  function planBlock(v) {
    var p = v.plan;
    return h('div', { class: 'sf-plan' }, [
      h('h4', null, [icon(IC.open), 'Modellierter Ablauf (hypothetisch)']),
      h('dl', { class: 'sf-nums' }, [pair('Einstiegsmarke', usd(p.trigger), /OPEN/.test(p.entryType) ? 'Eröffnung ' + dateDe(p.earliestSession) : 'ab ' + dateDe(p.earliestSession)), pair('Modell-Stop', usd(p.stop), pct(p.plannedRiskPct, p.plannedRiskPct < 0.01 ? 2 : 1) + ' Abstand'), fin(p.limit) ? pair('Limit', usd(p.limit)) : null]),
      h('p', { class: 'st-hint', text: 'Werte eines Forschungsmodells mit benannten Modellannahmen. Keine Order, keine Empfehlung, keine Aussage zur Handelbarkeit.' }),
    ]);
  }

  /* ================================================ AKTIENSEITE: Analyse */
  function mountStock(main, sym) {
    if (!sym) return;
    var host = h('div', { class: 'sf-host', id: 'sf' });
    var foot = main.querySelector('.st-foot');
    main.insertBefore(host, foot || null);
    var shard = (window.VUCore && window.VUCore.Identity) ? window.VUCore.Identity.shardKey(sym) : (sym.replace(/[^A-Z0-9]/g, '') + '_').slice(0, 2);
    getJSON('summary.json').then(function (sum) {
      // nur Shards mit Kandidaten anfragen (summary.tickerShards); sonst erkennt keine Methode die Aktie
      return ((sum.tickerShards || []).indexOf(shard) >= 0 ? getJSON('ticker/' + shard + '.json') : Promise.resolve({ views: [] })).then(function (t) { return [sum, t]; });
    }).then(function (res) {
      var sum = res[0], S = byCid(sum), L = sum.ruleLabels;
      var vs = (res[1].views || []).filter(function (v) { return v.ticker === sym; });
      vs.sort(function (a, b) { return STAGES.indexOf(b.stage) - STAGES.indexOf(a.stage) || (a.candidateId < b.candidateId ? -1 : 1); });
      if (!vs.length) { host.appendChild(sec('Quellentreue Methoden', [empty('Keine quellentreue Methode erkennt ' + sym, 'Am Stichtag ' + dateDe(sum.asOf) + ' passt die Aktie zu keinem Muster der 13 Methoden. Das ist ein gültiges Ergebnis.')], { kicker: 'Research', id: 'sf-stock' })); return; }
      var chartHost = h('div', { class: 'sf-chart' }), cards = h('div', { class: 'sf-cards' });
      var pick = chipRow(vs.map(function (v) { return [v.candidateId, stratName(S, v.candidateId), null, v.stage]; }), function (cid) { var v = vs.filter(function (x) { return x.candidateId === cid; })[0]; show(v); });
      function show(v) { cards.replaceChildren(card(v, S[v.candidateId], L, {})); drawChart(chartHost, v, S[v.candidateId]); }
      host.appendChild(sec(vs.length === 1 ? '1 quellentreue Methode erkennt ' + sym : vs.length + ' quellentreue Methoden erkennen ' + sym, [
        pick, chartHost, cards,
        moreBox('Was bedeuten die Stufen?', [stagesLegend()]), footnote(sum),
      ], { kicker: 'Research · Stand ' + dateDe(sum.asOf), id: 'sf-stock' }));
      show(vs[0]);
      if (location.hash === '#sf') host.scrollIntoView({ block: 'start' });
    }).catch(function () { host.appendChild(sec('Quellentreue Methoden', [unavailable()], { kicker: 'Research', id: 'sf-stock' })); });
  }
  function drawChart(host, v, s) {
    if (!window.STChart) { host.replaceChildren(); return; }
    host.replaceChildren(h('div', { class: 'st-hint', text: 'Chart wird geladen …' }));
    var weekly = s && s.timeframe === 'Woche';
    STChart.loadBars(v.shard, v.ticker).then(function (bars) {
      var box = h('div', { class: 'st-chartbox' }); host.replaceChildren(box);
      var lv = v.levels || {}, levels = [], boxes = [], overlays = [];
      [[10, 'var(--ma10)', ['C08', 'C10', 'C11']], [20, 'var(--ma20)', ['C08', 'C13']], [50, 'var(--ma50)', null], [200, 'var(--ma200)', ['C06']]].forEach(function (m) { overlays.push({ id: 'ma' + m[0], label: m[0] + '-Tage-Linie', color: m[1], values: STChart.sma(bars.close, m[0]), on: m[2] ? m[2].indexOf(v.candidateId) >= 0 : true }); });
      if (weekly) overlays.push({ id: 'ma150', label: '30-Wochen-Linie (≈150 Tage)', color: 'var(--ma30w)', values: STChart.sma(bars.close, 150) });
      if (v.pivot && fin(v.pivot.level)) levels.push({ id: 'pivot', label: 'Pivot / Marke', value: v.pivot.level, color: 'var(--chart-trigger)' });
      if (v.plan) { levels.push({ id: 'entry', label: 'Modell-Einstiegsmarke', value: v.plan.trigger, color: 'var(--chart-entry)', dash: '2 3' }); levels.push({ id: 'stop', label: 'Modell-Stop', value: v.plan.stop, color: 'var(--chart-stop)' }); }
      else if (fin(lv.stopReference)) levels.push({ id: 'ref', label: 'Stop-Referenz der Methode', value: lv.stopReference, color: 'var(--chart-stop)', dash: '4 4', on: false });
      if (lv.box && fin(lv.box.top)) boxes.push({ from: lv.box.from, to: null, top: lv.box.top, bottom: lv.box.bottom, color: 'var(--chart-box-darvas)', label: 'Darvas-Box' });
      STChart.render(box, { bars: bars, mode: 'candles', window: weekly ? 180 : 120, overlays: overlays, levels: levels, boxes: boxes, markers: [], showVolume: true, title: v.ticker, status: 'Marken der Methode ' + (s ? s.name : '') + '. Kurse bis ' + dateDe(bars.date[bars.date.length - 1]) + '.' });
    }).catch(function () { host.replaceChildren(empty('Chart nicht verfügbar', 'Die Kursdaten für diesen Titel konnten nicht geladen werden. Es wird kein Ersatzchart gezeichnet.')); });
  }

  /* ================================================================ API */
  function mount(page, main, ctx) {
    ctx = ctx || {};
    try {
      if (page === 'home') mountHome(main);
      else if (page === 'strategies') mountStrategies(main);
      else if (page === 'stock') mountStock(main, ctx.symbol);
    } catch (e) { /* die bestehende Seite bleibt unberührt */ }
  }
  window.STResearch = { mount: mount, version: 'sf8-frontend-1.0.0' };
})();
