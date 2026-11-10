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
  for (const c of css.match(/#[0-9a-f]{3,8}\b/gi) || []) assert.ok(["#c8f531", "#000", "#fff", "#f4f4f4", "#e9e9e9", "#6e6e6e", "#c4281c"].includes(c.toLowerCase()), c); // #c4281c: Minus-Pille im Aktienkopf (BAUKASTEN Regel 1, Ausnahme Owner 06.11.2026)
});

/* Konzept „Reihe für Reihe“, PR 5 (Folien AX01–AX05): die Aktie als Titelseite. Geprüft an der ausgelieferten NVIDIA-Datei. */
const NVDA = JSON.parse(readFileSync(new URL("../data/stocks/US_REAL/NVDA.json", import.meta.url), "utf8"));
globalThis.VUUI = require("../../assets/vu-ui.js");
globalThis.VUDiscover = globalThis.VUDiscover || {};
globalThis.VUDiscover.Einordnung = require("../engines/einordnung.js");
const OV = require("../ui/overview.js");

test("OV6 Story in drei Sätzen statt „In einem Satz“ und „Auf einen Blick“, ohne „dafür/dagegen“", () => {
  const html = OV.story(NVDA);
  assert.match(html, /Die Story in drei Sätzen/);
  assert.equal((html.match(/dv3-story-r/g) || []).length, 3, "Geschäft, Kurs, Bewertung");
  for (const l of ["Geschäft", "Kurs", "Bewertung"]) assert.match(html, new RegExp(">" + l + "<"));
  assert.match(html, /Der Kurs liegt 23\s%\sunter dem Hoch der letzten 12 Monate\./);
  assert.doesNotMatch(html, /In einem Satz|Auf einen Blick|dafür|dagegen/);
  assert.deepEqual(OV.hochUrteil(-0.23), ["weak", "Schwächer"]);
  assert.deepEqual(OV.hochUrteil(-0.02), ["strong", "Nah am Hoch"]);
  assert.equal(OV.hochUrteil(null), null);
});

test("OV7 sieben Kapitel in der Reihenfolge der Präsentation, „Stärken und Schwächen laut Kennzahlen“", () => {
  const ks = OV.kapitelListe(NVDA, "US_REAL");
  assert.deepEqual(ks.map((k) => k[0]), ["kurs", "firma", "geschaeft", "gesund", "teuer", "waage", "indizes"]);
  assert.equal(ks[5][1], "Stärken und Schwächen laut Kennzahlen");
  assert.match(ks[2][2], /^Umsatz .+ im GJ 2026$/, "Betrag über den zentralen Formatter (quant/engines/fx/money-format.js)");
  const alles = ks.map((k) => k[1] + k[2] + k[4]).join("");
  assert.doesNotMatch(alles, /Was dafür spricht|was dagegen|aria-label="dafür"|Günstiger bewertet/);
});

