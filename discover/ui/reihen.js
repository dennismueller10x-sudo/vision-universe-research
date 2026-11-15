/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/reihen.js       Konzept „Reihe für Reihe“

   Vorlage: docs/design/discover-netflix-2026-11 (HANDOVER.md, Screens n-* in
   deck.js, Stile im zweiten <style>-Block von index.html). Regeln (Reihenfolge,
   Genres, Schaufenster) stehen in discover/engines/reihen.js; diese Datei
   zeichnet nur. Bausteine aus discover/ui/v3.js (D.V3.kit), assets/vu-ui.js
   (VUUI) und der eine Chart (assets/vu-chart.js).

   Liegt bewusst nicht unter den gezaehlten Budget-Dateien
   (discover/(app|home|detail|themes).(js|css)).

   Startseite (App-Konzept 2, Prototyp „v-discover“, seit 15.11.2026): Aktie des
   Tages (immer dunkel, 520 px bis an den Rand, wischbar 1–5) -> Reiter im Inhalt
   -> Weiter ansehen -> Top 10 heute -> Themen -> Neue Jahreshochs -> Was sich
   heute bewegt -> Langfristige Compounder -> übrige Reihen -> Wie steht die
   Börse? -> Alle N Reihen (mit Genres und Suche) -> Swipen, Weiter, Hinweis.
   Mit Genre (#/?genre=…): Kopf mit Frage und Genre-Chips, darunter die Reihen. Schienen laden ihre Reihe erst, wenn sie in die Naehe
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
    x = x.replace(/\s*&$/, ''); /* „Eli Lilly & Co“ -> „Eli Lilly“, nicht „Eli Lilly &“ */
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
  /** App-Konzept 2 (Prototyp „sh“): Abschnittskopf, Titel 22 px, rechts „Mehr ›“. */
  function protoHead(o) {
    return '<div class="dr-head dp-sh"><div class="dr-head__t"><h2>' + esc(o.title) + '</h2>' +
      (o.href ? '<a href="' + esc(o.href) + '"' + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '>' + esc(o.more || 'Alle') + ' ›</a>' : '') + '</div>' +
      (o.sub ? '<p>' + esc(o.sub) + '</p>' : '') + '</div>';
  }
  /** Aktien-Element: Ziel für die Vorschau, die der Rahmen einhängt (data-vu-stock). */
  function stockAttrs(c) { return ' data-vu-stock="' + esc(c.symbol) + '" data-vu-stock-name="' + esc(shortName(c)) + '"'; }
  /** Poster (Standard-Format jeder Schiene): Logo, Merken, Name, Kuerzel, Mini-Chart 1 Jahr, eine Pille.
      o.proto (Startseite, Prototyp „poster“): Logo, Name, Kurslinie, Pille – ohne Merken und Kürzel. */
  function poster(c, ctx, o) {
    o = o || {};
    var p = PILLS[o.pill] || PILLS.r12, nm = shortName(c);
    var box = h('div', 'dr-poster' + (o.proto ? ' dp-poster' : '')); box.dataset.symbol = c.symbol; box.setAttribute('role', 'listitem');
    box.__card = c; if (o.row) box.dataset.row = o.row;
    var href = esc(K().stockHref(ctx, c.symbol) + (o.row ? '?reihe=' + encodeURIComponent(o.row) : ''));
    if (o.proto) {
      var r12 = c.metrics && c.metrics.return12M;
      if (isNum(r12) && r12 < 0) box.classList.add('dp-down');
      /* Die Pille trägt im Prototyp keine Beschriftung; der Zeitraum steht im Namen des Links. Nur „vom Hoch“ bleibt sichtbar, sonst läse man es als Kursänderung. */
      box.innerHTML = (o.badge ? '<span class="dr-badge">' + esc(o.badge) + '</span>' : '') +
        '<a class="dr-poster__a" href="' + href + '"' + stockAttrs(c) + ' aria-label="' + esc(nm + ', ' + c.symbol + ' (Pille: ' + p[1] + ')') + '">' + U().logo(c.symbol) +
        '<b class="dr-poster__n">' + esc(nm) + '</b><span class="dr-poster__ch"></span>' +
        '<span class="dr-poster__v">' + p[0](c) + (o.pill === 'fromHigh' ? '<small>' + esc(p[1]) + '</small>' : '') + '</span>' + (o.extra || '') + '</a>';
      box.querySelector('.dr-poster__ch').appendChild(K().spark(c, { width: 104, height: 38 }));
      return box;
    }
    box.innerHTML = (o.badge ? '<span class="dr-badge">' + esc(o.badge) + '</span>' : '') +
      '<a class="dr-poster__a" href="' + href + '"' + stockAttrs(c) + ' aria-label="' + esc(nm + ', ' + c.symbol) + '">' + U().logo(c.symbol) +
      '<b class="dr-poster__n">' + esc(nm) + '</b><span class="dr-poster__t">' + esc(c.symbol) + '</span><span class="dr-poster__ch"></span>' +
      '<span class="dr-poster__v">' + p[0](c) + '<small>' + esc(p[1]) + '</small></span></a>' +
      '<button type="button" class="dr-heart">' + U().glyph('heart', 15) + '</button>';
    box.querySelector('.dr-poster__ch').appendChild(K().spark(c, { width: o.chartW || 112, height: 40 }));
    K().heart(box.querySelector('.dr-heart'), ctx, c.symbol, nm);
    return box;
  }
  /** Top 10 (Prototyp „top10“): grosse Ziffer als Umriss hinter dem Poster. */
  function top10(c, i, ctx) {
    var box = h('div', 'dr-t10'); box.setAttribute('role', 'listitem');
    box.innerHTML = '<span class="dr-t10__n" aria-hidden="true">' + (i + 1) + '</span>';
    var p = poster(c, ctx, { proto: true, row: 'im-blick' }); p.removeAttribute('role');
    p.querySelector('.dr-poster__a').setAttribute('aria-label', 'Platz ' + (i + 1) + ': ' + shortName(c) + ', ' + c.symbol + ' (Pille: 12 Mon.)');
    box.appendChild(p);
    return box;
  }
  function rail(label) { var r = h('div', 'dr-rail'); r.setAttribute('role', 'list'); r.setAttribute('aria-label', label); return r; }
  function skeleton(n, cls) { return Array.from({ length: n }, function () { return '<span class="dr-skel ' + (cls || '') + '" aria-hidden="true"></span>'; }).join(''); }

  /* ------------------------------------------------------------ Aktie des Tages (Prototyp „bleed“) */
  /** Karten fuer das Billboard: die Eingangsflaeche (mit Gruenden), dann die Reihe „Heute im Blick“, Schaufenster-Regel, hoechstens 5. */
  function billboardCards(hero, row) {
    var seen = {}, out = [];
    ((hero && hero.cards) || []).concat((row && row.cards) || []).forEach(function (c) {
      if (out.length < 5 && c && !seen[c.symbol] && R().showcase(c)) { seen[c.symbol] = 1; out.push(c); }
    });
    return out;
  }
  function heroWidth() { return Math.round(Math.max(320, Math.min(global.innerWidth || 390, 672))); }
  /** Zweite Zeile unter dem Satz: Zeitraum der Pille und der erste Grund (z. B. „in 12 Monaten · Ausbruch mit Volumen“). */
  function heroWhy(c) {
    var z = c.plain && c.plain.zahl, reasons = (c.imBlick && c.imBlick.reasons) || c.reasons || [];
    /* Erst der kurze Klartext-Zusatz (discover/engines/klartext.js), sonst der erste Grund; alle Gründe stehen im Fenster „?“. */
    var r = reasons[0], extra = (c.plain && c.plain.zusatz) || (r ? (r.id === 'breakout' && /Volumen/.test(r.value || '') ? 'Ausbruch mit Volumen' : r.label + (r.value ? ': ' + r.value : '')) : '');
    return [z && z.label && /12 Monaten/.test(z.label) ? z.label : 'in 12 Monaten', extra].filter(Boolean).join(' · ');
  }
  function billboardSlide(c, i, n, ctx, surface) {
    var art = h('article', 'dr-bb__slide dp-hero__slide'); art.dataset.symbol = c.symbol; art.setAttribute('role', 'listitem');
    art.setAttribute('aria-label', 'Nr. ' + (i + 1) + ' von ' + n + ': ' + shortName(c));
    var r12 = c.metrics && c.metrics.return12M, sub = K().what(c);
    art.innerHTML = '<div class="dr-bb__chart dp-hero__chart"></div><div class="dp-hero__shade" aria-hidden="true"></div>' +
      '<div class="dp-hero__body"><div class="dr-bb__tag dp-hero__tags"><span class="dp-pill dp-pill--sm">Nr. ' + (i + 1) + ' heute</span><span class="dp-pill dp-pill--sm dp-pill--bk" data-hero-theme>' +
      esc(surface && surface.live ? 'Heute im Blick · laufende Sitzung' : 'Heute im Blick') + '</span></div>' +
      '<div class="dr-bb__id dp-hero__id"' + stockAttrs(c) + '>' + U().logo(c.symbol, { xl: true }) + '<div><h2' + (shortName(c).length > 11 ? ' class="dp-long"' : '') + '>' + esc(shortName(c)) + '</h2><p>' + esc(sub || c.symbol) + '</p></div></div>' +
      '<div class="dr-bb__big dp-hero__big">' + U().chg(isNum(r12) ? r12 * 100 : null, { digits: 0, big: true }) + '<div><b class="dr-bb__story">' + esc(K().story(c)) + '</b><span>' + esc(heroWhy(c)) + '</span></div></div>' +
      '<div class="dr-bb__act dp-hero__act"><a class="dp-btn" href="' + esc(K().stockHref(ctx, c.symbol)) + '" aria-label="' + esc(shortName(c) + ' ansehen') + '">Ansehen</a>' +
      '<button type="button" class="dp-rnd dr-bb__keep" aria-pressed="false">' + U().glyph('heart', 18) + '</button>' +
      '<button type="button" class="dp-rnd dr-bb__q" aria-label="Warum steht ' + esc(shortName(c)) + ' hier?">?</button></div></div>';
    art.querySelector('.dr-bb__chart').appendChild(K().spark(c, { big: true, width: heroWidth(), height: 260 }));
    var keep = art.querySelector('.dr-bb__keep'), st = K().store(ctx);
    if (!st) keep.hidden = true;
    else K().heart(keep, ctx, c.symbol, shortName(c));
    art.querySelector('.dr-bb__q').addEventListener('click', function () { K().whySheet(c, ctx, surface); });
    return art;
  }
  /** Thema der Aktie (Reihen-Zugehörigkeit aus dem Datenlauf, discover/data/membership) als zweites Etikett, wie im Prototyp. */
  function heroThemes(sec, ctx) {
    membership(ctx).then(function (of) {
      Array.prototype.forEach.call(sec.querySelectorAll('.dp-hero__slide'), function (s) {
        var best = of(s.dataset.symbol).filter(function (m) { return isTheme(m.id) && D.Views.Themes.byRow(m.id); })
          .sort(function (a, b) { return a.rank / (a.matched || 1) - b.rank / (b.matched || 1); })[0];
        var tag = s.querySelector('[data-hero-theme]');
        /* Während der laufenden Sitzung bleibt „Heute im Blick · laufende Sitzung“ stehen (Hinweis auf Intraday-Daten). */
        if (best && tag && sec.isConnected && !/laufende Sitzung/.test(tag.textContent)) tag.textContent = D.Views.Themes.byRow(best.id).title;
      });
    }).catch(function () {});
  }
  function billboard(surface, ctx) {
    var cards = surface.cards || [];
    var sec = h('section', 'dr-sec dr-bb dp-hero v2-spotlight'); sec.setAttribute('aria-label', 'Heute im Blick');
    var track = h('div', 'dr-bb__track v2-hero-track'); track.setAttribute('role', 'list'); track.setAttribute('aria-label', 'Heute im Blick, 1 bis ' + cards.length);
    cards.forEach(function (c, i) { track.appendChild(billboardSlide(c, i, cards.length, ctx, surface)); });
    var dots = h('div', 'dr-bb__dots dp-hero__dots', cards.map(function (_, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join(''));
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
    setTimeout(function () { if (sec.isConnected) heroThemes(sec, ctx); }, 600);
    return sec;
  }

  /* ------------------------------------------------------------ Reiter im Inhalt (Prototyp „tabs2“) */
  var TABS = [['start', 'Start'], ['themen', 'Themen'], ['reihen', 'Reihen'], ['maerkte', 'Märkte']];
  function tabsBar(body) {
    var nav = h('nav', 'dp-tabs'); nav.setAttribute('aria-label', 'Discover');
    nav.innerHTML = TABS.map(function (t, i) { return '<button type="button" class="dp-tab' + (i ? '' : ' on') + '" data-dp-tab="' + t[0] + '"' + (i ? '' : ' aria-current="true"') + '>' + esc(t[1]) + '</button>'; }).join('');
    nav.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dp-tab]'); if (!b) return;
      Array.prototype.forEach.call(nav.children, function (x) { x.classList.toggle('on', x === b); if (x === b) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
      var id = b.dataset.dpTab, target = id === 'start' ? null : body.querySelector('[data-dp-anchor="' + id + '"]');
      var off = nav.getBoundingClientRect().height + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vu-navigation-height')) || 56);
      global.scrollTo({ top: target ? Math.max(0, target.getBoundingClientRect().top + global.scrollY - off) : 0, behavior: 'smooth' });
    });
    return nav;
  }

  /* ------------------------------------------------------------ Markt (Prototyp „Wie steht die Börse?“) */
  function marketSection(ctx) {
    var sec = h('section', 'dr-sec dr-sec--markt'); sec.dataset.dpAnchor = 'maerkte';
    sec.innerHTML = protoHead({ title: 'Wie steht die Börse?' }) +
      '<a class="dr-ms dp-tile dp-mk" href="#/maerkte" aria-label="Wie steht die Börse? Märkte ansehen"><span class="dp-mk__top"><span class="dr-ms__lvl"><b>…</b><small></small></span><span class="dp-mk__hist" hidden><b></b><small>von 100 Fällen<br>ein Jahr später im Plus</small></span></span>' +
      '<span class="dr-ms__scale dp-mk__scale" aria-hidden="true"></span><span class="dp-mk__ends"><span></span><span></span></span></a>' +
      '<div class="dp-tile dp-idx" aria-label="Große US-Indizes heute">' + [['QQQ', 'Nasdaq'], ['SPY', 'S&P 500'], ['DIA', 'Dow Jones']].map(function (x) { return '<span class="dr-ms__i" data-s="' + x[0] + '"><span>' + esc(x[1]) + '</span>' + U().chg(null) + '</span>'; }).join('') + '</div>';
    var a = sec.querySelector('.dp-mk'), lvl = a.querySelector('.dr-ms__lvl');
    K().load('/quant/data/market/intelligence/market-pulse.json').then(function (p) {
      var env = p && p.environment; if (!a.isConnected) return;
      if (!env || !isNum(env.level)) { lvl.querySelector('b').textContent = 'Keine Einordnung'; return; }
      var scale = env.scale || [], steps = scale.length || 5;
      lvl.querySelector('b').textContent = env.label;
      lvl.querySelector('small').textContent = 'Stufe ' + (env.level + 1) + ' von ' + steps;
      a.querySelector('.dp-mk__scale').innerHTML = Array.from({ length: steps }, function (_, i) { return '<i' + (i === env.level ? ' class="on"' : '') + '></i>'; }).join('');
      var ends = a.querySelectorAll('.dp-mk__ends span');
      ends[0].textContent = scale[0] ? scale[0].label : ''; ends[1].textContent = scale[steps - 1] ? scale[steps - 1].label : '';
      /* „x von 100 Fällen ein Jahr später im Plus“: Auszug der Rückrechnung (wie Märkte, Abschnitt „Was die Geschichte sagt“). */
      K().load('/quant/data/market/validation/market-pulse-evidence.json').then(function (ev) {
        var j1 = ev && ev.longTerm ? ev.longTerm.filter(function (t) { return t.days === 252; })[0] : null;
        if (!j1 || !j1.levels || !j1.levels.length || !a.isConnected) return;
        var top = j1.levels[j1.levels.length - 1].level, x = j1.levels.filter(function (l) { return l.level === Math.min(env.level, top); })[0];
        if (!x || !isNum(x.positiveShare)) return;
        var hist = a.querySelector('.dp-mk__hist'); hist.querySelector('b').textContent = Math.round(x.positiveShare); hist.hidden = false;
      }).catch(function () {});
    }).catch(function () { if (a.isConnected) lvl.querySelector('b').textContent = 'Nicht verfügbar'; });
    Promise.all([K().load('/quant/data/market/multi-asset/snapshot.json'), K().load('/quant/config/multi-asset.json').catch(function () { return null; })]).then(function (r) {
      if (!sec.isConnected) return;
      var MA = global.VUMultiAssetContract;
      ['QQQ', 'SPY', 'DIA'].forEach(function (symbol) {
        var raw = (r[0].instruments || []).filter(function (c) { return c.instrument && c.instrument.symbol === symbol; })[0]; if (!raw) return;
        var c = MA && MA.refresh ? MA.refresh(raw, { now: new Date(), calendar: ctx.calendar, config: r[1] || {} }) : raw;
        var ch = c.quote && c.quote.state === 'AVAILABLE' && c.quote.change ? c.quote.change.percent : null;
        var slot = sec.querySelector('[data-s="' + symbol + '"]');
        slot.lastElementChild.outerHTML = U().chg(ch, { digits: 2 });
      });
    }).catch(function () {});
    return sec;
  }

  /* ------------------------------------------------------------ Schienen */
  function railSection(slot, ctx, avail) {
    var id = slot.row, title = slot.title || R().homeTitle(id), sec = h('section', 'dr-sec' + (slot.kind === 'more' ? ' dr-sec--more' : '')); sec.dataset.row = id;
    if (slot.anchor) sec.dataset.dpAnchor = slot.anchor;
    var n = avail[id];
    sec.innerHTML = protoHead({ title: title, more: slot.kind === 'more' ? 'Alle' : n ? fmtInt(n) + ' Aktien' : 'Alle', href: rowHref(id), label: 'Alle ' + fmtInt(n) + ' Aktien: ' + title });
    if (slot.tag) sec.querySelector('.dr-head__t h2').insertAdjacentHTML('afterend', '<span class="dr-tag">' + esc(slot.tag) + '</span>');
    var track = rail(title); track.innerHTML = skeleton(3); sec.appendChild(track);
    whenNear(sec, function () {
      loadRow(ctx, id).then(function (row) {
        if (!sec.isConnected) return;
        var sub = slot.sub != null ? slot.sub : R().homeSub(id, row.subtitle);
        /* Wie im Prototyp ohne Satz unter dem Titel (der Satz steht auf der Seite der Reihe); nur „Mehr aus …“ nennt den Grund. */
        if (sub && slot.kind === 'more') sec.querySelector('.dr-head').insertAdjacentHTML('beforeend', '<p>' + esc(sub) + '</p>');
        var cards = R().showcaseCards((row.cards || []).filter(function (c) { return !slot.exclude || slot.exclude.indexOf(c.symbol) < 0; }), 10);
        if (!cards.length) { sec.remove(); return; }
        track.replaceChildren();
        cards.forEach(function (c) { track.appendChild(poster(c, ctx, { proto: true, pill: slot.pill, row: id, badge: R().isNew(c, row.asOf) ? 'NEU' : null })); });
      }).catch(function () { if (sec.isConnected) sec.remove(); });
    });
    return sec;
  }
  function top10Section(row, ctx) {
    var sec = h('section', 'dr-sec dr-sec--top10'); sec.dataset.row = 'im-blick';
    var cards = R().showcaseCards(row.cards, 10);
    /* Ein Satz zur Regel bleibt sichtbar (Rangliste, docs/legal/WORTWAHL.md): die Reihenfolge folgt der Regel, nicht einer Einschätzung. */
    sec.innerHTML = protoHead({ title: 'Top 10 heute', more: 'Alle ' + cards.length, href: rowHref('im-blick'), label: 'Alle Aktien: Heute im Blick', sub: 'Rang nach der Regel „Heute im Blick“: Ereignisse des letzten Handelstags und Stärke über 12 Monate.' });
    var track = rail('Top 10 heute'); sec.appendChild(track);
    cards.forEach(function (c, i) { track.appendChild(top10(c, i, ctx)); });
    if (!track.children.length) return null;
    return sec;
  }
  /** Was sich heute bewegt (Prototyp „dv“): bekannte Namen mit der Tagesveränderung als Balken nach links und rechts. */
  function movesSection(ctx, avail) {
    if (!avail['bekannte-namen']) return null;
    var sec = h('section', 'dr-sec dp-moves'); sec.dataset.row = 'bekannte-namen-heute';
    /* Rechts im Kopf der Datenstand („Schluss Fr. 13.11.“), wie im Prototyp das Datum oben; früher im Kopf der Seite. */
    sec.innerHTML = protoHead({ title: 'Was sich heute bewegt' }) + '<div class="dp-tile dp-dv" role="list" aria-label="Was sich heute bewegt">' + skeleton(1, 'dp-dv__sk') + '</div>';
    var box = sec.querySelector('.dp-dv');
    if (ctx.asOf) sec.querySelector('.dr-head__t').insertAdjacentHTML('beforeend', '<span class="dv3-asof dp-asof">' + esc(K().closeLabel(ctx.asOf)) + '</span>');
    whenNear(sec, function () {
      loadRow(ctx, 'bekannte-namen').then(function (row) {
        if (!sec.isConnected) return;
        var list = R().showcaseCards(row.cards || [], 7).map(function (c) { return { c: c, v: K().val(c.changePercent) }; }).filter(function (x) { return isNum(x.v); })
          .sort(function (a, b) { return b.v - a.v; });
        if (!list.length) { sec.remove(); return; }
        var mx = Math.max.apply(null, list.map(function (x) { return Math.abs(x.v); })) || 1;
        box.innerHTML = list.map(function (x) {
          var w = Math.max(4, Math.round(Math.abs(x.v) / mx * 86)), c = x.c, txt = (x.v > 0 ? '+' : x.v < 0 ? '−' : '') + U().num(Math.abs(x.v), 1) + ' %';
          return '<a class="dp-dv__r" role="listitem" href="' + esc(K().stockHref(ctx, c.symbol) + '?reihe=bekannte-namen') + '"' + stockAttrs(c) + ' aria-label="' + esc(shortName(c) + ' heute ' + txt) + '">' + U().logo(c.symbol) +
            '<b>' + esc(shortName(c)) + '</b><span class="dp-dv__b" aria-hidden="true"><span>' + (x.v < 0 ? '<i class="dn" style="width:' + w + '%"></i>' : '') + '</span><em></em><span>' + (x.v > 0 ? '<i style="width:' + w + '%"></i>' : '') + '</span></span>' +
            '<span class="dp-dv__v' + (x.v > 0 ? ' up' : '') + '">' + esc(txt) + '</span></a>';
        }).join('');
      }).catch(function () { if (sec.isConnected) sec.remove(); });
    });
    return sec;
  }
  var HOME_THEMES = ['kuenstliche-intelligenz', 'halbleiter-chips', 'kernenergie-uran', 'raumfahrt', 'rechenzentren-cloud', 'cybersecurity', 'biotechnologie', 'erneuerbare-energien'];
  /** Themen-Poster (Prototyp „tposter“): Symbol, Name, Anteil im Plus über 12 Monate aus der Reihe des Themas. */
  function themePoster(t, ctx) {
    var a = h('a', 'dp-tile dp-theme'); a.href = D.Views.Themes.href(t); a.dataset.theme = t.slug; a.setAttribute('role', 'listitem');
    a.innerHTML = U().themeHud(t.slug, 74, 22) + '<span class="dp-theme__c"><b>' + esc(t.title) + '</b><span class="dp-bar"><i style="width:0"></i></span><small>' + esc(t.line || '') + '</small></span>';
    if (t.rowId) whenNear(a, function () {
      loadRow(ctx, t.rowId).then(function (row) {
        var cs = (row.cards || []).filter(function (c) { return c.metrics && isNum(c.metrics.return12M); });
        if (!cs.length || !a.isConnected) return;
        var up = cs.filter(function (c) { return c.metrics.return12M > 0; }).length;
        a.querySelector('.dp-bar i').style.width = Math.round(up / cs.length * 100) + '%';
        a.querySelector('small').textContent = up + ' von ' + cs.length + ' im Plus';
        a.setAttribute('aria-label', t.title + ': ' + up + ' von ' + cs.length + ' Aktien über 12 Monate im Plus');
      }).catch(function () {});
    });
    return a;
  }
  function themesSection(ctx, all) {
    var T = D.Views.Themes, list = all ? T.all : HOME_THEMES.map(function (s) { return T.bySlug(s); }).filter(Boolean);
    if (!list.length) return null;
    var sec = h('section', 'dr-sec dr-sec--themes' + (all ? ' dr-sec--themegrid' : '')); sec.dataset.dpAnchor = 'themen';
    if (all) {
      sec.innerHTML = railHead({ title: 'Themenwelten', more: 'Alle ' + T.all.length, href: '#/welten', label: 'Alle ' + T.all.length + ' Themenwelten', sub: 'Von KI bis Kernenergie, je ein Symbol und die Firmen dahinter.' });
      var grid = h('div', 'dr-tgrid'); grid.setAttribute('role', 'list');
      list.forEach(function (t) { var c = K().themeCard(t, ctx, { grid: true }); c.setAttribute('role', 'listitem'); grid.appendChild(c); });
      sec.appendChild(grid);
      return sec;
    }
    sec.innerHTML = protoHead({ title: T.all.length + ' Themen', more: 'Alle', href: '#/welten', label: 'Alle ' + T.all.length + ' Themenwelten' });
    var track = rail('Themen');
    list.forEach(function (t) { track.appendChild(themePoster(t, ctx)); });
    sec.appendChild(track);
    return sec;
  }
  function strategiesSection(slot, ctx, avail) {
    var ids = slot.rows.filter(function (id) { return avail[id]; });
    var total = Object.keys(avail).filter(function (id) { return !/^thema-/.test(id) && id !== 'sector-leaders'; }).length;
    var sec = h('section', 'dr-sec dr-sec--strat');
    sec.innerHTML = protoHead({ title: 'Strategien', more: 'Alle ' + total, href: '#/strategien', label: 'Alle ' + total + ' Strategien' });
    var track = rail('Strategien'); sec.appendChild(track);
    ids.forEach(function (id) {
      var cp = R().STRATEGY_COPY[id] || {}, a = h('a', 'dr-sk dp-tile'); a.href = rowHref(id); a.setAttribute('role', 'listitem');
      a.innerHTML = hudIcon(cp.icon || 'bars', 40) + '<b>' + esc(R().title(id)) + '</b><span class="dr-sk__n">' + fmtInt(avail[id]) + ' Aktien</span><p>' + esc(cp.line || '') + '</p><span class="dr-sk__l"></span>';
      track.appendChild(a);
      whenNear(a, function () {
        loadRow(ctx, id).then(function (row) { if (a.isConnected) a.querySelector('.dr-sk__l').innerHTML = R().showcaseCards(row.cards, 4).map(function (c) { return U().logo(c.symbol); }).join(''); }).catch(function () {});
      });
    });
    return sec;
  }
  /** „Weiter ansehen“ (Prototyp; früher „Zuletzt angesehen“): die zuletzt geöffneten Aktien, nur auf dem Gerät gespeichert (discover/engines/memory.js). */
  var WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
  function seenLabel(at) {
    var d = new Date(at); if (isNaN(d)) return 'angesehen';
    var now = new Date(), day = 864e5, diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / day);
    return diff <= 0 ? 'Heute angesehen' : diff === 1 ? 'Gestern angesehen' : diff < 7 ? WD[d.getDay()] + ' angesehen' : ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '. angesehen';
  }
  function recentSection(ctx, recent) {
    var sec = h('section', 'dr-sec dr-sec--recent');
    sec.innerHTML = protoHead({ title: 'Weiter ansehen' });
    var track = rail('Weiter ansehen'); sec.appendChild(track);
    recent.slice(0, 8).forEach(function (e) {
      var c = { symbol: e.symbol, companyName: e.companyName };
      var slot = h('div', 'dr-poster dp-poster dr-cw'); slot.dataset.symbol = e.symbol; slot.setAttribute('role', 'listitem');
      slot.innerHTML = '<a class="dr-poster__a" href="' + esc(K().stockHref(ctx, e.symbol)) + '"' + stockAttrs(c) + ' aria-label="' + esc(shortName(c) + ', ' + seenLabel(e.at)) + '">' + U().logo(e.symbol) +
        '<b class="dr-poster__n">' + esc(shortName(c)) + '</b><span class="dr-poster__ch"></span><span class="dr-poster__v">' + U().chg(null) + '</span><small class="dp-seen">' + esc(seenLabel(e.at)) + '</small></a>';
      track.appendChild(slot);
      whenNear(slot, function () {
        K().load('/discover/data/stocks/' + uid(ctx) + '/' + encodeURIComponent(e.symbol) + '.json').then(function (d) {
          if (!slot.isConnected) return;
          var r12 = d.metrics && d.metrics.return12M; slot.__card = d;
          if (isNum(r12) && r12 < 0) slot.classList.add('dp-down');
          slot.querySelector('.dr-poster__v').innerHTML = pill12(d);
          slot.querySelector('.dr-poster__ch').appendChild(K().spark(d, { width: 104, height: 38 }));
        }).catch(function () {});
      });
    });
    return sec;
  }

  /* Europa ohne Suche erreichbar (Owner 08.11.2026, Strang M). Reine Verweise: kein Europa-Katalog beim Start der Seite. */
  function rowTile(href, glyph, title, sub, cls) {
    return '<a class="dp-tile dp-row' + (cls ? ' ' + cls : '') + '" href="' + esc(href) + '">' + glyph + '<span><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span><span class="dp-chev" aria-hidden="true">' + U().glyph('next', 14) + '</span></a>';
  }
  function europeSection() {
    var sec = h('section', 'dr-sec dr-sec--europa'); sec.setAttribute('data-europe-entry', '');
    sec.innerHTML = protoHead({ title: 'Aktien aus Europa', more: 'Alle', href: '#/c/EUROPE/all', label: 'Alle europäischen Aktien' }) + '<div class="dp-stack">' +
      rowTile('#/c/EUROPE/de', '<span class="dr-hud" style="width:40px;height:40px">' + U().glyph('line', 20) + '</span>', 'Deutsche Aktien', 'DAX, MDAX, SDAX und weitere · Kurse in Euro') +
      rowTile('#/c/EUROPE/all', '<span class="dr-hud" style="width:40px;height:40px">' + U().glyph('grid', 20) + '</span>', 'Ganz Europa', 'Zehn Börsen · Kurse in Landeswährung · Tagesschluss, unbereinigt') + '</div>';
    return sec;
  }
  /** „Alle N Reihen“ (Prototyp: Etikett und Chips), darunter Suche und Genres (aus dem früheren Kopf der Seite). */
  function rowsSection(ctx, avail) {
    var ids = []; R().ALL_GROUPS.forEach(function (g) { g.rows.forEach(function (r) { if (avail && avail[r] && ids.indexOf(r) < 0) ids.push(r); }); });
    var sec = h('section', 'dr-sec dp-rows');
    var shown = ids.slice(0, 8), rest = ids.length - shown.length;
    sec.innerHTML = (ids.length ? '<p class="dp-eb">Alle ' + ids.length + ' Reihen</p><div class="dp-chips">' + shown.map(function (id) { return '<a class="dp-chip" href="' + esc(rowHref(id)) + '">' + esc(R().title(id)) + '</a>'; }).join('') +
      '<a class="dp-chip dr-allrows" href="#/reihen" aria-label="Alle ' + ids.length + ' Reihen und ' + D.Views.Themes.all.length + ' Themen">' + (rest > 0 ? '+' + rest : 'Alle') + '</a></div>' : '') +
      '<p class="dp-eb">Nach Art</p><nav class="dr-genres dp-chips" aria-label="Genres">' + [['kursbewegung', 'Kursbewegung'], ['unternehmen', 'Unternehmen'], ['themen', 'Themen'], ['indizes', 'Indizes']].map(function (x) {
        return '<button type="button" class="dp-chip" data-genre="' + x[0] + '" aria-pressed="false">' + esc(x[1]) + '</button>'; }).join('') + '<a class="dp-chip" href="#/c/EUROPE/de" data-europe-chip>Europa</a></nav>' +
      '<button type="button" class="v2-search-prompt dp-find" aria-label="Aktie, Thema oder Frage suchen">' + U().glyph('search', 20) + '<span>Aktie, Thema oder Frage …</span></button>';
    sec.querySelector('.dp-find').addEventListener('click', function () { if (ctx.openSearch) ctx.openSearch(); });
    return sec;
  }
  function endSection(ctx) {
    var sec = h('section', 'dr-sec dr-sec--end');
    sec.innerHTML = rowTile('#/swipen', U().hud('discover', 40, 12), 'Aktien swipen, eine nach der anderen', 'Wische nach rechts zum Merken.', 'dv3-swipecard') +
      U().next({ href: '/quant/', eyebrow: 'Weiter', title: 'Quant: das Profil jeder Aktie', sub: 'Faktoren je Aktie' }) +
      '<p class="dp-end"><a href="#/daten">Daten &amp; Hinweise</a></p>' +
      U().help((ctx.meta && ctx.meta.disclaimer) || 'Informationen zur eigenen Recherche, keine Anlageempfehlung.');
    return sec;
  }

  /* ------------------------------------------------------------ Genre-Chips */
  function bindGenres(page, ctx, draw) {
    page.__drDraw = draw; /* der Kopf bleibt beim Neuzeichnen stehen: der Klick gilt immer der aktuellen Startseite */
    if (page.dataset.genresBound) return;
    page.dataset.genresBound = '1';
    page.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.dr-genres button[data-genre]'); if (!b) return;
      var g = b.dataset.genre === 'alle' ? null : b.dataset.genre;
      try { global.history.replaceState(global.history.state, '', g ? '#/?genre=' + g : '#/'); } catch (err) {}
      page.__drDraw(g);
      global.scrollTo(0, 0);
    });
  }
  function paintGenres(page, g) {
    Array.prototype.forEach.call(page.querySelectorAll('.dr-genres button[data-genre]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.genre === (g || 'alle'))); });
    var intro = page.__drIntro || (page.__drIntro = page.querySelector('.dv3-intro')), G = g && R().genre(g), body = page.querySelector('.dp-home');
    /* App-Konzept 2: ohne Genre beginnt die Seite mit der Aktie des Tages; der Kopf (Frage, Suche, Genres, Überschrift h1) steht nur über
       einer Genre-Ansicht und ist sonst nicht im Dokument (die Startseite trägt ihre h1 unsichtbar über der Aktie des Tages). */
    if (intro) { intro.hidden = !G; if (G && intro.parentNode !== page) page.insertBefore(intro, body); else if (!G && intro.parentNode) intro.remove(); }
    var html = global.document && document.documentElement;
    if (html) { if (G) html.removeAttribute('data-vu-bleed'); else html.setAttribute('data-vu-bleed', ''); }
    var title = intro && intro.querySelector('.vu-lt'), lead = intro && intro.querySelector('.dr-genre-lead'), tag = intro && intro.querySelector('.dv3-asof');
    /* Zwei Zeilen als Blöcke, das Leerzeichen in der ersten: der Text bleibt „Was bewegt die Börse heute?“, auch nach dem Verkleinern des HTML. */
    if (title) title.innerHTML = (G ? G.title : 'Was bewegt\ndie Börse heute?').split('\n').map(function (l, i, a) { return '<span class="dr-l">' + esc(l + (i < a.length - 1 ? ' ' : '')) + '</span>'; }).join('');
    if (lead) { lead.hidden = !G; lead.textContent = G ? G.lead : ''; }
    if (tag) { if (!tag.dataset.base) tag.dataset.base = tag.textContent; tag.textContent = G ? 'Discover · ' + G.label : tag.dataset.base; }
    var search = intro && intro.querySelector('.v2-search-prompt'); if (search) search.hidden = !!G;
  }

  /* ------------------------------------------------------------ Startseite (App-Konzept 2, Prototyp „v-discover“) */
  /* Reihenfolge wie im Prototyp: Aktie des Tages (bis an den Rand, Kopf darüber durchsichtig) -> Reiter Start · Themen · Reihen · Märkte ->
     Weiter ansehen -> Top 10 heute -> Themen -> Neue Jahreshochs -> Was sich heute bewegt -> Langfristige Compounder; danach die übrigen
     Reihen der Startseite (Reihen.homePlan, ihre Reihenfolge), dann „Wie steht die Börse?“, „Alle N Reihen“ mit Genres und Suche, Ende.
     Karten des Prototyps ohne Daten (vom Owner zurückgestellt) entfallen; der Rest rückt nach. */
  var PROTO_ROWS = ['new-52-week-highs', 'langfristige-compounder'];
  function home(page, ctx) {
    var tag = page.querySelector('.dv3-asof');
    if (tag && ctx.asOf) { tag.textContent = 'Discover · ' + K().closeLabel(ctx.asOf); tag.dataset.base = tag.textContent; }
    var avail = R().available(ctx.meta, uid(ctx)), body = h('div', 'v2-journey dr-home dp-home'); page.appendChild(body);
    var hero = null, imBlick = null, drawn = false, wait0 = ctx.heroWait || null;
    var entry = ((ctx.meta && ctx.meta.home) || []).filter(function (x) { return x.universeId === uid(ctx); })[0];
    var heroP = entry && entry.chunks && entry.chunks[0] ? K().load(entry.chunks[0]).then(function (c) { return (c.surfaces || []).filter(function (s) { return s.type === 'hero'; })[0] || null; }).catch(function () { return null; }) : Promise.resolve(null);
    var rowP = avail['im-blick'] ? loadRow(ctx, 'im-blick').catch(function () { return null; }) : Promise.resolve(null);
    var wait = new Promise(function (r) { setTimeout(r, 2500); });
    var ready = Promise.all([heroP, rowP, ctx.liveIndex, Promise.race([ctx.fxReady, wait])]).then(function (r) { hero = r[0]; imBlick = r[1]; });

    function draw(g) {
      paintGenres(page, g);
      body.replaceChildren();
      if (g) {
        if (wait0) { wait0.remove(); wait0 = null; }
        R().genrePlan(g, avail).forEach(function (slot) {
          if (slot.kind === 'themes') { var t = themesSection(ctx, true); if (t) body.appendChild(t); }
          else body.appendChild(railSection(slot, ctx, avail));
        });
        if (!body.children.length) body.innerHTML = U().blank('In diesem Genre gibt es heute keine Reihe mit Treffern.');
        body.appendChild(rowsSection(ctx, avail));
        body.appendChild(endSection(ctx));
        paintGenres(page, g);
        if (!drawn) { drawn = true; document.dispatchEvent(new Event('vu-home-drawn')); }
        return;
      }
      /* Platzhalter so hoch wie die Aktie des Tages (520 px), damit nichts nachrutscht; der vorgerenderte aus index.html wird übernommen. */
      var bb = wait0 || h('section', 'dr-sec dr-bb dp-hero dp-hero--wait', '<p class="v2-load-state" role="status">Aktien werden geladen …</p>');
      wait0 = null; bb.removeAttribute('data-static');
      body.appendChild(h('h1', 'vu-visually-hidden', 'Discover: Aktien entdecken')); body.appendChild(bb);
      body.appendChild(tabsBar(body));
      var mem = D.memory, followed = mem && mem.followedRows ? mem.followedRows() : [];
      var recent = mem && mem.recent ? mem.recent(uid(ctx)) : [], more = R().moreFrom(recent, avail);
      var fresh = followed.concat(R().freshRows(ctx.meta, uid(ctx)).filter(function (r) { return followed.indexOf(r) < 0; }));
      var plan = R().homePlan(avail, { fresh: fresh, personal: { recent: recent.length > 0, more: !!more } });
      function has(kind, row) { return plan.filter(function (s) { return s.kind === kind && (!row || s.row === row); })[0] || null; }
      if (has('recent')) body.appendChild(recentSection(ctx, recent));
      var topSlot = h('div', 'dr-slot'); body.appendChild(topSlot);
      if (has('themes')) { var th = themesSection(ctx, false); if (th) body.appendChild(th); }
      var first = true;
      PROTO_ROWS.forEach(function (id) {
        var s = has('rail', id); if (!s) return;
        body.appendChild(railSection(Object.assign({}, s, { kind: 'rail', anchor: first ? 'reihen' : null }), ctx, avail)); first = false;
        if (id === 'new-52-week-highs') { var mv = movesSection(ctx, avail); if (mv) body.appendChild(mv); }
      });
      /* Prototyp: nach den Compoundern „Wie steht die Börse?“ und „Alle N Reihen“; die übrigen Reihen der heutigen Startseite folgen
         danach (im Design des Prototyps), vor „Weiter“. */
      body.appendChild(marketSection(ctx));
      body.appendChild(rowsSection(ctx, avail));
      plan.forEach(function (slot) {
        var node = null;
        if (slot.kind === 'top10' || slot.kind === 'recent' || slot.kind === 'themes' || (slot.kind === 'rail' && PROTO_ROWS.indexOf(slot.row) >= 0)) return;
        if (slot.kind === 'rail') node = railSection(Object.assign({}, slot, { anchor: first ? 'reihen' : null }), ctx, avail);
        else if (slot.kind === 'more') {
          var T = D.Views.Themes.byRow(more.row);
          node = railSection({ kind: 'more', row: more.row, title: 'Mehr aus ' + (T ? T.title : R().title(more.row)), sub: R().moreLine(more.names.map(function (n) { return shortName({ companyName: n }); })), exclude: more.exclude }, ctx, avail);
        }
        else if (slot.kind === 'strategies') node = strategiesSection(slot, ctx, avail);
        else if (slot.kind === 'europe') node = europeSection();
        if (node) { if (slot.kind === 'rail') first = false; body.appendChild(node); }
      });
      body.appendChild(endSection(ctx));
      paintGenres(page, null);
      ready.then(function () {
        if (!bb.isConnected) return;
        var cards = billboardCards(hero, imBlick);
        if (cards.length) {
          var surface = Object.assign({}, hero || { type: 'hero', id: 'hero' }, { cards: cards });
          var view = D.Featured && D.Featured.live ? D.Featured.live(surface, ctx, billboard) : billboard(surface, ctx);
          bb.replaceWith(view);
        } else bb.innerHTML = '<div class="dp-hero__body"><p class="vu-ltag">Heute im Blick</p>' + U().blank('Heute steht keine Aktie im Blick.') + '</div>';
        var t = imBlick && top10Section(imBlick, ctx); if (t) topSlot.replaceWith(t); else topSlot.remove();
        if (!drawn) { drawn = true; document.dispatchEvent(new Event('vu-home-drawn')); }
      }).catch(function () {
        if (!bb.isConnected) return;
        bb.innerHTML = '<div class="dp-hero__body">' + U().blank('Die Aktien konnten nicht geladen werden.') + '</div>';
        var retry = h('button', 'vu-btn vu-btn--line vu-btn--sm v2-load-more', 'Erneut versuchen'); retry.type = 'button';
        retry.onclick = function () { draw(null); }; bb.querySelector('.dp-hero__body').appendChild(retry);
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
      /* n-preview: die fünf Reihen mit dem besten Platz als Chips, der Rest als „+N weitere“ (öffnet die Liste) */
      var chip = function (m, i) { return '<a class="vu-chip' + (i ? '' : ' vu-chip--lime') + '" href="' + esc(rowHref(m.id)) + '" data-dv3-close>' + esc(R().title(m.id)) + '</a>'; };
      box.innerHTML = rows.slice(0, 5).map(chip).join('') + (rows.length > 5 ? '<button type="button" class="vu-chip dr-pv__more">+' + (rows.length - 5) + ' weitere</button>' : '');
      var more = box.querySelector('.dr-pv__more');
      if (more) more.addEventListener('click', function () { more.remove(); box.insertAdjacentHTML('beforeend', rows.slice(5).map(function (m) { return chip(m, 1); }).join('')); });
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
    /* Reihen aus Geschäftszahlen (Regel nennt die SEC, z. B. Fallen Angels) sortieren zweitens nach Umsatz, Kurs-Reihen nach 12 Monaten. */
    var sec = /^f_/.test(sortKey) || /SEC/.test(row.rule || '') || (cfg.explain || []).some(function (t) { return /SEC|Umsatz/.test(t); });
    if (sec) { if (sortKey !== 'f_revenueGrowth3y') SORTS.push(['umsatz', 'Umsatz']); } else if (sortKey !== 'return12M') SORTS.push(['r12', '12 Monate']);
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
      K().fitChart(stage.querySelector('.dr-rsw__chart'), 320, 150, function (w, ht) { return K().spark(c, { big: true, eager: true, width: w, height: ht, onDates: function (a, b) { d[0].textContent = K().dayYear(a); d[1].textContent = K().dayYear(b); } }); });
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
          /* App-Konzept 2: Trefferzahl zusätzlich als Balken (Anteil an allen Aktien des Universums). */
          var share = isNum(avail[r]) && ctx.universeSize ? '<span class="dr-all__bar" aria-hidden="true"><i style="width:' + Math.max(2, Math.min(100, avail[r] / ctx.universeSize * 100)).toFixed(1) + '%"></i></span>' : '';
          return '<a class="dr-all__r" href="' + esc(rowHref(r)) + '"><span><b>' + esc(R().title(r)) + '</b>' + (r === 'fallen-angels' ? '<span class="dr-tag">Neu</span>' : '') + '</span><span>' + fmtInt(avail[r]) + U().glyph('next', 13) + '</span>' + share + '</a>';
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
