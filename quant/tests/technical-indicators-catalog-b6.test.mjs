/* Referenztests fuer die Katalogerweiterung technical-indicators-1.2.0 (Backlog B6, docs/technical/BACKEND_AUDIT.md):
   Pivot-Punkte, ROC 63/126/252, TRIX, Ultimate Oscillator, CMO, KAMA, Hull MA, Chandelier Exit,
   Regressionskanal, Inside Bar, NR7, Heikin-Ashi.

   Je Indikator vier Pruefungen:
     (a) naive, unabhaengig geschriebene Referenz (Schleifen/Slices direkt nach Definition) gegen die Engine
         auf dem realen AAPL-Ausschnitt (fixtures/technical-reference-aapl.json), Toleranz 1e-9 relativ;
     (b) ein kleines, von Hand gerechnetes Beispiel mit festen Zahlen;
     (c) Kausalitaet: Wert an t auf der vollen Reihe = Wert an t auf der bei t abgeschnittenen Reihe
         = Wert an t, wenn alle Bars nach t vergiftet sind (mehrere t);
     (d) Zahl der NaN in der Aufwaermphase = dokumentierte Aufwaermperiode. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const I = require("../engines/technical/indicators.js");
const ref = JSON.parse(readFileSync(new URL("./fixtures/technical-reference-aapl.json", import.meta.url), "utf8"));
const S = { open: ref.open, high: ref.high, low: ref.low, close: ref.close, volume: ref.volume };
const N = S.close.length;
const { open: O, high: H, low: L, close: C } = S;

const fin = Number.isFinite;
function near(a, b, eps = 1e-9) { if (!fin(a) && !fin(b)) return true; return fin(a) && fin(b) && Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)); }
function same(actual, expected, label, eps) {
  assert.equal(actual.length, expected.length, label + ": Laenge");
  for (let i = 0; i < expected.length; i++) assert.ok(near(actual[i], expected[i], eps), `${label}[${i}]: ${actual[i]} != ${expected[i]}`);
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const nan = () => new Array(N).fill(NaN);
const NEW_IDS = ["pivots", "kama", "hma", "linreg", "heikinAshi", "roc63", "roc126", "roc252", "trix", "ultimateOscillator", "cmo", "chandelier", "insideBar", "nr7"];

/* ---------- naive Bausteine ---------- */
/* EMA nach Definition: Start = Mittel der ersten n gueltigen Werte ab dem ersten gueltigen Index (Reihe ohne innere Luecken). */
function nEma(x, n) {
  const out = x.map(() => NaN), s = x.findIndex(fin), k = 2 / (n + 1);
  if (s < 0) return out;
  out[s + n - 1] = sum(x.slice(s, s + n)) / n;
  for (let i = s + n; i < x.length; i++) out[i] = out[i - 1] + k * (x[i] - out[i - 1]);
  return out;
}
function nWma(x, n) {
  return x.map((_, i) => {
    if (i < n - 1) return NaN;
    const w = x.slice(i - n + 1, i + 1);
    if (!w.every(fin)) return NaN;
    return sum(w.map((v, j) => v * (j + 1))) / (n * (n + 1) / 2);
  });
}
function nAtr(h, l, c, n) {
  const tr = c.map((_, i) => i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  const out = tr.map(() => NaN);
  out[n - 1] = sum(tr.slice(0, n)) / n;
  for (let i = n; i < tr.length; i++) out[i] = (out[i - 1] * (n - 1) + tr[i]) / n;
  return out;
}

/* ---------- naive Referenzen je Indikator ---------- */
const REF = {
  pivots() {
    const o = { pivot: nan(), r1: nan(), r2: nan(), s1: nan(), s2: nan() };
    for (let t = 1; t < N; t++) {
      const p = (H[t - 1] + L[t - 1] + C[t - 1]) / 3;
      o.pivot[t] = p; o.r1[t] = p + p - L[t - 1]; o.s1[t] = p + p - H[t - 1]; o.r2[t] = p + H[t - 1] - L[t - 1]; o.s2[t] = p - H[t - 1] + L[t - 1];
    }
    return o;
  },
  roc(n) { return C.map((c, i) => i < n ? NaN : (c - C[i - n]) / C[i - n] * 100); },
  trix(n = 15, s = 9) {
    const e3 = nEma(nEma(nEma(C, n), n), n);
    const t = e3.map((v, i) => i > 0 && fin(v) && fin(e3[i - 1]) ? 100 * (v - e3[i - 1]) / e3[i - 1] : NaN);
    return { trix: t, signal: nEma(t, s) };
  },
  ultimateOscillator(a = 7, b = 14, c = 28) {
    const bp = [NaN], tr = [NaN];
    for (let i = 1; i < N; i++) { const lo = Math.min(L[i], C[i - 1]); bp.push(C[i] - lo); tr.push(Math.max(H[i], C[i - 1]) - lo); }
    const avg = (i, n) => sum(bp.slice(i - n + 1, i + 1)) / sum(tr.slice(i - n + 1, i + 1));
    return C.map((_, i) => i < c ? NaN : (100 / 7) * (4 * avg(i, a) + 2 * avg(i, b) + avg(i, c)));
  },
  cmo(n = 14) {
    return C.map((_, i) => {
      if (i < n) return NaN;
      const d = C.slice(i - n, i + 1).map((v, j, w) => j ? v - w[j - 1] : 0).slice(1);
      const up = sum(d.filter((x) => x > 0)), dn = -sum(d.filter((x) => x < 0));
      return 100 * (up - dn) / (up + dn);
    });
  },
  kama(n = 10, f = 2, s = 30) {
    const out = nan();
    let k = C[n - 1];
    for (let i = n; i < N; i++) {
      let vol = 0;
      for (let j = i - n + 1; j <= i; j++) vol += Math.abs(C[j] - C[j - 1]);
      const er = Math.abs(C[i] - C[i - n]) / vol, sc = (er * (2 / (f + 1) - 2 / (s + 1)) + 2 / (s + 1)) ** 2;
      k = k + sc * (C[i] - k); out[i] = k;
    }
    return out;
  },
  hma(n = 20) {
    const a = nWma(C, Math.floor(n / 2)), b = nWma(C, n);
    return nWma(a.map((v, i) => 2 * v - b[i]), Math.floor(Math.sqrt(n)));
  },
  chandelier(n = 22, m = 3) {
    const a = nAtr(H, L, C, n);
    return {
      long: C.map((_, i) => i < n - 1 ? NaN : Math.max(...H.slice(i - n + 1, i + 1)) - m * a[i]),
      short: C.map((_, i) => i < n - 1 ? NaN : Math.min(...L.slice(i - n + 1, i + 1)) + m * a[i])
    };
  },
  /* Normalgleichungen mit Σx, Σy, Σxy, Σx² (anderer Rechenweg als die Engine, die zentriert). */
  linreg(n = 50, k = 2) {
    const o = { value: nan(), slope: nan(), upper: nan(), lower: nan() };
    for (let i = n - 1; i < N; i++) {
      const y = C.slice(i - n + 1, i + 1);
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      y.forEach((v, x) => { sx += x; sy += v; sxy += x * v; sxx += x * x; });
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
      const res = y.map((v, x) => v - a - b * x), sd = Math.sqrt(sum(res.map((e) => e * e)) / n);
      o.value[i] = a + b * (n - 1); o.slope[i] = b; o.upper[i] = o.value[i] + k * sd; o.lower[i] = o.value[i] - k * sd;
    }
    return o;
  },
  insideBar() { return C.map((_, i) => i === 0 ? NaN : Number(H[i] < H[i - 1] && L[i] > L[i - 1])); },
  nr7(n = 7) {
    const r = H.map((h, i) => h - L[i]);
    return r.map((v, i) => i < n - 1 ? NaN : Number(v === Math.min(...r.slice(i - n + 1, i + 1))));
  },
  heikinAshi() {
    const o = { open: [], high: [], low: [], close: [] };
    for (let i = 0; i < N; i++) {
      const hc = (O[i] + H[i] + L[i] + C[i]) / 4, ho = i === 0 ? (O[0] + C[0]) / 2 : (o.open[i - 1] + o.close[i - 1]) / 2;
      o.open.push(ho); o.close.push(hc); o.high.push(Math.max(H[i], ho, hc)); o.low.push(Math.min(L[i], ho, hc));
    }
    return o;
  }
};

function sameOut(actual, expected, label) {
  if (Array.isArray(expected)) return same(actual, expected, label);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label + ": Ausgaben");
  for (const k of Object.keys(expected)) same(actual[k], expected[k], label + "." + k);
}

