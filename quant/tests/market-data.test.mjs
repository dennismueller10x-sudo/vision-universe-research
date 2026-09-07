/* =========================================================================
   PHASE 2 — PROVIDERSCHICHT

   Prueft die fuenf neuen Bausteine und den Twelve-Data-Adapter. Keine
   einzige Anfrage geht ins Netz: der Adapter bekommt ein `fetchImpl`
   eingesetzt, das feste Antworten liefert. Damit sind die Tests
   deterministisch, laufen ohne Zugangsdaten und pruefen genau das, was
   sonst nur im Fehlerfall in Produktion sichtbar wuerde.

   Die Reihenfolge folgt dem Datenweg:
     Faehigkeiten -> Symbolzuordnung -> Transport -> Qualitaet ->
     Betriebsmodus -> Adapter -> Referenzuniversum
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Capabilities = require("../engines/capabilities.js");
const SymbolMapping = require("../engines/symbol-mapping.js");
const MarketClient = require("../engines/market-client.js");
const MarketQuality = require("../engines/market-quality.js");
const DataMode = require("../engines/data-mode.js");
const TwelveData = require("../../providers/twelve-data/adapter.js");
const Provider = require("../engines/provider.js");

/* ===================================================== 1 · Faehigkeiten */

test("C1 · Drei Zustaende ueberleben die Deklaration", () => {
  const caps = Capabilities.declare("test", {
    market: { daily: true, websocket: false }
    // adjustedPrices bleibt ungenannt
  });
  assert.equal(caps.sets.market.daily, true, "zugesichert");
  assert.equal(caps.sets.market.websocket, false, "ausdruecklich nicht vorhanden");
  assert.equal(caps.sets.market.adjustedPrices, null, "ungeprueft");

  // Ein ausdrueckliches null darf nicht zu false kollabieren.
  const explicit = Capabilities.declare("test", { market: { splits: null } });
  assert.equal(explicit.sets.market.splits, null);

  // Fehleingaben landen im sicheren Zustand, nicht bei false.
  const sloppy = Capabilities.declare("test", { market: { daily: "ja", splits: 1 } });
  assert.equal(sloppy.sets.market.daily, null);
  assert.equal(sloppy.sets.market.splits, null);
});

test("C2 · supports und explicitlyMissing sind nicht das Gegenteil voneinander", () => {
  const caps = Capabilities.declare("test", { market: { daily: true, websocket: false } });

  assert.equal(Capabilities.supports(caps, "market", "daily"), true);
  assert.equal(Capabilities.supports(caps, "market", "websocket"), false);
  assert.equal(Capabilities.supports(caps, "market", "splits"), false, "ungeprueft ist keine Zusage");

  assert.equal(Capabilities.explicitlyMissing(caps, "market", "websocket"), true);
  assert.equal(Capabilities.explicitlyMissing(caps, "market", "splits"), false, "ungeprueft ist kein Ausschluss");

  // Genau darin liegt der Nutzen: eine ungepruefte Faehigkeit erlaubt nichts,
  // schliesst aber auch nichts aus. Sie fordert eine Pruefung an.
  assert.equal(
    Capabilities.supports(caps, "market", "splits") ||
    Capabilities.explicitlyMissing(caps, "market", "splits"),
    false, "ungeprueft faellt in keine der beiden Schubladen");
});

test("C3 · Eine fehlende Faehigkeit hat eine eigene Fehlerform", () => {
  const res = Capabilities.capabilityMissing("twelve-data", "fundamental", "pointInTime");
  assert.equal(res.available, false);
  assert.equal(res.reason, "providerCapabilityMissing");
  assert.equal(res.data, null);
  assert.equal(res.capability, "fundamental.pointInTime");
  // Unterscheidbar von "der Wert fehlt gerade" — die UI formuliert beides anders,
  // und nur dieser Fall laesst sich durch einen Plan- oder Anbieterwechsel loesen.
  assert.notEqual(res.reason, "dataUnavailable");
});

/* =============================================== 2 · Symbolzuordnung */

