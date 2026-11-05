// Bausteine C04–C20 (assets/vu-ui.js, assets/vu-ui.css) und C06 im Kleinformat (assets/vu-chart.js#sparkline).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const U = require("../../assets/vu-ui.js");
const C = require("../../assets/vu-chart.js");
const css = readFileSync(new URL("../../assets/vu-ui.css", import.meta.url), "utf8");
const nav = readFileSync(new URL("../../assets/site-navigation.css", import.meta.url), "utf8");

test("UI1 C07: Plus neongrüne Pille ▲, Minus schwarze Pille ▼, fehlend „–“", () => {
  assert.match(U.chg(3.12), /class="vu-chg"[^>]*>.*▲.*\+3,12 %/);
  assert.match(U.chg(-4.22), /vu-chg--down.*▼.*−4,22 %/);
  assert.match(U.chg(null), /vu-chg--flat">–</);
});

test("UI2 C08: vier Urteile, Unbekanntes wird „Keine Aussage“", () => {
  for (const [k, t] of [["strong", "Stark"], ["mid", "Mittel"], ["weak", "Schwach"], ["none", "Keine Aussage"]]) assert.match(U.verdict(k), new RegExp(`vu-verdict--${k}.*${t}`));
  assert.match(U.verdict("bogus"), /vu-verdict--none/);
  assert.match(U.verdict("strong", "Sehr stark"), /Sehr stark/);
});

test("UI3 Eingaben werden maskiert", () => {
  const h = U.tile("<u>", "<script>", "\"x\"") + U.help("<img src=x>") + U.stockRow({ ticker: "<T>", name: "<n>" });
  assert.doesNotMatch(h, /<script>|<img|<u>|<T>|<n>/);
});

test("UI4 C04/C05: ohne Kurs kein Kursblock, Perspektiven-Adressen nach N5", () => {
  assert.doesNotMatch(U.stockHead({ ticker: "NVDA", name: "NVIDIA" }), /vu-stockhead__price/);
  const h = U.stockHead({ ticker: "NVDA", name: "NVIDIA", price: 204.64, currency: "USD", changePct: -4.22 }, { active: "quant" });
  assert.match(h, /204,64 \$/);
  assert.match(h, /href="\/quant\/#\/aktie\/NVDA" data-world="quant" aria-current="page"/);
  assert.equal(U.perspectiveHref("technical", "nvda"), "/technical/#/chart/NVDA");
  assert.equal(U.perspectiveHref("supertrader", "NVDA"), "/supertrader/stock/NVDA/");
  assert.equal(U.perspectiveHref("hedgefonds", "NVDA", { cusip: "67066G104" }), "/hedgefonds/#/aktie/67066G104");
  // Die aktive Perspektive steht vorn, die davor liegende links daneben (Mockup).
  const order = [...U.persp("NVDA", { active: "quant" }).matchAll(/data-world="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(order.slice(0, 2), ["fundamental", "quant"]);
  assert.equal(order.length, 7);
});

test("UI5 C06: eine Zeitleiste, Kleinformat ohne erfundene Punkte", () => {
  assert.deepEqual([...C.RANGES], ["1T", "1W", "1M", "1J", "5J", "Max"]);
  assert.equal(C.sparkline([1]), "");
  assert.equal(C.sparkline([1, NaN]), "");
  const s = C.sparkline([1, 2, 3]);
  assert.match(s, /stroke="currentColor"/);
  assert.match(s, /#c8f531/);
  assert.match(U.ranges("1J"), /aria-pressed="true">1J</);
  assert.deepEqual([...U.ranges().matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]), [...C.RANGES], "VUUI und VUChart nennen dieselbe Zeitleiste");
  assert.match(U.stockRow({ ticker: "A", chart: C.sparkline([1, 2, 3]) }), /vu-lrow__mini/);
  assert.doesNotMatch(U.stockRow({ ticker: "A" }), /vu-lrow__mini/);
});

test("UI6 Regel 1: nur Weiß, Schwarz, Neongrün und Graustufen in den Bausteinen", () => {
  const colors = new Set((css.match(/#[0-9a-f]{3,8}\b/gi) || []).map(c => c.toLowerCase()));
  const allowed = new Set(["#fff", "#ffffff", "#000", "#000000", "#c8f531", "#f4f4f4", "#e9e9e9", "#6e6e6e", "#151515", "#262626", "#9b9b9b", "#0e1013", "#4f6b00"]);
  for (const c of colors) assert.ok(allowed.has(c), `Farbe ${c} ist nicht erlaubt`);
});

test("UI7 Regel 1: keine Kursfarben Rot/Grün in den gemeinsamen Tokens", () => {
  const root = nav.slice(nav.indexOf("--vu-up"), nav.indexOf("--vu-gutter"));
  assert.doesNotMatch(root, /#1a7330|#b8281f|#5cc850|#e4382f/);
  assert.doesNotMatch(nav, /--vu-up:#5cc850|--vu-down:#ff6b5e/);
});

test("UI8 Bausteine C04–C20 liegen nicht in der Navigationsdatei", () => {
  assert.doesNotMatch(nav, /\.vu-verdict|\.vu-stockhead|\.vu-lrow|\.vu-navcard/);
  for (const k of ["vu-stockhead", "vu-persp", "vu-chg", "vu-verdict", "vu-help", "vu-lrow", "vu-tile", "vu-navcard", "vu-sect", "vu-seg", "vu-switch", "vu-sheet-ui", "vu-meter", "vu-bars", "vu-blank", "vu-pro", "vu-find"]) assert.ok(css.includes("." + k), k);
});
