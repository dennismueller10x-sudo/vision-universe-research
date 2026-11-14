/* VISION UNIVERSE ELLIOTT — about.js: Fenster „Wellen in 3 Minuten“ (Schema, vier Begriffe, Hinweis, Methodik).
   Kommt erst beim Antippen der Karte auf der Startseite (elliott/app.js#openAbout); Inhalt unverändert seit Konzept EHV. */
(function (global) {
  "use strict";
  var U = global.VUUI, node = null;
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") n.textContent = attrs[k]; else if (k === "onclick") n.addEventListener("click", attrs[k]); else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.append(c); });
    return n;
  }
  function frag(html) { var t = document.createElement("template"); t.innerHTML = html; return t.content; }
  global.VUElliottAbout = function () {
    var title = "Wellen in 3 Minuten";
    if (!node) { node = frag(U.sheet("el-sheet", title, "")).firstChild; document.body.append(node); }
    var box = node.querySelector(".vu-sheet-ui"), P = [[0, 70], [58, 46], [116, 58], [174, 18], [232, 34], [290, 6], [340, 12]];
    var path = "M" + P.map(function (p) { return p.join(" "); }).join(" L");
    var svg = '<svg class="el-schema" viewBox="-8 0 356 90" role="img" aria-label="Schema: fünf Schritte, drei nach vorn und zwei zurück"><path d="' + path + ' L340 90 L0 90Z" fill="#c8f531" opacity=".35"/><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>' +
      P.slice(1, 6).map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="currentColor"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle" class="el-schema-n">' + (i + 1) + "</text>"; }).join("") + '<circle cx="340" cy="12" r="5" fill="#c8f531" stroke="currentColor" stroke-width="2"/></svg>';
    var term = function (k, v) { return el("div", { class: "el-term" }, [el("b", { text: k }), el("span", { text: v })]); };
    box.setAttribute("aria-label", title);
    box.replaceChildren(el("p", { class: "vu-ltag", text: "Kurz erklärt" }), el("h2", { class: "vu-mt", text: title }),
      el("p", { class: "el-sheet-p", text: "Nach Elliott laufen Kurse in Wellen: ein Impuls in 5 Schritten (3 nach vorn, 2 zurück), danach eine Korrektur in 3 Teilen (A, B, C)." }), frag(svg), el("p", { class: "vu-mu vu-xs", text: "Schema, keine echten Kurse." }),
      term("Impuls", "Fünf Wellen in Trendrichtung. Welle 3 ist nach der Lehre meist die längste."), term("Korrektur", "Drei Teile gegen den Trend: Zickzack, flache Korrektur, Dreieck oder Kombinationen."),
      term("Warum Zählungen oft wechseln", "Dieselben Kurse lassen sich oft auf mehrere Arten zählen. Die Engine zählt nur, wenn der Chart sauber verläuft, und nennt die Gefahr einer Neuzählung."),
      term("Ungültig unter …", "Schließt die Woche jenseits dieser Grenze, stimmt die Zählung nicht mehr."),
      frag(U.help("Eine Lesart ist keine Wahrscheinlichkeit, keine Prognose und kein Kursziel.")),
      el("p", { class: "vu-xs" }, [el("a", { href: "/quant/#/methodik", text: "Methodik ansehen" })]),
      el("button", { class: "vu-btn vu-btn--block", type: "button", text: "Verstanden", onclick: function () { U.closeSheet(node); } }));
    U.openSheet(node);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
