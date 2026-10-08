/* =========================================================================
   SYNTHETISCHER ELLIOTT-GENERATOR (Master Mission II §103/104)

   Erzeugt kontrollierte Kursreihen mit bekannter Wellenstruktur:
   Impuls (normal, W3- und W5-Extension, Truncation), Leading/Ending
   Diagonal, Zigzag, Flat (regulaer, expandiert, running), Dreieck,
   Doppel-Zigzag — jeweils mit optional sichtbarer Unterteilung (5/3) und
   Rauschen (low / medium / high).

   Grossenordnungen (Tages-Skalen der Pivot-Engine 2/4/8/15 %):
     Hauptwellen 15–45 % → sichtbar auf scale-3
     Unterwellen-Korrekturen 5,5 % → sichtbar auf scale-2, nicht scale-3
   Vor jedes Muster wird ein Kontext aus vier Schwuengen gesetzt, damit
   die Engine genug bestaetigte Legs fuer eine Analyse hat; danach folgt
   eine Gegenbewegung, die das letzte Musterende bestaetigt.
   ========================================================================= */
import { fixtures } from "./technical-fixtures.mjs";

/** Muster als Folge relativer Bewegungen (Anteil des Kurses, Vorzeichen = Richtung) mit Unterteilung. */
export const PATTERNS = {
  IMPULSE:            { family: "MOTIVE", legs: [[0.30, 5], [-0.62, 3], [1.618, 5], [-0.382, 3], [1.0, 5]], rel: true },
  IMPULSE_EXT3:       { family: "MOTIVE", legs: [[0.25, 5], [-0.5, 3], [2.618, 5], [-0.236, 3], [1.0, 5]], rel: true },
  IMPULSE_EXT5:       { family: "MOTIVE", legs: [[0.25, 5], [-0.5, 3], [1.2, 5], [-0.382, 3], [2.0, 5]], rel: true },
  IMPULSE_EXT1:       { family: "MOTIVE", legs: [[0.45, 5], [-0.4, 3], [0.75, 5], [-0.3, 3], [0.4, 5]], rel: true, expect: ["IMPULSE"] },
  IMPULSE_TRUNCATED:  { family: "MOTIVE", legs: [[0.25, 5], [-0.5, 3], [1.8, 5], [-0.3, 3], [0.4, 5]], rel: true, truncated: true },
  LEADING_DIAGONAL:   { family: "MOTIVE", legs: [[0.30, 5], [-0.6, 3], [0.85, 5], [-0.65, 3], [0.6, 5]], rel: true, expect: ["LEADING_DIAGONAL", "ENDING_DIAGONAL"] },
  ENDING_DIAGONAL:    { family: "MOTIVE", legs: [[0.30, 3], [-0.6, 3], [0.85, 3], [-0.65, 3], [0.6, 3]], rel: true, expect: ["ENDING_DIAGONAL", "LEADING_DIAGONAL"] },
  ZIGZAG:             { family: "CORRECTIVE", legs: [[-0.25, 5], [-0.5, 3], [1.0, 5]], rel: true },
  FLAT_REGULAR:       { family: "CORRECTIVE", legs: [[-0.25, 3], [-0.95, 3], [1.05, 5]], rel: true, expect: ["FLAT"] },
  FLAT_EXPANDED:      { family: "CORRECTIVE", legs: [[-0.25, 3], [-1.2, 3], [1.618, 5]], rel: true, expect: ["FLAT"] },
  FLAT_RUNNING:       { family: "CORRECTIVE", legs: [[-0.25, 3], [-1.15, 3], [0.8, 5]], rel: true, expect: ["FLAT"] },
  TRIANGLE:           { family: "CORRECTIVE", legs: [[-0.25, 3], [-0.8, 3], [0.8, 3], [-0.8, 3], [0.8, 3]], rel: "prev", expect: ["TRIANGLE"] },
  TRIANGLE_EXPANDING: { family: "CORRECTIVE", legs: [[-0.12, 3], [-1.25, 3], [1.25, 3], [-1.25, 3], [1.25, 3]], rel: "prev", expect: ["TRIANGLE"] },
  DOUBLE_THREE:       { family: "CORRECTIVE", legs: [[-0.25, 3], [-0.5, 3], [1.0, 3]], rel: true, expect: ["WXY"] },
  DOUBLE_ZIGZAG:      { family: "CORRECTIVE", legs: [[-0.2, 5], [-0.5, 3], [1.0, 5], [-0.4, 3], [1.0, 5], [-0.5, 3], [1.0, 5]], rel: "dz", expect: ["DOUBLE_ZIGZAG", "WXY"] }
};

