/* Vision Universe · Website: Menü, Einblenden, Videos, in der Vorschau die neuesten Insights. Ohne Abhängigkeiten.
   Alle Seiten sind ohne JavaScript bedienbar; dieses Skript ergänzt nur. */
(function () {
  'use strict';
  var d = document;
  var q = function (s, r) { return (r || d).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var watch = 'IntersectionObserver' in window;
  d.documentElement.classList.add('js');

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

  /* Menü: am Rechner die Fläche „Module“ unter der Leiste, auf dem Telefon der Knopf „Menü“ oben rechts mit der Fläche
     über das ganze Fenster (dort: Seite dahinter scrollt nicht mit, Tab bleibt im Kopf der Seite, Escape schließt). */
  var mega = d.getElementById('mega'), nav = d.getElementById('nav'), opener = null, stickUpdate = null, lockY = 0;
  var phone = window.matchMedia ? window.matchMedia('(max-width:900px)') : { matches: false };
  var shown = function (el) { return el.getClientRects().length > 0; };
  var megaOpen = function () { return !!mega && mega.classList.contains('on'); };
  var setMega = function (open) {
    if (!mega || open === megaOpen()) return;
    /* Scrollsperre (nur Telefon, site.css): Manche Browser setzen die Seite dabei an den Anfang; die Stelle wird gemerkt. */
    if (open) lockY = window.pageYOffset;
    mega.classList.toggle('on', open);
    d.documentElement.classList.toggle('mopen', open);
    if (!open && phone.matches && window.pageYOffset !== lockY) window.scrollTo({ top: lockY, behavior: 'instant' });
    qa('[data-mega]').forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
    if (stickUpdate) stickUpdate();
  };
  var closeMega = function () { setMega(false); if (opener && shown(opener)) opener.focus({ preventScroll: true }); };
  qa('[data-mega]').forEach(function (b) {
    b.setAttribute('role', 'button');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      var open = !megaOpen();
      opener = b;
      setMega(open);
      if (open) { var f = qa('a', mega).filter(shown)[0]; if (f) f.focus({ preventScroll: true }); }
    });
    b.addEventListener('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); b.click(); } });
  });
  if (mega) {
    /* Ohne JavaScript öffnet der Sprung zu #mega die Fläche. Mit JavaScript übernimmt die Klasse. */
    if (location.hash === '#mega') { if (window.history && history.replaceState) history.replaceState(null, '', location.pathname + location.search); opener = qa('[data-mega]').filter(shown)[0] || null; setMega(true); }
    mega.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      if (a.hasAttribute('data-mega-close')) { e.preventDefault(); closeMega(); } else setMega(false);
    });
  }
  d.addEventListener('click', function (e) {
    if (megaOpen() && !e.target.closest('#mega') && !e.target.closest('[data-mega]')) setMega(false);
  });
  d.addEventListener('keydown', function (e) {
    if (!megaOpen()) return;
    if (e.key === 'Escape') { closeMega(); return; }
    if (e.key === 'Tab' && phone.matches && nav) {
      var f = qa('a[href],button', nav).filter(shown), first = f[0], last = f[f.length - 1], at = f.indexOf(d.activeElement);
      if (at === -1 || (!e.shiftKey && d.activeElement === last)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
    }
  });

  /* Aufruf am unteren Rand (Telefon): erscheint, sobald der Knopf im Kopf der Seite nach oben aus dem Fenster ist, und
     weicht, solange derselbe Aufruf, die Anmeldung oder der Fuß zu sehen sind oder das Menü offen ist. */
  var stick = q('[data-stick]');
  if (stick && watch) {
    var goal = q('a', stick).getAttribute('href');
    var same = qa('main a.cta').filter(function (a) { return a.getAttribute('href') === goal && shown(a); });
    /* Knopf im Kopf der Seite: der erste gleiche Aufruf, wenn er im ersten Fenster liegt; sonst zählt die Überschrift. */
    var hero = same[0] && same[0].getBoundingClientRect().top + window.pageYOffset < window.innerHeight ? same[0] : null;
    var marker = hero || q('main h1');
    var ends = same.filter(function (a) { return a !== hero; }).concat(qa('#newsletter,#dabei,.foot'));
    var passed = false, inView = [];
    stickUpdate = function () { stick.classList.toggle('on', passed && !inView.length && !megaOpen()); };
    if (marker) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { passed = !e.isIntersecting && e.boundingClientRect.bottom <= 0; });
        stickUpdate();
      }).observe(marker);
      var near = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var i = inView.indexOf(e.target);
          if (e.isIntersecting && i === -1) inView.push(e.target);
          if (!e.isIntersecting && i !== -1) inView.splice(i, 1);
        });
        stickUpdate();
      });
      ends.forEach(function (el) { near.observe(el); });
    }
  }

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

})();
