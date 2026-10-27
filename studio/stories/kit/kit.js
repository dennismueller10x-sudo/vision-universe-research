/* Motor der Erklaervideos. Jedes Video (studio/stories/<id>/scenes.js) ruft Story.define({...}) mit sechs Szenen auf:
   { hl: 'Schlagzeile mit <span class="lime">Wort</span>', html: 'Grafik', anim(t, k) {...} }.
   Zeiten: window.TIMING (aus build_script.py): TM.sc = Szenenstarts s1..s6 + Ende, TM.ev = Ereignismarken, SUBS = Untertitel.
   Der Renderer ruft window.render(t) fuer jedes Bild auf (30 fps). */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), $ = function (id) { return document.getElementById(id); };
  if (Q.get('ovl') === '1') document.documentElement.classList.add('ovl');
  var clamp = function (x, a, b) { return Math.min(b == null ? 1 : b, Math.max(a || 0, x)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  var eo = function (x) { return 1 - Math.pow(1 - x, 3); };
  var eio = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var back = function (x) { var c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  var DEF = null;

  function icon(id, cls) { return '<svg viewBox="0 0 24 24" class="' + (cls || '') + '"><use href="#' + id + '"/></svg>'; }
  // Satz -> einzelne Woerter fuer die gestaffelte Schlagzeile
  function words(html) {
    var out = '', i = 0;
    html.split(/(<br>)/).forEach(function (part) {
      if (part === '<br>') { out += '<br>'; return; }
      part.replace(/(<span[^>]*>[^<]*<\/span>|[^\s<]+)/g, function (w) { out += '<span class="w" data-i="' + (i++) + '">' + w + '</span> '; return w; });
    });
    return out;
  }
  function define(def) {
    DEF = def;
    $('kick').textContent = def.kicker || '';
    $('finKick').textContent = def.finKick || 'App';
    $('finSub').textContent = def.finSub || '';
    $('stage').innerHTML = def.scenes.map(function (s, i) {
      return '<div id="s' + (i + 1) + '" class="abs scn"><div class="hl">' + words(s.hl) + '</div><div class="vis">' + (s.html || '') + '</div></div>';
    }).join('');
    def.scenes.forEach(function (s) { if (s.init) s.init(); });
  }

  var T = window.TIMING || { TM: { sc: [0, 4, 8, 12, 16, 20, 24], ev: {} }, SUBS: [], TOTAL: 26 };
  var SC = T.TM.sc, EV = T.TM.ev || {};
  var K = {
    seg: seg, eo: eo, eio: eio, back: back, clamp: clamp,
    ev: function (n, fb) { return EV[n] != null ? EV[n] : fb; },
    pop: function (id, t, at, dy, d) { var el = typeof id === 'string' ? $(id) : id, k = eo(seg(t, at - .05, at + (d || .4))); if (!el) return k; el.style.opacity = k; el.style.transform = 'translateY(' + ((1 - k) * (dy == null ? 30 : dy)) + 'px) scale(' + (.96 + .04 * k) + ')'; return k; },
    zoom: function (id, t, at, d) { var el = $(id), x = seg(t, at - .05, at + (d || .45)), k = x <= 0 ? 0 : back(x); if (el) { el.style.opacity = clamp(x * 3); el.style.transform = 'scale(' + (.6 + .4 * k) + ')'; } return x; },
    draw: function (id, t, at, d) { var el = $(id); if (el) el.style.strokeDashoffset = 1 - eo(seg(t, at, at + (d || .9))); },
    fill: function (id, t, at, to, d) { var el = $(id); if (el) el.style.width = (to * eo(seg(t, at, at + (d || .8)))) + '%'; },
    count: function (id, t, at, d, a, b, fmt) { var el = $(id); if (!el) return; var v = a + (b - a) * eo(seg(t, at, at + d)); el.textContent = fmt ? fmt(v) : Math.round(v).toLocaleString('de-DE'); },
    pulse: function (t, at, d) { var x = seg(t, at, at + (d || .5)); return Math.sin(Math.PI * x); },
    $: $
  };

  function headline(el, t, a) {
    el.querySelectorAll('.w').forEach(function (w) {
      var i = +w.dataset.i, k = eo(seg(t, a + i * .07, a + i * .07 + .45));
      w.style.opacity = k; w.style.transform = 'translateY(' + ((1 - k) * 60) + 'px)';
    });
  }
  function render(t) {
    if (!DEF) return;
    var end = SC[6], idx = 0;
    for (var i = 0; i < 6; i++) if (t >= SC[i]) idx = i;
    DEF.scenes.forEach(function (s, i) {
      var el = $('s' + (i + 1)), a = SC[i], b = SC[i + 1], last = i === 5;
      var vin = i === 0 ? 1 : eo(seg(t, a - .05, a + .35)), vout = last ? 1 - seg(t, b - .05, b + .25) : 1 - eo(seg(t, b - .3, b));
      var on = t >= a - .1 && t < b + .3;
      el.style.display = on ? '' : 'none';
      if (!on) return;
      el.style.opacity = Math.min(vin, vout);
      el.style.transform = 'translateY(' + ((1 - vin) * 50 - (1 - vout) * 40) + 'px) scale(' + (1 - (1 - vout) * .04) + ')';
      headline(el, t, i === 0 ? -1 : a);
      if (s.anim) s.anim(t, K, a, b);
    });
    // Film darunter (?ovl=1): bis filmUntil durchsichtiger Grund mit Abdunklung, danach blendet der dunkle Grund ein.
    if (document.documentElement.classList.contains('ovl')) {
      var fu = DEF.filmUntil || 0, g = seg(t, fu - .7, fu);
      $('bg').style.opacity = g; $('floor').style.opacity = .55 * g; $('vign').style.opacity = g; $('filmShade').style.opacity = 1 - g;
    }
    // Kamera: langsame Fahrt je Szene, Glow-Drift, Lichtstreifen beim Szenenwechsel
    var a0 = SC[idx], b0 = SC[idx + 1] || end, p = eio(seg(t, a0, b0));
    $('cam').style.transform = 'scale(' + (1 + .035 * p) + ') translateY(' + (-10 * p) + 'px)';
    $('glowA').style.transform = 'translate(' + (Math.sin(t * .31) * 80) + 'px,' + (Math.cos(t * .27) * 60) + 'px)';
    $('glowB').style.transform = 'translate(' + (Math.cos(t * .23) * 90) + 'px,' + (Math.sin(t * .29) * 70) + 'px)';
    $('floor').style.backgroundPosition = '0 ' + (t * 40) + 'px';
    var sw = idx > 0 ? seg(t, a0 - .1, a0 + .7) : seg(t, 0, .8);
    $('sweep').style.opacity = sw > 0 && sw < 1 ? Math.sin(Math.PI * sw) : 0;
    $('sweep').style.transform = 'translateX(' + (sw * 2300) + 'px) skewX(-18deg)';
    // Untertitel
    var cur = t < end ? (T.SUBS || []).find(function (x) { return t >= x[0] && t < x[1]; }) : null;
    $('sub').innerHTML = cur ? '<div>' + cur[2] + '</div>' : '';
    $('sub').style.opacity = cur ? Math.min(seg(t, cur[0], cur[0] + .1), 1 - seg(t, cur[1] - .08, cur[1])) : 0;
    $('sub').style.transform = cur ? 'translateY(' + ((1 - eo(seg(t, cur[0], cur[0] + .2))) * 16) + 'px)' : '';
    $('shade').style.opacity = t < end ? 1 : 0;
    // Endkarte
    var fin = eo(seg(t, end + .05, end + .5));
    $('fin').style.opacity = fin; $('fin').style.transform = 'scale(' + (1.04 - .04 * fin) + ')';
    $('logo').style.opacity = $('kick').style.opacity = 1 - seg(t, end, end + .3);
  }
  window.Story = { define: define, icon: icon, K: K };
  window.render = render;
  fetch('/assets/product-icons.svg').then(function (r) { return r.text(); }).then(function (svg) {
    var d = document.createElement('div'); d.style.display = 'none'; d.innerHTML = svg; document.body.prepend(d);
    var s = document.createElement('script'); s.src = '../' + (Q.get('v') || 'start') + '/scenes.js';
    s.onload = function () { document.fonts.ready.then(function () { render(0); window.__ready = true; }); };
    document.body.appendChild(s);
  });
})();
