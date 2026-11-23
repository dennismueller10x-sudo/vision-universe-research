/* =========================================================================
   VISION UNIVERSE CORE — world-status.js
   WAS SAGEN DIE WELTEN ZU EINER AKTIE? (Schnittmenge, nur Daten)

   Je Aktie und je Produktwelt genau ein Zustand:
     strong | mid | weak   die Welt trifft eine Aussage
     null                  die Welt sagt zu dieser Aktie nichts (keine Daten, eingefroren, kein Kandidat)

   Keine eigene Rechnung und keine neue Bewertung: Jede Welt wird mit derselben Regel gelesen wie auf ihrer
   eigenen Seite und auf der Aktienseite. Die Regeln der Aktienseite stehen in assets/vu-stock-sheet.js#model
   (businessVerdict, techVerdict, balance, ST_STAGES) und werden hier nur aufgerufen, nicht abgeschrieben.

     fundamental   businessVerdict: Wachstum und Profitabilitaet der Discover-Fundamentaldaten, es zaehlt die schwaechere Stufe
     technical     techVerdict: Kurs ueber SMA 50 und SMA 200 -> strong, ueber einer der beiden -> mid, unter beiden -> weak;
                   eingefrorene Reihe -> keine Aussage
     hedgefonds    balance: Anteil der kaufenden an allen bewegten Fonds (13F), ab 60 % strong, bis 40 % weak, sonst mid
     supertrader   hoechste Stufe ueber alle Methoden: "Regel erfuellt" oder "Plan fertig" -> strong, "Muster erkannt" -> mid;
                   eine Methode sagt nie "weak", sie fuehrt die Aktie dann nicht
     quant         Platz im Gesamtwert (Durchschnitt der Eigenschaften, vu-profile-mean): bestes Fuenftel -> strong,
                   schwaechstes Fuenftel -> weak, dazwischen mid (QUANT_FIFTH). Fuenftel, weil die Faktor-Forschung
                   bestes gegen schwaechstes Fuenftel misst (docs/quant/QUANT_FINAL_HANDOVER.md).

   Beschreibend: "strong" heisst, die Messwerte dieser Welt stehen gut, nicht, dass die Aktie zu kaufen waere.
   Kein Gesamturteil, keine Gewichtung, keine Rangfolge: gezaehlt wird nur, wie viele Welten etwas sagen und was.

   UMD: Browser (globalThis.VUCore.WorldStatus), Node (require).
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VUCore = root.VUCore || {};
  root.VUCore.WorldStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "vu-world-status-1.0.0";
  var WORLDS = ["fundamental", "quant", "technical", "hedgefonds", "supertrader"];
  var STATES = ["strong", "mid", "weak"];
  var QUANT_FIFTH = 0.2;
  /* Kurzform fuer das Spaltenartefakt: ein Zeichen je Welt und Aktie. */
  var CODE = { strong: "s", mid: "m", weak: "w" };
  var DECODE = { s: "strong", m: "mid", w: "weak", "-": null };

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function state(v) { return STATES.indexOf(v) >= 0 ? v : null; }

  /** Quant: Platz 1 ist der beste. Bestes Fuenftel = Platz <= ceil(0,2 * of); schwaechstes = Platz > of - ceil(0,2 * of). */
  function quantState(place, of) {
    if (!isNum(place) || !isNum(of) || place < 1 || of < 5 || place > of) return null;
    var fifth = Math.ceil(QUANT_FIFTH * of);
    return place <= fifth ? "strong" : place > of - fifth ? "weak" : "mid";
  }

  /** Supertrader: stages = Stufen der Aktie ueber alle Methoden; order = assets/vu-stock-sheet.js#model.ST_STAGES (aufsteigend). */
  function supertraderState(stages, order) {
    if (!Array.isArray(stages) || !stages.length || !Array.isArray(order)) return null;
    var best = -1;
    stages.forEach(function (s) { var i = order.indexOf(s); if (i > best) best = i; });
    return best < 0 ? null : best >= 1 ? "strong" : "mid";
  }

  /**
   * Zustand je Welt fuer eine Aktie.
   *   input.detail        Discover-Aktiendatei (fundamentals.health) | null
   *   input.tech          Technical-Stand je Aktie (trend, frozenSince) | null
   *   input.hedge         { buyers, sellers } | null
   *   input.stages        Supertrader-Stufen der Aktie | null
   *   input.quant         { place, of } | null
   *   model               assets/vu-stock-sheet.js#model (Regeln der Aktienseite)
   */
  function statusOf(input, model) {
    var i = input || {}, out = {};
    var b = i.detail ? model.businessVerdict(i.detail) : null;
    out.fundamental = b ? state(b.kind) : null;
    out.quant = i.quant ? quantState(i.quant.place, i.quant.of) : null;
    var t = i.tech ? model.techVerdict(i.tech) : null;
    out.technical = t ? state(t[1]) : null;
    var h = i.hedge ? model.balance(i.hedge.buyers, i.hedge.sellers) : null;
    out.hedgefonds = h ? state(h[1]) : null;
    out.supertrader = supertraderState(i.stages, model.ST_STAGES);
    return out;
  }

  /** Zaehlung: wie viele Welten sagen etwas, wie viele davon strong bzw. weak. */
  function count(status) {
    var c = { stated: 0, strong: 0, weak: 0 };
    WORLDS.forEach(function (w) { var s = status[w]; if (!s) return; c.stated++; if (s === "strong") c.strong++; else if (s === "weak") c.weak++; });
    return c;
  }

  function encode(status) { return WORLDS.map(function (w) { return CODE[status[w]] || "-"; }).join(""); }
  function decode(code) {
    var out = {};
    WORLDS.forEach(function (w, k) { var c = typeof code === "string" ? code.charAt(k) : ""; out[w] = Object.prototype.hasOwnProperty.call(DECODE, c) ? DECODE[c] : null; });
    return out;
  }

  var RULES = {
    fundamental: "Wachstum und Profitabilität aus den Unternehmensberichten; es zählt die schwächere der beiden Stufen",
    quant: "Platz im Gesamtwert (Durchschnitt der Eigenschaften): bestes Fünftel stark, schwächstes Fünftel schwach",
    technical: "Kurs über der 50- und der 200-Tage-Linie stark, über einer der beiden mittel, unter beiden schwach",
    hedgefonds: "Anteil der kaufenden an allen bewegten Fonds der letzten 13F-Meldungen: ab 60 % stark, bis 40 % schwach",
    supertrader: "höchste Stufe über alle Methoden: Regel erfüllt oder Plan fertig stark, Muster erkannt mittel"
  };

  return Object.freeze({ VERSION: VERSION, WORLDS: WORLDS.slice(), STATES: STATES.slice(), QUANT_FIFTH: QUANT_FIFTH, RULES: Object.freeze(RULES),
    quantState: quantState, supertraderState: supertraderState, statusOf: statusOf, count: count, encode: encode, decode: decode });
});
