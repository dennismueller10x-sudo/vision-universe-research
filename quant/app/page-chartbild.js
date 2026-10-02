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
        el("p", { class: "cb-small cb-dim", text: "Alle Werte aus Daten bis " + X.dateDe(a.asOf) + "; nur bestätigte Swings; dieselbe Rechnung wie im Backtest. Methodik: quant/methodology/technical-intelligence-v2.json · Regelwerk elliott-rules-2.0.0." }),
        el("p", {}, [X.link("Methodik und Quellen →", X.routes.method("chartbild"))])];
    }));
    return out;
  }

  // ================================================================ Seite
  async function chartbild(main, ctx, ticker, params) {
    var view = params && params.get("ansicht") === "profi" ? "pro" : readView();
    main.append(el("a", { class: "v2-back qx-back", href: X.routes.stock(ticker), text: "← Zur Aktienanalyse " + ticker }));
    var host = el("div", { class: "cb" }, [X.loading("Chartbild wird geladen …")]);
    main.append(host);
    var res = await TI.getAnalysis(ticker);
    host.replaceChildren();
    if (res.state !== "AVAILABLE") {
      host.append(el("p", { class: "v2-eyebrow", text: "Chartbild · " + ticker }), el("h1", { class: "qx-h1", text: "Für " + ticker + " liegt noch kein Chartbild vor" }),
        X.notice("Warum?", res.state === "ERROR" ? "Die Daten konnten gerade nicht geladen werden. Bitte später erneut versuchen." : "Für die Analyse braucht es mindestens drei Jahre Kursverlauf. Dieser Titel ist (noch) nicht abgedeckt."),
        el("div", { class: "qx-actions" }, [X.btn("Zur Aktienanalyse", X.routes.stock(ticker), "secondary")]));
      return;
    }
    var a = res.analysis, rules = (await TI.getRulesCatalog()).rules;
    var tfLabel = a.timeframe === "1W" ? "Wochenchart" : "Tageschart";
    var s0 = a.scenarios[0] || null, selected = s0;
    var cur = "$";

    // ---------------------------------------------- 1 Ausblick
    var outlook = a.outlook.label, tone = TONE[outlook] || "flat";
    host.append(el("header", { class: "cb-hero cb-tone-" + tone }, [
      el("p", { class: "cb-eyebrow", text: "Chartbild · " + ticker + " · " + tfLabel + " · Stand " + X.dateDe(a.asOf) }),
      el("p", { class: "cb-kicker", text: "Technischer Ausblick" }),
      el("h1", { class: "cb-outlook" }, [el("span", { class: "cb-dot", "aria-hidden": "true" }), el("span", { text: (Ex && Ex.OUTLOOK[outlook]) || outlook })]),
      el("p", { class: "cb-structure", text: (Ex && Ex.STRUCTURE[a.outlook.structure]) || a.outlook.structure }),
      el("div", { class: "cb-hero-meta" }, [
        el("span", { class: "cb-chip", title: "Wie gut Trend, Bewegungsstärke, Hochs/Tiefs und weitere Verfahren übereinstimmen. Keine Wahrscheinlichkeit." }, [el("span", { text: "Einigkeit der Verfahren " }), el("b", { text: (Ex && Ex.CONF[a.confidence.agreement]) || a.confidence.agreement })]),
        a.explain.wave ? el("span", { class: "cb-chip", title: "Vereinfachte Lesart der Elliott-Wellen. Details in der Profi-Ansicht." }, [el("span", { text: a.explain.wave })]) : null
      ]),
      el("p", { class: "cb-lead", text: a.explain.summary })
    ]));

    // ---------------------------------------------- Ansicht-Schalter
    /* Einfach | Profi: dieselbe Seite, die Profi-Tiefe wird erst beim Oeffnen gebaut. */
    var proHost = el("section", { class: "cb-pro", "aria-label": "Profi-Ansicht" }), proOpen = el("button", { type: "button", class: "cb-pro-open", text: "Profi-Ansicht öffnen" });
    var viewSeg;
    function setView(v) {
      view = v; writeView(v); waves = v === "pro";
      if (v === "pro" && !proHost.firstChild) proView(a, rules).forEach(function (n) { proHost.append(n); });
      proHost.hidden = v !== "pro"; proOpen.hidden = v === "pro";
      viewSeg.querySelectorAll("button").forEach(function (b, q) { b.setAttribute("aria-pressed", (q === 1) === (v === "pro") ? "true" : "false"); });
      draw();
    }
    viewSeg = segmented("Ansicht", [["simple", "Einfach"], ["pro", "Profi"]], view, function (v) { setView(v); });
    proOpen.addEventListener("click", function () { setView("pro"); proHost.scrollIntoView({ behavior: "smooth", block: "start" }); });
    host.append(el("div", { class: "cb-viewswitch" }, [viewSeg]));

    // ---------------------------------------------- 2 Zonen
    var levels = el("div", { class: "cb-levels", role: "list" });
    function fillLevels(s) {
      levels.replaceChildren();
      if (!s) return;
      if (s.range) { levels.append(levelTile("range", "Untergrenze", zoneText(s.range.support)), levelTile("range", "Obergrenze", zoneText(s.range.resistance))); return; }
      if (s.entryZone) levels.append(levelTile("entry", s.kind === "TAIL" ? "Tiefere Zone" : "Einstiegszone", zoneText(s.entryZone), statusText(s)));
      (s.targets || []).slice(0, 2).forEach(function (z, q) { levels.append(levelTile("target", "Zielzone " + (q + 1), zoneText(z))); });
      if (s.invalidation) levels.append(levelTile("invalid", s.invalidation.direction === "below" ? "Ungültig unter" : "Ungültig über", fmt(s.invalidation.price), "per Schlusskurs"));
    }
    host.append(levels);

    // ---------------------------------------------- 3 Chart
    var chartHost = el("div", { class: "cb-chart", tabindex: "0", role: "region", "aria-label": "Chart mit Zonen und Szenario" });
    var range = a.timeframe === "1W" ? "3J" : "6M", mode = "candles", waves = view === "pro";
    var ranges = a.timeframe === "1W" ? [["1J", "1 J", 52], ["3J", "3 J", 156], ["5J", "5 J", 260]] : [["3M", "3 M", 63], ["6M", "6 M", 126], ["1J", "1 J", 252]];
    function barsFor() { var r = ranges.filter(function (x) { return x[0] === range; })[0]; return r ? r[2] : 126; }
    function waveMarks() {
      var E = a.pro.elliott; if (!E || !E.primary) return [];
      return E.primary.waves.map(function (w) { return { label: w.label, display: view === "pro" ? w.notation : w.label, toTime: w.toTime, toPrice: w.toPrice, fromPrice: w.fromPrice, status: w.status }; });
    }
    function draw() {
      var width = Math.max(300, Math.min(1100, chartHost.clientWidth || main.clientWidth - 24));
      var alt = selected && selected.kind === "PRIMARY" ? null : s0;
      chartHost.replaceChildren(Chart.render({ chart: a.chart, scenario: selected, alt: alt && alt !== selected ? alt : null, waves: waves ? waveMarks() : null, width: width, height: width < 520 ? 400 : 440,
        bars: barsFor(), mode: mode, currency: cur, title: ticker + " · Chartbild · " + tfLabel, labels: true }));
    }
    var controls = el("div", { class: "cb-controls" }, [
      segmented("Zeitraum", ranges.map(function (x) { return [x[0], x[1]]; }), range, function (v) { range = v; draw(); }),
      a.chart.closeOnly ? null : segmented("Darstellung", [["candles", "Kerzen"], ["line", "Linie"]], mode, function (v) { mode = v; draw(); }),
      segmented("Wellen", [["off", "Wellen aus"], ["on", "Wellen an"]], waves ? "on" : "off", function (v) { waves = v === "on"; draw(); })
    ]);
    host.append(el("section", { class: "cb-chart-card" }, [controls, chartHost,
      el("p", { class: "cb-legend" }, [el("span", { class: "cb-key cb-key-entry", text: "Einstiegszone" }), el("span", { class: "cb-key cb-key-target", text: "Zielzonen" }), el("span", { class: "cb-key cb-key-invalid", text: "Ungültig-Linie (Schlusskurs)" }), el("span", { class: "cb-key cb-key-path", text: "Szenario-Pfad – keine Zeitangabe" })]),
      a.chart.closeOnly ? el("p", { class: "cb-small cb-dim", text: "Wochenschlusskurse ohne Volumen: Kerzen und Volumenbefunde sind für diesen Titel nicht verfügbar." }) : null]));

    // ---------------------------------------------- 4 Szenarien
    var cards = el("div", { class: "cb-scenarios", role: "list" });
    function renderCards() { cards.replaceChildren.apply(cards, a.scenarios.map(function (s) { return scenarioCard(s, a, s === selected, function (x) { selected = x; fillLevels(x); renderCards(); draw(); }); })); }
    host.append(X.section("Szenarien", "Ein Hauptszenario und Alternativen – jeweils mit der Bedingung, unter der sie nicht mehr gelten. Antippen zeigt die Zonen im Chart.", [cards], null, null, "szenarien"));

    // ---------------------------------------------- 5 Warum?
    var items = a.evidence.checklist.slice().sort(function (x, y) { var o = { SUPPORTS: 0, CONTRADICTS: 1, NEUTRAL: 2, UNAVAILABLE: 3 }; return o[x.status] - o[y.status] || FAMILY_ORDER.indexOf(x.family) - FAMILY_ORDER.indexOf(y.family); });
    var top = items.slice(0, 6), rest = items.slice(6);
    host.append(X.section("Warum dieses Bild?", a.outlook.label === "MIXED" ? "Die Verfahren widersprechen sich. Beides wird gezeigt, nichts wird gemittelt." : "Was dafür spricht, was dagegen – in Alltagssprache.", [
      el("ul", { class: "cb-checks" }, top.map(function (i) { return check(i.status, i.family, i.statement); })),
      rest.length ? X.more("Weitere Punkte (" + rest.length + ")", function () { return el("ul", { class: "cb-checks" }, rest.map(function (i) { return check(i.status, i.family, i.statement); })); }) : null
    ], null, null, "warum"));

    // ---------------------------------------------- 6 Historische Evidenz
    var ev = a.explain.evidence, evKids = [];
    if (ev && ev.status === "OK") {
      evKids.push(el("div", { class: "cb-stats" }, [
        stat("Vergleichbare Lagen", ev.n.toLocaleString("de-DE"), a.timeframe === "1W" ? "Wochencharts, gesamtes Universum" : "Tagescharts"),
        stat("Zielzone 1 erreicht", pct(ev.hitRate), "vor dem Bruch der Ungültig-Linie"),
        stat("Zufall mit gleichem Abstand", pct(ev.baseline), "gleiche Ziel- und Grenzabstände, zufälliger Zeitpunkt"),
        ev.window ? stat("Typische Dauer bis Zielzone 1", ev.window, "mittlere Hälfte der Treffer") : null
      ]));
      evKids.push(el("p", { class: "cb-evidence-verdict cb-edge-" + ev.edge.toLowerCase(), text: ev.edge === "BETTER_THAN_RANDOM" ? "Historisch etwas besser als der Zufall – der Vorteil ist klein." : ev.edge === "SLIGHTLY_BETTER_UNCERTAIN" ? "Historisch nur unsicher besser als der Zufall." : "Historisch kein Vorteil gegenüber dem Zufall." }));
    } else evKids.push(X.notice("Begrenzte Evidenz", ev ? ev.text : "Keine Evidenzdaten verfügbar."));
    evKids.push(el("p", { class: "cb-small cb-dim", text: "Backtest mit Daten nur bis zum jeweiligen Erkennungstag, Einstieg erst danach, Kosten berücksichtigt. Nur heute gelistete Titel (Survivorship-Verzerrung möglich). Keine Gewähr für die Zukunft." }));
    if (a.history && a.history.length) evKids.push(X.more("Frühere Fälle bei " + ticker + " (" + a.history.length + ")", function () { return el("ul", { class: "cb-list" }, a.history.map(function (h) { return el("li", { class: "num", text: X.dateDe(h.date) + " · " + ((Ex && Ex.TEMPLATE[h.template]) || h.template).split(" —")[0] + " · " + ({ TARGET1: "Zielzone 1 erreicht", INVALIDATED: "ungültig", TIMEOUT: "ohne Ergebnis abgelaufen", NO_ENTRY: "Zone nicht erreicht" }[h.outcome] || h.outcome) + (isNum(h.barsToT1) ? " nach " + h.barsToT1 + (a.timeframe === "1W" ? " Wochen" : " Tagen") : "") }); })); }));
    host.append(X.section("Historische Evidenz", "Wie oft ähnliche Lagen früher Zielzone 1 erreichten – im Vergleich zu zufälligen Einstiegen mit gleichem Abstand.", evKids, null, null, "evidenz"));

    // ---------------------------------------------- 7 Zeitebenen
    var wk = a.timeframes.weekly;
    var tfKids = [];
    if (a.timeframe === "1D") {
      tfKids.push(el("ul", { class: "cb-list" }, [
        el("li", {}, [el("b", { text: "Wochenchart: " }), el("span", { text: wk ? ((Ex && Ex.OUTLOOK[wk.outlook]) || wk.outlook) + (wk.elliott ? " · Wellen: " + wk.elliott.patternName + ", Welle " + wk.elliott.wave : "") : "nicht verfügbar" })]),
        el("li", {}, [el("b", { text: "Tageschart: " }), el("span", { text: (Ex && Ex.OUTLOOK[a.outlook.label]) || a.outlook.label })]),
        el("li", {}, [el("b", { text: "Intraday: " }), el("span", { text: "keine Intraday-Historie verfügbar" })])
      ]), el("p", { class: "cb-small", text: { ALIGNED: "Wochen- und Tageschart zeigen in dieselbe Richtung.", COUNTER_TREND: "Achtung: Das Tagesbild läuft gegen den Wochenchart.", MIXED: "Wochen- und Tageschart sind nicht einig.", UNAVAILABLE: "" }[a.timeframes.alignment] || "" }));
    } else tfKids.push(el("p", { class: "cb-small", text: "Für diesen Titel liegt die Analyse auf Wochenbasis vor (Wochenschlusskurse). Ein Tageschart-Szenario entsteht, sobald die Tageshistorie im Produkt verarbeitet ist." }));
    host.append(X.section("Zeitebenen", "Der Wochenchart gibt die große Richtung vor, der Tageschart das Szenario.", tfKids, null, null, "zeitebenen"));

    // ---------------------------------------------- 8 Profi
    host.append(el("h2", { class: "cb-pro-title", text: "Profi-Ansicht" }), el("p", { class: "cb-small", text: "Wellenzählung mit Regelprüfung, Alternativen, Niveaus, Bewegungsstärke, Volumen, Formationen, Konfluenz und Quellen." }), proOpen, proHost);

    host.append(el("footer", { class: "cb-foot" }, [el("p", { text: "Szenarien beschreiben Bedingungen und historische Häufigkeiten – keine Vorhersage, keine Empfehlung, keine Order. Einigkeit der Verfahren ist keine Wahrscheinlichkeit; in der VU-Studie hing die Trefferquote nicht messbar von ihr ab." }),
      el("p", { class: "cb-dim", text: "Analysestand " + X.dateDe(a.asOf) + " · Kursbasis splitbereinigt · " + (a.dataQuality.closeOnly ? "Wochenschlusskurse" : "Tageskurse mit Volumen") + " · Schema " + a.schemaVersion })]));

    fillLevels(selected); renderCards(); setView(view);
    var rt; global.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (chartHost.isConnected) draw(); }, 150); });
  }
  function stat(label, value, sub) { return value ? el("div", { class: "cb-stat" }, [el("span", { class: "cb-stat-label", text: label }), el("strong", { class: "num", text: value }), el("span", { class: "cb-stat-sub", text: sub })]) : null; }

  // ================================================================ Uebersicht
  async function overview(main, ctx, params) {
    main.append(el("p", { class: "v2-eyebrow", text: "Chartbild · Übersicht" }), el("h1", { class: "qx-h1", text: "Technische Lagen im Überblick" }),
      el("p", { class: "v2-lead qx-lead", text: "Aktien, deren Chart gerade eine klar beschreibbare Lage zeigt – mit Regel, warum sie hier stehen. Lagen sind keine Empfehlungen." }));
    var host = el("div", {}, [X.loading()]); main.append(host);
    var rows = await TI.getDiscoverRows().catch(function () { return null; }), idx = await TI.getIndex().catch(function () { return null; });
    host.replaceChildren();
    if (!rows || !idx) { host.append(X.notice("Nicht verfügbar", "Die Übersicht konnte nicht geladen werden.")); return; }
    var byT = {}; idx.rows.forEach(function (r) { byT[r.t] = r; });
    var active = params && params.get("reihe") || rows.rows[0].id;
    var chips = el("div", { class: "cb-chips", role: "tablist" });
    var list = el("div", { class: "cb-rowlist" });
    function show(id) {
      active = id;
      chips.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.id === id ? "true" : "false"); });
      var row = rows.rows.filter(function (r) { return r.id === id; })[0];
      list.replaceChildren(el("p", { class: "cb-small", text: "Regel: " + row.rule }));
      if (!row.tickers.length) { list.append(X.notice("Derzeit keine Titel", "Keine Aktie erfüllt diese Lage gerade.")); return; }
      list.append(el("div", { class: "cb-grid" }, row.tickers.map(function (t) {
        var r = byT[t] || {};
        return el("a", { class: "cb-tile cb-tone-" + (TONE[r.outlook] || "flat"), href: "#/aktie/" + encodeURIComponent(t) + "/chartbild" }, [
          el("span", { class: "cb-tile-t", text: t }), el("span", { class: "cb-tile-o", text: ((Ex && Ex.STRUCTURE[r.structure]) || "") }),
          r.entry ? el("span", { class: "cb-tile-z num", text: "Zone " + fmt(r.entry[0]) + "–" + fmt(r.entry[1]) }) : null,
          el("span", { class: "cb-tile-m", text: (r.tf === "1W" ? "Woche" : "Tag") + " · Einigkeit " + ((Ex && Ex.CONF[r.confidence]) || "") })]);
      })));
    }
    rows.rows.forEach(function (r) { var b = el("button", { type: "button", role: "tab", class: "cb-chip-btn", dataset: { id: r.id }, text: r.title + " (" + r.tickers.length + ")" }); b.addEventListener("click", function () { show(r.id); }); chips.append(b); });
    host.append(chips, list, el("p", { class: "cb-small cb-dim", text: "Stand " + X.dateDe(rows.generatedAt) + ". Auswahl: " + (rows.universe || "alle Titel") + ". " + rows.note }));
    show(active);
  }

  // ================================================================ Methodik
  async function method(main, ctx, t, topicHead) {
    topicHead(main, t, "Wie das Chartbild entsteht, welche Regeln gelten – und was die eigene historische Prüfung zeigt.");
    var host = el("div", {}, [X.loading()]); main.append(host);
    var ev = await TI.getEvidenceSummary().catch(function () { return null; });
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
      X.card([el("h3", { class: "qx-h3", text: "Konfidenz ist keine Wahrscheinlichkeit" }),
        para("‚Einigkeit der Verfahren‘ beschreibt, wie gleichgerichtet die Verfahren sind. Eine Wahrscheinlichkeit wird nur gezeigt, wenn eine Kalibrierung auf ungesehenen Jahren besteht. Das ist derzeit nicht der Fall – deshalb erscheinen keine Prozentwerte für die Zukunft, sondern historische Häufigkeiten mit Vergleich zum Zufall.")]),
      X.card([el("h3", { class: "qx-h3", text: "Wie geprüft wird" }),
        para("Jede historische Lage wird so berechnet, wie sie am damaligen Tag sichtbar war (keine Zukunftsdaten, Test mit ‚vergifteter‘ Zukunft). Einstieg frühestens am Folgetag, Ungültigkeit per Schlusskurs, Kosten 0,1 % je Seite, nur nicht überlappende Signale je Aktie. Vergleich: dieselben Abstände zu Ziel und Grenze an zufälligen Tagen. Zeiträume: Entwicklung bis 2018, Prüfung ab 2019 – einmalig, nach dem Einfrieren der Regeln.")])
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
      host.append(X.section("Was die eigene Prüfung zeigt", "Ehrlich: Der Vorteil gegenüber dem Zufall ist klein. Das Chartbild ordnet ein – es ist kein Signalgeber.", [
        X.card([el("dl", { class: "qx-kv" }, [].concat.apply([], rows.map(function (x) { return [el("dt", { text: x[0] }), el("dd", { class: "num", text: x[1] })]; })))]),
        st.elliott ? X.card([el("h3", { class: "qx-h3", text: "Empirisches Elliott" }), el("ul", { class: "cb-list" }, Object.keys(st.elliott.bySetup).map(function (k) {
          var e = st.elliott.bySetup[k], name = { IMPULSE_W3_AFTER_W2: "Nach Welle 2: Welle 3 überschreitet Welle 1", IMPULSE_W5_AFTER_W4: "Nach Welle 4: Welle 5 überschreitet Welle 3", ZIGZAG_C_AFTER_B: "Zigzag nach B: Welle C überschreitet A", FLAT_C_AFTER_B: "Flat nach B: Welle C überschreitet A" }[k] || k;
          return el("li", { text: name + ": " + pct(e.confirmRate) + " (Zufall gleicher Abstände " + pct(e.baselineRate) + ", n = " + e.n.toLocaleString("de-DE") + ")" });
        })), para("Hohe Quoten entstehen oft aus der Geometrie (Ziel nah, Grenze fern) – der Vergleich mit dem Zufall zeigt, was die Zählung wirklich beiträgt.")]) : null,
        st.fibonacci ? X.card([el("h3", { class: "qx-h3", text: "Fibonacci-Niveaus" }), para("In " + st.fibonacci.n.toLocaleString("de-DE") + " bestätigten Gegenbewegungen endeten Rückläufe an 38,2 %, 50 % und 61,8 % nicht häufiger als knapp daneben (Verhältnis zum Nachbarbereich: " + Object.keys(st.fibonacci.levels).map(function (k) { return (k * 100).toFixed(1).replace(".", ",") + " % → " + String(st.fibonacci.levels[k].ratio).replace(".", ","); }).join(" · ") + "). Fibonacci zählt deshalb nur, wo mehrere Anker zusammenfallen.")]) : null
      ], null, null, "evidenz"));
    }
    host.append(el("div", { class: "qx-actions" }, [X.btn("Technische Lagen ansehen", X.routes.chartlagen(), "secondary"), X.btn("Alle Methodikdateien", "/quant/methodology/", "secondary")]));
  }

  global.QXChartbild = { chartbild: chartbild, overview: overview, method: method };
})(typeof window !== "undefined" ? window : globalThis);
