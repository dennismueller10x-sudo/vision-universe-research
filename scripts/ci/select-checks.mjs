#!/usr/bin/env node
/**
 * Auswahl der Pruefungen im Buendel-Workflow ci.yml (Plan Neustart §3, Strang A).
 *
 * Vorher hatte jede Pruefung eine eigene Workflow-Datei, und GitHub entschied ueber deren
 * Pfadfilter, ob sie laeuft. Im Buendel entscheidet dieses Skript mit denselben Regeln:
 *   pull_request       eine Pruefung laeuft, wenn eine geaenderte Datei auf ihre PR-Pfade passt
 *   push               Zweig passt UND eine geaenderte Datei passt auf ihre Push-Pfade
 *   workflow_dispatch  genau die gewaehlte Pruefung (oder "alle")
 * Unbekannte Aenderungsmenge (GitHub kappt die Liste) heisst: alle in Frage kommenden laufen.
 *
 * Regeln: scripts/ci/ci-checks.json. Glob wie GitHub: "*" ohne "/", "**" beliebig tief.
 *
 * CLI: node scripts/ci/select-checks.mjs --checks scripts/ci/ci-checks.json --event E --ref R
 *        [--files datei] [--unknown-files] [--pruefung X]   -> schreibt key=true|false nach GITHUB_OUTPUT
 */
import { readFileSync, appendFileSync } from "node:fs";

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + re + "$");
}
const matchesAny = (globs, file) => (globs || []).some((g) => globToRegExp(g).test(file));
const branchOf = (ref) => String(ref || "").replace(/^refs\/heads\//, "");

/** @returns {Record<string, boolean>} */
export function select({ checks, event, ref, files, unknownFiles = false, pruefung = "" }) {
  const out = {};
  for (const [key, c] of Object.entries(checks)) {
    let run = false;
    if (event === "workflow_dispatch") run = c.dispatch !== false && (pruefung === key || pruefung === "alle");
    else if (event === "pull_request") run = !!c.pullRequest && (unknownFiles || files.some((f) => matchesAny(c.pullRequest.paths, f)));
    else if (event === "push") {
      const p = c.push;
      run = !!p && (p.branches ? p.branches.some((b) => globToRegExp(b).test(branchOf(ref))) : true) &&
        (!p.paths || unknownFiles || files.some((f) => matchesAny(p.paths, f)));
    }
    out[key] = run;
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("select-checks.mjs")) {
  const a = {}; const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) if (v[i].startsWith("--")) a[v[i].slice(2)] = v[i + 1] && !v[i + 1].startsWith("--") ? v[++i] : true;
  const checks = JSON.parse(readFileSync(a.checks, "utf8")).checks;
  const files = a.files ? readFileSync(a.files, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const r = select({ checks, event: a.event, ref: a.ref, files, unknownFiles: !!a["unknown-files"], pruefung: a.pruefung || "" });
  const lines = Object.entries(r).map(([k, x]) => `${k.replace(/-/g, "_")}=${x}`);
  console.log(`${files.length} geaenderte Dateien${a["unknown-files"] ? " (Liste unvollstaendig: alle in Frage kommenden)" : ""}`);
  for (const l of lines) console.log("  " + l);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
}
