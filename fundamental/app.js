/* Fundamental 1.0 – Oberflaeche. Routen: #/ (Start), #/<TICKER> (Unternehmen), #/methodik.
 * Daten: nur die bestehende Discover-Aktiendatei (Block `fundamentals`) und die Discover-Suchliste; siehe engine/model.js. */
(function (global) {
  'use strict';
  var M = global.VUFundamental.Model;
  var main = document.getElementById('fu-main');
  var EXAMPLES = [['AAPL', 'Apple'], ['NVDA', 'NVIDIA'], ['PLTR', 'Palantir'], ['MSFT', 'Microsoft'], ['JPM', 'JPMorgan Chase'], ['BRK-B', 'Berkshire Hathaway']];
  var state = { search: null, searchPromise: null, cache: {} };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }
  function svg(tag, attrs, kids) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }
  function icon(name, cls) {
    var s = svg('svg', { class: cls || 'fu-ico', 'aria-hidden': 'true', viewBox: '0 0 24 24' });
    s.append(svg('use', { href: '/assets/product-icons.svg#' + name }));
    return s;
  }
  function fetchJson(path) {
    return fetch(path, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r.json(); });
  }
  function setTitle(t) { document.title = t ? t + ' · Fundamental · Vision Universe®' : 'Fundamental · Vision Universe®'; }
  function done() { main.removeAttribute('aria-busy'); }

  /* ------------------------------------------------------------ Suche */
  function loadSearch() {
    if (!state.searchPromise) state.searchPromise = fetchJson(M.SEARCH_PATH).then(function (d) { state.search = d.entries || []; return state.search; })
      .catch(function (e) { state.searchPromise = null; throw e; });
    return state.searchPromise;
  }
  function searchBox() {
    var input = el('input', { id: 'fu-q', class: 'fu-input', type: 'search', placeholder: 'US-Aktie oder Kürzel suchen …', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'fu-results', 'aria-autocomplete': 'list', 'aria-label': 'US-Aktie suchen' });
    var list = el('ul', { id: 'fu-results', class: 'fu-results', role: 'listbox', hidden: true });
    var live = el('p', { class: 'fu-sr', role: 'status', 'aria-live': 'polite' });
    var hits = [], active = -1;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); }
    function mark(i) {
      active = i;
      [].forEach.call(list.children, function (li, k) { li.classList.toggle('is-active', k === i); li.setAttribute('aria-selected', String(k === i)); });
      if (i >= 0) input.setAttribute('aria-activedescendant', 'fu-hit-' + i); else input.removeAttribute('aria-activedescendant');
    }
    function go(t) { location.hash = '#/' + encodeURIComponent(t); }
    function paint() {
      var q = input.value;
      if (!q.trim()) { close(); live.textContent = ''; return; }
      loadSearch().then(function (entries) {
        if (input.value !== q) return;
        hits = M.search(entries, q, 8);
        list.replaceChildren.apply(list, hits.map(function (h, i) {
          return el('li', { id: 'fu-hit-' + i, role: 'option', 'aria-selected': 'false', onmousedown: function (ev) { ev.preventDefault(); go(h.ticker); } },
            [el('b', { text: h.ticker }), el('span', { text: h.name })]);
        }));
        list.hidden = !hits.length; input.setAttribute('aria-expanded', String(!!hits.length)); mark(-1);
        live.textContent = hits.length ? hits.length + ' Treffer' : 'Keine US-Aktie gefunden';
      }).catch(function () { live.textContent = 'Suche gerade nicht verfügbar'; });
    }
    input.addEventListener('input', paint);
    input.addEventListener('focus', function () { loadSearch().catch(function () {}); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' && hits.length) { ev.preventDefault(); mark(Math.min(hits.length - 1, active + 1)); }
      else if (ev.key === 'ArrowUp' && hits.length) { ev.preventDefault(); mark(Math.max(0, active - 1)); }
      else if (ev.key === 'Escape') close();
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        var t = active >= 0 ? hits[active].ticker : hits.length ? hits[0].ticker : M.normTicker(input.value);
        if (M.validTicker(t)) go(t);
      }
    });
    return el('form', { class: 'fu-search', role: 'search', onsubmit: function (e) { e.preventDefault(); } }, [searchIcon(), input, list, live]);
  }

  function exampleChips(asList) {
    if (asList) return el('ul', { class: 'fu-exlist', 'aria-label': 'Beispiele' }, EXAMPLES.map(function (e) {
      return el('li', {}, el('a', { href: '#/' + e[0] }, [el('b', { text: e[0] }), el('span', { text: e[1] }), el('i', { 'aria-hidden': 'true', text: '→' })]));
    }));
    return el('div', { class: 'fu-chips fu-examples', role: 'list', 'aria-label': 'Beispiele' }, EXAMPLES.map(function (e) {
      return el('a', { class: 'fu-chip', role: 'listitem', href: '#/' + e[0] }, [el('b', { text: e[0] }), e[1]]);
    }));
  }
  function searchIcon() {
    return svg('svg', { class: 'fu-search-ico', 'aria-hidden': 'true', viewBox: '0 0 24 24' }, [svg('circle', { cx: 11, cy: 11, r: 6.5 }), svg('path', { d: 'M16 16l4.5 4.5' })]);
  }

  /* ------------------------------------------------------------ Start */
  /* Drei Ansichten derselben Startseite (Dock): Uebersicht, Entdecken (nur die Auswahl-Zeilen, alle Kacheln)
     und Suche (nur das Suchfeld, gross und fokussiert, mit Beispielen). */
  function heroTitle(tag, text) {
    return el('div', { class: 'fu-hero-title' }, [el('span', { class: 'fu-hero-icon' }, icon('fundamental', 'fu-ico-lg')), el(tag || 'h1', { text: text || 'Fundamental' })]);
  }
  function howMore() {
    return el('details', { class: 'vu-more fu-howmore' }, [el('summary', { text: 'So liest du Fundamental' }), el('div', { class: 'vu-more-body' }, el('ul', { class: 'fu-howlist' }, [
      howItem('▦', 'Jahr für Jahr', 'Umsatz, Gewinn, Cashflow und Bilanz je Geschäftsjahr.'),
      howItem('▲▼', 'Richtung', 'Gestiegen oder gefallen – ohne Wertung.'),
      howItem('◇', 'Lücken sichtbar', '„keine Angabe“ statt Schätzung.'),
      howItem('§', 'Quelle je Jahr', 'Link auf die Meldung bei der SEC.')
    ]))]);
  }
  function homeDm() {
    return el('details', { class: 'vu-dm' }, [el('summary', { text: 'Daten & Methodik' }), el('dl', {}, [
      el('dt', { text: 'Quelle' }), el('dd', { text: 'Pflichtmeldungen an die SEC (EDGAR Companyfacts), aufbereitet wie in Discover und Quant.' }),
      el('dt', { text: 'Umfang' }), el('dd', { text: 'US-Unternehmen mit SEC-Meldungen.' }),
      el('dt', { text: 'Hinweis' }), el('dd', { text: 'Rückblickende Ansicht, keine Bewertung, keine Empfehlung.' }),
      el('dt', { text: 'Methodik' }), el('dd', {}, el('a', { href: '#/methodik', text: 'Methodik lesen' }))
    ])]);
  }
  function home(focus) {
    setTitle(focus === 'entdecken' ? 'Entdecken' : focus === 'suche' ? 'Suche' : null);
    main.setAttribute('data-view', focus || 'home');
    if (focus === 'entdecken') {
      main.replaceChildren(
        el('section', { class: 'fu-hero fu-hero--sub' }, [heroTitle('h1', 'Entdecken'),
          el('p', { class: 'fu-lead', text: 'Sechs Auswahlen aus Discover – Wachstum, Marge und KGV je Unternehmen auf einen Blick.' })]),
        discoverSection({ all: true, title: false }),
        homeDm());
      return done();
    }
    if (focus === 'suche') {
      main.replaceChildren(
        el('section', { class: 'fu-hero fu-hero--sub fu-hero--search' }, [heroTitle('h1', 'Suche'),
          el('p', { class: 'fu-lead', text: 'Name oder Kürzel eines US-Unternehmens eingeben.' }),
          searchBox(),
          el('p', { class: 'vu-eyebrow fu-ex-label', text: 'Beispiele' }),
          exampleChips(true)]),
        homeDm());
      return done();
    }
    main.replaceChildren(
      el('section', { class: 'fu-hero' }, [
        heroTitle(),
        el('p', { class: 'fu-lead', text: 'Umsatz, Gewinn und Bilanz – Jahr für Jahr aus den SEC-Meldungen.' }),
        searchBox(),
        exampleChips()
      ]),
      discoverSection({ all: false, title: true }),
      howMore(),
      homeDm()
    );
    done();
  }
  /* ------------------------------------------------------------ Start: Entdecken */
  var HOME_LABELS = { 'profitables-wachstum': 'Profitables Wachstum', 'langfristige-compounder': 'Langfristige Compounder', 'cashflow-maschinen': 'Cashflow-Maschinen',
    'qualitaet-zum-preis': 'Qualität zum Preis', 'starke-bilanz-wachstum': 'Starke Bilanz + Wachstum', 'margen-werden-staerker': 'Margen werden stärker' };
  var TILE_CAP = 0.5; // feste Skala fuer alle Kacheln: 0 … 50 %, darueber Pfeil
  function meter(label, v, odd) {
    var w = v == null ? 0 : Math.max(0, Math.min(1, v / TILE_CAP)) * 100;
    return el('div', { class: 'fu-meter' }, [
      el('span', { class: 'fu-meter-l', text: label }),
      el('span', { class: 'fu-meter-bar', 'aria-hidden': 'true' }, v == null ? null : el('i', { class: (v > TILE_CAP ? 'is-over' : '') + (v < 0 ? ' is-neg' : ''), style: 'width:' + Math.max(v > 0 ? 2 : 0, w).toFixed(1) + '%' })),
      el('b', { class: 'fu-num' + (v == null ? ' is-none' : ''), text: v == null ? (odd ? 'nicht plausibel' : 'keine Angabe') : M.pct(v) })
    ]);
  }
  function homeTile(t) {
    return el('li', {}, el('a', { class: 'fu-tile', href: '#/' + encodeURIComponent(t.ticker) }, [
      el('span', { class: 'fu-tile-head' }, [el('b', { text: t.ticker }), el('span', { text: t.name })]),
      t.was ? el('small', { class: 'fu-tile-was', text: t.was }) : null,
      el('span', { class: 'fu-tile-rev' }, [el('strong', { class: 'fu-num', text: M.money(t.revenue) }), el('small', { text: 'Umsatz · letztes GJ' })]),
      meter('Wachstum p. a. · 3 J', t.growth3), meter('Nettomarge', t.netMargin, t.implausible.netMargin), meter('Free-Cashflow-Marge', t.fcfMargin, t.implausible.fcfMargin),
      el('span', { class: 'fu-tile-pe' }, [el('span', { text: 'KGV' }), el('b', { class: 'fu-num' + (t.pe == null ? ' is-none' : ''), text: t.pe == null ? 'keine Angabe' : M.multiple(t.pe) })])
    ]));
  }
  function discoverSection(opt) {
    opt = opt || {};
    var holder = el('div', { class: 'fu-disc-body', 'aria-live': 'polite' }), sub = el('p', { class: 'fu-sub' }), tok = 0, SHOW = opt.all ? 1e9 : matchMedia('(max-width: 560px)').matches ? 3 : 8;
    var buttons = M.HOME_ROWS.map(function (id, i) {
      return el('button', { type: 'button', class: 'fu-chip fu-cmp-opt', 'aria-pressed': i ? 'false' : 'true', 'data-row': id, onclick: function () { pick(i); } }, HOME_LABELS[id] || id);
    });
    function paint(r, all) {
      sub.replaceChildren(r.subtitle || '');
      var tiles = all ? r.tiles : r.tiles.slice(0, SHOW);
      holder.replaceChildren(el('ul', { class: 'fu-tiles' }, tiles.map(homeTile)),
        r.tiles.length > SHOW && !all ? el('a', { class: 'fu-chip fu-more', href: '#/entdecken' }, 'Alle ' + r.tiles.length + ' in Entdecken') : null,
        el('details', { class: 'vu-more fu-rule' }, [el('summary', { text: 'Regel dieser Auswahl' }), el('div', { class: 'vu-more-body' }, [
          r.rule ? el('p', { text: r.rule }) : null,
          el('p', { text: 'Discover-Auswahl · ' + (r.matched ? r.matched.toLocaleString('de-DE') + ' Unternehmen erfüllen die Regel · ' : '') + 'Stand ' + M.dateDe(r.asOf) + ' · Balken 0–50 %' })])]));
    }
    function pick(i) {
      var my = ++tok, id = M.HOME_ROWS[i];
      buttons.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === i)); });
      holder.replaceChildren(el('div', { class: 'fu-skel', style: 'height:220px' }));
      loadRow(M.ROWS_BASE + id + '.json').then(function (row) {
        if (my !== tok) return;
        var r = homeRow(row);
        if (!r.tiles.length) { holder.replaceChildren(el('div', { class: 'fu-notice' }, el('b', { text: 'Gerade erfüllt kein Unternehmen diese Regel.' }))); return; }
        paint(r, false);
      }).catch(function () { if (my === tok) holder.replaceChildren(el('div', { class: 'fu-notice' }, el('b', { text: 'Die Auswahl konnte gerade nicht geladen werden.' }))); });
    }
    setTimeout(function () { pick(0); }, 0);
    return el('section', { class: 'fu-section fu-disc' + (opt.title ? '' : ' is-page'), id: 'entdecken', 'aria-labelledby': opt.title ? 'fu-h-disc' : null, 'aria-label': opt.title ? null : 'Auswahlen' }, [
      opt.title ? el('div', { class: 'vu-sec-head' }, [el('h2', { id: 'fu-h-disc', class: 'vu-sec-title', text: 'Entdecken' }), el('a', { class: 'vu-sec-link', href: '#/entdecken', text: 'Alle Auswahlen →' })]) : null,
      el('div', { class: 'fu-chips fu-cmp-opts', role: 'group', 'aria-label': 'Auswahl' }, buttons),
      sub, holder
    ]);
  }
  function homeRow(row) { return M.homeRow(row); }
  function howItem(sym, title, text) { return el('li', {}, [el('span', { class: 'fu-howsym', 'aria-hidden': 'true', text: sym }), el('b', { text: title }), el('span', { text: text })]); }

  /* ------------------------------------------------------------ Diagramme */
  var W = 300, H = 110, PAD = 6;
  /* Skala lesbar machen: hoechster (und ggf. tiefster) Wert und die Nulllinie als HTML-Beschriftung ueber dem Diagramm. */
  var Y_LABEL = 14; // eigene Zeile fuer den Hoechstwert, damit er keine Balkenspitze verdeckt
  function scaled(chart, top, zeroPx, bottom) {
    return el('div', { class: 'fu-chart-wrap' }, [chart,
      el('span', { class: 'fu-y fu-y-top fu-num', 'aria-hidden': 'true', text: top }),
      zeroPx != null ? el('span', { class: 'fu-y fu-y-zero', 'aria-hidden': 'true', style: 'top:' + (Y_LABEL + 4 + zeroPx).toFixed(1) + 'px', text: '0' }) : null,
      bottom ? el('span', { class: 'fu-y fu-y-bottom fu-num', 'aria-hidden': 'true', text: bottom }) : null]);
  }
  function bars(metric) {
    var rows = metric.rows, vals = rows.filter(function (r) { return r.v != null; }).map(function (r) { return r.v; });
    var max = Math.max(0, Math.max.apply(null, vals)), min = Math.min(0, Math.min.apply(null, vals));
    var span = max - min || 1, zero = PAD + (max / span) * (H - 2 * PAD - 14);
    var bw = (W - 2 * PAD) / rows.length, g = svg('g');
    var plotH = H - 2 * PAD - 14;
    rows.forEach(function (r, i) {
      var x = PAD + i * bw + bw * 0.18, w = bw * 0.64, last = metric.last && r.fy === metric.last.fy;
      if (r.v == null) {
        g.append(svg('rect', { class: 'fu-gap', x: x, y: zero - 6, width: w, height: 6, rx: 1.5 }));
      } else {
        var h = Math.max(1.5, Math.abs(r.v) / span * plotH);
        g.append(svg('rect', { class: 'fu-bar' + (r.v < 0 ? ' is-neg' : '') + (last ? ' is-last' : ''), x: x, y: r.v >= 0 ? zero - h : zero, width: w, height: h, rx: 2 }));
      }
      if (i === 0 || i === rows.length - 1 || rows.length <= 8) g.append(svg('text', { class: 'fu-axis', x: x + w / 2, y: H - 2, 'text-anchor': 'middle' }, [document.createTextNode("'" + String(r.fy).slice(2))]));
    });
    g.append(svg('line', { class: 'fu-zero', x1: PAD, x2: W - PAD, y1: zero, y2: zero }));
    var label = metric.label + ': ' + rows.map(function (r) { return r.fy + ' ' + (r.v == null ? 'keine Angabe' : M.value(metric, r.v)); }).join(', ');
    var chart = svg('svg', { class: 'fu-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label, preserveAspectRatio: 'none' }, [g]);
    return scaled(chart, max > 0 ? M.value(metric, max) : '0', min < 0 && max > 0 ? zero : null, min < 0 ? M.value(metric, min) : null);
  }
  function lines(margins, years) {
    var avail = margins.filter(function (m) { return m.available; });
    var all = []; avail.forEach(function (m) { m.rows.forEach(function (r) { if (r.v != null) all.push(r.v); }); });
    var max = Math.max(0, Math.max.apply(null, all)), min = Math.min(0, Math.min.apply(null, all)), span = max - min || 1;
    var plotH = H - 2 * PAD - 14, step = (W - 2 * PAD) / Math.max(1, years.length - 1);
    var y = function (v) { return PAD + (max - v) / span * plotH; }, g = svg('g');
    g.append(svg('line', { class: 'fu-zero', x1: PAD, x2: W - PAD, y1: y(0), y2: y(0) }));
    g.append(svg('text', { class: 'fu-axis', x: W - PAD, y: y(0) - 3, 'text-anchor': 'end' }, [document.createTextNode('0 %')]));
    avail.forEach(function (m, k) {
      var d = '', pen = false;
      m.rows.forEach(function (r, i) { if (r.v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + (PAD + i * step).toFixed(1) + ' ' + y(r.v).toFixed(1); pen = true; });
      g.append(svg('path', { class: 'fu-line s' + k, d: d }));
      m.rows.forEach(function (r, i) { if (r.v != null) g.append(svg('circle', { class: 'fu-dot s' + k, cx: PAD + i * step, cy: y(r.v), r: 2.2 })); });
    });
    years.forEach(function (fy, i) { if (i === 0 || i === years.length - 1) g.append(svg('text', { class: 'fu-axis', x: PAD + i * step, y: H - 2, 'text-anchor': i ? 'end' : 'start' }, [document.createTextNode(String(fy))])); });
    var label = avail.map(function (m) { return m.label + ' ' + m.rows.map(function (r) { return r.fy + ' ' + (r.v == null ? 'keine Angabe' : M.pct(r.v)); }).join(', '); }).join('; ');
    return svg('svg', { class: 'fu-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Margen: ' + label, preserveAspectRatio: 'none' }, [g]);
  }

  /* VU3-Abschnitt: Titel, ein kurzer Satz, Inhalt; Erlaeuterungen in vu-more. */
  function sec(id, title, sub, kids, extra) {
    return el('section', { class: 'fu-section vu-sec', id: id, 'aria-labelledby': 'fu-h-' + id }, [
      el('div', { class: 'vu-sec-head' }, [el('h2', { class: 'vu-sec-title', id: 'fu-h-' + id, text: title }), extra || null]),
      sub ? el('p', { class: 'fu-sub', text: sub }) : null].concat(kids));
  }
  function more(summary, kids) { return el('details', { class: 'vu-more' }, [el('summary', { text: summary }), el('div', { class: 'vu-more-body' }, kids)]); }

  /* ------------------------------------------------------------ Wachstum */
  var GROWTH_REASON = { TOO_SHORT: 'zu kurze Reihe', NOT_POSITIVE: 'Wert ≤ 0', NOT_COMPARABLE: 'nicht vergleichbar', NO_DATA: 'keine Angabe' };
  function rateText(r) { return (r > 0 ? '▲ +' : r < 0 ? '▼ −' : '■ ') + M.pct(Math.abs(r)); }
  function growthCell(g, h) {
    if (h.rate == null) return el('td', { class: 'fu-gcell is-none' }, el('span', { class: 'fu-gnone', text: GROWTH_REASON[h.reason] || '–' }));
    var w = Math.min(1, Math.abs(h.rate) / 0.5);
    var tip = h.from + '→' + h.to + ': ' + M.value(g, h.fromV) + ' → ' + M.value(g, h.toV) + ' (×' + M.multiple(h.multiple) + ')';
    return el('td', { class: 'fu-gcell', title: tip }, [
      el('span', { class: 'fu-dir fu-num' + (h.rate < 0 ? ' dir-down' : ' dir-up'), text: rateText(h.rate) }),
      el('span', { class: 'fu-gbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, w * 100).toFixed(0) + '%' })),
      el('span', { class: 'fu-sr', text: tip })
    ]);
  }
  function yoyChart(rows) {
    var have = rows.filter(function (r) { return r.pct != null; });
    if (have.length < 2) return null;
    var CAP = 1, max = Math.min(CAP, Math.max.apply(null, have.map(function (r) { return Math.abs(r.pct); }))) || 0.1;
    var h = 120, mid = h / 2 - 6, bw = (W - 2 * PAD) / rows.length, g = svg('g');
    rows.forEach(function (r, i) {
      var x = PAD + i * bw + bw * 0.2, w = bw * 0.6;
      if (r.pct == null) g.append(svg('rect', { class: 'fu-gap', x: x, y: mid - 3, width: w, height: 6, rx: 1.5 }));
      else {
        var v = Math.max(-CAP, Math.min(CAP, r.pct)), bh = Math.max(1.5, Math.abs(v) / max * (mid - PAD));
        g.append(svg('rect', { class: 'fu-bar' + (v < 0 ? ' is-neg' : '') + (i === rows.length - 1 ? ' is-last' : ''), x: x, y: v >= 0 ? mid - bh : mid, width: w, height: bh, rx: 2 }));
      }
      if (i === 0 || i === rows.length - 1 || rows.length <= 8) g.append(svg('text', { class: 'fu-axis', x: x + w / 2, y: h - 2, 'text-anchor': 'middle' }, [document.createTextNode("'" + String(r.fy).slice(2))]));
    });
    g.append(svg('line', { class: 'fu-zero', x1: PAD, x2: W - PAD, y1: mid, y2: mid }));
    var label = 'Umsatz ggü. Vorjahr: ' + rows.map(function (r) { return r.fy + ' ' + (r.pct == null ? 'keine Angabe' : rateText(r.pct)); }).join(', ');
    var chart = svg('svg', { class: 'fu-chart fu-chart-yoy', viewBox: '0 0 ' + W + ' ' + h, role: 'img', 'aria-label': label, preserveAspectRatio: 'none' }, [g]);
    var cap = have.some(function (r) { return Math.abs(r.pct) > CAP; });
    return scaled(chart, '+' + M.pct(max) + (cap ? ' (gekappt)' : ''), mid, '−' + M.pct(max));
  }
  function growthSection(f) {
    if (!f.growth.length) return null;
    var last = f.yoy.filter(function (r) { return r.pct != null; }).slice(-1)[0];
    return sec('wachstum', 'Wachstum', null, [
      el('div', { class: 'fu-split' }, [
        last ? el('article', { class: 'fu-card' }, [
          el('div', { class: 'fu-card-val fu-big' }, [el('strong', { class: 'fu-num', text: last.signFlip ? 'Vorzeichenwechsel' : rateText(last.pct) }), el('span', { text: 'Umsatz ggü. Vorjahr · GJ ' + last.fy })]),
          yoyChart(f.yoy)
        ]) : null,
        el('div', { class: 'fu-card fu-gwrap' }, [el('h3', { text: 'Durchschnitt pro Jahr bis GJ ' + f.latestFiscalYear }), el('table', { class: 'fu-gtable' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, el('span', { class: 'fu-sr', text: 'Kennzahl' }))].concat(M.HORIZONS.map(function (n) { return el('th', { scope: 'col', text: n + ' Jahre' }); })))),
          el('tbody', {}, f.growth.map(function (g) {
            // Gleicher Grund in allen Spalten (z. B. Split): eine Zelle statt dreimal derselbe Text.
            var none = g.horizons.every(function (h) { return h.rate == null && h.reason === g.horizons[0].reason; });
            return el('tr', {}, [el('th', { scope: 'row', text: g.label })].concat(none
              ? [el('td', { class: 'fu-gcell is-none', colspan: String(g.horizons.length) }, el('span', { class: 'fu-gnone', text: (GROWTH_REASON[g.horizons[0].reason] || '–') + (g.horizons[0].reason === 'NOT_COMPARABLE' ? ' (Aktiensplit ohne Rückrechnung)' : '') }))]
              : g.horizons.map(function (h) { return growthCell(g, h); })));
          }))
        ])])
      ]),
      more('Wie wird Wachstum gerechnet?', [el('p', { text: 'Durchschnittliche jährliche Veränderung (pro Jahr) über genau 3, 5 oder 10 Geschäftsjahre, nur wenn Anfangs- und Endwert positiv sind. Fehlt ein Wert, ist die Reihe zu kurz oder wurde die Aktie ohne Rückrechnung gesplittet, steht dort der Grund statt einer Zahl. Im Diagramm „ggü. Vorjahr“ sind Werte über ±100 % gekappt.' })])
    ]);
  }

  /* ------------------------------------------------------------ Profitabilitaet */
  function ladderCard(l, roe) {
    return el('article', { class: 'fu-card' }, [
      el('div', { class: 'fu-card-head' }, [el('h3', { text: 'Vom Umsatz zum Free Cashflow' }), el('span', { class: 'fu-tag', text: 'GJ-Ende ' + M.dateDe(l.end) })]),
      el('ol', { class: 'fu-ladder' }, l.steps.map(function (s, i) {
        var w = Math.max(0, Math.min(1, s.share));
        return el('li', { class: s.share < 0 ? 'is-neg' : '' }, [
          el('span', { class: 'fu-ladder-label', text: s.label }),
          el('span', { class: 'fu-ladder-bar', 'aria-hidden': 'true' }, el('i', { class: i === 0 ? '' : 'is-step', style: 'width:' + (s.share < 0 ? 2 : Math.max(1, w * 100)).toFixed(1) + '%' })),
          el('b', { class: 'fu-num', text: i === 0 ? M.money(s.v) : M.pct(s.share) }),
          i ? el('small', { class: 'fu-num', text: M.money(s.v) }) : el('small', { text: '100 %' })
        ]);
      })),
      roe != null ? el('p', { class: 'fu-ladder-foot' }, [el('span', { text: 'Eigenkapitalrendite' }), el('b', { class: 'fu-num', text: M.pct(roe) })]) : null
    ]);
  }
  function profitSection(f) {
    var mc = marginCard(f), roe = f.balance && f.balance.roe;
    if (!f.ladder && !mc) return null;
    return sec('profitabilitaet', 'Profitabilität', 'Anteil am Umsatz' + (f.ladder ? ' · letztes Geschäftsjahr' : ''), [
      el('div', { class: 'fu-split' }, [f.ladder ? ladderCard(f.ladder, roe) : null, mc]),
      more('Was bedeuten die Margen?', [el('p', { text: 'Bruttogewinn, operatives Ergebnis, Nettogewinn und Free Cashflow geteilt durch den Umsatz desselben Geschäftsjahres. Die Veränderung zum Vorjahr steht in Prozentpunkten (Pp.). Eigenkapitalrendite = Nettogewinn ÷ Eigenkapital.' })])
    ]);
  }

  /* ------------------------------------------------------------ Bewertung */
  /* Lage des KGV zum Median des US-Universums auf einer logarithmischen Skala (⅛× … 8×); Zonen = Regel des Erzeugers. */
  function gauge(ratio, median, value) {
    var lo = Math.log(1 / 8), hi = Math.log(8), pos = function (r) { return (Math.log(Math.max(1 / 8, Math.min(8, r))) - lo) / (hi - lo) * 100; };
    var clipped = ratio > 8 || ratio < 1 / 8;
    return el('div', { class: 'fu-gauge' }, [
      el('div', { class: 'fu-gauge-track', 'aria-hidden': 'true' }, [
        el('i', { class: 'z z-low', style: 'left:0;width:' + pos(0.67).toFixed(1) + '%' }),
        el('i', { class: 'z z-mid', style: 'left:' + pos(0.67).toFixed(1) + '%;width:' + (pos(1.5) - pos(0.67)).toFixed(1) + '%' }),
        el('i', { class: 'z z-high', style: 'left:' + pos(1.5).toFixed(1) + '%;right:0' }),
        el('i', { class: 'mk mk-median', style: 'left:' + pos(1).toFixed(1) + '%' }),
        el('i', { class: 'mk mk-self' + (clipped ? ' is-clipped' : ''), style: 'left:' + pos(ratio).toFixed(1) + '%' })
      ]),
      el('div', { class: 'fu-gauge-scale', 'aria-hidden': 'true' }, [el('span', { text: 'günstiger' }), el('span', { text: 'Markt' }), el('span', { text: 'höher' })]),
      el('p', { class: 'fu-sr', text: 'KGV ' + M.multiple(value) + ', das ' + M.multiple(ratio) + '-Fache des Medians ' + M.multiple(median) })
    ]);
  }
  function valTile(label, value, sub) {
    var none = value == null;
    return el('div', { class: 'vu-kpi' }, [el('span', { class: 'vu-kpi-label', text: label }), el('b', { class: 'vu-kpi-value' + (none ? ' is-none' : ''), text: none ? 'keine Angabe' : value }), sub ? el('small', { class: 'vu-kpi-sub', text: sub }) : null]);
  }
  function valuationSection(f) {
    var v = f.valuation;
    if (!v) return null;
    var basis = v.pe && v.pe.basis === 'FY' ? 'letztes Geschäftsjahr' : 'letzte 12 Monate';
    return sec('bewertung', 'Bewertung', null, [
      el('div', { class: 'fu-split' }, [
        el('article', { class: 'fu-card' }, [
          v.pe ? el('div', { class: 'fu-card-val fu-big' }, [el('strong', { class: 'fu-num', text: M.multiple(v.pe.value) }),
            el('span', { text: 'KGV' + (v.pe.ratio != null ? ' · ' + M.multiple(v.pe.ratio) + '× Median (' + M.multiple(v.peMedian) + ')' : '') })]) :
            el('div', { class: 'fu-card-val fu-big' }, [el('strong', { text: 'kein KGV' }), el('span', { text: M.reasonText(v.peReason) })]),
          v.pe && v.pe.ratio != null ? gauge(v.pe.ratio, v.peMedian, v.pe.value) : null,
          v.pe && v.label ? el('p', { class: 'fu-card-foot', text: v.label }) : null
        ]),
        el('div', { class: 'vu-kpis fu-valkpis' }, [
          valTile('Börsenwert', v.marketCap != null ? M.money(v.marketCap) : null, null),
          valTile('KUV', v.ps ? M.multiple(v.ps.value) : null, v.ps && v.psMedian ? 'Median ' + M.multiple(v.psMedian) : null),
          valTile('Free-Cashflow-Rendite', v.fcfYield != null ? M.pct(v.fcfYield) : null, null),
          valTile('Gewinnrendite', v.pe ? M.pct(1 / v.pe.value) : null, null)
        ])
      ]),
      more('Wie wird bewertet?', [
        el('p', { text: 'Basis: ' + basis + '. Berechnet mit dem Kurs ' + (v.price != null ? M.value({ unit: 'USD/shares' }, v.price) + ' ' : '') + '(Stand der Geschäftszahlen ' + M.dateDe(f.asOf) + ').' }),
        el('p', { text: 'KGV = Kurs ÷ Gewinn je Aktie. KUV = Kurs ÷ Umsatz je Aktie. Free-Cashflow-Rendite = Free Cashflow ÷ Börsenwert. Gewinnrendite = 1 ÷ KGV.' }),
        el('p', { text: 'Die Skala zeigt das KGV im Verhältnis zum Median' + (v.peCount ? ' aus ' + v.peCount.toLocaleString('de-DE') + ' US-Aktien' : '') + ' (logarithmisch, ⅛× bis 8×). Mittlere Zone: 0,67× bis 1,5× Median.' })])
    ]);
  }

  /* ------------------------------------------------------------ Bilanz */
  function balanceSection(f) {
    var b = f.balance;
    if (!b || (b.cash == null && b.debt == null && b.equityRatio == null)) return null;
    var big = Math.max(b.cash || 0, b.debt || 0) || 1;
    var row = function (label, v) {
      return el('li', {}, [el('span', { class: 'fu-ladder-label', text: label }),
        el('span', { class: 'fu-ladder-bar', 'aria-hidden': 'true' }, el('i', { class: 'is-step', style: 'width:' + (v == null ? 0 : Math.max(1, v / big * 100)).toFixed(1) + '%' })),
        el('b', { class: 'fu-num' + (v == null ? ' is-none' : ''), text: v == null ? 'keine Angabe' : M.money(v) })]);
    };
    var netCash = b.net != null && b.net < 0;
    return sec('bilanz', 'Bilanz', 'Zum Geschäftsjahresende ' + M.dateDe(b.end), [
      el('div', { class: 'fu-split' }, [
        (b.cash != null || b.debt != null) ? el('article', { class: 'fu-card' }, [
          b.net != null ? el('div', { class: 'fu-card-val fu-big' }, [el('strong', { class: 'fu-num', text: M.money(Math.abs(b.net)) }), el('span', { text: netCash ? 'Nettokasse (mehr Kasse als Schulden)' : b.net > 0 ? 'Nettoschulden' : 'ausgeglichen' })])
            : el('div', { class: 'fu-card-head' }, [el('h3', { text: 'Kasse und Schulden' })]),
          el('ol', { class: 'fu-ladder' }, [row('Liquide Mittel', b.cash), row(b.debtKind === 'long_term' ? 'Langfristige Schulden' : 'Schulden', b.debt)])
        ]) : null,
        b.equityRatio != null ? el('article', { class: 'fu-card' }, [
          el('div', { class: 'fu-card-val fu-big' }, [el('strong', { class: 'fu-num', text: M.pct(b.equityRatio) }), el('span', { text: 'Eigenkapitalquote · Bilanzsumme ' + M.money(b.assets) })]),
          el('div', { class: 'fu-stack', 'aria-hidden': 'true' }, [el('i', { class: 'is-eq', style: 'width:' + Math.max(0, Math.min(100, b.equityRatio * 100)).toFixed(1) + '%' })]),
          el('div', { class: 'fu-gauge-scale', 'aria-hidden': 'true' }, [el('span', { text: 'Eigenkapital ' + M.money(b.equity) }), el('span', { text: 'Fremdkapital ' + M.money(b.assets - b.equity) })])
        ]) : null
      ])
    ]);
  }

  function sectionNav(f) {
    var items = [[f.growth.length, 'wachstum', 'Wachstum'], [f.ladder || f.margins.some(function (m) { return m.available; }), 'profitabilitaet', 'Profitabilität'],
      [f.valuation, 'bewertung', 'Bewertung'], [f.balance, 'bilanz', 'Bilanz'], [f.peerOptions && f.peerOptions.length, 'vergleich', 'Vergleich'], [true, 'verlauf', 'Verlauf'], [true, 'quellen', 'Quellen']];
    return el('nav', { class: 'fu-jump', 'aria-label': 'Abschnitte' }, items.filter(function (x) { return x[0]; }).map(function (x) {
      return el('a', { href: '#/' + encodeURIComponent(f.ticker) + '?s=' + x[1], 'data-target': x[1], onclick: function (ev) {
        var t = document.getElementById(x[1]); if (!t) return; ev.preventDefault(); if (t.tagName === 'DETAILS') t.open = true; t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }, text: x[2] });
    }));
  }

  /* ------------------------------------------------------------ Im Vergleich */
  /* Unternehmen laden und mit demselben Modell lesen; die Vergleichsgruppen kommen aus der Rohdatei. */
  function loadStock(t) {
    return state.cache[t] || (state.cache[t] = fetchJson(M.stockPath(t)).then(function (raw) {
      var f = M.fromStock(raw); f.peerOptions = M.peerOptions(raw); f.quote = quoteFrom(raw); f.exchange = raw && raw.exchange || null; return f;
    }).catch(function (e) { delete state.cache[t]; throw e; }));
  }
  function loadRow(path) {
    state.rows = state.rows || {};
    return state.rows[path] || (state.rows[path] = fetchJson(path).catch(function (e) { delete state.rows[path]; throw e; }));
  }
  var CMP = [
    { title: 'Wachstum', items: [
      { key: 'growth3', label: 'Umsatz pro Jahr · 3 Jahre', fmt: 'pct', why: function (r) { return r.growth3Reason === 'TOO_SHORT' ? 'zu kurze Reihe' : r.growth3Reason === 'NOT_POSITIVE' ? 'Wert ≤ 0' : null; } },
      { key: 'growth1', label: 'Umsatz ggü. Vorjahr', fmt: 'pct' }] },
    { title: 'Profitabilität', items: [
      { key: 'opMargin', label: 'Operative Marge', fmt: 'pct' },
      { key: 'netMargin', label: 'Nettomarge', fmt: 'pct' },
      { key: 'fcfMargin', label: 'Free-Cashflow-Marge', fmt: 'pct' }] },
    { title: 'Bewertung', items: [
      { key: 'pe', label: 'KGV', fmt: 'x', cap: 4, why: function (r) { return r.peReason === 'LOSS' ? 'Verlust (12 Mon.)' : r.peReason ? M.reasonText(r.peReason) : null; } },
      { key: 'ps', label: 'KUV', fmt: 'x', cap: 4 },
      { key: 'fcfYield', label: 'Free-Cashflow-Rendite', fmt: 'pct' }] }
  ];
  function rankText(k, n) { return (k === 1 ? 'höchster Wert' : k + '. höchster Wert') + ' von ' + n; }
  function cmpValue(item, r) {
    var v = r[item.key];
    if (v == null) return null;
    return item.fmt === 'x' ? M.multiple(v) + (item.key === 'pe' && r.peBasis === 'FY' ? ' (GJ)' : '') : M.pct(v);
  }
  function cmpMetric(item, rows, self) {
    var sc = M.compareScale(rows, item.key, item.cap);
    var span = sc ? (sc.max - sc.min) || 1 : 1, zero = sc ? -sc.min / span * 100 : 0;
    return el('div', { class: 'fu-cmp-metric' }, [
      el('h4', { text: item.label }),
      el('ul', { class: 'fu-cmp-rows' }, rows.map(function (r) {
        var v = r[item.key], text = cmpValue(item, r), isSelf = r.ticker === self;
        var bar = null;
        if (v != null && sc) {
          var vv = Math.max(sc.min, Math.min(sc.max, v)), w = Math.abs(vv) / span * 100, over = v > sc.max;
          bar = el('i', { class: (isSelf ? 'is-self' : '') + (v < 0 ? ' is-neg' : '') + (over ? ' is-over' : ''), style: 'left:' + (v < 0 ? zero - w : zero).toFixed(1) + '%;width:' + Math.max(1, w).toFixed(1) + '%' });
        }
        return el('li', { class: isSelf ? 'is-self' : '' }, [
          el('span', { class: 'fu-cmp-t', text: r.ticker }),
          el('span', { class: 'fu-cmp-bar', 'aria-hidden': 'true' }, [sc && sc.min < 0 ? el('b', { class: 'fu-cmp-zero', style: 'left:' + zero.toFixed(1) + '%' }) : null, bar]),
          el('span', { class: 'fu-cmp-v fu-num' + (text ? '' : ' is-none'), text: text || (r.available === false ? 'keine SEC-Zahlen' : (item.why && item.why(r)) || 'keine Angabe') })
        ]);
      })),
      sc ? el('p', { class: 'fu-cmp-foot' }, [rows.filter(function (r) { return r.ticker === self && r[item.key] != null; }).length
        ? rankText(sc.rank(rows.filter(function (r) { return r.ticker === self; })[0][item.key]), sc.count) + ' · ' : '', 'Median ' + (item.fmt === 'x' ? M.multiple(sc.median) : M.pct(sc.median))]) : null
    ]);
  }
  /* Drei Gruppen (Wachstum, Profitabilitaet, Bewertung): breit nebeneinander, schmal als Umschalter – eine Gruppe sichtbar. */
  var cmpGroup = 0;
  function cmpGroups(rows, self) {
    var cards = CMP.map(function (g, i) {
      return el('article', { class: 'fu-card', 'data-group': String(i), id: 'fu-cmp-g' + i }, [el('h3', { class: 'fu-cmp-gh', text: g.title })].concat(g.items.map(function (it) { return cmpMetric(it, rows, self); })));
    });
    var tabs = CMP.map(function (g, i) {
      return el('button', { type: 'button', class: 'fu-cmp-tab', 'aria-controls': 'fu-cmp-g' + i, onclick: function () { cmpGroup = i; show(); } }, g.title);
    });
    var grid = el('div', { class: 'fu-cmp-grid' }, cards);
    function show() {
      tabs.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === cmpGroup)); });
      cards.forEach(function (c, k) { c.classList.toggle('is-on', k === cmpGroup); });
    }
    show();
    return el('div', {}, [el('div', { class: 'fu-cmp-tabs', role: 'group', 'aria-label': 'Kennzahlengruppe' }, tabs), grid]);
  }
  function compareBody(f, opt, peers, holder, tok) {
    holder.setAttribute('aria-busy', 'true');
    holder.replaceChildren(el('div', { class: 'fu-skel', style: 'height:160px' }));
    Promise.all(peers.map(function (pr) { return loadStock(pr.ticker).then(M.compareRow, function () { return { ticker: pr.ticker, name: pr.name, available: false }; }); })).then(function (peerRows) {
      if (holder._tok !== tok) return; // inzwischen andere Gruppe gewaehlt
      var rows = [M.compareRow(f)].concat(peerRows);
      var me = rows[0];
      holder.replaceChildren(
        el('ul', { class: 'fu-cmp-peers', 'aria-label': 'Vergleichsunternehmen' }, rows.map(function (r, i) {
          var meta = peers[i - 1], fyDiff = r.available && r.fy && me.fy && r.fy !== me.fy;
          return el('li', { class: i ? '' : 'is-self' }, [
            i ? el('a', { href: '#/' + encodeURIComponent(r.ticker) }, [el('b', { text: r.ticker }), el('span', { text: (meta && meta.name) || r.name || r.ticker })])
              : el('span', { class: 'fu-cmp-me' }, [el('b', { text: r.ticker }), el('span', { text: f.name || r.ticker })]),
            el('small', { text: [meta && meta.was, r.available === false ? 'keine SEC-Zahlen' : 'GJ ' + r.fy + (fyDiff ? ' (abweichend)' : '')].filter(Boolean).join(' · ') })
          ]);
        })),
        cmpGroups(rows, me.ticker)
      );
      holder.removeAttribute('aria-busy');
    });
  }
  function compareSection(f) {
    var opts = f.peerOptions || [];
    if (!opts.length) return sec('vergleich', 'Im Vergleich', null, [
      el('p', { class: 'vu-empty' }, [el('b', { text: 'Keine sinnvoll vergleichbaren Unternehmen hinterlegt.' }), 'Weder kuratierter Sektor noch Discover-Thema.'])]);
    var holder = el('div', { class: 'fu-cmp-body' }), rule = el('p');
    var rev = f.metrics.filter(function (m) { return m.id === 'revenue'; })[0];
    var buttons = opts.map(function (o, i) {
      return el('button', { type: 'button', class: 'fu-chip fu-cmp-opt', 'aria-pressed': i ? 'false' : 'true', onclick: function () { pick(i); } }, o.label);
    });
    function pick(i) {
      var o = opts[i], tok = holder._tok = (holder._tok || 0) + 1;
      buttons.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === i)); });
      rule.textContent = 'Auswahl: ' + o.rule + ' · letztes Geschäftsjahr je Unternehmen. Balken: gemeinsame Skala der Gruppe ab Null, Ausreißer gekappt (Pfeil).';
      if (o.peers) return compareBody(f, o, o.peers, holder, tok);
      holder.replaceChildren(el('div', { class: 'fu-skel', style: 'height:160px' }));
      loadRow(o.row).then(function (row) {
        if (holder._tok !== tok) return;
        var peers = M.peersFromRow(row, f.ticker, 4, rev && rev.last ? rev.last.v : null);
        if (!peers.length) { holder.replaceChildren(el('div', { class: 'fu-notice' }, el('b', { text: 'In diesem Thema gibt es keine weiteren Unternehmen mit Umsatzangabe.' }))); return; }
        compareBody(f, o, peers, holder, tok);
      }).catch(function () { if (holder._tok === tok) holder.replaceChildren(el('div', { class: 'fu-notice' }, el('b', { text: 'Die Vergleichsgruppe konnte gerade nicht geladen werden.' }))); });
    }
    var out = sec('vergleich', 'Im Vergleich', null, [
      el('div', { class: 'fu-chips fu-cmp-opts', role: 'group', 'aria-label': 'Vergleichsgruppe' }, buttons),
      holder, more('Wie ist die Gruppe gewählt?', [rule])
    ]);
    setTimeout(function () { pick(0); }, 0);
    return out;
  }

  /* ------------------------------------------------------------ Unternehmen */
  function dirClass(c) { return c ? ' dir-' + c.dir : ''; }
  function kpiTile(m) {
    var main = m.ttm || (m.last ? { v: m.last.v } : null);
    return el('div', { class: 'vu-kpi fu-kpi' }, [
      el('span', { class: 'vu-kpi-label', text: m.label + (m.ttm ? ' · letzte 12 Monate' : ' · GJ ' + m.last.fy) }),
      el('strong', { class: 'vu-kpi-value fu-num', text: main ? M.value(m, main.v) : 'keine Angabe' }),
      m.last ? el('span', { class: 'vu-kpi-sub' }, [el('span', { text: 'GJ ' + m.last.fy + ': ' + M.value(m, m.last.v) }),
        m.change ? el('span', { class: 'fu-dir' + dirClass(m.change), text: M.changeText(m, m.change) + ' ggü. ' + m.prev.fy }) : null]) : null
    ]);
  }
  function metricCard(m) {
    if (!m.available) return el('article', { class: 'fu-card is-empty' }, [el('h3', { text: m.label }), el('p', { class: 'fu-empty', text: 'keine Angabe in den SEC-Meldungen' })]);
    return el('article', { class: 'fu-card' }, [
      el('div', { class: 'fu-card-head' }, [el('h3', { text: m.label }), m.caveat ? el('span', { class: 'fu-warn', title: m.caveat, text: '⚠ eingeschränkt vergleichbar' }) : null]),
      el('div', { class: 'fu-card-val' }, [el('strong', { class: 'fu-num', text: M.value(m, m.last.v) }), el('span', { text: 'GJ ' + m.last.fy })]),
      m.change ? el('span', { class: 'fu-dir' + dirClass(m.change), text: M.changeText(m, m.change) + ' ggü. GJ ' + m.prev.fy }) : el('span', { class: 'fu-dir', text: 'Kein Vorjahreswert' }),
      bars(m),
      m.gaps.length ? el('p', { class: 'fu-card-foot', text: 'keine Angabe ' + M.yearRanges(m.gaps) }) : null
    ]);
  }
  function marginCard(f) {
    var avail = f.margins.filter(function (m) { return m.available; });
    if (!avail.length) return null;
    return el('article', { class: 'fu-card' }, [
      el('div', { class: 'fu-card-head' }, [el('h3', { text: 'Margen je Geschäftsjahr' })]),
      el('ul', { class: 'fu-legend' }, avail.map(function (m, k) {
        return el('li', {}, [el('i', { class: 'sw s' + k, 'aria-hidden': 'true' }), el('span', { text: m.label }), el('b', { class: 'fu-num', text: M.pct(m.last.v) }),
          m.change ? el('span', { class: 'fu-dir' + dirClass(m.change), text: M.changeText(m, m.change) }) : null]);
      })),
      lines(f.margins, f.years)
    ]);
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  /* Daten & Methodik: Datenlage, Quelle je Geschaeftsjahr mit SEC-Links, Hinweis. Einmal je Seite, am Ende. */
  function dataMethod(f) {
    var gaps = f.metrics.filter(function (m) { return m.available && m.gaps.length; });
    var missing = f.metrics.filter(function (m) { return !m.available; }).map(function (m) { return m.label; });
    var stale = f.stale && f.stale.stale;
    var rows = f.sources.slice().reverse().map(function (s) {
      return el('tr', {}, [el('th', { scope: 'row', text: 'GJ ' + s.fy }), el('td', { class: 'fu-num', text: s.values + ' von ' + s.of }),
        el('td', {}, s.filings.length ? s.filings.map(function (x, i) {
          var url = M.secFilingUrl(f.cik, x.accn);
          return el('span', { class: 'fu-filing' }, [i ? ' · ' : '', url ? el('a', { href: url, target: '_blank', rel: 'noopener', text: 'Meldung vom ' + M.dateDe(x.filed) }) : 'Meldung vom ' + M.dateDe(x.filed)]);
        }) : 'keine')]);
    });
    return el('details', { class: 'vu-dm', id: 'quellen' }, [
      el('summary', {}, ['Daten & Methodik', el('small', { text: 'Stand ' + M.dateDe(f.asOf) })]),
      el('dl', {}, [
        el('dt', { text: 'Quelle' }), el('dd', { text: 'SEC EDGAR (' + (f.source || 'sec_edgar') + ') · CIK ' + Number(f.cik) }),
        el('dt', { text: 'Geschäftsjahre' }), el('dd', { text: f.years.length + (f.years.length ? ' (' + f.years[0] + '–' + f.years[f.years.length - 1] + ')' : '') }),
        el('dt', { text: 'Letzte 12 Monate' }), el('dd', { text: f.ttmThrough ? f.ttmThrough.replace(/^FY(\d{4})Q(\d)$/, 'bis GJ $1 · Q$2') + ' (Summe der letzten vier Quartale)' : 'keine' }),
        el('dt', { text: 'Aktualität' }), el('dd', { text: (stale ? '⚠ veraltet' : '✓ aktuell') + ' · letztes Geschäftsjahr ' + f.latestFiscalYear }),
        el('dt', { text: 'Lücken' }), el('dd', { text: (gaps.length ? gaps.map(function (m) { return m.label + ' (' + M.yearRanges(m.gaps) + ')'; }).join(', ') : 'keine') + (missing.length ? ' · nicht gemeldet: ' + missing.join(', ') : '') }),
        el('dt', { text: 'Hinweis' }), el('dd', {}, ['Rückblickende Ansicht aus SEC-Meldungen, keine Bewertung, keine Empfehlung. ', el('a', { href: '#/methodik', text: 'Methodik' })])
      ]),
      el('h3', { class: 'fu-dm-h', text: 'Quelle je Geschäftsjahr' }),
      el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Jahr' }), el('th', { scope: 'col', text: 'Kennzahlen mit Wert' }), el('th', { scope: 'col', text: 'Meldung (öffnet sec.gov)' })])),
        el('tbody', {}, rows)])),
      el('p', { text: 'Ein Wert stammt aus der Meldung, in der er zuletzt berichtet wurde – oft der Jahresbericht eines späteren Jahres mit Vorjahresvergleich.' })
    ]);
  }
  /* Kurs fuer den Kopf: nur ein echter Kurs mit Datum aus der Discover-Aktiendatei (Schlusskurs), sonst keiner. */
  function quoteFrom(raw) {
    var p = raw && raw.price, at = raw && raw.asOf;
    if (!p || typeof p.value !== 'number' || !isFinite(p.value) || p.value <= 0 || p.reason || typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(at)) return null;
    var c = raw.changePercent, ch = c && typeof c.value === 'number' && isFinite(c.value) && !c.reason ? c.value : null;
    return { value: p.value, currency: 'USD', changePct: ch, changeLabel: ch == null ? null : 'zum Vortag', kind: 'close', at: M.dateDe(at.slice(0, 10)) };
  }
  /* Einheitlicher Aktienkopf (assets/stock-navigator.js); ohne Navigator-Skripte ein schlichter Kopf. */
  function stockHead(t, f) {
    var host = el('div', { class: 'fu-shead' });
    var SN = global.VUStockNavigator, SCX = global.VUCore && global.VUCore.StockContext, ctx = null;
    try { ctx = SN && SCX ? SCX.fromUs(t, { name: f && f.name }) : null; } catch (e) { ctx = null; }
    if (ctx) {
      SN.head(host, { ctx: ctx, current: 'fundamental', name: (f && f.name) || t, exchange: f && f.exchange, price: f && f.quote, back: { href: '#/', label: 'Fundamental' } });
      return host;
    }
    host.append(el('header', { class: 'fu-head' }, [el('a', { class: 'fu-back', href: '#/', text: '← Fundamental' }), el('p', { class: 'fu-eyebrow', text: 'Fundamental · ' + t }), el('h1', { text: (f && f.name) || t })]));
    return host;
  }
  function company(t) {
    setTitle(t);
    main.setAttribute('aria-busy', 'true');
    main.replaceChildren(el('div', { class: 'fu-boot' }, [el('div', { class: 'fu-skel', style: 'height:40px;width:50%' }), el('div', { class: 'fu-skel', style: 'height:120px;margin-top:16px' })]));
    var p = loadStock(t);
    p.then(function (f) {
      if (location.hash.replace(/^#\/?/, '').split('?')[0].toUpperCase() !== t && decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]).toUpperCase() !== t) return;
      setTitle((f.name || t) + ' (' + t + ')');
      var head = stockHead(t, f);
      if (!f.available) {
        main.replaceChildren(head, el('p', { class: 'vu-empty' }, [el('b', { text: 'Für diese Aktie liegen keine SEC-Geschäftszahlen vor.' }),
          'Typisch für Fonds, ausländische Emittenten ohne US-Jahresbericht oder sehr junge Notierungen.']));
        return done();
      }
      var stale = f.stale && f.stale.stale;
      var caveats = uniq(f.caveats.map(function (c) { return c.text; }));
      main.replaceChildren.apply(main, [
        head,
        stale ? el('p', { class: 'vu-alert', role: 'note', text: 'Die Geschäftszahlen sind veraltet: letztes gemeldetes Geschäftsjahr ' + f.latestFiscalYear + '.' }) : null,
        f.kpis.length ? el('section', { class: 'vu-kpis fu-kpis', 'aria-label': 'Kennzahlen' }, f.kpis.map(kpiTile)) : null,
        sectionNav(f),
        growthSection(f),
        profitSection(f),
        valuationSection(f),
        balanceSection(f),
        compareSection(f),
        sec('verlauf', 'Verlauf je Geschäftsjahr', null, caveats.map(function (c) { return el('p', { class: 'vu-alert', role: 'note', text: c }); }).concat([
          el('div', { class: 'fu-grid' }, f.metrics.filter(function (m) { return m.id !== 'operating_cash_flow' || m.available; }).map(metricCard)),
          more('Wie lese ich die Balken?', [el('p', { text: 'Ein Balken je Geschäftsjahr, das letzte Jahr hervorgehoben. ▲ ▼ zeigt die Richtung zum Vorjahr. Ein gestricheltes Feld heißt: für dieses Jahr keine Angabe in den SEC-Meldungen – es wird nichts geschätzt oder aufgefüllt.' })])
        ]), el('a', { class: 'vu-sec-link', href: '/quant/#/aktie/' + encodeURIComponent(t) + '/zahlen' }, 'Einzelne Kennzahl erkunden →')),
        dataMethod(f)
      ].filter(Boolean));
      done();
      var want = /[?&]s=([a-z]+)/.exec(location.hash), target = want && document.getElementById(want[1]);
      if (target) { if (target.tagName === 'DETAILS') target.open = true; target.scrollIntoView({ block: 'start' }); }
    }).catch(function (e) {
      var notFound = e && e.status === 404;
      main.replaceChildren(el('header', { class: 'fu-head' }, [el('a', { class: 'fu-back', href: '#/', text: '← Fundamental' }), el('h1', { text: t })]),
        el('p', { class: 'vu-empty' }, [el('b', { text: notFound ? 'Diese Aktie ist nicht im US-Universum.' : 'Die Daten konnten gerade nicht geladen werden.' }),
          notFound ? 'Fundamental zeigt US-Unternehmen mit SEC-Meldungen.' : 'Bitte später erneut versuchen.']),
        notFound ? el('div', { class: 'fu-retry' }, [searchBox(), exampleChips()]) : null);
      done();
    });
  }

  function method() {
    setTitle('Methodik');
    main.replaceChildren(el('article', { class: 'fu-method' }, [
      el('a', { class: 'fu-back', href: '#/', text: '← Fundamental' }),
      el('h1', { text: 'Methodik' }),
      el('p', { text: 'Fundamental zeigt Geschäftszahlen, die US-Unternehmen in ihren Pflichtmeldungen an die SEC berichten (Companyfacts von SEC EDGAR). Es ist dieselbe Aufbereitung, die Discover und Quant verwenden – Fundamental ordnet sie nur anders an.' }),
      el('h2', { text: 'Was gezeigt wird' }),
      el('ul', {}, [el('li', { text: 'Je Geschäftsjahr der berichtete Wert, dazu die Summe der letzten vier Quartale („letzte 12 Monate“), wenn vorhanden.' }),
        el('li', { text: 'Die Richtung zum Vorjahr (▲ gestiegen, ▼ gefallen, ■ gleich) und die Veränderung in Prozent. Wechselt das Vorzeichen, steht dort „Vorzeichenwechsel“ statt einer Prozentzahl.' }),
        el('li', { text: 'Margen als Anteil am Umsatz; die Veränderung in Prozentpunkten (Pp.).' }),
        el('li', { text: 'Lücken: Fehlt ein Wert, bleibt das Jahr leer markiert. Es wird nichts geschätzt oder aufgefüllt.' }),
        el('li', { text: 'Hinweise wie „eingeschränkt vergleichbar“ entstehen, wenn sich etwa die Aktienanzahl sprunghaft ändert (Split oder Kapitalmaßnahme ohne rückwirkende Bereinigung).' })]),
      el('h2', { text: 'Was nicht gezeigt wird' }),
      el('p', { text: 'Keine Bewertung, kein Score, keine Prognose und keine Empfehlung. Ob steigende Schulden oder sinkende Aktienanzahl gut sind, hängt vom Unternehmen ab.' })
    ]));
    done();
  }

  function render() {
    var r = M.parseRoute(location.hash);
    window.scrollTo(0, 0);
    main.removeAttribute('data-view');
    if (r.view === 'company') company(r.ticker); else if (r.view === 'method') method(); else home(r.focus);
    var h = main.querySelector('h1'); if (h && r.view !== 'home') { h.setAttribute('tabindex', '-1'); }
    if (r.focus === 'suche') { var q = document.getElementById('fu-q'); if (q) q.focus({ preventScroll: true }); }
    // Produkt-Leiste der Shell (opt-in); den aktiven Eintrag leitet sie aus der Adresse ab.
    if (global.VUNavigation) global.VUNavigation.dock({});
  }
  window.addEventListener('hashchange', render);
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
