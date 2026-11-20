/* Core · Kurschart des VU3 UI-Systems (assets/vu-chart.js): echte Punkte, Startlinie, Richtung, keine erfundenen Werte. */
import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C = require(join(ROOT, "assets", "vu-chart.js"));

test("Geometrie · Richtung gegen die Startlinie, Achsen aus den Punkten", () => {
  const pts = [["2026-10-01", 100], ["2026-10-02", 90], ["2026-10-03", 120]];
  const g = C.geometry(pts, { width: 600, height: 240 });
  assert.equal(g.direction, "up");
  assert.equal(g.pts.length, 3);
  assert.equal(g.hi, 120); assert.equal(g.lo, 90);
  assert.equal(g.yTicks.at(-1).v, 120, "letzter Kurs auf der Achse");
  assert.equal(g.intraday, false);
  /* Vortagesschluss als Startlinie (Intraday). */
  const d = C.geometry([["2026-10-21T09:30:00Z", 197], ["2026-10-21T10:30:00Z", 195]], { base: 192.6 });
  assert.equal(d.direction, "up");
  assert.equal(d.intraday, true);
  assert.ok(d.lo <= 192.6, "Startlinie liegt im Bild");
});

test("Geometrie · ungueltige Punkte werden verworfen, nie ersetzt", () => {
  assert.equal(C.geometry([["2026-10-01", 1]]), null);
  assert.equal(C.geometry([["x", 1], ["2026-10-01", NaN], ["2026-10-02", 3]]), null);
  const g = C.geometry([["2026-10-01", 1], ["2026-10-02", null], ["2026-10-03", 2]]);
  assert.equal(g.pts.length, 2);
});

test("Format · Kurs mit Waehrungszeichen wie Discover", () => {
  assert.equal(C.money(197.61, "USD"), "197,61 $");
  assert.equal(C.money(1234.5, "EUR"), "1.235 €");
});

test("Kursmarken · liegen im Bild und behalten ihren Wert", () => {
  const g = C.geometry([["2026-10-01", 100], ["2026-10-02", 110]], { levels: [{ value: 90, label: "Stop", tone: "bad" }, { value: 120, label: "Ziel" }, { value: NaN }] });
  assert.equal(g.levels.length, 2);
  assert.equal(g.lo, 90); assert.equal(g.hi, 120);
  assert.ok(g.levels[0].y > g.levels[1].y, "Stop unter Ziel");
});

test("Achse · letzter Kurs nah am Hoch: nur eine Zahl, kein Uebereinanderdruck", () => {
  /* Kleinstes SVG-DOM fuer render(): Knoten mit Attributen, Kindern und Text. */
  const node = (name) => ({ name, attrs: {}, children: [], textContent: "", setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, appendChild(c) { this.children.push(c); return c; } });
  const prev = globalThis.document;
  globalThis.document = { createElementNS: (_, name) => node(name) };
  try {
    const svg = C.render([["2026-10-01", 100], ["2026-10-02", 199.83], ["2026-10-03", 199.39]], { width: 600, height: 220 });
    const labels = svg.children.filter((c) => c.name === "text" && c.attrs["text-anchor"] === undefined).map((c) => c.textContent);
    assert.deepEqual(labels.sort(), ["100,00", "199,39"], "letzter Kurs bleibt, das Hoch daneben entfaellt");
  } finally { globalThis.document = prev; }
});

test("Geometrie · extent haelt eigene Marken im Bild, ohne sie zu zeichnen", () => {
  const pts = [["2026-10-22T09:30", 88], ["2026-10-22T15:55", 87.6]];
  const g = C.geometry(pts, { extent: [99.79, 73.32, NaN] });
  assert.equal(g.hi, 99.79); assert.equal(g.lo, 73.32);
  assert.equal(g.levels.length, 0, "extent zeichnet keine Linie");
  assert.equal(C.geometry(pts, {}).hi, 88, "ohne extent unveraendert");
});