/* ---------- (a) naive Referenz auf AAPL ---------- */
test("(a) Pivot-Punkte aus der Vorbar entsprechen der Definition (AAPL real)", () => sameOut(I.compute(S, "pivots").values, REF.pivots(), "Pivots"));
test("(a) ROC 63/126/252 entsprechen der Definition und der generischen ROC (AAPL real)", () => {
  for (const n of [63, 126, 252]) {
    const got = I.compute(S, "roc" + n).values;
    same(got, REF.roc(n), "ROC" + n);
    assert.deepEqual(got, I.compute(S, "roc", { period: n }).values, "Voreinstellung = generische ROC");
  }
});
test("(a) TRIX 15 mit Signal 9 entspricht der Definition (AAPL real)", () => sameOut(I.compute(S, "trix").values, REF.trix(), "TRIX"));
test("(a) Ultimate Oscillator 7/14/28 entspricht der Definition (AAPL real)", () => {
  const got = I.compute(S, "ultimateOscillator").values;
  same(got, REF.ultimateOscillator(), "UO");
  assert.ok(got.filter(fin).every((v) => v >= 0 && v <= 100));
});
test("(a) CMO 14 entspricht der Definition (AAPL real)", () => {
  const got = I.compute(S, "cmo").values;
  same(got, REF.cmo(), "CMO");
  assert.ok(got.filter(fin).every((v) => v >= -100 && v <= 100));
});
test("(a) KAMA 10/2/30 entspricht der Definition (AAPL real)", () => same(I.compute(S, "kama").values, REF.kama(), "KAMA"));
test("(a) Hull MA 20 entspricht der Definition (AAPL real)", () => same(I.compute(S, "hma").values, REF.hma(), "HMA20"));
test("(a) Chandelier Exit 22/3 entspricht der Definition (AAPL real)", () => {
  const got = I.compute(S, "chandelier").values;
  sameOut(got, REF.chandelier(), "Chandelier");
  same(got.long, I.compute(S, "atr", { period: 22 }).values.map((a, i) => i < 21 ? NaN : Math.max(...H.slice(i - 21, i + 1)) - 3 * a), "lang = HH − 3·ATR (Katalog-ATR)");
});
test("(a) Regressionskanal 50 entspricht den Normalgleichungen (AAPL real)", () => {
  const all = I.compute(S, "linreg").values, got = { value: all.value, slope: all.slope, upper: all.upper, lower: all.lower }; /* r2 seit 1.3.0, eigener Test */
  sameOut(got, REF.linreg(), "LinReg");
  got.value.forEach((v, i) => { if (fin(v)) assert.ok(got.upper[i] >= v && got.lower[i] <= v); });
});
test("(a) Inside Bar und NR7 entsprechen der Definition (AAPL real)", () => {
  const ib = I.compute(S, "insideBar").values, nr = I.compute(S, "nr7").values;
  same(ib, REF.insideBar(), "InsideBar"); same(nr, REF.nr7(), "NR7");
  assert.ok(ib.some((v) => v === 1) && nr.some((v) => v === 1), "reale Reihe enthaelt beide Muster");
  assert.ok(ib.concat(nr).filter(fin).every((v) => v === 0 || v === 1), "Flags sind 0/1");
});
test("(a) Heikin-Ashi entspricht der Definition (AAPL real)", () => {
  const got = I.compute(S, "heikinAshi").values;
  sameOut(got, REF.heikinAshi(), "HA");
  for (let i = 0; i < N; i++) assert.ok(got.high[i] >= Math.max(got.open[i], got.close[i]) && got.low[i] <= Math.min(got.open[i], got.close[i]));
});

