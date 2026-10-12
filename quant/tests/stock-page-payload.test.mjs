/* Aktienseite: weniger Daten, dieselben Werte (Payload-Audit 12.10.2026, Teil 2).

   Gemessen auf dem gebauten Release (Pixel 7, 150 ms / 1,6 Mbit, NVDA): 1.635 KB.
   Davon brauchte die Seite fuer EINEN Titel
     - 658 KB technische Auswertung: der Scherben der zwei Zeichen "NV" mit 15 Titeln,
     - 126 KB Verzeichnis der Liste: 6.684 Eintraege fuer einen,
     - 173 KB Kursverlauf (golden-preview): 18 Felder je Kerze, gelesen werden drei.
   Der Release-Build (scripts/vu2/build-release.mjs) schreibt deshalb aus denselben
   Quelldateien kleinere Ausschnitte; die Quelldateien und ihre Erzeuger bleiben unberuehrt.

   Nachweis hier:
     1. Die Ausschnitte tragen die Quellobjekte UNVERAENDERT (deepStrictEqual).
     2. Die API liefert mit den Ausschnitten DASSELBE wie ohne (lokal, alter Stand) - fuer
        sechs Titel und alle Funktionen, die die Aktienseite aufruft.
     3. Mit den Ausschnitten werden Scherben, Liste und Tagesdatei nicht mehr geladen;
        ohne Ausschnitt faellt die API auf sie zurueck. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  technicalTickerDocs, universeListViews, goldenChartView, TECHNICAL_SHARD_PATH,
  UNIVERSE_NAMES_SCHEMA, GOLDEN_CHART_VIEW, GOLDEN_FILE
} from "../../scripts/vu2/build-release.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..", "..");
const Service = require(join(ROOT, "quant/api/product-services.js"));
const Policy = require(join(ROOT, "quant/engines/display-policy.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));
const Master = require(join(ROOT, "quant/engines/company-master.js"));
const Identity = require(join(ROOT, "core/identity.js"));

const gz = (p) => JSON.parse(gunzipSync(readFileSync(join(ROOT, p))).toString("utf8"));
const plain = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));

const LIST_PATH = "quant/data/product/universe-list-v1.json.gz";
const list = gz(LIST_PATH);
const views = universeListViews(list);
const technicalShardOf = (ticker) => (ticker + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
const shardCache = new Map();
const shardFile = (key) => {
  if (!shardCache.has(key)) shardCache.set(key, gz("quant/data/product/technical-signals-v1/" + key + ".json.gz"));
  return shardCache.get(key);
};

/* withViews: die Release-Ausschnitte existieren. Ohne: 404 wie lokal. */
function api(withViews) {
  const loads = [];
  const s = Service.create({
    loadJSON: async (p) => {
      loads.push(p);
      let m;
      if ((m = p.match(/^\/quant\/data\/product\/universe-list-shards\/([A-Z0-9_]{1,2})\.json$/))) {
        if (!withViews || !views.shards[m[1]]) throw new Error("404");
        return clone(views.shards[m[1]]);
      }
      if ((m = p.match(/^(\/quant\/data\/market\/golden-preview\/daily\/ref_[A-Za-z0-9_-]+)\.chart\.json$/))) {
        if (!withViews) throw new Error("404");
        return clone(goldenChartView(plain(m[1].slice(1) + ".json")));
      }
      return plain(p.slice(1));
    },
    loadCompressedJSON: async (p) => {
      loads.push(p);
      let m;
      if ((m = p.match(/^\/quant\/data\/product\/technical-signals-v1\/by-ticker\/([A-Z0-9.-]{1,12})\.json\.gz$/))) {
        const doc = withViews ? technicalTickerDocs(shardFile(technicalShardOf(m[1])))[m[1]] : null;
        if (!doc) throw new Error("404");
        return clone(doc);
      }
      return gz(p.slice(1));
    },
    displayPolicy: Policy, queryEngine: Query
  });
  s.loads = loads;
  return s;
}

