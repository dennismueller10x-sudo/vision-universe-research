/* =========================================================================
   VISION UNIVERSE — mein-dashboard/dashboard.js
   Persoenlicher Bereich nach der Anmeldung (/mein-dashboard/). Baut nur auf
   Vorhandenem auf und speichert nichts Eigenes:
     - Auswahl der Watchlist: Konto-API /v1/watchlist (Supabase, RLS), dieselben
       Aufrufe wie /konto/watchlist/ und das Lesezeichen im Aktienkopf
     - Kurse: die gemeinsame Watchlist-Uebersicht (core/watchlist-view.js), nie je Nutzer
     - "Auf diesem Geraet gemerkt": die lokalen Beobachten-Listen der Produktwelten,
       nur gelesen; Uebernahme ins Konto nur auf Klick (/v1/watchlist/import)
   Kein Quant-Gesamtscore, keine Supertrader-Signale. Serverdaten nur per textContent.

   Erweiterung: Jeder Bereich ist ein Modul in MODULES ({id, render(ctx)}). Spaetere
   Bereiche (persoenliche Marktveraenderungen, Watchlist-Benachrichtigungen) kommen als
   eigenes Modul dazu, sobald es dafuer eine freigegebene Datenquelle gibt - vorher nicht.
   ========================================================================= */
