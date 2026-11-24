/* =========================================================================
   VISION UNIVERSE — scripts/core/system-health.mjs

   Systemzustand je Domaene (core/registry/domains.json, core/health.js).

     node scripts/core/system-health.mjs                  Repository-Stand
     node scripts/core/system-health.mjs --site=https://research.visionuniverse.de
     node scripts/core/system-health.mjs --json            Bericht als JSON
     node scripts/core/system-health.mjs --strict          Exit 2 bei STALE/FAILED
     node scripts/core/system-health.mjs --now=2026-10-03T12:00:00Z

   Schreibt NICHTS ins Repository. Ein committeter Gesundheitsbericht waere
   eine Datei, deren Stichtag eine Aktualitaet behauptet, die sie nicht
   mehr hat (Vorfall-Notiz in .gitignore). Mit --out=PFAD landet der
   Bericht dort (z. B. im Runner-Temp); in GitHub Actions zusaetzlich in
   der Step Summary.
   ========================================================================= */
import { writeFileSync, appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { args, makeLoader, makeBranchAwareLoader, loadEngines, loadArtifacts, BRANCH_NOT_READABLE, REPO_ROOT } from "./lib.mjs";
import { loadModules } from "./build-modules.mjs";

const Modules = createRequire(import.meta.url)("../../core/modules.js");

const a = args();
const E = loadEngines();
/* Repository-Stand: Datenarten mit Phase BRANCH_ONLY liegen aktuell nur auf dem Datenzweig, die Kopie in main ist eingefroren.
   Sie werden dort gelesen (git show, nichts wird geholt). Ist der Zweig lokal nicht lesbar: "nicht geprüft" statt STALE. Gegen die Seite
   (--site) liefert die Auslieferung den Datenzweig, dort gilt die Seite. */
const dataBranch = JSON.parse(readFileSync(new URL("../../core/registry/data-branch.json", import.meta.url), "utf8"));
const base = makeLoader({ site: a.site || null });
const branch = a.site ? null : makeBranchAwareLoader(base, dataBranch);
const load = branch ? branch.load : base;
const now = a.now ? new Date(a.now) : new Date();
const artifacts = await loadArtifacts(E.registry, load);
const branchNotChecked = {};
for (const d of E.registry.domains) if (artifacts[d.artifact] && !artifacts[d.artifact].ok && String(artifacts[d.artifact].error).startsWith(BRANCH_NOT_READABLE)) branchNotChecked[d.id] = true;
const report = E.Health.evaluate(E.registry, artifacts, { now, calendar: E.calendar, tradingSession: E.TradingSession, target: a.site ? "site" : "repository", branchNotChecked });
if (branch) { report.branchRead = branch.state.read; for (const d of report.domains) { const r = branch.state.read[d.artifact]; if (r) d.source = r; } }
report.target = a.site || "repository";
/* Produkte aus den Steckbriefen (products/<id>/module.json): schlechtester Zustand ihrer Datenarten. */
report.products = Modules.productHealth(loadModules().map((x) => x.m), report);
/* Live ausgelieferte Generation (ADR-008, /core/release-manifest.json). Im Repository-Stand gibt es kein Manifest (nur Auslieferung). */
report.release = await load("/core/release-manifest.json").then(
  (m) => ({ state: "DELIVERED", stage: m.stage, codeSha: m.code?.sha || null, dataBranchSha: m.dataBranch?.sha || null, payloadHash: m.payloadHash, builtAt: m.builtAt }),
  (e) => ({ state: a.site ? "UNREADABLE" : "NOT_APPLICABLE", reason: String(e.message || e) }));

if (a.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(E.Health.formatText(report));
  console.log(report.release.state === "DELIVERED" ? `\nAusgelieferte Generation: Code ${String(report.release.codeSha).slice(0, 7)} · Datenzweig ${String(report.release.dataBranchSha || "?").slice(0, 7)} · Nutzdaten ${report.release.payloadHash.slice(0, 12)} · ${report.release.stage}` : `\nAusgelieferte Generation: ${report.release.state}`);
  console.log("\nProdukte (module.json):");
  for (const p of report.products) console.log(`  ${p.label.padEnd(22)} ${p.status.padEnd(9)} ${p.access.padEnd(6)} ${p.cause.join(", ")}`);
}
if (typeof a.out === "string") writeFileSync(a.out, JSON.stringify(report, null, 2) + "\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.domains.map((d) => `| ${d.label} | **${d.status}** | ${d.asOf || (d.lastUpdate || "-").slice(0, 16)} | ${d.expected || "-"} | ${d.records ?? "-"}${d.expectedRecords ? "/" + d.expectedRecords : ""} | ${[d.reason, ...d.warnings].filter(Boolean).join("; ") || ""} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `### Vision Universe System Health · ${report.overall}`, "",
    `Ziel: ${report.target} · geprueft ${report.checkedAt}` + (report.market ? ` · Markt ${report.market.state}, letzte Sitzung ${report.market.lastCompletedSession}` : ""), "",
    "| Produkt | Zustand | Zugang | Ursache |", "|---|---|---|---|", ...report.products.map((p) => `| ${p.label} | **${p.status}** | ${p.access} | ${p.cause.join(", ")} |`), "",
    "| System | Zustand | Stand | erwartet | Datensaetze | Befund |", "|---|---|---|---|---|---|", ...rows, ""
  ].join("\n"));
}
if (a.strict && (report.overall === "STALE" || report.overall === "FAILED")) process.exit(2);
