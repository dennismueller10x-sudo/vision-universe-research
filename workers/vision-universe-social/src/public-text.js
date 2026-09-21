/* =========================================================================
   VISION UNIVERSE SOCIAL — workers/.../public-text.js

   DER TEXT, DER OEFFENTLICH WIRD — ZUSAMMENGESETZT AUS SEINEN TEILEN

   -------------------------------------------------------------------------
   WOZU DIESE DATEI UEBERHAUPT EXISTIERT
   -------------------------------------------------------------------------

   Der Owner soll Caption und Hashtags GETRENNT lesen koennen. Gesendet
   wird trotzdem genau ein Feld: `payload.caption`. Beides gleichzeitig
   zu zeigen heisst, eine Behauptung aufzustellen —

     FINAL_PUBLIC_TEXT = CAPTION + Leerzeile + HASHTAGS

   — und eine Behauptung, die niemand nachrechnet, ist eine Erzaehlung.
   Genau hier lag schon einmal ein Fehler dieser Familie: eine Vorschau,
   die etwas anderes zeigte als das, was hinausging.

   Diese Datei rechnet die Zusammensetzung nach. Kommt dabei nicht
   `payload.caption` heraus, wird die Uebertragung abgewiesen (§17).

   -------------------------------------------------------------------------
   WARUM DIE REGEL HIER EIN ZWEITES MAL STEHT
   -------------------------------------------------------------------------

   Weil der Worker die Node-Engine nicht importieren kann. Dieselbe Lage
   wie bei contentHash: dort steht die Rechnung ebenfalls zweimal, und
   ein Test vergleicht beide Seiten an echten Faellen gegeneinander
   (content-hash.test.mjs). Genau das passiert hier auch — sonst waere
   das hier eine zweite Regel statt einer zweiten Ausfuehrung derselben.

   Diese Datei setzt NICHTS zusammen, was gesendet wird. Sie prueft nur
   nach. Zusammengesetzt wird einmal, in social/engines/hashtags.js, vor
   der Freigabe.
   ========================================================================= */

export const MAX_HASHTAGS = 5;

function text(v) { return v === undefined || v === null ? "" : String(v); }

/**
 * Die Tagliste normalisiert: fuehrende Rauten weg, leere raus, eine
 * Raute wieder davor. Spiegelt hashtags.js.
 */
export function tagListe(hashtags) {
  return (Array.isArray(hashtags) ? hashtags : [])
    .map((t) => text(t).replace(/^#+/, "").trim())
    .filter((t) => t.length)
    .map((t) => "#" + t);
}

/**
 * CAPTION + Leerzeile + HASHTAGS — deterministisch, ohne Zufall und
 * ohne Ausnahme (§17).
 */
export function finalerText(captionBase, hashtags) {
  const c = text(captionBase).trim();
  const tags = tagListe(hashtags);
  if (!tags.length) return c;
  if (!c) return tags.join(" ");
  return c + "\n\n" + tags.join(" ");
}