test("M1 · Ein mehrdeutiges Kuerzel wird nicht geraten", () => {
  const registry = SymbolMapping.createRegistry([
    { securityId: "sec_BMW_DE", providerId: "p", providerSymbol: "BMW", ticker: "BMW",
      mic: "XETR", currency: "EUR", country: "DE" },
    // Derselbe Providersymbol-String fuer zwei verschiedene Papiere — genau
    // die Lage, in der ein geratener Treffer die Daten des falschen
    // Unternehmens liefern wuerde.
    { securityId: "sec_BMW_ZA", providerId: "p", providerSymbol: "BMW", ticker: "BMW",
      mic: "XJSE", currency: "ZAR", country: "ZA" }
  ]);

  const blind = registry.toSecurity("p", "BMW");
  assert.equal(blind.resolved, false, "ohne Hinweis darf nichts aufgeloest werden");
  assert.ok(blind.candidates.length >= 2);

  const hinted = registry.toSecurity("p", "BMW", { mic: "XETR" });
  assert.equal(hinted.resolved, true);
  assert.equal(hinted.entry.securityId, "sec_BMW_DE");
});

test("M2 · Widersprueche und ungeprueftes Mapping werden gemeldet", () => {
  const registry = SymbolMapping.createRegistry([
    { securityId: "sec_A", providerId: "p", providerSymbol: "AAA", ticker: "AAA", confidence: "verified" },
    { securityId: "sec_A", providerId: "p", providerSymbol: "AAA.US", ticker: "AAA", confidence: "inferred" }
  ]);
  const problems = SymbolMapping.validateAgainstSecurities(registry,
    [{ securityId: "sec_A", ticker: "AAA" }]);

  assert.ok(problems.some((p) => p.severity === "error" && /Widerspr/.test(p.message)),
    "zwei Symbole fuer dieselbe Security muessen ein Fehler sein");
  assert.ok(problems.some((p) => p.severity === "warning"),
    "ein abgeleitetes Mapping muss als ungeprueft gemeldet werden");
});

test("M3 · Ein abgeleitetes Mapping gilt als ungeprueft", () => {
  // Der haeufigste Fall im Betrieb: das Referenzuniversum erzeugt seine
  // Mappings aus einer Konfigurationsdatei, also abgeleitet. Wuerde nur
  // "unverified" gewarnt, bliebe genau dieser Fall stumm.
  const registry = SymbolMapping.createRegistry([
    { securityId: "sec_A", providerId: "p", providerSymbol: "AAA", ticker: "AAA",
      currency: "USD", confidence: "inferred" },
    { securityId: "sec_B", providerId: "p", providerSymbol: "BBB", ticker: "BBB",
      currency: "USD", confidence: "verified" }
  ]);
  const problems = SymbolMapping.validateAgainstSecurities(registry, [
    { securityId: "sec_A", ticker: "AAA", currency: "USD" },
    { securityId: "sec_B", ticker: "BBB", currency: "USD" }
  ]);

  const warned = problems.filter((p) => p.severity === "warning").map((p) => p.securityId);
  assert.deepEqual(warned, ["sec_A"], "abgeleitet muss warnen, verifiziert nicht");

  // Ohne Angabe gilt nichts als geprueft.
  const bare = SymbolMapping.createRegistry([
    { securityId: "sec_C", providerId: "p", providerSymbol: "CCC" }
  ]);
  assert.equal(bare.list()[0].confidence, "unverified");
});

test("M4 · Ein falscher Handelsplatz im Mapping ist ein Fehler", () => {
  const registry = SymbolMapping.createRegistry([
    { securityId: "sec_A", providerId: "p", providerSymbol: "AAA",
      mic: "XNAS", currency: "USD", confidence: "verified" }
  ]);
  const problems = SymbolMapping.validateAgainstSecurities(registry,
    [{ securityId: "sec_A", mic: "XNYS", currency: "USD" }]);

  assert.ok(problems.some((p) => p.severity === "error" && /Handelsplatz/.test(p.message)),
    "dasselbe Kuerzel an der falschen Boerse ist ein anderes Papier");
});

/* ==================================================== 3 · Transport */

