/* =========================================================================
   VISION UNIVERSE — qualify-providers.mjs   (Phase 3, §11, §22)

   Laesst alle hinterlegten Anbieterprofile durch den Qualifikationspruefstand
   laufen und schreibt das Ergebnis als Entscheidungstabelle.

   Der Pruefstand erfindet nichts. Er wertet aus, was in
   quant/config/provider-profiles.json an Befunden hinterlegt ist, und macht
   dabei sichtbar, worauf jeder Befund beruht. Ein Anbieter, ueber den nichts
   bekannt ist, kommt als UNKNOWN heraus - nicht als ungeeignet.

   Ausfuehren:
     node scripts/market/qualify-providers.mjs
     node scripts/market/qualify-providers.mjs --json
     node scripts/market/qualify-providers.mjs sharadar
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Qualification = require(join(root, "quant", "engines", "provider-qualification.js"));
const SPEC = JSON.parse(readFileSync(
  join(root, "quant", "methodology", "backtest-evidence-v1.json"), "utf8"));
const PROFILES = JSON.parse(readFileSync(
  join(root, "quant", "config", "provider-profiles.json"), "utf8"));

Qualification.configure(SPEC);

const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const only = argv.find((a) => !a.startsWith("--"));

const GATE_MARK = { PASSED: "+", FAILED: "-", UNKNOWN: "?" };
const STATUS_MARK = { QUALIFIED: "+", NOT_QUALIFIED: "-", PARTIALLY_QUALIFIED: "~", UNKNOWN: "?" };

const ids = Object.keys(PROFILES.providers).filter((id) => !only || id === only);
if (!ids.length) {
  console.error(`Unbekannter Anbieter: ${only}`);
  console.error(`Bekannt: ${Object.keys(PROFILES.providers).join(", ")}`);
  process.exit(1);
}

const results = ids.map((id) =>
  Qualification.runProviderQualification(PROFILES.providers[id], { now: PROFILES.researchedAt }));

if (AS_JSON) {
  const out = join(root, "quant", "data", "providers");
  mkdirSync(out, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    researchedAt: PROFILES.researchedAt,
    retrievalNote: PROFILES.retrievalNote,
    specVersion: SPEC.methodologyVersion,
    decisionTable: Qualification.decisionTable(results),
    results
  };
  const file = join(out, "qualification.json");
  writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

console.log("\nVISION UNIVERSE — Anbieterqualifikation");
console.log(`  Spezifikation: ${SPEC.methodologyVersion}`);
console.log(`  Recherchestand: ${PROFILES.researchedAt}\n`);

for (const r of results) {
  const profile = PROFILES.providers[r.providerId];
  console.log("─".repeat(72));
  console.log(`${profile.displayName}   [${r.qualificationStatus}]`);
  console.log(`  Beste Rolle: ${r.bestRole || "keine qualifiziert"}`);

  console.log("\n  Rollen");
  for (const [id, role] of Object.entries(r.roles)) {
    console.log(`    ${STATUS_MARK[role.status]} ${role.label.padEnd(16)} ${role.status.padEnd(20)} ${role.reason}`);
  }

  console.log("\n  Gates");
  for (const [id, gate] of Object.entries(r.gates)) {
    console.log(`    ${GATE_MARK[gate.result]} ${gate.label.padEnd(34)} ${gate.result.padEnd(8)} (Beleg: ${gate.evidenceLevel || "-"})`);
    console.log(`      ${gate.reason}`);
  }

  const e = r.evidence;
  console.log("\n  Belege");
  console.log(`    zur Laufzeit geprueft:      ${e.runtimeVerified.length}`);
  console.log(`    aus Primaerdokumentation:   ${e.documentationVerified.length}`);
  console.log(`    aus Sekundaerquellen:       ${e.thirdPartyOnly.length}`);
  console.log(`    ungeprueft:                 ${e.unknown.length}`);
  console.log(`    Lizenz: ${r.licensingStatus.status}`);

  if (r.cost && r.cost.observed && r.cost.observed.length) {
    const cheapest = r.cost.observed.reduce((a, b) => (a.amount <= b.amount ? a : b));
    console.log(`    Kosten (recherchiert ${r.cost.checkedAt}): ab ${cheapest.amount} ${cheapest.currency}/${cheapest.period} — ${cheapest.plan}`);
  }

  if (r.warnings.length) {
    console.log("\n  Warnungen");
    r.warnings.slice(0, 4).forEach((w) => console.log(`    · ${w}`));
    if (r.warnings.length > 4) console.log(`    · … und ${r.warnings.length - 4} weitere`);
  }
  console.log("");
}

console.log("─".repeat(72));
console.log("\nENTSCHEIDUNGSTABELLE\n");
const table = Qualification.decisionTable(results);
const head = ["Anbieter", "Beste Rolle", "PIT", "Delist", "Restate", "Lizenz", "Qualifikation", "Laufzeit"];
const rows = table.map((t) => [
  t.provider,
  (t.bestRole || "-").replace("_PROVIDER", "").replace("BACKTEST_EVIDENCE", "Backtest").replace("MARKET_DATA", "Marktdaten").replace("RESEARCH_DATA", "Research"),
  GATE_MARK[t.pit] || "?",
  GATE_MARK[t.delisted] || "?",
  GATE_MARK[t.restatements] || "?",
  t.licenseConfidence === "LEGAL_REVIEW_REQUIRED" ? "offen" : t.licenseConfidence,
  t.qualification,
  `${t.runtimeVerifiedCount}/${t.evidenceTotal}`
]);
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
console.log("  " + head.map((h, i) => h.padEnd(widths[i])).join("  "));
console.log("  " + widths.map((w) => "─".repeat(w)).join("  "));
rows.forEach((r) => console.log("  " + r.map((c, i) => String(c).padEnd(widths[i])).join("  ")));

console.log("\n  + bestanden / vorhanden      - widerlegt / nicht vorhanden      ? ohne Befund");
console.log("  Laufzeit = zur Laufzeit geprüfte Befunde von insgesamt hinterlegten\n");

const anyRuntime = results.some((r) => r.evidence.runtimeVerified.length > 0);
if (!anyRuntime) {
  console.log("  HINWEIS: Kein einziger Befund ist zur Laufzeit geprueft. Alle Aussagen");
  console.log("  sind Aussagen ueber Aussagen. Fuer eine Vertragsentscheidung reicht das nicht.\n");
}
