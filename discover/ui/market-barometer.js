/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/market-barometer.js

   DAS MARKTBAROMETER IN ZWEI MINUTEN (#/maerkte/einordnung)

   Owner-Feedback: "Ich muss nach zwei Minuten einordnen koennen, ob ich
   beim Investieren eine gute Chance habe - grosse Zahlen, Diagramme,
   Icons, Swipen; Details erst auf einer Unterseite."

   Aufbau - jede Sektion beantwortet genau eine Frage:
     1 Wie steht das Barometer?          Wetter-Symbol, Tacho, Stufe, ein Satz
     2 Was hiess das frueher?            vier grosse Zahlen (1 Jahr, 5 Jahre, Risiko)
     3 Und bei anderen Stufen?           ein Diagramm mit vier Ansichten
     4 Warum steht es dort?              vier Symbol-Kacheln
     5 Was wuerde es bewegen?            besser / schlechter
     6 Die fuenf Stufen                  zum Wischen
     + Krisen-Check (haette es gewarnt?) nach dem Vergleich,
       Kalender-Kontext (kein Teil des Barometers) vor den Details
     7 Alle Details                      eigene Unterseite (#/maerkte/einordnung/details)

   WAS DIESE DATEI NICHT TUT
   Sie bestimmt keinen Zustand und rechnet keine Statistik. Stufe und
   Gruende kommen aus dem Core-Artefakt (market-pulse.json), alle
   historischen Zahlen aus dem veroeffentlichten Pruefungs-Auszug
   (market-pulse-evidence.json). Fehlt der Auszug, entfallen die
   historischen Sektionen - keine erfundene Zahl.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var el = S.el;

  /* Die Stufen als Wetter: sofort verstaendlich, ohne Fachwort. */
  var WETTER = [
    { glyph: "gewitter", wort: "Stürmisch", satz: "Der Markt ist angeschlagen – deutliche Rückschläge kamen hier am häufigsten." },
    { glyph: "regen", wort: "Regnerisch", satz: "Mehr Gegenwind als Rückenwind." },
    { glyph: "wechselhaft", wort: "Wechselhaft", satz: "Chancen ja, aber nicht auf breiter Front." },
    { glyph: "heiter", wort: "Heiter", satz: "Der Markt hat Rückenwind." },
    { glyph: "sonne", wort: "Sonnig", satz: "Breiter Rückenwind – fast alles zieht mit." }
  ];
  var ROLLE_WORT = { support: "Rückenwind", headwind: "Gegenwind", neutral: "Neutral", open: "Offen", context: "Kontext" };

  function MI() { return global.VUDiscover && global.VUDiscover.MarketIntelligence; }
  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function zahl(v, d) {
    try { return new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
    catch (_) { return v.toFixed(d); }
  }
  function pct(v, d, vz) { return (v < 0 ? "−" : vz && v > 0 ? "+" : "") + zahl(Math.abs(v), d === undefined ? 1 : d) + " %"; }
  function jahr(iso) { return iso ? iso.slice(0, 4) : ""; }
  function tag(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." : ""; }
  function txt(t) { return global.document ? global.document.createTextNode(t) : { text: t }; }
  function glyph(k) { var m = MI(); return m && m.glyph ? m.glyph(k) : null; }
  function wetterIcon(level, gross) {
    return el("span", { class: "bm-wetter is-l" + level + (gross ? " is-gross" : ""), "aria-hidden": "true" }, [glyph(WETTER[level].glyph)].filter(Boolean));
  }
  function kopf(eyebrow, titel, unter) {
    return el("header", { class: "bm-kopf" }, [
      eyebrow ? el("p", { class: "bm-eyebrow", text: eyebrow }) : null,
      el("h2", { text: titel }),
      unter ? el("p", { class: "bm-unter", text: unter }) : null
    ].filter(Boolean));
  }

  /* Historische Zeile fuer eine Stufe: 4 (Breit konstruktiv) nutzt die
     oberste gemessene Stufe - die Branchen-Breite der Geschichte ist nur
     eine Naeherung (siehe Auszug, topLevelNote). */
  function stufeIn(liste, level) {
    if (!liste || !liste.length) return null;
    var hit = liste.filter(function (x) { return x.level === level; })[0];
    return hit || (level > liste[liste.length - 1].level ? liste[liste.length - 1] : null);
  }
  function lang(ev, days) { return ev && ev.longTerm ? ev.longTerm.filter(function (t) { return t.days === days; })[0] || null : null; }
  function risikoWort(ev, x) {
    if (!x || !ev || !isNum(ev.overallDrawdownShare)) return null;
    var d = x.drawdownShare - ev.overallDrawdownShare;
    return d > 3 ? "erhöht" : d < -3 ? "gering" : "normal";
  }

  /* ---------------------------------------------- 1 Wie steht es heute? */
  function heute(p) {
    var env = p.environment, w = WETTER[env.level], m = MI();
    var skala = env.scale || [];
    return el("section", { class: "bm-heute is-l" + env.level, id: "bm-heute", "aria-label": "Das Marktbarometer heute" }, [
      el("p", { class: "bm-eyebrow", text: "Marktbarometer · US-Aktien · Datenstand " + tag(p.evaluation && p.evaluation.dataAsOf) }),
      el("div", { class: "bm-heute-raster" }, [
        el("div", { class: "bm-heute-bild" }, [wetterIcon(env.level, true), m && m.gauge ? el("div", { class: "bm-heute-gauge" }, [m.gauge(env, null)].filter(Boolean)) : null].filter(Boolean)),
        el("div", { class: "bm-heute-text" }, [
          el("p", { class: "bm-heute-wetter", text: w.wort }),
          el("h2", { class: "bm-heute-stufe", text: env.label }),
          el("p", { class: "bm-heute-satz", text: w.satz }),
          skala.length ? el("ol", { class: "bm-leiste", "aria-label": "Stufe " + (env.level + 1) + " von " + skala.length }, skala.map(function (s, i) {
            return el("li", { class: "is-l" + i + (i === env.level ? " is-aktiv" : "") }, [el("i", { "aria-hidden": "true" }), el("span", { text: s.label })]);
          })) : null
        ].filter(Boolean))
      ])
    ]);
  }

  /* --------------------------------------- 2 Was hiess das frueher? */
  function chance(p, ev) {
    var env = p.environment;
    var j1 = lang(ev, 252), j5 = lang(ev, 1260);
    var a = j1 && stufeIn(j1.levels, env.level), b = j5 && stufeIn(j5.levels, env.level);
    var r = stufeIn(ev.levels, env.level);
    if (!a || !r) return null;
    var rw = risikoWort(ev, r);
    function kachel(icon, rolle, gross, text, klein) {
      return el("div", { class: "bm-zahl is-" + rolle }, [
        el("span", { class: "bm-zahl-icon", "aria-hidden": "true" }, [glyph(icon)].filter(Boolean)),
        el("b", { text: gross }), el("p", { text: text }), klein ? el("small", { text: klein }) : null
      ].filter(Boolean));
    }
    var kacheln = [
      kachel("hoch", "gut", pct(a.positiveShare, 0), "lagen nach 1 Jahr im Plus", "im Schnitt " + pct(a.meanReturn, 1, true) + " Rendite"),
      kachel("prozent", "gut", pct(a.medianReturn, 1, true), "typische Rendite nach 1 Jahr", "Hälfte der Fälle darüber, Hälfte darunter"),
      b ? kachel("kurve", "gut", pct(b.medianReturn, 0, true), "typisch nach 5 Jahren", b.positiveShare + " von 100 Fällen im Plus") : null,
      kachel("puls", rw === "erhöht" ? "warn" : "neutral", pct(r.drawdownShare, 0), "Risiko eines Rückschlags von 10 % in " + (ev.horizon.label === "3 Monate" ? "3 Monaten" : ev.horizon.label),
        rw ? rw.charAt(0).toUpperCase() + rw.slice(1) + " – Schnitt aller Tage " + pct(ev.overallDrawdownShare, 0) : null)
    ].filter(Boolean);
    var fazit = "Langfristig lag man bei „" + env.label + "“ " + (a.positiveShare >= 70 ? "meist" : "häufig") + " im Plus. Kurzfristig war das Rückschlag-Risiko " +
      (rw === "normal" ? "normal." : rw === "erhöht" ? "erhöht." : "gering.");
    return el("section", { class: "bm-chance", id: "bm-chance", "aria-label": "Was hieß diese Stufe früher für Anleger?" }, [
      kopf("Seit " + jahr(ev.from) + " · fast " + (Math.round((Date.parse(ev.to) - Date.parse(ev.from)) / (365.25 * 864e5) / 10) * 10) + " Jahre Börsengeschichte",
        "Was hieß „" + env.label + "“ früher für Anleger?",
        "Alle Tage, an denen das Barometer auf „" + env.label + "“ stand – und was danach mit dem US-Aktienmarkt geschah."),
      el("div", { class: "bm-zahlen" }, kacheln),
      el("p", { class: "bm-fazit" }, [el("span", { class: "bm-fazit-icon", "aria-hidden": "true" }, [glyph("funken")].filter(Boolean)),
        el("span", {}, [el("b", { text: "Kurz gesagt: " }), txt(fazit)])])
    ]);
  }

  /* ------------------------------------ 3 Und bei anderen Stufen? */
  var ANSICHTEN = [
    { id: "plus", label: "Im Plus nach 1 Jahr" },
    { id: "schlecht", label: "Schlechtes Jahr" },
    { id: "risiko", label: "Rückschlag-Risiko" },
    { id: "fuenf", label: "Nach 5 Jahren" }
  ];
  function reihe(ev, id) {
    var j1 = lang(ev, 252), j5 = lang(ev, 1260);
    if (id === "plus" && j1) return j1.levels.map(function (x) { return { level: x.level, label: x.label, wert: x.positiveShare, text: pct(x.positiveShare, 0), sub: "Ø " + pct(x.meanReturn, 1, true) }; });
    if (id === "schlecht" && j1) return j1.levels.map(function (x) { return { level: x.level, label: x.label, wert: Math.abs(Math.min(0, x.bad10)), text: pct(x.bad10, 0), sub: "1 von 10 Jahren", neg: true }; });
    if (id === "risiko") return ev.levels.map(function (x) { return { level: x.level, label: x.label, wert: x.drawdownShare, text: pct(x.drawdownShare, 0), sub: "in 3 Monaten", neg: true }; });
    if (id === "fuenf" && j5) return j5.levels.map(function (x) { return { level: x.level, label: x.label, wert: x.medianReturn, text: pct(x.medianReturn, 0, true), sub: x.positiveShare + " % im Plus" }; });
    return null;
  }
  function fazitAnsicht(id, zeilen) {
    var a = zeilen[0], z = zeilen[zeilen.length - 1];
    var min = zeilen.reduce(function (m, x) { return x.wert < m.wert ? x : m; }, a), max = zeilen.reduce(function (m, x) { return x.wert > m.wert ? x : m; }, a);
    if (id === "plus") return "Nach einem Jahr lag man zwischen " + pct(min.wert, 0) + " („" + min.label + "“) und " + pct(max.wert, 0) + " („" + max.label + "“) der Fälle im Plus.";
    if (id === "schlecht") return "In einem schlechten Jahr (1 von 10) verlor man bei „" + a.label + "“ " + a.text.replace("−", "") + ", bei „" + z.label + "“ " + z.text.replace("−", "") + ". Das Barometer zeigt vor allem, wie tief es fallen kann.";
    if (id === "risiko") return "Bei „" + a.label + "“ kam ein Rückschlag von 10 % " + (z.wert > 0 ? zahl(a.wert / z.wert, 1).replace(",0", "") + "-mal" : "deutlich") + " so oft wie bei „" + z.label + "“.";
    return "Nach 5 Jahren lag man bei jeder Stufe meist deutlich im Plus. Unabhängige 5-Jahres-Zeiträume gibt es nur wenige – die Unterschiede zwischen den Stufen sind hier nicht belastbar.";
  }
  function vergleich(p, ev) {
    if (!lang(ev, 252)) return null;
    var env = p.environment, heuteStufe = Math.min(env.level, ev.levels[ev.levels.length - 1].level);
    var aktiv = "plus";
    var flaeche = el("div", { class: "bm-chart-box" });
    var leiste = el("div", { class: "bm-tabs", role: "group", "aria-label": "Ansicht des Vergleichs" });
    function zeichnen() {
      var zeilen = reihe(ev, aktiv);
      Array.prototype.forEach.call(leiste.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-ansicht") === aktiv)); });
      S.clear(flaeche);
      if (!zeilen || !zeilen.length) return;
      var max = Math.max.apply(null, zeilen.map(function (x) { return x.wert; })) || 1;
      flaeche.appendChild(el("div", { class: "bm-chart" + (zeilen[0].neg ? " is-neg" : ""), role: "img",
        "aria-label": zeilen.map(function (x) { return x.label + ": " + x.text; }).join(", ") }, zeilen.map(function (x) {
        return el("div", { class: "bm-saeule is-l" + x.level + (x.level === heuteStufe ? " is-heute" : "") }, [
          el("b", { class: "bm-saeule-wert", text: x.text }),
          el("div", { class: "bm-saeule-spur" }, [el("span", { style: "height:" + Math.max(4, 100 * x.wert / max).toFixed(1) + "%" })]),
          wetterIcon(x.level), el("span", { class: "bm-saeule-name", text: x.label + (x.level === heuteStufe ? " · heute" : "") })
        ]);
      })));
      flaeche.appendChild(el("p", { class: "bm-chart-fazit", text: fazitAnsicht(aktiv, zeilen) }));
    }
    ANSICHTEN.forEach(function (a) {
      if (!reihe(ev, a.id)) return;
      var b = el("button", { type: "button", "data-ansicht": a.id, "aria-pressed": String(a.id === aktiv), text: a.label });
      b.onclick = function () { if (aktiv === a.id) return; aktiv = a.id; zeichnen(); };
      leiste.appendChild(b);
    });
    zeichnen();
    return el("section", { class: "bm-vergleich", id: "bm-vergleich", "aria-label": "Und wenn das Barometer anders steht?" }, [
      kopf("Vergleich", "Und wenn das Barometer anders steht?", "Dieselbe Frage für jede Stufe – antippen, um die Ansicht zu wechseln."),
      leiste, flaeche,
      el("p", { class: "bm-fuss", text: "„Konstruktiv“ umfasst hier auch „Breit konstruktiv“. " + (ev.longTermNote || "") })
    ]);
  }

  /* ------------------------------------ Krisen-Check: haette es gewarnt?
     Owner-Frage: "Haette das Barometer vor Corona oder der Dotcom-Blase
     angeschlagen?" Ehrlich beantwortet: am Hoch stand es meist auf
     "Konstruktiv" - es erkennt den Umschwung, nicht den ersten Tag. */
  var MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function median(xs) { var s = xs.slice().sort(function (a, b) { return a - b; }); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; }
  /* Kennzahlen des Stresstests - auch fuer die Karte auf der Uebersicht. */
  function stresstest(ev) {
    var ks = ev && ev.crises ? ev.crises.filter(function (k) { return isNum(k.fall); }) : [];
    if (ks.length < 3) return null;
    var mit = ks.filter(function (k) { return k.firstWarning; });
    var boden = ks.filter(function (k) { return k.backSelective; });
    return { krisen: ks, erkannt: mit.length, anzahl: ks.length,
      beiWarnung: median(mit.map(function (k) { return k.firstWarning.fallAt; })),
      danach: median(mit.map(function (k) { return k.firstWarning.restAfter; })),
      anteil: median(ks.map(function (k) { return k.warningShare || 0; })),
      boden: boden.length ? median(boden.map(function (k) { return k.backSelective.riseFromTrough; })) : null,
      amTiefDefensiv: ks.filter(function (k) { return k.levelAtTrough === "Defensiv"; }).length };
  }
  function krisen(ev) {
    var t = stresstest(ev);
    if (!t) return null;
    function zahl3(gross, text, klein, art) {
      return el("div", { class: "bm-krisen-zahl" + (art ? " is-" + art : "") }, [el("b", { text: gross }), el("p", { text: text }), klein ? el("small", { text: klein }) : null].filter(Boolean));
    }
    function jahre(k) { return k.peak.slice(0, 4) + (k.trough.slice(0, 4) !== k.peak.slice(0, 4) ? "–" + k.trough.slice(0, 4) : ""); }
    var zeilen = t.krisen.slice().reverse().map(function (k) {
      var w = k.firstWarning, b = k.backSelective;
      return el("tr", {}, [
        el("th", { scope: "row" }, [el("b", { text: k.name }), el("small", { text: jahre(k) })]),
        el("td", { "data-label": "Absturz", class: "is-fall", text: pct(k.fall, 0) }),
        el("td", { "data-label": "Am Hoch", text: k.levelAtPeak || "–" }),
        el("td", { "data-label": "Warnung", text: w ? (w.tradingDaysAfterPeak === 0 ? "schon am Hoch" : "bei " + pct(w.fallAt, 0)) : "keine" }),
        el("td", { "data-label": "Danach fiel er noch", class: "is-danach", text: w ? pct(w.restAfter, 0) : "–" }),
        el("td", { "data-label": "Wieder „Selektiv“", class: "is-boden", text: b ? pct(b.riseFromTrough, 0, true) + " über dem Tief" : "–" })
      ]);
    });
    return el("section", { class: "bm-krisen", id: "bm-krisen", "aria-label": "Stresstest: Hätte das Barometer gewarnt?" }, [
      el("div", { class: "bm-krisen-buehne" }, [
        el("p", { class: "bm-krisen-eyebrow" }, [el("span", { class: "bm-krisen-schild", "aria-hidden": "true" }, [glyph("schild")].filter(Boolean)),
          el("span", { text: "Stresstest seit " + t.krisen[0].peak.slice(0, 4) + " · mit den heutigen Regeln nachgerechnet" })]),
        el("h2", { class: "bm-krisen-titel" }, [el("b", { text: t.erkannt + " von " + t.anzahl }), el("span", { text: "großen Abstürzen hätte das Barometer früh erkannt – bevor der größte Teil kam." })]),
        el("div", { class: "bm-krisen-zahlen" }, [
          zahl3("bei " + pct(t.beiWarnung, 0), "stand es typisch schon auf Warnstufe", "„Vorsichtig“ oder „Defensiv“", "warn"),
          zahl3(pct(t.danach, 0), "fiel der Markt danach typisch noch", "der größte Teil kam nach der Warnung", "gut"),
          zahl3(pct(t.anteil, 0), "des Weges nach unten auf Warnstufe", "im Median über alle sieben", "neutral"),
          t.boden !== null ? zahl3(pct(t.boden, 0, true), "über dem Tief erst wieder „Selektiv“", "Böden erkennt es nicht – es bestätigt den Aufschwung", "grenze") : null
        ].filter(Boolean)),
        el("div", { class: "bm-krisen-tabelle-box" }, [el("table", { class: "bm-krisen-tabelle" }, [
          el("caption", { text: "Die sieben großen Abstürze seit " + t.krisen[0].peak.slice(0, 4) + " – neueste zuerst" }),
          el("thead", {}, [el("tr", {}, ["Absturz", "Minus", "Am Hoch", "Warnung", "Danach fiel er noch", "Wieder „Selektiv“"].map(function (x) { return el("th", { scope: "col", text: x }); }))]),
          el("tbody", {}, zeilen)
        ])])
      ]),
      el("div", { class: "bm-ehrlich" }, [el("span", { class: "bm-ehrlich-icon", "aria-hidden": "true" }, [glyph("lupe")].filter(Boolean)),
        el("div", {}, [el("b", { text: "Was das Barometer nicht kann" }),
          el("p", { text: "Es sagt weder den ersten Tag eines Absturzes noch den Boden voraus. Am Hoch stand es meist auf „Konstruktiv“, am Tief immer auf „Defensiv“ (" + t.amTiefDefensiv + " von " + t.anzahl + "). " +
            "Es reagiert, sobald der Markt kippt, und bestätigt den neuen Aufschwung erst, wenn er trägt – bei Corona kam das spät. Sehr schnelle Crashs wie 1987 oder 2020 fängt es nur teilweise ab. " +
            "Nachgerechnet mit den Regeln von heute – das Barometer gab es damals noch nicht." })])]),
      ev.crisesNote ? el("p", { class: "bm-fuss", text: ev.crisesNote }) : null
    ].filter(Boolean));
  }

  /* ------------------------------------------ Fruehe Erholungszeichen
     Owner-Wunsch: "Hat es die Boeden erkannt?" - das Barometer nicht, und
     es wird dafuer nicht verbogen. Stattdessen ein eigenes Zeichen (Breiten-
     schub nach einem Absturz), getrennt vom Barometer, mit seiner ganzen
     Bilanz: frueh, aber in langen Baerenmaerkten oft zu frueh.
     Live: Baerenmarkt = SPY mind. 20 % unter dem 52-Wochen-Hoch (Risiko-
     Messwert), Schub = Anteil der Aktien ueber der 50-Tage-Linie springt
     binnen 20 Handelstagen von hoechstens 20 % auf mindestens 65 %
     (Tageswerte aus der Historie). Fehlt die Breitenhistorie, sagt es das. */
  function erholungLive(p, hist, rule) {
    var risk = p.dimensions && p.dimensions.RISK;
    var dd = null;
    (risk && risk.evidence || []).forEach(function (e) { if (e.key === "drawdown52w" && isNum(e.value)) dd = e.value; });
    if (dd === null) return { zustand: "offen", dd: null };
    if (dd > -rule.bear) return { zustand: "inaktiv", dd: dd };
    var tage = (hist && hist.days || []).filter(function (t) { return t.metrics && isNum(t.metrics.above50Pct); });
    if (tage.length < rule.window + 1) return { zustand: "zu-wenig", dd: dd, tage: tage.length };
    var schub = null;
    for (var i = Math.max(rule.window, tage.length - 60); i < tage.length; i++) {
      if (tage[i].metrics.above50Pct < rule.to) continue;
      var mn = Infinity;
      for (var k = i - rule.window; k < i; k++) mn = Math.min(mn, tage[k].metrics.above50Pct);
      if (mn <= rule.from) schub = tage[i];
    }
    var letzt = tage[tage.length - 1];
    return schub ? { zustand: "zeichen", dd: dd, seit: schub.date, jetzt: letzt.metrics.above50Pct } : { zustand: "baer", dd: dd, jetzt: letzt.metrics.above50Pct };
  }
  function erholung(p, ev, hist) {
    var r = ev && ev.recovery;
    if (!r || !r.bearMarkets || !r.bearMarkets.length) return null;
    var rule = r.rule, live = erholungLive(p, hist, rule);
    var ICON = { inaktiv: "puls", offen: "puls", "zu-wenig": "puls", baer: "runter", zeichen: "hoch" };
    var ROLLE = { inaktiv: "neutral", offen: "neutral", "zu-wenig": "neutral", baer: "warn", zeichen: "gut" };
    var titel = { inaktiv: "Zurzeit inaktiv", offen: "Nicht bestimmbar", "zu-wenig": "Bärenmarkt – noch zu wenig Breitenhistorie",
      baer: "Bärenmarkt – noch kein Erholungszeichen", zeichen: "Frühes Erholungszeichen seit " + tag(live.seit) }[live.zustand];
    var satz = {
      inaktiv: "Das Zeichen schaut nur in Bärenmärkten – wenn der Markt mindestens " + rule.bear + " % unter seinem Hoch liegt. Heute: " + pct(live.dd, 1) + " unter dem 52-Wochen-Hoch.",
      offen: "Der Abstand zum 52-Wochen-Hoch ist gerade nicht verfügbar.",
      "zu-wenig": "Für den Breitenschub braucht es " + (rule.window + 1) + " Tage mit Breitendaten; gespeichert sind " + live.tage + ".",
      baer: "Heute liegen " + (isNum(live.jetzt) ? pct(live.jetzt, 0) : "–") + " der Aktien über ihrer 50-Tage-Linie. Das Zeichen kommt, wenn der Anteil binnen " + rule.window + " Handelstagen von höchstens " + rule.from + " % auf mindestens " + rule.to + " % springt.",
      zeichen: "Sehr viele Aktien ziehen zugleich wieder an. Früher kam das typisch rund " + pct(r.lastingRiseMedian, 0) + " über dem Tief – aber in langen Bärenmärkten auch zu früh (siehe unten)."
    }[live.zustand];
    var namen = { "1929": "Weltwirtschaftskrise", "1973": "Ölkrise", "1987": "Schwarzer Montag", "2000": "Dotcom-Blase", "2007": "Finanzkrise", "2020": "Corona-Crash", "2021": "Zinsschock" };
    var zeilen = r.bearMarkets.filter(function (b) { return namen[b.peak.slice(0, 4)] && b.first; }).reverse().map(function (b) {
      return el("tr", {}, [
        el("th", { scope: "row" }, [el("b", { text: namen[b.peak.slice(0, 4)] }), el("small", { text: pct(b.fall, 0) })]),
        el("td", { "data-label": "Erstes Zeichen", text: b.first.date.slice(8, 10) + "." + b.first.date.slice(5, 7) + "." + b.first.date.slice(0, 4) }),
        el("td", { "data-label": "Danach fiel er noch", class: b.first.false ? "is-falsch" : "is-gut", text: b.first.false ? pct(b.first.furtherDrop, 1) + " – zu früh" : pct(b.first.furtherDrop, 1) + " – getragen" }),
        el("td", { "data-label": "Erstes tragendes Zeichen", text: b.firstLasting ? pct(b.firstLasting.riseFromTrough, 0, true) + " über dem Tief" : "–" })
      ]);
    });
    return el("section", { class: "bm-erholung", id: "bm-erholung", "aria-label": "Frühe Erholungszeichen" }, [
      kopf("Eigenes Zeichen · kein Teil des Barometers", "Und die Böden? Frühe Erholungszeichen",
        "Das Barometer bestätigt einen Aufschwung erst, wenn er trägt. Dieses Zeichen ist früher: Es meldet sich, wenn nach einem Absturz plötzlich sehr viele Aktien zugleich wieder anziehen."),
      el("div", { class: "bm-erh-status is-" + ROLLE[live.zustand] }, [
        el("span", { class: "bm-erh-icon", "aria-hidden": "true" }, [glyph(ICON[live.zustand])].filter(Boolean)),
        el("div", {}, [el("p", { class: "bm-erh-jetzt", text: "Jetzt" }), el("b", { text: titel }), el("p", { text: satz })])
      ]),
      el("div", { class: "bm-erh-zahlen" }, [
        el("div", { class: "bm-erh-zahl is-gut" }, [el("b", { text: pct(r.lastingRiseMedian, 0, true) }), el("p", { text: "über dem Tief – typisch beim ersten tragenden Zeichen" }),
          el("small", { text: stresstest(ev) && stresstest(ev).boden !== null ? "zum Vergleich: das Barometer wurde typisch erst " + pct(stresstest(ev).boden, 0, true) + " über dem Tief wieder „Selektiv“" : "früher als das Barometer" })]),
        el("div", { class: "bm-erh-zahl is-warn" }, [el("b", { text: r.firstFalse + " von " + r.withSignal }), el("p", { text: "Bärenmärkten: das erste Zeichen kam zu früh" }),
          el("small", { text: "danach ging es noch mindestens 10 % tiefer" })]),
        el("div", { class: "bm-erh-zahl is-warn" }, [el("b", { text: pct(r.worstFirst, 0) }), el("p", { text: "schlimmster Fall nach einem ersten Zeichen" }), el("small", { text: "Januar 1930, mitten in der Weltwirtschaftskrise" })])
      ]),
      el("div", { class: "bm-erh-tabelle-box" }, [el("table", { class: "bm-erh-tabelle" }, [
        el("caption", { text: "Das erste Zeichen in den großen Abstürzen – so, wie man es damals erlebt hätte" }),
        el("thead", {}, [el("tr", {}, ["Absturz", "Erstes Zeichen", "Danach fiel er noch", "Erstes tragendes Zeichen"].map(function (x) { return el("th", { scope: "col", text: x }); }))]),
        el("tbody", {}, zeilen)
      ])]),
      el("p", { class: "bm-erh-fazit" }, [el("b", { text: "Kurz gesagt: " }), txt("In schnellen Erholungen wie 1987 oder 2020 war das erste Zeichen richtig. In langen Bärenmärkten – 1930, 1974, 2001, 2008 – kam das erste Zeichen zu früh. Es ist ein Hinweis zum Hinschauen, kein Signal zum Handeln.")]),
      ev.recoveryNote ? el("p", { class: "bm-fuss", text: ev.recoveryNote + " Über alle " + r.bears + " Bärenmärkte: " + r.allSignals + " Zeichen, davon " + r.allFalse + " zu früh." }) : null
    ].filter(Boolean));
  }

  /* --------------------------- Kalender-Kontext: Saisonalitaet, Wahlzyklus
     Ausdruecklich KEIN Teil des Barometers - eigene Statistik aus derselben
     Reihe, mit Fallzahlen und Mehrfachtest bei den Monaten. */
  function zyklusJahr(y) { var r = (((y - 1928) % 4) + 4) % 4; return r === 0 ? 4 : r; }
  function kalender(ev, jetzt) {
    var c = ev && ev.calendar;
    if (!c || !c.months || c.months.length !== 12 || !c.cycle) return null;
    jetzt = jetzt || new Date();
    var m = jetzt.getUTCMonth() + 1, y = jetzt.getUTCFullYear(), cy = zyklusJahr(y);
    var zy = c.cycle.filter(function (x) { return x.year === cy; })[0];
    var vor = (c.forward12.byCycleMonth || []).filter(function (x) { return x.cycleYear === cy && x.month === m; })[0];
    var basis = (c.forward12.byMonth || []).filter(function (x) { return x.month === m; })[0];
    var mMax = Math.max.apply(null, c.months.map(function (x) { return Math.abs(x.meanReturn); })) || 1;
    var monate = el("div", { class: "bm-monate", role: "img", "aria-label": "Durchschnittliche Rendite je Kalendermonat: " +
      c.months.map(function (x) { return MONATE[x.month - 1] + " " + pct(x.meanReturn, 1, true); }).join(", ") }, c.months.map(function (x) {
      var h = (50 * Math.abs(x.meanReturn) / mMax).toFixed(1);
      return el("div", { class: "bm-monat" + (x.month === m ? " is-jetzt" : "") + (x.meanReturn < 0 ? " is-neg" : "") }, [
        el("b", { text: (x.meanReturn > 0 ? "+" : x.meanReturn < 0 ? "−" : "") + zahl(Math.abs(x.meanReturn), 1) + (x.significant ? "*" : "") }),
        el("div", { class: "bm-monat-spur" }, [el("span", { style: (x.meanReturn >= 0 ? "bottom:50%" : "top:50%") + ";height:" + h + "%" })]),
        el("small", { text: MONATE[x.month - 1].slice(0, 3) })
      ]);
    }));
    var zMax = Math.max.apply(null, c.cycle.map(function (x) { return Math.abs(x.meanReturn); })) || 1;
    var zyklus = el("div", { class: "bm-zyklus", role: "img", "aria-label": "Rendite je Jahr im Präsidentschaftszyklus: " +
      c.cycle.map(function (x) { return x.label + " " + pct(x.meanReturn, 1, true) + ", " + x.positiveShare + " % im Plus"; }).join("; ") }, c.cycle.map(function (x) {
      return el("div", { class: "bm-zjahr" + (x.year === cy ? " is-jetzt" : "") }, [
        el("b", { text: pct(x.meanReturn, 0, true) }),
        el("div", { class: "bm-zjahr-spur" }, [el("span", { style: "height:" + Math.max(4, 100 * Math.max(0, x.meanReturn) / zMax).toFixed(1) + "%" })]),
        el("span", { class: "bm-zjahr-name", text: x.label }),
        el("small", { text: x.positiveShare + " % im Plus" + (x.year === cy ? " · jetzt" : "") })
      ]);
    }));
    var jetztKarte = vor && vor.n ? el("div", { class: "bm-kal-jetzt" }, [
      el("p", { class: "bm-kal-jetzt-kopf", text: "Jetzt: " + MONATE[m - 1] + " " + y + " · " + (zy ? zy.label : "") }),
      el("b", { text: pct(vor.meanReturn, 1, true) }),
      el("p", { text: "im Schnitt in den 12 Monaten ab Ende " + MONATE[m - 1] + " eines " + ({ 1: "Jahres nach der Wahl", 2: "Midterm-Jahres", 3: "Vorwahljahres", 4: "Wahljahres" }[cy]) }),
      el("small", { text: vor.positiveShare + " von 100 Fällen im Plus · " + vor.n + " Fälle" + (basis ? " · über alle Jahre: " + pct(basis.meanReturn, 1, true) + ", " + basis.positiveShare + " % im Plus" : "") })
    ]) : null;
    return el("section", { class: "bm-kalender", id: "bm-kalender", "aria-label": "Kalender-Kontext: Saisonalität und Wahlzyklus" }, [
      kopf("Kalender-Kontext · kein Teil des Barometers", "Saisonalität und Wahlzyklus", "Was der Kalender seit " + c.from.slice(0, 4) + " über den US-Aktienmarkt sagt – als Zusatzinformation, getrennt von der Einordnung."),
      jetztKarte,
      el("div", { class: "bm-kal-raster" }, [
        el("div", { class: "bm-kal-karte" }, [el("h3", { text: "Die zwölf Monate" }), el("p", { class: "bm-unter", text: "Durchschnittliche Rendite je Monat" }), monate,
          el("p", { class: "bm-fuss", text: "* statistisch gesichert (auch nach Korrektur für zwölf gleichzeitige Tests). Alle anderen Unterschiede können Zufall sein." })]),
        el("div", { class: "bm-kal-karte" }, [el("h3", { text: "Der Präsidentschaftszyklus" }), el("p", { class: "bm-unter", text: "Durchschnittliche Jahresrendite im vierjährigen US-Wahlzyklus" }), zyklus,
          el("p", { class: "bm-fuss", text: "Je Zyklusjahr nur rund " + (zy ? zy.n : 24) + " Jahre seit " + c.from.slice(0, 4) + "." })])
      ]),
      el("p", { class: "bm-fuss", text: ev.calendarNote || "" })
    ].filter(Boolean));
  }

  /* ------------------------------------------- 4 Warum steht es dort? */
  function warum(p) {
    var env = p.environment, m = MI();
    var rolle = {};
    if (env.why) Object.keys(env.why).forEach(function (r) { env.why[r].forEach(function (x) { rolle[x.dimension] = r; }); });
    var kacheln = ["TREND", "BREADTH", "MOMENTUM", "RISK"].map(function (k) {
      var d = p.dimensions && p.dimensions[k], satz = m && m.grundSatz ? m.grundSatz(p, k) : null;
      if (!d || !satz) return null;
      var r = rolle[k] || "neutral";
      return el("div", { class: "bm-grund is-" + r }, [
        el("div", { class: "bm-grund-kopf" }, [m.iconChip(k, r), el("span", { class: "bm-grund-name", text: m.DIM[k].name }),
          el("span", { class: "bm-grund-rolle", text: ROLLE_WORT[r] || "" })]),
        el("b", { class: "bm-grund-zustand", text: d.label }),
        el("p", { text: satz })
      ]);
    }).filter(Boolean);
    if (!kacheln.length) return null;
    var c = env.counts || {};
    return el("section", { class: "bm-warum", id: "bm-warum", "aria-label": "Warum steht das Barometer dort?" }, [
      kopf("Die Gründe", "Warum steht es auf „" + env.label + "“?", (c.support || 0) + " × Rückenwind · " + (c.headwind || 0) + " × Gegenwind · " + (c.neutral || 0) + " × neutral"),
      el("div", { class: "bm-gruende" }, kacheln)
    ]);
  }

  /* ------------------------------------------ 5 Was wuerde es bewegen? */
  var WENDE = {
    TREND: { POSITIVE: "Die großen US-Indizes drehen klar nach oben", NEGATIVE: "Die großen US-Indizes drehen klar nach unten", MIXED: "Der Trend der großen Indizes wird uneinheitlich" },
    BREADTH: { BROAD: "Mehr als die Hälfte der Aktien steigt mit", NARROW: "Nur noch wenige Aktien steigen mit", MIXED: "Die Beteiligung wird uneinheitlich" },
    MOMENTUM: { RISING: "Die letzten Monate drehen ins Plus", FALLING: "Die letzten Monate drehen ins Minus", MIXED: "Der Schwung der letzten Monate lässt nach" },
    RISK: { NORMAL: "Die Schwankungen beruhigen sich", ELEVATED: "Die Kurse schwanken stärker oder fallen um 10 %", HIGH: "Die Kurse schwanken stark oder fallen um 20 %" }
  };
  function wende(p) {
    var c = p.changes;
    if (!c || (!c.better.length && !c.worse.length)) return null;
    function satz(x) { return (WENDE[x.dimension] && WENDE[x.dimension][x.to]) || x.toLabel; }
    function spalte(art, xs, icon, rolle) {
      return el("div", { class: "bm-wende-spalte is-" + rolle }, [
        el("div", { class: "bm-wende-kopf" }, [el("span", { class: "bm-wende-icon", "aria-hidden": "true" }, [glyph(icon)].filter(Boolean)), el("h3", { text: art })]),
        xs.length ? el("ul", {}, xs.slice(0, 3).map(function (x) {
          return el("li", {}, [el("span", { text: satz(x) }), el("b", { class: "is-l" + x.level, text: "→ " + x.levelLabel })]);
        })) : el("p", { class: "bm-leer", text: "Keine einzelne Veränderung würde das Barometer in diese Richtung bewegen." })
      ]);
    }
    return el("section", { class: "bm-wende", id: "bm-wende", "aria-label": "Was würde das Barometer bewegen?" }, [
      kopf("Ausblick ohne Prognose", "Was würde das Barometer bewegen?", "Dieselben Regeln, eine einzelne Veränderung – und wohin das Barometer dann springen würde."),
      el("div", { class: "bm-wende-raster" }, [spalte("Besser, wenn …", c.better, "hoch", "gut"), spalte("Schlechter, wenn …", c.worse, "runter", "warn")])
    ]);
  }

  /* ------------------------------------------- 6 Die fuenf Stufen */
  function stufen(p, ev) {
    var env = p.environment, skala = env.scale || [];
    if (!skala.length) return null;
    var j1 = lang(ev, 252);
    var karten = skala.map(function (s, i) {
      var r = ev ? stufeIn(ev.levels, i) : null, a = j1 ? stufeIn(j1.levels, i) : null;
      return el("article", { class: "bm-stufe is-l" + i + (i === env.level ? " is-heute" : "") }, [
        el("div", { class: "bm-stufe-kopf" }, [wetterIcon(i), i === env.level ? el("em", { text: "heute" }) : null].filter(Boolean)),
        el("p", { class: "bm-stufe-wetter", text: WETTER[i].wort }),
        el("h3", { text: s.label }),
        el("p", { class: "bm-stufe-satz", text: WETTER[i].satz }),
        a || r ? el("dl", {}, [
          a ? el("div", {}, [el("dt", { text: "Im Plus nach 1 Jahr" }), el("dd", { text: pct(a.positiveShare, 0) })]) : null,
          r ? el("div", {}, [el("dt", { text: "Rückschlag-Risiko" }), el("dd", { text: pct(r.drawdownShare, 0) })]) : null
        ].filter(Boolean)) : null
      ].filter(Boolean));
    });
    return el("section", { class: "bm-stufen", id: "bm-stufen", "aria-label": "Die fünf Stufen des Barometers" }, [
      kopf("Zum Wischen", "Die fünf Stufen auf einen Blick", "Von „Stürmisch“ bis „Sonnig“ – mit dem, was früher darauf folgte."),
      el("div", { class: "bm-stufen-reihe", tabindex: "0", role: "group", "aria-label": "Die fünf Stufen – wischen für mehr" }, karten)
    ]);
  }

  /* ------------------------------------- Uebersicht: Im Klartext
     Owner-Feedback 29.09.2026: unter der Barometer-Karte auf #/maerkte
     klar aufgeschluesselt, was die heutige Stufe bedeutet und was frueher
     darauf folgte - die grossen Zahlen, ohne erst tiefer zu tippen. Jede
     Zahl steht neben dem Schnitt aller Tage, damit keine Stufe besser
     aussieht, als sie war. */
  var KLARTEXT = [
    "Der Markt ist angeschlagen: Trend und Beteiligung sind schwach. Deutliche Rückschläge kamen hier am häufigsten.",
    "Mehr Gegenwind als Rückenwind: Der Trend ist brüchig, viele Aktien schwächeln.",
    "Chancen ja, aber nicht auf breiter Front: Der Markt hat Schwung, doch nur ein Teil der Aktien zieht mit.",
    "Der Markt hat Rückenwind: Trend, Schwung und Beteiligung passen zusammen.",
    "Breiter Rückenwind: Trend, Schwung und Beteiligung passen – fast alles zieht mit."
  ];
  /* Die Hauptsache: Das Barometer verschiebt kaum die Hoehe der typischen
     Rendite (bei allen Stufen aehnlich), wohl aber die Chance, nach einem
     Jahr im Plus zu sein, und wie oft es mehr als 10 % nach unten ging.
     Darum ist die Hauptzahl "x von 100 im Plus" - als Balken aus drei
     Teilen, und darunter dieselbe Aufteilung fuer jede Stufe. Owner-
     Feedback 30.09.2026: "Ziel muss sein, bessere Rendite-Wahrschein-
     lichkeiten zu zeigen." */
  function teile(x) {
    var plus = Math.round(x.positiveShare), minus = Math.round(x.lossShare10);
    return { plus: plus, minus: minus, mitte: Math.max(0, 100 - plus - minus) };
  }
  function stapel(x, gross) {
    var t = teile(x);
    return el("span", { class: "dx-m3-kt-stapel" + (gross ? " is-gross" : ""), "aria-hidden": "true" }, [
      el("span", { class: "is-plus", style: "width:" + t.plus + "%" }),
      el("span", { class: "is-mitte", style: "width:" + t.mitte + "%" }),
      el("span", { class: "is-minus", style: "width:" + t.minus + "%" })]);
  }
  function hatVerlust(liste) { return liste && liste.length && liste.every(function (x) { return isNum(x.lossShare10) && isNum(x.positiveShare); }); }
  function chancen(env, j1) {
    var a = stufeIn(j1.levels, env.level), t = teile(a);
    var heute = Math.min(env.level, j1.levels[j1.levels.length - 1].level);
    var zeilen = j1.levels.map(function (x) {
      var u = teile(x), ist = x.level === heute;
      return el("li", { class: "is-l" + x.level + (ist ? " is-heute" : "") }, [
        el("span", { class: "dx-m3-kt-name" }, [el("span", { text: x.label }), ist ? el("em", { text: "heute" }) : null].filter(Boolean)),
        stapel(x, false),
        el("span", { class: "dx-m3-kt-wert", text: u.plus + " im Plus · " + u.minus + " unter −10 %" })
      ]);
    });
    return el("div", { class: "dx-m3-kt-held" }, [
      el("p", { class: "dx-m3-kt-held-label", text: "Von 100 Fällen bei „" + env.label + "“ – so stand man 1 Jahr später da:" }),
      el("div", { class: "dx-m3-kt-held-kopf" }, [
        el("b", { class: "dx-m3-kt-held-zahl", text: t.plus + " von 100" }),
        el("span", { class: "dx-m3-kt-held-satz", text: "im Plus" })]),
      stapel(a, true),
      el("ul", { class: "dx-m3-kt-legende" }, [
        el("li", { class: "is-plus" }, [el("i", { "aria-hidden": "true" }), el("b", { text: String(t.plus) }), txt(" im Plus")]),
        el("li", { class: "is-mitte" }, [el("i", { "aria-hidden": "true" }), el("b", { text: String(t.mitte) }), txt(" leicht im Minus (bis −10 %)")]),
        el("li", { class: "is-minus" }, [el("i", { "aria-hidden": "true" }), el("b", { text: String(t.minus) }), txt(" mehr als 10 % im Minus")])
      ]),
      el("p", { class: "dx-m3-kt-vergleich-titel", text: "Und bei den anderen Stufen?" }),
      el("ol", { class: "dx-m3-kt-stufen", "aria-label": "Nach 1 Jahr im Plus und mehr als 10 % im Minus, je Stufe" }, zeilen)
    ]);
  }
  function klartext(p, ev) {
    var env = p && p.environment;
    if (!env || !isNum(env.level) || !ev || !ev.levels || ev.levels.length < 3) return null;
    var j1 = lang(ev, 252), j5 = lang(ev, 1260);
    var a = j1 && stufeIn(j1.levels, env.level), b = j5 && stufeIn(j5.levels, env.level);
    if (!a || !hatVerlust(j1.levels)) return null;
    var alle = j1.all || null, skala = env.scale || [];
    function kachel(rolle, gross, text, klein) {
      return el("div", { class: "dx-m3-kt-zahl is-" + rolle }, [el("b", { text: gross }), el("p", { text: text }), klein ? el("small", { text: klein }) : null].filter(Boolean));
    }
    var med = j1.levels.map(function (x) { return x.medianReturn; });
    var spanne = "+" + zahl(Math.floor(Math.min.apply(null, med)), 0) + " bis +" + zahl(Math.ceil(Math.max.apply(null, med)), 0) + " %";
    var best = j1.levels.reduce(function (m, x) { return x.positiveShare > m.positiveShare ? x : m; }, j1.levels[0]);
    var schlecht = j1.levels.reduce(function (m, x) { return x.positiveShare < m.positiveShare ? x : m; }, j1.levels[0]);
    var verl = j1.levels.map(function (x) { return x.lossShare10; });
    var lage = !alle ? "" : a.positiveShare - alle.positiveShare >= 4 ? "„" + env.label + "“ gehört zu den günstigeren Stufen. "
      : a.positiveShare - alle.positiveShare <= -4 ? "„" + env.label + "“ gehört zu den ungünstigeren Stufen. " : "„" + env.label + "“ liegt in der Mitte – ein normales Umfeld. ";
    var neu = j1.since2001 && hatVerlust(j1.since2001.levels) ? j1.since2001.levels : null;
    var neuBest = neu ? stufeIn(neu, best.level) : null, neuSchlecht = neu ? stufeIn(neu, schlecht.level) : null;
    var bh = ev.illustration && ev.illustration.rules && ev.illustration.rules[0] && ev.illustration.rules[0].all && ev.illustration.rules[0].all.buyAndHold;
    return el("section", { class: "dx-m3-klartext is-l" + env.level, id: "maerkte-klartext", "aria-label": "„" + env.label + "“ auf einen Blick" }, [
      el("div", { class: "dx-m3-kt-kopf" }, [
        wetterIcon(env.level),
        el("div", {}, [el("p", { class: "dx-m3-kt-eyebrow", text: "Im Klartext · Stufe " + (env.level + 1) + " von " + (skala.length || 5) + " · " + WETTER[env.level].wort }),
          el("h2", { text: "„" + env.label + "“ auf einen Blick" })])
      ]),
      el("p", { class: "dx-m3-kt-satz", text: KLARTEXT[env.level] }),
      chancen(env, j1),
      el("p", { class: "dx-m3-kt-fazit" }, [el("b", { text: "Kurz gesagt: " }), txt(lage + "Das Barometer verschiebt kaum die Höhe der typischen Rendite – die lag bei allen Stufen bei " + spanne +
        " nach 1 Jahr. Es verschiebt die Chance, im Plus zu landen: von " + Math.round(schlecht.positiveShare) + " („" + schlecht.label + "“) bis " + Math.round(best.positiveShare) + " von 100 („" + best.label +
        "“) – und wie oft es mehr als 10 % nach unten ging: " + Math.min.apply(null, verl) + " bis " + Math.max.apply(null, verl) + " von 100.")]),
      neuBest && neuSchlecht ? el("p", { class: "dx-m3-kt-neu" }, [el("b", { text: "Auch in den jüngeren Jahren: " }),
        txt("Seit 2001 für sich gerechnet dasselbe Muster – „" + best.label + "“ " + Math.round(neuBest.positiveShare) + " von 100 im Plus, „" + schlecht.label + "“ " + Math.round(neuSchlecht.positiveShare) + ".")]) : null,
      el("div", { class: "dx-m3-kt-zahlen" }, [
        kachel("neutral", pct(a.medianReturn, 1, true), "typische Rendite nach 1 Jahr", "bei allen Stufen ähnlich (" + spanne + ")" + (alle ? "; Markt gesamt " + pct(alle.medianReturn, 1, true) : "")),
        b ? kachel("gut", pct(b.medianReturn, 0, true), "typisch nach 5 Jahren", b.positiveShare + " von 100 Fällen im Plus") : null,
        kachel("warn", pct(a.bad10, 0, true), "in einem schlechten Jahr (1 von 10)", alle ? "Schnitt aller Tage: " + pct(alle.bad10, 0, true) : null)
      ].filter(Boolean)),
      el("p", { class: "dx-m3-kt-fuss", text: "US-Gesamtmarkt inklusive Dividenden (ähnlich dem S&P 500" + (bh && isNum(bh.cagr) ? "; seit " + jahr(ev.from) + " im Schnitt " + pct(bh.cagr, 1, true) + " pro Jahr" : "") + "), " +
        jahr(ev.from) + " bis " + jahr(ev.to) + ", mit den heutigen Regeln nachgerechnet – das Barometer gab es damals noch nicht. Vor Kosten und Steuern. Vergangene Ergebnisse sind kein verlässlicher Hinweis auf künftige Entwicklungen." })
    ].filter(Boolean));
  }

  /* ------------------------------------------------------- Seite */
  function render(p, ev, jetzt, verlauf) {
    var env = p && p.environment;
    if (!env || !isNum(env.level)) return null;
    var hist = ev && ev.levels && ev.levels.length >= 3 ? ev : null;
    var teile = [heute(p), hist ? krisen(hist) : null, hist ? erholung(p, hist, verlauf) : null, hist ? chance(p, hist) : null, hist ? vergleich(p, hist) : null, warum(p), wende(p), stufen(p, hist),
      hist ? kalender(hist, jetzt) : null,
      el("a", { class: "bm-mehr", href: "#/maerkte/einordnung/details" }, [
        el("span", { class: "bm-mehr-icon", "aria-hidden": "true" }, [glyph("lupe")].filter(Boolean)),
        el("span", { class: "bm-mehr-text" }, [el("b", { text: "Alle Details, Messwerte und Methodik" }),
          el("small", { text: "Wie das Barometer rechnet, wie wir es seit " + (hist ? jahr(hist.from) : "1929") + " geprüft haben, Verlauf und Belege" })]),
        el("i", { "aria-hidden": "true", text: "›" })
      ]),
      hist ? el("p", { class: "bm-fuss", text: "Historische Auswertung: US-Gesamtmarkt inklusive Dividenden, " + jahr(hist.from) + " bis " + jahr(hist.to) +
        " (Kenneth R. French Data Library), mit den unveränderten Regeln des Barometers. Vor Kosten, Steuern und Inflation. Vergangene Ergebnisse sind kein verlässlicher Hinweis auf künftige Entwicklungen. Keine Anlageberatung." })
        : el("p", { class: "bm-fuss", text: "Beschreibung nach festen Regeln – keine Prognose, keine Anlageberatung." })];
    return teile.filter(Boolean);
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.MarketBarometer = { render: render, WETTER: WETTER, reihe: reihe, fazitAnsicht: fazitAnsicht, zyklusJahr: zyklusJahr, stresstest: stresstest, erholungLive: erholungLive, klartext: klartext, KLARTEXT: KLARTEXT };
})(typeof window !== "undefined" ? window : globalThis);
