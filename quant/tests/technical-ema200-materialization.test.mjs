/* Referenztests: eingeschwungene EMA 20/50/200 (ema-settled-1.0.0).
   Methodik und Messung: docs/technical/EMA200_MATERIALIZATION.md.

   Geprueft wird:
     - die Aufwaermregel (Startgewicht (1-a)^k <= 1e-3, k = 691 fuer p = 200),
     - Handwerte und eine unabhaengige naive EMA,
     - Konventionsunabhaengigkeit an echten Kursen (Golden-Reihen),
     - Kausalitaet (Wert an t haengt nicht von Bars nach t ab),
     - Splits (dieselbe SPLIT_ADJUSTED-Reihe wie SMA 200, ADR-002),
     - unvollstaendige Historien (zu kurz, Luecken),
     - Bundle-Integration, Determinismus und den Vorher/Nachher-Vergleicher.
   Kein Test schreibt ausserhalb von os.tmpdir(). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { materialize } from "../../scripts/technical/materialize-product-intelligence.mjs";
import { compareInstrument, compareDirs } from "../../scripts/technical/compare-ema-materialization.mjs";
import { estimateEma200 } from "../../scripts/technical/measure-ema200-signal-effect.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Features = require("../engines/technical/feature-store.js");
const Canonical = require("../engines/technical/canonical-bars.js");
const Analysis = require("../engines/technical/technical-analysis.js");
const RS = require("../engines/return-series.js");
const GOLDEN = join(ROOT, "quant/data/market/golden-preview/daily");
const METH = { technical: JSON.parse(readFileSync(join(ROOT, "quant/methodology/technical-v1.json"), "utf8")),
  elliott: JSON.parse(readFileSync(join(ROOT, "quant/methodology/elliott-v1.json"), "utf8")) };

function golden(ticker) {
  const p = JSON.parse(readFileSync(join(GOLDEN, "ref_" + ticker + ".json"), "utf8"));
  const actions = p.bars.filter((b) => b.splitFactor !== 1).map((b) => ({ type: "split", exDate: b.date, ratio: b.splitFactor }));
  return { payload: p, series: Canonical.fromPriceBars(p.bars, actions, { instrumentId: ticker, source: "tiingo" }).SPLIT_ADJUSTED };
}
function randomWalk(n, seed = 11, start = 50) {
  let x = seed, px = start; const out = [];
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < n; i++) { px *= 1 + (rnd() - 0.5) * 0.05; out.push(px); }
  return out;
}
/** Unabhaengige naive EMA: Start = arithmetisches Mittel der ersten p Werte, dann a*x + (1-a)*prev. */
function naiveEma(values, p) {
  const out = values.map(() => NaN), a = 2 / (p + 1);
  let s = 0; for (let i = 0; i < p; i++) s += values[i];
  let prev = s / p; out[p - 1] = prev;
  for (let i = p; i < values.length; i++) { prev = a * values[i] + (1 - a) * prev; out[i] = prev; }
  return out;
}

test("EMA-1 · Aufwaermgrenzen: Untergrenze Startgewicht 5 % (EMA 200 fruehestens nach 500 Bars), reine Gewichtsregel 1e-3 = 891 Bars", () => {
  assert.equal(Features.EMA_MAX_REL_ERROR, 1e-3);
  assert.equal(Features.EMA_FLOOR_SEED_WEIGHT, 5e-2);
  assert.equal(Features.emaWarmupBars(200, 5e-2), 300);
  assert.equal(Features.emaWarmupBars(50, 5e-2), 75);
  assert.equal(Features.emaWarmupBars(20, 5e-2), 30);
  assert.equal(Features.emaWarmupBars(200, 1e-3), 691);
  for (const p of [3, 20, 50, 200]) for (const eps of [5e-2, 1e-3]) {
    const k = Features.emaWarmupBars(p, eps);
    assert.ok(Features.emaSeedWeight(p, k) <= eps && Features.emaSeedWeight(p, k - 1) > eps, "k minimal fuer p=" + p + ", eps=" + eps);
  }
  assert.throws(() => Features.emaWarmupBars(200, 0));
  assert.throws(() => Features.emaWarmupBars(200, 1));
});

