import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const Identity = require("../../server/product-identity.js");
const history = require("../../api/history.js");
const intraday = require("../../api/intraday.js");
const status = require("../../api/status.js");

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(body = "") { this.body = body ? JSON.parse(body) : null; }
  };
}

async function call(handler, path, { origin = "https://research.visionuniverse.de", method = "GET" } = {}) {
  const res = response();
  await handler({ url: path, method, headers: { origin } }, res);
  return res;
}

const localLoader = async path => JSON.parse(await readFile(new URL('../../'+path,import.meta.url),'utf8'));

test("product service resolves canonical stable identity and eligibility", async () => {
  const result = await Identity.resolveIdentity({ ticker: "NVDA" }, { loadJSON: localLoader });
  assert.equal(result.state, "AVAILABLE");
  assert.match(result.identity.securityId, /^vu_[a-f0-9]+$/);
  assert.equal(result.identity.instrumentId, result.identity.securityId);
  assert.equal(result.identity.masterMemberId, "ref_NVDA");
  assert.equal(result.identity.issuerId, "iss_cik_0001045810");
  assert.equal((await Identity.resolveIdentity({ ticker: "../../etc/passwd" }, { loadJSON: localLoader })).state, "INVALID_IDENTITY");
  assert.equal((await Identity.resolveIdentity({ ticker: "NVDA", securityId: "vu_wrong" }, { loadJSON: localLoader })).state, "SYMBOL_NOT_SUPPORTED");
});

test("history contract rejects calendar-invalid ranges and exposes no configuration details", async () => {
  globalThis.__VU_IDENTITY_TEST_LOADER = localLoader;
  const invalid = await call(history, "/api/history?ticker=NVDA&from=2026-02-30");
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.state, "INVALID_DATE_RANGE");
  const prior = process.env.VU_HISTORY_S3_ENDPOINT;
  delete process.env.VU_HISTORY_S3_ENDPOINT;
  const missing = await call(history, "/api/history?ticker=NVDA");
  delete globalThis.__VU_IDENTITY_TEST_LOADER;
  if (prior !== undefined) process.env.VU_HISTORY_S3_ENDPOINT = prior;
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.body.state, "NOT_CONFIGURED");
  assert.equal(JSON.stringify(missing.body).includes("SECRET"), false);
});

test("history projection is minimal and preserves requested OHLCV only", () => {
  const source = [{ date: "2026-01-02", open: 1, high: 3, low: 1, close: 2, volume: 9, provider: "hidden" }];
  assert.deepEqual(history.project(source, { columns: "close" }), [{ date: "2026-01-02", close: 2 }]);
  assert.deepEqual(Object.keys(history.project(source, { columns: "ohlcv" })[0]), ["date", "open", "high", "low", "close", "volume"]);
});

test("intraday service uses canonical committed snapshot and neutral semantics", async () => {
  globalThis.__VU_PRODUCT_DATA_TEST_LOADER = localLoader;
  const result = await call(intraday, "/api/intraday?ticker=NVDA");
  delete globalThis.__VU_PRODUCT_DATA_TEST_LOADER;
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.state, "INTRADAY_AVAILABLE");
  assert.equal(result.body.identity.masterMemberId, "ref_NVDA");
  assert.equal(result.body.priceSemantics, "UNSPECIFIED");
  assert.ok(result.body.points.length > 0);
  assert.equal(JSON.stringify(result.body).includes("api.tiingo.com"), false);
});

test("production CORS is narrow and status never reveals secrets", async () => {
  const allowed = await call(status, "/api/status");
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers["Access-Control-Allow-Origin"], "https://research.visionuniverse.de");
  assert.equal(allowed.body.realtime.priceSemantics, "UNSPECIFIED");
  const blocked = await call(intraday, "/api/intraday?ticker=NVDA", { origin: "https://attacker.invalid" });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body.state, "ORIGIN_NOT_ALLOWED");
});
