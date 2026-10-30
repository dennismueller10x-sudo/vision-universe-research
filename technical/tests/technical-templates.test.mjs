// Strategie-Vorlagen (AP8 S1, docs/technical/STRATEGY_TEMPLATES_PLAN.md):
// Definitionen gueltig, drei Zustaende je Kriterium (unbekannt zaehlt nie als erfuellt), Einordnung,
// Ausbruchsrichtung, Gleichheit mit der Abfrage-Engine, Index-Zaehlung, Adressen, Laufzeit.
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
const M = require(join(root, "technical/engine/model.js"));
const artifact = JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8"));
const ds = Q.createDataset(artifact);
const TRI = ["SYMMETRICAL_TRIANGLE", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE"];

test("Vorlagen: Definitionen gueltig, Freigabe-Umfang S1, keine Signal- oder Renditesprache", () => {
  assert.deepEqual(T.validateAll(), []);
  const ids = T.list().map((t) => t.id);
  for (const p of Q.PRESETS) assert.ok(ids.includes(p.id), "bestehende Vorlage fehlt: " + p.id);
  for (const id of ["uptrendBasic", "triangleOpen", "triangleOpenUptrend", "triangleBreakoutUp"]) assert.ok(ids.includes(id), id);
  assert.equal(ids.length, Q.PRESETS.length + 4, "keine zusaetzlichen Vorlagen ausser V1a und V2");
  assert.deepEqual(T.BLOCKS.map((b) => b.id), ["kurz", "mittel", "lang", "stark"]);
  assert.match(T.LIMITS, /kein Kauf- oder Verkaufssignal/);
  for (const t of T.list()) assert.ok(T.GROUPS.some((g) => g.id === t.group), t.id + ": Gruppe");
  // Bestehende Vorlagen: Kriterien = Filter der Abfrage (Logik unveraendert)
  for (const p of Q.PRESETS) {
    const t = T.get(p.id), filters = p.query.groups.flatMap((g) => g.filters);
    assert.deepEqual(t.criteria.map((c) => c.filter.field), filters.map((f) => f.field), p.id);
  }
  // V1a: genau die 5 vereinbarten Kriterien
  assert.deepEqual(T.get("uptrendBasic").criteria.map((c) => [c.filter.field, c.filter.op, c.filter.value]),
    [["aboveSma50", "is", true], ["aboveSma200", "is", true], ["sma50AboveSma200", "is", true], ["distHigh52w", "gte", -0.25], ["rs6m", "gt", 0]]);
});

test("Vorlagen: Einordnung je Titel aus den Praedikaten; unbekannt zaehlt nie als erfuellt; nur aktuelle Kurse", () => {
  const fresh = Q.predicate(ds, T.FRESH, "1D");
  for (const t of T.list().concat([T.compose("uptrendBasic", ["kurz", "mittel", "lang", "stark"])])) {
    const r = T.evaluate(ds, t), preds = t.criteria.map((c) => T.predicate(ds, c.filter));
    const want = { full: [], near: [], incomplete: [] };
    let excluded = 0;
    for (let i = 0; i < ds.size; i++) {
      if (fresh(i) !== true) { excluded++; continue; }
      const v = preds.map((p) => p(i)), fail = v.filter((x) => x === false).length, unk = v.filter((x) => x !== true && x !== false).length;
      if (!fail && !unk) want.full.push(i);
      else if (fail === 1 && !unk && v.length >= T.NEAR_MIN) want.near.push(i);
      else if (!fail && unk) want.incomplete.push(i);
    }
    assert.equal(r.excluded, excluded, t.id);
    for (const k of ["full", "near", "incomplete"]) assert.deepEqual(r[k].map((e) => e.i).sort((a, b) => a - b), want[k], t.id + " " + k);
    if (t.criteria.length < T.NEAR_MIN) assert.equal(r.near.length, 0, t.id + ": fast erfuellt erst ab " + T.NEAR_MIN + " Kriterien");
    for (const e of r.full) assert.ok(e.states.every((s) => s === "PASS"));
    for (const e of r.near) assert.equal(e.states.filter((s) => s === "FAIL").length, 1);
    for (const e of r.incomplete) assert.ok(e.states.includes("UNKNOWN") && !e.states.includes("FAIL"));
  }
  // Ausgeschlossen = Titel ohne aktuellen Kurs (AP1)
  assert.equal(T.evaluate(ds, T.get("trend")).excluded, artifact.cols.fresh.filter((x) => x !== true).length);
});

test("Vorlagen: kuenstlicher Datensatz - Fehlwerte ergeben UNKNOWN, nie PASS", () => {
  const cols = { s: ["A", "B", "C", "D", "E"], fresh: [true, true, true, true, false],
    aboveSma50: [true, true, null, false, true], aboveSma200: [true, true, true, true, true], sma50AboveSma200: [true, false, true, true, true],
    distHigh52w: [-0.1, -0.1, -0.1, null, -0.1], rs6m: [0.2, 0.2, 0.2, 0.2, 0.2] };
  const d = Q.createDataset({ cols });
  const r = T.evaluate(d, T.get("uptrendBasic"));
  assert.deepEqual(r.full.map((e) => e.i), [0]);
  assert.deepEqual(r.near.map((e) => e.i), [1]);
  assert.deepEqual(r.incomplete.map((e) => e.i), [2]);
  assert.equal(r.excluded, 1);
  assert.deepEqual(r.incomplete[0].states, ["UNKNOWN", "PASS", "PASS", "PASS", "PASS"]);
  // D: ein FAIL und ein UNKNOWN -> weder fast erfuellt noch unvollstaendig
  assert.equal(T.checklist(d, T.get("uptrendBasic"), "D").status, "NONE");
  assert.equal(T.checklist(d, T.get("uptrendBasic"), "C").status, "INCOMPLETE");
  assert.equal(T.checklist(d, T.get("uptrendBasic"), "E").status, "EXCLUDED");
  assert.equal(T.checklist(d, T.get("uptrendBasic"), "ZZ"), null);
});

test("Vorlagen: Ausbruchsrichtung liest nur bestaetigte Dreiecke; nach oben und nach unten getrennt", () => {
  const up = T.predicate(ds, { kind: "formationDirection", types: TRI, direction: "UP" });
  const down = T.predicate(ds, { kind: "formationDirection", types: TRI, direction: "DOWN" });
  const conf = Q.predicate(ds, { field: "formationConfirmed", op: "in", value: TRI }, "1D");
  let nUp = 0, nDown = 0, nConf = 0;
  for (let i = 0; i < ds.size; i++) {
    const c = conf(i), u = up(i), d = down(i);
    if (c === null) { assert.equal(u, null); continue; }
    if (c) nConf++;
    if (u) { nUp++; assert.equal(c, true, "Richtung ohne bestaetigtes Dreieck"); }
    if (d) nDown++;
    if (c) assert.ok(u || d, ds.cols.s[i] + ": bestaetigtes Dreieck ohne Richtung");
  }
  assert.ok(nUp > 0 && nDown > 0 && nUp + nDown >= nConf);
  const r = T.evaluate(ds, T.get("triangleBreakoutUp"));
  for (const e of r.full) assert.ok(up(e.i) === true);
  assert.equal(T.toQuery(T.get("triangleBreakoutUp")).dropped.length, 1, "Richtung ist im Baukasten nicht waehlbar und wird genannt");
});

test("Vorlagen: erfuellt = Abfrage-Engine mit denselben Filtern (ohne Richtungskriterium)", () => {
  for (const t of T.list().concat(T.BLOCKS.map((b) => T.compose("uptrendBasic", [b.id])))) {
    const tq = T.toQuery(t);
    if (tq.dropped.length) continue;
    assert.equal(Q.evaluate(ds, Object.assign({}, tq.query, { limit: 1 })).count, T.evaluate(ds, t).full.length, t.id);
  }
  // Trendfilter: doppelte Kriterien nur einmal
  const t = T.compose("uptrendBasic", ["mittel", "mittel", "lang", "gibtsnicht"]);
  assert.deepEqual(t.blocks, ["mittel", "lang"]);
  assert.equal(t.criteria.length, 6);
});

test("Vorlagen: Zaehlung im Index entspricht der Auswertung", () => {
  const ix = JSON.parse(readFileSync(join(root, "technical/data/index-v1.json"), "utf8"));
  assert.equal(ix.schemaVersion, M.INDEX_SCHEMA);
  assert.deepEqual(ix.templates, T.counts(ds));
  assert.deepEqual(M.homeIndex(artifact).templates, ix.templates);
});

test("Vorlagen: Adressen, gespeicherte Vorlagen und Chart-Verweis", () => {
  assert.deepEqual(M.parseRoute("#/vorlagen"), { view: "templates", id: null, params: {} });
  const r = M.parseRoute(T.href("uptrendBasic", ["mittel", "lang"], "fast"));
  assert.equal(r.view, "templates"); assert.equal(r.id, "uptrendBasic");
  assert.deepEqual(T.blocksFromParam(r.params.plus), ["mittel", "lang"]); assert.equal(r.params.zeige, "fast");
  assert.equal(T.href("trend"), "#/vorlagen/trend");
  const saved = M.parseRoute("#/screener?" + T.paramsOf("uptrendBasic", ["lang"])).params;
  assert.deepEqual([saved.vorlage, saved.plus], ["uptrendBasic", "lang"]);
  assert.equal(M.chartHref("NVDA", null, "v=trend"), "#/chart/NVDA?v=trend");
  assert.equal(M.parseRoute(M.chartHref("NVDA", null, "v=trend&plus=lang")).params.v, "trend");
  // Jedes Kriterium hat eine Darstellung im Chart Studio
  for (const t of T.list().concat(T.BLOCKS)) for (const c of t.criteria) {
    if (c.filter.kind) continue;
    assert.ok(M.FIELD_CHART[c.filter.field] || /^formation/.test(c.filter.field), t.id + "/" + c.id + ": keine Chart-Darstellung");
  }
});

test("Vorlagen: Laufzeit - alle Vorlagen ueber das ganze Universum unter 250 ms (Median)", () => {
  const runs = [];
  for (let k = 0; k < 5; k++) { const t0 = performance.now(); T.counts(ds); runs.push(performance.now() - t0); }
  runs.sort((a, b) => a - b);
  assert.ok(runs[2] < 250, "Median " + runs[2].toFixed(1) + " ms");
});
