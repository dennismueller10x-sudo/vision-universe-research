/* Workflow-Pipes (Steuerung 18.11.2026): Ein roter Test darf nicht grün gemeldet werden.
   GitHub startet `run:` ohne `shell:` als `bash -e {0}`, also OHNE pipefail. Dann ist der Exit-Code einer Pipe
   der des letzten Befehls: `python3 -m unittest … | tail -3` war grün, obwohl ein Test rot war
   (sec-fundamentals-daily, 18.11.2026). Regel: Jeder Schritt, der einen Test- oder Prüfbefehl durch tail, head oder tee
   leitet, setzt pipefail (oder läuft mit `shell: bash`, das pipefail mitbringt). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, ".github/workflows");
const FILES = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort();

/* Test- und Prüfbefehle: Testläufer und die Prüfskripte nach Namenskonvention (verify-, preflight-, assert-, check-). */
const CHECK = /(node --test|python3? -m unittest|pytest|\bverify-[\w-]*\.mjs|\bpreflight[\w-]*\.mjs|\bassert-[\w-]*\.mjs|\bcheck-[\w-]*\.mjs)/;
const PIPE = /\|\s*(tail|head|tee)\b/;
/* Deploys (Steuerung 18.11.2026): wrangler deploy/secret put in irgendeine Pipe (sed zum Maskieren, tee, tail) - ohne
   pipefail zaehlt der Exit-Code des letzten Befehls, ein gescheitertes Deploy saehe gruen aus. */
const DEPLOY = /\bwrangler(@[\w.]+)?\s+(deploy|secret\s+put|pages\s+deploy)\b/;

/** Schritte als Textblöcke: alle Listeneinträge unter einem `steps:`-Schlüssel. */
export function steps(text) {
  const lines = text.split("\n"), out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)steps:\s*$/.exec(lines[i]);
    if (!m) continue;
    const base = m[1].length;
    let item = -1, cur = null;
    for (let k = i + 1; k < lines.length; k++) {
      const l = lines[k];
      if (!l.trim() || /^\s*#/.test(l)) { if (cur) cur.push(l); continue; }
      const ind = l.length - l.trimStart().length;
      if (ind <= base && !(ind === base && /^\s*- /.test(l))) break;
      if (item < 0 && /^\s*- /.test(l)) item = ind;
      if (ind === item && /^\s*- /.test(l)) { if (cur) out.push(cur.join("\n")); cur = [l]; continue; }
      if (ind < item) break;
      if (cur) cur.push(l);
    }
    if (cur) out.push(cur.join("\n"));
  }
  return out;
}

/** Befunde je Schritt: ein Prüfbefehl in einer Pipe nach tail/head/tee ohne pipefail. */
export function findings(text) {
  const fileBash = /^defaults:\s*\n\s+run:\s*\n\s+shell:\s*bash\s*$/m.test(text);
  const res = [];
  for (const st of steps(text)) {
    if (fileBash || /^\s*shell:\s*bash\s*$/m.test(st) || /pipefail/.test(st)) continue;
    const joined = st.replace(/\\\n\s*/g, " ");          // Zeilenfortsetzungen zu einer Zeile
    for (const line of joined.split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const cmd = CHECK.exec(line), pipe = PIPE.exec(line);
      if (cmd && pipe && pipe.index > cmd.index) { res.push(line.trim().slice(0, 140)); continue; }
      const dep = DEPLOY.exec(line);
      if (dep && /(?<!\|)\|(?!\|)/.test(line.slice(dep.index))) res.push(line.trim().slice(0, 140));   // eine Pipe, kein ||
    }
  }
  return res;
}

test("PF-1 · Kein Prüf- oder Deploybefehl in einer Pipe ohne pipefail", () => {
  const all = [];
  for (const f of FILES) for (const x of findings(readFileSync(join(DIR, f), "utf8"))) all.push(`${f}: ${x}`);
  assert.deepEqual(all, [], "set -o pipefail setzen oder den Exit-Code durchreichen");
});

test("PF-2 · Die Prüfung erkennt den Fehler und seine Behebungen", () => {
  const step = (run) => `jobs:\n  a:\n    steps:\n      - name: T\n        run: |\n${run.split("\n").map((l) => "          " + l).join("\n")}\n      - name: U\n        run: echo ok\n`;
  assert.equal(findings(step("python3 -m unittest discover 2>&1 | tail -3")).length, 1);
  assert.equal(findings(step("node --test x.mjs \\\n  | tee log")).length, 1, "Zeilenfortsetzung");
  assert.equal(findings(step("set -o pipefail\nnode --test x.mjs | tail -8")).length, 0);
  assert.equal(findings(step("x=$(grep -o y f | head -1)")).length, 0, "kein Prüfbefehl");
  assert.equal(findings(step("# node --test x | tail")).length, 0, "Kommentar");
  assert.equal(findings(`jobs:\n  a:\n    steps:\n      - name: T\n        shell: bash\n        run: node --test x | tail -1\n`).length, 0);
  assert.equal(steps(step("echo a")).length, 2);
  assert.equal(findings(step("npx --yes wrangler@4.147.0 deploy 2>&1 | sed -E 's/x/y/g'")).length, 1, "Deploy durch sed");
  assert.equal(findings(step("printf '%s' \"$K\" | npx wrangler secret put K 2>&1 \\\n  | sed -E 's/x/y/'")).length, 1, "secret put");
  assert.equal(findings(step("set -o pipefail\nnpx wrangler deploy 2>&1 | tee /tmp/d.log")).length, 0);
  assert.equal(findings(step("npx wrangler deploy --dry-run")).length, 0, "ohne Pipe");
  assert.equal(findings(step("npx wrangler deploy || echo nein")).length, 0, "|| ist keine Pipe");
});
