/* Tests fuer quant/engines/technical/query-text.js (Suchtext -> Abfrage, ohne Modell).

   1. Beispielsaetze aus dem Produktauftrag ergeben die erwartete Abfrage.
   2. Rundreise: parse(toText(q)).query == q fuer alle Vorlagen und fuer
      erzeugte Abfragen ueber jedes Feld des Katalogs.
   3. Ehrlichkeit: Unbekanntes wird gemeldet, nicht geraten; ungueltige
      Kombinationen tragen die stabilen Fehlercodes von validate().
   4. Kein Netzwerk, kein Modell: das Modul enthaelt keinen Aufruf. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../engines/technical/query-text.js");
const Q = require("../engines/technical/technical-query.js");
/* Normalform: Gruppen mit einem Filter haben keinen wirksamen Operator; ODER-Gruppen werden zu "oder"-Teilen. */
function norm(q) {
  const gs = q.groups.flatMap((g) => g.op === "OR" && g.filters.length > 1 ? g.filters.map((f) => ({ op: "AND", filters: [f] })) : [{ op: g.filters.length > 1 ? g.op : "AND", filters: g.filters }]);
  return JSON.parse(JSON.stringify({ ...q, logic: gs.length > 1 ? q.logic === "AND" && q.groups.length === 1 ? "OR" : q.logic : "AND",
    groups: gs.map((g) => ({ op: g.op, filters: g.filters.map(({ id, ...f }) => f) })) }));
}
const filters = (r) => r.query.groups.map((g) => g.filters.map(({ id, ...f }) => f));

