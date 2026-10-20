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

  function searchIcon() {
    return svg('svg', { class: 'fu-search-ico', 'aria-hidden': 'true', viewBox: '0 0 24 24' }, [svg('circle', { cx: 11, cy: 11, r: 6.5 }), svg('path', { d: 'M16 16l4.5 4.5' })]);
  }

  /* ------------------------------------------------------------ Start */
  function home() {
    setTitle(null);
    main.replaceChildren(
      el('section', { class: 'fu-hero' }, [
        el('p', { class: 'fu-eyebrow', text: 'Vision Universe' }),
        el('div', { class: 'fu-hero-title' }, [el('span', { class: 'fu-hero-icon' }, icon('fundamental', 'fu-ico-lg')), el('h1', { text: 'Fundamental' })]),
        el('p', { class: 'fu-lead', text: 'Was ein Unternehmen umsetzt, verdient und besitzt – Jahr für Jahr aus den Pflichtmeldungen an die US-Börsenaufsicht.' }),
        searchBox(),
        el('div', { class: 'fu-chips', role: 'list', 'aria-label': 'Beispiele' }, EXAMPLES.map(function (e) {
          return el('a', { class: 'fu-chip', role: 'listitem', href: '#/' + e[0] }, [el('b', { text: e[0] }), e[1]]);
        }))
      ]),
      el('section', { class: 'fu-how', 'aria-label': 'So liest du Fundamental' }, [
        howTile('▦', 'Auf einen Blick', 'Umsatz, Gewinn, Cashflow, Schulden und Aktienanzahl über alle verfügbaren Geschäftsjahre.'),
        howTile('▲▼', 'Richtung zum Vorjahr', 'Jede Kennzahl zeigt, ob sie gestiegen oder gefallen ist – ohne Bewertung.'),
        howTile('◇', 'Lücken bleiben sichtbar', 'Fehlt ein Wert in den Meldungen, steht dort „keine Angabe“ statt einer Schätzung.'),
        howTile('§', 'Quelle je Jahr', 'Zu jedem Geschäftsjahr: Meldedatum und Link auf die Meldung bei der SEC.')
      ]),
      el('p', { class: 'fu-fine' }, ['US-Unternehmen mit SEC-Meldungen. Rückblickende Ansicht, keine Empfehlung. ', el('a', { href: '#/methodik', text: 'Methodik' })])
    );
    done();
  }
  function howTile(sym, title, text) { return el('div', { class: 'fu-howtile' }, [el('span', { class: 'fu-howsym', 'aria-hidden': 'true', text: sym }), el('b', { text: title }), el('span', { text: text })]); }

  /* ------------------------------------------------------------ Diagramme */
  var W = 300, H = 110, PAD = 6;
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
    return svg('svg', { class: 'fu-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label, preserveAspectRatio: 'none' }, [g]);
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

  /* ------------------------------------------------------------ Unternehmen */
  function dirClass(c) { return c ? ' dir-' + c.dir : ''; }
  function kpiTile(m) {
    var main = m.ttm || (m.last ? { v: m.last.v } : null);
    return el('div', { class: 'fu-kpi' }, [
      el('span', { class: 'fu-kpi-label', text: m.label + (m.ttm ? ' · letzte 12 Monate' : ' · GJ ' + m.last.fy) }),
      el('strong', { class: 'fu-num', text: main ? M.value(m, main.v) : '–' }),
      m.last ? el('span', { class: 'fu-kpi-sub' }, ['GJ ' + m.last.fy + ': ' + M.value(m, m.last.v) + ' ',
        m.change ? el('span', { class: 'fu-dir' + dirClass(m.change), text: M.changeText(m, m.change) + ' ggü. ' + m.prev.fy }) : null]) : null
    ]);
  }
  function metricCard(m) {
    if (!m.available) return el('article', { class: 'fu-card is-empty' }, [el('h3', { text: m.label }), el('p', { class: 'fu-empty', text: 'Keine Angabe in den SEC-Meldungen.' })]);
    var have = m.rows.filter(function (r) { return r.v != null; }).length;
    return el('article', { class: 'fu-card' }, [
      el('div', { class: 'fu-card-head' }, [el('h3', { text: m.label }), m.caveat ? el('a', { class: 'fu-warn', href: '#fu-h-data', title: m.caveat, text: '⚠ eingeschränkt vergleichbar' }) : null]),
      el('div', { class: 'fu-card-val' }, [el('strong', { class: 'fu-num', text: M.value(m, m.last.v) }), el('span', { text: 'GJ ' + m.last.fy })]),
      m.change ? el('span', { class: 'fu-dir' + dirClass(m.change), text: M.changeText(m, m.change) + ' ggü. GJ ' + m.prev.fy }) : el('span', { class: 'fu-dir', text: 'Kein Vorjahreswert' }),
      bars(m),
      el('p', { class: 'fu-card-foot' }, [have + ' von ' + m.rows.length + ' Jahren mit Wert', m.gaps.length ? ' · keine Angabe ' + M.yearRanges(m.gaps) : ''])
    ]);
  }
  function marginCard(f) {
    var avail = f.margins.filter(function (m) { return m.available; });
    if (!avail.length) return null;
    return el('article', { class: 'fu-card fu-card-wide' }, [
      el('div', { class: 'fu-card-head' }, [el('h3', { text: 'Margen' })]),
      el('ul', { class: 'fu-legend' }, avail.map(function (m, k) {
        return el('li', {}, [el('i', { class: 'sw s' + k, 'aria-hidden': 'true' }), el('span', { text: m.label }), el('b', { class: 'fu-num', text: M.pct(m.last.v) }),
          m.change ? el('span', { class: 'fu-dir' + dirClass(m.change), text: M.changeText(m, m.change) }) : null]);
      })),
      lines(f.margins, f.years),
      el('p', { class: 'fu-card-foot', text: 'Anteil am Umsatz je Geschäftsjahr: Bruttogewinn, operatives Ergebnis und Nettogewinn, jeweils geteilt durch den gemeldeten Umsatz.' })
    ]);
  }
  function dataTile(label, value, sub, tone) {
    return el('div', { class: 'fu-dtile' + (tone ? ' tone-' + tone : '') }, [el('span', { text: label }), el('b', { text: value }), sub ? el('small', { text: sub }) : null]);
  }
  function dataStatus(f) {
    var gaps = f.metrics.filter(function (m) { return m.available && m.gaps.length; }).length;
    var missing = f.metrics.filter(function (m) { return !m.available; }).map(function (m) { return m.label; });
    var stale = f.stale && f.stale.stale;
    return el('section', { class: 'fu-section', 'aria-labelledby': 'fu-h-data' }, [
      el('h2', { id: 'fu-h-data', text: 'Datenlage' }),
      el('div', { class: 'fu-dtiles' }, [
        dataTile('Geschäftsjahre', String(f.years.length), f.years.length ? f.years[0] + '–' + f.years[f.years.length - 1] : null),
        dataTile('Letzte 12 Monate', f.ttmThrough ? f.ttmThrough.replace(/^FY(\d{4})Q(\d)$/, 'GJ $1 · Q$2') : 'keine', f.ttmThrough ? 'Summe der letzten vier Quartale' : null),
        dataTile('Aktualität', stale ? '⚠ veraltet' : '✓ aktuell', 'Letztes Geschäftsjahr ' + f.latestFiscalYear, stale ? 'warn' : null),
        dataTile('Lücken', gaps ? gaps + ' Kennzahl' + (gaps === 1 ? '' : 'en') : 'keine', missing.length ? 'nicht gemeldet: ' + missing.join(', ') : null)
      ]),
      f.caveats.length ? el('ul', { class: 'fu-caveats' }, uniq(f.caveats.map(function (c) { return c.text; })).map(function (t) { return el('li', {}, [el('span', { 'aria-hidden': 'true', text: '⚠ ' }), t]); })) : null
    ]);
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function sourcesTable(f) {
    var rows = f.sources.slice().reverse().map(function (s) {
      return el('tr', {}, [el('th', { scope: 'row', text: 'GJ ' + s.fy }), el('td', { class: 'fu-num', text: s.values + ' von ' + s.of }),
        el('td', {}, s.filings.length ? s.filings.map(function (x, i) {
          var url = M.secFilingUrl(f.cik, x.accn);
          return el('span', { class: 'fu-filing' }, [i ? ' · ' : '', url ? el('a', { href: url, target: '_blank', rel: 'noopener', text: 'Meldung vom ' + M.dateDe(x.filed) }) : 'Meldung vom ' + M.dateDe(x.filed)]);
        }) : 'keine')]);
    });
    return el('details', { class: 'fu-sources' }, [
      el('summary', {}, [el('span', { text: 'Quelle je Geschäftsjahr' }), el('small', { text: f.sources.length + ' Jahre · SEC EDGAR' })]),
      el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Jahr' }), el('th', { scope: 'col', text: 'Kennzahlen mit Wert' }), el('th', { scope: 'col', text: 'Meldung (öffnet sec.gov)' })])),
        el('tbody', {}, rows)])),
      el('p', { class: 'fu-fine', text: 'Ein Wert stammt aus der Meldung, in der er zuletzt berichtet wurde – oft der Jahresbericht eines späteren Jahres mit Vorjahresvergleich.' })
    ]);
  }
  function links(t) {
    var e = encodeURIComponent(t);
    return el('nav', { class: 'fu-links', 'aria-label': 'Dieselbe Aktie in anderen Welten' }, [
      el('a', { href: '/quant/#/aktie/' + e + '/zahlen' }, [icon('quant'), el('span', { text: 'Einzelne Kennzahl erkunden' })]),
      el('a', { href: '/discover/#/s/US_REAL/' + e }, [icon('discover'), el('span', { text: 'Aktienseite in Discover' })]),
      el('a', { href: '/quant/#/aktie/' + e }, [icon('quant'), el('span', { text: 'Quant-Analyse' })]),
      el('a', { href: '/elliott/#/' + e }, [icon('elliott'), el('span', { text: 'Elliott' })])
    ]);
  }
  function company(t) {
    setTitle(t);
    main.setAttribute('aria-busy', 'true');
    main.replaceChildren(el('div', { class: 'fu-boot' }, [el('div', { class: 'fu-skel', style: 'height:40px;width:50%' }), el('div', { class: 'fu-skel', style: 'height:120px;margin-top:16px' })]));
    var p = state.cache[t] || (state.cache[t] = fetchJson(M.stockPath(t)).then(M.fromStock).catch(function (e) { delete state.cache[t]; throw e; }));
    p.then(function (f) {
      if (location.hash.replace(/^#\/?/, '').split('?')[0].toUpperCase() !== t && decodeURIComponent(location.hash.replace(/^#\/?/, '').split('?')[0]).toUpperCase() !== t) return;
      setTitle((f.name || t) + ' (' + t + ')');
      var head = el('header', { class: 'fu-head' }, [
        el('a', { class: 'fu-back', href: '#/', text: '← Fundamental' }),
        el('p', { class: 'fu-eyebrow', text: 'Fundamental · ' + t }),
        el('h1', { text: f.name || t })
      ]);
      if (!f.available) {
        main.replaceChildren(head, el('div', { class: 'fu-notice' }, [el('b', { text: 'Für diese Aktie liegen keine SEC-Geschäftszahlen vor.' }),
          el('span', { text: 'Typisch für Fonds, ausländische Emittenten ohne US-Jahresbericht oder sehr junge Notierungen.' })]), links(t));
        return done();
      }
      head.append(el('p', { class: 'fu-meta', text: 'SEC EDGAR · CIK ' + Number(f.cik) + ' · Stand ' + M.dateDe(f.asOf) + ' · ' + f.years.length + ' Geschäftsjahre' + (f.ttmThrough ? ' + letzte 12 Monate' : '') }));
      main.replaceChildren(
        head,
        f.kpis.length ? el('section', { class: 'fu-kpis', 'aria-label': 'Kennzahlen' }, f.kpis.map(kpiTile)) : null,
        el('section', { class: 'fu-section', 'aria-labelledby': 'fu-h-glance' }, [
          el('h2', { id: 'fu-h-glance', text: 'Auf einen Blick' }),
          el('p', { class: 'fu-sub', text: 'Jedes Geschäftsjahr ein Balken, das letzte hervorgehoben. ▲ ▼ zeigen die Richtung zum Vorjahr, nicht ob sie gut ist.' }),
          el('div', { class: 'fu-grid' }, f.metrics.filter(function (m) { return m.id !== 'operating_cash_flow' || m.available; }).map(metricCard).concat([marginCard(f)]))
        ]),
        dataStatus(f),
        sourcesTable(f),
        links(t),
        el('p', { class: 'fu-fine' }, ['Rückblickende Ansicht aus SEC-Meldungen (', f.source || 'sec_edgar', '), keine Bewertung, keine Empfehlung. ', el('a', { href: '#/methodik', text: 'Methodik' })])
      );
      done();
    }).catch(function (e) {
      var notFound = e && e.status === 404;
      main.replaceChildren(el('header', { class: 'fu-head' }, [el('a', { class: 'fu-back', href: '#/', text: '← Fundamental' }), el('h1', { text: t })]),
        el('div', { class: 'fu-notice' }, [el('b', { text: notFound ? 'Diese Aktie ist nicht im US-Universum.' : 'Die Daten konnten gerade nicht geladen werden.' }),
          el('span', { text: notFound ? 'Fundamental zeigt US-Unternehmen mit SEC-Meldungen.' : 'Bitte später erneut versuchen.' })]));
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
    if (r.view === 'company') company(r.ticker); else if (r.view === 'method') method(); else home();
    var h = main.querySelector('h1'); if (h && r.view !== 'home') { h.setAttribute('tabindex', '-1'); }
  }
  window.addEventListener('hashchange', render);
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
