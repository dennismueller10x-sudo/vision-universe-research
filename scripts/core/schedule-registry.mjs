#!/usr/bin/env node
/* Zeitplan-Register (Plan Neustart §3: ein Zeitgeber).

   core/registry/schedule.json ist die einzige Liste aller Zeitplaene. Je Eintrag:
     timer "github"  der Cron steht noch im Workflow (Altbestand oder begruendete Ausnahme)
     timer "waker"   der Cloudflare-Wecker stoesst den Workflow an (worker-waker/src/zeitplan.mjs);
                     im Workflow steht KEIN Cron mehr.
   Vertragstest: core/tests/schedule-registry.test.mjs (SZ).

   Aufruf:
     node scripts/core/schedule-registry.mjs            Inventar: Register gegen Workflows, Abweichungen
     node scripts/core/schedule-registry.mjs --json     Inventar als JSON (alle Crons aus .github/workflows) */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Crons aus dem on.schedule-Block eines Workflows, mit Kommentar. */
export function workflowCrons(text) {
  const out = [];
  let inOn = false, inSched = false;
  for (const line of String(text).split("\n")) {
    if (/^("?on"?|true):\s*$/.test(line)) { inOn = true; continue; }
    if (inOn && /^\S/.test(line) && !/^#/.test(line)) { inOn = false; inSched = false; }
    if (!inOn) continue;
    if (/^ {2}schedule:\s*(#.*)?$/.test(line)) { inSched = true; continue; }
    if (inSched && /^ {2}[A-Za-z_]/.test(line)) { inSched = false; continue; }
    const m = inSched && /^\s*-\s*cron:\s*['"]([^'"]+)['"]\s*(?:#\s*(.*))?$/.exec(line);
    if (m) out.push({ cron: m[1].trim(), comment: (m[2] || "").trim() });
  }
  return out;
}

export function inventory(root = ROOT) {
  const dir = join(root, ".github/workflows");
  const rows = [];
  for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    for (const c of workflowCrons(readFileSync(join(dir, f), "utf8"))) rows.push({ workflow: f, ...c });
  }
  return rows;
}

export function loadRegistry(root = ROOT) {
  return JSON.parse(readFileSync(join(root, "core/registry/schedule.json"), "utf8"));
}

/* Abweichungen zwischen Register und Workflows. Leer = stimmig. */
export function drift(reg, inv) {
  const fehler = [];
  const key = (w, c) => w + " | " + c;
  const regKeys = new Map(reg.entries.map((e) => [key(e.workflow, e.cron), e]));
  for (const r of inv) {
    const e = regKeys.get(key(r.workflow, r.cron));
    if (!e) fehler.push("CRON_NICHT_IM_REGISTER: " + key(r.workflow, r.cron));
    else if (e.timer !== "github") fehler.push("CRON_TROTZ_WAKER: " + key(r.workflow, r.cron) + " (timer " + e.timer + ")");
  }
  const invKeys = new Set(inv.map((r) => key(r.workflow, r.cron)));
  for (const e of reg.entries) {
    if (e.timer === "github" && !invKeys.has(key(e.workflow, e.cron))) fehler.push("REGISTER_OHNE_CRON: " + key(e.workflow, e.cron) + " (timer github)");
  }
  return fehler;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = inventory();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(inv, null, 1)); process.exit(0); }
  const reg = loadRegistry();
  const n = (t) => reg.entries.filter((e) => e.timer === t).length;
  console.log(`Zeitplaene: ${reg.entries.length} (waker ${n("waker")}, github ${n("github")}); Crons in Workflows: ${inv.length} in ${new Set(inv.map((r) => r.workflow)).size} Dateien`);
  const d = drift(reg, inv);
  for (const x of d) console.log("  " + x);
  process.exitCode = d.length ? 1 : 0;
}
