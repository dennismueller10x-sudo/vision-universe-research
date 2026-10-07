/* Mission IX — Track A (Genauigkeit × Geometrie), Track B (asymmetrische Gewinner), Wave-3-Forensik,
   Stichproben-Disjunktheit und Siegel der Bestaetigungsphase. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { loadWeekly } = await import(join(ROOT, "scripts/technical/lib/ti-data.mjs"));
const Core = await import(join(ROOT, "scripts/technical/hsab/lib/replay-core.mjs"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const TA = await import(join(ROOT, "scripts/technical/hsab/track-a.mjs"));
const TB = await import(join(ROOT, "scripts/technical/hsab/track-b.mjs"));
const { internalElliott } = await import(join(ROOT, "scripts/technical/hsab/replay.mjs"));
const sha = (s) => createHash("sha256").update(s).digest("hex");

/** synthetisches Ereignis wie evaluate.mjs --dump-events */
const ev = (k, o) => ({ v: "FULL", s: "S" + (k % 40), d: 2000 + (k % 20) + "-0" + (1 + (k % 9)) + "-15", dir: 1, kT: 1, kI: 1, y: 0, cH: 1, cN: 2, R: -1, cR: 0, mfe: 0.5, mae: 0.5, bars: 5,
  cl: "CLEAR", ag: 0.5, oppY: 0, oppR: 0, ex: "TIMEOUT", exR: 0, exD: [0, 0, 0], ...o });

test("M9-A1 Geometrie-Klassen: CRV = Zielabstand / Invalidationsabstand, symmetrisch 0,75–1,33", () => {
  const rows = [ev(0, { kT: 0.4, kI: 1 }), ev(1, { kT: 1, kI: 1 }), ev(2, { kT: 1.3, kI: 1 }), ev(3, { kT: 1.4, kI: 1 }), ev(4, { kT: 3, kI: 1 })];
  const r = TA.trackA(rows, null);
  const n = Object.fromEntries(r.byRewardRisk.map((x) => [x.bucket, x.events]));
  assert.equal(n["RR<0.5"], 1); assert.equal(n["RR0.75-1.33_SYMMETRIC"], 2); assert.equal(n["RR1.33-2"], 1); assert.equal(n["RR>=3"], 1);
});

test("M9-A2 Kandidatenregel: hohe Trefferquote bei naher Geometrie ist KEIN Kandidat; Lift gegen gleiche Geometrie entscheidet", () => {
  /* 400 Ereignisse mit CRV 0,3: 80 % Treffer, Kontrolle 78 % → kein Kandidat (Geometrie + kein Lift) */
  const near = Array.from({ length: 400 }, (_, k) => ev(k, { kT: 0.3, kI: 1, y: k % 5 ? 1 : 0, cH: 39, cN: 50 }));
  /* 400 symmetrische Ereignisse: 70 % Treffer gegen 50 % Kontrolle → Kandidat */
  const sym = Array.from({ length: 400 }, (_, k) => ev(1000 + k, { kT: 1, kI: 1, y: k % 10 < 7 ? 1 : 0, cH: 1, cN: 2, R: k % 10 < 7 ? 1 : -1 }));
  const r = TA.trackA([...near, ...sym], null);
  assert.ok(!r.highAccuracyCandidates.includes("RR<0.5"));
  assert.ok(r.highAccuracyCandidates.includes("RR0.75-1.33_SYMMETRIC"));
  const s = r.byRewardRisk.find((x) => x.bucket === "RR0.75-1.33_SYMMETRIC");
  assert.ok(Math.abs(s.randomWalkExpectation - 0.5) < 1e-9);
  assert.equal(s.quadrant, "HIGH_ACCURACY/LOW_PAYOFF");
});

test("M9-B1 fruehe Aufwaerts-Motivwelle: Richtung, Wellenzahl, Vollstaendigkeit, Alter (Definition eingefroren)", () => {
  assert.equal(TB.earlyUp({ dir: 1, waves: 3, complete: 0, endAge: 2 }), true);
  assert.equal(TB.earlyUp({ dir: 1, waves: 2, complete: 0, endAge: 4 }), true);
  assert.equal(TB.earlyUp({ dir: 1, waves: 5, complete: 1, endAge: 0 }), false);
  assert.equal(TB.earlyUp({ dir: -1, waves: 3, complete: 0, endAge: 0 }), false);
  assert.equal(TB.earlyUp({ dir: 1, waves: 3, complete: 0, endAge: 5 }), false);
  assert.equal(TB.earlyUp(null), false);
  assert.deepEqual(TB.MULTS, [2, 3, 5, 10]); assert.deepEqual(TB.HORIZONS, { "6M": 26, "12M": 52, "24M": 104, "36M": 156 });
});

