/* Ueberlebenden-Kontrolle (Owner-Programm 02.10.2026, §2-§9, §24).

   Gesichert wird:
     - Gate und Kontrolle sind getrennt; ein bestandenes Gate ist nie eine Kontrolle.
     - Identitaet ueber das Listing-Fenster, nie ueber das Kuerzel: eine Reihe
       eines spaeter neu vergebenen Kuerzels gehoert NICHT dem delisteten Titel.
     - Delistete Listings gehen nur in die Sensitivitaet, nie in die Hauptstudie;
       ein unbekannter Ausgang wird zensiert, nicht als 0 % oder -100 % gezaehlt.
   Jede Zusicherung hat eine Gegenprobe. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require("../engines/survivorship-control.js");
const SB = require("../engines/signal-backtest.js");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

test("identity: a reused ticker's series belongs to the later listing, never to the delisted one", () => {
  const active = new Set(["COHR2"]);
  const row = { ticker: "COHR2", canonical_id: "tiingo:NASDAQ:COHR2:1990-03-26", start_date: "1990-03-26", end_date: "2022-07-01" };
  /* Die Reihe laeuft bis heute weiter: sie gehoert der Firma, die das Kuerzel heute traegt. */
  const later = { from: "1990-03-30", to: "2026-09-25" };
  assert.equal(SC.classifyInactiveRow(row, { activeTickers: active, seriesOf: () => later }).cls, "D");
  assert.equal(SC.classifyInactiveRow(row, { activeTickers: new Set(), seriesOf: () => later }).cls, "F", "ohne aktive Zeile: Identitaet unsicher, nicht verwendbar");
  /* Gegenprobe: eine Reihe, die im Listing-Fenster endet, IST die Historie. */
  const own = { from: "1990-03-30", to: "2022-06-30" };
  assert.equal(SC.classifyInactiveRow(row, { activeTickers: new Set(), seriesOf: () => own }).cls, "A");
  assert.equal(SC.classifyInactiveRow(row, { activeTickers: new Set(), seriesOf: () => ({ from: "1990-03-30", to: "2020-01-03" }) }).cls, "B");
  assert.equal(SC.classifyInactiveRow(row, { activeTickers: new Set(), seriesOf: () => null }).cls, "C");
  assert.equal(SC.ownsSeries({ start: "2009-05-19", end: "2016-11-02" }, { from: "2003-12-19", to: "2016-11-01" }), false, "Reihe beginnt vor dem Listing");
});

test("published inventory: none of the 191 inactive security-master rows is counted with history by ticker alone", () => {
  const s = read("quant/data/product/survivorship-control-v1.json");
  const sm = s.securityMaster;
  assert.equal(sm.inactiveCommon, 191);
  assert.equal(sm.rows.length, 191);
  assert.equal(Object.values(sm.classes).reduce((a, b) => a + b, 0), 191);
  const reused = sm.rows.filter((r) => r[4] === "D");
  assert.ok(reused.length >= 180, "fast alle inaktiven Zeilen sind neu vergebene Kuerzel");
  assert.ok(reused.every((r) => r[6] === "LATER_LISTING_SAME_TICKER" || r[6] === null), "eine vorhandene Reihe gehoert dem spaeteren Listing");
  /* 173 vor dem Verzeichnisbeleg; bei 6 Kuerzeln (AFGC, NEWTI, PFH, RILYG, RILYZ, SREA) ist das spaetere Listing eine
     Anleihe (DEBT/EXCLUDED), deren Reihe nicht mehr veroeffentlicht wird -> 167 */
  assert.ok(reused.filter((r) => r[6] === "LATER_LISTING_SAME_TICKER").length >= 165);
  /* Gegenprobe zur alten Regel: ein Ticker-Join haette diese Reihen dem delisteten Titel gegeben. */
  assert.equal(sm.backtestEligible, sm.classes.A + sm.classes.B);
  assert.equal(sm.cik.mapped, 0, "keine CIK ueber das Kuerzel");
  assert.ok(s.semantics.SURVIVORSHIP_GATE && s.semantics.SURVIVORSHIP_CONTROL);
  assert.equal(s.outcome.treatment, "CENSORED");
  assert.ok(!/"close"|"adjustedClose"|"points"/.test(JSON.stringify(s)), "keine Kurse im oeffentlichen Inventar");
});

