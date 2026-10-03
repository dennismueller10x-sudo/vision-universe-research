/* =========================================================================
   LISTING-KONTINUITAET - ein Kuerzel ist keine Identitaet, auch nicht in
   der Kursreihe (03.10.2026).

   Gemessen: DINE trug 2010-05-11..2011-01-03 (um 12) und ab 2026-05-05
   (um 25) in einer veroeffentlichten Reihe, 15 Jahre ohne Kerze dazwischen;
   127 Reihen hatten eine Luecke ueber einem Jahr in ihren letzten 270
   Kerzen. Regel: nach mehr als 365 Kalendertagen ohne Kerze beginnt ein
   neues Listing; nur das juengste zaehlt. Kuerzere Luecken
   (Handelsaussetzungen) bleiben.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { guardPayload } from "../../scripts/market/guard-listing-continuity.mjs";
import { compactSeries } from "../../scripts/market/publish-discover-series.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require(join(ROOT, "quant/engines/survivorship-control.js"));
const day = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const reihe = (start, n, close) => Array.from({ length: n }, (_, i) => ({ date: day(start, i), close, adjustedClose: close, splitFactor: 1 }));

test("LC1 · nach mehr als einem Jahr ohne Kerze beginnt ein neues Listing", () => {
  const bars = [...reihe("2010-05-11", 40, 12), ...reihe("2026-05-05", 50, 25)];
  const seg = SC.currentListingSegment(bars);
  assert.equal(seg.bars.length, 50);
  assert.equal(seg.bars[0].date, "2026-05-05");
  assert.equal(seg.cut.droppedBars, 40);
  assert.equal(seg.cut.droppedTo, "2010-06-19");
  assert.ok(seg.cut.gapDays > 365);
});

test("LC2 · GEGENPROBE: Handelsaussetzungen bis zu einem Jahr bleiben, eine durchgehende Reihe bleibt unveraendert", () => {
  const halt = [...reihe("2024-01-02", 30, 10), ...reihe(day("2024-01-31", 365), 30, 9)];
  assert.equal(SC.currentListingSegment(halt).cut, null, "genau 365 Tage sind noch kein neues Listing");
  const durchgehend = reihe("2020-01-01", 500, 50);
  const seg = SC.currentListingSegment(durchgehend);
  assert.equal(seg.cut, null);
  assert.equal(seg.bars, durchgehend);
  assert.equal(SC.currentListingSegment([]).cut, null);
});

test("LC3 · die Arbeitsablage wird gekuerzt und der Schnitt vermerkt; ohne Luecke bleibt sie unberuehrt", () => {
  const p = { securityId: "ref_X", bars: [...reihe("2010-05-11", 40, 12), ...reihe("2026-05-05", 50, 25)], barCount: 90 };
  const next = guardPayload(p, "2026-10-03T00:00:00Z");
  assert.equal(next.bars.length, 50);
  assert.equal(next.barCount, 50);
  assert.equal(next.first, "2026-05-05");
  assert.equal(next.listingContinuity.droppedBars, 40);
  assert.equal(next.listingContinuity.engine, SC.VERSION);
  assert.equal(guardPayload({ bars: reihe("2020-01-01", 300, 5) }, "x"), null);
});

test("LC4 · die kompakte Discover-Reihe zeigt nur das juengste Listing", () => {
  const bars = [...reihe("2010-05-11", 200, 12), ...reihe("2026-05-05", 100, 25)];
  const c = compactSeries({ bars, provider: "tiingo" }, { securityId: "ref_X", ticker: "X" }, {});
  assert.equal(c.from, "2026-05-05");
  assert.equal(c.points.length, 100);
  assert.ok(c.points.every((p) => p[1] === 25), "ein Punkt der frueheren Firma ist im Chart");
});

test("LC5 · die veroeffentlichten Reihen ueberbruecken keine Luecke von mehr als einem Jahr", () => {
  for (const sub of ["discover-series", "discover-series-long"]) {
    const dir = join(ROOT, "quant/data/market", sub);
    if (!existsSync(dir)) continue;
    const schlecht = [];
    let geprueft = 0;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "index.json")) {
      const pts = JSON.parse(readFileSync(join(dir, f), "utf8")).points;
      if (!Array.isArray(pts) || pts.length < 2) continue;
      geprueft++;
      for (let i = 1; i < pts.length; i++) {
        if ((Date.parse(pts[i][0]) - Date.parse(pts[i - 1][0])) / 864e5 > SC.LISTING_GAP_DAYS) { schlecht.push(f); break; }
      }
    }
    assert.ok(geprueft > 1000, sub + ": zu wenige Reihen geprueft");
    assert.deepEqual(schlecht.slice(0, 10), [], sub + ": " + schlecht.length + " Reihen ueberbruecken mehr als ein Jahr");
  }
});

test("LC6 · der Marktdaten-Lauf kuerzt nach der Reparatur und vor allen Ableitungen; der Push ersetzt gekuerzte Reihen", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/market-data-refresh.yml"), "utf8");
  const g = wf.indexOf("guard-listing-continuity.mjs"), r = wf.indexOf("repair-total-return-history.mjs"),
    f = wf.indexOf("build-market-factors.mjs"), d = wf.indexOf("build-discover-data.mjs"), push = wf.indexOf("sync-history-store.mjs --push");
  assert.ok(g > 0 && r > 0 && r < g && g < f && g < d && g < push, "Reihenfolge Reparatur < Schnitt < Ableitungen/Push");
  const sync = readFileSync(join(ROOT, "scripts/market/sync-history-store.mjs"), "utf8");
  assert.match(sync, /payload\.listingContinuity[\s\S]{0,400}currentListingSegment[\s\S]{0,400}putSeries/);
});
