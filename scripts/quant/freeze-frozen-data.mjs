#!/usr/bin/env node
// Friert den Datenstand eines Tests ein, der scripts/quant/lib/frozen-data.mjs importiert.
//   node scripts/quant/freeze-frozen-data.mjs --test quant/tests/foo.test.mjs [--max-mb 3] [--source origin/main]
// Ablauf: Test live unter dem Lese-Mitschnitt (muss gruen sein) -> Buendel neben dem Test -> Test auf dem Buendel (muss gruen sein);
// sonst wird das Buendel wieder geloescht und der Exit-Code ist 1. Eine Ausgabe je Test als JSON-Zeile.
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { REPO, packFixture } from "./lib/data-fixture.mjs";
import { frozenBundleFor } from "./lib/frozen-data.mjs";

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const testFile = arg("--test"), maxMb = Number(arg("--max-mb", 3));
if (!testFile) throw Error("--test angeben");
const fail = (why, extra = {}) => { console.log(JSON.stringify({ test: testFile, ok: false, why, ...extra })); process.exit(1); };
const bundle = frozenBundleFor(join(REPO, testFile));
rmSync(bundle, { force: true });
const trace = join(mkdtempSync(join(tmpdir(), "vu-trace-")), "reads.json");
const live = spawnSync(process.execPath, ["--require", join(REPO, "scripts/quant/lib/trace-data-reads.cjs"), testFile],
  { cwd: REPO, env: { ...process.env, DATA_FIXTURE_LIVE: "1", TRACE_OUT: trace }, encoding: "utf8", maxBuffer: 1 << 28, timeout: 900000 });
if (live.status !== 0) fail("live-rot");
const paths = JSON.parse(readFileSync(trace, "utf8"));
if (!paths.length) fail("liest-keine-datei-ueber-readFile");
let sourceCommit = arg("--source", "HEAD"); try { sourceCommit = execFileSync("git", ["rev-parse", sourceCommit], { cwd: REPO, encoding: "utf8" }).trim(); } catch {}
const buf = packFixture(paths, { test: testFile, sourceCommit, frozenAt: new Date().toISOString(), files: paths.length });
if (buf.length > maxMb * 1048576) fail("zu-gross", { bytes: buf.length });
mkdirSync(dirname(bundle), { recursive: true });
writeFileSync(bundle, buf);
const frozen = spawnSync(process.execPath, ["--test", testFile], { cwd: REPO, env: { ...process.env, DATA_FIXTURE_LIVE: "" }, encoding: "utf8", maxBuffer: 1 << 28, timeout: 900000 });
if (frozen.status !== 0) { rmSync(bundle, { force: true }); fail("auf-bundle-rot", { tail: frozen.stdout.split("\n").filter((l) => /^not ok/.test(l)).slice(0, 3) }); }
console.log(JSON.stringify({ test: testFile, ok: true, files: paths.length, bytes: buf.length, bundle: bundle.slice(REPO.length + 1) }));
