/* Vision Universe · Website 2: Menü, Einblenden, Videos, neueste Insights. Ohne Abhängigkeiten.
   Alle Seiten sind ohne JavaScript bedienbar; dieses Skript ergänzt nur. */
(function () {
  'use strict';
  var d = document;
  var q = function (s, r) { return (r || d).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var watch = 'IntersectionObserver' in window;

  /* Einblenden beim Scrollen: versteckt wird nur, was beim Laden unterhalb des Fensters liegt. */
  if (watch && !calm) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.remove('wait'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    qa('.rv').forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('wait'); io.observe(el); }
    });
  }
  if (calm) qa('svg').forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });

  /* Menü „Module“: oben als Fläche unter der Leiste, auf dem iPhone als Blatt von unten. */
  var mega = d.getElementById('mega'), opener = null;
  var setMega = function (open) {
    if (!mega) return;
    mega.classList.toggle('on', open);
    qa('[data-mega]').forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
  };
  var megaOpen = function () { return !!mega && mega.classList.contains('on'); };
  qa('[data-mega]').forEach(function (b) {
    b.setAttribute('role', 'button');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      var open = !megaOpen();
      opener = b;
      setMega(open);
      if (open) { var f = q('a', mega); if (f) f.focus({ preventScroll: true }); }
    });
    b.addEventListener('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); b.click(); } });
  });
  d.addEventListener('click', function (e) {
    if (megaOpen() && !e.target.closest('#mega') && !e.target.closest('[data-mega]')) setMega(false);
  });
  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && megaOpen()) { setMega(false); if (opener) opener.focus(); }
  });

  /* Film im Kopf: läuft stumm, solange er sichtbar ist. Bei reduzierter Bewegung bleibt das Standbild stehen. */
  qa('video[data-autoplay]').forEach(function (v) {
    v.muted = true;
    if (calm || !watch) return;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
      });
    }, { threshold: 0.25 }).observe(v);
  });

  /* Modul-Filme: Klick auf den Knopf startet den Film mit Ton, danach gilt die Bedienleiste des Browsers. */
  qa('[data-vid]').forEach(function (box) {
    var v = q('video', box), b = q('.play', box);
    if (!v || !b) return;
    v.controls = false;
    b.hidden = false;
    var start = function () {
      b.hidden = true;
      v.controls = true;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    };
    b.addEventListener('click', start);
    v.addEventListener('click', function () { if (!v.controls) start(); });
  });

  /* Insights live aus /insights/artikel.json (jeden Werktag neu), wie auf /website/: neueste Artikel, neuestes Heft,
     neuester Report. Was neu erscheint, steht dort an erster Stelle und rückt hier von selbst nach vorn.
     Lässt sich die Liste nicht laden, bleibt der feste Text stehen und führt zur Insights-Übersicht. */
  if (q('[data-live-artikel],[data-feed],[data-feed-lead],[data-live-report],[data-mag-img],[data-mag-link]')) {
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var date = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
    var safe = function (u) { return /^\/(insights|reports)\/[a-z0-9\-\/._]+$/i.test(u || '') ? u : ''; };
    var text = function (sel, t) { qa(sel).forEach(function (e) { e.textContent = t; }); };
    var chev = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
    fetch('/insights/artikel.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (j) {
      var list = (j && j.artikel || []).filter(function (a) { return safe(a.href); });
      var top = list[0], heft = (j.magazin || [])[0], rep = (j.reports || [])[0];

      /* Start: neuester Artikel */
      var la = q('[data-live-artikel]');
      if (la && top) {
        la.href = top.href;
        la.innerHTML = '<span class="eb">Neuester Artikel · ' + date(top.datum) + '</span><b>' + esc(top.titel) + '</b>';
      }

      /* News: Aufmacher und Liste */
      var fl = q('[data-feed-lead]');
      if (fl && top) {
        fl.href = top.href;
        fl.innerHTML = (safe(top.bild) ? '<img src="' + esc(top.bild) + '" alt="">' : '') + '<div class="cap"><span class="pill l">' + esc(top.rubrik) + ' · ' + date(top.datum) + '</span><h2 class="H2">' + esc(top.titel) + '</h2></div>';
      }
      var feed = q('[data-feed]');
      if (feed && list.length) {
        var skip = +feed.getAttribute('data-feed-skip') || 0, n = +feed.getAttribute('data-feed') || 3;
        var cards = list.slice(skip, skip + n);
        feed.innerHTML = cards.map(function (a, i) {
          return '<a class="art' + (i === 3 && cards.length > 4 ? ' big' : '') + '" href="' + esc(a.href) + '">' + (safe(a.bild) ? '<img src="' + esc(a.bild) + '" alt="" loading="lazy">' : '') +
            '<div><span class="pill' + (a.rubrik === 'Tagesthema' ? ' l' : '') + '">' + esc(a.rubrik) + '</span><h3 class="H3">' + esc(a.titel) + '</h3><div class="dt">' + date(a.datum) + '</div></div></a>';
        }).join('');
      }

      /* Aktienreports: neuester Report, sonst der Hinweis, dass der erste in Arbeit ist */
      var lr = q('[data-live-report]');
      if (lr) {
        var rk = q('[data-live-report-kopf]', lr), rt = q('[data-live-report-titel]', lr), rl = q('[data-live-report-link]', lr);
        if (rep && safe(rep.href)) {
          if (rk) { rk.textContent = 'Neuester Aktienreport' + (date(rep.datum) ? ' · ' + date(rep.datum) : ''); rk.hidden = false; }
          if (rt) rt.textContent = rep.titel;
          if (rl) { rl.href = rep.href; rl.innerHTML = 'Report lesen ' + chev; }
        } else if (rt && !(j.reports || []).length) rt.textContent = 'Der erste Aktienreport ist in Arbeit.';
      }

      /* Aktienmagazin: Die Seiten zeigen fest das Heft aus dem Bau. Ist ein neueres erschienen, rückt es nach. */
      var main = q('main[data-mag]'), fest = main ? main.getAttribute('data-mag') : '';
      if (heft && safe(heft.href) && /^\d{2,3}$/.test(heft.nr || '') && (!main || heft.nr !== fest)) {
        if (safe(heft.cover)) qa('[data-mag-img]').forEach(function (im) { im.src = heft.cover; if (im.alt) im.alt = 'Aktienmagazin Nr. ' + heft.nr; });
        text('[data-mag-nr]', 'Nr. ' + heft.nr);
        text('[data-mag-titel]', heft.titel);
        if (heft.seiten) text('[data-mag-seiten]', heft.seiten);
        text('[data-mag-kopf]', 'Aktienmagazin · Nr. ' + heft.nr + (date(heft.datum) ? ' · ' + date(heft.datum) : ''));
        qa('[data-mag-h1]').forEach(function (h) { h.innerHTML = '<span class="hl" style="color:var(--ink)">' + esc(heft.titel) + '</span>'; });
        qa('[data-mag-link]').forEach(function (a) { a.href = heft.href; });
        qa('[data-mag-pdf]').forEach(function (a) { a.href = heft.href + 'vision-universe-aktienmagazin-' + heft.nr + '.pdf'; });
        qa('[data-mag-seite]').forEach(function (im) {
          var s = +im.getAttribute('data-mag-seite');
          if (heft.seiten && s > heft.seiten) { im.remove(); return; }
          im.onerror = function () { im.remove(); };
          im.alt = 'Aktienmagazin Nr. ' + heft.nr + ', Seite ' + s;
          im.src = heft.href + 'seiten/s' + (s < 10 ? '0' : '') + s + '.jpg';
        });
      }
    }).catch(function () { /* Der feste Text bleibt stehen. */ });
  }
})();
