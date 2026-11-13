/* Vision Universe · Website: Menü, Videospieler, neueste Insights-Artikel. Ohne Abhängigkeiten. */
(function () {
  'use strict';
  var d = document;

  /* Menü auf dem iPhone */
  var menu = d.getElementById('menu');
  d.querySelectorAll('[data-menu]').forEach(function (b) {
    b.addEventListener('click', function () {
      var open = b.getAttribute('data-menu') === 'open';
      menu.classList.toggle('open', open);
      d.body.style.overflow = open ? 'hidden' : '';
      d.querySelectorAll('[data-menu=open]').forEach(function (x) { x.setAttribute('aria-expanded', String(open)); });
      if (open) { var f = menu.querySelector('a,button'); if (f) f.focus(); }
    });
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu && menu.classList.contains('open')) d.querySelector('[data-menu=close]').click();
  });

  /* Videos: Klick öffnet den Spieler, das Video lädt erst dann */
  var dlg = d.getElementById('player');
  if (dlg) {
    var v = dlg.querySelector('video');
    d.querySelectorAll('[data-video]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        v.src = b.getAttribute('data-video');
        v.poster = b.getAttribute('data-poster') || '';
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      });
    });
    var stop = function () { v.pause(); v.removeAttribute('src'); v.load(); };
    dlg.addEventListener('close', stop);
    dlg.querySelector('button').addEventListener('click', function () { dlg.close ? dlg.close() : (dlg.removeAttribute('open'), stop()); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* Startseite: Kernmodul schaltet die sieben Blickwinkel durch (Klick wählt, Zeigen oder Fokus hält an). */
  var core = d.querySelector('[data-core]');
  if (core) {
    var panels = core.querySelectorAll('[data-core-panel]'), shots = core.querySelectorAll('[data-core-shot]'), tabs = core.querySelectorAll('[data-core-tab]');
    var MS = 3800, cur = 0, timer = null, seen = false, hold = false;
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var show = function (i) {
      cur = (i + panels.length) % panels.length;
      panels.forEach(function (p, k) { p.classList.toggle('on', k === cur); });
      shots.forEach(function (s, k) { if (k === cur) s.loading = 'eager'; s.classList.toggle('on', k === cur); });
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', String(k === cur)); });
    };
    var stop = function () { clearInterval(timer); timer = null; core.classList.remove('auto'); };
    var start = function () {
      if (calm || timer || !seen || hold) return;
      core.style.setProperty('--core-ms', MS + 'ms'); core.classList.add('auto');
      timer = setInterval(function () { show(cur + 1); }, MS);
    };
    tabs.forEach(function (t, k) { t.addEventListener('click', function () { stop(); show(k); start(); }); });
    ['mouseenter', 'focusin'].forEach(function (e) { core.addEventListener(e, function () { hold = true; stop(); }); });
    ['mouseleave', 'focusout'].forEach(function (e) { core.addEventListener(e, function () { hold = false; start(); }); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { seen = es[0].isIntersecting; if (seen) start(); else stop(); }, { threshold: .35 }).observe(core);
    } else { seen = true; start(); }
  }

  /* Insights live aus /insights/artikel.json (jeden Werktag neu): neuester Artikel, neuestes Heft, neuester Report.
     Was neu erscheint, steht dort an erster Stelle und rückt hier von selbst nach vorn. */
  var q = function (s) { return d.querySelector(s); };
  if (q('[data-live],[data-feed],[data-feed-lead],[data-mag-cover]')) {
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var date = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
    var safe = function (u) { return /^\/(insights|reports)\/[a-z0-9\-\/._]+$/i.test(u || '') ? u : ''; };
    var meta = function (a) { return '<div class="meta"><span class="tag">' + esc(a.rubrik) + '</span>' + date(a.datum) + '</div>'; };
    fetch('/insights/artikel.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (j) {
      var list = (j && j.artikel || []).filter(function (a) { return safe(a.href); });
      if (!list.length) throw 0;
      var top = list[0], heft = (j.magazin || [])[0], rep = (j.reports || [])[0];
      d.querySelectorAll('[data-live-stand]').forEach(function (e) { e.textContent = ' · Stand ' + date(top.datum); });

      var la = q('[data-live-artikel]');
      if (la) {
        la.href = top.href;
        la.innerHTML = (safe(top.bild) ? '<img src="' + esc(top.bild) + '" alt="" loading="lazy">' : '') + '<div class="b"><span class="slot">Neuester Artikel</span>' + meta(top).replace('class="meta"', 'class="meta" style="margin:0"') + '<h3>' + esc(top.titel) + '</h3></div>';
      }
      var ld = q('[data-live-davor]');
      if (ld && list.length > 1) {
        ld.hidden = false;
        ld.insertAdjacentHTML('beforeend', list.slice(1, 4).map(function (a) { return '<a href="' + esc(a.href) + '"><small>' + date(a.datum) + '</small>' + esc(a.titel) + '</a>'; }).join(''));
      }
      var lm = q('[data-live-magazin]');
      if (lm && heft && safe(heft.href)) {
        lm.href = heft.href;
        lm.innerHTML = (safe(heft.cover) ? '<img class="cov" src="' + esc(heft.cover) + '" alt="" loading="lazy">' : '') + '<div class="b"><span class="slot">Neuestes Aktienmagazin</span><div class="meta" style="margin:0">Nr. ' + esc(heft.nr) + (heft.kw ? ' · KW ' + esc(heft.kw) : '') + '</div><h3>' + esc(heft.titel) + '</h3><u>Online lesen →</u></div>';
      }
      var lr = q('[data-live-report]');
      if (lr && rep && safe(rep.href)) {
        lr.href = rep.href;
        lr.innerHTML = '<div class="b"><span class="slot">Neuester Aktienreport</span><div class="meta" style="margin:0">' + date(rep.datum) + '</div><h3>' + esc(rep.titel) + '</h3><u>Report lesen →</u></div>';
      }

      /* Insights-Seite: Aufmacher, Liste, Heft */
      var fl = q('[data-feed-lead]');
      if (fl) {
        fl.href = top.href;
        fl.innerHTML = (safe(top.bild) ? '<img src="' + esc(top.bild) + '" alt="">' : '') + meta(top) + '<h3>' + esc(top.titel) + '</h3><p>' + esc(top.teaser) + '</p>';
      }
      var feed = q('[data-feed]');
      if (feed) {
        var skip = +feed.getAttribute('data-feed-skip') || 0, n = +feed.getAttribute('data-feed') || 3;
        feed.innerHTML = list.slice(skip, skip + n).map(function (a) {
          return '<a href="' + esc(a.href) + '">' + (safe(a.bild) ? '<img src="' + esc(a.bild) + '" alt="" loading="lazy">' : '<span></span>') + '<div><small>' + esc(a.rubrik) + ' · ' + date(a.datum) + '</small><b>' + esc(a.titel) + '</b></div></a>';
        }).join('');
      }
      var mc = q('[data-mag-cover]');
      if (mc && heft && safe(heft.href)) {
        mc.href = heft.href;
        if (safe(heft.cover)) mc.innerHTML = '<img src="' + esc(heft.cover) + '" alt="Aktienmagazin Nr. ' + esc(heft.nr) + '" style="width:100%;border-radius:10px;box-shadow:0 40px 70px -30px rgb(0 0 0/.6)">';
        var mt = q('[data-mag-text]'); if (mt) mt.textContent = 'Nr. ' + heft.nr + ': „' + heft.titel + '“' + (heft.seiten ? ', ' + heft.seiten + ' Seiten.' : '.');
        var ml = q('[data-mag-link]'); if (ml) { ml.href = heft.href; ml.textContent = 'Nr. ' + heft.nr + ' online lesen →'; }
      }
    }).catch(function () {
      /* Der feste Text bleibt stehen und führt zur Insights-Übersicht. */
      var w = q('[data-live-artikel] .wait'); if (w) w.textContent = 'Zu den neuesten Artikeln →';
      var fl = q('[data-feed-lead]'); if (fl) fl.innerHTML = '<p class="fine">Zu den neuesten Artikeln →</p>';
    });
  }
})();
