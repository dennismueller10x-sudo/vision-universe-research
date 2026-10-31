// Sonderfreigabe security-master-approved-changes-1.1.0 (Owner-Entscheidung 30.10.2026): exakte, quellengebundene Listen
// für alle G6/G7/G9-Arten, gleiche Bindung wie 1.0.0, Grenzen unverändert; 1.0.0 verhält sich byte-gleich.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { evaluateRefresh, DEFAULT_THRESHOLDS, APPROVED_CHANGES_SCHEMA, APPROVED_CHANGES_SCHEMA_V11 } from "../../scripts/market/security-master-refresh-gate.mjs";
import { buildApprovalList, classifyCanonical, secCheck, indexSec, listsMarkdown } from "../../scripts/market/build-security-master-approval-list.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = "a".repeat(64);
const row = (id, over = {}) => ({ ticker: id, canonical_id: `tiingo:NYSE:${id}:2000-01-01`, exchange: "NYSE", instrument_type: "EQUITY_COMMON", active_status: "ACTIVE", start_date: "2000-01-01", end_date: "2026-10-27", eligible_us_equity: true, baseline_member: true, baseline_security_id: `ref_${id}`, ...over });
const master = (rows, over = {}) => ({ version: "us-security-master-1.3.0", generatedAt: "2026-10-28T00:00:00Z", today: "2026-10-28", rowsDelivered: rows.length, rows, ...over });
const summary = (n, raw = 100000) => ({ status: "OK", headline: { BASELINE_COUNT: n, BASELINE_ACCOUNTED_FOR: n, RAW_US_PROVIDER_CANDIDATES: raw, NEW_ELIGIBLE_ADDITIONS: 0 } });
const recon = () => ({ providerFetch: { status: "FETCHED" }, invariants: { destructiveViolations: 0 } });
const names = (ids, f) => ({ rows: ids.map((i) => ({ securityId: `ref_${i}`, ticker: i, inProductUniverse: true, companyName: f(i) })) });

// ── 1.0.0 byte-gleich: deterministische Szenarien, Hash mit dem Gate vor der Erweiterung (main adbc2f0444) gebildet ──────
function legacyScenarios() {
  const keep = ["AAA", "BBB", "CCC"], pref = Array.from({ length: 30 }, (_, i) => `P${String(i).padStart(2, "0")}`), gone = Array.from({ length: 4 }, (_, i) => `D${i}`);
  const all = [...keep, ...pref, ...gone];
  const r = (id, over = {}) => ({ ticker: id, canonical_id: `tiingo:NYSE:${id}:2000-01-01`, exchange: "NYSE", instrument_type: "EQUITY_COMMON", active_status: "ACTIVE", eligible_us_equity: true, baseline_member: true, baseline_security_id: `ref_${id}`, ...over });
  const m = (rows, over = {}) => ({ version: "us-security-master-1.3.0", generatedAt: "2026-10-21T00:00:00Z", rowsDelivered: rows.length, rows, ...over });
  const nm = (ids, suffix) => ({ rows: ids.map((i) => ({ securityId: `ref_${i}`, inProductUniverse: true, companyName: `${i} ${suffix}` })) });
  const inputs = () => ({
    prevMaster: m(all.map((i) => r(i)), { version: "us-security-master-1.1.0" }),
    nextMaster: m([...keep.map((i) => r(i)), ...pref.map((i) => r(i, { instrument_type: "PREFERRED", eligible_us_equity: false })), ...gone.map((i) => r(i, { active_status: "INACTIVE", eligible_us_equity: false }))], { generatedAt: "2026-10-28T00:00:00Z" }),
    prevSummary: summary(all.length), nextSummary: summary(all.length), nextReconciliation: recon(), prevNames: nm(all, "Inc"), nextNames: nm(all, "Inc"),
  });
  const ok = { schema: "security-master-approved-changes-1.0.0", fromVersion: "us-security-master-1.1.0", toVersion: "us-security-master-1.3.0", prevMasterSha256: SHA,
    instrumentTypeChanges: pref.map((i) => ({ securityId: `ref_${i}`, from: "EQUITY_COMMON", to: "PREFERRED" })), eligibilityFlips: pref.map((i) => ({ securityId: `ref_${i}`, from: true, to: false })) };
  const o = { today: "2026-10-28", allowVersionChange: true, prevMasterSha256: SHA };
  const cases = [
    ["exact", ok, o],
    ["partial", { ...ok, instrumentTypeChanges: ok.instrumentTypeChanges.slice(4), eligibilityFlips: ok.eligibilityFlips.slice(10) }, o],
    ["wrongDirection", { ...ok, eligibilityFlips: ok.eligibilityFlips.map((c) => ({ ...c, from: false, to: true })) }, o],
    ["extraKeysIgnored", { ...ok, deactivations: gone.map((i) => ({ securityId: `ref_${i}`, from: "ACTIVE", to: "INACTIVE" })), purpose: "x" }, o],
    ["noVersionFlag", ok, { ...o, allowVersionChange: false }],
    ["otherSha", ok, { ...o, prevMasterSha256: "b".repeat(64) }],
    ["badEntry", { ...ok, eligibilityFlips: [{ securityId: "ref_P00", from: "true", to: false }] }, o],
    ["duplicate", { ...ok, instrumentTypeChanges: [...ok.instrumentTypeChanges, ok.instrumentTypeChanges[0]] }, o],
    ["tightThresholds", ok, { ...o, thresholds: { maxDeactivations: 3 } }],
  ];
  return cases.map(([name, approved, opts]) => [name, evaluateRefresh(inputs(), { ...opts, approvedChanges: approved })]);
}

