/* =========================================================================
   VISION UNIVERSE — quant/tests/production-isolation.test.mjs

   TESTS SCHREIBEN NICHT IN PRODUKTIONSDATEN

   Die Suite hinterliess bei jedem lokalen Lauf zwei geaenderte Dateien
   unter quant/data/universe/. Ein Kommentar im betroffenen Test
   erklaerte das fuer unvermeidlich - "der Emittentenbau schreibt in die
   ECHTE Ablage". Das stimmte nicht: der Bau kennt --out seit jeher.
   Uebergeben hat es nur niemand, weil --out zugleich den EINGANG
   verschob und der Lauf dann abbrach.

   Ein Kommentar, der einen Defekt zur Eigenschaft erklaert, ist teurer
   als der Defekt: er beendet die Suche.

   Dieser Test ist die Regression dafuer. Er prueft nicht einen
   einzelnen Schreibzugriff, sondern die EIGENSCHAFT - damit die naechste
   Datei, die denselben Fehler macht, hier auffaellt und nicht erst im
   Arbeitsbaum von jemandem.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Was git als geaendert meldet - die einzige Quelle, die zaehlt. */
function geaendert() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: root })
    .toString().split("\n")
    .map((z) => z.slice(3).trim())
    .filter(Boolean);
}

/* Pfade, die ein Testlauf niemals veraendern darf. Owner-Zustaende,
   Lernstand und Marktdaten gehoeren dem Betrieb, nicht der Pruefung. */
const UNANTASTBAR = [
  /^quant\/data\//,
  /^social\/data\//,
  /^discover\/data\//,
  /^authoring\/requests\/[^/]+\/authoring-result\.json$/
];

test("PI1 · Der Emittentenbau trennt Lesepfad und Schreibpfad", () => {
  /* Ein Schalter, dessen Benutzung den Lauf zerstoert, wird nicht
     benutzt - und der Defekt, den er verhindern sollte, bleibt. */
  const quelle = execFileSync("cat",
    [join(root, "scripts/universe/build-issuer-master.mjs")]).toString();
  assert.match(quelle, /const IN_ROOT\s*=.*--in/,
    "Der Lesepfad braucht einen eigenen Schalter.");
  assert.match(quelle, /const INSTRUMENT_DIR = join\(IN_ROOT/,
    "Der Company Master wird aus dem EINGANG gelesen, nicht aus dem Ausgang.");
  assert.match(quelle, /const ISSUER_DIR = join\(OUT_ROOT/,
    "Geschrieben wird in den AUSGANG.");
});

test("PI2 · Nach dieser Suite ist kein Produktionsartefakt veraendert", () => {
  /* Gemessen, nicht zugesichert. Der Test laeuft als Teil der Suite und
     sieht damit alles, was vor ihm lief. */
  const dreckig = geaendert().filter((p) =>
    UNANTASTBAR.some((r) => r.test(p)));
  assert.deepEqual(dreckig, [],
    "Diese Pfade gehoeren dem Betrieb und wurden von einem Testlauf " +
    "veraendert:\n  " + dreckig.join("\n  "));
});
