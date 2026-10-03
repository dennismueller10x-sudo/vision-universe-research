/* =========================================================================
   VU Technical Intelligence — Statistik der Elliott-Validierung
   (scripts/technical/elliott-validation.mjs)

   Bausteine
     • Cluster-Bootstrap nach TITEL (Signale desselben Titels sind abhaengig)
       und Block-Bootstrap nach KALENDERJAHR (Marktphasen) — berichtet wird
       jeweils das breitere Intervall.
     • Logistische Regression (Newton/IRLS, L2) walk-forward ueber Zeitbloecke:
       Training nur auf frueheren Bloecken, Vorhersage des naechsten Blocks.
     • Geschichtete Kontrolle (exakte Strata) fuer "Elliott-Label vs. gleiche
       Struktur ohne Label".
     • Benjamini-Hochberg fuer explorative Segmenttabellen.
   Keine externen Abhaengigkeiten; deterministisch (fester Seed).
   ========================================================================= */
"use strict";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
function mean(a) { a = (a || []).filter(isNum); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function quantile(a, q) { a = a.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); }
function median(a) { return quantile(a, 0.5); }
function rng(seed) { let s = seed >>> 0; return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------ Bootstrap
/**
 * Cluster-Bootstrap einer Statistik, die sich aus additiven Summen je Cluster berechnen laesst.
 * @param rows      Ereignisse
 * @param clusterFn Ereignis → Cluster-Schluessel (Titel oder Jahr)
 * @param sumsFn    Ereignis → Array additiver Beitraege (gleiche Laenge fuer alle)
 * @param statFn    Summenvektor → Statistik
 */
function clusterBoot(rows, clusterFn, sumsFn, statFn, B, seed) {
  const groups = new Map();
  let dim = null;
  for (const r of rows) {
    const v = sumsFn(r); if (!v) continue;
    dim = v.length;
    const k = clusterFn(r);
    let g = groups.get(k); if (!g) { g = new Float64Array(v.length); groups.set(k, g); }
    for (let i = 0; i < v.length; i++) g[i] += v[i];
  }
  if (!dim) return { est: null, lo: null, hi: null, clusters: 0 };
  const G = [...groups.values()], tot = new Float64Array(dim);
  for (const g of G) for (let i = 0; i < dim; i++) tot[i] += g[i];
  const est = statFn(tot), rand = rng(seed || 7), out = [];
  for (let b = 0; b < (B || 1000); b++) {
    const s = new Float64Array(dim);
    for (let j = 0; j < G.length; j++) { const g = G[Math.floor(rand() * G.length)]; for (let i = 0; i < dim; i++) s[i] += g[i]; }
    const v = statFn(s); if (isNum(v)) out.push(v);
  }
  return { est: r4(est), lo: r4(quantile(out, 0.025)), hi: r4(quantile(out, 0.975)), clusters: G.length };
}
/** Beide Cluster-Strukturen (Titel, Jahr); das breitere Intervall ist massgeblich. */
function bothBoot(rows, sumsFn, statFn, seed) {
  const bySym = clusterBoot(rows, (r) => r.sym, sumsFn, statFn, 1000, seed);
  const byYear = clusterBoot(rows, (r) => String(r.date).slice(0, 4), sumsFn, statFn, 1000, (seed || 7) + 1);
  const wide = (bySym.hi - bySym.lo) >= (byYear.hi - byYear.lo) ? bySym : byYear;
  return { est: bySym.est, lo: wide.lo, hi: wide.hi, ciBy: wide === bySym ? "SYMBOL" : "YEAR", symbolCi: [bySym.lo, bySym.hi], yearCi: [byYear.lo, byYear.hi], clusters: bySym.clusters };
}
const rate = (rows) => {
  const v = rows.filter((r) => r.y === 0 || r.y === 1);
  return bothBoot(v, (r) => [r.y, 1], (s) => (s[1] ? s[0] / s[1] : null), 11);
};
function rateDiff(rows, isA, isB, seed) {
  const v = rows.filter((r) => r.y === 0 || r.y === 1);
  return bothBoot(v, (r) => (isA(r) ? [r.y, 1, 0, 0] : isB(r) ? [0, 0, r.y, 1] : null), (s) => (s[1] && s[3] ? s[0] / s[1] - s[2] / s[3] : null), seed || 13);
}

// ------------------------------------------------------------ Logistische Regression
function cholSolve(A, b, p) {
  const L = new Float64Array(p * p);
  for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * p + j]; for (let k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k];
    if (i === j) L[i * p + i] = Math.sqrt(Math.max(s, 1e-12)); else L[i * p + j] = s / L[j * p + j];
  }
  const z = new Float64Array(p); for (let i = 0; i < p; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * p + k] * z[k]; z[i] = s / L[i * p + i]; }
  const x = new Float64Array(p); for (let i = p - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < p; k++) s -= L[k * p + i] * x[k]; x[i] = s / L[i * p + i]; }
  return x;
}
function fitLogit(X, y, lambda) {
  const n = X.length, p = X[0].length, beta = new Float64Array(p);
  for (let it = 0; it < 30; it++) {
    const Hm = new Float64Array(p * p), g = new Float64Array(p);
    for (let i = 0; i < n; i++) {
      const x = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += x[j] * beta[j];
      const mu = 1 / (1 + Math.exp(-eta)), w = Math.max(mu * (1 - mu), 1e-6), e = y[i] - mu;
      for (let j = 0; j < p; j++) { g[j] += x[j] * e; const xw = x[j] * w; for (let k = 0; k <= j; k++) Hm[j * p + k] += xw * x[k]; }
    }
    for (let j = 0; j < p; j++) { for (let k = 0; k < j; k++) Hm[k * p + j] = Hm[j * p + k]; if (j > 0) { Hm[j * p + j] += lambda; g[j] -= lambda * beta[j]; } }
    const d = cholSolve(Hm, g, p); let mx = 0;
    for (let j = 0; j < p; j++) { beta[j] += d[j]; mx = Math.max(mx, Math.abs(d[j])); }
    if (mx < 1e-7) break;
  }
  return beta;
}
const predict = (beta, x) => { let e = 0; for (let j = 0; j < x.length; j++) e += x[j] * beta[j]; return 1 / (1 + Math.exp(-e)); };

