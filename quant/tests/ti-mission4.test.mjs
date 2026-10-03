/* Mission IV — dauerhafte Regressionstests fuer Fehler, die in Mission III/IV gefunden wurden (§88–§91). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const Ctx = require(join(ROOT, "quant/engines/technical/ti/context.js"));
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const Alerts = require(join(ROOT, "quant/engines/technical/ti/alerts.js"));
const { weeklySeriesFromPoints, dailySeriesFromPayload } = await import(join(ROOT, "scripts/technical/lib/ti-data.mjs"));
const { corpusCase } = await import(join(ROOT, "quant/tests/elliott-corpus.mjs"));

/* §88 Wochenend-Luecken: Tagesreihen enthielten sich in 3.2.0 faelschlich ("Luecken in der Kurshistorie"), weil jedes Wochenende
   als Luecke zaehlte. Werktags-Reihe ohne fehlende Handelstage → keine Luecke; eine echte Luecke (2 Wochen ohne Kurs) bleibt erkannt. */
test("M4-1 daily series: weekends are not data gaps, real gaps still are", () => {
  const pts = []; let d = Date.UTC(2015, 0, 5), v = 100;
  while (pts.length < 900) { const wd = new Date(d).getUTCDay(); if (wd !== 0 && wd !== 6) { v *= 1 + 0.01 * Math.sin(pts.length / 7) + 0.002; pts.push([new Date(d).toISOString().slice(0, 10), +v.toFixed(4)]); } d += 86400000; }
  const mk = (p) => { const rows = p.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })); return dailySeriesFromPayload({ ticker: "TEST", bars: rows }, "TEST"); };
  let s; try { s = mk(pts); } catch (e) { s = null; }
  if (!s || !s.length) { const Canon = require(join(ROOT, "quant/engines/technical/canonical-bars.js")); s = Canon.fromRows(pts.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })), { instrumentId: "TEST", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "test" }); }
  const P = Ctx.prepare(s), r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 252 });
  assert.equal(r.dataQuality.gaps, 0, "Wochenenden duerfen keine Luecken sein");
  assert.equal(r.dataQuality.blocking, false);
  /* echte Luecke: 15 Handelstage fehlen */
  const gapPts = pts.slice(0, 600).concat(pts.slice(615));
  const Canon = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
  const s2 = Canon.fromRows(gapPts.map(([date, c]) => ({ date, open: c, high: c, low: c, close: c, volume: null })), { instrumentId: "TEST", exchange: "US", currency: "USD", timeframe: "1D", priceSeriesType: "SPLIT_ADJUSTED", source: "test" });
  const P2 = Ctx.prepare(s2), r2 = EV3.analyzeElliottV3({ series: s2, features: P2.features, pivots: P2.pivots, barsPerYear: 252 });
  assert.ok(r2.dataQuality.maxGapBars >= 4, "eine echte Luecke von 15 Handelstagen muss erkannt werden");
});

/* §89 Migrations-Alarme: 132 scheinbare Ereignisse entstanden bei der Umstellung 2.2 → 3.2 bei gleichem Datenstand. */
test("M4-2 alerts: no events from a methodology change or unchanged data date", () => {
  const row = (t, asOf, flags) => ({ t, asOf, alerts: { scenarioId: "s1", direction: "BULLISH", confidence: "MEDIUM", flags, levels: { entryLow: 1, entryHigh: 2 } } });
  const prev = { methodologyKey: "A", rows: [row("X", "2026-10-01", { inEntryZone: false })] };
  const changed = Alerts.diffRun(prev, { methodologyKey: "B", rows: [row("X", "2026-10-01", { inEntryZone: true })] });
  assert.equal(changed.events.length, 0); assert.equal(changed.suppressed, "METHODOLOGY_CHANGED");
  const same = Alerts.diffRun(prev, { methodologyKey: "A", rows: [row("X", "2026-10-01", { inEntryZone: true })] });
  assert.equal(same.events.length, 0, "gleicher Datenstand → keine Ereignisse"); assert.equal(same.skippedUnchanged, 1);
  const moved = Alerts.diffRun(prev, { methodologyKey: "A", rows: [row("X", "2026-10-08", { inEntryZone: true })] });
  assert.equal(moved.events.length, 1); assert.equal(moved.events[0].type, "ENTRY_ZONE_REACHED");
  /* neuer Titel ohne vorige Zeile: Ausgangszustand, kein Ereignis (Code-Review M1) */
  assert.equal(Alerts.diffRun(prev, { methodologyKey: "A", rows: [row("X", "2026-10-01", { inEntryZone: false }), row("NEW", "2026-10-08", { inEntryZone: true })] }).events.length, 0);
  assert.equal(Alerts.diffRun(null, { methodologyKey: "A", rows: [row("X", "2026-10-08", { inEntryZone: true })] }).suppressed, "BASELINE");
  /* der veroeffentlichte Index traegt den Methodenschluessel, sonst greift der Schutz beim naechsten Lauf nicht */
  const idx = join(ROOT, "quant/data/technical-intelligence/v3/index.json.gz");
  if (existsSync(idx)) { const j = JSON.parse(gunzipSync(readFileSync(idx)).toString()); assert.ok(j.methodologyKey && /elliott/.test(j.methodologyKey), "index.json.gz ohne methodologyKey"); }
});

