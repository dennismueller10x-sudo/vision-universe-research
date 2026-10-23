/* Fundamental 2.0 – Oberflaeche.
 * Routen: #/ (Start), #/entdecken, #/suche, #/methodik, #/rangliste/<id>, #/branche/<SIC2>,
 *         #/<T> (Ueberblick) und #/<T>?ansicht=kennzahlen|kennzahl&k=<id>|vergleich|finanzen|mehr|<bereich>.
 * Daten: Discover-Aktiendatei, SEC-Historie (Release), Screener-Universum, Kursreihen, Analysten – siehe engine/catalog.js. */
(function (global) {
  'use strict';
  var M = global.VUFundamental.Model, C = global.VUFundamental.Catalog;
  var ID = global.VUCore && global.VUCore.Identity;
  var main = document.getElementById('fu-main');
  var EXAMPLES = [['NVDA', 'NVIDIA'], ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['PLTR', 'Palantir'], ['JPM', 'JPMorgan Chase'], ['KO', 'Coca-Cola']];
  var state = { search: null, searchPromise: null, cache: {}, rows: {}, json: {} };
  var isNum = C.isNum;

  /* ------------------------------------------------------------ DOM */
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
  /* Inhalt ersetzen; null/false-Eintraege (bedingte Bausteine) fallen weg, Listen werden flach. */
  function put(n) {
    var kids = [].slice.call(arguments, 1).reduce(function (a, k) { return a.concat(k); }, []).filter(function (k) { return k != null && k !== false && k !== ''; });
    n.replaceChildren.apply(n, kids); return n;
  }
  function svg(tag, attrs, kids) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { if (c) n.append(c); });
    return n;
  }
  function productIcon(name, cls) {
    var s = svg('svg', { class: cls || 'fu-ico', 'aria-hidden': 'true', viewBox: '0 0 24 24' });
    s.append(svg('use', { href: '/assets/product-icons.svg#' + name }));
    return s;
  }
  /* Kleine Linien-Symbole je Kategorie (eigene Geometrie, currentColor). */
  var GLYPH = {
    growth: 'M4 17l5-5 4 3 7-8M15 7h5v5', income: 'M5 20V10M10 20V6M15 20v-8M20 20V4', margin: 'M5 19L19 5M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4', balance: 'M12 4v16M5 8h14M5 8l-3 6h6zM19 8l-3 6h6zM8 20h8', share: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    valuation: 'M4 20h16M6 16l4-6 4 3 5-8M9 4h6', dividend: 'M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.4 5 3.4-2.2 3.1-5 3.1-5-1.2-5-3', analysts: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15.5c3 0 8 1 8 4.5',
    company: 'M4 21V5l8-2v18M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01M2 21h20', source: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7', investors: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-7 7-7s7 3 7 7M17 3.5a4 4 0 0 1 0 7.5M22 21c0-3-1.5-5.5-4-6.5',
    chevron: 'M9 6l6 6-6 6', back: 'M15 6l-6 6 6 6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l4.5 4.5', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.01', download: 'M12 4v11M7 10l5 5 5-5M5 20h14'
  };
  function glyph(name, cls) {
    return svg('svg', { class: cls || 'fu-glyph', viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [svg('path', { d: GLYPH[name] || GLYPH.info })]);
  }
  function fetchJson(path) {
    return fetch(path, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r.json(); });
  }
  /* .gz wird ausgeliefert, wie es ist (der Browser entpackt nicht transparent) – wie quant/ui/shell.js#loadCompressedJSON. */
  function fetchGz(path) {
    return fetch(path, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.arrayBuffer();
    }).then(function (buf) {
      if (typeof DecompressionStream !== 'function') throw new Error('GZIP_UNSUPPORTED');
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }).then(JSON.parse);
  }
  function once(key, make) {
    return state.json[key] || (state.json[key] = make().catch(function (e) { delete state.json[key]; throw e; }));
  }
  function setTitle(t) { document.title = t ? t + ' · Fundamental · Vision Universe®' : 'Fundamental · Vision Universe®'; }
  function done() { main.removeAttribute('aria-busy'); }
  function skel(h, w) { return el('div', { class: 'fu-skel', style: 'height:' + h + 'px' + (w ? ';width:' + w : '') }); }
  function notice(title, text) { return el('div', { class: 'fu-notice' }, [el('b', { text: title }), text ? el('span', { text: text }) : null]); }
  function more(summary, kids) { return el('details', { class: 'vu-more' }, [el('summary', { text: summary }), el('div', { class: 'vu-more-body' }, kids)]); }
  function sec(title, opt, kids) {
    opt = opt || {};
    return el('section', { class: 'fu-section', id: opt.id || null }, [
      el('div', { class: 'fu-sec-head' }, [el('h2', { class: 'fu-h2', text: title }), opt.link ? el('a', { class: 'fu-sec-link', href: opt.link[0] }, [opt.link[1], glyph('chevron', 'fu-glyph-sm')]) : null]),
      opt.sub ? el('p', { class: 'fu-sub', text: opt.sub }) : null].concat(kids || []));
  }

  /* ------------------------------------------------------------ Daten */
  function loadUniverse() { return once('universe', function () { return fetchJson(C.UNIVERSE_PATH).then(function (u) { var U = C.universe(u); if (!U) throw new Error('INVALID_UNIVERSE'); return U; }); }); }
  function loadAnalysts() { return once('analysts', function () { return fetchJson(C.ANALYST_PATH); }); }
  function loadRow(path) { return state.rows[path] || (state.rows[path] = fetchJson(path).catch(function (e) { delete state.rows[path]; throw e; })); }
  function loadHistory(t) {
    if (!ID) return Promise.resolve(null);
    return once('h:' + ID.shardKey(t), function () { return fetchGz(C.historyPath(t, ID.shardKey)); })
      .then(function (shard) { return shard && shard.schema === 'vu-fundamental-history-shard-1.0.0' ? (shard.issuers || {})[t] || null : null; })
      .catch(function () { return null; });
  }
  /* Ein Unternehmen: Discover-Aktiendatei (Pflicht) + SEC-Historie (wenn ausgeliefert). */
  function loadCompany(t) {
    return state.cache[t] || (state.cache[t] = fetchJson(M.stockPath(t)).then(function (raw) {
      return loadHistory(t).then(function (h) {
        var book = C.fromHistory(h, raw) || C.fromDiscover(raw);
        return { t: t, raw: raw, f: M.fromStock(raw), book: book, name: raw.companyName || raw.legalName || t, quote: quoteFrom(raw), exchange: raw.exchange || null };
      });
    }).catch(function (e) { delete state.cache[t]; throw e; }));
  }
  function quoteFrom(raw) {
    var p = raw && raw.price, at = raw && raw.asOf;
    if (!p || !isNum(p.value) || p.value <= 0 || p.reason || typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(at)) return null;
    var c = raw.changePercent, ch = c && isNum(c.value) && !c.reason ? c.value : null;
    return { value: p.value, currency: 'USD', changePct: ch, changeLabel: ch == null ? null : 'zum Vortag', kind: 'close', at: M.dateDe(at.slice(0, 10)) };
  }

  /* ------------------------------------------------------------ Format */
  function cur(co) { return co && co.book ? co.book.currency : 'USD'; }
  function val(def, v, currency) { return C.fmt(def, v, currency); }
  function dirClass(c) { return c ? ' is-' + c.dir : ''; }
  function nf(v) { return isNum(v) ? v.toLocaleString('de-DE') : '–'; }
  function basisText(c) {
    if (!c) return '';
    if (c.basis === 'TTM') return 'LTM';
    if (c.basis === 'MARKET') return 'aktuell';
    return c.label || '';
  }
  /* Achsen-Skala: eine Einheit fuer alle Balken (z. B. "Mrd. $"), Zahlen ohne Einheit. */
  function scaleFor(def, vals, currency) {
    var max = Math.max.apply(null, vals.map(function (v) { return Math.abs(v); }).concat([0])), sym = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' }[currency] || currency;
    var d2 = function (x, d) { return x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); };
    if (def.kind === 'money') {
      var u = max >= 1e12 ? [1e12, 'Bio.'] : max >= 1e9 ? [1e9, 'Mrd.'] : max >= 1e6 ? [1e6, 'Mio.'] : [1e3, 'Tsd.'];
      return { unit: u[1] + ' ' + sym, f: function (v) { var x = v / u[0]; return (x < 0 ? '−' : '') + d2(Math.abs(x), Math.abs(x) >= 100 ? 0 : 1); } };
    }
    if (def.kind === 'shares') { var s = max >= 1e9 ? [1e9, 'Mrd. Aktien'] : [1e6, 'Mio. Aktien']; return { unit: s[1], f: function (v) { return d2(v / s[0], 2); } }; }
    if (def.kind === 'ratio' || def.kind === 'growth') return { unit: '%', f: function (v) { return (v < 0 ? '−' : def.kind === 'growth' && v > 0 ? '+' : '') + d2(Math.abs(v) * 100, Math.abs(v) >= 1 ? 0 : 1); } };
    if (def.kind === 'perShare') return { unit: sym + ' je Aktie', f: function (v) { return (v < 0 ? '−' : '') + d2(Math.abs(v), 2); } };
    return { unit: '×', f: function (v) { return (v < 0 ? '−' : '') + d2(Math.abs(v), Math.abs(v) >= 100 ? 0 : 1); } };
  }

  /* ------------------------------------------------------------ Balkendiagramm (HTML, scharf auf jedem Display)
   * points: [{key, label, short, v (oder vs: [a,b] bei zwei Reihen), gap, extra}], opt: {def, currency, series:[label,label], height, onPick} */
  function bars(points, opt) {
    var two = !!opt.series, H = opt.height || 168;
    var all = []; points.forEach(function (p) { (two ? p.vs : [p.v]).forEach(function (v) { if (isNum(v)) all.push(v); }); });
    if (!all.length) return notice('Keine Werte', 'Für diesen Zeitraum liegen keine Angaben vor.');
    var max = Math.max(0, Math.max.apply(null, all)), min = Math.min(0, Math.min.apply(null, all)), span = (max - min) || 1;
    var zero = max / span * 100, sc = scaleFor(opt.def, all, opt.currency);
    var showAll = points.length <= (two ? 6 : 10);
    var readout = el('p', { class: 'fu-readout', 'aria-live': 'polite' });
    var cols = [];
    function read(p) {
      cols.forEach(function (c) { c.classList.toggle('is-sel', c._p === p); c.setAttribute('aria-pressed', String(c._p === p)); });
      var parts = two ? opt.series.map(function (s, i) { return s + ' ' + val(opt.def, p.vs[i], opt.currency); }).join(' · ') : (isNum(p.v) ? val(opt.def, p.v, opt.currency) : 'keine Angabe');
      put(readout, el('b', { text: p.label }), ' ' + parts + (p.extra ? ' · ' + p.extra : ''));
      if (opt.onPick) opt.onPick(p);
    }
    var plot = el('div', { class: 'fu-bars-plot', style: 'height:' + H + 'px' }, [el('i', { class: 'fu-bars-zero', style: 'top:' + zero.toFixed(2) + '%' })]);
    points.forEach(function (p, i) {
      var last = i === points.length - 1, vs = two ? p.vs : [p.v];
      var col = el('button', { type: 'button', class: 'fu-bc' + (last && !opt.noLast ? ' is-last' : '') + (p.self ? ' is-self' : ''), 'aria-pressed': 'false', 'aria-label': p.label + ': ' + vs.map(function (v) { return isNum(v) ? val(opt.def, v, opt.currency) : 'keine Angabe'; }).join(', '), onclick: function () { read(p); } });
      col._p = p;
      vs.forEach(function (v, k) {
        if (!isNum(v)) { col.append(el('i', { class: 'fu-b fu-b-gap' + (two ? ' s' + k : ''), style: 'top:calc(' + zero.toFixed(2) + '% - 6px);height:6px' })); return; }
        var h = Math.abs(v) / span * 100, pos = v >= 0;
        var b = el('i', { class: 'fu-b' + (two ? ' s' + k : '') + (pos ? '' : ' is-neg'), style: (pos ? 'bottom:' + (100 - zero).toFixed(2) + '%' : 'top:' + zero.toFixed(2) + '%') + ';height:' + Math.max(0.8, h).toFixed(2) + '%' });
        if (!two && (showAll || last || p.self)) b.append(el('span', { class: 'fu-b-v' + (pos ? '' : ' is-neg'), text: sc.f(v) }));
        col.append(b);
      });
      cols.push(col); plot.append(col);
    });
    var xs = el('div', { class: 'fu-bars-x', 'aria-hidden': 'true' }, points.map(function (p, i) {
      var every = points.length > 10 ? Math.ceil(points.length / 6) : 1;
      return el('span', { text: i % every === 0 || i === points.length - 1 ? p.short : '' });
    }));
    var legend = two ? el('ul', { class: 'fu-legend' }, opt.series.map(function (s, k) { return el('li', {}, [el('i', { class: 'sw s' + k }), s]); })) : null;
    var lastP = points.filter(function (p) { return p.self; })[0] || points.filter(function (p) { return two ? p.vs.some(isNum) : isNum(p.v); }).slice(-1)[0];
    setTimeout(function () { if (lastP) read(lastP); }, 0);
    return el('div', { class: 'fu-bars' + (two ? ' is-two' : '') }, [legend, el('p', { class: 'fu-bars-unit', text: sc.unit }), plot, xs, readout]);
  }
  /* Mini-Balken fuer Listen (letzte acht Werte). */
  function spark(rows) {
    var v = rows.filter(function (r) { return isNum(r.v); }).slice(-8);
    if (v.length < 2) return el('span', { class: 'fu-spark is-empty', 'aria-hidden': 'true' });
    var max = Math.max.apply(null, v.map(function (r) { return Math.abs(r.v); })) || 1;
    return el('span', { class: 'fu-spark', 'aria-hidden': 'true' }, v.map(function (r, i) { return el('i', { class: (r.v < 0 ? 'is-neg' : '') + (i === v.length - 1 ? ' is-last' : ''), style: 'height:' + Math.max(8, Math.abs(r.v) / max * 100).toFixed(0) + '%' }); }));
  }

  /* ------------------------------------------------------------ Suche */
  function loadSearch() {
    if (!state.searchPromise) state.searchPromise = fetchJson(M.SEARCH_PATH).then(function (d) { state.search = d.entries || []; return state.search; })
      .catch(function (e) { state.searchPromise = null; throw e; });
    return state.searchPromise;
  }
  function searchBox(opt) {
    opt = opt || {};
    var input = el('input', { id: 'fu-q', class: 'fu-input', type: 'search', placeholder: opt.placeholder || 'Aktie, Kürzel oder Unternehmen …', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
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
        put(list, hits.map(function (h, i) {
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
    return el('form', { class: 'fu-search', role: 'search', onsubmit: function (e) { e.preventDefault(); } }, [glyph('search', 'fu-search-ico'), input, list, live]);
  }
  function exampleChips(asList) {
    if (asList) return el('ul', { class: 'fu-exlist', 'aria-label': 'Beispiele' }, EXAMPLES.map(function (e) {
      return el('li', {}, el('a', { href: '#/' + e[0] }, [el('b', { text: e[0] }), el('span', { text: e[1] }), glyph('chevron', 'fu-glyph-sm')]));
    }));
    return el('div', { class: 'fu-chips fu-examples', role: 'list', 'aria-label': 'Beispiele' }, EXAMPLES.map(function (e) {
      return el('a', { class: 'fu-chip', role: 'listitem', href: '#/' + e[0] }, [el('b', { text: e[0] }), e[1]]);
    }));
  }

  /* ------------------------------------------------------------ Start */
  function hero() {
    return el('section', { class: 'fu-hero vu-product-hero vu-hero-fidelity', 'data-product': 'fundamental', 'aria-labelledby': 'fu-hero-h' }, [
      el('div', { class: 'vu-hero-scene', 'aria-hidden': 'true' }),
      el('span', { class: 'vu-product-icon vu-product-icon--hero', 'aria-hidden': 'true' }, productIcon('fundamental', 'fu-hero-svg')),
      el('p', { class: 'vu-hero-name', text: 'Fundamental' }),
      el('h1', { class: 'vu-hero-headline', id: 'fu-hero-h', text: 'Unternehmen verstehen – in Zahlen.' }),
      el('p', { class: 'vu-hero-description', text: 'Umsatz, Gewinn, Cashflow, Bilanz und Bewertung von US-Unternehmen. Direkt aus den Pflichtmeldungen an die SEC.' }),
      searchBox(),
      exampleChips()
    ]);
  }
  function homeStats(U) {
    var withRev = U ? U.col('revenue').filter(isNum).length : null;
    return el('ul', { class: 'fu-stats', 'aria-label': 'Datenumfang' }, [
      el('li', {}, [el('b', { class: 'fu-num', text: withRev ? nf(withRev) : '–' }), el('span', { text: 'Unternehmen mit SEC-Zahlen' })]),
      el('li', {}, [el('b', { class: 'fu-num', text: String(C.METRICS.length) }), el('span', { text: 'Kennzahlen je Aktie' })]),
      el('li', {}, [el('b', { class: 'fu-num', text: U && U.fundamentalsAsOf ? M.dateDe(U.fundamentalsAsOf).slice(0, 6) : '–' }), el('span', { text: 'Stand der Geschäftszahlen' })])
    ]);
  }
  var RANK_ICON = { bewertung: 'valuation', profitabel: 'margin', wachstum: 'growth', cashflow: 'cash', margen: 'income', bilanz: 'balance' };
  function rankValue(def, v) { return C.fmt({ kind: def.kind === 'money' ? 'money' : def.kind }, v, 'USD'); }
  function rankingCard(U, def) {
    var r = C.ranking(U, def.id, '10', 3);
    return el('li', {}, el('a', { class: 'fu-entry', href: '#/rangliste/' + def.id }, [
      el('span', { class: 'fu-entry-head' }, [el('span', { class: 'fu-entry-ico' }, glyph(RANK_ICON[def.id])), el('span', {}, [el('b', { text: def.title }), el('small', { text: def.sub })]), glyph('chevron', 'fu-glyph-sm')]),
      el('ol', { class: 'fu-entry-list' }, r && r.rows.length ? r.rows.map(function (x) {
        return el('li', {}, [el('b', { text: x.s }), el('span', { text: x.n }), el('em', { class: 'fu-num', text: rankValue(def, x[def.col]) })]);
      }) : [el('li', { class: 'is-none' }, 'gerade keine Werte')])
    ]));
  }
  function industryRows(U, list) {
    var maxM = Math.max.apply(null, list.map(function (i) { return Math.abs(i.netMargin || 0); }).concat([0.01]));
    return el('ul', { class: 'fu-ind' }, list.map(function (i) {
      return el('li', {}, el('a', { href: '#/branche/' + i.id }, [
        el('span', { class: 'fu-ind-name' }, [el('b', { text: i.label }), el('small', { text: i.count + ' Unternehmen · ' + i.top.join(', ') })]),
        el('span', { class: 'fu-ind-m' }, [el('span', { class: 'fu-minibar', 'aria-hidden': 'true' }, el('i', { class: i.netMargin < 0 ? 'is-neg' : '', style: 'width:' + Math.max(3, Math.abs(i.netMargin || 0) / maxM * 100).toFixed(0) + '%' })),
          el('em', { class: 'fu-num', text: isNum(i.netMargin) ? C.fmt({ kind: 'ratio' }, i.netMargin) : '–' })]),
        glyph('chevron', 'fu-glyph-sm')
      ]));
    }));
  }
  function homeDm(U) {
    return el('details', { class: 'vu-dm' }, [el('summary', {}, ['Daten & Methodik', U && U.fundamentalsAsOf ? el('small', { text: 'Stand ' + M.dateDe(U.fundamentalsAsOf) }) : null]), el('dl', {}, [
      el('dt', { text: 'Quelle' }), el('dd', { text: 'Pflichtmeldungen an die SEC (EDGAR Companyfacts), aufbereitet wie in Discover, Quant und Screener.' }),
      el('dt', { text: 'Kurse' }), el('dd', { text: 'Tagesschlusskurse (Tiingo) für Börsenwert und Bewertungskennzahlen.' }),
      el('dt', { text: 'Ranglisten' }), el('dd', { text: 'Sortierung einer Kennzahl mit sichtbarer Regel, keine Empfehlung.' }),
      el('dt', { text: 'Methodik' }), el('dd', {}, el('a', { href: '#/methodik', text: 'Methodik lesen' }))
    ])]);
  }
  function home(focus) {
    setTitle(focus === 'entdecken' ? 'Entdecken' : focus === 'suche' ? 'Suche' : null);
    main.setAttribute('data-view', focus || 'home');
    if (focus === 'suche') {
      put(main, 
        el('section', { class: 'fu-subhero' }, [el('p', { class: 'vu-eyebrow', text: 'Fundamental' }), el('h1', { class: 'fu-h1', text: 'Suche' }),
          el('p', { class: 'fu-sub', text: 'Name oder Kürzel eines US-Unternehmens eingeben.' }), searchBox(), el('p', { class: 'vu-eyebrow fu-ex-label', text: 'Beispiele' }), exampleChips(true)]),
        homeDm(null));
      return done();
    }
    var entries = el('ul', { class: 'fu-entries' }, C.RANKINGS.map(function () { return el('li', {}, skel(150)); }));
    var inds = el('div', {}, skel(260));
    var stats = el('div', {}, homeStats(null));
    var all = focus === 'entdecken';
    put(main, [
      all ? el('section', { class: 'fu-subhero' }, [el('p', { class: 'vu-eyebrow', text: 'Fundamental' }), el('h1', { class: 'fu-h1', text: 'Entdecken' }),
        el('p', { class: 'fu-sub', text: 'Ranglisten, Branchen und Discover-Auswahlen – jede Zahl führt zum Unternehmen.' })]) : hero(),
      all ? null : stats,
      sec('Einstiege', { sub: 'Ranglisten nach einer Kennzahl · Börsenwert ab 10 Mrd. $', link: all ? null : ['#/entdecken', 'Alle'] }, [entries]),
      sec('Branchen im Vergleich', { sub: 'Median der Nettomarge je Branche (SEC-Branchencode)' }, [inds]),
      all ? discoverSection({ title: true }) : el('a', { class: 'fu-teaser', href: '#/entdecken' }, [el('span', { class: 'fu-entry-ico' }, productIcon('discover')),
        el('span', {}, [el('b', { text: 'Auswahlen aus Discover' }), el('small', { text: 'Profitables Wachstum, Compounder, Cashflow-Maschinen …' })]), glyph('chevron', 'fu-glyph-sm')]),
      homeDm(null)
    ].filter(Boolean));
    done();
    loadUniverse().then(function (U) {
      if (main.getAttribute('data-view') !== (focus || 'home')) return;
      put(stats, homeStats(U));
      put(entries, C.RANKINGS.map(function (d) { return rankingCard(U, d); }));
      var list = C.industries(U, 5);
      put(inds, industryRows(U, all ? list : list.slice(0, 8)), all || list.length <= 8 ? null : el('a', { class: 'fu-chip fu-more', href: '#/entdecken' }, 'Alle ' + list.length + ' Branchen'));
    }).catch(function () {
      put(entries, el('li', {}, notice('Ranglisten gerade nicht verfügbar.', 'Die Vergleichsdaten aller US-Aktien konnten nicht geladen werden.')));
      put(inds);
    });
  }

  /* Discover-Auswahlen (bestehende Zeilen, Kachelwerte wie auf der Unternehmensseite). */
  var HOME_LABELS = { 'profitables-wachstum': 'Profitables Wachstum', 'langfristige-compounder': 'Langfristige Compounder', 'cashflow-maschinen': 'Cashflow-Maschinen',
    'qualitaet-zum-preis': 'Qualität zum Preis', 'starke-bilanz-wachstum': 'Starke Bilanz + Wachstum', 'margen-werden-staerker': 'Margen werden stärker' };
  var TILE_CAP = 0.5;
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
      el('span', { class: 'fu-tile-rev' }, [el('strong', { class: 'fu-num', text: M.money(t.revenue) }), el('small', { text: 'Umsatz · letztes GJ' })]),
      meter('Wachstum p. a. · 3 J', t.growth3), meter('Nettomarge', t.netMargin, t.implausible.netMargin), meter('Free-Cashflow-Marge', t.fcfMargin, t.implausible.fcfMargin),
      el('span', { class: 'fu-tile-pe' }, [el('span', { text: 'KGV' }), el('b', { class: 'fu-num' + (t.pe == null ? ' is-none' : ''), text: t.pe == null ? 'keine Angabe' : M.multiple(t.pe) })])
    ]));
  }
  function discoverSection() {
    var holder = el('div', { class: 'fu-disc-body', 'aria-live': 'polite' }), sub = el('p', { class: 'fu-sub' }), tok = 0;
    var buttons = M.HOME_ROWS.map(function (id, i) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': i ? 'false' : 'true', 'data-row': id, onclick: function () { pick(i); } }, HOME_LABELS[id] || id);
    });
    function pick(i) {
      var my = ++tok, id = M.HOME_ROWS[i];
      buttons.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === i)); });
      put(holder, skel(220));
      loadRow(M.ROWS_BASE + id + '.json').then(function (row) {
        if (my !== tok) return;
        var r = M.homeRow(row);
        sub.textContent = r.subtitle || '';
        if (!r.tiles.length) { put(holder, notice('Gerade erfüllt kein Unternehmen diese Regel.')); return; }
        put(holder, el('ul', { class: 'fu-tiles' }, r.tiles.map(homeTile)),
          more('Regel dieser Auswahl', [r.rule ? el('p', { text: r.rule }) : null,
            el('p', { text: 'Discover-Auswahl · ' + (r.matched ? r.matched.toLocaleString('de-DE') + ' Unternehmen erfüllen die Regel · ' : '') + 'Stand ' + M.dateDe(r.asOf) + ' · Balken 0–50 %' })]));
      }).catch(function () { if (my === tok) put(holder, notice('Die Auswahl konnte gerade nicht geladen werden.')); });
    }
    setTimeout(function () { pick(0); }, 0);
    return el('section', { class: 'fu-section fu-disc', id: 'entdecken' }, [
      el('div', { class: 'fu-sec-head' }, [el('h2', { class: 'fu-h2', text: 'Auswahlen aus Discover' })]),
      el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Auswahl' }, buttons), sub, holder]);
  }

  /* ------------------------------------------------------------ Rangliste */
  function rankingView(id, size) {
    var def = C.RANKINGS.filter(function (r) { return r.id === id; })[0];
    if (!def) return home('entdecken');
    setTitle(def.title); main.setAttribute('data-view', 'ranking');
    var body = el('div', {}, skel(400)), chosen = size || '10';
    var sizes = el('div', { class: 'fu-seg', role: 'group', 'aria-label': 'Börsenwert' }, C.SIZES.map(function (s) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(s.id === chosen), onclick: function () { chosen = s.id; [].forEach.call(sizes.children, function (b, k) { b.setAttribute('aria-pressed', String(C.SIZES[k].id === chosen)); }); paint(); } }, s.label);
    }));
    var others = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Weitere Ranglisten' }, C.RANKINGS.map(function (r) { return el('a', { class: 'fu-seg-b', href: '#/rangliste/' + r.id, 'aria-current': r.id === id ? 'page' : null }, r.title); }));
    put(main, 
      el('section', { class: 'fu-subhero' }, [backLink('#/entdecken', 'Entdecken'), el('h1', { class: 'fu-h1', text: def.title }), el('p', { class: 'fu-sub', text: def.sub })]),
      others, sizes, body,
      more('Regel dieser Rangliste', [el('p', { text: def.sub + '. ' + def.rule + '. Nur Aktien mit geprüftem Börsenwert; Werte wie im Screener (letzte zwölf Monate bzw. letztes Geschäftsjahr).' }), el('p', { text: 'Eine Rangliste sortiert eine Kennzahl. Sie ist keine Bewertung und keine Empfehlung.' })]));
    done();
    function paint() {
      loadUniverse().then(function (U) {
        var r = C.ranking(U, id, chosen, 50);
        if (!r.rows.length) { put(body, notice('Keine Unternehmen erfüllen die Regel.')); return; }
        var max = Math.max.apply(null, r.rows.map(function (x) { return Math.abs(x[def.col]); })) || 1;
        var alsoDefs = def.also.map(function (k) { return uDef(k); });
        put(body, el('p', { class: 'fu-count', text: r.total.toLocaleString('de-DE') + ' Unternehmen erfüllen die Regel · Top ' + r.rows.length }),
          el('ol', { class: 'fu-rank' }, r.rows.map(function (x, i) {
            return el('li', {}, el('a', { href: '#/' + encodeURIComponent(x.s) }, [
              el('span', { class: 'fu-rank-n fu-num', text: String(i + 1) }),
              el('span', { class: 'fu-rank-name' }, [el('b', { text: x.s }), el('span', { text: x.n }), el('small', { text: [U.industryLabel(x.sic2), alsoDefs.map(function (d, k) { return d.label + ' ' + C.fmt(d, x[def.also[k]], 'USD'); }).join(' · ')].filter(Boolean).join(' · ') })]),
              el('span', { class: 'fu-rank-v' }, [el('em', { class: 'fu-num', text: rankValue(def, x[def.col]) }), el('span', { class: 'fu-minibar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.abs(x[def.col]) / max * 100).toFixed(0) + '%' }))])
            ]));
          })));
      }).catch(function () { put(body, notice('Die Vergleichsdaten konnten gerade nicht geladen werden.')); });
    }
    paint();
  }
  /* Spalten des Universums als Katalogdefinition (Label und Darstellung). */
  var U_DEF = { revCagr3: { label: 'Umsatz p. a. 3 J', kind: 'growth' }, revGrowth: { label: 'Umsatz LTM', kind: 'growth' }, mcap: { label: 'Börsenwert', kind: 'money' }, netCash: { label: 'Nettokasse', kind: 'money' } };
  function uDef(col) {
    if (U_DEF[col]) return U_DEF[col];
    var d = C.METRICS.filter(function (m) { return m.u === col; })[0];
    return d ? { label: d.label.replace(/ \(.*\)$/, ''), kind: d.kind } : { label: col, kind: 'multiple' };
  }

  /* ------------------------------------------------------------ Branche */
  var IND_METRICS = [['mcap', 'Börsenwert'], ['revenue', 'Umsatz'], ['revCagr3', 'Wachstum 3 J'], ['netMargin', 'Nettomarge'], ['roic', 'ROIC'], ['pe', 'KGV']];
  function industryView(id) {
    setTitle('Branche'); main.setAttribute('data-view', 'industry');
    var body = el('div', {}, skel(400)), head = el('section', { class: 'fu-subhero' }, [backLink('#/entdecken', 'Entdecken'), skel(36, '60%')]);
    put(main, head, body); done();
    loadUniverse().then(function (U) {
      var label = U.industryLabel(id); setTitle(label);
      var members = U.rows(function (c, i) { return c.sic2[i] === id && (isNum(c.mcap[i]) || isNum(c.revenue[i])); });
      if (!members.length) { put(body, notice('Für diese Branche liegen keine Unternehmen vor.')); return; }
      put(head, backLink('#/entdecken', 'Entdecken'), el('p', { class: 'vu-eyebrow', text: 'Branche · SIC ' + id }), el('h1', { class: 'fu-h1', text: label }),
        el('p', { class: 'fu-sub', text: members.length + ' US-Unternehmen mit SEC-Zahlen' }));
      var col = 'mcap';
      var stat = el('ul', { class: 'fu-kgrid' }), list = el('div');
      var seg = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Kennzahl' }, IND_METRICS.map(function (m) {
        return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(m[0] === col), onclick: function () { col = m[0]; [].forEach.call(seg.children, function (b, k) { b.setAttribute('aria-pressed', String(IND_METRICS[k][0] === col)); }); paint(); } }, m[1]);
      }));
      put(stat, IND_METRICS.slice(2).map(function (m) {
        var d = uDef(m[0]), med = C.median(members.map(function (r) { return r[m[0]]; }).filter(function (v) { return m[0] !== 'netMargin' || Math.abs(v) <= 1; }));
        return el('li', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Median ' + m[1] }), el('b', { class: 'fu-k-v fu-num', text: C.fmt(d, med, 'USD') })]);
      }));
      function paint() {
        var d = uDef(col), rows = members.filter(function (r) { return isNum(r[col]); }).sort(function (a, b) { return col === 'pe' ? a[col] - b[col] : b[col] - a[col]; }).slice(0, 40);
        var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r[col]); })) || 1;
        put(list, el('ol', { class: 'fu-rank' }, rows.map(function (x, i) {
          return el('li', {}, el('a', { href: '#/' + encodeURIComponent(x.s) }, [
            el('span', { class: 'fu-rank-n fu-num', text: String(i + 1) }),
            el('span', { class: 'fu-rank-name' }, [el('b', { text: x.s }), el('span', { text: x.n })]),
            el('span', { class: 'fu-rank-v' }, [el('em', { class: 'fu-num', text: C.fmt(d, x[col], 'USD') }), el('span', { class: 'fu-minibar', 'aria-hidden': 'true' }, el('i', { class: x[col] < 0 ? 'is-neg' : '', style: 'width:' + Math.max(4, Math.abs(x[col]) / max * 100).toFixed(0) + '%' }))])
          ]));
        })), el('p', { class: 'fu-note', text: (col === 'pe' ? 'Aufsteigend sortiert (niedrigstes KGV zuerst), nur Unternehmen mit Gewinn. ' : 'Absteigend sortiert. ') + 'Bis 40 Unternehmen mit Wert.' }));
      }
      put(body, stat, seg, list); paint();
    }).catch(function () { put(body, notice('Die Vergleichsdaten konnten gerade nicht geladen werden.')); });
  }

  /* ------------------------------------------------------------ Unternehmen: Rahmen */
  var VIEWS = [['', 'Überblick'], ['kennzahlen', 'Kennzahlen'], ['vergleich', 'Branche'], ['finanzen', 'Finanzen'], ['mehr', 'Mehr']];
  var AREAS = { dividende: 'Dividende', analysten: 'Analysten', bewertung: 'Bewertung', aktie: 'Aktie & Kapital', unternehmen: 'Unternehmensdaten', quellen: 'Quellen & Downloads' };
  function href(t, sub, extra) { return '#/' + encodeURIComponent(t) + (sub ? '?ansicht=' + sub + (extra || '') : ''); }
  function backLink(h, label) { return el('a', { class: 'fu-back', href: h }, [glyph('back', 'fu-glyph-sm'), label]); }
  function tabs(t, active) {
    var tabOf = AREAS[active] ? 'mehr' : active === 'kennzahl' ? 'kennzahlen' : active;
    return el('nav', { class: 'fu-tabs', 'aria-label': 'Fundamental-Ansichten' }, VIEWS.map(function (v) {
      return el('a', { href: href(t, v[0]), 'aria-current': v[0] === (tabOf || '') ? 'page' : null }, v[1]);
    }));
  }
  function stockHead(t, co) {
    var host = el('div', { class: 'fu-shead' });
    var SN = global.VUStockNavigator, SCX = global.VUCore && global.VUCore.StockContext, ctx = null;
    try { ctx = SN && SCX ? SCX.fromUs(t, { name: co && co.name }) : null; } catch (e) { ctx = null; }
    if (ctx) { SN.head(host, { ctx: ctx, current: 'fundamental', name: (co && co.name) || t, exchange: co && co.exchange, price: co && co.quote, back: { href: '#/', label: 'Fundamental' } }); return host; }
    host.append(el('header', { class: 'fu-head' }, [backLink('#/', 'Fundamental'), el('h1', { class: 'fu-h1', text: (co && co.name) || t })]));
    return host;
  }
  function compactHead(t, co, title, sub, back) {
    return el('header', { class: 'fu-chead' }, [backLink(back ? back[0] : href(t), back ? back[1] : co.name),
      el('p', { class: 'vu-eyebrow', text: t + ' · ' + co.name }), el('h1', { class: 'fu-h1', text: title }), sub ? el('p', { class: 'fu-sub', text: sub }) : null]);
  }
  function company(r) {
    var t = r.ticker, sub = r.sub || '';
    setTitle(t); main.setAttribute('aria-busy', 'true'); main.setAttribute('data-view', 'company');
    var same = main.getAttribute('data-ticker') === t && state.cache[t];
    if (!same) put(main, el('div', { class: 'fu-boot' }, [skel(40, '50%'), skel(120)]));
    main.setAttribute('data-ticker', t);
    loadCompany(t).then(function (co) {
      if (M.parseRoute(location.hash).ticker !== t) return;
      setTitle(co.name + ' (' + t + ')' + (sub ? ' · ' + (AREAS[sub] || (VIEWS.filter(function (v) { return v[0] === sub; })[0] || [0, ''])[1] || '') : ''));
      if (!co.f.available || !co.book) {
        put(main, stockHead(t, co), el('p', { class: 'vu-empty' }, [el('b', { text: 'Für diese Aktie liegen keine SEC-Geschäftszahlen vor.' }),
          'Typisch für Fonds, ausländische Emittenten ohne US-Jahresbericht oder sehr junge Notierungen.']));
        return done();
      }
      var ctx = { snap: C.snapshot(co.raw, null) };
      var views = { '': overview, kennzahlen: catalogView, kennzahl: metricView, vergleich: compareView, finanzen: financeView, mehr: moreView };
      var fn = views[sub] || (AREAS[sub] ? areaView : overview);
      var content = fn(co, r, ctx);
      var head = sub === '' || !views[sub] && !AREAS[sub] ? stockHead(t, co) : null;
      var nodes = head ? [head, tabs(t, '')].concat(content) : [content[0], tabs(t, sub)].concat(content.slice(1));
      put(main, nodes.filter(Boolean));
      var on = main.querySelector('.fu-tabs [aria-current=page]'); if (on && on.parentNode.scrollWidth > on.parentNode.clientWidth) on.parentNode.scrollLeft = Math.max(0, on.offsetLeft - (on.parentNode.clientWidth - on.offsetWidth) / 2);
      done();
      // Bewertung und Vergleich brauchen das Universum; nachladen und Platzhalter fuellen.
      loadUniverse().then(function (U) { co.U = U; ctx.snap = C.snapshot(co.raw, U.get(t)); main.dispatchEvent(new CustomEvent('fu-universe', { detail: U })); }).catch(function () { main.dispatchEvent(new CustomEvent('fu-universe', { detail: null })); });
    }).catch(function (e) {
      var notFound = e && e.status === 404;
      put(main, el('header', { class: 'fu-chead' }, [backLink('#/', 'Fundamental'), el('h1', { class: 'fu-h1', text: t })]),
        el('p', { class: 'vu-empty' }, [el('b', { text: notFound ? 'Diese Aktie ist nicht im US-Universum.' : 'Die Daten konnten gerade nicht geladen werden.' }),
          notFound ? 'Fundamental zeigt US-Unternehmen mit SEC-Meldungen.' : 'Bitte später erneut versuchen.']),
        notFound ? el('div', { class: 'fu-retry' }, [searchBox(), exampleChips()]) : null);
      done();
    });
  }
  /* Wartet auf das Universum (fuer Bewertung/Branche) und zeichnet dann. */
  function withUniverse(co, draw) {
    var box = el('div', { class: 'fu-wait' }, skel(120));
    function go(U) { put(box, [].concat(draw(U) || []).filter(Boolean)); }
    if (co.U) go(co.U);
    else main.addEventListener('fu-universe', function h(e) { main.removeEventListener('fu-universe', h); go(e.detail); });
    return box;
  }

  /* ------------------------------------------------------------ 1 Ueberblick */
  function kpiTile(co, id, ctx) {
    var def = C.BY_ID[id], c = C.current(co.book, def, ctx), none = !isNum(c.v);
    return el('a', { class: 'fu-k', href: href(co.t, 'kennzahl', '&k=' + id) }, [
      el('span', { class: 'fu-k-l', text: def.label.replace(/ \(.*\)$/, '') + (none ? '' : ' (' + basisText(c) + ')') }),
      el('b', { class: 'fu-k-v fu-num' + (none ? ' is-none' : ''), text: none ? 'keine Angabe' : val(def, c.v, cur(co)) }),
      c.change ? el('small', { class: 'fu-chg' + dirClass(c.change), text: C.changeText(def, c.change, cur(co)) + ' ggü. Vorjahr' }) : el('small', { class: 'fu-k-s', text: none ? C.reason(c.reason) : def.cat === 'bewertung' ? 'zum Schlusskurs' : '' })
    ]);
  }
  function priceChart(co) {
    var host = el('div', { class: 'fu-price' });
    var VC = global.VUChart, raw = co.raw, p1 = C.seriesPath(raw.securityId), pl = C.longSeriesPath(raw.series && raw.series.long && raw.series.long.path);
    if (!VC || !p1) return null;
    var daily = function () { return once('s:' + p1, function () { return fetchJson(p1); }).then(function (d) { return d && d.status === 'CALCULATED' && Array.isArray(d.points) ? d.points : []; }); };
    var weekly = function () { return pl ? once('s:' + pl, function () { return fetchJson(pl); }).then(function (d) { return d && Array.isArray(d.points) ? d.points : []; }) : Promise.resolve([]); };
    var cut = function (load, months) { return function () { return load().then(function (pts) { if (!pts.length) return pts; var d = new Date(pts[pts.length - 1][0]); d.setMonth(d.getMonth() - months); var iso = d.toISOString().slice(0, 10); return pts.filter(function (p) { return p[0] >= iso; }); }); }; };
    setTimeout(function () {
      VC.mount(host, { currency: 'USD', label: co.name + ' Kurs', initial: '1J', ranges: [
        { id: '1M', label: '1M', load: cut(daily, 1) }, { id: '3M', label: '3M', load: cut(daily, 3) }, { id: '6M', label: '6M', load: cut(daily, 6) },
        { id: '1J', label: '1J', load: cut(daily, 12) }, { id: '5J', label: '5J', load: cut(weekly, 60) }, { id: 'MAX', label: 'Max', load: weekly, log: true }] });
    }, 0);
    return host;
  }
  function overview(co, r, ctx) {
    var b = co.book, f = co.f, t = co.t;
    var stale = f.stale && f.stale.stale;
    var health = co.raw.fundamentals && co.raw.fundamentals.health, story = co.raw.fundamentals && co.raw.fundamentals.story;
    var rows = C.seriesOf(b, C.BY_ID.revenue, 'annual').slice(-8), ni = C.seriesOf(b, C.BY_ID.net_income, 'annual');
    var niBy = {}; ni.forEach(function (x) { niBy[x.key] = x.v; });
    var kpis = el('div', { class: 'fu-kgrid' }, ['market_cap', 'revenue', 'pe', 'ps', 'net_margin', 'free_cash_flow', 'roe', 'roic'].map(function (id) { return kpiTile(co, id, ctx); }));
    var out = [
      stale ? el('p', { class: 'vu-alert', role: 'note', text: 'Die Geschäftszahlen sind veraltet: letztes gemeldetes Geschäftsjahr ' + f.latestFiscalYear + '.' }) : null,
      priceChart(co),
      sec('Fundamental auf einen Blick', { link: [href(t, 'kennzahlen'), 'Alle Kennzahlen'] }, [kpis]),
    ];
    // Bewertungskacheln brauchen das Universum (Boersenwert-Fallback, KBV …): nach dem Laden neu zeichnen.
    main.addEventListener('fu-universe', function h(e) { main.removeEventListener('fu-universe', h); if (e.detail) put(kpis, ['market_cap', 'revenue', 'pe', 'ps', 'net_margin', 'free_cash_flow', 'roe', 'roic'].map(function (id) { return kpiTile(co, id, ctx); })); });
    if (health && health.available && health.categories && health.categories.length) {
      out.push(el('a', { class: 'fu-profile', href: href(t, 'kennzahlen') }, [
        el('span', { class: 'fu-profile-ico' }, productIcon('fundamental')),
        el('span', { class: 'fu-profile-body' }, [el('small', { text: 'Fundamental-Profil · ' + health.horizon.from + '–' + health.horizon.to }),
          el('ul', {}, health.categories.map(function (c) { return el('li', {}, [el('b', { text: c.label.replace('Profitabilitaet', 'Profitabilität') }), el('span', { class: 'fu-grade', 'data-grade': gradeTone(c.grade), text: c.grade }), el('small', { text: c.detail.replace('Geschaeftsjahr', 'Geschäftsjahr').replace('Geschaeftsjahresende', 'Geschäftsjahresende') })]); }))]),
        glyph('chevron', 'fu-glyph-sm')]));
    }
    if (rows.length > 1) out.push(sec('Umsatz & Gewinn', { sub: 'Je Geschäftsjahr · ' + fyNote(b), link: [href(t, 'finanzen'), 'Finanzen'] }, [
      el('div', { class: 'fu-card' }, bars(rows.map(function (x) { return { key: x.key, label: x.label, short: x.short, vs: [x.v, isNum(niBy[x.key]) ? niBy[x.key] : null] }; }), { def: C.BY_ID.revenue, currency: cur(co), series: ['Umsatz', 'Nettogewinn'] }))]));
    if (story && story.available && story.statements && story.statements.length) out.push(sec('Das Wichtigste', {}, [el('ul', { class: 'fu-insights' }, story.statements.slice(0, 4).map(function (s) {
      return el('li', {}, [glyph('info', 'fu-glyph-sm'), el('span', { text: s.text })]);
    }))]));
    out.push(sec('In der Branche', { link: [href(t, 'vergleich'), 'Branchenvergleich'] }, [withUniverse(co, function (U) { return branchSummary(co, U); })]));
    out.push(el('div', { class: 'fu-related' }, [el('p', { class: 'vu-eyebrow', text: 'Weiter' }), el('div', { class: 'fu-chips' }, [
      el('a', { class: 'fu-chip', href: href(t, 'finanzen') }, 'Finanzen'), el('a', { class: 'fu-chip', href: href(t, 'mehr') }, 'Dividende, Analysten & mehr'),
      el('a', { class: 'fu-chip', href: '/quant/#/aktie/' + encodeURIComponent(t) + '/zahlen' }, 'Zahlen in Quant')])]));
    out.push(dataMethod(co));
    return out;
  }
  function gradeTone(g) { return /sehr stark|sehr solide/i.test(g) ? 'top' : /stark|solide/i.test(g) ? 'good' : /schwach|angespannt|negativ/i.test(g) ? 'low' : 'mid'; }
  function fyNote(b) { var e = C.fiscalYearEnd(b); return e ? (e.calendar ? 'Geschäftsjahr = Kalenderjahr' : 'Geschäftsjahr endet im ' + e.month) : 'Geschäftsjahre laut SEC'; }
  function branchSummary(co, U) {
    if (!U) return notice('Vergleichsdaten gerade nicht verfügbar.');
    var g = C.peerGroup(U, co.t, 'industry', 6);
    if (!g) return notice('Keine Branche hinterlegt.', 'Für diese Aktie liegt kein SEC-Branchencode vor.');
    var items = [['revenue', 'Umsatz'], ['net_margin', 'Nettomarge'], ['revenue_growth', 'Umsatzwachstum'], ['roic', 'ROIC']].map(function (x) {
      var def = C.BY_ID[x[0]], p = C.position(g.members, def.u, g.self[def.u]);
      if (!p || !isNum(g.self[def.u])) return null;
      return el('li', {}, [el('span', { text: x[1] }), el('b', { class: 'fu-num', text: 'Platz ' + p.rank + ' von ' + p.count }), el('small', { class: 'fu-num', text: val(def, g.self[def.u], 'USD') + ' · Median ' + val(def, p.median, 'USD') })]);
    }).filter(Boolean);
    return el('a', { class: 'fu-branch', href: href(co.t, 'vergleich') }, [el('small', { text: g.label + ' · ' + g.members.length + ' Unternehmen' }), el('ul', {}, items), el('span', { class: 'fu-branch-peers', text: 'Vergleich mit ' + g.peers.filter(function (p) { return p.s !== co.t; }).map(function (p) { return p.s; }).join(', ') })]);
  }

  /* ------------------------------------------------------------ 2 Kennzahlen */
  function catalogView(co, r, ctx) {
    var t = co.t, all = C.catalogFor(co.book, ctx), cat = r.tab && C.CATS.some(function (c) { return c.id === r.tab; }) ? r.tab : '';
    var list = el('div', { class: 'fu-cat' }), q = '';
    var input = el('input', { class: 'fu-input fu-input-sm', type: 'search', placeholder: 'Kennzahl suchen – z. B. „ROIC“ oder „Marge“', 'aria-label': 'Kennzahl suchen', autocomplete: 'off',
      oninput: function () { q = input.value.trim().toLowerCase(); paint(); } });
    var chips = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Kategorie' }, [['', 'Alle']].concat(C.CATS.map(function (c) { return [c.id, c.label]; })).map(function (c) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(c[0] === cat), onclick: function () { cat = c[0]; [].forEach.call(chips.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === cat)); }); paint(); }, 'data-cat': c[0] }, c[1]);
    }));
    function row(x) {
      var def = x.def, c = x.cur, none = !isNum(c.v);
      return el('li', {}, el('a', { class: 'fu-crow', href: href(t, 'kennzahl', '&k=' + def.id) }, [
        el('span', { class: 'fu-crow-ico', 'data-cat': def.cat }, glyph((C.CATS.filter(function (k) { return k.id === def.cat; })[0] || {}).icon)),
        el('span', { class: 'fu-crow-l' }, [el('b', { text: def.label }), el('small', { text: none ? C.reason(c.reason) : basisText(c) + (x.quarterly ? ' · auch quartalsweise' : '') })]),
        spark(x.rows),
        el('span', { class: 'fu-crow-v' }, [el('b', { class: 'fu-num' + (none ? ' is-none' : ''), text: none ? '–' : val(def, c.v, cur(co)) }), c.change ? el('small', { class: 'fu-chg' + dirClass(c.change), text: C.changeText(def, c.change, cur(co)) }) : null]),
        glyph('chevron', 'fu-glyph-sm')
      ]));
    }
    function paint() {
      var match = function (x) { return (!cat || x.def.cat === cat) && (!q || (x.def.label + ' ' + x.def.desc + ' ' + x.def.id).toLowerCase().indexOf(q) >= 0); };
      var have = all.filter(function (x) { return x.available && match(x); }), missing = all.filter(function (x) { return !x.available && match(x); });
      var groups = C.CATS.filter(function (c) { return !cat || c.id === cat; }).map(function (c) {
        var items = have.filter(function (x) { return x.def.cat === c.id; });
        return items.length ? el('section', { class: 'fu-cat-g' }, [el('h3', { class: 'fu-h3', text: c.label + ' · ' + items.length }), el('ul', { class: 'fu-crows' }, items.map(row))]) : null;
      }).filter(Boolean);
      put(list, (groups.length ? groups : [notice('Keine Kennzahl gefunden.', 'Anderen Begriff versuchen.')]).concat([
        missing.length ? more('Ohne Angabe für ' + t + ' (' + missing.length + ')', [el('p', { text: missing.map(function (x) { return x.def.label; }).join(', ') + '.' }), el('p', { text: 'Diese Werte meldet das Unternehmen nicht in der nötigen Form, oder eine Eingabe fehlt. Es wird nichts geschätzt.' })]) : null]));
    }
    paint();
    main.addEventListener('fu-universe', function h() { main.removeEventListener('fu-universe', h); all = C.catalogFor(co.book, ctx); paint(); });
    var count = all.filter(function (x) { return x.available; }).length;
    return [compactHead(t, co, 'Kennzahlen', count + ' Kennzahlen aus SEC-Meldungen und Kurs – jede mit Verlauf und Erklärung.'), el('div', { class: 'fu-catbar' }, [el('div', { class: 'fu-search fu-search-sm' }, [glyph('search', 'fu-search-ico'), input]), chips]), list];
  }

  /* ------------------------------------------------------------ 3 Kennzahl-Detail */
  var RANGES = { annual: [['3', '3J'], ['5', '5J'], ['10', '10J'], ['0', 'Max']], quarterly: [['4', '4Q'], ['8', '8Q'], ['0', 'Alle']] };
  function metricView(co, r, ctx) {
    var def = C.BY_ID[r.metric] || C.BY_ID.revenue, t = co.t, b = co.book, cu = cur(co);
    var period = r.period === 'quarterly' && def.q ? 'quarterly' : 'annual', range = period === 'quarterly' ? '8' : '10';
    var hasQ = def.q && C.seriesOf(b, def, 'quarterly').filter(function (x) { return isNum(x.v); }).length > 1;
    var head = el('div', { class: 'fu-mhead' }), chartBox = el('div', { class: 'fu-card' }), table = el('div'), cagrBox = el('div');
    function paintHead() {
      var c = C.current(b, def, ctx), none = !isNum(c.v);
      put(head, el('strong', { class: 'fu-big fu-num' + (none ? ' is-none' : ''), text: none ? 'keine Angabe' : val(def, c.v, cu) }),
        el('span', { class: 'fu-mhead-s' }, [c.change ? el('b', { class: 'fu-chg' + dirClass(c.change), text: C.changeText(def, c.change, cu) }) : null,
          el('span', { text: none ? C.reason(c.reason) : (c.basis === 'TTM' ? 'letzte 12 Monate' + (c.through ? ' bis ' + c.through.replace(/^FY(\d{4})Q(\d)$/, 'Q$2 GJ $1') : '') + (c.change ? ' · ggü. Vorjahreszeitraum' : '') : c.basis === 'MARKET' ? c.label : c.label + (c.change ? ' · ggü. ' + c.prevLabel : '')) })]),
        c.split ? el('p', { class: 'vu-alert', role: 'note', text: 'Aktiensplit ohne Rückrechnung zwischen den Jahren – keine Veränderung berechnet.' }) : '');
    }
    var segP = el('div', { class: 'fu-seg', role: 'group', 'aria-label': 'Zeitraum-Art' }, [['annual', 'Jährlich'], ['quarterly', 'Quartalsweise']].map(function (p) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(p[0] === period), disabled: p[0] === 'quarterly' && !hasQ ? true : null, onclick: function () { period = p[0]; range = period === 'quarterly' ? '8' : '10'; paint(); } }, p[1]);
    }));
    var segR = el('div', { class: 'fu-seg', role: 'group', 'aria-label': 'Zeitraum' });
    function paint() {
      [].forEach.call(segP.children, function (bt, k) { bt.setAttribute('aria-pressed', String(['annual', 'quarterly'][k] === period)); });
      put(segR, RANGES[period].map(function (x) { return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(x[0] === range), onclick: function () { range = x[0]; paint(); } }, x[1]); }));
      var rows = C.seriesOf(b, def, period), n = Number(range), shown = n ? rows.slice(-n) : rows;
      if (!shown.length) { put(chartBox, notice('Keine Werte für diesen Zeitraum.', period === 'quarterly' ? 'Quartalswerte liegen nur für die letzten zwei Jahre vor.' : 'Diese Kennzahl wird nicht gemeldet.')); put(table); return; }
      var growth = def.kind === 'money' || def.kind === 'perShare' ? C.seriesOf(b, { id: 'g', kind: 'growth', of: def.base || def.id, perShareGrowth: def.perShareSeries, q: true }, period) : [];
      var gBy = {}; growth.forEach(function (g) { gBy[g.key] = g; });
      put(chartBox, bars(shown.map(function (x) { var g = gBy[x.key]; return { key: x.key, label: x.label, short: x.short, v: x.v, extra: g && isNum(g.v) ? C.fmt({ kind: 'growth' }, g.v) + ' ggü. Vorjahr' : null }; }), { def: def, currency: cu, height: 190 }));
      put(table, el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: period === 'quarterly' ? 'Quartal' : 'Jahr' }), el('th', { scope: 'col', class: 'r', text: def.label.replace(/ \(.*\)$/, '') }),
          growth.length ? el('th', { scope: 'col', class: 'r', text: 'Wachstum' }) : null, el('th', { scope: 'col', class: 'r', text: 'Quelle' })])),
        el('tbody', {}, shown.slice().reverse().map(function (x) {
          var g = gBy[x.key], url = x.accn ? M.secFilingUrl(b.cik, x.accn) : null;
          return el('tr', {}, [el('th', { scope: 'row' }, [x.label, x.end ? el('small', { text: M.dateDe(x.end) }) : null]),
            el('td', { class: 'r fu-num' + (isNum(x.v) ? '' : ' is-none'), text: isNum(x.v) ? val(def, x.v, cu) : C.reason(x.reason) }),
            growth.length ? el('td', { class: 'r fu-num fu-chg' + (g && isNum(g.v) ? (g.v >= 0 ? ' is-up' : ' is-down') : ''), text: g && isNum(g.v) ? C.fmt({ kind: 'growth' }, g.v) : '–' }) : null,
            el('td', { class: 'r' }, url ? el('a', { href: url, target: '_blank', rel: 'noopener', text: (x.derived ? 'berechnet · ' : '') + 'SEC ' + M.dateDe(x.filed).slice(-4) }) : x.derived ? 'berechnet' : '–')]);
        }))])));
    }
    var horizons = def.kind === 'money' || def.kind === 'perShare' || def.kind === 'shares' ? [3, 5, 10].map(function (n) { return C.cagr(b, def, n); }) : [];
    if (horizons.some(function (h) { return isNum(h.rate) || h.reason === 'SPLIT'; })) put(cagrBox, el('ul', { class: 'fu-cagr' }, horizons.map(function (h) {
      return el('li', {}, [el('span', { text: h.years + ' Jahre p. a.' }), el('b', { class: 'fu-num' + (isNum(h.rate) ? '' : ' is-none'), text: isNum(h.rate) ? C.fmt({ kind: 'growth' }, h.rate) : C.reason(h.reason) }), isNum(h.rate) ? el('small', { text: h.from + '–' + h.to }) : null]);
    })));
    var related = C.METRICS.filter(function (m) { return m.cat === def.cat && m.id !== def.id; });
    var out = [compactHead(t, co, def.label, def.desc, [href(t, 'kennzahlen', def.cat ? '&t=' + def.cat : ''), 'Kennzahlen']), head];
    if (def.snap) {
      out.push(sec('Im Vergleich', {}, [withUniverse(co, function (U) { paintHead(); return valuationContext(co, def, U, ctx); })]));
      out.push(notice('Kein historischer Verlauf', 'Bewertungskennzahlen werden nur zum aktuellen Kurs berechnet: Kurse sind splitbereinigt, Gewinne je Aktie wie gemeldet – ein Rückblick wäre über jeden Split falsch. Den Verlauf der Grundlage (Gewinn, Umsatz, Cashflow) zeigen die Kennzahlen dort.'));
    } else {
      out.push(el('div', { class: 'fu-ctrl' }, [segP, segR]), chartBox, cagrBox);
      if (def.u) out.push(sec('Im Branchenvergleich', { sub: def.uBasis === 'FY' ? 'Letztes Geschäftsjahr je Unternehmen' : 'Letzte zwölf Monate je Unternehmen' }, [withUniverse(co, function (U) { return peerBars(co, def, U); })]));
      out.push(sec('Werte', { sub: fyNote(b) }, [table]));
      var sp = (def.perShareSeries || def.shareSeries || def.perShareGrowth) && b.splits.length ? b.splits : [];
      if (sp.length) out.push(el('p', { class: 'vu-alert', role: 'note', text: 'Aktienanzahl springt ' + sp.map(function (s) { return 'zwischen GJ ' + s.from + ' und ' + s.to + ' (Faktor ' + M.multiple(s.factor) + ')'; }).join(', ') + ' – Split oder Kapitalmaßnahme ohne Rückrechnung. Werte je Aktie davor und danach sind nicht direkt vergleichbar; Raten über den Sprung werden nicht berechnet.' }));
      paint();
    }
    paintHead();
    out.push(more('Wie wird gerechnet?', [el('p', { text: def.desc }), def.formula ? el('p', {}, [el('b', { text: 'Formel: ' }), def.formula]) : null,
      el('p', { text: def.snap ? 'Basis: Schlusskurs und letzte gemeldete Zahlen (Discover-Bewertung, Screener).' : def.base ? 'Wert wie in der SEC-Meldung (Companyfacts), je Geschäftsjahr bzw. eigenständiges Quartal; „berechnet“ = aus Quartalen oder Teilwerten zusammengesetzt.' : 'Aus den gemeldeten Werten desselben Zeitraums berechnet. Fehlt eine Eingabe, bleibt das Jahr leer.' }),
      el('p', { text: 'LTM = letzte zwölf Monate (Summe der letzten vier Quartale).' })]));
    if (related.length) out.push(el('div', { class: 'fu-related' }, [el('p', { class: 'vu-eyebrow', text: 'Verwandte Kennzahlen' }), el('div', { class: 'fu-chips' }, related.map(function (m) { return el('a', { class: 'fu-chip', href: href(t, 'kennzahl', '&k=' + m.id) }, m.label); }))]));
    return out;
  }
  function peerBars(co, def, U) {
    if (!U) return notice('Vergleichsdaten gerade nicht verfügbar.');
    var g = C.peerGroup(U, co.t, 'industry', 6);
    if (!g) return notice('Keine Branche hinterlegt.');
    if (g.self.fx && def.kind !== 'ratio' && def.kind !== 'growth' && def.kind !== 'multiple') return notice('Kein Betragsvergleich', co.name + ' berichtet in ' + cur(co) + '. Beträge werden nicht mit Dollarwerten verglichen; Quoten und Renditen schon.');
    var p = C.position(g.members, def.u, g.self[def.u]);
    var rows = g.peers.filter(function (x) { return isNum(x[def.u]); });
    var max = Math.max.apply(null, rows.map(function (x) { return Math.abs(x[def.u]); }).concat(p && isNum(p.median) ? [Math.abs(p.median)] : [])) || 1;
    var line = function (label, v, cls, link) {
      var inner = [el('span', { class: 'fu-hb-t', text: label }), el('span', { class: 'fu-hb-bar', 'aria-hidden': 'true' }, isNum(v) ? el('i', { class: v < 0 ? 'is-neg' : '', style: 'width:' + Math.max(2, Math.abs(v) / max * 100).toFixed(1) + '%' }) : null),
        el('b', { class: 'fu-num', text: isNum(v) ? val(def, v, 'USD') : '–' })];
      return el('li', { class: cls || '' }, link ? el('a', { href: link }, inner) : inner);
    };
    return el('div', { class: 'fu-card' }, [
      el('p', { class: 'fu-card-k' }, [el('b', { text: g.label }), p && p.rank ? ' · Platz ' + p.rank + ' von ' + p.count : '']),
      el('ul', { class: 'fu-hb' }, rows.map(function (x) { return line(x.s, x[def.u], x.s === co.t ? 'is-self' : '', x.s === co.t ? null : href(x.s, 'kennzahl', '&k=' + def.id)); })
        .concat(p ? [line('Median', p.median, 'is-median')] : [])),
      el('a', { class: 'fu-sec-link', href: href(co.t, 'vergleich', '&k=' + def.id) }, ['Ganze Branche', glyph('chevron', 'fu-glyph-sm')])
    ]);
  }
  /* Bewertung: Wert, Marktmedian (Discover-Kontext, nur KGV/KUV), Branchenmedian und Lage. */
  function valuationContext(co, def, U, ctx) {
    var s = ctx.snap, out = [];
    if (def.id === 'pe' && isNum(s.pe) && isNum(s.peMedian)) out.push(gauge('KGV', s.pe, s.peMedian, 'Median aller US-Aktien'));
    if (def.id === 'ps' && isNum(s.ps) && isNum(s.psMedian)) out.push(gauge('KUV', s.ps, s.psMedian, 'Median aller US-Aktien'));
    if (def.u && U) out.push(peerBars(co, def, U));
    if (!out.length) out.push(notice('Kein Vergleich möglich', 'Für diese Kennzahl liegt kein Wert vor.'));
    return out;
  }
  function gauge(label, v, median, what) {
    var ratio = v / median, lo = Math.log(1 / 8), hi = Math.log(8), pos = function (r) { return (Math.log(Math.max(1 / 8, Math.min(8, r))) - lo) / (hi - lo) * 100; };
    return el('div', { class: 'fu-card fu-gauge' }, [
      el('p', { class: 'fu-card-k' }, [el('b', { text: M.multiple(ratio) + '× ' }), what + ' (' + M.multiple(median) + ')']),
      el('div', { class: 'fu-gauge-track', 'aria-hidden': 'true' }, [
        el('i', { class: 'z z-low', style: 'left:0;width:' + pos(0.67).toFixed(1) + '%' }), el('i', { class: 'z z-mid', style: 'left:' + pos(0.67).toFixed(1) + '%;width:' + (pos(1.5) - pos(0.67)).toFixed(1) + '%' }),
        el('i', { class: 'z z-high', style: 'left:' + pos(1.5).toFixed(1) + '%;right:0' }), el('i', { class: 'mk mk-median', style: 'left:' + pos(1).toFixed(1) + '%' }), el('i', { class: 'mk mk-self', style: 'left:' + pos(ratio).toFixed(1) + '%' })]),
      el('div', { class: 'fu-gauge-scale', 'aria-hidden': 'true' }, [el('span', { text: 'niedriger' }), el('span', { text: 'Markt' }), el('span', { text: 'höher' })]),
      el('p', { class: 'fu-sr', text: label + ' ' + M.multiple(v) + ', das ' + M.multiple(ratio) + '-Fache des Medians ' + M.multiple(median) })]);
  }

  /* ------------------------------------------------------------ 4 Branchenvergleich */
  var CMP = ['revenue', 'revenue_growth', 'net_margin', 'operating_margin', 'gross_margin', 'roic', 'roe', 'free_cash_flow', 'fcf_margin', 'pe', 'ps', 'ev_ebitda', 'pb', 'fcf_yield', 'debt_to_equity', 'market_cap'];
  function compareView(co, r) {
    var t = co.t, by = r.tab === 'sektor' ? 'sector' : 'industry', metric = CMP.indexOf(r.metric) >= 0 ? r.metric : 'revenue';
    var box = withUniverse(co, function (U) {
      if (!U) return notice('Vergleichsdaten gerade nicht verfügbar.', 'Die Daten aller US-Aktien konnten nicht geladen werden.');
      var g = C.peerGroup(U, t, by, 6);
      if (!g) return notice('Keine Vergleichsgruppe.', 'Für diese Aktie liegt kein SEC-Branchencode vor.');
      var gi = C.peerGroup(U, t, 'industry', 6), gs = C.peerGroup(U, t, 'sector', 6);
      var fxNote = g.self.fx ? el('p', { class: 'vu-alert', role: 'note', text: co.name + ' berichtet in ' + cur(co) + ': Beträge (Umsatz, Cashflow) werden nicht mit Dollarwerten verglichen und bleiben leer.' }) : null;
      var groupSeg = el('div', { class: 'fu-seg', role: 'group', 'aria-label': 'Vergleichsgruppe' }, [gi && ['', 'Branche: ' + gi.label], gs && ['sektor', 'Sektor: ' + gs.label]].filter(Boolean).map(function (x) {
        return el('a', { class: 'fu-seg-b', href: href(t, 'vergleich', (x[0] ? '&t=' + x[0] : '') + '&k=' + metric), 'aria-current': (x[0] === 'sektor') === (by === 'sector') ? 'page' : null }, x[1]);
      }));
      var chart = el('div', { class: 'fu-card' }), tbl = el('div');
      var mSeg = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Kennzahl' }, CMP.map(function (id) {
        return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(id === metric), onclick: function () { metric = id; [].forEach.call(mSeg.children, function (bt, k) { bt.setAttribute('aria-pressed', String(CMP[k] === metric)); }); paint(); } }, short(C.BY_ID[id].label));
      }));
      function paint() {
        var def = C.BY_ID[metric], col = def.u, p = C.position(g.members, col, g.self[col]);
        var pts = g.peers.map(function (x) { return { key: x.s, label: x.s + ' · ' + x.n, short: x.s, v: isNum(x[col]) ? x[col] : null, self: x.s === t }; });
        put(chart, el('p', { class: 'fu-card-k' }, [el('b', { text: def.label }), p && p.rank ? ' · ' + t + ' auf Platz ' + p.rank + ' von ' + p.count : '', p ? ' · Median ' + val(def, p.median, 'USD') : '']),
          bars(pts, { def: def, currency: 'USD', height: 170, noLast: true }));
        put(tbl, el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Unternehmen' }), el('th', { scope: 'col', class: 'r', text: short(def.label) }), el('th', { scope: 'col', class: 'r', text: metric === 'revenue' ? 'Börsenwert' : 'Umsatz' }), el('th', { scope: 'col', class: 'r', text: 'Wachstum' })])),
          el('tbody', {}, g.peers.map(function (x) {
            return el('tr', { class: x.s === t ? 'is-self' : '' }, [el('th', { scope: 'row' }, x.s === t ? [el('b', { text: x.s }), el('small', { text: x.n })] : el('a', { href: href(x.s, 'vergleich', (by === 'sector' ? '&t=sektor' : '') + '&k=' + metric) }, [el('b', { text: x.s }), el('small', { text: x.n })])),
              el('td', { class: 'r fu-num', text: val(def, x[col], 'USD') }), el('td', { class: 'r fu-num', text: C.money(metric === 'revenue' ? x.mcap : x.revenue, 'USD') }), el('td', { class: 'r fu-num', text: C.fmt({ kind: 'growth' }, x.revGrowth) })]);
          }).concat(p ? [el('tr', { class: 'is-median' }, [el('th', { scope: 'row', text: 'Median (' + p.count + ')' }), el('td', { class: 'r fu-num', text: val(def, p.median, 'USD') }), el('td', { class: 'r', text: '' }), el('td', { class: 'r', text: '' })])] : []))])));
      }
      paint();
      var cards = el('ul', { class: 'fu-kgrid' }, ['gross_margin', 'operating_margin', 'roic', 'pe', 'ev_ebitda', 'fcf_yield'].map(function (id) {
        var def = C.BY_ID[id], p = C.position(g.members, def.u, g.self[def.u]);
        return el('li', {}, el('a', { class: 'fu-k', href: href(t, 'kennzahl', '&k=' + id) }, [el('span', { class: 'fu-k-l', text: def.label }), el('b', { class: 'fu-k-v fu-num' + (isNum(g.self[def.u]) ? '' : ' is-none'), text: isNum(g.self[def.u]) ? val(def, g.self[def.u], 'USD') : 'keine Angabe' }),
          el('small', { class: 'fu-k-s', text: p ? 'Branche ' + val(def, p.median, 'USD') + (p.rank && isNum(g.self[def.u]) ? ' · Platz ' + p.rank + '/' + p.count : '') : '' })]));
      }));
      return [groupSeg, fxNote, el('p', { class: 'fu-note', text: g.members.length + ' Unternehmen in der Gruppe · gezeigt die ' + g.peers.length + ' größten nach Börsenwert' }), mSeg, chart, tbl,
        sec('Weitere Kennzahlen im Vergleich', { sub: 'Wert von ' + t + ' und Median der Gruppe' }, [cards]),
        el('a', { class: 'fu-teaser', href: '#/branche/' + g.self.sic2 }, [el('span', { class: 'fu-entry-ico' }, glyph('company')), el('span', {}, [el('b', { text: 'Ganze Branche ansehen' }), el('small', { text: gi ? gi.label + ' · ' + gi.members.length + ' Unternehmen' : '' })]), glyph('chevron', 'fu-glyph-sm')]),
        more('Wie ist die Gruppe gewählt?', [el('p', { text: 'Branche = gleiche SEC-Branchen-Hauptgruppe (die ersten zwei Stellen des SIC-Codes), Sektor = Zusammenfassung mehrerer Hauptgruppen. Gezeigt werden die größten Unternehmen nach Börsenwert; Median und Platz beziehen sich auf alle Unternehmen der Gruppe mit Wert.' }),
          el('p', { text: 'Werte wie im Screener: Margen und Renditen aus dem letzten Geschäftsjahr, Umsatz und Wachstum aus den letzten zwölf Monaten, Bewertung zum Schlusskurs vom ' + M.dateDe(U.asOf) + '. Geschäftsjahre können zu unterschiedlichen Zeitpunkten enden.' })])];
    });
    return [compactHead(t, co, 'Branchenvergleich', co.name + ' im Vergleich zu Unternehmen derselben Branche.'), box];
  }
  function short(label) { return label.replace(/ \(.*\)$/, '').replace('Free-Cashflow', 'FCF').replace('Marktkapitalisierung', 'Börsenwert'); }

  /* ------------------------------------------------------------ 5 Finanzen */
  var STATEMENTS = {
    guv: { label: 'GuV', title: 'Gewinn- und Verlustrechnung', chart: ['revenue', 'net_income'], rows: ['revenue', 'revenue_growth', 'gross_profit', 'gross_margin', 'research_and_development', 'operating_income', 'operating_margin', 'ebitda', 'depreciation_and_amortization', 'pretax_income', 'income_tax_expense', 'tax_rate', 'net_income', 'net_margin', 'eps_diluted', 'diluted_weighted_average_shares', 'stock_based_compensation'] },
    bilanz: { label: 'Bilanz', title: 'Bilanz', chart: ['total_assets', 'stockholders_equity'], rows: ['total_assets', 'cash_and_equivalents', 'total_debt', 'long_term_debt', 'net_debt', 'stockholders_equity', 'equity_ratio', 'debt_to_equity', 'net_debt_ebitda', 'shares_outstanding', 'book_value_per_share'] },
    cashflow: { label: 'Cashflow', title: 'Kapitalflussrechnung', chart: ['operating_cash_flow', 'free_cash_flow'], rows: ['operating_cash_flow', 'capital_expenditures', 'capex_ratio', 'free_cash_flow', 'fcf_margin', 'fcf_per_share', 'cash_conversion', 'dividends_paid', 'payout_ratio', 'stock_based_compensation'] }
  };
  function financeView(co, r) {
    var t = co.t, b = co.book, cu = cur(co), tab = STATEMENTS[r.tab] ? r.tab : 'guv', period = r.period === 'quarterly' ? 'quarterly' : 'annual';
    var body = el('div');
    var tabsEl = el('div', { class: 'fu-seg', role: 'group', 'aria-label': 'Rechenwerk' }, Object.keys(STATEMENTS).map(function (k) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(k === tab), onclick: function () { tab = k; paint(); } }, STATEMENTS[k].label);
    }));
    var perEl = el('div', { class: 'fu-seg', role: 'group', 'aria-label': 'Zeitraum-Art' }, [['annual', 'Jährlich'], ['quarterly', 'Quartalsweise']].map(function (p) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(p[0] === period), onclick: function () { period = p[0]; paint(); } }, p[1]);
    }));
    function paint() {
      [].forEach.call(tabsEl.children, function (bt, k) { bt.setAttribute('aria-pressed', String(Object.keys(STATEMENTS)[k] === tab)); });
      [].forEach.call(perEl.children, function (bt, k) { bt.setAttribute('aria-pressed', String(['annual', 'quarterly'][k] === period)); });
      var st = STATEMENTS[tab], cols = period === 'quarterly' ? b.quarters.map(function (q) { return q.fy * 4 + q.q - 1; }) : b.years.slice();
      var defs = st.rows.map(function (id) { return C.BY_ID[id]; }).filter(function (d) { return period === 'annual' || d.q; });
      var series = {}; defs.forEach(function (d) { var m = {}; C.seriesOf(b, d, period).forEach(function (x) { m[x.key] = x; }); series[d.id] = m; });
      // nur Spalten, in denen mindestens eine Zeile einen Wert hat; neueste zuerst
      cols = cols.filter(function (k) { return defs.some(function (d) { return series[d.id][k] && isNum(series[d.id][k].v); }); }).reverse();
      defs = defs.filter(function (d) { return cols.some(function (k) { return series[d.id][k] && isNum(series[d.id][k].v); }); });
      if (!cols.length) { put(body, notice('Keine ' + (period === 'quarterly' ? 'Quartalswerte' : 'Jahreswerte') + ' für dieses Rechenwerk.', period === 'quarterly' ? 'Quartale liegen für die letzten zwei Jahre und nur für einen Teil der Posten vor.' : '')); return; }
      var cA = series[st.chart[0]] || {}, cB = series[st.chart[1]] || {};
      var chartCols = cols.slice(0, period === 'quarterly' ? 8 : 8).reverse();
      var label = function (k) { return period === 'quarterly' ? 'Q' + (k % 4 + 1) + " '" + String(Math.floor(k / 4)).slice(2) : String(k); };
      put(body, 
        el('div', { class: 'fu-card' }, bars(chartCols.map(function (k) { return { key: k, label: period === 'quarterly' ? 'Q' + (k % 4 + 1) + ' GJ ' + Math.floor(k / 4) : 'GJ ' + k, short: label(k), vs: [cA[k] ? cA[k].v : null, cB[k] ? cB[k].v : null] }; }),
          { def: C.BY_ID[st.chart[0]], currency: cu, series: [short(C.BY_ID[st.chart[0]].label), short(C.BY_ID[st.chart[1]].label)] })),
        el('div', { class: 'fu-table-wrap fu-stmt-wrap' }, el('table', { class: 'fu-table fu-stmt' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: st.title })].concat(cols.map(function (k) { return el('th', { scope: 'col', class: 'r', text: label(k) }); })))),
          el('tbody', {}, defs.map(function (d) {
            var sub = d.kind === 'ratio' || d.kind === 'growth' || d.kind === 'multiple';
            return el('tr', { class: sub ? 'is-sub' : '' }, [el('th', { scope: 'row' }, el('a', { href: href(t, 'kennzahl', '&k=' + d.id + (period === 'quarterly' ? '&p=q' : '')) }, short(d.label)))].concat(cols.map(function (k) {
              var x = series[d.id][k];
              return el('td', { class: 'r fu-num' + (x && isNum(x.v) ? (x.v < 0 ? ' is-neg' : '') : ' is-none'), text: x && isNum(x.v) ? compactVal(d, x.v, cu) : '–' });
            })));
          }))])),
        el('p', { class: 'fu-note', text: (period === 'quarterly' ? 'Eigenständige Quartale (aus Halbjahres- und Jahreswerten herausgerechnet, wo nötig). ' : '') + fyNote(b) + ' · Beträge in ' + (cu === 'USD' ? 'US-Dollar' : cu) + ' · Zeile antippen für Verlauf und Quelle.' }));
    }
    paint();
    return [compactHead(t, co, 'Finanzen', 'Gewinn- und Verlustrechnung, Bilanz und Cashflow aus den SEC-Meldungen.'), el('div', { class: 'fu-ctrl' }, [tabsEl, perEl]), body,
      notice('Segmentdaten: nicht verfügbar', 'Die Aufteilung nach Geschäftsbereichen steht nicht in den strukturierten SEC-Daten (Companyfacts), die Vision Universe verarbeitet. Sie wird nicht geschätzt.')];
  }
  function compactVal(def, v, cu) {
    if (def.kind === 'money') { var a = Math.abs(v), s = v < 0 ? '−' : ''; var u = a >= 1e9 ? [1e9, ' Mrd.'] : a >= 1e6 ? [1e6, ' Mio.'] : [1e3, ' Tsd.']; return s + (a / u[0]).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + u[1]; }
    return C.fmt(def, v, cu);
  }

  /* ------------------------------------------------------------ 6 Weitere Bereiche */
  var AREA_LIST = [
    ['dividende', 'dividend', 'Dividende', 'Rendite, Ausschüttungen, Ausschüttungsquote'],
    ['analysten', 'analysts', 'Analysten', 'Einstufungen und Kursziele'],
    ['bewertung', 'valuation', 'Bewertung', 'KGV, KUV, KBV, EV/EBITDA, FCF-Rendite'],
    ['aktie', 'share', 'Aktie & Kapital', 'Aktienanzahl, Rückkäufe, Aktienvergütung'],
    ['unternehmen', 'company', 'Unternehmensdaten', 'Branche, Börse, Geschäftsjahr, Indizes'],
    ['quellen', 'source', 'Quellen & Downloads', 'SEC-Meldungen je Jahr, Daten als CSV']
  ];
  function moreView(co) {
    var t = co.t, SCX = global.VUCore && global.VUCore.StockContext, ctx = null;
    try { ctx = SCX ? SCX.fromUs(t, { name: co.name }) : null; } catch (e) { ctx = null; }
    var hf = ctx ? SCX.href(ctx, 'hedgefonds') : null;
    return [compactHead(t, co, 'Weitere Bereiche', 'Zusätzliche Informationen und Kennzahlen.'),
      el('ul', { class: 'fu-areas' }, AREA_LIST.map(function (a) {
        return el('li', {}, el('a', { href: href(t, a[0]) }, [el('span', { class: 'fu-entry-ico' }, glyph(a[1])), el('span', {}, [el('b', { text: a[2] }), el('small', { text: a[3] })]), glyph('chevron', 'fu-glyph-sm')]));
      }).concat(hf ? [el('li', {}, el('a', { href: hf }, [el('span', { class: 'fu-entry-ico' }, glyph('investors')), el('span', {}, [el('b', { text: 'Aktionärsstruktur' }), el('small', { text: 'Große Investoren laut 13F-Meldungen (Hedgefonds)' })]), glyph('chevron', 'fu-glyph-sm')]))] : []))];
  }
  function areaView(co, r, ctx) {
    var a = r.sub, t = co.t, back = [href(t, 'mehr'), 'Weitere Bereiche'];
    var title = AREAS[a], d = AREA_LIST.filter(function (x) { return x[0] === a; })[0];
    var head = compactHead(t, co, title, d ? d[3] : null, back);
    if (a === 'dividende') return [head].concat(metricBlock(co, ctx, ['dividend_yield', 'dividends_paid', 'dividends_per_share', 'payout_ratio']), [chartFor(co, 'dividends_paid')]);
    if (a === 'aktie') return [head].concat(metricBlock(co, ctx, ['shares_outstanding', 'diluted_weighted_average_shares', 'share_change', 'stock_based_compensation', 'eps_diluted', 'book_value_per_share']), [chartFor(co, 'diluted_weighted_average_shares'), splitNote(co)]);
    if (a === 'bewertung') return [head, withUniverse(co, function () { return [el('div', { class: 'fu-kgrid' }, C.METRICS.filter(function (m) { return m.cat === 'bewertung'; }).map(function (m) { return kpiTile(co, m.id, ctx); }))].concat(isNum(ctx.snap.pe) && isNum(ctx.snap.peMedian) ? [gauge('KGV', ctx.snap.pe, ctx.snap.peMedian, 'Median aller US-Aktien')] : []); }),
      more('Wie wird bewertet?', [el('p', { text: 'Alle Kennzahlen zum Schlusskurs' + (ctx.snap.priceDate ? ' vom ' + M.dateDe(ctx.snap.priceDate) : '') + ' und den zuletzt gemeldeten Zahlen (letzte zwölf Monate, Bilanz zum letzten Geschäftsjahresende). Ist die Aktienbasis nicht plausibel, wird kein Börsenwert und damit keine Bewertung gezeigt.' })])];
    if (a === 'analysten') return [head, analystBlock(co)];
    if (a === 'unternehmen') return [head, withUniverse(co, function (U) { return companyData(co, U); })];
    if (a === 'quellen') return [head, sourcesBlock(co), dataMethod(co, true)];
    return overview(co, r, ctx);
  }
  function metricBlock(co, ctx, ids) {
    return [el('div', { class: 'fu-kgrid' }, ids.map(function (id) { return kpiTile(co, id, ctx); }))];
  }
  function chartFor(co, id) {
    var def = C.BY_ID[id], rows = C.seriesOf(co.book, def, 'annual').slice(-10);
    if (rows.filter(function (x) { return isNum(x.v); }).length < 2) return null;
    return sec(def.label, { sub: 'Je Geschäftsjahr', link: [href(co.t, 'kennzahl', '&k=' + id), 'Details'] }, [el('div', { class: 'fu-card' }, bars(rows, { def: def, currency: cur(co) }))]);
  }
  function splitNote(co) {
    var sp = co.book.splits;
    return sp.length ? el('p', { class: 'vu-alert', role: 'note', text: 'Sprünge der Aktienanzahl: ' + sp.map(function (s) { return 'GJ ' + s.from + '→' + s.to + ' (×' + M.multiple(s.factor) + ')'; }).join(', ') + ' – Split oder Kapitalmaßnahme ohne Rückrechnung.' }) : null;
  }
  function analystBlock(co) {
    var box = el('div', {}, skel(200));
    loadAnalysts().then(function (doc) {
      var a = C.analysts(doc, co.t);
      if (!a) { put(box, notice('Für ' + co.t + ' liegen keine Analystendaten vor.', 'Einstufungen und Kursziele führt Vision Universe derzeit für eine kleine Auswahl großer Titel.'), el('a', { class: 'fu-sec-link', href: '/analysten/' }, ['Zur Analystenübersicht', glyph('chevron', 'fu-glyph-sm')])); return; }
      var L = a.last, keys = [['strongBuy', 'Starker Kauf'], ['buy', 'Kaufen'], ['hold', 'Halten'], ['sell', 'Verkaufen'], ['strongSell', 'Starker Verkauf']];
      var price = co.quote && co.quote.value, tg = a.target;
      var range = tg && isNum(tg.low) && isNum(tg.high) && tg.high > tg.low ? function (v) { return Math.max(0, Math.min(100, (v - tg.low) / (tg.high - tg.low) * 100)); } : null;
      put(box, 
        el('div', { class: 'fu-kgrid' }, [
          el('div', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Konsens' }), el('b', { class: 'fu-k-v', text: a.label || '–' }), el('small', { class: 'fu-k-s', text: a.total ? a.total + ' Einstufungen · ' + monthDe(L.period) : '' })]),
          tg ? el('div', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Kursziel (Mittel)' }), el('b', { class: 'fu-k-v fu-num', text: C.fmt({ kind: 'perShare' }, tg.mean, 'USD') }),
            el('small', { class: 'fu-k-s', text: isNum(price) ? (tg.mean >= price ? '+' : '−') + M.pct(Math.abs(tg.mean / price - 1)) + ' zum Kurs' : '' })]) : null
        ]),
        L ? el('div', { class: 'fu-card' }, [el('p', { class: 'fu-card-k' }, [el('b', { text: 'Verteilung' }), ' · ' + monthDe(L.period)]),
          el('div', { class: 'fu-dist', 'aria-hidden': 'true' }, keys.map(function (k, i) { return L[k[0]] ? el('i', { class: 'd' + i, style: 'flex:' + L[k[0]] }) : null; })),
          el('ul', { class: 'fu-legend' }, keys.map(function (k, i) { return el('li', {}, [el('i', { class: 'sw d' + i }), k[1] + ' ' + (L[k[0]] || 0)]); }))]) : null,
        tg && range ? el('div', { class: 'fu-card' }, [el('p', { class: 'fu-card-k' }, [el('b', { text: 'Kursziele' }), ' · ' + (tg.provider || '')]),
          el('div', { class: 'fu-range', 'aria-hidden': 'true' }, [el('i', { class: 'mk mk-median', style: 'left:' + range(tg.mean).toFixed(1) + '%' }), isNum(price) ? el('i', { class: 'mk mk-self', style: 'left:' + range(price).toFixed(1) + '%' }) : null]),
          el('div', { class: 'fu-gauge-scale' }, [el('span', { text: 'Tief ' + C.fmt({ kind: 'perShare' }, tg.low, 'USD') }), el('span', { text: 'Hoch ' + C.fmt({ kind: 'perShare' }, tg.high, 'USD') })]),
          el('p', { class: 'fu-note', text: 'Strich = mittleres Kursziel, Punkt = aktueller Kurs' + (isNum(price) ? ' (' + C.fmt({ kind: 'perShare' }, price, 'USD') + ')' : '') + '.' })]) : null,
        a.history.length > 1 ? el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [el('thead', {}, el('tr', {}, [el('th', { text: 'Monat' })].concat(keys.map(function (k) { return el('th', { class: 'r', text: k[1] }); })))),
          el('tbody', {}, a.history.slice().reverse().map(function (h) { return el('tr', {}, [el('th', { scope: 'row', text: monthDe(h.period) })].concat(keys.map(function (k) { return el('td', { class: 'r fu-num', text: String(h[k[0]] || 0) }); }))); }))])) : null,
        el('p', { class: 'fu-note', text: 'Quelle: ' + (a.provider || 'Finnhub + FMP') + ' · Stand ' + M.dateDe((a.generatedAt || '').slice(0, 10)) + '. Einschätzungen Dritter, keine Empfehlung von Vision Universe.' }));
    }).catch(function () { put(box, notice('Analystendaten gerade nicht verfügbar.')); });
    return box;
  }
  function monthDe(p) { var m = /^(\d{4})-(\d{2})/.exec(p || ''); return m ? ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'][Number(m[2]) - 1] + ' ' + m[1] : '–'; }
  function companyData(co, U) {
    var raw = co.raw, u = U && U.get(co.t), fye = C.fiscalYearEnd(co.book), b = co.book;
    var rows = [
      ['Name', raw.legalName || co.name], ['Kürzel', co.t], ['Börse', co.exchange || (u && u.ex)], ['Was macht das Unternehmen', u && u.was],
      ['Branche (SEC)', u && u.sic2 ? U.industryLabel(u.sic2) + ' · SIC ' + u.sic2 : null], ['Sektor', u && u.sec ? U.sectorLabel(u.sec) : raw.sector],
      ['Indizes', (raw.indexMemberships || []).map(function (x) { return x.shortLabel || x.indexName; }).join(', ') || null],
      ['Erster Handelstag', u && u.ipo ? M.dateDe(u.ipo) : null], ['Geschäftsjahr', fye ? (fye.calendar ? 'Kalenderjahr' : 'endet im ' + fye.month) + (fye.weekBased ? ' (52/53-Wochen-Jahr)' : '') : null],
      ['Berichtswährung', b.currency], ['SEC-CIK', b.cik ? String(Number(b.cik)) : null], ['Geschäftsjahre', b.years.length ? b.years[0] + '–' + b.years[b.years.length - 1] : null]
    ];
    return [el('dl', { class: 'fu-dl' }, rows.reduce(function (acc, x) { acc.push(el('dt', { text: x[0] }), el('dd', { class: x[1] ? '' : 'is-none', text: x[1] || 'keine Angabe' })); return acc; }, [])),
      b.cik ? el('a', { class: 'fu-sec-link', href: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + encodeURIComponent(b.cik) + '&type=10-K', target: '_blank', rel: 'noopener' }, ['Alle Meldungen bei der SEC', glyph('chevron', 'fu-glyph-sm')]) : null];
  }
  /* Quellen je Geschaeftsjahr (aus der Historie, sonst aus dem Discover-Block) und CSV der Jahreswerte. */
  function sourcesBlock(co) {
    var b = co.book, byFy = {};
    Object.keys(b.base).forEach(function (m) { b.base[m].annual.forEach(function (r) { if (!r.accn) return; var s = byFy[r.fy] = byFy[r.fy] || {}; s[r.accn] = r.filed; }); });
    var years = Object.keys(byFy).map(Number).sort(function (x, y) { return y - x; });
    return [el('button', { type: 'button', class: 'fu-btn', onclick: function () { downloadCsv(co); } }, [glyph('download', 'fu-glyph-sm'), 'Jahreswerte als CSV herunterladen']),
      el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [el('thead', {}, el('tr', {}, [el('th', { text: 'Jahr' }), el('th', { text: 'Meldung (öffnet sec.gov)' })])),
        el('tbody', {}, years.map(function (fy) {
          return el('tr', {}, [el('th', { scope: 'row', text: 'GJ ' + fy }), el('td', {}, Object.keys(byFy[fy]).map(function (accn, i) { var url = M.secFilingUrl(b.cik, accn); return el('span', { class: 'fu-filing' }, [i ? ' · ' : '', url ? el('a', { href: url, target: '_blank', rel: 'noopener', text: 'Meldung vom ' + M.dateDe(byFy[fy][accn]) }) : accn]); }))]);
        }))])),
      el('p', { class: 'fu-note', text: 'Ein Wert stammt aus der Meldung, in der er zuletzt berichtet wurde – oft der Jahresbericht eines späteren Jahres mit Vorjahresvergleich.' })];
  }
  function downloadCsv(co) {
    var b = co.book, defs = C.METRICS.filter(function (d) { return !d.snap; });
    var lines = [['Kennzahl', 'Einheit'].concat(b.years.map(String)).join(';')];
    defs.forEach(function (d) {
      var m = {}; C.seriesOf(b, d, 'annual').forEach(function (x) { m[x.key] = x.v; });
      if (!b.years.some(function (y) { return isNum(m[y]); })) return;
      lines.push(['"' + d.label + '"', d.kind === 'money' ? b.currency : d.kind === 'perShare' ? b.currency + '/Aktie' : d.kind === 'shares' ? 'Aktien' : d.kind === 'multiple' ? 'Faktor' : 'Anteil'].concat(b.years.map(function (y) { return isNum(m[y]) ? String(m[y]).replace('.', ',') : ''; })).join(';'));
    });
    var blob = new Blob(['﻿' + lines.join('\n') + '\n# Quelle: SEC EDGAR Companyfacts, aufbereitet von Vision Universe · Stand ' + (b.asOf || '') + '\n'], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: co.t + '-fundamental-' + (b.asOf || 'stand') + '.csv' });
    document.body.append(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function dataMethod(co, open) {
    var f = co.f, b = co.book, stale = f.stale && f.stale.stale;
    return el('details', { class: 'vu-dm', id: 'quellen', open: open ? true : null }, [
      el('summary', {}, ['Daten & Methodik', el('small', { text: 'Stand ' + M.dateDe(b.asOf || f.asOf) })]),
      el('dl', {}, [
        el('dt', { text: 'Quelle' }), el('dd', { text: 'SEC EDGAR Companyfacts' + (b.source === 'history' ? ' · volle Historie mit Quartalen' : ' · Discover-Auszug (Historie gerade nicht verfügbar)') + (b.cik ? ' · CIK ' + Number(b.cik) : '') }),
        el('dt', { text: 'Geschäftsjahre' }), el('dd', { text: b.years.length + (b.years.length ? ' (' + b.years[0] + '–' + b.years[b.years.length - 1] + ') · ' + fyNote(b) : '') }),
        el('dt', { text: 'Quartale' }), el('dd', { text: b.quarters.length ? b.quarters.length + ' eigenständige Quartale' : 'keine' }),
        el('dt', { text: 'Aktualität' }), el('dd', { text: (stale ? '⚠ veraltet' : '✓ aktuell') + ' · letztes Geschäftsjahr ' + f.latestFiscalYear }),
        el('dt', { text: 'Hinweis' }), el('dd', {}, ['Rückblickende Ansicht aus Pflichtmeldungen. Fehlende Werte bleiben leer, nichts wird geschätzt. Keine Empfehlung. ', el('a', { href: '#/methodik', text: 'Methodik' })])
      ])]);
  }

  /* ------------------------------------------------------------ Methodik */
  function method() {
    setTitle('Methodik'); main.setAttribute('data-view', 'method');
    put(main, el('article', { class: 'fu-method' }, [
      backLink('#/', 'Fundamental'),
      el('h1', { class: 'fu-h1', text: 'Methodik' }),
      el('p', { text: 'Fundamental zeigt Geschäftszahlen, die US-Unternehmen in ihren Pflichtmeldungen an die SEC berichten (Companyfacts von SEC EDGAR). Es ist dieselbe Aufbereitung, die Discover, Quant und der Screener verwenden – Fundamental macht sie vollständig zugänglich.' }),
      el('h2', { text: 'Zeiträume' }),
      el('ul', {}, [el('li', { text: 'Geschäftsjahr (GJ): der Jahreswert aus dem Jahresbericht. Geschäftsjahre enden je Unternehmen zu unterschiedlichen Zeitpunkten; das Ende steht an jeder Reihe.' }),
        el('li', { text: 'Quartal: eigenständige Quartalswerte; wo Unternehmen nur Halbjahres- oder Jahreswerte melden, herausgerechnet („berechnet“).' }),
        el('li', { text: 'LTM: letzte zwölf Monate, Summe der letzten vier Quartale. Die Veränderung vergleicht mit den zwölf Monaten davor.' })]),
      el('h2', { text: 'Kennzahlen' }),
      el('ul', {}, C.METRICS.filter(function (m) { return m.formula; }).map(function (m) { return el('li', {}, [el('b', { text: m.label + ': ' }), m.formula]); })),
      el('h2', { text: 'Bewertung' }),
      el('p', { text: 'KGV, KUV, Börsenwert und Free-Cashflow-Rendite stammen aus der Discover-Bewertung, KBV, EV-Kennzahlen, Kurs/FCF und PEG aus dem Screener – jeweils zum letzten Schlusskurs. Historische Bewertungskennzahlen werden nicht berechnet, weil Kurse splitbereinigt, Gewinne je Aktie aber wie gemeldet vorliegen.' }),
      el('h2', { text: 'Vergleich und Ranglisten' }),
      el('p', { text: 'Branche = SEC-Branchen-Hauptgruppe (SIC, zwei Stellen). Median und Platz beziehen sich auf alle Unternehmen der Gruppe mit Wert. Ranglisten sortieren eine Kennzahl mit sichtbarer Regel und Plausibilitätsgrenzen.' }),
      el('h2', { text: 'Lücken und Grenzen' }),
      el('ul', {}, [el('li', { text: 'Fehlt ein Wert, bleibt das Jahr leer. Es wird nichts geschätzt oder aufgefüllt.' }),
        el('li', { text: 'Springt die Aktienanzahl (Split ohne Rückrechnung), werden Raten über den Sprung bei Werten je Aktie nicht berechnet.' }),
        el('li', { text: 'Margen über 150 % des Umsatzes gelten als nicht plausibel (z. B. Banken mit abweichender Umsatzzeile) und werden nicht gezeigt.' }),
        el('li', { text: 'Segmentdaten, Prognosen und ESG-Daten sind nicht enthalten.' })]),
      el('p', { text: 'Keine Bewertung des Unternehmens, kein Score von Vision Universe und keine Empfehlung.' })
    ]));
    done();
  }

  function render() {
    var r = M.parseRoute(location.hash);
    var keepScroll = r.view === 'company' && main.getAttribute('data-ticker') === r.ticker && main.getAttribute('data-sub') === (r.sub || '') && r.sub;
    if (!keepScroll) window.scrollTo(0, 0);
    main.removeAttribute('data-view');
    if (r.view !== 'company') main.removeAttribute('data-ticker');
    main.setAttribute('data-sub', r.sub || '');
    if (r.view === 'company') company(r); else if (r.view === 'method') method(); else if (r.view === 'ranking') rankingView(r.id); else if (r.view === 'industry') industryView(r.id); else home(r.focus);
    if (r.focus === 'suche') { var q = document.getElementById('fu-q'); if (q) q.focus({ preventScroll: true }); }
    if (global.VUNavigation) global.VUNavigation.dock({});
  }
  window.addEventListener('hashchange', render);
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
