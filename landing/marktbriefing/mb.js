/* Marktbriefing (www.visionuniverse.de/marktbriefing/): Verhalten der Szenen-Seite.
   Inhalt und Zahlen stehen fertig im HTML (products/news/briefing/www.js); dieses Skript ergänzt Bewegung beim Ankommen
   einer Szene, den abfahrbaren Kursverlauf, die Kapitel-Markierung und die Karten-Ansicht. CSP: nur 'self'. */
(function () {
  'use strict';
  var root = document.querySelector('.mb');
  if (!root) return;
  root.classList.add('js');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var num = function (x, d) { return Math.abs(x).toFixed(d == null ? 1 : d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var sg = function (x) { return x > 0 ? '+' : x < 0 ? '−' : ''; };
  var pct = function (x, d) { return sg(x) + num(x, d) + ' %'; };
  var secs = [].slice.call(root.querySelectorAll('.mb-sc'));
  var bars = [].slice.call(root.querySelectorAll('.mb-bars i'));
  var toc = [].slice.call(root.querySelectorAll('.mb-toc a'));
  var barBox = root.querySelector('.mb-bars');
  var cur = -1, touched = false;
  /* Vibration erst nach der ersten Berührung (Browser-Regel). */
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { touched = true; }, { once: true, passive: true }); });

  function enter(sec) {
    var i = +sec.dataset.i;
    if (i === cur) return;
    cur = i;
    bars.forEach(function (b, k) { b.classList.toggle('on', k <= i); });
    if (barBox) barBox.style.color = sec.classList.contains('k') ? '#fff' : '#000';
    toc.forEach(function (a, k) { if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    if (touched && navigator.vibrate && !reduce) { try { navigator.vibrate(8); } catch (e) { /* nicht unterstützt */ } }
    if (sec.classList.contains('in')) return;
    sec.classList.add('in');
    [].forEach.call(sec.querySelectorAll('[data-w]'), function (e) { e.style.width = e.dataset.w + '%'; });
    [].forEach.call(sec.querySelectorAll('[data-h]'), function (e) { e.style.height = e.dataset.h + '%'; });
    [].forEach.call(sec.querySelectorAll('[data-l]'), function (e) { e.style.left = e.dataset.l + '%'; });
    if (!reduce) [].forEach.call(sec.querySelectorAll('[data-to]'), function (el) {
      var to = +el.dataset.to, d = el.dataset.d == null ? 1 : +el.dataset.d, plain = el.dataset.plain, t0 = performance.now();
      var step = function (t) { var k = Math.min(1, (t - t0) / 900), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = plain ? num(v, d) + ' %' : pct(v, d); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    if (sec.querySelector('[data-mb-tape]')) drawTape(true);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) enter(e.target); }); }, { threshold: 0.5 });
    secs.forEach(function (s) { io.observe(s); });
  } else secs.forEach(enter);
  if (reduce) secs.forEach(function (s) { s.classList.add('in'); });
  [].forEach.call(root.querySelectorAll('[data-w]'), function (e) { e.style.setProperty('--w', e.dataset.w + '%'); });

  /* Tastatur: Pfeile springen zwischen Szenen */
  document.addEventListener('keydown', function (e) {
    if (!story.hidden || /input|textarea|select/i.test((e.target || {}).tagName || '')) return;
    var down = e.key === 'ArrowDown' || e.key === 'PageDown', up = e.key === 'ArrowUp' || e.key === 'PageUp';
    if (!down && !up) return;
    e.preventDefault();
    var n = Math.max(0, Math.min(secs.length - 1, (cur < 0 ? 0 : cur) + (down ? 1 : -1)));
    secs[n].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  });

  /* Kursverlauf zum Abfahren */
  var tapeData = null, tapeEl = document.getElementById('mb-tape');
  try { tapeData = tapeEl ? JSON.parse(tapeEl.textContent) : null; } catch (e) { tapeData = null; }
  var fig = root.querySelector('[data-mb-tape]'), svg = fig && fig.querySelector('svg');
  var key = 'QQQ', range = '1d', hov = null, geo = null;
  var NAME = { QQQ: 'Nasdaq 100', SPY: 'S&P 500' };
  var hhmm = function (iso) { return new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); };
  var dmy = function (iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.'; };
  function pts() {
    var src = range === '1d' ? tapeData[key] : tapeData.month && tapeData.month[key];
    return (src || []).map(function (p) { return { t: p[0], v: p[1] }; });
  }
  function drawTape(anim) {
    if (!svg || !tapeData) return;
    var P = pts(), W = svg.clientWidth, H = svg.clientHeight, l = 2, r = 46, t = 8, b = 26;
    if (!W || P.length < 2) return;
    var v = P.map(function (p) { return p.v; });
    var lo = Math.floor(Math.min.apply(null, v.concat([0]))), hi = Math.ceil(Math.max.apply(null, v.concat([0])));
    var x = function (i) { return l + i / (P.length - 1) * (W - l - r); }, y = function (val) { return t + (hi - val) / (hi - lo || 1) * (H - t - b); };
    var step = hi - lo > 6 ? 2 : 1, s = '';
    for (var g = lo; g <= hi; g += step) s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="#000" stroke-opacity="' + (g === 0 ? 0.5 : 0.08) + '"' + (g === 0 ? ' stroke-dasharray="3 4"' : '') + '/><text x="' + (W - r + 8) + '" y="' + (y(g) + 4) + '" font-size="12" fill="#6e6e6e">' + sg(g) + Math.abs(g) + ' %</text>';
    var d = P.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1); }).join('');
    s += '<path d="' + d + 'L' + x(P.length - 1) + ',' + y(0) + 'L' + x(0) + ',' + y(0) + 'Z" fill="#c8f531" fill-opacity=".35"/>';
    s += '<path class="' + (anim && !reduce ? 'mb-draw' : '') + '" d="' + d + '" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    P.forEach(function (p, i) {
      var tt = new Date(p.t), lab = range === '1d' ? (tt.getUTCMinutes() === 30 && tt.getUTCHours() % 2 === 0 ? hhmm(p.t) : '') : (i % 5 === 0 ? dmy(p.t) : '');
      if (lab) s += '<text x="' + x(i) + '" y="' + (H - 6) + '" font-size="12" fill="#6e6e6e" text-anchor="middle">' + lab + '</text>';
    });
    var i = hov == null ? P.length - 1 : hov;
    if (hov != null) s += '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="' + t + '" y2="' + (H - b) + '" stroke="#000" stroke-opacity=".3"/>';
    s += '<circle cx="' + x(i) + '" cy="' + y(v[i]) + '" r="8" fill="#c8f531" stroke="#000" stroke-width="3"/>';
    svg.innerHTML = s;
    geo = { n: P.length, l: l, r: r };
    var ln = svg.querySelector('.mb-draw');
    if (ln) { ln.style.setProperty('--len', ln.getTotalLength()); requestAnimationFrame(function () { requestAnimationFrame(function () { ln.classList.add('go'); }); }); }
    var close = i === P.length - 1, val = range === '1d' && close && tapeData.close && tapeData.close[key] != null ? tapeData.close[key] : v[i];
    var who = root.querySelector('[data-mb-who]'), n = root.querySelector('[data-mb-num]'), when = root.querySelector('[data-mb-when]');
    if (who) who.textContent = NAME[key] + (range === '1m' ? ' · 1 Monat' : ' · Tagesverlauf');
    if (n) n.textContent = pct(val, 2);
    if (when) when.textContent = close ? (range === '1d' ? 'Schluss · ' + tapeData.day : 'seit ' + dmy(P[0].t)) : (range === '1d' ? hhmm(P[i].t) + ' Uhr' : dmy(P[i].t));
  }
  if (svg) {
    if ('ResizeObserver' in window) new ResizeObserver(function () { drawTape(false); }).observe(svg);
    drawTape(false);
    var scrub = function (cx) { if (!geo) return; var rc = svg.getBoundingClientRect(); hov = Math.max(0, Math.min(geo.n - 1, Math.round((cx - rc.left - geo.l) / (rc.width - geo.l - geo.r) * (geo.n - 1)))); drawTape(false); };
    fig.addEventListener('pointermove', function (e) { scrub(e.clientX); });
    fig.addEventListener('touchmove', function (e) { scrub(e.touches[0].clientX); }, { passive: true });
    ['pointerleave', 'touchend'].forEach(function (ev) { fig.addEventListener(ev, function () { hov = null; drawTape(false); }); });
    [].forEach.call(root.querySelectorAll('[data-k]'), function (b) { b.addEventListener('click', function () { key = b.dataset.k; [].forEach.call(root.querySelectorAll('[data-k]'), function (o) { o.setAttribute('aria-pressed', o === b); }); hov = null; drawTape(true); }); });
    [].forEach.call(root.querySelectorAll('[data-r]'), function (b) { b.addEventListener('click', function () { range = b.dataset.r; [].forEach.call(root.querySelectorAll('[data-r]'), function (o) { o.setAttribute('aria-pressed', o === b); }); hov = null; drawTape(true); }); });
  }

  /* Karten-Ansicht: dieselben Karten wie Instagram-Karussell und PDF */
  var story = root.querySelector('.mb-story'), cards = [].slice.call(root.querySelectorAll('template[data-mb-card]'));
  var prog = story.querySelector('.mb-prog'), slide = story.querySelector('.mb-slide'), si = 0, raf = 0, t0 = 0, DUR = 7000, opener = null;
  prog.innerHTML = cards.map(function () { return '<span><i></i></span>'; }).join('');
  function show(i) {
    si = (i + cards.length) % cards.length;
    slide.innerHTML = ''; slide.appendChild(cards[si].content.cloneNode(true));
    [].forEach.call(prog.querySelectorAll('i'), function (b, k) { b.style.width = k < si ? '100%' : '0'; });
    t0 = performance.now();
  }
  function tick(t) {
    if (story.hidden) return;
    var k = (t - t0) / DUR, bar = prog.querySelectorAll('i')[si];
    if (!reduce && bar) bar.style.width = Math.min(100, k * 100) + '%';
    if (k >= 1 && !reduce) { if (si === cards.length - 1) { close(); return; } show(si + 1); }
    raf = requestAnimationFrame(tick);
  }
  function open(i) { if (!cards.length) return; opener = document.activeElement; story.hidden = false; document.documentElement.style.overflow = 'hidden'; show(i || 0); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); story.querySelector('.mb-hit.r').focus(); }
  function close() { story.hidden = true; document.documentElement.style.overflow = ''; cancelAnimationFrame(raf); if (opener && opener.focus) opener.focus(); }
  [].forEach.call(root.querySelectorAll('[data-mb-play]'), function (b) { b.addEventListener('click', function () { open(0); }); });
  story.querySelector('.mb-hit.r').addEventListener('click', function () { show(si + 1); });
  story.querySelector('.mb-hit.l').addEventListener('click', function () { show(si - 1); });
  story.querySelector('.mb-x').addEventListener('click', close);
  story.addEventListener('click', function (e) { if (e.target === story) close(); });
  document.addEventListener('keydown', function (e) {
    if (story.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(si + 1); else if (e.key === 'ArrowLeft') show(si - 1);
  });
})();
