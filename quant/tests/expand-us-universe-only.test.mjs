// Erweiterung der Mitgliedschaft mit Positivliste (expand-us-universe --only, Steuerung 17.11.2026): nur die Liste wird
// angehaengt, der Bestand bleibt zeichengleich, und ein nicht anhaengbarer Ticker der Liste bricht ab.
import test from "node:test";
import assert from "node:assert/strict";
import { appendOnlyMerge } from "../../scripts/market/expand-us-universe.mjs";

const baseline = [{ securityId: "ref_ADIL", ticker: "ADIL", exchange: "NASDAQ" }, { securityId: "ref_NVDA", ticker: "NVDA", exchange: "NASDAQ" }];
const row = (ticker, over = {}) => ({ ticker, reconciliation_status: "ADDED", eligible_us_equity: true, instrument_type: "EQUITY_COMMON",
  venue_tier: "PRIMARY", active_status: "ACTIVE", exchange: "NASDAQ", start_date: "2018-07-27", ...over });
const master = [row("AZR"), row("IRLA"), row("NEWIPO"), row("FGCPP", { reconciliation_status: "REVIEW", eligible_us_equity: false, instrument_type: "PREFERRED" })];

test("nur die Positivliste wird angehaengt, der Bestand bleibt vorne und unveraendert", () => {
  const r = appendOnlyMerge(baseline, master, { only: new Set(["AZR", "IRLA"]) });
  assert.deepEqual(r.appended.map((e) => e.ticker), ["AZR", "IRLA"]);
  assert.deepEqual(r.entries.slice(0, 2), baseline);
  assert.equal(r.skipped.notInAllowList, 2);
  assert.equal(r.invariants.appended, 2);
});

test("ohne Positivliste haengt die Erweiterung alle ADDED-Stammaktien an (bisheriges Verhalten)", () => {
  assert.deepEqual(appendOnlyMerge(baseline, master).appended.map((e) => e.ticker), ["AZR", "IRLA", "NEWIPO"]);
});

test("ein Ticker der Liste, der nicht anhaengbar ist, bricht ab (Vorzug, schon im Bestand, unbekannt)", () => {
  assert.throws(() => appendOnlyMerge(baseline, master, { only: new Set(["AZR", "FGCPP"]) }), /POSITIVLISTE_NICHT_ANHAENGBAR: FGCPP/);
  assert.throws(() => appendOnlyMerge(baseline, master, { only: new Set(["ADIL"]) }), /POSITIVLISTE_NICHT_ANHAENGBAR: ADIL/);
  assert.throws(() => appendOnlyMerge(baseline, master, { only: new Set(["ZZZZ"]) }), /POSITIVLISTE_NICHT_ANHAENGBAR: ZZZZ/);
});
