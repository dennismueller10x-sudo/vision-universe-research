/* =========================================================================
   VERCEL IST FUER QUANT KEINE PRODUKTIONSGRENZE.

   Diese Tests halten zwei Dinge fest, die man sonst nur durch einen roten
   Release wieder lernt.

   1. Die Richtung der Exit-Codes. Vercels Ignored Build Step liest
      Exit 0 als ABBRECHEN und Exit 1 als BAUEN. Wer das vertauscht,
      schaltet die Auslieferung der Serverless-Funktionen ab und merkt es
      erst, wenn sie gebraucht werden.

   2. Die Behauptung, auf der die Regel beruht: das Quant-Frontend haengt
      nicht an Vercel. Das ist nicht Meinung, sondern im Repository
      pruefbar - und wird hier gepruft, damit ein spaeterer Umbau, der
      das Frontend doch an Vercel bindet, diesen Test bricht statt
      stillschweigend eine falsche Doku zu hinterlassen.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { entscheide, BAUEN, ABBRECHEN, VERCEL_PFADE } from "../../scripts/vu2/vercel-should-build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("die Produktion baut immer, auch wenn nur das Frontend geaendert wurde", () => {
  const e = entscheide({ umgebung: "production", dateien: ["vu2/experience.js"] });
  assert.equal(e.code, BAUEN, "die Produktion darf ein Kontingent nie schonen: " + e.grund);
});

test("eine Vorschau ohne Vercel-eigene Aenderung wird abgebrochen", () => {
  const e = entscheide({
    umgebung: "preview",
    dateien: ["vu2/experience.js", "vu2/experience.css", "quant/data/product/setup-states-v1.json", "docs/X.md"],
  });
  assert.equal(e.code, ABBRECHEN, "eine Vorschau des 197-Byte-Platzhalters kostet ein Deployment und sagt nichts");
});

test("eine Vorschau MIT Vercel-eigener Aenderung wird gebaut", () => {
  for (const datei of ["api/history.js", "server/http.js", "vercel.json", "scripts/vu2/build-vercel-public.mjs"]) {
    const e = entscheide({ umgebung: "preview", dateien: ["vu2/experience.js", datei] });
    assert.equal(e.code, BAUEN, datei + " gehoert Vercel, die Vorschau ist aussagekraeftig: " + e.grund);
  }
});

test("ein unbekannter Diff baut, statt stillschweigend abzubrechen", () => {
  assert.equal(entscheide({ umgebung: "preview", dateien: null }).code, BAUEN);
  assert.equal(entscheide({ umgebung: "", dateien: null }).code, BAUEN);
});

test("ein leerer Diff ist eine Antwort und kein Fehler", () => {
  assert.equal(entscheide({ umgebung: "preview", dateien: [] }).code, ABBRECHEN);
});

test("vercel.json ruft genau dieses Skript als ignoreCommand auf", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.ok(cfg.ignoreCommand, "ohne ignoreCommand baut Vercel weiter fuer jeden Frontend-Commit");
  assert.match(cfg.ignoreCommand, /scripts\/vu2\/vercel-should-build\.mjs/);
  /* Die drei Funktionen bleiben. Diese Bereinigung entfernt Vercel nicht. */
  for (const f of ["api/history.js", "api/intraday.js", "api/status.js"]) {
    assert.ok(cfg.functions && cfg.functions[f], f + " darf nicht aus vercel.json verschwinden");
    assert.ok(existsSync(join(ROOT, f)), f + " muss weiter im Repository liegen");
  }
});

test("das Quant-Frontend ruft keine Vercel-Funktion auf", () => {
  /* Die Behauptung, auf der die ganze Bereinigung beruht. Bricht dieser
     Test, ist die Doku falsch geworden - dann ist Vercel fuer Quant doch
     produktiv, und die Vorschau-Regel gehoert zurueckgenommen. */
  const dateien = readdirSync(join(ROOT, "vu2")).filter((d) => d.endsWith(".js") || d.endsWith(".html"));
  assert.ok(dateien.length >= 2, "vu2/ ist leer - der Test prueft dann nichts");
  for (const d of dateien) {
    const text = readFileSync(join(ROOT, "vu2", d), "utf8");
    assert.doesNotMatch(text, /\.vercel\.app/, d + " nennt eine Vercel-Adresse");
    assert.doesNotMatch(text, /fetch\(\s*["'`]\/api\//, d + " ruft /api/ direkt auf");
    /* /quant/api/*.js sind lokale Skripte, keine Endpunkte - deshalb
       prueft der Ausdruck oben auf /api/ am Pfadanfang, nicht auf "api". */
  }
});

test("die Liste der Vercel-Pfade nennt alles, was Vercel ausliefert", () => {
  for (const f of readdirSync(join(ROOT, "api"))) {
    assert.ok(VERCEL_PFADE.some((p) => ("api/" + f).startsWith(p)),
      "api/" + f + " ist nicht von VERCEL_PFADE gedeckt - eine Aenderung daran wuerde die Vorschau verlieren");
  }
});

test("Produktion fuer Quant ist GitHub Pages, nicht Vercel", () => {
  const cname = readFileSync(join(ROOT, "CNAME"), "utf8").trim();
  assert.equal(cname, "research.visionuniverse.de");
  const pages = readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8");
  assert.match(pages, /actions\/deploy-pages@/, "der kanonische Produktions-Deploy ist Pages");
  assert.match(pages, /branches:\s*\[main\]/, "Pages deployt auf push nach main");
  /* Und der oeffentliche Vercel-Build liefert weiter nur den Platzhalter. */
  const build = readFileSync(join(ROOT, "scripts/vu2/build-vercel-public.mjs"), "utf8");
  assert.match(build, /Vision Universe Product Data Service/);
  assert.doesNotMatch(build, /vu2/, "sobald Vercel das Frontend baut, gilt diese Grenze nicht mehr");
});