test("EMA-2 · Handwerte: p = 3, Startgewicht 0,2 -> erster Wert drei Bars nach dem Start", () => {
  // a = 0,5. Start (SMA 2,4,6) = 4; dann 6, 8, 10. (0,5)^2 = 0,25 > 0,2, (0,5)^3 = 0,125 <= 0,2.
  assert.deepEqual(Features.ema([2, 4, 6, 8, 10, 12], 3).map((v) => (Number.isFinite(v) ? v : null)), [null, null, 4, 6, 8, 10]);
  const s = Features.settledEma([2, 4, 6, 8, 10, 12], 3, 0.2);
  assert.deepEqual(s.values.map((v) => (Number.isFinite(v) ? v : null)), [null, null, null, null, null, 10]);
  assert.equal(s.warmupBars, 3); assert.equal(s.minimumBars, 6);
  assert.equal(s.seedIndex, 2); assert.equal(s.firstSettledIndex, 5); assert.equal(s.barsAfterSeed, 3);
});

test("EMA-3 · Handwerte: Rampe (x_t - 99,5) ab dem ersten Tag mit Schranke <= 1e-3; konstanter Kurs ab der Untergrenze", () => {
  const ramp = Array.from({ length: 1200 }, (_, i) => 100 + i);
  const s = Features.settledEma(ramp, 200);
  // Unabhaengig gerechnet: Startfenster 100..299, Spanne 199; erster Tag t >= 499 mit (199/201)^(t-199)*199/(100+t) <= 1e-3.
  let expected = -1;
  for (let t = 499; t < 1200 && expected < 0; t++) if (Math.pow(199 / 201, t - 199) * 199 / (100 + t) <= 1e-3) expected = t;
  assert.equal(s.firstSettledIndex, expected);
  assert.ok(expected > 499 && expected < 890, "fruehere Freigabe als die reine Gewichtsregel: " + expected);
  for (let t = 0; t < expected; t++) assert.ok(Number.isNaN(s.values[t]), "t=" + t);
  for (let t = expected; t < 1200; t++) assert.ok(Math.abs(s.values[t] - (ramp[t] - 99.5)) < 1e-9, "t=" + t);
  const flat = Features.settledEma(new Array(1000).fill(42.5), 200);
  assert.equal(flat.firstSettledIndex, 499, "Spanne 0: Freigabe genau an der Untergrenze");
  for (let t = 499; t < 1000; t++) assert.equal(flat.values[t], 42.5);
  // Die reine Gewichtsregel bleibt als Modus erhalten (891 Bars).
  assert.equal(Features.settledEma(ramp, 200, 1e-3).firstSettledIndex, 890);
});

test("EMA-4 · Gleich der naiven Referenz-EMA und bitgleich zur bestehenden ema() (keine zweite Formel); jeder Wert erfuellt die Regel", () => {
  const v = randomWalk(1600);
  for (const p of [20, 50, 200]) {
    const ref = naiveEma(v, p), base = Features.ema(v, p), s = Features.settledEma(v, p);
    let checked = 0;
    for (let i = 0; i < v.length; i++) {
      if (!Number.isFinite(s.values[i])) continue;
      checked++;
      assert.ok(Math.abs(s.values[i] / ref[i] - 1) < 1e-12, "p=" + p + " i=" + i);
      assert.ok(Object.is(s.values[i], base[i]));
      assert.ok(s.errorBound[i] <= 1e-3 && i - s.seedIndex >= Features.emaWarmupBars(p, 5e-2), "Regel p=" + p + " i=" + i);
    }
    assert.ok(checked > 0, "p=" + p);
  }
});

test("EMA-5 · Konventionsunabhaengig an echten Kursen: jeder veroeffentlichte Wert liegt <= 0,1 % neben Vollhistorie und Erstwert-Start", () => {
  const a = 2 / 201;
  for (const ticker of ["NVDA", "JPM"]) {
    const c = golden(ticker).series.close, rawFull = Features.ema(c, 200);
    for (const len of [520, 650, 800, 891]) for (let end = 1400; end < c.length; end += 53) {
      const sub = c.slice(end - len + 1, end + 1), r = Features.settledEma(sub, 200), v = r.values.at(-1);
      if (!Number.isFinite(v)) { assert.ok(!(r.errorBound.at(-1) <= 1e-3) || len - 200 < 300); continue; }
      assert.ok(Math.abs(v - rawFull[end]) / c[end] <= r.errorBound.at(-1) + 1e-12, ticker + " len=" + len + " end=" + end + " Vollhistorie");
      let e = sub[0]; for (let i = 1; i < sub.length; i++) e = e + a * (sub[i] - e);
      assert.ok(Math.abs(e - v) / c[end] <= 1e-3, ticker + " len=" + len + " end=" + end + " Erstwert-Start");
    }
  }
});

