/* Bewegte Grafiken der Startseite unterhalb des Hero.
   1. Modul-Kreis: Der Ring dreht wie ein Uhrzeiger Schritt fuer Schritt
      weiter; das Modul oben springt nach vorne, wird groesser, und die
      passende Modulkarte daneben leuchtet mit.
   2. Unternehmensentwicklung (aus Discover): Balken wachsen beim
      Hineinscrollen, Kennzahl per Tab, Jahr per Antippen vergleichen.
   Bei reduzierter Bewegung steht alles still, bleibt aber bedienbar. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IO = 'IntersectionObserver' in window;

  // ---------- 1. Modul-Kreis ----------
  // Tickt schnell (1,1 s) und reagiert auf Scrollen: jede Scroll-Bewegung
  // ueber dem Kreis schiebt den Zeiger weiter - auch wer nur durchwischt,
  // sieht, dass sich etwas bewegt.
  var hub = document.querySelector('.hub');
  if (hub) {
    var ring = hub.querySelector('.hub-ring');
    var nodes = [].slice.call(hub.querySelectorAll('.hub-ring .node'));
    var label = hub.querySelector('.hub-active');
    var cards = [].slice.call(document.querySelectorAll('.module[data-mod]'));
    var N = nodes.length, step = 0, rot = 0, timer = null, visible = false, hold = false, lastTick = 0;
    var STEP = 360 / N, EVERY = 1100;
    var setFront = function () {
      var i = ((-step % N) + N) % N, node = nodes[i], mod = node.getAttribute('data-mod');
      nodes.forEach(function (n) { n.classList.toggle('front', n === node); });
      cards.forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-mod') === mod); });
      if (label) { label.classList.remove('swap'); void label.offsetWidth; label.textContent = node.querySelector('em').textContent; label.classList.add('swap'); }
    };
    var tick = function (dir) {
      var now = performance.now(); if (now - lastTick < 260) return; lastTick = now;
      step += dir || 1; rot += STEP * (dir || 1); ring.style.setProperty('--rot', rot + 'deg'); setTimeout(setFront, 280);
    };
    var run = function () { if (!timer && !reduce && visible && !hold) timer = setInterval(tick, EVERY); };
    var halt = function () { clearInterval(timer); timer = null; };
    setFront();
    var grid = hub.parentNode.querySelector('.modules');
    if (grid) { grid.addEventListener('mouseenter', function () { hold = true; halt(); }); grid.addEventListener('mouseleave', function () { hold = false; run(); }); }
    // Scroll-Kopplung: alle ~70 px Scrollweg ein Schritt in Scrollrichtung
    var lastY = window.scrollY, acc = 0;
    window.addEventListener('scroll', function () {
      var y = window.scrollY, d = y - lastY; lastY = y;
      if (!visible || reduce) return;
      acc += d;
      if (Math.abs(acc) > 70) { tick(acc > 0 ? 1 : -1); acc = 0; }
    }, { passive: true });
    if (IO) new IntersectionObserver(function (e) {
      var was = visible; visible = e[0].isIntersecting;
      if (visible && !was && !reduce) tick(1);       // sofort ein Schritt beim Hineinscrollen
      visible ? run() : halt();
    }, { threshold: 0.15 }).observe(hub);
  }

  // ---------- 2. Unternehmensentwicklung ----------
  (function () {
  var box = document.getElementById('journey');
  var raw = document.getElementById('journey-data');
  if (!box || !raw) return;
  var data; try { data = JSON.parse(raw.textContent); } catch (e) { return; }
  if (!data.length) return;
  var barsEl = box.querySelector('.journey-bars');
  var tabs = [].slice.call(box.querySelectorAll('[data-track]'));
  var out = {}; [].forEach.call(box.querySelectorAll('[data-j]'), function (el) { out[el.getAttribute('data-j')] = el; });
  var de = function (v, d) { return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var bn = function (v) { return de(v / 1e9, 1) + ' Mrd. $'; };
  var track = 0, sel = data[0].rows.length - 1;

  // Zahl weich auf den neuen Wert zaehlen
  var countTo = function (el, from, to, fmt) {
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    var t0 = performance.now(), dur = 900;
    (function f(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(f);
    })(t0);
  };
  var shown = { from: 0, to: 0, growth: 0 };
  var growthFmt = function (g) { return (g >= 0 ? '+' : '−') + de(Math.abs(g), 0) + ' %'; };

  var buildBars = function (rows) {
    barsEl.innerHTML = rows.map(function (r, i) {
      return '<button class="jbar" type="button" role="listitem" style="--i:' + i + '" data-i="' + i + '"><i></i><span>' + String(r.fy).slice(2) + '</span></button>';
    }).join('');
  };
  var render = function () {
    var rows = data[track].rows;
    if (barsEl.children.length !== rows.length) buildBars(rows);
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }));
    rows.forEach(function (r, i) {
      var b = barsEl.children[i];
      b.style.setProperty('--h', Math.max(1.5, Math.max(0, r.v) / max * 100).toFixed(1) + '%');
      b.classList.toggle('on', i === sel);
      b.setAttribute('aria-label', 'GJ ' + r.fy + ': ' + bn(r.v));
      b.setAttribute('aria-pressed', String(i === sel));
    });
    var a = rows[0], z = rows[sel];
    var g = a.v > 0 ? (z.v / a.v - 1) * 100 : 0;
    countTo(out.from, shown.from, a.v, bn); shown.from = a.v;
    countTo(out.to, shown.to, z.v, bn); shown.to = z.v;
    countTo(out.growth, shown.growth, g, growthFmt); shown.growth = g;
    out.growth.classList.toggle('neg', g < 0);
    out.fromYear.textContent = 'GJ ' + a.fy; out.toYear.textContent = 'GJ ' + z.fy;
    out.span.textContent = (z.fy - a.fy) + ' Jahre';
    tabs.forEach(function (t, i) { t.setAttribute('aria-selected', String(i === track)); });
  };
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { track = i; sel = data[i].rows.length - 1; render(); });
  });
  barsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.jbar'); if (!b) return;
    sel = +b.getAttribute('data-i'); render();
  });

  // Balken wachsen bei jedem Hineinscrollen neu
  if (reduce || !IO) { barsEl.classList.add('grow'); render(); return; }
  render();
  out.from.textContent = bn(0); out.to.textContent = bn(0); out.growth.textContent = growthFmt(0);
  shown = { from: 0, to: 0, growth: 0 };
  new IntersectionObserver(function (e) {
    var hit = e[0];
    if (hit.isIntersecting && hit.intersectionRatio >= 0.4 && !barsEl.classList.contains('grow')) {
      barsEl.classList.add('grow');
      shown = { from: 0, to: 0, growth: 0 }; render();
    } else if (!hit.isIntersecting) {
      barsEl.classList.remove('grow');
    }
  }, { threshold: [0, 0.4] }).observe(box);
  })();

  // ---------- 3. Kopf der Landingpage ----------
  var head = document.getElementById('lp-head');
  if (head) {
    var onScroll = function () { head.classList.toggle('scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  // ---------- 4. Kennzahlen zaehlen hoch ----------
  var stats = [].slice.call(document.querySelectorAll('[data-count-to]'));
  if (stats.length && !reduce && IO) {
    stats.forEach(function (el) { el.textContent = '0'; });
    var statIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        statIO.unobserve(e.target);
        var el = e.target, to = +el.getAttribute('data-count-to'), t0 = performance.now(), dur = to > 100 ? 1600 : 900;
        el.parentNode.parentNode.classList.add('lit');
        (function f(now) {
          var p = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 4)));
          el.textContent = v.toLocaleString('de-DE');
          if (p < 1) requestAnimationFrame(f);
        })(t0);
      });
    }, { threshold: 0.6 });
    stats.forEach(function (el) { statIO.observe(el); });
  } else stats.forEach(function (el) { el.parentNode.parentNode.classList.add('lit'); });

  // ---------- 5. Swipe-Feed ----------
  var deck = document.getElementById('deck');
  if (deck) {
    var saved = 0, savedEl = document.getElementById('deck-saved');
    var cardsAll = [].slice.call(deck.querySelectorAll('.card'));
    var order = cardsAll.slice();                     // oberste Karte = order[0]
    var layout = function () {
      order.forEach(function (c, i) {
        c.style.zIndex = 100 - i;
        c.style.transform = i < 3 ? 'translateY(' + (i * 10) + 'px) scale(' + (1 - i * 0.05) + ')' : 'translateY(20px) scale(.9)';
        c.style.opacity = i < 3 ? 1 : 0;
        c.classList.toggle('top', i === 0);
      });
    };
    var fly = function (dir) {
      var c = order[0]; if (!c || c.classList.contains('gone')) return;
      c.classList.add('gone', dir > 0 ? 'liked' : 'noped');
      c.style.transform = 'translate(' + (dir * 140) + '%, -6%) rotate(' + (dir * 22) + 'deg)';
      c.style.opacity = 0;
      if (dir > 0 && savedEl) { saved++; savedEl.textContent = saved; savedEl.parentNode.classList.remove('pop'); void savedEl.offsetWidth; savedEl.parentNode.classList.add('pop'); }
      setTimeout(function () {
        order.push(order.shift());
        c.classList.remove('gone', 'liked', 'noped'); c.style.transition = 'none';
        layout(); void c.offsetWidth; c.style.transition = '';
      }, 420);
      setTimeout(layout, 30);
    };
    layout();
    // Ziehen mit Maus oder Finger
    var drag = null;
    deck.addEventListener('pointerdown', function (e) {
      var c = order[0]; if (!c || !c.contains(e.target)) return;
      drag = { x: e.clientX, y: e.clientY, c: c }; c.setPointerCapture(e.pointerId); c.style.transition = 'none'; pause();
    });
    deck.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.dx = dx;
      drag.c.style.transform = 'translate(' + dx + 'px,' + dy * 0.3 + 'px) rotate(' + dx / 14 + 'deg)';
      drag.c.classList.toggle('liked', dx > 30); drag.c.classList.toggle('noped', dx < -30);
    });
    var end = function () {
      if (!drag) return; var c = drag.c, dx = drag.dx || 0; drag = null; c.style.transition = '';
      if (Math.abs(dx) > 80) fly(dx > 0 ? 1 : -1); else { c.classList.remove('liked', 'noped'); layout(); }
      resume();
    };
    deck.addEventListener('pointerup', end); deck.addEventListener('pointercancel', end);
    [].forEach.call(document.querySelectorAll('[data-swipe]'), function (b) {
      b.addEventListener('click', function () { pause(); fly(b.getAttribute('data-swipe') === 'right' ? 1 : -1); resume(); });
    });
    // Automatisch wischen, solange sichtbar: abwechselnd merken und weiter
    var auto = null, deckVisible = false, n = 0, resumeT = null;
    var start = function () { if (!auto && deckVisible && !reduce) auto = setInterval(function () { fly(n++ % 3 === 1 ? -1 : 1); }, 1500); };
    var pause = function () { clearInterval(auto); auto = null; clearTimeout(resumeT); };
    var resume = function () { clearTimeout(resumeT); resumeT = setTimeout(start, 4000); };
    if (IO) new IntersectionObserver(function (e) { deckVisible = e[0].isIntersecting; deckVisible ? (setTimeout(function () { if (deckVisible) fly(1); }, 400), start()) : pause(); }, { threshold: 0.4 }).observe(deck);
  }
  // ---------- 6. Imagefilm: laedt erst beim Klick ----------
  var film = document.getElementById('film');
  if (film) {
    var frame = film.querySelector('.film-frame');
    var play = function () {
      if (frame.querySelector('video')) { frame.querySelector('video').play(); return; }
      var portrait = window.matchMedia('(max-width:760px)').matches, fmt = portrait ? '9x16' : '16x9';
      var v = document.createElement('video');
      v.src = '/assets/home/clip/vu-imageclip-' + fmt + '.mp4';
      v.poster = '/assets/home/clip/vu-imageclip-' + fmt + '.jpg';
      v.controls = true; v.playsInline = true; v.autoplay = true; v.preload = 'auto';
      v.setAttribute('playsinline', ''); v.className = 'film-video' + (portrait ? ' portrait' : '');
      frame.classList.add('playing'); frame.replaceChildren(v);
      var p = v.play(); if (p && p.catch) p.catch(function () { /* Autoplay blockiert: Steuerung sichtbar */ });
      v.focus();
    };
    [].forEach.call(film.querySelectorAll('[data-film-play]'), function (b) { b.addEventListener('click', play); });
  }
})();
