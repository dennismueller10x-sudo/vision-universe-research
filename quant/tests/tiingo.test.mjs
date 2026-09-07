/* =========================================================================
   PHASE 4A — TIINGO-ADAPTER

   Keine dieser Pruefungen geht ins Netz. Sie halten fest, was der Adapter
   aus einer gegebenen Anbieterantwort macht - und vor allem, was er NICHT
   daraus macht: eine Bereinigungsstufe, die niemand nachgewiesen hat.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Tiingo = require("../../providers/tiingo/adapter.js");
const Schema = require("../engines/schema.js");
const Provider = require("../engines/provider.js");
const Capabilities = require("../engines/capabilities.js");
const SymbolMapping = require("../engines/symbol-mapping.js");
const Semantics = require("../engines/price-semantics.js");
const F = require("./fixtures/tiingo.js");

Semantics.configure(JSON.parse(
  readFileSync(join(ROOT, "quant", "methodology", "price-adjustment-v1.json"), "utf8")));

const KEY = "TESTKEY-tiingo-0000000000";

function registry() {
  return SymbolMapping.createRegistry([
    { securityId: "ref_AAPL", providerId: "tiingo", providerSymbol: "AAPL", ticker: "AAPL",
      mic: "XNAS", currency: "USD", country: "US", confidence: "verified" },
    { securityId: "ref_NVDA", providerId: "tiingo", providerSymbol: "NVDA", ticker: "NVDA",
      mic: "XNAS", currency: "USD", country: "US", confidence: "verified" },
    { securityId: "ref_KO", providerId: "tiingo", providerSymbol: "KO", ticker: "KO",
      mic: "XNYS", currency: "USD", country: "US", confidence: "verified" },
    { securityId: "ref_BRKB", providerId: "tiingo", providerSymbol: "BRK-B", ticker: "BRK-B",
      mic: "XNYS", currency: "USD", country: "US", confidence: "verified" }
  ]);
}

/* `report` reicht bis in freePlanCapabilities durch: null bedeutet
   ausdruecklich "kein Laufzeitnachweis", undefined "nimm den aus dem
   Baum". Ohne diesen Durchgriff koennte kein Test mehr den ungeprueften
   Ausgangszustand herstellen, sobald ein Bericht existiert. */
function provider(fetchImpl, capOverrides, report) {
  return Tiingo.createTiingoProvider({
    apiKey: KEY,
    capabilities: Tiingo.freePlanCapabilities(capOverrides, report),
    symbolRegistry: registry(),
    fetchImpl, sleep: () => Promise.resolve()
  });
}

/* ------------------------------------------------- Grundverhalten */

test("T1 · Ohne Schluessel wird nichts abgerufen und nichts erfunden", async () => {
  let called = false;
  const p = Tiingo.createTiingoProvider({
    capabilities: Tiingo.freePlanCapabilities(),
    fetchImpl: () => { called = true; return F.response(F.AAPL_PLAIN); }
  });
  const res = await p.getDailyBars("ref_AAPL", {});
  assert.equal(called, false, "ohne Zugang darf keine Anfrage entstehen");
  assert.equal(res.reason, "notConfigured");
  assert.equal(res.data, null, "kein Rueckfall auf Demo-Daten");
  assert.equal(p.healthCheck().status, "not_configured");
});

test("T2 · Der Schluessel steht im Header, nicht in der URL", async () => {
  let seenUrl = null, seenHeaders = null;
  const p = provider((url, init) => { seenUrl = url; seenHeaders = init && init.headers; return F.response(F.AAPL_PLAIN); });
  await p.getDailyBars("ref_AAPL", {});

  assert.ok(!seenUrl.includes(KEY), "der Schluessel darf nicht in der URL stehen");
  assert.ok(!seenUrl.toLowerCase().includes("token="), "auch nicht als Parametername");
  assert.equal(seenHeaders.Authorization, "Token " + KEY);
  // Eine protokollierte URL verraet ihn damit nicht - der Vorteil gegenueber Twelve Data.
  assert.match(seenUrl, /^https:\/\/api\.tiingo\.com\/tiingo\/daily\/AAPL\/prices/);
});

