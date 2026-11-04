// Gemeinsame Abfrage-Engine (core/query-engine.js): Regeln und Einbindung in /screener/ und /technical/.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const QE = require("../query-engine.js");

const art = { cols: { s: ["A", "B", "C", "D", "E"], x: [1, 5, null, 10, "7"], b: [true, false, null, 1, 0],
  e: ["X", "Y", null, "X", "Z"], m: [["p", "q"], [], null, ["q"], ["r"]], d: [3, null, null, 40, null], w: [20, 20, null, 50, 2] } };

test("Datensatz: Spalten, Kuerzel, Aufloesung mit Zwischenspeicher", () => {
  const ds = QE.createDataset(art);
  assert.equal(ds.size, 5); assert.equal(ds.indexOf("C"), 2); assert.equal(ds.indexOf("constructor"), -1); assert.equal(ds.symbol(3), "D");
  assert.equal(ds.column("nope"), null); assert.deepEqual(ds.row(0).e, "X");
  let calls = 0;
  const rs = QE.createDataset(art, (k, cols) => { calls++; return k === "alias" ? cols.x : null; });
  assert.equal(rs.column("alias"), art.cols.x); rs.column("alias"); assert.equal(calls, 1);
  assert.throws(() => QE.createDataset({}), /INVALID_DATASET/);
});

test("Praedikate: fehlende Werte erfuellen nichts, Listen, nin, eq, streng", () => {
  const c = art.cols, all = (p) => [0, 1, 2, 3, 4].map(p);
  assert.deepEqual(all(QE.predicate(null, { op: "gt", value: 0 }, { kind: "number" })), [null, null, null, null, null]);
  assert.deepEqual(all(QE.predicate(c.x, { op: "gt", value: 4 }, { kind: "number" })), [false, true, null, true, true], "lose: Zeichenkette zaehlt als Wert");
  assert.deepEqual(all(QE.predicate(c.x, { op: "gt", value: 4 }, { kind: "number", strict: true })), [false, true, null, true, null], "streng: nur endliche Zahlen");
  assert.deepEqual(all(QE.predicate(c.x, { op: "between", value: 1, value2: 5 }, { kind: "number" })), [true, true, null, false, false]);
  assert.deepEqual(all(QE.predicate(c.x, { op: "eq", value: 5 }, { kind: "number", eqTol: 0.1 })), [false, true, null, false, false]);
  assert.deepEqual(all(QE.predicate(c.b, { op: "is", value: true }, { kind: "bool" })), [true, false, null, true, false]);
  assert.deepEqual(all(QE.predicate(c.e, { op: "in", value: ["X", "Z"] }, { kind: "enum" })), [true, false, null, true, true]);
  assert.deepEqual(all(QE.predicate(c.e, { op: "nin", value: ["X"] }, { kind: "enum" })), [false, true, null, false, true]);
  assert.deepEqual(all(QE.predicate(c.m, { op: "in", value: ["q"] }, { kind: "enum" })), [true, false, null, true, false]);
  assert.deepEqual(all(QE.predicate(c.m, { op: "in", value: ["q"] }, { kind: "enum", listOnly: true })), [true, false, false, true, false], "Listenspalte: leer = nicht erfuellt");
});

test("Ereignisfeld mit Pruefraum: nur sichere Schluesse, sonst unbekannt", () => {
  const p = (op, value, value2) => [0, 1, 2, 3, 4].map(QE.predicate(art.cols.d, { op, value, value2 }, { kind: "number", strict: true, window: art.cols.w }));
  // B: leer, Fenster 20 -> mindestens 20 Tage her; C: beides leer -> unbekannt; E: leer, Fenster 2
  assert.deepEqual(p("lte", 10), [true, false, null, false, null]);
  assert.deepEqual(p("gt", 10), [false, true, null, true, null]);
  assert.deepEqual(p("gte", 2), [true, true, null, true, true]);
  assert.deepEqual(p("between", 0, 5), [true, false, null, false, null]);
});

