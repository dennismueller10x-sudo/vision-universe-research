/* =========================================================================
   VISION UNIVERSE QUANT — ui/pages-k2.js
   Kopfkachel und „Weiter“-Karte der eigenständigen Quant-Seiten (Marktdaten, Fundamentaldaten-Inspektor)
   nach App-Konzept 2 (Owner-Freigabe 14.11.2026). Nur Darstellung: keine Daten, keine Rechnung.

   Wie quant/ui/shell.js setzt diese Datei ausschließlich Text und Knoten (kein innerHTML). Der Erklärsatz der
   Seite steht einen Tipp entfernt im Fenster (VUUI.popup); fehlt der Baustein (ältere vu-ui.js im Cache), bleibt
   er wie bisher unter der Überschrift stehen.
   ========================================================================= */
(function (global) {
  "use strict";
  var Q = global.QuantShell, el = Q.el, doc = global.document, NS = "http://www.w3.org/2000/svg";
  function U() { return global.VUUI || null; }
  function icon(d, size) {
    var svg = doc.createElementNS(NS, "svg"), path = doc.createElementNS(NS, "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2.2"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", d); svg.appendChild(path);
    return svg;
  }
  /** o: kicker, title, lead, backHref, backLabel, extra [Knoten in der Kachel, z. B. die Herkunftsleiste]. */
  function head(o) {
    var u = U(), lead = el("p", { class: "q-lead", text: o.lead });
    var top = [el("a", { class: "qp-round", href: o.backHref || Q.BASE + "#/", "aria-label": o.backLabel || "Zurück zu Quant" }, [icon("M15 5l-7 7 7 7", 18)]),
      el("p", { class: "q-kicker", text: o.kicker })];
    if (u && u.popup) {
      lead.hidden = true;
      top.push(el("button", { type: "button", class: "qp-round", "aria-haspopup": "dialog", "aria-label": "Was diese Seite zeigt", text: "i",
        onclick: function () {
          var body = el("p", { class: "vu-lead", style: "margin:0", text: o.lead }), sheet = u.popup({ id: "qp-info", title: o.title, body: body });
          if (sheet) sheet.classList.add("vu-ui");
        } }));
    }
    return el("header", { class: "qp-head" }, [el("div", { class: "qp-head-top" }, top), el("h1", { class: "q-h1", text: o.title }), lead].concat(o.extra || []));
  }
  /** „Weiter“-Karte am Seitenende (Aufbau wie VUUI.next). o: title, sub, href. */
  function next(o) {
    return el("div", { class: "vu-ui qp-next" }, [el("a", { class: "vu-next", href: o.href }, [
      el("span", { class: "vu-next__t" }, [el("span", { class: "vu-ltag", text: "Weiter" }), el("b", { text: o.title }), o.sub ? el("span", { text: o.sub }) : null]),
      el("i", { "aria-hidden": "true" }, [icon("M9 5l7 7-7 7", 20)])
    ])]);
  }
  global.QuantPageK2 = { head: head, next: next };
})(window);
