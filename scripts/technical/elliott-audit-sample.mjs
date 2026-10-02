#!/usr/bin/env node
/* Manuelle Audit-Stichprobe (Addendum §9): 80 Elliott-Zaehlungen aus unterschiedlichen Marktphasen, damit ein Mensch die
   Engine pruefen kann. KEIN Optimierungsdatensatz — die Auswahl ist geschichtet und zufaellig (fester Seed), nicht nach Ergebnis.

   Je Fall: Kurs bis zum Erkennungszeitpunkt (156 Wochen) und getrennt das spaetere Ergebnisfenster (52 Wochen, im Viewer
   erst auf Klick sichtbar), Haupt- und Alternativzaehlung mit Wellen, Regel-Audit, Count-Quality-Zerlegung, Anwendbarkeit,
   Elliott-Label des Ereignisses, Evidenz-Hinweis, spaeteres Ergebnis.
   Engine-Zustand wie im Produkt: Persistenz-Replay ueber 52 Wochen vor dem Zeitpunkt.

   Aufruf: node scripts/technical/elliott-audit-sample.mjs --raw <raw-confirmatory-*.json.gz> */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints } from "./lib/ti-data.mjs";
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV2 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v2.js"));
const Hash = require(join(ROOT, "quant/engines/hash.js"));
function arg(n, d) { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; }
const raw = JSON.parse(gunzipSync(readFileSync(arg("raw"))).toString());
const ev = raw.R.events.filter((e) => e.y === 0 || e.y === 1);
const rand = Hash.mulberry32(Hash.seedFromString("elliott-audit-sample-v1"));
/* Schichten: Zeitblock × Label; je Schicht 5 Faelle (5 Bloecke × 3 Labels × 5 = 75) + 5 aus REV/CONT mit hoher Count Quality */
const strata = {};
ev.forEach((e) => { const k = e.fold + "|" + e.lab; (strata[k] = strata[k] || []).push(e); });
const pick = [];
Object.keys(strata).sort().forEach((k) => { const a = strata[k].slice(); for (let i = 0; i < 5 && a.length; i++) pick.push(a.splice(Math.floor(rand() * a.length), 1)[0]); });
const hi = ev.filter((e) => e.cqLevel === "HIGH" && e.lab === "CONT");
for (let i = 0; i < 5 && hi.length; i++) pick.push(hi.splice(Math.floor(rand() * hi.length), 1)[0]);
const dir = join(ROOT, "quant/data/market/discover-series-long");
const r4 = (v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v);
const slimCount = (c) => c && { pattern: c.patternName, complete: c.complete, wave: c.complete ? null : c.currentWave.label,
  waves: c.waves.map((w) => ({ label: w.label, from: w.fromTime, to: w.toTime, fromPrice: r4(w.fromPrice), toPrice: r4(w.toPrice), status: w.status })),
  invalidation: c.invalidation ? { price: r4(c.invalidation.price), direction: c.invalidation.direction, rule: c.invalidation.ruleId } : null,
  countQuality: c.countQuality, ruleAudit: c.ruleAudit && { validity: c.ruleAudit.validity, hardRules: c.ruleAudit.hardRules, definitions: c.ruleAudit.definitions, vuOperational: c.ruleAudit.vuOperational,
    guidelines: c.ruleAudit.guidelines, dimensions: Object.fromEntries(Object.entries(c.ruleAudit.dimensions).map(([k, v]) => [k, v && v.value !== undefined ? v.value : v])), rules: c.ruleAudit.rules } };
const cases = [];
for (const e of pick) {
  e.symbol = e.symbol || e.sym;
  const j = readJson(join(dir, "ref_" + e.symbol + ".json"));
  const s = weeklySeriesFromPoints(j.points || [], j.ticker);
  const t = s.timestamps.indexOf(e.date);
  if (t < 0) continue;
  const P = Ctx.prepare(s);
  let prev = null, E = null;
  for (let k = Math.max(1, t - 52); k <= t; k++) {
    E = EV2.analyzeElliottV2({ series: s, features: P.features, pivots: P.pivots, asOfIndex: k, barsPerYear: 52, previous: prev });
    prev = E.primary ? { key: E.primary.persistenceKey, scaleId: E.degrees.analysis } : null;
  }
  const from = Math.max(0, t - 155);
  cases.push({
    id: "A" + String(cases.length + 1).padStart(2, "0"), symbol: e.symbol, date: e.date, fold: e.fold, scaleEvent: e.scale,
    event: { direction: e.d > 0 ? "aufwärts" : "abwärts", retracement: e.r, label: e.lab, role: e.role, note: "Rücklauf ≥ 38,2 % des jüngsten Legs; Erfolg = Leg-Ende überschritten, bevor ein Schlusskurs den Leg-Ursprung bricht (52 Wochen)" },
    chart: { dates: s.timestamps.slice(from, t + 1), close: s.close.slice(from, t + 1).map(r4) },
    future: { dates: s.timestamps.slice(t + 1, t + 53), close: s.close.slice(t + 1, t + 53).map(r4) },
    engine: { version: EV2.ENGINE_VERSION, scale: E.degrees.analysis, status: E.status, applicability: E.applicability, primary: slimCount(E.primary), alternative: slimCount(E.alternatives && E.alternatives[0]) },
    evidence: "Elliott: kein Prognosevorteil in der vorab registrierten Prüfung (Kontext).",
    outcome: { success: e.y === 1, barsToOutcome: e.bars, mfeLegs: e.mfeL, maeLegs: e.maeL, randomSameGeometry: e.bA && e.bA.length ? r4(e.bA.reduce((a, b) => a + b, 0) / e.bA.length) : null }
  });
}
const out = { schemaVersion: "vu-elliott-audit-sample-1.0.0", generatedAt: new Date().toISOString(), engine: EV2.ENGINE_VERSION, sample: "Bestätigungsstichprobe, geschichtet nach Zeitblock × Label (je 5) + 5 Fortsetzungen mit hoher Count Quality; Seed fest",
  purpose: "Audit-Set zur menschlichen Prüfung der Engine. Kein Optimierungsdatensatz.", n: cases.length, cases };
mkdirSync(join(ROOT, "quant/research/elliott-audit"), { recursive: true });
writeFileSync(join(ROOT, "quant/research/elliott-audit/data.json"), JSON.stringify(out));
console.log("Audit-Stichprobe:", cases.length, "Fälle", JSON.stringify(cases.reduce((a, c) => { a[c.event.label] = (a[c.event.label] || 0) + 1; return a; }, {})));