test("SMA-1 · 1.0.0 unverändert: neun Szenarien liefern byte-gleich dasselbe Ergebnis wie vor der Erweiterung; Grenzen unverändert", () => {
  assert.equal(APPROVED_CHANGES_SCHEMA, "security-master-approved-changes-1.0.0");
  const res = legacyScenarios();
  assert.equal(createHash("sha256").update(JSON.stringify(res)).digest("hex"), "d6ebf4525423036a26dd832b0c840507218f7f2e9c5d60586530b31eea664b25");
  // 1.0.0 nimmt weiterhin nur Typ und Eignung aus: eine mitgelieferte deactivations-Liste bleibt wirkungslos
  const extra = res.find(([n]) => n === "extraKeysIgnored")[1];
  assert.deepEqual(Object.keys(extra.report.approval), ["fromVersion", "toVersion", "prevMasterSha256", "applied", "unused"]);
  assert.deepEqual(DEFAULT_THRESHOLDS, { maxProviderRowChangePct: 5, maxRowsDrop: 50, maxCanonicalIdChanges: 25, maxInstrumentTypeChanges: 25, maxDeactivations: 50, maxEligibilityFlips: 50, maxTickerChanges: 25, maxNamesCoverageDrop: 20, maxNameChanges: 200, maxAgeDays: 21 });
});

