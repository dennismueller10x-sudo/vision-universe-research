/* =========================================================================
   VISION UNIVERSE — quant/engines/technical/price-jumps.js

   KENNZEICHNUNG AUFFAELLIGER KURSSPRUENGE (Datenqualitaet, ab screen-row 1.13.0)

   Ein Schlusssprung ist auffaellig, wenn sein Faktor die Signatur eines nicht
   nachgezogenen Splits traegt oder ausserhalb 0,2..5 liegt (dieselbe Regel wie
   formations.js#suspectJump und DQ-PX-3-Groessenordnung). Zwei Stufen:
     SUSPECT    Verdacht: auffaelliger Sprung ohne Beleg.
     CONFIRMED  bestaetigter Datenfehler: Die Marktdaten-Domaene belegt eine
                Kapitalmassnahme innerhalb von 5 Sitzungen um den Sprung, die
                der Anbieter nicht fuehrt (quant/config/corporate-action-
                confirmations.json, SEC-Beleg). Keine tickerbezogene Regel: nur
                der Beleg im Register entscheidet.
   Keine Warnung bei korrekt bereinigten Kapitalmassnahmen (die Reihe springt
   dort nicht) und bei gewoehnlichen Bewegungen (Faktor 0,2..5 ohne Signatur).
   Hohes Volumen entlastet NICHT: Abspaltungen und nicht bereinigte Splits
   handeln am Sprungtag typischerweise mit vielfachem Volumen (Befund
   30.10.2026: CTVA 77,65 -> 12,57, ELME 1,77 -> 0,03, MI 0,89 -> 7 -> 1,23).
   Das Volumenverhaeltnis steht nur als Information im Ergebnis.
   Fenster: WINDOW Tagesbars (52 Wochen; das laengste Fenster der Vorlagen-
   Kriterien, SMA 200 + 21 Tage und 52-Wochen-Hoch/-Tief).
   ========================================================================= */
(function (global) {
  "use strict";
  var VERSION = "technical-price-jumps-1.0.0";
  var WINDOW = 252, CONFIRM_SESSIONS = 5;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  /** Split-Signatur: Faktor n oder 1/n (n = 2..50) auf 2 % genau. */
  function splitSignature(ratio) {
    if (!isNum(ratio) || ratio <= 0) return false;
    var r = ratio >= 1 ? ratio : 1 / ratio, n = Math.round(r);
    return n >= 2 && n <= 50 && Math.abs(r / n - 1) <= 0.02;
  }
  /** Auffaellig: Split-Signatur oder Faktor ausserhalb 0,2..5 (ungueltiger Faktor ebenfalls). */
  function suspicious(ratio) {
    if (!isNum(ratio) || ratio <= 0) return true;
    return ratio < 0.2 || ratio > 5 || splitSignature(ratio);
  }
  function volumeRatio(bars, k) {
    var v = bars.volume;
    if (!v || !isNum(v[k]) || k < 5) return null;
    var w = [];
    for (var j = Math.max(0, k - 20); j < k; j++) if (isNum(v[j]) && v[j] > 0) w.push(v[j]);
    if (w.length < 5) return null;
    w.sort(function (a, b) { return a - b; });
    var med = w[Math.floor(w.length / 2)];
    return med > 0 ? v[k] / med : null;
  }
  /** Bewertung eines Sprungs an Index k; null = nicht auffaellig. */
  function judge(bars, k, confirmations) {
    var a = bars.close[k - 1], b = bars.close[k];
    if (!(isNum(a) && a > 0 && isNum(b) && b > 0)) return null;
    var r = b / a;
    if (!suspicious(r)) return null;
    var sig = splitSignature(r), vr = volumeRatio(bars, k);
    var conf = null;
    (confirmations || []).forEach(function (c) {
      if (conf || !c || typeof c.effectiveDate !== "string") return;
      var e = bars.timestamps.indexOf(c.effectiveDate);
      if (e < 0) for (var j = 0; j < bars.timestamps.length; j++) if (String(bars.timestamps[j]) >= c.effectiveDate) { e = j; break; }
      if (e >= 0 && Math.abs(e - k) <= CONFIRM_SESSIONS) conf = c;
    });
    return { date: String(bars.timestamps[k]).slice(0, 10), factor: Math.round(r * 1e4) / 1e4, status: conf ? "CONFIRMED" : "SUSPECT",
      splitSignature: sig, volumeRatio: vr === null ? null : Math.round(vr * 100) / 100, confirmation: conf ? (conf.id || null) : null };
  }
  /** Juengster auffaelliger Sprung im Fenster der letzten `window` Bars (Standard WINDOW) oder null. */
  function latest(bars, confirmations, window) {
    if (!bars || !bars.close || bars.close.length < 2) return null;
    var n = bars.close.length, w = window || WINDOW;
    for (var k = n - 1; k >= Math.max(1, n - w); k--) { var j = judge(bars, k, confirmations); if (j) return j; }
    return null;
  }
  /** Alle auffaelligen Spruenge (Chart Studio, ganze geladene Reihe). */
  function all(bars, confirmations) {
    var out = [];
    if (!bars || !bars.close) return out;
    for (var k = 1; k < bars.close.length; k++) { var j = judge(bars, k, confirmations); if (j) out.push(j); }
    return out;
  }
  /** Verstaendlicher Text je Stufe (Vorlage, Chart Studio, Screener). */
  function describe(j, dateDe) {
    if (!j) return null;
    var d = dateDe ? dateDe(j.date) : j.date, f = "×" + String(j.factor).replace(".", ",");
    return j.status === "CONFIRMED"
      ? { short: "Datenfehler bestätigt (" + d + ")", long: "Bestätigter Datenfehler: Kurssprung " + f + " am " + d + " ist eine belegte, in den Kursdaten nicht bereinigte Kapitalmaßnahme. Kriterien, die diesen Zeitraum nutzen (Durchschnitte, 52-Wochen-Werte, relative Stärke), sind für diese Aktie nicht verlässlich." }
      : { short: "Datenverdacht (" + d + ")", long: "Datenverdacht: Kurssprung " + f + " am " + d + (j.splitSignature ? " mit Split-Signatur" : " (Faktor außerhalb 0,2–5)") + ". Möglicherweise eine nicht bereinigte Kapitalmaßnahme (Split, Abspaltung) oder ein Datenfehler; Kriterien, die diesen Zeitraum nutzen, können verfälscht sein." };
  }

  var api = { VERSION: VERSION, WINDOW: WINDOW, CONFIRM_SESSIONS: CONFIRM_SESSIONS,
    splitSignature: splitSignature, suspicious: suspicious, judge: judge, latest: latest, all: all, describe: describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { global.VUTechnical = global.VUTechnical || {}; global.VUTechnical.PriceJumps = api; }
})(typeof window !== "undefined" ? window : globalThis);
