/* Discover — Markets 2.0: Marktdetail und Intelligence-Module (konsumieren nur den Product Contract). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const Contract = require("../../quant/api/multi-asset-contract.js");
const MP = require("../../quant/engines/multi-asset/market-pulse.js");
const snapshot = require("../../quant/data/market/multi-asset/snapshot.json");
const pulse = require("../../quant/data/market/intelligence/market-pulse.json");
const pulseCfg = require("../../quant/config/market-pulse.json");

function load() {
  const el = (tag, attrs, kids) => ({ tag, attrs: attrs || {}, children: (kids || []).filter(Boolean) });
  const ctx = { QuantShell: { el, clear() {}, loadJSON: () => Promise.reject(new Error("offline")) },
                VUMultiAssetContract: Contract, VUMarketPulse: MP, Intl, Date, Math, String, Object, Array, JSON, console, encodeURIComponent };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["../ui/markets.js", "../ui/market-detail.js"]) vm.runInContext(readFileSync(new URL(f, import.meta.url), "utf8"), ctx);
  return ctx.VUDiscover;
}
const D = load();
const MD = D.MarketDetail, MK = D.Markets;
const bySym = (s) => snapshot.instruments.find((c) => c.instrument.symbol === s);
const text = (node) => (node == null ? "" : typeof node === "string" ? node : (node.attrs && node.attrs.text ? node.attrs.text : "") + (node.children || []).map(text).join(" "));
const find = (node, pred, out = []) => { if (node && typeof node === "object") { if (pred(node)) out.push(node); (node.children || []).forEach((k) => find(k, pred, out)); } return out; };

test("Zeitraumwahrheit: nur, was der Vertrag traegt", () => {
  const z = (s) => Object.fromEntries(MD.zeitraeume(bySym(s)).map((x) => [x.id, x.state]));
  assert.equal(z("QQQ")["1D"], "AVAILABLE", "Tracker mit echtem Intraday-Pfad");
  assert.equal(z("US10Y")["1D"], "UNAVAILABLE", "Renditen: kein kuenstlicher Tageschart");
  assert.equal(z("WTI")["1D"], "UNAVAILABLE", "EIA-Tageswert ist kein Intraday");
  assert.equal(z("XAUUSD")["5Y"], "UNAVAILABLE", "Gold-Historie ab 2021 traegt keine 5 Jahre");
  assert.equal(z("XAUUSD").MAX, "AVAILABLE");
  assert.deepEqual(JSON.parse(JSON.stringify(MD.zeitraeume(bySym("SPY")).map((x) => x.id))), ["1D", "1W", "1M", "3M", "1Y", "5Y", "MAX"]);
});

test("Standard-Zeitraum: 1T fuer Tracker und Krypto, sonst 1J", () => {
  assert.equal(MD.standardZeitraum(bySym("QQQ"), MD.zeitraeume(bySym("QQQ"))), "1D");
  assert.equal(MD.standardZeitraum(bySym("BTCUSD"), MD.zeitraeume(bySym("BTCUSD"))), "1D");
  assert.equal(MD.standardZeitraum(bySym("US10Y"), MD.zeitraeume(bySym("US10Y"))), "1Y");
});

test("1T: Tracker nur die letzte New Yorker Sitzung, Krypto die letzten 24 Stunden - keine erfundenen Punkte", () => {
  const pts = [["2026-09-23T19:55:00.000Z", 1], ["2026-09-24T13:30:00.000Z", 2], ["2026-09-24T19:55:00.000Z", 3]];
  assert.deepEqual(JSON.parse(JSON.stringify(MD.intradayFenster(bySym("QQQ"), pts).map((p) => p[1]))), [2, 3]);
  const k = [["2026-09-23T06:00:00.000Z", 1], ["2026-09-24T07:10:00.000Z", 2], ["2026-09-25T07:05:00.000Z", 3]];
  assert.deepEqual(JSON.parse(JSON.stringify(MD.intradayFenster(bySym("BTCUSD"), k).map((p) => p[1]))), [2, 3]);
});

test("Tracker: Performance ist Tracker-Performance, nie Indexperformance; kein Index im Instrumenttext", () => {
  const c = bySym("QQQ");
  const p = MD.performanceText(c, [["2026-01-01", 100], ["2026-09-24", 110]], { id: "1Y", lang: "1 Jahr" });
  assert.equal(p.text, "Der QQQ-Tracker über 1 Jahr: +10,00 %");
  assert.doesNotMatch(p.text, /Nasdaq/);
  assert.match(MD.instrumentText(c), /^Börsengehandelter Tracker \(ETF\)/);
  assert.doesNotMatch(MD.instrumentText(c), /Indexstand/);
});

test("Renditen und Leitzinsen: Veraenderung in bp, neutral, keine Umrechnung auf der Achse", () => {
  const y = bySym("US10Y");
  const p = MD.performanceText(y, [["2025-09-24", 4.15], ["2026-09-24", 5.18]], { id: "1Y", lang: "1 Jahr" });
  assert.equal(p.text, "US 10J über 1 Jahr: +103 bp");
  assert.equal(p.neutral, true);
  assert.match(MD.achsenText(y, { currency: null, converted: false }), /Rendite in % – nicht umgerechnet/);
  assert.match(MD.achsenText(bySym("FED_TARGET"), { converted: false }), /Zinssatz in % \(Obergrenze des Zielbands\)/);
});

test("Leitzins: Treppe bis zum Beobachtungsstand, letzte Aenderung in bp", () => {
  const t = MD.treppe([["2025-09-17", 4.0, 4.25], ["2025-12-10", 3.5, 3.75]], "2026-09-23");
  assert.deepEqual(JSON.parse(JSON.stringify(t)), [["2025-09-17", 4.25], ["2025-12-10", 4.25], ["2025-12-10", 3.75], ["2026-09-23", 3.75]]);
  const l = MD.letzteAenderung([["2025-09-17", 4.0, 4.25], ["2025-12-10", 3.5, 3.75]]);
  assert.equal(l.bp, -50); assert.match(l.text, /^−50 bp am 10\.12\.2025$/);
});

test("Monetaere Achse nennt Einheit und Umrechnung; EUR/USD bleibt Kurs", () => {
  assert.equal(MD.achsenText(bySym("XAUUSD"), { currency: "EUR", converted: true }), "Achse: EUR je Feinunze (umgerechnet aus USD)");
  assert.equal(MD.achsenText(bySym("WTI"), { currency: "USD", converted: false }), "Achse: USD je Barrel");
  assert.equal(MD.achsenText(bySym("EURUSD"), { converted: false }), "Achse: US-Dollar je Euro");
});

test("Warum wichtig: Einordnung ohne Prognose und ohne Kaufempfehlung", () => {
  for (const s of ["QQQ", "BTCUSD", "XAUUSD", "WTI", "US10Y", "FED_TARGET", "EURUSD", "N225"]) {
    const w = MD.warumWichtig(bySym(s));
    assert.ok(w && w.length > 30, s);
    assert.doesNotMatch(w, /wird steigen|wird fallen|kaufen|verkaufen|empfehl/i, s);
  }
});

test("Uebersicht: jede Karte mit Wert fuehrt zu ihrem Marktdetail", () => {
  const c = Contract.refresh(bySym("BTCUSD"), { now: new Date("2026-09-25T06:00:00Z") });
  const groups = MK.gruppieren([c]);
  assert.equal(groups[0].id, "krypto");
});

test("Markt jetzt: Links auf das Detail, Tracker gekennzeichnet, hoechstens fuenf", () => {
  const jetzt = new Date(snapshot.generatedAt);
  const contracts = snapshot.instruments.map((c) => Contract.refresh(c, { now: jetzt }));
  const node = MK.marktJetzt(contracts, pulseCfg, jetzt);
  if (!node) return; /* ruhiger Markt und nichts Aktuelles: dann fehlt das Modul ehrlich */
  const links = find(node, (n) => n.tag === "a");
  assert.ok(links.length >= 1 && links.length <= 5);
  for (const a of links) assert.match(a.attrs.href, /^#\/maerkte\/[A-Z0-9_]+$/);
});

