/* =========================================================================
   VISION UNIVERSE — verify-multi-asset.mjs   (Multi-Asset Core §57, §58)

   PRUEFT DAS AUSGELIEFERTE MULTI-ASSET-SEGMENT - NICHT DEN PLAN.

   Liest snapshot.json, instruments.json und die Reihen entweder aus dem
   Repository oder (mit --site=<url>) vom tatsaechlich ausgelieferten
   Stand, und fuehrt die Quality Gates aus §58 sowie die Production-Proof-
   Beispiele aus §57.

   Ein Beispiel, das mangels Quelle oder Lizenz nicht geliefert wird, ist
   KEIN PASS. Es heisst CAPABILITY_GAP oder LICENSE_PENDING - mit Grund.

   Mit --internal wird zusaetzlich der Arbeitsstand aus demselben Lauf
   geprueft (.market-cache/multi-asset/internal-snapshot.json): der Beleg,
   dass lizenzausstehende Instrumente technisch funktionieren, ohne dass
   ihre Werte ausgeliefert werden.

   Ausfuehren:
     node scripts/quality/verify-multi-asset.mjs [--site=https://...] [--internal] [--publish]
   Exit 1 bei einem Gate-FAIL.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Taxonomy = require(join(root, "quant/engines/multi-asset/asset-taxonomy.js"));
const Catalog = require(join(root, "quant/engines/multi-asset/instrument-catalog.js"));
const Contract = require(join(root, "quant/api/multi-asset-contract.js"));
const CONFIG = require(join(root, "quant/config/multi-asset.json"));
const CALENDAR = require(join(root, "quant/config/market-calendar.json"));
const Fred = require(join(root, "providers/fred/adapter.js"));
/* Owner-Entscheidung 2026-09-25 (Tiingo-first): diese Quellen duerfen
   keinen ausgelieferten Consumer-Wert tragen. */
const NO_CONSUMER_SOURCES = ["fmp-index", "fred"];
const RESTRICTED_FRED_INDEX = ["NASDAQ100", "SP500", "DJIA", "NASDAQCOM"];

const args = process.argv.slice(2);
const SITE = (args.find((a) => a.startsWith("--site=")) || "").slice(7).replace(/\/$/, "");
const INTERNAL = args.includes("--internal");
const PUBLISH = args.includes("--publish");
const NOW = new Date();

