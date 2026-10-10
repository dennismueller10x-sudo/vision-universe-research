/* =========================================================================
   ELLIOTT-KORPUS v2 (Remediation §14–§16)

   Parametrischer Generator mit BEKANNTER, VERSCHACHTELTER Struktur:
     Grad 0 (Ziel)   — das zu erkennende Muster (z. B. Flat A-B-C)
     Grad −1         — jede Welle des Musters ist selbst ein regelkonformes
                       Muster (Motivwelle → Impuls, Korrekturwelle → Zigzag,
                       Flat oder Dreieck, je nach Position)
   Davor steht ein Kontextmuster gleichen Grades (die Welle, die das Ziel
   korrigiert bzw. der es folgt), danach eine Gegenbewegung, die das
   Musterende bestaetigt. Ausgewertet wird am letzten Bar.

   Alle Proportionen werden ZUFAELLIG INNERHALB DER LEGALEN BEREICHE gezogen
   (nicht nur Lehrbuch-Idealwerte). Quelle der Bereiche: Frost & Prechter,
   Elliott Wave Principle, Kap. 1–2 (Regeln = harte Grenzen, Richtlinien =
   typische Bereiche); die Ziehbereiche sind bewusst weiter als die Ideale.

   Rauschen: Brown'sche Bruecke zwischen den Pivots (Wochenschluss, wie die
   Produktdaten: Close-only), sigma je Woche in % des Kurses.
     none 0 · low 0,8 % · medium 2 % · high 4 %   (typische Aktie: 3–5 %)
   Optional: Volatilitaetswechsel (zweite Haelfte ×1,8 bzw. ×0,5).

   Negative Faelle verletzen genau eine harte Regel; die Engine darf sie
   nicht als das Zielmuster lesen.

   Splits (vorab festgelegt, ELLIOTT_ENGINE_QUALITY_PREREG.md):
     seed 0–9 DEVELOPMENT · 10–19 VALIDATION · 20–29 HOLDOUT
   ========================================================================= */

/* ---------------------------------------------------------------- RNG */
export function rng(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let s = h || 1;
  const next = () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, u: (a, b) => a + (b - a) * next(), pick: (arr) => arr[Math.floor(next() * arr.length)], gauss: () => Math.sqrt(-2 * Math.log(Math.max(1e-12, next()))) * Math.cos(2 * Math.PI * next()) };
}

/* -------------------------------------------------------- Musterformen
   Jede Form liefert Wellen als { len (relativ zu Welle 1 bzw. A = 1), bars (relativ), sub } mit
   alternierender Richtung; Vorzeichen ergibt sich aus der Position. sub = Klasse der Unterteilung. */
