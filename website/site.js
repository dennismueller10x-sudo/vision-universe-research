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

  /* Neueste Artikel aus /insights/artikel.json (jeden Werktag neu) */
  var feed = d.querySelector('[data-feed]');
  if (feed) {
    var n = +feed.getAttribute('data-feed') || 3;
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var date = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
    var safe = function (u) { return /^\/insights\/[a-z0-9\-\/.]+$/i.test(u || '') ? u : ''; };
    fetch('/insights/artikel.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (j) {
      var list = (j && j.artikel || []).filter(function (a) { return safe(a.href); }).slice(0, n);
      if (!list.length) throw 0;
      feed.innerHTML = list.map(function (a) {
        var img = safe(a.bild);
        return '<a class="art" href="' + esc(a.href) + '">' + (img ? '<div class="im"><img src="' + esc(img) + '" alt="" loading="lazy"></div>' : '') +
          '<small>' + esc(a.rubrik) + ' · ' + date(a.datum) + '</small><b>' + esc(a.titel) + '</b><p>' + esc(a.teaser) + '</p></a>';
      }).join('');
    }).catch(function () {
      feed.innerHTML = '<p class="mute">Die Artikel lassen sich gerade nicht laden. <a class="more" href="/insights/">Zu allen Artikeln →</a></p>';
    });
  }
})();
