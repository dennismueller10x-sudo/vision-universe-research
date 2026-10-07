#!/usr/bin/env node
/* =========================================================================
   VU MISSION IX — TRACK B: ASYMMETRISCHE GEWINNER / WELLE-3

   Grundsatz (§20/§47): NIE bei den Gewinnern anfangen. Einheit ist jeder zulaessige Titel in jedem Kalenderquartal
   des historischen Universums (Titel × Quartal). Bezugspunkt t = letzte Wochenbar des Quartals (Schluss).
     • Signalzustand = was das eingefrorene Produkt zuletzt gezeigt hat: juengster versiegelter Stage-1-Record
       (Erkennungszeitpunkt) innerhalb der 13 Wochen bis t. Dazu einfache, VU-unabhaengige Merkmale aus Kursen bis t.
     • Erst danach: Zukunft ab t (max. Vielfaches, Endvielfaches, Zeit bis k×, MAE vor k×, Invalidation vor k×,
       Delisting). Ein Signal gilt nie rueckwirkend.
   Kontrollen: Schichten (Quartal × einfacher Trend × Momentum-Terzil × Volatilitaets-Terzil × Abstand-zum-52W-Hoch-Terzil
   × Listing-Alter) — erwartete Quote/Rendite je Signal = Mittel der Schicht ohne die Einheit selbst.

     node scripts/technical/hsab/track-b.mjs --records DIR [--delisted FILE] [--weekly-dir DIR] --bucket a/b --from D --to D --out FILE
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { ROOT } from "../lib/ti-data.mjs";
import { loadPanel, eligible } from "./lib/panel.mjs";

const require = createRequire(import.meta.url);
const VS = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));
export const TRACKB_VERSION = "hsab-trackb-1.2.0";   // 1.1.0: MFE; Quartalsend-Zustaende und interne Elliott-Kandidaten (--grid-records); 1.2.0: Zusatzwert von W3 innerhalb RS26/TREND_MOM/TREND (gleiche Schicht)
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const symHash = (s) => parseInt(sha("hsab|" + s).slice(0, 8), 16);
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }

export const HORIZONS = { "6M": 26, "12M": 52, "24M": 104, "36M": 156 };
export const MULTS = [2, 3, 5, 10];   // Endvermoegen-Vielfache: 2× = +100 %, 3× = +200 %, 5× = +400 %, 10× = +900 %
const MIN_BARS = 160, LOOKBACK = 13;

/** Kompakte Signalzustaende aus den versiegelten Records (nur Erkennungszeitpunkte). */
function readStates(dir) {
  const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const by = new Map();
  for (const sh of man.shards) {
    const buf = readFileSync(join(dir, sh.file));
    if (sha(buf) !== sh.sha256) throw new Error("Siegel verletzt: " + sh.file);
    for (const line of gunzipSync(buf).toString("utf8").split("\n")) {
      if (!line) continue; const r = JSON.parse(line); if (!r.dp) continue;
      const ew = r.ew || {};
      const st = { i: r.i, d: r.d, pdir: r.P ? r.P.dir : 0, pinv: r.P ? r.P.inv : null, cl: r.cl, ag: r.ag,
        ewp: ew.p || null, eww: ew.w || null, ewm: ew.motive || 0, ewab: ew.ab ? 1 : 0, ewd: ew.d || 0, ewhd: ew.hd ?? null, ewinv: ew.inv ?? null, ewinvDir: ew.invDir || null };
      let a = by.get(r.s); if (!a) by.set(r.s, (a = [])); a.push(st);
    }
  }
  for (const a of by.values()) a.sort((x, y) => x.i - y.i);
  return { man, by };
}

/** Mission IX: exakte Quartalsend-Zustaende mit internen Elliott-Kandidaten (replay.mjs --grid quarter --grid-only --forensics). */
function readGrid(dir) {
  const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const by = new Map();
  for (const sh of man.shards) {
    const buf = readFileSync(join(dir, sh.file));
    if (sha(buf) !== sh.sha256) throw new Error("Siegel verletzt: " + sh.file);
    for (const line of gunzipSync(buf).toString("utf8").split("\n")) {
      if (!line) continue; const r = JSON.parse(line); if (!r.g) continue;
      const ew = r.ew || {};
      let m = by.get(r.s); if (!m) by.set(r.s, (m = new Map()));
      m.set(r.i, { pdir: r.P ? r.P.dir : 0, cl: r.cl, ag: r.ag, ewp: ew.p || null, eww: ew.w || null, ewm: ew.motive || 0, ewab: ew.ab ? 1 : 0, ewd: ew.d || 0, fx: r.fx || null });
    }
  }
  return { man, by };
}
export const earlyUp = (c) => !!c && c.dir === 1 && !c.complete && (c.waves === 2 || c.waves === 3) && c.endAge <= 4;