(function (root) {
  'use strict';
  var A = root.VUAccount, W = root.VUCore && root.VUCore.WatchlistView, Id = root.VUCore && root.VUCore.Identity;
  var ICONS = '/assets/product-icons.svg#';
  var SHOWN = 12;

  // Produktwelten (Reihenfolge wie die Willkommensseite; nur freigegebene Welten).
  var SHORTCUTS = [
    {id: 'discover', name: 'Discover', text: 'Märkte', href: '/discover/#/'},
    {id: 'quant', name: 'Quant', text: 'Faktoren', href: '/quant/'},
    {id: 'fundamental', name: 'Fundamental', text: 'Kennzahlen', href: '/fundamental/#/'},
    {id: 'technical', name: 'Technical', text: 'Charts', href: '/technical/#/'},
    {id: 'screener', name: 'Screener', text: 'Aktien finden', href: '/screener/'},
    {id: 'supertrader', name: 'Supertrader', text: 'Methoden', href: '/supertrader/'}
  ];
  // Lokale Listen: Produkt -> eigene Listenansicht der Welt.
  var LOCAL_VIEWS = {'Discover': '/discover/#/watchlist', 'Quant': '/quant/#/aktien', 'Quant-Watchlist': '/quant/#/aktien'};
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
  function removeIcon() {
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    p.setAttribute('d', 'M6 3h12v18l-6-4-6 4z'); svg.appendChild(p);
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
  var ctx = {me: null, items: [], limits: null, ix: null, meta: null, names: null, summary: 'loading'};

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
      .catch(function () { ctx.ix = null; ctx.summary = 'missing'; });
  }
  function viewOf(item) {
    if (ctx.ix) return W.view(ctx.ix, item, new Date());
    return {instrumentId: item.instrumentId, ticker: item.ticker, name: null, price: {state: 'UNAVAILABLE'}, links: []};
  }
  function stockHref(v) {
    for (var k = 0; k < LINK_ORDER.length; k++) {
      var hit = (v.links || []).filter(function (l) { return l.product === LINK_ORDER[k]; })[0];
      if (hit) return hit.href;
    }
    try { return root.VUCore.StockContext.href(root.VUCore.StockContext.fromUs(v.ticker), 'discover'); } catch (e) { return null; }
  }

  // ------------------------------------------------------------ Module
  var MODULES = [];

  MODULES.push({id: 'greeting', render: function () {
    var me = ctx.me || {}, name = me.profile && me.profile.displayName;
    $('md-hello').textContent = greeting(new Date().getHours()) + (name ? ', ' + name : '');
    var plan = (me.entitlements && me.entitlements.plan_id) || 'free';
    $('md-plan').textContent = {free: 'Free', plus: 'Plus', pro: 'Pro'}[plan] || plan;
    $('md-plan').setAttribute('data-tone', plan === 'free' ? 'muted' : '');
    $('md-sub').hidden = false;
  }});

  MODULES.push({id: 'watchlist', render: function () {
    var list = $('md-rows'), all = ctx.items.map(viewOf);
    list.textContent = '';
    var limit = ctx.limits && ctx.limits.items;
    $('md-watch-count').textContent = all.length ? String(all.length) + (limit ? ' / ' + limit : '') : '';
    $('md-watch-empty').hidden = all.length > 0;
    $('md-watch-all').hidden = !all.length;
    $('md-watch-fine').hidden = !all.length;
    all.slice(0, SHOWN).forEach(function (v) { list.appendChild(row(v)); });
    if (all.length > SHOWN) {
      list.appendChild(el('li', {className: 'md-row md-row--more'}, [el('a', {className: 'ka-link', href: '/konto/watchlist/',
        text: 'Alle ' + all.length + ' Aktien anzeigen'})]));
    }
  }});

  function row(v) {
    var href = stockHref(v), price = v.price && v.price.state !== 'UNAVAILABLE' ? fmtPrice(v.price) : null;
    var main = el(href ? 'a' : 'div', {className: 'md-row-main', href: href || null}, [
      el('span', {className: 'md-ticker', text: v.ticker || '–', 'aria-hidden': 'true'}),
      el('span', {className: 'md-name'}, [el('b', {text: v.name || v.ticker || 'Unbekannte Aktie'}),
        el('small', {text: [v.ticker, v.exchange].filter(Boolean).join(' · ')})]),
      el('span', {className: 'md-price'}, price ? [el('b', {text: price}), el('small', {text: (v.price.state === 'STALE' ? 'veraltet · ' : '') + fmtDate(v.price.date)})]
        : [el('small', {text: v.identity && v.identity.reasonText ? v.identity.reasonText : 'kein Kurs'})])
    ]);
    var remove = el('button', {className: 'md-remove', type: 'button', 'aria-label': (v.ticker || 'Aktie') + ' aus der Watchlist entfernen', title: 'Entfernen'}, [removeIcon()]);
    remove.addEventListener('click', function () { removeItem(v, remove); });
    return el('li', {className: 'md-row'}, [main, remove]);
  }

  function removeItem(v, btn) {
    btn.disabled = true;
    A.post('/v1/watchlist/items/remove', {instrumentId: v.instrumentId}).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return notice(A.message(r.state), 'error');
      ctx.items = ctx.items.filter(function (i) { return i.instrumentId !== v.instrumentId; });
      forgetButtonCache();
      render(['watchlist', 'local']);
      notice((v.ticker || 'Aktie') + ' entfernt.', 'ok', {label: 'Rückgängig', run: function () { addItem({instrumentId: v.instrumentId, ticker: v.ticker}); }});
    });
  }
  function addItem(hit, input) {
    return A.post('/v1/watchlist/items', {instrumentId: hit.instrumentId, ticker: hit.ticker}).then(function (r) {
      if (!r.ok) return notice(A.message(r.state), 'error');
      if (input) { input.value = ''; $('md-results').textContent = ''; $('md-results').hidden = true; input.setAttribute('aria-expanded', 'false'); }
      notice(r.data.state === 'ALREADY_PRESENT' ? hit.ticker + ' ist bereits auf deiner Watchlist.' : hit.ticker + ' hinzugefügt.', 'ok');
      return loadItems().then(loadSummary).then(function () { render(['watchlist', 'local']); });
    });
  }

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

  /* Lokale Beobachten-Listen der Produktwelten: nur lesen, nichts loeschen. Was schon im Konto steht, zaehlt nicht als offen. */
  MODULES.push({id: 'local', render: function () {
    var box = $('md-local');
    var legacy = W.legacyTickers(function (k) { return root.localStorage.getItem(k); });
    var europe = 0;
    try { var e = JSON.parse(root.localStorage.getItem(EUROPE_KEY) || '[]'); europe = Array.isArray(e) ? e.length : 0; } catch (err) { europe = 0; }
    if (!legacy.length && !europe) { box.hidden = true; return; }
    var counts = {};
    legacy.forEach(function (l) { l.sources.forEach(function (s) { counts[s] = (counts[s] || 0) + 1; }); });
    var ul = $('md-local-sources');
    ul.textContent = '';
    Object.keys(counts).forEach(function (s) {
      ul.appendChild(el('li', {}, [el('a', {className: 'md-source', href: LOCAL_VIEWS[s] || '/discover/#/watchlist'},
        [el('b', {text: s}), el('span', {text: counts[s] + ' Aktie' + (counts[s] === 1 ? '' : 'n')})])]));
    });
    if (europe) ul.appendChild(el('li', {}, [el('a', {className: 'md-source', href: '/discover/#/watchlist'},
      [el('b', {text: 'Discover Europa'}), el('span', {text: europe + ' Titel · nur auf diesem Gerät'})])]));
    box.hidden = false;
    var text = $('md-local-text'), actions = $('md-local-actions');
    if (!legacy.length || ctx.summary !== 'ok') {
      text.textContent = 'Diese Listen liegen nur in diesem Browser.';
      actions.hidden = true;
      return;
    }
    ensureNames().then(function (names) {
      if (!names) { text.textContent = 'Diese Listen liegen nur in diesem Browser.'; actions.hidden = true; return; }
      var plan = W.planMerge(names, legacy, ctx.items.map(function (i) { return i.instrumentId; }));
      var add = plan.add;
      text.textContent = add.length
        ? add.length + ' Aktie' + (add.length === 1 ? '' : 'n') + ' aus diesen Listen ' + (add.length === 1 ? 'steht' : 'stehen') + ' noch nicht in deiner Watchlist. Übernommen sind sie auf jedem Gerät da; die Listen hier bleiben unverändert.'
        : 'Alles aus diesen Listen steht bereits in deiner Watchlist.' + (europe ? ' Europäische Titel bleiben vorerst nur auf diesem Gerät.' : '');
      actions.hidden = !add.length;
      var btn = $('md-local-import'), fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', function () {
        fresh.disabled = true;
        A.post('/v1/watchlist/import', {items: add.slice(0, 500)}).then(function (r) {
          fresh.disabled = false;
          if (!r.ok) return notice(A.message(r.state), 'error');
          notice(r.data.added + ' übernommen' + (r.data.limitReached ? ' – die Grenze deines Tarifs ist erreicht.' : '.'), r.data.limitReached ? 'info' : 'ok');
          return loadItems().then(loadSummary).then(function () { render(['watchlist', 'local']); });
        });
      });
    });
  }});

  MODULES.push({id: 'shortcuts', once: true, render: function () {
    var ul = $('md-tiles');
    ul.textContent = '';
    SHORTCUTS.forEach(function (p) {
      ul.appendChild(el('li', {}, [el('a', {className: 'md-tile', href: p.href, 'data-product': p.id},
        [el('span', {className: 'md-tile-icon'}, [icon(p.id)]), el('b', {text: p.name}), el('small', {text: p.text})])]));
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
    if (!W || !Id) { $('md-loading').hidden = true; return notice('Das Dashboard konnte nicht geladen werden.', 'error'); }
    A.get('/v1/session').then(function (s) {
      if (!(s.ok && s.data && s.data.authenticated)) return go('/konto/anmelden/?next=' + encodeURIComponent('/mein-dashboard/'));
      return Promise.all([A.get('/v1/me'), loadItems()]).then(function (rs) {
        if (rs[0].ok) ctx.me = rs[0].data;
        return loadSummary();
      }).then(function () {
        $('md-loading').hidden = true;
        $('md-app').hidden = false;
        $('md-logout').hidden = false;
        if (ctx.summary !== 'ok') notice('Die Kurse sind gerade nicht verfügbar. Deine Watchlist ist gespeichert.', 'info');
        // Offene Pro-Bestellung: dezenter Hinweis, keine Umleitung (die Pro-Bestaetigung hat Vorrang nur direkt nach der Anmeldung).
        if (ctx.me && A.proPending(ctx.me, null)) notice('Deine Pro-Bestellung ist noch offen.', 'info', {label: 'Fortsetzen', run: function () { go(A.PRO_CONFIRM); }});
        render();
      });
    });
    $('md-logout').addEventListener('click', function () {
      this.disabled = true;
      forgetButtonCache();
      try { localStorage.removeItem('vu-plan-choice-v1'); } catch (e) { /* leer */ }
      A.post('/v1/auth/logout').then(function () { go('/konto/anmelden/'); });
    });
  }

  if (typeof document !== 'undefined') start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
