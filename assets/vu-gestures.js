/* App-only navigation and C16 sheets. No data/model dependencies. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.VUGestures = api;
  if (root.document) api.init();
})(typeof globalThis !== 'undefined' ? globalThis : this, function (w) {
  'use strict';
  function edgeStart(x, primary, button) { return primary !== false && (!button) && x >= 0 && x <= 20; }
  function intent(dx, dy) { return Math.abs(dx) < 8 && Math.abs(dy) < 8 ? 'pending' : dx > 0 && dx > Math.abs(dy) * 1.2 ? 'back' : 'cancel'; }
  function release(dx, width, cancelled) { return !cancelled && width > 0 && dx >= width * 0.35; }
  function sheetTarget(y, height, full, cancelled) {
    if (cancelled) return full ? 'full' : 'half';
    if (y > height * 0.22) return 'close';
    if (y < -height * 0.12) return 'full';
    return full ? 'full' : 'half';
  }
  function duration(reduced) { return reduced ? 0 : 240; }
  var active = null, ready = false, parentOrigin = null, baseLength = 1, api;
  var PARENTS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
  // iOS-App ab K1 fuehrt das Randwischen nativ (VUBridgeViewController); dann kein zweites JS-Randwischen.
  function nativeEdge(ua) { return /VUEdge\/1/.test(ua || ''); }
  /** Navigationszustand fuer die native Geste. Schluessel aus der Navigation API (WebKit 26+), sonst die Adresse. */
  function navState(nav, loc, sheetOpen, home) {
    var entry = nav && nav.currentEntry, list = entry && nav.entries ? nav.entries() : [], i = entry ? entry.index : -1;
    var key = entry ? entry.key : (loc ? loc.href : null);
    return {type: 'vu:nav-state', back: !!sheetOpen || !home || !!(nav && nav.canGoBack), forward: !sheetOpen && !!(nav && nav.canGoForward),
      key: sheetOpen ? key + '#sheet' : key, backKey: sheetOpen ? key : (i > 0 && list[i - 1] ? list[i - 1].key : null),
      forwardKey: !sheetOpen && i >= 0 && list[i + 1] ? list[i + 1].key : null};
  }
  /** K5: horizontaler Wisch auf dem Inhalt wechselt zum Nachbar-Tab. Nur deutliche, schnelle, waagrechte Wische. */
  function swipeTab(dx, dy, ms) {
    if (ms > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2.2) return 0;
    return dx < 0 ? 1 : -1;   // nach links wischen = naechster Tab
  }
  function neighbour(items, current, step) {
    var i = items.indexOf(current), j = i + step;
    return i < 0 || j < 0 || j >= items.length ? null : items[j];
  }
  function enabled() {
    return !!(w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform()) || /VUApp\/1/.test(w.navigator.userAgent) || new URLSearchParams(w.location.search).get('vuGestures') === '1';
  }
  function isHome() { return /^\/(discover|quant|technical|supertrader)\/$/.test(w.location.pathname) && (!w.location.hash || /^#\/?$/.test(w.location.hash)); }
  // Navigation API (WebKit 26+, Chromium): der Iframe kennt seine eigenen Eintraege; zurueck ist dann immer echter Verlauf,
  // auch ueber Produktgrenzen (Start -> Quant -> Aktie). Der erste Eintrag des Rahmens ist die Grenze (kein about:blank).
  function canBack() { var nav = w.navigation; return nav && typeof nav.canGoBack === 'boolean' ? nav.canGoBack : null; }
  function back() {
    if (active) { closeSheet(active.el); return true; }
    var can = canBack();
    if (can === true) { w.history.back(); return true; }
    if (isHome()) return false;
    if (can === null && w.history.length > baseLength) w.history.back();
    else w.location.href = '/' + w.location.pathname.split('/')[1] + '/' + (new URLSearchParams(w.location.search).get('vuGestures') === '1' ? '?vuGestures=1' : '');
    return true;
  }
  function openSheet(el) {
    if (!ready || !el || active && active.el === el) return;
    if (active) closeSheet(active.el);
    var panel = el.querySelector('.vu-sheet-ui');
    if (!panel) return;
    var focus = w.document.activeElement, overflow = w.document.body.style.overflow;
    var header = w.document.createElement('div'); header.className = 'vu-gesture-head';
    var backBtn = w.document.createElement('button'); backBtn.type = 'button'; backBtn.textContent = '‹ Zurück';
    var expand = w.document.createElement('button'); expand.type = 'button'; expand.textContent = 'Vollbild'; expand.setAttribute('aria-expanded', 'false');
    header.append(backBtn, expand); panel.prepend(header);
    el.classList.add('vu-gesture-sheet'); el.hidden = false;
    w.document.body.style.overflow = 'hidden';
    var state = {el: el, panel: panel, header: header, focus: focus, overflow: overflow, full: false, inert: []}; active = state;
    // Modal siblings are inert, also when an existing C16 sheet lives inside a product host.
    for (var node = el; node.parentElement; node = node.parentElement) {
      Array.from(node.parentElement.children).forEach(function (sibling) { if (sibling !== node) { state.inert.push([sibling, sibling.inert]); sibling.inert = true; } });
      if (node.parentElement === w.document.body) break;
    }
    function full(value) { state.full = value; el.classList.toggle('vu-gesture-full', value); expand.setAttribute('aria-expanded', String(value)); expand.textContent = value ? 'Verkleinern' : 'Vollbild'; }
    backBtn.onclick = function () { closeSheet(el); };
    expand.onclick = function () { full(!state.full); };
    var drag = null;
    header.addEventListener('pointerdown', function (e) { if (!e.isPrimary || e.button) return; drag = {id: e.pointerId, y: e.clientY, delta: 0}; e.target.setPointerCapture(e.pointerId); });
    header.addEventListener('pointermove', function (e) { if (!drag || e.pointerId !== drag.id) return; drag.delta = e.clientY - drag.y; panel.style.transition = 'none'; panel.style.transform = 'translateY(' + Math.max(state.full ? 0 : -w.innerHeight * 0.3, drag.delta) + 'px)'; });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var target = sheetTarget(drag.delta, w.innerHeight, state.full, e.type !== 'pointerup');
      drag = null; panel.style.transition = ''; panel.style.transform = '';
      if (target === 'close') closeSheet(el); else full(target === 'full');
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) { header.addEventListener(name, end); });
    state.key = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeSheet(el); }
      if (e.key === 'Tab') {
        var nodes = Array.from(panel.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')).filter(function (n) { return n.getClientRects().length && !n.disabled; });
        var first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && w.document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && w.document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    w.document.addEventListener('keydown', state.key, true);
    state.click = function (e) { if (e.target === el) closeSheet(el); };
    el.addEventListener('click', state.click);
    backBtn.focus();
    api.report();
    if (!w.matchMedia('(prefers-reduced-motion: reduce)').matches) panel.animate([{transform: 'translateY(100%)'}, {transform: 'translateY(0)'}], {duration: duration(false), easing: 'ease-out'});
  }
  function closeSheet(el) {
    if (!active || active.el !== el) return;
    var s = active; active = null;
    el.hidden = true; el.classList.remove('vu-gesture-sheet', 'vu-gesture-full'); s.panel.style.transform = ''; s.panel.style.transition = '';
    s.header.remove(); w.document.removeEventListener('keydown', s.key, true); el.removeEventListener('click', s.click);
    w.document.body.style.overflow = s.overflow;
    s.inert.forEach(function (entry) { entry[0].inert = entry[1]; });
    if (s.restore) s.restore();
    if (s.focus && s.focus.isConnected) s.focus.focus();
    api.report();
  }
  function init() {
    if (ready || !enabled()) return;
    if (!w.document.body) { w.document.addEventListener('DOMContentLoaded', init, {once: true}); return; }
    // Per-product floor prevents navigating an iframe back into about:blank. No token is stored.
    try {
      var key = 'vu-gesture-floor:' + w.location.pathname.split('/')[1];
      baseLength = Number(w.sessionStorage.getItem(key)) || w.history.length;
      w.sessionStorage.setItem(key, String(baseLength));
    } catch (_) { baseLength = w.history.length; }
    ready = true; w.document.documentElement.setAttribute('data-vu-gestures', '');
    if (new URLSearchParams(w.location.search).get('vuSheet') === '1') {
      w.document.documentElement.setAttribute('data-vu-gesture-document', ''); return;
    }
    var native = nativeEdge(w.navigator.userAgent), body = w.document.body;
    var edge = w.document.createElement('div'); edge.className = 'vu-gesture-edge'; edge.setAttribute('aria-hidden', 'true'); if (!native) body.append(edge);
    var drag = null, timer = null;
    function reset() { drag = null; clearTimeout(timer); body.style.transform = ''; body.style.transition = ''; body.classList.remove('vu-gesture-drag'); }
    edge.addEventListener('pointerdown', function (e) {
      if (!edgeStart(e.clientX, e.isPrimary, e.button) || isHome() || active || w.history.length < 2) return;
      reset(); drag = {id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, mode: 'pending'}; edge.setPointerCapture(e.pointerId);
    });
    edge.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      drag.dx = Math.max(0, Math.min(w.innerWidth, e.clientX - drag.x));
      if (drag.mode === 'pending') drag.mode = intent(e.clientX - drag.x, e.clientY - drag.y);
      if (drag.mode !== 'back') return;
      body.classList.add('vu-gesture-drag'); body.style.transition = 'none'; body.style.transform = 'translateX(' + drag.dx + 'px)';
    });
    function end(e) {
      if (!drag || drag.id !== e.pointerId) return;
      var go = drag.mode === 'back' && release(drag.dx, w.innerWidth, e.type !== 'pointerup'); drag = null;
      var ms = duration(w.matchMedia('(prefers-reduced-motion: reduce)').matches);
      body.style.transition = 'transform ' + ms + 'ms cubic-bezier(.2,.8,.2,1)'; body.style.transform = go ? 'translateX(' + w.innerWidth + 'px)' : 'translateX(0)';
      timer = w.setTimeout(function () { reset(); if (go) back(); }, ms);
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { edge.addEventListener(n, end); });
    w.addEventListener('blur', reset); w.addEventListener('resize', reset);
    w.document.addEventListener('pointerdown', function (e) { if (!e.isPrimary) reset(); });
    w.addEventListener('pagehide', reset); w.addEventListener('pageshow', reset);
    w.addEventListener('hashchange', function () { reset(); if (active) closeSheet(active.el); });
    // Keep the actual details node (and its listeners/lazy contents), never clone data.
    w.document.addEventListener('click', function (e) {
      var summary = e.target.closest && e.target.closest('summary');
      var stock = /\/quant\//.test(w.location.pathname) && /#\/aktie\//.test(w.location.hash) || w.document.body.dataset.page === 'stock';
      var link = e.target.closest && e.target.closest('a[href]');
      if (stock && link && !active && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !link.target && !link.hasAttribute('download')) {
        var url = new URL(link.href, w.location.href);
        if (url.origin === w.location.origin && (/^\/supertrader\/strategies\//.test(url.pathname) || url.pathname === '/quant/' && /^#\/methodik/.test(url.hash))) {
          e.preventDefault();
          var backdrop = w.document.createElement('div'), box = w.document.createElement('div'), frame = w.document.createElement('iframe');
          backdrop.className = 'vu-sheet-backdrop'; box.className = 'vu-sheet-ui';
          box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', link.textContent.trim());
          // Existing method pages keep their own renderer, listeners and data. Only their shell is hidden.
          url.searchParams.set('vuGestures', '1'); url.searchParams.set('vuSheet', '1');
          frame.title = link.textContent.trim(); frame.className = 'vu-gesture-document';
          box.append(frame); backdrop.append(box); body.append(backdrop);
          frame.contentWindow.location.replace(url.href); openSheet(backdrop);
          active.restore = function () { backdrop.remove(); }; return;
        }
      }
      if (!stock || !summary || active || e.target.closest('a,button,input')) return;
      var details = summary.parentElement;
      e.preventDefault(); details.open = true;
      var marker = w.document.createComment('vu-details'); details.before(marker);
      var el = w.document.createElement('div'), panel = w.document.createElement('div');
      el.className = 'vu-sheet-backdrop'; panel.className = 'vu-sheet-ui'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', summary.textContent.trim());
      panel.append(details); el.append(panel); body.append(el); openSheet(el);
      active.restore = function () { marker.replaceWith(details); details.open = false; el.remove(); };
    });
    // Zustand an die App-Shell melden: sofort bei jedem Seiten-/Routenwechsel, "settled" nach Ruhe (Vorschaubild).
    var settleTimer = null;
    function report(settled) {
      if (w.parent === w) return;
      var origins = w.location.ancestorOrigins, origin = parentOrigin || (origins && origins.length ? origins[0] : null);
      if (PARENTS.indexOf(origin) < 0) return;
      var msg = navState(w.navigation, w.location, !!active, isHome()); msg.settled = !!settled;
      try { w.parent.postMessage(msg, origin); } catch (_) { /* Shell nicht erreichbar */ }
    }
    function changed() { report(false); clearTimeout(settleTimer); settleTimer = w.setTimeout(function () { report(true); }, 450); }
    ['hashchange', 'popstate', 'pageshow'].forEach(function (n) { w.addEventListener(n, changed); });
    w.addEventListener('scroll', function () { clearTimeout(settleTimer); settleTimer = w.setTimeout(function () { report(true); }, 250); }, {passive: true});
    if (w.navigation && w.navigation.addEventListener) w.navigation.addEventListener('currententrychange', changed);
    api.report = changed;
    // Haptik: Wechsel ueber Leiste oder Untertabs fuehlt sich an wie ein nativer Tab (nur App, Shell entscheidet).
    w.document.addEventListener('click', function (e) {
      // composedPath: die Leiste rendert in einem Shadow Root.
      var path = e.composedPath ? e.composedPath() : [e.target], control = false, bar = false;
      path.forEach(function (n) { if (!n || !n.tagName) return; if (/^(A|BUTTON)$/.test(n.tagName) || n.getAttribute('role') === 'tab') control = true; if (n.id === 'vu-dock' || n.tagName === 'VU-NAVIGATION' || n.getAttribute('role') === 'tablist') bar = true; });
      if (!control || !bar || w.parent === w) return;
      var origins = w.location.ancestorOrigins, origin = parentOrigin || (origins && origins.length ? origins[0] : null);
      if (PARENTS.indexOf(origin) >= 0) try { w.parent.postMessage({type: 'vu:haptic', style: 'selection'}, origin); } catch (_) { /* optional */ }
    }, true);
    // Langes Druecken auf Bedienelemente: kurzer Impuls wie in nativen Apps (Kontextmenue/Vorschau bleiben iOS ueberlassen).
    w.document.addEventListener('contextmenu', function (e) {
      if (w.parent === w || !(e.target.closest && e.target.closest('a,button,[role=tab],summary'))) return;
      var origins = w.location.ancestorOrigins, origin = parentOrigin || (origins && origins.length ? origins[0] : null);
      if (PARENTS.indexOf(origin) >= 0) try { w.parent.postMessage({type: 'vu:haptic', style: 'impact'}, origin); } catch (_) { /* optional */ }
    }, true);
    // K5: zwischen Untertabs wischen. Zuerst ein ARIA-Tabsatz um den Startpunkt, sonst die Produkt-Leiste.
    // Nie auf Karussells, Charts, Eingaben, Sheets oder Elementen mit data-vu-no-swipe; vertikales Scrollen bleibt frei.
    var swipe = null, swipePrev = false;
    function blocked(el) {
      for (var n = el; n && n !== w.document.body; n = n.parentElement) {
        if (n.matches && n.matches('svg,canvas,input,textarea,select,[contenteditable=true],[data-vu-no-swipe],.vu-sheet-ui,[role=slider]')) return true;
        if (n.scrollWidth > n.clientWidth + 4) { var ox = w.getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; }
      }
      return false;
    }
    function tabTarget(start, step) {
      var panel = start.closest && start.closest('[role=tabpanel]');
      var list = panel && panel.id && w.document.querySelector('[role=tablist] [aria-controls="' + panel.id + '"]');
      list = list && list.closest('[role=tablist]');
      if (list) {
        var tabs = Array.from(list.querySelectorAll('[role=tab]'));
        return neighbour(tabs, list.querySelector('[role=tab][aria-selected=true]'), step);
      }
      var dock = w.document.getElementById('vu-dock'), root = dock && dock.shadowRoot;
      if (!root) return null;
      var links = Array.from(root.querySelectorAll('nav a[href]'));
      return neighbour(links, root.querySelector('nav a[aria-current=page]'), step);
    }
    w.document.addEventListener('pointerdown', function (e) {
      swipe = null;
      if (e.pointerType !== 'touch' || !e.isPrimary || active || e.clientX < 24 || e.clientX > w.innerWidth - 24 || blocked(e.target)) return;
      swipe = {x: e.clientX, y: e.clientY, t: Date.now(), el: e.target};
    }, {passive: true});
    w.document.addEventListener('pointercancel', function () { swipe = null; }, {passive: true});
    w.document.addEventListener('pointerup', function (e) {
      var s0 = swipe; swipe = null;
      if (!s0 || active) return;
      var step = swipeTab(e.clientX - s0.x, e.clientY - s0.y, Date.now() - s0.t);
      if (!step || (w.getSelection && String(w.getSelection()).length)) return;
      var target = tabTarget(s0.el, step);
      if (!target) return;
      swipePrev = step < 0;
      target.click();
    }, {passive: true});
    // Rueckwaerts gewischt: keine Vorwaerts-Gleitanimation (K2) zum vorherigen Tab.
    w.addEventListener('pageswap', function (e) { if (swipePrev && e.viewTransition) e.viewTransition.skipTransition(); swipePrev = false; });
    changed();
    w.addEventListener('message', function (e) {
      if (e.source !== w.parent || PARENTS.indexOf(e.origin) < 0) return;
      var type = e.data && e.data.type;
      if (type === 'vu:back') { parentOrigin = e.origin; w.parent.postMessage({type: 'vu:back-result', handled: back(), request: e.data.request}, parentOrigin); changed(); }
      if (type === 'vu:forward') { parentOrigin = e.origin; if (!active) w.history.forward(); }
      if (type === 'vu:nav-query') { parentOrigin = e.origin; report(false); }
    });
    var plugin = w.Capacitor && w.Capacitor.Plugins && w.Capacitor.Plugins.App;
    if (w.parent === w && plugin) plugin.addListener('backButton', function () { if (!back()) plugin.minimizeApp(); });
  }
  api = {edgeStart: edgeStart, intent: intent, release: release, sheetTarget: sheetTarget, duration: duration, init: init, openSheet: openSheet, closeSheet: closeSheet, back: back, nativeEdge: nativeEdge, navState: navState, swipeTab: swipeTab, neighbour: neighbour, report: function () {}};
  return api;
});
