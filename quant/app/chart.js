/* =========================================================================
   VISION UNIVERSE QUANT — app/chart.js                   (quant-chart-1.0.0)

   EIN CHART. ALLE ZEITRAEUME. DERSELBE WIE IN DISCOVER.

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
   Product Services (Return Contract: SPLIT_ADJUSTED_PRICE). Fuer 10J und
   Max wird, wo vorhanden, die lange Wochenreihe vorangestellt.
   ========================================================================= */
(function (global) {
  "use strict";

  var VERSION = "quant-chart-1.0.0";
  var RANGES = [
    { id: "1D", label: "1T", word: "heute" },
    { id: "5D", label: "5T", days: 7, word: "in 5 Tagen" },
    { id: "1M", label: "1M", days: 31, word: "in 1 Monat" },
    { id: "3M", label: "3M", days: 92, word: "in 3 Monaten" },
    { id: "6M", label: "6M", days: 183, word: "in 6 Monaten" },
    { id: "YTD", label: "YTD", ytd: true, word: "seit Jahresbeginn" },
    { id: "1Y", label: "1J", days: 366, word: "in 1 Jahr" },
    { id: "3Y", label: "3J", days: 1096, word: "in 3 Jahren" },
    { id: "5Y", label: "5J", days: 1827, word: "in 5 Jahren", long: true },
    { id: "10Y", label: "10J", days: 3653, word: "in 10 Jahren", long: true },
    { id: "MAX", label: "Max", all: true, word: "seit Beginn der Reihe", long: true }
  ];

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
    var st = { range: null, intraday: null, long: null, longLoading: false, touched: false, disposed: false, unsub: null, relay: null, trade: null };

    /* Dieselbe Gliederung wie Discovers Chart (discover/ui/detail.js
       chartSection): Zeitraum-Leiste (dx-tf), Kopf mit Kurs, Veraenderung
       und Zeitpunkt (dx-chart-hero), die Flaeche, die Fussnote. */
    var headPrice = el("b", { class: "num qc-price" });
    var headDelta = el("span", { class: "num qc-delta" });
    var headWord = el("span", { class: "dx-chart-hero-wort qc-word" });
    var headMeta = el("span", { class: "dx-chart-hero-span qc-meta" });
    var headNode = el("div", { class: "dx-chart-hero qc-head" }, [
      el("div", { class: "dx-chart-hero-preis" }, [headPrice, headDelta, headWord]),
      el("div", { class: "dx-chart-hero-meta" }, [headMeta])]);
    var plot = el("div", { class: "dx-range-chart-wrap qc-plot", "aria-live": "off" });
    var bar = el("div", { class: "dx-tf qc-ranges", role: "group", "aria-label": "Zeitraum des Charts" });
    var note = el("p", { class: "dx-intraday-note qc-note" });
    var box = el("div", { class: "dx-chart" }, [headNode, plot, note]);
    var node = el("section", { class: "dx-chapter dx-chapter--chart qc-chart", "aria-label": "Kursverlauf " + o.ticker }, [
      el("h2", { text: "Kursverlauf" }),
      el("div", {}, [el("div", { class: "dx-chart-head" }, [bar]), box])
    ]);

    var buttons = {};
    RANGES.forEach(function (r) {
      var b = el("button", { type: "button", class: "qc-range", text: r.label, "aria-pressed": "false",
        dataset: { range: r.id }, onclick: function () { st.touched = true; draw(r.id); } });
      buttons[r.id] = b; bar.append(b);
    });

    function available(id) {
      if (id === "1D") return !!(st.intraday && st.intraday.snapshot && Array.isArray(st.intraday.snapshot.points) && st.intraday.snapshot.points.length >= 2);
      var r = RANGES.filter(function (x) { return x.id === id; })[0];
      var pts = r.long && st.long ? st.long : eod;
      return slice(pts, r).length >= 2;
    }
    function syncButtons() {
      RANGES.forEach(function (r) {
        var ok = available(r.id) || (r.long && !st.long && o.longPath && !st.longFailed);
        buttons[r.id].disabled = !ok;
        buttons[r.id].title = ok ? "" : (r.id === "1D" ? "Für diesen Titel liegt kein Tagesverlauf vor." : "Die Kursreihe reicht nicht so weit zurück.");
        buttons[r.id].setAttribute("aria-pressed", r.id === st.range ? "true" : "false");
        buttons[r.id].classList.toggle("is-active", r.id === st.range);
      });
    }
    /* Discovers Mass (chartMass): volle Breite, am Handy gut die Haelfte
       des Bildschirms hoch - der Chart ist die Hauptflaeche. */
    var mobile = function () { return global.innerWidth < 860; };
    function width() { return Math.max(280, Math.round(box.getBoundingClientRect().width || node.getBoundingClientRect().width || (mobile() ? global.innerWidth - 40 : 1100))); }
    function height() { return mobile() ? Math.round(Math.max(300, Math.min(global.innerHeight * 0.52, 480))) : 440; }

    /* Beruehrung wie in Discover (beruehrung): Finger oder Zeiger zeigen den
       Kurs an dieser Stelle - im Kopf und als Marke im Bild. Loslassen
       stellt den letzten Kurs wieder her. */
    function scrub(svg, base, fmtWhen) {
      if (!svg || !svg.__punkte || svg.__punkte.length < 2) return;
      var pts = svg.__punkte, frame = svg.__basis || {};
      var ns = "http://www.w3.org/2000/svg";
      var g = document.createElementNS(ns, "g"); g.setAttribute("class", "dx-scrub"); g.setAttribute("aria-hidden", "true");
      var line = document.createElementNS(ns, "line"); line.setAttribute("class", "dx-scrub-line qc-cursor");
      var dot = document.createElementNS(ns, "circle"); dot.setAttribute("class", "dx-scrub-node"); dot.setAttribute("r", "5");
      g.appendChild(line); g.appendChild(dot);
      var vb = (svg.getAttribute("viewBox") || "0 0 0 0").split(" ").map(Number);
      var resting = { price: headPrice.textContent, delta: headDelta.textContent, deltaClass: headDelta.className, word: headWord.textContent };
      var on = false;
      function nearest(clientX) {
        var rect = svg.getBoundingClientRect(), x = (clientX - rect.left) / Math.max(1, rect.width) * vb[2];
        var best = pts[0], d = Infinity;
        for (var i = 0; i < pts.length; i++) { var dd = Math.abs(pts[i].x - x); if (dd < d) { d = dd; best = pts[i]; } }
        return best;
      }
      function show(evt) {
        var pt = nearest(evt.clientX);
        if (!on) { on = true; svg.appendChild(g); svg.classList.add("dx-scrubbing"); node.classList.add("is-scrub"); }
        line.setAttribute("x1", pt.x); line.setAttribute("x2", pt.x);
        line.setAttribute("y1", frame.padTop || 0); line.setAttribute("y2", vb[3] - (frame.padBottom || 0));
        dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
        headPrice.textContent = global.QX.money(pt.close, o.currency || "USD");
        var d = isNum(base) && base > 0 ? (pt.close / base - 1) * 100 : null;
        headDelta.textContent = signedPct(d);
        headDelta.className = "num qc-delta " + (d > 0 ? "up" : d < 0 ? "down" : "");
        headWord.textContent = fmtWhen(pt);
      }
      function rest() {
        if (!on) return;
        on = false; if (g.parentNode) g.parentNode.removeChild(g);
        svg.classList.remove("dx-scrubbing"); node.classList.remove("is-scrub");
        headPrice.textContent = resting.price; headDelta.textContent = resting.delta;
        headDelta.className = resting.deltaClass; headWord.textContent = resting.word;
      }
      svg.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; show(e); });
      svg.addEventListener("pointermove", function (e) { if (on || e.pointerType === "mouse") show(e); });
      svg.addEventListener("pointerleave", rest);
      svg.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") rest(); });
      svg.addEventListener("pointercancel", rest);
    }

    function head(price, delta, word, meta) {
      headPrice.textContent = global.QX.money(price, o.currency || "USD");
      headDelta.textContent = signedPct(delta);
      headDelta.className = "num qc-delta " + (delta > 0 ? "up" : delta < 0 ? "down" : "");
      headWord.textContent = word;
      headMeta.textContent = meta || "";
    }
    function empty(title, text) {
      plot.replaceChildren(el("div", { class: "dx-empty qc-empty" }, [el("b", { text: title }), el("span", { text: text })]));
    }

    function drawIntraday() {
      var p = st.intraday, snap = vortagAusReihe(withLive(p, st.trade), o.adjusted ? eod : null);
      var pts = (snap.points || []).filter(function (x) { return x && isNum(x[1]); });
      var last = pts.length ? pts[pts.length - 1][1] : null;
      var base = isNum(snap.previousClose) ? snap.previousClose : (pts.length ? pts[0][1] : null);
      var delta = isNum(last) && isNum(base) && base > 0 ? (last / base - 1) * 100 : null;
      var q = SS ? SS.bestimme({ resolution: Hub && Hub.resolution ? Hub.resolution() : null, snapshot: p.snapshot, live: st.trade, now: new Date() }) : null;
      var frozen = !!(q && q.isFrozen) || snap.regularComplete === true;
      head(last, delta, frozen ? "am " + dateDe(snap.sessionDate) + (snap.lastRegularLocal ? ", letzter 5-Minuten-Kurs " + String(snap.lastRegularLocal).slice(0, 5) + " Uhr" : "") : "heute",
        (isNum(snap.previousClose) ? "seit Vortagesschluss " + global.QX.money(snap.previousClose, o.currency || "USD") : "seit dem ersten Kurs des Tages") +
        (q && q.label ? " · " + q.label : ""));
      var svg = MC && MC.renderIntraday ? MC.renderIntraday(snap, { width: width(), height: height(), axis: true, symbol: o.ticker, label: q && q.label }) : null;
      if (!svg) { empty("Kein Tagesverlauf", "Der Tagesverlauf dieses Titels ist unvollständig."); return; }
      svg.classList.add("dx-intraday-chart", "qc-svg");
      plot.className = "dx-intraday qc-plot";
      plot.replaceChildren(svg);
      plot.dataset.sourceState = q ? q.state : "";
      plot.dataset.live = frozen ? "complete" : (snap.streaming ? "streaming" : "running");
      scrub(svg, base, function (pt) { return pt.time + " New York"; });
      var satz = { REALTIME: "Der Kurs läuft mit; die letzte Zahl ist eine Kursreferenz aus einem Teilmarkt, kein Abschluss.",
        SNAPSHOT: "Die Sitzung läuft; der Verlauf wächst mit dem nächsten Stand.",
        FINAL_SESSION: "Die Sitzung ist abgeschlossen; dieser Verlauf bleibt so stehen." };
      note.textContent = ((q && q.sourceText) || "5-Minuten-Kurse") + " · Uhrzeiten New York · Startlinie: " +
        (isNum(snap.previousClose) ? "Vortagesschluss" : "erster Kurs des Tages") + ". " + ((q && satz[q.state]) || "");
      /* Nur ein LAUFENDER Tag aktualisiert den Kurs im Kopf der Seite. Nach
         Schluss gilt der offizielle Schlusskurs der Tagesreihe - der letzte
         5-Minuten-Kurs ist kein Schlusskurs. */
      if (o.onPrice) o.onPrice({ price: last, delta: delta, when: frozen ? "Letzter 5-Minuten-Kurs am " + dateDe(snap.sessionDate) : "Stand " + dateDe(snap.sessionDate) + (snap.asOfLocal ? ", " + String(snap.asOfLocal).slice(0, 5) + " Uhr New York" : ""), live: !frozen && !(q && q.state === "STALE") });
    }

    function drawRange(r) {
      var source = r.long && st.long ? st.long : eod;
      var pts = slice(source, r);
      if (pts.length < 2) { empty("Zeitraum nicht verfügbar", "Die Kursreihe reicht nicht so weit zurück."); note.textContent = ""; return; }
      var first = pts[0][1], last = pts[pts.length - 1][1];
      var delta = first > 0 ? (last / first - 1) * 100 : null;
      var weekly = r.long && st.long && source === st.long && pts.length && pts[0][0] < eod[0][0];
      head(last, delta, r.word, dateDe(pts[0][0]) + " – " + dateDe(pts[pts.length - 1][0]));
      var svg = MC.renderRange(pts, { width: width(), height: height(), symbol: o.ticker, range: r.id === "1Y" ? "1Y" : r.id, label: r.word, grain: weekly ? "weekly" : "daily" });
      if (!svg) { empty("Zeitraum nicht verfügbar", "Zu wenige Kurse im Zeitraum."); return; }
      svg.classList.add("qc-svg");
      plot.className = "dx-range-chart-wrap qc-plot";
      plot.dataset.range = r.id; plot.dataset.grain = weekly ? "weekly" : "daily";
      plot.replaceChildren(svg);
      delete plot.dataset.sourceState; delete plot.dataset.live;
      scrub(svg, first, function (pt) { return dateDe(pt.date); });
      var capt = [];
      capt.push(r.id === "5D" ? "Tagesschlusskurse der letzten Handelstage (5-Minuten-Kurse werden nur für den aktuellen Tag aufbewahrt)"
        : weekly ? "Wochenschlusskurse vor " + dateDe(eod[0][0]) + ", danach Tagesschlusskurse" : "Tagesschlusskurse");
      capt.push(o.adjusted ? "splitbereinigt" + (o.splitEvents ? " (" + o.splitEvents + (o.splitEvents === 1 ? " Split" : " Splits") + " herausgerechnet)" : "") : "nicht splitbereinigt – Splits können als Kurssprung erscheinen");
      capt.push(o.currency || "USD");
      if (svg.getAttribute("data-scale") === "log") capt.push("logarithmische Kursachse");
      capt.push("ohne Dividenden");
      note.textContent = capt.join(" · ") + ".";
    }

    function loadLong() {
      if (st.long || st.longLoading || !o.longPath || !o.loadJSON) return Promise.resolve();
      st.longLoading = true;
      return o.loadJSON(o.longPath).then(function (payload) {
        var weekly = (payload && payload.points) || [];
        var SSmp = global.VUQuant && global.VUQuant.SeriesSampling;
        st.long = SSmp && SSmp.mergeWeeklyWithDaily ? SSmp.mergeWeeklyWithDaily(weekly, eod) : eod;
        if (!st.long.length || st.long[0][0] >= eod[0][0]) st.long = null;
      }).catch(function () { st.longFailed = true; }).then(function () { st.longLoading = false; syncButtons(); });
    }

    function draw(id) {
      if (st.disposed) return;
      var r = RANGES.filter(function (x) { return x.id === id; })[0] || RANGES[6];
      st.range = r.id;
      node.dataset.range = r.id;
      syncButtons();
      if (r.id === "1D") {
        if (!available("1D")) { empty("Kein Tagesverlauf", "Für diesen Titel liegt kein veröffentlichter Tagesverlauf vor."); note.textContent = ""; return; }
        drawIntraday(); return;
      }
      if (r.long && !st.long && o.longPath && !st.longFailed) {
        drawRange(r);
        loadLong().then(function () { if (st.range === r.id) drawRange(r); });
        return;
      }
      drawRange(r);
    }

    /* Start: 1T, wenn es einen Tagesverlauf gibt, sonst 1J. Der Hub
       antwortet sofort aus dem Cache oder nach einem Abruf; wer nicht
       antwortet, haelt den Chart nicht auf. */
    function start() {
      if (!MC || !MC.renderRange) { empty("Chart nicht verfügbar", "Die Chart-Komponente konnte nicht geladen werden."); return; }
      if (eod.length < 2 && !(Hub && Hub.enabled && Hub.enabled())) {
        empty("Keine Kursreihe", "Für diesen Titel liegt keine veröffentlichte Kursreihe vor."); syncButtons(); return;
      }
      var first = true;
      if (Hub && Hub.enabled && Hub.enabled()) {
        st.unsub = Hub.subscribe(o.ticker, function (p) {
          st.intraday = p && p.snapshot ? p : null;
          if (st.intraday && !st.intraday.snapshot.regularComplete) startRelay();
          if (first) { first = false; if (!st.touched) draw(available("1D") ? "1D" : "1Y"); return; }
          if (st.range === "1D") draw("1D"); else syncButtons();
        });
        global.setTimeout(function () { if (first) { first = false; if (!st.touched) draw("1Y"); } }, 3000);
      } else draw("1Y");
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

  global.VUQuantChart = { VERSION: VERSION, RANGES: RANGES, create: create, withLive: withLive, slice: slice };
})(window);