test("fetched listings: reused, mismatched, duplicate and active listings never count as usable delistings", () => {
  const asOf = "2026-10-01";
  assert.equal(SC.classifyFetchedListing({ status: "OK", last: "2019-05-01" }, { asOf }).cls, "A");
  assert.equal(SC.classifyFetchedListing({ status: "PARTIAL", last: "2019-05-01", flags: ["EARLY_END"] }, { asOf }).cls, "B");
  assert.equal(SC.classifyFetchedListing({ status: "EMPTY" }, { asOf }).cls, "C");
  assert.equal(SC.classifyFetchedListing({ status: "UNFETCHABLE_REUSED" }, { asOf }).cls, "D");
  assert.equal(SC.classifyFetchedListing({ status: "MISMATCH", last: "2019-05-01" }, { asOf }).cls, "F");
  assert.equal(SC.classifyFetchedListing({ status: "OK", last: "2019-05-01", duplicateOf: "SURVIVOR" }, { asOf }).cls, "F", "Kuerzelwechsel: die Firma lebt weiter");
  assert.equal(SC.classifyFetchedListing({ status: "OK", last: "2026-09-30" }, { asOf }), null, "aktiv, kein Delisting");
  assert.equal(SC.classifyFetchedListing({ status: "SKIPPED_CLASS" }, { asOf }), null);
});

test("gate and control are separate: a passed gate never reads as a solved survivorship bias", () => {
  const none = SC.status({ highTrustWithoutControl: false, delistedInStudy: 0 });
  assert.equal(none.gate.state, "PASS"); assert.equal(none.gate.solvesSurvivorship, false);
  assert.equal(none.control.state, "NOT_AVAILABLE");
  const part = SC.status({ highTrustWithoutControl: false, delistedInStudy: 4000, coverageFrom: "2016-01-04", studyFrom: "1993-01-29", unfetchableShare: 0.08 });
  assert.equal(part.control.state, "PARTIAL");
  assert.ok(part.control.reasons.includes("DELISTED_ONLY_FROM_2016") && part.control.reasons.includes("DELIST_OUTCOME_UNKNOWN"));
  assert.equal(part.control.inMainStudy, false);
  assert.notEqual(part.control.state, "PASS", "Teilabdeckung ist nie PASS");
  assert.equal(SC.status({ highTrustWithoutControl: true, delistedInStudy: 0 }).gate.state, "FAIL");
});

/* Signal-Studie mit 60 heutigen Titeln und 24 synthetischen delisteten Listings
   (echte Wochenreihen ab 2015, abgeschnitten 2018-2021). */