test("T3 · Sonderzeichen im Ticker ueberleben die URL", async () => {
  // BRK-B: der Bindestrich ist eine unauffaellige Fehlerquelle.
  let seenUrl = null;
  const p = provider((url) => { seenUrl = url; return F.response(F.AAPL_PLAIN); });
  await p.getDailyBars("ref_BRKB", {});
  assert.match(seenUrl, /\/tiingo\/daily\/BRK-B\/prices/);
});

/* ------------------------------------------- Kanonische Uebersetzung */

test("T4 · Eine Tiingo-Zeile wird zu einer gueltigen kanonischen PriceBar", async () => {
  const p = provider(() => F.response(F.AAPL_PLAIN));
  const res = await p.getDailyBars("ref_AAPL", {});
  assert.equal(res.available, true);
  assert.equal(res.data.bars.length, 3);

  for (const bar of res.data.bars) {
    const v = Schema.validate("PriceBar", bar);
    assert.equal(v.valid, true, "ungueltige Bar: " + v.errors.join(" | "));
    assert.deepEqual(Provider.findVendorLeakage(bar), [],
      "kein Tiingo-Feld darf ins kanonische Modell durchschlagen");
  }
  // Keine Vendor-Feldnamen mehr vorhanden.
  const first = res.data.bars[0];
  for (const vendorField of ["adjOpen", "adjHigh", "adjLow", "adjClose", "adjVolume", "divCash", "splitFactor"]) {
    if (vendorField === "splitFactor") continue;   // kanonisch gleichnamig, siehe Schema
    assert.ok(!(vendorField in first), vendorField + " durchgeschlagen");
  }
  assert.deepEqual(res.data.bars.map((b) => b.date),
    ["2026-09-02", "2026-09-03", "2026-09-04"], "aufsteigend sortiert");
});

test("T5 · Raw und adjusted bleiben getrennt erhalten", async () => {
  // Der Kern von §6: die unbereinigten Werte gehen nicht verloren.
  const p = provider(() => F.response(F.NVDA_SPLIT), {
    market: { ...Tiingo.freePlanCapabilities().sets.market, adjustedPrices: true }
  });
  const res = await p.getDailyBars("ref_NVDA", {});
  const vorSplit = res.data.bars.find((b) => b.date === "2021-07-16");

  assert.equal(vorSplit.close, 726.44, "der unbereinigte Handelskurs bleibt");
  assert.equal(vorSplit.adjustedClose, 18.161, "der bereinigte Kurs steht daneben");
  assert.ok(vorSplit.close / vorSplit.adjustedClose > 39,
    "Faktor rund 40 aus 4:1 und 10:1 - beide Reihen sind wirklich verschieden");
  assert.equal(vorSplit.adjustedOpen, 18.15);
  assert.equal(vorSplit.adjustedVolume, 20400000);
});

test("T6 · Kapitalmassnahmen faehrt jede Bar mit", async () => {
  const p = provider(() => F.response(F.NVDA_SPLIT));
  const res = await p.getDailyBars("ref_NVDA", {});
  const splitTag = res.data.bars.find((b) => b.date === "2021-07-19");
  const normal = res.data.bars.find((b) => b.date === "2021-07-20");

  assert.equal(splitTag.splitFactor, 4);
  assert.equal(normal.splitFactor, 1, "1 heisst: an diesem Tag ist nichts passiert");
  assert.equal(normal.dividend, 0);

  // 1 und 0 sind Befunde, kein fehlender Wert - der Unterschied traegt.
  assert.notEqual(normal.splitFactor, null);
  assert.notEqual(normal.dividend, null);
});

/* --------------------------------------- Die Bereinigungsfrage (§6) */

