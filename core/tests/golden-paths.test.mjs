/* Core · Golden Paths ueber den echten Repository-Stand.

   Stock:       Security -> Kurs -> Chart -> Fundamentals -> Quant -> News
   Discover:    Universum -> Ranking (Startseite) -> Karte -> Aktienseite -> Chart
   Supertrader: Kursreihe -> Strategie -> Signal -> Ausgabe -> Chartpfad
   Alle Produkte muessen dieselbe Identitaet und denselben Kurs zeigen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Client = require(join(ROOT, "core", "client.js"));
const Identity = require(join(ROOT, "core", "identity.js"));
const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel.replace(/^\//, "")), "utf8"));
const repo = async (p) => { const f = join(ROOT, p.replace(/^\//, "")); if (!existsSync(f)) throw new Error("fehlt: " + p); return json(p); };
const c = Client.create({ load: repo });

test("Discover · jede Karte der Startseite fuehrt zu einer Aktienseite mit demselben Kurs und einer Reihe", async () => {
  const home = json("discover/data/home/US_REAL.json");
  const karten = [];
  for (const s of home.surfaces || []) for (const k of s.cards || []) karten.push(k);
  assert.ok(karten.length >= 5, "Startseite ohne Karten");
  const fehler = [];
  for (const k of karten) {
    const page = await c.stockPage(k.symbol);
    if (!page.ok) { fehler.push(k.symbol + ": Aktienseite fehlt"); continue; }
    const px = await c.getLatestPrice(k.symbol);
    if (px.state !== "AVAILABLE") { fehler.push(k.symbol + ": keine Reihe"); continue; }
    if (k.price && typeof k.price.value === "number" && k.price.value !== px.data.close) fehler.push(k.symbol + ": Karte " + k.price.value + " / Reihe " + px.data.close);
    if (page.data.price.value !== px.data.close) fehler.push(k.symbol + ": Seite " + page.data.price.value + " / Reihe " + px.data.close);
    if (k.priceSeries && k.priceSeries.path && !existsSync(join(ROOT, k.priceSeries.path.slice(1)))) fehler.push(k.symbol + ": Chartpfad " + k.priceSeries.path);
  }
  assert.deepEqual(fehler, []);
});

test("Discover · Rangfolge-Universum und Aktienindex stammen aus demselben Stand", () => {
  const meta = json("discover/data/meta.json"), home = json("discover/data/home/US_REAL.json");
  const u = meta.universes.find((x) => x.universeId === "US_REAL");
  assert.equal(home.asOf, u.asOf, "Startseite und Universum aus verschiedenen Laeufen");
  assert.equal(json("discover/data/stock-index/US_REAL.json").count, u.securities);
});

/* Stock-Pfad (Mega-Mission §20) fuer jeden Titel der Discover-Startseite:
   jede Stufe liefert ueber den Core-Vertrag, mit derselben Identitaet und
   demselben Kurs. "Nicht verfuegbar" ist nur mit strukturellem Grund
   zulaessig (kein CIK = keine SEC-Fundamentals), nie als stilles Loch. */
