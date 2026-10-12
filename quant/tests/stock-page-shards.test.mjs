/* Aktienseite ohne Universumsdateien (Payload-Audit 12.10.2026): die Seite
   lud die ganze Kapazitaetsdatei (1,24 MB, 6.686 Mitglieder) und den ganzen
   Technik-Shard (NV: 673 KB gzip, 15 Titel), brauchte aber ein Mitglied und
   einen Titel. Der Release-Build schreibt deshalb je Master.shardKey einen
   Kapazitaets-Ausschnitt und je securityId einen Technik-Ausschnitt
   (scripts/vu2/build-release.mjs). Nachweis hier: die API liefert mit den
   Ausschnitten DASSELBE wie mit den vollen Dateien, und ohne Ausschnitt
   (lokal, alter Stand) faellt sie auf die vollen Dateien zurueck. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { capabilityShards, technicalTickerSlices, CAPABILITY_SHARD_BUDGET } from "../../scripts/vu2/build-release.mjs";

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
const TECH_DIR = "quant/data/product/technical-signals-v1/";
const techShard = (key) => JSON.parse(gunzipSync(readFileSync(join(ROOT, TECH_DIR + key + ".json.gz"))).toString("utf8"));
const sliceCache = new Map();
function techSlices(key) {
  if (!sliceCache.has(key)) sliceCache.set(key, technicalTickerSlices(techShard(key), key));
  return sliceCache.get(key);
}

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
    loadCompressedJSON: async (p) => {
      loads.push(p);
      const m = p.match(/^\/quant\/data\/product\/technical-signals-v1\/ticker\/(ref_[A-Z0-9_]+)\.json\.gz$/);
      if (m) {
        if (!withShards) throw new Error("404");
        for (const key of readdirSync(join(ROOT, TECH_DIR)).filter((n) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(n)).map((n) => n.slice(0, 2))) {
          const hit = techSlices(key)[p.slice(1)];
          if (hit) return JSON.parse(JSON.stringify(hit));
        }
        throw new Error("404");
      }
      return JSON.parse(gunzipSync(readFileSync(join(ROOT, p.slice(1)))).toString("utf8"));
    },
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

test("Technik-Ausschnitt: genau der Shard-Eintrag des Titels mit den Kopffeldern", () => {
  for (const t of TICKERS) {
    const key = Service.technicalShard(t), shard = techShard(key);
    const slice = techSlices(key)[Service.technicalTickerPath(t).slice(1)];
    assert.ok(slice, t + ": Ausschnitt geschrieben");
    assert.equal(slice.ticker, t);
    for (const h of Object.keys(shard)) if (h !== "instruments" && h !== "unavailable") assert.deepEqual(slice[h], shard[h], t + ": " + h);
    assert.deepEqual(slice.instruments, t in shard.instruments ? { [t]: shard.instruments[t] } : {}, t);
    if ("unavailable" in shard) assert.deepEqual(slice.unavailable, t in shard.unavailable ? { [t]: shard.unavailable[t] } : {}, t);
  }
});

test("Technik: Ausschnitt statt Shard, gleiche Antwort; ohne Ausschnitt der Shard", async () => {
  for (const t of TICKERS) {
    const mit = api(true), ohne = api(false), shardPath = "/" + TECH_DIR + Service.technicalShard(t) + ".json.gz";
    assert.deepEqual(vergleichbar(await mit.getTechnicalIntelligence(t)), vergleichbar(await ohne.getTechnicalIntelligence(t)), t);
    assert.deepEqual(vergleichbar(await mit.getTechnicalWorkspace(t)), vergleichbar(await ohne.getTechnicalWorkspace(t)), t);
    assert.ok(mit.loads.includes(Service.technicalTickerPath(t)), t + ": laedt seinen Ausschnitt");
    assert.ok(!mit.loads.includes(shardPath), t + ": nicht den ganzen Shard");
    assert.ok(ohne.loads.includes(shardPath), t + ": ohne Ausschnitt der Shard");
  }
  /* COOL hat kein Bundle, aber einen Grund - der kommt aus dem Ausschnitt. */
  const cool = await api(true).getTechnicalIntelligence("COOL");
  assert.equal(cool.state, "UNAVAILABLE");
  assert.ok(cool.unavailability && cool.unavailability.reason);
});

test("Technik-Ausschnitt: kein Ausschnitt bei Kollision der securityId oder fremdem Shard", () => {
  const shard = { schemaVersion: "technical-product-artifact-1.0.0", shard: "BR", generatedAt: "x", unavailableSchemaVersion: "technical-unavailable-1.1.0",
    instruments: { "BRK.B": { a: 1 }, "BRK-B": { a: 2 }, BRX: { a: 3 }, NVDA: { a: 4 } }, unavailable: { BRZ: { reason: "R" } } };
  const out = technicalTickerSlices(shard, "BR");
  assert.deepEqual(Object.keys(out).sort(), [TECH_DIR + "ticker/ref_BRX.json.gz", TECH_DIR + "ticker/ref_BRZ.json.gz"]);
  assert.deepEqual(out[TECH_DIR + "ticker/ref_BRZ.json.gz"].instruments, {});
  assert.deepEqual(out[TECH_DIR + "ticker/ref_BRZ.json.gz"].unavailable, { BRZ: { reason: "R" } });
  assert.deepEqual(technicalTickerSlices(shard, "NV"), {}, "Kopf passt nicht zum Dateinamen");
});

test("Technik: ein fremder oder kaputter Ausschnitt wird nicht geglaubt, der Shard gilt", async () => {
  const echt = await api(false).getTechnicalIntelligence("NVDA");
  for (const falsch of [{ ...techSlices("NV")[TECH_DIR + "ticker/ref_NVDA.json.gz"], ticker: "NVX" }, null]) {
    const loads = [];
    const s = Service.create({
      loadJSON: async (p) => JSON.parse(readFileSync(join(ROOT, p.slice(1)), "utf8")),
      loadCompressedJSON: async (p) => {
        loads.push(p);
        if (p.includes("/ticker/")) { if (!falsch) throw new Error("kaputt"); return falsch; }
        return JSON.parse(gunzipSync(readFileSync(join(ROOT, p.slice(1)))).toString("utf8"));
      },
      displayPolicy: Policy, queryEngine: Query
    });
    assert.deepEqual(vergleichbar(await s.getTechnicalIntelligence("NVDA")), vergleichbar(echt));
    assert.ok(loads.includes("/" + TECH_DIR + "NV.json.gz"));
  }
});
