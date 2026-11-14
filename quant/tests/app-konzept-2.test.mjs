// App-Konzept 2 (Owner-Freigabe 14.11.2026) in Quant: Seitenkopf mit Erklärfenster, „Weiter“-Karte je Ansicht,
// Vorher/Nachher aus dem Meldungstext. Nur Darstellung (quant/app/ui.js, quant/app/app.css); die Seiten selbst prüft
// die Browser-QA (scripts/vu2/browser-qa.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const ui = read("quant/app/ui.js"), app = read("quant/app/app.js"), css = read("quant/app/app.css"), pages = read("quant/app/pages.js");

test("AK2-1 · jede „Weiter“-Karte gehört zu einer Ansicht des Routers und führt auf eine bestehende Route", () => {
  const block = ui.slice(ui.indexOf("var NEXT = {"), ui.indexOf("function hashParts()"));
  const views = [...block.matchAll(/^\s{4}([a-z]+): function/gm)].map((m) => m[1]);
  assert.ok(views.length >= 10, "zu wenige Ansichten: " + views.join(","));
  const known = new Set([...app.slice(app.indexOf("var TITLE = {"), app.indexOf("/* -------------------------------------------------------- Kontext */")).matchAll(/([a-z]+): "/gi)].map((m) => m[1]));
  for (const v of views) assert.ok(known.has(v), "unbekannte Ansicht in NEXT: " + v);
  for (const r of [...block.matchAll(/routes\.([a-zA-Z]+)\(/g)].map((m) => m[1])) assert.match(ui, new RegExp("\\b" + r + ": function"), "Route fehlt: " + r);
  assert.match(block, /href: "\/supertrader\/"/);
  assert.doesNotMatch(block, /Empfehlung|Signal|Kursziel|für dich/i, "Wortwahl (docs/legal/WORTWAHL.md)");
  assert.match(ui, /if \(!o \|\| main\.querySelector\("\.v2-message"\)\) return;/, "Fehlerseiten bekommen keine „Weiter“-Karte");
});

test("AK2-2 · Vorher/Nachher liest nur zwei veröffentlichte Werte aus dem Meldungstext", () => {
  const src = ui.match(/function deltaOf\(text\) \{[^\n]+\}/);
  assert.ok(src, "deltaOf fehlt");
  const deltaOf = new Function(src[0] + " return deltaOf;")();
  assert.deepEqual(deltaOf("Kurs lief gut: von „stark“ (79) auf „sehr stark“ (83)."), { from: 79, to: 83 });
  assert.deepEqual(deltaOf("Ruhig für die Branche: von „niedrig“ (82) auf „durchschnittlich“ (75)."), { from: 82, to: 75 });
  assert.equal(deltaOf("Von „Beobachten“ auf „Setup bestätigt“ am 13.11.2026."), null);
  assert.equal(deltaOf("Erfüllt jetzt: Abstand zum 200-Tage-Durchschnitt ≥ 0 %."), null);
  assert.equal(deltaOf("Wert (140) auf (20)"), null, "Werte über 100 sind kein Rang");
  assert.equal(deltaOf(null), null);
  assert.match(pages, /X\.deltaOf \? X\.deltaOf\(e\.explanation\) : null/, "die Meldungszeile nutzt denselben Leser");
});

test("AK2-3 · Dachzeile und Erklärsatz bleiben im Dokument und stehen im Fenster", () => {
  assert.match(css, /\.qv3-intro \.vu-ltag,\.qv3-intro \.vu-lead,[^{]*\{position:absolute;width:1px;height:1px;[^}]*clip-path:inset\(50%\)/, "nur optisch ausgeblendet, nicht display:none");
  assert.doesNotMatch(css, /\.qv3-intro \.vu-(ltag|lead)\{display:none/);
  assert.match(ui, /U\.popup\(\{ id: "qk2-info-sheet", title: h1\.textContent\.trim\(\)/);
  assert.match(ui, /main\.dataset\.view === "home"/, "die Startseite trägt den Satz im Fenster „So arbeitet Quant“");
  assert.match(pages, /Jede Aktie hat ein Profil aus " \+ nWordHtml\(\) \+ " Eigenschaften: <span data-factor-list>/, "Profil-Satz im Fenster „So arbeitet Quant“");
});
