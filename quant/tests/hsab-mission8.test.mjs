/* Mission VIII — Historical Structural Accuracy Benchmark: Outcome-Regeln, Kausalitaet (Praefix-Identitaet,
   vergiftete Zukunft), Siegel- und Holdout-Schutz, Veroeffentlichungshygiene. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SO = require(join(ROOT, "scripts/technical/hsab/lib/structural-outcomes.cjs"));
const { loadWeekly, weeklySeriesFromPoints } = await import(join(ROOT, "scripts/technical/lib/ti-data.mjs"));
const Core = await import(join(ROOT, "scripts/technical/hsab/lib/replay-core.mjs"));

/** OHLC-Serie aus Zeilen [h, l, c] */
const ser = (rows) => ({ high: rows.map((r) => r[0]), low: rows.map((r) => r[1]), close: rows.map((r) => r[2]) });
const bull = { dir: 1, inv: 95, t1Lo: 110, t1Hi: 112, t2Lo: 120, t2Hi: 122, conf: 104 };

test("HSAB-O1 Ziel 1 vor Invalidation = Erfolg; Ziel 2 und Bestaetigung getrennt", () => {
  const s = ser([[100, 100, 100], [103, 99, 102], [106, 101, 105], [111, 104, 109], [121, 108, 118]]);
  const o = SO.primaryOutcome(s, 0, bull, 26);
  assert.equal(o.outcome, "TARGET1"); assert.equal(o.success, true); assert.equal(o.bars, 3);
  assert.equal(o.confirmed, true);
  assert.equal(o.t2, true);
});

test("HSAB-O2 Schluss jenseits der Invalidation vor dem Ziel = INVALIDATED; Docht unter der Grenze reicht nicht", () => {
  const s = ser([[100, 100, 100], [101, 90, 96], [100, 93, 94], [115, 94, 112]]);
  const o = SO.primaryOutcome(s, 0, bull, 26);
  assert.equal(o.outcome, "INVALIDATED"); assert.equal(o.bars, 2); assert.equal(o.success, false);
});

test("HSAB-O3 Ziel und Invalidation in derselben Bar = AMBIGUOUS_SAME_BAR, kein Erfolg (konservativ)", () => {
  const s = ser([[100, 100, 100], [111, 90, 94]]);
  const o = SO.primaryOutcome(s, 0, bull, 26);
  assert.equal(o.outcome, "AMBIGUOUS_SAME_BAR"); assert.equal(o.success, false);
});

test("HSAB-O4 Zeitablauf, Zensur, triviales Ziel, bereits ungueltig", () => {
  const flat = ser(Array.from({ length: 30 }, () => [101, 99, 100]));
  assert.equal(SO.primaryOutcome(flat, 0, bull, 26).outcome, "TIMEOUT");
  assert.equal(SO.primaryOutcome(flat, 10, bull, 26).outcome, "CENSORED");
  assert.equal(SO.primaryOutcome(ser([[111, 109, 110.5], [112, 110, 111]]), 0, bull, 26).outcome, "TRIVIAL_TARGET");
  assert.equal(SO.primaryOutcome(ser([[95, 93, 94], [112, 94, 111]]), 0, bull, 26).outcome, "ALREADY_INVALID");
});

test("HSAB-O5 baerisch spiegelbildlich; Wochenschluss-Reihe (O=H=L=C) beruehrt nur per Schluss", () => {
  const bear = { dir: -1, inv: 105, t1Lo: 88, t1Hi: 90, t2Lo: null, t2Hi: null, conf: null };
  const s = ser([[100, 100, 100], [100, 89, 97], [96, 91, 92]]);
  assert.equal(SO.primaryOutcome(s, 0, bear, 26).outcome, "TARGET1");
  const w = ser([[100, 100, 100], [97, 97, 97], [91, 91, 91], [90, 90, 90]]);
  assert.equal(SO.primaryOutcome(w, 0, bear, 26).bars, 3);
});

test("HSAB-O6 Barriere symmetrisch, ATR-Geometrie hin und zurueck", () => {
  const up = ser([[100, 100, 100], [102, 102, 102], [104.5, 104.5, 104.5]]);
  assert.equal(SO.barrier(up, 0, 1, 2, 2, 26), 1);
  assert.equal(SO.barrier(up, 0, -1, 2, 2, 26), 0);
  const ag = SO.atrGeometry(bull, 100, 2.5);
  assert.deepEqual([ag.kT, ag.kI], [4, 2]);
  const g = SO.applyAtrGeometry(ag, 50, 1);
  assert.equal(g.t1Lo, 54); assert.equal(g.inv, 48);
  assert.equal(SO.applyAtrGeometry({ dir: 1, kT: 1, kI: 80, kT2: null }, 50, 1), null, "negative Grenze → keine Kontrolle");
});

function truncated(series, t) {
  const pts = []; for (let i = 0; i <= t; i++) pts.push([series.timestamps[i], series.close[i]]);
  return weeklySeriesFromPoints(pts, series.instrumentId);
}
const strip = (r) => { const x = { ...r }; delete x._state; return JSON.stringify(x); };

