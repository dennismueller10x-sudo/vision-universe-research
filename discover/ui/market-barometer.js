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
  function krisen(ev) {
    var ks = ev && ev.crises ? ev.crises.filter(function (k) { return isNum(k.fall); }) : [];
    if (ks.length < 3) return null;
    var mitWarnung = ks.filter(function (k) { return k.firstWarning; });
    var avg = function (xs) { return xs.reduce(function (a, b) { return a + b; }, 0) / (xs.length || 1); };
    var beiWarnung = avg(mitWarnung.map(function (k) { return k.firstWarning.fallAt; }));
    var danach = avg(mitWarnung.map(function (k) { return k.firstWarning.restAfter; }));
    var anteil = avg(ks.map(function (k) { return k.warningShare || 0; }));
    function zahl3(gross, text, klein) {
      return el("div", { class: "bm-krisen-zahl" }, [el("b", { text: gross }), el("p", { text: text }), klein ? el("small", { text: klein }) : null].filter(Boolean));
    }
    var karten = ks.slice().reverse().map(function (k) {
      var w = k.firstWarning, lage = w ? Math.max(0, Math.min(100, 100 * w.fallAt / k.fall)) : null;
      return el("article", { class: "bm-krise" }, [
        el("p", { class: "bm-krise-jahr", text: k.peak.slice(0, 4) + (k.trough.slice(0, 4) !== k.peak.slice(0, 4) ? "–" + k.trough.slice(2, 4) : "") }),
        el("h3", { text: k.name }),
        el("b", { class: "bm-krise-fall", text: pct(k.fall, 0) }),
        el("p", { class: "bm-krise-dauer", text: "vom Hoch zum Tief in " + k.tradingDays + " Handelstagen" }),
        el("div", { class: "bm-krise-spur", "aria-hidden": "true" }, [
          w ? el("span", { class: "bm-krise-vor", style: "width:" + lage.toFixed(1) + "%" }) : null,
          w ? el("span", { class: "bm-krise-nach", style: "left:" + lage.toFixed(1) + "%;width:" + (100 - lage).toFixed(1) + "%" }) : null,
          w ? el("i", { class: "bm-krise-marke", style: "left:" + lage.toFixed(1) + "%" }) : null
        ].filter(Boolean)),
        el("dl", {}, [
          el("div", {}, [el("dt", { text: "Am Hoch" }), el("dd", { text: k.levelAtPeak || "–" })]),
          el("div", {}, [el("dt", { text: "Warnung" }), el("dd", { text: w ? (w.tradingDaysAfterPeak === 0 ? "schon am Hoch" : "bei " + pct(w.fallAt, 0) + ", nach " + w.tradingDaysAfterPeak + " Tagen") : "keine" })]),
          w ? el("div", { class: "is-wichtig" }, [el("dt", { text: "Danach fiel er noch" }), el("dd", { text: pct(w.restAfter, 0) })]) : null,
          k.backConstructive ? el("div", {}, [el("dt", { text: "Wieder „Konstruktiv“" }), el("dd", { text: pct(k.backConstructive.riseFromTrough, 0, true) + " über dem Tief" })]) : null
        ].filter(Boolean))
      ]);
    });
    return el("section", { class: "bm-krisen", id: "bm-krisen", "aria-label": "Hätte das Barometer gewarnt?" }, [
      kopf("Stresstest · " + ks.length + " große Abstürze", "Hätte das Barometer gewarnt?", "Mit genau denselben Regeln, Tag für Tag nur mit dem Wissen von damals – von der Weltwirtschaftskrise bis zum Zinsschock."),
      el("div", { class: "bm-krisen-zahlen" }, [
        zahl3(mitWarnung.length + " von " + ks.length, "Abstürzen hat es erkannt", "im Schnitt bei " + pct(beiWarnung, 0) + " Minus"),
        zahl3(pct(danach, 0), "fiel der Markt nach der Warnung im Schnitt noch", "der größte Teil kam erst danach"),
        zahl3(pct(anteil, 0), "des Weges nach unten stand es auf Warnstufe", "„Vorsichtig“ oder „Defensiv“")
      ]),
      el("p", { class: "bm-krise-legende" }, [el("span", { class: "is-vor", text: "Minus bis zur Warnung" }), el("span", { class: "is-nach", text: "Minus nach der Warnung" }),
        el("span", { class: "is-marke", text: "Warnung" })]),
      el("div", { class: "bm-krisen-reihe", tabindex: "0", role: "group", "aria-label": "Die Abstürze einzeln – wischen für mehr" }, karten),
      el("div", { class: "bm-ehrlich" }, [el("span", { class: "bm-ehrlich-icon", "aria-hidden": "true" }, [glyph("lupe")].filter(Boolean)),
        el("div", {}, [el("b", { text: "Was das Barometer nicht kann" }),
          el("p", { text: "Es sagt den ersten Tag eines Absturzes nicht voraus – am Hoch stand es meist auf „Konstruktiv“. Es reagiert, sobald der Markt kippt, und bleibt dann auf der Warnstufe. " +
            "Sehr schnelle Crashs wie 1987 oder Corona fängt es nur teilweise ab. Und nach dem Tief wird es erst spät wieder konstruktiv – ein Teil der Erholung fehlt." })])]),
      ev.crisesNote ? el("p", { class: "bm-fuss", text: ev.crisesNote }) : null
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

  /* ------------------------------------------------------- Seite */
  function render(p, ev, jetzt) {
    var env = p && p.environment;
    if (!env || !isNum(env.level)) return null;
    var hist = ev && ev.levels && ev.levels.length >= 3 ? ev : null;
    var teile = [heute(p), hist ? chance(p, hist) : null, hist ? vergleich(p, hist) : null, hist ? krisen(hist) : null, warum(p), wende(p), stufen(p, hist),
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
  global.VUDiscover.MarketBarometer = { render: render, WETTER: WETTER, reihe: reihe, fazitAnsicht: fazitAnsicht, zyklusJahr: zyklusJahr };
})(typeof window !== "undefined" ? window : globalThis);
