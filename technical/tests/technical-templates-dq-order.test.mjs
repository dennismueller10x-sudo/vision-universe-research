// Entscheidung T-2 (Entwurf, technical-templates-1.2.0): Titel mit Kurssprung-Kennzeichnung stehen innerhalb jeder
// Einordnung hinten. Trefferlisten und Zaehlungen bleiben gleich; nur die Reihenfolge aendert sich.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const T = require(join(root, "technical/engine/templates.js"));
const A = require(join(root, "technical/engine/assistant.js"));
const ds = Q.createDataset(JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")));
const rank = (i) => { const r = ds.row(i); return !r.suspectJumpAt ? 0 : r.suspectJumpStatus === "CONFIRMED" ? 2 : 1; };

test("T-2: gekennzeichnete Titel stehen in jeder Einordnung hinten, Reihenfolge sonst wie bisher", () => {
  const lists = T.list().concat(A.list().map((g) => A.build(g.id)));
  let flaggedSomewhere = 0;
  for (const t of lists) {
    const r = T.evaluate(ds, t);
    for (const k of ["full", "incomplete"]) {
      const ranks = r[k].map((e) => rank(e.i));
      flaggedSomewhere += ranks.filter((x) => x > 0).length;
      for (let n = 1; n < ranks.length; n++) assert.ok(ranks[n - 1] <= ranks[n], t.id + " " + k + ": gekennzeichneter Titel vor unauffaelligem");
    }
    // fast erfuellt: zuerst nach fehlendem Kriterium, innerhalb davon gekennzeichnete hinten
    for (let n = 1; n < r.near.length; n++) {
      const a = r.near[n - 1], b = r.near[n];
      if (a.states.indexOf("FAIL") === b.states.indexOf("FAIL")) assert.ok(rank(a.i) <= rank(b.i), t.id + " near");
    }
  }
  assert.ok(flaggedSomewhere > 0, "Datensatz ohne gekennzeichnete Treffer - Test waere leer");
});

test("T-2: Mitgliedschaft und Zaehlungen unveraendert (nur Reihenfolge)", () => {
  for (const t of T.list()) {
    const r = T.evaluate(ds, t), ids = (k) => r[k].map((e) => e.i).sort((x, y) => x - y);
    const fresh = Q.predicate(ds, T.FRESH, "1D"), preds = t.criteria.map((c) => T.predicate(ds, c.filter)), full = [];
    for (let i = 0; i < ds.size; i++) if (fresh(i) === true && preds.every((p) => p(i) === true)) full.push(i);
    assert.deepEqual(ids("full"), full, t.id);
  }
  assert.equal(T.TEMPLATES_VERSION, "technical-templates-1.2.0");
});