test("T7 · Ungepruefte Bereinigung wird nicht behauptet", async () => {
  // Der wichtigste Test dieser Datei. Sekundaerquellen berichten, adjClose
  // sei total-return-bereinigt. Solange das niemand an echten Daten gezeigt
  // hat, darf der Adapter es nicht behaupten.
  //
  // Inzwischen liegt ein Laufzeitnachweis im Baum, und die Faehigkeit steht
  // deshalb auf true. Geprueft wird hier trotzdem die Regel und nicht der
  // Tag, an dem sie geschrieben wurde: ohne Bericht bleibt alles auf null.
  // Wuerde der Test nur den heutigen Stand festhalten, wuerde er beim
  // Wegfall des Nachweises nicht anschlagen - also genau dann nicht, wenn
  // es darauf ankommt.
  const caps = Tiingo.freePlanCapabilities(null, null);
  assert.equal(caps.sets.market.adjustedPrices, null,
    "ungeprueft heisst null, nicht true und nicht false");

  const p = provider(() => F.response(F.AAPL_PLAIN), null, null);
  assert.equal(p.adjustmentStatus(), "unknown");

  const res = await p.getDailyBars("ref_AAPL", {});
  for (const bar of res.data.bars) {
    assert.equal(bar.adjustedClose, null,
      "ohne Nachweis bleibt adjustedClose leer - die Rohwerte stehen daneben");
    assert.equal(bar.adjustmentStatus, "unknown");
  }
  // Aber die Rohwerte des Anbieters gehen nicht verloren.
  assert.equal(res.data.bars[0].adjustedOpen, 228.00);
});

test("T8 · Nach dem Nachweis traegt adjustedClose einen Wert", async () => {
  const caps = Tiingo.freePlanCapabilities();
  const p = provider(() => F.response(F.AAPL_PLAIN), {
    market: { ...caps.sets.market, adjustedPrices: true }
  });
  assert.equal(p.adjustmentStatus(), "adjusted");

  const res = await p.getDailyBars("ref_AAPL", {});
  assert.equal(res.data.bars[0].adjustedClose, 229.60);
  assert.equal(res.data.bars[0].adjustmentStatus, "adjusted");

  // Und erst jetzt darf die Engine eine Gesamtrendite daraus rechnen.
  assert.equal(Semantics.check("total_return", "adjusted").allowed, true);
  assert.equal(Semantics.check("total_return", "unknown").allowed, false);
});

test("T9 · Die Bereinigungsstufe faellt im Zweifel auf die strengere", async () => {
  const caps = Tiingo.freePlanCapabilities();
  const nurSplit = provider(() => F.response(F.AAPL_PLAIN), {
    market: { ...caps.sets.market, adjustedPrices: false, splitAdjustedPrices: true }
  });
  assert.equal(nurSplit.adjustmentStatus(), "splitAdjusted");
  const res = await nurSplit.getDailyBars("ref_AAPL", {});
  assert.equal(res.data.bars[0].adjustedClose, null,
    "splitbereinigt ist nicht total-return-faehig - adjustedClose bleibt leer");
});

/* ------------------------------------------- Kapitalmassnahmen (§7) */

test("T10 · Splits und Dividenden werden zu kanonischen Corporate Actions", async () => {
  const p = provider((url) =>
    F.response(url.includes("/KO/") ? F.KO_DIVIDEND : F.NVDA_SPLIT));

  const splits = await p.getCorporateActions("ref_NVDA", {});
  assert.equal(splits.available, true);
  const split = splits.data.find((a) => a.type === "split");
  assert.ok(split, "der 4:1-Split muss erkannt werden");
  assert.equal(split.exDate, "2021-07-19");
  assert.equal(split.ratio, 4);
  assert.equal(Schema.validate("CorporateAction", split).valid, true,
    Schema.validate("CorporateAction", split).errors.join(" | "));

  const divs = await p.getCorporateActions("ref_KO", {});
  const div = divs.data.find((a) => a.type === "dividend");
  assert.ok(div, "die Dividende muss erkannt werden");
  assert.equal(div.amount, 0.485);
  assert.equal(div.exDate, "2026-06-13");
});

test("T11 · Kein erfundenes Ankuendigungsdatum", async () => {
  // Tiingo nennt keines. Es zu erfinden waere eine Behauptung ueber
  // Point-in-Time-Verfuegbarkeit, die hier niemand pruefen kann.
  const p = provider(() => F.response(F.NVDA_SPLIT));
  const res = await p.getCorporateActions("ref_NVDA", {});
  const split = res.data.find((a) => a.type === "split");
  assert.equal(split.announcedAt, split.exDate);
  assert.match(split.notes, /Kein Ankuendigungsdatum/);
});

/* ---------------------------------------------------- Fehlerfaelle */

