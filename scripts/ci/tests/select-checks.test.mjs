/* Auswahl im Buendel ci.yml: dieselben Regeln wie die frueheren Workflow-Pfadfilter. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globToRegExp, select } from "../select-checks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CHECKS = JSON.parse(readFileSync(join(ROOT, "scripts/ci/ci-checks.json"), "utf8")).checks;
const on = (r) => Object.keys(r).filter((k) => r[k]).sort();

test("SC-1 · Glob wie GitHub: * bleibt im Ordner, ** geht in die Tiefe", () => {
  assert.ok(globToRegExp("ask/**").test("ask/tests/a.test.mjs"));
  assert.ok(globToRegExp(".github/workflows/brevo-*.yml").test(".github/workflows/brevo-admin.yml"));
  assert.ok(!globToRegExp(".github/workflows/brevo-*.yml").test(".github/workflows/x/brevo-a.yml"));
  assert.ok(globToRegExp("etf/**").test("etf/index.html"));
  assert.ok(!globToRegExp("etf/**").test("etfx/index.html"));
});

test("SC-2 · PR: nur die Pruefungen der beruehrten Pfade", () => {
  assert.deepEqual(on(select({ checks: CHECKS, event: "pull_request", ref: "refs/pull/1/merge", files: ["screener/engine/x.js"] })), ["ask", "screener"]);
  assert.deepEqual(on(select({ checks: CHECKS, event: "pull_request", ref: "", files: ["README.md"] })), []);
  assert.deepEqual(on(select({ checks: CHECKS, event: "pull_request", ref: "", files: ["authoring/requests/a.json"] })), ["creative-job-guard"]);
});

test("SC-3 · Push: Zweigfilter bleibt (Brevo nur auf seinem Zweig, Research Access ueberall)", () => {
  const f = ["scripts/brevo/a.py", "scripts/access-gate/x.mjs"];
  assert.deepEqual(on(select({ checks: CHECKS, event: "push", ref: "refs/heads/main", files: f })), ["research-access"]);
  assert.deepEqual(on(select({ checks: CHECKS, event: "push", ref: "refs/heads/feat/brevo-newsletter-isolated", files: f })), ["brevo", "research-access"]);
});

test("SC-4 · Dispatch: genau die gewaehlte, oder alle mit Dispatch", () => {
  assert.deepEqual(on(select({ checks: CHECKS, event: "workflow_dispatch", ref: "", files: [], pruefung: "vorsorge" })), ["vorsorge"]);
  const alle = on(select({ checks: CHECKS, event: "workflow_dispatch", ref: "", files: [], pruefung: "alle" }));
  assert.ok(alle.includes("ask") && !alle.includes("brevo") && !alle.includes("creative-job-guard"), alle.join(","));
});

test("SC-5 · Unvollstaendige Dateiliste: alle in Frage kommenden laufen (fail open)", () => {
  const r = on(select({ checks: CHECKS, event: "pull_request", ref: "", files: [], unknownFiles: true }));
  assert.equal(r.length, Object.values(CHECKS).filter((c) => c.pullRequest).length);
});

test("SC-6 · Jede Pruefung in ci-checks.json hat einen Job in ci.yml und umgekehrt", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
  /* Eine Pruefung ist ein Job <pruefung> oder, bei mehreren Jobs der Quelle (Stufe 3), Jobs <pruefung>-<job>
     unter dem Kopfkommentar `# --- <pruefung>:`; jeder Job haengt an der eigenen Ausgabe der Auswahl. */
  const jobs = [...wf.matchAll(/^  ([a-z0-9-]+):\n    needs: auswahl\n    if: (?:>-\n\s+)?needs\.auswahl\.outputs\.([a-z0-9_]+) == 'true'/gm)];
  const teile = [...new Set(jobs.map((m) => m[2].replace(/_/g, "-")))].sort();
  assert.deepEqual(teile, Object.keys(CHECKS).sort());
  for (const [, id, out] of jobs) {
    const teil = out.replace(/_/g, "-");
    assert.ok(id === teil || id.startsWith(teil + "-"), `${id}: Job gehoert nicht zur Pruefung ${teil}`);
    if (id !== teil) assert.match(wf, new RegExp(`\\n  # --- ${teil}:`), `${teil}: Kopfkommentar fuer Mehrjob-Pruefung fehlt`);
  }
  for (const k of Object.keys(CHECKS)) assert.match(wf, new RegExp(`${k.replace(/-/g, "_")}: \\$\\{\\{ steps\\.wahl\\.outputs\\.${k.replace(/-/g, "_")} \\}\\}`));
});
