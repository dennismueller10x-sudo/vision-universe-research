/* Fundamental 2.0 – Oberflaeche.
 * Routen: #/ (Start), #/ranglisten[/auswahlen/<id>], #/branchen, #/suche, #/methodik[?k=<id>], alt #/entdecken (-> #/ranglisten), #/rangliste/<id>, #/branche/<SIC2>,
 *         #/<T> (Ueberblick) und #/<T>?ansicht=kennzahlen|kennzahl&k=<id>|vergleich|finanzen|mehr|<bereich>.
 * Daten: Discover-Aktiendatei, SEC-Historie (Release), Screener-Universum, Kursreihen, Analysten – siehe engine/catalog.js. */
(function (global) {
  'use strict';
  var M = global.VUFundamental.Model, C = global.VUFundamental.Catalog, K = global.VUFundamental.Compare;
  var ID = global.VUCore && global.VUCore.Identity;
  var main = document.getElementById('fu-main');
  var EXAMPLES = [['NVDA', 'NVIDIA'], ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['PLTR', 'Palantir'], ['JPM', 'JPMorgan Chase'], ['KO', 'Coca-Cola']];
  var state = { search: null, searchPromise: null, cache: {}, rows: {}, json: {}, books: {} };
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
    plus: 'M12 5v14M5 12h14', close: 'M6 6l12 12M18 6L6 18', expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    chevron: 'M9 6l6 6-6 6', check: 'M5 12.5l4.5 4.5L19 7.5', back: 'M15 6l-6 6 6 6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l4.5 4.5', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.01', download: 'M12 4v11M7 10l5 5 5-5M5 20h14'
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
  function loadConsensus(t) { var k = ID ? ID.shardKey(t) : null; return k ? once('consensus:' + k, function () { return fetchJson(C.CONSENSUS_SHARD_PATH + k + '.json'); }) : Promise.reject(new Error('NO_IDENTITY')); }
  function loadRow(path) { return state.rows[path] || (state.rows[path] = fetchJson(path).catch(function (e) { delete state.rows[path]; throw e; })); }
  function loadHistory(t) {
    if (!ID) return Promise.resolve({ state: 'NO_IDENTITY', issuer: null });
    return once('h:' + ID.shardKey(t), function () { return fetchGz(C.historyPath(t, ID.shardKey)); })
      .then(function (shard) {
        if (!shard || shard.schema !== 'vu-fundamental-history-shard-1.0.0') return { state: 'INVALID_SHARD', issuer: null };
        var h = (shard.issuers || {})[t] || null;
        return { state: h ? 'OK' : 'NOT_IN_SHARD', issuer: h };
      })
      .catch(function (e) { return { state: e && e.message === 'GZIP_UNSUPPORTED' ? 'GZIP_UNSUPPORTED' : 'SHARD_UNAVAILABLE', issuer: null }; });
  }
  /* Ein Unternehmen: Discover-Aktiendatei (Pflicht) + SEC-Historie (wenn ausgeliefert). */
  function loadCompany(t) {
    return state.cache[t] || (state.cache[t] = fetchJson(M.stockPath(t)).then(function (raw) {
      return loadHistory(t).then(function (h) {
        var hb = C.fromHistory(h.issuer, raw), book = hb || C.fromDiscover(raw);
        // historyState: OK = volle SEC-Historie; NOT_IN_SHARD = fuer dieses Unternehmen keine SEC-Reihen (kein Fehler);
        // alles andere = die Auslieferung fehlt oder ist nicht lesbar -> sichtbarer Hinweis, Discover-Auszug.
        return { t: t, raw: raw, f: M.fromStock(raw), book: book, historyState: hb ? 'OK' : h.issuer ? 'IDENTITY_MISMATCH' : h.state, name: raw.companyName || raw.legalName || t, quote: quoteFrom(raw), exchange: raw.exchange || null };
      });
    }).catch(function (e) { delete state.cache[t]; throw e; }));
  }
  function quoteFrom(raw) {
    var p = raw && raw.price, at = raw && raw.asOf;
    if (!p || !isNum(p.value) || p.value <= 0 || p.reason || typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(at)) return null;
    var c = raw.changePercent, ch = c && isNum(c.value) && !c.reason ? c.value : null;
    return { value: p.value, currency: 'USD', changePct: ch, changeLabel: ch == null ? null : 'zum Vortag', kind: 'close', at: M.dateDe(at.slice(0, 10)) };
  }

  /* Lange Wochenreihe (Kurs + Split-Beleg) und daraus die gepruefte Bewertung nach jedem Jahresbericht (catalog.js#historicalValuation). */
  function longPathOf(t, raw) {
    if (raw) return C.longSeriesPath(raw.series && raw.series.long && raw.series.long.path);
    try { return ID ? C.longSeriesPath('/quant/data/market/discover-series-long/' + ID.securityIdForTicker(t) + '.json') : null; } catch (e) { return null; }
  }
  function loadValuation(book, path) {
    if (!book) return Promise.resolve(null);
    if (book.valuation) return Promise.resolve(book.valuation);
    if (!path) { book.valuation = { state: 'UNAVAILABLE', reason: 'NO_SPLIT_EVIDENCE', years: [], series: {}, splits: [] }; return Promise.resolve(book.valuation); }
    return once('s:' + path, function () { return fetchJson(path); }).then(function (long) { return book.valuation || C.attachValuation(book, long); }).catch(function () { return null; });
  }
  function valuationOf(co) { return loadValuation(co.book, longPathOf(co.t, co.raw)); }
  function loadIndustry(key) {
    var path = C.industryPath(key);
    if (!path) return Promise.resolve(null);
    return once('i:' + key, function () { return fetchJson(path); }).then(function (d) { return d && d.schema === C.INDUSTRY_SCHEMA ? d : null; }).catch(function () { return null; });
  }
  /* Vergleichsunternehmen: nur die SEC-Historie (ohne Discover-Datei), Bewertung nur wenn gebraucht. */
  function loadPeerBook(t, needValuation) {
    var b = state.books[t];
    var ready = b !== undefined ? Promise.resolve(b) : loadHistory(t).then(function (h) { return (state.books[t] = h.issuer ? C.fromHistory(h.issuer, null) : null); });
    return ready.then(function (book) { return book && needValuation ? loadValuation(book, longPathOf(t, null)).then(function () { return book; }) : book; });
  }
  function loadPeers() { return once('peers', function () { return fetchJson(C.PEERS_PATH); }).then(C.peerIndex).catch(function () { return null; }); }
  function loadStatus() { return once('status', function () { return fetchJson(C.HISTORY_BASE + 'status.json'); }); }
  /* Erst laden, wenn der Baustein sichtbar wird (Startseite: Mini-Verlaeufe der Ranglisten). */
  function whenVisible(node, fn) {
    if (typeof IntersectionObserver !== 'function') { setTimeout(fn, 0); return; }
    var io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); } }, { rootMargin: '120px' });
    setTimeout(function () { io.observe(node); }, 0);
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

  /* Liniendiagramm (SVG-Linien, HTML-Beschriftung, scharf auf jedem Display). Mehrere Reihen ueber dieselbe Achse:
   * eigenes Unternehmen (Akzent), Branchenmedian (gestrichelt), Wettbewerber (dezent). Tippen oder Ziehen liest einen
   * Zeitraum ab, Pfeiltasten wechseln ihn. Luecken bleiben Luecken – es wird nicht interpoliert.
   * points: [{key, label, short}], series: [{label, cls: self|median|peer, vals: {key: v}, note: {key: text}}] */
  var PEER_TONES = 4;
  function lines(points, series, opt) {
    var H = opt.height || 190, all = [];
    series.forEach(function (s) { points.forEach(function (p) { var v = s.vals[p.key]; if (isNum(v)) all.push(v); }); });
    if (!all.length) return notice('Keine Werte', 'Für diesen Zeitraum liegen keine Angaben vor.');
    var max = Math.max.apply(null, all), min = Math.min.apply(null, all);
    if (min > 0 && (opt.def.kind === 'money' || opt.def.kind === 'shares') && min < max * 0.5) min = 0;
    var span = (max - min) || Math.abs(max) || 1, hi = max + span * 0.1, lo = min - span * 0.1;
    if (min >= 0 && lo < 0 && min - span * 0.1 < 0 && min === 0) lo = 0;
    var sc = scaleFor(opt.def, all, opt.currency), n = points.length;
    var xp = function (i) { return n === 1 ? 50 : 4 + i * 92 / (n - 1); }, yp = function (v) { return (hi - v) / (hi - lo) * 100; };
    var svgEl = svg('svg', { class: 'fu-lines-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    if (lo < 0 && hi > 0) svgEl.append(svg('line', { class: 'fu-l-zero', x1: 0, x2: 100, y1: yp(0), y2: yp(0), 'vector-effect': 'non-scaling-stroke' }));
    var dots = [], peerNo = 0;
    series.forEach(function (s) {
      var tone = s.cls === 'peer' ? ' t' + (peerNo++ % PEER_TONES) : '', d = '', open = false, single = [];
      points.forEach(function (p, i) {
        var v = s.vals[p.key];
        if (!isNum(v)) { open = false; return; }
        var prevOk = i > 0 && isNum(s.vals[points[i - 1].key]), nextOk = i < n - 1 && isNum(s.vals[points[i + 1].key]);
        d += (open ? 'L' : 'M') + xp(i).toFixed(2) + ' ' + yp(v).toFixed(2); open = true;
        if (!prevOk && !nextOk) single.push(i);
      });
      if (d) svgEl.append(svg('path', { class: 'fu-l fu-l-' + s.cls + tone, d: d, 'vector-effect': 'non-scaling-stroke' }));
      single.forEach(function (i) { dots.push(el('i', { class: 'fu-ldot fu-ldot-' + s.cls + tone, style: 'left:' + xp(i) + '%;top:' + yp(s.vals[points[i].key]) + '%' })); });
      s.tone = tone;
    });
    var cursor = el('i', { class: 'fu-lcur', hidden: true }), marks = el('div', { class: 'fu-lmarks' });
    var axis = el('div', { class: 'fu-laxis', 'aria-hidden': 'true' }, [el('span', { style: 'top:' + yp(max) + '%', text: sc.f(max) }), max !== min ? el('span', { style: 'top:' + yp(min) + '%', text: sc.f(min) }) : null]);
    var plot = el('div', { class: 'fu-lines-plot', style: 'height:' + H + 'px', tabindex: '0', role: 'group', 'aria-label': (opt.label || opt.def.label) + ': Verlauf, mit Pfeiltasten ablesen' }, [svgEl, axis, cursor, marks].concat(dots));
    var readout = el('p', { class: 'fu-readout', 'aria-live': 'polite' }), sel = -1;
    function read(i) {
      sel = Math.max(0, Math.min(n - 1, i)); var p = points[sel];
      cursor.hidden = false; cursor.style.left = xp(sel) + '%';
      put(marks, series.map(function (s) { var v = s.vals[p.key]; return isNum(v) ? el('i', { class: 'fu-ldot fu-ldot-' + s.cls + s.tone, style: 'left:' + xp(sel) + '%;top:' + yp(v) + '%' }) : null; }));
      put(readout, el('b', { text: p.label }), ' ', series.map(function (s, k) {
        var v = s.vals[p.key];
        return el('span', { class: 'fu-ro fu-ro-' + s.cls + s.tone }, [(k ? ' · ' : '') + (series.length > 1 ? s.label + ' ' : ''), isNum(v) ? val(opt.def, v, opt.currency) : 'keine Angabe', s.note && s.note[p.key] ? ' (' + s.note[p.key] + ')' : '']);
      }), p.extra ? ' · ' + p.extra : '');
    }
    function at(ev) { var r = plot.getBoundingClientRect(); var f = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * 100; return n === 1 ? 0 : Math.round((f - 4) / 92 * (n - 1)); }
    plot.addEventListener('pointerdown', function (ev) { read(at(ev)); });
    plot.addEventListener('pointermove', function (ev) { if (ev.buttons || ev.pointerType === 'touch') read(at(ev)); });
    plot.addEventListener('keydown', function (ev) { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); read(sel + (ev.key === 'ArrowLeft' ? -1 : 1)); } });
    var xs = el('div', { class: 'fu-lines-x', 'aria-hidden': 'true' }, points.map(function (p, i) {
      var every = n > 8 ? Math.ceil(n / 5) : 1;
      return (n - 1 - i) % every === 0 ? el('span', { style: 'left:' + xp(i) + '%', text: p.short }) : null;
    }));
    var legend = series.length > 1 ? el('ul', { class: 'fu-legend' }, series.map(function (s) { return el('li', {}, [el('i', { class: 'sw sw-' + s.cls + s.tone }), s.label]); })) : null;
    var lastI = -1; points.forEach(function (p, i) { if (isNum(series[0].vals[p.key])) lastI = i; });
    setTimeout(function () { read(lastI >= 0 ? lastI : n - 1); }, 0);
    return el('div', { class: 'fu-lines' }, [legend, el('p', { class: 'fu-bars-unit', text: sc.unit }), plot, xs, readout]);
  }

  /* ------------------------------------------------------------ Mehrere Kennzahlen in einem Verlauf (engine/compare.js)
   * Jede Kennzahl behaelt ihre Farbe (m0 = Hauptkennzahl, m1–m3 je Platz der Auswahl; Entfernen faerbt nichts um).
   * Kennzahlen verschiedener Einheit teilen nie eine Achse: eine Einheit = eine Achse, zwei = links und rechts,
   * sonst Index (Basis 100) oder getrennte Verlaeufe mit gemeinsamer Zeitachse. Tippen, Ziehen oder Zeigen liest alle
   * Kennzahlen zum selben Zeitraum ab; Luecken bleiben Luecken – es wird nicht interpoliert. */
  function domainOf(vals, kind) {
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    if (min > 0 && (kind === 'money' || kind === 'shares') && min < max * 0.5) min = 0;
    var span = (max - min) || Math.abs(max) || 1, hi = max + span * 0.1, lo = min === 0 ? 0 : min - span * 0.1;
    return { min: min, max: max, y: function (v) { return (hi - v) / (hi - lo) * 100; }, at: function (y) { return hi - y / 100 * (hi - lo); }, zero: lo < 0 && hi > 0 };
  }
  var INDEX_SCALE = { unit: 'Index', f: function (v) { return Math.round(v).toLocaleString('de-DE'); } };
  function mcAxisLabel(ax) { return ax.index ? 'Index' : ax.sc.unit; }
  function multiChart(model, opt) {
    var mode = opt.mode, cu = opt.currency, pts = model.points, n = pts.length;
    var ix = mode === 'index' ? K.indexed(model) : null, list = [];
    model.series.forEach(function (s, i) {
      if (!s.ok) return;
      var vals = {};
      if (ix) { if (!ix.vals[i]) return; vals = ix.vals[i]; }
      else pts.forEach(function (p) { var r = s.rows[p.key]; if (r && isNum(r.v)) vals[p.key] = r.v; });
      if (Object.keys(vals).length) list.push({ i: i, s: s, def: s.def, tone: opt.tones[i], vals: vals });
    });
    if (!list.length || !n) return notice('Keine gemeinsamen Werte', 'Für diesen Zeitraum liegen keine vergleichbaren Angaben vor.');
    // Achsen je Diagramm: [{side, lines}]
    var panels;
    if (mode === 'split') panels = list.map(function (l) { return [{ side: 'right', lines: [l] }]; });
    else if (ix) panels = [[{ side: 'right', lines: list, index: true }]];
    else {
      var gs = [];
      list.forEach(function (l) { var g = gs.filter(function (x) { return x.key === l.s.unit.key; })[0]; if (!g) gs.push(g = { key: l.s.unit.key, lines: [] }); g.lines.push(l); });
      panels = [gs.length > 1 ? [{ side: 'left', lines: gs[0].lines }, { side: 'right', lines: gs[1].lines }] : [{ side: 'right', lines: gs[0].lines }]];
    }
    var H = opt.height || 210, PH = mode === 'split' ? Math.max(92, Math.round(H / Math.min(list.length, 4) * 0.9)) : H;
    var xp = function (k) { return n === 1 ? 50 : 4 + k * 92 / (n - 1); };
    var cursors = [], markLayers = [], plots = [];
    var dom = panels.map(function (axes) {
      var dual = axes.length > 1, svgEl = svg('svg', { class: 'fu-lines-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }), dots = [], labels = [];
      axes.forEach(function (ax) {
        var vs = []; ax.lines.forEach(function (l) { pts.forEach(function (p) { if (isNum(l.vals[p.key])) vs.push(l.vals[p.key]); }); });
        ax.d = domainOf(vs, ax.index ? 'index' : ax.lines[0].def.kind);
        ax.sc = ax.index ? INDEX_SCALE : scaleFor(ax.lines[0].def, vs, cu);
        if (ax.d.zero && !dual) svgEl.append(svg('line', { class: 'fu-l-zero', x1: 0, x2: 100, y1: ax.d.y(0), y2: ax.d.y(0), 'vector-effect': 'non-scaling-stroke' }));
        if (ax.index) svgEl.append(svg('line', { class: 'fu-l-base', x1: 0, x2: 100, y1: ax.d.y(100), y2: ax.d.y(100), 'vector-effect': 'non-scaling-stroke' }));
        ax.lines.forEach(function (l) {
          var d = '', open = false;
          pts.forEach(function (p, k) {
            var v = l.vals[p.key];
            if (!isNum(v)) { open = false; return; }
            d += (open ? 'L' : 'M') + xp(k).toFixed(2) + ' ' + ax.d.y(v).toFixed(2); open = true;
            var prevOk = k > 0 && isNum(l.vals[pts[k - 1].key]), nextOk = k < n - 1 && isNum(l.vals[pts[k + 1].key]);
            if (!prevOk && !nextOk) dots.push(el('i', { class: 'fu-ldot fu-mdot m' + l.tone, style: 'left:' + xp(k) + '%;top:' + ax.d.y(v) + '%' }));
          });
          if (d) svgEl.append(svg('path', { class: 'fu-l fu-l-m m' + l.tone, d: d, 'vector-effect': 'non-scaling-stroke' }));
          l.ax = ax;
        });
        // Dritte Marke auf halber Hoehe (dezente Hilfslinie, bei zwei Achsen dieselbe Linie mit dem Wert jeder Skala an dieser Stelle).
        var mid = ax.d.at(50), showMid = ax.d.max !== ax.d.min && Math.min(50 - ax.d.y(ax.d.max), ax.d.y(ax.d.min) - 50) * PH / 100 >= 16;
        if (showMid && (ax === axes[0] || !axes[0].showMid)) svgEl.append(svg('line', { class: 'fu-l-grid', x1: 0, x2: 100, y1: 50, y2: 50, 'vector-effect': 'non-scaling-stroke' }));
        ax.showMid = showMid;
        labels.push(el('div', { class: 'fu-laxis' + (ax.side === 'left' ? ' fu-laxis-l' : ''), 'aria-hidden': 'true' }, [el('span', { style: 'top:' + ax.d.y(ax.d.max) + '%', text: ax.sc.f(ax.d.max) }),
          showMid && !(ax.index && Math.abs(50 - ax.d.y(100)) * PH / 100 < 16) ? el('span', { style: 'top:50%', text: ax.sc.f(mid) }) : null,
          ax.d.max !== ax.d.min ? el('span', { style: 'top:' + ax.d.y(ax.d.min) + '%', text: ax.sc.f(ax.d.min) }) : null,
          ax.index && 100 < ax.d.max && 100 > ax.d.min && Math.min(ax.d.y(100) - ax.d.y(ax.d.max), ax.d.y(ax.d.min) - ax.d.y(100)) * PH / 100 >= 16 ? el('span', { class: 'is-base', style: 'top:' + ax.d.y(100) + '%', text: '100' }) : null]));
      });
      var cur = el('i', { class: 'fu-lcur', hidden: true }), marks = el('div', { class: 'fu-lmarks' });
      cursors.push(cur); markLayers.push({ node: marks, axes: axes });
      var plot = el('div', { class: 'fu-lines-plot fu-mc-plot' + (dual ? ' is-dual' : ''), style: 'height:' + PH + 'px' }, [svgEl].concat(labels, [cur, marks], dots));
      plots.push(plot);
      // Kopf je Diagramm: Einheit links/rechts mit Farbmarke der zugehoerigen Kennzahlen
      var side = function (ax) { return el('span', { class: 'fu-mc-u' + (ax.side === 'left' ? ' is-l' : ' is-r') }, ax.lines.map(function (l) { return el('i', { class: 'sw m' + l.tone }); }).concat([(mode === 'split' ? l0(ax) + ' · ' : '') + mcAxisLabel(ax)])); };
      return el('div', { class: 'fu-mc-panel' }, [el('div', { class: 'fu-mc-units', 'aria-hidden': 'true' }, dual ? [side(axes[0]), side(axes[1])] : [el('span'), side(axes[0])]), plot]);
    });
    function l0(ax) { return short(ax.lines[0].def.label); }
    var area = el('div', { class: 'fu-mc-area', tabindex: '0', role: 'group', 'aria-label': 'Verlauf von ' + model.series.filter(function (s) { return s.ok; }).map(function (s) { return s.def.label; }).join(', ') + ' – mit Pfeiltasten ablesen' }, dom);
    var xs = el('div', { class: 'fu-lines-x' + (panels.length === 1 && panels[0].length > 1 ? ' is-dual' : ''), 'aria-hidden': 'true' }, pts.map(function (p, k) {
      var every = n > 8 ? Math.ceil(n / 5) : 1;
      return (n - 1 - k) % every === 0 ? el('span', { style: 'left:' + xp(k) + '%', text: p.short }) : null;
    }));
    var legend = el('ul', { class: 'fu-legend fu-mc-legend' }, list.map(function (l) {
      var where = mode === 'axes' && panels[0].length > 1 ? (l.ax.side === 'left' ? ' · links' : ' · rechts') : '';
      return el('li', {}, [el('i', { class: 'sw m' + l.tone }), l.def.label + where]);
    }));
    var readout = el('div', { class: 'fu-mc-read', 'aria-live': 'polite' }), sel = -1;
    function rowNote(s, r) {
      if (!r) return null;
      if (s.def.snap && r.priceDate) return 'Kurs ' + C.fmt({ kind: 'perShare' }, r.price, 'USD') + ' am ' + M.dateDe(r.priceDate);
      if (model.period === 'quarterly' && r.filed) return (r.derived ? 'berechnet · ' : '') + 'Meldung ' + M.dateDe(r.filed);
      return r.derived ? 'berechnet' : null;
    }
    function read(k) {
      sel = Math.max(0, Math.min(n - 1, k)); var p = pts[sel];
      cursors.forEach(function (c) { c.hidden = false; c.style.left = xp(sel) + '%'; });
      markLayers.forEach(function (m) {
        put(m.node, [].concat.apply([], m.axes.map(function (ax) { return ax.lines.map(function (l) { var v = l.vals[p.key]; return isNum(v) ? el('i', { class: 'fu-ldot fu-mdot m' + l.tone, style: 'left:' + xp(sel) + '%;top:' + ax.d.y(v) + '%' }) : null; }); })));
      });
      var when = [p.end ? 'Berichtszeitraum bis ' + M.dateDe(p.end) : null, p.published ? 'Jahresbericht (10-K) veröffentlicht ' + M.dateDe(p.published) : null].filter(Boolean).join(' · ');
      put(readout, el('p', { class: 'fu-mc-rh' }, [el('b', { text: model.period === 'quarterly' ? p.label : 'Geschäftsjahr ' + p.key }), when ? el('small', { text: when }) : null]),
        el('ul', { class: 'fu-mc-rows' }, model.series.map(function (s, i) {
          if (!s.ok) return null;
          var r = s.rows[p.key], has = r && isNum(r.v), iv = ix && ix.vals[i] ? ix.vals[i][p.key] : null;
          var text = has ? val(s.def, r.v, cu) : 'keine Angabe', why = !has && r && r.reason ? K.reasonText(r.reason) : !has ? 'kein Wert für diesen Zeitraum' : null;
          var note = has ? rowNote(s, r) : why;
          if (ix && ix.excluded[i] && has) note = 'nicht indexiert' + (note ? ' · ' + note : '');
          return el('li', { class: has ? '' : 'is-none' }, [el('i', { class: 'sw m' + opt.tones[i] }), el('span', { class: 'fu-mc-l', text: short(s.def.label) }),
            el('b', { class: 'fu-num', text: ix && isNum(iv) ? 'Index ' + INDEX_SCALE.f(iv) : text }),
            ix && isNum(iv) ? el('small', { text: text + (note ? ' · ' + note : '') }) : note ? el('small', { text: note }) : null]);
        })));
    }
    function at(ev) { var r = plots[0].getBoundingClientRect(); var f = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * 100; return n === 1 ? 0 : Math.round((f - 4) / 92 * (n - 1)); }
    area.addEventListener('pointerdown', function (ev) { read(at(ev)); });
    area.addEventListener('pointermove', function (ev) { var k = at(ev); if (k !== sel) read(k); });
    area.addEventListener('keydown', function (ev) { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); read(sel + (ev.key === 'ArrowLeft' ? -1 : 1)); } });
    var head = el('div', { class: 'fu-mc-head' }, [legend, opt.onFull ? el('button', { type: 'button', class: 'fu-mc-full', 'aria-label': 'Diagramm vergrößern', title: 'Vergrößern', onclick: opt.onFull }, glyph('expand', 'fu-glyph-sm')) : null]);
    var start = pts.map(function (p) { return p.key; }).indexOf(model.lastMain);
    setTimeout(function () { read(start >= 0 ? start : n - 1); }, 0);
    return el('div', { class: 'fu-lines fu-mc fu-mc-' + mode, 'data-mode': mode }, [head, area, xs, readout]);
  }
  /* Werte aller gezeigten Kennzahlen je Zeitraum, mit Grund fuer jede Luecke (Tabellenansicht zum Diagramm). */
  function multiTable(model, cu) {
    var ok = model.series.filter(function (s) { return s.ok; });
    return el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table fu-mc-table' }, [
      el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: model.period === 'quarterly' ? 'Quartal' : 'Jahr' })].concat(ok.map(function (s) { return el('th', { scope: 'col', class: 'r', text: short(s.def.label) }); })))),
      el('tbody', {}, model.points.slice().reverse().map(function (p) {
        return el('tr', {}, [el('th', { scope: 'row' }, [p.label, p.end ? el('small', { text: 'bis ' + M.dateDe(p.end) }) : null, p.published ? el('small', { text: '10-K ' + M.dateDe(p.published) }) : null])].concat(ok.map(function (s) {
          var r = s.rows[p.key], has = r && isNum(r.v);
          return el('td', { class: 'r fu-num' + (has ? '' : ' is-none') }, [has ? val(s.def, r.v, cu) : r && r.reason ? K.reasonText(r.reason) : '–', has && s.def.snap && r.priceDate ? el('small', { class: 'fu-td-s', text: 'Kurs am ' + M.dateDe(r.priceDate) }) : null]);
        })));
      }))]));
  }

  /* ------------------------------------------------------------ Auswahlblatt (Dialog; unten auf dem iPhone, mittig ab Tablet) */
  function sheet(title, body, cls) {
    var d = el('dialog', { class: 'fu-sheet' + (cls ? ' ' + cls : ''), 'aria-label': title });
    function shut() { if (typeof d.close === 'function' && d.open) d.close(); else gone(); }
    function gone() { d.remove(); document.documentElement.classList.remove('fu-locked'); }
    put(d, el('div', { class: 'fu-sheet-in' }, [el('div', { class: 'fu-sheet-head' }, [el('h2', { class: 'fu-sheet-t', text: title }),
      el('button', { type: 'button', class: 'fu-sheet-x', 'aria-label': 'Schließen', onclick: shut }, glyph('close', 'fu-glyph-sm'))]), body]));
    d.addEventListener('close', gone);
    d.addEventListener('click', function (ev) { if (ev.target === d) shut(); });
    main.append(d); document.documentElement.classList.add('fu-locked'); // in .fu: Tokens und Bausteine gelten auch im Dialog
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    d.shut = shut; return d;
  }
  var SUGGEST = ['revenue', 'net_income', 'free_cash_flow', 'operating_margin', 'pe', 'market_cap', 'roic', 'operating_cash_flow'];
  /* Kennzahl fuer den Verlauf waehlen: Suche, Kategorien, Vorschlaege; nicht vergleichbare Kennzahlen mit Grund. */
  function pickMetric(co, taken, period, why, onPick) {
    var b = co.book, q = '', cat = '', d = null, list = el('div', { class: 'fu-pick-list' });
    var input = el('input', { class: 'fu-input fu-input-sm', type: 'search', enterkeyhint: 'search', placeholder: 'Kennzahl suchen – z. B. „Cashflow“', 'aria-label': 'Kennzahl suchen', autocomplete: 'off', oninput: function () { q = input.value.trim().toLowerCase(); paint(); } });
    var chips = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Kategorie' }, [['', 'Alle']].concat(C.CATS.map(function (c) { return [c.id, c.label]; })).map(function (c) {
      return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(c[0] === cat), 'data-cat': c[0], onclick: function () { cat = c[0]; [].forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', String(x.dataset.cat === cat)); }); paint(); } }, c[1]);
    }));
    var catOf = function (def) { return C.CATS.filter(function (k) { return k.id === def.cat; })[0] || {}; };
    function pick(id) { d.shut(); onPick(id); }
    function row(x) {
      var def = x.def, a = x.a;
      return el('li', {}, el('button', { type: 'button', class: 'fu-crow fu-pick-row', disabled: a.ok ? null : true, onclick: function () { pick(def.id); } }, [
        el('span', { class: 'fu-crow-ico', 'data-cat': def.cat }, glyph(catOf(def).icon)),
        el('span', { class: 'fu-crow-l' }, [el('b', { text: def.label }), el('small', { text: a.ok ? K.unitOf(def).label + (def.snap ? ' · nach jedem Jahresbericht' : period === 'quarterly' ? ' · quartalsweise' : ' · je Geschäftsjahr') : why(a.reason) })]),
        a.ok ? spark(a.rows) : el('span', { class: 'fu-spark is-empty', 'aria-hidden': 'true' }), a.ok ? glyph('plus', 'fu-glyph-sm') : el('span')]));
    }
    function paint() {
      var all = C.METRICS.filter(function (m) { return taken.indexOf(m.id) < 0; }).map(function (m) { return { def: m, a: K.availability(b, m, period) }; });
      var match = function (x) { return (!cat || x.def.cat === cat) && (!q || (x.def.label + ' ' + x.def.desc + ' ' + x.def.id).toLowerCase().indexOf(q) >= 0); };
      var have = all.filter(function (x) { return x.a.ok && match(x); }), off = all.filter(function (x) { return !x.a.ok && match(x); });
      var sug = !q && !cat ? SUGGEST.map(function (id) { return all.filter(function (x) { return x.def.id === id && x.a.ok; })[0]; }).filter(Boolean).slice(0, 6) : [];
      var groups = C.CATS.filter(function (c) { return !cat || c.id === cat; }).map(function (c) {
        var items = have.filter(function (x) { return x.def.cat === c.id; });
        return items.length ? el('section', {}, [el('h3', { class: 'fu-h3', text: c.label }), el('ul', { class: 'fu-crows' }, items.map(row))]) : null;
      }).filter(Boolean);
      put(list, sug.length ? el('div', { class: 'fu-pick-sug' }, [el('h3', { class: 'fu-h3', text: 'Häufig verglichen' }), el('div', { class: 'fu-chips' }, sug.map(function (x) { return el('button', { type: 'button', class: 'fu-chip', onclick: function () { pick(x.def.id); } }, [glyph('plus', 'fu-glyph-sm'), x.def.label]); }))]) : null,
        groups.length ? groups : notice('Keine vergleichbare Kennzahl gefunden.', q ? 'Anderen Begriff versuchen.' : null),
        off.length ? more('Nicht vergleichbar (' + off.length + ')', [el('ul', { class: 'fu-crows' }, off.map(row)), el('p', { text: 'Ohne mindestens zwei Werte in dieser Zeitraum-Art oder ohne geprüften Verlauf wird eine Kennzahl nicht in den Verlauf aufgenommen. Es wird nichts geschätzt.' })]) : null);
    }
    paint();
    d = sheet('Kennzahl hinzufügen', el('div', { class: 'fu-pick' }, [el('p', { class: 'fu-note', text: period === 'quarterly' ? 'Quartalsweise: eigenständige Quartale. Bewertung gibt es nur nach Jahresberichten.' : 'Je Geschäftsjahr; Bewertung zum Kurs nach dem Jahresbericht.' }),
      el('div', { class: 'fu-search fu-search-sm' }, [glyph('search', 'fu-search-ico'), input]), chips, list]), 'fu-sheet-pick');
    d.repaint = paint; return d;
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

  /* ------------------------------------------------------------ Redesign 2027: gemeinsame Bausteine (assets/vu-ui.js) */
  var UI = global.VUUI;
  function frag(html) { var t = document.createElement('template'); t.innerHTML = html; return t.content; }
  /* Betraege in US-Dollar wie die SEC-Quelle, ueber den Currency Layer (quant/engines/fx/money-format.js). */
  function usd(v, digits) {
    var F = global.VUFx && global.VUFx.Format;
    if (!isNum(v)) return '–';
    if (!F) return C.money(v, 'USD');
    var a = Math.abs(v), d = digits != null ? digits : a >= 1e12 ? 2 : a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2;
    return F.formatCompact(v, 'USD', { numberLocale: 'de-DE', decimals: d, trimZeros: true });
  }
  function usdPlain(v, d) { var F = global.VUFx && global.VUFx.Format; return F && isNum(v) ? F.formatPrice(v, 'USD', { numberLocale: 'de-DE', decimals: d }) : C.fmt({ kind: 'perShare' }, v, 'USD'); }
  function moneyOr(def, v, cu) { return def && def.kind === 'money' && (cu || 'USD') === 'USD' ? usd(v) : C.fmt(def, v, cu); }
  function intro(title, lead, eyebrow) {
    return el('header', { class: 'fu-intro' }, [eyebrow === false ? null : el('p', { class: 'vu-ltag', text: eyebrow || 'Fundamental' }), el('h1', { class: 'vu-lt', text: title }), lead ? el('p', { class: 'vu-lead', text: lead }) : null]);
  }
  function sectEl(title, hrefTo, link) { return frag(UI.sect(title, hrefTo ? { href: hrefTo, link: link } : {})); }
  function helpEl(text) { return frag(UI.help(text)); }
  function verdictEl(kind, text) { return frag(UI.verdict(kind, text)); }
  function qEl(text, label) { return frag(UI.q(text, label)); }
  function hudGlyph(name) { return el('span', { class: 'vu-hud', style: '--vu-hud:42px' }, glyph(name, 'fu-hud-g')); }
  function navEl(to, icon, title, sub, cls) {
    return el('a', { class: 'vu-navcard' + (cls ? ' ' + cls : ''), href: to }, [icon, el('span', { class: 'vu-navcard__text' }, [el('b', { text: title }), sub ? el('span', { text: sub }) : null]), glyph('chevron', 'vu-navcard__go')]);
  }
  /* Plus = neongruene Pille, Minus = schwarze Pille (Regel 3). */
  function signPill(text, v) { return el('span', { class: 'vu-chg' + (v < 0 ? ' vu-chg--down' : v === 0 ? ' vu-chg--flat' : '') }, [el('span', { 'aria-hidden': 'true', text: v < 0 ? '▼' : v > 0 ? '▲' : '◆' }), ' ' + text]); }
  /* C18 Leerer Zustand mit Urteil „Keine Aussage“ und naechstem Schritt. */
  function emptyState(o) {
    return el('div', { class: 'vu-box fu-empty', 'data-fu-empty': o.id || '' }, [el('div', {}, verdictEl('none', o.verdict || 'Keine Aussage')),
      el('h2', { class: 'vu-mt fu-empty-t', text: o.title }), o.text ? el('p', { class: 'vu-mu vu-sm', text: o.text }) : null,
      o.next ? el('div', {}, [el('p', { class: 'vu-ltag fu-empty-next', text: 'Was weiter geht' }), el('ul', { class: 'fu-checks' }, o.next.map(function (n) { return el('li', {}, el('a', { href: n[0] }, [glyph('check', 'fu-glyph-sm'), n[1]])); }))]) : null,
      o.actions ? el('div', { class: 'fu-empty-act' }, o.actions) : null]);
  }
  function reloadBtn(fn) { return el('button', { type: 'button', class: 'vu-btn vu-btn--sm', onclick: fn }, 'Neu laden'); }
  function foot(asOf) {
    return el('p', { class: 'fu-foot' }, [glyph('source', 'fu-glyph-sm'), 'Zahlen aus den Pflichtmeldungen an die SEC' + (asOf ? ' · Stand ' + M.dateDe(String(asOf).slice(0, 10)) : '') + ' · keine Empfehlung']);
  }
  function quickChips(list) {
    return el('div', { class: 'vu-chips fu-quick', role: 'list', 'aria-label': 'Schnellwahl' }, list.map(function (t) { return el('a', { class: 'vu-chip', role: 'listitem', href: '#/' + t }, t); }));
  }
  /* Das Geschaeft in einem Satz: Stufen der Discover-Fundamentaldaten (fundamentals.health, Wachstum und Profitabilitaet).
   * Regel: das Urteil ist die schwaechere der beiden Stufen; keine eigene Bewertung. */
  var GRADE_KIND = { 'Sehr stark': 'strong', 'Stark': 'strong', 'Sehr solide': 'strong', 'Solide': 'mid', 'Flach': 'mid', 'Knapp': 'mid', 'Belastet': 'mid', 'Rückläufig': 'weak', 'Negativ': 'weak', 'Angespannt': 'weak' };
  var GROW_TXT = { 'Sehr stark': 'Wächst stark', 'Stark': 'Wächst', 'Solide': 'Wächst langsam', 'Flach': 'Wächst kaum', 'Rückläufig': 'Schrumpft' };
  var PROF_TXT = { 'Sehr stark': 'verdient sehr gut', 'Stark': 'verdient gut', 'Solide': 'verdient solide', 'Knapp': 'verdient knapp', 'Negativ': 'macht Verlust' };
  var BUSINESS_RULE = 'Urteil aus zwei Stufen der SEC-Zahlen: Umsatzwachstum pro Jahr über bis zu 10 Jahre und Nettomarge im letzten Geschäftsjahr. Es zählt die schwächere Stufe. Keine Empfehlung.';
  function business(raw) {
    var h = raw && raw.fundamentals && raw.fundamentals.health;
    if (!h || !h.available || !Array.isArray(h.categories)) return null;
    var by = {}; h.categories.forEach(function (c) { if (c && c.id) by[c.id] = c; });
    var g = by.growth, p = by.profitability;
    if (!g || !p || !GROW_TXT[g.grade] || !PROF_TXT[p.grade]) return null;
    var rank = { strong: 2, mid: 1, weak: 0 }, kg = GRADE_KIND[g.grade], kp = GRADE_KIND[p.grade], worse = rank[kg] <= rank[kp] ? g : p;
    return { text: GROW_TXT[g.grade] + ' und ' + PROF_TXT[p.grade], kind: GRADE_KIND[worse.grade], label: worse.grade };
  }
  function ttmGrowth(raw) { var z = raw && raw.geschaeftszahlen; return z && z.status === 'CALCULATED' && isNum(z.umsatzWachstum) ? z.umsatzWachstum : null; }
  /* Zuletzt angesehen (nur in diesem Browser, Bequemlichkeit). */
  var RECENT_KEY = 'vu-fundamental-recent-v1';
  function recent() { try { var a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && M.validTicker(x.t); }).slice(0, 5) : []; } catch (e) { return []; } }
  function remember(t, name) { try { var a = recent().filter(function (x) { return x.t !== t; }); a.unshift({ t: t, n: name }); localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 5))); } catch (e) { /* ohne Speicher keine Liste */ } }

  /* ------------------------------------------------------------ F01 Start */
  var QUICK = ['NVDA', 'AAPL', 'MSFT', 'PLTR'];
  var LESSON = [['Umsatz', 'Was die Firma verkauft.'], ['Nettogewinn', 'Was nach allen Kosten und Steuern bleibt.'], ['Free Cashflow', 'Echtes Geld, das nach Investitionen übrig ist.'], ['KGV', 'Wie viele Jahresgewinne du beim Kauf bezahlst.']];
  var RANK_ICON = { bewertung: 'valuation', profitabel: 'margin', wachstum: 'growth', cashflow: 'cash', margen: 'income', bilanz: 'balance' };
  var HOME_LABELS = { 'profitables-wachstum': 'Profitables Wachstum', 'langfristige-compounder': 'Compounder', 'cashflow-maschinen': 'Cashflow-Maschinen',
    'qualitaet-zum-preis': 'Qualität zum Preis', 'starke-bilanz-wachstum': 'Starke Bilanz + Wachstum', 'margen-werden-staerker': 'Margen werden stärker' };
  function rankNav(def, withSize) { return navEl('#/rangliste/' + def.id, hudGlyph(RANK_ICON[def.id]), def.title, def.sub + (withSize ? ' · ' + C.SIZES[1].label : ''), 'fu-rnav'); }
  /* Fehlerzustand der Ranglisten (Vergleichsdaten aller US-Aktien fehlen). */
  function rankDown(retry) {
    return emptyState({ id: 'ranking', verdict: 'Gerade keine Daten', title: 'Ranglisten laden gerade nicht.', text: 'Die Vergleichsdaten aller US-Aktien fehlen. Wir zeigen nichts Halbes.',
      next: [['#/suche', 'Jede Firma einzeln (Suche)'], ['#/methodik', 'Methodik und Erklärungen'], ['#/ranglisten/auswahlen', 'Auswahlen aus Discover']],
      actions: [reloadBtn(retry), el('a', { class: 'vu-btn vu-btn--sm vu-btn--line', href: '/status/' }, 'Status')] });
  }
  function homeView() {
    setTitle(null); main.setAttribute('data-view', 'home');
    var example = el('div', { class: 'fu-example-wrap' }, skel(280)), rankState = el('div', { class: 'fu-rank-state' }), years = el('div', { class: 'fu-tilebox' }), footer = el('div');
    put(years, frag(UI.tile('Verlauf', '…', 'Geschäftsjahre')));
    put(main, intro('Wie gut ist das Geschäft?', 'Umsatz, Gewinn und Cashflow von US-Firmen. Direkt aus den Pflichtmeldungen an die US-Börsenaufsicht.'),
      el('div', { class: 'fu-searchwrap' }, searchBox({ placeholder: 'Firma oder Kürzel, z. B. NVIDIA' })), quickChips(QUICK),
      sectEl('Beispiel: NVIDIA in 4 Zahlen', '#/NVDA', 'Öffnen'), example,
      sectEl('Ranglisten', '#/ranglisten', 'Alle ' + C.RANKINGS.length), el('div', { class: 'vu-stack' }, C.RANKINGS.slice(0, 3).map(function (d) { return rankNav(d, true); })), rankState,
      sectEl('Zahlen lesen in 30 Sekunden'),
      el('ol', { class: 'vu-box fu-lesson' }, LESSON.map(function (x, i) { return el('li', {}, [el('span', { class: 'vu-hud fu-lesson-n', text: String(i + 1) }), el('span', {}, [el('b', { text: x[0] }), el('small', { text: x[1] })])]); })),
      sectEl('Branchen'), navEl('#/branchen', hudGlyph('balance'), 'Branchen im Vergleich', 'Nettomarge je Branche (Median)'),
      sectEl('Auswahlen aus Discover'),
      el('div', { class: 'fu-wrapchips' }, M.HOME_ROWS.slice(0, 3).map(function (id, i) { return el('a', { class: 'vu-chip' + (i ? '' : ' vu-chip--lime'), href: '#/ranglisten/auswahlen/' + id }, HOME_LABELS[id] || id); })),
      el('div', { class: 'vu-grid fu-tiles3', style: '--vu-cols:3' }, [frag(UI.tile('Kennzahlen', String(C.METRICS.length), 'im Katalog')), years, frag(UI.tile('Quelle', 'SEC', 'EDGAR'))]),
      footer);
    done();
    put(footer, foot(null));
    loadCompany('NVDA').then(function (co) {
      if (main.getAttribute('data-view') !== 'home') return;
      put(example, exampleCard(co));
      var ys = (co.book && co.book.years) || [];
      if (ys.length) put(years, frag(UI.tile('Verlauf', ys.length + ' J.', 'bis GJ ' + ys[ys.length - 1])));
      put(footer, foot(co.raw && co.raw.fundamentals && co.raw.fundamentals.asOf));
    }).catch(function () { put(example, emptyState({ id: 'example', title: 'Das Beispiel lädt gerade nicht.', text: 'Die Zahlen von NVIDIA konnten nicht geladen werden.', actions: [el('a', { class: 'vu-btn vu-btn--sm vu-btn--line', href: '#/NVDA' }, 'NVIDIA öffnen')] })); put(years, frag(UI.tile('Verlauf', '–', 'Geschäftsjahre'))); });
    function probe() { put(rankState); loadUniverse().catch(function () { if (main.getAttribute('data-view') === 'home') put(rankState, rankDown(probe)); }); }
    probe();
  }
  /* Beispielkarte: Urteil, Umsatz je Geschaeftsjahr (10 Saeulen), vier Zahlen. Alles aus den echten Daten der Firma. */
  function exampleCard(co) {
    var b = co.book, rev = C.seriesOf(b, C.BY_ID.revenue, 'annual').filter(function (x) { return isNum(x.v); }).slice(-10);
    var last = function (id) { var h = C.seriesOf(b, C.BY_ID[id], 'annual').filter(function (x) { return isNum(x.v); }); return h[h.length - 1] || null; };
    var r = last('revenue'), ni = last('net_income'), fcf = last('free_cash_flow'), bz = business(co.raw);
    var first = C.seriesOf(b, C.BY_ID.revenue, 'annual').filter(function (x) { return isNum(x.v) && r && x.fy >= r.fy - 10; })[0];
    var g = first && r && r.fy > first.fy ? C.cagr(b, C.BY_ID.revenue, r.fy - first.fy) : null;
    var nums = [['Umsatz', r ? usd(r.v) : '–'], ['Gewinn', ni ? usd(ni.v) : '–'], ['Free Cashflow', fcf ? usd(fcf.v) : '–'], ['Wachstum p. a.', g && isNum(g.rate) ? C.fmt({ kind: 'growth' }, g.rate) : '–']];
    return el('a', { class: 'vu-box vu-box--line fu-example', href: '#/' + co.t }, [
      el('div', { class: 'fu-example-head' }, [frag(UI.logo(co.t)), el('div', {}, [el('b', { text: co.name }), el('small', { text: r ? 'Geschäftsjahr ' + r.fy : 'Geschäftsjahr' })]), bz ? verdictEl(bz.kind, bz.label) : verdictEl('none')]),
      rev.length > 1 ? frag(UI.bars(rev.map(function (x) { return [String(x.fy), x.v]; }), { width: 318, height: 70, label: 'Umsatz je Geschäftsjahr' })) : null,
      el('dl', { class: 'fu-example-nums' }, nums.map(function (x) { return el('div', {}, [el('dt', { text: x[0] }), el('dd', { class: 'vu-num', text: x[1] })]); })),
      el('p', { class: 'vu-xs vu-mu', text: (rev.length ? 'Umsatz je GJ ' + rev[0].fy + '–' + rev[rev.length - 1].fy : 'Umsatz je GJ') + (first && r ? ' · Wachstum: GJ ' + first.fy + ' → ' + r.fy + ' pro Jahr' : '') })]);
  }

  /* ------------------------------------------------------------ F02 Ranglisten (Reiter Ranglisten · Auswahlen) */
  function listsView(r) {
    var tab = r.tab === 'auswahlen' ? 'auswahlen' : 'ranglisten';
    setTitle(tab === 'auswahlen' ? 'Auswahlen' : 'Ranglisten'); main.setAttribute('data-view', 'lists');
    var segs = frag(UI.seg([{ id: 'ranglisten', label: 'Ranglisten', href: '#/ranglisten' }, { id: 'auswahlen', label: 'Auswahlen', href: '#/ranglisten/auswahlen' }], tab, { label: 'Ansicht' }));
    if (tab === 'ranglisten') {
      var st = el('div', { class: 'fu-rank-state' });
      put(main, intro('Ranglisten', 'Ranglisten sortieren eine Kennzahl. Die Regel steht dabei.', false), segs,
        el('div', { class: 'vu-stack fu-gap' }, C.RANKINGS.map(function (d) { return rankNav(d, false); })),
        el('p', { class: 'vu-xs vu-mu fu-gap', text: 'Größe wählbar: ' + C.SIZES.map(function (s) { return s.label; }).join(' · ') + ' Börsenwert. Keine Empfehlung.' }), st, foot(null));
      done();
      var probe = function () { put(st); loadUniverse().catch(function () { if (main.getAttribute('data-view') === 'lists') put(st, rankDown(probe)); }); };
      probe();
      return;
    }
    var rows = M.HOME_ROWS, id = rows.indexOf(r.row) >= 0 ? r.row : rows[0];
    var holder = el('div', { class: 'fu-sel', 'aria-live': 'polite' }, skel(300)), what = el('p', { class: 'vu-sm fu-sel-what' }), footer = el('div');
    put(main, intro('Auswahlen', 'Firmen, die in Zahlen auffallen. Jede Karte führt zur Firma.', false), segs,
      el('div', { class: 'vu-chips fu-gap', role: 'list', 'aria-label': 'Auswahl' }, rows.map(function (x) { return el('a', { class: 'vu-chip', role: 'listitem', href: '#/ranglisten/auswahlen/' + x, 'aria-current': x === id ? 'page' : null }, HOME_LABELS[x] || x); })),
      what, el('div', { class: 'fu-gap-s' }, helpEl('Wachstum pro Jahr (3 J): um wie viel Prozent der Umsatz im Schnitt jedes Jahr gestiegen ist.')), holder, footer);
    done();
    var on = main.querySelector('.vu-chips [aria-current=page]'); if (on && on.parentNode.scrollWidth > on.parentNode.clientWidth) on.parentNode.scrollLeft = Math.max(0, on.offsetLeft - 16);
    loadRow(M.ROWS_BASE + id + '.json').then(function (row) {
      var x = M.homeRow(row);
      if (!x) throw new Error('INVALID_ROW');
      put(what, el('b', { text: (HOME_LABELS[id] || x.title) + ': ' }), x.subtitle || '');
      put(footer, foot(x.asOf));
      if (!x.tiles.length) { put(holder, emptyState({ id: 'selection', title: 'Gerade erfüllt keine Firma diese Regel.', text: x.rule || null })); return; }
      var more = x.tiles.slice(5), rest = el('div', { class: 'vu-stack', hidden: true }, more.map(firmCard));
      put(holder, el('div', { class: 'vu-stack' }, x.tiles.slice(0, 5).map(firmCard)), rest,
        more.length ? el('button', { type: 'button', class: 'vu-btn vu-btn--line vu-btn--block fu-gap', onclick: function (ev) { rest.hidden = false; ev.currentTarget.remove(); } }, 'Alle Firmen der Auswahl (' + x.tiles.length + ')') : null,
        el('div', { class: 'fu-gap' }, helpEl('Nettomarge: wie viel von 100 Dollar Umsatz als Gewinn bleibt.')),
        x.rule ? el('div', { class: 'vu-box vu-box--line fu-gap' }, [el('p', { class: 'vu-ltag', text: 'Regel dieser Auswahl' }), el('p', { class: 'vu-sm', text: x.rule }),
          el('p', { class: 'vu-xs vu-mu', text: 'Discover-Auswahl · ' + (x.matched ? x.matched.toLocaleString('de-DE') + ' Firmen erfüllen die Regel · ' : '') + 'Stand ' + M.dateDe(x.asOf) + ' · Balken 0–50 %' })]) : null);
    }).catch(function () { put(holder, emptyState({ id: 'selection', title: 'Die Auswahl lädt gerade nicht.', text: 'Die Discover-Auswahl konnte nicht geladen werden.', actions: [reloadBtn(function () { render(); })] })); });
  }
  /* Fundamental-Muster: Firmenkarte mit drei Balken (Wachstum neongruen, Nettomarge, Free-Cashflow-Marge; Skala 0–50 %). */
  var TILE_CAP = 0.5;
  function fbar(label, v, odd, lime) {
    var w = isNum(v) ? Math.max(0, Math.min(1, v / TILE_CAP)) * 100 : 0;
    return el('div', { class: 'fu-fbar' }, [el('div', { class: 'fu-fbar-h' }, [el('span', { text: label }), el('b', { class: 'vu-num', text: isNum(v) ? M.pct(v) : odd ? 'nicht plausibel' : 'keine Angabe' })]), frag(UI.meter(w, { lime: lime, label: label }))]);
  }
  function firmCard(t) {
    var sub = 'Umsatz ' + usd(t.revenue) + (t.pe != null ? ' · KGV ' + M.multiple(t.pe) : '');
    return el('a', { class: 'vu-box fu-firm', href: '#/' + encodeURIComponent(t.ticker) }, [
      el('div', { class: 'fu-firm-head' }, [frag(UI.logo(t.ticker)), el('div', {}, [el('b', { text: t.name || t.ticker }), el('small', { text: sub })]), glyph('chevron', 'fu-glyph-sm')]),
      fbar('Wachstum pro Jahr (3 J)', t.growth3, false, true), fbar('Nettomarge', t.netMargin, t.implausible.netMargin), fbar('Free-Cashflow-Marge', t.fcfMargin, t.implausible.fcfMargin)]);
  }

  /* ------------------------------------------------------------ Branchen (Leistenplatz) */
  function branchesView() {
    setTitle('Branchen'); main.setAttribute('data-view', 'branches');
    var body = el('div', { class: 'fu-gap' }, skel(320));
    put(main, intro('Branchen im Vergleich', 'Wie viel verdienen Firmen je Branche? Median der Nettomarge je SEC-Branche.', false), body, foot(null));
    done();
    function go() {
      put(body, skel(320));
      loadUniverse().then(function (U) {
        var list = C.industries(U, 5);
        put(body, list.length ? industryRows(U, list) : emptyState({ id: 'industries', title: 'Keine Branche mit genug Firmen.' }), el('p', { class: 'vu-xs vu-mu fu-gap', text: 'Branchen mit mindestens 5 Firmen mit Börsenwert, nach Gesamtwert sortiert. Keine Wertung.' }));
      }).catch(function () { put(body, emptyState({ id: 'industries', verdict: 'Gerade keine Daten', title: 'Branchen laden gerade nicht.', text: 'Die Vergleichsdaten aller US-Aktien fehlen. Wir zeigen nichts Halbes.', actions: [reloadBtn(go), el('a', { class: 'vu-btn vu-btn--sm vu-btn--line', href: '/status/' }, 'Status')] })); });
    }
    go();
  }
  function industryRows(U, list) {
    var maxM = Math.max.apply(null, list.map(function (i) { return Math.abs(i.netMargin || 0); }).concat([0.01]));
    return el('ul', { class: 'fu-ind' }, list.map(function (i) {
      return el('li', {}, el('a', { href: '#/branche/' + i.id }, [
        el('span', { class: 'fu-ind-name' }, [el('b', { text: i.label }), el('small', { text: i.count + ' Firmen · ' + i.top.join(', ') })]),
        el('span', { class: 'fu-ind-m' }, [el('span', { class: 'fu-minibar', 'aria-hidden': 'true' }, el('i', { class: i.netMargin < 0 ? 'is-neg' : '', style: 'width:' + Math.max(3, Math.abs(i.netMargin || 0) / maxM * 100).toFixed(0) + '%' })),
          el('em', { class: 'fu-num', text: isNum(i.netMargin) ? C.fmt({ kind: 'ratio' }, i.netMargin) : '–' })]),
        glyph('chevron', 'fu-glyph-sm')
      ]));
    }));
  }

  /* ------------------------------------------------------------ F04 Suche (Vollbild) */
  function searchView() {
    setTitle('Suche'); main.setAttribute('data-view', 'search');
    var input = el('input', { id: 'fu-q', class: 'fu-bigq-in', type: 'search', enterkeyhint: 'search', placeholder: 'Firma, Kürzel oder Kennzahl', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Firma, Kürzel oder Kennzahl suchen' });
    var out = el('div', { class: 'fu-sres', 'aria-live': 'polite' }), tok = 0, firstHit = null;
    var cancel = el('a', { class: 'fu-bigq-x', href: '#/', onclick: function (ev) { if (history.length > 1 && document.referrer.indexOf(location.host) >= 0) { ev.preventDefault(); history.back(); } } }, 'Abbrechen');
    function idle() {
      var rc = recent();
      return [rc.length ? el('p', { class: 'vu-ltag fu-gap', text: 'Zuletzt angesehen' }) : null,
        rc.length ? el('div', { class: 'vu-box fu-rows' }, rc.map(function (x) { return frag(UI.stockRow({ ticker: x.t, name: x.n || x.t, sub: x.t + ' · Zahlen', href: '#/' + x.t, noPrice: true })); })) : null,
        el('p', { class: 'vu-ltag fu-gap', text: 'Schnellwahl' }), el('div', { class: 'fu-wrapchips' }, EXAMPLES.map(function (e) { return el('a', { class: 'vu-chip', href: '#/' + e[0] }, e[0]); }))];
    }
    function paint() {
      var q = input.value.trim(), my = ++tok; firstHit = null;
      if (!q) { put(out, idle()); return; }
      var ql = q.toLowerCase(), mets = C.METRICS.filter(function (m) { return (m.label + ' ' + m.id.replace(/_/g, ' ')).toLowerCase().indexOf(ql) >= 0; }).slice(0, 3);
      loadSearch().then(function (entries) {
        if (my !== tok) return;
        var hits = M.search(entries, q, 6); firstHit = hits[0] || null;
        if (!hits.length && !mets.length) {
          put(out, emptyState({ id: 'search', verdict: 'Kein Treffer', title: '„' + q + '“: keine US-Firma mit SEC-Meldungen', text: 'Fundamental zeigt US-Firmen mit Pflichtmeldungen an die SEC. Kurse und Chart findest du trotzdem.', actions: [el('a', { class: 'vu-btn vu-btn--sm vu-btn--line', href: '/discover/#/suche' }, 'In Discover suchen')] }),
            el('p', { class: 'vu-ltag fu-gap', text: 'Probier' }), el('div', { class: 'vu-box fu-rows' }, EXAMPLES.slice(0, 3).map(function (e) { return frag(UI.stockRow({ ticker: e[0], name: e[1], sub: e[0], href: '#/' + e[0], noPrice: true })); })));
          return;
        }
        var rows = hits.map(function (h) {
          var node = frag(UI.stockRow({ ticker: h.ticker, name: h.name || h.ticker, sub: h.ticker + ' · Zahlen', href: '#/' + encodeURIComponent(h.ticker), noPrice: true })).firstChild;
          // eine Zahl je Treffer: Umsatz der letzten 12 Monate aus der Discover-Aktiendatei
          loadRow(M.stockPath(h.ticker)).then(function (raw) { var z = raw && raw.geschaeftszahlen; if (z && z.status === 'CALCULATED' && isNum(z.umsatzTTM) && z.einheit === 'usd_m') node.querySelector('.vu-lrow__name span').textContent = h.ticker + ' · Umsatz ' + usd(z.umsatzTTM * 1e6) + ' (12 M)'; }).catch(function () {});
          return node;
        });
        put(out, hits.length ? [el('p', { class: 'vu-ltag fu-gap', text: 'Firmen' }), el('div', { class: 'vu-box fu-rows' }, rows)] : null,
          mets.length ? [el('p', { class: 'vu-ltag fu-gap', text: 'Kennzahlen' }), el('div', { class: 'vu-stack' }, mets.map(function (m) { return navEl('#/methodik?k=' + m.id, hudGlyph('info'), 'Was heißt „' + m.label + '“?', 'Erklärung in der Methodik'); }))] : null);
      }).catch(function () { if (my === tok) put(out, emptyState({ id: 'search', title: 'Suche gerade nicht verfügbar.', text: 'Das Verzeichnis der US-Aktien konnte nicht geladen werden.', actions: [reloadBtn(paint)] })); });
    }
    input.addEventListener('input', paint);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); var t = firstHit ? firstHit.ticker : M.normTicker(input.value); if (M.validTicker(t)) location.hash = '#/' + encodeURIComponent(t); }
      else if (ev.key === 'Escape') location.hash = '#/';
    });
    put(main, el('form', { class: 'fu-bigq', role: 'search', onsubmit: function (e) { e.preventDefault(); } }, [glyph('search', 'fu-glyph'), input, cancel]), out);
    paint(); done();
  }

  /* ------------------------------------------------------------ F03 Rangliste */
  var RANK_Q = { bewertung: 'Welche Firmen kosten im Verhältnis zum Gewinn am wenigsten?', profitabel: 'Welche Firmen holen aus ihrem Kapital am meisten Gewinn?',
    wachstum: 'Wessen Umsatz ist in 3 Jahren am stärksten gewachsen?', cashflow: 'Wer erzeugt im Verhältnis zum Börsenwert am meisten freies Geld?',
    margen: 'Wer behält von jedem Umsatz am meisten als Gewinn?', bilanz: 'Wer hat am meisten Geld übrig, wenn alle Schulden bezahlt sind?' };
  var RANK_SHORT = { bewertung: 'Bewertung', profitabel: 'Profitabel', wachstum: 'Wachstum', cashflow: 'Cashflow', margen: 'Margen', bilanz: 'Bilanz' };
  function rankValue(def, v) { return def.kind === 'money' ? usd(v) : C.fmt({ kind: def.kind }, v, 'USD'); }
  function rankingView(id, size) {
    var def = C.RANKINGS.filter(function (r) { return r.id === id; })[0];
    if (!def) return listsView({});
    setTitle(def.title); main.setAttribute('data-view', 'ranking');
    var body = el('div', { class: 'fu-gap' }, skel(400)), chosen = size || '10';
    var sizes = el('div', { class: 'vu-seg fu-gap', role: 'group', 'aria-label': 'Börsenwert' }, C.SIZES.map(function (s) {
      return el('button', { type: 'button', 'aria-pressed': String(s.id === chosen), onclick: function () { chosen = s.id; [].forEach.call(sizes.children, function (b, k) { b.setAttribute('aria-pressed', String(C.SIZES[k].id === chosen)); }); paint(); } }, s.label);
    }));
    var others = el('div', { class: 'vu-chips fu-gap', role: 'list', 'aria-label': 'Weitere Ranglisten' }, C.RANKINGS.map(function (r) { return el('a', { class: 'vu-chip', role: 'listitem', href: '#/rangliste/' + r.id, 'aria-current': r.id === id ? 'page' : null }, RANK_SHORT[r.id] || r.title); }));
    var rule = el('div', { class: 'vu-box vu-box--line fu-rule fu-gap' }, [el('p', { class: 'vu-ltag', text: 'Regel dieser Liste' }), el('p', { class: 'vu-sm', text: def.sub + ', ' + (def.dir === 'asc' ? 'aufsteigend' : 'absteigend') + '. ' + def.rule + '. Nur Aktien mit geprüftem Börsenwert; Werte wie im Screener (letzte zwölf Monate bzw. letztes Geschäftsjahr).' })]);
    put(main, backLink('#/ranglisten', 'Ranglisten'), intro(def.title, RANK_Q[def.id] || def.sub, false), others, sizes, rule, body,
      el('div', { class: 'fu-gap' }, helpEl('Eine Rangliste sortiert nur eine Zahl. Sie sagt nicht, ob die Aktie gut oder günstig ist.')), foot(null));
    done();
    var on = others.querySelector('[aria-current=page]'); if (on && others.scrollWidth > others.clientWidth) others.scrollLeft = Math.max(0, on.offsetLeft - 16);
    function row(x, i) {
      return el('li', {}, el('a', { href: '#/' + encodeURIComponent(x.s) }, [el('span', { class: 'fu-rk-n vu-num', text: String(i + 1) }), frag(UI.logo(x.s)),
        el('span', { class: 'fu-rk-name' }, [el('b', { text: x.n || x.s }), el('small', { text: x.s + (isNum(x.revenue) ? ' · Umsatz ' + usd(x.revenue) : '') })]),
        el('span', { class: 'vu-verdict vu-verdict--strong vu-num fu-rk-v', text: rankValue(def, x[def.col]) })]));
    }
    function paint() {
      put(body, skel(400));
      loadUniverse().then(function (U) {
        var r = C.ranking(U, id, chosen, 25);
        if (!r || !r.rows.length) { put(body, emptyState({ id: 'ranking', title: 'Keine Firma erfüllt die Regel.', text: 'Bei dieser Größe gibt es gerade keinen Wert. Probier eine andere Größe.' })); return; }
        var rest = el('ol', { class: 'fu-rk', start: '11', hidden: true }, r.rows.slice(10).map(function (x, i) { return row(x, i + 10); }));
        put(body, el('div', { class: 'fu-rk-head' }, [el('h2', { class: 'fu-rk-t', text: 'Platz 1–' + Math.min(10, r.rows.length) }), el('span', { class: 'vu-xs vu-mu', text: r.total.toLocaleString('de-DE') + ' Firmen erfüllen die Regel' })]),
          el('div', { class: 'vu-box fu-rk-box' }, [el('ol', { class: 'fu-rk' }, r.rows.slice(0, 10).map(row)), rest]),
          r.rows.length > 10 ? el('button', { type: 'button', class: 'vu-btn vu-btn--line vu-btn--block fu-gap', onclick: function (ev) { rest.hidden = false; ev.currentTarget.remove(); } }, 'Platz 11–' + r.rows.length + ' zeigen') : null);
      }).catch(function () {
        put(body, emptyState({ id: 'ranking', title: 'Liste gerade leer', text: 'Die Vergleichsdaten aller US-Aktien laden nicht. Wir zeigen keine halbe Rangliste.', actions: [reloadBtn(paint), el('a', { class: 'vu-btn vu-btn--sm vu-btn--line', href: '/status/' }, 'Status')] }));
      });
    }
    paint();
  }

  function home(focus, r) {
    if (focus === 'entdecken') { try { history.replaceState(null, '', '#/ranglisten'); } catch (e) { /* alte Adresse bleibt erreichbar */ } return listsView({}); }
    if (focus === 'ranglisten') return listsView(r || {});
    if (focus === 'branchen') return branchesView();
    if (focus === 'suche') return searchView();
    return homeView();
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
    var body = el('div', {}, skel(400)), head = el('section', { class: 'fu-subhero' }, [backLink('#/branchen', 'Branchen'), skel(36, '60%')]);
    put(main, head, body); done();
    loadUniverse().then(function (U) {
      var label = U.industryLabel(id); setTitle(label);
      var members = U.rows(function (c, i) { return c.sic2[i] === id && (isNum(c.mcap[i]) || isNum(c.revenue[i])); });
      if (!members.length) { put(body, notice('Für diese Branche liegen keine Unternehmen vor.')); return; }
      put(head, backLink('#/branchen', 'Branchen'), el('p', { class: 'vu-eyebrow', text: 'Branche · SIC ' + id }), el('h1', { class: 'fu-h1', text: label }),
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
  var VIEWS = [['', 'Überblick'], ['kennzahlen', 'Kennzahlen'], ['vergleich', 'Branche'], ['finanzen', 'Finanzen']];
  var AREAS = { mehr: 'Weitere Bereiche', dividende: 'Dividende', analysten: 'Analysten', bewertung: 'Bewertung', aktie: 'Aktie & Kapital', unternehmen: 'Unternehmensdaten', quellen: 'Quellen & Downloads' };
  function href(t, sub, extra) { return '#/' + encodeURIComponent(t) + (sub ? '?ansicht=' + sub + (extra || '') : ''); }
  function backLink(h, label) { return el('a', { class: 'fu-back', href: h }, [glyph('back', 'fu-glyph-sm'), label]); }
  /* C14 Reiter der Perspektive „Zahlen“: Ueberblick · Kennzahlen · Branche · Finanzen (Bereiche unter „Mehr“ auf dem Ueberblick). */
  function tabs(t, active) {
    var tabOf = active === 'kennzahl' ? 'kennzahlen' : active;
    return el('nav', { class: 'vu-seg fu-tabs', 'aria-label': 'Fundamental-Ansichten' }, VIEWS.map(function (v) {
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
      // Discover kann "verfuegbar" melden, obwohl kein Geschaeftsjahr vorliegt (z. B. neue CIK nach Umstrukturierung): ehrlicher Leerzustand.
      if (!co.f.available || !co.book || (!co.book.years.length && !co.book.quarters.length)) {
        put(main, stockHead(t, co), el('p', { class: 'vu-empty' }, [el('b', { text: 'Für diese Aktie liegen keine SEC-Geschäftszahlen vor.' }),
          'Typisch für Fonds, ausländische Emittenten ohne US-Jahresbericht oder sehr junge Notierungen.']));
        return done();
      }
      main.setAttribute('data-fu-source', co.book.source);
      var ctx = { snap: C.snapshot(co.raw, null) };
      var views = { '': overview, kennzahlen: catalogView, kennzahl: metricView, vergleich: compareView, finanzen: financeView, mehr: moreView };
      var fn = views[sub] || (AREAS[sub] ? areaView : overview);
      var content = fn(co, r, ctx);
      // Aktienkopf + Perspektive „Zahlen“ + Reiter auf Ueberblick, Kennzahlen, Branche, Finanzen; Bereiche und Kennzahl-Detail mit kompaktem Kopf.
      var tabbed = !sub || sub === 'kennzahlen' || sub === 'vergleich' || sub === 'finanzen' || !views[sub] && !AREAS[sub];
      if (tabbed && sub === 'vergleich') content = content.slice(1);
      // Fehlt die volle SEC-Historie, steht das als ehrlicher Hinweis – kein Warnkasten ueber der ganzen Seite.
      var fallback = co.book.source === 'discover' && co.historyState !== 'NOT_IN_SHARD'
        ? el('p', { class: 'fu-note fu-fallback', role: 'note', 'data-fu-fallback': co.historyState, text: 'Volle SEC-Historie gerade nicht verfügbar' + (co.historyState === 'GZIP_UNSUPPORTED' ? ' (Browser zu alt)' : '') + ': gezeigt wird der Discover-Auszug ohne Quartale und mit weniger Kennzahlen.' }) : null;
      var st = stateNotes(co);
      var nodes = tabbed ? [stockHead(t, co), tabs(t, sub || '')].concat(content, fallback, st) : [content[0], tabs(t, sub), fallback].concat(st, content.slice(1));
      put(main, nodes.filter(Boolean));
      remember(t, co.name);
      var on = main.querySelector('.fu-tabs [aria-current=page]'); if (on && on.parentNode.scrollWidth > on.parentNode.clientWidth) on.parentNode.scrollLeft = Math.max(0, on.offsetLeft - (on.parentNode.clientWidth - on.offsetWidth) / 2);
      done();
      // Bewertung und Vergleich brauchen das Universum; nachladen und Platzhalter fuellen.
      // Vergleichsgruppen brauchen Universum und SIC-4-Index (peers.json); beide laden, dann einmal melden.
      Promise.all([loadUniverse(), loadPeers()]).then(function (res) { co.U = res[0]; co.P = res[1]; ctx.snap = C.snapshot(co.raw, co.U.get(t)); main.dispatchEvent(new CustomEvent('fu-universe', { detail: co.U })); }).catch(function () { main.dispatchEvent(new CustomEvent('fu-universe', { detail: null })); });
    }).catch(function (e) {
      var notFound = e && e.status === 404;
      put(main, el('header', { class: 'fu-chead' }, [backLink('#/', 'Fundamental'), el('h1', { class: 'fu-h1', text: t })]),
        el('p', { class: 'vu-empty' }, [el('b', { text: notFound ? 'Diese Aktie ist nicht im US-Universum.' : 'Die Daten konnten gerade nicht geladen werden.' }),
          notFound ? 'Fundamental zeigt US-Unternehmen mit SEC-Meldungen.' : 'Bitte später erneut versuchen.']),
        notFound ? el('div', { class: 'fu-retry' }, [searchBox(), exampleChips()]) : null);
      done();
    });
  }
  /* Datenstand je Unternehmen: neueste verarbeitete SEC-Meldung und juengster Berichtszeitraum. Liegt bei der SEC schon eine
   * neuere Quartals- oder Jahresmeldung vor (taegliche SEC-Pipeline), steht das sichtbar da – nichts wird als aktuell
   * bezeichnet, was noch nicht verarbeitet ist. Zahlen aus Ergebnismitteilungen (Pressemitteilung, 8-K) werden nicht
   * uebernommen; massgeblich sind die eingereichten 10-Q/10-K. */
  function periodText(st) { return st.quarter ? 'Q' + st.quarter.q + ' GJ ' + st.quarter.fy + ' (bis ' + M.dateDe(st.quarter.end) + ')' : st.year ? 'GJ ' + st.year.fy + ' (bis ' + M.dateDe(st.year.end) + ')' : null; }
  function stateNotes(co) {
    var st = co.book && co.book.state; if (!st || !st.filed) return [];
    var line = el('p', { class: 'fu-note fu-state', 'data-fu-state': st.pending ? 'pending' : 'current' }, ['SEC-Daten: neuester Berichtszeitraum ' + (periodText(st) || '–') + ' · letzte verarbeitete Meldung vom ' + M.dateDe(st.filed)]);
    return [line, st.pending ? el('p', { class: 'vu-alert', role: 'note', 'data-fu-pending': st.pending.accn, text: 'Neuer ' + (/^10-K/.test(st.pending.form) ? 'Jahresbericht' : 'Quartalsbericht') + ' (' + st.pending.form + ') vom ' + M.dateDe(st.pending.filed) + ' liegt bei der SEC vor und ist in den verarbeiteten Daten (Stand ' + M.dateDe(st.asOf) + ') nicht enthalten. Die Werte zeigen ' + (periodText(st) || '–') + '.' }) : null];
  }
  /* Engste verfuegbare Vergleichsgruppe (SIC 4, sonst SIC-Hauptgruppe) – dieselbe fuer Median, Lage und Verlauf. */
  function groupOf(co, U) { return C.defaultGroup(U, co.t, 6, co.P); }
  function groupLabel(g) { return g.by === 'peers' ? 'SIC ' + g.key + (g.label.indexOf(' · ') > 0 ? ' · ' + niceSic(g.label.split(' · ')[1]) : '') : g.label; }
  function niceSic(x) { return String(x || '').toLowerCase().replace(/(^|[\s,(\/-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\bAnd\b/g, 'and').replace(/\b(Nec|Ops)\b/g, function (w) { return w.toUpperCase(); }); }

  /* Wartet auf das Universum (fuer Bewertung/Branche) und zeichnet dann. */
  function withUniverse(co, draw) {
    var box = el('div', { class: 'fu-wait' }, skel(120));
    function go(U) { put(box, [].concat(draw(U) || []).filter(Boolean)); }
    if (co.U) go(co.U);
    else main.addEventListener('fu-universe', function h(e) { main.removeEventListener('fu-universe', h); go(e.detail); });
    return box;
  }

  /* Kennzahl-Kachel der Bereiche (Dividende, Aktie, Bewertung). */
  function kpiTile(co, id, ctx) {
    var def = C.BY_ID[id], c = C.current(co.book, def, ctx), none = !isNum(c.v);
    return el('a', { class: 'fu-k', href: href(co.t, 'kennzahl', '&k=' + id) }, [
      el('span', { class: 'fu-k-l', text: def.label.replace(/ \(.*\)$/, '') + (none ? '' : ' (' + basisText(c) + ')') }),
      el('b', { class: 'fu-k-v fu-num' + (none ? ' is-none' : ''), text: none ? 'keine Angabe' : moneyOr(def, c.v, cur(co)) }),
      c.change ? el('small', { class: 'fu-chg' + dirClass(c.change), text: C.changeText(def, c.change, cur(co)) + ' ggü. Vorjahr' }) : el('small', { class: 'fu-k-s', text: none ? C.reason(c.reason) : def.cat === 'bewertung' ? 'zum Schlusskurs' : '' })
    ]);
  }
  /* ------------------------------------------------------------ F06 Unternehmen: Ueberblick (Perspektive „Zahlen“) */
  /* Fundamental-Muster: Kennzahl-Kachel mit „?“ und einem Satz Alltagssprache. */
  var KTILES = ['market_cap', 'revenue', 'pe', 'ps', 'net_margin', 'free_cash_flow', 'roe', 'roic'];
  var KLABEL = { market_cap: 'Börsenwert', revenue: 'Umsatz', pe: 'KGV', ps: 'KUV', net_margin: 'Nettomarge', free_cash_flow: 'Free Cashflow', roe: 'Eigenkapitalrendite', roic: 'Kapitalrendite' };
  function everyday(id, v, name) {
    switch (id) {
      case 'market_cap': return 'Was die ganze Firma an der Börse kostet.';
      case 'revenue': return 'Alles, was ' + name + ' in einem Jahr verkauft hat.';
      case 'pe': return isNum(v) && v > 0 ? 'Du zahlst ' + usdPlain(v, 2) + ' für ' + usdPlain(1, 0) + ' Jahresgewinn.' : 'Kurs geteilt durch Gewinn je Aktie.';
      case 'ps': return 'Börsenwert geteilt durch Jahresumsatz.';
      case 'net_margin': return isNum(v) && v > 0 && v < 1.5 ? 'Von ' + usdPlain(100, 0) + ' Umsatz bleiben ' + usdPlain(v * 100, 2) + ' Gewinn.' : 'Anteil des Umsatzes, der als Gewinn bleibt.';
      case 'free_cash_flow': return 'Freies Geld nach allen Investitionen.';
      case 'roe': return 'Gewinn auf das Geld der Aktionäre.';
      case 'roic': return 'Gewinn auf das im Geschäft steckende Geld.';
      default: return C.BY_ID[id] ? C.BY_ID[id].desc : '';
    }
  }
  function kTile(co, id, ctx) {
    var def = C.BY_ID[id], c = C.current(co.book, def, ctx), none = !isNum(c.v), cu = cur(co);
    var label = KLABEL[id] + (id === 'revenue' && c.basis === 'TTM' ? ' 12 Monate' : '');
    var sub = none ? C.reason(c.reason) : [basisText(c) === 'aktuell' ? 'zum Schlusskurs' : basisText(c), id === 'roic' ? 'ROIC' : null].filter(Boolean).join(' · ');
    return el('div', { class: 'fu-k fu-ktile' }, [
      el('div', { class: 'fu-ktile-h' }, [el('span', { class: 'fu-k-l', text: label }), qEl(def.desc + (def.formula ? ' Formel: ' + def.formula + '.' : ''), label)]),
      el('a', { class: 'fu-k-v vu-num' + (none ? ' is-none' : ''), href: href(co.t, 'kennzahl', '&k=' + id), text: none ? 'keine Angabe' : moneyOr(def, c.v, cu) }),
      el('small', { class: 'fu-k-s', text: sub }),
      c.change ? el('small', { class: 'fu-chg' + dirClass(c.change), text: (def.kind === 'money' && c.change.absMoney != null ? (c.change.absMoney >= 0 ? '+' : '') + usd(c.change.absMoney) : C.changeText(def, c.change, cu)) + ' ggü. Vorjahr' }) : null,
      el('p', { class: 'fu-ktile-why', text: everyday(id, c.v, co.name) })]);
  }
  var YEAR_SETS = [['revenue', 'Umsatz', 'Umsatz'], ['net_income', 'Gewinn', 'Nettogewinn'], ['free_cash_flow', 'Cashflow', 'Free Cashflow']];
  function yearsBlock(co) {
    var b = co.book, which = 0, head = el('div'), plot = el('div', { class: 'fu-gap-s' }), note = el('p', { class: 'vu-xs vu-mu' });
    var seg = el('div', { class: 'vu-seg', role: 'group', 'aria-label': 'Reihe' }, YEAR_SETS.map(function (x, i) { return el('button', { type: 'button', 'aria-pressed': String(i === which), onclick: function () { which = i; paint(); } }, x[1]); }));
    function paint() {
      [].forEach.call(seg.children, function (x, k) { x.setAttribute('aria-pressed', String(k === which)); });
      var set = YEAR_SETS[which], rows = C.seriesOf(b, C.BY_ID[set[0]], 'annual').slice(-12), have = rows.filter(function (x) { return isNum(x.v); });
      put(head, sectEl((have.length > 1 ? have.length + ' Jahre ' : 'Verlauf ') + set[2], href(co.t, 'finanzen'), 'Finanzen'));
      if (have.length < 2) { put(plot, frag(UI.blank('Für ' + set[2] + ' liegen weniger als zwei Geschäftsjahre vor.'))); put(note); return; }
      put(plot, bars(rows.map(function (x) { return { key: x.key, label: x.label, short: "'" + String(x.fy).slice(2), v: x.v }; }), { def: C.BY_ID[set[0]], currency: cur(co), height: 140 }));
      var last = have[have.length - 1], ni = C.seriesOf(b, C.BY_ID.net_income, 'annual').filter(function (x) { return x.key === last.key && isNum(x.v); })[0];
      put(note, fyNote(b) + ' · GJ ' + last.fy + ': ' + set[2] + ' ' + moneyOr(C.BY_ID[set[0]], last.v, cur(co)) + (set[0] !== 'net_income' && ni ? ', Nettogewinn ' + moneyOr(C.BY_ID.net_income, ni.v, cur(co)) : ''));
    }
    paint();
    return [head, seg, plot, note];
  }
  function overview(co, r, ctx) {
    var b = co.book, f = co.f, t = co.t, bz = business(co.raw), g = ttmGrowth(co.raw);
    var kpis = el('div', { class: 'vu-grid fu-ktiles' }, KTILES.map(function (id) { return kTile(co, id, ctx); }));
    main.addEventListener('fu-universe', function h(e) { main.removeEventListener('fu-universe', h); if (e.detail) put(kpis, KTILES.map(function (id) { return kTile(co, id, ctx); })); });
    var out = [
      bz ? el('div', { class: 'vu-box vu-box--ink fu-verdict' }, [el('div', {}, [el('p', { class: 'vu-ltag', text: 'Das Geschäft' }), el('p', { class: 'fu-verdict-t', text: bz.text }),
        isNum(g) ? el('p', { class: 'vu-xs fu-verdict-s', text: 'Umsatz ' + C.fmt({ kind: 'growth' }, g) + ' in 12 Monaten' }) : null]), el('div', { class: 'fu-verdict-r' }, [verdictEl(bz.kind, bz.label), qEl(BUSINESS_RULE, 'Wie entsteht das Urteil?')])])
        : emptyState({ id: 'business', title: 'Kein Urteil zum Geschäft', text: 'Für ' + co.name + ' fehlen Wachstum oder Marge über mehrere Jahre. Die Zahlen unten gelten trotzdem.' }),
      f.stale && f.stale.stale ? el('p', { class: 'fu-note', role: 'note', text: 'Die Geschäftszahlen sind veraltet: letztes gemeldetes Geschäftsjahr ' + f.latestFiscalYear + '.' }) : null,
      sectEl('Auf einen Blick', href(t, 'kennzahlen'), 'Alle Kennzahlen'), kpis
    ].concat(yearsBlock(co));
    var dev = development(co);
    if (dev) out.push(sectEl('Entwicklung pro Jahr'), dev, el('div', { class: 'fu-gap-s' }, helpEl('p. a. heißt pro Jahr: im Schnitt jedes Jahr so viel mehr. Pp. = Prozentpunkte.')));
    out.push(sectEl('In der Branche', href(t, 'vergleich'), 'Vergleich'), withUniverse(co, function (U) { return U ? branchSummary(co, U) : frag(UI.blank('Vergleichsdaten gerade nicht verfügbar. Wir zeigen nichts Erfundenes.')); }));
    out.push(sectEl('Mehr'), el('div', { class: 'fu-wrapchips' }, [['dividende', 'Dividende'], ['analysten', 'Analysten'], ['bewertung', 'Bewertung im Verlauf'], ['quellen', 'Quellen'], ['mehr', 'Alle Bereiche']].map(function (x) { return el('a', { class: 'vu-chip', href: href(t, x[0]) }, x[1]); })
      .concat([el('a', { class: 'vu-chip', href: '/quant/#/aktie/' + encodeURIComponent(t) + '/zahlen' }, 'Zahlen in Quant')])));
    out.push(foot(co.raw && co.raw.fundamentals && co.raw.fundamentals.asOf), dataMethod(co));
    return out;
  }
  /* Neutrale Mehrjahresentwicklung: Anfangs- und Endwert, Rate pro Jahr bzw. Veraenderung in Prozentpunkten (Plus neongruen, Minus schwarz). */
  var DEV = ['revenue', 'net_income', 'free_cash_flow', 'eps_diluted', 'operating_margin', 'net_margin'];
  function development(co) {
    var b = co.book, cu = cur(co);
    var rows = DEV.map(function (id) {
      var def = C.BY_ID[id], have = C.seriesOf(b, def, 'annual').filter(function (x) { return isNum(x.v); });
      if (have.length < 2) return null;
      var end = have[have.length - 1], start = have.filter(function (x) { return x.fy >= end.fy - 10; })[0];
      if (!start || start.fy === end.fy) return null;
      var n = end.fy - start.fy, change, sign;
      if (def.kind === 'ratio') { sign = end.v - start.v; change = C.fmt({ kind: 'growth' }, end.v - start.v).replace('%', 'Pp.'); }
      else { var g = C.cagr(b, def, n); if (g.reason === 'SPLIT') return null; sign = isNum(g.rate) ? g.rate : null; change = isNum(g.rate) ? C.fmt({ kind: 'growth' }, g.rate) + ' p. a.' : C.reason(g.reason); }
      return el('li', {}, el('a', { href: href(co.t, 'kennzahl', '&k=' + id) }, [
        el('span', { class: 'fu-dev-l' }, [el('b', { text: def.label.replace(/ \(.*\)$/, '') }), el('small', { class: 'vu-num', text: 'GJ ' + start.fy + ' → ' + end.fy + ' · ' + moneyOr(def, start.v, cu) + ' → ' + moneyOr(def, end.v, cu) })]),
        sign == null ? el('em', { class: 'vu-xs vu-mu', text: change }) : signPill(change, sign)]));
    }).filter(Boolean);
    return rows.length ? el('ul', { class: 'vu-box fu-dev' }, rows) : null;
  }

  function fyNote(b) { var e = C.fiscalYearEnd(b); return e ? (e.calendar ? 'Geschäftsjahr = Kalenderjahr' : 'Geschäftsjahr endet im ' + e.month) : 'Geschäftsjahre laut SEC'; }
  function branchSummary(co, U) {
    if (!U) return notice('Vergleichsdaten gerade nicht verfügbar.');
    var g = groupOf(co, U);
    if (!g) return notice('Keine Branche hinterlegt.', 'Für diese Aktie liegt kein SEC-Branchencode vor.');
    var items = [['revenue', 'Umsatz'], ['net_margin', 'Nettomarge'], ['revenue_growth', 'Umsatzwachstum'], ['roic', 'ROIC']].map(function (x) {
      var def = C.BY_ID[x[0]], v = g.self[def.u], p = C.position(g.members, def.u, v);
      if (!p || !isNum(v) || (g.self.fx && def.kind === 'money')) return null;
      return el('li', {}, [el('span', { text: x[1] }), el('b', { class: 'fu-num', text: val(def, v, 'USD') }), el('small', { class: 'fu-num', text: 'Median ' + val(def, p.median, 'USD') + ' · ' + C.positionText(p) })]);
    }).filter(Boolean);
    return el('a', { class: 'fu-branch', href: href(co.t, 'vergleich') }, [el('small', { text: groupLabel(g) + ' · ' + g.members.length + ' Unternehmen' }), el('ul', {}, items), el('span', { class: 'fu-branch-peers', text: 'Vergleich mit ' + g.peers.filter(function (p) { return p.s !== co.t; }).map(function (p) { return p.s; }).join(', ') })]);
  }

  /* ------------------------------------------------------------ F06 Reiter Kennzahlen */
  function catalogView(co, r, ctx) {
    var t = co.t, all = C.catalogFor(co.book, ctx), cat = r.tab && C.CATS.some(function (c) { return c.id === r.tab; }) ? r.tab : '';
    var list = el('div', { class: 'fu-cat' }), q = '', cards = el('div', { class: 'vu-stack fu-catcards' }), tiles = el('div', { class: 'vu-grid fu-gap', style: '--vu-cols:3' });
    var input = el('input', { class: 'fu-input fu-input-sm', type: 'search', placeholder: 'Kennzahl suchen, z. B. Marge', 'aria-label': 'Kennzahl suchen', autocomplete: 'off',
      oninput: function () { q = input.value.trim().toLowerCase(); paint(); } });
    function row(x) {
      var def = x.def, c = x.cur, none = !isNum(c.v);
      return el('li', {}, el('a', { class: 'fu-crow', href: href(t, 'kennzahl', '&k=' + def.id) }, [
        el('span', { class: 'fu-crow-l' }, [el('b', { text: def.label }), el('small', { text: none ? C.reason(c.reason) : basisText(c) + (x.quarterly ? ' · auch quartalsweise' : def.hist && x.rows.some(function (qq) { return isNum(qq.v); }) ? ' · Verlauf je Jahresbericht' : '') })]),
        spark(x.rows),
        el('span', { class: 'fu-crow-v' }, [el('b', { class: 'fu-num' + (none ? ' is-none' : ''), text: none ? '–' : moneyOr(def, c.v, cur(co)) }), c.change ? el('small', { class: 'fu-chg' + dirClass(c.change), text: C.changeText(def, c.change, cur(co)) }) : null]),
        glyph('chevron', 'fu-glyph-sm')
      ]));
    }
    /* 7 Kategorien mit Anzahl und einem Beispielwert (erste Kennzahl der Kategorie mit Wert); Antippen filtert die Liste. */
    function paintCards() {
      put(cards, C.CATS.map(function (c) {
        var items = all.filter(function (x) { return x.def.cat === c.id; }), ex = items.filter(function (x) { return x.available && isNum(x.cur.v); })[0];
        return el('button', { type: 'button', class: 'vu-box fu-catcard', 'aria-pressed': String(cat === c.id), onclick: function () { cat = cat === c.id ? '' : c.id; paint(); paintCards(); list.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, [
          el('span', {}, [el('b', {}, [c.label, el('span', { class: 'vu-mu', text: ' · ' + items.length })]), el('small', { text: ex ? ex.def.label.replace(/ \(.*\)$/, '') + ' ' + moneyOr(ex.def, ex.cur.v, cur(co)) + (basisText(ex.cur) ? ' (' + basisText(ex.cur) + ')' : '') : 'gerade kein Wert' })]), glyph('chevron', 'fu-glyph-sm')]);
      }));
    }
    function paintTiles() {
      var k = C.catalogCounts(all), ys = co.book.years || [];
      put(tiles, frag(UI.tile('Definiert', String(k.defined), 'Kennzahlen')), frag(UI.tile('Mit Wert', String(k.available), 'für ' + t)), frag(UI.tile('Verlauf', ys.length ? ys.length + ' J.' : '–', ys.length ? 'GJ ' + ys[0] + '–' + String(ys[ys.length - 1]).slice(2) : 'keine Jahre')));
    }
    function paint() {
      var match = function (x) { return (!cat || x.def.cat === cat) && (!q || (x.def.label + ' ' + x.def.desc + ' ' + x.def.id).toLowerCase().indexOf(q) >= 0); };
      var have = all.filter(function (x) { return x.available && match(x); }), missing = all.filter(function (x) { return !x.available && match(x); });
      var groups = C.CATS.filter(function (c) { return !cat || c.id === cat; }).map(function (c) {
        var items = have.filter(function (x) { return x.def.cat === c.id; });
        return items.length ? el('section', { class: 'fu-cat-g' }, [el('h3', { class: 'fu-h3', text: c.label + ' · ' + items.length }), el('ul', { class: 'fu-crows' }, items.map(row))]) : null;
      }).filter(Boolean);
      // Ohne Auswahl zeigen die sieben Kategorie-Karten den Katalog; die Liste erscheint nach Antippen oder Suche.
      if (!cat && !q) groups = [];
      put(list, (cat || q ? [el('div', { class: 'fu-catfilter' }, [el('span', { class: 'vu-sm', text: (cat ? CAT_LABEL[cat] : 'Alle') + (q ? ' · „' + q + '“' : '') }), el('button', { type: 'button', class: 'vu-chip', onclick: function () { cat = ''; q = ''; input.value = ''; paint(); paintCards(); } }, 'Alle zeigen')])] : [])
        .concat(groups.length || (!cat && !q) ? groups : [frag(UI.blank('Keine Kennzahl gefunden. Anderen Begriff versuchen.'))]).concat([
          missing.length ? more('Ohne Angabe für ' + t + ' (' + missing.length + ')', [el('ul', { class: 'fu-missing' }, missing.map(function (x) { return el('li', {}, el('a', { href: href(t, 'kennzahl', '&k=' + x.def.id) }, [el('b', { text: x.def.label }), el('small', { text: C.reason(x.cur.reason) })])); })),
            el('p', { text: 'Diese Werte meldet das Unternehmen nicht in der nötigen Form, oder eine Eingabe fehlt. Sie zählen nicht als verfügbar; es wird nichts geschätzt.' })]) : null]));
    }
    function refresh() { all = C.catalogFor(co.book, ctx); paint(); paintCards(); paintTiles(); }
    paint(); paintCards(); paintTiles();
    main.addEventListener('fu-universe', function h() { main.removeEventListener('fu-universe', h); refresh(); });
    valuationOf(co).then(refresh, refresh);
    return [el('div', { class: 'fu-search fu-search-sm fu-gap' }, [glyph('search', 'fu-search-ico'), input]), tiles, el('div', { class: 'fu-gap' }), cards, list,
      el('p', { class: 'vu-xs vu-mu fu-gap', text: 'Jede Kennzahl öffnet: Verlauf (Jahr/Quartal), Vergleich mit der Branche, Tabelle mit SEC-Quelle.' })];
  }

  /* ------------------------------------------------------------ 3 Kennzahl-Detail */
  var RANGES = { annual: [['3', '3J'], ['5', '5J'], ['10', '10J'], ['0', 'Max']], quarterly: [['4', '4Q'], ['8', '8Q'], ['0', 'Alle']] };
  /* Linie fuer Quoten, Faktoren und Werte je Aktie, Balken fuer Betraege, Stueckzahlen und Wachstumsraten. */
  function lineFirst(def) { return def.kind === 'ratio' || def.kind === 'multiple' || def.kind === 'perShare'; }
  var PEERS_SHOWN = 4;
  function seg(label, opts, cur, onPick) {
    var g = el('div', { class: 'fu-seg', role: 'group', 'aria-label': label });
    function draw(c) { put(g, opts.map(function (o) { return el('button', { type: 'button', class: 'fu-seg-b' + (o[3] ? ' fu-seg-ico' : ''), 'aria-pressed': String(o[0] === c), 'aria-label': o[3] ? o[1] : null, title: o[3] ? o[1] : null, disabled: o[2] ? true : null, onclick: function () { onPick(o[0]); } }, o[3] ? glyph(o[3], 'fu-glyph-sm') : o[1]); })); }
    draw(cur); g.redraw = draw; return g;
  }
  function changeLabel(def, c, cu) { return c ? c.reason ? C.reason(c.reason) : C.changeText(def, c, cu) || '–' : '–'; }
  function changeCls(c) { return c && !c.reason ? ' fu-chg' + dirClass(c) : ''; }
  function metricView(co, r, ctx) {
    var def = C.BY_ID[r.metric] || C.BY_ID.revenue, t = co.t, b = co.book, cu = cur(co);
    var histVal = !!(def.snap && def.hist), canMedian = C.INDUSTRY_METRICS.indexOf(def.id) >= 0;
    var period = r.period === 'quarterly' && def.q && !def.snap ? 'quarterly' : 'annual', range = period === 'quarterly' ? '8' : '10';
    var kind = lineFirst(def) ? 'line' : 'bars', cmp = '', cmpData = { median: null, peers: null, group: null, note: null };
    var hasQ = !def.snap && def.q && C.seriesOf(b, def, 'quarterly').filter(function (x) { return isNum(x.v); }).length > 1;
    // Weitere Kennzahlen im selben Verlauf (engine/compare.js); Farbe je Platz der Auswahl (1–3), die Hauptkennzahl bleibt.
    var canPlus = !(def.snap && !def.hist), extra = canPlus ? K.cleanSelection(def.id, r.plus) : [], dmode = K.modeFromParam(r.dmode), slot = {}, valState = '', cmpKept = '';
    extra.forEach(function (id, i) { slot[id] = i + 1; });
    var plusRow = el('div', { class: 'fu-plus', role: 'group', 'aria-label': 'Kennzahlen im Verlauf' }), modeRow = el('div', { class: 'fu-mc-mode' });
    var head = el('div', { class: 'fu-mhead' }), chartBox = el('div', { class: 'fu-card' }, skel(190)), table = el('div'), cagrBox = el('div'), facts = el('div'), cmpNote = el('p', { class: 'fu-note' });
    function paintHead() {
      var c = C.current(b, def, ctx), none = !isNum(c.v);
      put(head, el('strong', { class: 'fu-big fu-num' + (none ? ' is-none' : ''), text: none ? 'keine Angabe' : val(def, c.v, cu) }),
        el('span', { class: 'fu-mhead-s' }, [c.change ? el('b', { class: 'fu-chg' + dirClass(c.change), text: C.changeText(def, c.change, cu) }) : null,
          el('span', { text: none ? C.reason(c.reason) : (c.basis === 'TTM' ? 'letzte 12 Monate' + (c.through ? ' bis ' + c.through.replace(/^FY(\d{4})Q(\d)$/, 'Q$2 GJ $1') : '') + (c.change ? ' · ggü. Vorjahreszeitraum' : '') : c.basis === 'MARKET' ? c.label : c.label + (c.change ? ' · ggü. ' + c.prevLabel : '')) })]),
        asOfLine(def, c), c.split ? el('p', { class: 'vu-alert', role: 'note', text: 'Aktiensplit ohne Rückrechnung zwischen den Jahren – keine Veränderung berechnet.' }) : '');
    }
    /* Kennzeichnung der Zeitraeume: LTM (vier Quartale) gegen das letzte abgeschlossene Geschaeftsjahr im Jahresdiagramm. */
    function asOfLine(def, c) {
      if (c.basis !== 'TTM' || !c.through) return null;
      var m = /^FY(\d{4})Q(\d)$/.exec(c.through); if (!m) return null;
      var k = Number(m[1]) * 4 + Number(m[2]) - 1, k0 = k - 3, fy0 = Math.floor(k0 / 4), q0 = k0 % 4 + 1;
      var rows = C.seriesOf(b, def, 'annual').filter(function (x) { return isNum(x.v); }), y = rows[rows.length - 1];
      return el('p', { class: 'fu-note fu-asof' }, ['LTM = Q' + q0 + ' GJ ' + fy0 + ' bis Q' + m[2] + ' GJ ' + m[1] + (c.end ? ' (bis ' + M.dateDe(c.end) + ')' : '') + '.',
        y ? ' Das Jahresdiagramm zeigt abgeschlossene Geschäftsjahre, zuletzt ' + y.label + (y.end ? ' (bis ' + M.dateDe(y.end) + ')' : '') + ': ' + val(def, y.v, cu) + '.' : '']);
    }
    var segP = seg('Zeitraum-Art', [['annual', 'Jährlich'], ['quarterly', 'Quartalsweise', !hasQ]], period, function (v) { period = v; range = v === 'quarterly' ? '8' : '10'; if (v === 'quarterly') cmp = cmpKept = ''; if (extra.length) syncUrl(); paint(); });
    var segR = seg('Zeitraum', RANGES[period], range, function (v) { range = v; paint(); });
    var segK = seg('Diagrammart', [['bars', 'Balkendiagramm', false, 'income'], ['line', 'Liniendiagramm', false, 'growth']], kind, function (v) { kind = v; if (v === 'bars') cmp = ''; paint(); });
    var segC = seg('Vergleich', [['', 'Ohne'], ['median', 'Branchenmedian', !canMedian], ['peers', 'Wettbewerber']], cmp, pickCmp);
    function pickCmp(v) {
      cmp = v; if (v) { kind = 'line'; period = 'annual'; }
      if (!v || cmpData[v]) { paint(); return; }
      put(cmpNote, 'Vergleichsdaten werden geladen …'); paint();
      withGroup(function (g) {
        if (!g) { cmpData.note = 'Keine Vergleichsgruppe: für ' + t + ' liegt kein SEC-Branchencode vor.'; cmp = ''; paint(); return; }
        if (v === 'median') loadIndustry(g.file).then(function (doc) { var sr = C.industrySeries(doc, def.id); cmpData.median = sr || {}; cmpData.group = g; paint(); });
        else Promise.all(g.peers.filter(function (x) { return x.s !== t; }).slice(0, PEERS_SHOWN).map(function (x) {
          return loadPeerBook(x.s, histVal).then(function (pb) { return { t: x.s, b: pb, fx: !!x.fx }; }).catch(function () { return { t: x.s, b: null }; });
        })).then(function (list) { cmpData.peers = list; cmpData.group = g; paint(); });
      });
    }
    function withGroup(fn) {
      if (co.U) fn(groupOf(co, co.U));
      else main.addEventListener('fu-universe', function h(e) { main.removeEventListener('fu-universe', h); fn(e.detail ? groupOf(co, e.detail) : null); });
    }
    function rowsNow() { return C.seriesOf(b, def, period); }
    function whyText(code) { return code === 'LOADING' && valState === 'failed' ? 'Kursreihe gerade nicht verfügbar' : K.reasonText(code); }
    function syncUrl() {
      var h = href(t, 'kennzahl', '&k=' + def.id + (period === 'quarterly' ? '&p=q' : '') + (extra.length ? '&plus=' + extra.join('.') + (dmode ? '&d=' + K.MODE_PARAM[dmode] : '') : ''));
      try { history.replaceState(history.state, '', h); } catch (e) { /* ohne Verlauf: Auswahl gilt nur fuer diese Ansicht */ }
    }
    function addExtra(id) {
      var used = extra.map(function (x) { return slot[x]; });
      slot[id] = [1, 2, 3].filter(function (k) { return used.indexOf(k) < 0; })[0]; extra.push(id); syncUrl(); paint();
    }
    function removeExtra(id) {
      extra = extra.filter(function (x) { return x !== id; }); delete slot[id]; syncUrl(); paint();
      var bt = plusRow.querySelector('.fu-plus-b'); if (bt) bt.focus();
    }
    function openPick() {
      var d = pickMetric(co, [def.id].concat(extra), period, whyText, addExtra);
      if (!b.valuation && valState !== 'failed') valuationOf(co).then(function (v) { if (!v) valState = 'failed'; d.repaint(); });
    }
    function paintPlus() {
      if (!canPlus) return;
      var full = extra.length >= K.MAX - 1;
      put(plusRow, extra.length ? el('span', { class: 'fu-pchip is-main' }, [el('i', { class: 'sw m0' }), short(def.label)]) : null,
        extra.map(function (id) {
          var d = C.BY_ID[id], a = K.availability(b, d, period), off = !a.ok && a.reason !== 'LOADING';
          return el('span', { class: 'fu-pchip' + (off ? ' is-off' : ''), title: off ? whyText(a.reason) : null }, [el('i', { class: 'sw m' + slot[id] }), short(d.label),
            el('button', { type: 'button', class: 'fu-pchip-x', 'aria-label': d.label + ' entfernen', onclick: function () { removeExtra(id); } }, glyph('close', 'fu-glyph-sm'))]);
        }),
        el('button', { type: 'button', class: 'fu-plus-b', disabled: full ? true : null, 'aria-haspopup': 'dialog', onclick: openPick }, [glyph('plus', 'fu-glyph-sm'), full ? 'Höchstens ' + K.MAX : 'Kennzahl']));
    }
    /* Gemeinsamer Verlauf: Hauptkennzahl und Auswahl auf einer Zeitachse; Darstellung nach Einheiten (compare.js#modes). */
    function multiBox() {
      var defs = [def].concat(extra.map(function (id) { return C.BY_ID[id]; }));
      if (defs.some(function (d) { return d.snap; }) && !b.valuation && !valState) { valState = 'loading'; valuationOf(co).then(function (v) { valState = v ? '' : 'failed'; paint(); }); }
      var model = K.align(b, defs, period, Number(range)), md = K.modes(model), mode = dmode && md.ok[dmode] ? dmode : md.preferred;
      var tones = defs.map(function (d, i) { return i ? slot[d.id] : 0; });
      put(modeRow, seg('Darstellung', [['axes', 'Achsen', !md.ok.axes], ['index', 'Index 100', !md.ok.index], ['split', 'Getrennt', !md.ok.split]], mode, function (v) { dmode = v; syncUrl(); paint(); }));
      return [multiChart(model, { mode: mode, currency: cu, tones: tones, height: window.innerWidth >= 720 ? 260 : 210, onFull: function () { fullView(model, mode, tones); } }), multiNotes(model, md, mode),
        more('Alle Werte im Vergleich', [multiTable(model, cu)])];
    }
    function multiNotes(model, md, mode) {
      var out = [], ok = model.series.filter(function (s) { return s.ok; });
      model.series.forEach(function (s) { if (!s.ok) out.push(s.def.label + ' nicht im Verlauf: ' + whyText(s.reason) + '.'); });
      if (mode === 'axes' && md.groups.length > 1) out.push('Zwei Achsen: links ' + md.groups[0].label + ', rechts ' + md.groups[1].label + '. Jede Einheit hat ihre eigene Skala – Schnittpunkte der Linien haben keine Bedeutung.');
      if (mode === 'index') {
        var ix = md.index, bp = model.points.filter(function (p) { return p.key === ix.base; })[0];
        out.push('Index: jeder Wert ÷ Wert ' + (bp ? (model.period === 'quarterly' ? 'in ' + bp.label : 'im GJ ' + bp.key) : 'im Basiszeitraum') + ' × 100 – zeigt die Entwicklung, nicht die Höhe. Basis ist der erste Zeitraum, in dem alle indexierten Kennzahlen positiv sind.');
        Object.keys(ix.excluded).forEach(function (i) { out.push(model.series[i].def.label + ' nicht indexiert: ' + whyText(ix.excluded[i]) + '.'); });
      }
      if (mode === 'split') out.push('Jede Kennzahl mit eigener Achse; Zeitachse und Ablesen sind gemeinsam.');
      if (ok.some(function (s) { return s.def.snap; })) out.push('Bewertung nach jedem Jahresbericht: Kurs = erster Wochenschluss nach Veröffentlichung des 10-K, mit den Zahlen dieses Geschäftsjahres – zu diesem Zeitpunkt waren sie veröffentlicht. Spätere Korrekturen der Jahreszahlen: siehe „Wie wird gerechnet?“.');
      out.push(model.period === 'quarterly' ? 'Eigenständige Quartale; Q4 = Jahreswert minus neun Monate („berechnet“). Quelle je Wert: jüngste SEC-Meldung mit diesem Wert. LTM wird nicht mit Quartalen gemischt.' : 'Abgeschlossene Geschäftsjahre, je Wert der Berichtszeitraum und das Datum des Jahresberichts. LTM steht nur oben bei der Hauptkennzahl.');
      if (!Number(range)) out.push(sinceText(ok.map(function (s) { return { label: short(s.def.label), rows: Object.keys(s.rows).map(function (k) { return s.rows[k]; }) }; }), model.period));
      out.push('Fehlende Werte bleiben Lücken; nichts wird geschätzt oder verbunden.');
      return el('ul', { class: 'fu-mc-notes' }, out.map(function (x) { return el('li', { text: x }); }));
    }
    /* „Max“ = alle verfügbaren Zeiträume; das tatsächliche erste Jahr je Kennzahl steht dabei (kein pauschales Fenster). */
    function sinceText(list, per) {
      var parts = list.map(function (x) {
        var have = x.rows.filter(function (r) { return isNum(r.v); }).sort(function (a, b) { return a.key - b.key; });
        return have.length ? (x.label ? x.label + ' ' : '') + 'seit ' + (per === 'quarterly' ? have[0].label : 'GJ ' + have[0].key) + ' (' + have.length + (per === 'quarterly' ? ' Quartale' : ' Jahre') + ')' : null;
      }).filter(Boolean);
      return parts.length ? 'Max: alle verfügbaren ' + (per === 'quarterly' ? 'Quartale' : 'Geschäftsjahre') + ' – ' + parts.join(' · ') + '.' : null;
    }
    function fullView(model, mode, tones) {
      var box = el('div', { class: 'fu-full-body' });
      sheet(def.label + ' im Vergleich', box, 'fu-sheet-full');
      put(box, multiChart(model, { mode: mode, currency: cu, tones: tones, height: Math.max(200, Math.min(520, Math.round(window.innerHeight * 0.82) - 340)) }));
    }
    function paint() {
      segP.redraw(period); put(segR, RANGES[period].map(function (x) { return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(x[0] === range), onclick: function () { range = x[0]; paint(); } }, x[1]); }));
      segK.redraw(kind); segC.redraw(cmp);
      var rows = rowsNow(), n = Number(range), shown = n ? rows.slice(-n) : rows;
      if (!shown.length) {
        var v = b.valuation, miss = v && v.missing && v.missing[def.id], why = histVal ? (v && v.reason ? C.reason(v.reason) + '.' : miss ? 'Häufigster Grund: ' + C.reason(miss) + '. Es wird kein ungeprüfter Wert gezeigt.' : 'Für kein Geschäftsjahr bestehen alle Prüfungen.') : period === 'quarterly' ? 'Quartalswerte liegen nur für die letzten zwei Jahre vor.' : 'Diese Kennzahl wird nicht gemeldet.';
        put(chartBox, notice(histVal ? 'Kein geprüfter Verlauf' : 'Keine Werte für diesen Zeitraum.', histVal && v && v.reason === 'NON_USD_REPORTING' ? co.name + ' berichtet in ' + cu + ', der Kurs notiert in US-Dollar. Ohne Wechselkurs je Stichtag wäre ein Verhältnis falsch.' : why));
        put(table); put(facts); [ctrl, cmpWrap, werte].forEach(function (x) { if (histVal && x) x.hidden = true; }); return;
      }
      [ctrl, cmpWrap, werte].forEach(function (x) { if (x) x.hidden = false; });
      // Waehrend des Kennzahlenvergleichs ruht der Branchenvergleich; danach gilt wieder die vorherige Wahl.
      var multi = extra.length > 0;
      if (multi && cmp) { cmpKept = cmp; cmp = ''; } else if (!multi && cmpKept) { cmp = cmpKept; cmpKept = ''; segC.redraw(cmp); }
      cmpWrap.hidden = multi; segK.hidden = multi; modeRow.hidden = !multi; paintPlus();
      var prevRows = {}, yoy = {};
      shown.forEach(function (x) { prevRows[x.key] = C.stepChange(b, def, rows, x.key, 1, period); if (period === 'quarterly') yoy[x.key] = C.stepChange(b, def, rows, x.key, 4, period); });
      var med = cmp === 'median' ? cmpData.median : null, peers = cmp === 'peers' ? cmpData.peers : null;
      // Chart
      if (multi) put(chartBox, multiBox());
      else if (kind === 'bars') put(chartBox, bars(shown.map(function (x) { var c = period === 'quarterly' ? yoy[x.key] : prevRows[x.key]; return { key: x.key, label: x.label, short: x.short, v: x.v, gap: !isNum(x.v), extra: isNum(x.v) ? (c && !c.reason ? changeLabel(def, c, cu) + (period === 'quarterly' ? ' ggü. Vorjahresquartal' : ' ggü. Vorjahr') : null) : C.reason(x.reason) }; }), { def: def, currency: cu, height: 190 }));
      else {
        var self = { label: t, cls: 'self', vals: {} }; shown.forEach(function (x) { if (isNum(x.v)) self.vals[x.key] = x.v; });
        var series = [self];
        if (med) { var ms = { label: 'Branchenmedian', cls: 'median', vals: {}, note: {} }; shown.forEach(function (x) { var m = med[x.key]; if (m) { ms.vals[x.key] = m.v; ms.note[x.key] = m.n + ' Unt.'; } }); series.push(ms); }
        if (peers) peers.forEach(function (p) {
          if (!p.b || (def.kind === 'money' && (p.fx || p.b.currency !== cu))) return;
          var ps = { label: p.t, cls: 'peer', vals: {} }; C.seriesOf(p.b, def, 'annual').forEach(function (x) { if (isNum(x.v)) ps.vals[x.key] = x.v; });
          if (Object.keys(ps.vals).length) series.push(ps);
        });
        put(chartBox, lines(shown.map(function (x) { return { key: x.key, label: x.label, short: x.short, extra: isNum(x.v) ? null : C.reason(x.reason) }; }), series, { def: def, currency: cu, height: 200 }));
      }
      if (!multi && !n) { var since = sinceText([{ label: null, rows: rows }], period); if (since) chartBox.append(el('p', { class: 'fu-note fu-since', text: since })); }
      var g = cmpData.group;
      put(cmpNote, cmp === 'median' && g ? 'Median der Vergleichsgruppe ' + groupLabel(g) + ' (' + g.rule.split(', gezeigt')[0] + '), je Geschäftsjahr aus allen Unternehmen mit Wert (mindestens 5). Geschäftsjahre enden unterschiedlich.' + (med && !Object.keys(med).length ? ' Für diese Kennzahl liegt kein Median vor.' : '')
        : cmp === 'peers' && g ? 'Wettbewerber aus ' + groupLabel(g) + ': ' + g.rule + '. ' + (def.kind === 'money' ? 'Beträge nur von Unternehmen in ' + cu + '. ' : '') + 'Antippen zeigt die Werte je Jahr.' : cmpData.note || '');
      // Tabelle (Wert immer in der zweiten Spalte)
      var hv = histVal, isPe = def.id === 'pe';
      put(table, el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: period === 'quarterly' ? 'Quartal' : 'Jahr' }), el('th', { scope: 'col', class: 'r', text: short(def.label) }),
          el('th', { scope: 'col', class: 'r', text: period === 'quarterly' ? 'ggü. Vorquartal' : 'ggü. Vorjahr' }), period === 'quarterly' ? el('th', { scope: 'col', class: 'r', text: 'ggü. Vorjahresquartal' }) : null,
          med ? el('th', { scope: 'col', class: 'r', text: 'Branche' }) : null,
          hv ? el('th', { scope: 'col', class: 'r', text: 'Kurs' }) : null, hv && isPe ? el('th', { scope: 'col', class: 'r', text: 'EPS bereinigt' }) : hv && def.id !== 'market_cap' ? el('th', { scope: 'col', class: 'r', text: /^ev|enterprise/.test(def.id) ? 'EV' : 'Börsenwert' }) : null,
          el('th', { scope: 'col', class: 'r', text: 'Quelle' })])),
        el('tbody', {}, shown.slice().reverse().map(function (x) {
          var url = x.accn ? M.secFilingUrl(b.cik, x.accn) : null, c1 = prevRows[x.key], c4 = yoy[x.key], m = med && med[x.key], ps = { kind: 'perShare' };
          return el('tr', {}, [el('th', { scope: 'row' }, [x.label, x.end ? el('small', { text: M.dateDe(x.end) }) : null]),
            el('td', { class: 'r fu-num' + (isNum(x.v) ? '' : ' is-none'), text: isNum(x.v) ? val(def, x.v, cu) : C.reason(x.reason) }),
            el('td', { class: 'r fu-num' + changeCls(c1), text: changeLabel(def, c1, cu) }), period === 'quarterly' ? el('td', { class: 'r fu-num' + changeCls(c4), text: changeLabel(def, c4, cu) }) : null,
            med ? el('td', { class: 'r fu-num', text: m ? val(def, m.v, cu) : '–' }) : null,
            hv ? el('td', { class: 'r fu-num' }, [isNum(x.price) ? C.fmt(ps, x.price, 'USD') : '–', x.priceDate ? el('small', { class: 'fu-td-s', text: 'am ' + M.dateDe(x.priceDate) + (x.pubDate ? ' · 10-K ' + M.dateDe(x.pubDate) : '') }) : null]) : null,
            hv && isPe ? el('td', { class: 'r fu-num' }, [isNum(x.eps) ? C.fmt(ps, x.eps, 'USD') : '–', x.factor && x.factor !== 1 ? el('small', { class: 'fu-td-s', text: 'gemeldet ' + C.fmt(ps, x.epsReported, 'USD') + ' ÷ ' + M.multiple(x.factor) }) : null])
              : hv && def.id !== 'market_cap' ? el('td', { class: 'r fu-num', text: C.money(/^ev|enterprise/.test(def.id) ? x.ev : x.mcap, 'USD') }) : null,
            el('td', { class: 'r' }, url ? el('a', { href: url, target: '_blank', rel: 'noopener', text: (x.derived ? 'berechnet · ' : '') + 'SEC ' + M.dateDe(x.filed).slice(-4) }) : x.derived ? 'berechnet' : '–')]);
        }))])));
      put(facts, story(def, shown, med, cu, period));
    }
    function paintCagr() {
      var horizons = def.kind === 'money' || def.kind === 'perShare' || def.kind === 'shares' ? [3, 5, 10].map(function (n) { return C.cagr(b, def, n); }) : [];
      put(cagrBox, horizons.some(function (h) { return isNum(h.rate) || h.reason === 'SPLIT'; }) ? el('ul', { class: 'fu-cagr', 'aria-label': 'Wachstum pro Jahr' }, horizons.map(function (h) {
        return el('li', {}, [el('span', { text: h.years + ' Jahre p. a.' }), el('b', { class: 'fu-num' + (isNum(h.rate) ? '' : ' is-none'), text: isNum(h.rate) ? C.fmt({ kind: 'growth' }, h.rate) : C.reason(h.reason) }), isNum(h.rate) ? el('small', { text: h.from + '–' + h.to }) : null]);
      })) : null);
    }
    var related = C.METRICS.filter(function (m) { return m.cat === def.cat && m.id !== def.id; });
    var ctrl = el('div', { class: 'fu-ctrl fu-ctrl-m' }, [def.snap ? null : segP, el('div', { class: 'fu-ctrl-row' }, [segR, segK]), canPlus ? plusRow : null, modeRow]);
    var cmpWrap = el('div', { class: 'fu-cmp' }, [segC, cmpNote]), werte = null;
    var out = [compactHead(t, co, def.label, def.desc, [href(t, 'kennzahlen', def.cat ? '&t=' + def.cat : ''), 'Kennzahlen']), head];
    var nowCmp = def.snap ? sec('Im Vergleich', { sub: 'Aktueller Wert zum Schlusskurs' }, [withUniverse(co, function (U) { paintHead(); return valuationContext(co, def, U, ctx); })]) : null;
    if (def.snap && !def.hist) out.push(nowCmp);
    if (def.snap && !def.hist) out.push(notice('Kein historischer Verlauf', 'Das PEG braucht je Stichtag ein dreijähriges Wachstum des Gewinns je Aktie über Splits hinweg; dafür fehlt die geprüfte Grundlage. Es wird nur zum aktuellen Kurs gezeigt.'));
    else {
      out.push(def.snap ? sec('Nach jedem Jahresbericht', { sub: 'Wie der aktuelle Wert, nur damals: Kurs nach Veröffentlichung des Jahresberichts (10-K), Zahlen dieses Geschäftsjahres' }, [ctrl, chartBox]) : el('div', {}, [ctrl, chartBox]));
      out.push(cmpWrap, facts, cagrBox);
      if (nowCmp) out.push(nowCmp);
      if (def.u && !def.snap) out.push(sec('Im Branchenvergleich', { sub: def.uBasis === 'FY' ? 'Letztes Geschäftsjahr je Unternehmen' : 'Letzte zwölf Monate je Unternehmen' }, [withUniverse(co, function (U) { return peerBars(co, def, U); })]));
      out.push(werte = sec('Werte', { sub: fyNote(b) + (histVal ? ' · Kurs: erster Wochenschluss nach dem Jahresbericht' : '') }, [table]));
      var sp = (def.perShareSeries || def.shareSeries || def.perShareGrowth) && b.splits.length ? b.splits : [];
      if (sp.length) out.push(el('p', { class: 'vu-alert', role: 'note', text: 'Aktienanzahl springt ' + sp.map(function (x) { return 'zwischen GJ ' + x.from + ' und ' + x.to + ' (Faktor ' + M.multiple(x.factor) + ')'; }).join(', ') + ' – Split oder Kapitalmaßnahme ohne Rückrechnung. Werte je Aktie davor und danach sind nicht direkt vergleichbar; Raten über den Sprung werden nicht berechnet.' }));
      if (histVal) valuationOf(co).then(function () { paint(); paintCagr(); }, function () { put(chartBox, notice('Kursreihe gerade nicht verfügbar.')); });
      else { paint(); paintCagr(); }
    }
    paintHead();
    out.push(more('Wie wird gerechnet?', methodText(def)));
    if (related.length) out.push(el('div', { class: 'fu-related' }, [el('p', { class: 'vu-eyebrow', text: 'Verwandte Kennzahlen' }), el('div', { class: 'fu-chips' }, related.map(function (m) { return el('a', { class: 'fu-chip', href: href(t, 'kennzahl', '&k=' + m.id) }, m.label); }))]));
    return out;
  }
  function methodText(def) {
    var v = [el('p', { text: def.desc }), def.formula ? el('p', {}, [el('b', { text: 'Formel: ' }), def.formula]) : null];
    if (def.snap) v.push(el('p', { text: 'Aktueller Wert: Schlusskurs und letzte gemeldete Zahlen (Discover-Bewertung, Screener).' }));
    if (def.hist) v.push(el('p', { text: 'Verlauf je Jahresbericht: Kurs = erster Wochenschluss nach Einreichung des 10-K bei der SEC (höchstens 10 Tage danach, splitbereinigt) – zu diesem Kurs waren die Jahreszahlen öffentlich. Dazu ausstehende Aktien, Eigenkapital, Finanzschulden und Kasse aus der Bilanz dieses Geschäftsjahres, Umsatz, EBITDA, Free Cashflow und Dividenden des Geschäftsjahres. So ist jeder Wert wie der aktuelle gebildet (Kurs ÷ zuletzt gemeldete Jahres- bzw. LTM-Zahl), nur zu einem früheren Datum – mit dem Kurs nach der Veröffentlichung, nie mit heutigem Kurs (spätere Korrekturen der Jahreszahlen siehe unten).' }),
      el('p', { text: def.id === 'pe' ? 'Gewinn je Aktie wie gemeldet; eine Meldung enthält alle Splits vor ihrem Meldedatum, herausgerechnet werden nur Splits danach (Split-Beleg des Kursanbieters). Gegenprobe: Nettogewinn ÷ ebenso bereinigte verwässerte Aktienzahl weicht höchstens ' + Math.round(C.PE_TOLERANCE * 100) + ' % ab; die Aktienbasis darf nicht in Split-Größe springen. Bei Verlust kein KGV.'
        : 'Börsenwert = Kurs × ausstehende Aktien. Die Aktienzahl wird nur um Splits nach ihrem Meldedatum bereinigt; Gegenprobe: sie weicht höchstens ' + Math.round(C.SHARE_TOLERANCE * 100) + ' % von der ebenso bereinigten verwässerten Durchschnittszahl ab und springt nicht in Split-Größe. Unternehmenswert = Börsenwert + Finanzschulden − Zahlungsmittel (Wertpapiere zählen nicht zur Kasse, wie im Screener). Nur Unternehmen, die in US-Dollar berichten.' }),
      el('p', { text: 'Ein Jahr, das eine Prüfung nicht besteht oder dem eine Eingabe fehlt, bleibt leer – mit Grund in der Tabelle.' }),
      el('p', { text: 'Einschränkung: Die Zahlen stammen aus der jeweils neuesten SEC-Meldung. Hat ein Unternehmen einen Jahreswert später korrigiert (Restatement, z. B. in einem 10-K/A oder in den Vorjahresspalten des nächsten Jahresberichts), steht im Verlauf der korrigierte Wert, nicht der am Meldetag veröffentlichte. Die ursprünglich gemeldeten Fassungen liegen nicht vor; ein Jahr mit Korrektur kann daher vom damals sichtbaren Wert abweichen.' }));
    else if (!def.snap) v.push(el('p', { text: def.base ? 'Wert wie in der SEC-Meldung (Companyfacts), je Geschäftsjahr bzw. eigenständiges Quartal; „berechnet“ = aus Quartalen oder Teilwerten zusammengesetzt.' : 'Aus den gemeldeten Werten desselben Zeitraums berechnet. Fehlt eine Eingabe, bleibt das Jahr leer.' }),
      el('p', { text: 'LTM = letzte zwölf Monate (Summe der letzten vier Quartale). Veränderung: Vorjahr bzw. Vorquartal und Vorjahresquartal; Quoten in Prozentpunkten.' }));
    v.push(el('p', { text: 'Branchenmedian je Geschäftsjahr: Median aller Unternehmen derselben SEC-Branche mit Wert in diesem Geschäftsjahr, mindestens 5' + (def.id === 'pe' ? ' (beim KGV nur Unternehmen mit Gewinn)' : '') + '. Kein Urteil: höher ist nicht automatisch besser.' }));
    return v;
  }
  /* Kompakte, neutrale Einordnung des gezeigten Zeitraums: Spannweite, Median, Lage des letzten Werts, ggf. zum Branchenmedian. */
  function story(def, shown, med, cu, period) {
    var h = shown.filter(function (x) { return isNum(x.v); });
    if (h.length < 3) return null;
    var hi = h.reduce(function (a, x) { return x.v > a.v ? x : a; }), lo = h.reduce(function (a, x) { return x.v < a.v ? x : a; });
    var mid = C.median(h.map(function (x) { return x.v; })), last = h[h.length - 1];
    var where = Math.abs(last.v - mid) <= Math.abs(mid) * 0.02 ? 'nahe am Median' : last.v > mid ? 'über dem Median' : 'unter dem Median';
    var items = [['Höchster Wert', val(def, hi.v, cu), hi.label], ['Tiefster Wert', val(def, lo.v, cu), lo.label], ['Median', val(def, mid, cu), h.length + (period === 'quarterly' ? ' Quartale' : ' Jahre')], ['Letzter Wert', where, last.label]];
    if (med) {
      var both = h.filter(function (x) { return med[x.key]; }), above = both.filter(function (x) { return x.v > med[x.key].v; }).length;
      if (both.length) items.push(['Zum Branchenmedian', 'höher in ' + above + ' von ' + both.length, 'Jahren mit beiden Werten']);
    }
    return el('ul', { class: 'fu-facts', 'aria-label': 'Einordnung des Verlaufs' }, items.map(function (x) { return el('li', {}, [el('span', { text: x[0] }), el('b', { class: 'fu-num', text: x[1] }), el('small', { text: x[2] })]); }));
  }
  function peerBars(co, def, U) {
    if (!U) return notice('Vergleichsdaten gerade nicht verfügbar.');
    var g = groupOf(co, U);
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
      el('p', { class: 'fu-card-k' }, [el('b', { text: groupLabel(g) }), p ? ' · Median aus ' + p.count + ' Unternehmen mit Wert' : '', p && C.positionText(p) && isNum(g.self[def.u]) ? ' · ' + co.t + ' ' + C.positionText(p) : '']),
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
  var CMP = ['revenue', 'revenue_growth', 'gross_margin', 'operating_margin', 'net_margin', 'fcf_margin', 'roic', 'roe', 'free_cash_flow', 'pe', 'ps', 'pb', 'ev_ebitda', 'ev_sales', 'fcf_yield', 'debt_to_equity', 'net_debt_ebitda', 'market_cap'];
  function compareView(co, r) {
    var t = co.t, metric = CMP.indexOf(r.metric) >= 0 ? r.metric : 'revenue', mode = 'groesste';
    var box = withUniverse(co, function (U) {
      if (!U) return notice('Vergleichsdaten gerade nicht verfügbar.', 'Die Daten aller US-Aktien konnten nicht geladen werden.');
      // Drei offizielle Gruppen: Wettbewerber (SIC 4, Standard, wenn mind. 5 Unternehmen), Branche (SIC 2), Sektor.
      var gp = C.peerGroup(U, t, 'peers', 6, 'groesste', co.P), gi = C.peerGroup(U, t, 'industry', 6), gs = C.peerGroup(U, t, 'sector', 6);
      var by = r.tab === 'sektor' && gs ? 'sector' : r.tab === 'branche' && gi ? 'industry' : gp ? 'peers' : 'industry', g = by === 'sector' ? gs : by === 'peers' ? gp : gi;
      if (!g) return notice('Keine Vergleichsgruppe.', 'Für diese Aktie liegt kein SEC-Branchencode vor.');
      var fxNote = g.self.fx ? el('p', { class: 'vu-alert', role: 'note', text: co.name + ' berichtet in ' + cur(co) + ': Beträge (Umsatz, Cashflow) werden nicht mit Dollarwerten verglichen und bleiben leer. Quoten, Renditen und Bewertung schon.' }) : null;
      var tabKey = { peers: '', industry: 'branche', sector: 'sektor' };
      var groupSeg = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Vergleichsgruppe' }, [gp && ['peers', 'Wettbewerber: ' + groupLabel(gp)], gi && ['industry', 'Branche: ' + gi.label], gs && ['sector', 'Sektor: ' + gs.label]].filter(Boolean).map(function (x) {
        var key = gp ? tabKey[x[0]] : x[0] === 'sector' ? 'sektor' : '';
        return el('a', { class: 'fu-seg-b', href: href(t, 'vergleich', (key ? '&t=' + key : '') + '&k=' + metric), 'aria-current': x[0] === by ? 'page' : null }, x[1]);
      }));
      var groupNote = !gp ? el('p', { class: 'fu-note', text: 'Keine engere Gruppe: Im vierstelligen SEC-Branchencode von ' + t + ' gibt es weniger als ' + C.PEER_MIN + ' Unternehmen mit Börsenwert. Verglichen wird mit der Branchen-Hauptgruppe.' }) : null;
      var modeSeg = seg('Auswahl der Wettbewerber', [['groesste', 'Größte'], ['aehnlich', 'Ähnliche Größe', !isNum(g.self.mcap)]], mode, function (v) { mode = v; g = C.peerGroup(U, t, by, 6, mode, co.P); modeSeg.redraw(mode); paint(); });
      var rule = el('p', { class: 'fu-note fu-rule' }), chart = el('div', { class: 'fu-card' }), tbl = el('div'), hist = el('div');
      var mSeg = el('div', { class: 'fu-seg fu-seg-scroll', role: 'group', 'aria-label': 'Kennzahl' }, CMP.map(function (id) {
        return el('button', { type: 'button', class: 'fu-seg-b', 'aria-pressed': String(id === metric), onclick: function () { metric = id; [].forEach.call(mSeg.children, function (bt, k) { bt.setAttribute('aria-pressed', String(CMP[k] === metric)); }); paint(); } }, short(C.BY_ID[id].label));
      }));
      function paint() {
        var def = C.BY_ID[metric], col = def.u, money = def.kind === 'money', withVal = g.members.filter(function (x) { return isNum(x[col]); }).length;
        var p = C.position(g.members, col, g.self[col]), pos = C.positionText(p);
        put(rule, 'Gruppe ' + groupLabel(g) + ': ' + g.members.length + ' Unternehmen (' + g.rule + '). ', el('b', { text: withVal + ' mit gültigem Wert' }), ' für ' + short(def.label) + (money ? ' (Beträge nur in US-Dollar)' : '') + '.');
        var pts = g.peers.map(function (x) { return { key: x.s, label: x.s + ' · ' + x.n, short: x.s, v: isNum(x[col]) ? x[col] : null, self: x.s === t }; });
        put(chart, el('p', { class: 'fu-card-k' }, [el('b', { text: def.label }), p ? ' · Median ' + val(def, p.median, 'USD') : '', pos && isNum(g.self[col]) ? ' · ' + t + ' ' + pos : '']),
          bars(pts, { def: def, currency: 'USD', height: 170, noLast: true }));
        put(tbl, el('div', { class: 'fu-table-wrap' }, el('table', { class: 'fu-table' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Unternehmen' }), el('th', { scope: 'col', class: 'r', text: short(def.label) }), el('th', { scope: 'col', class: 'r', text: metric === 'market_cap' ? 'Umsatz' : 'Börsenwert' }), el('th', { scope: 'col', class: 'r', text: 'Umsatz LTM' })])),
          el('tbody', {}, g.peers.map(function (x) {
            return el('tr', { class: x.s === t ? 'is-self' : '' }, [el('th', { scope: 'row' }, x.s === t ? [el('b', { text: x.s }), el('small', { text: x.n })] : el('a', { href: href(x.s, 'vergleich', (by === 'sector' ? '&t=sektor' : by === 'industry' && gp ? '&t=branche' : '') + '&k=' + metric) }, [el('b', { text: x.s }), el('small', { text: x.n })])),
              el('td', { class: 'r fu-num' + (isNum(x[col]) ? '' : ' is-none'), text: isNum(x[col]) ? val(def, x[col], 'USD') : x.fx && money ? 'nicht in USD' : '–' }), el('td', { class: 'r fu-num', text: C.money(metric === 'market_cap' ? x.revenue : x.mcap, 'USD') }), el('td', { class: 'r fu-num', text: C.fmt({ kind: 'growth' }, x.revGrowth) })]);
          }).concat(p ? [el('tr', { class: 'is-median' }, [el('th', { scope: 'row', text: 'Median (' + p.count + ' mit Wert)' }), el('td', { class: 'r fu-num', text: val(def, p.median, 'USD') }), el('td', { class: 'r', text: '' }), el('td', { class: 'r', text: '' })])] : []))])));
        paintHistory(def);
      }
      /* Eigene Entwicklung gegen den Branchenmedian je Geschaeftsjahr (Quoten, Renditen, Wachstum, Bewertung je Jahresbericht). */
      var histTok = 0;
      function paintHistory(def) {
        var my = ++histTok;
        if (C.INDUSTRY_METRICS.indexOf(def.id) < 0) { put(hist); return; }
        put(hist, skel(200));
        Promise.all([loadIndustry(g.file), def.hist ? valuationOf(co) : Promise.resolve(null)]).then(function (res) {
          if (my !== histTok) return;
          var med = C.industrySeries(res[0], def.id), rows = C.seriesOf(co.book, def, 'annual').slice(-10);
          var have = rows.filter(function (x) { return isNum(x.v); });
          if (!med || have.length < 2) { put(hist, sec('Entwicklung zum Branchenmedian', {}, [notice('Kein Verlauf zum Vergleich', have.length < 2 ? 'Für ' + t + ' liegen zu wenige geprüfte Jahreswerte vor.' : 'Für diese Gruppe liegt kein Median je Geschäftsjahr vor.')])); return; }
          var self = { label: t, cls: 'self', vals: {} }, ms = { label: 'Median ' + groupLabel(g), cls: 'median', vals: {}, note: {} };
          rows.forEach(function (x) { if (isNum(x.v)) self.vals[x.key] = x.v; if (med[x.key]) { ms.vals[x.key] = med[x.key].v; ms.note[x.key] = med[x.key].n + ' Unt.'; } });
          put(hist, sec('Entwicklung zum Branchenmedian', { sub: def.label + ' je Geschäftsjahr · Median aller Unternehmen der Gruppe mit Wert (mindestens 5)', link: [href(t, 'kennzahl', '&k=' + def.id), 'Details'] }, [
            el('div', { class: 'fu-card' }, lines(rows.map(function (x) { return { key: x.key, label: x.label, short: x.short }; }), [self, ms], { def: def, currency: 'USD', height: 180 })),
            story(def, rows, med, 'USD', 'annual')]));
        });
      }
      paint();
      var cards = el('ul', { class: 'fu-kgrid' }, ['gross_margin', 'operating_margin', 'roic', 'roe', 'pe', 'ev_ebitda', 'fcf_yield', 'debt_to_equity'].map(function (id) {
        var def = C.BY_ID[id], v = g.self[def.u], p = C.position(g.members, def.u, v);
        return el('li', {}, el('a', { class: 'fu-k', href: href(t, 'kennzahl', '&k=' + id) }, [el('span', { class: 'fu-k-l', text: def.label }), el('b', { class: 'fu-k-v fu-num' + (isNum(v) ? '' : ' is-none'), text: isNum(v) ? val(def, v, 'USD') : 'keine Angabe' }),
          el('small', { class: 'fu-k-s', text: p ? 'Median ' + val(def, p.median, 'USD') + ' (' + p.count + ')' + (isNum(v) && C.positionText(p) ? ' · ' + C.positionText(p) : '') : '' })]));
      }));
      return [groupSeg, groupNote, modeSeg, fxNote, rule, mSeg, chart, tbl, hist,
        sec('Weitere Kennzahlen im Vergleich', { sub: 'Wert von ' + t + ', Median der Gruppe und Lage – ohne Wertung' }, [cards]),
        el('a', { class: 'fu-teaser', href: '#/branche/' + g.self.sic2 }, [el('span', { class: 'fu-entry-ico' }, glyph('company')), el('span', {}, [el('b', { text: 'Ganze Branche ansehen' }), el('small', { text: gi ? gi.label + ' · ' + gi.members.length + ' Unternehmen' : '' })]), glyph('chevron', 'fu-glyph-sm')]),
        more('Wie ist die Gruppe gewählt?', [el('p', { text: 'Wettbewerber = gleicher vierstelliger SEC-Branchencode (SIC 4, z. B. 3674 Halbleiter), die engste offizielle Klassifikation; nur wenn darin mindestens ' + C.PEER_MIN + ' Unternehmen mit Börsenwert sind. Branche = gleiche Hauptgruppe (die ersten zwei Stellen, z. B. 36 Elektronik – dort stehen auch Elektrokonzerne). Sektor = Zusammenfassung mehrerer Hauptgruppen (sic-sector-1.0.0). Den Code vergibt die SEC je Unternehmen; es gibt keine redaktionelle Auswahl.' }),
          el('p', { text: 'Median, Lage, Balken, Tabelle und Verlauf zum Median stammen immer aus derselben gewählten Gruppe. „Größte“ zeigt die größten Unternehmen nach Börsenwert, „Ähnliche Größe“ die nach Börsenwert nächsten; Median und Lage beziehen sich auf alle Unternehmen der Gruppe mit gültigem Wert (Anzahl steht dabei).' }),
          el('p', { text: 'Lage = Anteil der Gruppe mit niedrigerem Wert. Das ist keine Wertung: Ein höheres KGV oder ein höherer Verschuldungsgrad ist nicht „besser“.' }),
          el('p', { text: 'Werte wie im Screener: Margen und Renditen aus dem letzten Geschäftsjahr, Umsatz und Wachstum aus den letzten zwölf Monaten, Bewertung zum Schlusskurs vom ' + M.dateDe(U.asOf) + '. Geschäftsjahre enden unterschiedlich. Beträge von Unternehmen, die nicht in US-Dollar berichten, werden nicht mit Dollarwerten verglichen.' })])];
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
    var t = co.t, b = co.book, cu = cur(co), tab = STATEMENTS[r.tab] ? r.tab : 'guv', period = r.period === 'quarterly' ? 'quarterly' : 'annual', span = period === 'quarterly' ? '8' : '5';
    var body = el('div');
    var tabsEl = el('div', { class: 'vu-seg fu-gap', role: 'group', 'aria-label': 'Rechenwerk' }, Object.keys(STATEMENTS).map(function (k) {
      return el('button', { type: 'button', 'aria-pressed': String(k === tab), onclick: function () { tab = k; paint(); } }, STATEMENTS[k].title === 'Gewinn- und Verlustrechnung' ? 'Gewinn & Verlust' : STATEMENTS[k].label);
    }));
    /* Spalten: 5 J · 10 J · Alle · Quartale (Quartale = die letzten acht eigenstaendigen Quartale). */
    var SPANS = [['5', '5 J', 'annual'], ['10', '10 J', 'annual'], ['0', 'Alle', 'annual'], ['8', 'Quartale', 'quarterly']];
    var spanEl = el('div', { class: 'fu-wrapchips fu-gap', role: 'group', 'aria-label': 'Spalten' });
    function paint() {
      [].forEach.call(tabsEl.children, function (bt, k) { bt.setAttribute('aria-pressed', String(Object.keys(STATEMENTS)[k] === tab)); });
      put(spanEl, SPANS.map(function (x) { return el('button', { type: 'button', class: 'vu-chip', 'aria-pressed': String(x[2] === period && (period === 'quarterly' || x[0] === span)), onclick: function () { period = x[2]; span = x[0]; paint(); } }, x[1]); }));
      var st = STATEMENTS[tab], cols = period === 'quarterly' ? b.quarters.map(function (q) { return q.fy * 4 + q.q - 1; }) : b.years.slice();
      var defs = st.rows.map(function (id) { return C.BY_ID[id]; }).filter(function (d) { return period === 'annual' || d.q; });
      var series = {}; defs.forEach(function (d) { var m = {}; C.seriesOf(b, d, period).forEach(function (x) { m[x.key] = x; }); series[d.id] = m; });
      // nur Spalten, in denen mindestens eine Zeile einen Wert hat; neueste zuerst
      cols = cols.filter(function (k) { return defs.some(function (d) { return series[d.id][k] && isNum(series[d.id][k].v); }); }).reverse();
      var chartAll = cols.slice(0, period === 'quarterly' ? 8 : 12).reverse();
      if (Number(span)) cols = cols.slice(0, Number(span));
      defs = defs.filter(function (d) { return cols.some(function (k) { return series[d.id][k] && isNum(series[d.id][k].v); }); });
      if (!cols.length) { put(body, frag(UI.blank('Keine ' + (period === 'quarterly' ? 'Quartalswerte' : 'Jahreswerte') + ' für dieses Rechenwerk.' + (period === 'quarterly' ? ' Quartale liegen für die letzten zwei Jahre und nur für einen Teil der Posten vor.' : '')))); return; }
      var main1 = C.BY_ID[st.chart[1]], cB = series[st.chart[1]] || {};
      var label = function (k) { return period === 'quarterly' ? 'Q' + (k % 4 + 1) + " '" + String(Math.floor(k / 4)).slice(2) : 'GJ ' + String(k).slice(2); };
      var msc = defs.some(function (d) { return d.kind === 'money'; }) ? scaleFor({ kind: 'money' }, [].concat.apply([], defs.filter(function (d) { return d.kind === 'money'; }).map(function (d) { return cols.map(function (k) { return series[d.id][k] ? series[d.id][k].v : null; }).filter(isNum); })), cu) : null;
      put(body,
        el('div', { class: 'fu-gap' }, bars(chartAll.map(function (k) { return { key: k, label: period === 'quarterly' ? 'Q' + (k % 4 + 1) + ' GJ ' + Math.floor(k / 4) : 'GJ ' + k, short: period === 'quarterly' ? 'Q' + (k % 4 + 1) : "'" + String(k).slice(2), v: cB[k] ? cB[k].v : null }; }), { def: main1, currency: cu, height: 120 })),
        el('p', { class: 'vu-xs vu-mu', text: short(main1.label) + (period === 'quarterly' ? ' je Quartal' : ' je Geschäftsjahr') }),
        el('div', { class: 'fu-table-wrap fu-stmt-wrap fu-gap' }, el('table', { class: 'fu-table fu-stmt' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: msc ? msc.unit : st.label })].concat(cols.slice().reverse().map(function (k) { return el('th', { scope: 'col', class: 'r', text: label(k) }); })))),
          el('tbody', {}, defs.map(function (d) {
            var sub = d.kind === 'ratio' || d.kind === 'growth' || d.kind === 'multiple';
            return el('tr', { class: sub ? 'is-sub' : '' }, [el('th', { scope: 'row' }, el('a', { href: href(t, 'kennzahl', '&k=' + d.id + (period === 'quarterly' ? '&p=q' : '')) }, short(d.label)))].concat(cols.slice().reverse().map(function (k, i, arr) {
              var x = series[d.id][k];
              return el('td', { class: 'r fu-num' + (i === arr.length - 1 ? ' is-cur' : '') + (x && isNum(x.v) ? '' : ' is-none'), text: x && isNum(x.v) ? (msc && d.kind === 'money' ? msc.f(x.v) : compactVal(d, x.v, cu)) : '–' });
            })));
          }))])),
        el('p', { class: 'fu-note', text: (period === 'quarterly' ? 'Eigenständige Quartale (aus Halbjahres- und Jahreswerten herausgerechnet, wo nötig). ' : '') + fyNote(b) + ' · Beträge in ' + (cu === 'USD' ? 'US-Dollar' : cu) + ' · Zeile antippen für Verlauf und Quelle.' }));
    }
    paint();
    return [tabsEl, body, spanEl, el('div', { class: 'fu-gap' }, helpEl('Operativer Cashflow: Geld aus dem laufenden Geschäft. Ziehst du Investitionen ab, bleibt der Free Cashflow.')),
      frag(UI.blank('Segmentdaten: nicht verfügbar. Die Aufteilung nach Geschäftsbereichen steht nicht in den strukturierten SEC-Daten (Companyfacts). Sie wird nicht geschätzt.', { verdict: false }))];
  }
  function compactVal(def, v, cu) {
    if (def.kind === 'money') { var a = Math.abs(v), s = v < 0 ? '−' : ''; var u = a >= 1e12 ? [1e12, ' Bio.'] : a >= 1e9 ? [1e9, ' Mrd.'] : a >= 1e6 ? [1e6, ' Mio.'] : [1e3, ' Tsd.']; return s + (a / u[0]).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + u[1]; }
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
    if (a === 'dividende') return [head].concat(metricBlock(co, ctx, ['dividend_yield', 'dividends_paid', 'dividends_per_share', 'payout_ratio']), [chartFor(co, 'dividends_paid'), histChart(co, 'dividend_yield')]);
    if (a === 'aktie') return [head].concat(metricBlock(co, ctx, ['shares_outstanding', 'diluted_weighted_average_shares', 'share_change', 'stock_based_compensation', 'eps_diluted', 'book_value_per_share']), [chartFor(co, 'diluted_weighted_average_shares'), splitNote(co)]);
    if (a === 'bewertung') return [head, withUniverse(co, function () { return [el('div', { class: 'fu-kgrid' }, C.METRICS.filter(function (m) { return m.cat === 'bewertung'; }).map(function (m) { return kpiTile(co, m.id, ctx); }))].concat(isNum(ctx.snap.pe) && isNum(ctx.snap.peMedian) ? [gauge('KGV', ctx.snap.pe, ctx.snap.peMedian, 'Median aller US-Aktien')] : []); }),
      valuationTable(co),
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
  /* Verlauf einer Bewertungsgroesse je Jahresbericht (geprueft), sobald die Kursreihe geladen ist. */
  function histChart(co, id) {
    var def = C.BY_ID[id], box = el('div');
    valuationOf(co).then(function () {
      var rows = C.seriesOf(co.book, def, 'annual').slice(-10);
      if (rows.filter(function (x) { return isNum(x.v); }).length < 2) return;
      put(box, sec(def.label + ' nach jedem Jahresbericht', { sub: 'Geprüft: Kurs nach Veröffentlichung, Zahlen des Geschäftsjahres', link: [href(co.t, 'kennzahl', '&k=' + id), 'Details'] }, [el('div', { class: 'fu-card' }, lines(rows.map(function (x) { return { key: x.key, label: x.label, short: x.short, extra: isNum(x.v) ? null : C.reason(x.reason) }; }), [{ label: co.t, cls: 'self', vals: rows.reduce(function (o, x) { if (isNum(x.v)) o[x.key] = x.v; return o; }, {}) }], { def: def, currency: cur(co) }))]));
    });
    return box;
  }
  /* Bewertung zum Geschaeftsjahresende: Kennzahlen als Zeilen, Jahre als Spalten (wie die Rechenwerke). */
  var VAL_ROWS = ['market_cap', 'enterprise_value', 'pe', 'ps', 'pb', 'ev_sales', 'ev_ebitda', 'fcf_yield', 'dividend_yield'];
  function valuationTable(co) {
    var box = el('div', {}, skel(220));
    valuationOf(co).then(function (v) {
      if (!v || v.state !== 'AVAILABLE') { put(box, sec('Bewertung zum Geschäftsjahresende', {}, [notice('Kein geprüfter Verlauf', v && v.reason === 'NON_USD_REPORTING' ? co.name + ' berichtet in ' + cur(co) + '; ohne Wechselkurs je Stichtag wird kein Verhältnis zum Dollarkurs gebildet.' : C.reason(v && v.reason) + '. Es wird kein ungeprüfter Wert gezeigt.')])); return; }
      var series = {}; VAL_ROWS.forEach(function (id) { var m = {}; C.seriesOf(co.book, C.BY_ID[id], 'annual').forEach(function (x) { m[x.key] = x; }); series[id] = m; });
      var years = co.book.years.filter(function (y) { return VAL_ROWS.some(function (id) { return series[id][y] && isNum(series[id][y].v); }); }).reverse().slice(0, 6);
      var defs = VAL_ROWS.map(function (id) { return C.BY_ID[id]; }).filter(function (d) { return years.some(function (y) { return series[d.id][y] && isNum(series[d.id][y].v); }); });
      put(box, sec('Bewertung nach jedem Jahresbericht', { sub: 'Kurs nach Veröffentlichung des 10-K, Aktienzahl und Bilanz dieses Geschäftsjahres · Lücke = Prüfung nicht bestanden' }, [
        el('div', { class: 'fu-table-wrap fu-stmt-wrap' }, el('table', { class: 'fu-table fu-stmt' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Kennzahl' })].concat(years.map(function (y) { return el('th', { scope: 'col', class: 'r', text: String(y) }); })))),
          el('tbody', {}, defs.map(function (d) {
            return el('tr', { class: d.kind === 'money' ? '' : 'is-sub' }, [el('th', { scope: 'row' }, el('a', { href: href(co.t, 'kennzahl', '&k=' + d.id) }, short(d.label)))].concat(years.map(function (y) {
              var x = series[d.id][y]; return el('td', { class: 'r fu-num' + (x && isNum(x.v) ? '' : ' is-none'), title: x && !isNum(x.v) && x.reason ? C.reason(x.reason) : null, text: x && isNum(x.v) ? (d.kind === 'money' ? compactVal(d, x.v, 'USD') : val(d, x.v, 'USD')) : '–' });
            })));
          }))])),
        el('p', { class: 'fu-note', text: 'Zeile antippen für Verlauf, Tabelle mit Kurs und Grund jeder Lücke.' })]));
    });
    return box;
  }
  function splitNote(co) {
    var sp = co.book.splits;
    return sp.length ? el('p', { class: 'vu-alert', role: 'note', text: 'Sprünge der Aktienanzahl: ' + sp.map(function (s) { return 'GJ ' + s.from + '→' + s.to + ' (×' + M.multiple(s.factor) + ')'; }).join(', ') + ' – Split oder Kapitalmaßnahme ohne Rückrechnung.' }) : null;
  }
  function analystBlock(co) {
    var box = el('div', {}, skel(200));
    loadConsensus(co.t).then(function (d) { var e = d && d.entries && d.entries[ID.securityIdForTicker(co.t)]; return e ? { a: C.consensus(e), e: e } : null; }, function () { return null; })
    .then(function (r) { return r ? r : loadAnalysts().then(function (doc) { return { a: C.analysts(doc, co.t), e: null }; }); })
    .then(function (r) {
      var a = r && r.a;
      if (!a) { put(box, notice('Für ' + co.t + ' liegen keine Analysten-Einstufungen vor.', r && r.e ? 'Die Quelle meldet für diesen Titel keine veröffentlichten Einstufungen.' : 'Der Titel ist noch nicht abgerufen (rotierend, voller Umlauf etwa eine Woche).'), el('a', { class: 'fu-sec-link', href: '/analysten/' }, ['Zur Analystenübersicht', glyph('chevron', 'fu-glyph-sm')])); return; }
      var L = a.last, keys = [['strongBuy', 'Starker Kauf'], ['buy', 'Kaufen'], ['hold', 'Halten'], ['sell', 'Verkaufen'], ['strongSell', 'Starker Verkauf']];
      var price = co.quote && co.quote.value, tg = a.target;
      var range = tg && isNum(tg.low) && isNum(tg.high) && tg.high > tg.low ? function (v) { return Math.max(0, Math.min(100, (v - tg.low) / (tg.high - tg.low) * 100)); } : null;
      put(box, 
        el('div', { class: 'fu-kgrid' }, [
          el('div', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Analystenkonsens (Angabe Dritter)' }), el('b', { class: 'fu-k-v', text: a.label || (a.total ? a.total + ' Analysten' : '–') }), el('small', { class: 'fu-k-s', text: a.total ? (a.label ? a.total + ' Einstufungen · ' : 'Stand ') + monthDe(L.period) : '' })]),
          tg ? el('div', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Kursziel (Mittel)' }), el('b', { class: 'fu-k-v fu-num', text: C.fmt({ kind: 'perShare' }, tg.mean, 'USD') }),
            el('small', { class: 'fu-k-s', text: isNum(price) ? (tg.mean >= price ? '+' : '−') + M.pct(Math.abs(tg.mean / price - 1)) + ' zum Kurs' : '' })])
            : a.targetState ? el('div', { class: 'fu-k' }, [el('span', { class: 'fu-k-l', text: 'Kursziel (Angabe Dritter)' }), el('b', { class: 'fu-k-v', text: '–' }), el('small', { class: 'fu-k-s', text: { NO_FREE_SOURCE: 'keine freie Quelle', NO_TARGET: 'nicht veröffentlicht' }[a.targetState] || 'noch nicht geprüft' })]) : null
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

  /* ------------------------------------------------------------ F05 Methodik */
  var CAT_LABEL = {}; C.CATS.forEach(function (c) { CAT_LABEL[c.id] = c.label; });
  function shortFormula(m) { return m.formula && m.formula.length <= 30 ? m.formula : m.formula ? 'Formel PRO' : ''; }
  function metricSheet(m) {
    var id = 'fu-metric-sheet', old = document.getElementById(id); if (old) old.remove();
    var wrap = el('div'); wrap.append(frag(UI.sheet(id, m.label, '')));
    var sh = wrap.firstChild, body = sh.querySelector('.vu-sheet-body'), example = el('div', { class: 'fu-gap' }, skel(90));
    sh.querySelector('.vu-sheet-ui').prepend(el('p', { class: 'vu-ltag', text: (CAT_LABEL[m.cat] || 'Kennzahl') + ' · Kennzahl' }));
    put(body, el('p', { class: 'vu-sm', text: m.desc }), example,
      m.formula ? el('div', { class: 'vu-box vu-box--ink fu-gap fu-formula' }, [frag(UI.pro()), ' ' + m.formula]) : null,
      el('a', { class: 'vu-btn vu-btn--line vu-btn--block fu-gap', href: '#/NVDA?ansicht=kennzahl&k=' + m.id }, 'Verlauf bei NVIDIA ansehen'));
    document.body.append(sh); sh.classList.add('vu-ui');
    UI.openSheet(sh);
    loadCompany('NVDA').then(function (co) {
      var ctx = { snap: C.snapshot(co.raw, null) }, c = C.current(co.book, m, ctx);
      put(example, isNum(c.v) ? el('div', { class: 'vu-box vu-box--lime fu-sheet-val' }, [el('div', {}, [el('p', { class: 'vu-xs', text: 'NVIDIA · ' + (basisText(c) || '') }), el('b', { class: 'vu-num', text: moneyOr(m, c.v, cur(co)) })])])
        : frag(UI.blank('Für NVIDIA liegt dieser Wert gerade nicht vor.')));
    }).catch(function () { put(example, frag(UI.blank('Beispielwert gerade nicht verfügbar.'))); });
  }
  function method() {
    setTitle('Methodik'); main.setAttribute('data-view', 'method');
    var cat = 'profit', list = el('div', { class: 'vu-box fu-mlist' });
    var counts = {}; C.METRICS.forEach(function (m) { counts[m.cat] = (counts[m.cat] || 0) + 1; });
    var chips = el('div', { class: 'fu-wrapchips', role: 'group', 'aria-label': 'Kategorie' }, C.CATS.map(function (c) {
      return el('button', { type: 'button', class: 'vu-chip', 'aria-pressed': String(c.id === cat), 'data-cat': c.id, onclick: function () { cat = c.id; paintList(); } }, c.label + ' · ' + (counts[c.id] || 0));
    }));
    function paintList() {
      [].forEach.call(chips.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.cat === cat)); });
      put(list, C.METRICS.filter(function (m) { return m.cat === cat; }).map(function (m) {
        return el('button', { type: 'button', class: 'fu-mrow', onclick: function () { metricSheet(m); } }, [el('span', { class: 'fu-mrow-h' }, [el('b', { text: m.label }), el('small', { class: 'vu-num', text: shortFormula(m) })]), el('span', { class: 'fu-mrow-d', text: m.desc })]);
      }));
    }
    paintList();
    var full = el('details', { class: 'fu-allformulas' }, [el('summary', { class: 'vu-btn vu-btn--line vu-btn--block' }, ['Alle Formeln ', frag(UI.pro())]), methodFull()]);
    put(main, intro('Methodik', 'Woher die Zahlen kommen und was sie bedeuten.', false),
      el('div', { class: 'vu-box vu-box--ink fu-gap' }, [el('p', { class: 'vu-ltag', text: 'Quelle' }), el('p', { class: 'fu-src-t', text: 'Pflichtmeldungen an die SEC' }), el('p', { class: 'vu-xs fu-src-s', text: 'Companyfacts von SEC EDGAR. Dieselben Zahlen nutzen Discover, Quant und Screener.' })]),
      sectEl('Drei Zeiträume'),
      el('div', { class: 'vu-grid', style: '--vu-cols:3' }, [frag(UI.tile('GJ', 'Jahr', 'aus dem Jahresbericht')), frag(UI.tile('Quartal', '3 Mon.', 'einzeln, ggf. berechnet')), frag(UI.tile('LTM', '12 Mon.', 'letzte 4 Quartale'))]),
      el('div', { class: 'vu-sect' }, [el('h2', { text: 'Kennzahlen in Worten' }), el('span', { class: 'vu-mu vu-sm', text: String(C.METRICS.length) })]),
      chips, list,
      sectEl('Bewertung'),
      el('p', { class: 'vu-sm fu-p', text: 'Aktuell: KGV, KUV, Börsenwert zum letzten Schlusskurs. Verlauf: je Jahresbericht mit dem Kurs nach der Veröffentlichung, splitbereinigt und gegengeprüft.' }),
      el('div', { class: 'fu-gap-s' }, helpEl('Splitbereinigt: Teilt eine Firma ihre Aktien (z. B. 1 wird 10), rechnen wir alte Kurse um, damit nichts springt.')),
      sectEl('Vergleich mit der Branche'),
      el('p', { class: 'vu-sm fu-p', text: 'Wettbewerber = Firmen derselben SEC-Branche (mindestens 5). Wir zeigen die Lage („höher als 80 % der Gruppe“), keine Wertung. Ranglisten sortieren eine Kennzahl mit sichtbarer Regel.' }),
      sectEl('Lücken und Grenzen'),
      el('div', { class: 'vu-stack' }, ['Fehlt ein Wert, bleibt das Jahr leer. Nichts wird geschätzt.', 'Margen über 150 % gelten als nicht plausibel und werden nicht gezeigt.', 'Korrigiert eine Firma später, zeigen wir den korrigierten Wert.'].map(function (t) { return el('div', { class: 'vu-box fu-limit' }, [glyph('check', 'fu-glyph'), el('span', { class: 'vu-sm', text: t })]); })),
      el('div', { class: 'fu-gap' }, full), foot(null));
    done();
    var k = /[?&]k=([a-z0-9_]{2,40})/.exec(location.hash), m = k && C.BY_ID[k[1]];
    if (m) { cat = m.cat; paintList(); setTimeout(function () { metricSheet(m); }, 0); }
  }
  /* Volltext der bisherigen Methodik (alle Formeln, vollstaendig) – hinter „Alle Formeln“. */
  function methodFull() {
    return el('article', { class: 'fu-method' }, [
      el('p', { text: 'Fundamental zeigt Geschäftszahlen, die US-Unternehmen in ihren Pflichtmeldungen an die SEC berichten (Companyfacts von SEC EDGAR). Es ist dieselbe Aufbereitung, die Discover, Quant und der Screener verwenden – Fundamental macht sie vollständig zugänglich.' }),
      el('h2', { text: 'Zeiträume' }),
      el('ul', {}, [el('li', { text: 'Geschäftsjahr (GJ): der Jahreswert aus dem Jahresbericht. Geschäftsjahre enden je Unternehmen zu unterschiedlichen Zeitpunkten; das Ende steht an jeder Reihe.' }),
        el('li', { text: 'Quartal: eigenständige Quartalswerte; wo Unternehmen nur Halbjahres- oder Jahreswerte melden, herausgerechnet („berechnet“).' }),
        el('li', { text: 'LTM: letzte zwölf Monate, Summe der letzten vier Quartale. Die Veränderung vergleicht mit den zwölf Monaten davor.' })]),
      el('h2', { text: 'Kennzahlen' }),
      el('ul', {}, C.METRICS.filter(function (m) { return m.formula; }).map(function (m) { return el('li', {}, [el('b', { text: m.label + ': ' }), m.formula]); })),
      el('h2', { text: 'Bewertung' }),
      el('p', { text: 'Aktuell: KGV, KUV, Börsenwert und Free-Cashflow-Rendite aus der Discover-Bewertung, KBV, EV-Kennzahlen und PEG aus dem Screener – jeweils zum letzten Schlusskurs.' }),
      el('p', { text: 'Verlauf je Jahresbericht (KGV, KUV, KBV, EV/Umsatz, EV/EBITDA, Free-Cashflow- und Dividendenrendite, Börsenwert, Unternehmenswert): Kurs = erster Wochenschluss nach Einreichung des 10-K (Datum aus dem SEC-Meldeverlauf), Aktienzahl und Bilanz dieses Geschäftsjahres, Umsatz, EBITDA und Cashflow des Geschäftsjahres – also derselbe Aufbau wie der aktuelle Wert, mit dem Kurs nach der Veröffentlichung. Kurse sind splitbereinigt; Gewinn je Aktie und Aktienzahl werden mit dem Split-Beleg des Kursanbieters auf dieselbe Basis gebracht und gegengeprüft (Nettogewinn ÷ Aktien, ausstehende gegen verwässerte Aktien, höchstens 10 % Abweichung, kein Sprung in Split-Größe). Nur Unternehmen, die in US-Dollar berichten. Ein Jahr ohne bestandene Prüfung bleibt leer.' }),
      el('p', { text: 'Einschränkung: Die Zahlen stammen aus der jeweils neuesten SEC-Meldung. Hat ein Unternehmen einen Jahreswert später korrigiert (Restatement, z. B. in einem 10-K/A oder in den Vorjahresspalten des nächsten Jahresberichts), steht im Verlauf der korrigierte Wert, nicht der am Meldetag veröffentlichte. Die ursprünglich gemeldeten Fassungen liegen nicht vor; ein Jahr mit Korrektur kann daher vom damals sichtbaren Wert abweichen.' }),
      el('p', { text: 'Nicht im Katalog: Gewinnrendite und Kurs/Free Cashflow – sie sind die Kehrwerte von KGV und Free-Cashflow-Rendite und sagen dasselbe.' }),
      el('h2', { text: 'Vergleich und Ranglisten' }),
      el('p', { text: 'Wettbewerber = Unternehmen derselben SEC-Branche (SIC, vier Stellen), wenn es mindestens 5 sind; sonst die Branchen-Hauptgruppe. Branche = SEC-Branchen-Hauptgruppe (SIC, zwei Stellen), Sektor = Sektor des Verzeichnisses. Median und Lage beziehen sich auf alle Unternehmen der Gruppe mit gültigem Wert; der Median je Geschäftsjahr braucht mindestens 5 Unternehmen. Lage heißt „höher als x % der Gruppe“ – keine Wertung. Ranglisten sortieren eine Kennzahl mit sichtbarer Regel und Plausibilitätsgrenzen; sie sind keine Empfehlung.' }),
      el('h2', { text: 'Das Geschäft in einem Satz' }),
      el('p', { text: BUSINESS_RULE + ' Stufen und Schwellen stammen aus den Discover-Fundamentaldaten (dieselben wie auf der Discover-Aktienseite).' }),
      el('h2', { text: 'Lücken und Grenzen' }),
      el('ul', {}, [el('li', { text: 'Fehlt ein Wert, bleibt das Jahr leer. Es wird nichts geschätzt oder aufgefüllt.' }),
        el('li', { text: 'Springt die Aktienanzahl (Split ohne Rückrechnung), werden Raten über den Sprung bei Werten je Aktie nicht berechnet.' }),
        el('li', { text: 'Margen über 150 % des Umsatzes gelten als nicht plausibel (z. B. Banken mit abweichender Umsatzzeile) und werden nicht gezeigt.' }),
        el('li', { text: 'Segmentdaten, Prognosen und ESG-Daten sind nicht enthalten.' })]),
      el('p', { text: 'Keine Bewertung des Unternehmens, kein Score von Vision Universe und keine Empfehlung.' })
    ]);
  }

  function render() {
    var r = M.parseRoute(location.hash);
    var keepScroll = r.view === 'company' && main.getAttribute('data-ticker') === r.ticker && main.getAttribute('data-sub') === (r.sub || '') && r.sub;
    if (!keepScroll) window.scrollTo(0, 0);
    document.documentElement.classList.remove('fu-locked');
    main.removeAttribute('data-view');
    if (r.view !== 'company') { main.removeAttribute('data-ticker'); main.removeAttribute('data-fu-source'); }
    main.setAttribute('data-sub', r.sub || '');
    if (r.view === 'company') company(r); else if (r.view === 'method') method(); else if (r.view === 'ranking') rankingView(r.id); else if (r.view === 'industry') industryView(r.id); else home(r.focus, r);
    if (r.focus === 'suche') { var q = document.getElementById('fu-q'); if (q) q.focus({ preventScroll: true }); }
    if (global.VUNavigation) global.VUNavigation.dock({});
  }
  window.addEventListener('hashchange', render);
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