test("EMA-6 · Kausal: der Wert an t ist mit und ohne die Bars nach t bitgleich", () => {
  const v = randomWalk(1500, 5);
  const full = Features.settledEma(v, 200).values;
  for (const t of [889, 890, 891, 1000, 1234, 1499]) {
    const cut = Features.settledEma(v.slice(0, t + 1), 200).values[t];
    assert.ok(Object.is(cut, full[t]) || (Number.isNaN(cut) && Number.isNaN(full[t])), "t=" + t);
  }
  // Ueber den Orchestrator: analyzeAsOf schneidet VOR jeder Rechnung.
  const { series } = golden("MSFT");
  const fullS = Features.settledEma(series.close, 200).values;
  const asOf = Analysis.analyzeAsOf({ series, methodology: METH, options: { elliott: false, annotations: false } }, 2000);
  assert.equal(asOf.dataCutoffIndex, 2000);
  assert.ok(Object.is(asOf.featuresAtCutoff.ema200, fullS[2000]));
});

test("EMA-7 · Splits: EMA auf derselben SPLIT_ADJUSTED-Reihe wie SMA 200 (ADR-002), kein Sprung", () => {
  // 1:10-Split an Bar 1000 bei konstantem wirtschaftlichem Kurs.
  const bars = [];
  for (let i = 0; i < 1400; i++) {
    const d = new Date(Date.UTC(2018, 0, 1) + i * 864e5).toISOString().slice(0, 10);
    const px = i < 1000 ? 500 + (i % 7) : 50 + (i % 7) / 10;
    bars.push({ date: d, open: px, high: px * 1.01, low: px * 0.99, close: px, adjustedClose: px, volume: 1000, splitFactor: i === 1000 ? 10 : 1 });
  }
  const actions = [{ type: "split", exDate: bars[1000].date, ratio: 10 }];
  const sa = Canonical.fromPriceBars(bars, actions, { instrumentId: "SPLT" }).SPLIT_ADJUSTED;
  const ema = Features.settledEma(sa.close, 200).values;
  // Dieselbe Split-Definition wie return-series#splitFactors (Core).
  const core = RS.splitAdjustedColumn(bars, "close");
  const emaCore = Features.settledEma(core, 200).values;
  for (let i = 890; i < 1400; i++) assert.ok(Math.abs(ema[i] - emaCore[i]) < 1e-6, "i=" + i);
  // Kein Sprung: von Bar 999 auf 1000 aendert sich die EMA nur um eine Tagesbewegung.
  assert.ok(Math.abs(ema[1000] / ema[999] - 1) < 0.001);
  // Auf Rohkursen waere sie um Faktor ~10 daneben; das ist der Fehler, den die Bereinigung verhindert.
  const raw = Features.settledEma(bars.map((b) => b.close), 200).values;
  assert.ok(raw[1100] / ema[1100] > 3);
  // An echten Kursen: NVDA (4:1 2021, 10:1 2024) - featuresAtCutoff.sma200 und ema200 auf derselben Spalte.
  const { series } = golden("NVDA");
  const sma = Features.sma(series.close, 200), e = Features.settledEma(series.close, 200).values, n = series.length;
  assert.ok(Math.abs(e[n - 1] / sma[n - 1] - 1) < 0.2);
});

test("EMA-8 · Unvollstaendige Historien: unter der Untergrenze nie ein Wert; Luecken zaehlen nicht als Abklingen; Einbruch sperrt, Stabilitaet gibt frei", () => {
  const v = randomWalk(1000, 3);
  const s499 = Features.settledEma(v.slice(0, 499), 200);
  assert.ok(s499.values.every((x) => Number.isNaN(x)));
  assert.equal(s499.firstSettledIndex, -1);
  // Fehlende Beobachtung nach dem Start: Wert wird getragen, das Startgewicht sinkt dort nicht.
  const gap = v.slice(); gap[500] = NaN;
  assert.equal(Features.settledEma(gap, 200).barsAfterSeed, Features.settledEma(v, 200).barsAfterSeed - 1);
  assert.ok(Number.isNaN(Features.settledEma(gap, 200).values[500]), "am Lueckentag keine Schranke, kein Wert");
  // Fehlende Beobachtung VOR dem Start: der SMA-Start braucht 200 lueckenlose Werte.
  const early = v.slice(); early[100] = NaN;
  assert.equal(Features.settledEma(early, 200).seedIndex, 300);
  // Einbruch um 95 % nach dem Start: die reine Gewichtsregel gaebe ab 891 Bars einen Wert mit bis zu ~2 % Konventionsfehler, die Schranke sperrt.
  const crash = Array.from({ length: 1000 }, (_, i) => i < 200 ? 100 + 20 * Math.sin(i / 9) : Math.max(5, 100 - (i - 200) * 0.5));
  const cr = Features.settledEma(crash, 200);
  assert.ok(Number.isFinite(Features.settledEma(crash, 200, 1e-3).values[999]), "Gewichtsregel: Wert");
  assert.ok(Number.isNaN(cr.values[999]) && cr.errorBound[999] > 1e-3, "Schranke: kein Wert, E=" + cr.errorBound[999]);
  // Stabiler Titel: kleine Spanne im Startfenster -> Wert ab der Untergrenze (500 Bars).
  const calm = Array.from({ length: 600 }, (_, i) => 80 * (1 + 0.002 * Math.sin(i)));
  assert.equal(Features.settledEma(calm, 200).firstSettledIndex, 499);
  // Leere und nur-NaN-Reihen liefern nichts, ohne Fehler.
  assert.equal(Features.settledEma([], 200).seedIndex, -1);
  assert.equal(Features.settledEma([NaN, NaN], 200).barsAfterSeed, null);
});