/* §90 WXY-Schieflage: in Produktion war WXY die haeufigste Hauptzaehlung (1.877 von 5.292), Impulse fast nie (44). Auf sauberen
   Lehrbuch-Impulsen, -Zigzags und -Flats darf WXY nicht die Hauptzaehlung sein (Stand 3.2.1: 0 von 40). */
test("M4-3 WXY does not win on clean textbook structures", () => {
  let wxy = 0, n = 0;
  for (const cls of ["IMPULSE", "IMPULSE_EXT3", "ZIGZAG", "FLAT_REGULAR"]) for (let seed = 0; seed < 10; seed++) {
    const cs = corpusCase(cls, seed, "none", { layout: "A" });
    const s = weeklySeriesFromPoints(cs.dates.map((d, i) => [d, cs.closes[i]]), "S"), P = Ctx.prepare(s);
    const r = EV3.analyzeElliottV3({ series: s, features: P.features, pivots: P.pivots, barsPerYear: 52 });
    n++; if (r.primary && r.primary.pattern === "WXY") wxy++;
  }
  assert.ok(wxy <= 2, "WXY als Hauptzaehlung auf " + wxy + " von " + n + " sauberen Nicht-WXY-Strukturen");
});

/* §91 API-Versionen: jeder Titel nennt Engine-, Regel- und Datenversion; meta.json nennt die Produktions-Engine. */
test("M4-4 API carries consistent engine versions", () => {
  const V = join(ROOT, "quant/data/technical-intelligence/v3");
  if (!existsSync(join(V, "meta.json"))) return;
  const meta = JSON.parse(readFileSync(join(V, "meta.json"), "utf8"));
  assert.equal(meta.elliott.engine, "v3"); assert.equal(meta.elliott.confluenceWeight, 0); assert.equal(meta.elliott.status, "EXPERIMENTAL_STRUCTURE_MODEL");
  const shard = JSON.parse(gunzipSync(readFileSync(join(V, "shards", "AA.json.gz"))).toString()).instruments;
  const one = Object.values(shard)[0];
  assert.equal(one.versions.elliott, EV3.ENGINE_VERSION, "Shard-Daten stammen nicht von der aktuellen Engine — neu bauen");
  assert.ok(one.versions.ruleSet && one.versions.dataAsOf && one.versions.api);
  assert.equal(one.versions.elliottStatus, "EXPERIMENTAL_STRUCTURE_MODEL");
});

/* §92 Unmoegliche Kursniveaus: 328 von 5.292 Titeln (6 %) trugen Niveaus ≤ 0 oder > Faktor 10 vom Kurs (ACON: Kurs 2,44,
   Ziel −2.695, Bestaetigung 949,73), weil der Measured Move linear in Kurspunkten nach einem Einbruch um 99,9 % rechnete. */
