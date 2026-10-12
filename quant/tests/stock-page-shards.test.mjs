/* Aktienseite ohne Universumsdatei (Payload-Audit 12.10.2026): die Seite
   lud die ganze Kapazitaetsdatei (1,24 MB, 6.686 Mitglieder), brauchte
   aber ein Mitglied. Der Release-Build schreibt deshalb je Master.shardKey
   einen Kapazitaets-Ausschnitt (scripts/vu2/build-release.mjs). Nachweis
   hier: die API liefert mit den Ausschnitten DASSELBE wie mit der vollen
   Datei, und ohne Ausschnitt (lokal, alter Stand) faellt sie auf die volle
   Datei zurueck. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { capabilityShards, CAPABILITY_SHARD_BUDGET } from "../../scripts/vu2/build-release.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Master = require(join(ROOT, "quant/engines/company-master.js"));
const Identity = require(join(ROOT, "core/identity.js"));

const CAPABILITY = "quant/data/universe/market-capability.json";
const capability = JSON.parse(readFileSync(join(ROOT, CAPABILITY), "utf8"));
const capShards = capabilityShards(capability);
/* withShards: die Release-Ausschnitte existieren. Ohne: 404 wie lokal. */
function api(withShards) {
  const loads = [];
  const s = Service.create({
    loadJSON: async (p) => {
      loads.push(p);
      const m = p.match(/^\/quant\/data\/universe\/capability-shards\/([A-Z0-9_]{1,2})\.json$/);
      if (m) { if (!withShards || !capShards[m[1]]) throw new Error("404"); return JSON.parse(JSON.stringify(capShards[m[1]])); }
      return JSON.parse(readFileSync(join(ROOT, p.slice(1)), "utf8"));
    },
    loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p.slice(1)))).toString("utf8")),
    displayPolicy: Policy, queryEngine: Query
  });
  s.loads = loads;
  return s;
}

/* Zeitpunkte des Aufrufs, keine Datenstaende (wie factor-product-projection.test.mjs). */
const vergleichbar = (x) => {
  const o = JSON.parse(JSON.stringify(x));
  if (o && o.health) delete o.health.asOf;
  if (o && o.setupState) for (const k of ["observedAt", "setupStateId", "contentHash"]) delete o.setupState[k];
  return o;
};

const TICKERS = ["NVDA", "AAPL", "BRK-B", "MOG-A", "ABR-P-D", "A", "F", "CORT", "COOL"];

test("Kapazitaets-Ausschnitte: jedes Mitglied genau einmal, unveraendert, in Reihenfolge, klein", () => {
  const n = Object.values(capShards).reduce((k, s) => k + s.members.length, 0);
  assert.equal(n, capability.members.length);
  for (const [key, part] of Object.entries(capShards)) {
    assert.equal(part.shard, key);
    assert.equal(part.version, capability.version);
    assert.equal(part.generatedAt, capability.generatedAt);
    assert.deepEqual(part.members, capability.members.filter((m) => Master.shardKey(m.s) === key));
    /* Derselbe Schluessel wie core/identity.js (ADR-001). */
    for (const m of part.members) assert.equal(Identity.shardKey(m.s), key, m.s);
  }
  const max = Math.max(...Object.values(capShards).map((s) => Buffer.byteLength(JSON.stringify(s))));
  assert.ok(max <= CAPABILITY_SHARD_BUDGET, "groesster Ausschnitt " + max);
});

test("memberFor: dieselben Antworten wie die volle Kapazitaetsdatei, ohne sie zu laden", async () => {
  for (const t of TICKERS) {
    const mit = api(true), ohne = api(false);
    for (const call of [
      (s) => s.getStockIntelligence(t),
      (s) => s.getTechnicalIntelligence(t),
      (s) => s.getTechnicalWorkspace(t),
      (s) => s.getQuantWorkspace(t),
      (s) => s.getHistoricalFundamentals(t)
    ]) {
      assert.deepEqual(vergleichbar(await call(mit)), vergleichbar(await call(ohne)), t);
    }
    assert.ok(mit.loads.includes("/quant/data/universe/capability-shards/" + Identity.shardKey(t) + ".json"), t + ": laedt seinen Ausschnitt");
    assert.ok(!mit.loads.includes("/" + CAPABILITY), t + ": keine Universumsdatei");
    /* Fallback: ohne Ausschnitt die volle Datei, wie bisher. */
    assert.ok(ohne.loads.includes("/" + CAPABILITY), t + ": ohne Ausschnitt die volle Datei");
  }
});

test("memberFor: nach der Liste gilt das geladene Universum", async () => {
  const s = api(true);
  await s.getUniverse();
  const vorher = s.loads.length;
  const a = await s.getStockIntelligence("NVDA");
  assert.ok(!s.loads.slice(vorher).some((p) => p.includes("capability-shards/")), "kein Ausschnitt mehr noetig");
  assert.deepEqual(vergleichbar(a), vergleichbar(await api(false).getStockIntelligence("NVDA")));
});
