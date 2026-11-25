/* K3 (Live-Messung 23.11.2026, Screener LCP 10 s): Der erste Bildschirm ohne Regel laedt den vollen Datensatz nicht.
   Zusagen: (1) die Zahlen der Schiene aus dem Index sind die der Rechnung auf dem Datensatz, (2) jede Adresse mit Regel
   laedt den Datensatz wie bisher, (3) der Filter zeigt beim Nachladen einen Hinweis. Nur Darstellung. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.VUTechnical = globalThis.VUTechnical || {};
require("../../core/query-engine.js");
const Q = require("../../quant/engines/technical/technical-query.js");
const TPL = require("../engine/templates.js");
const M = require("../engine/model.js");
const app = readFileSync("technical/app.js", "utf8");
const view = app.slice(app.indexOf("function viewScreener(main, route)"), app.indexOf("/** Filter-Sheet (T02 b)"));

test("Schiene: Zahlen aus index-v1.json = Rechnung auf dem Datensatz (je Vorlage der Schiene)", () => {
  const ds = Q.createDataset(JSON.parse(readFileSync("technical/data/screener-v1.json", "utf8")));
  const idx = JSON.parse(readFileSync("technical/data/index-v1.json", "utf8"));
  const ids = [...app.match(/var HOME_SEARCHES = \[(.*?)\];/s)[1].matchAll(/\["([A-Za-z0-9]+)",/g)].map((m) => m[1]);
  assert.ok(ids.length >= 4, "Schiene gefunden");
  for (const id of ids) {
    const q = TPL.toQuery(TPL.compose(id, []));
    assert.ok(q && idx.templates[id], id);
    assert.equal(idx.templates[id][0], Q.evaluate(ds, Object.assign({}, q.query, { limit: 1 })).count, id);
  }
});

test("Ohne Regel in der Adresse keine Bedingung, mit Regel mindestens eine (dann laedt der Datensatz wie bisher)", () => {
  const n = (p) => M.queryFromState(M.stateFromParams(p)).query.groups.length;
  assert.equal(n({}), 0);
  assert.equal(n({ sort: "rs6m" }), 0);
  for (const p of [{ muster: "dreieck" }, { trend: "ueber200" }, { vol: "1" }, { rsi: "30" }]) {
    const s = M.stateFromParams(p);
    assert.equal(M.queryFromState(s).query.groups.length > 0, s.patterns.length + s.trends.length > 0 || s.vol || s.rsiMax != null, JSON.stringify(p));
  }
});

test("Leichter Zustand nur ohne Vorlage, Assistent, Suche in Worten, fertige Suche und ohne geladenen Datensatz", () => {
  assert.match(view, /var idle = !dataset && !preset && !parsed && !tplFrom && M\.queryFromState\(st\)\.query\.groups\.length === 0;/);
  assert.match(view, /idle \? loadIndex\(\)/);
  assert.match(view, /Promise\.all\(\[loadScreener\(\), loadSpark\(\)\]\)/);
});

test("Filter im leichten Zustand: sichtbarer Hinweis, Datensatz laden, dann das Sheet; Fehler wird gesagt", () => {
  assert.match(view, /function openFilter\(\) \{\s*if \(!light\) \{ filterSheet\(D, st\); return; \}/);
  assert.match(view, /Der Filter lädt gerade den Screener-Datensatz/);
  assert.match(view, /loadScreener\(\)\.then\(function \(full\) \{ note\.remove\(\); filterSheet\(full, st\); \}/);
  assert.match(view, /Der Screener-Datensatz konnte nicht geladen werden/);
  assert.equal((view.match(/onclick: openFilter/g) || []).length, 3, "alle drei Filter-Knoepfe");
});
