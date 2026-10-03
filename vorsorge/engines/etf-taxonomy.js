/* =========================================================================
   VISION UNIVERSE VORSORGE — etf-taxonomy.js   (etf-taxonomy-1.0.0)

   Produkttyp, Komplexitaet und Oeffentlichkeits-Schicht eines
   boersengehandelten Produkts.

   PRODUKTTYPEN (productType)
     ETF, ETN, ETC, ETP, CEF, MUTUAL_FUND, UNKNOWN
   STRATEGIE (strategy)  – mehrere moeglich, erste ist die praegende
     LEVERAGED, INVERSE, LEVERAGED_INVERSE, SINGLE_STOCK, OPTION_INCOME,
     COVERED_CALL, BUFFER, DEFINED_OUTCOME, CRYPTO, COMMODITY, THEMATIC,
     BOND, EQUITY, MULTI_ASSET, MONEY_MARKET, UNKNOWN

   VORSORGE-EINORDNUNG (retirementClass) – KEINE Anlageempfehlung. Sie
   verhindert nur, dass ein 3x-Hebelprodukt im selben Kontext erscheint wie
   ein breiter Welt-ETF.
     STANDARD          klassisches Index-/Anleihe-/Geldmarkt-Produkt
     KOMPLEX           Optionsstrategie, Puffer, Krypto-/Rohstoff-ETP, Thema
                       mit sehr kurzer Historie
     SEHR_KOMPLEX      Hebel, Short, Einzelaktie
     NICHT_EINORDENBAR Produkttyp oder Assetklasse nicht bestimmbar

   Jede Entscheidung traegt ihre Grundlage (basis) und eine Konfidenz.
   Grundlage ist der Name (NAME_PATTERN), die Gattung des Anbieters
   (PROVIDER_TYPE) oder eine manuelle Festlegung (MANUAL_OVERRIDE).
   ========================================================================= */
