/* VISION UNIVERSE ELLIOTT — engine/plan.js. Plan einer Elliott-Lesart (Owner 23.11.2026), UMD, kein DOM, kein Netz.
   Leser: Aktienbild im Elliott-Produkt (quant/app/page-chartbild.js) und Wochenkarten (scripts/technical/elliott-outlook/build-cards.mjs).
   Nur, was aus der Zaehlung selbst folgt: Richtung der laufenden Welle, Folgebewegung laut Muster, Ungueltig-Marke der Zaehlung und die noch
   offene Zone der Elliott-Projektion derselben Zaehlung. Das Szenario-Modell (Widerstand, Unterstuetzung) gehoert nicht dazu. Zone nur, wenn die
   Engine die Projektion selbst zeigt (consumerVisible, keine Enthaltung). Ueberholt: alle Projektionszonen derselben Zaehlung sind durchlaufen
   (Status EXHAUSTED) – die Bewegung ist groesser, als die Zaehlung zulaesst. Keine neue Rechnung. */
(function (global) {
  "use strict";
  function planOf(a) {
    var E = a && a.pro && a.pro.elliott, c = E && E.primary;
    if (!c) return null;
    var abstain = !!(E.applicability && E.applicability.abstain), key = c.persistenceKey ? String(c.persistenceKey) + "|" : null;
    var P = [a.projection, a.projectionWeekly].filter(function (p) { return p && p.primary && p.timeframe === a.timeframe; })[0] || null;
    var t = P && key && String(P.primary.key || "").indexOf(key) === 0 ? P.primary : null;
    var overtaken = !!t && t.status === "EXHAUSTED", cw = c.currentWave || {};
    var dir = c.complete ? c.nextMove : cw.direction;
    var inv = c.invalidation && typeof c.invalidation.price === "number" && isFinite(c.invalidation.price) ? { price: c.invalidation.price, direction: c.invalidation.direction } : null;
    var z = !abstain && !overtaken && t && P.consumerVisible && t.status !== "INVALID" ? (t.zones || []).filter(function (q) { return q.state !== "PASSED" && typeof q.low === "number"; })[0] || null : null;
    var nx = c.nextMove === "UP" || c.nextMove === "DOWN" ? c.nextMove : null;
    /* Danach: nur wenn die laufende Welle die letzte des Musters ist, folgt laut Muster die Gegenbewegung (nextMove der Engine). */
    var last = !c.complete && cw.wave && cw.of && cw.wave === cw.of;
    return { dir: dir === "UP" || dir === "DOWN" ? dir : null, next: c.complete || last ? nx : null, wave: c.complete ? null : cw.label || null, developing: !c.complete, abstain: abstain, overtaken: overtaken,
      invalidation: inv, zone: z ? { low: z.low, high: z.high, tier: z.tier } : null };
  }
  var api = { VERSION: "elliott-plan-1.0.0", planOf: planOf };
  global.VUElliottPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