test("Stock · Security -> Kurs -> Chart -> Fundamentals -> Quant fuer jeden Startseitentitel", async () => {
  const home = json("discover/data/home/US_REAL.json");
  const titel = [...new Set((home.surfaces || []).flatMap((s) => (s.cards || []).map((k) => k.symbol)))];
  assert.ok(titel.length >= 5, "Startseite ohne Titel");
  const fehler = [];
  for (const t of titel) {
    const sec = await c.getSecurity(t);
    if (sec.state !== "AVAILABLE") { fehler.push(t + ": Security " + sec.reason); continue; }
    if (sec.data.ambiguous) fehler.push(t + ": Identitaet mehrdeutig");
    const px = await c.getLatestPrice(t), reihe = await c.getPriceSeries(t);
    if (px.state !== "AVAILABLE" || reihe.state !== "AVAILABLE") { fehler.push(t + ": Kurs/Reihe " + (px.reason || reihe.reason)); continue; }
    if (px.data.securityId !== sec.data.securityId) fehler.push(t + ": Kurs gehoert zu " + px.data.securityId);
    const p = reihe.data.points, letzter = p[p.length - 1];
    if (p.length < 20) fehler.push(t + ": Chart mit " + p.length + " Punkten");
    if (p.some((x, i) => i && x[0] <= p[i - 1][0])) fehler.push(t + ": Chartpunkte nicht aufsteigend");
    // Was die Aktienseite als Kurs zeigt, muss das Chartende sein (nicht
    // Reihe gegen sich selbst: getLatestPrice liest dieselbe Reihe).
    const seite = await c.stockPage(t);
    if (!seite.ok) fehler.push(t + ": Aktienseite fehlt");
    else if (seite.data.price.value !== letzter[1]) fehler.push(t + ": Seite " + seite.data.price.value + " / Chartende " + letzter[1]);
    const fu = await c.getFundamentals(t);
    if (fu.state !== "AVAILABLE" && fu.reason !== "NO_CIK") fehler.push(t + ": Fundamentals " + fu.reason);
    const q = await c.getQuantData(t);
    if (q.state !== "AVAILABLE") fehler.push(t + ": Quant " + q.reason);
    else if (!q.data.identityConsistent) fehler.push(t + ": Quant-Zeile gehoert zu " + q.data.securityId);
  }
  assert.deepEqual(fehler, []);
});

/* News: Frische ist eine Owner-Entscheidung (kein Zeitplan). Der Pfad
   verlangt daher nicht "frisch", sondern dass Veraltung erkennbar ist und
   die Seite sie sagt. Editorial mentions are not themselves canonical equity IDs. */
test("Stock · News: Stand und Veraltung erkennbar, ungelöste Feed-Mentions werden nicht als Security erfunden", async () => {
  const n = await c.getNews();
  assert.equal(n.state, "AVAILABLE", "News-Quelle fehlt");
  assert.ok(Number.isFinite(Date.parse(n.data.updatedAt)), "News ohne Aktualisierungszeit");
  assert.ok(n.data.maxAgeHours > 0, "News ohne zulaessiges Alter");
  const seite = readFileSync(join(ROOT, "news", "news.js"), "utf8");
  assert.match(seite, /news-stale/, "News-Seite zeigt Veraltung nicht an");
  const offen = [];
  for (const sym of new Set(n.data.items.map((i) => i.symbol).filter(Boolean))) {
    const s = await c.getSecurity(sym);
    if (s.state !== "AVAILABLE") {
      assert.equal(s.state, "UNAVAILABLE", sym);
      assert.ok(["INVALID_TICKER", "NOT_IN_COMPANY_MASTER", "SOURCE_MISSING"].includes(s.reason), sym + ": " + s.reason);
      assert.equal(s.data, null, "unresolved mention must not fabricate identity");
      offen.push(sym + ": " + s.reason);
    } else assert.equal(s.data.ticker, Identity.normalizeTicker(sym));
  }
  // Editorial mentions include composite strings and ETFs outside the company master.
  // Their unresolved state is reported; they are not an equity identity assertion.
  if (offen.length) console.log("Unresolved current News mentions: " + offen.join("; "));
});

test("Stock · News: controlled equity mentions resolve through the real company master", async () => {
  const symbols = ["AAPL", "JPM", "MSFT", "NVDA"];
  const fixture = Client.create({ load: async (path) => path === "/dashboard/data/news_feed.json"
    ? { updated_at: "2026-09-29T12:00:00Z", freshness_hours: 24, items: symbols.map((symbol) => ({symbol})) }
    : repo(path) });
  const n = await fixture.getNews();
  assert.equal(n.state, "AVAILABLE");
  assert.deepEqual(n.data.items.map((i) => i.symbol), symbols);
  for (const symbol of symbols) {
    const security = await fixture.getSecurity(symbol);
    assert.equal(security.state, "AVAILABLE", symbol);
    assert.equal(security.data.securityId, Identity.securityIdForTicker(symbol));
  }
});