test("T12 · Ein abgelehnter Schluessel wird nicht wiederholt", async () => {
  let calls = 0;
  const p = provider(() => { calls++; return F.response(F.ERROR_UNAUTHORIZED, 401); });
  const res = await p.getDailyBars("ref_AAPL", {});
  assert.equal(res.available, false);
  assert.equal(res.reason, "authError");
  assert.equal(calls, 1, "ein falscher Schluessel wird durch Wiederholen nicht richtig");
});

test("T13 · Der Schluessel erscheint in keiner Antwort und keiner Diagnose", async () => {
  // Der boesartige Fall: der Anbieter spiegelt die Anfrage zurueck.
  const p = provider((url) => F.response(
    { detail: "Not authorized for token " + KEY + " at " + url }, 401));
  const res = await p.getDailyBars("ref_AAPL", {});

  assert.ok(!JSON.stringify(res).includes(KEY),
    "der Adapter reicht den Schluessel aus einer Anbieterantwort durch");
  for (const probe of [p.healthCheck(), p.stats(), p.quota(), p.rawHealth()]) {
    assert.ok(!JSON.stringify(probe).includes(KEY), "Diagnoseausgabe enthaelt den Schluessel");
  }
});

test("T14 · Eine Antwort, die keine Kursreihe ist, gilt als Fehler", async () => {
  const p = provider(() => F.response({ detail: "irgendwas" }));
  const res = await p.getDailyBars("ref_AAPL", {});
  assert.equal(res.available, false);
  assert.equal(res.data, null);
});

test("T15 · Ein unbekanntes Symbol fuehrt zu keiner Anfrage", async () => {
  let called = false;
  const p = provider(() => { called = true; return F.response(F.AAPL_PLAIN); });
  const res = await p.getDailyBars("ref_UNBEKANNT", {});
  assert.equal(called, false, "lieber gar nicht fragen als das falsche Papier holen");
  assert.equal(res.reason, "symbolUnmapped");
});

/* --------------------------------------------- Kontingent (§9) */

test("T16 · Das Stundenkontingent bindet, nicht das Tageskontingent", async () => {
  // 50/Stunde ist der eigentliche Engpass. Ein Client, der nur das
  // Tageslimit kennt, verbraucht es in der ersten Minute.
  let now = 1_000_000, calls = 0;
  const p = Tiingo.createTiingoProvider({
    apiKey: KEY, symbolRegistry: registry(),
    capabilities: Tiingo.freePlanCapabilities(),
    limits: { requestsPerMinute: 1000, requestsPerHour: 3, requestsPerDay: 1000 },
    now: () => now, sleep: () => Promise.resolve(),
    fetchImpl: () => { calls++; return F.response(F.AAPL_PLAIN); }
  });

  for (let i = 0; i < 3; i++) {
    await p.getDailyBars("ref_AAPL", { from: "2020-0" + (i + 1) + "-01" });
  }
  assert.equal(calls, 3);

  const blocked = await p.getDailyBars("ref_AAPL", { from: "2020-04-01" });
  assert.equal(blocked.available, false);
  assert.equal(blocked.reason, "rateLimited");
  assert.match(blocked.message, /Stundenkontingent/);
  assert.equal(calls, 3, "das Kontingent wird eingehalten statt ueberschritten");
});

test("T17 · Die Free-Limits entsprechen der Kontoseite", () => {
  assert.equal(Tiingo.FREE_LIMITS.requestsPerHour, 50);
  assert.equal(Tiingo.FREE_LIMITS.requestsPerDay, 1000);
  assert.equal(Tiingo.FREE_LIMITS.bytesPerMonth, 2 * 1024 * 1024 * 1024);
  // Der kostenpflichtige Zugang aendert nur Zahlen, keine Faehigkeiten.
  const free = Tiingo.freePlanCapabilities();
  const comm = Tiingo.commercialPlanCapabilities();
  assert.deepEqual(comm.sets.market, free.sets.market,
    "ein hoeheres Kontingent macht aus einer ungepruefte Faehigkeit keine gepruefte");
  assert.ok(comm.limits.requestsPerHour > free.limits.requestsPerHour);
});

test("T18 · Der Cache spart Anfragen", async () => {
  let calls = 0;
  const p = provider(() => { calls++; return F.response(F.AAPL_PLAIN); });
  await p.getDailyBars("ref_AAPL", {});
  const zweite = await p.getDailyBars("ref_AAPL", {});
  assert.equal(calls, 1, "die zweite Anfrage kam aus dem Cache");
  assert.equal(zweite.fromCache, true);
});

