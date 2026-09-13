/* =========================================================================
   VISION UNIVERSE — bar-codec.js

   Kursreihen klein machen, ohne etwas zu verlieren.

   WARUM NICHT PARQUET

   Die naheliegende Antwort auf "10,9 GB Kursdaten" heisst Parquet. Sie
   wurde gemessen statt geglaubt, an fuenf echten Tiingo-Reihen mit
   zusammen 14.685 Kerzen:

     volles JSON            363,7 B/Kerze      10,79 GB @ 7.800
     JSON ohne Konstanten   266,1 B/Kerze       7,90 GB
     JSON + zstd             45,2 B/Kerze       1,34 GB
     Spalten + zstd          44,0 B/Kerze       1,30 GB
     Spalten + Byte-Shuffle  48,6 B/Kerze       1,44 GB   (schlechter!)
     ZEILEN + zstd           40,7 B/Kerze       1,21 GB   <- gewaehlt

   Der Byte-Shuffle, der bei Messreihen viel bringt, schadet hier: die
   Mantissen von Kursen sind hochentrop, und das Umsortieren zerreisst
   genau die Wiederholungen, die zstd sonst findet.

   Eine echte Spaltenablage bringt gegenueber ZEILEN keine 8 Prozent.
   Dafuer verlangte Parquet eine Abhaengigkeit - dieses Repository hat
   keine, und ein Parquet-Leser im Browser ist teurer als der ganze
   Gewinn. Node 22 bringt zstd mit; damit kostet dieses Format null
   Abhaengigkeiten.

   DAS FORMAT

   Ein Dokument je Titel. Der Kopf traegt, was fuer alle Kerzen gleich
   ist; die Kerzen stehen als Wertreihen in der Reihenfolge, die der Kopf
   nennt. Kein Feld wird weggelassen, keine Zahl gerundet: decode(encode(x))
   ergibt x, und ein Test prueft das an echten Kursen.
   ========================================================================= */
"use strict";

const zlib = require("node:zlib");
const crypto = require("node:crypto");

const VERSION = "bar-codec-1.0.0";

/* Die Spalten in fester Reihenfolge. Sie steht im Kopf jedes Dokuments -
   ein Leser darf sich nie auf diese Liste hier verlassen, sondern nimmt
   die aus der Datei. Sonst bricht jede Erweiterung alle alten Objekte. */
const DEFAULT_COLUMNS = [
  "date", "open", "high", "low", "close", "volume",
  "adjustedOpen", "adjustedHigh", "adjustedLow", "adjustedClose", "adjustedVolume",
  "splitFactor", "dividend"
];

const CODECS = {
  zstd: {
    compress: (buf) => zlib.zstdCompressSync(buf, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 }
    }),
    decompress: (buf) => zlib.zstdDecompressSync(buf)
  },
  /* Rueckfallebene fuer Laufzeiten ohne zstd. Sie kostet rund 40 Prozent
     mehr Platz und steht deshalb nicht als Standard da - aber ein
     Objekt, das niemand mehr lesen kann, waere teurer. */
  gzip: {
    compress: (buf) => zlib.gzipSync(buf, { level: 9 }),
    decompress: (buf) => zlib.gunzipSync(buf)
  },
  none: { compress: (buf) => buf, decompress: (buf) => buf }
};

function availableCodec(preferred) {
  if (preferred && CODECS[preferred]) {
    if (preferred !== "zstd" || typeof zlib.zstdCompressSync === "function") return preferred;
  }
  return typeof zlib.zstdCompressSync === "function" ? "zstd" : "gzip";
}

/**
 * Kerzen -> komprimiertes Dokument.
 *
 * @param {object} series {ticker, securityId, provider, adjustmentStatus, currency, bars[]}
 * @param {object} [opts] {codec: "zstd"|"gzip"|"none", columns: string[]}
 * @returns {{buffer: Buffer, meta: object}}
 */
