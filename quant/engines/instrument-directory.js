/* =========================================================================
   VISION UNIVERSE — instrument-directory.js

   DER FRONTEND-VERTRAG (§40).

   Die Oberflaeche fragt nicht "gib mir Tiingo-Daten" und nicht "gib mir
   die SEC-Kennzahl". Sie fragt:

       getInstrument(symbol)
       getPrice(instrument)
       getPriceHistory(instrument)
       getFundamentals(instrument)
       getSimilarStocks(instrument)

   Welcher Anbieter die Antwort traegt, ist Sache der Datenschicht. In der
   Oberflaeche kommt der Name eines Anbieters nicht vor.

   WAS DIESES MODUL NICHT TUT: das Universum laden.

   Bei 5.700 Instrumenten waere der Master rund 4 MB, bei 25.000 rund
   18 MB. Geladen wird immer nur die Scherbe, in der die gesuchte Zeile
   liegt - zwei Zeichen des Kuerzels bestimmen sie. Eine Suchanfrage
   kostet damit 5 bis 9 Kilobyte, nicht das Universum (§16, §19, §49).

   JEDE ANTWORT TRAEGT IHREN STATUS.

   Es gibt kein null ohne Grund. `{ status: "NOT_DELIVERED" }` heisst
   etwas anderes als `{ status: "NOT_IN_UNIVERSE" }`, und die Oberflaeche
   soll den Unterschied zeigen koennen, statt beides als leeres Feld zu
   rendern.

   Laeuft in Node und im Browser.
   ========================================================================= */
