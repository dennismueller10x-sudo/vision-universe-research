// Analyse-Assistent (Master Completion 3.0, T1/T2; docs/technical/TECHNICAL_ASSISTANT.md):
// keine zweite Rechnung (Einordnung = templates.js#evaluate auf den Praedikaten von technical-query.js),
// Definitionen gueltig, Auswahl aus der Adresse, Abfrage = Kriterien, Evidenz-Verweise gegen die Artefakte,
// kein Ziel behauptet einen nachgewiesenen Vorteil, keine Signal- oder Renditesprache, Laufzeit.
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
const M = require(join(root, "technical/engine/model.js"));
const ds = Q.createDataset(JSON.parse(readFileSync(join(root, "technical/data/screener-v1.json"), "utf8")));
const signals = JSON.parse(readFileSync(join(root, "technical/data/signal-evidence.json"), "utf8"));
const formations = JSON.parse(readFileSync(join(root, "technical/data/formation-evidence.json"), "utf8"));

test("Assistent: acht Analyseziele aus dem Auftrag, Definitionen gueltig, Begriffe erklaert", () => {
  assert.deepEqual(A.validateAll(), []);
  assert.deepEqual(A.list().map((g) => g.id), ["trendfolge", "ausbruch", "momentum", "trendwende", "ruhephase", "niveaus", "zeitrahmen", "kombination"]);
  for (const g of A.list()) {
    assert.ok(g.purpose && g.method && g.question, g.id + ": Zweck, Methodik, Frage");
    assert.ok(A.defaults(g).length >= 1, g.id + ": Voreinstellung");
    for (const o of g.options) assert.ok(o.term && A.term(o.term), g.id + "/" + o.id + ": Begriff erklaert");
  }
  assert.deepEqual(A.LEVELS.map((l) => l.id), ["METHOD", "CRITERIA", "OBSERVED", "EDGE"]);
  assert.match(A.EDGE_TEXT, /^Nicht nachgewiesen/);
  assert.ok(A.LIMITS.some((l) => /nichts über künftige Kurse/.test(l)));
});

test("Assistent: Sprachpruefung faengt Signal-, Rendite- und Namenssprache", () => {
  const g = A.get("trendfolge"), keep = g.purpose;
  for (const bad of ["Jetzt kaufen", "hohe Rendite", "Trefferquote 70 %", "nach Minervini", "sicherer Gewinn", "Prognose"]) {
    g.purpose = bad;
    assert.ok(A.validateAll().some((e) => e.startsWith("WORDING trendfolge")), bad);
  }
  g.purpose = keep;
  assert.deepEqual(A.validateAll(), []);
});

test("Assistent: Einordnung ist genau templates.js#evaluate auf den Abfrage-Praedikaten (keine zweite Rechnung)", () => {
  const fresh = Q.predicate(ds, T.FRESH, "1D");
  for (const g of A.list()) {
    const opts = A.options(g);
    for (const sel of [A.defaults(g), opts.map((o) => o.id), [opts[opts.length - 1].id]]) {
      const t = A.build(g.id, sel), r = T.evaluate(ds, t);
      assert.deepEqual(t.criteria.map((c) => c.id), opts.filter((o) => sel.includes(o.id)).map((o) => o.id), g.id + ": Reihenfolge wie im Ziel");
      // Erfuellt = UND der Abfrage-Engine ueber dieselben Filter plus aktueller Kurs
      const q = A.toQuery(g.id, sel).query, qr = Q.evaluate(ds, Object.assign({}, q, { limit: 1 }));
      assert.ok(!qr.error, g.id + ": Abfrage gueltig " + JSON.stringify(qr.errors));
      assert.equal(qr.count, r.full.length, g.id + " " + sel.join(",") + ": Treffer Screener = erfuellt");
      // Einzelne Kriterien: Zustand = Praedikat der Abfrage-Engine
      for (const e of r.full.concat(r.near, r.incomplete).slice(0, 200)) {
        assert.equal(fresh(e.i), true);
        t.criteria.forEach((c, k) => {
          const v = Q.predicate(ds, c.filter, "1D")(e.i);
          assert.equal(e.states[k], v === true ? "PASS" : v === false ? "FAIL" : "UNKNOWN", g.id + "/" + c.id);
        });
      }
    }
  }
});

