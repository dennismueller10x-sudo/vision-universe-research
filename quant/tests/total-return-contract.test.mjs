/* Gesamtrendite-Vertrag (Owner-Programm 02.10.2026, §10-§14).

   Eine Reihe gilt nur dann als Gesamtrendite, wenn jede Ausschuettung und
   jeder Split in der bereinigten Spalte angekommen ist. EIN Vertrag
   (market-quality.js totalReturnVerdict) fuer Aktien, Vergleichsmassstab,
   Signal- und Setup-Studie. Jede Zusicherung hat eine Gegenprobe, die ohne
   den Vertrag rot wuerde. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { fromBars } from "../../scripts/quant/lib/daily-prices.mjs";
import { tally, rawCloseAgreement } from "../../scripts/market/repair-total-return-history.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MQ = require("../engines/market-quality.js");
const SB = require("../engines/signal-backtest.js");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/* Tagesreihe mit einer Ausschuettung am Tag `ex`. adjusted=true: Tiingo-
   Bereinigung (alles vor dem Ex-Tag um 1 - d/p gesenkt). adjusted=false:
   der Anhang-Fehler - die Spalte macht den Ex-Tag nicht mit. */
function series({ n = 40, ex = 20, div = 1, adjusted = true, split = null, splitAdjusted = true } = {}) {
  const bars = [];
  let c = 100;
  for (let i = 0; i < n; i++) {
    if (split && i === split) c = c / 2;
    bars.push({ date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: 1,
      adjustedClose: c, dividend: i === ex ? div : 0, splitFactor: split && i === split ? 2 : 1 });
  }
  if (adjusted && ex !== null) { const f = 1 - div / bars[ex - 1].close; for (let i = 0; i < ex; i++) bars[i].adjustedClose = bars[i].close * f; }
  if (split && splitAdjusted) for (let i = 0; i < split; i++) bars[i].adjustedClose = bars[i].adjustedClose / 2;
  return bars;
}

test("contract: confirmed only when every distribution and split reached the adjusted column", () => {
  assert.equal(MQ.totalReturnVerdict(series()).state, "TOTAL_RETURN_CONFIRMED");
  assert.equal(MQ.totalReturnVerdict(series({ ex: null })).confirmed, true, "ohne Ereignis ist nichts widerlegt");
  const gap = MQ.totalReturnVerdict(series({ adjusted: false }));
  assert.equal(gap.confirmed, false); assert.equal(gap.reason, "DIVIDEND_GAP"); assert.equal(gap.firstGap, "2024-01-21");
  const sg = MQ.totalReturnVerdict(series({ ex: null, split: 10, splitAdjusted: false }));
  assert.equal(sg.reason, "SPLIT_GAP");
  assert.equal(MQ.totalReturnVerdict(series({ ex: null, split: 10 })).confirmed, true);
  /* Bereinigt, aber um das Dreifache der gemeldeten Ausschuettung: nicht erklaert. */
  const off = series(); for (let i = 0; i < 20; i++) off[i].adjustedClose = off[i].close * (1 - 3 / 100);
  assert.equal(MQ.totalReturnVerdict(off).reason, "DIVIDEND_GAP");
  const miss = series(); miss[3].adjustedClose = null;
  assert.equal(MQ.totalReturnVerdict(miss).reason, "ADJUSTED_CLOSE_MISSING");
  assert.equal(MQ.totalReturnVerdict(series(), { asOf: "2024-03-30", maxStaleDays: 10 }).reason, "STALE");
  assert.equal(MQ.totalReturnVerdict(series(), { asOf: "2024-02-12", maxStaleDays: 10 }).confirmed, true);
});