/** Signaldefinitionen (eingefroren in protocol9.json; hier die Umsetzung). */
export const SIGNALS = {
  BASE: () => true,
  VU_BULL: (u) => u.st && u.st.pdir === 1,
  VU_BULL_CLEAR: (u) => u.st && u.st.pdir === 1 && u.st.cl === "CLEAR",
  VU_BULL_STRONG: (u) => u.st && u.st.pdir === 1 && u.st.cl === "CLEAR" && Math.abs(u.st.ag) >= 0.7793,
  EW_MOTIVE_UP_DISPLAYED: (u) => u.st && u.st.ewm === 1 && !u.st.ewab && u.st.ewd > 0,
  EW_W3_INTERNAL: (u) => u.st && /IMPULSE|DIAGONAL/.test(u.st.ewp || "") && u.st.eww === "3" && u.st.ewd > 0,
  EW_EARLY_MOTIVE_INTERNAL: (u) => u.st && u.st.ewm === 1 && ["1", "2", "3"].includes(u.st.eww) && u.st.ewd > 0,
  EW_W3_HD_ALIGNED: (u) => u.st && /IMPULSE|DIAGONAL/.test(u.st.ewp || "") && u.st.eww === "3" && u.st.ewd > 0 && isNum(u.st.ewhd) && u.st.ewhd >= 0.75,
  TREND: (u) => u.trend === 1,
  MOM_TOP20: (u) => u.momQ >= 0.8,
  RS26_TOP20: (u) => u.rsQ >= 0.8,
  BREAKOUT52: (u) => u.dist52 >= 0.999,
  TREND_MOM: (u) => u.trend === 1 && u.momQ >= 0.8,
  W3_AND_TREND_MOM: (u) => SIGNALS.EW_EARLY_MOTIVE_INTERNAL(u) && u.trend === 1 && u.momQ >= 0.8,
  VU_BULL_AND_TREND_MOM: (u) => u.st && u.st.pdir === 1 && u.trend === 1 && u.momQ >= 0.8
};
/** Nur mit --grid-records (exakter Zustand am Quartalsende + interne Elliott-Kandidaten, Mission-VI-Forensik-Haken).
    „Fruehe Aufwaerts-Motivwelle“ (earlyUp): bester interner IMPULSE-Kandidat aufwaerts, unvollstaendig, mit 2 markierten
    Wellen (Welle 2 abgeschlossen, Welle 3 stuende bevor) ODER 3 markierten Wellen (Welle 3 bereits markiert und laufend),
    letzte Wellenmarke hoechstens 4 Wochen alt. Offenlegung (Red Team M3): festgelegt NACH Sichtung der PLTR-Fallstudie und
    vor jeder Universumsauswertung; deshalb zusaetzlich die breiteste Lesart EW_INT_UP_ANY_OPEN. Elliott ist explorativ. */
export const GRID_SIGNALS = {
  VU_BULL_EXACT: (u) => u.gx && u.gx.pdir === 1,
  EW_DISPLAYED_MOTIVE_UP: (u) => u.gx && u.gx.ewm === 1 && !u.gx.ewab && u.gx.ewd > 0,
  EW_INT_UP_EARLY: (u) => u.gx && u.gx.fx && earlyUp(u.gx.fx.IMPULSE),
  EW_INT_UP_EARLY_TOP5: (u) => u.gx && u.gx.fx && earlyUp(u.gx.fx.IMPULSE) && u.gx.fx.IMPULSE.pos <= 4,
  EW_INT_LD_UP_EARLY: (u) => u.gx && u.gx.fx && earlyUp(u.gx.fx.LEADING_DIAGONAL),
  /* Robustheit (vor der Wave-3-Auswertung festgelegt, Red Team M3): breiteste Lesart — irgendein unvollstaendiger
     Aufwaerts-IMPULSE als bester interner Kandidat, ohne Wellenzahl- und Altersbedingung. */
  EW_INT_UP_ANY_OPEN: (u) => u.gx && u.gx.fx && !!u.gx.fx.IMPULSE && u.gx.fx.IMPULSE.dir === 1 && !u.gx.fx.IMPULSE.complete,
  EW_INT_UP_EARLY_AND_TREND_MOM: (u) => GRID_SIGNALS.EW_INT_UP_EARLY(u) && u.trend === 1 && u.momQ >= 0.8,
  EW_INT_UP_EARLY_AND_RS: (u) => GRID_SIGNALS.EW_INT_UP_EARLY(u) && u.rsQ >= 0.8
};

