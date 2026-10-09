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
    return el("div", { class: "cb-level cb-level-" + kind, role: "listitem" }, [
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
      el("h3", { text: scenarioTitle(s, s.kind === "PRIMARY" ? s : null) }),
      el("p", { class: "cb-sc-note", text: (Ex && Ex.TEMPLATE[s.template]) || s.template }),
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

  // ================================================================ Profi (Mission IV §58–§60): Schichten statt Textwand
  /* Aufbau: 1 Elliott-Ueberblick (Kacheln) → 2 Reiter (Regeln, Alternativen, Grad & Kontext, Historie, Evidenz, Quellen),
     immer nur einer offen → 3 weitere Verfahren als kompakte Karten (2–4 Kennzahlen, Details aufklappbar).
     Nichts entfaellt: jede fruehere Angabe steht in einem Reiter oder hinter "Details". */
  var LVL = { HIGH: "hoch", MODERATE: "mittel", LOW: "niedrig", UNKNOWN: "–" };
  var V2NAMES = { IMPULSE: "Impuls", LEADING_DIAGONAL: "Leading Diagonal", ENDING_DIAGONAL: "Ending Diagonal", ZIGZAG: "Zigzag", FLAT: "Flat", TRIANGLE: "Dreieck", WXY: "Doppelte Korrektur", DOUBLE_ZIGZAG: "Doppel-Zigzag", TRIPLE_ZIGZAG: "Dreifach-Zigzag" };
  var COMP = { subdivision: "Unterteilung", anchor: "Ursprung", dominance: "Dominanz des Ursprungs", coverage: "Vollständigkeit", tail: "Anschluss an heute", residual: "Restpfad", separation: "Grad-Trennung", guidelines: "Richtlinien", higherDegree: "höherer Grad", prior: "Musterhäufigkeit", similarity: "Ähnlichkeit" };
  var RCLS = { HARD_RULE: "harte Regel", HARD: "harte Regel", DEFINITION: "Definition", GUIDELINE: "Richtlinie", VU_OPERATIONAL: "VU-Grenzwert" };
  function dec(x, n) { return isNum(x) ? (typeof n === "number" ? x.toFixed(n) : String(x)).replace(".", ",") : "–"; }
  function dirWord(d) { return d === "UP" || d === "BULLISH" || d > 0 ? "aufwärts" : d === "DOWN" || d === "BEARISH" || d < 0 ? "abwärts" : "seitwärts"; }
  function dirArrow(d) { return d === "UP" || d === "BULLISH" || d > 0 ? "↗" : d === "DOWN" || d === "BEARISH" || d < 0 ? "↘" : "→"; }
  function dirTone(d) { return d === "UP" || d === "BULLISH" || d > 0 ? "up" : d === "DOWN" || d === "BEARISH" || d < 0 ? "down" : "flat"; }
  function boundText(b) { return b ? "Schluss " + (b.direction === "below" ? "unter " : "über ") + fmt(b.price) : null; }
  function proTile(label, value, sub, tone) {
    return el("div", { class: "cb-pt" + (tone ? " cb-pt-" + tone : "") }, [el("span", { class: "cb-pt-k", text: label }), el("strong", { class: "cb-pt-v", text: value }), sub ? el("span", { class: "cb-pt-s", text: sub }) : null]);
  }
  function kv(rows) { return el("dl", { class: "cb-kv2" }, [].concat.apply([], rows.filter(Boolean).map(function (r) { return [el("dt", { text: r[0] }), el("dd", { class: "num", text: r[1] })]; }))); }
  function markOf(passed) { return passed === true ? ["✓", "erfüllt", "ok"] : passed === false ? ["✕", "verletzt", "bad"] : ["○", "offen", "open"]; }

  /** Reiter nach WAI-ARIA (tablist/tab/tabpanel, Pfeiltasten, Pos1/Ende); Inhalte entstehen erst beim ersten Oeffnen. */
  var tabSeq = 0;
  function tabset(label, items, initial) {
    var uid = "cb-tabs-" + (++tabSeq), list = el("div", { class: "cb-tabs", role: "tablist", "aria-label": label }), box = el("div", { class: "cb-tabset" }, [list]);
    var btns = [], panels = [], built = [];
    function select(i) {
      btns.forEach(function (b, q) { var on = q === i; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; panels[q].hidden = !on; });
      if (!built[i]) { built[i] = true; var k = items[i].build(); (Array.isArray(k) ? k : [k]).forEach(function (n) { if (n) panels[i].append(n); }); }
    }
    items.forEach(function (it, i) {
      var b = el("button", { type: "button", role: "tab", class: "cb-tab", id: uid + "-t" + i, "aria-controls": uid + "-p" + i, "aria-selected": "false", tabindex: "-1" },
        [el("span", { text: it.label }), isNum(it.count) ? el("small", { class: "cb-tab-n num", "aria-hidden": "true", text: String(it.count) }) : null]);
      var p = el("div", { role: "tabpanel", class: "cb-tabpanel", id: uid + "-p" + i, "aria-labelledby": b.id, tabindex: "0", hidden: true });
      b.addEventListener("click", function () { select(i); });
      b.addEventListener("keydown", function (e) {
        var n = items.length, j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
        if (j < 0) return;
        e.preventDefault(); select(j); btns[j].focus();
      });
      btns.push(b); panels.push(p); list.append(b); box.append(p);
    });
    select(Math.max(0, Math.min(items.length - 1, initial || 0)));
    return box;
  }

  /** Eine Regelzeile: Zeichen (✓ ✕ ○) + Aussage, Quelle erst auf Wunsch. */
  function ruleItem(passed, statement, clsLabel, source, value) {
    var m = markOf(passed);
    var head = [el("span", { class: "cb-rule-mark cb-mark-" + m[2], "aria-hidden": "true", text: m[0] }), el("span", { class: "cb-rule-text" }, [el("span", { text: statement }), el("span", { class: "cb-sr", text: " (" + m[1] + ")" })]),
      value ? el("span", { class: "cb-rule-val num", text: value }) : null];
    if (!source) return el("li", { class: "cb-rule" }, [el("div", { class: "cb-rule-head" }, head)]);
    return el("li", { class: "cb-rule" }, [el("details", {}, [el("summary", { class: "cb-rule-head" }, head.concat([el("span", { class: "cb-rule-src-btn", text: "Quelle" })])),
      el("p", { class: "cb-rule-src", text: (clsLabel ? clsLabel + " · " : "") + source })])]);
  }

  /** Zaehl-Karte (Haupt- oder Alternativlesart): Muster, Stand, was sie widerlegt; Wellen und Zonen aufklappbar. */
  function countCard(c, title, primary, rules) {
    var stand = c.complete ? "Muster abgeschlossen · danach nach Lehrbuch Bewegung " + dirWord(c.nextMove) : "Aktuell Welle " + c.currentWave.label + " von " + c.currentWave.of + " (" + (c.currentWave.role === "MOTIVE" ? "Bewegung in Musterrichtung" : "Korrektur") + ")";
    var kill = c.invalidation ? ["Widerlegt bei", boundText(c.invalidation)] : null;
    var killRule = c.invalidation && c.invalidation.ruleId ? ["Regel", ((rules && rules[c.invalidation.ruleId]) || {}).statement || c.invalidation.ruleId] : null;
    var rev = c.revision ? ["Neuzuordnung bei", boundText(c.revision)] : null;
    return el("article", { class: "cb-count" + (primary ? " is-primary" : "") }, [
      el("div", { class: "cb-count-head" }, [el("span", { class: "cb-count-k", text: title }), el("span", { class: "cb-dir cb-dir-" + dirTone(c.direction) }, [el("span", { "aria-hidden": "true", text: dirArrow(c.direction) + " " }), el("span", { text: dirWord(c.direction) })])]),
      el("p", { class: "cb-count-name", text: c.patternName + (c.variant ? " (" + c.variant.toLowerCase() + ")" : "") }),
      el("p", { class: "cb-count-stand", text: stand }),
      el("div", { class: "cb-count-bound" }, [el("span", { class: "cb-bound-icon", "aria-hidden": "true" }), kv([kill, killRule, rev, !kill && !rev ? ["Grenze", "keine harte Grenze in Reichweite"] : null])]),
      X.more("Wellen und Zonen (" + c.waves.length + ")", function () {
        var zones = (c.zones || []).map(function (z) { return el("li", {}, [el("b", { class: "num", text: zoneText(z) }), el("span", { text: " · Welle " + z.phase + (z.kind === "COMPLETION" ? " (Abschluss)" : " (Ziel)") + " · " + (z.relations || []).slice(0, 2).join("; ") })]); });
        return [el("ol", { class: "cb-waves" }, c.waves.map(function (x) {
          return el("li", { class: x.status === "DEVELOPING" ? "is-dev" : "" }, [el("b", { text: x.notation || x.label }), el("span", { class: "num", text: " " + X.dateDe(x.fromTime) + " → " + (x.status === "DEVELOPING" ? "läuft" : X.dateDe(x.toTime)) + " · " + fmt(x.fromPrice) + " → " + fmt(x.toPrice) }),
            x.subdivision && x.subdivision.count > 1 ? el("small", { text: " · " + x.subdivision.count + " Unterwellen" + (x.subdivision.pattern ? " (" + x.subdivision.pattern + ")" : "") }) : null]);
        })), zones.length ? el("ul", { class: "cb-zlist" }, zones) : null,
          el("p", { class: "cb-small cb-dim", text: "Rang " + dec(c.rank) + " · Bestandteile: " + Object.keys(c.rankComponents || {}).map(function (k) { return k + " " + c.rankComponents[k]; }).join(", ") })];
      })
    ]);
  }

  /** Elliott in Schichten: Ueberblick-Kacheln, dann Reiter. Immer „Experimentell“; keine Wahrscheinlichkeit. */
  function elliottPro(a, rules, methodEv) {
    var E = a.pro.elliott, T = a.pro.elliottTransparency || {};
    if (!E || !E.primary) return X.card([el("div", { class: "cb-ewp-head" }, [el("h3", { class: "cb-ewp-title", text: "Elliott-Wellen" }), el("span", { class: "cb-badge cb-badge-experimental", text: "Experimentell" })]),
      el("p", { class: "cb-small", text: E && E.detail ? E.detail : "Keine regelkonforme Zählung der jüngsten Swings." })], "cb-ew-panel cb-ewp");
    var c = E.primary, alts = E.alternatives || [], RA = c.ruleAudit, ev = methodEv && methodEv.methods && methodEv.methods.ELLIOTT;
    var AP = E.applicability || T.applicability, abstain = !!(AP && AP.abstain), v3 = E.engineVersion && /^elliott-3/.test(E.engineVersion);
    var developing = T.status ? T.status === "DEVELOPING" : !c.complete;
    var cq = c.countQuality || T.countQuality, deg = T.degree || {}, hist = (T.relabeling && T.relabeling.history) || [];
    var countMain = abstain ? "Keine verlässliche Zählung" : c.patternName + (c.complete ? " · abgeschlossen" : " · " + (developing && AP && AP.level !== "HIGH" ? "mögliche " : "") + "Welle " + c.currentWave.label);
    var countSub = abstain ? "Rechnerisch beste Lesart: " + c.patternName + " – bewusst nicht als Zählung gezeigt" : c.complete ? "Muster " + dirWord(c.direction) + ", danach Bewegung " + dirWord(c.nextMove) : "Welle " + c.currentWave.label + " von " + c.currentWave.of;
    var bound = boundText(c.invalidation), revB = boundText(c.revision);

    var overview = el("div", { class: "cb-ewp-over", role: "group", "aria-label": "Überblick Elliott" }, [
      el("div", { class: "cb-ewp-count" + (abstain ? " is-abstain" : "") }, [el("span", { class: "cb-pt-k", text: "Derzeit bevorzugte Lesart" }), el("strong", { class: "cb-ewp-count-v", text: countMain }), el("span", { class: "cb-pt-s", text: countSub })]),
      el("div", { class: "cb-pt-grid" }, [
        proTile("Grad", v3 ? "Hauptgrad" : String(deg.analysis || "–"), (deg.analysis ? "Skala " + deg.analysis : "") + (E.higherDegree ? " · darüber " + (E.higherDegree.patternName || E.higherDegree.pattern) : deg.higher ? " · höherer Grad " + deg.higher : "")),
        proTile("Status", developing ? "Entwickelnd" : "Abgeschlossen", developing ? "laufende Welle, Ende offen" : "letzte Welle bestätigt"),
        proTile("Strukturklarheit", ({ HIGH: "Hoch", MODERATE: "Mittel", LOW: "Niedrig" }[E.clarityLevel] || "–"), "Eindeutigkeit der Zählung · keine Wahrscheinlichkeit", E.clarityLevel === "LOW" ? "warn" : null),
        proTile("Anwendbarkeit", AP ? (abstain ? "Keine verlässliche Zählung" : (LVL[AP.level] || "–").replace(/^./, function (m) { return m.toUpperCase(); })) : "–", AP && AP.reasons && AP.reasons.length ? AP.reasons[0] : null, abstain ? "warn" : null),
        proTile("Modellstatus", "Experimentell", (E.engineVersion || "–") + " · Prognosevorteil nicht belegt", "exp")
      ]),
      bound || revB ? el("p", { class: "cb-ewp-bound" }, [el("span", { class: "cb-bound-icon", "aria-hidden": "true" }), el("span", {}, [el("b", { text: bound ? "Widerlegt bei " : "Neuzuordnung der Wellen bei " }), el("span", { class: "num", text: bound || revB }), bound && revB ? el("span", { class: "cb-dim", text: " · Neuzuordnung bei " + revB }) : null])]) : null,
      el("p", { class: "cb-small cb-dim", text: "Hauptlesart = derzeit bevorzugte Interpretation, nicht „die richtige Zählung“. Strukturklarheit beschreibt die Eindeutigkeit des Charts, nicht die Wahrscheinlichkeit eines Ergebnisses." })
    ]);

    // ---- Regeln
    function buildRules() {
      var out = [];
      if (RA) out.push(el("div", { class: "cb-pt-row" }, [
        proTile("Regel-Audit", RA.validity === "VALID" ? "gültig" : "UNGÜLTIG", null, RA.validity === "VALID" ? "ok" : "bad"),
        proTile("Harte Regeln", RA.hardRules.satisfied + "/" + RA.hardRules.total, (RA.hardRules.open ? RA.hardRules.open + " offen · " : "") + (RA.hardRules.violated ? RA.hardRules.violated + " verletzt" : "keine verletzt")),
        proTile("Definitionen", RA.definitions.satisfied + "/" + RA.definitions.total, (RA.definitions.open ? RA.definitions.open + " offen" : "erfüllt") + (RA.vuOperational && RA.vuOperational.total ? " · VU-Grenzen " + RA.vuOperational.satisfied + "/" + RA.vuOperational.total : "")),
        proTile("Richtlinien", RA.guidelines.matched + "/" + RA.guidelines.total, "erfüllt (Wert ≥ 0,7) · nur Rang"),
        cq ? proTile("Count Quality", (LVL[cq.level] || "–") + " · " + dec(cq.score), "Regeltreue, keine Trefferquote") : null
      ]));
      else out.push(el("div", { class: "cb-pt-row" }, [proTile("Regelverletzungen", String(T.ruleViolations || 0), T.openRules ? T.openRules + " offen" : null), isNum(T.guidelineFit) ? proTile("Richtlinienpassung", dec(T.guidelineFit), "0–1 · nur Rang") : null, cq ? proTile("Count Quality", (LVL[cq.level] || "–") + " · " + dec(cq.score), "Regeltreue, keine Trefferquote") : null]));
      var list = RA ? RA.rules.map(function (x) { return { passed: x.passed, statement: x.statement || x.id, cls: x.class, source: (x.source || "") + (x.locator ? " " + x.locator : "") }; })
        : (c.rules || []).map(function (r) { var cat = (rules && rules[r.id]) || {}; return { passed: r.passed, statement: cat.statement || r.id, cls: r.cls === "HARD" ? "HARD_RULE" : "DEFINITION", source: cat.source || "" }; });
      var hard = list.filter(function (x) { return x.cls === "HARD_RULE"; }), defs = list.filter(function (x) { return x.cls !== "HARD_RULE"; });
      var li = function (x) { return ruleItem(x.passed, x.statement, RCLS[x.cls] || x.cls, x.source.trim() || null); };
      out.push(el("div", { class: "cb-rule-cols" }, [
        el("div", {}, [el("h4", { class: "cb-rule-h", text: "Harte Regeln" }), hard.length ? el("ul", { class: "cb-rules" }, hard.map(li)) : el("p", { class: "cb-small", text: "Keine harte Regel für dieses Muster geprüft." }),
          defs.length ? el("h4", { class: "cb-rule-h", text: "Definitionen und VU-Grenzwerte" }) : null, defs.length ? el("ul", { class: "cb-rules" }, defs.map(li)) : null]),
        el("div", {}, [el("h4", { class: "cb-rule-h", text: "Richtlinien – beeinflussen nur den Rang" }),
          RA ? el("ul", { class: "cb-rules" }, RA.guidelines.items.map(function (x) { return ruleItem(x.matched ? true : null, x.statement || x.id, "Richtlinie", ((x.source || "") + " " + (x.locator || "")).trim() || null, dec(x.value)); }))
            : el("ul", { class: "cb-rules" }, Object.keys(c.guidelines || {}).map(function (k) { return ruleItem(c.guidelines[k] >= 0.7 ? true : null, k, "Richtlinie", null, dec(c.guidelines[k])); }))])
      ]));
      out.push(el("p", { class: "cb-legend-marks" }, [el("span", { text: "✓ erfüllt" }), el("span", { text: "✕ verletzt" }), el("span", { text: "○ offen bzw. nicht erfüllt (Richtlinie)" })]));
      if (RA) {
        var dm = RA.dimensions || {}, d3 = function (x) { return x && isNum(x.value) ? dec(x.value) : "–"; };
        out.push(X.more("Audit-Dimensionen (0–1)", function () {
          return [kv([["Fibonacci-Passung", d3(dm.fibonacci)], ["Proportion Zeit / Preis", d3(dm.timeProportion) + " / " + d3(dm.priceProportion)],
            ["Alternation · Kanal · Extension", d3(dm.alternation) + " · " + d3(dm.channel) + " · " + d3(dm.extension)], ["Unterteilung", d3(dm.subdivision)],
            ["Momentum · Volumen", d3(dm.momentum) + " · " + (dm.volume && dm.volume.note ? "nicht verfügbar" : d3(dm.volume))], ["Richtlinienpassung", dec(T.guidelineFit)],
            ["Regelverletzungen", String(T.ruleViolations || 0) + (T.openRules ? " · " + T.openRules + " offen" : "")]])];
        }));
      }
      out.push(el("p", { class: "cb-small cb-dim", text: "Count Quality beschreibt, wie sauber der Chart den Elliott-Regeln entspricht – keine Trefferwahrscheinlichkeit." }));
      return out;
    }

    // ---- Alternativen
    function buildAlts() {
      var amb = E.ambiguity ? ({ NONE: "keine materiell andere Lesart", DEGREE: "nur Grad (dieselbe Struktur, andere Ebene)", LABEL: "nur Etikett (gleiche Wellenenden)", STRUCTURE: "strukturell (andere Wellenenden)" }[E.ambiguity.kind] || E.ambiguity.kind) : null;
      var tree = (E.candidateTree || T.candidateTree || []).map(function (b) { return el("li", { text: ({ PRIMARY: "Hauptweg", EXTENSION: "Ausdehnung", ALTERNATIVE_1: "Alternative 1", ALTERNATIVE_2: "Alternative 2" }[b.branch] || b.branch) + ": " + b.text + (isNum(b.invalidation) ? " · ungültig bei " + fmt(b.invalidation) : "") }); });
      return [
        abstain ? el("p", { class: "cb-unclear" }, [el("b", { text: "Keine verlässliche Zählung. " }), el("span", { text: "Die Lesarten unten sind rechnerisch regelkonform, aber nicht deutlich genug, um sie als Zählung zu zeigen – nur zur Transparenz." })]) : null,
        el("div", { class: "cb-count-grid" }, [countCard(c, "Hauptlesart · derzeit bevorzugt", true, rules)].concat(alts.map(function (x, q) { return countCard(x, "Alternative " + (q + 1), false, rules); }))),
        !alts.length ? el("p", { class: "cb-small", text: "Keine materiell andere Lesart gefunden." }) : null,
        amb ? el("p", { class: "cb-small" }, [el("b", { text: "Mehrdeutigkeit: " }), el("span", { text: amb + (E.ambiguity.note ? " – " + E.ambiguity.note : "") })]) : null,
        tree.length ? el("h4", { class: "cb-rule-h", text: "Mögliche Entwicklungen aus dem aktuellen Stand" }) : null, tree.length ? el("ul", { class: "cb-list" }, tree) : null,
        E.trace ? X.more("Warum diese Zählung? (" + (E.trace.candidates || 0) + " regelkonforme Lesarten geprüft)", function () {
          var ch = E.trace.chosen && E.trace.chosen.components ? Object.keys(E.trace.chosen.components).filter(function (k) { return COMP[k]; }).map(function (k) { return el("li", { text: COMP[k] + ": " + dec(E.trace.chosen.components[k]) }); }) : [];
          var rej = (E.trace.rejectedTop || []).map(function (r) { return el("li", { text: (V2NAMES[r.pattern] || r.pattern) + (r.complete ? " (abgeschlossen)" : "") + " ab " + X.dateDe(r.from) + " – " + r.why.replace(/\b(\w+)\b/g, function (m) { return COMP[m] || m; }) }); });
          return [el("h4", { text: "Merkmale der gewählten Lesart (0–1)" }), el("ul", { class: "cb-list" }, ch), rej.length ? el("h4", { text: "Nächste verworfene Lesarten" }) : null, rej.length ? el("ul", { class: "cb-list" }, rej) : null,
            el("p", { class: "cb-small cb-dim", text: "Struktur-Rangwert " + dec(E.structuralScore) + " · Abstand zur besten Alternative " + dec(E.clarity) + ". Keine Wahrscheinlichkeit." })];
        }) : null
      ];
    }

    // ---- Grad & Kontext
    function buildDegree() {
      var H = E.higherDegree, agr = T.higherDegreeAgreement;
      var amb = E.ambiguity ? ({ NONE: "Keine", DEGREE: "Nur Grad", LABEL: "Nur Etikett", STRUCTURE: "Strukturell" }[E.ambiguity.kind] || E.ambiguity.kind) : "–";
      return [el("div", { class: "cb-pt-row" }, [
        proTile("Analysegrad", v3 ? "Hauptgrad" : String(deg.analysis || "–"), "Skalennähe " + (deg.analysis || "–")),
        proTile("Höherer Grad", H ? (H.patternName || H.pattern) : deg.higher || "–", H ? "aktuell Welle " + H.current.notation + " · " + dirWord(H.current.direction) : null),
        proTile("Passung zum höheren Grad", isNum(agr) ? (agr >= 0.8 ? "passt" : agr >= 0.5 ? "neutral" : "widerspricht") : "–", isNum(agr) ? "Wert " + dec(agr) : null, isNum(agr) && agr < 0.5 ? "warn" : null),
        proTile("Mehrdeutigkeit", amb, E.ambiguity && E.ambiguity.note ? E.ambiguity.note : null)
      ]),
        kv([["Suche", (deg.engine || "–") + (isNum(deg.poolPivots) ? " · " + deg.poolPivots + " Pivots" : "") + (isNum(deg.candidates) ? " · " + deg.candidates + " Kandidaten" : "") + (deg.searchTruncated ? " · Suche gekürzt" : "")],
          ["Elliott anwendbar", AP ? (AP.abstain ? "keine verlässliche Zählung" : LVL[AP.level]) + (AP.reasons && AP.reasons.length ? " · " + AP.reasons.join("; ") : "") : "–"],
          ["Struktur-Klarheit", ({ HIGH: "hoch", MODERATE: "mittel", LOW: "niedrig (Alternativen liegen nah)" }[E.clarityLevel] || "–") + " · Rangwert " + dec(E.structuralScore) + " · Abstand zur besten Alternative " + dec(E.clarity) + " (keine Wahrscheinlichkeit)"],
          E.historicalMap ? ["Historische Karte", E.historicalMap.patterns.length + " zuletzt bestätigte Muster · Abdeckung " + pct(E.historicalMap.coverage) + " der Swings"] : null]),
        H && H.waves ? X.more("Wellen des höheren Grades (" + H.waves.length + ")", function () {
          return el("ol", { class: "cb-waves" }, H.waves.map(function (x) { return el("li", {}, [el("b", { text: x.notation || x.label }), el("span", { class: "num", text: " " + X.dateDe(x.fromTime) + " → " + X.dateDe(x.toTime) + " · " + fmt(x.fromPrice) + " → " + fmt(x.toPrice) })]); }));
        }) : null,
        el("p", { class: "cb-small cb-dim", text: "Bestätigte Zählungen werden nie rückwirkend umgeschrieben." })];
    }

    // ---- Historie
    function buildHistory() {
      var d = T.detection, R = T.relabeling;
      return [el("div", { class: "cb-pt-row" }, [
        proTile("Neuzuordnungs-Risiko", R ? ({ LOW: "gering", MEDIUM: "mittel", HIGH: "hoch" }[R.risk] || R.risk) : "–", R ? R.relabelsLast26 + " Wechsel in 26 Schritten" : null, R && R.risk === "HIGH" ? "warn" : null),
        R && isNum(R.stableFor) ? proTile("Stabil seit", R.stableFor + " Schritten", isNum(R.resetsLast26) ? R.resetsLast26 + " Neustarts in 26 Schritten" : null) : null,
        d ? proTile("Erkennungsverzug", d.barsToEngine + (d.barsToEngine === 1 ? " Bar" : " Bars"), "Welle " + d.wave + " · frühestens nach " + (isNum(d.barsToEarliest) ? d.barsToEarliest : "–")) : null,
        d && isNum(d.moveAtEngineConfirmPct) ? proTile("Kursweg bis Bestätigung", dec(d.moveAtEngineConfirmPct * 100, 1) + " %", "ab Wellenende " + X.dateDe(d.waveEndTime)) : null
      ]),
        hist.length ? el("ol", { class: "cb-timeline" }, hist.slice().reverse().map(function (h) { return el("li", {}, [el("span", { class: "cb-tl-d num", text: X.dateDe(h.d) }), el("span", { class: "cb-tl-t" }, [el("b", { text: h.to || "keine Zählung" }), el("span", { text: h.why })])]); }))
          : el("p", { class: "cb-small", text: "Keine Zählungswechsel im betrachteten Zeitraum." })];
    }

    // ---- Evidenz
    function buildEvidence() {
      return [el("div", { class: "cb-ev-head" }, [el("span", { class: "cb-badge cb-badge-" + String(ev ? ev.level : "not_established").toLowerCase(), text: ev ? ev.label : "Nicht belegt" }), el("span", { class: "cb-badge cb-badge-experimental", text: ev && ev.methodStatus ? ev.methodStatus.label : "Experimentell" })]),
        el("p", { class: "cb-ev-text", text: ev ? ev.consumer : "Für Elliott-Zählungen ist kein historischer Prognosevorteil belegt." }),
        ev && ev.pro ? kv([["Befund (Profi)", ev.pro], ev.methodStatus && ev.methodStatus.note ? ["Methodenstatus", ev.methodStatus.note] : null]) : null,
        el("p", { class: "cb-small cb-dim", text: "Die Zählung beschreibt Struktur. Sie ist keine Vorhersage und kein Signal." }),
        el("p", {}, [X.link("Methodik und Validierung →", X.routes.method("chartbild"))])];
    }

    // ---- Quellen
    function buildSources() {
      var items = RA ? RA.rules.map(function (x) { return [markOf(x.passed)[0], x.statement || x.id, RCLS[x.class] || x.class, ((x.source || "–") + " " + (x.locator || "")).trim()]; })
        .concat(RA.guidelines.items.map(function (x) { return [x.matched ? "✓" : "○", (x.statement || x.id) + " (" + dec(x.value) + ")", "Richtlinie", ((x.source || "–") + " " + (x.locator || "")).trim()]; }))
        : (c.rules || []).map(function (r) { var cat = (rules && rules[r.id]) || {}; return [markOf(r.passed)[0], cat.statement || r.id, r.cls === "HARD" ? "harte Regel" : "Definition", cat.source || "–"]; });
      return [el("ul", { class: "cb-src" }, items.map(function (x) { return el("li", {}, [el("span", { class: "cb-src-m", "aria-hidden": "true", text: x[0] }), el("span", {}, [el("b", { text: x[1] }), el("small", { text: x[2] + " · " + x[3] })])]); })),
        el("p", { class: "cb-small cb-dim", text: (RA && RA.verification ? "Fundstellen: " + RA.verification + ". " : "") + "Quellen: EWP = Frost & Prechter, Elliott Wave Principle; EWI = Gorman & Kennedy, Visual Guide; VU = Vision-Universe-Festlegung (keine Elliott-Regel)." }),
        kv([["Regelwerk", E.ruleSetVersion || "–"], ["Engine", E.engineVersion || "–"]])];
    }

    var nRules = RA ? RA.rules.length + RA.guidelines.items.length : (c.rules || []).length;
    var tabs = tabset("Elliott-Details", [
      { label: "Regeln", count: nRules, build: buildRules },
      { label: "Alternativen", count: alts.length, build: buildAlts },
      { label: "Grad & Kontext", build: buildDegree },
      { label: "Historie", count: hist.length, build: buildHistory },
      { label: "Evidenz", build: buildEvidence },
      { label: "Quellen", build: buildSources }
    ], 0);
    return el("section", { class: "qx-card cb-ew-panel cb-ewp", "aria-label": "Elliott-Wellen (Profi)" }, [
      el("div", { class: "cb-ewp-head" }, [el("h3", { class: "cb-ewp-title", text: "Elliott-Wellen" }), el("span", { class: "cb-badge cb-badge-experimental", text: "Experimentell" })]),
      overview, tabs]);
  }

  /** Kompakte Verfahrenskarte: Ueberschrift, 2–4 Kennzahlen, Details aufklappbar. */
  function proCard(title, kpis, note, detail) {
    return el("article", { class: "cb-pc" }, [el("h3", { class: "cb-pc-h", text: title }),
      el("div", { class: "cb-pc-kpis" }, kpis.filter(Boolean).map(function (k) { return el("div", { class: "cb-pc-kpi" }, [el("span", { class: "cb-pc-k", text: k[0] }), el("strong", { class: "num" + (k[2] ? " cb-tone-" + k[2] : ""), text: k[1] })]); })),
      note ? el("p", { class: "cb-pc-note", text: note }) : null, detail ? X.more("Details", detail) : null]);
  }
  function proView(a, rules, methodEv) {
    var P = a.pro, cards = [];
    var tState = function (x) { return x ? dirArrow(x.state) + " " + (x.state === "UP" ? "steigend" : x.state === "DOWN" ? "fallend" : x.state === "MIXED" ? "gemischt" : "unbestimmt") : "–"; };
    var tTone = function (x) { return x && x.state === "UP" ? "up" : x && x.state === "DOWN" ? "down" : null; };
    var t = P.trend, PHASE = { TREND_ADVANCING: "Trend schreitet voran", SECONDARY_REACTION: "Gegenbewegung zum übergeordneten Trend", PULLBACK: "Rücksetzer", NO_PRIMARY_TREND: "kein übergeordneter Trend" };
    cards.push(proCard("Hochs, Tiefs und Trend", [["Übergeordnet", tState(t.primary), tTone(t.primary)], ["Mittelfristig", tState(t.secondary), tTone(t.secondary)], ["Kurzfristig", tState(t.shortTerm), tTone(t.shortTerm)]],
      (PHASE[t.phase] || t.phase) + (t.stage && t.stage.stage ? " · Weinstein-Stufe " + t.stage.stage : ""), function () {
        var lv = function (name, x) { return x && x.flipLevel ? [name + " kippt bei", "Schluss " + (x.state === "UP" ? "unter " : "über ") + fmt(x.flipLevel)] : null; };
        return [kv([lv("Übergeordnet", t.primary), lv("Mittelfristig", t.secondary), lv("Kurzfristig", t.shortTerm)]), el("p", { class: "cb-small cb-dim", text: t.source })];
      }));
    var SR = P.supportResistance, res = SR.resistances || [], sup = SR.supports || [];
    var zli = function (x) { return el("li", {}, [el("b", { class: "num", text: zoneText(x) }), el("span", { text: " · " + x.touches + " Berührungen · Stärke " + x.strength })]); };
    cards.push(proCard("Unterstützungen und Widerstände", [["Nächster Widerstand", res[0] ? zoneText(res[0]) : "–"], ["Nächste Unterstützung", sup[0] ? zoneText(sup[0]) : "–"], ["Zonen oben / unten", res.length + " / " + sup.length]], null, function () {
      return [el("h4", { text: "Widerstände" }), el("ul", { class: "cb-list" }, res.map(zli)), el("h4", { text: "Unterstützungen" }), el("ul", { class: "cb-list" }, sup.map(zli))];
    }));
    var cl = (P.fibonacci && P.fibonacci.clusters) || [], best = cl.slice().sort(function (x, y) { return (y.anchors || 0) - (x.anchors || 0); })[0];
    cards.push(proCard("Fibonacci-Konfluenz", [["Cluster", String(cl.length)], ["Stärkster Cluster", best ? zoneText(best) : "–"], ["Anker im stärksten", best ? String(best.anchors) : "–"]], "Zählt nur, wo mehrere Anker zusammenfallen.", function () {
      return [el("ul", { class: "cb-list" }, cl.map(function (x) { return el("li", {}, [el("b", { class: "num", text: zoneText(x) }), el("span", { text: " · " + x.anchors + " Anker" })]); })),
        el("p", { class: "cb-small cb-dim", text: "Hinweis: In der VU-Studie (über 300.000 Gegenbewegungen) enden Rückläufe an 38,2/50/61,8 % nicht häufiger als knapp daneben. Fibonacci zählt deshalb nur als Konfluenz mehrerer Anker." })];
    }));
    var m = P.momentum, v = P.volatility, vo = P.volume;
    var MS = { POSITIVE: "positiv", NEGATIVE: "negativ", NEUTRAL: "neutral", UNDETERMINED: "unbestimmt" }, VR = { COMPRESSED: "ruhig", NORMAL: "normal", ELEVATED: "erhöht", EXTREME: "extrem", UNDETERMINED: "unbestimmt" };
    cards.push(proCard("Bewegungsstärke, Schwankung, Volumen", [
      ["Momentum", (m.state === "POSITIVE" ? "↗ " : m.state === "NEGATIVE" ? "↘ " : "") + (MS[m.state] || "–"), m.state === "POSITIVE" ? "up" : m.state === "NEGATIVE" ? "down" : null],
      ["RSI 14", isNum(m.rsi14) ? String(Math.round(m.rsi14)) : "–"], ["ATR", pct(v.atrPct) + " · " + (VR[v.regime] || "–")],
      ["Rel. Volumen", vo.status ? "nicht verfügbar" : fmt(vo.relativeVolume)]], m.divergence && (m.divergence.bearish || m.divergence.bullish) ? (m.divergence.bearish ? "Bärische Divergenz: neues Hoch bei schwächerem RSI" : "Bullische Divergenz: neues Tief bei stärkerem RSI") : null, function () {
      return [el("ul", { class: "cb-list" }, [
        el("li", { text: "Momentum: " + MS[m.state] + (m.dynamics ? " · " + ({ ACCELERATING: "beschleunigt", DECELERATING: "lässt nach", STEADY: "stetig" }[m.dynamics]) : "") + (isNum(m.rsi14) ? " · RSI 14: " + Math.round(m.rsi14) : "") }),
        m.divergence && m.divergence.bearish ? el("li", { text: "Bärische Divergenz: neues Hoch bei schwächerem RSI" }) : null,
        m.divergence && m.divergence.bullish ? el("li", { text: "Bullische Divergenz: neues Tief bei stärkerem RSI" }) : null,
        el("li", { text: "Schwankung (ATR): " + fmt(v.atr) + " (" + pct(v.atrPct) + " des Kurses) · Regime " + VR[v.regime] }),
        vo.status ? el("li", { text: "Volumen: nicht verfügbar (" + (vo.detail || "keine Daten") + ")" }) : el("li", { text: "Relatives Volumen " + fmt(vo.relativeVolume) + " · Volumen an steigenden/fallenden Tagen " + fmt(vo.upDownVolumeRatio) + " · " + ({ ACCUMULATION: "Akkumulation", DISTRIBUTION: "Distribution", BALANCED: "ausgeglichen" }[vo.accumulation] || "") }),
        vo.profile ? el("li", { text: "Volumenprofil (6 Monate, tagesbasiert): Schwerpunkt " + fmt(vo.profile.poc) + ", Wertbereich " + fmt(vo.profile.valueAreaLow) + "–" + fmt(vo.profile.valueAreaHigh) }) : null
      ].concat((vo.anchoredVwap || []).map(function (x) { return el("li", { text: "Anchored VWAP seit " + (x.anchor === "MAJOR_LOW" ? "großem Tief" : "großem Hoch") + " " + X.dateDe(x.anchorTime) + ": " + fmt(x.vwap) + (x.priceAbove ? " (Kurs darüber)" : " (Kurs darunter)") }); })))];
    }));
    var pats = P.patterns.patterns || [], w = P.wyckoff;
    var PST = { FORMING: "in Bildung", BREAKOUT: "Ausbruch", BREAKOUT_RETEST: "Ausbruch mit Rücktest", FAILED: "gescheitert", FAILED_BREAKOUT: "Fehlausbruch" };
    var WS = { ACCUMULATION: "Akkumulation", DISTRIBUTION: "Distribution", REACCUMULATION_OR_ACCUMULATION: "Akkumulation oder Re-Akkumulation", REDISTRIBUTION_OR_DISTRIBUTION: "Distribution oder Re-Distribution", UNDETERMINED: "offen" };
    cards.push(proCard("Chartformationen und Wyckoff", [["Aktive Formationen", String(pats.length)], pats[0] ? ["Formation", pats[0].name + " · " + (PST[pats[0].status] || pats[0].status)] : null,
      ["Wyckoff", w.status === "TRADING_RANGE" ? "Spanne · Phase " + w.phase : "keine Spanne"]], "Wyckoff ist beschreibend und fließt nicht in die Richtung ein.", function () {
      return [pats.length ? el("ul", { class: "cb-list" }, pats.map(function (p) { return el("li", {}, [el("b", { text: p.name }), el("span", { text: " · " + (PST[p.status] || p.status) + (p.breakoutLevel ? " · Ausbruchsniveau " + fmt(p.breakoutLevel) : "") + " · Formationsziel " + zoneText(p.target) })]); })) : el("p", { class: "cb-small", text: "Keine aktive Formation." }),
        w.status === "TRADING_RANGE" ? el("p", { class: "cb-small", text: "Wyckoff: Spanne " + fmt(w.range.support) + "–" + fmt(w.range.resistance) + " · " + (WS[w.schematic] || w.schematic) + " · Phase " + w.phase + " · Ereignisse: " + (w.events || []).map(function (e) { return e.event; }).join(", ") }) : el("p", { class: "cb-small", text: "Wyckoff: keine Handelsspanne erkannt." }),
        el("p", { class: "cb-small cb-dim", text: "Wyckoff ist beschreibend und fließt nicht in die Richtung ein (keine belastbare Evidenz; in der VU-Studie lag die Richtungstrefferquote unter 50 %)." })];
    }));
    var cf = a.confluence;
    cards.push(proCard("Konfluenz und Methodik", [["Einigkeit", (cf.agreement > 0 ? "+" : "") + dec(cf.agreement, 2), cf.agreement > 0.1 ? "up" : cf.agreement < -0.1 ? "down" : null], ["Abdeckung", pct(cf.coverage)], ["Verfahren", String(cf.families.length)]],
      "Gewichtete Richtung der Verfahren; Wyckoff ohne Stimmgewicht.", function () {
      return [el("div", { class: "cb-table-wrap", tabindex: "0", role: "region", "aria-label": "Tabelle, waagrecht scrollbar" }, [el("table", { class: "cb-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Verfahren" }), el("th", { text: "Richtung" }), el("th", { text: "Gewicht" })])]),
        el("tbody", {}, cf.families.map(function (f) { return el("tr", {}, [el("td", { text: (Ex && Ex.FAMILY[f.family]) || f.family }), el("td", { class: "num", text: (f.direction > 0 ? "+" : "") + f.direction.toFixed(2).replace(".", ",") }), el("td", { class: "num", text: f.weight.toFixed(2).replace(".", ",") })]); }))])]),
        el("p", { class: "cb-small", text: "Einigkeit (gewichtete Richtung): " + (cf.agreement > 0 ? "+" : "") + String(cf.agreement).replace(".", ",") + " · Abdeckung " + pct(cf.coverage) + ". Gewichte aus Evidenzgraden der Literatur; Wyckoff ohne Stimmgewicht." }),
        el("p", { class: "cb-small cb-dim", text: "Alle Werte aus Daten bis " + X.dateDe(a.asOf) + "; nur bestätigte Swings; dieselbe Rechnung wie im Backtest. Methodik: quant/methodology/technical-intelligence-v2.json · Elliott " + ((a.versions && a.versions.elliott) || (a.pro.elliott && a.pro.elliott.engineVersion) || "–") + " · Regelwerk " + ((a.versions && a.versions.ruleSet) || (a.pro.elliott && a.pro.elliott.ruleSetVersion) || "–") + " · Datenstand " + X.dateDe((a.versions && a.versions.dataAsOf) || a.asOf) + "." }),
        el("p", {}, [X.link("Methodik und Quellen →", X.routes.method("chartbild"))])];
    }));
    return [el("h2", { class: "cb-pro-title", text: "Profi-Ansicht" }), elliottPro(a, rules, methodEv), projectionPro(a),
      el("h3", { class: "cb-pro-sub", text: "Weitere Verfahren auf einen Blick" }), el("div", { class: "cb-pro-grid" }, cards)];
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
  /** Szenario zuerst in Alltagssprache (§61): Titel aus Richtung, Vorlage und Rolle; "Hauptszenario/Alternative" nur als Zweitlabel,
      Wellen-Fachsprache erst darunter. Die Alternative gegen die Richtung des Hauptszenarios ist eine Trendwende. */
  function scenarioTitle(s, primary) {
    if (!s) return "";
    var up = s.direction === "BULLISH", down = s.direction === "BEARISH";
    if (s.template === "RANGE" || s.range || (!up && !down)) return "Seitwärtsphase hält an";
    if (s.kind === "ALTERNATIVE" && primary && primary !== s && (primary.direction === "BULLISH" || primary.direction === "BEARISH") && primary.direction !== s.direction) return "Größere Trendwende";
    return ({
      CONTINUATION: up ? "Aufwärtstrend setzt sich fort" : "Abwärtstrend setzt sich fort",
      PULLBACK: up ? "Rücksetzer, dann weiter aufwärts" : "Erholung, dann weiter abwärts",
      BREAKOUT_RETEST: up ? "Ausbruch nach oben hält" : "Ausbruch nach unten hält",
      DEEPER_CORRECTION: up ? "Tiefere Korrektur" : "Stärkere Erholung",
      EXTENDED_MOVE: up ? "Ausgedehnter Anstieg" : "Ausgedehnter Rückgang"
    })[s.template] || (up ? "Bewegung aufwärts" : "Bewegung abwärts");
  }
  function scenarioRole(s) { return [el("span", { text: (KIND[s.kind] || s.kind) + " " }), el("span", { "aria-hidden": "true", text: dirArrow(s.direction) }), el("span", { class: "cb-switch-dw", text: " " + dirWord(s.direction) })]; }

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
    var a = res.analysis;
    /* Red-Team 2 C1: unveraenderter Schlusskurs ueber mehrere Bars (Uebernahme, Delisting, Aussetzung) – kein Chartbild. */
    if (a.dataQuality && a.dataQuality.stalePriceBars) {
      host.append(el("p", { class: "v2-eyebrow", text: "Chartbild · " + ticker }), el("h1", { class: "qx-h1", text: "Für " + ticker + " gibt es kein aktuelles Chartbild" }),
        X.notice("Warum?", "Der Schlusskurs ist seit " + a.dataQuality.stalePriceBars + (a.timeframe === "1W" ? " Wochen" : " Handelstagen") + " unverändert – etwa nach einer Übernahme, einem Delisting oder einer Handelsaussetzung. Für eine solche Kursreihe gibt es keine Szenarien."),
        el("div", { class: "qx-actions" }, [X.btn("Zur Aktienanalyse", X.routes.stock(ticker), "secondary")]));
      return;
    }
    var rules = (await TI.getRulesCatalog()).rules, methodEv = await (TI.getMethodEvidence ? TI.getMethodEvidence() : Promise.resolve(null));
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
      var role = { PRIMARY: "die derzeit bevorzugte Lesart", ALTERNATIVE: "die Alternative zur bevorzugten Lesart", TAIL: "ein Randszenario" }[s.kind] || "";
      var cond = s.invalidation && !(s.kind === "PRIMARY" && scenarioOf("ALTERNATIVE")) ? " Die Lesart gilt, solange kein Schlusskurs " + (s.invalidation.direction === "below" ? "unter " : "über ") + fmt(s.invalidation.price) + " liegt." : "";
      return scenarioTitle(s, scenarioOf("PRIMARY")) + (role ? " – " + role : "") + "." + cond + (s.note ? " " + s.note + "." : "") + " Fachlich: " + String(t).split(" —")[0] + ".";
    }
    function selectKind(k) {
      kind = k;
      tabs.querySelectorAll("button").forEach(function (b) { var on = b.dataset.kind === k; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
      scText.textContent = scenarioSentence(scenarioOf(k));
      fillLevels(scenarioOf(k)); draw();
    }
    kinds.forEach(function (k) {
      var sk = scenarioOf(k);
      var b = el("button", { type: "button", role: "tab", class: "cb-switch-btn", dataset: { kind: k }, "aria-label": sk ? scenarioTitle(sk, scenarioOf("PRIMARY")) + " – " + (KIND[k] || k) + ", " + dirWord(sk.direction) : null }, [el("span", { class: "cb-switch-t", text: scenarioTitle(sk, scenarioOf("PRIMARY")) }),
        el("small", { class: "cb-switch-k" }, sk ? scenarioRole(sk) : [KIND[k] || k])]);
      b.addEventListener("click", function () { selectKind(k); });
      b.addEventListener("keydown", function (e) {
        var i = kinds.indexOf(kind), n = kinds.length, j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
        if (j < 0) return;
        e.preventDefault(); selectKind(kinds[j]); var nb = tabs.querySelector('[data-kind="' + kinds[j] + '"]'); if (nb) nb.focus();
      });
      tabs.append(b);
    });

    // ---------------------------------------------- Schluessel-Kacheln
    /* Barrierefreiheit: eine Liste nur mit Eintraegen (axe aria-required-children; jede Kachel ist ein listitem).
       Am Handy scrollt die Reihe waagrecht und muss deshalb per Tastatur erreichbar sein (scrollable-region-focusable). */
    var levels = el("div", { class: "cb-levels", tabindex: "0", "aria-label": "Schlüsselniveaus des Szenarios" });
    function fillLevels(s) {
      fillLevelTiles(s);
      if (levels.childElementCount) levels.setAttribute("role", "list"); else levels.removeAttribute("role");
    }
    function fillLevelTiles(s) {
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
    /* Elliott-Projektion als eigene Chart-Ebene (Szenario | Projektion), Preisachse logarithmisch bei großer Spanne */
    var pjSel = pickProjection(a, view === "pro"), lens = "scenario", pjWhich = "primary", pjLog = null;
    function pjThesis() { var p = pjSel && pjSel.p; if (!p) return null; if (pjWhich === "motive") return pjSel.motive || null;
      if (!p.consumerVisible && view !== "pro") return pjSel.motive || null; return pjWhich === "alt" ? pjAlt(p) : p.primary || p.alternative || pjSel.motive; }
    function pjAutoLog(t) { if (!t || !t.zones.length) return false; var hi = Math.max.apply(null, t.zones.map(function (z) { return z.high; }).concat(a.chart.close)), lo = Math.min.apply(null, t.zones.map(function (z) { return z.low; }).concat(a.chart.close.slice(-260))); return lo > 0 && hi / lo > 4; }
    function barsFor() { var r = ranges.filter(function (x) { return x[0] === range; })[0]; return r ? r[2] : 126; }
    function waveMarks() {
      if (replayStep) return replayStep.ew && !replayStep.ew.ab ? replayStep.ew.waves.map(function (w) { return { label: w[2], time: w[0], price: w[1], status: w[3] ? "DEVELOPING" : "CONFIRMED" }; }) : [];
      /* Projektions-Ebene mit These des hoeheren Grades: dessen Wellen (1)…(4) statt der Hauptgrad-Zaehlung */
      var pt = lens === "projection" ? pjThesis() : null;
      if (pt && (pt.degree === "HIGHER" || pt.source === "MOTIVE_ALTERNATIVE") && pt.anchorWaves) return pt.anchorWaves.map(function (w) { return { label: w.label, display: pt.degree === "HIGHER" ? "(" + w.label + ")" : w.label, time: w.toTime, price: w.toPrice, fromPrice: w.fromPrice, status: w.status }; });
      var ov = a.overlays && a.overlays.waves;
      if (!ov || !ov.primary.length || (!ov.consumerVisible && view !== "pro")) return [];
      var list = waveSet === "alt" && ov.alternative && ov.alternative.length ? ov.alternative : ov.primary;
      return list.map(function (w) { return { label: w.label, display: view === "pro" ? w.notation : w.label, time: w.time, price: w.price, fromPrice: w.fromPrice, status: w.status }; });
    }
    function draw() {
      var width = Math.max(300, Math.min(1100, chartHost.clientWidth || main.clientWidth - 24));
      pjSel = pickProjection(a, view === "pro");
      var pjT = !replayStep && lens === "projection" ? pjThesis() : null, pjOnChart = !!(pjT && pjT.zones);
      if (lensSeg) lensSeg.hidden = !pjSel || !(pjSel.p.primary || pjSel.p.alternative || pjSel.motive) || (!pjSel.p.consumerVisible && !pjSel.motive && view !== "pro");
      if (logSeg) logSeg.hidden = !pjOnChart;
      /* Ebene nicht (mehr) verfuegbar (z. B. Wechsel von Profi zu Einfach bei zurueckgehaltener These) → zurueck zum Szenario */
      if (lens === "projection" && lensSeg && lensSeg.hidden) { lens = "scenario"; lensSeg.querySelectorAll("button").forEach(function (b, q) { b.setAttribute("aria-pressed", q === 0 ? "true" : "false"); }); }
      pjLegend.hidden = !pjOnChart; motiveNote.hidden = !(pjOnChart && pjT.source === "MOTIVE_ALTERNATIVE");
      if (waveSeg) waveSeg.querySelectorAll("button").forEach(function (b, q) { b.setAttribute("aria-pressed", (q === 1) === !!wavesOn ? "true" : "false"); }); var scLeg = chartCard && chartCard.querySelector(".cb-legend-sc"); if (scLeg) scLeg.hidden = pjOnChart;
      chartHost.replaceChildren(Chart.render({ chart: a.chart, overlays: replayStep ? overlaysFromStep(replayStep) : a.overlays, scenarioKind: replayStep ? "PRIMARY" : kind, scenario: scenarioOf(kind),
        projection: pjOnChart ? pjChart(pjT, pjT.source === "ALTERNATIVE" || pjT.source === "MOTIVE_ALTERNATIVE" ? "alt" : null) : null, logScale: pjOnChart ? (pjLog === null ? pjAutoLog(pjT) : pjLog) : false,
        cutoff: replayStep ? replayStep.d : null, showPath: !replayStep, uncertain: replayStep ? replayStep.cl === "AMBIGUOUS" : uncertain,
        waves: wavesOn ? waveMarks() : null, waveTone: !replayStep && (waveSet === "alt" || (pjOnChart && pjT.source === "MOTIVE_ALTERNATIVE")) ? "alt" : null, onWave: replayStep || waveSet === "alt" || (pjOnChart && (pjT.degree === "HIGHER" || pjT.source === "MOTIVE_ALTERNATIVE")) ? null : function (w) { waveInspector(a, w, rules, methodEv); },
        width: width, height: width < 520 ? 360 : 430, bars: barsFor(), mode: mode, title: ticker + " · Chartbild · " + tfLabel, labels: true }));
      if (replayStep) chartHost.prepend(el("p", { class: "cb-replay-flag", role: "status", text: "Zeitreise · Stand " + X.dateDe(replayStep.d) + " · nur damals verfügbare Daten" }));
      chartCard.classList.toggle("is-replay", !!replayStep);
    }
    var abstainNote = abstain ? el("p", { class: "cb-unclear" }, [el("b", { text: "Keine verlässliche Elliott-Zählung. " }), el("span", { text: "Die aktuelle Kursstruktur lässt keine verlässliche Elliott-Zählung zu – Vision Universe zeigt hier bewusst keine Hauptzählung." + (E.applicability.reasons && E.applicability.reasons.length ? " (" + E.applicability.reasons[0] + ")" : "") })]) : null;
    var motiveNote = el("p", { class: "cb-small", hidden: true, text: "Im Chart: Wellen der alternativen Lesart (mögliche Welle 3) – nicht die bevorzugte Zählung, niedrige Strukturklarheit." });
    var pjLegend = el("p", { class: "cb-legend cb-legend-pj", hidden: true }, [el("span", { class: "cb-key cb-key-pj-base", text: "Basis" }), el("span", { class: "cb-key cb-key-pj-extended", text: "Erweitert" }), el("span", { class: "cb-key cb-key-pj-extreme", text: "Extrem" }),
      el("span", { class: "cb-key cb-key-pj-conf", text: "Bestätigung" }), el("span", { class: "cb-key cb-key-invalid", text: "Ungültig (Schlusskurs)" }), el("span", { class: "cb-dim", text: "Projektion ≠ Wahrscheinlichkeit · keine Zeitangabe" })]);
    var lensSeg = segmented("Ebene", [["scenario", "Szenario"], ["projection", "Elliott-Projektion"]], lens, function (v) { if (v === "projection") showProjection(pjWhich, true); else { lens = v; draw(); } });
    var logSeg = segmented("Preisachse", [["lin", "Linear"], ["log", "Log"]], "lin", function (v) { pjLog = v === "log"; draw(); });
    function showProjection(which, stay) {
      pjWhich = which; lens = "projection"; if (which === "motive") wavesOn = true; lensSeg.querySelectorAll("button").forEach(function (b, q) { b.setAttribute("aria-pressed", q === 1 ? "true" : "false"); });
      var t = pjThesis(), lg = pjLog === null ? pjAutoLog(t) : pjLog; logSeg.querySelectorAll("button").forEach(function (b, q) { b.setAttribute("aria-pressed", (q === 1) === lg ? "true" : "false"); });
      draw(); if (!stay) chartCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    var waveSeg = E && E.primary ? segmented("Wellen", [["off", "Wellen aus"], ["on", "Wellen an"]], wavesOn ? "on" : "off", function (v) { wavesOn = v === "on"; draw(); }) : null;
    var controls = el("div", { class: "cb-controls" }, [lensSeg, logSeg,
      segmented("Zeitraum", ranges.map(function (x) { return [x[0], x[1]]; }), range, function (v) { range = v; draw(); }),
      a.chart.closeOnly ? null : segmented("Darstellung", [["line", "Linie"], ["candles", "Kerzen"]], mode, function (v) { mode = v; draw(); }),
      waveSeg
    ]);
    var chartCard = el("section", { class: "cb-chart-card", "aria-label": "Chart" }, [controls, chartHost,
      pjLegend, motiveNote,
      el("p", { class: "cb-legend cb-legend-sc" }, [el("span", { class: "cb-key cb-key-entry", text: "Schlüsselzone" }), el("span", { class: "cb-key cb-key-target", text: "Zielbereich" }), el("span", { class: "cb-key cb-key-invalid", text: "Ungültig (Schlusskurs)" }), el("span", { class: "cb-key cb-key-path", text: "Szenario-Korridor – keine Zeitangabe" })]),
      el("p", { class: "cb-lead cb-lead-m", text: a.explain.summary }),
      abstainNote,
      el("p", { class: "cb-small cb-dim", text: wavesOn && !abstain && E && E.primary ? "Tipp: Eine Wellenmarke antippen erklärt die Welle." : "" }),
      a.chart.closeOnly ? el("p", { class: "cb-small cb-dim", text: "Wochenschlusskurse ohne Volumen: Kerzen und Volumenbefunde sind für diesen Titel nicht verfügbar." }) : null]);

    // ---------------------------------------------- Elliott-Struktur (Mission III §41–§47, §57, §98–§100)
    var ewCard = elliottConsumerCard(a, abstain, function (set) { waveSet = set; wavesOn = true; draw(); });
    var pjCard = projectionCard(a, showProjection);

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
      if (v === "pro" && !proHost.firstChild) proView(a, rules, methodEv).forEach(function (n) { if (n) proHost.append(n); });
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
    var order = { a: [hero, chartCard, levels, tabsBlock, textBlock, pjCard, ewCard], b: [hero, levels, chartCard, tabsBlock, textBlock, pjCard, ewCard], c: [hero, tabsBlock, textBlock, levels, chartCard, pjCard, ewCard], d: [hero, tabsBlock, chartCard, levels, textBlock, pjCard, ewCard] }[layout];
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
    if (p.invalidation) parts.push("Die derzeit bevorzugte Lesart (Hauptszenario) gilt, solange der Schlusskurs " + (p.invalidation.direction === "below" ? "über " : "unter ") + fmt(p.invalidation.price) + " bleibt.");
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

  // ================================================================ Elliott-Projektion (elliott-projection-1.0.0)
  /* Die Seite rechnet nicht: Zonen, Prozentwerte, Fahrplan und Lebenszyklus stehen im Shard (projection, projectionWeekly).
     Wochen zuerst: Die große These steht auf dem Wochenchart; die Tagesstruktur ist Detail und Timing (Kind der Woche).
     Projektion ≠ Wahrscheinlichkeit: Prozente sind Abstand vom Kurs, keine Trefferquote. */
  var PJ_TIER = { BASE: "Basis-Projektion", EXTENDED: "Erweiterte Projektion", EXTREME: "Extreme Projektion" };
  var PJ_STATUS = { DEVELOPING: "Im Aufbau · noch nicht bestätigt", CONFIRMED: "Strukturell bestätigt", EXHAUSTED: "Projektionszonen bereits erreicht", INVALID: "Ungültig" };
  var PJ_MARK = { MET: ["✓", "erfüllt", "ok"], OPEN: ["○", "offen", "open"], FAILED: ["✕", "verfehlt", "bad"], NA: ["–", "nicht verfügbar", "na"] };
  var PJ_CLASS = { HARD_RULE: "harte Regel", DEFINITION: "Definition", GUIDELINE: "Richtlinie", REVISION: "Wellenzuordnung", VU_OPERATIONAL: "VU-Festlegung", VU_CONFIRMATION: "VU-Bestätigung", PROJECTION_RELATIONSHIP: "Projektionsverhältnis" };
  function pctText(v) {
    if (!isNum(v)) return "–";
    var p = v * 100, a = Math.abs(p), r = a >= 100 ? 1 : a >= 10 ? 0.5 : 0.05;
    if (a < r) return "±0 %";
    var s = (p >= 0 ? "+" : "−") + (a >= 100 ? Math.round(a / (a >= 1000 ? 10 : 1)) * (a >= 1000 ? 10 : 1) : a >= 10 ? Math.round(a) : Math.round(a * 10) / 10).toLocaleString("de-DE");
    return s + " %";
  }
  function pjZone(z) { return fmt(z.display.low) + "–" + fmt(z.display.high); }
  function pjPct(z) { return pctText(z.pctLow) + " bis " + pctText(z.pctHigh); }
  /** Welche Projektion zeigt die Seite? Wochen-These zuerst, wenn sie für Kunden sichtbar ist. */
  function pickProjection(a, pro) {
    var w = a.projectionWeekly, d = a.projection;
    /* Hauptthese: Woche zuerst, sonst Tag (wie bisher). Motiv-Alternative unabhängig davon: Woche zuerst, sonst Tag. */
    var mo = w && w.motiveAlternative ? w : d && d.motiveAlternative ? d : null;
    var withMotive = function (x) { x.motive = mo ? mo.motiveAlternative : null; x.motiveP = mo; x.motiveTf = mo ? (mo === w ? "1W" : a.timeframe) : null; return x; };
    if (w && w.consumerVisible) return withMotive({ p: w, tf: "1W", other: d && d.consumerVisible ? d : null });
    if (d && (d.consumerVisible || pro)) return withMotive({ p: d, tf: a.timeframe, other: null });
    if (w && pro) return withMotive({ p: w, tf: "1W", other: null });
    if (mo) return withMotive({ p: mo, tf: mo === w ? "1W" : a.timeframe, other: null });
    return d || w ? withMotive({ p: d || w, tf: d ? a.timeframe : "1W", other: null }) : null;
  }
  /** These → Chart-Datenvertrag (die Chart-Komponente kennt keine Engine-Interna). */
  function pjChart(t, tone) {
    if (!t) return null;
    return { zones: t.zones.map(function (z) { return { tier: z.tier, low: z.low, high: z.high, dLow: z.display.low, dHigh: z.display.high, passed: z.state === "PASSED" }; }), invalidation: t.invalidation, confirmation: t.confirmation, direction: t.direction, tone: tone || null };
  }
  function pjAlt(p) { return p.highUpside && p.highUpside.zones ? p.highUpside : p.alternative; }
  /** Motiv-Alternative (Projection Engine 1.1.0, Produkt-Sichtbarkeit): beste regelkonforme Welle-3-Lesart aus dem Kandidatenpool der
      Engine – nie Hauptlesart, immer als Alternative mit niedriger Strukturklarheit beschriftet. */
  function motiveBlock(m, p, onChart) {
    var b = el("button", { type: "button", class: "cb-pj-btn cb-pj-btn-alt", text: "Alternative im Chart zeigen" }); b.addEventListener("click", function () { onChart("motive"); });
    return el("div", { class: "cb-pj-motive" + (m.highUpside ? " is-high" : "") }, [
      el("p", { class: "cb-pj-alt-k", text: m.highUpside ? "Alternative Lesart mit hohem Aufwärtspotenzial" : "Alternative Lesart" }),
      el("div", { class: "cb-pj-title" }, [el("h3", { class: "cb-pj-h", text: "Mögliche Welle 3 · " + (p.timeframe === "1W" ? "Woche" : "Tag") }), el("span", { class: "cb-pj-status cb-pj-st-" + m.status.toLowerCase(), text: PJ_STATUS[m.status] || m.status })]),
      el("p", { class: "cb-pj-sub", text: (m.patternName || "") + " · Richtung " + dirWord(m.direction) + " · Strukturklarheit: " + (m.clarity ? m.clarity.label : "Niedrig") + " · Experimentell" }),
      m.clarity ? el("p", { class: "cb-small", text: m.clarity.text }) : null,
      pjLadder(m, p.close),
      m.invalidation ? el("div", { class: "cb-pj-inv" }, [el("span", { class: "cb-pj-inv-k", text: m.invalidation.direction === "below" ? "Ungültig unter" : "Ungültig über" }), el("strong", { class: "num", text: m.invalidation.displayText || fmt(m.invalidation.price) }), el("span", { class: "cb-pj-inv-t", text: m.invalidation.text })]) : null,
      m.revision ? el("p", { class: "cb-small" }, [el("b", { text: "Neubewertung: " }), el("span", { text: "Schluss " + (m.revision.direction === "below" ? "unter " : "über ") + fmt(m.revision.price) + " – dann wäre die Vorwelle noch nicht beendet." })]) : null,
      m.confirmation ? el("p", { class: "cb-pj-conf" }, [el("b", { text: m.confirmation.passed ? "Bestätigt: " : "Bestätigung bei Schluss " + (m.direction === "DOWN" ? "unter " : "über ") + fmt(m.confirmation.price) + ": " }), el("span", { text: m.confirmation.statement })]) : null,
      el("div", { class: "qx-actions" }, [b]),
      el("p", { class: "cb-pj-road-h", text: "Was diese Lesart stärken würde" }),
      el("div", { class: "cb-pj-roads" }, [el("div", {}, [el("p", { class: "cb-pj-road-h", text: "Elliott-Anforderung" }), pjRoad(m.roadmap.elliott)]), el("div", {}, [el("p", { class: "cb-pj-road-h", text: "VU-Bestätigung (unabhängig)" }), pjRoad(m.roadmap.vu)])]),
      el("p", { class: "cb-small cb-dim", text: "Nicht die bevorzugte Zählung. Vision Universe zeigt sie, weil die Engine sie regelkonform gefunden hat – nicht, weil sie wahrscheinlicher wäre." })
    ]);
  }
  function pjLadder(t, close) {
    return el("ol", { class: "cb-pj-ladder", "aria-label": "Projektionsleiter" }, t.zones.map(function (z) {
      var st = z.state === "PASSED" ? "bereits erreicht" : z.state === "INSIDE" ? "Kurs in der Zone" : null;
      return el("li", { class: "cb-pj-tier cb-pj-" + z.tier.toLowerCase() + (z.state === "PASSED" ? " is-passed" : "") }, [
        el("span", { class: "cb-pj-tier-k", text: PJ_TIER[z.tier] }),
        el("strong", { class: "cb-pj-tier-v num", text: pjZone(z) }),
        el("span", { class: "cb-pj-tier-p num", text: pjPct(z) }),
        st ? el("span", { class: "cb-pj-chip", text: st }) : null
      ]);
    }).concat(t.zones.length < 3 ? [el("li", { class: "cb-pj-tier is-omitted" }, [el("span", { class: "cb-pj-tier-k", text: "Nicht ausgewiesen" }), el("span", { class: "cb-pj-tier-p", text: omittedText(t) })])] : []));
  }
  /** Entfallene Stufen, gleiche Begruendungen zusammengefasst. */
  function omittedText(t) {
    var by = {};
    (t.omittedTiers || []).filter(function (o) { return t.zones.every(function (z) { return z.tier !== o.tier; }); }).forEach(function (o) { (by[o.text] = by[o.text] || []).push(PJ_TIER[o.tier]); });
    return Object.keys(by).map(function (k) { return by[k].join(" und ") + ": " + k; }).join(" · ");
  }
  function pjRoad(list) {
    return el("ul", { class: "cb-pj-road" }, list.map(function (x) {
      var m = PJ_MARK[x.state] || PJ_MARK.OPEN;
      return el("li", { class: "cb-pj-road-" + m[2] }, [el("span", { class: "cb-pj-road-m", "aria-hidden": "true", text: m[0] }), el("span", {}, [el("span", { text: x.text }), el("small", { class: "cb-pj-road-c", text: " · " + (PJ_CLASS[x.class] || x.class) }), el("span", { class: "cb-sr", text: " (" + m[1] + ")" })])]);
    }));
  }
  function pjContext(p, t) {
    var c = p.context; if (!c) return null;
    var ms = t.roadmap && t.roadmap.structure;
    var tone = function (ok, bad) { return ok ? "up" : bad ? "down" : null; };
    var s = t.direction === "UP" ? 1 : -1;
    return el("div", { class: "cb-pj-ctx", role: "group", "aria-label": "Unabhängige Bestätigungen" }, [
      proTile("Trend", c.trend.label, c.trend.detail, tone(c.trend.state === (s > 0 ? "POSITIVE" : "NEGATIVE"), c.trend.state === (s > 0 ? "NEGATIVE" : "POSITIVE"))),
      proTile("Relative Stärke", c.rs.label, c.rs.detail, tone(c.rs.state === (s > 0 ? "TOP20" : "BOTTOM20"), c.rs.state === (s > 0 ? "BOTTOM20" : "TOP20"))),
      proTile("Marktstruktur", ms ? ms.label : "–", c.structure.detail, tone(ms && ms.state === "CONFIRMED", ms && ms.state === "CONFLICTING"))
    ]);
  }
  /** Konsumenten-Karte: These in Sekunden verstehen (Leiter, Ungültig, nächste Schritte, Bestätigungen, Alternative, Evidenz). */
  function projectionCard(a, onChart) {
    var sel = pickProjection(a, false); if (!sel) return null;
    var p = sel.p, t = p.consumerVisible ? p.primary || p.alternative : null, tfName = sel.tf === "1W" ? "Wochenchart" : "Tageschart", m = sel.motive;
    var head = el("div", { class: "cb-ew-head" }, [el("span", { class: "cb-ew-k", text: "Elliott-Projektion · " + tfName }), el("span", { class: "cb-badge cb-badge-experimental", text: "Experimentelles Strukturmodell" })]);
    if (!t) {
      var why = p.status === "DATA_INVALID" ? p.reason : p.status === "ABSTAIN" ? "Ohne verlässliche Zählung zeigt Vision Universe keine Hauptprojektion." : p.reason || "Die aktuelle Zählung liefert keine Hauptprojektion.";
      if (!m) return el("section", { class: "cb-ew-card cb-pj is-empty", id: "projektion", "aria-label": "Elliott-Projektion" }, [head, el("p", { class: "cb-ew-main", text: "Keine Elliott-Projektion" }), el("p", { class: "cb-ew-sub", text: why })]);
      return el("section", { class: "cb-ew-card cb-pj", id: "projektion", "aria-label": "Elliott-Projektion" }, [head, el("p", { class: "cb-ew-main", text: p.status === "ABSTAIN" ? "Keine verlässliche Hauptzählung" : "Keine Hauptprojektion" }), el("p", { class: "cb-ew-sub", text: why }),
        el("div", { class: "cb-pj-now" }, [el("span", { text: "Aktueller Kurs" }), el("strong", { class: "num", text: fmt(p.close) }), el("small", { text: "Stand " + X.dateDe(p.asOf) })]),
        motiveBlock(m, sel.motiveP, onChart), pjContext(sel.motiveP, m),
        el("div", { class: "cb-pj-ev" }, [el("span", { class: "cb-layer-k", text: "Historische Evidenz" }), el("b", { text: p.evidence.label }), el("span", { class: "cb-small", text: p.evidence.text })]),
        m.lifecycle ? el("p", { class: "cb-small cb-dim", text: "These seit " + X.dateDe(m.lifecycle.createdAt) + " · Revision " + m.lifecycle.rev + " · " + m.lifecycle.stateLabel + ". Zonen werden nachträglich nicht verschoben." }) : null,
        el("p", { class: "cb-small cb-dim", text: p.disclaimer })]);
    }
    var lc = t.lifecycle, alt = pjAlt(p), kids = [head,
      el("div", { class: "cb-pj-title" }, [el("h2", { class: "cb-pj-h", text: t.label }), el("span", { class: "cb-pj-status cb-pj-st-" + t.status.toLowerCase(), text: PJ_STATUS[t.status] || t.status })]),
      el("p", { class: "cb-pj-sub", text: (t.source === "HIGHER_DEGREE" ? "Höherer Grad: " : "") + (t.patternName || "") + " · Richtung " + dirWord(t.direction) + " · Hauptlesart (derzeit bevorzugt, nicht „die richtige Zählung“)" }),
      el("div", { class: "cb-pj-now" }, [el("span", { text: "Aktueller Kurs" }), el("strong", { class: "num", text: fmt(p.close) }), el("small", { text: "Stand " + X.dateDe(p.asOf) })]),
      pjLadder(t, p.close),
      t.invalidation ? el("div", { class: "cb-pj-inv" }, [el("span", { class: "cb-pj-inv-k", text: t.invalidation.direction === "below" ? "Ungültig unter" : "Ungültig über" }), el("strong", { class: "num", text: t.invalidation.displayText || fmt(t.invalidation.price) }), el("span", { class: "cb-pj-inv-t", text: t.invalidation.text })]) : null,
      t.confirmation ? el("p", { class: "cb-pj-conf" }, [el("b", { text: t.confirmation.passed ? "Bestätigt: " : "Bestätigung bei Schluss " + (t.direction === "DOWN" ? "unter " : "über ") + fmt(t.confirmation.price) + ": " }), el("span", { text: t.confirmation.statement })]) : null,
      el("div", { class: "qx-actions" }, [(function () { var b = el("button", { type: "button", class: "cb-pj-btn", text: "Projektion im Chart zeigen" }); b.addEventListener("click", function () { onChart("primary"); }); return b; })()]),
      el("h3", { class: "cb-pj-h3", text: "Was als Nächstes passieren muss" }),
      el("div", { class: "cb-pj-roads" }, [el("div", {}, [el("p", { class: "cb-pj-road-h", text: "Elliott-Anforderung" }), pjRoad(t.roadmap.elliott)]), el("div", {}, [el("p", { class: "cb-pj-road-h", text: "VU-Bestätigung (unabhängig)" }), pjRoad(t.roadmap.vu)])]),
      el("p", { class: "cb-small cb-dim", text: t.roadmap.note }),
      pjContext(p, t)];
    if (alt) {
      var hu = !!alt.highUpside, lo = alt.zones[0], hi = alt.zones[alt.zones.length - 1];
      var ab = el("button", { type: "button", class: "cb-pj-btn cb-pj-btn-alt", text: "Alternative im Chart zeigen" }); ab.addEventListener("click", function () { onChart("alt"); });
      kids.push(el("div", { class: "cb-pj-alt" + (hu ? " is-high" : "") }, [
        el("p", { class: "cb-pj-alt-k", text: hu ? "Alternative Lesart mit hohem Aufwärtspotenzial" : "Alternative Lesart" }),
        el("strong", { text: alt.label + (alt.patternName ? " · " + alt.patternName : "") }),
        el("p", { class: "num", text: "Zonen " + fmt(lo.display.low) + " bis " + fmt(hi.display.high) + " (" + pctText(lo.pctLow) + " bis " + pctText(hi.pctHigh) + ")" + (alt.invalidation ? " · ungültig " + (alt.invalidation.direction === "below" ? "unter " : "über ") + (alt.invalidation.displayText || fmt(alt.invalidation.price)) : "") }),
        hu ? el("p", { class: "cb-small", text: "Nicht die bevorzugte Zählung, geringe Klarheit. Die Engine hat diese Lesart regelkonform gefunden; sie wird nicht zur Hauptlesart erhoben." }) : null,
        el("div", { class: "qx-actions" }, [ab])]));
    }
    if (m) kids.push(motiveBlock(m, sel.motiveP, onChart));
    if (sel.other && sel.other.primary) kids.push(el("p", { class: "cb-small" }, [el("b", { text: "Tagesstruktur: " }), el("span", { text: sel.other.primary.label + " (" + PJ_STATUS[sel.other.primary.status] + "). Der Tageschart zeigt Detail und Timing innerhalb der Wochen-These – kein Widerspruch, sondern eine Ebene tiefer." })]));
    kids.push(el("div", { class: "cb-pj-ev" }, [el("span", { class: "cb-layer-k", text: "Historische Evidenz" }), el("b", { text: p.evidence.label }), el("span", { class: "cb-small", text: p.evidence.text })]));
    if (lc) kids.push(el("p", { class: "cb-small cb-dim", text: "These seit " + X.dateDe(lc.createdAt) + " · Revision " + lc.rev + " (eingefroren am " + X.dateDe(lc.frozenAt) + ") · " + lc.stateLabel + ". Zonen werden nachträglich nicht verschoben; ändert sich die Zählung, entsteht eine neue Revision." }));
    (p.guardrails && p.guardrails.flags || []).forEach(function (f) { kids.push(el("p", { class: "cb-small", text: "Hinweis: " + f.text })); });
    kids.push(el("p", { class: "cb-small cb-dim", text: p.disclaimer }));
    return el("section", { class: "cb-ew-card cb-pj", id: "projektion", "aria-label": "Elliott-Projektion" }, kids);
  }
  /** Fachansicht: Formel, Klasse, Quelle je Stufe; Anker, Grenzen, Deckel, Lebenszyklus — auch für zurückgehaltene Thesen. */
  function projectionPro(a) {
    var sel = pickProjection(a, true); if (!sel) return null;
    var p = sel.p, R = p.relations || {}, kids = [el("div", { class: "cb-ewp-head" }, [el("h3", { class: "cb-ewp-title", text: "Elliott-Projektion · Fachdetails" }), el("span", { class: "cb-badge cb-badge-experimental", text: p.version })])];
    var mot = sel.motive;
    if (!p.primary && !p.alternative && !mot) { kids.push(el("p", { class: "cb-small", text: p.reason || "Keine Projektion." })); return X.card(kids, "cb-ew-panel cb-ewp"); }
    if (!p.consumerVisible) kids.push(el("p", { class: "cb-unclear" }, [el("b", { text: "Nur Fachansicht. " }), el("span", { text: p.reason || "" })]));
    function block(t, title) {
      if (!t || !t.zones) return null;
      var rows = t.zones.map(function (z) { var r = R[z.relationId] || {}; return el("tr", {}, [el("td", { text: PJ_TIER[z.tier] }), el("td", { class: "num", text: fmt(z.low) + "–" + fmt(z.high) }), el("td", { text: r.formula || z.relationId }), el("td", { text: PJ_CLASS[r.class] || r.class || "–" }), el("td", { text: (r.source || "–") + " " + (r.locator || "") })]); });
      return el("div", { class: "cb-pj-pro" }, [el("h4", { class: "cb-pj-h4", text: title + ": " + t.label + " · " + (t.patternName || t.pattern) + (t.degree === "HIGHER" ? " (höherer Grad)" : "") }),
        kv([["Anker", fmt(t.anchor.price) + " · " + t.anchor.text + (t.anchor.time ? " (" + X.dateDe(t.anchor.time) + ")" : "")], ["Referenz", t.reference.label + " = " + fmt(t.reference.length) + (isNum(t.reference.net13) ? " · Strecke 1–3 = " + fmt(t.reference.net13) : "")],
            t.invalidation ? ["Invalidation", boundText(t.invalidation) + " · " + t.invalidation.ruleId + " (" + (t.invalidation.kind === "HARD_RULE" ? "harte Regel" : "Musterende/Zuordnung") + ")"] : null,
            t.revision ? ["Neuzuordnung", boundText(t.revision) + " · " + t.revision.ruleId] : null,
            t.confirmation ? ["Bestätigung", (t.direction === "DOWN" ? "unter " : "über ") + fmt(t.confirmation.price) + " · " + t.confirmation.ruleId + " (" + (PJ_CLASS[t.confirmation.class] || t.confirmation.class) + ")"] : null,
            t.cap ? ["Deckel", fmt(t.cap.price) + " · " + t.cap.ruleId] : null, t.truncation ? ["Truncation", t.truncation.statement] : null,
            ["Status", PJ_STATUS[t.status] || t.status], t.ruleValidity ? ["Regelprüfung der Zählung", t.ruleValidity === "VALID" ? "alle harten Regeln erfüllt" : t.ruleValidity] : null]),
        el("div", { class: "cb-table-wrap", tabindex: "0", role: "region", "aria-label": "Projektionsformeln" }, [el("table", { class: "cb-table" }, [el("thead", {}, [el("tr", {}, ["Stufe", "Zone", "Formel", "Klasse", "Quelle"].map(function (h) { return el("th", { text: h }); }))]), el("tbody", {}, rows)])]),
        (t.omittedTiers || []).length ? el("p", { class: "cb-small" }, [el("b", { text: "Nicht ausgewiesen: " }), el("span", { text: omittedText(t) })]) : null,
        (t.notes || []).length ? el("p", { class: "cb-small", text: t.notes.join(" ") }) : null,
        t.lifecycle ? X.more("Lebenszyklus (" + t.lifecycle.events.length + " Ereignisse)", function () { return el("ol", { class: "cb-list" }, t.lifecycle.events.map(function (e) { return el("li", { class: "num", text: X.dateDe(e.d) + " · " + (e.type.replace(/_/g, " ").toLowerCase()) + " · Revision " + e.rev + (isNum(e.close) ? " · Schluss " + fmt(e.close) : "") }); })); }) : null]);
    }
    kids.push(block(p.primary, "Hauptlesart"));
    if (p.primary && p.primary.subStructure) kids.push(el("p", { class: "cb-small" }, [el("b", { text: "Kurzfristige Struktur: " }), el("span", { text: p.primary.subStructure.label + " – " + p.primary.subStructure.zones.map(function (z) { return PJ_TIER[z.tier] + " " + pjZone(z); }).join(", ") })]));
    kids.push(block(p.alternative, "Alternative"));
    if (mot) {
      kids.push(block(mot, "Motiv-Alternative (Produkt-Sichtbarkeit" + (sel.motiveTf === "1W" ? ", Woche" : "") + ")"));
      kids.push(el("p", { class: "cb-small" }, [el("b", { text: "Herkunft: " }), el("span", { text: "Regelkonforme Lesart aus der Kandidatensuche der Engine (Rang " + (mot.pool.rank + 1) + " von " + mot.pool.size + "), nicht unter den zwei angezeigten Alternativen. Grammatik, Ranking und Enthaltung der Engine sind unverändert; geändert ist nur, dass diese Lesart sichtbar ist." })]));
    }
    if (p.highUpside && p.highUpside.zones) kids.push(block(p.highUpside, "Alternative mit hohem Aufwärtspotenzial"));
    kids.push(el("p", { class: "cb-small cb-dim", text: [p.presentation && p.presentation.zones, p.presentation && p.presentation.percent, p.presentation && p.presentation.rounding, "Klassen: harte Regel/Definition/Richtlinie = Elliott (Frost & Prechter); Projektionsverhältnis = Literatur; VU-Festlegung = eigene, offen gekennzeichnete Grenze; VU-Bestätigung = unabhängige Signale ohne Einfluss auf die Formel.", "Engine " + (p.engine.elliott || "–") + " · Regelwerk " + (p.engine.ruleSet || "–") + " · " + p.version].filter(Boolean).join(" ") }));
    return X.card(kids.filter(Boolean), "cb-ew-panel cb-ewp cb-pj-panel");
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
      el("div", { class: "cb-table-wrap", tabindex: "0", role: "region", "aria-label": "Tabelle, waagrecht scrollbar" }, [el("table", { class: "cb-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Methode" }), el("th", { text: "Evidenz" }), el("th", { text: "Rolle" }), el("th", { text: "In Worten" })])]),
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