function encode(series, opts) {
  opts = opts || {};
  const bars = series.bars || [];
  const codec = availableCodec(opts.codec);

  /* Welche Spalten kommen vor - und in WELCHER Reihenfolge?

     Die Reihenfolge ist die der Anbieterkerze, nicht unsere Vorgabe.
     Das ist kein Schoenheitsfehler: nur so ist decode(encode(x)) auch
     zeichengleich x und nicht bloss wertgleich. Eine Zusage, die nur
     "die Zahlen stimmen" bedeutet, laesst sich spaeter nicht mehr
     nachpruefen, ohne jedes Feld einzeln zu vergleichen. */
  const columns = [];
  for (const b of bars) {
    for (const k of Object.keys(b)) if (!columns.includes(k)) columns.push(k);
  }

  /* Felder, die in JEDER Kerze denselben Wert tragen, wandern in den
     Kopf. Bei Tiingo sind das securityId, adjustmentStatus, currency und
     dataSourceId - zusammen rund 90 Byte je Kerze reine Wiederholung. */
  const constants = {};
  const varying = [];
  for (const c of columns) {
    if (!bars.length) { varying.push(c); continue; }
    const first = bars[0][c];
    if (typeof first === "object" && first !== null) { varying.push(c); continue; }
    let same = true;
    for (let i = 1; i < bars.length; i++) {
      if (bars[i][c] !== first) { same = false; break; }
    }
    if (same && first !== undefined) constants[c] = first;
    else varying.push(c);
  }

  const rows = bars.map((b) => varying.map((c) => (b[c] === undefined ? null : b[c])));

  const doc = {
    format: VERSION,
    ticker: series.ticker || null,
    securityId: series.securityId || null,
    provider: series.provider || null,
    adjustmentStatus: series.adjustmentStatus || null,
    barCount: bars.length,
    first: bars.length ? bars[0].date : null,
    last: bars.length ? bars[bars.length - 1].date : null,
    /* columns ist die VOLLE Reihenfolge einschliesslich der Konstanten.
       Wer nur die veraenderlichen speicherte, koennte die urspruengliche
       Feldfolge nicht wiederherstellen. */
    columns: columns,
    constants: constants,
    rows: rows
  };

  const raw = Buffer.from(JSON.stringify(doc));
  const buffer = CODECS[codec].compress(raw);
  return {
    buffer,
    meta: {
      format: VERSION, codec, ticker: doc.ticker, securityId: doc.securityId,
      barCount: doc.barCount, first: doc.first, last: doc.last,
      rawBytes: raw.length, storedBytes: buffer.length,
      bytesPerBar: bars.length ? +(buffer.length / bars.length).toFixed(2) : null,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex")
    }
  };
}

/**
 * Komprimiertes Dokument -> Kerzen.
 *
 * Die Kodierung steht nicht in der Datei, sondern am Objekt (Dateiname
 * oder Metadatum). Wer sie nicht kennt, bekommt sie erraten - an den
 * Magic Bytes, nicht an einer Annahme.
 */
function decode(buffer, opts) {
  opts = opts || {};
  const codec = opts.codec || sniff(buffer);
  if (!CODECS[codec]) throw new Error("Unbekannte Kodierung: " + codec);
  const raw = CODECS[codec].decompress(buffer);
  const doc = JSON.parse(raw.toString("utf8"));

  if (!doc.format || !String(doc.format).startsWith("bar-codec-")) {
    throw new Error("Kein Kursdokument dieses Formats: " + doc.format);
  }
  const columns = doc.columns || [];
  const constants = doc.constants || {};
  const hasConstant = Object.prototype.hasOwnProperty.bind(constants);
  const bars = (doc.rows || []).map((row) => {
    const bar = {};
    let v = 0;
    /* In der Reihenfolge des Kopfes. Konstanten kommen aus dem Kopf, alles
       andere der Reihe nach aus der Zeile - so entsteht die
       Anbieterkerze Feld fuer Feld in ihrer urspruenglichen Folge. */
    for (const c of columns) {
      bar[c] = hasConstant(c) ? constants[c] : row[v++];
    }
    return bar;
  });
  return {
    format: doc.format, ticker: doc.ticker, securityId: doc.securityId,
    provider: doc.provider, adjustmentStatus: doc.adjustmentStatus,
    barCount: doc.barCount, first: doc.first, last: doc.last, bars
  };
}

/** Kodierung an den Magic Bytes erkennen. */
function sniff(buffer) {
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0xfd2fb528) return "zstd";
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return "gzip";
  if (buffer.length && (buffer[0] === 0x7b || buffer[0] === 0x20)) return "none";
  throw new Error("Kodierung nicht erkennbar.");
}

/**
 * Zwei Reihen zusammenfuehren - vorhandene Kerzen und neu geholte.
 *
 * Der taegliche Nachlauf holt ab dem letzten bekannten Tag. Tiingo
 * liefert diesen Tag mit, und eine Kapitalmassnahme kann ALTE Kerzen
 * rueckwirkend aendern (adjustedClose). Deshalb gilt: bei gleichem Datum
 * gewinnt die NEUE Kerze. Wer die alte behielte, fuehre eine Reihe, die
 * nach einem Split still falsch ist.
 */
function mergeBars(existing, incoming) {
  const byDate = new Map();
  for (const b of existing || []) byDate.set(b.date, b);
  let replaced = 0, added = 0, identical = 0;
  for (const b of incoming || []) {
    const old = byDate.get(b.date);
    if (old === undefined) { added++; }
    else if (barsEqual(old, b)) {
      /* Gleicher Tag UND gleicher Inhalt ist KEINE Ersetzung.

         Der Unterschied entscheidet ueber die Kosten: der taegliche
         Nachlauf holt mit einem Tag Ueberlappung, und wer die
         ueberlappende Kerze als "ersetzt" zaehlt, schreibt jedes Objekt
         neu - auch das, an dem sich nichts geaendert hat. Bei 7.800
         Titeln sind das 7.800 unnoetige Schreibvorgaenge je Lauf. */
      identical++;
      continue;
    } else { replaced++; }
    byDate.set(b.date, b);
  }
  const bars = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { bars, replaced, added, identical, changed: replaced + added };
}

/** Wertgleichheit zweier Kerzen, unabhaengig von der Feldreihenfolge. */
function barsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

module.exports = {
  VERSION, DEFAULT_COLUMNS, CODECS: Object.keys(CODECS),
  availableCodec, encode, decode, sniff, mergeBars, barsEqual
};
