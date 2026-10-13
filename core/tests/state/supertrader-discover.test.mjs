/* Core · Zustandstests (Querverträge über erzeugte Daten zweier Produkte).

   Diese Tests prüfen NICHT Code, sondern ob die committeten Erzeugnisse
   zweier unabhängiger Produkte zueinander passen:

     Supertrader-Signale (supertrader/data, Erzeuger: supertrader-signals.yml)
        gegen
     Discover-Universum (discover/data/stock-index, Erzeuger: Marktdaten-Refresh)

   Ein Signal ohne Discover-Seite wäre ein toter Link auf der Supertrader-
   Seite (Owner-Regel 04.10.2026, LOGI). Die Verbindlichkeit bleibt: auf main,
   im täglichen Zeitplan (core-ci.yml, Job `live`) und in jedem PR, der
   Supertrader, das Discover-Universum oder den Core berührt.

   Warum nicht in core/tests/*.test.mjs: dort blockiert jeder rote Test jeden PR.
   Die beiden Erzeuger laufen aber unabhängig (GitHub-Zeitplan, im Schnitt
   Stunden verspätet); nach einer Universumsänderung des Nachtlaufs steht der
   Supertrader-Stand bis zu seinem eigenen Lauf auf dem Vortag. Dieser
   Zustand ist ein Datenbefund, kein Fehler des PR. Entscheidung und Regeln:
   scripts/ci/state-gate.mjs und core/tests/state/manifest.json.

   Die Assertions sind unverändert aus golden-paths.test.mjs übernommen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Client = require(join(ROOT, "core", "client.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel.replace(/^\//, "")), "utf8"));
const repo = async (p) => { const f = join(ROOT, p.replace(/^\//, "")); if (!existsSync(f)) throw new Error("fehlt: " + p); return json(p); };
const c = Client.create({ load: repo });

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
    const seite = readFileSync(new URL("../../../supertrader/assets/supertrader.js", import.meta.url), "utf8");
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