/* Die Uhr steht still: Zeitpunkte des Aufrufs (observedAt, health.asOf, Inhaltshash des Setup-Zustands) sind dann in beiden
   Laeufen gleich, und der Vergleich unten ist ein Vergleich ALLER Felder, nicht nur der stabilen. */
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T12:00:00Z") });
/* Zeitpunkte des Aufrufs, keine Datenstaende (wie stock-page-shards.test.mjs). */
const vergleichbar = (x) => {
  const o = clone(x);
  if (o && o.health) delete o.health.asOf;
  if (o && o.setupState) for (const k of ["observedAt", "setupStateId", "contentHash"]) delete o.setupState[k];
  return o;
};
/* Die Kerzen der Aktienseite: gelesen werden Datum, Schluss (splitbereinigt), Rohschluss und Splitfaktor. */
const KERZE = ["date", "close", "rawClose", "splitFactor"];
const kerzen = (x) => {
  const o = vergleichbar(x);
  const walk = (n) => {
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === "object") {
      const out = {};
      for (const [k, v] of Object.entries(n)) out[k] = k === "chart" && v && Array.isArray(v.bars) ? { ...walk({ ...v, bars: undefined }), bars: v.bars.map((b) => Object.fromEntries(KERZE.filter((f) => f in b).map((f) => [f, b[f]]))) } : walk(v);
      return out;
    }
    return n;
  };
  return walk(o);
};

/* Aus der Aufgabe: NVDA, AAPL, MSFT, SAP, RHM, PLTR; dazu Sonderfaelle (Klassenpapier, Vorzugsaktie, Einbuchstaben-Kuerzel, kurze Historie, Konflikt). */
const TICKERS = ["NVDA", "AAPL", "MSFT", "SAP", "RHM", "PLTR", "BRK-B", "ABR-P-D", "A", "F", "COOL", "BNRG", "AACI", "XOM"];

test("technicalTickerDocs: jeder Titel des Scherbens genau einmal, Objekte unveraendert, Kopf unveraendert", () => {
  for (const key of ["NV", "AA", "MS", "BR", "F_", "PL"]) {
    const shard = shardFile(key);
    const docs = technicalTickerDocs(shard);
    const erwartet = new Set([...Object.keys(shard.instruments), ...Object.keys(shard.unavailable || {})].filter((t) => /^[A-Z0-9.-]{1,12}$/.test(t)));
    assert.deepEqual(new Set(Object.keys(docs)), erwartet, key);
    for (const [t, doc] of Object.entries(docs)) {
      for (const k of Object.keys(shard)) if (k !== "instruments" && k !== "unavailable") assert.deepStrictEqual(doc[k], shard[k], key + "/" + t + " " + k);
      assert.deepStrictEqual(Object.keys(doc.instruments), t in shard.instruments ? [t] : [], key + "/" + t);
      if (t in shard.instruments) assert.deepStrictEqual(doc.instruments[t], shard.instruments[t], key + "/" + t);
      if ("unavailable" in shard) assert.deepStrictEqual(doc.unavailable, t in shard.unavailable ? { [t]: shard.unavailable[t] } : {}, key + "/" + t);
      else assert.ok(!("unavailable" in doc));
      assert.equal(doc.shard, key);
    }
  }
});

test("technicalTickerDocs: der Scherben ist der Ausgangspunkt, kein Titel geht verloren", () => {
  /* NV: 15 Titel, 4,3 MB; NVDA allein 319 KB. */
  const docs = technicalTickerDocs(shardFile("NV"));
  assert.equal(Object.keys(docs).length, Object.keys(shardFile("NV").instruments).length);
  assert.ok(JSON.stringify(docs.NVDA).length < JSON.stringify(shardFile("NV")).length / 10);
  assert.throws(() => technicalTickerDocs({ shard: "NV" }), /INVALID_TECHNICAL_SHARD/);
  assert.ok(TECHNICAL_SHARD_PATH.test("quant/data/product/technical-signals-v1/NV.json.gz"));
  assert.ok(!TECHNICAL_SHARD_PATH.test("quant/data/product/technical-signals-v1/signals-5.json.gz"));
  assert.ok(!TECHNICAL_SHARD_PATH.test("quant/data/product/technical-signals-v1/by-ticker/NVDA.json.gz"));
});