function quarterOf(d) { return d.slice(0, 4) + "Q" + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1); }

/** Einheiten (Titel × Quartal) mit Merkmalen bis t und Zukunft ab t. */
export function buildUnits(panel, states, o) {
  const units = [];
  for (const e of panel.list) {
    if (o.only && !o.only.has(e.symbol)) continue;
    const sts = states.get(e.symbol) || [];
    /* Datenqualitaet (§67, vorab registriert): Wochensprung > ×4 oder < ×0,25 = ungeklaerte Split-/Datenanomalie.
       Kumulierte Zaehlung, damit je Fenster in O(1) geprueft wird. */
    const jc = new Int32Array(e.length + 1);
    for (let i = 0; i < e.length; i++) { const r = i > 0 ? e.close[i] / e.close[i - 1] : 1; jc[i + 1] = jc[i] + (r > 4 || r < 0.25 ? 1 : 0); }
    const anomalous = (a, b) => jc[Math.min(e.length, b + 1)] - jc[Math.max(0, a)] > 0;
    let k = 0;
    for (let t = MIN_BARS - 1; t < e.length; t++) {
      const qEnd = t === e.length - 1 ? false : quarterOf(e.dates[t + 1]) !== quarterOf(e.dates[t]);
      if (!qEnd) continue;
      if (o.from && e.dates[t] < o.from) continue; if (o.to && e.dates[t] > o.to) continue;
      if (!eligible(e, t, MIN_BARS)) continue;
      while (k < sts.length && sts[k].i <= t) k++;
      const st = k > 0 && t - sts[k - 1].i <= LOOKBACK ? sts[k - 1] : null;
      const c = e.close[t];
      let mx = -Infinity; for (let j = t - 51; j <= t; j++) if (j >= 0) mx = Math.max(mx, e.close[j]);
      const gx = o.grid ? (o.grid.get(e.symbol) || new Map()).get(t) || null : null;
      if (o.grid && !gx) continue;
      const u = { s: e.symbol, c: e.cohort, d: e.dates[t], q: quarterOf(e.dates[t]), t, st, gx, trend: e.trend[t], atrPct: e.atrPct[t],
                  ret52: c / e.close[t - 52] - 1, ret26: c / e.close[t - 26] - 1, dist52: c / mx, age: t, delisted: e.cohort === "DELISTED_W" };
      /* Zukunft je Horizont: max. Vielfaches, Endvielfaches, Zeit bis k×, MAE vor k×, Invalidation vor k× */
      u.f = {};
      for (const [hn, H] of Object.entries(HORIZONS)) {
        const last = Math.min(e.length - 1, t + H), complete = t + H <= e.length - 1;
        /* Ueberlebende: Horizont muss beobachtbar sein. Delistete: Reihe endet = Delisting → Endwert = letzter Schluss (offengelegt). */
        if (!complete && !u.delisted) { u.f[hn] = null; continue; }
        /* Red Team H3: Standard prueft nur die Vergangenheit [t-52, t] (kausal). Ein Ausschluss wegen Spruengen NACH t
           waere Selektion auf das Ergebnis (entfernte gerade die 5×/10×-Faelle). Die alte Variante bleibt als Sensitivitaet. */
        const gateEnd = o.gate === "full" ? last : t;
        if (o.gate !== "none" && anomalous(t - 52, gateEnd)) { u.f[hn] = null; u.anomaly = (u.anomaly || 0) + 1; continue; }
        let mxm = 1, mae = 0; const tk = {}, maeK = {}, invK = {};
        const inv = st && st.pdir === 1 && isNum(st.pinv) ? st.pinv : null;
        let invHit = -1;
        for (let j = t + 1; j <= last; j++) {
          const m = e.close[j] / c;
          if (inv !== null && invHit < 0 && e.close[j] < inv) invHit = j;
          if (m - 1 < mae) mae = m - 1;
          if (m > mxm) mxm = m;
          for (const K of MULTS) if (tk[K] === undefined && m >= K) { tk[K] = j - t; maeK[K] = r4(mae); invK[K] = invHit >= 0 ? 1 : 0; }
        }
        u.f[hn] = { maxM: r4(mxm), endM: r4(e.close[last] / c), mae: r4(mae), tk, maeK, invK, delistedBefore: u.delisted && !complete ? 1 : 0, invBeforeEnd: invHit >= 0 ? 1 : 0, futJump: anomalous(t + 1, last) ? 1 : 0 };
      }
      units.push(u);
    }
  }
  /* Querschnitts-Rangfolgen je Quartal (Momentum 52 W, relative Staerke 26 W) und Terzile fuer die Schichtung */
  const byQ = new Map(); units.forEach((u) => { let a = byQ.get(u.q); if (!a) byQ.set(u.q, (a = [])); a.push(u); });
  for (const a of byQ.values()) {
    const rank = (key, out) => { const s = a.filter((u) => isNum(u[key])).sort((x, y) => x[key] - y[key]); s.forEach((u, k) => { u[out] = s.length > 1 ? k / (s.length - 1) : 0.5; }); };
    rank("ret52", "momQ"); rank("ret26", "rsQ"); rank("atrPct", "volQ"); rank("dist52", "distQ");
  }
  units.forEach((u) => { const t3 = (x) => (x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2); u.stratum = [u.q, u.trend, t3(u.momQ), t3(u.volQ), t3(u.distQ), u.age < 260 ? 0 : u.age < 520 ? 1 : 2].join("|"); });
  return units;
}

