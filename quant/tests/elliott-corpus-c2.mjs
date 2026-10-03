// Elliott-wave synthetic corpus "C2" — independent generator.
//
// Architecture: "stochastic process + embedded pattern".
//   1. A STRUCTURAL log-price path is built per (cls, seed) only:
//        background regime-switching drift (bull / bear / sideways Markov chain)
//        -> optional small unrelated zigzag (competing structure)
//        -> a subdivided move INTO the pattern origin
//        -> the Elliott pattern skeleton (each wave subdivided one level: 5 / 3)
//        -> a subdivided CONFIRMATION move
//        -> background drift again.
//      Proportions are drawn at random inside the textbook rule limits
//      (Frost & Prechter); the noise-free path is validated in PRICE space and
//      regenerated with the next structural sub-seed if any rule margin fails.
//   2. A NOISE process per (cls, seed, noise): GARCH(1,1) variance, Student-t
//      shocks, AR(1)-correlated innovations, rare single-bar event shocks that
//      feed the GARCH recursion, and an optional one-week gap (level jump).
//      Outside the pattern window the noise integrates (random walk); inside
//      [moveStart, confEnd] it is an AR(1) deviation around the skeleton,
//      anchored to the noise level reached at moveStart, so the series is
//      continuous and the background resumes from the window's end.
//   closes = exp(structure + noise). Stages only truncate one full series.
//
// No dependencies, no Math.random. Same inputs -> identical output.

export const CLASSES_C2 = [
  "IMPULSE", "IMPULSE_EXT1", "IMPULSE_EXT3", "IMPULSE_EXT5", "IMPULSE_TRUNCATED",
  "LEADING_DIAGONAL", "ENDING_DIAGONAL",
  "ZIGZAG", "DOUBLE_ZIGZAG", "TRIPLE_ZIGZAG",
  "FLAT_REGULAR", "FLAT_EXPANDED", "FLAT_RUNNING",
  "TRIANGLE_CONTRACTING", "TRIANGLE_EXPANDING",
  "WXY",
  "NEG_W2_BEYOND_ORIGIN", "NEG_W3_SHORTEST", "NEG_W4_OVERLAP",
];
export const STAGES_C2 = ["P60", "P75", "P90", "C_EARLY", "C_LATE"];

// Innovation scale; calibrated so the NOISE COMPONENT's weekly log-return std is
// ~1% / ~2.5% / ~4.5% (total series std incl. pattern moves: ~2.1 / ~3.1 / ~4.9%).
const NOISE_SIGMA = { none: 0, low: 0.0081, medium: 0.0197, high: 0.0355 };
const IMPULSE_LIKE = new Set([
  "IMPULSE", "IMPULSE_EXT1", "IMPULSE_EXT3", "IMPULSE_EXT5", "IMPULSE_TRUNCATED",
  "NEG_W2_BEYOND_ORIGIN", "NEG_W3_SHORTEST", "NEG_W4_OVERLAP",
]);
const DIAGONALS = new Set(["LEADING_DIAGONAL", "ENDING_DIAGONAL"]);
const MOTIVE = new Set([...IMPULSE_LIKE, ...DIAGONALS]);

const EXPECT = {
  IMPULSE: ["IMPULSE"], IMPULSE_EXT1: ["IMPULSE"], IMPULSE_EXT3: ["IMPULSE"],
  IMPULSE_EXT5: ["IMPULSE"], IMPULSE_TRUNCATED: ["IMPULSE"],
  LEADING_DIAGONAL: ["LEADING_DIAGONAL", "ENDING_DIAGONAL"],
  ENDING_DIAGONAL: ["ENDING_DIAGONAL", "LEADING_DIAGONAL"],
  ZIGZAG: ["ZIGZAG"], DOUBLE_ZIGZAG: ["DOUBLE_ZIGZAG", "WXY"], TRIPLE_ZIGZAG: ["TRIPLE_ZIGZAG"],
  FLAT_REGULAR: ["FLAT"], FLAT_EXPANDED: ["FLAT"], FLAT_RUNNING: ["FLAT"],
  TRIANGLE_CONTRACTING: ["TRIANGLE"], TRIANGLE_EXPANDING: ["TRIANGLE"],
  WXY: ["WXY"],
  NEG_W2_BEYOND_ORIGIN: [], NEG_W3_SHORTEST: [], NEG_W4_OVERLAP: [],
};

