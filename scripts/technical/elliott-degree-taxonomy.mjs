#!/usr/bin/env node
/* Grad-Fehler-Taxonomie (Remediation §4): Fuer jeden Fall der Audit-Stichprobe, in dem die gewaehlte Analyseskala von der
   Skala des Ereignisses abweicht — WARUM? Objektive Merkmale je Skala (Rangwert der besten Lesart, Signal/Rauschen, Zahl
   bestaetigter Legs, Persistenz), daraus regelbasierte Klassen. Kein Optimierungsdatensatz.
   Aufruf: node scripts/technical/elliott-degree-taxonomy.mjs [--engine-opts JSON] */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const audit = JSON.parse(readFileSync(join(ROOT, "quant/research/elliott-audit/data.json"), "utf8"));
const dir = join(ROOT, "quant/data/market/discover-series-long");
const SC = ["scale-1", "scale-2", "scale-3", "scale-4"];
const rows = [];
for (const c of audit.cases) {
  const j = readJson(join(dir, "ref_" + c.symbol + ".json"));
  const s = weeklySeriesFromPoints(j.points || [], j.ticker);
  const t = s.timestamps.indexOf(c.date);
  const P = Ctx.prepare(s);
  let prev = null, E = null, switches = 0, lastScale = null;
  for (let k = Math.max(1, t - 52); k <= t; k++) {
    E = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, asOfIndex: k, barsPerYear: 52, previous: prev });
    if (lastScale && E.degrees.analysis !== lastScale) switches++;
    lastScale = E.degrees.analysis;
    prev = E.primary ? { key: E.primary.persistenceKey, scaleId: E.degrees.analysis } : null;
  }
  /* ohne Persistenz, jede Skala erzwungen */
  const per = {};
  for (const id of SC) {
    const F = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52, methodology: { engine: { analysisScale: id } } });
    const legs = P.pivots.scales[id].pivots.filter((p) => p.confirmedIndex <= t).length - 1;
    const snr = EV2.signalToNoise(s, P.features, P.pivots, id, t);
    per[id] = { legs, rank: F.primary ? F.primary.rank : null, pattern: F.primary ? F.primary.pattern + (F.primary.complete ? "(C)" : "/" + F.primary.currentWave.label) : F.reason,
                snr: snr ? snr.ratio : null, legBars: F.primary ? Math.round(F.primary.waves.reduce((a, w) => a + (w.toIndex - w.fromIndex), 0) / F.primary.waves.length) : null };
  }
  const free = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, asOfIndex: t, barsPerYear: 52 });
  const considered = Object.fromEntries((E.degrees.considered || []).map((x) => [x.scaleId, x.score]));
  const chosen = E.degrees.analysis, ev = c.scaleEvent, d = SC.indexOf(chosen) - SC.indexOf(ev);
  /* Klassen (regelbasiert, a priori formuliert) */
  const cls = [];
  if (d !== 0) {
    if (free.degrees.analysis !== chosen) cls.push("PERSISTENCE_HELD_OLD_DEGREE");
    const sEv = considered[ev], sCh = considered[chosen];
    if (sEv === undefined) cls.push(per[ev].legs < 5 ? "EVENT_SCALE_TOO_FEW_LEGS" : "EVENT_SCALE_NOT_CONSIDERED");
    else if (Math.abs(sCh - sEv) < 0.03) cls.push("MULTIPLE_VALID_DEGREES");
    if (d < 0 && per[chosen].snr !== null && per[chosen].snr < 2.0) cls.push("NOISY_SUBDIVISION_CHOSEN");
    if (d > 0 && considered[ev] !== undefined && per[ev].rank !== null && per[chosen].rank !== null && per[chosen].rank > per[ev].rank) cls.push("COARSER_COUNT_FITS_BETTER");
    if (d > 0 && considered[ev] !== undefined && per[chosen].rank !== null && per[ev].rank !== null && per[chosen].rank <= per[ev].rank) cls.push("COARSER_PREFERENCE_OR_SNR_WEIGHT");
    if (d < 0 && per[chosen].rank !== null && per[ev].rank !== null && per[chosen].rank > per[ev].rank + 0.03) cls.push("FINER_COUNT_FITS_BETTER");
    if (!cls.length) cls.push("UNCLASSIFIED");
  }
  rows.push({ id: c.id, symbol: c.symbol, date: c.date, eventScale: ev, chosen, freeChoice: free.degrees.analysis, delta: d, switches52w: switches, considered, per, classes: cls });
}
const conf = {}; rows.forEach((r) => { const k = r.eventScale + "→" + r.chosen; conf[k] = (conf[k] || 0) + 1; });
const classes = {}; rows.filter((r) => r.delta !== 0).forEach((r) => r.classes.forEach((k) => { classes[k] = (classes[k] || 0) + 1; }));
const out = { schemaVersion: "vu-elliott-degree-taxonomy-1.0.0", generatedAt: new Date().toISOString(), engine: EV2.ENGINE_VERSION,
  note: "Ereignisskala = feinste Skala, auf der das generische Ruecklauf-Ereignis erkannt wurde (Studienkonvention). Sie ist KEIN Grad-Goldstandard; die Taxonomie beschreibt, warum die Engine anders waehlt.",
  confusion: conf, classes, rows };
writeFileSync(join(ROOT, "quant/data/technical-intelligence/elliott-validation/degree-taxonomy-2.2.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ confusion: conf, classes }, null, 1));
