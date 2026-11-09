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
   Kein Quant-Gesamtscore, keine Supertrader-Signale. Serverdaten nur per textContent oder
   ueber VUUI (maskiert jede Eingabe); innerHTML nur in markup() mit VUUI-Ausgabe.

   Erweiterung: Jeder Bereich ist ein Modul in MODULES ({id, render(ctx)}). Spaetere
   Bereiche (persoenliche Marktveraenderungen, Watchlist-Benachrichtigungen) kommen als
   eigenes Modul dazu, sobald es dafuer eine freigegebene Datenquelle gibt - vorher nicht.
   ========================================================================= */
(function (root) {
  'use strict';
  var A = root.VUAccount, W = root.VUCore && root.VUCore.WatchlistView, Id = root.VUCore && root.VUCore.Identity;
  var U = root.VUUI, T = root.VUToday, Chart = root.VUChart;
  // Beliebte Kuerzel fuer den Leerzustand: feste Liste, keine Empfehlung (Mockup E08-b).
  var POPULAR = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META'];
  var ICONS = '/assets/product-icons.svg#';
  var SHOWN = 12;

  // Produktwelten (Reihenfolge wie die Willkommensseite; nur freigegebene Welten).
  var SHORTCUTS = [
    {id: 'discover', name: 'Discover', text: 'Aktien entdecken', href: '/discover/#/'},
    {id: 'quant', name: 'Quant', text: 'Faktoren je Aktie', href: '/quant/'},
    {id: 'fundamental', name: 'Fundamental', text: 'Zahlen aus Unternehmensberichten', href: '/fundamental/#/'},
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
  var ctx = {me: null, items: [], limits: null, ix: null, meta: null, names: null, summary: 'loading', moves: {}, sort: 'own'};

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

  MODULES.push({id: 'greeting', render: function () {
    // Redesign (Mockup E08): Titel „Watchlist“, Tarif-Marke „Free · 5 von 500“; die Begruessung steht auf /willkommen/.
    var me = ctx.me || {}, name = me.profile && me.profile.displayName;
    $('md-hello').setAttribute('data-greeting', greeting(new Date().getHours()) + (name ? ', ' + name : ''));
    var plan = (me.entitlements && me.entitlements.plan_id) || 'free', limit = ctx.limits && ctx.limits.items;
    $('md-plan').textContent = ({free: 'Free', plus: 'Plus', pro: 'Pro'}[plan] || plan) + ' · ' + ctx.items.length + (limit ? ' von ' + limit : '');
    $('md-plan').hidden = false;
  }});

  MODULES.push({id: 'watchlist', render: function () {
    var list = $('md-rows'), all = ctx.items.map(viewOf);
    all.forEach(function (v) { var m = ctx.moves[v.instrumentId] || {}; v.pct = typeof m.pct === 'number' ? m.pct : null; v.spark = m.values || []; });
    list.textContent = '';
    $('md-watch-empty').hidden = all.length > 0;
    $('md-watch-all').hidden = !all.length;
    $('md-watch-fine').hidden = !all.length;
    $('md-help').hidden = !all.length;
    $('md-sort').hidden = all.length < 2;
    T.sortRows(all, ctx.sort).slice(0, SHOWN).forEach(function (v) { list.appendChild(row(v)); });
    // Schwarze Tageskarte (Mockup E08): Anzahl im Plus, groesste Bewegung, Kuerzel mit Bewegung.
    var priced = all.filter(function (v) { return v.price && v.price.date; }), day = $('md-day');
    day.hidden = !all.length;
    if (all.length) {
      var last = priced.map(function (v) { return v.price.date; }).sort().pop(), sum = T.summary(all.slice(0, SHOWN));
      $('md-day-date').textContent = last ? weekday(last) + ', Schluss ' + fmtLong(last) : 'Noch kein Schlusskurs';
      if (sum.measured) {
        $('md-day-n').textContent = sum.up + ' von ' + sum.measured;
        $('md-day-unit').textContent = 'im Plus';
        $('md-day-sub').textContent = sum.biggest ? 'Größte Bewegung: ' + sum.biggest.ticker + ' ' + U.pct(sum.biggest.pct) : '';
      } else {
        $('md-day-n').textContent = String(all.length);
        $('md-day-unit').textContent = all.length === 1 ? 'Aktie' : 'Aktien';
        $('md-day-sub').textContent = 'Die Tagesbewegung ist gerade nicht verfügbar.';
      }
      var chips = $('md-day-chips'); chips.textContent = '';
      all.slice(0, 6).forEach(function (v) {
        chips.appendChild(el('li', {className: typeof v.pct === 'number' && v.pct > 0 ? 'is-up' : ''}, [el('b', {text: v.ticker || '–'}), el('span', {text: typeof v.pct === 'number' ? U.pct(v.pct) : '–'})]));
      });
    }
    if (all.length > SHOWN) {
      list.appendChild(el('li', {className: 'md-row md-row--more'}, [el('a', {className: 'ka-link', href: '/konto/watchlist/',
        text: 'Alle ' + all.length + ' Aktien anzeigen'})]));
    }
  }});

  /* C10 Aktienzeile (VUUI.stockRow) mit Mini-Chart (C06 klein) und Bewegung (C07).
     Nach links wischen legt „Entfernen“ frei; der Knopf ist auch per Tastatur erreichbar. */
  function row(v) {
    var href = stockHref(v), priced = v.price && v.price.state !== 'UNAVAILABLE' && typeof v.price.close === 'number';
    var sub = v.identity && v.identity.reasonText ? v.identity.reasonText
      : priced ? [v.ticker, v.exchange, v.price.state === 'STALE' ? 'veraltet · ' + fmtDate(v.price.date) : ''].filter(Boolean).join(' · ') : 'kein Kurs';
    var html = U.stockRow({ticker: v.ticker || '–', name: cleanName(v.name) || v.ticker || 'Unbekannte Aktie', sub: sub, href: href || null,
      chart: Chart && v.spark && v.spark.length > 1 ? Chart.sparkline(v.spark) : '', price: priced ? v.price.close : null,
      currency: priced ? v.price.currency : null, changePct: v.pct, noPrice: !priced});
    var li = el('li', {className: 'md-row'}), slide = markup(el('div', {className: 'md-slide'}), html);
    var remove = el('button', {className: 'md-remove', type: 'button', 'aria-label': (v.ticker || 'Aktie') + ' aus der Watchlist entfernen', text: 'Entfernen'});
    remove.addEventListener('click', function () { removeItem(v, remove); });
    li.appendChild(remove); li.appendChild(slide);
    swipe(li, slide);
    return li;
  }
  function swipe(li, slide) {
    var x0 = null, y0 = 0, dx = 0, open = false;
    slide.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse') return; x0 = e.clientX; y0 = e.clientY; dx = 0; });
    slide.addEventListener('pointermove', function (e) {
      if (x0 === null) return;
      dx = e.clientX - x0;
      if (Math.abs(e.clientY - y0) > 24 && Math.abs(dx) < 24) { x0 = null; return; }
      if (dx < -6 || open) slide.style.transform = 'translateX(' + Math.max(-104, Math.min(0, (open ? -96 : 0) + dx)) + 'px)';
    });
    function end() {
      if (x0 === null) return;
      x0 = null;
      open = open ? dx < 40 : dx < -48;
      li.classList.toggle('is-open', open);
      slide.style.transform = '';
    }
    slide.addEventListener('pointerup', end);
    slide.addEventListener('pointercancel', end);
    slide.addEventListener('click', function (e) { if (open || Math.abs(dx) > 8) { e.preventDefault(); if (open && Math.abs(dx) < 8) { open = false; li.classList.remove('is-open'); } } }, true);
  }

  function removeItem(v, btn) {
    btn.disabled = true;
    return A.post('/v1/watchlist/items/remove', {instrumentId: v.instrumentId}).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return notice(A.message(r.state), 'error');
      ctx.items = ctx.items.filter(function (i) { return i.instrumentId !== v.instrumentId; });
      forgetButtonCache();
      render(['greeting', 'watchlist', 'local']);
      notice((v.ticker || 'Aktie') + ' entfernt.', 'ok', {label: 'Rückgängig', run: function () { addItem({instrumentId: v.instrumentId, ticker: v.ticker}); }});
    });
  }
  function addItem(hit, input) {
    return A.post('/v1/watchlist/items', {instrumentId: hit.instrumentId, ticker: hit.ticker}).then(function (r) {
      if (!r.ok) return notice(A.message(r.state), 'error');
      if (input) { input.value = ''; $('md-results').textContent = ''; $('md-results').hidden = true; input.setAttribute('aria-expanded', 'false'); }
      notice(r.data.state === 'ALREADY_PRESENT' ? hit.ticker + ' ist bereits auf deiner Watchlist.' : hit.ticker + ' hinzugefügt.', 'ok');
      return loadItems().then(loadSummary).then(function () { render(['greeting', 'watchlist', 'local']); });
    });
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

  MODULES.push({id: 'sort', once: true, render: function () {
    var bar = $('md-sort');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sort]');
      if (!b) return;
      ctx.sort = b.getAttribute('data-sort');
      [].forEach.call(bar.querySelectorAll('[data-sort]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      render(['watchlist']);
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
    $('md-local-card-title').textContent = lists ? lists + (lists === 1 ? ' Liste' : ' Listen') + ' auf diesem Gerät' : 'Auf diesem Gerät gemerkt';
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
        return loadItems().then(loadSummary).then(function () { render(['greeting', 'watchlist', 'local']); });
      });
    });
  }

  MODULES.push({id: 'shortcuts', once: true, render: function () {
    var ul = $('md-tiles');
    ul.textContent = '';
    SHORTCUTS.forEach(function (p) {
      ul.appendChild(el('li', {}, [el('a', {className: 'vu-box md-tile', href: p.href, 'data-product': p.id},
        [markup(el('span', {className: 'md-tile-icon'}), U.hud(p.id, 38)), el('b', {text: p.name}), el('small', {text: p.text})])]));
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
      }).then(function () {
        $('md-loading').hidden = true;
        $('md-app').hidden = false;
        if (ctx.summary !== 'ok') notice('Die Kurse sind gerade nicht verfügbar. Deine Watchlist ist gespeichert.', 'info');
        // Offene Pro-Bestellung: dezenter Hinweis, keine Umleitung (die Pro-Bestaetigung hat Vorrang nur direkt nach der Anmeldung).
        if (ctx.me && A.proPending(ctx.me, null)) notice('Deine Pro-Bestellung ist noch offen.', 'info', {label: 'Fortsetzen', run: function () { go(A.PRO_CONFIRM); }});
        render();
      });
    });
  }

  /* Platz 2 der Leiste „Mein Bereich“: #/gespeichert zeigt das lokal Gemerkte und den Schnellzugriff. */
  function syncView() {
    var saved = /^#\/gespeichert/.test(root.location.hash || '');
    document.documentElement.setAttribute('data-md-view', saved ? 'gespeichert' : 'watchlist');
    $('md-hello').textContent = saved ? 'Gespeichert' : 'Watchlist';
    $('md-eyebrow').textContent = saved ? 'Mein Bereich' : 'Mein Dashboard';
  }
  if (typeof document !== 'undefined') {
    syncView(); root.addEventListener('hashchange', syncView);
    if (root.VUNavigation) root.VUNavigation.dock({});
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
