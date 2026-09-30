/* =========================================================================
   VISION UNIVERSE SOCIAL — social/engines/png-slice.js

   DER CAROUSEL-BOGEN WIRD AN SEINEN NAEHTEN GETRENNT — VERLUSTFREI
   (Owner-Auftrag "WORK OWNS THE POST", 29.09.)

   Realer Befund (PR #300): der Vertrag des Creative Agents erlaubt pro
   Auftrag GENAU EIN Asset (assets/visual-01.png). Ein Carousel reist
   deshalb als ein Bogen: 3-4 fertige 4:5-Slides nebeneinander. Instagram
   braucht jede Slide einzeln.

   Diese Datei schneidet den Bogen an den Paneelgrenzen - Pixel fuer
   Pixel, ohne Skalierung, ohne Neuberechnung, ohne Gestaltung. Das
   Design gehoert Work; hier wird nur transportiert.

   Unterstuetzt: PNG, 8 Bit je Kanal, Graustufe/RGB/Graustufe+Alpha/RGBA,
   nicht interlaced (das liefert die Bildgenerierung). Alles andere wird
   benannt abgewiesen statt geraten.
   ========================================================================= */
"use strict";

const zlib = require("zlib");

const SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KANAELE = { 0: 1, 2: 3, 4: 2, 6: 4 };

let CRC_TABELLE = null;
function crc32(buf) {
  if (!CRC_TABELLE) {
    CRC_TABELLE = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABELLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABELLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length, 0);
  const typBuf = Buffer.from(typ, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typBuf, daten])), 0);
  return Buffer.concat([laenge, typBuf, daten, crc]);
}

/** Liest ein PNG in Rohzeilen (ungefiltert). Wirft mit benanntem Grund. */
function lies(png) {
  const b = Buffer.isBuffer(png) ? png : Buffer.from(png);
  if (b.length < 8 || !b.subarray(0, 8).equals(SIGNATUR)) throw new Error("PNG_SIGNATURE");
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos + 8 <= b.length) {
    const laenge = b.readUInt32BE(pos);
    const typ = b.toString("ascii", pos + 4, pos + 8);
    const daten = b.subarray(pos + 8, pos + 8 + laenge);
    if (typ === "IHDR") {
      ihdr = { width: daten.readUInt32BE(0), height: daten.readUInt32BE(4), bitDepth: daten[8],
        colorType: daten[9], interlace: daten[12] };
    } else if (typ === "IDAT") {
      idat.push(daten);
    } else if (typ === "IEND") {
      break;
    }
    pos += 12 + laenge;
  }
  if (!ihdr) throw new Error("PNG_NO_IHDR");
  if (ihdr.bitDepth !== 8 || !(ihdr.colorType in KANAELE)) throw new Error("PNG_FORMAT_UNSUPPORTED");
  if (ihdr.interlace !== 0) throw new Error("PNG_INTERLACED");

  const bpp = KANAELE[ihdr.colorType];
  const zeile = ihdr.width * bpp;
  const roh = zlib.inflateSync(Buffer.concat(idat));
  if (roh.length < (zeile + 1) * ihdr.height) throw new Error("PNG_TRUNCATED");

  const pixel = Buffer.alloc(zeile * ihdr.height);
  for (let y = 0; y < ihdr.height; y += 1) {
    const filter = roh[y * (zeile + 1)];
    const quelle = roh.subarray(y * (zeile + 1) + 1, (y + 1) * (zeile + 1));
    const ziel = pixel.subarray(y * zeile, (y + 1) * zeile);
    const oben = y > 0 ? pixel.subarray((y - 1) * zeile, y * zeile) : null;
    for (let x = 0; x < zeile; x += 1) {
      const a = x >= bpp ? ziel[x - bpp] : 0;
      const bb = oben ? oben[x] : 0;
      const c = (oben && x >= bpp) ? oben[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = quelle[x]; break;
        case 1: v = quelle[x] + a; break;
        case 2: v = quelle[x] + bb; break;
        case 3: v = quelle[x] + ((a + bb) >> 1); break;
        case 4: {
          const p = a + bb - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
          v = quelle[x] + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c));
          break;
        }
        default: throw new Error("PNG_BAD_FILTER");
      }
      ziel[x] = v & 0xff;
    }
  }
  return { width: ihdr.width, height: ihdr.height, colorType: ihdr.colorType, bpp, pixel };
}

/** Schreibt Rohpixel als PNG (Filter 0 je Zeile). */
function schreibe(bild) {
  const zeile = bild.width * bild.bpp;
  const roh = Buffer.alloc((zeile + 1) * bild.height);
  for (let y = 0; y < bild.height; y += 1) {
    roh[y * (zeile + 1)] = 0;
    bild.pixel.copy(roh, y * (zeile + 1) + 1, y * zeile, (y + 1) * zeile);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bild.width, 0);
  ihdr.writeUInt32BE(bild.height, 4);
  ihdr[8] = 8; ihdr[9] = bild.colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIGNATUR, chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(roh, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Schneidet einen Bogen in `anzahl` gleich breite Paneele (links nach
 * rechts). Verlangt, dass die Breite ohne Rest teilbar ist - ein Rest
 * hiesse, die Naht liegt nicht, wo Work sie gesetzt hat.
 *
 * @returns [{ index, width, height, png }]
 */
function schneide(png, anzahl) {
  const bild = lies(png);
  const n = Number(anzahl);
  if (!Number.isInteger(n) || n < 1) throw new Error("SLICE_BAD_COUNT");
  if (bild.width % n !== 0) throw new Error("SLICE_WIDTH_NOT_DIVISIBLE");
  const breite = bild.width / n;
  const zeileAlt = bild.width * bild.bpp;
  const zeileNeu = breite * bild.bpp;
  const teile = [];
  for (let i = 0; i < n; i += 1) {
    const pixel = Buffer.alloc(zeileNeu * bild.height);
    for (let y = 0; y < bild.height; y += 1) {
      bild.pixel.copy(pixel, y * zeileNeu, y * zeileAlt + i * zeileNeu, y * zeileAlt + (i + 1) * zeileNeu);
    }
    teile.push({ index: i + 1, width: breite, height: bild.height,
      png: schreibe({ width: breite, height: bild.height, colorType: bild.colorType, bpp: bild.bpp, pixel }) });
  }
  return teile;
}

module.exports = { lies, schreibe, schneide, crc32 };
