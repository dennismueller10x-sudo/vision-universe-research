/* =========================================================================
   VISION UNIVERSE QUANT — app/page-ranking.js
   Rangliste des Gesamtwerts (Quant -> Aktien -> Rangliste, #/aktien/rangliste)

   Liest profile-mean/ranking.json.gz (Erzeuger: scripts/quant/build-factor-evidence.mjs,
   Methode vu-profile-mean-1.0.0). Nichts wird im Browser berechnet: Gesamtwert, Anzahl
   und Platz kommen fertig aus dem Artefakt; die Seite sortiert und filtert nur.
   Wortwahl nach docs/legal/WORTWAHL.md: Reihenfolge nach Regel, kein "beste Aktien".
   ========================================================================= */
(function (global) {
  "use strict";
  var X = global.QX, el = X.el;
  /* SIC-Abteilungen (Standard Industrial Classification), nicht GICS. */
  var DIVISION = { A: "Land- und Forstwirtschaft, Fischerei", B: "Bergbau", C: "Baugewerbe", D: "Verarbeitendes Gewerbe", E: "Transport, Kommunikation, Versorger",
    F: "Großhandel", G: "Einzelhandel", H: "Finanzen, Versicherung, Immobilien", I: "Dienstleistungen", J: "Öffentliche Verwaltung" };
  var COLS = [["mean", "Gesamtwert"], ["profitability", "Verdient gut"], ["growth", "Ist gewachsen"], ["quality", "Gewinn gedeckt & stabil"],
    ["momentum", "Kurs lief gut"], ["value", "Preis im Branchenvergleich"], ["risk", "Ruhig für die Branche"]];
  var PAGE = 100;
  var SENTENCE = "Durchschnitt der Profilwerte. Rückwärts geprüft: Aktien mit hohem Gesamtwert lagen früher nicht besser als der Markt – er beschreibt das Profil, er sagt nichts über künftige Kurse.";

  function num(v) { return typeof v === "number" ? String(Math.round(v)) : "–"; }

  async function render(main, ctx) {
    main.append(el("a", { class: "v2-back qx-back", href: "#/aktien", text: "← Aktien" }),
      el("span", { class: "v2-eyebrow", text: "Quant · Aktien" }),
      el("h1", { class: "qx-h1", text: "Rangliste nach Gesamtwert" }),
      el("p", { class: "v2-lead qx-lead", text: SENTENCE }));
    var legal = global.VUUI && global.VUUI.legal ? global.VUUI.legal("ranking") : "";
    if (legal) { var box = el("div", {}); box.innerHTML = legal; main.append(box); }
    var host = el("div", {}, [X.loading()]); main.append(host);
    var data = await ctx.api.getProfileRanking().catch(function () { return null; });
    host.replaceChildren();
    if (!data || data.state !== "AVAILABLE") {
      host.append(X.notice("Rangliste noch nicht veröffentlicht", "Der Gesamtwert wird mit dem nächsten Lauf der Faktordaten berechnet. Bis dahin steht er weder auf Aktienseiten noch hier."));
      return;
    }
    var state = { sort: "mean", dir: -1, division: "", shown: PAGE };
    var divisions = {}; data.rows.forEach(function (r) { if (r.division) divisions[r.division] = (divisions[r.division] || 0) + 1; });
    var select = el("select", { class: "qx-select", "aria-label": "Branche (Wirtschaftszweig nach SIC) filtern" },
      [el("option", { value: "", text: "Alle Branchen" })].concat(Object.keys(divisions).sort().map(function (d) {
        return el("option", { value: d, text: (DIVISION[d] || d) + " (" + divisions[d].toLocaleString("de-DE") + ")" });
      })));
    var meta = el("p", { class: "qx-small" });
    var tableHost = el("div", {});
    var more = el("div", { class: "qx-actions" });
    host.append(el("div", { class: "qx-actions" }, [el("label", { class: "qx-small" }, ["Branche: ", select])]), meta, tableHost, more,
      el("p", { class: "qx-small", text: "Gesamtwert = einfacher Durchschnitt der vorhandenen Profilwerte (0–100, mindestens " + data.minimumFactors + " von sechs, keine Gewichtung). Die Platzierung zählt alle " +
        data.total.toLocaleString("de-DE") + " Aktien mit Gesamtwert, Stand " + data.asOf + ". Branche = Wirtschaftszweig nach SIC (nicht GICS). Methode " + data.methodologyVersion + ". Keine Anlageempfehlung, keine Prognose." }));

    function draw() {
      var rows = data.rows.filter(function (r) { return !state.division || r.division === state.division; });
      rows.sort(function (a, b) {
        var x = a[state.sort], y = b[state.sort];
        if (x == null && y == null) return a.ticker < b.ticker ? -1 : 1;
        if (x == null) return 1; if (y == null) return -1;
        return (x - y) * state.dir || (a.ticker < b.ticker ? -1 : 1);
      });
      meta.textContent = rows.length.toLocaleString("de-DE") + " Aktien" + (state.division ? " in dieser Branche" : "") + " · sortiert nach " + COLS.filter(function (c) { return c[0] === state.sort; })[0][1] + (state.dir < 0 ? " (hoch zuerst)" : " (niedrig zuerst)");
      var head = [el("th", { text: "Platz" }), el("th", { text: "Aktie" })].concat(COLS.map(function (c) {
        var active = c[0] === state.sort;
        var b = el("button", { type: "button", class: "qx-btn qx-btn-link", "aria-label": "Sortieren nach " + c[1], text: c[1] + (active ? (state.dir < 0 ? " ↓" : " ↑") : "") });
        b.addEventListener("click", function () { if (state.sort === c[0]) state.dir = -state.dir; else { state.sort = c[0]; state.dir = -1; } state.shown = PAGE; draw(); });
        return el("th", { "aria-sort": active ? (state.dir < 0 ? "descending" : "ascending") : "none" }, [b]);
      }));
      var body = rows.slice(0, state.shown).map(function (r) {
        var name = ctx.names && ctx.names[r.ticker];
        return el("tr", {}, [el("td", { class: "num", text: r.place.toLocaleString("de-DE") }),
          el("td", {}, [el("a", { href: X.routes.stock(r.ticker), text: r.ticker }), name ? el("small", { text: " " + name }) : null])]
          .concat(COLS.map(function (c) { return el("td", { class: "num", text: num(r[c[0]]) }); })));
      });
      tableHost.replaceChildren(el("div", { class: "qx-card qx-table-wrap", tabindex: "0", "aria-label": "Rangliste nach Gesamtwert, seitlich scrollbar" },
        [el("table", { class: "qx-table" }, [el("thead", {}, [el("tr", {}, head)]), el("tbody", {}, body)])]));
      more.replaceChildren();
      if (rows.length > state.shown) {
        var btn = el("button", { type: "button", class: "qx-btn", text: "Weitere " + Math.min(PAGE, rows.length - state.shown) + " anzeigen" });
        btn.addEventListener("click", function () { state.shown += PAGE; draw(); });
        more.append(btn);
      }
    }
    select.addEventListener("change", function () { state.division = select.value; state.shown = PAGE; draw(); });
    draw();
  }

  global.QXRanking = { render: render, SENTENCE: SENTENCE, DIVISION: DIVISION };
})(window);