/* ---------- (b) Hand-Beispiele ---------- */
test("(b) Pivot-Punkte: H 12, L 9, C 9 ergibt P 10, R1 11, S1 8, R2 13, S2 7 an der Folgebar", () => {
  const r = I.pivots([12, 50], [9, 40], [9, 45]);
  assert.deepEqual([r.pivot[1], r.r1[1], r.s1[1], r.r2[1], r.s2[1]], [10, 11, 8, 13, 7]);
  assert.ok(Number.isNaN(r.pivot[0]), "erste Bar ohne Vorbar");
});
test("(b) ROC 63: 50 → 60 nach 63 Bars ergibt 20 %", () => {
  const c = Array.from({ length: 64 }, (_, i) => i === 0 ? 50 : i === 63 ? 60 : 55);
  const r = I.compute({ close: c }, "roc63").values;
  assert.ok(near(r[63], 20) && Number.isNaN(r[62]));
});
test("(b) TRIX(2, Signal 2) auf 1..6: E3 = 2,5 / 3,5 / 4,5 → TRIX 40 und 200/7, Signal 240/7", () => {
  const r = I.trix([1, 2, 3, 4, 5, 6], 2, 2);
  same(r.trix, [NaN, NaN, NaN, NaN, 40, 200 / 7], "TRIX", 1e-12);
  same(r.signal, [NaN, NaN, NaN, NaN, NaN, 240 / 7], "Signal", 1e-12);
});
test("(b) Ultimate Oscillator(1, 2, 3): A = 0,5 / 0,5 / 0,6 → 360/7", () => {
  /* BP/TR: Bar1 1/1, Bar2 1/2, Bar3 1/2 (L 9 < C_{−1} 11 → min 9; max(H 11, C_{−1} 11) − 9 = 2). */
  const r = I.ultimateOscillator([10, 11, 12, 11], [9, 10, 10, 9], [10, 11, 11, 10], 1, 2, 3);
  same(r, [NaN, NaN, NaN, 360 / 7], "UO", 1e-12);
  assert.equal(I.ultimateOscillator([5, 5, 5], [5, 5, 5], [5, 5, 5], 1, 1, 2)[2], 50, "keine Spanne: Mitte");
});
test("(b) CMO(3): Aenderungen +1, −0,5, +1,5 → 66,67; dann −0,5, +1,5, 0 → 50", () => {
  same(I.cmo([10, 11, 10.5, 12, 12], 3), [NaN, NaN, NaN, 200 / 3, 50], "CMO", 1e-12);
  assert.equal(I.cmo([7, 7, 7], 2)[2], 0, "keine Bewegung: 0");
});
test("(b) KAMA(2, 2, 30) auf 10, 11, 13, 12: 107/9, dann 8334463/700569", () => {
  /* Bar2: ER = 3/3 = 1, SC = (2/3)² = 4/9, KAMA = 11 + 4/9·2 = 107/9.
     Bar3: ER = 1/3, SC = (1/3·(2/3 − 2/31) + 2/31)² = (74/279)², KAMA = 107/9 + SC·(12 − 107/9). */
  same(I.kama([10, 11, 13, 12], 2, 2, 30), [NaN, NaN, 107 / 9, 8334463 / 700569], "KAMA", 1e-12);
});
test("(b) Hull MA(4) auf 1, 2, 4, 8, 16: 1265/90", () => {
  /* WMA2: 20/3 und 40/3 an Bar 3/4; WMA4: 4,9 und 9,8; Differenzreihe 253/30, 506/30; WMA2 davon = 1265/90. */
  same(I.hma([1, 2, 4, 8, 16], 4), [NaN, NaN, NaN, NaN, 1265 / 90], "HMA4", 1e-12);
});
test("(b) Chandelier(2, 1): ATR 2,5 / 1,75 → lang 9,5 / 10,25, kurz 10,5 / 10,75", () => {
  const r = I.chandelier([10, 12, 11], [8, 9, 10], [9, 11, 10.5], 2, 1);
  same(r.long, [NaN, 9.5, 10.25], "lang", 1e-12);
  same(r.short, [NaN, 10.5, 10.75], "kurz", 1e-12);
});
test("(b) Regressionskanal(3, k 1) auf 1, 2, 4: Steigung 1,5, Endwert 23/6, σ = √(1/18)", () => {
  const r = I.linreg([1, 2, 4], 3, 1), sd = Math.sqrt(1 / 18);
  same(r.slope, [NaN, NaN, 1.5], "Steigung", 1e-12);
  same(r.value, [NaN, NaN, 23 / 6], "Endwert", 1e-12);
  same(r.upper, [NaN, NaN, 23 / 6 + sd], "oben", 1e-12);
  same(r.lower, [NaN, NaN, 23 / 6 - sd], "unten", 1e-12);
});
test("(b) Inside Bar strikt: gleiches Hoch zaehlt nicht", () => {
  same(I.insideBar([10, 9, 9, 11], [5, 6, 6, 4]), [NaN, 1, 0, 0], "Inside");
});
test("(b) NR(3): Spannen 5, 3, 4, 2, 2 → 0, 1, 1 (Gleichstand zaehlt)", () => {
  same(I.narrowRange([10, 10, 10, 10, 10], [5, 7, 6, 8, 8], 3), [NaN, NaN, 0, 1, 1], "NR3");
});
test("(b) Heikin-Ashi: zwei Bars von Hand", () => {
  const r = I.heikinAshi([10, 11], [12, 13], [9, 10], [11, 12]);
  assert.deepEqual(r, { open: [10.5, 10.5], high: [12, 13], low: [9, 10], close: [10.5, 11.5] });
});