/** Merkmalsbeschreibung → Designmatrix (Standardisierung nur aus Trainingsdaten). */
function designer(spec, train) {
  const cols = [];
  for (const f of spec) {
    if (f.type === "cat") {
      const lv = [...new Set(train.map(f.get).map(String))].sort();
      lv.slice(1).forEach((l) => cols.push({ name: f.name + "=" + l, fn: (r) => (String(f.get(r)) === l ? 1 : 0) }));
    } else {
      const vals = train.map(f.get).filter(isNum), m = mean(vals) || 0, sd = Math.sqrt(mean(vals.map((v) => (v - m) ** 2)) || 1) || 1;
      cols.push({ name: f.name, fn: (r) => { const v = f.get(r); return isNum(v) ? (v - m) / sd : 0; } });
      if (train.some((r) => !isNum(f.get(r)))) cols.push({ name: f.name + "?missing", fn: (r) => (isNum(f.get(r)) ? 0 : 1) });
    }
  }
  return { names: ["(intercept)"].concat(cols.map((c) => c.name)), row: (r) => [1].concat(cols.map((c) => c.fn(r))) };
}
function shiftYears(iso, y) { const d = new Date(iso + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + y); return d.toISOString().slice(0, 10); }
function auc(pairs) {   // pairs: [p, y]
  const s = pairs.slice().sort((a, b) => a[0] - b[0]);
  let rankSum = 0, n1 = 0, i = 0;
  while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (s[k][1] === 1) { rankSum += avg; n1++; } i = j + 1; }
  const n0 = s.length - n1;
  return n1 && n0 ? (rankSum - n1 * (n1 + 1) / 2) / (n1 * n0) : null;
}
/**
 * Walk-forward: fuer jeden Block k ≥ 2 Training auf allen frueheren Bloecken.
 * Gibt je Modell die gepoolten Out-of-Sample-Vorhersagen zurueck.
 */
function walkForward(rows, folds, specs, lambda) {
  const ids = folds.map((f) => f[0]), oos = [];
  const coef = {};
  for (let k = 1; k < ids.length; k++) {
    /* Review-Fix: Purge — Trainingsereignisse, deren 52-Wochen-Ergebnisfenster in den Testblock reicht, entfallen. */
    const purgeBefore = shiftYears(folds[k][1], -1);
    const train = rows.filter((r) => ids.indexOf(r.fold) < k && r.date < purgeBefore), test = rows.filter((r) => r.fold === ids[k]);
    if (train.length < 500 || test.length < 100) continue;
    const preds = test.map(() => ({}));
    for (const [name, spec] of Object.entries(specs)) {
      const D = designer(spec, train), beta = fitLogit(train.map(D.row), train.map((r) => r.y), lambda);
      test.forEach((r, i) => { preds[i][name] = predict(beta, D.row(r)); });
      if (k === ids.length - 1) coef[name] = Object.fromEntries(D.names.map((nm, j) => [nm, r4(beta[j])]));
    }
    test.forEach((r, i) => oos.push({ r, p: preds[i] }));
  }
  return { oos, coefLastFold: coef };
}
function modelMetrics(oos, models) {
  const out = {};
  const ll = (p, y) => -(y * Math.log(Math.max(p, 1e-9)) + (1 - y) * Math.log(Math.max(1 - p, 1e-9)));
  for (const m of models) {
    const n = oos.length;
    out[m] = { n, logLoss: r4(mean(oos.map((o) => ll(o.p[m], o.r.y)))), brier: r4(mean(oos.map((o) => (o.p[m] - o.r.y) ** 2))), auc: r4(auc(oos.map((o) => [o.p[m], o.r.y]))) };
  }
  return out;
}
/** Differenz zweier Modelle out-of-sample, Cluster-Bootstrap (Titel und Jahr) fuer LogLoss/Brier, Titel-Bootstrap fuer AUC. */
function modelDelta(oos, a, b) {
  const ll = (p, y) => -(y * Math.log(Math.max(p, 1e-9)) + (1 - y) * Math.log(Math.max(1 - p, 1e-9)));
  const rows = oos.map((o) => ({ sym: o.r.sym, date: o.r.date, o }));
  const dLL = bothBoot(rows, (x) => [ll(x.o.p[b], x.o.r.y) - ll(x.o.p[a], x.o.r.y), 1], (s) => s[0] / s[1], 21);
  const dBr = bothBoot(rows, (x) => [(x.o.p[b] - x.o.r.y) ** 2 - (x.o.p[a] - x.o.r.y) ** 2, 1], (s) => s[0] / s[1], 22);
  /* AUC: Titel-Bootstrap (200 Ziehungen) */
  const bySym = new Map(); rows.forEach((x) => { let g = bySym.get(x.sym); if (!g) bySym.set(x.sym, g = []); g.push(x.o); });
  const G = [...bySym.values()], rand = rng(23), ds = [];
  const aucD = (arr) => (auc(arr.map((o) => [o.p[b], o.r.y])) || 0) - (auc(arr.map((o) => [o.p[a], o.r.y])) || 0);
  for (let i = 0; i < 200; i++) { const s = []; for (let j = 0; j < G.length; j++) s.push(...G[Math.floor(rand() * G.length)]); ds.push(aucD(s)); }
  return { deltaLogLoss: dLL, deltaBrier: dBr, deltaAuc: { est: r4(aucD(oos)), lo: r4(quantile(ds, 0.025)), hi: r4(quantile(ds, 0.975)), ciBy: "SYMBOL" },
           note: "Negative Delta-LogLoss/Brier und positive Delta-AUC = " + b + " besser als " + a + " (out-of-sample)." };
}
/** Ueberschuss ueber ein Basismodell (y − p_base) je Gruppe, Cluster-Bootstrap. */
function excessBy(oos, base, keyFn, minN) {
  const groups = new Map();
  oos.forEach((o) => { const k = keyFn(o.r); if (k === null || k === undefined) return; let g = groups.get(k); if (!g) groups.set(k, g = []); g.push({ sym: o.r.sym, date: o.r.date, e: o.r.y - o.p[base], y: o.r.y, p: o.p[base] }); });
  const out = {};
  for (const [k, g] of [...groups.entries()].sort()) {
    if (g.length < (minN || 200)) continue;
    const b = bothBoot(g, (x) => [x.e, 1], (s) => s[0] / s[1], 31);
    out[k] = { n: g.length, observed: r4(mean(g.map((x) => x.y))), expectedBase: r4(mean(g.map((x) => x.p))), excess: b.est, lo: b.lo, hi: b.hi, ciBy: b.ciBy };
  }
  return out;
}
function benjaminiHochberg(tab, q) {
  /* p-Wert aus der Normalnaeherung des Bootstrap-Intervalls (z = est / ((hi−lo)/3,92)). */
  const items = Object.entries(tab).map(([k, v]) => { const se = (v.hi - v.lo) / 3.92; const z = se > 0 ? Math.abs(v.excess) / se : 0; const p = 2 * (1 - normCdf(z)); return { k, p }; }).sort((a, b) => a.p - b.p);
  const m = items.length; let cut = -1;
  items.forEach((it, i) => { if (it.p <= ((i + 1) / m) * q) cut = i; });
  items.forEach((it, i) => { tab[it.k].pApprox = r4(it.p); tab[it.k].significantBH = i <= cut; });
  return tab;
}
function normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }

