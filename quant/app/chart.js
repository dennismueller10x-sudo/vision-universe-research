/* =========================================================================
   VISION UNIVERSE QUANT — app/chart.js                   (quant-chart-1.2.0)

   EIN CHART. ALLE ZEITRAEUME. DERSELBE WIE IN DISCOVER.

   VU3 (quant-chart-1.2.0): gezeichnet wird mit dem gemeinsamen Kurschart
   assets/vu-chart.js (VUChart.render) - ohne Rahmen, ohne zweiten Kurs
   ueber dem Bild. Datenquellen und Zeitraeume unten sind unveraendert.

   Vorher zeigte die Aktienseite oben einen Chart, der fuer 1T "nicht
   verfuegbar" sagte, und weiter unten einen zweiten Tagesverlauf. Zwei
   Charts derselben Aktie mit zwei Aussagen ueber dieselben Daten.

   Jetzt gibt es genau einen Chart. Er zeichnet mit den Komponenten, die
   Discover in Produktion benutzt - unveraendert und nur gelesen:

     VUDiscover.MicroChart.renderRange     Zeitraum-Chart (Tagesschluss)
     VUDiscover.MicroChart.renderIntraday  Tagesverlauf (5-Minuten-Kurse)
     VUDiscover.LiveHub.subscribe          veroeffentlichter Tagesverlauf (Snapshot)
     VULiveRelayClient                     Live-Strom, nur bestaetigte Trades
     VURealtime.SourceState.bestimme       Etikett und Fussnote des Tages

   1T nimmt den veroeffentlichten Intraday-Snapshot; ist die Boerse offen
   und der Live-Strom verfuegbar, schreibt jeder neue Kurs DENSELBEN Chart
   fort. Kein zweiter Chart, kein zweiter Weg.

   Den Live-Kurs liefert Quants eigener Relay-Client (chartMovement
   TRADE_EVENTS_ONLY), nicht der Strom des Discover-Hubs: der Hub uebernimmt
   jeden Preis einer Nachricht, auch ein Kursangebot (QUOTE). Gemessen am
   01.10.2026 bei offenem Handelstag: ein QUOTE setzte den Kurs im Kopf von
   354,67 $ auf 9.999,00 $. Den Kurs bewegt nur ein bestaetigter Trade.

   5T: aufbewahrt werden nur zwei Intraday-Sitzungen - fuenf Tage
   5-Minuten-Kurse gibt es nicht. 5T zeigt deshalb die Tagesschlusskurse
   der letzten Handelstage und sagt das in der Bildunterschrift.

   Historische Zeitraeume: die kanonische, splitbereinigte Tagesreihe der
   Product Services (Return Contract: SPLIT_ADJUSTED_PRICE). Fuer 3J, 5J,
   10J und Max wird, wo vorhanden, die lange Wochenreihe vorangestellt.

   Ein Zeitraum gilt nur, wenn die Reihe ihn abdeckt (VUCore.ChartHistory,
   dieselbe 95-%-Regel wie Discover). Vorher reichte "zwei Punkte im
   Fenster": 3J lud nur die 1-Jahres-Tagesreihe, und PLTR zeigte am
   13.10.2026 "+22,75 % in 3 Jahren" ueber 16.09.2025 - 12.10.2026 statt
   rund +1.104 % ueber drei Jahre. Ein Zeitraum, den die Reihe nicht
   abdeckt, wird abgeschaltet und nennt keine Rendite; waehrend die lange
   Reihe laedt, steht nicht die kurze unter dem langen Etikett.
   ========================================================================= */