/* ---------- (c) Kausalitaet ---------- */
test("(c) Kausalitaet: Wert an t gleich auf voller, abgeschnittener und vergifteter Reihe", () => {
  const cuts = [5, 30, 64, 130, 200, 253, 280, N - 1];
  const poison = (x, t, i) => i <= t ? x : (i % 3 === 0 ? NaN : i % 3 === 1 ? x * 7.3 + 1000 : 0.001);
  for (const id of NEW_IDS) {
    const full = I.compute(S, id).values;
    for (const t of cuts) {
      const trunc = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.slice(0, t + 1)]));
      const pois = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.map((x, i) => poison(x, t, i))]));
      const a = I.compute(trunc, id).values, b = I.compute(pois, id).values;
      const keys = Array.isArray(full) ? [null] : Object.keys(full);
      for (const k of keys) {
        const f = k ? full[k] : full, p = k ? a[k] : a, q = k ? b[k] : b;
        for (let i = Math.max(0, t - 3); i <= t; i++) {
          assert.ok(Object.is(f[i], p[i]), `${id}.${k}[${i}] abgeschnitten bei ${t}: ${f[i]} != ${p[i]}`);
          assert.ok(Object.is(f[i], q[i]), `${id}.${k}[${i}] vergiftet nach ${t}: ${f[i]} != ${q[i]}`);
        }
      }
    }
  }
});

