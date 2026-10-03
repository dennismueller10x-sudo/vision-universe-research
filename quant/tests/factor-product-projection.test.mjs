/* Produktprojektion der Faktordatei (Payload-Audit 03.10.2026: die Quant-
   Ansichten luden 19,2 MB). Nachweis: die API liefert mit der Projektion
   dieselben Zeilen wie mit der vollen Datei - bis auf fieldStatus, das nur
   noch die gezeigten Felder beschreibt. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Projection = require(join(ROOT, "quant/engines/factor-product-projection.js"));
const FULL = "quant/data/market/factors/factors-FULL_UNIVERSE.json";
const full = JSON.parse(readFileSync(join(ROOT, FULL), "utf8"));
const projected = Projection.project(full);
const Master = require(join(ROOT, "quant/engines/company-master.js"));
const shards = Projection.shards(projected, Master.shardKey);

function api(withProjection) {
  const loads = [];
  const s = Service.create({
    loadJSON: async (p) => {
      loads.push(p);
      if (p.endsWith("factors-FULL_UNIVERSE-product.json")) { if (!withProjection) throw new Error("404"); return projected; }
      const m = p.match(/product-shards\/([A-Z0-9_]{1,2})\.json$/);
      if (m) { if (!withProjection || !shards[m[1]]) throw new Error("404"); return shards[m[1]]; }
      return JSON.parse(readFileSync(join(ROOT, p), "utf8"));
    },
    loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8")),
    displayPolicy: Policy, queryEngine: Query
  });
  s.loads = loads;
  return s;
}
const ohneFieldStatus = (rows) => JSON.parse(JSON.stringify(rows, (k, v) => (k === "fieldStatus" ? undefined : v)));
/* Zeitpunkte des Aufrufs, keine Datenstaende: health.asOf und die daraus
   gebildete Setup-Beobachtung (observedAt, setupStateId, contentHash) -
   zwei Direktaufrufe hintereinander unterscheiden sich schon darin. */
const vergleichbar = (x) => {
  const o = ohneFieldStatus(x);
  if (o && o.health) delete o.health.asOf;
  if (o && o.setupState) for (const k of ["observedAt", "setupStateId", "contentHash"]) delete o.setupState[k];
  return o;
};

test("getUniverse: mit Projektion dieselben Zeilen wie mit der vollen Datei", async () => {
  const a = await api(false).getUniverse(), b = await api(true).getUniverse();
  assert.equal(a.state, "AVAILABLE");
  assert.ok(a.stocks.length > 5000);
  assert.deepEqual(ohneFieldStatus(b), ohneFieldStatus(a));
});

test("Projektion: nur die gelesenen Felder, deutlich kleiner", () => {
  const size = (x) => Buffer.byteLength(JSON.stringify(x));
  assert.ok(size(projected) < size(full) * 0.25, `${size(projected)} gegen ${size(full)}`);
  const row = projected.securities.find((s) => s.values && s.values.returns);
  assert.deepEqual(Object.keys(row.values.returns).sort(), ["12M", "6M"]);
  assert.equal(projected.projection.version, Projection.VERSION);
  assert.equal(projected.securities.length, full.securities.length);
});

test("Aktienseite: Direktaufruf ueber den Shard == Aufruf nach der Liste, ohne die Universumsdatei", async () => {
  for (const t of ["CORT", "AAPL", "BRK-B", "MOG-A"]) {
    const direkt = api(true);
    const a = await direkt.getStockIntelligence(t);
    assert.ok(direkt.loads.some((p) => /product-shards\//.test(p)), t + ": Direktaufruf laedt seinen Shard");
    assert.ok(!direkt.loads.some((p) => /factors-FULL_UNIVERSE(-product)?\.json$/.test(p)), t + ": keine Universumsdatei");
    const ueberListe = api(true);
    await ueberListe.getUniverse();
    const b = await ueberListe.getStockIntelligence(t);
    assert.deepEqual(vergleichbar(a), vergleichbar(b), t);
  }
});

test("Shards: jede Zeile genau einmal, klein", () => {
  const n = Object.values(shards).reduce((k, s) => k + s.securities.length, 0);
  assert.equal(n, projected.securities.filter((s) => s.ticker).length);
  const max = Math.max(...Object.values(shards).map((s) => Buffer.byteLength(JSON.stringify(s))));
  assert.ok(max < 256 * 1024, "groesster Shard " + max);
});
