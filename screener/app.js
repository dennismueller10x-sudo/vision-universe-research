/* =========================================================================
   VISION UNIVERSE SCREENER — app.js

   Eigenstaendiges Vision-Universe-Produkt unter /screener/.
   Discover = Ideen finden · Screener = nach eigenen Regeln filtern.

   Zustand lebt in der URL (?view=…&f=…&sort=…), damit jeder Screen
   teilbar, reproduzierbar und mit Browser-Zurueck bedienbar ist. Bottom
   Sheets legen einen eigenen History-Eintrag an: "Zurueck" schliesst
   zuerst das Sheet, dann die Ansicht.
   ========================================================================= */
(function () {
  'use strict';
  var F = window.VUScreenerFields, Q = window.VUScreenerQuery, E = window.VUScreenerEngine,
    A = window.VUScreenerAdapters, St = window.VUScreenerStore, C = window.VUScreenerCharts;

  function safeStorage() { try { var k = '__sc'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch (e) { return null; } }
  var storage = safeStorage();
  var store = St.create(storage);
  var adapter = A.create({});

  // Vision-Universe-Farbschema (dieselbe Einstellung wie Discover)
  var VD = window.VUDiscover = window.VUDiscover || {};
  if (VD.Theme && !VD.theme) {
    VD.theme = VD.Theme.create({ storage: storage, document: document });
    VD.theme.onChange(function () { document.dispatchEvent(new Event('vu-theme-change')); });
  }

  var PAGE = 30;
  var state = { query: Q.empty(), view: 'start', screenId: null, stock: null, cmp: [], select: false, selected: [], shown: PAGE, error: null, loaded: false, invalidLink: null, targetGroup: null };
  var cache = { key: null, result: null };
  var mqDesk = window.matchMedia('(min-width:1024px)');
  var root = document.getElementById('sc-root');

  // ------------------------------------------------------------ DOM-Helfer
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids === undefined || kids === null ? [] : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  var IC = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="m15 5-7 7 7 7"/>', next: '<path d="m9 5 7 7-7 7"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', minus: '<path d="M6 12h12"/>',
    bookmark: '<path d="M7 4h10v17l-5-4-5 4z"/>', bookmarked: '<path d="M7 4h10v17l-5-4-5 4z" fill="currentColor"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>', sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    cards: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    compare: '<rect x="3" y="5" width="8" height="14" rx="2"/><rect x="13" y="5" width="8" height="14" rx="2"/>', bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
    screen: '<path d="M4 5h16M7 12h10M10 19h4"/>', saved: '<path d="M5 4h14v16l-7-4-7 4z"/>', heart: '<path d="M20.8 8.5c0 4-4.4 7.6-8.8 11-4.4-3.4-8.8-7-8.8-11a5 5 0 0 1 8.8-3.1 5 5 0 0 1 8.8 3.1z"/>',
    hits: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/>',
    building: '<path d="M4 21V5l8-2v18M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M3 21h18"/>', size: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    growth: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>', quality: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z"/>',
    balance: '<path d="M12 4v16M5 20h14M4 9l3-5 3 5a3 3 0 0 1-6 0zM14 9l3-5 3 5a3 3 0 0 1-6 0zM7 4h10"/>', valuation: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    momentum: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', technical: '<path d="M3 3v18h18M7 15l4-4 3 3 6-6"/>', analysts: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11l2 2 4-4"/>',
    vu: '<circle cx="12" cy="12" r="9"/><path d="M8 9l4 7 4-7"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  };
  function icon(name, cls) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'sc-i' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true'); s.innerHTML = IC[name] || ''; return s; }
  function iconBtn(name, label, onclick, extra) { return h('button', Object.assign({ type: 'button', class: 'sc-icon-btn', 'aria-label': label, title: label, onclick: onclick }, extra || {}), icon(name)); }
  function nf(n) { return Number(n).toLocaleString('de-DE'); }
  function dateDe(iso) { if (!iso) return '–'; var d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function toast(msg) {
    var t = document.querySelector('.sc-toast') || document.body.appendChild(h('div', { class: 'sc-toast', role: 'status', 'aria-live': 'polite' }));
    t.textContent = msg; t.classList.add('is-on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 2200);
  }
  function logo(sym, lg) {
    var hsh = 0; for (var i = 0; i < sym.length; i++) hsh = (hsh * 31 + sym.charCodeAt(i)) >>> 0;
    var hue = hsh % 360;
    return h('span', { class: 'sc-logo' + (lg ? ' is-lg' : ''), style: { '--logo': 'hsl(' + hue + ' 42% 30%)' }, 'aria-hidden': 'true' }, sym.replace(/[^A-Z0-9]/g, '').slice(0, 4));
  }
  function signCls(v) { return v > 0 ? 'sc-up' : v < 0 ? 'sc-down' : 'sc-muted'; }
  function ds() { return adapter.dataset(); }
  function info() { return adapter.info(); }
  function fieldName(id) { var f = F.field(id); return f ? f.short || f.label : id; }

  // ------------------------------------------------------------ URL-Zustand
  var VIEWS = ['start', 'build', 'results', 'saved', 'changes', 'compare', 'watchlist'];
  function readURL() {
    var p = new URLSearchParams(location.search);
    state.invalidLink = null;
    try { state.query = Q.fromParams(p); }
    catch (e) { state.query = Q.empty(); state.invalidLink = String(e.message || e); }
    var v = p.get('view');
    state.view = VIEWS.indexOf(v) >= 0 ? v : (Q.count(state.query) || state.query.mode === 'pro' ? 'build' : 'start');
    state.screenId = p.get('screen') || null;
    state.stock = /^[A-Z0-9.\-]{1,12}$/.test(p.get('stock') || '') ? p.get('stock') : null;
    state.cmp = (p.get('cmp') || '').split(',').filter(function (s) { return /^[A-Z0-9.\-]{1,12}$/.test(s); }).slice(0, 4);
  }
  function buildURL(over) {
    over = over || {};
    var q = over.query || state.query, view = over.view || state.view;
    var p = Q.toParams(q);
    if (view !== (Q.count(q) || q.mode === 'pro' ? 'build' : 'start')) p.set('view', view);
    var sid = over.screenId !== undefined ? over.screenId : state.screenId;
    if (sid) p.set('screen', sid);
    var cmp = over.cmp || state.cmp;
    if (view === 'compare' && cmp.length) p.set('cmp', cmp.join(','));
    var s = p.toString();
    return location.pathname + (s ? '?' + s.replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%7E/g, '~') : '');
  }
  /** Zustand aendern, URL schreiben, neu zeichnen. */
  function go(over, opts) {
    opts = opts || {};
    closeAllSheets().then(function () {
      if (over.query) state.query = over.query;
      if (over.view) state.view = over.view;
      if (state.view === 'start' && (Q.count(state.query) || state.query.mode === 'pro')) state.view = 'build';
      if (over.screenId !== undefined) state.screenId = over.screenId;
      if (over.cmp) state.cmp = over.cmp;
      if (over.view || over.query) state.shown = PAGE;
      var url = buildURL();
      if (url !== location.pathname + location.search) history[opts.replace ? 'replaceState' : 'pushState']({ sc: 1 }, '', url);
      render({ keepScroll: opts.keepScroll });
    });
  }

  // ------------------------------------------------------------ Auswertung
  function result() {
    var d = ds(); if (!d) return null;
    var key = Q.key(state.query) + '|' + state.query.sort.field + state.query.sort.dir;
    if (cache.key === key) return cache.result;
    cache.key = key; cache.result = adapter.screenSync(state.query);
    return cache.result;
  }
  function screenLabel(q) {
    var fs = Q.filters(q);
    if (!fs.length) return 'Gesamtes Universum';
    return fs.slice(0, 3).map(function (f) { return F.describeFilter(f); }).join(' · ') + (fs.length > 3 ? ' +' + (fs.length - 3) : '');
  }
  function rememberRun(r) {
    if (!Q.count(state.query)) return;
    clearTimeout(rememberRun._t);
    rememberRun._t = setTimeout(function () {
      store.remember({ key: Q.key(state.query), params: Q.toParams(state.query).toString(), label: screenLabel(state.query), count: r.total, filters: Q.count(state.query), screenId: state.screenId });
      var s = state.screenId && store.get(state.screenId);
      if (s && Q.key(s.query) === Q.key(state.query)) store.recordRun(s.id, { asOf: info().asOf, count: r.total, symbols: r.order.map(function (i) { return ds().symbol(i); }) });
    }, 600);
  }

  // ------------------------------------------------------------ Sheets
  var sheets = [], ignorePop = 0, popWaiters = [];
  function openSheet(opts) {
    var scrim = h('div', { class: 'sc-scrim', onclick: function () { closeTop(); } });
    var titleId = 'sc-sh-' + Date.now().toString(36);
    var sheet = h('div', { class: 'sc-sheet' + (opts.full ? ' is-full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' });
    var head = h('div', { class: 'sc-sheet-head' }, [opts.back ? iconBtn('back', 'Zurück', function () { closeTop(); }) : null, h('h2', { id: titleId, text: opts.title || '' }), opts.headExtra || null, iconBtn('x', 'Schließen', function () { closeTop(); })]);
    var body = h('div', { class: 'sc-sheet-body' });
    sheet.append(h('div', { class: 'sc-sheet-grab', 'aria-hidden': 'true' }), head, body);
    var foot = null;
    if (opts.foot) { foot = h('div', { class: 'sc-sheet-foot' }); sheet.append(foot); }
    document.body.append(scrim, sheet);
    document.body.classList.add('sc-locked');
    var entry = { sheet: sheet, scrim: scrim, body: body, foot: foot, head: head, prevFocus: document.activeElement, onClose: opts.onClose };
    sheets.push(entry);
    history.pushState({ sc: 1, sheet: sheets.length }, '', location.href);
    requestAnimationFrame(function () { scrim.classList.add('is-open'); sheet.classList.add('is-open'); });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closeTop(); }
      if (e.key === 'Tab') {
        var nodes = [].slice.call(sheet.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')).filter(function (n) { return n.offsetParent !== null; });
        if (!nodes.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
      }
    });
    // Wischen nach unten schliesst (Griff und Kopf)
    var y0 = null;
    [head, sheet.firstChild].forEach(function (n) {
      n.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
      n.addEventListener('touchmove', function (e) { if (y0 === null) return; var dy = e.touches[0].clientY - y0; if (dy > 0) sheet.style.transform = (mqDesk.matches ? '' : window.innerWidth >= 640 ? 'translate(-50%,' + dy + 'px)' : 'translateY(' + dy + 'px)'); }, { passive: true });
      n.addEventListener('touchend', function (e) { var dy = (e.changedTouches[0].clientY - (y0 || 0)); sheet.style.transform = ''; y0 = null; if (dy > 90) closeTop(); });
    });
    setTimeout(function () { (opts.focus ? sheet.querySelector(opts.focus) : sheet).focus({ preventScroll: true }); }, 60);
    return entry;
  }
  function removeSheet(entry) {
    entry.sheet.classList.remove('is-open'); entry.scrim.classList.remove('is-open');
    setTimeout(function () { entry.sheet.remove(); entry.scrim.remove(); }, 320);
    if (!sheets.length) document.body.classList.remove('sc-locked');
    if (entry.onClose) entry.onClose();
    if (entry.prevFocus && entry.prevFocus.focus && document.contains(entry.prevFocus)) entry.prevFocus.focus({ preventScroll: true });
  }
  function closeTop() { if (!sheets.length) return Promise.resolve(); return backN(1); }
  function closeAllSheets() { return sheets.length ? backN(sheets.length) : Promise.resolve(); }
  function backN(n) {
    for (var i = 0; i < n; i++) removeSheet(sheets.pop());
    return new Promise(function (resolve) {
      ignorePop++;
      var done = false, fin = function () { if (!done) { done = true; resolve(); } };
      popWaiters.push(fin);
      history.go(-n);
      setTimeout(function () { if (!done) { ignorePop = Math.max(0, ignorePop - 1); popWaiters = popWaiters.filter(function (w) { return w !== fin; }); fin(); } }, 400);
    });
  }
  window.addEventListener('popstate', function (e) {
    if (ignorePop) { ignorePop--; var w = popWaiters.shift(); if (w) w(); return; }
    var depth = (e.state && e.state.sheet) || 0;
    if (sheets.length > depth) { while (sheets.length > depth) removeSheet(sheets.pop()); return; }
    readURL(); render();
  });

  // ------------------------------------------------------------ Rahmen
  /* Navigation: die gemeinsame Produkt-Leiste der Vision-Universe-Shell
     (Screener | Treffer | Gespeichert | Watchlist | ☰). Der Screener meldet
     ihr den aktiven Bereich, die Trefferzahl und Ziele, die den Screen in
     der URL behalten; Klicks auf die Leiste bleiben In-App-Navigation. */
  var DOCK_VIEW = { screener: 'build', treffer: 'results', gespeichert: 'saved', watchlist: 'watchlist' };
  function dockView(id) { var v = DOCK_VIEW[id]; return v === 'build' ? (Q.count(state.query) || state.query.mode === 'pro' ? 'build' : 'start') : v; }
  function syncDock() {
    if (!window.VUNavigation) return;
    var r = ds() ? result() : null;
    var cur = { start: 'screener', build: 'screener', results: 'treffer', compare: 'treffer', saved: 'gespeichert', changes: 'gespeichert', watchlist: 'watchlist' }[state.view] || null;
    var hrefs = {};
    Object.keys(DOCK_VIEW).forEach(function (id) { hrefs[id] = buildURL({ view: dockView(id) }); });
    window.VUNavigation.dock({ active: cur, hrefs: hrefs, badges: { treffer: r && Q.count(state.query) ? r.total : null } });
  }
  document.addEventListener('vu-dock-navigate', function (e) {
    if (!e.detail || e.detail.product !== 'screener' || !DOCK_VIEW[e.detail.id]) return;
    e.preventDefault(); go({ view: dockView(e.detail.id) }); window.scrollTo(0, 0);
  });
  function modeSeg() {
    var q = state.query;
    function set(mode) {
      if (mode === q.mode) return;
      if (mode === 'simple' && Q.hasProOnly(q)) { confirmSimple(); return; }
      var next = Q.clone(q); next.mode = mode; go({ query: next }, { replace: true, keepScroll: true });
    }
    return h('div', { class: 'sc-seg', role: 'group', 'aria-label': 'Modus' }, [
      h('button', { type: 'button', 'aria-pressed': String(q.mode === 'simple'), onclick: function () { set('simple'); } }, 'Einfach'),
      h('button', { type: 'button', 'aria-pressed': String(q.mode === 'pro'), onclick: function () { set('pro'); } }, 'Pro')]);
  }
  function confirmSimple() {
    var s = openSheet({ title: 'Zum einfachen Modus wechseln?', foot: true });
    s.body.append(h('p', { class: 'sc-field-desc', text: 'Gruppen, ODER-Verknüpfungen, das Ranking und Pro-Kriterien werden dabei entfernt. Alle übrigen Filter bleiben als eine UND-Liste erhalten.' }));
    s.foot.append(h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: closeTop }, 'Abbrechen'),
      h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: function () { go({ query: Q.toSimple(state.query) }); } }, 'Wechseln'));
  }
  function bar(title, opts) {
    opts = opts || {};
    var row = h('div', { class: 'sc-bar-row' });
    if (opts.back) row.append(iconBtn('back', 'Zurück', opts.back));
    if (mqDesk.matches) row.append(h('div', { class: 'sc-brand', style: { flex: '1' } }, [h('h1', { text: 'Screener', style: { flex: 'none' } }), h('small', { text: 'Vision Universe' })]));
    else row.append(h('h1', { text: title }));
    (opts.right || []).forEach(function (n) { if (n) row.append(n); });
    var b = h('div', { class: 'sc-bar' }, row);
    return b;
  }

  // ------------------------------------------------------------ Render
  function render(opts) {
    opts = opts || {};
    var y = window.scrollY;
    var main = h('main', { id: 'sc-main', class: 'sc-app', tabindex: '-1' });
    var frag = [main];
    if (!state.loaded) { main.append(loadingView()); root.replaceChildren.apply(root, frag); return; }
    if (state.error) { main.append(errorView()); root.replaceChildren.apply(root, frag); return; }
    document.title = ({ start: 'Screener', build: 'Screen bauen', results: 'Treffer', saved: 'Gespeicherte Screens', changes: 'Veränderungen', compare: 'Vergleich', watchlist: 'Watchlist' })[state.view] + ' — Vision Universe® Screener';
    var views = { start: viewStart, build: viewBuild, results: viewResults, saved: viewSaved, changes: viewChanges, compare: viewCompare, watchlist: viewWatchlist };
    if (mqDesk.matches && (state.view === 'build' || state.view === 'results')) viewDesktopWorkspace(main);
    else views[state.view](main);
    main.append(footer());
    if (state.view === 'build' && !mqDesk.matches) frag.push(stickyCta());
    if (state.select && state.selected.length) frag.push(compareBar());
    root.replaceChildren.apply(root, frag);
    syncDock();
    var b = main.querySelector('.sc-bar');
    if (b) { var onS = function () { b.classList.toggle('is-stuck', window.scrollY > 4); }; onS(); window.onscroll = onS; }
    if (opts.keepScroll) window.scrollTo(0, y);
    if (state.stock && !sheets.some(function (s) { return s.stock; })) setTimeout(function () { openQuick(state.stock, { fromUrl: true }); }, 0);
  }
  mqDesk.addEventListener('change', function () { render({ keepScroll: true }); });
  document.addEventListener('vu-theme-change', function () { /* Farben haengen an CSS-Tokens */ });

  function loadingView() {
    return h('div', {}, [bar('Screener'), h('div', { class: 'sc-hero' }, [h('div', { class: 'sc-skel', style: { height: '14px', width: '140px' } }), h('div', { class: 'sc-skel', style: { height: '48px', width: '80%', margin: '16px 0' } }), h('div', { class: 'sc-skel', style: { height: '96px' } })]), h('p', { class: 'sc-sr', role: 'status', text: 'Aktienuniversum wird geladen …' })]);
  }
  function errorView() {
    return h('div', {}, [bar('Screener'), h('div', { class: 'sc-state sc-card', style: { marginTop: '24px' } }, [h('h3', { text: 'Screener-Daten nicht verfügbar' }),
      h('p', { text: 'Das Aktienuniversum konnte nicht geladen werden. Es werden keine Ersatzdaten gezeigt. ' + (state.error === 'HTTP_404' ? 'Der aktuelle Datenstand wurde noch nicht veröffentlicht.' : 'Bitte prüfe deine Verbindung.') }),
      h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: boot }, 'Erneut versuchen')])]);
  }
  function footer() {
    var i = info(); if (!i) return null;
    return h('footer', { class: 'sc-foot' }, [
      h('div', { text: 'Universum: ' + nf(i.count) + ' ' + i.universeLabel + ' · Kurse Stand ' + dateDe(i.asOf) + ' · Fundamentaldaten SEC EDGAR bis ' + dateDe(i.fundamentalsAsOf) + '.' }),
      h('div', { text: 'Branchen aus SEC-SIC-Codes (kein GICS). Filter und Übereinstimmung beschreiben Kennzahlen – sie sind kein Anlageurteil und keine Kaufempfehlung.' })]);
  }

  // ------------------------------------------------------------ START
  function viewStart(main) {
    var i = info(), q = state.query;
    if (state.invalidLink) main.append(invalidNotice());
    var left = h('div', {}), right = h('div', {});
    var productIcon = h('span', { class: 'vu-product-icon vu-product-icon--hero', 'aria-hidden': 'true' });
    productIcon.innerHTML = '<svg viewBox="0 0 24 24"><use href="/assets/product-icons.svg#screener"></use></svg>';
    left.append(h('section', { class: 'sc-hero sc-product-hero vu-product-hero vu-hero-fidelity', 'data-product': 'screener', 'aria-labelledby': 'sc-product-title' }, [
      h('div', { class: 'vu-hero-scene', 'aria-hidden': 'true' }),
      h('div', { class: 'sc-product-top' }, [productIcon, iconBtn('gear', 'Einstellungen', openSettings)]),
      h('p', { class: 'vu-hero-name', text: 'Screener' }),
      h('h1', { class: 'vu-hero-headline', id: 'sc-product-title', text: 'Finde genau die Aktien, die zu dir passen.' }),
      h('p', { class: 'vu-hero-description', text: 'Filtere Aktien nach deinen eigenen Kriterien. Gewichte Kennzahlen und vergleiche Unternehmen – schnell, präzise, unabhängig.' }),
      h('div', { class: 'sc-hero-actions' }, [
        h('button', { class: 'sc-btn sc-btn-primary sc-btn-block', type: 'button', onclick: function () { openLibrary(); } }, [icon('plus'), 'Filter hinzufügen']),
        h('button', { class: 'sc-searchfake', type: 'button', onclick: function () { openLibrary({ focus: true }); } }, [icon('search'), 'Kriterium suchen – z. B. „ROIC“ oder „200“'])]),
      h('div', { class: 'sc-hero-universe' }, [globe(),
      h('div', { class: 'sc-universe' }, [h('strong', { class: 'sc-num', text: nf(i.count) }),
        h('span', {}, ['Aktien im Universum', h('button', { class: 'sc-info', type: 'button', 'aria-label': 'Was gehört zum Universum?', onclick: openUniverseInfo }, 'i')]),
        h('small', { text: 'US-Börsen · Datenstand ' + dateDe(i.asOf) })])]) ]));
    left.append(h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, [h('h2', { text: 'Modus' }), modeSeg()]),
      h('div', { class: 'sc-quickgrid', style: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))' } }, [
        modeCard('simple', 'Einfach', 'Schnell starten mit den wichtigsten Kriterien – Größe, Wachstum, Bewertung, Qualität, Momentum, Technik.'),
        modeCard('pro', 'Pro', 'Zusätzlich Bilanz, Perzentile, Quant-Faktoren, Gruppen mit UND/ODER und gewichtetes Ranking.')])]));
    left.append(h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, h('h2', { text: 'Kriterien nach Bereich' })),
      h('div', { class: 'sc-quickgrid' }, F.groups({ mode: q.mode }).map(function (g) {
        var n = F.list({ mode: q.mode }).filter(function (f) { return f.group === g.id && f.available; }).length;
        return h('button', { class: 'sc-quick', type: 'button', onclick: function () { openLibrary({ group: g.id }); } }, [h('span', { class: 'sc-chip-cat' }, icon(g.icon)), h('b', { text: g.label }), h('span', { text: n + ' Kriterien' })]);
      }))]));
    right.append(recentSection(5), savedSection(3));
    if (mqDesk.matches) main.append(h('div', { class: 'sc-start' }, [left, h('div', { style: { paddingTop: '48px' } }, right)]));
    else main.append(left, right);
  }
  function globe() {
    var w = h('div', { class: 'sc-globe', 'aria-hidden': 'true' });
    w.innerHTML = '<svg viewBox="0 0 240 200"><defs><radialGradient id="scg" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="var(--sc-globe-1)"/><stop offset="1" stop-color="var(--sc-globe-2)"/></radialGradient></defs>'
      + '<ellipse cx="120" cy="104" rx="112" ry="30" fill="none" stroke="var(--sc-globe-line)" stroke-width="1" transform="rotate(-14 120 104)"/>'
      + '<circle cx="120" cy="100" r="70" fill="url(#scg)"/>'
      + '<g fill="none" stroke="var(--sc-globe-grid)" stroke-width="1"><ellipse cx="120" cy="100" rx="70" ry="24"/><ellipse cx="120" cy="100" rx="70" ry="50"/><ellipse cx="120" cy="100" rx="24" ry="70"/><ellipse cx="120" cy="100" rx="50" ry="70"/><line x1="50" y1="100" x2="190" y2="100"/><line x1="120" y1="30" x2="120" y2="170"/></g>'
      + '<path d="M16 122 A112 30 -14 0 0 224 86" fill="none" stroke="var(--sc-globe-line)" stroke-width="1.2" transform="rotate(0)"/>'
      + '<circle cx="20" cy="126" r="4" fill="var(--sc-accent)"/><circle cx="218" cy="74" r="5" fill="var(--sc-accent)"/><circle cx="176" cy="150" r="3" fill="var(--sc-accent)" opacity=".6"/><circle cx="64" cy="58" r="2.5" fill="var(--sc-accent)" opacity=".6"/></svg>';
    return w;
  }
  function openUniverseInfo() {
    var i = info(), m = ds().meta, s = openSheet({ title: 'Das Universum' });
    var withheld = (m.sanitized && (m.sanitized.FOREIGN_FILER || 0) + (m.sanitized.NON_USD_REPORTING || 0) + (m.sanitized.IMPLAUSIBLE_SHARE_BASIS || 0)) || 0;
    s.body.append(h('p', { class: 'sc-field-desc', text: nf(i.count) + ' US-Stammaktien an ihrer Primärbörse. ETFs, separate Aktiengattungen und Titel in Prüfung sind nicht enthalten.' }),
      kv([['Kurse', 'Tagesschluss ' + dateDe(i.asOf)], ['Fundamentaldaten', 'SEC EDGAR bis ' + dateDe(i.fundamentalsAsOf)], ['Branchen', 'SEC-SIC-Code (kein GICS)'], ['Quant-Faktoren', 'Faktorevidenz V2, Einzelfaktoren']]),
      h('p', { class: 'sc-label', text: 'Plausibilitätsprüfung' }),
      h('p', { class: 'sc-note', text: 'Bei ' + nf(withheld) + ' Aktien werden Marktkapitalisierung und Bewertungskennzahlen nicht gezeigt, weil die gemeldete Aktienzahl oder Währung nicht zum gehandelten Papier passt (z. B. ADRs ausländischer Unternehmen). Margen und Wachstum bleiben filterbar.' }),
      h('p', { class: 'sc-note', text: 'Fehlt ein Wert, erfüllt die Aktie das Kriterium nicht. Der Filter-Impact zeigt, wie viele Aktien dadurch herausfallen.' }));
  }
  function openSettings() {
    var s = openSheet({ title: 'Einstellungen' }), q = state.query;
    function row(title, sub, control) { return h('div', { class: 'sc-toggle' }, [h('span', {}, [title, sub ? h('small', { text: sub }) : null]), control]); }
    var theme = VD.theme;
    var themeSeg = theme ? h('div', { class: 'sc-seg', role: 'group', 'aria-label': 'Darstellung' }) : h('a', { class: 'sc-link', href: '/discover/#/settings' }, 'Öffnen');
    var paintTheme = function () { if (!theme) return; themeSeg.replaceChildren.apply(themeSeg, [['light', 'Hell'], ['dark', 'Dunkel']].map(function (m) { return h('button', { type: 'button', 'aria-pressed': String(theme.mode() === m[0]), onclick: function () { theme.set(m[0]); paintTheme(); } }, m[1]); })); };
    paintTheme();
    s.body.append(row('Modus', 'Einfach: wichtigste Kriterien · Pro: Gruppen, Ranking, alle Kriterien', modeSeg()),
      row('Darstellung', 'Vision-Universe-Einstellung – gilt auch für Discover', themeSeg),
      h('button', { class: 'sc-row', type: 'button', style: { marginTop: '14px' }, onclick: function () { closeTop().then(openUniverseInfo); } }, [icon('vu'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Daten & Methodik' }), h('span', { text: 'Universum, Quellen, Plausibilitätsprüfung' })]), icon('next')]),
      h('button', { class: 'sc-row', type: 'button', style: { marginTop: '8px' }, onclick: function () { store.clearHistory(); toast('Verlauf gelöscht'); } }, [icon('trash'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Verlauf löschen' }), h('span', { text: 'Zuletzt verwendete Screens auf diesem Gerät' })])]));
    void q;
  }
  function modeCard(mode, title, text) {
    var on = state.query.mode === mode;
    return h('button', { class: 'sc-quick', type: 'button', 'aria-pressed': String(on), style: on ? { borderColor: 'var(--sc-accent)', boxShadow: '0 0 0 1px var(--sc-accent)' } : null,
      onclick: function () { if (mode === 'simple' && Q.hasProOnly(state.query)) return confirmSimple(); var n = Q.clone(state.query); n.mode = mode; go({ query: n }, { replace: true, keepScroll: true }); } },
      [h('b', { text: title + (on ? ' ✓' : '') }), h('span', { text: text })]);
  }
  function invalidNotice() {
    return h('div', { class: 'sc-card', role: 'alert', style: { padding: '14px 16px', margin: '12px 0', borderColor: 'var(--sc-warn)' } }, [h('b', { text: 'Dieser Link enthält ungültige Kriterien.' }),
      h('p', { class: 'sc-note', style: { margin: '4px 0 0' }, text: 'Es wurden keine Ersatzregeln angewendet. (' + state.invalidLink.replace('INVALID_QUERY:', '') + ')' })]);
  }
  function recentSection(max) {
    var hist = store.history().slice(0, max);
    var sec = h('section', { class: 'sc-section' }, h('div', { class: 'sc-section-head' }, [h('h2', { text: 'Zuletzt verwendet' }), hist.length ? h('button', { class: 'sc-link', type: 'button', onclick: function () { store.clearHistory(); render({ keepScroll: true }); } }, 'Leeren') : null]));
    if (!hist.length) { sec.append(h('p', { class: 'sc-note', text: 'Noch keine Screens. Deine zuletzt verwendeten Screens erscheinen hier.' })); return sec; }
    var lastDay = null, list = h('div', { class: 'sc-list' });
    hist.forEach(function (x) {
      var day = St.relativeDay(x.at);
      if (day !== lastDay) { list.append(h('p', { class: 'sc-when', text: day })); lastDay = day; }
      var s = x.screenId && store.get(x.screenId);
      list.append(h('a', { class: 'sc-row', href: location.pathname + '?' + x.params + '&view=results' + (s ? '&screen=' + s.id : ''), onclick: function (e) { e.preventDefault(); openParams(x.params, s ? s.id : null); } }, [
        h('div', { class: 'sc-row-main' }, [h('b', { text: s ? s.name : x.label }), h('span', { text: (s ? x.label + ' · ' : '') + x.filters + ' Filter' })]),
        h('div', { class: 'sc-row-side sc-num', text: nf(x.count) + ' Treffer' })]));
    });
    sec.append(list); return sec;
  }
  function openParams(params, screenId) {
    try { var q = Q.fromParams(params); go({ query: q, view: 'results', screenId: screenId || null }); window.scrollTo(0, 0); }
    catch (e) { toast('Dieser Screen enthält ungültige Kriterien.'); }
  }
  function savedSection(max) {
    var list = store.screens().slice(0, max);
    var sec = h('section', { class: 'sc-section' }, h('div', { class: 'sc-section-head' }, [h('h2', { text: 'Gespeicherte Screens' }), list.length ? h('button', { class: 'sc-link', type: 'button', onclick: function () { go({ view: 'saved' }); } }, 'Alle') : null]));
    if (!list.length) { sec.append(h('p', { class: 'sc-note', text: 'Speichere einen Screen, um ihn wieder zu öffnen und Veränderungen zu verfolgen.' })); return sec; }
    sec.append(h('div', { class: 'sc-list' }, list.map(savedRow)));
    return sec;
  }
  function savedRow(s) {
    var runs = s.runs || [], last = runs[runs.length - 1], d = runs.length === 2 ? E.diff(runs[0].symbols, runs[1].symbols) : null;
    return h('a', { class: 'sc-row', href: location.pathname + '?' + Q.toParams(s.query).toString() + '&view=results&screen=' + s.id, onclick: function (e) { e.preventDefault(); openParams(Q.toParams(s.query).toString(), s.id); } }, [
      h('div', { class: 'sc-row-main' }, [h('b', { text: s.name }), h('span', { text: s.description || screenLabel(s.query) })]),
      h('div', { class: 'sc-row-side' }, [last ? h('div', { class: 'sc-num', text: nf(last.count) + ' Treffer' }) : null, d ? h('div', { class: 'sc-num', html: '<span class="sc-up">+' + d.added.length + '</span> / <span class="sc-down">−' + d.removed.length + '</span>' }) : null])]);
  }

  // ------------------------------------------------------------ BUILD
  function counter(r) {
    var i = info(), pct = r.universe ? (r.total / r.universe - 1) * 100 : 0;
    var el = h('div', { class: 'sc-counter', 'aria-live': 'polite' }, [h('strong', { class: 'sc-num', text: nf(r.total) }), h('span', { text: r.total === 1 ? 'Aktie gefunden' : 'Aktien gefunden' }),
      Q.count(state.query) ? h('span', { class: 'sc-delta sc-num', title: 'gegenüber dem Ausgangsuniversum von ' + nf(i.count) + ' Aktien', text: (pct <= -99.95 && r.total ? '−99,9' : pct.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).replace('-', '−')) + ' % ggü. Universum' }) : null]);
    if (counter._last !== undefined && counter._last !== r.total) el.classList.add('is-pulse');
    counter._last = r.total;
    return el;
  }
  function chip(f, r) {
    var def = F.field(f.field), g = F.group(def.group), pf = r && r.perFilter[f.id];
    return h('div', { class: 'sc-chip' }, [
      h('span', { class: 'sc-chip-cat', 'aria-hidden': 'true' }, icon(g.icon)),
      h('button', { class: 'sc-chip-body', type: 'button', 'aria-label': F.describeFilter(f) + ' bearbeiten', onclick: function () { openDetail(def.id, { filter: f }); } }, [
        h('b', { text: F.describeFilter(f, ds().meta.dict) }),
        h('span', { class: 'sc-num', text: pf ? nf(pf.pass) + ' Aktien erfüllen allein' + (pf.missing ? ' · ' + nf(pf.missing) + ' ohne Daten' : '') : def.label })]),
      iconBtn('x', F.describeFilter(f) + ' entfernen', function () { go({ query: Q.removeFilter(state.query, f.id) }, { keepScroll: true }); toast('Filter entfernt'); })]);
  }
  function stack(r) {
    var q = state.query, wrap = h('div', { class: 'sc-stack' });
    if (q.mode === 'simple') {
      var fs = Q.filters(q);
      if (!fs.length) wrap.append(h('div', { class: 'sc-empty-filters', text: 'Noch keine Filter. Füge dein erstes Kriterium hinzu.' }));
      fs.forEach(function (f) { wrap.append(chip(f, r)); });
      wrap.append(h('button', { class: 'sc-btn sc-btn-secondary sc-btn-block', type: 'button', onclick: function () { openLibrary(); } }, [icon('plus'), 'Filter hinzufügen']));
      return wrap;
    }
    q.groups.forEach(function (g, gi) {
      if (gi) wrap.append(h('div', { class: 'sc-joiner' }, opToggle(q.logic, 'Verknüpfung zwischen Gruppen', function (op) { var n = Q.clone(q); n.logic = op; go({ query: n }, { replace: true, keepScroll: true }); })));
      var box = h('div', { class: 'sc-group' });
      var name = h('input', { type: 'text', value: g.name, placeholder: 'Gruppe ' + (gi + 1), 'aria-label': 'Name der Gruppe ' + (gi + 1), maxlength: '40',
        onchange: function () { var n = Q.clone(state.query); n.groups[gi].name = this.value.trim(); go({ query: n }, { replace: true, keepScroll: true }); } });
      box.append(h('div', { class: 'sc-group-head' }, [name, opToggle(g.op, 'Verknüpfung in Gruppe ' + (gi + 1), function (op) { var n = Q.clone(q); n.groups[gi].op = op; go({ query: n }, { replace: true, keepScroll: true }); }),
        q.groups.length > 1 ? iconBtn('trash', 'Gruppe ' + (gi + 1) + ' entfernen (Filter wandern in Gruppe 1)', function () { go({ query: Q.removeGroup(q, g.id) }, { keepScroll: true }); }) : null]));
      if (!g.filters.length) box.append(h('div', { class: 'sc-empty-filters', text: 'Leere Gruppe' }));
      g.filters.forEach(function (f) { box.append(chip(f, r)); });
      box.append(h('button', { class: 'sc-btn sc-btn-quiet sc-btn-sm', type: 'button', onclick: function () { openLibrary({ group: null, target: g.id }); } }, [icon('plus'), 'Kriterium hinzufügen']));
      if (r && r.groups && r.groups[g.id] !== undefined) box.append(h('p', { class: 'sc-note', style: { margin: 0 }, text: nf(r.groups[g.id]) + ' Aktien erfüllen diese Gruppe' }));
      wrap.append(box);
    });
    if (q.groups.length < 6) wrap.append(h('button', { class: 'sc-btn sc-btn-secondary sc-btn-block', type: 'button', onclick: function () { go({ query: Q.addGroup(q) }, { keepScroll: true }); } }, [icon('plus'), 'Gruppe hinzufügen']));
    return wrap;
  }
  function opToggle(op, label, set) {
    return h('div', { class: 'sc-op', role: 'group', 'aria-label': label }, ['AND', 'OR'].map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': String(op === o), onclick: function () { if (op !== o) set(o); } }, o === 'AND' ? 'UND' : 'ODER');
    }));
  }
  function impact(r) {
    var card = h('ol', { class: 'sc-card sc-timeline' });
    r.funnel.forEach(function (st, i) {
      var last = i === r.funnel.length - 1 && i > 0;
      var cum = r.universe ? (st.count / r.universe - 1) * 100 : 0;
      var meta = null;
      if (st.kind === 'filter' || (st.kind === 'group' && !st.standalone)) meta = '−' + nf(st.lost) + ' in diesem Schritt' + (st.missing ? ' · davon ' + nf(st.missing) + ' ohne Daten' : '');
      else if (st.standalone) meta = 'unabhängig von den anderen Gruppen';
      var label = st.kind === 'start' ? 'Alle Aktien im Universum' : last && st.kind !== 'union' ? 'Nach allen Filtern' : st.kind === 'union' ? st.label : 'Nach ' + st.label;
      card.append(h('li', { class: 'sc-tl' + (last ? ' is-final' : '') + (st.kind === 'start' ? ' is-start' : '') }, [
        h('span', { class: 'sc-tl-dot', 'aria-hidden': 'true' }),
        h('div', { class: 'sc-tl-main' }, [h('b', { class: 'sc-num', text: nf(st.count) }), h('span', { text: last && st.kind !== 'union' ? label + ' · ' + st.label : label }), meta ? h('small', { text: meta }) : null]),
        h('span', { class: 'sc-tl-chip sc-num' + (st.kind === 'start' ? ' is-base' : ''), text: st.kind === 'start' ? '100 %' : (cum <= -99.95 && st.count ? '−99,9' : cum.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).replace('-', '−')) + ' %' })]));
    });
    return h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, [h('h2', { text: 'Filter-Impact' }), h('span', { class: 'sc-note', text: 'Dein Universum Schritt für Schritt' })]), card]);
  }
  /** Einzelne Kriterien als Vorschlag – mit der Trefferzahl, die sie ergeben würden. Keine fertigen Screens. */
  var SUGGEST = [
    ['growth', { field: 'revenueGrowth', op: 'gt', value: 0.2 }, 'Umsatzwachstum > 20 %'],
    ['profit', { field: 'netMargin', op: 'gt', value: 0 }, 'Positive Gewinnmarge'],
    ['trend', { field: 'priceVsSma200', op: 'gt', value: 0 }, 'Kurs über SMA 200'],
    ['liquidity', { field: 'dollarVolume', op: 'gt', value: 1e7 }, 'Ø Handelsumsatz > 10 Mio. $'],
    ['high', { field: 'distance52wHigh', op: 'gt', value: -0.1 }, 'Weniger als 10 % unter dem 52W-Hoch'],
    ['size', { field: 'marketCap', op: 'gt', value: 2e9 }, 'Market Cap > 2 Mrd. $']
  ];
  var SUGGEST_COVERS = { growth: ['revenueGrowth', 'revenueCagr3', 'epsGrowth', 'epsCagr3'], profit: ['netMargin', 'operatingMargin', 'fcfMargin', 'eps'], trend: ['priceVsSma200', 'priceVsSma50', 'sma50VsSma200'],
    liquidity: ['dollarVolume', 'avgVolume'], high: ['distance52wHigh', 'newHigh52w'], size: ['marketCap', 'enterpriseValue'] };
  function suggestions() {
    var used = Q.filters(state.query).map(function (f) { return f.field; });
    var list = SUGGEST.filter(function (x) { return !SUGGEST_COVERS[x[0]].some(function (id) { return used.indexOf(id) >= 0; }); }).slice(0, 3);
    if (!list.length) return null;
    var box = h('div', { class: 'sc-list' });
    list.forEach(function (x) {
      var added = Q.addFilter(state.query, x[1], state.query.groups[state.query.groups.length - 1].id);
      var n = adapter.screenSync(added.query, { limit: 0 }).total;
      box.append(h('button', { class: 'sc-row sc-suggest', type: 'button', onclick: function () { go({ query: added.query }, { keepScroll: true }); toast('Filter hinzugefügt'); } }, [
        h('span', { class: 'sc-libicon', 'aria-hidden': 'true' }, icon(F.group(F.field(x[1].field).group).icon)),
        h('div', { class: 'sc-row-main' }, [h('b', { text: x[2] }), h('span', { class: 'sc-num', text: '→ ' + nf(n) + ' Treffer' })]), icon('plus')]));
    });
    return h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, h('h2', { text: 'Filter-Vorschläge' })), box]);
  }
  function stackHead() {
    var n = Q.count(state.query);
    if (!n) return null;
    return h('div', { class: 'sc-section-head', style: { margin: '18px 0 10px' } }, [h('h2', {}, ['Aktive Filter ', h('span', { class: 'sc-count-badge sc-num', text: String(n) })]),
      h('button', { class: 'sc-link', type: 'button', onclick: function () { go({ query: Q.empty({ mode: state.query.mode }), screenId: null }); toast('Alle Filter entfernt'); } }, 'Alle löschen')]);
  }
  function ranking() {
    var q = state.query, card = h('div', { class: 'sc-card sc-weights' });
    var sw = h('input', { type: 'checkbox', class: 'sc-switch', role: 'switch', checked: q.ranking.enabled ? true : null, 'aria-label': 'Gewichtetes Ranking aktivieren',
      onchange: function () { var n = Q.clone(state.query); n.ranking.enabled = this.checked; n.sort = this.checked ? { field: 'match', dir: 'desc' } : { field: 'marketCap', dir: 'desc' }; go({ query: n }, { replace: true, keepScroll: true }); } });
    card.append(h('label', { class: 'sc-toggle' }, [h('span', {}, ['Nach Übereinstimmung sortieren', h('small', { text: 'Du legst fest, was dir wichtiger ist. Kein Anlageurteil.' })]), sw]));
    if (q.ranking.enabled) {
      var W = Object.assign({}, q.ranking.weights), outs = {}, ranges = {};
      var commit = debounce(function () { var n = Q.clone(state.query); n.ranking.weights = W; go({ query: n }, { replace: true, keepScroll: true }); }, 250);
      var sumEl = h('output', { class: 'sc-num' });
      var paint = function () { Q.FAMILIES.forEach(function (k) { outs[k].textContent = W[k] + ' %'; ranges[k].value = W[k]; ranges[k].style.setProperty('--p', W[k] + '%'); }); var s = Q.FAMILIES.reduce(function (a, k) { return a + W[k]; }, 0); sumEl.textContent = s + ' %'; sumEl.className = 'sc-num ' + (s === 100 ? 'sc-up' : 'sc-down'); };
      Q.FAMILIES.forEach(function (k) {
        outs[k] = h('output', { class: 'sc-num' });
        ranges[k] = h('input', { type: 'range', class: 'sc-range', min: '0', max: '100', step: '5', 'aria-label': E.FAMILY_LABELS[k] + ' Gewicht',
          oninput: function () { rebalance(W, k, Number(this.value)); paint(); commit(); } });
        card.append(h('div', { class: 'sc-weight' }, [h('div', { class: 'sc-weight-head' }, [h('span', {}, [E.FAMILY_LABELS[k]]), outs[k]]), ranges[k],
          h('small', { text: E.FAMILY_COMPONENTS[k].map(function (c) { return fieldName(c[0]) + (c[1] < 0 ? ' (niedriger besser)' : ''); }).join(' · ') })]));
      });
      card.append(h('div', { class: 'sc-sum' }, [h('span', { text: 'Gesamt' }), sumEl]));
      card.append(h('p', { class: 'sc-note', text: 'Match = gewichteter Durchschnitt der Perzentile (0–100) im Gesamtuniversum. Fehlt ein Bereich, zählt er nicht mit; die Karte weist das aus.' }));
      paint();
    }
    return h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, h('h2', { text: 'Ranking' })), card]);
  }
  /** Ein Regler aendert sich, die anderen tragen den Rest anteilig: Summe bleibt 100. */
  function rebalance(W, key, v) {
    var others = Q.FAMILIES.filter(function (k) { return k !== key; });
    var rest = 100 - v, cur = others.reduce(function (a, k) { return a + W[k]; }, 0);
    W[key] = v;
    others.forEach(function (k) { W[k] = cur ? Math.round((W[k] / cur) * rest / 5) * 5 : Math.round(rest / others.length / 5) * 5; });
    var diff = 100 - Q.FAMILIES.reduce(function (a, k) { return a + W[k]; }, 0);
    if (diff) { var t = others.slice().sort(function (a, b) { return W[b] - W[a]; })[0]; W[t] = Math.max(0, W[t] + diff); }
  }
  function buildActions() {
    var q = state.query, saved = state.screenId && store.get(state.screenId);
    return h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, h('h2', { text: 'Screen' })), h('div', { class: 'sc-list' }, [
      h('button', { class: 'sc-row', type: 'button', onclick: openSave }, [icon('saved'), h('div', { class: 'sc-row-main' }, [h('b', { text: saved ? 'Änderungen speichern' : 'Screen speichern' }), h('span', { text: saved ? saved.name : 'Wiederfinden und Veränderungen verfolgen' })])]),
      h('button', { class: 'sc-row', type: 'button', onclick: share }, [icon('share'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Link teilen' }), h('span', { text: 'Der Link enthält die Kriterien, nicht die Ergebnisse' })])]),
      h('a', { class: 'sc-row', href: '/vu2/?view=strategies' }, [icon('open'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Strategien & Backtests' }), h('span', { text: 'Regeln in Vision Universe Quant testen und weiterentwickeln' })])]),
      Q.count(q) ? h('button', { class: 'sc-row', type: 'button', onclick: function () { go({ query: Q.empty({ mode: q.mode }), screenId: null }); toast('Alle Filter entfernt'); } }, [icon('reset'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Zurücksetzen' }), h('span', { text: 'Alle Filter entfernen' })])]) : null])]);
  }
  function viewBuild(main) {
    var r = result();
    main.append(bar(state.screenId && store.get(state.screenId) ? store.get(state.screenId).name : 'Screen bauen', { right: [modeSeg()] }));
    if (state.invalidLink) main.append(invalidNotice());
    main.append(counter(r), stackHead() || h('div', { style: { height: '12px' } }), stack(r));
    var sg = suggestions(); if (sg) main.append(sg);
    if (Q.count(state.query)) main.append(impact(r));
    if (state.query.mode === 'pro') main.append(ranking());
    main.append(buildActions());
    rememberRun(r);
  }
  function stickyCta() {
    var r = result();
    return h('div', { class: 'sc-cta' }, h('div', {}, h('button', { class: 'sc-btn sc-btn-primary sc-btn-block', type: 'button', onclick: function () { go({ view: 'results' }); window.scrollTo(0, 0); } },
      r.total ? nf(r.total) + (r.total === 1 ? ' Treffer anzeigen' : ' Treffer anzeigen') : 'Keine Treffer – Filter anpassen')));
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  // ------------------------------------------------------------ DESKTOP
  function viewDesktopWorkspace(main) {
    var r = result();
    main.append(bar('Screener', { right: [modeSeg()] }));
    if (state.invalidLink) main.append(invalidNotice());
    var side = h('aside', { class: 'sc-side', 'aria-label': 'Filter' }, [counter(r), stackHead() || h('div', { style: { height: '12px' } }), stack(r)]);
    var sg = suggestions(); if (sg) side.append(sg);
    if (Q.count(state.query)) side.append(impact(r));
    if (state.query.mode === 'pro') side.append(ranking());
    side.append(buildActions());
    var mainCol = h('div', {});
    resultsBody(mainCol, r);
    main.append(h('div', { class: 'sc-layout' }, [side, mainCol]));
    rememberRun(r);
  }

  // ------------------------------------------------------------ RESULTS
  function viewResults(main) {
    var r = result();
    main.append(bar('Treffer', { back: function () { go({ view: Q.count(state.query) ? 'build' : 'start' }); }, right: [iconBtn('saved', 'Screen speichern', openSave), iconBtn('share', 'Link teilen', share)] }));
    resultsBody(main, r);
    rememberRun(r);
  }
  var SORTS = [['match', 'Übereinstimmung'], ['marketCap', 'Marktkapitalisierung'], ['price', 'Kurs'], ['revenueGrowth', 'Umsatzwachstum'], ['epsGrowth', 'EPS-Wachstum'], ['roic', 'ROIC'],
    ['distance52wHigh', 'Abstand zum 52W-Hoch'], ['perf1d', 'Performance 1 Tag'], ['perf6m', 'Performance 6 Monate'], ['perf1y', 'Performance 1 Jahr'], ['pe', 'KGV (TTM)'], ['relativeStrengthPct', 'Relative Stärke (Perzentil)'], ['name', 'Name']];
  function sortLabel() { var s = SORTS.filter(function (x) { return x[0] === state.query.sort.field; })[0]; return (s ? s[1] : fieldName(state.query.sort.field)) + (state.query.sort.dir === 'asc' ? ' ↑' : ' ↓'); }
  function resultsBody(main, r) {
    var q = state.query, d = ds();
    main.append(h('div', { class: 'sc-results-head' }, [h('div', { class: 'sc-count sc-num' }, [nf(r.total) + (r.total === 1 ? ' Aktie' : ' Aktien'), h('small', { text: 'von ' + nf(r.universe) })])]));
    var fs = Q.filters(q);
    if (fs.length) main.append(h('div', { class: 'sc-filterline', role: 'list', 'aria-label': 'Aktive Filter' }, fs.map(function (f) {
      return h('button', { class: 'sc-mini-chip', type: 'button', role: 'listitem', onclick: function () { openDetail(f.field, { filter: f }); } }, F.describeFilter(f, d.meta.dict));
    }).concat([h('button', { class: 'sc-mini-chip', type: 'button', onclick: function () { openLibrary(); }, 'aria-label': 'Filter hinzufügen' }, '+ Filter')])));
    main.append(h('div', { class: 'sc-toolbar' }, [
      h('button', { class: 'sc-btn sc-btn-secondary sc-btn-sm', type: 'button', onclick: openSort, 'aria-label': 'Sortieren und Ansicht: ' + sortLabel() }, [icon('sort'), sortLabel()]),
      q.view !== 'table' ? h('label', { class: 'sc-focus' }, [h('span', { class: 'sc-sr', text: 'Kennzahlen-Fokus der Karten' }), h('select', { 'aria-label': 'Kennzahlen-Fokus', onchange: function () { var n = Q.clone(state.query); n.focus = this.value; go({ query: n }, { replace: true, keepScroll: true }); } },
        [['auto', 'Fokus: Automatisch'], ['momentum', 'Fokus: Momentum'], ['growth', 'Fokus: Wachstum'], ['value', 'Fokus: Bewertung'], ['quality', 'Fokus: Qualität']].map(function (o) { return h('option', { value: o[0], selected: (q.focus || 'auto') === o[0] ? true : null }, o[1]); }))]) : null,
      h('div', { class: 'sc-seg', role: 'group', 'aria-label': 'Ansicht' }, [['cards', 'Karten', 'cards'], ['compact', 'Kompakt', 'list'], ['table', 'Tabelle', 'table']].map(function (v) {
        return h('button', { type: 'button', 'aria-pressed': String(q.view === v[0]), 'aria-label': v[1], title: v[1], onclick: function () { var n = Q.clone(state.query); n.view = v[0]; go({ query: n }, { replace: true, keepScroll: true }); } }, [icon(v[2]), mqDesk.matches ? v[1] : null]);
      })),
      h('button', { class: 'sc-btn sc-btn-sm ' + (state.select ? 'sc-btn-primary' : 'sc-btn-secondary'), type: 'button', 'aria-pressed': String(state.select),
        onclick: function () { state.select = !state.select; if (!state.select) state.selected = []; render({ keepScroll: true }); } }, [icon('compare'), state.select ? 'Fertig' : 'Vergleichen'])]));
    if (!r.total) { main.append(emptyResults(r)); return; }
    if (!fs.length) main.append(h('p', { class: 'sc-note', style: { margin: '0 0 12px' }, text: 'Ohne Filter siehst du das gesamte Universum. Füge Kriterien hinzu, um es einzugrenzen.' }));
    var metrics = E.cardMetrics(q, q.view === 'table' ? 7 : q.view === 'cards' && q.ranking.enabled ? 3 : 4);
    var list = r.order.slice(0, state.shown);
    var holder;
    if (q.view === 'table') holder = tableView(list, metrics);
    else if (q.view === 'compact') { holder = h('div', { class: 'sc-card sc-compact' }); list.forEach(function (i) { holder.append(compactRow(i, metrics)); }); }
    else { holder = h('div', { class: 'sc-cards' }); list.forEach(function (i) { holder.append(resultCard(i, metrics)); }); }
    main.append(holder);
    if (r.order.length > state.shown) {
      var more = h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: loadMore }, 'Weitere ' + Math.min(PAGE, r.order.length - state.shown) + ' laden (' + nf(state.shown) + ' von ' + nf(r.order.length) + ')');
      var wrap = h('div', { class: 'sc-more' }, more);
      main.append(wrap);
      if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); loadMore(); } }, { rootMargin: '600px' }); setTimeout(function () { io.observe(wrap); }, 50); }
    }
    lazySparks(main);
  }
  function loadMore() {
    var r = result(); if (state.shown >= r.order.length) return;
    state.shown += PAGE; render({ keepScroll: true });
  }
  function emptyResults(r) {
    var worst = r.funnel.slice(1).filter(function (s) { return s.kind === 'filter'; }).sort(function (a, b) { return b.lost - a.lost; })[0];
    var box = h('div', { class: 'sc-card sc-state' }, [h('h3', { text: 'Keine Aktie erfüllt alle Kriterien' }),
      h('p', { text: worst ? 'Am stärksten grenzt „' + worst.label + '“ ein (−' + nf(worst.lost) + '). Lockere diesen Filter oder entferne ihn.' : 'Passe deine Filter an.' })]);
    if (worst) {
      var f = Q.filters(state.query).filter(function (x) { return x.id === worst.filterId; })[0];
      if (f) box.append(h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: function () { openDetail(f.field, { filter: f }); } }, 'Filter bearbeiten'));
    }
    return box;
  }
  function metricEl(fieldId, i) {
    var v = ds().value(fieldId, i), f = F.field(fieldId);
    var t = F.format(f, v), col = t.charAt(0) === '+' ? 'sc-up' : t.charAt(0) === '−' && f.unit === 'pct' && f.group !== 'technical' ? 'sc-down' : '';
    return h('div', { class: 'sc-metric' }, [h('span', { text: f.short || f.label }), h('b', { class: 'sc-num ' + col, text: t })]);
  }
  function selectToggle(sym) {
    var on = state.selected.indexOf(sym) >= 0;
    return h('button', { class: 'sc-check', type: 'button', role: 'checkbox', 'aria-checked': String(on), 'aria-label': sym + ' zum Vergleich auswählen',
      onclick: function (e) { e.stopPropagation(); toggleSelect(sym); } }, on ? icon('check') : null);
  }
  function toggleSelect(sym) {
    var i = state.selected.indexOf(sym), max = mqDesk.matches ? 4 : 3;
    if (i >= 0) state.selected.splice(i, 1);
    else if (state.selected.length >= max) { toast('Höchstens ' + max + ' Aktien vergleichen'); return; }
    else state.selected.push(sym);
    render({ keepScroll: true });
  }
  function watchBtn(sym, cls) {
    var on = store.isWatched(sym);
    return h('button', { class: 'sc-icon-btn' + (cls ? ' ' + cls : ''), type: 'button', 'aria-pressed': String(on), 'aria-label': sym + (on ? ' von der Watchlist entfernen' : ' zur Watchlist hinzufügen'),
      onclick: function (e) { e.stopPropagation(); var now = store.toggleWatch(sym); this.setAttribute('aria-pressed', String(now)); this.replaceChildren(icon(now ? 'bookmarked' : 'bookmark')); this.setAttribute('aria-label', sym + (now ? ' von der Watchlist entfernen' : ' zur Watchlist hinzufügen')); toast(now ? sym + ' auf der Watchlist' : sym + ' entfernt'); } }, icon(on ? 'bookmarked' : 'bookmark'));
  }
  function secLine(i) {
    var d = ds(), sec = d.value('sector', i), ind = d.value('industry', i);
    var parts = [d.symbol(i)];
    if (sec) parts.push(F.enumLabel('sector', sec, d.meta.dict));
    if (ind && mqDesk.matches) parts.push(F.enumLabel('industry', ind, d.meta.dict));
    return parts.join(' · ');
  }
  function resultCard(i, metrics) {
    var d = ds(), sym = d.symbol(i), q = state.query;
    var price = d.value('price', i), chg = d.value('perf1d', i);
    var open = function () { if (state.select) toggleSelect(sym); else openQuick(sym); };
    var actions = h('div', { class: 'sc-rc-act' }, state.select ? [selectToggle(sym)] : [watchBtn(sym),
      Q.count(q) ? h('button', { class: 'sc-icon-btn', type: 'button', 'aria-label': 'Warum ist ' + sym + ' ein Treffer?', title: 'Warum Treffer?', onclick: function (e) { e.stopPropagation(); openWhy(sym); } }, icon('bulb')) : null]);
    var cols = [];
    if (q.ranking.enabled) {
      var m = E.match(d, q, i);
      cols.push(h('div', { class: 'sc-metric', title: m.families + ' von ' + m.of + ' Bereichen bewertbar' }, [h('span', { text: 'Match' }), h('b', { class: 'sc-matchpill sc-num', text: m.score === null ? '–' : Math.round(m.score) + (m.families < m.of ? '*' : '') })]));
    }
    metrics.slice(0, 4 - cols.length).forEach(function (id) { cols.push(metricEl(id, i)); });
    return h('article', { class: 'sc-card sc-rc', tabindex: '0', 'aria-label': d.name(i) + ', ' + sym, onclick: open, onkeydown: function (e) { if (e.key === 'Enter' && e.target === this) open(); } }, [
      h('div', { class: 'sc-rc-head' }, [logo(sym),
        h('div', { class: 'sc-rc-id' }, [h('b', { text: d.name(i) }), h('span', { text: secLine(i) }),
          h('div', { class: 'sc-rc-price' }, [h('span', { class: 'sc-num', text: F.format('price', price) }), h('span', { class: 'sc-chg sc-num ' + signCls(chg), text: F.format('perf1d', chg) })])]),
        h('span', { class: 'sc-spark-slot sc-rc-spark', 'data-sym': sym }), actions]),
      h('div', { class: 'sc-metrics is-row', style: { gridTemplateColumns: 'repeat(' + cols.length + ',minmax(0,1fr))' } }, cols)]);
  }
  function compactRow(i, metrics) {
    var d = ds(), sym = d.symbol(i), chg = d.value('perf1d', i), m0 = metrics[0];
    return h('div', { class: 'sc-cr', role: 'button', tabindex: '0', onclick: function () { if (state.select) toggleSelect(sym); else openQuick(sym); }, onkeydown: function (e) { if (e.key === 'Enter') this.click(); } }, [
      state.select ? selectToggle(sym) : logo(sym),
      h('div', { class: 'sc-cr-main' }, [h('b', { text: d.name(i) }), h('span', { text: secLine(i) })]),
      h('div', { class: 'sc-cr-side sc-num' }, [h('b', { text: F.format('price', d.value('price', i)) }), h('span', { class: signCls(chg), text: F.format('perf1d', chg) })]),
      h('span', { class: 'sc-spark-slot sc-cr-spark', 'data-sym': sym, style: { width: '72px', height: '30px', display: 'block' } }),
      state.select ? null : watchBtn(sym, 'sc-cr-watch')]);
  }
  function tableView(list, metrics) {
    var d = ds(), q = state.query;
    var cols = ['price', 'perf1d', 'marketCap'].concat(metrics.filter(function (m) { return ['price', 'perf1d', 'marketCap'].indexOf(m) < 0; })).slice(0, mqDesk.matches ? 9 : 7);
    function th(id, label) {
      var sorted = q.sort.field === id;
      return h('th', { scope: 'col', 'aria-sort': sorted ? (q.sort.dir === 'asc' ? 'ascending' : 'descending') : null }, h('button', { type: 'button', onclick: function () {
        var n = Q.clone(state.query); n.sort = { field: id, dir: sorted && q.sort.dir === 'desc' ? 'asc' : 'desc' }; try { Q.validate(n); go({ query: n }, { replace: true, keepScroll: true }); } catch (e) { toast('Nach dieser Spalte kann nicht sortiert werden'); }
      } }, [label, sorted ? (q.sort.dir === 'asc' ? ' ↑' : ' ↓') : '']));
    }
    var head = h('tr', {}, [th('name', 'Aktie')].concat(q.ranking.enabled ? [th('match', 'Match')] : []).concat(cols.map(function (c) { return th(c, fieldName(c)); })));
    var body = h('tbody', {}, list.map(function (i) {
      var sym = d.symbol(i);
      return h('tr', { tabindex: '0', onclick: function () { if (state.select) toggleSelect(sym); else openQuick(sym); }, onkeydown: function (e) { if (e.key === 'Enter') this.click(); } },
        [h('td', {}, [h('b', { text: (state.select && state.selected.indexOf(sym) >= 0 ? '✓ ' : '') + sym }), h('span', { text: d.name(i) })])]
          .concat(q.ranking.enabled ? [h('td', { text: (function () { var m = E.match(d, q, i).score; return m === null ? '–' : Math.round(m) + ' %'; })() })] : [])
          .concat(cols.map(function (c) { var v = d.value(c, i); return h('td', { class: c === 'perf1d' ? signCls(v) : null, text: F.format(c, v) }); })));
    }));
    return h('div', { class: 'sc-tablewrap', role: 'region', 'aria-label': 'Ergebnistabelle, horizontal scrollbar', tabindex: '0' }, h('table', { class: 'sc-table' }, [h('thead', {}, head), body]));
  }
  function lazySparks(scope) {
    var slots = scope.querySelectorAll('.sc-spark-slot');
    if (!slots.length) return;
    var load = function (slot) {
      var sym = slot.getAttribute('data-sym');
      adapter.sparkSeries(sym).then(function (pts) { if (pts && pts.length) slot.replaceWith(C.sparkline(pts, { label: 'Kursverlauf 1 Jahr ' + sym })); });
    };
    if (!('IntersectionObserver' in window)) { [].forEach.call(slots, load); return; }
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { io.unobserve(x.target); load(x.target); } }); }, { rootMargin: '200px' });
    [].forEach.call(slots, function (s) { io.observe(s); });
  }
  function compareBar() {
    var n = state.selected.length;
    return h('div', { class: 'sc-comparebar', role: 'region', 'aria-label': 'Vergleichsauswahl' }, [h('span', { text: n + (n === 1 ? ' Aktie' : ' Aktien') + ' ausgewählt' }),
      h('button', { class: 'sc-btn', type: 'button', disabled: n < 2 ? true : null, onclick: function () { var c = state.selected.slice(); state.select = false; state.selected = []; go({ view: 'compare', cmp: c }); window.scrollTo(0, 0); } }, n < 2 ? 'Mind. 2 wählen' : 'Vergleichen')]);
  }

  // ------------------------------------------------------------ SORT
  function openSort() {
    var q = state.query, s = openSheet({ title: 'Sortieren & Ansicht', foot: true });
    var dir = q.sort.dir, field = q.sort.field, view = q.view;
    var tiles = h('div', { class: 'sc-viewtiles', role: 'radiogroup', 'aria-label': 'Ansicht' });
    var paintTiles = function () { tiles.replaceChildren.apply(tiles, [['cards', 'Karten', 'cards'], ['compact', 'Kompakt', 'list'], ['table', 'Tabelle', 'table']].map(function (v) {
      return h('button', { type: 'button', role: 'radio', 'aria-checked': String(view === v[0]), onclick: function () { view = v[0]; paintTiles(); } }, [icon(v[2]), v[1]]); })); };
    paintTiles();
    s.body.append(h('p', { class: 'sc-label', style: { marginTop: '4px' }, text: 'Ansicht' }), tiles, h('p', { class: 'sc-label', text: 'Sortieren nach' }));
    var dirSeg = h('div', { class: 'sc-seg', role: 'group', 'aria-label': 'Richtung' });
    var paintDir = function () { dirSeg.replaceChildren(h('button', { type: 'button', 'aria-pressed': String(dir === 'desc'), onclick: function () { dir = 'desc'; paintDir(); } }, [icon('sort'), 'Absteigend']), h('button', { type: 'button', 'aria-pressed': String(dir === 'asc'), onclick: function () { dir = 'asc'; paintDir(); } }, [icon('sort'), 'Aufsteigend'])); };
    paintDir();
    var list = h('div', { class: 'sc-enum', role: 'radiogroup', 'aria-label': 'Sortieren nach' });
    SORTS.forEach(function (x) {
      if (x[0] === 'match' && !q.ranking.enabled) return;
      var cov = x[0] === 'match' || x[0] === 'name' ? null : ds().coverage(x[0]);
      list.append(h('label', {}, [h('input', { type: 'radio', name: 'sc-sort', value: x[0], checked: field === x[0] ? true : null, onchange: function () { field = x[0]; } }), h('span', { text: x[1] }), cov !== null ? h('small', { text: nf(cov) + ' Werte' }) : null]));
    });
    s.body.append(list, h('p', { class: 'sc-label', text: 'Reihenfolge' }), dirSeg, h('p', { class: 'sc-note', text: 'Aktien ohne Wert stehen immer am Ende. Der Quant-Gesamtscore ist noch nicht freigegeben und daher nicht sortierbar – „Übereinstimmung“ erscheint, sobald du im Pro-Modus ein Ranking aktivierst.' }));
    s.foot.append(h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: function () { var n = Q.clone(state.query); n.sort = { field: field, dir: dir }; n.view = view; go({ query: n }, { replace: true }); } }, 'Übernehmen'));
  }

  // ------------------------------------------------------------ LIBRARY
  function openLibrary(opts) {
    opts = opts || {};
    state.targetGroup = opts.target || null;
    var mode = state.query.mode;
    var s = openSheet({ title: 'Filter hinzufügen', full: true, focus: opts.focus ? 'input[type=search]' : null });
    var input = h('input', { type: 'search', placeholder: 'Filter suchen – z. B. ROIC, 200, Umsatz', 'aria-label': 'Kriterien durchsuchen', autocomplete: 'off', enterkeyhint: 'search' });
    var results = h('div', {});
    s.body.append(h('div', { class: 'sc-search' }, h('label', {}, [icon('search'), input])), results);
    var active = {}; Q.filters(state.query).forEach(function (f) { active[f.field] = f; });
    var group = opts.group || null; // null = Kategorien, 'all' = alle Filter
    var titleEl = s.head.querySelector('h2');
    function item(f) {
      var cov = f.available ? ds().coverage(f.id) : 0, usable = f.available && cov > 0;
      var g = F.group(f.group);
      return h('button', { class: 'sc-libitem' + (usable ? '' : ' is-off') + (active[f.id] ? ' is-active' : ''), type: 'button', onclick: function () { openDetail(f.id, { filter: active[f.id] || null, fromLibrary: true }); } }, [
        h('span', { class: 'sc-libicon', 'aria-hidden': 'true' }, icon(g.icon)),
        h('div', {}, [h('b', { text: f.label }), h('span', { text: usable ? f.sub : (f.available ? 'Aktuell keine Werte im Universum' : 'Daten folgen') })]),
        usable ? null : h('span', { class: 'sc-pill is-warn', text: 'Daten folgen' }),
        h('span', { class: 'sc-libadd', 'aria-hidden': 'true' }, icon(active[f.id] ? 'edit' : 'plus'))]);
    }
    function proHint(text) {
      return h('div', { class: 'sc-card', style: { padding: '14px 16px', marginTop: '14px', display: 'flex', alignItems: 'center', gap: '12px' } }, [h('div', { style: { flex: '1' } }, [h('b', { text: 'Pro-Modus' }), h('p', { class: 'sc-note', style: { margin: '2px 0 0' }, text: text })]),
        h('button', { class: 'sc-btn sc-btn-secondary sc-btn-sm', type: 'button', onclick: function () { var n = Q.clone(state.query); n.mode = 'pro'; mode = 'pro'; state.query = n; paint(); refreshBehind(); } }, 'Pro aktivieren')]);
    }
    function paint() {
      var term = input.value.trim();
      results.replaceChildren();
      var all = F.list({ mode: mode });
      if (term) {
        titleEl.textContent = 'Filter hinzufügen';
        var found = F.search(term, { mode: mode });
        results.append(h('p', { class: 'sc-when', style: { marginTop: '0' }, text: found.length + (found.length === 1 ? ' Ergebnis' : ' Ergebnisse') }));
        if (!found.length) results.append(h('div', { class: 'sc-state' }, [h('h3', { text: 'Kein Kriterium gefunden' }), h('p', { text: mode === 'simple' ? 'Im Pro-Modus gibt es weitere Kriterien.' : 'Versuche einen anderen Begriff.' })]));
        else results.append(h('div', { class: 'sc-libitems' }, found.map(item)));
        if (mode === 'simple') { var more = F.search(term, { mode: 'pro' }).length - found.length; if (more > 0) results.append(proHint(more + ' weitere Treffer im Pro-Modus')); }
        return;
      }
      if (!group) {
        titleEl.textContent = 'Filter hinzufügen';
        var cats = h('div', { class: 'sc-libitems sc-cats' });
        var countOf = function (list) { return list.filter(function (f) { return f.available; }).length; };
        cats.append(h('button', { class: 'sc-libitem sc-cat', type: 'button', onclick: function () { group = 'all'; paint(); results.scrollIntoView ? s.body.scrollTo(0, 0) : 0; } },
          [h('span', { class: 'sc-libicon', 'aria-hidden': 'true' }, icon('hits')), h('div', {}, h('b', { text: 'Alle Filter' })), h('span', { class: 'sc-count-pill sc-num', text: String(countOf(all)) }), icon('next')]));
        F.groups({ mode: mode }).forEach(function (g) {
          var list = all.filter(function (f) { return f.group === g.id; });
          var act = list.filter(function (f) { return active[f.id]; }).length;
          cats.append(h('button', { class: 'sc-libitem sc-cat', type: 'button', onclick: function () { group = g.id; paint(); s.body.scrollTo(0, 0); } },
            [h('span', { class: 'sc-libicon', 'aria-hidden': 'true' }, icon(g.icon)), h('div', {}, [h('b', { text: g.label }), act ? h('span', { text: act + ' aktiv' }) : null]), h('span', { class: 'sc-count-pill sc-num', text: String(countOf(list)) }), icon('next')]));
        });
        results.append(cats);
        if (mode === 'simple') results.append(proHint('Bilanz, Perzentile, Quant-Faktoren, Estimates und Gruppen'));
        return;
      }
      var gdef = group === 'all' ? null : F.group(group);
      var fields = group === 'all' ? all : all.filter(function (f) { return f.group === group; });
      titleEl.textContent = gdef ? gdef.label : 'Alle Filter';
      results.append(h('div', { class: 'sc-libback' }, [h('button', { class: 'sc-link', type: 'button', onclick: function () { group = null; paint(); } }, [icon('back'), 'Kategorien']),
        h('span', { class: 'sc-note', text: fields.filter(function (f) { return f.available; }).length + ' Filter' })]));
      results.append(h('div', { class: 'sc-libitems' }, fields.map(item)));
    }
    input.addEventListener('input', debounce(paint, 80));
    paint();
  }
  /** Zeichnet die Seite hinter einem Sheet neu und aktualisiert die URL (ohne Sheets zu schliessen). */
  function refreshBehind() {
    var url = buildURL();
    try { history.replaceState(history.state, '', url); } catch (e) { /* */ }
    var y = window.scrollY; render(); window.scrollTo(0, y);
  }

  // ------------------------------------------------------------ DETAIL
  /** Runde Skalenwerte fuer den Slider: 1-2-2,5-5-Raster bzw. Zehnerpotenzen. */
  function niceTicks(lo, hi, log) {
    var out = [];
    if (log) { for (var e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) out.push(Math.pow(10, e)); }
    else {
      var raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (x) { return x >= raw; })[0] || raw;
      for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(10)));
    }
    if (out.length > 6) out = out.filter(function (_, i) { return i % 2 === 0; });
    return out;
  }
  function niceRound(v) { if (!isFinite(v) || v === 0) return v; var p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1); return Math.round(v / p) * p; }
  function openDetail(fieldId, opts) {
    opts = opts || {};
    var f = F.field(fieldId), d = ds();
    var editing = opts.filter || null;
    var s = openSheet({ title: 'Filter-Detail', full: f.kind === 'enum', back: !!opts.fromLibrary, foot: true });
    var meta = h('div', { class: 'sc-meta' }, [h('span', { class: 'sc-pill', text: F.group(f.group).label }), f.timeframe ? h('span', { class: 'sc-pill', text: f.timeframe }) : null,
      h('span', { class: 'sc-pill', text: { fundamentals: 'SEC-Fundamentaldaten', price: 'Kursdaten', technical: 'Tagesschlusskurse', master: 'Wertpapierstamm', classification: 'SEC SIC', factor: 'Quant V2 Faktorevidenz', estimates: 'Schätzungen', technicalIntelligence: 'Chartbild (Wochenchart, Szenario)' }[f.source] || f.source }),
      f.pro ? h('span', { class: 'sc-pill is-accent', text: 'Pro' }) : null]);
    s.body.append(h('div', { class: 'sc-dhead' }, [h('span', { class: 'sc-libicon is-lg', 'aria-hidden': 'true' }, icon(F.group(f.group).icon)), h('div', {}, [h('h3', { text: f.label }), f.question ? h('p', { text: f.question }) : null])]),
      h('div', { class: 'sc-dbox' }, f.desc || f.reason || ''), meta);
    if (!f.available || !E.isAvailable(d, f.id)) {
      s.body.append(h('div', { class: 'sc-card sc-state' }, [h('h3', { text: 'Keine Daten verfügbar' }), h('p', { text: f.reason || 'Für dieses Kriterium liegen im aktuellen Universum keine Werte vor.' })]));
      s.foot.append(h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: closeTop }, 'Schließen'));
      return;
    }
    var draft = editing ? Q.clone(editing) : null;
    var live = h('div', { class: 'sc-live', 'aria-live': 'polite' });
    var apply = h('button', { class: 'sc-btn sc-btn-primary', type: 'button' });
    function draftQuery() {
      var base = editing ? Q.removeFilter(state.query, editing.id) : state.query;
      try { return Q.addFilter(base, draft, editing ? groupOf(editing.id) : state.targetGroup); } catch (e) { return null; }
    }
    var updateLive = debounce(function () {
      var dq = draftQuery();
      if (!dq) { live.replaceChildren(h('span', { text: 'Bitte einen gültigen Wert eingeben' })); apply.disabled = true; return; }
      apply.disabled = false;
      var r = adapter.screenSync(dq.query, { limit: 0 }), alone = r.perFilter[dq.filter.id];
      live.replaceChildren(h('div', {}, [h('b', { class: 'sc-num', text: nf(r.total) }), h('span', { text: Q.count(state.query) - (editing ? 1 : 0) > 0 ? ' Treffer zusammen mit deinen anderen Filtern' : ' Treffer' })]), f.kind === 'number' ? null : h('span', { class: 'sc-num', text: alone ? nf(alone.pass) + ' erfüllen allein' : '' }));
      apply.textContent = (editing ? 'Übernehmen' : 'Hinzufügen') + ' · ' + nf(r.total) + ' Treffer';
      if (repaintViz) repaintViz();
    }, 90);
    var repaintViz = null;

    if (f.kind === 'enum') {
      var opt = E.enumOptions(d, f.id);
      var chosen = new Set(draft ? draft.value : []);
      draft = { field: f.id, op: 'in', value: Array.from(chosen) };
      var filterInput = opt.length > 8 ? h('input', { type: 'search', placeholder: 'Werte filtern', 'aria-label': 'Werte filtern' }) : null;
      var box = h('div', { class: 'sc-enum', role: 'group', 'aria-label': f.label });
      var paintEnum = function () {
        var t = filterInput ? filterInput.value.trim().toLowerCase() : '';
        box.replaceChildren.apply(box, opt.filter(function (o) { return !t || o.label.toLowerCase().indexOf(t) >= 0 || o.value.toLowerCase().indexOf(t) >= 0; }).map(function (o) {
          return h('label', {}, [h('input', { type: 'checkbox', checked: chosen.has(o.value) ? true : null, onchange: function () { if (this.checked) chosen.add(o.value); else chosen.delete(o.value); draft.value = Array.from(chosen); updateLive(); } }), h('span', { text: o.label }), h('small', { class: 'sc-num', text: nf(o.count) })]);
        }));
      };
      if (filterInput) { filterInput.addEventListener('input', paintEnum); s.body.append(h('div', { class: 'sc-search' }, h('label', {}, [icon('search'), filterInput]))); }
      paintEnum();
      var missing = d.size - opt.reduce(function (a, o) { return f.multi ? a : a + o.count; }, 0);
      s.body.append(h('p', { class: 'sc-label', text: 'Auswahl (mehrere möglich)' }), box, !f.multi && missing ? h('p', { class: 'sc-note', text: nf(missing) + ' Aktien ohne Zuordnung werden durch diesen Filter ausgeschlossen.' }) : null);
      if (f.id === 'country' || f.id === 'region' || f.id === 'companyType') s.body.append(h('p', { class: 'sc-note', text: 'Das aktuelle Universum umfasst US-Stammaktien an ihrer Primärbörse. Weitere Länder und Wertpapierarten folgen mit neuen Datenquellen.' }));
    } else if (f.kind === 'bool') {
      draft = draft || { field: f.id, op: 'is', value: true };
      var seg = h('div', { class: 'sc-seg', role: 'group', 'aria-label': f.label });
      var paintBool = function () { seg.replaceChildren(h('button', { type: 'button', 'aria-pressed': String(draft.value === true), onclick: function () { draft.value = true; paintBool(); updateLive(); } }, 'Ja'), h('button', { type: 'button', 'aria-pressed': String(draft.value === false), onclick: function () { draft.value = false; paintBool(); updateLive(); } }, 'Nein')); };
      paintBool();
      s.body.append(h('p', { class: 'sc-label', text: 'Bedingung' }), seg);
    } else {
      var hist = E.histogram(d, f.id, 30);
      var dom = f.domain ? [f.domain[0], f.domain[1]] : [hist.lo, hist.hi];
      var isLog = hist.log && !f.domain;
      if (!draft) {
        var pre = f.presets && f.presets[0];
        draft = pre ? { field: f.id, op: pre[1], value: pre[2], value2: pre[3] } : { field: f.id, op: 'gt', value: niceRound(hist.median) };
        if (draft.op === 'gte') draft.op = 'gt';
        if (draft.op === 'lte') draft.op = 'lt';
      }
      if (draft.op === 'between' && (draft.value2 === null || draft.value2 === undefined)) draft.value2 = niceRound(hist.p90);
      var ops = h('div', { class: 'sc-ops', role: 'group', 'aria-label': 'Bedingung' });
      var inputs = h('div', {});
      var readout = h('div', { class: 'sc-readout sc-num', 'aria-live': 'polite' });
      var ticks = h('div', { class: 'sc-ticks sc-num', 'aria-hidden': 'true' });
      var isTech = f.tech === 'sma' || f.tech === 'ema' || f.tech === 'cross';
      var techRef = f.tech === 'cross' ? 'SMA 200' : (f.tech === 'ema' ? 'EMA ' : 'SMA ') + f.period;
      var fmtV = function (v) { return F.format(f, v, { signed: false }); };
      var paintReadout = function () {
        var t;
        if (isTech && draft.value === 0 && (draft.op === 'gt' || draft.op === 'gte')) t = 'Über ' + techRef;
        else if (isTech && draft.value === 0 && (draft.op === 'lt' || draft.op === 'lte')) t = 'Unter ' + techRef;
        else if (draft.op === 'between') t = fmtV(draft.value) + ' – ' + fmtV(draft.value2);
        else t = ({ gt: '> ', gte: '≥ ', lt: '< ', lte: '≤ ', eq: '= ' })[draft.op] + fmtV(draft.value);
        readout.textContent = t;
      };
      var presets = h('div', { class: 'sc-presets' });
      var toPos = function (v) { if (isLog) { var a = Math.log10(dom[0]), b = Math.log10(dom[1]); return Math.round(((Math.log10(Math.max(v, dom[0])) - a) / (b - a)) * 1000); } return Math.round(((v - dom[0]) / (dom[1] - dom[0])) * 1000); };
      var fromPos = function (p) { var t = Math.max(0, Math.min(1000, p)) / 1000; if (isLog) return niceRound(Math.pow(10, Math.log10(dom[0]) + t * (Math.log10(dom[1]) - Math.log10(dom[0])))); var v = dom[0] + t * (dom[1] - dom[0]); var st = f.domain ? f.domain[2] : niceRound((dom[1] - dom[0]) / 100) || 1; return Number((Math.round(v / st) * st).toPrecision(8)); };
      var numInput = function (key) {
        var unit = F.inputUnit(f, draft[key]);
        var inp = h('input', { type: 'text', inputmode: 'decimal', value: F.toInput(f, draft[key]).replace('.', ','), 'aria-label': key === 'value' ? (draft.op === 'between' ? 'Von' : 'Wert') : 'Bis' });
        var unitEl;
        if (f.unit === 'usd' && f.id !== 'price' && f.id !== 'eps' && f.id !== 'epsFy') {
          unitEl = h('select', { 'aria-label': 'Einheit' }, ['Mio. $', 'Mrd. $'].map(function (u) { return h('option', { value: u, selected: u === unit ? true : null }, u); }));
          unitEl.addEventListener('change', function () { var v = F.fromInput(f, inp.value, unitEl.value); if (v !== null) { draft[key] = v; syncSliders(); updateLive(); } });
        } else unitEl = unit ? h('em', { text: unit }) : null;
        inp.addEventListener('input', function () { var v = F.fromInput(f, inp.value, unitEl && unitEl.value); if (v === null) { apply.disabled = true; return; } draft[key] = v; syncSliders(); updateLive(); paintPresets(); });
        return { el: h('label', { class: 'sc-input' }, [inp, unitEl]), inp: inp, unitEl: unitEl };
      };
      var sliderWrap = h('div', {}), fields = {}, sliders = {};
      var syncSliders = function () {
        paintReadout();
        ['value', 'value2'].forEach(function (k) { if (sliders[k]) { sliders[k].value = toPos(draft[k]); } });
        if (draft.op === 'between' && sliders.track) { var a = toPos(draft.value) / 10, b = toPos(draft.value2) / 10; sliders.track.style.left = a + '%'; sliders.track.style.width = Math.max(0, b - a) + '%'; }
        else if (sliders.value) { var p = toPos(draft.value) / 10, on = 'var(--sc-accent)', off = 'var(--sc-surface-3)'; sliders.value.style.setProperty('--track', draft.op === 'lt' || draft.op === 'lte' ? 'linear-gradient(90deg,' + on + ' 0 ' + p + '%,' + off + ' ' + p + '%)' : draft.op === 'eq' ? off : 'linear-gradient(90deg,' + off + ' 0 ' + p + '%,' + on + ' ' + p + '%)'); }
      };
      var setFromSlider = function (k, pos) {
        draft[k] = fromPos(pos);
        if (draft.op === 'between' && draft.value > draft.value2) { var t = draft.value; draft.value = draft.value2; draft.value2 = t; }
        if (fields[k]) { fields[k].inp.value = F.toInput(f, draft[k]).replace('.', ','); if (fields[k].unitEl && fields[k].unitEl.tagName === 'SELECT') fields[k].unitEl.value = F.inputUnit(f, draft[k]); }
        syncSliders(); updateLive(); paintPresets();
      };
      var paintInputs = function () {
        fields = {}; sliders = {};
        fields.value = numInput('value');
        var row = h('div', { class: 'sc-inputs' }, [fields.value.el]);
        if (draft.op === 'between') { fields.value2 = numInput('value2'); row.append(h('span', { class: 'sc-muted', text: 'bis' }), fields.value2.el); }
        inputs.replaceChildren(row);
        if (draft.op === 'between') {
          sliders.track = h('i');
          sliders.value = h('input', { type: 'range', class: 'sc-range', min: '0', max: '1000', step: '1', 'aria-label': 'Untere Grenze', oninput: function () { setFromSlider('value', Number(this.value)); } });
          sliders.value2 = h('input', { type: 'range', class: 'sc-range', min: '0', max: '1000', step: '1', 'aria-label': 'Obere Grenze', oninput: function () { setFromSlider('value2', Number(this.value)); } });
          sliderWrap.replaceChildren(h('div', { class: 'sc-dual' }, [h('div', { class: 'sc-dual-track' }, sliders.track), sliders.value, sliders.value2]));
        } else {
          sliders.value = h('input', { type: 'range', class: 'sc-range', min: '0', max: '1000', step: '1', 'aria-label': f.label + ' Schwelle', oninput: function () { setFromSlider('value', Number(this.value)); } });
          sliderWrap.replaceChildren(sliders.value);
        }
        sliderWrap.append(ticks);
        ticks.replaceChildren.apply(ticks, niceTicks(dom[0], dom[1], isLog).map(function (v) { return h('span', { style: { left: toPos(v) / 10 + '%' }, text: F.format(f, v, { signed: false }).replace(/\u00a0(Mrd|Mio|Bio|Tsd)\.\u00a0\$/, '\u00a0$1.') }); }));
        syncSliders();
      };
      var paintOps = function () {
        ops.replaceChildren.apply(ops, (isTech ? [['gt', 'Über (>)'], ['lt', 'Unter (<)'], ['between', 'Bereich'], ['eq', 'Gleich']] : [['gt', 'Größer als'], ['lt', 'Kleiner als'], ['between', 'Bereich'], ['eq', 'Gleich']]).map(function (o) {
          var on = draft.op === o[0] || (o[0] === 'gt' && draft.op === 'gte') || (o[0] === 'lt' && draft.op === 'lte');
          return h('button', { type: 'button', 'aria-pressed': String(on), onclick: function () {
            draft.op = o[0];
            if (o[0] === 'between') { if (draft.value2 === null || draft.value2 === undefined || draft.value2 <= draft.value) draft.value2 = niceRound(Math.max(draft.value, hist.p90)); if (draft.value2 <= draft.value) draft.value2 = niceRound(draft.value * 2 || 1); }
            paintOps(); paintInputs(); updateLive(); paintPresets();
          } }, o[1]);
        }));
      };
      var paintPresets = function () {
        presets.replaceChildren.apply(presets, (f.presets || []).map(function (p) {
          var on = draft.op === p[1] && draft.value === p[2] && (p[1] !== 'between' || draft.value2 === p[3]);
          return h('button', { class: 'sc-preset', type: 'button', 'aria-pressed': String(on), onclick: function () { draft.op = p[1]; draft.value = p[2]; draft.value2 = p[3] === undefined ? null : p[3]; paintOps(); paintInputs(); updateLive(); paintPresets(); } }, p[0]);
        }));
      };
      paintOps(); paintInputs(); paintPresets();
      var histSlot = h('div', {}), vizSlot = h('div', {});
      repaintViz = function () {
        var test = E.compile(d, { field: f.id, op: draft.op, value: draft.value, value2: draft.value2 });
        var inRange = function (b) { var mid = hist.log ? Math.sqrt(b.lo * b.hi) : (b.lo + b.hi) / 2; var t = { gt: mid > draft.value, gte: mid >= draft.value, lt: mid < draft.value, lte: mid <= draft.value, between: mid >= draft.value && mid <= draft.value2, eq: b.lo <= draft.value && b.hi >= draft.value }; return t[draft.op]; };
        histSlot.replaceChildren(C.histogram(hist, { inRange: inRange, markers: draft.op === 'between' ? [draft.value, draft.value2] : [draft.value], markerLabel: fmtV, fmt: fmtV, label: 'Verteilung von ' + f.label + ' im Universum' }));
        var pass = 0; for (var j = 0; j < d.size; j++) if (test(j) === true) pass++;
        var share = hist.total ? pass / hist.total * 100 : 0;
        hintSlot.replaceChildren(h('div', { class: 'sc-hint' }, [icon('bulb'), h('p', {}, [h('b', { class: 'sc-num', text: share.toLocaleString('de-DE', { maximumFractionDigits: share < 10 ? 1 : 0 }) + ' %' }), ' der Aktien mit Wert erfüllen diese Bedingung allein (' + nf(pass) + ' von ' + nf(hist.total) + '). Median im Universum: ' + fmtV(hist.median) + '.' + (hist.missing ? ' ' + nf(hist.missing) + ' Aktien ohne Daten werden ausgeschlossen.' : '')])]));
        if (f.tech === 'sma' || f.tech === 'ema' || f.tech === 'cross') {
          var above = (draft.op === 'gt' || draft.op === 'gte' || draft.op === 'between') && draft.value >= 0;
          var ref = f.tech === 'cross' ? 'SMA200' : (f.tech === 'ema' ? 'EMA' : 'SMA') + f.period, subj = f.tech === 'cross' ? 'SMA50' : 'Kurs';
          var n = 0; for (var i = 0; i < d.size; i++) if (test(i) === true) n++;
          vizSlot.replaceChildren(h('div', { class: 'sc-techviz' }, [h('div', { class: 'sc-legend', style: { marginTop: 0, marginBottom: '6px' } }, [h('span', { style: { color: 'var(--sc-accent)' } }, [h('i'), subj]), h('span', { style: { color: 'var(--sc-dim)' } }, [h('i'), ref]), h('span', { text: 'Schema, keine echte Kurve' })]), C.techSchema(f.tech, above)]),
            h('div', { class: 'sc-status' }, [h('span', { class: 'sc-okdot' }, icon('check')), h('p', { text: subj + ' ' + (above ? 'über ' : 'unter ') + ref + ': trifft aktuell auf ' + nf(n) + ' von ' + nf(hist.total) + ' Aktien zu.' })]));
        }
      };
      var hintSlot = h('div', {});
      s.body.append(h('p', { class: 'sc-label', text: 'Bedingung' }), ops, readout, sliderWrap, inputs, h('p', { class: 'sc-label', text: 'Schnellauswahl' }), presets);
      if (!f.presets || !f.presets.length) presets.previousSibling.remove();
      if (isTech) s.body.append(h('p', { class: 'sc-label', text: 'So sieht das aus' }));
      s.body.append(vizSlot, h('p', { class: 'sc-label', text: 'Verteilung im Universum' }), histSlot, hintSlot);
      if (f.formula && info().formulas && info().formulas[f.formula]) s.body.append(h('div', { class: 'sc-formula', text: 'Berechnung: ' + info().formulas[f.formula] }));
      repaintViz();
    }
    s.body.append(live);
    if (state.query.mode === 'pro' && state.query.groups.length > 1) {
      var gsel = h('select', { 'aria-label': 'Gruppe' }, state.query.groups.map(function (g, gi) { return h('option', { value: g.id, selected: (editing ? groupOf(editing.id) : state.targetGroup || state.query.groups[state.query.groups.length - 1].id) === g.id ? true : null }, g.name || 'Gruppe ' + (gi + 1)); }));
      gsel.addEventListener('change', function () { state.targetGroup = gsel.value; });
      s.body.append(h('label', { class: 'sc-field', style: { marginTop: '14px' } }, [h('span', { text: 'Gruppe' }), gsel]));
      state.targetGroup = gsel.value;
    }
    if (editing) s.foot.append(h('button', { class: 'sc-btn sc-btn-danger', type: 'button', onclick: function () { go({ query: Q.removeFilter(state.query, editing.id) }, { keepScroll: true }); toast('Filter entfernt'); } }, 'Entfernen'));
    apply.addEventListener('click', function () {
      var dq;
      try {
        if (editing) {
          var tgt = state.targetGroup && groupOf(editing.id) !== state.targetGroup ? state.targetGroup : null;
          dq = Q.updateFilter(state.query, editing.id, draft);
          if (tgt) dq = Q.moveFilter(dq, editing.id, tgt);
        } else dq = Q.addFilter(state.query, draft, state.targetGroup).query;
      } catch (e) { toast('Bitte einen gültigen Wert eingeben'); return; }
      go({ query: dq }, { keepScroll: true });
      toast(editing ? 'Filter aktualisiert' : 'Filter hinzugefügt');
    });
    s.foot.append(apply);
    updateLive();
  }
  function groupOf(filterId) { var g = state.query.groups.filter(function (x) { return x.filters.some(function (f) { return f.id === filterId; }); })[0]; return g ? g.id : null; }

  // ------------------------------------------------------------ WHY
  function openWhy(sym) {
    var d = ds(), i = d.indexOf(sym);
    var s = openSheet({ title: 'Warum Treffer?', foot: true });
    if (i < 0) { s.body.append(h('p', { text: 'Diese Aktie ist nicht im Screener-Universum.' })); return; }
    s.body.append(h('div', { class: 'sc-qr-head' }, [logo(sym), h('div', {}, [h('b', { text: d.name(i) }), h('span', { text: sym + ' · ' + (d.value('sector', i) ? F.enumLabel('sector', d.value('sector', i), d.meta.dict) : 'ohne Sektor') })])]));
    whyList(s.body, sym, true);
    s.foot.append(h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: function () { closeTop().then(function () { openQuick(sym); }); } }, 'Quick Research'),
      h('a', { class: 'sc-btn sc-btn-primary', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, 'Aktie öffnen'));
  }
  function whyList(container, sym, withCharts) {
    var d = ds(), i = d.indexOf(sym), q = state.query;
    var groups = E.why(d, q, i);
    if (!groups.length) { container.append(h('p', { class: 'sc-note', text: 'Es sind keine Filter aktiv – jede Aktie des Universums ist ein Treffer.' })); return; }
    container.append(h('p', { class: 'sc-field-desc', text: 'So erfüllt diese Aktie deine Kriterien – mit dem gemessenen Wert.' }));
    groups.forEach(function (g, gi) {
      var passG = g.op === 'OR' ? g.items.some(function (x) { return x.pass === true; }) : g.items.every(function (x) { return x.pass === true; });
      if (groups.length > 1 || g.op === 'OR') container.append(h('p', { class: 'sc-label', text: (g.name || 'Gruppe ' + (gi + 1)) + (g.op === 'OR' ? ' · mindestens ein Kriterium (ODER)' : '') + (passG ? ' ✓' : ' ✗') }));
      var list = h('div', { class: 'sc-why-list' });
      g.items.forEach(function (x) {
        var dot = h('span', { class: 'sc-okdot' + (x.pass === true ? '' : x.pass === null ? ' is-na' : ' is-no'), 'aria-label': x.pass === true ? 'erfüllt' : x.pass === null ? 'keine Daten' : 'nicht erfüllt' }, icon(x.pass === true ? 'check' : x.pass === null ? 'minus' : 'x'));
        var row = h('div', { class: 'sc-why-item' }, [dot, h('div', { style: { minWidth: 0 } }, [h('b', { text: x.label }), h('span', { text: x.pass === true ? 'erfüllt' : x.pass === null ? 'keine Daten verfügbar' : 'nicht erfüllt' })]), h('span', { class: 'sc-v sc-num', text: x.shown })]);
        list.append(row);
        if (withCharts && (x.field.tech === 'sma' && x.field.period >= 50 || x.field.tech === 'cross')) {
          var slot = h('div', { class: 'sc-techviz', style: { marginTop: '-2px' } }, h('div', { class: 'sc-skel', style: { height: '110px' } }));
          list.append(slot);
          adapter.series(sym).then(function (pts) {
            if (!pts) { slot.replaceChildren(h('p', { class: 'sc-note', text: 'Kursreihe nicht verfügbar.' })); return; }
            var pc = C.priceChart(pts.slice(-260), { label: 'Kurs mit SMA50 und SMA200' });
            if (!pc.svg) { slot.remove(); return; }
            var ref = x.field.tech === 'cross' ? 'SMA50 liegt ' + (pc.sma50 > pc.sma200 ? 'über' : 'unter') + ' SMA200' : 'Kurs liegt aktuell ' + (x.value > 0 ? 'über' : 'unter') + ' SMA' + x.field.period + ' (' + F.format(x.field, x.value, { signed: true }) + ')';
            slot.replaceChildren(pc.svg, h('div', { class: 'sc-legend' }, [h('span', {}, [h('i', { style: { background: 'var(--sc-text)' } }), 'Kurs']), h('span', { style: { color: 'var(--sc-accent)' } }, [h('i'), 'SMA50']), h('span', { style: { color: 'var(--sc-warn)' } }, [h('i'), 'SMA200'])]), h('p', { text: ref }));
          });
        }
      });
      container.append(list);
    });
    var r = result(), inResult = r.order.indexOf(i) >= 0;
    container.append(inResult ? h('div', { class: 'sc-allgood' }, [h('b', { text: 'Alle Kriterien erfüllt' }), h('span', { text: 'Diese Aktie passt zu deinem Screen. Das ist kein Anlageurteil.' })])
      : h('div', { class: 'sc-allgood', style: { background: 'var(--sc-down-soft)' } }, [h('b', { style: { color: 'var(--sc-down)' }, text: 'Nicht im aktuellen Ergebnis' }), h('span', { text: 'Mindestens ein Kriterium ist nicht erfüllt oder es fehlen Daten.' })]));
  }

  // ------------------------------------------------------------ QUICK RESEARCH
  function openQuick(sym, opts) {
    opts = opts || {};
    var d = ds(), i = d.indexOf(sym);
    var s = openSheet({ title: 'Quick Research', full: true, foot: true, onClose: function () { if (state.stock) { state.stock = null; } } });
    s.stock = true;
    if (i < 0) { s.body.append(h('div', { class: 'sc-state' }, [h('h3', { text: 'Nicht im Screener-Universum' }), h('p', { text: sym + ' gehört nicht zum aktuellen Universum (z. B. ETF oder separate Aktiengattung).' })])); s.foot.append(h('a', { class: 'sc-btn sc-btn-primary', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, 'In Discover öffnen')); return; }
    var chg = d.value('perf1d', i);
    s.body.append(h('div', { class: 'sc-qr-head' }, [logo(sym, true), h('div', { style: { minWidth: 0, flex: '1' } }, [h('b', { text: d.name(i) }), h('span', { text: secLine(i) }),
      h('div', { style: { marginTop: '4px' } }, [h('span', { class: 'sc-price sc-num', text: F.format('price', d.value('price', i)) }), h('span', { class: 'sc-chg sc-num ' + signCls(chg), text: F.format('perf1d', chg) })])]), watchBtn(sym)]));
    var tabs = [['overview', 'Übersicht'], ['numbers', 'Kennzahlen'], ['chart', 'Chart']];
    var cur = 'overview', panel = h('div', { role: 'tabpanel' });
    var tabEl = h('div', { class: 'sc-tabs', role: 'tablist' });
    function paintTabs() {
      tabEl.replaceChildren.apply(tabEl, tabs.map(function (t) { return h('button', { type: 'button', role: 'tab', 'aria-selected': String(cur === t[0]), onclick: function () { cur = t[0]; paintTabs(); paintPanel(); } }, t[1]); }));
    }
    var research = null, series = null, failed = false;
    function paintPanel() {
      panel.replaceChildren();
      if (cur === 'overview') overview(panel, sym, i, research, failed);
      else if (cur === 'numbers') numbers(panel, research, failed);
      else chartTab(panel, sym, i, series);
    }
    paintTabs(); paintPanel();
    s.body.append(tabEl, panel);
    adapter.research(sym).then(function (r) { research = r; paintPanel(); }).catch(function () { failed = true; paintPanel(); });
    adapter.series(sym).then(function (p) { series = p || []; if (cur === 'chart') paintPanel(); });
    s.foot.append(state.select ? null : h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: function () { var c = state.cmp.indexOf(sym) >= 0 ? state.cmp : state.cmp.concat([sym]).slice(-3); go({ view: 'compare', cmp: c }); } }, [icon('compare'), 'Vergleich']),
      h('a', { class: 'sc-btn sc-btn-primary', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, 'Aktie vollständig öffnen'));
  }
  function kv(pairs) { return h('div', { class: 'sc-kv' }, pairs.map(function (p) { return h('div', {}, [h('span', { text: p[0] }), h('b', { class: 'sc-num ' + (p[2] || ''), text: p[1] })]); })); }
  function overview(panel, sym, i, research, failed) {
    var d = ds(), q = state.query;
    if (Q.count(q)) { panel.append(h('p', { class: 'sc-label', text: 'Screener-Match' })); whyList(panel, sym, false); }
    var metrics = E.cardMetrics(q, 4);
    var base = ['marketCap', 'pe', 'ps', 'evEbitda', 'revenueGrowth', 'grossMargin', 'roic', 'fcfYield', 'beta', 'distance52wHigh', 'perf1y', 'volatility'];
    var ids = metrics.concat(base.filter(function (b) { return metrics.indexOf(b) < 0; })).slice(0, 12);
    var VQ = { FOREIGN_FILER: 'Ausländischer Emittent ohne US-Quartalsberichte: Das Verhältnis des US-Papiers (ADR) zur Stammaktie ist unbekannt.', NON_USD_REPORTING: 'Die SEC-Zahlen sind nicht in US-Dollar berichtet; Kurs und Gewinn je Aktie wären vermischt.', IMPLAUSIBLE_SHARE_BASIS: 'Die gemeldete Aktienzahl passt nicht zum gehandelten Papier.' };
    if (d.cols.vq && d.cols.vq[i] && d.cols.vq[i] !== 'OK') panel.append(h('div', { class: 'sc-card', style: { padding: '12px 14px', margin: '14px 0 0', borderColor: 'var(--sc-warn)' } }, [h('b', { text: 'Bewertung zurückgehalten' }), h('p', { class: 'sc-note', style: { margin: '2px 0 0' }, text: (VQ[d.cols.vq[i]] || '') + ' Marktkapitalisierung, KGV und weitere Bewertungskennzahlen werden deshalb nicht gezeigt. Margen und Wachstum bleiben gültig.' })]));
    panel.append(h('p', { class: 'sc-label', text: 'Wichtige Kennzahlen' }), kv(ids.map(function (id) { var v = d.value(id, i); return [fieldName(id), F.format(id, v), F.field(id).unit === 'pct' && F.field(id).group !== 'quality' && F.field(id).group !== 'valuation' ? signCls(v) : '']; })));
    // Faktorevidenz
    var fac = [['qualityFactor', 'Qualität'], ['growthFactor', 'Wachstum'], ['momentumFactor', 'Momentum'], ['valueFactor', 'Bewertung'], ['profitabilityFactor', 'Profitabilität'], ['riskFactor', 'Risiko']];
    var facBox = h('div', { class: 'sc-card', style: { padding: '8px 14px' } });
    var any = false;
    fac.forEach(function (x) {
      var v = d.value(x[0], i);
      if (v !== null) any = true;
      facBox.append(h('div', { class: 'sc-weight', style: { padding: '8px 0' } }, [h('div', { class: 'sc-weight-head' }, [h('span', { text: x[1] }), h('output', { class: 'sc-num', text: v === null ? '–' : Math.round(v) })]),
        h('div', { class: 'sc-step-bar', style: { marginTop: '6px' } }, h('i', { style: { width: (v || 0) + '%', background: 'var(--sc-accent)' } }))]));
    });
    panel.append(h('p', { class: 'sc-label', text: 'Quant V2 · Faktorevidenz' }), any ? facBox : h('p', { class: 'sc-note', text: 'Für diese Aktie liegt keine Faktorevidenz vor.' }),
      h('p', { class: 'sc-note', text: 'Einzelfaktoren 0–100 im Branchenvergleich. Der Quant-Gesamtscore ist noch nicht freigegeben und wird deshalb nicht angezeigt.' }));
    // Unternehmen
    var was = d.cols.was[i];
    panel.append(h('p', { class: 'sc-label', text: 'Unternehmen' }),
      h('p', { style: { margin: '0 0 10px' }, text: was || 'Keine Unternehmensbeschreibung verfügbar.' , class: was ? null : 'sc-note' }),
      kv([['Sektor (aus SIC)', d.value('sector', i) ? F.enumLabel('sector', d.value('sector', i), d.meta.dict) : '–'], ['Branche (SIC)', d.value('industry', i) ? F.enumLabel('industry', d.value('industry', i), d.meta.dict) : '–'],
        ['Börse', d.value('exchange', i) || '–'], ['Erster Handelstag', d.cols.ipo[i] ? dateDe(d.cols.ipo[i]) : '–'], ['Index', (d.cols.idx[i] || []).map(function (x) { return F.enumLabel('index', x); }).join(', ') || '–'], ['Umsatz (TTM)', F.format('revenue', d.value('revenue', i))]]));
    panel.append(h('div', { class: 'sc-actions' }, [
      h('a', { class: 'sc-row', href: '/vu2/?view=stock&ticker=' + encodeURIComponent(sym) }, [icon('vu'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Quant-Analyse' }), h('span', { text: 'Faktoren, Technik und Fundamentaldaten in Vision Universe Quant' })]), icon('next')]),
      h('a', { class: 'sc-row', href: '/discover/#/s/US_REAL/' + encodeURIComponent(sym) }, [icon('open'), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Aktienanalyse' }), h('span', { text: 'Vollständige Aktienseite mit Chart und Einordnung' })]), icon('next')])]));
    if (failed) panel.append(h('p', { class: 'sc-note', text: 'Detaildaten konnten nicht geladen werden.' }));
  }
  function numbers(panel, r, failed) {
    if (failed) { panel.append(h('div', { class: 'sc-state' }, [h('h3', { text: 'Kennzahlen nicht verfügbar' }), h('p', { text: 'Die Detaildaten dieser Aktie konnten nicht geladen werden.' })])); return; }
    if (!r) { panel.append(h('div', { class: 'sc-kpis' }, [0, 1, 2, 3].map(function () { return h('div', { class: 'sc-skel', style: { height: '110px' } }); }))); return; }
    var f = r.fundamentals;
    if (!f || !f.available || !f.journey || !f.journey.available) { panel.append(h('div', { class: 'sc-state' }, [h('h3', { text: 'Keine Fundamentaldaten' }), h('p', { text: 'Für diese Aktie liegen keine SEC-Jahreszahlen vor.' })])); return; }
    var t = f.journey.tracks;
    function last(arr, n) { return (arr || []).filter(function (p) { return p && p.v !== null && isFinite(p.v); }).slice(-(n || 5)); }
    var items = [
      ['Umsatz', last(t.revenue), 'usd', 'var(--sc-accent)'],
      ['Bruttomarge', last(t.margins && t.margins.gross), 'margin', '#14a37f'],
      ['Free Cashflow', last(t.free_cash_flow), 'usd', 'var(--sc-accent)'],
      ['EPS (verwässert)', last(t.eps_diluted), 'eps', '#7d5bd6'],
      ['Nettomarge', last(t.margins && t.margins.net), 'margin', '#14a37f'],
      ['Jahresüberschuss', last(t.net_income), 'usd', 'var(--sc-accent)']];
    var grid = h('div', { class: 'sc-kpis' });
    items.forEach(function (it) {
      var s = it[1];
      if (!s.length) return;
      var lastV = s[s.length - 1].v, prev = s.length > 1 ? s[s.length - 2].v : null;
      var val = it[2] === 'usd' ? F.format('revenue', lastV) : it[2] === 'eps' ? F.format('eps', lastV) : F.format('grossMargin', lastV);
      var ch = null, chCls = '';
      if (prev !== null) {
        if (it[2] === 'margin') { var pp = (lastV - prev) * 100; ch = (pp > 0 ? '+' : pp < 0 ? '−' : '') + Math.abs(pp).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Pp.'; chCls = signCls(pp); }
        else if (prev > 0) { var g = lastV / prev - 1; ch = F.format('revenueGrowth', g); chCls = signCls(g); }
      }
      var chart = C.bars(s.map(function (p) { return { fy: p.fy, v: it[2] === 'margin' ? p.v * 100 : p.v }; }), { label: it[0] + ' je Geschäftsjahr' });
      chart.style.setProperty('--kc', it[3]);
      grid.append(h('div', { class: 'sc-kpi' }, [h('span', { text: it[0] }), h('div', {}, [h('b', { class: 'sc-num', text: val }), ch ? h('em', { class: 'sc-num ' + chCls, text: ch }) : null]), chart, h('small', { text: 'GJ ' + s[s.length - 1].fy + (ch ? ' ggü. Vorjahr' : '') })]));
    });
    panel.append(grid, h('p', { class: 'sc-note', text: 'Quelle: SEC EDGAR (companyfacts), Geschäftsjahre · Stand ' + dateDe(f.asOf) + '. TTM-Werte bis ' + (f.ttmThrough || '–') + ' stehen in den Kennzahlen der Übersicht.' }));
  }
  function chartTab(panel, sym, i, series) {
    if (!series) { panel.append(h('div', { class: 'sc-skel', style: { height: '170px' } })); return; }
    if (!series.length) { panel.append(h('div', { class: 'sc-state' }, [h('h3', { text: 'Kein Kursverlauf' }), h('p', { text: 'Für diese Aktie liegt keine Tagesreihe vor.' })])); return; }
    var pc = C.priceChart(series, { label: 'Kursverlauf 1 Jahr mit SMA50 und SMA200' });
    var d = ds();
    panel.append(pc.svg, h('div', { class: 'sc-legend' }, [h('span', {}, [h('i', { style: { background: 'var(--sc-text)' } }), 'Kurs']), h('span', { style: { color: 'var(--sc-accent)' } }, [h('i'), 'SMA50']), h('span', { style: { color: 'var(--sc-warn)' } }, [h('i'), 'SMA200 (ab 200 Tagen)'])]),
      h('p', { class: 'sc-label', text: 'Technik' }),
      kv([['Kurs vs. SMA50', F.format('priceVsSma50', d.value('priceVsSma50', i)), signCls(d.value('priceVsSma50', i))], ['Kurs vs. SMA200', F.format('priceVsSma200', d.value('priceVsSma200', i)), signCls(d.value('priceVsSma200', i))],
        ['Abstand 52W-Hoch', F.format('distance52wHigh', d.value('distance52wHigh', i))], ['RSI (14)', F.format('rsi', d.value('rsi', i))], ['Performance 6 M.', F.format('perf6m', d.value('perf6m', i)), signCls(d.value('perf6m', i))], ['Volatilität', F.format('volatility', d.value('volatility', i))]]),
      h('p', { class: 'sc-note', text: 'Tagesschlusskurse (split-bereinigt), ' + series[0][0] + ' bis ' + series[series.length - 1][0] + '.' }));
  }

  // ------------------------------------------------------------ SAVE / SHARE
  function openSave() {
    var existing = state.screenId && store.get(state.screenId);
    var s = openSheet({ title: existing ? 'Screen speichern' : 'Neuen Screen speichern', foot: true, focus: 'input' });
    var name = h('input', { type: 'text', maxlength: '60', value: existing ? existing.name : '', placeholder: 'z. B. Tech Small Caps', required: true });
    var desc = h('textarea', { rows: '3', maxlength: '280', placeholder: 'Wofür ist dieser Screen? (optional)' }, existing ? existing.description : '');
    s.body.append(h('label', { class: 'sc-field' }, [h('span', { text: 'Name' }), name]), h('label', { class: 'sc-field' }, [h('span', { text: 'Beschreibung' }), desc]),
      h('p', { class: 'sc-note', text: 'Gespeichert werden Filter, Gruppen, Verknüpfungen, Sortierung, Ranking und Ansicht – auf diesem Gerät. Ergebnisse werden bei jedem Öffnen mit dem dann aktuellen Datenstand neu berechnet.' }));
    function save(asNew) {
      try {
        var sc = store.save({ id: asNew ? null : existing && existing.id, name: name.value, description: desc.value, query: state.query });
        var r = result();
        store.recordRun(sc.id, { asOf: info().asOf, count: r.total, symbols: r.order.map(function (i) { return ds().symbol(i); }) });
        go({ screenId: sc.id }, { replace: true, keepScroll: true });
        toast('„' + sc.name + '“ gespeichert');
      } catch (e) { toast(e.message === 'NAME_REQUIRED' ? 'Bitte einen Namen eingeben' : e.message === 'TOO_MANY_SCREENS' ? 'Höchstens 50 Screens' : 'Speichern nicht möglich'); name.focus(); }
    }
    if (existing) s.foot.append(h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: function () { save(true); } }, 'Als neu'));
    s.foot.append(h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: function () { save(false); } }, 'Speichern'));
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(false); });
  }
  function share() {
    var url = location.origin + buildURL({ screenId: null });
    if (navigator.share && !mqDesk.matches) { navigator.share({ title: 'Vision Universe Screener', text: screenLabel(state.query), url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Link kopiert'); }, function () { toast('Link: ' + url); });
    else toast(url);
  }

  // ------------------------------------------------------------ SAVED
  function viewSaved(main) {
    main.append(bar('Gespeichert'));
    var list = store.screens();
    main.append(h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, h('h2', { text: 'Gespeicherte Screens' }))]));
    if (!list.length) main.append(h('div', { class: 'sc-card sc-state' }, [h('h3', { text: 'Noch keine gespeicherten Screens' }), h('p', { text: 'Baue einen Screen und speichere ihn. Beim nächsten Datenstand siehst du, welche Aktien neu dazugekommen sind.' }),
      h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: function () { go({ view: Q.count(state.query) ? 'build' : 'start' }); } }, 'Screen bauen')]));
    else {
      var box = h('div', { class: 'sc-list' });
      list.forEach(function (s) {
        var runs = s.runs || [], last = runs[runs.length - 1], dd = runs.length === 2 ? E.diff(runs[0].symbols, runs[1].symbols) : null;
        box.append(h('div', { class: 'sc-card', style: { padding: '16px' } }, [
          h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } }, [h('div', { style: { flex: '1', minWidth: 0 } }, [h('b', { style: { fontSize: '17px', display: 'block' }, text: s.name }), h('p', { class: 'sc-note', style: { margin: '2px 0 0' }, text: s.description || screenLabel(s.query) })]),
            iconBtn('trash', s.name + ' löschen', function () { confirmDelete(s); })]),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '10px 0 12px' } }, [h('span', { class: 'sc-pill', text: Q.count(s.query) + ' Filter' }), s.query.mode === 'pro' ? h('span', { class: 'sc-pill is-accent', text: 'Pro' }) : null,
            last ? h('span', { class: 'sc-pill sc-num', text: nf(last.count) + ' Treffer · ' + dateDe(last.asOf) }) : null,
            dd ? h('span', { class: 'sc-pill is-good sc-num', text: '+' + dd.added.length + ' neu · −' + dd.removed.length + ' entfernt' }) : null,
            s.notify && (s.notify.newMatches || s.notify.removed || s.notify.bigChanges || s.notify.weekly) ? h('span', { class: 'sc-pill', text: '🔔 vorgemerkt' }) : null]),
          h('div', { style: { display: 'flex', gap: '8px' } }, [h('button', { class: 'sc-btn sc-btn-primary sc-btn-sm', type: 'button', style: { flex: '1' }, onclick: function () { openParams(Q.toParams(s.query).toString(), s.id); } }, 'Öffnen'),
            h('button', { class: 'sc-btn sc-btn-secondary sc-btn-sm', type: 'button', style: { flex: '1' }, onclick: function () { go({ view: 'changes', screenId: s.id }); window.scrollTo(0, 0); } }, 'Veränderungen')])]));
      });
      main.append(box);
    }
    main.append(recentSection(12));
  }
  function confirmDelete(s) {
    var sh = openSheet({ title: 'Screen löschen?', foot: true });
    sh.body.append(h('p', { class: 'sc-field-desc', text: '„' + s.name + '“ und sein Verlauf werden von diesem Gerät entfernt.' }));
    sh.foot.append(h('button', { class: 'sc-btn sc-btn-secondary', type: 'button', onclick: closeTop }, 'Abbrechen'), h('button', { class: 'sc-btn sc-btn-danger', type: 'button', onclick: function () { store.remove(s.id); go({ screenId: state.screenId === s.id ? null : state.screenId }, { replace: true }); toast('Gelöscht'); } }, 'Löschen'));
  }

  // ------------------------------------------------------------ CHANGES
  function viewChanges(main) {
    var s = state.screenId && store.get(state.screenId);
    main.append(bar('Veränderungen', { back: function () { go({ view: 'saved' }); } }));
    if (!s) { main.append(h('div', { class: 'sc-card sc-state' }, [h('h3', { text: 'Screen nicht gefunden' }), h('p', { text: 'Dieser Screen ist auf diesem Gerät nicht gespeichert.' })])); return; }
    // aktuellen Lauf sicherstellen
    var d = ds(), cur = adapter.screenSync(s.query);
    store.recordRun(s.id, { asOf: info().asOf, count: cur.total, symbols: cur.order.map(function (i) { return d.symbol(i); }) });
    s = store.get(s.id);
    var runs = s.runs, a = runs[0], b = runs[runs.length - 1];
    main.append(h('div', { style: { padding: '14px 0 6px' } }, [h('p', { class: 'sc-eyebrow', text: 'Gespeicherter Screen' }), h('h2', { style: { fontSize: '26px', letterSpacing: '-.02em', margin: '4px 0 2px' }, text: s.name }), h('p', { class: 'sc-note', style: { margin: 0 }, text: screenLabel(s.query) })]));
    main.append(h('div', { class: 'sc-card', style: { padding: '16px', margin: '12px 0' } }, [h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } }, [h('strong', { class: 'sc-num', style: { fontSize: '36px', letterSpacing: '-.03em' }, text: nf(b.count) }), h('span', { class: 'sc-muted', text: 'Aktien · Datenstand ' + dateDe(b.asOf) })]),
      h('button', { class: 'sc-btn sc-btn-secondary sc-btn-sm', type: 'button', style: { marginTop: '10px' }, onclick: function () { openParams(Q.toParams(s.query).toString(), s.id); } }, 'Treffer öffnen')]));
    if (runs.length < 2) {
      main.append(h('div', { class: 'sc-card sc-state' }, [h('h3', { text: 'Noch kein Vergleich möglich' }), h('p', { text: 'Erster Lauf am ' + dateDe(a.asOf) + ' mit ' + nf(a.count) + ' Aktien. Sobald ein neuer Datenstand vorliegt, siehst du hier neue, entfernte und unveränderte Aktien.' })]));
    } else {
      var dd = E.diff(a.symbols, b.symbols);
      main.append(h('p', { class: 'sc-note', text: 'Seit dem letzten Lauf: Datenstand ' + dateDe(a.asOf) + ' → ' + dateDe(b.asOf) + (a.truncated || b.truncated ? ' (Vergleich auf die ersten 2.000 Treffer begrenzt)' : '') }));
      main.append(h('div', { class: 'sc-kpirow' }, [h('div', {}, [h('b', { class: 'sc-up sc-num', text: '+' + dd.added.length }), h('span', { text: 'neu' })]), h('div', {}, [h('b', { class: 'sc-down sc-num', text: '−' + dd.removed.length }), h('span', { text: 'entfernt' })]), h('div', {}, [h('b', { class: 'sc-num', text: nf(dd.unchanged.length) }), h('span', { text: 'unverändert' })])]));
      changeList(main, 'Neue Aktien', dd.added, false, s);
      changeList(main, 'Entfernte Aktien', dd.removed, true, s);
      var det = h('details', { class: 'sc-section' }, [h('summary', { style: { cursor: 'pointer', minHeight: '44px', fontWeight: 650 } }, 'Unveränderte Aktien (' + nf(dd.unchanged.length) + ')')]);
      var ul = h('div', { class: 'sc-card sc-compact' }); dd.unchanged.slice(0, 200).forEach(function (sym) { ul.append(symRow(sym)); }); det.append(ul);
      main.append(det);
    }
    main.append(notifyCard(s));
  }
  function changeList(main, title, syms, removed, s) {
    var sec = h('section', { class: 'sc-section' }, h('div', { class: 'sc-section-head' }, h('h2', { text: title + ' (' + syms.length + ')' })));
    if (!syms.length) { sec.append(h('p', { class: 'sc-note', text: 'Keine.' })); main.append(sec); return; }
    var box = h('div', { class: 'sc-card sc-compact' });
    syms.slice(0, 100).forEach(function (sym) {
      var note = null;
      if (removed) {
        var i = ds().indexOf(sym);
        if (i < 0) note = 'nicht mehr im Universum';
        else { var fails = [].concat.apply([], E.why(ds(), s.query, i).map(function (g) { return g.items; })).filter(function (x) { return x.pass !== true; }); note = fails.length ? 'erfüllt nicht mehr: ' + fails.map(function (x) { return x.label; }).join(', ') : null; }
      }
      box.append(symRow(sym, note));
    });
    sec.append(box); main.append(sec);
  }
  function symRow(sym, note) {
    var d = ds(), i = d.indexOf(sym);
    var chg = i >= 0 ? d.value('perf1d', i) : null;
    return h('div', { class: 'sc-cr', role: 'button', tabindex: '0', onclick: function () { openQuick(sym); }, onkeydown: function (e) { if (e.key === 'Enter') this.click(); } }, [logo(sym),
      h('div', { class: 'sc-cr-main' }, [h('b', { text: i >= 0 ? d.name(i) : sym }), h('span', { text: sym + (note ? ' · ' + note : '') })]),
      h('div', { class: 'sc-cr-side sc-num' }, i >= 0 ? [h('b', { text: F.format('price', d.value('price', i)) }), h('span', { class: signCls(chg), text: F.format('perf1d', chg) })] : [])]);
  }
  function notifyCard(s) {
    var n = s.notify || {};
    var card = h('div', { class: 'sc-card', style: { padding: '4px 16px 14px' } });
    [['newMatches', 'Neue Aktien erfüllen den Screen'], ['removed', 'Aktien passen nicht mehr'], ['bigChanges', 'Größere Veränderungen', 'z. B. mehr als 10 % der Treffer ändern sich'], ['weekly', 'Wöchentliche Zusammenfassung']].forEach(function (x) {
      card.append(h('label', { class: 'sc-toggle' }, [h('span', {}, [x[1], x[2] ? h('small', { text: x[2] }) : null]), h('input', { type: 'checkbox', class: 'sc-switch', role: 'switch', checked: n[x[0]] ? true : null,
        onchange: function () { var p = {}; p[x[0]] = this.checked; store.setNotify(s.id, p); toast('Einstellung gespeichert'); } })]));
    });
    card.append(h('p', { class: 'sc-note', style: { margin: '12px 0 0' }, text: 'Die Zustellung von Benachrichtigungen wird aktiviert, sobald der Vision-Universe-Benachrichtigungsdienst bereitsteht. Deine Auswahl ist gespeichert; bis dahin zeigt diese Seite die Veränderungen bei jedem Öffnen.' }));
    return h('section', { class: 'sc-section' }, [h('div', { class: 'sc-section-head' }, h('h2', { text: 'Benachrichtige mich, wenn …' })), card]);
  }

  // ------------------------------------------------------------ COMPARE
  var CMP_ROWS = [['marketCap', 'Market Cap'], ['price', 'Kurs'], ['perf1d', '1 Tag'], ['pe', 'KGV (TTM)'], ['peFy', 'KGV (GJ)'], ['revenueGrowth', 'Umsatzwachstum'], ['grossMargin', 'Bruttomarge'], ['freeCashFlow', 'Free Cashflow'], ['fcfMargin', 'FCF-Marge'],
    ['eps', 'EPS TTM (verw.)'], ['epsFy', 'EPS GJ (verw.)'], ['roic', 'ROIC'], ['distance52wHigh', '52W-Hoch Abstand'], ['perf6m', 'Performance 6M'], ['qualityFactor', 'Faktor Qualität'], ['momentumFactor', 'Faktor Momentum'], ['quantScore', 'Quant Score']];
  function viewCompare(main) {
    var d = ds();
    main.append(bar('Vergleich', { back: function () { history.length > 1 ? history.back() : go({ view: 'results' }); } }));
    var syms = state.cmp.filter(function (s) { return d.indexOf(s) >= 0; });
    var max = mqDesk.matches ? 4 : 3;
    if (!syms.length) {
      main.append(h('div', { class: 'sc-card sc-state', style: { marginTop: '16px' } }, [h('h3', { text: 'Aktien vergleichen' }), h('p', { text: 'Wähle in den Treffern „Vergleichen“ und markiere 2–3 Aktien – oder füge hier eine Aktie hinzu.' }), h('button', { class: 'sc-btn sc-btn-primary', type: 'button', onclick: function () { openStockSearch(function (sym) { go({ cmp: [sym] }, { replace: true }); }); } }, [icon('plus'), 'Aktie hinzufügen'])]));
      return;
    }
    var head = h('tr', {}, [h('th', {}, '')].concat(syms.map(function (sym) {
      var i = d.indexOf(sym), chg = d.value('perf1d', i);
      return h('th', { scope: 'col' }, h('div', { class: 'sc-cmp-head' }, [iconBtn('x', sym + ' entfernen', function () { go({ cmp: state.cmp.filter(function (x) { return x !== sym; }) }, { replace: true }); }), logo(sym), h('b', { text: sym }), h('span', { text: d.name(i) })]));
    })));
    var body = h('tbody', {}, CMP_ROWS.map(function (row) {
      var f = F.field(row[0]);
      if (!f.available) return h('tr', {}, [h('td', {}, [row[1], h('div', { style: { fontSize: '10.5px' }, text: 'noch nicht freigegeben' })])].concat(syms.map(function () { return h('td', { class: 'sc-muted', text: '–' }); })));
      var vals = syms.map(function (s) { return d.value(row[0], d.indexOf(s)); });
      var best = null;
      if (f.better && syms.length > 1) { var cand = vals.filter(function (v) { return v !== null && (f.id !== 'pe' || v > 0); }); if (cand.length > 1) best = f.better > 0 ? Math.max.apply(null, cand) : Math.min.apply(null, cand); }
      return h('tr', {}, [h('td', { text: row[1] })].concat(vals.map(function (v) { return h('td', { class: 'sc-num ' + (v !== null && v === best ? 'sc-best' : row[0] === 'perf1d' || row[0] === 'perf6m' ? signCls(v) : ''), text: F.format(f, v) }); })));
    }));
    main.append(h('div', { class: 'sc-cmp', style: { marginTop: '12px' } }, h('table', {}, [h('thead', {}, head), body])));
    main.append(h('p', { class: 'sc-note', text: 'Grün markiert den jeweils günstigeren Wert, wo eine Richtung eindeutig ist. Keine Gesamtwertung.' }));
    if (syms.length < max) main.append(h('button', { class: 'sc-btn sc-btn-secondary sc-btn-block', type: 'button', style: { marginTop: '8px' }, onclick: function () { openStockSearch(function (sym) { if (state.cmp.indexOf(sym) < 0) go({ cmp: state.cmp.concat([sym]) }, { replace: true }); else closeTop(); }); } }, [icon('plus'), 'Weitere Aktie hinzufügen']));
    main.append(h('div', { class: 'sc-list', style: { marginTop: '16px' } }, syms.map(function (sym) { return h('button', { class: 'sc-row', type: 'button', onclick: function () { openQuick(sym); } }, [logo(sym), h('div', { class: 'sc-row-main' }, [h('b', { text: 'Quick Research: ' + sym }), h('span', { text: d.name(d.indexOf(sym)) })]), icon('next')]); })));
  }
  function openStockSearch(onPick) {
    var d = ds(), s = openSheet({ title: 'Aktie suchen', full: true, focus: 'input' });
    var input = h('input', { type: 'search', placeholder: 'Name oder Kürzel', 'aria-label': 'Aktie suchen', autocomplete: 'off' });
    var list = h('div', { class: 'sc-card sc-compact' });
    s.body.append(h('div', { class: 'sc-search' }, h('label', {}, [icon('search'), input])), list);
    function paint() {
      var t = input.value.trim().toUpperCase(), out = [];
      if (t) for (var i = 0; i < d.size && out.length < 40; i++) { var sy = d.symbol(i), nm = String(d.name(i)).toUpperCase(); if (sy.indexOf(t) === 0 || nm.indexOf(t) >= 0) out.push(i); }
      out.sort(function (a, b) { return (d.symbol(a) === t ? -1 : 0) - (d.symbol(b) === t ? -1 : 0) || (d.cols.mcap[b] || 0) - (d.cols.mcap[a] || 0); });
      list.replaceChildren.apply(list, out.length ? out.map(function (i) { var sy = d.symbol(i); return h('div', { class: 'sc-cr', role: 'button', tabindex: '0', onclick: function () { onPick(sy); }, onkeydown: function (e) { if (e.key === 'Enter') onPick(sy); } }, [logo(sy), h('div', { class: 'sc-cr-main' }, [h('b', { text: d.name(i) }), h('span', { text: sy })]), h('div', { class: 'sc-cr-side sc-num' }, h('b', { text: F.format('marketCap', d.value('marketCap', i)) }))]); })
        : [h('p', { class: 'sc-note', style: { padding: '14px' }, text: t ? 'Keine Aktie gefunden.' : 'Tippe einen Namen oder ein Kürzel.' })]);
    }
    input.addEventListener('input', debounce(paint, 60)); paint();
  }

  // ------------------------------------------------------------ WATCHLIST
  function viewWatchlist(main) {
    var d = ds(), syms = store.watchlist();
    main.append(bar('Watchlist'));
    main.append(h('p', { class: 'sc-note', style: { margin: '12px 0' }, text: 'Deine Vision-Universe-Watchlist – dieselbe Liste wie in Discover.' }));
    if (!syms.length) { main.append(h('div', { class: 'sc-card sc-state' }, [h('h3', { text: 'Noch keine Aktien gemerkt' }), h('p', { text: 'Tippe in den Treffern auf das Lesezeichen, um Aktien zu merken.' })])); return; }
    var box = h('div', { class: 'sc-card sc-compact' });
    syms.forEach(function (sym) { box.append(symRow(sym, d.indexOf(sym) < 0 ? 'nicht im Screener-Universum' : Q.count(state.query) ? (result().order.indexOf(d.indexOf(sym)) >= 0 ? 'erfüllt deinen Screen' : 'erfüllt deinen Screen nicht') : null)); });
    main.append(box, h('a', { class: 'sc-link', href: '/discover/#/watchlist' }, 'Watchlist in Discover öffnen'));
  }

  // ------------------------------------------------------------ Start
  function boot() {
    state.error = null; state.loaded = false; readURL(); render();
    adapter.load().then(function () { state.loaded = true; readURL(); history.replaceState({ sc: 1 }, '', location.href); render(); })
      .catch(function (e) { state.loaded = true; state.error = String(e && e.message || e); render(); });
  }
  boot();
})();