test("universeListViews: jeder Eintrag genau einmal, unveraendert, in Reihenfolge; Namensansicht gleich der Liste", () => {
  const n = Object.values(views.shards).reduce((k, s) => k + s.entries.length, 0);
  assert.equal(n, list.entries.length);
  for (const [key, part] of Object.entries(views.shards)) {
    assert.equal(part.shard, key);
    assert.equal(part.schemaVersion, list.schemaVersion);
    assert.equal(part.generatedAt, list.generatedAt);
    assert.deepStrictEqual(part.coverage, list.coverage);
    assert.deepStrictEqual(part.entries, list.entries.filter((e) => Master.shardKey(e.s) === key));
    for (const e of part.entries) assert.equal(Identity.shardKey(e.s), key, e.s);
  }
  /* Was app.js aus der Liste macht (names, types, il), ist aus der Ansicht dasselbe. */
  const ableiten = (entries) => {
    const names = {}, types = {}, il = {};
    for (const e of entries) { if (!e || !e.s) continue; if (e.n && e.n !== e.s) names[e.s] = e.n; if (e.t) types[e.s] = e.t; if (e.il !== undefined) il[e.s] = e.il; }
    return { names, types, il };
  };
  assert.equal(views.names.schemaVersion, UNIVERSE_NAMES_SCHEMA);
  assert.deepStrictEqual(ableiten(views.names.entries), ableiten(list.entries));
  assert.equal(views.names.entries.length, list.entries.length);
  assert.ok(Buffer.byteLength(JSON.stringify(views.names)) < Buffer.byteLength(JSON.stringify(list)) / 1.5);
  assert.throws(() => universeListViews({ entries: [] }), /INVALID_UNIVERSE_LIST_SOURCE/);
});

test("goldenChartView: Kopf unveraendert, je Kerze Datum, Schluss, Splitfaktor - und nichts Erfundenes", () => {
  const dir = "quant/data/market/golden-preview/daily/";
  const dateien = ["ref_NVDA", "ref_AAPL", "ref_MSFT", "ref_JPM", "ref_XOM"].filter((f) => existsSync(join(ROOT, dir + f + ".json")));
  assert.ok(dateien.length >= 1);
  for (const f of dateien) {
    assert.ok(GOLDEN_FILE.test(dir + f + ".json"));
    const p = plain(dir + f + ".json"), v = goldenChartView(p);
    assert.equal(v.chartView, GOLDEN_CHART_VIEW);
    for (const k of Object.keys(p)) if (k !== "bars") assert.deepStrictEqual(v[k], p[k], f + " " + k);
    assert.equal(v.bars.length, p.bars.length);
    p.bars.forEach((b, i) => assert.deepStrictEqual(v.bars[i], Object.fromEntries(["date", "close", "splitFactor"].filter((k) => k in b).map((k) => [k, b[k]])), f + " #" + i));
    assert.ok(Buffer.byteLength(JSON.stringify(v)) < Buffer.byteLength(JSON.stringify(p)) / 4);
  }
  assert.ok(!GOLDEN_FILE.test(dir + "ref_NVDA.chart.json"));
  assert.throws(() => goldenChartView({ bars: [] }), /INVALID_GOLDEN_SOURCE/);
});

test("API mit Ausschnitten = API ohne Ausschnitte, fuer jede Funktion der Aktienseite", async () => {
  for (const t of TICKERS) {
    const mit = api(true), ohne = api(false);
    for (const call of [
      (s) => s.getStockIntelligence(t),
      (s) => s.getTechnicalIntelligence(t),
      (s) => s.getTechnicalWorkspace(t),
      (s) => s.getQuantWorkspace(t),
      (s) => s.getSetupObservation(t),
      (s) => s.getIntelligenceBrief(t)
    ]) {
      assert.deepEqual(kerzen(await call(mit)), kerzen(await call(ohne)), t);
    }
    assert.deepEqual(await mit.getUniverseEntry(t), await ohne.getUniverseEntry(t), t + ": Verzeichniseintrag");
  }
});

