/* =========================================================================
   VISION UNIVERSE TECHNICAL — compare-ema-materialization.mjs

   VORHER/NACHHER-NACHWEIS FUER DIE EINGESCHWUNGENE EMA 20/50/200.

   Vergleicht zwei Ausgabeverzeichnisse von
   scripts/technical/materialize-product-intelligence.mjs (gleiche Historie,
   gleiches --now): "vorher" mit dem alten, "nachher" mit dem neuen Code.

   Behauptung, die hier geprueft wird:
     1. Jedes bestehende Feld ist bitgleich. Geprueft wird, indem aus
        "nachher" genau die neuen Pfade entfernt werden und die
        JSON-Serialisierung dann Byte fuer Byte mit "vorher" uebereinstimmt.
     2. Hinzu kommen NUR diese Pfade (alles andere ist ein Befund):
          bundle.featuresAtCutoff.ema200
          bundle.chartSeries.ema20 / ema50 / ema200
          bundle.emaSettlement
     3. Signal- und Summary-Dateien bleiben gleich (summary bis auf die
        Groessenangaben in artifacts).
   Ausgegeben werden ausserdem Groessen (roh und gzip) und die Kosten je
   neuem Pfad.

   Schreibt nichts ausser optional --out <datei> (JSON-Bericht).

   Ausfuehren:
     node scripts/technical/compare-ema-materialization.mjs <vorher> <nachher> [--out bericht.json]
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const NEW_PATHS = [
  ["bundle", "featuresAtCutoff", "ema200"],
  ["bundle", "chartSeries", "ema20"],
  ["bundle", "chartSeries", "ema50"],
  ["bundle", "chartSeries", "ema200"],
  ["bundle", "emaSettlement"]
];

function removePath(obj, path) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) { if (!cur || typeof cur !== "object") return false; cur = cur[path[i]]; }
  if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, path.at(-1))) return false;
  delete cur[path.at(-1)];
  return true;
}

/** Liste aller Blattpfade, die in b, aber nicht in a existieren (nur Objektschluessel). */
function addedKeys(a, b, prefix = []) {
  const out = [];
  if (!b || typeof b !== "object" || Array.isArray(b)) return out;
  for (const k of Object.keys(b)) {
    if (!a || typeof a !== "object" || !Object.prototype.hasOwnProperty.call(a, k)) out.push(prefix.concat(k).join("."));
    else out.push(...addedKeys(a[k], b[k], prefix.concat(k)));
  }
  return out;
}

export function compareInstrument(before, after) {
  const stripped = JSON.parse(JSON.stringify(after));
  const present = NEW_PATHS.filter((p) => removePath(stripped, p)).map((p) => p.join("."));
  const identical = JSON.stringify(stripped) === JSON.stringify(before);
  const unexpected = addedKeys(before, after).filter((k) => !NEW_PATHS.some((p) => p.join(".") === k));
  return { identical, present, unexpected };
}

export function compareDirs(beforeDir, afterDir) {
  const files = readdirSync(beforeDir).filter((f) => f.endsWith(".json.gz")).sort();
  const afterFiles = readdirSync(afterDir).filter((f) => f.endsWith(".json.gz")).sort();
  const report = { files: [], instruments: 0, identicalInstruments: 0, differing: [], unexpected: [], missingNewPaths: [],
    otherFilesIdentical: true, sizes: { rawBefore: 0, rawAfter: 0, gzBefore: 0, gzAfter: 0 }, costByPath: {},
    addedFiles: afterFiles.filter((f) => !files.includes(f)) };
  for (const f of files) {
    const bBuf = readFileSync(join(beforeDir, f)), aBuf = readFileSync(join(afterDir, f));
    const b = JSON.parse(gunzipSync(bBuf)), a = JSON.parse(gunzipSync(aBuf));
    const rawB = gunzipSync(bBuf).length, rawA = gunzipSync(aBuf).length;
    report.sizes.rawBefore += rawB; report.sizes.rawAfter += rawA; report.sizes.gzBefore += bBuf.length; report.sizes.gzAfter += aBuf.length;
    report.files.push({ file: f, rawBefore: rawB, rawAfter: rawA, gzBefore: bBuf.length, gzAfter: aBuf.length });
    if (!b.instruments) { if (!bBuf.equals(aBuf)) report.otherFilesIdentical = false; continue; }
    const shellB = { ...b, instruments: null }, shellA = { ...a, instruments: null };
    if (JSON.stringify(shellB) !== JSON.stringify(shellA)) report.differing.push(f + ":<shard-huelle>");
    for (const ticker of Object.keys(b.instruments)) {
      report.instruments++;
      const r = compareInstrument(b.instruments[ticker], a.instruments[ticker]);
      if (r.identical) report.identicalInstruments++; else report.differing.push(ticker);
      if (r.unexpected.length) report.unexpected.push({ ticker, paths: r.unexpected });
      if (r.present.length !== NEW_PATHS.length) report.missingNewPaths.push({ ticker, present: r.present });
      for (const p of NEW_PATHS) {
        let cur = a.instruments[ticker];
        for (const k of p) cur = cur == null ? undefined : cur[k];
        if (cur === undefined) continue;
        const key = p.join("."), bytes = Buffer.byteLength(JSON.stringify(cur)) + Buffer.byteLength(JSON.stringify(p.at(-1))) + 2;
        report.costByPath[key] = (report.costByPath[key] || 0) + bytes;
      }
    }
    if (Object.keys(a.instruments).length !== Object.keys(b.instruments).length) report.differing.push(f + ":<anzahl>");
  }
  const sb = join(beforeDir, "summary.json"), sa = join(afterDir, "summary.json");
  if (existsSync(sb) && existsSync(sa)) {
    const x = JSON.parse(readFileSync(sb, "utf8")), y = JSON.parse(readFileSync(sa, "utf8"));
    delete x.artifacts.rawBytes; delete x.artifacts.compressedBytes; delete y.artifacts.rawBytes; delete y.artifacts.compressedBytes;
    report.summaryIdenticalExceptSizes = JSON.stringify(x) === JSON.stringify(y);
  }
  report.sizes.rawGrowth = report.sizes.rawAfter - report.sizes.rawBefore;
  report.sizes.gzGrowth = report.sizes.gzAfter - report.sizes.gzBefore;
  report.sizes.gzGrowthPct = report.sizes.gzBefore ? Math.round(10000 * report.sizes.gzGrowth / report.sizes.gzBefore) / 100 : null;
  report.sizes.gzGrowthPerInstrument = report.instruments ? Math.round(report.sizes.gzGrowth / report.instruments) : null;
  report.verdict = report.instruments > 0 && report.identicalInstruments === report.instruments && !report.unexpected.length &&
    !report.missingNewPaths.length && report.otherFilesIdentical && report.summaryIdenticalExceptSizes !== false &&
    !report.differing.length && !report.addedFiles.length ? "PASS" : "FAIL";
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  const [beforeDir, afterDir] = args.filter((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));
  if (!beforeDir || !afterDir) { console.error("Aufruf: compare-ema-materialization.mjs <vorher> <nachher> [--out datei]"); process.exit(2); }
  const report = compareDirs(beforeDir, afterDir);
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  const { files, ...short } = report;
  console.log(JSON.stringify(short, null, 2));
  if (report.verdict !== "PASS") process.exitCode = 1;
}

