/* Belegte Ticker-Wiederverwendungen (quant/config/ticker-reuse-quarantine.json) in der Universumsquelle:
   zurueckgehalten mit Grund und Zaehlung, nie still; fehlerhaftes Register bricht ab; Belege gegen die Daten geprueft. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolveProductUniverse, loadTickerReuseQuarantine, TICKER_REUSE_QUARANTINE_FILE, SECURITY_MASTER_FILE } from "../../scripts/market/universe-source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const J = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const rec = (t, o = {}) => ({ securityId: "ref_" + t, ticker: t, action: "IDENTITY_QUARANTINED", finding: "TICKER_REUSED_BY_ETF",
  historicIdentity: { providerRow: { assetType: "Stock", endDate: "2018-02-26" } }, currentInstrument: { providerRow: { assetType: "ETF", startDate: "2025-10-16" } },
  ownSeries: { from: "2025-10-16" }, ...o });
function fixture(records, fn) {
  const dir = mkdtempSync(join(tmpdir(), "vu-reuse-"));
  try {
    mkdirSync(join(dir, "quant", "data", "market", "security-master"), { recursive: true }); mkdirSync(join(dir, "quant", "config"), { recursive: true });
    const d = (t, k) => ({ ticker: t, securityId: "ref_" + t, exchange: "NYSE", instrument_type: "EQUITY_COMMON", product_eligibility: k });
    writeFileSync(join(dir, SECURITY_MASTER_FILE), JSON.stringify({ counts: { productUniverse: 3, ELIGIBLE: 2, SEPARATE_CLASS: 1, REVIEW: 0, EXCLUDED: 1 },
      decisions: [d("AAA", "ELIGIBLE"), d("PCLN", "ELIGIBLE"), d("CCC", "SEPARATE_CLASS"), d("DDD", "EXCLUDED")] }));
    if (records) writeFileSync(join(dir, TICKER_REUSE_QUARANTINE_FILE), JSON.stringify({ schemaVersion: "ticker-reuse-quarantine-1.0.0", records }));
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("markiert mit Grund und Zaehlung; Mitgliedschaft und Zaehlung bleiben quellentreu", () => {
  fixture([rec("PCLN")], (dir) => {
    const r = resolveProductUniverse(dir);
    assert.deepEqual(r.securities.map((s) => s.ticker), ["AAA", "CCC", "PCLN"]);
    assert.equal(r.counts.productUniverse, 3); assert.equal(r.counts.identityQuarantined, 1);
    const p = r.securities.find((s) => s.ticker === "PCLN");
    assert.deepEqual([p.identityStatus, p.identityReason], ["IDENTITY_QUARANTINED", "IDENTITY_TICKER_REUSED_BY_ETF"]);
    assert.equal(r.securities.find((s) => s.ticker === "AAA").identityStatus, undefined);
    assert.deepEqual(r.identityQuarantine.flagged.map((x) => [x.securityId, x.eligibility]), [["ref_PCLN", "ELIGIBLE"]]);
  });
  fixture(null, (dir) => { const r = resolveProductUniverse(dir); assert.equal(r.securities.length, 3); assert.equal(r.identityQuarantine, null); assert.equal(r.counts.identityQuarantined, 0); });
});

for (const [what, r, re] of [
  ["securityId nicht nach core/identity.js", rec("PCLN", { securityId: "ref_PCLN_2" }), /core\/identity\.js/],
  ["andere Aktion", rec("PCLN", { action: "HIDE" }), /nur IDENTITY_QUARANTINED/],
  ["neue Zeile nicht spaeter", rec("PCLN", { currentInstrument: { providerRow: { assetType: "ETF", startDate: "2017-01-01" } } }), /Beleg/],
  ["gleicher Wertpapiertyp", rec("PCLN", { currentInstrument: { providerRow: { assetType: "Stock", startDate: "2025-10-16" } } }), /gleicher Wertpapiertyp/],
  ["eigene Reihe vor dem Ende", rec("PCLN", { ownSeries: { from: "2010-01-01" } }), /eigene Reihe/],
]) test("fehlerhaftes Register bricht ab: " + what, () => fixture([r], (dir) => assert.throws(() => resolveProductUniverse(dir), re)));

test("committetes Register: jeder Eintrag durch Stamm (alte Zeile), Kursreihe und Eignung gedeckt; EDVA (gleiche Emittentin) nicht zurueckgehalten", () => {
  const q = loadTickerReuseQuarantine(root);
  const doc = J(TICKER_REUSE_QUARANTINE_FILE);
  const master = J("quant/data/market/security-master/us-security-master.json").rows;
  const elig = new Map(J(SECURITY_MASTER_FILE).decisions.map((d) => [d.ticker, d]));
  assert.equal(q.records.size, 13);
  for (const r of doc.records) {
    const rows = master.filter((x) => x.baseline_security_id === r.securityId);
    assert.ok(rows.length && rows.every((x) => x.start_date === r.historicIdentity.providerRow.startDate && x.start_date < r.currentInstrument.providerRow.startDate),
      r.securityId + ": Stamm fuehrt nur die Zeile der alten Aktie (gleicher Beginn), nicht das neue Wertpapier");
    const f = join(root, r.ownSeries.file);
    assert.ok(existsSync(f), r.securityId);
    const s = JSON.parse(readFileSync(f, "utf8"));
    assert.ok(s.points[0][0] > r.historicIdentity.providerRow.endDate, r.securityId + ": Kursreihe gehoert zum neuen Wertpapier");
    assert.notEqual(elig.get(r.ticker).product_eligibility, "EXCLUDED", r.securityId + ": war ausgeliefert");
  }
  assert.deepEqual(doc.notWithheld.map((x) => x.securityId), ["ref_EDVA"]);
  assert.ok(!q.records.has("ref_EDVA"));
  const u = resolveProductUniverse(root);
  assert.equal(u.counts.identityQuarantined, 13);
  const flagged = u.securities.filter((s) => s.identityStatus === "IDENTITY_QUARANTINED").map((s) => s.securityId).sort();
  assert.deepEqual(flagged, [...q.records.keys()].sort(), "genau die belegten Titel sind markiert");
});
