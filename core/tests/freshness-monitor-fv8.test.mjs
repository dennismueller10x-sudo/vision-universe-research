/* FV-8 und „pruefen nach dem Kurslauf“ (Neustart 04.11.2026, Strang A).
   freshness-monitor.yml startet nach dem Marktdaten-Refresh auf main, prueft dann Produktstand, Supertrader und
   PIT-Snapshots (fehlender Monat = Alarm), aber nicht die ausgelieferte Seite (Pages ist noch nicht gebaut).
   Ein solcher Lauf darf einen Alarm oeffnen, nie schliessen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FM = readFileSync(join(ROOT, ".github/workflows/freshness-monitor.yml"), "utf8");
const REFRESH = readFileSync(join(ROOT, ".github/workflows/market-data-refresh.yml"), "utf8");
const job = (name) => { const i = FM.indexOf(`\n  ${name}:\n`); assert.ok(i > 0, name); const rest = FM.slice(i + 1); const j = rest.slice(3).search(/\n  [a-z][a-z0-9_-]*:\n/); return j < 0 ? rest : rest.slice(0, j + 3); };

test("FV8-1 · Monitor startet nach dem Marktdaten-Refresh auf main (Name stimmt mit dem Workflow ueberein)", () => {
  const name = REFRESH.match(/^name:\s*(.+)$/m)[1].trim();
  const m = FM.match(/workflow_run:\n\s+workflows: \['([^']+)'\]\n\s+types: \[completed\]\n\s+branches: \[main\]/);
  assert.ok(m, "workflow_run-Ausloeser fehlt");
  assert.equal(m[1], name);
});

test("FV8-2 · Nach dem Kurslauf: produktstand, supertrader, pit laufen; monitor (Seite) nicht", () => {
  for (const j of ["produktstand", "supertrader", "pit"]) assert.match(job(j), /github\.event_name == 'workflow_run'/, j);
  assert.doesNotMatch(job("monitor").split("steps:")[0], /workflow_run/);
});

test("FV8-3 · PIT-Job: Befund mit --fail-on-missing-month und --alarm-detail, nur lesend, Ergebnis im Alarm", () => {
  const p = job("pit");
  assert.match(p, /pit-snapshot-integrity\.cjs --fail-on-missing-month/);
  assert.match(p, /--alarm-detail/);
  assert.doesNotMatch(p, /secrets\.|git push|git commit/);
  assert.match(FM, /alarm:\n\s+needs: \[[^\]]*\bpit\b[^\]]*\]/);
  assert.match(FM, /RESULT_PIT: \$\{\{ needs\.pit\.result \}\}/);
  assert.match(FM, /^permissions:\n\s+contents: read/m);
});

test("FV8-4 · Ein Lauf nach dem Kurslauf oeffnet Alarme, schliesst aber keinen", () => {
  assert.match(job("alarm"), /github\.event_name != 'workflow_run' \|\| contains\(needs\.\*\.result, 'failure'\)/);
});