test("M9-E1 Forensik-Haken sind ausgabeneutral; interne Kandidaten tragen Richtung aus den Pivot-Indizes", () => {
  const s = loadWeekly("ref_AAPL"), P = Core.prepareSeries(s), t = s.length - 60;
  const args = { series: s, features: P.main.features, pivots: P.main.pivots, asOfIndex: t, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: { elliottEngine: "v3" } };
  const a = EV3.analyzeElliottV3(args), b = EV3.analyzeElliottV3({ ...args, forensics: true, debugAll: true });
  assert.equal(JSON.stringify(a.primary), JSON.stringify(b.primary));
  assert.equal(JSON.stringify(a.alternatives), JSON.stringify(b.alternatives));
  const fx = internalElliott(b, s.close, t);
  for (const k of ["IMPULSE", "LEADING_DIAGONAL"]) if (fx[k]) { assert.ok([1, -1, 0].includes(fx[k].dir)); assert.ok(fx[k].endAge >= 0); assert.ok(fx[k].waves >= 1 && fx[k].waves <= 5); }
});

test("M9-S1 Disjunktheit: replay bricht ab, wenn die Raenge 0..N-1 nicht die veroeffentlichte Stichprobe sind", () => {
  const dir = mkdtempSync(join(tmpdir(), "hsab9-")), w = join(dir, "w"); mkdirSync(w);
  const syms = ["ref_A", "ref_B", "ref_C", "ref_D"];
  for (const x of syms) writeFileSync(join(w, x + ".json"), JSON.stringify({ ticker: x, points: [["2020-01-03", 10], ["2020-01-10", 11]] }));
  const symHash = (x) => parseInt(sha("hsab|sample|" + x).slice(0, 8), 16);
  const first2 = syms.slice().sort((a, b) => symHash(a) - symHash(b)).slice(0, 2).sort();
  const run = (spec, off) => spawnSync(process.execPath, [join(ROOT, "scripts/technical/hsab/replay.mjs"), "--weekly-dir", w, "--sample-symbols", "2", "--sample-offset", String(off), "--disjoint-from", spec, "--workers", "1", "--out", join(dir, "o" + off + spec.length)], { encoding: "utf8" });
  const bad = run("2:" + "0".repeat(64), 2);
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /Disjunktheit nicht garantiert/);
  const tooLow = run("2:" + sha(first2.join("\n")), 1);
  assert.notEqual(tooLow.status, 0);
  const ok = run("2:" + sha(first2.join("\n")), 2);
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /Disjunktheit geprueft/);
  const man = JSON.parse(readFileSync(join(dir, "o2" + ("2:" + sha(first2.join("\n"))).length, "manifest.json"), "utf8"));
  assert.equal(man.sampleOffset, 2); assert.equal(man.symbols.n, 2);
});

test("M9-S2 Bestaetigungsphase versiegelt: protocol9 verlangt PREREGISTERED, Hash und exakt die vorab festgelegte Stichprobe", async () => {
  const { evaluate } = await import(join(ROOT, "scripts/technical/hsab/evaluate.mjs"));
  const p9 = JSON.parse(readFileSync(join(ROOT, "scripts/technical/hsab/protocol9.json"), "utf8"));
  assert.equal(p9.phases.A9_CONFIRM.sample.size, 1200); assert.equal(p9.phases.A9_CONFIRM.sample.offset, 1200); assert.match(p9.phases.A9_CONFIRM.sample.disjointFrom, /^1200:457ce200/);
  assert.equal(p9.phases.A9_CONFIRM.requires, "PREREGISTERED");
  const dir = mkdtempSync(join(tmpdir(), "hsab9-"));
  /* fremde Protokolldatei mit Phase A9_CONFIRM: abgewiesen */
  writeFileSync(join(dir, "p.json"), JSON.stringify({ ...p9, status: "PREREGISTERED" }));
  await assert.rejects(evaluate({ protocol: join(dir, "p.json"), phase: "A9_CONFIRM", records: dir, openHoldout: "0".repeat(64) }), /Repository-Protokoll/);
  /* Repository-protocol9: ohne PREREGISTERED bzw. mit falschem Hash versiegelt */
  await assert.rejects(evaluate({ protocol: join(ROOT, "scripts/technical/hsab/protocol9.json"), phase: "A9_CONFIRM", records: dir, openHoldout: "0".repeat(64) }), /HOLDOUT versiegelt/);
  /* Mission VIII bleibt eingefroren */
  const p8 = JSON.parse(readFileSync(join(ROOT, "scripts/technical/hsab/protocol.json"), "utf8"));
  assert.equal(p8.status, "PREREGISTERED"); assert.equal(p8.phases.A9_CONFIRM, undefined);
});