test("Chart-Baustein: feste Hauptleiste und x-Marken ohne Überlappung (Owner 13.11.2026)", () => {
  assert.deepEqual(C.RANGES.slice(), ["1T", "1W", "1M", "6M", "1J", "3J", "5J", "Max"]);
  const ids = ["MAX", "3M", "1Y", "1T", "5T", "6M", "3Y", "5Y", "1M", "YTD"].sort((a, b) => C.rangeRank(a) - C.rangeRank(b));
  assert.deepEqual(ids.map(C.canonRange).slice(0, 8), ["1T", "1W", "1M", "6M", "1J", "3J", "5J", "Max"]);
  assert.deepEqual(ids.slice(8), ["3M", "YTD"]);
  // Intraday kurz nach der Eröffnung: 09:30, 10:00, 10:40 dürfen nicht übereinander stehen.
  const pts = []; for (let m = 0; m <= 70; m += 5) { const t = 570 + m; pts.push(["2026-11-13T" + String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0") + ":00", 100 + m / 10]); }
  const g = C.geometry(pts, { width: 360, height: 180, sessionEnd: "2026-11-13T16:00:00" });
  for (let i = 1; i < g.xTicks.length; i++) assert.ok(g.xTicks[i].x - g.xTicks[i - 1].x >= 44);
});

/* App-Konzept 2 (Owner 14.11.2026: große Charts, den Platz nutzen): eine Höhenregel für den Aktienchart aller Welten.
   Bis dahin stand die Fläche fest bei 180 px (Telefon) und 300 px (breit) in quant/app/chart.js. */
test("Aktienchart · Höhe folgt der Bildschirmhöhe, nie kleiner als bisher (180/300), eine Regel für alle Welten", () => {
  assert.equal(C.stockHeight(390, 844), 300, "Telefon 390×844: deutlich höher als die früheren 180 px");
  assert.equal(C.stockHeight(390, 664), 236);
  assert.equal(C.stockHeight(320, 568), 202);
  assert.equal(C.stockHeight(430, 932), 300, "Obergrenze Telefon");
  assert.equal(C.stockHeight(1440, 900, 1200), 360);
  assert.equal(C.stockHeight(1920, 1080, 1200), 400, "Obergrenze breit");
  assert.equal(C.stockHeight(1440, 900, 423), 300, "in einer Spalte (Technical breit) bleibt es bei 300");
  assert.equal(C.stockHeight(1440, 900), 300, "Breite der Fläche unbekannt (vor dem Einhängen): Grundhöhe");
  assert.equal(C.stockHeight(768, 1024, 720), 300);
  /* Ohne Bildschirmhöhe (Tests ohne Browser) die bisherigen Werte. */
  assert.equal(C.stockHeight(390), 180); assert.equal(C.stockHeight(1440), 300); assert.equal(C.stockHeight(), 300);
  /* Chart, Zeile darüber (~40 px) und Zeitraumleiste (~60 px) passen auf dem Telefon zwischen Kopf mit Reitern (104 px) und Dock (~80 px). */
  for (let vh = 480; vh <= 1000; vh += 4) for (const vw of [320, 360, 390, 430]) {
    const h = C.stockHeight(vw, vh);
    assert.ok(h >= 180 && h <= 300, vw + "×" + vh + ": " + h);
    if (vh >= 560) assert.ok(h + 100 <= vh - 104 - 80, vw + "×" + vh + ": Chart mit Leiste (" + (h + 100) + ") passt nicht in " + (vh - 184));
    assert.ok(C.stockHeight(vw, vh + 4) >= h, "wächst mit der Bildschirmhöhe");
  }
  for (let vh = 400; vh <= 1600; vh += 50) for (const pw of [undefined, 300, 423, 720, 899, 900, 1200]) { const h = C.stockHeight(1280, vh, pw); assert.ok(h >= 300 && h <= 400 && (pw >= 900 || h === 300), vh + "/" + pw + ": " + h); }
  /* quant/app/chart.js nimmt die Regel und behält die früheren Werte nur als Rückfall ohne den Baustein. */
  const chart = require("node:fs").readFileSync(join(ROOT, "quant/app/chart.js"), "utf8");
  assert.match(chart, /if \(!mobile\(\)\) return VC\.stockHeight\(w, global\.innerHeight, reserve \? undefined : width\(\)\);/);
  assert.match(chart, /sized = \{ w: w, h: VC\.stockHeight\(w, global\.innerHeight\) \}/, "Telefon: je Bildschirmbreite einmal, die Adressleiste ändert die Höhe nicht");
  /* Technical reserviert die Endhöhe des Charts, bevor er eingesetzt wird: dieselbe Regel, damit darunter nichts rutscht. */
  const tcss = require("node:fs").readFileSync(join(ROOT, "technical/technical.css"), "utf8");
  assert.match(tcss, /\.tc-chart-host\.tc-simple-chart\{min-height:calc\(142px \+ clamp\(180px,35\.5vh,300px\)\);min-height:calc\(142px \+ clamp\(180px,35\.5svh,300px\)\)\}/);
  assert.match(tcss, /@media\(min-width:768px\)\{\.tc-chart-host\.tc-simple-chart\{min-height:442px\}\}/);
  assert.match(chart, /if \(!VC \|\| !VC\.stockHeight\) return mobile\(\) \? 180 : 300;/);
});