function impulse(R, variant) {
  let w1 = 1, w2, w3, w4, w5;
  w2 = R.u(0.382, 0.786);
  if (variant === "EXT1") { w1 = 1; w2 = R.u(0.236, 0.5); w3 = R.u(0.55, 0.85); w4 = R.u(0.236, 0.45) * w3; w5 = R.u(0.4, Math.min(0.8, w3 * 0.95)); }
  else if (variant === "EXT3") { w3 = R.u(1.9, 3.2); w4 = R.u(0.15, 0.33) * w3; w5 = R.u(0.75, 1.25); }
  else if (variant === "EXT5") { w3 = R.u(1.05, 1.5); w4 = R.u(0.236, 0.45) * w3; w5 = R.u(1.65, 2.6); }
  else if (variant === "TRUNCATED") { w3 = R.u(1.4, 2.2); w4 = R.u(0.3, 0.45) * w3; w5 = R.u(0.45, 0.85) * w4; }
  else { w3 = R.u(1.15, 2.0); w4 = R.u(0.236, 0.45) * w3; w5 = R.u(0.618, 1.3); }
  /* harte Regeln absichern: W4 nicht in W1 (net(1..3) - w4 > w1 ⇔ w3 - w2 > w4), W3 nicht kuerzeste */
  if (w3 - w2 <= w4) w4 = (w3 - w2) * R.u(0.5, 0.85);
  if (w3 < Math.min(w1, w5)) w5 = w3 * R.u(0.6, 0.95);
  const b = [R.u(0.8, 1.3), R.u(0.6, 1.4), R.u(1.0, 1.8), R.u(0.8, 2.0), R.u(0.7, 1.3)];
  const w4sub = R.pick(["FLAT", "TRIANGLE", "ZIGZAG", "FLAT"]), w2sub = R.pick(["ZIGZAG", "ZIGZAG", "FLAT"]);
  return [{ len: w1, bars: b[0], sub: "IMPULSE" }, { len: w2 * w1, bars: b[1], sub: w2sub }, { len: w3, bars: b[2], sub: "IMPULSE" }, { len: w4, bars: b[3], sub: w4sub }, { len: w5, bars: b[4], sub: "IMPULSE" }];
}
function diagonal(R, kind) {
  /* kontrahierend (EWP Kap. 1, Diagonal Triangles): W1 > W3 > W5, W2 > W4, W4 ueberlappt W1, W3 ueber W1-Ende hinaus
     (harte Regel), W2/W4 retracen tief (typ. 0,66–0,81). Gezogen wird innerhalb dieser Grenzen. */
  const w1 = 1, w2 = R.u(0.55, 0.78);
  const w3 = R.u(Math.max(w2 + 0.1, 0.7), 0.95);
  const w4lo = (w3 - w2) + 0.04, w4hi = Math.min(0.92 * w2, 0.88 * w3);
  const w4 = w4lo < w4hi ? R.u(w4lo, w4hi) : (w4lo + w4hi) / 2;
  const w5 = R.u(Math.min(w4 + 0.05, 0.9 * w3), 0.92 * w3);
  const sub = kind === "LEADING" ? ["IMPULSE", "ZIGZAG", "IMPULSE", "ZIGZAG", "IMPULSE"] : ["ZIGZAG", "ZIGZAG", "ZIGZAG", "ZIGZAG", "ZIGZAG"];
  return [w1, w2, w3, w4, w5].map((len, k) => ({ len, bars: R.u(0.8, 1.3), sub: sub[k] }));
}
function zigzag(R) {
  const b = R.u(0.382, 0.8), c = R.u(0.75, 1.618);
  return [{ len: 1, bars: R.u(0.8, 1.2), sub: "IMPULSE" }, { len: b, bars: R.u(0.6, 1.4), sub: R.pick(["ZIGZAG", "FLAT", "TRIANGLE"]) }, { len: Math.max(c, b + 0.15), bars: R.u(0.8, 1.4), sub: "IMPULSE" }];
}
function flat(R, variant) {
  let b, c;
  if (variant === "REGULAR") { b = R.u(0.9, 1.04); c = R.u(0.95, 1.25); }
  else if (variant === "EXPANDED") { b = R.u(1.08, 1.38); c = R.u(1.3, 1.9); if (c < b + 0.1) c = b + 0.15; }
  else { b = R.u(1.05, 1.3); c = R.u(0.6, 0.92) * b; }   // RUNNING: C endet vor dem A-Ende (c < b)
  return [{ len: 1, bars: R.u(0.8, 1.2), sub: "ZIGZAG" }, { len: b, bars: R.u(0.8, 1.4), sub: "ZIGZAG" }, { len: c, bars: R.u(0.8, 1.3), sub: "IMPULSE" }];
}
function triangle(R, kind) {
  const L = [1];
  for (let k = 1; k < 5; k++) L.push(L[k - 1] * (kind === "EXPANDING" ? R.u(1.12, 1.4) : R.u(0.6, 0.85)));
  return L.map((len) => ({ len, bars: R.u(0.7, 1.2), sub: "ZIGZAG" }));
}
function doubleZigzag(R) {
  /* W (Zigzag) – X (Zigzag/Flat) – Y (Zigzag), Y schreitet ueber W-Ende hinaus */
  const x = R.u(0.3, 0.7), y = R.u(0.85, 1.35);
  return [{ len: 1, bars: 1.2, sub: "ZIGZAG" }, { len: x, bars: R.u(0.5, 1.0), sub: R.pick(["ZIGZAG", "FLAT"]) }, { len: Math.max(y, x + 0.25), bars: 1.2, sub: "ZIGZAG" }];
}
function tripleZigzag(R) {
  const x1 = R.u(0.3, 0.6), y = R.u(0.85, 1.2), x2 = R.u(0.3, 0.6) * y, z = R.u(0.85, 1.2);
  return [{ len: 1, bars: 1.1, sub: "ZIGZAG" }, { len: x1, bars: 0.7, sub: "ZIGZAG" }, { len: Math.max(y, x1 + 0.2), bars: 1.1, sub: "ZIGZAG" }, { len: x2, bars: 0.7, sub: "ZIGZAG" }, { len: Math.max(z, x2 + 0.2), bars: 1.1, sub: "ZIGZAG" }];
}
function doubleThree(R) {
  /* W (Flat) – X (Zigzag) – Y (Zigzag oder Flat), seitwaerts */
  const x = R.u(0.5, 0.95), y = R.u(0.8, 1.2);
  return [{ len: 1, bars: 1.1, sub: "FLAT" }, { len: x, bars: R.u(0.6, 1.0), sub: "ZIGZAG" }, { len: Math.max(y, x + 0.05), bars: 1.1, sub: R.pick(["ZIGZAG", "FLAT"]) }];
}