/* ------------------------------------------------- Weitere Endpunkte */

test("T19 · Stammdaten werden kanonisch uebersetzt", async () => {
  const p = provider(() => F.response(F.METADATA_AAPL));
  const res = await p.getMetadata("ref_AAPL");
  assert.equal(res.available, true);
  assert.equal(res.data.name, "Apple Inc");
  assert.equal(res.data.exchange, "NASDAQ");
  assert.equal(res.data.startDate, "1980-12-12");
  assert.ok(!("exchangeCode" in res.data), "Vendor-Feldname durchgeschlagen");
});

test("T20 · Intraday laeuft ueber IEX und wird erst nach dem Nachweis zugesagt", async () => {
  assert.equal(Tiingo.freePlanCapabilities(null, null).sets.market.intraday, null,
    "ohne Bericht ungeprueft, nicht behauptet");
  assert.equal(Tiingo.freePlanCapabilities().sets.market.intraday, true,
    "mit Bericht zugesagt - der Nachweis hat 78 Bars ueber IEX geholt");

  let seenUrl = null;
  const p = provider((url) => { seenUrl = url; return F.response(F.IEX_INTRADAY); });
  const res = await p.getIntradayBars("ref_AAPL", { interval: "5min" });
  assert.match(seenUrl, /\/iex\/AAPL\/prices/);
  assert.match(seenUrl, /resampleFreq=5min/);
  assert.equal(res.available, true);
  assert.equal(res.data.bars.length, 2);
  assert.equal(res.data.bars[0].dataSourceId, "ds_tiingo");
});

test("T21 · Eine ausdruecklich fehlende Faehigkeit fuehrt zu keiner Anfrage", async () => {
  const caps = Tiingo.freePlanCapabilities();
  let called = false;
  const p = provider(() => { called = true; return F.response(F.IEX_INTRADAY); },
    { market: { ...caps.sets.market, intraday: false } });
  const res = await p.getIntradayBars("ref_AAPL", {});
  assert.equal(called, false);
  assert.equal(res.reason, "providerCapabilityMissing");
});

test("T22 · Der Adapter erfuellt den MarketDataProvider-Vertrag sinngemaess", () => {
  const p = provider(() => F.response(F.AAPL_PLAIN));
  for (const m of ["getDailyBars", "getHistoricalBars", "getIntradayBars", "getQuote",
                   "getMetadata", "getCorporateActions", "healthCheck", "stats", "quota"]) {
    assert.equal(typeof p[m], "function", m + " fehlt");
  }
  assert.equal(p.isMock, false, "ein echter Adapter darf sich nicht als Mock ausgeben");
  assert.equal(p.providerId, "tiingo");
});

/* ------------------------------------------ Laufzeitnachweis (§33) */

/* Ein erfundener Bericht - er prueft die Mechanik, nicht Tiingo. Der echte
   Bericht liegt unter quant/data/market/ und entsteht nur in GitHub
   Actions, wo der Schluessel liegt. */
const BERICHT = (findings) => ({
  provider: "tiingo",
  generatedAt: "2026-01-01T00:00:00.000Z",
  run: { source: "github-actions", runId: "42", commit: "abc123", ref: "test" },
  findings
});

test("T23 · Ohne Nachweis sagt der Adapter nichts zu", () => {
  const caps = Tiingo.freePlanCapabilities(null, null);
  for (const cap of ["adjustedPrices", "splitAdjustedPrices", "splits", "dividends",
                     "intraday", "realtime", "websocket"]) {
    assert.equal(caps.sets.market[cap], null, cap + " ist ohne Beleg keine Zusage");
  }
  assert.deepEqual(caps.evidence, {});
  assert.equal(caps.verifiedAt, null);
});