async function load(path) {
  if (SITE) {
    const res = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "v=" + Date.now(), { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(join(root, path.replace(/^\//, "")), "utf8"));
}

const gates = {};
function gate(id, ok, detail) {
  const g = gates[id] || (gates[id] = { status: "PASS", findings: [] });
  if (ok === "N/A") { if (g.status === "PASS" && !g.findings.length) g.status = "NOT_APPLICABLE"; return; }
  if (!ok) { g.status = "FAIL"; g.findings.push(detail); }
}

async function main() {
  const snapshot = await load("/quant/data/market/multi-asset/snapshot.json");
  const master = await load("/quant/data/market/multi-asset/instruments.json");
  const contracts = snapshot.instruments;
  const bySym = Object.fromEntries(contracts.map((c) => [c.instrument.symbol, c]));
  const catalog = Catalog.all();

  /* INSTRUMENT_MASTER */
  for (const i of catalog) {
    const m = master.instruments.find((x) => x.symbol === i.symbol);
    gate("INSTRUMENT_MASTER", !!m, `${i.symbol}: fehlt im Master`);
    if (m) {
      gate("INSTRUMENT_MASTER", m.instrumentId === i.instrumentId, `${i.symbol}: instrumentId weicht ab`);
      gate("INSTRUMENT_MASTER", Taxonomy.validateInstrument(m).length === 0, `${i.symbol}: ${Taxonomy.validateInstrument(m).join(",")}`);
      gate("INSTRUMENT_MASTER", /^vu_[0-9a-f]{14}$/.test(m.instrumentId), `${i.symbol}: ID ausserhalb des Company-Master-ID-Raums`);
    }
    gate("INSTRUMENT_MASTER", !!bySym[i.symbol], `${i.symbol}: fehlt im Snapshot`);
  }

  for (const c of contracts) {
    const s = c.instrument.symbol, q = c.quote, cls = c.instrument.assetClass;
    const available = q.state === "AVAILABLE";

    gate("ASSET_CLASS_MODEL", Taxonomy.isKnownClass(cls), `${s}: unbekannte Klasse ${cls}`);
    gate("ASSET_CLASS_MODEL", Contract.QUOTE_STATES.includes(q.state), `${s}: unbekannter Quote-Zustand ${q.state}`);

    /* NO_SILENT_ETF_PROXIES: kein Proxy ohne Kennzeichnung, kein ETF-Kuerzel
       als Quelle eines Index. Ein Tracker IST ein Proxy - aber als ETF,
       ausdruecklich gekennzeichnet und nie als Indexstand. */
    const isTracker = cls === "ETF" && c.instrument.subType === "INDEX_TRACKER";
    if (isTracker) {
      gate("NO_SILENT_ETF_PROXIES", c.proxy && c.proxy.isProxy === true && c.proxy.isIndexLevel === false &&
           !!c.proxy.disclosure && !!c.proxy.represents, `${s}: Tracker ohne sichtbare Proxy-Kennzeichnung`);
    } else {
      gate("NO_SILENT_ETF_PROXIES", c.proxy && c.proxy.isProxy === false, `${s}: Proxy ohne Freigabe`);
    }
    gate("NO_SILENT_ETF_PROXIES", cls !== "INDEX" || !contracts.some((o) => o.instrument.assetClass === "ETF" && o.data.source && o.data.source === c.data.source && c.data.source),
         `${s}: Index aus derselben Quelle wie ein Tracker`);
    if (isTracker) {
      /* TRACKER_SEMANTICS (NO_FALSE_INDEX_LEVELS): ein ETF bleibt ein ETF. */
      gate("TRACKER_SEMANTICS", cls !== "INDEX", `${s}: Tracker als INDEX klassifiziert`);
      gate("TRACKER_SEMANTICS", q.valueSemantics === "PRICE" && q.unit === "PRICE_PER_SHARE" && q.unitId !== "POINTS" && q.unitDisplay !== "Pkt.",
           `${s}: Trackerkurs mit Indexpunkt-Einheit`);
      gate("TRACKER_SEMANTICS", c.market.sessionProfile === "US_EQUITY_ETF" && c.market.tradingSession === "US_EQUITY_ETF",
           `${s}: Tracker nicht in der US-ETF-Sitzung`);
      gate("TRACKER_SEMANTICS", !!c.tracker && c.tracker.isProxy === true && !!c.tracker.displayMarketName && !!c.tracker.trackerDisclosure &&
           !!c.tracker.tracksIndex && c.market.underlyingType === "INDEX" && c.market.trackedBy === s,
           `${s}: Tracker ohne Marktname, Kennzeichnung oder Indexzuordnung`);
      gate("TRACKER_SEMANTICS", /kein Indexstand/.test(c.displaySemantics.note || ""), `${s}: Anzeigehinweis fehlt`);
      gate("TRACKER_SEMANTICS", !available || (c.tracker.price === q.value && (!q.change || c.tracker.changePercent === q.change.percent)),
           `${s}: Tracker-Sicht weicht vom Vertrag ab`);
    }
    const ids = JSON.stringify(c.data.sourceInstrument || {}).toUpperCase();
    for (const p of (c.proxy.knownProxiesNotUsed || [])) {
      const t = String(p).split(" ")[0].toUpperCase();
      if (t.length >= 2 && t !== s) gate("NO_SILENT_ETF_PROXIES", !new RegExp(`"${t}"`).test(ids), `${s}: Quelle ist der Proxy ${t}`);
    }

    if (cls === "INDEX") {
      gate("INDEX_SEMANTICS", q.unit === "INDEX_POINTS" && q.valueSemantics === "INDEX_LEVEL", `${s}: Index nicht in Punkten`);
      gate("INDEX_SEMANTICS", c.capabilities.currencyConversion === "NOT_CONVERTIBLE", `${s}: Index wuerde umgerechnet`);
      gate("INDEX_SEMANTICS", available || !!c.gap || q.state === "WITHHELD_LICENSE", `${s}: kein Wert und keine benannte Luecke`);
    }
    if (cls === "COMMODITY" || cls === "PRECIOUS_METAL") {
      gate("COMMODITY_SEMANTICS", !available || c.instrument.subType !== "UNRESOLVED", `${s}: Wert ohne Instrumentdefinition`);
      gate("COMMODITY_SEMANTICS", !available || Taxonomy.UNITS[q.unit].monetary, `${s}: Rohstoffpreis ohne monetaere Einheit`);
      gate("COMMODITY_SEMANTICS", available || !!c.gap || q.state === "WITHHELD_LICENSE", `${s}: kein Wert, keine Begruendung`);
    }
    if (cls === "CRYPTO") {
      gate("CRYPTO_SEMANTICS", c.market.sessionProfile === "CRYPTO_24_7", `${s}: Krypto nicht 24/7`);
      gate("CRYPTO_SEMANTICS", !["WEEKEND", "CLOSED", "HOLIDAY"].includes(c.market.state), `${s}: Krypto als geschlossen gefuehrt`);
    }
    if (cls === "YIELD" || cls === "RATE") {
      gate("YIELD_SEMANTICS", q.unit === "PERCENT" && q.nativeCurrency === null, `${s}: Rendite/Zins mit Waehrung oder ohne Prozent`);
      gate("YIELD_SEMANTICS", c.displaySemantics.changeSemantics === "BASIS_POINTS", `${s}: Veraenderung nicht in Basispunkten`);
      gate("YIELD_SEMANTICS", !available || !q.change || typeof q.change.basisPoints === "number", `${s}: Veraenderung ohne bp`);
    }

    gate("UNIT_SYSTEM", !!q.unitId && (!available || q.unitId !== "UNRESOLVED"), `${s}: Wert ohne Einheit`);
    gate("MARKET_HOURS", !!Taxonomy.SESSION_PROFILES[c.market.sessionProfile], `${s}: unbekanntes Sitzungsprofil`);

    /* HISTORICAL_DATA */
    if (available) {
      gate("HISTORICAL_DATA", c.history.available && !!c.history.availableFrom && !!c.history.availableTo, `${s}: Wert ohne Historie`);
      if (c.history.path) {
        try {
          const ser = await load(c.history.path);
          const pts = ser.points || [];
          gate("HISTORICAL_DATA", pts.length > 0, `${s}: Reihe leer`);
          /* Eine wiederverwendete Reihe (EUR/USD aus dem Currency Core)
             traegt dort ihre eigene Quellen-ID; die Registry nennt sie. */
          const reg = CONFIG.sourceRegistry[c.data.source] || {};
          const expectedSource = reg.seriesSourceId || c.data.source;
          gate("HISTORICAL_DATA", !ser.source || ser.source === expectedSource, `${s}: Reihe aus ${ser.source}, erwartet ${expectedSource}`);
          const last = pts.length ? pts[pts.length - 1][0] : null;
          gate("HISTORICAL_DATA", last === c.history.availableTo, `${s}: Reihe endet ${last}, Vertrag sagt ${c.history.availableTo}`);
        } catch (e) { gate("HISTORICAL_DATA", false, `${s}: ${c.history.path} nicht ladbar (${e.message})`); }
      }
    }

    /* FRESHNESS - zur Pruefzeit neu bewertet */
    const now = Contract.refresh(c, { now: NOW, calendar: CALENDAR, config: CONFIG });
    gate("FRESHNESS", ["LIVE", "CURRENT", "LAST_SESSION", "STALE", "UNAVAILABLE"].includes(now.data.freshness.state), `${s}: unbekannter Zustand`);
    gate("FRESHNESS", now.data.freshness.state !== "LIVE" || c.data.frequency === "REALTIME", `${s}: LIVE ohne Echtzeitpfad`);
    gate("FRESHNESS", c.data.realtime === false || c.data.frequency === "REALTIME", `${s}: realtime=true ohne Echtzeitpfad`);

    /* PROVENANCE */
    if (available) {
      gate("PROVENANCE", !!c.data.source && !!c.data.provenance.attribution && !!q.asOf, `${s}: Wert ohne Quelle, Nennung oder Zeitpunkt`);
      gate("PROVENANCE", c.data.provenance.publicDisplay === true, `${s}: ausgelieferter Wert aus nicht freigegebener Quelle`);
    }

    /* CURRENCY_INTEGRATION */
    const expected = Taxonomy.conversionFor(cls, q.unit);
    gate("CURRENCY_INTEGRATION", c.capabilities.currencyConversion === expected, `${s}: Umrechnung ${c.capabilities.currencyConversion} statt ${expected}`);
    if (available) {
      let touched = false;
      const layer = { price: (v, cur, o) => { touched = true; return { available: true, display: { value: v, currency: o.displayCurrency } }; } };
      Contract.present(c, { layer, displayCurrency: "EUR" });
      gate("CURRENCY_INTEGRATION", touched === (expected === "CONVERTIBLE" && q.nativeCurrency !== "EUR"),
           `${s}: Currency Core ${touched ? "aufgerufen" : "nicht aufgerufen"} bei ${expected}`);
    }

    /* LICENSE_STATES: festes Vokabular; Development-Risiko ist keine
       kommerzielle Freigabe. */
    const lic = c.license || {};
    gate("LICENSE_STATES", Contract.LICENSE_STATES.includes(lic.state), `${s}: Lizenzzustand ${lic.state}`);
    gate("LICENSE_STATES", lic.commercialDisplayApproved !== true || lic.state === "LICENSE_CONFIRMED", `${s}: kommerzielle Freigabe ohne LICENSE_CONFIRMED`);
    gate("LICENSE_STATES", lic.state !== "OWNER_RISK_ACCEPTED_FOR_DEVELOPMENT" || (lic.preCommercialLicenseConfirmationRequired === true && lic.commercialDisplayApproved === false),
         `${s}: Development-Risiko als kommerzielle Freigabe gefuehrt`);
    gate("LICENSE_STATES", !available || lic.state !== "UNAVAILABLE", `${s}: Wert ohne Anzeigelizenz`);

    /* CONSUMER_DEPENDENCIES: kein FMP, kein Comparison-FRED, keine
       Pre-Approval-FRED-Indexreihe, kein Yahoo/Google/Massive. */
    gate("CONSUMER_DEPENDENCIES", !NO_CONSUMER_SOURCES.includes(c.data.source), `${s}: Consumer-Wert aus ${c.data.source}`);
    const fredId = c.data.sourceInstrument && c.data.sourceInstrument.fred;
    gate("CONSUMER_DEPENDENCIES", !fredId || !RESTRICTED_FRED_INDEX.includes(fredId), `${s}: FRED-Reihe ${fredId} (Pre-Approval)`);
    gate("CONSUMER_DEPENDENCIES", !/yahoo|google|massive|polygon/i.test(JSON.stringify(c.data.provenance || {})), `${s}: unzulaessiger Anbieter`);

    /* PUBLIC HYGIENE: keine Werte aus nicht freigegebenen Quellen */
    const reg = c.data.source ? CONFIG.sourceRegistry[c.data.source] : null;
    if (reg && reg.publicDisplay === false) {
      gate("PUBLIC_DATA_HYGIENE", q.value === null && !c.history.path && (!c.history.recent || !c.history.recent.length),
           `${s}: Wert/Reihe aus ${c.data.source} ausgeliefert`);
    }
  }

  /* Die FRED-Indexreihen des Adapters: nur "Citation required". */
  for (const [sym, spec] of Object.entries(Fred.SERIES)) {
    gate("CONSUMER_DEPENDENCIES", spec.licenseClass === "CITATION_REQUIRED" && !RESTRICTED_FRED_INDEX.includes(spec.series), `FRED ${sym}: ${spec.series} ${spec.licenseClass}`);
  }
  for (const [id, reg] of Object.entries(CONFIG.sourceRegistry)) {
    gate("CONSUMER_DEPENDENCIES", !(reg.publicDisplay && /yahoo|google|massive|polygon/i.test(`${reg.provider} ${reg.product}`)), `Registry ${id}: unzulaessiger Anbieter`);
    gate("CONSUMER_DEPENDENCIES", !(NO_CONSUMER_SOURCES.includes(id) && reg.publicDisplay), `Registry ${id}: zur Anzeige freigegeben`);
  }

  /* Tagesverlauf: nur freigegebene Quellen, nicht leer. */
  for (const c of contracts) {
    if (!c.history.intradayPath) continue;
    try {
      const it = await load(c.history.intradayPath);
      gate("HISTORICAL_DATA", Array.isArray(it.points) && it.points.length > 0, `${c.instrument.symbol}: Tagesverlauf leer`);
      const reg = CONFIG.sourceRegistry[it.source] || {};
      gate("PUBLIC_DATA_HYGIENE", reg.publicDisplay === true, `${c.instrument.symbol}: Tagesverlauf aus nicht freigegebener Quelle`);
    } catch (e) { gate("HISTORICAL_DATA", false, `${c.instrument.symbol}: ${c.history.intradayPath} nicht ladbar (${e.message})`); }
  }

  /* Oeffentliche Reihen nur fuer freigegebene Quellen (nur im Repository pruefbar). */
  if (!SITE && existsSync(join(root, "quant/data/market/multi-asset/series"))) {
    for (const f of readdirSync(join(root, "quant/data/market/multi-asset/series"))) {
      const ser = JSON.parse(readFileSync(join(root, "quant/data/market/multi-asset/series", f), "utf8"));
      const reg = CONFIG.sourceRegistry[ser.source];
      gate("PUBLIC_DATA_HYGIENE", reg && reg.publicDisplay === true, `series/${f}: Quelle ${ser.source} nicht freigegeben`);
      gate("PUBLIC_DATA_HYGIENE", ser.internalOnly === undefined, `series/${f}: interne Reihe im Auslieferungspfad`);
    }
  }

  /* §57 Production Proof: die Beispiele. */
  /* Owner-Liste (Tracker-Entscheidung) plus die Maerkte-Seite (Owner-
     Ergaenzung 2026-09-25): jedes Instrument, das Discover zeigt, und die
     Indizes, die ein Tracker vertritt, als benannte Luecke. */
  const EXAMPLES = ["QQQ", "SPY", "DIA", "N225", "WTI", "BRENT", "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD", "US10Y", "DE10Y", "EURUSD",
                    "FED_TARGET", "US_EFFR", "ECB_DFR", "NATGAS", "XPTUSD", "XPDUSD", "SOLUSD", "XRPUSD",
                    "US2Y", "US5Y", "US30Y", "DE2Y", "DE30Y", "IWM", "FEZ", "URTH",
                    "NDX", "SPX", "DJI"];
  const internal = INTERNAL && existsSync(join(root, ".market-cache/multi-asset/internal-snapshot.json"))
    ? JSON.parse(readFileSync(join(root, ".market-cache/multi-asset/internal-snapshot.json"), "utf8")) : null;
  const proof = EXAMPLES.map((sym) => {
    const c = bySym[sym];
    if (!c) return { symbol: sym, verdict: "MISSING" };
    const now = Contract.refresh(c, { now: NOW, calendar: CALENDAR, config: CONFIG });
    const q = c.quote;
    const row = {
      symbol: sym, instrumentId: c.instrument.instrumentId, name: c.instrument.nameDe, assetClass: c.instrument.assetClass,
      subType: c.instrument.subType, unitId: q.unitId, quoteState: q.state,
      value: q.value, range: q.range, asOf: q.asOf, freshness: now.data.freshness.state, marketState: now.market.state,
      history: c.history.available ? `${c.history.availableFrom}..${c.history.availableTo} (${c.history.observations})` : null,
      change: q.change ? (q.change.basisPoints !== undefined ? `${q.change.basisPoints} bp` : `${q.change.percent} %`) : null,
      currencyConversion: c.capabilities.currencyConversion, realtimeClaim: now.data.realtime,
      source: c.data.source, license: c.license ? c.license.state : null,
      intraday: c.history.intradayPath || null, realtimeCapability: c.capabilities.realtimeCapability || null
    };
    if (c.tracker) row.tracker = { displayMarketName: c.tracker.displayMarketName, disclosure: c.tracker.trackerDisclosure,
                                   tracksIndex: c.tracker.tracksIndex, isProxy: c.proxy.isProxy, isIndexLevel: c.proxy.isIndexLevel,
                                   assetClass: c.instrument.assetClass, changePercent: c.tracker.changePercent,
                                   tradingSession: c.market.tradingSession };
    if (q.state === "AVAILABLE") row.verdict = "PASS";
    else if (q.state === "CAPABILITY_GAP") row.verdict = "CAPABILITY_GAP";
    else if (q.state === "WITHHELD_LICENSE") row.verdict = "LICENSE_PENDING";
    else row.verdict = "FAIL_SOURCE_MISSING";
    if (internal && q.state === "WITHHELD_LICENSE") {
      const ic = internal.instruments.find((x) => x.instrument.symbol === sym);
      row.internalProof = ic ? { quoteState: ic.quote.state, asOf: ic.quote.asOf, freshness: ic.data.freshness.state,
                                 history: ic.history.available ? `${ic.history.availableFrom}..${ic.history.availableTo}` : null,
                                 technical: ic.quote.state === "AVAILABLE" ? "PASS" : "FAIL" } : null;
    }
    return row;
  });

  /* Der Vertrag selbst: jede aktive Quelle geliefert? */
  /* Ein Ausfall einer Quelle ist kein Vertragsfehler: der Vertrag sagt
     dann SOURCE_MISSING mit Grund, und die uebrigen Instrumente sollen
     trotzdem ausgeliefert werden. Er wird gemeldet (WARN), nicht
     blockiert. Ein aktives Instrument ohne Wert UND ohne Grund ist
     dagegen ein Vertragsfehler. */
  const activeMissing = contracts.filter((c) => c.instrument.status === "ACTIVE" && c.quote.state !== "AVAILABLE");
  for (const c of activeMissing) gate("PRODUCT_CONTRACT", c.quote.state === "SOURCE_MISSING" && !!c.quote.stateReason,
                                      `${c.instrument.symbol}: ohne Wert und ohne Grund`);
  const dataAvailability = activeMissing.length ? { status: "WARN", sourceMissing: activeMissing.map((c) => `${c.instrument.symbol}: ${c.quote.stateReason}`) }
                                                : { status: "PASS" };
  gate("PRODUCT_CONTRACT", snapshot.contractVersion === Contract.CONTRACT_VERSION, `Vertragsversion ${snapshot.contractVersion}`);

  const failed = Object.entries(gates).filter(([, g]) => g.status === "FAIL");
  const report = {
    schemaVersion: "vu-multi-asset-proof-1.0.0", checkedAt: NOW.toISOString(), against: SITE || "repository",
    snapshotGeneratedAt: snapshot.generatedAt,
    gates: Object.fromEntries(Object.entries(gates).map(([k, g]) => [k, g.status])),
    dataAvailability,
    findings: Object.fromEntries(Object.entries(gates).filter(([, g]) => g.findings.length).map(([k, g]) => [k, g.findings.slice(0, 20)])),
    productionProof: proof,
    summary: snapshot.summary
  };
  console.log(JSON.stringify(report, null, 1));
  if (PUBLISH) {
    const out = join(root, "quant/data/market/multi-asset", SITE ? "production-proof.json" : "verification.json");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  }
  if (failed.length) { console.error("GATE FAIL: " + failed.map(([k]) => k).join(", ")); process.exit(1); }
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
