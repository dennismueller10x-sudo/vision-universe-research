/* =========================================================================
   VISION UNIVERSE — mein-dashboard/dashboard.js
   Persoenlicher Bereich nach der Anmeldung (/mein-dashboard/). Baut nur auf
   Vorhandenem auf und speichert nichts Eigenes:
     - Auswahl der Watchlist: Konto-API /v1/watchlist (Supabase, RLS), dieselben
       Aufrufe wie /konto/watchlist/ und das Lesezeichen im Aktienkopf
     - Kurse: die gemeinsame Watchlist-Uebersicht (core/watchlist-view.js), nie je Nutzer
     - "Auf diesem Geraet gemerkt": die lokalen Beobachten-Listen der Produktwelten,
       nur gelesen; Uebernahme ins Konto nur auf Klick (/v1/watchlist/import)
     - Tagesbewegung und Mini-Chart: mein-dashboard/today.js (dieselbe Tagesreihe wie der
       veroeffentlichte Schluss, ADR-002); Bausteine C07/C10/C18 aus assets/vu-ui.js (VUUI)
   Kein Quant-Gesamtscore, keine Supertrader-Signale; Ereignisse der Welten nur ueber events.js
   (Regelereignisse der Methoden als Forschung gekennzeichnet). Serverdaten nur per textContent oder
   ueber VUUI (maskiert jede Eingabe); innerHTML nur in markup() mit VUUI-Ausgabe.

   Aufbau nach dem Konzept docs/design/mein-bereich-2026-11/HANDOVER.md (Screen m-home, Präsentation
   docs/design/mein-bereich-2026-11/README.md): Begrüßung, Heute bei deinen Aktien, Watchlist-Streifen,
   Was sich getan hat (mein-dashboard/events.js), Weiter lernen, Deine Welten.

   Erweiterung: Jeder Bereich ist ein Modul in MODULES ({id, render(ctx)}). Spaetere
   Bereiche (persoenliche Marktveraenderungen, Watchlist-Benachrichtigungen) kommen als
   eigenes Modul dazu, sobald es dafuer eine freigegebene Datenquelle gibt - vorher nicht.
   ========================================================================= */