test("EMA-9 · Bundle: chartSeries.ema20/50/200 und featuresAtCutoff.ema200 aus derselben Rechnung", () => {
  const { series } = golden("NVDA");
  const b = Analysis.analyze({ series, methodology: METH, options: { elliott: false, annotations: false, includeChartSeries: true } });
  const n = series.length, F = b.featuresAtCutoff, cs = b.chartSeries;
  for (const k of ["ema20", "ema50", "ema200"]) assert.equal(cs[k].length, n);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  assert.equal(cs.ema20[n - 1], r4(F.ema20)); assert.equal(cs.ema50[n - 1], r4(F.ema50)); assert.equal(cs.ema200[n - 1], r4(F.ema200));
  const per = Object.fromEntries(b.emaSettlement.periods.map((p) => [p.period, p]));
  for (const [k, p] of [["ema20", 20], ["ema50", 50], ["ema200", 200]]) assert.equal(cs[k].findIndex((x) => x !== null), per[p].firstSettledIndex, k);
  const p200 = per[200];
  assert.deepEqual({ status: p200.status, warmupBars: p200.warmupBars, minimumBars: p200.minimumBars },
    { status: "SETTLED", warmupBars: 300, minimumBars: 500 });
  assert.ok(p200.firstSettledIndex >= 499 && p200.firstSettledIndex < 890, "NVDA frueher als 891 Bars: " + p200.firstSettledIndex);
  assert.ok(p200.errorBoundAtCutoff <= 1e-3 && p200.seedRange > 0);
  assert.equal(b.emaSettlement.version, "ema-settled-1.1.0");
  assert.equal(b.emaSettlement.priceSeriesType, "SPLIT_ADJUSTED");
  // Zu kurze Historie (499 Bars, unter der Untergrenze): ema200 null, Status benannt; ema20/50 bleiben.
  const short = Canonical.slice(series, series.timestamps[498]);
  const bs = Analysis.analyze({ series: short, methodology: METH, options: { elliott: false, annotations: false, includeChartSeries: true } });
  assert.equal(bs.featuresAtCutoff.ema200, null);
  assert.ok(bs.chartSeries.ema200.every((x) => x === null));
  assert.equal(bs.emaSettlement.periods.find((p) => p.period === 200).status, "INSUFFICIENT_HISTORY");
  assert.ok(Number.isFinite(bs.featuresAtCutoff.ema50));
  // Determinismus: gleiche Eingabe, gleiche Bytes.
  const again = Analysis.analyze({ series, methodology: METH, options: { elliott: false, annotations: false, includeChartSeries: true } });
  assert.equal(JSON.stringify(again), JSON.stringify(b));
});