// ------------------------------------------------------------ Geschichtete Kontrolle
function terciles(vals) { return [quantile(vals, 1 / 3), quantile(vals, 2 / 3)]; }
function stratified(rows, isTreat, keyFn, seed) {
  /* Gewichtete Differenz der Erfolgsquote "Label" − "gleiche Struktur ohne Label" innerhalb exakter Strata,
     gewichtet nach Anzahl der Label-Faelle; Cluster-Bootstrap auf Titelebene ueber Summen je Stratum. */
  const v = rows.filter((r) => r.y === 0 || r.y === 1);
  const strata = new Map(); let si = 0;
  v.forEach((r) => { const k = keyFn(r); if (!strata.has(k)) strata.set(k, si++); });
  const S = si;
  const sums = (r) => { const a = new Float64Array(4 * S), s = strata.get(keyFn(r)) * 4; if (isTreat(r)) { a[s] = r.y; a[s + 1] = 1; } else { a[s + 2] = r.y; a[s + 3] = 1; } return a; };
  const stat = (t) => { let num = 0, w = 0; for (let s = 0; s < S; s++) { const nt = t[4 * s + 1], nc = t[4 * s + 3]; if (nt > 0 && nc > 0) { num += nt * (t[4 * s] / nt - t[4 * s + 2] / nc); w += nt; } } return w ? num / w : null; };
  const bySym = clusterBoot(v, (r) => r.sym, sums, stat, 400, seed || 41);
  const byYear = clusterBoot(v, (r) => String(r.date).slice(0, 4), sums, stat, 400, (seed || 41) + 1);
  const wide = (bySym.hi - bySym.lo) >= (byYear.hi - byYear.lo) ? bySym : byYear;
  /* Abdeckung: Anteil der Label-Faelle in Strata mit Kontrollen */
  let covered = 0, treated = 0; const tmp = new Map();
  v.forEach((r) => { const k = keyFn(r); let g = tmp.get(k); if (!g) tmp.set(k, g = [0, 0]); if (isTreat(r)) g[0]++; else g[1]++; });
  for (const [, g] of tmp) { treated += g[0]; if (g[1] > 0) covered += g[0]; }
  return { diff: bySym.est, lo: wide.lo, hi: wide.hi, ciBy: wide === bySym ? "SYMBOL" : "YEAR", strata: S, treated, treatedMatched: covered };
}

