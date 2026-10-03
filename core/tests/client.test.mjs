/* Core · Data Contracts (core/client.js) gegen den echten Repository-Stand
   und gegen Fehlerfaelle. Golden Path "Stock": Security existiert ->
   aktueller Kurs -> Reihe fuer den Chart -> Fundamentals -> Quant ->
   und alles spricht von DERSELBEN Identitaet und DEMSELBEN Kurs. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Client = require(join(ROOT, "core", "client.js"));
const repo = async (p) => {
  const f = join(ROOT, p.replace(/^\//, ""));
  if (!existsSync(f)) throw new Error("fehlt: " + p);
  return JSON.parse(readFileSync(f, "utf8"));
};
const c = Client.create({ load: repo });

test("Vertrag · jede Antwort ist ein Umschlag mit state und Quelle - nie ein stilles null", async () => {
  for (const fn of ["getSecurity", "getPriceSeries", "getLatestPrice", "getFundamentals", "getCorporateActions", "getQuantData", "getIntraday"]) {
    const r = await c[fn]("ZZZZNOPE");
    assert.equal(r.state, "UNAVAILABLE", fn);
    assert.ok(r.reason, fn + " ohne Grund");
  }
  assert.equal((await c.getSecurity("../x")).reason, "INVALID_TICKER");
});

test("Golden Path Stock (NVDA, Mega Cap): Security -> Kurs -> Chart -> Fundamentals -> Quant, eine Identitaet, ein Kurs", async () => {
  const sec = await c.getSecurity("NVDA");
  assert.equal(sec.state, "AVAILABLE");
  assert.equal(sec.data.securityId, "ref_NVDA");
  assert.match(sec.data.instrumentId, /^vu_[a-f0-9]+$/);
  const px = await c.getLatestPrice("NVDA");
  assert.equal(px.state, "AVAILABLE");
  assert.ok(px.data.close > 0);
  const chart = await c.getPriceSeries("NVDA");
  assert.equal(chart.data.points[chart.data.points.length - 1][1], px.data.close, "Chart und Kurs widersprechen sich");
  const weekly = await c.getPriceSeries("NVDA", { range: "MAX" });
  assert.equal(weekly.state, "AVAILABLE");
  assert.equal(weekly.data.grain, "weekly");
  const page = await c.stockPage("NVDA");
  assert.ok(page.ok);
  assert.equal(page.data.price.value, px.data.close, "Aktienseite zeigt einen anderen Kurs als der Vertrag");
  assert.equal(page.data.securityId, sec.data.securityId);
  const fu = await c.getFundamentals("NVDA");
  assert.equal(fu.state, "AVAILABLE");
  assert.match(fu.data.cik, /^\d{10}$/);
  const q = await c.getQuantData("NVDA");
  assert.equal(q.state, "AVAILABLE");
  assert.equal(q.data.identityConsistent, true);
  assert.equal(q.data.capabilities.HAS_MARKET_DATA, true);
});

test("Wertpapierklassen: Share Class mit Bindestrich (MOG-A), ADR (TSM), Small Cap - derselbe Vertrag", async () => {
  for (const t of ["MOG-A", "TSM"]) {
    const sec = await c.getSecurity(t);
    assert.equal(sec.state, "AVAILABLE", t);
    const px = await c.getLatestPrice(t);
    assert.equal(px.state, "AVAILABLE", t);
    assert.equal(px.data.securityId, sec.data.securityId, t);
  }
  assert.equal((await c.getLatestPrice("MOG-A")).data.securityId, "ref_MOG_A");
});

test("Tagesaenderung kommt aus derselben Reihe wie der Kurs (eine Definition von Vortag)", async () => {
  const fake = Client.create({ load: async () => ({ asOf: "2026-10-02", to: "2026-10-02", grain: "daily", points: [["2026-10-01", 100], ["2026-10-02", 101.5]] }) });
  const px = await fake.getLatestPrice("XYZ");
  assert.equal(px.data.previousClose, 100);
  assert.equal(px.data.changePercent, 1.5);
});

test("Corporate Actions sagen offen, dass kein Ereignisregister ausgeliefert wird", async () => {
  const r = await c.getCorporateActions("NVDA");
  assert.equal(r.state, "UNAVAILABLE");
  assert.equal(r.reason, "NO_EVENT_REGISTER_PUBLISHED");
});

test("News-Vertrag liefert Stand und Maximalalter mit - der Verbraucher kann Veraltung zeigen", async () => {
  const n = await c.getNews();
  assert.equal(n.state, "AVAILABLE");
  assert.ok(n.data.updatedAt);
  assert.ok(Array.isArray(n.data.items));
});

test("Ein Ladefehler wird nicht gemerkt - der naechste Versuch laedt neu", async () => {
  let n = 0;
  const flaky = Client.create({ load: async () => { n++; if (n === 1) throw new Error("netz"); return { points: [["2026-10-02", 1]], to: "2026-10-02" }; } });
  assert.equal((await flaky.getPriceSeries("ABC")).state, "UNAVAILABLE");
  assert.equal((await flaky.getPriceSeries("ABC")).state, "AVAILABLE");
});

test("Red Team · ein Ticker bildet keinen Pfad (kein Ausbruch aus dem Datenverzeichnis)", async () => {
  const gesehen = [];
  const spion = Client.create({ load: async (p) => { gesehen.push(p); throw new Error("x"); } });
  for (const t of ["A/../../x", "A/B", "A..B"]) {
    assert.equal((await spion.getFundamentals(t)).reason, "INVALID_TICKER", t);
    assert.equal((await spion.stockPage(t)).ok, false, t);
  }
  assert.ok(gesehen.every((p) => !p.includes("..")), gesehen.join(","));
});
