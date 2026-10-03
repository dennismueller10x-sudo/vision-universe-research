import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const S = require("../lib/validation-stats.cjs");
const SP = (process.env.VU_CALIB_DIR || tmpdir()) + "/";
const rows = JSON.parse(readFileSync(SP + "appl-DEVELOPMENT.json")).filter((r) => !r.uns && r.q != null);
const feat = (r) => [1, r.q, r.amb === "STRUCTURE" ? Math.min(1, Math.max(0, r.clarity || 0) / 0.15) : 1, Math.min(4, r.z || 0) / 4, r.amb === "STRUCTURE" ? 1 : 0, r.complete ? 0 : 1];
const X = rows.map(feat), y = rows.map((r) => (r.hit ? 1 : 0));
const fit = Array.from(S.fitLogit(X, y, 1));
console.log("coef", JSON.stringify(fit.map((v) => +v.toFixed(3))));
const beta = fit;
const p = rows.map((r) => 1 / (1 + Math.exp(-feat(r).reduce((a, x, k) => a + x * beta[k], 0))));
const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
for (const th of [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) {
  const sel = rows.filter((_, i) => p[i] >= th), end = sel.filter((r) => r.cut === "end" && !r.neg);
  console.log("p>=" + th, "n", sel.length, "prec", (sel.filter((r) => r.hit).length / Math.max(1, sel.length)).toFixed(2), "endPos n", end.length, "prec", (end.filter((r) => r.hit).length / Math.max(1, end.length)).toFixed(2), "share all", (sel.length / rows.length).toFixed(2));
}
/* G7-Definition: Ende-Faelle, unterstuetzte Klassen, alle Rauschstufen: Anteil falscher Hauptzaehlungen unter HOCH */
const endRows = rows.filter((r) => r.cut === "end" && !r.neg);
for (const th of [0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8]) {
  const sel = endRows.filter((r) => 1 / (1 + Math.exp(-feat(r).reduce((a, x, k) => a + x * beta[k], 0))) >= th);
  console.log("G7@" + th, "nHigh", sel.length, "falseCertainty", (1 - sel.filter((r) => r.hit).length / Math.max(1, sel.length)).toFixed(3), "share of end", (sel.length / endRows.length).toFixed(2));
}