test("Auswertung: UND/ODER in und zwischen Gruppen, Trichter, Zaehler", () => {
  const n = 5, ds = QE.createDataset(art);
  const pred = { a: QE.predicate(ds.column("x"), { op: "gte", value: 5 }, { kind: "number", strict: true }), b: QE.predicate(ds.column("e"), { op: "in", value: ["X"] }, { kind: "enum" }) };
  const steps = { filterStep: (f) => ({ kind: "filter", label: f.id }), groupStep: (g, gi, s) => ({ kind: "group", label: g.id + (s ? " allein" : "") }) };
  const and = QE.run(n, { logic: "AND", groups: [{ id: "g1", op: "AND", filters: [{ id: "a" }, { id: "b" }] }] }, pred, steps);
  assert.deepEqual(and.indices, [3]);
  assert.deepEqual(and.funnel.map((s) => [s.label, s.count, s.lost, s.missing]), [["Ausgangsuniversum", 5, 0, 0], ["a", 2, 3, 2], ["b", 1, 1, 0]]);
  const or = QE.run(n, { logic: "AND", groups: [{ id: "g1", op: "OR", filters: [{ id: "a" }, { id: "b" }] }] }, pred, Object.assign({ countMatches: true }, steps));
  assert.deepEqual(or.indices, [0, 1, 3]); assert.deepEqual(or.matched, [1, 1, 0, 2, 0]);
  const union = QE.run(n, { logic: "OR", groups: [{ id: "g1", op: "AND", filters: [{ id: "a" }] }, { id: "g2", op: "AND", filters: [] }, { id: "g3", op: "AND", filters: [{ id: "b" }] }] }, pred, steps);
  assert.deepEqual(union.indices, [0, 1, 3]); assert.deepEqual(union.groups, { g1: 2, g3: 2 });
  assert.deepEqual(union.funnel.at(-1), { kind: "union", label: "Mindestens eine Gruppe erfüllt (ODER)", count: 3, lost: 2, missing: 0 });
  assert.equal(union.funnel[1].standalone, true);
  assert.deepEqual(QE.run(n, { logic: "AND", groups: [{ id: "g1", op: "AND", filters: [] }] }, pred, steps).indices, [0, 1, 2, 3, 4], "ohne Filter: alle");
});

test("Sortierung: fehlende Werte ans Ende, Gleichstand nach Wahl", () => {
  const v = [3, null, 1, null, 3], key = (i) => v[i], miss = (x) => x === null;
  const tie = (a, b) => b - a;
  assert.deepEqual([0, 1, 2, 3, 4].sort(QE.compareBy(key, 1, miss, tie)), [2, 4, 0, 1, 3], "aufsteigend, Gleichstand absteigend nach Index, fehlende stabil");
  assert.deepEqual([0, 1, 2, 3, 4].sort(QE.compareBy(key, -1, miss, tie, true)), [4, 0, 2, 3, 1], "auch fehlende nach Gleichstand");
  assert.deepEqual([0, 1, 2].sort(QE.compareBy(null, 1, miss, tie)), [2, 1, 0], "ohne Schluessel nur Gleichstand");
});

test("Eine Engine: /screener/ und /technical/ werten mit core/query-engine.js aus, keine eigene Gruppenlogik", () => {
  const sc = readFileSync(join(ROOT, "screener/engine/engine.js"), "utf8"), tq = readFileSync(join(ROOT, "quant/engines/technical/technical-query.js"), "utf8");
  for (const [name, src] of [["screener/engine/engine.js", sc], ["technical-query.js", tq]]) {
    assert.match(src, /QE\.run\(/, name + " nutzt QE.run");
    assert.match(src, /QE\.predicate\(/, name + " nutzt QE.predicate");
    assert.match(src, /QE\.compareBy\(/, name + " nutzt QE.compareBy");
    assert.doesNotMatch(src, /function groupPass|Mindestens eine Gruppe/, name + ": keine zweite Gruppenauswertung");
  }
  for (const page of ["screener/index.html", "technical/index.html", "ask/index.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8");
    const at = html.indexOf('src="/core/query-engine.js'), first = Math.min(...["/screener/engine/", "/quant/engines/technical/technical-query.js"].map((s) => { const i = html.indexOf('src="' + s); return i < 0 ? Infinity : i; }));
    assert.ok(at > 0 && at < first, page + " laedt core/query-engine.js vor der Engine");
  }
});
