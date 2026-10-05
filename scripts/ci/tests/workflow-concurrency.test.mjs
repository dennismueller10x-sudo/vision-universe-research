/* Ein PR-Lauf darf keine Concurrency-Gruppe mit Produktions-, Anbieter-
   oder Zustandslaeufen teilen. GitHub haelt je Gruppe einen laufenden und
   EINEN wartenden Lauf; ein neuer wartender ersetzt den alten. Mit einer
   festen Gruppe verdraengte so ein PR-Lauf am 02.10.2026 16:47 UTC einen
   wartenden Pages-Deploy von main (37036176464), die Seite stand 38 min
   ohne diesen Stand. Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows");

/** Liest die Workflow-Ebene: hat er pull_request, und wie heisst die Gruppe? */
export function concurrencyOf(text) {
  const lines = text.split("\n");
  const onIdx = lines.findIndex((l) => /^on:\s*$/.test(l) || /^on:\s*\S/.test(l));
  let pullRequest = /^on:.*\bpull_request\b/.test(lines[onIdx] || "");
  if (!pullRequest && onIdx >= 0) {
    for (let i = onIdx + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
      if (/^  pull_request(:|\s*$)/.test(lines[i])) pullRequest = true;
    }
  }
  const cIdx = lines.findIndex((l) => /^concurrency:/.test(l));
  let group = null;
  if (cIdx >= 0) {
    const inline = lines[cIdx].replace(/^concurrency:\s*/, "").trim();
    if (inline) group = inline;
    for (let i = cIdx + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
      const m = lines[i].match(/^\s+group:\s*(.+)$/);
      if (m) group = m[1].trim();
    }
  }
  return { pullRequest, group };
}

/** Eine Gruppe trennt PR-Laeufe, wenn sie vom Ereignis, der Ref oder der PR-Nummer abhaengt. */
export function separatesPullRequests(group) {
  return /github\.(event_name|ref|ref_name|head_ref|event\.pull_request|run_id|sha)\b/.test(group);
}

test("Kein PR-Workflow teilt eine feste Concurrency-Gruppe", () => {
  const verstoesse = [];
  for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    const { pullRequest, group } = concurrencyOf(readFileSync(join(DIR, f), "utf8"));
    if (pullRequest && group && !separatesPullRequests(group)) verstoesse.push(`${f}: ${group}`);
  }
  assert.deepEqual(verstoesse, []);
});

test("Erkennung: feste Gruppe mit pull_request wird gefunden", () => {
  const wf = "on:\n  pull_request:\n  push:\n    branches: [main]\nconcurrency:\n  group: pages-production\n  cancel-in-progress: false\njobs: {}\n";
  const c = concurrencyOf(wf);
  assert.equal(c.pullRequest, true);
  assert.equal(c.group, "pages-production");
  assert.equal(separatesPullRequests(c.group), false);
});

test("Erkennung: Gruppe je PR gilt als getrennt, Workflow ohne pull_request ist frei", () => {
  assert.equal(separatesPullRequests("${{ github.event_name == 'pull_request' && format('x-pr-{0}', github.event.pull_request.number) || 'x' }}"), true);
  assert.equal(concurrencyOf("on:\n  schedule:\n    - cron: '1 1 * * *'\nconcurrency:\n  group: x\njobs: {}\n").pullRequest, false);
  assert.equal(concurrencyOf("on: [push, pull_request]\nconcurrency: fixed\n").group, "fixed");
});