// ── 1.1.0: Fall mit allen Arten über den unveränderten Grenzen ─────────────────────────────────────────────────────────
const N = { deact: 60, can: 30, tick: 0, names: 210 };
function bigCase() {
  const D = Array.from({ length: N.deact }, (_, i) => `D${String(i).padStart(2, "0")}`), C = Array.from({ length: N.can }, (_, i) => `C${String(i).padStart(2, "0")}`);
  const NM = Array.from({ length: N.names }, (_, i) => `N${String(i).padStart(3, "0")}`), keep = ["OKE", "AAA"];
  const all = [...keep, ...D, ...C, ...NM];
  const prevRows = all.map((i) => row(i));
  const nextRows = [
    row("AAA"), row("OKE"), row("OKE", { active_status: "INACTIVE", eligible_us_equity: false, end_date: "2026-09-14" }), // neue Doppelung der canonical_id
    ...D.map((i) => row(i, { active_status: "INACTIVE", eligible_us_equity: false, end_date: "2026-09-01" })),
    ...C.flatMap((i) => [row(i, { active_status: "INACTIVE", end_date: "2010-01-01", eligible_us_equity: false }), row(i, { canonical_id: `tiingo:NYSE:${i}:2026-06-01`, start_date: "2026-06-01" })]),
    ...NM.map((i) => row(i)),
  ];
  const x = {
    prevMaster: master(prevRows, { version: "us-security-master-1.1.0", generatedAt: "2026-09-11T00:00:00Z" }), nextMaster: master(nextRows),
    prevSummary: summary(all.length), nextSummary: summary(all.length), nextReconciliation: recon(),
    prevNames: names(all, (i) => (i.startsWith("N") ? null : `${i} Inc`)), nextNames: names(all, (i) => `${i} Inc`),
  };
  const ev = { source: "test", ref: "fixture" };
  const ok = {
    schema: APPROVED_CHANGES_SCHEMA_V11, fromVersion: "us-security-master-1.1.0", toVersion: "us-security-master-1.3.0", prevMasterSha256: SHA,
    instrumentTypeChanges: [],
    eligibilityFlips: [...D, ...C].map((i) => ({ securityId: `ref_${i}`, from: true, to: D.includes(i) ? false : true, evidence: ev })).filter((e) => e.from !== e.to),
    deactivations: D.map((i) => ({ securityId: `ref_${i}`, from: "ACTIVE", to: "INACTIVE", evidence: ev })),
    canonicalIdChanges: C.map((i) => ({ securityId: `ref_${i}`, from: `tiingo:NYSE:${i}:2000-01-01`, to: `tiingo:NYSE:${i}:2000-01-01|tiingo:NYSE:${i}:2026-06-01`, evidence: ev })),
    tickerChanges: [],
    newDuplicateCanonicalIds: [{ canonicalId: "tiingo:NYSE:OKE:2000-01-01", securityId: "ref_OKE", from: 1, to: 2, evidence: ev }],
    nameChanges: NM.map((i) => ({ securityId: `ref_${i}`, from: null, to: `${i} Inc`, evidence: ev })),
  };
  return { x, ok, D, C, NM };
}
const run = (x, o) => evaluateRefresh(x, { today: "2026-10-28", allowVersionChange: true, prevMasterSha256: SHA, ...o });

test("SMA-2 · 1.1.0 nimmt genau die gelisteten Wechsel aus G6, G7 und G9; ohne Liste blockiert dieselbe Lage", () => {
  const { x, ok } = bigCase();
  const plain = run(x, {});
  assert.equal(plain.pass, false);
  for (const re of [/^G6 1 neue doppelte/, /^G7 30 canonical_id-Wechsel \(Grenze 25\)/, /^G7 60 aktiv → inaktiv/, /^G7 60 Eignungswechsel/, /^G9 210 Namenswechsel \(Grenze 200\)/]) assert.ok(plain.failures.some((f) => re.test(f)), `${re} in ${plain.failures.join("|")}`);
  const r = run(x, { approvedChanges: ok });
  assert.equal(r.pass, true, r.failures.join("|")); assert.equal(r.decision, "COMMIT");
  assert.equal(r.report.approval.schema, APPROVED_CHANGES_SCHEMA_V11);
  assert.deepEqual(r.report.approval.applied, { instrumentTypeChanges: 0, eligibilityFlips: 60, deactivations: 60, canonicalIdChanges: 30, tickerChanges: 0, newDuplicateCanonicalIds: 1, nameChanges: 210 });
  assert.deepEqual(Object.values(r.report.approval.counted), [0, 0, 0, 0, 0, 0, 0]);
  // Bericht zählt weiter vollständig
  assert.equal(r.report.counts.deactivations, 60); assert.equal(r.report.names.nameChangeCount, 210); assert.deepEqual(r.report.identity.newDuplicateCanonicalIds, ["tiingo:NYSE:OKE:2000-01-01"]);
});

