/* Eindeutige Pages-Build-Version je Lauf (pages-release.yml, Job deploy).
   actions/deploy-pages@v4 setzt pages_build_version = process.env.GITHUB_SHA. Ein zweiter Deploy desselben Commits mit neuem Inhalt
   wurde nicht uebernommen: Pages 42753904874 (10.11.2026 04:19) deployte die CI-Generation 2ff33541 als adbfda1c, live blieb
   e1d74267, und der Refresh 42744743112 schaltete danach den Vollumfang ab. Nachts gibt es oft keinen neuen Commit, Refresh und
   Universe-Release dispatchen trotzdem neue Daten. Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const text = readFileSync(join(ROOT, ".github", "workflows", "pages-release.yml"), "utf8");

/** Die Schritte des Jobs deploy (bis zum naechsten Job auf gleicher Ebene). */
function deployJob(src) {
  const a = src.indexOf("\n  deploy:\n");
  const b = src.indexOf("\n  company-intelligence-live:\n", a);
  return a >= 0 && b > a ? src.slice(a, b) : "";
}

test("PBV-1 · deploy-pages bekommt je Lauf und Versuch eine eigene Build-Version", () => {
  const job = deployJob(text);
  assert.ok(job, "Job deploy nicht gefunden");
  assert.match(job, /uses: actions\/deploy-pages@v4/);
  assert.match(job, /env:\n\s+GITHUB_SHA: \$\{\{ github\.sha \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\s*$/,
    "ohne eindeutige Version uebernimmt Pages einen Deploy desselben Commits nicht");
});

test("PBV-2 · deploy-pages liest die Build-Version aus GITHUB_SHA (gepinnte Version v4)", () => {
  // Gegenprobe der Annahme: wechselt die Action, muss dieser Test die neue Quelle der Build-Version pruefen.
  assert.equal((text.match(/actions\/deploy-pages@/g) || []).length, 1);
  assert.match(text, /actions\/deploy-pages@v4\b/);
});

test("PBV-3 · der Propagationsbeweis haengt weiter am Quell-Commit, nicht an der Deploy-Version", () => {
  assert.match(text, /EXPECTED_PRODUCTION_SHA: \$\{\{ needs\.package\.outputs\.source_sha \}\}/);
});
