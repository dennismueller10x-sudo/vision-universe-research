/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/rss-parse.js

   MINIMALER RSS-2.0-PARSER, OHNE ABHAENGIGKEIT

   Dieses Repository installiert keine npm-Pakete (package.json traegt
   keine dependencies) — ein XML-DOM-Parser waere die erste. Real-World-
   RSS-Feeds sind fast ausnahmslos flaches RSS 2.0 (<item><title>...
   </title>...</item>), deshalb reicht ein toleranter, regexbasierter
   Ausschnitt: <item>-Bloecke, darin title/link/description/pubDate,
   CDATA und die gaengigsten HTML-Entities aufgeloest.

   Kein DOM, kein Namespace-Handling, keine Atom-<entry>-Unterstuetzung
   (bewusst — die Quellenliste besteht aus RSS-2.0-Feeds; ein Feed, der
   nicht passt, liefert einfach 0 Items und wird von der aufrufenden
   Seite uebersprungen, nie als Fehler behandelt).
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);

  var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

  function entkodieren(s) {
    if (!s) return "";
    return String(s)
      .replace(/&#x([0-9a-f]+);/gi, function (m, hex) {
        return String.fromCodePoint(parseInt(hex, 16));
      })
      .replace(/&#(\d+);/g, function (m, dez) {
        return String.fromCodePoint(parseInt(dez, 10));
      })
      .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, function (m, name) { return ENTITIES[name]; });
  }

  /* Verschachtelte Tags (CDATA traegt oft eigenes Inline-HTML wie <b>/<a>,
     und ein nicht-CDATA-Feld kann media:content o.ae. enthalten) werden
     in BEIDEN Faellen entfernt — reiner Text reicht fuer title/description. */
  function reinerText(roh) {
    return entkodieren(roh.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  }

  function feldWert(block, tag) {
    var cdataRe = new RegExp("<" + tag + "[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</" + tag + ">", "i");
    var treffer = block.match(cdataRe);
    if (treffer) return reinerText(treffer[1]);

    var einfachRe = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
    treffer = block.match(einfachRe);
    if (!treffer) return null;
    return reinerText(treffer[1]);
  }

  /** Parst RSS-2.0-XML in eine flache Liste von Items. Wirft nie - ein
      nicht lesbares Dokument liefert eine leere Liste. */
  function parseRss(xml, quelle) {
    if (!xml || typeof xml !== "string") return [];
    var bloecke = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    var out = [];
    bloecke.forEach(function (block) {
      var titel = feldWert(block, "title");
      var link = feldWert(block, "link") || feldWert(block, "guid");
      var beschreibung = feldWert(block, "description") || feldWert(block, "summary");
      var datum = feldWert(block, "pubDate") || feldWert(block, "dc:date") ||
        feldWert(block, "published");
      if (!titel) return;
      out.push({
        title: titel,
        link: link || null,
        description: beschreibung || "",
        pubDate: datum || null,
        source: quelle || null
      });
    });
    return out;
  }

  var api = { parseRss: parseRss, entkodieren: entkodieren };
  if (isNode) module.exports = api;
  else global.VUSocialRssParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
