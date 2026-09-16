/* =========================================================================
   VU SOCIAL — DIE OEFFENTLICHE BASIS-URL WIRD NICHT STILL ERSETZT

   Aus PUBLIC_BASE_URL entsteht die redirect_uri. Meta vergleicht sie
   zeichengenau. Wer sie unbemerkt aendert, bricht den Login — und zwar
   so, dass der CI-Lauf gruen bleibt und der Fehler erst im Meta-Dialog
   auftaucht, wo er wie ein Meta-Problem aussieht.

   Genau das drohte hier. Der Workflow liest nach dem Deployment die
   Adresse aus der wrangler-Ausgabe, mit einem Muster, das nur
   `*.workers.dev` trifft:

       grep -oE 'https://[a-z0-9.-]+\.workers\.dev'

   Solange es nur diese eine Adresse gab, war das richtig. Mit einer
   Custom Domain bleibt `workers_dev` aktiv, wrangler nennt die
   workers.dev-Adresse weiterhin — und der Nachtrag haette die eigene
   Domain damit ueberschrieben. Beim naechsten Deployment stuende wieder
   die Adresse in der Konfiguration, die Meta abgelehnt hat.

   Die Regel ist deshalb: nachtragen fuellt eine Luecke, es ersetzt nie.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { setTomlValue, readTomlValue } from "../../scripts/social/provision-cloudflare.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRANGLER = join(ROOT, "workers", "vision-universe-social", "wrangler.toml");

const PLACEHOLDER = 'PUBLIC_BASE_URL = "REPLACE_WITH_WORKER_PUBLIC_URL"';
const CUSTOM = 'PUBLIC_BASE_URL = "https://social.visionuniverse.de"';
const WORKERS_DEV = "https://vision-universe-social.little-credit-15d3.workers.dev";

/* Dieselbe Regel wie in setUrl(): nur ein Platzhalter darf weichen. */
function isGap(current) {
  return !current || current.startsWith("REPLACE_WITH");
}

test("U1 · Ein Platzhalter darf gefuellt werden", () => {
  assert.equal(isGap(readTomlValue(PLACEHOLDER, "PUBLIC_BASE_URL")), true);
});

test("U2 · Eine eingetragene eigene Domain ist keine Luecke", () => {
  /* Der Fall, der den Fehler erzeugt haette. */
  assert.equal(isGap(readTomlValue(CUSTOM, "PUBLIC_BASE_URL")), false,
    "Eine gesetzte Adresse darf der Nachtrag nicht anfassen");
});

test("U3 · Auch eine workers.dev-Adresse ist keine Luecke", () => {
  const source = `PUBLIC_BASE_URL = "${WORKERS_DEV}"`;
  assert.equal(isGap(readTomlValue(source, "PUBLIC_BASE_URL")), false);
});

test("U4 · Das Muster des Workflows trifft die eigene Domain nicht", () => {
  /* Der Grund, warum der Nachtrag ueberhaupt gefaehrlich wurde. Faellt
     dieser Test irgendwann um, weil das Muster erweitert wurde, ist das
     ein Hinweis und kein Fehler — dann ist die Luecken-Regel die einzige
     verbliebene Absicherung. */
  const pattern = /https:\/\/[a-z0-9.-]+\.workers\.dev/;
  assert.match(WORKERS_DEV, pattern);
  assert.doesNotMatch("https://social.visionuniverse.de", pattern,
    "Die eigene Domain kaeme aus der wrangler-Ausgabe nie zurueck — " +
    "der Nachtrag haette sie durch die workers.dev-Adresse ersetzt.");
});

test("U5 · Die Adresse laesst sich bewusst aendern", () => {
  /* Die Sperre soll schuetzen, nicht einmauern. */
  const changed = setTomlValue(CUSTOM, "PUBLIC_BASE_URL", WORKERS_DEV);
  assert.equal(readTomlValue(changed, "PUBLIC_BASE_URL"), WORKERS_DEV);
});

test("U6 · Kommentare ueberleben die Aenderung", () => {
  /* In dieser Datei ist der Kommentar der halbe Inhalt. */
  const source = "# Die oeffentliche Basis-URL\n" + PLACEHOLDER + "\n# danach\n";
  const changed = setTomlValue(source, "PUBLIC_BASE_URL", "https://social.visionuniverse.de");
  assert.match(changed, /# Die oeffentliche Basis-URL/);
  assert.match(changed, /# danach/);
});

test("U7 · Die hinterlegte Adresse und die Redirect-URI passen zusammen", () => {
  /* Was in der Konfiguration steht, muss die Adresse sein, die in der
     Meta-App eingetragen ist. Ein Schraegstrich am Ende genuegt fuer
     eine Absage. */
  const configured = readTomlValue(readFileSync(WRANGLER, "utf8"), "PUBLIC_BASE_URL");
  assert.ok(configured, "PUBLIC_BASE_URL fehlt");
  assert.doesNotMatch(configured, /\/$/, "Kein Schraegstrich am Ende");
  assert.match(configured, /^https:\/\//, "Meta akzeptiert nur https");
});
