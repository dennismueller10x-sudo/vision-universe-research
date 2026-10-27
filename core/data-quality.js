/* =========================================================================
   VISION UNIVERSE CORE — data-quality.js

   DETERMINISTISCHE DATENQUALITAETSREGELN.

   Jede Regel ist eine reine Funktion ueber bereits geladene Artefakte:
   gleiche Eingabe, gleiches Ergebnis, keine Zufallsstichprobe, kein I/O.
   scripts/core/data-quality.mjs laedt die Artefakte aus dem Repository und
   ruft run() auf. Jede Regel liefert:

     { id, title, severity: ERROR|WARN|INFO, status: PASS|FAIL,
       checked, failed, samples: [...], note }

   ERROR  verletzt eine Plattforminvariante (zwei Identitaeten, zwei
          Preiswahrheiten, kaputte Pfade) - --strict faellt.
   WARN   verdaechtig, verlangt einen Blick (Kurssprung, veraltete Reihe).
   INFO   Messung ohne Urteil.

   Regelkatalog: docs/data/DATA_QUALITY.md.
   UMD: globalThis.VUCore.DataQuality
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.DataQuality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "core-data-quality-1.0.0";
  var SAMPLE = 25;

  function result(id, title, severity, checked, failures, note) {
    return {
      id: id, title: title, severity: severity,
      status: failures.length ? "FAIL" : "PASS",
      checked: checked, failed: failures.length,
      samples: failures.slice(0, SAMPLE), note: note || null
    };
  }

  /* ------------------------------------------------------------ Identitaet */

  /** DQ-ID-1: jede securityId folgt der einen Regel (core/identity.js). */
  function idConsistency(sources, Identity) {
    var checked = 0, fail = [];
    Object.keys(sources).forEach(function (name) {
      (sources[name] || []).forEach(function (s) {
        if (!s || typeof s.ticker !== "string" || typeof s.securityId !== "string" || s.securityId.indexOf("ref_") !== 0) return;
        checked++;
        if (!Identity.consistent(s.ticker, s.securityId)) fail.push(name + ": " + s.ticker + " -> " + s.securityId + " (erwartet " + safeId(Identity, s.ticker) + ")");
      });
    });
    return result("DQ-ID-1", "securityId folgt der kanonischen Regel", "ERROR", checked, fail);
  }
  function safeId(Identity, t) { try { return Identity.securityIdForTicker(t); } catch (e) { return "ungueltig"; } }

  /** DQ-ID-2: keine doppelte securityId, kein doppelter Ticker im Produktuniversum. */
  function universeDuplicates(decisions) {
    var ids = {}, tickers = {}, fail = [];
    (decisions || []).forEach(function (d) {
      if (ids[d.securityId]) fail.push("securityId doppelt: " + d.securityId);
      if (tickers[d.ticker]) fail.push("Ticker doppelt: " + d.ticker);
      ids[d.securityId] = tickers[d.ticker] = true;
    });
    return result("DQ-ID-2", "Produktuniversum ohne doppelte Ticker/IDs", "ERROR", (decisions || []).length, fail);
  }

  /** DQ-ID-3: im Company Master hat ein aktives Symbol genau ein aktives Instrument. */
  function activeSymbolCollisions(instruments) {
    var by = {}, fail = [];
    (instruments || []).forEach(function (i) {
      if (!i.active) return;
      (by[i.symbol] = by[i.symbol] || []).push(i.instrumentId + "@" + i.exchange);
    });
    Object.keys(by).forEach(function (s) { if (by[s].length > 1) fail.push(s + ": " + by[s].join(", ")); });
    return result("DQ-ID-3", "Ein aktives Symbol = ein aktives Instrument (Company Master)", "WARN", Object.keys(by).length, fail,
      "Ticker-Joins (first match wins) haengen sonst Daten an das falsche Instrument.");
  }

  /* ------------------------------------------------------------ Kurse */

  /** DQ-PX-1: Reihenintegritaet - sortiert, eindeutig, positiv, Kopf passt zum Inhalt. */
  function seriesIntegrity(seriesList) {
    var fail = [];
    seriesList.forEach(function (s) {
      var p = s.points || [], prev = null, why = null;
      if (!p.length) why = "keine Punkte";
      for (var i = 0; !why && i < p.length; i++) {
        var d = p[i][0], v = p[i][1];
        if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) why = "Datum ungueltig an Stelle " + i;
        else if (prev !== null && d <= prev) why = (d === prev ? "Datum doppelt " : "nicht sortiert bei ") + d;
        else if (!(typeof v === "number" && isFinite(v) && v > 0)) why = "Kurs ungueltig am " + d;
        prev = d;
      }
      if (!why && s.to && p.length && p[p.length - 1][0] !== s.to) why = "Kopf to=" + s.to + ", letzter Punkt " + p[p.length - 1][0];
      if (!why && typeof s.barCount === "number" && s.barCount !== p.length) why = "barCount " + s.barCount + " != " + p.length + " Punkte";
      if (why) fail.push(s.securityId + ": " + why);
    });
    return result("DQ-PX-1", "Kursreihen sortiert, eindeutig, positiv, Kopf = Inhalt", "ERROR", seriesList.length, fail);
  }

  /** DQ-PX-2: Frische der Reihen gegen die letzte abgeschlossene Sitzung. */
  function seriesFreshness(seriesList, expectedSession, lagFn, maxLag) {
    var hist = {}, fail = [];
    seriesList.forEach(function (s) {
      var lag = lagFn(s.to, expectedSession);
      var key = lag === null ? "?" : lag >= 5 ? "5+" : String(lag);
      hist[key] = (hist[key] || 0) + 1;
      if (lag !== null && lag > maxLag) fail.push(s.securityId + ": Stand " + s.to + " (" + lag + " Sitzungen zurueck)");
    });
    var r = result("DQ-PX-2", "Kursreihen tragen die letzte Sitzung (" + expectedSession + ")", "WARN", seriesList.length, fail,
      "Rueckstand in Sitzungen: " + JSON.stringify(hist) + ". Delistete oder ausgesetzte Titel bleiben hier stehen, bis das Universum sie entfernt.");
    r.histogram = hist;
    return r;
  }

  /** DQ-PX-3: unplausible Tagessprünge in split-bereinigten Reihen
   *  (Verdacht auf unbereinigten Split oder Datenfehler). */
  function implausibleJumps(seriesList, threshold) {
    var t = threshold || 0.6, fail = [];
    seriesList.forEach(function (s) {
      var p = s.points || [];
      for (var i = 1; i < p.length; i++) {
        var a = p[i - 1][1], b = p[i][1];
        if (!(a > 0 && b > 0)) continue;
        var r = b / a - 1;
        if (r <= -t || r >= 1 / (1 - t) - 1) {
          var ratio = b > a ? b / a : a / b;
          var near = [2, 3, 4, 5, 8, 10, 15, 20, 25, 50, 100].filter(function (k) { return Math.abs(ratio / k - 1) < 0.04; })[0];
          fail.push(s.securityId + " " + p[i][0] + ": " + a + " -> " + b + (near ? " (Faktor ~" + near + ": Split-Verdacht)" : ""));
          break;
        }
      }
    });
    return result("DQ-PX-3", "Keine unplausiblen Tagessprünge (>|" + Math.round(t * 100) + " %|) in split-bereinigten Reihen", "WARN",
      seriesList.length, fail, "Ein ganzzahliger Faktor deutet auf einen nicht nachgezogenen Split; Small Caps koennen echt so springen.");
  }

  /** DQ-PX-4: EINE Preiswahrheit - Wochenreihe (5J/Max) und Tagesreihe (1J)
   *  zeigen am selben Tag denselben Schlusskurs. Eine Abweichung heisst:
   *  zwei Produkte zeigen fuer dieselbe Aktie verschiedene Kurse. */
  function dailyWeeklyAgreement(pairs, tolerance) {
    var fail = [], checked = 0;
    pairs.forEach(function (pair) {
      var c = compareDailyWeekly(pair.daily, pair.weekly, tolerance);
      checked++;
      if (c.status !== "MISMATCH") return;
      var w = c.worst;
      fail.push(pair.securityId + " " + w.date + ": Tag " + w.daily + " / Woche " + w.weekly + " (" + (w.dev * 100).toFixed(1) + " %)" +
        (c.kind === "LEVEL" ? ", Niveau x" + c.ratio + (c.factor ? " (Faktor ~" + c.factor + ": Split nicht nachgezogen)" : "") : ", " + c.mismatched + "/" + c.compared + " Wochen"));
    });
    return result("DQ-PX-4", "Tages- und Wochenreihe zeigen denselben Schlusskurs", "ERROR", checked, fail,
      "Verglichen wird nur an identischen Stichtagen (Wochenschluss = letzter Handelstag der ISO-Woche, der auch in der Tagesreihe steht). " +
      "Toleranz: eine Rundungseinheit (published-close.js#roundClose). Typische Ursache: Split nach dem letzten Lauf der Wochenreihe; " +
      "Reparatur: scripts/market/long-series-repair-plan.mjs und long-series.yml (Reparaturlauf).");
  }

  /* Rundungseinheit eines veroeffentlichten Schlusses (quant/engines/published-close.js#roundClose):
     ab 1 $ der Cent, darunter vier gueltige Stellen. Eine feste Grenze (0,005 $ oder 0,5 %) ist
     bei 0,05 $ zu grob und bei 500 $ zu streng. */
  function closeUnit(v) {
    if (!(v > 0)) return 0;
    if (v >= 1) return 0.01;
    return Math.pow(10, Math.floor(Math.log10(v)) - 3);
  }
  var SPLIT_FACTORS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100, 150, 200, 250, 500, 1000];
  function nearestFactor(ratio) {
    var r = ratio >= 1 ? ratio : 1 / ratio;
    var k = SPLIT_FACTORS.filter(function (f) { return Math.abs(r / f - 1) < 0.03; })[0];
    return k ? (ratio >= 1 ? String(k) : "1/" + k) : null;
  }

  /** Vergleich EINER Tages- und Wochenreihe an identischen Stichtagen.
   *  status: CONSISTENT | MISMATCH | NO_OVERLAP
   *  kind (bei MISMATCH): LEVEL - die ganze Ueberlappung steht um einen festen Faktor daneben
   *  (Bereinigungsstand verschieden: Split/Reverse-Split), POINT - einzelne Wochen weichen ab.
   *  Wochen ohne denselben Tag in der Tagesreihe (Feiertag, Luecke) werden nicht verglichen. */
  function compareDailyWeekly(daily, weekly, tolerance) {
    var d = {}, ratios = [], compared = 0, worst = null;
    ((daily && daily.points) || []).forEach(function (pt) { d[pt[0]] = pt[1]; });
    ((weekly && weekly.points) || []).forEach(function (pt) {
      var v = d[pt[0]];
      if (!(v > 0) || !(pt[1] > 0)) return;
      compared++;
      var tol = typeof tolerance === "number" ? Math.abs(v) * tolerance : Math.max(closeUnit(v), closeUnit(pt[1])) + 1e-9;
      if (Math.abs(pt[1] - v) <= tol) return;
      ratios.push(v / pt[1]);
      var dev = Math.abs(pt[1] / v - 1);
      if (!worst || dev > worst.dev) worst = { date: pt[0], daily: v, weekly: pt[1], dev: dev };
    });
    if (!compared) return { status: "NO_OVERLAP", compared: 0, mismatched: 0 };
    if (!ratios.length) return { status: "CONSISTENT", compared: compared, mismatched: 0 };
    var sorted = ratios.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var stable = ratios.every(function (r) { return Math.abs(r / median - 1) < 0.03; });
    var level = ratios.length >= Math.max(2, Math.ceil(compared * 0.8)) && stable && Math.abs(median - 1) > 0.05;
    return { status: "MISMATCH", kind: level ? "LEVEL" : "POINT", compared: compared, mismatched: ratios.length,
             ratio: Number(median.toPrecision(4)), factor: level ? nearestFactor(median) : null, worst: worst };
  }

  /** DQ-PX-5: die Aktienseite (Discover) zeigt den letzten Schlusskurs ihrer Reihe. */
  function payloadMatchesSeries(pairs) {
    var fail = [];
    pairs.forEach(function (x) {
      var last = x.series.points && x.series.points[x.series.points.length - 1];
      var price = x.payload.price && x.payload.price.value;
      if (!last || typeof price !== "number") return;
      if (Math.abs(price / last[1] - 1) > 0.0005) fail.push(x.ticker + ": Seite " + price + ", Reihe " + last[1] + " (" + last[0] + ")");
      else if (x.payload.asOf && x.payload.asOf !== last[0]) fail.push(x.ticker + ": Seite Stand " + x.payload.asOf + ", Reihe " + last[0]);
    });
    return result("DQ-PX-5", "Aktienseite = letzter Schlusskurs der Reihe", "ERROR", pairs.length, fail);
  }

  /* ------------------------------------------------------------ Produkte */

  /** DQ-PR-1: jede ausgelieferte Aktienseite hat ihren Indexeintrag und umgekehrt. */
  function payloadIndexParity(indexSymbols, payloadSymbols) {
    var idx = {}, pay = {}, fail = [];
    indexSymbols.forEach(function (s) { idx[s] = true; });
    payloadSymbols.forEach(function (s) { pay[s] = true; });
    indexSymbols.forEach(function (s) { if (!pay[s]) fail.push("Index ohne Seite: " + s); });
    payloadSymbols.forEach(function (s) { if (!idx[s]) fail.push("Seite ohne Index (verwaist): " + s); });
    return result("DQ-PR-1", "Discover-Aktienindex und Aktienseiten deckungsgleich", "ERROR", indexSymbols.length, fail);
  }

  /** DQ-PR-2: jeder Pfad, den ein Produkt ausliefert, existiert. */
  function referencedPathsExist(refs, exists) {
    var fail = [];
    refs.forEach(function (r) { if (!exists(r.path)) fail.push(r.owner + " -> " + r.path); });
    return result("DQ-PR-2", "Ausgelieferte Datenpfade existieren (keine kaputten Charts)", "ERROR", refs.length, fail);
  }

  /** DQ-IX-1: Indexmitglieder sind Wertpapiere des Produktuniversums. */
  function indexMembersResolve(indexes, decisionsById) {
    var fail = [], checked = 0, unmatched = [];
    indexes.forEach(function (ix) {
      (ix.members || []).forEach(function (m) {
        checked++;
        var d = decisionsById[m.securityId];
        if (!d) fail.push(ix.indexId + ": " + m.symbol + " (" + m.securityId + ") nicht im Produktuniversum");
        else if (d.product_eligibility === "EXCLUDED" || d.active_status === "INACTIVE")
          fail.push(ix.indexId + ": " + m.symbol + " im Universum " + d.product_eligibility + "/" + d.active_status);
      });
      (ix.unmatched || []).forEach(function (u) { unmatched.push(ix.indexId + ": " + u.ticker + " (" + (u.name || "") + ")"); });
    });
    var r = result("DQ-IX-1", "Indexmitglieder sind aktive, geeignete Titel des Universums", "WARN", checked, fail,
      unmatched.length ? "Nicht zuordenbar (fehlen im Wertpapierstamm): " + unmatched.join("; ") : null);
    r.unmatched = unmatched;
    return r;
  }

  /* ------------------------------------------------------------- Technical */

  /** DQ-TW-1: der Technical-Datensatz folgt der Materialisierung und der letzten Sitzung.
   *  meta = technical/data/meta.json, materializedAt = summary.generatedAt der Materialisierung. */
  function technicalFreshness(meta, materializedAt, expectedSession, lagFn, maxLag) {
    var fail = [];
    if (!meta) fail.push("technical/data/meta.json fehlt");
    else {
      if (materializedAt && meta.generatedFrom && meta.generatedFrom < materializedAt)
        fail.push("Datensatz aus der Materialisierung " + meta.generatedFrom + ", vorliegend ist " + materializedAt + " (Erzeuger technical-world.yml nicht gelaufen)");
      var lag = lagFn(meta.asOf, expectedSession);
      if (lag !== null && lag > maxLag) fail.push("Stichtag " + meta.asOf + " liegt " + lag + " Sitzungen hinter " + expectedSession);
    }
    return result("DQ-TW-1", "Technical-Screener folgt Materialisierung und letzter Sitzung", "WARN", 1, fail);
  }

  /** DQ-TW-2: kein Katalogfeld ist im ganzen Datensatz leer (z. B. ein Feature, das die Materialisierung nicht liefert). */
  function technicalEmptyFields(cols, fieldIds) {
    var fail = [], n = cols && cols.s ? cols.s.length : 0;
    (fieldIds || []).forEach(function (id) {
      var c = cols && cols[id];
      if (!c) { fail.push(id + ": Spalte fehlt"); return; }
      var any = false;
      for (var i = 0; i < c.length && !any; i++) { var v = c[i]; if (v !== null && v !== undefined) any = true; }
      if (!any) fail.push(id + ": in allen " + n + " Zeilen leer");
    });
    return result("DQ-TW-2", "Technical-Katalogfelder sind im Datensatz belegt", "WARN", (fieldIds || []).length, fail);
  }

  /** DQ-TW-3: EINE Preiswahrheit - Technical-Schluss = Schluss der Discover-Tagesreihe am selben Tag (ADR-002). */
  function technicalCloseParity(pairs, tol) {
    var fail = [], t = typeof tol === "number" ? tol : 1e-3, checked = 0;
    (pairs || []).forEach(function (p) {
      if (typeof p.close !== "number" || typeof p.seriesClose !== "number") return;
      checked++;
      if (Math.abs(p.seriesClose / p.close - 1) > t) fail.push(p.ticker + " " + p.date + ": Technical " + p.close + " ≠ Reihe " + p.seriesClose);
    });
    return result("DQ-TW-3", "Technical-Schluss = Discover-Tagesreihe (eine Preiswahrheit)", "ERROR", checked, fail);
  }

  /** DQ-TW-4: jede Zeile der Materialisierung landet im Screener oder ist mit Grund gezaehlt (meta.skipped). */
  function technicalCoverage(materializedTickers, rowTickers, skippedCounts) {
    var have = {}, missing = [], skipped = 0;
    (rowTickers || []).forEach(function (t) { have[t] = 1; });
    Object.keys(skippedCounts || {}).forEach(function (r) { skipped += skippedCounts[r] || 0; });
    (materializedTickers || []).forEach(function (t) { if (!have[t]) missing.push(t); });
    var fail = missing.length > skipped ? missing.map(function (t) { return t + ": materialisiert, fehlt im Screener ohne gezaehlten Grund"; }) : [];
    return result("DQ-TW-4", "Technical-Screener deckt die Materialisierung ab (oder zaehlt den Grund)", "WARN", (materializedTickers || []).length, fail,
      "Fehlend " + missing.length + ", mit Grund gezaehlt " + skipped + " (" + JSON.stringify(skippedCounts || {}) + ").");
  }

  /* -------------------------------------------- Supertrader 8.0 (Vorschau) */

  /* Research-Kandidaten der 13 quellentreuen Methoden
     (supertrader/data/sf-candidates, Registry supertrader-sf8-candidates).
     Fail closed: jede Regel prueft den Aktivierungszustand mit. Vorbereitet
     (PREPARED_DISABLED) und ohne Daten = PASS mit 0 geprueft; Daten trotz
     fehlender Freigabe oder freigegeben ohne Daten = ERROR. Ein unlesbarer
     Teil ist ein Befund, nie ein stiller Pass. Regelkatalog:
     docs/data/DATA_QUALITY.md (DQ-SF8-1..8).

     bundle = { activation: "PREPARED_DISABLED"|null, summary, strategies:
       {Cxx: {...}|null}, tickers: {shard: {...}|null}, recordsPresent,
       files: [{path, bytes}], unreadable: [pfad] } */

  var SF8_SCHEMA = "supertrader-sf8-candidates-1.0.0";
  var SF8_STAGES = ["CHART_CANDIDATE", "CONFIRMED_RESEARCH_SETUP", "MODELED_TRADE_PLAN", "VALIDATED_TRADE_SIGNAL"];
  /* Obergrenze je Methode (SF6-Readiness, Vertrag 1.0.0). Eine Aenderung ist
     eine fachliche Aenderung in einem eigenen PR. */
  var SF8_CEILING = {
    C01: "MODELED_TRADE_PLAN", C02: "MODELED_TRADE_PLAN", C03: "MODELED_TRADE_PLAN", C04: "CHART_CANDIDATE",
    C05: "CHART_CANDIDATE", C06: "CHART_CANDIDATE", C07: "MODELED_TRADE_PLAN", C08: "MODELED_TRADE_PLAN",
    C09: "CHART_CANDIDATE", C10: "CHART_CANDIDATE", C11: "CONFIRMED_RESEARCH_SETUP", C12: "MODELED_TRADE_PLAN",
    C13: "CONFIRMED_RESEARCH_SETUP"
  };
  var SF8_IDS = Object.keys(SF8_CEILING);
  /* Marken, die eine Order, einen Stop oder ein Limit tragen oder daraus
     zurueckrechnen lassen - nur im modellierten Ablauf erlaubt. */
  var SF8_ORDER_KEY = /trigger|stop|limit|entry|maxPlannedLoss/i;
  var SF8_ORDER_FEATURES = ["closeVsTrigger", "proposedStopRiskPct", "riskGuide15pct", "plannedLossAtPivot", "sellGuide"];
  var SF8_BUDGET = { totalBytes: 16 * 1024 * 1024, fileBytes: 2 * 1024 * 1024 };

  function sf8Present(b) { return !!(b && (b.summary || (b.files || []).length || b.recordsPresent)); }
  function sf8Views(b) {
    var out = [];
    SF8_IDS.forEach(function (c) { var f = b.strategies && b.strategies[c]; ((f && f.views) || []).forEach(function (v) { out.push(v); }); });
    return out;
  }
  function stageRank(s) { return SF8_STAGES.indexOf(s); }
  /* Gemeinsamer Vorlauf: Aktivierungszustand und Lesbarkeit. Liefert null,
     wenn die Regel weiterpruefen soll, sonst ihr Ergebnis. */
  function sf8Gate(id, title, b) {
    var present = sf8Present(b), prepared = b && b.activation === "PREPARED_DISABLED";
    if (prepared && !present) return result(id, title, "ERROR", 0, [], "Vorbereitet und nicht freigegeben (PREPARED_DISABLED): keine Daten, nichts zu pruefen.");
    if (prepared && present) return result(id, title, "ERROR", 1, ["Daten unter supertrader/data/sf-candidates liegen vor, die Datenart ist nicht freigegeben (PREPARED_DISABLED)"]);
    if (!present || !b.summary) return result(id, title, "ERROR", 1, ["summary.json fehlt, obwohl die Datenart freigegeben ist"]);
    if ((b.unreadable || []).length) return result(id, title, "ERROR", (b.unreadable || []).length, b.unreadable.map(function (p) { return p + ": nicht lesbar"; }));
    return null;
  }

  /** DQ-SF8-1: Stand = letzte Sitzung (hoechstens maxLag zurueck); alle Teile tragen denselben Stand. */
  function sf8Freshness(b, expectedSession, lagFn, maxLag) {
    var g = sf8Gate("DQ-SF8-1", "SF8-Kandidaten aktuell", b); if (g) return g;
    var fail = [], asOf = b.summary.asOf, lag = lagFn(asOf, expectedSession);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf))) fail.push("summary.asOf fehlt oder ist kein Datum: " + asOf);
    else if (lag === null) fail.push("Rueckstand von " + asOf + " gegen " + expectedSession + " nicht bestimmbar");
    else if (lag > maxLag) fail.push("Stand " + asOf + " liegt " + lag + " Sitzungen hinter " + expectedSession);
    if (expectedSession && asOf > expectedSession) fail.push("Stand " + asOf + " liegt nach der letzten abgeschlossenen Sitzung " + expectedSession);
    return result("DQ-SF8-1", "SF8-Kandidaten aktuell", "ERROR", 1, fail);
  }

  /** DQ-SF8-2: jede Ansicht hat die kanonische Identitaet (core/identity.js), die richtige Scherbe, keine Doppelten. */
  function sf8Identity(b, Identity) {
    var g = sf8Gate("DQ-SF8-2", "SF8-Aktienidentitaet kanonisch", b); if (g) return g;
    var fail = [], seen = {}, checked = 0;
    sf8Views(b).forEach(function (v) {
      checked++;
      var id = safeId(Identity, v.ticker);
      if (id === "ungueltig" || v.securityId !== id) fail.push(v.candidateId + " " + v.ticker + ": securityId " + v.securityId + " (erwartet " + id + ")");
      else if (v.shard !== Identity.shardKey(v.ticker)) fail.push(v.candidateId + " " + v.ticker + ": Scherbe " + v.shard + " (erwartet " + Identity.shardKey(v.ticker) + ")");
      var k = v.candidateId + "|" + v.securityId;
      if (seen[k]) fail.push(v.candidateId + " " + v.ticker + ": doppelt"); seen[k] = 1;
    });
    return result("DQ-SF8-2", "SF8-Aktienidentitaet kanonisch", "ERROR", checked, fail);
  }

  /** DQ-SF8-3: Stufe 4 gesperrt, keine Ansicht ueber der Obergrenze ihrer Methode, Status unveraendert. */
  function sf8StageLock(b) {
    var g = sf8Gate("DQ-SF8-3", "SF8-Stufensperren eingehalten", b); if (g) return g;
    var fail = [], s = b.summary, checked = 0;
    var st = s.status || {};
    if (st.liveReadiness !== "LIVE_NOT_APPROVED" || st.certification !== "DIAGNOSTIC_NOT_CERTIFIED" || st.validatedTradeSignal !== "LOCKED_FOR_ALL_13" || st.orders !== "NONE") fail.push("summary.status nicht gesperrt: " + JSON.stringify(st));
    var cnt = s.counts || {};
    if (cnt.validatedTradeSignal !== 0) fail.push("counts.validatedTradeSignal = " + cnt.validatedTradeSignal);
    if (cnt.byStage && cnt.byStage.VALIDATED_TRADE_SIGNAL) fail.push("counts.byStage.VALIDATED_TRADE_SIGNAL = " + cnt.byStage.VALIDATED_TRADE_SIGNAL);
    (s.strategies || []).forEach(function (x) {
      if (SF8_CEILING[x.candidateId] && x.ceiling !== SF8_CEILING[x.candidateId]) fail.push(x.candidateId + ": Obergrenze " + x.ceiling + " (erwartet " + SF8_CEILING[x.candidateId] + ")");
      if (x.liveReadiness !== "LIVE_NOT_APPROVED") fail.push(x.candidateId + ": liveReadiness " + x.liveReadiness);
    });
    sf8Views(b).forEach(function (v) {
      checked++;
      var r = stageRank(v.stage), cap = stageRank(SF8_CEILING[v.candidateId]);
      if (r < 0 || r > 2) fail.push(v.candidateId + " " + v.ticker + ": Stufe " + v.stage);
      else if (cap < 0 || r > cap) fail.push(v.candidateId + " " + v.ticker + ": " + v.stage + " ueber der Obergrenze " + SF8_CEILING[v.candidateId]);
    });
    return result("DQ-SF8-3", "SF8-Stufensperren eingehalten", "ERROR", checked, fail);
  }

  /** DQ-SF8-4: unterhalb von MODELED_TRADE_PLAN kein Plan, keine Order-, Stop- oder Limitmarke, keine daraus rueckrechenbare Kennzahl. */
  function sf8NoOrderBelowModel(b) {
    var g = sf8Gate("DQ-SF8-4", "SF8 ohne Order-/Stopmarken unterhalb des modellierten Ablaufs", b); if (g) return g;
    var fail = [], checked = 0;
    sf8Views(b).forEach(function (v) {
      if (v.stage === "MODELED_TRADE_PLAN") return;
      checked++;
      var where = v.candidateId + " " + v.ticker + " (" + v.stage + ")";
      if (v.plan !== null && v.plan !== undefined) fail.push(where + ": Plan");
      Object.keys(v.levels || {}).forEach(function (k) { if (SF8_ORDER_KEY.test(k)) fail.push(where + ": Marke levels." + k); });
      Object.keys(v.features || {}).forEach(function (k) { if (SF8_ORDER_FEATURES.indexOf(k) >= 0) fail.push(where + ": Kennzahl features." + k); });
      if (v.pivot && /ORDER|TRIGGER|STOP|LIMIT|PLUS|TICK|FRACTION/i.test(String(v.pivot.kind))) fail.push(where + ": Chartmarke " + v.pivot.kind);
    });
    return result("DQ-SF8-4", "SF8 ohne Order-/Stopmarken unterhalb des modellierten Ablaufs", "ERROR", checked, fail);
  }

  /** DQ-SF8-5: Quarantaene (V4-D1) und Datenqualitaet - betroffene Ansichten hoechstens Chart-Kandidat, kein FAIL veroeffentlicht. */
  function sf8Quarantine(b) {
    var g = sf8Gate("DQ-SF8-5", "SF8-Quarantaene und Datenqualitaetsgrenzen eingehalten", b); if (g) return g;
    var fail = [], checked = 0;
    sf8Views(b).forEach(function (v) {
      checked++;
      var dq = v.dataQuality, where = v.candidateId + " " + v.ticker;
      if (!dq || ["PASS", "CAP"].indexOf(dq.status) < 0) { fail.push(where + ": Datenqualitaet " + (dq && dq.status)); return; }
      if (!Array.isArray(dq.quarantinedSessions)) { fail.push(where + ": Quarantaene-Sitzungen fehlen"); return; }
      if (dq.quarantinedSessions.length && v.stage !== "CHART_CANDIDATE") fail.push(where + ": " + dq.quarantinedSessions.length + " Quarantaene-Sitzung(en), Stufe " + v.stage);
      (dq.notPass || []).forEach(function (n) {
        if (n.status === "FAIL") fail.push(where + ": " + n.id + " FAIL veroeffentlicht");
        if (n.status === "CAP" && n.caps && stageRank(v.stage) > stageRank(n.caps)) fail.push(where + ": " + n.id + " begrenzt auf " + n.caps + ", Stufe " + v.stage);
      });
      if (dq.status === "PASS" && (dq.notPass || []).some(function (n) { return n.status === "CAP"; })) fail.push(where + ": PASS trotz CAP");
    });
    return result("DQ-SF8-5", "SF8-Quarantaene und Datenqualitaetsgrenzen eingehalten", "ERROR", checked, fail);
  }

  /** DQ-SF8-6: Ergebnisvertraege - Schema, 13 Methoden, alle Teile vorhanden, Zaehlungen und Stand konsistent, keine records/. */
  function sf8Contracts(b) {
    var g = sf8Gate("DQ-SF8-6", "SF8-Ergebnisvertraege konsistent", b); if (g) return g;
    var fail = [], s = b.summary, asOf = s.asOf, checked = 0;
    if (s.schema !== SF8_SCHEMA) fail.push("summary.schema " + s.schema + " (erwartet " + SF8_SCHEMA + ")");
    if (b.recordsPresent) fail.push("records/ veroeffentlicht (Vertragsdatensaetze nur als CI-Artefakt)");
    var ids = (s.strategies || []).map(function (x) { return x.candidateId; }).sort();
    if (ids.join(",") !== SF8_IDS.join(",")) fail.push("Methoden " + ids.join(",") + " (erwartet C01-C13)");
    var total = 0, byStage = { CHART_CANDIDATE: 0, CONFIRMED_RESEARCH_SETUP: 0, MODELED_TRADE_PLAN: 0 }, viewKeys = {};
    (s.strategies || []).forEach(function (x) {
      var f = b.strategies && b.strategies[x.candidateId];
      checked++;
      if (!f) { fail.push("strategy/" + x.candidateId + ".json fehlt"); return; }
      if (f.schema !== SF8_SCHEMA || f.candidateId !== x.candidateId || f.strategyId !== x.strategyId || f.asOf !== asOf) fail.push("strategy/" + x.candidateId + ".json: Kopf passt nicht (" + [f.schema, f.candidateId, f.strategyId, f.asOf].join(" ") + ")");
      var vs = f.views || [];
      if (!x.counts || vs.length !== x.counts.published) fail.push(x.candidateId + ": " + vs.length + " Ansichten, summary nennt " + (x.counts && x.counts.published));
      vs.forEach(function (v) {
        total++; if (byStage[v.stage] !== undefined) byStage[v.stage]++;
        if (v.candidateId !== x.candidateId || v.strategyId !== x.strategyId || v.asOf !== asOf) fail.push(x.candidateId + " " + v.ticker + ": Ansicht gehoert nicht in diese Datei oder zu einem anderen Stand");
        viewKeys[v.candidateId + "|" + v.ticker] = v.shard;
      });
    });
    var c = s.counts || {};
    if (c.candidates !== total) fail.push("counts.candidates " + c.candidates + ", Ansichten " + total);
    Object.keys(byStage).forEach(function (k) { if (!c.byStage || c.byStage[k] !== byStage[k]) fail.push("counts.byStage." + k + " " + (c.byStage && c.byStage[k]) + ", gezaehlt " + byStage[k]); });
    /* Scherben: genau die genannten, jede Ansicht genau einmal in ihrer Scherbe */
    var shards = (s.tickerShards || []).slice().sort(), inShards = {};
    shards.forEach(function (k) {
      var t = b.tickers && b.tickers[k];
      checked++;
      if (!t) { fail.push("ticker/" + k + ".json fehlt"); return; }
      if (t.schema !== SF8_SCHEMA || t.shard !== k || t.asOf !== asOf) fail.push("ticker/" + k + ".json: Kopf passt nicht");
      (t.views || []).forEach(function (v) { var key = v.candidateId + "|" + v.ticker; if (inShards[key]) fail.push("ticker/" + k + ": " + key + " doppelt"); inShards[key] = k; });
    });
    Object.keys(b.tickers || {}).forEach(function (k) { if (shards.indexOf(k) < 0) fail.push("ticker/" + k + ".json nicht in summary.tickerShards"); });
    Object.keys(viewKeys).forEach(function (k) { if (inShards[k] !== viewKeys[k]) fail.push(k + ": in Scherbe " + inShards[k] + ", erwartet " + viewKeys[k]); });
    Object.keys(inShards).forEach(function (k) { if (!viewKeys[k]) fail.push(k + ": nur in ticker/" + inShards[k]); });
    return result("DQ-SF8-6", "SF8-Ergebnisvertraege konsistent", "ERROR", checked, fail);
  }

  /** DQ-SF8-7: oeffentliche Teile hoechstens 16 MB, jede Datei hoechstens 2 MB. */
  function sf8Budget(b) {
    var g = sf8Gate("DQ-SF8-7", "SF8-Datenbudget eingehalten", b); if (g) return g;
    var fail = [], total = 0;
    (b.files || []).forEach(function (f) { total += f.bytes; if (f.bytes > SF8_BUDGET.fileBytes) fail.push(f.path + ": " + f.bytes + " Bytes ueber 2 MB"); });
    if (total > SF8_BUDGET.totalBytes) fail.push("zusammen " + total + " Bytes ueber 16 MB");
    return result("DQ-SF8-7", "SF8-Datenbudget eingehalten", "ERROR", (b.files || []).length, fail, "Oeffentliche Teile " + total + " Bytes.");
  }

  /** DQ-SF8-8: eine Preiswahrheit (ADR-002) - Schluss jeder Ansicht = veroeffentlichter Schluss derselben Identitaet und Sitzung
   *  (quant/engines/published-close.js, ohne Toleranz). referenceOf(securityId) liefert die Discover-Tagesreihe oder null. */
  function sf8PriceParity(b, referenceOf, PublishedClose) {
    var g = sf8Gate("DQ-SF8-8", "SF8-Schluss = veroeffentlichter Schluss (eine Preiswahrheit)", b); if (g) return g;
    var fail = [], checked = 0, cache = {};
    sf8Views(b).forEach(function (v) {
      checked++;
      var where = v.candidateId + " " + v.ticker + " " + v.asOf;
      if (!(v.securityId in cache)) cache[v.securityId] = referenceOf(v.securityId);
      var ref = cache[v.securityId];
      if (!ref) { fail.push(where + ": keine veroeffentlichte Reihe"); return; }
      if (ref.securityId !== v.securityId || ref.ticker !== v.ticker || ref.currency !== "USD") { fail.push(where + ": Reihe gehoert zu " + ref.securityId + "/" + ref.ticker + "/" + ref.currency); return; }
      /* gleiche Sitzung: der letzte Punkt; eine spaetere Reihe kann seitdem nachadjustiert sein - dann fehlt der zeitgleiche Beleg */
      var lp = ref.asOf === v.asOf ? PublishedClose.lastPoint(ref, v.asOf) : null;
      if (!lp || lp.date !== v.asOf) { fail.push(where + ": kein zeitgleicher veroeffentlichter Schluss (Reihe " + ref.asOf + ")"); return; }
      if (PublishedClose.roundClose(v.close) !== lp.close) fail.push(where + ": Schluss " + v.close + " ≠ veroeffentlicht " + lp.close);
    });
    return result("DQ-SF8-8", "SF8-Schluss = veroeffentlichter Schluss (eine Preiswahrheit)", "ERROR", checked, fail);
  }

  /** Alle SF8-Regeln in fester Reihenfolge. */
  function sf8Rules(b, ctx) {
    return [
      sf8Freshness(b, ctx.expectedSession, ctx.lagFn, ctx.maxLag === undefined ? 2 : ctx.maxLag),
      sf8Identity(b, ctx.Identity), sf8StageLock(b), sf8NoOrderBelowModel(b), sf8Quarantine(b), sf8Contracts(b), sf8Budget(b),
      sf8PriceParity(b, ctx.referenceOf, ctx.PublishedClose)
    ];
  }

  /** Fasst Regelergebnisse zusammen. */
  function summarize(rules) {
    var s = { ERROR: 0, WARN: 0, INFO: 0 }, overall = "PASS";
    rules.forEach(function (r) {
      if (r.status === "FAIL") {
        s[r.severity] = (s[r.severity] || 0) + 1;
        if (r.severity === "ERROR") overall = "FAIL";
        else if (overall === "PASS" && r.severity === "WARN") overall = "WARN";
      }
    });
    return { version: VERSION, overall: overall, failedBySeverity: s, rules: rules };
  }

  return {
    VERSION: VERSION,
    idConsistency: idConsistency, universeDuplicates: universeDuplicates, activeSymbolCollisions: activeSymbolCollisions,
    seriesIntegrity: seriesIntegrity, seriesFreshness: seriesFreshness, implausibleJumps: implausibleJumps,
    dailyWeeklyAgreement: dailyWeeklyAgreement, compareDailyWeekly: compareDailyWeekly, closeUnit: closeUnit,
    payloadMatchesSeries: payloadMatchesSeries,
    payloadIndexParity: payloadIndexParity, referencedPathsExist: referencedPathsExist,
    indexMembersResolve: indexMembersResolve,
    technicalFreshness: technicalFreshness, technicalEmptyFields: technicalEmptyFields, technicalCloseParity: technicalCloseParity, technicalCoverage: technicalCoverage,
    SF8_CEILING: SF8_CEILING, SF8_BUDGET: SF8_BUDGET,
    sf8Freshness: sf8Freshness, sf8Identity: sf8Identity, sf8StageLock: sf8StageLock, sf8NoOrderBelowModel: sf8NoOrderBelowModel,
    sf8Quarantine: sf8Quarantine, sf8Contracts: sf8Contracts, sf8Budget: sf8Budget, sf8PriceParity: sf8PriceParity, sf8Rules: sf8Rules,
    summarize: summarize
  };
});