(function (global) {
  "use strict";

  var VERSION = "quant-chart-1.3.0";
  /* Reihenfolge und Beschriftung nach dem Chartstandard (core/chart-standard.js,
     docs/charts/CHART_STANDARD.md): Hauptleiste 1T 1W 1M 1J 5J MAX, die weiteren
     Zeitraeume dieser Welt dahinter. Die Beschriftung IST die kanonische Kennung;
     die Kennungen (id) bleiben. */
  var RANGES = [
    { id: "1D", label: "1T", word: "heute" },
    { id: "5D", label: "1W", days: 7, word: "in 1 Woche" },
    { id: "1M", label: "1M", days: 31, word: "in 1 Monat" },
    { id: "1Y", label: "1J", days: 366, word: "in 1 Jahr" },
    { id: "5Y", label: "5J", days: 1827, word: "in 5 Jahren", long: true },
    { id: "MAX", label: "MAX", all: true, word: "seit Beginn der Reihe", long: true },
    { id: "3M", label: "3M", days: 92, word: "in 3 Monaten" },
    { id: "6M", label: "6M", days: 183, word: "in 6 Monaten" },
    { id: "YTD", label: "YTD", ytd: true, word: "seit Jahresbeginn" },
    { id: "3Y", label: "3J", days: 1096, word: "in 3 Jahren", long: true },
    { id: "10Y", label: "10J", days: 3653, word: "in 10 Jahren", long: true }
  ];
  /* Gemerkte Wahl des Nutzers, ein Schluessel fuer alle Welten (ChartStandard.RANGE_KEY).
     Sie wird gelesen, bevor der Chartstandard nachgeladen ist; die Beschriftung ist die
     kanonische Kennung, daher keine eigene Uebersetzung. */
  var RANGE_KEY = "vu-chart-range-v1";
  function rememberedRange() {
    try { var v = global.localStorage && global.localStorage.getItem(RANGE_KEY); return v ? RANGES.filter(function (r) { return r.label === v; })[0] || null : null; }
    catch (e) { return null; }
  }
  function rememberRange(r) {
    var CS = global.VUCore && global.VUCore.ChartStandard;
    if (CS) { CS.rememberRange(r.label); return; }
    try { if (global.localStorage) global.localStorage.setItem(RANGE_KEY, r.label); } catch (e) { /* ohne Gedaechtnis weiter */ }
  }
  /* Anzeigewaehrung (Vorgabe EUR) ueber den Chartstandard und die FX-Schicht. Im Release
     bringt EIN Paket beides (globalThis.VUFxPack, scripts/vu2/build-release.mjs), sonst
     laedt der Chartstandard die Schicht selbst. Ohne Schicht bleibt die Boersenwaehrung. */
  var displayReady = null;
  function display() {
    if (displayReady) return displayReady;
    var doc = global.document;
    if (!doc || !doc.head || !doc.createElement) return Promise.resolve(null); /* ohne Browser (Tests): Boersenwaehrung */
    var load = function (src) {
      return new Promise(function (ok) { var s = doc.createElement("script"); s.src = src; s.onload = ok; s.onerror = ok; doc.head.appendChild(s); });
    };
    var CS0 = global.VUCore && global.VUCore.ChartStandard;
    displayReady = (CS0 ? Promise.resolve() : load(global.VUFxPack || "/core/chart-standard.js")).then(function () {
      var CS = global.VUCore && global.VUCore.ChartStandard;
      return CS ? CS.ensureDisplay().then(function () { return CS; }) : null;
    }).catch(function () { return null; });
    return displayReady;
  }

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function el(tag, attrs, kids) { return global.QuantShell.el(tag, attrs, kids); }
  /* Geld wird an EINER Stelle formatiert: QX.money -> VUFx.Format. */
  function signedPct(v) {
    if (!isNum(v)) return "";
    return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
  }
  function dateDe(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : iso;
  }
  function minusDays(iso, days) {
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }
  function slice(points, r) {
    if (!points.length) return [];
    var to = points[points.length - 1][0];
    if (r.all) return points.slice();
    var from = r.ytd ? to.slice(0, 4) + "-01-01" : minusDays(to, r.days);
    return points.filter(function (p) { return p[0] >= from && p[0] <= to; });
  }
  /* Deckt die Reihe den ganzen Zeitraum ab? Fuer die gemeinsamen Zeitraeume
     entscheidet VUCore.ChartHistory (Discover nutzt dieselbe Regel); 5T und
     YTD kennt sie nicht und bekommen dieselbe 95-%-Spanne. Max ist die
     Reihe selbst. */
  function spanDays(points) {
    return (Date.parse(points[points.length - 1][0]) - Date.parse(points[0][0])) / 86400000;
  }
  function covered(points, r) {
    if (!points || points.length < 2) return false;
    if (r.all) return true;
    var CH = global.VUCore && global.VUCore.ChartHistory;
    if (CH && CH.days && Object.prototype.hasOwnProperty.call(CH.days, r.id)) return CH.available(points, r.id);
    var to = points[points.length - 1][0];
    var need = r.ytd ? (Date.parse(to) - Date.parse(to.slice(0, 4) + "-01-01")) / 86400000 : r.days;
    return spanDays(points) >= need * 0.95;
  }
  function ortszeit(ms, zone) {
    try {
      var t = new Date(ms).toLocaleTimeString("de-DE", { timeZone: zone || "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
      return /^\d\d:\d\d$/.test(t) ? t : null;
    } catch (e) { return null; }
  }
  /* Dieselbe Regel wie discover/ui/detail.js mitLaufendemKurs: der letzte
     Punkt wird ersetzt oder ein neuer angehaengt - nichts interpoliert. */
  function withLive(p, live) {
    var snap = p && p.snapshot;
    if (!snap || !live || !live.fresh || !isNum(live.price) || snap.regularComplete) return snap;
    var zeit = ortszeit(live.at, snap.timezone);
    if (!zeit) return snap;
    var pts = (snap.points || []).slice(), last = pts.length ? pts[pts.length - 1] : null;
    if (last && String(last[0]) > zeit) return snap;
    if (last && String(last[0]) === zeit) pts[pts.length - 1] = [zeit, live.price]; else pts.push([zeit, live.price]);
    var copy = {};
    Object.keys(snap).forEach(function (k) { copy[k] = snap[k]; });
    copy.points = pts; copy.asOf = live.at; copy.asOfLocal = zeit; copy.streaming = true;
    return copy;
  }

  /* Vortagesschluss aus der Tagesreihe, sobald sie die Sitzung enthaelt
     (Splits dieser Sitzung sind dann eingerechnet). Der Snapshot haelt den
     Wert beim Abholen fest; ein spaeter veroeffentlichter Split machte ihn
     falsch (BGM 01.10.2026: +3.928 %). Dieselbe Regel wie
     discover/ui/detail.js#vortagAusReihe (ADR-002). */
  function vortagAusReihe(snap, punkte) {
    if (!snap || !snap.sessionDate || !punkte || !punkte.length) return snap;
    if (punkte[punkte.length - 1][0] < snap.sessionDate) return snap;
    var vor = null;
    for (var i = 0; i < punkte.length && punkte[i][0] < snap.sessionDate; i++) vor = punkte[i][1];
    if (!isNum(vor) || !(vor > 0) || vor === snap.previousClose) return snap;
    var kopie = {};
    Object.keys(snap).forEach(function (k) { kopie[k] = snap[k]; });
    kopie.previousClose = vor;
    kopie.previousCloseSource = "DAILY_SERIES";
    return kopie;
  }

  /**
   * @param {object} o {ticker, eod:[[date,close]], currency, adjusted, splitEvents,
   *                    longPath, loadJSON, onPrice(fn)}
   */
  function create(o) {
    var MC = global.VUDiscover && global.VUDiscover.MicroChart;
    var Hub = global.VUDiscover && global.VUDiscover.LiveHub;
    var SS = global.VURealtime && global.VURealtime.SourceState;
    var eod = (o.eod || []).filter(function (p) { return p && typeof p[0] === "string" && isNum(p[1]); });
    var st = { std: null, cur: o.currency || "USD", range: null, intraday: null, long: null, longLoading: false, longPromise: null, longDone: false, longFailed: false, touched: false, disposed: false, unsub: null, relay: null, trade: null };

    /* VU3 (docs/design/VU3_UI_SYSTEM.md, Kurschart): das Bild zeichnet
       assets/vu-chart.js (VUChart.render) - dieselbe Linie, Startlinie,
       Kursachse und Fingerspur wie der gemeinsame Kurschart, ohne Rahmen,
       ohne Flaeche, ohne Gitter. Datenquellen, Zeitraeume und ihre Regeln
       bleiben die dieser Datei. Ueber dem Bild steht KEIN zweiter Kurs:
       der Kurs steht einmal im Kopf der Seite. Hier stehen nur die
       Veraenderung im Zeitraum und ihr Zeitbezug; der Kurs an einer Stelle
       erscheint beim Tippen in der Fingerspur (qc-price). */
    var headPrice = el("div", { class: "vu-chart-tip qc-price", "aria-hidden": "true" });
    headPrice.hidden = true;
    var headDelta = el("b", { class: "num qc-delta" });
    var headWord = el("span", { class: "qc-word" });
    var headMeta = el("span", { class: "qc-meta" });
    var headNode = el("p", { class: "qc-head" }, [headDelta, headWord, headMeta]);
    var plot = el("div", { class: "qc-plot", "aria-live": "off" });
    var box = el("div", { class: "vu-chart vu-chart--bleed qc-box" }, [plot]);
    var bar = el("div", { class: "vu-ranges qc-ranges", role: "group", "aria-label": "Zeitraum des Charts" });
    var note = el("p", { class: "qc-note" });
    var node = el("section", { class: "qc-chart", "aria-label": "Kursverlauf " + o.ticker }, [
      el("h2", { class: "qx-sr", text: "Kursverlauf" }), headNode, box, bar,
      el("details", { class: "vu-more qc-about" }, [el("summary", { text: "Über diesen Chart" }), el("div", { class: "vu-more-body qv-more-body" }, [note])])
    ]);

    var buttons = {};
    RANGES.forEach(function (r) {
      var b = el("button", { type: "button", class: "qc-range", text: r.label, "aria-pressed": "false",
        dataset: { range: r.id }, onclick: function () { st.touched = true; rememberRange(r); draw(r.id); } });
      buttons[r.id] = b; bar.append(b);
    });

    function available(id) {
      if (id === "1D") return !!(st.intraday && st.intraday.snapshot && Array.isArray(st.intraday.snapshot.points) && st.intraday.snapshot.points.length >= 2);
      var r = RANGES.filter(function (x) { return x.id === id; })[0];
      var pts = source(r);
      return slice(pts, r).length >= 2 && covered(pts, r);
    }
    /* Deckt die Tagesreihe den Zeitraum schon ab (die Golden-Titel haben
       Tageskurse seit 2015), bleibt es bei Tageskursen - die zusammengesetzte
       lange Reihe ist Wochenraster. Sonst, und fuer Max immer, die lange. */
    function needsLong(r) { return !!r.long && (r.all || !covered(eod, r)); }
    function source(r) { return needsLong(r) && st.long ? st.long : eod; }
    /* Die lange Reihe ist angekuendigt, aber noch nicht geladen: der Knopf
       bleibt bedienbar, bis sie da ist oder ihr Laden scheitert. */
    function longPending(r) { return !!(needsLong(r) && !st.long && o.longPath && o.loadJSON && !st.longDone && !st.longFailed); }
    function syncButtons() {
      RANGES.forEach(function (r) {
        var ok = available(r.id) || longPending(r);
        buttons[r.id].disabled = !ok;
        buttons[r.id].title = ok ? "" : (r.id === "1D" ? "Für diesen Titel liegt kein Tagesverlauf vor." : "Die Kursreihe reicht nicht so weit zurück.");
        buttons[r.id].setAttribute("aria-pressed", r.id === st.range ? "true" : "false");
        buttons[r.id].classList.toggle("is-active", r.id === st.range);
      });
    }
    /* Masse des gemeinsamen Kurscharts: volle Inhaltsbreite, mobil 240 px,
       breit 320 px hoch. */
    var mobile = function () { return global.innerWidth < 760; };
    function width() { return Math.max(280, Math.round(box.getBoundingClientRect().width || node.getBoundingClientRect().width || (mobile() ? global.innerWidth - 24 : 1100))); }
    function height() { return mobile() ? 240 : 320; }
    /* Die Flaeche bleibt bis zum ersten Zeichnen leer (Tagesverlauf bis zu 3 s). Ohne
       reservierte Hoehe schob das spaetere SVG alles darunter weg (CLS 0,25 auf NVDA). */
    plot.style.minHeight = height() + "px";

    /* Zeichnen: der gemeinsame Kurschart (VUChart.render). Fehlt er (Tests
       ohne Browser), zeichnet Discovers Komponente dieselben Punkte. */
    function paint(pts, opt) {
      var VC = global.VUChart, CS = st.std;
      /* Tagesverlauf: alle Punkte und der Vortagesschluss mit dem Kurs der Sitzung. */
      if (CS && opt.intraday && opt.snap) {
        var ds = CS.displaySnapshot(opt.snap, o.currency || "USD");
        st.cur = ds.currency;
        if (ds.converted) { pts = pts.map(function (p) { return [p[0], p[1] * ds.rate]; }); opt = Object.assign({}, opt, { base: isNum(opt.base) ? opt.base * ds.rate : opt.base }); }
      }
      if (VC && VC.render) return VC.render(pts, { width: width(), height: height(), base: opt.base, sessionEnd: opt.sessionEnd, label: o.ticker });
      if (!MC) return null;
      if (opt.intraday) return MC.renderIntraday ? MC.renderIntraday(opt.snap, { width: width(), height: height(), axis: true, symbol: o.ticker, label: opt.label }) : null;
      return MC.renderRange(pts, { width: width(), height: height(), symbol: o.ticker, range: opt.range, label: opt.label, grain: opt.grain });
    }
    function place(svg) {
      plot.replaceChildren(svg, headPrice);
      headPrice.hidden = true;
      var dir = svg.getAttribute && svg.getAttribute("data-direction");
      if (dir) box.dataset.direction = dir; else delete box.dataset.direction;
    }

    /* Fingerspur wie im gemeinsamen Kurschart: Tippen oder Zeigen zeigt Kurs
       und Zeitpunkt an dieser Stelle; die Zeile darueber nennt die
       Veraenderung bis dorthin. Loslassen stellt den Zeitraum wieder her. */
    function scrub(svg, base, fmtWhen) {
      var g = svg && svg.__vuGeometry;
      if (!g || !g.pts || g.pts.length < 2 || !svg.addEventListener) return;
      var ns = "http://www.w3.org/2000/svg";
      var cross = document.createElementNS(ns, "line");
      cross.setAttribute("class", "vu-chart-cross qc-cursor"); cross.setAttribute("y1", 0); cross.setAttribute("y2", g.h - g.padBottom);
      cross.setAttribute("x1", 0); cross.setAttribute("x2", 0); cross.style.display = "none";
      svg.appendChild(cross);
      var resting = { delta: headDelta.textContent, deltaClass: headDelta.className, word: headWord.textContent };
      var on = false;
      function show(evt) {
        var rect = svg.getBoundingClientRect(), x = (evt.clientX - rect.left) * g.w / Math.max(1, rect.width), best = g.pts[0];
        for (var i = 0; i < g.pts.length; i++) if (Math.abs(g.pts[i].x - x) < Math.abs(best.x - x)) best = g.pts[i];
        on = true; node.classList.add("is-scrub");
        cross.setAttribute("x1", best.x.toFixed(1)); cross.setAttribute("x2", best.x.toFixed(1)); cross.style.display = "";
        headPrice.hidden = false;
        headPrice.textContent = global.QX.money(best.v, st.cur) + " · " + fmtWhen(best.t);
        headPrice.style.left = Math.min(rect.width - 70, Math.max(70, best.x * rect.width / g.w)) + "px";
        var b = isNum(g.base) ? g.base : base;
        var d = isNum(b) && b > 0 ? (best.v / b - 1) * 100 : null;
        headDelta.textContent = arrow(d) + signedPct(d);
        headDelta.className = "num qc-delta " + dirClass(d);
        headWord.textContent = " bis " + fmtWhen(best.t);
      }
      function rest() {
        if (!on) return;
        on = false; node.classList.remove("is-scrub");
        cross.style.display = "none";
        headPrice.hidden = true;
        headDelta.textContent = resting.delta; headDelta.className = resting.deltaClass; headWord.textContent = resting.word;
      }
      svg.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; show(e); });
      svg.addEventListener("pointermove", function (e) { if (on || e.pointerType === "mouse") show(e); });
      svg.addEventListener("pointerleave", rest);
      svg.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") rest(); });
      svg.addEventListener("pointercancel", rest);
    }

    /* Richtung nie nur ueber Farbe: Pfeil plus Vorzeichen. */
    function arrow(d) { return isNum(d) && d > 0 ? "▲ " : isNum(d) && d < 0 ? "▼ " : ""; }
    function dirClass(d) { return d > 0 ? "up vu-up" : d < 0 ? "down vu-down" : ""; }
    function head(price, delta, word, meta) {
      void price;   /* der Kurs steht im Kopf der Seite, nicht ein zweites Mal ueber dem Chart */
      headDelta.textContent = arrow(delta) + signedPct(delta);
      headDelta.className = "num qc-delta " + dirClass(delta);
      headWord.textContent = word ? " " + word : "";
      headMeta.textContent = meta || "";
    }
    function empty(title, text) {
      plot.replaceChildren(el("div", { class: "vu-chart-empty qc-empty" }, [el("b", { text: title }), text ? el("span", { text: " " + text }) : null]));
      delete box.dataset.direction;
    }

    function drawIntraday() {
      var p = st.intraday, snap = vortagAusReihe(withLive(p, st.trade), o.adjusted ? eod : null);
      var pts = (snap.points || []).filter(function (x) { return x && isNum(x[1]); });
      var last = pts.length ? pts[pts.length - 1][1] : null;
      var base = isNum(snap.previousClose) ? snap.previousClose : (pts.length ? pts[0][1] : null);
      var delta = isNum(last) && isNum(base) && base > 0 ? (last / base - 1) * 100 : null;
      var q = SS ? SS.bestimme({ resolution: Hub && Hub.resolution ? Hub.resolution() : null, snapshot: p.snapshot, live: st.trade, now: new Date() }) : null;
      var frozen = !!(q && q.isFrozen) || snap.regularComplete === true;
      /* Ein Stand, der nicht live ist (STALE: Schluss fehlt, Takt steht),
         heisst nicht "heute" - er traegt sein Datum und seine Uhrzeit. */
      var datiert = frozen || !!(q && q.state === "STALE");
      /* Eine Zeile: Veraenderung, Bezug, Zeitpunkt. Ein Stand, der nicht live ist, nennt Datum und Uhrzeit. */
      var bis = snap.lastRegularLocal || snap.asOfLocal;
      head(last, delta, isNum(snap.previousClose) ? "seit Vortagesschluss" : "seit dem ersten Kurs des Tages",
        (datiert ? dateDe(snap.sessionDate).slice(0, 6) + (bis ? ", bis " + String(bis).slice(0, 5) + " Uhr New York" : "") : "heute" + (bis ? ", " + String(bis).slice(0, 5) + " Uhr New York" : "")) +
        (q && q.state === "STALE" ? " · nicht aktuell" : q && q.state === "FINAL_SESSION" ? " · Sitzung beendet" : ""));
      /* Uhrzeiten New York als Zeitpunkte des Sitzungstags; die Achse reicht bis zum Handelsschluss. */
      var day = String(snap.sessionDate || "").slice(0, 10), iso = function (hm) { return day + "T" + String(hm).slice(0, 5) + ":00"; };
      var svg = paint(pts.map(function (x) { return [iso(x[0]), x[1]]; }), { intraday: true, snap: snap, base: isNum(snap.previousClose) ? snap.previousClose : undefined,
        sessionEnd: day && (snap.sessionCloseLocal || snap.closeLocal) ? iso(snap.sessionCloseLocal || snap.closeLocal) : undefined, label: q && q.label });
      if (!svg) { empty("Kein Tagesverlauf", "Der Tagesverlauf dieses Titels ist unvollständig."); return; }
      svg.classList.add("qc-svg");
      plot.className = "qc-plot";
      place(svg);
      plot.dataset.sourceState = q ? q.state : "";
      plot.dataset.live = frozen ? "complete" : (snap.streaming ? "streaming" : "running");
      scrub(svg, base, function (t) { return String(t).slice(11, 16) + " New York"; });
      var satz = { REALTIME: "Der Kurs läuft mit; die letzte Zahl ist eine Kursreferenz aus einem Teilmarkt, kein Abschluss.",
        SNAPSHOT: "Die Sitzung läuft; der Verlauf wächst mit dem nächsten Stand.",
        FINAL_SESSION: "Die Sitzung ist abgeschlossen; dieser Verlauf bleibt so stehen." };
      note.textContent = (q && q.label ? q.label + ". " : "") + ((q && q.sourceText) || "5-Minuten-Kurse") + " · Uhrzeiten New York · Startlinie: " +
        (isNum(snap.previousClose) ? "Vortagesschluss" : "erster Kurs des Tages") + ". " + ((q && satz[q.state]) || "");
      /* Nur ein LAUFENDER Tag aktualisiert den Kurs im Kopf der Seite. Nach
         Schluss gilt der offizielle Schlusskurs der Tagesreihe - der letzte
         5-Minuten-Kurs ist kein Schlusskurs. */
      var time = snap.asOfLocal ? String(snap.asOfLocal).slice(0, 5) : null;
      if (o.onPrice) o.onPrice({ price: last, delta: delta, when: frozen ? "Letzter 5-Minuten-Kurs am " + dateDe(snap.sessionDate) : "Stand " + dateDe(snap.sessionDate) + (time ? ", " + time + " Uhr New York" : ""), live: !frozen && !(q && q.state === "STALE"),
        kind: q && q.state === "REALTIME" ? "live" : "delayed", at: dateDe(snap.sessionDate) + (time ? ", " + time + " Uhr New York" : "") });
    }

    function drawRange(r) {
      var src = source(r);
      var pts = slice(src, r);
      if (pts.length < 2 || !covered(src, r)) {
        /* Keine Rendite ueber einen gekuerzten Zeitraum: der Kopf zeigt den
           letzten Kurs ohne Veraenderung und sagt, wo die Reihe beginnt. */
        head(eod.length ? eod[eod.length - 1][1] : null, null, "", src.length ? "Kursreihe ab " + dateDe(src[0][0]) : "");
        empty("Zeitraum nicht verfügbar", "Die Kursreihe reicht nicht so weit zurück" + (src.length ? " (sie beginnt am " + dateDe(src[0][0]) + ")." : "."));
        delete plot.dataset.range; delete plot.dataset.grain;
        note.textContent = ""; return;
      }
      /* Anzeigewaehrung (Vorgabe EUR): jeder Punkt mit dem EZB-Kurs seines Tages; die
         Veraenderung kommt aus DIESER Reihe, wie in Discover (detail.js, §41). */
      if (st.std) { var shown = st.std.displaySeries(pts, o.currency || "USD"); pts = shown.points; st.cur = shown.currency; }
      else st.cur = o.currency || "USD";
      var first = pts[0][1], last = pts[pts.length - 1][1];
      var delta = first > 0 ? (last / first - 1) * 100 : null;
      /* Die zusammengesetzte lange Reihe ist durchgehend Wochenraster
         (SeriesSampling.mergeWeeklyWithDaily), nur ihr letzter Punkt ist der
         juengste Tagesschluss. */
      var weekly = src === st.long;
      head(last, delta, r.word, dateDe(pts[0][0]) + " – " + dateDe(pts[pts.length - 1][0]));
      var svg = paint(pts, { range: r.id === "1Y" ? "1Y" : r.id, label: r.word, grain: weekly ? "weekly" : "daily" });
      if (!svg) { empty("Zeitraum nicht verfügbar", "Zu wenige Kurse im Zeitraum."); return; }
      svg.classList.add("qc-svg");
      plot.className = "qc-plot";
      plot.dataset.range = r.id; plot.dataset.grain = weekly ? "weekly" : "daily";
      place(svg);
      delete plot.dataset.sourceState; delete plot.dataset.live;
      scrub(svg, first, function (t) { return dateDe(t); });
      var capt = [];
      capt.push(r.id === "5D" ? "Tagesschlusskurse der letzten Handelstage (5-Minuten-Kurse werden nur für den aktuellen Tag aufbewahrt)"
        : weekly ? "Wochenschlusskurse, letzter Punkt Tagesschluss vom " + dateDe(pts[pts.length - 1][0]) : "Tagesschlusskurse");
      capt.push(o.adjusted ? "splitbereinigt" + (o.splitEvents ? " (" + o.splitEvents + (o.splitEvents === 1 ? " Split" : " Splits") + " herausgerechnet)" : "") : "nicht splitbereinigt – Splits können als Kurssprung erscheinen");
      capt.push(st.std ? st.std.currencyNote(st.cur, o.currency || "USD", false) : st.cur);
      if (svg.getAttribute("data-scale") === "log") capt.push("logarithmische Kursachse");
      capt.push("ohne Dividenden");
      note.textContent = capt.join(" · ") + ".";
    }


    /* Ein Ladevorgang, auf den jeder wartet: wer waehrend des Ladens einen
       anderen langen Zeitraum waehlt, zeichnet, sobald die Reihe da ist. */
    function loadLong() {
      if (st.longPromise) return st.longPromise;
      if (st.long || !o.longPath || !o.loadJSON) return Promise.resolve();
      st.longLoading = true;
      st.longPromise = o.loadJSON(o.longPath).then(function (payload) {
        var weekly = (payload && payload.points) || [];
        var SSmp = global.VUQuant && global.VUQuant.SeriesSampling;
        st.long = SSmp && SSmp.mergeWeeklyWithDaily ? SSmp.mergeWeeklyWithDaily(weekly, eod) : eod;
        if (!st.long.length || st.long[0][0] >= eod[0][0]) st.long = null;
        st.longDone = true;
      }).catch(function () { st.longFailed = true; }).then(function () { st.longLoading = false; syncButtons(); });
      return st.longPromise;
    }

    function draw(id) {
      if (st.disposed) return;
      plot.style.minHeight = height() + "px";
      var r = RANGES.filter(function (x) { return x.id === id; })[0] || RANGES[6];
      st.range = r.id;
      node.dataset.range = r.id;
      syncButtons();
      if (r.id === "1D") {
        if (!available("1D")) { empty("Kein Tagesverlauf", "Für diesen Titel liegt kein veröffentlichter Tagesverlauf vor."); note.textContent = ""; return; }
        drawIntraday(); return;
      }
      if (longPending(r)) {
        /* Nicht die kurze Reihe unter dem langen Etikett zeichnen. */
        head(eod.length ? eod[eod.length - 1][1] : null, null, "", "");
        empty("Lange Kursreihe wird geladen", "");
        delete plot.dataset.range; delete plot.dataset.grain;
        note.textContent = "";
        loadLong().then(function () { if (st.range === r.id) drawRange(r); });
        return;
      }
      drawRange(r);
    }

    /* Ohne Tagesverlauf beginnt der Chart bei 1J. Reicht die Reihe dafuer
       nicht (junge Titel), beim laengsten abgedeckten kuerzeren Zeitraum,
       sonst bei der ganzen Reihe. */
    function startRange() {
      var mine = rememberedRange(); if (mine && (available(mine.id) || longPending(mine))) return mine.id;
      var order = ["1Y", "6M", "3M", "1M"];
      for (var i = 0; i < order.length; i++) if (available(order[i])) return order[i];
      return "MAX";
    }
    /* Start: 1T, wenn es einen Tagesverlauf gibt, sonst 1J. Der Hub
       antwortet sofort aus dem Cache oder nach einem Abruf; wer nicht
       antwortet, haelt den Chart nicht auf. */
    function start() {
      if (!(global.VUChart && global.VUChart.render) && !(MC && MC.renderRange)) { empty("Chart nicht verfügbar", "Die Chart-Komponente konnte nicht geladen werden."); return; }
      if (eod.length < 2 && !(Hub && Hub.enabled && Hub.enabled())) {
        empty("Keine Kursreihe", "Für diesen Titel liegt keine veröffentlichte Kursreihe vor."); syncButtons(); return;
      }
      var first = true;
      if (Hub && Hub.enabled && Hub.enabled()) {
        st.unsub = Hub.subscribe(o.ticker, function (p) {
          st.intraday = p && p.snapshot ? p : null;
          if (st.intraday && !st.intraday.snapshot.regularComplete) startRelay();
          if (first) { first = false; if (!st.touched) draw(available("1D") ? "1D" : startRange()); return; }
          if (st.range === "1D") draw("1D"); else syncButtons();
        });
        global.setTimeout(function () { if (first) { first = false; if (!st.touched) draw(startRange()); } }, 3000);
      } else draw(startRange());
    }

    /* Live nur bei offener Boerse und laufendem Tag, eine Verbindung je
       Seite, nur fuer diesen Titel. Der Client laesst ausschliesslich
       bestaetigte Trades durch; ein Kursangebot bewegt nichts. */
    function startRelay() {
      var RC = global.VULiveRelayClient;
      if (st.relay || st.disposed || !RC || !o.realtime || typeof global.WebSocket !== "function") return;
      var r = Hub && Hub.resolution ? Hub.resolution() : null;
      if (!r || r.marketState !== "OPEN") return;
      st.relay = { pending: true };
      Promise.resolve(o.realtime()).then(function (cap) {
        if (st.disposed || !cap || cap.state !== "AVAILABLE") { st.relay = null; return; }
        var client = RC.create({ capability: cap, connect: function (url) { return new global.WebSocket(url); },
          onChange: function (snap) {
            var last = snap && snap.isLive && snap.last;
            st.trade = last ? { fresh: true, price: last.price, at: new Date(last.timestamp).toISOString(), priceType: "TRADE" } : null;
            if (st.range === "1D" && !st.disposed) draw("1D");
          } });
        st.relay = client;
        client.start();
      }).catch(function () { st.relay = null; });
    }

    var resizeTimer = null;
    function onResize() { global.clearTimeout(resizeTimer); resizeTimer = global.setTimeout(function () { if (st.range) draw(st.range); }, 150); }
    global.addEventListener("resize", onResize);
    head(eod.length ? eod[eod.length - 1][1] : null, null, "", "");
    empty("Chart wird geladen", "");
    global.setTimeout(start, 0);
    display().then(function (CS) { if (!CS || st.disposed) return; st.std = CS; if (st.range) draw(st.range); });

    return {
      node: node,
      range: function () { return st.range; },
      draw: draw,
      dispose: function () {
        st.disposed = true;
        global.removeEventListener("resize", onResize);
        if (st.unsub) { try { st.unsub(); } catch (e) { /* bereits gekuendigt */ } st.unsub = null; }
        if (st.relay && st.relay.stop) { try { st.relay.stop("PAGE_LEFT"); } catch (e) { /* bereits zu */ } }
        st.relay = null; st.trade = null;
      }
    };
  }

  global.VUQuantChart = { VERSION: VERSION, RANGES: RANGES, create: create, withLive: withLive, slice: slice, covered: covered, display: display };
})(window);