(function (root) {
  'use strict';
  var A = root.VUAccount, W = root.VUCore && root.VUCore.WatchlistView, Id = root.VUCore && root.VUCore.Identity;
  var U = root.VUUI, T = root.VUToday, Chart = root.VUChart, E = root.VUDashboardEvents;
  // Beliebte Kuerzel fuer den Leerzustand: feste Liste, keine Empfehlung (Mockup E08-b).
  var POPULAR = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META'];
  var ICONS = '/assets/product-icons.svg#';
  var SHOWN = 12;
  // Erklärvideos der Willkommensseite und ihr Gesehen-Merker (nur gelesen; geschrieben wird er nur auf /willkommen/).
  var STORIES = '/willkommen/config/stories.json', SEEN_KEY = 'vu-welcome-seen-v1';

  // Produktwelten (Reihenfolge wie die Willkommensseite; nur freigegebene Welten).
  var SHORTCUTS = [
    {id: 'discover', name: 'Discover', text: 'Aktien entdecken', href: '/discover/#/'},
    {id: 'quant', name: 'Quant', text: 'Faktoren je Aktie', href: '/quant/'},
    {id: 'fundamental', name: 'Fundamental', text: 'Zahlen aus SEC-Berichten', href: '/fundamental/#/'},
    {id: 'technical', name: 'Technical', text: 'Charts und Muster', href: '/technical/#/'},
    {id: 'screener', name: 'Screener', text: 'Eigene Filter', href: '/screener/'},
    {id: 'supertrader', name: 'Supertrader', text: 'Methoden der Profis', href: '/supertrader/'}
  ];
  // Lokale Listen: Produkt -> eigene Listenansicht der Welt.
  var LOCAL_VIEWS = {'Discover': '/discover/#/watchlist', 'Quant': '/quant/#/aktien', 'Quant-Watchlist': '/quant/#/aktien'};
  var LOCAL_ICONS = {'Discover': 'discover', 'Quant': 'quant', 'Quant-Watchlist': 'quant', 'Technical': 'technical', 'Screener': 'screener'};
  var EUROPE_KEY = 'vu.core.europe.watchlist.v1';
  // Bevorzugtes Ziel je Aktie (Adressregel aus core/stock-context.js, geliefert in view.links).
  var LINK_ORDER = ['discover', 'fundamental', 'quant', 'technical'];

  // ------------------------------------------------------------ Bausteine
  function $(id) { return document.getElementById(id); }
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
  function icon(id) {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), use = document.createElementNS(ns, 'use');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', ICONS + id); svg.appendChild(use);
    return svg;
  }
  function notice(text, kind, action) {
    var box = $('ka-status');
    box.textContent = text || '';
    box.setAttribute('data-kind', kind || 'info');
    if (action) {
      var b = el('button', {className: 'md-undo', type: 'button', text: action.label});
      b.addEventListener('click', function () { b.disabled = true; action.run(); });
      box.appendChild(document.createTextNode(' '));
      box.appendChild(b);
    }
  }
  function go(path) { root.location.assign(path); }
  // Einzige innerHTML-Stelle: nur Markup aus assets/vu-ui.js (VUUI maskiert jede Eingabe) bzw. VUChart.sparkline (nur Zahlen).
  function markup(node, html) { node.innerHTML = html; return node; }
  function cleanName(n) { return String(n || '').replace(/,? (Inc|Corp|Corporation|Ltd|Limited|plc|N\.V\.|S\.A\.|AG|SE|Holdings?|Co)\.?$/i, '').replace(/ Class [A-Z]$/, '').trim(); }
  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  function weekday(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? '' : DAYS[d.getUTCDay()]; }
  function fmtLong(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'}); }
  function fetchJson(path) {
    return fetch(path, {cache: 'default', credentials: 'omit'}).then(function (r) { if (!r.ok) throw new Error('HTTP_' + r.status); return r.json(); });
  }
  function fmtPrice(p) {
    if (!p || typeof p.close !== 'number') return null;
    var d = p.close < 1 ? 4 : 2;
    try { return new Intl.NumberFormat('de-DE', {style: 'currency', currency: p.currency || 'USD', minimumFractionDigits: d, maximumFractionDigits: d}).format(p.close); }
    catch (e) { return p.close.toFixed(d) + ' ' + (p.currency || ''); }
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    return isNaN(d) ? '' : d.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'});
  }
  function greeting(hour) { return hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'; }
  function forgetButtonCache() { try { sessionStorage.removeItem('vu-watchlist-ids-v1'); } catch (e) { /* leer */ } }

  // ------------------------------------------------------------ Zustand
  var ctx = {me: null, items: [], limits: null, ix: null, meta: null, names: null, summary: 'loading', moves: {}, events: null, stories: null};

  function ensureNames() {
    if (!ctx.names) ctx.names = fetchJson(W.PATHS.names).then(function (d) { return W.index(d); }, function () { ctx.names = null; return null; });
    return ctx.names;
  }
  function loadItems() {
    forgetButtonCache();
    return A.get('/v1/watchlist').then(function (r) {
      if (!r.ok) { notice(A.message(r.state), 'error'); return false; }
      ctx.items = (r.data.items || []).slice().sort(function (a, b) { return String(b.addedAt || '').localeCompare(String(a.addedAt || '')); });
      ctx.limits = r.data.limits || null;
      return true;
    });
  }
  function loadSummary() {
    var keys = ctx.items.map(function (i) { return i.ticker && Id.normalizeTicker(i.ticker) ? Id.shardKey(i.ticker) : null; }).filter(Boolean);
    if (!keys.length) { ctx.summary = 'ok'; return Promise.resolve(); }
    return W.load(fetchJson, keys, ctx.meta).then(function (r) { ctx.meta = r.meta; ctx.ix = W.index(r.doc); ctx.summary = 'ok'; })
      .catch(function () { ctx.ix = null; ctx.summary = 'missing'; })
      .then(loadMoves);
  }
  // Tagesbewegung und Mini-Chart je Aktie (today.js); fehlt eine Reihe, bleibt nur diese Bewegung leer.
  function loadMoves() {
    if (!T || !ctx.ix) return Promise.resolve();
    var views = ctx.items.map(viewOf).slice(0, SHOWN);
    return T.load(fetchJson, Id, views, SHOWN).then(function (moves) {
      views.forEach(function (v, k) { ctx.moves[v.instrumentId] = moves[k]; });
    });
  }
  function fetchGz(path) {
    return fetch(path, {cache: 'default', credentials: 'omit'}).then(function (r) {
      if (!r.ok || typeof DecompressionStream !== 'function') throw new Error('GZ');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
    });
  }
  /* Ereignisse der Welten zu den Watchlist-Aktien (events.js); nichts davon wird gespeichert. */
  function loadEvents() {
    if (!E || !ctx.ix) { ctx.events = null; return Promise.resolve(); }
    var stocks = views().slice(0, SHOWN).map(function (v) {
      var priced = v.price && typeof v.price.close === 'number';
      return {ticker: v.ticker, name: cleanName(v.name) || v.ticker, href: stockHref(v), funds13f: v.funds13f,
        priceText: priced ? fmtPrice(v.price) + (typeof v.pct === 'number' ? ' · ' + U.pct(v.pct) : '') : 'kein Kurs'};
    }).filter(function (s) { return s.ticker && !(s.href === null && s.name); });
    var period = ctx.meta && ctx.meta.sources && ctx.meta.sources.funds13f && ctx.meta.sources.funds13f.asOf;
    var names = root.STNames && root.STNames.method ? function (cid) { var m = root.STNames.method(cid); return m && m.name; } : null;
    return E.load(fetchJson, fetchGz, Id, stocks, {fundsPeriod: period, names: names})
      .then(function (data) { ctx.events = E.compose(stocks, data); }, function () { ctx.events = null; });
  }
  function loadStories() {
    return fetchJson(STORIES).then(function (d) { ctx.stories = (d && d.stories || []).filter(function (s) { return s && s.id && s.rev; }); }, function () { ctx.stories = null; });
  }
  function viewOf(item) {
    if (ctx.ix) return W.view(ctx.ix, item, new Date());
    return {instrumentId: item.instrumentId, ticker: item.ticker, name: null, price: {state: 'UNAVAILABLE'}, links: []};
  }
  function stockHref(v) {
    // Gesperrte Identitaet (Ticker-Wiederverwendung): die Produktseiten meinen noch das fruehere Wertpapier - kein Verweis.
    if (v.identity && v.identity.reason === 'IDENTITY_QUARANTINED') return null;
    for (var k = 0; k < LINK_ORDER.length; k++) {
      var hit = (v.links || []).filter(function (l) { return l.product === LINK_ORDER[k]; })[0];
      if (hit) return hit.href;
    }
    try { return root.VUCore.StockContext.href(root.VUCore.StockContext.fromUs(v.ticker), 'discover'); } catch (e) { return null; }
  }

  // ------------------------------------------------------------ Module
  var MODULES = [];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var SHORT_DAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  function closeLabel(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? '' : SHORT_DAYS[d.getUTCDay()] + ' ' + fmtDate(iso); }
  function chev(size) { return markup(el('span', {className: 'md-chev'}), U.glyph('next', size)); }
  function lastClose(views) { return views.filter(function (v) { return v.price && v.price.date; }).map(function (v) { return v.price.date; }).sort().pop() || null; }

  MODULES.push({id: 'greeting', render: function () {
    // Begrüßung mit Datum (Screen m-home): „Montag, 9. November“ / „Guten Tag, Dennis“.
    var me = ctx.me || {}, name = me.profile && me.profile.displayName, now = new Date(), h = $('md-hello');
    if (document.documentElement.getAttribute('data-md-view') === 'gespeichert') return;
    $('md-eyebrow').textContent = DAYS[now.getDay()] + ', ' + now.getDate() + '. ' + MONTHS[now.getMonth()];
    h.textContent = greeting(now.getHours()) + (name ? ',' : '');
    if (name) { h.appendChild(el('br')); h.appendChild(document.createTextNode(name)); }
    // Tarif-Marke „Free · 5 von 500“ klein neben dem Datum (Entscheidung beim Bauen, HANDOVER).
    var plan = (me.entitlements && me.entitlements.plan_id) || 'free', limit = ctx.limits && ctx.limits.items;
    $('md-plan').textContent = ({free: 'Free', plus: 'Plus', pro: 'Pro'}[plan] || plan) + ' · ' + ctx.items.length + (limit ? ' von ' + limit : '');
    $('md-plan').hidden = false;
  }});

  function views() {
    return ctx.items.map(viewOf).map(function (v) {
      var m = ctx.moves[v.instrumentId] || {};
      v.pct = typeof m.pct === 'number' ? m.pct : null; v.spark = m.values || [];
      return v;
    });
  }
  function thin(values, n) {
    if (values.length <= n) return values;
    var out = [], step = (values.length - 1) / (n - 1);
    for (var i = 0; i < n - 1; i++) out.push(values[Math.round(i * step)]);
    out.push(values[values.length - 1]);
    return out;
  }

  /* Heute bei deinen Aktien: drei Zahlen (auf der Watchlist, neue Ereignisse, Aktien betroffen). */
  MODULES.push({id: 'today', render: function () {
    var all = views(), last = lastClose(all), ev = ctx.events;
    $('md-today-sec').hidden = !all.length;
    $('md-today-title').textContent = 'Heute bei deinen Aktien' + (last ? ' · Schluss ' + closeLabel(last) : '');
    $('md-n-watch').textContent = String(all.length);
    $('md-n-events').textContent = ev ? String(ev.events) : '–';
    $('md-n-stocks').textContent = ev ? String(ev.stocks) : '–';
    $('md-watch-fine').textContent = 'Keine Anlageberatung.' + (last ? ' Kurse: veröffentlichter Schluss ' + closeLabel(last) : '');
  }});

  /* Watchlist als waagerechter Streifen: Logo, Kürzel, Schluss, Bewegung, Mini-Chart; am Ende „+ Aktie“. */
  MODULES.push({id: 'watchlist', render: function () {
    var strip = $('md-strip'), all = views();
    strip.textContent = '';
    $('md-watch-empty').hidden = all.length > 0;
    $('md-watch-all').hidden = !all.length;
    $('md-watch-all').textContent = 'Alle ' + all.length;
    $('md-watch-all').appendChild(chev(13));
    strip.hidden = !all.length;
    if (!all.length) { $('md-find').hidden = false; return; }
    all.slice(0, SHOWN).forEach(function (v) {
      var href = stockHref(v), priced = v.price && v.price.state !== 'UNAVAILABLE' && typeof v.price.close === 'number';
      var card = el(href ? 'a' : 'div', {className: 'md-wl', href: href || null, 'aria-label': (cleanName(v.name) || v.ticker) + (priced ? ', ' + fmtPrice(v.price) : ', kein Kurs')}, [
        markup(el('span', {}), U.logo(v.ticker)), el('b', {text: v.ticker || '–'})]);
      if (priced) {
        card.appendChild(el('div', {className: 'md-wl-p', text: fmtPrice(v.price)}));
        card.appendChild(markup(el('div', {}), U.chg(v.pct)));
        var html = Chart && v.spark.length > 1 ? Chart.sparkline(thin(v.spark, 52), {width: 90, height: 24}) : '';
        card.appendChild(markup(el('div', {className: 'md-wl-c'}), html));
      } else {
        card.appendChild(el('span', {className: 'md-wl-x', text: v.identity && v.identity.reasonText ? v.identity.reasonText : 'kein Kurs'}));
      }
      var li = el('li', {}, [card]);
      // Bearbeiten (Suche offen): „×“ entfernt eine Aktie, mit „Rückgängig“ wie bisher.
      if (!$('md-find').hidden) {
        var remove = el('button', {className: 'md-remove', type: 'button', 'aria-label': (v.ticker || 'Aktie') + ' aus der Watchlist entfernen', text: '×'});
        remove.addEventListener('click', function () { removeItem(v, remove); });
        li.appendChild(remove);
      }
      strip.appendChild(li);
    });
    var editing = !$('md-find').hidden;
    var add = el('button', {className: 'md-wl md-wl--add', type: 'button', id: 'md-edit', 'aria-controls': 'md-find', 'aria-expanded': String(editing)},
      [el('i', {text: editing ? '✓' : '+', 'aria-hidden': 'true'}), editing ? 'Fertig' : 'Aktie hinzufügen', el('small', {text: editing ? '' : 'oder entfernen'})]);
    add.addEventListener('click', function () {
      $('md-find').hidden = editing;
      render(['watchlist']);
      if (!editing) $('md-add').focus(); else $('md-edit').focus();
    });
    strip.appendChild(el('li', {}, [add]));
  }});

  /* Was sich getan hat: eine Karte je Aktie mit Ereignissen (mein-dashboard/events.js). */
  MODULES.push({id: 'events', render: function () {
    var ul = $('md-feed'), none = $('md-feed-none'), ev = ctx.events, all = views();
    $('md-events').hidden = !all.length;
    ul.textContent = '';
    if (!ev) { none.hidden = false; none.textContent = 'Die Ereignisse der Welten sind gerade nicht verfügbar.'; $('md-events-count').textContent = ''; return; }
    $('md-events-count').textContent = ev.events ? ev.events + (ev.events === 1 ? ' Ereignis' : ' Ereignisse') : '';
    none.hidden = ev.cards.length > 0;
    none.textContent = 'Heute gibt es bei deinen Aktien nichts Neues aus den Welten.';
    ev.cards.forEach(function (c) {
      var head = el(c.href ? 'a' : 'div', {className: 'md-fd-h', href: c.href || null}, [markup(el('span', {className: 'md-fd-logo'}), U.logo(c.ticker)),
        el('span', {className: 'md-fd-t'}, [el('b', {text: c.name}), el('small', {text: c.priceText})])]);
      if (c.href) head.appendChild(chev(15));
      var li = el('li', {className: 'md-fd'}, [head]);
      c.rows.forEach(function (r) {
        var row = el('a', {className: 'md-fd-r', href: U.perspectiveHref(r.world, c.ticker) + (r.world === 'supertrader' ? '#sf' : '')}, [
          markup(el('span', {}), U.hud(r.world, 28, 9)), el('span', {}, [el('small', {text: r.label}), r.text]), markup(el('span', {}), U.verdict(r.verdict, r.pill))]);
        li.appendChild(row);
      });
      ul.appendChild(li);
    });
    $('md-feed-help').lastChild.textContent = 'Ereignisse aus den veröffentlichten Daten der Welten, ohne neue Speicherung. Keine Empfehlung.' +
      (ev.research ? ' Supertrader-Methoden: Forschung, nicht zertifiziert.' : '');
  }});

  /* Weiter lernen: nächstes ungesehenes Video der Willkommensseite (nur gelesen, Merker der Willkommensseite). */
  MODULES.push({id: 'learn', render: function () {
    var list = ctx.stories, sec = $('md-learn-sec');
    if (!list || !list.length) { sec.hidden = true; return; }
    var seen = {};
    try { seen = JSON.parse(root.localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch (e) { seen = {}; }
    var done = list.filter(function (s) { return seen[s.id] === s.rev; }), next = list.filter(function (s) { return seen[s.id] !== s.rev; })[0];
    sec.hidden = false;
    $('md-learn-sub').textContent = done.length + ' von ' + list.length + ' Videos gesehen.';
    $('md-learn-all').textContent = 'Alle ' + list.length;
    $('md-learn-all').appendChild(chev(13));
    var card = $('md-learn');
    card.textContent = '';
    card.hidden = !next;
    if (!next) return;
    var video = (next.slides || []).filter(function (x) { return x.type === 'video'; })[0] || {};
    var sec2 = Math.round((next.slides || []).reduce(function (n, x) { return n + (x.duration || 0); }, 0));
    card.appendChild(markup(el('span', {className: 'vu-hud md-play'}), U.glyph('play', 18)));
    card.appendChild(el('span', {}, [el('b', {text: video.label || next.tagline}), el('small', {text: next.product + ' · ' + Math.floor(sec2 / 60) + ':' + String(sec2 % 60).padStart(2, '0')})]));
    card.appendChild(chev(18));
  }});

  function removeItem(v, btn) {
    btn.disabled = true;
    return A.post('/v1/watchlist/items/remove', {instrumentId: v.instrumentId}).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return notice(A.message(r.state), 'error');
      ctx.items = ctx.items.filter(function (i) { return i.instrumentId !== v.instrumentId; });
      forgetButtonCache();
      notice((v.ticker || 'Aktie') + ' entfernt.', 'ok', {label: 'Rückgängig', run: function () { addItem({instrumentId: v.instrumentId, ticker: v.ticker}); }});
      return refresh();
    });
  }
  function addItem(hit, input) {
    return A.post('/v1/watchlist/items', {instrumentId: hit.instrumentId, ticker: hit.ticker}).then(function (r) {
      if (!r.ok) return notice(A.message(r.state), 'error');
      if (input) { input.value = ''; $('md-results').textContent = ''; $('md-results').hidden = true; input.setAttribute('aria-expanded', 'false'); }
      notice(r.data.state === 'ALREADY_PRESENT' ? hit.ticker + ' ist bereits auf deiner Watchlist.' : hit.ticker + ' hinzugefügt.', 'ok');
      return refresh();
    });
  }
  // Nach einer Änderung der Watchlist: Kurse, Bewegungen und Ereignisse neu, dann alle Bereiche neu zeichnen.
  function refresh() {
    return loadItems().then(loadSummary).then(loadEvents).then(function () { render(['greeting', 'today', 'watchlist', 'events', 'local']); });
  }

  // Leerzustand: beliebte Kuerzel als Chips, ein Tipp nimmt sie auf (gleicher Weg wie die Suche).
  MODULES.push({id: 'popular', once: true, render: function () {
    var host = $('md-popular');
    host.textContent = '';
    POPULAR.forEach(function (t) {
      var b = el('button', {className: 'vu-chip', type: 'button', 'aria-label': t + ' zur Watchlist hinzufügen', text: '+ ' + t});
      b.addEventListener('click', function () {
        b.disabled = true;
        ensureNames().then(function (names) {
          var id = names && names.resolveTicker(t);
          if (!id) { b.disabled = false; return notice('Die Suche ist gerade nicht verfügbar.', 'info'); }
          return addItem({instrumentId: id, ticker: t});
        });
      });
      host.appendChild(b);
    });
  }});

  MODULES.push({id: 'add', once: true, render: function () {
    var input = $('md-add'), out = $('md-results');
    if (ctx.summary !== 'ok') { input.disabled = true; input.placeholder = 'Suche gerade nicht verfügbar'; return; }
    var hits = [], active = -1, seq = 0;
    function draw() {
      out.textContent = '';
      out.hidden = !hits.length;
      input.setAttribute('aria-expanded', hits.length ? 'true' : 'false');
      hits.forEach(function (h, k) {
        var b = el('button', {type: 'button', role: 'option', className: 'wl-result', id: 'md-opt-' + k, 'aria-selected': k === active ? 'true' : 'false'},
          [el('b', {text: h.ticker}), el('span', {text: h.name || ''}), el('small', {text: h.exchange || ''})]);
        b.addEventListener('click', function () { addItem(h, input); });
        out.appendChild(b);
      });
    }
    function show() {
      var n = ++seq, q = input.value;
      ensureNames().then(function (names) { if (n !== seq) return; hits = names ? names.search(q, 6) : []; draw(); });
    }
    input.addEventListener('focus', ensureNames, {once: true});
    input.addEventListener('input', function () { active = -1; show(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { out.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      if (!hits.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; draw(); input.setAttribute('aria-activedescendant', 'md-opt-' + active); }
      else if (e.key === 'Enter') { e.preventDefault(); addItem(hits[active >= 0 ? active : 0], input); }
    });
  }});

  /* Lokale Beobachten-Listen der Produktwelten: nur lesen, nichts loeschen. Was schon im Konto steht, zaehlt nicht als offen.
     Platz 2 „Gespeichert“ (Mockup E08-c): je Liste eine Karte mit „Übernehmen“; Europa wird nur gezaehlt. */
  MODULES.push({id: 'local', render: function () {
    var box = $('md-local'), ul = $('md-local-sources'), text = $('md-local-text');
    var legacy = W.legacyTickers(function (k) { return root.localStorage.getItem(k); });
    var europe = 0;
    try { var e = JSON.parse(root.localStorage.getItem(EUROPE_KEY) || '[]'); europe = Array.isArray(e) ? e.length : 0; } catch (err) { europe = 0; }
    var bySource = {};
    legacy.forEach(function (l) { l.sources.forEach(function (s) { (bySource[s] = bySource[s] || []).push(l); }); });
    var names = Object.keys(bySource), lists = names.length + (europe ? 1 : 0);
    ul.textContent = '';
    box.hidden = false;
    if (!lists) { text.textContent = 'Auf diesem Gerät ist nichts gemerkt. Was du in Discover oder Quant beobachtest, erscheint hier.'; return; }
    text.textContent = 'Diese Listen liegen nur in diesem Browser. Übernommen sind sie auf jedem Gerät da; die Listen hier bleiben unverändert.';
    names.forEach(function (s) {
      var tickers = bySource[s].map(function (l) { return l.ticker; });
      var go = el('button', {className: 'vu-btn vu-btn--sm md-take', type: 'button', text: 'Übernehmen', hidden: ctx.summary !== 'ok'});
      var li = el('li', {className: 'md-source'}, [
        markup(el('span', {className: 'md-source-icon'}), U.hud(LOCAL_ICONS[s] || 'discover', 44)),
        el('a', {className: 'md-source-text', href: LOCAL_VIEWS[s] || '/discover/#/watchlist'}, [el('b', {text: s + '-Liste'}),
          el('span', {text: tickers.slice(0, 4).join(', ') + (tickers.length > 4 ? ' und ' + (tickers.length - 4) + ' weitere' : '')})]), go]);
      go.addEventListener('click', function () { take(bySource[s], go); });
      ul.appendChild(li);
    });
    if (europe) ul.appendChild(el('li', {className: 'md-source md-source--line'}, [
      markup(el('span', {}), U.verdict('none', 'Europa')),
      el('span', {className: 'md-source-text'}, [el('b', {text: 'Europa-Liste: ' + europe + ' Titel'}), el('span', {text: 'wird nur gezählt, Übernahme folgt.'})])]));
  }});
  function take(legacy, btn) {
    btn.disabled = true;
    ensureNames().then(function (names) {
      if (!names) { btn.disabled = false; return notice('Die Übernahme ist gerade nicht möglich.', 'info'); }
      var plan = W.planMerge(names, legacy, ctx.items.map(function (i) { return i.instrumentId; }));
      if (!plan.add.length) { btn.disabled = false; return notice('Alles aus dieser Liste steht bereits in deiner Watchlist.', 'info'); }
      return A.post('/v1/watchlist/import', {items: plan.add.slice(0, 500)}).then(function (r) {
        btn.disabled = false;
        if (!r.ok) return notice(A.message(r.state), 'error');
        notice(r.data.added + ' übernommen' + (r.data.limitReached ? ' – die Grenze deines Tarifs ist erreicht.' : '.'), r.data.limitReached ? 'info' : 'ok');
        return refresh();
      });
    });
  }

  MODULES.push({id: 'shortcuts', once: true, render: function () {
    var ul = $('md-tiles');
    ul.textContent = '';
    SHORTCUTS.forEach(function (p) {
      ul.appendChild(el('li', {}, [el('a', {className: 'md-tile', href: p.href, 'data-product': p.id, title: p.text},
        [markup(el('span', {}), U.hud(p.id, 34, 10)), el('b', {text: p.name})])]));
    });
  }});

  var rendered = {};
  function render(only) {
    MODULES.forEach(function (m) {
      if (only && only.indexOf(m.id) === -1) return;
      if (m.once && rendered[m.id]) return;
      try { m.render(ctx); rendered[m.id] = true; } catch (e) { if (root.console) console.error('dashboard', m.id, e); }
    });
  }

  // ------------------------------------------------------------ Start
  function start() {
    if (!A || !A.available()) {
      $('md-loading').hidden = true;
      return notice((A ? A.message('ACCOUNTS_NOT_CONFIGURED') : 'Konten sind nicht verfügbar.') + ' Dein Dashboard steht bereit, sobald Konten freigeschaltet sind.', 'info');
    }
    if (!W || !Id || !U || !T) { $('md-loading').hidden = true; return notice('Das Dashboard konnte nicht geladen werden.', 'error'); }
    A.get('/v1/session').then(function (s) {
      if (!(s.ok && s.data && s.data.authenticated)) return go('/konto/anmelden/?next=' + encodeURIComponent('/mein-dashboard/'));
      return Promise.all([A.get('/v1/me'), loadItems()]).then(function (rs) {
        if (rs[0].ok) ctx.me = rs[0].data;
        return loadSummary();
      }).then(function () { return Promise.all([loadEvents(), loadStories()]); }).then(function () {
        $('md-loading').hidden = true;
        $('md-app').hidden = false;
        if (ctx.summary !== 'ok') notice('Die Kurse sind gerade nicht verfügbar. Deine Watchlist ist gespeichert.', 'info');
        // Offene Pro-Bestellung: dezenter Hinweis, keine Umleitung (die Pro-Bestaetigung hat Vorrang nur direkt nach der Anmeldung).
        if (ctx.me && A.proPending(ctx.me, null)) notice('Deine Pro-Bestellung ist noch offen.', 'info', {label: 'Fortsetzen', run: function () { go(A.PRO_CONFIRM); }});
        render();
      });
    });
  }

  /* Platz 2 der Leiste „Mein Bereich“: #/gespeichert zeigt das lokal Gemerkte. */
  function syncView() {
    var saved = /^#\/gespeichert/.test(root.location.hash || '');
    document.documentElement.setAttribute('data-md-view', saved ? 'gespeichert' : 'watchlist');
    if (saved) { $('md-hello').textContent = 'Gespeichert'; $('md-eyebrow').textContent = 'Mein Bereich'; }
    else render(['greeting']);
  }
  if (typeof document !== 'undefined') {
    syncView(); root.addEventListener('hashchange', syncView);
    if (root.VUNavigation) root.VUNavigation.dock({});
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