test("T24 · Ein Befund hebt genau eine Faehigkeit an und hinterlaesst den Beleg", () => {
  const caps = Tiingo.freePlanCapabilities(null, BERICHT([
    { capability: "adjustedPrices", result: "PASSED",
      checkedAt: "2026-01-01T00:00:00.000Z", evidence: { ratio: 0.93 } }
  ]));

  assert.equal(caps.sets.market.adjustedPrices, true);
  // Und nur diese eine. Ein Befund ueber die Bereinigung sagt nichts
  // ueber Intraday.
  assert.equal(caps.sets.market.intraday, null);
  assert.equal(caps.sets.market.splits, null);

  const beleg = caps.evidence.adjustedPrices;
  assert.equal(beleg.verificationLevel, "RUNTIME_VERIFIED");
  assert.equal(beleg.runId, "42");
  assert.equal(beleg.source, "github-actions");
  assert.deepEqual(beleg.observed, { ratio: 0.93 });
  assert.equal(caps.verifiedAt, "2026-01-01T00:00:00.000Z");
});

test("T25 · Ein gescheiterter Befund setzt auf false, kein Befund laesst null", () => {
  const caps = Tiingo.freePlanCapabilities(null, BERICHT([
    { capability: "intraday", result: "FAILED", evidence: { reason: "403" } },
    { capability: "dividends", result: "SKIPPED" }
  ]));
  // false und null sind nicht dasselbe: das eine ist eine Auskunft, das
  // andere ihr Fehlen.
  assert.equal(caps.sets.market.intraday, false);
  assert.equal(caps.sets.market.dividends, null);
  assert.equal(caps.evidence.dividends, undefined,
    "ein uebersprungener Test ist kein Beleg");
});

test("T26 · Ein Befund ohne Zuordnung hebt nichts an", () => {
  // symbolEncoding und apiAccess sind Voraussetzungen, keine Faehigkeiten
  // der Matrix. Ein Befund darf nicht auf eine Faehigkeit durchschlagen,
  // die er gar nicht geprueft hat.
  const caps = Tiingo.freePlanCapabilities(null, BERICHT([
    { capability: "symbolEncoding", result: "PASSED", evidence: { symbol: "BRK-B" } }
  ]));
  assert.equal(caps.evidence.symbolEncoding, undefined);
  assert.equal(Object.keys(caps.evidence).length, 0);
});

test("T27 · Ein unbrauchbarer Bericht haelt den Adapter nicht an", () => {
  for (const kaputt of [{}, { findings: null }, { provider: "polygon", findings: [] }]) {
    const caps = Tiingo.freePlanCapabilities(null, kaputt);
    assert.equal(caps.sets.market.adjustedPrices, null);
  }
  // Und eine fehlende Datei ist kein Fehler, sondern ein leerer Befund.
  assert.equal(Tiingo.loadRuntimeEvidence("/nicht/vorhanden.json"), null);
});

test("T28 · Der echte Nachweis im Baum belegt, was er behauptet", () => {
  // Kein Netzverkehr: die Datei ist committed und stammt aus einem Lauf in
  // GitHub Actions. Dieser Test haelt fest, dass sie das auch bleibt - eine
  // von Hand gesetzte Zusage waere daran erkennbar, dass ihr der Beleg fehlt.
  const bericht = Tiingo.loadRuntimeEvidence();
  assert.ok(bericht, "der Laufzeitnachweis fehlt");
  assert.equal(bericht.run.source, "github-actions");
  assert.ok(bericht.run.runId, "ohne Run-ID ist der Befund nicht nachpruefbar");

  const caps = Tiingo.freePlanCapabilities();
  for (const [cap, wert] of Object.entries(caps.sets.market)) {
    if (wert === null) continue;
    if (cap === "daily" || cap === "marketStatus") continue;   // aus der Deklaration
    assert.ok(caps.evidence[cap], cap + " ist zugesagt, aber ohne Beleg");
    assert.equal(caps.evidence[cap].verificationLevel, "RUNTIME_VERIFIED");
  }
});