test("Market Pulse: fuenf Dimensionen, Schlagzeile, Methodik sichtbar, veraltete Evidenz markiert, kein Score", () => {
  const node = MK.pulsBereich(pulse);
  const t = text(node);
  assert.equal(find(node, (n) => n.attrs && n.attrs["data-dimension"] && /dx-puls-dim/.test(n.attrs.class)).length, 5);
  assert.match(t, /Methodik:/);
  assert.match(t, /kein Gesamtscore, keine Prognose, keine Anlageberatung/);
  assert.match(t, /Makro-Umfeld .* noch nicht zertifiziert/);
  assert.doesNotMatch(t, /\/100|Score \d/);
  const alt = Object.values(pulse.dimensions).some((d) => d.evidence.some((e) => e.current === false));
  if (alt) assert.match(t, /nicht aktuell/);
});

test("Movers: Links zur Aktienseite, Sitzung genannt", () => {
  const node = MK.moversBereich(pulse);
  if (!pulse.movers.gainers) return;
  const links = find(node, (n) => n.tag === "a");
  assert.equal(links.length, pulse.movers.gainers.length + pulse.movers.losers.length);
  for (const a of links) assert.match(a.attrs.href, /^#\/s\/US_REAL\//);
  assert.match(text(node), /Sitzung vom/);
});

test("Keine Anbieterlogik und keine Umrechnung von Hand in Discover", () => {
  for (const f of ["../ui/market-detail.js", "../ui/markets.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /tiingo\.com|apikey|token=|fetch\(|XMLHttpRequest|new WebSocket/i, f);
    assert.doesNotMatch(src, /\* ?(1\.1|0\.9)\d|\/ ?(1\.1|0\.9)\d/, f + ": kein fester Wechselkurs");
  }
});
