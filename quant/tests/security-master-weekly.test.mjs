// Wöchentliche Aktualisierung von US-Wertpapierstamm und Firmennamen (vorbereitet, Zeitplan aus):
// Workflow-Abschaltung und ADR-005, Übernahme-Gate (fail closed), Erzeuger fail closed und idempotent.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { evaluateRefresh, compareMasters, DEFAULT_THRESHOLDS } from "../../scripts/market/security-master-refresh-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF = join(ROOT, ".github", "workflows", "security-master-weekly.yml");
const SM = "quant/data/market/security-master";
const SIX = ["us-security-master.json", "summary.json", "reconciliation.json", "backfill-estimate.json", "company-names.json", "company-names-summary.json"].map((f) => `${SM}/${f}`);
const code = () => readFileSync(WF, "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("SMW-1 · Workflow: nur workflow_dispatch, Zeitplan nur als Kommentar, Commit standardmaessig aus", () => {
  const c = code();
  assert.match(c, /^on:\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(c, /^\s*(schedule|cron|push|pull_request|workflow_run)\s*:/m, "kein automatischer Ausloeser");
  assert.match(c, /commit:\n\s+description:[^\n]*\n\s+type: boolean\n\s+default: false/);
  assert.match(c, /allow_version_change:\n\s+description:[^\n]*\n\s+type: boolean\n\s+default: false/);
  assert.match(readFileSync(WF, "utf8"), /^#\s+schedule: - cron: '41 9 \* \* 3'$/m, "Zielrhythmus dokumentiert, aber auskommentiert");
  assert.match(c, /if: inputs\.commit == true && steps\.gate\.outputs\.decision == 'COMMIT'/);
});

test("SMW-2 · Workflow: ADR-005, keine Secrets, keine Eingabe im Shell-Text, nur kostenfreie Quellen", () => {
  const c = code();
  assert.match(c, /ref: \$\{\{ github\.ref \}\}/);
  assert.match(c, /group: market-data-\$\{\{ github\.ref_name \}\}/);
  assert.match(c, /scripts\/ci\/push-with-retry\.sh/);
  assert.doesNotMatch(c, /secrets\./, "keine Secrets: weder Tiingo-Metadaten noch Kursabrufe");
  for (const block of c.split(/\n\s+run: \|/).slice(1)) assert.doesNotMatch(block.split(/\n\s+- (name|uses):/)[0], /\$\{\{\s*(inputs|github\.event)\./, "Eingaben nur ueber env:");
  assert.doesNotMatch(c, /--tiingo\b/, "keine Tiingo-Metadatenabfragen");
  assert.doesNotMatch(c, /--include-new-tickers/, "neue Anbieter-Ticker bleiben zurueckgehalten (Lizenz)");
  assert.doesNotMatch(c, /build-us-eligibility|apply-name-layer|apply-exchange-directory|build-discover-data/, "keine Universums- oder Discover-Aenderung");
  assert.match(c, /build-us-security-master\.mjs --require-provider/);
  assert.match(c, /--stamp "\$\{heute\}T00:00:00Z"/, "fester Zeitstempel je Lauftag (idempotent)");
  const gate = c.indexOf("security-master-refresh-gate.mjs"), commit = c.indexOf("push-with-retry.sh");
  assert.ok(gate > 0 && gate < commit, "Gate vor dem Commit");
});

test("SMW-3 · Workflow: committet genau die sechs Dateien der beiden registrierten Erzeuger", () => {
  const c = code();
  const owned = (c.match(/PUSH_OWNED_PATHS: ([^\n]+)/) || [])[1].trim().split(/\s+/);
  assert.deepEqual(owned.sort(), [...SIX].sort());
  assert.match(c, /git add \$PUSH_OWNED_PATHS/);
  assert.doesNotMatch(c, /git add (-A|\.|quant\/data\/market\/security-master\/?\s)/, "nie das ganze Verzeichnis (eligibility.json gehoert einem anderen Erzeuger)");
  const reg = JSON.parse(readFileSync(join(ROOT, "core", "registry", "domains.json"), "utf8")).domains;
  const sm = reg.find((d) => d.id === "usSecurityMaster"), cn = reg.find((d) => d.id === "companyNames");
  assert.ok(sm && /build-us-security-master\.mjs/.test(sm.producer) && /security-master-weekly\.yml/.test(sm.workflow));
  assert.ok(cn && /build-company-names\.mjs/.test(cn.producer) && /security-master-weekly\.yml/.test(cn.workflow));
  assert.equal(reg.find((d) => d.id === "securityMaster").workflow, null, "Produkteignung bleibt ohne Workflow (nicht Teil des Laufs)");
});

/* ------------------------------------------------------------------ Gate */
const row = (id, over = {}) => ({ ticker: id, canonical_id: `tiingo:NYSE:${id}:2000-01-01`, exchange: "NYSE", instrument_type: "EQUITY_COMMON", active_status: "ACTIVE", eligible_us_equity: true, baseline_member: true, baseline_security_id: `ref_${id}`, ...over });
const master = (rows, over = {}) => ({ version: "us-security-master-1.3.0", generatedAt: "2026-10-21T00:00:00Z", rowsDelivered: rows.length, rows, ...over });
const summary = (n = 3, raw = 100000) => ({ status: "OK", headline: { BASELINE_COUNT: n, BASELINE_ACCOUNTED_FOR: n, RAW_US_PROVIDER_CANDIDATES: raw, NEW_ELIGIBLE_ADDITIONS: 0 } });
const recon = (status = "FETCHED") => ({ providerFetch: { status }, invariants: { destructiveViolations: 0 } });
const names = (rows) => ({ rows: rows.map(([id, name]) => ({ securityId: `ref_${id}`, inProductUniverse: true, companyName: name })) });
const IDS = ["AAA", "BBB", "CCC"];
const base = () => ({ prevMaster: master(IDS.map((i) => row(i))), nextMaster: master(IDS.map((i) => row(i)), { generatedAt: "2026-10-28T00:00:00Z" }), prevSummary: summary(), nextSummary: summary(), nextReconciliation: recon(),
  prevNames: names(IDS.map((i) => [i, i + " Inc"])), nextNames: names(IDS.map((i) => [i, i + " Inc"])) });
const run = (inp, o = {}) => evaluateRefresh(inp, { today: "2026-10-28", ...o });

test("SMW-4 · Gate: unveraenderter, junger Stand = SKIP (idempotent, kein Datenwachstum); alt = COMMIT; fachliche Aenderung = COMMIT", () => {
  const r = run(base());
  assert.equal(r.pass, true, JSON.stringify(r.failures)); assert.equal(r.decision, "SKIP_NO_MATERIAL_CHANGE");
  const old = base(); old.prevMaster.generatedAt = "2026-10-01T00:00:00Z";
  assert.equal(run(old).decision, "COMMIT", "spaetestens nach maxAgeDays (Frische fuer Status und Tageslauf)");
  const ch = base(); ch.nextMaster.rows[0].active_status = "INACTIVE";
  const rc = run(ch); assert.equal(rc.decision, "COMMIT"); assert.equal(rc.report.counts.deactivations, 1);
  const nm = base(); nm.nextNames.rows[1].companyName = "BBB Holdings Corp";
  const rn = run(nm); assert.equal(rn.decision, "COMMIT"); assert.equal(rn.report.names.nameChangeCount, 1);
});

test("SMW-5 · Gate fail closed: Anbieterliste, Abgleich, Mengen, Identitaet, Version, Namen, fehlende Eingaben", () => {
  const blocked = (mut, o, re) => { const x = base(); mut(x); const r = run(x, o); assert.equal(r.pass, false, re); assert.equal(r.decision, "BLOCKED"); assert.ok(r.failures.some((f) => re.test(f)), `${re} in ${JSON.stringify(r.failures)}`); };
  blocked((x) => { x.nextSummary.status = "BASELINE_ONLY"; }, {}, /^G1/);
  blocked((x) => { x.nextReconciliation.providerFetch.status = "NOT_FETCHED"; }, {}, /^G1/);
  blocked((x) => { x.nextSummary.headline.BASELINE_ACCOUNTED_FOR = 2; }, {}, /^G2/);
  blocked((x) => { x.nextReconciliation.invariants.destructiveViolations = 1; }, {}, /^G2/);
  blocked((x) => { x.nextSummary.headline.RAW_US_PROVIDER_CANDIDATES = 90000; }, {}, /^G3/);
  blocked((x) => { x.nextMaster.rowsDelivered = -60; }, {}, /^G4/);
  blocked((x) => { x.nextMaster.rows.pop(); }, {}, /^G5 1 Bestands-securityIds fehlen/);
  blocked((x) => { x.nextMaster.rows[0].baseline_security_id = "ref_aaa"; x.prevMaster.rows[0].baseline_security_id = "ref_aaa"; }, {}, /^G5 .*core\/identity/);
  blocked((x) => { x.nextMaster.rows[1].canonical_id = x.nextMaster.rows[0].canonical_id; }, {}, /^G6/);
  blocked((x) => { x.nextMaster.rows.forEach((r) => { r.active_status = "INACTIVE"; }); }, { thresholds: { maxDeactivations: 2 } }, /^G7 3 aktiv/);
  blocked((x) => { x.nextMaster.rows.forEach((r) => { r.instrument_type = "PREFERRED"; }); }, { thresholds: { maxInstrumentTypeChanges: 2 } }, /^G7 3 Instrumenttyp/);
  blocked((x) => { x.nextMaster.rows.forEach((r, k) => { r.canonical_id = `tiingo:NASDAQ:X${k}:2020-01-01`; }); }, { thresholds: { maxCanonicalIdChanges: 2 } }, /^G7 3 canonical_id/);
  blocked((x) => { x.nextMaster.rows.forEach((r) => { r.eligible_us_equity = false; }); }, { thresholds: { maxEligibilityFlips: 2 } }, /^G7 3 Eignung/);
  blocked((x) => { x.nextMaster.rows.forEach((r) => { r.ticker = r.ticker + "X"; }); }, { thresholds: { maxTickerChanges: 2 } }, /^G7 3 Tickerwechsel/);
  blocked((x) => { x.nextMaster.version = "us-security-master-1.4.0"; }, {}, /^G8/);
  blocked((x) => { x.nextNames.rows.pop(); }, {}, /^G9/);
  blocked((x) => { x.nextNames.rows.forEach((r) => { r.companyName = null; }); }, { thresholds: { maxNamesCoverageDrop: 2 } }, /^G9 Namensabdeckung/);
  blocked((x) => { x.nextNames = undefined; x.prevNames = names([]); }, {}, /^G10/);
  const none = evaluateRefresh({}, { today: "2026-10-28" }); assert.equal(none.decision, "BLOCKED");
  // bekannte Doppelung bleibt ausgewiesen, blockiert aber nicht; Versionswechsel mit ausdruecklicher Freigabe zulaessig
  const dup = base(); dup.prevMaster.rows.push(row("AAA")); dup.nextMaster.rows.push(row("AAA"));
  assert.equal(run(dup).pass, true);
  const v = base(); v.nextMaster.version = "us-security-master-1.4.0"; const rv = run(v, { allowVersionChange: true });
  assert.equal(rv.pass, true); assert.equal(rv.decision, "COMMIT");
  assert.equal(DEFAULT_THRESHOLDS.maxAgeDays, 21);
});

test("SMW-6 · Gate: Tickerwechsel, Delistings und Reaktivierungen je stabiler securityId nachvollziehbar", () => {
  const p = master([row("AAA"), row("BBB", { active_status: "INACTIVE" })]), n = master([row("AAA", { ticker: "AAB", canonical_id: "tiingo:NYSE:AAB:2026-10-01" }), row("BBB")]);
  const c = compareMasters(p, n);
  assert.deepEqual(c.tickerChanges, [{ securityId: "ref_AAA", from: "AAA", to: "AAB" }]);
  assert.equal(c.canonicalIdChanges.length, 1); assert.equal(c.reactivations.length, 1); assert.deepEqual(c.lostIds, []);
});

/* ------------------------------------------------------------- Erzeuger */
const tmp = () => mkdtempSync(join(tmpdir(), "smw-"));
const producer = (args) => spawnSync(process.execPath, [join(ROOT, "scripts/market/build-us-security-master.mjs"), ...args], { encoding: "utf8", cwd: ROOT });

test("SMW-7 · Erzeuger: --require-provider bricht ohne Anbieterliste ab (Exit 3), schreibt nichts; ungueltiger --stamp Exit 2", () => {
  const d = tmp();
  try {
    const r = producer(["--offline", "--require-provider", "--out", join(d, "out"), "--work-dir", join(d, "work")]);
    assert.equal(r.status, 3, r.stderr + r.stdout);
    assert.ok(!existsSync(join(d, "out")) || readdirSync(join(d, "out")).length === 0, "nichts geschrieben");
    assert.ok(!existsSync(join(d, "work")) || readdirSync(join(d, "work")).length === 0);
    assert.equal(producer(["--offline", "--stamp", "gestern", "--out", join(d, "o2")]).status, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("SMW-8 · Erzeuger: derselbe Lauf mit derselben Anbieterliste und --stamp ergibt bitgleiche Dateien (idempotent)", () => {
  const d = tmp();
  try {
    const m = JSON.parse(readFileSync(join(ROOT, SM, "us-security-master.json"), "utf8"));
    const csv = ["ticker,exchange,assetType,priceCurrency,startDate,endDate", ...m.rows.map((r) => [r.ticker, r.exchange || "", r.asset_type || "", r.currency || "", r.start_date || "", r.end_date || ""].join(","))].join("\n") + "\n";
    writeFileSync(join(d, "list.csv"), csv);
    const out = join(d, "out"), work = join(d, "work");
    const args = ["--from-csv", join(d, "list.csv"), "--require-provider", "--today", "2026-10-28", "--stamp", "2026-10-28T00:00:00Z", "--out", out, "--work-dir", work];
    assert.equal(producer(args).status, 0);
    const first = Object.fromEntries(readdirSync(out).sort().map((f) => [f, readFileSync(join(out, f), "utf8")]));
    assert.equal(producer(args).status, 0);
    for (const f of Object.keys(first)) assert.equal(readFileSync(join(out, f), "utf8"), first[f], `${f} bitgleich`);
    const s = JSON.parse(first["summary.json"]); assert.equal(s.status, "OK"); assert.equal(s.generatedAt, "2026-10-28T00:00:00Z");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
