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

  var DIM = {
    TREND: { name: "Trend", frage: "Liegen die großen US-Märkte im Aufwärtstrend?" },
    BREADTH: { name: "Marktbreite", frage: "Wie viele Aktien tragen die Bewegung mit?" },
    MOMENTUM: { name: "Momentum", frage: "Hat der Markt Kraft über Monate?" },
    RISK: { name: "Risiko", frage: "Wie stark schwankt der Markt tatsächlich?" },
    CROSS_ASSET: { name: "Cross Asset", frage: "Was bewegt sich gleichzeitig über Anlageklassen?" }
  };
  var DIM_REIHE = ["TREND", "BREADTH", "MOMENTUM", "RISK", "CROSS_ASSET"];
  var ROLLE = { support: "Unterstützt das Marktbild", neutral: "Noch nicht bestätigt", headwind: "Gegenwind",
                open: "Noch nicht beurteilbar", context: "Kontext – zählt nicht mit" };
  var ROLLE_ZEICHEN = { support: "✓", neutral: "–", headwind: "–", open: "?", context: "·" };
  var CA_NAME = { EQUITY: "Aktien", US10Y: "US-Rendite 10J", GOLD: "Gold", OIL: "Öl", BTC: "Bitcoin", EURUSD: "EUR/USD" };
  var CA_SYM = { EQUITY: "SPY", US10Y: "US10Y", GOLD: "XAUUSD", OIL: "WTI", BTC: "BTCUSD", EURUSD: "EURUSD" };
  var ZEITRAEUME = [{ id: "1W", label: "1W", tage: 7 }, { id: "1M", label: "1M", tage: 31 }, { id: "3M", label: "3M", tage: 92 },
                    { id: "6M", label: "6M", tage: 183 }, { id: "1Y", label: "1J", tage: 366 }];

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
      el("ul", {}, gruende.map(function (g) {
        return el("li", { class: "is-" + g.r }, [el("i", { "aria-hidden": "true", text: ROLLE_ZEICHEN[g.r] }),
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
          veraenderung
        ].filter(Boolean)),
        blick
      ]),
      el("div", { class: "dx-m3-hero-aktionen" }, [knopf("Warum diese Einordnung?", "maerkte-warum", "dx-m3-cta"),
                                                    knopf("Was würde sie ändern?", "maerkte-aendern", "dx-m3-cta is-leise")]),
      el("p", { class: "dx-m3-zyklus" + (z.verspaetet ? " is-verspaetet" : "") }, [el("span", { text: z.text }), el("span", { class: "dx-m3-zyklus-hinweis", text: z.hinweis })]),
      el("p", { class: "dx-m3-rechtlich", text: env.disclaimer })
    ].filter(Boolean));
  }

  /* ------------------------------------------- Die fuenf Dimensionen */

  function tiefe(d) {
    return el("div", { class: "dx-m3-tiefe" }, [
      el("h4", { text: "Zustand" }), el("p", { text: d.label + ". " + de(d.summary) }),
      d.evidence && d.evidence.length ? el("h4", { text: "Belege" }) : null,
      d.evidence && d.evidence.length ? el("ul", {}, d.evidence.map(function (e) {
        return el("li", { class: e.current === false ? "is-alt" : "" }, [el("span", { text: e.label + ": " }), el("b", { text: e.text }),
          e.current === false ? el("span", { class: "dx-m3-alt", text: " · Stand " + tagKurz(e.asOf) + ", nicht aktuell" }) : null].filter(Boolean));
      })) : null,
      d.explanation ? el("h4", { text: "Was bedeutet das?" }) : null,
      d.explanation ? el("p", { text: d.explanation }) : null,
      el("h4", { text: "Methodik" }), el("p", { class: "dx-m3-methodik", text: d.methodology })
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
        el("span", { class: "dx-m3-dim-name" }, [el("b", { text: DIM[k].name }), el("small", { text: DIM[k].frage })]),
        el("span", { class: "dx-m3-dim-zustand is-" + r }, [el("i", { "aria-hidden": "true", text: ROLLE_ZEICHEN[r] }), el("b", { text: d.label }), el("small", { text: ROLLE[r] })]),
        ga ? skala(k, ga, d) : el("span", { class: "dx-m3-spur is-leer", "aria-hidden": "true" }),
        el("span", { class: "dx-m3-dim-wert", text: wert })
      ]);
      return el("details", { class: "dx-m3-dim is-" + r, id: "puls-" + k.toLowerCase(), "data-dimension": k, "data-state": d.state }, [kopf, tiefe(d)]);
    });
    return el("section", { class: "dx-m3-karte", id: "maerkte-dimensionen", "aria-label": "Die fünf Dimensionen des Marktumfelds" }, [
      kopfzeile("Vision Universe Market Intelligence", "Fünf Dimensionen, ein Bild",
        "Jede Zeile zeigt den gemessenen Wert auf seiner Skala mit den echten Schwellen der Methodik. Der Ring markiert die vorherige Bewertung. Antippen für Belege und Methodik."),
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
      var kern = [
        el("span", { class: "dx-m3-vj-name", text: r.label }),
        el("span", { class: "dx-m3-vj-wechsel" }, gleich ? [el("b", { text: r.to })]
          : [el("span", { class: "dx-m3-vj-von", text: r.from }), el("span", { class: "dx-m3-vj-pfeil", "aria-hidden": "true", text: " → " }), el("b", { text: r.to })]),
        el("span", { class: "dx-m3-vj-status is-" + String(r.change).toLowerCase(), text: AENDERUNG[r.change] || "" }),
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
      return el("li", { class: "is-" + String(e.change).toLowerCase() }, [
        el("time", { text: tagKurz(e.date) }), el("b", { text: DIM_NAME_EV[e.dimension] || e.dimension }),
        el("span", { text: e.from + " → " + e.to })
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
        return el("li", {}, [el("i", { "aria-hidden": "true", text: ROLLE_ZEICHEN[r] }), el("span", {}, [el("b", { text: (DIM[x.dimension] || {}).name || x.dimension }), document_text(" " + de(x.text))])]);
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
    return el("section", { class: "dx-m3-worauf", id: "maerkte-worauf", "aria-label": "Worauf es jetzt ankommt" }, [
      kopfzeile("Beobachten", "Worauf es jetzt ankommt", "Nicht die größten Bewegungen – die Faktoren, die das Marktbild tragen oder kippen könnten. Die genauen Schwellen stehen darunter."),
      el("ol", { class: "dx-m3-worauf-liste" }, xs.map(function (x, i) {
        var links = (x.symbols || []).slice(0, 2).map(function (s) { return el("a", { class: "dx-m3-chip", href: "#/maerkte/" + encodeURIComponent(s), text: (namen[s] || s) + " ansehen" }); });
        if (x.anchor && x.dimension === "BREADTH") links.push(knopf("Zur Marktbreite", "maerkte-breite", "dx-m3-chip"));
        if (x.anchor && x.dimension !== "BREADTH" && x.dimension !== "CROSS_ASSET") links.push(knopf("Belege", x.anchor, "dx-m3-chip is-leise"));
        return el("li", { class: "dx-m3-punkt-item", "data-dimension": x.dimension }, [
          el("span", { class: "dx-m3-nr", "aria-hidden": "true", "data-nr": String(i + 1).padStart(2, "0") }),
          el("div", {}, [
            el("h3", { text: x.title }),
            el("p", { class: "dx-m3-zustandzeile", text: "Jetzt: " + x.stateLabel }),
            el("p", { text: de(x.why) }),
            links.length ? el("div", { class: "dx-m3-chips" }, links) : null
          ].filter(Boolean))
        ]);
      }))
    ]);
  }

  /* ------------------------------------- Was wuerde das Bild aendern? */

  function basisKarte(env) {
    if (!env || env.level === null || env.level === undefined) return null;
    return el("div", { class: "dx-m3-basis-karte is-l" + env.level }, [
      el("p", { class: "dx-m3-basis-eyebrow", text: "Aktuelle Einordnung" }),
      el("p", { class: "dx-m3-basis-zustand", text: env.label }),
      el("p", { class: "dx-m3-basis-aussage", text: env.statement })
    ]);
  }

  function bildAendern(p, namen) {
    var c = p.changes;
    if (!c || (!c.better.length && !c.worse.length)) return null;
    function spalte(titel, xs, r) {
      return el("div", { class: "dx-m3-aendern-spalte is-" + r }, [el("h3", {}, [el("i", { "aria-hidden": "true", text: r === "besser" ? "↑" : "↓" }), document_text(" " + titel)]),
        xs.length ? el("ul", {}, xs.map(function (x) {
          return el("li", {}, [
            el("p", { class: "dx-m3-aendern-ziel", text: (DIM[x.dimension] || {}).name + " → " + x.toLabel + " · Einordnung „" + x.levelLabel + "“" }),
            el("p", { text: de(x.text.charAt(0).toUpperCase() + x.text.slice(1)) + "." }),
            x.symbols && x.symbols.length ? el("div", { class: "dx-m3-chips" }, x.symbols.map(function (s) {
              return el("a", { class: "dx-m3-chip", href: "#/maerkte/" + encodeURIComponent(s), text: namen[s] || s });
            })) : null
          ].filter(Boolean));
        })) : el("p", { class: "dx-m3-leer", text: "Keine einzelne Veränderung würde die Einordnung in diese Richtung verschieben." })]);
    }
    return el("section", { class: "dx-m3-aendern", id: "maerkte-aendern", "aria-label": "Was würde das Marktbild verändern?" }, [
      kopfzeile("Transparenz", "Was würde das Marktbild verändern?", "Mit derselben Regel gerechnet: welche einzelne Veränderung die Einordnung „" +
        (p.environment ? p.environment.label : "") + "“ verschieben würde. Echte Schwellen, aktuelle Messwerte – keine Prognose."),
      el("div", { class: "dx-m3-aendern-raster" }, [spalte("Positiver würde das Bild, wenn …", c.better, "besser"), basisKarte(p.environment),
                                                    spalte("Negativer würde das Bild, wenn …", c.worse, "schlechter")].filter(Boolean))
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
    var aktiv = "3M";
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
      kopfzeile("Marktbreite", "Wie viele Aktien tragen die Marktbewegung mit?", "Die großen Indizes können steigen, während nur wenige Aktien zulegen. Die Marktbreite zeigt, wie breit eine Bewegung getragen ist."),
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
      kopfzeile("Cross Asset · ein Monat", obs.length ? obs[0].text.replace(/\.$/, "") : "Ruhiges Gesamtbild über die Anlageklassen",
        "Wie ungewöhnlich war der letzte Monat je Anlageklasse – gemessen an ihrer eigenen typischen Monatsbewegung. Die Linien markieren „deutlich“ (1-fach typisch)."),
      obs.length > 1 ? el("ul", { class: "dx-m3-ca-obs" }, obs.slice(1).map(function (o) { return el("li", { text: o.text }); })) : null,
      el("ul", { class: "dx-m3-ca-liste" }, zeilen),
      el("p", { class: "dx-m3-fuss", text: "Beschrieben wird, was sich gleichzeitig bewegt – nicht, warum. Steigende Renditen, steigendes Gold oder Bitcoin gelten nicht automatisch als gut oder schlecht." })
    ].filter(Boolean));
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

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.MarketIntelligence = {
    hero: hero, landkarte: landkarte, vorherJetzt: vorherJetzt, warum: warum, worauf: worauf, bildAendern: bildAendern,
    verlauf: verlauf, breite: breite, crossAsset: crossAsset, stories: stories,
    naechsteBewertung: naechsteBewertung, zyklusText: zyklusText, ZEITRAEUME: ZEITRAEUME
  };
})(typeof window !== "undefined" ? window : globalThis);
