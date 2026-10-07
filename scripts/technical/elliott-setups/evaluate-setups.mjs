#!/usr/bin/env node
/* =========================================================================
   VU MISSION X — Stufe B: Outcomes, faire Kontrollen und Evidenzstufen je Setup × Variante

   Ereignisse: historical-events.mjs (versiegelt, ohne Outcomes). Kontrollen nur aus derselben Titelhaelfte (Bucket).
     D  gleiches Datum, andere Titel, gleiche ATR-Geometrie (Ziel, Invalidation, Bestaetigung), gleiche Richtung
     T  wie D + gleicher einfacher Trend           TR wie D + gleicher Trend + gleicher RS26-Quintil-Status (Basis-Setup ohne Elliott)
     C  gleiche Aktie, Abstand 26–104 Wochen, gleiche Geometrie
   Langfrist (nur Aufwaertssetups): Zellen nicht markierter Titel am selben Datum (alle / Trend / RS / Trend×RS).

     node scripts/technical/elliott-setups/evaluate-setups.mjs --events F1,F2,... --records DIR --weekly-dir DIR --bucket 0/2 --phase DEV --out FILE
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ROOT } from "../lib/ti-data.mjs";
import { loadPanel, eligible } from "../hsab/lib/panel.mjs";
import { applyConfirmations, SPEC, SPEC_SHA256, LIBRARY_VERSION } from "./setup-library.mjs";

const require = createRequire(import.meta.url);
const SO = require(join(ROOT, "scripts/technical/hsab/lib/structural-outcomes.cjs"));
const VS = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));
export const EVAL_VERSION = "elliott-setup-eval-1.0.0";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const symHash = (s) => parseInt(sha("hsab|" + s).slice(0, 8), 16);
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const H = 26, MINB = 160, LONG = { "6M": 26, "12M": 52, "24M": 104, "36M": 156 }, MULTS = [2, 3, 5];
export const VARIANTS = ["ENGINE_PRIMARY", "PURE", "PURE_RS", "CONFIRMED", "PURE_HD"];

/** Relabel-Grundlage: Elliott-Zaehlung je Erkennungspunkt aus den versiegelten Records. */
function dpKeys(dir, inBucket) {
  const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")), by = new Map(); let n = 0;
  for (const sh of man.shards) for (const line of gunzipSync(readFileSync(join(dir, sh.file))).toString("utf8").split("\n")) {
    if (!line) continue; const r = JSON.parse(line); if (!r.dp || !inBucket(r.s)) continue; n++;
    let a = by.get(r.s); if (!a) by.set(r.s, (a = [])); a.push([r.i, r.ew ? r.ew.key : null]);
  }
  for (const a of by.values()) a.sort((x, y) => x[0] - y[0]);
  return { by, n };
}

/** RS26-Rang (0..1) je Titel und Woche im Querschnitt der Haelfte. */
function rsRanks(panel) {
  for (const e of panel.list) e.rsQ = new Float32Array(e.length).fill(NaN);
  for (const arr of panel.byKey.values()) {
    const xs = [];
    for (let k = 0; k < arr.length; k += 2) { const e = panel.list[arr[k]], i = arr[k + 1]; if (i >= 26 && e.close[i - 26] > 0 && e.close[i] > 0) xs.push([e.close[i] / e.close[i - 26] - 1, e, i]); }
    xs.sort((a, b) => a[0] - b[0]); xs.forEach((x, k) => { x[1].rsQ[x[2]] = xs.length > 1 ? k / (xs.length - 1) : 0.5; });
  }
}

