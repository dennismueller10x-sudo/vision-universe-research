// Beendete Notierungen verlassen das Produktuniversum (scripts/market/apply-ended-listings.mjs, Steuerung 17.11.2026).
// Jede Regel ausgeloest und nicht ausgeloest, mit eigener Eingabe; keine Produktionsdaten.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { judgeEnded, judgeCarried, judgeSucceeded, indexEvidence, lagFn, referenceSession, MAX_LAG, GRACE_DAYS } from "../../scripts/market/apply-ended-listings.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const calendar = JSON.parse(readFileSync(join(ROOT, "quant/config/market-calendar.json"), "utf8"));
const lag = lagFn(calendar);
const REF = "2026-11-16";
const series = (to, run = 1) => ({ securityId: "ref_X", points: [["2026-10-01", 9], ...Array.from({ length: run }, () => [to, 10])].map((p, i, a) => (i === a.length - 1 ? [to, 10] : p)) });
const inactive = { active: false, status: "INACTIVE", maxEnd: "2025-09-24" }, active = { active: true, status: "ACTIVE", maxEnd: "2026-11-06" };
const review = { securityId: "ref_X", ticker: "X", active_status: "INACTIVE", product_eligibility: "REVIEW", product_eligibility_reason: "UNCONFIRMED:LISTING_INACTIVE", review_flags: [] };

test("Sitzungsabstand ueber den Handelskalender: 06.11. -> 16.11. sind 6 Sitzungen", () => {
  assert.equal(lag("2026-11-06", REF), 6);
  assert.equal(lag("2026-11-13", REF), 1);
  assert.equal(lag(REF, REF), 0);
});

test("A: Stamm INACTIVE und Reihe zu Ende -> EXCLUDED; laufende Reihe, fehlende Reihe oder aktiver Stamm bleiben", () => {
  const j = judgeEnded(review, series("2026-11-06"), inactive, null, REF, lag);
  assert.equal(j.next.product_eligibility, "EXCLUDED");
  assert.equal(j.next.product_eligibility_reason, "CONFIRMED_LISTING_ENDED:MASTER_INACTIVE");
  assert.equal(j.evidence.sessionsBehind, 6);
  assert.equal(judgeEnded(review, series("2026-11-13"), inactive, null, REF, lag), null, "eine Sitzung zurueck: laeuft noch (Wiederverwendung)");
  assert.equal(judgeEnded(review, null, inactive, null, REF, lag), null, "ohne Reihe kein Beleg");
  assert.equal(judgeEnded({ ...review, active_status: "ACTIVE" }, series("2026-11-06"), active, null, REF, lag), null, "aktiver Stamm ohne Register bleibt");
  const spac = { ...review, product_eligibility: "SEPARATE_CLASS", product_eligibility_reason: "CONFIRMED_SEPARATE_CLASS:SPAC" };
  assert.equal(judgeEnded(spac, series("2026-11-06"), inactive, null, REF, lag).next.product_eligibility, "EXCLUDED", "inaktive SPAC ebenso");
  assert.equal(judgeEnded({ ...review, product_eligibility: "EXCLUDED" }, series("2026-11-06"), inactive, null, REF, lag), null);
  assert.equal(MAX_LAG, 2);
});

test("B: belegte Uebernahme -> EXCLUDED nur, wenn die Reihe am Stichtag endet", () => {
  const ev = indexEvidence({ schemaVersion: "listing-ended-evidence-1.0.0", records: [{ securityId: "ref_X", ticker: "X", event: "ACQUISITION", effectiveDate: "2026-11-02", counterparty: "K", sources: ["https://example.org/x"] }] }).get("ref_X");
  const live = { ...review, active_status: "ACTIVE", product_eligibility: "ELIGIBLE", product_eligibility_reason: "US_COMMON_EQUITY_ON_PRIMARY_VENUE" };
  const j = judgeEnded(live, series("2026-11-06"), active, ev, REF, lag);
  assert.equal(j.next.product_eligibility_reason, "CONFIRMED_LISTING_ENDED:ACQUISITION");
  assert.deepEqual(j.evidence.sources, ["https://example.org/x"]);
  assert.equal(judgeEnded(live, series("2026-11-13"), active, ev, REF, lag), null, "Reihe laeuft noch");
  assert.equal(judgeEnded(live, series("2026-11-12"), active, { ...ev, effectiveDate: "2026-10-01" }, REF, lag), null, `Reihe laeuft mehr als ${GRACE_DAYS} Tage nach dem Stichtag weiter`);
});

test("Register: fail closed bei fehlender Quelle, falschem Ereignis, Doppel", () => {
  const rec = { securityId: "ref_X", ticker: "X", event: "ACQUISITION", effectiveDate: "2026-11-02", counterparty: "K", sources: ["https://example.org/x"] };
  const doc = (r) => ({ schemaVersion: "listing-ended-evidence-1.0.0", records: r });
  assert.equal(indexEvidence(doc([rec])).size, 1);
  assert.equal(indexEvidence(null).size, 0);
  assert.throws(() => indexEvidence(doc([{ ...rec, sources: [] }])), /sources/);
  assert.throws(() => indexEvidence(doc([{ ...rec, sources: ["http://x"] }])), /sources/);
  assert.throws(() => indexEvidence(doc([{ ...rec, event: "RUMOR" }])), /event/);
  assert.throws(() => indexEvidence(doc([rec, rec])), /doppelt/);
  assert.throws(() => indexEvidence({ records: [] }), /schemaVersion/);
});

