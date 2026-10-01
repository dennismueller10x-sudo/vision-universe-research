/* =========================================================================
   VISION UNIVERSE QUANT — app/view-model.js        (quant-view-model-1.0.0)

   DIE PRODUKTSCHICHT ZWISCHEN ENGINE UND OBERFLAECHE.

   Die Engines (quant/engines/**) rechnen, die Product Services
   (quant/api/product-services.js) liefern ihre Ergebnisse als Vertraege.
   Diese Datei uebersetzt diese Vertraege in Aussagen, die ein Anleger
   lesen kann - und NUR das. Sie rechnet keine neue Kennzahl, setzt keine
   neue Schwelle und erfindet keinen Wert. Jede Aussage traegt ihren Beleg
   (evidence) mit, damit die Oberflaeche von "Bedeutung" bis "Methodik"
   durchreichen kann:

     MEANING -> EXPLANATION -> EVIDENCE -> DATA -> METHODOLOGY

   Reine Logik ohne DOM (UMD): im Browser als window.VUQuantViewModel, in
   Node per require() - die Tests pruefen jede Aussage gegen echte
   Artefakte.

   ZWEI BEFUNDE AUS DEM NVDA-QUALITY-AUDIT (docs/VU_QUANT_FRONTEND_REBUILD.md)
   PRAEGEN DIESE DATEI:

   1. Der Faktor "quality" misst Bilanz, Ergebnisqualitaet (Abstand
      zwischen Gewinn und Zahlungsfluss) und Stabilitaet - ausdruecklich
      KEINE Ertragskraft (die steht in "profitability"). Das Etikett
      "Unternehmensqualitaet" versprach mehr, als der Faktor misst, und
      liess NVIDIA "schwach" aussehen, obwohl Eigenkapitalquote und
      Zahlungsfluss-Historie stark sind. Der Faktor heisst hier deshalb
      "Bilanz- & Ergebnisqualitaet", und seine Begruendung nennt die
      Komponenten, die ihn tragen - nie ein pauschales "angreifbare Bilanz".

   2. Faktorwerte sind gewichtete Mittel aus Rangplaetzen, KEINE Perzentile.
      Die Stufengrenzen (90/75/45/25) sind feste Wertgrenzen. Eine
      Beschreibung wie "gehoert zu den staerksten 10 %" ist deshalb falsch
      und wird hier nicht verwendet. Wo eine Position im Universum genannt
      wird, ist sie aus den veroeffentlichten Faktorwerten aller Titel
      GEZAEHLT (rankIn), nicht aus der Stufe abgeleitet.
   ========================================================================= */
