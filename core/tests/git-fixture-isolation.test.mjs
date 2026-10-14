/* Beweis: ein gesetztes GIT_DIR (Pruefagent, Hook) erreicht keine Fixture.
   Das "umgebende" Repository ist ein Koeder im Temp-Ordner, nie das echte .git. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedGitEnv } from "../../scripts/ci/isolated-git-env.mjs";

const sauber = isolatedGitEnv({}, { PATH: process.env.PATH, HOME: process.env.HOME });
const git = (cwd, env, ...args) => spawnSync("git", args, { cwd, env, encoding: "utf8" });
const zustand = (dir) => [
  git(dir, sauber, "rev-parse", "HEAD").stdout, git(dir, sauber, "config", "--local", "--list").stdout,
  readFileSync(join(dir, ".git", "HEAD"), "utf8"),
].join("|");

function koeder() {
  const dir = mkdtempSync(join(tmpdir(), "git-koeder-"));
  for (const a of [["init", "-q", "-b", "main"], ["config", "user.name", "koeder"], ["config", "user.email", "k@k"]]) git(dir, sauber, ...a);
  writeFileSync(join(dir, "k.txt"), "k");
  git(dir, sauber, "add", "k.txt"); git(dir, sauber, "commit", "-q", "-m", "koeder");
  return dir;
}

const LECKS = (decoy) => ({ GIT_DIR: join(decoy, ".git"), GIT_WORK_TREE: decoy, GIT_INDEX_FILE: join(decoy, ".git", "index"),
  GIT_OBJECT_DIRECTORY: join(decoy, ".git", "objects"), GIT_COMMON_DIR: join(decoy, ".git"), GIT_NAMESPACE: "x", GIT_PREFIX: "y/",
  GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.worktree", GIT_CONFIG_VALUE_0: decoy });

function fixtureAblauf(cwd, env) {
  git(cwd, env, "init", "-q", "-b", "main");
  writeFileSync(join(cwd, "f.txt"), "f");
  git(cwd, env, "add", "f.txt");
  return git(cwd, env, "commit", "-q", "-m", "fixture");
}

test("Negativkontrolle: ohne Helfer schreibt die Fixture in das umgebende Repository", () => {
  const decoy = koeder(), fx = mkdtempSync(join(tmpdir(), "git-fx-"));
  try {
    const vorher = zustand(decoy);
    fixtureAblauf(fx, { ...sauber, GIT_DIR: join(decoy, ".git") });
    assert.notEqual(zustand(decoy), vorher, "der Test muss das Leck ueberhaupt reproduzieren koennen");
  } finally { rmSync(decoy, { recursive: true, force: true }); rmSync(fx, { recursive: true, force: true }); }
});

test("isolatedGitEnv entfernt jede GIT_*-Variable des Aufrufers", () => {
  const decoy = koeder();
  try {
    const env = isolatedGitEnv({}, { PATH: "/usr/bin", ...LECKS(decoy), GIT_TRACE: "1" });
    for (const k of Object.keys(LECKS(decoy))) assert.equal(env[k], undefined, k);
    assert.equal(env.GIT_TRACE, undefined);
    assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
  } finally { rmSync(decoy, { recursive: true, force: true }); }
});

test("mit gesetztem GIT_DIR bleibt das umgebende Repository unveraendert", () => {
  const decoy = koeder(), fx = mkdtempSync(join(tmpdir(), "git-fx-"));
  try {
    const vorher = zustand(decoy);
    const r = fixtureAblauf(fx, isolatedGitEnv({}, { ...sauber, ...LECKS(decoy) }));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(zustand(decoy), vorher, "Koeder-Repository wurde veraendert");
    assert.equal(git(fx, sauber, "log", "--format=%an|%s").stdout.trim(), "Fixture|fixture", "Commit liegt in der Fixture");
    assert.equal(git(decoy, sauber, "config", "user.name").stdout.trim(), "koeder");
  } finally { rmSync(decoy, { recursive: true, force: true }); rmSync(fx, { recursive: true, force: true }); }
});

test("der Helfer schreibt keine Git-Konfiguration (global, lokal) des Aufrufers", () => {
  const home = mkdtempSync(join(tmpdir(), "git-home-"));
  try {
    const gc = join(home, ".gitconfig"); writeFileSync(gc, "[user]\n\tname = Echt\n");
    const vorher = readFileSync(gc, "utf8");
    const fx = mkdtempSync(join(tmpdir(), "git-fx-"));
    fixtureAblauf(fx, isolatedGitEnv({}, { PATH: process.env.PATH, HOME: home }));
    rmSync(fx, { recursive: true, force: true });
    assert.equal(readFileSync(gc, "utf8"), vorher);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("Python-Spiegel liefert dieselbe Bereinigung", () => {
  const out = execFileSync("python3", ["-I", "-B", "-c",
    "import sys,json;sys.path.insert(0,'scripts/ci');from isolated_git_env import isolated_git_env as f;" +
    "e=f({}, {'PATH':'/x','GIT_DIR':'/d','GIT_WORK_TREE':'/w','GIT_INDEX_FILE':'/i'});print(json.dumps(e))"],
    { encoding: "utf8", cwd: new URL("../..", import.meta.url).pathname });
  const e = JSON.parse(out);
  assert.equal(e.GIT_DIR, undefined); assert.equal(e.GIT_WORK_TREE, undefined); assert.equal(e.GIT_INDEX_FILE, undefined);
  assert.equal(e.GIT_CONFIG_GLOBAL, "/dev/null"); assert.equal(e.PATH, "/x");
});

test("scrub-git-env bereinigt process.env eines Kindprozesses mit gesetztem GIT_DIR", () => {
  const decoy = koeder();
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e",
      "await import('./scripts/ci/scrub-git-env.mjs');console.log(JSON.stringify(Object.keys(process.env).filter(k=>k.startsWith('GIT_'))))"],
      { encoding: "utf8", cwd: new URL("../..", import.meta.url).pathname, env: { ...sauber, ...LECKS(decoy) } });
    const keys = JSON.parse(out);
    for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_CONFIG_COUNT"]) assert.ok(!keys.includes(k), k);
    assert.ok(keys.includes("GIT_CONFIG_GLOBAL"));
  } finally { rmSync(decoy, { recursive: true, force: true }); }
});
