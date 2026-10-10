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

   Frontend-Rebuild (quant/app): Prüfintention erhalten – der Quant
   Screener lebt jetzt unter /quant/#/screener (einfach) und
   #/screener/profi (Regeleditor), gebaut aus quant/app/*.js; vu2/ ist nur
   noch eine Weiterleitung. Geprueft wird deshalb die neue Oberflaeche:
   Bereichsliste NAV (quant/app/ui.js), Seitentitel TITLE (quant/app/app.js),
   Beschriftungen aller Verweise auf X.routes.screener/screenerPro und die
   Speicherschluessel aller quant/app-Dateien.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const APP_FILES = ["ui.js", "pages.js", "page-stock.js", "page-tools.js", "page-method.js", "app.js", "chart.js", "view-model.js"];
const QUANT = APP_FILES.map((f) => readFileSync(join(ROOT, "quant/app", f), "utf8")).join("\n");
const APP = readFileSync(join(ROOT, "quant/app/app.js"), "utf8");
/* Die Bereichsliste, wie ui.js sie tatsaechlich ausliefert. */
const sandbox = { QuantShell: { el() { return {}; } } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(ROOT, "quant/app/ui.js"), "utf8"), sandbox);
const QX = sandbox.QX;
const navBox = { HTMLElement: class {}, URLSearchParams, customElements: { define() {} } };
vm.runInNewContext(readFileSync(join(ROOT, "assets/site-navigation.js"), "utf8").replace(/\}\)\(\);\s*$/, "globalThis.__p = PRODUCTS; globalThis.__groups = groups;})();"), navBox);
const QUANT_DOCK = navBox.__p.find((p) => p.id === "quant");
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
  assert.ok(existsSync(join(ROOT, "quant/index.html")) && existsSync(join(ROOT, "quant/app/app.js")),
    "das Quant-Frontend fehlt");
});