// ------------------------------------------------------------ Hauptanalyse
function analyze(R, meta) {
  const ev = R.events;
  ev.forEach((r) => { r.symbol = r.symbol || r.sym; r.sym = r.issuer || r.sym; });   // Cluster = Emittent (Review-Fix 6)
  const done = ev.filter((r) => r.y === 0 || r.y === 1);
  const legT = terciles(ev.map((r) => r.legAtr)), volT = [1 / 3, 2 / 3];
  const terc = (v, t) => (!isNum(v) ? "NA" : v < t[0] ? "T1" : v < t[1] ? "T2" : "T3");
  const geom = (r) => r.dn / Math.max(1e-9, r.up + r.dn);                      // Martingal-Erwartung b/(a+b)
  ev.forEach((r) => { if (isNum(r.volP) && r.volP > 1) r.volP = r.volP / 100; r.legT = terc(r.legAtr, legT); r.volT = terc(r.volP, volT); r.geom = r4(geom(r)); r.depthB = r.r < 0.5 ? "38-50" : r.r < 0.618 ? "50-62" : "62-89"; r.geomB = r.geom < 0.4 ? "G1" : r.geom < 0.5 ? "G2" : r.geom < 0.6 ? "G3" : "G4"; });
  const isCont = (r) => r.lab === "CONT", notCont = (r) => r.lab !== "CONT";

  // ---------------- Trichter / Abdeckung
  const st = R.stats;
  const sum = (f) => st.reduce((a, s) => a + (f(s) || 0), 0);
  const funnel = {
    seriesRequested: meta.files, seriesTooShort: R.skipped, seriesAnalysed: st.length, errors: R.errors.length,
    barsAnalysed: sum((s) => s.bars), barsWithCount: sum((s) => s.available), barsAbstain: sum((s) => s.abstain),
    statusShare: Object.fromEntries(["OK", "AMBIGUOUS", "EARLY", "UNAVAILABLE"].map((k) => [k, r4(sum((s) => s.statusCount[k]) / Math.max(1, sum((s) => s.bars)))])),
    genericEvents: ev.length, eventsCont: ev.filter(isCont).length, eventsRev: ev.filter((r) => r.lab === "REV").length, eventsNone: ev.filter((r) => r.lab === "NONE").length,
    resolved: done.length, timeouts: ev.filter((r) => r.y === null).length,
    symbolsWithEvents: new Set(ev.map((r) => r.sym)).size
  };

  // ---------------- Stabilitaet
  const T = {}; ["SAME", "PROGRESS", "RELABEL", "RESET", "LOST", "FOUND"].forEach((k) => { T[k] = sum((s) => s.trans[k]); });
  const runs = st.flatMap((s) => s.runLengths);
  const stability = {
    transitions: T, relabelRate: r4(T.RELABEL / Math.max(1, T.SAME + T.PROGRESS + T.RELABEL + T.RESET)),
    resetRate: r4(T.RESET / Math.max(1, T.SAME + T.PROGRESS + T.RELABEL + T.RESET)),
    medianCountLifetimeBars: median(runs), p25Lifetime: quantile(runs, 0.25), p75Lifetime: quantile(runs, 0.75),
    scaleSwitchesPer100Bars: r4(100 * sum((s) => s.scaleSwitches) / Math.max(1, sum((s) => s.bars))),
    countQuality: { median: r4(median(st.map((s) => s.cqMean))), p25: r4(quantile(st.map((s) => s.cqMean), 0.25)), p75: r4(quantile(st.map((s) => s.cqMean), 0.75)) },
    note: "RELABEL = andere Lesart, obwohl die vorige weder abgeschlossen noch an ihrer harten Grenze gebrochen war. Je Bar (Woche) ausgewertet."
  };

  // ---------------- Erkennungsverzug
  const L = R.latency;
  const latBy = (f) => { const a = L.filter(f); return { n: a.length, medianBarsEngine: median(a.map((x) => x.engine)), medianBarsEarliest: median(a.map((x) => x.earliest)),
    medianAvoidableBars: median(a.map((x) => (isNum(x.earliest) ? x.engine - x.earliest : null))), medianProgressAtEngine: r4(median(a.map((x) => x.progress))),
    shareBeyondTargetAtEngine: r4(a.filter((x) => x.beyondAtEngine).length / Math.max(1, a.length)), shareEventBeforeCounterEnd: r4(a.filter((x) => x.eventBeforeEnd).length / Math.max(1, a.length)) }; };
  const latency = { all: latBy(() => true), cont: latBy((x) => x.lab === "CONT"), rev: latBy((x) => x.lab === "REV"),
    note: "engine = Bars vom Ende der Gegenbewegung bis zur Bestaetigung auf der Analyseskala; earliest = Bestaetigung desselben Extrems auf der feinsten Skala; progress = Anteil des Weges zurueck zum Leg-Ende, der bei Engine-Bestaetigung schon zurueckgelegt war." };
  /* Entwickelnd (Ereignis) vs. bestaetigt (Einstieg bei Engine-Bestaetigung) — jeweils gegen die eigene Martingal-Erwartung */
  const confEntries = ev.filter((r) => r.lat && (r.lat.confirmedEntryRes === 0 || r.lat.confirmedEntryRes === 1));
  const devVsConf = {};
  for (const [nm, f] of [["CONT", isCont], ["NOT_CONT", notCont]]) {
    const dv = done.filter(f), cf = confEntries.filter(f);
    /* Vergleich jeweils gegen Zufallszeitpunkte mit identischen %-Abstaenden (gleiche Timeout-Behandlung). */
    const dvE = dv.filter((r) => r.bA && r.bA.length), cfE = cf.filter((r) => r.lat.cbA && r.lat.cbA.length);
    devVsConf[nm] = {
      developing: { n: dv.length, rate: r4(mean(dv.map((r) => r.y))), randomSameGeometry: r4(mean(dvE.flatMap((r) => r.bA))),
                    excessOverRandom: bothBoot(dvE, (r) => [r.y - mean(r.bA), 1], (s) => s[0] / s[1], 91) },
      confirmed: { n: cf.length, rate: r4(mean(cf.map((r) => r.lat.confirmedEntryRes))), randomSameGeometry: r4(mean(cfE.flatMap((r) => r.lat.cbA))),
                   excessOverRandom: bothBoot(cfE, (r) => [r.lat.confirmedEntryRes - mean(r.lat.cbA), 1], (s) => s[0] / s[1], 92),
                   excludedAlreadyBeyond: ev.filter(f).filter((r) => r.lat && r.lat.beyondAtEngine).length }
    };
  }

  // ---------------- Benchmark-Leiter (Elliott CONT)
  const cont = done.filter(isCont);
  const bmean = (arr, key) => mean(arr.flatMap((r) => r[key]));
  const ladder = {
    contRate: rate(cont),
    contRateTimeoutAsFailure: r4(mean(ev.filter((r) => r.lab === "CONT" && r.y !== undefined).map((r) => (r.y === 1 ? 1 : 0)))),
    genericRateTimeoutAsFailure: r4(mean(ev.filter((r) => r.y !== undefined).map((r) => (r.y === 1 ? 1 : 0)))),
    randomTimestampExcessCont: bothBoot(cont.filter((r) => r.bA && r.bA.length), (r) => [r.y - mean(r.bA), 1], (s) => s[0] / s[1], 93),
    A_randomTimestamp: r4(bmean(cont, "bA")), AT_randomTimestampSameTrend: r4(bmean(cont, "bAT")), martingale: r4(mean(cont.map((r) => r.geom))),
    B_allGenericSwings: rate(done), B_genericWithoutContLabel: rate(done.filter(notCont)),
    C_trendPullbackGeneric: rate(done.filter((r) => r.trend === 1)), C_contInTrend: rate(cont.filter((r) => r.trend === 1)),
    C_diffInTrend: rateDiff(done.filter((r) => r.trend === 1), isCont, notCont, 51),
    D_matchedControl: stratified(done, isCont, (r) => [r.d, r.trend, r.mom, r.volT, r.regime, r.fold, r.legT, r.depthB, r.geomB].join("|"), 61),
    D_matchedContVsRev: stratified(done.filter((r) => r.lab !== "NONE"), isCont, (r) => [r.d, r.trend, r.mom, r.volT, r.regime, r.fold, r.legT, r.depthB, r.geomB].join("|"), 62),
    rawDiffContVsNotCont: rateDiff(done, isCont, notCont, 52), rawDiffContVsRev: rateDiff(done, isCont, (r) => r.lab === "REV", 53)
  };

  // ---------------- Modelle (walk-forward)
  const base = [
    { name: "dir", type: "cat", get: (r) => r.d }, { name: "trend", type: "cat", get: (r) => r.trend }, { name: "mom", type: "cat", get: (r) => r.mom },
    { name: "momZ", type: "num", get: (r) => (isNum(r.momZ) ? Math.max(-4, Math.min(4, r.momZ)) : null) }, { name: "volP", type: "num", get: (r) => r.volP },
    { name: "regime", type: "cat", get: (r) => r.regime }, { name: "depth", type: "num", get: (r) => r.r }, { name: "logLegAtr", type: "num", get: (r) => Math.log(Math.max(0.1, r.legAtr)) },
    { name: "logLegBars", type: "num", get: (r) => Math.log(Math.max(1, r.legBars)) },
    { name: "geometry", type: "num", get: (r) => r.geom }
    /* Review-Fix 4/5: kein Kursniveau (splitbereinigt = Zukunftswissen), keine heutige Indexmitgliedschaft, kein heutiger Sektor */
  ];
  const fib = [{ name: "fibConf", type: "num", get: (r) => Math.min(4, r.fibConf) }, { name: "support", type: "cat", get: (r) => r.support }];
  const ell = [{ name: "elliottLabel", type: "cat", get: (r) => r.lab }, { name: "countQuality", type: "num", get: (r) => (r.lab === "CONT" ? r.cq : null) },
               { name: "higherDegree", type: "num", get: (r) => (r.lab !== "NONE" ? r.hd : null) }, { name: "clarity", type: "num", get: (r) => (r.lab !== "NONE" ? Math.min(0.3, r.clarity) : null) }];
  const specs = { BASE: base, BASE_FIB: base.concat(fib), BASE_ELLIOTT: base.concat(ell), FULL: base.concat(fib, ell), GEOMETRY_ONLY: [base[0], base[9]] };
  const WF = walkForward(done, meta.folds, specs, 1.0);
  const models = {
    oosN: WF.oos.length, metrics: modelMetrics(WF.oos, Object.keys(specs)),
    elliottIncrement: modelDelta(WF.oos, "BASE", "BASE_ELLIOTT"), fibIncrement: modelDelta(WF.oos, "BASE", "BASE_FIB"),
    elliottOverBaseFib: modelDelta(WF.oos, "BASE_FIB", "FULL"), baseOverGeometry: modelDelta(WF.oos, "GEOMETRY_ONLY", "BASE"),
    coefficientsLastFold: WF.coefLastFold,
    note: "Walk-forward: Block k wird nur mit Bloecken < k trainiert (" + meta.folds.map((f) => f[0]).join(", ") + "). Gepoolte Out-of-Sample-Vorhersagen."
  };

  // ---------------- Ueberschuss ueber das Basismodell (Elliott-Label)
  const excess = {
    byLabel: excessBy(WF.oos, "BASE", (r) => r.lab, 100),
    contByRole: excessBy(WF.oos.filter((o) => o.r.lab === "CONT"), "BASE", (r) => (r.role || "").split(":").slice(0, 2).join(":"), 100),
    revByRole: excessBy(WF.oos.filter((o) => o.r.lab === "REV"), "BASE", (r) => (r.role || "").split(":").slice(0, 2).join(":"), 100),
    contByScale: excessBy(WF.oos.filter((o) => o.r.lab === "CONT"), "BASE", (r) => r.scale, 100),
    contByCountQuality: excessBy(WF.oos.filter((o) => o.r.lab === "CONT"), "BASE", (r) => r.cqLevel, 100),
    contByApplicability: excessBy(WF.oos.filter((o) => o.r.lab === "CONT"), "BASE", (r) => r.applLevel, 100),
    contByHigherDegree: excessBy(WF.oos.filter((o) => o.r.lab === "CONT"), "BASE", (r) => (r.hd >= 0.8 ? "CONSISTENT" : r.hd >= 0.5 ? "NEUTRAL" : "CONFLICT"), 100),
    contByStability: excessBy(WF.oos.filter((o) => o.r.lab === "CONT"), "BASE", (r) => (r.stableBars === 0 ? "0" : r.stableBars < 4 ? "1-3" : r.stableBars < 13 ? "4-12" : "13+"), 100),
    fibConf: excessBy(WF.oos, "BASE", (r) => (r.fibConf === 0 ? "0" : r.fibConf === 1 ? "1" : "2+"), 200),
    support: excessBy(WF.oos, "BASE", (r) => r.support, 200)
  };

  // ---------------- Abstention: nur die besten x % nach Count Quality (Schwelle aus frueheren Bloecken)
  const ids = meta.folds.map((f) => f[0]), abst = {};
  for (const top of [1.0, 0.3, 0.2, 0.1]) {
    const sel = [];
    for (let k = 1; k < ids.length; k++) {
      const thr = top >= 1 ? -Infinity : quantile(done.filter((r) => isCont(r) && ids.indexOf(r.fold) < k).map((r) => r.cq), 1 - top);
      WF.oos.forEach((o) => { if (o.r.fold === ids[k] && isCont(o.r) && isNum(o.r.cq) && o.r.cq >= thr) sel.push({ sym: o.r.sym, date: o.r.date, e: o.r.y - o.p.BASE, y: o.r.y }); });
    }
    const b = bothBoot(sel, (x) => [x.e, 1], (s) => s[0] / s[1], 71);
    abst["top" + Math.round(top * 100)] = { n: sel.length, rate: r4(mean(sel.map((x) => x.y))), excessOverBase: b.est, lo: b.lo, hi: b.hi };
  }

  // ---------------- Segmente (explorativ, BH-korrigiert)
  const contO = WF.oos.filter((o) => o.r.lab === "CONT");
  const seg = {
    index: excessBy(contO, "BASE", (r) => r.index, 150), exchange: excessBy(contO, "BASE", (r) => r.exchange, 150),
    volatility: excessBy(contO, "BASE", (r) => r.volT, 150), regime: excessBy(contO, "BASE", (r) => r.regime, 150),
    trend: excessBy(contO, "BASE", (r) => r.trend, 150), sector: excessBy(contO, "BASE", (r) => r.sector || "NA", 150),
    listingAge: excessBy(contO, "BASE", (r) => (r.ageY < 6 ? "<6J" : r.ageY < 12 ? "6-12J" : "12J+"), 150),
    direction: excessBy(contO, "BASE", (r) => (r.d > 0 ? "BULLISH" : "BEARISH"), 150), fold: excessBy(contO, "BASE", (r) => r.fold, 150)
  };
  for (const k of Object.keys(seg)) benjaminiHochberg(seg[k], 0.1);

  // ---------------- Zweites Ergebnis: Extension 1,618
  const d2 = ev.filter((r) => r.y2 === 0 || r.y2 === 1).map((r) => Object.assign({}, r, { y: r.y2 }));
  const extension = { contRate: rate(d2.filter(isCont)), matched: stratified(d2, isCont, (r) => [r.d, r.trend, r.mom, r.volT, r.regime, r.fold, r.legT, r.depthB].join("|"), 81) };

  // ---------------- Vorab registrierte Hypothesen (docs/technical-intelligence/PREREGISTRATION.md)
  const hyp = hypotheses(done, WF, ev, ids);

  return {
    schemaVersion: "vu-elliott-validation-1.0.0", generatedAt: new Date().toISOString(), meta: Object.assign({}, meta, { runtimeSec: R.runtimeSec }),
    definitions: {
      event: "Erste Bar nach Bestaetigung des Legs L=(a→b) auf der Analyseskala der Engine, an der der Schluss L um 38,2–88,6 % zurueckgelaufen ist.",
      success: "Kurs ueberschreitet b vor einem Schluss jenseits a, Horizont " + meta.horizon + " Bars (gleiche Bar = Misserfolg).",
      labels: "CONT: Engine erwartet nach der laufenden Gegenbewegung Fortsetzung in Richtung L (L = W1/W3/A/W…); REV: L ist letzte Welle bzw. Gegenrichtung erwartet; NONE: L nicht unmittelbar gezaehlt.",
      ci: "95 %-Intervalle: Cluster-Bootstrap nach Titel und nach Kalenderjahr, das breitere wird berichtet."
    },
    preregisteredHypotheses: hyp, funnel, stability, latency, developingVsConfirmed: devVsConf, ladder, models, excess, abstention: abst, segments: seg, extension,
    errorsSample: R.errors.slice(0, 10)
  };
}


