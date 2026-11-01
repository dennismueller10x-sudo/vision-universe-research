// Belegregister einzelner canonical_id-Wechsel (scripts/market/build-security-master-approval-list.mjs):
// synthetische Zeilen, keine Netzzugriffe, schreibt nichts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCanonical, indexCanonicalEvidence, applyCanonicalEvidence, CANONICAL_EVIDENCE_SCHEMA } from "../../scripts/market/build-security-master-approval-list.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TODAY = "2026-10-30";
const row = (o) => ({ ticker: "ABC", exchange: "NASDAQ", start_date: "2015-02-02", end_date: "2026-09-10", active_status: "ACTIVE", instrument_type: "EQUITY_COMMON", eligible_us_equity: true, baseline_security_id: "ref_ABC", ...o, canonical_id: `tiingo:${o.exchange || "NASDAQ"}:${o.ticker || "ABC"}:${o.start_date || "2015-02-02"}` });
const k8 = (o = {}) => ({ form: "8-K", items: ["3.01"], accession: "0001234567-26-000001", filingDate: "2026-10-23", cik: "0000000001", url: "https://www.sec.gov/Archives/edgar/data/1/x.htm", quote: "trading in the Common Stock on Nasdaq will be suspended at the opening of business", ...o });
const rec = (o = {}) => ({ securityId: "ref_ABC", ticker: "ABC", cik: "0000000001", builderClass: "MOVED_TO_OTC", fromCanonicalId: "tiingo:NASDAQ:ABC:2015-02-02", toCanonicalId: "tiingo:OTCMKTS:ABC:2015-02-02", event: { kind: "NASDAQ_DELISTING_SUSPENSION_TO_OTC", effectiveDate: "2026-10-30" }, filings: [k8()], reviewedAt: "2026-10-30", ...o });
const sec = (cik, exchange = "Nasdaq") => new Map([["ABC", { cik, name: "ABC Inc", exchange }]]);

function otcCase(secBy = sec("0000000001")) {
  const P = [row({})], N = [row({ exchange: "OTCMKTS", end_date: "2026-10-29", eligible_us_equity: false })];
  const c = { securityId: "ref_ABC", from: P[0].canonical_id, to: N[0].canonical_id, ...classifyCanonical(P, N, { today: TODAY, secBy }) };
  return { P, N, c, secBy };
}

test("Ausgangslage: Börsenrückzug in den Freiverkehr mit veralteter SEC-Börsenangabe ist ohne Beleg nicht freigabefähig", () => {
  const { c } = otcCase();
  assert.equal(c.class, "MOVED_TO_OTC"); assert.equal(c.approvable, false); assert.match(c.reason, /SEC widerspricht/);
});

test("vollständiger Treffer: freigabefähig, eigene Klasse, Accession und Zitat im Grund", () => {
  const { P, N, c, secBy } = otcCase();
  const r = applyCanonicalEvidence(c, rec(), { P, N, today: TODAY, secBy, prevCik: "0000000001" });
  assert.equal(r.applied, true); assert.equal(r.c.approvable, true); assert.equal(r.c.class, "MOVED_TO_OTC_SEC_EVIDENCE");
  assert.match(r.c.reason, /0001234567-26-000001/); assert.match(r.c.reason, /suspended/); assert.doesNotMatch(r.c.reason, /SEC widerspricht/);
  assert.equal(c.approvable, false, "Eingabe bleibt unverändert");
});

for (const [what, mut, reason] of [
  ["andere CIK im Namensstand", { prevCik: "0000000002" }, /^CIK_NOT_CONFIRMED/],
  ["kein Namensstand", { prevCik: null }, /^CIK_NOT_CONFIRMED/],
  ["SEC-Liste nennt anderen Emittenten", { secBy: sec("0000000009") }, /^SEC_LIST_OTHER_CIK/],
  ["Ereignis in der Zukunft", { rec: { event: { kind: "X", effectiveDate: "2026-11-02" } } }, /^EVENT_IN_FUTURE/],
  ["andere canonical_id", { rec: { toCanonicalId: "tiingo:OTCMKTS:ABC:2015-02-03" } }, /^CANONICAL_IDS_MISMATCH/],
  ["andere Builder-Klasse", { rec: { builderClass: "PROVIDER_HISTORY_RESTARTED" } }, /^CLASS_MISMATCH/],
  ["8-K ohne Item 3.01", { rec: { filings: [k8({ items: ["8.01"] })] } }, /^FILING_MISSING:8-K 3.01/],
  ["8-K einer anderen CIK", { rec: { filings: [k8({ cik: "0000000002" })] } }, /^FILING_MISSING/],
  ["8-K nach dem Lauftag", { rec: { filings: [k8({ filingDate: "2026-10-31" })] } }, /^FILING_MISSING/],
]) {
  test(`kein Treffer (${what}): Urteil des Builders bleibt`, () => {
    const { P, N, c, secBy } = otcCase(mut.secBy || sec("0000000001"));
    const r = applyCanonicalEvidence(c, rec(mut.rec || {}), { P, N, today: TODAY, secBy, prevCik: "prevCik" in mut ? mut.prevCik : "0000000001" });
    assert.equal(r.applied, false); assert.match(r.reason, reason); assert.equal(r.c, c);
  });
}

