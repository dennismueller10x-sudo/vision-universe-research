/* Datenvertrag v1 (AP2, docs/technical/DATA_CONTRACT.md): committete Artefakte erfuellen den Vertrag, jede Regel erkennt
   einen konstruierten Verstoss, die Doku ist aus dem Vertrag erzeugt, Spalten und Abfragekatalog decken sich. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const C = require(join(root, "quant/engines/technical/screener-contract.js"));
const Q = require(join(root, "quant/engines/technical/technical-query.js"));
const Identity = require(join(root, "core/identity.js"));
const load = (f) => JSON.parse(readFileSync(join(root, "technical/data", f), "utf8"));
const artifact = load("screener-v1.json"), meta = load("meta.json"), index = load("index-v1.json");
const copy = () => JSON.parse(JSON.stringify(artifact));

test("committete Artefakte erfuellen den Vertrag", () => {
  const r = C.check(artifact, meta, index);
  assert.deepEqual(r.counts, {}, JSON.stringify(r.errors.slice(0, 5)));
  assert.equal(r.checked, artifact.count);
});

test("securityId je Zeile = core/identity.js (ADR-001)", () => {
  const c = artifact.cols;
  for (let i = 0; i < c.s.length; i++) assert.equal(c.sid[i], Identity.securityIdForTicker(c.s[i]), c.s[i]);
});

test("jede Regel erkennt einen konstruierten Verstoss", () => {
  const cases = [
    ["UNKNOWN_COLUMN", (a) => { a.cols.neu = a.cols.s.map(() => null); }],
    ["MISSING_COLUMN", (a) => { delete a.cols.rsi14; }],
    ["LENGTH", (a) => { a.cols.rsi14 = a.cols.rsi14.slice(1); }],
    ["TYPE", (a) => { a.cols.aboveSma200[0] = "ja"; }],
    ["RANGE", (a) => { a.cols.rsi14[0] = 100.5; }],
    ["RANGE", (a) => { a.cols.distHigh52w[0] = 0.01; }],
    ["INTEGER", (a) => { a.cols.goldenCrossDays[0] = 1.5; }],
    ["ENUM", (a) => { a.cols.structure[0] = "SIDEWAYS"; }],
    ["ENUM", (a) => { a.cols.formationActive[0] = ["KEIN_TYP"]; }],
    ["DUPLICATE", (a) => { a.cols.formationActive[0] = ["RECTANGLE", "RECTANGLE"]; }],
    ["NULL", (a) => { a.cols.s[0] = null; }],
    ["DUPLICATE_TICKER", (a) => { a.cols.s[1] = a.cols.s[0]; }],
    ["AFTER_ASOF", (a) => { a.cols.suspectJumpAt[0] = "2099-01-01"; }],
    ["FORMATION", (a) => { a.cols.formations[0] = [["RECTANGLE", "INVALIDATED", "2026-01-02", null, null, ""]]; }],
    ["FORMATION_BREAKOUT", (a) => { a.cols.formations[0] = [["RECTANGLE", "CONFIRMED", "2026-01-02", "2026-01-01", "UP", ""]]; }],
    ["DAYS_OUTSIDE_WINDOW", (a) => { const i = a.cols.smaCrossWindow.findIndex((w) => w !== null); a.cols.goldenCrossDays[i] = a.cols.smaCrossWindow[i]; }],
    ["DAYS_WITHOUT_WINDOW", (a) => { a.cols.candleWindow[0] = null; a.cols.candleBullDays[0] = 3; }],
    ["FRESH_NOT_ON_ASOF", (a) => { a.cols.fresh[0] = true; a.cols.asOf[0] = "2020-01-02"; }],
    ["FROZEN_BUT_FRESH", (a) => { a.cols.frozenSince = a.cols.s.map(() => null); a.cols.frozenSince[0] = "2025-09-25"; a.cols.fresh[0] = true; }],
    ["COUNT", (a) => { a.count += 1; }],
    ["SCHEMA", (a) => { a.schemaVersion = "vu-technical-screener-2.0.0"; }]
  ];
  for (const [code, mutate] of cases) {
    const a = copy(); mutate(a);
    const r = C.check(a);
    assert.ok(r.counts[code] >= 1, code + " erwartet, erhalten " + JSON.stringify(r.counts));
  }
  const m = JSON.parse(JSON.stringify(meta)); m.counts.fresh += 1;
  assert.ok(C.check(artifact, m).counts.META_COUNT, "meta.counts.fresh");
  const ix = JSON.parse(JSON.stringify(index)); ix.s = ix.s.concat(["ZZZZ_FEHLT"]); ix.count = ix.s.length;
  assert.ok(C.check(artifact, null, ix).counts.INDEX_UNKNOWN_TICKER, "Index-Kuerzel ohne Zeile");
  /* Choppiness nach oben offen (Vertrag 1.2.1): Kurssprung, danach enge Spanne -> ueber 100 (BMBL 31.10.2026: 131,4). */
  const ch = copy(); ch.cols.choppiness14 = ch.cols.choppiness14.slice(); ch.cols.choppiness14[0] = 131.4;
  assert.equal(C.check(ch).counts.RANGE, undefined, "Choppiness ueber 100 ist gueltig");
  const chn = copy(); chn.cols.choppiness14 = chn.cols.choppiness14.slice(); chn.cols.choppiness14[0] = -1;
  assert.ok(C.check(chn).counts.RANGE, "negativer Choppiness bleibt ein Verstoss");
  /* spark-v1.json (Vertrag 1.2.0): gleiche Reihenfolge, gleicher Stichtag, Werte 0..99. */
  const sp = JSON.parse(readFileSync(new URL("../data/spark-v1.json", import.meta.url), "utf8"));
  assert.deepEqual(C.check(artifact, null, null, sp).errors, []);
  assert.equal(artifact.cols.spark, undefined, "spark ist nicht mehr im Screener-Datensatz");
  const sw = JSON.parse(JSON.stringify(sp)); [sw.s[0], sw.s[1]] = [sw.s[1], sw.s[0]];
  assert.ok(C.check(artifact, null, null, sw).counts.SPARK_ORDER, "Reihenfolge");
  const sv = JSON.parse(JSON.stringify(sp)); sv.spark[0] = [120];
  assert.ok(C.check(artifact, null, null, sv).counts.RANGE, "Wert ausserhalb 0..99");
  const sa = JSON.parse(JSON.stringify(sp)); sa.asOf = "2000-01-03";
  assert.ok(C.check(artifact, null, null, sa).counts.SPARK_ASOF, "Stichtag");
});

