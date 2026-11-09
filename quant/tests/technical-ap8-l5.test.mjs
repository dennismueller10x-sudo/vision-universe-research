/* AP8 L5: bestaetigte Formationen nach Ausbruchsrichtung (screen-row.js 1.12.0, technical-query.js 1.12.0,
   query-text.js 1.9.0, docs/technical/SCREENER_FIELDS_AP8_L5.md). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const QT = require(join(root, "quant/engines/technical/query-text.js"));
const TRI = ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"];

test("L5: Abfragefelder und Wortsuche (Rundlauf)", () => {
  for (const id of ["formationConfirmedUp", "formationConfirmedDown"]) {
    const f = Q.field(id); assert.ok(f, id); assert.equal(f.kind, "enum"); assert.deepEqual(f.tfs, ["1D"]);
    assert.deepEqual(Object.keys(f.values), Object.keys(Q.field("formationConfirmed").values));
  }
  for (const [field, word] of [["formationConfirmedUp", "bestaetigt-auf:"], ["formationConfirmedDown", "bestaetigt-ab:"]]) {
    const q = Q.validate({ timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field, op: "in", value: TRI }] }] }).query;
    const text = QT.toText(q); assert.ok(text.startsWith(word), text);
    const back = QT.parse(text).query.groups[0].filters[0];
    assert.deepEqual([back.field, back.value], [field, TRI]);
  }
  assert.equal(QT.parse("bestaetigt:symmetrical_triangle").query.groups[0].filters[0].field, "formationConfirmed", "bestehendes Praefix unveraendert");
});

test("L5: Datensatz - Aufteilung von formationConfirmed nach Richtung, deckungsgleich mit der Spalte formations", () => {
  const c = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")).cols;
  if (!c.formationConfirmedUp) return;
  let pairs = 0;
  for (let i = 0; i < c.s.length; i++) {
    const C = c.formationConfirmed[i], U = c.formationConfirmedUp[i], D = c.formationConfirmedDown[i];
    if (C === null) { assert.equal(U, null, c.s[i]); assert.equal(D, null, c.s[i]); continue; }
    for (const t of U.concat(D)) assert.ok(C.includes(t), c.s[i] + ": Richtung ohne Bestaetigung " + t);
    const fm = c.formations[i] || [];
    for (const t of C) {
      const dirs = new Set(fm.filter((e) => e[0] === t && e[1] === "CONFIRMED").map((e) => e[4]));
      assert.equal(U.includes(t), dirs.has("UP"), c.s[i] + " " + t + " UP");
      assert.equal(D.includes(t), dirs.has("DOWN"), c.s[i] + " " + t + " DOWN");
      assert.ok(U.includes(t) || D.includes(t), c.s[i] + ": bestaetigt ohne Richtung " + t);
      pairs++;
    }
  }
  assert.ok(pairs > 1000, "Paare " + pairs);
  // Gerichtete Typen: aufsteigendes Dreieck nur nach oben, absteigendes nur nach unten
  assert.ok(!c.formationConfirmedDown.some((v) => v && v.includes("ASCENDING_TRIANGLE")));
  assert.ok(!c.formationConfirmedUp.some((v) => v && v.includes("DESCENDING_TRIANGLE")));
  for (let i = 0; i < c.s.length; i++) if (c.frozenSince[i]) assert.equal(c.formationConfirmedUp[i], null, c.s[i]);
});

test("L5: Abfrage 'Dreieck mit Ausbruch nach oben' ist Teilmenge der bestaetigten Dreiecke", () => {
  const ds = Q.createDataset(JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")));
  if (!ds.column("formationConfirmedUp")) return;
  const ev = (field) => new Set(Q.evaluate(ds, { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field, op: "in", value: TRI }] }], limit: 500 }).indices);
  const all = Q.evaluate(ds, { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationConfirmed", op: "in", value: TRI }] }], limit: 1 }).count;
  const up = Q.evaluate(ds, { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationConfirmedUp", op: "in", value: TRI }] }], limit: 1 }).count;
  const down = Q.evaluate(ds, { timeframe: "1D", logic: "AND", groups: [{ op: "AND", filters: [{ field: "formationConfirmedDown", op: "in", value: TRI }] }], limit: 1 }).count;
  assert.ok(up > 0 && down > 0 && up <= all && down <= all && up + down >= all, [all, up, down].join("/"));
  assert.ok(ev("formationConfirmedUp").size <= ev("formationConfirmed").size);
});
