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
