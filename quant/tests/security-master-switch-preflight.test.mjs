// Security Master 1.1.0 → 1.3.0: Prüfungen am Lauftag (scripts/market/security-master-switch-preflight.mjs).
// Frist aus der SF8-Eingangsprüfung selbst, Bytegleichheit Probe/produktiv, Gate-Bedingungen. Nur Temp-Verzeichnisse.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { deadlines, compareFollowStates, checkGateReport } from "../../scripts/market/security-master-switch-preflight.mjs";
import { SOURCES } from "../../scripts/supertrader/source-faithful/product/eod-adapter.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts/market/security-master-switch-preflight.mjs");

function fakeRoot(masterAt, namesAt) {
  const d = mkdtempSync(join(tmpdir(), "sm-preflight-"));
  for (const [k, at] of [["master", masterAt], ["names", namesAt]]) {
    const p = join(d, SOURCES[k]); mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ generatedAt: at, rows: [] }));
  }
  return d;
}

test("SMP-1 · Frist: Stamm 11.09.2026 14:43 UTC → letzter CURRENT-Lauftag 10.11., STALE ab 11.11. (60 Tage, '>' statt '>=')", () => {
  const d = fakeRoot("2026-09-11T14:43:20.305Z", "2026-10-11T05:41:17.821Z");
  try {
    const r = deadlines({ root: d, today: "2026-11-02" });
    assert.equal(r.master.maxDays, 60);
    assert.equal(r.master.lastCurrentRunDay, "2026-11-10");
    assert.equal(r.master.firstStaleRunDay, "2026-11-11");
    assert.equal(r.master.statusToday, "CURRENT");
    assert.equal(r.names.maxDays, 45);
    assert.equal(r.names.lastCurrentRunDay, "2026-11-25");
    assert.equal(r.names.firstStaleRunDay, "2026-11-26");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("SMP-2 · Frist nach dem Wechsel: Stempel Lauftag 00:00 UTC → genau 60 Tage gültig", () => {
  const d = fakeRoot("2026-11-10T00:00:00Z", "2026-11-10T09:00:00Z");
  try {
    const r = deadlines({ root: d, today: "2026-11-10" });
    assert.equal(r.master.lastCurrentRunDay, "2027-01-09");
    assert.equal(r.master.firstStaleRunDay, "2027-01-10");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("SMP-3 · Vergleich: bytegleich, sonst Zeilen- und Kopfabweichung benannt", () => {
  const row = (t, e) => ({ ticker: t, canonical_id: `tiingo:NASDAQ:${t}:2000-01-01`, end_date: e });
  const a = Buffer.from(JSON.stringify({ version: "x", counts: { rowsTotal: 2 }, rows: [row("AAA", null), row("BBB", null)] }));
  assert.equal(compareFollowStates(a, Buffer.from(a)).byteEqual, true);
  const b = Buffer.from(JSON.stringify({ version: "x", counts: { rowsTotal: 3 }, rows: [row("AAA", "2026-10-30"), row("BBB", null), row("CCC", null)] }));
  const c = compareFollowStates(a, b);
  assert.equal(c.byteEqual, false);
  assert.deepEqual(c.rowsChanged, ["tiingo:NASDAQ:AAA:2000-01-01|AAA"]);
  assert.deepEqual(c.rowsOnlyProductive, ["tiingo:NASDAQ:CCC:2000-01-01|CCC"]);
  assert.deepEqual(c.headerFields, ["counts"]);
});

test("SMP-4 · Gate-Bericht: PASS ohne ungenutzten Eintrag erfüllt; ungenutzter Eintrag, BLOCKED oder fehlende Liste nicht", () => {
  const base = () => ({ pass: true, decision: "COMMIT", report: { prev: { version: "us-security-master-1.1.0" }, next: { version: "us-security-master-1.3.0" },
    approval: { applied: { nameChanges: 592 }, unused: { nameChanges: 0, deactivations: 0 }, counted: { canonicalIdChanges: 24, deactivations: 16, eligibilityFlips: 16, instrumentTypeChanges: 1, tickerChanges: 0, newDuplicateCanonicalIds: 0, nameChanges: 1 } } } });
  const ok = checkGateReport(base());
  assert.equal(ok.ok, true, ok.failures.join("; "));
  assert.equal(ok.headroom.canonicalIdChanges, "24/25");
  const unused = base(); unused.report.approval.unused.nameChanges = 3;
  assert.match(checkGateReport(unused).failures.join(), /ungenutzte Listeneinträge nameChanges: 3/);
  const blocked = base(); blocked.pass = false; blocked.decision = "BLOCKED";
  assert.equal(checkGateReport(blocked).ok, false);
  const noList = base(); delete noList.report.approval;
  assert.match(checkGateReport(noList).failures.join(), /ohne Sonderfreigabe/);
  const over = base(); over.report.approval.counted.canonicalIdChanges = 26;
  assert.match(checkGateReport(over).failures.join(), /canonicalIdChanges 26 > 25/);
});

test("SMP-5 · CLI schreibt nie in den committeten Baum und braucht eine Prüfung", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--deadline", "--today", "2026-11-02", "--out", join(ROOT, "quant/data/x.json")], { encoding: "utf8" });
  assert.equal(r.status, 2); assert.match(r.stderr, /REFUSED_OUT_INSIDE_COMMITTED_TREE/);
  const n = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(n.status, 2);
});
