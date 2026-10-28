/* Zeitbezug veralteter Titel (screen-row 1.10.0, AP1, docs/technical/SCREENER_FRESHNESS.md).
   Ein Titel, dessen letzter Bar vor dem Stichtag des Universums liegt, darf kein Ereignis und keinen Stichtagszustand
   melden; Niveaus bleiben Stand des letzten Kurses. Referenz: echte AAPL-Tagesbars (Fixture). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Row = require("../engines/technical/screen-row.js");
const Q = require("../engines/technical/technical-query.js");

const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const n = ref.date.length;
const bars = { timestamps: ref.date.slice(n - 270), open: ref.open.slice(n - 270), high: ref.high.slice(n - 270), low: ref.low.slice(n - 270),
  close: ref.close.slice(n - 270), volume: ref.volume.slice(n - 270) };
const asOf = bars.timestamps[269];
const row = (universeAsOf) => Row.computeRow({ ticker: "AAPL", bars, features: {}, chartSeries: null, universeAsOf });
const ALL = Row.STALE_EVENT_FIELDS.concat(Row.STALE_DAY_FIELDS, ...Row.STALE_TF_FIELDS.map((k) => [k, k + "@1W", k + "@1M"]));

test("frischer Titel: unveraendert gegenueber der Zeile ohne Stichtag", () => {
  const a = row(asOf), b = row(null);
  assert.equal(a.fresh, true);
  assert.equal(b.fresh, null);
  delete a.fresh; delete b.fresh;
  assert.deepEqual(a, b);
});

test("veralteter Titel: Ereignisse, Pruefraeume und Stichtagsfelder null, Niveaus erhalten", () => {
  const fresh = row(asOf), stale = row("2099-01-02");
  assert.equal(stale.fresh, false);
  assert.ok(ALL.filter((k) => k in fresh && fresh[k] !== null).length >= 10, "die Referenz hat belegte Ereignisfelder");
  for (const k of ALL) if (k in stale) assert.equal(stale[k], null, k);
  for (const k of ["close", "rsi14", "distHigh52w", "aboveCloud", "roc63", "rsi14@1W", "formationActive", "asOf", "spark"]) assert.deepEqual(stale[k], fresh[k], k);
});

test("jedes Ereignis- und Stichtagsfeld des Abfragekatalogs ist erfasst (neue Felder brauchen eine Entscheidung)", () => {
  /* Ereignisse = Feld mit Pruefraum; Stichtagszustaende = feste Liste. Ein neues Feld dieser Art ohne Eintrag in
     screen-row.js#STALE_* faellt hier auf. */
  const events = Q.FIELDS.filter((f) => f.window).map((f) => f.id);
  for (const id of events) assert.ok(Row.STALE_EVENT_FIELDS.includes(id), id);
  for (const f of Q.FIELDS.filter((x) => x.window)) assert.ok(Row.STALE_EVENT_FIELDS.includes(f.window), f.window);
});

test("Abfrage: veralteter Titel ist bei Ereignisfiltern unbekannt (null), bei Niveaufiltern entscheidbar", () => {
  const rows = [row(asOf), Object.assign(row("2099-01-02"), { s: "OLD" })];
  const cols = {}; Object.keys(rows[0]).forEach((k) => { cols[k] = rows.map((r) => r[k]); });
  const ds = Q.createDataset({ cols });
  const hit = (filters) => Q.evaluate(ds, { timeframe: "1D", groups: [{ filters }] }).indices.map((i) => cols.s[i]);
  assert.ok(!hit([{ field: "nr7", op: "is", value: false }]).includes("OLD"));
  assert.ok(!hit([{ field: "goldenCrossDays", op: "gte", value: 0 }]).includes("OLD"));
  assert.ok(!hit([{ field: "candleBullDays", op: "gt", value: 1000 }]).includes("OLD"), "kein Pruefraum: auch 'lange her' ist unbekannt");
  assert.ok(hit([{ field: "williamsR", op: "lte", value: 0 }]).includes("OLD"), "Niveau bleibt filterbar");
});