function fakeResponse(body, status = 200) {
  return Promise.resolve({
    ok: status < 400, status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body))
  });
}

test("T1 · Der Cache verhindert die zweite identische Anfrage", async () => {
  let calls = 0;
  let now = 1_000_000;
  const client = MarketClient.createMarketClient({
    providerId: "test",
    fetchImpl: () => { calls++; return fakeResponse({ value: calls }); },
    now: () => now
  });

  const a = await client.request({ kind: "quote", url: "https://x/a", parse: (b) => b });
  const b = await client.request({ kind: "quote", url: "https://x/a", parse: (b) => b });

  assert.equal(calls, 1, "die zweite Anfrage kam aus dem Cache");
  assert.equal(b.fromCache, true);
  assert.deepEqual(a.data, b.data);

  // Nach Ablauf der TTL wird wieder gefragt.
  now += MarketClient.DEFAULT_TTL.quote + 1;
  await client.request({ kind: "quote", url: "https://x/a", parse: (b) => b });
  assert.equal(calls, 2);
});

test("T2 · Gleichzeitige identische Anfragen werden zusammengefasst", async () => {
  let calls = 0;
  const client = MarketClient.createMarketClient({
    providerId: "test",
    fetchImpl: () => { calls++; return fakeResponse({ ok: true }); }
  });

  const results = await Promise.all([
    client.request({ kind: "quote", url: "https://x/b", parse: (b) => b }),
    client.request({ kind: "quote", url: "https://x/b", parse: (b) => b }),
    client.request({ kind: "quote", url: "https://x/b", parse: (b) => b })
  ]);

  assert.equal(calls, 1, "drei parallele Aufrufe, eine Anfrage");
  results.forEach((r) => assert.equal(r.ok, true));
});

test("T3 · Ein voruebergehender Fehler wird wiederholt, ein Auth-Fehler nicht", async () => {
  let calls = 0;
  const transient = MarketClient.createMarketClient({
    providerId: "test",
    sleep: () => Promise.resolve(),
    fetchImpl: () => {
      calls++;
      return calls < 3 ? fakeResponse({ message: "boom" }, 500) : fakeResponse({ ok: true });
    }
  });
  const res = await transient.request({ kind: "quote", url: "https://x/c", parse: (b) => b });
  assert.equal(res.ok, true);
  assert.equal(calls, 3, "zweimal wiederholt, beim dritten Mal erfolgreich");

  let authCalls = 0;
  const auth = MarketClient.createMarketClient({
    providerId: "test",
    sleep: () => Promise.resolve(),
    fetchImpl: () => { authCalls++; return fakeResponse({ message: "invalid key" }, 401); }
  });
  const bad = await auth.request({ kind: "quote", url: "https://x/d", parse: (b) => b });
  assert.equal(bad.ok, false);
  assert.equal(authCalls, 1, "ein falscher Schluessel wird durch Wiederholen nicht richtig");
  assert.equal(auth.health().status, "authError");
});

test("T4 · Das Tageskontingent stoppt weitere Anfragen", async () => {
  let calls = 0;
  const client = MarketClient.createMarketClient({
    providerId: "test",
    limits: { requestsPerDay: 2, requestsPerMinute: 100 },
    fetchImpl: () => { calls++; return fakeResponse({ n: calls }); }
  });

  await client.request({ kind: "quote", url: "https://x/1", parse: (b) => b });
  await client.request({ kind: "quote", url: "https://x/2", parse: (b) => b });
  const third = await client.request({ kind: "quote", url: "https://x/3", parse: (b) => b });

  assert.equal(third.ok, false);
  assert.equal(third.reason, "quotaExceeded");
  assert.equal(calls, 2, "das Kontingent wird eingehalten, statt es zu ueberschreiten");
  assert.equal(client.health().status, "quotaExceeded");
});

