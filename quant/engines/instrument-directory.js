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
   *   extensionBase  Optional canonical global listing directory; legacy defaults stay unchanged.
   */
  function create(options) {
    options = options || {};
    var base = options.base || DEFAULT_BASE;
    var deliveredBase = options.deliveredBase || "/discover/data/";
    var load = options.loadJSON || defaultLoader();
    var extensionBase = options.extensionBase ? String(options.extensionBase).replace(/\/+$/, "") + "/" : null;

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

    /* Additive listing directory. Never infer a global identity from a
       ticker-only US price/fundamental lookup. Explicit IDs are checked
       before any legacy data path is used. */
    var extensionCache = { manifest: null, instruments: {}, search: {}, searchPages: {}, history: {} };
    function extensionManifest() {
      if (!extensionBase) return Promise.resolve(null);
      if (!extensionCache.manifest) extensionCache.manifest = Promise.resolve().then(function () {
        return load(extensionBase + "manifest.json");
      }).then(function (m) {
        return m && m.schemaVersion === "global-market-1.0.0" ? m : null;
      }).catch(function () { return null; });
      return extensionCache.manifest;
    }
    function extensionShard(kind, key) {
      var bucket = extensionCache[kind];
      if (!bucket[key]) bucket[key] = extensionManifest().then(function (m) {
        var members = m && m[kind === "instruments" ? "instrumentShards" : "searchShards"] || [];
        if (!members.some(function (s) { return (typeof s === "string" ? s : s.shard) === key; })) return null;
        return load(extensionBase + kind + "/" + key + ".json");
      }).catch(function () { return null; });
      return bucket[key];
    }
    function foldSearch(value) { return upper(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
    function searchEntryMatches(row, folded) {
      return [row.ticker,row.symbol,row.companyName,row.name,row.exchange,row.mic,row.country,row.listingCountry,row.region,row.listingRegion,row.isin]
        .concat(row.aliases || []).some(function(value) { return value && foldSearch(value).indexOf(folded)>=0; });
    }
    function extensionSearchShard(key, query, opts) {
      return extensionShard("search",key).then(function(shard) {
        if(!shard || shard.schemaVersion!=="global-search-pages-1.0.0") return {shard:shard,hasMore:false,offset:0,pageRequests:0};
        var folded=foldSearch(query), terms=[folded].concat(nameTokens(folded).slice(0,2)).map(function(term){return term.replace(/[^A-Z0-9]/g,"");});
        var pages=(shard.pages || []).filter(function(page) {
          return page && typeof page.path==="string" && new RegExp("^"+key+"/[0-9]{4}\\.json$").test(page.path) &&
            terms.some(function(term){return term && page.firstTerm<=term+"\uffff" && page.lastTerm>=term;}) &&
            (!opts.listingCountry || (page.listingCountries || []).indexOf(opts.listingCountry)>=0) &&
            (!opts.listingRegion || (page.listingRegions || []).indexOf(opts.listingRegion)>=0);
        });
        var exactTerm=folded.replace(/[^A-Z0-9]/g,"");
        pages.sort(function(a,b){return Number((b.exactSymbols || []).indexOf(exactTerm)>=0)-Number((a.exactSymbols || []).indexOf(exactTerm)>=0);});
        var offset=0;
        var entries=[],seen={},loaded=0,limit=opts.limit || 20;
        function next() {
          if(offset>=pages.length || loaded>=2 || entries.filter(function(row){return searchEntryMatches(row,folded);}).length>=limit)
            return Promise.resolve({shard:{entries:entries},hasMore:offset<pages.length,offset:offset,pageRequests:loaded});
          var page=pages[offset++],path=extensionBase+"search/"+page.path;loaded++;
          if(!extensionCache.searchPages[path])extensionCache.searchPages[path]=Promise.resolve().then(function(){return load(path);}).catch(function(){return null;});
          return extensionCache.searchPages[path].then(function(payload){
            ((payload && payload.entries) || []).forEach(function(row){
              if(!validExtension(row) || seen[row.listingId] || (opts.listingCountry && row.listingCountry!==opts.listingCountry) || (opts.listingRegion && row.listingRegion!==opts.listingRegion))return;
              seen[row.listingId]=true;entries.push(row);
            });
            return next();
          });
        }
        return next();
      });
    }
    function explicitId(ref) {
      return ref && typeof ref === "object" ? (ref.listingId || ref.instrumentId || ref.i || ref.securityId || null) : null;
    }
    function refSymbol(ref) {
      return typeof ref === "string" ? upper(ref) : upper(ref && (ref.symbol || ref.ticker || ref.s));
    }
    function validExtension(row) {
      return row && /^vu_[a-f0-9]+$/.test(row.listingId) &&
        /^[A-Z0-9][A-Z0-9.\-]{0,31}$/.test(refSymbol(row)) &&
        (row.assetType === "EQUITY" || row.assetType === "ETF") &&
        /^[A-Z]{3}$/.test(row.tradingCurrency || "") && !!row.mic;
    }
    function extensionSecurityType(row) {
      return row.assetType === "ETF" ? "ETF" : row.listingType === "PREFERRED" ? "PREFERRED" : row.listingType === "ADR" ? "ADR" : (row.listingType === "UNKNOWN" || row.listingType === "PREFERRED_HINT") ? "EQUITY" : "COMMON_STOCK";
    }
    function extensionInstrument(row) {
      return Object.assign({}, row, { instrumentId: row.listingId,
        symbol: refSymbol(row), companyName: row.companyName || row.name || null,
        currency: row.tradingCurrency, securityType: extensionSecurityType(row) });
    }
    function findExtension(ref) {
      var symbol = refSymbol(ref), wanted = explicitId(ref);
      if (!symbol) return Promise.resolve({ status: "BAD_REQUEST", instrument: null });
      return extensionShard("instruments", Master.shardKey(symbol)).then(function (shard) {
        var rows = ((shard && shard.instruments) || []).filter(function (r) {
          return validExtension(r) && refSymbol(r) === symbol &&
            (!ref.mic || ref.mic === r.mic) &&
            (!ref.exchange || upper(ref.exchange) === upper(r.exchange));
        });
        var hits = wanted ? rows.filter(function (r) {
          return r.listingId === wanted || r.securityId === wanted;
        }) : rows;
        if (hits.length !== 1) return { status: hits.length > 1 ? "AMBIGUOUS_IDENTITY" : "NOT_IN_UNIVERSE", instrument: null };
        return { status: "OK", instrument: extensionInstrument(hits[0]),
          alternateListings: rows.filter(function (r) { return r.listingId !== hits[0].listingId; }).map(function (r) {
            return { instrumentId: r.listingId, listingId: r.listingId, exchange: r.exchange, mic: r.mic, active: r.active };
          }) };
      });
    }
    function findLegacy(ref) {
      var wanted = explicitId(ref), symbol = refSymbol(ref);
      if (!symbol) return Promise.resolve({ status: "BAD_REQUEST", instrument: null });
      return loadShard("instrument", Master.shardKey(symbol.indexOf("REF_") === 0 ? symbol.slice(4) : symbol)).then(function (shard) {
        var rows = ((shard && shard.instruments) || []).filter(function (r) {
          return (upper(r.symbol) === symbol || (r.legacyIds || []).some(function (id) { return upper(id) === symbol; })) &&
            (!wanted || r.instrumentId === wanted || r.listingId === wanted || (r.legacyIds || []).includes(wanted)) &&
            (!ref.mic || ref.mic === r.mic) && (!ref.exchange || upper(ref.exchange) === upper(r.exchange));
        });
        if (!rows.length) return { status: "NOT_IN_UNIVERSE", instrument: null };
        var primary = rows.filter(function (r) { return r.primaryListing === true; });
        if (rows.length > 1 && (wanted || primary.length !== 1)) return { status: "AMBIGUOUS_IDENTITY", instrument: null };
        return { status: "OK", instrument: rows.length === 1 ? rows[0] : primary[0], alternateListings: [] };
      });
    }
    function getExtendedInstrument(ref) {
      var wanted = explicitId(ref), symbol = refSymbol(ref), venue = ref && typeof ref === "object" && (ref.mic || ref.exchange);
      if (ref && ref.universeId === "GLOBAL_MARKET") return findExtension(ref);
      // Bare ticker requests keep the original US lookup and aliases.
      if (!wanted && !venue) return getInstrument(symbol).then(function (result) {
        return result.status === "NOT_IN_UNIVERSE" ? findExtension(ref) : result;
      });
      // Explicit identity/venue constraints must never fall back to an
      // unconstrained ticker after a miss, including for existing US rows.
      return findLegacy(ref).then(function (result) {
        return result.status === "NOT_IN_UNIVERSE" ? findExtension(ref) : result;
      });
    }
    function compactExtension(row) {
      if (!validExtension(row)) return null;
      var flags = ["HAS_PROFILE"];
      (row.cap || []).forEach(function(flag){if(["HAS_PRICE_SNAPSHOT","HAS_PRICE_HISTORY"].indexOf(flag)>=0 && flags.indexOf(flag)<0)flags.push(flag);});
      if (row.price && Number.isFinite(row.price.value) && row.price.value > 0 && flags.indexOf("HAS_PRICE_SNAPSHOT")<0) flags.push("HAS_PRICE_SNAPSHOT");
      var historyCoverage = row.coverage && (row.coverage.price_history || row.coverage.priceHistory);
      if (row.historyPath && (historyCoverage === "FULL" || historyCoverage === "PARTIAL") && flags.indexOf("HAS_PRICE_HISTORY")<0) flags.push("HAS_PRICE_HISTORY");
      return Object.assign({}, row, { i: row.listingId, li: row.listingId, s: refSymbol(row),
        n: row.companyName || row.name || null, x: row.exchange, c: row.listingCountry || row.country,
        cc: row.country, rg: row.region || row.listingRegion || null, u: row.tradingCurrency, ci: row.companyId || null,
        t: extensionSecurityType(row), a: row.active === false ? 0 : 1, cap: flags });
    }
    function searchExtended(query, opts) {
      opts = opts || {};
      var q = upper(query), limit = opts.limit || 20;
      function fold(value) { return upper(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
      var folded = fold(q), keys = [Master.shardKey(folded)];
      nameTokens(folded).slice(0, 2).forEach(function (token) {
        var key = Master.shardKey(token); if (keys.indexOf(key) < 0) keys.push(key);
      });
      var legacySearch = opts.extensionOnly ? Promise.resolve({ status: "OK", entries: [], shardsLoaded: 0 }) : search(query, opts);
      return Promise.all([legacySearch, Promise.all(keys.map(function (key) { return extensionSearchShard(key, query, opts); }))]).then(function (results) {
        var legacy = results[0], pageResults = results[1], shards = pageResults.map(function(result){return result.shard;});
        if (legacy.status !== "OK") return legacy;
        var pool = legacy.entries.slice(), extra = [], seen = {};
        pool.forEach(function (r) { seen[r.li || r.i] = true; });
        shards.forEach(function (shard) {
          ((shard && shard.entries) || []).forEach(function (row) {
            var compact = compactExtension(row);
            if (!compact || (opts.listingCountry && compact.listingCountry !== opts.listingCountry) ||
                (opts.listingRegion && compact.listingRegion !== opts.listingRegion)) return;
            // Reused accepted listing IDs represent one listing. Enrich
            // that same search identity with its canonical extension row.
            if (seen[compact.i]) pool = pool.filter(function (entry) { return (entry.li || entry.i) !== compact.i; });
            if (extra.some(function (entry) { return entry.i === compact.i; })) return;
            seen[compact.i] = true; extra.push(compact);
          });
        });
        // Global metadata remains searchable, including accented names and
        // identifiers. Keep the established US ranking ahead of additional
        // metadata matches and retain distinct listing identities.
        var exact = [], starts = [], names = [], contains = [], metadata = [];
        extra.forEach(function (entry) {
          var symbol = fold(entry.s), name = fold(entry.n);
          if (symbol === folded) exact.push(entry);
          else if (symbol.indexOf(folded) === 0) starts.push(entry);
          else if (name.indexOf(folded) === 0) names.push(entry);
          else if (name.indexOf(folded) >= 0 || symbol.indexOf(folded) >= 0) contains.push(entry);
          else if ([entry.exchange, entry.mic, entry.country, entry.listingCountry, entry.region, entry.listingRegion, entry.isin].concat(entry.aliases || [])
            .some(function (value) { return value && fold(value).indexOf(folded) >= 0; })) metadata.push(entry);
        });
        var ranked = Master.rankMatches(pool.concat(exact, starts, names, contains), q, 0);
        // Folded matches omitted by the legacy ranker (e.g. Nestlé/NESTLE)
        // and metadata matches follow ordinary symbol/name results.
        exact.concat(starts, names, contains, metadata).forEach(function (entry) {
          if (!ranked.some(function (row) { return row.i === entry.i; })) ranked.push(entry);
        });
        var more=pageResults.some(function(result){return result.hasMore;});
        return { status: "OK", shardsLoaded: legacy.shardsLoaded + shards.filter(Boolean).length,
          ...(more ? {truncated:true} : {}), entries: ranked.slice(0, limit) };
      });
    }
    function extensionData(ref, callback, legacyCallback) {
      var legacyLookup = ref && ref.universeId === "GLOBAL_MARKET"
        ? Promise.resolve({ status: "NOT_IN_UNIVERSE" }) : findLegacy(ref);
      return legacyLookup.then(function (legacy) {
        if (legacy.status === "OK") return legacyCallback(legacy.instrument);
        if (legacy.status !== "NOT_IN_UNIVERSE") return { status: legacy.status, value: null, bars: null, fundamentals: null };
        return findExtension(ref).then(function (result) {
          if (result.status !== "OK") return { status: result.status, value: null, bars: null, fundamentals: null,
            reason: "The requested listing identity is not available." };
          return callback(result.instrument);
        });
      });
    }
    function getExtendedPrice(ref, opts) {
      if (!explicitId(ref) && !(ref && typeof ref === "object" && (ref.mic || ref.exchange || ref.universeId === "GLOBAL_MARKET"))) return getPrice(ref, opts);
      return extensionData(ref, function (row) {
        var price = row.price;
        if (!price || !Number.isFinite(price.value) || price.value <= 0) return { status: "NOT_DELIVERED", value: null };
        return { status: "OK", value: price.value, changePercent: null, asOf: price.asOf || null,
          currency: row.tradingCurrency, listingId: row.listingId,
          delayState: price.delayState || "EOD_ONLY", dataFrequency: "EOD",
          marketTimestamp: price.marketTimestamp || null, providerTimestamp: price.providerTimestamp || null, retrievedAt: price.retrievedAt || null };
      }, function (row) { return getPrice({ symbol: row.symbol }, opts); });
    }
    function getExtendedHistory(ref, opts) {
      if (!explicitId(ref) && !(ref && typeof ref === "object" && (ref.mic || ref.exchange || ref.universeId === "GLOBAL_MARKET"))) return getPriceHistory(ref, opts);
      return extensionData(ref, function (row) {
        // Resolve only an identifier-derived local path. Provider metadata
        // must never be able to point the browser at an arbitrary URL.
        var expected = "history/" + row.listingId + ".json";
        if (row.historyPath !== expected) return { status: "NOT_DELIVERED", bars: null };
        if (!extensionCache.history[row.listingId]) extensionCache.history[row.listingId] = Promise.resolve().then(function () {
          return load(extensionBase + expected);
        }).then(function (payload) {
          if (!payload || !Array.isArray(payload.bars) || !payload.bars.length ||
              (payload.listingId && payload.listingId !== row.listingId) ||
              (payload.currency && payload.currency !== row.tradingCurrency) ||
              (payload.tradingCurrency && payload.tradingCurrency !== row.tradingCurrency)) return { status: "NOT_DELIVERED", bars: null };
          return { status: "OK", bars: payload.bars, source: "delivered", listingId: row.listingId,
            currency: row.tradingCurrency, delayState: "EOD_ONLY", dataFrequency: "EOD",
            adjustmentStatus: payload.adjustmentStatus || "unknown", quality: payload.quality || null };
        }).catch(function () { return { status: "NOT_DELIVERED", bars: null }; });
        return extensionCache.history[row.listingId];
      }, function (row) { return getPriceHistory({ symbol: row.symbol }, opts); });
    }
    function getExtendedFundamentals(ref) {
      if (!explicitId(ref) && !(ref && typeof ref === "object" && (ref.mic || ref.exchange || ref.universeId === "GLOBAL_MARKET"))) return getFundamentals(ref);
      return extensionData(ref, function (row) {
        return { status: row.assetType === "ETF" ? "NOT_APPLICABLE" : "NOT_DELIVERED", fundamentals: null,
          reason: row.assetType === "ETF" ? "Company fundamentals do not apply to ETFs." : "Canonical company fundamentals are not delivered for this listing." };
      }, function (row) { return getFundamentals({ symbol: row.symbol }); });
    }

    return {
      VERSION: VERSION,
      base: base,
      manifest: manifest,
      searchManifest: searchManifest,
      getInstrument: extensionBase ? getExtendedInstrument : getInstrument,
      search: extensionBase ? searchExtended : search,
      capabilities: capabilities,
      getPrice: extensionBase ? getExtendedPrice : getPrice,
      getPriceHistory: extensionBase ? getExtendedHistory : getPriceHistory,
      getFundamentals: extensionBase ? getExtendedFundamentals : getFundamentals,
      getSimilarStocks: getSimilarStocks
    };
  }

  var api = { VERSION: VERSION, create: create, DEFAULT_BASE: DEFAULT_BASE };
  if (isNode) module.exports = api;
  else global.VUInstrumentDirectory = api;
})(typeof window !== "undefined" ? window : globalThis);
