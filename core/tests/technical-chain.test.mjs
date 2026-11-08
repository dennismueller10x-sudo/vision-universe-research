/* Technical in der Nachtkette (01.11.2026): workflow_run auf den Marktlauf hat auf main nie gefeuert; der Marktlauf
   stoesst technical-world.yml deshalb selbst an - entkoppelt wie Supertrader, ohne PAT, ohne Anbieterabruf. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { workflowPart, workflowHead } from "../../scripts/ci/lib/workflow-part.mjs";
const root = new URL("../../", import.meta.url).pathname;
const lies = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

test("TC1 · Marktlauf: eigene Stufe nach allen Pruefungen, nur main, kein Push, kleinste Rechte, Nachtlauf bleibt gruen", () => {
  const wf = lies(".github/workflows/market-data-refresh.yml");
  const i = wf.indexOf("\n  technical:\n");
  assert.ok(i > 0, "Job technical fehlt");
  const job = wf.slice(i, wf.indexOf("\n  # ===", i + 10));
  assert.match(job, /needs: \[refresh, materialize, freshness-contract\]/);
  for (const n of ["refresh", "materialize", "freshness-contract"]) assert.match(job, new RegExp("needs\\." + n + "\\.result == 'success'"), n);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /github\.event_name != 'push'/);
  assert.match(job, /permissions:\s*\n\s+contents: read\s*\n\s+actions: write/);
  assert.doesNotMatch(job, /contents: write|TIINGO|MARKETSTACK|secrets\.(?!GITHUB_TOKEN)|\$\{\{\s*inputs\./i);
  assert.doesNotMatch(job, /\n    concurrency:/, "keine Job-Concurrency (Verdraengung = roter Nachtlauf)");
  assert.doesNotMatch(job, /\n    uses:/, "kein workflow_call: ein Technical-Fehler darf den Nachtlauf nicht rot machen");
  const schritte = job.split("\n      - ").slice(1);
  assert.ok(schritte.length >= 1);
  for (const s of schritte) { assert.match(s, /continue-on-error: true/); assert.match(s, /timeout-minutes: \d+/); }
  assert.match(job, /gh workflow run pipeline-daily\.yml --repo "\$GITHUB_REPOSITORY" --ref main -f teil=technical-world/);
  assert.match(job, /ergebnis: \$\{\{ steps\.anstossen\.outcome == 'failure' && 'failure' \|\| 'success' \}\}/);
  /* der Alarm des Marktlaufs sieht den Anstoss */
  assert.match(wf, /\n  alarm:\n    needs: \[[^\]]*\btechnical\b[^\]]*\]/);
  assert.match(wf, /RESULT_TECHNICAL: \$\{\{ needs\.technical\.result == 'failure' && 'failure'/);
});

test("TC2 · Teil technical-world (pipeline-daily.yml, vormals technical-world.yml): Dispatch erlaubt, Zeitplan-Rueckfall, Tests vor dem Commit, eigener Alarm", () => {
  const kopf = workflowHead(root, "pipeline-daily.yml");
  const wf = workflowPart(root, "pipeline-daily.yml", "technical-world", { auswahl: true });
  assert.match(kopf, /\n  workflow_dispatch:/);
  assert.match(kopf, /\n {10}- technical-world\n/);
  assert.match(kopf, /cron: '10 5 \* \* 2-6'/);
  assert.match(wf, /'10 5 \* \* 2-6'\) echo technical-world/);
  /* workflow_run nur von main: sonst verdraengt ein uebersprungener Zweig-Lauf den wartenden Nachtlauf in der Gruppe */
  assert.match(kopf, /- "Lange Kursreihen[^"]*"\n\s+types: \[completed\]\n\s+branches: \[main\]/);
  for (const n of ["Marktdaten-Refresh", "Quant 2.0 Product Intelligence Materialization", "Lange Kursreihen"]) assert.ok(kopf.includes('- "' + n), n);
  assert.match(wf, /group: technical-world-\$\{\{ github\.ref_name \}\}\s*\n\s+cancel-in-progress: false/);
  /* workflow_dispatch passiert die Job-Bedingung (nur workflow_run wird gefiltert) */
  assert.match(wf, /if: >-\s*\n\s+needs\.auswahl\.outputs\.technical_world == 'true' && \(\s*\n\s+github\.event_name != 'workflow_run' \|\|/);
  const at = (n) => wf.indexOf("- name: " + n);
  const build = at("Screener-Datensatz bauen"), vertrag = at("Datensatzvertrag"), commit = at("Commit");
  assert.ok(at("Engine-Tests") > 0 && at("Engine-Tests") < build && build < vertrag && vertrag < commit, "Tests und Vertrag vor dem Commit");
  const a = wf.slice(wf.indexOf("\n  technical-world-alarm:"));
  assert.match(a, /needs: \[auswahl, technical-world\]/);
  assert.match(a, /if: always\(\) && needs\.auswahl\.outputs\.technical_world == 'true' && github\.ref == 'refs\/heads\/main' && needs\.technical-world\.result != 'skipped'/);
  assert.match(a, /issues: write/);
  assert.match(a, /contents: read/);
  assert.doesNotMatch(a, /contents: write/);
  assert.match(a, /ALARM_SOURCE: technical-world/);
  assert.match(a, /RESULT_BUILD: \$\{\{ needs\.technical-world\.result \}\}/);
  assert.match(a, /node scripts\/ci\/pipeline-alarm\.mjs/);
});
