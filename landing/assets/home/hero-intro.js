/* Intro des Hero-Bereichs der Startseite.
   Die Zeitachse (Raster, Logo, Headline, Geraete, Chart-Zeichnung, Elliott-
   Punkte) liegt komplett im CSS unter html.intro (assets/home/home.css).
   Dieses Skript ergaenzt, was CSS nicht kann:
   - Kennzahlen zaehlen hoch (data-count)
   - die neun Modul-Icons kreisen in 3D um das Smartphone
   - ein Lichtpunkt laeuft die Kurslinie entlang
   - leichte Neigung der Szene mit der Maus
   Ohne JavaScript oder bei reduzierter Bewegung steht der Endzustand. */
(function () {
  'use strict';
  var root = document.documentElement;
  var hero = document.getElementById('hero');
  if (!hero) return;
  var motion = root.classList.contains('intro');
  var stage = hero.querySelector('.stage');
  var phone = stage && stage.querySelector('.phone');
  var orbs = stage ? [].slice.call(stage.querySelectorAll('.orb')) : [];
  var visible = true, start = performance.now();

  // ---------- Kennzahlen zaehlen hoch ----------
  // Erste Zahl im Text (deutsches Format) wird animiert, Rest bleibt stehen.
  function countUp(el, delay) {
    var text = el.textContent, m = text.match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?/);
    if (!m) return;
    var raw = m[0], dec = (raw.split(',')[1] || '').length;
    var target = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    var pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    var fmt = function (v) { return pre + v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post; };
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
  var counters = [].slice.call(hero.querySelectorAll('[data-count]'));
  // Liegt die Geraete-Buehne beim Laden unterhalb des Bildes (Smartphone),
  // wartet ihr Teil der Zeitachse, bis man hinscrollt.
  var deferStage = motion && stage && 'IntersectionObserver' in window && stage.getBoundingClientRect().top > window.innerHeight * 0.8;
  if (motion && !deferStage) counters.forEach(function (el, i) { countUp(el, 2700 + i * 120); });
  if (deferStage) {
    stage.classList.add('wait');
    var io = new IntersectionObserver(function (e) {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      stage.classList.remove('wait'); stage.classList.add('late');
      start = performance.now() - 2100;                 // Orbit 1,2 s nach dem Einfahren
      setTimeout(function () { geo = null; }, 1200);
      counters.forEach(function (el, i) { if (stage.contains(el)) countUp(el, 700 + i * 120); else countUp(el, 0); });
    }, { threshold: 0.25 });
    io.observe(stage);
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
  var ORBIT_START = motion ? 3300 : 0, N = orbs.length;
  function orbit(now) {
    if (!geo) measure();
    if (!geo) return;
    var t = now - start;
    for (var k = 0; k < N; k++) {
      var local = Math.max(0, Math.min(1, (t - ORBIT_START - k * 110) / 900));
      var ease = 1 - Math.pow(1 - local, 3);
      var a = k / N * Math.PI * 2 + t * 0.00012;
      var spread = 1 + (1 - ease) * 1.6;              // fliegt von aussen ein
      var x = geo.cx + Math.cos(a) * geo.rx * spread;
      var y = geo.cy + Math.sin(a) * geo.ry * spread;
      var depth = (Math.sin(a) + 1) / 2;                // 0 hinten, 1 vorne
      var scale = (0.72 + depth * 0.38) * geo.k;
      var o = orbs[k];
      o.style.transform = 'translate(' + (x - 23).toFixed(1) + 'px,' + (y - 23).toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
      o.style.opacity = (ease * (0.45 + depth * 0.55)).toFixed(3);
      o.style.zIndex = depth > 0.5 ? 5 : 1;
    }
  }

  // ---------- Lichtpunkt auf der Kurslinie ----------
  var line = hero.querySelector('.intro-chart .c-close'), dot = null, len = 0;
  if (line && line.getTotalLength) {
    len = line.getTotalLength();
    dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '5'); dot.setAttribute('class', 'c-dot');
    line.parentNode.appendChild(dot);
  }
  var DOT_START = motion ? 3000 : 0, DOT_LOOP = 5200;
  function runDot(now) {
    if (!dot) return;
    var t = now - start - DOT_START;
    if (t < 0) { dot.style.opacity = 0; return; }
    var p = (t % DOT_LOOP) / DOT_LOOP, pt = line.getPointAtLength(p * len);
    dot.setAttribute('cx', pt.x.toFixed(1)); dot.setAttribute('cy', pt.y.toFixed(1));
    dot.style.opacity = p < 0.04 ? p / 0.04 : p > 0.96 ? (1 - p) / 0.04 : 1;
  }

  // ---------- Schleife, pausiert ausserhalb des Bildes ----------
  var still = !motion;
  function frame(now) {
    if (visible) { orbit(still ? start + ORBIT_START + 4000 : now); if (!still) runDot(now); }
    if (!still) requestAnimationFrame(frame);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(hero);
  window.addEventListener('resize', function () { geo = null; if (still) frame(performance.now()); });
  // Nach dem Einfahren des Smartphones neu vermessen (seine Endlage zaehlt)
  setTimeout(function () { geo = null; }, motion ? 3300 : 0);
  requestAnimationFrame(frame);

  // ---------- Neigung mit der Maus ----------
  if (motion && stage && window.matchMedia('(pointer:fine)').matches) {
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.transform = 'perspective(1400px) rotateY(' + (x * 6).toFixed(2) + 'deg) rotateX(' + (-y * 4).toFixed(2) + 'deg)';
    });
    hero.addEventListener('mouseleave', function () { stage.style.transform = ''; });
  }
})();
