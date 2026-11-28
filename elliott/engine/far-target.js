/* VISION UNIVERSE ELLIOTT — engine/far-target.js. Fernziel der Methode (Entwurf 25.11.2026), UMD, kein DOM, kein Netz.
   Leser: Wellenbühne (elliott/stage.js). Rechnet nur aus der veröffentlichten Zählung von oben (elliottTopDown: primary, path) mit den
   Verhältnissen, die auch der Pfad nutzt (Frost & Prechter); keine Zeitangabe, keine Wahrscheinlichkeit.

   Nur bei einem übergeordneten Aufwärtsimpuls (primary IMPULSE UP), zwei Fälle:
   1. Ist Welle 5 des großen Impulses abgeschlossen oder läuft sie gerade (Ende im Pfad), gilt der ganze Impuls seit dem Ursprung als
      Welle (I) des nächsthöheren Grades. Nach der Korrektur (II) (Ende: Zone C im Pfad, sonst 50 % von (I)) folgt Welle (III):
      1,0–1,618 × (I) ab dem Ende von (II), erweitert bis 2,618 × (I). Harte Regel: (III) endet über dem Ende von (I).
   2. Läuft der Impuls noch in Welle 1 bis 4 und steht Welle 5 im Pfad, ist das Fernziel ihre Zone (Ende des großen Impulses; 1.2.0: vorher schon
      Welle III danach, das war zu weit). Steht sie nicht im Pfad, ist das Fernziel ihr Ende: über das Ende von Welle 3
      hinaus, 0,382–0,618 × Strecke 1 bis 3 ab dem Ende von Welle 4 (wie W5_NET13 der Engine), erweitert bis 1,0.
   Übergeordneter Grad in römischen Ziffern (I, II, III), damit er sich von den Wellen 1–5 und den Unterwellen (a)–(c) abhebt.
   Bei einem übergeordneten Abwärtsimpuls gibt es kein Fernziel (Rückgabe { none: "DOWN" }), ebenso wenn die Korrektur II tiefer als
   88,6 % von Welle I läuft ({ none: "DEEP" }). Linear wie der Pfad der Methode. */
(function (global) {
  "use strict";
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function core(s) { var t = (s.tiers || []).filter(function (z) { return !z.done; })[0] || (s.tiers || [])[s.tiers.length - 1]; return t ? { lo: t.lo, hi: t.hi } : null; }
  function mid(s) { var z = s && core(s); return z ? (z.lo + z.hi) / 2 : null; }
  function far(td) {
    var p = td && td.primary;
    if (!p || !p.waves || !p.waves.length) return null;
    if (p.dir !== "UP" || p.kind !== "IMPULSE") return { none: p.dir === "DOWN" ? "DOWN" : "KIND" };
    var W = p.waves, O = W[0].fp, P = td.path || [], cur = String(p.cur || "");
    var wave = function (l) { return W.filter(function (w) { return w.l === l; })[0] || null; };
    /* Schritt im Pfad, der eine große Welle beendet: großer Grad mit diesem Etikett oder Unterwelle, wenn genau diese große Welle läuft */
    var ends = function (l) { return P.filter(function (s) { return s.l === l && (s.deg === "BIG" || (s.deg === "SUB" && cur === l)); })[0] || null; };
    var since = String(W[0].ft).slice(0, 4), w5 = wave("5"), s5 = ends("5");
    if ((w5 && !w5.dev) || (s5 && cur === "5")) {
      var highs = W.filter(function (w) { return "12345".indexOf(w.l) >= 0 && !w.dev; }).map(function (w) { return Math.max(w.fp, w.tp); });
      var top = w5 && !w5.dev ? Math.max.apply(null, highs) : Math.max.apply(null, highs.concat([mid(s5)]));
      var L = top - O, wc = wave("C"), sc = ends("C");
      var two = sc ? mid(sc) : wc && !wc.dev ? wc.tp : top - 0.5 * L, twoFrom = sc ? "Zone C im Pfad" : wc && !wc.dev ? "Ende von C" : "50 % von Welle I";
      if (!(L > 0) || !isNum(two)) return null;
      /* Steht der Kurs schon unter dem projizierten Ende von II, ist II mindestens so tief wie der Kurs heute */
      if (isNum(td.close) && td.close < two) { two = td.close; twoFrom = "Kurs heute (Korrektur tiefer als die Zone)"; }
      /* Laeuft die Korrektur II tiefer als 88,6 % von Welle I (Grenze der Ruecklaeufe, W2_RETRACE), traegt die Annahme kein Fernziel */
      if ((top - two) / L > 0.886) return { none: "DEEP" };
      return { kind: "III", label: "III", lo: Math.max(top, two + L), hi: two + 1.618 * L, ext: { lo: two + 1.618 * L, hi: two + 2.618 * L },
               top: top, origin: O, two: two, twoFrom: twoFrom, since: since,
               rule: "Welle III = 1,0–1,618 × Welle I ab dem Ende der Korrektur II, erweitert bis 2,618; sie muss über dem Ende von Welle I enden",
               assume: "Annahme: die Wellen 1 bis 5 seit " + since + " bilden zusammen Welle I eines noch größeren Aufwärtstrends; die Korrektur II endet bei " + twoFrom };
    }
    /* Welle 5 steht im Pfad: das Fernziel ist ihre Zone (Ende des laufenden großen Impulses) */
    if (s5) {
      var t5 = s5.tiers || [], base = t5[0], ext5 = t5[t5.length - 1];
      if (base && base.hi > 0) return { kind: "5", label: "5", inPath: true, lo: base.lo, hi: base.hi, ext: { lo: ext5.lo, hi: ext5.hi }, top: s5.from, origin: O, since: since,
        rule: "Welle 5 im Pfad der Methode: " + (s5.rel === "W5_NET13" ? "0,382–0,618 × Strecke 1 bis 3 ab dem Ende von Welle 4, erweitert bis 1,0" : "0,618–1,0 × Welle 1 ab dem Ende von Welle 4, erweitert bis 1,618"),
        assume: "Fortsetzung des Impulses seit " + since + " über die Schritte im Pfad bis zum Ende von Welle 5" };
    }
    var w3 = wave("3"), w4 = wave("4"), e3 = w3 && !w3.dev ? w3.tp : mid(ends("3")), e4 = w4 && !w4.dev ? w4.tp : mid(ends("4"));
    if (!isNum(e3) || !isNum(e4) || !(e3 > O)) return null;
    var n13 = e3 - O;
    return { kind: "5", label: "5", lo: Math.max(e3, e4 + 0.382 * n13), hi: Math.max(e3, e4 + 0.618 * n13), ext: { lo: Math.max(e3, e4 + 0.618 * n13), hi: e4 + 1.0 * n13 },
             top: e3, origin: O, since: since,
             rule: "Welle 5 über das Ende von Welle 3 hinaus: 0,382–0,618 × Strecke 1 bis 3 ab dem Ende von Welle 4, erweitert bis 1,0",
             assume: "Fortsetzung des Impulses seit " + since + " über die Wellen 3 und 4 im Pfad" };
  }
  var api = { far: far };
  global.VUElliottFar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
