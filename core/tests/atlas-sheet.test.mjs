// Atlas auf jeder Aktie (Konzept mein-bereich-2026-11, Screen a-sheet): Sheet „Atlas zu <Name>“ mit Eingabe und drei Fragen;
// die Aktie geht als Kontext in die Frage, beantwortet wird auf /ask/. Schreibt keine Datei.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../../assets/atlas-sheet.js");
const UI = require("../../assets/vu-ui.js");

const fakeDoc = (attrs) => ({ querySelector: (sel) => sel === "[data-vu-stock]" && attrs ? { getAttribute: (k) => attrs[k] ?? null } : null });

test("AS-1 · Aktie der Seite aus dem Aktienkopf (data-vu-stock), sonst kein Sheet", () => {
  assert.deepEqual(S.stockOf(fakeDoc({ "data-vu-stock": "nvda", "data-vu-stock-name": "NVIDIA Corporation" })), { ticker: "NVDA", name: "NVIDIA Corporation".replace(" Corporation", "") });
  assert.equal(S.stockOf(fakeDoc(null)), null);
  assert.equal(S.stockOf(fakeDoc({ "data-vu-stock": "<script>" })), null, "nur gültige Kürzel");
  assert.equal(S.open(fakeDoc(null)), false, "ohne Aktie gilt der normale Link nach /ask/");
});

test("AS-2 · Frage mit der Aktie als Kontext und Adresse der Antwort", () => {
  const st = { ticker: "NVDA", name: "NVIDIA" };
  assert.equal(S.question("Wie hoch sind die Schulden", st), "Wie hoch sind die Schulden (NVIDIA, NVDA)?");
  assert.equal(S.question("Was macht NVIDIA?", st), "Was macht NVIDIA?", "steht schon drin");
  assert.equal(S.question("Und nvda im Chart?", st), "Und nvda im Chart?");
  assert.match(S.href("Wie hoch ist die Marge bei NVIDIA?", st), /^\/ask\/\?q=Wie%20hoch%20ist%20die%20Marge%20bei%20NVIDIA%3F&go=1$/);
});

test("AS-3 · Sheet: Titel, Eingabe, drei Fragen, Schließen; Text maskiert", () => {
  const h = S.html({ ticker: "NVDA", name: "NVIDIA" });
  assert.match(h, /Atlas zu NVIDIA/);
  assert.match(h, /placeholder="Frag etwas zu NVIDIA …"/);
  assert.match(h, /bezieht sich auf diese Aktie/);
  assert.equal((h.match(/class="vu-as-chip"/g) || []).length, 3);
  assert.match(h, /aria-modal="true"/);
  assert.match(h, /data-vu-as-close/);
  assert.doesNotMatch(S.html({ ticker: "X", name: '<img src=x onerror=1>' }), /<img src=x/);
});

test("AS-4 · Aktienköpfe tragen die Aktie; die Kopfzeile öffnet das Sheet nur auf Aktienseiten", () => {
  assert.match(UI.stockHead({ ticker: "NVDA", name: "NVIDIA" }), /<header class="vu-stockhead" data-vu-stock="NVDA" data-vu-stock-name="NVIDIA">/);
  assert.match(readFileSync("assets/stock-navigator.js", "utf8"), /setAttribute\("data-vu-stock", o\.ctx\.displaySymbol/);
  const nav = readFileSync("assets/site-navigation.js", "utf8");
  assert.match(nav, /querySelector\('\[data-vu-stock\]'\)/);
  assert.match(nav, /\/assets\/atlas-sheet\.js/);
  assert.match(readFileSync("ask/app.js", "utf8"), /params\.get\('go'\) === '1'/, "/ask/ stellt die Frage aus dem Sheet sofort");
});
