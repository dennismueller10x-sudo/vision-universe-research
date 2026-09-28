#!/usr/bin/env node
/* =========================================================================
   DIE SUITE, MIT EINEM BERICHT.

   Gate 12 (REGRESSION_GUARDS) darf nicht behaupten, die Suite sei grün -
   es muss es belegen können. Dieser Läufer führt die Suite aus und schreibt
   das Ergebnis mit dem Commit, gegen den es entstanden ist. Ein Bericht aus
   einem anderen Commit ist für das Gate kein Beleg.

   Ausführen:
     node scripts/vu2/run-suite-report.mjs [--out .launch/test-suite.json]
                                           [--pattern "quant/tests/*.test.mjs"]
   ========================================================================= */
import { writeFile, mkdir } from "node:fs/promises";
import { spawnSync, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : f; };
const OUT = arg("out", join(ROOT, ".launch/test-suite.json"));
const MUSTER = argv.filter((a, i) => a === "--pattern" ? false : argv[i - 1] === "--pattern").length
  ? argv[argv.indexOf("--pattern") + 1] : "quant/tests/*.test.mjs";

const start = Date.now();
const lauf = spawnSync(process.execPath, ["--test", MUSTER], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const ausgabe = (lauf.stdout || "") + (lauf.stderr || "");
const zahl = (name) => {
  const m = ausgabe.match(new RegExp("^# " + name + " (\\d+)$", "m"));
  return m ? parseInt(m[1], 10) : null;
};
/* Jeder Fehlschlag mit seinem Namen - ein Gate, das nur eine Zahl kennt,
   sagt einem Leser nicht, was kaputt ist. */
const fehler = (ausgabe.match(/^not ok \d+ - .*$/gm) || []).map((z) => z.replace(/^not ok \d+ - /, ""));

const bericht = {
  schemaVersion: "test-suite-1.0.0",
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
  commit: (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim(); } catch { return null; } })(),
  pattern: MUSTER,
  durationMs: Date.now() - start,
  tests: zahl("tests"), pass: zahl("pass"), fail: zahl("fail"),
  suites: zahl("suites"), skipped: zahl("skipped"), todo: zahl("todo"),
  exitCode: lauf.status,
  failures: fehler
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");
process.stdout.write("Suite " + bericht.tests + " Tests · " + bericht.pass + " pass · " + bericht.fail +
  " fail · " + Math.round(bericht.durationMs / 1000) + " s\n" + OUT + "\n");
if (fehler.length) for (const f of fehler.slice(0, 20)) process.stdout.write("  FAIL " + f + "\n");
process.exit(bericht.fail === 0 && bericht.exitCode === 0 ? 0 : 1);
