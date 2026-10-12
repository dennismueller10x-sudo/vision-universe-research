/* Startseite "Heute bei Vision Universe": die Kurslinie der drei Markt-
   Kacheln kommt aus history.recent des Snapshots statt aus der vollen
   Reihe (180-220 KB je Markt). Belegt wird, dass das DIESELBEN Punkte
   sind - am Vertrag (quant/api/multi-asset-contract.js) und an den
   ausgelieferten Dateien - und dass die gezeichnete Linie gleich bleibt. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Contract = require("../../quant/api/multi-asset-contract.js");
const Catalog = require("../../quant/engines/multi-asset/instrument-catalog.js");
const config = require("../../quant/config/multi-asset.json");
const calendar = require("../../quant/config/market-calendar.json");

/* Ein minimales SVG-DOM: genug fuer miniLine(). */
function load() {
  const make = (tag) => ({ tag, attrs: {}, children: [], classes: [],
    setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { this.children.push(c); return c; },
    get classList() { const self = this; return { add: (c) => self.classes.push(c) }; } });
  const ctx = { document: { createElementNS: (_ns, tag) => make(tag) }, Math, Number, Array, Object, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(root, "discover", "ui", "home-market.js"), "utf8"), ctx);
  return ctx.VUDiscover.HomeMarket;
}
const H = load();
/* Objekte aus dem vm-Kontext haben einen anderen Prototyp: verglichen wird der Inhalt. */
const plain = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const linie = (points) => { const svg = H.miniLine(points); return svg ? svg.children[0].attrs.d : null; };

const NOW = "2026-09-24T14:00:00Z";
const resolved = Object.fromEntries(Catalog.resolved().map((i) => [i.symbol, i]));
function reihe(n) {
  const start = Date.UTC(2020, 0, 1);
  return Array.from({ length: n }, (_, i) => [new Date(start + i * 86400000).toISOString().slice(0, 10), Number((400 + Math.sin(i / 7) * 20 + i * 0.1).toFixed(2))]);
}
const build = (sym, points) => Contract.build({
  instrument: resolved[sym], source: config.sourceRegistry[resolved[sym].source] || null,
  series: { points, frequency: "DAILY" }, now: NOW, calendar, config,
  historyPath: "/quant/data/market/multi-asset/series/" + sym + ".json" });

test("Vertrag: history.recent.slice(-30) ist series.points.slice(-30), derselbe Pfad wie der Tracker", () => {
  for (const sym of ["QQQ", "SPY", "DIA"]) {
    const points = reihe(8000);
    const c = build(sym, points);
    assert.ok(c.tracker && c.tracker.history, sym + ": Tracker-Historie fehlt");
    assert.equal(c.history.path, c.tracker.history.path);
    assert.ok(c.history.recent.length >= 30);
    assert.deepEqual(c.history.recent.slice(-30), points.slice(-30));
    assert.equal(H.sparkSource(c).points, c.history.recent);
    assert.equal(linie(H.sparkSource(c).points), linie(points), sym + ": gezeichnete Linie weicht ab");
  }
});

test("Quelle der Kurslinie: Snapshot nur mit Beleg, sonst die volle Reihe, ohne Reihe keine Linie", () => {
  const path = "/quant/data/market/multi-asset/series/QQQ.json";
  const recent = reihe(66);
  assert.equal(H.sparkSource({ history: { path, recent }, tracker: { history: { path } } }).points, recent);
  // zu wenige Punkte im Snapshot -> nachladen
  assert.deepEqual(plain(H.sparkSource({ history: { path, recent: recent.slice(-29) }, tracker: { history: { path } } })), { path });
  // anderer Pfad -> andere Reihe, nachladen
  assert.deepEqual(plain(H.sparkSource({ history: { path: "/x.json", recent }, tracker: { history: { path } } })), { path });
  // kein recent
  assert.deepEqual(plain(H.sparkSource({ history: { path }, tracker: { history: { path } } })), { path });
  // ohne Tracker-Reihe gab es nie eine Linie
  assert.equal(H.sparkSource({ history: { path, recent }, tracker: { history: null } }), null);
  assert.equal(H.sparkSource({ history: { path, recent } }), null);
});

test("Ausgelieferte Daten: Snapshot und Reihen von QQQ/SPY/DIA zeichnen dieselbe Linie", (t) => {
  const file = join(root, "quant", "data", "market", "multi-asset", "snapshot.json");
  if (!existsSync(file)) { t.skip("kein Snapshot im Arbeitsbaum"); return; }
  const snap = JSON.parse(readFileSync(file, "utf8"));
  let geprueft = 0;
  for (const sym of ["QQQ", "SPY", "DIA"]) {
    const raw = (snap.instruments || []).find((c) => c.instrument && c.instrument.symbol === sym);
    if (!raw || !raw.tracker || !raw.tracker.history || !raw.tracker.history.path) continue;
    const seriesFile = join(root, raw.tracker.history.path.replace(/^\//, ""));
    if (!existsSync(seriesFile)) continue;
    const series = JSON.parse(readFileSync(seriesFile, "utf8"));
    const source = H.sparkSource(raw);
    assert.ok(source && source.points, sym + ": Snapshot belegt die Linie nicht");
    assert.deepEqual(source.points.slice(-30), series.points.slice(-30), sym + ": Snapshot und Reihe weichen ab");
    assert.equal(linie(source.points), linie(series.points));
    geprueft++;
  }
  if (!geprueft) t.skip("keine Markt-Tracker im Snapshot");
});
