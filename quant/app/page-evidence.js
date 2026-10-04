/* =========================================================================
   VISION UNIVERSE QUANT — app/page-evidence.js
   Historische Evidenz auf Radar-Karten und Radar-Status der Aktienseite.

   Klein gehalten und getrennt von page-backtest.js (Diagramme, Seite), damit
   Startseite, Radar und Aktienseite nur laden, was sie zeigen. Jede
   Trefferquote erscheint mit ihrer Base Rate; beobachtet / getestet /
   zertifiziert ist sichtbar unterschieden.
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el, VM = global.VUQuantViewModel;
  var TRUST_WORD = { NOT_READY: "nicht bereit", LIMITED: "eingeschränkt", USABLE: "belastbar", ROBUST: "robust" };
  var REASON = {
    TOO_FEW_TITLES_OR_CASES: "Zu wenige Titel mit vollständiger Tageshistorie – die Stichprobe wächst mit jedem Pipeline-Lauf.",
    FACTOR_HISTORY_TOO_SHORT: "Die Faktorhistorie ist noch zu kurz.",
    MEMBERSHIP_AND_FACTOR_HISTORY_TOO_SHORT: "Historische Index-Zugehörigkeit und Faktorhistorie sind noch zu kurz.",
    PATTERN_MATCH_HISTORY_TOO_SHORT: "Die Musterhistorie hat gerade erst begonnen.",
    PATH_STATES_CLOSED: "Die Pfadzustände der Setup-Engine sind noch nicht freigeschaltet.",
    NOT_A_TRADABLE_EVENT: "Beschreibt die Datenlage, kein Kursereignis.",
    STUDY_NOT_PUBLISHED: "Die Studie ist nicht veröffentlicht.",
    TRUST_NOT_READY: "Die Vertrauensstufe reicht nicht.",
    HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING: "Die historische Index-Zugehörigkeit fehlt – das heutige Universum wird nie eingesetzt.",
    TOTAL_RETURN_SERIES_NOT_PUBLISHED: "Es gibt keine Gesamtrendite-Reihen (Dividenden fehlen).",
    TODAYS_UNIVERSE_ONLY: "Nur heute gelistete Aktien – später delistete fehlen.",
    MAIN_STUDY_SURVIVORS_ONLY: "Das Ergebnis stützt sich auf heute gelistete Aktien. Delistete Titel ab 2016 sind nur in einer Vergleichsrechnung enthalten.",
    PARTIAL_SENSITIVITY_ONLY: "Delistete Titel sind nur ab 2016 und nur in einer Vergleichsrechnung enthalten.",
    TOTAL_RETURN_COVERAGE_SHORT: "Gesamtrendite ist für zu wenige Titel bestätigt; gerechnet wird ohne Dividenden, nicht gemischt.",
    HAND_PICKED_SURVIVORS: "Nur ausgewählte, heute gelistete Titel.",
    DAILY_HISTORY_ONLY_IN_PRIVATE_STORE: "Die volle Tageshistorie liegt nur in der Pipeline vor.",
    STUDY_DECLARES_BACKTEST_NOT_CERTIFIED: "Die Studie ist als Häufigkeitsauswertung freigegeben, nicht als Backtest.",
    PRESENT_AND_UNQUANTIFIED_IN_PART: "Der Überlebenden-Effekt ist nicht quantifiziert.",
    NO_INDEX_LEVEL_SERIES_PUBLISHED: "Es gibt keine Indexreihe mit Gesamtrendite.",
    OOS_DIRECTION_NOT_CONFIRMED: "Die Richtung bestätigt sich außerhalb des Lernzeitraums nicht.",
    FOLDS_DISAGREE: "Die Walk-Forward-Abschnitte zeigen in verschiedene Richtungen.",
    REGIME_UNDERSAMPLED: "Zu wenige Fälle in mindestens einer Marktphase.",
    NEIGHBOURS_DISAGREE: "Benachbarte Parameter zeigen in eine andere Richtung.",
    FIXED_MAPPING_NOT_SWEPT: "Die freigegebene Zuordnung wird nicht variiert.",
    OUTCOMES_INCOMPLETE: "Zu viele Fälle ohne vollständigen Ausgang.",
    PIT_NOT_PROVEN: "Point-in-Time ist nicht belegt.",
    PIT_OR_PARITY_MISMATCH: "Die Nachrechnung weicht von veröffentlichten Ständen ab.",
    PARITY_NOT_MEASURED: "Die Nachrechnung ist nicht gemessen.",
    NO_REBALANCE_CONTRACT: "Es gibt keinen Rebalancing-Vertrag.",
    PIT_FUNDAMENTALS_MISSING: "Zeitpunktgenaue Fundamentaldaten fehlen.",
    SETUP_OUTCOMES_NOT_CERTIFIED: "Die Setup-Methodik gibt Ausgangszahlen erst nach ihrer Zertifizierung frei.",
    NOT_CERTIFIED: "Die Setup-Methodik gibt Ausgangszahlen erst nach ihrer Zertifizierung frei.",
    HISTORY_TOO_SHORT: "Die Historie ist zu kurz.",
    NO_STUDY: "Es gibt keine Studie.",
    TOTAL_RETURN_MISSING: "Die Gesamtrendite fehlt.",
    SETUP_HISTORY_TOO_SHORT: "Die veröffentlichte Setup-Historie ist noch zu kurz – sie wächst mit jedem Pipeline-Lauf.",
    SETUP_HISTORY_SPAN_TOO_SHORT: "Die veröffentlichte Setup-Historie umfasst noch zu wenige Monate.",
    COMPLETED_OUTCOMES_TOO_FEW: "Zu wenige abgeschlossene Ergebnisse – ein 6-Monats-Ergebnis braucht 6 Monate.",
    TOO_FEW_TITLES: "Zu wenige Titel mit abgeschlossenem Ergebnis.",
    EVENTS_CLUSTERED_IN_TIME: "Die Ereignisse liegen noch in zu wenigen Monaten.",
    FORWARD_OUTCOMES_TOO_FEW: "Zu wenige abgeschlossene Folgezeiträume.",
    HISTORY_GAP: "Die gesammelte Historie hat eine zu große Lücke.",
    SURVIVOR_BY_CONSTRUCTION: "Eine Aktie mit langer Historie hat überlebt.",
    DESCRIPTIVE_NOT_A_TEST: "Beschreibt, was geschah; prüft keine Regel.",
    CLUSTERED_SAMPLE: "Die Fälle ballen sich in wenigen Zeiträumen.",
    REGIME_HISTORY_NOT_CERTIFIED: "Die Historie der Marktphasen ist nicht zertifiziert.",
    EDGE_NOT_CONFIRMED_OUT_OF_SAMPLE: "Ein Vorteil gegenüber der Base Rate bestätigt sich im Testzeitraum nicht.",
    NO_RULE_CERTIFIED: "Keine Regel erfüllt alle Gates.",
    OWNER_APPROVAL_REQUIRED: "Alle Gates bestanden – die Methodik verlangt eine ausdrückliche Owner-Freigabe.",
    TOTAL_RETURN_NOT_IN_THIS_RUN: "Dieser Lauf rechnet mit Kursrendite; die Pipeline rechnet mit Gesamtrendite.",
    VARIANTS_NOT_MEASURABLE_YET: "Die Einstiegsvarianten lassen sich erst mit abgeschlossenen Ergebnissen vergleichen.",
    OOS_NOT_MEASURABLE_YET: "Die Prüfung außerhalb des Lernzeitraums braucht abgeschlossene Ergebnisse.",
    PRESENT_AND_UNQUANTIFIED_IN_PART: "Der Überlebenden-Effekt ist nicht quantifiziert."
  };
  var STATUS_WORD = { CERTIFIED: "zertifiziert", LIMITED: "eingeschränkt", COLLECTING_HISTORY: "sammelt Historie", WITHHELD: "zurückgehalten" };
  var TIER_WORD = { OBSERVED: "Historisch beobachtet", TESTED: "Historisch getestet", CERTIFIED: "Zertifiziert" };
  /* Beobachtet / getestet / zertifiziert - zertifiziert nur mit Status CERTIFIED. */
  function tierWord(tier, status) { return status === "CERTIFIED" ? TIER_WORD.CERTIFIED : TIER_WORD[tier] || TIER_WORD.TESTED; }
  function statusBadge(status, tier) {
    return el("span", { class: "q-cert-badge cert-" + String(status || "WITHHELD").toLowerCase() }, [el("b", { text: tierWord(tier, status) }), el("span", { text: " · " + (STATUS_WORD[status] || status) })]);
  }
  function pp(v) { return typeof v === "number" && isFinite(v) ? (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v * 100).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " Pp" : "–"; }
  function baseLine(b) {
    if (typeof b.deltaPositiveShare !== "number") return null;
    /* Eine Nachkommastelle: sonst passt die gerundete Differenz nicht zu den Quoten. */
    return share1(b.positiveShare) + " im Plus nach 6 M. vs. " + share1(b.basePositiveShare) + " Base Rate derselben Wochen → " + pp(b.deltaPositiveShare) +
      (b.deltaCi ? " (95 %: " + pp(b.deltaCi[0]) + " bis " + pp(b.deltaCi[1]) + ")" : "");
  }
  /* Hält der Abstand zur Base Rate im jüngsten Testzeitraum? Ohne diesen Satz
     wirkt eine Differenz belastbarer, als sie ist. */
  function oosHint(b) {
    if (!b || typeof b.deltaPositiveShare !== "number" || typeof b.edgeOutOfSample !== "boolean") return null;
    if (!b.edgeOutOfSample) return "Im jüngsten Testzeitraum nicht robust genug bestätigt.";
    return b.deltaPositiveShare < 0 ? "Im jüngsten Testzeitraum bestätigt – schwächer als die Base Rate." : "Im jüngsten Testzeitraum bestätigt.";
  }
  function reasonText(code) { return REASON[code] || "Eine Bedingung der Vertrauensregel ist nicht erfüllt."; }
  function pct(v, d, signed) { return typeof v === "number" && isFinite(v) ? VM.pct(v, d === undefined ? 1 : d, signed) : "–"; }
  function share1(v) { return typeof v === "number" && isFinite(v) ? (v * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %" : "–"; }
  function share(v) { return typeof v === "number" && isFinite(v) ? Math.round(v * 100) + " %" : "–"; }
  function num(v, d) { return typeof v === "number" && isFinite(v) ? v.toLocaleString("de-DE", { maximumFractionDigits: d === undefined ? 2 : d }) : "–"; }
  function int(v) { return typeof v === "number" && isFinite(v) ? Math.round(v).toLocaleString("de-DE") : "–"; }
  function trustPill(trust) { return el("span", { class: "q-trust-badge trust-" + String(trust || "NOT_READY").toLowerCase(), text: "Vertrauen: " + (TRUST_WORD[trust] || "nicht bereit") }); }
  function returnWord(t) { return t === "TOTAL_RETURN" ? "Gesamtrendite (mit Dividenden)" : "Kursrendite ohne Dividenden"; }

  var RULE_LABEL = {
    MOMENTUM_IMPROVED: "Momentum verbessert", MOMENTUM_DETERIORATED: "Momentum verschlechtert", TREND_UP: "Über der langfristigen Linie",
    TREND_DOWN: "Unter die langfristige Linie", NEW_52W_HIGH: "Neues 52-Wochen-Hoch",
    SETUP_CONFIRMED: "Setup bestätigt", SETUP_NEW: "Setup entsteht", SETUP_WEAKENED: "Setup schwächt sich ab"
  };

  /* ===================================================================
     EVIDENZ IN ALLTAGSSPRACHE (evidence-language-1.0.0,
     quant/methodology/evidence-language-v1.json)

     Keine neue Kennzahl: nur Worte fuer gemessene Zahlen. Eine Quote steht
     nie allein - immer mit Base Rate, Differenz, Vertrauen und dem, was
     Quant nicht weiss.
     =================================================================== */
  var LANGUAGE_VERSION = "evidence-language-1.0.0";
  var EDGE_THRESHOLDS_PP = { moderate: 2, clear: 5 };
  var EDGE = {
    WEAKER: { label: "Historisch schwächer als der Markt", tone: "down" },
    NONE: { label: "Kein messbarer Vorteil", tone: "flat" },
    SMALL: { label: "Kleiner historischer Vorteil", tone: "up" },
    MODERATE: { label: "Moderater historischer Vorteil", tone: "up" },
    CLEAR: { label: "Deutlicher historischer Vorteil", tone: "up" },
    UNKNOWN: { label: "Kein Vergleich mit dem Markt möglich", tone: "flat" }
  };
  var TRUST_PLAIN = {
    LIMITED: "Evidenz vorhanden, aber noch nicht vollständig belastbar.",
    NOT_READY: "Noch nicht genug Evidenz für eine Aussage.",
    USABLE: "Evidenz belastbar, aber nicht zertifiziert.",
    ROBUST: "Evidenz robust, aber nicht zertifiziert."
  };
  var TRUST_SHORT = { LIMITED: "eingeschränkt", NOT_READY: "nicht bereit", USABLE: "belastbar", ROBUST: "robust" };
  /* Reihenfolge der Checkliste: was gilt, dann was fehlt. [id, erfuellt, offen, Fachbegriff] */
  var CHECK_WORDS = [
    ["returnBasis", "Dividenden sind berücksichtigt (Gesamtrendite).", "Dividenden sind nicht berücksichtigt.", "Gesamtrendite"],
    ["lookahead", "Kein Blick in die Zukunft: gekauft wird erst nach dem Signal.", "Ein Blick in die Zukunft ist nicht ausgeschlossen.", "Look-Ahead"],
    ["pit", "Nur Daten, die damals bekannt waren.", "Zeitpunktgenauigkeit nicht belegt.", "Point-in-Time"],
    ["benchmark", "Vergleich mit dem Markt in denselben Wochen.", "Kein Vergleich mit dem Markt.", "Base Rate"],
    ["independence", "Mehrfach auftretende Signale wurden zusammengefasst.", "Die Fälle ballen sich in wenigen Zeiträumen.", "Unabhängigkeit"],
    ["sample", "Genug Fälle aus genug Aktien.", "Zu wenige Fälle.", "Stichprobe"],
    ["costs", "Handelskosten sind abgezogen.", "Handelskosten sind nicht abgezogen.", "Kosten"],
    ["survivorship", "Frühere verschwundene Unternehmen sind enthalten.", "Frühere verschwundene Unternehmen sind noch nicht vollständig enthalten.", "Survivorship"],
    ["oos", "Die Richtung hielt auch in neueren Daten.", "Die Richtung hat sich in neueren Daten nicht bestätigt.", "Out-of-Sample"],
    ["walkForward", "Über die Zeit durchgehend in derselben Richtung.", "Über die Zeit nicht durchgehend in derselben Richtung.", "Walk-Forward"],
    ["parameterStability", "Leicht andere Einstellungen zeigen dasselbe Bild.", "Bei leicht anderen Einstellungen zeigt sich ein anderes Bild.", "Parameterstabilität"],
    ["regimeDiversity", "In verschiedenen Marktphasen geprüft.", "Marktphasen sind noch nicht zertifiziert.", "Marktphasen"],
    ["completeness", "Die Fälle sind vollständig ausgewertet.", "Zu viele Fälle ohne vollständiges Ergebnis.", "Vollständigkeit"]
  ];

  /* Die vier Pruefungen, die ein Anleger zuerst sehen soll; weitere bestandene klappen auf. */
  var KEY_PASS = { returnBasis: true, lookahead: true, independence: true, benchmark: true };
  /* Edge aus Differenz und 95-%-Band - erst das Band, dann die Groesse. */
  function edgeOf(b) {
    if (!b || typeof b.deltaPositiveShare !== "number" || !Array.isArray(b.deltaCi)) return { id: "UNKNOWN", label: EDGE.UNKNOWN.label, tone: "flat", oos: null };
    var lo = b.deltaCi[0], hi = b.deltaCi[1], d = b.deltaPositiveShare * 100, id;
    if (hi < 0) id = "WEAKER";
    else if (lo <= 0) id = "NONE";
    else id = d >= EDGE_THRESHOLDS_PP.clear ? "CLEAR" : d >= EDGE_THRESHOLDS_PP.moderate ? "MODERATE" : "SMALL";
    var oos = typeof b.edgeOutOfSample === "boolean" ? b.edgeOutOfSample : null;
    return { id: id, label: EDGE[id].label, tone: EDGE[id].tone, oos: oos };
  }
  /* Ein Satz: Edge-Sprache plus der Vorbehalt aus neueren Daten. */
  function edgeSentence(b) {
    var e = edgeOf(b);
    if (e.id === "UNKNOWN") return e.label + ".";
    var tail = e.id === "NONE" ? "" : e.oos === false ? " – der Unterschied ist in neueren Daten nicht eindeutig" : e.oos === true ? " – auch in neueren Daten deutlich" : "";
    return e.label + tail + ".";
  }
  function oosAnswer(b) {
    if (!b || typeof b.edgeOutOfSample !== "boolean") return null;
    return b.edgeOutOfSample ? "Ja" : "Nein";
  }
  function trustPlain(trust) { return TRUST_PLAIN[trust] || TRUST_PLAIN.NOT_READY; }
  /* Vertrauen als Checkliste: erfuellt (✓) und offen (⚠), Fachbegriff klein. */
  function trustChecklist(b, opts) {
    opts = opts || {};
    var open = {}, known = {};
    (b.openChecks || []).forEach(function (k) { open[k] = true; });
    (b.checkedIds || []).forEach(function (k) { known[k] = true; });
    var has = Object.keys(known).length > 0;
    var rows = CHECK_WORDS.filter(function (c) { return has ? known[c[0]] : false; });
    var pass = rows.filter(function (c) { return !open[c[0]]; }), fail = rows.filter(function (c) { return open[c[0]]; });
    var li = function (c, ok) {
      return el("li", { class: ok ? "is-pass" : "is-open" }, [el("span", { class: "q-ev-mark", "aria-hidden": "true", text: ok ? "✓" : "⚠" }),
        el("span", { text: ok ? c[1] : c[2] }), opts.terms === false ? null : el("small", { text: c[3] })]);
    };
    return el("div", { class: "q-ev-trust" }, [
      el("p", { class: "q-ev-trust-head" }, [el("b", { text: opts.title || "Wie belastbar ist das?" }), el("span", { class: "q-ev-trust-word trust-" + String(b.trust || "NOT_READY").toLowerCase(), text: TRUST_SHORT[b.trust] || "nicht bereit" })]),
      el("p", { class: "q-ev-trust-plain", text: trustPlain(b.trust) }),
      has ? el("ul", { class: "q-ev-checks", "aria-label": "Vertrauen nach Prüfungen" }, pass.filter(function (c) { return KEY_PASS[c[0]]; }).map(function (c) { return li(c, true); })
        .concat(fail.map(function (c) { return li(c, false); }))) : null,
      has && pass.some(function (c) { return !KEY_PASS[c[0]]; }) ? el("details", { class: "q-ev-more" }, [
        el("summary", { text: pass.filter(function (c) { return !KEY_PASS[c[0]]; }).length + " weitere Prüfungen bestanden" }),
        el("ul", { class: "q-ev-checks" }, pass.filter(function (c) { return !KEY_PASS[c[0]]; }).map(function (c) { return li(c, true); }))]) : null
    ]);
  }
  /* Rückgang: Bedeutung zuerst, Zahl danach. */
  function drawdownSentence(typical, worst) {
    if (typeof typical !== "number") return null;
    var t = Math.abs(Math.round(typical * 100));
    var s = "Zwischenzeitlich fielen vergleichbare Fälle typischerweise um etwa " + t + " %.";
    if (typeof worst === "number") s += " Der stärkste Rückgang lag bei " + Math.abs(Math.round(worst * 100)) + " %.";
    return s;
  }
  function sampleSentence(n, effectiveN, scope) {
    if (typeof n !== "number") return null;
    return int(n) + " Fälle " + (scope || "aus dem ganzen Markt") + (typeof effectiveN === "number" ? ", davon etwa " + int(effectiveN) + " unabhängig." : ".");
  }
  var SAMPLE_WHY = "Mehrere Signale können in derselben Marktphase auftreten. Deshalb zählen wir zusätzlich unabhängige Fälle.";
  function bar(label, value, cls) {
    return el("div", { class: "q-ev-bar " + (cls || "") }, [el("span", { class: "q-ev-bar-label", text: label }),
      el("span", { class: "q-ev-bar-track", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.max(0, Math.min(100, (value || 0) * 100)).toFixed(1) + "%" })]),
      el("b", { class: "num", text: share1(value) })]);
  }
  /* Signal gegen Markt: grosse Quote, zwei Balken, Differenz, Edge-Satz.
     opts.compact: Radar-Karte (ohne Checkliste, ohne Details). */
  function signalEvidence(b, opts) {
    opts = opts || {};
    if (!b || b.state !== "AVAILABLE") return null;
    var e = edgeOf(b), horizon = "nach 6 Monaten";
    var kids = [
      el("p", { class: "q-ev-head" }, [el("span", { class: "q-ev-tier tier-tested", text: "Historisch getestet" }), opts.label ? el("b", { text: opts.label }) : null]),
      el("p", { class: "q-ev-big" }, [el("b", { class: "num", text: share1(b.positiveShare) }), el("span", { text: " der Fälle lagen " + horizon + " höher" })]),
      el("div", { class: "q-ev-compare", role: "img", "aria-label": "Signal " + share1(b.positiveShare) + ", Markt " + share1(b.basePositiveShare) + ", Unterschied " + pp(b.deltaPositiveShare) }, [
        bar("Signal", b.positiveShare, "is-signal"), bar("Markt", b.basePositiveShare, "is-base")]),
      el("p", { class: "q-ev-edge tone-" + e.tone }, [el("b", { class: "num", text: pp(b.deltaPositiveShare) }), el("span", { text: edgeSentence(b) })])
    ];
    if (opts.compact) {
      kids.push(el("p", { class: "q-ev-mini" }, [el("span", { text: "Evidenz " + (TRUST_SHORT[b.trust] || "nicht bereit") }), el("span", { text: int(b.n) + " Fälle · ≈ " + int(b.effectiveN) + " unabhängig" })]));
      return el("div", { class: "q-evx is-compact" }, kids);
    }
    var oa = oosAnswer(b);
    kids.push(el("dl", { class: "q-ev-facts" }, [
      el("dt", { text: "Ist der Unterschied zum Markt auch in neueren Daten deutlich?" }), el("dd", { class: oa === "Ja" ? "is-yes" : "is-no", text: oa || "nicht gemessen" }),
      el("dt", { text: "Wie viele Fälle?" }), el("dd", { text: sampleSentence(b.n, b.effectiveN) || "–" }),
      el("dt", { text: "Wie groß war das Risiko?" }), el("dd", { text: drawdownSentence(b.typicalDrawdown) || "nicht gemessen" }),
      el("dt", { text: "Typisches Ergebnis" }), el("dd", { text: "Median " + pct(b.median, 1, true) + " " + horizon + (b.returnType === "TOTAL_RETURN" ? ", mit Dividenden" : ", ohne Dividenden") })
    ]));
    kids.push(el("p", { class: "q-ev-why", text: SAMPLE_WHY }));
    kids.push(trustChecklist(b));
    return el("div", { class: "q-evx" }, kids);
  }
  /* Zertifiziert: nur mit Status CERTIFIED - sonst ein ruhiger Satz. */
  function certifiedLine(cert, opts) {
    var ok = cert && cert.status === "CERTIFIED", subject = (opts && opts.subject) || "dieses Signal";
    return el("div", { class: "q-ev-cert" + (ok ? " is-on" : "") }, [el("span", { class: "q-ev-tier tier-certified" + (ok ? "" : " is-off"), text: "Zertifiziert" }),
      el("p", { text: ok ? "Alle methodischen Prüfungen sind bestanden." : "Für " + subject + " liegt noch kein vollständig zertifizierter Backtest vor. Das ist der normale Stand – nicht ein fehlendes Ergebnis." })]);
  }

  /* ===================================================================
     BENACHRICHTIGEN (vorbereitet, Alert-Vertrag quant-alert-event-3.0.0)
     Die Auswahl bleibt auf diesem Geraet; versendet wird noch nichts
     (delivery NOT_CONFIGURED). Passende Ereignisse werden markiert.
     =================================================================== */
  var ALERT_KEY = "vu.quant.alerts.v1";
  var ALERT_CHOICES = [
    { id: "SETUP_CONFIRMED", label: "Setup bestätigt" },
    /* Der Pfadzustand "ungueltig" ist im Radar noch geschlossen; gemeldet
       wird bis dahin, wenn ein Setup nicht mehr erfuellt ist. */
    { id: "SETUP_INVALIDATED", label: "Setup ungültig oder nicht mehr erfüllt", types: ["SETUP_INVALIDATED", "SETUP_WEAKENED"] },
    { id: "RISK_RISING", label: "Risiko steigt" },
    { id: "EDGE", label: "Neuer historischer Vorteil", hint: "ein getestetes Signal, das historisch messbar über dem Markt lag" },
    { id: "STRATEGY_MATCH_NEW", label: "Neu in einer Strategie" },
    { id: "NEW_52W_HIGH", label: "Neues 52-Wochen-Hoch" }
  ];
  function readAlerts() { try { var v = JSON.parse(global.localStorage.getItem(ALERT_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function writeAlerts(v) { try { global.localStorage.setItem(ALERT_KEY, JSON.stringify(v)); } catch (e) { /* privater Modus: Auswahl gilt nur fuer diese Sitzung */ } }
  function alertsFor(ticker) { var a = readAlerts()[ticker]; return Array.isArray(a) ? a : []; }
  function hasEdge(e) { var b = e && e.backtest; return !!(b && b.state === "AVAILABLE" && Array.isArray(b.deltaCi) && b.deltaCi[0] > 0); }
  /* Welche der gewaehlten Ausloeser trifft dieses Ereignis? */
  function alertMatch(ticker, e) {
    var on = alertsFor(ticker);
    if (!on.length || !e) return null;
    var c = ALERT_CHOICES.filter(function (x) { return on.indexOf(x.id) >= 0 && (x.types || [x.id]).indexOf(e.eventType) >= 0; })[0];
    if (c) return c.label;
    if (on.indexOf("EDGE") >= 0 && hasEdge(e)) return "Neuer historischer Vorteil";
    return null;
  }
  function alertPanel(ticker) {
    var chosen = alertsFor(ticker), status = el("p", { class: "q-alert-status", "aria-live": "polite" });
    function say() { var n = alertsFor(ticker).length; status.textContent = n ? n + " Auslöser gewählt. Quant markiert passende Ereignisse im Radar und in deiner Beobachtungsliste." : "Kein Auslöser gewählt."; }
    var list = el("ul", { class: "q-alert-list" }, ALERT_CHOICES.map(function (c) {
      var box = el("input", { type: "checkbox", value: c.id });
      box.checked = chosen.indexOf(c.id) >= 0;
      box.addEventListener("change", function () {
        var all = readAlerts(), cur = Array.isArray(all[ticker]) ? all[ticker] : [];
        cur = box.checked ? cur.concat([c.id]).filter(function (x, i, a) { return a.indexOf(x) === i; }) : cur.filter(function (x) { return x !== c.id; });
        if (cur.length) all[ticker] = cur; else delete all[ticker];
        writeAlerts(all); say();
      });
      return el("li", {}, [el("label", {}, [box, el("span", { text: c.label }), c.hint ? el("small", { text: c.hint }) : null])]);
    }));
    say();
    return el("details", { class: "q-alerts" }, [el("summary", { text: "Benachrichtige mich, wenn …" }),
      el("p", { class: "q-alert-note", text: "Beobachtest du die Aktie (☆ oben), verfolgt Quant für dich Setup-Wechsel, neue historische Evidenz, Strategie-Wechsel, Risiken und neue Signale. Hier wählst du, was dir besonders wichtig ist." }), list, status,
      el("p", { class: "q-alert-note", text: "Benachrichtigungen werden noch nicht verschickt. Deine Auswahl bleibt auf diesem Gerät; Quant zeigt dir passende Ereignisse, sobald du die Seite öffnest." })]);
  }

  /* ===================================================================
     BEOBACHTET: EVIDENZ-VERLAUF JE AKTIE (kein Portfolio)
     =================================================================== */
  function watchTimeline(ticker, name, tr, href) {
    var R = global.VUQuantRadar, T = R ? R.TYPE : {};
    var label = function (id) { var l = R ? R.LIFECYCLE.filter(function (x) { return x.id === id; })[0] : null; return l ? l.label : id; };
    var rows = [];
    if (tr && tr.state === "AVAILABLE") {
      rows.push(["Jetzt", label(tr.current) + (tr.enteredAt ? " (seit " + X.dateDe(tr.enteredAt) + ")" : "")]);
      if (tr.previous) rows.push(["Davor", label(tr.previous)]);
      var edgeEv = (tr.events || []).filter(hasEdge)[0] || (tr.events || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; })[0];
      if (edgeEv) rows.push(["Historisch getestet", ((T[edgeEv.eventType] || {}).label || edgeEv.eventType) + ": " + pp(edgeEv.backtest.deltaPositiveShare) + " gegenüber dem Markt – " + edgeSentence(edgeEv.backtest)]);
      (tr.history || []).slice(0, 4).forEach(function (h) {
        var m = alertMatch(ticker, { eventType: h[0] });
        rows.push([X.dateDe(h[2]), ((T[h[0]] || {}).label || h[0]) + (m ? " · passt zu deiner Benachrichtigung" : "")]);
      });
      if (tr.nextCondition) rows.push(["Als Nächstes", "für „" + tr.nextCondition.label + "“ fehlen " + tr.nextCondition.open + " von " + tr.nextCondition.total + " Bedingungen"]);
    }
    return el("a", { class: "q-watch-tl", href: href }, [el("p", { class: "q-watch-tl-head" }, [el("b", { text: name || ticker }), el("small", { text: ticker })]),
      rows.length ? el("dl", {}, [].concat.apply([], rows.map(function (r) { return [el("dt", { text: r[0] }), el("dd", { text: r[1] })]; })))
        : el("p", { class: "qx-small", text: tr && tr.reason === "NOT_IN_SETUP_UNIVERSE" ? "Der Radar verfolgt diese Aktie nicht (nicht im Setup-Universum)." : "Noch kein Verlauf veröffentlicht." })]);
  }

  /* ------------------------------------------------- Radar-Karte: Evidenz */
  function evidenceBlock(events, opts) {
    opts = opts || {};
    var T = global.VUQuantRadar ? global.VUQuantRadar.TYPE : {};
    var hit = (events || []).filter(function (e) { return e.backtest && e.backtest.state === "AVAILABLE"; })[0];
    if (hit) {
      var b = hit.backtest, label = (T[hit.eventType] || {}).label || hit.eventType;
      var cert = b.certification || {};
      /* Erst die Base Rate, dann die Kennzahlen: eine Trefferquote allein sagt nichts. */
      return el("div", { class: "q-rc-hist" }, [
        el("p", { class: "q-rc-hist-head" }, [el("b", { text: "Historische Evidenz" }), statusBadge(cert.status || "LIMITED", cert.tier || "TESTED")]),
        el("p", { class: "q-rc-hist-what", text: "„" + label + "“: " + (baseLine(b) || share(b.positiveShare) + " im Plus nach 6 M.") }),
        el("dl", { class: "q-rc-hist-kv" }, [
          el("dt", { text: "Fälle" }), el("dd", { class: "num", text: int(b.n) }),
          el("dt", { text: "≈ unabhängig" }), el("dd", { class: "num", text: int(b.effectiveN) }),
          el("dt", { text: "typ. Rückgang" }), el("dd", { class: "num down", text: pct(b.typicalDrawdown, 1) })]),
        oosHint(b) ? el("p", { class: "q-rc-hist-oos" + (b.edgeOutOfSample ? "" : " is-weak"), text: oosHint(b) }) : null,
        el("small", { class: "q-rc-hist-note", text: "Median " + pct(b.median, 1, true) + " nach 6 M. · " + (opts.compact ? (b.returnType === "TOTAL_RETURN" ? "Gesamtrendite" : "Kursrendite") : returnWord(b.returnType) + " · keine Prognose") })
      ]);
    }
    var first = (events || [])[0], w = first && first.backtest;
    if (!w) return null;
    var prog = w.progress ? " Gesammelt: " + int(w.progress.historyDates) + " veröffentlichte Stände, " + int(w.progress.completedM6) + " abgeschlossene Ergebnisse." : "";
    return el("div", { class: "q-rc-hist is-off" }, [el("p", { class: "q-rc-hist-head" }, [el("b", { text: "Historischer Backtest noch nicht freigegeben" }), w.certification ? statusBadge(w.certification.status, w.certification.tier) : null]),
      el("small", { text: reasonText(w.reason) + prog })]);
  }

  /* --------------------------------------------- Aktienseite: Radar-Status */
  function trackingSection(tr, ctx) {
    if (!tr || tr.state !== "AVAILABLE") return null;
    var R = global.VUQuantRadar, label = function (id) { var l = R ? R.LIFECYCLE.filter(function (x) { return x.id === id; })[0] : null; return l ? l.label : id || "–"; };
    var rows = [
      ["Zustand jetzt", label(tr.current)],
      ["Davor", tr.previous ? label(tr.previous) : "–"],
      ["Seit", tr.enteredAt ? (tr.enteredAtIsLowerBound ? "mindestens seit " : "") + X.dateDe(tr.enteredAt) : "–"],
      ["Dauer", typeof tr.durationDays === "number" ? (tr.enteredAtIsLowerBound ? "≥ " : "") + tr.durationDays + (tr.durationDays === 1 ? " Tag" : " Tage") : "–"],
      ["Auslöser", tr.trigger || "–"],
      ["Ungültig unter", typeof tr.invalidation === "number" ? num(tr.invalidation) + " $" : "–"],
      ["Nächste Bedingung", tr.nextCondition ? "für „" + tr.nextCondition.label + "“ fehlen " + tr.nextCondition.open + " von " + tr.nextCondition.total : "–"],
      ["Beobachtet (diese Aktie)", { BROAD: "breit", THIN: "dünn", WITHHELD: "zurückgehalten", UNAVAILABLE: "nicht verfügbar", NONE: "keine Vergleichsfälle" }[tr.evidenceState] + (tr.episodes ? " · " + tr.episodes + (tr.episodes === 1 ? " Fall" : " Fälle") : "")],
      ["Setup-Backtest", tr.backtest ? (tr.backtest.state === "AVAILABLE" ? TRUST_SHORT[tr.backtest.trust] : "noch keine Zahlen – " + reasonText(tr.backtest.reason)) : "kein Setup"]
    ];
    var kids = [el("dl", { class: "qx-kv q-track" }, [].concat.apply([], rows.map(function (r) { return [el("dt", { text: r[0] }), el("dd", { text: r[1] })]; })))];
    if (tr.events && tr.events.length) {
      var T = R ? R.TYPE : {};
      kids.push(el("ul", { class: "q-track-events" }, tr.events.map(function (e) {
        var t = T[e.eventType] || {};
        var hit = alertMatch(tr.ticker, e);
        return el("li", { class: "tone-" + (e.direction || t.tone || "info") }, [el("b", { text: (t.label || e.eventType) + " · " + X.dateDe(e.occurredAt) }), el("span", { text: e.explanation }),
          hit ? el("small", { class: "q-alert-hit", text: "Passt zu deiner Benachrichtigung: " + hit }) : null,
          e.backtest ? el("small", { text: e.backtest.state === "AVAILABLE"
            ? "Historisch getestet: " + share1(e.backtest.positiveShare) + " der Fälle höher nach 6 Monaten, Markt " + share1(e.backtest.basePositiveShare) + " (" + pp(e.backtest.deltaPositiveShare) + "). " + edgeSentence(e.backtest) + " Evidenz " + (TRUST_SHORT[e.backtest.trust] || "nicht bereit") + " – Details unter „Was geschah früher“."
            : "Historisch getestet: noch keine Zahlen. " + reasonText(e.backtest.reason) }) : null]);
      })));
    } else kids.push(el("p", { class: "qx-small", text: "Zum letzten Stand kein neues Ereignis bei dieser Aktie." }));
    if (tr.history && tr.history.length) {
      var TT = R ? R.TYPE : {};
      kids.push(el("h3", { class: "qx-sub", text: "Verlauf der letzten 90 Tage" }), el("ol", { class: "q-track-history" }, tr.history.map(function (h) {
        var t = TT[h[0]] || {};
        return el("li", { class: "tone-" + (h[1] || t.tone || "info") }, [el("b", { class: "num", text: X.dateDe(h[2]) }), el("span", { text: t.label || h[0] })]);
      })));
    }
    kids.push(el("p", { class: "qx-small", text: "Stand " + X.dateDe(tr.asOf) + ". Beobachten ist kein Portfolio: keine Stückzahl, kein Einstand, keine Rendite." }));
    return kids;
  }


  global.QXEvidence = { TRUST_WORD: TRUST_WORD, STATUS_WORD: STATUS_WORD, TIER_WORD: TIER_WORD, REASON: REASON, RULE_LABEL: RULE_LABEL,
    tierWord: tierWord, statusBadge: statusBadge, pp: pp, baseLine: baseLine, reasonText: reasonText, pct: pct, share: share, num: num, int: int,
    share1: share1, trustPill: trustPill, returnWord: returnWord, evidenceBlock: evidenceBlock, trackingSection: trackingSection,
    LANGUAGE_VERSION: LANGUAGE_VERSION, EDGE: EDGE, EDGE_THRESHOLDS_PP: EDGE_THRESHOLDS_PP, TRUST_PLAIN: TRUST_PLAIN, TRUST_SHORT: TRUST_SHORT, CHECK_WORDS: CHECK_WORDS,
    edgeOf: edgeOf, edgeSentence: edgeSentence, oosAnswer: oosAnswer, trustPlain: trustPlain, trustChecklist: trustChecklist,
    ALERT_CHOICES: ALERT_CHOICES, alertsFor: alertsFor, alertMatch: alertMatch, alertPanel: alertPanel, watchTimeline: watchTimeline, hasEdge: hasEdge,
    drawdownSentence: drawdownSentence, sampleSentence: sampleSentence, SAMPLE_WHY: SAMPLE_WHY, signalEvidence: signalEvidence, certifiedLine: certifiedLine };
})(typeof window !== "undefined" ? window : globalThis);
