/* =========================================================================
   DIE PRODUKTGRENZE ZWISCHEN ZWEI SCREENERN

   Owner-Entscheid 29.09.2026. Vision Universe hat ZWEI Dinge, die
   "Screener" heissen, und sie sind nicht dasselbe:

     1. VISION UNIVERSE SCREENER   /screener/
        eigenstaendiges Produkt der Uebermarke, eigener Produktbereich,
        NICHT Bestandteil von Quant.

     2. QUANT SCREENER             /quant/?view=screener
        internes Werkzeug innerhalb von Quant: filtert Aktien nach der
        Quant-Logik (Faktoren, Setups, Strategien). Unterbereich von Quant.

   Keine Zusammenlegung ohne ausdruecklichen Owner-Entscheid.

   INVENTAR ZUM ZEITPUNKT DIESER TESTS (gemessen, nicht angenommen):

     Speicherschluessel   /screener/      vu-screener-v1
                          /quant/ (vu2)   vu2.zuletzt
                          /quant/screener/ vu.quant.screen.v1
                          -> keine Kollision

     Plattform-Navigation zeigt an beiden Stellen (Gruppe "Analyse" und
     Schnellzugriff im Kopf) auf /screener/, also auf das eigenstaendige
     Produkt.

   Diese Tests halten die Grenze fest - und zwar so, dass sie beim
   naechsten Umbau bricht, statt still zu verschwimmen.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const QUANT = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
const NAV = readFileSync(join(ROOT, "assets/site-navigation.js"), "utf8");

/** Quelltext ohne Kommentare: die Regeln gelten fuer das, was die
    Oberflaeche ZEIGT, nicht fuer das, was der Code erklaert. */
