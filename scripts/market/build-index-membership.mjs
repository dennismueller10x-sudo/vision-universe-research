/* =========================================================================
   VISION UNIVERSE — build-index-membership.mjs

   INDEX-MITGLIEDSCHAFT AUS DEN VEROEFFENTLICHTEN FONDSBESTAENDEN

   Holt je Index den Tagesbestand des abbildenden Fonds (Konfiguration:
   quant/config/index-membership.json), parst ihn mit den reinen
   Funktionen aus quant/engines/index-membership.js, ordnet die Ticker dem
   Company Master zu und schreibt je Index eine versionierte Datei:

     quant/data/market/index-membership/<indexId>.json      aktueller Stand
     quant/data/market/index-membership/history/<indexId>/<asOf>.json
     quant/data/market/index-membership/index.json          Verzeichnis

   Kein Netz -> kein neuer Stand; der letzte gute bleibt liegen, und der
   Lauf endet mit Fehler (der Workflow wird rot). Eine Datei, die weniger
   Mitglieder traegt als der Index haben muss (expectedMembers), wird
   nicht geschrieben.

   Aufruf:
     node scripts/market/build-index-membership.mjs                 (alle, aus dem Netz)
     node scripts/market/build-index-membership.mjs --only=SP500
     node scripts/market/build-index-membership.mjs --file=SP500=pfad/zur/datei.csv  (Nachweis ohne Netz)
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";
import { resolveProductUniverse } from "./universe-source.mjs";

const require = createRequire(import.meta.url);
const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const hit = argv.find((a) => a.startsWith(name + "=")); return hit ? hit.slice(name.length + 1) : fallback; };
const args = (name) => argv.filter((a) => a.startsWith(name + "=")).map((a) => a.slice(name.length + 1));

const root = arg("--root", DEFAULT_ROOT);
const ONLY = arg("--only", null);
const NOW = arg("--now", null) ? new Date(arg("--now")) : new Date();
const FILES = Object.fromEntries(args("--file").map((f) => { const i = f.indexOf("="); return [f.slice(0, i), f.slice(i + 1)]; }));
const IM = require(join(root, "quant", "engines", "index-membership.js"));
const CONFIG = JSON.parse(readFileSync(join(root, "quant", "config", "index-membership.json"), "utf8"));
const OUT_DIR = join(root, CONFIG.outputDir);

console.log("Vision Universe — Index-Mitgliedschaft aus Fondsbestaenden\n");
const universe = resolveProductUniverse(root);
console.log(`  Company Master: ${universe.securities.length} Titel (${universe.version || "?"})`);

/* ------------------------------------------------- XLSX (minimal) */
/* Ein XLSX ist ein Zip mit XML. Gebraucht werden zwei Eintraege:
   xl/sharedStrings.xml und das erste Arbeitsblatt. Kein Paket, keine
   Formeln - nur Zellen zu Zeilen. */
function zipEntries(buf) {
  const entries = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("xlsx: kein Zip-Verzeichnis");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("xlsx: Verzeichniseintrag defekt");
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);
    entries[name] = { method, csize, usize, lho };
    off += 46 + nlen + elen + clen;
  }
  return {
    read(name) {
      const e = entries[name];
      if (!e) return null;
      const nlen = buf.readUInt16LE(e.lho + 26), elen = buf.readUInt16LE(e.lho + 28);
      const start = e.lho + 30 + nlen + elen;
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return inflateRawSync(data);
      throw new Error("xlsx: Kompressionsmethode " + e.method);
    },
    names: Object.keys(entries)
  };
}
function xmlText(s) {
  return String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function colNumber(ref) {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export function xlsxRows(buf) {
  const zip = zipEntries(buf);
  const shared = [];
  const ss = zip.read("xl/sharedStrings.xml");
  if (ss) {
    const xml = ss.toString("utf8");
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) {
      const texte = [];
      const rt = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = rt.exec(m[1]))) texte.push(xmlText(t[1]));
      shared.push(texte.join(""));
    }
  }
  const sheetName = zip.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("xlsx: kein Arbeitsblatt");
  const sheet = zip.read(sheetName).toString("utf8");
  const rows = [];
  const rr = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let r;
  while ((r = rr.exec(sheet))) {
    const cells = [];
    const rc = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = rc.exec(r[1]))) {
      const col = colNumber(c[1]);
      const attrs = c[2] || "", inner = c[3] || "";
      let wert = "";
      const tm = attrs.match(/t="([a-zA-Z]+)"/);
      const typ = tm ? tm[1] : null;
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (typ === "s") wert = vm ? shared[parseInt(vm[1], 10)] || "" : "";
      else if (typ === "inlineStr") { const im = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); wert = im ? xmlText(im[1]) : ""; }
      else wert = vm ? xmlText(vm[1]) : "";
      cells[col] = wert;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