test("M9-C1 Fallstudie ist nur erklaerend und kausal (Daten bis zum Stichtag)", async () => {
  const { caseStudy } = await import(join(ROOT, "scripts/technical/hsab/case-study.mjs"));
  const r = caseStudy("ref_AAPL", ["2015-06-30"], false);
  assert.equal(r.purpose, "EXPLANATORY_ONLY_NOT_EVIDENCE_NOT_FOR_TUNING");
  assert.equal(r.rows.length, 1); assert.ok(r.rows[0].date <= "2015-06-30");
  const s = loadWeekly("ref_AAPL"), t = s.timestamps.findLastIndex((d) => d <= "2015-06-30"), P = Core.prepareSeries(s);
  const rec = Core.recordAt(P, s, t, { symbol: "ref_AAPL", cohort: "CASE" }, null);
  assert.equal(r.rows[0].shown.outlook, rec.o); assert.equal(r.rows[0].shown.clarity, rec.cl);
});

test("M9-A3 Entscheidung Track A: Holm, HAC gegen D und E, INCONCLUSIVE wenn das KI HAC nicht ausschliesst", () => {
  const mk = (bucket, o) => ({ bucket, n: 1000, hit: 0.5, hitCi: [0.48, 0.52], control: 0.48, lift: 0.02, liftCi: [0.01, 0.03], liftP: 0.001, liftE: 0.02, liftECi: [0.01, 0.03], trendOnly: { lift: 0.02 }, ...o });
  const base = () => ({ all: mk("ALL", { expectancyR: -0.1, trading: {} }), byRewardRisk: [mk("RR<0.5", { hit: 0.7, control: 0.68, randomWalkExpectation: 0.79 }), mk("RR1.33-2")],
    selectivitySymmetric: ["ALL", "CLEAR", "AGREEMENT_TOP25", "AGREEMENT_TOP10"].map((t) => mk("SYM·" + t)), selectivityFavorable: ["ALL", "CLEAR", "AGREEMENT_TOP25", "AGREEMENT_TOP10"].map((t) => mk("FAV·" + t)),
    selectivityAll: ["ALL", "AGREEMENT_TOP10"].map((t) => mk("ALL·" + t)) });
  assert.equal(TA.decideTrackA(base()).HA1, "NO_HIGH_ACCURACY_EDGE");
  let r = base(); r.selectivitySymmetric[3] = mk("SYM·AGREEMENT_TOP10", { n: 400, hit: 0.58, hitCi: [0.5, 0.66], lift: 0.04, liftCi: [-0.01, 0.09] });
  assert.equal(TA.decideTrackA(r).HA1, "INCONCLUSIVE");
  r = base(); r.selectivitySymmetric[3] = mk("SYM·AGREEMENT_TOP10", { n: 400, hit: 0.66, hitCi: [0.62, 0.7], lift: 0.08, liftCi: [0.04, 0.12], liftP: 0.0001, liftE: 0.07, liftECi: [0.03, 0.11] });
  assert.equal(TA.decideTrackA(r).HA1, "SELECTIVE_HIGH_ACCURACY_EDGE");
  /* gleicher Lift gegen D, aber nicht gegen E (Trend erklaert ihn) → kein Edge-Nachweis */
  r.selectivitySymmetric[3].liftE = 0.01; r.selectivitySymmetric[3].liftECi = [-0.03, 0.05];
  assert.notEqual(TA.decideTrackA(r).HA1, "SELECTIVE_HIGH_ACCURACY_EDGE");
  /* Holm: zweiseitig 0,0001 → einseitig 0,00005, kleinster von 8 Werten → ×8 */
  r.selectivitySymmetric[3].liftE = 0.07; r.selectivitySymmetric[3].liftECi = [0.03, 0.11];
  const t = TA.decideTrackA(r).selectiveTiers.find((x) => x.bucket === "SYM·AGREEMENT_TOP10");
  assert.equal(t.pHolm, 0.0004);   /* einseitig 0,00005 × 8 */
});

test("M9-B2 Anomalie-Tor kausal: ein Sprung NACH t schliesst die Einheit nicht aus (Red Team H3); Sensitivitaet 'full' schon", () => {
  const n = 400, close = Array.from({ length: n }, (_, i) => 10 * (1 + i * 0.001)), dates = [];
  for (let i = 0; i < n; i++) dates.push(new Date(Date.UTC(2000, 0, 7) + i * 7 * 864e5).toISOString().slice(0, 10));
  for (let i = 250; i < n; i++) close[i] *= 6;     /* Sprung ×6 in Woche 250 */
  const e = { symbol: "X", cohort: "SURV_W", length: n, close, dates, trend: close.map(() => 1), atrPct: close.map(() => 0.03), atr: close.map(() => 0.3), stale: close.map(() => 0) };
  const units = (gate) => TB.buildUnits({ list: [e] }, new Map(), { gate });
  const at = (us, d0) => us.find((u) => u.d >= d0 && u.t < 250 && u.t > 200);
  const past = at(units("past"), "2003-01-01"), full = at(units("full"), "2003-01-01");
  assert.ok(past && past.f["24M"] && past.f["24M"].maxM >= 5, "Einheit vor dem Sprung bleibt (kausales Tor)");
  assert.equal(past.f["24M"].futJump, 1);
  assert.equal(full.f["24M"], null, "Sensitivitaet 'full' schliesst sie aus");
});