(function (global) {
  "use strict";
  var isNode = typeof module !== "undefined" && module.exports;
  var VERSION = "etf-taxonomy-1.0.0";

  var RX = {
    etn: /\betns?\b|exchange[- ]traded notes?|\bnotes?\s+due\b/i,
    etc: /\betcs?\b|exchange[- ]traded commodit/i,
    cef: /closed[- ]end|\bcef\b|income fund,? inc|opportunities fund$|municipal (income )?fund,? inc/i,
    mutual: /\b(admiral|investor|institutional)\s+shares\b|\bclass\s+[a-z]\b(?!.*\betf\b)/i,
    leverage: /(?:^|[^\w.])(\d(?:\.\d+)?)\s?x\b/i,
    ultra: /\bultra(pro)?\b(?!\s*-?short\s+(income|duration|term|bond))/i,
    ultrashort: /\bultra(pro)?short\b(?!\s+(income|bond|duration|term|municipal|government|treasury))/i,
    inverse: /\binverse\b|\bbear\b|-1x\b/i,
    short: /\bshort\b(?!\s*(duration|term|maturity|-term|\s+income))/i,
    optionIncome: /option(s)?\s+income|premium income|yield\s?boost|income\s+strateg|weekly pay|\bincome\b.*\boption/i,
    coveredCall: /covered call|buy[- ]?write/i,
    buffer: /\bbuffer\b|\bfloor\b|dual directional|barrier|autocallable/i,
    definedOutcome: /defined outcome|structured (buffer|outcome)|\btarget (outcome|\d+)\b|\bseries\b.*\b(buffer|outcome)\b/i,
    crypto: /bitcoin|ethereum|\bether\b|solana|\bxrp\b|dogecoin|crypto|chainlink|\bsui\b|zcash|litecoin|avalanche|cardano|polkadot|\bbtc\b|\beth\b/i,
    commodity: /\bgold\b|silver|copper|palladium|platinum|commodit|\boil\b|crude|natural gas|\bwheat\b|\bcorn\b|soybean|agricultur|uranium/i,
    commodityEquity: /miners|mining|producers|royalt|equit|stocks?\b/i,
    money: /money market|treasury securities money|cash management|t-bill|0-3 month|0-1 month|ultra[- ]?short (term )?(treasury|bond|income)/i,
    bond: /\bbond\b|government securities|treasury|fixed income|\bmuni|municipal|credit|\bclo\b|\babs\b|mortgage|floating rate|inflation[- ]protected|\btips\b|ibonds|high yield|investment grade|securitized|ultrashort income|short duration|aggregate|corporate|preferred|loan/i,
    multi: /allocation|multi[- ]asset|balanced|target (date|retirement) \d{4}|\b60\/40\b|risk parity/i,
    thematic: /\bai\b|artificial intelligence|robot|cyber|cloud|semiconductor|space|clean energy|solar|hydrogen|electrif|lithium|battery|genomic|biotech|fintech|blockchain|metaverse|gaming|esports|cannabis|defen[cs]e|war machine|infrastructure|innovation|disrupt|internet|ecommerce|coffee|energy drinks|billionaires|nyc based|uranium|water|pet care|travel|sports/i,
    equity: /emerging markets|international|global|world|health ?care|natural resources|durable|free cash flow|miners|mining|equit|stock|s&p|nasdaq|russell|dow jones|msci|ftse|stoxx|\bcap\b|growth|value|dividend|quality|small|mid ?cap|large|companies|leaders|momentum|low volatility|minimum volatility|factor|qqq/i
  };

  function leverageOf(name) {
    var m = name.match(RX.leverage);
    if (m) { var f = Number(m[1]); if (f > 1 && f <= 5) return f; }
    if (/ultrapro/i.test(name)) return 3;
    if (RX.ultrashort.test(name) || RX.ultra.test(name)) return 2;
    return 1;
  }

  /**
   * Klassifiziert ein Produkt.
   * @param {object} p  { name, securityType, assetType, override }
   */
  function classify(p) {
    p = p || {};
    var name = String(p.name || "");
    var ov = p.override || null;
    var lev = leverageOf(name);
    var inverse = RX.inverse.test(name) || RX.ultrashort.test(name) || (lev > 1 && RX.short.test(name)) ||
      /\bshort\s+(s&p|qqq|dow|russell|msci|nasdaq|ftse|bitcoin|ether|real estate|financials|vix|midcap|smallcap|small ?cap)/i.test(name);
    var single = lev > 1 || inverse ? singleStock(name) : null;
    var strategies = [];
    var basis = name ? "NAME_PATTERN" : "NONE";

    // Produkttyp
    var type = "UNKNOWN", typeBasis = "NONE", typeConfidence = "LOW";
    if (RX.etn.test(name)) { type = "ETN"; typeBasis = "NAME_PATTERN"; typeConfidence = "HIGH"; }
    else if (RX.etc.test(name)) { type = "ETC"; typeBasis = "NAME_PATTERN"; typeConfidence = "HIGH"; }
    else if (RX.cef.test(name) && !/\betf\b/i.test(name)) { type = "CEF"; typeBasis = "NAME_PATTERN"; typeConfidence = "MEDIUM"; }
    else if (p.securityType === "MUTUAL_FUND" || p.assetType === "Mutual Fund") { type = "MUTUAL_FUND"; typeBasis = "PROVIDER_TYPE"; typeConfidence = "HIGH"; }
    else if (/\betf\b|exchange traded fund/i.test(name)) { type = "ETF"; typeBasis = "NAME_PATTERN"; typeConfidence = "HIGH"; }
    else if (p.securityType === "ETF" || p.assetType === "ETF") { type = "ETF"; typeBasis = "PROVIDER_TYPE"; typeConfidence = name ? "MEDIUM" : "LOW"; }
    else if (/\b(trust|fund|shares|ishares|spdr|proshares)\b/i.test(name)) { type = "ETP"; typeBasis = "NAME_PATTERN"; typeConfidence = "LOW"; }
    if ((RX.crypto.test(name) || (RX.commodity.test(name) && !RX.commodityEquity.test(name))) && type === "ETF" && /\btrust\b/i.test(name)) type = "ETP";

    // Strategien
    if (lev > 1 && inverse) strategies.push("LEVERAGED_INVERSE");
    else if (lev > 1) strategies.push("LEVERAGED");
    else if (inverse) strategies.push("INVERSE");
    if (single) strategies.push("SINGLE_STOCK");
    if (RX.coveredCall.test(name)) strategies.push("COVERED_CALL");
    else if (RX.optionIncome.test(name)) strategies.push("OPTION_INCOME");
    if (RX.definedOutcome.test(name)) strategies.push("DEFINED_OUTCOME");
    if (RX.buffer.test(name)) strategies.push("BUFFER");
    if (RX.crypto.test(name)) strategies.push("CRYPTO");
    var asset = null;
    if (RX.money.test(name)) asset = "MONEY_MARKET";
    else if (RX.crypto.test(name)) asset = "CRYPTO";
    else if (RX.commodity.test(name) && !RX.commodityEquity.test(name)) { asset = "COMMODITY"; strategies.push("COMMODITY"); }
    else if (/real estate|\breit\b/i.test(name)) asset = "REAL_ESTATE";
    else if (RX.bond.test(name)) asset = "BOND";
    else if (RX.multi.test(name)) asset = "MULTI_ASSET";
    else if (RX.equity.test(name) || RX.thematic.test(name) || lev > 1 || inverse) asset = "EQUITY";
    else if (p.assetClassHint) { asset = p.assetClassHint; basis = "NAME_PATTERN+MASTER_HINT"; }
    if (RX.thematic.test(name) && asset === "EQUITY") strategies.push("THEMATIC");
    if (asset === "BOND") strategies.push("BOND");
    else if (asset === "EQUITY" && !strategies.length) strategies.push("EQUITY");
    else if (asset === "MULTI_ASSET") strategies.push("MULTI_ASSET");
    else if (asset === "MONEY_MARKET") strategies.push("MONEY_MARKET");
    if (!strategies.length) strategies.push("UNKNOWN");

    if (ov) {
      if (ov.productType) { type = ov.productType; typeBasis = "MANUAL_OVERRIDE"; typeConfidence = "HIGH"; }
      if (ov.assetClass) asset = ov.assetClass;
      if (ov.strategies) strategies = ov.strategies.slice();
      basis = "MANUAL_OVERRIDE";
    }

    var r = { version: VERSION, productType: type, productTypeBasis: typeBasis, productTypeConfidence: typeConfidence,
      assetClass: asset, strategies: strategies, primaryStrategy: strategies[0], leverage: lev, inverse: inverse,
      singleStockUnderlying: single, basis: basis };
    r.retirement = retirementClass(r, p);
    return r;
  }

  function singleStock(name) {
    var m = name.match(/(?:long|short)\s+([A-Z]{2,5})\b(?:\s+(?:daily|etf|shares))?/) ||
      name.match(/(?:long|short)\s+([A-Za-z]{2,5})\s+(?:daily|etf)\b/i) ||
      name.match(/\bultra(?:short)?\s+([A-Z]{2,5})\b/) || name.match(/autocallable\s+([A-Z]{2,5})\b/);
    if (!m) return null;
    var t = m[1].toUpperCase();
    if (/^(QQQ|SPY|DOW|TOP|SP|ETF|MSCI|USD|EUR|GOLD|OIL|BOND)$/.test(t)) return null;
    return t;
  }

  var RETIREMENT_LABEL = { STANDARD: "Standard", KOMPLEX: "Komplex", SEHR_KOMPLEX: "Sehr komplex", NICHT_EINORDENBAR: "Nicht einordenbar" };
  var RETIREMENT_TEXT = {
    STANDARD: "Klassisches Produkt (Index, Anleihen, Geldmarkt). Das ist keine Empfehlung – nur die Einordnung der Bauart.",
    KOMPLEX: "Komplexe Bauart (Optionen, Puffer, Krypto, Rohstoff-ETP oder Spezialthema). Verhalten weicht von einem breit gestreuten ETF ab.",
    SEHR_KOMPLEX: "Sehr komplex: Hebel, Short oder Einzelaktie mit täglichem Reset. Für langfristige Vorsorge nicht konstruiert.",
    NICHT_EINORDENBAR: "Produkttyp oder Anlageklasse ist aus den verfügbaren Daten nicht sicher bestimmbar."
  };

  function retirementClass(c, p) {
    var s = c.strategies, reasons = [];
    if (c.leverage > 1) reasons.push("Hebel " + c.leverage + "x");
    if (c.inverse) reasons.push("Short / inverse Wertentwicklung");
    if (c.singleStockUnderlying) reasons.push("Einzelaktie " + c.singleStockUnderlying);
    if (reasons.length) return { class: "SEHR_KOMPLEX", reasons: reasons };
    if (s.indexOf("OPTION_INCOME") >= 0) reasons.push("Optionsprämien-Strategie");
    if (s.indexOf("COVERED_CALL") >= 0) reasons.push("Covered Call");
    if (s.indexOf("BUFFER") >= 0 || s.indexOf("DEFINED_OUTCOME") >= 0) reasons.push("Puffer / Defined Outcome");
    if (c.assetClass === "CRYPTO") reasons.push("Krypto");
    if (c.assetClass === "COMMODITY") reasons.push("Rohstoff-ETP");
    if (c.productType === "ETN") reasons.push("ETN (Emittentenrisiko)");
    if (c.productType === "CEF") reasons.push("Geschlossener Fonds");
    if (reasons.length) return { class: "KOMPLEX", reasons: reasons };
    if (c.productType === "UNKNOWN" || !c.assetClass) return { class: "NICHT_EINORDENBAR", reasons: [c.productType === "UNKNOWN" ? "Produkttyp unbekannt" : "Anlageklasse unbekannt"] };
    if (p && p.historyYears !== undefined && p.historyYears !== null && p.historyYears < 1 && s.indexOf("THEMATIC") >= 0) return { class: "KOMPLEX", reasons: ["Spezialthema mit Historie < 1 Jahr"] };
    return { class: "STANDARD", reasons: [] };
  }

  /**
   * Oeffentliche Schicht eines Listings.
   *   PUBLIC_ANALYSIS  aktiv, klassifiziert, Preise, eindeutig, Standard
   *   COMPLEX          aktiv, Preise, eindeutig, aber komplex/sehr komplex
   *   ARCHIVE          inaktiv/delistet
   *   REVIEW           Kollision, keine Preise, unbekannter Typ oder Name
   */
  function layerOf(e) {
    var reasons = [];
    if (e.status === "INACTIVE") return { layer: "ARCHIVE", reasons: ["inaktiv"] };
    if (e.conflict) reasons.push("Identitätskonflikt: " + e.conflict);
    if (!e.name) reasons.push("kein Name");
    if (!e.priceHistoryAvailable) reasons.push("keine Kursreihe");
    if (e.priceAnomaly) reasons.push("Kursreihe auffällig: " + e.priceAnomaly);
    if (e.otc) reasons.push("OTC-/Pink-Notiz: kein regulierter Primärhandel, Kurse oft lückenhaft");
    if (e.productType === "CEF" || e.productType === "MUTUAL_FUND") reasons.push("kein börsengehandelter Indexfonds (" + e.productType + ")");
    if (reasons.length) return { layer: "REVIEW", reasons: reasons };
    if (e.retirementClass === "NICHT_EINORDENBAR") return { layer: "REVIEW", reasons: ["nicht einordenbar"] };
    if (e.retirementClass === "STANDARD") return { layer: "PUBLIC_ANALYSIS", reasons: [] };
    return { layer: "COMPLEX", reasons: [] };
  }

  /** Plausibilitaet einer Kursreihe: Spruenge, die nach Datenfehler aussehen. */
  function priceAnomaly(points) {
    if (!points || points.length < 3) return null;
    for (var i = 1; i < points.length; i++) {
      var r = points[i][1] / points[i - 1][1];
      if (!(r > 0) || !isFinite(r)) return "UNGUELTIGER_WERT";
      if (r > 20 || r < 0.05) return "SPRUNG_" + points[i][0];
    }
    return null;
  }

  var api = { VERSION: VERSION, classify: classify, leverageOf: leverageOf, retirementClass: retirementClass, layerOf: layerOf,
    priceAnomaly: priceAnomaly, RETIREMENT_LABEL: RETIREMENT_LABEL, RETIREMENT_TEXT: RETIREMENT_TEXT };
  if (isNode) module.exports = api;
  else { global.VUVorsorge = global.VUVorsorge || {}; global.VUVorsorge.Taxonomy = api; }
})(typeof window !== "undefined" ? window : globalThis);