/* ---------- (d) Aufwaermphase ---------- */
test("(d) Aufwaermphase: Zahl der NaN je Ausgabe = dokumentierte Periode (lueckenlose AAPL-Reihe)", () => {
  const extra = { trix: { signal: 8 } }; /* Signal = EMA_9 der TRIX: 9 − 1 Bars spaeter */
  for (const id of NEW_IDS) {
    const r = I.compute(S, id), w = I.catalogEntry(id).warmup(r.params);
    assert.equal(r.warmup, w);
    const outs = Array.isArray(r.values) ? { main: r.values } : r.values;
    for (const [k, v] of Object.entries(outs)) {
      const expect = w + ((extra[id] || {})[k] || 0);
      assert.equal(v.filter((x) => !fin(x)).length, expect, `${id}.${k}: NaN-Zahl`);
      assert.equal(v.findIndex(fin), expect, `${id}.${k}: erster Wert`);
    }
  }
  const doc = { pivots: 1, kama: 10, hma: 22, linreg: 49, heikinAshi: 0, roc63: 63, roc126: 126, roc252: 252, trix: 43, ultimateOscillator: 28, cmo: 14, chandelier: 21, insideBar: 1, nr7: 6 };
  for (const id of NEW_IDS) assert.equal(I.compute(S, id).warmup, doc[id], id + " Standard-Aufwaermphase");
});

/* ---------- Vertrag ---------- */
test("Katalog 1.2.0: neue Eintraege dokumentiert, nur Katalog (catalogOnly), bestehende Eintraege unveraendert gelistet", () => {
  assert.match(I.INDICATORS_VERSION, /^technical-indicators-1\.\d+\.\d+$/); /* Versionspin im juengsten Katalogtest (L2b) */
  for (const id of NEW_IDS) {
    const e = I.catalogEntry(id);
    assert.ok(e && e.name && e.definition && e.family && e.catalogOnly === true, id);
    assert.equal(typeof I.compute(S, id).error, "undefined", id);
  }
  assert.equal(I.CATALOG.filter((e) => !e.catalogOnly).length, 24, "gelistete Indikatoren wie in 1.1.0 (auch nach 1.3.0)");
  const app = readFileSync(new URL("../../technical/app.js", import.meta.url), "utf8");
  assert.match(app, /c\.family === k && !c\.catalogOnly/, "Methodik-Seite zeigt nur freigegebene Indikatoren");
  assert.equal(I.compute({ close: C }, "heikinAshi").error, "MISSING_INPUT:open,high,low");
  assert.equal(I.compute(S, "hma", { period: 2.5 }).error, "INVALID_PARAM:period");
});

test("Luecken: neue Indikatoren liefern NaN statt 0 an fehlenden Bars", () => {
  const gap = { ...S, high: H.slice(), low: L.slice(), close: C.slice(), open: O.slice() };
  gap.close[150] = null; gap.high[150] = null; gap.low[150] = null; gap.open[150] = null;
  for (const id of ["kama", "hma", "linreg", "cmo", "ultimateOscillator", "insideBar", "nr7", "heikinAshi", "roc63"]) {
    const v = I.compute(gap, id).values, main = Array.isArray(v) ? v : v[Object.keys(v)[0]];
    assert.ok(Number.isNaN(main[150]), id + " an der Lueckenbar");
  }
  const p = I.compute(gap, "pivots").values;
  assert.ok(Number.isNaN(p.pivot[151]) && fin(p.pivot[150]) && fin(p.pivot[152]), "Pivots: nur die Folgebar der Luecke fehlt");
  const ha = I.compute(gap, "heikinAshi").values, ok = REF.heikinAshi();
  assert.ok(near(ha.open[151], (ok.open[149] + ok.close[149]) / 2), "Heikin-Ashi setzt an der letzten gueltigen Bar fort");
});
