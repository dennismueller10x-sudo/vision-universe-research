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
  var hub = document.querySelector('.hub');
  if (hub) {
    var ring = hub.querySelector('.hub-ring');
    var nodes = [].slice.call(hub.querySelectorAll('.hub-ring .node'));
    var label = hub.querySelector('.hub-active');
    var cards = [].slice.call(document.querySelectorAll('.module[data-mod]'));
    var N = nodes.length, step = 0, rot = 0, timer = null, visible = false;
    var STEP = 360 / N, EVERY = 2600;
    var setFront = function () {
      var i = ((-step % N) + N) % N, node = nodes[i], mod = node.getAttribute('data-mod');
      nodes.forEach(function (n) { n.classList.toggle('front', n === node); });
      cards.forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-mod') === mod); });
      if (label) {
        label.classList.remove('swap'); void label.offsetWidth;  // Einblendung neu starten
        label.textContent = node.querySelector('em').textContent; label.classList.add('swap');
      }
    };
    var tick = function () { step++; rot += STEP; ring.style.setProperty('--rot', rot + 'deg'); setTimeout(setFront, 450); };
    var run = function () { if (!timer && !reduce && visible) timer = setInterval(tick, EVERY); };
    var halt = function () { clearInterval(timer); timer = null; };
    setFront();
    // Eine Karte im Raster ansehen haelt den Kreis an
    hub.parentNode.addEventListener('mouseenter', halt);
    hub.parentNode.addEventListener('mouseleave', run);
    if (IO) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? run() : halt(); }, { threshold: 0.35 }).observe(hub);
  }

  // ---------- 2. Unternehmensentwicklung ----------
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