// ---------------------------------------------------------------- PRNG
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(key) {
    const h = xmur3(key);
    this.next = sfc32(h(), h(), h(), h());
    for (let i = 0; i < 15; i++) this.next();
    this.spare = null;
  }
  u() { return this.next(); }
  uni(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  logu(a, b) { return Math.exp(this.uni(Math.log(a), Math.log(b))); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  normal() {
    if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
    let u1 = this.next(); while (u1 <= 1e-12) u1 = this.next();
    const u2 = this.next();
    const r = Math.sqrt(-2 * Math.log(u1));
    this.spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  }
  gamma(k) { // Marsaglia–Tsang
    if (k < 1) { const g = this.gamma(k + 1); let u = this.next(); while (u <= 1e-12) u = this.next(); return g * Math.pow(u, 1 / k); }
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = this.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  studentT(nu) { const z = this.normal(); const chi = 2 * this.gamma(nu / 2); return z / Math.sqrt(chi / nu); }
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sum = (a) => a.reduce((s, x) => s + x, 0);

// ---------------------------------------------------------------- sub-waves
const nSub = (kind) => (kind === "imp" ? 5 : 3);
const minDur = (kind) => 2 * nSub(kind); // every sub-wave >= 2 bars

// Interior fractions of a unit leg 0 -> 1 for one level of subdivision.
function subFractions(kind, rng) {
  for (let i = 0; i < 400; i++) {
    if (kind === "imp") {
      const r2 = rng.uni(0.35, 0.68), s3 = rng.uni(1.15, 1.9), r4 = rng.uni(0.2, 0.45), s5 = rng.uni(0.55, 1.1);
      const p = [1, 1 - r2, 1 - r2 + s3];
      p.push(p[2] - r4 * s3); p.push(p[3] + s5);
      if (p[3] <= p[0] + 0.05) continue; // sub-wave 4 no overlap
      if (s3 <= Math.min(1, s5) * 1.05) continue;
      const tot = p[4];
      return { fr: p.slice(0, 4).map((x) => x / tot), lens: [1, r2, s3, r4 * s3, s5] };
    }
    if (kind === "zz") {
      const ta = rng.uni(0.42, 0.8), rb = rng.uni(0.35, 0.75);
      const c = 1 - ta + rb * ta;
      if (c / ta < 0.618 || c / ta > 1.618) continue;
      return { fr: [ta, ta - rb * ta], lens: [ta, rb * ta, c] };
    }
    if (kind === "flat") {
      const ta = rng.uni(0.8, 0.97), rb = rng.uni(0.8, 0.97);
      return { fr: [ta, ta - rb * ta], lens: [ta, rb * ta, 1 - ta + rb * ta] };
    }
    throw new Error("unknown kind " + kind);
  }
  throw new Error("subFractions infeasible " + kind);
}

// Split D bars into n parts >= minEach, roughly proportional to weights.
function partition(D, weights, minEach, rng) {
  const n = weights.length;
  if (D < n * minEach) throw new Error(`partition: ${D} < ${n}*${minEach}`);
  const rest = D - n * minEach;
  const w = weights.map((x) => Math.max(1e-6, x) * rng.uni(0.8, 1.25));
  const s = sum(w);
  const raw = w.map((x) => (x / s) * rest);
  const fl = raw.map(Math.floor);
  let left = rest - sum(fl);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k++, left--) fl[order[k % n][1]]++;
  return fl.map((x) => x + minEach);
}

function legInterior(kind, t0, v0, t1, v1, rng) {
  const { fr, lens } = subFractions(kind, rng);
  const sd = partition(t1 - t0, lens.map((l) => Math.pow(l, 0.7)), 2, rng);
  const pts = [];
  let t = t0;
  for (let i = 0; i < fr.length; i++) { t += sd[i]; pts.push({ t, v: v0 + (v1 - v0) * fr[i] }); }
  return pts;
}

// ---------------------------------------------------------------- patterns
// Unit frame: origin 0, first wave goes UP with log-length 1.
function tryPattern(cls, rng) {
  const corr = () => {
    const k2 = rng.chance(0.65) ? "zz" : "flat";
    const k4 = rng.chance(0.75) ? (k2 === "zz" ? "flat" : "zz") : k2; // alternation guideline
    return [k2, k4];
  };
  const impulse = (r2, w3, r4, w5) => {
    const p1 = 1, p2 = 1 - r2, p3 = p2 + w3, p4 = p3 - r4 * w3, p5 = p4 + w5;
    const [k2, k4] = corr();
    return { vals: [0, p1, p2, p3, p4, p5], kinds: ["imp", k2, "imp", k4, "imp"], lens: [1, r2, w3, r4 * w3, w5] };
  };
  const posOk = (P, truncated) => {
    const [, p1, p2, p3, p4, p5] = P.vals;
    if (p2 <= 0.03) return false;
    if (p4 <= p1 + 0.05) return false;
    const L3 = p3 - p2, L5 = p5 - p4;
    if (L3 <= Math.min(1, L5) * 1.06) return false;
    if (truncated ? p5 >= p3 - 0.03 : p5 <= p3 + 0.04) return false;
    return true;
  };
  switch (cls) {
    case "IMPULSE": {
      const P = impulse(rng.uni(0.38, 0.79), rng.uni(1.1, 1.75), rng.uni(0.2, 0.5), rng.uni(0.62, 1.15));
      return posOk(P, false) ? P : null;
    }
    case "IMPULSE_EXT1": {
      const w3 = rng.uni(0.45, 0.75);
      const P = impulse(rng.uni(0.22, 0.5), w3, rng.uni(0.18, 0.45), w3 * rng.uni(0.5, 0.85));
      return posOk(P, false) ? P : null;
    }
    case "IMPULSE_EXT3": {
      const P = impulse(rng.uni(0.38, 0.75), rng.uni(1.75, 2.9), rng.uni(0.15, 0.4), rng.uni(0.6, 1.2));
      return posOk(P, false) ? P : null;
    }
    case "IMPULSE_EXT5": {
      const w3 = rng.uni(1.0, 1.45);
      const P = impulse(rng.uni(0.38, 0.7), w3, rng.uni(0.2, 0.45), Math.max(1, w3) * rng.uni(1.4, 2.1));
      return posOk(P, false) ? P : null;
    }
    case "IMPULSE_TRUNCATED": {
      const w3 = rng.uni(1.35, 2.3), r4 = rng.uni(0.3, 0.5);
      const w5 = r4 * w3 * rng.uni(0.5, 0.88);
      if (w5 < 0.3) return null;
      const P = impulse(rng.uni(0.38, 0.7), w3, r4, w5);
      return posOk(P, true) ? P : null;
    }
    case "NEG_W2_BEYOND_ORIGIN": {
      const P = impulse(rng.uni(1.06, 1.35), rng.uni(1.6, 2.4), rng.uni(0.2, 0.42), rng.uni(0.62, 1.1));
      const [, p1, , p3, p4, p5] = P.vals;
      if (p4 <= p1 + 0.05 || p5 <= p3 + 0.04) return null;
      return P;
    }
    case "NEG_W3_SHORTEST": {
      const w3 = rng.uni(0.5, 0.82);
      const w5 = rng.uni(Math.max(w3 * 1.15, 0.6), 1.25);
      const r2 = rng.uni(0.2, Math.max(0.21, w3 - 0.18));
      const P = impulse(r2, w3, rng.uni(0.15, 0.4), w5);
      const [, p1, p2, p3, p4, p5] = P.vals;
      if (p2 <= 0.03 || p3 <= p1 + 0.08 || p4 <= p1 + 0.04 || p5 <= p3 + 0.04) return null;
      if (w3 >= Math.min(1, w5) * 0.9) return null;
      return P;
    }
    case "NEG_W4_OVERLAP": {
      const r2 = rng.uni(0.3, 0.55), w3 = rng.uni(1.5, 2.4);
      const p2 = 1 - r2, p3 = p2 + w3;
      const lo = Math.max(p2 + 0.1, 0.6), hi = 0.94;
      if (lo >= hi) return null;
      const p4 = rng.uni(lo, hi);
      const w4 = p3 - p4, w5 = w4 * rng.uni(1.1, 1.45);
      const [k2, k4] = corr();
      return { vals: [0, 1, p2, p3, p4, p4 + w5], kinds: ["imp", k2, "imp", k4, "imp"], lens: [1, r2, w3, w4, w5] };
    }
    case "LEADING_DIAGONAL":
    case "ENDING_DIAGONAL": {
      const r2 = rng.uni(0.5, 0.85);
      const w3lo = Math.max(r2 + 0.12, 0.6);
      if (w3lo >= 0.88) return null;
      const w3 = rng.uni(w3lo, 0.88);
      const lo = w3 - r2 + 0.05, hi = Math.min(r2 * 0.9, w3 * 0.85);
      if (lo >= hi) return null;
      const w4 = rng.uni(lo, hi);
      const w5lo = w4 + 0.05, w5hi = w3 * 0.86;
      if (w5lo >= w5hi) return null;
      const w5 = rng.uni(w5lo, w5hi);
      const p2 = 1 - r2, p3 = p2 + w3, p4 = p3 - w4, p5 = p4 + w5;
      const kinds = cls === "LEADING_DIAGONAL" ? ["imp", "zz", "imp", "zz", "imp"] : ["zz", "zz", "zz", "zz", "zz"];
      return { vals: [0, 1, p2, p3, p4, p5], kinds, lens: [1, r2, w3, w4, w5] };
    }
    case "ZIGZAG": {
      const rb = rng.uni(0.38, 0.85);
      const kc = rng.uni(Math.max(0.618, rb + 0.12), 1.618);
      return { vals: [0, 1, 1 - rb, 1 - rb + kc], kinds: ["imp", rng.chance(0.6) ? "zz" : "flat", "imp"], lens: [1, rb, kc] };
    }
    case "FLAT_REGULAR": {
      const rb = rng.uni(0.86, 0.98), cEnd = rng.uni(1.02, 1.1);
      return { vals: [0, 1, 1 - rb, cEnd], kinds: ["zz", "zz", "imp"], lens: [1, rb, cEnd - 1 + rb] };
    }
    case "FLAT_EXPANDED": {
      const rb = rng.uni(1.1, 1.38), kc = rb + rng.uni(0.12, 0.5);
      return { vals: [0, 1, 1 - rb, 1 - rb + kc], kinds: ["zz", "zz", "imp"], lens: [1, rb, kc] };
    }
    case "FLAT_RUNNING": {
      const rb = rng.uni(1.08, 1.35), kc = rng.uni(0.62, rb - 0.1);
      return { vals: [0, 1, 1 - rb, 1 - rb + kc], kinds: ["zz", "zz", "imp"], lens: [1, rb, kc] };
    }
    case "DOUBLE_ZIGZAG": {
      const rx = rng.uni(0.3, 0.72), ky = rng.uni(Math.max(0.7, rx + 0.15), 1.45);
      return { vals: [0, 1, 1 - rx, 1 - rx + ky], kinds: ["zz", rng.chance(0.7) ? "zz" : "flat", "zz"], lens: [1, rx, ky] };
    }
    case "TRIPLE_ZIGZAG": {
      const rx1 = rng.uni(0.3, 0.7), ky = rng.uni(Math.max(0.65, rx1 + 0.15), 1.3);
      const x2 = rng.uni(0.3, 0.7) * ky, kz = rng.uni(Math.max(0.6, x2 + 0.15), 1.3);
      const p2 = 1 - rx1, p3 = p2 + ky, p4 = p3 - x2, p5 = p4 + kz;
      return { vals: [0, 1, p2, p3, p4, p5], kinds: ["zz", "zz", "zz", "zz", "zz"], lens: [1, rx1, ky, x2, kz] };
    }
    case "TRIANGLE_CONTRACTING":
    case "TRIANGLE_EXPANDING": {
      const lens = [1];
      for (let i = 1; i < 5; i++) lens.push(lens[i - 1] * (cls === "TRIANGLE_CONTRACTING" ? rng.uni(0.58, 0.85) : rng.uni(1.12, 1.32)));
      const vals = [0];
      for (let i = 0; i < 5; i++) vals.push(vals[i] + (i % 2 === 0 ? 1 : -1) * lens[i]);
      return { vals, kinds: ["zz", "zz", "zz", "zz", "zz"], lens };
    }
    case "WXY": {
      const rx = rng.uni(0.6, 0.92), yEnd = rng.uni(0.88, 1.15), ky = yEnd - (1 - rx);
      if (ky < 0.6) return null;
      return { vals: [0, 1, 1 - rx, yEnd], kinds: ["flat", "zz", rng.chance(0.5) ? "zz" : "flat"], lens: [1, rx, ky] };
    }
    default:
      throw new Error("unknown class " + cls);
  }
}

function makeDurs(P, rng) {
  const { lens, kinds } = P;
  const d1 = rng.int(Math.max(minDur(kinds[0]), 7), 17);
  return lens.map((L, i) => {
    if (i === 0) return d1;
    const ex = i % 2 === 1 ? 0.35 : 0.6; // counter-trend legs take relatively longer
    const d = Math.round(d1 * Math.pow(L / lens[0], ex) * rng.uni(0.8, 1.25));
    return clamp(d, minDur(kinds[i]), 20);
  });
}

// ---------------------------------------------------------------- structure
function buildStructure(cls, seed, k) {
  const rng = new Rng(`vu-elliott-c2|${cls}|${seed}|struct|${k}`);
  const dir = rng.chance(0.5) ? 1 : -1;
  const m1 = Math.log(1 + rng.logu(0.10, 0.45));
  let pat = null;
  for (let i = 0; i < 500 && !pat; i++) pat = tryPattern(cls, rng);
  if (!pat) return null;
  const n = pat.kinds.length;
  const durs = makeDurs(pat, rng);
  const P = sum(durs);
  const motive = MOTIVE.has(cls);

  const moveKind = motive ? "zz" : "imp"; // prior correction vs prior trend leg
  const dm = Math.max(durs[0], minDur(moveKind)) + rng.int(0, 12);
  const extent = Math.max(...pat.vals);
  const mMove = motive ? rng.uni(0.55, 1.5) : extent / rng.uni(0.4, 0.85);

  const vEnd = pat.vals[n];
  let confKind, confNet, dc;
  if (motive) {
    confKind = "zz";
    // retrace 40-70% of the motive pattern measured in PRICE (origin -> end)
    const R = rng.uni(0.42, 0.68), g = Math.exp(dir * m1 * vEnd);
    confNet = Math.log(1 - R * (1 - 1 / g)) / (dir * m1);
    dc = clamp(Math.round(P * rng.uni(0.3, 0.6)), 8, 40);
  } else {
    confKind = "imp";
    confNet = Math.min(...pat.vals) - rng.uni(0.15, 0.6) - vEnd;
    dc = clamp(Math.round(10 + 14 * Math.abs(confNet) * rng.uni(0.6, 1.3)), 10, 40);
  }

  let comp = null;
  if (rng.chance(0.5)) {
    const a = rng.uni(0.3, 0.6) * m1, rb = rng.uni(0.4, 0.8), kc = rng.uni(Math.max(0.8, rb + 0.2), 1.3);
    comp = { dir: rng.sign(), a, rb, kc, durs: [rng.int(10, 14), rng.int(6, 10), rng.int(10, 14)] };
  }
  const compDur = comp ? sum(comp.durs) : 0;
  const gap1 = comp ? rng.int(0, 8) : 0;
  const preMin = rng.int(8, 20), tailMin = rng.int(3, 10);
  const req = 1 + preMin + compDur + gap1 + dm + P + dc + tailMin;
  // every stage cut (earliest is P60) must still leave >= 180 bars
  const needPre = Math.max(0, 182 - (preMin + compDur + gap1 + dm + Math.floor(0.6 * P)));
  if (req + needPre > 320) return null;
  const N = rng.int(Math.max(180, req + needPre), 320);
  const extra = N - req;
  const preExtra = rng.int(needPre, extra);
  const preLen = preMin + preExtra;

  // regime-switching background drift
  const mus = [rng.uni(0.002, 0.006), -rng.uni(0.002, 0.006), 0];
  let reg = rng.int(0, 2);
  const x = new Float64Array(N);
  let t = 0;
  const bg = (len) => {
    for (let i = 0; i < len; i++) {
      if (rng.chance(0.05)) reg = (reg + rng.int(1, 2)) % 3;
      x[t + 1] = x[t] + mus[reg];
      t++;
    }
  };
  const fill = (pts) => { // pts sorted, pts[0].t === t (current)
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], g = rng.uni(0.8, 1.25);
      for (let s = a.t + 1; s <= b.t; s++) x[s] = a.v + (b.v - a.v) * Math.pow((s - a.t) / (b.t - a.t), g);
    }
    t = pts[pts.length - 1].t;
  };
  const legs = (t0, v0, defs) => { // defs: [{kind, dur, dv}]
    const pts = [{ t: t0, v: v0 }], tops = [t0], subs = [];
    let tt = t0, vv = v0;
    for (const d of defs) {
      const t1 = tt + d.dur, v1 = vv + d.dv;
      const inner = legInterior(d.kind, tt, vv, t1, v1, rng);
      for (const p of inner) { pts.push(p); subs.push(p.t); }
      pts.push({ t: t1, v: v1 }); tops.push(t1);
      tt = t1; vv = v1;
    }
    return { pts, tops, subs };
  };

  bg(preLen);
  const contextTopIdx = [];
  if (comp) {
    const c = comp, s = c.dir;
    const L = legs(t, x[t], [
      { kind: "imp", dur: c.durs[0], dv: s * c.a },
      { kind: "zz", dur: c.durs[1], dv: -s * c.rb * c.a },
      { kind: "imp", dur: c.durs[2], dv: s * c.kc * c.a },
    ]);
    fill(L.pts);
    contextTopIdx.push(...L.tops);
    bg(gap1);
  }
  const moveStart = t;
  contextTopIdx.push(moveStart);
  const mv = legs(t, x[t], [{ kind: moveKind, dur: dm, dv: -dir * mMove * m1 }]);
  const o = moveStart + dm;
  const O = x[moveStart] - dir * mMove * m1;
  const patDefs = [];
  for (let i = 0; i < n; i++) patDefs.push({ kind: pat.kinds[i], dur: durs[i], dv: dir * m1 * (pat.vals[i + 1] - pat.vals[i]) });
  const pt = legs(o, O, patDefs);
  const pe = o + P;
  const cf = legs(pe, O + dir * m1 * vEnd, [{ kind: confKind, dur: dc, dv: dir * m1 * confNet }]);
  fill([...mv.pts, ...pt.pts.slice(1), ...cf.pts.slice(1)]);
  const confEnd = t;
  bg(N - 1 - t);
  if (t !== N - 1) throw new Error("layout mismatch");

  const lnP0 = rng.uni(Math.log(8), Math.log(150));
  for (let i = 0; i < N; i++) x[i] += lnP0;

  return {
    cls, dir, m1, N, x, motive, o, pe, confEnd, moveStart, d1: durs[0],
    topIdx: pt.tops, subIdx: pt.subs, contextTopIdx, confIdx: cf.subs.concat([confEnd]),
  };
}

