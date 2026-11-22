/* VISION UNIVERSE ELLIOTT — bilanz.js: Prognose-Tagebuch /elliott/#/?bilanz=1 (Elliott-Neustart Schritt 4, Owner 22.11.2026).
   Jede Lesart wird vorab eingefroren (Elliott-Registry, Hash-Kette) und später automatisch abgerechnet. Die Seite zeigt Bestand,
   Prüfsumme und Abrechnungstermine aus elliott-home.json (Block bilanz). Ergebniszahlen erscheinen erst mit Owner-Freigabe
   (elliott/config/bilanz.json → bilanz.resultsPublic); sie sind eine öffentliche Aussage über Performance. Lädt erst mit der Adresse. */
(function (global) {
  "use strict";
  var H_TXT = { "3M": "3 Monate", "6M": "6 Monate", "12M": "12 Monate", "24M": "24 Monate", "36M": "36 Monate" };
  global.VUElliottBilanz = function (host, c) {
    var M = c.M, el = c.el, b = M.bilanzOf(c.home);
    host.append(c.head("Prognose-Tagebuch", "Jede Lesart wird mit Datum und Prüfsumme eingefroren, bevor der Markt entscheidet, und später automatisch abgerechnet – auch die, die nicht aufgehen."));
    if (!b) { host.append(el("p", { class: "vu-empty", text: "Der Stand des Tagebuchs liegt gerade nicht vor." })); return; }
    host.append(el("section", { class: "ek-tile ek-kopf", "aria-label": "Bestand" }, [el("div", { class: "ek-kopf-n" }, [
      el("div", { class: "ek-f1" }, [el("span", { class: "ek-num ek-lc ek-big", text: b.events.toLocaleString("de-DE") }), el("b", { text: "eingefrorene Lesarten seit " + M.dateDe(b.since) })]),
      el("div", { class: "ek-f1" }, [el("span", { class: "ek-num ek-big", text: b.revisions.toLocaleString("de-DE") }), el("b", { class: "ek-mut", text: "Statusmeldungen (bestätigt, ungültig, Zone)" })])])]));
    host.append(c.sh("Abrechnung"), el("div", { class: "ek-rail", role: "list", "aria-label": "Abrechnungstermine" }, b.horizons.map(function (h) {
      return el("div", { class: "ek-tile ek-stat", role: "listitem" }, [el("span", { class: "ek-num ek-lc", text: h.h.replace("M", "") }), el("b", { class: "ek-xs", text: (H_TXT[h.h] || h.h) + " · erste Abrechnung " + M.dateDe(h.firstEvaluableWeek) }), el("span", { class: "ek-xs ek-mut", text: h.pending.toLocaleString("de-DE") + " Lesarten offen" })]); })));
    host.append(el("p", { class: "ek-sub ek-sm ek-mut", style: "margin-top:14px", text: b.resultsPublic ? "Ergebnisse: siehe abgelaufene Horizonte (Forschung, nicht zertifiziert)." : b.evaluatedGroups ? "Erste Horizonte sind abgerechnet. Die Ergebnisse erscheinen hier, sobald sie zur Veröffentlichung freigegeben sind." : "Noch kein Horizont ist abgelaufen. Abgerechnet wird gegen eine gleichzeitige Vergleichsgruppe ohne dieselbe Lesart." }),
      el("p", { class: "ek-xs ek-mut", style: "overflow-wrap:anywhere", text: "Prüfsumme der Kette (SHA-256, Eintrag " + b.head.seq.toLocaleString("de-DE") + "): " + b.head.hash }),
      el("p", { class: "vu-mu vu-xs el-exp", text: "Forschung, nicht zertifiziert. Keine Anlageberatung, keine Empfehlung." }));
  };
})(window);