test("SMA-3 · 1.1.0 exakt: nicht gelistete oder abweichende Einträge zählen gegen die UNVERÄNDERTEN Grenzen", () => {
  const { x, ok } = bigCase();
  const fails = (approved, opts = {}) => { const z = run(x, { approvedChanges: approved, ...opts }); assert.equal(z.pass, false); return z.failures.join("|"); };
  // 10 Deaktivierungen nicht gelistet: 10 zählen (≤ 50 zulässig); 51 nicht gelistete blockieren bei unveränderter Grenze 50
  assert.equal(run(x, { approvedChanges: { ...ok, deactivations: ok.deactivations.slice(10) } }).pass, true);
  assert.match(fails({ ...ok, deactivations: ok.deactivations.slice(51), eligibilityFlips: ok.eligibilityFlips }), /G7 51 aktiv → inaktiv \(Delistings\) \(Grenze 50, ohne die freigegebenen\)/);
  // canonical_id: anderes Ziel trifft nicht
  assert.match(fails({ ...ok, canonicalIdChanges: ok.canonicalIdChanges.map((c) => ({ ...c, to: c.to + "|x" })) }), /G7 30 canonical_id-Wechsel \(Grenze 25, ohne die freigegebenen\)/);
  // Namen: falsches from trifft nicht
  assert.match(fails({ ...ok, nameChanges: ok.nameChanges.map((c) => ({ ...c, from: "Alt" })) }), /G9 210 Namenswechsel \(Grenze 200, ohne die freigegebenen\)/);
  // G6 nur bei exakter Angabe: andere Zeilenzahl, andere securityId oder fehlender Eintrag blockiert
  for (const d of [{ to: 3 }, { securityId: "ref_X" }, { from: 0 }]) assert.match(fails({ ...ok, newDuplicateCanonicalIds: [{ ...ok.newDuplicateCanonicalIds[0], ...d }] }), /^G6 1 neue doppelte canonical_id/m);
  assert.match(fails({ ...ok, newDuplicateCanonicalIds: [] }), /^G6 1/m);
  // Grenzen über --thresholds bleiben wirksam (Sonderfreigabe ist keine Lockerung)
  assert.match(fails({ ...ok, deactivations: ok.deactivations.slice(1) }, { thresholds: { ...DEFAULT_THRESHOLDS, maxDeactivations: 0 } }), /G7 1 aktiv → inaktiv/);
});

test("SMA-4 · 1.1.0 Bindung und Form: Versionsfreigabe, Versionen, Stamm-SHA, alle Listen, Belege, keine Doppelungen", () => {
  const { x, ok } = bigCase();
  const fails = (approved, opts = {}) => { const z = run(x, { approvedChanges: approved, ...opts }); assert.equal(z.pass, false); return z.failures.join("|"); };
  assert.match(fails(ok, { allowVersionChange: false }), /G8 Sonderfreigabe nur zusammen/);
  assert.match(fails({ ...ok, fromVersion: "us-security-master-1.2.0" }), /G8 Sonderfreigabe gilt für/);
  assert.match(fails({ ...ok, toVersion: "us-security-master-1.4.0" }), /G8 Sonderfreigabe gilt für/);
  assert.match(fails(ok, { prevMasterSha256: "b".repeat(64) }), /anderen Ausgangsstamm/);
  assert.match(fails(ok, { prevMasterSha256: null }), /anderen Ausgangsstamm/);
  for (const k of ["instrumentTypeChanges", "eligibilityFlips", "deactivations", "canonicalIdChanges", "tickerChanges", "newDuplicateCanonicalIds", "nameChanges"]) {
    const { [k]: _drop, ...rest } = ok;
    assert.match(fails(rest), new RegExp(`G10 Sonderfreigabe 1.1.0: Liste ${k} fehlt`));
  }
  const bad = (k, f) => assert.match(fails({ ...ok, [k]: ok[k].map((e, i) => (i === 0 ? f(e) : e)) }), new RegExp(`G10 Sonderfreigabe: ungültiger Eintrag in ${k}`));
  bad("deactivations", (e) => ({ ...e, evidence: undefined }));
  bad("deactivations", (e) => ({ ...e, evidence: { source: "x", ref: " " } }));
  bad("deactivations", (e) => ({ ...e, to: "DELISTED" }));
  bad("canonicalIdChanges", (e) => ({ ...e, to: e.from }));
  bad("nameChanges", (e) => ({ ...e, to: 5 }));
  bad("eligibilityFlips", (e) => ({ ...e, from: "true" }));
  bad("newDuplicateCanonicalIds", (e) => ({ ...e, to: 1 }));
  bad("newDuplicateCanonicalIds", (e) => ({ ...e, canonicalId: "" }));
  bad("deactivations", (e) => ({ ...e, securityId: "" }));
  assert.match(fails({ ...ok, deactivations: [...ok.deactivations, ok.deactivations[0]] }), /G10 Sonderfreigabe: doppelte securityId ref_D00 in deactivations/);
  // ungültige 1.1.0-Datei: keine Ausnahme wirkt, alles zählt wieder
  const z = run(x, { approvedChanges: { ...ok, nameChanges: null } });
  assert.ok(z.failures.some((f) => /^G9 210 Namenswechsel \(Grenze 200\)$/.test(f)), z.failures.join("|"));
  // Wiederverwendung im nächsten Lauf (Stamm schon 1.3.0): G8
  const y = bigCase(); y.x.prevMaster.version = "us-security-master-1.3.0";
  assert.ok(run(y.x, { approvedChanges: y.ok }).failures.some((f) => /G8 Sonderfreigabe gilt für/.test(f)));
});

