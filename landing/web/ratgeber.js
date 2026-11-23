/* Ratgeber: macht die statischen Grafiken bedienbar (landing/scripts/ratgeber.mjs). Ohne JavaScript bleibt alles lesbar. */
(function () {
  'use strict';
  var de = function (x, d) { return Number(x).toLocaleString('de-DE', {minimumFractionDigits: d || 0, maximumFractionDigits: d || 0}); };
  var $ = function (r, s) { return r.querySelector(s); };
  var $$ = function (r, s) { return Array.prototype.slice.call(r.querySelectorAll(s)); };
  var out = function (r, k, v) { $$(r, '[data-o="' + k + '"]').forEach(function (e) { e.textContent = v; }); };

  function kgv(f) {
    var kurs = $(f, '[data-i="kurs"]'), eps = $(f, '[data-i="eps"]'), name = $$(f, '.rg-chip')[0].getAttribute('data-name');
    var coins = $$(f, '.rg-muenzen i');
    function run() {
      var k = +kurs.value, e = +eps.value, q = k / e;
      out(f, 'kurs', de(k, 2) + ' $'); out(f, 'kurs2', de(k, 2) + ' $'); out(f, 'eps', de(e, 2) + ' $'); out(f, 'eps2', de(e, 2) + ' $'); out(f, 'kgv', q >= 100 ? de(q, 0) : de(q, 1));
      coins.forEach(function (c, i) { c.className = i < Math.floor(q) ? 'f' : (i < q ? 'h' : ''); });
      $(f, '[data-o="satz"]').innerHTML = 'Bei <b>' + name + '</b> bezahlst du beim Kauf rund <b>' + (q >= 100 ? de(q, 0) : de(q, 1)) + ' Jahresgewinne</b>, wenn der Gewinn gleich bleibt.' + (q > 60 ? ' Mehr als 60 Münzen passen nicht in die Grafik.' : '');
    }
    $$(f, '.rg-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        $$(f, '.rg-chip').forEach(function (x) { x.classList.toggle('on', x === b); });
        name = b.getAttribute('data-name');
        var k = +b.getAttribute('data-kurs'), e = +b.getAttribute('data-eps');
        kurs.max = Math.ceil(Math.max(k * 2.5, +kurs.max)); eps.max = Math.ceil(Math.max(e * 3, +eps.max));
        kurs.value = k; eps.value = e; run();
      });
    });
    kurs.addEventListener('input', function () { name = 'deinem Beispiel'; run(); });
    eps.addEventListener('input', function () { name = 'deinem Beispiel'; run(); });
  }

  function anteil(f) {
    var kurs = +f.getAttribute('data-kurs'), eps = +f.getAttribute('data-eps'), div = +f.getAttribute('data-div'), n = $(f, '[data-i="n"]');
    n.addEventListener('input', function () {
      var x = +n.value; out(f, 'n', de(x)); out(f, 'wert', de(x * kurs) + ' $'); out(f, 'gewinn', de(x * eps) + ' $'); out(f, 'div', de(x * kurs * div) + ' $');
    });
  }

  function zulage(f) {
    var b = $(f, '[data-i="b"]'), k = $(f, '[data-i="k"]'), u = $(f, '[data-i="u25"]');
    function run() {
      var x = +b.value, kinder = +k.value, z = 0;
      if (x >= 120) z = 0.5 * Math.min(x, 360) + 0.25 * Math.max(0, Math.min(x, 1800) - 360) + kinder * Math.min(300, Math.min(x, 1800)) + (u.checked ? 200 : 0);
      out(f, 'b', de(x) + ' €'); out(f, 'k', de(kinder)); out(f, 'du', de(x) + ' €'); out(f, 'st', de(z) + ' €'); out(f, 'sum', de(x + z) + ' €');
      var s = x + z || 1, i = $$(f, '.rg-stack i');
      i[0].style.setProperty('--w', (x / s * 100).toFixed(1)); i[1].style.setProperty('--w', (z / s * 100).toFixed(1));
    }
    [b, k, u].forEach(function (e) { e.addEventListener('input', run); });
  }

  function sparplan(f) {
    var m = $(f, '[data-i="m"]'), j = $(f, '[data-i="j"]'), r = 0.05;
    function run() {
      var monat = +m.value, jahre = +j.value, q = Math.pow(1 + r, 1 / 12) - 1, w = 0, k = [];
      for (var i = 1; i <= jahre * 12; i++) { w = (w + monat) * (1 + q); if (i % 12 === 0) k.push([i / 12, monat * i, w]); }
      var max = w || 1, ein = monat * jahre * 12;
      var pts = function (idx) { return k.map(function (p) { return (p[0] / jahre * 300).toFixed(1) + ',' + (150 - p[idx] / max * 140).toFixed(1); }).join(' '); };
      $(f, '[data-o="pw"]').setAttribute('points', '0,150 ' + pts(2) + ' 300,150');
      $(f, '[data-o="pe"]').setAttribute('points', '0,150 ' + pts(1) + ' 300,150');
      out(f, 'm', de(monat) + ' €'); out(f, 'j', de(jahre)); out(f, 'ein', de(ein) + ' €'); out(f, 'wert', de(w) + ' €'); out(f, 'plus', de(w - ein) + ' €');
    }
    $$(f, '.rg-chip').forEach(function (b) { b.addEventListener('click', function () { $$(f, '.rg-chip').forEach(function (x) { x.classList.toggle('on', x === b); }); r = +b.getAttribute('data-r'); run(); }); });
    m.addEventListener('input', run); j.addEventListener('input', run);
  }

  function bruch(f) {
    var b = $(f, '[data-i="b"]');
    b.addEventListener('input', function () {
      var x = +b.value; out(f, 'b', de(x) + ' $');
      $$(f, 'li').forEach(function (li) { var s = x / +li.getAttribute('data-kurs'); $(li, '.rg-frac').style.setProperty('--f', Math.min(1, s).toFixed(3)); $(li, '[data-o="s"]').textContent = de(s, 2); });
    });
  }

  function streuung(f) { var b = $(f, '[data-i="los"]'); b.addEventListener('click', function () { var on = f.classList.toggle('los'); b.textContent = on ? 'Zurücksetzen' : 'Absturz zeigen'; }); }

  var init = {'kgv-rechner': kgv, anteil: anteil, zulage: zulage, sparplan: sparplan, bruch: bruch, streuung: streuung};
  $$(document, '[data-g]').forEach(function (f) { var fn = init[f.getAttribute('data-g')]; if (fn) try { fn(f); } catch (e) { /* Grafik bleibt statisch */ } });

  // Balken erst animieren, wenn sie ins Bild kommen.
  if ('IntersectionObserver' in window) {
    $$(document, '.rg-bars').forEach(function (b) {
      var r = b.getBoundingClientRect();
      if (r.top < window.innerHeight) return; // schon sichtbar: sofort stehen lassen
      b.classList.add('warte');
      new IntersectionObserver(function (es, o) { es.forEach(function (e) { if (e.isIntersecting) { b.classList.remove('warte'); o.disconnect(); } }); }, {threshold: 0.25}).observe(b);
    });
  }

  // Suche in der Übersicht: Karten filtern.
  var such = $(document, '[data-rg-such]');
  if (such) such.addEventListener('input', function () {
    var q = such.value.trim().toLowerCase(), treffer = 0;
    $$(document, '.rg-welt').forEach(function (w) {
      var sicht = 0;
      $$(w, '.rg-card').forEach(function (c) { var ok = !q || c.getAttribute('data-such').indexOf(q) >= 0; c.hidden = !ok; if (ok) sicht++; });
      w.hidden = !sicht; treffer += sicht;
    });
    $(document, '[data-rg-leer]').hidden = treffer > 0;
  });

  // Seitenleiste: aktiven Abschnitt markieren.
  var side = $$(document, '.rg-side a');
  if (side.length && 'IntersectionObserver' in window) {
    var secs = side.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
    var so = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) side.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); }); }); }, {rootMargin: '-30% 0px -60% 0px'});
    secs.forEach(function (s) { so.observe(s); });
  }
})();
