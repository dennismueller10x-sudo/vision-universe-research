/* =========================================================================
   VISION UNIVERSE — konto/watchlist.js
   Persoenliche Watchlist (/konto/watchlist/). Die Auswahl des Nutzers kommt
   von der Konto-API (/v1/watchlist), alle Kennzahlen aus der gemeinsamen
   Uebersicht /core/data/watchlist-summary-v1/ (nur die benoetigten Teile), ausgewertet von
   core/watchlist-view.js (Zustaende, Gates, Aktualitaet). Diese Datei
   zeichnet nur. Serverdaten nur per textContent (kein innerHTML).
   ========================================================================= */
(function (root) {
  'use strict';
  var W = root.VUCore && root.VUCore.WatchlistView;
  var Id = root.VUCore && root.VUCore.Identity;
  var UI_KEY = 'vu-watchlist-ui-v1';
  var LEGACY_KEYS = ['vu-discover-watchlist-v1', 'vu.quant.watchlist.v1'];
  var FACTORS = ['quality', 'growth', 'momentum', 'value', 'profitability', 'revisions', 'risk'];
  var PRODUCT = {discover: 'Discover', quant: 'Quant', technical: 'Technical', technik: 'Chartbild', supertrader: 'Supertrader', fundamental: 'Fundamental'};
  var ALERTS = [['PRICE_EVENT', 'Neues 52W-Hoch und Volumen'], ['SUPERTRADER_SIGNAL', 'Gültiges Supertrader-Signal'], ['QUANT_CHANGE', 'Deutliche Faktoränderung']];
  var ICON = {
    bookmark: 'M6 3h12v18l-6-4-6 4z', high: 'M3 17l6-6 4 4 8-8M15 7h6v6', volume: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
    trader: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z', quant: 'M4 19h16M7 16V9M12 16V5M17 16v-4', alert: 'M12 8v5M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z',
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z'
  };

  // ------------------------------------------------------------ Bausteine
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'text') n.textContent = v;
      else if (k === 'className') n.className = v;
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'wl-icon');
    p.setAttribute('d', ICON[name]); svg.appendChild(p);
    return svg;
  }
  function $(id) { return document.getElementById(id); }
  function fmtNum(v, d) { return typeof v === 'number' ? v.toLocaleString('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d}) : '–'; }
  function fmtPrice(p) {
    if (!p || typeof p.close !== 'number') return '–';
    try { return new Intl.NumberFormat('de-DE', {style: 'currency', currency: p.currency || 'USD', minimumFractionDigits: p.close < 1 ? 4 : 2, maximumFractionDigits: p.close < 1 ? 4 : 2}).format(p.close); }
    catch (e) { return fmtNum(p.close, 2) + ' ' + (p.currency || ''); }
  }
  function fmtDate(iso) { if (!iso) return '–'; var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? '–' : d.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'}); }
  function pct(v) { return typeof v === 'number' ? (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v * 100), 1) + ' %' : '–'; }
  function chip(text, tone, ic, title) { return el('span', {className: 'wl-chip', 'data-tone': tone || null, title: title || null}, [ic ? icon(ic) : null, text]); }
  function loadUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveUi(s) { try { localStorage.setItem(UI_KEY, JSON.stringify(s)); } catch (e) { /* nur Komfort */ } }

  // ------------------------------------------------------------ Zustand
  var A, notice, state = {ix: null, meta: null, names: null, summaryState: 'loading', items: [], limits: null, ui: {}};

  function fetchJson(path) {
    return fetch(path, {cache: 'default', credentials: 'omit'}).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status); return r.json(); });
  }
  /* Namensverzeichnis (Suche, Uebernahme, geaenderte Ticker) erst bei Bedarf. */
  function ensureNames() {
    if (!state.names) state.names = fetchJson(W.PATHS.names).then(function (d) { return W.index(d); }, function () { state.names = null; return null; });
    return state.names;
  }
  function keysFor(tickers) { return tickers.map(function (t) { return t && Id.normalizeTicker(t) ? Id.shardKey(t) : null; }).filter(Boolean); }
  /* Nur die Scherben der eigenen Titel. Ein seit dem Speichern geaenderter Ticker wird ueber das Namensverzeichnis gefunden. */
  function loadSummary() {
    return W.load(fetchJson, keysFor(state.items.map(function (i) { return i.ticker; })), state.meta).then(function (r) {
      state.meta = r.meta; state.ix = W.index(r.doc); state.summaryState = 'ok';
      var missing = state.items.filter(function (i) { return !state.ix.get(i.instrumentId); });
      if (!missing.length) return;
      return ensureNames().then(function (names) {
        if (!names) return;
        var extra = missing.map(function (i) { var r0 = names.get(i.instrumentId); return r0 ? r0.s : null; }).filter(Boolean);
        if (!extra.length) return;
        return W.load(fetchJson, keysFor(state.items.map(function (i) { return i.ticker; }).concat(extra)), state.meta).then(function (r2) { state.ix = W.index(r2.doc); });
      });
    }).catch(function () { state.ix = null; state.summaryState = 'missing'; });
  }
  function loadItems() {
    // Der Lesezeichen-Speicher der Aktienseiten (assets/watchlist-button.js) wird hier neu aufgebaut.
    try { sessionStorage.removeItem('vu-watchlist-ids-v1'); } catch (e) { /* leer */ }
    return A.get('/v1/watchlist').then(function (r) {
      if (!r.ok) { notice(A.message(r.state), 'error'); return false; }
      state.items = r.data.items || []; state.limits = r.data.limits || null;
      return true;
    });
  }
  function views() {
    var now = new Date();
    return state.items.map(function (it) {
      if (state.ix) return W.view(state.ix, it, now);
      var na = {state: 'UNAVAILABLE', reason: 'SOURCE_MISSING', reasonText: 'Kennzahlen gerade nicht verfügbar'};
      return {instrumentId: it.instrumentId, ticker: it.ticker, name: null, note: it.note, alerts: it.alerts || {}, listId: it.listId, addedAt: it.addedAt,
        identity: na, price: na, quant: na, high52: na, volume: na, trend: na, supertrader: na, links: [], relevance: 0};
    });
  }

  // ------------------------------------------------------------ Kopfkennzahlen
  function renderKpis(all) {
    var box = $('wl-kpis'), agg = W.aggregate(all), lim = state.limits;
    box.textContent = '';
    [[String(agg.total) + (lim && lim.items ? ' / ' + lim.items : ''), 'Beobachtet', 'bookmark', null],
      [String(agg.validSupertrader), 'Gültiges Supertrader-Signal', 'trader', agg.validSupertrader ? 'up' : null],
      [String(agg.newHighs), 'Neues 52W-Hoch', 'high', agg.newHighs ? 'up' : null],
      [String(agg.nearHighs), 'Nahe 52W-Hoch', 'high', null],
      [String(agg.volumeSpikes), 'Volumen ≥ 2×', 'volume', null],
      [String(agg.stale + agg.unavailable + agg.delisted), 'Prüfung offen', 'alert', agg.stale + agg.unavailable + agg.delisted ? 'warn' : null]
    ].forEach(function (k) {
      box.appendChild(el('div', {className: 'wl-kpi', 'data-tone': k[3]}, [icon(k[2]), el('b', {text: k[0]}), el('span', {text: k[1]})]));
    });
    renderDistribution(agg);
  }
  function renderDistribution(agg) {
    var box = $('wl-dist'), qs = state.ix && state.ix.doc.sources.quant;
    box.textContent = '';
    if (!qs) { box.appendChild(el('p', {className: 'ka-muted', text: 'Quant-Faktoren nicht verfügbar.'})); return; }
    var order = ['VERY_STRONG', 'STRONG', 'NEUTRAL', 'WEAK', 'VERY_WEAK'];
    FACTORS.forEach(function (id) {
      var b = agg.quantBands[id], total = b ? order.reduce(function (n, k) { return n + b[k]; }, 0) : 0;
      var bar = el('div', {className: 'wl-dist-bar', role: 'img', 'aria-label': W.FACTOR_LABEL[id] + ': ' + (total ? order.map(function (k) { return b[k] + ' ' + bandLabel(k); }).join(', ') : 'keine Werte')});
      order.forEach(function (k) { if (b && b[k]) bar.appendChild(el('i', {'data-band': k, 'data-w': String(Math.round(b[k] / total * 100)), title: b[k] + ' × ' + bandLabel(k)})); });
      box.appendChild(el('div', {className: 'wl-dist-row'}, [el('span', {text: W.FACTOR_LABEL[id]}), bar, el('small', {text: total ? String(total) : '–'})]));
    });
    Array.prototype.forEach.call(box.querySelectorAll('i[data-w]'), function (i) { i.style.flexGrow = i.getAttribute('data-w'); });
    box.appendChild(el('p', {className: 'wl-fine', text: 'Stufen je Faktor aus Quant (Position im Universum). Ein Gesamtscore ist nicht freigegeben' +
      (qs.publication && qs.publication.reason ? ' (' + qs.publication.reason + ').' : '.')}));
  }
  function bandLabel(id) { var b = (state.ix.doc.sources.quant.bands || []).filter(function (x) { return x.id === id; })[0]; return b ? b.label : id; }

  function renderSources() {
    var box = $('wl-sources');
    box.textContent = '';
    if (!state.ix) { box.appendChild(chip('Kennzahlen nicht verfügbar', 'warn', 'alert')); return; }
    var s = state.ix.doc.sources, now = new Date();
    [['price', 'Kurse'], ['quant', 'Quant'], ['technical', 'Technik'], ['supertrader', 'Supertrader']].forEach(function (x) {
      if (!s[x[0]]) { box.appendChild(chip(x[1] + ': nicht verfügbar', 'warn')); return; }
      var f = W.freshness(state.ix.doc, x[0], s[x[0]].asOf, now);
      box.appendChild(chip(x[1] + ' ' + fmtDate(s[x[0]].asOf), f.state === 'STALE' ? 'down' : f.state === 'WARN' ? 'warn' : null, 'clock',
        f.state === 'STALE' ? 'Datenstand veraltet' : f.state === 'WARN' ? 'Ein Handelstag Verzug' : 'Aktuell'));
    });
  }

  // ------------------------------------------------------------ Zeilen
  function highChip(h) {
    if (h.state === 'STALE') return chip('52W: veraltet', 'warn', 'clock');
    if (h.state !== 'AVAILABLE') return chip('52W: nicht verfügbar', 'muted');
    if (h.signal === 'NEW_HIGH') return chip('Neues 52W-Hoch', 'up', 'high');
    if (h.signal === 'NEAR_HIGH') return chip('Nahe Hoch ' + pct(h.distance), null, 'high');
    if (h.signal === 'RECENT_HIGH') return chip(h.label.replace('52-Wochen-', '52W-'), 'muted', 'high', 'Auf Wochen- bzw. Monatsschluss gerechnet, kein heutiges Hoch');
    return chip('52W ' + pct(h.distance), 'muted');
  }
  function volumeChip(v) {
    if (v.state === 'STALE') return null;
    if (v.state !== 'AVAILABLE') return null;
    if (v.signal === 'SPIKE') return chip('Volumen ' + fmtNum(v.relVol, 1) + '×', 'up', 'volume', v.label);
    if (v.signal === 'ELEVATED') return chip('Volumen ' + fmtNum(v.relVol, 1) + '×', null, 'volume', v.label);
    return null;
  }
  function traderChip(s) {
    if (s.state === 'STALE') return chip('Supertrader: veraltet', 'warn', 'clock');
    if (s.state !== 'AVAILABLE') return chip('Supertrader: ' + (s.reason === 'NOT_COVERED' ? 'keine Abdeckung' : 'nicht verfügbar'), 'muted');
    if (s.status === 'VALID_SIGNAL') return chip('Supertrader gültig', 'up', 'trader');
    if (s.status === 'RESEARCH_ONLY') return chip('Supertrader: Forschung', 'muted', 'trader', 'Strategie in Prüfung – kein freigegebenes Signal');
    return chip('Supertrader: kein Setup', 'muted');
  }
  var TREND = {BULLISH: 'Aufwärtstrend', BEARISH: 'Abwärtstrend', MIXED: 'Gemischt', RANGE: 'Seitwärts', UNDETERMINED: 'Unklar'};
  function factorBars(q) {
    var wrap = el('div', {className: 'wl-factors', role: 'img'});
    if (q.state !== 'AVAILABLE' && q.state !== 'STALE') { wrap.setAttribute('aria-label', 'Quant nicht verfügbar'); wrap.appendChild(el('span', {className: 'ka-muted', text: 'Quant –'})); return wrap; }
    wrap.setAttribute('aria-label', 'Quant-Faktoren: ' + q.factors.map(function (f) { return f.label + ' ' + (f.bandLabel || 'nicht verfügbar'); }).join(', '));
    q.factors.forEach(function (f) { wrap.appendChild(el('i', {'data-band': f.band || 'NONE', title: f.label + ': ' + (f.state === 'AVAILABLE' ? fmtNum(f.score, 0) + ' · ' + f.bandLabel : 'nicht verfügbar')})); });
    return wrap;
  }

  function row(v) {
    var li = el('li', {className: 'wl-row', 'data-instrument': v.instrumentId});
    var inactive = v.identity.state !== 'AVAILABLE';
    var name = el('div', {className: 'wl-name'}, [
      el('b', {text: v.name || v.ticker || v.instrumentId}),
      el('span', {className: 'wl-meta', text: [v.ticker, v.exchange].filter(Boolean).join(' · ') || '–'})]);
    var price = el('div', {className: 'wl-price'});
    if (v.price.state === 'AVAILABLE' || v.price.state === 'STALE') {
      price.appendChild(el('b', {text: fmtPrice(v.price)}));
      price.appendChild(el('span', {className: 'wl-meta', 'data-tone': v.price.state === 'STALE' ? 'down' : v.price.freshness && v.price.freshness.state === 'WARN' ? 'warn' : null,
        text: 'Schluss ' + fmtDate(v.price.date) + (v.price.state === 'STALE' ? ' · veraltet' : '')}));
    } else price.appendChild(el('span', {className: 'wl-meta', text: v.price.reasonText || 'Nicht verfügbar'}));
    var chips = el('div', {className: 'wl-chips'});
    if (inactive) chips.appendChild(chip(v.identity.reasonText || 'Nicht verfügbar', 'warn', 'alert'));
    else {
      [highChip(v.high52), volumeChip(v.volume), traderChip(v.supertrader)].forEach(function (c) { if (c) chips.appendChild(c); });
      if (v.trend.state === 'AVAILABLE' && v.trend.structure) chips.appendChild(chip(TREND[v.trend.structure] || v.trend.structure, v.trend.structure === 'BULLISH' ? null : 'muted'));
      if (v.identity.tickerChanged) chips.appendChild(chip('Ticker geändert (war ' + v.tickerAtAdd + ')', 'warn'));
    }
    var remove = el('button', {type: 'button', className: 'wl-remove', 'aria-label': (v.ticker || 'Titel') + ' aus der Watchlist entfernen', 'aria-pressed': 'true', title: 'Aus der Watchlist entfernen'}, [icon('bookmark')]);
    remove.addEventListener('click', function () { removeItem(v, remove); });
    var head = el('div', {className: 'wl-row-main'}, [name, price, chips, factorBars(v.quant), remove]);
    li.appendChild(head);
    li.appendChild(details(v));
    return li;
  }

  function details(v) {
    var d = el('details', {className: 'wl-details'}), body = el('div', {className: 'wl-details-body'});
    d.appendChild(el('summary', {text: 'Details, Notiz und Benachrichtigung'}));
    // Quant
    var q = v.quant, qs = el('section', {}, [el('h3', {text: 'Quant-Faktoren'})]);
    if (q.state === 'AVAILABLE' || q.state === 'STALE') {
      var t = el('table', {className: 'wl-table'}), tb = el('tbody');
      q.factors.forEach(function (f) { tb.appendChild(el('tr', {}, [el('th', {text: f.label}), el('td', {className: 'num', text: f.state === 'AVAILABLE' ? fmtNum(f.score, 0) : '–'}),
        el('td', {text: f.state === 'AVAILABLE' ? f.bandLabel : 'Nicht verfügbar'})])); });
      t.appendChild(tb); qs.appendChild(t);
      qs.appendChild(el('p', {className: 'wl-fine', text: 'Gesamtscore: nicht freigegeben · Datenqualität ' + (q.dataQuality || '–') + ' · Stand ' + fmtDate(q.asOf) +
        (q.state === 'STALE' ? ' · veraltet' : '')}));
    } else qs.appendChild(el('p', {className: 'ka-muted', text: q.reasonText || 'Nicht verfügbar'}));
    body.appendChild(qs);
    // Supertrader
    var s = v.supertrader, ss = el('section', {}, [el('h3', {text: 'Supertrader'})]);
    if (s.state === 'AVAILABLE' && s.entries.length) {
      var ul = el('ul', {className: 'wl-list'});
      s.entries.forEach(function (e) { ul.appendChild(el('li', {}, [el('b', {text: e.name}), ' · ' + e.stateLabel + ' · ', el('span', {className: e.released ? null : 'ka-muted', text: e.released ? 'freigegeben' : (e.levelLabel || 'nicht freigegeben')})])); });
      ss.appendChild(ul);
    } else ss.appendChild(el('p', {className: 'ka-muted', text: s.label || s.reasonText || 'Nicht verfügbar'}));
    body.appendChild(ss);
    // Technik
    var tr = v.trend, ts = el('section', {}, [el('h3', {text: 'Technik'})]);
    if (tr.state === 'AVAILABLE' || tr.state === 'STALE') {
      var kv = el('dl', {className: 'ka-kv'});
      [['Abstand zum 52W-Hoch', pct(v.high52.distance)], ['RSI 14', fmtNum(tr.rsi14, 0)], ['Über 200-Tage-Linie', tr.aboveSma200 === true ? 'ja' : tr.aboveSma200 === false ? 'nein' : '–'],
        ['Relatives Volumen', v.volume.relVol == null ? '–' : fmtNum(v.volume.relVol, 2) + '×'], ['Stand', fmtDate(tr.asOf) + (tr.state === 'STALE' ? ' · veraltet' : '')]].forEach(function (x) {
        kv.appendChild(el('dt', {text: x[0]})); kv.appendChild(el('dd', {text: x[1]}));
      });
      ts.appendChild(kv);
    } else ts.appendChild(el('p', {className: 'ka-muted', text: tr.reasonText || 'Nicht verfügbar'}));
    body.appendChild(ts);
    // Notiz und Benachrichtigung
    var ns = el('section', {className: 'wl-own'}, [el('h3', {text: 'Deine Notiz'})]);
    var ta = el('textarea', {className: 'ka-input ka-textarea', maxlength: '500', 'aria-label': 'Notiz zu ' + (v.ticker || 'diesem Titel')});
    ta.value = v.note || '';
    var save = el('button', {type: 'button', className: 'ka-btn ka-btn--secondary', text: 'Notiz speichern'});
    save.addEventListener('click', function () { patchItem(v, {note: ta.value}, save, 'Notiz gespeichert.'); });
    ns.appendChild(ta); ns.appendChild(el('div', {className: 'ka-actions'}, [save]));
    var fs = el('fieldset', {className: 'ka-fieldset wl-alerts'}, [el('legend', {className: 'ka-legend', text: 'Benachrichtigen bei'})]);
    ALERTS.forEach(function (a) {
      var id = 'wl-' + v.instrumentId + '-' + a[0], cb = el('input', {type: 'checkbox', id: id});
      cb.checked = v.alerts && v.alerts[a[0]] === true;
      cb.addEventListener('change', function () { var next = Object.assign({}, v.alerts || {}); next[a[0]] = cb.checked; patchItem(v, {alerts: next}, cb, 'Benachrichtigung gespeichert. Versendet wird erst nach der Freigabe.'); });
      fs.appendChild(el('label', {className: 'ka-check', for: id}, [cb, a[1]]));
    });
    fs.appendChild(el('p', {className: 'wl-fine', text: 'Gespeichert, aber noch nicht aktiv: Benachrichtigungen werden erst mit der Freigabe versendet.'}));
    ns.appendChild(fs);
    body.appendChild(ns);
    // Links
    if (v.links.length) {
      var nav = el('nav', {className: 'wl-links', 'aria-label': 'In den Produktwelten öffnen'});
      v.links.forEach(function (l) { nav.appendChild(el('a', {className: 'ka-link', href: l.href, text: PRODUCT[l.product] || l.product})); });
      body.appendChild(nav);
    }
    d.appendChild(body);
    return d;
  }

  // ------------------------------------------------------------ Liste
  function render() {
    var all = views(), ui = state.ui;
    renderKpis(all);
    renderSources();
    var list = W.sort(W.filter(all, {query: ui.query, filter: ui.filter}), ui.sort || 'relevance');
    var box = $('wl-list');
    box.textContent = '';
    $('wl-empty').hidden = all.length > 0;
    $('wl-count').textContent = list.length === all.length ? all.length + ' Titel' : list.length + ' von ' + all.length + ' Titeln';
    if (all.length && !list.length) box.appendChild(el('p', {className: 'ka-muted', text: 'Keine Titel für diese Auswahl.'}));
    var groups = ui.group ? W.group(list) : [{id: 'all', label: null, items: list}];
    groups.forEach(function (g) {
      if (g.label) box.appendChild(el('h2', {className: 'wl-group', text: g.label + ' · ' + g.items.length}));
      var ul = el('ul', {className: 'wl-rows'});
      g.items.forEach(function (v) { ul.appendChild(row(v)); });
      box.appendChild(ul);
    });
  }

  // ------------------------------------------------------------ Aktionen
  function removeItem(v, btn) {
    btn.disabled = true;
    A.post('/v1/watchlist/items/remove', {instrumentId: v.instrumentId}).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return notice(A.message(r.state), 'error');
      state.items = state.items.filter(function (i) { return i.instrumentId !== v.instrumentId; });
      try { sessionStorage.removeItem('vu-watchlist-ids-v1'); } catch (e) { /* leer */ }
      notice((v.ticker || 'Titel') + ' entfernt.', 'ok');
      render();
    });
  }
  function patchItem(v, patch, ctl, done) {
    ctl.disabled = true;
    A.patch('/v1/watchlist/items', Object.assign({instrumentId: v.instrumentId, listId: v.listId}, patch)).then(function (r) {
      ctl.disabled = false;
      if (!r.ok) return notice(A.message(r.state), 'error');
      state.items.forEach(function (i) { if (i.instrumentId === v.instrumentId && i.listId === v.listId) { if ('note' in patch) i.note = r.data.item.note; if ('alerts' in patch) i.alerts = r.data.item.alerts; } });
      v.note = r.data.item.note; v.alerts = r.data.item.alerts;
      notice(done, 'ok');
    });
  }
  function addItem(hit, input) {
    A.post('/v1/watchlist/items', {instrumentId: hit.instrumentId, ticker: hit.ticker}).then(function (r) {
      if (!r.ok) return notice(A.message(r.state), 'error');
      input.value = ''; $('wl-results').textContent = ''; $('wl-results').hidden = true;
      notice(r.data.state === 'ALREADY_PRESENT' ? hit.ticker + ' ist bereits auf deiner Watchlist.' : hit.ticker + ' hinzugefügt.', 'ok');
      return loadItems().then(loadSummary).then(render);
    });
  }

  function setupToolbar() {
    var ui = state.ui;
    var q = $('wl-query'), f = $('wl-filter'), s = $('wl-sort'), g = $('wl-group');
    q.value = ui.query || ''; f.value = ui.filter || 'all'; s.value = ui.sort || 'relevance'; g.checked = !!ui.group;
    function apply() { ui.query = q.value; ui.filter = f.value; ui.sort = s.value; ui.group = g.checked; saveUi({filter: ui.filter, sort: ui.sort, group: ui.group}); render(); }
    q.addEventListener('input', apply); f.addEventListener('change', apply); s.addEventListener('change', apply); g.addEventListener('change', apply);
  }

  function setupAdd() {
    var input = $('wl-add'), out = $('wl-results');
    if (state.summaryState !== 'ok') { input.disabled = true; input.placeholder = 'Suche gerade nicht verfügbar'; return; }
    var hits = [], active = -1, seq = 0;
    function draw() {
      out.textContent = '';
      out.hidden = !hits.length;
      input.setAttribute('aria-expanded', hits.length ? 'true' : 'false');
      hits.forEach(function (h, k) {
        var b = el('button', {type: 'button', role: 'option', className: 'wl-result', id: 'wl-opt-' + k, 'aria-selected': k === active ? 'true' : 'false'},
          [el('b', {text: h.ticker}), el('span', {text: h.name || ''}), el('small', {text: h.exchange || ''})]);
        b.addEventListener('click', function () { addItem(h, input); });
        out.appendChild(b);
      });
    }
    function show() {
      var n = ++seq, q = input.value;
      ensureNames().then(function (names) { if (n !== seq) return; hits = names ? names.search(q, 8) : []; draw(); });
    }
    input.addEventListener('focus', ensureNames, {once: true});
    input.addEventListener('input', function () { active = -1; show(); });
    input.addEventListener('keydown', function (e) {
      if (!hits.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; draw(); input.setAttribute('aria-activedescendant', 'wl-opt-' + active); }
      else if (e.key === 'Enter') { e.preventDefault(); addItem(hits[active >= 0 ? active : 0], input); }
      else if (e.key === 'Escape') { out.hidden = true; }
    });
  }

  /* Bisherige Browser-Watchlists (Discover, Quant) einmalig uebernehmen - nur auf Wunsch. */
  function setupLegacy() {
    var box = $('wl-legacy');
    var tickers = [];
    LEGACY_KEYS.forEach(function (k) { try { var v = JSON.parse(localStorage.getItem(k) || '[]'); (Array.isArray(v) ? v : []).forEach(function (t) { if (typeof t === 'string' && tickers.indexOf(t) < 0) tickers.push(t); }); } catch (e) { /* leer */ } });
    if (!tickers.length || state.summaryState !== 'ok') { box.hidden = true; return; }
    ensureNames().then(function (names) {
      if (!names) return;
      var have = {}; state.items.forEach(function (i) { have[i.instrumentId] = true; });
      var items = tickers.map(function (t) { var id = names.resolveTicker(t); return id && !have[id] ? {instrumentId: id, ticker: t} : null; }).filter(Boolean);
      if (!items.length) { box.hidden = true; return; }
      box.hidden = false;
      $('wl-legacy-text').textContent = items.length + ' Aktie' + (items.length === 1 ? '' : 'n') + ' aus deiner bisherigen Browser-Watchlist (Discover/Quant) übernehmen?';
      var btn = $('wl-legacy-btn'), fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', function () {
        fresh.disabled = true;
        A.post('/v1/watchlist/import', {items: items.slice(0, 500)}).then(function (r) {
          fresh.disabled = false;
          if (!r.ok) return notice(A.message(r.state), 'error');
          notice(r.data.added + ' übernommen' + (r.data.limitReached ? ' – die Grenze deines Tarifs ist erreicht.' : '.'), r.data.limitReached ? 'info' : 'ok');
          box.hidden = true;
          return loadItems().then(loadSummary).then(render);
        });
      });
    });
  }

  function start(api, showNotice) {
    A = api; notice = showNotice;
    if (!W || !Id) { notice('Die Watchlist konnte nicht geladen werden.', 'error'); return; }
    state.ui = loadUi();
    loadItems().then(function (ok) { return ok ? loadSummary().then(function () { return true; }) : false; }).then(function (ok) {
      $('wl-loading').hidden = true;
      if (!ok) return;
      if (state.summaryState !== 'ok') notice('Die Kennzahlen sind gerade nicht verfügbar. Deine Watchlist ist gespeichert.', 'info');
      $('wl-app').hidden = false;
      setupToolbar(); setupAdd(); setupLegacy(); render();
    });
  }

  root.VUWatchlistPage = {start: start};
})(typeof globalThis !== 'undefined' ? globalThis : this);