/** Kontrast zweier Gruppen im Ueberschuss ueber das Basismodell (Cluster-Bootstrap Titel/Jahr). */
function excessContrast(oos, isA, isB, seed) {
  const rows = oos.filter((o) => isA(o.r) || isB(o.r)).map((o) => ({ sym: o.r.sym, date: o.r.date, a: isA(o.r), e: o.r.y - o.p.BASE }));
  return bothBoot(rows, (x) => (x.a ? [x.e, 1, 0, 0] : [0, 0, x.e, 1]), (s) => (s[1] && s[3] ? s[0] / s[1] - s[2] / s[3] : null), seed);
}
/**
 * H1–H7 exakt wie in PREREGISTRATION.md festgelegt. Ergebnis je Hypothese: Schaetzer, 95 %-KI (breiteres aus
 * Titel- und Jahres-Cluster), Rohentscheidung (KI schliesst 0 in erwarteter Richtung aus) und Holm-Entscheidung.
 */
function hypotheses(done, WF, ev, ids) {
  const isCont = (r) => r.lab === "CONT";
  const H = {};
  const inc = modelDelta(WF.oos, "BASE", "BASE_ELLIOTT").deltaLogLoss;
  H.H1 = { name: "Elliott-Merkmale verbessern das Nicht-Elliott-Modell out-of-sample (Delta-LogLoss < 0)", est: inc.est, lo: inc.lo, hi: inc.hi, pass: isNum(inc.hi) && inc.hi < 0 };
  /* Review-Fix: grobe, vorab festgelegte Strata (Richtung, Trendkontext, Volatilitaetsdrittel, Zeitblock, Geometrie-Klasse); Abdeckung >= 80 % noetig */
  const m = stratified(done, isCont, (r) => [r.d, r.trend, r.volT, r.fold, r.geomB].join("|"), 101);
  const cov = m.treated ? m.treatedMatched / m.treated : 0;
  H.H2 = { name: "Gleicher Ruecklauf: Fortsetzungs-Lesart (CONT) erreicht das Leg-Ende haeufiger als ohne diese Lesart (REV oder keine Zaehlung), geschichtet", est: m.diff, lo: m.lo, hi: m.hi, coverage: r4(cov), pass: isNum(m.lo) && m.lo > 0 && cov >= 0.8 };
  /* H3: Top 20 % Count Quality (Schwelle aus frueheren Bloecken) — Ueberschuss ueber BASE > 0 */
  const sel = [];
  for (let k = 1; k < ids.length; k++) {
    const thr = quantile(done.filter((r) => isCont(r) && ids.indexOf(r.fold) < k).map((r) => r.cq), 0.8);
    WF.oos.forEach((o) => { if (o.r.fold === ids[k] && isCont(o.r) && isNum(o.r.cq) && isNum(thr) && o.r.cq >= thr) sel.push({ sym: o.r.sym, date: o.r.date, e: o.r.y - o.p.BASE }); });
  }
  const h3 = bothBoot(sel, (x) => [x.e, 1], (s) => s[0] / s[1], 103);
  const nCont = WF.oos.filter((o) => isCont(o.r) && ids.indexOf(o.r.fold) >= 1).length;
  H.H3 = { name: "Beste 20 % nach Count Quality uebertreffen das Basismodell", n: sel.length, shareSelected: r4(sel.length / Math.max(1, nCont)), est: h3.est, lo: h3.lo, hi: h3.hi, pass: isNum(h3.lo) && h3.lo > 0 };
  const h4 = excessContrast(WF.oos, (r) => isCont(r) && r.hd >= 0.8, (r) => isCont(r) && r.hd < 0.5, 104);
  H.H4 = { name: "Hoeherer Grad konsistent > im Konflikt (Ueberschuss ueber Basismodell)", est: h4.est, lo: h4.lo, hi: h4.hi, pass: isNum(h4.lo) && h4.lo > 0 };
  const h5 = excessContrast(WF.oos, (r) => isCont(r) && r.volT === "T3", (r) => isCont(r) && r.volT === "T1", 105);
  H.H5 = { name: "Elliott-Fortsetzung bei hoher Volatilitaet (oberes Drittel relativ zur eigenen 52-Wochen-Historie) besser als bei niedriger (unteres Drittel)", est: h5.est, lo: h5.lo, hi: h5.hi, pass: isNum(h5.lo) && h5.lo > 0 };
  /* H6: Entwicklungs-Einstieg schlaegt den Einstieg erst bei Engine-Bestaetigung (je gegen Zufall gleicher Geometrie) */
  const rowsD = done.filter((r) => isCont(r) && r.bA && r.bA.length && r.lat && r.lat.cbA && r.lat.cbA.length && (r.lat.confirmedEntryRes === 0 || r.lat.confirmedEntryRes === 1));
  const h6 = bothBoot(rowsD, (r) => [(r.y - mean(r.bA)) - (r.lat.confirmedEntryRes - mean(r.lat.cbA)), 1], (s) => s[0] / s[1], 106);
  H.H6 = { name: "Einstieg in der laufenden Gegenbewegung schlaegt den Einstieg nach Engine-Bestaetigung (je gegen Zufall)", n: rowsD.length, est: h6.est, lo: h6.lo, hi: h6.hi, pass: isNum(h6.lo) && h6.lo > 0 };
  const h7 = excessContrast(WF.oos, (r) => r.fibConf >= 2, (r) => r.fibConf === 0, 107);
  H.H7 = { name: "Fibonacci-Konfluenz (>= 2 Niveaus) am Einstieg besser als keine (Ueberschuss ueber Basismodell)", est: h7.est, lo: h7.lo, hi: h7.hi, pass: isNum(h7.lo) && h7.lo > 0 };
  /* Holm: p aus Normalnaeherung des KI (einseitig in erwarteter Richtung) */
  const keys = Object.keys(H), ps = keys.map((k) => { const h = H[k], se = (h.hi - h.lo) / 3.92, z = se > 0 ? (k === "H1" ? -h.est : h.est) / se : 0; return { k, p: 1 - normCdf(z) }; }).sort((a, b) => a.p - b.p);
  let stop = false;
  ps.forEach((x, i) => { const thr = 0.05 / (ps.length - i); H[x.k].pOneSided = r4(x.p); H[x.k].passHolm = !stop && x.p <= thr; if (H[x.k].passHolm === false) stop = true; });
  /* Review-Fix: "bestanden" verlangt KI-Kriterium UND Holm */
  keys.forEach((k) => { H[k].confirmed = !!(H[k].pass && H[k].passHolm); });
  return H;
}