export function evaluateSetups(o) {
  const [ba, bb] = o.bucket.split("/").map(Number), inBucket = (s) => symHash(s) % bb === ba;
  const files = o.events.split(",");
  const metas = files.map((f) => JSON.parse(readFileSync(f.replace(/\.jsonl\.gz$/, ".meta.json"), "utf8")));
  for (const [k, f] of files.entries()) { if (sha(readFileSync(f)) !== metas[k].sha256) throw new Error("Siegel verletzt: " + f); if (metas[k].specSha256 !== SPEC_SHA256) throw new Error("Ereignisse mit anderer Setup-Spec erzeugt: " + f); }
  const evs = files.flatMap((f) => gunzipSync(readFileSync(f)).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  const symbols = readdirSync(o.weeklyDir).filter((x) => x.startsWith("ref_") && x.endsWith(".json")).map((x) => x.replace(/\.json$/, "")).filter(inBucket);
  const panel = loadPanel({ weeklyDir: o.weeklyDir, only: new Set(symbols) }); rsRanks(panel);
  const { by: keys, n: dpCount } = dpKeys(o.records, inBucket);
  const P = (s) => panel.list[panel.bySym.get(s)];
  /* Datenqualitaet (wie Mission IX, kausal): Wochensprung > ×4 / < ×0,25 in [t−52, t] */
  const jumpPast = (e, i) => { for (let j = Math.max(1, i - 52); j <= i; j++) { const r = e.close[j] / e.close[j - 1]; if (r > 4 || r < 0.25) return true; } return false; };

  /* ---- Kontrollen ---- */
  const rng = (...k) => Hash.mulberry32(Hash.seedFromString("m10|" + o.phase + "|" + k.join("|")));
  const outcomeAt = (e, j, geo) => {
    const c0 = e.close[j], a = e.atr[j]; if (!(a > 0) || !(c0 > 0)) return null;
    const g = SO.applyAtrGeometry({ dir: geo.dir, kT: geo.kT, kI: geo.kI, kT2: geo.kT2 }, c0, a); if (!g) return null;
    g.conf = isNum(geo.kC) ? c0 + geo.dir * geo.kC * a : null;
    const oc = SO.primaryOutcome(e, j, g, H, a); if (!SO.RESOLVED.has(oc.outcome)) return null;
    return { y: oc.success ? 1 : 0, inv: oc.outcome === "INVALIDATED" || oc.outcome === "AMBIGUOUS_SAME_BAR" ? 1 : 0, conf: oc.confirmed ? 1 : 0, R: SO.rMultiple(e, j, g, oc) };
  };
  const drawSameDate = (ev, e, i, geo, n, filt, tag) => {
    const arr = panel.byKey.get(e.keys[i]) || [], r = rng(tag, ev.s, ev.i), acc = [0, 0, 0, 0, 0];
    for (let k = 0, got = 0; k < n * 8 && got < n && arr.length > 2; k++) {
      const x = Math.floor(r() * (arr.length / 2)) * 2, e2 = panel.list[arr[x]], j = arr[x + 1];
      if (e2 === e || !eligible(e2, j, MINB) || (filt && !filt(e2, j))) continue;
      const v = outcomeAt(e2, j, geo); if (!v) continue; got++; acc[0] += v.y; acc[1]++; acc[2] += v.conf; acc[3] += v.inv; acc[4] += isNum(v.R) ? v.R : 0;
    }
    return acc;
  };
  const drawNear = (ev, e, i, geo, n) => {
    const r = rng("C", ev.s, ev.i), acc = [0, 0, 0, 0, 0];
    for (let k = 0, got = 0; k < n * 10 && got < n; k++) {
      const u = (26 + Math.floor(r() * 79)) * (r() < 0.5 ? -1 : 1), j = i + u; if (j < MINB - 1 || j >= e.length || !eligible(e, j, MINB)) continue;
      const v = outcomeAt(e, j, geo); if (!v) continue; got++; acc[0] += v.y; acc[1]++; acc[2] += v.conf; acc[3] += v.inv; acc[4] += isNum(v.R) ? v.R : 0;
    }
    return acc;
  };
  /* Langfrist-Zellen je Datum (nicht markierte Titel = alle ausser dem Ereignistitel; Ereignisdichte gering) */
  const futureOf = (e, i, h) => { if (i + h > e.length - 1) return null; let mx = 1, mn = 1; for (let j = i + 1; j <= i + h; j++) { const m = e.close[j] / e.close[i]; if (m > mx) mx = m; if (m < mn) mn = m; } return { end: e.close[i + h] / e.close[i] - 1, maxM: mx, minM: mn }; };
  const cellCache = new Map();
  const cells = (key) => {
    if (cellCache.has(key)) return cellCache.get(key);
    const arr = panel.byKey.get(key) || [], acc = {};
    for (let k = 0; k < arr.length; k += 2) {
      const e = panel.list[arr[k]], i = arr[k + 1]; if (!eligible(e, i, MINB) || jumpPast(e, i)) continue;
      const tr = e.trend[i] === 1, rs = e.rsQ[i] >= 0.8;
      for (const [hn, h] of Object.entries(LONG)) { const f = futureOf(e, i, h); if (!f) continue;
        for (const c of ["ALL", tr ? "T" : null, rs ? "RS" : null, tr && rs ? "TR" : null].filter(Boolean)) {
          const z = (acc[hn + "|" + c] = acc[hn + "|" + c] || { n: 0, end: 0, k2: 0, k3: 0, k5: 0, sym: [] }); z.n++; z.end += Math.min(f.end, 4); if (f.maxM >= 2) z.k2++; if (f.maxM >= 3) z.k3++; if (f.maxM >= 5) z.k5++; } }
    }
    cellCache.set(key, acc); return acc;
  };

  /* ---- Ereignisse auswerten ---- */
  const rows = []; const status = {};
  for (const ev of evs) {
    const st = ev.inst ? ev.inst.setupId + "|" + ev.inst.status : "NONE"; status[st] = (status[st] || 0) + 1;
    if (!ev.inst || ev.inst.status !== "QUALIFIED") continue;
    /* Per-Bar-Titel des Mission-VIII-Replays (Hash mod 20 = 0) tragen versiegelte Zaehlungen MIT Persistenzkette; die Setup-
       Evidenz nutzt wie das Register die zustandslose Engine-Sicht (previous = null) → diese Titel ausschliessen. */
    if (symHash(ev.s) % 20 === 0) { status["EXCLUDED_PERBAR_CHAIN_SYMBOL"] = (status["EXCLUDED_PERBAR_CHAIN_SYMBOL"] || 0) + 1; continue; }
    const e = P(ev.s); if (!e) continue; const i = ev.i;
    if (Math.abs(e.close[i] - ev.px) > 1e-6 * ev.px) throw new Error("Panel weicht vom Ereignis ab: " + ev.s + " " + ev.d);
    if (jumpPast(e, i)) { status["ANOMALY_PAST_JUMP"] = (status["ANOMALY_PAST_JUMP"] || 0) + 1; continue; }
    const inst = applyConfirmations(ev.inst, { trend: e.trend[i], rsQ: isNum(e.rsQ[i]) ? e.rsQ[i] : null, msVote: ev.ms });
    const dir = inst.dir, pr = inst.projection;
    const g = { dir, inv: inst.levels.invalidation, t1Lo: pr.primary.low, t1Hi: pr.primary.high, t2Lo: pr.extended.low, t2Hi: pr.extended.high,
                conf: inst.levels.confirmationState === "PENDING" ? inst.levels.confirmation : null };
    const oc = SO.primaryOutcome(e, i, g, H, e.atr[i]);
    if (!SO.RESOLVED.has(oc.outcome)) { status["OUTCOME_" + oc.outcome] = (status["OUTCOME_" + oc.outcome] || 0) + 1; continue; }
    const R = SO.rMultiple(e, i, g, oc);
    /* Umdeutung vor Aufloesung: ein spaeterer Erkennungspunkt bis zum Ausgang mit anderer Zaehlung */
    const ks = keys.get(ev.s) || []; let relabel = 0; for (const [j, k] of ks) { if (j <= i) continue; if (j > i + oc.bars) break; if (k !== ev.key) { relabel = 1; break; } }
    const geo = { dir, ...inst.geometry };
    const cD = drawSameDate(ev, e, i, geo, 5, null, "D"), cT = drawSameDate(ev, e, i, geo, 5, (e2, j) => e2.trend[j] === e.trend[i], "T");
    const rsTop = (x) => (dir > 0 ? x >= 0.8 : x <= 0.2);
    const cTR = drawSameDate(ev, e, i, geo, 5, (e2, j) => e2.trend[j] === e.trend[i] && rsTop(e2.rsQ[j]) === rsTop(e.rsQ[i]), "TR"), cC = drawNear(ev, e, i, geo, 3);
    const row = { s: ev.s, d: ev.d, setup: inst.setupId, dir, v: inst.variants, first: ev.first, firstShown: ev.firstShown, y: oc.success ? 1 : 0, conf: oc.confirmed === null ? null : oc.confirmed ? 1 : 0,
      inv: oc.outcome === "INVALIDATED" || oc.outcome === "AMBIGUOUS_SAME_BAR" ? 1 : 0, timeout: oc.outcome === "TIMEOUT" ? 1 : 0, R, relabel, bars: oc.bars, mfe: oc.mfeAtr, mae: oc.maeAtr,
      kT: inst.geometry.kT, kI: inst.geometry.kI, f13: SO.forward(e, i, 13), f26: SO.forward(e, i, 26), cD, cT, cTR, cC, conds: inst.confirmations, rw3: ev.rw3 };
    if (dir > 0) { const cl = cells(e.keys[i]); row.long = {};
      for (const [hn, h] of Object.entries(LONG)) { const f = futureOf(e, i, h); if (!f) continue; const own = (c) => { const z = cl[hn + "|" + c]; return z && z.n > 1 ? z : null; };
        const T = e.trend[i] === 1, RS = e.rsQ[i] >= 0.8, ex = (c) => { const z = own(c); return z ? { end: z.end / z.n, k2: z.k2 / z.n, k3: z.k3 / z.n, k5: z.k5 / z.n } : null; };
        row.long[hn] = { end: f.end, endCap: Math.min(f.end, 4), maxM: f.maxM, mae: f.minM - 1, ALL: ex("ALL"), SAME_T: ex(T ? "T" : "ALL"), RS: RS ? ex("RS") : null, TR: T && RS ? ex("TR") : null }; } }
    rows.push(row);
  }

  /* ---- Aggregation je Setup × Variante ---- */
  const BLOCK = "HALF";
  const sel = (vr) => (r) => r.v[vr] && (vr === "ENGINE_PRIMARY" ? r.first : r.firstShown || (r.first && r.v.PURE));
  const agg = (rs, label) => {
    if (!rs.length) return { n: 0 };
    const vec = (x) => [x.y, 1, x.cD[0], x.cD[1], x.cT[0], x.cT[1], x.cTR[0], x.cTR[1], x.cC[0], x.cC[1], isNum(x.R) ? x.R : 0, x.cD[1] ? x.cD[4] / x.cD[1] : 0, x.inv, x.relabel];
    const b = VS.twoWayBoot(rs, (x) => x.s, (x) => VS.timeBlockOf(x.d, BLOCK), vec, {
      hit: (v) => v[0] / v[1], ctlD: (v) => v[2] / v[3], liftD: (v) => v[0] / v[1] - v[2] / v[3], liftT: (v) => (v[5] ? v[0] / v[1] - v[4] / v[5] : null), liftTR: (v) => (v[7] ? v[0] / v[1] - v[6] / v[7] : null),
      liftC: (v) => (v[9] ? v[0] / v[1] - v[8] / v[9] : null), R: (v) => v[10] / v[1], excessR: (v) => (v[10] - v[11]) / v[1], invFirst: (v) => v[12] / v[1], relabel: (v) => v[13] / v[1] }, { B: o.boot || 500, seed: VS.seedOf(label) });
    const S = b.stats, ci = (x) => [r4(x.lo), r4(x.hi)];
    const w = rs.filter((x) => x.y).map((x) => x.R), l = rs.filter((x) => !x.y && isNum(x.R)).map((x) => x.R), mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
    const pend = rs.filter((x) => x.conf !== null);
    const out = { n: rs.length, symbols: b.symbols, hit: r4(S.hit.est), hitCi: ci(S.hit), controlD: r4(S.ctlD.est), liftD: r4(S.liftD.est), liftDCi: ci(S.liftD), liftDp: S.liftD.p,
      liftT: r4(S.liftT.est), liftTCi: ci(S.liftT), liftTR: r4(S.liftTR.est), liftTRCi: ci(S.liftTR), liftC: r4(S.liftC.est), liftCCi: ci(S.liftC),
      expectancyR: r4(S.R.est), expectancyRCi: ci(S.R), excessRvsD: r4(S.excessR.est), excessRCi: ci(S.excessR), invalidatedFirst: r4(S.invFirst.est), relabelBeforeResolution: r4(S.relabel.est),
      timeoutShare: r4(rs.filter((x) => x.timeout).length / rs.length), confirmationBeforeExit: pend.length ? r4(pend.filter((x) => x.conf).length / pend.length) : null, confirmationPendingN: pend.length,
      geometry: { medianTargetAtr: r4(VS.median(rs.map((x) => x.kT))), medianInvalidationAtr: r4(VS.median(rs.map((x) => x.kI))), medianRewardRisk: r4(VS.median(rs.map((x) => x.kT / x.kI))),
                  naiveGeometric: r4(mean(rs.map((x) => x.kI / (x.kI + x.kT)))) },
      payoff: { avgWinnerR: r4(mean(w)), avgLoserR: r4(mean(l)), payoffRatio: w.length && l.length && mean(l) < 0 ? r4(mean(w) / Math.abs(mean(l))) : null },
      forward: { f13Median: r4(VS.median(rs.map((x) => x.f13).filter(isNum))), f26Median: r4(VS.median(rs.map((x) => x.f26).filter(isNum))), f26Mean: r4(mean(rs.map((x) => x.f26).filter(isNum))) },
      mfeAtrMedian: r4(VS.median(rs.map((x) => x.mfe).filter(isNum))), maeAtrMedian: r4(VS.median(rs.map((x) => x.mae).filter(isNum))),
      coverageOfDetectionPoints: r4(rs.length / dpCount) };
    /* Langfrist (nur Aufwaerts) */
    const up = rs.filter((x) => x.dir > 0 && x.long);
    if (up.length) { out.long = {};
      for (const hn of Object.keys(LONG)) {
        const u = up.filter((x) => x.long[hn]); if (u.length < 20) { out.long[hn] = { n: u.length }; continue; }
        const lb = VS.twoWayBoot(u, (x) => x.s, (x) => VS.timeBlockOf(x.d, "YEAR"), (x) => { const L = x.long[hn], c = (k) => L[k] || L.ALL;
          return [L.endCap, 1, L.ALL.end, c("SAME_T").end, c("TR").end, L.maxM >= 2 ? 1 : 0, L.ALL.k2, L.maxM >= 3 ? 1 : 0, L.ALL.k3, L.maxM >= 5 ? 1 : 0, L.ALL.k5, c("TR").k2, c("TR").k3]; },
          { endCap: (v) => v[0] / v[1], exAll: (v) => (v[0] - v[2]) / v[1], exT: (v) => (v[0] - v[3]) / v[1], exTR: (v) => (v[0] - v[4]) / v[1], r2: (v) => (v[6] > 0 ? v[5] / v[6] : null), r3: (v) => (v[8] > 0 ? v[7] / v[8] : null),
            r5: (v) => (v[10] > 0 ? v[9] / v[10] : null), r2TR: (v) => (v[11] > 0 ? v[5] / v[11] : null), r3TR: (v) => (v[12] > 0 ? v[7] / v[12] : null) }, { B: o.boot || 500, seed: VS.seedOf(label + "|" + hn) });
        const L = lb.stats;
        out.long[hn] = { n: u.length, medianReturn: r4(VS.median(u.map((x) => x.long[hn].end))), meanReturnCapped4x: r4(L.endCap.est), excessVsDate: r4(L.exAll.est), excessVsDateCi: ci(L.exAll),
          excessVsTrendCell: r4(L.exT.est), excessVsTrendCellCi: ci(L.exT), excessVsTrendRsCell: r4(L.exTR.est), excessVsTrendRsCellCi: ci(L.exTR),
          rate2x: r4(u.filter((x) => x.long[hn].maxM >= 2).length / u.length), rate3x: r4(u.filter((x) => x.long[hn].maxM >= 3).length / u.length), rate5x: r4(u.filter((x) => x.long[hn].maxM >= 5).length / u.length),
          ratio2xVsDate: r4(L.r2.est), ratio2xVsDateCi: ci(L.r2), ratio3xVsDate: r4(L.r3.est), ratio5xVsDate: r4(L.r5.est), ratio2xVsTrendRs: r4(L.r2TR.est), ratio3xVsTrendRs: r4(L.r3TR.est),
          medianMfe: r4(VS.median(u.map((x) => x.long[hn].maxM - 1))), medianMae: r4(VS.median(u.map((x) => x.long[hn].mae))) };
      } }
    return out;
  };
  const res = {};
  for (const fam of SPEC.families.map((f) => f.id)) { res[fam] = {};
    for (const vr of VARIANTS) { const rs = rows.filter((r) => r.setup === fam && sel(vr)(r));
      res[fam][vr] = { all: agg(rs, fam + "|" + vr), up: agg(rs.filter((r) => r.dir > 0), fam + "|" + vr + "|up"), down: agg(rs.filter((r) => r.dir < 0), fam + "|" + vr + "|down") }; } }
  /* Forschungskohorte an Erkennungspunkten (nur beschreibend; Hauptevidenz Mission IX Quartalsraster) */
  const rw = rows.filter((r) => r.rw3 && r.first);
  return { schemaVersion: "elliott-setup-evidence-1.0.0", evalVersion: EVAL_VERSION, library: LIBRARY_VERSION, specSha256: SPEC_SHA256, phase: o.phase, bucket: o.bucket,
           events: metas.map((m) => ({ sha256: m.sha256, candidates: m.candidates, keyMismatch: m.keyMismatch, records: m.records.sealHash })), detectionPoints: dpCount, statusCounts: status, rowsResolved: rows.length,
           results: res, researchInternalWave3AtSetupEvents: { n: rw.length } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t0 = Date.now();
  const res = evaluateSetups({ events: arg("events"), records: arg("records"), weeklyDir: arg("weekly-dir"), bucket: arg("bucket", "0/2"), phase: arg("phase", "DEV"), boot: arg("boot", null) ? +arg("boot") : null });
  res.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(arg("out"), JSON.stringify(res, null, 1));
  const s = (f, v) => res.results[f][v].all; console.log(`[setup-eval] ${res.phase}: ${res.rowsResolved} aufgeloeste Ereignisse; ` + SPEC.families.map((f) => `${f.id} PURE n=${s(f.id, "PURE").n} ENGINE n=${s(f.id, "ENGINE_PRIMARY").n}`).join("; ") + ` (${res.seconds} s)`);
}