test("T5 · Bei Ausfall wird veraltet, aber als veraltet geliefert", async () => {
  let fail = false;
  let now = 1_000_000;
  const client = MarketClient.createMarketClient({
    providerId: "test",
    sleep: () => Promise.resolve(),
    now: () => now,
    fetchImpl: () => fail ? fakeResponse({ message: "down" }, 503) : fakeResponse({ price: 100 })
  });

  const fresh = await client.request({ kind: "quote", url: "https://x/e", parse: (b) => b });
  assert.equal(fresh.stale, false);

  now += MarketClient.DEFAULT_TTL.quote + 1;   // Cache abgelaufen
  fail = true;
  const stale = await client.request({ kind: "quote", url: "https://x/e", parse: (b) => b });

  assert.equal(stale.ok, true, "lieber ein alter Wert als gar keiner");
  assert.equal(stale.stale, true, "aber niemals unmarkiert");
  assert.deepEqual(stale.data, { price: 100 });
});

test("T5b · Ein zu alter Wert wird nicht mehr als Notloesung ausgegeben", async () => {
  let fail = false;
  let now = 1_000_000;
  const client = MarketClient.createMarketClient({
    providerId: "test",
    sleep: () => Promise.resolve(),
    now: () => now,
    limits: { maxStaleMs: 60_000 },
    fetchImpl: () => fail ? fakeResponse({ message: "down" }, 503) : fakeResponse({ price: 100 })
  });

  await client.request({ kind: "quote", url: "https://x/g", parse: (b) => b });
  now += 120_000;   // aelter als maxStaleMs
  fail = true;
  const res = await client.request({ kind: "quote", url: "https://x/g", parse: (b) => b });

  assert.equal(res.ok, false,
    "irgendwann ist ein alter Kurs keine Notloesung mehr, sondern eine Falschinformation");
  assert.equal(res.reason, "requestFailed");
});

test("T6 · Die Diagnose enthaelt keine Zugangsdaten", async () => {
  const client = MarketClient.createMarketClient({
    providerId: "test",
    fetchImpl: () => fakeResponse({ ok: true })
  });
  await client.request({ kind: "quote", url: "https://x/f?apikey=TESTKEY-SEHR-GEHEIM-123456", parse: (b) => b });

  const dump = JSON.stringify([client.stats(), client.health(), client.quota()]);
  assert.ok(!dump.includes("TESTKEY-SEHR-GEHEIM"), "die Anfrage-URL darf nicht in der Diagnose stehen");
  assert.ok(!dump.includes("apikey"), "auch nicht der Parametername mit Wert");
});

/* ================================================= 4 · Datenqualitaet */

