#!/usr/bin/env node
/* Umstellung eines Workflows vom GitHub-Cron auf den Cloudflare-Wecker (Plan Neustart §3, RUNBOOK §10).

   node scripts/core/schedule-cutover.mjs <workflow.yml> [--dry]

   Mechanisch, danach von Hand pruefen (Eingaben, die beim Zeitplan leer waeren, beim Dispatch aber einen
   Standardwert tragen, stehen im Bericht und gehoeren ggf. als "inputs" in den Registereintrag):
     1. alle Crons des Workflows raus (der Block schedule: verschwindet, wenn er leer ist)
     2. workflow_dispatch bekommt den Eingang zeitplan, oben steht der run-name mit Marke
     3. die Weiche: github.event.schedule -> (github.event.schedule || inputs.zeitplan),
        github.event_name == 'schedule' -> (… || inputs.zeitplan != '')  (bleibt ein Wahrheitswert),
        github.event_name == 'workflow_dispatch' -> (… && !inputs.zeitplan),
        ${{ github.event_name }} und $GITHUB_EVENT_NAME -> Ereignis, das beim Takt "schedule" heisst (VU_EVENT)
     4. im Register: timer waker fuer alle Eintraege des Workflows (selber Commit, kein Doppelstart) */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { workflowCrons } from "./schedule-registry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RUN_NAME = "run-name: ${{ inputs.zeitplan && format('{0} · Takt {1}', github.workflow, inputs.zeitplan) || '' }}";
const EVENT = "inputs.zeitplan && 'schedule' || github.event_name";

