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

  var VERSION = "core-data-quality-1.1.0";   // 1.1.0: DQ-SEC-1/2/3 (V9 SEC/PIT)
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

  /** DQ-PX-6 (Tag) / DQ-PX-7 (Woche): eingefrorenes Kursende bei einem Titel, den der
   *  Wertpapierstamm ACTIVE fuehrt (core/listing-staleness.js). Nur Bericht: es wird
   *  nichts ausgeschlossen. masterIdx = Staleness.masterIndex(us-security-master.json). */
  function staleTails(seriesList, masterIdx, Staleness, grain, minRun) {
    var weekly = grain === "weekly", n = minRun || (weekly ? Staleness.DEFAULTS.weeklyMinRun : Staleness.DEFAULTS.dailyMinRun);
    var hist = {}, found = [], checked = 0, noMaster = 0, inactive = 0;
    (seriesList || []).forEach(function (s) {
      var st = masterIdx.byId[s.securityId];
      var t = Staleness.tailRun(s.points);
      if (!t) return;
      var key = t.run >= 30 ? "30+" : String(t.run);
      hist[key] = (hist[key] || 0) + 1;
      if (!st) { noMaster++; return; }
      if (!st.active) { inactive++; return; }
      checked++;
      var f = Staleness.staleTail(s, st, n);
      if (f) found.push(f);
    });
    found.sort(function (a, b) { return b.run - a.run || (a.securityId < b.securityId ? -1 : 1); });
    var unit = weekly ? "Wochenschluesse" : "Tagesschluesse";
    var r = result(weekly ? "DQ-PX-7" : "DQ-PX-6",
      "Kein eingefrorenes Kursende bei aktiven Titeln (" + (weekly ? "Wochenreihe" : "Tagesreihe") + ", >= " + n + " gleiche Schluesse)", "WARN", checked,
      found.map(function (f) { return f.securityId + ": " + (f.run === f.points ? "alle " : "") + f.run + " gleiche " + unit + " seit " + f.since + " (" + f.close + "), Stamm " + f.master + (f.masterEnd ? " bis " + f.masterEnd : ""); }),
      "Endlaeufe gleicher Schluesse ueber alle Reihen: " + JSON.stringify(hist) + ". Nicht geprueft: " + noMaster + " ohne Stammzeile, " + inactive +
      " im Stamm nur INACTIVE (siehe DQ-ID-4). Typische Ursache: Delisting/Uebernahme, der Anbieter schreibt den letzten Kurs fort. Nur Bericht - kein Ausschluss.");
    r.histogram = hist;
    r.minRun = n;
    r.findings = found;
    return r;
  }

  /** DQ-ID-4: Wertpapierstamm und Tagesreihe widersprechen sich nicht
   *  (Stamm INACTIVE, Reihe laeuft weiter = Ticker-Wiederverwendung oder Fortschreibung;
   *  Stamm ACTIVE, Reihe zu Ende). */
  function masterSeriesConsistency(seriesList, masterIdx, Staleness, expectedSession, lagFn, maxLag, minRun) {
    var found = [], byClass = {}, checked = 0;
    (seriesList || []).forEach(function (s) {
      var st = masterIdx.byId[s.securityId];
      if (!st) return;
      checked++;
      var c = Staleness.masterConflict(s, st, { expectedSession: expectedSession, lagFn: lagFn, maxLag: maxLag, minRun: minRun });
      if (!c) return;
      byClass[c.class] = (byClass[c.class] || 0) + 1;
      found.push(c);
    });
    var order = ["MASTER_INACTIVE_SERIES_CURRENT", "MASTER_INACTIVE_SERIES_FROZEN", "MASTER_INACTIVE_SERIES_AFTER_END", "MASTER_ACTIVE_SERIES_ENDED"];
    found.sort(function (a, b) { return order.indexOf(a.class) - order.indexOf(b.class) || (a.securityId < b.securityId ? -1 : 1); });
    var r = result("DQ-ID-4", "Wertpapierstamm und Tagesreihe widersprechen sich nicht (aktiv/inaktiv, Ende)", "WARN", checked,
      found.map(function (c) { return c.securityId + ": " + c.class + " - Reihe bis " + c.to + (c.lag !== null ? " (" + c.lag + " Sitzungen zurueck)" : "") +
        ", Stamm " + c.master + " Ende " + c.masterEnd + (c.masterRows > 1 ? " (" + c.masterRows + " Zeilen)" : ""); }),
      "Klassen: " + JSON.stringify(byClass) + ". Stamm: " + (masterIdx.version || "?") + " vom " + (masterIdx.today || "?") +
      " (ACTIVE-Zeilen tragen als Ende den Stammstand; Titel, die danach delistet wurden, stehen dort noch ACTIVE). Nur Bericht - kein Ausschluss.");
    r.byClass = byClass;
    r.findings = found;
    return r;
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

  /* ------------------------------------------------- SEC-Fundamentaldaten */
  /* bundles = [{ cik, tickers, annual, quarterly, ttm, quality }] aus
     quant/data/sec/consumer/CIK*.json (Erzeuger update-sec-fundamentals.yml).
     Zeilen: [fy, fp, end, v, filed, accn, derived] (consumer.ROW_COLUMNS). */

  function secRows(b) {
    var out = [];
    ["annual", "quarterly"].forEach(function (k) {
      Object.keys(b[k] || {}).forEach(function (m) {
        (b[k][m] || []).forEach(function (r) { if (Array.isArray(r)) out.push({ part: k, metric: m, fy: r[0], fp: r[1], end: r[2], filed: r[4] }); });
      });
    });
    Object.keys(b.ttm || {}).forEach(function (m) {
      var t = b.ttm[m];
      if (t && typeof t === "object") out.push({ part: "ttm", metric: m, fy: null, fp: t.fp, end: t.end, filed: t.filed });
    });
    return out;
  }
  function secName(b) { return ((b.tickers && b.tickers[0]) || "?") + " CIK" + b.cik; }

  /** DQ-SEC-1: ein veroeffentlichtes Geschaeftsjahreslabel liegt hoechstens ein Jahr neben
   *  dem Kalenderjahr seines Periodenendes (V9: PRTH 43465/43830, WTBA 2107, STX 2027). */
  function secFiscalYearLabels(bundles) {
    var checked = 0, fail = [];
    (bundles || []).forEach(function (b) {
      var seen = {};
      secRows(b).forEach(function (r) {
        if (typeof r.fy !== "number" || typeof r.end !== "string") return;
        checked++;
        if (Math.abs(r.fy - Number(r.end.slice(0, 4))) > 1) {
          var key = r.fy + "|" + r.end;
          if (!seen[key]) { seen[key] = 1; fail.push(secName(b) + ": FY-Label " + r.fy + " fuer Periodenende " + r.end + " (" + r.metric + ")"); }
        }
      });
    });
    return result("DQ-SEC-1", "SEC-Geschaeftsjahreslabel liegen hoechstens ein Jahr neben dem Periodenende", "WARN", checked, fail,
      "Ursache meist ein unplausibles fy im Jahresbericht; die Normalisierung lehnt es ab (IMPLAUSIBLE_FILING_FY, DQ-SEC-3).");
  }

  /** DQ-SEC-2: keine veroeffentlichte SEC-Zeile endet nach ihrem Einreichungsdatum
   *  (Faelligkeitsplan, erklaerte Dividende, Deckblattdatum nach Annahme; V9: ASLE 2034, AXR 2033, PMT 2028-2030). */
  function secFuturePeriods(bundles) {
    var checked = 0, fail = [];
    (bundles || []).forEach(function (b) {
      secRows(b).forEach(function (r) {
        if (typeof r.end !== "string" || typeof r.filed !== "string") return;
        checked++;
        if (r.end.slice(0, 10) > r.filed.slice(0, 10)) fail.push(secName(b) + ": " + r.metric + " " + r.part + " Ende " + r.end + " nach Einreichung " + r.filed);
      });
    });
    return result("DQ-SEC-2", "SEC-Werte enden nicht nach ihrer Einreichung (keine Zukunftsperiode)", "WARN", checked, fail,
      "Die Normalisierung quarantaeniert solche Fakten (FUTURE_PERIOD_END, DQ-SEC-3).");
  }

  /** DQ-SEC-3 (INFO, Messung): was die Normalisierung abgelehnt hat - fy-Anker
   *  (IMPLAUSIBLE_FILING_FY) und Zukunftsperioden (FUTURE_PERIOD_END), je Emittent.
   *  INFO, weil die Ablehnung die richtige Behandlung ist; die Zahl macht Wiederkehr sichtbar. */
  function secRefusals(bundles) {
    var fail = [], anchors = 0, quarantined = 0, iA = 0, iQ = 0;
    (bundles || []).forEach(function (b) {
      var q = b.quality || {}, a = (q.implausibleFilingFy || []).length, f = (q.futurePeriodEnd || {}).quarantined || 0;
      if (a) { iA++; anchors += a; }
      if (f) { iQ++; quarantined += f; }
      if (a || f) fail.push(secName(b) + ": IMPLAUSIBLE_FILING_FY " + a + ", FUTURE_PERIOD_END " + f);
    });
    return result("DQ-SEC-3", "SEC-Normalisierung: abgelehnte fy-Anker und quarantaenierte Zukunftsperioden (gezaehlt)", "INFO",
      (bundles || []).length, fail,
      "IMPLAUSIBLE_FILING_FY " + anchors + " bei " + iA + " Emittenten; FUTURE_PERIOD_END " + quarantined + " bei " + iQ + " Emittenten.");
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

  /* -------------------------------------------- Supertrader 8.0 (Vorschau) */

  /* Research-Kandidaten der 13 quellentreuen Methoden
     (supertrader/data/sf-candidates, Registry supertrader-sf8-candidates).
     Fail closed: jede Regel prueft den Aktivierungszustand mit. Vorbereitet
     (PREPARED_DISABLED) und ohne Daten = PASS mit 0 geprueft; Daten trotz
     fehlender Freigabe oder freigegeben ohne Daten = ERROR. Ein unlesbarer
     Teil ist ein Befund, nie ein stiller Pass. Regelkatalog:
     docs/data/DATA_QUALITY.md (DQ-SF8-1..8).

     ACTIVATING (Aktivierungs-PR, vor dem ersten Lauf) ohne Daten = PASS
     mit 0 geprueft; mit Daten wird voll geprueft.

     Geprueft wird jede veroeffentlichte Ansicht: strategy/Cxx.json UND die
     Scherben ticker/<k>.json (die Aktienseite liest sie), dazu die
     Kurzzeilen in index.json und summary.top (Start- und Listenansichten).

     bundle = { activation: "PREPARED_DISABLED"|"ACTIVATING"|null, summary,
       index, strategies: {Cxx: {...}|null}, tickers: {shard: {...}|null},
       recordsPresent, files: [{path, bytes}], unreadable: [pfad] } */

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
  /* Order-, Stop- oder Limitname: nach Wortteilen des camelCase-Namens, nicht nach Teilzeichenketten
     ("closeVsTop" ist der Abstand zur Boxoberkante, kein Stop; "initialStop", "stopReference" sind es). */
  var SF8_ORDER_WORDS = ["trigger", "stop", "limit", "entry", "trailing"];
  var SF8_ORDER_KEY = { test: function (k) {
    var words = String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
    return words.some(function (w) { return SF8_ORDER_WORDS.indexOf(w) >= 0; }) || /maxplannedloss|plannedloss/i.test(String(k));
  } };
  var SF8_ORDER_FEATURES = ["closeVsTrigger", "proposedStopRiskPct", "riskGuide15pct", "plannedLossAtPivot", "sellGuide"];
  /* Unterhalb von MODELED nur Chartstruktur (Vertrag der Ansicht, records.mjs#STRUCTURE_LEVELS):
     unabhaengig festgeschrieben - eine neue Marke ist eine fachliche Aenderung in einem eigenen PR.
     Strukturmarken duerfen mit der Risikoreferenz der Quelle zusammenfallen (Tief des Gap-Tags, Owner-
     Entscheidung 28.10.2026); sie sind Chartfakten, keine Order, und erscheinen ohne Plan und ohne Risiko.
     Nicht zulaessig ist eine Marke, die in ihrer Quelle selbst der Orderpreis ist (Stand Erzeuger #1056):
     C06/C07-Pivot (Einstiegsorder genau am Pivot), C13 swingLow (Stop) und impulseHigh (Teil der Order),
     C11 signalDayLow (keine Strukturmarke der Quelle). */
  var SF8_STRUCTURE_LEVELS = {
    C01: ["channelDays", "exitChannelDays"], C02: ["channelDays", "exitChannelDays"], C03: ["top", "bottom", "box"],
    C04: ["resistance", "ma30w", "breakoutWeek", "breakoutDay"], C05: ["resistance", "ma30w", "breakoutWeek", "breakoutDay"],
    C06: ["ma50", "ma150", "ma200"], C07: [], C08: ["breakoutLevel"], C09: ["gapDayLow", "priorClose"],
    C10: ["ma10", "ma20"], C11: ["ma10", "ma50"], C12: ["gapDayLow", "priorClose"], C13: ["ema20"]
  };
  /* Unterhalb von MODELED ausgeblendet, weil rechnerisch eine Order-Groesse (Owner-Entscheidungen 28.10.2026,
     Erzeuger records.mjs#ORDER_DERIVED_BY_METHOD und #TREND_HIDDEN_BY_METHOD): die Power-Play-Korrekturtiefe ist
     der geplante Verlust am Pivot; das 52-Wochen-Hoch (und der Abstand dazu) faellt bei SEPA, Power Play und
     Holy Grail mit der Einstiegsmarke zusammen. Das allgemeine 52-Wochen-Hoch anderer Methoden bleibt.
     SEPA (#1056, Review 28.10.2026): pctBelowHigh52w ist der Abstand zum ausgeblendeten 52-Wochen-Hoch, die Basistiefen
     (largestCorrection, vcpFootprint.depths; Erzeuger records.mjs#ORDER_DERIVED_SUBFIELDS_BY_METHOD) ergeben mit dem
     Basistief das Basishoch und damit Hoch und Pivot. Die Allowlist SF8_DESCRIPTIVE_FEATURES bleibt die Liste dessen, was
     der Detektor erzeugt; die Sperre greift davor. */
  var SF8_FEATURES_HIDDEN = { C06: ["pctBelowHigh52w", "largestCorrection"], C07: ["correction"] };
  var SF8_SUBFIELDS_HIDDEN = { C06: { vcpFootprint: ["depths"] } };
  var SF8_TREND_HIDDEN = { C06: ["high252", "belowHigh252"], C07: ["high252", "belowHigh252"], C13: ["high252", "belowHigh252"] };
  /* Beschreibende Research-/Chartkennzahlen, die unterhalb von MODELED erscheinen duerfen (Owner-Entscheidung
     28.10.2026: z. B. closeVsGapLow bei C12 und N/nPct bei Turtle - beschreibend, nie als Einstiegs-, Stop- oder
     Orderparameter). ALLOWLIST je Methode statt Namens-Sperrliste: ein umbenannter Orderpreis (orderPrice,
     buyPoint, channelHigh) faellt so auf (unabhaengige Nachpruefung, Mutationen M4/M6/M7). Abgeleitet aus den
     features-Objekten der SF8-Detektoren (Supertrader, product/detectors.mjs) ohne die order-abgeleiteten
     Kennzahlen; eine neue Kennzahl ist eine fachliche Aenderung in einem eigenen PR. Namen mit Order-Wortteilen
     (stop, entry, trailing ...) duerfen nur Statustexte tragen. */
  var SF8_DESCRIPTIVE_FEATURES = {
    C01: ["path", "filterOutcomeBefore", "N", "nPct", "breakoutAtOpen"],
    C02: ["path", "filterOutcomeBefore", "N", "nPct", "breakoutAtOpen"],
    C03: ["boxDepth", "boxTopDate", "boxBottomDate", "boxCompleteDate", "closeVsTop", "allTimeHighDailyWindow", "allTimeHighWeeklyCloses", "listingCoveredByDailyHighs", "allTimeHighStatus"],
    C04: ["breakoutWeek", "breakoutDay", "ma30w", "closeVsMa30w", "ma30wSlope4w", "baseWeeks", "rsNormalised", "rsImproving", "volumeConfirmedAny", "overheadDistance", "spyAboveMa30w", "groupStage", "marketBreadth"],
    C05: ["breakoutWeek", "breakoutDay", "ma30w", "closeVsMa30w", "ma30wSlope4w", "baseWeeks", "rsNormalised", "rsImproving", "volumeConfirmedAny", "overheadDistance", "spyAboveMa30w", "groupStage", "marketBreadth"],
    C06: ["pctAboveLow52w", "pctBelowHigh52w", "ma200OneMonthAgo", "vcpProxyState", "vcpFootprint", "baseLengthSessions", "largestCorrection", "rangesContracting", "rs", "translationUnverified"],
    C07: ["correction", "consolidationSessions", "startVolumeVs50d", "reviewReasons", "translationUnverified"],
    C08: ["momentum", "momentumInterpretation", "setupProxy", "priorMove", "higherLows", "ma10Rising", "ma20Rising", "adr20"],
    C09: ["gap", "priorRun63", "priorRange63", "adr20", "dailyVolumeVs50d", "catalyst", "intradayVolume", "entryOpeningRange", "model"],
    C10: ["direction", "upStreak", "streakReturnSum", "accelerating", "adr20", "distanceToMA10", "distanceToMA20", "streakReturns", "borrow", "entry", "model"],
    C11: ["volume", "maxDownVolume", "volumeVsMaxDown", "downDays", "pctFrom10DMA", "pctFrom50DMA", "pctFrom200DMA", "contextProxyMa50", "stop"],
    C12: ["gapInAtr", "gap", "gapPct", "atr40", "volumeRatio50", "volumeStatus", "contextProxyMa50", "closeVsGapLow"],
    C13: ["adx", "adxAbove30Since", "closeVsEma20", "impulseHighDate", "entrySource", "trailing"]
  };
  /* Form der Ansicht unterhalb von MODELED (unabhaengige Nachpruefung 28.10.: auch oberste Schluessel, trend,
     sortKeys, verschachtelte Werte, Marken und Texte, sonst passiert ein umbenannter Orderpreis neben features). */
  var SF8_VIEW_KEYS = ["strategyId", "candidateId", "ticker", "securityId", "companyName", "exchange", "shard", "stage", "reach", "ceiling", "asOf", "close", "recordId", "pattern", "met", "pending", "interpretations", "notMet", "pivot", "levels", "features", "trend", "plan", "planBlockers", "why", "dataQuality", "blockReasons", "rank", "sortKeys"];
  var SF8_TREND_KEYS = ["close", "change1d", "ma50", "ma200", "vsMa50", "vsMa200", "ma50Rising20d", "ret63", "ret126", "high252", "low252", "belowHigh252", "windowSessions", "volumeVs50d", "dollarVolume20d", "adr20"];
  var SF8_SORT_KEYS = ["stage", "pivot", "volume", "momentum", "setupState", "streak", "trend", "dataQuality", "ticker"];
  var SF8_FEATURE_OBJECTS = { momentum: ["p1m", "p3m", "p6m", "best", "r1m", "r3m", "r6m"], vcpFootprint: ["contractions", "depths", "contractingLeftToRight", "lastContractionVolumeVs50d", "baseSessions"] };
  var SF8_LEVEL_OBJECTS = { box: ["from", "to", "top", "bottom"] };
  var SF8_PIVOT_KEYS = ["level", "kind", "distance"];
  var SF8_ROW_KEYS = ["c", "t", "n", "s", "r", "pd", "v", "m", "q", "sh", "x"];
  /* Schluessel in levels, aus dem die Chartmarke stammt (records.mjs#STRUCTURE_MARK) */
  var SF8_PIVOT_LEVEL = { C03: "top", C04: "resistance", C05: "resistance", C08: "breakoutLevel", C09: "gapDayLow", C12: "gapDayLow" };
  function sf8Primitive(x) { return x === null || ["string", "number", "boolean"].indexOf(typeof x) >= 0; }
  /* Texte sind Codes, Daten und Statusangaben; ein Dezimalpreis in einem Text ("BUY_STOP_22.90") faellt auf */
  function sf8PriceInText(x) {
    if (typeof x === "string") return /\d[.,]\d/.test(x) || /[$€]/.test(x);
    if (Array.isArray(x)) return x.some(sf8PriceInText);
    if (x && typeof x === "object") return Object.keys(x).some(function (k) { return sf8PriceInText(x[k]); });
    return false;
  }
  function sf8ShapeFindings(v, where) {
    var out = [];
    Object.keys(v).forEach(function (k) { if (SF8_VIEW_KEYS.indexOf(k) < 0) out.push(where + ": Feld " + k + " gehoert nicht zur Ansicht"); });
    [["trend", SF8_TREND_KEYS], ["sortKeys", SF8_SORT_KEYS]].forEach(function (d) {
      var o = v[d[0]] || {};
      Object.keys(o).forEach(function (k) {
        if (d[1].indexOf(k) < 0) out.push(where + ": " + d[0] + "." + k + " ist nicht vorgesehen");
        else if (!sf8Primitive(o[k])) out.push(where + ": " + d[0] + "." + k + " ist kein einfacher Wert");
      });
    });
    Object.keys(v.features || {}).forEach(function (k) {
      var x = v.features[k], sub = SF8_FEATURE_OBJECTS[k];
      if (sf8Primitive(x)) return;
      if (Array.isArray(x)) { if (!x.every(sf8Primitive)) out.push(where + ": features." + k + " enthaelt Objekte"); return; }
      if (!sub) { out.push(where + ": features." + k + " ist ein Objekt"); return; }
      Object.keys(x).forEach(function (j) { if (sub.indexOf(j) < 0 || !(sf8Primitive(x[j]) || (Array.isArray(x[j]) && x[j].every(sf8Primitive)))) out.push(where + ": features." + k + "." + j + " ist nicht vorgesehen"); });
    });
    Object.keys(v.levels || {}).forEach(function (k) {
      var x = v.levels[k], sub = SF8_LEVEL_OBJECTS[k];
      if (sf8Primitive(x)) return;
      if (!sub || Array.isArray(x)) { out.push(where + ": levels." + k + " ist kein einfacher Wert"); return; }
      Object.keys(x).forEach(function (j) { if (sub.indexOf(j) < 0 || !sf8Primitive(x[j])) out.push(where + ": levels." + k + "." + j + " ist nicht vorgesehen"); });
    });
    if (v.pivot !== null && v.pivot !== undefined) {
      Object.keys(v.pivot).forEach(function (k) { if (SF8_PIVOT_KEYS.indexOf(k) < 0) out.push(where + ": pivot." + k + " ist nicht vorgesehen"); });
      var src = SF8_PIVOT_LEVEL[v.candidateId];
      if (src && (!v.levels || v.levels[src] !== v.pivot.level)) out.push(where + ": Chartmarke " + v.pivot.level + " ist nicht die Strukturmarke levels." + src);
    }
    /* Zahlen nur in den Zahlenfeldern; in Codes, Gruenden und Datenqualitaet steht keine Zahl (auch kein gerundeter Preis) */
    var NUMERIC = ["close", "rank", "features", "trend", "sortKeys", "levels", "pivot"];
    var hasNum = function (x) { return typeof x === "number" || (Array.isArray(x) ? x.some(hasNum) : !!x && typeof x === "object" && Object.keys(x).some(function (k) { return hasNum(x[k]); })); };
    Object.keys(v).forEach(function (k) { if (NUMERIC.indexOf(k) < 0 && hasNum(v[k])) out.push(where + ": Zahl in " + k); });
    var texts = {}; Object.keys(v).forEach(function (k) { if (k !== "companyName" && k !== "features" && k !== "levels" && k !== "trend" && k !== "sortKeys" && k !== "pivot") texts[k] = v[k]; });
    if (sf8PriceInText(texts) || sf8PriceInText(v.features) ) out.push(where + ": Preis in einem Text");
    return out;
  }
  var SF8_PIVOT_KINDS = { C03: "BOX_TOP", C04: "WEEKLY_RESISTANCE", C05: "WEEKLY_RESISTANCE",
    C08: "CONSOLIDATION_10_LEVEL", C09: "GAP_DAY_LOW", C12: "GAP_DAY_LOW" };
  function hasNumber(x) {
    if (typeof x === "number") return true;
    if (x && typeof x === "object") return Object.keys(x).some(function (k) { return hasNumber(x[k]); });
    return false;
  }
  var SF8_BUDGET = { totalBytes: 16 * 1024 * 1024, fileBytes: 2 * 1024 * 1024 };

  function sf8Present(b) { return !!(b && (b.summary || b.index || (b.files || []).length || b.recordsPresent || (b.unreadable || []).length)); }
  /* Ansichten der Strategiedateien (Bezug fuer Zaehlungen und Vertraege). */
  function sf8Views(b) {
    var out = [];
    Object.keys(b.strategies || {}).sort().forEach(function (c) { var f = b.strategies[c]; ((f && f.views) || []).forEach(function (v) { out.push(v); }); });
    return out;
  }
  /* Jede veroeffentlichte Ansicht: Strategiedateien und Scherben (Inhaltsregeln). */
  function sf8AllViews(b) {
    var out = sf8Views(b);
    Object.keys(b.tickers || {}).sort().forEach(function (k) { var t = b.tickers[k]; ((t && t.views) || []).forEach(function (v) { out.push(v); }); });
    return out;
  }
  /* Kurzzeilen fuer Listen und Start: index.json.candidates und summary.top. */
  function sf8Rows(b) {
    var out = [];
    (((b.index || {}).candidates) || []).forEach(function (r) { out.push({ where: "index.json", r: r }); });
    var top = (b.summary && b.summary.top) || {};
    Object.keys(top).forEach(function (c) { (top[c] || []).forEach(function (r) { out.push({ where: "summary.top." + c, r: r }); }); });
    return out;
  }
  function stageRank(s) { return SF8_STAGES.indexOf(s); }
  /* Gemeinsamer Vorlauf: Aktivierungszustand und Lesbarkeit. Liefert null,
     wenn die Regel weiterpruefen soll, sonst ihr Ergebnis. */
  function sf8Gate(id, title, b) {
    var present = sf8Present(b), prepared = b && b.activation === "PREPARED_DISABLED";
    if (b && b.activation && ["PREPARED_DISABLED", "ACTIVATING"].indexOf(b.activation) < 0) return result(id, title, "ERROR", 1, ["unbekannter Aktivierungszustand " + b.activation]);
    if (prepared && !present) return result(id, title, "ERROR", 0, [], "Vorbereitet und nicht freigegeben (PREPARED_DISABLED): keine Daten, nichts zu pruefen.");
    if (b && b.activation === "ACTIVATING" && !present) return result(id, title, "ERROR", 0, [], "Freigegeben, erster Lauf ausstehend (ACTIVATING): keine Daten, nichts zu pruefen.");
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
    var ist = (b.index && b.index.status) || {};
    if (b.index && (ist.liveReadiness !== "LIVE_NOT_APPROVED" || ist.certification !== "DIAGNOSTIC_NOT_CERTIFIED" || ist.validatedTradeSignal !== "LOCKED_FOR_ALL_13" || ist.orders !== "NONE")) fail.push("index.status nicht gesperrt: " + JSON.stringify(ist));
    if (b.index && b.index.counts && b.index.counts.validatedTradeSignal !== 0) fail.push("index.counts.validatedTradeSignal = " + b.index.counts.validatedTradeSignal);
    var stageOk = function (c, stage, where) {
      var r = stageRank(stage), cap = stageRank(SF8_CEILING[c]);
      if (r < 0 || r > 2) fail.push(where + ": Stufe " + stage);
      else if (cap < 0 || r > cap) fail.push(where + ": " + stage + " ueber der Obergrenze " + (SF8_CEILING[c] || "(unbekannte Methode " + c + ")"));
    };
    sf8AllViews(b).forEach(function (v) { checked++; stageOk(v.candidateId, v.stage, v.candidateId + " " + v.ticker); });
    sf8Rows(b).forEach(function (x) { checked++; stageOk(x.r.c, x.r.s, x.where + " " + x.r.c + " " + x.r.t); });
    return result("DQ-SF8-3", "SF8-Stufensperren eingehalten", "ERROR", checked, fail);
  }

  /** DQ-SF8-4: unterhalb von MODELED_TRADE_PLAN kein Plan, keine Order-, Stop- oder Limitmarke, keine daraus rueckrechenbare Kennzahl. */
  function sf8NoOrderBelowModel(b) {
    var g = sf8Gate("DQ-SF8-4", "SF8 ohne Order-/Stopmarken unterhalb des modellierten Ablaufs", b); if (g) return g;
    var fail = [], checked = 0;
    sf8AllViews(b).forEach(function (v) {
      if (v.stage === "MODELED_TRADE_PLAN") return;
      checked++;
      var where = v.candidateId + " " + v.ticker + " (" + v.stage + ")", allowed = SF8_STRUCTURE_LEVELS[v.candidateId] || [];
      if (v.plan !== null && v.plan !== undefined) fail.push(where + ": Plan");
      Object.keys(v.levels || {}).forEach(function (k) {
        if (SF8_ORDER_KEY.test(k)) fail.push(where + ": Marke levels." + k);
        else if (allowed.indexOf(k) < 0) fail.push(where + ": levels." + k + " ist keine Strukturmarke dieser Methode");
      });
      var described = SF8_DESCRIPTIVE_FEATURES[v.candidateId] || [], hiddenF = SF8_FEATURES_HIDDEN[v.candidateId] || [], hiddenT = SF8_TREND_HIDDEN[v.candidateId] || [], hiddenS = SF8_SUBFIELDS_HIDDEN[v.candidateId] || {};
      Object.keys(v.trend || {}).forEach(function (k) { if (hiddenT.indexOf(k) >= 0) fail.push(where + ": trend." + k + " faellt bei dieser Methode mit der Einstiegsmarke zusammen"); });
      Object.keys(v.features || {}).forEach(function (k) {
        var sub = v.features[k];
        if (hiddenS[k] && sub && typeof sub === "object") hiddenS[k].forEach(function (j) { if (j in sub) fail.push(where + ": features." + k + "." + j + " ergibt bei dieser Methode eine Order-Groesse"); });
        if (SF8_ORDER_FEATURES.indexOf(k) >= 0) fail.push(where + ": Kennzahl features." + k);
        else if (hiddenF.indexOf(k) >= 0) fail.push(where + ": features." + k + " ist bei dieser Methode eine Order-Groesse");
        else if (described.indexOf(k) < 0) fail.push(where + ": features." + k + " ist keine beschreibende Kennzahl dieser Methode");
        /* Statustexte wie "NOT_IN_SOURCE" oder "DATA_BLOCKED" sind erlaubt, Zahlen nicht */
        else if (SF8_ORDER_KEY.test(k) && hasNumber(v.features[k])) fail.push(where + ": Zahl unter features." + k);
      });
      fail.push.apply(fail, sf8ShapeFindings(v, where));
      if (v.pivot !== null && v.pivot !== undefined) {
        if (!SF8_PIVOT_KINDS[v.candidateId]) fail.push(where + ": Chartmarke, obwohl die einzige Marke der Quelle die Order ist");
        else if (v.pivot.kind !== SF8_PIVOT_KINDS[v.candidateId]) fail.push(where + ": Chartmarke " + v.pivot.kind + " (erwartet " + SF8_PIVOT_KINDS[v.candidateId] + ")");
      }
    });
    /* vierte Nachpruefung: auch die Strategie-Eintraege (Lesarten der Referenz) und die Kurzzeilen tragen keine Orderpreise */
    var strategyLists = [["index.json", ((b.index || {}).strategies) || []], ["summary.json", ((b.summary || {}).strategies) || []]];
    Object.keys(b.strategies || {}).forEach(function (c) { if (b.strategies[c]) strategyLists.push(["strategy/" + c, [b.strategies[c]]]); });
    strategyLists.forEach(function (l) {
      l[1].forEach(function (st) {
        (st.readings || []).forEach(function (r) {
          Object.keys(r || {}).forEach(function (k) { if (["ruleId", "reading"].indexOf(k) < 0) fail.push(l[0] + " " + st.candidateId + ": readings." + k + " ist nicht vorgesehen"); });
          if (sf8PriceInText(r) || hasNumber(r)) fail.push(l[0] + " " + st.candidateId + ": Preis oder Zahl in einer Lesart (" + r.ruleId + ")");
        });
      });
    });
    /* abgelehnte Datensaetze (Vertragsfehler) und Aenderungsliste: nur Codes, kein Preis (fuenfte Nachpruefung) */
    (((b.index || {}).rejectedRecords) || []).forEach(function (r) {
      Object.keys(r || {}).forEach(function (k) { if (["strategyId", "ticker", "reason", "stage", "checks", "errors"].indexOf(k) < 0) fail.push("index.json rejectedRecords " + (r && r.ticker) + ": Feld " + k + " ist nicht vorgesehen"); });
      if (hasNumber(r) || sf8PriceInText(r)) fail.push("index.json rejectedRecords " + (r && r.ticker) + ": Zahl oder Preis in einem Ablehnungsgrund");
    });
    if (sf8PriceInText(((b.index || {}).changes) || null)) fail.push("index.json changes: Preis in der Aenderungsliste");
    sf8Rows(b).forEach(function (x) {
      Object.keys(x.r).forEach(function (k) { if (SF8_ROW_KEYS.indexOf(k) < 0) fail.push(x.where + " " + x.r.c + " " + x.r.t + ": Feld " + k + " gehoert nicht zur Kurzzeile"); });
    });
    return result("DQ-SF8-4", "SF8 ohne Order-/Stopmarken unterhalb des modellierten Ablaufs", "ERROR", checked, fail);
  }

  /** DQ-SF8-5: Quarantaene (V4-D1) und Datenqualitaet - betroffene Ansichten hoechstens Chart-Kandidat, kein FAIL veroeffentlicht. */
  function sf8Quarantine(b) {
    var g = sf8Gate("DQ-SF8-5", "SF8-Quarantaene und Datenqualitaetsgrenzen eingehalten", b); if (g) return g;
    var fail = [], checked = 0;
    sf8AllViews(b).forEach(function (v) {
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
    sf8Rows(b).forEach(function (x) { checked++; if (["PASS", "CAP"].indexOf(x.r.q) < 0) fail.push(x.where + " " + x.r.c + " " + x.r.t + ": Datenqualitaet " + x.r.q); });
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
    Object.keys(b.strategies || {}).forEach(function (c) { if (SF8_IDS.indexOf(c) < 0) fail.push("strategy/" + c + ".json ist keine der 13 Methoden"); });
    if (!b.index) fail.push("index.json fehlt");
    else if (b.index.schema !== SF8_SCHEMA || b.index.asOf !== asOf) fail.push("index.json: Kopf passt nicht (" + b.index.schema + " " + b.index.asOf + ")");
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
    /* Scherbe = dieselbe Ansicht wie in der Strategiedatei (die Aktienseite zeichnet aus der Scherbe) */
    var byKey = {};
    sf8Views(b).forEach(function (v) { byKey[v.candidateId + "|" + v.ticker] = JSON.stringify(v); });
    Object.keys(b.tickers || {}).forEach(function (k) { var t = b.tickers[k]; ((t && t.views) || []).forEach(function (v) { var key = v.candidateId + "|" + v.ticker; if (byKey[key] && byKey[key] !== JSON.stringify(v)) fail.push("ticker/" + k + ": " + key + " weicht von strategy/" + v.candidateId + ".json ab"); }); });
    /* Kurzzeilen: index.json.candidates genau eine je Ansicht, Stufe/Schluss/Scherbe gleich; summary.top Teilmenge davon */
    var rowKey = {};
    (((b.index || {}).candidates) || []).forEach(function (r) {
      var key = r.c + "|" + r.t, v = byKey[key] ? JSON.parse(byKey[key]) : null;
      if (rowKey[key]) fail.push("index.json: " + key + " doppelt"); rowKey[key] = JSON.stringify(r);
      if (!v) fail.push("index.json: " + key + " ohne Ansicht");
      else if (r.s !== v.stage || r.x !== v.close || r.sh !== v.shard || r.q !== v.dataQuality.status) fail.push("index.json: " + key + " weicht von der Ansicht ab");
    });
    if (b.index && Object.keys(rowKey).length !== total) fail.push("index.json: " + Object.keys(rowKey).length + " Zeilen, Ansichten " + total);
    var top = s.top || {};
    Object.keys(top).forEach(function (c) {
      if (SF8_IDS.indexOf(c) < 0) fail.push("summary.top." + c + ": keine der 13 Methoden");
      if ((top[c] || []).length > 5) fail.push("summary.top." + c + ": mehr als fuenf Zeilen");
      (top[c] || []).forEach(function (r) { if (r.c !== c || rowKey[r.c + "|" + r.t] !== JSON.stringify(r)) fail.push("summary.top." + c + ": " + r.c + "|" + r.t + " ist keine Zeile aus index.json"); });
    });
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
      if (ref.securityId !== v.securityId || ref.ticker !== v.ticker || ref.instrumentId !== v.ticker || ref.currency !== "USD") { fail.push(where + ": Reihe gehoert zu " + ref.securityId + "/" + ref.ticker + "/" + ref.instrumentId + "/" + ref.currency); return; }
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
    staleTails: staleTails, masterSeriesConsistency: masterSeriesConsistency,
    payloadIndexParity: payloadIndexParity, referencedPathsExist: referencedPathsExist,
    indexMembersResolve: indexMembersResolve,
    technicalFreshness: technicalFreshness, technicalEmptyFields: technicalEmptyFields, technicalCloseParity: technicalCloseParity, technicalCoverage: technicalCoverage, technicalTimeframeFields: technicalTimeframeFields,
    secFiscalYearLabels: secFiscalYearLabels, secFuturePeriods: secFuturePeriods, secRefusals: secRefusals,
    SF8_CEILING: SF8_CEILING, SF8_BUDGET: SF8_BUDGET, SF8_STRUCTURE_LEVELS: SF8_STRUCTURE_LEVELS, SF8_PIVOT_KINDS: SF8_PIVOT_KINDS, SF8_DESCRIPTIVE_FEATURES: SF8_DESCRIPTIVE_FEATURES, SF8_FEATURES_HIDDEN: SF8_FEATURES_HIDDEN, SF8_TREND_HIDDEN: SF8_TREND_HIDDEN, SF8_SUBFIELDS_HIDDEN: SF8_SUBFIELDS_HIDDEN, SF8_PIVOT_LEVEL: SF8_PIVOT_LEVEL, SF8_VIEW_KEYS: SF8_VIEW_KEYS, SF8_TREND_KEYS: SF8_TREND_KEYS, SF8_SORT_KEYS: SF8_SORT_KEYS,
    sf8Freshness: sf8Freshness, sf8Identity: sf8Identity, sf8StageLock: sf8StageLock, sf8NoOrderBelowModel: sf8NoOrderBelowModel,
    sf8Quarantine: sf8Quarantine, sf8Contracts: sf8Contracts, sf8Budget: sf8Budget, sf8PriceParity: sf8PriceParity, sf8Rules: sf8Rules,
    summarize: summarize
  };
});
