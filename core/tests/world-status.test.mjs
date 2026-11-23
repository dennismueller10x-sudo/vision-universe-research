/* Welten je Aktie (core/world-status.js, scripts/core/build-world-status.mjs, Datenart worldStatus).
   WS-1 Regeln je Welt, WS-2 gleiche Regeln wie die Aktienseite (kein zweiter Massstab), WS-3 Artefakt aus Quellen,
   WS-4 Ausfall einer Quelle, WS-5 beschreibende Sprache, WS-6 Register und Release-Bau. Liest keine Produktionsdaten. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WS = require(join(ROOT, "core/world-status.js"));
const Sheet = require(join(ROOT, "assets/vu-stock-sheet.js"));
const Identity = require(join(ROOT, "core/identity.js"));
const M = Sheet.model;
const B = await import(join(ROOT, "scripts/core/build-world-status.mjs"));

const health = (g, p) => ({ fundamentals: { health: { available: true, categories: [{ id: "growth", grade: g }, { id: "profitability", grade: p }] } } });

test("WS-1 · Quant: bestes Fuenftel stark, schwaechstes schwach, Raender eindeutig", () => {
  assert.equal(WS.QUANT_FIFTH, 0.2);
  /* of = 100: Plaetze 1..20 stark, 81..100 schwach */
  assert.equal(WS.quantState(1, 100), "strong");
  assert.equal(WS.quantState(20, 100), "strong");
  assert.equal(WS.quantState(21, 100), "mid");
  assert.equal(WS.quantState(80, 100), "mid");
  assert.equal(WS.quantState(81, 100), "weak");
  assert.equal(WS.quantState(100, 100), "weak");
  /* of = 3573 (Stand 20.11.2026): Fuenftel = 715 Plaetze */
  assert.equal(WS.quantState(715, 3573), "strong");
  assert.equal(WS.quantState(716, 3573), "mid");
  assert.equal(WS.quantState(2858, 3573), "mid");
  assert.equal(WS.quantState(2859, 3573), "weak");
  /* gleich viele Plaetze oben wie unten, bei jeder Groesse */
  for (const of of [5, 7, 99, 100, 3573, 4870]) {
    let s = 0, w = 0; for (let p = 1; p <= of; p++) { const q = WS.quantState(p, of); if (q === "strong") s++; else if (q === "weak") w++; }
    assert.equal(s, w, "of " + of); assert.equal(s, Math.ceil(0.2 * of));
  }
  for (const bad of [[0, 100], [101, 100], [null, 100], [5, null], [1, 4], [NaN, 100]]) assert.equal(WS.quantState(bad[0], bad[1]), null, String(bad));
});

test("WS-1 · Supertrader: hoechste Stufe ueber alle Methoden, nie schwach", () => {
  const order = M.ST_STAGES;
  assert.deepEqual(order, ["CHART_CANDIDATE", "CONFIRMED_RESEARCH_SETUP", "MODELED_TRADE_PLAN"]);
  assert.equal(WS.supertraderState(["CHART_CANDIDATE"], order), "mid");
  assert.equal(WS.supertraderState(["CHART_CANDIDATE", "CONFIRMED_RESEARCH_SETUP"], order), "strong");
  assert.equal(WS.supertraderState(["MODELED_TRADE_PLAN"], order), "strong");
  assert.equal(WS.supertraderState([], order), null);
  assert.equal(WS.supertraderState(null, order), null);
  assert.equal(WS.supertraderState(["UNBEKANNT"], order), null);
});

