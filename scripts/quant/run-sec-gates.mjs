/* =========================================================================
   Faehrt die Qualifikations-Gates aus quant/engines/gate-tests.js gegen den
   SEC-Adapter und schreibt das Ergebnis in quant/data/sec/pit_gates.json.

   Wichtig: dieses Skript erfindet keine Gate-Ergebnisse. Es waehlt die
   Fixture-Parameter aus den tatsaechlich ingestierten Daten (ein reales
   Restatement, ein reales Stichtagsdatum) und laesst die Gates laufen. Findet
   es keinen Restatement-Fall, laeuft Gate A als SKIPPED durch — nicht als
   PASSED. Ein uebersprungenes Gate ist ein Befund, kein Erfolg.

   Die Ingestion-eigenen Pruefungen (Provenance, Perioden, Einheiten,
   erfundene Werte) kommen aus der Python-Seite und werden hier nur
   zusammengefuehrt:  python3 scripts/quant/cli.py gates

   Aufruf: node scripts/quant/run-sec-gates.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const Gates = require(path.join(ROOT, "quant", "engines", "gate-tests.js"));
const Adapter = require(path.join(ROOT, "providers", "sec", "adapter.js"));

const REPORT = path.join(ROOT, "quant", "data", "sec", "pit_gates.json");

function dayBefore(iso) {
  return new Date(Date.parse(iso) - 86400000).toISOString().slice(0, 10);
}

/** Waehlt Gate-Parameter aus echten Daten. Ohne passenden Fall: null. */
function fixturesFor(bundle) {
  const facts = bundle.facts || [];
  const securityId = bundle.security.securityId;

  const restated = facts
    .filter((f) => f.restatementStatus === "restated")
    .sort((a, b) => (a.availableAt < b.availableAt ? -1 : 1))[0] || null;

  const latest = facts.reduce(
    (acc, f) => (!acc || f.availableAt > acc ? f.availableAt : acc), null);

  return {
    GATE_A_RESTATEMENT: restated ? {
      securityId, periodEnd: restated.periodEnd, metricId: restated.metricId,
      beforeRestatement: dayBefore(restated.availableAt),
      afterRestatement: restated.availableAt
    } : null,
    GATE_B_DELISTING: {
      securityId,
      duringListing: facts.length ? facts[facts.length - 1].availableAt : "2015-01-01",
      afterDelisting: latest || "2026-01-01"
    },
    GATE_C_AVAILABILITY: latest ? { securityId, asOf: latest } : null
  };
}

async function main() {
  const provider = Adapter.createSecProvider();
  const health = provider.healthCheck();

  const existing = existsSync(REPORT)
    ? JSON.parse(readFileSync(REPORT, "utf8")) : {};

  if (health.status === "not_configured") {
    console.log("Keine ingestierten SEC-Daten — Gates werden nicht ausgefuehrt.");
    console.log("Der bestehende Report bleibt unveraendert (status not_generated).");
    return 0;
  }

  const bundles = Adapter.fileLoader()();
  const perCompany = [];
  for (const bundle of bundles) {
    const fixtures = fixturesFor(bundle);
    const report = await Gates.runGateTests(provider, fixtures);
    perCompany.push({
      ticker: bundle.security.ticker,
      securityId: bundle.security.securityId,
      gates: report.gates,
      passed: report.passed,
      total: report.total,
      allPassed: report.allPassed,
      verificationLevel: report.verificationLevel,
      note: fixtures.GATE_A_RESTATEMENT ? null
        : "Gate A uebersprungen: in den ingestierten Daten liegt fuer dieses "
          + "Unternehmen kein Restatement-Fall vor. Uebersprungen ist nicht bestanden."
    });
  }

  const merged = {
    ...existing,
    schema_version: 1,
    status: "generated",
    generated_at_utc: new Date().toISOString(),
    provider: Adapter.PROVIDER_ID,
    engine: "quant/engines/gate-tests.js (unveraendert)",
    note: "Gate A/B/C stammen aus der bestehenden Qualifikationsinstanz und laufen "
        + "gegen den SEC-Adapter. Die Ingestion-Pruefungen darunter stammen aus "
        + "scripts/quant/cli.py gates. Keine Ergebnisse werden hier nachtraeglich "
        + "angehoben.",
    provider_gates: perCompany
  };
  writeFileSync(REPORT, JSON.stringify(merged, null, 2) + "\n");

  for (const row of perCompany) {
    for (const [id, gate] of Object.entries(row.gates)) {
      console.log(`  ${row.ticker.padEnd(6)} ${gate.result.padEnd(8)} ${id}`);
    }
  }
  const anyFailed = perCompany.some((r) => !r.allPassed);
  console.log(anyFailed
    ? "\nMindestens ein Gate ist nicht bestanden. Das ist ein Befund, kein Fehler "
      + "dieses Laufs — siehe docs/SEC_COVERAGE_REPORT.md."
    : "\nAlle ausgefuehrten Gates bestanden.");
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
