#!/usr/bin/env node
// Friert den Datenstand eines Tests ein, der scripts/quant/lib/frozen-data.mjs importiert.
//   node scripts/quant/freeze-frozen-data.mjs --test quant/tests/foo.test.mjs [--max-mb 3] [--source origin/main]
// Ablauf: Test live unter dem Lese-Mitschnitt (muss gruen sein) -> Buendel neben dem Test -> Test auf dem Buendel (muss gruen sein);
// sonst wird das Buendel wieder geloescht und der Exit-Code ist 1. Eine Ausgabe je Test als JSON-Zeile.
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { REPO, packFixture } from "./lib/data-fixture.mjs";
import { frozenBundleFor } from "./lib/frozen-data.mjs";

/* Vollstaendiger Checkout (23.11.2026): Das Einfrieren in einem Checkout ohne Datenzweig-Overlay hat in #2281 ein Buendel ohne
   us-security-master.json erzeugt (Test uebersprungen, in der CI ENOENT, main rot). Darum: alle Pfade der Datenarten in Phase BRANCH_ONLY
   muessen liegen (scripts/ci/seed-data-branch.sh alle), kein Test darf beim Einfrieren uebersprungen werden, kein Lesen darf mit ENOENT enden. */
export function fehlendeDatenzweigPfade(root = REPO) {
  const reg = JSON.parse(readFileSync(join(root, "core/registry/data-branch.json"), "utf8"));
  const out = [];
  for (const d of reg.domains || []) {
    if (d.phase !== "BRANCH_ONLY" || d.repositoryOnly || d.pendingFirstRun) continue;
    for (const p of d.paths || []) if (!existsSync(join(root, p))) out.push(p);
  }
  return out;
}
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const isMain = process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href;
if (isMain) {
const testFile = arg("--test"), maxMb = Number(arg("--max-mb", 3));
/* --env K=V (mehrfach): Umgebung wie in der CI, z. B. SF9_E2E=1; sonst wuerde ein uebersprungener Test "gruen" einfrieren. */
const extraEnv = {}; process.argv.forEach((a, i) => { if (a === "--env" && process.argv[i + 1]) { const [k, ...v] = process.argv[i + 1].split("="); extraEnv[k] = v.join("="); } });
if (!testFile) throw Error("--test angeben");
const fail = (why, extra = {}) => { console.log(JSON.stringify({ test: testFile, ok: false, why, ...extra })); process.exit(1); };
const bundle = frozenBundleFor(join(REPO, testFile));
const fehlt = fehlendeDatenzweigPfade();
if (fehlt.length) fail("kein-voller-checkout (scripts/ci/seed-data-branch.sh alle ausfuehren)", { fehlt: fehlt.slice(0, 5), anzahl: fehlt.length });
rmSync(bundle, { force: true });
const traceDir = mkdtempSync(join(tmpdir(), "vu-trace-"));
const tracer = join(REPO, "scripts/quant/lib/trace-data-reads.cjs");
/* NODE_OPTIONS vererbt den Mitschnitt an Kindprozesse; jeder schreibt <pid>.json in TRACE_DIR. */
const live = spawnSync(process.execPath, ["--require", tracer, testFile],
  { cwd: REPO, env: { ...process.env, ...extraEnv, DATA_FIXTURE_LIVE: "1", TRACE_DIR: traceDir, NODE_OPTIONS: ((process.env.NODE_OPTIONS || "") + " --require=" + tracer).trim() }, encoding: "utf8", maxBuffer: 1 << 28, timeout: 1500000 });
if (live.status !== 0) fail("live-rot");
const tap = (o) => ({ pass: +(/^# pass (\d+)/m.exec(o) || [0, 0])[1], skipped: +(/^# skipped (\d+)/m.exec(o) || [0, 0])[1] });
const liveTap = tap(live.stdout);
if (liveTap.pass === 0) fail("nur-uebersprungen-oder-ohne-tests (mit --env wie in der CI)");
if (liveTap.skipped > 0) fail("test-uebersprungen (ein Buendel aus einem Lauf mit uebersprungenen Tests ist unvollstaendig; --env wie in der CI)", { skipped: liveTap.skipped });
const missingFiles = [...new Set(readdirSync(traceDir).filter((f) => f.endsWith(".missing")).flatMap((f) => JSON.parse(readFileSync(join(traceDir, f), "utf8"))))].sort();
if (missingFiles.length) fail("datei-fehlt (Lesen endete mit ENOENT)", { missing: missingFiles.slice(0, 5), anzahl: missingFiles.length });
const paths = [...new Set(readdirSync(traceDir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(traceDir, f), "utf8"))))].sort();
if (!paths.length) fail("liest-keine-datei-ueber-readFile");
let sourceCommit = arg("--source", "HEAD"); try { sourceCommit = execFileSync("git", ["rev-parse", sourceCommit], { cwd: REPO, encoding: "utf8" }).trim(); } catch {}
const buf = packFixture(paths, { test: testFile, sourceCommit, frozenAt: new Date().toISOString(), files: paths.length, checks: { fullCheckout: true, skipped: 0, missing: 0, pass: liveTap.pass } });
if (buf.length > maxMb * 1048576) fail("zu-gross", { bytes: buf.length });
mkdirSync(dirname(bundle), { recursive: true });
writeFileSync(bundle, buf);
const frozen = spawnSync(process.execPath, ["--test", testFile], { cwd: REPO, env: { ...process.env, ...extraEnv, DATA_FIXTURE_LIVE: "" }, encoding: "utf8", maxBuffer: 1 << 28, timeout: 1500000 });
if (frozen.status !== 0 || tap(frozen.stdout).pass === 0) { rmSync(bundle, { force: true }); fail("auf-bundle-rot", { tail: frozen.stdout.split("\n").filter((l) => /^not ok/.test(l)).slice(0, 3) }); }
console.log(JSON.stringify({ test: testFile, ok: true, files: paths.length, bytes: buf.length, bundle: bundle.slice(REPO.length + 1) }));
}
