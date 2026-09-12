/* =========================================================================
   VISION UNIVERSE DISCOVER — ui/search.js

   Die Suche als Flaeche, nicht als Dropdown.

   Sie oeffnet sich ueber die Seite, nimmt den Fokus, zeigt Treffer mit
   Verlaufsbild und Kennzahl und schliesst mit Escape. Tastaturbedienung
   ist kein Zusatz: Pfeiltasten waehlen, Enter oeffnet - wer einen Ticker
   tippt, will ihn nicht anschliessend mit der Maus suchen.

   Gesucht wird im Suchindex des gerade gewaehlten Universums
   (discover/data/search/<UNIVERSE>.json) - eine Datei, ein Abruf, danach
   im Speicher.
   ========================================================================= */
(function (global) {
  "use strict";

  var S = global.QuantShell;
  var D = global.VUDiscover;
  var el = S.el;

  function isNum(v) { return typeof v === "number" && Number.isFinite(v); }
  function C() { return D.Cards; }
  function K() { return D.Klartext; }

  function create(options) {
    options = options || {};
    var indexCache = Object.create(null);
    var aktiv = -1;
    var treffer = [];

    var input = el("input", { type: "search", placeholder: "Unternehmen oder Ticker …",
                              "aria-label": "Aktien suchen", autocomplete: "off",
                              spellcheck: "false" });
    var results = el("div", { class: "dx-results", role: "listbox",
                              "aria-label": "Suchergebnisse" });
    var hint = el("p", { class: "dx-hint dx-search-hint",
      text: "Tippen zum Suchen · ↑ ↓ zum Auswählen · Enter zum Öffnen · Esc schließt" });
    var close = el("button", { class: "dx-search-close", type: "button", text: "Schließen" });

    var overlay = el("div", { class: "dx-search", role: "dialog", "aria-modal": "true",
                              "aria-label": "Aktien entdecken" }, [
      el("div", { class: "dx-search-inner" }, [
        el("h2", { text: "Aktien entdecken" }),
        el("div", { class: "dx-search-field" }, [input, close]),
        hint,
        results
      ])
    ]);

    function universum() { return options.universeId ? options.universeId() : "US_REAL"; }

    function ladeIndex() {
      var id = universum();
      if (indexCache[id]) return Promise.resolve(indexCache[id]);
      return S.loadJSON("/discover/data/search/" + id + ".json").then(function (index) {
        indexCache[id] = index;
        return index;
      });
    }

    function suchen() {
      var q = input.value.trim().toUpperCase();
      aktiv = -1;
      if (!q) {
        S.clear(results);
        treffer = [];
        hint.textContent = "Tippen zum Suchen · ↑ ↓ zum Auswählen · Enter zum Öffnen · Esc schließt";
        return;
      }
      ladeIndex().then(function (index) {
        /* Reihenfolge mit Absicht: ein exakter Ticker zuerst, dann Ticker,
           die so beginnen, dann Namenstreffer. Wer "NVDA" tippt, meint
           nicht "NVR". */
        var exakt = [], beginnt = [], enthaelt = [];
        index.entries.forEach(function (e) {
          var name = (e.n || "").toUpperCase();
          if (e.s === q) exakt.push(e);
          else if (e.s.indexOf(q) === 0) beginnt.push(e);
          else if (name.indexOf(q) !== -1 || e.s.indexOf(q) !== -1) enthaelt.push(e);
        });
        treffer = exakt.concat(beginnt, enthaelt).slice(0, 14);
        zeichnen(index);
      }).catch(function () {
        S.clear(results);
        results.appendChild(el("div", { class: "dx-empty" }, [
          el("b", { text: "Suchindex nicht ladbar" }),
          document.createTextNode("Der Suchindex dieses Universums konnte nicht geladen werden.")
        ]));
      });
    }

    function zeichnen(index) {
      S.clear(results);
      if (!treffer.length) {
        hint.textContent = "Kein Titel in »" + index.universeLabel + "« passt zu „" + input.value + "“.";
        return;
      }
      hint.textContent = treffer.length + " Treffer in »" + index.universeLabel + "«";
      treffer.forEach(function (hit, i) {
        /* Ein Treffer traegt dieselbe Farbwelt wie die Reihe, in der er
           stuende - und dasselbe Gestaltungsmittel: das Kuerzel gross im
           Hintergrund. Die Suche ist damit kein Verzeichnis mehr, sondern
           derselbe Ort in schmal. */
        var knopf = el("button", { class: "dx-result", type: "button", role: "option",
                                   "aria-selected": "false", "data-world": hit.w || null }, [
          el("span", { class: "dx-result-mark", "aria-hidden": "true", text: hit.s }),
          /* Zuerst die Firma, dann das Kuerzel - dieselbe Reihenfolge wie
             auf der Karte. Wer sucht, tippt "energ" und erwartet
             Firmennamen, keine Kuerzelliste. */
          el("span", { class: "nm" }, [
            document.createTextNode(hit.n || hit.s),
            el("em", { text: [hit.s, hit.sec, hit.m ? null : "Modelltitel",
                              hit.h ? "am Jahreshoch" : null].filter(Boolean).join(" · ") })
          ]),
          miniPfad(hit),
          /* Die Zwoelfmonatsrendite statt des Scores. */
          el("span", { class: "val num " + (isNum(hit.r) ? (hit.r > 0 ? "up" : (hit.r < 0 ? "down" : "")) : ""),
                       text: isNum(hit.r) ? K().prozent(hit.r) : "" })
        ]);
        knopf.addEventListener("click", function () { oeffnen(i); });
        knopf.addEventListener("mousemove", function () { markieren(i); });
        results.appendChild(knopf);
      });
    }

    /* Ein winziger Verlauf je Treffer: der Abstand zum Jahreshoch als
       Position in der Spanne. Mehr traegt eine Zeile nicht, und mehr wird
       fuer diese Titel auch nicht ausgeliefert. */
    function miniPfad(hit) {
      var node = C().svg("svg", { viewBox: "0 0 96 30", preserveAspectRatio: "none",
                                  class: "dx-spark", role: "img",
                                  "aria-label": isNum(hit.d)
                                    ? "Abstand zum 52-Wochen-Hoch " + Math.round(hit.d * 1000) / 10 + " Prozent"
                                    : "kein Abstand ausgeliefert" });
      if (!isNum(hit.d)) return node;
      var anteil = Math.max(0, Math.min(1, 1 + hit.d / 0.5));   // -50 % .. 0 %
      node.appendChild(C().svg("line", { class: "grid", x1: 0, x2: 96, y1: 22, y2: 22 }));
      /* Der Balken traegt die Weltfarbe, der Punkt markiert den Stand.
         Ein Titel am Jahreshoch bekommt zusaetzlich einen Ring - die
         Unterscheidung haengt damit nicht an der Farbe allein, und im
         Text der Zeile steht sie ohnehin. */
      node.appendChild(C().svg("rect", { x: 0, y: 20, width: (anteil * 96).toFixed(1), height: 4,
                                         rx: 2, fill: "var(--w)",
                                         "fill-opacity": hit.h ? "0.95" : "0.55" }));
      node.appendChild(C().svg("circle", { cx: (anteil * 96).toFixed(1), cy: 22, r: hit.h ? 4 : 3.4,
                                           fill: "var(--w)",
                                           stroke: hit.h ? "var(--w)" : "none",
                                           "stroke-opacity": "0.35", "stroke-width": hit.h ? 4 : 0 }));
      return node;
    }

    function markieren(i) {
      aktiv = i;
      Array.prototype.forEach.call(results.children, function (node, index) {
        node.setAttribute("aria-selected", String(index === aktiv));
      });
    }

    function oeffnen(i) {
      var hit = treffer[i === undefined || i < 0 ? 0 : i];
      if (!hit) return;
      schliessen();
      location.hash = "#/s/" + universum() + "/" + hit.s;
    }

    function oeffnenOverlay() {
      overlay.classList.add("on");
      document.body.style.overflow = "hidden";
      input.value = "";
      S.clear(results);
      treffer = [];
      global.setTimeout(function () { input.focus(); }, 60);
    }

    function schliessen() {
      overlay.classList.remove("on");
      document.body.style.overflow = "";
    }

    input.addEventListener("input", suchen);
    close.addEventListener("click", schliessen);
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) schliessen();
    });
    overlay.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); schliessen(); return; }
      if (event.key === "ArrowDown") { event.preventDefault(); markieren(Math.min(treffer.length - 1, aktiv + 1)); }
      else if (event.key === "ArrowUp") { event.preventDefault(); markieren(Math.max(0, aktiv - 1)); }
      else if (event.key === "Enter") { event.preventDefault(); oeffnen(aktiv); }
      var gewaehlt = results.children[aktiv];
      if (gewaehlt && gewaehlt.scrollIntoView) gewaehlt.scrollIntoView({ block: "nearest" });
    });

    /* Tastaturzugang von ueberall. "/" ist die Konvention fuer Suche; sie
       darf nur nicht zuschlagen, waehrend jemand in ein Feld tippt. */
    document.addEventListener("keydown", function (event) {
      var imFeld = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || "");
      if (event.key === "/" && !imFeld && !overlay.classList.contains("on")) {
        event.preventDefault();
        oeffnenOverlay();
      }
    });

    return { node: overlay, open: oeffnenOverlay, close: schliessen };
  }

  global.VUDiscover = global.VUDiscover || {};
  global.VUDiscover.Search = { create: create };
})(window);
