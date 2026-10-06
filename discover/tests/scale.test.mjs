/* Skalierungs- und Live-Vertrag (§21 des Auftrags FULL MARKET UNIVERSE &
   LIVE INTRADAY CHARTS). Keine 498, kein GATE_500 als Produktgrenze; die
   Universumsquelle ist kanonisch und benannt; Kursreihen kommen aus dem
   kanonischen Store; Intraday nur aus validen Snapshots im Umfang. Alles
   ueber die AUSGELIEFERTEN Daten. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");
const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
const vorhanden = existsSync(join(DATA, "meta.json"));
const meta = vorhanden ? readJSON(join(DATA, "meta.json")) : null;
const Snap = require("../../quant/engines/realtime/intraday-snapshot.js");
const { resolveProductUniverse } = await import("../../scripts/market/universe-source.mjs");
const { resolveScope } = await import("../../scripts/market/preview-scope.mjs");

function homeSurfaces(universeId) {
  const files = readdirSync(join(DATA, "home")).filter((n) => n.startsWith(universeId) && n.endsWith(".json"))
    .sort((a, b) => (a.length - b.length) || (a < b ? -1 : 1));
  return files.flatMap((f) => readJSON(join(DATA, "home", f)).surfaces || []);
}

test("SC1 · keine MVP-Grenze im Build: kein GATE_500 und keine 498 als Konstante", () => {
  const code = readFileSync(join(root, "scripts", "discover", "build-discover-data.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/factors-GATE_500\.json/.test(code), "Faktordatei fest verdrahtet");
  assert.ok(!/universe-GATE_500\.json/.test(code), "Universum fest verdrahtet");
  assert.ok(!/\b498\b/.test(code));
  const ingest = readFileSync(join(root, "scripts", "market", "ingest-intraday.mjs"), "utf8");
  assert.ok(!/\b(498|500)\b/.test(ingest.replace(/\/\*[\s\S]*?\*\//g, "")), "Intraday-Ingest mit fester Titelzahl");
});

test("SC2 · die Universumsquelle ist kanonisch und im Meta benannt - mit Uebergabepunkt", { skip: !vorhanden }, () => {
  const u = meta.universes.find((x) => x.universeId === "US_REAL");
  assert.ok(u.universeSource && u.universeSource.file, "Universumsquelle fehlt");
  const quelle = resolveProductUniverse(root);
  assert.equal(u.universeSource.file, quelle.file);
  assert.equal(u.universeSource.counts.productUniverse, quelle.counts.productUniverse);
  assert.ok(["INTEGRATED", "PENDING"].includes(u.universeSource.handover.status));
  if (u.universeSource.handover.status === "PENDING") {
    assert.match(u.universeSource.handover.message, /Market-Data-Layer ist fuer \d+ Titel bereit/);
    assert.match(u.universeSource.handover.message, /wartet auf/);
  }
  assert.ok(u.factorCoverage && typeof u.factorCoverage.partial === "boolean");
  assert.ok(u.securities <= quelle.securities.length, "mehr Titel als das Universum");
});

test("SC3 · Live-Umfang: nur Titel des Universums, jede Karte der Startseite darin", { skip: !vorhanden }, () => {
  const ls = readJSON(join(DATA, "live-scope", "US_REAL.json"));
  const tickers = new Set(resolveProductUniverse(root).securities.map((s) => s.ticker));
  assert.ok(ls.symbols.length > 50 && ls.symbols.length < tickers.size, "Live-Umfang ist weder leer noch das ganze Universum");
  assert.ok(ls.symbols.every((s) => tickers.has(s)));
  for (const c of homeSurfaces("US_REAL").flatMap((s) => s.cards || [])) assert.ok(ls.symbols.includes(c.symbol), c.symbol + " nicht im Live-Umfang");
});

test("SC4 · reale Kursreihen kommen aus dem kanonischen Store, nicht als Kopie", { skip: !vorhanden }, () => {
  const karten = homeSurfaces("US_REAL").flatMap((s) => s.cards || []).filter((c) => c.priceSeries && c.priceSeries.status === "CALCULATED");
  for (const c of karten) {
    /* Die Eingangsflaeche traegt ihre Punkte inline (kein Nachladen ueber
       der Falz); jede andere Karte verweist auf die kanonische Reihe. */
    if (Array.isArray(c.priceSeries.points)) { assert.ok(c.priceSeries.points.length >= 5, c.symbol); continue; }
    assert.match(c.priceSeries.path, /^\/quant\/data\/market\/discover-series\/ref_.+\.json$/, c.symbol);
    const reihe = readJSON(join(root, c.priceSeries.path.slice(1)));
    assert.equal(reihe.status, "CALCULATED"); assert.ok(reihe.source && reihe.asOf);
    assert.equal(reihe.asOf, c.priceSeries.asOf);
  }
  assert.ok(!existsSync(join(DATA, "series", "US_REAL")) || readdirSync(join(DATA, "series", "US_REAL")).length === 0,
    "Series-Store haelt keine Kopien realer Reihen");
});

test("SC5 · Realtime-Meta: Gate UND Grundlage, Snapshot-Modus ehrlich benannt", { skip: !vorhanden }, () => {
  const r = meta.realtime;
  if (r.available) {
    assert.equal(r.mode, "snapshot");
    assert.ok(r.basis && r.checkedAt, "Freigabe ohne Grundlage");
    assert.equal(r.intraday.isLiveStream, false);
    assert.equal(r.intraday.isDelayed, true);
    assert.match(r.intraday.index, /intraday\/index\.json$/);
    assert.ok(r.intraday.refreshMinutes >= 5);
  } else {
    assert.equal(r.mode, "eod");
  }
});

test("SC6 · Intraday-Snapshots (falls vorhanden): valide, im Umfang, Sitzung = Verzeichnis, keine Punkte ausserhalb der Sitzung", () => {
  const dir = join(root, "quant", "data", "market", "intraday");
  if (!existsSync(dir)) return;
  const scope = resolveScope(root).tickers;
  let n = 0;
  for (const date of readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    for (const f of readdirSync(join(dir, date)).filter((x) => x.endsWith(".json"))) {
      const s = readJSON(join(dir, date, f));
      const v = Snap.validate(s);
      assert.ok(v.ok, date + "/" + f + ": " + v.findings.join(", "));
      assert.equal(s.sessionDate, date);
      assert.ok(scope.has(s.symbol), s.symbol + " ausserhalb des Umfangs");
      assert.equal(s.isLive, false, "ein Snapshot ist kein Strom");
      n++;
    }
  }
  const idx = readJSON(join(dir, "index.json"));
  assert.ok(idx.entryCount <= n);
  for (const [sym, e] of Object.entries(idx.entries)) assert.ok(existsSync(join(root, e.path.slice(1))), sym + " Verweis ohne Datei");
});

test("SC7 · der Client haelt keine Titelzahl: Hub, Karten, Aktienseite ohne 498/500", () => {
  for (const f of ["live-hub.js", "cards.js", "detail.js", "microchart.js", "../app.js"]) {
    const code = readFileSync(join(root, "discover", "ui", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\b(498|500|5684|7004)\b/.test(code), f + " traegt eine Titelzahl");
  }
});
