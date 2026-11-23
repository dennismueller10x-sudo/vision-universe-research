import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const wf = readFileSync(new URL("../../.github/workflows/monitor.yml", import.meta.url), "utf8");
const job = wf.slice(wf.indexOf("\n  auswahl:\n"), wf.indexOf("\n    steps:", wf.indexOf("\n  auswahl:\n")));
const bedingung = (job.match(/\n    if: \$\{\{ (.+) \}\}\n/) || [])[1];

/* Ausdruck wie GitHub ihn auswertet, fuer die drei Faelle, auf die es ankommt. */
function auswerten(ereignis, lauf) {
  const github = { event_name: ereignis, event: { workflow_run: lauf } };
  const ausdruck = bedingung.replace(/github\.event_name/g, "github.event_name").replace(/github\.event\.workflow_run\./g, "github.event.workflow_run.");
  return new Function("github", "return " + ausdruck + ";")(github);
}

test("MA-1 Monitor: der Auswahl-Job startet nicht fuer abgebrochene oder uebersprungene pages-release-Laeufe (22.11.2026)", () => {
  assert.ok(bedingung, "auswahl hat eine Bedingung");
  const pages = "Quant 2.0 Production Pages";
  assert.equal(auswerten("workflow_run", { name: pages, conclusion: "cancelled" }), false);
  assert.equal(auswerten("workflow_run", { name: pages, conclusion: "skipped" }), false);
  assert.equal(auswerten("workflow_run", { name: pages, conclusion: "success" }), true);
  assert.equal(auswerten("workflow_run", { name: pages, conclusion: "failure" }), true, "fehlgeschlagene Auslieferung wird weiter geprueft");
});

test("MA-2 Monitor: andere Ausloeser bleiben unveraendert (dispatch, push, SEC-Laeufe auch bei Abbruch)", () => {
  assert.equal(auswerten("workflow_dispatch", {}), true);
  assert.equal(auswerten("push", {}), true);
  assert.equal(auswerten("workflow_run", { name: "SEC Fundamentals — Daily Incremental", conclusion: "cancelled" }), true);
});

test("MA-3 Monitor: jeder Folgejob haengt an auswahl, hat eine Bedingung auf dessen Ausgaben und kein always()", () => {
  const rest = wf.slice(wf.indexOf("\n  auswahl:\n") + 1);
  const folgejobs = [...rest.matchAll(/\n  ([a-z0-9-]+):\n(?:    [^\n]*\n)*?    needs: auswahl\n(?:    [^\n]*\n)*?    if: ([^\n]+)\n/g)];
  assert.ok(folgejobs.length >= 10, "die Folgejobs gefunden");
  for (const [, name, bed] of folgejobs) {
    assert.match(bed, /needs\.auswahl\.outputs\./, name + ": Bedingung haengt an der Auswahl");
    assert.ok(!/always\(\)|!cancelled\(\)/.test(bed), name + ": laeuft nicht trotz uebersprungener Auswahl");
  }
});
