/**
 * Firmenlogos - das Erkennungszeichen neben dem Namen.
 *
 * Quelle ist allein discover/logos/ (Wikimedia Commons, freie Lizenzen,
 * gebaut von scripts/discover/build-company-logos.mjs). Ein Logo steht nur
 * neben seiner eigenen Aktie und identifiziert sie - es ist keine Aussage,
 * keine Empfehlung und keine Verbindung zum Unternehmen.
 *
 * Wo kein Logo vorliegt, steht der Anfangsbuchstabe des Namens in einer
 * neutralen Flaeche. Erfunden oder nachgezeichnet wird kein Logo.
 *
 * Die Liste laedt einmal im Hintergrund. Was vorher gezeichnet wird, traegt
 * zunaechst den Buchstaben und bekommt sein Logo nach, sobald sie da ist.
 */
(function (global) {
  "use strict";

  var BASE = "/discover/logos/";
  var files = null, credits = null, creditsLaden = null, warten = [];

  function laden() {
    if (!global.fetch) { files = {}; return; }
    global.fetch(BASE + "index.json", { cache: "default" })
      .then(function (r) { return r.ok ? r.json() : { files: {} }; })
      .catch(function () { return { files: {} }; })
      .then(function (data) {
        files = (data && data.files) || {};
        var offen = warten; warten = [];
        offen.forEach(function (fn) { fn(); });
      });
  }

  function initial(name, symbol) {
    var s = String(name || symbol || "").replace(/^the\s+/i, "").trim();
    var m = /[A-Za-z0-9ÄÖÜäöü]/.exec(s);
    return m ? m[0].toUpperCase() : "·";
  }

  function fuellen(node, symbol, sofort) {
    var pfad = files && files[symbol];
    if (!pfad) return;
    /* Das Bild haengt sofort im Knoten (sonst stellt der Browser ein
       "lazy" Bild ausserhalb des Dokuments womoeglich nie zu) und wird erst
       sichtbar, wenn es geladen ist - bis dahin bleibt der Buchstabe. */
    var img = global.document.createElement("img");
    img.alt = "";
    /* Ein ausgeblendetes Logo (onlyLogo) laedt der Browser "lazy" nie. */
    img.loading = sofort ? "eager" : "lazy";
    img.decoding = "async";
    img.addEventListener("load", function () {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) { if (c !== img) node.removeChild(c); });
      node.classList.add("dx-logo--img");
    });
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); });
    img.src = BASE + pfad;
    node.appendChild(img);
  }

  /**
   * @param {string} symbol
   * @param {object} opts {name, size: "sm"|"md"|"lg", onlyLogo: kein Buchstabe}
   * @returns {HTMLElement}
   */
  function mark(symbol, opts) {
    opts = opts || {};
    var node = global.document.createElement("span");
    node.className = "dx-logo dx-logo--" + (opts.size || "md") + (opts.onlyLogo ? " dx-logo--only" : "");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-logo", symbol || "");
    if (!opts.onlyLogo) node.textContent = initial(opts.name, symbol);
    if (files) fuellen(node, symbol, opts.onlyLogo);
    else warten.push(function () { fuellen(node, symbol, opts.onlyLogo); });
    return node;
  }

  /** Urheber und Lizenz fuer die Aktienseite - laedt erst, wenn sie gebraucht werden. */
  function credit(symbol) {
    if (!creditsLaden) {
      creditsLaden = global.fetch
        ? global.fetch(BASE + "credits.json", { cache: "default" })
            .then(function (r) { return r.ok ? r.json() : { credits: {} }; })
            .catch(function () { return { credits: {} }; })
            .then(function (d) { credits = (d && d.credits) || {}; return credits; })
        : Promise.resolve({});
    }
    return creditsLaden.then(function (c) { return c[symbol] || null; });
  }

  /** Zeile "Logo: Urheber · Lizenz · Wikimedia Commons" - leer, solange nichts vorliegt. */
  function creditLine(symbol) {
    var doc = global.document;
    var p = doc.createElement("p");
    p.className = "dx-logo-credit";
    p.hidden = true;
    credit(symbol).then(function (c) {
      if (!c) return;
      function link(text, href) {
        var a = doc.createElement("a");
        a.textContent = text;
        if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; }
        return a;
      }
      p.appendChild(doc.createTextNode("Logo: "));
      if (c.author) p.appendChild(doc.createTextNode(c.author + " · "));
      p.appendChild(c.licenseUrl ? link(c.licenseName, c.licenseUrl) : doc.createTextNode(c.licenseName));
      p.appendChild(doc.createTextNode(" · "));
      p.appendChild(link("Wikimedia Commons", c.page));
      p.appendChild(doc.createTextNode(" · Marke des jeweiligen Inhabers, nur zur Identifizierung"));
      p.hidden = false;
    });
    return p;
  }

  var D = (global.VUDiscover = global.VUDiscover || {});
  D.Logos = { mark: mark, credit: credit, creditLine: creditLine, initial: initial };
  if (global.document) laden();
})(typeof window !== "undefined" ? window : globalThis);
