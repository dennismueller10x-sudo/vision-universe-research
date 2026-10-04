/* Core · Golden Paths ueber den echten Repository-Stand.

   Discover:    Universum -> Ranking (Startseite) -> Karte -> Aktienseite -> Chart
   Supertrader: Kursreihe -> Strategie -> Signal -> Ausgabe -> Chartpfad
   Alle Produkte muessen dieselbe Identitaet und denselben Kurs zeigen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Client = require(join(ROOT, "core", "client.js"));
const Identity = require(join(ROOT, "core", "identity.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel.replace(/^\//, "")), "utf8"));
const repo = async (p) => { const f = join(ROOT, p.replace(/^\//, "")); if (!existsSync(f)) throw new Error("fehlt: " + p); return json(p); };
const c = Client.create({ load: repo });

test("Discover · jede Karte der Startseite fuehrt zu einer Aktienseite mit demselben Kurs und einer Reihe", async () => {
  const home = json("discover/data/home/US_REAL.json");
  const karten = [];
  for (const s of home.surfaces || []) for (const k of s.cards || []) karten.push(k);
  assert.ok(karten.length >= 5, "Startseite ohne Karten");
  const fehler = [];
  for (const k of karten) {
    const page = await c.stockPage(k.symbol);
    if (!page.ok) { fehler.push(k.symbol + ": Aktienseite fehlt"); continue; }
    const px = await c.getLatestPrice(k.symbol);
    if (px.state !== "AVAILABLE") { fehler.push(k.symbol + ": keine Reihe"); continue; }
    if (k.price && typeof k.price.value === "number" && k.price.value !== px.data.close) fehler.push(k.symbol + ": Karte " + k.price.value + " / Reihe " + px.data.close);
    if (page.data.price.value !== px.data.close) fehler.push(k.symbol + ": Seite " + page.data.price.value + " / Reihe " + px.data.close);
    if (k.priceSeries && k.priceSeries.path && !existsSync(join(ROOT, k.priceSeries.path.slice(1)))) fehler.push(k.symbol + ": Chartpfad " + k.priceSeries.path);
  }
  assert.deepEqual(fehler, []);
});

test("Discover · Rangfolge-Universum und Aktienindex stammen aus demselben Stand", () => {
  const meta = json("discover/data/meta.json"), home = json("discover/data/home/US_REAL.json");
  const u = meta.universes.find((x) => x.universeId === "US_REAL");
  assert.equal(home.asOf, u.asOf, "Startseite und Universum aus verschiedenen Laeufen");
  assert.equal(json("discover/data/stock-index/US_REAL.json").count, u.securities);
});

test("Supertrader · jedes Signal gehoert zu einem Titel mit Discover-Seite und kanonischer Reihe", async () => {
  const sig = json("supertrader/data/signals.json");
  const index = new Set(json("discover/data/stock-index/US_REAL.json").symbols);
  const symbole = Object.keys(sig.bySymbol || {});
  assert.ok(symbole.length > 50);
  /* Drei Faelle (Owner-Regel 04.10.2026, LOGI):
     - Signal + Discover-Seite                                  -> PASS
     - Signal + im Build ausgewiesen (discoverAvailability)     -> PASS mit bewusstem Fallback
       (die Seite zeigt dann einen Hinweis statt des Links)
     - Signal ohne Seite und ohne Ausweis (toter Link)          -> FAIL */
  const ausgewiesen = new Set((sig.discoverAvailability && sig.discoverAvailability.unavailable) || []);
  const fehler = [];
  for (const t of symbole) {
    if (!index.has(t)) {
      if (!ausgewiesen.has(t)) fehler.push(t + ": nicht im Discover-Universum und nicht als discoverAvailability.unavailable ausgewiesen (toter Link)");
      continue;
    }
    if (ausgewiesen.has(t)) { fehler.push(t + ": als nicht verfuegbar ausgewiesen, hat aber eine Discover-Seite (veralteter Ausweis)"); continue; }
    const px = await c.getLatestPrice(t);
    if (px.state !== "AVAILABLE") fehler.push(t + ": keine kanonische Tagesreihe");
  }
  if (ausgewiesen.size) {
    // Ein Ausweis ohne Behandlung auf der Seite waere wieder ein toter Link.
    const seite = readFileSync(new URL("../../supertrader/assets/supertrader.js", import.meta.url), "utf8");
    if (!/function discoverLink\(sym, sig, label\)/.test(seite) || !/data-discover': 'unavailable'/.test(seite))
      fehler.push("discoverAvailability ausgewiesen, aber supertrader.js zeigt keinen Hinweis statt des Links");
  }
  assert.deepEqual(fehler, []);
  assert.equal(sig.asOf, json("supertrader/data/build.json").asOf);
});

test("Supertrader · Signal-Stand liegt nicht vor dem Kursstand der Plattform zurueck (hoechstens eine Sitzung)", () => {
  const st = json("supertrader/data/build.json").asOf;
  const eod = json("quant/data/market/factors/factors-FULL_UNIVERSE-summary.json").benchmark.newestSecurityDate;
  assert.ok(st <= eod, "Supertrader vor den Kursen?");
  const d = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  assert.ok(d(st, eod) <= 4, "Supertrader " + st + " vs Kurse " + eod);
});