test("HSAB-C1 Praefix-Identitaet: Record an t aus abgeschnittener Reihe == Record aus voller Reihe (alle Felder)", () => {
  for (const id of ["ref_AAPL", "ref_XOM"]) {
    const s = loadWeekly(id), P = Core.prepareSeries(s), ev = Core.detectionPoints(P, s.length, 160);
    for (const t of [ev[3], ev[Math.floor(ev.length / 2)], ev[ev.length - 2]]) {
      const full = Core.recordAt(P, s, t, { symbol: id, cohort: "T" });
      const st = truncated(s, t), Pt = Core.prepareSeries(st);
      assert.ok(Core.detectionPoints(Pt, st.length, 160).includes(t), "Erkennungszeitpunkt kausal");
      assert.equal(strip(Core.recordAt(Pt, st, t, { symbol: id, cohort: "T" })), strip(full), id + " @ " + s.timestamps[t]);
    }
  }
});

test("HSAB-C2 vergiftete Zukunft: extreme Kurse nach t aendern den Record an t nicht", () => {
  const s = loadWeekly("ref_JPM"), P = Core.prepareSeries(s), ev = Core.detectionPoints(P, s.length, 160), t = ev[Math.floor(ev.length * 0.6)];
  const base = strip(Core.recordAt(P, s, t, { symbol: "J", cohort: "T" }));
  const pts = []; for (let i = 0; i < s.length; i++) pts.push([s.timestamps[i], i <= t ? s.close[i] : s.close[t] * (i % 2 ? 9 : 0.05)]);
  const sp = weeklySeriesFromPoints(pts, "J"), Pp = Core.prepareSeries(sp);
  assert.equal(strip(Core.recordAt(Pp, sp, t, { symbol: "J", cohort: "T" })), base);
});

test("HSAB-C3 Variante FULL baut das Produkt-Hauptszenario bitgleich nach (Selbstpruefung wirft sonst)", () => {
  const s = loadWeekly("ref_MSFT"), P = Core.prepareSeries(s), ev = Core.detectionPoints(P, s.length, 160);
  for (const t of ev.slice(-5)) { const r = Core.recordAt(P, s, t, { symbol: "M", cohort: "T" }); assert.ok(r.V.FULL); assert.equal(r.V.FULL[0], r.P ? r.P.dir : null); }
});

test("HSAB-S1 Siegel: VALIDATION/HOLDOUT verlangen Freeze bzw. Praeregistrierungs-Hash", async () => {
  const { evaluate } = await import(join(ROOT, "scripts/technical/hsab/evaluate.mjs"));
  const dir = mkdtempSync(join(tmpdir(), "hsab-"));
  const proto = JSON.parse(readFileSync(join(ROOT, "scripts/technical/hsab/protocol.json"), "utf8"));
  proto.status = "DEVELOPMENT"; writeFileSync(join(dir, "p.json"), JSON.stringify(proto));
  await assert.rejects(evaluate({ protocol: join(dir, "p.json"), phase: "W_VAL", records: dir }), /VALIDATION versiegelt/);
  proto.status = "DEV_FROZEN"; writeFileSync(join(dir, "p.json"), JSON.stringify(proto));
  await assert.rejects(evaluate({ protocol: join(dir, "p.json"), phase: "W_HOLDOUT", records: dir }), /HOLDOUT versiegelt/);
  proto.status = "PREREGISTERED"; writeFileSync(join(dir, "p.json"), JSON.stringify(proto));
  await assert.rejects(evaluate({ protocol: join(dir, "p.json"), phase: "W_HOLDOUT", records: dir, openHoldout: "0".repeat(64) }), /HOLDOUT versiegelt|ENOENT/);
});

test("HSAB-S2 Siegel: veraenderter Shard wird erkannt", async () => {
  const { readRecords } = await import(join(ROOT, "scripts/technical/hsab/evaluate.mjs"));
  const dir = mkdtempSync(join(tmpdir(), "hsab-"));
  const { gzipSync } = await import("node:zlib"); const { createHash } = await import("node:crypto");
  const buf = gzipSync(Buffer.from(JSON.stringify({ s: "X", i: 1 }) + "\n"));
  writeFileSync(join(dir, "records-00.jsonl.gz"), buf);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ shards: [{ file: "records-00.jsonl.gz", sha256: createHash("sha256").update(buf).digest("hex") }] }));
  assert.equal(readRecords(dir).recs.length, 1);
  writeFileSync(join(dir, "records-00.jsonl.gz"), gzipSync(Buffer.from(JSON.stringify({ s: "X", i: 2 }) + "\n")));
  assert.throws(() => readRecords(dir), /Siegel verletzt/);
});

test("HSAB-P1 Veroeffentlichung: Kursfelder in CI-Artefakten werden abgewiesen", () => {
  const dir = mkdtempSync(join(tmpdir(), "hsab-pub-"));
  writeFileSync(join(dir, "ok.json"), JSON.stringify({ rate: 0.5, n: 10 }));
  assert.equal(spawnSync(process.execPath, [join(ROOT, "scripts/technical/hsab/publish-ci.mjs"), "--check", dir]).status, 0);
  writeFileSync(join(dir, "bad.json"), JSON.stringify({ px: 101.2 }));
  assert.notEqual(spawnSync(process.execPath, [join(ROOT, "scripts/technical/hsab/publish-ci.mjs"), "--check", dir]).status, 0);
});
