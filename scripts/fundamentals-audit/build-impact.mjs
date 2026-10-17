#!/usr/bin/env node
// Fasst Bundle-Diff, Consumer-Wirkung, Build-Identitaet, Abdeckung je Jahr und Zusatzbelege zu FUNDAMENTAL-IMPACT.json zusammen.
//   node build-impact.mjs --old <dir> --new <dir> --old-log <file> --new-log <file> --old-commit <sha> --new-commit <sha>
//        --diff <bundle-diff.json> --impact <consumer-impact.json> --coverage <coverage-by-year.json> --q4 <q4approx.json>
//        --e9 <e9scan.json> --ranks <quant-rank.json> --eps <eps-breakdown.json> --revenue <revenue-guarantee.json> --screener <screener-preset-flips.json> --products <product-input-impact.json> --out <FUNDAMENTAL-IMPACT.json>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CODE, MAPPING } from "./freeze.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : null; };
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function builderHash(commit) {
  const files = Object.fromEntries([...CODE, ...MAPPING].map((p) => {
    let content = "";
    try { content = execFileSync("git", ["show", `${commit}:${p}`], { cwd: root, maxBuffer: 1 << 26 }); } catch { content = "MISSING"; }
    return [p, sha(content)];
  }));
  return sha(JSON.stringify(files));
}

function buildIdentity(dir, log, commit) {
  const files = fs.readdirSync(dir).filter((f) => /^CIK\d+\.json$/.test(f)).sort();
  let first = null; let last = null; const versions = new Set(); const asOf = new Set();
  for (const f of files) {
    const b = readJson(path.join(dir, f));
    if (!first || b.generatedAtUtc < first) first = b.generatedAtUtc;
    if (!last || b.generatedAtUtc > last) last = b.generatedAtUtc;
    versions.add(`${b.versions.normalization_logic}+registry-${b.versions.metric_registry.mapping_version}`);
    asOf.add(b.asOf);
  }
  const text = fs.readFileSync(log, "utf8");
  const exit = /EXIT (\d+)\s*$/.exec(text)?.[1] ?? null;
  return {
    commit, builderHash: builderHash(commit), schema: "vu-consumer-fundamentals-1.0.0", dataVersions: [...versions],
    asOf: [...asOf], buildWindowUtc: { first, last }, bundles: files.length,
    issuerUniverseHash: sha(files.join("\n")),
    errorLines: (text.match(/^(ERROR|Traceback)/gm) || []).length,
    exitCode: exit === null ? null : Number(exit),
    completionStatus: files.length > 0 && versions.size === 1 ? (exit === "0" ? "COMPLETE" : "COMPLETE_BUNDLES_POSTPROCESS_FAILED") : "INCOMPLETE_OR_MIXED",
  };
}

const oldId = buildIdentity(arg("old"), arg("old-log"), arg("old-commit"));
const newId = buildIdentity(arg("new"), arg("new-log"), arg("new-commit"));
if (oldId.issuerUniverseHash !== newId.issuerUniverseHash) console.warn("WARN: unterschiedliche Bundle-Mengen alt/neu");
// Erwarteter Stand = Code im Arbeitsbaum (Data-Freeze); ein Build aus anderem Code ist STALE_BUILD.
const expected = `${/NORMALIZATION_LOGIC_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(root, "scripts/quant/sec/version.py"), "utf8"))[1]}+registry-${readJson(path.join(root, MAPPING[0])).mapping_version}`;
if (newId.dataVersions.length !== 1 || newId.dataVersions[0] !== expected) {
  console.error(`STALE_BUILD: neuer Build ist nicht vollstaendig ${expected}`, newId.dataVersions);
  process.exit(1);
}

const diff = readJson(arg("diff"));
const impact = readJson(arg("impact"));
const out = {
  schema: "vu-fundamental-impact-1.0.0",
  method: "gleiches SEC-Archiv (companyfacts.zip 2026-10-07), as_of 2026-10-05, alte Kernversion (main) vs. korrigierte (Data-Freeze v2); Consumer-Engines unveraendert; Boersenwert/Kurs fest",
  builds: { old: oldId, new: newId },
  bundleDiff: { issuersCompared: diff.issuersCompared, issuersWithAnyChange: diff.issuersWithAnyChange, byMetric: diff.byMetric, examples: diff.examples },
  consumerImpact: { issuersCompared: impact.issuersCompared, issuersWithChange: impact.issuersWithChange, counters: impact.counters, examples: impact.examples },
  quantRankImpact: arg("ranks") ? readJson(arg("ranks")).byRaw : null,
  epsAndTtmAvailability: arg("eps") ? readJson(arg("eps")) : null,
  revenueGuarantee: arg("revenue") ? readJson(arg("revenue")) : null,
  screenerPresetFlips: arg("screener") ? readJson(arg("screener")).presets : null,
  productInputs: arg("products") ? (({ schema, ...rest }) => rest)(readJson(arg("products"))) : null,
  e4Q4EpsApproximation: arg("q4") ? readJson(arg("q4")) : null,
  e9CurrencyConflicts: arg("e9") ? readJson(arg("e9")) : null,
  coverageByYear: arg("coverage") ? readJson(arg("coverage")) : null,
  backtestEligibility: {
    fullUniverseFrom: "2011-07 (XBRL-Pflicht fuer alle Einreicher seit Geschaeftsperioden nach dem 15.06.2011)",
    partial: "2009-06 bis 2011-06: nur Large Accelerated Filer (Zusammensetzungs-Bias)",
    notEvaluable: "vor 2009-06 und Auslandsemittenten ohne Quartals-XBRL (20-F/40-F/6-K): UNKNOWN; lizenzpflichtige Daten waeren Abbruchbedingung",
  },
};
fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ old: oldId.completionStatus, new: newId.completionStatus, bundles: [oldId.bundles, newId.bundles] }));
