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

  var mrd = function (v) { var a = Math.abs(v); return (v < 0 ? '−' : '') + de(a / 1e9, a >= 1e11 ? 0 : 1) + ' Mrd. $'; };
  var chipWahl = function (f, cb) { $$(f, '.rg-chip').forEach(function (b) { b.addEventListener('click', function () { $$(f, '.rg-chip').forEach(function (x) { x.classList.toggle('on', x === b); }); cb(b); }); }); };

  function marge(f) {
    var c = $$(f, '.rg-100 i');
    chipWahl(f, function (b) {
      var m = Math.round(+b.getAttribute('data-m') * 100);
      c.forEach(function (x, i) { x.className = i < m ? 'f' : ''; });
      out(f, 'm', m + ' $'); out(f, 'satz', 'bleiben bei ' + b.getAttribute('data-name') + ' von 100 $ Umsatz als Gewinn.');
    });
  }

  function eps(f) {
    var g = +f.getAttribute('data-gewinn'), a = +f.getAttribute('data-aktien'), k = +f.getAttribute('data-kurs'), r = $(f, '[data-i="r"]'), e0 = g / a;
    r.addEventListener('input', function () {
      var n = a * (1 - r.value / 100), e = g / n;
      out(f, 'r', r.value + ' %'); out(f, 'aktien', de(n / 1e9, 2) + ' Mrd. Aktien'); out(f, 'eps', de(e, 2) + ' $'); out(f, 'eps2', de(e, 2) + ' $');
      out(f, 'plus', '+' + de((e / e0 - 1) * 100, 1) + ' %'); out(f, 'kgv', de(k / e, 1));
    });
  }

  function split(f) {
    var k = +f.getAttribute('data-kurs'), t = $(f, '[data-o="teile"]');
    chipWahl(f, function (b) {
      var n = +b.getAttribute('data-f'); t.innerHTML = new Array(n + 1).join('<i></i>');
      out(f, 'nach', n + ' Aktien × ' + de(k / n, 2) + ' $');
    });
  }

  function order(f) {
    var k = $(f, '[data-i="k"]'), v = $(f, '[data-i="v"]');
    function run() {
      var d = (k.value - v.value) / 5;
      out(f, 'k', k.value); out(f, 'v', v.value); out(f, 'p', de(100 * (1 + d / 100), 2) + ' €'); out(f, 'd', (d > 0 ? '+' : d < 0 ? '−' : '±') + de(Math.abs(d), 1) + ' %');
      $(f, '[data-o="kb"]').style.setProperty('--w', k.value); $(f, '[data-o="vb"]').style.setProperty('--w', v.value);
      f.classList.toggle('hoch', d > 0); f.classList.toggle('tief', d < 0);
    }
    k.addEventListener('input', run); v.addEventListener('input', run);
  }

  function cashflow(f) {
    var max = +f.getAttribute('data-max');
    chipWahl(f, function (b) {
      [1, 2, 3].forEach(function (i) {
        var v = +b.getAttribute('data-o' + i);
        $(f, '[data-o="w' + i + '"]').style.setProperty('--w', (Math.max(0, v) / max * 100).toFixed(1));
        out(f, 'b' + i, i === 2 ? '−' + mrd(v) : mrd(v));
      });
    });
  }

  function kosten(f) {
    var m = $(f, '[data-i="m"]'), j = $(f, '[data-i="j"]');
    var spar = function (monat, jahre, r) { var q = Math.pow(1 + r, 1 / 12) - 1, w = 0; for (var i = 0; i < jahre * 12; i++) w = (w + monat) * (1 + q); return w; };
    function run() {
      var a = spar(+m.value, +j.value, 0.048), b = spar(+m.value, +j.value, 0.035);
      out(f, 'm', de(m.value) + ' €'); out(f, 'j', j.value); out(f, 'a', de(a) + ' €'); out(f, 'b', de(b) + ' €'); out(f, 'd', de(a - b) + ' €');
      $(f, '[data-o="wb"]').style.setProperty('--w', (b / a * 100).toFixed(1));
    }
    m.addEventListener('input', run); j.addEventListener('input', run);
  }

  function thes(f) {
    var j = $(f, '[data-i="j"]');
    j.addEventListener('input', function () {
      var a = 10000, b = 10000, aus = 0; for (var i = 0; i < +j.value; i++) { a *= 1.06; aus += b * 0.02; b *= 1.04; }
      out(f, 'j', j.value); out(f, 'a', de(a) + ' €'); out(f, 'b', de(b) + ' €'); out(f, 'c', de(aus) + ' €');
    });
  }

  function chart(f) {
    $$(f, '.rg-chip').forEach(function (b) { b.addEventListener('click', function () { var on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); f.classList.toggle('ohne-' + b.getAttribute('data-l'), !on); f.classList.toggle('mit-' + b.getAttribute('data-l'), on); }); });
  }

  function elliott(f) {
    var pts = $$(f, '.pt'), i = 0;
    function zeig() { pts.forEach(function (p, n) { p.classList.toggle('on', n <= i); p.classList.toggle('jetzt', n === i); }); out(f, 't', pts[i].getAttribute('data-t')); }
    $(f, '[data-i="weiter"]').addEventListener('click', function () { i = (i + 1) % pts.length; zeig(); });
    $(f, '[data-i="zurueck"]').addEventListener('click', function () { i = (i + pts.length - 1) % pts.length; zeig(); });
    pts.forEach(function (p, n) { p.addEventListener('click', function () { i = n; zeig(); }); });
    zeig();
  }

  function fonds(f) { chipWahl(f, function (b) { $$(f, '.rg-13f-p').forEach(function (p) { p.hidden = p.getAttribute('data-p') !== b.getAttribute('data-f'); }); }); }
  function idx(f) { chipWahl(f, function (b) { $$(f, '.rg-kacheln').forEach(function (p) { p.hidden = p.getAttribute('data-x') !== b.getAttribute('data-x'); }); }); }

  function ichart(f) {
    var d = f.getAttribute('data-d').split(','), T = ['SPY', 'URTH', 'ACWI'], R = {};
    T.forEach(function (t) { R[t] = f.getAttribute('data-' + t.toLowerCase()).split(',').map(Number); });
    function zeig(j) {
      var bis = d[d.length - 1], grenze = (+bis.slice(0, 4) - j) + bis.slice(4), ab = 0;
      while (ab < d.length - 1 && d[ab] < grenze) ab++;
      var W = {}, max = 0, lo = Infinity;
      T.forEach(function (t) { var r = R[t].slice(ab); W[t] = r.map(function (x) { return x / r[0] * 10000; }); max = Math.max(max, Math.max.apply(null, W[t])); lo = Math.min(lo, Math.min.apply(null, W[t])); });
      lo *= 0.95; var yv = function (x) { return (220 - (x - lo) / (max - lo) * 205).toFixed(1); };
      T.forEach(function (t) {
        var v = W[t], ende = v[v.length - 1];
        $(f, '[data-o="l-' + t + '"]').setAttribute('points', v.map(function (x, i) { return (i / (v.length - 1) * 600).toFixed(1) + ',' + yv(x); }).join(' '));
        out(f, 'e-' + t, de(ende) + ' $'); out(f, 'g-' + t, '+' + de((ende / 10000 - 1) * 100) + ' %');
        out(f, 'j-' + t, (Math.pow(ende / 10000, 1 / j) * 100 - 100).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' %');
      });
      var y = yv(10000), b = $(f, '.basis'); b.setAttribute('y1', y); b.setAttribute('y2', y);
      var p = d[ab].split('-'); out(f, 'von', p[2] + '.' + p[1] + '.' + p[0]);
    }
    chipWahl(f, function (b) { zeig(+b.getAttribute('data-j')); });
  }

  function rente(f) {
    var n = $(f, '[data-i="n"]'), a = $(f, '[data-i="a"]'), r = $(f, '[data-i="r"]'), j = $(f, '[data-i="j"]');
    function run() {
      var h = Math.max(0, n.value * a.value / 100 - r.value), s = h * Math.pow(1.02, +j.value);
      out(f, 'n', de(n.value) + ' €'); out(f, 'a', a.value + ' %'); out(f, 'r', de(r.value) + ' €'); out(f, 'j', j.value);
      out(f, 'h', de(h) + ' €'); out(f, 's', de(s) + ' €'); out(f, 'k', de(s * 12 * 20) + ' €');
    }
    [n, a, r, j].forEach(function (e) { e.addEventListener('input', run); });
  }

  var init = {'kgv-rechner': kgv, anteil: anteil, zulage: zulage, sparplan: sparplan, bruch: bruch, streuung: streuung, marge: marge, eps: eps, split: split, order: order, cashflow: cashflow, kosten: kosten, thes: thes, chart: chart, elliott: elliott, fonds: fonds, idx: idx, ichart: ichart, rente: rente};
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
