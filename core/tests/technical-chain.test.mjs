/* Technical in der Nachtkette (01.11.2026): workflow_run auf den Marktlauf hat auf main nie gefeuert; der Marktlauf
   stoesst technical-world.yml deshalb selbst an - entkoppelt wie Supertrader, ohne PAT, ohne Anbieterabruf. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  assert.match(job, /gh workflow run technical-world\.yml --repo "\$GITHUB_REPOSITORY" --ref main/);
  assert.match(job, /ergebnis: \$\{\{ steps\.anstossen\.outcome == 'failure' && 'failure' \|\| 'success' \}\}/);
  /* der Alarm des Marktlaufs sieht den Anstoss */
  assert.match(wf, /\n  alarm:\n    needs: \[[^\]]*\btechnical\b[^\]]*\]/);
  assert.match(wf, /RESULT_TECHNICAL: \$\{\{ needs\.technical\.result == 'failure' && 'failure'/);
});

test("TC2 · technical-world.yml: Dispatch erlaubt, Zeitplan-Rueckfall, Tests vor dem Commit, eigener Alarm", () => {
  const wf = lies(".github/workflows/technical-world.yml");
  assert.match(wf, /\n  workflow_dispatch:/);
  assert.match(wf, /cron: '10 5 \* \* 2-6'/);
  assert.match(wf, /group: technical-world-\$\{\{ github\.ref_name \}\}\s*\n\s+cancel-in-progress: false/);
  /* workflow_dispatch passiert die Job-Bedingung (nur workflow_run wird gefiltert) */
  assert.match(wf, /if: >-\s*\n\s+github\.event_name != 'workflow_run' \|\|/);
  const at = (n) => wf.indexOf("- name: " + n);
  const build = at("Screener-Datensatz bauen"), vertrag = at("Datensatzvertrag"), commit = at("Commit");
  assert.ok(at("Engine-Tests") > 0 && at("Engine-Tests") < build && build < vertrag && vertrag < commit, "Tests und Vertrag vor dem Commit");
  const a = wf.slice(wf.indexOf("\n  alarm:"));
  assert.match(a, /needs: \[build\]/);
  assert.match(a, /if: always\(\) && github\.ref == 'refs\/heads\/main' && needs\.build\.result != 'skipped'/);
  assert.match(a, /issues: write/);
  assert.match(a, /contents: read/);
  assert.doesNotMatch(a, /contents: write/);
  assert.match(a, /ALARM_SOURCE: technical-world/);
  assert.match(a, /RESULT_BUILD: \$\{\{ needs\.build\.result \}\}/);
  assert.match(a, /node scripts\/ci\/pipeline-alarm\.mjs/);
});