// Rule checks on (noise-free) PRICE closes. y = dir * price keeps order & lengths.
function structOk(S, closes) {
  const { dir, o, d1, topIdx: T, cls } = S;
  const y = (i) => dir * closes[i];
  for (let i = Math.max(0, o - d1); i <= Math.min(closes.length - 1, o + d1); i++) if (i !== o && !(y(i) > y(o))) return false;
  for (let w = 0; w + 1 < T.length; w++) { // wave endpoints are the extremes of each wave
    const a = T[w], b = T[w + 1], lo = Math.min(y(a), y(b)), hi = Math.max(y(a), y(b));
    for (let i = a + 1; i < b; i++) if (!(y(i) > lo && y(i) < hi)) return false;
  }
  const L = (w) => Math.abs(y(T[w]) - y(T[w - 1]));
  const minIn = (a, b) => { let m = Infinity; for (let i = a; i <= b; i++) m = Math.min(m, y(i)); return m; };
  if (IMPULSE_LIKE.has(cls) || DIAGONALS.has(cls)) {
    const L1 = L(1), L3 = L(3), L5 = L(5);
    const w2 = minIn(T[1], T[2]) > y(T[0]) + 0.02 * L1;
    const w2bad = y(T[2]) < y(T[0]) - 0.02 * L1;
    const w3 = L3 > 1.03 * Math.min(L1, L5);
    const w3bad = L3 < 0.97 * Math.min(L1, L5);
    const w4 = minIn(T[3], T[4]) > y(T[1]) + 0.02 * L1;
    const w4bad = y(T[4]) < y(T[1]) - 0.02 * L1;
    const fifthBeyond = y(T[5]) > y(T[3]);
    switch (cls) {
      case "IMPULSE": return w2 && w3 && w4 && fifthBeyond;
      case "IMPULSE_EXT1": return w2 && w3 && w4 && fifthBeyond && L1 > L3 && L1 > L5;
      case "IMPULSE_EXT3": return w2 && w3 && w4 && fifthBeyond && L3 > L1 && L3 > L5;
      case "IMPULSE_EXT5": return w2 && w3 && w4 && fifthBeyond && L5 > L1 && L5 > L3;
      case "IMPULSE_TRUNCATED": return w2 && w3 && w4 && y(T[5]) < y(T[3]);
      case "NEG_W2_BEYOND_ORIGIN": return w2bad && w3 && w4 && fifthBeyond;
      case "NEG_W3_SHORTEST": return w2 && w3bad && w4 && fifthBeyond;
      case "NEG_W4_OVERLAP": return w2 && w3 && w4bad && fifthBeyond && L3 > L1;
      default: // diagonals: contracting
        return w2 && w4bad && L1 > L3 * 1.02 && L3 > L5 * 1.02 && L(2) > L(4) && y(T[4]) > y(T[2]) && fifthBeyond;
    }
  }
  switch (cls) {
    case "ZIGZAG": return y(T[2]) > y(T[0]) && y(T[3]) > y(T[1]);
    case "FLAT_REGULAR": return y(T[2]) > y(T[0]) && L(2) > 0.8 * L(1) && y(T[3]) > y(T[1]);
    case "FLAT_EXPANDED": return y(T[2]) < y(T[0]) && y(T[3]) > y(T[1]);
    case "FLAT_RUNNING": return y(T[2]) < y(T[0]) && y(T[3]) < y(T[1]) && y(T[3]) > y(T[2]);
    case "DOUBLE_ZIGZAG": case "WXY": return y(T[2]) > y(T[0]) && (cls === "WXY" || y(T[3]) > y(T[1]));
    case "TRIPLE_ZIGZAG": return y(T[2]) > y(T[0]) && y(T[3]) > y(T[1]) && y(T[4]) > y(T[2]) && y(T[5]) > y(T[3]);
    case "TRIANGLE_CONTRACTING": for (let w = 2; w <= 5; w++) if (!(L(w) < 0.98 * L(w - 1))) return false; return true;
    case "TRIANGLE_EXPANDING": for (let w = 2; w <= 5; w++) if (!(L(w) > 1.02 * L(w - 1))) return false; return true;
  }
  return false;
}

