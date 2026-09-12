/* =========================================================================
   Der dunkle Header ist die einzige Aenderung an einer Kerndatei, die
   dieser Auftrag erlaubt - und sie darf ausschliesslich Discover
   betreffen. Diese Pruefung haelt genau das fest:

   Der Kopf wird zweimal gebaut, einmal ohne Attribut und einmal mit
   theme="dark". Danach werden die Farbwerte beider Fassungen durch
   Platzhalter ersetzt. Bleiben zwei identische Zeichenketten uebrig, dann
   hat sich nichts ausser Farben geaendert: kein Menuepunkt, kein Link,
   keine Regel, kein Markup. Faende jemand spaeter eine Abkuerzung und
   baute fuer Discover eine zweite Navigationslogik, fiele dieser Test.

   Die Gegenprobe im Browser (scripts/discover/browser-qa.mjs) prueft, dass
   andere Vision-Universe-Seiten weiterhin hell rendern; hier geht es um
   die Quelle.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const quelle = readFileSync(join(root, "assets", "site-navigation.js"), "utf8");

/* Ein Minimal-DOM. Es kann genau so viel, wie die Navigation benutzt -
   mehr waere geraten statt gemessen. */
function baueKopf(attribute, pfad, text) {
  attribute = attribute || {};
  const code = text || quelle;
  let klasse = null;
  const sandbox = {
    HTMLElement: class {},
    customElements: { define: (_name, k) => { klasse = k; } },
    document: { createElement: () => ({
      _attrs: {}, href: "", textContent: "",
      setAttribute(n, v) { this._attrs[n] = v; },
      getAttribute(n) { return n in this._attrs ? this._attrs[n] : null; }
    }) },
    location: { pathname: pfad || "/quant/" }
  };
  vm.runInNewContext(code, sandbox);
  assert.ok(klasse, "customElements.define wurde nicht aufgerufen");

  const kinder = [];
  const nav = {
    kinder, innerHTML: "",
    append: (a) => kinder.push(a),
    classList: { remove() {}, toggle: () => false },
    addEventListener() {}, setAttribute() {}
  };
  const knopf = { addEventListener() {}, setAttribute() {}, focus() {} };
  let css = "";
  const shadow = {
    set innerHTML(v) { css = v; },
    get innerHTML() { return css; },
    querySelector: (sel) => (sel === "nav" ? nav : sel === "button" ? knopf : null),
    querySelectorAll: () => [],
    addEventListener() {}
  };

  const el = Object.create(klasse.prototype);
  el.shadowRoot = null;
  el.getAttribute = (n) => (n in attribute ? attribute[n] : null);
  el.attachShadow = () => shadow;
  el.connectedCallback();
  return { html: css, links: kinder };
}

/* Statt die fertigen Zeichenketten nachtraeglich einzufaerben, bekommen
   BEIDE Paletten dieselben Platzhalter - je Schluessel einen. Der Umweg
   ist noetig, weil innerhalb einer Palette derselbe Farbwert zweimal
   vorkommt (im Dark-Modus sind Schrift und Burger-Grund identisch). Ein
   Ersetzen nach Wert koennte die beiden nicht auseinanderhalten und haette
   eine echte Aenderung uebersehen. */
function quelleMitPlatzhaltern() {
  const anfang = quelle.indexOf("const THEMES = {");
  const ende = quelle.indexOf("\n  };", anfang) + 4;
  assert.ok(anfang > 0 && ende > anfang, "der THEMES-Block wurde nicht gefunden");
  const block = quelle.slice(anfang, ende)
    .replace(/([A-Za-z]+):\s*'[^']*'/g, (_m, k) => k + ": '<" + k + ">'");
  return quelle.slice(0, anfang) + block + quelle.slice(ende);
}

test("ohne Attribut bleibt der Header hell - der Standard aller Seiten", () => {
  const hell = baueKopf(null);
  assert.match(hell.html, /rgba\(255,255,255,\.96\)/);
  assert.ok(!hell.html.includes("rgba(8,8,10,.92)"), "dunkler Grund im Standard");
});

test("theme=\"dark\" faerbt den Header - und nur Discover setzt es", () => {
  const dunkel = baueKopf({ theme: "dark" });
  assert.match(dunkel.html, /rgba\(8,8,10,\.92\)/);
  assert.ok(!dunkel.html.includes("rgba(255,255,255,.96)"), "heller Grund im Dark-Modus");

  const seite = readFileSync(join(root, "discover", "index.html"), "utf8");
  assert.match(seite, /<vu-navigation theme="dark">/);
});

test("ein unbekannter Wert faellt auf hell zurueck, nicht auf dunkel", () => {
  for (const wert of ["", "hell", "light", "Dark", "true"]) {
    const k = baueKopf({ theme: wert });
    assert.ok(k.html.includes("rgba(255,255,255,.96)"),
      "theme=\"" + wert + "\" haette hell bleiben muessen");
  }
});

test("zwischen hell und dunkel unterscheiden sich ausschliesslich Farbwerte", () => {
  const neutral = quelleMitPlatzhaltern();
  const hell = baueKopf(null, null, neutral).html;
  const dunkel = baueKopf({ theme: "dark" }, null, neutral).html;
  /* Das Logo-Filter ist die eine bewusste Ausnahme: eine Regel, die nur
     unter :host([theme="dark"]) greift und deshalb in beiden Fassungen im
     Stylesheet steht. Fuer helle Seiten aendert sie nichts. */
  assert.match(hell, /:host\(\[theme="dark"\]\) img\{filter:/);
  assert.equal(hell, dunkel, "ausser Farben hat sich am Kopf etwas geaendert");
  assert.match(hell, /<bg>/, "die Platzhalter sind nicht angekommen");
  assert.ok(!/#[0-9a-f]{3,6}|rgba\(/i.test(hell.split("</style>")[0]
    .replace(/:host\(\[theme="dark"\]\)[^}]*\}/, "")),
    "im Stylesheet steht noch ein fest verdrahteter Farbwert");
});

test("Menuepunkte, Reihenfolge und Ziele sind in beiden Fassungen gleich", () => {
  const hell = baueKopf(null, "/quant/").links.map((a) => a.textContent + " " + a.href);
  const dunkel = baueKopf({ theme: "dark" }, "/quant/").links.map((a) => a.textContent + " " + a.href);
  assert.deepEqual(hell, dunkel);
  assert.ok(hell.length >= 14, "es fehlen Menuepunkte");
  assert.ok(hell.includes("Discover /discover/"));
  assert.ok(hell.includes("Quant /quant/"));
});

test("die Markierung der aktuellen Seite haengt am Pfad, nicht am Theme", () => {
  const aktuell = (pfad, attr) => baueKopf(attr, pfad).links
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);
  assert.deepEqual(aktuell("/quant/"), ["Quant"]);
  assert.deepEqual(aktuell("/discover/", { theme: "dark" }), ["Discover"]);
  assert.deepEqual(aktuell("/macro/2026/"), ["Macro"]);
});