function ohneKommentare(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ---------------------------------------------------------------------
   1. GETRENNTE ROUTEN
   --------------------------------------------------------------------- */

test("beide Produkte existieren getrennt im Repository", () => {
  assert.ok(existsSync(join(ROOT, "screener/index.html")),
    "das eigenstaendige Produkt /screener/ fehlt");
  assert.ok(existsSync(join(ROOT, "screener/engine/store.js")),
    "das eigenstaendige Produkt hat seine eigene Ablage verloren");
  assert.ok(existsSync(join(ROOT, "vu2/experience.js")),
    "das Quant-Frontend fehlt");
});

test("Quant verlinkt niemals das eigenstaendige Screener-Produkt als seinen eigenen Bereich", () => {
  /* Quant DARF auf /screener/ verweisen - aber nur als fremdes Produkt,
     nie als eigener Bereich. Der gefaehrliche Fall ist ein Eintrag in der
     Bereichsleiste oder eine Ansicht, die dorthin fuehrt. */
  const q = ohneKommentare(QUANT);
  const bereiche = q.slice(q.indexOf("const nav="), q.indexOf("const nav=") + 400);
  assert.doesNotMatch(bereiche, /\/screener\//,
    "die Bereichsleiste von Quant fuehrt aus dem Produkt heraus in das eigenstaendige Screener-Produkt");
});

test("die Plattform-Navigation fuehrt Screener als eigenstaendiges Produkt", () => {
  assert.match(NAV, /\['Screener','\/screener\/'/,
    "der Menueeintrag Screener zeigt nicht mehr auf das eigenstaendige Produkt");
  assert.doesNotMatch(NAV, /\['Screener','\/quant\//,
    "der Menueeintrag Screener zeigt in den Quant-internen Screener - das sind zwei Produkte");
});

/* ---------------------------------------------------------------------
   2. SPRACHE: WER IST WER
   --------------------------------------------------------------------- */

test("der Quant-interne Screener heisst im UI auch nach Quant", () => {
  /* Der Owner-Entscheid ausdruecklich: das eigenstaendige Produkt heisst
     schlicht "Screener", der Quant-interne "Quant Screener". Ein Link
     namens nur "Screener", der in Quants eigenen Screener fuehrt, ist
     genau die Verwechslung, die vermieden werden soll. */
  const q = ohneKommentare(QUANT);
  const treffer = [...q.matchAll(/\['([^']*)',\s*href\('screener'\)/g)].map((m) => m[1]);
  assert.ok(treffer.length > 0, "kein beschrifteter Verweis auf den Quant-Screener gefunden");
  for (const label of treffer) {
    assert.match(label, /Quant/,
      'ein Verweis auf den Quant-Screener heisst nur "' + label + '" - das ist der Name des anderen Produkts');
  }
});

test("auch der klassische Quant-Screener traegt den Produktnamen", () => {
  const q = ohneKommentare(QUANT);
  const treffer = [...q.matchAll(/\['([^']*)',\s*'\/quant\/screener\/'/g)].map((m) => m[1]);
  for (const label of treffer) {
    assert.match(label, /Quant/,
      '"' + label + '" fuehrt nach /quant/screener/ und nennt Quant nicht');
  }
  /* Und der Knopf am Fuss des Profi-Editors. */
  const knopf = q.match(/label:\s*'([^']*Screener[^']*)',\s*href:\s*'\/quant\/screener\/'/);
  if (knopf) assert.match(knopf[1], /Quant/,
    'der Knopf "' + knopf[1] + '" oeffnet den Quant-Screener und nennt Quant nicht');
});

/* ---------------------------------------------------------------------
   3. KEINE VERWECHSLUNG IM SEITENTITEL
   --------------------------------------------------------------------- */

test("der Seitentitel nennt Bereich und Produkt", () => {
  /* Der Titel war statisch und in jedem Bereich derselbe. Bei zwei
     gleichnamigen Produkten ist ein Reiter, der nicht sagt wo man ist,
     eine Verwechslungsquelle. */
  assert.match(QUANT, /document\.title\s*=/,
    "der Seitentitel wird nicht mehr je Bereich gesetzt");
  const titel = QUANT.slice(QUANT.indexOf("const TITEL="), QUANT.indexOf("async function render()"));
  assert.match(titel, /screener:\s*'Quant Screener'/,
    "der Titel des Quant-Screeners nennt Quant nicht");
  /* Kein Bereich darf schlicht "Screener" heissen - so heisst das andere
     Produkt. */
  assert.doesNotMatch(titel, /:\s*'Screener'/,
    "ein Quant-Bereich traegt den Titel des eigenstaendigen Produkts");
});

/* ---------------------------------------------------------------------
   4. KEIN GEMEINSAMER ZUSTAND
   --------------------------------------------------------------------- */

test("die Produkte teilen keinen Speicherschluessel", () => {
  /* Gemessenes Inventar: /screener/ schreibt vu-screener-v1, Quant
     schreibt vu2.* und vu.quant.*. Ein gemeinsamer Schluessel hiesse,
     dass ein Filter des einen Produkts den des anderen ueberschreibt. */
  const dateien = {
    "screener/engine/store.js": readFileSync(join(ROOT, "screener/engine/store.js"), "utf8"),
    "vu2/experience.js": QUANT,
  };
  const schluessel = {};
  for (const [datei, text] of Object.entries(dateien)) {
    schluessel[datei] = new Set(
      [...text.matchAll(/['"](vu[-.][a-zA-Z0-9.-]+)['"]/g)].map((m) => m[1])
        .concat([...text.matchAll(/['"](vu2\.[a-zA-Z0-9.-]+)['"]/g)].map((m) => m[1])));
  }
  const a = schluessel["screener/engine/store.js"], b = schluessel["vu2/experience.js"];
  const gemeinsam = [...a].filter((k) => b.has(k));
  assert.deepEqual(gemeinsam, [],
    "beide Produkte schreiben unter demselben Schluessel: " + gemeinsam.join(", ") +
    " - ein Filter des einen ueberschriebe den des anderen");
});

test("der Quant-Screener speichert unter einem Quant-Schluessel", () => {
  const alt = join(ROOT, "quant/screener/app.js");
  if (!existsSync(alt)) return;
  const text = readFileSync(alt, "utf8");
  const m = text.match(/STORAGE_KEY\s*=\s*"([^"]+)"/);
  assert.ok(m, "der klassische Quant-Screener hat keinen benannten Speicherschluessel mehr");
  assert.match(m[1], /^vu\.quant\./,
    'der Schluessel "' + m[1] + '" ordnet sich nicht Quant zu');
});