test("Assistent: Auswahl aus der Adresse, Adressen stabil, Chart- und Screener-Parameter", () => {
  const g = A.get("trendfolge"), def = A.defaults(g);
  assert.deepEqual(A.selectionFromParam(g, undefined), def);
  assert.deepEqual(A.selectionFromParam(g, "rsRank70,aboveSma50,unbekannt,aboveSma50"), ["aboveSma50", "rsRank70"]);
  assert.deepEqual(A.selectionFromParam(g, ""), []);
  assert.equal(A.build("trendfolge", []), null);
  assert.equal(A.build("gibtsnicht"), null);
  assert.equal(A.href("trendfolge", def), "#/assistent/trendfolge");
  assert.equal(A.href("trendfolge", ["aboveSma50", "rsRank70"], "fast"), "#/assistent/trendfolge?k=aboveSma50,rsRank70&zeige=fast");
  assert.equal(A.paramsOf("trendfolge", def), "z=trendfolge");
  const fp = A.fromParams({ z: "trendfolge", k: "aboveSma50,rsRank70" });
  assert.deepEqual(fp.template.criteria.map((c) => c.id), ["aboveSma50", "rsRank70"]);
  assert.equal(A.fromParams({ z: "x" }), null);
  // Routen
  assert.deepEqual(M.parseRoute("#/assistent"), { view: "assistant", id: null, params: {} });
  assert.deepEqual(M.parseRoute("#/assistent/ausbruch?k=relVol15"), { view: "assistant", id: "ausbruch", params: { k: "relVol15" } });
  // Abfrage: aktueller Kurs zuerst, dann genau die Kriterien
  const tq = A.toQuery("zeitrahmen");
  assert.deepEqual(tq.query.groups[0].filters[0], T.FRESH);
  assert.deepEqual(tq.query.groups[0].filters.slice(1).map((f) => f.tf || "1D"), ["1D", "1W", "1M"]);
  assert.deepEqual(tq.dropped, []);
});

test("Assistent: Evidenz-Verweise existieren in den Artefakten; kein Ziel stuetzt sich auf eine belastbare Richtung", () => {
  const ind = new Map(signals.indicators.map((r) => [r.id, r])), types = new Set(formations.types.map((t) => t.type));
  assert.equal(signals.claims.strategyEdge, "nicht nachgewiesen");
  for (const g of A.list()) {
    for (const id of g.evidence.signals) {
      assert.ok(ind.has(id), g.id + ": Signal-Evidenz " + id + " fehlt");
      // EDGE lautet "nicht nachgewiesen": eine Zeile, die die uebliche Lesart belastbar stuetzt, verlangt eine neue Textpruefung
      assert.notEqual(ind.get(id).reading, "WITH_DIRECTION", g.id + "/" + id + ": Text pruefen, Einordnung hat sich geaendert");
    }
    for (const t of g.evidence.formations) assert.ok(types.has(t), g.id + ": Formations-Evidenz " + t + " fehlt");
    for (const t of g.evidence.s4) assert.ok(A.S4_TESTED.includes(t), g.id + ": S4 " + t);
    if (g.evidence.s4.length) assert.match(g.evidence.text, /S4/, g.id + ": S4 im Text genannt");
  }
  // S4-Einstufung: Forschung, eingeschraenkt (S4_TEMPLATE_STUDY.md)
  const s4doc = readFileSync(join(root, "docs/technical/S4_TEMPLATE_STUDY.md"), "utf8");
  assert.match(s4doc, new RegExp("Einstufung: `" + A.S4_RATING + "`"));
  assert.match(s4doc, /productionApproved: false/);
});

test("Assistent: Laufzeit aller Ziele mit Voreinstellung unter dem Budget (Median < 150 ms)", () => {
  const times = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    for (const g of A.list()) T.evaluate(ds, A.build(g.id));
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  assert.ok(times[2] < 150, "Median " + times[2].toFixed(1) + " ms");
});
