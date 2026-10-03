/* =========================================================================
   VISION UNIVERSE QUANT — app/page-chartbild.js
   CHARTBILD: technische Lage einer Aktie in Sekunden verstehen

     #/aktie/<T>/chartbild     eine Aktie (Einfach | Profi)
     #/chartlagen              Uebersicht: Reihen technischer Lagen

   Reihenfolge nach Bedeutung, nicht nach Methode:
     1 Ausblick + Lage   2 Zonen (Einstieg, Ziele, Ungueltig)   3 Chart
     4 Szenarien (Haupt, Alternative, Rand)   5 Warum?   6 Historische
     Evidenz   7 Zeitebenen   8 Profi-Ansicht (Wellen, Regeln, Niveaus,
     Methodik, Quellen)
   Die Seite rechnet nicht — sie zeigt die praekomputierte Analyse
   (api/technical-intelligence-workspace.js). Texte aus ti/explain.js.
   Keine Wahrscheinlichkeit, kein Kaufsignal: Szenarien beschreiben
   Bedingungen.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, TI = global.VUTechnicalIntelligence, Ex = global.VUTechnical && global.VUTechnical.TIExplain, Chart = global.VUTIChart;
  var VIEW_KEY = "vu-ti-view-v1";

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function fmt(v) { return Ex ? Ex.fmt(v) : String(v); }
  function zoneText(z) { return z ? fmt(z.zoneLow) + "–" + fmt(z.zoneHigh) : "–"; }
  function pct(v) { return isNum(v) ? Math.round(v * 100) + " %" : "–"; }
  function readView() { try { return global.localStorage.getItem(VIEW_KEY) === "pro" ? "pro" : "simple"; } catch (e) { return "simple"; } }
  function writeView(v) { try { global.localStorage.setItem(VIEW_KEY, v); } catch (e) { /* privat */ } }

  var TONE = { BULLISH: "up", BEARISH: "down", NEUTRAL: "flat", MIXED: "mixed" };
  var STATUS = { IN_ENTRY_ZONE: "Kurs in der Zone", APPROACHING: "Kurs nähert sich der Zone", EXTENDED: "Kurs weit über der Zone – Rücklauf abwarten", BEYOND_ENTRY: "Kurs jenseits der Zone",
                 INVALIDATED: "Szenario ungültig", IN_RANGE: "Kurs innerhalb der Spanne", BREAKING: "Kurs verlässt die Spanne", WATCH: "Beobachten" };
  function statusText(s) {
    if (!s) return "";
    if (s.status === "EXTENDED" && s.direction === "BEARISH") return "Kurs weit unter der Zone – Erholung abwarten";
    return STATUS[s.status] || s.status;
  }
  var FAMILY_ORDER = ["TREND", "MOMENTUM", "STRUCTURE", "HIGHER_TIMEFRAME", "VOLUME", "PATTERN", "ELLIOTT", "WYCKOFF", "VOLATILITY"];

  // ================================================================ Bausteine
  function segmented(label, options, value, onChange) {
    var wrap = el("div", { class: "cb-seg", role: "group", "aria-label": label });
    options.forEach(function (o) {
      var b = el("button", { type: "button", class: "cb-seg-btn", "aria-pressed": o[0] === value ? "true" : "false", text: o[1] });
      b.addEventListener("click", function () { wrap.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); onChange(o[0]); });
      wrap.append(b);
    });
    return wrap;
  }
  function levelTile(kind, label, value, sub) {
    var icon = { entry: "M3 9h18M3 15h18", target: "M5 21V4M5 4h11l-2 4 2 4H5", invalid: "M3 12h4M10 12h4M17 12h4", range: "M4 7h16M4 17h16" }[kind];
    return el("div", { class: "cb-level cb-level-" + kind }, [
      el("span", { class: "cb-level-icon", "aria-hidden": "true" }, [svgIcon(icon)]),
      el("span", { class: "cb-level-label", text: label }),
      el("strong", { class: "cb-level-value num", text: value }),
      sub ? el("span", { class: "cb-level-sub", text: sub }) : null
    ]);
  }
  function svgIcon(d) {
    var NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    s.setAttribute("viewBox", "0 0 24 24"); p.setAttribute("d", d); s.appendChild(p); return s;
  }
  function check(status, family, statement) {
    var mark = { SUPPORTS: "✓", CONTRADICTS: "✕", NEUTRAL: "○", UNAVAILABLE: "–" }[status] || "○";
    var word = { SUPPORTS: "spricht dafür", CONTRADICTS: "spricht dagegen", NEUTRAL: "neutral", UNAVAILABLE: "nicht verfügbar" }[status];
    return el("li", { class: "cb-check cb-check-" + String(status).toLowerCase() }, [
      el("span", { class: "cb-check-mark", "aria-hidden": "true", text: mark }),
      el("span", { class: "cb-check-body" }, [el("b", { text: (Ex ? Ex.FAMILY[family] : family) || family }), el("span", { text: " " + statement }), el("span", { class: "cb-sr", text: " (" + word + ")" })])
    ]);
  }

  // ================================================================ Szenario-Karte
  function scenarioCard(s, a, selected, onSelect) {
    var kindLabel = { PRIMARY: "Hauptszenario", ALTERNATIVE: "Alternative", TAIL: "Randszenario" }[s.kind] || s.kind;
    var dir = s.direction === "BULLISH" ? "aufwärts" : s.direction === "BEARISH" ? "abwärts" : "seitwärts";
    var kids = [
      el("div", { class: "cb-sc-head" }, [el("span", { class: "cb-sc-kind", text: kindLabel }), el("span", { class: "cb-dir cb-dir-" + (TONE[s.direction] || "flat"), text: dir })]),
      el("h3", { text: (Ex && Ex.TEMPLATE[s.template]) || s.template }),
      s.status ? el("p", { class: "cb-sc-status", text: statusText(s) }) : null
    ];
    var dl = el("dl", { class: "cb-sc-dl" });
    function row(k, v) { if (v) dl.append(el("dt", { text: k }), el("dd", { class: "num", text: v })); }
    if (s.entryZone) row(s.kind === "TAIL" ? "Zone" : "Einstiegszone", zoneText(s.entryZone));
    (s.targets || []).forEach(function (z, q) { row("Zielzone " + (q + 1), zoneText(z)); });
    if (s.invalidation) row(s.invalidation.direction === "below" ? "Ungültig unter" : "Ungültig über", fmt(s.invalidation.price));
    if (s.range) { row("Untergrenze", zoneText(s.range.support)); row("Obergrenze", zoneText(s.range.resistance)); }
    kids.push(dl);
    if (s.confirmation && isNum(s.confirmation.price)) kids.push(el("p", { class: "cb-sc-note", text: "Bestätigt bei Schluss " + (s.direction === "BEARISH" ? "unter " : "über ") + fmt(s.confirmation.price) }));
    if (s.trigger && isNum(s.trigger.price)) kids.push(el("p", { class: "cb-sc-note", text: "Tritt in den Vordergrund, wenn " + fmt(s.trigger.price) + " per Schlusskurs " + (s.direction === "BEARISH" ? "unterschritten" : "überschritten") + " wird." }));
    if (s.expectedStructure) kids.push(el("p", { class: "cb-sc-note", text: "Erwartete Struktur: " + s.expectedStructure }));
    if (s.elliottAlternative) kids.push(el("p", { class: "cb-sc-note", text: "Alternative Wellenzählung: " + s.elliottAlternative.pattern + ", Welle " + s.elliottAlternative.wave }));
    if (s.note) kids.push(el("p", { class: "cb-sc-note", text: s.note }));
    if (isNum(s.rewardRiskT1) && s.kind === "PRIMARY") kids.push(el("p", { class: "cb-sc-rr" }, [el("span", { text: "Chance gegen Risiko bis Zielzone 1 " }), el("b", { class: "num", text: "≈ " + s.rewardRiskT1.toFixed(1).replace(".", ",") + " : 1" })]));
    var card = el("button", { type: "button", class: "cb-sc" + (selected ? " is-selected" : ""), "aria-pressed": selected ? "true" : "false" }, kids);
    card.addEventListener("click", function () { onSelect(s); });
    return card;
  }

  // ================================================================ Profi
  function proView(a, rules) {
    var P = a.pro, out = [];
    var E = P.elliott;
    if (E && E.primary) {
      var countBox = function (c, title) {
        var w = el("ol", { class: "cb-waves" }, c.waves.map(function (x) {
          return el("li", { class: x.status === "DEVELOPING" ? "is-dev" : "" }, [el("b", { text: x.notation || x.label }), el("span", { class: "num", text: " " + X.dateDe(x.fromTime) + " → " + (x.status === "DEVELOPING" ? "läuft" : X.dateDe(x.toTime)) + " · " + fmt(x.fromPrice) + " → " + fmt(x.toPrice) }),
            x.subdivision && x.subdivision.count > 1 ? el("small", { text: " · " + x.subdivision.count + " Unterwellen" + (x.subdivision.pattern ? " (" + x.subdivision.pattern + ")" : "") }) : null]);
        }));
        var inv = c.invalidation ? el("p", { class: "cb-small", text: "Harte Regelgrenze: " + (c.invalidation.direction === "below" ? "unter " : "über ") + fmt(c.invalidation.price) + " (" + c.invalidation.ruleId + ")" }) : null;
        var rev = c.revision ? el("p", { class: "cb-small", text: "Neuzuordnung der Wellen: " + (c.revision.direction === "below" ? "unter " : "über ") + fmt(c.revision.price) }) : null;
        var zones = (c.zones || []).map(function (z) { return el("li", {}, [el("b", { class: "num", text: zoneText(z) }), el("span", { text: " · Welle " + z.phase + (z.kind === "COMPLETION" ? " (Abschluss)" : " (Ziel)") + " · " + z.relations.slice(0, 2).join("; ") })]); });
        return X.card([el("h4", { text: title + ": " + c.patternName + (c.variant ? " (" + c.variant.toLowerCase() + ")" : "") + " · " + (c.direction === "UP" ? "aufwärts" : "abwärts") }),
          el("p", { class: "cb-small", text: c.complete ? "Muster abgeschlossen; nächste Bewegung " + (c.nextMove === "UP" ? "aufwärts" : "abwärts") + " erwartet." : "Aktuell: Welle " + c.currentWave.label + " von " + c.currentWave.of + " (" + (c.currentWave.role === "MOTIVE" ? "Bewegung in Musterrichtung" : "Korrektur") + ")" }),
          w, inv, rev, zones.length ? el("ul", { class: "cb-zlist" }, zones) : null,
          el("p", { class: "cb-small cb-dim", text: "Rang " + c.rank + " · Bestandteile: " + Object.keys(c.rankComponents || {}).map(function (k) { return k + " " + c.rankComponents[k]; }).join(", ") })]);
      };
      var parts = [el("p", { class: "cb-small", text: "Struktur-Klarheit: " + ({ HIGH: "hoch", MODERATE: "mittel", LOW: "niedrig (Alternativen liegen nah)" }[E.clarityLevel] || "–") + " · Rangwert " + E.structuralScore + " · Abstand zur besten Alternative " + E.clarity + ". Keine Wahrscheinlichkeit." }),
        countBox(E.primary, "Hauptzählung")];
      (E.alternatives || []).forEach(function (c, q) { parts.push(countBox(c, "Alternative " + (q + 1))); });
      if (E.higherDegree) parts.push(el("p", { class: "cb-small", text: "Höherer Grad: " + (E.higherDegree.patternName || E.higherDegree.pattern) + ", aktuell Welle " + E.higherDegree.current.notation + " (" + (E.higherDegree.current.direction > 0 ? "aufwärts" : "abwärts") + ")" }));
      if (E.primary.rules) {
        var tbl = el("table", { class: "cb-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Regel" }), el("th", { text: "Klasse" }), el("th", { text: "Ergebnis" })])]),
          el("tbody", {}, E.primary.rules.map(function (r) {
            var cat = (rules && rules[r.id]) || {};
            return el("tr", {}, [el("td", {}, [el("span", { text: cat.statement || r.id }), cat.source ? el("small", { class: "cb-dim", text: " — " + cat.source }) : null]),
              el("td", { text: r.cls === "HARD" ? "harte Regel" : "Definition" }), el("td", { text: r.passed === true ? "erfüllt" : r.passed === false ? "verletzt" : "offen (Welle läuft)" })]);
          }))]);
        parts.push(el("h4", { text: "Regelprüfung der Hauptzählung" }), el("div", { class: "cb-table-wrap" }, [tbl]));
        var g = E.primary.guidelines || {};
        if (Object.keys(g).length) parts.push(el("p", { class: "cb-small", text: "Richtlinien (0–1, beeinflussen nur den Rang): " + Object.keys(g).map(function (k) { return k + " " + g[k]; }).join(" · ") }));
      }
      if (E.historicalMap) parts.push(el("p", { class: "cb-small", text: "Historische Karte: " + E.historicalMap.patterns.length + " zuletzt bestätigte Muster, Abdeckung " + pct(E.historicalMap.coverage) + " der Swings. Bestätigte Zählungen werden nie rückwirkend umgeschrieben." }));
      out.push(X.more("Elliott-Wellen", function () { return parts; }, { open: true, hint: E.ruleSetVersion }));
    } else out.push(X.notice("Elliott-Wellen", E && E.detail ? E.detail : "Keine regelkonforme Zählung der jüngsten Swings."));

    out.push(X.more("Hochs, Tiefs und Trend", function () {
      var t = P.trend, lv = function (name, x) { return el("li", {}, [el("b", { text: name + ": " }), el("span", { text: x.state === "UP" ? "steigend" : x.state === "DOWN" ? "fallend" : x.state === "MIXED" ? "gemischt" : "unbestimmt" }), x.flipLevel ? el("span", { class: "num", text: " · kippt bei Schluss " + (x.state === "UP" ? "unter " : "über ") + fmt(x.flipLevel) }) : null]); };
      return [el("ul", { class: "cb-list" }, [lv("Übergeordnet", t.primary), lv("Mittelfristig", t.secondary), lv("Kurzfristig", t.shortTerm)]),
        el("p", { class: "cb-small", text: "Phase: " + ({ TREND_ADVANCING: "Trend schreitet voran", SECONDARY_REACTION: "Gegenbewegung zum übergeordneten Trend", PULLBACK: "Rücksetzer", NO_PRIMARY_TREND: "kein übergeordneter Trend" }[t.phase] || t.phase) + (t.stage && t.stage.stage ? " · Weinstein-Stufe " + t.stage.stage : "") }),
        el("p", { class: "cb-small cb-dim", text: t.source })];
    }));
    out.push(X.more("Unterstützungen, Widerstände, Fibonacci", function () {
      var z = function (x) { return el("li", {}, [el("b", { class: "num", text: zoneText(x) }), el("span", { text: " · " + x.touches + " Berührungen · Stärke " + x.strength })]); };
      return [el("h4", { text: "Widerstände" }), el("ul", { class: "cb-list" }, P.supportResistance.resistances.map(z)), el("h4", { text: "Unterstützungen" }), el("ul", { class: "cb-list" }, P.supportResistance.supports.map(z)),
        el("h4", { text: "Fibonacci-Konfluenz" }), el("ul", { class: "cb-list" }, (P.fibonacci.clusters || []).map(function (c) { return el("li", {}, [el("b", { class: "num", text: zoneText(c) }), el("span", { text: " · " + c.anchors + " Anker" })]); })),
        el("p", { class: "cb-small cb-dim", text: "Hinweis: In der VU-Studie (über 300.000 Gegenbewegungen) enden Rückläufe an 38,2/50/61,8 % nicht häufiger als knapp daneben. Fibonacci zählt deshalb nur als Konfluenz mehrerer Anker." })];
    }));
    out.push(X.more("Bewegungsstärke, Schwankung, Volumen", function () {
      var m = P.momentum, v = P.volatility, vo = P.volume;
      return [el("ul", { class: "cb-list" }, [
        el("li", { text: "Momentum: " + ({ POSITIVE: "positiv", NEGATIVE: "negativ", NEUTRAL: "neutral", UNDETERMINED: "unbestimmt" }[m.state]) + (m.dynamics ? " · " + ({ ACCELERATING: "beschleunigt", DECELERATING: "lässt nach", STEADY: "stetig" }[m.dynamics]) : "") + (isNum(m.rsi14) ? " · RSI 14: " + Math.round(m.rsi14) : "") }),
        m.divergence && m.divergence.bearish ? el("li", { text: "Bärische Divergenz: neues Hoch bei schwächerem RSI" }) : null,
        m.divergence && m.divergence.bullish ? el("li", { text: "Bullische Divergenz: neues Tief bei stärkerem RSI" }) : null,
        el("li", { text: "Schwankung (ATR): " + fmt(v.atr) + " (" + pct(v.atrPct) + " des Kurses) · Regime " + ({ COMPRESSED: "ruhig", NORMAL: "normal", ELEVATED: "erhöht", EXTREME: "extrem", UNDETERMINED: "unbestimmt" }[v.regime]) }),
        vo.status ? el("li", { text: "Volumen: nicht verfügbar (" + (vo.detail || "keine Daten") + ")" }) : el("li", { text: "Relatives Volumen " + fmt(vo.relativeVolume) + " · Volumen an steigenden/fallenden Tagen " + fmt(vo.upDownVolumeRatio) + " · " + ({ ACCUMULATION: "Akkumulation", DISTRIBUTION: "Distribution", BALANCED: "ausgeglichen" }[vo.accumulation] || "") }),
        vo.profile ? el("li", { text: "Volumenprofil (6 Monate, tagesbasiert): Schwerpunkt " + fmt(vo.profile.poc) + ", Wertbereich " + fmt(vo.profile.valueAreaLow) + "–" + fmt(vo.profile.valueAreaHigh) }) : null
      ].concat((vo.anchoredVwap || []).map(function (x) { return el("li", { text: "Anchored VWAP seit " + (x.anchor === "MAJOR_LOW" ? "großem Tief" : "großem Hoch") + " " + X.dateDe(x.anchorTime) + ": " + fmt(x.vwap) + (x.priceAbove ? " (Kurs darüber)" : " (Kurs darunter)") }); })))];
    }));
    out.push(X.more("Chartformationen und Wyckoff", function () {
      var pats = P.patterns.patterns || [], w = P.wyckoff;
      return [pats.length ? el("ul", { class: "cb-list" }, pats.map(function (p) { return el("li", {}, [el("b", { text: p.name }), el("span", { text: " · " + ({ FORMING: "in Bildung", BREAKOUT: "Ausbruch", BREAKOUT_RETEST: "Ausbruch mit Rücktest", FAILED: "gescheitert", FAILED_BREAKOUT: "Fehlausbruch" }[p.status] || p.status) + (p.breakoutLevel ? " · Ausbruchsniveau " + fmt(p.breakoutLevel) : "") + " · Formationsziel " + zoneText(p.target) }) ]); })) : el("p", { class: "cb-small", text: "Keine aktive Formation." }),
        w.status === "TRADING_RANGE" ? el("p", { class: "cb-small", text: "Wyckoff: Spanne " + fmt(w.range.support) + "–" + fmt(w.range.resistance) + " · " + ({ ACCUMULATION: "Akkumulation", DISTRIBUTION: "Distribution", REACCUMULATION_OR_ACCUMULATION: "Akkumulation oder Re-Akkumulation", REDISTRIBUTION_OR_DISTRIBUTION: "Distribution oder Re-Distribution", UNDETERMINED: "offen" }[w.schematic] || w.schematic) + " · Phase " + w.phase + " · Ereignisse: " + (w.events || []).map(function (e) { return e.event; }).join(", ") }) : el("p", { class: "cb-small", text: "Wyckoff: keine Handelsspanne erkannt." }),
        el("p", { class: "cb-small cb-dim", text: "Wyckoff ist beschreibend und fließt nicht in die Richtung ein (keine belastbare Evidenz; in der VU-Studie lag die Richtungstrefferquote unter 50 %)." })];
    }));
    out.push(X.more("Konfluenz und Methodik", function () {
      var cf = a.confluence;
      return [el("div", { class: "cb-table-wrap" }, [el("table", { class: "cb-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Verfahren" }), el("th", { text: "Richtung" }), el("th", { text: "Gewicht" })])]),
        el("tbody", {}, cf.families.map(function (f) { return el("tr", {}, [el("td", { text: (Ex && Ex.FAMILY[f.family]) || f.family }), el("td", { class: "num", text: (f.direction > 0 ? "+" : "") + f.direction.toFixed(2).replace(".", ",") }), el("td", { class: "num", text: f.weight.toFixed(2).replace(".", ",") })]); }))])]),
        el("p", { class: "cb-small", text: "Einigkeit (gewichtete Richtung): " + (cf.agreement > 0 ? "+" : "") + String(cf.agreement).replace(".", ",") + " · Abdeckung " + pct(cf.coverage) + ". Gewichte aus Evidenzgraden der Literatur; Wyckoff ohne Stimmgewicht." }),
        el("p", { class: "cb-small cb-dim", text: "Alle Werte aus Daten bis " + X.dateDe(a.asOf) + "; nur bestätigte Swings; dieselbe Rechnung wie im Backtest. Methodik: quant/methodology/technical-intelligence-v2.json · Elliott " + ((a.versions && a.versions.elliott) || (a.pro.elliott && a.pro.elliott.engineVersion) || "–") + " · Regelwerk " + ((a.versions && a.versions.ruleSet) || (a.pro.elliott && a.pro.elliott.ruleSetVersion) || "–") + " · Datenstand " + X.dateDe((a.versions && a.versions.dataAsOf) || a.asOf) + "." }),
        el("p", {}, [X.link("Methodik und Quellen →", X.routes.method("chartbild"))])];
    }));
    return out;
  }

  // ================================================================ Seite
  /* Wellen-Bedeutung in Alltagssprache (Wellen-Inspektor). Quelle: Frost & Prechter, Kap. 1–2. */
  var WAVE_MEANING = {
    "1": "Der erste Schub einer neuen Bewegung. Er wird oft noch nicht als Richtungswechsel erkannt.",
    "2": "Der Rücklauf nach Welle 1. Er darf nie unter den Startpunkt von Welle 1 fallen.",
    "3": "Meist der kräftigste Abschnitt eines Trends – schnell und breit getragen.",
    "4": "Eine Verschnaufpause im Trend. Sie darf das Kursgebiet von Welle 1 nicht betreten.",
    "5": "Der letzte Schub des Musters, häufig mit nachlassender Kraft.",
    A: "Die erste Gegenbewegung einer Korrektur.", B: "Eine Zwischenerholung innerhalb der Korrektur – oft trügerisch.",
    C: "Die abschließende Welle einer Korrektur, häufig ähnlich lang wie A.", D: "Vierter Abschnitt eines Dreiecks; die Schwankungen werden enger.",
    E: "Letzter Abschnitt eines Dreiecks, danach folgt meist ein Ausbruch.", W: "Erster Teil einer doppelten Korrektur.", X: "Verbindungswelle zwischen zwei Korrekturen.", Y: "Zweiter Teil einer doppelten Korrektur."
  };
  var CLARITY = { CLEAR: "Klar", MODERATE: "Mittel", AMBIGUOUS: "Unklar" };
  var EVIDENCE = { NOT_ESTABLISHED: "Kein Vorteil belegt", EXPERIMENTAL: "Experimentell", NO_DATA: "Zu wenig Fälle", VALIDATED: "Bestätigt", SUPPORTED: "Gestützt", DESCRIPTIVE: "Beschreibend" };
  var KIND = { PRIMARY: "Hauptszenario", ALTERNATIVE: "Alternative", TAIL: "Randszenario" };

  function waveKey(label) { return String(label || "").replace(/^.*·/, "").charAt(0).toUpperCase(); }

  /** Bottom-Sheet (mobil von unten, Desktop als Dialog) — mit Fokusfalle und Escape. */
  function sheet(title, kids) {
    var prev = document.activeElement;
    var close = el("button", { type: "button", class: "cb-sheet-close", "aria-label": "Schließen", text: "×" });
    var box = el("div", { class: "cb-sheet", role: "dialog", "aria-modal": "true", "aria-label": title }, [el("div", { class: "cb-sheet-grip", "aria-hidden": "true" }), el("div", { class: "cb-sheet-head" }, [el("h3", { text: title }), close]), el("div", { class: "cb-sheet-body" }, kids)]);
    var veil = el("div", { class: "cb-veil" }, [box]);
    function done() { veil.remove(); document.removeEventListener("keydown", key); if (prev && prev.focus) prev.focus(); }
    function key(e) { if (e.key === "Escape") done(); }
    close.addEventListener("click", done);
    veil.addEventListener("click", function (e) { if (e.target === veil) done(); });
    document.addEventListener("keydown", key);
    document.body.append(veil);
    close.focus();
    return done;
  }

  /** Wellen-Inspektor (§51): was die Welle bedeutet, warum VU sie so sieht, Regeln, Ruecklauf, Evidenz, Grenze. */
  function waveInspector(a, w, rules, methodEv) {
    var E = a.pro.elliott, c = E && E.primary, T = a.pro.elliottTransparency;
    if (!c) return;
    var k = c.waves.findIndex(function (x) { return x.label === w.label && x.toTime === w.time; });
    var wave = c.waves[k] || w, prevW = k > 0 ? c.waves[k - 1] : null;
    var len = Math.abs(wave.toPrice - wave.fromPrice), plen = prevW ? Math.abs(prevW.toPrice - prevW.fromPrice) : null;
    var retr = prevW && plen ? len / plen : null;
    var seen = {}, hard = (c.rules || []).filter(function (r) { var st = ((rules && rules[r.id]) || {}).statement || r.id; if (r.cls !== "HARD" || seen[st]) return false; seen[st] = 1; return true; });
    var ok = (c.rules || []).filter(function (r) { return r.passed === true; }).length;
    var ev = methodEv && methodEv.methods && methodEv.methods.ELLIOTT;
    sheet("Welle " + (wave.notation || wave.label), [
      el("p", { class: "cb-sheet-kicker", text: c.patternName + (wave.status === "DEVELOPING" ? " · läuft noch" : " · abgeschlossen") }),
      el("dl", { class: "qx-kv cb-insp-kv" }, [].concat.apply([], [
        ["Status", wave.status === "DEVELOPING" ? "läuft (entwickelnd) – Ende noch offen" : "abgeschlossen"],
        retr !== null ? [/^[24BDX]/.test(waveKey(wave.label)) ? "Rücklauf" : "Länge ggü. Vorwelle", Math.round(retr * 100) + " %"] : null,
        c.invalidation ? ["Ungültig, wenn", "Schluss " + (c.invalidation.direction === "below" ? "unter " : "über ") + fmt(c.invalidation.price)] : null,
        ["Höherer Grad", E.higherDegree ? (E.higherDegree.patternName || E.higherDegree.pattern) + ", Welle " + E.higherDegree.current.notation : "nicht bestimmt"],
        ["Alternativen", String((E.alternatives || []).length) + (E.ambiguity && E.ambiguity.kind === "STRUCTURE" ? " · mehrere gültige Lesarten" : "")],
        ["Modell", "Experimentell" + (E.engineVersion ? " · " + E.engineVersion : "")]
      ].filter(Boolean).map(function (r) { return [el("dt", { text: r[0] }), el("dd", { class: "num", text: r[1] })]; }))),
      el("h4", { text: "Was sie bedeutet" }), el("p", { text: WAVE_MEANING[waveKey(wave.label)] || "Teil der aktuellen Wellenstruktur." }),
      el("h4", { text: "Warum Vision Universe sie so sieht" }),
      el("ul", { class: "cb-list" }, [
        el("li", { text: ok + " von " + (c.rules || []).length + " Musterregeln erfüllt, keine verletzt" + ((c.rules || []).some(function (r) { return r.passed === null; }) ? " (einige noch offen, weil die Welle läuft)" : "") }),
        T && isNum(T.guidelineFit) ? el("li", { text: "Typische Proportionen: " + (T.guidelineFit >= 0.7 ? "gut erfüllt" : T.guidelineFit >= 0.5 ? "teilweise erfüllt" : "schwach") }) : null,
        T && isNum(T.higherDegreeAgreement) ? el("li", { text: "Passt zum größeren Bild: " + (T.higherDegreeAgreement >= 0.8 ? "ja" : T.higherDegreeAgreement >= 0.5 ? "teilweise" : "eher nicht") }) : null
      ]),
      hard.length ? el("h4", { text: "Wichtige Regeln" }) : null,
      hard.length ? el("ul", { class: "cb-list" }, hard.map(function (r) { var cat = (rules && rules[r.id]) || {}; return el("li", { text: (r.passed === true ? "✓ " : r.passed === false ? "✕ " : "○ ") + (cat.statement || r.id) }); })) : null,
      el("h4", { text: "Historisches Verhalten" }),
      el("p", { text: ev ? ev.consumer : "Für Elliott-Zählungen ist in der VU-Prüfung kein Prognosevorteil belegt. Die Zählung beschreibt die Struktur." }),
      c.invalidation ? el("h4", { text: "Was sie ungültig macht" }) : null,
      c.invalidation ? el("p", { class: "num", text: "Ein Schlusskurs " + (c.invalidation.direction === "below" ? "unter " : "über ") + fmt(c.invalidation.price) + " widerlegt diese Lesart." }) : null
    ]);
  }

  /** Overlays aus einem Replay-Schnappschuss (gleicher Datenvertrag wie die Live-Analyse). */
  function overlaysFromStep(st) {
    var z = [], inv = [], sc = st.sc;
    if (sc) {
      if (sc.e) z.push({ scenario: "PRIMARY", kind: "ENTRY", low: sc.e[0], high: sc.e[1] });
      [sc.t1, sc.t2].forEach(function (t, q) { if (t) z.push({ scenario: "PRIMARY", kind: "TARGET", order: q + 1, low: t[0], high: t[1] }); });
      if (sc.r) { z.push({ scenario: "PRIMARY", kind: "RANGE_LOW", low: sc.r[0][0], high: sc.r[0][1] }); z.push({ scenario: "PRIMARY", kind: "RANGE_HIGH", low: sc.r[1][0], high: sc.r[1][1] }); }
      if (isNum(sc.inv)) inv.push({ scenario: "PRIMARY", price: sc.inv, direction: sc.dir === "BEARISH" ? "above" : "below" });
    }
    return { zones: z, invalidations: inv, projectedPaths: [] };
  }

  async function chartbild(main, ctx, ticker, params) {
    var view = params && params.get("ansicht") === "profi" ? "pro" : readView();
    var layout = params && /^[abcd]$/.test(params.get("layout") || "") ? params.get("layout") : "d";
    main.append(el("a", { class: "v2-back qx-back", href: X.routes.stock(ticker), text: "← Zur Aktienanalyse " + ticker }));
    var host = el("div", { class: "cb cb-layout-" + layout }, [X.loading("Chartbild wird geladen …")]);
    main.append(host);
    var res = await TI.getAnalysis(ticker);
    host.replaceChildren();
    if (res.state !== "AVAILABLE") {
      host.append(el("p", { class: "v2-eyebrow", text: "Chartbild · " + ticker }), el("h1", { class: "qx-h1", text: "Für " + ticker + " liegt noch kein Chartbild vor" }),
        X.notice("Warum?", res.state === "ERROR" ? "Die Daten konnten gerade nicht geladen werden. Bitte später erneut versuchen." : "Für die Analyse braucht es mindestens drei Jahre Kursverlauf. Dieser Titel ist (noch) nicht abgedeckt."),
        el("div", { class: "qx-actions" }, [X.btn("Zur Aktienanalyse", X.routes.stock(ticker), "secondary")]));
      return;
    }
    var a = res.analysis, rules = (await TI.getRulesCatalog()).rules, methodEv = await (TI.getMethodEvidence ? TI.getMethodEvidence() : Promise.resolve(null));
    var tfLabel = a.timeframe === "1W" ? "Wochenchart" : "Tageschart";
    var scen = a.scenarios || [], kinds = scen.map(function (s) { return s.kind; });
    var kind = kinds[0] || "PRIMARY", E = a.pro.elliott, T = a.pro.elliottTransparency;
    var clarity = a.clarity || { level: "MODERATE", text: "" }, badge = a.evidenceBadge || { level: "NO_DATA", label: "–", text: "" };
    var abstain = !!(E && E.applicability && E.applicability.abstain);
    var uncertain = clarity.level === "AMBIGUOUS";
    function scenarioOf(k) { return scen.filter(function (s) { return s.kind === k; })[0] || null; }

    // ---------------------------------------------- Hero: zwei Ebenen
    var outlook = a.outlook.label, tone = TONE[outlook] || "flat";
    var hero = el("header", { class: "cb-hero cb-tone-" + tone }, [
      el("p", { class: "cb-eyebrow", text: ticker + " · " + tfLabel + " · Stand " + X.dateDe(a.asOf) }),
      el("p", { class: "cb-kicker", text: "Technischer Ausblick" }),
      el("h1", { class: "cb-outlook" }, [el("span", { class: "cb-dot", "aria-hidden": "true" }), el("span", { text: (Ex && Ex.OUTLOOK[outlook]) || outlook })]),
      el("p", { class: "cb-structure", text: (Ex && Ex.STRUCTURE[a.outlook.structure]) || a.outlook.structure }),
      el("p", { class: "cb-lead", text: a.explain.summary }),
      el("div", { class: "cb-layers" }, [
        el("div", { class: "cb-layer cb-clarity-" + clarity.level.toLowerCase() }, [el("span", { class: "cb-layer-k", text: "Was der Chart zeigt" }), el("b", { text: "Struktur: " + CLARITY[clarity.level] }), el("span", { class: "cb-layer-t", text: clarity.text })]),
        el("div", { class: "cb-layer cb-ev-" + badge.level.toLowerCase() }, [el("span", { class: "cb-layer-k", text: "Was die Historie nahelegt" }), el("b", { text: badge.label }), el("span", { class: "cb-layer-t", text: badge.level === "NO_DATA" ? badge.text : "Kein Prognoseversprechen – siehe Evidenz unten." })])
      ])
    ]);

    // ---------------------------------------------- Szenario-Umschalter
    var tabs = el("div", { class: "cb-switch", role: "tablist", "aria-label": "Szenario wählen" });
    var scText = el("p", { class: "cb-sc-text", "aria-live": "polite" });
    function scenarioSentence(s) {
      if (!s) return "";
      var t = (Ex && Ex.TEMPLATE[s.template]) || s.template;
      var dir = s.direction === "BULLISH" ? "aufwärts" : s.direction === "BEARISH" ? "abwärts" : "seitwärts";
      var cond = s.invalidation && !(s.kind === "PRIMARY" && scenarioOf("ALTERNATIVE")) ? " Die Lesart gilt, solange kein Schlusskurs " + (s.invalidation.direction === "below" ? "unter " : "über ") + fmt(s.invalidation.price) + " liegt." : "";
      return KIND[s.kind] + " (" + dir + "): " + String(t).split(" —")[0] + "." + cond + (s.note ? " " + s.note + "." : "");
    }
    function selectKind(k) {
      kind = k;
      tabs.querySelectorAll("button").forEach(function (b) { var on = b.dataset.kind === k; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      scText.textContent = scenarioSentence(scenarioOf(k));
      fillLevels(scenarioOf(k)); draw();
    }
    kinds.forEach(function (k) {
      var b = el("button", { type: "button", role: "tab", class: "cb-switch-btn", dataset: { kind: k }, text: KIND[k] || k });
      b.addEventListener("click", function () { selectKind(k); });
      b.addEventListener("keydown", function (e) { var i = kinds.indexOf(kind); if (e.key === "ArrowRight") selectKind(kinds[(i + 1) % kinds.length]); if (e.key === "ArrowLeft") selectKind(kinds[(i - 1 + kinds.length) % kinds.length]); });
      tabs.append(b);
    });

    // ---------------------------------------------- Schluessel-Kacheln
    var levels = el("div", { class: "cb-levels", role: "list" });
    function fillLevels(s) {
      levels.replaceChildren();
      if (!s) return;
      if (s.range) { levels.append(levelTile("range", "Untergrenze", zoneText(s.range.support)), levelTile("range", "Obergrenze", zoneText(s.range.resistance))); return; }
      if (s.entryZone) levels.append(levelTile("entry", s.kind === "TAIL" ? "Tiefere Zone" : "Schlüsselzone", zoneText(s.entryZone), statusText(s)));
      var t = s.targets || [];
      if (t.length) levels.append(levelTile("target", "Zielbereich", t.length > 1 ? fmt(t[0].zoneLow) + "–" + fmt(t[t.length > 1 ? 1 : 0].zoneHigh) : zoneText(t[0]), t.length > 1 ? "Zone 1 ab " + fmt(t[0].zoneLow) : null));
      if (s.invalidation) levels.append(levelTile("invalid", s.invalidation.direction === "below" ? "Ungültig unter" : "Ungültig über", fmt(s.invalidation.price), "per Schlusskurs"));
    }

    // ---------------------------------------------- Chart
    var chartHost = el("div", { class: "cb-chart", tabindex: "0", role: "region", "aria-label": "Chart mit Zonen und Szenario" });
    var range = a.timeframe === "1W" ? "3J" : "6M", mode = "line", wavesOn = view === "pro" || (!abstain && E && E.primary);
    var ranges = a.timeframe === "1W" ? [["1J", "1 J", 52], ["3J", "3 J", 156], ["5J", "5 J", 260]] : [["3M", "3 M", 63], ["6M", "6 M", 126], ["1J", "1 J", 252]];
    var replayStep = null, waveSet = "primary";
    function barsFor() { var r = ranges.filter(function (x) { return x[0] === range; })[0]; return r ? r[2] : 126; }
    function waveMarks() {
      if (replayStep) return replayStep.ew && !replayStep.ew.ab ? replayStep.ew.waves.map(function (w) { return { label: w[2], time: w[0], price: w[1], status: w[3] ? "DEVELOPING" : "CONFIRMED" }; }) : [];
      var ov = a.overlays && a.overlays.waves;
      if (!ov || !ov.primary.length || (!ov.consumerVisible && view !== "pro")) return [];
      var list = waveSet === "alt" && ov.alternative && ov.alternative.length ? ov.alternative : ov.primary;
      return list.map(function (w) { return { label: w.label, display: view === "pro" ? w.notation : w.label, time: w.time, price: w.price, fromPrice: w.fromPrice, status: w.status }; });
    }
    function draw() {
      var width = Math.max(300, Math.min(1100, chartHost.clientWidth || main.clientWidth - 24));
      chartHost.replaceChildren(Chart.render({ chart: a.chart, overlays: replayStep ? overlaysFromStep(replayStep) : a.overlays, scenarioKind: replayStep ? "PRIMARY" : kind, scenario: scenarioOf(kind),
        cutoff: replayStep ? replayStep.d : null, showPath: !replayStep, uncertain: replayStep ? replayStep.cl === "AMBIGUOUS" : uncertain,
        waves: wavesOn ? waveMarks() : null, waveTone: !replayStep && waveSet === "alt" ? "alt" : null, onWave: replayStep || waveSet === "alt" ? null : function (w) { waveInspector(a, w, rules, methodEv); },
        width: width, height: width < 520 ? 360 : 430, bars: barsFor(), mode: mode, title: ticker + " · Chartbild · " + tfLabel, labels: true }));
      if (replayStep) chartHost.prepend(el("p", { class: "cb-replay-flag", role: "status", text: "Zeitreise · Stand " + X.dateDe(replayStep.d) + " · nur damals verfügbare Daten" }));
      chartCard.classList.toggle("is-replay", !!replayStep);
    }
    var controls = el("div", { class: "cb-controls" }, [
      segmented("Zeitraum", ranges.map(function (x) { return [x[0], x[1]]; }), range, function (v) { range = v; draw(); }),
      a.chart.closeOnly ? null : segmented("Darstellung", [["line", "Linie"], ["candles", "Kerzen"]], mode, function (v) { mode = v; draw(); }),
      E && E.primary ? segmented("Wellen", [["off", "Wellen aus"], ["on", "Wellen an"]], wavesOn ? "on" : "off", function (v) { wavesOn = v === "on"; draw(); }) : null
    ]);
    var chartCard = el("section", { class: "cb-chart-card", "aria-label": "Chart" }, [controls, chartHost,
      el("p", { class: "cb-legend" }, [el("span", { class: "cb-key cb-key-entry", text: "Schlüsselzone" }), el("span", { class: "cb-key cb-key-target", text: "Zielbereich" }), el("span", { class: "cb-key cb-key-invalid", text: "Ungültig (Schlusskurs)" }), el("span", { class: "cb-key cb-key-path", text: "Szenario-Korridor – keine Zeitangabe" })]),
      el("p", { class: "cb-lead cb-lead-m", text: a.explain.summary }),
      abstain ? el("p", { class: "cb-unclear" }, [el("b", { text: "Keine verlässliche Elliott-Zählung. " }), el("span", { text: "Die aktuelle Kursstruktur lässt keine verlässliche Elliott-Zählung zu – Vision Universe zeigt hier bewusst keine Wellen." + (E.applicability.reasons && E.applicability.reasons.length ? " (" + E.applicability.reasons[0] + ")" : "") })]) : null,
      el("p", { class: "cb-small cb-dim", text: wavesOn && !abstain && E && E.primary ? "Tipp: Eine Wellenmarke antippen erklärt die Welle." : "" }),
      a.chart.closeOnly ? el("p", { class: "cb-small cb-dim", text: "Wochenschlusskurse ohne Volumen: Kerzen und Volumenbefunde sind für diesen Titel nicht verfügbar." }) : null]);

    // ---------------------------------------------- Elliott-Struktur (Mission III §41–§47, §57, §98–§100)
    var ewCard = elliottConsumerCard(a, abstain, function (set) { waveSet = set; wavesOn = true; draw(); });

    // ---------------------------------------------- Warum?
    var items = a.evidence.checklist.slice().sort(function (x, y) { var o = { SUPPORTS: 0, CONTRADICTS: 1, NEUTRAL: 2, UNAVAILABLE: 3 }; return o[x.status] - o[y.status] || FAMILY_ORDER.indexOf(x.family) - FAMILY_ORDER.indexOf(y.family); });
    var why = X.section("Warum dieses Bild?", outlook === "MIXED" ? "Die Verfahren widersprechen sich. Beides wird gezeigt, nichts wird gemittelt." : "Was dafür spricht, was dagegen – in Alltagssprache.", [
      el("ul", { class: "cb-checks" }, items.slice(0, 5).map(function (i) { return check(i.status, i.family, i.statement); })),
      items.length > 5 ? X.more("Weitere Punkte (" + (items.length - 5) + ")", function () { return el("ul", { class: "cb-checks" }, items.slice(5).map(function (i) { return check(i.status, i.family, i.statement); })); }) : null
    ], null, null, "warum");

    // ---------------------------------------------- Evidenz (§53)
    var ev = a.explain.evidence, evKids = [];
    if (badge.level === "NOT_ESTABLISHED" || badge.level === "EXPERIMENTAL") {
      evKids.push(el("p", { class: "cb-evidence-verdict cb-edge-" + (badge.level === "EXPERIMENTAL" ? "slightly_better_uncertain" : "no_edge"), text: badge.text }));
      if (ev && ev.status === "OK") evKids.push(el("div", { class: "cb-stats" }, [
        stat("Ähnliche Lagen", ev.n.toLocaleString("de-DE"), a.timeframe === "1W" ? "Wochencharts" : "Tagescharts"),
        stat("Zielbereich erreicht", pct(ev.hitRate), "vor der Ungültig-Linie"),
        stat("Vergleich: Zufall", pct(ev.baseline), "gleiche Abstände, zufälliger Zeitpunkt"),
        stat("Unterschied", isNum(ev.hitRate) && isNum(ev.baseline) ? ((ev.hitRate - ev.baseline) * 100 >= 0 ? "+" : "") + ((ev.hitRate - ev.baseline) * 100).toFixed(1).replace(".", ",") + " Pp." : "–", "Prozentpunkte")
      ]));
    } else evKids.push(X.notice("Zu wenig vergleichbare Fälle", badge.text));
    evKids.push(el("p", { class: "cb-small cb-dim", text: "Prüfung nur mit Daten bis zum jeweiligen Tag, Einstieg erst danach, Kosten berücksichtigt. Nur heute gelistete Titel (Survivorship-Verzerrung möglich). Keine Gewähr für die Zukunft." }));
    if (a.history && a.history.length) evKids.push(X.more("Frühere Fälle bei " + ticker + " (" + a.history.length + ")", function () { return el("ul", { class: "cb-list" }, a.history.map(function (h) { return el("li", { class: "num", text: X.dateDe(h.date) + " · " + ((Ex && Ex.TEMPLATE[h.template]) || h.template).split(" —")[0] + " · " + ({ TARGET1: "Zielbereich erreicht", INVALIDATED: "ungültig", TIMEOUT: "ohne Ergebnis abgelaufen", NO_ENTRY: "Zone nicht erreicht" }[h.outcome] || h.outcome) + (isNum(h.barsToT1) ? " nach " + h.barsToT1 + (a.timeframe === "1W" ? " Wochen" : " Tagen") : "") }); })); }));
    var evidence = X.section("Was die Historie nahelegt", "Vision Universe trennt, was der Chart zeigt, von dem, was frühere Fälle belegen.", evKids, null, null, "evidenz");

    // ---------------------------------------------- Zeitreise (Replay)
    var replay = null;
    if (a.replay && a.replay.steps && a.replay.steps.length > 1) {
      var steps = a.replay.steps, slider = el("input", { type: "range", min: "0", max: String(steps.length - 1), value: String(steps.length - 1), step: "1", class: "cb-scrub", "aria-label": "Datum der Zeitreise" });
      var rLabel = el("p", { class: "cb-replay-label", "aria-live": "polite" });
      var changes = 0; for (var q = 1; q < steps.length; q++) if (steps[q].ew && steps[q - 1].ew && steps[q].ew.key !== steps[q - 1].ew.key) changes++;
      var upd = function () {
        var i = +slider.value, st = steps[i], prevSt = steps[i - 1];
        replayStep = i === steps.length - 1 ? null : st;
        var lab = st.ew ? (st.ew.ab ? "keine verlässliche Zählung" : st.ew.p + ", Welle " + st.ew.w) : "keine Zählung";
        var chg = prevSt && st.ew && prevSt.ew && st.ew.key !== prevSt.ew.key ? " · Lesart neu" : "";
        rLabel.textContent = (i === steps.length - 1 ? "Heute" : X.dateDe(st.d)) + ": " + ((Ex && Ex.OUTLOOK[st.o]) || st.o) + " · " + lab + chg;
        draw();
      };
      slider.addEventListener("input", upd);
      replay = X.section("Zeitreise", "Was hätte das Chartbild an einem früheren Tag gezeigt – nur mit den damals verfügbaren Daten.", [
        el("div", { class: "cb-replay" }, [el("div", { class: "cb-scrub-wrap" }, [replayTicks(steps), slider]), el("div", { class: "cb-replay-ends" }, [el("span", { text: X.dateDe(steps[0].d) }), el("span", { text: "Heute" })]), rLabel,
          T && T.relabeling && T.relabeling.history && T.relabeling.history.length ? X.more("Zählungswechsel und Gründe (" + T.relabeling.history.length + ")", function () { return el("ol", { class: "cb-list cb-ew-history" }, T.relabeling.history.slice().reverse().map(function (h) { return el("li", {}, [el("b", { text: X.dateDe(h.d) + ": " }), el("span", { text: (h.to || "keine Zählung") + " — " + h.why })]); })); }) : null]),
        el("p", { class: "cb-small", text: "In den letzten " + steps.length + " " + (a.replay.unit === "Woche" ? "Wochen" : "Schritten") + " wechselte die Wellenlesart " + changes + "-mal." + (T && T.relabeling ? " Neuzuordnungs-Risiko: " + ({ LOW: "gering", MEDIUM: "mittel", HIGH: "hoch" }[T.relabeling.risk]) + "." : "") })
      ], null, null, "zeitreise");
      setTimeout(upd, 0);
    }

    // ---------------------------------------------- Zeitebenen
    var wk = a.timeframes.weekly, tfKids = [];
    if (a.timeframe === "1D") {
      tfKids.push(el("ul", { class: "cb-list" }, [
        el("li", {}, [el("b", { text: "Wochenchart: " }), el("span", { text: wk ? ((Ex && Ex.OUTLOOK[wk.outlook]) || wk.outlook) : "nicht verfügbar" })]),
        el("li", {}, [el("b", { text: "Tageschart: " }), el("span", { text: (Ex && Ex.OUTLOOK[a.outlook.label]) || a.outlook.label })]),
        el("li", {}, [el("b", { text: "Intraday: " }), el("span", { text: "keine Intraday-Historie verfügbar" })])
      ]), el("p", { class: "cb-small", text: { ALIGNED: "Wochen- und Tageschart zeigen in dieselbe Richtung.", COUNTER_TREND: "Achtung: Das Tagesbild läuft gegen den Wochenchart.", MIXED: "Wochen- und Tageschart sind nicht einig.", UNAVAILABLE: "" }[a.timeframes.alignment] || "" }));
    } else tfKids.push(el("p", { class: "cb-small", text: "Für diesen Titel liegt die Analyse auf Wochenbasis vor (Wochenschlusskurse)." }));
    var tfs = X.more("Zeitebenen", function () { return tfKids; });

    // ---------------------------------------------- Ansicht-Schalter + Profi
    var proHost = el("section", { class: "cb-pro", "aria-label": "Profi-Ansicht" }), proOpen = el("button", { type: "button", class: "cb-pro-open", text: "Details anzeigen (Profi-Ansicht)" });
    var viewSeg;
    function setView(v) {
      view = v; writeView(v);
      if (v === "pro") wavesOn = true;
      if (v === "pro" && !proHost.firstChild) [elliottPanel(a, methodEv)].concat(proView(a, rules)).forEach(function (n) { if (n) proHost.append(n); });
      proHost.hidden = v !== "pro"; proOpen.hidden = v === "pro";
      viewSeg.querySelectorAll("button").forEach(function (b, q) { b.setAttribute("aria-pressed", (q === 1) === (v === "pro") ? "true" : "false"); });
      draw();
    }
    viewSeg = segmented("Ansicht", [["simple", "Einfach"], ["pro", "Profi"]], view, function (v) { setView(v); });
    proOpen.addEventListener("click", function () { setView("pro"); proHost.scrollIntoView({ behavior: "smooth", block: "start" }); });

    /* Reihenfolge je Layout-Variante (§63, Design-Review): a = minimal, b = Zonen zuerst, c = Szenario zuerst (gewählt). */
    /* Design-Review (UI_UX_SPEC §8): Variante „d" gewählt — Szenario-Tabs direkt über dem Chart, damit der Chart mit
       beschrifteten Zonen schon im ersten Bildschirm steht; Kacheln und Szenario-Satz darunter. a/b/c bleiben zum Vergleich. */
    var tabsBlock = el("section", { class: "cb-scenario", "aria-label": "Szenario" }, [tabs]), textBlock = el("div", { class: "cb-sc-after" }, [scText, scenarioDifference(scenarioOf("PRIMARY"), scenarioOf("ALTERNATIVE"))]);
    var order = { a: [hero, chartCard, levels, tabsBlock, textBlock, ewCard], b: [hero, levels, chartCard, tabsBlock, textBlock, ewCard], c: [hero, tabsBlock, textBlock, levels, chartCard, ewCard], d: [hero, tabsBlock, chartCard, levels, textBlock, ewCard] }[layout];
    host.append(el("div", { class: "cb-viewswitch" }, [viewSeg]));
    order.forEach(function (n) { if (n) host.append(n); });
    [why, evidence, replay, tfs].forEach(function (n) { if (n) host.append(n); });
    host.append(proOpen, proHost);
    host.append(el("footer", { class: "cb-foot" }, [el("p", { text: "Szenarien beschreiben Bedingungen – keine Vorhersage, keine Empfehlung, keine Order. Strukturklarheit beschreibt die Eindeutigkeit des Charts, nicht die Wahrscheinlichkeit eines Ergebnisses." }),
      el("p", { class: "cb-dim", text: "Analysestand " + X.dateDe(a.asOf) + " · Kursbasis splitbereinigt · " + (a.dataQuality.closeOnly ? "Wochenschlusskurse" : "Tageskurse mit Volumen") + " · Schema " + a.schemaVersion })]));

    selectKind(kind); setView(view);
    /* Wischen zwischen Szenarien (mobil) */
    var sx = null;
    chartHost.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    chartHost.addEventListener("touchend", function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60 && kinds.length > 1) { var i = kinds.indexOf(kind); selectKind(kinds[(i + (dx < 0 ? 1 : -1) + kinds.length) % kinds.length]); } }, { passive: true });
    var rt; global.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (chartHost.isConnected) draw(); }, 150); });
  }

  /** Was die Szenarien unterscheidet (§46): Grenzen in einem Satz. */
  function scenarioDifference(p, alt) {
    if (!p || !alt) return null;
    var parts = [];
    if (p.invalidation) parts.push("Das Hauptszenario gilt, solange der Schlusskurs " + (p.invalidation.direction === "below" ? "über " : "unter ") + fmt(p.invalidation.price) + " bleibt.");
    if (alt.trigger && isNum(alt.trigger.price)) parts.push("Die Alternative rückt in den Vordergrund " + (alt.direction === "BEARISH" ? "unter " : "über ") + fmt(alt.trigger.price) + ".");
    else if (alt.invalidation) parts.push("Die Alternative wäre " + (alt.invalidation.direction === "below" ? "unter " : "über ") + fmt(alt.invalidation.price) + " widerlegt.");
    return parts.length ? el("p", { class: "cb-sc-diff" }, [el("b", { text: "Was die Szenarien unterscheidet: " }), el("span", { text: parts.join(" ") })]) : null;
  }
  /** Markierungen auf der Zeitreise-Leiste: Wochen, in denen die Wellenlesart wechselte (§61). */
  function replayTicks(steps) {
    var box = el("div", { class: "cb-scrub-ticks", "aria-hidden": "true" });
    for (var q = 1; q < steps.length; q++) {
      var a0 = steps[q - 1].ew, b0 = steps[q].ew;
      var kind = !a0 && !b0 ? null : !a0 || !b0 ? "flip" : a0.key !== b0.key ? "change" : null;
      if (kind) box.append(el("span", { class: "cb-tick cb-tick-" + kind, style: "left:" + (100 * q / (steps.length - 1)).toFixed(2) + "%" }));
    }
    return box;
  }
  /** Elliott-Struktur fuer die Einfach-Ansicht: Hauptlesart = derzeit bevorzugt, nicht "richtig"; Grenze zuerst; Alternative
      gleichwertig erreichbar; ohne verlaessliche Zaehlung die Marktstruktur statt einer leeren Stelle (§98–§100). */
  function elliottConsumerCard(a, abstain, onSet) {
    var E = a.pro.elliott, c = E && E.primary, P = a.pro;
    var lvl = { HIGH: "hoch", MODERATE: "mittel", LOW: "niedrig" };
    var head = el("div", { class: "cb-ew-head" }, [el("span", { class: "cb-ew-k", text: "Elliott-Struktur" }), el("span", { class: "cb-badge cb-badge-experimental", text: "Experimentelles Modell" })]);
    if (!c || abstain) {
      var t = P.trend, st = function (x) { return x && x.state === "UP" ? "steigend" : x && x.state === "DOWN" ? "fallend" : "ohne klare Richtung"; };
      var sup = (P.supportResistance.supports || [])[0], res = (P.supportResistance.resistances || [])[0];
      return el("section", { class: "cb-ew-card is-abstain", "aria-label": "Elliott-Struktur" }, [head,
        el("p", { class: "cb-ew-main", text: "Keine verlässliche Zählung" }),
        el("p", { class: "cb-ew-sub", text: "Die aktuelle Kursstruktur lässt keine verlässliche Elliott-Zählung zu. Stattdessen die Marktstruktur:" }),
        el("dl", { class: "qx-kv cb-ew-kv" }, [].concat.apply([], [
          ["Übergeordneter Trend", st(t && t.primary)], ["Mittelfristig", st(t && t.secondary)],
          sup ? ["Nächste Unterstützung", zoneText(sup)] : null, res ? ["Nächster Widerstand", zoneText(res)] : null
        ].filter(Boolean).map(function (r) { return [el("dt", { text: r[0] }), el("dd", { class: "num", text: r[1] })]; })))]);
    }
    var appl = E.applicability ? E.applicability.level : "LOW", alt = (E.alternatives || [])[0];
    var possible = !c.complete && appl !== "HIGH";
    var main = c.complete ? c.patternName + " abgeschlossen" : (possible ? "Mögliche " : "") + "Welle " + c.currentWave.label + " · " + c.patternName;
    var amb = E.ambiguity ? { STRUCTURE: "Mehrere gültige Lesarten", DEGREE: "Dieselbe Struktur, auf anderer Ebene zählbar", LABEL: "Gleiche Wellen, anderes Muster möglich", NONE: "Keine materiell andere Lesart" }[E.ambiguity.kind] : null;
    var inv = c.invalidation ? "Schlusskurs " + (c.invalidation.direction === "below" ? "unter " : "über ") + fmt(c.invalidation.price) : null;
    var kids = [head, el("p", { class: "cb-ew-main", text: main }),
      el("dl", { class: "qx-kv cb-ew-kv" }, [].concat.apply([], [
        ["Modellstatus", "Experimentell"], ["Strukturklarheit", lvl[appl] || "–"], amb ? ["Lesarten", amb] : null,
        inv ? ["Falsch, wenn", inv] : null
      ].filter(Boolean).map(function (r) { return [el("dt", { text: r[0] }), el("dd", { class: "num", text: r[1] })]; })))];
    if (alt) {
      var altInv = alt.invalidation ? " – falsch bei Schluss " + (alt.invalidation.direction === "below" ? "unter " : "über ") + fmt(alt.invalidation.price) : "";
      var altLine = el("p", { class: "cb-ew-alt", text: "Alternative: " + alt.patternName + (alt.complete ? " abgeschlossen" : ", Welle " + alt.currentWave.label) + altInv });
      kids.push(el("div", { class: "cb-ew-switch" }, [segmented("Lesart im Chart", [["primary", "Hauptlesart"], ["alt", "Alternative"]], "primary", onSet)]), altLine);
    }
    kids.push(el("p", { class: "cb-small cb-dim", text: "Hauptlesart = derzeit bevorzugte Interpretation, nicht „die richtige Zählung“. Keine Wahrscheinlichkeit, kein Signal." }));
    return el("section", { class: "cb-ew-card", "aria-label": "Elliott-Struktur" }, kids);
  }

  /** Elliott-Transparenz (§54/§123): Zaehlung, Grad, Status, Count Quality, Verzug, Regeln, Grad-Passung, Evidenz. */
  var V2NAMES = { IMPULSE: "Impuls", LEADING_DIAGONAL: "Leading Diagonal", ENDING_DIAGONAL: "Ending Diagonal", ZIGZAG: "Zigzag", FLAT: "Flat", TRIANGLE: "Dreieck", WXY: "Doppelte Korrektur", DOUBLE_ZIGZAG: "Doppel-Zigzag", TRIPLE_ZIGZAG: "Dreifach-Zigzag" };
  function elliottPanel(a, methodEv) {
    var E = a.pro.elliott, T = a.pro.elliottTransparency;
    if (!E || !E.primary || !T) return null;
    var c = E.primary, alt = (E.alternatives || [])[0];
    var lvl = { HIGH: "hoch", MODERATE: "mittel", LOW: "niedrig", UNKNOWN: "–" };
    var d = T.detection, ev = methodEv && methodEv.methods && methodEv.methods.ELLIOTT;
    var rows = [
      ["Methodenstatus", "Experimentelles Strukturmodell · " + (E.engineVersion || "") + " · historischer Prognosevorteil nicht belegt"],
      ["Hauptzählung", c.patternName + " · " + (c.complete ? "abgeschlossen" : (T.status === "DEVELOPING" && E.applicability && E.applicability.level !== "HIGH" ? "mögliche " : "") + "Welle " + c.currentWave.label + " von " + c.currentWave.of)],
      ["Alternative", alt ? alt.patternName + " · " + (alt.complete ? "abgeschlossen" : "Welle " + alt.currentWave.label) : "keine materiell andere"],
      ["Grad", E.engineVersion && /^elliott-3/.test(E.engineVersion) ? "Hauptgrad" + (E.higherDegree ? " · höherer Grad: " + E.higherDegree.patternName + ", Welle " + E.higherDegree.current.notation : "") + " (Skalennähe " + T.degree.analysis + ")" : T.degree.analysis + (T.degree.higher ? " · höherer Grad " + T.degree.higher : "")],
      ["Mehrdeutigkeit", E.ambiguity ? ({ NONE: "keine materiell andere Lesart", DEGREE: "nur Grad (dieselbe Struktur, andere Ebene)", LABEL: "nur Etikett (gleiche Wellenenden)", STRUCTURE: "strukturell (andere Wellenenden)" }[E.ambiguity.kind] || E.ambiguity.kind) : "–"],
      ["Status", T.status === "DEVELOPING" ? "entwickelnd (laufende Welle)" : "abgeschlossen"],
      ["Count Quality", c.countQuality ? lvl[c.countQuality.level] + " (" + String(c.countQuality.score).replace(".", ",") + ")" : "–"],
      ["Elliott anwendbar", E.applicability ? (E.applicability.abstain ? "keine verlässliche Zählung" : lvl[E.applicability.level]) + (E.applicability.reasons.length ? " · " + E.applicability.reasons.join("; ") : "") : "–"],
      ["Regelverletzungen", String(T.ruleViolations) + (T.openRules ? " · " + T.openRules + " offen" : "")],
      ["Richtlinienpassung", isNum(T.guidelineFit) ? String(T.guidelineFit).replace(".", ",") : "–"],
      ["Höherer Grad", isNum(T.higherDegreeAgreement) ? (T.higherDegreeAgreement >= 0.8 ? "passt" : T.higherDegreeAgreement >= 0.5 ? "neutral" : "widerspricht") + " (" + String(T.higherDegreeAgreement).replace(".", ",") + ")" : "–"],
      ["Erkennungsverzug", d ? "Welle " + d.wave + ": bestätigt nach " + d.barsToEngine + " Bars (frühestens möglich nach " + (isNum(d.barsToEarliest) ? d.barsToEarliest : "–") + "); Kurs bis dahin " + (isNum(d.moveAtEngineConfirmPct) ? (d.moveAtEngineConfirmPct * 100).toFixed(1).replace(".", ",") + " %" : "–") : "–"],
      ["Neuzuordnungs-Risiko", T.relabeling ? ({ LOW: "gering", MEDIUM: "mittel", HIGH: "hoch" }[T.relabeling.risk]) + " (" + T.relabeling.relabelsLast26 + " Wechsel in 26 Schritten)" : "–"],
      ["Historische Evidenz", ev ? ev.label + " – " + ev.pro : "nicht belegt"]
    ];
    var RA = c.ruleAudit;
    if (RA) {
      var dm = RA.dimensions || {}, v3 = function (x) { return x && isNum(x.value) ? String(x.value).replace(".", ",") : "–"; };
      rows.splice(6, 1, ["Regel-Audit", RA.validity === "VALID" ? "gültig" : "UNGÜLTIG"],
        ["Harte Regeln", RA.hardRules.satisfied + "/" + RA.hardRules.total + " erfüllt" + (RA.hardRules.open ? " · " + RA.hardRules.open + " offen" : "") + (RA.hardRules.violated ? " · " + RA.hardRules.violated + " verletzt" : "")],
        ["Definitionen", RA.definitions.satisfied + "/" + RA.definitions.total + " erfüllt" + (RA.definitions.open ? " · " + RA.definitions.open + " offen" : "") + (RA.vuOperational && RA.vuOperational.total ? " · VU-Grenzen " + RA.vuOperational.satisfied + "/" + RA.vuOperational.total : "")],
        ["Richtlinien", RA.guidelines.matched + "/" + RA.guidelines.total + " erfüllt (Wert ≥ 0,7)"],
        ["Fibonacci-Passung", v3(dm.fibonacci)], ["Proportion Zeit / Preis", v3(dm.timeProportion) + " / " + v3(dm.priceProportion)],
        ["Alternation · Kanal · Extension", v3(dm.alternation) + " · " + v3(dm.channel) + " · " + v3(dm.extension)],
        ["Unterteilung", v3(dm.subdivision)], ["Momentum · Volumen", v3(dm.momentum) + " · " + (dm.volume && dm.volume.note ? "nicht verfügbar" : v3(dm.volume))]);
    }
    var dl = el("dl", { class: "qx-kv cb-ew-kv" }, [].concat.apply([], rows.map(function (r) { return [el("dt", { text: r[0] }), el("dd", { class: "num", text: r[1] })]; })));
    var srcBox = RA ? X.more("Quellen je Regel und Richtlinie (" + (RA.rules.length + RA.guidelines.items.length) + ")", function () {
      var cls = { HARD_RULE: "harte Regel", DEFINITION: "Definition", GUIDELINE: "Richtlinie", VU_OPERATIONAL: "VU-Grenzwert" };
      var li = function (x, res) { return el("li", { text: res + " " + (x.statement || x.id) + " — " + (cls[x.class] || x.class) + " · " + (x.source || "–") + " " + (x.locator || "") }); };
      return [el("ul", { class: "cb-list" }, RA.rules.map(function (x) { return li(x, x.passed === true ? "✓" : x.passed === false ? "✕" : "○"); }).concat(RA.guidelines.items.map(function (x) { return li(x, (x.matched ? "✓ " : "○ ") + String(x.value).replace(".", ",")); }))),
        el("p", { class: "cb-small cb-dim", text: "Fundstellen: " + (RA.verification || "") + ". Quellen: EWP = Frost & Prechter, Elliott Wave Principle; EWI = Gorman & Kennedy, Visual Guide; VU = Vision-Universe-Festlegung (keine Elliott-Regel)." })];
    }) : null;
    var COMP = { subdivision: "Unterteilung", anchor: "Ursprung", dominance: "Dominanz des Ursprungs", coverage: "Vollständigkeit", tail: "Anschluss an heute", residual: "Restpfad", separation: "Grad-Trennung", guidelines: "Richtlinien", higherDegree: "höherer Grad", prior: "Musterhäufigkeit", similarity: "Ähnlichkeit" };
    var why = E.trace ? X.more("Warum diese Zählung? (" + (E.trace.candidates || 0) + " regelkonforme Lesarten geprüft)", function () {
      var ch = E.trace.chosen && E.trace.chosen.components ? Object.keys(E.trace.chosen.components).filter(function (k) { return COMP[k]; }).map(function (k) { return el("li", { text: COMP[k] + ": " + String(E.trace.chosen.components[k]).replace(".", ",") }); }) : [];
      var rej = (E.trace.rejectedTop || []).map(function (r) { return el("li", { text: (V2NAMES[r.pattern] || r.pattern) + (r.complete ? " (abgeschlossen)" : "") + " ab " + X.dateDe(r.from) + " – " + r.why.replace(/\b(\w+)\b/g, function (m) { return COMP[m] || m; }) }); });
      return [el("h4", { text: "Merkmale der gewählten Lesart (0–1)" }), el("ul", { class: "cb-list" }, ch), rej.length ? el("h4", { text: "Nächste verworfene Lesarten" }) : null, rej.length ? el("ul", { class: "cb-list" }, rej) : null];
    }) : null;
    var hist = T.relabeling && T.relabeling.history && T.relabeling.history.length ? X.more("Zählungs-Historie (" + T.relabeling.history.length + " Änderungen)", function () {
      return [el("ol", { class: "cb-list cb-ew-history" }, T.relabeling.history.slice().reverse().map(function (h) { return el("li", {}, [el("b", { text: X.dateDe(h.d) + ": " }), el("span", { text: (h.to || "keine Zählung") + " — " + h.why })]); }))];
    }) : null;
    var tree = (E.candidateTree || T.candidateTree || []).map(function (b) { return el("li", { text: ({ PRIMARY: "Hauptweg", EXTENSION: "Ausdehnung", ALTERNATIVE_1: "Alternative 1", ALTERNATIVE_2: "Alternative 2" }[b.branch] || b.branch) + ": " + b.text + (isNum(b.invalidation) ? " · ungültig bei " + fmt(b.invalidation) : "") }); });
    return X.card([el("h3", { class: "qx-h3" }, [el("span", { text: "So wurde gerechnet – Elliott " }), el("span", { class: "cb-badge cb-badge-experimental", text: "Experimentell" })]), dl, srcBox, why, hist,
      tree.length ? el("h4", { text: "Mögliche Entwicklungen aus dem aktuellen Stand" }) : null, tree.length ? el("ul", { class: "cb-list" }, tree) : null,
      el("p", { class: "cb-small cb-dim", text: "Count Quality beschreibt, wie sauber der Chart den Elliott-Regeln entspricht – keine Trefferwahrscheinlichkeit." })], "cb-ew-panel");
  }

  function stat(label, value, sub) { return value ? el("div", { class: "cb-stat" }, [el("span", { class: "cb-stat-label", text: label }), el("strong", { class: "num", text: value }), el("span", { class: "cb-stat-sub", text: sub })]) : null; }

  // ================================================================ Uebersicht
  async function overview(main, ctx, params) {
    main.append(el("p", { class: "v2-eyebrow", text: "Chartbild · Übersicht" }), el("h1", { class: "qx-h1", text: "Technische Lagen im Überblick" }),
      el("p", { class: "v2-lead qx-lead", text: "Aktien, deren Chart gerade eine klar beschreibbare Lage zeigt – mit der Regel, warum sie hier stehen. Lagen beschreiben, sie empfehlen nicht." }));
    var host = el("div", {}, [X.loading()]); main.append(host);
    var rows = await TI.getDiscoverRows().catch(function () { return null; }), idx = await TI.getIndex().catch(function () { return null; });
    host.replaceChildren();
    if (!rows || !idx) { host.append(X.notice("Nicht verfügbar", "Die Übersicht konnte nicht geladen werden.")); return; }
    var byT = {}; idx.rows.forEach(function (r) { byT[r.t] = r; });
    function tile(t) {
      var r = byT[t] || {};
      return el("a", { class: "cb-tile cb-tone-" + (TONE[r.outlook] || "flat"), href: "#/aktie/" + encodeURIComponent(t) + "/chartbild" }, [
        el("span", { class: "cb-tile-t", text: t }), el("span", { class: "cb-tile-o", text: ((Ex && Ex.STRUCTURE[r.structure]) || "") }),
        r.entry ? el("span", { class: "cb-tile-z num", text: "Zone " + fmt(r.entry[0]) + "–" + fmt(r.entry[1]) }) : null,
        el("span", { class: "cb-tile-m", text: (r.tf === "1W" ? "Woche" : "Tag") + " · Struktur " + (CLARITY[r.clarity] || "–").toLowerCase() })]);
    }
    // ---------------------------------------------- Reihen
    var active = params && params.get("reihe") || rows.rows[0].id;
    var chips = el("div", { class: "cb-chips", role: "tablist", "aria-label": "Lagen" });
    var list = el("div", { class: "cb-rowlist" });
    function show(id) {
      active = id;
      chips.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.id === id ? "true" : "false"); });
      var row = rows.rows.filter(function (r) { return r.id === id; })[0];
      list.replaceChildren(el("p", { class: "cb-small" }, [el("span", { class: "cb-badge cb-badge-" + String(row.evidence || "DESCRIPTIVE").toLowerCase(), text: EVIDENCE[row.evidence] || "Beschreibend" }), el("span", { text: " Regel: " + row.rule })]));
      if (!row.tickers.length) { list.append(X.notice("Derzeit keine Titel", "Keine Aktie erfüllt diese Lage gerade.")); return; }
      list.append(el("div", { class: "cb-grid" }, row.tickers.map(tile)));
    }
    rows.rows.forEach(function (r) { var b = el("button", { type: "button", role: "tab", class: "cb-chip-btn", dataset: { id: r.id }, text: r.title + " (" + r.tickers.length + ")" }); b.addEventListener("click", function () { show(r.id); }); chips.append(b); });
    host.append(chips, list, el("p", { class: "cb-small cb-dim", text: "Stand " + X.dateDe(rows.generatedAt) + ". Auswahl: " + (rows.universe || "alle Titel") + ". " + rows.note }));
    show(active);

    // ---------------------------------------------- Eigene Auswahl (§57): Filter in Alltagssprache
    var F = { trend: "ALL", structure: "ALL", near: false, clear: false, elliott: false, universe: "INDEX" };
    var out = el("div", { class: "cb-grid" }), count = el("p", { class: "cb-small", "aria-live": "polite" });
    function apply() {
      var res = idx.rows.filter(function (r) {
        if (F.universe === "INDEX" && !(r.indexes && r.indexes.length && r.close >= 5)) return false;
        if (F.trend !== "ALL" && r.outlook !== F.trend) return false;
        if (F.structure !== "ALL" && r.structure !== F.structure) return false;
        if (F.near && !(r.distAtr !== null && r.distAtr !== undefined && r.distAtr <= 1 && r.status !== "INVALIDATED")) return false;
        if (F.clear && r.clarity !== "CLEAR") return false;
        if (F.elliott && !(r.elliottApplicable === "HIGH" && r.countQuality === "HIGH")) return false;
        return true;
      }).sort(function (x, y) { return Math.abs(y.agreement || 0) - Math.abs(x.agreement || 0); });
      count.textContent = res.length.toLocaleString("de-DE") + " Aktien" + (res.length > 48 ? " · die 48 mit dem klarsten Bild" : "");
      out.replaceChildren.apply(out, res.slice(0, 48).map(function (r) { return tile(r.t); }));
    }
    function toggle(label, key) { var b = el("button", { type: "button", class: "cb-chip-btn", "aria-pressed": "false", text: label }); b.addEventListener("click", function () { F[key] = !F[key]; b.setAttribute("aria-pressed", F[key] ? "true" : "false"); apply(); }); return b; }
    var filters = el("div", { class: "cb-filters" }, [
      el("label", { class: "cb-filter" }, [el("span", { text: "Trend" }), sel([["ALL", "alle"], ["BULLISH", "aufwärts"], ["BEARISH", "abwärts"], ["NEUTRAL", "seitwärts"], ["MIXED", "gemischt"]], function (v) { F.trend = v; apply(); })]),
      el("label", { class: "cb-filter" }, [el("span", { text: "Struktur" }), sel([["ALL", "alle"], ["UPTREND_ADVANCING", "Aufwärtstrend läuft"], ["CORRECTION_IN_UPTREND", "Rücksetzer im Aufwärtstrend"], ["RALLY_IN_DOWNTREND", "Erholung im Abwärtstrend"], ["DOWNTREND_ADVANCING", "Abwärtstrend läuft"], ["SIDEWAYS_RANGE", "Seitwärtsspanne"], ["NO_CLEAR_TREND", "kein klarer Trend"]], function (v) { F.structure = v; apply(); })]),
      el("label", { class: "cb-filter" }, [el("span", { text: "Universum" }), sel([["INDEX", "S&P 500, Nasdaq-100, Dow"], ["ALL", "alle Aktien"]], function (v) { F.universe = v; apply(); })]),
      el("div", { class: "cb-filter-toggles" }, [toggle("Nahe der Schlüsselzone", "near"), toggle("Klare Struktur", "clear"), toggle("Klare Elliott-Zählung (beschreibend)", "elliott")])
    ]);
    function sel(opts, on) { var s0 = el("select", { class: "cb-select" }, opts.map(function (o) { return el("option", { value: o[0], text: o[1] }); })); s0.addEventListener("change", function () { on(s0.value); }); return s0; }
    host.append(X.section("Eigene Auswahl", "Filter in Alltagssprache statt Indikatorwerten. Kein Filter ist ein Kaufsignal; für keine Lage ist ein Prognosevorteil belegt.", [filters, count, out], null, null, "auswahl"));
    apply();
  }

  // ================================================================ Methodik
  async function method(main, ctx, t, topicHead) {
    topicHead(main, t, "Wie das Chartbild entsteht, welche Regeln gelten – und was die eigene historische Prüfung zeigt.");
    var host = el("div", {}, [X.loading()]); main.append(host);
    var ev = await TI.getEvidenceSummary().catch(function () { return null; });
    var mev = TI.getMethodEvidence ? await TI.getMethodEvidence() : null;
    host.replaceChildren();
    function para(text) { return el("p", { class: "qx-small", text: text }); }
    host.append(el("div", { class: "qx-grid qx-grid-2" }, [
      X.card([el("h3", { class: "qx-h3", text: "Von den Daten zum Szenario" }), el("ol", { class: "cb-list" }, [
        el("li", { text: "Splitbereinigte Kurse, nur Daten bis zum Analysetag." }),
        el("li", { text: "Swings (Hochs/Tiefs) gelten erst, wenn sie bestätigt sind – mit dem Tag der Bestätigung, nie rückwirkend." }),
        el("li", { text: "Verfahren: Trend (Dow), Bewegungsstärke, Hochs und Tiefs, Wochenchart, Volumen, Chartformationen, Elliott-Wellen; Wyckoff und Fibonacci nur beschreibend bzw. als Konfluenz." }),
        el("li", { text: "Die Richtungen werden nach Evidenzgrad gewichtet; Widersprüche bleiben sichtbar (‚Gemischt‘)." }),
        el("li", { text: "Zonen entstehen dort, wo mehrere Verfahren auf denselben Preisbereich zeigen; die Ungültig-Linie ist eine Regel- oder Strukturgrenze." }),
        el("li", { text: "Texte werden aus diesen Daten formuliert – Sprache rechnet nicht." })])]),
      X.card([el("h3", { class: "qx-h3", text: "Elliott-Wellen: Regeln, nicht Bilder" }),
        para("Grundlage: Frost & Prechter, Elliott Wave Principle. Harte Regeln (z. B. Welle 2 nie unter den Ursprung von Welle 1, Welle 3 nie die kürzeste, Welle 4 nie im Gebiet von Welle 1) verwerfen eine Zählung. Definitionen trennen Musterklassen (Flat: B mindestens 90 % von A). Richtlinien (Fibonacci-Verhältnisse, Alternation, Kanal) ordnen nur die Rangfolge."),
        para("Muster: Impuls, Leading/Ending Diagonal, Zigzag, Flat, Dreieck, doppelte Korrekturen. Jede Welle wird auf der nächstfeineren Ebene geprüft (5 oder 3 Unterwellen) und mit dem höheren Grad abgeglichen. Alternativen werden immer gezeigt.")]),
      X.card([el("h3", { class: "qx-h3", text: "Strukturklarheit ist keine Wahrscheinlichkeit" }),
        para("‚Strukturklarheit‘ beschreibt, wie eindeutig und gleichgerichtet das Bild der Verfahren ist – nicht, wie wahrscheinlich ein Ziel erreicht wird. Eine Wahrscheinlichkeit wird nur gezeigt, wenn eine Kalibrierung auf ungesehenen Jahren besteht. Das ist derzeit nicht der Fall – deshalb erscheinen keine Prozentwerte für die Zukunft, sondern historische Häufigkeiten mit Vergleich zum Zufall.")]),
      X.card([el("h3", { class: "qx-h3", text: "Wie geprüft wird" }),
        para("Jede historische Lage wird so berechnet, wie sie am damaligen Tag sichtbar war (keine Zukunftsdaten, Test mit ‚vergifteter‘ Zukunft). Einstieg frühestens am Folgetag, Ungültigkeit per Schlusskurs, Kosten 0,1 % je Seite, nur nicht überlappende Signale je Aktie. Vergleich: dieselben Abstände zu Ziel und Grenze an zufälligen Tagen. Zeiträume: Entwicklung bis 2018, Prüfung ab 2019 nach dem Einfrieren der Regeln. Nach der Korrektur von Messfehlern wurde der Prüfzeitraum ein zweites Mal gerechnet, nach der vorab registrierten Elliott-Entscheidung (Gewicht 0) ein drittes Mal – jeweils ohne sonstige Regeländerung.")])
    ]));
    var st = ev && ev.studies && ev.studies.weekly;
    if (st) {
      var per = st.byPeriod || {}, test = per.TEST || {};
      var rows = [["Datenbasis", st.universe.symbolsWithEvents.toLocaleString("de-DE") + " Aktien, Wochencharts " + st.universe.dateRange[0].slice(0, 4) + "–" + st.universe.dateRange[1].slice(0, 4)],
        ["Ausgewertete Lagen (gesamt)", (st.overall.n || 0).toLocaleString("de-DE")],
        ["Zielzone 1 erreicht (Prüfzeitraum ab 2019)", pct(test.t1HitRate) + " (Zufall gleicher Abstände: " + pct(test.baselineRate) + ")"],
        ["Vorteil gegenüber Zufall (ab 2019)", isNum(test.lift) ? (test.lift * 100).toFixed(1).replace(".", ",") + " Prozentpunkte (95 %-Intervall " + (test.liftCiLow * 100).toFixed(1).replace(".", ",") + " bis " + (test.liftCiHigh * 100).toFixed(1).replace(".", ",") + ")" : "–"],
        ["Durchschnittliches Ergebnis je Lage nach Kosten", isNum(st.overall.meanReturn) ? (st.overall.meanReturn * 100).toFixed(1).replace(".", ",") + " %" : "–"],
        ["Kalibrierung bestanden", st.calibration.passed ? "ja" : "nein – deshalb keine Wahrscheinlichkeiten"]];
      var edgeText = isNum(test.liftCiLow) && test.liftCiLow > 0 ? "Ehrlich: Der Vorteil gegenüber dem Zufall ist klein. Das Chartbild ordnet ein – es ist kein Signalgeber."
        : "Ehrlich: Im Prüfzeitraum treffen die Szenarien ihre Zielzone nicht messbar häufiger als zufällig gewählte Tage mit denselben Abständen. Das Chartbild ordnet ein – es ist kein Signalgeber.";
      host.append(X.section("Was die eigene Prüfung zeigt", edgeText, [
        X.card([el("dl", { class: "qx-kv" }, [].concat.apply([], rows.map(function (x) { return [el("dt", { text: x[0] }), el("dd", { class: "num", text: x[1] })]; })))]),
        st.elliott ? X.card([el("h3", { class: "qx-h3", text: "Empirisches Elliott" }), el("ul", { class: "cb-list" }, Object.keys(st.elliott.bySetup).map(function (k) {
          var e = st.elliott.bySetup[k], name = { IMPULSE_W3_AFTER_W2: "Nach Welle 2: Welle 3 überschreitet Welle 1", IMPULSE_W5_AFTER_W4: "Nach Welle 4: Welle 5 überschreitet Welle 3", ZIGZAG_C_AFTER_B: "Zigzag nach B: Welle C überschreitet A", FLAT_C_AFTER_B: "Flat nach B: Welle C überschreitet A" }[k] || k;
          return el("li", { text: name + ": " + pct(e.confirmRate) + " (Zufall gleicher Abstände " + pct(e.baselineRate) + ", n = " + e.n.toLocaleString("de-DE") + ")" });
        })), para("Hohe Quoten entstehen aus der Geometrie (Ziel nah, Grenze fern). Gegen den Zufall gemessen trafen die Lehrbuch-Erwartungen " + (Object.keys(st.elliott.bySetup).every(function (k) { return !(st.elliott.bySetup[k].lift > 0); }) ? "in keinem Setup häufiger ein – Elliott-Zählungen sind hier Beschreibung, keine Vorhersage." : "nur teilweise häufiger ein.")) ]) : null,
        ev.elliottValidation && ev.elliottValidation.confirmatory ? elliottValidationCard(ev.elliottValidation.confirmatory) : null,
        mev && mev.methods ? methodEvidenceCard(mev) : null,
        st.fibonacci ? X.card([el("h3", { class: "qx-h3", text: "Fibonacci-Niveaus" }), para("In " + st.fibonacci.n.toLocaleString("de-DE") + " bestätigten Gegenbewegungen endeten Rückläufe an 38,2 %, 50 % und 61,8 % nicht häufiger als knapp daneben (Verhältnis zum Nachbarbereich: " + Object.keys(st.fibonacci.levels).map(function (k) { return (k * 100).toFixed(1).replace(".", ",") + " % → " + String(st.fibonacci.levels[k].ratio).replace(".", ","); }).join(" · ") + "). Fibonacci zählt deshalb nur, wo mehrere Anker zusammenfallen.")]) : null
      ], null, null, "evidenz"));
    }
    host.append(el("div", { class: "qx-actions" }, [X.btn("Technische Lagen ansehen", X.routes.chartlagen(), "secondary"), X.btn("Alle Methodikdateien", "/quant/methodology/", "secondary")]));
  }

  /** Evidenz-Status je Methode (§59): aus den Studien abgeleitet (scripts/technical/derive-method-evidence.mjs). */
  function methodEvidenceCard(mev) {
    var NAME = { TREND: "Trend", MOMENTUM: "Bewegungsstärke", STRUCTURE: "Hochs und Tiefs", CONFLUENCE: "Einigkeit der Verfahren", PATTERN: "Chartformationen", ELLIOTT: "Elliott-Wellen", FIBONACCI: "Fibonacci", TIMING_EARLY: "Früher Einstieg im Rücklauf", WYCKOFF: "Wyckoff", VOLUME: "Volumen" };
    var ROLE = { CORE: "Kern", CONTEXT: "Kontext", EXPERIMENTAL: "experimentell", REMOVE: "entfernt" };
    return X.card([el("h3", { class: "qx-h3", text: "Was jede Methode leisten kann" }),
      el("div", { class: "cb-table-wrap" }, [el("table", { class: "cb-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Methode" }), el("th", { text: "Evidenz" }), el("th", { text: "Rolle" }), el("th", { text: "In Worten" })])]),
        el("tbody", {}, Object.keys(mev.methods).map(function (k) { var m = mev.methods[k]; return el("tr", {}, [el("td", { text: NAME[k] || k }), el("td", {}, [el("span", { class: "cb-badge cb-badge-" + String(m.level).toLowerCase(), text: m.label })]), el("td", { text: (ROLE[m.role] || m.role) + (m.methodStatus ? " · " + m.methodStatus.label : "") }), el("td", { text: m.consumer })]); }))])]),
      el("p", { class: "cb-small cb-dim", text: "Bestätigt = vorab registrierter Test auf unabhängigen Daten bestanden · Gestützt (schwach) = statistisch messbar, aber nicht vorab registriert bestätigt und wirtschaftlich gering · Kein Vorteil belegt = geprüft, ohne belastbaren Effekt · Beschreibend = ohne Prognoseanspruch." })]);
  }

  /** Ergebnis der vorab registrierten Elliott-Validierung (Bestaetigungsstichprobe) — rein aus den Daten. */
  /* Anzeigenamen der vorab registrierten Hypothesen (PREREGISTRATION.md §3); der Bericht fuehrt sie in ASCII. */
  var HYP = {
    H1: "Elliott-Merkmale verbessern ein Modell ohne Elliott (Log-Loss, außerhalb der Stichprobe)",
    H2: "Gleicher Rücklauf: Mit Fortsetzungs-Lesart wird das Leg-Ende häufiger überschritten als ohne",
    H3: "Die besten 20 % nach Count Quality übertreffen das Basismodell",
    H4: "Mit dem höheren Grad konsistente Zählungen schlagen widersprüchliche",
    H5: "Elliott-Fortsetzungen bei hoher Volatilität schlagen die bei niedriger",
    H6: "Einstieg in der laufenden Gegenbewegung schlägt den Einstieg nach Bestätigung durch die Engine",
    H7: "Fibonacci-Konfluenz (mindestens zwei Niveaus) am Einstieg verbessert das Ergebnis"
  };
  function elliottValidationCard(v) {
    var H = v.hypotheses || {}, ks = Object.keys(H).sort();
    var any = ks.some(function (k) { return H[k].confirmed; });
    var pp = function (x) { return isNum(x) ? (x * 100 >= 0 ? "+" : "") + (x * 100).toFixed(1).replace(".", ",") : "–"; };
    return X.card([el("h3", { class: "qx-h3", text: "Elliott-Validierung (vorab registriert)" }),
      el("p", { class: "qx-small", text: (any ? "Mindestens eine vorab festgelegte Hypothese wurde auf unabhängigen Titeln bestätigt." : "Keine der vorab festgelegten Hypothesen wurde auf unabhängigen Titeln bestätigt.") + " Prüfung auf " + (v.issuers || 0).toLocaleString("de-DE") + " Emittenten, die bei der Entwicklung nicht angesehen wurden; " + (v.events || 0).toLocaleString("de-DE") + " Rückläufe." }),
      el("ul", { class: "cb-list" }, ks.map(function (k) { var h = H[k]; return el("li", { text: k + " · " + (HYP[k] || h.name) + ": " + (h.confirmed ? "bestätigt" : "nicht bestätigt") + " (Schätzer " + (k === "H1" ? String(h.est).replace(".", ",") : pp(h.est) + " Pp.") + ", 95 %-Intervall " + (k === "H1" ? String(h.lo).replace(".", ",") + " bis " + String(h.hi).replace(".", ",") : pp(h.lo) + " bis " + pp(h.hi)) + ")" }); })),
      el("p", { class: "cb-small cb-dim", text: "Elliott bleibt im Chartbild eine Sprache für Struktur und Szenarien. Ein Prognosevorteil wird nur behauptet, wenn er hier bestätigt ist." })]);
  }

  global.QXChartbild = { chartbild: chartbild, overview: overview, method: method };
})(typeof window !== "undefined" ? window : globalThis);