/* ----------------------------------------------------------- Holen */
async function holen(url) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; VisionUniverseResearch/1.0; +https://research.visionuniverse.de)",
                                          "accept": "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*" } });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return Buffer.from(await r.arrayBuffer());
}

function rowsOf(format, buf) {
  if (format === "SSGA_XLSX") return xlsxRows(buf);
  return IM.parseCsv(buf.toString("utf8"));
}

/* ------------------------------------------------------------ Lauf */
mkdirSync(OUT_DIR, { recursive: true });
const verzeichnis = { schemaVersion: "index-membership-index-1.0.0", generatedAt: NOW.toISOString(), indexes: [] };
let fehler = 0;
for (const idx of CONFIG.indexes) {
  if (ONLY && ONLY !== idx.indexId) continue;
  const out = join(OUT_DIR, idx.indexId + ".json");
  const previous = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  try {
    let buf, quelle;
    if (FILES[idx.indexId]) { buf = readFileSync(FILES[idx.indexId]); quelle = FILES[idx.indexId]; }
    else { buf = await holen(idx.proxy.url); quelle = idx.proxy.url; }
    const rows = rowsOf(idx.proxy.format, buf);
    const holdings = IM.parseHoldings(idx.proxy.format, rows);
    if (holdings.error) throw new Error(holdings.error);
    const doc = IM.build({ indexId: idx.indexId, indexName: idx.indexName, proxy: idx.proxy, holdings,
                           securities: universe.securities, fetchedAt: NOW.toISOString(), previous });
    doc.shortLabel = idx.shortLabel;
    doc.sourceFile = FILES[idx.indexId] ? "lokal: " + quelle : null;
    const v = IM.validate(doc, { minMembers: idx.expectedMembers.min });
    if (!v.ok) throw new Error("ungueltig: " + v.findings.join("; "));
    if (doc.memberCount > idx.expectedMembers.max) throw new Error(`zu viele Mitglieder (${doc.memberCount} > ${idx.expectedMembers.max})`);
    writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
    const hist = join(OUT_DIR, "history", idx.indexId);
    mkdirSync(hist, { recursive: true });
    writeFileSync(join(hist, doc.asOf + ".json"), JSON.stringify(Object.assign({}, doc, { changes: doc.changes }), null, 1) + "\n");
    verzeichnis.indexes.push({ indexId: idx.indexId, indexName: idx.indexName, shortLabel: idx.shortLabel, asOf: doc.asOf,
                               memberCount: doc.memberCount, unmatchedCount: doc.unmatchedCount, proxy: idx.proxy.etf,
                               path: "/" + CONFIG.outputDir + "/" + idx.indexId + ".json" });
    console.log(`  ${idx.indexId.padEnd(6)} ${idx.indexName}: ${doc.memberCount} Mitglieder (Bestand ${doc.holdingsCount}, ` +
                `nicht zugeordnet ${doc.unmatchedCount}${doc.unmatched.length ? ": " + doc.unmatched.slice(0, 8).map((u) => u.ticker).join(", ") : ""}) · Stichtag ${doc.asOf}` +
                (doc.changes && (doc.changes.added.length || doc.changes.removed.length)
                  ? ` · +${doc.changes.added.join(",") || "-"} −${doc.changes.removed.join(",") || "-"}` : ""));
  } catch (err) {
    fehler++;
    console.error(`  ${idx.indexId.padEnd(6)} FEHLER: ${err.message}` + (previous ? ` - letzter Stand ${previous.asOf} bleibt.` : ""));
    if (previous) verzeichnis.indexes.push({ indexId: idx.indexId, indexName: idx.indexName, shortLabel: idx.shortLabel, asOf: previous.asOf,
                                             memberCount: previous.memberCount, unmatchedCount: previous.unmatchedCount, proxy: idx.proxy.etf,
                                             path: "/" + CONFIG.outputDir + "/" + idx.indexId + ".json", stale: true, error: String(err.message).slice(0, 200) });
  }
}
verzeichnis.note = "Verzeichnis der Index-Mitgliedschaften (Fondsbestaende der abbildenden ETFs, siehe quant/config/index-membership.json).";
writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(verzeichnis, null, 1) + "\n");
console.log(`\n  ${verzeichnis.indexes.length} Indizes im Verzeichnis, ${fehler} Fehler.`);
if (fehler) process.exit(1);
