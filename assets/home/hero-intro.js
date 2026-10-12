/* Intro des Hero-Bereichs der Startseite.
   Die Zeitachse (Raster, Logo, Headline, Geraete, Chart-Zeichnung, Elliott-
   Punkte) liegt komplett im CSS unter html.intro (assets/home/home.css).
   Dieses Skript ergaenzt, was CSS nicht kann:
   - Kennzahlen zaehlen hoch (data-count)
   - die neun Modul-Icons kreisen in 3D um das Smartphone
   - ein Lichtpunkt laeuft die Kurslinie entlang (Bahn einmal abgetastet,
     dann per Web Animations API - kein JavaScript je Frame)
   - leichte Neigung der Szene mit der Maus
   Ohne JavaScript oder bei reduzierter Bewegung steht der Endzustand.
   Alles Messen und Einrichten laeuft erst nach dem ersten Zeichnen
   (afterPaint), damit Kopf, Links und Ueberschrift nicht auf dieses
   Skript warten. */
(function () {
  'use strict';
  var root = document.documentElement;
  var hero = document.getElementById('hero');
  if (!hero) return;
  var motion = root.classList.contains('intro');
  var stage = hero.querySelector('.stage');
  var phone = stage && stage.querySelector('.phone');
  var orbs = stage ? [].slice.call(stage.querySelectorAll('.orb')) : [];
  var start = performance.now();

  // ---------- Kennzahlen zaehlen hoch ----------
  // Erste Zahl im Text (deutsches Format) wird animiert, Rest bleibt stehen.
  function countUp(el, delay) {
    var text = el.textContent, m = text.match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?/);
    if (!m) return;
    var raw = m[0], dec = (raw.split(',')[1] || '').length;
    var target = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    var pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    var nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    var fmt = function (v) { return pre + nf.format(v) + post; };
    el.textContent = fmt(0);
    setTimeout(function () {
      var t0 = performance.now(), dur = 1300;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = p < 1 ? fmt(target * e) : text;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }, delay);
  }
  var deferred = false;
  function setupCounters() {
    var counters = [].slice.call(hero.querySelectorAll('[data-count]'));
    // Liegt die Geraete-Buehne beim Laden unterhalb des Bildes (Smartphone),
    // wartet ihr Teil der Zeitachse, bis man hinscrollt.
    var deferStage = motion && stage && 'IntersectionObserver' in window && stage.getBoundingClientRect().top > window.innerHeight * 0.8;
    if (motion && !deferStage) counters.forEach(function (el, i) { countUp(el, 2700 + i * 120); });
    if (deferStage) {
      deferred = true;
      stage.classList.add('wait');
      var io = new IntersectionObserver(function (e) {
        if (!e[0].isIntersecting) return;
        io.disconnect();
        stage.classList.remove('wait'); stage.classList.add('late');
        start = performance.now() - 2100;                 // Orbit 1,2 s nach dem Einfahren
        planOrbit();                                       // Kacheln fliegen 1,2 s nach dem Einfahren ein
        counters.forEach(function (el, i) { if (stage.contains(el)) countUp(el, 700 + i * 120); else countUp(el, 0); });
      }, { threshold: 0.25 });
      io.observe(stage);
    }
  }

  // ---------- Modul-Orbit ----------
  var geo = null;
  function measure() {
    if (!phone || !stage) return;
    var s = stage.getBoundingClientRect(), p = phone.getBoundingClientRect();
    // Ellipse um das Smartphone, leicht nach rechts versetzt: links bleibt
    // der Abstand zum Text frei, rechts laufen die Icons ueber den Browser.
    var cx = p.left - s.left + p.width * 0.6, rx = p.width * 0.95;
    var minLeft = (s.width < 600 ? 8 : -30) + 23;      // Icon-Mitte nie ueber den Text
    if (cx - rx < minLeft) rx = cx - minLeft;
    if (s.width < 600) { cx = s.width / 2; rx = Math.min(p.width * 0.62, s.width / 2 - 30); }  // Smartphone: im Bild bleiben
    // Flacher, geneigter Ring um das untere Drittel: vorne ziehen die Icons nur
    // ueber die Tab-Leiste, hinten verschwinden sie hinter dem Geraet.
    geo = { cx: cx, cy: p.top - s.top + p.height * 0.8, rx: rx, ry: Math.max(40, p.height * 0.12), k: s.width < 600 ? 0.78 : 1 };
  }
  var ORBIT_START = motion ? 3300 : 0, N = orbs.length, OMEGA = 0.00012, PERIOD = 2 * Math.PI / OMEGA;
  // Zustand der Kachel k zum Zeitpunkt tt (ms seit Zeitnullpunkt) - Formeln unveraendert
  function orbState(k, tt) {
    var local = Math.max(0, Math.min(1, (tt - ORBIT_START - k * 110) / 900));
    var ease = 1 - Math.pow(1 - local, 3);
    var a = k / N * Math.PI * 2 + tt * OMEGA;
    var spread = 1 + (1 - ease) * 1.6;                // fliegt von aussen ein
    var depth = (Math.sin(a) + 1) / 2;                // 0 hinten, 1 vorne
    var x = geo.cx + Math.cos(a) * geo.rx * spread;
    var y = geo.cy + Math.sin(a) * geo.ry * spread;
    var scale = (0.72 + depth * 0.38) * geo.k;
    return { t: 'translate(' + (x - 23).toFixed(1) + 'px,' + (y - 23).toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')',
             o: (ease * (0.45 + depth * 0.55)).toFixed(3), z: depth > 0.5 ? 5 : 1, a: a };
  }
  // Endzustand ohne Bewegung (reduzierte Bewegung, kein WAAPI)
  function orbitStill() {
    if (!geo) measure();
    if (!geo) return;
    for (var k = 0; k < N; k++) {
      var st = orbState(k, ORBIT_START + 4000), o = orbs[k];
      o.style.transform = st.t; o.style.opacity = st.o; o.style.zIndex = st.z;
    }
  }

  // Die Bewegung der Kacheln laeuft als Web Animation (Compositor) statt als JavaScript je Frame:
  // Einflug (900 ms, gestaffelt) und danach eine Dauerschleife ueber eine Umdrehung, beide aus
  // Stuetzpunkten der obigen Formeln. Das Hin-und-her-Schreiben von transform/opacity je Frame
  // liess den Style-Neuaufbau samt Unterbaum der neun Kacheln dauerhaft laufen.
  var orbAnims = [], zTimers = [], orbBuilt = false;
  function frames(k, tt0, span, n) {
    var f = [];
    for (var i = 0; i <= n; i++) { var st = orbState(k, tt0 + span * i / n); f.push({ offset: i / n, transform: st.t, opacity: st.o }); }
    return f;
  }
  // z-Index nur an den beiden Nulldurchgaengen je Umdrehung umschalten (vorn/hinten)
  function scheduleZ(k, tt) {
    var o = orbs[k], a = k / N * Math.PI * 2 + tt * OMEGA, next = Math.floor(a / Math.PI + 1e-9) + 1;
    o.style.zIndex = Math.sin(a) > 0 ? 5 : 1;
    zTimers[k] = setTimeout(function () {
      o.style.zIndex = next % 2 === 0 ? 5 : 1;
      scheduleZ(k, performance.now() - start + 1);
    }, Math.max(20, (next * Math.PI - a) / OMEGA));
  }
  function loop(k, tt) {
    var anim = orbs[k].animate(frames(k, tt, PERIOD, 96), { duration: PERIOD, iterations: Infinity, easing: 'linear' });
    orbAnims[k] = anim;
    scheduleZ(k, tt);
  }
  function buildOrbit() {
    orbAnims.forEach(function (a) { a && a.cancel(); }); orbAnims = [];
    zTimers.forEach(clearTimeout); zTimers = [];
    geo = null; measure();
    if (!geo || !orbs.length || !orbs[0].animate) { orbitStill(); return; }
    orbBuilt = true;
    var tt = performance.now() - start;
    orbs.forEach(function (o, k) {
      var from = ORBIT_START + k * 110, to = from + 900;
      if (tt >= to) { o.style.transform = o.style.opacity = o.style.zIndex = ''; loop(k, tt); return; }
      var ent = o.animate(frames(k, from, 900, 24), { duration: 900, delay: Math.max(0, from - tt), fill: 'both', easing: 'linear' });
      if (tt > from) ent.currentTime = tt - from;
      orbAnims[k] = ent;
      scheduleZ(k, tt);
      ent.onfinish = function () { var t2 = performance.now() - start; loop(k, t2); ent.cancel(); };
    });
  }

  // ---------- Lichtpunkt auf der Kurslinie ----------
  // Die Bahn wird einmal in 64 Punkten abgetastet; der Browser spielt die Bewegung ab - zwei
  // Runden (~10 s), danach ruht der Punkt: eine dauerhaft laufende Main-Thread-Animation
  // (SVG-Kindelemente lassen sich nicht compositen) hielte sonst jeden Frame der Seite im
  // Style-Neuaufbau. Der Glow ist ein Radialverlauf (#dot-glow) statt eines filter.
  var line = hero.querySelector('.intro-chart .c-close');
  var DOT_START = 3000, DOT_LOOP = 5200;
  function setupDot() {
    if (!motion || !line || !line.getTotalLength || !line.animate) return;
    var NS = 'http://www.w3.org/2000/svg', len = line.getTotalLength(), fr = [];
    for (var i = 0; i <= 64; i++) {
      var p = i / 64, pt = line.getPointAtLength(p * len);
      fr.push({ offset: p, transform: 'translate(' + pt.x.toFixed(1) + 'px,' + pt.y.toFixed(1) + 'px)',
        opacity: p < 0.04 ? p / 0.04 : p > 0.96 ? (1 - p) / 0.04 : 1 });
    }
    var delay = Math.max(0, DOT_START - (performance.now() - start));
    [['c-halo', 16], ['c-dot', 5]].forEach(function (d) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', d[1]); c.setAttribute('class', d[0]);
      line.parentNode.appendChild(c);
      c.animate(fr, { duration: DOT_LOOP, iterations: 2, delay: delay, fill: 'backwards', easing: 'linear' });
    });
  }

  // ---------- Aufbau und Neuvermessung ----------
  var orbitTimer = 0, resizeTimer = 0;
  // Die Kacheln fliegen ein, sobald das Smartphone steht (ORBIT_START nach dem Zeitnullpunkt)
  function planOrbit() {
    clearTimeout(orbitTimer);
    if (!motion) { orbitStill(); return; }
    orbitTimer = setTimeout(buildOrbit, Math.max(0, ORBIT_START - (performance.now() - start)));
  }
  function setupOrbit() {
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (!motion) { geo = null; orbitStill(); } else if (orbBuilt) buildOrbit(); }, 150);
    });
    if (!deferred) planOrbit();
  }

  // ---------- Neigung mit der Maus ----------
  function setupTilt() {
  if (motion && stage && window.matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.transform = 'perspective(1400px) rotateY(' + (x * 6).toFixed(2) + 'deg) rotateX(' + (-y * 4).toFixed(2) + 'deg)';
    });
    hero.addEventListener('mouseleave', function () { stage.style.transform = ''; });
  }
  }

  // ---------- Start nach dem ersten Zeichnen ----------
  function afterPaint(fn) { requestAnimationFrame(function () { setTimeout(fn, 0); }); }
  afterPaint(function () {
    // Zeitnullpunkt der CSS-Zeitachse: Start der Smartphone-Animation (sonst jetzt)
    try { var a = phone && phone.getAnimations()[0]; if (a && a.startTime != null) start = a.startTime; } catch (e) {}
    setupCounters();
    setupDot();
    setupOrbit();
    setupTilt();
  });
})();