test("M4-5 scenario levels are positive and plausible after a collapse", async () => {
  const { analyzeProduct } = await import(join(ROOT, "scripts/technical/lib/ti-product.mjs"));
  const check = (res, close, tag) => {
    for (const s of res.scenarios || []) {
      const lv = [];
      if (s.entryZone) lv.push(s.entryZone.zoneLow, s.entryZone.zoneHigh);
      if (s.invalidation) lv.push(s.invalidation.price);
      if (s.confirmation) lv.push(s.confirmation.price);
      (s.targets || []).forEach((z) => lv.push(z.zoneLow, z.zoneHigh));
      for (const v of lv) { assert.ok(v > 0, tag + " " + s.kind + ": Niveau " + v + " ≤ 0"); assert.ok(v <= close * 12 && v >= close / 12, tag + " " + s.kind + ": Niveau " + v + " unplausibel bei Kurs " + close); }
    }
  };
  /* synthetisch: 3.000 → 2 in 6 Jahren, dann seitwaerts mit Rauschen */
  const pts = []; let d = Date.UTC(2015, 0, 2), v = 3000;
  for (let i = 0; i < 520; i++) { v = i < 300 ? v * Math.exp(Math.log(2 / 3000) / 300 + 0.04 * Math.sin(i / 3)) : 2 * (1 + 0.15 * Math.sin(i / 5)); pts.push([new Date(d).toISOString().slice(0, 10), +v.toFixed(4)]); d += 7 * 86400000; }
  const s = weeklySeriesFromPoints(pts, "COLLAPSE"), out = analyzeProduct(s, {});
  check(out.res, s.close[s.length - 1], "synthetisch");
  /* echte Faelle: ACON (Ziel −2.695), AIXI (Einstiegszone 5× ueber dem Kurs wegen ATR aus Vor-Einbruch-Kursen), BYND, BRNX, ATOS */
  for (const t of ["ACON", "AIXI", "BYND", "BRNX", "ATOS"]) {
    const f = join(ROOT, "quant/data/market/discover-series-long/ref_" + t + ".json");
    if (existsSync(f)) { const s2 = weeklySeriesFromPoints(JSON.parse(readFileSync(f, "utf8")).points, t); check(analyzeProduct(s2, {}).res, s2.close[s2.length - 1], t); }
  }
});

/* Red-Team 2 (Mission IV): C1 tote Reihen (ALPN: Ziel 457 bei Kurs 65, CRV 392:1), H1 enthaltene Elliott-Zaehlung formte
   Szenarien, H2 Einstiegszonen bis zum Doppelten des Kurses (VLCN). */
test("M4-6 no scenarios on dead series; abstained Elliott never shapes scenarios; entry and risk bounded", async () => {
  const { analyzeProduct } = await import(join(ROOT, "scripts/technical/lib/ti-product.mjs"));
  const pts = []; let d = Date.UTC(2016, 0, 1), v = 50;
  for (let i = 0; i < 480; i++) { if (i < 470) v *= 1 + 0.03 * Math.sin(i / 4) + 0.002; pts.push([new Date(d).toISOString().slice(0, 10), +v.toFixed(2)]); d += 7 * 86400000; }
  const dead = analyzeProduct(weeklySeriesFromPoints(pts, "DEAD"), {}).res;
  assert.equal(dead.scenarios.length, 0, "Szenario auf toter Reihe"); assert.equal(dead.confidence.overall, "LOW");
  for (const t of ["ALPN", "VLCN", "AIXI", "ACON", "HCTI", "TALK", "SLAB", "GRDX", "AAPL", "MSFT"]) {
    const f = join(ROOT, "quant/data/market/discover-series-long/ref_" + t + ".json"); if (!existsSync(f)) continue;
    const s = weeklySeriesFromPoints(JSON.parse(readFileSync(f, "utf8")).points, t), out = analyzeProduct(s, {}), r = out.res, close = s.close[s.length - 1];
    const E = r.methods && r.methods.elliott, abst = !E || !E.applicability || E.applicability.abstain;
    for (const sc of r.scenarios) {
      if (abst) { assert.ok(!sc.elliottShaped, t + ": enthaltene Zaehlung formt das Szenario"); assert.equal(sc.expectedStructure || null, null, t + ": Erwartete Struktur trotz Enthaltung"); }
      if (sc.entryZone && sc.kind !== "TAIL") { assert.ok(Math.abs(sc.entryZone.center - close) <= 0.35 * close, t + ": Einstieg " + sc.entryZone.center + " bei Kurs " + close); }
      if (sc.rewardRiskT1 !== null && sc.rewardRiskT1 !== undefined) assert.ok(sc.rewardRiskT1 <= 12, t + ": CRV " + sc.rewardRiskT1);
    }
  }
});