/* Negative Faelle: sieht aus wie ein Impuls, verletzt genau eine harte Regel */
function negImpulse(R, which) {
  const w = impulse(R, "NORMAL");
  if (which === "W2_BEYOND_ORIGIN") w[1].len = w[0].len * R.u(1.06, 1.25);
  if (which === "W3_SHORTEST") { w[0].len = 1; w[2].len = R.u(0.7, 0.9); w[4].len = R.u(1.0, 1.2); w[3].len = w[2].len * R.u(0.3, 0.5); w[1].len = R.u(0.3, 0.5); }
  if (which === "W4_OVERLAP") { w[2].len = R.u(1.4, 1.9); w[1].len = R.u(0.4, 0.6); w[3].len = (w[2].len - w[1].len) + R.u(0.12, 0.35); w[4].len = R.u(0.8, 1.2) * w[2].len * 0.9; if (w[4].len >= w[2].len) w[4].len = w[2].len * 0.85; }
  return w;
}

export const CLASSES = {
  IMPULSE:              { shape: (R) => impulse(R, "NORMAL"), motive: true, expect: ["IMPULSE"] },
  IMPULSE_EXT1:         { shape: (R) => impulse(R, "EXT1"), motive: true, expect: ["IMPULSE"] },
  IMPULSE_EXT3:         { shape: (R) => impulse(R, "EXT3"), motive: true, expect: ["IMPULSE"] },
  IMPULSE_EXT5:         { shape: (R) => impulse(R, "EXT5"), motive: true, expect: ["IMPULSE"] },
  IMPULSE_TRUNCATED:    { shape: (R) => impulse(R, "TRUNCATED"), motive: true, expect: ["IMPULSE"] },
  LEADING_DIAGONAL:     { shape: (R) => diagonal(R, "LEADING"), motive: true, expect: ["LEADING_DIAGONAL", "ENDING_DIAGONAL"] },
  ENDING_DIAGONAL:      { shape: (R) => diagonal(R, "ENDING"), motive: true, expect: ["ENDING_DIAGONAL", "LEADING_DIAGONAL"] },
  ZIGZAG:               { shape: zigzag, motive: false, expect: ["ZIGZAG"] },
  DOUBLE_ZIGZAG:        { shape: doubleZigzag, motive: false, expect: ["DOUBLE_ZIGZAG", "WXY"], compact: true },
  TRIPLE_ZIGZAG:        { shape: tripleZigzag, motive: false, expect: ["TRIPLE_ZIGZAG"], compact: true },
  FLAT_REGULAR:         { shape: (R) => flat(R, "REGULAR"), motive: false, expect: ["FLAT"] },
  FLAT_EXPANDED:        { shape: (R) => flat(R, "EXPANDED"), motive: false, expect: ["FLAT"] },
  FLAT_RUNNING:         { shape: (R) => flat(R, "RUNNING"), motive: false, expect: ["FLAT"] },
  TRIANGLE_CONTRACTING: { shape: (R) => triangle(R, "CONTRACTING"), motive: false, expect: ["TRIANGLE"] },
  TRIANGLE_EXPANDING:   { shape: (R) => triangle(R, "EXPANDING"), motive: false, expect: ["TRIANGLE"] },
  WXY:                  { shape: doubleThree, motive: false, expect: ["WXY"] },
  NEG_W2_BEYOND_ORIGIN: { shape: (R) => negImpulse(R, "W2_BEYOND_ORIGIN"), motive: true, expect: [], negativeOf: "IMPULSE" },
  NEG_W3_SHORTEST:      { shape: (R) => negImpulse(R, "W3_SHORTEST"), motive: true, expect: [], negativeOf: "IMPULSE" },
  NEG_W4_OVERLAP:       { shape: (R) => negImpulse(R, "W4_OVERLAP"), motive: true, expect: [], negativeOf: "IMPULSE" }
};
export const SUBSHAPE = { IMPULSE: (R) => impulse(R, R.pick(["NORMAL", "NORMAL", "EXT3", "EXT5"])), ZIGZAG: zigzag, FLAT: (R) => flat(R, R.pick(["REGULAR", "EXPANDED", "REGULAR"])), TRIANGLE: (R) => triangle(R, "CONTRACTING") };

