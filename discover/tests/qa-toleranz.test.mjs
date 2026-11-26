import { test } from "node:test";
import assert from "node:assert/strict";
import { istErlaubter404, lies, ladeShards } from "../../scripts/discover/qa-toleranz.mjs";

const URL = (s) => "http://127.0.0.1:8765/supertrader/data/sf-candidates/ticker/" + s + ".json";

test("QT-1 404 auf einen sf-candidates-Shard, der NICHT in tickerShards steht, ist kein Befund", () => {
  assert.equal(istErlaubter404({ status: 404, url: URL("TX") }, ["AA", "AB"]), true);
  assert.equal(istErlaubter404({ status: 404, url: URL("TX") + "?v=1" }, new Set(["AA"])), true);
});

test("QT-2 steht der Shard in tickerShards und fehlt trotzdem, bleibt es ein Fehler (echte Luecken bleiben sichtbar)", () => {
  assert.equal(istErlaubter404({ status: 404, url: URL("AA") }, ["AA", "AB"]), false);
});

test("QT-3 keine pauschale 404-Ausnahme: anderer Pfad, anderer Status, fehlende Liste", () => {
  assert.equal(istErlaubter404({ status: 404, url: "http://127.0.0.1:8765/supertrader/data/signals.json" }, ["AA"]), false);
  assert.equal(istErlaubter404({ status: 404, url: "http://127.0.0.1:8765/supertrader/data/sf-candidates/summary.json" }, ["AA"]), false);
  assert.equal(istErlaubter404({ status: 500, url: URL("TX") }, ["AA"]), false);
  assert.equal(istErlaubter404({ status: 403, url: URL("TX") }, ["AA"]), false);
  assert.equal(istErlaubter404(null, ["AA"]), false);
});

test("QT-4 ohne lesbare tickerShards-Liste gibt es keine Toleranz (kein stilles 'alles erlaubt')", () => {
  assert.equal(lies({}), null);
  assert.equal(lies(null), null);
  assert.equal(lies({ tickerShards: "AA" }), null);
  assert.deepEqual([...lies({ tickerShards: ["AA", "AB"] })], ["AA", "AB"]);
});

test("QT-5 ladeShards liest tickerShards aus der Datei; nicht lesbar oder ohne Liste: null (keine Toleranz)", async () => {
  const mit = await ladeShards(async () => JSON.stringify({ tickerShards: ["AA", "AB"] }), "file:///x/scripts/discover/browser-qa.mjs");
  assert.deepEqual([...mit], ["AA", "AB"]);
  assert.equal(await ladeShards(async () => { throw new Error("ENOENT"); }, "file:///x/scripts/discover/browser-qa.mjs"), null);
  assert.equal(await ladeShards(async () => "{}", "file:///x/scripts/discover/browser-qa.mjs"), null);
});
