/* AP8 L4: RS-Rang = Perzentilrang von rs6m ueber aktuelle, gueltig auswertbare Titel (screen-row.js#rankRs 1.12.0,
   docs/technical/SCREENER_FIELDS_AP8_L4.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Row = require(join(root, "quant/engines/technical/screen-row.js"));
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const QT = require(join(root, "quant/engines/technical/query-text.js"));

test("L4: Definition - Richtung, Gleichstaende, Raender, Universum", () => {
  const rows = [
    { s: "A", fresh: true, rs6m: -0.2 }, { s: "B", fresh: true, rs6m: 0.1 }, { s: "C", fresh: true, rs6m: 0.1 },
    { s: "D", fresh: true, rs6m: 0.5 }, { s: "E", fresh: true, rs6m: null }, { s: "F", fresh: false, rs6m: 0.9 }, { s: "G", fresh: true, rs6m: 0.3 }
  ];
  assert.equal(Row.rankRs(rows), 5, "Universum = aktuell und rs6m vorhanden");
  const r = Object.fromEntries(rows.map((x) => [x.s, x.rsRank]));
  assert.equal(r.A, 0); assert.equal(r.D, 100);
  assert.equal(r.B, r.C, "Gleichstand gleicher Rang"); assert.equal(r.B, 37.5);  // (1 + 0.5) / 4
  assert.equal(r.G, 75);
  assert.equal(r.E, null, "ohne rs6m kein Rang"); assert.equal(r.F, null, "hinter dem Stichtag kein Rang");
  const one = [{ s: "X", fresh: true, rs6m: 0.1 }]; Row.rankRs(one); assert.equal(one[0].rsRank, 50);
  const none = [{ s: "Y", fresh: false, rs6m: 0.1 }]; assert.equal(Row.rankRs(none), 0); assert.equal(none[0].rsRank, null);
});

test("L4: Abfragefeld, Bereich und Wortsuche", () => {
  const f = Q.field("rsRank"); assert.ok(f); assert.equal(f.kind, "num"); assert.deepEqual(f.tfs, ["1D"]);
  assert.doesNotMatch(JSON.stringify(f.label), /IBD/i);
  const p = (t) => QT.parse(t).query.groups[0].filters[0];
  const a = p("RS-Rang mindestens 70"); assert.deepEqual([a.field, a.op, a.value], ["rsRank", "gte", 70]);
  assert.equal(p("relative Stärke 6 Monate größer 0 %").field, "rs6m");
});

test("L4: Datensatz - Rang = Neuberechnung, monoton in rs6m, nur aktuelle Titel", () => {
  const c = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")).cols;
  if (!c.rsRank) return;
  const rows = c.s.map((s, i) => ({ s, fresh: c.fresh[i], rs6m: c.rs6m[i] }));
  const N = Row.rankRs(rows);
  assert.ok(N > 5000, "Universum " + N);
  rows.forEach((r, i) => assert.equal(c.rsRank[i], r.rsRank, r.s));
  const U = rows.filter((r) => r.rsRank !== null).sort((a, b) => a.rs6m - b.rs6m);
  for (let k = 1; k < U.length; k++) assert.ok(U[k].rsRank >= U[k - 1].rsRank, "monoton bei " + U[k].s);
  for (let i = 0; i < c.s.length; i++) if (!c.fresh[i]) assert.equal(c.rsRank[i], null, c.s[i]);
  const top = U.filter((r) => r.rsRank >= 70).length / U.length;
  assert.ok(top > 0.29 && top < 0.31, "Anteil >= 70: " + top);
});
