/* Vision Universe® — Supertrader, Oberfläche nach dem Redesign 2027 (Folien ST01–ST08, ST-Z)
   Vorlage: docs/design/redesign-2027/HANDOVER.md, Kapitel „07 · Supertrader“.

   Nur Darstellung. Liest dieselben Artefakte wie supertrader.js (Registry, Signale, Backtests, Quellen,
   Musterdepots, quellentreue Kandidaten) und rechnet keinen Zustand, keine Stufe und keine Kennzahl nach.
   Bausteine aus assets/vu-ui.js (VUUI) und der eine Chart aus assets/vu-chart.js (VUChart).
   Fehlt ein Wert, sagt die Seite es; es wird keine Zahl erfunden.

   supertrader.js lädt dieses Modul und ruft STRedesign.render[page](D, X); X reicht Helfer der
   bisherigen Oberfläche herein (Haftungshinweis, Regelliste, frühere Ansicht in einer Aufklappzeile).
   Schlägt das Laden fehl, zeigt supertrader.js die bisherige Oberfläche. */
(function () {
  'use strict';
  var U = window.VUUI;
  if (!U) return;
  var esc = U.esc;

  /* ------------------------------------------------ ST-Z: Zustände in Alltagssprache */
  // [Alltagsname, Bedeutung in einem Satz, Urteil-Form (C08)]
  var STATE = {
    DISCOVERED: ['Entdeckt', 'Aktie fällt heute auf, noch ohne Muster.', 'none'],
    WATCH: ['Auf Beobachtung', 'Könnte ein Muster bilden.', 'none'],
    SETUP: ['Wartet', 'Kurs noch unter der Zone laut Methode.', 'none'],
    ENTRY_READY: ['Plan fertig', 'Zone und Ungültig-Marke laut Methode stehen fest.', 'mid'],
    TRIGGERED: ['Aufgenommen', 'Das Musterdepot nimmt die Aktie auf.', 'mid'],
    ACTIVE: ['Im Musterdepot', 'Läuft nach Regel weiter.', 'mid'],
    WARNING: ['Warnzeichen laut Methode', 'Eine Regel meldet Schwäche.', 'weak'],
    EXIT: ['Abgegeben', 'Musterdepot gibt ab: Regel sagt raus.', 'none'],
    CLOSED: ['Abgegeben', 'Regel sagt raus; Ergebnis im Protokoll.', 'none'],
    INVALIDATED: ['Muster zerfallen', 'Der Kurs fiel unter die Ungültig-Marke laut Methode.', 'weak'],
    RETIRED_BY_RULE_VERSION: ['Durch neue Regel ersetzt', 'Eine neue Regelversion hat den Eintrag abgelöst.', 'none'],
    REASSESSED_AFTER_RULE_CHANGE: ['Nach Regeländerung neu bewertet', 'Nach einer Regeländerung erneut geprüft.', 'none']
  };
  var LIFE = ['SETUP', 'ENTRY_READY', 'TRIGGERED', 'ACTIVE', 'WARNING', 'EXIT', 'CLOSED', 'INVALIDATED'];
  function lifeIx(st) { return LIFE.indexOf(st === 'ACTIVE_AGAIN' ? 'ACTIVE' : st); }
  function stateName(st) { return (STATE[st] || [st])[0]; }
  function stateVerdict(st, text) { var x = STATE[st] || [st, '', 'none']; return U.verdict(x[2], text || x[0]); }

  /* Stufen der 13 quellentreuen Methoden (Fachname bleibt im Sheet „Mehr“) */
  var STAGES = ['CHART_CANDIDATE', 'CONFIRMED_RESEARCH_SETUP', 'MODELED_TRADE_PLAN'];
  var STAGE_TXT = { CHART_CANDIDATE: 'Muster erkannt', CONFIRMED_RESEARCH_SETUP: 'Regel erfüllt', MODELED_TRADE_PLAN: 'Plan fertig' };
  var STAGE_HELP = 'Muster erkannt: Der Chart sieht aus wie das Muster. Regel erfüllt: Alle prüfbaren Regeln der Methode stimmen. Plan fertig: Zone und Ungültig-Marke laut Methode stehen fest.';

  /* Darstellung der 13 Methoden: Trader, Stil und ein Satz in Alltagssprache (Folie ST01/ST02). Zahlen kommen aus summary.json. */
  var M13 = {
    C01: ['Richard Dennis, Turtles', 'Trend', 'Kurs steigt über das Hoch der letzten 20 Tage.'],
    C02: ['Richard Dennis, Turtles', 'Trend', 'Kurs steigt über das Hoch der letzten 55 Tage.'],
    C03: ['Nicolas Darvas', 'Ausbruch', 'Kurs pendelt in einer Kiste und bricht nach oben aus.'],
    C04: ['Stan Weinstein', 'Trend', 'Aktie verlässt eine lange Seitwärtsphase nach oben.'],
    C05: ['Stan Weinstein', 'Trend', 'Neuer Anlauf nach oben in einem laufenden Aufwärtstrend.'],
    C06: ['Mark Minervini', 'Ausbruch', 'Schwankungen werden kleiner, dann folgt der Ausbruch.'],
    C07: ['Mark Minervini', 'Ausbruch', 'Erst +100 % in acht Wochen, dann eine ruhige Pause.'],
    C08: ['Kristjan Kullamägi', 'Ausbruch', 'Starker Lauf, enge Pause, dann Ausbruch.'],
    C09: ['Kristjan Kullamägi', 'Kurslücke', 'Kurssprung von mindestens 10 % nach einer Überraschung.'],
    C10: ['Kristjan Kullamägi', 'Short', 'Überhitzte Aktie, Wette auf Rückgang. Nur Forschung.'],
    C11: ['Gil Morales, Chris Kacher', 'Volumen', 'Aufwärtstag mit mehr Volumen als jeder Abwärtstag der letzten 10 Tage.'],
    C12: ['Gil Morales, Chris Kacher', 'Kurslücke', 'Kurslücke nach oben mit sehr hohem Volumen.'],
    C13: ['Linda Raschke', 'Rücksetzer', 'Starker Trend, dann erster Rücksetzer an die 20-Tage-Linie.']
  };
  var STYLES = ['Ausbruch', 'Trend', 'Kurslücke', 'Volumen', 'Rücksetzer', 'Short'];
  /* Methoden-Gruppen der Aktienseite (ST08) */
  var GROUPS = [['Ausbruch', ['C03', 'C06', 'C07', 'C08']], ['Trend', ['C01', 'C02', 'C04', 'C05']], ['Lücke · Sonst', ['C09', 'C10', 'C11', 'C12', 'C13']]];
  /* VU-Musterdepot ↔ quellentreue Erkennung derselben Methode (eine Seite vereint beides, ST03) */
  var SF_OF = { MINERVINI_VCP: 'C06', DONCHIAN_TURTLE: 'C01', DARVAS_BOX: 'C03', WEINSTEIN_STAGE: 'C04', MOMENTUM_BREAKOUT: 'C08' };

  /* ------------------------------------------------ Helfer */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function n0(v) { return isNum(v) ? U.num(v, 0) : '–'; }
  function usd(v) { return isNum(v) ? U.num(v, 2) + ' $' : '–'; }
  function pctF(v, d) { return isNum(v) ? U.pct(v * 100, d == null ? 1 : d) : '–'; }
  function pp(v, d) { return isNum(v) ? U.num(v * 100, d == null ? 1 : d) + ' %' : '–'; }
  function dDe(d) { if (!d) return '–'; var p = String(d).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function dShort(d) { if (!d) return '–'; var p = String(d).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.'; }
  function cleanName(n) { return String(n || '').replace(/ \(.*\)$/, ''); }
  /* Ein Name je Methode (Folie K3, st-names.js): Musterdepot (Registry) und quellentreue Methode (Cxx) */
  var N = window.STNames, F = window.STFlow;
  function wn(s) { return s ? (N ? N.ofStrategy(s) : s.world_name) : ''; }
  function nm(S, id) { return S[id] ? wn(S[id]) : (N ? N.name(id, id) : id); }
  function cn(s) { return N ? N.name(s.candidateId, cleanName(s.name)) : cleanName(s.name); }
  function cnId(S, cid) { return N ? N.name(cid, S[cid] ? cleanName(S[cid].name) : cid) : (S[cid] ? cleanName(S[cid].name) : cid); }
  function frag(html) { var t = document.createElement('template'); t.innerHTML = html; return t.content; }
  function intro(title, lead) {
    return '<div class="st-r-intro"><div class="vu-ltag">Supertrader</div><h1 class="vu-lt">' + esc(title) + '</h1>' + (lead ? '<p class="vu-lead">' + esc(lead) + '</p>' : '') + '</div>';
  }
  function kick(tag, title) { return '<div class="vu-ltag st-r-kick">' + esc(tag) + '</div><h2 class="vu-mt st-r-kt">' + esc(title) + '</h2>'; }
  function back(href, label) { return '<a class="st-r-back" href="' + esc(href) + '">' + U.glyph('back', 18) + '<span>' + esc(label) + '</span></a>'; }
  function acc(title, body, right, open) {
    return '<details class="st-r-acc"' + (open ? ' open' : '') + '><summary><b>' + esc(title) + '</b>' + (right || '') + U.glyph('next', 16) + '</summary><div class="st-r-accb">' + (body || '') + '</div></details>';
  }
  function note(text) { return '<p class="st-r-note">' + esc(text) + '</p>'; }
  function tk(t) { return '<span class="st-r-tk" aria-hidden="true">' + esc(String(t || '').slice(0, 5)) + '</span>'; }
  function stockHref(sym) { return '/supertrader/stock/?s=' + encodeURIComponent(sym); }
  function sheetHtml(id, title, body, closeLabel) {
    return U.sheet(id, title, body + '<button type="button" class="vu-btn vu-btn--ink vu-btn--block st-r-close" data-close>' + esc(closeLabel || 'Schließen') + '</button>');
  }
  function addSheet(id, title, body, closeLabel) {
    var old = document.getElementById(id); if (old) old.remove();
    document.body.appendChild(frag(sheetHtml(id, title, body, closeLabel)));
    return document.getElementById(id);
  }
  function bindPage(main) {
    U.bindHelp(main);
    main.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-sheet]');
      if (b) { e.preventDefault(); U.openSheet(document.getElementById(b.getAttribute('data-sheet'))); }
    });
    document.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('[data-close]');
      if (c) { var s = c.closest('.vu-sheet-backdrop'); if (s) U.closeSheet(s); }
    });
  }
  function page(main, X) {
    var wrap = document.createElement('div');
    wrap.className = 'vu-ui st-r';
    main.appendChild(wrap);
    bindPage(wrap);
    return wrap;
  }
  function append(host, html) { host.appendChild(frag(html)); }
  function foot(host, X, sig) { var f = X.disclaimer(sig); if (f) host.appendChild(f); }

  /* Erklärung der einen Ablauf-Leiste (Folie K1): beide Fragen mit ihren Wörtern */
  function flowExplain() {
    if (!F) return '';
    var part = function (title, sub, labels, bar) { return '<div class="st-r-flowx"><b>' + esc(title) + '</b><span class="vu-sm vu-mu">' + esc(sub) + '</span>' + bar + labels.map(function (l) { return '<p class="vu-sm"><b>' + esc(l[0]) + ':</b> ' + esc(l[1]) + '</p>'; }).join('') + '</div>'; };
    return part('Erkennen: zeigt die Aktie das Muster?', 'Für alle 13 Methoden, jeden Tag, über alle US-Aktien. Drei Stufen.', F.ERK, F.erk(2)) +
      part('Musterdepot: was würde die Regel tun?', 'Für die fünf Methoden mit Musterdepot. Vier Schritte, ohne echtes Geld.', F.DEP.concat([F.BROKEN]), F.dep(2));
  }
  /* Stufen-Leiter (3 Felder, Stufe 3 neongrün) */
  function ladder(by) {
    return '<div class="st-r-ladder">' + STAGES.map(function (k, i) {
      return '<div class="st-r-step' + (i === 2 ? ' is-lime' : '') + '"><span>' + (i + 1) + ' · ' + esc(STAGE_TXT[k]) + '</span><b class="vu-num">' + n0(by[k] || 0) + '</b></div>';
    }).join('') + '</div>';
  }
  /* Stufen-Balken je Methode (schwarz / grau / neongrün) */
  function sbar(by, mx) {
    var w = function (v) { return mx ? ((v || 0) / mx * 100).toFixed(1) + '%' : '0'; };
    return '<div class="st-r-sbar" role="img" aria-label="' + esc(STAGES.map(function (k) { return STAGE_TXT[k] + ' ' + n0(by[k] || 0); }).join(', ')) + '"><i class="s1" style="width:' + w(by.CHART_CANDIDATE) + '"></i><i class="s2" style="width:' + w(by.CONFIRMED_RESEARCH_SETUP) + '"></i><i class="s3" style="width:' + w(by.MODELED_TRADE_PLAN) + '"></i></div>';
  }
  function legend() {
    return '<div class="st-r-legend"><span><i class="s1"></i>Muster erkannt</span><span><i class="s2"></i>Regel erfüllt</span><span><i class="s3"></i>Plan fertig</span></div>';
  }
  function methodMeta(s) { var x = N && N.method(s.candidateId); if (x) return { trader: x.author, style: x.style, plain: x.plain }; var m = M13[s.candidateId] || [s.author, s.family, s.short]; return { trader: m[0], style: m[1], plain: m[2] }; }
  function mcard(s, mx) {
    var m = methodMeta(s), by = s.counts.byStage || {};
    return '<a class="st-r-mcard" href="/supertrader/strategies/?sf=' + esc(s.candidateId) + '" data-style="' + esc(m.style) + '" data-q="' + esc((cn(s) + ' ' + m.trader).toLowerCase()) + '">' +
      '<div class="st-r-mtop"><div><b>' + esc(cn(s)) + '</b><span>' + esc(m.trader + ' · ' + m.style) + '</span></div><div class="st-r-mnum"><b class="vu-num">' + n0(s.counts.published) + '</b><span>am Stichtag</span></div></div>' +
      '<p>' + esc(m.plain) + '</p>' + sbar(by, mx) + (s.direction === 'SHORT_RESEARCH_ONLY' ? '<div class="st-r-mv">' + U.verdict('none', 'Nur Forschung') + '</div>' : '') + '</a>';
  }

  /* Leisten: Ungültig-Marke · Aufnahme · Schluss (im Musterdepot) oder Ungültig-Marke · Kurs · Zone (vor der Aufnahme) */
  function trackPos(stop, entry, close) {
    var vs = [stop, entry, close].filter(isNum); if (vs.length < 2) return '';
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), X = function (v) { return (8 + (v - lo) / (hi - lo || 1) * 338).toFixed(1); };
    return '<svg class="st-r-trk" viewBox="0 0 354 26" aria-hidden="true"><line class="b" x1="8" x2="346" y1="13" y2="13"/>' + (isNum(stop) && isNum(close) ? '<line class="r" x1="' + X(stop) + '" x2="' + X(close) + '" y1="13" y2="13"/>' : '') +
      (isNum(stop) ? '<circle class="k" cx="' + X(stop) + '" cy="13" r="6"/>' : '') + (isNum(entry) ? '<rect class="k" x="' + (X(entry) - 1.5) + '" y="3" width="3" height="20" rx="1.5"/>' : '') +
      (isNum(close) ? '<circle class="c" cx="' + X(close) + '" cy="13" r="7"/>' : '') + '</svg>';
  }
  function trackPrep(lo, close, trig) {
    if (!isNum(lo) || !isNum(trig) || !isNum(close) || trig <= lo) return '';
    var x = (8 + Math.max(0, Math.min(1, (close - lo) / (trig - lo))) * 338).toFixed(1);
    return '<svg class="st-r-trk" viewBox="0 0 354 26" aria-hidden="true"><line class="b" x1="8" x2="346" y1="13" y2="13"/><line class="r" x1="' + x + '" x2="346" y1="13" y2="13"/><circle class="k" cx="8" cy="13" r="6"/><circle class="o" cx="' + x + '" cy="13" r="7"/><rect class="k" x="343" y="3" width="3" height="20" rx="1.5"/></svg>';
  }
  function nameOf(s) { return s.companyName || s.name || s.symbol; }
  function stopOf(s) { return isNum(s.stop) ? s.stop : s.entry && isNum(s.entry.stop) ? s.entry.stop : null; }
  /* Signal-Karte (ST04, ST03, ST08) */
  function sigCard(s, methodName) {
    var lv = s.levels || {}, close = s.lastPrice, head = '<div class="st-r-shead">' + tk(s.symbol) + '<div class="st-r-sname"><b>' + esc(nameOf(s)) + '</b><span>' + esc(methodName || '') + '</span></div><div class="st-r-sstate">' + (F ? F.miniState(s.state) : '') + stateVerdict(s.state) + '</div></div>';
    if (s.entry && isNum(s.entry.price)) {
      var stop = stopOf(s), luft = isNum(stop) && isNum(close) && close > 0 ? (close - stop) / close : null, since = isNum(close) ? close / s.entry.price - 1 : null;
      return '<a class="st-r-sig" href="' + esc(stockHref(s.symbol)) + '">' + head + trackPos(stop, s.entry.price, close) +
        '<div class="st-r-trkl vu-num"><span>Ungültig ' + usd(stop) + '</span><span class="vu-mu">Aufnahme ' + usd(s.entry.price) + '</span><span>Schluss ' + usd(close) + '</span></div>' +
        '<div class="st-r-sfoot"><span><b class="vu-num">' + (isNum(luft) ? U.num(luft * 100, 1) + ' %' : '–') + '</b> Abstand zur Ungültig-Marke</span>' + '<span class="st-r-res">' + U.chg(isNum(since) ? since * 100 : null) + '</span></div></a>';
    }
    var dist = isNum(lv.trigger) && isNum(close) && close > 0 ? lv.trigger / close - 1 : null;
    return '<a class="st-r-sig" href="' + esc(stockHref(s.symbol)) + '">' + head + trackPrep(lv.invalidation, close, lv.trigger) +
      '<div class="st-r-trkl vu-num"><span>Ungültig ' + usd(lv.invalidation) + '</span><span class="vu-mu">Schluss ' + usd(close) + '</span><span>Zone ' + usd(lv.trigger) + '</span></div>' +
      '<div class="st-r-sfoot"><span>noch <b class="vu-num">' + (isNum(dist) ? U.num(dist * 100, 1) + ' %' : '–') + '</b> bis zur Zone laut Methode</span></div></a>';
  }

  /* Chart C06 aus der veröffentlichten Tagesreihe (discover-series, ADR-002) */
  var SERIES = {};
  function series(sym) {
    if (SERIES[sym]) return SERIES[sym];
    var I = window.VUCore && window.VUCore.Identity;
    var id = I ? I.securityIdForTicker(sym) : null;
    SERIES[sym] = id ? fetch('/quant/data/market/discover-series/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }) : Promise.reject(new Error('Identität fehlt'));
    return SERIES[sym];
  }
  function identity(X) {
    return window.VUCore && window.VUCore.Identity ? Promise.resolve() : X.loadScript('/core/identity.js');
  }
  /* Zeichnet den Chart in host. marks: [[iso, '1'|'2']], levels: [{value,label,tone}] */
  function drawChart(host, points, o) {
    var x = o || {};
    if (!window.VUChart || !points || points.length < 2) { host.innerHTML = U.blank('Für diesen Zeitraum liegen keine Kurse vor. Es wird kein Ersatzchart gezeichnet.'); return; }
    var w = Math.max(300, Math.round(host.clientWidth || 330));
    var svg = window.VUChart.render(points, { width: w, height: x.height || 170, levels: x.levels, extent: x.extent, label: x.label, log: x.log });
    var box = document.createElement('div'); box.className = 'vu-chart st-r-chart';
    if (!svg) { host.innerHTML = U.blank('Für diesen Zeitraum liegen keine Kurse vor.'); return; }
    var g = svg.__vuGeometry, NS = 'http://www.w3.org/2000/svg';
    (x.lines || []).forEach(function (ln) {
      var d = '';
      ln.points.forEach(function (p, i) { var pt = g.pts[i]; if (!pt || pt.t !== p[0]) { pt = null; for (var k = 0; k < g.pts.length; k++) if (g.pts[k].t === p[0]) { pt = g.pts[k]; break; } } if (pt) d += (d ? 'L' : 'M') + pt.x.toFixed(1) + ' ' + g.y(p[1]).toFixed(1) + ' '; });
      var path = document.createElementNS(NS, 'path'); path.setAttribute('d', d.trim()); path.setAttribute('class', 'st-r-cmp'); svg.insertBefore(path, svg.querySelector('.vu-chart-line'));
    });
    (x.marks || []).forEach(function (m) {
      var pt = null; g.pts.forEach(function (p) { if (!pt && p.t >= m[0]) pt = p; });
      if (!pt) return;
      var c = document.createElementNS(NS, 'g'); c.setAttribute('class', 'st-r-mark');
      c.innerHTML = '<circle cx="' + pt.x.toFixed(1) + '" cy="' + (pt.y - 14).toFixed(1) + '" r="9"/><text x="' + pt.x.toFixed(1) + '" y="' + (pt.y - 10.5).toFixed(1) + '" text-anchor="middle">' + esc(m[1]) + '</text>';
      svg.appendChild(c);
    });
    box.appendChild(svg); host.replaceChildren(box);
  }
  function lastMonths(points, n) { if (!points || !points.length) return []; var cut = new Date(Date.parse(points[points.length - 1][0]) - n * 30.5 * 864e5).toISOString().slice(0, 10); return points.filter(function (p) { return p[0] >= cut; }); }
  function circled(n) { return n === '1' ? '①' : n === '2' ? '②' : n; }

  /* Zyklus aus einem Signal: erster Einstieg (ACTIVE) und Ausstieg (EXIT/CLOSED) */
  function cycle(s) {
    var tr = s.transitions || [], inn = null, out = null;
    tr.forEach(function (t) { if (!inn && t.state === 'ACTIVE') inn = t; if (!out && (t.state === 'EXIT' || t.state === 'CLOSED')) out = t; });
    return inn ? { inn: inn, out: out } : null;
  }
  /* Realisierte Entwicklung einer abgeschlossenen Modellposition: Einstiegs- zu Ausstiegskurs (CLOSED), ohne Nachrechnen eines Zustands */
  function tradeRes(s) {
    var inn = s.entry && s.entry.price, tr = s.transitions || [], out = null;
    for (var i = tr.length - 1; i >= 0 && out == null; i--) if (tr[i].state === 'CLOSED' || tr[i].state === 'EXIT') out = tr[i].price;
    if (s.exit && isNum(s.exit.price)) out = s.exit.price;
    return isNum(inn) && inn > 0 && isNum(out) ? out / inn - 1 : null;
  }
  function allOf(st) { return [].concat(st.open || [], st.closed || [], st.invalidated || [], st.retired || []); }

  /* ============================================================ SX01 Start („Das Rezept eines Profis“, Screen t-home) */
  function rhead(title, href, link, sub, tag) {
    return '<div class="st-x-rh"><div class="st-x-rh-t"><h2>' + esc(title) + '</h2>' + (tag || '') + (href ? '<a href="' + esc(href) + '">' + esc(link || 'Alle') + ' ' + U.glyph('next', 13) + '</a>' : '') + '</div>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function forschTag() { return '<span class="st-x-tag st-x-tag--ink">Forschung, nicht zertifiziert</span>'; }
  function methodCard(s) {
    var m = N ? N.method(s.candidateId) : null, meta = methodMeta(s);
    return '<a class="st-x-mc" href="' + esc(N ? N.href(s.candidateId) : '/supertrader/strategies/?sf=' + s.candidateId) + '"><div class="st-x-mc-top"><span class="st-x-style">' + esc(meta.style) + '</span>' + (m && m.depot ? '<span class="st-x-tag">Musterdepot</span>' : '') + '</div>' +
      '<b>' + esc(cn(s)) + '</b><span class="vu-xs vu-mu" style="font-weight:700">' + esc(meta.trader) + '</span><p>' + esc(meta.plain) + '</p><div class="st-x-mc-n"><b class="vu-num">' + n0(s.counts.published) + '</b><small>heute erkannt</small></div></a>';
  }
  function home(D, X) {
    var sig = D.signals, c = sig.counts || {}, main = page(X.main, X);
    var prep = (c.SETUP || 0) + (c.ENTRY_READY || 0), held = (c.ACTIVE || 0) + (c.WARNING || 0) + (c.EXIT || 0);
    append(main, '<div class="vu-ltag st-x-kick st-r-asof">Supertrader · Schluss ' + dShort(sig.asOf) + '</div><h1 class="st-x-lt">Methoden<br>der Profis</h1>' +
      '<p class="st-x-lead">13 Methoden berühmter Trader als feste Regeln, jeden Tag auf alle US-Aktien angewendet. Musterdepots zeigen, was die Regel tun würde. Ohne echtes Geld.</p>' +
      '<div class="st-x-gap">' + forschTag() + '</div>');
    var today = document.createElement('div'); today.className = 'st-x-gap12'; main.appendChild(today);
    var depHtml = '<div class="vu-ltag" style="margin-top:14px">Musterdepots · ohne echtes Geld</div><div class="st-x-tg st-x-tg--4">' + [[prep, 'warten'], [c.TRIGGERED || 0, 'heute aufgenommen'], [held, 'im Musterdepot'], [c.CLOSED || 0, 'abgegeben']].map(function (t) { return '<div><b class="vu-num">' + n0(t[0]) + '</b><span>' + esc(t[1]) + '</span></div>'; }).join('') + '</div>';
    today.innerHTML = '<div class="st-x-today" aria-busy="true"><div class="vu-ltag">Heute erkannt · alle US-Aktien</div>' + U.skeleton('rows') + depHtml + '</div>';
    var railHost = document.createElement('div'); main.appendChild(railHost);
    var planHost = document.createElement('div'); main.appendChild(planHost);
    var exHost = document.createElement('div'); main.appendChild(exHost);
    var navHost = document.createElement('div'); main.appendChild(navHost);
    navHost.innerHTML = '<a class="st-x-card st-x-nav" href="/supertrader/hausstrategie/">' + U.hud('supertrader', 42) + '<div><b>VU Hausstrategie</b><span>20 Aktien, je 5 %, eigene Regeln, Vorwärtslauf</span></div>' + U.glyph('next', 18) + '</a>' +
      '<a class="st-x-card st-x-nav" href="/supertrader/forschung/"><span class="vu-hud" style="--vu-hud:42px">' + U.glyph('line', 20) + '</span><div><b>Forschung</b><span data-bt>Wie belastbar ist welche Methode?</span></div>' + U.glyph('next', 18) + '</a>' +
      '<p class="st-x-foot">Rechenmodell nach öffentlich beschriebenen Regeln. Keine Anlageberatung, kein Rat zum Kauf oder Verkauf, kein Kursziel.</p>';
    foot(main, X, sig);

    X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var by = sum.counts.byStage || {}, list = sum.strategies.slice().sort(function (a, b) { return b.counts.published - a.counts.published; });
      today.innerHTML = '<div class="st-x-today"><div class="vu-ltag">Heute erkannt · alle US-Aktien · ' + dShort(sum.asOf) + '</div><div class="st-x-tg">' +
        STAGES.map(function (k) { return '<div><b class="vu-num">' + n0(by[k] || 0) + '</b><span>' + esc(STAGE_TXT[k]) + '</span></div>'; }).join('') + '</div>' +
        '<div style="margin-top:10px">' + (F ? F.erk(2, { dk: true }) : '') + '</div>' + depHtml + '</div>';
      railHead = rhead('Die 13 Methoden', '/supertrader/strategies/', 'Alle ' + list.length, 'Jede sucht ein bestimmtes Kursmuster.');
      railHost.innerHTML = railHead + '<div class="st-x-rail">' + list.map(methodCard).join('') + '</div>';
      /* Plan fertig: Zone und Ungültig-Marke stehen; Abstand zur Zone heute */
      var S = {}; sum.strategies.forEach(function (s) { S[s.candidateId] = s; });
      var rows = []; Object.keys(sum.top || {}).forEach(function (k) { (sum.top[k] || []).forEach(function (r) { if (r.s === 'MODELED_TRADE_PLAN') rows.push(r); }); });
      var seen = {}; rows = rows.sort(function (a, b) { return Math.abs(isNum(a.pd) ? a.pd : 9) - Math.abs(isNum(b.pd) ? b.pd : 9); }).filter(function (r) { if (seen[r.t]) return false; seen[r.t] = 1; return true; });
      var nPlan = by.MODELED_TRADE_PLAN || rows.length;
      planHost.innerHTML = rhead('Plan fertig', '/supertrader/treffer/?schritt=plan', 'Alle ' + n0(nPlan), 'Zone und Ungültig-Marke laut Methode stehen. Abstand zur Zone heute:') + (rows.length ? '<div class="st-x-card st-x-card--rows">' + rows.slice(0, 4).map(function (r) {
        return '<a class="st-x-mr" href="' + esc(stockHref(r.t)) + '">' + U.logo(r.t) + '<div><b>' + esc(r.n || r.t) + '</b><span>' + esc(cnId(S, r.c)) + '</span></div><div class="st-x-mr-v">' + (isNum(r.pd) ? U.chg(r.pd * 100, { digits: 1 }) : '–') + '<small>zur Zone</small></div></a>';
      }).join('') + '</div>' : U.blank('Heute hat keine Aktie einen fertigen Plan.'));
    }).catch(function () { today.innerHTML = '<div class="st-x-today">' + depHtml + '</div>'; railHost.innerHTML = U.blank('Die 13 Methoden sind gerade nicht erreichbar. Bitte später erneut versuchen.'); });
    var railHead = '';

    X.getJSON('backtests.json').then(function (bt) {
      var runs = (bt.runs || []).filter(function (r) { return r.active; }), proven = runs.filter(function (r) { return r.metricsPublishable; }).length;
      var t = navHost.querySelector('[data-bt]'); if (t && runs.length) t.textContent = proven + ' von ' + runs.length + ' Regelversionen mit belegtem Vorteil';
    }).catch(function () {});

    /* So läuft ein Durchgang: ein abgeschlossener Durchgang im Musterdepot (NVIDIA, Turtle · 20 Tage) */
    Promise.all([X.getJSON('stock/NVDA.json'), identity(X)]).then(function (r) {
      var st = r[0].strategies && r[0].strategies.DONCHIAN_TURTLE, cyc = null;
      allOf(st || {}).filter(function (s) { return s.symbol === 'NVDA' && s.state === 'CLOSED'; }).forEach(function (s) { var cy = cycle(s); if (cy && cy.out && (!cyc || cy.inn.date > cyc.inn.date)) cyc = cy; });
      if (!cyc) return;
      return series('NVDA').then(function (ser) {
        var res = isNum(cyc.inn.price) && cyc.inn.price > 0 && isNum(cyc.out.price) ? cyc.out.price / cyc.inn.price - 1 : null;
        var mon = new Date(cyc.inn.date + 'T12:00:00Z').toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        exHost.innerHTML = rhead('So läuft ein Durchgang', '/supertrader/beispiel/', 'Alle', 'NVIDIA im Musterdepot ' + (N ? N.name('DONCHIAN_TURTLE') : 'Turtle') + ', ' + mon + '.') +
          '<div class="st-x-card">' + (F ? F.dep(3) : '') + '<div class="st-r-gap8" data-chart></div><div class="st-x-marks"><b>① ' + dShort(cyc.inn.date) + '</b> Musterdepot nimmt auf · ' + usd(cyc.inn.price) + '<br><b>② ' + dShort(cyc.out.date) + '</b> Musterdepot gibt ab · ' + usd(cyc.out.price) + ' ' + (isNum(res) ? '<span class="st-r-res">' + U.chg(res * 100) + '</span>' : '') + '</div></div>';
        drawChart(exHost.querySelector('[data-chart]'), lastMonths(ser.points, 3), { marks: [[cyc.inn.date, '1'], [cyc.out.date, '2']], label: 'NVIDIA', height: 120 });
      });
    }).catch(function () { exHost.innerHTML = ''; });
  }

  /* ============================================================ SX02 Methoden (Screen t-methods) */
  function methodRow(s) {
    var m = N ? N.method(s.candidateId) : null, meta = methodMeta(s);
    return '<a class="st-x-mr2" href="' + esc(N ? N.href(s.candidateId) : '/supertrader/strategies/?sf=' + s.candidateId) + '" data-style="' + esc(meta.style) + '" data-depot="' + (m && m.depot ? '1' : '') + '" data-q="' + esc((cn(s) + ' ' + meta.trader).toLowerCase()) + '">' +
      '<div style="min-width:0"><div class="st-x-mr2-h"><b>' + esc(cn(s)) + '</b>' + (m && m.depot ? '<span class="st-x-tag st-x-tag--sm">Musterdepot</span>' : '') + '</div><span class="st-x-sub">' + esc(meta.trader + ' · ' + meta.style) + '</span><p>' + esc(meta.plain) + '</p></div>' +
      '<div class="st-x-mr2-n"><b class="vu-num">' + n0(s.counts.published) + '</b><small>heute</small></div></a>';
  }
  function strategies(D, X) {
    var reg = D.registry, sig = D.signals, main = page(X.main, X);
    var other = reg.strategies.filter(function (s) { return s.mode !== 'LIVE'; });
    /* Frühere Reiter (#musterdepots, #weitere) führen auf dieselbe Liste; der Filter „Mit Musterdepot“ ersetzt den Reiter. */
    var tab = (location.hash || '').replace('#', '');
    append(main, '<div class="vu-ltag st-x-kick">Methoden</div><h1 class="st-x-lt">Was sucht<br>welche Methode?</h1>' +
      '<p class="st-x-lead">Ein Name je Methode: Trader · Muster. Fünf haben ein Musterdepot.</p>');
    var host = document.createElement('div'); main.appendChild(host);
    host.innerHTML = U.blank('Die 13 Methoden werden geladen …', { verdict: false });
    X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var list = sum.strategies.slice().sort(function (a, b) { return b.counts.published - a.counts.published; });
      var cnt = {}, dep = 0; list.forEach(function (s) { var st = methodMeta(s).style; cnt[st] = (cnt[st] || 0) + 1; if (N && N.method(s.candidateId) && N.method(s.candidateId).depot) dep++; });
      var styles = (N ? N.STYLES : STYLES).filter(function (x) { return cnt[x]; }).sort(function (a, b) { return cnt[b] - cnt[a]; });
      var f = { q: '', style: '', depot: tab === 'musterdepots' };
      host.innerHTML = '<label class="st-r-search st-x-gap12">' + U.glyph('search', 18) + '<input type="search" placeholder="Methode oder Trader …" aria-label="Methode oder Trader suchen"></label>' +
        '<div class="st-x-chips" role="group" aria-label="Filter"><button type="button" class="vu-chip" data-k="" aria-pressed="' + !f.depot + '">Alle ' + list.length + '</button><button type="button" class="vu-chip" data-k="depot" aria-pressed="' + f.depot + '">Mit Musterdepot ' + dep + '</button>' +
        styles.map(function (x) { return '<button type="button" class="vu-chip" data-k="style" data-v="' + esc(x) + '" aria-pressed="false">' + esc(x) + ' ' + cnt[x] + '</button>'; }).join('') + '</div>' +
        '<div class="st-x-gap" data-list>' + list.map(methodRow).join('') + '</div><p class="st-x-none vu-sm vu-mu" hidden>Keine Methode passt zur Suche.</p>' +
        '<div class="st-x-card" style="margin-top:14px" id="weitere"><b class="vu-sm">' + esc(N ? N.RESEARCH_LABEL : 'Weitere Modelle in der Forschung') + '</b><p class="vu-xs vu-mu" style="margin:4px 0 0">' +
          other.filter(function (s) { return !(N && N.isMethod(s.strategy_id)); }).map(function (s) { return '<a href="' + esc(X.stratUrl(s)) + '">' + esc(wn(s)) + '</a>'; }).join(', ') + ': Teilprüfung, ohne tägliche Erkennung.</p></div>' +
        '<div class="st-r-gap">' + U.help('Die Zahl rechts: wie viele US-Aktien am ' + dShort(sum.asOf) + ' das Muster zeigen. Sie sagt nichts darüber, ob die Methode Geld verdient.') + '</div>';
      function apply() {
        var any = false;
        [].forEach.call(host.querySelectorAll('.st-x-mr2'), function (a) { var ok = (!f.style || a.getAttribute('data-style') === f.style) && (!f.depot || a.getAttribute('data-depot')) && (!f.q || a.getAttribute('data-q').indexOf(f.q) >= 0); a.hidden = !ok; any = any || ok; });
        host.querySelector('.st-x-none').hidden = any;
      }
      host.querySelector('input').addEventListener('input', function () { f.q = this.value.trim().toLowerCase(); apply(); });
      host.querySelector('.st-x-chips').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        [].forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var k = b.getAttribute('data-k'); f.depot = k === 'depot'; f.style = k === 'style' ? b.getAttribute('data-v') : '';
        history.replaceState(null, '', location.pathname + location.search + (f.depot ? '#musterdepots' : ''));
        apply();
      });
      apply();
      if (tab === 'weitere') { var w = host.querySelector('#weitere'); if (w && w.scrollIntoView) w.scrollIntoView(); }
    }).catch(function () { host.innerHTML = U.blank('Die 13 Methoden sind gerade nicht erreichbar. Bitte später erneut versuchen.'); });
    foot(main, X, sig);
  }

  /* ============================================================ SX03 Eine Methode mit Musterdepot (Screen t-method) */
  /* Zonenleiste: drei Punkte auf einer Linie (Ungültig-Marke, Kurs/Aufnahme, Zone/Schluss), mit Beschriftung darunter. */
  function zoneBar(pts, o) {
    var vs = pts.filter(function (p) { return isNum(p.v); }); if (vs.length < 2) return '';
    var lo = Math.min.apply(null, vs.map(function (p) { return p.v; })), hi = Math.max.apply(null, vs.map(function (p) { return p.v; })), x = function (v) { return ((v - lo) / (hi - lo || 1) * 100).toFixed(1); };
    var sm = o && o.sm;
    return '<div class="st-x-zb' + (sm ? ' st-x-zb--sm' : '') + '" role="img" aria-label="' + esc(pts.map(function (p) { return p.label + ' ' + usd(p.v); }).join(', ')) + '">' + pts.map(function (p) { return isNum(p.v) ? '<i class="' + (p.cls || '') + '" style="left:' + x(p.v) + '%"></i>' : ''; }).join('') + '</div>' +
      '<div class="st-x-zbl' + (sm ? ' st-x-zbl--xs st-r-sfoot' : '') + '">' + pts.map(function (p) { return '<span>' + esc(p.label) + (sm ? ' ' : '<br>') + '<b class="vu-num">' + usd(p.v) + '</b></span>'; }).join('') + '</div>';
  }
  function liveMethod(D, X, s) {
    var id = s.strategy_id, sig = D.signals, main = page(X.main, X), c = (s.rule_cards || [])[0], e = s.evidence || {};
    var cid = (N && N.methodOfDepot(id)) || SF_OF[id], m = N && cid ? N.method(cid) : null;
    var st = sig.strategies[id] || { open: [] };
    var mp = D.portfolio && D.portfolio.strategies && D.portfolio.strategies[id], cfg = (mp && mp.config) || {};
    var trader = m ? m.trader : (s.originator || ''), pattern = m ? m.pattern : wn(s);
    append(main, '<header class="st-x-hero"><div class="st-x-hero-nav"><a class="st-x-hb" href="/supertrader/strategies/" aria-label="Zurück zu den Methoden">' + U.glyph('back', 18) + '</a></div>' +
      '<div class="st-x-hero-tags">' + (m ? '<span class="st-x-tag st-x-tag--dk">' + esc(m.style) + '</span>' : '') + '<span class="st-x-tag">Musterdepot</span></div>' +
      '<h1 class="vu-lt">' + esc(trader) + '<span>' + esc(pattern) + '</span></h1>' +
      '<p>' + esc((m ? m.plain : s.tagline || '') + ' Nach ' + (m ? m.author : s.originator || '') + ', als feste Regel umgesetzt.') + '</p>' +
      '<div class="st-x-g2"><div class="st-x-mini"><small>Heute erkannt</small><b class="vu-num" data-today>…</b></div><div class="st-x-mini" data-depot><small>Musterdepot</small><b class="vu-num">' + (mp ? n0(mp.openCount || 0) + ' von ' + n0(cfg.maxPositions || 0) + ' Plätzen' : n0(st.open.filter(function (x) { return x.entry; }).length) + ' im Musterdepot') + '</b></div></div></header>');
    if (cid) X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var q = sum.strategies.filter(function (x) { return x.candidateId === cid; })[0], b = main.querySelector('[data-today]');
      b.textContent = q ? n0(q.counts.published) + ' Aktien' : '–';
    }).catch(function () { main.querySelector('[data-today]').textContent = '–'; });
    else main.querySelector('[data-today]').textContent = '–';
    var th = N && cid ? N.think(cid) : null;
    if (th) append(main, '<h2 class="st-x-st">So denkt die Methode</h2><div class="st-x-g3">' + th.map(function (t, i) { return '<div class="st-x-card st-x-think"><span class="st-x-stepn">' + (i + 1) + '</span><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span></div>'; }).join('') + '</div>');

    /* Im Musterdepot gerade: der Eintrag, der der Zone am nächsten ist (sonst die jüngste Aufnahme) */
    var near = st.open.filter(function (x) { return !x.entry && (x.state === 'ENTRY_READY' || x.state === 'SETUP'); }).sort(function (a, b) { return (a.state === 'ENTRY_READY' ? 0 : 1) - (b.state === 'ENTRY_READY' ? 0 : 1) || X.dist(a) - X.dist(b); });
    var held = st.open.filter(function (x) { return x.entry; }).sort(function (a, b) { return String(b.entry.date || '').localeCompare(String(a.entry.date || '')); });
    var first = near[0] || held[0];
    append(main, '<h2 class="st-x-st">Im Musterdepot gerade<a href="/supertrader/treffer/?method=' + esc(id) + '">Protokoll seit ' + dShort(st.liveSince) + '</a></h2>');
    var pos = document.createElement('div'); main.appendChild(pos);
    if (first) {
      var lv = first.levels || {}, close = first.lastPrice, step = F ? F.stepOfState(first.state) : 0, dist = isNum(lv.trigger) && isNum(close) && close > 0 ? lv.trigger / close - 1 : null;
      var sub = first.entry ? (F ? F.wordOfState(first.state) : '') + ' seit ' + dShort(first.entry.date) : 'Plan fertig · ' + (isNum(dist) ? U.num(Math.max(0, dist) * 100, 1) + ' % bis zur Zone' : 'Zone laut Methode');
      var right = first.entry ? U.chg(isNum(close) ? (close / first.entry.price - 1) * 100 : null) : U.verdict('mid', isNum(dist) ? 'noch ' + U.num(Math.max(0, dist) * 100, 1) + ' %' : 'Wartet');
      var zb = first.entry ? zoneBar([{ v: stopOf(first), label: 'Ungültig laut Methode' }, { v: first.entry.price, label: 'Aufnahme', cls: 'z' }, { v: close, label: 'Schluss', cls: 'me' }]) : zoneBar([{ v: lv.invalidation, label: 'Ungültig laut Methode' }, { v: close, label: 'Schluss', cls: 'me' }, { v: lv.trigger, label: 'Zone laut Methode', cls: 'z' }]);
      pos.innerHTML = '<a class="st-x-card st-x-pos" href="' + esc(stockHref(first.symbol)) + '" style="display:block;color:inherit;text-decoration:none"><div class="st-x-pos-h">' + U.logo(first.symbol) + '<div><b>' + esc(nameOf(first)) + '</b><span>' + esc(sub) + '</span></div>' + right + '</div>' +
        (F ? F.dep(step < 0 ? 0 : step) : '') + zb + '<div class="st-r-gap8" data-chart></div></a>';
      identity(X).then(function () { return series(first.symbol); }).then(function (ser) {
        var levels = [];
        if (!first.entry && isNum(lv.trigger)) levels.push({ value: lv.trigger, label: 'Zone laut Methode', tone: 'lime' });
        if (!first.entry && isNum(lv.invalidation)) levels.push({ value: lv.invalidation, label: 'Ungültig', tone: 'grey' });
        if (first.entry && isNum(stopOf(first))) levels.push({ value: stopOf(first), label: 'Ungültig', tone: 'grey' });
        drawChart(pos.querySelector('[data-chart]'), lastMonths(ser.points, 3), { levels: levels, label: first.symbol, height: 110 });
      }).catch(function () { pos.querySelector('[data-chart]').innerHTML = ''; });
    } else pos.innerHTML = U.blank('Heute wartet keine Aktie auf die Aufnahme, und das Musterdepot hält gerade keine.');
    append(main, '<div class="st-x-g3" style="margin-top:10px">' + [[X.closedCount(st), 'abgegeben'], [st.invalidatedTotal || 0, 'Muster zerfallen'], [st.retiredTotal || 0, 'Regel geändert']].map(function (t) { return '<div class="st-x-kt"><small>' + esc(t[1]) + '</small><b class="vu-num">' + n0(t[0]) + '</b></div>'; }).join('') + '</div>');
    if (mp) append(main, '<h2 class="vu-visually-hidden">Laufend nach Regel</h2><p class="vu-xs vu-mu st-r-gap8">Musterdepot: ' + pp(mp.investedPct || 0, 0) + ' investiert, ' + pp(mp.cashPct == null ? 1 : mp.cashPct, 0) + ' Bargeld, Anteil je Aufnahme ' + (isNum(cfg.riskPerTrade) ? U.num(cfg.riskPerTrade * 100, 2) + ' %' : '–') + '. Rechenmodell, kein echtes Geld. <a href="/portfolios/#/supertrader">Alle Musterdepots im Bereich Portfolios</a></p>');

    /* Wie nah an der Originalregel? */
    var fc = (s.fidelity && s.fidelity.counts) || null;
    if (fc) {
      var parts = [[fc.ORIGINAL || 0, 'wörtlich vom Trader', 'var(--vu-lime)'], [(fc.OPERATIONALIZATION || 0) + (fc.DOCUMENTED_VARIANT || 0), 'umgesetzt', 'var(--vu-ink)'], [fc.VU_EXTENSION || 0, fc.VU_EXTENSION === 1 ? 'Ergänzung' : 'Ergänzungen', '#8c8c8c'], [fc.UNBACKED || 0, 'ohne Beleg', '#c4c4c4'], [fc.MISSING || 0, 'fehlen', 'var(--vu-hair)']];
      var tot = parts.reduce(function (a, x) { return a + x[0]; }, 0);
      if (tot) append(main, '<h2 class="st-x-st">Wie nah an der Originalregel?</h2><div class="st-x-card st-r-fid-box"><div class="st-x-mt3 st-r-fid" role="img" aria-label="' + esc(parts.map(function (x) { return x[0] + ' ' + x[1]; }).join(', ')) + '">' + parts.filter(function (x) { return x[0]; }).map(function (x) { return '<i style="width:' + (x[0] / tot * 100).toFixed(1) + '%;background:' + x[2] + '"></i>'; }).join('') + '</div>' +
        '<p class="vu-xs" style="margin:8px 0 0;font-weight:700">' + tot + ' Regelteile: ' + parts.filter(function (x) { return x[0]; }).map(function (x) { return x[0] + ' ' + x[1]; }).join(' · ') + '</p></div>');
    }
    append(main, '<a class="st-x-card st-r-belast" href="/supertrader/forschung/" style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;color:inherit;text-decoration:none"><div>' + forschTag() + '<b style="display:block;margin-top:6px">Wie belastbar?</b><span class="vu-xs vu-mu">' + esc((e.levelLabel || 'In Prüfung') + '. Ein Vorteil ist nicht belegt.') + '</span></div>' + U.glyph('next', 16) + '</a>');

    /* Kapitel: Regeln im Detail, Herkunft, Lücken (je ein Sheet) */
    var srcN = (s.fidelity && s.fidelity.rules && s.fidelity.rules.length) || 0, miss = (s.fidelity && s.fidelity.missing) || [], edges = (c && c.edge_cases) || [];
    var eps = [['st-rulecard', 'Die Regeln im Detail', c ? c.sections.length + ' Abschnitte' : 'Regeln der Version ' + s.strategy_version, 'list'], ['st-origin', 'Was stammt vom Trader?', 'Quellen je Regelteil', 'book'], ['st-gaps', 'Lücken und fehlende Daten', miss.length ? miss.length + (miss.length === 1 ? ' Regelteil fehlt' : ' Regelteile fehlen') : 'Grenzfälle und Konflikte', 'filter']];
    append(main, '<div class="st-x-eps">' + eps.map(function (x, i) { return '<button type="button" class="st-x-ep" data-sheet="' + x[0] + '"><b class="st-x-ep-n">' + (i + 1) + '</b><span class="vu-hud">' + U.glyph(x[3], 19) + '</span><span class="st-x-ep-t"><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></span><span class="st-x-ep-c">' + U.glyph('next', 15) + '</span></button>'; }).join('') + '</div>');
    var rc = document.createElement('div');
    if (c) rc.appendChild(frag('<p class="vu-sm vu-mu">' + U.pro() + ' Version ' + esc(c.rule_version) + ' · ' + c.sections.length + ' Abschnitte · eingefroren</p>' + c.sections.map(function (x) { return '<div class="st-r-rc"><div><b>' + esc(x.title) + '</b><span>' + esc(x.text) + '</span></div>' + provVerdict(x.provenance) + '</div>'; }).join('')));
    var rb = X.rulesBlock(s, D); if (rb) { rc.appendChild(frag('<h3 class="vu-sm" style="margin-top:14px">Alle Regeln der Version ' + esc(s.strategy_version) + '</h3>')); rc.appendChild(rb); }
    addSheet('st-rulecard', 'Die Regeln im Detail', '');
    fillSheet('st-rulecard', rc);
    var og = document.createElement('div');
    if (s.fidelity && s.fidelity.rules && s.fidelity.rules.length) og.appendChild(X.fidelityList(s, D));
    if (c && X.assessments) { og.appendChild(frag('<h3 class="vu-sm" style="margin-top:14px">Was ist belegt? Regel, Quellen, Daten, Evidenz</h3>')); og.appendChild(X.assessments(s, c, D)); }
    addSheet('st-origin', 'Was stammt vom Trader?', ''); fillSheet('st-origin', og);
    var gp = document.createElement('div');
    if (miss.length) gp.appendChild(frag('<p><b>Fehlt im Code</b></p><ul class="st-r-ul">' + miss.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'));
    if (edges.length) gp.appendChild(X.ruleCardList({ sections: edges }));
    if (s.prohibited_interpretations && s.prohibited_interpretations.length) gp.appendChild(frag('<p><b>Was diese Methode nicht ist</b></p><ul class="st-r-ul">' + s.prohibited_interpretations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'));
    if (!gp.childNodes.length) gp.appendChild(frag(U.blank('Für diese Version sind keine Lücken erfasst.')));
    addSheet('st-gaps', 'Lücken und fehlende Daten', ''); fillSheet('st-gaps', gp);
    foot(main, X, sig);
  }
  /* Hängt einen Knoten vor den Schließen-Knopf eines Sheets. */
  function fillSheet(id, node) { var sh = document.getElementById(id); if (!sh) return; var close = sh.querySelector('.st-r-close'); if (close) close.parentNode.insertBefore(node, close); else sh.appendChild(node); }

  /* ============================================================ ST03 Methode */
  var PROV = { ORIGINAL: ['strong', 'Original'], ORIGINAL_INTERPRETATION: ['strong', 'Original'], VU_FORMALIZATION: ['mid', 'umgesetzt'], VU_OWN: ['none', 'VU-eigen'], FOREIGN_RULE: ['none', 'Fremdregel'], UNRESOLVED: ['weak', 'ungeklärt'], NOT_PUBLIC: ['none', 'nicht öffentlich'], VU: ['none', 'VU-eigen'] };
  function provVerdict(p) { var x = PROV[p] || ['none', p || '–']; return U.verdict(x[0], x[1]); }
  function evVerdict(s) {
    var e = s.evidence || {}, lv = e.level;
    if (lv === 'NOT_TESTED' || !lv) return U.verdict('none', e.levelLabel || 'Noch nicht geprüft');
    if (lv === 'IN_REVIEW') return U.verdict('none', e.levelLabel || 'In Prüfung');
    return U.verdict('weak', e.levelLabel || lv);
  }
  function strategy(D, X) {
    var id = document.body.getAttribute('data-strategy'), reg = D.registry, sig = D.signals, S = X.stratMap(reg), s = S[id];
    if (!s) return X.legacy(X.main, D);
    if (s.mode === 'LIVE') return liveMethod(D, X, s);
    var main = page(X.main, X), e = s.evidence || {}, c = (s.rule_cards || [])[0];
    var sub = s.mode === 'LIVE' ? 'Das Musterdepot nimmt erst auf, wenn der Kurs über die Zone laut Methode steigt.' : '';
    append(main, back('/supertrader/strategies/', 'Methoden') +
      '<div class="vu-ltag st-r-kick0">Methode · ' + esc(s.originator || s.strategy_family || '') + '</div><h1 class="vu-lt">' + esc(wn(s)) + '</h1>' +
      '<p class="st-r-leadx">' + esc(s.tagline || '') + (sub ? ' <b>' + esc(sub) + '</b>' : '') + '</p>' +
      '<div class="vu-box st-r-belast"><div class="st-r-bh"><b>Wie belastbar?</b>' + evVerdict(s) + '</div><p class="vu-sm">' + esc(s.mode === 'LIVE' ? 'Neue Treffer sind Beobachtungen. Ein Vorteil ist noch nicht belegt.' : (e.levelPlain || 'Für diese Methode ist kein Vorteil belegt.')) + '</p>' +
      '<div class="st-r-gap8">' + U.research() + '</div></div>');
    if (s.mode !== 'LIVE') {
      /* ST03 für Methoden ohne Live-Musterdepot (52W, Teilprüfung, fehlende Daten, Namenskarte): dieselben Bausteine wie die
         Live-Methoden (Treffer der Originalregel, Methodentreue, Tiefer einsteigen); die übrigen Angaben der bisherigen Seite
         vollständig unter „Weitere Angaben“. */
      var nl = document.createElement('div'); main.appendChild(nl);
      var cid0 = SF_OF[id];
      if (cid0) {
        var t0 = document.createElement('div'); t0.className = 'vu-grid st-r-gap'; nl.appendChild(t0);
        t0.innerHTML = U.tile('Treffer heute', '…', 'Originalregel');
        X.getJSON('sf-candidates/summary.json').then(function (sum) {
          var m = sum.strategies.filter(function (x) { return x.candidateId === cid0; })[0];
          t0.innerHTML = '<a class="st-r-tilebtn" href="/supertrader/strategies/?sf=' + cid0 + '">' + U.tile('Treffer heute', m ? n0(m.counts.published) : '–', m ? cn(m) + ', Originalregel' : 'nicht verfügbar') + '</a>';
        }).catch(function () { t0.innerHTML = U.tile('Treffer heute', '–', 'gerade nicht erreichbar'); });
      }
      append(nl, fidelityBox(s));
      deepDive(nl, s, c, D, X);
      var more = document.createElement('details'); more.className = 'st-r-acc st-r-legacy-acc';
      more.innerHTML = '<summary><b>Weitere Angaben dieser Methode</b>' + U.glyph('next', 16) + '</summary>';
      var host = document.createElement('div'); host.className = 'st-r-accb st-r-legacy'; more.appendChild(host); nl.appendChild(more);
      X.legacy(host, D);
      [].forEach.call(host.querySelectorAll('.st-hero, .st-productline, .st-evbanner'), function (n) { n.remove(); });
      append(nl, note('Regelbasierte Nachbildung einer Methode. Keine Anlageberatung.'));
      return;
    }
    var st = sig.strategies[id] || { open: [] };
    var near = st.open.filter(function (x) { return !x.entry && (x.state === 'ENTRY_READY' || x.state === 'SETUP'); }).sort(function (a, b) { return (a.state === 'ENTRY_READY' ? 0 : 1) - (b.state === 'ENTRY_READY' ? 0 : 1) || X.dist(a) - X.dist(b); });
    var ready = near.filter(function (x) { return x.state === 'ENTRY_READY'; });
    var held = st.open.filter(function (x) { return x.entry; });
    var tiles = document.createElement('div'); tiles.className = 'vu-grid st-r-gap'; main.appendChild(tiles);
    tiles.innerHTML = U.tile('Treffer heute', '…', 'Originalregel') + U.tile('Musterdepot', n0(ready.length), 'Plan fertig');
    var cid = SF_OF[id];
    if (cid) X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var m = sum.strategies.filter(function (x) { return x.candidateId === cid; })[0];
      tiles.innerHTML = '<a class="st-r-tilebtn" href="/supertrader/strategies/?sf=' + cid + '">' + U.tile('Treffer heute', m ? n0(m.counts.published) : '–', m ? cn(m) + ', Originalregel' : 'nicht verfügbar') + '</a>' + U.tile('Musterdepot', n0(ready.length), 'Plan fertig');
    }).catch(function () { tiles.innerHTML = U.tile('Treffer heute', '–', 'gerade nicht erreichbar') + U.tile('Musterdepot', n0(ready.length), 'Plan fertig'); });
    else tiles.innerHTML = U.tile('Offene Einträge', n0(st.open.length), 'im Musterdepot') + U.tile('Musterdepot', n0(ready.length), 'Plan fertig');

    var list = near.slice(0, 5);
    append(main, kick(ready.length ? 'Heute Plan fertig' : 'Heute wartend', 'Musterdepot, Version ' + (s.strategy_version || '–')) +
      (list.length ? list.map(function (x) { return sigCard(x, X.shortWhy ? X.shortWhy(x) : ''); }).join('') : U.blank('Heute hat keine Aktie einen fertigen Plan.')) +
      (near.length > list.length || held.length ? '<a class="st-r-link" href="/supertrader/treffer/?method=' + esc(id) + '">Alle ' + st.open.length + ' Einträge der Methode ' + U.glyph('next', 14) + '</a>' : '') +
      '<div class="st-r-gap">' + U.help('Zone laut Methode: Steigt der Kurs darüber, nimmt das Musterdepot die Aktie auf. Fällt er unter die Ungültig-Marke, ist das Muster zerfallen.') + '</div>');
    var first = list[0] || held[0];
    if (first) {
      var ch = document.createElement('div'); main.appendChild(ch);
      append(ch, U.sect(first.symbol + ' im Chart', { href: stockHref(first.symbol), link: 'Zur Aktie' }) + '<div class="vu-box st-r-chartbox"><div data-chart></div></div>');
      identity(X).then(function () { return series(first.symbol); }).then(function (ser) {
        var lv = first.levels || {}, levels = [];
        if (!first.entry && isNum(lv.trigger)) levels.push({ value: lv.trigger, label: 'Zone laut Methode', tone: 'lime' });
        if (!first.entry && isNum(lv.invalidation)) levels.push({ value: lv.invalidation, label: 'Ungültig', tone: 'grey' });
        if (first.entry && isNum(stopOf(first))) levels.push({ value: stopOf(first), label: 'Ungültig', tone: 'grey' });
        drawChart(ch.querySelector('[data-chart]'), lastMonths(ser.points, 3), { levels: levels, label: first.symbol, height: 170 });
      }).catch(function () { ch.querySelector('[data-chart]').innerHTML = U.blank('Für ' + first.symbol + ' liegen keine veröffentlichten Tageskurse vor.'); });
    }
    var after = document.createElement('div'); main.appendChild(after);
    var mp = D.portfolio && D.portfolio.strategies && D.portfolio.strategies[id], cfg = (mp && mp.config) || {};
    var fidHtml = fidelityBox(s);
    append(after, kick('Protokoll seit ' + dDe(st.liveSince), 'Was bisher passiert ist') +
      '<div class="vu-grid st-r-g3">' + U.tile('Abgegeben', n0(X.closedCount(st)), '') + U.tile('Muster zerfallen', n0(st.invalidatedTotal || 0), '') + U.tile('Regelwechsel', n0(st.retiredTotal || 0), '') + '</div>' +
      (mp ? kick('Musterdepot', 'Laufend nach Regel') + '<div class="vu-box st-r-kv">' + [['Investiert', pp(mp.investedPct || 0, 0)], ['Bargeld', pp(mp.cashPct == null ? 1 : mp.cashPct, 0)], ['Positionen', (mp.openCount || 0) + ' von ' + (cfg.maxPositions || '–')], ['Anteil je Aufnahme', isNum(cfg.riskPerTrade) ? U.num(cfg.riskPerTrade * 100, 2) + ' %' : '–']].map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b class="vu-num">' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' +
        '<div class="st-r-gap">' + U.help('Anteil je Aufnahme im Musterdepot: Fällt der Kurs bis zur Ungültig-Marke laut Methode, verliert das Rechenmodell höchstens ' + (isNum(cfg.riskPerTrade) ? U.num(cfg.riskPerTrade * 100, 2) + ' %' : 'den festgelegten Anteil') + ' seines Werts.') + '</div>' : '') +
      fidHtml);

    deepDive(after, s, c, D, X);
    /* Owner-Feedback 07.11.2026: ein Hinweissatz am Seitenende genügt – foot() trägt ihn (Daten & Methodik + st-legal). */
    foot(after, X, sig);
  }
  /* ST03: Methodentreue als ein Balken (für jede Methode, auch ohne Live-Musterdepot). */
  function fidelityBox(s) {
    var fc = (s.fidelity && s.fidelity.counts) || null;
    var fid = fc ? [[fc.ORIGINAL || 0, 'Original', 'l'], [(fc.OPERATIONALIZATION || 0) + (fc.DOCUMENTED_VARIANT || 0), 'umgesetzt', 'k'], [fc.VU_EXTENSION || 0, 'VU-Erweiterung', 'm'], [fc.UNBACKED || 0, 'unbelegt', 'm'], [fc.MISSING || 0, 'fehlen', 'h']] : null;
    var fidTotal = fid ? fid.reduce(function (a, x) { return a + x[0]; }, 0) : 0;
    return (fid && fidTotal ? kick('Woher die Regel stammt', 'Methodentreue') + '<div class="vu-box"><div class="st-r-fid">' + fid.filter(function (x) { return x[0]; }).map(function (x) { return '<i class="' + x[2] + '" style="flex:' + x[0] + '"></i>'; }).join('') + '</div><div class="st-r-fidl">' + fid.filter(function (x) { return x[0]; }).map(function (x) { return '<span class="' + (x[2] === 'l' || x[2] === 'k' ? '' : 'vu-mu') + '">' + x[0] + ' ' + esc(x[1]) + '</span>'; }).join('') + '</div></div>' +
        '<div class="st-r-gap">' + U.help(fidTotal + ' Regelteile: ' + fid.map(function (x) { return x[0] + ' ' + x[1]; }).join(', ') + '. ' + (s.fidelity.statusPlain || '')) + '</div>' : '');
  }
  /* ST03: „Tiefer einsteigen“ (So denkt die Methode, Regelkarte PRO, alle Regeln PRO, Lücken, Was sie nicht ist, Quellen). */
  function deepDive(after, s, c, D, X) {
    /* Tiefer einsteigen */
    var srcs = (s.sources || []).map(function (sid) { return D.srcMap[sid] || { title: sid }; });
    append(after, U.sect('Mehr zur Methode') + '<div class="st-r-accs">' +
      acc('So denkt die Methode', '<p>' + esc(s.story || '') + '</p>' + (s.how_it_thinks && s.how_it_thinks.length ? '<ol class="st-r-ol">' + s.how_it_thinks.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>' : '')) +
      (c ? '<button type="button" class="st-r-acc st-r-accbtn" data-sheet="st-rulecard"><b>Regelkarte, ' + c.sections.length + ' Abschnitte</b>' + U.pro() + U.glyph('next', 16) + '</button>' : '') +
      '<div data-slot="assess"></div><div data-slot="rules"></div><div data-slot="fid"></div>' +
      (c && c.edge_cases && c.edge_cases.length || (s.fidelity && s.fidelity.missing && s.fidelity.missing.length) ? '<div data-slot="gaps"></div>' : '') +
      (s.prohibited_interpretations && s.prohibited_interpretations.length ? acc('Was diese Methode nicht ist', '<ul class="st-r-ul">' + s.prohibited_interpretations.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>') : '') + '</div>');
    /* Owner-Entscheidung 07.11.2026: Quellenliste nicht mehr je Methode, sondern zentral (/supertrader/sources/, verlinkt aus
       Menü → Rechtliches & Infos → Datenquellen & Methodik und aus „Daten & Methodik“ dieser Seite). */
    var slot = function (k, title, node, right) { var h = after.querySelector('[data-slot="' + k + '"]'); if (!h || !node) return; h.replaceWith(frag(acc(title, '', right))); var d = after.querySelectorAll('.st-r-acc'); var last = null; [].forEach.call(d, function (x) { if (x.querySelector('summary b') && x.querySelector('summary b').textContent === title) last = x; }); if (last) last.querySelector('.st-r-accb').appendChild(node); };
    if (c && X.assessments) slot('assess', 'Was ist belegt? Regel, Quellen, Daten, Evidenz', X.assessments(s, c, D));
    slot('rules', 'Alle Regeln der Version ' + s.strategy_version, X.rulesBlock(s, D), U.pro());
    if (s.fidelity && s.fidelity.rules && s.fidelity.rules.length) slot('fid', 'Was stammt vom Trader, was von Vision Universe?', X.fidelityList(s, D));
    if (after.querySelector('[data-slot="gaps"]')) {
      var g = document.createElement('div');
      if (s.fidelity && s.fidelity.missing && s.fidelity.missing.length) g.appendChild(frag('<p><b>Fehlt im Code</b></p><ul class="st-r-ul">' + s.fidelity.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>'));
      if (c && c.edge_cases && c.edge_cases.length) g.appendChild(X.ruleCardList({ sections: c.edge_cases }));
      slot('gaps', 'Lücken, fehlende Daten, Konflikte', g);
    }
    [].forEach.call(after.querySelectorAll('[data-slot]'), function (n) { n.remove(); });
    if (c) addSheet('st-rulecard', 'Regelkarte', '<p class="vu-sm vu-mu">' + U.pro() + ' Version ' + esc(c.rule_version) + ' · ' + c.sections.length + ' Abschnitte · eingefroren</p>' +
      c.sections.map(function (x) { return '<div class="st-r-rc"><div><b>' + esc(x.title) + '</b><span>' + esc(x.text) + '</span></div>' + provVerdict(x.provenance) + '</div>'; }).join(''));
  }
  function srcCard(x) {
    var TYPE = { BOOK_BIBLIOGRAPHIC: 'Buch', BOOK_TRANSLATION: 'Buch (Übersetzung)', OWN_WEBSITE: 'Website des Traders', OWN_ARTICLE: 'eigener Beitrag', OWN_SOCIAL: 'eigener Beitrag', ORIGINAL_INTERVIEW: 'Interview', SECONDARY: 'Sekundärquelle', SECONDARY_SUMMARY: 'Sekundärquelle', PRESS: 'Presse', PRESS_CONTEMPORARY: 'Presse (zeitgenössisch)', ACADEMIC: 'Fachartikel', INSTITUTIONAL: 'Institution', LEGAL_RECORD: 'Rechtsdokument', PUBLISHER_PAGE: 'Verlagsseite', VU_INTERNAL: 'Vision Universe' };
    var ACCESS = { BIBLIOGRAPHIC_ONLY: 'Nur Titelangaben', NOT_RETRIEVED: 'Nicht abgerufen', PUBLIC_PREVIEW: 'Nur Vorschau', READ_IN_RESEARCH_PR: 'In der Forschung gelesen', PUBLIC_FULL: 'Öffentlich' };
    var read = x.content_retrieved_by_vu ? 'Im Volltext gelesen' : (ACCESS[x.access] || '–');
    var t = esc(x.title || '–');
    return '<div class="st-r-src">' + U.glyph('book', 20) + '<div><b>' + (x.url ? '<a href="' + esc(x.url) + '" rel="noopener" target="_blank">' + t + '</a>' : t) + '</b><span>' + esc([TYPE[x.source_type] || x.source_type, x.publisher_or_site || x.author].filter(Boolean).join(' · ')) + '</span></div><small>' + esc(read) + '</small></div>';
  }

  /* ============================================================ SX04 Treffer (Screen t-treffer; vorher „Signale“) */
  var STEPS = [['depot', 'Im Musterdepot', 2], ['plan', 'Plan fertig', 0], ['ab', 'Abgegeben', 3]];
  var OLD_PHASE = { held: 'depot', pos: 'depot', conf: 'depot', prep: 'plan', exit: 'ab', closed: 'ab' };
  function stepOf(x) { return x.state === 'ACTIVE' || x.state === 'WARNING' || x.state === 'TRIGGERED' ? 'depot' : x.state === 'ENTRY_READY' ? 'plan' : x.state === 'EXIT' ? 'ab' : null; }
  /* Eine Zeile: Logo, Name, Methode · Schritt, Pille; darunter die Zonenleiste mit Legende */
  function trefferRow(x, mName, step) {
    var lv = x.levels || {}, close = x.lastPrice, pill = '', bar = '';
    if (x.entry && isNum(x.entry.price)) {
      pill = U.chg(isNum(close) ? (close / x.entry.price - 1) * 100 : null);
      bar = zoneBar([{ v: stopOf(x), label: 'Ungültig' }, { v: x.entry.price, label: 'Aufnahme', cls: 'z' }, { v: close, label: 'Schluss', cls: 'me' }], { sm: true });
    } else {
      var dist = isNum(lv.trigger) && isNum(close) && close > 0 ? lv.trigger / close - 1 : null;
      pill = U.verdict('mid', isNum(dist) ? 'noch ' + U.num(Math.max(0, dist) * 100, 1) + ' %' : 'Plan fertig');
      bar = zoneBar([{ v: lv.invalidation, label: 'Ungültig' }, { v: close, label: 'Schluss', cls: 'me' }, { v: lv.trigger, label: 'Zone', cls: 'z' }], { sm: true });
    }
    var word = step === 'depot' ? 'im Musterdepot' : step === 'plan' ? 'Plan fertig' : 'abgegeben';
    return '<a class="st-x-trr st-r-sig" href="' + esc(stockHref(x.symbol)) + '"><div class="st-x-trr-h">' + U.logo(x.symbol) + '<div><b>' + esc(nameOf(x)) + '</b><span>' + esc(mName + ' · ' + word) + '</span></div><span class="vu-visually-hidden">' + U.verdict('none', stateName(x.state)) + '</span>' + pill + '</div><div class="st-r-trk">' + bar + '</div></a>';
  }
  function signals(D, X) {
    var reg = D.registry, sig = D.signals, S = X.stratMap(reg), main = page(X.main, X);
    var params = new URLSearchParams(location.search);
    var f = { step: params.get('schritt') || OLD_PHASE[params.get('phase')] || 'depot', method: params.get('method') || '' };
    if (!STEPS.some(function (s) { return s[0] === f.step; })) f.step = 'depot';
    var methods = reg.strategies.filter(function (s) { return s.mode === 'LIVE'; });
    var partial = ['CANSLIM', 'PIOTROSKI_F'].filter(function (id) { return sig.partialChecks && sig.partialChecks[id]; });
    var rows = [];
    Object.keys(sig.strategies).forEach(function (id) { sig.strategies[id].open.forEach(function (x) { var st = stepOf(x); if (!st) return; if (st === 'plan' && x.quality && x.quality.tier === 'B' && f.method !== id) return; rows.push({ s: x, id: id, step: st }); }); });
    append(main, '<div class="vu-ltag st-x-kick st-r-asof">Treffer · Schluss ' + dShort(sig.asOf) + '</div><h1 class="st-x-lt">Wo steht welche<br>Aktie im Ablauf?</h1><div class="st-x-gap">' + forschTag() + '</div>' +
      '<div class="st-x-chips st-x-wrap st-r-chips" role="group" aria-label="Schritt und Methode"></div>' +
      '<div class="st-x-card st-x-flowbox"></div>' +
      '<h2 class="st-x-st"><b data-count></b><span>Sortiert: <span data-sort></span></span></h2><p class="vu-xs vu-mu st-x-legend"><span class="st-x-dot"></span> Ungültig-Marke · <span class="st-x-dot st-x-dot--z"></span> Aufnahme · <span class="st-x-dot st-x-dot--me"></span> Schluss</p>' +
      '<div data-list></div><button type="button" class="vu-btn vu-btn--line vu-btn--block st-r-more st-x-gap12">Weitere 25 laden</button>' +
      '<div class="st-r-gap">' + U.help('Ungültig-Marke laut Methode: fällt der Schluss darunter, gibt das Musterdepot die Aktie ab. Rechenmodell, keine Order.') + '</div>');
    var chips = main.querySelector('.st-x-chips'), flow = main.querySelector('.st-x-flowbox'), list = main.querySelector('[data-list]'), more = main.querySelector('.st-r-more'), count = main.querySelector('[data-count]'), sortL = main.querySelector('[data-sort]'), legend = main.querySelector('.st-x-legend');
    var limit = 25;
    function base(ignoreMethod) { return rows.filter(function (r) { return ignoreMethod || !f.method || r.id === f.method; }); }
    function drawChips() {
      var b = base(true), bm = base(false);
      chips.innerHTML = STEPS.map(function (s) { var n = bm.filter(function (r) { return r.step === s[0]; }).length; return '<button type="button" class="vu-chip" data-k="step" data-v="' + s[0] + '" aria-pressed="' + (f.step === s[0]) + '">' + esc(s[1]) + ' <span class="vu-num st-x-cn">' + n0(n) + '</span></button>'; }).join('') +
        [{ strategy_id: '', world_name: 'Alle Methoden' }].concat(methods).map(function (m) { return '<button type="button" class="vu-chip" data-k="method" data-v="' + esc(m.strategy_id) + '" aria-pressed="' + (f.method === m.strategy_id) + '">' + esc(m.strategy_id && N && N.methodOfDepot(m.strategy_id) ? N.method(N.methodOfDepot(m.strategy_id)).trader : wn(m)) + '</button>'; }).join('');
      void b;
    }
    function draw() {
      if (partial.indexOf(f.method) >= 0) {
        var pc = sig.partialChecks[f.method];
        count.textContent = pc.candidates.length + ' Teiltreffer · ' + nm(S, f.method); sortL.textContent = 'Kriterien'; legend.hidden = true; flow.hidden = true;
        list.innerHTML = pc.candidates.length ? pc.candidates.map(function (r) { return '<a class="st-r-row" data-partial href="' + esc(stockHref(r.symbol)) + '">' + tk(r.symbol) + '<div class="st-r-sname"><b>' + esc(r.name || r.companyName || r.symbol) + '</b><span>Teilprüfung · ' + esc(String(r.met != null ? r.met + ' Kriterien erfüllt' : '')) + '</span></div>' + U.verdict('none', 'Teiltreffer') + '</a>'; }).join('') : U.blank('Heute erfüllt keine Aktie die prüfbaren Kriterien dieser Methode.');
        more.hidden = true; return;
      }
      legend.hidden = false; flow.hidden = false;
      var cur = STEPS.filter(function (s) { return s[0] === f.step; })[0];
      flow.innerHTML = F ? F.dep(cur[2]) : '';
      var shown = base(false).filter(function (r) { return r.step === f.step; });
      if (f.step === 'plan') { shown.sort(function (a, b) { return X.dist(a.s) - X.dist(b.s); }); sortL.textContent = 'Abstand zur Zone'; }
      else { shown.sort(function (a, b) { return String((b.s.entry && b.s.entry.date) || '').localeCompare(String((a.s.entry && a.s.entry.date) || '')) || a.s.symbol.localeCompare(b.s.symbol); }); sortL.textContent = 'seit Aufnahme'; }
      count.textContent = n0(shown.length) + ' ' + (f.step === 'depot' ? 'im Musterdepot' : f.step === 'plan' ? 'mit Plan fertig' : 'abgegeben');
      list.innerHTML = shown.length ? shown.slice(0, limit).map(function (r) { return trefferRow(r.s, nm(S, r.id), r.step); }).join('') : U.blank('Für diesen Schritt gibt es heute keinen Eintrag.');
      more.hidden = shown.length <= limit;
    }
    function update() {
      limit = 25; drawChips(); draw();
      var q = new URLSearchParams(); if (f.step !== 'depot') q.set('schritt', f.step); if (f.method) q.set('method', f.method);
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    }
    chips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.getAttribute('data-k') === 'step') f.step = b.getAttribute('data-v'); else f.method = b.getAttribute('data-v'); update(); });
    more.addEventListener('click', function () { limit += 25; draw(); });
    update();
    foot(main, X, sig);
  }

  /* ============================================================ SX07 Forschung (Screen t-research; vorher „Backtests“) */
  var GATE_PLAIN = { HISTORY: 'Kurse über viele Jahre', SURVIVORSHIP: 'Auch Pleite-Firmen enthalten', UNIVERSE_PIT: 'Damalige Aktienauswahl', VOLUME_HISTORY: 'Volumen über viele Jahre', CORPORATE_ACTIONS: 'Splits und Dividenden', EXECUTION_MODEL: 'Ehrliche Kauf- und Verkaufskurse', OUT_OF_SAMPLE: 'Test auf neuen Daten', BASELINES: 'Vergleich mit dem Markt', USAGE_RIGHTS: 'Recht zur Veröffentlichung', INTRADAY_HISTORY: 'Kurse im Tagesverlauf', PIT_FUNDAMENTALS: 'Firmenzahlen zum damaligen Stand', REQUIRED_FIELDS: 'Alle nötigen Daten vorhanden' };
  var STATUS = { DATA_COVERAGE_INSUFFICIENT: ['In Prüfung', 'none'], ADVANCED_RESEARCH: ['In Prüfung', 'none'], NOT_COMPARABLE: ['In Prüfung', 'none'], DATA_COVERAGE_PENDING: ['Daten fehlen', 'weak'], BACKTEST_PENDING: ['Daten fehlen', 'weak'], BACKTEST_READY: ['Bereit zum Test', 'mid'] };
  function gate(g) {
    return '<div class="st-x-cnd st-r-gate"><span class="st-x-cnd-i' + (g.pass ? ' ok' : '') + '">' + U.glyph(g.pass ? 'check' : 'x', 12) + '</span><span><b>' + esc(GATE_PLAIN[g.id] || g.label) + '</b><small>' + esc(g.measured || g.label || '') + '</small></span></div>';
  }
  function backtests(D, X) {
    var bt = D.backtests, pl = D.pilot, reg = D.registry, S = X.stratMap(reg), main = page(X.main, X);
    var runs = (bt.runs || []).filter(function (r) { return r.active; });
    var proven = runs.filter(function (r) { return r.metricsPublishable; }).length;
    var cnt = function (lab) { return runs.filter(function (r) { return (STATUS[r.status] || ['In Prüfung'])[0] === lab; }).length; };
    append(main, forschTag() + '<h1 class="st-x-lt" style="margin-top:8px">Wie belastbar ist<br>welche Methode?</h1><p class="st-x-lead">Ein Test spielt eine Regel mit alten Kursen durch. Nur ein sauberer Test ist etwas wert.</p>' +
      '<div class="st-x-today" style="margin-top:14px"><b class="st-x-big vu-num">' + proven + ' von ' + runs.length + '</b><p style="margin:6px 0 0;font-weight:700">Regelversionen mit belegtem Vorteil</p><div class="st-x-tg" style="margin-top:10px">' +
      [[cnt('In Prüfung'), 'in Prüfung'], [cnt('Daten fehlen'), 'Daten fehlen'], [0, 'ohne Vorteil']].map(function (t) { return '<div><b class="vu-num" style="font-size:22px">' + n0(t[0]) + '</b><span>' + esc(t[1]) + '</span></div>'; }).join('') + '</div></div>');
    var ref = runs.filter(function (r) { return r.gates && r.gates.length; })[0];
    if (ref) append(main, '<h2 class="st-x-st">Was für einen fairen Test fehlt<span>' + ref.gates.filter(function (g) { return g.pass; }).length + ' von ' + ref.gates.length + ' erfüllt</span></h2><div class="st-x-card st-r-gates" style="padding:4px 14px">' + ref.gates.map(gate).join('') + '</div><p class="vu-xs vu-mu st-r-gap8">Beispiel: ' + esc(nm(S, ref.strategyId)) + '. Jede Version hat ihren eigenen Prüfstand (unten).</p>');
    var EV = function (r) { var s = S[r.strategyId] || {}; return (s.evidence && s.evidence.version) || s.strategy_version || '–'; };
    var rowB = function (r, i) { var st = STATUS[r.status] || ['In Prüfung', 'none']; return '<button type="button" class="st-x-kv st-btrow" data-sheet="st-bt-' + i + '" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;font:inherit;text-align:left;cursor:pointer"><span><b class="vu-sm" style="display:block">' + esc(nm(S, r.strategyId)) + '</b><span class="vu-xs vu-mu">Version ' + esc(EV(r)) + '</span></span><span class="st-x-kv-r">' + U.verdict(st[1], st[0]) + '</span></button>'; };
    append(main, '<h2 class="st-x-st">Stand je Methode</h2><div class="st-x-card st-x-card--rows">' + runs.slice(0, 3).map(rowB).join('') +
      (runs.length > 3 ? '<details class="st-x-more"><summary class="st-x-kv"><span class="vu-mu">+ ' + (runs.length - 3) + ' weitere</span>' + U.glyph('next', 14) + '</summary>' + runs.slice(3).map(function (r, i) { return rowB(r, i + 3); }).join('') + '</details>' : '') + '</div>');
    runs.forEach(function (r, i) {
      var st = STATUS[r.status] || ['In Prüfung', 'none'];
      addSheet('st-bt-' + i, nm(S, r.strategyId) + ' · Version ' + EV(r), '<div class="st-r-mv">' + U.verdict(st[1], st[0]) + ' ' + (r.metricsPublishable ? '' : U.verdict('weak', 'Daten reichen nicht')) + '</div>' +
        '<p class="vu-sm vu-mu">Was der Test zeigte: Eine Kennzahl erscheint erst, wenn alle Pflichtprüfungen bestanden sind.' + (S[r.strategyId] && S[r.strategyId].evidence && S[r.strategyId].evidence.note ? ' ' + esc(X.noRun(S[r.strategyId].evidence.note)) : '') + '</p>' +
        ((r.gates || []).length ? r.gates.map(gate).join('') : U.blank(r.status === 'NOT_COMPARABLE' ? 'Für dieses Musterdepot ist noch kein Prüfstand festgelegt; ein Vergleich wäre nicht fair.' : 'Für diese Version ist noch kein Prüfstand angelegt.')) +
        '<p class="vu-xs vu-mu">Variante: ' + esc(r.label || r.variantId) + '</p>');
    });
    /* Älterer Pilot als eigener Eintrag (Entscheidung 6): Inhalt und Zahlen unverändert */
    if (pl && pl.curves && pl.curves.strategy) {
      append(main, '<button type="button" class="st-x-card st-x-link" data-sheet="st-pilot"><span><b>Älterer Pilot: ' + esc((pl.method && pl.method.label) || 'Turtle auf Wochenschlüssen') + '</b><span>explorativ, nicht belastbar</span></span>' + U.glyph('next', 16) + '</button>');
      var sm = pl.strategy.metrics.full, cmp = pl.comparison, sm2 = pl.strategy.metrics, tr = pl.strategy.trades;
      var sh = addSheet('st-pilot', 'Älterer Pilot · explorativ', '<div class="st-r-gap8">' + U.research() + '</div>' +
        '<div class="vu-box st-r-chartbox"><div data-chart></div><div class="st-r-leg2"><span><i class="ln"></i>Regel</span><span><i class="dash"></i>S&amp;P 500</span><span class="vu-mu">Start = 1</span></div></div>' +
        '<div class="vu-grid st-r-g3 st-r-gap">' + U.tile('Regel', pctF(sm.totalReturn, 1), pl.period.from.slice(0, 4) + '–' + pl.period.to.slice(0, 4)) + U.tile('S&P 500', pctF(cmp.spy.full.totalReturn, 1), 'Kursindex') + U.tile('Alle Aktien', pctF(cmp.equalWeightUniverse.full.totalReturn, 1), 'gleich gewichtet') + '</div>' +
        '<div class="vu-box vu-box--line st-r-honest st-r-gap">' + U.verdict('none', 'Nicht belastbar') + '<span class="vu-sm">Die Regel hätte ' + (sm.totalReturn < 0 ? 'Geld verloren' : 'weniger als der Markt gebracht') + '. Das ist <b>kein Beleg dagegen</b> und keiner dafür: Pleite-Firmen fehlen in den Daten.</span></div>' +
        '<div class="st-r-gap">' + U.help('Größter Einbruch ' + pctF(sm.maxDrawdown, 1) + ': So tief fiel das Musterdepot vom Höchststand. Zum Vergleich S&P 500: ' + pctF(cmp.spy.full.maxDrawdown, 1) + '.') + '</div>' +
        '<div data-legal></div>' +
        '<div class="st-r-accs">' + acc('Alle Kennzahlen des Piloten', '<div class="st-r-gap8">' + U.research() + '</div><div class="st-r-kv">' + [['Regel p. a.', pctF(sm2.full.cagr, 1)], ['Gleich gewichtet p. a.', pctF(cmp.equalWeightUniverse.full.cagr, 1)], ['S&P 500 p. a.', pctF(cmp.spy.full.cagr, 1)], ['Schwankung p. a.', pp(sm2.full.volatility, 0)], ['Größter Einbruch', pctF(sm2.full.maxDrawdown, 1)], ['Trades', tr ? n0(tr.trades) : '–'], ['Trefferquote', tr ? pp(tr.hitRate, 0) : '–'], [pl.period.from.slice(0, 4) + '–2015 p. a.', sm2.inSample ? pctF(sm2.inSample.cagr, 1) : '–'], ['2016–heute p. a.', sm2.outOfSample ? pctF(sm2.outOfSample.cagr, 1) : '–']].map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b class="vu-num">' + esc(r[1]) + '</b></div>'; }).join('') + '</div>' +
          '<p class="vu-xs vu-mu">Explorativ: getestet nur auf heute noch gelisteten Aktien, Wochenbasis, 0,25 % Kosten je Seite.</p>', U.pro()) + '</div>');
      /* Strang F, Befund 15: Hinweis „backtest“ mit Pflichtangaben (assets/legal-notices.json), erst nach der rechtlichen Freigabe. */
      if (U.legal) {
        var sp = pl.spec || {}, surv = (pl.biases || []).some(function (b) { return b.id === 'SURVIVORSHIP'; });
        var lg = U.legal('backtest', { facts: {
          'Zeitraum': dDe(pl.period.from) + ' bis ' + dDe(pl.period.to),
          'Kosten je Trade': Number.isFinite(sp.costPerSide) ? pp(sp.costPerSide, 2) + ' je Seite' : '–',
          'Vergleichsmaßstab (z. B. S&P 500 Gesamtrendite)': 'S&P 500 und alle Aktien gleich gewichtet, jeweils Kursrendite ohne Dividenden',
          'Enthält delistete Titel: ja/nein': surv ? 'nein (nur heute gelistete Titel)' : 'ja',
          'Anzahl getesteter Varianten': '1 Regelvariante (' + (sp.entryLookback || '–') + '/' + (sp.exitLookback || '–') + ' Wochen), Rechnung Version ' + (sp.version || '–') + ((pl.history || []).length ? '; ' + pl.history.length + ' frühere Fassung wegen Messfehlern ersetzt' : ''),
          'größter Verlust (max. Drawdown)': pctF(sm.maxDrawdown, 1) } });
        if (lg) sh.querySelector('[data-legal]').innerHTML = '<div class="st-r-gap">' + lg + '</div>';
      }
      var drawn = false;
      main.addEventListener('click', function (e) { if (drawn || !(e.target.closest && e.target.closest('[data-sheet="st-pilot"]'))) return; drawn = true; setTimeout(function () { drawChart(sh.querySelector('[data-chart]'), pl.curves.strategy, { lines: [{ points: pl.curves.spy }], extent: pl.curves.spy.map(function (p) { return p[1]; }), label: 'Pilot', height: 170, log: true }); }, 60); });
    }
    append(main, '<div class="st-r-accs st-x-gap12">' +
      acc('Fünf Grundsätze jedes Tests', '<ol class="st-r-ol"><li><b>Vorab festgelegt:</b> Universum, Zeitraum, Regeln, Kosten, Vergleich und Erfolgskriterien werden vor dem Test eingefroren.</li><li><b>Damaliges Universum:</b> alle an jedem Tag gelisteten US-Aktien, einschließlich später delisteter Titel.</li><li><b>Delistings ohne Schönrechnen:</b> drei vorab festgelegte Annahmen für den letzten Kurs.</li><li><b>Gleiche Regeln wie täglich:</b> derselbe Rechenkern erzeugt die tägliche Erkennung und die historischen Durchgänge.</li><li><b>Keine Nachoptimierung:</b> eine neue Variante ist eine neue Hypothese und braucht eine spätere, unabhängige Prüfung.</li></ol>') +
      ((bt.nextSteps || []).length ? acc('Nächste Schritte', '<ol class="st-r-ol">' + bt.nextSteps.map(function (x) { return '<li><b>' + esc(x[0]) + '</b><br>' + esc(x[1]) + '</li>'; }).join('') + '</ol>') : '') + '</div>' + note('Keine Anlageberatung.'));
    foot(main, X, D.signals);
  }

  /* ============================================================ ST06 Quellen */
  function sources(D, X) {
    var list = (D.sources && D.sources.sources) || [], reg = D.registry, main = page(X.main, X);
    append(main, intro('Woher die Regeln stammen', 'Jede Regel geht auf eine Quelle zurück: Buch, Interview, eigene Website des Traders.') +
      '<div class="vu-grid st-r-g3 st-r-gap16">' + U.tile('Quellen', n0(list.length), 'gesamt') + U.tile('Mit Adresse', n0(list.filter(function (x) { return x.url; }).length), 'verlinkt') + U.tile('Gelesen', n0(list.filter(function (x) { return x.content_retrieved_by_vu; }).length), 'im Volltext') + '</div>' +
      '<div class="st-r-gap">' + U.help('Bücher sind urheberrechtlich geschützt. Wir zitieren nur Titel und Seiten und übernehmen keine Texte oder Grafiken.') + '</div>' +
      U.sect('Je Methode') + '<div class="st-r-accs st-det-list">' + reg.strategies.filter(function (s) { return (s.sources || []).length; }).map(function (s) {
        var srcs = s.sources.map(function (id) { return D.srcMap[id] || { title: id }; });
        return acc(wn(s), srcs.map(srcCard).join(''), '<span class="vu-num st-r-cnt">' + srcs.length + '</span>');
      }).join('') + '</div>' + note('Titelangaben, Verlag und Lese-Stand je Quelle. Keine Anlageberatung.'));
    foot(main, X, D.signals);
  }

  /* ============================================================ SX06 VU Hausstrategie (Screen t-haus) */
  function house(D, X) {
    var L = D.house, main = page(X.main, X);
    var cur = (L && L.current) || {}, hs = cur.holdings || [], last = L && L.decisions && L.decisions.length ? L.decisions[L.decisions.length - 1] : null;
    var w = hs.length ? U.num(hs[0].weight * 100, 0) + ' %' : '–';
    append(main, '<div class="vu-ltag st-x-kick">VU Hausstrategie · eigene Regeln</div><h1 class="st-x-lt">' + (hs.length ? hs.length + ' Aktien,<br>je ' + esc(w) : 'VU Hausstrategie') + '</h1>' +
      '<p class="st-x-lead">Große US-Firmen im Aufwärtstrend, mit Kaufdruck im Volumen und starken Quartalszahlen. Die Regeln sind eingefroren.</p><div class="st-x-gap">' + forschTag() + '</div>' +
      '<div class="st-x-today st-r-belast" style="margin-top:12px"><div class="st-x-tg" style="grid-template-columns:1fr 1fr"><div><b class="vu-num" style="font-size:24px">' + dShort(cur.date) + '</b><span>zuletzt entschieden</span></div><div><b class="vu-num" style="font-size:24px">' + dShort(L && L.nextDecision) + '</b><span>nächste Entscheidung</span></div></div>' +
      '<p class="vu-xs" style="color:#bdbdbd;margin:10px 0 0">Seit ' + dDe(L && L.liveSince) + ' im Vorwärtslauf: jede Entscheidung wird vorher festgeschrieben. Ein Vorteil ist historisch nicht belegt.</p></div>');
    if (!last) append(main, U.blank('Der Start steht bevor. Die erste Entscheidung wird gerade festgeschrieben.'));
    else {
      var isNew = function (t) { return last.kind !== 'START' && (last.buys || []).indexOf(t) >= 0; };
      append(main, '<h2 class="st-x-st">Im Musterdepot' + (last.kind !== 'START' ? '<span>neu am ' + dShort(last.date) + ' markiert</span>' : '') + '</h2><div class="st-x-hsg">' + hs.map(function (x) { return '<a class="' + (isNew(x.ticker) ? 'is-new' : '') + '" href="' + esc(stockHref(x.ticker)) + '">' + U.logo(x.ticker) + '<span>' + esc(x.ticker) + '</span></a>'; }).join('') + '</div>' +
        '<div class="st-r-gap">' + U.help('Veröffentlicht werden Titel und Gewichte, keine Renditen. Umsetzung zur Eröffnung am ' + (last.executeOn ? dDe(last.executeOn) : 'nächsten Handelstag') + '.') + '</div>' +
        '<h2 class="st-x-st">Protokoll</h2>' + L.decisions.slice().reverse().map(function (d) {
          var start = d.kind === 'START' || !(d.sells || []).length && L.decisions.indexOf(d) === 0;
          return '<div class="st-x-card st-r-dec" style="margin-top:8px;padding:12px 14px"><b class="vu-sm">' + dDe(d.date) + ' · ' + (start ? 'Start' : 'Monatsende') + '</b><p class="vu-sm" style="margin:4px 0 0"><b>Rein:</b> ' + esc((d.buys || []).join(', ') || '–') + '</p>' + (start ? '' : '<p class="vu-sm" style="margin:2px 0 0"><b>Raus:</b> ' + esc((d.sells || []).join(', ') || '–') + '</p>') + '<span class="vu-xs vu-mu">festgeschrieben ' + dDe(d.decidedAt) + '</span></div>';
        }).join(''));
    }
    var rules = (L && L.rules) || [], hist = X.HOUSE_HISTORY || [], keys = ['H1', 'H2', 'H4', 'G', '→'];
    var RULE_T = ['Universum', 'Filter', 'Rang', 'Musterdepot', 'Termin'];
    append(main, '<h2 class="st-x-st">Die ' + rules.length + ' Regeln</h2><div class="st-x-card st-x-card--rows">' + rules.map(function (r, i) { var p = String(r).split(': '); return '<div class="st-x-rule"><span class="st-x-stepn">' + (i + 1) + '</span><span><b>' + esc(p.length > 1 ? (p[0] === 'Depot' ? 'Musterdepot' : p[0]) : (RULE_T[i] || 'Regel ' + (i + 1))) + '</b><span>' + esc(p.length > 1 ? p.slice(1).join(': ') : r) + '</span></span></div>'; }).join('') + '</div>' +
      '<button type="button" class="st-x-card st-x-link" data-sheet="st-house-hist"><b>Wie wir hierhin gekommen sind</b>' + U.glyph('next', 16) + '</button>' +
      '<p class="st-x-foot">Rechenmodell, kein echtes Geld. Keine Anlageberatung.</p>');
    addSheet('st-house-hist', 'Wie wir hierhin gekommen sind', '<p class="vu-sm vu-mu">Ehrliche Prüfgeschichte der Hausstrategie.</p>' + hist.map(function (x, i) { return step(keys[i] || String(i + 1), x[0].replace(/\s*\([^)]*\)$/, ''), x[1]); }).join(''));
    foot(main, X, D.signals);
  }
  function step(n, t, s) { return '<div class="st-r-stp"><span class="st-r-num">' + esc(n) + '</span><div><b>' + esc(t) + '</b>' + (s ? '<span>' + esc(s) + '</span>' : '') + '</div></div>'; }

  /* ============================================================ ST08 Aktie, Perspektive „Methoden“ */
  var JOIN = { TRIGGERED: 'ACTIVE', EXIT: 'CLOSED' };
  function stock(D, X) {
    var sig = D.signals, reg = D.registry, S = X.stratMap(reg), sym = X.SYM, main = page(X.main, X);
    var headHost = document.createElement('div'); headHost.className = 'st-r-head st-r-pending-head'; main.appendChild(headHost);
    var entries = [];
    Object.keys(sig.strategies || {}).forEach(function (id) { allOf(sig.strategies[id]).forEach(function (x) { if (x.symbol === sym) entries.push({ s: x, id: id }); }); });
    var open = entries.filter(function (e) { return (sig.strategies[e.id].open || []).indexOf(e.s) >= 0; });
    var name = ''; entries.forEach(function (e) { if (!name && e.s.companyName && e.s.companyName !== sym) name = e.s.companyName; });
    headHost.innerHTML = '<header class="vu-shead"><h1 class="vu-shead-name">' + esc(name || sym || '–') + '</h1><p class="vu-shead-meta">' + esc(sym) + '</p></header>';
    if (!sym) { append(main, '<div class="st-emptybox">' + U.blank('Keine Aktie gewählt.') + '</div>'); foot(main, X, sig); return; }
    var kit = X.stockKit();
    var headApi = kit.then(function () { var ctx = window.VUCore.StockContext.fromUs(sym); return window.VUStockNavigator.head(headHost, { ctx: ctx, current: 'supertrader', name: name || sym, pendingPrice: true, back: { href: '/supertrader/treffer/', label: 'Treffer' } }); }).catch(function () { return null; });
    /* Kurse nur für Aktien, die eine Methode führt oder erkennt (keine vergebliche Anfrage für unbekannte Kürzel) */
    var serP = null, ser = function () { return serP || (serP = kit.catch(function () {}).then(function () { return identity(X); }).then(function () { return series(sym); })); };
    var priced = function () { setPrice(); };
    if (entries.length) priced();
    function setPrice() {
    /* C04: veröffentlichter Schluss (ADR-002) */
    Promise.all([ser(), X.loadScript('/quant/engines/published-close.js').catch(function () {}), headApi]).then(function (r) {
      var PC = window.VUPublishedClose, s = r[0], hd = r[2]; if (!hd) return; if (!PC) { hd.setPrice(null); headHost.classList.remove('st-r-pending-head'); return; }
      var lp = PC.lastPoint(s, new Date().toISOString().slice(0, 10)); if (!lp) { hd.setPrice(null); headHost.classList.remove('st-r-pending-head'); return; }
      var pts = s.points, prev = pts.length > 1 ? pts[pts.length - 2][1] : null;
      headHost.classList.remove('st-r-pending-head');
      hd.setPrice({ value: lp.close, currency: lp.currency, changePct: isNum(prev) && prev > 0 ? (lp.close / prev - 1) * 100 : null, changeLabel: 'zum Vortag', kind: 'close', at: dShort(lp.date) });
    }).catch(function () { headApi.then(function (h) { if (h) h.setPrice(null); headHost.classList.remove('st-r-pending-head'); }); });
    }

    /* SX05 (Screen t-stock): Supertrader in drei Sätzen · Alle 13 Methoden · Protokoll */
    var answer = document.createElement('div'); answer.className = 'st-r-answer-slot st-r-pending-answer'; answer.setAttribute('aria-busy', 'true');
    var sfP = identity(X).then(function () { return X.getJSON('sf-candidates/summary.json'); }).then(function (sum) {
      var shard = window.VUCore.Identity.shardKey(sym);
      return ((sum.tickerShards || []).indexOf(shard) >= 0 ? X.getJSON('sf-candidates/ticker/' + shard + '.json') : Promise.resolve({ views: [] })).then(function (t) { return { sum: sum, views: (t.views || []).filter(function (v) { return v.ticker === sym; }) }; });
    });
    var label = name || sym;
    /* Offene Position im Musterdepot zuerst (Owner-Wunsch 07.11.2026: Leiste ohne Scrollen sichtbar) */
    var held = open.filter(function (e) { return e.s.entry; }), waiting = open.filter(function (e) { return !e.s.entry; });
    if (held.length) append(main, U.sect('Im Musterdepot') + held.map(function (e) { return sigCard(e.s, nm(S, e.id)); }).join(''));
    if (waiting.length) append(main, U.sect('Wartet im Musterdepot') + waiting.map(function (e) { return sigCard(e.s, nm(S, e.id)); }).join(''));
    main.appendChild(answer);
    answer.innerHTML = '<span class="vu-visually-hidden">Die 13 Methoden werden geprüft …</span>' + U.skeleton('card');
    var rest = document.createElement('div'); main.appendChild(rest);
    var allHost = document.createElement('div'); rest.appendChild(allHost);

    /* Letzter abgeschlossener Durchgang (für „Zuletzt“) */
    var cyc = null, cycIds = [];
    entries.forEach(function (e) { var c = cycle(e.s); if (c && c.out && (!cyc || c.inn.date > cyc.inn.date)) cyc = { inn: c.inn, out: c.out }; });
    if (cyc) entries.forEach(function (e) { var c = cycle(e.s); if (c && c.out && c.inn.date === cyc.inn.date) { cycIds.push(nm(S, e.id)); if (c.out.date > cyc.out.date) cyc.out = c.out; } });
    /* Protokoll als Zeitleiste */
    var ev = {};
    entries.forEach(function (e) {
      var tr = e.s.transitions || [], entered = false;
      tr.forEach(function (t, i) {
        if (t.state === 'INVALIDATED' && t.ruleId === 'LC-VERSION-RETIRED') return;
        /* ACTIVE nach einem Warnzeichen ist keine neue Aufnahme, sondern die Rückkehr in den Normalzustand */
        var st = JOIN[t.state] || t.state;
        if (t.state === 'ACTIVE') { if (entered) st = 'ACTIVE_AGAIN'; entered = true; }
        var k = t.date + '|' + st, m = nm(S, e.id);
        var x = ev[k] || (ev[k] = { date: t.date, st: st, methods: [], price: null, res: [] });
        if (x.methods.indexOf(m) < 0) x.methods.push(m);
        if (isNum(t.price)) x.price = t.price;
        if (t.state === 'CLOSED' && i === tr.length - 1) { var r = tradeRes(e.s); if (isNum(r)) { x.res.push(r); x.inn = e.s.entry.price; } }
      });
    });
    var evs = Object.keys(ev).map(function (k) { return ev[k]; }).sort(function (a, b) { return b.date.localeCompare(a.date) || lifeIx(b.st) - lifeIx(a.st); });
    var EVW = { SETUP: 'Wartet', ENTRY_READY: 'Plan fertig', ACTIVE: 'Musterdepot nimmt auf', ACTIVE_AGAIN: 'Warnzeichen vorbei', WARNING: 'Warnzeichen laut Methode', CLOSED: 'Musterdepot gibt ab', INVALIDATED: 'Muster zerfallen' };
    if (evs.length) {
      var tl = function (list) { return '<ol class="st-x-tl st-r-tl">' + list.map(function (x) {
        var lab = EVW[x.st] || stateName(x.st), meth = x.methods.join(' und ');
        return '<li data-st="' + esc(x.st === 'ACTIVE_AGAIN' ? 'ACTIVE' : x.st) + '"><i></i><div><b>' + dShort(x.date) + ' · ' + esc(lab) + '</b><span>' + esc(meth + (isNum(x.price) ? ' · ' + usd(x.price) : '') + (x.res.length === 1 ? ' · Aufnahme ' + usd(x.inn) : '')) + '</span></div>' + x.res.map(function (r) { return '<span class="st-r-res">' + U.chg(r * 100) + '</span>'; }).join('') + '</li>'; }).join('') + '</ol>'; };
      append(rest, '<h2 class="st-x-st">Protokoll' + (evs.length > 5 ? '<span>Ältere (' + (evs.length - 5) + ')</span>' : '') + '</h2>' + tl(evs.slice(0, 5)) + (evs.length > 5 ? '<div class="st-r-accs">' + acc('Ältere (' + (evs.length - 5) + ')', tl(evs.slice(5))) + '</div>' : '') +
        '<div class="st-r-gap">' + U.help('Das Musterdepot ist ein Rechenmodell. Es zeigt, was die Regel getan hätte, nicht was du tun solltest.') + '</div>');
    }
    var t52 = X.trend52For(D, sym);
    if (t52 && !entries.length) priced();
    if (t52) append(rest, '<a class="vu-box st-r-t52 st-research" href="/supertrader/strategies/vu-trendfolge-52w/"><b>VU Trendfolge 52W</b> ' + U.verdict(t52[1] === 'good' ? 'mid' : 'none', t52[0]) + '<span class="vu-sm">' + esc(t52[2]) + '</span></a>');
    var pcs = [];
    ['CANSLIM', 'PIOTROSKI_F'].forEach(function (id) { var pc = sig.partialChecks && sig.partialChecks[id]; if (pc) (pc.candidates.concat(pc.near || [])).forEach(function (r) { if (r.symbol === sym && pcs.indexOf(nm(S, id)) < 0) pcs.push(nm(S, id)); }); });
    if (pcs.length) append(rest, '<div class="vu-box st-r-gap st-critlist">' + U.verdict('none', 'Teiltreffer') + ' <span class="vu-sm">' + esc(pcs.join(', ')) + ': ein Teil der prüfbaren Kriterien ist erfüllt.</span></div>');
    foot(rest, X, sig);

    var MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    var NUM = ['keinem', 'einem', 'zwei', 'drei', 'vier', 'fünf'];
    sfP.then(function (r) {
      answer.classList.remove('st-r-pending-answer'); answer.setAttribute('aria-busy', 'false');
      var sum = r.sum, vs = r.views, hit = {};
      vs.forEach(function (v) { if (!hit[v.candidateId] || STAGES.indexOf(v.stage) > STAGES.indexOf(hit[v.candidateId])) hit[v.candidateId] = v.stage; });
      var hitIds = Object.keys(hit), nHit = hitIds.length, SM = {}; sum.strategies.forEach(function (s) { SM[s.candidateId] = s; });
      var top = STAGES.filter(function (k) { return vs.some(function (v) { return v.stage === k; }); }).pop();
      var names = hitIds.map(function (c) { return cnId(SM, c); });
      var today = nHit ? nHit + ' von ' + sum.strategies.length + ' Methoden ' + (nHit === 1 ? 'erkennt ' : 'erkennen ') + label + ': ' + (names.length <= 2 ? names.join(' und ') : names.slice(0, 2).join(', ') + ' und ' + (names.length - 2) + ' weitere') + '.' : 'Keine der ' + sum.strategies.length + ' Methoden erkennt ' + label + ' gerade.';
      var depT, depV;
      if (held.length) { depT = (held.length === 1 ? 'Das Musterdepot ' + nm(S, held[0].id) + ' hält ' : held.length + ' Musterdepots halten ') + label + '.'; depV = U.verdict('strong', 'Im Musterdepot'); }
      else if (waiting.length) { depT = label + ' wartet in ' + (NUM[waiting.length] || waiting.length) + ' Musterdepot' + (waiting.length === 1 ? '' : 's') + ' auf die Zone laut Methode.'; depV = U.verdict('mid', F ? F.wordOfState(waiting[0].s.state) : 'Wartet'); }
      else { depT = 'Kein Musterdepot hält ' + label + ' gerade.'; depV = U.verdict('none', 'Nicht dabei'); }
      var lastT, lastV = '';
      if (cyc) {
        var d = Math.round((Date.parse(cyc.out.date) - Date.parse(cyc.inn.date)) / 864e5), mo = MON[+String(cyc.inn.date).slice(5, 7) - 1];
        lastT = 'Im ' + mo + ' ' + d + ' Tage in ' + (NUM[cycIds.length] || cycIds.length) + ' Musterdepot' + (cycIds.length === 1 ? '' : 's') + ', dann abgegeben.';
        var lastRes = null; entries.forEach(function (e) { var c = cycle(e.s); if (c && c.out && c.out.date === cyc.out.date) { var rr = tradeRes(e.s); if (isNum(rr)) lastRes = rr; } });
        lastV = isNum(lastRes) ? U.chg(lastRes * 100) : '';
      } else lastT = 'Noch kein abgeschlossener Durchgang in einem Musterdepot.';
      answer.innerHTML = '<div class="st-x-story st-r-answer"><div class="vu-ltag">Supertrader in drei Sätzen · ' + dShort(sum.asOf) + '</div>' + [
        ['target', 'Heute', today, nHit ? U.verdict('strong', STAGE_TXT[top]) : U.verdict('none', 'Kein Muster')],
        ['grid', 'Musterdepot', depT, depV],
        ['book', 'Zuletzt', lastT, lastV]].map(function (x) { return '<div class="st-x-story-r"><span class="vu-hud">' + U.glyph(x[0], 17) + '</span><div><span class="vu-ltag">' + esc(x[1]) + '</span><p>' + esc(x[2]) + '</p></div>' + x[3] + '</div>'; }).join('') + '</div>';
      if (nHit && !entries.length) priced();
      if (!nHit && !entries.length && !t52) headApi.then(function (h) { if (h) h.setPrice(null); headHost.classList.remove('st-r-pending-head'); });
      var list = sum.strategies.slice().sort(function (a, b) { return (hit[b.candidateId] ? 1 : 0) - (hit[a.candidateId] ? 1 : 0) || STAGES.indexOf(hit[b.candidateId]) - STAGES.indexOf(hit[a.candidateId]) || b.counts.published - a.counts.published; });
      var row = function (s) { var h = hit[s.candidateId]; return '<a class="st-x-kv" href="' + esc(N ? N.href(s.candidateId) : '/supertrader/strategies/?sf=' + s.candidateId) + '"><span>' + esc(cn(s)) + '</span><span class="st-x-kv-r">' + (F ? F.miniStage(h) : '') + '<span class="' + (h ? '' : 'vu-mu') + '">' + esc(h ? STAGE_TXT[h] : 'nein') + '</span></span></a>'; };
      var shown = Math.max(5, nHit);
      allHost.innerHTML = '<h2 class="st-x-st">Alle ' + list.length + ' Methoden<span>' + (nHit ? nHit + ' erkenn' + (nHit === 1 ? 't' : 'en') : 'keine erkennt') + '</span></h2><div class="st-x-card st-x-card--rows">' + list.slice(0, shown).map(row).join('') +
        (list.length > shown ? '<details class="st-x-more"><summary class="st-x-kv"><span class="vu-mu">+ ' + (list.length - shown) + ' weitere</span>' + U.glyph('next', 14) + '</summary>' + list.slice(shown).map(row).join('') + '</details>' : '') + '</div>' +
        note('Erkennung auf Schlusskursen vom ' + dDe(sum.asOf) + '. Keine Anlageberatung.');
    }).catch(function () { answer.classList.remove('st-r-pending-answer'); answer.setAttribute('aria-busy', 'false'); headHost.classList.remove('st-r-pending-head'); answer.innerHTML = U.blank('Die 13 Methoden sind für ' + sym + ' gerade nicht erreichbar.'); });
  }

  window.STRedesign = { version: 'st-redesign-1.0.0', STATE: STATE, render: { home: home, strategies: strategies, strategy: strategy, signals: signals, backtests: backtests, sources: sources, house: house, stock: stock } };
})();