function fixture(t, { withDelisted }) {
  const dir = mkdtempSync(join(tmpdir(), "vu-surv-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const long = join(dir, "long"), work = join(dir, "work", "tiingo", "daily");
  mkdirSync(long, { recursive: true }); mkdirSync(work, { recursive: true });
  const src = join(ROOT, "quant/data/market/discover-series-long");
  const files = readdirSync(src).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
  const longOnes = files.filter((f) => JSON.parse(readFileSync(join(src, f), "utf8")).points.length > 1500);
  for (const f of longOnes.slice(0, 60)) {
    const j = JSON.parse(readFileSync(join(src, f), "utf8"));
    copyFileSync(join(src, f), join(long, f));
    writeFileSync(join(work, j.securityId + ".json"), JSON.stringify({ ticker: j.ticker, securityId: j.securityId, provider: "tiingo",
      bars: j.points.map(([d, v], i) => ({ securityId: j.securityId, date: d, open: v, high: v, low: v, close: v, volume: 1, adjustedClose: v * Math.pow(1.0004, i), splitFactor: 1, dividend: 0 })) }));
  }
  const spy = read("quant/data/market/multi-asset/series/SPY.json").points;
  writeFileSync(join(work, "ref_SPY.json"), JSON.stringify({ ticker: "SPY", securityId: "ref_SPY", provider: "tiingo",
    bars: spy.map(([d, v], i) => ({ securityId: "ref_SPY", date: d, open: v, high: v, low: v, close: v, volume: 1, adjustedClose: v * Math.pow(1.00008, i), splitFactor: 1, dividend: 0 })) }));
  const args = ["--max-old-space-size=4096", join(ROOT, "scripts/quant/build-signal-backtest.mjs"), "--work-dir", join(dir, "work")];
  if (withDelisted) {
    const listings = longOnes.slice(60, 84).map((f, k) => {
      const j = JSON.parse(readFileSync(join(src, f), "utf8"));
      const end = `${2018 + (k % 4)}-0${1 + (k % 9)}-15`;
      const pts = j.points.filter(([d]) => d >= "2015-01-02" && d <= end);
      /* der Verfall vor dem Delisting: die letzten 10 Wochen fallen auf ein Fuenftel */
      const n = pts.length;
      const c = pts.map(([, v], i) => +(v * (i >= n - 10 ? 1 - 0.08 * (i - n + 11) : 1)).toPrecision(7));
      return { id: "tiingo:NYSE:DLX" + k + ":2001-01-02", ticker: "DLX" + k, status: "OK", first: pts[0][0], last: pts[n - 1][0], tr: "TOTAL_RETURN_CONFIRMED",
        w0: pts[0][0], c, t: c.map((v, i) => +(v * Math.pow(1.0004, i)).toPrecision(7)) };
    });
    /* lueckenlose Freitage: die Fixture-Punkte sind Wochenschluesse (Freitage) */
    for (const l of listings) { const t0 = Date.parse(l.w0 + "T00:00:00Z"); const f = new Date(t0); assert.equal(f.getUTCDay(), 5, "Wochenschluessel sind Freitage"); }
    writeFileSync(join(dir, "delisted.json"), JSON.stringify({ version: "delisted-weekly-bundle-1.0.0", asOf: "2026-10-01", listings }));
    args.push("--delisted", join(dir, "delisted.json"));
  }
  const out = join(dir, "signal.json");
  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { PATH: process.env.PATH, VU_SIGNAL_LONG_DIR: long, VU_SIGNAL_OUT: out }, timeout: 600000 });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return JSON.parse(readFileSync(out, "utf8"));
}