// ── Builder ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const SEC = { fields: ["cik", "name", "ticker", "exchange"], data: [[1, "Reuse Holdings", "REU", "NYSE"], [2, "Otc Corp", "OTCX", "OTC"], [3, "Still Listed Inc", "STL", "NYSE"], [4, "Name Added Corp", "NAD", "NYSE"]] };
test("SMA-5 · Builder: Klassen, SEC-Abgleich, nur Freigabefähiges in der Datei; Gate erkennt die Datei exakt an", () => {
  const sec = indexSec(SEC);
  assert.equal(secCheck({ active_status: "ACTIVE", exchange: "NYSE MKT" }, "REU", sec).status, "CONFIRMS");
  assert.equal(secCheck(null, "STL", sec).status, "CONTRADICTS");
  assert.equal(secCheck({ active_status: "ACTIVE", exchange: "OTCMKTS" }, "OTCX", sec).status, "CONSISTENT");
  const today = "2026-10-28";
  const P = (t, o) => [row(t, o)];
  // Ticker-Wiederverwendung: alte Zeile bleibt (inaktiv), neue beginnt später → freigabefähig (SEC bestätigt die aktive Stammaktie)
  const reuse = classifyCanonical(P("REU"), [row("REU", { active_status: "INACTIVE", end_date: "2015-01-01" }), row("REU", { canonical_id: "tiingo:NYSE:REU:2025-01-01", start_date: "2025-01-01" })], { today, secBy: sec });
  assert.equal(reuse.class, "TICKER_REUSE_NEW_LISTING"); assert.equal(reuse.approvable, true);
  // zwei aktive Zeilen → nicht freigabefähig
  const two = classifyCanonical(P("REU"), [row("REU"), row("REU", { canonical_id: "tiingo:NYSE:REU:2026-10-20", start_date: "2026-10-20" })], { today, secBy: sec });
  assert.equal(two.class, "TWO_ACTIVE_LISTINGS"); assert.equal(two.approvable, false);
  // Altzeile entfallen, neue Zeile jung → nicht freigabefähig
  const rs = classifyCanonical(P("XYZ"), [row("XYZ", { canonical_id: "tiingo:NYSE:XYZ:2026-10-01", start_date: "2026-10-01" })], { today, secBy: sec });
  assert.equal(rs.class, "PROVIDER_HISTORY_RESTARTED"); assert.equal(rs.approvable, false);
  // Rückzug in den Freiverkehr, SEC sagt OTC → freigabefähig
  const otc = classifyCanonical(P("OTCX"), [row("OTCX", { exchange: "OTCMKTS", canonical_id: "tiingo:OTCMKTS:OTCX:2000-01-01", eligible_us_equity: false })], { today, secBy: sec });
  assert.equal(otc.class, "MOVED_TO_OTC"); assert.equal(otc.approvable, true);

  // vollständiger Lauf: Deaktivierung mit SEC-Widerspruch (STL) bleibt draußen, die übrigen stehen in der Datei
  const ids = ["REU", "OTCX", "STL", "GON", "NAD"];
  const prev = master(ids.map((i) => row(i)), { version: "us-security-master-1.1.0", generatedAt: "2026-09-11T00:00:00Z" });
  const next = master([
    row("REU", { active_status: "INACTIVE", end_date: "2015-01-01", eligible_us_equity: false }), row("REU", { canonical_id: "tiingo:NYSE:REU:2025-01-01", start_date: "2025-01-01" }),
    row("OTCX", { exchange: "OTCMKTS", canonical_id: "tiingo:OTCMKTS:OTCX:2000-01-01", eligible_us_equity: false }),
    row("STL", { active_status: "INACTIVE", end_date: "2026-09-01", eligible_us_equity: false }),
    row("GON", { active_status: "INACTIVE", end_date: "2026-09-01", eligible_us_equity: false }),
    row("NAD"),
  ]);
  const nm = (f) => ({ rows: ids.map((i) => ({ securityId: `ref_${i}`, ticker: i, inProductUniverse: false, companyName: f(i), nameSource: f(i) ? "SEC_COMPANY_TICKERS" : null, cik: i === "NAD" && f(i) ? "0000000004" : null, candidates: {} })) });
  const prevBytes = Buffer.from(JSON.stringify(prev));
  const { approval, classification } = buildApprovalList({ prevBytes, prev, next, prevNames: nm(() => null), nextNames: nm((i) => (i === "NAD" ? "Name Added Corp" : null)), sec: SEC, secAsOf: "2026-10-30", runId: "1" });
  assert.equal(approval.schema, APPROVED_CHANGES_SCHEMA_V11);
  assert.equal(approval.prevMasterSha256, createHash("sha256").update(prevBytes).digest("hex"));
  assert.deepEqual(approval.deactivations.map((d) => d.securityId), ["ref_GON"]);
  assert.deepEqual(classification.items.deactivations.filter((d) => !d.approvable).map((d) => d.securityId), ["ref_STL"]);
  assert.deepEqual(approval.canonicalIdChanges.map((d) => d.securityId).sort(), ["ref_OTCX", "ref_REU"]);
  assert.deepEqual(approval.nameChanges.map((d) => [d.securityId, d.from, d.to]), [["ref_NAD", null, "Name Added Corp"]]);
  // Eignungswechsel: GON (Deaktivierung) und OTCX (canonical) freigabefähig, STL nicht; REU bleibt über das neue Listing geeignet
  assert.deepEqual(approval.eligibilityFlips.map((d) => d.securityId).sort(), ["ref_GON", "ref_OTCX"]);
  for (const k of ["eligibilityFlips", "deactivations", "canonicalIdChanges", "nameChanges"]) for (const e of approval[k]) assert.ok(e.evidence.source && e.evidence.ref, `${k} ${e.securityId} ohne Beleg`);
  assert.ok(listsMarkdown(classification).includes("ref_STL"));
  // eigene Tagesreihe läuft über das Anbieter-Ende hinaus → Identitätsbefund, nicht freigabefähig
  const withSeries = buildApprovalList({ prevBytes, prev, next, sec: SEC, seriesEnd: (id) => (id === "ref_GON" ? "2026-10-28" : null) });
  assert.deepEqual(withSeries.approval.deactivations, []);
  assert.match(withSeries.classification.items.deactivations.find((d) => d.securityId === "ref_GON").reason, /Identitätsbefund/);
  // Gate: die Datei nimmt genau die freigabefähigen aus, der Rest zählt
  const r = evaluateRefresh({ prevMaster: prev, nextMaster: next, prevSummary: summary(5), nextSummary: summary(5), nextReconciliation: recon(), prevNames: nm(() => null), nextNames: nm((i) => (i === "NAD" ? "Name Added Corp" : null)) },
    { today: "2026-10-28", allowVersionChange: true, approvedChanges: approval, prevMasterSha256: approval.prevMasterSha256 });
  assert.equal(r.pass, true, r.failures.join("|"));
  assert.deepEqual(r.report.approval.counted, { instrumentTypeChanges: 0, eligibilityFlips: 1, deactivations: 1, canonicalIdChanges: 0, tickerChanges: 0, newDuplicateCanonicalIds: 0, nameChanges: 0 });
});

