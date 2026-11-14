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

})();