// ------------------------------------------------------------ Zweiweg-Cluster-Bootstrap (Evidenzstudie ti-evidence, 03.10.2026)
/**
 * Zeitblock eines ISO-Datums. "QUARTER" → "2019-Q1", "MONTH" → "2019-01", "YEAR" → "2019", "HALF" → "2019-H1".
 */
function timeBlockOf(date, unit) {
  const d = String(date), y = d.slice(0, 4), m = +d.slice(5, 7) || 1;
  if (unit === "MONTH") return d.slice(0, 7);
  if (unit === "YEAR") return y;
  if (unit === "HALF") return y + "-H" + (m <= 6 ? 1 : 2);
  return y + "-Q" + (((m - 1) / 3 | 0) + 1);
}
/** Deterministischer 32-bit-Seed aus einem Text (FNV-1a). */
function seedOf(text) { let h = 0x811c9dc5; const s = String(text); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function sdOf(a) { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((x, v) => x + (v - m) * (v - m), 0) / (a.length - 1)) : null; }

/**
 * Zweiweg-Cluster-Bootstrap fuer Statistiken aus additiven Summen.
 * Vier Ziehungsschemata mit je B Ziehungen:
 *   SYMBOL   Titel mit Zuruecklegen ziehen (Zeitbloecke fest)
 *   TIME     Zeitbloecke mit Zuruecklegen ziehen (Titel fest) — faengt die
 *            Querschnittsabhaengigkeit (gleiche Marktphase ueber alle Titel)
 *   CELL     Zellen (Titel × Zeitblock) ziehen — nur Hilfsgroesse fuer TWO_WAY
 *   PIGEONHOLE  Titel UND Zeitbloecke unabhaengig ziehen, Zelle mit dem Produkt
 *            der Ziehungshaeufigkeiten gewichtet (Owen 2007; Menzel 2021).
 *            Zaehlt den Zellen-Rauschanteil mehrfach → konservative Sensitivitaet.
 * TWO_WAY (massgebliche Zweiweg-Schaetzung) nach Cameron, Gelbach & Miller (2011):
 *   se² = se²_SYMBOL + se²_TIME − se²_CELL (bei negativem Ergebnis: max der
 *   Einweg-Varianzen), Intervall est ± 1,96·se.
 * Massgeblich ist je Statistik das BREITESTE der Intervalle SYMBOL, TIME, TWO_WAY.
 * p-Wert (zweiseitig, H0: Statistik = 0 bzw. = nullValue) aus der Normal-
 * naeherung mit der Standardabweichung des massgeblichen Schemas.
 *
 * @param rows    Ereignisse
 * @param symFn   Ereignis → Titel-Schluessel
 * @param timeFn  Ereignis → Zeitblock-Schluessel
 * @param sumsFn  Ereignis → Array additiver Beitraege (gleiche Laenge) oder null
 * @param stats   { name: (summenvektor) → Zahl|null }
 * @param opts    { B = 1000, seed, nullValue: { name: Wert }, minClusters = 10 }
 * Ein Schema zaehlt nur, wenn es mindestens minClusters Cluster ziehen kann (TWO_WAY: beide Dimensionen);
 * ist keines gueltig, bleiben Intervall und p-Wert null (zu wenige unabhaengige Einheiten fuer eine Aussage).
 */
