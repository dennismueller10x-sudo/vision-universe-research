/* =========================================================================
   VISION UNIVERSE — scripts/quality/out-path.mjs

   EIN ABSOLUTER PFAD IST EINE ANSAGE, KEIN VORSCHLAG

   -------------------------------------------------------------------------
   DER BEFUND
   -------------------------------------------------------------------------

   `join("/home/user/vision-universe-research", "/tmp/lauf")` ergibt
   "/home/user/vision-universe-research/tmp/lauf". Node's `join` kennt
   keine absoluten Pfade im zweiten Argument - es klebt sie an.

   Jedes Skript hier hat dieselbe Zeile: `join(ROOT, OUT)`. Wer einen
   Lauf ausserhalb des Baums ablegen wollte, hat also hineingeschrieben
   - in denselben Ordner, dessen Unversehrtheit die Isolationspruefung
   beweisen soll. Der Fehler faellt nicht auf, weil er funktioniert:
   die Dateien landen irgendwo, nur nicht dort.

   -------------------------------------------------------------------------
   WARUM EINE GEMEINSAME STELLE
   -------------------------------------------------------------------------

   Neun Skripte mit derselben Zeile sind neun Gelegenheiten, die
   Korrektur beim zehnten zu vergessen. Zwei Rechenwege fuer dieselbe
   Frage sind zwei Wahrheiten, von denen eine irgendwann falsch wird -
   und diese hier war schon falsch.
   ========================================================================= */
import { isAbsolute, join } from "node:path";

/**
 * Der Zielordner eines Laufs.
 *
 * Ein relativer Pfad gilt gegen die Wurzel des Repositories - so war
 * es gemeint und so bleibt es. Ein absoluter Pfad gilt, wie er
 * dasteht.
 */
export function ausgabePfad(root, angabe) {
  if (angabe === null || angabe === undefined || angabe === "") return null;
  const p = String(angabe);
  return isAbsolute(p) ? p : join(root, p);
}
