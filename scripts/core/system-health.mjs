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
import { args, makeLoader, loadEngines, loadArtifacts } from "./lib.mjs";

const a = args();
const E = loadEngines();
const load = makeLoader({ site: a.site || null });
const now = a.now ? new Date(a.now) : new Date();
const artifacts = await loadArtifacts(E.registry, load);
const report = E.Health.evaluate(E.registry, artifacts, { now, calendar: E.calendar, tradingSession: E.TradingSession, target: a.site ? "site" : "repository" });
report.target = a.site || "repository";

if (a.json) console.log(JSON.stringify(report, null, 2));
else console.log(E.Health.formatText(report));
if (typeof a.out === "string") writeFileSync(a.out, JSON.stringify(report, null, 2) + "\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.domains.map((d) => `| ${d.label} | **${d.status}** | ${d.asOf || (d.lastUpdate || "-").slice(0, 16)} | ${d.expected || "-"} | ${d.records ?? "-"}${d.expectedRecords ? "/" + d.expectedRecords : ""} | ${[d.reason, ...d.warnings].filter(Boolean).join("; ") || ""} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `### Vision Universe System Health · ${report.overall}`, "",
    `Ziel: ${report.target} · geprueft ${report.checkedAt}` + (report.market ? ` · Markt ${report.market.state}, letzte Sitzung ${report.market.lastCompletedSession}` : ""), "",
    "| System | Zustand | Stand | erwartet | Datensaetze | Befund |", "|---|---|---|---|---|---|", ...rows, ""
  ].join("\n"));
}
if (a.strict && (report.overall === "STALE" || report.overall === "FAILED")) process.exit(2);