function twoWayBoot(rows, symFn, timeFn, sumsFn, stats, opts) {
  opts = opts || {};
  const B = opts.B || 1000, seed = opts.seed === undefined ? 7 : opts.seed, nullValue = opts.nullValue || {}, minCl = opts.minClusters === undefined ? 10 : opts.minClusters;
  const symIx = new Map(), timeIx = new Map(), cellIx = new Map(), cellSym = [], cellTime = [], cellSums = [];
  let dim = 0;
  for (const r of rows) {
    const v = sumsFn(r); if (!v) continue;
    dim = v.length;
    const sk = symFn(r), tk = timeFn(r);
    let si = symIx.get(sk); if (si === undefined) { si = symIx.size; symIx.set(sk, si); }
    let ti = timeIx.get(tk); if (ti === undefined) { ti = timeIx.size; timeIx.set(tk, ti); }
    const ck = si * 1048576 + ti;
    let ci = cellIx.get(ck);
    if (ci === undefined) { ci = cellSym.length; cellIx.set(ck, ci); cellSym.push(si); cellTime.push(ti); cellSums.push(new Float64Array(v.length)); }
    const g = cellSums[ci]; for (let i = 0; i < v.length; i++) g[i] += v[i];
  }
  const names = Object.keys(stats), out = {};
  if (!dim) { names.forEach((k) => { out[k] = { est: null, lo: null, hi: null, se: null, p: null, by: null }; }); return { stats: out, symbols: 0, timeBlocks: 0, cells: 0, B }; }
  const C = cellSym.length, S = symIx.size, T = timeIx.size;
  const flat = new Float64Array(C * dim), cs = Int32Array.from(cellSym), ct = Int32Array.from(cellTime);
  const tot = new Float64Array(dim);
  for (let c = 0; c < C; c++) for (let i = 0; i < dim; i++) { flat[c * dim + i] = cellSums[c][i]; tot[i] += cellSums[c][i]; }
  const est = {}; names.forEach((k) => { est[k] = stats[k](tot); });
  const schemes = ["SYMBOL", "TIME", "CELL", "PIGEONHOLE"], reps = {};
  const wc = new Float64Array(C);
  schemes.forEach((sc, q) => {
    const rand = rng((seed + 7919 * (q + 1)) >>> 0), ws = new Float64Array(S), wt = new Float64Array(T), acc = new Float64Array(dim);
    const vals = {}; names.forEach((k) => { vals[k] = []; });
    for (let b = 0; b < B; b++) {
      acc.fill(0);
      if (sc === "CELL") {
        wc.fill(0); for (let j = 0; j < C; j++) wc[Math.floor(rand() * C)] += 1;
        for (let c = 0; c < C; c++) { const w = wc[c]; if (w === 0) continue; const o = c * dim; for (let i = 0; i < dim; i++) acc[i] += w * flat[o + i]; }
      } else {
        if (sc === "TIME") ws.fill(1); else { ws.fill(0); for (let j = 0; j < S; j++) ws[Math.floor(rand() * S)] += 1; }
        if (sc === "SYMBOL") wt.fill(1); else { wt.fill(0); for (let j = 0; j < T; j++) wt[Math.floor(rand() * T)] += 1; }
        for (let c = 0; c < C; c++) {
          const w = ws[cs[c]] * wt[ct[c]]; if (w === 0) continue;
          const o = c * dim; for (let i = 0; i < dim; i++) acc[i] += w * flat[o + i];
        }
      }
      names.forEach((k) => { const v = stats[k](acc); if (isNum(v)) vals[k].push(v); });
    }
    reps[sc] = vals;
  });
  names.forEach((k) => {
    const per = {}, e = est[k];
    schemes.forEach((sc) => { const v = reps[sc][k]; per[sc] = { lo: quantile(v, 0.025), hi: quantile(v, 0.975), se: sdOf(v), valid: v.length }; });
    const sS = per.SYMBOL.se, sT = per.TIME.se, sC = per.CELL.se;
    let seTw = null;
    if (isNum(sS) && isNum(sT) && isNum(sC)) { const v = sS * sS + sT * sT - sC * sC; seTw = Math.sqrt(Math.max(v, sS * sS, sT * sT)); }
    per.TWO_WAY = { lo: isNum(e) && isNum(seTw) ? e - 1.96 * seTw : null, hi: isNum(e) && isNum(seTw) ? e + 1.96 * seTw : null, se: seTw };
    const usable = { SYMBOL: S >= minCl, TIME: T >= minCl, TWO_WAY: S >= minCl && T >= minCl };
    let by = null;
    ["SYMBOL", "TIME", "TWO_WAY"].forEach((sc) => { if (usable[sc] && isNum(per[sc].se) && per[sc].se > 1e-12 && isNum(per[sc].lo) && isNum(per[sc].hi) && (!by || per[sc].hi - per[sc].lo > per[by].hi - per[by].lo)) by = sc; });
    const nv = isNum(nullValue[k]) ? nullValue[k] : 0, se = by ? per[by].se : null;
    const p = isNum(e) && isNum(se) && se > 0 ? 2 * (1 - normCdf(Math.abs(e - nv) / se)) : null;
    const pair = (x) => [r4(x.lo), r4(x.hi)];
    out[k] = { est: r4(e), lo: by ? r4(per[by].lo) : null, hi: by ? r4(per[by].hi) : null, se: r4(se), p: isNum(p) ? Math.round(p * 1e6) / 1e6 : null, by, insufficientClusters: !by,
               symbol: pair(per.SYMBOL), time: pair(per.TIME), twoWay: pair(per.TWO_WAY), iidCell: pair(per.CELL), pigeonhole: pair(per.PIGEONHOLE) };
  });
  return { stats: out, symbols: S, timeBlocks: T, cells: C, B };
}

/**
 * Benjamini-Hochberg-adjustierte q-Werte (Step-up, monoton) fuer eine Liste von p-Werten.
 * null-Eintraege bleiben null und zaehlen nicht zur Familie.
 */
function bhAdjust(ps) {
  const idx = ps.map((p, i) => [p, i]).filter((x) => isNum(x[0])).sort((a, b) => a[0] - b[0]);
  const m = idx.length, q = ps.map(() => null);
  let run = 1;
  for (let j = m - 1; j >= 0; j--) { run = Math.min(run, idx[j][0] * m / (j + 1)); q[idx[j][1]] = Math.round(Math.min(1, run) * 1e6) / 1e6; }
  return q;
}

module.exports = { hypotheses, analyze, mean, median, quantile, clusterBoot, bothBoot, fitLogit, predict, designer, auc, walkForward, modelMetrics, stratified, benjaminiHochberg, rng,
                   timeBlockOf, seedOf, twoWayBoot, bhAdjust };
