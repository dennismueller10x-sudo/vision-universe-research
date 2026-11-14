/* Vision Universe · Website: Menü, Einblenden, Videos, in der Vorschau die neuesten Insights. Ohne Abhängigkeiten.
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

  /* Bewegung nur, solange sie zu sehen ist: Grafiken, Bühne und Laufband ruhen außerhalb des Fensters. */
  if (watch && !calm) {
    var rest = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        e.target.classList.toggle('idle', !e.isIntersecting);
        qa('svg', e.target).forEach(function (s) { if (s.pauseAnimations) { if (e.isIntersecting) s.unpauseAnimations(); else s.pauseAnimations(); } });
      });
    }, { rootMargin: '120px' });
    qa('.gfx,.stg,.mq,.fc').forEach(function (el) { rest.observe(el); });
  }

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

  /* Film im Kopf: Zuerst steht nur das Standbild. Der Film (1,7 MB) lädt erst, wenn die Seite fertig geladen und der
     Browser frei ist, läuft stumm und nur, solange er sichtbar ist. Kein Film bei reduzierter Bewegung, im
     Datensparmodus oder auf sehr langsamer Verbindung: dort bleibt das Standbild stehen. */
  var net = navigator.connection || {};
  var thrifty = !!net.saveData || /(^|-)2g$/.test(net.effectiveType || '');
  qa('video[data-autoplay]').forEach(function (v) {
    v.muted = true;
    if (calm || thrifty || !watch) return;
    var begin = function () {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
        });
      }, { threshold: 0.25 }).observe(v);
    };
    var idle = function () { if (window.requestIdleCallback) window.requestIdleCallback(begin, { timeout: 2500 }); else setTimeout(begin, 600); };
    if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle);
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

  /* LIVE:START Nur in der Vorschau auf research. Für www entfernt der Erzeuger diesen Block (dort steht der Auszug fest in der Seite). */
  /* Insights live aus /insights/artikel.json (jeden Werktag neu), wie auf /website/: neueste Artikel, neuestes Heft,
     neuester Report. Was neu erscheint, steht dort an erster Stelle und rückt hier von selbst nach vorn.
     Lässt sich die Liste nicht laden, bleibt stehen, was fest in der Seite steht (Heft, Report, Weg zur Übersicht). */
  if (q('[data-live-artikel],[data-feed],[data-feed-lead],[data-live-report],[data-mag-img],[data-mag-link],[data-rep-img]')) {
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var date = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
    var safe = function (u) { return /^\/(insights|reports)\/[a-z0-9\-\/._]+$/i.test(u || '') ? u : ''; };
    var text = function (sel, t) { qa(sel).forEach(function (e) { e.textContent = t; }); };
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    /* Neues Bild einsetzen: Die kleine WebP-Fassung gehört zum fest eingebauten Heft oder Report und entfällt dann. */
    var swap = function (im, src, alt) {
      if (im.parentNode && im.parentNode.nodeName === 'PICTURE') qa('source', im.parentNode).forEach(function (s) { s.remove(); });
      im.src = src; if (alt && im.alt) im.alt = alt;
    };
    var fill = function (j) {
      var list = (j && j.artikel || []).filter(function (a) { return safe(a.href); });
      var top = list[0], heft = (j.magazin || [])[0], rep = (j.reports || [])[0];

      /* Start: neuester Artikel als Karte */
      var la = q('[data-live-artikel]');
      if (la && top) {
        la.href = top.href;
        la.innerHTML = (safe(top.bild) ? '<img src="' + esc(top.bild) + '" alt="" loading="lazy" decoding="async">' : '') + '<div><span class="pill l">Neuester Artikel · ' + date(top.datum) + '</span><h3 class="H3">' + esc(top.titel) + '</h3></div>';
      }

      /* News: Aufmacher und Liste */
      var fl = q('[data-feed-lead]');
      if (fl && top) {
        fl.href = top.href;
        fl.innerHTML = (safe(top.bild) ? '<img src="' + esc(top.bild) + '" alt="" loading="lazy" decoding="async">' : '') + '<div class="cap"><span class="pill l">' + esc(top.rubrik) + ' · ' + date(top.datum) + '</span><h3 class="H2">' + esc(top.titel) + '</h3></div>';
      }
      var feed = q('[data-feed]');
      if (feed && list.length) {
        var skip = +feed.getAttribute('data-feed-skip') || 0, n = +feed.getAttribute('data-feed') || 3;
        var cards = list.slice(skip, skip + n);
        feed.innerHTML = cards.map(function (a, i) {
          return '<a class="art' + (i === 3 && cards.length > 4 ? ' big' : '') + '" href="' + esc(a.href) + '">' + (safe(a.bild) ? '<img src="' + esc(a.bild) + '" alt="" loading="lazy" decoding="async">' : '') +
            '<div><span class="pill' + (a.rubrik === 'Tagesthema' ? ' l' : '') + '">' + esc(a.rubrik) + '</span><h3 class="H3">' + esc(a.titel) + '</h3><div class="dt">' + date(a.datum) + '</div></div></a>';
        }).join('');
      }

      /* Aktienreport: Fest eingebaut ist der Report aus dem Bau. Ist ein neuerer erschienen, rückt er nach
         (Titelbild und Seiten nach dem Muster von products/insights/build.mjs; Seitenzahl und PDF nennt die Liste nicht). */
      var stage = q('[data-live-report]'), fixed = stage ? stage.getAttribute('data-live-report') : '';
      if (rep && safe(rep.href) && (!stage || rep.href !== fixed)) {
        text('[data-rep-kopf]', 'Aktienreport' + (date(rep.datum) ? ' · ' + date(rep.datum) : ''));
        text('[data-rep-titel]', rep.titel);
        qa('[data-rep-link]').forEach(function (a) { a.href = rep.href; });
        qa('[data-rep-pdf]').forEach(function (a) { a.hidden = true; });
        qa('[data-rep-seiten]').forEach(function (e) { var li = e.closest('li'); if (li) li.hidden = true; });
        qa('[data-rep-img]').forEach(function (im) { im.onerror = function () { im.hidden = true; }; swap(im, rep.href + 'cover.jpg', 'Titelseite Aktienreport: ' + rep.titel); });
        qa('[data-rep-seite]').forEach(function (im) {
          var s = +im.getAttribute('data-rep-seite');
          im.onerror = function () { (im.parentNode.nodeName === 'PICTURE' ? im.parentNode : im).remove(); };
          swap(im, rep.href + 'seiten/s' + two(s) + '.jpg', 'Aktienreport, Seite ' + s);
        });
      }

      /* Aktienmagazin: Die Seiten zeigen fest das Heft aus dem Bau (data-mag nennt seine Nummer). Ist ein neueres
         erschienen, rückt es nach; sonst bleibt alles stehen, auch die kleinen Bildfassungen. */
      var main = q('[data-mag]'), fest = main ? main.getAttribute('data-mag') : '';
      if (heft && safe(heft.href) && /^\d{2,3}$/.test(heft.nr || '') && (!main || heft.nr !== fest)) {
        if (safe(heft.cover)) qa('[data-mag-img]').forEach(function (im) { swap(im, heft.cover, 'Titelseite Aktienmagazin Nr. ' + heft.nr); });
        text('[data-mag-nr]', 'Nr. ' + heft.nr);
        text('[data-mag-titel]', heft.titel);
        if (heft.seiten) text('[data-mag-seiten]', heft.seiten);
        text('[data-mag-kopf]', 'Aktienmagazin · Nr. ' + heft.nr + (date(heft.datum) ? ' · ' + date(heft.datum) : ''));
        qa('[data-mag-h1]').forEach(function (h) { h.innerHTML = '<span class="hl">' + esc(heft.titel) + '</span>'; });
        qa('[data-mag-link]').forEach(function (a) { a.href = heft.href; });
        qa('[data-mag-pdf]').forEach(function (a) { a.href = heft.href + 'vision-universe-aktienmagazin-' + heft.nr + '.pdf'; });
        qa('[data-mag-seite]').forEach(function (im) {
          var s = +im.getAttribute('data-mag-seite'), box = im.parentNode.nodeName === 'PICTURE' ? im.parentNode : im;
          if (heft.seiten && s > heft.seiten) { box.remove(); return; }
          im.onerror = function () { box.remove(); };
          swap(im, heft.href + 'seiten/s' + two(s) + '.jpg', 'Aktienmagazin Nr. ' + heft.nr + ', Seite ' + s);
        });
      }
    };
    var load = function () {
      fetch('/insights/artikel.json').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(fill).catch(function () { /* Der feste Stand bleibt stehen. */ });
    };
    /* Die News-Seite braucht die Liste sofort (sie ist dort vorab angefordert). Überall sonst wartet der Abruf, bis die
       Seite geladen und der Browser frei ist: Er steuert nichts oberhalb der Falz. */
    if (q('[data-feed]')) load();
    else {
      var later = function () { if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 3000 }); else setTimeout(load, 800); };
      if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
    }
  }
  /* LIVE:END */
})();
