/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/reihen.js       Konzept „Reihe für Reihe“

   Vorlage: docs/design/discover-netflix-2026-11 (HANDOVER.md, Screens n-* in
   deck.js, Stile im zweiten <style>-Block von index.html). Regeln (Reihenfolge,
   Genres, Schaufenster) stehen in discover/engines/reihen.js; diese Datei
   zeichnet nur. Bausteine aus discover/ui/v3.js (D.V3.kit), assets/vu-ui.js
   (VUUI) und der eine Chart (assets/vu-chart.js).

   Liegt bewusst nicht unter den gezaehlten Budget-Dateien
   (discover/(app|home|detail|themes).(js|css)).

   Startseite (Screen n-home): Kopf -> Genre-Chips -> Billboard „Heute im Blick“
   (immer dunkel, wischbar 1–5) -> Markt-Zeile -> Top 10 heute -> Schienen ->
   Swipen-Karte -> Hinweis. Schienen laden ihre Reihe erst, wenn sie in die Naehe
   des sichtbaren Bereichs kommen; die Mini-Charts laden, wenn sie sichtbar werden.
   ========================================================================= */
(function (global) {
  'use strict';
  var D = global.VUDiscover = global.VUDiscover || {};
  function U() { return global.VUUI; }
  function K() { return D.V3.kit; }
  function R() { return D.Reihen; }
  function esc(s) { return U().esc(s); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function h(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function uid(ctx) { return (ctx && ctx.universeId) || 'US_REAL'; }
  function rowUrl(ctx, id) { return '/discover/data/rows/' + uid(ctx) + '/' + id + '.json'; }
  function loadRow(ctx, id) { return K().load(rowUrl(ctx, id)); }
  function fmtInt(n) { return isNum(n) ? Math.round(n).toLocaleString('de-DE') : ''; }

  /* ------------------------------------------------------------ Namen */
  /** Kurzname wie im Mockup (nm): Rechtsform und Zusaetze am Ende weg. */
  function shortName(c) {
    var x = String((c && (c.displayName || c.companyName)) || (c && c.symbol) || '');
    for (var i = 0; i < 3; i++) x = x.replace(/,?\s+(Class [A-Z]|Inc\.?|Holdings?|Ltd\.?|Limited|Corporation|Corp\.?|Co\.?|Company|plc|N\.V\.|S\.A\.|A\.S\.|AG|SE|- New|\(Cayman\)|Group Holding|Therapeutics|Technology Group|L\.P\.|LP)$/i, '');
    return x || (c && c.symbol) || '';
  }
  /** Ziel „Alle N“ einer Reihe. Themenreihen fuehren in ihre Themenwelt. */
  function rowHref(id) {
    var T = D.Views && D.Views.Themes, t = T && T.byRow(id);
    return t ? T.href(t) : '#/c/US_REAL/' + encodeURIComponent(id);
  }

  /* ------------------------------------------------------------ Pillen (C07) */
  function pill12(c) { var r = c && c.metrics && c.metrics.return12M; return U().chg(isNum(r) ? r * 100 : null, { digits: 0 }); }
  function pillDay(c) { var v = K().val(c && c.changePercent); return U().chg(isNum(v) ? v : null, { digits: 1 }); }
  function pillHigh(c) { var v = c && c.metrics && c.metrics.distanceTo52wHigh; return U().chg(isNum(v) ? v * 100 : null, { digits: 0 }); }
  var PILLS = { r12: [pill12, '12 Mon.'], day: [pillDay, 'heute'], fromHigh: [pillHigh, 'vom Hoch'] };

  /* ------------------------------------------------------------ Kleine Symbole */
  var ICON = {
    bars: '<path d="M5 20v-6M10 20V9M15 20v-9M20 20V5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    signal: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
    swipe: '<rect x="6" y="3.5" width="12" height="17" rx="3"/><path d="M3 9v6M21 9v6"/>',
    new: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>'
  };
  function icon(name, size) {
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICON[name] || '') + '</svg>';
  }
  function hudIcon(name, size) { return '<span class="dr-hud" style="width:' + size + 'px;height:' + size + 'px" aria-hidden="true">' + icon(name, Math.round(size / 2)) + '</span>'; }

  /* ------------------------------------------------------------ Faul laden */
  var near = null, waiting = typeof Map === 'function' ? new Map() : null;
  /** fn, sobald node bis auf 700 px an den sichtbaren Bereich kommt. */
  function whenNear(node, fn) {
    if (!global.IntersectionObserver || !waiting) { fn(); return; }
    if (!near) near = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return; near.unobserve(e.target); var f = waiting.get(e.target); waiting.delete(e.target); if (f) f(); });
    }, { rootMargin: '700px 0px' });
    waiting.set(node, fn); near.observe(node);
  }

  /* ------------------------------------------------------------ Bausteine */
  /** Schienen-Kopf: Titel, Etikett, „Alle N ›“, ein Satz. */
  function railHead(o) {
    return '<div class="dr-head"><div class="dr-head__t"><h2>' + esc(o.title) + '</h2>' + (o.tag ? '<span class="dr-tag">' + esc(o.tag) + '</span>' : '') +
      (o.href ? '<a href="' + esc(o.href) + '"' + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>' + esc(o.more || 'Alle') + U().glyph('next', 13) + '</a>' : '') + '</div>' +
      (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div>';
  }
  /** Poster (Standard-Format jeder Schiene): Logo, Merken, Name, Kuerzel, Mini-Chart 1 Jahr, eine Pille. */
  function poster(c, ctx, o) {
    o = o || {};
    var p = PILLS[o.pill] || PILLS.r12, nm = shortName(c);
    var box = h('div', 'dr-poster'); box.dataset.symbol = c.symbol; box.setAttribute('role', 'listitem');
    box.__card = c; if (o.row) box.dataset.row = o.row;
    box.innerHTML = (o.badge ? '<span class="dr-badge">' + esc(o.badge) + '</span>' : '') +
      '<a class="dr-poster__a" href="' + esc(K().stockHref(ctx, c.symbol)) + '" aria-label="' + esc(nm + ', ' + c.symbol) + '">' + U().logo(c.symbol) +
      '<b class="dr-poster__n">' + esc(nm) + '</b><span class="dr-poster__t">' + esc(c.symbol) + '</span><span class="dr-poster__ch"></span>' +
      '<span class="dr-poster__v">' + p[0](c) + '<small>' + esc(p[1]) + '</small></span></a>' +
      '<button type="button" class="dr-heart">' + U().glyph('heart', 15) + '</button>';
    box.querySelector('.dr-poster__ch').appendChild(K().spark(c, { width: o.chartW || 112, height: 40 }));
    K().heart(box.querySelector('.dr-heart'), ctx, c.symbol, nm);
    return box;
  }
  /** Top 10: grosse Ziffer hinter dem schmalen Poster. */
  function top10(c, i, ctx) {
    var box = h('div', 'dr-t10'); box.setAttribute('role', 'listitem');
    box.innerHTML = '<span class="dr-t10__n" aria-hidden="true">' + (i + 1) + '</span>';
    var p = poster(c, ctx, { pill: 'day', chartW: 92, row: 'im-blick' }); p.removeAttribute('role');
    p.querySelector('.dr-poster__a').setAttribute('aria-label', 'Platz ' + (i + 1) + ': ' + shortName(c) + ', ' + c.symbol);
    box.appendChild(p);
    return box;
  }
  function rail(label) { var r = h('div', 'dr-rail'); r.setAttribute('role', 'list'); r.setAttribute('aria-label', label); return r; }
  function skeleton(n, cls) { return Array.from({ length: n }, function () { return '<span class="dr-skel ' + (cls || '') + '" aria-hidden="true"></span>'; }).join(''); }

  /* ------------------------------------------------------------ Billboard */
  /** Karten fuer das Billboard: die Eingangsflaeche (mit Gruenden), dann die Reihe „Heute im Blick“, Schaufenster-Regel, hoechstens 5. */
  function billboardCards(hero, row) {
    var seen = {}, out = [];
    ((hero && hero.cards) || []).concat((row && row.cards) || []).forEach(function (c) {
      if (out.length < 5 && c && !seen[c.symbol] && R().showcase(c)) { seen[c.symbol] = 1; out.push(c); }
    });
    return out;
  }
  function billboardSlide(c, i, n, ctx, surface) {
    var art = h('article', 'dr-bb__slide'); art.dataset.symbol = c.symbol; art.setAttribute('role', 'listitem');
    art.setAttribute('aria-label', 'Nr. ' + (i + 1) + ' von ' + n + ': ' + shortName(c));
    var z = c.plain && c.plain.zahl, r12 = c.metrics && c.metrics.return12M;
    var reasons = ((c.imBlick && c.imBlick.reasons) || c.reasons || []).slice(0, 2);
    var chips = reasons.length ? reasons.map(function (r, k) { return '<span class="vu-chip' + (k ? '' : ' vu-chip--lime') + '">' + esc(r.id === 'breakout' && /Volumen/.test(r.value || '') ? 'Ausbruch mit Volumen' : r.label + ': ' + r.value) + '</span>'; }).join('')
      : (c.plain && c.plain.zusatz ? '<span class="vu-chip vu-chip--lime">' + esc(c.plain.zusatz) + '</span>' : '');
    art.innerHTML = '<div class="dr-bb__tag"><span class="dr-tag">Nr. ' + (i + 1) + ' heute</span><span>' + (surface && surface.live ? 'Heute im Blick · laufende Sitzung' : 'Heute im Blick') + '</span></div>' +
      '<div class="dr-bb__id">' + U().logo(c.symbol, { xl: true }) + '<div><b>' + esc(shortName(c)) + '</b><span>' + esc([c.symbol, K().what(c)].filter(Boolean).join(' · ')) + '</span></div></div>' +
      '<div class="dr-bb__big">' + U().chg(isNum(r12) ? r12 * 100 : null, { digits: 0, big: true }) + '<span>' + esc(z && z.label && /12 Monaten/.test(z.label) ? z.label : 'in 12 Monaten') + '</span></div>' +
      '<h3 class="dr-bb__story">' + esc(K().story(c)) + '</h3><div class="dr-bb__chart"></div><div class="dr-bb__dates"><span></span><span></span></div>' +
      (chips ? '<div class="dr-bb__chips">' + chips + '</div>' : '') +
      '<div class="dr-bb__act"><a class="vu-btn" href="' + esc(K().stockHref(ctx, c.symbol)) + '">Aktie ansehen</a>' +
      '<button type="button" class="vu-btn vu-btn--line dr-bb__keep">' + U().glyph('plus', 18) + '<span>Merken</span></button>' +
      '<button type="button" class="dr-bb__q" aria-label="Warum steht ' + esc(shortName(c)) + ' hier?">?</button></div>';
    var dates = art.querySelectorAll('.dr-bb__dates span');
    art.querySelector('.dr-bb__chart').appendChild(K().spark(c, { big: true, width: 322, height: 96, onDates: function (a, b) { dates[0].textContent = K().dayYear(a); dates[1].textContent = K().dayYear(b); } }));
    var keep = art.querySelector('.dr-bb__keep'), st = K().store(ctx);
    if (!st) keep.hidden = true;
    else {
      var paint = function () { var on = st.has(c.symbol); keep.setAttribute('aria-pressed', String(on)); keep.querySelector('span').textContent = on ? 'Gemerkt' : 'Merken'; };
      keep.addEventListener('click', function () { st.toggle(c.symbol); paint(); }); paint();
    }
    art.querySelector('.dr-bb__q').addEventListener('click', function () { K().whySheet(c, ctx, surface); });
    return art;
  }
  function billboard(surface, ctx) {
    var cards = surface.cards || [];
    var sec = h('section', 'dr-sec dr-bb v2-spotlight'); sec.setAttribute('aria-label', 'Heute im Blick');
    var track = h('div', 'dr-bb__track v2-hero-track'); track.setAttribute('role', 'list'); track.setAttribute('aria-label', 'Heute im Blick, 1 bis ' + cards.length);
    cards.forEach(function (c, i) { track.appendChild(billboardSlide(c, i, cards.length, ctx, surface)); });
    var dots = h('div', 'dr-bb__dots', cards.map(function (_, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join(''));
    dots.setAttribute('aria-hidden', 'true');
    var raf = 0;
    track.addEventListener('scroll', function () {
      if (raf) return;
      raf = global.requestAnimationFrame(function () {
        raf = 0; var w = track.clientWidth || 1, i = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / w)));
        Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k === i ? 'on' : ''; });
      });
    }, { passive: true });
    sec.append(track, dots);
    return sec;
  }

  /* ------------------------------------------------------------ Markt-Zeile */
  function marketStrip(sec, ctx) {
    var a = h('a', 'dr-ms'); a.href = '#/maerkte'; a.setAttribute('aria-label', 'Markt heute, Märkte ansehen');
    a.innerHTML = '<span class="dr-ms__lvl"><span class="vu-ltag">Markt heute</span><b>…</b><small></small></span>' +
      [['QQQ', 'Nasdaq'], ['SPY', 'S&P'], ['DIA', 'Dow']].map(function (x) { return '<span class="dr-ms__i" data-s="' + x[0] + '"><span>' + esc(x[1]) + '</span>' + U().chg(null) + '</span>'; }).join('') + U().glyph('next', 14);
    sec.appendChild(a);
    var lvl = a.querySelector('.dr-ms__lvl');
    K().load('/quant/data/market/intelligence/market-pulse.json').then(function (p) {
      var env = p && p.environment; if (!a.isConnected) return;
      if (!env || !isNum(env.level)) { lvl.querySelector('b').textContent = 'Keine Einordnung'; return; }
      lvl.querySelector('b').textContent = env.label;
      lvl.querySelector('small').textContent = 'Stufe ' + (env.level + 1) + ' von ' + ((env.scale || []).length || 5);
    }).catch(function () { if (a.isConnected) lvl.querySelector('b').textContent = 'Nicht verfügbar'; });
    Promise.all([K().load('/quant/data/market/multi-asset/snapshot.json'), K().load('/quant/config/multi-asset.json').catch(function () { return null; })]).then(function (r) {
      if (!a.isConnected) return;
      var MA = global.VUMultiAssetContract;
      ['QQQ', 'SPY', 'DIA'].forEach(function (symbol) {
        var raw = (r[0].instruments || []).filter(function (c) { return c.instrument && c.instrument.symbol === symbol; })[0]; if (!raw) return;
        var c = MA && MA.refresh ? MA.refresh(raw, { now: new Date(), calendar: ctx.calendar, config: r[1] || {} }) : raw;
        var ch = c.quote && c.quote.state === 'AVAILABLE' && c.quote.change ? c.quote.change.percent : null;
        var slot = a.querySelector('[data-s="' + symbol + '"]');
        slot.lastElementChild.outerHTML = U().chg(ch, { digits: 2 });
      });
    }).catch(function () {});
  }

  /* ------------------------------------------------------------ Schienen */
  function railSection(slot, ctx, avail) {
    var id = slot.row, title = R().homeTitle(id), sec = h('section', 'dr-sec'); sec.dataset.row = id;
    var n = avail[id];
    sec.innerHTML = railHead({ title: title, tag: slot.tag, sub: '', more: n ? 'Alle ' + fmtInt(n) : 'Alle', href: rowHref(id), label: 'Alle ' + fmtInt(n) + ' Aktien: ' + title });
    var track = rail(title); track.innerHTML = skeleton(3); sec.appendChild(track);
    whenNear(sec, function () {
      loadRow(ctx, id).then(function (row) {
        if (!sec.isConnected) return;
        var sub = R().homeSub(id, row.subtitle);
        if (sub) sec.querySelector('.dr-head').insertAdjacentHTML('beforeend', '<p>' + esc(sub) + '</p>');
        var cards = R().showcaseCards(row.cards, 10);
        if (!cards.length) { sec.remove(); return; }
        track.replaceChildren();
        cards.forEach(function (c) { track.appendChild(poster(c, ctx, { pill: slot.pill, row: id, badge: slot.badge && slot.badge(c) })); });
      }).catch(function () { if (sec.isConnected) sec.remove(); });
    });
    return sec;
  }
  function top10Section(row, ctx) {
    var sec = h('section', 'dr-sec dr-sec--top10'); sec.dataset.row = 'im-blick';
    sec.innerHTML = railHead({ title: 'Top 10 heute', sub: 'Rang nach der Regel „Heute im Blick“: Ereignisse des letzten Handelstags und Stärke über 12 Monate.', more: 'Alle', href: rowHref('im-blick'), label: 'Alle Aktien: Heute im Blick' });
    var track = rail('Top 10 heute'); sec.appendChild(track);
    R().showcaseCards(row.cards, 10).forEach(function (c, i) { track.appendChild(top10(c, i, ctx)); });
    if (!track.children.length) return null;
    return sec;
  }
  var HOME_THEMES = ['kuenstliche-intelligenz', 'halbleiter-chips', 'kernenergie-uran', 'raumfahrt', 'rechenzentren-cloud', 'cybersecurity', 'biotechnologie', 'erneuerbare-energien'];
  function themesSection(ctx, all) {
    var T = D.Views.Themes, list = all ? T.all : HOME_THEMES.map(function (s) { return T.bySlug(s); }).filter(Boolean);
    if (!list.length) return null;
    var sec = h('section', 'dr-sec dr-sec--themes' + (all ? ' dr-sec--themegrid' : ''));
    sec.innerHTML = railHead({ title: 'Themenwelten', more: 'Alle ' + T.all.length, href: '#/welten', label: 'Alle ' + T.all.length + ' Themenwelten', sub: 'Von KI bis Kernenergie, je ein Bild und die Firmen dahinter.' });
    var track = all ? h('div', 'dr-tgrid') : rail('Themenwelten'); if (all) track.setAttribute('role', 'list');
    list.forEach(function (t) { var c = K().themeCard(t, ctx, { grid: all }); c.setAttribute('role', 'listitem'); track.appendChild(c); });
    sec.appendChild(track);
    return sec;
  }
  function strategiesSection(slot, ctx, avail) {
    var ids = slot.rows.filter(function (id) { return avail[id]; });
    var total = Object.keys(avail).filter(function (id) { return !/^thema-/.test(id) && id !== 'sector-leaders'; }).length;
    var sec = h('section', 'dr-sec dr-sec--strat');
    sec.innerHTML = railHead({ title: 'Strategien', more: 'Alle ' + total, href: '#/strategien', label: 'Alle ' + total + ' Strategien', sub: 'Feste Regeln aus den Geschäftszahlen (SEC).' });
    var track = rail('Strategien'); sec.appendChild(track);
    ids.forEach(function (id) {
      var cp = R().STRATEGY_COPY[id] || {}, a = h('a', 'dr-sk'); a.href = rowHref(id); a.setAttribute('role', 'listitem');
      a.innerHTML = hudIcon(cp.icon || 'bars', 40) + '<b>' + esc(R().title(id)) + '</b><span class="dr-sk__n">' + fmtInt(avail[id]) + ' Aktien</span><p>' + esc(cp.line || '') + '</p><span class="dr-sk__l"></span>';
      track.appendChild(a);
      whenNear(a, function () {
        loadRow(ctx, id).then(function (row) { if (a.isConnected) a.querySelector('.dr-sk__l').innerHTML = R().showcaseCards(row.cards, 4).map(function (c) { return U().logo(c.symbol); }).join(''); }).catch(function () {});
      });
    });
    return sec;
  }
  function endSection(ctx, avail) {
    var sec = h('section', 'dr-sec dr-sec--end');
    var n = R().ALL_GROUPS.reduce(function (k, g) { return k + g.rows.filter(function (r) { return avail && avail[r]; }).length; }, 0);
    sec.innerHTML = (n ? '<a class="dr-allrows" href="#/reihen">' + icon('grid', 20) + '<span><b>Alle ' + n + ' Reihen und ' + D.Views.Themes.all.length + ' Themen</b><span>Kursbewegung, Unternehmen, Indizes, Themen</span></span>' + U().glyph('next', 18) + '</a>' : '') +
      '<a class="dv3-swipecard" href="#/swipen">' + U().hud('discover', 46) + '<span><b>Aktien swipen, eine nach der anderen</b><span>Wische nach rechts zum Merken.</span></span>' + U().glyph('next', 22) + '</a>' +
      U().help((ctx.meta && ctx.meta.disclaimer) || 'Informationen zur eigenen Recherche, keine Anlageempfehlung.');
    return sec;
  }

  /* ------------------------------------------------------------ Genre-Chips */
  function bindGenres(page, ctx, draw) {
    var nav = page.querySelector('.dr-genres');
    if (!nav) return nav;
    nav.__drDraw = draw; /* der Kopf bleibt beim Neuzeichnen stehen: der Klick gilt immer der aktuellen Startseite */
    if (nav.dataset.bound) return nav;
    nav.dataset.bound = '1';
    nav.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-genre]'); if (!b) return;
      var g = b.dataset.genre === 'alle' ? null : b.dataset.genre;
      try { global.history.replaceState(global.history.state, '', g ? '#/?genre=' + g : '#/'); } catch (err) {}
      nav.__drDraw(g);
      var top = nav.getBoundingClientRect().top;
      if (top < 0 || top > global.innerHeight) nav.scrollIntoView({ block: 'start' });
    });
    return nav;
  }
  function paintGenres(page, g) {
    Array.prototype.forEach.call(page.querySelectorAll('.dr-genres button[data-genre]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.genre === (g || 'alle'))); });
    var intro = page.querySelector('.dv3-intro'), G = g && R().genre(g);
    var title = intro && intro.querySelector('.vu-lt'), lead = intro && intro.querySelector('.dr-genre-lead'), tag = intro && intro.querySelector('.dv3-asof');
    /* Zwei Zeilen als Blöcke, das Leerzeichen in der ersten: der Text bleibt „Was bewegt die Börse heute?“, auch nach dem Verkleinern des HTML. */
    if (title) title.innerHTML = (G ? G.title : 'Was bewegt\ndie Börse heute?').split('\n').map(function (l, i, a) { return '<span class="dr-l">' + esc(l + (i < a.length - 1 ? ' ' : '')) + '</span>'; }).join('');
    if (lead) { lead.hidden = !G; lead.textContent = G ? G.lead : ''; }
    if (tag) { if (!tag.dataset.base) tag.dataset.base = tag.textContent; tag.textContent = G ? 'Discover · ' + G.label : tag.dataset.base; }
    var search = intro && intro.querySelector('.v2-search-prompt'); if (search) search.hidden = !!G;
  }

  /* ------------------------------------------------------------ Startseite */
  function home(page, ctx) {
    var tag = page.querySelector('.dv3-asof');
    if (tag && ctx.asOf) { tag.textContent = 'Discover · ' + K().closeLabel(ctx.asOf); tag.dataset.base = tag.textContent; }
    var avail = R().available(ctx.meta, uid(ctx)), body = h('div', 'v2-journey dr-home'); page.appendChild(body);
    var hero = null, imBlick = null, drawn = false;
    var entry = ((ctx.meta && ctx.meta.home) || []).filter(function (x) { return x.universeId === uid(ctx); })[0];
    var heroP = entry && entry.chunks && entry.chunks[0] ? K().load(entry.chunks[0]).then(function (c) { return (c.surfaces || []).filter(function (s) { return s.type === 'hero'; })[0] || null; }).catch(function () { return null; }) : Promise.resolve(null);
    var rowP = avail['im-blick'] ? loadRow(ctx, 'im-blick').catch(function () { return null; }) : Promise.resolve(null);
    var wait = new Promise(function (r) { setTimeout(r, 2500); });
    var ready = Promise.all([heroP, rowP, ctx.liveIndex, Promise.race([ctx.fxReady, wait])]).then(function (r) { hero = r[0]; imBlick = r[1]; });

    function draw(g) {
      paintGenres(page, g);
      body.replaceChildren();
      if (g) {
        R().genrePlan(g, avail).forEach(function (slot) {
          if (slot.kind === 'themes') { var t = themesSection(ctx, true); if (t) body.appendChild(t); }
          else body.appendChild(railSection(slot, ctx, avail));
        });
        if (!body.children.length) body.innerHTML = U().blank('In diesem Genre gibt es heute keine Reihe mit Treffern.');
        body.appendChild(endSection(ctx, avail));
        if (!drawn) { drawn = true; document.dispatchEvent(new Event('vu-home-drawn')); }
        return;
      }
      var bb = h('section', 'dr-sec dr-bb dr-bb--wait', '<p class="v2-load-state" role="status">Aktien werden geladen …</p>'); body.appendChild(bb);
      var ms = h('section', 'dr-sec dr-sec--markt'); body.appendChild(ms); marketStrip(ms, ctx);
      var topSlot = h('div', 'dr-slot'); body.appendChild(topSlot);
      var followed = D.memory && D.memory.followedRows ? D.memory.followedRows() : [];
      R().homePlan(avail, { fresh: followed }).forEach(function (slot) {
        var node = null;
        if (slot.kind === 'top10') return;
        if (slot.kind === 'rail') node = railSection(slot, ctx, avail);
        else if (slot.kind === 'themes') node = themesSection(ctx, false);
        else if (slot.kind === 'strategies') node = strategiesSection(slot, ctx, avail);
        if (node) body.appendChild(node);
      });
      body.appendChild(endSection(ctx, avail));
      ready.then(function () {
        if (!bb.isConnected) return;
        var cards = billboardCards(hero, imBlick);
        if (cards.length) {
          var surface = Object.assign({}, hero || { type: 'hero', id: 'hero' }, { cards: cards });
          var view = D.Featured && D.Featured.live ? D.Featured.live(surface, ctx, billboard) : billboard(surface, ctx);
          bb.replaceWith(view);
        } else bb.innerHTML = '<p class="vu-ltag">Heute im Blick</p>' + U().blank('Heute steht keine Aktie im Blick.');
        var t = imBlick && top10Section(imBlick, ctx); if (t) topSlot.replaceWith(t); else topSlot.remove();
        if (!drawn) { drawn = true; document.dispatchEvent(new Event('vu-home-drawn')); }
      }).catch(function () {
        if (!bb.isConnected) return;
        bb.innerHTML = U().blank('Die Aktien konnten nicht geladen werden.');
        var retry = h('button', 'vu-btn vu-btn--line vu-btn--sm v2-load-more', 'Erneut versuchen'); retry.type = 'button';
        retry.onclick = function () { draw(null); }; bb.appendChild(retry);
      });
    }
    bindGenres(page, ctx, draw);
    var allChip = page.querySelector('.dr-genres__all'); if (allChip) allChip.hidden = false;
    bindPreview(body, ctx, function (sym, node) { return node.__card; });
    draw(R().genreFromHash(global.location && global.location.hash));
    return function () {};
  }

  /* ======================================================================
     PR 2 · Reihe, Vorschau, Alle Reihen (Folien DX04–DX06, Screens n-row,
     n-row-swipe, n-preview, n-all)
     ====================================================================== */

  /** Index Aktie -> Reihen aus dem Datenlauf (discover/data/membership/{U}.json), ein Abruf. */
  var memberCache = {};
  function membership(ctx) {
    var u = uid(ctx);
    if (!memberCache[u]) memberCache[u] = K().load('/discover/data/membership/' + u + '.json').then(function (m) {
      return function (sym) { return ((m.members || {})[sym] || []).map(function (x) { var r = m.rows[x[0]] || {}; return { id: r.id, rank: x[1], matched: r.matched }; }); };
    }).catch(function () { delete memberCache[u]; return function () { return []; }; });
    return memberCache[u];
  }
  function isTheme(id) { return /^thema-/.test(id); }
  function rowCfg(ctx, id) { return ((ctx.meta && ctx.meta.rowConfigs) || []).filter(function (r) { return r.id === id; })[0] || null; }
  function genreLabel(id) {
    var gs = R().genreOfRow(id).map(function (g) { return R().genre(g).label; });
    if (gs.length) return gs.join(' + ');
    var all = R().ALL_GROUPS.filter(function (g) { return g.rows.indexOf(id) >= 0; })[0];
    return all ? all.label : '';
  }
  function swipeHref(id) { return '#/swipen?reihe=' + encodeURIComponent(id); }

  /* ------------------------------------------------------------ Vorschau-Sheet (n-preview) */
  function preview(c, ctx, o) {
    o = o || {};
    var nm = shortName(c), body = h('div', 'dr-pv');
    var r12 = c.metrics && c.metrics.return12M;
    body.innerHTML = '<div class="dr-pv__id">' + U().logo(c.symbol, { xl: true }) + '<div><b>' + esc(nm) + '</b><span>' + esc([c.symbol, K().what(c)].filter(Boolean).join(' · ')) + '</span></div>' +
      '<button type="button" class="vu-round" data-dv3-close aria-label="Vorschau schließen">' + U().glyph('x', 16) + '</button></div>' +
      '<div class="dr-pv__pills">' + U().chg(isNum(r12) ? r12 * 100 : null, { digits: 0, big: true }) + '<span>12 Monate</span>' + pillDay(c) + '<span>heute</span></div>' +
      '<div class="dr-pv__chart"></div><div class="dr-bb__dates dr-pv__dates"><span></span><span></span></div>' +
      '<p class="dr-pv__hook">' + esc((c.hook && c.hook.text) || K().story(c)) + '</p>' +
      '<p class="vu-ltag dr-pv__in">Reihen werden geladen …</p><div class="dr-pv__rows"></div>' +
      '<div class="dr-pv__act"><a class="vu-btn vu-btn--ink" href="' + esc(K().stockHref(ctx, c.symbol) + (o.row ? '?reihe=' + encodeURIComponent(o.row) : '')) + '" data-dv3-close>Aktie ansehen</a>' +
      '<button type="button" class="vu-round dr-pv__heart">' + U().glyph('heart', 20) + '</button>' +
      '<a class="vu-round dr-pv__swipe" href="' + esc(o.row ? swipeHref(o.row) : '#/swipen') + '" aria-label="' + esc(o.row ? 'Reihe swipen' : 'Swipen') + '" data-dv3-close>' + icon('swipe', 20) + '</a></div>';
    var dates = body.querySelectorAll('.dr-pv__dates span');
    body.querySelector('.dr-pv__chart').appendChild(K().spark(c, { big: true, eager: true, width: 354, height: 120, onDates: function (a, b) { dates[0].textContent = K().dayYear(a); dates[1].textContent = K().dayYear(b); } }));
    K().heart(body.querySelector('.dr-pv__heart'), ctx, c.symbol, nm);
    var el = K().sheet(nm, body); el.classList.add('dr-pvsheet');
    membership(ctx).then(function (of) {
      var rows = of(c.symbol).filter(function (m) { return !isTheme(m.id) && m.id !== 'sector-leaders'; });
      var head = body.querySelector('.dr-pv__in'), box = body.querySelector('.dr-pv__rows');
      if (!rows.length) { head.textContent = 'Steht heute in keiner weiteren Reihe'; return; }
      head.textContent = 'Steht heute in ' + rows.length + (rows.length === 1 ? ' Reihe' : ' Reihen');
      rows.sort(function (a, b) { return a.rank / (a.matched || 1) - b.rank / (b.matched || 1); });
      box.innerHTML = rows.map(function (m, i) { return '<a class="vu-chip' + (i ? '' : ' vu-chip--lime') + '" href="' + esc(rowHref(m.id)) + '" data-dv3-close>' + esc(R().title(m.id)) + '</a>'; }).join('');
    });
    return el;
  }
  /** Halten (500 ms), Rechtsklick oder die Taste „?“ auf einem Poster öffnet die Vorschau, ohne die Seite zu verlassen. */
  function bindPreview(scope, ctx, lookup) {
    if (scope.__drPv) return; scope.__drPv = true;
    var timer = 0, fired = false, sx = 0, sy = 0;
    function cardOf(t) { var p = t && t.closest && t.closest('.dr-poster'); return p ? { node: p, data: lookup(p.dataset.symbol, p), row: p.dataset.row || null } : null; }
    function open(hit) { if (hit && hit.data) preview(hit.data, ctx, { row: hit.row }); }
    scope.addEventListener('pointerdown', function (e) {
      var hit = cardOf(e.target); if (!hit || e.target.closest('.dr-heart')) return;
      fired = false; sx = e.clientX; sy = e.clientY; clearTimeout(timer);
      timer = setTimeout(function () { fired = true; open(hit); }, 500);
    });
    scope.addEventListener('pointermove', function (e) { if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) { clearTimeout(timer); timer = 0; } }, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { scope.addEventListener(t, function () { clearTimeout(timer); timer = 0; }); });
    scope.addEventListener('click', function (e) { if (fired && cardOf(e.target)) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
    scope.addEventListener('contextmenu', function (e) { var hit = cardOf(e.target); if (hit) { e.preventDefault(); open(hit); } });
    scope.addEventListener('keydown', function (e) { if (e.key === '?') { var hit = cardOf(e.target); if (hit) { e.preventDefault(); open(hit); } } });
  }

  /* ------------------------------------------------------------ Seite einer Reihe (n-row) */
  var SORT_LABEL = { distanceTo52wHigh: 'Abstand', return3M: '3 Monate', return12M: '12 Monate', f_revenueGrowth3y: 'Umsatz', f_revenueGrowth10y: 'Umsatz', f_pe: 'KGV',
    f_fcfMargin: 'Cashflow', f_earningsAcceleration: 'Gewinn', f_marginExpansion3y: 'Marge', leadershipScore: 'Stärke', momentumScore: 'Stärke', relativeStrengthScore: 'Stärke', breakoutScore: 'Ausbruch', imBlickScore: 'Rang', volatility252d: 'Ruhe' };
  var SIMILAR = { 'fallen-angels': ['comeback', 'langfristige-compounder', 'qualitaet-zum-preis', 'fundamentale-turnarounds'] };
  var SIM_ICON = ['signal', 'bars', 'target', 'new'];
  function similarRows(id, avail) {
    var list = SIMILAR[id] || [];
    if (!list.length) R().genreOfRow(id).concat(['entdecken']).forEach(function (g) {
      var grp = R().ALL_GROUPS.filter(function (x) { return x.id === g; })[0];
      ((grp && grp.rows) || []).forEach(function (r) { if (r !== id && list.indexOf(r) < 0) list.push(r); });
    });
    return list.filter(function (r) { return r !== id && avail[r]; }).slice(0, 4);
  }
  function titleHtml(t) {
    var i = t.lastIndexOf(' ');
    return i > 0 ? esc(t.slice(0, i)) + '<br><span>' + esc(t.slice(i + 1)) + '</span>' : '<span>' + esc(t) + '</span>';
  }
  function rankLine(c, i, ctx, o) {
    var a = h('a', 'dr-rk'); a.href = K().stockHref(ctx, c.symbol) + '?reihe=' + encodeURIComponent(o.row); a.dataset.symbol = c.symbol;
    var p = PILLS[o.pill] || PILLS.r12;
    a.innerHTML = '<b class="dr-rk__n">' + (i + 1) + '</b>' + U().logo(c.symbol) + '<span class="dr-rk__t"><b>' + esc(shortName(c)) + '</b><span>' + esc((c.hook && c.hook.text) || K().story(c)) + '</span></span>' +
      '<span class="dr-rk__v">' + p[0](c) + '<small>' + esc(p[1]) + '</small></span>';
    return a;
  }
  async function rowPage(root, ctx, id, active) {
    K().bindHelp();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Ungültige Reihe');
    var row = await loadRow(ctx, id);
    if (!active()) return;
    if (row.sectors) return D.V3.strategie(root, ctx, id, function () { return active(); });
    var avail = R().available(ctx.meta, uid(ctx)), title = R().title(id, row.title), cards = row.cards || [], cov = row.coverage || {};
    var cfg = rowCfg(ctx, id) || {}, pill = id === 'fallen-angels' ? 'fromHigh' : 'r12', mem = D.memory;
    document.title = title + ' — Discover';
    if (mem) mem.recordCollection(id);
    var page = h('div', 'dv3 vu-ui dr-row');
    var tags = (id === 'fallen-angels' ? '<span class="dr-tag">Neu</span>' : '') + (genreLabel(id) ? '<span class="dr-tag dr-tag--ink">' + esc(genreLabel(id)) + '</span>' : '');
    var stand = row.asOf ? K().closeLabel(row.asOf).replace('Schluss ', '') : '';
    page.innerHTML = '<header class="dr-rowhero"><div class="dr-rowhero__nav"><a class="dr-rowhero__b" href="#/" aria-label="Zurück zur Startseite">' + U().glyph('back', 18) + '</a></div>' +
      (tags ? '<div class="dr-rowhero__tags">' + tags + '</div>' : '') + '<h1>' + titleHtml(title) + '</h1>' +
      '<p class="dr-rowhero__sub">' + esc(R().homeSub(id, row.subtitle)) + '</p><div class="dr-rowhero__logos"></div>' +
      '<p class="dr-rowhero__n">' + esc(fmtInt(cov.matched) + ' Aktien' + (stand ? ' · Stand ' + stand : '')) + '</p>' +
      '<div class="dr-rowhero__act"><a class="vu-btn" href="' + esc(swipeHref(id)) + '">' + icon('swipe', 18) + 'Reihe swipen</a>' +
      '<button type="button" class="vu-btn vu-btn--line dr-follow">' + U().glyph('plus', 18) + '<span>Reihe merken</span></button></div></header>' +
      '<section class="dr-rule vu-box"><p class="vu-ltag">Wie kommt eine Aktie hier rein?</p><div class="dr-rule__list"></div></section>' +
      '<div class="dr-sorts"></div><div class="dr-rks" role="list"></div><div class="dr-more"></div><section class="dr-sec dr-sec--sim"></section>' +
      U().help('Feste Regeln, nachgerechnet am ' + (row.asOf ? K().dayYear(row.asOf) : 'letzten Handelstag') + '. Keine Anlageempfehlung.');
    root.appendChild(page);
    page.querySelector('.dr-rowhero__logos').innerHTML = R().showcaseCards(cards, 6).map(function (c) { return U().logo(c.symbol); }).join('');
    /* Reihe merken: auf dem Gerät; gemerkte Reihen rücken auf der Startseite nach oben. Eine Glocke gibt es erst, wenn das Konto Benachrichtigungen je Reihe zustellt. */
    var follow = page.querySelector('.dr-follow');
    if (!mem || !mem.followRow || !mem.available()) follow.hidden = true;
    else {
      var paintF = function () { var on = mem.follows(id); follow.setAttribute('aria-pressed', String(on)); follow.querySelector('span').textContent = on ? 'Gemerkt' : 'Reihe merken'; };
      follow.addEventListener('click', function () { mem.followRow(id, !mem.follows(id)); paintF(); }); paintF();
    }
    var rules = (cfg.explain && cfg.explain.length ? cfg.explain : [R().shortSub(row.subtitle)]).filter(Boolean);
    page.querySelector('.dr-rule__list').innerHTML = rules.map(function (t) { return '<p class="dr-rule__i"><span aria-hidden="true">' + U().glyph('check', 14) + '</span><span>' + esc(t) + '</span></p>'; }).join('') +
      U().help(id === 'fallen-angels' ? 'Ein tiefer Kurs sagt nichts darüber, wie es weitergeht. Die Reihe zeigt nur, wo Zahlen und Kurs auseinanderlaufen.' : 'Die Regel beschreibt Kurs und Zahlen von gestern. Sie sagt nichts darüber, wie es weitergeht.') +
      (cov.note ? U().help(cov.note) : '');
    var sortKey = row.sort, SORTS = [['rang', SORT_LABEL[sortKey] || 'Rang']];
    if (/^f_/.test(sortKey) || /^fund/.test(String(row.world || ''))) { if (sortKey !== 'f_revenueGrowth3y') SORTS.push(['umsatz', 'Umsatz']); } else if (sortKey !== 'return12M') SORTS.push(['r12', '12 Monate']);
    if (pill === 'fromHigh' && SORTS.length < 2) SORTS.push(['umsatz', 'Umsatz']);
    SORTS.push(['name', 'Name']);
    var state = { sort: 'rang', all: false }, list = page.querySelector('.dr-rks'), more = page.querySelector('.dr-more');
    page.querySelector('.dr-sorts').innerHTML = U().seg(SORTS.map(function (x) { return { id: x[0], label: x[1] }; }), 'rang', { tabs: true, label: 'Sortierung' });
    function metric(c, k) { var v = c.metrics && c.metrics[k]; return isNum(v) ? v : null; }
    function sorted() {
      var xs = cards.map(function (c, i) { return { c: c, i: i }; });
      var by = { r12: 'return12M', umsatz: 'f_revenueGrowth3y' }[state.sort];
      if (state.sort === 'name') xs.sort(function (a, b) { return shortName(a.c).localeCompare(shortName(b.c), 'de'); });
      else if (by) xs.sort(function (a, b) { var x = metric(a.c, by), y = metric(b.c, by); return (y == null) - (x == null) || (y || 0) - (x || 0) || a.i - b.i; });
      return xs.map(function (x) { return x.c; });
    }
    function draw() {
      list.replaceChildren();
      var xs = sorted();
      (state.all ? xs : xs.slice(0, 8)).forEach(function (c, i) { var a = rankLine(c, state.sort === 'rang' ? cards.indexOf(c) : i, ctx, { row: id, pill: pill }); a.setAttribute('role', 'listitem'); list.appendChild(a); });
      Array.prototype.forEach.call(page.querySelectorAll('.dr-sorts .vu-seg button'), function (b) { b.setAttribute('aria-selected', String(b.dataset.id === state.sort)); b.tabIndex = b.dataset.id === state.sort ? 0 : -1; });
      more.innerHTML = !state.all && cards.length > 8 ? '<button type="button" class="vu-btn vu-btn--line vu-btn--block dr-more__b">Alle ' + cards.length + ' anzeigen</button>' : '';
      if (state.all && isNum(cov.matched) && cov.matched > cards.length) more.innerHTML = U().help('Gezeigt werden die ersten ' + cards.length + ' von ' + fmtInt(cov.matched) + ' Treffern nach der Regel der Reihe.');
    }
    if (!cards.length) list.innerHTML = U().blank('Heute erfüllt keine Aktie diese Regel.');
    else draw();
    page.querySelector('.dr-sorts').addEventListener('click', function (e) { var b = e.target.closest('button[data-id]'); if (b) { state.sort = b.dataset.id; draw(); } });
    more.addEventListener('click', function (e) { if (e.target.closest('.dr-more__b')) { state.all = true; draw(); } });
    var sim = similarRows(id, avail), simSec = page.querySelector('.dr-sec--sim');
    if (sim.length) {
      simSec.innerHTML = railHead({ title: 'Ähnliche Reihen' });
      var tr = rail('Ähnliche Reihen'); simSec.appendChild(tr);
      sim.forEach(function (r, i) { var a = h('a', 'dr-sk dr-sk--sm'); a.href = rowHref(r); a.setAttribute('role', 'listitem'); a.innerHTML = hudIcon(SIM_ICON[i % 4], 36) + '<b>' + esc(R().title(r)) + '</b><span class="dr-sk__n">' + fmtInt(avail[r]) + ' Aktien</span>'; tr.appendChild(a); });
    } else simSec.remove();
  }

  /* ------------------------------------------------------------ Reihe swipen (n-row-swipe) */
  async function rowSwipe(root, ctx, id, active) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Ungültige Reihe');
    var row = await loadRow(ctx, id);
    if (!active()) return;
    var cards = (row.cards || []).filter(function (c) { return c && c.symbol; }), title = R().title(id, row.title), pill = id === 'fallen-angels' ? 'fromHigh' : 'r12';
    var key = 'reihe:' + id, mem = D.memory, st = K().store(ctx);
    var i = mem ? mem.position(key) : 0; if (!(i >= 0 && i < cards.length)) i = 0;
    document.title = title + ' swipen — Discover';
    var page = h('div', 'dv3 vu-ui dr-rsw');
    page.innerHTML = '<div class="dr-rsw__head"><div><p class="vu-ltag">Reihe swipen</p><h1>' + esc(title) + '</h1></div><span class="dr-rsw__pos" aria-live="polite"></span></div><div class="dr-rsw__prog"><i></i></div>' +
      '<div class="dr-rsw__stage"></div><div class="dr-rsw__btns"><button type="button" class="dr-rsw__b" data-a="skip" aria-label="Weiter, nicht merken">' + U().glyph('x', 24) + '</button>' +
      '<button type="button" class="dr-rsw__b dr-rsw__b--sm" data-a="back" aria-label="Zurück">' + U().glyph('back', 20) + '</button>' +
      '<button type="button" class="dr-rsw__b dr-rsw__b--lime" data-a="keep" aria-label="Merken">' + U().glyph('heart', 24) + '</button></div>' +
      '<p class="dr-rsw__end" hidden>Das war die ganze Reihe. <a href="' + esc(rowHref(id)) + '">Zur Reihe</a></p>';
    root.appendChild(page);
    if (!cards.length) { page.querySelector('.dr-rsw__stage').innerHTML = U().blank('Heute erfüllt keine Aktie diese Regel.'); return; }
    if (!st) page.querySelector('[data-a="keep"]').setAttribute('aria-label', 'Weiter');
    var stage = page.querySelector('.dr-rsw__stage'), of = function () { return []; };
    membership(ctx).then(function (f) { of = f; show(); });
    function show() {
      var c = cards[i], nm = shortName(c), p = PILLS[pill];
      page.querySelector('.dr-rsw__pos').textContent = (i + 1) + ' von ' + cards.length;
      page.querySelector('.dr-rsw__prog i').style.width = ((i + 1) / cards.length * 100).toFixed(1) + '%';
      var chips = of(c.symbol).filter(function (m) { return !isTheme(m.id) && m.id !== id && m.id !== 'sector-leaders'; }).slice(0, 3);
      stage.innerHTML = '<a class="dr-rsw__card" href="' + esc(K().stockHref(ctx, c.symbol) + '?reihe=' + encodeURIComponent(id)) + '" data-symbol="' + esc(c.symbol) + '">' +
        '<span class="dr-rsw__id">' + U().logo(c.symbol, { xl: true }) + '<span><b>' + esc(nm) + '</b><small>' + esc(c.symbol) + '</small></span></span>' +
        '<span class="dr-rsw__v">' + p[0](c) + '<span>' + esc(pill === 'fromHigh' ? 'unter dem 52-Wochen-Hoch' : 'in 12 Monaten') + '</span></span>' +
        '<span class="dr-rsw__hook">' + esc((c.hook && c.hook.text) || K().story(c)) + '</span><span class="dr-rsw__chart"></span><span class="dr-bb__dates"><span></span><span></span></span>' +
        (chips.length ? '<span class="dr-rsw__chips">' + chips.map(function (m) { return '<span class="vu-chip">' + esc(R().title(m.id)) + '</span>'; }).join('') + '</span>' : '') + '</a>';
      var d = stage.querySelectorAll('.dr-bb__dates span');
      stage.querySelector('.dr-rsw__chart').appendChild(K().spark(c, { big: true, eager: true, width: 320, height: 150, onDates: function (a, b) { d[0].textContent = K().dayYear(a); d[1].textContent = K().dayYear(b); } }));
      var keepBtn = page.querySelector('[data-a="keep"]'); if (st) keepBtn.setAttribute('aria-pressed', String(st.has(c.symbol)));
      page.querySelector('[data-a="back"]').disabled = i === 0;
      if (mem) mem.setPosition(key, i);
    }
    function step(d) {
      if (i + d >= cards.length) { page.querySelector('.dr-rsw__end').hidden = false; if (mem) mem.setPosition(key, 0); return; }
      i = Math.max(0, i + d); page.querySelector('.dr-rsw__end').hidden = true; show();
    }
    page.querySelector('.dr-rsw__btns').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      if (b.dataset.a === 'keep' && st && !st.has(cards[i].symbol)) st.toggle(cards[i].symbol);
      step(b.dataset.a === 'back' ? -1 : 1);
    });
    var x0 = null;
    stage.addEventListener('pointerdown', function (e) { x0 = e.clientX; }, { passive: true });
    stage.addEventListener('pointerup', function (e) { if (x0 == null) return; var dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) { e.preventDefault(); if (dx > 0 && st && !st.has(cards[i].symbol)) st.toggle(cards[i].symbol); step(1); } });
    stage.addEventListener('click', function (e) { if (x0 === null && e.defaultPrevented) e.stopPropagation(); });
    show();
  }

  /* ------------------------------------------------------------ Alle Reihen (n-all) */
  function allRows(root, ctx) {
    var avail = R().available(ctx.meta, uid(ctx)), T = D.Views.Themes;
    var groups = R().ALL_GROUPS.map(function (g) { return { g: g, ids: g.rows.filter(function (r) { return avail[r]; }) }; }).filter(function (x) { return x.ids.length; });
    var total = groups.reduce(function (n, x) { return n + x.ids.length; }, 0);
    document.title = 'Alle Reihen — Discover — Vision Universe®';
    var page = h('div', 'dv3 vu-ui dr-all');
    page.innerHTML = '<div class="dr-all__head"><h1 class="vu-lt">Alle Reihen</h1><a class="vu-round" href="#/" aria-label="Schließen">' + U().glyph('x', 18) + '</a></div>' +
      '<p class="vu-lead">' + total + ' Reihen nach festen Regeln und ' + T.all.length + ' Themenwelten.</p>' +
      groups.map(function (x) {
        return '<div class="dr-all__g"><h2>' + esc(x.g.label) + '</h2><span>' + x.ids.length + '</span></div><div class="vu-box dr-all__list">' + x.ids.map(function (r) {
          return '<a class="dr-all__r" href="' + esc(rowHref(r)) + '"><span><b>' + esc(R().title(r)) + '</b>' + (r === 'fallen-angels' ? '<span class="dr-tag">Neu</span>' : '') + '</span><span>' + fmtInt(avail[r]) + U().glyph('next', 13) + '</span></a>';
        }).join('') + '</div>';
      }).join('') +
      '<div class="dr-all__g"><h2>Themenwelten</h2><a href="#/welten">Alle ' + T.all.length + '</a></div>';
    var tr = rail('Themenwelten'); tr.classList.add('dr-all__themes');
    T.all.slice(0, 8).forEach(function (t) { var c = K().themeCard(t, ctx); c.setAttribute('role', 'listitem'); tr.appendChild(c); });
    page.appendChild(tr);
    root.appendChild(page);
  }

  D.ReihenUI = { rowPage: rowPage, rowSwipe: rowSwipe, allRows: allRows, preview: preview, membership: membership, home: home, poster: poster, railHead: railHead, rail: rail, shortName: shortName, rowHref: rowHref, loadRow: loadRow, billboardCards: billboardCards, whenNear: whenNear, icon: icon, hudIcon: hudIcon, PILLS: PILLS };
})(window);
