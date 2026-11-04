// Discover · Aktienseite nach dem Redesign 2027 (D09): Darstellungsregeln des Überblicks (discover/ui/overview.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const O = require("../ui/overview.js");

test("OV1 Kurs-Urteil: ab +5 % stärker, ab −5 % schwächer, sonst seitwärts, ohne Wert keins", () => {
  assert.deepEqual(O.kursUrteil(-0.134826), ["weak", "Etwas schwächer"]);
  assert.deepEqual(O.kursUrteil(0.05), ["strong", "Etwas stärker"]);
  assert.deepEqual(O.kursUrteil(0.01), ["mid", "Seitwärts"]);
  assert.equal(O.kursUrteil(null), null);
});

test("OV2 Bewertung folgt der ausgelieferten Stufe gegen den Marktmedian", () => {
  assert.deepEqual(O.bewertungsUrteil({ relative: { stufe: "mittel" } }), ["mid", "Wie der Markt"]);
  assert.deepEqual(O.bewertungsUrteil({ relative: { stufe: "hoch" } }), ["weak", "Teurer als der Markt"]);
  assert.equal(O.bewertungsUrteil({}), null);
});

test("OV3 Noten der Gesundheit auf die vier Urteile (C08)", () => {
  assert.equal(O.gradeKind("Sehr stark"), "strong");
  assert.equal(O.gradeKind("Solide"), "mid");
  assert.equal(O.gradeKind("Rückläufig"), "weak");
});

test("OV4 Reihentitel lesbar, Abkürzungen bleiben groß", () => {
  assert.equal(O.titleCase("STÄRKSTE AKTIEN IM NASDAQ-100"), "Stärkste Aktien im NASDAQ-100");
  assert.equal(O.titleCase("HALBLEITER & CHIPS"), "Halbleiter & Chips");
  assert.equal(O.titleCase("KÜNSTLICHE INTELLIGENZ"), "Künstliche Intelligenz");
});

test("OV5 Aktienroute lädt Bausteine, Überblick und Stil; nur Weiß/Schwarz/Neongrün im Überblick", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const s of ["/assets/vu-chart.js", "/assets/vu-ui.js", "/discover/ui/overview.js", "/assets/vu-ui.css", "/discover/ui/overview.css"]) assert.ok(html.includes(s), s);
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  for (const c of css.match(/#[0-9a-f]{3,8}\b/gi) || []) assert.ok(["#c8f531", "#000", "#fff", "#f4f4f4", "#e9e9e9", "#6e6e6e"].includes(c.toLowerCase()), c);
});