test("Ziel nicht im Freiverkehr oder Gattungswechsel: kein Treffer", () => {
  const P = [row({})], N = [row({ exchange: "NASDAQ", start_date: "2026-10-12", end_date: "2026-10-29" })];
  const c = { securityId: "ref_ABC", from: P[0].canonical_id, to: N[0].canonical_id, ...classifyCanonical(P, N, { today: TODAY, secBy: sec("0000000001") }) };
  assert.equal(c.class, "PROVIDER_HISTORY_RESTARTED");
  const r = applyCanonicalEvidence(c, rec({ builderClass: "PROVIDER_HISTORY_RESTARTED", toCanonicalId: N[0].canonical_id }), { P, N, today: TODAY, secBy: sec("0000000001"), prevCik: "0000000001" });
  assert.equal(r.applied, false); assert.equal(r.reason, "TARGET_NOT_OTC");
  const N2 = [row({ exchange: "OTCMKTS", instrument_type: "WARRANT" })];
  const c2 = { securityId: "ref_ABC", from: P[0].canonical_id, to: N2[0].canonical_id, ...classifyCanonical(P, N2, { today: TODAY, secBy: sec("0000000001") }) };
  assert.equal(applyCanonicalEvidence(c2, rec(), { P, N: N2, today: TODAY, secBy: sec("0000000001"), prevCik: "0000000001" }).reason, "INSTRUMENT_TYPE_CHANGED");
});

test("Neubeginn im Freiverkehr: verlangt Form 25 und Beginn am Wirksamkeitstag", () => {
  const P = [row({ exchange: "NYSE", start_date: "2024-10-07" })], N = [row({ exchange: "PINK", start_date: "2026-09-28", end_date: "2026-09-29", active_status: "INACTIVE", eligible_us_equity: false })];
  const secBy = new Map();
  const c = { securityId: "ref_ABC", from: P[0].canonical_id, to: N[0].canonical_id, ...classifyCanonical(P, N, { today: TODAY, secBy }) };
  assert.equal(c.class, "PROVIDER_HISTORY_RESTARTED"); assert.equal(c.approvable, false);
  const base = { builderClass: "PROVIDER_HISTORY_RESTARTED", fromCanonicalId: P[0].canonical_id, toCanonicalId: N[0].canonical_id, event: { kind: "NYSE_DELISTING_TO_OTC", effectiveDate: "2026-09-28" } };
  const ctx = { P, N, today: TODAY, secBy, prevCik: "0000000001" };
  assert.equal(applyCanonicalEvidence(c, rec(base), ctx).reason, "FILING_MISSING:25-NSE");
  const f25 = { form: "25-NSE", items: [], accession: "0000876661-26-000824", filingDate: "2026-10-13", cik: "0000000001", url: "https://www.sec.gov/Archives/edgar/data/1/p.xml" };
  const ok = applyCanonicalEvidence(c, rec({ ...base, filings: [k8({ filingDate: "2026-09-25" }), f25] }), ctx);
  assert.equal(ok.applied, true); assert.equal(ok.c.class, "DELISTED_TO_OTC_SEC_EVIDENCE");
  const far = applyCanonicalEvidence(c, rec({ ...base, event: { kind: "X", effectiveDate: "2026-09-20" }, filings: [k8({ filingDate: "2026-09-25" }), f25] }), ctx);
  assert.equal(far.reason, "START_DATE_NOT_AT_EVENT");
});

for (const [what, mut, re] of [
  ["falsches Schema", (d) => { d.schemaVersion = "x"; }, /schemaVersion/],
  ["unbekanntes Feld", (d) => { d.records[0].extra = 1; }, /unbekanntes Feld/],
  ["Tickerwechsel", (d) => { d.records[0].toCanonicalId = "tiingo:OTCMKTS:ABCF:2015-02-02"; }, /Tickerwechsel/],
  ["nicht zugelassene Klasse", (d) => { d.records[0].builderClass = "TWO_ACTIVE_LISTINGS"; }, /nicht zugelassen/],
  ["8-K ohne Zitat", (d) => { d.records[0].filings[0].quote = "kurz"; }, /ohne Zitat/],
  ["URL nicht sec.gov", (d) => { d.records[0].filings[0].url = "https://example.com/x"; }, /sec\.gov/],
  ["doppelte securityId", (d) => { d.records.push(structuredClone(d.records[0])); }, /doppelt/],
]) {
  test(`fehlerhaftes Register bricht ab: ${what}`, () => {
    const d = { schemaVersion: CANONICAL_EVIDENCE_SCHEMA, records: [rec()] }; mut(d);
    assert.throws(() => indexCanonicalEvidence(d), re);
  });
}

test("committetes Register: gültig, nur Rückzüge in den Freiverkehr ohne Tickerwechsel, jede Meldung von derselben CIK", () => {
  const doc = JSON.parse(readFileSync(join(ROOT, "quant/config/security-master-canonical-change-evidence.json"), "utf8"));
  const idx = indexCanonicalEvidence(doc);
  assert.deepEqual([...idx.keys()].sort(), ["ref_GCTK", "ref_LNAI", "ref_SBXD"]);
  for (const r of idx.values()) {
    assert.ok(/^tiingo:(OTCMKTS|PINK):/.test(r.toCanonicalId), r.securityId);
    assert.ok(r.filings.every((f) => f.cik === r.cik), r.securityId);
    assert.ok(r.filings.some((f) => f.form === "8-K" && f.items.includes("3.01")), r.securityId);
  }
  assert.equal(indexCanonicalEvidence(null), null);
});
