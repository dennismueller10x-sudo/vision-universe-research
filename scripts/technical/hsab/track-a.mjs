#!/usr/bin/env node
/* =========================================================================
   VU MISSION IX — TRACK A: GENAUIGKEIT × GEOMETRIE × PAYOFF × BASELINE × ABDECKUNG

   Liest den Ereignis-Export von evaluate.mjs (--dump-events; kursfrei: Abstaende in ATR, Ausgaenge, Kontrollquoten, R).
   Je Geometrie-Klasse: Trefferquote, Kontrolle D (gleiches Datum, gleiche ATR-Geometrie), Lift, Random-Walk-Erwartung
   b/(a+b), Gegenrichtung, Payoff (R), strukturelle Erwartung (R) gegen Kontrolle, Ausfuehrungs-Erwartung (Rendite nach
   Kosten) gegen gematchte Kontrolle, Abdeckung. Vergleich FULL gegen TREND_ONLY in derselben Klasse.

     node scripts/technical/hsab/track-a.mjs --events FILE.jsonl.gz --eval EVAL.json --out FILE
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT } from "../lib/ti-data.mjs";

const require = createRequire(import.meta.url);
const VS = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));
export const TRACKA_VERSION = "hsab-tracka-1.1.0";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }

/** Geometrie-Klassen (vorab registriert in protocol9.json): Chance/Risiko = Zielabstand / Invalidationsabstand (ab Anzeigeschluss, ATR). */
export const RR_BUCKETS = [["RR<0.5", 0, 0.5], ["RR0.5-0.75", 0.5, 0.75], ["RR0.75-1.33_SYMMETRIC", 0.75, 1.3334], ["RR1.33-2", 1.3334, 2], ["RR2-3", 2, 3], ["RR>=3", 3, Infinity]];
export const KT_BUCKETS = [["T<1ATR", 0, 1], ["T1-2ATR", 1, 2], ["T2-3ATR", 2, 3], ["T3-5ATR", 3, 5], ["T>=5ATR", 5, Infinity]];
const bucketOf = (B, x) => { for (const [n, lo, hi] of B) if (x >= lo && x < hi) return n; return null; };

const BLOCK = "HALF";
function stat(rows, label) {
  if (!rows.length) return { n: 0 };
  const b = VS.twoWayBoot(rows, (x) => x.s, (x) => VS.timeBlockOf(x.d, BLOCK), (x) => [x.y, 1, x.cH, x.cN, x.R, x.cR, x.oppY ?? 0, x.oppY === null ? 0 : 1, x.oppR ?? 0],
    { hit: (v) => v[0] / v[1], ctrl: (v) => v[2] / v[3], lift: (v) => v[0] / v[1] - v[2] / v[3], R: (v) => v[4] / v[1], excessR: (v) => (v[4] - v[5]) / v[1],
      oppDiff: (v) => (v[7] ? v[0] / v[1] - v[6] / v[7] : null) }, { B: 500, seed: VS.seedOf(label) });
  const S = b.stats, pr = (x) => [x.lo, x.hi];
  return { n: rows.length, symbols: b.symbols, hit: S.hit.est, hitCi: pr(S.hit), control: S.ctrl.est, lift: S.lift.est, liftCi: pr(S.lift), liftP: S.lift.p,
           expectancyR: S.R.est, expectancyRCi: pr(S.R), excessR: S.excessR.est, excessRCi: pr(S.excessR), oppositeDiff: S.oppDiff.est, oppositeDiffCi: pr(S.oppDiff) };
}
function payoff(rows) {
  const w = rows.filter((x) => x.y === 1).map((x) => x.R), l = rows.filter((x) => x.y !== 1).map((x) => x.R);
  const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
  const ex = rows.filter((x) => x.exD && x.exD[0] > 0 && ["TARGET1", "INVALIDATED", "TIMEOUT"].includes(x.ex) && isNum(x.exR));
  const qs = (a, p) => r4(VS.quantile(a, p));
  return { randomWalkExpectation: r4(mean(rows.map((x) => x.kI / (x.kI + x.kT)))), medianTargetAtr: r4(VS.median(rows.map((x) => x.kT))), medianInvalidationAtr: r4(VS.median(rows.map((x) => x.kI))),
    avgWinnerR: r4(mean(w)), medianWinnerR: r4(VS.median(w)), avgLoserR: r4(mean(l)), medianLoserR: r4(VS.median(l)), payoffRatio: w.length && l.length && mean(l) < 0 ? r4(mean(w) / Math.abs(mean(l))) : null,
    rP05: qs(rows.map((x) => x.R), 0.05), rP95: qs(rows.map((x) => x.R), 0.95), medianMfeAtr: r4(VS.median(rows.map((x) => x.mfe))), medianMaeAtr: r4(VS.median(rows.map((x) => x.mae))),
    medianBars: VS.median(rows.map((x) => x.bars)),
    trading: { filled: ex.length, meanReturnAfterCosts: r4(mean(ex.map((x) => x.exR))), controlMeanReturn: r4(ex.reduce((a, x) => a + x.exD[2], 0) / Math.max(1, ex.reduce((a, x) => a + x.exD[0], 0))),
               winRate: r4(ex.filter((x) => x.exR > 0).length / Math.max(1, ex.length)), avgWin: r4(mean(ex.filter((x) => x.exR > 0).map((x) => x.exR))), avgLoss: r4(mean(ex.filter((x) => x.exR <= 0).map((x) => x.exR))) } };
}
const quadrant = (s, p) => (s.n ? (s.hit >= 0.6 ? "HIGH_ACCURACY" : "LOW_ACCURACY") + "/" + (p.payoffRatio !== null && p.payoffRatio >= 1.5 ? "HIGH_PAYOFF" : "LOW_PAYOFF") : null);

