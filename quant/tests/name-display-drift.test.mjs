// Bericht der Namensanzeige gegen den neuen Namensstand (scripts/market/report-name-display-drift.mjs): synthetisch, schreibt nichts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nameDisplayDrift } from "../../scripts/market/report-name-display-drift.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("listet jede abweichende Seite mit altem und neuem Namen, CIK-Wechsel eigens gezaehlt", () => {
  const next = { rows: [
    { ticker: "AAA", securityId: "ref_AAA", status: "RESOLVED", displayName: "Neu AAA", cik: "0000000001", nameSource: "SEC_COMPANY_TICKERS" },
    { ticker: "BBB", securityId: "ref_BBB", status: "RESOLVED", displayName: "Gleich", cik: "0000000002", nameSource: "SEC_COMPANY_TICKERS" },
    { ticker: "CCC", securityId: "ref_CCC", status: "RESOLVED", companyName: "Andere Firma", cik: "0000000009", nameSource: "SEC_COMPANY_TICKERS" },
    { ticker: "DDD", securityId: "ref_DDD", status: "UNRESOLVED", displayName: null } ] };
  const prev = { rows: [{ ticker: "AAA", cik: "0000000001" }, { ticker: "BBB", cik: "0000000002" }, { ticker: "CCC", cik: "0000000003" }] };
  const pages = { AAA: { stock: { companyName: "Alt AAA" } }, BBB: { stock: { companyName: "Gleich" } }, CCC: { stock: { companyName: "Alte Firma" } }, DDD: { stock: { companyName: null } } };
  const searchIndex = { entries: [{ s: "AAA", n: "Alt AAA" }, { s: "BBB", n: "Gleich" }, { s: "CCC", n: "Alte Firma" }, { s: "DDD", n: null }, { s: "EEE", n: "x" }] };
  const r = nameDisplayDrift({ next, prev, searchIndex, pageOf: (t) => pages[t] || null });
  assert.equal(r.checked, 3);
  assert.deepEqual(r.drift.map((d) => [d.ticker, d.shownOnPage, d.next, d.issuerChanged]), [["AAA", "Alt AAA", "Neu AAA", false], ["CCC", "Alte Firma", "Andere Firma", true]]);
  assert.equal(r.issuerChanged, 1);
});

test("Wochenlauf ruft den Bericht nach NM3 auf und behaelt SMW-2 (kein Discover-Neubau)", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/security-master-weekly.yml"), "utf8");
  assert.match(wf, /report-name-display-drift\.mjs --next/);
  assert.ok(wf.indexOf("discover/tests/names.test.mjs") < wf.indexOf("report-name-display-drift.mjs"));
  assert.doesNotMatch(wf, /build-discover-data/);
});
