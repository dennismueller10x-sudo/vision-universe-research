/* =========================================================================
   DIE LETZTE STATION DER REISE HATTE KEINE SEITE.

   Gemessen am 26.09.2026: die Erklaerseite bietet den Knopf „Methodik im
   Detail" mit dem Ziel /quant/methodology/. Dort lagen 18 Vertragsdateien
   und keine index.html - auf GitHub Pages ist das ein 404. Die Reise fuehrt
   „wie belastbar ist das alles" als letzte Station, und der Weg dorthin war
   eine Sackgasse.

   Gefunden hat das eine Messung der zwanzig Pfade, die die App ausserhalb von
   /vu2/ verlinkt. Zwei sahen zunaechst leer aus; einer davon (`/shares`) war
   ein Messfehler - die Zeichenkette ist eine Einheit ("je Aktie"), kein Link.
   Der andere war echt.

   Was hier gehalten wird:
     1. Die Seite existiert und nennt JEDEN Vertrag des Verzeichnisses.
     2. Sie erfindet keinen Zweck: wo ein Vertrag keinen nennt, sagt sie das.
     3. Kein interner Name steht in einer Ueberschrift - das Woerterbuch
        erlaubt ihn in der Methodik-Ebene, aber nie zuerst.
     4. Der Knopf auf der Erklaerseite zeigt auf genau diesen Pfad.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import dictionary from "../methodology/product-language-v1.json" with { type: "json" };

const ROOT = join(import.meta.dirname, "..", "..");
const SEITE = join(ROOT, "quant/methodology/index.html");
const DIR = join(ROOT, "quant/methodology");

test("the page exists and names every published contract", () => {
  assert.ok(existsSync(SEITE), "die Seite hinter dem Knopf gibt es nicht - der Weg ist wieder eine Sackgasse");
  const html = readFileSync(SEITE, "utf8");
  const dateien = readdirSync(DIR).filter((n) => n.endsWith(".json")).sort();
  assert.ok(dateien.length >= 15, "nur " + dateien.length + " Vertraege - liest dieser Test noch das Richtige?");
  for (const datei of dateien) {
    assert.ok(html.includes(datei), "der Vertrag " + datei + " fehlt auf der Methodik-Seite");
  }
  /* Und die Zahl im Einleitungssatz ist die gemessene, keine gerundete. */
  assert.ok(html.includes("alle " + dateien.length + " Verträge"),
    "der Einleitungssatz nennt nicht die Zahl der Verträge");
});

test("a contract without a stated purpose is marked as such, not given one", () => {
  const html = readFileSync(SEITE, "utf8");
  const dateien = readdirSync(DIR).filter((n) => n.endsWith(".json"));
  let ohneZweck = 0;
  for (const datei of dateien) {
    let contract = null;
    try { contract = JSON.parse(readFileSync(join(DIR, datei), "utf8")); } catch { contract = null; }
    const hat = ["purpose", "note", "description", "summary"].some((k) =>
      contract && typeof contract[k] === "string" && contract[k].trim().length > 20);
    if (!hat) ohneZweck += 1;
  }
  assert.ok(ohneZweck > 0, "kein Vertrag ohne Zweck - dann prueft dieser Fall nichts");
  const satz = "Dieser Vertrag nennt keinen Zweck in Worten";
  const vorkommen = (html.match(new RegExp(satz, "g")) || []).length;
  assert.equal(vorkommen, ohneZweck,
    "die Seite nennt " + vorkommen + " Verträge ohne Zweck, gemessen sind es " + ohneZweck);
});

test("no forbidden internal name appears in a heading", () => {
  const html = readFileSync(SEITE, "utf8");
  const ueberschriften = [...html.matchAll(/<h[12][^>]*>([^<]*)<\/h[12]>/g)].map((m) => m[1]);
  assert.ok(ueberschriften.length > 10, "zu wenige Überschriften gefunden");
  for (const text of ueberschriften) {
    for (const verboten of dictionary.forbiddenInPrimaryCopy) {
      assert.equal(text.includes(verboten), false,
        'die Überschrift "' + text + '" trägt den internen Namen "' + verboten + '" - ' +
        "das Wörterbuch erlaubt ihn in der Methodik-Ebene, aber nie zuerst");
    }
  }
  /* Der interne Name darf weiter vorkommen - als Beisatz. Genau das ist der
     Unterschied, und er muss sichtbar bleiben. */
  assert.match(html, /interner Name:/);
});

test("the button on the explain view points at this page", () => {
  const seite = readFileSync(join(ROOT, "vu2/experience.js"), "utf8");
  assert.match(seite, /label:'Methodik im Detail',href:'\/quant\/methodology\/'/);
  /* Und der Smoke sieht den Pfad an - sonst faellt die Seite beim naechsten
     Umbau still wieder aus. */
  const smoke = readFileSync(join(ROOT, "scripts/vu2/production-smoke.mjs"), "utf8");
  assert.match(smoke, /'\/quant\/methodology\/'/);
});

test("the page is generated, not hand-written", () => {
  /* Eine handgeschriebene Liste driftet: ein neuer Vertrag kommt dazu, die
     Seite nennt ihn nicht, und niemand merkt es. */
  const bauer = join(ROOT, "scripts/quant/build-methodology-index.mjs");
  assert.ok(existsSync(bauer));
  const source = readFileSync(bauer, "utf8");
  assert.match(source, /readdir\(DIR\)/);
  const workflow = readFileSync(join(ROOT, ".github/workflows/product-intelligence-materialization.yml"), "utf8");
  assert.match(workflow, /build-methodology-index\.mjs/);
  assert.match(workflow, /quant\/methodology\/index\.html/);
});