export function trackA(events, evalJson) {
  const analysisPoints = evalJson ? evalJson.tables.primary.analysisPoints : null;
  const full = events.filter((x) => x.v === "FULL"), trend = events.filter((x) => x.v === "TREND_ONLY");
  const row = (name, sel, label) => { const a = full.filter(sel), b = trend.filter(sel); const S = stat(a, "A|" + label + "|" + name), P = payoff(a);
    return { bucket: name, events: a.length, shareOfEvents: r4(a.length / Math.max(1, full.length)), coverageOfPoints: analysisPoints ? r4(a.length / analysisPoints) : null, ...S, ...P,
             quadrant: quadrant(S, P), trendOnly: b.length ? { n: b.length, hit: r4(b.filter((x) => x.y).length / b.length), control: r4(b.reduce((q, x) => q + x.cH, 0) / b.reduce((q, x) => q + x.cN, 0)),
             lift: r4(b.filter((x) => x.y).length / b.length - b.reduce((q, x) => q + x.cH, 0) / b.reduce((q, x) => q + x.cN, 0)) } : null }; };
  const out = { schemaVersion: "hsab-tracka-result-1.0.0", version: TRACKA_VERSION, phase: evalJson ? evalJson.phase : null, events: full.length, trendOnlyEvents: trend.length, analysisPoints };
  out.all = row("ALL", () => true, "all");
  out.byRewardRisk = RR_BUCKETS.map(([n]) => row(n, (x) => bucketOf(RR_BUCKETS, x.kT / x.kI) === n, "rr"));
  out.byTargetAtr = KT_BUCKETS.map(([n]) => row(n, (x) => bucketOf(KT_BUCKETS, x.kT) === n, "kt"));
  out.byInvalidationAtr = KT_BUCKETS.map(([n]) => row(n.replace("T", "I"), (x) => bucketOf(KT_BUCKETS, x.kI) === n, "ki"));
  out.byDirectionRR = ["BULL", "BEAR"].flatMap((dn) => RR_BUCKETS.map(([n]) => row(dn + "·" + n, (x) => (x.dir > 0 ? "BULL" : "BEAR") === dn && bucketOf(RR_BUCKETS, x.kT / x.kI) === n, "drr")));
  /* Selektivitaet innerhalb der symmetrischen und der guenstigen Geometrie (Stufen aus Mission VIII, eingefroren) */
  const sym = (x) => x.kT / x.kI >= 0.75 && x.kT / x.kI < 1.3334, fav = (x) => x.kT / x.kI >= 1.3334;
  const tiers = [["ALL", () => true], ["CLEAR", (x) => x.cl === "CLEAR"], ["AGREEMENT_TOP25", (x) => Math.abs(x.ag) >= 0.7793], ["CLEAR_TOP25", (x) => x.cl === "CLEAR" && Math.abs(x.ag) >= 0.7793], ["AGREEMENT_TOP10", (x) => Math.abs(x.ag) >= 0.8706]];
  out.selectivitySymmetric = tiers.map(([n, f]) => row("SYM·" + n, (x) => sym(x) && f(x), "selsym"));
  out.selectivityFavorable = tiers.map(([n, f]) => row("FAV·" + n, (x) => fav(x) && f(x), "selfav"));
  out.selectivityAll = tiers.map(([n, f]) => row("ALL·" + n, f, "selall"));
  /* Kandidaten-Suche (explorativ, nur DEV): Klassen mit Trefferquote ≥ 60 %, Lift ≥ +5 Pp. (untere KI-Grenze > 0), Geometrie nicht nah (CRV ≥ 0,75) */
  out.highAccuracyCandidates = [...out.byRewardRisk, ...out.byDirectionRR, ...out.selectivitySymmetric, ...out.selectivityFavorable]
    .filter((r) => r.n >= 300 && r.hit >= 0.6 && r.lift >= 0.05 && r.liftCi[0] > 0 && !/RR<0.5|RR0.5-0.75/.test(r.bucket)).map((r) => r.bucket);
  return out;
}

