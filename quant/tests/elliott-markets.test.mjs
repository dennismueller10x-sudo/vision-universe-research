// Elliott-Neustart Schritt 2 (Owner 22.11.2026): Leitmaerkte aus den Multi-Asset-Reihen.
// Prueft die Wochenbildung, die eine Marktliste (Build = Client), die Klarheit A–D (Startseite = Aktienbild) und die Startseiten-Zeilen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKETS, MARKET_IDS, weeklyPoints } from "../../scripts/technical/lib/ti-markets.mjs";
import { gradeOf, marketsOf } from "../../scripts/technical/elliott-home/home.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("EM-1 · Wochenschluss: letzte Beobachtung Mo–Fr je ISO-Woche, Wochenenden zählen nicht", () => {
  const pts = [["2026-11-02", 10], ["2026-11-06", 11], ["2026-11-07", 99], ["2026-11-08", 98], ["2026-11-09", 12], ["2026-11-13", 13], ["2026-11-14", 0], ["2026-11-16", -1], ["2026-11-17", 14]];
  assert.deepEqual(weeklyPoints(pts), [["2026-11-06", 11], ["2026-11-13", 13], ["2026-11-17", 14]]);
  assert.deepEqual(weeklyPoints([["2026-11-07", 5]]), [], "nur Wochenende: keine Woche");
});

test("EM-2 · eine Marktliste: Build und Client nennen dieselben Kürzel in derselben Reihenfolge", () => {
  const js = read("quant/api/technical-intelligence-workspace.js");
  const m = /var MARKETS = (\[[^\]]+\]);/.exec(js);
  assert.ok(m, "MARKETS im Client");
  assert.deepEqual(JSON.parse(m[1]), MARKETS.map((x) => x.id));
  assert.equal(MARKET_IDS.size, MARKETS.length, "Kürzel eindeutig");
  assert.ok(!MARKET_IDS.has("WTI"), "WTI ist eine Aktie (W&T Offshore): Öl heißt USOIL");
  for (const x of MARKETS) assert.match(x.id, /^[A-Z0-9]{2,8}$/, x.id);
});

test("EM-3 · Klarheit A–D: Startseite und Aktienbild verwenden dieselbe Regel", () => {
  assert.equal(gradeOf("HIGH", "HIGH"), "A");
  assert.equal(gradeOf("HIGH", "LOW"), "B");
  assert.equal(gradeOf("MODERATE", "HIGH"), "B");
  assert.equal(gradeOf("MODERATE", "MODERATE"), "C");
  assert.equal(gradeOf("LOW", "HIGH"), "D");
  assert.equal(gradeOf(null, null), "D");
  const cb = read("quant/app/page-chartbild.js");
  assert.match(cb, /return lv === "HIGH" && cl === "HIGH" \? "A" : lv === "HIGH" \|\| \(lv === "MODERATE" && cl === "HIGH"\) \? "B" : lv === "MODERATE" \? "C" : "D";/, "gleiche Stufen im Aktienbild");
});

test("EM-4 · Startseiten-Zeilen: zurückgehaltene und Märkte ohne Lesart fehlen, Reihenfolge bleibt", () => {
  const doc = { version: "elliott-markets-1.0.0", rows: [
    { t: "SPY", n: "S&P 500", group: "index", close: 689.81, elliott: "FLAT:C", structure: "UPTREND_ADVANCING", direction: "BULLISH", invalidation: 634, elliottApplicable: "LOW", elliottClarity: "HIGH" },
    { t: "BTCUSD", n: "Bitcoin", withheld: 1, elliott: null },
    { t: "XAUUSD", n: "Gold", close: 3526.34, elliott: null },
    { t: "USOIL", n: "Öl WTI", close: 89.53, elliott: "WXY:done", direction: "BEARISH", invalidation: 109, elliottApplicable: "MODERATE", elliottClarity: "MODERATE", fr: { st: "DELAYED" } }] };
  const m = marketsOf(doc);
  assert.deepEqual(m.rows.map((r) => r.t), ["SPY", "USOIL"]);
  assert.equal(m.rows[0].grade, "D");
  assert.equal(m.rows[1].grade, "C");
  assert.equal(m.rows[1].fr, "DELAYED");
  assert.equal(marketsOf(null), null);
});

test("EM-6 · Build schreibt Märkte nur in v3/markets, nicht in die Aktien-Shards; CI spielt die Reihen ein", () => {
  const b = read("scripts/technical/build-technical-intelligence.mjs");
  assert.match(b, /gz\(join\(out, "markets", m\.id \+ "\.json\.gz"\)/);
  assert.match(b, /writeFileSync\(join\(out, "markets", "index\.json"\)/);
  const wf = read(".github/workflows/pipeline-daily.yml");
  const i = wf.indexOf("seed-data-branch.sh marketPulse"), j = wf.indexOf("scripts/technical/build-technical-intelligence.mjs --workers");
  assert.ok(i > 0 && j > i, "Datenzweig vor dem Build");
});
