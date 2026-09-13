/* =========================================================================
   VISION UNIVERSE — history-store.js

   Kurshistorien dauerhaft ablegen - ausserhalb von Git und ausserhalb
   des Runners.

   DAS PROBLEM, DAS DIESE DATEI LOEST

   Der FULL_UNIVERSE-Lauf vom 2026-09-09 hat 5.684 Historien geholt und
   sie in .market-cache gelegt. Der Cache-Schritt sichert aber nur unter
   2.500 MB; der Bestand war 7.566 MB. Er wurde uebersprungen - in beiden
   Laeufen. Die Historien starben mit dem Runner.

   Folge: "nur die neuen Titel nachladen" war nie moeglich. Jeder Lauf
   war ein Erstimport ueber alles. Diese Datei macht die Zusage wahr.

   WAS SIE NICHT TUT

   Sie kennt keinen Anbieter und keinen Cloud-Dienst. Sie spricht mit
   einem Treiber (put/get/head/list) und ist damit an jedem
   S3-kompatiblen Speicher lauffaehig - und im Test an einem
   Dateisystem. Der Anbieterwechsel ist eine Adresse, kein Umbau.

   LIZENZ

   Was hier abgelegt wird, sind Anbieterkurse. Sie gehoeren nicht in ein
   Git-Repository und nicht in einen oeffentlichen Pfad. Der Speicher ist
   privat, die Zugangsdaten liegen serverseitig, und der Browser sieht
   diese Objekte nie direkt - er fragt ein Backend, das die Berechtigung
   prueft.
   ========================================================================= */
"use strict";

const Codec = require("./bar-codec.js");
const Guard = require("./zero-cost-guard.js");

const VERSION = "history-store-1.1.0";
const LAYOUT = "v1";

/**
 * Ticker -> Objektschluessel.
 *
 * Ticker tragen Bindestriche (BRK-B), Punkte und bei Indizes ein
 * fuehrendes $ oder ^. Der Schluessel muss daraus etwas machen, das in
 * jedem S3-kompatiblen Speicher unauffaellig ist UND eindeutig
 * zurueckfuehrt - sonst kollidieren BRK-B und BRK.B still zu derselben
 * Datei, und eine der beiden Historien ist weg.
 */
function keyForTicker(ticker) {
  const t = String(ticker || "").toUpperCase();
  let out = "";
  for (const ch of t) {
    if (/[A-Z0-9\-.]/.test(ch)) out += ch;
    else out += "~" + ch.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase();
  }
  return out;
}

