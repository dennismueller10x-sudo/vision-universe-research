/* =========================================================================
   VISION UNIVERSE — market-store.js   (Phase 4A, §12, §13, §14)

   Wo Kursdaten liegen - und wie ein Import fortgesetzt wird, der abbricht.

   Drei Anforderungen, die zusammengehoeren:

   1. Nicht alles gehoert ins Repository. Zwanzig Jahre Tageskurse fuer
      2.000 Titel sind mehrere Gigabyte. Ein oeffentliches Git-Repository ist
      dafuer der falsche Ort - technisch und lizenzrechtlich. Der Speicher
      unterscheidet deshalb zwei Ablagen: `published` (klein, committet,
      ausgeliefert) und `working` (gross, lokal, ignoriert).

   2. Ein Import ueber 2.000 Titel bricht ab. Nicht vielleicht - er bricht
      ab, bei Titel 731, wegen eines Kontingents oder eines Netzfehlers.
      Ohne Checkpoint faengt der naechste Lauf bei Titel 1 an und verbrennt
      730 Anfragen fuer Daten, die schon da sind.

   3. Nach dem Erstimport aendert sich taeglich eine Bar. Die gesamte
      Historie erneut abzurufen ist die teuerste Art, nichts Neues zu
      erfahren. Der Speicher sagt, ab welchem Tag ein Titel nachzuladen ist.

   Bewusst dateibasiert und ohne Abhaengigkeiten: das genuegt fuer den
   Umfang dieser Phase, und die Schnittstelle ist so geschnitten, dass eine
   Datenbank spaeter dahinter passt, ohne dass die Aufrufer sich aendern.
   ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

/* Wie viele Bars je Titel in die veroeffentlichte Ablage duerfen. Der Wert
   ist eine Groessenentscheidung, keine fachliche: 400 Handelstage decken
   Momentum ueber 12 Monate und einen 52-Wochen-Hochstand ab, was die
   Oberflaeche braucht. Alles darueber bleibt in der Arbeitsablage. */
const PUBLISHED_BAR_LIMIT = 400;

