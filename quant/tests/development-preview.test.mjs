/* =========================================================================
   DIE PLAKETTE "DEVELOPMENT PREVIEW"

   Bis zum 17.09.2026 trug der Kopf jeder Plattformseite sie, und diese
   Datei hat genau das verlangt. Am 18.09.2026 hat der Owner entschieden,
   dass sie aus der GESAMTEN sichtbaren Consumer-Erfahrung verschwindet -
   interne Entwicklungs- und QA-Metadaten bleiben, wo sie sind.

   Die Tests sind deshalb umgedreht, nicht geloescht: dieselbe Stelle,
   dieselbe Strenge, die andere Zusage. Ein geloeschter Test haette
   niemandem mehr etwas garantiert; dieser garantiert das Gegenteil von
   frueher, und zwar ueberpruefbar.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const navigation = readFileSync(join(root, "assets", "site-navigation.js"), "utf8");

test("PREVIEW1 · Die gemeinsame Navigation baut die Plakette nicht mehr", () => {
  assert.doesNotMatch(navigation, />Development Preview<\/span>/);
  assert.doesNotMatch(navigation, /aria-label="Vision Universe — Development Preview"/);
  assert.doesNotMatch(navigation, /class="preview"/);
  /* Und der Vorlesetext des Logos nennt nur noch die Startseite. */
  assert.match(navigation, /aria-label="Vision Universe Startseite"/);
});

test("PREVIEW2 · Kein Rest der Plakette im Stil der Navigation", () => {
  assert.doesNotMatch(navigation, /\.preview\{/);
  assert.doesNotMatch(navigation, /chipBg|chipInk|chipBorder/);
});

test("PREVIEW3 · Keine ausgelieferte Seite zeigt die Kennzeichnung", () => {
  const seiten = [];
  (function gehe(d) {
    for (const e of readdirSync(d)) {
      if (e === ".git" || e === "node_modules") continue;
      const f = join(d, e);
      if (statSync(f).isDirectory()) gehe(f);
      else if (/\.html$/i.test(e)) seiten.push(f);
    }
  })(root);
  assert.ok(seiten.length >= 40, "zu wenige Seiten gefunden: " + seiten.length);
  const treffer = seiten.filter((f) => /Development\s+Preview/i.test(readFileSync(f, "utf8")));
  assert.deepEqual(treffer.map((f) => f.replace(root + "/", "")), []);
});

test("PREVIEW4 · Interne Entwicklungs-Metadaten bleiben ausdruecklich erhalten", () => {
  /* Die Owner-Entscheidung betrifft, was ein Besucher SIEHT. Die
     Konfiguration, die Vorschau-Flaechen und den Realtime-Schalter
     steuert, ist kein Bildschirmtext und bleibt. */
  const pfad = join(root, "quant", "config", "development-preview.json");
  assert.ok(existsSync(pfad), "die interne Konfiguration fehlt");
  const cfg = JSON.parse(readFileSync(pfad, "utf8"));
  assert.equal(typeof cfg, "object");
  assert.ok(cfg.stream && cfg.stream.enabled === true, "der Realtime-Schalter steht nicht mehr darin");
});