/* ======================================================================
   Entscheidung nach MISSION9_PREREGISTRATION.md §2 (mechanisch, vor dem Oeffnen festgelegt)
   ====================================================================== */
export const HAC = { minN: 300, minHit: 0.6, minLift: 0.05 };
export const SELECTIVE_TIERS = ["SYM·CLEAR", "SYM·AGREEMENT_TOP25", "SYM·AGREEMENT_TOP10", "FAV·ALL", "FAV·CLEAR", "FAV·AGREEMENT_TOP25", "FAV·AGREEMENT_TOP10", "RR1.33-2"];
const meetsHac = (r) => !!r && r.n >= HAC.minN && r.hit >= HAC.minHit && r.lift >= HAC.minLift && isNum(r.liftCi && r.liftCi[0]) && r.liftCi[0] > 0;
const oneSidedP = (r) => (!r || !isNum(r.liftP) ? 1 : r.lift > 0 ? r.liftP / 2 : 1 - r.liftP / 2);
function holm(rows) {
  const o = rows.map((r, i) => [oneSidedP(r), i]).sort((a, b) => a[0] - b[0]), m = o.length, adj = new Array(m).fill(1); let run = 0;
  o.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, p * (m - k))); adj[i] = run; });
  return adj;
}
export function decideTrackA(res) {
  const all = [...res.byRewardRisk, ...res.selectivitySymmetric, ...res.selectivityFavorable, ...res.selectivityAll], get = (b) => all.find((r) => r.bucket === b);
  const symAll = get("SYM·ALL");
  const tiers = SELECTIVE_TIERS.map(get), adj = holm(tiers);
  const tierRows = SELECTIVE_TIERS.map((b, k) => ({ bucket: b, n: tiers[k] ? tiers[k].n : 0, hit: tiers[k] ? tiers[k].hit : null, lift: tiers[k] ? tiers[k].lift : null, liftCi: tiers[k] ? tiers[k].liftCi : null,
    meetsHac: meetsHac(tiers[k]), pHolm: r4(adj[k]), qualifies: meetsHac(tiers[k]) && adj[k] <= 0.025 }));
  const HA1 = meetsHac(symAll) ? "ROBUST_HIGH_ACCURACY_EDGE" : tierRows.some((x) => x.qualifies) ? "SELECTIVE_HIGH_ACCURACY_EDGE" : "NO_HIGH_ACCURACY_EDGE";
  const h2 = [get("ALL·AGREEMENT_TOP10"), get("SYM·AGREEMENT_TOP10")], adj2 = holm(h2);
  const HA2 = h2.map((r, k) => ({ bucket: r && r.bucket, lift: r && r.lift, liftCi: r && r.liftCi, pHolm: r4(adj2[k]), detected: !!r && adj2[k] <= 0.025 && r.liftCi[0] > 0,
    meaningful: !!r && r.lift >= 0.02 && r.liftCi[0] >= 0.005 }));
  const near = get("RR<0.5");
  const HA3 = near && near.n ? { controlHit: near.control, controlAtLeast60: near.control >= 0.6, hit: near.hit, randomWalk: near.randomWalkExpectation, hitBelowRandomWalk: near.hit < near.randomWalkExpectation } : null;
  const toDiff = (r) => (r && r.trendOnly ? r4(r.lift - r.trendOnly.lift) : null);
  const HA4 = { "ALL·ALL": toDiff(get("ALL·ALL")), "SYM·ALL": toDiff(symAll) }; HA4.within15pp = Object.values(HA4).every((v) => isNum(v) && Math.abs(v) < 0.015);
  const ex = (r) => r && { n: r.n, expectancyR: r.expectancyR, expectancyRCi: r.expectancyRCi, excessR: r.excessR, excessRCi: r.excessRCi, trading: r.trading };
  const fav = get("FAV·ALL");
  const HA5 = { ALL: ex(res.all), SYM: ex(symAll), FAV: ex(fav), structuralNegativeAll: !!res.all && res.all.expectancyR < 0 };
  return { rule: "MISSION9_PREREGISTRATION.md §2", HAC, HA1, symmetricAll: symAll && { n: symAll.n, hit: symAll.hit, control: symAll.control, lift: symAll.lift, liftCi: symAll.liftCi, meetsHac: meetsHac(symAll) },
           selectiveTiers: tierRows, HA2, HA3, HA4, HA5 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ev = gunzipSync(readFileSync(arg("events"))).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const evalJson = arg("eval", null) ? JSON.parse(readFileSync(arg("eval"), "utf8")) : null;
  const res = trackA(ev, evalJson);
  res.decision = decideTrackA(res);
  writeFileSync(arg("out"), JSON.stringify(res, null, 1));
  console.log(`[track-a] ${res.events} Ereignisse; Kandidaten: ${JSON.stringify(res.highAccuracyCandidates)}; HA1 ${res.decision.HA1}`);
}
