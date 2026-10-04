/* =========================================================================
   VISION UNIVERSE VORSORGE — fetch-sec-sic.mjs

   SIC-CODES (Wirtschaftszweig nach SEC) FUER DIE AKTIEN DES VU-STAMMS

   Quelle: SEC EDGAR Bulk "submissions.zip" (gemeinfrei). Eine Anfrage,
   daraus nur die Dateien CIK##########.json der benoetigten Emittenten
   (Ticker -> CIK aus quant/data/universe/cik-map.json, nur gelesen).
   Ausgabe: vorsorge/data/sources/sec-sic.json  { ticker: [sic, cik] }

   Die Zuordnung SIC -> Sektor (etf-holdings.js: sicSector) ist eine
   Naeherung und wird in der Oberflaeche als "Wirtschaftszweig (SEC-SIC)"
   bezeichnet - nicht als GICS.

   GitHub Actions, Teil des Markers [vorsorge-nport].
   ========================================================================= */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORK = join(root, ".market-cache/vorsorge/sic");
const UA = process.env.SEC_USER_AGENT || "VisionUniverseResearch info@visionuniverse.de";
mkdirSync(WORK, { recursive: true });
const cikMap = JSON.parse(readFileSync(join(root, "quant/data/universe/cik-map.json"), "utf8"));
const byCik = new Map();
for (const [t, v] of Object.entries(cikMap)) if (v && typeof v === "object" && v.cik && /^\d{10}$/.test(v.cik)) { const l = byCik.get(v.cik) || []; l.push(t); byCik.set(v.cik, l); }
console.log("Emittenten:", byCik.size);
const zip = join(WORK, "submissions.zip");
if (!existsSync(zip)) {
  const res = await fetch("https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(1800000) });
  if (!res.ok) throw new Error("submissions.zip HTTP " + res.status);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
}
const names = [...byCik.keys()].map((c) => "CIK" + c + ".json");
const out = join(WORK, "x"); mkdirSync(out, { recursive: true });
for (let i = 0; i < names.length; i += 400) spawnSync("unzip", ["-o", "-qq", zip, ...names.slice(i, i + 400), "-d", out], { stdio: "ignore" });
const result = {}; let n = 0;
for (const f of readdirSync(out)) {
  try {
    const j = JSON.parse(readFileSync(join(out, f), "utf8"));
    const cik = f.slice(3, 13), sic = j.sic ? Number(j.sic) : null;
    if (!sic) continue;
    for (const t of byCik.get(cik) || []) { result[t] = [sic, cik]; n++; }
  } catch { /* defekte Datei */ }
}
const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
mkdirSync(join(root, "vorsorge/data/sources"), { recursive: true });
writeFileSync(join(root, "vorsorge/data/sources/sec-sic.json"), JSON.stringify({ schemaVersion: "vu-sec-sic-1.0.0", source: "SEC EDGAR submissions (bulk), public domain", generatedAt: new Date().toISOString(), count: n, map: sorted }));
rmSync(out, { recursive: true, force: true });
console.log("SIC fuer", n, "Ticker");