test("T29 · Die Grenzen des kostenpflichtigen Tarifs sind als Annahme gekennzeichnet", () => {
  // Es besteht kein kostenpflichtiger Zugang. Die Zahlen stehen im Code,
  // damit der Umschaltweg gebaut werden kann - nicht weil jemand sie
  // nachgesehen haette. Eine Annahme, auf die man ein Kontingent stuetzt,
  // ist ein Ausfall mit Ansage; also muss sie sich als Annahme zu
  // erkennen geben, und zwar in den Daten und nicht nur im Kommentar.
  assert.equal(Tiingo.COMMERCIAL_LIMITS.verified, false);
  assert.match(Tiingo.COMMERCIAL_LIMITS.note, /Platzhalter|ungeprueft/);
  // Die Grenzen des Free-Tarifs sind dagegen in Betrieb: der Import
  // laeuft gegen sie.
  assert.equal(Tiingo.FREE_LIMITS.requestsPerHour, 50);
  assert.equal(Tiingo.FREE_LIMITS.requestsPerDay, 1000);
  assert.equal(Tiingo.FREE_LIMITS.bytesPerMonth, 2 * 1024 * 1024 * 1024);
});

test("T30 · Ein Kontingentproblem widerlegt keine Faehigkeit", () => {
  /* Der Fall aus dem echten Betrieb: nach fuenf Laeufen in einer Stunde
     hat Tiingo das Stundenkontingent gemeldet. Der Nachweis schrieb
     daraufhin apiAccess FAILED - und der Adapter haette daraus
     securityMaster: false gemacht. Eine Widerlegung, die nur besagt,
     dass gerade niemand nachsehen konnte.

     INCONCLUSIVE darf deshalb nichts anfassen: weder anheben noch
     absenken. */
  const caps = Tiingo.freePlanCapabilities(null, {
    provider: "tiingo",
    run: { source: "github-actions", runId: "99" },
    findings: [
      { capability: "apiAccess", result: "INCONCLUSIVE",
        evidence: { reason: "quotaExceeded" } },
      { capability: "intraday", result: "INCONCLUSIVE",
        evidence: { reason: "rateLimited" } }
    ]
  });
  assert.equal(caps.sets.reference.securityMaster, true,
    "securityMaster war in der Deklaration true und bleibt es");
  assert.equal(caps.sets.market.intraday, null,
    "intraday war ungeprueft und bleibt ungeprueft");
  assert.deepEqual(caps.evidence, {}, "ein nicht messbarer Lauf ist kein Beleg");
});

test("T31 · Anfragegrenze und Kontingent sind zwei verschiedene Zustaende", async () => {
  /* §25: die Unterscheidung ist fuer den Aufrufer die interessante. Eine
     Anfragegrenze loest sich in Sekunden, ein erschoepftes Tageskontingent
     erst am naechsten Tag. Beides "erschoepft" zu nennen nimmt ihm die
     Entscheidung ab, ob er wartet oder aufhoert. */
  let uhr = 1_000_000;
  const p = Tiingo.createTiingoProvider({
    apiKey: KEY,
    capabilities: Tiingo.freePlanCapabilities(),
    symbolRegistry: registry(),
    fetchImpl: () => F.response(F.AAPL_PLAIN),
    sleep: () => Promise.resolve(),
    now: () => uhr,
    limits: { requestsPerMinute: 2, requestsPerHour: 2, requestsPerDay: 100,
              bytesPerMonth: Infinity, concurrency: 1, maxRetries: 0, baseBackoffMs: 1 }
  });

  // Nur Symbole aus der Registry: ein nicht zugeordnetes Symbol wuerde gar
  // keine Anfrage ausloesen und die Zaehlung still verfaelschen.
  const ersteZwei = await Promise.all([
    p.getDailyBars("ref_AAPL", { from: "2024-01-01" }),
    p.getDailyBars("ref_NVDA", { from: "2024-01-01" })
  ]);
  assert.deepEqual(ersteZwei.map((r) => r.available), [true, true],
    "die ersten beiden Abrufe muessen durchgehen - sonst prueft der Test nichts");
  assert.equal(p.healthCheck().status, "ok");

  // Der dritte Abruf faellt in die Stundengrenze - und die Wartezeit ist
  // zu lang, um sie auszusitzen.
  const dritter = await p.getDailyBars("ref_KO", { from: "2024-01-01" });
  assert.equal(dritter.available, false);
  assert.equal(dritter.reason, "rateLimited");
  assert.equal(p.rawHealth().status, "rateLimited",
    "der Zustand muss sich vom erschoepften Tageskontingent unterscheiden");
  assert.match(dritter.message, /Stundenkontingent/);
  // Nach aussen bleibt es "degraded": der Anbieter antwortet, er drosselt nur.
  assert.equal(p.healthCheck().status, "degraded");
});
