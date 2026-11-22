/* Vision Universe® — Supertrader, Oberfläche nach „App-Konzept 2“ (Owner-Freigabe 14.11.2026)
   Aufbau der Seiten: Redesign 2027 (Folien ST01–ST08, ST-Z; docs/design/redesign-2027/HANDOVER.md, Kapitel „07 · Supertrader“).
   Darstellung: Kacheln zum Antippen, Schienen bis an den Rand, Grafiken statt Text, Tiefe im Fenster (VUUI.tap, rail, stat,
   stats, ring, next, popup aus assets/vu-ui.js).

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
  if (!U || !U.tap || !U.popup || !U.rail || !U.next) return;   /* ältere vu-ui.js im Cache: supertrader.js zeigt dann die bisherige Oberfläche */
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
  function acc(title, body, right, open) {
    return '<details class="st-r-acc"' + (open ? ' open' : '') + '><summary><b>' + esc(title) + '</b>' + (right || '') + U.glyph('next', 16) + '</summary><div class="st-r-accb">' + (body || '') + '</div></details>';
  }
  function note(text) { return '<p class="st-r-note">' + esc(text) + '</p>'; }
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
    U.bindPops(main);
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
    if (X && X.loadScript) LOADER = X.loadScript;
    var wrap = document.createElement('div');
    wrap.className = 'vu-ui st-r st-k';
    main.appendChild(wrap);
    bindPage(wrap);
    return wrap;
  }
  function append(host, html) { host.appendChild(frag(html)); }
  /* „Folgen“/„Melden“ (st-follow.js, Konto-API): Knopf mit Glocke wie im Prototyp (.btn.ol), Zustand nach dem Laden.
     FRONTEND-SCHALTER ST_ALERTS_UI: eingebaut, AUS bis zur Prüfung durch einen Anwalt (Owner 16.11.2026,
     docs/accounts/FREIGABEN.md „Supertrader Folgen/Melden“). Aus: kein Knopf, kein Hinweis, st-follow.js wird nicht geladen,
     die Fenster „Methode“ und „Ablauf“ sehen aus wie vorher. Einschalten nur zusammen mit dem Worker-Schalter
     VU_SUPERTRADER_ALERTS_ENABLED und der vorbereiteten Migration (supabase/prepared/supertrader_follows.sql);
     Vertragstest scripts/supertrader/tests/st-follow.test.mjs (ST-FOLLOW-SWITCH). */
  var ST_ALERTS_UI = false;
  var LOADER = null;
  function bellHtml(kind, key, name, cls) {
    if (!ST_ALERTS_UI) return '';
    var t = kind === 'method' ? 'Folgen' : 'Melden';
    return '<button type="button" class="stp-btn stp-btn--ol stp-bell' + (cls ? ' ' + cls : '') + '" data-st-follow="' + kind + '" data-key="' + esc(key) + '" data-name="' + esc(name) + '" aria-pressed="false">' +
      U.glyph('bell', 18) + '<span class="stp-bell-t">' + t + '</span></button>';
  }
  function bindBells(el) {
    if (!ST_ALERTS_UI || !el || !el.querySelector('[data-st-follow]')) return;
    var ready = window.VUSTFollow ? Promise.resolve() : LOADER ? LOADER('/supertrader/assets/st-follow.js') : Promise.reject(new Error('st-follow'));
    ready.then(function () { if (window.VUSTFollow) window.VUSTFollow.bind(el); }).catch(function () {
      Array.prototype.forEach.call(el.querySelectorAll('[data-st-follow]'), function (b) { b.disabled = true; });
    });
  }
  function foot(host, X, sig) { var f = X.disclaimer(sig); if (f) host.appendChild(f); }

  /* Erklärung der einen Ablauf-Leiste (Folie K1): beide Fragen mit ihren Wörtern */
  function flowExplain() {
    if (!F) return '';
    var part = function (title, sub, labels, bar) { return '<div class="st-r-flowx"><b>' + esc(title) + '</b><span class="vu-sm vu-mu">' + esc(sub) + '</span>' + bar + labels.map(function (l) { return '<p class="vu-sm"><b>' + esc(l[0]) + ':</b> ' + esc(l[1]) + '</p>'; }).join('') + '</div>'; };
    return part('Erkennen: zeigt die Aktie das Muster?', 'Für alle 13 Methoden, jeden Tag, über alle US-Aktien. Drei Stufen.', F.ERK, F.erk(2)) +
      part('Musterdepot: was würde die Regel tun?', 'Für die fünf Methoden mit Musterdepot. Vier Schritte, ohne echtes Geld.', F.DEP.concat([F.BROKEN]), F.dep(2));
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
    var lv = s.levels || {}, close = s.lastPrice, head = '<div class="st-r-shead">' + U.logo(s.symbol) + '<div class="st-r-sname"><b>' + esc(nameOf(s)) + '</b><span>' + esc(methodName || '') + '</span></div><div class="st-r-sstate">' + (F ? F.miniState(s.state) : '') + stateVerdict(s.state) + '</div></div>';
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
  /* Titel, die das Discover-Universum nicht mehr fuehrt (signals.discoverAvailability.unavailable, Erzeuger
     build.mjs bzw. prune-dead-refs.mjs; z. B. beendete Notierungen nach B3, 21.11.2026): keine Tagesreihe abrufen -
     sie ist entfernt (404) -, sondern einen Hinweis zeigen. Das Signal selbst bleibt (Owner-Regel 04.10.2026, LOGI). */
  var UNAVAILABLE = {};
  function noteAvailability(D) {
    var av = D && D.signals && D.signals.discoverAvailability;
    UNAVAILABLE = {};
    ((av && av.unavailable) || []).forEach(function (s) { UNAVAILABLE[s] = true; });
  }
  var NO_SERIES_TEXT = 'Kein Kursverlauf veröffentlicht: Der Titel ist nicht mehr im Analyseuniversum (Notierung beendet oder ersetzt).';
  function series(sym) {
    if (UNAVAILABLE[sym]) return Promise.reject(new Error('NOT_IN_DISCOVER'));
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

  /* ============================================================ App-Konzept 2 (Owner-Freigabe 14.11.2026)
     Kacheln zum Antippen, Schienen bis an den Rand, Grafiken statt Text. Tiefe öffnet sich im Fenster (VUUI.popup),
     nicht in einem zweiten Modus. Jede Zahl stammt aus den Artefakten der Seite; fehlt sie, bleibt die Stelle leer. */
  function sh(title, o) {
    var x = o || {};
    return '<div class="st-k-sh"' + (x.id ? ' id="' + esc(x.id) + '"' : '') + '><h2>' + esc(title) + '</h2>' +
      (x.href ? '<a href="' + esc(x.href) + '">' + esc(x.link || 'Alle') + ' ' + U.glyph('next', 13) + '</a>' : x.right ? '<span>' + x.right + '</span>' : '') + '</div>';
  }
  function tpl(id, html) { return '<template id="' + esc(id) + '">' + html + '</template>'; }
  /* „i“ öffnet die Erklärung der Seite im Fenster (Inhalt: <template id>). */
  function infoBtn(id, title) { return '<button type="button" class="st-k-i" aria-haspopup="dialog" data-vu-pop="' + esc(id) + '" data-vu-pop-title="' + esc(title) + '" aria-label="Erklärung: ' + esc(title) + '">i</button>'; }
  /* Seitenkopf in einer Zeile: Überschrift, rechts Etikett und „i“. Kein eigenes Datum, kein Vorspann. */
  function top(title, o) {
    var x = o || {};
    return '<header class="st-k-top">' + (x.back ? '<a class="st-k-back" href="' + esc(x.back[0]) + '" aria-label="' + esc(x.back[1]) + '">' + U.glyph('back', 18) + '</a>' : '') +
      '<div class="st-k-top-t">' + (x.eyebrow ? '<div class="vu-ltag">' + esc(x.eyebrow) + '</div>' : '') + '<h1 class="' + esc(x.cls || 'st-x-lt') + ' st-k-h1">' + esc(title) + '</h1></div>' + (x.right || '') + '</header>';
  }
  function pop(title, body, id) { return U.popup({ id: id || 'st-k-pop', title: title, body: body, cls: 'st-k-sheet' }); }
  /* Monogramm des Urhebers einer Methode (zwei Buchstaben aus dem Namen; kein Foto, keine erfundene Person). */
  function mono(author) {
    var a = String(author || '').split(/\s*,\s*/).filter(Boolean), w;
    if (a.length > 1) return a.slice(0, 2).map(function (x) { w = x.trim().split(/\s+/); return w[w.length - 1].charAt(0); }).join('').toUpperCase();
    w = String(a[0] || '').trim().split(/\s+/);
    return ((w[0] || '').charAt(0) + (w.length > 1 ? w[w.length - 1].charAt(0) : (w[0] || '').charAt(1))).toUpperCase();
  }
  function monoHtml(author, cls) { return '<span class="st-k-mono' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + esc(mono(author)) + '</span>'; }
  /* Belegte Plätze eines Musterdepots als Felder. */
  function seats(a, b) {
    var s = ''; for (var i = 0; i < b; i++) s += '<i' + (i < a ? ' class="is-on"' : '') + '></i>';
    return '<span class="st-k-seats" role="img" aria-label="' + esc(n0(a) + ' von ' + n0(b) + ' Plätzen belegt') + '">' + s + '</span>';
  }
  /* Anteile als ein Balken: parts [[Wert, Wort, Ton l|k|m|h]]. */
  function segs(parts, label) {
    var list = parts.filter(function (p) { return p[0] > 0; }), tot = list.reduce(function (a, p) { return a + p[0]; }, 0);
    if (!tot) return '';
    return '<span class="st-k-seg" role="img" aria-label="' + esc((label ? label + ': ' : '') + parts.map(function (p) { return n0(p[0]) + ' ' + p[1]; }).join(', ')) + '">' + list.map(function (p) { return '<i class="' + esc(p[2] || 'k') + '" style="flex:' + p[0] + '"></i>'; }).join('') + '</span>';
  }
  function segLegend(parts) { return '<span class="st-k-segl">' + parts.map(function (p) { return '<span><i class="' + esc(p[2] || 'k') + '"></i><b class="vu-num">' + n0(p[0]) + '</b> ' + esc(p[1]) + '</span>'; }).join('') + '</span>'; }
  function forschTag() { return '<span class="st-x-tag st-x-tag--ink">Forschung, nicht zertifiziert</span>'; }
  var LEGAL_LINE = 'Rechenmodell nach öffentlich beschriebenen Regeln. Keine Anlageberatung, kein Rat zum Kauf oder Verkauf, kein Kursziel.';
  /* Zonenleiste: drei Punkte auf einer Linie (Ungültig-Marke, Kurs/Aufnahme, Zone/Schluss), mit Beschriftung darunter. */
  function zoneBar(pts, o) {
    var vs = pts.filter(function (p) { return isNum(p.v); }), fmt = (o && o.fmt) || usd; if (vs.length < 2) return '';
    var lo = Math.min.apply(null, vs.map(function (p) { return p.v; })), hi = Math.max.apply(null, vs.map(function (p) { return p.v; })), x = function (v) { return ((v - lo) / (hi - lo || 1) * 100).toFixed(1); };
    var sm = o && o.sm, fill = '';
    /* Strecke zwischen den beiden äußeren Marken, an denen der Kurs gerade steht (reine Zeichnung derselben drei Werte). */
    var me = pts.filter(function (p) { return p.cls === 'me' && isNum(p.v); })[0], z = pts.filter(function (p) { return p.cls === 'z' && isNum(p.v); })[0];
    if (me && z) { var a = +x(Math.min(me.v, z.v)), b = +x(Math.max(me.v, z.v)); fill = '<u' + (me.v >= z.v ? ' class="is-up"' : '') + ' style="left:' + a + '%;width:' + (b - a).toFixed(1) + '%"></u>'; }
    return '<span class="st-x-zb' + (sm ? ' st-x-zb--sm' : '') + '" role="img" aria-label="' + esc(pts.map(function (p) { return p.label + ' ' + fmt(p.v); }).join(', ')) + '">' + fill + pts.map(function (p) { return isNum(p.v) ? '<i class="' + (p.cls || '') + '" style="left:' + x(p.v) + '%"></i>' : ''; }).join('') + '</span>' +
      /* o.key: Beschriftung in der Reihenfolge der Werte und mit dem Punkt der Leiste davor (wenn die Abgabe unter der Aufnahme liegen kann) */
      '<span class="st-x-zbl' + (sm ? ' st-x-zbl--xs st-r-sfoot' : '') + '">' + (o && o.key ? pts.slice().sort(function (a, b) { return (isNum(a.v) ? a.v : Infinity) - (isNum(b.v) ? b.v : Infinity); }) : pts).map(function (p) { return '<span>' + (o && o.key ? '<i class="st-x-dot' + (p.cls ? ' st-x-dot--' + esc(p.cls) : '') + '"></i> ' : '') + esc(p.label) + (sm ? ' ' : '<br>') + '<b class="vu-num">' + fmt(p.v) + '</b>' + (p.sub ? '<small>' + esc(p.sub) + '</small>' : '') + '</span>'; }).join('') + '</span>';
  }
  /* Protokoll als Zeitleiste: list [{date, st, methods[], price, res[], inn}] */
  var EVW = { SETUP: 'Wartet', ENTRY_READY: 'Plan fertig', ACTIVE: 'Musterdepot nimmt auf', ACTIVE_AGAIN: 'Warnzeichen vorbei', WARNING: 'Warnzeichen laut Methode', CLOSED: 'Musterdepot gibt ab', INVALIDATED: 'Muster zerfallen' };
  var JOIN = { TRIGGERED: 'ACTIVE', EXIT: 'CLOSED' };
  function eventsOf(entries, S) {
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
    return Object.keys(ev).map(function (k) { return ev[k]; }).sort(function (a, b) { return b.date.localeCompare(a.date) || lifeIx(b.st) - lifeIx(a.st); });
  }
  function timeline(list) {
    return '<ol class="st-x-tl st-r-tl">' + list.map(function (x) {
      var lab = EVW[x.st] || stateName(x.st), meth = x.methods.join(' und ');
      return '<li data-st="' + esc(x.st === 'ACTIVE_AGAIN' ? 'ACTIVE' : x.st) + '"><i></i><div><b>' + dShort(x.date) + ' · ' + esc(lab) + '</b><span>' + esc(meth + (isNum(x.price) ? ' · ' + usd(x.price) : '') + (x.res.length === 1 ? ' · Aufnahme ' + usd(x.inn) : '')) + '</span></div>' + x.res.map(function (r) { return '<span class="st-r-res">' + U.chg(r * 100) + '</span>'; }).join('') + '</li>';
    }).join('') + '</ol>';
  }
  /* Kapitel einer Seite: je eine Kachel, die ihren Inhalt im Fenster öffnet. list [{id, title, sub, glyph, node | html, pro}] */
  function chapters(host, list) {
    var use = list.filter(Boolean);
    append(host, '<div class="st-x-eps">' + use.map(function (x, i) {
      return '<button type="button" class="st-x-ep' + (use.length === 1 ? ' st-x-ep--solo' : '') + '" data-sheet="' + esc(x.id) + '" aria-haspopup="dialog">' + (use.length === 1 ? '' : '<b class="st-x-ep-n">' + (i + 1) + '</b>') + '<span class="vu-hud">' + U.glyph(x.glyph || 'list', 19) + '</span><span class="st-x-ep-t"><b>' + esc(x.title) + (x.pro ? ' ' + U.pro() : '') + '</b>' + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</span><span class="st-x-ep-c">' + U.glyph('next', 15) + '</span></button>';
    }).join('') + '</div>');
    use.forEach(function (x) { addSheet(x.id, x.title, x.html || ''); if (x.node) fillSheet(x.id, x.node); });
  }
  /* Hängt einen Knoten vor den Schließen-Knopf eines Sheets. */
  function fillSheet(id, node) { var s = document.getElementById(id); if (!s) return; var close = s.querySelector('.st-r-close'); if (close) close.parentNode.insertBefore(node, close); else s.appendChild(node); }
  /* Klick auf eine Kachel mit eigenem Fenster; ein Link mit Zusatztaste (neuer Tab) bleibt ein Link. */
  function onTap(host, attr, fn) {
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[' + attr + ']');
      if (!b || !host.contains(b) || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); fn(b.getAttribute(attr), b);
    });
  }

  /* Belegte Plätze der Musterdepots (portfolio.json; wird nach dem ersten Bild nachgeladen und blockiert nichts). */
  var SEATS = null;
  function loadSeats(X) {
    return X.getJSON('portfolio.json').then(function (pf) {
      SEATS = {};
      Object.keys((pf && pf.strategies) || {}).forEach(function (id) { var p = pf.strategies[id], mx = p.config && p.config.maxPositions; if (isNum(mx) && mx > 0) SEATS[id] = [p.openCount || 0, mx]; });
      return SEATS;
    });
  }
  /* ============================================================ App-Konzept 2, 1:1 nach Prototyp (#v-supertrader, Owner 15.11.2026)
     Aufbau, Reihenfolge und Maße aus docs/design/app-konzept-2-2026-11/prototyp/quelle/p2.js (V.supertrader) und build.js
     (Fenster „methode“, „ablauf“). CSS-Werte aus shell.js/kit.js im Block „.stp“ in st-redesign.css. Jede Zahl stammt aus den
     Artefakten der Seite (summary.json, market.json, portfolio.json, backtests.json, stock/NVDA.json); fehlt sie, fehlt der Block.
     Weggelassen, weil vom Owner zurückgestellt: Muster-Quiz. Die übrigen Blöcke der bisherigen Startseite stehen darunter. */
  function ppct(v) { return isNum(v) ? U.num(Math.abs(v) * 100, 1) + ' %' : '–'; }
  function stpSh(title, o) {
    var x = o || {};
    return '<div class="stp-sh"' + (x.id ? ' id="' + esc(x.id) + '"' : '') + '><h2>' + esc(title) + '</h2>' +
      (x.href ? '<a class="stp-more" href="' + esc(x.href) + '">' + esc(x.link) + ' ›</a>' : x.right ? '<span class="stp-more">' + esc(x.right) + '</span>' : '') + '</div>';
  }
  function avatar(author, big) { return '<span class="stp-av' + (big ? ' stp-av--xl' : '') + '" aria-hidden="true">' + esc(mono(author)) + '</span>'; }
  /* Schema je Methode (Owner 16.11.2026: „visuell, aber auch nochmal erklären“; Prototyp-Fenster „methode“). Eine kleine
     Formbeschreibung je Methode, gezeichnet in derselben Fläche 358 × 120 wie im Prototyp. Keine echten Kurse, keine Zahlen,
     keine Achsen. p: Kurslinie (mehrere Stücke = Kurslücke), z: Zone [x, y, b, h], s: Höhe der Ungültig-Marke, top: Zone liegt
     unter dem Kurs (Wette auf Rückgang), box: Kiste der Methode, ma: Durchschnittslinie, vol: Volumenbalken (Index hervorgehoben),
     t: was das Bild zeigt (für Vorleser). */
  var SKETCH = {
    C01: { p: ['8 98 40 82 70 88 100 64 130 72 160 48 190 56 215 50 240 56 262 50 290 36 320 26 350 18'], z: [250, 32, 108, 16], s: 86, ma: '160 48 262 48', t: 'Kurs steigt über das Hoch der letzten 20 Tage' },
    C02: { p: ['8 72 40 60 70 78 100 58 130 74 160 56 190 72 220 58 245 66 270 50 300 36 330 26 350 20'], z: [250, 40, 108, 16], s: 84, ma: '100 56 270 56', t: 'Kurs steigt nach langer Spanne über das Hoch der letzten 55 Tage' },
    C03: { p: ['8 104 40 88 70 72 100 56 128 42 150 46 170 76 190 46 210 78 232 44 250 60 270 34 300 26 330 18 350 12'], z: [250, 26, 108, 14], s: 82, box: [140, 40, 110, 42], t: 'Kurs pendelt in einer Kiste und bricht nach oben aus' },
    C04: { p: ['8 40 30 60 50 80 70 90 90 84 110 92 130 86 150 92 170 84 190 90 210 86 235 88 255 74 280 56 310 40 350 22'], z: [250, 62, 108, 16], s: 98, ma: '8 60 120 84 240 86 350 60', ph: [[90, 'Basis'], [300, 'Aufwärtstrend']], t: 'Lange Seitwärtsphase, dann Ausbruch über die Durchschnittslinie' },
    C05: { p: ['8 102 50 82 90 66 120 52 150 62 175 70 200 64 225 58 250 48 280 38 320 26 350 16'], z: [250, 40, 108, 14], s: 76, ma: '8 110 120 74 200 72 350 40', t: 'Laufender Aufwärtstrend, kurzer Rücksetzer, neuer Anlauf' },
    C06: { p: ['8 104 40 60 62 96 96 44 122 78 152 36 174 60 200 30 216 46 236 28 250 36 266 26 290 20 320 12 350 8'], z: [250, 22, 108, 22], s: 92, t: 'Schwankungen werden kleiner, dann Ausbruch' },
    C07: { p: ['8 110 40 104 70 90 100 64 125 38 150 22 170 30 190 26 210 32 230 28 250 30 275 18 310 12 350 6'], z: [250, 8, 108, 14], s: 40, t: 'Steiler Lauf, dann eine ruhige Pause nahe am Hoch' },
    C08: { p: ['8 106 40 92 70 72 100 50 125 40 150 46 175 42 200 46 225 42 250 44 275 30 310 20 350 12'], z: [250, 26, 108, 12], s: 54, t: 'Starker Lauf, enge Pause, dann Ausbruch über die Pause' },
    C09: { p: ['8 86 60 90 110 84 160 88 198 86', '210 46 240 40 280 34 320 30 350 24'], z: [205, 36, 64, 14], s: 58, t: 'Ruhiger Kurs, dann ein Kurssprung nach einer Überraschung' },
    C10: { p: ['8 102 80 94 150 82 200 62 240 36 265 14 285 22 305 40 330 54 350 62'], z: [285, 40, 73, 14], s: 8, top: true, t: 'Überhitzter Anstieg, dann Umkehr nach unten (nur Forschung)' },
    C11: { p: ['8 84 50 76 90 66 130 70 170 62 200 66 230 60 250 52 280 44 320 34 350 26'], z: [250, 40, 108, 14], s: 74, vol: [[6, 8, 7, 5, 9, 6, 7, 5, 8, 6, 20, 9, 8], 10], t: 'Aufwärtstag mit mehr Volumen als die Abwärtstage davor' },
    C12: { p: ['8 92 50 86 100 82 150 76 198 74', '210 44 240 40 280 34 320 28 350 22'], z: [205, 34, 64, 14], s: 56, vol: [[6, 7, 5, 8, 6, 7, 5, 6, 22, 10, 8, 7, 6], 8], t: 'Kurslücke nach oben mit sehr hohem Volumen' },
    C13: { p: ['8 104 50 84 90 64 130 44 160 30 185 40 210 52 230 58 250 50 280 38 320 26 350 18'], z: [245, 38, 113, 14], s: 70, ma: '8 112 100 84 200 62 260 54 350 38', t: 'Starker Trend, erster Rücksetzer an die 20-Tage-Linie, dann weiter' }
  };
  function sketch(cid) {
    var k = SKETCH[cid]; if (!k) return '';
    var z = k.z, vol = '';
    if (k.vol) vol = k.vol[0].map(function (h, i) { var x = 14 + i * 26; return '<rect class="stp-sk-v' + (i === k.vol[1] ? ' is-on' : '') + '" x="' + x + '" y="' + (120 - h) + '" width="14" height="' + h + '" rx="2"/>'; }).join('');
    return '<div class="stp-card stp-sk stp-mt12"><div class="stp-eb stp-sk-h">Schema der Methode, keine echten Kurse</div>' +
      '<svg width="100%" viewBox="0 0 358 120" role="img" aria-label="' + esc('Schema, keine echten Kurse: ' + k.t + '. Gestrichelt: Ungültig-Marke laut Methode. Kasten: Zone laut Methode.') + '">' + vol +
      (k.box ? '<rect class="stp-sk-box" x="' + k.box[0] + '" y="' + k.box[1] + '" width="' + k.box[2] + '" height="' + k.box[3] + '" rx="4"/>' : '') +
      '<rect class="stp-sk-z" x="' + z[0] + '" y="' + z[1] + '" width="' + z[2] + '" height="' + z[3] + '"/><path class="stp-sk-zl" d="M' + z[0] + ' ' + (k.top ? z[1] + z[3] : z[1]) + 'h' + z[2] + '"/>' +
      '<path class="stp-sk-s" d="M0 ' + k.s + 'h358"/>' + (k.ma ? '<path class="stp-sk-ma" d="M' + k.ma.replace(/^(\S+ \S+) /, '$1 L') + '"/>' : '') +
      k.p.map(function (d) { return '<path class="stp-sk-p" d="M' + d.replace(/^(\S+ \S+) /, '$1 L') + '"/>'; }).join('') +
      (k.ph ? k.ph.map(function (x) { return '<text class="stp-sk-t" x="' + x[0] + '" y="12" text-anchor="middle">' + esc(x[1]) + '</text>'; }).join('') : '') + '</svg>' +
      '<div class="stp-fl stp-sb stp-xs stp-b7 stp-sk-l"><span class="stp-mut">Ungültig-Marke laut Methode</span><span class="stp-lc">Zone laut Methode</span></div></div>';
  }
  /* Methode im Fenster (Prototyp-Fenster „methode“): Kopf mit Monogramm, ein Satz, drei Denkschritte, Zahlen von heute, zwei Knöpfe. */
  function methodSheet(s) {
    var m = N ? N.method(s.candidateId) : null, meta = methodMeta(s), by = s.counts.byStage || {}, th = N ? N.think(s.candidateId) : null;
    var sfHref = '/supertrader/strategies/?sf=' + encodeURIComponent(s.candidateId), own = N ? N.href(s.candidateId) : sfHref, st = m && m.depot && SEATS && SEATS[m.depot];
    var parts = [[by.CHART_CANDIDATE || 0, STAGE_TXT.CHART_CANDIDATE, 'k'], [by.CONFIRMED_RESEARCH_SETUP || 0, STAGE_TXT.CONFIRMED_RESEARCH_SETUP, 'm'], [by.MODELED_TRADE_PLAN || 0, STAGE_TXT.MODELED_TRADE_PLAN, 'l']];
    pop('', '<div class="stp-sheet"><div class="stp-fl stp-g12">' + avatar(meta.trader, true) + '<div class="stp-f1"><h2 class="stp-sh-t" style="font-size:26px">' + esc(cn(s)) + '</h2><div class="stp-sm stp-mut">' + esc(meta.trader + ' · ' + meta.style) + '</div></div>' + (m && m.depot ? '<span class="stp-pill stp-pill--sm">Depot</span>' : '') + '</div>' +
      '<p class="stp-md stp-sec stp-mt12">' + esc(meta.plain) + '</p>' + sketch(s.candidateId) +
      (th ? '<div class="stp-fl stp-g6 stp-mt8 stp-th">' + th.map(function (t, i) { return '<div class="stp-f1 stp-card"><span class="stp-q">' + (i + 1) + '</span><div class="stp-sm stp-b8 stp-mt8">' + esc(t[0]) + '</div><div class="stp-xs stp-mut">' + esc(t[1]) + '</div></div>'; }).join('') + '</div>' : '') +
      '<div class="stp-fl stp-g8 stp-mt12"><div class="stp-f1 stp-card"><div class="stp-num stp-lc" style="font-size:30px">' + n0(s.counts.published) + '</div><div class="stp-xs stp-mut stp-b7">Muster heute</div></div>' +
      (st ? '<div class="stp-f1 stp-card"><div class="stp-num" style="font-size:30px">' + n0(st[0]) + ' / ' + n0(st[1]) + '</div><div class="stp-xs stp-mut stp-b7">Plätze im Musterdepot</div></div>' : '<div class="stp-f1 stp-card"><div class="stp-num" style="font-size:30px">' + n0(by.MODELED_TRADE_PLAN || 0) + '</div><div class="stp-xs stp-mut stp-b7">Plan fertig</div></div>') + '</div>' +
      (s.counts.published ? '<div class="stp-card stp-mt8 stp-stages">' + segs(parts, 'Stufen') + segLegend(parts) + '</div>' : '') +
      (s.direction === 'SHORT_RESEARCH_ONLY' ? '<div class="stp-mt8">' + U.verdict('none', 'Nur Forschung') + '</div>' : '') +
      '<div class="stp-fl stp-g8 stp-mt16"><a class="stp-btn stp-f1" href="' + esc(sfHref) + '">' + esc(n0(s.counts.published) + (s.counts.published === 1 ? ' Aktie zeigen' : ' Aktien zeigen')) + '</a>' +
      (ST_ALERTS_UI ? bellHtml('method', s.strategyId, cn(s), 'stp-bell--w') + '</div><p class="stp-xs stp-mut stp-c stp-bell-note" role="status" aria-live="polite" hidden></p>' +
        '<p class="stp-xs stp-mut stp-mt8 stp-c">Forschung, nicht zertifiziert. Ein Vorteil ist nicht belegt.' + (own !== sfHref ? ' <a class="stp-lk" href="' + esc(own) + '">Methode öffnen</a>' : '') + '</p></div>'
        : (own !== sfHref ? '<a class="stp-btn stp-btn--ol" href="' + esc(own) + '">Methode öffnen</a>' : '') + '</div>' +
        '<p class="stp-xs stp-mut stp-mt8 stp-c">Forschung, nicht zertifiziert. Ein Vorteil ist nicht belegt.</p></div>'), 'st-k-method');
    bindBells(document.getElementById('st-k-method'));
  }
  /* Trader-Kachel (Prototyp trader(): 164 px, Monogramm 64 px, Zahl 38 px). */
  function traderTile(s) {
    var m = N ? N.method(s.candidateId) : null, meta = methodMeta(s), pat = m ? m.pattern : cn(s);
    return '<a class="stp-tile stp-tap stp-trader" href="' + esc(N ? N.href(s.candidateId) : '/supertrader/strategies/?sf=' + s.candidateId) + '" data-k-method="' + esc(s.candidateId) + '" aria-haspopup="dialog" aria-label="' + esc(cn(s) + ', ' + meta.trader + ': ' + n0(s.counts.published) + ' Muster heute') + '">' +
      '<span class="stp-fl stp-sb stp-top">' + avatar(meta.trader) + (m && m.depot ? '<span class="stp-pill stp-pill--sm">Depot</span>' : '') + '</span>' +
      '<b class="stp-b8 stp-mt12 stp-tr-n">' + esc(m && /,/.test(meta.trader) ? m.trader : meta.trader) + '</b><span class="stp-xs stp-mut stp-ell">' + esc(pat + ' · ' + meta.style) + '</span>' +
      '<b class="stp-num stp-lc stp-mt12" style="font-size:38px">' + n0(s.counts.published) + '</b><span class="stp-xs stp-mut stp-b7">Muster heute</span></a>';
  }
  /* Lage des Schlusses auf dem Weg zur Zone (Prototyp plan(): Breite 100 − Abstand × 12 %, Zone als Kasten rechts). */
  function zoneW(pd) { return isNum(pd) ? (pd >= 0 ? 100 : Math.max(4, 100 - Math.abs(pd) * 100 * 12)) : null; }
  function zonePill(pd) { return !isNum(pd) ? '' : pd < 0 ? ppct(pd) + ' zur Zone' : ppct(pd) + ' über Zone'; }
  function planTile(r, S) {
    var w = zoneW(r.pd);
    return '<button type="button" class="stp-tile stp-tap stp-plan stp-mt8" data-k-plan="' + esc(r.c + '|' + r.t) + '" aria-haspopup="dialog"><span class="stp-fl stp-g10">' + U.logo(r.t) + '<span class="stp-f1 stp-col"><b class="stp-b8 stp-ell">' + esc(r.n || r.t) + '</b><span class="stp-xs stp-mut">' + esc(cnId(S, r.c)) + '</span></span>' +
      (isNum(r.pd) ? '<span class="stp-pill">' + esc(zonePill(r.pd)) + '</span>' : '') + '</span>' +
      (w != null ? '<span class="stp-zone" aria-hidden="true"><span class="stp-bar"><i class="stp-grad" style="width:' + w.toFixed(1) + '%"></i></span><span class="stp-zbox"></span><span class="stp-zdot" style="left:calc(' + w.toFixed(1) + '% - ' + (w >= 99 ? 22 : 9) + 'px)"></span></span>' : '') + '</button>';
  }
  /* Schritt im Ablauf (Prototyp tl()). */
  function tlStep(on, t, d, s, last) {
    return '<div class="stp-tl' + (on ? ' is-on' : '') + '"><div class="stp-tl-a"><span class="stp-tl-c">' + (on ? U.glyph('check', 13) : '') + '</span>' + (last ? '' : '<i></i>') + '</div><div class="stp-f1 stp-tl-b"><div class="stp-fl stp-sb"><b' + (on ? '' : ' class="stp-mut"') + '>' + esc(t) + '</b><span class="stp-xs stp-mut">' + esc(d) + '</span></div><div class="stp-xs stp-mut">' + esc(s) + '</div></div></div>';
  }
  /* Plan im Fenster (Prototyp-Fenster „ablauf“): Marken aus dem Kandidatenstand der Aktie (nur Stufe „Plan fertig“). */
  function planSheet(r, S, X) {
    var el = pop('', '<div class="stp-sheet"><div class="stp-fl stp-g12">' + U.logo(r.t, { xl: true }) + '<div class="stp-f1"><h2 class="stp-sh-t">' + esc(r.n || r.t) + '</h2><div class="stp-sm stp-mut">' + esc(cnId(S, r.c)) + '</div></div><span class="stp-pill">Plan fertig</span></div>' +
      '<div data-plan>' + U.skeleton('rows') + '</div>' +
      '<div class="stp-fl stp-g8 stp-mt16"><a class="stp-btn stp-f1" href="/aktie/#/' + esc(encodeURIComponent(r.t)) + '" data-vu-stock="' + esc(r.t) + '" data-vu-stock-name="' + esc(r.n || r.t) + '">Aktie öffnen</a>' +
      (ST_ALERTS_UI ? bellHtml('stock', r.t, r.n || r.t, 'stp-f1') + '</div>' +
        '<p class="stp-xs stp-mut stp-c stp-bell-note" role="status" aria-live="polite" hidden></p>' +
        '<p class="stp-xs stp-mut stp-mt8 stp-c">Werte eines Forschungsmodells mit benannten Modellannahmen. Keine Order, keine Empfehlung, keine Aussage zur Handelbarkeit. <a class="stp-lk" href="' + esc(N ? N.href(r.c) : '/supertrader/strategies/?sf=' + r.c) + '">Methode öffnen</a> <a class="stp-lk" href="' + esc(stockHref(r.t)) + '">Alle Methoden dieser Aktie</a></p></div>'
        : '<a class="stp-btn stp-btn--ol stp-f1" href="' + esc(N ? N.href(r.c) : '/supertrader/strategies/?sf=' + r.c) + '">Methode öffnen</a></div>' +
        '<p class="stp-xs stp-mut stp-mt8 stp-c">Werte eines Forschungsmodells mit benannten Modellannahmen. Keine Order, keine Empfehlung, keine Aussage zur Handelbarkeit. <a class="stp-lk" href="' + esc(stockHref(r.t)) + '">Alle Methoden dieser Aktie</a></p></div>'), 'st-k-plan');
    bindBells(el);
    var host = el && el.querySelector('[data-plan]'); if (!host) return;
    X.getJSON('sf-candidates/ticker/' + r.sh + '.json').then(function (t) {
      var v = (t.views || []).filter(function (x) { return x.ticker === r.t && x.candidateId === r.c && x.stage === 'MODELED_TRADE_PLAN' && x.plan; })[0];
      if (!v) { host.innerHTML = U.blank('Für diese Aktie liegt heute kein fertiger Plan vor.'); return; }
      var p = v.plan, onOpen = /OPEN/.test(p.entryType), lo = p.stop, hi = p.trigger;
      var pos = isNum(lo) && isNum(hi) && isNum(v.close) && hi > lo ? Math.max(0, Math.min(1, (v.close - lo) / (hi - lo))) : null;
      host.innerHTML = '<div class="stp-card stp-zcard stp-mt12"><div class="stp-eb">Modellierter Ablauf (hypothetisch)</div>' +
        '<div class="stp-ztrack" role="img" aria-label="' + esc('Ungültig-Marke laut Methode ' + usd(p.stop) + ', Schluss ' + usd(v.close) + ', ' + (onOpen ? 'Referenz ' : 'Zone laut Methode ') + usd(p.trigger)) + '"><span class="stp-bar"><i class="stp-grad" style="width:' + (pos == null ? 0 : (pos * 100).toFixed(1)) + '%"></i></span><span class="stp-zs"></span>' +
        (pos == null ? '' : '<span class="stp-zc" style="left:calc(' + (pos * 100).toFixed(1) + '% - ' + (pos * 54).toFixed(0) + 'px)"></span>') + '<span class="stp-zbox stp-zbox--l"></span></div>' +
        '<div class="stp-fl stp-sb stp-xs stp-mt8 stp-zl"><div><div class="stp-mut">Ungültig-Marke laut Methode</div><b>' + usd(p.stop) + '</b></div><div class="stp-c"><div class="stp-mut">Schluss</div><b>' + usd(v.close) + '</b></div><div class="stp-r"><div class="stp-mut">' + (onOpen ? 'Referenz (Schluss)' : 'Zone laut Methode') + '</div><b class="stp-lc">' + usd(p.trigger) + '</b></div></div></div>' +
        '<div class="stp-mt16">' + tlStep(1, STAGE_TXT.CHART_CANDIDATE, '', 'Der Chart zeigt das Muster der Methode.') + tlStep(1, STAGE_TXT.CONFIRMED_RESEARCH_SETUP, '', 'Alle prüfbaren Regeln der Methode stimmen.') +
        tlStep(1, STAGE_TXT.MODELED_TRADE_PLAN, dShort(v.asOf), 'Zone und Ungültig-Marke berechnet' + (isNum(p.plannedRiskPct) ? ', ' + U.num(p.plannedRiskPct * 100, p.plannedRiskPct < 0.01 ? 2 : 1) + ' % Abstand' : '') + '.') +
        tlStep(0, onOpen ? 'Zone zur Eröffnung' : 'Zone laut Methode', 'ab ' + dShort(p.earliestSession), isNum(p.limit) ? 'Limit ' + usd(p.limit) + ' laut Methode' : 'Wenn der Kurs die Zone erreicht', 1) + '</div>';
    }).catch(function () { host.innerHTML = U.blank('Der Plan ist gerade nicht erreichbar. Bitte später erneut versuchen.'); });
  }
  /* Marktlage im Fenster: Zustand und Messwerte aus market.json (Beschreibung der Gegenwart, keine Vorhersage). */
  function marketSheet(rg) {
    pop('Marktlage: ' + rg.label, '<p class="st-k-plain">' + esc(rg.plain || '') + '</p>' +
      '<div class="st-k-box st-k-gap">' + (rg.measures || []).map(function (x) { return '<div class="st-k-ms"><span>' + esc(x.label) + '</span>' + U.meter(isNum(x.share) ? x.share * 100 : null, { label: x.label, lime: true }) + '<b class="vu-num">' + (isNum(x.share) ? U.num(x.share * 100, 0) + ' %' : '–') + '</b></div>'; }).join('') + '</div>' +
      '<p class="st-k-fine">' + esc('Stand ' + dDe(rg.asOf) + '. ' + String(rg.notAForecast || '').split('. ')[0].replace(/\.?$/, '.') + ' Keine Prognose.') + '</p>', 'st-k-market');
  }
  var STP_TABS = [['Heute', 'stp-heute'], ['Trader', 'stp-tr'], ['Plan fertig', 'stp-plan'], ['Musterdepots', 'stp-dep'], ['Forschung', 'stp-for']];
  function stpTabs(wrap) {
    var nav = document.createElement('nav'); nav.className = 'stp-tabs'; nav.setAttribute('aria-label', 'Supertrader-Bereiche');
    /* Hinter den fünf Reitern des Prototyps (Sprungmarken) bleiben die übrigen Bereiche erreichbar, die sonst die Reiterzeile des
       Rahmens zeigt (dieselbe Quelle: VUNavigation.products(), Welt „supertrader“). */
    var go = [];
    try {
      var w = window.VUNavigation && window.VUNavigation.products ? window.VUNavigation.products().filter(function (p) { return p.id === 'supertrader'; })[0] : null;
      if (w) go = w.tabs.filter(function (t) { return t.href && t.label !== w.label && !STP_TABS.some(function (x) { return x[0] === t.label; }); });
    } catch (e) { go = []; }
    nav.innerHTML = STP_TABS.map(function (t, i) { return '<a class="stp-tab' + (i ? '' : ' is-on') + '" href="#' + t[1] + '" data-stp-tab="' + t[1] + '"' + (i ? '' : ' aria-current="true"') + '>' + esc(t[0]) + '</a>'; }).join('') +
      (go.length ? '<span class="stp-tabs-sep" aria-hidden="true"></span>' + go.map(function (t) { return '<a class="stp-tab" href="' + esc(t.href) + '">' + esc(t.label) + '</a>'; }).join('') : '');
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('[data-stp-tab]'); if (!a) return;
      e.preventDefault();
      nav.querySelectorAll('[data-stp-tab]').forEach(function (x) { var on = x === a; x.classList.toggle('is-on', on); if (on) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
      var target = document.getElementById(a.getAttribute('data-stp-tab'));
      if (target) { var y = target.getBoundingClientRect().top + window.scrollY - nav.getBoundingClientRect().height - (parseFloat(getComputedStyle(nav).top) || 0) - 4; window.scrollTo({ top: a.getAttribute('data-stp-tab') === 'stp-heute' ? 0 : Math.max(0, y), behavior: 'smooth' }); }
    });
    wrap.appendChild(nav);
  }
  function home(D, X) {
    var sig = D.signals, c = sig.counts || {}, main = page(X.main, X), rg = D.market && D.market.regime;
    var prep = (c.SETUP || 0) + (c.ENTRY_READY || 0), held = (c.ACTIVE || 0) + (c.WARNING || 0) + (c.EXIT || 0);
    var ABOUT = 'Methoden der Profis';
    main.classList.add('stp');
    if (window.VUNavigation && window.VUNavigation.rahmen) window.VUNavigation.rahmen({ tabs: 'inhalt' });
    append(main, '<h1 class="st-x-lt vu-visually-hidden">Supertrader: ' + ABOUT + '</h1>' +
      tpl('st-k-about', '<p class="st-k-plain">13 Methoden berühmter Trader als feste Regeln, jeden Tag auf alle US-Aktien angewendet. Musterdepots zeigen, was die Regel tun würde. Ohne echtes Geld.</p><div class="st-k-gap">' + forschTag() + '</div><p class="st-k-fine"><b>Die 13 Methoden.</b> Jede sucht ein bestimmtes Kursmuster.</p>' + flowExplain() + '<p class="st-k-fine">' + LEGAL_LINE + '</p>'));
    stpTabs(main);
    /* Heute: Trichter der drei Stufen (Prototyp: Kachel p16, Balken 100 / 62 / 38 %, Zahl 34 px) und die Marktlage in einer Zeile. */
    var todayWrap = document.createElement('div'); todayWrap.className = 'stp-px'; todayWrap.id = 'stp-heute'; main.appendChild(todayWrap);
    var today = document.createElement('section'); today.className = 'st-x-today stp-tile stp-hero'; today.setAttribute('aria-label', 'Heute'); todayWrap.appendChild(today);
    var mm = rg && (rg.measures || []).filter(function (x) { return x.id === 'above200' && isNum(x.share); })[0];
    function hero(by, nSec, busy) {
      var val = function (k) { return by ? n0(by[k] || 0) : busy ? '…' : '–'; };
      today.setAttribute('aria-busy', busy ? 'true' : 'false');
      today.innerHTML = '<div class="stp-fl stp-sb stp-g8"><span class="stp-eb st-r-asof">Heute' + (isNum(nSec) ? ' · ' + n0(nSec) + ' Aktien geprüft' : '') + '</span><span class="stp-pill stp-pill--sm stp-pill--ol">Forschung</span></div>' +
        '<button type="button" class="st-k-funnel stp-funnel" aria-haspopup="dialog" data-vu-pop="st-k-about" data-vu-pop-title="' + ABOUT + '" aria-label="' + esc('Alle US-Aktien: ' + STAGES.map(function (k) { return STAGE_TXT[k] + ' ' + val(k); }).join(', ') + '. Erklärung öffnen') + '">' +
        STAGES.map(function (k, i) { return '<span class="st-k-fn stp-fn s' + (i + 1) + '"' + (by ? ' data-stage="' + k + '"' : '') + '><b>' + esc(i === 2 ? 'Plan' : STAGE_TXT[k]) + '</b><span class="stp-num">' + val(k) + '</span></span>'; }).join('') + '</button>' +
        (rg && rg.label ? '<button type="button" class="stp-mkt" data-k-market="1" aria-haspopup="dialog"><i class="stp-dot" aria-hidden="true"></i><span><b>Marktlage: ' + esc(rg.label) + '.</b>' + (mm ? ' <span class="stp-mut">' + esc(U.num(mm.share * 100, 0) + ' % der Aktien über der 200-Tage-Linie.') + '</span>' : '') + '</span></button>' : '');
    }
    hero(null, null, true);
    onTap(main, 'data-k-market', function () { marketSheet(rg); });
    var railHost = document.createElement('div'); main.appendChild(railHost);
    var planHost = document.createElement('div'); main.appendChild(planHost);
    var newHost = document.createElement('div'); main.appendChild(newHost);
    var depHost = document.createElement('div'); main.appendChild(depHost);
    var forHost = document.createElement('div'); main.appendChild(forHost);
    var exHost = document.createElement('div'); main.appendChild(exHost);
    var navHost = document.createElement('div'); main.appendChild(navHost);
    railHost.innerHTML = stpSh('Die Trader', { id: 'stp-tr' }) + '<div class="stp-px">' + U.skeleton('rows') + '</div>';
    /* Musterdepots (Prototyp: eine Kachel mit belegten Plätzen je Depot). Die Zählung des Ablaufs steht im Fenster der Kachel. */
    var depStats = U.stats([{ value: n0(prep), label: 'warten' }, { value: n0(c.TRIGGERED || 0), label: 'heute aufgenommen' }, { value: n0(held), label: 'im Musterdepot', tone: 'lime' }, { value: n0(c.CLOSED || 0), label: 'abgegeben' }], { label: 'Musterdepots, ohne echtes Geld' });
    depHost.innerHTML = stpSh('Musterdepots', { id: 'stp-dep', href: '/supertrader/treffer/', link: 'Rechenmodell, kein echtes Geld' }) + '<div class="stp-px"><button type="button" class="stp-tile stp-tap stp-dep" data-stp-dep aria-haspopup="dialog" aria-label="Musterdepots: belegte Plätze und Ablauf öffnen"><span data-seats>' + depStats + '</span></button></div>';
    var depRows = '';
    onTap(depHost, 'data-stp-dep', function () {
      pop('Musterdepots', '<div class="stp-sheet"><p class="stp-sm stp-sec">Fünf Methoden haben ein Musterdepot. Es zeigt, was die Regel tun würde. Rechenmodell, kein echtes Geld.</p><div class="stp-card stp-mt12">' + depStats + '</div>' +
        (depRows ? '<div class="stp-card stp-mt8">' + depRows + '</div>' : '') +
        '<a class="stp-btn stp-mt16" href="/supertrader/treffer/">Alle Treffer zeigen</a></div>', 'st-k-dep');
    });
    /* Wie belastbar? (Prototyp: Zahl 40 px, Balken 18 px, Zeile darunter, ein Satz). */
    forHost.innerHTML = stpSh('Wie belastbar?', { id: 'stp-for', right: 'Forschung, nicht zertifiziert' }) +
      '<div class="stp-px"><a class="stp-tile stp-tap stp-bel" href="/supertrader/forschung/"><span data-bt><b class="stp-num" style="font-size:40px">…</b></span><span class="stp-sm stp-sec stp-mt8 stp-blk">Supertrader zeigt, wie Profis denken und wo ihre Regeln heute greifen. Ein Renditeversprechen ist es nicht.</span></a></div>';
    /* Weitere Blöcke der bisherigen Startseite im selben Design; danach „Weiter“ und „Daten & Hinweise“ wie im Prototyp. */
    navHost.innerHTML = stpSh('Eigene Strategie') +
      '<div class="stp-px"><a class="stp-tile stp-tap stp-fl stp-g12" href="/supertrader/hausstrategie/">' + U.hud('supertrader', 40) + '<span class="stp-f1 stp-col"><b class="stp-b8">VU Hausstrategie</b><span class="stp-xs stp-mut">20 Aktien, je 5 %, eigene Regeln, Vorwärtslauf</span></span>' + U.glyph('next', 18) + '</a>' +
      '<a class="stp-tile stp-tap stp-fl stp-g12 stp-mt8" href="/supertrader/strategies/">' + U.hud('supertrader', 40) + '<span class="stp-f1 stp-col"><b class="stp-b8">Methoden</b><span class="stp-xs stp-mut">Was sucht welche Methode?</span></span>' + U.glyph('next', 18) + '</a>' +
      '<p class="stp-xs stp-mut stp-mt12">' + LEGAL_LINE + '</p></div>' +
      '<div class="stp-px stp-next">' + U.next({ title: 'Technical: Charts und Muster', sub: 'Formationen und Trends im Chart', href: '/technical/' }) + '</div>' +
      '<div class="stp-end"><button type="button" class="stp-lk" data-stp-hinweise>Daten &amp; Hinweise</button></div>';
    /* „Daten & Hinweise“: Datenstand, Methodik und Hinweistext der bisherigen Fußzeile im Fenster. */
    var footNode = X.disclaimer(sig);
    onTap(navHost, 'data-stp-hinweise', function () {
      var box = document.createElement('div'); box.className = 'stp-sheet stp-hw';
      if (footNode) { var cl = footNode.cloneNode(true), d = cl.querySelector('details'); if (d) d.open = true; box.appendChild(cl); }
      pop('Daten & Hinweise', box, 'st-k-hinweise');
    });
    if (window.VUNavigation && window.VUNavigation.datenstand && sig.asOf) window.VUNavigation.datenstand({ datum: sig.asOf, zeilen: [['Supertrader', 'Erkennung auf Tagesschlusskursen vom ' + dDe(sig.asOf)], ['Marktlage', rg && rg.asOf ? 'Stand ' + dDe(rg.asOf) : 'nicht verfügbar', !!(rg && rg.asOf)]] });

    X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var by = sum.counts.byStage || {}, list = sum.strategies.slice().sort(function (a, b) { return b.counts.published - a.counts.published; });
      var S = {}; sum.strategies.forEach(function (s) { S[s.candidateId] = s; });
      hero(by, sum.dataQuality && sum.dataQuality.securities, false);
      if (window.VUNavigation && window.VUNavigation.datenstand && sum.asOf) window.VUNavigation.datenstand({ datum: sum.asOf, zeilen: [['Supertrader', 'Erkennung auf Tagesschlusskursen vom ' + dDe(sum.asOf)], ['Marktlage', rg && rg.asOf ? 'Stand ' + dDe(rg.asOf) : 'nicht verfügbar', !!(rg && rg.asOf)]] });
      railHost.innerHTML = stpSh('Die Trader', { id: 'stp-tr', href: '/supertrader/strategies/', link: 'Alle ' + list.length }) + '<div class="stp-rail" role="group" aria-label="Die ' + list.length + ' Methoden">' + list.map(traderTile).join('') + '</div>';
      onTap(railHost, 'data-k-method', function (cid) { if (S[cid]) methodSheet(S[cid]); });
      /* Plan fertig: Zone und Ungültig-Marke stehen; sortiert nach Abstand zur Zone heute, eine Zeile je Aktie. */
      var rows = []; Object.keys(sum.top || {}).forEach(function (k) { (sum.top[k] || []).forEach(function (r) { if (r.s === 'MODELED_TRADE_PLAN') rows.push(r); }); });
      var seen = {}; rows = rows.sort(function (a, b) { return Math.abs(isNum(a.pd) ? a.pd : 9) - Math.abs(isNum(b.pd) ? b.pd : 9); }).filter(function (r) { if (seen[r.t]) return false; seen[r.t] = 1; return true; });
      var nPlan = by.MODELED_TRADE_PLAN || rows.length, shown = rows.slice(0, 3);
      planHost.innerHTML = stpSh('Plan fertig heute', { id: 'stp-plan', href: '/supertrader/treffer/?schritt=plan', link: 'Alle ' + n0(nPlan) }) +
        '<div class="stp-px stp-plans">' + (shown.length ? shown.map(function (r) { return planTile(r, S); }).join('') : U.blank('Heute hat keine Aktie einen fertigen Plan.')) + '</div>';
      onTap(planHost, 'data-k-plan', function (key) { var r = rows.filter(function (x) { return x.c + '|' + x.t === key; })[0]; if (r) planSheet(r, S, X); });
      /* Neu heute: Einträge (Methode × Aktie), die gegenüber dem Vortag dazugekommen oder weggefallen sind (summary.json#changes). */
      var ch = sum.changes;
      if (ch && ch.status === 'COMPARED' && Array.isArray(ch.added) && Array.isArray(ch.removed)) {
        var a = ch.added.length, rm = ch.removed.length, tot = a + rm || 1;
        newHost.innerHTML = stpSh('Neu heute') + '<div class="stp-px"><button type="button" class="stp-tile stp-tap stp-new" data-stp-new aria-haspopup="dialog"><span class="stp-fl stp-sb"><span class="stp-col"><b class="stp-num stp-lc" style="font-size:40px">+' + n0(a) + '</b><span class="stp-xs stp-mut stp-b7">neu erkannt</span></span>' +
          '<span class="stp-col stp-r"><b class="stp-num" style="font-size:40px">−' + n0(rm) + '</b><span class="stp-xs stp-mut stp-b7">nicht mehr erkannt</span></span></span>' +
          '<span class="stp-seg stp-mt12" role="img" aria-label="' + esc(n0(a) + ' neu erkannt, ' + n0(rm) + ' nicht mehr erkannt') + '"><i class="stp-l" style="width:' + (a / tot * 100).toFixed(1) + '%"></i><i class="stp-w" style="width:' + (rm / tot * 100).toFixed(1) + '%"></i></span></button></div>';
        onTap(newHost, 'data-stp-new', function () {
          pop('Neu heute', '<div class="stp-sheet"><p class="stp-sm stp-sec">' + esc('Gegenüber dem ' + dDe(ch.previousAsOf) + ': ' + n0(a) + ' Einträge neu erkannt, ' + n0(rm) + ' nicht mehr erkannt.' + (Array.isArray(ch.restaged) && ch.restaged.length ? ' ' + n0(ch.restaged.length) + ' mit neuer Stufe.' : '')) + '</p><p class="stp-xs stp-mut stp-mt8">Gezählt je Methode und Aktie.</p></div>', 'st-k-new');
        });
      }
      /* Belegte Plätze je Musterdepot (Prototyp depot(): Name 92 px, Felder 18 px, Zahl 40 px). */
      return loadSeats(X).then(function (st) {
        var rowsS = (N ? N.ORDER : []).map(function (cid) { var m = N.method(cid); return m && m.depot && st[m.depot] ? [m, st[m.depot]] : null; }).filter(Boolean).sort(function (a, b) { return b[1][0] / b[1][1] - a[1][0] / a[1][1]; });
        if (!rowsS.length) return;
        var row = function (x) { var f = ''; for (var i = 0; i < x[1][1]; i++) f += '<i' + (i < x[1][0] ? ' class="is-on"' : '') + '></i>'; return '<span class="stp-dr"><b class="stp-sm stp-b8">' + esc(x[0].trader) + '</b><span class="stp-df" role="img" aria-label="' + esc(n0(x[1][0]) + ' von ' + n0(x[1][1]) + ' Plätzen belegt') + '">' + f + '</span><span class="stp-sm stp-b8 stp-r">' + n0(x[1][0]) + '/' + n0(x[1][1]) + '</span></span>'; };
        depHost.querySelector('[data-seats]').innerHTML = rowsS.map(row).join('');
        depRows = rowsS.map(function (x) { return '<a class="stp-dlink" href="' + esc(N.href(x[0].id)) + '">' + row(x) + '</a>'; }).join('');
      }).catch(function () {});
    }).catch(function () { hero(null, null, false); railHost.innerHTML = stpSh('Die Trader', { id: 'stp-tr' }) + '<div class="stp-px">' + U.blank('Die 13 Methoden sind gerade nicht erreichbar. Bitte später erneut versuchen.') + '</div>'; });

    X.getJSON('backtests.json').then(function (bt) {
      var runs = (bt.runs || []).filter(function (r) { return r.active; }), proven = runs.filter(function (r) { return r.metricsPublishable; }).length;
      var t = forHost.querySelector('[data-bt]');
      if (!runs.length) { if (t) t.innerHTML = '<b class="stp-b8">Wie belastbar ist welche Methode?</b>'; return; }
      var cnt = function (lab) { return runs.filter(function (r) { return (STATUS[r.status] || ['In Prüfung'])[0] === lab; }).length; };
      var pr = cnt('In Prüfung'), df = cnt('Daten fehlen'), rest = Math.max(0, runs.length - pr - df), tot = runs.length;
      if (t) t.innerHTML = '<b class="stp-num stp-blk" style="font-size:40px">' + proven + ' von ' + tot + '</b><span class="stp-sm stp-mut stp-b7 stp-blk">Regelversionen mit belegtem Vorteil</span>' +
        '<span class="stp-seg stp-mt12" role="img" aria-label="' + esc(pr + ' in Prüfung, ' + df + ' Daten fehlen' + (rest ? ', ' + rest + ' bereit zum Test' : '')) + '"><i class="stp-w" style="width:' + (pr / tot * 100).toFixed(1) + '%"></i>' + (rest ? '<i class="stp-l" style="width:' + (rest / tot * 100).toFixed(1) + '%"></i>' : '') + '<i class="stp-g" style="width:' + (df / tot * 100).toFixed(1) + '%"></i></span>' +
        '<span class="stp-fl stp-sb stp-xs stp-b7 stp-mt8"><span>' + pr + ' in Prüfung</span>' + (rest ? '<span>' + rest + ' bereit zum Test</span>' : '') + '<span class="stp-mut">' + df + ' Daten fehlen</span></span>';
    }).catch(function () { var t = forHost.querySelector('[data-bt]'); if (t) t.innerHTML = '<b class="stp-b8">Wie belastbar ist welche Methode?</b>'; });

    /* So läuft ein Durchgang (bisherige Startseite): ein abgeschlossener Durchgang im Musterdepot (NVIDIA, Turtle · 20 Tage). */
    Promise.all([X.getJSON('stock/NVDA.json'), identity(X)]).then(function (r) {
      var st = r[0].strategies && r[0].strategies.DONCHIAN_TURTLE, cyc = null;
      allOf(st || {}).filter(function (s) { return s.symbol === 'NVDA' && s.state === 'CLOSED'; }).forEach(function (s) { var cy = cycle(s); if (cy && cy.out && (!cyc || cy.inn.date > cyc.inn.date)) cyc = cy; });
      if (!cyc) return;
      return series('NVDA').then(function (ser) {
        var res = isNum(cyc.inn.price) && cyc.inn.price > 0 && isNum(cyc.out.price) ? cyc.out.price / cyc.inn.price - 1 : null;
        var mon = new Date(cyc.inn.date + 'T12:00:00Z').toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        exHost.innerHTML = stpSh('So läuft ein Durchgang', { href: '/supertrader/beispiel/', link: 'Alle' }) +
          '<div class="stp-px"><div class="stp-tile"><a class="stp-fl stp-g10 stp-stk" href="/aktie/#/NVDA" data-vu-stock="NVDA" data-vu-stock-name="NVIDIA">' + U.logo('NVDA') + '<span class="stp-f1 stp-col"><b class="stp-b8">NVIDIA</b><span class="stp-xs stp-mut">' + esc('Musterdepot ' + (N ? N.name('DONCHIAN_TURTLE') : 'Turtle') + ', ' + mon) + '</span></span>' + (isNum(res) ? U.chg(res * 100) : '') + '</a>' +
          '<div class="stp-mt12">' + (F ? F.dep(3) : '') + '</div><div class="stp-mt8" data-chart></div><div class="st-x-marks stp-xs"><b>① ' + dShort(cyc.inn.date) + '</b> Musterdepot nimmt auf · ' + usd(cyc.inn.price) + '<br><b>② ' + dShort(cyc.out.date) + '</b> Musterdepot gibt ab · ' + usd(cyc.out.price) + '</div></div></div>';
        drawChart(exHost.querySelector('[data-chart]'), lastMonths(ser.points, 3), { marks: [[cyc.inn.date, '1'], [cyc.out.date, '2']], label: 'NVIDIA', height: 130 });
      });
    }).catch(function () { exHost.innerHTML = ''; });
  }

  /* ============================================================ SX02 Methoden */
  function methodRow(s, mx) {
    var m = N ? N.method(s.candidateId) : null, meta = methodMeta(s), by = s.counts.byStage || {};
    return '<a class="vu-tap st-x-mr2 st-k-mrow" href="' + esc(N ? N.href(s.candidateId) : '/supertrader/strategies/?sf=' + s.candidateId) + '" aria-haspopup="dialog" data-k-method="' + esc(s.candidateId) + '" data-style="' + esc(meta.style) + '" data-depot="' + (m && m.depot ? '1' : '') + '" data-q="' + esc((cn(s) + ' ' + meta.trader).toLowerCase()) + '">' +
      monoHtml(meta.trader) + '<span class="st-k-mrow-t"><span class="st-x-mr2-h"><b>' + esc(cn(s)) + '</b>' + (m && m.depot ? '<span class="st-x-tag st-x-tag--sm">Musterdepot</span>' : '') + '</span><span class="st-x-sub">' + esc(meta.trader + ' · ' + meta.style) + '</span><span class="st-k-plain">' + esc(meta.plain) + '</span>' + sbar(by, mx) + '</span>' +
      '<span class="st-x-mr2-n"><b class="vu-num">' + n0(s.counts.published) + '</b><small>heute</small></span></a>';
  }
  function strategies(D, X) {
    var reg = D.registry, sig = D.signals, main = page(X.main, X);
    var other = reg.strategies.filter(function (s) { return s.mode !== 'LIVE'; });
    /* Frühere Reiter (#musterdepots, #weitere) führen auf dieselbe Liste; der Filter „Mit Musterdepot“ ersetzt den Reiter. */
    var tab = (location.hash || '').replace('#', '');
    append(main, top('Was sucht welche Methode?', { right: infoBtn('st-k-minfo', 'Methoden') }) + '<div data-info></div>');
    var host = document.createElement('div'); main.appendChild(host);
    host.innerHTML = U.blank('Die 13 Methoden werden geladen …', { verdict: false });
    X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var list = sum.strategies.slice().sort(function (a, b) { return b.counts.published - a.counts.published; });
      var S = {}; list.forEach(function (s) { S[s.candidateId] = s; });
      var cnt = {}, dep = 0; list.forEach(function (s) { var st = methodMeta(s).style; cnt[st] = (cnt[st] || 0) + 1; if (N && N.method(s.candidateId) && N.method(s.candidateId).depot) dep++; });
      var styles = (N ? N.STYLES : STYLES).filter(function (x) { return cnt[x]; }).sort(function (a, b) { return cnt[b] - cnt[a]; });
      var mx = Math.max.apply(null, list.map(function (s) { return s.counts.published || 0; }).concat([1]));
      var f = { q: '', style: '', depot: tab === 'musterdepots' };
      main.querySelector('[data-info]').innerHTML = tpl('st-k-minfo', '<p class="st-k-plain">Ein Name je Methode: Trader · Muster. Fünf haben ein Musterdepot.</p>' + legend() +
        '<div class="st-k-gap">' + U.help('Die Zahl rechts: wie viele US-Aktien am ' + dShort(sum.asOf) + ' das Muster zeigen. Sie sagt nichts darüber, ob die Methode Geld verdient.') + '</div>' + flowExplain());
      host.innerHTML = '<label class="st-r-search">' + U.glyph('search', 18) + '<input type="search" placeholder="Methode oder Trader …" aria-label="Methode oder Trader suchen"></label>' +
        '<div class="st-x-chips st-k-chips" role="group" aria-label="Filter"><button type="button" class="vu-chip" data-k="" aria-pressed="' + !f.depot + '">Alle ' + list.length + '</button><button type="button" class="vu-chip" data-k="depot" aria-pressed="' + f.depot + '">Mit Musterdepot ' + dep + '</button>' +
        styles.map(function (x) { return '<button type="button" class="vu-chip" data-k="style" data-v="' + esc(x) + '" aria-pressed="false">' + esc(x) + ' ' + cnt[x] + '</button>'; }).join('') + '</div>' +
        '<div class="st-k-list st-k-cols" data-list>' + list.map(function (s) { return methodRow(s, mx); }).join('') + '</div><p class="st-x-none vu-sm vu-mu" hidden>Keine Methode passt zur Suche.</p>' + legend() +
        '<div class="st-k-card st-k-gap16" id="weitere"><b class="vu-sm">' + esc(N ? N.RESEARCH_LABEL : 'Weitere Modelle in der Forschung') + '</b><div class="st-k-pills">' +
          other.filter(function (s) { return !(N && N.isMethod(s.strategy_id)); }).map(function (s) { return '<a class="vu-chip" href="' + esc(X.stratUrl(s)) + '">' + esc(wn(s)) + '</a>'; }).join('') + '</div><p class="st-k-fine">Teilprüfung, ohne tägliche Erkennung.</p></div>' +
        U.next({ title: 'Treffer', sub: 'Wo steht welche Aktie im Ablauf?', href: '/supertrader/treffer/' });
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
      onTap(host, 'data-k-method', function (cid) { if (S[cid]) methodSheet(S[cid]); });
      apply();
      loadSeats(X).catch(function () {});
      if (tab === 'weitere') { var w = host.querySelector('#weitere'); if (w && w.scrollIntoView) w.scrollIntoView(); }
    }).catch(function () { host.innerHTML = U.blank('Die 13 Methoden sind gerade nicht erreichbar. Bitte später erneut versuchen.'); });
    foot(main, X, sig);
  }

  /* ============================================================ SX03 Eine Methode mit Musterdepot */
  function liveMethod(D, X, s) {
    var id = s.strategy_id, sig = D.signals, main = page(X.main, X), c = (s.rule_cards || [])[0], e = s.evidence || {};
    var cid = (N && N.methodOfDepot(id)) || SF_OF[id], m = N && cid ? N.method(cid) : null;
    var st = sig.strategies[id] || { open: [] };
    var mp = D.portfolio && D.portfolio.strategies && D.portfolio.strategies[id], cfg = (mp && mp.config) || {};
    var trader = m ? m.trader : (s.originator || ''), pattern = m ? m.pattern : wn(s), author = m ? m.author : s.originator || '';
    var nHeld = st.open.filter(function (x) { return x.entry; }).length, hasSeats = mp && isNum(cfg.maxPositions) && cfg.maxPositions > 0;
    append(main, '<header class="st-x-hero st-k-mhero"><div class="st-k-mhero-top"><a class="st-x-hb" href="/supertrader/strategies/" aria-label="Zurück zu den Methoden">' + U.glyph('back', 18) + '</a>' +
      '<div class="st-x-hero-tags">' + (m ? '<span class="st-x-tag st-x-tag--dk">' + esc(m.style) + '</span>' : '') + '<span class="st-x-tag">Musterdepot</span></div></div>' +
      '<div class="st-k-mhero-id">' + monoHtml(author, 'st-k-mono--xl') + '<h1 class="vu-lt">' + esc(trader) + '<span>' + esc(pattern) + '</span></h1></div>' +
      '<p>' + esc((m ? m.plain : s.tagline || '') + ' Nach ' + author + ', als feste Regel umgesetzt.') + '</p>' +
      '<div class="st-x-g2">' + (cid ? '<a class="st-x-mini st-k-mini" href="/supertrader/strategies/?sf=' + esc(cid) + '">' : '<div class="st-x-mini st-k-mini">') + '<b class="st-k-big vu-num" data-today>…</b><small>Heute erkannt</small>' + (cid ? '<span class="st-k-go">' + U.glyph('next', 14) + '</span></a>' : '</div>') +
      '<div class="st-x-mini st-k-mini" data-depot><b class="st-k-big vu-num">' + (hasSeats ? n0(mp.openCount || 0) + ' von ' + n0(cfg.maxPositions) : n0(nHeld)) + '</b><small>' + (hasSeats ? 'Plätzen im Musterdepot' : 'im Musterdepot') + '</small>' + (hasSeats ? seats(mp.openCount || 0, cfg.maxPositions) : '') + '</div></div></header>');
    if (cid) X.getJSON('sf-candidates/summary.json').then(function (sum) {
      var q = sum.strategies.filter(function (x) { return x.candidateId === cid; })[0], b = main.querySelector('[data-today]');
      b.textContent = q ? n0(q.counts.published) + (q.counts.published === 1 ? ' Aktie' : ' Aktien') : '–';
    }).catch(function () { main.querySelector('[data-today]').textContent = '–'; });
    else main.querySelector('[data-today]').textContent = '–';
    var th = N && cid ? N.think(cid) : null;
    if (th) append(main, sh('So denkt die Methode') + '<div class="st-x-g3 st-k-think">' + th.map(function (t, i) { return '<div class="st-x-card st-x-think"><span class="st-x-stepn">' + (i + 1) + '</span><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span></div>'; }).join('') + '</div>');

    /* Im Musterdepot gerade: der Eintrag, der der Zone am nächsten ist (sonst die jüngste Aufnahme) */
    var near = st.open.filter(function (x) { return !x.entry && (x.state === 'ENTRY_READY' || x.state === 'SETUP'); }).sort(function (a, b) { return (a.state === 'ENTRY_READY' ? 0 : 1) - (b.state === 'ENTRY_READY' ? 0 : 1) || X.dist(a) - X.dist(b); });
    var held = st.open.filter(function (x) { return x.entry; }).sort(function (a, b) { return String(b.entry.date || '').localeCompare(String(a.entry.date || '')); });
    var first = near[0] || held[0];
    append(main, sh('Im Musterdepot gerade'));
    var pos = document.createElement('div'); main.appendChild(pos);
    if (first) {
      var lv = first.levels || {}, close = first.lastPrice, step = F ? F.stepOfState(first.state) : 0, dist = isNum(lv.trigger) && isNum(close) && close > 0 ? lv.trigger / close - 1 : null;
      var sub = first.entry ? (F ? F.wordOfState(first.state) : '') + ' seit ' + dShort(first.entry.date) : 'Plan fertig · ' + (isNum(dist) ? U.num(Math.max(0, dist) * 100, 1) + ' % bis zur Zone' : 'Zone laut Methode');
      var right = first.entry ? U.chg(isNum(close) ? (close / first.entry.price - 1) * 100 : null) : U.verdict('mid', isNum(dist) ? 'noch ' + U.num(Math.max(0, dist) * 100, 1) + ' %' : 'Wartet');
      var zb = first.entry ? zoneBar([{ v: stopOf(first), label: 'Ungültig laut Methode' }, { v: first.entry.price, label: 'Aufnahme', cls: 'z' }, { v: close, label: 'Schluss', cls: 'me' }]) : zoneBar([{ v: lv.invalidation, label: 'Ungültig laut Methode' }, { v: close, label: 'Schluss', cls: 'me' }, { v: lv.trigger, label: 'Zone laut Methode', cls: 'z' }]);
      pos.innerHTML = '<a class="vu-tap st-x-pos" href="' + esc(stockHref(first.symbol)) + '"><span class="st-x-pos-h">' + U.logo(first.symbol) + '<span class="st-k-nm st-k-nm--wrap"><b>' + esc(nameOf(first)) + '</b><span>' + esc(sub) + '</span></span>' + right + '</span>' +
        (F ? F.dep(step < 0 ? 0 : step) : '') + zb + '<span class="st-r-gap8" data-chart></span></a>';
      identity(X).then(function () { return series(first.symbol); }).then(function (ser) {
        var levels = [];
        if (!first.entry && isNum(lv.trigger)) levels.push({ value: lv.trigger, label: 'Zone laut Methode', tone: 'lime' });
        if (!first.entry && isNum(lv.invalidation)) levels.push({ value: lv.invalidation, label: 'Ungültig', tone: 'grey' });
        if (first.entry && isNum(stopOf(first))) levels.push({ value: stopOf(first), label: 'Ungültig', tone: 'grey' });
        drawChart(pos.querySelector('[data-chart]'), lastMonths(ser.points, 3), { levels: levels, label: first.symbol, height: 130 });
      }).catch(function () { pos.querySelector('[data-chart]').innerHTML = UNAVAILABLE[first.symbol] ? U.blank(NO_SERIES_TEXT) : ''; });
    } else pos.innerHTML = U.blank('Heute wartet keine Aktie auf die Aufnahme, und das Musterdepot hält gerade keine.');
    append(main, '<a class="vu-tap st-k-gap st-k-prot" href="/supertrader/treffer/?method=' + esc(id) + '"><span class="st-k-row"><span class="vu-ltag">Protokoll seit ' + dShort(st.liveSince) + '</span><span class="st-k-go">' + U.glyph('next', 14) + '</span></span>' + U.stats([{ value: n0(X.closedCount(st)), label: 'abgegeben' }, { value: n0(st.invalidatedTotal || 0), label: 'Muster zerfallen' }, { value: n0(st.retiredTotal || 0), label: 'Regel geändert' }], { label: 'Protokoll seit ' + dDe(st.liveSince) }) + '</a>');
    if (mp) {
      var inv = Math.round((mp.investedPct || 0) * 100), cash = Math.round((mp.cashPct == null ? 1 : mp.cashPct) * 100), parts = [[inv, '% investiert', 'l'], [cash, '% Bargeld', 'h']];
      append(main, sh('Laufend nach Regel') + '<div class="st-k-card st-k-run">' + segs(parts, 'Musterdepot') +
        '<div class="st-k-run-l"><span><b class="vu-num">' + pp(mp.investedPct || 0, 0) + '</b> investiert</span><span><b class="vu-num">' + pp(mp.cashPct == null ? 1 : mp.cashPct, 0) + '</b> Bargeld</span><span><b class="vu-num">' + (isNum(cfg.riskPerTrade) ? U.num(cfg.riskPerTrade * 100, 2) + ' %' : '–') + '</b> Anteil je Aufnahme</span></div>' +
        '<p class="st-k-fine">Rechenmodell, kein echtes Geld.</p><a class="st-k-more" href="/portfolios/#/supertrader">Alle Musterdepots im Bereich Portfolios ' + U.glyph('next', 13) + '</a></div>');
    }

    /* Wie nah an der Originalregel? */
    var fc = (s.fidelity && s.fidelity.counts) || null;
    if (fc) {
      var fp = [[fc.ORIGINAL || 0, 'wörtlich vom Trader', 'l'], [(fc.OPERATIONALIZATION || 0) + (fc.DOCUMENTED_VARIANT || 0), 'umgesetzt', 'k'], [fc.VU_EXTENSION || 0, fc.VU_EXTENSION === 1 ? 'Ergänzung' : 'Ergänzungen', 'm'], [fc.UNBACKED || 0, 'ohne Beleg', 'g'], [fc.MISSING || 0, 'fehlen', 'h']];
      var tot = fp.reduce(function (a, x) { return a + x[0]; }, 0);
      if (tot) append(main, sh('Wie nah an der Originalregel?') + '<div class="st-k-card st-r-fid-box"><span class="vu-ltag">' + tot + ' Regelteile</span><div class="st-r-fid st-k-fid" role="img" aria-label="' + esc(fp.map(function (x) { return x[0] + ' ' + x[1]; }).join(', ')) + '">' + fp.filter(function (x) { return x[0]; }).map(function (x) { return '<i class="' + x[2] + '" style="flex:' + x[0] + '"></i>'; }).join('') + '</div>' +
        segLegend(fp.filter(function (x) { return x[0]; })) + '</div>');
    }
    append(main, '<a class="vu-tap st-r-belast st-k-bel" href="/supertrader/forschung/"><span class="st-k-row">' + forschTag() + '<span class="st-k-go">' + U.glyph('next', 16) + '</span></span><b class="st-k-bel-t">Wie belastbar?</b><span class="st-k-cap">' + esc((e.levelLabel || 'In Prüfung') + '. Ein Vorteil ist nicht belegt.') + '</span></a>');

    /* Kapitel: Regeln im Detail, Herkunft, Lücken (je ein Fenster) */
    var miss = (s.fidelity && s.fidelity.missing) || [], edges = (c && c.edge_cases) || [];
    var rc = document.createElement('div');
    if (c) rc.appendChild(frag('<p class="vu-sm vu-mu">' + U.pro() + ' Version ' + esc(c.rule_version) + ' · ' + c.sections.length + ' Abschnitte · eingefroren</p>' + c.sections.map(function (x) { return '<div class="st-r-rc"><div><b>' + esc(x.title) + '</b><span>' + esc(x.text) + '</span></div>' + provVerdict(x.provenance) + '</div>'; }).join('')));
    var rb = X.rulesBlock(s, D); if (rb) { rc.appendChild(frag('<h3 class="vu-sm st-k-gap16">Alle Regeln der Version ' + esc(s.strategy_version) + '</h3>')); rc.appendChild(rb); }
    var og = document.createElement('div');
    if (s.fidelity && s.fidelity.rules && s.fidelity.rules.length) og.appendChild(X.fidelityList(s, D));
    if (c && X.assessments) { og.appendChild(frag('<h3 class="vu-sm st-k-gap16">Was ist belegt? Regel, Quellen, Daten, Evidenz</h3>')); og.appendChild(X.assessments(s, c, D)); }
    var gp = document.createElement('div');
    if (miss.length) gp.appendChild(frag('<p><b>Fehlt im Code</b></p><ul class="st-r-ul">' + miss.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'));
    if (edges.length) gp.appendChild(X.ruleCardList({ sections: edges }));
    if (s.prohibited_interpretations && s.prohibited_interpretations.length) gp.appendChild(frag('<p><b>Was diese Methode nicht ist</b></p><ul class="st-r-ul">' + s.prohibited_interpretations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'));
    if (!gp.childNodes.length) gp.appendChild(frag(U.blank('Für diese Version sind keine Lücken erfasst.')));
    append(main, sh('Mehr zur Methode'));
    chapters(main, [
      { id: 'st-rulecard', title: 'Die Regeln im Detail', sub: c ? c.sections.length + ' Abschnitte' : 'Regeln der Version ' + s.strategy_version, glyph: 'list', node: rc },
      { id: 'st-origin', title: 'Was stammt vom Trader?', sub: 'Quellen je Regelteil', glyph: 'book', node: og },
      { id: 'st-gaps', title: 'Lücken und fehlende Daten', sub: miss.length ? miss.length + (miss.length === 1 ? ' Regelteil fehlt' : ' Regelteile fehlen') : 'Grenzfälle und Konflikte', glyph: 'filter', node: gp }]);
    append(main, U.next({ title: 'Treffer dieser Methode', sub: 'Wo steht welche Aktie im Ablauf?', href: '/supertrader/treffer/?method=' + id }));
    foot(main, X, sig);
  }

  /* ============================================================ ST03 Methode ohne Musterdepot (52W, Teilprüfung, fehlende Daten, Namenskarte) */
  var PROV = { ORIGINAL: ['strong', 'Original'], ORIGINAL_INTERPRETATION: ['strong', 'Original'], VU_FORMALIZATION: ['mid', 'umgesetzt'], VU_OWN: ['none', 'VU-eigen'], FOREIGN_RULE: ['none', 'Fremdregel'], UNRESOLVED: ['weak', 'ungeklärt'], NOT_PUBLIC: ['none', 'nicht öffentlich'], VU: ['none', 'VU-eigen'] };
  function provVerdict(p) { var x = PROV[p] || ['none', p || '–']; return U.verdict(x[0], x[1]); }
  function evVerdict(s) {
    var e = s.evidence || {}, lv = e.level;
    if (lv === 'NOT_TESTED' || !lv) return U.verdict('none', e.levelLabel || 'Noch nicht geprüft');
    if (lv === 'IN_REVIEW') return U.verdict('none', e.levelLabel || 'In Prüfung');
    return U.verdict('weak', e.levelLabel || lv);
  }
  function strategy(D, X) {
    var id = document.body.getAttribute('data-strategy'), reg = D.registry, S = X.stratMap(reg), s = S[id];
    if (!s) return X.legacy(X.main, D);
    if (s.mode === 'LIVE') return liveMethod(D, X, s);
    var main = page(X.main, X), e = s.evidence || {}, c = (s.rule_cards || [])[0];
    append(main, top(wn(s), { back: ['/supertrader/strategies/', 'Zurück zu den Methoden'], eyebrow: 'Methode · ' + (s.originator || s.strategy_family || ''), cls: 'vu-lt' }) +
      (s.tagline ? '<p class="st-r-leadx">' + esc(s.tagline) + '</p>' : '') +
      '<div class="st-k-card st-r-belast"><div class="st-r-bh"><b>Wie belastbar?</b>' + evVerdict(s) + '</div><p class="vu-sm">' + esc(e.levelPlain || 'Für diese Methode ist kein Vorteil belegt.') + '</p>' +
      '<div class="st-r-gap8">' + U.research() + '</div></div>');
    /* Dieselben Bausteine wie die Methoden mit Musterdepot (Treffer der Originalregel, Methodentreue, Kapitel im Fenster);
       die übrigen Angaben der bisherigen Seite vollständig unter „Weitere Angaben“. */
    var nl = document.createElement('div'); main.appendChild(nl);
    var cid0 = SF_OF[id];
    if (cid0) {
      var t0 = document.createElement('div'); t0.className = 'st-k-gap'; nl.appendChild(t0);
      t0.innerHTML = U.stat('…', 'Treffer heute, Originalregel');
      X.getJSON('sf-candidates/summary.json').then(function (sum) {
        var q = sum.strategies.filter(function (x) { return x.candidateId === cid0; })[0];
        t0.innerHTML = U.stat(q ? n0(q.counts.published) : '–', q ? 'Treffer heute · ' + cn(q) + ', Originalregel' : 'Treffer heute · nicht verfügbar', { href: '/supertrader/strategies/?sf=' + cid0, cls: 'st-r-tilebtn' });
      }).catch(function () { t0.innerHTML = U.stat('–', 'Treffer heute · gerade nicht erreichbar'); });
    }
    append(nl, fidelityBox(s));
    deepDive(nl, s, c, D, X);
    var more = document.createElement('details'); more.className = 'st-r-acc st-r-legacy-acc st-k-acc';
    more.innerHTML = '<summary><b>Weitere Angaben dieser Methode</b>' + U.glyph('next', 16) + '</summary>';
    var host = document.createElement('div'); host.className = 'st-r-accb st-r-legacy'; more.appendChild(host); nl.appendChild(more);
    X.legacy(host, D);
    [].forEach.call(host.querySelectorAll('.st-hero, .st-productline, .st-evbanner'), function (n) { n.remove(); });
    append(nl, U.next({ title: 'Methoden', sub: 'Was sucht welche Methode?', href: '/supertrader/strategies/' }) + note('Regelbasierte Nachbildung einer Methode. Keine Anlageberatung.'));
  }
  /* Methodentreue als ein Balken (für jede Methode, auch ohne Musterdepot). */
  function fidelityBox(s) {
    var fc = (s.fidelity && s.fidelity.counts) || null;
    var fid = fc ? [[fc.ORIGINAL || 0, 'Original', 'l'], [(fc.OPERATIONALIZATION || 0) + (fc.DOCUMENTED_VARIANT || 0), 'umgesetzt', 'k'], [fc.VU_EXTENSION || 0, 'VU-Erweiterung', 'm'], [fc.UNBACKED || 0, 'unbelegt', 'g'], [fc.MISSING || 0, 'fehlen', 'h']] : null;
    var tot = fid ? fid.reduce(function (a, x) { return a + x[0]; }, 0) : 0;
    if (!tot) return '';
    return sh('Methodentreue', { right: tot + ' Regelteile' }) + '<div class="st-k-card"><span class="vu-ltag">Woher die Regel stammt</span><div class="st-r-fid st-k-fid" role="img" aria-label="' + esc(fid.map(function (x) { return x[0] + ' ' + x[1]; }).join(', ')) + '">' + fid.filter(function (x) { return x[0]; }).map(function (x) { return '<i class="' + x[2] + '" style="flex:' + x[0] + '"></i>'; }).join('') + '</div>' +
      segLegend(fid) + (s.fidelity.statusPlain ? '<p class="st-k-fine">' + esc(s.fidelity.statusPlain) + '</p>' : '') + '</div>';
  }
  /* „Mehr zur Methode“: So denkt die Methode, Regelkarte, was belegt ist, alle Regeln, Herkunft, Lücken, was sie nicht ist. Je ein Fenster. */
  function deepDive(after, s, c, D, X) {
    /* Owner-Entscheidung 07.11.2026: Quellenliste nicht mehr je Methode, sondern zentral (/supertrader/sources/, verlinkt aus
       Menü → Rechtliches & Infos → Datenquellen & Methodik und aus „Daten & Methodik“ dieser Seite). */
    var miss = (s.fidelity && s.fidelity.missing) || [], edges = (c && c.edge_cases) || [], gaps = null;
    if (miss.length || edges.length) {
      gaps = document.createElement('div');
      if (miss.length) gaps.appendChild(frag('<p><b>Fehlt im Code</b></p><ul class="st-r-ul">' + miss.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>'));
      if (edges.length) gaps.appendChild(X.ruleCardList({ sections: edges }));
    }
    var rules = X.rulesBlock(s, D), fid = s.fidelity && s.fidelity.rules && s.fidelity.rules.length ? X.fidelityList(s, D) : null;
    append(after, sh('Mehr zur Methode'));
    chapters(after, [
      { id: 'st-think', title: 'So denkt die Methode', glyph: 'target', html: '<p>' + esc(s.story || '') + '</p>' + (s.how_it_thinks && s.how_it_thinks.length ? '<ol class="st-r-ol">' + s.how_it_thinks.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>' : '') },
      c ? { id: 'st-rulecard', title: 'Regelkarte', sub: c.sections.length + ' Abschnitte', glyph: 'list', pro: true, html: '<p class="vu-sm vu-mu">' + U.pro() + ' Version ' + esc(c.rule_version) + ' · ' + c.sections.length + ' Abschnitte · eingefroren</p>' + c.sections.map(function (x) { return '<div class="st-r-rc"><div><b>' + esc(x.title) + '</b><span>' + esc(x.text) + '</span></div>' + provVerdict(x.provenance) + '</div>'; }).join('') } : null,
      c && X.assessments ? { id: 'st-assess', title: 'Was ist belegt?', sub: 'Regel, Quellen, Daten, Evidenz', glyph: 'check', node: X.assessments(s, c, D) } : null,
      rules ? { id: 'st-rules', title: 'Alle Regeln der Version ' + s.strategy_version, glyph: 'grid', pro: true, node: rules } : null,
      fid ? { id: 'st-origin', title: 'Was stammt vom Trader, was von Vision Universe?', glyph: 'book', node: fid } : null,
      gaps ? { id: 'st-gaps', title: 'Lücken, fehlende Daten, Konflikte', glyph: 'filter', node: gaps } : null,
      s.prohibited_interpretations && s.prohibited_interpretations.length ? { id: 'st-not', title: 'Was diese Methode nicht ist', glyph: 'x', html: '<ul class="st-r-ul">' + s.prohibited_interpretations.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' } : null]);
  }
  function srcCard(x) {
    var TYPE = { BOOK_BIBLIOGRAPHIC: 'Buch', BOOK_TRANSLATION: 'Buch (Übersetzung)', OWN_WEBSITE: 'Website des Traders', OWN_ARTICLE: 'eigener Beitrag', OWN_SOCIAL: 'eigener Beitrag', ORIGINAL_INTERVIEW: 'Interview', SECONDARY: 'Sekundärquelle', SECONDARY_SUMMARY: 'Sekundärquelle', PRESS: 'Presse', PRESS_CONTEMPORARY: 'Presse (zeitgenössisch)', ACADEMIC: 'Fachartikel', INSTITUTIONAL: 'Institution', LEGAL_RECORD: 'Rechtsdokument', PUBLISHER_PAGE: 'Verlagsseite', VU_INTERNAL: 'Vision Universe' };
    var ACCESS = { BIBLIOGRAPHIC_ONLY: 'Nur Titelangaben', NOT_RETRIEVED: 'Nicht abgerufen', PUBLIC_PREVIEW: 'Nur Vorschau', READ_IN_RESEARCH_PR: 'In der Forschung gelesen', PUBLIC_FULL: 'Öffentlich' };
    var read = x.content_retrieved_by_vu ? 'Im Volltext gelesen' : (ACCESS[x.access] || '–');
    var t = esc(x.title || '–');
    return '<div class="st-r-src">' + U.glyph('book', 20) + '<div><b>' + (x.url ? '<a href="' + esc(x.url) + '" rel="noopener" target="_blank">' + t + '</a>' : t) + '</b><span>' + esc([TYPE[x.source_type] || x.source_type, x.publisher_or_site || x.author].filter(Boolean).join(' · ')) + '</span></div><small>' + esc(read) + '</small></div>';
  }

  /* ============================================================ SX04 Treffer */
  var STEPS = [['depot', 'Im Musterdepot', 2], ['plan', 'Plan fertig', 0], ['ab', 'Abgegeben', 3]];
  var OLD_PHASE = { held: 'depot', pos: 'depot', conf: 'depot', prep: 'plan', exit: 'ab', closed: 'ab' };
  function stepOf(x) { return x.state === 'ACTIVE' || x.state === 'WARNING' || x.state === 'TRIGGERED' ? 'depot' : x.state === 'ENTRY_READY' ? 'plan' : x.state === 'EXIT' ? 'ab' : null; }
  function zonePts(x, long) {
    var lv = x.levels || {}, close = x.lastPrice, lm = long ? ' laut Methode' : '';
    return x.entry && isNum(x.entry.price) ? [{ v: stopOf(x), label: 'Ungültig' + lm }, { v: x.entry.price, label: 'Aufnahme', cls: 'z' }, { v: close, label: 'Schluss', cls: 'me' }]
      : [{ v: lv.invalidation, label: 'Ungültig' + lm }, { v: close, label: 'Schluss', cls: 'me' }, { v: lv.trigger, label: 'Zone' + lm, cls: 'z' }];
  }
  function trefferPill(x) {
    var lv = x.levels || {}, close = x.lastPrice;
    if (x.entry && isNum(x.entry.price)) return U.chg(isNum(close) ? (close / x.entry.price - 1) * 100 : null);
    var dist = isNum(lv.trigger) && isNum(close) && close > 0 ? lv.trigger / close - 1 : null;
    return U.verdict('mid', isNum(dist) ? 'noch ' + U.num(Math.max(0, dist) * 100, 1) + ' %' : 'Plan fertig');
  }
  /* Eine Kachel: Logo, Name, Methode · Schritt, Pille; darunter die Zonenleiste mit Legende. Antippen öffnet den Ablauf im Fenster. */
  function trefferRow(x, mName, step, key) {
    var word = step === 'depot' ? 'im Musterdepot' : step === 'plan' ? 'Plan fertig' : 'abgegeben';
    return '<a class="vu-tap st-x-trr st-r-sig" href="' + esc(stockHref(x.symbol)) + '" aria-haspopup="dialog" data-k-row="' + esc(key) + '"><span class="st-x-trr-h">' + U.logo(x.symbol) + '<span class="st-k-nm st-k-nm--wrap"><b>' + esc(nameOf(x)) + '</b><span>' + esc(mName + ' · ' + word) + '</span></span><span class="vu-visually-hidden">' + U.verdict('none', stateName(x.state)) + '</span>' + trefferPill(x) + '</span><span class="st-r-trk">' + zoneBar(zonePts(x), { sm: true }) + '</span></a>';
  }
  /* Ablauf einer Aktie im Fenster: Schritt, Marken, Protokoll dieses Eintrags, Wege zur Aktie und zur Methode. */
  function trefferSheet(x, id, S, X) {
    var step = F ? F.stepOfState(x.state) : -1, close = x.lastPrice, stop = stopOf(x), mName = nm(S, id);
    var luft = x.entry && isNum(stop) && isNum(close) && close > 0 ? (close - stop) / close : null;
    var evs = eventsOf([{ s: x, id: id }], S);
    pop(nameOf(x), '<div class="st-k-mh">' + U.logo(x.symbol, { xl: true }) + '<div><b>' + esc(mName) + '</b><span>' + esc(x.symbol) + '</span></div>' + stateVerdict(x.state) + '</div>' +
      '<div class="st-k-box st-k-gap">' + (F && step >= 0 ? F.dep(step) : '') + zoneBar(zonePts(x, true)) +
      (isNum(luft) ? '<p class="st-k-fine"><b class="vu-num">' + U.num(luft * 100, 1) + ' %</b> Abstand zur Ungültig-Marke</p>' : '') + '</div>' +
      (evs.length ? '<div class="st-k-sh"><h2>Protokoll</h2></div>' + timeline(evs) : '') +
      '<div class="st-k-btns"><a class="vu-btn vu-btn--block" href="' + esc(stockHref(x.symbol)) + '">Aktie öffnen</a>' + (S[id] ? '<a class="vu-btn vu-btn--line vu-btn--block" href="' + esc(X.stratUrl(S[id])) + '">Methode öffnen</a>' : '') + '</div>' +
      '<p class="st-k-fine">Rechenmodell, kein echtes Geld. Ungültig-Marke laut Methode: fällt der Schluss darunter, gibt das Musterdepot die Aktie ab.</p>', 'st-k-treffer');
  }
  function signals(D, X) {
    var reg = D.registry, sig = D.signals, S = X.stratMap(reg), main = page(X.main, X);
    var params = new URLSearchParams(location.search);
    var f = { step: params.get('schritt') || OLD_PHASE[params.get('phase')] || 'depot', method: params.get('method') || '' };
    if (!STEPS.some(function (s) { return s[0] === f.step; })) f.step = 'depot';
    var methods = reg.strategies.filter(function (s) { return s.mode === 'LIVE'; });
    var partial = ['CANSLIM', 'PIOTROSKI_F'].filter(function (id) { return sig.partialChecks && sig.partialChecks[id]; });
    var rows = [], byKey = {};
    Object.keys(sig.strategies).forEach(function (id) { sig.strategies[id].open.forEach(function (x) { var st = stepOf(x); if (!st) return; if (st === 'plan' && x.quality && x.quality.tier === 'B' && f.method !== id) return; var r = { s: x, id: id, step: st, key: id + '|' + x.symbol + '|' + (x.createdAt || '') }; rows.push(r); byKey[r.key] = r; }); });
    var HELP = 'Ungültig-Marke laut Methode: fällt der Schluss darunter, gibt das Musterdepot die Aktie ab. Rechenmodell, keine Order.';
    append(main, top('Wo steht welche Aktie im Ablauf?', { right: infoBtn('st-k-tinfo', 'Treffer') }) +
      tpl('st-k-tinfo', '<div>' + forschTag() + '</div><div class="st-k-gap">' + U.help(HELP) + '</div>' + flowExplain()) +
      '<div class="st-k-steps st-r-chips" role="group" aria-label="Schritt" data-steps></div>' +
      '<div class="st-x-chips st-k-chips st-r-chips" role="group" aria-label="Methode" data-methods></div>' +
      '<div class="st-x-flowbox st-k-flowbox"></div>' +
      '<div class="st-k-sh st-r-asof"><h2 data-count></h2><span>Schluss ' + dShort(sig.asOf) + '</span></div><p class="vu-xs vu-mu st-x-legend"><span class="st-x-dot"></span> Ungültig-Marke · <span class="st-x-dot st-x-dot--z"></span> Aufnahme · <span class="st-x-dot st-x-dot--me"></span> Schluss</p>' +
      '<div class="st-k-meta">' + forschTag() + '<span class="vu-xs vu-mu" data-sort></span></div>' +
      '<div class="st-k-list st-k-cols" data-list></div><button type="button" class="vu-btn vu-btn--line vu-btn--block st-r-more st-x-gap12">Weitere 25 laden</button>' +
      U.next({ title: 'Forschung', sub: 'Wie belastbar ist welche Methode?', href: '/supertrader/forschung/' }));
    var stepsH = main.querySelector('[data-steps]'), chips = main.querySelector('[data-methods]'), flow = main.querySelector('.st-x-flowbox'), list = main.querySelector('[data-list]'), more = main.querySelector('.st-r-more'), count = main.querySelector('[data-count]'), sortL = main.querySelector('[data-sort]'), legendEl = main.querySelector('.st-x-legend');
    var limit = 25;
    function base() { return rows.filter(function (r) { return !f.method || r.id === f.method; }); }
    function drawChips() {
      var bm = base();
      stepsH.innerHTML = STEPS.map(function (s) { var n = bm.filter(function (r) { return r.step === s[0]; }).length; return '<button type="button" class="st-k-step" data-k="step" data-v="' + s[0] + '" aria-pressed="' + (f.step === s[0]) + '"><b class="vu-num st-x-cn">' + n0(n) + '</b><span>' + esc(s[1]) + '</span></button>'; }).join('');
      chips.innerHTML = [{ strategy_id: '', world_name: 'Alle Methoden' }].concat(methods).map(function (m) { return '<button type="button" class="vu-chip" data-k="method" data-v="' + esc(m.strategy_id) + '" aria-pressed="' + (f.method === m.strategy_id) + '">' + esc(m.strategy_id && N && N.methodOfDepot(m.strategy_id) ? N.method(N.methodOfDepot(m.strategy_id)).trader : wn(m)) + '</button>'; }).join('') +
        (partial.indexOf(f.method) >= 0 ? '<button type="button" class="vu-chip" data-k="method" data-v="' + esc(f.method) + '" aria-pressed="true">' + esc(nm(S, f.method)) + '</button>' : '');
    }
    function draw() {
      if (partial.indexOf(f.method) >= 0) {
        var pc = sig.partialChecks[f.method];
        count.textContent = pc.candidates.length + ' Teiltreffer · ' + nm(S, f.method); sortL.textContent = 'Kriterien'; legendEl.hidden = true; flow.hidden = true; stepsH.hidden = true;
        list.innerHTML = pc.candidates.length ? pc.candidates.map(function (r) { return '<a class="vu-tap st-r-row st-k-prow" data-partial href="' + esc(stockHref(r.symbol)) + '">' + U.logo(r.symbol) + '<span class="st-k-nm st-r-sname"><b>' + esc(r.name || r.companyName || r.symbol) + '</b><span>Teilprüfung · ' + esc(String(r.met != null ? r.met + ' Kriterien erfüllt' : '')) + '</span></span>' + U.verdict('none', 'Teiltreffer') + '</a>'; }).join('') : U.blank('Heute erfüllt keine Aktie die prüfbaren Kriterien dieser Methode.');
        more.hidden = true; return;
      }
      legendEl.hidden = false; flow.hidden = false; stepsH.hidden = false;
      var cur = STEPS.filter(function (s) { return s[0] === f.step; })[0];
      flow.innerHTML = F ? F.dep(cur[2]) : '';
      var shown = base().filter(function (r) { return r.step === f.step; });
      if (f.step === 'plan') { shown.sort(function (a, b) { return X.dist(a.s) - X.dist(b.s); }); sortL.textContent = 'sortiert nach Abstand zur Zone'; }
      else { shown.sort(function (a, b) { return String((b.s.entry && b.s.entry.date) || '').localeCompare(String((a.s.entry && a.s.entry.date) || '')) || a.s.symbol.localeCompare(b.s.symbol); }); sortL.textContent = 'sortiert seit Aufnahme'; }
      count.textContent = n0(shown.length) + ' ' + (f.step === 'depot' ? 'im Musterdepot' : f.step === 'plan' ? 'mit Plan fertig' : 'abgegeben');
      list.innerHTML = shown.length ? shown.slice(0, limit).map(function (r) { return trefferRow(r.s, nm(S, r.id), r.step, r.key); }).join('') : U.blank('Für diesen Schritt gibt es heute keinen Eintrag.');
      more.hidden = shown.length <= limit;
    }
    function update() {
      limit = 25; drawChips(); draw();
      var q = new URLSearchParams(); if (f.step !== 'depot') q.set('schritt', f.step); if (f.method) q.set('method', f.method);
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    }
    function pick(e) { var b = e.target.closest('button'); if (!b) return; if (b.getAttribute('data-k') === 'step') f.step = b.getAttribute('data-v'); else f.method = b.getAttribute('data-v'); update(); }
    stepsH.addEventListener('click', pick); chips.addEventListener('click', pick);
    more.addEventListener('click', function () { limit += 25; draw(); });
    onTap(list, 'data-k-row', function (key) { var r = byKey[key]; if (r) trefferSheet(r.s, r.id, S, X); });
    update();
    foot(main, X, sig);
  }

  /* ============================================================ SX07 Forschung */
  var GATE_PLAIN = { HISTORY: 'Kurse über viele Jahre', SURVIVORSHIP: 'Auch Pleite-Firmen enthalten', UNIVERSE_PIT: 'Damalige Aktienauswahl', VOLUME_HISTORY: 'Volumen über viele Jahre', CORPORATE_ACTIONS: 'Splits und Dividenden', EXECUTION_MODEL: 'Ehrliche Kauf- und Verkaufskurse', OUT_OF_SAMPLE: 'Test auf neuen Daten', BASELINES: 'Vergleich mit dem Markt', USAGE_RIGHTS: 'Recht zur Veröffentlichung', INTRADAY_HISTORY: 'Kurse im Tagesverlauf', PIT_FUNDAMENTALS: 'Firmenzahlen zum damaligen Stand', REQUIRED_FIELDS: 'Alle nötigen Daten vorhanden' };
  var STATUS = { DATA_COVERAGE_INSUFFICIENT: ['In Prüfung', 'none'], ADVANCED_RESEARCH: ['In Prüfung', 'none'], NOT_COMPARABLE: ['In Prüfung', 'none'], DATA_COVERAGE_PENDING: ['Daten fehlen', 'weak'], BACKTEST_PENDING: ['Daten fehlen', 'weak'], BACKTEST_READY: ['Bereit zum Test', 'mid'] };
  function gate(g) {
    return '<div class="st-x-cnd st-r-gate"><span class="st-x-cnd-i' + (g.pass ? ' ok' : '') + '">' + U.glyph(g.pass ? 'check' : 'x', 12) + '</span><span><b>' + esc(GATE_PLAIN[g.id] || g.label) + '</b><small>' + esc(g.measured || g.label || '') + '</small></span></div>';
  }
  /* Prüfstand als Punktreihe: ein Feld je Pflichtprüfung, bestanden = neongrün. */
  function gateDots(gs) {
    if (!gs || !gs.length) return '';
    return '<span class="st-k-dots" role="img" aria-label="' + esc(gs.filter(function (g) { return g.pass; }).length + ' von ' + gs.length + ' Pflichtprüfungen bestanden') + '">' + gs.map(function (g) { return '<i' + (g.pass ? ' class="is-on"' : '') + '></i>'; }).join('') + '</span>';
  }
  function backtests(D, X) {
    var bt = D.backtests, pl = D.pilot, reg = D.registry, S = X.stratMap(reg), main = page(X.main, X);
    var runs = (bt.runs || []).filter(function (r) { return r.active; });
    var proven = runs.filter(function (r) { return r.metricsPublishable; }).length;
    var cnt = function (lab) { return runs.filter(function (r) { return (STATUS[r.status] || ['In Prüfung'])[0] === lab; }).length; };
    var parts = [[cnt('In Prüfung'), 'in Prüfung', 'k'], [cnt('Daten fehlen'), 'Daten fehlen', 'm'], [0, 'ohne Vorteil', 'h']];
    var PRINCIPLES = '<ol class="st-r-ol"><li><b>Vorab festgelegt:</b> Universum, Zeitraum, Regeln, Kosten, Vergleich und Erfolgskriterien werden vor dem Test eingefroren.</li><li><b>Damaliges Universum:</b> alle an jedem Tag gelisteten US-Aktien, einschließlich später delisteter Titel.</li><li><b>Delistings ohne Schönrechnen:</b> drei vorab festgelegte Annahmen für den letzten Kurs.</li><li><b>Gleiche Regeln wie täglich:</b> derselbe Rechenkern erzeugt die tägliche Erkennung und die historischen Durchgänge.</li><li><b>Keine Nachoptimierung:</b> eine neue Variante ist eine neue Hypothese und braucht eine spätere, unabhängige Prüfung.</li></ol>';
    append(main, top('Wie belastbar ist welche Methode?', { right: infoBtn('st-k-binfo', 'Forschung') }) +
      tpl('st-k-binfo', '<p class="st-k-plain">Ein Test spielt eine Regel mit alten Kursen durch. Nur ein sauberer Test ist etwas wert.</p><div class="st-k-gap">' + forschTag() + '</div><h3 class="vu-sm st-k-gap16">Fünf Grundsätze jedes Tests</h3>' + PRINCIPLES) +
      '<section class="st-x-today st-k-hero"><div class="st-k-hero-h">' + forschTag() + '</div>' +
      '<div class="st-k-ringrow vu-night">' + U.ring(proven ? proven / runs.length * 100 : null, { size: 84, stroke: 9, text: proven + '/' + runs.length, label: 'Regelversionen mit belegtem Vorteil' }) + '<div><b class="st-x-big vu-num">' + proven + ' von ' + runs.length + '</b><p>Regelversionen mit belegtem Vorteil</p></div></div>' +
      segs(parts, 'Stand der Prüfung') + U.stats(parts.map(function (p) { return { value: n0(p[0]), label: p[1] }; }), { label: 'Stand der Prüfung' }) + '</section>');
    var ref = runs.filter(function (r) { return r.gates && r.gates.length; })[0];
    if (ref) {
      var ok = ref.gates.filter(function (g) { return g.pass; }).length;
      append(main, sh('Was für einen fairen Test fehlt', { right: ok + ' von ' + ref.gates.length + ' erfüllt' }) +
        '<button type="button" class="vu-tap st-k-gates st-r-gates" data-sheet="st-gates" aria-haspopup="dialog"><span class="st-k-gategrid">' + ref.gates.map(function (g) { return '<span class="st-k-gchip' + (g.pass ? ' is-on' : '') + '"><span class="st-x-cnd-i' + (g.pass ? ' ok' : '') + '">' + U.glyph(g.pass ? 'check' : 'x', 12) + '</span><b>' + esc(GATE_PLAIN[g.id] || g.label) + '</b></span>'; }).join('') + '</span>' +
        '<span class="st-k-more">Messwerte je Prüfung ' + U.glyph('next', 13) + '</span></button>');
      addSheet('st-gates', 'Was für einen fairen Test fehlt', '<p class="vu-sm vu-mu">' + ok + ' von ' + ref.gates.length + ' erfüllt. Beispiel: ' + esc(nm(S, ref.strategyId)) + '. Jede Version hat ihren eigenen Prüfstand (unten).</p>' + ref.gates.map(gate).join(''));
    }
    var EV = function (r) { var s = S[r.strategyId] || {}; return (s.evidence && s.evidence.version) || s.strategy_version || '–'; };
    append(main, sh('Stand je Methode', { right: runs.length + ' Regelversionen' }) + '<div class="st-k-list st-k-cols">' + runs.map(function (r, i) {
      var st = STATUS[r.status] || ['In Prüfung', 'none'];
      return '<button type="button" class="vu-tap st-btrow" data-sheet="st-bt-' + i + '" aria-haspopup="dialog"><span class="st-k-row"><span class="st-k-nm"><b>' + esc(nm(S, r.strategyId)) + '</b><span>Version ' + esc(EV(r)) + '</span></span><span class="st-x-kv-r">' + U.verdict(st[1], st[0]) + '</span></span>' + gateDots(r.gates) + '</button>';
    }).join('') + '</div>');
    runs.forEach(function (r, i) {
      var st = STATUS[r.status] || ['In Prüfung', 'none'];
      addSheet('st-bt-' + i, nm(S, r.strategyId) + ' · Version ' + EV(r), '<div class="st-r-mv">' + U.verdict(st[1], st[0]) + ' ' + (r.metricsPublishable ? '' : U.verdict('weak', 'Daten reichen nicht')) + '</div>' +
        '<p class="vu-sm vu-mu">Was der Test zeigte: Eine Kennzahl erscheint erst, wenn alle Pflichtprüfungen bestanden sind.' + (S[r.strategyId] && S[r.strategyId].evidence && S[r.strategyId].evidence.note ? ' ' + esc(X.noRun(S[r.strategyId].evidence.note)) : '') + '</p>' +
        ((r.gates || []).length ? r.gates.map(gate).join('') : U.blank(r.status === 'NOT_COMPARABLE' ? 'Für dieses Musterdepot ist noch kein Prüfstand festgelegt; ein Vergleich wäre nicht fair.' : 'Für diese Version ist noch kein Prüfstand angelegt.')) +
        '<p class="vu-xs vu-mu">Variante: ' + esc(r.label || r.variantId) + '</p>');
    });
    append(main, sh('Mehr zur Forschung'));
    var more = [];
    /* Älterer Pilot als eigener Eintrag (Entscheidung 6): Inhalt und Zahlen unverändert */
    var hasPilot = pl && pl.curves && pl.curves.strategy;
    if (hasPilot) more.push({ id: 'st-pilot', title: 'Älterer Pilot: ' + ((pl.method && pl.method.label) || 'Turtle auf Wochenschlüssen'), sub: 'explorativ, nicht belastbar', glyph: 'line' });
    more.push({ id: 'st-principles', title: 'Fünf Grundsätze jedes Tests', glyph: 'check', html: PRINCIPLES });
    if ((bt.nextSteps || []).length) more.push({ id: 'st-nextsteps', title: 'Nächste Schritte', sub: bt.nextSteps.length + ' Schritte', glyph: 'list', html: '<ol class="st-r-ol">' + bt.nextSteps.map(function (x) { return '<li><b>' + esc(x[0]) + '</b><br>' + esc(x[1]) + '</li>'; }).join('') + '</ol>' });
    chapters(main, more);
    if (hasPilot) {
      var sm = pl.strategy.metrics.full, cmp = pl.comparison, sm2 = pl.strategy.metrics, tr = pl.strategy.trades;
      var shp = addSheet('st-pilot', 'Älterer Pilot · explorativ', '<div class="st-r-gap8">' + U.research() + '</div>' +
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
        if (lg) shp.querySelector('[data-legal]').innerHTML = '<div class="st-r-gap">' + lg + '</div>';
      }
      var drawn = false;
      main.addEventListener('click', function (e) { if (drawn || !(e.target.closest && e.target.closest('[data-sheet="st-pilot"]'))) return; drawn = true; setTimeout(function () { drawChart(shp.querySelector('[data-chart]'), pl.curves.strategy, { lines: [{ points: pl.curves.spy }], extent: pl.curves.spy.map(function (p) { return p[1]; }), label: 'Pilot', height: 170, log: true }); }, 60); });
    }
    append(main, U.next({ title: 'Quellen', sub: 'Woher die Regeln stammen', href: '/supertrader/sources/' }) + note('Keine Anlageberatung.'));
    foot(main, X, D.signals);
  }

  /* ============================================================ ST06 Quellen */
  function sources(D, X) {
    var list = (D.sources && D.sources.sources) || [], reg = D.registry, main = page(X.main, X);
    var nUrl = list.filter(function (x) { return x.url; }).length, nRead = list.filter(function (x) { return x.content_retrieved_by_vu; }).length;
    var withSrc = reg.strategies.filter(function (s) { return (s.sources || []).length; }), mx = Math.max.apply(null, withSrc.map(function (s) { return s.sources.length; }).concat([1]));
    var COPY = 'Bücher sind urheberrechtlich geschützt. Wir zitieren nur Titel und Seiten und übernehmen keine Texte oder Grafiken.';
    var bar = function (n, label, sub) { return '<div class="st-k-ms"><span><b>' + esc(label) + '</b> ' + esc(sub) + '</span>' + U.meter(list.length ? n / list.length * 100 : null, { label: label, lime: true }) + '<b class="vu-num">' + n0(n) + '</b></div>'; };
    append(main, top('Woher die Regeln stammen', { right: infoBtn('st-k-sinfo', 'Quellen') }) +
      tpl('st-k-sinfo', '<p class="st-k-plain">Jede Regel geht auf eine Quelle zurück: Buch, Interview, eigene Website des Traders.</p><div class="st-k-gap">' + U.help(COPY) + '</div><p class="st-k-fine">Titelangaben, Verlag und Lese-Stand je Quelle. Keine Anlageberatung.</p>') +
      '<div class="st-k-card st-k-srcsum"><div class="st-k-ringrow">' + U.ring(list.length ? nRead / list.length * 100 : null, { size: 84, stroke: 9, text: n0(nRead), label: 'Im Volltext gelesen: ' + n0(nRead) + ' von ' + n0(list.length) + ' Quellen' }) + '<div><b class="st-k-big vu-num">' + n0(list.length) + '</b><span class="st-k-cap">Quellen gesamt</span></div></div>' +
      bar(nUrl, 'Mit Adresse', 'verlinkt') + bar(nRead, 'Gelesen', 'im Volltext') + '</div>' +
      sh('Je Methode', { right: withSrc.length + ' Methoden' }) + '<div class="st-k-list st-k-cols st-det-list">' + withSrc.map(function (s, i) {
        return '<button type="button" class="vu-tap st-k-srcm" data-k-src="' + i + '" aria-haspopup="dialog"><span class="st-k-row"><span class="st-k-nm"><b>' + esc(wn(s)) + '</b></span><span class="vu-num st-r-cnt">' + s.sources.length + '</span>' + U.glyph('next', 15) + '</span><span class="st-k-bar" aria-hidden="true"><i style="width:' + (s.sources.length / mx * 100).toFixed(1) + '%"></i></span></button>';
      }).join('') + '</div>' + '<div class="st-k-gap">' + U.help(COPY) + '</div>' +
      U.next({ title: 'Methoden', sub: 'Was sucht welche Methode?', href: '/supertrader/strategies/' }) + note('Titelangaben, Verlag und Lese-Stand je Quelle. Keine Anlageberatung.'));
    onTap(main, 'data-k-src', function (i) { var s = withSrc[+i]; if (!s) return; pop(wn(s), '<p class="vu-sm vu-mu">' + s.sources.length + (s.sources.length === 1 ? ' Quelle' : ' Quellen') + '</p>' + s.sources.map(function (id) { return srcCard(D.srcMap[id] || { title: id }); }).join(''), 'st-k-src'); });
    foot(main, X, D.signals);
  }

  /* ============================================================ SX06 VU Hausstrategie */
  function house(D, X) {
    var L = D.house, main = page(X.main, X);
    var cur = (L && L.current) || {}, hs = cur.holdings || [], last = L && L.decisions && L.decisions.length ? L.decisions[L.decisions.length - 1] : null;
    var w = hs.length ? U.num(hs[0].weight * 100, 0) + ' %' : '–';
    append(main, top('VU Hausstrategie', { right: infoBtn('st-k-hinfo', 'VU Hausstrategie') }) +
      tpl('st-k-hinfo', '<p class="st-k-plain">Große US-Firmen im Aufwärtstrend, mit Kaufdruck im Volumen und starken Quartalszahlen. Die Regeln sind eingefroren.</p><div class="st-k-gap">' + forschTag() + '</div><p class="st-k-fine">Seit ' + dDe(L && L.liveSince) + ' im Vorwärtslauf: jede Entscheidung wird vorher festgeschrieben. Ein Vorteil ist historisch nicht belegt.</p><p class="st-k-fine">Rechenmodell, kein echtes Geld. Keine Anlageberatung.</p>') +
      '<section class="st-x-today st-k-hero st-r-belast"><div class="st-k-hero-h"><span class="vu-ltag">Eigene Regeln</span>' + forschTag() + '</div>' +
      '<b class="st-x-big">' + (hs.length ? hs.length + ' Aktien, je ' + esc(w) : 'VU Hausstrategie') + '</b>' +
      '<p class="st-k-hero-p">Große US-Firmen im Aufwärtstrend, mit Kaufdruck im Volumen und starken Quartalszahlen.</p>' +
      U.stats([{ value: dShort(cur.date), label: 'zuletzt entschieden' }, { value: dShort(L && L.nextDecision), label: 'nächste Entscheidung', tone: 'lime' }], { label: 'Entscheidungen' }) +
      '<p class="st-k-hero-f">Seit ' + dDe(L && L.liveSince) + ' im Vorwärtslauf: jede Entscheidung wird vorher festgeschrieben. Ein Vorteil ist historisch nicht belegt.</p></section>');
    if (!last) append(main, U.blank('Der Start steht bevor. Die erste Entscheidung wird gerade festgeschrieben.'));
    else {
      var isNew = function (t) { return last.kind !== 'START' && (last.buys || []).indexOf(t) >= 0; };
      var chipsOf = function (list) { return (list || []).length ? '<span class="st-k-tks">' + list.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>' : '<span class="vu-mu">–</span>'; };
      append(main, sh('Im Musterdepot', last.kind !== 'START' ? { right: 'neu am ' + dShort(last.date) + ' markiert' } : null) + '<div class="st-x-hsg st-k-hsg">' + hs.map(function (x) { return '<a class="' + (isNew(x.ticker) ? 'is-new' : '') + '" href="' + esc(stockHref(x.ticker)) + '">' + U.logo(x.ticker) + '<span>' + esc(x.ticker) + '</span></a>'; }).join('') + '</div>' +
        '<div class="st-r-gap">' + U.help('Veröffentlicht werden Titel und Gewichte, keine Renditen. Umsetzung zur Eröffnung am ' + (last.executeOn ? dDe(last.executeOn) : 'nächsten Handelstag') + '.') + '</div>' +
        sh('Protokoll', { right: L.decisions.length + (L.decisions.length === 1 ? ' Entscheidung' : ' Entscheidungen') }) + L.decisions.slice().reverse().map(function (d) {
          var start = d.kind === 'START' || !(d.sells || []).length && L.decisions.indexOf(d) === 0;
          return '<div class="st-k-card st-r-dec"><div class="st-k-row"><span class="st-k-nm"><b>' + dDe(d.date) + ' · ' + (start ? 'Start' : 'Monatsende') + '</b><span>festgeschrieben ' + dDe(d.decidedAt) + '</span></span>' +
            '<span class="st-k-inout"><b class="vu-num">+' + (d.buys || []).length + '</b>' + (start ? '' : '<b class="vu-num is-out">−' + (d.sells || []).length + '</b>') + '</span></div>' +
            '<p class="st-k-io"><b>Rein:</b> ' + chipsOf(d.buys) + '</p>' + (start ? '' : '<p class="st-k-io"><b>Raus:</b> ' + chipsOf(d.sells) + '</p>') + '</div>';
        }).join(''));
    }
    var rules = (L && L.rules) || [], hist = X.HOUSE_HISTORY || [], keys = ['H1', 'H2', 'H4', 'G', '→'];
    var RULE_T = ['Universum', 'Filter', 'Rang', 'Musterdepot', 'Termin'];
    append(main, sh('Die ' + rules.length + ' Regeln') + '<div class="st-k-card st-x-card--rows">' + rules.map(function (r, i) { var p = String(r).split(': '); return '<div class="st-x-rule"><span class="st-x-stepn">' + (i + 1) + '</span><span><b>' + esc(p.length > 1 ? (p[0] === 'Depot' ? 'Musterdepot' : p[0]) : (RULE_T[i] || 'Regel ' + (i + 1))) + '</b><span>' + esc(p.length > 1 ? p.slice(1).join(': ') : r) + '</span></span></div>'; }).join('') + '</div>');
    chapters(main, [{ id: 'st-house-hist', title: 'Wie wir hierhin gekommen sind', sub: 'Ehrliche Prüfgeschichte der Hausstrategie', glyph: 'book', html: '<p class="vu-sm vu-mu">Ehrliche Prüfgeschichte der Hausstrategie.</p>' + hist.map(function (x, i) { return step(keys[i] || String(i + 1), x[0].replace(/\s*\([^)]*\)$/, ''), x[1]); }).join('') }]);
    append(main, U.next({ title: 'Forschung', sub: 'Wie belastbar ist welche Methode?', href: '/supertrader/forschung/' }) + '<p class="st-x-foot">Rechenmodell, kein echtes Geld. Keine Anlageberatung.</p>');
    foot(main, X, D.signals);
  }
  /* ============================================================ SX09 Historisches Beispiel (/supertrader/beispiel/)
     Ein abgeschlossener Zyklus der älteren Turtle-Regelversion an echten Kursen (replay.json). Gleiche Werte, Sätze und
     Kennzeichnungen wie die bisherige Ansicht (supertrader.js#renderReplay); der Chart bleibt der Kerzenchart aus st-chart.js. */
  var KIND_LABEL = { CHANNEL_EXIT: 'Abgabe über die Kanalregel', STOP: 'Abgabe an der Ungültig-Marke' };
  function replay(D, X) {
    var rp = D.replay, S = X.stratMap(D.registry), main = page(X.main, X), sig = D.signals;
    var px = function (v) { return isNum(v) ? U.num(v, 2) : '–'; };
    main.classList.add('st-k-replay');
    append(main, '<header class="st-k-hero st-k-rhero"><div class="st-k-hero-h"><span class="st-x-tag">Historisches Beispiel</span></div><h1 class="vu-lt st-k-h1">So läuft ein Modell-Zyklus ab</h1>' +
      '<p class="st-k-hero-p">' + esc('Ein vergangenes Beispiel, an echten Kursen nachgespielt – Schritt für Schritt. Es folgt der älteren Turtle-Regelversion ' + ((rp && rp.engine && rp.engine.version) || '') + ' (Bestätigung per Schlusskurs); die laufende Version nimmt im Tagesverlauf an der Zone auf und unterscheidet sich bei Aufnahme und Abgabe.') + '</p></header>');
    if (!rp || !rp.examples || !rp.examples.length) {
      append(main, '<div class="vu-blank st-k-gap"><span><b>Kein Beispiel verfügbar</b> Im vorhandenen Kurszeitraum gibt es keinen vollständig abgeschlossenen Zyklus.</span></div>');
      foot(main, X, sig); return;
    }
    var strat = S[rp.engine.strategyId], mName = strat ? wn(strat) : '';
    append(main, '<div class="st-demo-banner st-k-box st-k-gap"><span class="st-k-rinfo" aria-hidden="true">i</span><div><strong>' + esc(rp.labelText) + '</strong><span>' + esc('Nicht im Protokoll der Musterdepots, in keiner Kennzahl, kein Rat. Auswahl nach fester Regel, nicht nach Ergebnis: ' + rp.selection) + '</span></div></div>' +
      '<div class="st-x-chips st-k-chips st-r-chips" role="group" aria-label="Beispiel" data-tabs>' + rp.examples.map(function (ex, i) { return '<button type="button" class="vu-chip" data-ex="' + i + '" aria-pressed="false">' + esc(ex.symbol + ' · ' + (ex.kind === 'STOP' ? 'Ungültig-Marke' : 'Kanalregel')) + '</button>'; }).join('') + '</div>' +
      '<div data-panel></div>');
    var tabs = main.querySelector('[data-tabs]'), panel = main.querySelector('[data-panel]');
    function show(ix) {
      var ex = rp.examples[ix]; if (!ex) return;
      Array.prototype.forEach.call(tabs.children, function (b, i) { b.setAttribute('aria-pressed', String(i === ix)); });
      var sg = ex.signal, tr = sg.transitions || [], r = ex.result, ex1 = r.exit;
      var first = tr[0], conf = tr.filter(function (t) { return t.state === 'TRIGGERED'; })[0], ent = tr.filter(function (t) { return t.state === 'ACTIVE' && t.ruleId === 'LC-MODEL-ENTRY'; })[0];
      var steps = [
        [first.date, 'Vorbereitet', 'Liquide Aktie nahe dem 20-Tage-Hoch. Geplante Zone ' + px(first.trigger || ex.checks.triggerAtConfirmation) + ', ungültig unter ' + px(first.invalidation) + '.'],
        conf ? [conf.date, 'Zone erreicht', 'Tagesschluss ' + px(ex.checks.confirmationClose) + ' über der Zone ' + px(ex.checks.triggerAtConfirmation) + '. Aufgenommen wird erst am nächsten Morgen.'] : null,
        ent ? [ent.date, 'Aufnahme zur Eröffnung', 'Eröffnung ' + px(ex.checks.entryRawOpen) + ' + ' + px((r.entry.price / ex.checks.entryRawOpen - 1) * 100) + ' % Ausführungsannahme = ' + px(r.entry.price) + '. Ungültig-Marke ' + px(sg.initialStop) + ' (2 × Tagesspanne N darunter).'] : null,
        [ex1.date, KIND_LABEL[ex.kind] || 'Abgabe', (ex.kind === 'STOP' ? (ex.checks.exitBasis === 'OPEN_BELOW_STOP' ? 'Eröffnung unter der Ungültig-Marke – Abgabe zum Eröffnungskurs ' + px(ex1.price) + ' (Gap-Regel).' : 'Ungültig-Marke unterschritten – Abgabe zu ' + px(ex1.price) + '.') : 'Schluss unter dem 10-Tage-Tief → Abgabe zur nächsten Eröffnung ' + px(ex1.price) + '.')]
      ].filter(Boolean);
      var res = isNum(r.returnBeforeCosts) ? (r.returnBeforeCosts > 0 ? '+' : '') + U.num(r.returnBeforeCosts * 100, 1) + ' %' : '–';
      /* Protokoll: jeder Zustandswechsel mit Regel und Kurs (Wortlaut der Regel aus supertrader.js#ruleText) */
      var prot = tr.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) { return String(b.t.date || '').localeCompare(String(a.t.date || '')) || b.i - a.i; });
      panel.innerHTML = '<section class="st-k-card st-k-gap st-k-rres"><span class="st-k-row">' + U.logo(ex.symbol) + '<span class="st-k-nm st-k-nm--wrap"><b>' + esc(ex.symbol) + '</b><span>' + esc(KIND_LABEL[ex.kind] || '') + '</span></span>' + stateVerdict('CLOSED') + '</span>' +
        (F ? F.dep(3) : '') +
        zoneBar([{ v: sg.initialStop, label: 'Ungültig-Marke', sub: '2N unter der Aufnahme' }, { v: r.entry.price, label: 'Aufnahme', cls: 'z', sub: dShort(r.entry.date) + ' Eröffnung' }, { v: ex1.price, label: 'Abgabe', cls: 'me', sub: dShort(ex1.date) }], { fmt: px, key: true }) +
        '<div class="st-k-rout"><span class="vu-ltag">Ergebnis dieses Beispiels</span><p><b class="vu-num">' + esc(res) + '</b>' + esc(' vor Kosten nach ' + r.sessionsHeld + ' Handelstag' + (r.sessionsHeld === 1 ? '' : 'en') + '.') + '</p><span class="st-k-fine">Ein Einzelfall – keine Aussage über die Methode.</span></div></section>' +
        sh('Ablauf') + U.rail(steps.map(function (x, i) { return '<div class="st-x-card st-x-think st-k-rstep"><span class="st-k-row"><span class="st-x-stepn">' + (i + 1) + '</span><span class="vu-ltag vu-num">' + dDe(x[0]) + '</span></span><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div>'; }), { label: 'Ablauf', width: 236 }) +
        sh(ex.symbol + ' im Chart', { right: 'Echte Tageskurse' }) + '<div class="st-k-rchart" data-chart></div>' +
        sh('Protokoll', { right: 'Jeder Zustandswechsel mit Regel und Kurs' }) +
        '<ol class="st-x-tl st-r-tl st-k-card st-k-rprot">' + prot.map(function (e) {
          var t = e.t;
          return '<li data-st="' + esc(t.state) + '"><i></i><div><b>' + dShort(t.date) + ' · ' + esc(stateName(t.state)) + '</b><span>' + esc((mName ? mName + ' · ' : '') + X.ruleText(t.ruleId) + (isNum(t.price) ? ' · Kurs ' + px(t.price) : '')) + '</span></div></li>';
        }).join('') + '</ol>';
      var host = panel.querySelector('[data-chart]'), C = window.STChart;
      if (C) C.loadBars(ex.chart.shard, ex.symbol).then(function (bars) {
        var a = bars.date.indexOf(ex.window.from), b = bars.date.indexOf(ex.window.to);
        if (a < 0) a = 0; if (b < 0) b = bars.date.length - 1;
        var cut = {}; Object.keys(bars).forEach(function (k) { cut[k] = Array.isArray(bars[k]) ? bars[k].slice(a, b + 1) : bars[k]; });
        var box = document.createElement('div'); box.className = 'st-chartbox'; host.appendChild(box);
        var markers = [];
        if (sg.confirmation) markers.push({ date: sg.confirmation.date, price: sg.confirmation.close, kind: 'confirm' });
        markers.push({ date: r.entry.date, price: r.entry.price, kind: 'entry' });
        markers.push({ date: ex1.date, price: ex1.price, kind: 'exit' });
        C.render(box, { bars: cut, mode: 'candles', window: cut.date.length, overlays: [], levels: [{ id: 'trig', label: 'Zone', value: ex.checks.triggerAtConfirmation, color: 'var(--chart-trigger)' }, { id: 'stop', label: 'Ungültig', value: sg.initialStop, color: 'var(--chart-stop)', dash: '2 4' }], boxes: [], markers: markers, showVolume: true, title: ex.symbol, status: 'Historisch: ' + dDe(ex.window.from) + ' – ' + dDe(ex.window.to) + '. Kein aktueller Treffer.' });
      }).catch(function () { host.innerHTML = '<div class="vu-blank"><span><b>Chart nicht verfügbar</b> Die Kursdaten konnten nicht geladen werden.</span></div>'; });
    }
    tabs.addEventListener('click', function (e) { var b = e.target.closest('button[data-ex]'); if (b) show(+b.getAttribute('data-ex')); });
    show(0);
    append(main, U.next({ title: 'Treffer', sub: 'Wo steht welche Aktie im Ablauf?', href: '/supertrader/treffer/' }));
    foot(main, X, sig);
  }

  function step(n, t, s) { return '<div class="st-r-stp"><span class="st-r-num">' + esc(n) + '</span><div><b>' + esc(t) + '</b>' + (s ? '<span>' + esc(s) + '</span>' : '') + '</div></div>'; }

  /* ------------------------------------------------ Aktie nach dem Klickentwurf: Karte je erkannter Methode */
  function checkDot(ok) { return '<span class="st-k2-dot' + (ok ? ' is-ok' : '') + '" aria-label="' + (ok ? 'ja' : 'nein') + '">' + (ok ? '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</span>'; }
  /* Muster der Methode in Worten (Feld pattern der Datei); fehlt eines, steht der Satz der Methode aus summary.json (recognises). */
  var PATTERN_TXT = {
    TURTLE_S1_20D_BREAKOUT: 'Ausbruch über das 20-Tage-Hoch', TURTLE_S1_FAILSAFE_55D_BREAKOUT: 'Ausbruch über das 55-Tage-Hoch (Failsafe)', TURTLE_S2_55D_BREAKOUT: 'Ausbruch über das 55-Tage-Hoch',
    DARVAS_COMPLETE_BOX_AT_WINDOW_HIGH: 'Vollständige Box am Hoch', WEINSTEIN_STAGE2_BASE_BREAKOUT_WEEK: 'Stufe 2 · Ausbruch aus der Basis', WEINSTEIN_STAGE2_CONTINUATION_BREAKOUT_WEEK: 'Stufe 2 · Fortsetzung',
    MINERVINI_TREND_TEMPLATE_1_7: 'Trend-Vorlage, Punkte 1 bis 7', MINERVINI_POWER_PLAY_FLAG: 'Flagge nach starkem Anstieg', KK_DAILY_BREAKOUT_SETUP_PROXY_CONSOLIDATION_10: 'Enge Pause nach starkem Lauf',
    KK_EP_CHART_GAP_10PCT: 'Kurslücke von mindestens 10 %', MOKA_POCKET_PIVOT_VOLUME_SIGNATURE: 'Aufwärtstag mit hohem Volumen', MOKA_BUYABLE_GAP_UP: 'Kurslücke nach oben mit hohem Volumen',
    RASCHKE_HOLY_GRAIL_EMA20_PULLBACK: 'Rücksetzer an die 20-Tage-Linie'
  };
  /* Kennwerte als Haken: Weinstein (C04, C05) aus features wie im Entwurf; sonst die Regeln der Methode (met/pending/notMet, Namen aus ruleLabels). */
  function methodChecks(v, L) {
    var f = v.features || {}, out = [];
    if (v.candidateId === 'C04' || v.candidateId === 'C05') {
      if (isNum(f.closeVsMa30w)) out.push([f.closeVsMa30w > 0, 'Kurs ' + U.num(Math.abs(f.closeVsMa30w) * 100, 1) + ' % ' + (f.closeVsMa30w > 0 ? 'über' : 'unter') + ' der 30-Wochen-Linie' + (isNum(f.ma30w) ? ' (' + usd(f.ma30w) + ')' : '')]);
      if (isNum(f.ma30wSlope4w)) out.push([f.ma30wSlope4w > 0, '30-Wochen-Linie ' + (f.ma30wSlope4w > 0 ? 'steigt' : f.ma30wSlope4w < 0 ? 'fällt' : 'flach') + ' (' + U.pct(f.ma30wSlope4w * 100, 1) + ' in 4 Wochen)']);
      if (typeof f.rsImproving === 'boolean') out.push([f.rsImproving, 'Relative Stärke verbessert sich']);
      if (typeof f.volumeConfirmedAny === 'boolean') out.push([f.volumeConfirmedAny, 'Höherer Handel bestätigt den Ausbruch']);
      if (out.length) return out;
    }
    var lab = function (id) { return (L && L[id]) || id; };
    (v.met || []).forEach(function (id) { out.push([true, lab(id)]); });
    (v.pending || []).forEach(function (id) { out.push([false, lab(id) + ' (offen)']); });
    (v.notMet || []).forEach(function (id) { out.push([false, lab(id)]); });
    return out;
  }
  function methodCard(v, name, strat, sum) {
    if (!v) return '';
    var f = v.features || {}, wk = /W(\d+)$/.exec(f.breakoutWeek || ''), st = sum.stageLabels && sum.stageLabels[v.stage];
    var sub = wk ? 'Ausbruchswoche ' + (+wk[1]) + (f.breakoutDay ? ' · ' + dDe(f.breakoutDay) : '') : 'Stand ' + dDe(v.asOf);
    var checks = methodChecks(v, sum.ruleLabels);
    return sh(name) + '<div class="st-k2-mcard"><div class="st-k2-mh"><div><b>' + esc(PATTERN_TXT[v.pattern] || (strat && strat.recognises) || name) + '</b><span>' + esc(sub) + '</span></div><span class="st-k2-tag">Forschung</span></div>' +
      checks.map(function (c) { return '<div class="st-k2-chk' + (c[0] ? ' is-ok' : '') + '">' + checkDot(c[0]) + '<span>' + esc(c[1]) + '</span></div>'; }).join('') +
      '<p class="st-k2-mf">' + esc((st ? 'Stand im Ablauf: ' + st.name + '. ' : '') + (v.plan ? '' : 'Kein fertiger Plan, ') + 'Forschung, nicht zertifiziert.') + '</p></div>';
  }

  /* ============================================================ ST08 Aktie, Perspektive „Methoden“ */
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
    /* Klickentwurf (Owner 17.11.2026): Pillen „Diese Aktie in anderen Modulen“ zwischen Daten & Methodik und dem Rechtssatz. */
    var othersSlot = document.createElement('div'); othersSlot.className = 'st-k2-others';
    var exchange = null, headOpts = null;
    var headApi = kit.then(function () { var ctx = window.VUCore.StockContext.fromUs(sym); return window.VUStockNavigator.head(headHost, headOpts = { ctx: ctx, current: 'supertrader', name: name || sym, pendingPrice: true, back: { href: '/supertrader/treffer/', label: 'Treffer' }, others: othersSlot }); }).catch(function () { return null; });
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

    /* Supertrader in drei Sätzen · Alle 13 Methoden · Protokoll */
    var answer = document.createElement('div'); answer.className = 'st-r-answer-slot st-r-pending-answer'; answer.setAttribute('aria-busy', 'true');
    var sfP = identity(X).then(function () { return X.getJSON('sf-candidates/summary.json'); }).then(function (sum) {
      var shard = window.VUCore.Identity.shardKey(sym);
      return ((sum.tickerShards || []).indexOf(shard) >= 0 ? X.getJSON('sf-candidates/ticker/' + shard + '.json') : Promise.resolve({ views: [] })).then(function (t) { return { sum: sum, views: (t.views || []).filter(function (v) { return v.ticker === sym; }) }; });
    });
    var label = name || sym;
    /* Offene Position im Musterdepot zuerst (Owner-Wunsch 07.11.2026: Leiste ohne Scrollen sichtbar) */
    var held = open.filter(function (e) { return e.s.entry; }), waiting = open.filter(function (e) { return !e.s.entry; });
    if (held.length) append(main, sh('Im Musterdepot') + held.map(function (e) { return sigCard(e.s, nm(S, e.id)); }).join(''));
    if (waiting.length) append(main, sh('Wartet im Musterdepot') + waiting.map(function (e) { return sigCard(e.s, nm(S, e.id)); }).join(''));
    main.appendChild(answer);
    answer.innerHTML = '<span class="vu-visually-hidden">Die 13 Methoden werden geprüft …</span>' + U.skeleton('card');
    var rest = document.createElement('div'); main.appendChild(rest);
    var allHost = document.createElement('div'); rest.appendChild(allHost);

    /* Letzter abgeschlossener Durchgang (für „Zuletzt“) */
    var cyc = null, cycIds = [];
    entries.forEach(function (e) { var c = cycle(e.s); if (c && c.out && (!cyc || c.inn.date > cyc.inn.date)) cyc = { inn: c.inn, out: c.out }; });
    if (cyc) entries.forEach(function (e) { var c = cycle(e.s); if (c && c.out && c.inn.date === cyc.inn.date) { cycIds.push(nm(S, e.id)); if (c.out.date > cyc.out.date) cyc.out = c.out; } });
    /* Protokoll als Zeitleiste: die jüngsten fünf auf der Seite, ältere im Fenster */
    var evs = eventsOf(entries, S);
    if (evs.length) {
      append(rest, sh('Protokoll', evs.length > 5 ? { right: '<button type="button" class="st-k-linkbtn" data-sheet="st-older" aria-haspopup="dialog">Ältere (' + (evs.length - 5) + ') ' + U.glyph('next', 13) + '</button>' } : null) + '<div class="st-k-card">' + timeline(evs.slice(0, 5)) + '</div>' +
        '<div class="st-r-gap">' + U.help('Das Musterdepot ist ein Rechenmodell. Es zeigt, was die Regel getan hätte, nicht was du tun solltest.') + '</div>');
      if (evs.length > 5) addSheet('st-older', 'Protokoll · ältere Einträge', timeline(evs.slice(5)));
    }
    var t52 = X.trend52For(D, sym);
    if (t52 && !entries.length) priced();
    if (t52) append(rest, '<a class="vu-tap st-r-t52 st-research" href="/supertrader/strategies/vu-trendfolge-52w/"><span class="st-k-row"><span class="st-k-nm"><b>VU Trendfolge 52W</b><span>' + esc(t52[2]) + '</span></span>' + U.verdict(t52[1] === 'good' ? 'mid' : 'none', t52[0]) + '</span></a>');
    var pcs = [];
    ['CANSLIM', 'PIOTROSKI_F'].forEach(function (id) { var pc = sig.partialChecks && sig.partialChecks[id]; if (pc) (pc.candidates.concat(pc.near || [])).forEach(function (r) { if (r.symbol === sym && pcs.indexOf(nm(S, id)) < 0) pcs.push(nm(S, id)); }); });
    if (pcs.length) append(rest, '<div class="st-k-card st-k-gap st-critlist">' + U.verdict('none', 'Teiltreffer') + ' <span class="vu-sm">' + esc(pcs.join(', ')) + ': ein Teil der prüfbaren Kriterien ist erfüllt.</span></div>');
    append(rest, U.next({ title: 'Treffer: Wo steht welche Aktie im Ablauf?', href: '/supertrader/treffer/' }));
    foot(rest, X, sig);
    var legal = rest.querySelector('.st-foot .st-legal');
    if (legal) legal.parentNode.insertBefore(othersSlot, legal); else rest.appendChild(othersSlot);

    var MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    var NUM = ['keinem', 'einem', 'zwei', 'drei', 'vier', 'fünf'];
    sfP.then(function (r) {
      answer.classList.remove('st-r-pending-answer'); answer.setAttribute('aria-busy', 'false');
      var sum = r.sum, vs = r.views, hit = {};
      vs.forEach(function (v) { if (!hit[v.candidateId] || STAGES.indexOf(v.stage) > STAGES.indexOf(hit[v.candidateId])) hit[v.candidateId] = v.stage; });
      var hitIds = Object.keys(hit), nHit = hitIds.length, SM = {}, nAll = sum.strategies.length; sum.strategies.forEach(function (s) { SM[s.candidateId] = s; });
      var top1 = STAGES.filter(function (k) { return vs.some(function (v) { return v.stage === k; }); }).pop();
      var names = hitIds.map(function (c) { return cnId(SM, c); });
      var today = nHit ? nHit + ' von ' + nAll + ' Methoden ' + (nHit === 1 ? 'erkennt ' : 'erkennen ') + label + ': ' + (names.length <= 2 ? names.join(' und ') : names.slice(0, 2).join(', ') + ' und ' + (names.length - 2) + ' weitere') + '.' : 'Keine der ' + nAll + ' Methoden erkennt ' + label + ' gerade.';
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
      /* Klickentwurf (Owner 17.11.2026): Ring-Karte, „Supertrader in drei Sätzen“ als Schiene, je erkannter Methode eine Karte
         mit Haken, „Alle 13 Methoden“ als Zeilen. Wortwahl nur „Regel erfüllt laut Methode“; die Stufe der Methode steht sachlich
         als „Stand im Ablauf“ (Stufenname aus summary.json), nie als Urteil. */
      var RULE = 'Regel erfüllt laut Methode';
      var ringT = nHit ? nHit + ' von ' + nAll + ' Methoden' : 'Keine der ' + nAll + ' Methoden';
      var heute = nHit ? nHit + ' von ' + nAll + ' Methoden ' + (nHit === 1 ? 'erkennt ' : 'erkennen ') + label + ': ' + (names.length <= 2 ? names.join(' und ') : names.slice(0, 2).join(', ') + ' und ' + (names.length - 2) + ' weitere') + ' (' + RULE + ').' : today;
      var card3 = function (tag, big, text, cls) { return '<div class="st-k2-c3' + (cls ? ' ' + cls : '') + '"><span class="vu-ltag">' + esc(tag) + '</span><b class="st-k2-big">' + big + '</b><p>' + esc(text) + '</p></div>'; };
      var depWord = held.length ? 'Im Musterdepot' : waiting.length ? (F ? F.wordOfState(waiting[0].s.state) : 'Wartet') : '○ Nicht dabei';
      answer.innerHTML = '<div class="st-k2-ringcard st-r-answer">' + U.ring(nHit ? nHit / nAll * 100 : null, { size: 96, stroke: 11, text: nHit + '/' + nAll, label: nHit + ' von ' + nAll + ' Methoden: ' + RULE }) +
        '<div><div class="vu-ltag">Supertrader · ' + dShort(sum.asOf) + '</div><b>' + esc(ringT) + '</b><p>' + esc(nHit ? RULE + ' bei ' + names.join(', ') : 'Heute ist bei keiner Methode eine Regel erfüllt.') + '</p></div></div>' +
        sh('Supertrader in drei Sätzen') +
        U.rail([card3('Heute', esc(nHit ? 'Regel erfüllt' : 'Keine Regel erfüllt'), heute, nHit ? 'is-lime' : ''),
          card3('Musterdepot', esc(depWord), depT),
          card3('Zuletzt', lastV ? '<span class="st-k2-res">' + lastV + '</span>' : esc(cyc ? 'Abgegeben' : 'Noch offen'), lastT)], { label: 'Supertrader in drei Sätzen', width: 250 });
      if (nHit && !entries.length) priced();
      if (!nHit && !entries.length && !t52) headApi.then(function (h) { if (h) h.setPrice(null); headHost.classList.remove('st-r-pending-head'); });
      /* Je erkannter Methode: Muster der Methode, Kennwerte als Haken (aus der Datei der Aktie, sf-candidates/ticker/), Stand im Ablauf. */
      var best = {}; vs.forEach(function (v) { if (!best[v.candidateId] || STAGES.indexOf(v.stage) > STAGES.indexOf(best[v.candidateId].stage)) best[v.candidateId] = v; });
      var detail = hitIds.map(function (c) { return methodCard(best[c], cnId(SM, c), SM[c], sum); }).join('');
      /* Börse für die Kopfzeile (Entwurf: „… · TTWO · NASDAQ“) aus derselben Datei der Aktie */
      vs.some(function (v) { if (typeof v.exchange === 'string' && /^[A-Za-z][A-Za-z .-]{1,20}$/.test(v.exchange)) { exchange = v.exchange; return true; } return false; });
      if (exchange) headApi.then(function (h) { if (headOpts) headOpts.exchange = exchange; var mt = h && h.el && h.el.querySelector('.vu-shead-meta'); if (mt && !mt.children.length && mt.textContent.split(' · ').indexOf(exchange) < 0) mt.textContent += ' · ' + exchange; });
      /* Alle Methoden als Zeilen: erkannte zuerst, mit Haken und „Regel erfüllt laut Methode“ */
      var list = sum.strategies.slice().sort(function (a, b) { return (hit[b.candidateId] ? 1 : 0) - (hit[a.candidateId] ? 1 : 0) || STAGES.indexOf(hit[b.candidateId]) - STAGES.indexOf(hit[a.candidateId]) || b.counts.published - a.counts.published; });
      var row = function (s) { var h = hit[s.candidateId]; return '<a class="st-k2-mrow' + (h ? ' is-hit' : '') + '" href="' + esc(N ? N.href(s.candidateId) : '/supertrader/strategies/?sf=' + s.candidateId) + '">' + checkDot(!!h) + '<span class="st-k2-mn">' + esc(cn(s)) + '</span>' + (h ? '<span class="st-k2-pill">' + RULE + '</span>' : '<span class="st-k2-no">nein</span>') + '</a>'; };
      allHost.innerHTML = detail + sh('Alle ' + list.length + ' Methoden', { right: nHit ? nHit + ' erkenn' + (nHit === 1 ? 't' : 'en') : 'keine erkennt' }) + '<div class="st-k2-list">' + list.map(row).join('') + '</div>' +
        note('Erkennung auf Schlusskursen vom ' + dDe(sum.asOf) + '.');
    }).catch(function () { answer.classList.remove('st-r-pending-answer'); answer.setAttribute('aria-busy', 'false'); headHost.classList.remove('st-r-pending-head'); answer.innerHTML = U.blank('Die 13 Methoden sind für ' + sym + ' gerade nicht erreichbar.'); });
  }

  window.STRedesign = { version: 'st-redesign-2.1.1', STATE: STATE, render: { home: home, strategies: strategies, strategy: strategy, signals: signals, backtests: backtests, sources: sources, house: house, stock: stock, replay: replay },
    /* Bausteine dieser Oberfläche für die Kandidatenliste einer Methode (sf-research.js): gleiche Kacheln, Leisten und Fenster. */
    kit: { version: 1, page: page, sh: sh, tpl: tpl, infoBtn: infoBtn, monoHtml: monoHtml, segs: segs, segLegend: segLegend, zoneBar: zoneBar, chapters: chapters, onTap: onTap, methodMeta: methodMeta } };
  /* Jede Ansicht kennt vor dem Zeichnen die ausgewiesenen Titel (siehe UNAVAILABLE). */
  Object.keys(window.STRedesign.render).forEach(function (k) {
    var f = window.STRedesign.render[k];
    window.STRedesign.render[k] = function (D) { noteAvailability(D); return f.apply(this, arguments); };
  });
})();
