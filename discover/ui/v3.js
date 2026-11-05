/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/v3.js        Redesign 2027 (Folien D01–D08)

   Vorlage: docs/design/redesign-2027/HANDOVER.md, Kapitel „02 · Discover“,
   Mockups worlds/02-discover.js. Bausteine aus assets/vu-ui.js (VUUI) und
   der eine Chart (assets/vu-chart.js, hier als Kurslinie VUChart.sparkline).

   Diese Datei liegt bewusst NICHT unter den gezaehlten Startseiten-Dateien
   (discover/(app|home|detail|themes).(js|css), Budget 180 KB): app.js und
   home.js rufen nur noch die Ansichten von hier auf.

   Regeln: nur Weiss, Schwarz, Neongruen und drei Graustufen; Plus ist die
   neongruene Pille ▲, Minus die schwarze ▼. Keine erfundenen Zahlen: fehlt
   ein Wert, sagt die Seite es. Alles, was aus Daten kommt, laeuft durch
   VUUI.esc, bevor es in Markup steht.
   ========================================================================= */
(function (global) {
  'use strict';
  var D = global.VUDiscover = global.VUDiscover || {};
  var BASE = '/discover/data/';
  function S() { return global.QuantShell; }
  function U() { return global.VUUI; }
  function esc(s) { return U().esc(s); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function val(f) { return f && typeof f === 'object' ? f.value : (isNum(f) ? f : null); }
  function h(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function load(url) { return S().loadJSON(url); }
  function uid(ctx) { return (ctx && ctx.universeId) || 'US_REAL'; }
  function stockHref(ctx, s) { return '#/s/' + uid(ctx) + '/' + encodeURIComponent(s); }
  function num(v, d) { return U().num(v, d); }

  /* ------------------------------------------------------------ Datum */
  var DAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  function day(iso) { var t = String(iso || ''); return t.length < 10 ? '' : t.slice(8, 10) + '.' + t.slice(5, 7) + '.'; }
  function dayYear(iso) { var t = String(iso || ''); return t.length < 10 ? '' : t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(2, 4); }
  function weekday(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return isNaN(d) ? '' : DAYS[d.getUTCDay()]; }
  function closeLabel(iso) { return iso ? 'Schluss ' + weekday(iso) + ' ' + day(iso) : ''; }

  /* ------------------------------------------------------------ Namen */
  var TITLES = {
    'im-blick': 'Heute im Blick', 'new-52-week-highs': 'Neue Jahreshochs', 'market-leaders': 'Die stärksten Aktien',
    'sp500-staerkste': 'Stärkste im S&P 500', 'ndx-staerkste': 'Stärkste im Nasdaq-100', 'djia-staerkste': 'Stärkste im Dow Jones',
    'momentum-leaders': 'Seit Monaten im Aufwind', 'breakout-watch': 'Gerade in Bewegung', 'relative-strength': 'Dem Markt voraus',
    'trend-quality': 'Stabile Aufwärtstrends', 'bekannte-namen': 'Bekannte Namen in Bewegung', 'comeback': 'Comeback?',
    'ueberraschungen': 'Überraschungen', 'umsatz-waechst-stark': 'Umsatz wächst stark', 'gewinne-beschleunigen': 'Gewinne beschleunigen',
    'margen-werden-staerker': 'Margen werden stärker', 'cashflow-maschinen': 'Cashflow-Maschinen', 'qualitaet-wachstum': 'Qualität + Wachstum',
    'langfristige-compounder': 'Langfristige Compounder', 'profitables-wachstum': 'Profitables Wachstum',
    'fundamentale-turnarounds': 'Fundamentale Turnarounds', 'qualitaet-zum-preis': 'Qualität zum vernünftigen Preis',
    'starke-bilanz-wachstum': 'Starke Bilanz + Wachstum', 'sector-leaders': 'Die stärksten je Branche'
  };
  /* D04: vier Gruppen. Bis die Row-Registry ein Feld „group“ traegt, steht die Zuordnung hier (HANDOVER D04 „Daten“). */
  var GROUPS = [
    { id: 'bewegung', chip: 'Bewegung', title: 'Was gerade passiert', sub: 'Kurs bewegt sich auffällig', icon: 'line',
      rows: ['im-blick', 'new-52-week-highs', 'breakout-watch', 'bekannte-namen', 'ueberraschungen', 'comeback'] },
    { id: 'staerke', chip: 'Stärke', title: 'Stärke über Monate', sub: 'Kurs läuft besser als der Markt', icon: 'target',
      rows: ['market-leaders', 'sp500-staerkste', 'ndx-staerkste', 'djia-staerkste', 'momentum-leaders', 'relative-strength', 'trend-quality'] },
    { id: 'geschaeft', chip: 'Geschäft', title: 'Das Geschäft wächst', sub: 'Zahlen aus SEC-Berichten', icon: 'book',
      rows: ['umsatz-waechst-stark', 'gewinne-beschleunigen', 'margen-werden-staerker', 'cashflow-maschinen', 'profitables-wachstum', 'fundamentale-turnarounds'] },
    { id: 'qualitaet', chip: 'Qualität', title: 'Qualität', sub: 'Gute Firma, solide Basis', icon: 'check',
      rows: ['qualitaet-wachstum', 'langfristige-compounder', 'qualitaet-zum-preis', 'starke-bilanz-wachstum'] }
  ];
  var SEC_ROWS = GROUPS[2].rows.concat(GROUPS[3].rows);
  function groupOf(rowId) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].rows.indexOf(rowId) >= 0) return GROUPS[i]; return null; }
  function rowTitle(row) {
    var id = row && (row.rowId || row.id);
    if (TITLES[id]) return TITLES[id];
    var V = D.Views || {};
    return V.Home && V.Home.title ? V.Home.title(row && row.title) : String((row && row.title) || '');
  }
  function shortLine(text) { return String(text || '').split(' — ')[0].replace(/\s*\.$/, ''); }
  function metaRows(ctx) {
    var u = ((ctx.meta && ctx.meta.rows) || []).filter(function (r) { return r.universeId === uid(ctx); })[0];
    return (u && u.rows) || [];
  }
  function metaRow(ctx, rowId) { return metaRows(ctx).filter(function (r) { return r.rowId === rowId; })[0] || null; }
  function strategyRows(ctx) {
    var T = D.Views && D.Views.Themes;
    return metaRows(ctx).filter(function (r) { return r.returned > 0 && !(T && T.byRow(r.rowId)) && r.rowId !== 'sector-leaders'; });
  }

  /* ------------------------------------------------------- Karten-Bausteine */
  function name(c) { return c.displayName || c.companyName || c.symbol; }
  function story(c) { return (c.plain && c.plain.story) || c.was || c.symbol; }
  var SECTOR_DE = { 'Technology': 'Technologie', 'Health Care': 'Gesundheit', 'Healthcare': 'Gesundheit', 'Financials': 'Finanzen', 'Financial Services': 'Finanzen',
    'Consumer Discretionary': 'Zyklischer Konsum', 'Consumer Cyclical': 'Zyklischer Konsum', 'Consumer Staples': 'Basiskonsum', 'Consumer Defensive': 'Basiskonsum',
    'Industrials': 'Industrie', 'Energy': 'Energie', 'Utilities': 'Versorger', 'Real Estate': 'Immobilien', 'Materials': 'Rohstoffe', 'Basic Materials': 'Rohstoffe',
    'Communication Services': 'Kommunikation' };
  function what(c) { return c.was || SECTOR_DE[c.sector] || c.sector || ''; }
  /** Klartext-Zahl als Pille (Discover-Muster): Richtung aus dem Rohwert, Text unveraendert aus plain.zahl. */
  function zahlPill(c, big) {
    var z = c && c.plain && c.plain.zahl;
    if (!z || !z.wert) return '';
    var down = isNum(z.roh) ? z.roh < 0 : /^[−-]/.test(z.wert);
    return '<span class="vu-chg' + (down ? ' vu-chg--down' : '') + (big ? ' dv3-chg--hero' : '') + '"><span aria-hidden="true">' + (down ? '▼' : '▲') + '</span> ' + esc(String(z.wert).replace(/^[+−-]\s?/, down ? '−' : '+')) + '</span>';
  }
  function zahlLabel(c) {
    var z = c && c.plain && c.plain.zahl;
    return z && z.label ? String(z.label).replace(/^in (\d+) Monaten$/, function (m, n) { return n + ' Mon.'; }).replace(/ · (\d+) Jahre$/, function (m, n) { return ' · ' + n + ' J.'; }) : '';
  }
  function price(c) { var p = val(c.price); return isNum(p) ? (D.Cards && D.Cards.money ? D.Cards.money(p, c.asOf) : '–') : '–'; }

  /* Kurslinie (C06 klein): Punkte der Karte oder die Reihe hinter priceSeries.path, erst wenn sichtbar. */
  var io = null, pending = typeof Map === 'function' ? new Map() : null;
  function whenVisible(node, fn) {
    if (!global.IntersectionObserver || !pending) { fn(); return; }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target); var f = pending.get(e.target); pending.delete(e.target); if (f) f();
      });
    }, { rootMargin: '400px 400px' });
    pending.set(node, fn); io.observe(node);
  }
  function thin(points, max) {
    var v = (points || []).map(function (p) { return Array.isArray(p) ? p[1] : p; }).filter(isNum);
    if (max && v.length > max) { var step = (v.length - 1) / (max - 1), out = []; for (var i = 0; i < max; i++) out.push(v[Math.round(i * step)]); v = out; }
    return v;
  }
  function spark(c, o) {
    o = o || {};
    var host = h('span', 'dv3-spark' + (o.big ? ' dv3-spark--big' : ''));
    host.setAttribute('aria-hidden', 'true');
    var ps = c && c.priceSeries;
    function draw(points) {
      if (!global.VUChart || !points || points.length < 2) return;
      host.innerHTML = global.VUChart.sparkline(thin(points, o.big ? 130 : 50), { width: o.width || 74, height: o.height || 32 });
      if (o.onDates) o.onDates(points[0][0], points[points.length - 1][0]);
    }
    if (ps && ps.points && ps.points.length) draw(ps.points);
    else if (ps && ps.path && D.SeriesLoader) {
      var cached = D.SeriesLoader.peek(ps.path);
      if (cached) draw(cached.points);
      else (o.eager ? function (f) { f(); } : function (f) { whenVisible(host, f); })(function () { D.SeriesLoader.get(ps.path).then(function (r) { draw(r.points); }).catch(function () {}); });
    }
    return host;
  }
  /** Ranglistenzeile (Discover-Muster): Rang, Logo, Name, Satz, Klartext-Zahl. */
  function rankRow(c, i, ctx) {
    var a = h('a', 'dv3-rank' + (i == null ? ' dv3-rank--norank' : ''));
    a.href = stockHref(ctx, c.symbol); a.dataset.symbol = c.symbol;
    a.innerHTML = (i == null ? '' : '<span class="dv3-rank__n">' + (i + 1) + '</span>') + U().logo(c.symbol) +
      '<span class="dv3-rank__name"><b>' + esc(name(c)) + '</b><span>' + esc(story(c)) + '</span></span>' +
      '<span class="dv3-rank__val">' + (zahlPill(c) || U().chg(null)) + '<small>' + esc(zahlLabel(c)) + '</small></span>';
    return a;
  }
  /** Aktienzeile (C10) mit Kurslinie; rechts Kurs + Tagesbewegung oder die Klartext-Zahl. */
  function stockRow(c, ctx, o) {
    o = o || {};
    var a = h('a', 'vu-lrow dv3-row'); a.href = stockHref(ctx, c.symbol); a.dataset.symbol = c.symbol;
    a.innerHTML = U().logo(c.symbol) + '<div class="vu-lrow__name"><b>' + esc(name(c)) + '</b><span>' + esc(o.sub != null ? o.sub : story(c)) + '</span></div><div class="vu-lrow__mini"></div>' +
      (o.zahl ? '<div class="vu-lrow__price dv3-zahl">' + (zahlPill(c) || U().chg(null)) + '<small>' + esc(zahlLabel(c)) + '</small></div>'
        : '<div class="vu-lrow__price"><span>' + esc(price(c)) + '</span>' + U().chg(val(c.changePercent)) + '</div>');
    a.querySelector('.vu-lrow__mini').appendChild(spark(c));
    return a;
  }
  function sect(title, right, href) {
    return '<div class="vu-sect"><h2>' + esc(title) + '</h2>' + (href ? '<a href="' + esc(href) + '">' + esc(right || 'Alle') + '</a>' : right ? '<span class="dv3-sect-note">' + esc(right) + '</span>' : '') + '</div>';
  }
  function helpBtn(text, label) {
    return '<button type="button" class="vu-help dv3-helpbtn" data-vu-help="' + esc(text) + '"><i aria-hidden="true">?</i><span>' + esc(label || text) + '</span></button>';
  }

  /* ------------------------------------------------------------ Sheet (C16) */
  function sheet(title, body) {
    var old = document.getElementById('dv3-sheet'); if (old) { U().closeSheet(old); old.remove(); }
    var wrap = h('div'); wrap.innerHTML = U().sheet('dv3-sheet', title, '');
    var el = wrap.firstChild; el.classList.add('vu-ui', 'dv3');
    var b = el.querySelector('.vu-sheet-body');
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
    el.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-dv3-close]')) U().closeSheet(el); });
    document.body.appendChild(el); U().openSheet(el);
    return el;
  }
  var helpBound = false;
  function bindHelp() { if (!helpBound && U()) { U().bindHelp(document); helpBound = true; } }

  /* ------------------------------------------------------------ Merken */
  function store(ctx) { return ctx && typeof ctx.watch === 'function' ? ctx.watch() : null; }
  function heart(btn, ctx, symbol, label) {
    var st = store(ctx);
    if (!st) { btn.hidden = true; return; }
    function paint() { var on = st.has(symbol); btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', (label || symbol) + (on ? ' aus der Watchlist entfernen' : ' merken')); }
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); st.toggle(symbol); paint(); });
    paint();
  }

  /* ============================================================ D01 Start */
  var HOME_THEMES = ['kuenstliche-intelligenz', 'halbleiter-chips', 'erneuerbare-energien', 'biotechnologie', 'robotik-automation', 'cybersecurity', 'raumfahrt', 'kernenergie-uran'];
  var TOP_TABS = [['top-10', 'Alle'], ['top-sp500', 'S&P 500'], ['top-ndx', 'Nasdaq 100'], ['top-djia', 'Dow']];
  var TEASER_ROWS = ['umsatz-waechst-stark', 'qualitaet-wachstum', 'cashflow-maschinen'];

  function home(page, ctx) {
    bindHelp();
    var asof = page.querySelector('.dv3-asof');
    if (asof && ctx.asOf) asof.textContent = 'Discover · ' + closeLabel(ctx.asOf);
    var body = h('div', 'v2-journey dv3-home'); page.appendChild(body);
    var slot = {};
    ['markt', 'blick', 'themen', 'top', 'hochs', 'strat', 'namen', 'swipe'].forEach(function (k) { slot[k] = h('section', 'dv3-sec dv3-sec--' + k); body.appendChild(slot[k]); });
    marketToday(slot.markt, ctx);
    themesRail(slot.themen, ctx, 'Themenwelten', HOME_THEMES.map(function (s) { return D.Views.Themes.bySlug(s); }).filter(Boolean), true);
    strategyTeaser(slot.strat, ctx);
    slot.swipe.innerHTML = '<a class="dv3-swipecard" href="#/swipen">' + U().hud('discover', 46) + '<span><b>Aktien swipen, eine nach der anderen</b><span>Wische nach rechts zum Merken.</span></span>' + U().glyph('next', 22) + '</a>' +
      U().help((ctx.meta && ctx.meta.disclaimer) || 'Informationen zur eigenen Recherche, keine Anlageempfehlung.');
    var entry = ((ctx.meta && ctx.meta.home) || []).filter(function (x) { return x.universeId === uid(ctx); })[0];
    if (!entry || !entry.chunks || !entry.chunks.length) { slot.blick.innerHTML = U().blank('Die Aktien der Startseite sind gerade nicht verfügbar. Die Suche bleibt erreichbar.'); return function () {}; }
    slot.blick.innerHTML = sect('Heute im Blick') + '<p class="v2-load-state" role="status">Aktien werden geladen …</p>';
    var wait = new Promise(function (r) { setTimeout(r, 2500); });
    Promise.all([load(entry.chunks[0]), ctx.liveIndex, Promise.race([ctx.fxReady, wait])]).then(function (r) {
      if (!body.isConnected) return;
      var surfaces = r[0].surfaces || [], by = {};
      surfaces.forEach(function (s) { by[s.id] = s; });
      var hero = surfaces.filter(function (s) { return s.type === 'hero'; })[0];
      if (hero && (hero.cards || []).length) {
        var view = D.Featured && D.Featured.live ? D.Featured.live(hero, ctx, blickSection) : blickSection(hero, ctx);
        slot.blick.replaceWith(view); slot.blick = view;
      } else slot.blick.innerHTML = sect('Heute im Blick') + U().blank('Heute steht keine Aktie im Blick.');
      topList(slot.top, by, ctx);
      knownNames(slot.namen, by['bekannte-namen'], ctx);
      document.dispatchEvent(new Event('vu-home-drawn'));
      var next = entry.chunks[1];
      if (next) (D.Lazy ? D.Lazy.settled() : Promise.resolve()).then(function () { return body.isConnected ? load(next) : null; }).then(function (c) {
        if (c && body.isConnected) highs(slot.hochs, (c.surfaces || []).filter(function (s) { return s.id === 'new-52-week-highs'; })[0], ctx);
      }).catch(function () {});
    }).catch(function () {
      if (!body.isConnected) return;
      slot.blick.innerHTML = sect('Heute im Blick') + U().blank('Die Aktien konnten nicht geladen werden.');
      var retry = h('button', 'vu-btn vu-btn--line vu-btn--sm v2-load-more', 'Erneut versuchen'); retry.type = 'button';
      retry.onclick = function () { body.remove(); home(page, ctx); }; slot.blick.appendChild(retry);
    });
    return function () {};
  }

  /** Stufen-Skala 5 (Discover-Muster). */
  function scale5(env, ink) {
    var sc = (env.scale && env.scale.length ? env.scale : [{ label: 'Defensiv' }, { label: 'Vorsichtig' }, { label: 'Selektiv' }, { label: 'Konstruktiv' }, { label: 'Breit konstruktiv' }]);
    return '<ol class="dv3-scale' + (ink ? ' dv3-scale--ink' : '') + '" aria-label="Stufe ' + (env.level + 1) + ' von ' + sc.length + '">' + sc.map(function (s, i) {
      return '<li' + (i === env.level ? ' class="on" aria-current="true"' : '') + '><i></i><span>' + esc(String(s.label).replace('Breit konstruktiv', 'Breit konstr.')) + '</span></li>';
    }).join('') + '</ol>';
  }
  function barometerCard(env, o) {
    o = o || {};
    var n = (env.scale || []).length || 5;
    return '<p class="vu-ltag">Marktbarometer · US-Aktien</p><div class="dv3-baro__head"><b class="dv3-baro__word">' + esc(env.label) + '</b><span>Stufe ' + (env.level + 1) + ' von ' + n + '</span></div>' +
      (o.scaleFirst ? scale5(env, true) + '<p class="dv3-baro__text">' + esc(env.statement || '') + '</p>' : '<p class="dv3-baro__text">' + esc(env.statement || '') + '</p>' + scale5(env, true));
  }
  function marketToday(sec, ctx) {
    sec.innerHTML = sect('Der Markt heute', 'Märkte', '#/maerkte') + '<a class="vu-box vu-box--ink dv3-baro" href="#/maerkte" aria-label="Marktbarometer, Märkte ansehen"><p class="vu-ltag">Marktbarometer · US-Aktien</p><p class="dv3-baro__text">Wird geladen …</p></a>' +
      '<div class="vu-grid dv3-idx" style="--vu-cols:3"></div>' + U().help('Gemessen an den Fonds QQQ, SPY und DIA, die den Index nachbilden. Nicht der offizielle Indexstand.');
    var baro = sec.querySelector('.dv3-baro'), grid = sec.querySelector('.dv3-idx');
    load('/quant/data/market/intelligence/market-pulse.json').then(function (p) {
      var env = p && p.environment;
      if (!sec.isConnected) return;
      if (!env || !isNum(env.level)) { baro.innerHTML = '<p class="vu-ltag">Marktbarometer · US-Aktien</p><p class="dv3-baro__text">Heute keine Einordnung möglich.</p>'; return; }
      baro.innerHTML = barometerCard(env);
    }).catch(function () { if (sec.isConnected) baro.querySelector('.dv3-baro__text').textContent = 'Das Marktbarometer ist gerade nicht verfügbar.'; });
    Promise.all([load('/quant/data/market/multi-asset/snapshot.json'), load('/quant/config/multi-asset.json').catch(function () { return null; })]).then(function (r) {
      if (!sec.isConnected) return;
      var MA = global.VUMultiAssetContract, HM = D.HomeMarket, NAMES = { QQQ: 'Nasdaq 100', SPY: 'S&P 500', DIA: 'Dow Jones' };
      ['QQQ', 'SPY', 'DIA'].forEach(function (symbol) {
        var raw = (r[0].instruments || []).filter(function (c) { return c.instrument && c.instrument.symbol === symbol; })[0]; if (!raw) return;
        var c = MA && MA.refresh ? MA.refresh(raw, { now: new Date(), calendar: ctx.calendar, config: r[1] || {} }) : raw;
        var ch = c.quote && c.quote.state === 'AVAILABLE' && c.quote.change ? c.quote.change.percent : null;
        var a = h('a', 'vu-tile dv3-idx__tile'); a.href = '#/maerkte/' + symbol;
        a.innerHTML = '<span class="vu-tile__label">' + esc(NAMES[symbol]) + '</span><span class="dv3-idx__spark"></span>' + U().chg(ch);
        grid.appendChild(a);
        var src = HM && HM.sparkSource ? HM.sparkSource(raw) : null;
        function draw(points) { if (a.isConnected && global.VUChart) a.querySelector('.dv3-idx__spark').innerHTML = global.VUChart.sparkline(thin((points || []).slice(-30)), { width: 90, height: 28 }); }
        if (src && src.points) draw(src.points); else if (src && src.path) load(src.path).then(function (s) { draw(s.points); }).catch(function () {});
      });
      if (!grid.children.length) grid.outerHTML = U().blank('Marktstände sind gerade nicht verfügbar.');
    }).catch(function () { if (grid.isConnected) grid.outerHTML = U().blank('Marktstände sind gerade nicht verfügbar.'); });
  }

  /* Heute im Blick: eine grosse Karte je Aktie, seitlich wischbar, Punkte 1 von N. */
  function blickSection(surface, ctx) {
    var cards = (surface.cards || []).slice(0, 5);
    var sec = h('section', 'dv3-sec dv3-sec--blick v2-spotlight');
    sec.innerHTML = sect('Heute im Blick', '1 von ' + cards.length);
    var track = h('div', 'v2-hero-track dv3-snap'); track.setAttribute('role', 'list'); track.setAttribute('aria-label', 'Heute im Blick');
    cards.forEach(function (c, i) { track.appendChild(blickCard(c, ctx, i, surface)); });
    var dots = h('div', 'dv3-dots', cards.map(function (_, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join(''));
    dots.setAttribute('aria-hidden', 'true');
    var note = sec.querySelector('.dv3-sect-note'), raf = 0;
    track.addEventListener('scroll', function () {
      if (raf) return;
      raf = global.requestAnimationFrame(function () {
        raf = 0; var first = track.firstElementChild; if (!first) return;
        var i = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / (first.offsetWidth + 12))));
        if (note) note.textContent = (i + 1) + ' von ' + cards.length;
        Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k === i ? 'on' : ''; });
      });
    }, { passive: true });
    sec.append(track, dots);
    return sec;
  }
  function blickCard(c, ctx, i, surface) {
    var art = h('article', 'vu-box dv3-blick'); art.dataset.symbol = c.symbol; art.setAttribute('role', 'listitem');
    var reasons = ((c.imBlick && c.imBlick.reasons) || c.reasons || []).slice(0, 3);
    art.innerHTML = '<div class="dv3-blick__head">' + U().logo(c.symbol, { xl: true }) + '<div class="dv3-blick__id"><b>' + esc(name(c)) + '</b><span>' + esc([c.symbol, what(c)].filter(Boolean).join(' · ')) + '</span></div>' +
      '<button type="button" class="vu-round dv3-heart">' + U().glyph('heart') + '</button></div>' +
      '<div class="dv3-klar">' + zahlPill(c, true) + '<span>' + esc(c.plain && c.plain.zahl ? c.plain.zahl.label : '') + '</span></div>' +
      '<h3 class="dv3-story">' + esc(story(c)) + '</h3><div class="dv3-chart"></div><div class="dv3-dates"><span></span><span></span></div>' +
      (reasons.length ? '<p class="vu-ltag dv3-why-t">Warum heute?</p><div class="dv3-reasons">' + reasons.map(function (r, k) { return '<span class="vu-chip' + (k ? '' : ' vu-chip--lime') + '">' + esc(r.label + ': ' + r.value) + '</span>'; }).join('') + '</div>' : '') +
      '<button type="button" class="vu-help dv3-helpbtn dv3-why"><i aria-hidden="true">?</i><span>Warum steht diese Aktie hier?</span></button>' +
      '<div class="dv3-actions"><a class="vu-btn vu-btn--ink dv3-open" href="' + esc(stockHref(ctx, c.symbol)) + '">Aktie ansehen</a><a class="vu-btn" href="#/swipen">Swipen</a></div>';
    var dates = art.querySelectorAll('.dv3-dates span');
    art.querySelector('.dv3-chart').appendChild(spark(c, { big: true, width: 320, height: 110, onDates: function (a, b) { dates[0].textContent = dayYear(a); dates[1].textContent = dayYear(b); } }));
    heart(art.querySelector('.dv3-heart'), ctx, c.symbol, name(c));
    art.querySelector('.dv3-why').addEventListener('click', function () { whySheet(c, ctx, surface); });
    return art;
  }
  /** Sheet „Warum steht diese Aktie hier?“ (d01-b): die Gruende mit ihren Werten, wie geliefert. */
  function whySheet(c, ctx, surface) {
    var reasons = (c.imBlick && c.imBlick.reasons) || c.reasons || [];
    var m = c.metrics || {}, rows = reasons.map(function (r) { return [r.label, r.value, '']; });
    if (isNum(m.return6M)) rows.push(['Seit 6 Monaten', 'Kursbewegung', U().chg(m.return6M * 100, { digits: 0 })]);
    if (c.hook && c.hook.text) rows.push(['Geschäft', c.hook.text + ' (SEC)', '']);
    var cfg = ((ctx.meta && ctx.meta.rowConfigs) || []).filter(function (x) { return x.id === 'im-blick'; })[0];
    var score = c.imBlick && isNum(c.imBlick.score) ? Math.round(c.imBlick.score) : null;
    var body = '<p class="vu-ltag">' + esc((surface && surface.live ? 'Heute im Blick · laufende Sitzung' : 'Heute im Blick') + ' · ' + name(c)) + '</p>' +
      '<p class="vu-lead">Feste Regeln, kein Bauchgefühl. Jeder Punkt zählt zur Wertung „Heute im Blick“.</p>' +
      '<div class="vu-box dv3-list">' + rows.map(function (r) { return '<div class="dv3-kv"><span><b>' + esc(r[0]) + '</b><small>' + esc(r[1]) + '</small></span>' + r[2] + '</div>'; }).join('') + '</div>' +
      (score != null ? U().help('Wertung ' + score + ' von 100. ' + (cfg && /70 %/.test(cfg.rule || '') ? '70 % Ereignisse des letzten Handelstags, 30 % Stärke über 12 Monate.' : '')) : '') +
      '<a class="vu-btn vu-btn--ink vu-btn--block" href="' + esc(stockHref(ctx, c.symbol)) + '" data-dv3-close>Aktie ansehen</a>';
    sheet('Warum steht diese Aktie hier?', body);
  }
  function themeCard(t, ctx, o) {
    o = o || {};
    var count = D.Views.Themes.count(t, ctx.meta, uid(ctx));
    var a = h('a', 'dv3-theme' + (o.big ? ' dv3-theme--big' : '')); a.href = D.Views.Themes.href(t); a.dataset.theme = t.slug; a.dataset.group = t.group;
    a.innerHTML = (t.photo ? '<img src="' + esc(t.photo) + '" alt="" loading="lazy" decoding="async" width="1672" height="941">' : '') +
      '<span class="dv3-theme__copy"><b>' + esc(t.title) + '</b><span>' + esc(t.line + (count ? ' · ' + count + ' Aktien' : '')) + '</span></span>';
    var img = a.querySelector('img'); if (img) img.addEventListener('error', function () { img.remove(); });
    return a;
  }
  function themesRail(sec, ctx, title, themes, home) {
    if (!themes.length) return;
    sec.innerHTML = sect(title, home ? 'Alle ' + D.Views.Themes.all.length : '', home ? '#/welten' : '');
    var track = h('div', 'dv3-rail'); track.setAttribute('role', 'list'); track.setAttribute('aria-label', title);
    themes.forEach(function (t) { var c = themeCard(t, ctx); c.setAttribute('role', 'listitem'); track.appendChild(c); });
    sec.appendChild(track);
  }
  function topList(sec, by, ctx) {
    var tabs = TOP_TABS.filter(function (t) { return by[t[0]] && (by[t[0]].cards || []).length; });
    if (!tabs.length) { sec.remove(); return; }
    sec.innerHTML = sect('Die stärksten Aktien', 'Alle', '#/strategien/' + (by[tabs[0][0]].rowId || 'market-leaders')) + U().seg(tabs.map(function (t) { return { id: t[0], label: t[1] }; }), tabs[0][0], { tabs: true, label: 'Rangliste' }) +
      '<div class="dv3-list dv3-top" role="tabpanel"></div>' + U().help('„Stark“ heißt hier: Der Kurs lief über Monate besser als der Rest. Das sagt nichts über die Zukunft.');
    var list = sec.querySelector('.dv3-top'), more = sec.querySelector('.vu-sect a');
    function show(id) {
      var s = by[id]; list.replaceChildren();
      (s.cards || []).slice(0, 4).forEach(function (c, i) { list.appendChild(rankRow(c, i, ctx)); });
      more.setAttribute('href', '#/strategien/' + (s.rowId || id));
      Array.prototype.forEach.call(sec.querySelectorAll('.vu-seg button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.id === id)); b.tabIndex = b.dataset.id === id ? 0 : -1; });
    }
    sec.querySelector('.vu-seg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.id); });
    show(tabs[0][0]);
  }
  function highs(sec, s, ctx) {
    if (!s || !(s.cards || []).length) return;
    var m = metaRow(ctx, 'new-52-week-highs');
    sec.innerHTML = '<div class="vu-sect"><h2>Neue Jahreshochs</h2><a href="#/strategien/new-52-week-highs">' + (m && m.matched ? esc(num(m.matched, 0)) + ' Treffer' : 'Alle') + '</a></div><div class="vu-box dv3-list"></div>';
    var list = sec.querySelector('.dv3-list');
    s.cards.slice(0, 3).forEach(function (c, i) { list.appendChild(rankRow(c, i, ctx)); });
  }
  function strategyTeaser(sec, ctx) {
    var rows = TEASER_ROWS.map(function (id) { return metaRow(ctx, id); }).filter(Boolean);
    if (!rows.length) { sec.remove(); return; }
    sec.innerHTML = sect('Strategien', 'Alle ' + strategyRows(ctx).length, '#/strategien') + '<div class="vu-stack">' + rows.map(function (r) {
      var g = groupOf(r.rowId);
      return U().navcard({ href: '#/strategien/' + r.rowId, glyph: g ? g.icon : 'list', title: rowTitle(r), sub: (r.matched ? num(r.matched, 0) + ' Aktien · ' : '') + shortLine(r.subtitle) });
    }).join('') + '</div>';
  }
  function knownNames(sec, s, ctx) {
    if (!s || !(s.cards || []).length) { sec.remove(); return; }
    sec.innerHTML = sect('Bekannte Namen in Bewegung', 'Alle', '#/strategien/bekannte-namen');
    var list = h('div', 'dv3-list'); sec.appendChild(list);
    s.cards.slice(0, 3).forEach(function (c) { list.appendChild(stockRow(c, ctx)); });
  }

  /* ============================================================ D02 Welten */
  var BEREICHE = [['t', 'Technologie', 'Technologie & Vernetzung'], ['h', 'Gesundheit', 'Gesundheit'], ['e', 'Energie & Rohstoffe', 'Energie & Rohstoffe'],
    ['i', 'Industrie', 'Industrie & Infrastruktur'], ['f', 'Finanzen', 'Finanzen & Immobilien'], ['c', 'Konsum', 'Konsum & Mobilität']];
  function bereich(id) { return BEREICHE.filter(function (b) { return b[0] === id; })[0] || [id, id, id]; }
  function welten(root, ctx) {
    bindHelp();
    var T = D.Views.Themes, all = T.all;
    document.title = 'Themenwelten — Discover — Vision Universe®';
    var page = h('div', 'dv3 vu-ui dv3-welten');
    page.innerHTML = '<p class="vu-ltag">Discover · Welten</p><h1 class="vu-lt">Themenwelten</h1><p class="vu-lead">' + all.length + ' Megatrends und Branchen. Tippe ein Thema und sieh, welche Firmen dahinter stehen.</p>' +
      '<label class="vu-find dv3-find">' + U().glyph('search', 18) + '<input type="search" placeholder="Thema suchen, z. B. Uran …" aria-label="Thema suchen" autocomplete="off"></label>' +
      '<div class="vu-chips dv3-chips" role="group" aria-label="Bereiche"><button type="button" class="vu-chip" data-g="" aria-pressed="true">Alle</button>' +
      BEREICHE.map(function (b) { return '<button type="button" class="vu-chip" data-g="' + b[0] + '" aria-pressed="false">' + esc(b[1]) + '</button>'; }).join('') + '</div><div class="dv3-welten__body"></div>' +
      U().help('Themenwelten sind eine redaktionelle Zuordnung: Wer zum Thema gehört, entscheidet die Redaktion. Die Reihenfolge folgt der Discover-Methodik.');
    root.appendChild(page);
    var out = page.querySelector('.dv3-welten__body'), input = page.querySelector('input'), group = '';
    function row(t, thumb) {
      var count = T.count(t, ctx.meta, uid(ctx));
      var a = h('a', 'dv3-trow' + (thumb ? ' dv3-trow--thumb' : '')); a.href = T.href(t); a.dataset.theme = t.slug; a.dataset.group = t.group;
      a.innerHTML = (thumb ? (t.photo ? '<img src="' + esc(t.photo) + '" alt="" loading="lazy" decoding="async" width="56" height="56">' : U().hud('discover', 56)) : '') +
        '<span class="dv3-trow__t"><b>' + esc(t.title) + '</b>' + (thumb ? '<span>' + esc(t.short + ' · ' + t.line) + '</span>' : '') + '</span><span class="dv3-trow__n">' + (count ? count + ' Aktien' : 'In Vorbereitung') + '</span>' + U().glyph('next', 16);
      return a;
    }
    function draw() {
      var q = input.value.trim().toLowerCase();
      out.replaceChildren();
      Array.prototype.forEach.call(page.querySelectorAll('.dv3-chips button'), function (b) {
        var on = b.dataset.g === group; b.setAttribute('aria-pressed', String(on));
        var label = b.dataset.g ? bereich(b.dataset.g)[1] : 'Alle';
        b.textContent = on && b.dataset.g ? label + ' · ' + all.filter(function (t) { return t.group === b.dataset.g; }).length : label;
      });
      if (q || group) {
        var hits = all.filter(function (t) { return (!group || t.group === group) && (!q || (t.title + ' ' + t.short + ' ' + t.line).toLowerCase().indexOf(q) >= 0); });
        var list = h('div', 'dv3-tlist'); hits.forEach(function (t) { list.appendChild(row(t, true)); });
        out.appendChild(hits.length ? list : h('div', '', U().blank('Kein Thema passt zu „' + esc(input.value) + '“.')));
        return;
      }
      var big = T.bySlug('kuenstliche-intelligenz');
      if (big) { var b = themeCard(big, ctx, { big: true }); out.appendChild(b); }
      BEREICHE.forEach(function (g) {
        var themes = all.filter(function (t) { return t.group === g[0] && t !== big; });
        if (!themes.length) return;
        var sec = h('section', 'dv3-sec'); sec.id = 'v2-group-' + g[0];
        sec.innerHTML = sect(g[2], all.filter(function (t) { return t.group === g[0]; }).length + ' Themen');
        var grid = h('div', 'vu-grid dv3-tgrid'), rest = h('div', 'vu-box dv3-tlist dv3-tlist--plain');
        themes.forEach(function (t, i) { if (i < 4 && t.photo) grid.appendChild(themeCard(t, ctx)); else rest.appendChild(row(t, false)); });
        sec.appendChild(grid); if (rest.children.length) sec.appendChild(rest);
        out.appendChild(sec);
      });
    }
    page.querySelector('.dv3-chips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; group = b.dataset.g === group ? '' : b.dataset.g; draw(); });
    input.addEventListener('input', draw);
    draw();
  }

  /* ============================================================ D03 Thema */
  var SORTS = [['staerke', 'Stärke (Vorgabe)', 'Stärke'], ['m12', 'Bewegung 12 Monate', '12 Monate'], ['heute', 'Bewegung heute', 'Heute'], ['umsatz', 'Umsatzwachstum', 'Umsatz'], ['name', 'Name A–Z', 'Name']];
  function metric(c, k) { var v = c.metrics && c.metrics[k]; return isNum(v) ? v : null; }
  async function thema(root, ctx, theme, active) {
    bindHelp();
    var T = D.Views.Themes, b = bereich(theme.group);
    document.title = theme.title + ' — Discover';
    var row = theme.rowId ? await load(BASE + 'rows/' + uid(ctx) + '/' + theme.rowId + '.json').catch(function () { return null; }) : null;
    if (!active()) return;
    var cards = (row && row.cards) || [], n = cards.length;
    var page = h('div', 'dv3 vu-ui dv3-thema');
    var lead = row && row.subtitle ? shortLine(row.subtitle) : theme.short + ' · ' + theme.line;
    page.innerHTML = '<a class="v2-back dv3-back" href="#/welten">' + U().glyph('back', 16) + ' Themenwelten</a>' +
      '<header class="dv3-themehead">' + (theme.photo ? '<img src="' + esc(theme.photo) + '" alt="" decoding="async" width="1672" height="941">' : '') +
      '<div><p class="vu-ltag">Themenwelt · ' + esc(b[1]) + '</p><h1>' + esc(theme.title) + '</h1><p>' + esc(lead) + '</p></div></header>';
    root.appendChild(page);
    if (!n) {
      page.insertAdjacentHTML('beforeend', U().blank('Die Aktienauswahl dieser Themenwelt entsteht gerade. Einzelne Unternehmen findest du über die Suche.'));
      relatedThemes(page, ctx, theme); return;
    }
    if (D.memory) D.memory.recordCollection(row.rowId || theme.rowId);
    var up12 = cards.filter(function (c) { return metric(c, 'return12M') > 0; }).length, has12 = cards.filter(function (c) { return metric(c, 'return12M') != null; }).length;
    var upToday = cards.filter(function (c) { return val(c.changePercent) > 0; }).length, hasToday = cards.filter(function (c) { return isNum(val(c.changePercent)); }).length;
    page.insertAdjacentHTML('beforeend', '<div class="vu-grid dv3-tiles" style="--vu-cols:3">' + U().tile('Aktien', String(n), 'im Thema') +
      U().tile('12 Monate', has12 ? up12 + ' / ' + has12 : '–', 'im Plus') + U().tile('Heute', hasToday ? upToday + ' / ' + hasToday : '–', 'im Plus') + '</div>' +
      U().help('„' + up12 + ' / ' + has12 + ' im Plus“: ' + up12 + ' der ' + has12 + ' Firmen stehen heute höher als vor einem Jahr.') +
      '<div class="vu-sect"><h2>Die Firmen</h2><button type="button" class="vu-chip dv3-sortbtn">' + U().glyph('filter', 16) + '<span>Stärke</span></button></div><div class="dv3-list dv3-firms"></div>');
    var list = page.querySelector('.dv3-firms'), state = { sort: 'staerke', plus: false, profit: false, watch: false, all: false };
    var more = h('button', 'vu-btn vu-btn--line vu-btn--block dv3-more'); more.type = 'button';
    list.after(more);
    function visible() {
      var st = store(ctx), xs = cards.filter(function (c) {
        return (!state.plus || metric(c, 'return12M') > 0) && (!state.profit || metric(c, 'f_netMargin') > 0) && (!state.watch || (st && st.has(c.symbol)));
      });
      var key = { m12: function (c) { return metric(c, 'return12M'); }, heute: function (c) { return val(c.changePercent); }, umsatz: function (c) { return metric(c, 'f_revenueGrowth3y'); } }[state.sort];
      if (key) xs = xs.slice().sort(function (a, b) { var x = key(a), y = key(b); return (y == null ? -Infinity : y) - (x == null ? -Infinity : x); });
      if (state.sort === 'name') xs = xs.slice().sort(function (a, b) { return name(a).localeCompare(name(b), 'de'); });
      return xs;
    }
    function draw() {
      var xs = visible(), shown = state.all ? xs : xs.slice(0, 15);
      list.replaceChildren();
      shown.forEach(function (c) { list.appendChild(stockRow(c, ctx, { zahl: true })); });
      if (!xs.length) list.innerHTML = U().blank('Keine Firma erfüllt diesen Filter.');
      more.hidden = xs.length <= shown.length; more.textContent = 'Alle ' + xs.length + ' zeigen';
      page.querySelector('.dv3-sortbtn span').textContent = SORTS.filter(function (s) { return s[0] === state.sort; })[0][2] + (state.plus || state.profit || state.watch ? ' · gefiltert' : '');
    }
    more.addEventListener('click', function () { state.all = true; draw(); });
    page.querySelector('.dv3-sortbtn').addEventListener('click', function () {
      var box = h('div', 'dv3-sortsheet');
      box.innerHTML = '<p class="vu-ltag">Reihenfolge</p>' + SORTS.map(function (s) { return '<label class="dv3-opt"><span>' + esc(s[1]) + '</span><input type="radio" name="dv3-sort" value="' + s[0] + '"' + (state.sort === s[0] ? ' checked' : '') + '></label>'; }).join('') +
        '<p class="vu-ltag">Nur zeigen</p>' + [['plus', 'Über 12 Monate im Plus'], ['profit', 'Schreibt Gewinn']].concat(store(ctx) ? [['watch', 'Auf meiner Watchlist']] : []).map(function (f) {
          return '<label class="dv3-opt"><span>' + esc(f[1]) + '</span><input type="checkbox" role="switch" class="vu-switch" name="' + f[0] + '"' + (state[f[0]] ? ' checked' : '') + '></label>';
        }).join('') + '<button type="button" class="vu-btn vu-btn--block" data-dv3-close></button>';
      var go = box.querySelector('[data-dv3-close]');
      function preview() { var s = Object.assign({}, state); readSheet(box, s); var keep = state; state = s; var k = visible().length; state = keep; go.textContent = k + ' Aktien zeigen'; }
      function readSheet(b, s) { var r = b.querySelector('input[name=dv3-sort]:checked'); if (r) s.sort = r.value; ['plus', 'profit', 'watch'].forEach(function (k) { var x = b.querySelector('input[name=' + k + ']'); s[k] = !!(x && x.checked); }); }
      box.addEventListener('change', preview);
      go.addEventListener('click', function () { readSheet(box, state); draw(); });
      preview();
      sheet('Sortieren und filtern', box);
    });
    draw();
    relatedThemes(page, ctx, theme);
    page.insertAdjacentHTML('beforeend', U().help('Redaktionelle Zuordnung. Die Reihenfolge „Stärke“ folgt der Discover-Methodik, nicht einer Empfehlung.' + (row.asOf ? ' Stand ' + dayYear(row.asOf) + '.' : '')));
  }
  function relatedThemes(page, ctx, theme) {
    var sec = h('section', 'dv3-sec');
    themesRail(sec, ctx, 'Verwandte Themen', D.Views.Themes.all.filter(function (t) { return t !== theme && t.group === theme.group; }).slice(0, 8), false);
    if (sec.children.length) page.appendChild(sec);
  }

  /* ============================================================ D04 Strategien */
  function strategien(root, ctx) {
    bindHelp();
    document.title = 'Strategien — Discover — Vision Universe®';
    var rows = strategyRows(ctx), by = {};
    rows.forEach(function (r) { by[r.rowId] = r; });
    var page = h('div', 'dv3 vu-ui dv3-strategien'), blick = by['im-blick'];
    page.innerHTML = '<p class="vu-ltag">Discover · Strategien</p><h1 class="vu-lt">Strategien</h1><p class="vu-lead">' + rows.length + ' Auswahlen mit festen Regeln. Jede zeigt, wie viele Aktien die Regel heute erfüllen.</p>' +
      '<div class="vu-chips dv3-chips" role="group" aria-label="Gruppen"><button type="button" class="vu-chip" data-g="" aria-pressed="true">Alle ' + rows.length + '</button>' +
      GROUPS.map(function (g) { return '<button type="button" class="vu-chip" data-g="' + g.id + '" aria-pressed="false">' + esc(g.chip) + '</button>'; }).join('') + '</div>' +
      (blick ? '<a class="vu-box vu-box--ink dv3-feature" href="#/strategien/im-blick">' + U().hud('discover', 46) + '<span><span class="vu-ltag">Täglich neu</span><b>Heute im Blick</b><span>' +
        (blick.matched ? esc(num(blick.matched, 0)) + ' Aktien haben sich' + (ctx.asOf ? ' am ' + esc(day(ctx.asOf)) : '') + ' auffällig bewegt.' : esc(shortLine(blick.subtitle))) + '</span></span>' + U().glyph('next', 20) + '</a>' : '') +
      '<div class="dv3-groups"></div>' + U().help('Treffer: so viele der ' + (ctx.universeSize ? num(ctx.universeSize, 0) + ' ' : '') + 'US-Aktien erfüllen die Regel heute. Gezeigt werden je Auswahl die stärksten.');
    root.appendChild(page);
    var host = page.querySelector('.dv3-groups'), placed = {};
    GROUPS.forEach(function (g) {
      var list = g.rows.map(function (id) { return by[id]; }).filter(Boolean);
      if (!list.length) return;
      var sec = h('section', 'dv3-sec dv3-sgroup'); sec.dataset.g = g.id;
      sec.innerHTML = '<div class="dv3-sgroup__head"><span class="vu-hud" style="--vu-hud:34px">' + U().glyph(g.icon, 18) + '</span><span><h2>' + esc(g.title) + '</h2><span>' + esc(g.sub) + ' · ' + list.length + ' Auswahlen</span></span></div>';
      var box = h('div', 'dv3-slist');
      list.forEach(function (r) {
        var a = h('a', 'dv3-srow'); a.href = '#/strategien/' + r.rowId; a.dataset.row = r.rowId;
        a.innerHTML = '<span class="dv3-srow__t"><b>' + esc(rowTitle(r)) + '</b><span>' + esc(shortLine(r.subtitle)) + '</span></span><span class="dv3-srow__n"><b>' + (r.matched ? esc(num(r.matched, 0)) + ' Treffer' : '–') + '</b><span class="dv3-nr1"></span></span>' + U().glyph('next', 16);
        placed[r.rowId] = a; box.appendChild(a);
      });
      sec.appendChild(box); host.appendChild(sec);
    });
    page.querySelector('.dv3-chips').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      Array.prototype.forEach.call(page.querySelectorAll('.dv3-chips button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      Array.prototype.forEach.call(host.children, function (s) { s.hidden = !!b.dataset.g && s.dataset.g !== b.dataset.g; });
    });
    /* Nr. 1 heute: die erste Karte jeder Auswahl steht in den Startseiten-Bloecken (dieselben Daten, kein Extra-Abruf je Auswahl). */
    var entry = ((ctx.meta && ctx.meta.home) || []).filter(function (x) { return x.universeId === uid(ctx); })[0];
    var chunks = (entry && entry.chunks) || [];
    function fill(surfaces) {
      (surfaces || []).forEach(function (s) {
        var id = s.type === 'hero' ? 'im-blick' : s.rowId, a = placed[id], c = s.cards && s.cards[0];
        if (a && c && !a.dataset.nr1 && !/^sektor-/.test(s.id || '')) { a.dataset.nr1 = c.symbol; a.querySelector('.dv3-nr1').textContent = 'Nr. 1: ' + c.symbol; }
      });
    }
    chunks.reduce(function (p, url) { return p.then(function () { return page.isConnected ? load(url).then(function (c) { if (page.isConnected) fill(c.surfaces); }) : null; }); }, Promise.resolve()).catch(function () {});
  }
  async function strategie(root, ctx, rowId, active) {
    bindHelp();
    if (!/^[a-zA-Z0-9_-]+$/.test(rowId)) throw Error('Ungültige Sammlung');
    var row = await load(BASE + 'rows/' + uid(ctx) + '/' + rowId + '.json');
    if (!active()) return;
    var page = h('div', 'dv3 vu-ui dv3-strategie'), g = groupOf(row.rowId || rowId), cov = row.coverage || {}, cards = row.cards || [];
    var title = rowTitle(row);
    document.title = title + ' — Discover';
    var sec = SEC_ROWS.indexOf(row.rowId || rowId) >= 0 || /SEC/.test(row.rule || '');
    page.innerHTML = '<a class="v2-back dv3-back" href="#/strategien">' + U().glyph('back', 16) + ' Strategien</a>' + (g ? '<p class="vu-ltag">' + esc(g.title) + '</p>' : '') +
      '<h1 class="vu-lt">' + esc(title) + '</h1><p class="vu-lead">' + esc(row.subtitle || '') + '</p>' +
      '<div class="vu-grid dv3-tiles" style="--vu-cols:3">' + U().tile('Treffer', isNum(cov.matched) ? num(cov.matched, 0) : '–', isNum(cov.universeSize) ? 'von ' + num(cov.universeSize, 0) : '') +
      U().tile('Gezeigt', String(cards.length), 'die stärksten') + U().tile('Quelle', sec ? 'SEC' : 'Kurse', sec ? 'Jahresberichte' : 'Tagesschluss') + '</div>' +
      (row.index && row.index.asOf ? '<p class="v2-collection-source vu-xs vu-mu">Mitglieder laut ' + esc(row.index.proxy && row.index.proxy.etf ? 'ETF-Bestand ' + row.index.proxy.etf : 'Indexeigentümer') + ' · ' + esc(dayYear(row.index.asOf)) + '</p>' : '') +
      (row.rule ? '<div class="vu-box vu-box--line dv3-rule"><p class="vu-ltag">Die Regel</p><p>' + esc(row.rule) + '</p></div>' : '') +
      (cov.note ? U().help(cov.note) : '') +
      '<div class="vu-sect"><h2>Die Treffer</h2></div><div class="dv3-list dv3-hits"></div>';
    root.appendChild(page);
    if (D.memory) D.memory.recordCollection(row.rowId || rowId);
    if (row.sectors && D.Surfaces) { page.querySelector('.dv3-hits').appendChild(D.Surfaces.sectors({ title: row.title, sectors: row.sectors }, ctx)); return; }
    var list = page.querySelector('.dv3-hits'), more = h('button', 'vu-btn vu-btn--line vu-btn--block dv3-more'); more.type = 'button';
    function draw(all) { list.replaceChildren(); (all ? cards : cards.slice(0, 5)).forEach(function (c, i) { list.appendChild(rankRow(c, i, ctx)); }); more.hidden = all || cards.length <= 5; more.textContent = 'Alle ' + cards.length + ' zeigen'; }
    more.addEventListener('click', function () { draw(true); });
    list.after(more); draw(false);
    if (!cards.length) list.innerHTML = U().blank('Heute erfüllt keine Aktie diese Regel.');
    page.insertAdjacentHTML('beforeend', '<div class="dv3-actions"><a class="vu-btn vu-btn--ink" href="#/swipen">' + U().glyph('grid', 18) + ' Einzeln swipen</a><a class="vu-btn vu-btn--line" href="/screener/">' + U().glyph('filter', 18) + ' Im Screener</a></div>' +
      U().help('Feste Regeln, nachgerechnet am ' + (row.asOf ? dayYear(row.asOf) : 'letzten Handelstag') + '. Keine Anlageempfehlung.'));
  }

  /* ============================================================ D05 Swipen */
  var GROWTH_ROWS = ['umsatz-waechst-stark', 'gewinne-beschleunigen', 'profitables-wachstum', 'qualitaet-wachstum', 'margen-werden-staerker', 'cashflow-maschinen', 'langfristige-compounder', 'fundamentale-turnarounds', 'starke-bilanz-wachstum'];
  var FILTERS = [['alle', 'Alle'], ['bekannt', 'Bekannte'], ['wachstum', 'Wachstum']];
  var INTRO_KEY = 'vu-discover-swipe-intro-v1';
  async function swipen(root, ctx, active) {
    bindHelp();
    document.title = 'Swipen — Discover — Vision Universe®';
    var feed = await load(BASE + 'feed/' + uid(ctx) + '.json');
    if (!active()) return;
    var full = feed.order || [], cache = {}, feedKey = 'feed:' + uid(ctx);
    (feed.cards || []).forEach(function (c, i) { var o = full[i]; cache[c.symbol] = Object.assign({}, c, { herkunft: (o && o.herkunft) || c.herkunft || null }); });
    var resume = D.memory ? D.memory.position(feedKey) : 0;
    var state = { filter: 'alle', i: Number.isInteger(resume) && resume > 0 && resume < full.length ? resume : 0, resumed: false };
    state.resumed = state.i > 0;
    var page = h('div', 'dv3 vu-ui dv3-swipe');
    page.innerHTML = '<h1 class="dv3-sr">Swipen</h1><div class="dv3-swipe__bar"><div class="vu-chips" role="group" aria-label="Sammlung">' + FILTERS.map(function (f) { return '<button type="button" class="vu-chip" data-f="' + f[0] + '" aria-pressed="' + (f[0] === 'alle') + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<span class="v2-feed-resume" hidden><button type="button" class="v2-feed-restart">Von vorn</button></span></div>' +
      '<div class="dv3-stage" aria-live="polite"></div><div class="dv3-swipe__btns"><button type="button" class="dv3-b dv3-b--skip" aria-label="Weiter, nicht merken">' + U().glyph('x', 26) + '</button>' +
      '<button type="button" class="dv3-b dv3-b--open" aria-label="Aktie öffnen">' + U().glyph('next', 26) + '</button><button type="button" class="dv3-b dv3-b--keep" aria-label="Merken">' + U().glyph('heart', 26) + '</button></div>' +
      '<div class="dv3-toast" role="status" hidden></div>';
    root.appendChild(page);
    var stage = page.querySelector('.dv3-stage'), toast = page.querySelector('.dv3-toast'), resumeBox = page.querySelector('.v2-feed-resume');
    function order() {
      if (state.filter === 'bekannt') return full.filter(function (o) { return o.k === 1; });
      if (state.filter === 'wachstum') return full.filter(function (o) { return GROWTH_ROWS.indexOf(o.rowId) >= 0; });
      return full;
    }
    function get(o) {
      if (cache[o.s]) return Promise.resolve(cache[o.s]);
      return load(BASE + 'stocks/' + uid(ctx) + '/' + encodeURIComponent(o.s) + '.json').then(function (c) { cache[o.s] = Object.assign({}, c, { herkunft: o.herkunft || null }); return cache[o.s]; });
    }
    var seq = 0, current = null;
    function show() {
      var list = order(), token = ++seq;
      resumeBox.hidden = !(state.resumed && state.filter === 'alle' && state.i > 0);
      if (state.i >= list.length) {
        current = null;
        stage.innerHTML = '<div class="vu-box dv3-done"><b>Du hast alle ' + list.length + ' gesehen.</b><span>Fang von vorn an oder wähle eine andere Sammlung.</span><button type="button" class="vu-btn vu-btn--ink">Von vorn</button></div>';
        stage.querySelector('button').onclick = function () { state.i = 0; save(); show(); };
        return;
      }
      var o = list[state.i];
      stage.innerHTML = '<div class="vu-box dv3-card is-loading" aria-busy="true"><p class="vu-ltag">' + esc(o.herkunft || '') + '</p></div>';
      get(o).then(function (c) {
        if (token !== seq || !page.isConnected) return;
        current = { o: o, c: c };
        stage.replaceChildren(swipeCard(c, o, state.i, list.length, ctx));
        list.slice(state.i + 1, state.i + 3).forEach(function (n) { get(n).catch(function () {}); });
      }).catch(function () {
        if (token !== seq) return;
        stage.innerHTML = U().blank('Diese Aktie konnte nicht geladen werden.');
        current = { o: o, c: null };
      });
    }
    function save() { if (state.filter === 'alle' && D.memory) D.memory.setPosition(feedKey, state.i); }
    function step(dir) {
      var card = stage.querySelector('.dv3-card');
      if (card && !global.matchMedia('(prefers-reduced-motion: reduce)').matches) { card.classList.add(dir > 0 ? 'is-keep' : 'is-skip'); }
      setTimeout(function () { state.i++; save(); show(); }, card ? 180 : 0);
    }
    function skip() { if (current) step(-1); }
    function keep() {
      if (!current || !current.c) { skip(); return; }
      var st = store(ctx), c = current.c, added = false;
      if (st && !st.has(c.symbol)) { st.toggle(c.symbol); added = true; }
      showToast(c, added, st);
      step(1);
    }
    function open() { if (current) location.hash = stockHref(ctx, current.o.s); }
    var toastTimer = 0;
    function showToast(c, added, st) {
      toast.innerHTML = '<span class="vu-hud" style="--vu-hud:32px">' + U().glyph('heart', 16) + '</span><span><b>' + esc(name(c)) + (added ? ' gemerkt' : ' ist schon gemerkt') + '</b><span>Auf deiner Watchlist</span></span>' + (added ? '<button type="button">Rückgängig</button>' : '');
      toast.hidden = false;
      var undo = toast.querySelector('button');
      if (undo) undo.onclick = function () { if (st && st.has(c.symbol)) st.toggle(c.symbol); state.i = Math.max(0, state.i - 1); save(); toast.hidden = true; show(); };
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.hidden = true; }, 4000);
    }
    page.querySelector('.dv3-b--skip').onclick = skip;
    page.querySelector('.dv3-b--keep').onclick = keep;
    page.querySelector('.dv3-b--open').onclick = open;
    page.querySelector('.v2-feed-restart').onclick = function () { state.i = 0; state.resumed = false; save(); show(); };
    page.querySelector('.vu-chips').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.filter = b.dataset.f; state.i = state.filter === 'alle' && D.memory ? Math.max(0, D.memory.position(feedKey) || 0) : 0;
      Array.prototype.forEach.call(page.querySelectorAll('.vu-chips button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      show();
    });
    /* Gesten: nach links weiter, nach rechts merken, tippen oeffnet. */
    var drag = null;
    stage.addEventListener('pointerdown', function (e) { var card = e.target.closest('.dv3-card'); if (!card || e.target.closest('a,button')) return; drag = { x: e.clientX, y: e.clientY, card: card, dx: 0, id: e.pointerId }; });
    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x;
      if (Math.abs(drag.dx) > 8 && Math.abs(drag.dx) > Math.abs(e.clientY - drag.y)) { try { drag.card.setPointerCapture(e.pointerId); } catch (_) {} drag.card.style.transform = 'translateX(' + drag.dx + 'px) rotate(' + (drag.dx / 30) + 'deg)'; }
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      if (d.dx > 90) keep(); else if (d.dx < -90) skip();
      else { d.card.style.transform = ''; if (Math.abs(d.dx) < 6 && e && e.type === 'pointerup') open(); }
    }
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', function (e) { if (drag) { drag.card.style.transform = ''; drag = null; } });
    function key(e) {
      if (!page.isConnected) { document.removeEventListener('keydown', key); return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.querySelector('.dx-search.on,.vu-sheet-backdrop:not([hidden])')) return;
      if (e.key === 'ArrowLeft') skip(); else if (e.key === 'ArrowRight') keep();
    }
    document.addEventListener('keydown', key);
    var seen = false; try { seen = global.localStorage.getItem(INTRO_KEY) === '1'; } catch (_) { seen = true; }
    if (!seen) {
      var ov = h('div', 'dv3-gesture', '<div class="dv3-gesture__g"><span><i class="dv3-b dv3-b--skip">' + U().glyph('x', 26) + '</i>Nach links: weiter</span><span><i class="dv3-b dv3-b--open">' + U().glyph('next', 26) + '</i>Tippen: öffnen</span><span><i class="dv3-b dv3-b--keep">' + U().glyph('heart', 26) + '</i>Nach rechts: merken</span></div>' +
        '<h2>' + full.length + ' Aktien, eine nach der anderen.</h2><p>Aus ' + uniq(full.map(function (o) { return o.rowId; })).length + ' Sammlungen gemischt. Bekannte und unbekannte Namen im Wechsel. Keine Empfehlung.</p><button type="button" class="vu-btn vu-btn--block">Los geht’s</button>');
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'So funktioniert Swipen');
      ov.querySelector('button').onclick = function () { try { global.localStorage.setItem(INTRO_KEY, '1'); } catch (_) {} ov.remove(); };
      page.appendChild(ov); setTimeout(function () { var b = ov.querySelector('button'); if (b && b.isConnected) b.focus(); }, 50);
    }
    show();
  }
  function uniq(xs) { return xs.filter(function (x, i) { return x && xs.indexOf(x) === i; }); }
  function swipeCard(c, o, i, n, ctx) {
    var art = h('article', 'vu-box dv3-card dx-feed-screen'); art.dataset.symbol = c.symbol; art.dataset.index = String(i);
    var badges = (c.badges || []).slice(0, 3);
    art.innerHTML = '<div class="dv3-card__top"><span class="vu-ltag">' + esc(o.herkunft || c.herkunft || 'Discover') + '</span><span class="vu-ltag dx-feed-zaehler">' + (i + 1) + ' von ' + n + '</span></div>' +
      '<div class="dv3-blick__head">' + U().logo(c.symbol, { xl: true }) + '<div class="dv3-blick__id"><b>' + esc(name(c)) + '</b><span>' + esc([c.symbol, what(c)].filter(Boolean).join(' · ')) + '</span></div></div>' +
      '<div class="dv3-klar">' + zahlPill(c, true) + '<span>' + esc(c.plain && c.plain.zahl ? c.plain.zahl.label : '') + '</span></div>' +
      '<h2 class="dv3-story">' + esc(story(c)) + '</h2><div class="dv3-chart"></div><div class="dv3-dates"><span></span><span></span></div>' +
      (badges.length ? '<div class="dv3-reasons">' + badges.map(function (b, k) { return '<span class="vu-chip' + (k ? '' : ' vu-chip--lime') + '">' + esc(k === 0 ? b.label : (b.detail || b.label)) + '</span>'; }).join('') + '</div>' : '') +
      (c.hook && c.hook.text ? '<p class="dv3-hook">' + U().hud('fundamental', 26) + '<span>' + esc(c.hook.text) + '</span></p>' : '') +
      '<a class="dv3-sr" href="' + esc(stockHref(ctx, c.symbol)) + '">' + esc(name(c)) + ' öffnen</a>';
    var dates = art.querySelectorAll('.dv3-dates span');
    art.querySelector('.dv3-chart').appendChild(spark(c, { big: true, eager: true, width: 320, height: 110, onDates: function (a, b) { dates[0].textContent = dayYear(a); dates[1].textContent = dayYear(b); } }));
    return art;
  }

  /* ============================================================ D08 Watchlist */
  var STARTER = ['NVDA', 'AAPL', 'MSFT'];
  async function watchlist(root, ctx, symbols, active) {
    bindHelp();
    document.title = 'Watchlist — Discover — Vision Universe®';
    var page = h('div', 'dv3 vu-ui dv3-watch');
    page.innerHTML = '<p class="vu-ltag">Mein Bereich</p><h1 class="vu-lt">Watchlist</h1>';
    root.appendChild(page);
    var st = store(ctx);
    if (!symbols.length) {
      page.insertAdjacentHTML('beforeend', '<div class="vu-box dv3-empty"><span class="dv3-empty__icon">' + U().glyph('heart', 28) + '</span><b>Noch nichts gemerkt</b><span>Tippe auf einer Aktie auf das Herz oder wische beim Swipen nach rechts.</span></div>' +
        sect('Zum Start: bekannte Namen') + '<div class="dv3-list dv3-starter"></div><a class="vu-btn vu-btn--ink vu-btn--block" href="#/swipen">' + U().glyph('grid', 18) + ' Aktien swipen</a>');
      var sl = page.querySelector('.dv3-starter');
      var starters = await Promise.all(STARTER.map(function (s) { return load(BASE + 'stocks/' + uid(ctx) + '/' + s + '.json').catch(function () { return null; }); }));
      if (!active()) return;
      starters.filter(Boolean).forEach(function (c) {
        var row = h('div', 'vu-lrow vu-lrow--nochart dv3-row');
        row.innerHTML = U().logo(c.symbol) + '<a class="vu-lrow__name" href="' + esc(stockHref(ctx, c.symbol)) + '"><b>' + esc(name(c)) + '</b><span>' + esc(what(c)) + '</span></a><button type="button" class="vu-btn vu-btn--sm">' + U().glyph('plus', 16) + ' Merken</button>';
        row.querySelector('button').onclick = function () { if (st && !st.has(c.symbol)) st.toggle(c.symbol); if (ctx.route) ctx.route(); };
        if (!st) row.querySelector('button').hidden = true;
        sl.appendChild(row);
      });
      return;
    }
    var stocks = await Promise.all(symbols.map(function (s) { return load(BASE + 'stocks/' + uid(ctx) + '/' + encodeURIComponent(s) + '.json').catch(function () { return { symbol: s, missing: true }; }); }));
    if (!active()) return;
    var known = stocks.filter(function (c) { return !c.missing; }), withDay = known.filter(function (c) { return isNum(val(c.changePercent)); });
    var plus = withDay.filter(function (c) { return val(c.changePercent) > 0; }).length;
    var asOf = known.map(function (c) { return c.asOf; }).filter(Boolean).sort().pop();
    page.insertAdjacentHTML('beforeend', '<div class="vu-box vu-box--ink dv3-sum"><b>' + (withDay.length ? plus + '/' + withDay.length : '–') + '</b><span><b>heute im Plus</b><span>' + esc((asOf ? closeLabel(asOf) + ' · ' : '') + symbols.length + ' Aktien gemerkt') + '</span></span></div>' +
      U().seg([{ id: 'heute', label: 'Heute' }, { id: 'm12', label: '12 Monate' }, { id: 'name', label: 'Name' }], 'heute', { label: 'Reihenfolge' }) + '<div class="dv3-list dv3-wl"></div>');
    var list = page.querySelector('.dv3-wl'), editing = false, mode0 = 'heute';
    var edit = h('button', 'vu-btn vu-btn--line vu-btn--sm dv3-edit', 'Liste bearbeiten'); edit.type = 'button';
    list.after(edit);
    edit.onclick = function () { editing = !editing; edit.textContent = editing ? 'Fertig' : 'Liste bearbeiten'; draw(mode0); };
    function removable(c) {
      var r = h('div', 'vu-lrow vu-lrow--nochart dv3-row');
      r.innerHTML = U().logo(c.symbol) + '<div class="vu-lrow__name"><b>' + esc(c.missing ? c.symbol : name(c)) + '</b><span>' + esc(c.symbol) + '</span></div><button type="button" class="vu-btn vu-btn--line vu-btn--sm" aria-label="' + esc(c.symbol) + ' aus Watchlist entfernen">Entfernen</button>';
      r.querySelector('button').onclick = function () { if (st && st.has(c.symbol)) st.toggle(c.symbol); r.remove(); stocks = stocks.filter(function (x) { return x !== c; }); if (!stocks.length && ctx.route) ctx.route(); };
      return r;
    }
    function draw(mode) {
      mode0 = mode;
      var xs = stocks.slice();
      if (mode === 'name') xs.sort(function (a, b) { return name(a).localeCompare(name(b), 'de'); });
      else xs.sort(function (a, b) { var x = mode === 'm12' ? metric(a, 'return12M') : val(a.changePercent), y = mode === 'm12' ? metric(b, 'return12M') : val(b.changePercent); return (isNum(y) ? y : -Infinity) - (isNum(x) ? x : -Infinity); });
      list.replaceChildren();
      xs.forEach(function (c) {
        if (editing) { list.appendChild(removable(c)); return; }
        if (c.missing) { var r = h('a', 'vu-lrow vu-lrow--noprice dv3-row'); r.href = stockHref(ctx, c.symbol); r.innerHTML = U().logo(c.symbol) + '<div class="vu-lrow__name"><b>' + esc(c.symbol) + '</b><span>Keine Discover-Daten zu diesem Kürzel</span></div>'; list.appendChild(r); return; }
        var row = stockRow(c, ctx, { sub: what(c) });
        if (mode === 'm12') { var p = row.querySelector('.vu-lrow__price'); var m = metric(c, 'return12M'); p.innerHTML = '<span>' + esc(price(c)) + '</span>' + U().chg(isNum(m) ? m * 100 : null, { digits: 0 }); }
        list.appendChild(row);
      });
      Array.prototype.forEach.call(page.querySelectorAll('.vu-seg button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === mode)); });
    }
    page.querySelector('.vu-seg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) draw(b.dataset.id); });
    draw('heute');
    /* D08: Benachrichtigungen wie im Mockup d08-a; der Dienst (Z4) kommt später, deshalb ehrlich „bald“ statt wirkungsloser Schalter. */
    page.insertAdjacentHTML('beforeend', sect('Benachrichtigungen') + '<div class="vu-box dv3-alerts">' + ['Bewegung über ±5 % am Tag', 'Neues Jahreshoch', 'Neue Quartalszahlen (SEC)'].map(function (t) {
      return '<div class="dv3-alert"><b>' + esc(t) + '</b>' + U().verdict('none', 'bald') + '</div>'; }).join('') + '</div>');
    var first = known[0], sim = first && first.discoverNext && first.discoverNext.similar && (first.discoverNext.similar.cards || []).filter(function (c) { return symbols.indexOf(c.symbol) < 0; }).slice(0, 2);
    if (sim && sim.length) {
      page.insertAdjacentHTML('beforeend', sect('Passt zu deiner Liste'));
      var sl2 = h('div', 'dv3-list'); page.appendChild(sl2);
      sim.forEach(function (c) { sl2.appendChild(stockRow(c, ctx, { zahl: true, sub: 'Ähnlich wie ' + name(first) })); });
    }
    page.insertAdjacentHTML('beforeend', '<div class="dv3-rmhint">' + U().help('Ohne Anmeldung liegt die Liste nur auf diesem Gerät. Angemeldet gilt sie in allen Welten – Mein Bereich zeigt sie mit Konto.') + '<a class="vu-btn vu-btn--line vu-btn--block" href="/mein-dashboard/">Mein Bereich öffnen</a></div>');
  }

  /* ============================================================ D07 Maerkte */
  var STAERKE_NOTE = 'Nachgerechnet mit festen Regeln seit 1929. Beschreibung der Vergangenheit, keine Prognose.';
  var TABS7 = [['aktien', 'Aktien'], ['energie', 'Rohstoffe'], ['edelmetalle', 'Gold'], ['krypto', 'Krypto'], ['zinsen', 'Zinsen']];
  var MORE7 = ['WTI', 'XAUUSD', 'BTCUSD', 'US2Y', 'US10Y', 'DE2Y', 'FED_TARGET', 'ECB_DFR', 'EURUSD'];
  async function maerkte(root, ctx) {
    bindHelp();
    var M = D.Markets, MA = global.VUMultiAssetContract;
    function optional(p) { return load(p).catch(function () { return null; }); }
    var r = await Promise.all([load('/quant/data/market/multi-asset/snapshot.json'), optional('/quant/config/multi-asset.json'), optional('/quant/data/market/intelligence/market-pulse.json'),
      optional('/quant/config/market-pulse.json'), optional('/quant/data/market/validation/market-pulse-evidence.json')]);
    if (ctx.isActive && !ctx.isActive()) return;
    var now = new Date(), contracts = (r[0].instruments || []).map(function (c) { return MA.refresh(c, { now: now, calendar: ctx.calendar, config: r[1] || {} }); });
    var p = r[2], env = p && p.environment, ev = r[4], layer = global.VUFx && global.VUFx.layer;
    var bySym = {}; contracts.forEach(function (c) { bySym[c.instrument.symbol] = c; });
    var page = h('div', 'dv3 vu-ui dv3-maerkte dx-maerkte');
    var asOf = (p && p.evaluation && p.evaluation.dataAsOf) || (bySym.SPY && bySym.SPY.quote && bySym.SPY.quote.asOf) || r[0].generatedAt;
    page.innerHTML = '<a class="v2-back dv3-back" href="#/">' + U().glyph('back', 16) + ' Discover</a><h1 class="vu-lt">Märkte</h1><p class="vu-lead">Wie steht die Börse?' + (asOf ? ' Stand: ' + esc(/^\d{4}-\d{2}-\d{2}$/.test(String(asOf)) ? closeLabel(asOf) : M.standText(asOf)) : '') + '</p>';
    root.appendChild(page);
    /* Barometer: Stufe als Wort, 5er-Skala, Satz, drei Zustaende, Knopf zum Sheet. */
    if (env && isNum(env.level)) {
      var dims = ['RISK', 'MOMENTUM', 'BREADTH', 'TREND'].map(function (k) { return p.dimensions && p.dimensions[k]; }).filter(Boolean).slice(0, 3);
      var DN = { TREND: 'Trend', BREADTH: 'Marktbreite', MOMENTUM: 'Schwung', RISK: 'Schwankung' };
      var card = h('section', 'vu-box vu-box--ink dv3-baro dv3-baro--big');
      card.innerHTML = barometerCard(env, { scaleFirst: true }) + (dims.length ? '<div class="dv3-baro__chips">' + dims.map(function (d) { return '<span>' + esc((DN[d.id] || d.id) + ': ' + d.label) + '</span>'; }).join('') + '</div>' : '') +
        (ev && ev.levels ? '<button type="button" class="vu-btn vu-btn--block">Was heißt „' + esc(env.label) + '“?</button>' : '');
      page.appendChild(card);
      var bb = card.querySelector('button'); if (bb) bb.onclick = function () { levelSheet(env, ev); };
    } else page.insertAdjacentHTML('beforeend', U().blank('Das Marktbarometer ist gerade nicht verfügbar.'));
    history100(page, env, ev);
    /* Reiter springen zu Abschnitten. */
    var groups = M.gruppieren(contracts), gid = {}; groups.forEach(function (g) { gid[g.id] = g; });
    var nav = h('nav', 'vu-chips dv3-jumps'); nav.setAttribute('aria-label', 'Assetklassen');
    TABS7.forEach(function (t, i) {
      if (t[0] !== 'zinsen' && !gid[t[0]]) return;
      var b = h('button', 'vu-chip' + (i ? '' : ' vu-chip--on'), esc(t[1])); b.type = 'button';
      b.onclick = function () { var z = document.getElementById(t[0] === 'aktien' ? 'maerkte-aktien' : 'maerkte-weitere'); if (z) z.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
      nav.appendChild(b);
    });
    page.appendChild(nav);
    if (gid.aktien) {
      var ak = h('section', 'dv3-sec'); ak.id = 'maerkte-aktien'; ak.innerHTML = sect('Aktienmärkte');
      var al = h('div', 'dv3-list'); gid.aktien.karten.forEach(function (c) { al.appendChild(marketRow(c, layer)); });
      ak.appendChild(al); ak.insertAdjacentHTML('beforeend', U().help('Wir zeigen den Kurs des Fonds, der den Index nachbildet. Der Indexstand selbst ist in Punkten und höher.'));
      page.appendChild(ak);
    }
    movers(page, p);
    var items = [];
    try { items = M.marktJetztItems(contracts, r[3], now) || []; } catch (_) { items = []; }
    if (items.length) {
      var sec = h('section', 'dv3-sec'); sec.innerHTML = sect('Was heute auffällt');
      items.slice(0, 4).forEach(function (it) {
        var dir = it.direction, cls = dir === 'down' ? ' vu-chg--down' : dir === 'up' ? '' : ' vu-chg--flat', mark = dir === 'down' ? '▼' : dir === 'up' ? '▲' : '◆';
        var box = h('a', 'vu-box dv3-odd'); box.href = '#/maerkte/' + encodeURIComponent(it.symbol);
        box.innerHTML = '<div class="dv3-odd__head"><b>' + esc(it.title) + '</b><span class="vu-chg' + cls + '"><span aria-hidden="true">' + mark + '</span> ' + esc(String(it.value || '').replace(/^[+−-]/, dir === 'down' ? '−' : dir === 'up' ? '+' : '$&')) + '</span></div>' +
          '<p>' + esc(it.evidence || '') + '</p>' + (it.notable ? U().verdict('weak', 'Ungewöhnlich') : U().verdict('mid', 'Im üblichen Rahmen'));
        sec.appendChild(box);
      });
      page.appendChild(sec);
    }
    var weitere = h('section', 'dv3-sec'); weitere.id = 'maerkte-weitere'; weitere.innerHTML = sect('Weitere Märkte');
    var wl = h('div', 'dv3-list');
    MORE7.forEach(function (s) { if (bySym[s]) wl.appendChild(marketRow(bySym[s], layer, true)); });
    groups.forEach(function (g) { if (g.id === 'aktien') return; g.karten.forEach(function (c) { if (MORE7.indexOf(c.instrument.symbol) < 0) wl.appendChild(marketRow(c, layer, true)); }); });
    weitere.appendChild(wl);
    weitere.insertAdjacentHTML('beforeend', U().help('bp = Basispunkt. 100 bp sind 1 Prozentpunkt. Renditen und Zinsen bekommen keine Plus- oder Minusfarbe.'));
    page.appendChild(weitere);
    page.insertAdjacentHTML('beforeend', '<a class="vu-navcard" href="#/maerkte/einordnung">' + U().hud('discover', 42) + '<span class="vu-navcard__text"><b>Die ganze Einordnung</b><span>Marktbarometer: Stufe, Gründe, Verlauf und Prüfung seit 1929</span></span>' + U().glyph('next', 18) + '</a>' +
      U().help('Informationen zur eigenen Recherche, keine Anlageberatung. Beträge in der gewählten Anzeigewährung; Punkte, Prozent und Zinssätze werden nicht umgerechnet.'));
  }
  function marketRow(c, layer, typ) {
    var M = D.Markets, k = M.kopfText(c), q = c.quote || {}, wert = M.wertText(c, layer), ch = q.change, bp = ch && ch.semantics === 'BASIS_POINTS';
    var a = h(q.state === 'AVAILABLE' ? 'a' : 'div', 'vu-lrow dv3-row dv3-mrow');
    if (q.state === 'AVAILABLE') a.href = '#/maerkte/' + encodeURIComponent(c.instrument.symbol);
    var sub = typ ? (k.klasse.replace(/^Tracker · /, 'Fonds ')) : (c.tracker ? 'Fonds ' + c.instrument.symbol : k.klasse);
    var stand = q.asOf ? M.standText(String(q.asOf).slice(0, 10)) : '';
    var pill = '';
    if (ch && bp && isNum(ch.basisPoints)) pill = '<span class="vu-chg vu-chg--flat">' + esc(M.veraenderungText(c)) + '</span>';
    else if (ch && isNum(ch.percent)) pill = U().chg(ch.percent);
    a.innerHTML = '<div class="vu-lrow__name"><b>' + esc(k.titel) + '</b><span>' + esc(sub + (stand ? ' · ' + stand.slice(0, 6) : '')) + '</span></div><div class="vu-lrow__mini"></div><div class="vu-lrow__price"><span>' + esc(wert || '–') + '</span>' + pill + '</div>';
    a.classList.add('dv3-mrow--nologo');
    var rec = c.history && c.history.recent;
    if (rec && rec.length >= 5 && c.history.representation !== 'STEPS' && global.VUChart) a.querySelector('.vu-lrow__mini').innerHTML = global.VUChart.sparkline(thin(rec.slice(-60)), { width: 74, height: 32 });
    return a;
  }
  function stufe(list, level) { return (list || []).filter(function (x) { return x.level === level; })[0] || null; }
  function lang(ev, days) { return ev && ev.longTerm ? ev.longTerm.filter(function (t) { return t.days === days; })[0] || null : null; }
  function pct(v, d) { return isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d == null ? 1 : d) + ' %' : '–'; }
  function history100(page, env, ev) {
    var j1 = lang(ev, 252), j5 = lang(ev, 1260);
    if (!env || !j1) return;
    var lvl = Math.min(env.level, j1.levels[j1.levels.length - 1].level), a = stufe(j1.levels, lvl), b = j5 && stufe(j5.levels, lvl);
    if (!a || !isNum(a.positiveShare) || !isNum(a.lossShare10)) return;
    var plus = Math.round(a.positiveShare), minus = Math.round(a.lossShare10), mid = Math.max(0, 100 - plus - minus), dots = '';
    for (var i = 0; i < 100; i++) dots += '<i class="' + (i < plus ? 'p' : i < plus + mid ? 'm' : 'n') + '"></i>';
    var sec = h('section', 'dv3-sec dv3-hist');
    sec.innerHTML = sect('Was die Geschichte sagt') + '<div class="vu-box"><p class="vu-sm">Von 100 Fällen bei „' + esc(a.label || env.label) + '“ stand man 1 Jahr später so da:</p>' +
      '<p class="dv3-hist__big"><b>' + plus + '</b> von 100 im Plus</p><div class="dv3-dots100" role="img" aria-label="' + plus + ' im Plus, ' + mid + ' leicht im Minus, ' + minus + ' mehr als 10 % im Minus">' + dots + '</div>' +
      '<ul class="dv3-legend"><li><i class="p"></i>' + plus + ' im Plus</li><li><i class="m"></i>' + mid + ' leicht im Minus</li><li><i class="n"></i>' + minus + ' mehr als −10 %</li></ul></div>' +
      '<div class="vu-grid dv3-tiles" style="--vu-cols:3">' + U().tile('Typisch 1 Jahr', pct(a.medianReturn), 'Median dieser Stufe') +
      (b ? U().tile('Typisch 5 Jahre', pct(b.medianReturn, 0), isNum(b.positiveShare) ? b.positiveShare + ' von 100 im Plus' : '') : '') +
      (isNum(a.bad10) ? U().tile('Schlechtes Jahr', pct(a.bad10, 0), '1 von 10 Fällen') : '') + '</div>' +
      U().help((ev.from ? 'Nachgerechnet mit festen Regeln seit ' + String(ev.from).slice(0, 4) + '. ' : '') + 'Beschreibung der Vergangenheit, keine Prognose. Vor Kosten und Steuern.');
    page.appendChild(sec);
  }
  /* Gleicher Wortlaut wie market-barometer.js#KLARTEXT (dort erst auf Unterseiten geladen). */
  var KLAR = [['Der Markt ist angeschlagen.', 'Trend und Beteiligung sind schwach. Deutliche Rückschläge kamen hier am häufigsten.'],
    ['Mehr Gegenwind als Rückenwind.', 'Der Trend ist brüchig, viele Aktien schwächeln.'],
    ['Chancen ja, aber nicht auf breiter Front.', 'Der Markt hat Schwung, doch nur ein Teil der Aktien zieht mit.'],
    ['Der Markt hat Rückenwind.', 'Trend, Schwung und Beteiligung passen zusammen.'],
    ['Breiter Rückenwind.', 'Trend, Schwung und Beteiligung passen – fast alles zieht mit.']];
  function levelSheet(env, ev) {
    var j1 = lang(ev, 252), k = KLAR[env.level] || ['', env.explanation || ''], head = k[0], rest = k[1];
    var body = '<p class="vu-ltag">Marktbarometer</p><p class="dv3-sheet-lead"><b>' + esc(head) + '</b> ' + esc(rest) + '</p>' + scale5(env, false) +
      (j1 ? '<p class="vu-ltag">1 Jahr später, je Stufe (von 100 Fällen)</p><div class="dv3-levels">' + j1.levels.map(function (x) {
        var pl = Math.round(x.positiveShare), mi = Math.round(x.lossShare10);
        return '<div class="dv3-level"><div><b>' + esc(x.label) + (x.level === Math.min(env.level, j1.levels[j1.levels.length - 1].level) ? ' <span class="vu-chip vu-chip--lime dv3-today">Heute</span>' : '') + '</b><span>' + pl + ' im Plus · ' + mi + ' unter −10 %</span></div>' +
          '<div class="dv3-stack" aria-hidden="true"><i class="p" style="width:' + pl + '%"></i><i class="m" style="width:' + Math.max(0, 100 - pl - mi) + '%"></i><i class="n" style="width:' + mi + '%"></i></div></div>';
      }).join('') + '</div>' : '') +
      ((env.scale || []).length > (j1 ? j1.levels.length : 0) ? U().help('„' + env.scale[env.scale.length - 1].label + '“ kommt in der Rückrechnung nicht vor: Die Marktbreite lässt sich für früher nicht nachbauen.') : '') +
      U().help('Die Stufe entsteht aus Trend, Schwung, Schwankung und Marktbreite. Kein Gesamtscore, keine Gewichte.');
    sheet('Was heißt „' + env.label + '“?', body);
  }
  function movers(page, p) {
    var m = p && p.movers;
    if (!m || !(m.gainers || []).length) return;
    function col(title, xs, down) {
      return '<div class="vu-box dv3-mcol"><p class="dv3-mcol__t">' + U().chg(down ? -1 : 1).replace(/[+−]?1,00 %/, '') + ' ' + esc(title) + '</p>' + xs.slice(0, 5).map(function (x) {
        return '<a href="#/s/US_REAL/' + encodeURIComponent(x.symbol) + '" data-symbol="' + esc(x.symbol) + '"><b>' + esc(x.name || x.symbol) + '</b>' + U().chg(x.changePercent) + '</a>';
      }).join('') + '</div>';
    }
    var sec = h('section', 'dv3-sec');
    sec.innerHTML = sect('Größte Anstiege und Rückgänge' + (m.session ? ' · ' + day(m.session) : '')) + '<div class="vu-grid dv3-movers">' + col('Anstiege', m.gainers, false) + col('Rückgänge', m.losers || [], true) + '</div>' +
      '<p class="vu-xs vu-mu">' + esc((m.eligible ? num(m.eligible, 0) + ' liquide US-Titel, ' : '') + (m.session ? 'Schluss ' + day(m.session) : '') + (m.previousSession ? ' gegen ' + day(m.previousSession) : '') + (m.complete === false ? ' (Sitzung läuft)' : '')) + '</p>';
    page.appendChild(sec);
  }

  var api = { home: home, welten: welten, thema: thema, strategien: strategien, strategie: strategie, swipen: swipen, watchlist: watchlist, maerkte: maerkte,
    rowTitle: rowTitle, closeLabel: closeLabel, stockRow: stockRow, rankRow: rankRow, spark: spark, GROUPS: GROUPS };
  D.V3 = api;
})(window);
