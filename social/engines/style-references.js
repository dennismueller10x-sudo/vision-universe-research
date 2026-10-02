/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/style-references.js

   DIE REFERENZBILDER DES OWNERS: GELIEFERT UND GESEHEN — GEMESSEN
   (Owner-Direktive "OWNER CREATIVE DIRECTION", 30.09., §13)

   Vier Vision-Universe-Beispiele definieren die visuelle Zielrichtung.
   Sie liegen als echte Dateien im Repository und damit im selben
   Checkout, in dem ChatGPT Work den Brief liest - wie Logo und Atlas.

   Zwei Fragen, zwei Messungen, keine Behauptung:

   1. GELIEFERT (REFERENCE_IMAGES_DELIVERED_TO_WORK): liegt jede Datei
      mit genau dem Inhalt im Checkout, aus dem der Brief-Commit
      entsteht? Gemessen per SHA-256 gegen das Manifest.

   2. GESEHEN (REFERENCE_IMAGES_SEEN_BY_WORK): hat Work die Bilder
      wirklich angesehen? Work nennt je Referenz die dominanten
      Textzeilen wortwoertlich. Verglichen wird gegen Hashes von
      Markerwoertern, die nur im Bild stehen - im Checkout liegt kein
      Klartext, den Work statt des Bildes ablesen koennte.

   Die Referenzen sind Stilreferenz, keine Faktenquelle und kein
   Themenvorschlag. Das steht im Brief; hier wird nur gemessen.
   ========================================================================= */
"use strict";

const crypto = require("crypto");

const MANIFEST = "social/brand/style-references/manifest.json";
const SALZ = "vu-style-ref:";

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Grossbuchstaben, Umlaute ausgeschrieben, in Woerter zerlegt. */
function woerter(text) {
  return String(text || "").toUpperCase()
    .replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
    .split(/[^A-Z0-9]+/).filter(Boolean);
}

/** Der Hash eines Markerworts, so wie er im Manifest steht. */
function markerHash(wort) {
  return sha256(SALZ + woerter(wort).join(""));
}

/**
 * GELIEFERT: liegt jede Referenz unveraendert vor?
 * @param manifest   das geparste Manifest
 * @param leseDatei  (pfad) => Buffer | null
 */
function lieferbefund(manifest, leseDatei) {
  const dateien = (manifest && manifest.files) || [];
  const einzeln = dateien.map((f) => {
    let bytes = null;
    try { bytes = leseDatei(f.path); } catch { bytes = null; }
    const ok = !!bytes && sha256(bytes) === f.sha256;
    return { path: f.path, present: !!bytes, sha256Match: ok };
  });
  const alle = einzeln.length > 0 && einzeln.every((e) => e.sha256Match);
  return {
    delivered: alle,
    count: einzeln.filter((e) => e.sha256Match).length,
    total: einzeln.length,
    files: einzeln,
    satz: alle
      ? einzeln.length + " Referenzbilder liegen unveraendert im Checkout des Briefs."
      : "Nicht alle Referenzbilder liegen unveraendert vor (" +
        einzeln.filter((e) => e.sha256Match).length + " von " + einzeln.length + ")."
  };
}

/**
 * GESEHEN: passen die von Work genannten Textzeilen zu den Bildern?
 * @param check  result.style_references_check - [{ path, dominant_text }]
 */
function sichtung(check, manifest) {
  const dateien = (manifest && manifest.files) || [];
  const gemeldet = Array.isArray(check) ? check : [];
  if (!gemeldet.length) {
    return { measured: false, seen: 0, total: dateien.length, files: [],
      satz: "Work hat keine style_references_check gemeldet - Sichtung nicht messbar." };
  }
  const einzeln = dateien.map((f) => {
    const eintrag = gemeldet.find((g) => g && String(g.path || "").endsWith(f.path.split("/").pop()));
    const hashes = new Set(woerter(eintrag && eintrag.dominant_text).map((w) => sha256(SALZ + w)));
    const treffer = (f.marker_sha256 || []).some((h) => hashes.has(h));
    return { path: f.path, reported: !!eintrag, matched: treffer };
  });
  const gesehen = einzeln.filter((e) => e.matched).length;
  return {
    measured: true, seen: gesehen, total: dateien.length, files: einzeln,
    satz: gesehen === dateien.length
      ? "Work nennt fuer alle " + gesehen + " Referenzen Text, der nur im Bild steht - gesehen."
      : "Work nennt fuer " + gesehen + " von " + dateien.length + " Referenzen passenden Bildtext."
  };
}

module.exports = { MANIFEST, woerter, markerHash, lieferbefund, sichtung, sha256 };
