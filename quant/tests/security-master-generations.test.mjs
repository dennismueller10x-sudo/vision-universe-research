// Security-Master-Generationen (Owner P2, 31.10.2026): abgeschlossene Studien lesen eine eingefrorene, hashgebundene
// Generation; der Produktstamm folgt dem Erzeuger. Kein stilles Mischen, fail closed bei jeder Abweichung.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const G = require("../engines/security-master-generation.cjs");
const A = require("../engines/weekly-real-adapter.cjs");
const R = require("../engines/research-weekly-loader.cjs");
const P = require("../../scripts/quant/pin-security-master-generation.cjs");
const ID = "us-security-master-1.1.0", SHA = "26c82617913ab0dcbd08d24c80eb818134ccced74cc01e9eac819b4635498332";
const reg = JSON.parse(readFileSync(join(ROOT, G.REGISTRY), "utf8")), gen = reg.generations[ID];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const V12 = { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true, identityEvidenceProtocolV10: true, identityEvidenceProtocolV12: true };

test("MG-1 · Generation 1.1.0 ist eingefroren: Datei, SHA-256, Git-Blob und alle Freeze-Belege stimmen überein", () => {
  assert.equal(reg.schemaVersion, G.SCHEMA); G.validateRegistry(reg);
  assert.equal(gen.sha256, SHA); assert.equal(reg.researchEvidenceDefault, ID);
  const bytes = readFileSync(join(ROOT, gen.file));
  assert.equal(sha(bytes), SHA); assert.equal(bytes.length, gen.bytes);
  assert.equal(createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex"), gen.gitBlob);
  const m = JSON.parse(bytes); assert.equal(m.version, ID); assert.equal(m.generatedAt, gen.generatedAt); assert.equal(m.rows.length, gen.rows);
  assert.equal(JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-quant-freeze.json"), "utf8")).preSwitchMaster.sha256, SHA);
  assert.equal(JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/v130-approved-changes.json"), "utf8")).prevMasterSha256, SHA);
  // die Kopie liegt nie in einem Pfad, den ein Erzeuger überschreibt; das Pin-Skript ändert eine vorhandene Kopie nie
  for (const d of ["quant/data/", "discover/data/", "supertrader/data/", "social/data/"]) assert.equal(gen.file.startsWith(d), false, d);
  assert.equal(P.pin({ generation: ID, check: true }).state, "ALREADY_PINNED");
});

test("MG-2 · fail closed: unbekannte, ungültige, manipulierte oder fehlende Generation", () => {
  assert.throws(() => G.resolve(ROOT, "us-security-master-9.9.9"), /^Error: MASTER_GENERATION_UNKNOWN/);
  for (const bad of ["", "1.1.0", "../x", null, 7]) assert.throws(() => G.resolve(ROOT, bad), /^Error: MASTER_GENERATION_INVALID/);
  const tmp = mkdtempSync(join(tmpdir(), "mg2-"));
  try {
    mkdirSync(join(tmp, dirname(gen.file)), { recursive: true });
    const m = JSON.parse(readFileSync(join(ROOT, gen.file), "utf8")); m.rows[0].instrument_type = "PREFERRED";
    writeFileSync(join(tmp, gen.file), JSON.stringify(m, null, 2) + "\n");
    assert.throws(() => G.resolve(tmp, ID), /^Error: MASTER_GENERATION_HASH_MISMATCH/);
    assert.throws(() => R.createResearchLoader(tmp, undefined, { masterGeneration: ID }), /^Error: MASTER_GENERATION_HASH_MISMATCH/);
    assert.throws(() => R.createResearchLoader(tmp, V12), /^Error: MASTER_GENERATION_HASH_MISMATCH/, "Evidenz-Optionen laden nie eine abweichende Kopie");
    // eigenes Register ohne Datei
    const own = { ...reg, generations: { ...reg.generations, "us-security-master-1.0.9": { ...gen, version: "us-security-master-1.0.9", file: "quant/frozen/security-master/missing.json" } } };
    mkdirSync(join(tmp, "quant/config"), { recursive: true }); writeFileSync(join(tmp, G.REGISTRY), JSON.stringify(own));
    assert.throws(() => G.resolve(tmp, "us-security-master-1.0.9"), /^Error: MASTER_GENERATION_FILE_MISSING/);
    writeFileSync(join(tmp, G.REGISTRY), JSON.stringify({ ...own, generations: { x: gen } }));
    assert.throws(() => G.resolve(tmp, ID), /^Error: MASTER_GENERATION_REGISTRY_INVALID/);
    writeFileSync(join(tmp, G.REGISTRY), JSON.stringify({ ...reg, generations: { [ID]: { ...gen, file: "quant/data/market/security-master/us-security-master.json" } } }));
    assert.throws(() => G.resolve(tmp, ID), /^Error: MASTER_GENERATION_REGISTRY_INVALID/, "eine Generation darf nicht auf den Produktstamm zeigen");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  for (const bad of [null, [], {}, { masterGeneration: 1 }, { masterGeneration: ID, other: true }]) assert.throws(() => R.createResearchLoader(ROOT, V12, bad), /^Error: INVALID_MASTER_GENERATION_OPTIONS/);
});

test("MG-3 · Vorgaben: Produkt liest LIVE wie bisher, Evidenz-Optionen lesen 1.1.0, neue Generationen nur ausdrücklich", () => {
  // der Produkt-Adapter bleibt bytegleich zu main (research-ca-evidence / research-identity-evidence) und liest immer LIVE
  const live = A.createLoader(ROOT), liveSha = sha(readFileSync(join(ROOT, G.LIVE_FILE)));
  assert.equal(live.masterHash, liveSha); assert.doesNotMatch(readFileSync(join(ROOT, "quant/engines/weekly-real-adapter.cjs"), "utf8"), /security-master-generation/);
  assert.equal(R.createResearchLoader(ROOT).masterGeneration, "LIVE");
  assert.equal(R.createResearchLoader(ROOT, { identityEvidence: false }).masterHash, liveSha);
  for (const o of [{ identityEvidence: true }, { corporateActionEvidence: true }, { listingLifecycleEvidence: true }, V12]) {
    const l = R.createResearchLoader(ROOT, o); assert.equal(l.masterGeneration, ID, JSON.stringify(o)); assert.equal(l.masterHash, SHA);
  }
  const explicit = R.createResearchLoader(ROOT, V12, { masterGeneration: "LIVE" });
  assert.equal(explicit.masterGeneration, "LIVE"); assert.equal(explicit.masterHash, liveSha);
  // der eingefrorene Basis-Loader = Produkt-Adapter auf denselben Stammbytes (vor und nach jedem Wechsel prüfbar)
  const frozen = R.createResearchLoader(ROOT, undefined, { masterGeneration: ID });
  const tmp = mkdtempSync(join(tmpdir(), "mg3-"));
  try {
    mkdirSync(join(tmp, "quant/data/market/security-master"), { recursive: true });
    writeFileSync(join(tmp, G.LIVE_FILE), readFileSync(join(ROOT, gen.file)));
    symlinkSync(join(ROOT, "quant/data/market/discover-series-long"), join(tmp, "quant/data/market/discover-series-long"));
    const adapterOnFrozen = A.createLoader(tmp); assert.equal(adapterOnFrozen.masterHash, SHA);
    for (const id of ["ref_NVDA", "ref_MSFT", "ref_FRMEP", "ref_AAPL", "ref_KO", "ref_PCLN", "ref_INTC"]) { const o = (l) => { try { return JSON.stringify(l(id)); } catch (e) { return "ERR:" + e.message; } }; assert.equal(o(frozen), o(adapterOnFrozen), id); }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(G.generationOfHash(SHA), ID); assert.equal(G.generationOfHash("0".repeat(64)), null);
});

test("MG-4 · Migration: simulierter Folgestand 1.3.0 im Produktpfad - Produkt folgt, eingefrorene Studien bleiben bytegleich", async () => {
  const { reclassify } = await import("../../scripts/market/security-master-v130-evidence.mjs");
  const tmp = mkdtempSync(join(tmpdir(), "mg4-"));
  try {
    const prev = JSON.parse(readFileSync(join(ROOT, gen.file), "utf8"));
    const next = reclassify(prev, JSON.parse(readFileSync(join(ROOT, "quant/data/market/scale/universe-FULL_UNIVERSE.json"), "utf8")).securities);
    assert.notEqual(next.version, ID, "der Klassifizierer erzeugt eine neue Generation");
    mkdirSync(join(tmp, "quant/data/market/security-master"), { recursive: true });
    writeFileSync(join(tmp, G.LIVE_FILE), JSON.stringify({ ...prev, version: next.version, rows: next.rows }, null, 2) + "\n");
    symlinkSync(join(ROOT, "quant/data/market/discover-series-long"), join(tmp, "quant/data/market/discover-series-long"));
    // Produkt: neuer Stamm, neuer masterHash
    const product = A.createLoader(tmp);
    assert.notEqual(product.masterHash, SHA);
    assert.equal(product("ref_NVDA").masterVersion, next.version);
    // eingefrorene Studien (V10-V13-Optionen): dieselbe Generation, dieselben Ergebnisse wie vor dem Wechsel
    for (const opts of [{ identityEvidence: true, corporateActionEvidence: true }, { identityEvidence: true, corporateActionEvidence: true, listingLifecycleEvidence: true }, V12]) {
      const before = R.createResearchLoader(ROOT, opts), after = R.createResearchLoader(tmp, opts);
      assert.equal(after.masterHash, SHA); assert.equal(after.masterGeneration, ID);
      const ids = [...new Set([...(after.identityEvidence ? after.identityEvidence.boundSecurityIds : []), "ref_NVDA", "ref_MSFT", "ref_INTC", "ref_KO"])].slice(0, 60);
      for (const id of ids) {
        const out = (l) => { try { return JSON.stringify(l(id)); } catch (e) { return "ERR:" + e.message; } };
        assert.equal(out(after), out(before), id + " " + JSON.stringify(opts));
      }
    }
    // eine neue Research-Generation liest den neuen Stand nur ausdrücklich und dann vollständig (kein Mischen)
    const fresh = R.createResearchLoader(tmp, { corporateActionEvidence: true }, { masterGeneration: "LIVE" });
    assert.equal(fresh.masterHash, product.masterHash);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// Bestandsaufnahme: wer liest den Produktstamm direkt? Engines und der Research-Runner nur über security-master-generation.cjs.
// Die abgeschlossenen Einmal-Skripte V7-V13 bleiben unverändert (ihre Code-Hashes sind in den Registrierungen festgehalten);
// sie werden nach einer Umstellung nur auf ihrem registrierten Commit neu ausgeführt (docs/data/security-master/SECURITY_MASTER_GENERATIONS.md).
const HISTORIC_DIRECT_READERS = [
  "scripts/quant/audit-v8-archives.mjs", "scripts/quant/run-v7-real-studies.cjs", "scripts/quant/run-v8-real-studies.cjs", "scripts/quant/run-v8-sensitivity.cjs",
  "scripts/quant/v10/corporate-actions/run-tr-ledger.cjs", "scripts/quant/v10/population/check_population.py", "scripts/quant/v10/population/v10lib.py",
  "scripts/quant/v10/setup/run-setup-reconstruction.cjs", "scripts/quant/v10/studies/common.cjs", "scripts/quant/v12/indexpop/map-members.cjs",
  "scripts/quant/v12/largecap/export-ca-frame.cjs", "scripts/quant/v12/listref/export_holdings.cjs", "scripts/quant/v13/largecap/evaluate.cjs",
  "scripts/quant/v9-followups/ca-registry/export-frame.cjs", "scripts/quant/v9-followups/identity/check_identity_registry.py", "scripts/quant/v9-followups/ledger/run_ca_ledger.cjs",
  "scripts/quant/v9/corporate-actions/independent_check.py", "scripts/quant/v9/corporate-actions/proposal_dryrun.cjs", "scripts/quant/v9/events/population.cjs",
  "scripts/quant/v9/events/reference_check.py", "scripts/quant/v9/events/run-v9-events.cjs", "scripts/quant/v9/identity/build_dossiers.py", "scripts/quant/v9/identity/check_identity.py",
  "scripts/quant/v9/identity/resolve_ambiguous.py", "scripts/quant/v9/portfolio/run_ledger.cjs", "scripts/quant/v9/portfolio/run_terminal_ledger.cjs",
  "scripts/quant/v9/sensitivity/run-v9-sensitivity.cjs", "scripts/quant/v9/sensitivity/verify_v9_sensitivity.py",
];
test("MG-5 · kein neuer direkter Leser des Produktstamms in Research-Code; Engines nur über die Generationen", () => {
  const walk = (d, out = []) => { for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) { const p = d + "/" + e.name; if (e.isDirectory()) { if (e.name !== "tests" && e.name !== "node_modules") walk(p, out); } else if (/\.(c?js|mjs|py)$/.test(e.name)) out.push(p); } return out; };
  const readsLive = (p) => readFileSync(join(ROOT, p), "utf8").includes("us-security-master.json");
  const research = ["scripts/quant/v9", "scripts/quant/v9-followups", "scripts/quant/v10", "scripts/quant/v11", "scripts/quant/v12", "scripts/quant/v13", "scripts/quant/v13b", "scripts/quant/v13c", "scripts/quant/research"]
    .filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(d));
  const top = readdirSync(join(ROOT, "scripts/quant")).filter((f) => /^(run-v\d|audit-v\d)/.test(f)).map((f) => "scripts/quant/" + f);
  const found = [...research, ...top].filter(readsLive).sort();
  assert.deepEqual(found, [...HISTORIC_DIRECT_READERS].sort(), "neuer Research-Code liest den Stamm über security-master-generation.cjs");
  assert.equal(readsLive("quant/engines/research-weekly-loader.cjs"), false);
});

test("MG-6 · keine Generationen gemischt: jedes committete Demo- und Katalogergebnis ist an eine registrierte Generation gebunden", () => {
  const dirs = ["docs/quant/backtest-demos/results", "docs/quant/backtest-catalog/results"].filter((d) => existsSync(join(ROOT, d)));
  let n = 0;
  for (const d of dirs) for (const f of readdirSync(join(ROOT, d)).filter((x) => x.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(ROOT, d, f), "utf8")), h = doc.inputHashes && doc.inputHashes.population && doc.inputHashes.population.masterHash;
    if (h === undefined || h === null) continue; // Zustand B ohne Population
    assert.equal(G.generationOfHash(h), ID, d + "/" + f); n++;
  }
  assert.ok(n >= 10);
});