(function (global) {
  "use strict";

  var isNode = (typeof module !== "undefined" && module.exports);
  var Master = isNode ? require("./company-master.js") : global.VUCompanyMaster;

  var VERSION = "instrument-directory-1.0.0";
  var DEFAULT_BASE = "/quant/data/universe/";

  function upper(v) { return v === null || v === undefined ? "" : String(v).trim().toUpperCase(); }

  /* Dieselben Wortabschneider wie im Indexbau. Sie muessen
     uebereinstimmen: wird hier anders zerlegt als beim Bauen, sucht die
     Oberflaeche in einer Scherbe, in der der Treffer nie gelandet ist. */
  var NAME_STOPWORDS = {
    INC: 1, INCORPORATED: 1, CORP: 1, CORPORATION: 1, CO: 1, COMPANY: 1, LTD: 1,
    LIMITED: 1, LLC: 1, LP: 1, PLC: 1, SA: 1, NV: 1, AG: 1, THE: 1, CLASS: 1,
    CL: 1, COM: 1, COMMON: 1, STOCK: 1, SHARES: 1, SHS: 1, HOLDING: 1,
    HOLDINGS: 1, GROUP: 1, TRUST: 1, NEW: 1, AMERICAN: 1, DEPOSITARY: 1,
    ADR: 1, ADS: 1, SPONSORED: 1
  };

  function defaultLoader() {
    if (!isNode && global.QuantShell && global.QuantShell.loadJSON) {
      return function (path) { return global.QuantShell.loadJSON(path); };
    }
    if (typeof fetch === "function") {
      return function (path) {
        return fetch(path).then(function (res) {
          if (!res.ok) { var e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
          return res.json();
        });
      };
    }
    return function () { return Promise.reject(new Error("Kein Lader konfiguriert.")); };
  }

  /**
   * @param {object} [options]
   *   base      Pfad des Masters (Standard /quant/data/universe/).
   *   loadJSON  Lader. Muss ein Promise liefern.
   *   deliveredBase  Pfad der ausgelieferten Discover-Payloads.
   */
  function create(options) {
    options = options || {};
    var base = options.base || DEFAULT_BASE;
    var deliveredBase = options.deliveredBase || "/discover/data/";
    var load = options.loadJSON || defaultLoader();

    var cache = { manifest: null, searchManifest: null, shards: {}, sym: {}, name: {}, missing: {} };

    function loadOnce(key, path) {
      if (cache[key]) return cache[key];
      cache[key] = load(path);
      return cache[key];
    }

    function manifest() { return loadOnce("manifest", base + "master-manifest.json"); }
    function searchManifest() { return loadOnce("searchManifest", base + "search/manifest.json"); }

    /* Welche Scherben es gibt. Das Manifest weiss es, und das ist der
       Unterschied zwischen "nicht vorhanden" und einem 404 in der Konsole.

       Eine Scherbe blind anzufragen und den Fehlschlag abzufangen
       funktioniert - aber der Browser protokolliert trotzdem. Bei einer
       Suche nach "ZZ" ist das kein Fehler der Anwendung und sieht
       trotzdem aus wie einer. Gefunden hat das die bestehende
       Browser-Pruefung des Discover-Moduls, nicht die neue. */
    function shardSets() {
      if (cache.shardSets) return cache.shardSets;
      cache.shardSets = searchManifest().then(function (sm) {
        var sets = { sym: {}, name: {} };
        (sm.sym || []).forEach(function (r) { sets.sym[r.shard] = true; });
        (sm.name || []).forEach(function (r) { sets.name[r.shard] = true; });
        return sets;
      }).catch(function () { return null; });
      return cache.shardSets;
    }

    /* Eine fehlende Scherbe ist kein Fehler, sondern die Antwort "dieses
       Kuerzel gibt es nicht". Sie wird gemerkt, damit nicht jede
       Tastatureingabe dieselbe Anfrage erzeugt. */
    function loadShard(kind, key) {
      var path = kind === "instrument" ? base + "instruments/" + key + ".json"
                                       : base + "search/" + kind + "/" + key + ".json";
      var bucket = kind === "instrument" ? cache.shards : cache[kind];
      if (bucket[key]) return bucket[key];
      if (cache.missing[path]) return Promise.resolve(null);

      /* Instrumentenscherben und Kuerzelscherben entstehen aus derselben
         Menge: gibt es die eine nicht, gibt es die andere auch nicht. */
      var lookup = kind === "instrument" ? "sym" : kind;
      bucket[key] = shardSets().then(function (sets) {
        if (sets && !sets[lookup][key]) { cache.missing[path] = true; return null; }
        return load(path).catch(function () { cache.missing[path] = true; return null; });
      });
      return bucket[key];
    }

    /* ------------------------------------------------------ getInstrument

       Adressiert wird ueber das Kuerzel - so stehen die URLs heute, und
       so bleiben sie (§42). Eine instrumentId wird ebenfalls angenommen,
       braucht dann aber das Kuerzel dazu (aus einem Suchtreffer), weil
       aus der ID allein die Scherbe nicht folgt. */
    function getInstrument(ref) {
      var symbol = typeof ref === "string" ? upper(ref) : upper(ref && (ref.symbol || ref.s));
      var wantedId = typeof ref === "object" && ref ? (ref.instrumentId || ref.i || null) : null;
      if (!symbol) return Promise.resolve({ status: "BAD_REQUEST", instrument: null,
                                            reason: "Ohne Kuerzel ist kein Instrument adressierbar." });

      /* Eine bestehende securityId ("ref_NVDA", "ref_BRK_A") liegt in der
         Scherbe ihres KUERZELS, nicht in der von "RE". Der Praefix wird
         deshalb abgeschnitten, bevor die Scherbe bestimmt wird - sonst
         waere der Alias aus §41 im Browser nicht aufloesbar, obwohl er im
         Datensatz steht. */
      var scherbenschluessel = Master.shardKey(
        symbol.indexOf("REF_") === 0 ? symbol.slice(4) : symbol);

      return loadShard("instrument", scherbenschluessel).then(function (shard) {
        if (!shard) {
          return { status: "NOT_IN_UNIVERSE", instrument: null,
                   reason: "Kein Instrument mit diesem Kuerzel im Company Master." };
        }
        var rows = shard.instruments || [];
        var hit = null;
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (wantedId && r.instrumentId === wantedId) { hit = r; break; }
          if (!hit && upper(r.symbol) === symbol) hit = r;
          /* Aliase werden ohne Ruecksicht auf Gross-/Kleinschreibung
             verglichen: im Datensatz steht "ref_NVDA", in einer URL oder
             einem Aufruf steht schnell "REF_NVDA". */
          if (!hit && (r.legacyIds || []).some(function (a) { return upper(a) === symbol; })) hit = r;
        }
        if (!hit) {
          return { status: "NOT_IN_UNIVERSE", instrument: null,
                   reason: "Kein Instrument mit diesem Kuerzel im Company Master." };
        }
        /* Mehrere Listings unter einem Kuerzel (COHR liegt an NYSE UND
           NASDAQ): das Primaerlisting gewinnt, die anderen stehen daneben. */
        var alternates = rows.filter(function (r) {
          return upper(r.symbol) === symbol && r.instrumentId !== hit.instrumentId;
        });
        return { status: "OK", instrument: hit,
                 alternateListings: alternates.map(function (r) {
                   return { instrumentId: r.instrumentId, exchange: r.exchange,
                            active: r.active };
                 }) };
      });
    }

    /* ------------------------------------------------------------- Suche */

    function nameTokens(query) {
      return upper(query).replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/)
        .filter(function (t) { return t.length >= 2 && !NAME_STOPWORDS[t]; });
    }

    /**
     * Sucht im Company Master. Hoechstens zwei Scherben je Anfrage.
     *
     * @param {string} query
     * @param {object} [opts] { limit, minLength }
     */
    function search(query, opts) {
      opts = opts || {};
      var q = upper(query);
      var limit = opts.limit || 20;
      return searchManifest().then(function (sm) {
        var min = opts.minLength || (sm && sm.minQueryLengthForMasterLookup) || 2;
        /* Ein einzelnes Zeichen ist zu wenig fuer eine Namenssuche - aber
           nicht fuer ein einbuchstabiges Kuerzel. F, T, C und A sind
           Grossunternehmen, und "zu kurz" waere fuer sie schlicht falsch.
           Geladen wird dann genau die Scherbe dieses einen Buchstabens,
           und die ist winzig. */
        if (q.length === 1 && /^[A-Z0-9]$/.test(q)) {
          return loadShard("sym", Master.shardKey(q)).then(function (shard) {
            var pool = (shard && shard.entries) || [];
            return { status: "OK", shardsLoaded: shard ? 1 : 0,
                     entries: Master.rankMatches(pool, q, limit) };
          });
        }
        if (q.length < min) {
          return { status: "QUERY_TOO_SHORT", minLength: min, entries: [],
                   reason: "Ab " + min + " Zeichen wird das ganze Universum durchsucht." };
        }
        var keys = [{ kind: "sym", key: Master.shardKey(q) }];
        var tokens = nameTokens(q);
        for (var i = 0; i < tokens.length && keys.length < 3; i++) {
          keys.push({ kind: "name", key: Master.shardKey(tokens[i]) });
        }
        return Promise.all(keys.map(function (k) { return loadShard(k.kind, k.key); }))
          .then(function (shards) {
            var seen = {}, pool = [];
            shards.forEach(function (s) {
              if (!s) return;
              (s.entries || []).forEach(function (e) {
                if (seen[e.i]) return;
                seen[e.i] = true;
                pool.push(e);
              });
            });
            return { status: "OK", shardsLoaded: shards.filter(Boolean).length,
                     entries: Master.rankMatches(pool, q, limit) };
          });
      });
    }

    /* --------------------------------------------------- Datenfaehigkeiten

       Was die Oberflaeche zeigen DARF. Der Suchtreffer traegt die Liste
       der ausgelieferten Faehigkeiten mit; wer nur das Instrument hat,
       bekommt sie hier ueber die Scherbe. */
    function capabilities(entryOrInstrument) {
      var flags = (entryOrInstrument && entryOrInstrument.cap) || [];
      var out = {};
      Master.CAPABILITIES.forEach(function (c) { out[c] = flags.indexOf(c) >= 0; });
      return out;
    }

    /* ------------------------------------------------ Die uebrigen Fragen

       Alle vier folgen demselben Muster: die ausgelieferte Antwort, wenn
       es sie gibt, sonst ein benannter Grund. Kein Anbietername verlaesst
       diese Datei. */

    function deliveredStock(universeId, symbol) {
      var path = deliveredBase + "stocks/" + (universeId || "US_REAL") + "/" + upper(symbol) + ".json";
      return load(path).catch(function () { return null; });
    }

    function getPrice(ref, opts) {
      opts = opts || {};
      var symbol = typeof ref === "string" ? upper(ref) : upper(ref && ref.symbol);
      return deliveredStock(opts.universeId, symbol).then(function (payload) {
        if (payload && payload.price && payload.price.value !== null &&
            payload.price.value !== undefined) {
          return { status: "OK", value: payload.price.value,
                   changePercent: payload.changePercent ? payload.changePercent.value : null,
                   asOf: payload.asOf || null };
        }
        if (payload && payload.price && payload.price.status) {
          return { status: payload.price.status, value: null,
                   reason: "Der Kursstand wird fuer diesen Titel nicht ausgeliefert." };
        }
        return { status: "NOT_DELIVERED", value: null,
                 reason: "Fuer diesen Titel wird kein Kursstand ausgeliefert." };
      });
    }

    function getPriceHistory(ref, opts) {
      opts = opts || {};
      var symbol = typeof ref === "string" ? upper(ref) : upper(ref && ref.symbol);
      var path = deliveredBase + "series/" + (opts.universeId || "US_REAL") + "/" + symbol + ".json";
      return load(path).then(function (payload) {
        return { status: "OK", bars: payload.bars || null, source: "delivered" };
      }).catch(function () {
        return { status: "NOT_DELIVERED", bars: null,
                 reason: "Fuer diesen Titel liegt keine ausgelieferte Kursreihe vor. Der " +
                         "Datenweg kann sie liefern; die Reihen selbst bleiben bis zur " +
                         "Lizenzklaerung in der Arbeitsablage." };
      });
    }

    function getFundamentals(ref) {
      var symbol = typeof ref === "string" ? upper(ref) : upper(ref && ref.symbol);
      return load("/quant/data/sec/quant-factor-inputs.json").then(function (payload) {
        var rows = payload.companies || payload.rows || payload.securities || [];
        var list = Array.isArray(rows) ? rows : Object.values(rows);
        for (var i = 0; i < list.length; i++) {
          if (upper(list[i].ticker || list[i].symbol) === symbol) {
            return { status: "OK", fundamentals: list[i] };
          }
        }
        return { status: "NOT_DELIVERED", fundamentals: null,
                 reason: "Fuer diesen Titel liegen keine normalisierten Geschaeftszahlen vor." };
      }).catch(function () {
        return { status: "SOURCE_MISSING", fundamentals: null,
                 reason: "Die Fundamentalablage ist nicht ladbar." };
      });
    }

    /**
     * Aehnliche Titel - aus dem ganzen Master, nicht aus einer Teilmenge
     * (§36). Aehnlich heisst hier: dieselbe Boerse, dieselbe Gattung,
     * derselbe Sektor, wenn einer bekannt ist. Was ohne Sektor- und
     * Fundamentaldaten NICHT geht, ist eine inhaltliche Aehnlichkeit -
     * und das steht in der Antwort, nicht im Kommentar.
     */
    function getSimilarStocks(instrument, opts) {
      opts = opts || {};
      var limit = opts.limit || 12;
      if (!instrument || !instrument.symbol) {
        return Promise.resolve({ status: "BAD_REQUEST", entries: [] });
      }
      return loadShard("instrument", Master.shardKey(instrument.symbol)).then(function (shard) {
        var pool = (shard && shard.instruments) || [];
        var hits = pool.filter(function (r) {
          return r.instrumentId !== instrument.instrumentId &&
                 r.securityType === instrument.securityType &&
                 r.exchange === instrument.exchange &&
                 r.active !== false;
        }).slice(0, limit);
        return {
          status: hits.length ? "OK" : "NOT_DELIVERED",
          basis: "SAME_EXCHANGE_SAME_TYPE",
          basisNote: "Boerse und Gattung. Eine inhaltliche Aehnlichkeit braucht Sektor- oder " +
                     "Fundamentaldaten; beide liegen fuer das erweiterte Universum nicht vor.",
          entries: hits.map(function (r) {
            return { instrumentId: r.instrumentId, symbol: r.symbol, companyName: r.companyName,
                     exchange: r.exchange };
          })
        };
      });
    }

    return {
      VERSION: VERSION,
      base: base,
      manifest: manifest,
      searchManifest: searchManifest,
      getInstrument: getInstrument,
      search: search,
      capabilities: capabilities,
      getPrice: getPrice,
      getPriceHistory: getPriceHistory,
      getFundamentals: getFundamentals,
      getSimilarStocks: getSimilarStocks
    };
  }

  var api = { VERSION: VERSION, create: create, DEFAULT_BASE: DEFAULT_BASE };
  if (isNode) module.exports = api;
  else global.VUInstrumentDirectory = api;
})(typeof window !== "undefined" ? window : globalThis);