/* Red Team M1: Zeitbloecke mindestens so lang wie der Horizont (6M/12M: 1 Jahr, 24M: 2 Jahre, 36M: 3 Jahre),
   sonst ueberlappen die Ergebnisfenster benachbarter Bloecke und die Zeit-Unsicherheit wird unterschaetzt. */
const blockYears = (hn) => Math.max(1, Math.ceil(HORIZONS[hn] / 52));
function boot(rows, stats, label, hn, nullValue) {
  const k = blockYears(hn);
  return VS.twoWayBoot(rows, (x) => x.s, (x) => "Y" + Math.floor(+x.d.slice(0, 4) / k), (x) => x.v, stats, { B: 500, seed: VS.seedOf(label), nullValue });
}

/** Kennzahlen eines Signals bei Horizont hn. */
function evaluateSignal(units, name, fn, hn, strat) {
  const all = units.filter((u) => u.f[hn]);
  const flagged = all.filter(fn);
  const n = all.length, nf = flagged.length;
  const out = { signal: name, horizon: hn, units: n, flagged: nf, coverage: r4(nf / Math.max(1, n)), symbols: new Set(flagged.map((u) => u.s)).size };
  if (!nf) return out;
  /* Red Team M2: Erwartung aus den NICHT markierten Einheiten derselben Schicht (sonst zieht ein Signal, das seine
     Schichten dominiert, den Vergleich gegen 1). Datumsbasis bleibt das ganze uebrige Quartal (Universum ohne die Einheit). */
  const Sf = new Map();
  for (const u of flagged) { const f = u.f[hn]; let S = Sf.get(u.stratum); if (!S) Sf.set(u.stratum, (S = { n: 0, k: Object.fromEntries(MULTS.map((K) => [K, 0])), sumRet: 0, sumCap: 0 }));
    S.n++; S.sumRet += f.endM - 1; S.sumCap += Math.min(f.endM - 1, 4); for (const K of MULTS) if (f.maxM >= K) S.k[K]++; }
  const rest = (u) => { const S = strat.get(u.stratum + "|" + hn), F = Sf.get(u.stratum); const m = S.n - F.n; return m > 0 ? { n: m, k: Object.fromEntries(MULTS.map((K) => [K, S.k[K] - F.k[K]])), sumRet: S.sumRet - F.sumRet, sumCap: S.sumCap - F.sumCap } : null; };
  const noComp = flagged.filter((u) => !rest(u)).length;
  out.matching = { comparator: "NON_FLAGGED_SAME_STRATUM", flaggedWithoutComparator: noComp, meanFlaggedShareOfStratum: r4(VS.mean(flagged.map((u) => Sf.get(u.stratum).n / strat.get(u.stratum + "|" + hn).n))) };
  /* Praezision, Recall, Lift gegen geschichtete Erwartung */
  out.mult = {};
  for (const K of MULTS) {
    const hit = (u) => (u.f[hn].maxM >= K ? 1 : 0);
    const exp = (u, key) => { const S = strat.get(key + "|" + hn); if (!S || S.n < 2) return null; return (S.k[K] - hit(u)) / (S.n - 1); };
    const expS = (u) => { const R = rest(u); return R ? R.k[K] / R.n : null; };
    const rows = flagged.map((u) => { const ex = expS(u), eq = exp(u, "Q|" + u.q); return ex === null || eq === null ? null : { s: u.s, d: u.d, v: [hit(u), 1, ex, 1, eq] }; }).filter(Boolean);
    const b = boot(rows, { prec: (v) => v[0] / v[1], expd: (v) => v[2] / v[3], ratio: (v) => (v[2] > 0 ? v[0] / v[2] : null), diff: (v) => v[0] / v[1] - v[2] / v[3],
                           expQ: (v) => v[4] / v[3], ratioQ: (v) => (v[4] > 0 ? v[0] / v[4] : null) }, name + "|" + hn + "|" + K, hn);
    const winners = all.filter((u) => hit(u)).length, caught = flagged.filter((u) => hit(u)).length;
    const tk = flagged.filter((u) => u.f[hn].tk[K] !== undefined);
    out.mult[K + "x"] = { precision: b.stats.prec.est, precisionCi: [b.stats.prec.lo, b.stats.prec.hi], dateOnlyExpected: b.stats.expQ.est, liftRatioDateOnly: b.stats.ratioQ.est, liftRatioDateOnlyCi: [b.stats.ratioQ.lo, b.stats.ratioQ.hi], matchedExpected: b.stats.expd.est, liftRatio: b.stats.ratio.est, liftRatioCi: [b.stats.ratio.lo, b.stats.ratio.hi],
      liftDiff: b.stats.diff.est, liftDiffCi: [b.stats.diff.lo, b.stats.diff.hi], baseRate: r4(winners / Math.max(1, n)), recall: r4(caught / Math.max(1, winners)), winners, caught,
      falseDiscovery: r4(1 - caught / nf), medianWeeksToK: VS.median(tk.map((u) => u.f[hn].tk[K])), medianMaeBeforeK: VS.median(tk.map((u) => u.f[hn].maeK[K])),
      invalidatedBeforeK: tk.length ? r4(tk.filter((u) => u.f[hn].invK[K]).length / tk.length) : null };
  }
  /* Endrendite-Verteilung (Struktur: Kauf bei t, Halten bis H; keine Ausfuehrung) */
  const ret = flagged.map((u) => u.f[hn].endM - 1).sort((a, b) => a - b);
  const q = (p) => r4(VS.quantile(ret, p)), mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const win = ret.filter((x) => x > 0), loss = ret.filter((x) => x <= 0);
  const pos = win.reduce((a, b) => a + b, 0), top = (p) => { const k = Math.max(1, Math.floor(ret.length * p)); return r4(ret.slice(-k).reduce((a, b) => a + b, 0) / Math.max(1e-9, pos)); };
  const meanWithout = (k) => r4(mean(ret.slice(0, Math.max(0, ret.length - k))));
  const expRet = (u, key) => { const S = strat.get(key + "|" + hn); return S && S.n > 1 ? (S.sumRet - (u.f[hn].endM - 1)) / (S.n - 1) : null; };
  const expCap = (u, key) => { const S = strat.get(key + "|" + hn); return S && S.n > 1 ? (S.sumCap - Math.min(u.f[hn].endM - 1, 4)) / (S.n - 1) : null; };
  const rrows = flagged.map((u) => { const R = rest(u), ex = R ? R.sumRet / R.n : null, eq = expRet(u, "Q|" + u.q), ec = R ? R.sumCap / R.n : null; return ex === null || eq === null ? null : { s: u.s, d: u.d, v: [u.f[hn].endM - 1, 1, ex, 1, Math.min(u.f[hn].endM - 1, 4), ec, eq] }; }).filter(Boolean);
  const rb = boot(rrows, { mean: (v) => v[0] / v[1], expd: (v) => v[2] / v[3], excess: (v) => v[0] / v[1] - v[2] / v[3], excessCapped: (v) => v[4] / v[1] - v[5] / v[3], excessDateOnly: (v) => v[0] / v[1] - v[6] / v[3] }, name + "|" + hn + "|ret", hn);
  /* Medianer Ueberschuss (Quantil-Vergleich, robust gegen Fettschwaenze): Median minus Median der Schicht-Erwartung */
  out.returns = { mean: rb.stats.mean.est, meanCi: [rb.stats.mean.lo, rb.stats.mean.hi], matchedMean: rb.stats.expd.est, excessMean: rb.stats.excess.est, excessMeanCi: [rb.stats.excess.lo, rb.stats.excess.hi],
    excessMeanCapped4x: rb.stats.excessCapped.est, excessMeanCapped4xCi: [rb.stats.excessCapped.lo, rb.stats.excessCapped.hi], excessMeanDateOnly: rb.stats.excessDateOnly.est, excessMeanDateOnlyCi: [rb.stats.excessDateOnly.lo, rb.stats.excessDateOnly.hi],
    median: q(0.5), p05: q(0.05), p25: q(0.25), p75: q(0.75), p95: q(0.95), p99: q(0.99), trimmedMean5: r4(mean(ret.slice(Math.floor(ret.length * 0.05), Math.ceil(ret.length * 0.95)))),
    winRate: r4(win.length / ret.length), avgWinner: r4(mean(win)), medianWinner: r4(VS.median(win)), avgLoser: r4(mean(loss)), medianLoser: r4(VS.median(loss)),
    payoffRatio: loss.length && mean(loss) < 0 ? r4(mean(win) / Math.abs(mean(loss))) : null, expectancy: r4((win.length / ret.length) * mean(win) + (loss.length / ret.length) * (mean(loss) || 0)),
    skew: r4((() => { const m = mean(ret), s = Math.sqrt(mean(ret.map((x) => (x - m) ** 2))); return s > 0 ? mean(ret.map((x) => ((x - m) / s) ** 3)) : null; })()),
    top1PctShareOfGains: top(0.01), top5PctShareOfGains: top(0.05), meanWithoutTop1: meanWithout(1), meanWithoutTop3: meanWithout(3),
    meanWithoutTop1Pct: meanWithout(Math.floor(ret.length * 0.01)), meanWithoutTop5Pct: meanWithout(Math.floor(ret.length * 0.05)),
    futureJumpShare: r4(flagged.filter((u) => u.f[hn].futJump).length / nf),
    medianMae: VS.median(flagged.map((u) => u.f[hn].mae)), medianMfe: r4(VS.median(flagged.map((u) => u.f[hn].maxM - 1))), meanMfe: r4(mean(flagged.map((u) => u.f[hn].maxM - 1))),
    delistedShare: r4(flagged.filter((u) => u.f[hn].delistedBefore).length / nf),
    invalidatedShare: r4(flagged.filter((u) => u.f[hn].invBeforeEnd).length / nf) };
  return out;
}