test("SMA-6 · Builder-CLI schreibt nur nach --out (Prüfdaten im Temp-Verzeichnis) und bricht bei unpassendem Gate-Bericht ab", () => {
  const d = mkdtempSync(join(tmpdir(), "sma-"));
  try {
    for (const s of ["prev", "next"]) mkdirSync(join(d, s));
    const prev = master([row("AAA"), row("BBB")], { version: "us-security-master-1.1.0" }), next = master([row("AAA"), row("BBB", { active_status: "INACTIVE", end_date: "2026-09-01", eligible_us_equity: false })]);
    writeFileSync(join(d, "prev", "us-security-master.json"), JSON.stringify(prev)); writeFileSync(join(d, "next", "us-security-master.json"), JSON.stringify(next));
    const cli = (extra) => spawnSync(process.execPath, [join(ROOT, "scripts/market/build-security-master-approval-list.mjs"), "--prev", join(d, "prev"), "--next", join(d, "next"), "--out", join(d, "a.json"), ...extra], { encoding: "utf8" });
    const ok = cli([]); assert.equal(ok.status, 0, ok.stderr);
    const a = JSON.parse(readFileSync(join(d, "a.json"), "utf8"));
    assert.deepEqual(a.deactivations.map((x) => x.securityId), ["ref_BBB"]);
    writeFileSync(join(d, "gate.json"), JSON.stringify({ report: { counts: { deactivations: 7 } } }));
    const bad = cli(["--gate-report", join(d, "gate.json")]); assert.notEqual(bad.status, 0); assert.match(bad.stderr, /Gate-Bericht passt nicht/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("SMA-7 · Vorgeschlagene Freigabedatei v130-approved-changes-1.1.0.json: gebunden wie 1.0.0, enthält 1.0.0 vollständig, nur freigabefähige Klassen, jeder Eintrag belegt", () => {
  const a = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-approved-changes-1.1.0.json"), "utf8"));
  const base = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-approved-changes.json"), "utf8"));
  assert.equal(a.schema, APPROVED_CHANGES_SCHEMA_V11);
  assert.deepEqual([a.fromVersion, a.toVersion, a.prevMasterSha256], [base.fromVersion, base.toVersion, base.prevMasterSha256]);
  const key = (x) => `${x.securityId}|${x.from}|${x.to}`;
  for (const k of ["instrumentTypeChanges", "eligibilityFlips"]) { const s = new Set(a[k].map(key)); for (const x of base[k]) assert.ok(s.has(key(x)), `${k} ${key(x)} aus 1.0.0 fehlt`); }
  const forbidden = /TWO_ACTIVE|PROVIDER_HISTORY_RESTARTED|UNCLEAR|UNEXPLAINED|ISSUER_CIK_CHANGED|NAME_REMOVED|PROVIDER_DUPLICATE_ROW$/;
  for (const k of ["instrumentTypeChanges", "eligibilityFlips", "deactivations", "canonicalIdChanges", "tickerChanges", "newDuplicateCanonicalIds", "nameChanges"]) {
    assert.ok(Array.isArray(a[k]), k);
    assert.equal(a[k].length, a.counts[k].approved, `${k}: Zählung im Kopf = Liste`);
    for (const e of a[k]) { assert.ok(e.evidence && e.evidence.source.trim() && e.evidence.ref.trim(), `${k} ${e.securityId} ohne Beleg`); assert.doesNotMatch(String(e.class), forbidden, `${k} ${e.securityId}`); }
  }
  assert.deepEqual(a.newDuplicateCanonicalIds, [], "doppelte canonical_id (OKE) ist nicht freigegeben");
  assert.deepEqual(a.tickerChanges, []);
  // gilt nur für den committeten Ausgangsstamm
  const sha = createHash("sha256").update(readFileSync(join(ROOT, "quant/data/market/security-master/us-security-master.json"))).digest("hex");
  if (sha !== a.prevMasterSha256) return; // Stamm seit der Liste geändert: dann gilt sie ohnehin nicht mehr (G8)
  assert.equal(a.sourceRun.runId, "41086438209");
});