test("Beispielsaetze werden vollstaendig und deterministisch uebersetzt", () => {
  const r = P.parse("Dreieckskonsolidierung über der SMA 200 mit steigendem Volumen");
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(filters(r), [[
    { field: "formationActive", op: "in", value: ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"] },
    { field: "aboveSma200", op: "is", value: true }, { field: "volAboveAvg", op: "is", value: true }]]);
  assert.deepEqual(P.parse("Dreieckskonsolidierung über der SMA 200 mit steigendem Volumen"), r, "gleiche Eingabe, gleiche Ausgabe");

  const b = P.parse("Bestätigter Ausbruch mit Volumenspitze und RSI unter 75");
  assert.deepEqual(filters(b)[0][0], { field: "formationConfirmed", op: "in", value: ["RESISTANCE_BREAKOUT", "RANGE_BREAKOUT"] });
  assert.deepEqual(filters(b)[0].slice(1), [{ field: "volSpike", op: "is", value: true }, { field: "rsi14", op: "lt", value: 75 }]);

  /* "oder" zwischen reinen Formationen ist eine Liste, keine neue Gruppe */
  const d = P.parse("Doppelboden oder inverse Schulter-Kopf-Schulter über der 50-Tage-Linie");
  assert.equal(d.query.groups.length, 1);
  assert.deepEqual(filters(d)[0][0].value, ["DOUBLE_BOTTOM", "INVERSE_HEAD_AND_SHOULDERS"]);

  /* "oder" zwischen Bedingungen: zwei Gruppen, "und" bindet staerker */
  const o = P.parse("Golden Cross und ADX über 25 oder 52-Wochen-Hoch");
  assert.equal(o.query.logic, "OR");
  assert.deepEqual(filters(o), [[{ field: "sma50AboveSma200", op: "is", value: true }, { field: "adx", op: "gt", value: 25 }], [{ field: "newHigh52w", op: "is", value: true }]]);

  const w = P.parse("Wochenchart: über der 40-Wochen-Linie und RSI über 50");
  assert.equal(w.query.timeframe, "1W");
  assert.match(Q.describe(w.query), /40-Wochen-Linie/);
});

test("Vergleiche: Operatoren, Kommazahlen, zwischen, Prozentfelder in Prozent", () => {
  const r = P.parse("RSI zwischen 30 und 50, ADX >= 20,5 und Abstand zum 52-Wochen-Hoch über -5 und relVol ≥ 1,5");
  assert.ok(r.ok, JSON.stringify(r.errors) + r.unknown);
  assert.deepEqual(filters(r)[0], [
    { field: "rsi14", op: "between", value: 30, value2: 50 }, { field: "adx", op: "gte", value: 20.5 },
    { field: "distHigh52w", op: "gt", value: -0.05 }, { field: "relVol", op: "gte", value: 1.5 }]);
  assert.deepEqual(filters(P.parse("Tagesänderung über 3%"))[0], [{ field: "chg1d", op: "gt", value: 0.03 }]);
  /* Eine Zahl hinter "über" gehoert nicht zur Kennzahl, wenn sie Teil eines Begriffs ist */
  assert.deepEqual(filters(P.parse("Kurs über 200-Tage-Linie"))[0], [{ field: "aboveSma200", op: "is", value: true }]);
});

test("Unbekanntes wird gemeldet, nicht geraten; Fehlercodes kommen aus validate()", () => {
  const u = P.parse("Dreieck mit Mondphase");
  assert.equal(u.ok, false);
  assert.deepEqual(u.unknown, ["mondphase"]);
  assert.equal(filters(u)[0].length, 1, "der erkannte Teil bleibt auswertbar");

  const tf = P.parse("Woche ADX über 25 und über SMA 200");
  assert.equal(tf.ok, false);
  assert.deepEqual(tf.errors.map((e) => e.code), ["FIELD_NOT_AVAILABLE_FOR_TIMEFRAME"]);
  assert.deepEqual(filters(tf), [[{ field: "aboveSma200", op: "is", value: true }]], "ungueltiger Teil entfaellt sichtbar");

  assert.deepEqual(P.parse("bestätigt über SMA 50").errors.map((e) => e.code), ["CONFIRMED_WITHOUT_FORMATION"]);
  assert.deepEqual(P.parse("").errors.map((e) => e.code), ["EMPTY"]);
  assert.deepEqual(P.parse("formation:MOND").errors.map((e) => e.code), ["UNKNOWN_FORMATION", "EMPTY"]);
  assert.deepEqual(P.parse("RSI zwischen 50 und 30").errors.map((e) => e.code), ["INVALID_VALUE2"]);
});

test("Rundreise: alle Vorlagen und erzeugte Abfragen ueber jedes Feld", () => {
  for (const p of Q.PRESETS) {
    const q = Q.validate(Object.assign({ limit: 100 }, p.query)).query, back = P.parse(P.toText(q));
    assert.ok(back.ok, p.id + ": " + JSON.stringify(back.errors) + back.unknown);
    assert.deepEqual(norm(back.query), norm(q), p.id);
  }
  const ops = { num: ["gt", "gte", "lt", "lte", "between"], pct: ["gt", "lt", "between"] };
  for (const tf of Object.keys(Q.TIMEFRAMES)) {
    const fs = Q.FIELDS.filter((f) => f.tfs.includes(tf));
    fs.forEach((f, i) => {
      let flt;
      if (f.kind === "bool") flt = { field: f.id, op: "is", value: i % 2 === 0 };
      else if (f.kind === "enum") flt = { field: f.id, op: "in", value: Object.keys(f.values).slice(0, 1 + (i % 3)) };
      else { const op = ops[f.kind][i % ops[f.kind].length], v = f.kind === "pct" ? -0.125 : 12.5; flt = { field: f.id, op, value: v }; if (op === "between") flt.value2 = f.kind === "pct" ? 0.3 : 70; }
      const q = Q.validate({ timeframe: tf, logic: "AND", groups: [{ op: "AND", filters: [flt] }], sort: null, limit: 100 }).query;
      const back = P.parse(P.toText(q));
      assert.ok(back.ok, f.id + "@" + tf + " " + P.toText(q) + " " + JSON.stringify(back.errors) + back.unknown);
      assert.deepEqual(norm(back.query), norm(q), f.id + "@" + tf);
    });
  }
  const multi = Q.validate({ timeframe: "1D", logic: "OR", groups: [{ op: "AND", filters: [{ field: "aboveSma200", op: "is", value: true }, { field: "rsi14", op: "lt", value: 40 }] }, { op: "AND", filters: [{ field: "volSpike", op: "is", value: true }] }], sort: { field: "relVol", dir: "desc" }, limit: 100 }).query;
  assert.deepEqual(norm(P.parse(P.toText(multi)).query), norm(multi), "Gruppen und Sortierung");
  const mixed = { timeframe: "1D", logic: "AND", groups: [{ op: "OR", filters: [{ field: "aboveSma200", op: "is", value: true }, { field: "volSpike", op: "is", value: true }] }, { op: "AND", filters: [{ field: "adx", op: "gt", value: 20 }] }] };
  assert.equal(P.toText(mixed), null, "(A oder B) und C ist als Text nicht darstellbar und wird nicht verfaelscht");
});

test("Modellvertrag: vorbereitet, nicht aktiv; Beispiele sind gueltige Abfragen; kein Netzwerkcode", () => {
  const c = P.contract();
  assert.equal(c.status, "VORBEREITET_NICHT_AKTIV");
  assert.equal(c.schema.$id, "vu-technical-query-1");
  for (const e of c.examples) assert.ok(Q.validate(e.query).ok && e.query.groups.length, e.text);
  const src = readFileSync(new URL("../engines/technical/query-text.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|https?:\/\/(?!json-schema)/, "kein Aufruf nach aussen");
});
