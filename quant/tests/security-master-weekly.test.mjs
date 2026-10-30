// Wöchentliche Aktualisierung von US-Wertpapierstamm und Firmennamen (vorbereitet, Zeitplan aus):
// Workflow-Abschaltung und ADR-005, Übernahme-Gate (fail closed), Erzeuger fail closed und idempotent.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { evaluateRefresh, compareMasters, DEFAULT_THRESHOLDS, APPROVED_CHANGES_SCHEMA, APPROVED_DRIFT_SCHEMA } from "../../scripts/market/security-master-refresh-gate.mjs";
import { buildDriftEvidence, canonicalClass } from "../../scripts/market/security-master-drift-evidence.mjs";

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
  // Review: ungueltige Grenzen und fehlende Zeilen blockieren statt still durchzulassen
  for (const bad of [{ maxDeactivations: "x" }, { maxAgeDays: null }, { maxRowsDrop: -1 }, { maxNameChanges: Infinity }]) blocked(() => {}, { thresholds: bad }, /^G10 ungültige Grenzen/);
  blocked((x) => { delete x.prevMaster.rowsDelivered; }, {}, /^G10 Stamm/);
  blocked((x) => { x.nextMaster.rows = null; }, {}, /^G10 Stamm/);
  // CLI: jeder Ausgang schreibt eine Entscheidung, auch bei unlesbaren Grenzen und einer Ausnahme
  const d = mkdtempSync(join(tmpdir(), "smw-gate-"));
  try {
    const gate = (args) => { const out = join(d, "out-" + Math.random().toString(36).slice(2)); writeFileSync(out, ""); const r = spawnSync(process.execPath, [join(ROOT, "scripts/market/security-master-refresh-gate.mjs"), ...args], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: out } }); return { status: r.status, output: readFileSync(out, "utf8") }; };
    writeFileSync(join(d, "t.json"), "nicht json");
    for (const args of [["--prev", d, "--next", d], ["--prev", d, "--next", d, "--thresholds", join(d, "t.json")]]) {
      const r = gate(args); assert.equal(r.status, 4); assert.equal(r.output, "decision=BLOCKED\n");
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
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

// ── G7-Sonderfreigabe für den einmaligen Klassifiziererwechsel (Owner P1/P3, 28.10.2026) ─────────────────────────────
const SHA = "a".repeat(64);
const approval = (over = {}) => ({ schema: APPROVED_CHANGES_SCHEMA, fromVersion: "us-security-master-1.1.0", toVersion: "us-security-master-1.3.0", prevMasterSha256: SHA,
  instrumentTypeChanges: [], eligibilityFlips: [], ...over });
// 30 Vorzugsaktien wechseln den Typ und verlieren die Eignung: ohne Freigabe über G7 (25), mit genau dieser Freigabe zulässig
const switchCase = () => {
  const ids = Array.from({ length: 30 }, (_, i) => `P${String(i).padStart(2, "0")}`);
  const x = base();
  x.prevMaster = master([...IDS, ...ids].map((i) => row(i)), { version: "us-security-master-1.1.0" });
  x.nextMaster = master([...IDS.map((i) => row(i)), ...ids.map((i) => row(i, { instrument_type: "PREFERRED", eligible_us_equity: false }))], { generatedAt: "2026-10-28T00:00:00Z" });
  x.prevSummary = summary(33); x.nextSummary = summary(33);
  const ok = approval({ instrumentTypeChanges: ids.map((i) => ({ securityId: `ref_${i}`, from: "EQUITY_COMMON", to: "PREFERRED" })), eligibilityFlips: ids.map((i) => ({ securityId: `ref_${i}`, from: true, to: false })) });
  return { x, ids, ok };
};

test("SMW-9 · Sonderfreigabe: nimmt genau die belegten Wechsel aus G7, gebunden an Version und Ausgangsstamm; keine generelle Lockerung", () => {
  const { x, ids, ok } = switchCase(), o = { allowVersionChange: true, prevMasterSha256: SHA };
  // ohne Freigabe: G7 für Typ und Eignung
  const plain = run(x, { allowVersionChange: true });
  assert.equal(plain.pass, false); assert.deepEqual(plain.failures.filter((f) => /^G7/.test(f)), ["G7 30 Instrumenttyp-Wechsel (Grenze 25)"]);
  // mit genau dieser Freigabe: zulässig, Zählung bleibt im Bericht vollständig
  const r = run(x, { ...o, approvedChanges: ok });
  assert.equal(r.pass, true, r.failures.join("|")); assert.equal(r.decision, "COMMIT");
  assert.equal(r.report.counts.instrumentTypeChanges, 30); assert.equal(r.report.counts.eligibilityFlips, 30);
  assert.deepEqual(r.report.approval.applied, { instrumentTypeChanges: 30, eligibilityFlips: 30 });
  assert.deepEqual(r.report.approval.unused, { instrumentTypeChanges: 0, eligibilityFlips: 0 });
  const fails = (approved, opts = o) => { const z = run(x, { ...opts, approvedChanges: approved }); assert.equal(z.pass, false); return z.failures.join("|"); };
  // Bindung: Versionsfreigabe, Quell-/Zielversion, SHA-256, Schema
  assert.match(fails(ok, { prevMasterSha256: SHA }), /G8 Sonderfreigabe nur zusammen/);
  assert.match(fails({ ...ok, fromVersion: "us-security-master-1.2.0" }), /G8 Sonderfreigabe gilt für/);
  assert.match(fails({ ...ok, toVersion: "us-security-master-1.4.0" }), /G8 Sonderfreigabe gilt für/);
  assert.match(fails(ok, { allowVersionChange: true, prevMasterSha256: "b".repeat(64) }), /anderen Ausgangsstamm/);
  assert.match(fails(ok, { allowVersionChange: true, prevMasterSha256: null }), /anderen Ausgangsstamm/);
  assert.match(fails({ ...ok, schema: "x" }), /G10 Sonderfreigabe/);
  assert.match(fails({ ...ok, eligibilityFlips: null }), /G10 Sonderfreigabe/);
  // Einträge streng: kein Umdeuten von Typen, keine Doppelungen
  assert.match(fails({ ...ok, eligibilityFlips: ok.eligibilityFlips.map((c) => ({ ...c, from: "true" })) }), /G10 Sonderfreigabe: ungültiger Eintrag/);
  assert.match(fails({ ...ok, instrumentTypeChanges: ok.instrumentTypeChanges.map((c) => ({ ...c, to: ["PREFERRED"] })) }), /G10 Sonderfreigabe: ungültiger Eintrag/);
  assert.match(fails({ ...ok, instrumentTypeChanges: [...ok.instrumentTypeChanges, ok.instrumentTypeChanges[0]] }), /G10 Sonderfreigabe: doppelte securityId/);
  assert.match(fails({ ...ok, instrumentTypeChanges: [...ok.instrumentTypeChanges, null] }), /G10 Sonderfreigabe: ungültiger Eintrag/);
  // exakt (securityId, from, to): anderes Ziel oder andere Richtung zählt weiter
  const wrongTo = { ...ok, instrumentTypeChanges: ok.instrumentTypeChanges.map((c) => ({ ...c, to: "TEST_SECURITY" })) };
  assert.match(fails(wrongTo), /^G7 30 .*ohne die freigegebenen/m);
  const wrongDir = { ...ok, eligibilityFlips: ok.eligibilityFlips.map((c) => ({ ...c, from: false, to: true })) };
  const rw = run(x, { ...o, approvedChanges: wrongDir }); // 30 ungedeckte Eignungswechsel zählen wieder (Grenze 50 → hier noch zulässig)
  assert.deepEqual(rw.report.approval.applied.eligibilityFlips, 0); assert.equal(rw.report.approval.unused.eligibilityFlips, 30);
  assert.match(fails(wrongDir, { ...o, thresholds: { ...DEFAULT_THRESHOLDS, maxEligibilityFlips: 25 } }), /G7 30 Eignungswechsel \(Grenze 25, ohne die freigegebenen\)/);
  // nicht belegte Wechsel zählen gegen die unveränderten Grenzen: 5 freigegebene weniger → 25 bleiben zulässig, 4 weniger → 26 blockiert
  const part = (n) => ({ ...ok, instrumentTypeChanges: ok.instrumentTypeChanges.slice(n), eligibilityFlips: ok.eligibilityFlips.slice(n) });
  assert.equal(run(x, { ...o, approvedChanges: part(25) }).pass, true);
  assert.match(fails(part(26)), /G7 26/);
  // andere Wechselarten bleiben unberührt (z. B. Deaktivierungen über der Grenze)
  const y = switchCase(); for (const i of ids) y.x.nextMaster.rows.find((r) => r.ticker === i).active_status = "DELISTED";
  const rd = run(y.x, { ...o, approvedChanges: y.ok, thresholds: { ...DEFAULT_THRESHOLDS, maxDeactivations: 25 } });
  assert.equal(rd.pass, false); assert.ok(rd.failures.some((f) => /^G7 30/.test(f) && !/ohne die freigegebenen/.test(f)), rd.failures.join("|"));
  // Wiederverwendung im nächsten Wochenlauf (gleiche Version): G8
  const again = switchCase(); again.x.prevMaster.version = "us-security-master-1.3.0";
  const ra = run(again.x, { ...o, approvedChanges: again.ok });
  assert.equal(ra.pass, false); assert.ok(ra.failures.some((f) => /G8 Sonderfreigabe gilt für/.test(f)), ra.failures.join("|"));
  // Grenzen selbst unverändert
  assert.deepEqual([DEFAULT_THRESHOLDS.maxInstrumentTypeChanges, DEFAULT_THRESHOLDS.maxEligibilityFlips], [25, 50]);
});

test("SMW-10 · Goldener Fall am committeten Stamm: 1.1.0 → 1.3.0 = 138 Typ- und 138 Eignungswechsel, Freigabedatei deckt genau diese ab", async (t) => {
  const { reclassify, buildEvidence, approvedChanges, listsMarkdown } = await import("../../scripts/market/security-master-v130-evidence.mjs");
  const bytes = readFileSync(join(ROOT, SM, "us-security-master.json")), prev = JSON.parse(bytes.toString("utf8"));
  const committed = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-approved-changes.json"), "utf8"));
  const { createHash } = await import("node:crypto"), sha = createHash("sha256").update(bytes).digest("hex");
  if (committed.prevMasterSha256 !== sha) return t.skip("Stamm seit der Freigabe geändert: sie gilt dann ohnehin nicht mehr (G8)");
  const next = reclassify(prev, JSON.parse(readFileSync(join(ROOT, "quant/data/market/scale/universe-FULL_UNIVERSE.json"), "utf8")).securities);
  const ev = buildEvidence({ prevBytes: bytes, prev, next });
  assert.equal(ev.counts.instrumentTypeChanges, 138); assert.equal(ev.counts.eligibilityFlips, 138);
  assert.equal(ev.counts.canonicalIdChanges, 0); assert.equal(ev.counts.backtestable.lost, 127); assert.equal(ev.counts.backtestable.gained, 0);
  assert.deepEqual(approvedChanges(ev), committed, "Freigabedatei = Erzeugerausgabe");
  // Nachweis und Listen sind ein datierter Stand (Langreihen, Eignung und Fundstellen wachsen mit den Datenläufen); aus Stamm
  // und Engine reproduzierbar und hier verglichen sind die Wechsel selbst und die Menge der entfallenden IDs
  const snap = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-switch-evidence.json"), "utf8"));
  assert.equal(snap.inputs.masterSha256, sha);
  assert.deepEqual(snap.instrumentTypeChanges, JSON.parse(JSON.stringify(ev.instrumentTypeChanges)));
  assert.deepEqual(snap.eligibilityFlips, JSON.parse(JSON.stringify(ev.eligibilityFlips)));
  assert.deepEqual(snap.backtestableLost.map((x) => x.securityId), ev.backtestableLost.map((x) => x.securityId));
  assert.ok(typeof listsMarkdown(ev) === "string");
  assert.ok(ev.backtestableLost.every((x) => x.identityConsistent && !x.inDiscoverUniverse));
  const cmp = compareMasters(prev, next);
  assert.equal(cmp.instrumentTypeChanges.length, 138); assert.ok(cmp.eligibilityFlips.every((f) => f.from === true && f.to === false));
});

test("SMW-11 · Zählabgleich 138 / 127 / 133 aus den committeten Eingaben reproduzierbar (Erzeugerausgabe = committete Datei)", async (t) => {
  const { reclassify, countReconciliation } = await import("../../scripts/market/security-master-v130-evidence.mjs");
  const bytes = readFileSync(join(ROOT, SM, "us-security-master.json")), prev = JSON.parse(bytes.toString("utf8"));
  const committed = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-count-reconciliation.json"), "utf8"));
  const { createHash } = await import("node:crypto");
  if (committed.inputs.masterSha256 !== createHash("sha256").update(bytes).digest("hex")) return t.skip("Stamm seit dem Nachweis geändert (G8)");
  const next = reclassify(prev, JSON.parse(readFileSync(join(ROOT, "quant/data/market/scale/universe-FULL_UNIVERSE.json"), "utf8")).securities);
  const rec = countReconciliation({ prevBytes: bytes, prev, next });
  assert.deepEqual(rec, committed, "Abgleich = Erzeugerausgabe");
  // je securityId (Gate): 138 Typ, 138 Eignung, dieselben IDs; je Zeile: 149 Typzeilen (11 inaktive Zweitzeilen), 138 Eignungszeilen
  assert.equal(rec.perSecurityId.instrumentTypeChanges, 138); assert.equal(rec.perSecurityId.eligibilityFlips, 138); assert.equal(rec.perSecurityId.sameIdsForTypeAndEligibility, true);
  assert.equal(rec.perRow.instrumentTypeRowChanges, 149); assert.equal(rec.perRow.eligibilityRowsTrueToFalse, 138); assert.equal(rec.perRow.eligibilityRowsFalseToTrue, 0); assert.equal(rec.perRow.unpairedRows, 0);
  // zwei verschiedene 127: → PREFERRED (116 + 11 Zwei-Zeilen-IDs) und entfallend backtestfähig (116 PREFERRED + 11 TEST_SECURITY)
  assert.equal(rec.twoDifferent127.equityCommonToPreferredIds, 127); assert.equal(rec.twoDifferent127.backtestableLost, 127); assert.equal(rec.twoDifferent127.overlap, 116);
  // die frühere Angabe 133 ist aus keiner dieser Zählungen reproduzierbar; ihre eigene Herleitung ergibt 137
  assert.equal(rec.claim133.reproducibleFromCommittedInputs, false); assert.equal(rec.claim133.derivationArithmetic, 137);
});

// ── Nachholdrift seit dem letzten Stand (Schema 1.1.0): nur die vorsichtige Richtung, Liste für Liste ───────────────
// Fall: Wechsel wie SMW-9 und zusätzlich 60 Delistings, 30 canonical_id-Wechsel, 1 neue Doppelung, 210 gefüllte Namen.
const driftCase = () => {
  const { x, ids, ok } = switchCase();
  const dl = Array.from({ length: 60 }, (_, i) => `D${String(i).padStart(2, "0")}`), cn = Array.from({ length: 30 }, (_, i) => `C${String(i).padStart(2, "0")}`);
  const nm = Array.from({ length: 210 }, (_, i) => `N${String(i).padStart(3, "0")}`);
  const all = [...dl, ...cn, ...nm];
  x.prevMaster.rows.push(...all.map((i) => row(i)));
  x.nextMaster.rows.push(...dl.map((i) => row(i, { active_status: "INACTIVE", eligible_us_equity: false })), ...cn.map((i) => row(i, { canonical_id: `tiingo:NASDAQ:${i}:2000-01-01` })), ...nm.map((i) => row(i)));
  x.nextMaster.rows.push(row("AAA", { active_status: "INACTIVE", eligible_us_equity: false })); // zweite Zeile, gleiche canonical_id
  x.prevMaster.rowsDelivered = x.prevMaster.rows.length; x.nextMaster.rowsDelivered = x.nextMaster.rows.length;
  const n = 33 + all.length; x.prevSummary = summary(n); x.nextSummary = summary(n);
  x.prevNames = names([...IDS.map((i) => [i, i + " Inc"]), ...nm.map((i) => [i, null])]); x.nextNames = names([...IDS.map((i) => [i, i + " Inc"]), ...nm.map((i) => [i, i + " Corp"])]);
  for (const r of x.nextNames.rows) if (/^ref_N/.test(r.securityId)) r.nameSource = "SEC_COMPANY_TICKERS";
  const drift = { schema: APPROVED_DRIFT_SCHEMA, fromVersion: "us-security-master-1.1.0", toVersion: "us-security-master-1.3.0", prevMasterSha256: SHA, measuredOn: "2026-10-30",
    instrumentTypeChanges: [], eligibilityFlips: dl.map((i) => ({ securityId: `ref_${i}`, from: true, to: false })),
    canonicalIdChanges: cn.map((i) => ({ securityId: `ref_${i}`, from: `tiingo:NYSE:${i}:2000-01-01`, to: `tiingo:NASDAQ:${i}:2000-01-01` })),
    deactivations: dl.map((i) => ({ securityId: `ref_${i}` })), nameChanges: nm.map((i) => ({ securityId: `ref_${i}`, from: null, to: i + " Corp" })),
    newDuplicateCanonicalIds: ["tiingo:NYSE:AAA:2000-01-01"] };
  return { x, ids, ok, drift, dl, cn, nm };
};

test("SMW-12 · Nachholfreigabe 1.1.0: nur Wechsel in vorsichtiger Richtung, gebunden wie v130, nie Reaktivierung, neue Eignung, Ticker oder IDs", () => {
  const { x, ok, drift } = driftCase(), o = { allowVersionChange: true, prevMasterSha256: SHA };
  const only = run(x, { ...o, approvedChanges: ok });
  assert.equal(only.pass, false);
  for (const re of [/^G6 1 neue doppelte/, /^G7 30 canonical_id/, /^G7 60 aktiv/, /^G7 60 Eignungswechsel/, /^G9 210 Namenswechsel/]) assert.ok(only.failures.some((f) => re.test(f)), `${re} in ${only.failures.join("|")}`);
  const both = run(x, { ...o, approvedChanges: [ok, drift] });
  assert.equal(both.pass, true, both.failures.join("|")); assert.equal(both.decision, "COMMIT");
  assert.deepEqual(both.report.approval.applied, { instrumentTypeChanges: 30, eligibilityFlips: 90, canonicalIdChanges: 30, deactivations: 60, nameChanges: 210, newDuplicateCanonicalIds: 1 });
  assert.equal(both.report.counts.deactivations, 60, "Bericht zählt weiter vollständig"); assert.equal(both.report.approval.files.length, 2);
  const fails = (approved, opts = o) => { const z = run(x, { ...opts, approvedChanges: approved }); assert.equal(z.pass, false); return z.failures.join("|"); };
  // jede Datei einzeln gebunden
  assert.match(fails([ok, { ...drift, prevMasterSha256: "c".repeat(64) }]), /nur zusammen mit der Sonderfreigabe des Klassifiziererwechsels/);
  assert.match(fails([ok, { ...drift, toVersion: "us-security-master-1.4.0" }]), /nur zusammen mit der Sonderfreigabe des Klassifiziererwechsels/);
  // Nachholdrift allein, zwei v130-Dateien, leere Liste
  assert.match(fails(drift), /G8 Nachholfreigabe nur zusammen/); assert.match(fails([drift]), /G8 Nachholfreigabe nur zusammen/);
  assert.match(fails([ok, ok]), /mehr als eine Datei mit Schema 1\.0\.0/); assert.match(fails([]), /G10 Sonderfreigabe: leere Liste/);
  // Schlüssel eindeutig: „A|B → A“ (Listing entfällt) deckt nicht „A → B|A“ (neues Listing); Name „∅“ ist nicht null
  const z = driftCase();
  for (const r of z.x.nextMaster.rows) if (/^C\d\d$/.test(r.ticker)) r.canonical_id = `tiingo:NYSE:${r.ticker}:2000-01-01`;
  z.x.nextMaster.rows.push(...z.cn.map((i) => row(i, { canonical_id: `tiingo:NYSE:${i}:2026-01-01`, active_status: "INACTIVE", eligible_us_equity: false })));
  const forged = { ...z.drift, canonicalIdChanges: z.cn.map((i) => ({ securityId: `ref_${i}`, from: `tiingo:NYSE:${i}:2000-01-01|tiingo:NYSE:${i}:2026-01-01`, to: `tiingo:NYSE:${i}:2000-01-01` })) };
  const rz = run(z.x, { ...o, approvedChanges: [z.ok, forged] });
  assert.equal(rz.pass, false); assert.ok(rz.failures.some((f) => /^G7 30 canonical_id-Wechsel/.test(f)), rz.failures.join("|"));
  assert.equal(rz.report.approval.applied.canonicalIdChanges, 0);
  const nul = { ...drift, nameChanges: drift.nameChanges.map((n) => ({ ...n, from: "\u2205" })) };
  assert.match(fails([ok, nul]), /^G9 210 Namenswechsel/m);
  assert.match(fails([ok, { ...drift, deactivations: [{ securityId: "ref_D00", ticker: "WRONG" }] }]), /ungültiger Eintrag in deactivations/);
  assert.match(fails([ok, drift], { prevMasterSha256: SHA }), /G8 Sonderfreigabe nur zusammen/);
  // nicht freigebbare Arten und falsche Richtung
  for (const k of ["reactivations", "tickerChanges", "newIds", "lostIds"]) assert.match(fails([ok, { ...drift, [k]: [] }]), /G10 Sonderfreigabe: nicht freigebbare Art/);
  assert.match(fails([ok, { ...drift, eligibilityFlips: [{ securityId: "ref_D00", from: false, to: true }] }]), /G10 Sonderfreigabe: ungültiger Eintrag in eligibilityFlips/);
  assert.match(fails([ok, { ...drift, deactivations: [{ securityId: "ref_D00", to: "ACTIVE" }] }]), /ungültiger Eintrag in deactivations/);
  assert.match(fails([ok, { ...drift, nameChanges: [{ securityId: "ref_N000", from: "x", to: null }] }]), /ungültiger Eintrag in nameChanges/);
  // v130 (1.0.0) kann die neuen Arten nicht tragen
  assert.match(fails({ ...ok, deactivations: [] }), /nicht freigebbare Art deactivations/);
  // dieselbe ID in zwei Dateien derselben Art
  assert.match(fails([ok, { ...drift, eligibilityFlips: [...drift.eligibilityFlips, ok.eligibilityFlips[0]] }]), /doppelte securityId ref_P00 in eligibilityFlips/);
  // exakt: anderer Zielname, andere canonical_id zählen weiter
  const shifted = { ...drift, canonicalIdChanges: drift.canonicalIdChanges.map((c) => ({ ...c, to: c.to.replace("NASDAQ", "AMEX") })) };
  assert.match(fails([ok, shifted]), /^G7 30 canonical_id-Wechsel \(Grenze 25, ohne die freigegebenen\)/m);
  assert.match(fails([ok, { ...drift, newDuplicateCanonicalIds: [] }]), /^G6 1 neue doppelte/m);
  // Teilfreigabe: 10 Delistings weniger freigegeben → 10 zählen, Grenze 50 hält; bei Grenze 5 blockiert
  const part = { ...drift, deactivations: drift.deactivations.slice(10) };
  assert.equal(run(x, { ...o, approvedChanges: [ok, part] }).pass, true);
  assert.match(fails([ok, part], { ...o, thresholds: { ...DEFAULT_THRESHOLDS, maxDeactivations: 5 } }), /G7 10 aktiv → inaktiv \(Delistings\) \(Grenze 5, ohne die freigegebenen\)/);
  // Grenzen unverändert
  assert.deepEqual(DEFAULT_THRESHOLDS, { maxProviderRowChangePct: 5, maxRowsDrop: 50, maxCanonicalIdChanges: 25, maxInstrumentTypeChanges: 25, maxDeactivations: 50, maxEligibilityFlips: 50, maxTickerChanges: 25, maxNamesCoverageDrop: 20, maxNameChanges: 200, maxAgeDays: 21 });
});

test("SMW-13 · Drift-Nachweis: Klassen, Identitätsbefund ohne Freigabe, Doppelung nur auf ausdrücklichen Wunsch, Namen nach P5", () => {
  const { x, ok, dl } = driftCase();
  // D00: eigene Reihe läuft nach dem Anbieterende weiter (Tickerwiederverwendung) → Identitätsbefund
  for (const r of x.nextMaster.rows) if (/^D\d\d$/.test(r.ticker)) r.end_date = "2026-09-01";
  const ends = { ref_D00: "2026-10-29", ref_D01: "2026-08-31", ref_D02: "UNREADABLE" };
  x.prevNames.rows.push({ securityId: "ref_CUR", inProductUniverse: true, companyName: "Curated Name", nameSource: "VU_CURATED" }, { securityId: "ref_TII", inProductUniverse: true, companyName: "Sec Name", nameSource: "SEC_COMPANY_TICKERS" });
  x.nextNames.rows.push({ securityId: "ref_CUR", inProductUniverse: true, companyName: "Curated Name Inc.", nameSource: "SEC_COMPANY_TICKERS" }, { securityId: "ref_TII", inProductUniverse: true, companyName: "Tiingo Name", nameSource: "TIINGO_METADATA" });
  const mk = (includeDuplicates) => buildDriftEvidence({ prevMaster: x.prevMaster, nextMaster: x.nextMaster, prevNames: x.prevNames, nextNames: x.nextNames, v130: ok, seriesEnd: (id) => ends[id] ?? null, measuredOn: "2026-10-30", prevMasterSha256: SHA, nextMasterSha256: "d".repeat(64), includeDuplicates });
  const { evidence, approved } = mk(false);
  assert.deepEqual(evidence.identityReview, ["ref_D00", "ref_D02"], "weiterlaufende und unlesbare Reihe");
  assert.equal(evidence.counts.deactivations.SERIES_CONTINUES_AFTER_PROVIDER_END, 1); assert.equal(evidence.counts.deactivations.SERIES_UNREADABLE, 1); assert.equal(evidence.counts.deactivations.SERIES_ENDS_WITH_PROVIDER, 1); assert.equal(evidence.counts.deactivations.NO_PRODUCT_SERIES, dl.length - 3);
  for (const id of ["ref_D00", "ref_D02"]) { assert.ok(!approved.deactivations.some((d) => d.securityId === id)); assert.ok(!approved.eligibilityFlips.some((d) => d.securityId === id)); }
  assert.equal(approved.deactivations.length, dl.length - 2);
  // Tickerwiederverwendung (neue Zeile unter derselben securityId) nur mit includeTickerReuse
  const y = driftCase(); y.x.nextMaster.rows.push(row("C00", { canonical_id: "tiingo:NASDAQ:C00:2026-06-23", active_status: "INACTIVE", eligible_us_equity: false }));
  const mkY = (includeTickerReuse) => buildDriftEvidence({ prevMaster: y.x.prevMaster, nextMaster: y.x.nextMaster, prevNames: y.x.prevNames, nextNames: y.x.nextNames, v130: y.ok, seriesEnd: () => null, measuredOn: "2026-10-30", prevMasterSha256: SHA, nextMasterSha256: "d".repeat(64), includeTickerReuse });
  assert.deepEqual(mkY(false).evidence.tickerReuse, ["ref_C00"]);
  assert.ok(!mkY(false).approved.canonicalIdChanges.some((c) => c.securityId === "ref_C00")); assert.ok(mkY(true).approved.canonicalIdChanges.some((c) => c.securityId === "ref_C00"));
  assert.ok(approved.eligibilityFlips.every((e) => e.from === true && e.to === false)); assert.ok(!approved.eligibilityFlips.some((e) => /^ref_P/.test(e.securityId)), "v130-Wechsel nicht doppelt");
  assert.deepEqual(approved.newDuplicateCanonicalIds, []); assert.deepEqual(mk(true).approved.newDuplicateCanonicalIds, ["tiingo:NYSE:AAA:2000-01-01"]);
  const cls = Object.fromEntries(evidence.lists.nameChanges.map((n) => [n.securityId, n.class]));
  assert.equal(cls.ref_CUR, "CURATED_NAME_REPLACED"); assert.equal(cls.ref_TII, "SWITCH_TO_TIINGO_METADATA"); assert.equal(cls.ref_N000, "NAME_GAP_FILLED");
  assert.ok(!approved.nameChanges.some((n) => n.securityId === "ref_CUR" || n.securityId === "ref_TII"));
  assert.equal(approved.schema, APPROVED_DRIFT_SCHEMA); assert.equal(approved.prevMasterSha256, SHA);
  // Gate mit dieser Freigabe: der Identitätsbefund zählt (1 ≤ 50), die Doppelung blockiert ohne ausdrücklichen Wunsch
  const r = run(x, { allowVersionChange: true, prevMasterSha256: SHA, approvedChanges: [ok, approved] });
  assert.deepEqual(r.failures, ["G6 1 neue doppelte canonical_id (z. B. tiingo:NYSE:AAA:2000-01-01)"]);
  assert.equal(run(x, { allowVersionChange: true, prevMasterSha256: SHA, approvedChanges: [ok, mk(true).approved] }).pass, true);
  // Klassen der canonical_id
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:NYSE:A:2000-01-01|tiingo:NYSE:A:2026-06-23"), "NEW_LISTING_SAME_TICKER");
  assert.equal(canonicalClass("tiingo:NYSE MKT:A:2000-01-01", "tiingo:OTCMKTS:A:2000-01-01"), "MOVED_TO_OTC");
  assert.equal(canonicalClass("tiingo:AMEX:A:2000-01-01", "tiingo:NYSE MKT:A:2000-01-01"), "EXCHANGE_LABEL");
  assert.equal(canonicalClass("tiingo:NYSE:A:2000-01-01", "tiingo:NYSE:A:2001-01-01"), "START_DATE_REVISION");
});

test("SMW-14 · Committete Nachholfreigabe: an den committeten Stamm gebunden, nur vorsichtige Richtung, Workflow nur mit approved_changes", () => {
  const d = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/drift-approved-changes.json"), "utf8"));
  const v = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-approved-changes.json"), "utf8"));
  assert.equal(d.schema, APPROVED_DRIFT_SCHEMA); assert.equal(d.prevMasterSha256, v.prevMasterSha256); assert.equal(d.fromVersion, v.fromVersion); assert.equal(d.toVersion, v.toVersion);
  assert.ok(d.eligibilityFlips.every((x) => x.from === true && x.to === false));
  for (const k of ["reactivations", "tickerChanges", "newIds", "lostIds"]) assert.equal(k in d, false, k);
  const ev = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/drift-evidence.json"), "utf8"));
  const review = new Set(ev.identityReview);
  for (const k of ["deactivations", "eligibilityFlips", "canonicalIdChanges", "instrumentTypeChanges"]) assert.ok(d[k].every((x) => !review.has(x.securityId)), `${k} ohne Identitätsbefund`);
  const reuse = new Set(ev.tickerReuse);
  if (!ev.includeTickerReuse) for (const k of ["canonicalIdChanges", "instrumentTypeChanges", "eligibilityFlips"]) assert.ok(d[k].every((x) => !reuse.has(x.securityId)), `${k} ohne Tickerwiederverwendung`);
  const src = new Map(ev.lists.nameChanges.map((n) => [n.securityId, n]));
  assert.ok(d.nameChanges.every((n) => src.get(n.securityId)?.source === "SEC_COMPANY_TICKERS" && !review.has(n.securityId)), "Namen nur aus SEC, ohne Identitätsbefund (P5)");
  const v130 = new Set(v.eligibilityFlips.map((x) => x.securityId));
  assert.ok(d.eligibilityFlips.every((x) => !v130.has(x.securityId)), "keine Doppelung mit v130");
  const wf = code();
  assert.match(wf, /IN_DRIFT: \$\{\{ inputs\.approved_drift \}\}/);
  assert.match(wf, /if \[ "\$IN_APPROVED" != "true" \]; then echo "::error::approved_drift nur zusammen mit approved_changes"; exit 4; fi/);
  if (readFileSync(join(ROOT, SM, "us-security-master.json")).length && createHash("sha256").update(readFileSync(join(ROOT, SM, "us-security-master.json"))).digest("hex") === d.prevMasterSha256) {
    assert.equal(ev.prev.sha256, d.prevMasterSha256, "Nachweis zum committeten Stamm");
  }
});
