/* Suche in Worten gegen das Gold-Set: jeder abbildbare Satz exakt, kein stiller Fehlgriff (Audit B18). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { evaluate } from "../../scripts/technical/eval-query-text.mjs";

const Q = createRequire(import.meta.url)("../engines/technical/technical-query.js");
const gold = JSON.parse(readFileSync(new URL("./fixtures/technical-query-gold.json", import.meta.url), "utf8"));

test("Gold-Set: Erwartungen sind gueltige Abfragen, Faelle eindeutig", () => {
  const seen = new Set();
  for (const c of gold.cases) {
    assert.ok(!seen.has(c.q), "doppelt: " + c.q); seen.add(c.q);
    assert.ok(!!c.expect !== !!c.unsupported, "genau eines von expect/unsupported: " + c.q);
    if (c.expect) {
      const q = { timeframe: c.expect.tf, logic: c.expect.groups.length > 1 ? "OR" : "AND",
        groups: c.expect.groups.map((g) => ({ op: "AND", filters: g.map(([id, op, value, value2]) => { const [field, tf] = id.split("@"); return Object.assign(op === "between" ? { field, op, value, value2 } : { field, op, value }, tf ? { tf } : {}); }) })) };
      assert.ok(Q.validate(q).ok, c.q + ": " + JSON.stringify(Q.validate(q).errors));
    }
  }
  assert.ok(gold.cases.filter((c) => c.expect).length >= 70 && gold.cases.filter((c) => c.unsupported).length >= 10);
});

test("Gold-Set: alle abbildbaren Saetze exakt, kein stiller Fehlgriff", () => {
  const r = evaluate(gold);
  assert.equal(r.silent, 0, "stille Fehlgriffe: " + JSON.stringify(r.silents));
  assert.equal(r.exact, r.supported, "daneben: " + JSON.stringify(r.misses.map((m) => m.q)));
});