function createMarketStore(options) {
  options = options || {};
  const root = options.root || process.cwd();
  const publishedDir = options.publishedDir || path.join(root, "quant", "data", "market");
  const workingDir = options.workingDir || path.join(root, ".market-cache");
  const providerId = options.providerId || "unknown";

  function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

  function barsFile(securityId, scope) {
    const dir = scope === "published"
      ? path.join(publishedDir, "daily")
      : path.join(workingDir, providerId, "daily");
    return path.join(dir, securityId + ".json");
  }

  function checkpointFile(runId) {
    return path.join(workingDir, providerId, "checkpoints", (runId || "default") + ".json");
  }

  function readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(file, data) {
    ensure(path.dirname(file));
    /* Erst daneben schreiben, dann umbenennen. Ein Abbruch mitten im
       Schreiben hinterlaesst sonst eine halbe Datei, die beim naechsten
       Lauf als gueltiger Stand gelesen wird. */
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    return fs.statSync(file).size;
  }

  const api = {
    publishedDir: publishedDir,
    workingDir: workingDir,

    /* ------------------------------------------------------ Kursreihen */

    /** Liest die gespeicherte Reihe eines Titels. */
    readBars: function (securityId, scope) {
      return readJson(barsFile(securityId, scope || "working"), null);
    },

    /**
     * Bis zu welchem Tag liegen Daten vor?
     *
     * Die Grundlage des inkrementellen Updates. Ohne gespeicherte Reihe
     * null - dann ist ein Erstimport faellig.
     */
    lastStoredDate: function (securityId, scope) {
      const payload = api.readBars(securityId, scope || "working");
      if (!payload || !Array.isArray(payload.bars) || !payload.bars.length) return null;
      return payload.bars[payload.bars.length - 1].date;
    },

    /**
     * Ab welchem Datum muss nachgeladen werden?
     *
     * Bewusst ein Tag nach dem letzten gespeicherten: Tiingo liefert
     * startDate einschliesslich, und dieselbe Bar zweimal zu holen kostet
     * eine Anfrage und erzeugt eine Dublette.
     */
    nextFetchFrom: function (securityId, opts) {
      opts = opts || {};
      const last = api.lastStoredDate(securityId, opts.scope);
      if (!last) return opts.initialFrom || "1990-01-01";
      const d = new Date(last + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    },

    /**
     * Fuegt neue Bars zu einer bestehenden Reihe.
     *
     * Idempotent: dieselbe Bar zweimal einzuspielen aendert nichts. Der
     * Schluessel ist das Datum, und bei Gleichstand gewinnt die neue Bar -
     * ein Anbieter korrigiert eine Bar gelegentlich nachtraeglich, und die
     * Korrektur ist der bessere Wert.
     */
    mergeBars: function (securityId, incoming, meta) {
      const existing = api.readBars(securityId, "working");
      const byDate = Object.create(null);

      if (existing && Array.isArray(existing.bars)) {
        for (const bar of existing.bars) byDate[bar.date] = bar;
      }
      let added = 0, replaced = 0;
      for (const bar of incoming || []) {
        if (byDate[bar.date]) replaced++; else added++;
        byDate[bar.date] = bar;
      }

      const bars = Object.keys(byDate).sort().map((d) => byDate[d]);
      const payload = Object.assign({}, existing || {}, meta || {}, {
        securityId: securityId,
        provider: providerId,
        barCount: bars.length,
        first: bars.length ? bars[0].date : null,
        last: bars.length ? bars[bars.length - 1].date : null,
        updatedAt: new Date().toISOString(),
        bars: bars
      });

      const bytes = writeJson(barsFile(securityId, "working"), payload);
      return { securityId, added, replaced, total: bars.length, bytes,
               first: payload.first, last: payload.last };
    },

    /**
     * Schreibt den ausgelieferten Ausschnitt.
     *
     * Bewusst getrennt vom Einspielen: was gespeichert wird und was
     * veroeffentlicht wird, sind verschiedene Entscheidungen. Die zweite
     * haengt an der Lizenzlage, nicht an der Datenmenge.
     */
    publish: function (securityId, opts) {
      opts = opts || {};
      const payload = api.readBars(securityId, "working");
      if (!payload) return { published: false, reason: "noWorkingData" };

      const limit = opts.limit || PUBLISHED_BAR_LIMIT;
      const bars = payload.bars.slice(-limit);
      const out = Object.assign({}, payload, {
        bars: bars,
        barCount: bars.length,
        first: bars.length ? bars[0].date : null,
        last: bars.length ? bars[bars.length - 1].date : null,
        publishedAt: new Date().toISOString(),
        truncatedFrom: payload.barCount,
        note: bars.length < payload.barCount
          ? "Ausschnitt der letzten " + limit + " Handelstage. Die vollstaendige Historie " +
            "liegt in der Arbeitsablage und wird nicht ausgeliefert."
          : null
      });
      const bytes = writeJson(barsFile(securityId, "published"), out);
      return { published: true, bars: bars.length, of: payload.barCount, bytes };
    },

    /* ------------------------------------------------------ Checkpoint */

    /**
     * Laedt den Stand eines laufenden Imports.
     *
     * `done` sind erledigte Titel, `failed` die gescheiterten mit Grund.
     * Ein Titel in `failed` wird beim naechsten Lauf erneut versucht - er
     * ist nicht erledigt, nur vorerst gescheitert.
     */
    loadCheckpoint: function (runId) {
      return readJson(checkpointFile(runId), {
        runId: runId || "default",
        startedAt: null, updatedAt: null,
        done: [], failed: [], requests: 0
      });
    },

    saveCheckpoint: function (checkpoint) {
      checkpoint.updatedAt = new Date().toISOString();
      writeJson(checkpointFile(checkpoint.runId), checkpoint);
      return checkpoint;
    },

    /** Welche Titel stehen noch aus? */
    remaining: function (checkpoint, universe) {
      const done = new Set(checkpoint.done || []);
      return (universe || []).filter((id) => !done.has(id));
    },

    clearCheckpoint: function (runId) {
      try { fs.unlinkSync(checkpointFile(runId)); return true; }
      catch (err) { return false; }
    },

    /* ---------------------------------------------------------- Bestand */

    /** Was liegt vor? Fuer die Entwickleransicht und den Statusbericht. */
    inventory: function (scope) {
      const dir = scope === "published"
        ? path.join(publishedDir, "daily")
        : path.join(workingDir, providerId, "daily");
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); }
      catch (err) { return []; }

      return files.map(function (f) {
        const payload = readJson(path.join(dir, f), null);
        const size = fs.statSync(path.join(dir, f)).size;
        if (!payload) return { securityId: f.replace(/\.json$/, ""), readable: false, bytes: size };
        const splits = (payload.bars || []).filter((b) => b.splitFactor && b.splitFactor !== 1).length;
        const dividends = (payload.bars || []).filter((b) => b.dividend && b.dividend > 0).length;
        return {
          securityId: payload.securityId,
          readable: true,
          bars: payload.barCount || (payload.bars || []).length,
          first: payload.first, last: payload.last,
          adjustmentStatus: payload.adjustmentStatus || null,
          splits: splits, dividends: dividends,
          bytes: size, updatedAt: payload.updatedAt || null
        };
      });
    }
  };

  return api;
}

module.exports = { createMarketStore, PUBLISHED_BAR_LIMIT };