function series(closes, startDate = "2026-01-05") {
  const out = [];
  const d = new Date(startDate + "T00:00:00Z");
  for (const close of closes) {
    out.push({
      date: d.toISOString().slice(0, 10),
      open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

test("Q1 · Ein unbereinigter Split wird als Fehler erkannt, nicht als Kurssturz", () => {
  const bars = series([400, 402, 398, 401, 100, 101, 99, 100]);
  const res = MarketQuality.validateBars(bars, { today: "2026-12-31" });

  assert.equal(res.ok, false, "so eine Reihe darf nicht in die Engine");
  const split = res.findings.find((f) => f.code === "suspected_unadjusted_split");
  assert.ok(split, "der 4:1-Sprung muss als Split erkannt werden");
  assert.equal(split.severity, "error");
  assert.equal(res.stats.suspectedSplits, 1);
});

test("Q2 · Kaputte Bars werden einzeln benannt", () => {
  const bars = series([100, 101, 102, 103]);
  bars[1].high = bars[1].low - 1;      // High unter Low
  bars[2].close = null;                // kein Kurs
  bars[3].volume = -5;                 // negatives Volumen
  bars.push({ ...bars[3], date: bars[3].date }); // Dublette

  const res = MarketQuality.validateBars(bars, { today: "2026-12-31" });
  const codes = res.findings.map((f) => f.code);

  for (const expected of ["high_below_low", "invalid_close", "negative_volume", "duplicate_bar"]) {
    assert.ok(codes.includes(expected), `${expected} nicht erkannt (gefunden: ${codes.join(", ")})`);
  }
  // Die gesunden Bars bleiben nutzbar — eine kaputte Bar verwirft nicht die Reihe.
  assert.ok(res.bars.length >= 1);
  assert.ok(res.bars.every((b) => Number.isFinite(b.close)));
});

test("Q3 · Bars aus der Zukunft werden abgewiesen", () => {
  const bars = series([100, 101], "2026-01-05");
  bars.push({ date: "2099-01-01", open: 1, high: 1, low: 1, close: 1, volume: 1 });
  const res = MarketQuality.validateBars(bars, { today: "2026-09-07" });
  assert.ok(res.findings.some((f) => f.code === "future_bar"));
});

test("Q4 · Die Bereinigungsstufe steht als Befund in der Reihe", () => {
  const bars = series([100, 101, 102]);

  const unadjusted = MarketQuality.validateBars(bars, { today: "2026-12-31", adjustmentStatus: "unadjusted" });
  assert.ok(unadjusted.findings.some((f) => f.code === "unadjusted_series"));
  assert.equal(unadjusted.ok, true, "eine Warnung verwirft die Reihe nicht — sie begrenzt ihre Nutzung");

  const splitOnly = MarketQuality.validateBars(bars, { today: "2026-12-31", adjustmentStatus: "splitAdjusted" });
  const finding = splitOnly.findings.find((f) => f.code === "split_adjusted_only");
  assert.ok(finding, "der unauffaellige Fall braucht seinen eigenen Befund");
  assert.match(finding.message, /Total-Return/);

  const adjusted = MarketQuality.validateBars(bars, { today: "2026-12-31", adjustmentStatus: "adjusted" });
  assert.ok(!adjusted.findings.some((f) => /adjust/i.test(f.code)));
});

/* ================================================= 5 · Betriebsmodus */

test("D1 · Hybrid nennt echte Kurse und synthetische Fundamentaldaten getrennt", () => {
  const res = DataMode.resolveSources("hybrid", {
    marketData: { available: true, origin: "endOfDay" },
    fundamentals: { available: false }
  });

  assert.equal(res.sources.marketData, "endOfDay");
  assert.equal(res.sources.fundamentals, "mock");

  const text = DataMode.summarize(res);
  assert.ok(!/^Live-Daten$/.test(text), "niemals pauschal 'Live-Daten'");
  assert.match(JSON.stringify(res) + text, /[Mm]ock|synthetisch|Modell/,
    "der synthetische Anteil muss benannt werden");
});

test("D2 · Ein Backtest auf synthetischen Fundamentaldaten ist kein Beleg", () => {
  const hybrid = DataMode.resolveSources("hybrid", {
    marketData: { available: true, origin: "endOfDay" },
    fundamentals: { available: false }
  });
  const eligibility = DataMode.backtestEligibility(hybrid);
  assert.equal(eligibility.realEvidence, false,
    "echte Kurse plus erfundene Fundamentaldaten ergeben keinen echten Nachweis");
});

test("D3 · Ein Ausfall wird gemeldet, nicht durch Mock ersetzt", () => {
  const res = DataMode.resolveSources("hybrid", {
    marketData: { available: false, reason: "requestFailed" },
    fundamentals: { available: false }
  });

  assert.ok(res.degraded.includes("marketData"), "der Ausfall muss sichtbar bleiben");
  assert.notEqual(res.sources.marketData, "live");
  assert.notEqual(res.sources.marketData, "endOfDay");
});

test("D4 · Eine fehlende Faehigkeit ist etwas anderes als ein Ausfall", () => {
  const res = DataMode.resolveSources("hybrid", {
    marketData: { available: true, origin: "endOfDay" },
    corporateActions: { available: false, reason: "providerCapabilityMissing" }
  });
  assert.equal(res.sources.corporateActions, "capabilityMissing");
  assert.notEqual(res.sources.corporateActions, "unavailable");
});

test("D5 · Der Modus kommt aus der Umgebung und faellt sicher zurueck", () => {
  assert.equal(DataMode.resolveMode({ VU_DATA_MODE: "hybrid" }), "hybrid");
  assert.equal(DataMode.resolveMode({ VU_DATA_MODE: "LIVE" }), "live");
  assert.equal(DataMode.resolveMode({ VU_DATA_MODE: "unsinn" }), "mock", "unbekannt = mock");
  assert.equal(DataMode.resolveMode({}), "mock", "ohne Angabe = mock");
});

/* ====================================================== 6 · Adapter */

const AAPL_RESPONSE = {
  meta: { symbol: "AAPL", interval: "1day", currency: "USD", exchange: "NASDAQ" },
  values: [
    // Der Anbieter liefert absteigend — der Adapter muss umdrehen.
    { datetime: "2026-09-04", open: "231.10", high: "233.40", low: "230.20", close: "232.80", volume: "41000000" },
    { datetime: "2026-09-03", open: "229.50", high: "231.90", low: "228.70", close: "231.05", volume: "38500000" },
    { datetime: "2026-09-02", open: "228.00", high: "230.10", low: "227.40", close: "229.60", volume: "36200000" }
  ],
  status: "ok"
};

function makeProvider(fetchImpl, overrides) {
  const registry = SymbolMapping.createRegistry([{
    securityId: "ref_AAPL", providerId: TwelveData.PROVIDER_ID, providerSymbol: "AAPL",
    ticker: "AAPL", mic: "XNAS", currency: "USD", country: "US", confidence: "verified"
  }]);
  return TwelveData.createTwelveDataProvider({
    apiKey: "TESTKEY-0000000000",
    capabilities: TwelveData.freePlanCapabilities(overrides),
    symbolRegistry: registry,
    fetchImpl,
    sleep: () => Promise.resolve()
  });
}

test("A1 · Ohne Schluessel wird nichts abgerufen und nichts erfunden", async () => {
  let called = false;
  const provider = TwelveData.createTwelveDataProvider({
    capabilities: TwelveData.freePlanCapabilities(),
    fetchImpl: () => { called = true; return fakeResponse({}); }
  });

  const res = await provider.getDailyBars("ref_AAPL", {});
  assert.equal(called, false, "ohne Zugang darf keine Anfrage entstehen");
  assert.equal(res.available, false);
  assert.equal(res.reason, "notConfigured");
  assert.equal(res.data, null, "kein Rueckfall auf Demo- oder Mock-Daten");
  // Zwei Vokabulare, die nicht vermischt werden duerfen: `reason` ist
  // camelCase (Providerschicht), `health.status` folgt dem V1-Vertrag
  // aus quant/engines/provider.js und ist snake_case.
  assert.equal(provider.healthCheck().status, "not_configured");
  assert.ok(Provider.HEALTH_STATUS.includes(provider.healthCheck().status));
});

test("A2 · Die Antwort wird in kanonische PriceBars uebersetzt", async () => {
  const provider = makeProvider(() => fakeResponse(AAPL_RESPONSE));
  const res = await provider.getDailyBars("ref_AAPL", { outputsize: 3 });

  assert.equal(res.available, true);
  const bars = res.data.bars;
  assert.equal(bars.length, 3);

  // Aufsteigend sortiert, obwohl der Anbieter absteigend liefert.
  assert.deepEqual(bars.map((b) => b.date), ["2026-09-02", "2026-09-03", "2026-09-04"]);

  // Zahlen als Zahlen, nicht als Strings.
  bars.forEach((b) => {
    ["open", "high", "low", "close", "volume"].forEach((f) =>
      assert.equal(typeof b[f], "number", `${f} muss eine Zahl sein`));
  });
  assert.equal(bars[2].close, 232.8);
  assert.equal(bars[0].currency, "USD");

  // Keine Vendor-Felder im kanonischen Datensatz.
  assert.deepEqual(Provider.findVendorLeakage(bars[0]), []);
  assert.ok(!("datetime" in bars[0]), "das Vendor-Feld darf nicht durchschlagen");
});

test("A3 · Ohne bestaetigte Bereinigung bleibt adjustedClose null", async () => {
  const provider = makeProvider(() => fakeResponse(AAPL_RESPONSE));
  const res = await provider.getDailyBars("ref_AAPL", {});

  assert.equal(res.data.adjustmentStatus, "unadjusted");
  res.data.bars.forEach((b) => {
    assert.equal(b.adjustedClose, null,
      "ein unbereinigter Schlusskurs als adjustedClose waere kein ungenauer, sondern ein falscher Wert");
    assert.equal(b.adjustmentStatus, "unadjusted");
  });

  // Erst mit zugesicherter Bereinigung traegt das Feld einen Wert.
  const caps = TwelveData.freePlanCapabilities();
  const upgraded = makeProvider(() => fakeResponse(AAPL_RESPONSE), {
    market: { ...caps.sets.market, adjustedPrices: true }
  });
  const better = await upgraded.getDailyBars("ref_AAPL", {});
  assert.equal(better.data.adjustmentStatus, "adjusted");
  assert.equal(typeof better.data.bars[0].adjustedClose, "number");
});

test("A4 · Splitbereinigt ist ein eigener Zustand zwischen den beiden", async () => {
  const caps = TwelveData.freePlanCapabilities();
  const provider = makeProvider(() => fakeResponse(AAPL_RESPONSE), {
    market: { ...caps.sets.market, splitAdjustedPrices: true }
  });
  const res = await provider.getDailyBars("ref_AAPL", {});

  assert.equal(res.data.adjustmentStatus, "splitAdjusted");
  // Splitbereinigt heisst NICHT total-return-faehig: die Dividenden fehlen.
  res.data.bars.forEach((b) => assert.equal(b.adjustedClose, null));
});

test("A5 · Ein Anbieterfehler mit HTTP 200 wird trotzdem als Fehler erkannt", async () => {
  // Twelve Data antwortet auf manche Fehler mit Status 200 und einem
  // Fehlerobjekt im Rumpf. Wer nur auf response.ok prueft, haelt das fuer
  // eine leere, aber gueltige Antwort.
  const provider = makeProvider(() => fakeResponse({
    code: 429, message: "You have run out of API credits", status: "error"
  }, 200));

  const res = await provider.getDailyBars("ref_AAPL", {});
  assert.equal(res.available, false, "eine 200er-Antwort mit status:error ist kein Erfolg");
  assert.ok(["quotaExceeded", "requestFailed"].includes(res.reason), `unerwarteter Grund: ${res.reason}`);
  assert.equal(res.data, null);
});

test("A5b · Eine Zeitreihenantwort ohne values ist ein Fehler, keine leere Reihe", async () => {
  // Eine 200er-Antwort ohne das Feld `values` ist keine leere Zeitreihe,
  // sondern eine kaputte Antwort. Als Erfolg behandelt landet sie fuer die
  // volle Cache-Lebensdauer im Speicher — bei Tageshistorie sechs Stunden.
  // Ein einmaliger Aussetzer waere damit ein halber Tag ohne Daten.
  const broken = makeProvider(() => fakeResponse({ meta: { currency: "USD" } }));
  const res = await broken.getDailyBars("ref_AAPL", {});
  assert.equal(res.available, false);
  assert.equal(res.data, null);

  // Ein ausdrueckliches values: [] ist dagegen eine gueltige leere Reihe
  // (etwa ein Zeitraum ohne Handelstage). Sie wird durchgereicht und faellt
  // erst in der Qualitaetspruefung durch — an der richtigen Stelle.
  const empty = makeProvider(() => fakeResponse({ meta: { currency: "USD" }, values: [] }));
  const emptyRes = await empty.getDailyBars("ref_AAPL", {});
  assert.equal(emptyRes.available, true);
  assert.equal(emptyRes.data.bars.length, 0);

  const validation = MarketQuality.validateBars(emptyRes.data.bars, { today: "2026-12-31" });
  assert.equal(validation.ok, false);
  assert.ok(validation.findings.some((f) => f.code === "too_few_bars"));
});

test("A6 · Ein nicht zugeordnetes Symbol fuehrt zu keiner Anfrage", async () => {
  let called = false;
  const provider = makeProvider(() => { called = true; return fakeResponse(AAPL_RESPONSE); });
  const res = await provider.getDailyBars("ref_UNBEKANNT", {});

  assert.equal(called, false, "lieber gar nicht fragen als das falsche Papier holen");
  assert.equal(res.available, false);
  assert.equal(res.reason, "symbolUnmapped");
});

test("A7 · Fehlende Faehigkeiten melden sich als solche", async () => {
  const provider = makeProvider(() => fakeResponse({}));

  const actions = await provider.getCorporateActions("ref_AAPL", {});
  assert.equal(actions.available, false);
  assert.equal(actions.reason, "providerCapabilityMissing",
    "Splits und Dividenden fehlen im kostenlosen Zugang — das ist eine Faehigkeitsluecke, kein Ausfall");
});

test("A8 · Der Adapter erfuellt den Provider-Vertrag der Marktdaten", () => {
  const provider = makeProvider(() => fakeResponse(AAPL_RESPONSE));
  for (const method of ["getDailyBars", "getHistoricalBars", "getQuote", "getMarketStatus",
                        "getSymbolSearch", "getCorporateActions", "healthCheck"]) {
    assert.equal(typeof provider[method], "function", `${method} fehlt`);
  }
  assert.equal(provider.isMock, false, "ein echter Adapter darf sich nicht als Mock ausgeben");
  assert.equal(provider.providerId, "twelve-data");
});

/* ============================================ 7 · Referenzuniversum */

test("R1 · Das Referenzuniversum ist klein, echt und ohne Fundamentaldaten", () => {
  const config = JSON.parse(readFileSync(join(ROOT, "quant", "config", "market-universe.json"), "utf8"));

  assert.ok(config.securities.length >= 10 && config.securities.length <= 20,
    `${config.securities.length} Titel — die Vorgabe war ein kleines, liquides Testuniversum`);

  const ids = new Set();
  for (const s of config.securities) {
    assert.match(s.securityId, /^ref_/, "reale Titel tragen das Praefix ref_");
    assert.ok(!ids.has(s.securityId), `doppelte securityId ${s.securityId}`);
    ids.add(s.securityId);
    assert.ok(s.ticker && s.mic && s.exchange, `${s.securityId} unvollstaendig`);
    // Ein realer Titel darf keine Fundamentalzahlen mitbringen.
    for (const forbidden of ["eps", "revenue", "roic", "peRatio", "facts", "fundamentals"]) {
      assert.ok(!(forbidden in s), `${s.securityId} traegt das Feld ${forbidden}`);
    }
  }
  assert.ok(config.boundary && /Fundamental/i.test(config.boundary),
    "die Trennung zwischen echten Kursen und synthetischen Fundamentaldaten muss dokumentiert sein");
});

test("R2 · Reales und synthetisches Universum sind disjunkt", () => {
  const config = JSON.parse(readFileSync(join(ROOT, "quant", "config", "market-universe.json"), "utf8"));
  const Generator = require("../engines/mock-generator.js");
  const dataset = Generator.generateDataset();

  const mockIds = new Set(dataset.securities.map((s) => s.securityId));
  const mockTickers = new Set(dataset.securities.map((s) => s.ticker));

  for (const s of config.securities) {
    assert.ok(!mockIds.has(s.securityId), `${s.securityId} existiert in beiden Universen`);
    assert.ok(!mockTickers.has(s.ticker),
      `${s.ticker} ist zugleich ein synthetischer Titel — genau diese Vermischung ist ausgeschlossen`);
  }
});

test("R3 · Der Statusbericht behauptet nie mehr, als vorhanden ist", () => {
  const status = JSON.parse(readFileSync(join(ROOT, "quant", "data", "market", "status.json"), "utf8"));

  assert.ok(DataMode.MODES.includes(status.dataMode), `unbekannter Modus ${status.dataMode}`);
  if (!status.configured) {
    assert.equal(status.dataMode, "mock", "ohne Zugang gibt es nur den Mock-Modus");
    assert.ok(/Mock|mock/.test(status.notice), "der Hinweis muss den Mock-Modus benennen");
  }
  // Der Statusbericht ist eine ausgelieferte Datei — er darf keine Zugangsdaten tragen.
  const raw = JSON.stringify(status);
  assert.ok(!/apikey/i.test(raw));
  assert.ok(status.boundary, "die Grenze zwischen echt und synthetisch gehoert in jeden Statusbericht");
});
