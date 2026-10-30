// Backtest-Identitätssperre (Owner 30.10.2026): keine Zusammenführung über das gleiche Symbol, ohne belastbare
// kanonische Zuordnung nicht backtestfähig. Synthetische Stände, nichts im Repository.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { buildBlocklist, canonicalClass, BLOCKLIST_SCHEMA } from "../../scripts/market/build-security-master-identity-blocklist.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = createRequire(import.meta.url)("../../scripts/quant/backtest-generation-freeze.cjs");
const row = (t, o = {}) => ({ ticker: t, canonical_id: `tiingo:NYSE:${t}:2000-01-01`, exchange: "NYSE", instrument_type: "EQUITY_COMMON", active_status: "ACTIVE", eligible_us_equity: true, baseline_member: true, baseline_security_id: `ref_${t}`, end_date: "2026-10-29", ...o });
const master = (rows) => ({ version: "us-security-master-1.3.0", rows });
const IDS = ["KEEP", "EXCH", "REUSE", "START", "DROP", "ETF", "DUP", "GONE", "GONE2", "UNRD", "PREF", "BACK", "OTCS"];
const prev = () => master([...IDS.filter((t) => t !== "BACK").map((t) => row(t)), row("BACK", { active_status: "INACTIVE", eligible_us_equity: false }), row("DROP", { canonical_id: "tiingo:NYSE:DROP:2020-01-01", active_status: "INACTIVE", eligible_us_equity: false })]);
const next = () => master([
  row("KEEP"), row("EXCH", { canonical_id: "tiingo:NYSE MKT:EXCH:2000-01-01" }),
  row("REUSE"), row("REUSE", { canonical_id: "tiingo:NASDAQ:REUSE:2026-06-23" }),
  row("START", { canonical_id: "tiingo:NYSE:START:2026-10-05" }), row("DROP"),
  row("ETF", { instrument_type: "ETF" }), row("DUP"), row("DUP", { active_status: "INACTIVE", eligible_us_equity: false }),
  row("GONE", { active_status: "INACTIVE", eligible_us_equity: false, end_date: "2026-08-01" }),
  row("GONE2", { active_status: "INACTIVE", eligible_us_equity: false, end_date: "2026-08-01" }),
  row("UNRD", { active_status: "INACTIVE", eligible_us_equity: false, end_date: "2026-08-01" }),
  row("PREF", { instrument_type: "PREFERRED", eligible_us_equity: false }), row("BACK"),
  row("OTCS", { canonical_id: "tiingo:OTCMKTS:OTCS:2026-01-01", exchange: "OTCMKTS", eligible_us_equity: false }),
]);
const ends = { ref_GONE: "2026-10-29", ref_GONE2: "2026-08-01", ref_UNRD: "UNREADABLE" };
const mk = () => buildBlocklist({ prevMaster: prev(), nextMaster: next(), seriesEnd: (id) => ends[id] ?? null, prevMasterSha256: "a".repeat(64), nextMasterSha256: "b".repeat(64), measuredOn: "2026-10-30" });

test("SMB-1 · jede Klasse ohne belastbare kanonische Zuordnung ist gesperrt; reine Börsenumbenennung und ein echtes Delisting nicht", () => {
  const b = mk(), r = Object.fromEntries(b.entries.map((e) => [e.securityId, e.reason]));
  assert.deepEqual(r, {
    ref_DROP: "LISTING_DROPPED", ref_DUP: "PROVIDER_DUPLICATE_ROW", ref_ETF: "TICKER_REUSE_ETF", ref_GONE: "SERIES_CONTINUES_AFTER_PROVIDER_END",
    ref_REUSE: "TICKER_REUSE_NEW_LISTING", ref_START: "START_DATE_CHANGED", ref_UNRD: "SERIES_UNREADABLE",
    ref_PREF: "INSTRUMENT_TYPE_CHANGED", ref_BACK: "REACTIVATED", ref_OTCS: "START_DATE_CHANGED",
  });
  assert.equal(b.generator, "security-master-identity-blocklist-builder-1.1.0");
  assert.equal(r.ref_KEEP, undefined); assert.equal(r.ref_EXCH, undefined, "nur Börsenname"); assert.equal(r.ref_GONE2, undefined, "Reihe endet mit dem Anbieter");
  assert.equal(b.schema, BLOCKLIST_SCHEMA); assert.equal(b.prevMasterSha256, "a".repeat(64)); assert.equal(b.nextMasterSha256, "b".repeat(64));
  assert.deepEqual(b.entries.map((e) => e.securityId), [...b.entries.map((e) => e.securityId)].sort(), "sortiert, deterministisch");
});