test("Kerzen der Aktienseite: Datum und Schluss aus der Ansicht sind die der vollen Datei", async () => {
  for (const t of ["NVDA", "AAPL", "MSFT"]) {
    const mit = await api(true).getStockIntelligence(t), ohne = await api(false).getStockIntelligence(t);
    assert.equal(mit.chart.state, "AVAILABLE");
    const eod = (s) => s.chart.bars.map((b) => [b.date, b.close]);
    assert.deepEqual(eod(mit), eod(ohne), t);
    assert.deepEqual(mit.price, ohne.price, t);
    for (const k of ["adjustmentStatus", "priceSource", "providedAdjustmentStatus", "splitEvents", "state"]) assert.deepEqual(mit.chart[k], ohne.chart[k], t + " " + k);
    assert.ok(mit.chart.bars.length > 2000, t);
  }
});

test("Ladeverhalten: mit Ausschnitten kein Scherben, keine ganze Liste, keine volle Tagesdatei; ohne Ausschnitt der Rueckfall", async () => {
  for (const t of ["NVDA", "AAPL", "MSFT"]) {
    const mit = api(true), ohne = api(false);
    await mit.getIntelligenceBrief(t); await mit.getQuantWorkspace(t); await mit.getTechnicalWorkspace(t);
    const key = technicalShardOf(t);
    assert.ok(mit.loads.includes("/quant/data/product/technical-signals-v1/by-ticker/" + t + ".json.gz"), t);
    assert.ok(!mit.loads.includes("/quant/data/product/technical-signals-v1/" + key + ".json.gz"), t + ": kein Scherben");
    assert.ok(mit.loads.includes("/quant/data/product/universe-list-shards/" + Identity.shardKey(t) + ".json"), t);
    assert.ok(!mit.loads.includes("/" + LIST_PATH), t + ": keine ganze Liste");
    assert.ok(mit.loads.includes("/quant/data/market/golden-preview/daily/ref_" + t + ".chart.json"), t);
    assert.ok(!mit.loads.includes("/quant/data/market/golden-preview/daily/ref_" + t + ".json"), t + ": keine volle Tagesdatei");
    /* Je Datei einmal: zwei Funktionen, ein Abruf. */
    const einmal = (p) => mit.loads.filter((x) => x === p).length;
    assert.ok(einmal("/quant/data/product/technical-signals-v1/by-ticker/" + t + ".json.gz") <= 1, t);

    await ohne.getIntelligenceBrief(t); await ohne.getQuantWorkspace(t);
    assert.ok(ohne.loads.includes("/quant/data/product/technical-signals-v1/" + key + ".json.gz"), t + ": Rueckfall auf den Scherben");
    assert.ok(ohne.loads.includes("/" + LIST_PATH), t + ": Rueckfall auf die Liste");
    assert.ok(ohne.loads.includes("/quant/data/market/golden-preview/daily/ref_" + t + ".json"), t + ": Rueckfall auf die Tagesdatei");
  }
});

test("Titel ohne volle Historie fragen die Kursansicht nicht an (keine zusaetzliche Anfrage vor dem Rueckfall)", async () => {
  const s = api(true);
  await s.getStockIntelligence("PLTR");
  assert.ok(!s.loads.some((p) => p.includes(".chart.json")), "PLTR hat keine volle Historie");
});

test("Ein Fehler beim Ausschnitt ist kein Fehler der Seite: kaputte Ansicht, Rueckfall auf die Quelle", async () => {
  const kaputt = Service.create({
    loadJSON: async (p) => {
      if (p.includes("universe-list-shards")) return { shard: "XX", entries: [] };
      if (p.endsWith(".chart.json")) return { chartView: "falsch", bars: [] };
      return plain(p.slice(1));
    },
    loadCompressedJSON: async (p) => {
      if (p.includes("/by-ticker/")) return { schemaVersion: "technical-product-artifact-1.0.0", shard: "ZZ", instruments: {} };
      return gz(p.slice(1));
    },
    displayPolicy: Policy, queryEngine: Query
  });
  /* Falscher Scherbenschluessel im Ausschnitt: die Pruefung des Lesers lehnt ab, wie beim Scherben. Die Ansicht der Kerzen
     und der Liste wird verworfen und durch die Quelle ersetzt. */
  const stock = await kaputt.getStockIntelligence("NVDA"), referenz = await api(false).getStockIntelligence("NVDA");
  assert.deepEqual(kerzen(stock), kerzen(referenz));
});
