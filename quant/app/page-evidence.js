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
    return share(b.positiveShare) + " im Plus nach 6 M. vs. " + share(b.basePositiveShare) + " Base Rate derselben Wochen → " + pp(b.deltaPositiveShare) +
      (b.deltaCi ? " (95 %: " + pp(b.deltaCi[0]) + " bis " + pp(b.deltaCi[1]) + ")" : "");
  }
  function reasonText(code) { return REASON[code] || "Eine Bedingung der Vertrauensregel ist nicht erfüllt."; }
  function pct(v, d, signed) { return typeof v === "number" && isFinite(v) ? VM.pct(v, d === undefined ? 1 : d, signed) : "–"; }
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
        opts.compact ? null : el("small", { class: "q-rc-hist-note", text: returnWord(b.returnType) + " · Median " + pct(b.median, 1, true) + " · keine Prognose" })
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
      ["Rückblick (dieselbe Aktie)", { BROAD: "breit", THIN: "dünn", WITHHELD: "zurückgehalten", UNAVAILABLE: "nicht verfügbar", NONE: "keine Vergleichsfälle" }[tr.evidenceState] + (tr.episodes ? " · " + tr.episodes + " Fälle" : "")],
      ["Setup-Backtest", tr.backtest ? (tr.backtest.state === "AVAILABLE" ? TRUST_WORD[tr.backtest.trust] : (tr.backtest.certification ? STATUS_WORD[tr.backtest.certification.status] + " – " : "noch nicht freigegeben – ") + reasonText(tr.backtest.reason)) : "kein Setup"]
    ];
    var kids = [el("dl", { class: "qx-kv q-track" }, [].concat.apply([], rows.map(function (r) { return [el("dt", { text: r[0] }), el("dd", { text: r[1] })]; })))];
    if (tr.events && tr.events.length) {
      var T = R ? R.TYPE : {};
      kids.push(el("ul", { class: "q-track-events" }, tr.events.map(function (e) {
        var t = T[e.eventType] || {};
        return el("li", { class: "tone-" + (e.direction || t.tone || "info") }, [el("b", { text: (t.label || e.eventType) + " · " + X.dateDe(e.occurredAt) }), el("span", { text: e.explanation }),
          e.backtest ? el("small", { text: e.backtest.state === "AVAILABLE" ? "Historisch getestet: " + (baseLine(e.backtest) || share(e.backtest.positiveShare) + " im Plus nach 6 M.") + " · Vertrauen " + TRUST_WORD[e.backtest.trust]
            : "Historischer Backtest noch nicht freigegeben: " + reasonText(e.backtest.reason) }) : null]);
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
    trustPill: trustPill, returnWord: returnWord, evidenceBlock: evidenceBlock, trackingSection: trackingSection };
})(typeof window !== "undefined" ? window : globalThis);
