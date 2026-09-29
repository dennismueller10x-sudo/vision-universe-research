/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/market-intelligence.js

   MARKETS 3.0 — DIE MARKTEINORDNUNG FUER PRIVATANLEGER

   Beantwortet oben auf der Maerkte-Seite: Wie ist das Marktumfeld? Was hat
   sich veraendert? Warum? Worauf kommt es an? Was wuerde das Bild aendern?

   WAS DIESE DATEI NICHT TUT

   Sie bestimmt keinen Zustand. Marktumfeld, Dimensionen, Bedingungen,
   Vergleich und Historie stehen fertig im Core-Artefakt
   (/quant/data/market/intelligence/market-pulse.json und
   market-pulse-history.json) - gleiche Daten, gleiche Aussage, kein
   Modell. Diese Datei ordnet, formuliert Datumsangaben und zeichnet.
   Kein Anbieter, keine Waehrungslogik, keine Kursberechnung.

   FARBE TRAEGT BEDEUTUNG, NICHT KAUFEN/VERKAUFEN

   Stufen des Marktumfelds und "unterstuetzt / Gegenwind / offen /
   Kontext" haben eigene Toene; jede Aussage steht zusaetzlich als Text
   da. Renditen und Cross-Asset-Beziehungen bleiben neutral.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;

  /* Alltagsnamen zuerst (Owner-Feedback: verstaendlich fuer Einsteiger);
     das Fachwort steht klein daneben, damit Kenner es wiederfinden. */
  var DIM = {
    TREND: { name: "Trend", frage: "Liegen die großen US-Märkte im Aufwärtstrend?" },
    BREADTH: { name: "Beteiligung", fach: "Marktbreite", frage: "Wie viele Aktien steigen mit?" },
    MOMENTUM: { name: "Schwung", fach: "Momentum", frage: "Hat der Markt Kraft über Monate?" },
    RISK: { name: "Risiko", fach: "Schwankung", frage: "Wie stark schwankt der Markt tatsächlich?" },
    CROSS_ASSET: { name: "Andere Anlagen", fach: "Cross Asset", frage: "Was bewegt sich gleichzeitig bei Zinsen, Gold, Öl und Bitcoin?" }
  };
  var DIM_REIHE = ["TREND", "BREADTH", "MOMENTUM", "RISK", "CROSS_ASSET"];
  var ROLLE = { support: "Unterstützt das Marktbild", neutral: "Noch nicht bestätigt", headwind: "Gegenwind",
                open: "Noch nicht beurteilbar", context: "Kontext – zählt nicht mit" };
  var ROLLE_ZEICHEN = { support: "✓", neutral: "–", headwind: "–", open: "?", context: "·" };
  var CA_NAME = { EQUITY: "Aktien", US10Y: "US-Rendite 10J", GOLD: "Gold", OIL: "Öl", BTC: "Bitcoin", EURUSD: "EUR/USD" };
  var CA_SYM = { EQUITY: "SPY", US10Y: "US10Y", GOLD: "XAUUSD", OIL: "WTI", BTC: "BTCUSD", EURUSD: "EURUSD" };
  var ZEITRAEUME = [{ id: "1W", label: "1W", tage: 7 }, { id: "1M", label: "1M", tage: 31 }, { id: "3M", label: "3M", tage: 92 },
                    { id: "6M", label: "6M", tage: 183 }, { id: "1Y", label: "1J", tage: 366 }];

  /* ---------------------------------------------------------- Icon-System
     Gefuellte Symbole im Stil von iOS-Systemsymbolen: weiss auf einer
     farbigen, abgerundeten Kachel (die Farbe setzt das CSS). Ein Satz fuer
     die ganze Seite - Menue, Kacheln, Listen. Rein dekorativ (aria-hidden):
     Name und Rolle stehen immer daneben als Text. */
  var V = { fill: "currentColor", stroke: "none" };
  function mit(a) { var o = {}; Object.keys(V).forEach(function (k) { o[k] = V[k]; }); Object.keys(a).forEach(function (k) { o[k] = a[k]; }); return o; }
  var GLYPHEN = {
    trend: [["path", { d: "M4 4.5v15h15.5", "stroke-width": "2" }], ["path", { d: "M7.5 15l3.8-4.2 3 2.6L19 7.5" }], ["circle", mit({ cx: 19, cy: 7.5, r: 2 })]],
    balken: [["rect", mit({ x: 3.5, y: 12, width: 4.6, height: 8.5, rx: 1.4 })], ["rect", mit({ x: 9.7, y: 4.5, width: 4.6, height: 16, rx: 1.4 })],
             ["rect", mit({ x: 15.9, y: 8.5, width: 4.6, height: 12, rx: 1.4 })]],
    tacho: [["path", { d: "M4 17.5a8 8 0 1 1 16 0" }], ["path", { d: "M12 17.5l4.3-5.3" }], ["circle", mit({ cx: 12, cy: 17.5, r: 2.2 })]],
    puls: [["path", { d: "M2.5 12.5h4.2l2.2-5.5 3.8 11 2.7-8.2 1.6 2.7h4.5" }]],
    knoten: [["path", { d: "M6 17.5L12 6.5l6 11z", "stroke-width": "1.8" }], ["circle", mit({ cx: 6, cy: 17.5, r: 3 })],
             ["circle", mit({ cx: 18, cy: 17.5, r: 3 })], ["circle", mit({ cx: 12, cy: 6.5, r: 3 })]],
    kompass: [["circle", { cx: 12, cy: 12, r: 8.6, "stroke-width": "2" }], ["path", mit({ d: "M15.6 8.4l-2.2 5-5 2.2 2.2-5z" })]],
    pfeile: [["path", { d: "M8 19.5V5.5M4.3 9.2L8 5.5l3.7 3.7" }], ["path", { d: "M16 4.5v14M12.3 14.8l3.7 3.7 3.7-3.7" }]],
    kurve: [["path", { d: "M4 4.5v15h15.5", "stroke-width": "2" }], ["path", { d: "M7.5 15.5c1.8-3.8 3.6-4.6 5-2.4 1.5 2.2 3.3.9 6-5.1" }]],
    regler: [["path", { d: "M4 7h16M4 12h16M4 17h16", "stroke-width": "1.8", opacity: "0.6" }], ["circle", mit({ cx: 9, cy: 7, r: 2.6 })],
             ["circle", mit({ cx: 15.5, cy: 12, r: 2.6 })], ["circle", mit({ cx: 7.5, cy: 17, r: 2.6 })]],
    funken: [["path", mit({ d: "M10.5 3l1.9 5.3 5.3 1.9-5.3 1.9-1.9 5.3-1.9-5.3-5.3-1.9 5.3-1.9z" })],
             ["path", mit({ d: "M18 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" })]],
    lupe: [["circle", { cx: 10.3, cy: 10.3, r: 5.8, "stroke-width": "2.5" }], ["path", { d: "M14.6 14.6L19.8 19.8", "stroke-width": "3" }]],
    auge: [["path", mit({ d: "M12 5.5c4.7 0 8.1 3.7 9.6 6.5-1.5 2.8-4.9 6.5-9.6 6.5S3.9 14.8 2.4 12C3.9 9.2 7.3 5.5 12 5.5z" })],
           ["circle", { cx: 12, cy: 12, r: 3.3, fill: "currentColor", stroke: "none", class: "dx-glyph-loch" }]],
    blitz: [["path", mit({ d: "M13.4 2.5L5 13.8h6.2l-1.1 7.7 8.9-11.6h-6.3z" })]],
    hoch: [["path", { d: "M3.5 17.5l5.8-5.8 3.6 3.6 7-7.3", "stroke-width": "2.6" }], ["path", { d: "M14.3 8h5.9v5.9", "stroke-width": "2.6" }]],
    runter: [["path", { d: "M3.5 6.5l5.8 5.8 3.6-3.6 7 7.3", "stroke-width": "2.6" }], ["path", { d: "M14.3 16h5.9v-5.9", "stroke-width": "2.6" }]],
    kerzen: [["path", { d: "M6.5 3.5v17M12 6v14M17.5 3v13", "stroke-width": "1.7" }], ["rect", mit({ x: 4.3, y: 7.5, width: 4.4, height: 8, rx: 1.2 })],
             ["rect", mit({ x: 9.8, y: 10, width: 4.4, height: 6.5, rx: 1.2 })], ["rect", mit({ x: 15.3, y: 5, width: 4.4, height: 7.5, rx: 1.2 })]],
    flamme: [["path", mit({ d: "M12.2 2.5c.6 3.3 3 4.9 4.5 7.4 1.6 2.6 1.4 6-.9 8.2a6.4 6.4 0 0 1-10.4-4.9c.1-2.6 1.6-4.1 2.7-5.2.1 1.9.9 3.1 2 3.7-.5-3.6.4-6.7 2.1-9.2z" })]],
    barren: [["path", mit({ d: "M2.8 20.5l1.8-5.6h6.2l1.8 5.6z" })], ["path", mit({ d: "M11.4 20.5l1.8-5.6h6.2l1.8 5.6z" })],
             ["path", mit({ d: "M7.1 13.6l1.8-5.6h6.2l1.8 5.6z" })]],
    bitcoin: [["text", mit({ x: 12, y: 17.6, "text-anchor": "middle", "font-size": "16", "font-weight": "800", "font-family": "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }), "₿"]],
    prozent: [["circle", mit({ cx: 7.5, cy: 7.5, r: 2.8 })], ["circle", mit({ cx: 16.5, cy: 16.5, r: 2.8 })], ["path", { d: "M18 6L6 18", "stroke-width": "2.6" }]],
    saeulen: [["path", mit({ d: "M2.8 9.3L12 3.8l9.2 5.5z" })], ["rect", mit({ x: 4.6, y: 10.6, width: 2.6, height: 6.8, rx: 0.8 })],
              ["rect", mit({ x: 9.2, y: 10.6, width: 2.6, height: 6.8, rx: 0.8 })], ["rect", mit({ x: 13.8, y: 10.6, width: 2.6, height: 6.8, rx: 0.8 })],
              ["rect", mit({ x: 17.4, y: 10.6, width: 2.1, height: 6.8, rx: 0.8 })], ["rect", mit({ x: 2.8, y: 18.4, width: 18.4, height: 2.4, rx: 0.8 })]],
    schild: [["path", mit({ d: "M12 2.6l7.6 3v5.7c0 4.7-3.2 8.5-7.6 10-4.4-1.5-7.6-5.3-7.6-10V5.6z" })],
             ["path", { d: "M8.4 12.1l2.5 2.5 4.8-5", "stroke-width": "2.4", class: "dx-glyph-loch-strich" }]],
    /* Wetter fuer die fuenf Stufen des Marktbarometers */
    sonne: [["circle", mit({ cx: 12, cy: 12, r: 4.6 })], ["path", { d: "M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M5.4 18.6l1.8-1.8M16.8 7.2l1.8-1.8", "stroke-width": "2.2" }]],
    heiter: [["circle", mit({ cx: 10, cy: 9.5, r: 4.2 })], ["path", { d: "M10 2.4v1.8M3 9.5h1.8M5 4.5l1.3 1.3M15 4.5l-1.3 1.3", "stroke-width": "2" }],
             ["path", mit({ d: "M9.5 20.5h9a3.3 3.3 0 0 0 .4-6.6 4.6 4.6 0 0 0-8.8.9 2.9 2.9 0 0 0-.6 5.7z" })]],
    wechselhaft: [["circle", mit({ cx: 8.6, cy: 8.2, r: 4 })], ["path", { d: "M8.6 1.9v1.6M2.3 8.2h1.6M4.2 3.8l1.1 1.1", "stroke-width": "2" }],
                  ["path", mit({ d: "M7 20.6h11a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.7 1.1A3.5 3.5 0 0 0 7 20.6z" })]],
    regen: [["path", mit({ d: "M6.5 15.2h11a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.7 1.1 3.5 3.5 0 0 0-.8 6.9z" })],
            ["path", { d: "M8.5 18l-1 2.6M12.5 18l-1 2.6M16.5 18l-1 2.6", "stroke-width": "2.2" }]],
    gewitter: [["path", mit({ d: "M6.5 14.6h11a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.7 1.1 3.5 3.5 0 0 0-.8 6.9z" })],
               ["path", mit({ d: "M12.8 13.2l-3.4 5h2.6l-1.2 4.4 4.4-6h-2.7l1.4-3.4z" })]],
    waehrung: [["text", mit({ x: 12, y: 16.4, "text-anchor": "middle", "font-size": "12", "font-weight": "800", "letter-spacing": "-0.5", "font-family": "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }), "€$"]]
  };
  /* Dimensionen und Vergleichszeilen auf ihr Symbol. */
  var GLYPH_VON = { TREND: "trend", BREADTH: "balken", MOMENTUM: "tacho", RISK: "puls", CROSS_ASSET: "knoten", ENVIRONMENT: "kompass", US10Y: "prozent" };

  function symbolSvg(key) {
    var teile = GLYPHEN[GLYPH_VON[key] || key];
    if (!global.document || !teile) return null;
    var ns = "http://www.w3.org/2000/svg";
    var svg = global.document.createElementNS(ns, "svg");
    [["viewBox", "0 0 24 24"], ["class", "dx-m3-icon-svg"], ["aria-hidden", "true"], ["fill", "none"], ["stroke", "currentColor"],
     ["stroke-width", "2.3"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]].forEach(function (a) { svg.setAttribute(a[0], a[1]); });
    teile.forEach(function (t) {
      var e = global.document.createElementNS(ns, t[0]);
      Object.keys(t[1]).forEach(function (k) { e.setAttribute(k, t[1][k]); });
      if (t[2]) e.textContent = t[2];
      svg.appendChild(e);
    });
    return svg;
  }
  function iconChip(key, rolle) {
    return el("span", { class: "dx-m3-icon is-" + (rolle || "neutral"), "aria-hidden": "true" }, [symbolSvg(key)].filter(Boolean));
  }

  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function zahl(v, d) {
    try { return new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
    catch (_) { return v.toFixed(d); }
  }
  function tagKurz(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : ""; }
  function uhr(d) {
    try { return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d); }
    catch (_) { return d.toISOString().slice(11, 16); }
  }
  function tagBerlin(d) {
    try { var t = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d); return /\.$/.test(t) ? t : t + "."; }
    catch (_) { return tagKurz(d.toISOString()); }
  }
  /* ISO-Daten in Texten des Core lesbar machen (2026-09-18 -> 18.09.2026). */
  function de(t) {
    return t === null || t === undefined ? t : String(t).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, function (_, j, m, d) { return d + "." + m + "." + j; });
  }
  function prozentLage(g, v) { return Math.max(0, Math.min(100, 100 * (v - g.min) / ((g.max - g.min) || 1))); }
  /* ------------------------------------------------- Radialer Regime-Gauge
     Rein dekorativ (aria-hidden) - dieselben Werte wie das Stufenspektrum
     (env.level, vorherLevel), nur als Bogen statt als Balkenreihe. Keine
     neue Praezision: fuenf Baender, eine Nadel, ein Geisterpunkt fuer die
     vorherige Bewertung. */
  function polar(cx, cy, r, deg) {
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function bogenPfad(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var gross = (a1 - a0) > 180 ? 1 : 0;
    return "M " + p0.x.toFixed(2) + "," + p0.y.toFixed(2) + " A " + r + "," + r + " 0 " + gross + ",1 " + p1.x.toFixed(2) + "," + p1.y.toFixed(2);
  }
  function regimeGauge(env, vorherLevel) {
    if (!global.document || !env.scale || !env.scale.length) return null;
    var n = env.scale.length, ns = "http://www.w3.org/2000/svg";
    var svg = global.document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 220 148");
    svg.setAttribute("class", "dx-m3-gauge-svg");
    svg.setAttribute("aria-hidden", "true");
    function n_(tag, a) { var e = global.document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); svg.appendChild(e); return e; }
    var cx = 110, cy = 120, r = 92, span = 240, start = -120, breite = span / n;
    for (var i = 0; i < n; i++) {
      n_("path", { d: bogenPfad(cx, cy, r, start + i * breite + 2.5, start + (i + 1) * breite - 2.5), class: "dx-m3-gauge-band is-l" + i, fill: "none" });
    }
    if (isNum(vorherLevel) && vorherLevel !== env.level) {
      var vp = polar(cx, cy, r, start + (vorherLevel + 0.5) * breite);
      n_("circle", { cx: vp.x.toFixed(2), cy: vp.y.toFixed(2), r: 5, class: "dx-m3-gauge-vorher" });
    }
    var tip = polar(cx, cy, r - 30, start + (env.level + 0.5) * breite);
    n_("line", { x1: cx, y1: cy, x2: tip.x.toFixed(2), y2: tip.y.toFixed(2), class: "dx-m3-gauge-nadel is-l" + env.level });
    n_("circle", { cx: cx, cy: cy, r: 8, class: "dx-m3-gauge-nabe" });
    return svg;
  }

  /**
   * Bullish / Base Case / Bearish - direkt im Hero sichtbar, damit die
   * Einordnung auf den ersten Blick verstanden wird (Owner-Feedback: die
   * gleiche Zaehlung wie unten bei "Was wuerde das Bild aendern?" fehlte
   * oberhalb der Falz). Dieselben env.counts wie tally() - kein neuer Wert,
   * keine erfundene Wahrscheinlichkeit, nur frueher und vertrauter benannt.
   */
  function szenarioStreifen(env) {
    var c = (env && env.counts) || {};
    var support = c.support || 0, neutral = c.neutral || 0, headwind = c.headwind || 0;
    var summe = support + neutral + headwind;
    if (!summe) return null;
    function pille(art, titel, n) {
      var b = el("button", { type: "button", class: "dx-m3-sz-pille is-" + art,
        "aria-label": titel + ": " + n + " von " + summe + " bewerteten Dimensionen" }, [
        el("b", { text: String(n) }), el("span", { text: titel })
      ]);
      b.onclick = function () { springen("maerkte-aendern"); };
      return b;
    }
    return el("div", { class: "dx-m3-sz-streifen", role: "group", "aria-label": "Szenario-Übersicht: Bullish, Base Case, Bearish" }, [
      pille("bull", "Bullish", support), pille("base", "Base Case", neutral), pille("bear", "Bearish", headwind),
      el("p", { class: "dx-m3-sz-hinweis", text: "Zählung der bewerteten Dimensionen – zum Tippen für die genauen Schwellen." })
    ]);
  }

  function springen(id) {
    var z = global.document && global.document.getElementById(id);
    var ruhig = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (z && z.scrollIntoView) z.scrollIntoView({ behavior: ruhig ? "auto" : "smooth", block: "start" });
  }
  function knopf(text, ziel, cls) {
    var b = el("button", { type: "button", class: cls || "dx-m3-link", "data-ziel": ziel, text: text });
    b.onclick = function () { springen(ziel); };
    return b;
  }
  function kopfzeile(eyebrow, titel, unter) {
    return el("header", { class: "dx-m3-kopf" }, [
      eyebrow ? el("p", { class: "dx-m3-eyebrow", text: eyebrow }) : null,
      el("h2", { text: titel }),
      unter ? el("p", { class: "dx-m3-unter", text: unter }) : null
    ].filter(Boolean));
  }

  /* ------------------------------------------------ Bewertungszyklus */

  /**
   * Naechster planmaessiger Lauf nach dem Zeitplan des Core (alle n
   * Stunden zur Minute m, UTC). Nur ein Planwert: geplante Laeufe koennen
   * sich verzoegern - die Seite sagt deshalb "ca.".
   */
  function naechsteBewertung(schedule, jetzt) {
    if (!schedule || !isNum(schedule.everyHours) || !isNum(schedule.minuteUtc)) return null;
    var t = new Date(jetzt.getTime());
    t.setUTCSeconds(0, 0);
    t.setUTCMinutes(schedule.minuteUtc);
    var h = t.getUTCHours();
    t.setUTCHours(h - (h % schedule.everyHours));
    while (t.getTime() <= jetzt.getTime()) t.setUTCHours(t.getUTCHours() + schedule.everyHours);
    return t;
  }

  /** "Letzte Neubewertung ... · Naechste planmaessig ca. ..." - ehrlich, ohne Sekundenzaehler. */
  function zyklusText(p, jetzt) {
    var ev = p.evaluation || {}, sch = ev.schedule;
    var letzte = ev.generatedAt ? new Date(ev.generatedAt) : (p.generatedAt ? new Date(p.generatedAt) : null);
    var teile = [];
    if (letzte) teile.push("Letzte Neubewertung " + tagBerlin(letzte) + ", " + uhr(letzte) + " Uhr");
    var n = naechsteBewertung(sch, jetzt);
    if (n) teile.push("nächste planmäßig ca. " + (tagBerlin(n) !== tagBerlin(jetzt) ? tagBerlin(n) + ", " : "") + uhr(n) + " Uhr");
    var verspaetet = letzte && sch && isNum(sch.everyHours) && jetzt.getTime() - letzte.getTime() > 2 * sch.everyHours * 3600000;
    return { text: teile.join(" · "), verspaetet: !!verspaetet,
             hinweis: verspaetet ? "Die letzte planmäßige Neubewertung ist ausgeblieben – angezeigt wird der letzte gültige Stand." : "Geplante Läufe können sich um einige Minuten verzögern." };
  }

  /* ------------------------------------------------------------- Hero */

  function spektrum(env, vorher) {
    var skala = env.scale || [];
    return el("div", { class: "dx-m3-spektrum", role: "img",
      "aria-label": "Stufe " + (env.level + 1) + " von " + skala.length + ": " + env.label + (isNum(vorher) && vorher !== env.level ? ", vorher " + skala[vorher].label : "") }, skala.map(function (s, i) {
      return el("span", { class: "dx-m3-stufe is-l" + i + (i === env.level ? " is-aktiv" : "") + (isNum(vorher) && i === vorher && vorher !== env.level ? " is-vorher" : ""),
                          "data-level": i }, [el("i", { "aria-hidden": "true" }), el("b", { text: s.label })]);
    }));
  }

  function hero(p, jetzt) {
    var env = p.environment;
    if (!env || env.level === null || env.level === undefined) {
      return el("section", { class: "dx-m3-hero is-offen", id: "maerkte-umfeld", "aria-label": "Marktumfeld" }, [
        el("p", { class: "dx-m3-eyebrow", text: "Marktumfeld" }),
        el("p", { class: "dx-m3-zustand", text: "Nicht bestimmbar" }),
        el("p", { class: "dx-m3-aussage", text: (env && env.statement) || "Für eine Einordnung fehlen gerade Trend, Momentum oder Risiko." })
      ]);
    }
    var cmp = p.comparison && p.comparison.state === "AVAILABLE" ? p.comparison : null;
    var envZeile = cmp ? cmp.rows.filter(function (r) { return r.key === "ENVIRONMENT"; })[0] : null;
    var vorherLevel = null;
    if (envZeile && env.scale) env.scale.forEach(function (s, i) { if (s.label === envZeile.from) vorherLevel = i; });
    var z = zyklusText(p, jetzt);
    var c = env.counts || {};
    var zaehlung = [c.support + " unterstützen", c.neutral + " noch nicht bestätigt", c.headwind + " Gegenwind", c.open ? c.open + " nicht beurteilbar" : null]
      .filter(Boolean).join(" · ");
    /* Die Gruende auf einen Blick - dieselben Rollen wie unter "Warum?". */
    var gruende = [];
    ["support", "headwind", "neutral", "open", "context"].forEach(function (r) {
      (env.why[r] || []).forEach(function (x) { gruende.push({ r: r, x: x }); });
    });
    var blick = el("div", { class: "dx-m3-blick" }, [
      el("p", { class: "dx-m3-blick-titel", text: "Die Gründe auf einen Blick" }),
      el("ul", { tabindex: "0" }, gruende.map(function (g) {
        return el("li", { class: "is-" + g.r }, [iconChip(g.x.dimension, g.r),
          el("span", {}, [el("b", { text: DIM[g.x.dimension].name }), el("small", { text: g.x.label + " · " + ROLLE[g.r] })])]);
      })),
      el("p", { class: "dx-m3-zaehlung", text: zaehlung })
    ]);
    var veraenderung = cmp ? el("p", { class: "dx-m3-seit is-" + String(cmp.biggest.change).toLowerCase() }, [
      el("span", { text: "Seit der Bewertung vom " + tagKurz(cmp.previousDate) }),
      el("b", { text: cmp.biggest.text })
    ]) : null;
    return el("section", { class: "dx-m3-hero is-l" + env.level, id: "maerkte-umfeld", "aria-label": "Marktumfeld", "data-environment": env.state }, [
      el("p", { class: "dx-m3-eyebrow", text: "Marktumfeld · Datenstand Handelstag " + tagKurz(p.evaluation && p.evaluation.dataAsOf) }),
      el("div", { class: "dx-m3-hero-raster" }, [
        el("div", { class: "dx-m3-hero-haupt" }, [
          el("h2", { class: "dx-m3-zustand", text: env.label }),
          el("div", { class: "dx-m3-gauge" }, [regimeGauge(env, vorherLevel), spektrum(env, vorherLevel)].filter(Boolean)),
          el("p", { class: "dx-m3-aussage", text: env.statement }),
          el("div", { class: "dx-m3-anleger" }, [el("span", { text: "Für Anleger bedeutet das" }), el("p", { text: env.investor })]),
          szenarioStreifen(env),
          veraenderung
        ].filter(Boolean)),
        blick
      ]),
      el("div", { class: "dx-m3-hero-aktionen" }, [knopf("Warum diese Einordnung?", "maerkte-warum", "dx-m3-cta"),
                                                    knopf("Bullish & Bearish ansehen", "maerkte-aendern", "dx-m3-cta is-leise")]),
      el("p", { class: "dx-m3-zyklus" + (z.verspaetet ? " is-verspaetet" : "") }, [el("span", { text: z.text }), el("span", { class: "dx-m3-zyklus-hinweis", text: z.hinweis })]),
      el("p", { class: "dx-m3-rechtlich", text: env.disclaimer })
    ].filter(Boolean));
  }

  /* ------------------------------------------ Kacheln: auf einen Blick
     Grosse, antippbare Kacheln wie in einer News- oder Streaming-App: je
     Thema ein Bild (Diagramm oder Piktogramm aus denselben Werten wie die
     Sektionen darunter), eine farbige Dachzeile, eine grosse Schlagzeile.
     Jede Kachel springt zu ihren Belegen. Keine neue Zahl, kein neuer
     Zustand - nur ein schnellerer Einstieg. */
  var ROLLE_KURZ = { support: "Unterstützt", neutral: "Nicht bestätigt", headwind: "Gegenwind", open: "Offen", context: "Kontext" };

  function kachel(o) {
    var link = el("button", { type: "button", class: "dx-m3-kachel-link", text: o.titel });
    link.onclick = function () {
      var z = global.document && global.document.getElementById(o.ziel);
      if (z && z.tagName === "DETAILS") z.open = true;
      springen(o.ziel);
    };
    return el("article", { class: "dx-m3-kachel" + (o.breit ? " is-breit" : "") + " is-" + o.ton, "data-kachel": o.id }, [
      el("div", { class: "dx-m3-kachel-bild", "aria-hidden": "true" }, o.bild.filter(Boolean)),
      el("p", { class: "dx-m3-kachel-kicker", text: o.kicker }),
      el("h3", { class: "dx-m3-kachel-titel" }, [link]),
      o.text ? el("p", { class: "dx-m3-kachel-text", text: o.text }) : null
    ].filter(Boolean));
  }

  /* Die Stufe je Tag als Treppenlinie ueber fuenf getoenten Baendern - wo
     die Linie liegt, sagt die Farbe des Bandes. Dieselben Tageswerte wie
     der Verlauf weiter unten. */
  function verlaufMini(tage, skala) {
    if (!global.document || tage.length < 2) return null;
    var ns = "http://www.w3.org/2000/svg", W = 600, H = 150, oben = 6, stufen = skala.length;
    var svg = global.document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("class", "dx-m3-kk-kurve");
    function n(tag, a) { var e = global.document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); svg.appendChild(e); return e; }
    var band = (H - 2 * oben) / stufen;
    var y = function (l) { return oben + (stufen - 1 - l) * band + band / 2; };
    var x = function (i) { return 4 + (W - 22) * i / (tage.length - 1); };
    for (var l = 0; l < stufen; l++) n("rect", { x: 0, y: oben + (stufen - 1 - l) * band, width: W, height: band - 2, rx: 4, class: "dx-m3-kk-band is-l" + l });
    var d = "", erstesX = null, letzter = null;
    tage.forEach(function (t, i) {
      if (!isNum(t.env)) return;
      var px = x(i).toFixed(1), py = y(t.env).toFixed(1);
      if (!d) { d = "M" + px + " " + py; erstesX = px; } else d += " H" + px + " V" + py;
      letzter = { x: px, y: py, env: t.env };
    });
    if (!letzter) return null;
    n("path", { d: d + " V" + H + " H" + erstesX + " Z", class: "dx-m3-kk-flaeche" });
    n("path", { d: d, class: "dx-m3-kk-linie", fill: "none" });
    n("circle", { cx: letzter.x, cy: letzter.y, r: 8, class: "dx-m3-kk-punkt is-l" + letzter.env });
    return svg;
  }

  function kacheln(p, h) {
    var env = p.environment;
    if (!env || env.level === null || env.level === undefined) return null;
    var dims = p.dimensions || {}, g = p.gauges || {}, skalaStufen = env.scale || [];
    var rolle = {};
    if (env.why) Object.keys(env.why).forEach(function (r) { env.why[r].forEach(function (x) { rolle[x.dimension] = r; }); });
    var liste = [];

    /* 1 - Verlauf ueber 12 Monate */
    if (h && h.days && h.days.length > 1 && skalaStufen.length) {
      var bis = h.days[h.days.length - 1].date;
      var abD = new Date(bis + "T00:00:00Z"); abD.setUTCDate(abD.getUTCDate() - 366);
      var ab = abD.toISOString().slice(0, 10);
      var tage = h.days.filter(function (t) { return t.date >= ab; });
      var erster = tage.filter(function (t) { return isNum(t.env); })[0], letzter = tage[tage.length - 1];
      if (erster && isNum(letzter.env)) {
        var von = skalaStufen[erster.env].label, nach = skalaStufen[letzter.env].label;
        var wechsel = (h.events || []).filter(function (e) { return e.dimension === "ENVIRONMENT" && e.date >= ab; }).length;
        liste.push(kachel({ id: "verlauf", breit: true, ton: "l" + letzter.env, ziel: "maerkte-verlauf", kicker: "Verlauf · 12 Monate",
          titel: von === nach ? "Heute wie vor einem Jahr: „" + nach + "“" : "Von „" + von + "“ zu „" + nach + "“",
          text: "Seit " + de(erster.date) + ": " + wechsel + " Wechsel der Einordnung.",
          bild: [verlaufMini(tage, skalaStufen)] }));
      }
    }

    /* 2-5 - die vier bewerteten Dimensionen */
    ["TREND", "BREADTH", "MOMENTUM", "RISK"].forEach(function (k) {
      var d = dims[k];
      if (!d) return;
      var r = rolle[k] || "open", ga = g[k];
      liste.push(kachel({ id: k.toLowerCase(), ton: r, ziel: "puls-" + k.toLowerCase(), kicker: DIM[k].name, titel: d.label,
        text: de(ga ? ga.valueText : d.summary),
        bild: [el("div", { class: "dx-m3-kk-kopf" }, [iconChip(k, r), el("span", { class: "dx-m3-kk-rolle", text: ROLLE_KURZ[r] })]),
               ga ? skala(k, ga, d) : null] }));
    });

    /* 6 - Cross Asset: die Konstellation */
    var ca = dims.CROSS_ASSET;
    if (ca && ca.evidence && ca.evidence.length) {
      var obs = ca.observations || [];
      var deutlich = ca.evidence.filter(function (e) { return e.notable; }).length;
      liste.push(kachel({ id: "cross-asset", breit: true, ton: "context", ziel: "maerkte-crossasset", kicker: "Andere Anlagen · ein Monat",
        titel: obs.length ? obs[0].text.replace(/\.$/, "") : "Ruhiges Gesamtbild über die Anlageklassen",
        text: deutlich + " von " + ca.evidence.length + " Anlageklassen deutlich bewegt" + (obs.length > 1 ? " · " + obs.slice(1).map(function (o) { return o.text; }).join(" ") : "."),
        bild: [konstellation(ca.evidence)] }));
    }

    /* 7 - Seit der letzten Bewertung */
    var cmp = p.comparison && p.comparison.state === "AVAILABLE" ? p.comparison : null;
    if (cmp) {
      var envZ = cmp.rows.filter(function (r) { return r.key === "ENVIRONMENT"; })[0];
      var ch = String(cmp.biggest.change).toLowerCase();
      liste.push(kachel({ id: "veraenderung", breit: true, ton: ch === "better" ? "support" : ch === "worse" ? "headwind" : "neutral",
        ziel: "maerkte-vorher-jetzt", kicker: "Seit der Bewertung vom " + tagKurz(cmp.previousDate), titel: cmp.biggest.text,
        text: "Gleiche Methode: Handelstag " + tagKurz(cmp.previousDate) + " gegenüber " + tagKurz(cmp.currentDate),
        bild: !envZ ? [] : [el("div", { class: "dx-m3-kk-wechsel" }, envZ.from === envZ.to
          ? [el("b", { text: envZ.to }), el("span", { class: "dx-m3-kk-rolle", text: "Marktumfeld unverändert" })]
          : [el("span", { text: envZ.from }), el("i", { text: ch === "better" ? "↗" : ch === "worse" ? "↘" : "→" }), el("b", { text: envZ.to })])] }));
    }

    /* 8 - Worauf es jetzt ankommt */
    var w = p.whatMatters && p.whatMatters[0];
    if (w) {
      liste.push(kachel({ id: "worauf", breit: true, ton: rolle[w.dimension] || "neutral", ziel: "maerkte-worauf", kicker: "Worauf es jetzt ankommt",
        titel: w.title, text: "Jetzt: " + w.stateLabel + (p.whatMatters.length > 1 ? " · " + p.whatMatters.length + " Punkte im Blick" : ""),
        bild: [el("div", { class: "dx-m3-kk-kopf" }, [el("span", { class: "dx-m3-kk-nr", text: "01" }), DIM[w.dimension] ? iconChip(w.dimension, rolle[w.dimension]) : null].filter(Boolean))] }));
    }

    if (!liste.length) return null;
    return el("section", { class: "dx-m3-kacheln", id: "maerkte-ueberblick", "aria-label": "Der Markt auf einen Blick" }, [
      kopfzeile("Auf einen Blick", "Der Markt in " + liste.length + " Kacheln", "Jede Kachel zeigt ein Thema mit seinem echten Messwert – antippen führt zu Belegen und Methodik."),
      el("div", { class: "dx-m3-kachel-raster" }, liste)
    ]);
  }

  /* ------------------------------------------- Die fuenf Dimensionen */

  function tiefe(d) {
    return el("div", { class: "dx-m3-tiefe" }, [
      el("h3", { text: "Zustand" }), el("p", { text: d.label + ". " + de(d.summary) }),
      d.evidence && d.evidence.length ? el("h3", { text: "Belege" }) : null,
      d.evidence && d.evidence.length ? el("ul", {}, d.evidence.map(function (e) {
        return el("li", { class: e.current === false ? "is-alt" : "" }, [el("span", { text: e.label + ": " }), el("b", { text: e.text }),
          e.current === false ? el("span", { class: "dx-m3-alt", text: " · Stand " + tagKurz(e.asOf) + ", nicht aktuell" }) : null].filter(Boolean));
      })) : null,
      d.explanation ? el("h3", { text: "Was bedeutet das?" }) : null,
      d.explanation ? el("p", { text: d.explanation }) : null,
      el("h3", { text: "Methodik" }), el("p", { class: "dx-m3-methodik", text: d.methodology })
    ].filter(Boolean));
  }

  function skala(k, g, d) {
    var aktuell = g.current !== false;
    var kinder = (g.zones || []).map(function (z) {
      var a = prozentLage(g, z.from), b = prozentLage(g, z.to);
      return el("span", { class: "dx-m3-zone is-" + z.tone, style: "left:" + a + "%;width:" + Math.max(0, b - a) + "%" });
    });
    (g.marks || []).forEach(function (m) {
      kinder.push(el("span", { class: "dx-m3-marke", style: "left:" + prozentLage(g, m.at) + "%", title: m.label }, [el("em", { text: m.label })]));
    });
    if (k === "CROSS_ASSET" && d && d.evidence) {
      /* Jede Anlageklasse als Punkt: Monatsbewegung im Vielfachen einer typischen Bewegung (-3..+3). */
      d.evidence.forEach(function (e) {
        if (!isNum(e.ratio)) return;
        var lage = 50 + Math.max(-3, Math.min(3, e.ratio)) / 3 * 50;
        kinder.push(el("span", { class: "dx-m3-punkt" + (e.notable ? " is-deutlich" : ""), style: "left:" + lage + "%", title: (CA_NAME[e.key] || e.key) + ": " + e.text }));
      });
      kinder.push(el("span", { class: "dx-m3-marke is-mitte", style: "left:50%" }));
      kinder.push(el("span", { class: "dx-m3-marke is-leise", style: "left:" + (50 - 50 / 3) + "%" }));
      kinder.push(el("span", { class: "dx-m3-marke is-leise", style: "left:" + (50 + 50 / 3) + "%" }));
    } else {
      var nach = prozentLage(g, g.value);
      var von = isNum(g.previous) ? prozentLage(g, g.previous) : nach;
      if (isNum(g.previous) && Math.abs(von - nach) > 0.5) kinder.push(el("span", { class: "dx-m3-vorher", style: "left:" + von + "%", title: "Vorherige Bewertung" }));
      kinder.push(el("span", { class: "dx-m3-zeiger" + (aktuell ? "" : " is-alt"), style: "left:" + nach + "%;--von:" + von + "%;--nach:" + nach + "%" }));
    }
    return el("div", { class: "dx-m3-spur" + (aktuell ? "" : " is-alt") + (g.context ? " is-kontext" : ""), "aria-hidden": "true" }, kinder);
  }

  function landkarte(p) {
    var dims = p.dimensions || {}, g = p.gauges || {};
    var rolle = {};
    var env = p.environment;
    if (env && env.why) Object.keys(env.why).forEach(function (r) { env.why[r].forEach(function (x) { rolle[x.dimension] = r; }); });
    var zeilen = DIM_REIHE.filter(function (k) { return dims[k]; }).map(function (k) {
      var d = dims[k], ga = g[k];
      var r = rolle[k] || (k === "CROSS_ASSET" ? "context" : "open");
      var wert = de(ga ? ga.valueText : d.summary);
      if (ga && isNum(ga.previous) && ga.previous !== ga.value && ga.previousDate) {
        wert += " · vorher " + (ga.unit === "COUNT" ? ga.previous : zahl(ga.previous, 1) + " %");
      }
      var kopf = el("summary", { class: "dx-m3-dim-kopf" }, [
        el("span", { class: "dx-m3-dim-name" }, [iconChip(k, r),
          el("span", { class: "dx-m3-dim-txt" }, [el("b", { text: DIM[k].name }), el("small", { text: DIM[k].frage + (DIM[k].fach ? " · " + DIM[k].fach : "") })])]),
        el("span", { class: "dx-m3-dim-zustand is-" + r }, [el("i", { "aria-hidden": "true", text: ROLLE_ZEICHEN[r] }), el("b", { text: d.label }), el("small", { text: ROLLE[r] })]),
        ga ? skala(k, ga, d) : el("span", { class: "dx-m3-spur is-leer", "aria-hidden": "true" }),
        el("span", { class: "dx-m3-dim-wert", text: wert })
      ]);
      return el("details", { class: "dx-m3-dim is-" + r, id: "puls-" + k.toLowerCase(), "data-dimension": k, "data-state": d.state }, [kopf, tiefe(d)]);
    });
    return el("section", { class: "dx-m3-karte", id: "maerkte-dimensionen", "aria-label": "Die fünf Dimensionen des Marktumfelds" }, [
      kopfzeile("Die Messwerte im Detail", "Fünf Messwerte, ein Bild",
        "Aus diesen fünf Messwerten entsteht die Einordnung. Jede Zeile zeigt den Wert auf seiner Skala mit den echten Schwellen; der Ring markiert die vorherige Bewertung. Antippen für Belege und Methodik."),
      el("div", { class: "dx-m3-dims" }, zeilen),
      el("p", { class: "dx-m3-fuss", text: "Makro-Umfeld (Inflation, Wachstum, Arbeitsmarkt): noch nicht zertifiziert und deshalb nicht Teil der Einordnung. Kein Gesamtscore." })
    ]);
  }

  /* --------------------------------------------------- Vorher -> Jetzt */

  var AENDERUNG = { BETTER: "verbessert", WORSE: "verschlechtert", UNCHANGED: "unverändert", UNKNOWN: "nicht vergleichbar", CHANGED: "verändert", CONTEXT: "" };

  function vorherJetzt(p) {
    var c = p.comparison;
    if (!c || c.state !== "AVAILABLE") return null;
    var zeilen = c.rows.map(function (r) {
      var zahlen = r.key === "US10Y" ? r.deltaText
        : (r.fromValue || r.toValue ? (r.fromValue === r.toValue ? r.toValue : (r.fromValue || "–") + " → " + (r.toValue || "–")) : null);
      var gleich = r.from === r.to || r.from === "–";
      var ton = r.change === "BETTER" ? "support" : r.change === "WORSE" ? "headwind" : r.key === "US10Y" || r.change === "CONTEXT" ? "context" : "neutral";
      var kern = [
        el("span", { class: "dx-m3-vj-kopf" }, [iconChip(r.key, ton), el("span", { class: "dx-m3-vj-name", text: r.label }),
          el("span", { class: "dx-m3-vj-status is-" + String(r.change).toLowerCase(), text: AENDERUNG[r.change] || "" })]),
        el("span", { class: "dx-m3-vj-wechsel" }, gleich ? [el("b", { text: r.to })]
          : [el("span", { class: "dx-m3-vj-von", text: r.from }), el("span", { class: "dx-m3-vj-pfeil", "aria-hidden": "true", text: " → " }), el("b", { text: r.to })]),
        zahlen ? el("span", { class: "dx-m3-vj-zahl", text: zahlen }) : null
      ].filter(Boolean);
      var sr = r.label + ": " + r.from + " zu " + r.to + (AENDERUNG[r.change] ? ", " + AENDERUNG[r.change] : "");
      return r.symbol
        ? el("li", {}, [el("a", { class: "dx-m3-vj-zeile is-link" + (c.biggest.key === r.key ? " is-top" : ""), href: "#/maerkte/" + r.symbol, "aria-label": sr }, kern)])
        : el("li", {}, [el("div", { class: "dx-m3-vj-zeile" + (c.biggest.key === r.key ? " is-top" : ""), "aria-label": sr }, kern)]);
    });
    return el("section", { class: "dx-m3-vj", id: "maerkte-vorher-jetzt", "aria-label": "Vorher und jetzt" }, [
      kopfzeile("Letzte Bewertung → jetzt", "Was hat sich verändert?", "Handelstag " + tagKurz(c.previousDate) + " gegenüber " + tagKurz(c.currentDate) + ", gleiche Methode. Eine Zahl, die sich bewegt, ohne die Schwelle zu kreuzen, ändert keinen Zustand."),
      el("p", { class: "dx-m3-vj-top is-" + String(c.biggest.change).toLowerCase() }, [el("span", { text: c.biggest.key ? "Größte Veränderung" : "Ergebnis" }), el("b", { text: c.biggest.text })]),
      el("ul", { class: "dx-m3-vj-liste" }, zeilen),
      ereignisse(p.recentEvents, "Letzte Zustandswechsel")
    ].filter(Boolean));
  }

  var DIM_NAME_EV = { ENVIRONMENT: "Marktumfeld", TREND: "Trend", MOMENTUM: "Momentum", RISK: "Risiko", BREADTH: "Marktbreite" };
  function ereignisse(ev, titel) {
    if (!ev || !ev.length) return null;
    return el("div", { class: "dx-m3-ereignisse" }, [el("h3", { text: titel }), el("ol", {}, ev.map(function (e) {
      var ch = String(e.change).toLowerCase();
      return el("li", { class: "is-" + ch }, [
        iconChip(e.dimension, ch === "better" ? "support" : ch === "worse" ? "headwind" : "neutral"),
        el("div", { class: "dx-m3-ev-text" }, [el("b", { text: DIM_NAME_EV[e.dimension] || e.dimension }),
          el("span", {}, [document_text(e.from + " → "), el("strong", { text: e.to })])]),
        el("time", { text: tagKurz(e.date) })
      ]);
    }))]);
  }

  /* ---------------------------------------------------------- Warum? */

  function warum(p) {
    var env = p.environment;
    if (!env || !env.why) return null;
    var w = env.why;
    function spalte(r, xs) {
      if (!xs.length) return null;
      return el("div", { class: "dx-m3-warum-spalte is-" + r }, [el("h3", { text: ROLLE[r] }), el("ul", {}, xs.map(function (x) {
        return el("li", {}, [iconChip(x.dimension, r), el("span", {}, [el("b", { text: (DIM[x.dimension] || {}).name || x.dimension }), document_text(" " + de(x.text))])]);
      }))]);
    }
    return el("section", { class: "dx-m3-warum", id: "maerkte-warum", "aria-label": "Warum diese Einordnung?" }, [
      kopfzeile("Einordnung: " + env.label, "Warum kommt Vision Universe zu dieser Einordnung?", env.explanation),
      el("div", { class: "dx-m3-warum-raster" }, [spalte("support", w.support), spalte("headwind", w.headwind), spalte("neutral", w.neutral),
                                                  spalte("open", w.open), spalte("context", w.context)].filter(Boolean)),
      el("details", { class: "dx-m3-regel" }, [el("summary", { text: "Wie die Einordnung entsteht" }), el("p", { text: env.methodology })])
    ]);
  }
  function document_text(t) { return global.document ? global.document.createTextNode(t) : { text: t }; }

  /* ------------------------------------------ Worauf es jetzt ankommt */

  function worauf(p, namen) {
    var xs = p.whatMatters;
    if (!xs || !xs.length) return null;
    var rolle = {}, why = p.environment && p.environment.why;
    if (why) Object.keys(why).forEach(function (r) { why[r].forEach(function (x) { rolle[x.dimension] = r; }); });
    return el("section", { class: "dx-m3-worauf", id: "maerkte-worauf", "aria-label": "Worauf es jetzt ankommt" }, [
      kopfzeile("Beobachten", "Worauf es jetzt ankommt", "Nicht die größten Bewegungen – die Faktoren, die das Marktbild tragen oder kippen könnten. Die genauen Schwellen stehen darunter."),
      el("ol", { class: "dx-m3-worauf-liste" }, xs.map(function (x, i) {
        var links = (x.symbols || []).slice(0, 2).map(function (s) { return el("a", { class: "dx-m3-chip", href: "#/maerkte/" + encodeURIComponent(s), text: (namen[s] || s) + " ansehen" }); });
        if (x.anchor && x.dimension === "BREADTH") links.push(knopf("Zur Marktbreite", "maerkte-breite", "dx-m3-chip"));
        if (x.anchor && x.dimension !== "BREADTH" && x.dimension !== "CROSS_ASSET") links.push(knopf("Belege", x.anchor, "dx-m3-chip is-leise"));
        return el("li", { class: "dx-m3-punkt-item", "data-dimension": x.dimension }, [
          el("span", { class: "dx-m3-nr", "aria-hidden": "true", "data-nr": String(i + 1).padStart(2, "0") }),
          el("div", {}, [
            el("div", { class: "dx-m3-punkt-kopf" }, [iconChip(x.dimension, rolle[x.dimension] || (x.dimension === "CROSS_ASSET" ? "context" : "neutral")),
              el("p", { class: "dx-m3-zustandzeile", text: "Jetzt: " + x.stateLabel })]),
            el("h3", { text: x.title }),
            el("p", { text: de(x.why) }),
            links.length ? el("div", { class: "dx-m3-chips" }, links) : null
          ].filter(Boolean))
        ]);
      }))
    ]);
  }

  /* ------------------------------------- Was wuerde das Bild aendern? */

  /**
   * Kein erfundener Wahrscheinlichkeitswert: ein realer, nachvollziehbarer
   * Tally der bereits bewerteten Dimensionen (env.counts) - "wie viele
   * sprechen dafuer/dagegen", nicht "wie wahrscheinlich ist ein Anstieg".
   * "open" (nicht beurteilbar) und "context" (stimmt nicht ab) zaehlen
   * bewusst nicht mit, wie im Marktumfeld selbst auch.
   */
  function tally(env) {
    var c = (env && env.counts) || {};
    var support = c.support || 0, neutral = c.neutral || 0, headwind = c.headwind || 0;
    var summe = support + neutral + headwind;
    if (!summe) return null;
    var pct = function (n) { return Math.round(100 * n / summe); };
    return el("div", { class: "dx-m3-tally", role: "img",
      "aria-label": support + " von " + summe + " bewerteten Dimensionen unterstuetzen das Bild, " + neutral + " neutral, " + headwind + " Gegenwind" }, [
      el("div", { class: "dx-m3-tally-spur" }, [
        el("span", { class: "dx-m3-tally-support", style: "width:" + pct(support) + "%" }),
        el("span", { class: "dx-m3-tally-neutral", style: "width:" + pct(neutral) + "%" }),
        el("span", { class: "dx-m3-tally-headwind", style: "width:" + pct(headwind) + "%" })
      ]),
      el("p", { class: "dx-m3-tally-text", text: support + " von " + summe + " bewerteten Dimensionen unterstützen das Bild" +
        (headwind ? ", " + headwind + " " + (headwind === 1 ? "ist" : "sind") + " Gegenwind" : "") + "." }),
      el("p", { class: "dx-m3-tally-hinweis", text: "Zählung der Dimensionen, keine Kurs- oder Renditewahrscheinlichkeit." })
    ]);
  }

  function basisKarte(env) {
    if (!env || env.level === null || env.level === undefined) return null;
    return el("div", { class: "dx-m3-basis-karte is-l" + env.level }, [
      el("p", { class: "dx-m3-basis-eyebrow" }, [el("span", { class: "dx-m3-sz-tag is-base", text: "Base Case" }), document_text(" · aktuelle Einordnung")]),
      el("p", { class: "dx-m3-basis-zustand", text: env.label }),
      el("p", { class: "dx-m3-basis-aussage", text: env.statement }),
      tally(env)
    ].filter(Boolean));
  }

  function bildAendern(p, namen) {
    var c = p.changes;
    if (!c || (!c.better.length && !c.worse.length)) return null;
    function spalte(art, xs, r) {
      return el("div", { class: "dx-m3-aendern-spalte is-" + r }, [
        el("div", { class: "dx-m3-aendern-kopf" }, [iconChip(r === "besser" ? "hoch" : "runter", r === "besser" ? "support" : "headwind"),
          el("h3", {}, [el("span", { class: "dx-m3-sz-tag is-" + r, text: art }), document_text(" – was müsste eintreten?")])]),
        xs.length ? el("ul", {}, xs.map(function (x) {
          return el("li", {}, [
            el("div", { class: "dx-m3-bed-kopf" }, [iconChip(x.dimension, r === "besser" ? "support" : "headwind"),
              el("div", {}, [el("p", { class: "dx-m3-aendern-ziel" }, [el("b", { text: (DIM[x.dimension] || {}).name }), document_text(" → " + x.toLabel)]),
                el("span", { class: "dx-m3-bed-stufe is-" + r, text: "Einordnung dann: " + x.levelLabel })])]),
            el("p", { class: "dx-m3-bed-text", text: de(x.text.charAt(0).toUpperCase() + x.text.slice(1)) + "." }),
            x.symbols && x.symbols.length ? el("div", { class: "dx-m3-chips" }, x.symbols.map(function (s) {
              return el("a", { class: "dx-m3-chip", href: "#/maerkte/" + encodeURIComponent(s), text: namen[s] || s });
            })) : null
          ].filter(Boolean));
        })) : el("p", { class: "dx-m3-leer", text: "Keine einzelne Veränderung würde die Einordnung in diese Richtung verschieben." })]);
    }
    return el("section", { class: "dx-m3-aendern", id: "maerkte-aendern", "aria-label": "Bullish, Base Case, Bearish – was würde das Marktbild verändern?" }, [
      kopfzeile("Bullish, Base Case, Bearish", "Was müsste passieren, damit sich die Einordnung ändert?", "Mit derselben Regel gerechnet: welche einzelne Veränderung die Einordnung „" +
        (p.environment ? p.environment.label : "") + "“ verschieben würde. Echte Schwellen, aktuelle Messwerte – keine Prognose, keine erfundene Wahrscheinlichkeit."),
      el("div", { class: "dx-m3-aendern-raster" }, [spalte("Bullish", c.better, "besser"), basisKarte(p.environment),
                                                    spalte("Bearish", c.worse, "schlechter")].filter(Boolean))
    ]);
  }

  /* ------------------------------------------------ Marktumfeld-Verlauf */

  function verlaufSvg(tage, skala, breite) {
    var H = 190, links = 0, oben = 10, unten = 26, rechts = 0;
    var ns = "http://www.w3.org/2000/svg";
    if (!global.document) return null;
    var svg = global.document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + breite + " " + H);
    svg.setAttribute("class", "dx-m3-verlauf-svg");
    svg.setAttribute("aria-hidden", "true");
    function n(tag, a) { var e = global.document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); svg.appendChild(e); return e; }
    var stufen = skala.length, hoehe = (H - oben - unten) / stufen;
    var x = function (i) { return links + (breite - links - rechts) * (tage.length === 1 ? 1 : i / (tage.length - 1)); };
    var y = function (l) { return oben + (stufen - 1 - l) * hoehe; };
    for (var l = 0; l < stufen; l++) n("rect", { x: 0, y: y(l), width: breite, height: hoehe, class: "dx-m3-v-band is-l" + l });
    /* Laeufe gleicher Stufe als farbige Balken. */
    var start = 0;
    for (var i = 1; i <= tage.length; i++) {
      if (i === tage.length || tage[i].env !== tage[start].env) {
        var lv = tage[start].env;
        if (isNum(lv)) n("rect", { x: x(start), y: y(lv) + 2, width: Math.max(2, x(i - 1) - x(start) + (breite / Math.max(1, tage.length - 1))), height: hoehe - 4, rx: 3, class: "dx-m3-v-lauf is-l" + lv });
        start = i;
      }
    }
    /* Die Kurve: dieselben taeglichen Stufenwerte als verbundene Linie
       ueber den Baendern - liest sich wie ein Kursverlauf, bleibt aber
       exakt die diskrete Stufe des Tages, keine erfundene Zwischenwertung. */
    var kurve = [];
    tage.forEach(function (t, i) { if (isNum(t.env)) kurve.push(x(i).toFixed(1) + "," + (y(t.env) + hoehe / 2).toFixed(1)); });
    if (kurve.length > 1) n("polyline", { points: kurve.join(" "), class: "dx-m3-v-kurve", fill: "none" });
    var letzter = tage[tage.length - 1];
    if (isNum(letzter.env)) n("circle", { cx: x(tage.length - 1) - 4, cy: y(letzter.env) + hoehe / 2, r: 5, class: "dx-m3-v-jetzt" });
    var t0 = n("text", { x: 2, y: H - 8, class: "dx-m3-v-datum" }); t0.textContent = tagKurz(tage[0].date);
    var t1 = n("text", { x: breite - 2, y: H - 8, "text-anchor": "end", class: "dx-m3-v-datum" }); t1.textContent = tagKurz(letzter.date);
    return svg;
  }

  function verlauf(h, p) {
    if (!h || !h.days || h.days.length < 2) return null;
    var skala = (p.environment && p.environment.scale) || (h.method && h.method.levels) || [];
    if (!skala.length) return null;
    var aktiv = "1Y";
    var box = el("div", { class: "dx-m3-verlauf-box" });
    var legende = el("ol", { class: "dx-m3-v-legende", "aria-hidden": "true" }, skala.slice().reverse().map(function (s, i) {
      return el("li", { class: "is-l" + (skala.length - 1 - i), text: s.label });
    }));
    var zusammenfassung = el("p", { class: "dx-m3-v-sr" });
    var evBox = el("div", { class: "dx-m3-v-ereignisse" });
    var leiste = el("div", { class: "dx-tf dx-m3-tf", role: "group", "aria-label": "Zeitraum des Verlaufs" });
    function zeichnen() {
      var z = ZEITRAEUME.filter(function (x) { return x.id === aktiv; })[0];
      var bis = h.days[h.days.length - 1].date;
      var abD = new Date(bis + "T00:00:00Z"); abD.setUTCDate(abD.getUTCDate() - z.tage);
      var ab = abD.toISOString().slice(0, 10);
      var tage = h.days.filter(function (t) { return t.date >= ab; });
      Array.prototype.forEach.call(leiste.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-range") === aktiv)); });
      S.clear(box); S.clear(evBox);
      var mobil = global.matchMedia && global.matchMedia("(max-width: 760px)").matches;
      var svg = verlaufSvg(tage, skala, mobil ? 360 : 900);
      if (svg) box.appendChild(svg);
      /* Die Aussage des Diagramms auch als Text. */
      var anteile = {};
      tage.forEach(function (t) { if (isNum(t.env)) anteile[t.env] = (anteile[t.env] || 0) + 1; });
      var erster = tage[0], letzter = tage[tage.length - 1];
      var wechsel = (h.events || []).filter(function (e) { return e.dimension === "ENVIRONMENT" && e.date >= ab; });
      var richtung = isNum(erster.env) && isNum(letzter.env) ? (letzter.env > erster.env ? "verbessert" : letzter.env < erster.env ? "verschlechtert" : "per Saldo unverändert") : "nicht vergleichbar";
      zusammenfassung.textContent = "Von " + tagKurz(erster.date) + " bis " + tagKurz(letzter.date) + ": " +
        (isNum(erster.env) ? skala[erster.env].label : "–") + " → " + (isNum(letzter.env) ? skala[letzter.env].label : "–") + " (" + richtung + "), " +
        wechsel.length + " Wechsel der Einordnung. Anteile: " + Object.keys(anteile).sort().reverse().map(function (k) {
          return skala[k].label + " " + Math.round(100 * anteile[k] / tage.length) + " %";
        }).join(", ") + ".";
      var ev = (h.events || []).filter(function (e) { return e.date >= ab; }).slice(-8).reverse();
      var liste = ereignisse(ev, "Zustandswechsel im Zeitraum");
      evBox.appendChild(liste || el("p", { class: "dx-m3-leer", text: "Keine Zustandswechsel in diesem Zeitraum." }));
    }
    ZEITRAEUME.forEach(function (z) {
      var b = el("button", { type: "button", "data-range": z.id, "aria-pressed": String(z.id === aktiv), text: z.label, title: "Verlauf " + z.label });
      b.onclick = function () { if (aktiv === z.id) return; aktiv = z.id; zeichnen(); };
      leiste.appendChild(b);
    });
    var breitenStart = (h.breadthLog || [])[0];
    var sec = el("section", { class: "dx-m3-verlauf", id: "maerkte-verlauf", "aria-label": "Verlauf des Marktumfelds" }, [
      kopfzeile("Verlauf", "Wie sich das Marktumfeld entwickelt hat",
        "Jeder Tag nur aus den Daten, die an diesem Tag vorlagen – ohne Rückschaufehler. Die Marktbreite fließt erst ab ihrer ersten gespeicherten Messung" +
        (breitenStart ? " (" + tagKurz(breitenStart.asOf) + ")" : "") + " ein; davor zählt sie weder dafür noch dagegen."),
      leiste,
      el("div", { class: "dx-m3-verlauf-flaeche" }, [legende, box]),
      zusammenfassung, evBox
    ]);
    sec._zeichnen = zeichnen;
    return sec;
  }

  /* ------------------------------------------------------ Marktbreite */

  function balken(titel, pct, text, mitte, aktuell) {
    return el("div", { class: "dx-m3-b-zeile" + (aktuell ? "" : " is-alt") }, [
      el("div", { class: "dx-m3-b-kopf" }, [el("span", { text: titel }), el("b", { text: text })]),
      el("div", { class: "dx-m3-b-spur", role: "img", "aria-label": titel + ": " + text }, [
        el("span", { class: "dx-m3-b-fuell", style: "width:" + Math.max(0, Math.min(100, pct)) + "%" }),
        isNum(mitte) ? el("span", { class: "dx-m3-b-mitte", style: "left:" + mitte + "%" }) : null
      ].filter(Boolean))
    ]);
  }

  function breite(p, h) {
    var d = p.dimensions && p.dimensions.BREADTH;
    if (!d) return null;
    var ev = {};
    (d.evidence || []).forEach(function (e) { ev[e.key] = e; });
    var aktuell = d.state !== "NOT_CURRENT" && d.state !== "UNAVAILABLE";
    var story = aktuell ? d.summary : "Die Tagesdaten des Aktienuniversums stammen vom " + tagKurz(d.asOf) +
      ", der letzte Handelstag war der " + tagKurz(d.expectedAsOf) + " – deshalb keine Einordnung. Im Marktumfeld zählt die Marktbreite so lange weder dafür noch dagegen.";
    var teile = [
      kopfzeile("Beteiligung · Marktbreite", "Wie viele Aktien steigen mit?", "Die großen Indizes können steigen, während nur wenige Aktien zulegen. Deshalb zählen wir, wie viele Aktien über ihrem Trend liegen."),
      el("p", { class: "dx-m3-b-status is-" + String(d.state).toLowerCase() }, [el("b", { text: d.label }), document_text(" " + story)])
    ];
    var reihen = [];
    if (ev.above50) reihen.push(balken("Über ihrer 50-Tage-Linie", ev.above50.value, zahl(ev.above50.value, 0) + " % (" + ev.above50.matched + " von " + ev.above50.evaluated + ")", 50, aktuell));
    if (ev.above200) reihen.push(balken("Über ihrer 200-Tage-Linie", ev.above200.value, zahl(ev.above200.value, 0) + " % (" + ev.above200.matched + " von " + ev.above200.evaluated + ")", 50, aktuell));
    if (ev.newHighs && ev.newLows) {
      var summe = (ev.newHighs.value || 0) + (ev.newLows.value || 0);
      reihen.push(el("div", { class: "dx-m3-b-zeile is-duell" + (aktuell ? "" : " is-alt") }, [
        el("div", { class: "dx-m3-b-kopf" }, [el("span", { text: "Neue 52-Wochen-Hochs gegen -Tiefs" }), el("b", { text: ev.newHighs.value + " Hochs · " + ev.newLows.value + " Tiefs" })]),
        el("div", { class: "dx-m3-b-spur is-geteilt", role: "img", "aria-label": ev.newHighs.value + " neue Hochs, " + ev.newLows.value + " neue Tiefs" }, [
          el("span", { class: "dx-m3-b-hoch", style: "width:" + (summe ? 100 * ev.newHighs.value / summe : 50) + "%" }),
          el("span", { class: "dx-m3-b-tief", style: "width:" + (summe ? 100 * ev.newLows.value / summe : 50) + "%" })
        ])
      ]));
    }
    if (reihen.length) {
      teile.push(el("div", { class: "dx-m3-b-block" }, [
        el("p", { class: "dx-m3-b-block-titel", text: aktuell ? "Stand " + tagKurz(d.asOf) : "Letzter Stand " + tagKurz(d.asOf) + " – nicht aktuell, nur zur Orientierung" })
      ].concat(reihen)));
    }
    if (ev.advDecl) {
      var a = ev.advDecl, sum = a.advancers + a.decliners + (a.unchanged || 0);
      teile.push(el("div", { class: "dx-m3-b-block is-sitzung" }, [
        el("p", { class: "dx-m3-b-block-titel", text: "Letzte Sitzung (" + tagKurz(a.session) + (a.complete ? "" : ", läuft") + ") – gestiegen gegen gefallen" }),
        el("div", { class: "dx-m3-b-zeile is-duell" }, [
          el("div", { class: "dx-m3-b-kopf" }, [el("span", { text: a.advancers + " gestiegen" }), el("b", { text: a.decliners + " gefallen" })]),
          el("div", { class: "dx-m3-b-spur is-geteilt", role: "img", "aria-label": a.advancers + " Aktien gestiegen, " + a.decliners + " gefallen von " + a.evaluated }, [
            el("span", { class: "dx-m3-b-hoch", style: "width:" + 100 * a.advancers / sum + "%" }),
            el("span", { class: "dx-m3-b-gleich", style: "width:" + 100 * (a.unchanged || 0) / sum + "%" }),
            el("span", { class: "dx-m3-b-tief", style: "width:" + 100 * a.decliners / sum + "%" })
          ])
        ]),
        el("p", { class: "dx-m3-fuss", text: "Steigende und fallende Titel einer Sitzung zeigen die Tagesstimmung – sie fließen nicht in den Zustand der Marktbreite ein." })
      ]));
    }
    var log = (h && h.advDeclLog) || [];
    if (log.length >= 2) {
      teile.push(el("div", { class: "dx-m3-b-log" }, [el("p", { class: "dx-m3-b-block-titel", text: "Gespeicherte Sitzungen" }), el("ol", {}, log.slice(-10).map(function (x) {
        var q = x.evaluated ? Math.round(100 * x.advancers / x.evaluated) : 0;
        return el("li", { title: tagKurz(x.session) + ": " + q + " % gestiegen" }, [el("span", { class: "dx-m3-b-saeule", style: "height:" + Math.max(4, q) + "%" }), el("small", { text: tagKurz(x.session) })]);
      }))]));
    }
    teile.push(el("details", { class: "dx-m3-regel" }, [el("summary", { text: "Methodik der Marktbreite" }), el("p", { text: d.methodology })]));
    return el("section", { class: "dx-m3-breite", id: "maerkte-breite", "aria-label": "Marktbreite", "data-state": d.state }, teile);
  }

  /* ------------------------------------------------------ Cross Asset */

  /* Konstellation: dieselben Punkte wie die Balkenliste (Monatsbewegung
     im Vielfachen des Typischen), nur als Radar statt als Zeilen - fester
     Winkel je Anlageklasse (kein Layout-Zufall), Abstand vom Zentrum =
     Betrag der Bewegung. Rein dekorativ (aria-hidden); die Balkenliste
     darunter bleibt die zugaengliche, verlinkte Quelle derselben Werte. */
  var CA_WINKEL = { EQUITY: 0, US10Y: 60, GOLD: 120, OIL: 180, BTC: 240, EURUSD: 300 };
  function konstellation(evidence) {
    if (!global.document) return null;
    var ns = "http://www.w3.org/2000/svg";
    var svg = global.document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 260 260");
    svg.setAttribute("class", "dx-m3-ca-radar");
    svg.setAttribute("aria-hidden", "true");
    function n_(tag, a) { var e = global.document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); svg.appendChild(e); return e; }
    var cx = 130, cy = 130, rMax = 96;
    [1, 2, 3].forEach(function (i) { n_("circle", { cx: cx, cy: cy, r: rMax * i / 3, class: "dx-m3-ca-ring" }); });
    Object.keys(CA_WINKEL).forEach(function (k) {
      var p = polar(cx, cy, rMax, CA_WINKEL[k]);
      n_("line", { x1: cx, y1: cy, x2: p.x.toFixed(1), y2: p.y.toFixed(1), class: "dx-m3-ca-achse" });
    });
    evidence.forEach(function (e) {
      var winkel = CA_WINKEL[e.key];
      if (!isNum(winkel) || !isNum(e.ratio)) return;
      var r = Math.max(0, Math.min(3, Math.abs(e.ratio))) / 3 * rMax;
      var p = polar(cx, cy, r, winkel);
      var labelP = polar(cx, cy, rMax + 18, winkel);
      n_("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: e.notable ? 8 : 5.5, class: "dx-m3-ca-knoten" + (e.notable ? " is-deutlich" : "") });
      var t = n_("text", { x: labelP.x.toFixed(1), y: labelP.y.toFixed(1), "text-anchor": "middle", class: "dx-m3-ca-knoten-label" });
      t.textContent = CA_NAME[e.key] || e.key;
    });
    n_("circle", { cx: cx, cy: cy, r: 3, class: "dx-m3-ca-mitte" });
    return svg;
  }

  function crossAsset(p, namen) {
    var d = p.dimensions && p.dimensions.CROSS_ASSET;
    if (!d || !d.evidence || !d.evidence.length) return null;
    var obs = d.observations || [];
    var zeilen = d.evidence.map(function (e) {
      var r = Math.max(-3, Math.min(3, e.ratio || 0));
      var breit = Math.abs(r) / 3 * 50;
      var sym = CA_SYM[e.key];
      return el("li", {}, [el("a", { class: "dx-m3-ca-zeile" + (e.notable ? " is-deutlich" : ""), href: sym ? "#/maerkte/" + sym : null }, [
        el("span", { class: "dx-m3-ca-name", text: CA_NAME[e.key] || e.label }),
        el("span", { class: "dx-m3-ca-spur", "aria-hidden": "true" }, [
          el("span", { class: "dx-m3-ca-balken", style: (r >= 0 ? "left:50%" : "left:" + (50 - breit) + "%") + ";width:" + breit + "%" }),
          el("span", { class: "dx-m3-ca-schwelle", style: "left:" + (50 - 50 / 3) + "%" }), el("span", { class: "dx-m3-ca-schwelle", style: "left:" + (50 + 50 / 3) + "%" }),
          el("span", { class: "dx-m3-ca-null" })
        ]),
        el("span", { class: "dx-m3-ca-wert", text: e.text })
      ])]);
    });
    return el("section", { class: "dx-m3-ca", id: "maerkte-crossasset", "aria-label": "Cross Asset" }, [
      kopfzeile("Andere Anlagen · Cross Asset · ein Monat", obs.length ? obs[0].text.replace(/\.$/, "") : "Ruhiges Gesamtbild über die Anlageklassen",
        "Wie ungewöhnlich war der letzte Monat je Anlageklasse – gemessen an ihrer eigenen typischen Monatsbewegung. Die Linien markieren „deutlich“ (1-fach typisch)."),
      obs.length > 1 ? el("ul", { class: "dx-m3-ca-obs" }, obs.slice(1).map(function (o) { return el("li", { text: o.text }); })) : null,
      el("div", { class: "dx-m3-ca-flaeche" }, [konstellation(d.evidence), el("ul", { class: "dx-m3-ca-liste" }, zeilen)].filter(Boolean)),
      el("p", { class: "dx-m3-fuss", text: "Beschrieben wird, was sich gleichzeitig bewegt – nicht, warum. Steigende Renditen, steigendes Gold oder Bitcoin gelten nicht automatisch als gut oder schlecht." })
    ].filter(Boolean));
  }

  /* ------------------------------------- Das Wichtigste in 30 Sekunden
     Owner-Feedback: "Was kann ich daraus ziehen?" Eine Karte direkt unter
     dem Hero beantwortet in Alltagssprache vier Fragen - Heute? Warum? Was
     heisst das? Worauf achten? - und verbindet die heutige Stufe mit der
     historischen Pruefung. Alle Saetze kommen aus den Zustaenden des
     Artefakts und aus dem Pruefungs-Auszug; ohne Auszug entfallen die
     beiden Geschichts-Zeilen. Keine Handlungsaufforderung. */
  /* Ein Satz in Alltagssprache je Messwert - null, wenn nicht bestimmbar. */
  function grundSatz(p, k) {
    var d = (p.dimensions || {})[k];
    if (!d || d.state === "UNAVAILABLE" || d.state === "NOT_CURRENT") return null;
    if (k === "TREND") return { POSITIVE: "Die großen US-Indizes steigen.", NEGATIVE: "Die großen US-Indizes fallen.",
      MIXED: "Die großen US-Indizes haben keinen klaren Trend." }[d.state] || de(d.summary);
    if (k === "BREADTH") {
      if (d.state !== "BROAD" && d.state !== "NARROW" && d.state !== "MIXED") return null;
      var a50 = (d.evidence || []).filter(function (e) { return e.key === "above50"; })[0];
      return d.state === "BROAD" ? "Die meisten Aktien steigen mit." : d.state === "NARROW"
        ? "Nur " + (a50 && isNum(a50.value) ? "rund " + Math.round(a50.value) + " % der" : "wenige") + " Aktien steigen mit – die Bewegung tragen wenige."
        : "Etwa die Hälfte der Aktien steigt mit.";
    }
    if (k === "MOMENTUM") return d.state === "RISING" ? "Die letzten Monate liefen gut" + (/Tempo lässt nach/.test(d.summary) ? ", das Tempo lässt aber nach." : ".")
      : d.state === "FALLING" ? "Die letzten Monate liefen schwach" + (/Abwärtsdruck lässt nach/.test(d.summary) ? ", der Druck lässt aber nach." : ".")
      : "Die letzten Monate brachten keine klare Richtung.";
    if (k === "RISK") return d.state === "NORMAL" ? "Die Kurse schwanken im üblichen Rahmen." : de(d.summary);
    return null;
  }
  function grundSaetze(p) {
    return ["TREND", "BREADTH", "MOMENTUM", "RISK"].map(function (k) { return grundSatz(p, k); }).filter(Boolean);
  }

  function kurzfassung(p, ev) {
    var env = p && p.environment;
    if (!env || !isNum(env.level)) return null;
    var lv = ev && ev.levels && ev.levels.length >= 3 ? ev.levels : null;
    var hier = null, runter = null, rauf = null, schnitt = null;
    if (lv) {
      var i = Math.min(env.level, lv.length - 1);
      hier = lv[i]; runter = lv[i - 1] || null; rauf = lv[i + 1] || null; schnitt = ev.overallDrawdownShare;
    }
    var diff = hier && isNum(schnitt) ? hier.drawdownShare - schnitt : null;
    var risikoWort = diff === null ? null : diff > 3 ? "erhöhtes" : diff < -3 ? "geringeres" : "normales";
    var gruende = grundSaetze(p);
    function zeile(frage, inhalt) {
      return el("div", { class: "dx-m3-kf-zeile" }, [el("dt", { text: frage }), el("dd", {}, inhalt)]);
    }
    var zeilen = [
      zeile("Heute", [el("p", { class: "dx-m3-kf-heute" }, [el("b", { class: "dx-m3-kf-stufe is-l" + env.level, text: env.label }),
        risikoWort ? document_text(" – " + risikoWort + " Rückschlag-Risiko") : null].filter(Boolean)),
        env.scale && env.scale.length ? el("p", { class: "dx-m3-kf-leise", text: "Stufe " + (env.level + 1) + " von " + env.scale.length + ", von „" + env.scale[0].label +
          "“ bis „" + env.scale[env.scale.length - 1].label + "“." }) : null].filter(Boolean)),
      gruende.length ? zeile("Warum?", [el("ul", { class: "dx-m3-kf-gruende" }, gruende.map(function (g) { return el("li", { text: g }); }))]) : null,
      hier ? zeile("Was heißt das?", [el("p", { text: "Bei dieser Einordnung folgte seit " + jahr(ev.from) + " in " + vonHundert(hier.drawdownShare) +
        " Fällen innerhalb von " + dativ(ev.horizon.label) + " ein Rückgang von 10 % oder mehr – " +
        (Math.abs(diff) <= 1.5 ? "etwa so oft wie" : diff > 0 ? "häufiger als" : "seltener als") + " im Durchschnitt aller Tage (" + vonHundert(schnitt) + ")." }),
        el("p", { class: "dx-m3-kf-leise", text: risikoWort === "normales" ? "Das Rückschlag-Risiko liegt im üblichen Rahmen – weder besonders hoch noch besonders niedrig."
          : risikoWort === "erhöhtes" ? "Deutliche Rückschläge kamen in dieser Lage häufiger vor als üblich." : "Deutliche Rückschläge kamen in dieser Lage seltener vor als üblich." })]) : null,
      hier && (runter || rauf) ? zeile("Worauf achten?", [
        runter ? el("p", { text: "Rutscht die Einordnung auf „" + runter.label + "“, lag das Risiko früher bei " + vonHundert(runter.drawdownShare) + "." }) : null,
        rauf ? el("p", { text: "Steigt sie auf „" + rauf.label + "“, lag es bei " + vonHundert(rauf.drawdownShare) + "." }) : null
      ].filter(Boolean)) : null
    ].filter(Boolean);
    var zahlBlock = hier ? el("div", { class: "dx-m3-kf-zahl is-l" + env.level, "aria-hidden": "true" }, [
      el("b", { text: String(Math.round(hier.drawdownShare)) }), el("span", { text: "von 100" }),
      el("small", { text: "Rückschläge ≥ 10 % in " + dativ(ev.horizon.label) + " · Schnitt " + Math.round(schnitt) })
    ]) : null;
    return el("section", { class: "dx-m3-kurz", id: "maerkte-kurz", "aria-label": "Das Wichtigste in 30 Sekunden" }, [
      el("div", { class: "dx-m3-kf-kopf" }, [iconChip("kompass", "context"), el("h2", { text: "Das Wichtigste in 30 Sekunden" })]),
      el("div", { class: "dx-m3-kf-raster" }, [el("dl", { class: "dx-m3-kf-liste" }, zeilen), zahlBlock].filter(Boolean)),
      el("div", { class: "dx-m3-kf-aktionen" }, [knopf("Was müsste passieren?", "maerkte-aendern", "dx-m3-chip"),
        hier ? knopf("So haben wir das geprüft", "maerkte-pruefung", "dx-m3-chip") : null, knopf("Warum genau?", "maerkte-warum", "dx-m3-chip is-leise")].filter(Boolean)),
      el("p", { class: "dx-m3-fuss", text: "Beschreibung aus festen Regeln und fast 100 Jahren Börsengeschichte – keine Prognose, keine Anlageberatung." })
    ]);
  }

  /* ------------------------------------------- Marktstimmung (Uebersicht)
     Eine Karte auf der Kursuebersicht (#/maerkte): Stufe, ein Satz, das
     Rueckschlag-Risiko aus der Pruefung - und der Weg zur ganzen Erklaerung
     (#/maerkte/einordnung). Wie ein "Stimmungs"-Widget in einer Broker-App:
     klein, eindeutig, ein Tipp fuer mehr. */
  function stimmung(p, ev) {
    var env = p && p.environment;
    if (!env || !isNum(env.level)) return null;
    var lv = ev && ev.levels && ev.levels.length >= 3 ? ev.levels : null;
    var hier = lv ? lv[Math.min(env.level, lv.length - 1)] : null;
    var schnitt = ev && isNum(ev.overallDrawdownShare) ? ev.overallDrawdownShare : null;
    var diff = hier && schnitt !== null ? hier.drawdownShare - schnitt : null;
    var risiko = diff === null ? null : diff > 3 ? "erhöht" : diff < -3 ? "gering" : "normal";
    var skala = env.scale || [];
    var link = el("a", { class: "dx-m3-st-link", href: "#/maerkte/einordnung" }, [
      el("span", { class: "dx-m3-st-link-text" }, [el("b", { text: "Was heißt „" + env.label + "“?" }), el("small", { text: "In 2 Minuten erklärt – mit Zahlen seit 1929" })]),
      el("i", { "aria-hidden": "true", text: "›" })]);
    return el("section", { class: "dx-m3-stimmung is-l" + env.level, id: "maerkte-stimmung", "aria-label": "Marktbarometer" }, [
      el("div", { class: "dx-m3-st-kopf" }, [iconChip("kompass", "context"), el("div", {}, [el("h2", { text: "Marktbarometer" }),
        el("p", { text: "US-Aktienmarkt · Einordnung von Vision Universe" })])]),
      el("div", { class: "dx-m3-st-raster" }, [
        el("div", { class: "dx-m3-st-gauge" }, [regimeGauge(env, null)].filter(Boolean)),
        el("div", { class: "dx-m3-st-text" }, [
          el("p", { class: "dx-m3-st-stufe" }, [el("b", { text: env.label }), el("span", { text: "Stufe " + (env.level + 1) + " von " + (skala.length || 5) })]),
          el("p", { class: "dx-m3-st-satz", text: env.statement }),
          hier ? el("p", { class: "dx-m3-st-risiko is-" + risiko }, [el("b", { text: "Rückschlag-Risiko: " + risiko }),
            document_text(" – früher in " + vonHundert(hier.drawdownShare) + " Fällen ein Minus von 10 % oder mehr in " + dativ(ev.horizon.label) +
              " (Schnitt " + Math.round(schnitt) + ").")]) : null,
          skala.length ? el("ol", { class: "dx-m3-st-leiste", "aria-hidden": "true" }, skala.map(function (x, i) {
            return el("li", { class: "is-l" + i + (i === env.level ? " is-aktiv" : ""), title: x.label });
          })) : null
        ].filter(Boolean))
      ]),
      link,
      el("p", { class: "dx-m3-fuss", text: "Beschreibung nach festen Regeln – keine Prognose, keine Anlageberatung." })
    ]);
  }

  /* ------------------------------------------ Wie verlaesslich? (Pruefung)
     Die historische Pruefung derselben Regeln (scripts/market/validate-
     market-pulse.mjs, Auszug quant/data/market/validation/market-pulse-
     evidence.json). Entscheidung des Eigentuemers vom 28.09.2026: die
     Pruefung wird offengelegt - verstaendlich, mit Methodik, Grenzen und
     Quelle. Die Modellrechnung steht immer neben "immer investiert" und
     neben dem juengeren Zeitraum, nie allein. Diese Datei rechnet nichts
     nach; sie zeigt, was der Auszug enthaelt. */
  function pct(v, d) { return (v < 0 ? "−" : "") + zahl(Math.abs(v), d === undefined ? 1 : d) + "\u00a0%"; }
  function vonHundert(v) { return Math.round(v) + " von 100"; }
  /* "3 Monate" nach "in"/"von" im Dativ: "in 3 Monaten". */
  function dativ(label) { return String(label).replace(/Monate$/, "Monaten"); }
  function jahr(iso) { return iso ? iso.slice(0, 4) : ""; }
  function tagLang(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }

  function pruefung(ev, p) {
    if (!ev || !ev.levels || ev.levels.length < 3 || !ev.illustration) return null;
    var lv = ev.levels, erste = lv[0], letzte = lv[lv.length - 1];
    var von = jahr(ev.from), bis = jahr(ev.to);
    var jahre = Math.round((Date.parse(ev.to) - Date.parse(ev.from)) / (365.25 * 864e5));
    var heute = p && p.environment && isNum(p.environment.level) ? Math.min(p.environment.level, letzte.level) : null;
    var h = ev.horizon.label;

    /* (1) Kernaussage mit Balken je Stufe */
    var skala = Math.max.apply(null, lv.map(function (x) { return x.drawdownShare; })) * 1.15;
    var balkenListe = el("ol", { class: "dx-m3-pr-balken" }, lv.map(function (x) {
      var istHeute = x.level === heute;
      return el("li", { class: "is-l" + x.level + (istHeute ? " is-heute" : "") }, [
        el("span", { class: "dx-m3-pr-stufe" }, [el("i", { "aria-hidden": "true" }), el("span", { text: x.label }),
          istHeute ? el("em", { text: "heute" }) : null].filter(Boolean)),
        el("span", { class: "dx-m3-pr-spur", role: "img", "aria-label": x.label + ": in " + vonHundert(x.drawdownShare) + " Fällen ein Rückgang von 10 % oder mehr" }, [
          el("span", { class: "dx-m3-pr-fuell", style: "width:" + Math.max(3, 100 * x.drawdownShare / skala).toFixed(1) + "%" })
        ]),
        el("b", { text: vonHundert(x.drawdownShare) })
      ]);
    }));
    var kern = el("article", { class: "dx-m3-pr-karte dx-m3-pr-kern" }, [
      el("div", { class: "dx-m3-pr-kopf" }, [iconChip("schild", "support"), el("span", { text: "Das Rückschlag-Risiko" })]),
      el("p", { class: "dx-m3-pr-aussage", text: "Nach „" + erste.label + "“ folgte in " + vonHundert(erste.drawdownShare) +
        " Fällen ein Rückgang von 10 % oder mehr – nach „" + letzte.label + "“ nur in " + vonHundert(letzte.drawdownShare) + "." }),
      el("p", { class: "dx-m3-pr-unter", text: "Anteil der Fälle mit einem zeitweisen Minus von 10 % oder mehr in den folgenden " + dativ(h) +
        ". US-Gesamtmarkt " + von + " bis " + bis + "." }),
      balkenListe,
      el("p", { class: "dx-m3-fuss", text: "Zum Vergleich: über alle Tage " + vonHundert(ev.overallDrawdownShare) + ". " + (ev.topLevelNote || "") })
    ]);

    /* (2) Modellrechnung - immer neben "immer investiert" und dem juengeren Zeitraum */
    var regel = ev.illustration.rules.filter(function (r) { return r.minLevel === 2; })[0] || ev.illustration.rules[0];
    var m = regel && regel.all;
    var modell = null;
    if (m) {
      var tiefe = Math.max(Math.abs(m.buyAndHold.maxDrawdown), Math.abs(m.maxDrawdown)) || 1;
      var zeile = function (titel, a, b) {
        return el("div", { class: "dx-m3-pr-vgl-zeile", role: "row" }, [el("span", { role: "rowheader", text: titel }), el("b", { role: "cell", text: a }), el("b", { role: "cell", class: "is-regel", text: b })]);
      };
      var r = regel.since2001;
      modell = el("article", { class: "dx-m3-pr-karte dx-m3-pr-modell" }, [
        el("div", { class: "dx-m3-pr-kopf" }, [iconChip("kurve", "context"), el("span", { text: "Historische Modellrechnung" })]),
        el("p", { class: "dx-m3-pr-aussage", text: m.cagr >= m.buyAndHold.cagr - 1 ? "Fast gleiche Rendite, deutlich kleinere Verluste" : "Weniger Rendite, deutlich kleinere Verluste" }),
        el("p", { class: "dx-m3-pr-unter dx-m3-pr-klartext", text: pct(m.cagr) + " statt " + pct(m.buyAndHold.cagr) + " pro Jahr – aber der größte Verlust lag bei " +
          pct(m.maxDrawdown, 0) + " statt " + pct(m.buyAndHold.maxDrawdown, 0) + " (" + von + "–" + bis + ", nur ab „" + regel.minLabel + "“ investiert)." }),
        el("div", { class: "dx-m3-pr-vgl", role: "table", "aria-label": "Modellrechnung " + von + " bis " + bis }, [
          el("div", { class: "dx-m3-pr-vgl-zeile is-kopf", role: "row" }, [el("span", { role: "columnheader", text: von + "–" + bis }),
            el("span", { role: "columnheader", text: "Immer investiert" }), el("span", { role: "columnheader", class: "is-regel", text: "Nur ab „" + regel.minLabel + "“*" })]),
          zeile("Rendite pro Jahr", pct(m.buyAndHold.cagr), pct(m.cagr)),
          zeile("Größter Verlust", pct(m.buyAndHold.maxDrawdown), pct(m.maxDrawdown)),
          zeile("Zeit am Markt", "100 %", pct(m.investedShare, 0))
        ]),
        el("div", { class: "dx-m3-pr-tiefe", "aria-hidden": "true" }, [
          el("span", { class: "dx-m3-pr-tiefe-titel", text: "Größter Verlust im Vergleich" }),
          el("span", { class: "dx-m3-pr-tiefe-spur" }, [el("span", { class: "is-immer", style: "width:" + (100 * Math.abs(m.buyAndHold.maxDrawdown) / tiefe).toFixed(1) + "%" })]),
          el("span", { class: "dx-m3-pr-tiefe-spur" }, [el("span", { class: "is-regel", style: "width:" + (100 * Math.abs(m.maxDrawdown) / tiefe).toFixed(1) + "%" })])
        ]),
        r ? el("p", { class: "dx-m3-pr-juenger", text: "Seit " + jahr(r.from) + ": " + pct(r.cagr) + " statt " + pct(r.buyAndHold.cagr) +
          " pro Jahr, größter Verlust " + pct(r.maxDrawdown) + " statt " + pct(r.buyAndHold.maxDrawdown) + "." }) : null,
        el("p", { class: "dx-m3-fuss", text: "* Sonst Geldmarkt. Signal am Schlusskurs, umgesetzt einen Handelstag später. Ohne Kosten und Steuern; " +
          "der US-Gesamtmarkt ist nicht direkt investierbar. Vergangene Ergebnisse sind kein verlässlicher Hinweis auf künftige Entwicklungen." })
      ].filter(Boolean));
    }

    /* (3) So haben wir geprueft */
    var gesichert = (ev.contrasts || []).filter(function (c) { return c.significant; }).map(function (c) { return c.label; });
    var oos = ev.outOfSample && ev.outOfSample.levels, oosA = oos && oos[0], oosZ = oos && oos[oos.length - 1];
    var schritte = [
      ["regler", "Dieselben Regeln wie heute", "Trend, Momentum und Risiko mit genau den Schwellen, die auch heute gelten. Nichts wurde nachträglich angepasst, damit es besser aussieht."],
      ["auge", "Nur das Wissen von damals", "Jeder Tag wird nur mit den Kursen bis zu diesem Tag eingeordnet und erst am nächsten Handelstag umgesetzt – ohne Rückschaufehler."],
      ["kerzen", "Fast " + (Math.round(jahre / 10) * 10) + " Jahre, alle großen Krisen", "US-Gesamtmarkt inklusive Dividenden von " + von + " bis " + bis +
        ": Weltwirtschaftskrise, Ölkrisen, Dotcom-Blase, Finanzkrise, Corona."],
      ["lupe", "Gegen den Zufall geprüft", "Gezählt werden nur Zeiträume, die sich nicht überschneiden. " +
        (gesichert.length ? "Der Unterschied zwischen vorsichtigen und konstruktiven Stufen ist nach " + gesichert.join(" und ") + " statistisch gesichert, auch nach Korrektur für Mehrfachtests."
                          : "Der Unterschied ist derzeit statistisch nicht gesichert.")],
      oosA ? ["trend", "Auch ohne Vorwissen bestätigt", "Die Regeln entstanden 2026. Die Jahre bis " + jahr(ev.outOfSample.to) + " kannten sie nicht – dort zeigt sich dasselbe Muster: „" +
        oosA.label + "“ " + vonHundert(oosA.drawdownShare) + ", „" + oosZ.label + "“ " + vonHundert(oosZ.drawdownShare) + "."] : null
    ].filter(Boolean);
    var methode = el("article", { class: "dx-m3-pr-karte dx-m3-pr-methode" }, [
      el("div", { class: "dx-m3-pr-kopf" }, [iconChip("regler", "neutral"), el("span", { text: "So haben wir geprüft" })]),
      el("ol", { class: "dx-m3-pr-schritte" }, schritte.map(function (x) {
        return el("li", {}, [iconChip(x[0], "context"), el("div", {}, [el("b", { text: x[1] }), el("p", { text: x[2] })])]);
      }))
    ]);

    /* (4) Was es bedeutet - und was nicht */
    var bedeutung = el("article", { class: "dx-m3-pr-karte dx-m3-pr-bedeutung" }, [
      el("div", { class: "dx-m3-pr-kopf" }, [iconChip("kompass", "neutral"), el("span", { text: "Was das bedeutet – und was nicht" })]),
      el("ul", { class: "dx-m3-pr-liste" }, [
        el("li", { class: "is-ja" }, [el("span", { class: "dx-m3-pr-zeichen", "aria-hidden": "true", text: "✓" }),
          el("p", { text: "Die Einordnung zeigt, wie groß das Risiko eines deutlichen Rückschlags ist." })]),
        el("li", { class: "is-nein" }, [el("span", { class: "dx-m3-pr-zeichen", "aria-hidden": "true", text: "✕" }),
          el("p", { text: "Sie sagt nicht voraus, ob die Kurse steigen: Nach „" + erste.label + "“ lag die durchschnittliche Rendite der folgenden " + h + " sogar bei " +
            (erste.meanReturn >= 0 ? "+" : "") + pct(erste.meanReturn) + " – oft folgten kräftige Erholungen." })]),
        el("li", { class: "is-nein" }, [el("span", { class: "dx-m3-pr-zeichen", "aria-hidden": "true", text: "✕" }),
          el("p", { text: "Kein Signal zum Handeln und keine Anlageberatung – ein Werkzeug für die eigene Recherche." })])
      ])
    ]);

    /* (5) Alle Zahlen, Grenzen, Quelle */
    var hz = ev.byHorizon || [];
    var tabelle = el("table", { class: "dx-m3-pr-tabelle" }, [
      el("caption", { text: "Rückgang von 10 % oder mehr – Fälle von 100, je Zeitraum danach" }),
      el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: "Stufe" })].concat(hz.map(function (x) { return el("th", { scope: "col", text: x.label }); }))
        .concat([el("th", { scope: "col", text: "Ø Rendite " + h }), el("th", { scope: "col", text: "Fälle" })]))]),
      el("tbody", {}, lv.map(function (x) {
        return el("tr", {}, [el("th", { scope: "row", text: x.label })].concat(hz.map(function (y) {
          var z = y.levels.filter(function (q) { return q.level === x.level; })[0];
          return el("td", { text: z && isNum(z.drawdownShare) ? String(Math.round(z.drawdownShare)) : "–" });
        })).concat([el("td", { text: (x.meanReturn >= 0 ? "+" : "") + pct(x.meanReturn) }), el("td", { text: String(x.samples) })]));
      }))
    ]);
    var perioden = (ev.periods || []).map(function (sp) {
      var a = sp.levels[0], z = sp.levels[sp.levels.length - 1];
      return el("li", { text: sp.id.replace("-", "–") + ": „" + a.label + "“ " + vonHundert(a.drawdownShare) + ", „" + z.label + "“ " + vonHundert(z.drawdownShare) +
        " (" + a.samples + " bzw. " + z.samples + " Fälle)" });
    });
    var spanne = function (x) { return x.drawdownCI95 ? Math.round(x.drawdownCI95[0]) + " und " + Math.round(x.drawdownCI95[1]) : "–"; };
    var weitere = ev.illustration.rules.filter(function (q) { return q !== regel && q.all; }).map(function (q) {
      return el("li", { text: "Nur ab „" + q.minLabel + "“ investiert: " + pct(q.all.cagr) + " pro Jahr, größter Verlust " + pct(q.all.maxDrawdown) + ", " + pct(q.all.investedShare, 0) + " der Zeit am Markt" +
        (q.since2001 ? " (seit " + jahr(q.since2001.from) + ": " + pct(q.since2001.cagr) + ", " + pct(q.since2001.maxDrawdown) + ")" : "") + "." });
    });
    var details = el("details", { class: "dx-m3-regel dx-m3-pr-details" }, [
      el("summary", { text: "Alle Zahlen, Grenzen und Quelle" }),
      el("div", { class: "dx-m3-pr-tabelle-box", tabindex: "0", role: "region", "aria-label": "Tabelle: Rückgänge je Stufe und Zeitraum" }, [tabelle]),
      el("h3", { text: "Jeder Zeitabschnitt einzeln (" + h + ")" }), el("ul", {}, perioden),
      el("h3", { text: "Wie sicher sind die Zahlen?" }),
      el("p", { text: "Mit 95 % Sicherheit liegt der wahre Anteil nach „" + erste.label + "“ zwischen " + spanne(erste) + " von 100, nach „" + letzte.label + "“ zwischen " +
        spanne(letzte) + " von 100." + (erste.drawdownCI95 && letzte.drawdownCI95 ? (erste.drawdownCI95[0] > letzte.drawdownCI95[1]
          ? " Die Spannen überschneiden sich nicht – der Unterschied ist kein Zufall." : " Die Spannen überschneiden sich – der Unterschied ist nicht sicher.") : "") }),
      weitere.length ? el("h3", { text: "Weitere Modellrechnung" }) : null, weitere.length ? el("ul", {}, weitere) : null,
      el("h3", { text: "Grenzen" }),
      el("ul", {}, [
        el("li", { text: "Die Geschichte kennt keine ETFs: Für die vier Markt-Tracker stehen Portfolios aus großen Wachstums- und Standardwerten sowie kleinen Werten." }),
        el("li", { text: "Die Marktbreite der Seite zählt Einzelaktien; historisch ist sie nur über Branchen annähernd messbar. Deshalb fehlt „Breit konstruktiv“ als eigene Zeile." }),
        el("li", { text: "Je Stufe gibt es nur " + Math.min.apply(null, lv.map(function (x) { return x.samples; })) + " bis " + Math.max.apply(null, lv.map(function (x) { return x.samples; })) +
          " unabhängige Fälle – die Zahlen sind belastbar, aber nicht auf die Kommastelle genau." }),
        el("li", { text: "Die Modellrechnung enthält keine Kosten, Steuern oder Verzögerungen über einen Tag hinaus." })
      ]),
      el("h3", { text: "Quelle" }),
      el("p", {}, [document_text("Datengrundlage: "), el("a", { href: ev.source.url, rel: "noopener", target: "_blank", text: ev.source.label }),
        document_text(". " + ev.source.detail + " Daten bis " + tagLang(ev.to) + ", monatlich aktualisiert.")])
    ].filter(Boolean));

    return el("section", { class: "dx-m3-pruefung", id: "maerkte-pruefung", "aria-label": "Wie verlässlich ist diese Einordnung?" }, [
      kopfzeile("Geprüft seit " + von, "Wie verlässlich ist diese Einordnung?",
        "Wir haben genau diese Regeln auf fast " + (Math.round(jahre / 10) * 10) + " Jahre US-Börsengeschichte angewendet – Tag für Tag nur mit den Daten, die damals bekannt waren."),
      el("div", { class: "dx-m3-pr-raster" }, [kern, modell, methode, bedeutung].filter(Boolean)),
      details,
      el("p", { class: "dx-m3-fuss", text: "Eigene historische Prüfung von Vision Universe mit den unveränderten Regeln. Keine Prognose, keine Anlageberatung." })
    ]);
  }

  /* ----------------------------------------------- Markt jetzt: Stories */

  function stories(items, standText) {
    var MP = global.VUMarketPulse;
    if (!MP || !MP.marketNowStories || !items || !items.length) return null;
    var st = MP.marketNowStories(items);
    return el("section", { class: "dx-m3-stories", id: "maerkte-jetzt", "aria-label": "Markt jetzt" }, [
      kopfzeile("Markt jetzt", "Was heute auffällt", "Bewegungen, die gemessen an der üblichen Tagesschwankung des jeweiligen Markts herausstechen – zu Geschichten gebündelt, ohne Ursachen zu behaupten."),
      el("ol", { class: "dx-m3-story-liste" }, st.map(function (s) {
        return el("li", { class: "dx-m3-story is-" + s.direction, "data-story": s.id }, [
          iconChip(s.direction === "up" ? "hoch" : s.direction === "down" ? "runter" : "blitz", "story-" + s.direction),
          el("h3", { text: s.title }),
          el("p", { class: "dx-m3-story-lead", text: s.lead }),
          el("div", { class: "dx-m3-story-werte" }, s.items.map(function (it) {
            return el("a", { class: "dx-m3-story-wert is-" + it.direction, href: "#/maerkte/" + encodeURIComponent(it.symbol), "data-symbol": it.symbol, title: it.evidence }, [
              el("span", { text: it.title }), el("b", { text: it.value })
            ]);
          })),
          s.why ? el("p", { class: "dx-m3-story-warum" }, [el("span", { text: "Warum relevant? " }), document_text(s.why)]) : null,
          el("p", { class: "dx-m3-story-stand", text: (s.session === "LAST_SESSION" ? "Letzter Handelstag" : "Aktuell") + (s.asOf ? " · Stand " + standText(s.asOf) : "") })
        ].filter(Boolean));
      }))
    ]);
  }

  /* ------------------------------------------------------ Premium Motion
     Sanftes Einblenden beim Scrollen - Fortschritt, kein Dekor um seiner
     selbst willen. Ohne IntersectionObserver oder bei reduzierter Bewegung
     ist sofort alles sichtbar (die Klasse "dx-m3-reveal" startet unsichtbar
     nur, wenn prefers-reduced-motion:no-preference gilt UND diese Funktion
     "is-sichtbar" nachtraegt - siehe markets.css). */
  function beleben(root) {
    if (!root || !root.querySelectorAll) return;
    var ziele = root.querySelectorAll(".dx-m3-reveal");
    if (!ziele.length) return;
    var IO = global.IntersectionObserver;
    var ruhig = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!IO || ruhig) { Array.prototype.forEach.call(ziele, function (z) { z.classList.add("is-sichtbar"); }); return; }
    var obs = new IO(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-sichtbar"); obs.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(ziele, function (z) { obs.observe(z); });
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.MarketIntelligence = {
    hero: hero, kacheln: kacheln, landkarte: landkarte, glyph: symbolSvg, vorherJetzt: vorherJetzt, warum: warum, worauf: worauf, bildAendern: bildAendern,
    verlauf: verlauf, breite: breite, crossAsset: crossAsset, pruefung: pruefung, kurzfassung: kurzfassung, grundSaetze: grundSaetze, grundSatz: grundSatz, stimmung: stimmung,
    gauge: regimeGauge, iconChip: iconChip, DIM: DIM, stories: stories, beleben: beleben,
    naechsteBewertung: naechsteBewertung, zyklusText: zyklusText, ZEITRAEUME: ZEITRAEUME
  };
})(typeof window !== "undefined" ? window : globalThis);
