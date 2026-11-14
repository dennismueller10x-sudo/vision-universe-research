/* Gemeinsame Freigabe des Live-Stroms (quant/api/realtime-capability.js): Quant und Technical fragen dieselbe Stelle.
   Jeder Zweig der Pruefung steht hier; ohne vollstaendige Antwort verbindet der Relay-Client nicht. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RC = require("../api/realtime-capability.js");
const Relay = require("../api/live-relay-client.js");

const instrument = { instrumentId: "vu_a1b2c3", masterMemberId: "ref_AFG", legacyIds: ["ref_AFG"], symbol: "AFG", companyName: "American Financial Group", productEligibility: "ELIGIBLE" };
const stream = { enabled: true, url: "wss://live.visionuniverse.de/live" };
function make(over) {
  const d = Object.assign({ identity: async () => instrument, config: async () => ({ preview: { stream }, gates: {} }), publicPermission: async () => true }, over);
  return RC.create(d);
}

test("RC-1 · freigegebener Titel: vollständige Antwort, die der Relay-Client annimmt", async () => {
  const cap = await make().getRealtimeCapability("afg");
  assert.equal(cap.state, "AVAILABLE");
  assert.equal(cap.url, "wss://live.visionuniverse.de/live");
  assert.equal(cap.chartMovement, "TRADE_EVENTS_ONLY");
  assert.equal(cap.onDemand, true);
  assert.equal(cap.identity.ticker, "AFG");
  assert.match(cap.identity.securityId, /^vu_[a-f0-9]+$/);
  let seen = null;
  const client = Relay.create({ capability: cap, connect: () => { throw new Error("kein Netz im Test"); }, onChange: (s) => { seen = s; } });
  client.start();
  assert.notEqual(seen && seen.reason, "INVALID_CAPABILITY", "der Relay-Client lehnt eine vollständige Antwort ab");
});

test("RC-2 · ohne kanonische Identität oder mit schlechtem Kürzel: INVALID_IDENTITY", async () => {
  assert.equal((await make().getRealtimeCapability("")).reason, "INVALID_IDENTITY");
  assert.equal((await make().getRealtimeCapability("a b")).reason, "INVALID_IDENTITY");
  assert.equal((await make({ identity: async () => null }).getRealtimeCapability("AFG")).reason, "INVALID_IDENTITY");
});

test("RC-3 · Strom aus oder Freigabe verweigert: DISPLAY_NOT_PERMITTED, nie AVAILABLE", async () => {
  const aus = make({ config: async () => ({ preview: { stream: { enabled: false, url: stream.url } }, gates: {} }) });
  assert.equal((await aus.getRealtimeCapability("AFG")).reason, "DISPLAY_NOT_PERMITTED");
  const verweigert = make({ publicPermission: async () => false });
  assert.equal((await verweigert.getRealtimeCapability("AFG")).reason, "DISPLAY_NOT_PERMITTED");
});

test("RC-4 · fremde Adresse: UNSUPPORTED_RELAY; Fehler beim Lesen: SOURCE_MISSING", async () => {
  const fremd = make({ config: async () => ({ preview: { stream: { enabled: true, url: "wss://example.org/live" } }, gates: {} }) });
  assert.equal((await fremd.getRealtimeCapability("AFG")).reason, "UNSUPPORTED_RELAY");
  const kaputt = make({ config: async () => { throw new Error("offline"); } });
  assert.equal((await kaputt.getRealtimeCapability("AFG")).reason, "SOURCE_MISSING");
});

test("RC-5 · Quant und Technical nutzen dieselbe Stelle (keine zweite Entscheidung im Code)", async () => {
  const { readFileSync } = await import("node:fs");
  const ps = readFileSync(new URL("../api/product-services.js", import.meta.url), "utf8");
  assert.match(ps, /RealtimeCapability\.create\(/);
  assert.doesNotMatch(ps, /wss:\/\/live\.visionuniverse\.de\/live/, "product-services entscheidet nicht mehr selbst");
  const tc = readFileSync(new URL("../../technical/app.js", import.meta.url), "utf8");
  assert.match(tc, /VURealtimeCapability/);
  assert.doesNotMatch(tc, /wss:\/\/live\.visionuniverse\.de\/live/, "Technical baut keine eigene Capability");
});
