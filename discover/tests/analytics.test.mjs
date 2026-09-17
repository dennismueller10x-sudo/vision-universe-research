import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../engines/analytics.js");

test("Der Vertrag kennt genau die zehn Ereignisse aus §16", () => {
  assert.deepEqual(Object.keys(A.EVENTS).sort(), [
    "card_open", "card_view", "chart_range_change", "collection_view", "discover_impression",
    "immersive_complete", "immersive_start", "stock_open", "swipe", "theme_open"].sort());
});

test("Ein unbekannter Name wird verworfen", () => {
  assert.equal(A.track("time_on_feed", { s: 1 }), null);
});

test("Nur vereinbarte Felder kommen durch; die Senke bekommt das Ereignis", () => {
  A.clearSinks();
  const gesehen = [];
  A.addSink((e) => gesehen.push(e));
  const e = A.track("stock_open", { universeId: "US_REAL", symbol: "NVDA", from: "row", geheim: 1 });
  assert.equal(e.name, "stock_open");
  assert.deepEqual(e.props, { universeId: "US_REAL", symbol: "NVDA", from: "row" });
  assert.equal(gesehen.length, 1);
  assert.ok(A.recent().some((x) => x === e));
});

test("Eine werfende Senke stoert nicht", () => {
  A.clearSinks();
  A.addSink(() => { throw new Error("kaputt"); });
  assert.ok(A.track("swipe", { universeId: "US_REAL", rowId: "r", method: "touch" }));
  A.clearSinks();
});
