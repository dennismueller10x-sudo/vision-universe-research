/* =========================================================================
   VISION UNIVERSE — insights/news.js        News (Insights) nach Prototyp „App-Konzept 2“ (#news)

   Die Seiten unter /insights/ baut products/insights/build.mjs statisch; sie sind ohne dieses Skript lesbar.
   Das Skript ergänzt nur, was vom Leser oder vom Tag abhängt:
   - Tagesbewegung je Aktie ([data-in-chg]): Änderung zwischen den beiden letzten veröffentlichten Schlüssen derselben
     Tagesreihe (quant/engines/published-close.js#dayChange, ADR-002; Adresse über core/identity.js, ADR-001).
     Ohne Reihe bleibt die Pille leer – nichts wird geraten.
   - „heute“ / „gestern“ statt Datum in der Pille des Titelbilds.
   - Reiter im Inhalt der Startseite: springen zum Abschnitt und markieren den sichtbaren.
   - „Zu deinen Aktien“: Artikel zu Aktien der Watchlist (lokale Discover-Liste und, angemeldet, die Konto-Watchlist über
     assets/watchlist-button.js#couple). Ohne Treffer bleibt der Abschnitt verborgen.
   - Lesefortschritt im Aktienmagazin und in Reports (nur in diesem Browser, localStorage): die Leseseite merkt sich die
     weiteste gesehene Seite, die Kachel auf der Startseite zeigt „Seite x von y“ und „Weiterlesen“.
   - Erklärvideos im Fenster; „Daten & Hinweise“ öffnet das Fenster des Kopfes.
   Kein Modell, kein Urteil, keine Empfehlung.
   ========================================================================= */