test("Bezugssitzung ist die haeufigste letzte Bar des Datenbestands, nicht die Uhr", () => {
  assert.equal(referenceSession(["2026-11-16", "2026-11-16", "2026-11-06", null]), "2026-11-16");
  assert.equal(referenceSession(["2026-11-13", "2026-11-13", "2026-11-16"]), "2026-11-13", "faellt der Abruf aus, wandert die Bezugssitzung nicht");
  assert.equal(referenceSession([]), null);
});

test("Das committete Register ist gueltig und belegt jeden Eintrag", () => {
  const ev = indexEvidence(JSON.parse(readFileSync(join(ROOT, "quant/config/listing-ended-evidence.json"), "utf8")));
  assert.deepEqual([...ev.keys()].sort(), ["ref_BWMN", "ref_CBZ", "ref_ITGR", "ref_KVUE", "ref_LXFR", "ref_LXP", "ref_RAMP", "ref_ROKU"]);
});

test("Regel C · Fortschreibung: nach der Bereinigung (Reihe entfernt) bleibt eine beendete Notierung ausgeschlossen", () => {
  const d = { securityId: "ref_FL", ticker: "FL", product_eligibility: "REVIEW", product_eligibility_reason: "UNCONFIRMED:LISTING_INACTIVE", active_status: "INACTIVE" };
  const prev = { ...d, product_eligibility: "EXCLUDED", product_eligibility_reason: "CONFIRMED_LISTING_ENDED:MASTER_INACTIVE" };
  const inactive = { active: false, status: "INACTIVE" }, active = { active: true, status: "ACTIVE" };
  const j = judgeCarried(d, prev, null, inactive, null);
  assert.equal(j.next.product_eligibility, "EXCLUDED");
  assert.equal(j.next.product_eligibility_reason, "CONFIRMED_LISTING_ENDED:MASTER_INACTIVE");
  assert.equal(j.rule, "ENDED_LISTING:CARRIED");
  assert.equal(judgeCarried(d, prev, null, active, null), null, "Stamm wieder ACTIVE: kein Beleg mehr");
  assert.equal(judgeCarried(d, prev, { points: [["2026-11-20", 1]] }, inactive, null), null, "Reihe wieder da: Regel A/B entscheiden neu");
  assert.equal(judgeCarried(d, { ...prev, product_eligibility_reason: "CONFIRMED_NON_EQUITY:ETF" }, null, inactive, null), null, "nur beendete Notierungen");
  assert.equal(judgeCarried(d, null, null, inactive, null), null, "ohne Vorstand nichts");
  /* Uebernahme (Regel B): traegt nur, solange der Registereintrag besteht */
  const prevAcq = { ...prev, product_eligibility_reason: "CONFIRMED_LISTING_ENDED:ACQUISITION" }, dAcq = { ...d, product_eligibility: "ELIGIBLE", active_status: "ACTIVE" };
  assert.equal(judgeCarried(dAcq, prevAcq, null, active, { securityId: "ref_FL", event: "ACQUISITION" }).next.product_eligibility, "EXCLUDED");
  assert.equal(judgeCarried(dAcq, prevAcq, null, active, null), null, "Registereintrag entfernt: kein Beleg");
});

test("Regel D · Kuerzelwechsel: Vorgaenger raus, sobald Stichtag erreicht und Nachfolger im Produkt; retirePredecessor false haelt", () => {
  const d = { securityId: "ref_ANY", ticker: "ANY", product_eligibility: "ELIGIBLE", product_eligibility_reason: "US_COMMON_EQUITY_ON_PRIMARY_VENUE" };
  const entry = { from: "ref_ANY", to: "ref_DRK", toTicker: "DRK", effective: "2026-09-17", cik: "0000000001", source: { type: "SEC_8K", accession: "0000000001-26-000001" } };
  const prod = new Set(["ref_DRK"]);
  const j = judgeSucceeded(d, entry, prod, "2026-11-20");
  assert.equal(j.next.product_eligibility, "EXCLUDED");
  assert.equal(j.next.product_eligibility_reason, "CONFIRMED_LISTING_ENDED:SUCCEEDED");
  assert.equal(j.evidence.successorTicker, "DRK");
  assert.equal(judgeSucceeded(d, entry, new Set(), "2026-11-20"), null, "Nachfolger nicht im Produkt: Vorgaenger bleibt");
  assert.equal(judgeSucceeded(d, entry, prod, "2026-09-16"), null, "vor dem Stichtag");
  assert.equal(judgeSucceeded(d, { ...entry, retirePredecessor: false }, prod, "2026-11-20"), null, "bewusst gehalten (TCBI)");
  assert.equal(judgeSucceeded(d, null, prod, "2026-11-20"), null);
  /* Fortschreibung nach dem Entfernen der Reihe: traegt, solange der Registereintrag gilt */
  const prev = { ...d, product_eligibility: "EXCLUDED", product_eligibility_reason: "CONFIRMED_LISTING_ENDED:SUCCEEDED" };
  assert.equal(judgeCarried(d, prev, null, { active: true }, null, entry).next.product_eligibility, "EXCLUDED");
  assert.equal(judgeCarried(d, prev, null, { active: true }, null, null), null, "Registereintrag weg: kein Beleg");
});

test("Regel D · TCBI geht wie die anderen Vorgaenger (Steuerung 22.11.2026: retirePredecessor true)", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "quant/config/ticker-successions.json"), "utf8"));
  const tcbi = doc.successions.find((e) => e.from === "ref_TCBI");
  assert.equal(tcbi.retirePredecessor, true);
  assert.ok(tcbi.retireNote);
});