test("one contract: the shared loader, the setup study and the benchmark refresh all call totalReturnVerdict", () => {
  const d = fromBars({ ticker: "X", bars: series({ adjusted: false }) });
  assert.equal(d.legacyTotalReturn, true, "Gegenprobe: die alte Regel haette die Reihe als Gesamtrendite genommen");
  assert.equal(d.totalReturn, false); assert.equal(d.tr, null); assert.equal(d.trVerdict.reason, "DIVIDEND_GAP");
  assert.equal(fromBars({ ticker: "X", bars: series() }).totalReturn, true);
  assert.match(read("scripts/quant/build-setup-backtest.mjs"), /import \{ fromBars \} from "\.\/lib\/daily-prices\.mjs"/);
  assert.doesNotMatch(read("scripts/quant/build-setup-backtest.mjs"), /fromPriceBars/, "kein zweiter Lader mit eigener Regel");
  assert.match(read("scripts/market/refresh-benchmark-history.mjs"), /MarketQuality\.totalReturnVerdict/);
  assert.match(read("scripts/market/repair-total-return-history.mjs"), /MarketQuality\.totalReturnVerdict/);
  assert.equal((read("quant/engines/market-quality.js").match(/function totalReturnVerdict/g) || []).length, 1);
});

test("repair: counts by reason and accepts a refetch only when raw closes agree", () => {
  const t = tally([MQ.totalReturnVerdict(series()), MQ.totalReturnVerdict(series({ adjusted: false })), MQ.totalReturnVerdict(series({ ex: null, split: 10, splitAdjusted: false }))]);
  assert.deepEqual([t.TOTAL_RETURN_CONFIRMED, t.TOTAL_RETURN_REJECTED_DIVIDEND_GAP, t.TOTAL_RETURN_REJECTED_SPLIT_GAP], [1, 1, 1]);
  const stored = series({ adjusted: false });
  assert.equal(rawCloseAgreement(stored, series()).ok, true);
  const other = series().map((b) => ({ ...b, close: b.close * 1.3 }));
  assert.equal(rawCloseAgreement(stored, other).ok, false, "Gegenprobe: eine andere Firma unter demselben Kuerzel wird nicht uebernommen");
  assert.match(read(".github/workflows/market-data-refresh.yml"), /repair-total-return-history\.mjs --max 1500/);
});

/* Signal-Studie ueber 60 echte Wochenreihen mit synthetischer Gesamtrendite;
   `gapped` Titel bekommen eine nicht eingerechnete Ausschuettung. */
