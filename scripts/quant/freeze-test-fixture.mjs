#!/usr/bin/env node
// Friert den Datenstand ein, den ein Test liest (scripts/quant/lib/data-fixture.mjs, Muster #1991).
// Der Test laeuft einmal live (DATA_FIXTURE_LIVE=1) unter dem Lese-Mitschnitt; jede gelesene Datei unter data/ kommt ins Bündel.
// Nur auf einem gruenen, vollstaendigen Datenstand aufrufen (kein Halbstand: Materialisierung nach dem letzten Marktlauf).
//   node scripts/quant/freeze-test-fixture.mjs --test quant/tests/product-services.test.mjs --out quant/tests/fixtures/product-services/data.json.gz
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { REPO, packFixture } from "./lib/data-fixture.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const testFile = arg("--test"), out = arg("--out");
if (!testFile || !out) throw Error("--test und --out angeben");
const trace = join(mkdtempSync(join(tmpdir(), "vu-trace-")), "reads.json");
const run = spawnSync(process.execPath, ["--require", join(REPO, "scripts/quant/lib/trace-data-reads.cjs"), testFile],
  { cwd: REPO, env: { ...process.env, DATA_FIXTURE_LIVE: "1", TRACE_OUT: trace }, encoding: "utf8", maxBuffer: 1 << 28 });
if (run.status !== 0) { process.stderr.write(run.stdout.split("\n").filter((l) => /^not ok|error:/.test(l)).join("\n") + "\n"); throw Error("Test live nicht gruen - kein Einfrieren eines roten Stands"); }
const paths = JSON.parse(readFileSync(trace, "utf8"));
// --source <commit>: der Commit, dessen Datenstand eingefroren wird (Standard HEAD; auf einem Arbeitszweig der main-Commit darunter).
let sourceCommit = arg("--source"); try { sourceCommit = execFileSync("git", ["rev-parse", sourceCommit || "HEAD"], { cwd: REPO, encoding: "utf8" }).trim(); } catch {}
const buf = packFixture(paths, { test: testFile, sourceCommit, frozenAt: new Date().toISOString(), files: paths.length });
mkdirSync(dirname(join(process.cwd(), out)), { recursive: true });
writeFileSync(out, buf);
console.log(JSON.stringify({ out, files: paths.length, bytes: buf.length, sourceCommit }));