(function (global) {
  "use strict";

  var VERSION = "quant-view-model-1.0.0";
  var ORDER = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];
  var BAND_ORDER = ["VERY_STRONG", "STRONG", "NEUTRAL", "WEAK", "VERY_WEAK"];
  /* Dieselben Grenzen wie quant/engines/factor-evidence.js BANDS. Sie
     werden hier nicht festgelegt, nur gespiegelt - ein Test haelt beide
     gleich. */
  var BAND_MIN = { VERY_STRONG: 90, STRONG: 75, NEUTRAL: 45, WEAK: 25, VERY_WEAK: 0 };

  /* ------------------------------------------------------------- Sprache */

  var FACTORS = {
    quality: {
      name: "Bilanz- & Ergebnisqualität", method: "Quality",
      question: "Wie belastbar sind Bilanz und ausgewiesene Gewinne?",
      measures: "Eigenkapitalquote, Verschuldung, ob Gewinne durch echten Zahlungsfluss gedeckt sind, und wie stabil die Marge über die Jahre war.",
      notMeasures: "Nicht gemessen wird hier, wie viel ein Unternehmen verdient – das zeigt die Profitabilität.",
      higher: "Höher heißt: solidere Bilanz, Gewinne besser durch Zahlungsfluss gedeckt, stabilere Marge."
    },
    growth: {
      name: "Wachstum", method: "Growth",
      question: "Wächst das Geschäft – und mit Substanz?",
      measures: "Umsatz-, Gewinn- und Cashflow-Wachstum über drei Jahre, das Wachstum der letzten zwölf Monate und ob sich das Tempo verändert.",
      higher: "Höher heißt: schnelleres und breiter getragenes Wachstum."
    },
    momentum: {
      name: "Kursstärke", method: "Momentum",
      question: "Wie hat sich der Kurs entwickelt – auch gegenüber dem Markt?",
      measures: "Kursentwicklung über 3, 6 und 12 Monate, der Vorsprung gegenüber dem Markt und der Abstand zum Jahreshoch und zur 200-Tage-Linie.",
      higher: "Höher heißt: stärkerer und breiter getragener Kursverlauf. Das beschreibt die Vergangenheit, keine Prognose."
    },
    value: {
      name: "Bewertung", method: "Value",
      question: "Was bekommt man für den Preis der Aktie?",
      measures: "Gewinn, freier Zahlungsfluss, Umsatz und Eigenkapital im Verhältnis zum Börsenwert.",
      higher: "Höher heißt: günstiger im Verhältnis zu Gewinn, Zahlungsfluss und Substanz."
    },
    profitability: {
      name: "Profitabilität", method: "Profitability",
      question: "Wie viel verdient das Unternehmen an seinem Geschäft?",
      measures: "Kapitalrendite, operative Marge, Marge des freien Zahlungsflusses, Rohertrag und Rendite auf die Bilanzsumme.",
      higher: "Höher heißt: mehr Ertrag je eingesetztem Kapital und je Euro Umsatz."
    },
    revisions: {
      name: "Erwartungstrend", method: "Revisions",
      question: "Heben oder senken Analysten ihre Erwartungen?",
      measures: "Veränderung der Gewinnschätzungen von Analysten.",
      higher: "Höher heißt: Erwartungen werden angehoben."
    },
    risk: {
      name: "Risiko", method: "Risk",
      question: "Wie stark schwankt der Kurs?",
      measures: "Schwankungsbreite über ein Jahr, Schwankung an Verlusttagen, größter Rückgang im Jahr und Marktsensitivität (Beta).",
      higher: "Höher heißt: ruhigerer Kurs, also weniger Risiko."
    }
  };

  var BAND_WORD = {
    _: { VERY_STRONG: "sehr stark", STRONG: "stark", NEUTRAL: "durchschnittlich", WEAK: "schwach", VERY_WEAK: "sehr schwach" },
    value: { VERY_STRONG: "sehr günstig", STRONG: "günstig", NEUTRAL: "durchschnittlich", WEAK: "teuer", VERY_WEAK: "sehr teuer" },
    risk: { VERY_STRONG: "sehr niedrig", STRONG: "niedrig", NEUTRAL: "durchschnittlich", WEAK: "erhöht", VERY_WEAK: "hoch" }
  };
  var TONE = { VERY_STRONG: "good", STRONG: "good", NEUTRAL: "neutral", WEAK: "bad", VERY_WEAK: "bad" };

  /* Gruende, warum ein Faktor oder eine Komponente keinen Wert hat - in
     Alltagssprache. Kein Code erreicht die Oberflaeche. */
  var REASON = {
    BLOCKED_EXTERNAL: "Dafür gibt es keine lizenzierte, zeitpunktgenaue Datenquelle. Ein Ersatzwert wäre erfunden und wird nicht gebildet.",
    INPUT_NOT_MATERIALIZED: "Die Eingangsdaten dafür liegen für diesen Titel nicht vor.",
    INSUFFICIENT_COVERAGE: "Es liegen zu wenige der benötigten Kennzahlen vor, um den Faktor belastbar zu bilden.",
    INSUFFICIENT_HISTORY: "Die Kurshistorie ist noch zu kurz für diese Messung.",
    INSUFFICIENT_PRICE_HISTORY: "Die Kurshistorie ist noch zu kurz für diese Messung.",
    INSUFFICIENT_SNAPSHOT_HISTORY: "Dafür werden mehrere gespeicherte Stände über Wochen benötigt; die Aufzeichnung läuft noch.",
    NO_FUNDAMENTALS: "Für diesen Titel liegen keine Geschäftszahlen aus SEC-Meldungen vor.",
    FUNDAMENTALS_UNAVAILABLE: "Für diesen Titel liegen keine Geschäftszahlen aus SEC-Meldungen vor.",
    MARKET_CAP_UNAVAILABLE: "Der Börsenwert ist nicht belegt; Bewertungskennzahlen lassen sich deshalb nicht bilden.",
    SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING: "Diese Kennzahl braucht den Börsenwert genau dieser Notierung. Das Unternehmen hat mehrere börsennotierte Wertpapiere, und die veröffentlichte Aktienzahl gilt für das Unternehmen als Ganzes – welcher Anteil auf dieses Papier entfällt, steht nicht in den Unterlagen. Die Kennzahl wird deshalb bewusst nicht genannt, statt sie zu schätzen.",
    DISPLAY_NOT_PERMITTED: "Für diesen Titel ist die Anzeige des Kurses und marktbezogener Werte nicht freigegeben.",
    NOT_APPLICABLE: "Für diese Art von Unternehmen ist die Kennzahl nicht aussagekräftig.",
    TEMPLATE_NOT_APPLICABLE: "Für diese Art von Unternehmen ist die Kennzahl nicht aussagekräftig.",
    NOT_AN_EQUITY_LISTING: "Dieser Titel ist keine Stammaktie (etwa ein ETF oder eine Vorzugsaktie). Die Unternehmensanalyse gilt nur für Aktien.",
    NOT_IN_PRODUCT_UNIVERSE: "Dieser Titel gehört nicht zum Analyseuniversum von Quant.",
    NOT_COVERED_BY_FACTOR_EVIDENCE: "Für diesen Titel ist noch keine Faktoranalyse veröffentlicht.",
    SOURCE_MISSING: "Die Daten konnten gerade nicht geladen werden.",
    QUANT_V2_NOT_ACTIVE: "Eine Gesamtnote wird bewusst nicht gebildet."
  };
  function reasonText(code, fallback) {
    return REASON[code] || fallback || "Für diese Aussage fehlen belegte Daten. Es wird kein Ersatzwert gebildet.";
  }

  /* ------------------------------------------------------------ Zahlen */

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function de(v, digits) {
    return v.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }
  function pct(ratio, digits, signed) {
    if (!isNum(ratio)) return null;
    var v = ratio * 100, d = digits === undefined ? (Math.abs(v) >= 100 ? 0 : 1) : digits;
    return (signed && v > 0 ? "+" : "") + de(v, d).replace("-", "−") + " %";
  }
  function score(v) { return isNum(v) ? String(Math.round(v)) : null; }

  /* Rohwert einer Komponente mit Einheit. Verhaeltnisse als Prozent, weil
     "0,37" niemand liest und "37 % der Bilanzsumme" jeder. Ausnahmen sind
     benannt: Beta ist ein Faktor, keine Quote; Zaehlwerte sind Jahre. */
  function componentValue(c) {
    if (!c || !isNum(c.raw)) return null;
    if (c.id === "beta252d") return de(c.raw, 2).replace("-", "−");
    if (c.unit === "count") {
      if (c.id === "positiveFcfYears") return de(c.raw, 0) + " von 5 Jahren";
      return de(c.raw, 0);
    }
    if (c.unit === "x") return de(c.raw, 1) + " ×";
    if (c.unit === "ratio" || c.unit === "pct") return pct(c.raw);
    return de(c.raw, 2);
  }

  /* ---------------------------------------------------------- Faktoren */

  function band(scoreValue) {
    if (!isNum(scoreValue)) return null;
    for (var i = 0; i < BAND_ORDER.length; i++) if (scoreValue >= BAND_MIN[BAND_ORDER[i]]) return BAND_ORDER[i];
    return "VERY_WEAK";
  }
  function bandWord(id, bandId) {
    return (BAND_WORD[id] || BAND_WORD._)[bandId] || null;
  }
  function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /** "Bewertung: günstig (58)" - Bedeutung UND Zahl, nie nur eins davon. */
  function factorLabel(id, value) {
    var b = band(value);
    if (!b) return null;
    return capital(bandWord(id, b)) + " (" + score(value) + ")";
  }

  /**
   * Position eines Faktorwerts unter allen veroeffentlichten Werten
   * desselben Faktors. Gezaehlt, nicht aus der Stufe abgeleitet.
   * @param {number[]} sortedValues aufsteigend sortiert
   */
  function rankIn(sortedValues, value) {
    if (!Array.isArray(sortedValues) || !sortedValues.length || !isNum(value)) return null;
    var lo = 0, hi = sortedValues.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (sortedValues[mid] < value) lo = mid + 1; else hi = mid; }
    return { below: lo, total: sortedValues.length, share: sortedValues.length > 1 ? lo / (sortedValues.length - 1) : null };
  }
  function rankSentence(rank) {
    if (!rank || !isNum(rank.share)) return null;
    var p = Math.round(rank.share * 100);
    return "Höher als bei " + p + " % der " + de(rank.total, 0) + " bewerteten Aktien.";
  }

  /** Verteilung aller veroeffentlichten Werte eines Faktors (Methodik). */
  function distributionOf(values) {
    var out = { n: 0, bands: {}, cuts: {} };
    BAND_ORDER.forEach(function (b) { out.bands[b] = 0; });
    var sorted = (values || []).filter(isNum).sort(function (a, b) { return a - b; });
    sorted.forEach(function (v) { out.bands[band(v)]++; });
    out.n = sorted.length;
    ["VERY_STRONG", "STRONG", "NEUTRAL", "WEAK"].forEach(function (b) {
      var r = rankIn(sorted, BAND_MIN[b]); out.cuts[b] = r ? r.share : null;
    });
    out.max = sorted.length ? sorted[sorted.length - 1] : null;
    return out;
  }

  /* Zeitfenster der Methodik in Alltagssprache. Unbekannte Fenster
     bleiben wie veroeffentlicht stehen - lieber englisch als falsch. */
  var WINDOW = {
    "TTM": "letzte 12 Monate", "latest filing": "letzte Meldung", "last 5 fiscal years": "letzte 5 Geschäftsjahre",
    "last 5 fiscal years; minimum 4": "letzte 5 Geschäftsjahre (mindestens 4)", "3 fiscal years": "3 Geschäftsjahre",
    "1 year": "1 Jahr", "two YoY intervals": "zwei Jahresvergleiche", "252/21 sessions": "12 Monate ohne den letzten Monat",
    "126 sessions": "6 Monate", "63 sessions": "3 Monate", "252 sessions": "12 Monate", "200 sessions": "200 Handelstage",
    "latest close and PIT-safe TTM": "letzter Kurs und letzte 12 Monate", "latest filing and close": "letzte Meldung und letzter Kurs",
    "latest PIT-safe TTM": "letzte 12 Monate", "last 3 fiscal years": "letzte 3 Geschäftsjahre",
    "TTM over latest fiscal year": "letzte 12 Monate gegen letztes Geschäftsjahr", "latest fiscal year": "letztes Geschäftsjahr",
    "TTM against latest filing": "letzte 12 Monate gegen letzte Meldung", "TTM, same period end": "letzte 12 Monate, gleicher Stichtag"
  };
  function windowText(w) { return w ? (WINDOW[w] || w) : null; }

  function componentView(c, factorId) {
    var available = c.state === "AVAILABLE" && isNum(c.score);
    var peerLevel = c.peerLevel === "sic4_industry" ? "Branche" : c.peerLevel === "sic_division" ? "Wirtschaftszweig" : c.peerLevel === "template" || c.peerLevel === "INDUSTRY" ? "Unternehmensart" : "Gesamtmarkt";
    return {
      id: c.id, label: c.label, factorId: factorId,
      state: available ? "AVAILABLE" : "UNAVAILABLE",
      value: available ? componentValue(c) : null,
      score: available ? c.score : null,
      scoreText: available ? score(c.score) + " von 100" : null,
      weight: isNum(c.weight) ? c.weight : null,
      weightText: isNum(c.weight) ? de(c.weight * 100, 0) + " %" : null,
      direction: c.direction === "lower" ? "Niedriger ist besser" : c.direction === "higher" ? "Höher ist besser" : null,
      window: windowText(c.window), input: c.input || null, note: c.note || null,
      peer: available && isNum(c.peerPercentile) ? { level: peerLevel, size: c.peerSize || null, percentile: c.peerPercentile } : null,
      universePercentile: available && isNum(c.universePercentile) ? c.universePercentile : null,
      missing: available ? null : reasonText(c.reason),
      reason: available ? null : (c.reason || "UNAVAILABLE")
    };
  }

  /* Die Komponenten, die einen Faktor nach oben und nach unten ziehen.
     Getragen wird nur von Komponenten mit Gewicht und Wert; >= 67 zieht
     nach oben, <= 33 nach unten - Drittel des Punktbereichs, dieselbe
     Skala, auf der die Komponente veroeffentlicht ist. */
  function drivers(components) {
    var avail = components.filter(function (c) { return c.state === "AVAILABLE"; });
    var byImpact = function (a, b) { return (b.weight || 0) - (a.weight || 0); };
    return {
      up: avail.filter(function (c) { return c.score >= 67; }).sort(byImpact),
      down: avail.filter(function (c) { return c.score <= 33; }).sort(byImpact)
    };
  }
  function driverText(c) { return c.label + (c.value ? " " + c.value : ""); }

  function factorView(f, ctx) {
    ctx = ctx || {};
    var meta = FACTORS[f.id] || { name: f.label || f.id, question: f.question || "", measures: f.plain || "" };
    var available = f.state === "AVAILABLE" && isNum(f.score);
    var b = available ? band(f.score) : null;
    var components = (f.components || []).map(function (c) { return componentView(c, f.id); });
    var dr = drivers(components);
    var missing = components.filter(function (c) { return c.state !== "AVAILABLE"; });
    var why;
    if (!available) why = reasonText(f.reason, f.reasonText);
    else {
      var parts = [];
      if (dr.up.length) parts.push("Stark: " + dr.up.slice(0, 2).map(driverText).join(", "));
      if (dr.down.length) parts.push("Schwach: " + dr.down.slice(0, 2).map(driverText).join(", "));
      why = parts.length ? parts.join(". ") + "." : "Keine einzelne Kennzahl sticht heraus; die Werte liegen im Mittelfeld.";
    }
    var rank = available && ctx.distribution ? rankIn(ctx.distribution[f.id], f.score) : null;
    return {
      id: f.id, name: meta.name, method: meta.method || f.id, question: meta.question,
      measures: meta.measures, notMeasures: meta.notMeasures || null, higher: meta.higher || f.higherMeans || null,
      state: available ? "AVAILABLE" : "UNAVAILABLE",
      score: available ? f.score : null, band: b,
      word: b ? bandWord(f.id, b) : null,
      label: available ? factorLabel(f.id, f.score) : "Nicht bewertbar",
      tone: b ? TONE[b] : "unknown",
      why: why, drivers: dr,
      components: components,
      coverage: isNum(f.coverage) ? f.coverage : null,
      coverageText: components.length ? (components.length - missing.length) + " von " + components.length + " Kennzahlen vorhanden" : null,
      confidence: f.confidenceBand ? f.confidenceBand.label : null,
      reference: referenceText(f, ctx.record),
      rank: rank, rankText: rankSentence(rank),
      missingText: !available ? reasonText(f.reason, f.reasonText) : null,
      reason: available ? null : (f.reason || "UNAVAILABLE")
    };
  }

  /* Warum eine Unternehmensart eigene Kennzahlen bekommt - in
     Alltagssprache, je Vorlage ein eigener Satz. */
  var TEMPLATE_PLAIN = {
    BALANCE_SHEET_FINANCIAL: "Bei Banken und bilanzbasierten Finanzunternehmen ist die Bilanz das Geschäft selbst: Umsatz- und Margenkennzahlen passen nicht, deshalb zählen Eigenkapital, Ertrag auf die Bilanzsumme und Ausschüttungsdeckung",
    INSURANCE_CARRIER: "Versicherer verwalten Beiträge ihrer Kunden in der Bilanz: statt Bruttomarge und Verschuldung zählen Eigenkapital, stabile Erträge und Ertrag auf das eingesetzte Kapital",
    REAL_ESTATE_TRUST: "REITs schütten fast alle Gewinne aus und bilanzieren hohe Abschreibungen auf Immobilien: gemessen werden deshalb Zahlungsfluss, Ausschüttungsdeckung und Ertrag auf die Bilanzsumme"
  };
  var TEMPLATE_NAME = { BALANCE_SHEET_FINANCIAL: "Banken und bilanzbasierte Finanzunternehmen", INSURANCE_CARRIER: "Versicherer", REAL_ESTATE_TRUST: "Immobilien-REITs" };
  function referenceText(f, record) {
    var p = f.peer || (record && record.peer) || null;
    var tmpl = record && record.template;
    var parts = [];
    if (tmpl && tmpl.id) parts.push((TEMPLATE_PLAIN[tmpl.id] || "Für diese Unternehmensart gilt eine eigene Vorlage mit passenden Kennzahlen") +
      " (Branchenvorlage „" + (TEMPLATE_NAME[tmpl.id] || tmpl.label || tmpl.id) + "“" + (tmpl.version ? ", Fassung " + tmpl.version : "") + ")");
    if (p && p.level === "sic4_industry") parts.push("verglichen mit Unternehmen derselben Branche (SIC " + p.industry + ") und dem Gesamtmarkt, gewichtet 70 : 30");
    else if (p && p.level === "sic_division") parts.push("verglichen mit Unternehmen desselben Wirtschaftszweigs und dem Gesamtmarkt, gewichtet 70 : 30");
    else parts.push("verglichen mit allen bewerteten Aktien");
    return capital(parts.join("; ")) + ".";
  }

  /* ---------------------------------------- Kursstaerke vs. Anlegerrendite

     Option C: die Kursentwicklung (Momentum-Komponente, ohne Ausschuettung)
     und die Anlegerrendite (mit Ausschuettungen) stehen nebeneinander - nur
     fuer Zeitraeume, fuer die BEIDE eine Zahl haben. Ein halbes Paar
     erklaert den Unterschied nicht, sondern verdeckt ihn. */
  function returnKinds(record) {
    if (!record || !Array.isArray(record.factors)) return null;
    var m = record.factors.filter(function (f) { return f.id === "momentum"; })[0];
    var comp = function (id) { var c = ((m && m.components) || []).filter(function (x) { return x.id === id; })[0]; return c && c.state === "AVAILABLE" && isNum(c.raw) ? c.raw : null; };
    var inv = record.investorReturn || { state: "UNAVAILABLE" };
    var anl = function (k) { if (inv.state !== "AVAILABLE") return null; var v = k === null ? inv.return12M1M : inv.returns && inv.returns[k]; return isNum(v) ? v : null; };
    var rows = [["3 Monate", "priceReturn3m", "3M"], ["6 Monate", "priceReturn6m", "6M"], ["12 Monate ohne den letzten", "priceReturn12m1m", null]]
      .map(function (r) { return { label: r[0], price: comp(r[1]), investor: anl(r[2]) }; })
      .filter(function (r) { return isNum(r.price) && isNum(r.investor); });
    if (!rows.length) return { state: "UNAVAILABLE", rows: [] };
    var widest = rows.reduce(function (a, r) { return Math.abs(r.investor - r.price) > Math.abs(a.investor - a.price) ? r : a; }, rows[0]);
    var gap = widest.investor - widest.price;
    return { state: "AVAILABLE", rows: rows.map(function (r) { return { label: r.label, price: pct(r.price, 1, true), investor: pct(r.investor, 1, true), priceRaw: r.price, investorRaw: r.investor }; }),
      text: Math.abs(gap) < 0.0005 ? "Kein Unterschied: In diesen Zeiträumen gab es keine Ausschüttungen, die die reine Kursbewegung übersteigen."
        : "Über " + widest.label + " lagen die Ausschüttungen bei " + pct(Math.abs(gap), 1) + " – so viel mehr, als die reine Kursbewegung zeigt." };
  }

  /* ------------------------------------------------ Gesamteinordnung */

  var OVERALL = {
    KEINE_DATEN: { text: "Zu wenig Daten für eine Einordnung", tone: "unknown" },
    UEBERWIEGEND_STARK: { text: "Überwiegend stark", tone: "good" },
    MEHR_STAERKEN: { text: "Mehr Stärken als Schwächen", tone: "good" },
    GEMISCHT: { text: "Gemischtes Bild", tone: "neutral" },
    MEHR_SCHWAECHEN: { text: "Mehr Schwächen als Stärken", tone: "bad" },
    UEBERWIEGEND_SCHWACH: { text: "Überwiegend schwach", tone: "bad" }
  };

  /**
   * Die Einordnung eines Titels. Keine Gesamtnote: gezaehlt wird, wie
   * viele der BEWERTETEN Faktoren ueber und unter dem Mittelfeld liegen
   * (dieselbe Regel wie quant/engines/plain-verdict.js). Der Nenner ist
   * die Zahl der bewerteten Faktoren, nicht sieben.
   */
  function overall(factors) {
    var PV = (typeof module !== "undefined" && module.exports) ? require("../engines/plain-verdict.js") : global.VUPlainVerdict;
    var rated = factors.filter(function (f) { return f.state === "AVAILABLE"; });
    /* Dieselbe Regel wie ueberall im Produkt: quant/engines/plain-verdict.js.
       Diese Datei zaehlt nicht selbst - zwei Regeln fuer eine Stufe
       waeren zwei Wahrheiten. */
    var u = PV.urteil(factors.map(function (f) {
      return { id: f.id, state: f.state, score: f.score, band: f.band };
    }));
    /* Die Stufe ist die der Engine - auch bei wenigen gemessenen
       Eigenschaften; der Satz darunter sagt dann, wie wenige es sind. */
    var id = u.stufeId;
    var sub = rated.length < 3
      ? (rated.length ? "Nur " + rated.length + " von " + factors.length + " Eigenschaften lassen sich messen – ein dünnes Bild." : "Keine der sieben Eigenschaften lässt sich für diesen Titel messen.")
      : u.stark + " von " + u.bewertet + " gemessenen Eigenschaften stark, " + u.schwach + " schwach, " + u.mittel + " im Mittelfeld.";
    return { id: id, text: OVERALL[id].text, tone: OVERALL[id].tone, sub: sub,
      rated: u.bewertet, strong: u.stark, weak: u.schwach, middle: u.mittel, total: factors.length,
      open: u.luecke, openText: u.luecketext || null };
  }

  function proCon(factors) {
    var pro = [], con = [], open = [], middle = [];
    factors.forEach(function (f) {
      if (f.state !== "AVAILABLE") { open.push({ factorId: f.id, title: f.name, text: f.missingText }); return; }
      var item = { factorId: f.id, title: f.name + ": " + f.word, score: f.score, label: f.label };
      if (f.tone === "good") {
        item.text = f.drivers.up.length ? f.drivers.up.slice(0, 2).map(driverText).join(" · ") : f.question;
        if (f.drivers.down.length) item.caveat = "Aber: " + driverText(f.drivers.down[0]);
        pro.push(item);
      } else if (f.tone === "bad") {
        item.text = f.drivers.down.length ? f.drivers.down.slice(0, 2).map(driverText).join(" · ") : f.question;
        if (f.drivers.up.length) item.caveat = "Dagegen stark: " + driverText(f.drivers.up[0]);
        con.push(item);
      } else middle.push(item);
    });
    return { pro: pro, con: con, open: open, middle: middle };
  }

  /* ------------------------------------------------------------ Change */

  var CHANGE_TEXT = {
    momentumPace: { IMPROVING: "Kursstärke gewinnt an Tempo", DETERIORATING: "Kursstärke verliert an Tempo", STABLE: "Kurstempo unverändert" },
    relativeStrengthPace: { IMPROVING: "Läuft zuletzt besser als der Markt", DETERIORATING: "Läuft zuletzt schwächer als der Markt", STABLE: "Vorsprung gegenüber dem Markt unverändert" },
    volatilityRegime: { IMPROVING: "Der Kurs beruhigt sich", DETERIORATING: "Der Kurs wird unruhiger", STABLE: "Schwankung unverändert" },
    volumeRegime: { IMPROVING: "Mehr Handel als zuletzt", DETERIORATING: "Weniger Handel als zuletzt", STABLE: "Handelsvolumen unverändert" },
    trendStructure: { IMPROVING: "Kurs über allen vier Durchschnittslinien", DETERIORATING: "Kurs unter allen vier Durchschnittslinien", STABLE: "Gemischte Trendstruktur" },
    highProximity: { IMPROVING: "Nahe am 52-Wochen-Hoch", DETERIORATING: "Weit unter dem 52-Wochen-Hoch", STABLE: "Mit Abstand zum 52-Wochen-Hoch" },
    revenueAcceleration: { IMPROVING: "Umsatzwachstum beschleunigt sich", DETERIORATING: "Umsatzwachstum verlangsamt sich", STABLE: "Umsatztempo unverändert" },
    grossMarginChange: { IMPROVING: "Bruttomarge steigt", DETERIORATING: "Bruttomarge sinkt", STABLE: "Bruttomarge unverändert" },
    fcfMarginChange: { IMPROVING: "Cashflow-Marge steigt", DETERIORATING: "Cashflow-Marge sinkt", STABLE: "Cashflow-Marge unverändert" }
  };
  var CHANGE_GROUP = { momentumPace: "Kurs", relativeStrengthPace: "Kurs", volatilityRegime: "Kurs", volumeRegime: "Kurs",
    trendStructure: "Kurs", highProximity: "Kurs", revenueAcceleration: "Geschäft", grossMarginChange: "Geschäft", fcfMarginChange: "Geschäft" };

  function changeValue(v) {
    if (!v || !isNum(v.value)) return null;
    return (v.label ? v.label + " " : "") + (v.unit === "ratio" ? pct(v.value, 1, false) : de(v.value, 2));
  }

  function changeView(change) {
    if (!change || change.state !== "AVAILABLE" || !Array.isArray(change.items)) {
      return { state: "UNAVAILABLE", items: [], open: [], text: "Für diesen Titel liegt noch keine Veränderungsmessung vor.", asOf: null };
    }
    var items = [], open = [];
    change.items.forEach(function (i) {
      if (i.state !== "AVAILABLE" || !i.direction) { open.push({ id: i.id, label: i.label, text: reasonText(i.reason, i.reasonText) }); return; }
      var map = CHANGE_TEXT[i.id];
      items.push({
        id: i.id, label: i.label, group: CHANGE_GROUP[i.id] || "Kurs",
        direction: i.direction, tone: i.direction === "IMPROVING" ? "good" : i.direction === "DETERIORATING" ? "bad" : "neutral",
        text: (map && map[i.direction]) || (i.label + (i.direction === "IMPROVING" ? " verbessert sich" : i.direction === "DETERIORATING" ? " verschlechtert sich" : " unverändert")),
        how: i.plain || null, window: i.window || null,
        from: changeValue(i.from), to: changeValue(i.to)
      });
    });
    var up = items.filter(function (i) { return i.tone === "good"; }), down = items.filter(function (i) { return i.tone === "bad"; });
    function n(k, one, many) { return k === 1 ? "1 Signal " + one : k + " Signale " + many; }
    var text = !items.length ? "Keine messbare Veränderung."
      : up.length && down.length ? n(up.length, "verbessert sich", "verbessern sich") + ", " + n(down.length, "verschlechtert sich", "verschlechtern sich") + "."
      : up.length ? n(up.length, "verbessert sich", "verbessern sich") + ", keines verschlechtert sich."
      : down.length ? n(down.length, "verschlechtert sich", "verschlechtern sich") + ", keines verbessert sich."
      : "Keine deutliche Veränderung.";
    return { state: "AVAILABLE", items: items, open: open, text: text, asOf: change.asOf || null,
      headline: items.filter(function (i) { return i.tone !== "neutral"; }).slice(0, 3).map(function (i) { return i.text; }) };
  }

  /* ------------------------------------------------------------- Setup */

  var SETUP_STAGES = [
    { id: "NO_SETUP", label: "Kein Setup", short: "Nichts zu sehen" },
    { id: "WATCH", label: "Beobachten", short: "Trend trägt, noch keine Situation" },
    { id: "SETUP_FORMING", label: "Setup entsteht", short: "Aufbau vollständig, Auslöser fehlt" },
    { id: "CONFIRMED", label: "Setup bestätigt", short: "Alle Bedingungen erfüllt" }
  ];
  var SETUP_LATE = { ACTIVE: "Trend läuft", RISK_RISING: "Risiko steigt", INVALIDATED: "Setup nicht mehr gültig", EXIT: "Ausstiegsbedingung erreicht" };
  function setupLabel(state) {
    var w = lang(state);
    if (w) return w;
    for (var i = 0; i < SETUP_STAGES.length; i++) if (SETUP_STAGES[i].id === state) return SETUP_STAGES[i].label;
    return SETUP_LATE[state] || null;
  }

  var FIELD_WORD = {
    technicalTrend: "Trend", technicalSetupStatus: "Aufbau des Setups", technicalMomentum: "Kursdynamik",
    technicalVolatility: "Schwankung", technicalVolume: "Handelsvolumen", technicalTrigger: "Auslöser",
    technicalConfluence: "Übereinstimmung der Signale", technicalOpportunity: "Chance-Risiko-Lage",
    technicalStructure: "Kursstruktur", technicalRiskReward: "Chance-Risiko-Verhältnis"
  };
  var VALUE_WORD = {
    BULLISH: "aufwärts", BEARISH: "abwärts", NEUTRAL: "seitwärts", COMPLETE: "vollständig", PARTIAL: "teilweise",
    NONE: "keins", POSITIVE: "positiv", NEGATIVE: "negativ", LOW: "niedrig", HIGH: "hoch", NORMAL: "normal",
    RISING: "steigend", FALLING: "fallend", TRIGGERED: "ausgelöst", PENDING: "ausstehend", EXPANDING: "steigend", CONTRACTING: "fallend"
  };
  /* Das gemeinsame Woerterbuch (quant/methodology/product-language-v1.json)
     hat Vorrang - dieselben Worte wie ueberall im Produkt. Die Tabellen
     oben sind nur der Rueckfall, falls es nicht geladen werden konnte. */
  var language = null;
  function useLanguage(lang) { language = lang && typeof lang.has === "function" ? lang : null; }
  function lang(id) {
    try { return language && language.has(id) ? language.label(id) : null; } catch (e) { return null; }
  }
  function humanField(c) {
    return lang(c.field) || FIELD_WORD[c.field] || (c.label && c.label.replace(/^Technical /, "")) || c.field || "Bedingung";
  }
  var Catalog = (typeof module !== "undefined" && module.exports) ? require("../engines/catalog.js") : global.VUCatalog;
  function fieldUnit(field) {
    try { var f = Catalog && field && Catalog.field(field); return f ? f.unit : null; } catch (e) { return null; }
  }
  function humanValue(v, field) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(function (x) { return humanValue(x, field); }).filter(Boolean).join(" oder ");
    /* Die Einheit steht im Katalog: ein Verhaeltnis wird als Prozent
       gelesen (-0,15 ist ein Abstand von 15 %). */
    if (typeof v === "number") return fieldUnit(field) === "ratio" ? pct(v, 1) : de(v, 2);
    if (typeof v === "boolean") return v ? "ja" : "nein";
    /* Kein Eintrag: der rohe Wert bleibt draussen. */
    return (field && lang(field + "." + v)) || VALUE_WORD[v] || null;
  }
  function conditionView(c) {
    var measurable = c.measurable !== false;
    return {
      label: humanField(c),
      state: !measurable ? "OPEN" : c.met ? "MET" : "NOT_MET",
      demand: c.operator === "isNotNull" ? "muss vorliegen" : (humanValue(c.demand, c.field) ? "verlangt " + humanValue(c.demand, c.field) : null),
      value: humanValue(c.value, c.field) ? "aktuell " + humanValue(c.value, c.field) : null,
      raw: (c.field || c.input || "") + " " + (c.operator || "") + " " + JSON.stringify(c.demand === undefined ? null : c.demand)
    };
  }

  function setupView(brief, observation) {
    var s = brief && brief.setup;
    if (!s || !s.state || s.state === "UNAVAILABLE") {
      return { state: "UNAVAILABLE", text: "Für diesen Titel liegt keine Setup-Beobachtung vor.",
        reason: s && s.reason, stages: SETUP_STAGES };
    }
    var idx = -1;
    SETUP_STAGES.forEach(function (st, i) { if (st.id === s.state) idx = i; });
    var levels = observation && observation.levels || {};
    return {
      state: s.state, label: setupLabel(s.state) || s.label, stageIndex: idx, stages: SETUP_STAGES,
      where: s.sentence || null,
      why: s.why && s.why.sentence ? s.why.sentence : null,
      next: s.next ? { label: s.next.label ? setupLabel(s.next.state) || s.next.label : null, text: s.next.sentence,
        conditions: (s.next.open || []).map(conditionView) } : null,
      invalidation: s.invalidation ? { text: s.invalidation.sentence, conditions: (s.invalidation.conditions || []).map(conditionView),
        price: isNum(levels.invalidationPrice) ? levels.invalidationPrice : null } : null,
      conditions: ((observation && observation.conditions) || []).map(conditionView),
      asOf: s.asOf || (observation && observation.asOf) || null,
      previous: observation && observation.previous ? { label: setupLabel(observation.previous.setupState), asOf: observation.previous.asOf } : null
    };
  }

  /* ---------------------------------------------------------- Strategie */

  function conditionLabel(label) {
    return String(label || "").replace(/^Quant V2 · /, "").replace(/^Qualität$/, FACTORS.quality.name);
  }
  /* Jeder Grund des Strategy-Match-Vertrags hat einen eigenen Satz: "nichts
     messbar" ist ein Ergebnis, kein Ladefehler. */
  var STRATEGY_REASON = {
    INSUFFICIENT_MEASURABLE_WEIGHT: "Für diese Aktie ist zu wenig vom Gewicht der Bedingungen messbar – ein Anlagestil lässt sich nicht belastbar prüfen. Das ist ein Ergebnis der Prüfung, kein Ladefehler.",
    INSUFFICIENT_MEASURABLE_CONDITIONS: "Für diese Aktie sind weniger als zwei Bedingungen eines Anlagestils messbar. Ein Stil wird deshalb nicht zugeordnet.",
    NO_EVIDENCE: "Für diese Aktie liegt keine Faktoranalyse vor, gegen die sich ein Anlagestil prüfen ließe."
  };
  var STRATEGY_LOAD_FAILURE = "Für diesen Titel lässt sich kein Anlagestil prüfen – die dafür nötigen Faktorwerte fehlen.";
  function strategyView(match, brief) {
    if (!match) return { state: "UNAVAILABLE", text: STRATEGY_LOAD_FAILURE };
    if (match.state !== "AVAILABLE" || !Array.isArray(match.profiles)) {
      return { state: "UNAVAILABLE", reason: match.reason || null, text: STRATEGY_REASON[match.reason] || reasonText(match.reason, STRATEGY_LOAD_FAILURE) };
    }
    var profiles = match.profiles.filter(function (p) { return p.state === "AVAILABLE" && isNum(p.match); })
      .sort(function (a, b) { return b.match - a.match; });
    if (!profiles.length) {
      var r = (match.profiles[0] && match.profiles[0].reason) || "INSUFFICIENT_MEASURABLE_CONDITIONS";
      return { state: "UNAVAILABLE", reason: r, text: STRATEGY_REASON[r] || STRATEGY_LOAD_FAILURE };
    }
    var best = profiles[0];
    function conds(p) {
      return (p.conditions || []).map(function (c) {
        var st = c.state === "MET" ? "MET" : c.state === "NOT_MET" ? "NOT_MET" : "OPEN";
        return { label: conditionLabel(c.label), state: st,
          value: isNum(c.value) ? Math.round(c.value) : null, threshold: c.threshold, operator: c.operator,
          text: conditionLabel(c.label) + (isNum(c.value) ? " " + Math.round(c.value) : " ohne Wert") + " · verlangt " + (c.operator === "gte" ? "mindestens " : c.operator === "lte" ? "höchstens " : "") + c.threshold,
          demand: "verlangt " + (c.operator === "gte" ? "mindestens " : c.operator === "lte" ? "höchstens " : "") + c.threshold,
          value2: isNum(c.value) ? "aktuell " + Math.round(c.value) : null,
          rationale: c.rationale || null };
      });
    }
    function counted(list) {
      var met = list.filter(function (c) { return c.state === "MET"; }).length;
      var notMet = list.filter(function (c) { return c.state === "NOT_MET"; }).length;
      var open = list.length - met - notMet;
      return met + " von " + (met + notMet) + " messbaren Bedingungen erfüllt" +
        (open ? " · " + open + " weitere " + (open === 1 ? "ist" : "sind") + " nicht messbar und " + (open === 1 ? "zählt" : "zählen") + " weder als erfüllt noch als verletzt" : "");
    }
    var bestConds = conds(best);
    /* "Passt" nur, wenn keine Bedingung verletzt oder offen ist. Eine gute
       Uebereinstimmung (Band des Vertrags) heisst "am ehesten"; darunter
       steht der Befund, dass nichts gut passt - und der naechste Stil. */
    var fits = bestConds.every(function (c) { return c.state === "MET"; });
    var scaled = best.match <= 1 ? best.match * 100 : best.match;
    var good = best.band ? (best.band === "FIT" || best.band === "STRONG_FIT") : scaled >= 70;
    var sentence = fits ? "Passt aktuell zu " + best.label + "."
      : good ? "Am ehesten passt die Aktie aktuell zu " + best.label + "."
      : "Zu keinem Anlagestil passt dieser Titel derzeit gut. Am nächsten kommt " + best.label + ".";
    return {
      state: "AVAILABLE", sentence: sentence, fits: fits, good: good,
      best: { id: best.profileId, label: best.label, plain: best.plain, risk: best.mainRisk, match: best.match,
        bandLabel: best.bandLabel, fits: fits, countText: counted(bestConds),
        met: bestConds.filter(function (c) { return c.state === "MET"; }),
        notMet: bestConds.filter(function (c) { return c.state === "NOT_MET"; }),
        open: bestConds.filter(function (c) { return c.state === "OPEN"; }) },
      others: profiles.slice(1).map(function (p) { var cs = conds(p); return { id: p.profileId, label: p.label, match: p.match, bandLabel: p.bandLabel, conditions: cs, countText: counted(cs) }; }),
      methodologyVersion: match.methodologyVersion || null
    };
  }

  /* Wechsel der Stil-Zuordnung zwischen zwei veroeffentlichten Staenden.
     Beide Daten stehen im Satz - "seit gestern" liest sich wie ein
     Ereignis von heute, und das ist es nicht. */
  function assignmentChangeText(change) {
    if (!change || (change.state !== "CHANGED" && change.state !== "NO_CHANGE")) return null;
    var span = "zwischen den veröffentlichten Ständen vom " + dateDe(change.from) + " und " + dateDe(change.to);
    if (change.state === "NO_CHANGE") return "An der Zuordnung zu den Anlagestilen hat sich " + span + " nichts geändert.";
    var parts = [];
    if ((change.entered || []).length) parts.push("neu erfüllt: " + change.entered.map(function (e) { return e.label; }).join(", "));
    if ((change.exited || []).length) parts.push("nicht mehr erfüllt: " + change.exited.map(function (e) { return e.label; }).join(", "));
    return "Veränderung " + span + " – " + parts.join(" · ") + ". Eine Beobachtung zwischen zwei Ständen – kein Ereignis von heute, kein Signal und keine Prognose.";
  }
  function dateDe(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : String(iso || "–"); }

  /* -------------------------------------------------- Historical Replay */

  function replayView(cases, brief, patterns) {
    var out = { levels: [] };
    /* Ebene 1 und 2: die eigene Historie des Titels. */
    if (cases && cases.state === "AVAILABLE") {
      var hz = ["m1", "m3", "m6", "m12"].map(function (k) {
        var h = cases.horizons && cases.horizons[k];
        if (!h) return null;
        return { id: k, label: h.label, sufficient: !!h.sufficient, completed: h.completed, open: h.open,
          median: h.sufficient && isNum(h.medianReturn) ? pct(h.medianReturn, 1, true) : null,
          medianRaw: h.sufficient ? h.medianReturn : null,
          positive: h.sufficient && isNum(h.positive) ? h.positive : null,
          positiveText: h.sufficient && isNum(h.positive) ? h.positive + " von " + h.completed + " Fällen im Plus" : null,
          drawdown: h.sufficient && isNum(h.medianDrawdown) ? pct(h.medianDrawdown, 1) : null,
          lastCase: h.lastCaseDate || null,
          /* historical-cases-1.1.0: weitere Lesarten derselben Faelle -
             alle nur, wenn die Schwelle erreicht ist. */
          positiveShare: h.sufficient && isNum(h.positiveShare) ? h.positiveShare : null,
          positivePct: h.sufficient && isNum(h.positiveShare) ? Math.round(h.positiveShare * 100) + " %" : null,
          mean: h.sufficient && isNum(h.meanReturn) ? pct(h.meanReturn, 1, true) : null,
          worstDrawdown: h.sufficient && isNum(h.worstDrawdown) ? pct(h.worstDrawdown, 1) : null,
          chanceRisk: h.sufficient && isNum(h.chanceRisk) ? h.chanceRisk : null,
          quartiles: h.sufficient && Array.isArray(h.quartiles) ? h.quartiles : null,
          distribution: h.sufficient && Array.isArray(h.distribution) ? h.distribution : null,
          evidence: h.evidence || (h.sufficient ? "THIN" : "WITHHELD") };
      }).filter(Boolean);
      var enough = hz.some(function (h) { return h.sufficient; });
      out.levels.push({
        id: "SAME_STOCK", title: "Ähnliche Kurslagen bei dieser Aktie",
        conditions: cases.conditionsPlain || cases.conditions || [],
        episodes: cases.episodes, minEpisodes: cases.minEpisodes, from: cases.from, to: cases.to,
        state: enough ? "AVAILABLE" : "INSUFFICIENT",
        text: enough
          ? cases.episodes + " vergleichbare Situationen seit " + String(cases.from).slice(0, 4) + "."
          : "Zu wenige historische Vergleichsfälle: " + (cases.episodes || 0) + " " + ((cases.episodes || 0) === 1 ? "Fall" : "Fälle") + ", nötig sind mindestens " + (cases.minEpisodes || 10) + ". Ein Median aus so wenigen Fällen wäre Zufall – deshalb wird keiner gezeigt.",
        horizons: hz, limits: cases.limits || []
      });
    } else {
      var pu = patterns && patterns.unavailability;
      out.levels.push({ id: "SAME_STOCK", title: "Ähnliche Kurslagen bei dieser Aktie", state: "UNAVAILABLE",
        text: patternReasonText(pu) || (cases && cases.reason === "INSUFFICIENT_HISTORY"
          ? "Die Kurshistorie dieser Aktie ist zu kurz für historische Vergleiche."
          : "Für diese Aktie liegt keine auswertbare Kurshistorie für Vergleichsfälle vor."), horizons: [] });
    }
    /* Ebene 3: marktweite Musterforschung. */
    var p = brief && brief.pattern;
    if (p && p.state === "AVAILABLE") {
      out.levels.push({ id: "MARKET_WIDE", title: "Ähnliche Situationen im gesamten Markt", state: "AVAILABLE",
        text: p.sentence, upside: p.upside, downside: p.downside, sample: p.sampleSentence, robust: p.robustSentence,
        coverage: patterns && patterns.coverage ? patterns.coverage : null,
        coverageText: patterns && patterns.coverage && patterns.coverage.notMeasurable > 0
          ? patterns.coverage.notMeasurable + " der vorregistrierten Muster sind für diese Aktie nicht prüfbar, weil ein Merkmal fehlt; geprüft wurden " + patterns.coverage.measurable + "."
          : null,
        direction: p.direction, horizonMonths: patterns && patterns.horizonMonths || 24,
        holds: p.holds });
    } else {
      out.levels.push({ id: "MARKET_WIDE", title: "Ähnliche Situationen im gesamten Markt", state: "UNAVAILABLE",
        text: patternReasonText(patterns && patterns.unavailability) || "Für diese Aktie trifft derzeit kein belastbares Marktmuster zu." });
    }
    out.isNot = "Das ist keine Prognose: Es beschreibt, was in der Vergangenheit geschah – nicht, was geschehen wird.";
    return out;
  }

  /* ------------------------------------ Warum eine Auswertung fehlt

     Uebernommen aus der bisherigen Oberflaeche (dort gemessen und belegt):
     jeder Grund, den die Producer liefern, hat einen deutschen Satz - mit
     Zahl, wo es eine gibt. Ein unbekannter Code fuehrt zu null, nie zu
     einem rohen Enum-Wert auf der Seite. */
  function num0(v) { return v.toLocaleString("de-DE"); }
  var TECHNICAL_REASON = {
    INSUFFICIENT_HISTORY: function (u) {
      return u.bars !== null && u.requiredBars !== null && u.bars !== undefined && u.requiredBars !== undefined
        ? "Diese Auswertung benötigt " + num0(u.requiredBars) + " Handelstage; für diesen Titel liegen " + num0(u.bars) + " vor."
        : "Für diesen Titel liegen noch zu wenige Handelstage vor.";
    },
    NOT_TECHNICAL_READY: function () { return "Dieser Titel ist im geprüften Datenbestand für diese Auswertung noch nicht vorgemerkt."; },
    TECHNICAL_CALENDAR_INVALID: function () { return "Im Auswertungsfenster liegt ein Tag, für den der geprüfte Börsenkalender keine gesicherte Sitzungsaussage hat. Ohne sie wird hier nichts veröffentlicht."; },
    TECHNICAL_WINDOW_OUTSIDE_CALENDAR: function (u) {
      var d = u.detail || {};
      var spanne = d.windowFirst && d.windowLast ? " Die letzten " + (d.windowSessions || 270) + " Kurstage dieses Titels reichen von " + d.windowFirst + " bis " + d.windowLast + "." : "";
      return "Dieser Titel wird so selten gehandelt, dass das Auswertungsfenster weit in die Vergangenheit reicht." + spanne +
        " Eine Aussage über die aktuelle Kursstruktur wäre damit keine Aussage über die aktuelle Lage.";
    },
    TECHNICAL_SESSION_NOT_A_TRADING_DAY: function (u) {
      var tag = u.detail && u.detail.nonTradingDay ? u.detail.nonTradingDay : null;
      return "Die Kurshistorie dieses Titels enthält einen Kurstag an einem Tag, an dem die Börse geschlossen war" +
        (tag ? " (" + tag + ")" : "") + ". Bis das geklärt ist, wird aus dieser Reihe keine Kursstruktur veröffentlicht.";
    },
    SOURCE_MISSING: function () { return "Für diesen Titel liegt keine geprüfte Kurshistorie vor."; },
    INVALID_HISTORY_PROVENANCE: function () { return "Die Kurshistorie dieses Titels hat die Herkunftsprüfung nicht bestanden."; },
    INVALID_HISTORY_BAR: function () { return "Ein Kurstag dieses Titels hat die Plausibilitätsprüfung nicht bestanden."; },
    INVALID_HISTORY_OBSERVED_AT: function () { return "Der Beobachtungszeitpunkt der Kurshistorie ist nicht belegt."; },
    INVALID_CANONICAL_SERIES: function () { return "Die aufbereitete Kursreihe hat die Schlussprüfung nicht bestanden."; },
    TECHNICAL_PARTIAL: function () { return "Die Auswertung blieb unvollständig und wird deshalb nicht veröffentlicht."; }
  };
  var PATTERN_REASON = {
    INSUFFICIENT_WEEKLY_HISTORY: function (u) {
      return u.weeks !== null && u.requiredWeeks !== null && u.weeks !== undefined && u.requiredWeeks !== undefined
        ? "Dieser Vergleich braucht " + num0(u.requiredWeeks) + " Wochen Kurshistorie; für diesen Titel liegen " + num0(u.weeks) + " vor."
        : "Die Kurshistorie dieses Titels ist für diesen Vergleich noch zu kurz.";
    },
    NO_WEEKLY_SERIES: function () { return "Für diesen Titel ist keine Wochenreihe veröffentlicht, gegen die Muster geprüft werden könnten."; },
    NO_MEASURABLE_FEATURES: function () { return "Aus der Kursreihe dieses Titels ließen sich die verlangten Merkmale nicht messen."; },
    INVALID_SERIES_CONTRACT: function () { return "Die Wochenreihe dieses Titels hat die Herkunftsprüfung nicht bestanden."; }
  };
  function technicalReasonText(u) {
    if (!u || typeof u.reason !== "string") return null;
    var f = TECHNICAL_REASON[u.reason] || (u.reason.indexOf("TECHNICAL_CONTRACT_") === 0 ? TECHNICAL_REASON.TECHNICAL_PARTIAL : null);
    return f ? f(u) : null;
  }
  function patternReasonText(u) {
    if (!u || typeof u.reason !== "string") return null;
    var f = PATTERN_REASON[u.reason];
    return f ? f(u) : null;
  }
  /* Zwei Staende nebeneinander sind zwei Staende: liegt die Kursstruktur
     hinter dem Kurs, steht das da - mit Zahl. */
  function analysisLagText(lag) {
    if (!lag || !isNum(lag.lagSessions) || lag.lagSessions < 1) return null;
    var tage = lag.lagSessions === 1 ? "einen Handelstag" : lag.lagSessions + " Handelstage";
    return "Diese Auswertung steht auf dem Stand " + lag.analysisAsOf + " und liegt damit " + tage +
      " hinter dem veröffentlichten Kursstand (" + lag.priceAsOf + "). Der Kursverlauf ist aktuell; die Kursstruktur beschreibt den älteren Stand.";
  }

  /* Zwei Quellen, zwei Firmennamen: die Seite sagt es, entscheidet es
     aber nicht (naming-contract). */
  var IDENTITY_REASON = {
    D: "Die beiden Quellen nennen verschiedene Zahlwörter im Firmennamen. Bei Nachfolgegesellschaften und Serien sind das zwei verschiedene Unternehmen.",
    F: "Die beiden Quellen nennen Firmennamen ohne ein gemeinsames Wort, und die Verknüpfung stützt sich nur auf das Kürzel.",
    G: "Die beiden Quellen nennen verschiedene Firmennamen. Ob es eine Umbenennung ist oder ein wiederverwendetes Kürzel, lässt sich aus den vorliegenden Angaben nicht entscheiden."
  };
  function identityNote(stock) {
    var k = stock && stock.identityConflict;
    if (!k) return null;
    return {
      title: "Zu diesem Kürzel liegen zwei verschiedene Firmennamen vor.",
      shown: "Angezeigt wird „" + (stock.name || stock.ticker) + "“." + (k.alternativeName ? " Eine andere Quelle nennt „" + k.alternativeName + "“." : ""),
      why: (IDENTITY_REASON[k.kind] || "Die Quellen sind über die Zuordnung uneins.") +
        " Die Geschäftszahlen stammen aus den Unterlagen der Gesellschaft, der dieses Kürzel im Wertpapierverzeichnis zugeordnet ist. Wir entscheiden diese Frage nicht, solange sie nicht belegt ist.",
      kind: k.kind || null, contract: k.contract || null
    };
  }

  /* ---------------------------------------------- Datenarmer Titel */

  /** Warum eine Analyse fehlt, mit Zahl, wo es eine gibt. */
  function gapSentence(g) {
    if (!g) return null;
    if (isNum(g.required) && isNum(g.available)) {
      return "Für diese Analyse werden " + de(g.required, 0) + " Handelstage benötigt; vorhanden sind " + de(g.available, 0) + ".";
    }
    return reasonText(g.reason, g.text);
  }

  /* -------------------------------------------------------- Aktie */

  /**
   * Das View Model der Aktienseite aus den Vertraegen der Product Services.
   * @param {object} src {stock, factors, brief, setup, match, cases, patterns, technical, distribution}
   */
  function stock(src) {
    src = src || {};
    var record = src.factors && src.factors.state === "AVAILABLE" ? src.factors : null;
    var ctx = { record: record, distribution: src.distribution || null };
    var byId = {};
    ((record && record.factors) || []).forEach(function (f) { byId[f.id] = f; });
    var factors = record ? ORDER.map(function (id) {
      return factorView(byId[id] || { id: id, state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", components: [] }, ctx);
    }) : [];
    return {
      version: VERSION,
      ticker: src.ticker || (record && record.ticker) || null,
      factorState: record ? "AVAILABLE" : "UNAVAILABLE",
      factorReason: record ? null : reasonText(src.factors && src.factors.reason),
      factors: factors,
      overall: record ? overall(factors) : null,
      proCon: record ? proCon(factors) : null,
      gaps: record ? gapGroups(factors) : [],
      returns: returnKinds(record),
      change: changeView(record && record.change),
      setup: setupView(src.brief, src.setup),
      strategy: strategyView(src.match, src.brief),
      replay: replayView(src.cases, src.brief, src.patterns),
      asOf: record ? { factors: record.asOf, fundamentals: record.fundamentalsAsOf, fundamentalsKnown: record.fundamentalsAvailableAt } : null,
      template: record && record.template ? record.template : null,
      isNot: "Keine Anlageempfehlung, keine Prognose, kein Kursziel und keine Gesamtnote."
    };
  }

  /* Screening-Zeile -> dieselbe Einordnung wie auf der Aktienseite. */
  function fromScreeningRow(row) {
    if (!row) return null;
    var factors = ORDER.map(function (id) {
      var v = row["quantV2.factorEvidence." + id];
      return factorView(isNum(v) ? { id: id, state: "AVAILABLE", score: v, components: [] } : { id: id, state: "UNAVAILABLE", reason: "INPUT_NOT_MATERIALIZED", components: [] });
    });
    return { factors: factors, overall: overall(factors) };
  }

  /* Fehlende Eigenschaften nach Grund gruppiert: ein Grund, einmal
     gesagt, mit den Namen der betroffenen Eigenschaften. Fuenf gleiche
     Absagen untereinander sehen aus wie eine kaputte Seite. */
  function gapGroups(factors) {
    var groups = [], by = {};
    (factors || []).forEach(function (f) {
      if (f.state === "AVAILABLE") return;
      var key = f.missingText || "";
      if (!by[key]) { by[key] = { text: key, names: [], ids: [] }; groups.push(by[key]); }
      by[key].names.push(f.name); by[key].ids.push(f.id);
    });
    return groups;
  }

  var api = {
    VERSION: VERSION, ORDER: ORDER, TEMPLATE_PLAIN: TEMPLATE_PLAIN, BAND_ORDER: BAND_ORDER, BAND_MIN: BAND_MIN, FACTORS: FACTORS,
    SETUP_STAGES: SETUP_STAGES, CHANGE_TEXT: CHANGE_TEXT, REASON: REASON,
    band: band, bandWord: bandWord, factorLabel: factorLabel, rankIn: rankIn, rankSentence: rankSentence,
    distributionOf: distributionOf, windowText: windowText, componentValue: componentValue, reasonText: reasonText, pct: pct,
    factorView: factorView, overall: overall, proCon: proCon, changeView: changeView, setupView: setupView,
    setupLabel: setupLabel, useLanguage: useLanguage, STRATEGY_REASON: STRATEGY_REASON, assignmentChangeText: assignmentChangeText, strategyView: strategyView, replayView: replayView, gapSentence: gapSentence,
    stock: stock, fromScreeningRow: fromScreeningRow, gapGroups: gapGroups, returnKinds: returnKinds,
    TECHNICAL_REASON: TECHNICAL_REASON, PATTERN_REASON: PATTERN_REASON,
    technicalReasonText: technicalReasonText, patternReasonText: patternReasonText, analysisLagText: analysisLagText,
    IDENTITY_REASON: IDENTITY_REASON, identityNote: identityNote
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.VUQuantViewModel = api;
})(typeof window !== "undefined" ? window : globalThis);