export function cutover(text) {
  const notes = [];
  let lines = text.split("\n");
  // 1. Crons raus
  const onIdx = lines.findIndex((l) => /^("?on"?|true):\s*$/.test(l));
  if (onIdx < 0) throw new Error("KEIN_ON_BLOCK");
  const sIdx = lines.findIndex((l, i) => i > onIdx && /^ {2}schedule:\s*(#.*)?$/.test(l));
  if (sIdx < 0) throw new Error("KEIN_SCHEDULE");
  let end = sIdx + 1;
  while (end < lines.length && /^ {4,}\S/.test(lines[end])) end++;
  const block = lines.slice(sIdx + 1, end);
  if (block.some((l) => l.trim() && !/^\s*-\s*cron:/.test(l) && !/^\s*#/.test(l))) throw new Error("UNERWARTET_IM_SCHEDULE_BLOCK");
  lines.splice(sIdx, end - sIdx);
  // 2. Eingang zeitplan
  const dIdx = lines.findIndex((l, i) => i > onIdx && /^ {2}workflow_dispatch:\s*(\{\s*\})?\s*(#.*)?$/.test(l));
  const zeitplan = ["      zeitplan:", "        description: 'Vom Cloudflare-Wecker gesetzt (Cron des Termins, core/registry/schedule.json); manuell leer lassen'", "        type: string", "        default: ''"];
  if (dIdx < 0) {
    const rest = lines.findIndex((l, i) => i > onIdx && /^\S/.test(l) && !/^#/.test(l));
    lines.splice(rest < 0 ? lines.length : rest, 0, "  workflow_dispatch:", "    inputs:", ...zeitplan);
  } else {
    lines[dIdx] = "  workflow_dispatch:";
    if (/^ {4}inputs:\s*$/.test(lines[dIdx + 1] || "")) lines.splice(dIdx + 2, 0, ...zeitplan);
    else lines.splice(dIdx + 1, 0, "    inputs:", ...zeitplan);
  }
  // run-name vor on:
  const on2 = lines.findIndex((l) => /^("?on"?|true):\s*$/.test(l));
  if (lines.some((l) => /^run-name:/.test(l))) {
    notes.push("run-name vorhanden: von Hand ergaenzen, beim Takt muss der Titel auf ' · Takt <cron>' enden (SZ-2)");
    lines.splice(on2, 0, "# Zeitplan: core/registry/schedule.json, Takt ueber den Cloudflare-Wecker (RUNBOOK §10).");
  } else lines.splice(on2, 0, "# Zeitplan: core/registry/schedule.json, Takt ueber den Cloudflare-Wecker (RUNBOOK §10).", RUN_NAME);
  let out = lines.join("\n");
  // 3. Weiche
  out = out.replace(/github\.event\.schedule(?! \|\| inputs\.zeitplan)/g, "(github.event.schedule || inputs.zeitplan)")
    .replace(/\$\{\{ \(github\.event\.schedule \|\| inputs\.zeitplan\) \}\}/g, "${{ github.event.schedule || inputs.zeitplan }}")
    .replace(/github\.event_name != 'schedule'/g, "!(github.event_name == 'schedule' || inputs.zeitplan != '')")
    .replace(/github\.event_name != 'workflow_dispatch'/g, "!(github.event_name == 'workflow_dispatch' && !inputs.zeitplan)")
    .replace(/github\.event_name == 'schedule'(?! \|\| inputs\.zeitplan)/g, "(github.event_name == 'schedule' || inputs.zeitplan != '')")
    .replace(/github\.event_name == 'workflow_dispatch'(?! && !inputs\.zeitplan)/g, "(github.event_name == 'workflow_dispatch' && !inputs.zeitplan)")
    .replace(/\$\{\{\s*github\.event_name\s*\}\}/g, "${{ " + EVENT + " }}");
  // YAML: ein Wert, der mit "!" beginnt, ist ein Tag, kein Ausdruck (09.11.2026: core-ci.yml nach #1687 ungueltig).
  // Beginnt eine if:-Bedingung nach der Umstellung mit "!", wird sie in ${{ }} gefasst (SZ-12).
  out = out.split("\n").map((l) => l.replace(/^(\s*-?\s*if:\s*)(!.*)$/, (m, k, v) => k + "${{ " + v.trim() + " }}")).join("\n");
  // ADR-005: Eingaben nie per ${{ }} in den Shell-Text. Wo der Zeitplan dort stand, kommt er ueber env VU_SCHEDULE.
  out = out.split("\n").map((l) => (/\$\{\{[^}]*inputs\.zeitplan[^}]*\}\}/.test(l) && !/^\s*-?\s*[A-Za-z_][A-Za-z0-9_-]*:\s*\$\{\{/.test(l))
    ? l.replace(/\$\{\{ github\.event\.schedule \|\| inputs\.zeitplan \}\}/g, "${VU_SCHEDULE}").replace(/\$\{\{ inputs\.zeitplan && 'schedule' \|\| github\.event_name \}\}/g, "${VU_EVENT}")
    : l).join("\n");
  for (const [name, expr] of [["VU_SCHEDULE", "github.event.schedule || inputs.zeitplan"], ["VU_EVENT", EVENT]]) {
    if (!out.includes("${" + name + "}") || new RegExp("^  " + name + ":", "m").test(out)) continue;
    const ls = out.split("\n");
    const envIdx = ls.findIndex((l) => /^env:\s*$/.test(l));
    if (envIdx >= 0) ls.splice(envIdx + 1, 0, "  " + name + ": ${{ " + expr + " }}");
    else { const j = ls.findIndex((l) => /^jobs:\s*$/.test(l)); ls.splice(j, 0, "env:", "  # Wie vor der Umstellung: ein Takt des Weckers heisst schedule und traegt seinen Cron (ADR-005: ueber env, nicht im Shell-Text).", "  " + name + ": ${{ " + expr + " }}", ""); }
    out = ls.join("\n");
  }
  // Doppelte Klammern aus "(github.event_name == 'schedule')" vermeiden ist kosmetisch; YAML/Ausdruck bleiben gueltig.
  if (/GITHUB_EVENT_NAME/.test(out)) {
    out = out.replace(/\$\{GITHUB_EVENT_NAME\}|\$GITHUB_EVENT_NAME\b/g, "${VU_EVENT}");
    const ls = out.split("\n");
    const envIdx = ls.findIndex((l) => /^env:\s*$/.test(l));
    if (/^  VU_EVENT:/m.test(out)) { /* schon da */ }
    else if (envIdx >= 0) ls.splice(envIdx + 1, 0, "  VU_EVENT: ${{ " + EVENT + " }}");
    else { const j = ls.findIndex((l) => /^jobs:\s*$/.test(l)); ls.splice(j, 0, "env:", "  # Ereignis wie vor der Umstellung: ein Takt des Weckers heisst schedule.", "  VU_EVENT: ${{ " + EVENT + " }}", ""); }
    out = ls.join("\n");
    if (/GITHUB_EVENT_NAME/.test(out)) notes.push("GITHUB_EVENT_NAME noch vorhanden - von Hand pruefen");
    notes.push("GITHUB_EVENT_NAME -> VU_EVENT ersetzt");
  }
  // Eingaben mit Standardwert: beim Takt tragen sie den Standard, beim GitHub-Zeitplan waren sie leer
  const inputs = [...out.matchAll(/^ {6}([A-Za-z0-9_-]+):\s*\n((?: {8}.*\n)+)/gm)].map((m) => ({ name: m[1], body: m[2] }))
    .filter((x) => x.name !== "zeitplan" && /default:/.test(x.body));
  for (const i of inputs) notes.push("Eingabe mit Standardwert beim Takt: " + i.name + " = " + /default:\s*(.*)/.exec(i.body)[1].trim());
  return { text: out, notes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = process.argv[2];
  if (!f) { console.error("Aufruf: schedule-cutover.mjs <workflow.yml> [--dry]"); process.exit(2); }
  const path = join(ROOT, ".github/workflows", f);
  const before = readFileSync(path, "utf8");
  const crons = workflowCrons(before).map((c) => c.cron);
  const { text, notes } = cutover(before);
  const regPath = join(ROOT, "core/registry/schedule.json");
  const reg = JSON.parse(readFileSync(regPath, "utf8"));
  const entries = reg.entries.filter((e) => e.workflow === f);
  for (const c of crons) if (!entries.some((e) => e.cron === c)) throw new Error("CRON_NICHT_IM_REGISTER:" + c);
  for (const e of entries) if (e.ausnahme) throw new Error("AUSNAHME:" + e.id + " " + e.ausnahme);
  if (!process.argv.includes("--dry")) {
    writeFileSync(path, text);
    for (const e of entries) e.timer = "waker";
    writeFileSync(regPath, JSON.stringify(reg, null, 1) + "\n");
  }
  console.log(f + ": " + crons.length + " Crons -> waker (" + entries.map((e) => e.id).join(", ") + ")");
  for (const n of notes) console.log("  " + n);
}
