/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/content-hash.js

   DER INHALTSABDRUCK, REPOSITORY-SEITE

   -------------------------------------------------------------------------
   WARUM ES DIESE DATEI ZWEIMAL GIBT
   -------------------------------------------------------------------------

   Dieselbe Rechnung steht in workers/vision-universe-social/src/redact.js.
   Das ist keine Nachlaessigkeit: der Worker laeuft bei Cloudflare und
   kann nichts aus diesem Repository laden. Eine geteilte Datei gaebe es
   nur um den Preis eines Build-Schritts, den dieses Projekt bewusst
   nicht hat.

   Zwei Implementierungen derselben Frage sind die klassische Einladung,
   dass sie auseinanderlaufen — und hier waere die Folge besonders
   unangenehm: eine Freigabe, die der Worker ablehnt, obwohl sich nichts
   geaendert hat, oder schlimmer, eine, die er annimmt, obwohl sich etwas
   geaendert hat.

   Deshalb sind sie GEGENEINANDER getestet (CH5). Der Test ruft beide
   Funktionen mit denselben Eingaben auf und vergleicht die Ergebnisse.
   Er ist die eigentliche Verbindung zwischen den Dateien.

   -------------------------------------------------------------------------
   WAS HINEINGEHT
   -------------------------------------------------------------------------

   Genau die drei Dinge, die oeffentlich werden: Inhaltsobjekt, Bild,
   Text. Nichts sonst. Was nicht oeffentlich wird, darf den Abdruck nicht
   aendern — sonst waere eine Freigabe schon dadurch ungueltig, dass
   jemand sie erneut aufschreibt.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var nodeCrypto = isNode ? require("crypto") : null;

  /** Die kanonische Form. Feste Reihenfolge, nicht sortiert. */
  function canonical(spec) {
    return JSON.stringify({
      contentId: String((spec && spec.contentId) || ""),
      imageUrl: String((spec && spec.imageUrl) || ""),
      caption: String(spec && spec.caption !== undefined && spec.caption !== null
        ? spec.caption : "")
    });
  }

  /** SHA-256 in Hex. Synchron, weil dieses Repository Node voraussetzt. */
  function contentHash(spec) {
    if (!nodeCrypto) throw new Error("VUSocialContentHash: nur unter Node.");
    return nodeCrypto.createHash("sha256").update(canonical(spec), "utf8").digest("hex");
  }

  var api = { canonical: canonical, contentHash: contentHash };

  if (isNode) module.exports = api;
  else global.VUSocialContentHash = api;
})(typeof window !== "undefined" ? window : globalThis);