test("WS-2 · Fundamental, Technical, Hedgefonds: dieselbe Regel wie die Aktienseite, nicht abgeschrieben", () => {
  const src = readFileSync(join(ROOT, "core/world-status.js"), "utf8");
  assert.match(src, /model\.businessVerdict\(/); assert.match(src, /model\.techVerdict\(/); assert.match(src, /model\.balance\(/);
  assert.doesNotMatch(src, /0\.6|0\.4|Sehr stark|aboveSma/, "keine eigenen Schwellen oder Stufenwoerter");
  const cases = [
    { detail: health("Sehr stark", "Stark"), tech: { trend: [true, true] }, hedge: { buyers: 6, sellers: 4 } },
    { detail: health("Sehr stark", "Negativ"), tech: { trend: [false, true] }, hedge: { buyers: 5, sellers: 5 } },
    { detail: health("Solide", "Solide"), tech: { trend: [false, false] }, hedge: { buyers: 2, sellers: 3 } },
    { detail: health("Flach", "Knapp"), tech: { trend: [true, true], frozenSince: "2026-11-01" }, hedge: { buyers: 0, sellers: 0 } },
    { detail: { fundamentals: { health: { available: false } } }, tech: { trend: [null, true] }, hedge: null }
  ];
  for (const c of cases) {
    const s = WS.statusOf(c, M), b = M.businessVerdict(c.detail), t = M.techVerdict(c.tech), h = c.hedge ? M.balance(c.hedge.buyers, c.hedge.sellers) : null;
    const st = (v) => (["strong", "mid", "weak"].includes(v) ? v : null);
    assert.equal(s.fundamental, b ? st(b.kind) : null);
    assert.equal(s.technical, t ? st(t[1]) : null);
    assert.equal(s.hedgefonds, h ? st(h[1]) : null);
  }
  /* feste Erwartung an drei Stellen, damit ein Regelwechsel der Aktienseite hier sichtbar wird */
  assert.deepEqual(WS.statusOf(cases[0], M), { fundamental: "strong", quant: null, technical: "strong", hedgefonds: "strong", supertrader: null });
  assert.equal(WS.statusOf(cases[1], M).fundamental, "weak", "es zaehlt die schwaechere Stufe");
  assert.equal(WS.statusOf(cases[3], M).technical, null, "eingefrorene Reihe: keine Aussage");
});

test("WS-1 · Zaehlung und Kurzform: verlustfrei, keine Aussage ist kein schwach", () => {
  const s = { fundamental: "strong", quant: "weak", technical: null, hedgefonds: "mid", supertrader: "strong" };
  assert.deepEqual(WS.count(s), { stated: 4, strong: 2, weak: 1 });
  assert.equal(WS.encode(s), "sw-ms");
  assert.deepEqual(WS.decode("sw-ms"), s);
  assert.deepEqual(WS.decode("?"), { fundamental: null, quant: null, technical: null, hedgefonds: null, supertrader: null });
  assert.deepEqual(WS.count(WS.statusOf({}, M)), { stated: 0, strong: 0, weak: 0 });
  assert.deepEqual(WS.WORLDS, ["fundamental", "quant", "technical", "hedgefonds", "supertrader"]);
});

/* kleiner Dateibaum mit drei Aktien in einem temporaeren Verzeichnis (Pfade mit fuehrendem Schraegstrich: kein Zugriff auf Produktionsdaten) */
function tree() {
  const root = mkdtempSync(join(tmpdir(), "vu-world-status-"));
  const put = (p, v) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), typeof v === "string" || Buffer.isBuffer(v) ? v : JSON.stringify(v)); };
  put("/discover/data/stocks/US_REAL/AAA.json", health("Sehr stark", "Sehr stark"));
  put("/discover/data/stocks/US_REAL/BBB.json", health("Rückläufig", "Solide"));
  put("/discover/data/stocks/US_REAL/CCC.json", { symbol: "CCC" });
  put("/quant/data/product/factor-evidence-v1/profile-mean/ranking.json.gz", gzipSync(JSON.stringify({ asOf: "2026-11-20", methodologyVersion: "vu-profile-mean-1.0.0", total: 10, fields: ["mean", "count", "place"], rows: { AAA: [80, 6, 1], BBB: [20, 6, 10] } })));
  for (const [t, rec] of [["AAA", { s: "AAA", trend: [true, true, true, true], frozenSince: null }], ["BBB", { s: "BBB", trend: [false, false, false, false], frozenSince: null }]]) {
    const k = Identity.shardKey(t), p = join(root, "/technical/data/stock", k + ".json");
    let sh = { stocks: {} }; try { sh = JSON.parse(readFileSync(p, "utf8")); } catch (e) { /* neu */ }
    sh.stocks[t] = rec; put("/technical/data/stock/" + k + ".json", sh);
  }
  put("/technical/data/meta.json", { asOf: "2026-11-20" });
  put("/hedgefonds/data/stocks/0.json", { c1: { ticker: "AAA", buyers: 4, sellersCount: 1 }, c2: { ticker: "AAA", buyers: 2, sellersCount: 1 }, c3: { ticker: null, buyers: 9, sellersCount: 0 } });
  put("/hedgefonds/data/stocks/1.json", { c4: { ticker: "BBB", buyers: 1, sellersCount: 4 } });
  put("/hedgefonds/data/stocks/index.json", { rows: [] });
  put("/hedgefonds/data/hedgefonds.json", { latestPeriod: "2026-09-30" });
  put("/supertrader/data/sf-candidates/index.json", { asOf: "2026-11-20", candidates: [{ c: "C01", t: "AAA", s: "CHART_CANDIDATE" }, { c: "C06", t: "AAA", s: "CONFIRMED_RESEARCH_SETUP" }] });
  return root;
}

