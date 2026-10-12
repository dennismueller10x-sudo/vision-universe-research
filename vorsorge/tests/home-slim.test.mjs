/* Startseiten-Auszuege (etf-index-home.json, holdings/feed.json): gleiche Werte wie die vollen
   Dateien, und der Browser faellt auf die vollen Dateien zurueck, wenn ein Auszug fehlt. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { homeIndex, holdingsFeed, HOME_SYMBOLS } from "../../scripts/vorsorge/slim-index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const FULL = read("vorsorge/data/etf-index.json");
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/** vorsorge/app.js in einer Sandbox; fetch liefert `files` (URL -> Objekt), alles andere 404. */
function loadApp(files) {
  const requests = [];
  const window = {
    VUVorsorge: { Master: { REGION_LABEL: {} } },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: (url) => {
      requests.push(url);
      const body = files[url];
      return Promise.resolve(body === undefined ? { ok: false, status: 404, json: () => Promise.reject(new Error("404")) }
        : { ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });
    }
  };
  const ctx = vm.createContext({ window, Intl, Date, Math, JSON, Promise, Object, Array, String, Number, isFinite, encodeURIComponent, decodeURIComponent });
  vm.runInContext("var fetch = window.fetch, localStorage = window.localStorage;\n" + readFileSync(join(root, "vorsorge/app.js"), "utf8"), ctx);
  return { VS: window.VS, requests };
}

test("Startseiten-Auszug: Zeilen sind Feld fuer Feld die Zeilen des Haupt-Index", () => {
  const h = homeIndex(FULL);
  assert.deepEqual(h.fields, FULL.fields); assert.deepEqual(h.counts, FULL.counts); assert.equal(h.asOf, FULL.asOf);
  const si = FULL.fields.indexOf("symbol"), li = FULL.fields.indexOf("slug");
  const expected = FULL.rows.filter((r) => HOME_SYMBOLS.includes(r[si]) || HOME_SYMBOLS.includes(r[li]));
  assert.ok(h.rows.length >= HOME_SYMBOLS.length, "alle Kern-ETFs im Auszug");
  assert.equal(h.rows.length, expected.length);
  h.rows.forEach((r, n) => FULL.fields.forEach((f, i) => assert.deepEqual(r[i], expected[n][i], r[si] + "." + f)));
  for (const s of HOME_SYMBOLS) assert.ok(h.rows.some((r) => r[si] === s), s + " fehlt");
});

test("Eingecheckter Startseiten-Auszug passt zum eingecheckten Haupt-Index", { skip: !existsSync(join(root, "vorsorge/data/etf-index-home.json")) }, () => {
  assert.deepEqual(read("vorsorge/data/etf-index-home.json"), homeIndex(FULL));
});

test("Eingecheckter Holdings-Feed passt zu holdings/index.json", { skip: !existsSync(join(root, "vorsorge/data/holdings/feed.json")) }, () => {
  const idx = read("vorsorge/data/holdings/index.json"), f = read("vorsorge/data/holdings/feed.json");
  assert.deepEqual(f.quarters, idx.quarters); assert.deepEqual(f.feed, idx.feed); assert.deepEqual(f, holdingsFeed(idx));
});

test("Kern-ETFs der Startseite (plan.js) = HOME_SYMBOLS des Produzenten", () => {
  const src = readFileSync(join(root, "vorsorge/ui/plan.js"), "utf8");
  const m = src.match(/var CORE = (\[[^\]]+\]);/);
  assert.ok(m, "CORE-Liste in plan.js");
  assert.deepEqual(JSON.parse(m[1]), HOME_SYMBOLS);
});

test("Browser: Auszug dekodiert identisch zum Haupt-Index (gleiche Objekte fuer find/_bySymbol)", async () => {
  const { VS, requests } = loadApp({ "/vorsorge/data/etf-index-home.json": homeIndex(FULL), "/vorsorge/data/etf-index.json": FULL });
  const h = await VS.masterFor(HOME_SYMBOLS);
  assert.deepEqual(requests, ["/vorsorge/data/etf-index-home.json"], "Startseite laedt den vollen Index nicht");
  assert.ok(h._covers);
  const m = await VS.master();
  for (const s of HOME_SYMBOLS.concat(HOME_SYMBOLS.map((x) => x.toLowerCase()))) {
    assert.ok(h.find(s), s);
    assert.deepEqual(plain(h.find(s)), plain(m.find(s)), s);
    assert.deepEqual(plain(h._bySymbol[s]), plain(m._bySymbol[s]), s);
  }
  assert.deepEqual(h.counts, m.counts); assert.equal(h.asOf, m.asOf);
});

test("Browser: Symbol ausserhalb des Auszugs -> voller Index", async () => {
  const { VS, requests } = loadApp({ "/vorsorge/data/etf-index-home.json": homeIndex(FULL), "/vorsorge/data/etf-index.json": FULL });
  const m = await VS.masterFor(["URTH", "VT"]);
  assert.ok(!m._covers); assert.ok(requests.includes("/vorsorge/data/etf-index.json"));
  assert.equal(m.find("VT") && m.find("VT").symbol, FULL.rows.find((r) => r[FULL.fields.indexOf("symbol")] === "VT") ? "VT" : undefined);
});

test("Browser: fehlender oder ungueltiger Auszug -> voller Index (wie bisher)", async () => {
  for (const home of [undefined, { schemaVersion: "x", rows: [] }]) {
    const files = { "/vorsorge/data/etf-index.json": FULL };
    if (home) files["/vorsorge/data/etf-index-home.json"] = home;
    const { VS, requests } = loadApp(files);
    const m = await VS.masterFor(HOME_SYMBOLS);
    assert.ok(!m._covers); assert.equal(m.etfs.length, FULL.rows.length);
    assert.ok(requests.includes("/vorsorge/data/etf-index.json"));
  }
});

test("Browser: Holdings-Feed aus feed.json, sonst aus holdings/index.json", async () => {
  const idx = { schemaVersion: "s", quarters: ["2026Q2"], feed: [{ symbol: "IVV", text: "t" }], bySymbol: { IVV: [] } };
  let app = loadApp({ "/vorsorge/data/holdings/feed.json": holdingsFeed(idx), "/vorsorge/data/holdings/index.json": idx });
  let f = await app.VS.holdingsFeed();
  assert.deepEqual([f.quarters, f.feed], [idx.quarters, idx.feed]);
  assert.deepEqual(app.requests, ["/vorsorge/data/holdings/feed.json"]);
  for (const feed of [undefined, { schemaVersion: "x" }]) {
    const files = { "/vorsorge/data/holdings/index.json": idx };
    if (feed) files["/vorsorge/data/holdings/feed.json"] = feed;
    app = loadApp(files);
    f = await app.VS.holdingsFeed();
    assert.deepEqual([f.quarters, f.feed], [idx.quarters, idx.feed]);
    assert.ok(app.requests.includes("/vorsorge/data/holdings/index.json"));
  }
  app = loadApp({});
  await assert.rejects(app.VS.holdingsFeed());
});
