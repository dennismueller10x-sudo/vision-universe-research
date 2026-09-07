/* =========================================================================
   VISION UNIVERSE — verify-semantics-parity.mjs   (Phase 3, §2)

   Prueft, dass die Bereinigungssemantik in beiden Stacks dieselbe ist.

   Die Gefahr bei einer gemeinsamen Definition ohne gemeinsame Bibliothek
   ist genau diese: die JSON-Datei wird geaendert, ein Modul zieht nach, das
   andere nicht - und der Fehler, den MEDIUM-7 beschrieb, ist zurueck. Nur
   diesmal in einer Form, die schwerer zu finden ist, weil beide Seiten
   behaupten, dieselbe Datei zu lesen.

   Ausfuehren:
     node scripts/market/verify-semantics-parity.mjs
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const Semantics = require(join(root, "quant", "engines", "price-semantics.js"));
const METHODOLOGY = JSON.parse(readFileSync(
  join(root, "quant", "methodology", "price-adjustment-v1.json"), "utf8"));
Semantics.configure(METHODOLOGY);

const LEVELS = ["UNKNOWN", "RAW", "SPLIT_ADJUSTED", "TOTAL_RETURN"];
const METRICS = Object.keys(METHODOLOGY.metrics);

/* Die JS-Seite auswerten. */
const js = {};
for (const level of LEVELS) {
  js[level] = { rank: Semantics.rank(level), returnLabel: Semantics.returnLabel(level), checks: {} };
  for (const metric of METRICS) {
    js[level].checks[metric] = Semantics.check(metric, level).allowed;
  }
}

/* Die Python-Seite dasselbe rechnen lassen und das Ergebnis einlesen. */
const pythonProgram = `
import json, sys
sys.path.insert(0, "scripts/dashboard")
import price_semantics as ps

levels = ${JSON.stringify(LEVELS)}
metrics = ${JSON.stringify(METRICS)}
out = {}
for level in levels:
    out[level] = {
        "rank": ps.rank(level),
        "returnLabel": ps.return_label(level),
        "checks": {m: ps.check(m, level)["allowed"] for m in metrics},
    }
print(json.dumps(out))
`;

let py;
try {
  py = JSON.parse(execFileSync("python3", ["-c", pythonProgram], {
    cwd: root, encoding: "utf8"
  }));
} catch (err) {
  console.error("Die Python-Seite liess sich nicht auswerten:");
  console.error((err.stderr || err.message || "").toString().trim());
  process.exit(1);
}

/* Vergleichen. */
const problems = [];
for (const level of LEVELS) {
  if (js[level].rank !== py[level].rank) {
    problems.push(`Rang von ${level}: JS ${js[level].rank}, Python ${py[level].rank}`);
  }
  if (js[level].returnLabel !== py[level].returnLabel) {
    problems.push(`Renditename fuer ${level}: JS "${js[level].returnLabel}", Python "${py[level].returnLabel}"`);
  }
  for (const metric of METRICS) {
    const a = js[level].checks[metric], b = py[level].checks[metric];
    if (a !== b) {
      problems.push(`${metric} auf ${level}: JS ${a ? "erlaubt" : "verboten"}, Python ${b ? "erlaubt" : "verboten"}`);
    }
  }
}

console.log("Bereinigungssemantik — Gleichlauf beider Stacks");
console.log(`  Methodik: ${METHODOLOGY.methodologyVersion}`);
console.log(`  ${LEVELS.length} Stufen x ${METRICS.length} Kennzahlen = ${LEVELS.length * METRICS.length} Vergleiche`);

if (problems.length) {
  console.error("\nABWEICHUNGEN:");
  problems.forEach((p) => console.error("  " + p));
  console.error("\nBeide Stacks lesen dieselbe Datei, kommen aber zu verschiedenen Ergebnissen.");
  console.error("Genau das ist der Fehler, den MEDIUM-7 beschrieb - nur schwerer zu finden.");
  process.exit(1);
}

console.log("  Kein Unterschied. Beide Stacks urteilen identisch.");
