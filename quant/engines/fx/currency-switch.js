/* =========================================================================
   VISION UNIVERSE — fx/currency-switch.js   (Currency Layer, Aktivierung)

   DER UMSCHALTER. EINMAL GEBAUT, VON ALLEN PRODUKTEN BENUTZT.

   Ein EUR|USD-Schalter ist verfuehrerisch klein: zwei Knoepfe, ein
   Zustand. Genau deshalb wuerde ihn jedes Produkt selbst bauen - und
   dann haette Discover einen, der Screener einen zweiten, und die beiden
   wuessten nichts voneinander. Ein Nutzer, der in Discover auf USD
   stellt und im Screener weiterliest, saehe wieder Euro.

   Deshalb wohnt er hier, neben dem Vertrag, dessen Zustand er bedient.
   Er hat keine eigene Meinung ueber die Anzeigewaehrung: er liest sie
   aus `layer.preference` und schreibt sie dorthin zurueck. Das Merken
   ueber Seitenwechsel hinweg macht ebenfalls der Vertrag.

   WAS ER NICHT TUT

   Er rechnet nichts um. Er weiss nicht, welche Werte auf der Seite
   stehen. Er setzt einen Zustand und verlaesst sich darauf, dass die
   Flaechen auf `vu-currency-change` hoeren - genau die Trennung, die
   ONE DATA CORE meint.

   DARSTELLUNG

   Die Stile kommen einmal aus dieser Datei und benutzen die
   Farbvariablen der Seite, wo es sie gibt (`--discover-*`), sonst
   neutrale Werte. So passt der Schalter in Discover, ohne dass Discover
   etwas ueber ihn wissen muss.
   ========================================================================= */
(function (global) {
  "use strict";

  var VUFx = global.VUFx = global.VUFx || {};
  var VERSION = "fx-currency-switch-1.0.0";
  var STYLE_ID = "vu-fx-switch-style";

  var CSS = [
    '.vu-fx-switch{display:inline-flex;align-items:center;gap:0;border-radius:999px;',
    'border:1px solid var(--discover-line,rgba(128,128,128,.35));overflow:hidden;',
    'font:inherit;line-height:1;background:transparent}',
    '.vu-fx-switch button{font:inherit;font-size:11.5px;font-weight:600;letter-spacing:.02em;',
    'padding:6px 10px;border:0;background:transparent;cursor:pointer;',
    'color:var(--discover-muted,#777);transition:background .15s ease,color .15s ease}',
    '.vu-fx-switch button:hover{color:var(--discover-text,#111)}',
    '.vu-fx-switch button[aria-pressed="true"]{background:var(--discover-text,#111);',
    'color:var(--discover-on-text,#fff)}',
    '.vu-fx-switch button:focus-visible{outline:2px solid var(--discover-text,#111);outline-offset:-2px}',
    '.vu-fx-switch[data-busy="true"]{opacity:.55;pointer-events:none}',
    '@media (max-width:860px){.vu-fx-switch button{padding:5px 8px;font-size:11px}}'
  ].join("");

  function ensureStyle(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  /**
   * Baut den Schalter fuer einen Vertrag.
   *
   * @param {object} opts.layer         der Currency Contract (Pflicht)
   * @param {string[]} [opts.currencies] welche zur Wahl stehen
   * @param {Document} [opts.document]
   * @param {function} [opts.onChange]  zusaetzlich zum Vertragsereignis
   * @returns {HTMLElement|null}
   */
  function create(opts) {
    opts = opts || {};
    var layer = opts.layer || VUFx.layer;
    if (!layer || !layer.preference) return null;

    var doc = opts.document || global.document;
    if (!doc) return null;
    ensureStyle(doc);

    var codes = opts.currencies ||
      (VUFx.Registry && VUFx.Registry.DISPLAY_CURRENCIES) || ["EUR", "USD"];

    var host = doc.createElement("div");
    host.className = "vu-fx-switch";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Anzeigewaehrung");

    var knoepfe = codes.map(function (code) {
      var b = doc.createElement("button");
      b.type = "button";
      b.textContent = code;
      b.setAttribute("data-currency", code);
      b.addEventListener("click", function () {
        if (layer.preference.get() === code) return;
        /* Die Kurse der Zielwaehrung koennen fehlen. Dann wird NICHT
           umgeschaltet und so getan, als waere etwas passiert - der
           Schalter bleibt stehen, und die Flaechen behalten ihre
           ehrliche Anzeige. */
        var warten = (VUFx.Bootstrap && code !== "EUR")
          ? VUFx.Bootstrap.ensureCurrency(code)
          : Promise.resolve(true);
        host.setAttribute("data-busy", "true");
        warten.then(function () {
          host.removeAttribute("data-busy");
          layer.setDisplayCurrency(code);
          if (typeof opts.onChange === "function") opts.onChange(code);
        }, function () {
          host.removeAttribute("data-busy");
        });
      });
      host.appendChild(b);
      return b;
    });

    function malen() {
      var aktuell = layer.preference.get();
      knoepfe.forEach(function (b) {
        var an = b.getAttribute("data-currency") === aktuell;
        b.setAttribute("aria-pressed", an ? "true" : "false");
        b.setAttribute("aria-label", b.getAttribute("data-currency") +
          (an ? " - aktuell angezeigt" : " - anzeigen"));
      });
      host.title = "Anzeigewaehrung: " + aktuell;
    }

    layer.onDisplayCurrencyChange(malen);
    malen();
    return host;
  }

  /** Haengt den Schalter in einen Container, wenn es ihn gibt. */
  function mount(container, opts) {
    if (!container) return null;
    var node = create(opts);
    if (node) container.appendChild(node);
    return node;
  }

  VUFx.Switch = { VERSION: VERSION, create: create, mount: mount };

  if (typeof module !== "undefined" && module.exports) module.exports = VUFx.Switch;
})(typeof window !== "undefined" ? window : globalThis);
