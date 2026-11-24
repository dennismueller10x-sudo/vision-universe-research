/* VISION UNIVERSE ELLIOTT — engine/roles.js. Rollen der Schritte im Pfad der Zählung von oben (24.11.2026), UMD, kein DOM, kein Netz.
   Leser: Großes Bild und Wellenbühne (elliott/bigpicture.js#plan, elliott/stage.js), Ereignisse und Radar
   (scripts/technical/lib/ti-elliott-events.mjs#roles).

   Regel: Die Richtung der Kursziele ist die Richtung des ersten Antriebsschritts im Pfad (großer Grad 1, 3, 5, A; Unterteilung einer
   laufenden großen Antriebswelle 1, 3, 5, A, C). Korrekturschritte sind großer Grad 2, 4, B, C, Unterteilung 2, 4, B und jede Unterwelle
   einer laufenden großen Korrektur (2, 4, B, C). Steht vor dem ersten Antriebsschritt ein Korrekturschritt in die Gegenrichtung, ist dessen
   Zone die
   Einstiegszone. Kursziele sind der erste Antriebsschritt und spätere Schritte in dieselbe Richtung, außer Korrekturen (C zählt mit, sie
   setzt die Richtung von A fort). Hat der Pfad keinen Antriebsschritt, gilt die frühere Lesart: dreht der Pfad nach dem ersten Schritt,
   ist dieser die Einstiegszone.
   Behebt (24.11.2026): bisher galt jede Wende nach dem ersten Schritt als Einstieg, auch wenn der erste Schritt selbst die laufende
   Antriebswelle war ([3] hoch, [4] runter, [5] hoch las sich als „Einstieg Welle 3, Kursziel Welle 4“) oder eine Unterwelle eine große
   Korrektur beendete; Einstieg oder erstes Kursziel ändern sich damit in 2.019 von 4.429 Pfaden (Stand 20.11.2026). */
(function (global) {
  "use strict";
  var CORR_BIG = { "2": 1, "4": 1, B: 1, C: 1 }, CORR_SUB = { "2": 1, "4": 1, B: 1 };
  /** cur: Etikett der laufenden großen Welle (primary.cur); ohne Angabe gelten Unter-A und -C als Korrektur. */
  function corrective(s, cur) {
    var l = String(s.l || s.label || ""), deg = s.deg || s.degree;
    if (deg !== "SUB") return !!CORR_BIG[l];
    if (CORR_SUB[l]) return true;
    return cur == null ? l === "A" || l === "C" : !!CORR_BIG[String(cur)];   // Unterwellen einer großen Korrektur führen zur Einstiegszone
  }
  function dirOf(s) { return s.dir || s.direction; }
  /** path: Schritte { l, deg, dir }, cur: laufende große Welle → { dirT, entry (Index oder −1), first (Index des ersten Kursziels), roles } */
  function roles(path, cur) {
    var P = path || [], n = P.length, out = [], m = -1, i;
    if (!n) return { dirT: null, entry: -1, first: -1, roles: out };
    for (i = 0; i < n; i++) if (!corrective(P[i], cur)) { m = i; break; }
    if (m < 0) m = n > 1 && dirOf(P[0]) !== dirOf(P[1]) ? 1 : 0;
    var dirT = dirOf(P[m]), entry = -1;
    for (i = m - 1; i >= 0; i--) if (dirOf(P[i]) !== dirT) { entry = i; break; }
    for (i = 0; i < n; i++) {
      var s = P[i], l = String(s.l || s.label || "");
      out.push(i === entry ? "entry" : i < m ? "step" : dirOf(s) === dirT && (i === m || !corrective(s, cur) || l === "C") ? "target" : "step");
    }
    return { dirT: dirT, entry: entry, first: m, roles: out };
  }
  var api = { roles: roles, corrective: corrective };
  global.VUElliottRoles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
