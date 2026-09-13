import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("../engines/memory.js");

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)),
           removeItem: (k) => map.delete(k), map };
}

test("Angesehene Aktien: juengste zuerst, keine Doppelten, hoechstens zwoelf", () => {
  const m = M.create(fakeStorage());
  for (let i = 0; i < 15; i++) m.recordView("S" + i, { universeId: "US_REAL" });
  m.recordView("S3", { universeId: "US_REAL" });
  const r = m.recent("US_REAL");
  assert.equal(r.length, M.MAX_RECENT);
  assert.equal(r[0].symbol, "S3");
  assert.equal(r.filter((e) => e.symbol === "S3").length, 1);
  assert.ok(m.opened("S3"));
  assert.ok(!m.opened("NIE"));
});

test("Das Gedaechtnis ueberlebt ein Neuladen (derselbe Speicher)", () => {
  const s = fakeStorage();
  M.create(s).recordView("NVDA", { universeId: "US_REAL", companyName: "NVIDIA" });
  const wieder = M.create(s);
  assert.equal(wieder.recent()[0].companyName, "NVIDIA");
});

test("Universen bleiben getrennt", () => {
  const m = M.create(fakeStorage());
  m.recordView("A", { universeId: "US_REAL" });
  m.recordView("B", { universeId: "VU_MODEL" });
  assert.deepEqual(m.recent("US_REAL").map((e) => e.symbol), ["A"]);
});

test("Ohne Speicher funktioniert alles - nur ohne Gedaechtnis", () => {
  const kaputt = { getItem: () => { throw new Error("gesperrt"); }, setItem: () => { throw new Error("gesperrt"); }, removeItem: () => {} };
  const m = M.create(kaputt);
  assert.doesNotThrow(() => m.recordView("A", {}));
  assert.deepEqual(m.recent(), [{ symbol: "A", universeId: "US_REAL", companyName: null, world: null, at: m.recent()[0].at }]);
});

test("Bevorzugte Sammlungen und Position", () => {
  const m = M.create(fakeStorage());
  m.recordCollection("momentum-leaders"); m.recordCollection("momentum-leaders"); m.recordCollection("thema-ki");
  assert.deepEqual(m.preferredCollections(2), ["momentum-leaders", "thema-ki"]);
  m.setPosition("US_REAL", 7);
  assert.equal(m.position("US_REAL"), 7);
  m.clear();
  assert.equal(m.position("US_REAL"), 0);
});