function structureFor(cls, seed) {
  for (let k = 0; k < 400; k++) {
    const S = buildStructure(cls, seed, k);
    if (!S) continue;
    if (structOk(S, Array.from(S.x, Math.exp))) { S.subSeed = k; return S; }
  }
  throw new Error(`C2: no valid structure for ${cls}|${seed}`);
}

// ---------------------------------------------------------------- noise
function buildNoise(N, level, cls, seed, j, ouStart, ouEnd) {
  const out = new Float64Array(N);
  const sigma = NOISE_SIGMA[level];
  if (!sigma) return out;
  const rng = new Rng(`vu-elliott-c2|${cls}|${seed}|${level}|noise|${j}`);
  const nu = rng.uni(3.5, 6), ts = Math.sqrt((nu - 2) / nu);
  const alpha = rng.uni(0.06, 0.13), beta = rng.uni(0.8, 0.94 - alpha);
  const omega = sigma * sigma * (1 - alpha - beta);
  const rho = rng.uni(-0.06, 0.15), phi = rng.uni(0.72, 0.88);
  let h = sigma * sigma, e = 0;
  for (let i = 0; i < 60; i++) { h = omega + alpha * e * e + beta * h; e = Math.sqrt(h) * rng.studentT(nu) * ts; }
  let gapAt = -1;
  if (rng.chance(0.4)) {
    const cand = [];
    for (let i = 1; i < N; i++) if (i <= ouStart || i > ouEnd) cand.push(i);
    if (cand.length) gapAt = cand[rng.int(0, cand.length - 1)];
  }
  const gap = rng.sign() * rng.uni(2, 4) * sigma;
  let uPrev = 0, D = 0;
  for (let t = 1; t < N; t++) {
    h = omega + alpha * e * e + beta * h;
    e = Math.sqrt(h) * rng.studentT(nu) * ts;
    if (rng.chance(0.012)) e += rng.sign() * rng.uni(3, 5.5) * Math.sqrt(h); // single-bar event shock
    const u = rho * uPrev + e;
    uPrev = u;
    if (t > ouStart && t <= ouEnd) { D = phi * D + u; out[t] = out[ouStart] + D; }
    else out[t] = out[t - 1] + u + (t === gapAt ? gap : 0);
  }
  return out;
}

