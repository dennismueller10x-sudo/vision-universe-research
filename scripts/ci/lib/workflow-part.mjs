/* Text eines Teils aus einer Buendeldatei (core/registry/workflow-bundles.json), fuer Vertragstests, die frueher
   die eigene Workflow-Datei der Quelle gelesen haben. Ein Teil ist der Job `<teil>` bzw. die Jobs `<teil>-<job>`
   samt Kopfkommentar `# --- <teil>:`; mit `auswahl: true` kommt der Auswahl-Job dazu (Ausloeser des Teils). */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function workflowPart(root, file, teil, { auswahl = false } = {}) {
  const text = readFileSync(join(root, ".github", "workflows", file), "utf8");
  const lines = text.split("\n");
  const out = [];
  let inPart = false;
  for (const line of lines) {
    const head = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    const comment = /^  # --- ([A-Za-z0-9_-]+):/.exec(line);
    if (comment) inPart = comment[1] === teil;
    else if (head) inPart = head[1] === teil || head[1].startsWith(teil + "-") && inPart || head[1] === teil;
    if (inPart) out.push(line);
  }
  if (!out.length) throw new Error(`Teil ${teil} fehlt in ${file}`);
  let part = out.join("\n") + "\n";
  if (auswahl) {
    const a = text.indexOf("\n  auswahl:\n"), b = text.indexOf("\n  # --- ", a);
    part = text.slice(a + 1, b < 0 ? undefined : b + 1) + part;
  }
  return part;
}

/* Ausloeseregeln eines Teils aus dem Auswahl-Job (eingebettete SPEC des Generators): {dispatch, crons, push,
   workflow_run, repository_dispatch, required}. Fehlt ein Schluessel, loest der Teil darauf nicht aus. */
export function partTriggers(root, file, teil) {
  const text = readFileSync(join(root, ".github", "workflows", file), "utf8");
  const m = /SPEC = json\.loads\(r"""(.*?)"""\)/s.exec(text);
  if (!m) throw new Error(`Keine Auswahl-SPEC in ${file}`);
  const spec = JSON.parse(m[1]);
  if (!spec[teil]) throw new Error(`Teil ${teil} fehlt in der Auswahl von ${file}`);
  return spec[teil];
}

/* Kopf der Buendeldatei (name, on, permissions), z. B. fuer Eingaben. */
export function workflowHead(root, file) {
  return readFileSync(join(root, ".github", "workflows", file), "utf8").split("\njobs:\n")[0];
}
