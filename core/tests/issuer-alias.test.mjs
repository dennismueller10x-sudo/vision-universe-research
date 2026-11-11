/* Core · Holding-Umgruendungen: die alte issuerId bleibt aufloesbar (core/issuer-alias.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = require(join(ROOT, "core", "identity.js"));
const Alias = require(join(ROOT, "core", "issuer-alias.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

test("Emittenten-Alias · alte issuerId einer Holding-Umgruendung loest auf die Nachfolgerin auf (XOM)", () => {
  const reg = json("quant/config/sec-successor-issuers.json");
  const aliases = Alias.issuerAliases(reg);
  assert.equal(Alias.resolveIssuerId("iss_cik_0000034088", aliases), "iss_cik_0002115436");
  // Die neue ID und fremde IDs bleiben unveraendert.
  assert.equal(Alias.resolveIssuerId("iss_cik_0002115436", aliases), "iss_cik_0002115436");
  assert.equal(Alias.resolveIssuerId("iss_cik_0000320193", aliases), "iss_cik_0000320193");
  assert.deepEqual(Alias.predecessorIssuerIds("iss_cik_0002115436", aliases), ["iss_cik_0000034088"]);
  assert.deepEqual(Alias.predecessorIssuerIds("iss_cik_0000320193", aliases), []);
  // Jeder Vorgaenger des Registers ist aufloesbar, jede Nachfolgerin eine gueltige issuerId.
  for (const [pred, succ] of Object.entries(aliases)) {
    assert.ok(Identity.isIssuerId(pred) && Identity.isIssuerId(succ), pred);
  }
  assert.equal(Alias.resolveIssuerId("iss_cik_0000034088", null), "iss_cik_0000034088");
});

test("Emittenten-Alias · Register fail closed bei Ketten, Zyklen und doppelten Nachfolgern", () => {
  const reg = (succ) => ({ successors: succ });
  assert.throws(() => Alias.issuerAliases(reg({ "0000000002": { predecessors: ["0000000001"] }, "0000000003": { predecessors: ["0000000002"] } })), /Kette/);
  assert.throws(() => Alias.issuerAliases(reg({ "0000000002": { predecessors: ["0000000001"] }, "0000000003": { predecessors: ["0000000001"] } })), /zwei Nachfolger/);
  assert.throws(() => Alias.issuerAliases(reg({ "0000000002": { predecessors: ["0000000002"] } })), /Vorgaenger/);
  assert.throws(() => Alias.issuerAliases(reg({ "12": { predecessors: [] } })), /ungueltige CIK/);
});