function tickerFromKey(key) {
  return String(key).replace(/~([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Der Speicher. `driver` ist alles, was put/get/head/list kann.
 *
 * @param {object} options {driver, provider, market, prefix}
 */
function createHistoryStore(options) {
  const opts = options || {};
  const driver = opts.driver;
  if (!driver) throw new Error("history-store: kein Treiber uebergeben.");
  const provider = opts.provider || "tiingo";
  const market = opts.market || "US";
  const prefix = (opts.prefix || LAYOUT).replace(/\/+$/, "");
  const codec = Codec.availableCodec(opts.codec);

  /* Das Budget ist keine Option, sondern die Nullkostenschranke im
     Schreibweg.

     Gegen ein Verzeichnis kostet nichts, dort darf es fehlen. Gegen
     einen kostenpflichtigen Dienst NICHT: ein Lauf ohne Budget koennte
     die Vorabrechnung einfach uebergehen, und dann waere sie eine
     Absichtserklaerung statt einer Schranke. */
  const budget = opts.budget || null;
  if (!budget && driver.kind !== "fs") {
    throw new Error(Guard.BLOCKED + ": Schreiben gegen '" + driver.kind + "' ohne Budget. " +
                    "Zuerst scripts/market/preflight-zero-cost.mjs laufen lassen.");
  }
  const meter = budget || Guard.createBudget({ unmetered: true });
  const dryRun = opts.dryRun === true;

  const seriesPrefix = `${prefix}/${provider}/daily/${market}/`;
  const indexKey = `${prefix}/${provider}/daily/${market}/_index.json.${codec === "gzip" ? "gz" : "zst"}`;
  /* Der Nutzungsstand liegt im Eimer und nicht im Runner: er muss den
     Lauf ueberleben, sonst faengt jede Rechnung wieder bei null an. */
  const usageKey = `${prefix}/_usage/${provider}-${market}-MONTH.json`;

  function seriesKey(ticker) {
    return seriesPrefix + keyForTicker(ticker) + ".json." + (codec === "gzip" ? "gz" : "zst");
  }

  /**
   * Eine Reihe schreiben.
   *
   * Vorher wird geprueft, ob sich ueberhaupt etwas geaendert hat. Ein
   * erneuter Lauf ueber unveraenderte Titel soll NICHTS schreiben - das
   * ist der Unterschied zwischen einer Erweiterung und einem zweiten
   * Erstimport, und er entscheidet, ob die Freigrenze haelt.
   *
   * Der Vergleich laeuft ueber den Hash des fertigen Objekts. Die
   * Kompression ist bei gleicher Eingabe deterministisch, also heisst
   * gleicher Hash: identisches Objekt, kein Schreibgrund.
   */
  async function putSeries(series, putOpts) {
    const po = putOpts || {};
    const enc = Codec.encode(series, { codec });
    const key = seriesKey(series.ticker);

    if (po.skipIfUnchanged !== false) {
      let storedSha = po.knownSha256 || null;
      if (!storedSha && po.checkRemote !== false) {
        meter.consumeClassB(1, "HEAD " + key);
        const head = await driver.head(key);
        storedSha = head && head.metadata ? head.metadata.sha256 : null;
        if (head) meter.noteDownload(0);
      }
      if (storedSha && storedSha === enc.meta.sha256) {
        meter.noteSkippedWrite();
        return {
          ticker: series.ticker, key, skipped: true, reason: "UNCHANGED_SHA256",
          first: enc.meta.first, last: enc.meta.last, barCount: enc.meta.barCount,
          bytes: enc.meta.storedBytes, bytesPerBar: enc.meta.bytesPerBar,
          sha256: enc.meta.sha256, codec, updatedAt: null
        };
      }
    }

    if (dryRun) {
      return {
        ticker: series.ticker, key, dryRun: true,
        first: enc.meta.first, last: enc.meta.last, barCount: enc.meta.barCount,
        bytes: enc.meta.storedBytes, bytesPerBar: enc.meta.bytesPerBar,
        sha256: enc.meta.sha256, codec, updatedAt: null
      };
    }

    meter.consumeClassA(1, "PUT " + key);
    meter.noteUpload(enc.buffer.length);
    await driver.put(key, enc.buffer, {
      contentType: "application/json",
      contentEncoding: codec === "none" ? undefined : codec,
      metadata: {
        ticker: String(series.ticker), bars: String(enc.meta.barCount),
        first: enc.meta.first || "", last: enc.meta.last || "",
        format: enc.meta.format, sha256: enc.meta.sha256
      }
    });
    return {
      ticker: series.ticker, key,
      first: enc.meta.first, last: enc.meta.last, barCount: enc.meta.barCount,
      bytes: enc.meta.storedBytes, bytesPerBar: enc.meta.bytesPerBar,
      sha256: enc.meta.sha256, codec, updatedAt: new Date().toISOString()
    };
  }

  /** Eine Reihe lesen. Fehlt sie, ist das null und kein Fehler. */
  async function getSeries(ticker) {
    meter.consumeClassB(1, "GET " + ticker);
    const buf = await driver.get(seriesKey(ticker));
    if (!buf) return null;
    meter.noteDownload(buf.length);
    return Codec.decode(buf);
  }

  /**
   * Neue Kerzen anhaengen.
   *
   * Der taegliche Nachlauf holt ab dem letzten bekannten Tag. Bei
   * gleichem Datum gewinnt die NEUE Kerze: eine Kapitalmassnahme aendert
   * alte adjustedClose-Werte rueckwirkend, und wer die alten behielte,
   * fuehrte eine Reihe, die nach einem Split still falsch ist.
   */
  async function appendSeries(ticker, incomingBars, seriesMeta) {
    const existing = await getSeries(ticker);
    const merged = Codec.mergeBars(existing ? existing.bars : [], incomingBars || []);
    const series = Object.assign({}, seriesMeta || {}, {
      ticker,
      securityId: (seriesMeta && seriesMeta.securityId) || (existing && existing.securityId) || null,
      provider: (seriesMeta && seriesMeta.provider) || provider,
      adjustmentStatus: (seriesMeta && seriesMeta.adjustmentStatus) ||
                        (existing && existing.adjustmentStatus) || null,
      bars: merged.bars
    });
    /* Hat sich ueberhaupt etwas geaendert?

       Die alte Reihe wurde gerade gelesen. Ergibt der Abgleich weder
       eine neue noch eine ersetzte Kerze, ist das Objekt identisch -
       dann braucht es weder ein HEAD noch ein PUT. Im taeglichen
       Betrieb ist das der Normalfall fuer jeden Titel ohne neuen
       Handelstag, und es ist der Unterschied zwischen 7.800
       Schreibvorgaengen und keinem. */
    if (existing && merged.changed === 0) {
      meter.noteSkippedWrite();
      return {
        ticker, key: seriesKey(ticker), skipped: true, reason: "NO_NEW_BARS",
        first: existing.first, last: existing.last, barCount: existing.bars.length,
        bytes: null, sha256: null, codec, updatedAt: null,
        barsBefore: existing.bars.length, barsAdded: 0, barsReplaced: 0
      };
    }

    /* Der Inhalt hat sich geaendert - ein HEAD zur Gegenprobe waere
       eine Anfrage fuer eine Antwort, die schon feststeht. */
    const meta = await putSeries(series, { checkRemote: false });
    return Object.assign(meta, {
      barsBefore: existing ? existing.bars.length : 0,
      barsAdded: merged.added, barsReplaced: merged.replaced
    });
  }

  /* ----------------------------------------------------------- INDEX

     Ein Objekt, das sagt, was da ist. Ohne ihn braeuchte ein
     fortgesetzter Lauf 7.800 HEAD-Anfragen, um zu wissen, wo er steht.
     Mit ihm ist es eine. */
  async function readIndex() {
    meter.consumeClassB(1, "GET " + indexKey);
    const buf = await driver.get(indexKey);
    if (!buf) {
      return { version: VERSION, layout: prefix, provider, market,
               generatedAt: null, symbols: {} };
    }
    const raw = Codec.CODECS.includes(codec)
      ? require("node:zlib")[codec === "gzip" ? "gunzipSync" : "zstdDecompressSync"](buf)
      : buf;
    return JSON.parse(raw.toString("utf8"));
  }

  async function writeIndex(index) {
    const payload = Object.assign({}, index, {
      version: VERSION, layout: prefix, provider, market,
      generatedAt: new Date().toISOString(),
      symbolCount: Object.keys(index.symbols || {}).length
    });
    const raw = Buffer.from(JSON.stringify(payload));
    const zlib = require("node:zlib");
    const buf = codec === "gzip" ? zlib.gzipSync(raw, { level: 9 })
              : zlib.zstdCompressSync(raw, { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } });
    if (dryRun) return { key: indexKey, bytes: buf.length, symbols: payload.symbolCount, dryRun: true };
    meter.consumeClassA(1, "PUT " + indexKey);
    meter.noteUpload(buf.length);
    await driver.put(indexKey, buf, { contentType: "application/json" });
    return { key: indexKey, bytes: buf.length, symbols: payload.symbolCount };
  }

  /**
   * Den Index aus dem Speicher selbst neu aufbauen.
   *
   * Der Index ist eine Bequemlichkeit; die Wahrheit sind die Objekte.
   * Geht er verloren oder ist er aelter als der Bestand, stellt LIST ihn
   * wieder her - das ist die Wiederherstellung nach einem abgebrochenen
   * Lauf.
   */
  async function rebuildIndexFromStorage(opts2) {
    opts2 = opts2 || {};
    const concurrency = opts2.concurrency || 32;
    /* LIST zaehlt bei R2 als Class A, obwohl es nichts schreibt. Eine
       Seite fasst 1.000 Schluessel. */
    meter.consumeClassA(Math.max(1, Math.ceil((opts2.expectedObjects || 1000) / 1000)), "LIST " + seriesPrefix);
    const objects = (await driver.list(seriesPrefix)).filter((o) => o.key !== indexKey);

    /* LIST liefert Schluessel und Groesse - aber KEINE Benutzermetadaten.
       Das ist keine Eigenart eines Anbieters, das ist S3: ListObjectsV2
       gibt x-amz-meta-* nicht heraus.

       Der erste Entwurf las sie trotzdem aus dem LIST-Ergebnis. Gegen das
       Dateisystem ging das gut, weil der dortige Treiber die Ablage
       daneben mitliest - gegen einen echten Dienst waere ein Index
       entstanden, in dem first, last und barCount ueberall null sind.
       Ein Wiederaufbau, der genau die Felder verliert, fuer die es ihn
       gibt.

       Deshalb wird immer HEAD gefragt. Fuer 7.800 Titel sind das 7.800
       Class-B-Anfragen - bei R2 kostenfrei bis 10 Millionen im Monat, und
       der Wiederaufbau ist der Ausnahmefall und nicht der Normalbetrieb. */
    const symbols = {};
    let cursor = 0;
    async function worker() {
      while (cursor < objects.length) {
        const o = objects[cursor++];
        const base = o.key.slice(seriesPrefix.length).replace(/\.json\.(zst|gz)$/, "");
        const ticker = tickerFromKey(base);
        meter.consumeClassB(1, "HEAD " + o.key);
        const head = await driver.head(o.key);
        const md = (head && head.metadata) || {};
        symbols[ticker] = {
          ticker, key: o.key, bytes: (head && head.size) || o.size,
          first: md.first || null,
          last: md.last || null,
          barCount: md.bars ? Number(md.bars) : null,
          sha256: md.sha256 || null,
          updatedAt: (head && head.lastModified) || o.lastModified || null,
          source: "REBUILT_FROM_LIST_AND_HEAD"
        };
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, objects.length || 1) }, worker));

    return { version: VERSION, layout: prefix, provider, market,
             generatedAt: new Date().toISOString(), symbols,
             rebuiltFrom: { objects: objects.length, headRequests: objects.length } };
  }

  /* ------------------------------------------------------ BACKFILL-PLAN

     Die eigentliche Antwort auf "nur die neuen Titel". Sie faellt nicht
     vom Himmel, sondern aus dem Vergleich zwischen dem, was das
     Universum verlangt, und dem, was im Speicher liegt. */
  function planBackfill(tickers, index, opts2) {
    opts2 = opts2 || {};
    const upTo = opts2.upTo || null;
    const symbols = (index && index.symbols) || {};
    const plan = { full: [], incremental: [], current: [], extra: [] };

    for (const t of tickers || []) {
      const key = String(t).toUpperCase();
      const have = symbols[key];
      if (!have || !have.last || !have.barCount) { plan.full.push({ ticker: key, from: null }); continue; }
      if (upTo && have.last < upTo) {
        /* Ab dem letzten bekannten Tag, nicht ab dem Tag danach: Tiingo
           liefert ihn mit, und eine rueckwirkend geaenderte Kerze soll
           die alte ersetzen koennen. */
        plan.incremental.push({ ticker: key, from: have.last, last: have.last });
        continue;
      }
      plan.current.push({ ticker: key, last: have.last });
    }

    /* Was im Speicher liegt, aber nicht mehr im Universum steht, wird
       NICHT geloescht. Es kostet Platz und nichts sonst - und ein Titel,
       der morgen zurueckkommt, ist dann noch da. */
    const wanted = new Set((tickers || []).map((t) => String(t).toUpperCase()));
    for (const k of Object.keys(symbols)) if (!wanted.has(k)) plan.extra.push(k);

    return Object.assign(plan, {
      counts: {
        requested: (tickers || []).length,
        full: plan.full.length, incremental: plan.incremental.length,
        current: plan.current.length, extra: plan.extra.length,
        toFetch: plan.full.length + plan.incremental.length
      }
    });
  }

  /* ---------------------------------------------------- NUTZUNGSSTAND

     Er liegt im Eimer, weil er den Runner ueberleben muss. Ein Stand,
     der bei jedem Lauf wieder bei null anfaengt, meldet nie eine
     Ueberschreitung - er meldet jeden Lauf als den ersten des Monats. */
  function usageKeyFor(month) {
    return usageKey.replace("MONTH", month || Guard.monthKey());
  }

  async function readUsage(month) {
    const m = month || Guard.monthKey();
    meter.consumeClassB(1, "GET usage " + m);
    const buf = await driver.get(usageKeyFor(m));
    if (!buf) return Guard.emptyUsage(m);
    try {
      const parsed = JSON.parse(buf.toString("utf8"));
      /* Ein Stand aus einem anderen Monat ist kein Stand fuer diesen.
         Ihn zu uebernehmen waere die bequeme und falsche Antwort. */
      return parsed && parsed.month === m ? parsed : Guard.emptyUsage(m);
    } catch (err) {
      return Guard.emptyUsage(m);
    }
  }

  async function writeUsage(state) {
    const payload = Object.assign({}, state, { updatedAt: new Date().toISOString() });
    const buf = Buffer.from(JSON.stringify(payload, null, 2));
    if (dryRun) return { key: usageKeyFor(payload.month), bytes: buf.length, dryRun: true };
    meter.consumeClassA(1, "PUT usage " + payload.month);
    await driver.put(usageKeyFor(payload.month), buf, { contentType: "application/json" });
    return { key: usageKeyFor(payload.month), bytes: buf.length };
  }

  /** Belegter Speicher und Objektzahl aus dem Speicher selbst. */
  async function measureStorage(opts2) {
    opts2 = opts2 || {};
    meter.consumeClassA(Math.max(1, Math.ceil((opts2.expectedObjects || 1000) / 1000)), "LIST " + prefix);
    const objects = await driver.list(prefix + "/");
    let bytes = 0;
    for (const o of objects) bytes += o.size || 0;
    return { objectCount: objects.length, storageBytes: bytes };
  }

  return {
    VERSION, codec, provider, market, dryRun,
    seriesPrefix, indexKey, usageKey, seriesKey, keyForTicker, tickerFromKey,
    putSeries, getSeries, appendSeries,
    readIndex, writeIndex, rebuildIndexFromStorage, planBackfill,
    readUsage, writeUsage, measureStorage,
    budget: meter,
    driver
  };
}

module.exports = { VERSION, LAYOUT, keyForTicker, tickerFromKey, createHistoryStore };
