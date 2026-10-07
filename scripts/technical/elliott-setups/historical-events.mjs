#!/usr/bin/env node
/* =========================================================================
   VU MISSION X — Stufe A: historische Setup-Ereignisse (versiegelt, OHNE Outcomes)

   Liest die versiegelten HSAB-Wochenrecords (Erkennungspunkte), filtert Setup-Kandidaten ueber den kompakten
   Elliott-Zustand, rechnet die eingefrorene Engine NUR an diesen Punkten neu (Projektionen, Wellenpreise)
   und klassifiziert mit setup-library.mjs. Erstes Auftreten je (Titel, Elliott-Zaehlung).
   Prueft je Ereignis, dass die Neuberechnung dieselbe Zaehlung liefert wie der versiegelte Record.

     node scripts/technical/elliott-setups/historical-events.mjs --records DIR --weekly-dir DIR --bucket 0/2 [--part k/m] --out FILE.jsonl.gz
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ROOT, readJson, weeklySeriesFromPoints } from "../lib/ti-data.mjs";
import * as Core from "../hsab/lib/replay-core.mjs";
import { PRODUCT_METHODOLOGY } from "../lib/ti-product.mjs";
import { classify, familyOfSummary, researchInternalWave3, SPEC_SHA256, LIBRARY_VERSION } from "./setup-library.mjs";

const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const symHash = (s) => parseInt(sha("hsab|" + s).slice(0, 8), 16);
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }

export function candidates(dir, bucket, part) {
  const man = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const [ba, bb] = bucket.split("/").map(Number), [pa, pb] = (part || "0/1").split("/").map(Number);
  const by = new Map(), seen = new Set(); let dp = 0;
  for (const sh of man.shards) {
    const buf = readFileSync(join(dir, sh.file)); if (sha(buf) !== sh.sha256) throw new Error("Siegel verletzt: " + sh.file);
    for (const line of gunzipSync(buf).toString("utf8").split("\n")) {
      if (!line) continue; const r = JSON.parse(line);
      if (!r.dp || symHash(r.s) % bb !== ba || symHash("part|" + r.s) % pb !== pa) continue; dp++;
      const fam = familyOfSummary(r.ew); if (!fam) continue;
      /* Erstes Auftreten je Zaehlung (ENGINE_PRIMARY) und zusaetzlich erstes ANGEZEIGTES Auftreten (PURE), falls spaeter */
      const key = r.s + "|" + (r.ew.key || "i" + r.i), kd = key + "|shown";
      const first = !seen.has(key), firstShown = !r.ew.ab && !seen.has(kd);
      if (!first && !firstShown) continue;
      seen.add(key); if (!r.ew.ab) seen.add(kd);
      let a = by.get(r.s); if (!a) by.set(r.s, (a = [])); a.push({ i: r.i, d: r.d, key: r.ew.key, fam, ab: r.ew.ab, first: first ? 1 : 0, firstShown: firstShown ? 1 : 0, ms: r.v ? r.v.STRUCTURE ?? null : null });
    }
  }
  return { man, by, dp };
}

function main() {
  const out = arg("out"), wdir = arg("weekly-dir"), bucket = arg("bucket", "0/2"), part = arg("part", "0/1");
  const { man, by, dp } = candidates(arg("records"), bucket, part);
  const rows = []; let n = 0, keyMismatch = 0;
  const t0 = Date.now();
  for (const [sym, list] of by) {
    const x = readJson(join(wdir, sym + ".json")); const s = weeklySeriesFromPoints(x.points || [], x.ticker); const P = Core.prepareSeries(s);
    const atrCol = P.main.features.columns.atr;
    for (const c of list) {
      const E = EV3.analyzeElliottV3({ series: s, features: P.main.features, pivots: P.main.pivots, asOfIndex: c.i, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: PRODUCT_METHODOLOGY, forensics: true, debugAll: true });
      if ((E.primary && E.primary.persistenceKey) !== c.key) keyMismatch++;
      const inst = classify(E, { px: s.close[c.i], atr: atrCol[c.i], trend: null, rsQ: null, msVote: c.ms });
      const rw3 = researchInternalWave3(E, s.close, c.i);
      rows.push({ s: sym, i: c.i, d: c.d, px: s.close[c.i], atr: atrCol[c.i], ms: c.ms, key: c.key, first: c.first, firstShown: c.firstShown, inst, rw3: rw3 && rw3.qualifies ? 1 : 0 });
      if (++n % 2000 === 0) console.log(`[setup-events] ${n} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }
  const body = gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join("\n")));
  writeFileSync(out, body);
  const meta = { schemaVersion: "elliott-setup-events-1.0.0", library: LIBRARY_VERSION, specSha256: SPEC_SHA256, records: { sealHash: man.sealHash, engine: man.engine }, bucket, part,
                 detectionPoints: dp, candidates: n, keyMismatch, sha256: sha(body), generatedAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000) };
  writeFileSync(out.replace(/\.jsonl\.gz$/, ".meta.json"), JSON.stringify(meta, null, 1));
  console.log(`[setup-events] ${n} Kandidaten aus ${dp} Erkennungspunkten, Zaehlungs-Abweichung ${keyMismatch}, ${meta.seconds} s`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
