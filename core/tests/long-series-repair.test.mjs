/* DQ-PX-4 und Reparaturplan der Wochenreihen (core/data-quality.js#compareDailyWeekly,
   scripts/market/long-series-repair-plan.mjs). Anlass: 22./23.10.2026, neun Titel mit
   Reverse-Split nach dem letzten Wochenlauf (AMTD x60, DKI x50 ...). Die Regel muss den
   Niveaufehler finden - und darf weder Rundung noch echte Kursstuerze melden. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { buildPlan } from "../../scripts/market/long-series-repair-plan.mjs";
const require = createRequire(import.meta.url);
const DQ = require("../data-quality.js");

/* Wochenschluesse (Freitage) und eine Tagesreihe, die sie enthaelt. */
const FRIDAYS = ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16"];
const series = (id, pts) => ({ securityId: id, ticker: id.replace(/^ref_/, ""), from: pts[0][0], to: pts[pts.length - 1][0], points: pts });

test("Rundungseinheit folgt roundClose: Cent ab 1 $, vier gueltige Stellen darunter", () => {
  assert.equal(DQ.closeUnit(512.34), 0.01);
  assert.equal(DQ.closeUnit(1), 0.01);
  assert.ok(Math.abs(DQ.closeUnit(0.0533) - 0.00001) < 1e-12);
  assert.ok(Math.abs(DQ.closeUnit(0.4979) - 0.0001) < 1e-12);
});

test("Rundung ist kein Befund: halber Cent bei 1 $ und letzte Stelle bei Pennystocks", () => {
  const d = series("ref_A", [["2026-10-09", 1.05], ["2026-10-16", 0.05331]]);
  const w = series("ref_A", [["2026-10-09", 1.04], ["2026-10-16", 0.0533]]);
  assert.equal(DQ.compareDailyWeekly(d, w).status, "CONSISTENT");
});

test("Echter Kurssturz in beiden Reihen ist kein Befund", () => {
  const pts = FRIDAYS.map((f, i) => [f, Number((40 * Math.pow(0.6, i)).toFixed(2))]);
  assert.equal(DQ.compareDailyWeekly(series("ref_C", pts), series("ref_C", pts)).status, "CONSISTENT");
});

test("Reverse-Split nach dem Wochenlauf: Niveaufehler mit Faktor", () => {
  const daily = series("ref_AMTD", FRIDAYS.map((f) => [f, 30]));
  const weekly = series("ref_AMTD", FRIDAYS.map((f) => [f, 0.5]));
  const c = DQ.compareDailyWeekly(daily, weekly);
  assert.equal(c.status, "MISMATCH");
  assert.equal(c.kind, "LEVEL");
  assert.equal(c.factor, "60");
  const r = DQ.dailyWeeklyAgreement([{ securityId: "ref_AMTD", daily, weekly }]);
  assert.equal(r.failed, 1);
  assert.match(r.samples[0], /Faktor ~60: Split nicht nachgezogen/);
});

test("Ein einzelner abweichender Wochenschluss ist POINT, kein Split", () => {
  const daily = series("ref_P", FRIDAYS.map((f) => [f, 20]));
  const weekly = series("ref_P", FRIDAYS.map((f, i) => [f, i === 3 ? 21 : 20]));
  const c = DQ.compareDailyWeekly(daily, weekly);
  assert.equal(c.kind, "POINT");
  assert.equal(c.factor, null);
});

test("Verglichen wird nur an identischen Stichtagen: Feiertagswoche und Luecke", () => {
  /* Woche mit Karfreitag: der Wochenschluss ist Donnerstag; fehlt der Tag in der Tagesreihe,
     wird die Woche nicht verglichen - und nicht mit dem Montag danach. */
  const daily = series("ref_H", [["2026-04-01", 10], ["2026-04-06", 30]]);
  const weekly = series("ref_H", [["2026-04-02", 10.5]]);
  assert.equal(DQ.compareDailyWeekly(daily, weekly).status, "NO_OVERLAP");
});

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), "vu-lsrp-"));
  const dd = join(root, "quant/data/market/discover-series"), ld = join(root, "quant/data/market/discover-series-long");
  mkdirSync(dd, { recursive: true }); mkdirSync(ld, { recursive: true });
  for (const [id, daily, weekly] of entries) {
    writeFileSync(join(dd, id + ".json"), JSON.stringify(series(id, daily)));
    if (weekly) writeFileSync(join(ld, id + ".json"), JSON.stringify(series(id, weekly)));
  }
  return root;
}

test("Reparaturplan nennt nur den abweichenden Titel; --only und --max greifen", () => {
  const ok = FRIDAYS.map((f) => [f, 100]);
  const root = fixture([
    ["ref_GOOD", ok, ok],
    ["ref_GP", FRIDAYS.map((f) => [f, 1.6]), FRIDAYS.map((f) => [f, 0.32])],
    ["ref_DKI", FRIDAYS.map((f) => [f, 2.67]), FRIDAYS.map((f) => [f, 0.0534])],
    ["ref_NOLONG", ok, null]
  ]);
  try {
    const plan = buildPlan({ root });
    assert.equal(plan.checked, 3);
    assert.deepEqual(plan.tickers, ["DKI", "GP"]);
    assert.deepEqual(plan.affected.map((a) => a.factor), ["50", "5"]);
    assert.deepEqual(buildPlan({ root, only: new Set(["GP", "GOOD"]) }).tickers, ["GP"]);
    const zuViele = buildPlan({ root, max: 1 });
    assert.equal(zuViele.overflow, true);
    assert.deepEqual(zuViele.tickers, [], "Systemfehler: kein automatischer Neubau");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