test("sensitivity: survivors only vs historical eligible subset, same basis, censored delist outcomes, main study untouched", (t) => {
  const plain = fixture(t, { withDelisted: false });
  const s = fixture(t, { withDelisted: true });
  assert.equal(plain.survivorshipSensitivity.computed, false);
  assert.equal(plain.survivorship.control, "NOT_AVAILABLE");
  const z = s.survivorshipSensitivity;
  assert.equal(z.computed, true);
  assert.equal(z.returnType, s.returnType, "eine Renditebasis fuer beide Varianten");
  assert.equal(z.window.from, "2016-01-08");
  assert.equal(z.universe.CURRENT_SURVIVORS_ONLY.titles, 60);
  assert.equal(z.universe.HISTORICAL_ELIGIBLE_SUBSET.titles, 84);
  assert.equal(z.universe.HISTORICAL_ELIGIBLE_SUBSET.delisted, 24);
  assert.ok(z.universe.HISTORICAL_ELIGIBLE_SUBSET.membersAtYearStart["2017"] > z.universe.CURRENT_SURVIVORS_ONLY.membersAtYearStart["2017"]);
  assert.equal(z.rules.length, SB.RULES.length);
  let censored = 0;
  for (const r of z.rules) {
    for (const v of ["CURRENT_SURVIVORS_ONLY", "HISTORICAL_ELIGIBLE_SUBSET", "LAST_PRICE_ASSUMPTION"]) for (const k of ["rawCases", "cases", "independentCases", "positiveShare", "baseRate", "delta", "median", "maxDrawdownMedian", "censored"]) assert.ok(k in r[v], v + "." + k);
    assert.equal(r.CURRENT_SURVIVORS_ONLY.delistedCases, 0);
    assert.ok(r.HISTORICAL_ELIGIBLE_SUBSET.cases >= r.CURRENT_SURVIVORS_ONLY.cases);
    /* zensiert, nicht mit einer Annahme gewertet: die Last-Price-Variante wertet mehr Faelle */
    assert.ok(r.LAST_PRICE_ASSUMPTION.cases >= r.HISTORICAL_ELIGIBLE_SUBSET.cases);
    censored += r.HISTORICAL_ELIGIBLE_SUBSET.censored;
    /* Ein delisteter Titel gehoert nach seinem Ende nicht mehr zur Base Rate:
       die Annahme "letzter Kurs" darf die Base Rate nicht mit 0-%-Wochen fuellen. */
    assert.ok(Math.abs(r.LAST_PRICE_ASSUMPTION.baseRate - r.HISTORICAL_ELIGIBLE_SUBSET.baseRate) < 0.02, r.id + " Base Rate der Annahme verzerrt");
    for (const k of ["positiveShare", "baseRate", "delta", "median", "maxDrawdownMedian"]) assert.ok(k in r.historicalMinusSurvivors);
  }
  assert.ok(censored > 0, "Faelle ueber das Delisting hinaus werden gezaehlt und nicht gewertet");
  /* Die Hauptstudie bleibt unberuehrt: dieselben Zahlen mit und ohne delistete Listings. */
  assert.equal(s.source.titles, plain.source.titles);
  assert.deepEqual(s.rules.map((r) => [r.id, r.horizons.m6.n, r.horizons.m6.positiveShare, r.horizons.m6.median, r.trust]),
    plain.rules.map((r) => [r.id, r.horizons.m6.n, r.horizons.m6.positiveShare, r.horizons.m6.median, r.trust]));
  assert.equal(s.survivorship.control, "PARTIAL");
  for (const r of s.rules) { assert.equal(r.checks.survivorship.state, "FAIL"); assert.ok(!["USABLE", "ROBUST"].includes(r.trust), "keine Hochstufung aus der Sensitivitaet"); }
  assert.equal(SB.studyViolations(s).length, 0, JSON.stringify(SB.studyViolations(s)));
});

test("backtest page: eight trust components, plain flags and the survivorship explanation - never a PASS word for the control", () => {
  const src = readFileSync(join(ROOT, "quant/app/page-backtest.js"), "utf8");
  for (const id of ["returnBasis", "pit", "lookahead", "survivorship", "oos", "walkForward", "sample", "independence"]) assert.match(src, new RegExp('\\["' + id + '", "'), id);
  for (const t of ["Historisch getestet", "Evidenz eingeschränkt", "Überlebenden-Effekt nicht vollständig kontrolliert"]) assert.ok(src.includes(t), t);
  assert.ok(src.includes("Historische Ergebnisse können verzerrt sein, wenn Unternehmen fehlen, die damals existierten, heute aber nicht mehr gelistet sind."));
  assert.match(src, /if \(id === "survivorship"\) return "nicht vollständig kontrolliert"/, "eine nicht bestandene Kontrolle heisst nie 'erfüllt'");
  assert.doesNotMatch(src, /SURVIVORSHIP_(GATE|CONTROL)|TODAYS_UNIVERSE_ONLY"/, "keine internen Codes im Text");
});
