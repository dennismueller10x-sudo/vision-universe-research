/* =========================================================================
   VISION UNIVERSE — realtime/bar-merge.js

   Historie und Live in einer Reihe - ohne dass daraus zwei werden.

   Der Chart bekommt seine Daten aus zwei Welten. Die Historie ist fertig,
   geordnet und bereinigt. Der Live-Strom ist keines davon: er kommt in
   beliebiger Reihenfolge, wiederholt sich, springt bei einem Split und
   traegt eine andere Bereinigungsstufe als die Reihe, in die er faellt.

   Wer beides einfach aneinanderhaengt, bekommt die bekannten Schaeden:

     - dieselbe Kerze zweimal, weil der Nachlauf die letzte Bar erneut liefert
     - eine Kerze, die zwischen zwei alten auftaucht
     - ein Kurssprung am Split-Tag, der wie ein Absturz aussieht
     - eine Live-Bar auf unbereinigten Kursen in einer bereinigten Reihe
     - eine Bar mit einem Zeitstempel aus der Zukunft

   Der letzte Punkt ist der gefaehrlichste, weil er nicht wie ein Fehler
   aussieht. Eine Bar, die in der Zukunft liegt, ist im Backtest ein
   Blick nach vorn - und ein Backtest mit Blick nach vorn liefert
   Ergebnisse, die niemand je erreichen wird.

   DIE MERGE-REGELN. Sie sind deterministisch: dieselbe Folge von
   Ereignissen ergibt immer dieselbe Reihe, unabhaengig von der
   Reihenfolge des Eintreffens.

     R1 IDENTITAET   Eine Bar wird durch ihren Zeiteimer bestimmt, nicht
                     durch ihren Zeitstempel. Der Eimer entsteht aus der
                     Ortszeit der Boerse - deshalb ueberlebt er die
                     Zeitumstellung.
     R2 VORRANG      Bestaetigt schlaegt vorlaeufig. Eine historische Bar
                     ersetzt eine Live-Bar im selben Eimer, nie umgekehrt.
                     Bestaetigt ist eine Bar aber erst, wenn ihre Periode
                     abgelaufen ist: die laufende Kerze ist vorlaeufig,
                     ganz gleich woher sie kam. Sonst sperrte die erste
                     Bar des laufenden Intervalls jeden Tick aus, der sie
                     verfeinern soll - und der Chart stuende still,
                     waehrend Daten hereinkommen.
     R3 REIHENFOLGE  Eine verspaetete Bar wird einsortiert, nicht angehaengt.
                     Trifft sie auf einen bestaetigten Eimer, wird sie
                     verworfen und gezaehlt.
     R4 ZUKUNFT      Ein Zeitstempel jenseits der Toleranz wird abgelehnt.
     R5 BEREINIGUNG  Eine Bar mit anderer Bereinigungsstufe als die Reihe
                     wird abgelehnt. Nicht umgerechnet - abgelehnt.
     R6 SPLIT        Eine Kapitalmassnahme macht die Reihe nachladepflichtig.
                     Es wird nichts weggerechnet und nichts geglaettet.
     R7 TICK         Ein Tick faltet in die LAUFENDE Bar: Hoch, Tief,
                     Schluss, Volumen. Ist die Periode abgelaufen, ist er
                     ein Nachzuegler und wird verworfen - ein
                     abgeschlossener Schlusskurs bewegt sich nicht mehr.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var MarketHours = isNode ? require("./market-hours.js") : global.VURealtime.MarketHours;
  var Staleness = isNode ? require("./staleness.js") : global.VURealtime.Staleness;

  var MERGE_VERSION = "bar-merge-1.0.0";

  /* Herkunftsstufen einer Bar, aufsteigend nach Vorrang (R2). */
  var ORIGINS = ["REALTIME_DEVELOPING", "REALTIME_CONFIRMED", "INTRADAY", "EOD", "HISTORICAL"];

  function originRank(o) {
    var i = ORIGINS.indexOf(o);
    return i === -1 ? -1 : i;
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  function toMs(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "number" && isFinite(v)) return v;
    if (v instanceof Date) return v.getTime();
    var t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }

  /**
   * Der Zeiteimer einer Bar (R1).
   *
   * Tagesbars: der Handelstag. Intraday: der Beginn des Intervalls,
   * gerechnet ab Sitzungsbeginn in Ortszeit der Boerse.
   *
   * Ab Sitzungsbeginn und nicht ab Mitternacht, weil sonst ein
   * 30-Minuten-Raster die Eroeffnung um 09:30 in der Mitte eines Eimers
   * treffen wuerde - und die erste Kerze des Tages waere eine halbe.
   */
  function bucketOf(bar, cfg) {
    var ms = toMs(bar.timestamp) !== null ? toMs(bar.timestamp) : toMs(bar.date);
    if (ms === null) return null;

    if (cfg.timeframe === "1D" || cfg.timeframe === "EOD") {
      /* Ein Handelstag ist ein Datum, kein Zeitpunkt. Wenn die Bar eines
         mitbringt, gilt es - es kommt vom Anbieter und ist bereits der
         Handelstag. */
      if (bar.date) return String(bar.date).slice(0, 10);
      var lp0 = MarketHours.localParts(ms, cfg.timezone);
      return lp0 ? lp0.date : null;
    }

    var lp = MarketHours.localParts(ms, cfg.timezone);
    if (!lp) return null;
    var intervalMin = Math.max(1, Math.round(Staleness.intervalMs(cfg.interval) / 60000));
    var offset = lp.minutesOfDay - cfg.sessionStartMin;
    var slot = Math.floor(offset / intervalMin) * intervalMin + cfg.sessionStartMin;
    /* Vor Sitzungsbeginn laeuft das Raster rueckwaerts weiter - eine
       Vorboersenbar bekommt so denselben deterministischen Eimer. */
    var hh = Math.floor(((slot % 1440) + 1440) % 1440 / 60);
    var mm = ((slot % 1440) + 1440) % 1440 % 60;
    return lp.date + "T" + pad2(hh) + ":" + pad2(mm);
  }

  /**
   * Erzeugt einen Reihenpuffer.
   *
   * @param {object} opts
   *   timeframe        "1D" | "1m" | "5m" | ...
   *   interval         Bar-Intervall fuer Intraday (Standard aus timeframe)
   *   adjustmentStatus Bereinigungsstufe der Reihe (R5)
   *   calendar/exchange Sitzungsgrenzen
   *   futureToleranceMs Toleranz gegen Uhrendrift (R4)
   *   maxBars          Ringpuffer-Grenze
   */
  function createSeries(opts) {
    opts = opts || {};
    var calendar = opts.calendar || MarketHours.BUILTIN_CALENDAR;
    var exchangeId = opts.exchange || MarketHours.DEFAULT_EXCHANGE;
    var ex = (calendar.exchanges && calendar.exchanges[exchangeId]) ||
             MarketHours.BUILTIN_CALENDAR.exchanges[MarketHours.DEFAULT_EXCHANGE];
    var sessions = ex.sessions || MarketHours.BUILTIN_CALENDAR.exchanges.XNYS.sessions;

    var cfg = {
      timeframe: opts.timeframe || "1D",
      interval: opts.interval || opts.timeframe || "1D",
      timezone: ex.timezone || "America/New_York",
      sessionStartMin: minutesOf(sessions.REGULAR.start),
      sessionEndMin: minutesOf(sessions.REGULAR.end),
      exchange: exchangeId,
      calendar: calendar,
      futureToleranceMs: opts.futureToleranceMs === undefined ? 5000 : opts.futureToleranceMs,
      maxBars: opts.maxBars || 20000
    };

    var adjustmentStatus = opts.adjustmentStatus === undefined ? null : opts.adjustmentStatus;
    var now = opts.now || function () { return Date.now(); };

    var bars = [];                    // aufsteigend nach bucket
    var index = Object.create(null);  // bucket -> Position
    var stats = {
      accepted: 0, replaced: 0, duplicates: 0, outOfOrder: 0,
      rejectedFuture: 0, rejectedAdjustment: 0, rejectedConfirmed: 0,
      rejectedMalformed: 0, ticks: 0, corporateActions: 0
    };
    var requiresReload = false;
    var reloadReason = null;

    /* Zwei Zaehler statt eines. `revision` steigt bei jeder Aenderung an
       der Reihe; `structuralRevision` nur, wenn sich etwas anderes als
       die letzte Bar geaendert hat.

       Der Unterschied ist der ganze Grund, warum ein Live-Chart bei
       hoher Tickfrequenz nicht einbricht: die Chartschicht muss dann
       nicht 600 Bars vergleichen, um festzustellen, dass sich nur der
       Schlusskurs der laufenden Kerze bewegt hat - und schon gar nicht
       bei jedem Tick eine Kopie der ganzen Reihe anfertigen. */
    var revision = 0;
    var structuralRevision = 0;

    function touch(strukturell) {
      revision++;
      if (strukturell) structuralRevision++;
    }

    function minutesOf(hhmm) {
      var p = String(hhmm || "0:0").split(":");
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }

    function reindex(from) {
      for (var i = from || 0; i < bars.length; i++) index[bars[i].bucket] = i;
    }

    /* Einfuegeposition per Bisektion. Ein verspaeteter Nachzuegler in
       einer Reihe mit 5.000 Bars soll nicht die ganze Reihe sortieren. */
    function insertPos(bucket) {
      var lo = 0, hi = bars.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (bars[mid].bucket < bucket) lo = mid + 1; else hi = mid;
      }
      return lo;
    }

    /* Baut die kanonische Innenform einer Bar. Vendor-Felder kommen hier
       nicht an - der Adapter hat sie bereits abgeraeumt. */
    /* Der Eimer, in dem die Gegenwart liegt.
       Gemerkt je Minute, und das ist keine Naeherung: der Eimer haengt an
       der Minute der Boersenortszeit, und die wechselt genau dann, wenn
       auch die Minute seit Epoche wechselt - Zeitzonen versetzen um volle
       Minuten. Der Schluessel ist damit exakt so fein wie noetig.

       Ohne diese Zeile kostet jeder Tick einen zweiten Kalenderaufruf:
       einen fuer seinen eigenen Zeitstempel, einen fuer die Gegenwart.
       Gemessen war das die Haelfte der Zeit, die ein Tick ueberhaupt
       braucht. */
    var bucketMemoKey = null;
    var bucketMemoValue = null;
    function currentBucket() {
      var key = Math.floor(now() / 60000);
      if (key !== bucketMemoKey) {
        bucketMemoKey = key;
        bucketMemoValue = bucketOf({ timestamp: now() }, cfg);
      }
      return bucketMemoValue;
    }

    /* Ist die Periode dieses Eimers vorbei? Der Vergleich laeuft ueber
       die Eimernamen und nicht ueber Zeitrechnung: die Namen entstehen
       aus der Ortszeit der Boerse und sind darum in derselben Ordnung
       wie die Zeit selbst - auch ueber die Zeitumstellung hinweg. */
    function bucketClosed(bucket, current) {
      var jetzt = current === undefined ? currentBucket() : current;
      if (jetzt === null) return true;
      return bucket < jetzt;
    }

    function normalize(raw, origin) {
      var bucket = bucketOf(raw, cfg);
      if (bucket === null) return null;
      if (!isNum(raw.close)) return null;
      var ts = toMs(raw.timestamp);
      if (ts === null) ts = toMs(raw.date);
      var session = MarketHours.sessionAt(ts, { calendar: cfg.calendar, exchange: cfg.exchange });
      return {
        bucket: bucket,
        timestamp: ts,
        date: String(raw.date || bucket).slice(0, 10),
        open: isNum(raw.open) ? raw.open : raw.close,
        high: isNum(raw.high) ? raw.high : raw.close,
        low: isNum(raw.low) ? raw.low : raw.close,
        close: raw.close,
        volume: isNum(raw.volume) ? raw.volume : 0,
        currency: raw.currency || null,
        adjustmentStatus: raw.adjustmentStatus === undefined ? null : raw.adjustmentStatus,
        splitFactor: isNum(raw.splitFactor) ? raw.splitFactor : null,
        dividend: isNum(raw.dividend) ? raw.dividend : null,
        origin: origin,
        /* Nur eine Momentaufnahme fuer den internen Gebrauch. Nach aussen
           wird sie in copy() neu berechnet: eine Kerze wird geschlossen,
           weil Zeit vergeht, nicht weil jemand sie anfasst. Ein bei der
           Aufnahme eingefrorener Wert bliebe fuer immer "laufend" - und
           genau darueber liesse sich ein abgeschlossener Schlusskurs
           nachtraeglich bewegen. */
        confirmed: bucketClosed(bucket),
        sessionType: cfg.timeframe === "1D" || cfg.timeframe === "EOD"
          ? "AGGREGATED"
          : (session.phase === "REGULAR" ? "REGULAR" : "EXTENDED"),
        receivedAt: toMs(raw.receivedAt) === null ? now() : toMs(raw.receivedAt),
        source: raw.source || null,
        dataClass: raw.dataClass || null
      };
    }

    /* R5. Eine Reihe ohne festgelegte Stufe uebernimmt die der ersten
       Bar - danach ist sie gebunden. Die Alternative waere, still
       umzurechnen, und das ginge nur mit Annahmen ueber Dividenden, die
       hier niemand hat. */
    function adjustmentConflict(bar) {
      if (bar.adjustmentStatus === null) return false;
      if (adjustmentStatus === null) { adjustmentStatus = bar.adjustmentStatus; return false; }
      return bar.adjustmentStatus !== adjustmentStatus;
    }

    function result(action, bar, reason) {
      return { action: action, bucket: bar ? bar.bucket : null, reason: reason || null,
               requiresReload: requiresReload };
    }

    var api = {
      version: MERGE_VERSION,
      config: function () { return JSON.parse(JSON.stringify(cfg)); },
      adjustmentStatus: function () { return adjustmentStatus; },
      stats: function () { return JSON.parse(JSON.stringify(stats)); },
      requiresReload: function () { return requiresReload; },
      reloadReason: function () { return reloadReason; },
      clearReload: function () { requiresReload = false; reloadReason = null; },

      /* Zwei Zaehler fuer die Chartschicht: hat sich etwas geaendert, und
         war es mehr als die letzte Bar? Beides ohne die Reihe anzufassen. */
      revision: function () { return revision; },
      structuralRevision: function () { return structuralRevision; },

      /** Die Reihe. Kopie, damit ein Aufrufer sie nicht von aussen umbaut. */
      bars: function () {
        var jetzt = currentBucket();
        return bars.map(function (b) { return copy(b, jetzt); });
      },

      /**
       * Die letzten n Bars. Der uebliche Weg fuer den Chart: er zeichnet
       * ein Fenster, keine zwanzig Jahre - und eine Kopie der ganzen
       * Reihe bei jedem Tick ist genau der Aufwand, den §23 ausschliesst.
       */
      tail: function (n) {
        var von = n && n > 0 && n < bars.length ? bars.length - n : 0;
        var jetzt = currentBucket();
        var out = [];
        for (var i = von; i < bars.length; i++) out.push(copy(bars[i], jetzt));
        return out;
      },
      length: function () { return bars.length; },
      last: function () { return bars.length ? copy(bars[bars.length - 1]) : null; },
      at: function (i) { return bars[i] ? copy(bars[i]) : null; },
      byBucket: function (b) { return index[b] === undefined ? null : copy(bars[index[b]]); },

      /** Laeuft die Periode dieses Eimers noch? Fuer Aufrufer, die es
          wissen muessen, ohne die Bar zu holen. */
      isClosed: function (bucket) { return bucketClosed(bucket); },

      /**
       * Setzt die Historie. Ersetzt die Reihe vollstaendig - die Historie
       * ist die Wahrheit, an die Live-Daten anschliessen, nicht umgekehrt.
       */
      seed: function (list, origin) {
        bars = [];
        index = Object.create(null);
        var o = origin || "HISTORICAL";
        (list || []).forEach(function (raw) {
          var bar = normalize(raw, o);
          if (!bar) { stats.rejectedMalformed++; return; }
          if (adjustmentConflict(bar)) { stats.rejectedAdjustment++; return; }
          if (index[bar.bucket] !== undefined) { stats.duplicates++; bars[index[bar.bucket]] = bar; return; }
          index[bar.bucket] = bars.length;
          bars.push(bar);
        });
        bars.sort(function (a, b) { return a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0; });
        reindex(0);
        stats.accepted += bars.length;
        touch(true);
        return bars.length;
      },

      /**
       * Nimmt eine einzelne Bar auf. Der Kern des Merges.
       * @returns {object} {action: "appended"|"inserted"|"replaced"|"rejected"|"ignored", ...}
       */
      applyBar: function (raw, origin) {
        var bar = normalize(raw, origin || "INTRADAY");
        if (!bar) { stats.rejectedMalformed++; return result("rejected", null, "malformed"); }

        /* R4 - Zukunft. */
        if (bar.timestamp !== null && bar.timestamp > now() + cfg.futureToleranceMs) {
          stats.rejectedFuture++;
          return result("rejected", bar, "future");
        }
        /* R5 - Bereinigung. */
        if (adjustmentConflict(bar)) {
          stats.rejectedAdjustment++;
          return result("rejected", bar, "adjustmentMismatch");
        }
        /* R6 - Kapitalmassnahme. Die Bar wird aufgenommen, aber die Reihe
           gilt als nachladepflichtig: ein Split aendert jeden Kurs davor,
           und eine Reihe, in der nur die neuen Bars den neuen Massstab
           tragen, zeigt einen Absturz, den es nie gab. */
        if ((bar.splitFactor !== null && bar.splitFactor !== 1) ||
            (bar.dividend !== null && bar.dividend > 0 && adjustmentStatus === "TOTAL_RETURN")) {
          requiresReload = true;
          reloadReason = bar.splitFactor !== null && bar.splitFactor !== 1
            ? "split:" + bar.bucket : "dividend:" + bar.bucket;
          stats.corporateActions++;
        }

        var pos = index[bar.bucket];
        if (pos === undefined) {
          var at = insertPos(bar.bucket);
          if (at === bars.length) {
            bars.push(bar);
            index[bar.bucket] = at;
            stats.accepted++;
            var beschnitten = trim();
            /* Anhaengen ist nicht strukturell - es sei denn, vorne fiel
               dabei etwas heraus. */
            touch(beschnitten);
            return result("appended", bar);
          }
          /* R3 - verspaetet, aber neu: einsortieren. */
          bars.splice(at, 0, bar);
          reindex(at);
          stats.accepted++;
          stats.outOfOrder++;
          trim();
          touch(true);
          return result("inserted", bar);
        }

        /* R2 - derselbe Eimer ist schon da. Wer hat Vorrang?
           Der Rang entscheidet nur ueber abgeschlossene Perioden. In der
           laufenden gilt die juengste Angabe: der Anbieter aggregiert
           dieselben Trades wie wir, und seine Bar ist fuer seine Periode
           die massgebliche. */
        var existing = bars[pos];
        if (bucketClosed(existing.bucket) && originRank(bar.origin) < originRank(existing.origin)) {
          stats.rejectedConfirmed++;
          return result("ignored", bar, "lowerPrecedence");
        }
        if (identical(existing, bar)) {
          stats.duplicates++;
          return result("ignored", bar, "duplicate");
        }
        bar.receivedAt = bar.receivedAt || existing.receivedAt;
        bars[pos] = bar;
        stats.replaced++;
        touch(pos !== bars.length - 1);
        return result("replaced", bar);
      },

      /**
       * Nimmt mehrere Bars auf und meldet die Bilanz. Der uebliche Weg
       * beim Nachladen nach einem Verbindungsabbruch (§11).
       */
      applyBars: function (list, origin) {
        var summary = { appended: 0, inserted: 0, replaced: 0, ignored: 0, rejected: 0 };
        (list || []).forEach(function (raw) {
          var r = api.applyBar(raw, origin);
          summary[r.action] = (summary[r.action] || 0) + 1;
        });
        summary.requiresReload = requiresReload;
        return summary;
      },

      /**
       * R7 - ein Tick faltet in die laufende Bar.
       *
       * Er erzeugt nie eine bestaetigte Bar: solange die Periode laeuft,
       * ist ihr Schluss eine Momentaufnahme und kein Schlusskurs. Wer das
       * verwechselt, laesst technische Indikatoren auf einem Wert rechnen,
       * der sich noch aendert - und bekommt Signale, die verschwinden.
       */
      applyTick: function (tick) {
        tick = tick || {};
        if (!isNum(tick.price)) { stats.rejectedMalformed++; return result("rejected", null, "malformed"); }
        var ts = toMs(tick.timestamp);
        if (ts === null) ts = now();
        if (ts > now() + cfg.futureToleranceMs) {
          stats.rejectedFuture++;
          return result("rejected", null, "future");
        }
        if (requiresReload) return result("ignored", null, "awaitingReload");

        var bucket = bucketOf({ timestamp: ts }, cfg);
        if (bucket === null) { stats.rejectedMalformed++; return result("rejected", null, "malformed"); }

        /* Ein Tick gehoert in die laufende Kerze - und nur dorthin.
           Ein Nachzuegler, dessen Periode inzwischen abgelaufen ist,
           wird verworfen und gezaehlt.

           Das kostet an der Intervallgrenze gelegentlich ein paar Stueck
           Volumen, und das ist der guenstigere der beiden Preise: die
           Gegenrichtung waere, einen abgeschlossenen Schlusskurs
           nachtraeglich zu bewegen. VU_REPAINTING_POLICY, Regel 2,
           schliesst das aus - und alles, was auf bestaetigten Bars
           rechnet, verliesse sich sonst auf einen Wert, der sich noch
           aendert. */
        if (bucketClosed(bucket)) {
          stats.rejectedConfirmed++;
          return result("ignored", null, "bucketClosed");
        }
        var pos = index[bucket];
        stats.ticks++;

        if (pos === undefined) {
          var seed = normalize({
            timestamp: ts, date: String(bucket).slice(0, 10),
            open: tick.price, high: tick.price, low: tick.price, close: tick.price,
            volume: isNum(tick.size) ? tick.size : 0,
            adjustmentStatus: adjustmentStatus,
            currency: tick.currency, source: tick.source, dataClass: tick.dataClass,
            receivedAt: tick.receivedAt
          }, "REALTIME_DEVELOPING");
          if (!seed) { stats.rejectedMalformed++; return result("rejected", null, "malformed"); }
          var at = insertPos(bucket);
          bars.splice(at, 0, seed);
          reindex(at);
          stats.accepted++;
          var beschnitten2 = trim();
          touch(at !== bars.length - 1 || beschnitten2);
          return result("appended", seed);
        }

        var b = bars[pos];
        if (tick.price > b.high) b.high = tick.price;
        if (tick.price < b.low) b.low = tick.price;
        b.close = tick.price;
        b.timestamp = ts;
        b.receivedAt = toMs(tick.receivedAt) === null ? now() : toMs(tick.receivedAt);
        if (isNum(tick.size)) b.volume += tick.size;
        else if (isNum(tick.cumulativeVolume)) b.volume = tick.cumulativeVolume;
        touch(pos !== bars.length - 1);
        return result("updated", b);
      },

      /**
       * Welche Eimer fehlen zwischen zwei Zeitpunkten? Nach einem
       * Verbindungsabbruch die Frage, die den Nachladebereich bestimmt.
       * Bewusst als Zeitraum und nicht als Eimerliste: der Nachladeruf
       * geht mit von/bis an den Anbieter, nicht mit 240 Einzelabfragen.
       */
      gapSince: function (sinceMs) {
        var from = toMs(sinceMs);
        if (from === null) return null;
        var lastConfirmed = null;
        for (var i = bars.length - 1; i >= 0; i--) {
          if (bars[i].confirmed) { lastConfirmed = bars[i]; break; }
        }
        var start = lastConfirmed ? lastConfirmed.timestamp : from;
        return { fromMs: Math.min(start, from), toMs: now(),
                 from: new Date(Math.min(start, from)).toISOString(),
                 to: new Date(now()).toISOString(),
                 lastConfirmedBucket: lastConfirmed ? lastConfirmed.bucket : null };
      },

      /** Der Zeitstempel des juengsten Datenstands - fuer die Staleness. */
      lastTimestamp: function () {
        return bars.length ? bars[bars.length - 1].timestamp : null;
      },
      lastReceivedAt: function () {
        return bars.length ? bars[bars.length - 1].receivedAt : null;
      }
    };

    function trim() {
      if (bars.length <= cfg.maxBars) return false;
      var drop = bars.length - cfg.maxBars;
      bars.splice(0, drop);
      index = Object.create(null);
      reindex(0);
      return true;
    }

    function identical(a, b) {
      return a.open === b.open && a.high === b.high && a.low === b.low &&
             a.close === b.close && a.volume === b.volume && a.origin === b.origin;
    }

    /* `current` wird einmal je Abruf berechnet und durchgereicht - bei
       600 Bars je Zeichnung waere ein Kalenderaufruf pro Bar der
       teuerste Teil der ganzen Schleife. */
    function copy(b, current) {
      var o = {};
      Object.keys(b).forEach(function (k) { o[k] = b[k]; });
      o.confirmed = bucketClosed(b.bucket, current);
      return o;
    }

    return api;
  }

  var api = {
    MERGE_VERSION: MERGE_VERSION,
    ORIGINS: ORIGINS,
    originRank: originRank,
    bucketOf: bucketOf,
    createSeries: createSeries
  };

  if (isNode) module.exports = api;
  else {
    global.VURealtime = global.VURealtime || {};
    global.VURealtime.BarMerge = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