function originOk(closes, S) {
  const { dir, o, d1 } = S;
  for (let i = Math.max(0, o - d1); i <= Math.min(closes.length - 1, o + d1); i++) if (i !== o && !(dir * closes[i] > dir * closes[o])) return false;
  return true;
}

function isoDate(i) {
  const d = new Date(Date.UTC(2001, 0, 5) + i * 7 * 86400000);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- public
export function caseC2(cls, seed, noise, opts = {}) {
  if (!CLASSES_C2.includes(cls)) throw new Error("caseC2: unknown class " + cls);
  if (!(noise in NOISE_SIGMA)) throw new Error("caseC2: unknown noise " + noise);
  const stage = opts.stage ?? "C_LATE";
  if (!STAGES_C2.includes(stage)) throw new Error("caseC2: unknown stage " + stage);

  const S = structureFor(cls, seed);
  const { N, x } = S;
  let closesFull = null;
  const tries = noise === "low" ? 80 : 1;
  for (let j = 0; j < tries; j++) {
    const nz = buildNoise(N, noise, cls, seed, j, S.moveStart, S.confEnd);
    const c = Array.from(x, (v, i) => Math.exp(v + nz[i]));
    closesFull = c;
    if (noise !== "low" || originOk(c, S)) break;
  }

  // stage cut (stage RNG is independent of noise and structure)
  const T = S.topIdx, o = S.o, pe = S.pe;
  const sr = new Rng(`vu-elliott-c2|${cls}|${seed}|stage|${stage}`);
  let cutAt, completedWaves, currentWave;
  if (stage[0] === "P") {
    const f = { P60: 0.6, P75: 0.75, P90: 0.9 }[stage];
    cutAt = o + Math.round(f * (pe - o));
    while (T.includes(cutAt)) cutAt++;
    completedWaves = T.slice(1).filter((t) => t <= cutAt).length;
    currentWave = completedWaves + 1;
  } else {
    const q = stage === "C_EARLY" ? sr.uni(0.3, 0.5) : sr.uni(0.7, 1.0);
    const x0 = x[pe], span = x[S.confEnd] - x0;
    cutAt = S.confEnd;
    if (q < 0.995) for (let t = pe + 1; t <= S.confEnd; t++) if ((x[t] - x0) / span >= q) { cutAt = t; break; }
    completedWaves = T.length - 1;
    currentWave = null;
  }

  // opts.full (diagnostics only): return the whole generated series, no stage cut.
  if (opts.full) cutAt = N - 1;
  const closes = closesFull.slice(0, cutAt + 1);
  const dates = closes.map((_, i) => isoDate(i));
  return {
    id: `${cls}|${noise}|${seed}|${stage}|C2`,
    closes, dates, layout: "C2",
    truth: {
      cls, expect: EXPECT[cls].slice(),
      motive: S.motive, negativeOf: cls.startsWith("NEG_") ? "IMPULSE" : null,
      dir: S.dir,
      topIdx: T.slice(), subIdx: S.subIdx.slice(), contextTopIdx: S.contextTopIdx.slice(), confIdx: S.confIdx.slice(),
      patternEnd: pe, cutAt, stage, completedWaves, currentWave,
    },
  };
}
