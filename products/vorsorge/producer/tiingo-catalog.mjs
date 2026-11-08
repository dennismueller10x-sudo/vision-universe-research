/* =========================================================================
   VISION UNIVERSE VORSORGE — tiingo-catalog.mjs

   Liest die Tiingo-Tickerliste (supported_tickers.zip): ein Archiv, eine
   CSV-Datei, Deflate. Bewusst eine eigene Kopie im Vorsorge-Modul: die
   Marktdaten-Skripte (scripts/market) bleiben unveraendert - so verlangt
   es die Modulgrenze, die die Discover-CI fuer Pull Requests prueft.
   ========================================================================= */
import { inflateRawSync } from "node:zlib";

export function readSingleFileFromZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 65558; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Kein ZIP-Endverzeichnis gefunden.");
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Beschaedigtes ZIP-Verzeichnis.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28), extraLen = buffer.readUInt16LE(offset + 30), commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);
    if (name.toLowerCase().endsWith(".csv")) {
      const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const data = buffer.subarray(start, start + compressedSize);
      if (method === 0) return { name, text: data.toString("utf8") };
      if (method === 8) return { name, text: inflateRawSync(data).toString("utf8") };
      throw new Error("Unbekanntes Kompressionsverfahren " + method + ".");
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("Keine CSV im Archiv.");
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return { header: [], rows: [] };
  const split = (line) => {
    const out = []; let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
      else if (ch === '"') quoted = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur); return out;
  };
  const header = split(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) { const c = split(lines[i]); const row = {}; header.forEach((h, j) => { row[h] = (c[j] || "").trim(); }); rows.push(row); }
  return { header, rows };
}