(function () {
  'use strict';
  var doc = document, root = window;
  var LESEN = 'vu-insights-lesen-v1', WATCH = 'vu-discover-watchlist-v1';
  var $$ = function (sel, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(sel)); };
  function store(key, val) {
    try { if (val === undefined) return JSON.parse(root.localStorage.getItem(key) || 'null'); root.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; }
    return val;
  }
  function script(src) {
    return new Promise(function (ok) { var s = doc.createElement('script'); s.src = src; s.async = true; s.onload = function () { ok(true); }; s.onerror = function () { ok(false); }; doc.head.appendChild(s); });
  }
  function isoDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---------------------------------------------------------- Tagesbewegung */
  function chgHtml(v, date) {
    var num = Math.abs(v * 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var dir = v > 0 ? '' : v < 0 ? ' vu-chg--down' : ' vu-chg--flat', arrow = v > 0 ? '▲' : v < 0 ? '▼' : '◆', sign = v > 0 ? '+' : v < 0 ? '−' : '';
    var when = date ? ' am ' + date.split('-').reverse().join('.') : '';
    return '<span role="img" class="vu-chg' + dir + '" aria-label="' + (v > 0 ? 'Plus ' : v < 0 ? 'Minus ' : 'Unverändert ') + num + ' Prozent' + when + '"><span aria-hidden="true">' + arrow + '</span> ' + sign + num + '&nbsp;%</span>';
  }
  var seriesCache = {};
  function moves() {
    var slots = $$('[data-in-chg]');
    if (!slots.length) return;
    var need = [root.VUCore && root.VUCore.Identity ? null : script('/core/identity.js'), root.VUPublishedClose ? null : script('/quant/engines/published-close.js')];
    Promise.all(need).then(function () {
      var Id = root.VUCore && root.VUCore.Identity, PC = root.VUPublishedClose;
      if (!Id || !PC) return;
      var today = isoDay(new Date());
      var tickers = slots.map(function (s) { return s.getAttribute('data-in-chg'); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
      tickers.forEach(function (t) {
        var sid = null;
        try { sid = Id.securityIdForTicker(t); } catch (e) { sid = null; }
        if (!sid) return;
        var p = seriesCache[t] || (seriesCache[t] = fetch('/quant/data/market/discover-series/' + sid + '.json', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
        p.then(function (series) {
          var d = series ? PC.dayChange(series, today) : null;
          if (!d || typeof d.change !== 'number') return;
          $$('[data-in-chg="' + t + '"]').forEach(function (s) { s.innerHTML = chgHtml(d.change, d.date); }); /* nur Zahlen und feste Zeichen */
        });
      });
    });
  }

  /* ---------------------------------------------------------- heute / gestern */
  function relativeDays() {
    var now = new Date(), today = isoDay(now), y = new Date(now.getTime() - 864e5), yesterday = isoDay(y);
    $$('time[data-in-tag]').forEach(function (t) {
      var d = t.getAttribute('datetime');
      if (d === today) t.textContent = 'heute'; else if (d === yesterday) t.textContent = 'gestern';
    });
  }

  /* ---------------------------------------------------------- Reiter im Inhalt (Startseite) */
  function tabs() {
    var nav = doc.querySelector('.in-tabs'), links = nav ? $$('[data-in-tab]', nav) : [];
    if (!links.length) return;
    function mark(id) {
      links.forEach(function (a) { var on = a.getAttribute('data-in-tab') === id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    }
    var lock = 0;
    nav.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-in-tab]');
      if (!a) return;
      var id = a.getAttribute('data-in-tab'), target = doc.getElementById(id);
      if (!target) return;
      e.preventDefault();
      mark(id); lock = Date.now() + 900;
      var off = nav.getBoundingClientRect().height + (parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--vu-navigation-height')) || 56);
      var top = id === 'heute' ? Math.max(0, target.getBoundingClientRect().top + root.scrollY - off - 4) : target.getBoundingClientRect().top + root.scrollY - off;
      var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      try { history.replaceState(null, '', '#' + id); } catch (err) { /* nur Komfort */ }
    });
    var ids = links.map(function (a) { return a.getAttribute('data-in-tab'); });
    function spy() {
      if (Date.now() < lock) return;
      var line = (parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--vu-navigation-height')) || 56) + nav.getBoundingClientRect().height + 40, cur = ids[0];
      /* „Weitere Artikel“ gehört zum Reiter „Heute“ (dieselben Artikelzeilen, älter) */
      ids.concat(['weitere']).forEach(function (id) { var el = doc.getElementById(id); if (el && !el.hidden && el.getBoundingClientRect().top <= line) cur = id === 'weitere' ? 'heute' : id; });
      mark(cur);
    }
    root.addEventListener('scroll', function () { root.requestAnimationFrame(spy); }, { passive: true });
  }

  /* ---------------------------------------------------------- Zu deinen Aktien */
  function localList() { var a = store(WATCH); return Array.isArray(a) ? a.filter(function (s) { return /^[A-Z0-9.\-]{1,24}$/.test(s); }).slice(0, 100) : []; }
  function yours() {
    var box = doc.querySelector('[data-in-deine]'), sec = doc.getElementById('deine');
    if (!box || !sec) return;
    var local = {
      has: function (t) { return localList().indexOf(t) >= 0; },
      toggle: function (t) { var l = localList(), i = l.indexOf(t); if (i < 0) l.unshift(t); else l.splice(i, 1); store(WATCH, l); return i < 0; }
    };
    function paint() {
      var seen = {}, rows = [];
      var tpl = doc.getElementById('in-held-zeile'), pool = (tpl && tpl.content ? $$('.in-art', tpl.content) : []).concat($$('#heute .in-art, #weitere .in-art'));
      pool.forEach(function (r) {
        var href = (r.querySelector('.in-art-a') || {}).getAttribute ? r.querySelector('.in-art-a').getAttribute('href') : null;
        if (!href || seen[href] || rows.length >= 4) return;
        var hit = (r.getAttribute('data-in-tk') || '').split(' ').some(function (t) { return t && local.has(t); });
        if (hit) { seen[href] = true; rows.push(r.cloneNode(true)); }
      });
      box.replaceChildren.apply(box, rows);
      sec.hidden = !rows.length;
    }
    paint();
    root.addEventListener('vu-watchlist-ready', paint);
    root.addEventListener('vu-watchlist-change', paint);
    /* Konto-Watchlist: nur mit Konten; ohne Anmeldung kostet das eine kleine Anfrage (/konto/config.js). */
    (root.VUWatchButton ? Promise.resolve(true) : script('/assets/watchlist-button.js')).then(function () {
      if (root.VUWatchButton && root.VUWatchButton.couple) root.VUWatchButton.couple(local);
    });
  }

  /* ---------------------------------------------------------- Lesefortschritt */
  function readingTrack() {
    var pages = $$('.in-heft-seiten img[id^="s"]');
    if (!pages.length || typeof IntersectionObserver !== 'function') return;
    var key = location.pathname;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var n = parseInt(e.target.id.slice(1), 10), all = store(LESEN) || {};
        if (n > (all[key] || 0)) { all[key] = n; store(LESEN, all); }
      });
    }, { threshold: 0.6 });
    pages.forEach(function (p) { io.observe(p); });
  }
  function readingShow() {
    var all = store(LESEN) || {};
    $$('[data-in-lesen]').forEach(function (a) {
      var key = a.getAttribute('data-in-lesen'), total = parseInt(a.getAttribute('data-in-seiten'), 10), n = all[key];
      if (!n || !total || n < 2) return;
      n = Math.min(n, total);
      var bar = a.querySelector('.in-bar'), txt = a.querySelector('.in-heft-seite'), btn = a.querySelector('.in-btn');
      if (bar) { bar.querySelector('i').style.width = Math.round(n / total * 100) + '%'; bar.hidden = false; bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'Gelesen bis Seite ' + n + ' von ' + total); }
      if (txt) { txt.textContent = 'Seite ' + n + ' von ' + total; txt.hidden = false; }
      if (n < total && btn) { btn.textContent = 'Weiterlesen'; a.href = key + '#s' + String(n).padStart(2, '0'); }
    });
  }

  /* ---------------------------------------------------------- Videos */
  function videos() {
    doc.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-in-vid]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      var dlg = doc.createElement('dialog');
      if (typeof dlg.showModal !== 'function') return;
      e.preventDefault();
      dlg.className = 'in-player';
      dlg.setAttribute('aria-label', a.getAttribute('data-in-titel') || 'Video');
      var head = doc.createElement('div'), title = doc.createElement('span'), close = doc.createElement('button'), v = doc.createElement('video');
      head.className = 'in-player-kopf';
      title.textContent = a.getAttribute('data-in-titel') || '';
      close.type = 'button'; close.setAttribute('aria-label', 'Schließen'); close.textContent = '×';
      v.src = a.getAttribute('data-in-vid'); v.poster = a.getAttribute('data-in-poster') || ''; v.controls = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
      head.append(title, close); dlg.append(head, v); doc.body.appendChild(dlg);
      close.addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
      dlg.addEventListener('close', function () { v.pause(); dlg.remove(); a.focus(); });
      dlg.showModal();
    });
  }

  /* ---------------------------------------------------------- Daten & Hinweise */
  function notes() {
    $$('[data-in-hinweise]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var N = root.VUNavigation;
        if (!N || typeof N.openHinweise !== 'function') return;
        e.preventDefault(); N.openHinweise();
      });
    });
  }

  function start() { relativeDays(); tabs(); notes(); videos(); readingShow(); readingTrack(); yours(); moves(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
