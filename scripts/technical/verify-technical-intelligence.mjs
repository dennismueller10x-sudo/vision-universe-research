#!/usr/bin/env node
/* VU Technical Intelligence — Drift-Pruefung der veroeffentlichten API v3.

   Rechnet die Referenztitel (Tagesdaten) und eine feste Stichprobe der
   Wochenreihen mit der aktuellen Engine neu und vergleicht Ausblick,
   Szenarien und Konfidenz mit den Shards. Abweichung = Engine oder Methodik
   wurde geaendert, ohne die Daten neu zu bauen (oder umgekehrt).
   Verglichen wird nur bei GLEICHEM Datenstand (letzte Bar der Eingabe = veroeffentlichter Stand).
   Auf main erneuert der Marktlauf die Golden-Tagesdaten jede Nacht und long-series.yml die Wochenreihen;
   bis technical-intelligence-build.yml nachgebaut hat, sind diese Titel "neuere Daten", keine Drift.
   Schreibt nichts. Exit 1 bei Drift. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "./lib/ti-data.mjs";
import { analyzeProduct } from "./lib/ti-product.mjs";

const require = createRequire(import.meta.url);
const TI = require(join(ROOT, "quant/engines/technical/ti/engine.js"));
const V2 = join(ROOT, "quant/data/technical-intelligence/v3");
const EVID = join(ROOT, "quant/data/technical-intelligence/evidence");
if (!existsSync(join(V2, "meta.json"))) { console.log("Keine TI-Daten veroeffentlicht — nichts zu pruefen."); process.exit(0); }
const meta = readJson(join(V2, "meta.json"));
if (meta.sources && /work-dir/.test(meta.sources.daily)) { console.log("Daten stammen aus der kanonischen Historie (CI) — lokal nicht nachrechenbar, nur Schema geprueft."); process.exit(0); }
const table = (f) => { if (!existsSync(join(EVID, f))) return null; const e = readJson(join(EVID, f)); return { setups: e.setups, calibration: { passed: !!e.calibration.passed } }; };
const ev1W = table("evidence-1W.json"), ev1D = table("evidence-1D-golden.json");
const shard = {};
const get = (t) => { const k = (t + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_"); if (!shard[k]) { const f = join(V2, "shards", k + ".json.gz"); shard[k] = existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f)).toString()).instruments : {}; } return shard[k][t]; };
const key = (a) => JSON.stringify({ o: a.outlook, s: (a.scenarios || []).map((s) => [s.kind, s.direction, s.template, s.entryZone && [s.entryZone.zoneLow, s.entryZone.zoneHigh], s.invalidation && s.invalidation.price, (s.targets || []).map((z) => [z.zoneLow, z.zoneHigh])]), c: a.confidence.overall });
let checked = 0, newer = 0, drift = [];
const last = (s) => s.timestamps[s.length - 1];
const gdir = join(ROOT, "quant/data/market/golden-preview/daily");
for (const f of readdirSync(gdir).filter((x) => x.endsWith(".json"))) {
  const j = readJson(join(gdir, f)), s = dailySeriesFromPayload(j, j.ticker), pub = get(j.ticker);
  if (!pub) { drift.push(j.ticker + ": fehlt"); continue; }
  if (last(s) !== pub.asOf) { newer++; continue; }
  const res = analyzeProduct(s, { evidenceTable: ev1D, weeklyEvidenceTable: ev1W, calibration: ev1D && ev1D.calibration, symbol: j.ticker }).res;
  if (key(res) !== key(pub)) drift.push(j.ticker + " (Tag)"); checked++;
}
const wdir = join(ROOT, "quant/data/market/discover-series-long");
const EVERY = (() => { const i = process.argv.indexOf("--every"); return i >= 0 ? +process.argv[i + 1] : 400; })();   // Mission III §38: --every 50 ≈ 130 Titel
const sample = readdirSync(wdir).filter((f) => f.startsWith("ref_")).sort().filter((_, i) => i % EVERY === 7);
for (const f of sample) {
  const j = readJson(join(wdir, f)), pub = get(j.ticker);
  if (!pub || pub.timeframe !== "1W") continue;
  const s = weeklySeriesFromPoints(j.points || [], j.ticker);
  if (last(s) !== pub.asOf) { newer++; continue; }
  const res = analyzeProduct(s, { evidenceTable: ev1W, calibration: ev1W && ev1W.calibration, symbol: j.ticker }).res;
  if (key(res) !== key(pub)) drift.push(j.ticker + " (Woche)"); checked++;
}
if (drift.length) { console.error("DRIFT bei " + drift.length + " von " + checked + " Titeln: " + drift.join(", ") + "\nDaten neu bauen: node scripts/technical/build-technical-intelligence.mjs"); process.exit(1); }
if (!checked) console.log("Hinweis: kein Titel mit gleichem Datenstand (" + newer + " mit neueren Eingabedaten) — Produktdaten neu bauen (technical-intelligence-build.yml).");
console.log("OK — " + checked + " Titel stimmen mit der Engine ueberein" + (newer ? "; " + newer + " mit neueren Eingabedaten nicht verglichen." : "."));