test("OV8 Kapitel standardmäßig zugeklappt; offene merkt sich das Gerät", () => {
  const src = readFileSync(new URL("../ui/overview.js", import.meta.url), "utf8");
  assert.match(src, /<details class="dv3-ep" data-ch="' \+ k\[0\] \+ '"' \+ \(open\.indexOf\(k\[0\]\) >= 0 \? " open" : ""\)/, "zu, außer das Gerät hat es offen gemerkt");
  assert.match(src, /vu-discover-chapters-v1/);
  assert.match(src, /addEventListener\("toggle"/);
});

test("OV9 ein Jahreswert: alle 12-Monats-Angaben der Titelseite sind derselbe Dollar-Wert, Kopf in Dollar mit Euro daneben", () => {
  const ks = OV.kapitelListe(NVDA, "US_REAL");
  const werte = new Set(((ks.map((k) => k[2] + k[4]).join(" ") + OV.story(NVDA)).match(/[−+]\d+,\d\s%(?=\sin 12 Monaten)/g) || []).map((w) => w.replace(/\s/g, " ")));
  assert.deepEqual([...werte], ["−4,4 %"]);
  const detail = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
  assert.match(detail, /var dollarKopf = state\.detail\.region !== "EUROPE"/);
  assert.match(detail, /dx-chart-hero-eur/);
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /dx-chart-hero-preis>\.down\{background:#c4281c/, "keine rote Pille");
});

test("OV10 „Weiter in …“ nur mit Herkunft aus einer Reihe (Adress-Zusatz ?reihe=)", () => {
  const orig = globalThis.location;
  globalThis.location = { hash: "#/s/US_REAL/NVDA" };
  assert.equal(OV.reiheAusAdresse(), null);
  globalThis.location = { hash: "#/s/US_REAL/NVDA?reihe=langfristige-compounder" };
  assert.equal(OV.reiheAusAdresse(), "langfristige-compounder");
  globalThis.location = { hash: "#/s/US_REAL/NVDA?reihe=<x>" };
  assert.equal(OV.reiheAusAdresse(), null);
  globalThis.location = orig;
  const src = readFileSync(new URL("../ui/overview.js", import.meta.url), "utf8");
  assert.match(src, /if \(!id \|\| !UI \|\| !R\(\)\) return;/, "ohne Herkunft keine Leiste und keine Endkarte");
});

test("OV11 Etiketten: bester Platz, Thema, Index-Gewicht, +N Reihen", () => {
  const html = OV.etiketten(NVDA, "US_REAL");
  assert.match(html, /Platz 2 · /);
  assert.match(html, /S&amp;P 500 · 6,9 %|S&P 500 · 6,9 %/);
  assert.match(html, /\+12 Reihen/);
});

test("OV12 Aktienkopf C04 wie Folie AX01 (a-top): Kurs, Tagesbewegung, Schluss und Euro rechts; Chart ohne Kursachse, Datum nur an den Enden", async () => {
  const vm = await import("node:vm");
  class N { constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.textContent = ""; } setAttribute(k, v) { this.attrs[k] = String(v); } appendChild(c) { this.children.push(c); return c; } }
  const context = vm.createContext({ document: { createElementNS: (_ns, tag) => new N(tag) } });
  context.window = context;
  vm.runInContext(readFileSync(new URL("../ui/microchart.js", import.meta.url), "utf8"), context);
  const pts = [["2025-11-05", 190], ["2026-03-01", 170], ["2026-08-01", 230], ["2026-11-06", 186.64]];
  const svg = context.VUDiscover.MicroChart.renderRange(pts, { width: 358, height: 176, range: "1Y", compact: true });
  const texts = (cls) => svg.children.filter((c) => c.tag === "text" && (c.attrs.class || "").split(" ").includes(cls)).map((c) => c.textContent);
  assert.deepEqual(texts("dx-range-axis"), [], "keine Kursachse");
  assert.deepEqual(texts("dx-range-date"), ["05.11.25", "06.11.26"]);
  const voll = context.VUDiscover.MicroChart.renderRange(pts, { width: 358, height: 176, range: "1Y" });
  assert.ok(voll.children.some((c) => (c.attrs.class || "").includes("dx-range-axis")), "ohne compact bleibt die Kursachse");
  const detail = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
  assert.match(detail, /dx-chart-hero dx-chart-hero--c04/);
  assert.match(detail, /compact: !!dollarKopf/);
  assert.match(detail, /title: "zum Vortagesschluss"/, "die Pille ist die Tagesbewegung");
  const css = readFileSync(new URL("../ui/overview.css", import.meta.url), "utf8");
  assert.match(css, /dx-chart-hero--c04 \.dx-chart-hero-preis>b\{font-size:34px/);
  assert.match(css, /vu-shead-watch\{display:none\}/, "ein Merken-Knopf im Kopf (Herz), kein zweites Lesezeichen");
});

test("OV13 Überblick startet mit 1J wie im Mockup (auch bei offener Börse); 1T trägt denselben Kopf C04 in Dollar", () => {
  const detail = readFileSync(new URL("../ui/detail.js", import.meta.url), "utf8");
  assert.match(detail, /if \(state\.intraday && !\(loaded && ueberblickUS\(state\)\)\) state\.range = "1D";/);
  assert.match(detail, /ueberblickUS\(state\) && leiste\.some\(function \(r\) \{ return r\.id === "1Y" && r\.available; \}\)\) \{\s*state\.rangeStarted = true; state\.range = "1Y";/);
  const intraday = detail.slice(detail.indexOf("function zeichneIntraday"), detail.indexOf("function staleSatzAusZustand") > 0 ? detail.indexOf("function staleSatzAusZustand") : undefined);
  assert.match(intraday, /dx-chart-hero dx-chart-hero--c04", "data-range": "1D"/);
  assert.match(intraday, /umgerechnet = \{ snap: snapNativ, waehrung: "USD" \}/, "1T im Überblick in Dollar");
});
