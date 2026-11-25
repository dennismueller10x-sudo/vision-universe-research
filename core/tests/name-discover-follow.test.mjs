/* Firmennamen ziehen Discover nach (Steuerung 25.11.2026).
   Suchindex und Aktienseiten von Discover zeigen den Namen aus
   der Namensschicht (security-master/company-names.json). Am 25.11. schrieb
   security-master-weekly.yml neue Namen (BKHA -> Vesicor Therapeutics Holdings),
   ohne Discover neu zu bauen. Bis zum Nachtlauf war NM3 (discover/tests/names.test.mjs)
   auf jedem PR rot.
   Vertrag: Jeder Workflow-Job, der company-names.json committet, baut im selben Job
   Discover mit dem Erzeuger neu und committet die Discover-Daten mit. Nur Quelltext, keine
   Live-Artefakte (TI-1). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = join(ROOT, ".github/workflows");
const NAMES = "security-master/company-names.json"; // Dateiname der Namensschicht, gelesen wird nur Workflow-Text

/* Jobs eines Workflows: Bloecke mit zwei Leerzeichen Einzug unter `jobs:`.
   Fortgesetzte Zeilen (`\` am Zeilenende) werden zusammengezogen. */
function jobs(text) {
  const flat = text.replace(/\\\n\s*/g, " ");
  const start = flat.search(/^jobs:\s*$/m);
  if (start < 0) return [];
  const body = flat.slice(start).split("\n").slice(1);
  const out = [];
  let cur = null;
  for (const line of body) {
    const m = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (m) { cur = { id: m[1], lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return out.map((j) => ({ id: j.id, text: j.lines.join("\n") }));
}

/* Committet der Job die Namensschicht? Direkt im `git add` oder ueber
   PUSH_OWNED_PATHS, das ein `git add $PUSH_OWNED_PATHS` aufnimmt. */
function committetNamen(text) {
  if (!/git commit/.test(text)) return false;
  const adds = text.match(/git add [^\n]+/g) || [];
  if (adds.some((a) => a.includes(NAMES))) return true;
  const owned = (text.match(/PUSH_OWNED_PATHS:[^\n]+/g) || []).some((l) => l.includes(NAMES));
  return owned && adds.some((a) => /\$PUSH_OWNED_PATHS|\$\{?PUSH_OWNED_PATHS/.test(a) || /for pfad in \$PUSH_OWNED_PATHS/.test(text));
}

const schreiber = [];
for (const datei of readdirSync(WF_DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
  const text = readFileSync(join(WF_DIR, datei), "utf8");
  for (const job of jobs(text)) if (committetNamen(job.text)) schreiber.push({ datei, ...job });
}

test("NF-1 · die bekannten Namens-Schreiber werden erkannt (liest der Test noch das Richtige?)", () => {
  const ids = schreiber.map((s) => s.datei);
  for (const erwartet of ["security-master-weekly.yml", "security-master-eligibility.yml", "pipeline-weekly.yml"]) {
    assert.ok(ids.includes(erwartet), erwartet + " committet company-names.json, wird aber nicht erkannt");
  }
});

test("NF-2 · jeder Job, der Firmennamen committet, baut Discover mit dem Erzeuger neu und committet die Discover-Daten", () => {
  for (const s of schreiber) {
    const wo = s.datei + "#" + s.id;
    const bau = s.text.indexOf("node scripts/discover/build-discover-data.mjs");
    assert.ok(bau >= 0, wo + ": committet Firmennamen ohne Discover-Neubau (scripts/discover/build-discover-data.mjs)");
    assert.ok(s.text.indexOf("node scripts/discover/verify-discover-data.mjs", bau) > bau,
      wo + ": Discover-Neubau ohne Nachpruefung (verify-discover-data.mjs)");
    const adds = s.text.match(/git add [^\n]+/g) || [];
    const mitDiscover = adds.some((a) => /(^|\s)discover\/data(\/|\s|$)/.test(a)) ||
      (/for pfad in [^\n]*discover\/data/.test(s.text) && adds.some((a) => /\$pfad/.test(a)));
    assert.ok(mitDiscover, wo + ": die Discover-Daten werden nicht mitcommittet");
  }
});
