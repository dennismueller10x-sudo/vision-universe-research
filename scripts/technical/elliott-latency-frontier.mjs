#!/usr/bin/env node
/* Erkennungsverzug vs. Genauigkeit (Remediation §45–§47, nur DEVELOPMENT/VALIDATION):
   Fuer Korpusfaelle mit bekanntem Musterende wird die Engine Woche fuer Woche ab dem wahren Ende (T_end) bis T_end + 20 gerechnet.
     EARLY     erste Woche, in der die richtige abgeschlossene Lesart unter Haupt- oder Alternativzaehlungen steht ("moeglich")
     CONFIRMED erste Woche, in der sie die Hauptzaehlung ist
   Zusaetzlich: Fortschritt der Folgebewegung bei Erkennung (Anteil der Bestaetigungsbewegung) und Fehlalarme vor dem Ende
   (Hauptzaehlung meldet in den 10 Wochen vor T_end ein abgeschlossenes Zielmuster mit falschem Ende).
   Variiert wird die Monowellen-Schwelle poolAtr (Bestaetigungsschwelle in ATR).
   Aufruf: node scripts/technical/elliott-latency-frontier.mjs --split DEVELOPMENT [--k 0.6,0.8,1,1.3,1.6] */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
import { CLASSES, corpusCase, seedsOf } from "../../quant/tests/elliott-corpus.mjs";
import { degreeClass } from "./elliott-corpus-eval.mjs";
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const split = arg("split", "DEVELOPMENT"), ks = arg("k", "0.6,0.8,1,1.3,1.6").split(",").map(Number), sticky = arg("sticky", null) === null ? null : +arg("sticky");
const classes = Object.keys(CLASSES).filter((c) => !CLASSES[c].negativeOf && !CLASSES[c].unsupported);
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const hitOf = (c, cs) => c && c.complete && cs.truth.expect.includes(c.pattern) && degreeClass(c, cs.truth) === "EXACT";
const result = {};
for (const k of ks) {
  const early = [], conf = [], progEarly = [], progConf = []; let n = 0, falseAlarms = 0, preChecks = 0, never = 0;
  for (const cls of classes) for (const nz of ["none", "low", "medium"]) for (const seed of seedsOf(split)) {
    const cs = corpusCase(cls, seed, nz);
    const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "SYN"), P = Ctx.prepare(s);
    const Te = cs.truth.patternEnd, last = s.length - 1, confMove = Math.abs(s.close[last] - s.close[Te]) || 1;
    n++;
    let e = null, c = null, prev = null;
    const eng = sticky === null ? { poolAtr: k } : { poolAtr: k, stickiness: sticky };
    /* mit Persistenz: Zustand ab 26 Wochen vor dem Ende durchreichen (wie im Produkt) */
    if (sticky !== null) for (let t = Math.max(1, Te - 26); t < Te; t++) { const r0 = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, engine: eng, previous: prev }); prev = r0.primary ? { key: r0.primary.persistenceKey, pivots: r0.primary.persistencePivots } : null; }
    for (let t = Te; t <= Math.min(last, Te + 20) && c === null; t++) {
      const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, engine: eng, previous: prev });
      if (sticky !== null) prev = r.primary ? { key: r.primary.persistenceKey, pivots: r.primary.persistencePivots } : null;
      const cands = [r.primary, ...(r.alternatives || [])].filter(Boolean);
      if (e === null && cands.some((x) => hitOf(x, cs))) { e = t - Te; progEarly.push(Math.abs(s.close[t] - s.close[Te]) / confMove); }
      if (c === null && hitOf(r.primary, cs)) { c = t - Te; progConf.push(Math.abs(s.close[t] - s.close[Te]) / confMove); }
    }
    if (e !== null) early.push(e); if (c !== null) conf.push(c); else never++;
    for (let t = Math.max(0, Te - 10); t < Te; t += 3) {
      const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, engine: { poolAtr: k } });
      preChecks++;
      if (r.primary && r.primary.complete && cs.truth.expect.includes(r.primary.pattern) && r.primary.waves[0].fromIndex === cs.truth.topIdx[0] && Math.abs(r.primary.waves[r.primary.waves.length - 1].toIndex - Te) > 2) falseAlarms++;
    }
  }
  result["k=" + k] = { cases: n, earlyFound: early.length, confirmedFound: conf.length, neverConfirmedWithin20: never, medianEarlyBars: med(early), medianConfirmedBars: med(conf),
                       medianProgressAtEarly: med(progEarly) === null ? null : +med(progEarly).toFixed(3), medianProgressAtConfirmed: med(progConf) === null ? null : +med(progConf).toFixed(3),
                       prematureCompletionRate: +(falseAlarms / Math.max(1, preChecks)).toFixed(4) };
  console.log("k=" + k, JSON.stringify(result["k=" + k]));
}
mkdirSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus"), { recursive: true });
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/corpus", "latency-frontier-" + split.toLowerCase() + (sticky === null ? "" : "-sticky" + sticky) + ".json"),
  JSON.stringify({ schemaVersion: "vu-elliott-latency-frontier-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, split, result }, null, 1));
