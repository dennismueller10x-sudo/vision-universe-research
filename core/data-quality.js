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

  /** DQ-TW-5: Wochen-/Monatsspalten (`feld@1W`, `feld@1M`) sind belegt, sobald die Materialisierung sie liefert.
   *  need[feld] = kleinste `technical-mtf`-Version, die das Feld liefert; bundleVersions = Versionen der Buendel.
   *  Ein Feld, das noch kein Buendel liefern kann, ist kein Fehler, sondern steht als "wartet" in der Notiz. */
  function technicalTimeframeFields(cols, need, bundleVersions) {
    var fail = [], waiting = [], fill = [], n = cols && cols.s ? cols.s.length : 0, checked = 0;
    var ver = function (v) { var m = /(\d+)\.(\d+)\.(\d+)$/.exec(v || ""); return m ? +m[1] * 1e6 + +m[2] * 1e3 + +m[3] : -1; };
    var top = -1;
    (bundleVersions || []).forEach(function (v) { top = Math.max(top, ver(v)); });
    Object.keys(cols || {}).filter(function (k) { return /@1[WM]$/.test(k); }).sort().forEach(function (k) {
      var id = k.slice(0, k.indexOf("@")), min = ver(need && need[id] || "technical-mtf-1.0.0");
      if (top < min) { waiting.push(k); return; }
      checked++;
      var c = cols[k], have = 0;
      for (var i = 0; i < c.length; i++) if (c[i] !== null && c[i] !== undefined) have++;
      if (!have) fail.push(k + ": in allen " + n + " Zeilen leer, obwohl die Materialisierung es liefert");
      else fill.push(k + " " + Math.round((have / n) * 1000) / 10 + " %");
    });
    return result("DQ-TW-5", "Technical-Wochen-/Monatsfelder sind belegt, soweit die Materialisierung sie liefert", "WARN", checked, fail,
      (waiting.length ? "Wartet auf Materialisierung (" + waiting.length + "): " + waiting.join(", ") + ". " : "") + "Belegung: " + fill.join(", ") + ".");
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
    technicalFreshness: technicalFreshness, technicalEmptyFields: technicalEmptyFields, technicalCloseParity: technicalCloseParity, technicalCoverage: technicalCoverage, technicalTimeframeFields: technicalTimeframeFields,
    summarize: summarize
  };
});