test("WS-3 · Artefakt: je Aktie eine Zeile aus den Quellen, mehrere Wertpapiere eines Kuerzels zusammengezaehlt", () => {
  const root = tree();
  try {
    const r = B.run({ root, now: new Date("2026-11-23T06:00:00Z") });
    assert.equal(r.schema, B.SCHEMA); assert.equal(r.rules, WS.VERSION);
    assert.deepEqual(r.cols.s, ["AAA", "BBB", "CCC"]);
    assert.deepEqual(r.cols.sid, ["AAA", "BBB", "CCC"].map((t) => Identity.securityIdForTicker(t)));
    /* AAA: alles stark (Fonds 6 Kaeufer zu 2 Verkaeufern ueber zwei Wertpapiere); BBB: alles schwach, Supertrader fuehrt sie nicht; CCC: nichts */
    assert.deepEqual(r.cols.w, ["sssss", "wwww-", "-----"]);
    assert.deepEqual(r.cols.strong, [5, 0, 0]); assert.deepEqual(r.cols.weak, [0, 4, 0]); assert.deepEqual(r.cols.stated, [5, 4, 0]);
    assert.deepEqual(r.counts.byStrong, { 5: 1, 0: 2 });
    assert.deepEqual(r.counts.byWorld.supertrader, { strong: 1, mid: 0, weak: 0, none: 2 });
    assert.equal(r.counts.total, 3);
    assert.deepEqual(r.sources.quant, { state: "AVAILABLE", asOf: "2026-11-20" });
    assert.equal(r.sources.hedgefonds.asOf, "2026-09-30");
    assert.equal(r.generatedAt, "2026-11-23T06:00:00.000Z");
    assert.deepEqual(r.worlds, WS.WORLDS);
    /* gleicher Lauf, gleiches Ergebnis */
    assert.deepEqual(B.run({ root, now: new Date("2026-11-23T06:00:00Z") }), r);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("WS-4 · Faellt eine Quelle aus, sagt diese Welt nichts; die anderen bleiben", () => {
  const root = tree();
  try {
    rmSync(join(root, "/quant/data"), { recursive: true }); rmSync(join(root, "/supertrader"), { recursive: true }); rmSync(join(root, "/hedgefonds"), { recursive: true });
    const r = B.run({ root });
    assert.deepEqual(r.cols.w, ["s-s--", "w-w--", "-----"]);
    assert.equal(r.sources.quant.state, "UNAVAILABLE"); assert.equal(r.sources.supertrader.state, "UNAVAILABLE"); assert.equal(r.sources.hedgefonds.state, "UNAVAILABLE");
    assert.equal(r.sources.technical.state, "AVAILABLE");
    /* ganz ohne Aktienkreis: leeres, gueltiges Artefakt */
    rmSync(join(root, "/discover"), { recursive: true });
    assert.equal(B.run({ root }).counts.total, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("WS-5 · Sprache: beschreibend, keine Empfehlung, kein Gesamturteil", () => {
  const notices = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
  const text = Object.values(WS.RULES).join(" ") + " " + B.build([], {}).encoding;
  assert.doesNotMatch(text, /kaufen\b|verkaufen|empfehl|Signal|Chance|Kursziel|unterbewertet|schlägt den Markt/i);
  assert.match(B.build([], {}).claim, /kein Gesamturteil, keine Gewichtung, keine Empfehlung/);
  assert.ok(notices && typeof notices === "object");
  assert.deepEqual(Object.keys(WS.RULES), WS.WORLDS);
});

test("WS-6 · Register und Release-Bau: Datenart nur in der Auslieferung, Fehler haelt sie nicht an", () => {
  const doms = JSON.parse(readFileSync(join(ROOT, "core/registry/domains.json"), "utf8")).domains;
  const d = doms.find((x) => x.id === B.DOMAIN_ID);
  assert.ok(d, "Datenart worldStatus");
  assert.equal(d.artifact, "/" + B.ARTIFACT); assert.equal(d.releaseOnly, true);
  assert.match(d.producer, /scripts\/core\/build-world-status\.mjs/);
  const rel = readFileSync(join(ROOT, "scripts/vu2/build-release.mjs"), "utf8");
  assert.match(rel, /build-world-status\.mjs/); assert.match(rel, /WORLD_STATUS_SKIPPED/);
  /* noch keine Seite liest die Datei: die Oberflaeche ist in diesem Schritt unveraendert */
  assert.deepEqual(d.consumers, []);
});