/** Wellen einer Form zu Punktfolge (relativ: Start 0, Richtung dir, Welle-1-Laenge 1, Bars relativ). */
export function walk(waves, dir) {
  const pts = [[0, 0]];
  let x = 0, y = 0;
  waves.forEach((w, k) => { const sg = k % 2 === 0 ? dir : -dir; x += w.bars; y += sg * w.len; pts.push([x, y]); });
  return pts;
}

/**
 * Baut ein Muster mit Unterteilung in absoluten Koordinaten.
 * @returns {{top: number[][], sub: number[][], all: number[][]}} Punkte [bar(float), preis]
 */
export function build(R, waves, x0, y0, dir, unitLen, unitBars, depth) {
  const top = [[x0, y0]], all = [[x0, y0]], sub = [];
  let x = x0, y = y0;
  waves.forEach((w, k) => {
    const sg = k % 2 === 0 ? dir : -dir, L = w.len * unitLen, B = Math.max(depth > 0 ? 6 : 2, w.bars * unitBars);
    const x1 = x + B, y1 = y + sg * L;
    if (depth > 0 && w.sub) {
      const sw = SUBSHAPE[w.sub](R), rel = walk(sw, 1);
      const net = rel[rel.length - 1][1], span = rel[rel.length - 1][0];
      /* Unterwellen so skalieren, dass sie exakt von (x,y) nach (x1,y1) laufen */
      for (let q = 1; q < rel.length; q++) {
        const px = x + (rel[q][0] / span) * B, py = y + sg * (rel[q][1] / net) * L;
        all.push([px, py]); if (q < rel.length - 1) sub.push([px, py]);
      }
    } else all.push([x1, y1]);
    top.push([x1, y1]); x = x1; y = y1;
  });
  return { top, sub, all };
}

const NOISE = { none: 0, low: 0.008, medium: 0.02, high: 0.04 };

