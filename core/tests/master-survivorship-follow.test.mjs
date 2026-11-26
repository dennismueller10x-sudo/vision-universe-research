/* Stammfolge des Survivorship-Inventars (Steuerung 25.11.2026).
   Das Inventar (Erzeuger scripts/quant/build-survivorship-control.mjs) zaehlt die inaktiven Zeilen genau eines
   Security-Master-Stands und nennt dessen sha256. Am 25.11. schrieb security-master-weekly.yml um 09:43 UTC einen neuen
   Stamm; das Inventar folgte erst in der Nachtkette, und quant/tests/survivorship-control war ab 16 Uhr UTC (6-h-Grenze)
   auf jedem PR rot.
   Vertrag: Jeder Workflow-Job, der den Security Master committet, baut im selben Job den Stammabschnitt des Inventars
   neu (--master-only, ohne R2) und committet ihn mit. Nur Workflow-Text (TI-1). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = join(ROOT, ".github/workflows");
const MASTER = "security-master/us-security-master.json"; // Dateiname des Stamms, gelesen wird nur Workflow-Text
const INVENTAR = "product/survivorship-control-v1.json";

function jobs(text) {
  const flat = text.replace(/\\\n\s*/g, " ");
  const start = flat.search(/^jobs:\s*$/m);
  if (start < 0) return [];
  const out = [];
  let cur = null;
  for (const line of flat.slice(start).split("\n").slice(1)) {
    const m = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) { cur = { id: m[1], lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out.map((j) => ({ id: j.id, text: j.lines.join("\n") }));
}

/* Committet der Job den Stamm? Ueber PUSH_OWNED_PATHS (auch erweitert: PUSH_OWNED_PATHS="$PUSH_OWNED_PATHS ...")
   oder direkt im git add. Kopien des Stamms in Arbeitsordner (git show, cp nach $RUNNER_TEMP) zaehlen nicht. */
function committetStamm(text) {
  if (!/git commit/.test(text)) return false;
  const adds = text.match(/git add [^\n]+/g) || [];
  if (adds.some((a) => a.includes(MASTER))) return true;
  const owned = (text.match(/PUSH_OWNED_PATHS[:=][^\n]+/g) || []).some((l) => l.includes(MASTER));
  return owned && adds.some((a) => /\$PUSH_OWNED_PATHS/.test(a));
}

const schreiber = [];
for (const datei of readdirSync(WF_DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const text = readFileSync(join(WF_DIR, datei), "utf8");
  for (const job of jobs(text)) if (committetStamm(job.text)) schreiber.push({ datei, ...job });
}

test("MS-1 · die bekannten Stamm-Schreiber werden erkannt (liest der Test noch das Richtige?)", () => {
  const ids = schreiber.map((s) => s.datei);
  for (const erwartet of ["security-master-weekly.yml", "security-master-eligibility.yml"]) {
    assert.ok(ids.includes(erwartet), erwartet + " committet den Security Master, wird aber nicht erkannt");
  }
});

test("MS-2 · jeder Job, der den Security Master committet, baut den Stammabschnitt des Survivorship-Inventars neu und committet ihn", () => {
  for (const s of schreiber) {
    const wo = s.datei + "#" + s.id;
    assert.match(s.text, /node scripts\/quant\/build-survivorship-control\.mjs --master-only/, wo + ": Stamm ohne Stammfolge des Inventars");
    const adds = s.text.match(/git add [^\n]+/g) || [];
    const owned = (s.text.match(/PUSH_OWNED_PATHS[:=][^\n]+/g) || []).some((l) => l.includes(INVENTAR));
    assert.ok(adds.some((a) => a.includes(INVENTAR)) || owned, wo + ": das Inventar wird nicht mitcommittet");
  }
});
