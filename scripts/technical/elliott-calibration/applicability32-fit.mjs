/* Anwendbarkeit 3.2 — logistische Eichung auf Korpus DEVELOPMENT (Layouts A, B, C1, C3; je Layout gleich gewichtet durch
   Stichprobe gleicher Groesse), Ziel: Hauptzaehlung strukturell richtig. Schwelle HOCH so, dass die falsche Sicherheit im
   Entwicklungssplit hoechstens 15 % betraegt (Mission III §20: HOCH konservativ); MITTEL so, dass sie hoechstens 40 % betraegt.
   Merkmale: [1, Zaehlqualitaet, Klarheit (nur Strukturmehrdeutigkeit), z/4, Strukturmehrdeutigkeit, laufend, Hierarchie-Widerspruch,
   Proportion, laufend × Wellenanteil]. Aufruf: node …/applicability32-fit.mjs [SPLIT] (liest $VU_CALIB_DIR/appl32-SPLIT-*.json) */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
const require = createRequire(import.meta.url);
const S = require("../lib/validation-stats.cjs");
const DIR = (process.env.VU_CALIB_DIR || tmpdir()) + "/";
/* Red-Team 3.2 M2: das Strukturmehrdeutigkeits-Merkmal (Index 4) ist fest 0 (sonst bewertete das Modell Lesarten MIT konkurrierender
   Alternative hoeher als ohne); geeicht wird nur auf abgeschlossenen Mustern — laufende Zaehlungen sind ohnehin hoechstens NIEDRIG. */
export const feat = (r) => [1, r.q, r.amb === "STRUCTURE" ? Math.min(1, Math.max(0, r.clarity || 0) / 0.15) : 1, Math.min(4, r.z || 0) / 4, 0, r.complete ? 0 : 1,
                            r.hier === undefined || r.hier === null ? 0 : 1 - r.hier, r.prop === undefined || r.prop === null ? 0.5 : r.prop, r.complete ? 0 : (r.waveFrac || 0)];
function load(split, layouts) { const out = {}; for (const L of layouts) { const f = DIR + "appl32-" + split + "-" + L + ".json"; if (existsSync(f)) out[L] = JSON.parse(readFileSync(f)).filter((r) => r.q != null && !r.mid); } return out; }
if (import.meta.url === "file://" + process.argv[1]) {
  const by = load("DEVELOPMENT", ["A", "B", "C1", "C3"]);
  const nmin = Math.min(...Object.values(by).map((a) => a.length));
  const train = []; for (const a of Object.values(by)) { const step = a.length / nmin; for (let k = 0; k < nmin; k++) train.push(a[Math.floor(k * step)]); }
  const X = train.map(feat), y = train.map((r) => (r.hit ? 1 : 0));
  const beta = Array.from(S.fitLogit(X, y, 1)).map((v) => +v.toFixed(3));
  console.log("coef", JSON.stringify(beta), "n", train.length);
  const p = (r) => 1 / (1 + Math.exp(-feat(r).reduce((a, x, k) => a + x * beta[k], 0)));
  /* Schwellen ueber die Trainingsmenge (alle Faelle inkl. laufend und negativ): falsche Sicherheit = Anteil falscher Hauptzaehlungen */
  const scored = train.map((r) => [p(r), r.hit]).sort((a, b) => b[0] - a[0]);
  const thFor = (maxFalse) => { let best = 1, n = 0, h = 0; for (const [pv, hit] of scored) { n++; if (hit) h++; if (n >= 30 && 1 - h / n <= maxFalse) best = pv; } return +best.toFixed(3); };
  const high = Math.max(0.5, thFor(0.15)), mod = Math.min(high, Math.max(0.3, thFor(0.40)));
  console.log("thresholds high", high, "moderate", mod);
  for (const [L, a] of Object.entries(by)) {
    const H = a.filter((r) => p(r) >= high), M = a.filter((r) => p(r) >= mod && p(r) < high);
    const fh = (s) => s.length ? (100 * (1 - s.filter((r) => r.hit).length / s.length)).toFixed(1) + "%/" + s.length : "-/0";
    console.log(L.padEnd(3), "HIGH false", fh(H), "(end", fh(H.filter((r) => !r.mid)) + ", dev", fh(H.filter((r) => r.mid)) + ")", "MOD false", fh(M), "| hits covered by HIGH+MOD", a.filter((r) => r.hit && p(r) >= mod).length + "/" + a.filter((r) => r.hit).length);
  }
}
if (import.meta.url === "file://" + process.argv[1] && process.argv.includes("--curve")) {
  const by = load("DEVELOPMENT", ["A", "B", "C1", "C3"]);
  const beta = JSON.parse(process.argv[process.argv.indexOf("--curve") + 1]);
  const p = (r) => 1 / (1 + Math.exp(-feat(r).reduce((a, x, k) => a + x * beta[k], 0)));
  for (const th of [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) console.log("p>=" + th, Object.entries(by).map(([L, a]) => { const s = a.filter((r) => p(r) >= th); return L + " " + (s.length ? (100 * (1 - s.filter((r) => r.hit).length / s.length)).toFixed(0) : "-") + "%/" + s.length; }).join("  "));
}