function signalFixture(t, gapped) {
  const dir = mkdtempSync(join(tmpdir(), "vu-tr-contract-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const long = join(dir, "long"), work = join(dir, "work", "tiingo", "daily");
  mkdirSync(long, { recursive: true }); mkdirSync(work, { recursive: true });
  const src = join(ROOT, "quant/data/market/discover-series-long");
  const files = readdirSync(src).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
  const picked = files.filter((f) => JSON.parse(readFileSync(join(src, f), "utf8")).points.length > 1500).slice(0, 60);
  picked.forEach((f, k) => {
    const j = JSON.parse(readFileSync(join(src, f), "utf8"));
    copyFileSync(join(src, f), join(long, f));
    const bars = j.points.map(([d, v], i) => ({ securityId: j.securityId, date: d, open: v, high: v, low: v, close: v, volume: 1, adjustedClose: v * Math.pow(1.0004, i), splitFactor: 1, dividend: 0 }));
    if (k < gapped) { const e = bars.length - 30; bars[e].dividend = bars[e - 1].close * 0.02; bars[e].adjustedClose = bars[e - 1].adjustedClose / bars[e - 1].close * bars[e].close; }
    writeFileSync(join(work, j.securityId + ".json"), JSON.stringify({ ticker: j.ticker, securityId: j.securityId, provider: "tiingo", bars }));
  });
  const spy = JSON.parse(read("quant/data/market/multi-asset/series/SPY.json")).points;
  writeFileSync(join(work, "ref_SPY.json"), JSON.stringify({ ticker: "SPY", securityId: "ref_SPY", provider: "tiingo",
    bars: spy.map(([d, v], i) => ({ securityId: "ref_SPY", date: d, open: v, high: v, low: v, close: v, volume: 1, adjustedClose: v * Math.pow(1.00008, i), splitFactor: 1, dividend: 0 })) }));
  const out = join(dir, "signal.json");
  const r = spawnSync(process.execPath, ["--max-old-space-size=4096", join(ROOT, "scripts/quant/build-signal-backtest.mjs"), "--work-dir", join(dir, "work")],
    { encoding: "utf8", env: { PATH: process.env.PATH, VU_SIGNAL_LONG_DIR: long, VU_SIGNAL_OUT: out }, timeout: 600000 });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return { study: JSON.parse(readFileSync(out, "utf8")), quality: JSON.parse(readFileSync(join(dir, "total-return-quality-v1.json"), "utf8")) };
}

test("signal study: rejected titles drop out of a pure total-return study and are counted", (t) => {
  const { study, quality } = signalFixture(t, 2);
  const c = study.source.totalReturnCoverage;
  assert.equal(study.returnType, "TOTAL_RETURN");
  assert.equal(c.TOTAL_RETURN_CONFIRMED_BEFORE, 60, "Gegenprobe: die alte Regel zaehlte alle 60");
  assert.equal(c.TOTAL_RETURN_CONFIRMED_AFTER, 58);
  assert.equal(c.TOTAL_RETURN_REJECTED_DIVIDEND_GAP, 2);
  assert.equal(study.source.titles, 58, "die beiden Titel rechnen nicht als Gesamtrendite mit");
  assert.equal(quality.rejected.rows.length, 2);
  assert.ok(quality.rejected.rows.every((r) => r[1] === "DIVIDEND_GAP"));
  assert.ok(!/"close"|"adjustedClose"/.test(JSON.stringify(quality)), "keine Kurse im Artefakt");
  for (const r of study.rules) { assert.equal(r.returnType, "TOTAL_RETURN"); assert.equal(r.baseRateReturnType, "TOTAL_RETURN", "Base Rate auf derselben Basis"); }
  assert.equal(study.basisContract, "same-return-basis-1.0.0");
  assert.equal(SB.studyViolations(study).length, 0);
  /* Sabotage Mischbasis: Signal in Gesamtrendite, Base Rate in Kursrendite. */
  const mixed = JSON.parse(JSON.stringify(study)); mixed.rules[0].baseRateReturnType = "SPLIT_ADJUSTED_PRICE";
  assert.ok(SB.studyViolations(mixed).some((e) => /base rate return basis differs/.test(e)));
  const missing = JSON.parse(JSON.stringify(study)); delete missing.rules[1].baseRateReturnType;
  assert.ok(SB.studyViolations(missing).some((e) => /base rate return basis not recorded/.test(e)));
  const sens = JSON.parse(JSON.stringify(study)); sens.survivorshipSensitivity = { computed: true, returnType: "SPLIT_ADJUSTED_PRICE" };
  assert.ok(SB.studyViolations(sens).some((e) => /sensitivity uses a different return basis/.test(e)));
});

test("fail closed: below 95 % confirmed total return the whole study stays on price return, no mixing", (t) => {
  const { study } = signalFixture(t, 4);
  assert.equal(study.source.totalReturnCoverage.TOTAL_RETURN_CONFIRMED_AFTER, 56);
  assert.equal(study.returnType, "SPLIT_ADJUSTED_PRICE");
  assert.equal(study.source.titles, 60, "im Kursmodus zaehlen alle Titel, keiner rechnet mit Gesamtrendite");
  assert.match(study.returnTypeNote, /nur für 93\.3 % der Titel bestätigt/);
  assert.ok(study.rules.every((r) => r.returnType === "SPLIT_ADJUSTED_PRICE" && r.baseRateReturnType === "SPLIT_ADJUSTED_PRICE" && r.checks.returnBasis.state === "FAIL"));
  assert.equal(study.returnBasisComparison.compared, false);
});
