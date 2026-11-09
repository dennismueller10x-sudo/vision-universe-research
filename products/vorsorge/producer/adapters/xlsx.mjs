/* Minimaler XLSX-Leser (Zip + XML, kein Paket): Arbeitsblatt -> Zeilen (Arrays).
   Gleiche Technik wie scripts/market/build-index-membership.mjs (dort nicht exportiert). */
import { inflateRawSync } from "node:zlib";

function zipEntries(buf) {
  const entries = {};
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("xlsx: kein Zip-Verzeichnis");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("xlsx: Verzeichniseintrag defekt");
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    entries[buf.toString("utf8", off + 46, off + 46 + nlen)] = { method, csize, lho };
    off += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(entries),
    read(name) {
      const e = entries[name]; if (!e) return null;
      const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
      const data = buf.subarray(start, start + e.csize);
      return e.method === 0 ? data : e.method === 8 ? inflateRawSync(data) : null;
    }
  };
}
const xmlText = (s) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colNumber = (ref) => { const m = /^([A-Z]+)/.exec(ref || ""); let n = 0; for (const c of m ? m[1] : "A") n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

/** Erstes (oder benanntes) Arbeitsblatt als Array von Zeilen. Liefert auch die Blattnamen. */
export function readXlsx(buf, sheetIndex = 0) {
  const z = zipEntries(buf);
  const ss = z.read("xl/sharedStrings.xml");
  const shared = ss ? [...ss.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1])) : [];
  const wb = z.read("xl/workbook.xml");
  const sheetNames = wb ? [...wb.toString("utf8").matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => xmlText(m[1])) : [];
  const sheets = z.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const xml = z.read(sheets[sheetIndex]).toString("utf8");
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || "";
      const ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1], t = (/t="([a-zA-Z]+)"/.exec(attrs) || [])[1];
      const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let val = null;
      if (t === "s") val = shared[Number(v)] ?? null;
      else if (t === "inlineStr") val = xmlText((/<is>([\s\S]*?)<\/is>/.exec(inner) || [])[1] || "");
      else if (v !== undefined) val = t === "str" || t === "b" ? xmlText(v) : Number.isFinite(Number(v)) ? Number(v) : xmlText(v);
      row[ref ? colNumber(ref) : row.length] = val;
    }
    rows.push(row);
  }
  return { rows, sheetNames };
}
