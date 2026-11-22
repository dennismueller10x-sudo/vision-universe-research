/* ADR-005: Workflow-Eingaben nur über env:, nie ${{ inputs.* }} im Shell-Text.
   Geprüft werden Eingaben vom Typ string (frei) in run-Blöcken; choice/boolean/number sind begrenzt. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, ".github/workflows");

/* Eingabenamen mit Typ string (Standard bei fehlendem type) je Datei. */
function freeInputs(lines) {
  const names = new Set();
  let inInputs = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s{2,4}inputs:\s*$/.test(l)) { inInputs = true; continue; }
    if (inInputs && /^\s{0,3}\S/.test(l) && !/^\s{4,}/.test(l)) inInputs = false;
    if (!inInputs) continue;
    const flow = l.match(/^\s{6}([A-Za-z0-9_]+):\s*\{(.*)\}\s*$/);
    if (flow) { if (/type:\s*string/.test(flow[2]) || !/type:/.test(flow[2])) names.add(flow[1]); continue; }
    const m = l.match(/^\s{6}([A-Za-z0-9_]+):\s*$/);
    if (!m) continue;
    let type = "string";
    for (let j = i + 1; j < lines.length && /^\s{8,}/.test(lines[j]); j++) {
      const t = lines[j].match(/^\s{8}type:\s*(\S+)/);
      if (t) type = t[1];
    }
    if (type === "string") names.add(m[1]);
  }
  return names;
}

function runBlocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(- )?run:\s*(.*)$/);
    if (!m) continue;
    const ind = m[1].length + (m[2] ? 2 : 0);
    out.push([i + 1, m[3]]);
    if (/^[|>][-+]?$/.test(m[3])) {
      for (let j = i + 1; j < lines.length && (lines[j].trim() === "" || lines[j].length - lines[j].trimStart().length > ind); j++) out.push([j + 1, lines[j]]);
    }
  }
  return out;
}

test("WI-1 · kein freier Workflow-Eingabetext (string) im Shell-Text eines run-Blocks", () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".yml"))) {
    const lines = readFileSync(join(DIR, f), "utf8").split("\n");
    const names = freeInputs(lines);
    if (!names.size) continue;
    for (const [n, text] of runBlocks(lines)) {
      for (const e of text.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        for (const nm of names) if (new RegExp("\\binputs\\." + nm + "\\b").test(e[1])) bad.push(`${f}:${n} inputs.${nm}`);
      }
    }
  }
  assert.deepEqual(bad, [], "Eingaben über env: reichen (ADR-005)");
});