export function trackB(o) {
  const { man, by } = readStates(o.records);
  let symbols = Array.from(by.keys());
  if (o.bucket) { const [a, b] = o.bucket.split("/").map(Number); symbols = symbols.filter((s) => symHash(s) % b === a); }
  const G = o.gridRecords ? readGrid(o.gridRecords) : null;
  if (G) symbols = symbols.filter((x) => G.by.has(x));
  const only = new Set(symbols);
  const panel = loadPanel({ weeklyDir: o.weeklyDir, delisted: o.delisted, only });
  const units = buildUnits(panel, by, { from: o.from, to: o.to, only, gate: o.gate || "past", grid: G ? G.by : null });
  const SIG = G ? { ...SIGNALS, ...GRID_SIGNALS } : SIGNALS;
  const W3 = G ? GRID_SIGNALS.EW_INT_UP_EARLY : SIGNALS.EW_EARLY_MOTIVE_INTERNAL;
  /* Schicht-Summen je Horizont */
  const strat = new Map();
  for (const u of units) for (const hn of Object.keys(HORIZONS)) {
    const f = u.f[hn]; if (!f) continue;
    for (const key of [u.stratum + "|" + hn, "Q|" + u.q + "|" + hn]) {
      let S = strat.get(key);
      if (!S) strat.set(key, (S = { n: 0, k: Object.fromEntries(MULTS.map((K) => [K, 0])), sumRet: 0, sumCap: 0 }));
      S.n++; S.sumRet += f.endM - 1; S.sumCap += Math.min(f.endM - 1, 4); for (const K of MULTS) if (f.maxM >= K) S.k[K]++;
    }
  }
  const results = [];
  for (const [name, fn] of Object.entries(SIG)) for (const hn of Object.keys(HORIZONS)) results.push(evaluateSignal(units, name, fn, hn, strat));
  /* Welle-3-Zusatzwert: innerhalb TREND_MOM die Einheiten mit/ohne fruehe Motivwelle (gepaart nach Schicht) */
  const inc = {};
  for (const hn of Object.keys(HORIZONS)) {
    const tm = units.filter((u) => u.f[hn] && SIGNALS.TREND_MOM(u)), w = tm.filter((u) => W3(u)), nw = tm.filter((u) => !W3(u));
    inc[hn] = { trendMomUnits: tm.length, withW3: w.length, withoutW3: nw.length,
      ...Object.fromEntries(MULTS.map((K) => [K + "x", { withW3: r4(w.filter((u) => u.f[hn].maxM >= K).length / Math.max(1, w.length)), withoutW3: r4(nw.filter((u) => u.f[hn].maxM >= K).length / Math.max(1, nw.length)) }])),
      meanEndWith: r4(VS.mean(w.map((u) => u.f[hn].endM - 1))), meanEndWithout: r4(VS.mean(nw.map((u) => u.f[hn].endM - 1))),
      medianEndWith: r4(VS.median(w.map((u) => u.f[hn].endM - 1))), medianEndWithout: r4(VS.median(nw.map((u) => u.f[hn].endM - 1))) };
  }
  /* Zusatzwert innerhalb einer Basisgruppe (nach Red Team: „bringt Wave 3 etwas ueber RS bzw. Trend+Momentum hinaus?“):
     unter den Einheiten der Basisgruppe die mit W3-Kandidat gegen die ohne W3-Kandidat in DERSELBEN Schicht. */
  const within = {};
  for (const [bn, bf] of [["RS26_TOP20", SIGNALS.RS26_TOP20], ["TREND_MOM", SIGNALS.TREND_MOM], ["TREND", SIGNALS.TREND]]) {
    within[bn] = {};
    for (const hn of Object.keys(HORIZONS)) {
      const B = units.filter((u) => u.f[hn] && bf(u)), S = new Map();
      for (const u of B) { const w = W3(u) ? 1 : 0; let a = S.get(u.stratum); if (!a) S.set(u.stratum, (a = [{ n: 0, k: {}, r: 0 }, { n: 0, k: {}, r: 0 }])); const c = a[w]; c.n++; c.r += Math.min(u.f[hn].endM - 1, 4); for (const K of MULTS) c.k[K] = (c.k[K] || 0) + (u.f[hn].maxM >= K ? 1 : 0); }
      const fl = B.filter((u) => W3(u) && S.get(u.stratum)[0].n > 0);
      const res = { baseUnits: B.length, withW3: B.filter((u) => W3(u)).length, matched: fl.length };
      for (const K of MULTS) {
        const rows = fl.map((u) => { const c = S.get(u.stratum)[0]; return { s: u.s, d: u.d, v: [u.f[hn].maxM >= K ? 1 : 0, 1, c.k[K] / c.n, 1, Math.min(u.f[hn].endM - 1, 4), c.r / c.n] }; });
        if (!rows.length) { res[K + "x"] = null; continue; }
        const b = boot(rows, { prec: (v) => v[0] / v[1], ratio: (v) => (v[2] > 0 ? v[0] / v[2] : null), capEx: (v) => v[4] / v[1] - v[5] / v[3] }, "within|" + bn + "|" + hn + "|" + K, hn);
        res[K + "x"] = { precisionW3: b.stats.prec.est, ratio: b.stats.ratio.est, ratioCi: [b.stats.ratio.lo, b.stats.ratio.hi], cappedExcess: b.stats.capEx.est, cappedExcessCi: [b.stats.capEx.lo, b.stats.capEx.hi] };
      }
      within[bn][hn] = res;
    }
  }
  /* Fruehe Erkennung: Anteil der spaeteren Bewegung, der beim ersten Signal (Quartal) schon gelaufen war — fuer 5×-Gewinner (24M) */
  const early = {};
  for (const name of ["VU_BULL", "EW_EARLY_MOTIVE_INTERNAL", "TREND_MOM", "BREAKOUT52", "RS26_TOP20", ...(G ? ["VU_BULL_EXACT", "EW_INT_UP_EARLY"] : [])]) {
    const fn = SIG[name]; const bySym = new Map();
    units.filter((u) => u.f["24M"]).forEach((u) => { let a = bySym.get(u.s); if (!a) bySym.set(u.s, (a = [])); a.push(u); });
    const done = [];
    let episodes = 0;
    for (const a of bySym.values()) for (let k = 0; k < a.length; k++) {
      /* Episode = erstes Quartal, ab dem der Titel innerhalb 24 Monaten 5× erreicht (Vorquartal nicht) */
      /* Red Team LOW: „Vorquartal“ = unmittelbar vorangehendes Kalenderquartal (nicht nur das vorige Array-Element) */
      const qi = (u) => +u.q.slice(0, 4) * 4 + +u.q.slice(5) - 1;
      if (!(a[k].f["24M"].maxM >= 5) || (k > 0 && qi(a[k - 1]) === qi(a[k]) - 1 && a[k - 1].f["24M"].maxM >= 5)) continue;
      episodes++;
      for (let j = Math.max(0, k - 4); j <= k; j++) if (qi(a[k]) - qi(a[j]) <= 4 && fn(a[j])) { done.push({ quartersBefore: qi(a[k]) - qi(a[j]), remainingMultipleFromSignal: a[j].f["24M"].maxM }); break; }
    }
    early[name] = { episodes5x24M: episodes, flaggedBefore5x: done.length, shareFlagged: r4(done.length / Math.max(1, episodes)), medianQuartersEarly: VS.median(done.map((x) => x.quartersBefore)), medianRemainingMaxMultiple24M: VS.median(done.map((x) => x.remainingMultipleFromSignal)) };
  }
  return { schemaVersion: "hsab-trackb-result-1.0.0", version: TRACKB_VERSION, generatedAt: new Date().toISOString(), records: { sealHash: man.sealHash, engine: man.engine.scenario, elliott: man.engine.elliott }, gridRecords: G ? { sealHash: G.man.sealHash, symbols: G.by.size } : null, wave3Signal: G ? "EW_INT_UP_EARLY" : "EW_EARLY_MOTIVE_INTERNAL",
           opts: { bucket: o.bucket || null, from: o.from || null, to: o.to || null, delisted: !!o.delisted, anomalyGate: o.gate || "past" }, units: units.length, symbols: new Set(units.map((u) => u.s)).size,
           delistedUnits: units.filter((u) => u.delisted).length, anomalyExcludedUnitHorizons: units.reduce((a, u) => a + (u.anomaly || 0), 0), horizons: HORIZONS, multiples: MULTS, results, wave3WithinTrendMom: inc, wave3IncrementalWithin: within, earlyDetection: early };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = { records: arg("records"), weeklyDir: arg("weekly-dir", null), delisted: arg("delisted", null), bucket: arg("bucket", null), from: arg("from", null), to: arg("to", null), gate: arg("gate", "past"), gridRecords: arg("grid-records", null) };
  /* Red Team H4: Mindestkurs auf split-bereinigten Schlusskursen ist Look-ahead (ein bereinigter Kurs < 1 $ verraet spaetere Splits). */
  if (process.argv.includes("--min-price")) throw new Error("--min-price verworfen (Look-ahead auf split-bereinigten Kursen, Red Team H4)");
  if (!["past", "full", "none"].includes(o.gate)) throw new Error("--gate past|full|none");
  const t0 = Date.now(); const res = trackB(o); res.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(arg("out"), JSON.stringify(res, null, 1));
  console.log(`[track-b] ${res.units} Einheiten, ${res.symbols} Titel, ${res.seconds} s`);
}