test("EMA-10 · Produzent: neue Felder im Shard, Lauf zweimal byte-identisch, Vergleicher erkennt nur additive Pfade", () => {
  const dir = mkdtempSync(join(tmpdir(), "vu-ema200-"));
  mkdirSync(join(dir, "work", "tiingo", "daily"), { recursive: true });
  copyFileSync(join(GOLDEN, "ref_NVDA.json"), join(dir, "work", "tiingo", "daily", "ref_NVDA.json"));
  materialize({ workDir: join(dir, "work"), outDir: join(dir, "a"), tickers: ["NVDA"] });
  materialize({ workDir: join(dir, "work"), outDir: join(dir, "b"), tickers: ["NVDA"] });
  const shard = (d) => readFileSync(join(dir, d, "NV.json.gz"));
  assert.ok(shard("a").equals(shard("b")), "derselbe Lauf, dieselben Bytes");
  const x = JSON.parse(gunzipSync(shard("a"))).instruments.NVDA;
  assert.ok(Number.isFinite(x.bundle.featuresAtCutoff.ema200));
  for (const k of ["ema20", "ema50", "ema200"]) assert.equal(x.bundle.chartSeries[k].length, x.bars.close.length);
  assert.ok(x.bundle.chartSeries.ema200.every((v) => Number.isFinite(v)), "2970 Bars: ganzes Anzeigefenster eingeschwungen");

  // Vergleicher: additive Pfade -> identisch; jede andere Aenderung -> Befund.
  const before = JSON.parse(JSON.stringify(x));
  delete before.bundle.featuresAtCutoff.ema200; delete before.bundle.emaSettlement;
  for (const k of ["ema20", "ema50", "ema200"]) delete before.bundle.chartSeries[k];
  const ok = compareInstrument(before, x);
  assert.equal(ok.identical, true); assert.deepEqual(ok.unexpected, []); assert.equal(ok.present.length, 5);
  const changed = JSON.parse(JSON.stringify(x)); changed.bundle.featuresAtCutoff.sma200 += 1e-6;
  assert.equal(compareInstrument(before, changed).identical, false);
  const extra = JSON.parse(JSON.stringify(x)); extra.bundle.trend.newField = 1;
  assert.deepEqual(compareInstrument(before, extra).unexpected, ["bundle.trend.newField"]);
  // Verzeichnisvergleich: "vorher" = derselbe Shard ohne die neuen Pfade, Rest kopiert.
  mkdirSync(join(dir, "before"));
  const doc = JSON.parse(gunzipSync(shard("a"))); doc.instruments.NVDA = before;
  writeFileSync(join(dir, "before", "NV.json.gz"), gzipSync(Buffer.from(JSON.stringify(doc))));
  for (const f of readdirSync(join(dir, "a"))) if (f !== "NV.json.gz") copyFileSync(join(dir, "a", f), join(dir, "before", f));
  const rep = compareDirs(join(dir, "before"), join(dir, "a"));
  assert.equal(rep.verdict, "PASS");
  assert.equal(rep.identicalInstruments, 1);
  assert.ok(rep.sizes.rawGrowth > 0);
});

test("EMA-11 · Schaetzer fuer alte Shards: Wochenvorlauf + 270 Tagesbars trifft die exakte EMA 200 auf 1e-3", () => {
  const { payload, series } = golden("XOM");
  const exact = Features.settledEma(series.close, 200).values.at(-1);
  const dates = series.timestamps.slice(-270), closes = series.close.slice(-270);
  // Wochenschluesse aus derselben Reihe (letzter Handelstag je Kalenderwoche).
  const weekly = [];
  for (let i = 0; i < series.length; i++) {
    const next = series.timestamps[i + 1];
    const wk = (x) => Math.floor((Date.parse(x + "T00:00:00Z") / 864e5 + 3) / 7);
    if (!next || wk(next) !== wk(series.timestamps[i])) weekly.push([series.timestamps[i], series.close[i]]);
  }
  const est = estimateEma200(weekly, dates, closes);
  assert.equal(est.status, "ESTIMATED");
  assert.ok(Math.abs(est.ema200 / exact - 1) < 1e-3, "rel. Fehler " + (est.ema200 / exact - 1));
  assert.ok(payload.bars.length === series.length);
});

test("EMA-12 · Fehlerschranke empirisch: an allen Golden-Reihen nie kleiner als der tatsaechliche Fehler gegen die Vollhistorie", () => {
  let points = 0, published = 0;
  for (const ticker of ["AAPL", "JPM", "MSFT", "NVDA", "XOM"]) {
    const c = golden(ticker).series.close, full = Features.ema(c, 200);
    for (let s0 = 1000; s0 + 891 < c.length; s0 += 41) {
      const r = Features.settledEma(c.slice(s0, s0 + 891), 200);
      for (let i = 199; i < 891; i++) {
        const err = Math.abs(Features.ema(c.slice(s0, s0 + i + 1), 200)[i] - full[s0 + i]) / c[s0 + i];
        if (i % 7) continue;
        points++;
        assert.ok(err <= r.errorBound[i] + 1e-12, ticker + " s=" + s0 + " i=" + i + ": " + err + " > " + r.errorBound[i]);
        if (Number.isFinite(r.values[i])) { published++; assert.ok(err <= 1e-3); }
      }
    }
  }
  assert.ok(points > 1000 && published > 100, points + "/" + published);
});