/**
 * Ein Korpusfall. opts: { cls, seed, noise, volShift }
 * Rueckgabe: { closes, dates, truth: { cls, expect, topIdx, topPrice, subIdx, patternEnd, legs, motive, negativeOf, unsupported } }
 */
export function corpusCase(cls, seed, noise, opts = {}) {
  const C = CLASSES[cls];
  const LB = opts.layout === "B";
  const R = rng("vu-elliott-corpus-v2|" + cls + "|" + seed + "|" + noise + (LB ? "|layoutB" : ""));
  const dir = R.next() < 0.5 ? 1 : -1;            // Richtung der ersten Welle des Zielmusters
  const P0 = 100;
  /* Groesse: Welle 1/A zwischen 12 % und 45 % des Kurses (log-gleichverteilt) → Muster auf scale-2..4 sichtbar */
  const g = Math.exp(R.u(Math.log(0.12), Math.log(0.45)));
  const unitLen = g * P0, unitBars = R.u(7, 16);
  /* Kontext gleichen Grades: Motiv-Ziel folgt einer Korrektur (Zigzag gegen dir), Korrektur-Ziel folgt einem Impuls (in −dir) */
  const ctxWaves = C.motive ? zigzag(R) : impulse(R, "NORMAL");
  const ctxDir = -dir;
  const ctxLen = unitLen * (C.motive ? R.u(0.6, 1.0) : R.u(1.0, 1.6));
  /* Startniveau so, dass alle Preise positiv bleiben */
  const shapeW = C.shape(R);
  const ctxPts = walk(ctxWaves, ctxDir), tgtPts = walk(shapeW, dir);
  const minRel = (pts, L) => Math.min(...pts.map((p) => p[1] * L));
  const yCtxEnd = ctxPts[ctxPts.length - 1][1] * ctxLen;
  const lowest = Math.min(minRel(ctxPts, ctxLen), yCtxEnd + minRel(tgtPts, unitLen));
  const start = P0 + Math.max(0, -lowest + 0.35 * P0);
  /* Vorlauf (ruhiger Seitwaertsverlauf, 30 Wochen), dann Kontext, dann Ziel, dann Bestaetigung */
  const lead = 30;
  let ctx = build(R, ctxWaves, lead, start, ctxDir, ctxLen, unitBars, 1);
  if (LB) {
    /* Layout B (Aenderung 1, HOLDOUT-2): Kontext ist ein Zufallspfad, kein Muster gleichen Grades. Er laeuft vom Start zum
       Ursprung des Zielmusters (gleiche Nettobewegung wie der Musterkontext), Schritt fuer Schritt mit Zufallsabweichung. */
    const cEndY = ctx.top[ctx.top.length - 1][1], m = Math.max(30, Math.round(R.u(40, 90)));
    const sd = 0.035 * Math.abs(cEndY - start) / Math.sqrt(m) * 4 + 0.004 * start;
    const pts = [[lead, start]]; let w = 0; const ws = [0];
    for (let q = 1; q <= m; q++) { w += sd * R.gauss(); ws.push(w); }
    for (let q = 1; q <= m; q++) pts.push([lead + q, start + (cEndY - start) * q / m + ws[q] - (q / m) * ws[m]]);
    ctx = { top: [[lead, start], [lead + m, cEndY]], sub: [], all: pts };
  }
  const cEnd = ctx.top[ctx.top.length - 1];
  const tgt = build(R, shapeW, cEnd[0], cEnd[1], dir, unitLen, unitBars, C.compact ? 1 : 1);
  const tEnd = tgt.top[tgt.top.length - 1], tPrev = tgt.top[tgt.top.length - 2];
  const lastDir = Math.sign(tEnd[1] - tPrev[1]);
  const net = Math.abs(tEnd[1] - tgt.top[0][1]) || unitLen, tBars = tEnd[0] - tgt.top[0][0];
  /* Entscheidende Bestaetigung (Grad +1 laeuft weiter): nach einer Korrektur setzt sich der Kontexttrend fort und
     ueberschreitet den Musterbeginn; nach einem Motivmuster folgt eine Korrektur von 50–70 % des Musters. */
  let confLen, confBars;
  if (!C.motive || C.negativeOf) {
    const range = Math.max(...tgt.top.map((p) => p[1])) - Math.min(...tgt.top.map((p) => p[1]));
    confLen = C.negativeOf ? R.u(0.5, 0.7) * net : Math.abs(tEnd[1] - tgt.top[0][1]) + R.u(0.15, 0.4) * Math.max(range, unitLen);
    if (!C.negativeOf && Math.sign(tgt.top[0][1] - tEnd[1]) !== -lastDir) confLen = R.u(0.6, 0.9) * range;
  } else confLen = R.u(0.5, 0.7) * net;
  confBars = Math.max(4, Math.round(R.u(0.35, 0.6) * tBars));
  const conf = [tEnd[0] + confBars, Math.max(1, tEnd[1] - lastDir * confLen)];
  /* Layout B: die Bestaetigungsbewegung ist selbst unterteilt (Impuls nach einer Korrektur, Zigzag nach einem Motivmuster) */
  let confPts = [conf];
  if (LB) {
    const cw = (!C.motive || C.negativeOf) ? impulse(R, "NORMAL") : zigzag(R), rel = walk(cw, 1), netRel = rel[rel.length - 1][1], spanRel = rel[rel.length - 1][0];
    const b = build(R, cw, tEnd[0], tEnd[1], -lastDir, confLen / Math.abs(netRel), confBars / spanRel, 0);
    confPts = b.all.slice(1).map(([x, y]) => [x, Math.max(1, y)]);
  }
  /* Pivots auf ganze Wochen runden; streng monoton halten */
  const knots = [[0, start * R.u(0.97, 1.03)], [lead, start]].concat(ctx.all.slice(1), tgt.all.slice(1), confPts);
  const xs = []; let lastX = -1;
  const K = knots.map(([x, y]) => { let xi = Math.round(x); if (xi <= lastX) xi = lastX + 1; lastX = xi; xs.push(xi); return [xi, y]; });
  const n = K[K.length - 1][0] + 1;
  /* Pfad: lineare Interpolation + Brown'sche Bruecke je Segment */
  const sigma = NOISE[noise] || 0, closes = new Array(n);
  for (let s = 0; s < K.length - 1; s++) {
    const [i0, v0] = K[s], [i1, v1] = K[s + 1], m = i1 - i0;
    let w = 0; const ws = [0];
    for (let q = 1; q <= m; q++) { const vol = sigma * (opts.volShift && i0 + q > n / 2 ? opts.volShift : 1); w += vol * R.gauss(); ws.push(w); }
    for (let q = 0; q < m; q++) {
      const base = v0 + (v1 - v0) * q / m, bridge = ws[q] - (q / m) * ws[m];
      closes[i0 + q] = Math.max(0.5, base * (1 + bridge));
    }
  }
  closes[n - 1] = K[K.length - 1][1];
  const map = (pts) => pts.map(([x, y]) => { let best = 0, d = Infinity; K.forEach((k, j) => { const dd = Math.abs(k[0] - Math.round(x)) + Math.abs(k[1] - y) * 1e-6; if (dd < d) { d = dd; best = j; } }); return K[best][0]; });
  const topIdx = map(tgt.top), subIdx = map(tgt.sub);
  /* Auswertung MITTEN im Muster (opts.cut === "mid"): Stand innerhalb einer laufenden Welle k+1 (k >= 2 abgeschlossene Wellen).
     Wahrheit: die abgeschlossenen Wellenenden und die laufende Welle. */
  let cutAt = n - 1, mid = null;
  if (opts.cut === "mid" && shapeW.length >= 3) {
    const k = 2 + Math.floor(R.next() * (shapeW.length - 2));          // 2 .. w-1 abgeschlossene Wellen
    const a = topIdx[k], b = topIdx[k + 1];
    cutAt = Math.min(n - 1, a + Math.max(2, Math.round(R.u(0.45, 0.85) * (b - a))));
    mid = { completedWaves: k, currentWave: k + 1, pts: topIdx.slice(0, k + 1) };
  }
  /* Layout B: Auswertung zu einem zufaelligen Zeitpunkt zwischen 40 % und 100 % der Bestaetigungsbewegung */
  if (LB && !mid) { const te = topIdx[topIdx.length - 1]; cutAt = Math.min(n - 1, te + Math.max(2, Math.round(R.u(0.4, 1.0) * (n - 1 - te)))); }
  const dates = []; const t0 = Date.UTC(2001, 0, 5);
  for (let i = 0; i < n; i++) dates.push(new Date(t0 + i * 7 * 86400000).toISOString().slice(0, 10));
  if (cutAt < n - 1) { closes.length = cutAt + 1; dates.length = cutAt + 1; }
  return {
    id: cls + "|" + noise + "|" + seed + (mid ? "|mid" : "") + (LB ? "|B" : ""), closes, dates, mid, layout: LB ? "B" : "A",
    truth: { cls, expect: C.expect, motive: C.motive, negativeOf: C.negativeOf || null, unsupported: !!C.unsupported, dir,
             topIdx, topPrice: tgt.top.map((p) => p[1]), subIdx, contextTopIdx: map(ctx.top), patternEnd: topIdx[topIdx.length - 1], legs: shapeW.length, sizePct: g, confIdx: map(confPts), cutAt }
  };
}