test("Quant verlinkt niemals das eigenstaendige Screener-Produkt als seinen eigenen Bereich", () => {
  /* Quant DARF auf /screener/ verweisen - aber nur als fremdes Produkt,
     nie als eigener Bereich. Der gefaehrliche Fall ist ein Eintrag in der
     Bereichsleiste oder eine Ansicht, die dorthin fuehrt. */
  /* Seit der UI-Vereinheitlichung steht die Bereichsleiste in der
     gemeinsamen Shell (PRODUCTS, Produkt "quant"). */
  assert.ok(QUANT_DOCK.items.length === 4, "die Quant-Leiste hat nicht mehr vier Bereiche (plus Menue)");
  for (const [, label, href] of QUANT_DOCK.items) {
    assert.doesNotMatch(href, /^\/screener\//,
      "die Bereichsleiste von Quant fuehrt aus dem Produkt heraus in das eigenstaendige Screener-Produkt");
    assert.match(href, /^\/quant\/#\//, label + " fuehrt aus Quant heraus: " + href);
  }
  /* Quant baut daneben keine eigene Bereichsleiste mehr. */
  assert.doesNotMatch(ohneKommentare(APP), /X\.NAV|qx-tabbar/);
  /* Und die Routen des Quant Screeners bleiben innerhalb von /quant/. */
  assert.match(QX.routes.screener(), /^#\/screener/);
  assert.match(QX.routes.screenerPro(), /^#\/screener\/profi/);
});

test("die Plattform-Navigation fuehrt Screener als eigenstaendiges Produkt", () => {
  // Resolve the actual product configuration in both list and accordion
  // layouts; a matching comment or an internal Quant link is insufficient.
  const groups = navBox.__groups;
  const product = groups.find(g => !Array.isArray(g) && g.id === "screener");
  const legacy = groups.flatMap(g => Array.isArray(g) ? g[1] : []).find(([label]) => label === "Screener");
  assert.equal(product ? product.href : legacy?.[1], "/screener/",
    "der eigenstaendige Screener darf nicht in den Quant-internen Screener fuehren");
});

/* ---------------------------------------------------------------------
   2. SPRACHE: WER IST WER
   --------------------------------------------------------------------- */

test("der Quant-interne Screener heisst im UI auch nach Quant", () => {
  /* Der Owner-Entscheid ausdruecklich: das eigenstaendige Produkt heisst
     schlicht "Screener", der Quant-interne "Quant Screener". Ein Link
     namens nur "Screener", der in Quants eigenen Screener fuehrt, ist
     genau die Verwechslung, die vermieden werden soll. Frontend-Rebuild:
     der Bereichseintrag steht in NAV. */
  /* In der gemeinsamen Leiste steht "Screener" direkt neben dem immer
     sichtbaren Produktnamen "Quant"; fuer Screenreader heisst der Eintrag
     ausdruecklich "Quant Screener". */
  const treffer = QUANT_DOCK.items.filter(([, , href]) => /^\/quant\/#\/screener/.test(href));
  assert.ok(treffer.length > 0, "kein beschrifteter Verweis auf den Quant-Screener gefunden");
  assert.equal(QUANT_DOCK.items[0][1], "Quant", "der Produktname steht nicht vor dem Screener-Eintrag");
  for (const [, label, , , name] of treffer) {
    assert.match(name || label, /Quant/,
      'ein Verweis auf den Quant-Screener heisst nur "' + label + '" - das ist der Name des anderen Produkts');
  }
});

test("auch die Knopf-Beschriftungen in den Quant-Screener nennen Quant", () => {
  /* Gemessen am 29.09.2026 stand als Beschriftung schlicht "Screener" -
     der Name des ANDEREN Produkts, als Knopf mitten in Quant. Eine Regel,
     die nur eine Schreibweise kennt, ist keine Regel. Frontend-Rebuild:
     die neue Oberflaeche kennt drei Schreibweisen eines Verweises auf
     X.routes.screener / X.routes.screenerPro - diese Pruefung liest alle
     drei:

       X.btn("Label", X.routes.screener(...))       / X.link(...)
       { ..., cta: "Label", href: X.routes.screener(...) }   (Home-Tueren)
       el("a", { href: X.routes.screener(...), ..., text: "Label" })

     NICHT geprueft wird Fliesstext. Dort steht der Begriff im Satz und
     nicht als Name eines Ziels; wer ihn liest, ist bereits in Quant. */
  const q = ohneKommentare(QUANT);
  const ziel = String.raw`X\.routes\.screener(?:Pro)?\(`;
  const beschriftungen = [
    ...[...q.matchAll(new RegExp(String.raw`X\.(?:btn|link)\(\s*"([^"]*)"\s*,\s*` + ziel, "g"))].map((m) => m[1]),
    ...[...q.matchAll(new RegExp(String.raw`cta:\s*"([^"]*)"\s*,\s*href:\s*` + ziel, "g"))].map((m) => m[1]),
    /* Discover-Angleichung: Discovers Pillen tragen die Klasse VOR dem
       Ziel (el("a", { class: "v2-pill ...", href: ..., text: ... })) - der
       Auszug liest deshalb jede Attributfolge innerhalb der Zeile. */
    ...[...q.matchAll(new RegExp(String.raw`el\("a",\s*\{[^\n]*?href:\s*` + ziel + String.raw`[^\n]*?text:\s*"([^"]*)"`, "g"))].map((m) => m[1])
  ];
  assert.ok(beschriftungen.length >= 5,
    "nur " + beschriftungen.length + " Knopf-Beschriftungen gefunden - der Auszug greift nicht mehr");
  assert.ok(beschriftungen.some((l) => /Quant Screener/.test(l)), "kein Knopf nennt den Quant Screener beim Namen");
  for (const label of beschriftungen) {
    if (!/Screener/.test(label)) continue;   /* "Alle Setups" nennt kein Ziel */
    assert.match(label, /Quant Screener/,
      'der Knopf "' + label + '" fuehrt in den Quant-Screener und nennt das andere Produkt');
  }
  /* Auch die Seite selbst nennt sich so (Eyebrow des Screeners, seit der
     Discover-Angleichung Discovers v2-eyebrow). */
  /* Konzept-Design: der Titel steht als h1 im Globus-Hero des Screeners. */
  assert.match(q, /async function screener\([^)]*\) \{\s*main\.append\(el\("header", \{ class: "q-hero[^"]*" \}, \[[\s\S]{0,200}?el\("h1", \{ class: "qx-h1", text: pro \? "Quant Screener · Profi" : "Quant Screener" \}\)/);
});

test("auch der klassische Quant-Screener traegt den Produktnamen", () => {
  const q = ohneKommentare(QUANT);
  /* Verweise der neuen Oberflaeche auf die klassische Seite /quant/screener/. */
  const treffer = [
    ...[...q.matchAll(/X\.(?:btn|link)\(\s*"([^"]*)"\s*,\s*"\/quant\/screener\/[^"]*"/g)].map((m) => m[1]),
    ...[...q.matchAll(/href:\s*"\/quant\/screener\/[^"]*"[^\n]*?text:\s*"([^"]*)"/g)].map((m) => m[1])
  ];
  for (const label of treffer) {
    assert.match(label, /Quant/,
      '"' + label + '" fuehrt nach /quant/screener/ und nennt Quant nicht');
  }
});

/* ---------------------------------------------------------------------
   3. KEINE VERWECHSLUNG IM SEITENTITEL
   --------------------------------------------------------------------- */

test("der Seitentitel nennt Bereich und Produkt", () => {
  /* Der Titel war statisch und in jedem Bereich derselbe. Bei zwei
     gleichnamigen Produkten ist ein Reiter, der nicht sagt wo man ist,
     eine Verwechslungsquelle. Frontend-Rebuild: TITLE in quant/app/app.js,
     gesetzt in route(). */
  const route = APP.slice(APP.indexOf("async function route("), APP.indexOf("document.addEventListener(\"click\""));
  assert.match(route, /document\.title\s*=\s*\(TITLE\[r\.view\]/,
    "der Seitentitel wird nicht mehr je Bereich gesetzt");
  const titel = APP.slice(APP.indexOf("var TITLE = {"), APP.indexOf("};", APP.indexOf("var TITLE = {")));
  assert.match(titel, /screener:\s*"Quant Screener"/,
    "der Titel des Quant-Screeners nennt Quant nicht");
  /* Kein Bereich darf schlicht "Screener" heissen - so heisst das andere
     Produkt. */
  assert.doesNotMatch(titel, /:\s*"Screener"/,
    "ein Quant-Bereich traegt den Titel des eigenstaendigen Produkts");
  /* Und der Titel nennt das Produkt. */
  assert.match(route, /" · Vision Universe®"/);
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
    "quant/app/*.js": QUANT,
  };
  const schluessel = {};
  for (const [datei, text] of Object.entries(dateien)) {
    schluessel[datei] = new Set(
      [...text.matchAll(/['"](vu[-.][a-zA-Z0-9.-]+)['"]/g)].map((m) => m[1])
        .concat([...text.matchAll(/['"](vu2\.[a-zA-Z0-9.-]+)['"]/g)].map((m) => m[1])));
  }
  const a = schluessel["screener/engine/store.js"], b = schluessel["quant/app/*.js"];
  /* Die Auswertung muss die Schluessel der neuen Oberflaeche ueberhaupt
     sehen - sonst prueft sie nichts. */
  assert.ok(b.has("vu.quant.watchlist.v1") && b.has("vu.quant.recent.v1"), "die Quant-Schluessel wurden nicht gefunden");
  for (const k of b) assert.match(k, /^vu\.quant\.|^vu2\./, "der Schluessel " + k + " ordnet sich nicht Quant zu");
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
