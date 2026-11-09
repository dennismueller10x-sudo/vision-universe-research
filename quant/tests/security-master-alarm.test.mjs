// Security-Master-Wochenlauf: ein roter oder blockierter Lauf auf main meldet sich ueber pipeline-alarm
// (V1-Befund 30.10.2026: Lauf 40942100928 rot ohne Alarm). Keine Secrets, der Bote veraendert den Befund nicht.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = () => readFileSync(join(ROOT, ".github/workflows/security-master-weekly.yml"), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("SMA-1 · Alarm-Job nach dem Lauf, nur main, issues: write mit github.token, ohne Secrets", () => {
  const c = code();
  assert.match(c, /\n  alarm:\n\s+needs: refresh\n\s+if: always\(\) && github\.ref == 'refs\/heads\/main'\n/);
  assert.match(c, /\n  alarm:[\s\S]*permissions:\n\s+contents: read\n\s+issues: write\n\s+actions: read/);
  assert.match(c, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(c, /ALARM_SOURCE: security-master-weekly[\s\S]*RESULT_REFRESH: \$\{\{ needs\.refresh\.result \}\}[\s\S]*continue-on-error: true|continue-on-error: true[\s\S]*ALARM_SOURCE: security-master-weekly/);
  assert.match(c, /node scripts\/ci\/pipeline-alarm\.mjs/);
  assert.doesNotMatch(c, /secrets\./);
});