/** Feste Splits (vorab registriert). */
export const SPLITS = { DEVELOPMENT: [0, 9], VALIDATION: [10, 19], HOLDOUT: [20, 29], HOLDOUT2: [40, 49] };   // HOLDOUT2: nur Layout B (Aenderung 1)
export const NOISES = ["none", "low", "medium", "high"];
export function seedsOf(split) { const [a, b] = SPLITS[split]; const out = []; for (let s = a; s <= b; s++) out.push(s); return out; }

/**
 * Beobachtbare Wahrheit (Mission III, Fehler-Taxonomie): Rauschen und der Kontext verschieben das sichtbare Kursextrem gegenueber
 * dem erzeugten Pivot. Ein Analyst (und die Regel "Wellen beginnen und enden an Extremen", EWP Kap. 1) zaehlt am sichtbaren
 * Extrem. Je Musterpivot k: Extrem in Pivotrichtung im Fenster ±35 % der angrenzenden Wellendauer (am Ursprung nach links mit der
 * Dauer von Welle 1, am Ende nach rechts hoechstens bis zum Auswertungszeitpunkt). Gibt die Pivots zurueck; die Gueltigkeit
 * (Regeln auf den sichtbaren Kursen) prueft der Aufrufer.
 */
export function observedPivots(cs, share = 0.35) {
  const T = cs.truth.topIdx, c = cs.closes, d = cs.truth.dir, last = c.length - 1, out = [];
  for (let k = 0; k < T.length; k++) {
    const dl = k > 0 ? T[k] - T[k - 1] : T[1] - T[0], dr = k < T.length - 1 ? T[k + 1] - T[k] : T[k] - T[k - 1];
    const lo = Math.max(0, k > 0 ? Math.max(out[k - 1] + 1, T[k] - Math.floor(share * dl)) : T[k] - Math.floor(share * dl));
    const hi = Math.min(last, k < T.length - 1 ? T[k] + Math.floor(share * dr) : T[k] + Math.floor(share * dr));
    const low = (k % 2 === 0) === (d > 0);           // Pivot 0 ist Tief bei Aufwaertsmuster
    let best = Math.min(Math.max(T[k], lo), hi);
    for (let i = lo; i <= hi; i++) if (low ? c[i] < c[best] : c[i] > c[best]) best = i;
    out.push(best);
  }
  return out;
}