test("Abfragekatalog und Spalten decken sich: jedes Feld je Zeitrahmen ist eine Vertragsspalte und umgekehrt", () => {
  const spec = C.columns();
  for (const f of Q.FIELDS) for (const tf of f.tfs) assert.ok(spec[Q.columnKey(f.id, tf)], f.id + "@" + tf);
  for (const k of Object.keys(artifact.cols)) assert.ok(spec[k], "Spalte ohne Vertrag: " + k);
});

test("Marktstruktur: jeder Wert der Spalte ist im Katalog waehlbar (Befund 28.10.: MIXED, UNDETERMINED fehlten)", () => {
  const seen = new Set(artifact.cols.structure.filter(Boolean));
  for (const v of seen) assert.ok(Q.STRUCTURES[v], v + " nicht waehlbar");
  assert.ok(!Q.STRUCTURES.NEUTRAL && Q.STRUCTURES_LEGACY.NEUTRAL, "NEUTRAL nur noch Altwert");
  assert.equal(Q.validate({ timeframe: "1D", groups: [{ filters: [{ field: "structure", op: "in", value: ["NEUTRAL"] }] }] }).ok, true, "gespeicherte Suche bleibt gueltig");
});

test("DATA_CONTRACT.md ist aus dem Vertrag erzeugt (node scripts/technical/contract-doc.mjs)", async () => {
  const D = await import(join(root, "scripts/technical/contract-doc.mjs"));
  const text = readFileSync(D.DOC, "utf8");
  assert.equal(D.render(text), text);
});
