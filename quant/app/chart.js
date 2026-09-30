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
     VUDiscover.LiveHub.live               Snapshot + optionaler Live-Strom
     VURealtime.SourceState.bestimme       Etikett und Fussnote des Tages

   1T nimmt den veroeffentlichten Intraday-Snapshot; ist die Boerse offen
   und der Live-Strom verfuegbar, schreibt jeder neue Kurs DENSELBEN Chart
   fort. Kein zweiter Chart, kein zweiter Weg.

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
  function withLive(p) {
    var snap = p && p.snapshot, live = p && p.live;
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

  /**
   * @param {object} o {ticker, eod:[[date,close]], currency, adjusted, splitEvents,
   *                    longPath, loadJSON, onPrice(fn)}
   */
  function create(o) {
    var MC = global.VUDiscover && global.VUDiscover.MicroChart;
    var Hub = global.VUDiscover && global.VUDiscover.LiveHub;
    var SS = global.VURealtime && global.VURealtime.SourceState;
    var eod = (o.eod || []).filter(function (p) { return p && typeof p[0] === "string" && isNum(p[1]); });
    var st = { range: null, intraday: null, long: null, longLoading: false, touched: false, disposed: false, unsub: null };

    var headPrice = el("b", { class: "qc-price num" });
    var headDelta = el("span", { class: "qc-delta num" });
    var headWord = el("span", { class: "qc-word" });
    var headMeta = el("p", { class: "qc-meta" });
    var plot = el("div", { class: "qc-plot", "aria-live": "off" });
    var bar = el("div", { class: "qc-ranges", role: "group", "aria-label": "Zeitraum des Charts" });
    var note = el("p", { class: "qc-note" });
    var node = el("section", { class: "qc-chart", "aria-label": "Kursverlauf " + o.ticker }, [
      el("div", { class: "qc-head" }, [el("div", { class: "qc-head-price" }, [headPrice, headDelta, headWord]), headMeta]),
      plot, bar, note
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
    function width() { return Math.max(280, Math.round(plot.getBoundingClientRect().width || node.getBoundingClientRect().width || 340)); }
    function height() { return global.innerWidth < 720 ? 240 : 340; }

    function scrub(svg, base, fmtWhen, word) {
      if (!svg || !svg.__punkte || !svg.__punkte.length) return;
      var pts = svg.__punkte;
      var cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
      cursor.setAttribute("class", "qc-cursor"); cursor.setAttribute("y1", "0"); cursor.setAttribute("y2", svg.viewBox.baseVal.height);
      cursor.style.display = "none"; svg.appendChild(cursor);
      var resting = { price: headPrice.textContent, delta: headDelta.textContent, deltaClass: headDelta.className, word: headWord.textContent };
      function at(evt) {
        var rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        var x = (evt.clientX - rect.left) * (vb.width / rect.width);
        var best = pts[0];
        for (var i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(best.x - x)) best = pts[i];
        cursor.setAttribute("x1", best.x); cursor.setAttribute("x2", best.x); cursor.style.display = ""; node.classList.add("is-scrub");
        headPrice.textContent = global.QX.money(best.close, o.currency || "USD");
        var d = isNum(base) && base > 0 ? (best.close / base - 1) * 100 : null;
        headDelta.textContent = signedPct(d);
        headDelta.className = "qc-delta num " + (d > 0 ? "up" : d < 0 ? "down" : "");
        headWord.textContent = fmtWhen(best);
      }
      function rest() {
        cursor.style.display = "none"; node.classList.remove("is-scrub");
        headPrice.textContent = resting.price; headDelta.textContent = resting.delta;
        headDelta.className = resting.deltaClass; headWord.textContent = resting.word;
      }
      svg.addEventListener("pointermove", at);
      svg.addEventListener("pointerdown", at);
      svg.addEventListener("pointerleave", rest);
      svg.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") rest(); });
    }

    function head(price, delta, word, meta) {
      headPrice.textContent = global.QX.money(price, o.currency || "USD");
      headDelta.textContent = signedPct(delta);
      headDelta.className = "qc-delta num " + (delta > 0 ? "up" : delta < 0 ? "down" : "");
      headWord.textContent = word;
      headMeta.textContent = meta || "";
    }
    function empty(title, text) {
      plot.replaceChildren(el("div", { class: "qc-empty" }, [el("strong", { text: title }), el("span", { text: text })]));
    }

    function drawIntraday() {
      var p = st.intraday, snap = withLive(p);
      var pts = (snap.points || []).filter(function (x) { return x && isNum(x[1]); });
      var last = pts.length ? pts[pts.length - 1][1] : null;
      var base = isNum(snap.previousClose) ? snap.previousClose : (pts.length ? pts[0][1] : null);
      var delta = isNum(last) && isNum(base) && base > 0 ? (last / base - 1) * 100 : null;
      var q = SS ? SS.bestimme({ resolution: Hub && Hub.resolution ? Hub.resolution() : null, snapshot: p.snapshot, live: p.live, now: new Date() }) : null;
      var frozen = !!(q && q.isFrozen) || snap.regularComplete === true;
      head(last, delta, frozen ? "am " + dateDe(snap.sessionDate) + (snap.lastRegularLocal ? ", letzter 5-Minuten-Kurs " + String(snap.lastRegularLocal).slice(0, 5) + " Uhr" : "") : "heute",
        (isNum(snap.previousClose) ? "seit Vortagesschluss " + global.QX.money(snap.previousClose, o.currency || "USD") : "seit dem ersten Kurs des Tages") +
        (q && q.label ? " · " + q.label : ""));
      var svg = MC && MC.renderIntraday ? MC.renderIntraday(snap, { width: width(), height: height(), axis: true, symbol: o.ticker, label: q && q.label }) : null;
      if (!svg) { empty("Kein Tagesverlauf", "Der Tagesverlauf dieses Titels ist unvollständig."); return; }
      svg.classList.add("qc-svg");
      plot.replaceChildren(svg);
      plot.dataset.sourceState = q ? q.state : "";
      plot.dataset.live = frozen ? "complete" : (snap.streaming ? "streaming" : "running");
      scrub(svg, base, function (pt) { return pt.time + " Uhr New York"; }, "heute");
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
      plot.replaceChildren(svg);
      delete plot.dataset.sourceState; delete plot.dataset.live;
      scrub(svg, first, function (pt) { return "am " + dateDe(pt.date); }, r.word);
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
        st.unsub = (Hub.live || Hub.subscribe)(o.ticker, function (p) {
          st.intraday = p && p.snapshot ? p : null;
          if (first) { first = false; if (!st.touched) draw(available("1D") ? "1D" : "1Y"); return; }
          if (st.range === "1D") draw("1D"); else syncButtons();
        });
        global.setTimeout(function () { if (first) { first = false; if (!st.touched) draw("1Y"); } }, 3000);
      } else draw("1Y");
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
      }
    };
  }

  global.VUQuantChart = { VERSION: VERSION, RANGES: RANGES, create: create, withLive: withLive, slice: slice };
})(window);
