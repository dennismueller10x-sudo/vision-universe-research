/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-master.js   (etf-master-1.0.0)

   Der ETF-Stamm: aus Anbieterzeilen wird ein kanonisches ETF-Verzeichnis.

   ENTITAETEN
     FUND         ein Sondervermoegen (Anbieter + normalisierter Fondsname)
     SHARE CLASS  eine Anteilsklasse des Fonds (z. B. "ETF Shares" eines
                  Vanguard-Fonds); ohne Beleg genau eine je Fonds
     LISTING      ein Ticker an einer Boerse in einer Waehrung

   Ziel: derselbe Fonds wird nicht doppelt gezaehlt, auch wenn er an
   mehreren Boersen oder unter mehreren Quellen auftaucht.

   ABLEITUNGEN AUS DEM NAMEN
     Anbieter, Assetklasse, Region, Index, Thema, Hebel und Short-Richtung
     werden aus dem vom Anbieter gelieferten Fondsnamen abgeleitet. Jede
     Ableitung traegt ihre Grundlage (basis: "NAME_PATTERN") und bleibt
     null, wenn der Name nichts hergibt. Felder ohne Quelle (TER,
     Fondsvolumen, Replikation, Ausschuettung, ISIN, Holdings) bleiben null
     und stehen in missingFields - sie werden nie geschaetzt.
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "etf-master-1.0.0";

  var FIELDS = ["symbol", "name", "exchange", "currency", "country", "assetClass", "issuer", "index",
    "category", "region", "sector", "theme", "leverage", "inverse", "distributionPolicy",
    "replicationMethod", "ter", "fundSize", "inceptionDate", "holdingsCount", "benchmark",
    "isin", "wkn", "tiingoAvailable", "priceHistoryAvailable"];
  /* Felder, die aus keiner angeschlossenen Quelle kommen koennen. */
  var NO_SOURCE_FIELDS = ["distributionPolicy", "replicationMethod", "ter", "fundSize", "holdingsCount", "isin", "wkn", "sector"];

  /* Marken -> Anbieter. Reihenfolge zaehlt: spezifisch vor allgemein. */
  var ISSUERS = [
    [/\bishares\b/i, "BlackRock (iShares)"], [/\bvanguard\b/i, "Vanguard"],
    [/\bspdr\b|state street/i, "State Street (SPDR)"], [/\binvesco\b/i, "Invesco"],
    [/\bschwab\b/i, "Schwab"], [/\bproshares\b/i, "ProShares"], [/\bdirexion\b/i, "Direxion"],
    [/\bft vest\b|\bfirst trust\b|^ft\b/i, "First Trust"], [/\bcolumbia\b/i, "Columbia Threadneedle"],
    [/\bpgim\b/i, "PGIM"], [/\bpacer\b/i, "Pacer"], [/\bcorgi\b/i, "Corgi"], [/\bdefiance\b/i, "Defiance"],
    [/\bt-rex\b/i, "REX Shares (T-Rex)"], [/\btradr\b/i, "Tradr"], [/\bleverage shares\b/i, "Leverage Shares"],
    [/\bgraniteshares\b/i, "GraniteShares"], [/\bgrayscale\b/i, "Grayscale"], [/\bbitwise\b/i, "Bitwise"],
    [/\bvaneck\b/i, "VanEck"], [/\b21shares\b/i, "21Shares"], [/\bjpmorgan\b/i, "J.P. Morgan"],
    [/\bnuveen\b/i, "Nuveen"], [/\bmfs\b/i, "MFS"], [/\bbaron\b/i, "Baron"], [/cohen & steers/i, "Cohen & Steers"],
    [/\bfranklin\b/i, "Franklin Templeton"], [/goldman sachs/i, "Goldman Sachs"], [/\balger\b/i, "Alger"],
    [/t\. rowe price/i, "T. Rowe Price"], [/\btouchstone\b/i, "Touchstone"], [/\bsimplify\b/i, "Simplify"],
    [/\binnovator\b/i, "Innovator"], [/\bvictoryshares\b/i, "VictoryShares"], [/\bkraneshares\b/i, "KraneShares"],
    [/american century/i, "American Century"], [/\bprincipal\b/i, "Principal"], [/\bdoubleline\b/i, "DoubleLine"],
    [/\bsofi\b/i, "SoFi"], [/\btema\b/i, "Tema"], [/\bwisdomtree\b/i, "WisdomTree"], [/\bglobal x\b/i, "Global X"],
    [/\bxtrackers\b/i, "DWS (Xtrackers)"], [/\bamundi\b/i, "Amundi"], [/\blyxor\b/i, "Amundi (Lyxor)"],
    [/\bhsbc\b/i, "HSBC"], [/\bubs\b/i, "UBS"], [/\bvegashares\b/i, "VegaShares"], [/\bark\b/i, "ARK"],
    [/\bdimensional\b/i, "Dimensional"], [/\bavantis\b/i, "Avantis"], [/\bfidelity\b/i, "Fidelity"],
    [/\bab\b/i, "AllianceBernstein"], [/\btidal\b/i, "Tidal"]
  ];

  var INDEXES = [
    [/s&p 500 ex s&p 100/i, "S&P 500 ex S&P 100"], [/s&p 500 equal weight/i, "S&P 500 Equal Weight"],
    [/s&p 500|\bspdr s&p 500\b/i, "S&P 500"], [/s&p midcap 400/i, "S&P MidCap 400"],
    [/nasdaq[- ]100/i, "Nasdaq-100"], [/russell 2000/i, "Russell 2000"], [/russell/i, "Russell (Familie)"],
    [/dow jones industrial average/i, "Dow Jones Industrial Average"], [/msci world/i, "MSCI World"],
    [/msci acwi|all country world/i, "MSCI ACWI"], [/msci emerging markets/i, "MSCI Emerging Markets"],
    [/msci eafe/i, "MSCI EAFE"], [/euro stoxx 50/i, "EURO STOXX 50"], [/ftse all-world/i, "FTSE All-World"],
    [/msci usa small-cap quality/i, "MSCI USA Small-Cap Quality Factor"], [/msci usa/i, "MSCI USA"]
  ];

  var REGIONS = [
    [/emerging markets?/i, "EMERGING_MARKETS"], [/developed markets ex-us|international developed|\beafe\b|ex-us/i, "DEVELOPED_EX_US"],
    [/euro stoxx|\beurope|\beurozone/i, "EUROPE"], [/\bglobal\b|\bworld\b|\bacwi\b|all-world/i, "GLOBAL"],
    [/\binternational\b/i, "INTERNATIONAL"], [/vietnam/i, "VIETNAM"], [/\bjapan\b/i, "JAPAN"], [/\bchina\b/i, "CHINA"],
    [/\bindia\b/i, "INDIA"], [/\bgermany\b|\bdax\b/i, "GERMANY"], [/\bnyc\b/i, "USA"],
    [/\bu\.s\.(?:a\.)?|\busa?\b|\busd\b|s&p 500|s&p midcap|nasdaq|russell|dow jones|treasury|california|\bmuni\b|\bqqq\b/i, "USA"]
  ];
  var REGION_LABEL = { EMERGING_MARKETS: "Schwellenländer", DEVELOPED_EX_US: "Industrieländer ohne USA", EUROPE: "Europa",
    GLOBAL: "Welt", INTERNATIONAL: "International", VIETNAM: "Vietnam", JAPAN: "Japan", CHINA: "China", INDIA: "Indien",
    GERMANY: "Deutschland", USA: "USA" };

  var THEMES = [
    [/\bagentic ai\b|artificial intelligence|\bai\b/i, "Künstliche Intelligenz"], [/electrification|power|thermal cooling/i, "Energie & Elektrifizierung"],
    [/\bspace\b/i, "Raumfahrt"], [/infrastructure/i, "Infrastruktur"], [/health care|healthcare/i, "Gesundheit"],
    [/natural resources/i, "Rohstoffe"], [/real estate|housing/i, "Immobilien"], [/coffee|energy drinks/i, "Konsum"],
    [/war machine|defen[cs]e/i, "Verteidigung"], [/billionaires/i, "Investoren-Strategie"],
    [/bitcoin|ether(eum)?\b|solana|\bxrp\b|dogecoin|crypto|chainlink|\bsui\b|zcash/i, "Krypto"],
    [/dividend/i, "Dividende"], [/quality/i, "Qualität"], [/\bvalue\b/i, "Value"], [/\bgrowth\b/i, "Wachstum"],
    [/small ?cap|smallcap|\bsmid\b/i, "Nebenwerte"], [/innovation/i, "Innovation"]
  ];

  function deriveIssuer(name) {
    for (var i = 0; i < ISSUERS.length; i++) if (ISSUERS[i][0].test(name)) return ISSUERS[i][1];
    return null;
  }
  function firstMatch(list, name) {
    for (var i = 0; i < list.length; i++) if (list[i][0].test(name)) return list[i][1];
    return null;
  }

  /** Hebel aus dem Namen: "2X", "Ultra" (2x), "UltraPro" (3x). */
  function leverageOf(name) {
    var m = name.match(/(?:^|[^\w.])(\d(?:\.\d+)?)\s?x\b/i);
    if (m) { var f = Number(m[1]); if (f > 1) return f; }
    if (/ultrapro/i.test(name)) return 3;
    if (/\bultra(short)?\b(?!\s+(income|bond|duration|term|municipal|government|treasury))/i.test(name)) return 2;
    return 1;
  }
  /** Short/Inverse nur bei eindeutigem Beleg - "Short Duration" ist kein Short-ETF. */
  function inverseOf(name, leverage) {
    if (/\binverse\b|\bbear\b/i.test(name)) return true;
    if (/\bultrashort\b(?!\s+(income|bond|duration|term|municipal|government|treasury))/i.test(name)) return true;
    if (leverage > 1 && /\bshort\b/i.test(name)) return true;
    if (/-1x\b/i.test(name)) return true;
    return false;
  }

  function assetClassOf(name) {
    if (/money market|treasury securities money/i.test(name)) return "MONEY_MARKET";
    if (/bitcoin|ether(eum)?\b|solana|\bxrp\b|dogecoin|crypto|chainlink|\bsui\b|zcash/i.test(name)) return "CRYPTO";
    if (/\bgold\b|silver|copper|palladium|platinum|commodit|\boil\b/i.test(name) && !/miners|enhanced options income/i.test(name)) return "COMMODITY";
    if (/real estate|\breit\b/i.test(name)) return "REAL_ESTATE";
    if (/\bbond\b|government securities|treasury|fixed income|\bmuni|municipal|credit|\bclo\b|\babs\b|mortgage|floating rate|inflation-protected|tips\b|ibonds|high yield|investment grade|securitized|ultrashort income|short duration|preferred/i.test(name)) return "BOND";
    if (/allocation|multi-asset/i.test(name)) return "MULTI_ASSET";
    if (/equit|stock|s&p|nasdaq|russell|dow jones|msci|cap\b|growth|value|dividend|quality|stoxx|qqq|small|mid ?cap|large|companies|innovation|infrastructure|health care|natural resources|electrification|\bai\b|space|leaders|durable|vietnam/i.test(name)) return "EQUITY";
    return null;
  }

  /** Strategieform: eine Option-, Puffer- oder Hebelstrategie ist kein klassischer Index-ETF. */
  function structureOf(name, leverage, inverse) {
    if (leverage > 1 || inverse) return "LEVERAGED_OR_INVERSE";
    if (/buffer|autocallable|barrier|covered call|options income|yieldboost|dual directional|target 15|hedged equity laddered/i.test(name)) return "OPTIONS_STRATEGY";
    if (/\bactive\b|enhanced|research enhanced|select|opportunit|flex\b|dynamic/i.test(name)) return "ACTIVE";
    return "INDEX_OR_UNSPECIFIED";
  }

  /** Einzelaktien-Hebel-ETF: "2X Long AMKR", "Ultra PLTR". */
  function singleStockOf(name, leverage) {
    if (leverage <= 1) return null;
    var m = name.match(/(?:long|short)\s+([A-Z]{2,5})\b(?!\s*(?:etf)?\s*$)/) || name.match(/(?:long|short)\s+([A-Za-z]{2,5})\s+(?:daily|etf)/i)
      || name.match(/ultra\s+([A-Z]{2,5})\b/);
    return m ? m[1].toUpperCase() : null;
  }

  /** Kategorie fuer Einsteiger: eine Zeile, die sagt, was das ist. */
  function categoryOf(r) {
    if (r.complex) return r.structure === "LEVERAGED_OR_INVERSE" ? "Hebel / Short" : (r.assetClass === "CRYPTO" ? "Krypto" : "Optionsstrategie");
    var ac = { EQUITY: "Aktien", BOND: "Anleihen", MONEY_MARKET: "Geldmarkt", COMMODITY: "Rohstoffe",
      CRYPTO: "Krypto", REAL_ESTATE: "Immobilien", MULTI_ASSET: "Mischfonds" }[r.assetClass] || "Nicht zugeordnet";
    if (r.region) ac += " " + (REGION_LABEL[r.region] || r.region);
    if (r.theme && ac.indexOf(r.theme) !== 0) ac += " · " + r.theme;
    return ac;
  }

  /** Fondsname normalisieren: Anteilsklassen-Suffixe weg, fuer die Fonds-Identitaet. */
  function fundKey(name) {
    return String(name || "").toLowerCase()
      .replace(/\b(etf|etn)\s+(shares|class|cl)\b.*$/, "")
      .replace(/\b(fund\s+)?etf\s+class\b.*$/, "")
      .replace(/\b(class|cl)\s+[a-z0-9]+\b/g, "")
      .replace(/\b(etf|etn|fund|trust|shares)\b/g, "")
      .replace(/[^a-z0-9&]+/g, " ").trim();
  }
  function shareClassOf(name) {
    var m = String(name || "").match(/\b(ETF Shares|ETF Class|Class [A-Z0-9]+|Investor Shares|Admiral Shares)\b/i);
    return m ? m[1] : null;
  }

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ("0000000" + (h >>> 0).toString(16)).slice(-8);
  }

  /** Belegt der Name ueberhaupt einen Fonds? (Schutz gegen Tickerkollisionen) */
  function nameIsFundLike(name) {
    return /\b(etf|etn|funds?|trust|shares|portfolio|ishares|spdr|proshares|vanguard|invesco qqq)\b/i.test(name || "");
  }
  /** Namen, die trotz "Trust/Fund" kein ETF sind (REIT, geschlossene Fonds, BDC). */
  function nameIsNotEtf(name) {
    return /realty trust|property trust|properties trust|mortgage trust|finance trust|royalty trust|hotel trust|lodging trust|homes trust|\binc\.?$|, inc|corp\b|corporation|lending fund|income fund, inc|opportunities fund$|\bbank\b|depositor/i.test(name || "")
      && !/\betf\b/i.test(name || "");
  }

  /**
   * Klassifiziert eine Rohzeile. `raw` = { symbol, name, exchange, currency, country,
   * securityType, firstTradeDate, lastTradeDate, active, source }.
   */
  function classify(raw) {
    var name = String(raw.name || "");
    var leverage = leverageOf(name);
    var inverse = inverseOf(name, leverage);
    var r = {
      symbol: raw.symbol, name: name || null, exchange: raw.exchange || null, currency: raw.currency || null,
      country: raw.country || null,
      issuer: deriveIssuer(name), index: raw.trackedIndex || firstMatch(INDEXES, name),
      region: firstMatch(REGIONS, name) || firstMatch(REGIONS, raw.trackedIndex || ""), theme: firstMatch(THEMES, name),
      assetClass: raw.assetClassHint || assetClassOf(name) || (leverage > 1 || inverse ? "EQUITY" : null),
      leverage: leverage, inverse: inverse,
      singleStockUnderlying: singleStockOf(name, leverage)
    };
    r.structure = structureOf(name, leverage, inverse);
    r.complex = r.structure === "LEVERAGED_OR_INVERSE" || r.structure === "OPTIONS_STRATEGY" || r.assetClass === "CRYPTO";
    r.category = categoryOf(r);
    r.management = /\bactive\b/i.test(name) ? "ACTIVE" : (r.index ? "PASSIVE" : null);
    return r;
  }

  /**
   * ETF-Kandidat? Beleg aus Gattung des Anbieters ODER eindeutigem Namen.
   * Liefert { candidate, basis, conflict }.
   */
  function etfEvidence(raw) {
    var name = String(raw.name || "");
    var typed = raw.securityType === "ETF" || raw.securityType === "ETN" || raw.securityType === "FUND";
    var named = /\b(etf|etn)\b/i.test(name) || /\b(ishares|proshares|spdr)\b/i.test(name) && !nameIsNotEtf(name);
    if (typed && name && !nameIsFundLike(name)) return { candidate: true, basis: "PROVIDER_TYPE", conflict: "NAME_WITHOUT_FUND_EVIDENCE" };
    if (typed && nameIsNotEtf(name)) return { candidate: true, basis: "PROVIDER_TYPE", conflict: "NAME_SUGGESTS_OPERATING_COMPANY" };
    if (typed) return { candidate: true, basis: "PROVIDER_TYPE", conflict: null };
    if (named && !nameIsNotEtf(name)) return { candidate: true, basis: "SECURITY_NAME", conflict: null };
    return { candidate: false, basis: null, conflict: null };
  }

  /**
   * Fuegt Zeilen mehrerer Quellen zu Listings zusammen und gruppiert Fonds.
   * Gleicher Ticker + gleiche Boerse = ein Listing. Gleicher Ticker an
   * verschiedenen Boersen = mehrere Listings (DUPLICATE_TICKER). Gleiche
   * Fondsidentitaet unter verschiedenen Tickern = ein Fonds, mehrere Listings.
   */
  function buildMaster(rows, opts) {
    opts = opts || {};
    var listings = {}, conflicts = [], dupTickers = {};
    (rows || []).forEach(function (raw) {
      if (!raw || !raw.symbol) return;
      var ev = etfEvidence(raw);
      if (!ev.candidate) return;
      raw = Object.assign({}, raw, { exchange: raw.exchange ? String(raw.exchange).toUpperCase() : null });
      var key = raw.symbol + "@" + (raw.exchange || "UNKNOWN");
      var existing = listings[key];
      if (existing) {
        existing.sources = existing.sources.concat(raw.source || "unknown").filter(function (v, i, a) { return a.indexOf(v) === i; });
        // Name: der fondsaehnliche gewinnt; Widerspruch wird protokolliert
        if (raw.name && existing.name && raw.name !== existing.name) {
          if (nameIsFundLike(raw.name) && !nameIsFundLike(existing.name)) { existing.name = raw.name; }
          existing.nameVariants = (existing.nameVariants || [existing.name]).concat(raw.name).filter(function (v, i, a) { return a.indexOf(v) === i; });
        }
        ["firstTradeDate", "lastTradeDate", "trackedIndex", "assetClassHint", "currency", "country"].forEach(function (f) { if (!existing.raw[f] && raw[f]) existing.raw[f] = raw[f]; });
        if (raw.active === false && existing.raw.active !== true) existing.raw.active = false;
        if (raw.active === true) existing.raw.active = true;
        return;
      }
      listings[key] = { key: key, raw: Object.assign({}, raw), name: raw.name || null, sources: [raw.source || "unknown"], evidence: ev };
    });

    var bySymbol = {};
    Object.keys(listings).forEach(function (k) { var s = listings[k].raw.symbol; (bySymbol[s] = bySymbol[s] || []).push(k); });
    Object.keys(bySymbol).forEach(function (s) { if (bySymbol[s].length > 1) dupTickers[s] = bySymbol[s]; });

    var funds = {}, out = [];
    Object.keys(listings).sort().forEach(function (k) {
      var L = listings[k], raw = Object.assign({}, L.raw, { name: L.name });
      var c = classify(raw);
      var fk = (c.issuer || "unknown") + "|" + fundKey(raw.name || raw.symbol);
      var fundId = "vu-etf-" + hash(fk);
      var conflict = L.evidence.conflict;
      if (!conflict && L.nameVariants && L.nameVariants.some(function (n) { return !nameIsFundLike(n); })) conflict = "NAME_VARIANTS_DISAGREE";
      if (conflict) conflicts.push({ symbol: raw.symbol, exchange: raw.exchange, conflict: conflict, names: L.nameVariants || [L.name] });
      var active = raw.active !== false && !raw.lastTradeDate;
      var entry = {
        canonicalETFId: fundId,
        listingId: "tiingo:" + (raw.exchange || "UNKNOWN") + ":" + raw.symbol,
        shareClass: shareClassOf(raw.name),
        symbol: raw.symbol, name: c.name, exchange: c.exchange, currency: c.currency, country: c.country,
        assetClass: c.assetClass, issuer: c.issuer, index: c.index, category: c.category, region: c.region,
        sector: null, theme: c.theme, leverage: c.leverage, inverse: c.inverse, structure: c.structure,
        complex: c.complex, management: c.management, singleStockUnderlying: c.singleStockUnderlying,
        distributionPolicy: null, replicationMethod: null, ter: null, fundSize: null,
        inceptionDate: raw.inceptionDate || null, providerStartDate: raw.firstTradeDate || null, firstTradeDate: raw.firstTradeDate || null,
        lastTradeDate: raw.lastTradeDate || null, holdingsCount: null, benchmark: c.index, isin: null, wkn: null,
        status: !active ? "INACTIVE" : (conflict ? "REVIEW" : "ACTIVE"),
        consumerVisible: active && !conflict,
        tiingoAvailable: L.sources.some(function (s) { return /tiingo/.test(s); }),
        priceHistoryAvailable: false,
        evidenceBasis: L.evidence.basis, sources: L.sources,
        derivation: { issuer: c.issuer ? "NAME_PATTERN" : null, assetClass: raw.assetClassHint ? "PROVIDER_CATALOG" : (c.assetClass ? "NAME_PATTERN" : null),
          region: c.region ? "NAME_PATTERN" : null, index: raw.trackedIndex ? "PROVIDER_DESCRIPTION" : (c.index ? "NAME_PATTERN" : null),
          theme: c.theme ? "NAME_PATTERN" : null, leverage: "NAME_PATTERN" },
        duplicateTicker: !!dupTickers[raw.symbol]
      };
      entry.missingFields = FIELDS.filter(function (f) { return entry[f] === null || entry[f] === undefined; });
      (funds[fundId] = funds[fundId] || []).push(entry.symbol);
      out.push(entry);
    });
    var multiListingFunds = Object.keys(funds).filter(function (f) { return funds[f].length > 1; })
      .map(function (f) { return { canonicalETFId: f, symbols: funds[f] }; });
    out.forEach(function (e) { e.listingsOfFund = funds[e.canonicalETFId].length; });
    return {
      version: VERSION, etfs: out, conflicts: conflicts,
      duplicateTickers: Object.keys(dupTickers).map(function (s) { return { symbol: s, listings: dupTickers[s] }; }),
      multiListingFunds: multiListingFunds,
      counts: { listings: out.length, funds: Object.keys(funds).length }
    };
  }

  /** Datenqualitaet eines Eintrags: Abdeckung der Pflichtfelder + Konfidenz. */
  function dataQuality(entry) {
    var filled = FIELDS.filter(function (f) { return entry[f] !== null && entry[f] !== undefined; }).length;
    var coverage = filled / FIELDS.length;
    var confidence = entry.status === "REVIEW" ? "LOW" : (entry.evidenceBasis === "PROVIDER_TYPE" ? "HIGH" : "MEDIUM");
    return { coverage: Math.round(coverage * 1000) / 1000, confidence: confidence, missingFields: FIELDS.filter(function (f) { return entry[f] === null || entry[f] === undefined; }) };
  }

  /**
   * ETF-DNA: sieben Achsen 0..100. Achsen ohne Datengrundlage bleiben null
   * ("Noch nicht verfuegbar") - keine Schaetzung.
   */
  function dna(entry, metrics) {
    metrics = metrics || {};
    var vol = metrics.volatility, mdd = metrics.maxDrawdown, mom = metrics.momentum12m, histYears = metrics.historyYears;
    function clamp(x) { return Math.max(0, Math.min(100, Math.round(x))); }
    var regionalBreadth = null;
    if (entry.region) regionalBreadth = { GLOBAL: 95, INTERNATIONAL: 70, DEVELOPED_EX_US: 70, EMERGING_MARKETS: 60, EUROPE: 50, USA: 40 }[entry.region] || 15;
    return {
      diversification: { value: null, status: "HOLDINGS_PENDING", label: "Diversifikation" },
      concentration: { value: null, status: "HOLDINGS_PENDING", label: "Konzentration" },
      momentum: mom === null || mom === undefined ? { value: null, status: "INSUFFICIENT_HISTORY", label: "Momentum" }
        : { value: clamp(50 + mom * 125), status: "CALCULATED", label: "Momentum", raw: mom },
      volatility: vol === null || vol === undefined ? { value: null, status: "INSUFFICIENT_HISTORY", label: "Ruhe (niedrige Schwankung)" }
        : { value: clamp(100 - vol * 200), status: "CALCULATED", label: "Ruhe (niedrige Schwankung)", raw: vol },
      cost: { value: null, status: "TER_SOURCE_PENDING", label: "Kosten" },
      stability: mdd === null || mdd === undefined || !histYears || histYears < 3 ? { value: null, status: "INSUFFICIENT_HISTORY", label: "Historische Stabilität" }
        : { value: clamp(100 + mdd * 150), status: "CALCULATED", label: "Historische Stabilität", raw: mdd },
      regionalBreadth: regionalBreadth === null ? { value: null, status: "REGION_UNKNOWN", label: "Regionale Breite" }
        : { value: regionalBreadth, status: "DERIVED_FROM_NAME", label: "Regionale Breite" }
    };
  }

  /** Suche ueber Ticker, Name, Index, Thema, Region, Anbieter. Ranking: exakter Ticker zuerst. */
  function search(etfs, query, limit) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    var words = q.split(/\s+/);
    var scored = [];
    (etfs || []).forEach(function (e) {
      var hay = [e.symbol, e.name, e.index, e.theme, REGION_LABEL[e.region] || e.region, e.issuer, e.category].join(" ").toLowerCase();
      if (!words.every(function (w) { return hay.indexOf(w) !== -1; })) return;
      var s = 0;
      if (e.symbol.toLowerCase() === q) s += 100;
      else if (e.symbol.toLowerCase().indexOf(q) === 0) s += 40;
      if ((e.name || "").toLowerCase().indexOf(q) !== -1) s += 20;
      if (e.consumerVisible) s += 10;
      if (e.complex) s -= 5;
      if (e.priceHistoryAvailable) s += 5;
      scored.push({ e: e, s: s });
    });
    scored.sort(function (a, b) { return b.s - a.s || a.e.symbol.localeCompare(b.e.symbol); });
    return scored.slice(0, limit || 25).map(function (x) { return x.e; });
  }

  var api = {
    VERSION: VERSION, FIELDS: FIELDS, NO_SOURCE_FIELDS: NO_SOURCE_FIELDS, REGION_LABEL: REGION_LABEL,
    classify: classify, etfEvidence: etfEvidence, buildMaster: buildMaster, dataQuality: dataQuality,
    dna: dna, search: search, fundKey: fundKey, leverageOf: leverageOf, inverseOf: inverseOf,
    assetClassOf: assetClassOf, deriveIssuer: deriveIssuer, nameIsFundLike: nameIsFundLike
  };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Master = api; }
})(typeof window !== "undefined" ? window : globalThis);
