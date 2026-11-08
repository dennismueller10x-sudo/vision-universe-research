#!/usr/bin/env node
/* Zeitplan-Register (Plan Neustart §3: ein Zeitgeber).

   core/registry/schedule.json ist die einzige Liste aller Zeitplaene. Je Eintrag:
     timer "github"  der Cron steht noch im Workflow (Altbestand oder begruendete Ausnahme)
     timer "waker"   der Cloudflare-Wecker stoesst den Workflow an (worker-waker/src/zeitplan.mjs);
                     im Workflow steht KEIN Cron mehr.
   Vertragstest: core/tests/schedule-registry.test.mjs (SZ).

   Aufruf:
     node scripts/core/schedule-registry.mjs            Inventar: Register gegen Workflows, Abweichungen
     node scripts/core/schedule-registry.mjs --json     Inventar als JSON (alle Crons aus .github/workflows)
     node scripts/core/schedule-registry.mjs --sync     Register nachziehen: neue Crons als timer github eintragen,
                                                        verschwundene github-Eintraege streichen. waker-Eintraege
                                                        bleiben unberuehrt (ihr Cron steht absichtlich nicht im Workflow). */
import { writeFileSync } from "node:fs";
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

/* Eingaenge von on.workflow_dispatch: Name -> { required, hasDefault, type, options }.
   Liest Block-Form (name:\n  type: ...) und Fluss-Form (name: {description: ..., default: ...}). */
export function dispatchInputs(text) {
  const lines = String(text).split("\n");
  const d = lines.findIndex((l) => /^ {2}workflow_dispatch:\s*$/.test(l));
  if (d < 0) return null;
  if (!/^ {4}inputs:\s*$/.test(lines[d + 1] || "")) return {};
  const out = {};
  let cur = null, inOpts = false;
  for (let i = d + 2; i < lines.length; i++) {
    const l = lines[i];
    if (/^ {0,4}\S/.test(l)) break;
    let m;
    if ((m = /^ {6}([A-Za-z0-9_-]+):\s*(\{.*\})?\s*$/.exec(l))) {
      cur = out[m[1]] = { required: false, hasDefault: false, type: "string", options: null }; inOpts = false;
      if (m[2]) {
        cur.required = /required:\s*true/.test(m[2]); cur.hasDefault = /default:/.test(m[2]);
        const t = /type:\s*([a-z]+)/.exec(m[2]); if (t) cur.type = t[1];
      }
      continue;
    }
    if (!cur) continue;
    if ((m = /^ {8}required:\s*(true|false)/.exec(l))) cur.required = m[1] === "true";
    else if (/^ {8}default:/.test(l)) cur.hasDefault = true;
    else if ((m = /^ {8}type:\s*([a-z]+)/.exec(l))) cur.type = m[1];
    else if ((m = /^ {8}options:\s*(\[.*\])?\s*$/.exec(l))) {
      cur.options = m[1] ? m[1].slice(1, -1).split(",").map((x) => x.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean) : [];
      inOpts = !m[1];
    } else if (inOpts && (m = /^ {10}- (.+)$/.exec(l))) cur.options.push(m[1].trim().replace(/^['"]|['"]$/g, ""));
    else if (/^ {8}\S/.test(l)) inOpts = false;
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

export function sync(reg, inv) {
  const key = (w, c) => w + " | " + c;
  const invKeys = new Set(inv.map((r) => key(r.workflow, r.cron)));
  const entries = reg.entries.filter((e) => e.timer !== "github" || invKeys.has(key(e.workflow, e.cron)));
  const have = new Set(entries.map((e) => key(e.workflow, e.cron)));
  const ids = new Set(entries.map((e) => e.id));
  for (const r of inv) {
    if (have.has(key(r.workflow, r.cron))) continue;
    const base = r.workflow.replace(/\.ya?ml$/, "");
    const label = (r.comment.split(/[ (]/)[0] || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    let id = base + (label ? "-" + label : ""), n = 1;
    while (ids.has(id)) id = base + (label ? "-" + label : "") + "-" + (++n);
    ids.add(id);
    const e = { id, workflow: r.workflow, cron: r.cron, timer: "github" };
    if (r.comment) e.note = r.comment;
    if (/^company-intelligence/.test(r.workflow)) e.ausnahme = "Company Intelligence: von Strang O ausdruecklich nicht angefasst (Auftrag 08.11.2026)";
    entries.push(e);
  }
  return { ...reg, entries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = inventory();
  if (process.argv.includes("--sync")) {
    const next = sync(loadRegistry(), inv);
    writeFileSync(join(ROOT, "core/registry/schedule.json"), JSON.stringify(next, null, 1) + "\n");
    console.log("Register nachgezogen: " + next.entries.length + " Eintraege");
  }
  if (process.argv.includes("--json")) { console.log(JSON.stringify(inv, null, 1)); process.exit(0); }
  const reg = loadRegistry();
  const n = (t) => reg.entries.filter((e) => e.timer === t).length;
  console.log(`Zeitplaene: ${reg.entries.length} (waker ${n("waker")}, github ${n("github")}); Crons in Workflows: ${inv.length} in ${new Set(inv.map((r) => r.workflow)).size} Dateien`);
  const d = drift(reg, inv);
  for (const x of d) console.log("  " + x);
  process.exitCode = d.length ? 1 : 0;
}