/**
 * Pivotpunkte eines Musters inkl. Kontext.
 * rel=true: Wellen 2.. relativ zur Laenge von Welle 1 (Retracement/Extension); "prev": relativ zur Vorwelle.
 */
export function patternPoints(name, opts = {}) {
  const spec = PATTERNS[name], subVisible = opts.subdivide !== false;
  let v = opts.start || 100, i = 0;
  const top = [[0, v]];
  /* Kontext: vier Schwuenge, die mit einer Gegenbewegung zur Musterrichtung enden. */
  const dir1 = Math.sign(spec.legs[0][0]);
  [0.2, 0.16, 0.18, 0.2].forEach((size, k) => { const sg = k % 2 === 0 ? dir1 : -dir1; v *= 1 + sg * size; i += 30; top.push([i, +v.toFixed(4)]); });
  /* Musterwellen */
  const waveLens = [];
  let w1 = Math.abs(spec.legs[0][0]) * v;
  spec.legs.forEach(([m], k) => {
    let L;
    if (k === 0) L = w1;
    else if (spec.rel === "prev") L = Math.abs(m) * waveLens[k - 1];
    else if (spec.rel === "dz") L = Math.abs(m) * (k === 3 ? waveLens[2] : k >= 4 ? (k === 4 ? w1 : k === 5 ? waveLens[4] : waveLens[4]) : k === 1 ? w1 : w1);
    else L = Math.abs(m) * (k === 3 ? waveLens[2] : w1);
    waveLens.push(L);
  });
  const subs = [];
  spec.legs.forEach(([m, sub], k) => {
    const sgn = k === 0 ? Math.sign(m) : (k % 2 === 1 ? -Math.sign(spec.legs[0][0]) : Math.sign(spec.legs[0][0]));
    const L = waveLens[k], n = Math.max(15, Math.round(L / v * 220));
    const target = v + sgn * L;
    if (subVisible && (sub === 5 || sub === 3) && L / v > 0.12) {
      const c = 0.055 * v, g = L + (sub === 5 ? 2 : 1) * c;
      const moves = sub === 5 ? [0.35 * g, -c, 0.45 * g, -c, 0.2 * g] : [0.55 * g, -c, 0.45 * g];
      const per = Math.round(n / moves.length);
      let u = v;
      for (const mv of moves) { u += sgn * mv; i += per; top.push([i, +u.toFixed(4)]); }
      v = u;
    } else { i += n; v = target; top.push([i, +v.toFixed(4)]); }
    subs.push(top.length - 1);
  });
  const patternEnd = top.length - 1;
  /* Bestaetigung des Musterendes: Gegenbewegung ~ 18 % */
  const lastDir = Math.sign(top[patternEnd][1] - top[patternEnd - 1][1]);
  i += 25; v = v * (1 - lastDir * 0.18); top.push([i, +v.toFixed(4)]);
  return { points: top, patternEnd, waveEndPointIdx: subs };
}

/** Seeded Gauss-Rauschen (multiplikativ) auf die Schlusskurse. */
const NOISE = { none: 0, low: 0.003, medium: 0.01, high: 0.025 };
export function syntheticSeries(name, opts = {}) {
  const pp = patternPoints(name, opts);
  const s = fixtures.piecewise(pp.points, { seed: "syn-" + name + "-" + (opts.noise || "low") + "-" + (opts.seed || 0), rangePct: 0.002, instrumentId: "SYN_" + name });
  const sigma = NOISE[opts.noise || "low"];
  if (sigma > 0) {
    let st = 2166136261; for (const ch of name + (opts.seed || 0)) { st ^= ch.charCodeAt(0); st = Math.imul(st, 16777619) >>> 0; }
    const rnd = () => { st += 0x6d2b79f5; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
    for (let k = 0; k < s.length; k++) {
      const f = 1 + sigma * gauss();
      s.close[k] *= f; s.open[k] *= f; s.high[k] = Math.max(s.high[k] * f, s.close[k], s.open[k]); s.low[k] = Math.min(s.low[k] * f, s.close[k], s.open[k]);
    }
  }
  const patternEndIndex = pp.points[pp.patternEnd][0];
  return { series: s, patternEndIndex, points: pp.points, expect: PATTERNS[name].expect || [name.startsWith("IMPULSE") ? "IMPULSE" : name] };
}