test("SMB-2 · Klassen der canonical_id", () => {
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:NYSE:A:2000-01-01|tiingo:NYSE:A:2026-06-23"), "NEW_LISTING_SAME_TICKER");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01|tiingo:NYSE:A:2020-01-01", "tiingo:NYSE:A:2020-01-01"), "LISTING_DROPPED");
  assert.equal(canonicalClass("tiingo:NYSE MKT:A:2000-01-01", "tiingo:OTCMKTS:A:2000-01-01"), "MOVED_TO_OTC");
  assert.equal(canonicalClass("tiingo:AMEX:A:2000-01-01", "tiingo:NYSE MKT:A:2000-01-01"), "EXCHANGE_LABEL");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:NYSE:A:2001-01-01"), "START_DATE_REVISION");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:NASDAQ:A:2001-01-01"), "EXCHANGE_AND_START_DATE");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:OTCMKTS:A:2026-01-01"), "EXCHANGE_AND_START_DATE", "Startdatum vor OTC");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "other:NYSE:A:2000-01-01"), "UNCLASSIFIED");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:NYSE:B:2000-01-01"), "UNCLASSIFIED");
});

test("SMB-3 · CLI: fail closed ohne Reihenverzeichnis, Ausgabe vom Freeze-Werkzeug lesbar und an beide Stämme gebunden", () => {
  const d = mkdtempSync(join(tmpdir(), "vu-smb-"));
  try {
    for (const [k, m] of [["prev", prev()], ["next", next()]]) { mkdirSync(join(d, k)); writeFileSync(join(d, k, "us-security-master.json"), JSON.stringify(m)); }
    const cli = (extra) => spawnSync(process.execPath, [join(ROOT, "scripts/market/build-security-master-identity-blocklist.mjs"), "--prev", join(d, "prev"), "--next", join(d, "next"), "--out", join(d, "bl.json"), ...extra], { encoding: "utf8" });
    assert.equal(cli(["--series-dir", join(d, "fehlt")]).status, 2, "ohne Reihen kein stilles Ergebnis");
    assert.equal(spawnSync(process.execPath, [join(ROOT, "scripts/market/build-security-master-identity-blocklist.mjs"), "--prev", join(d, "prev"), "--out"], { encoding: "utf8" }).status, 2, "Schalter ohne Wert");
    mkdirSync(join(d, "series")); writeFileSync(join(d, "series", "index.json"), "{}"); writeFileSync(join(d, "series", "ref_GONE.json"), JSON.stringify({ to: "2026-10-29" }));
    const ok = cli(["--series-dir", join(d, "series")]);
    assert.equal(ok.status, 0, ok.stderr);
    const list = F.loadBlocklist(join(d, "bl.json"));
    assert.ok(list.ids.includes("ref_GONE") && list.ids.includes("ref_REUSE"));
    assert.match(list.prevMasterSha256, /^[0-9a-f]{64}$/); assert.notEqual(list.prevMasterSha256, list.nextMasterSha256);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("SMB-4 · Probelauf 30.10. (Nachweis): an den committeten Stamm 1.1.0 gebunden, ONEOK und die Tickerwiederverwendung gesperrt", () => {
  const b = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/identity-blocklist-probe-20261030.json"), "utf8"));
  const v = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-approved-changes.json"), "utf8"));
  assert.equal(b.schema, BLOCKLIST_SCHEMA); assert.equal(b.prevMasterSha256, v.prevMasterSha256);
  const r = Object.fromEntries(b.entries.map((e) => [e.securityId, e.reason]));
  assert.equal(r.ref_OKE, "PROVIDER_DUPLICATE_ROW"); assert.equal(r.ref_AAAP, "TICKER_REUSE_NEW_LISTING"); assert.equal(r.ref_LESL, "START_DATE_CHANGED"); assert.equal(r.ref_PCLN, "SERIES_CONTINUES_AFTER_PROVIDER_END");
  assert.equal(r.ref_ACGLO, "INSTRUMENT_TYPE_CHANGED", "v130-Typwechsel gesperrt");
  assert.equal(b.entries.length, 209);
});
