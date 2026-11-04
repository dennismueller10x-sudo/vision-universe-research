/* Datenzweig-Pilot (Plan Neustart §3, Strang A): Vertragstests statt Pfad-Gate.
   Geprueft wird, dass die Auslieferung vollstaendig bleibt, nicht welche Ordner ein PR beruehrt. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { overlay, inspect, contractFor } from "../../scripts/ci/overlay-data-branch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "core/registry/data-branch.json"), "utf8"));
const DOMAINS = JSON.parse(readFileSync(join(ROOT, "core/registry/domains.json"), "utf8"));
const NEWS = "dashboard/data/news_feed.json";
const feed = (ts, n = 5) => JSON.stringify({ updated_at: ts, items: Array.from({ length: n }, (_, i) => ({ id: i })) });
const put = (dir, p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
function world({ main, branch, site }) {
  const root = mkdtempSync(join(tmpdir(), "db-root-")), data = mkdtempSync(join(tmpdir(), "db-data-")), out = mkdtempSync(join(tmpdir(), "db-site-"));
  if (main != null) put(root, NEWS, main); if (branch != null) put(data, NEWS, branch); if (site != null) put(out, NEWS, site);
  return { root, dataDir: data, siteDir: out, manifest: { branch: "data/live", domains: [{ id: "news", phase: "DUAL_WRITE", paths: [NEWS] }] }, domains: DOMAINS };
}

test("DB-1 · Steckbrief: jede Datenart ist registriert, ihr Pfad gehoert genau dieser Datenart, Zweig ist nie main", () => {
  assert.equal(MANIFEST.schema, "vu-data-branch-1");
  assert.ok(!/^(main|master)$/.test(MANIFEST.branch));
  for (const d of MANIFEST.domains) {
    assert.ok(Object.keys(MANIFEST.phases).includes(d.phase), d.id);
    const reg = DOMAINS.domains.find((x) => x.id === d.id); assert.ok(reg, d.id + " fehlt in domains.json");
    for (const p of d.paths) {
      assert.equal(contractFor(DOMAINS, p)?.id, d.id, p);
      assert.ok(existsSync(join(ROOT, p)), p + " liegt als Rueckfall in main");
      // Rueckfall muss lesbar sein; die Mindestzahl prueft die Frische-Ueberwachung, nicht dieser Test.
      assert.notEqual(inspect(readFileSync(join(ROOT, p)), contractFor(DOMAINS, p)).reason, "INVALID_JSON", p);
    }
    assert.match(readFileSync(join(ROOT, ".github/workflows", d.workflow), "utf8"), /scripts\/ci\/push-data-branch\.sh/, d.workflow);
  }
});

test("DB-2 · Gleichstand (DUAL_WRITE) wird als IDENTICAL ausgeliefert", () => {
  const w = world({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T10:00:00Z"), site: feed("2026-11-04T10:00:00Z") });
  const r = overlay(w); assert.equal(r.complete, true); assert.deepEqual(r.counts, { IDENTICAL: 1, OVERLAID: 0, KEPT_MAIN: 0, MISSING: 0 });
});

test("DB-3 · Neuerer Datenzweig wird ausgeliefert, aelterer nicht (monoton)", () => {
  let w = world({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T16:00:00Z"), site: feed("2026-11-04T10:00:00Z") });
  assert.equal(overlay(w).rows[0].status, "OVERLAID");
  assert.match(readFileSync(join(w.siteDir, NEWS), "utf8"), /16:00/);
  w = world({ main: feed("2026-11-04T16:00:00Z"), branch: feed("2026-11-04T10:00:00Z"), site: feed("2026-11-04T16:00:00Z") });
  const r = overlay(w).rows[0]; assert.equal(r.status, "KEPT_MAIN"); assert.equal(r.reason, "BRANCH_OLDER");
  assert.match(readFileSync(join(w.siteDir, NEWS), "utf8"), /16:00/);
});

test("DB-4 · Kaputter oder zu kleiner Datenzweig ersetzt nie den guten Stand", () => {
  for (const [branch, reason] of [["{kaputt", "INVALID_JSON"], [feed("2026-11-05T00:00:00Z", 1), "TOO_FEW_RECORDS:1<3"]]) {
    const w = world({ main: feed("2026-11-04T10:00:00Z"), branch, site: feed("2026-11-04T10:00:00Z") });
    const r = overlay(w); assert.equal(r.rows[0].status, "KEPT_MAIN"); assert.equal(r.rows[0].reason, reason); assert.equal(r.complete, true);
  }
});

test("DB-5 · Vollstaendigkeit: fehlt der Datenzweig, bleibt main; fehlt beides, ist die Auslieferung unvollstaendig", () => {
  let w = world({ main: feed("2026-11-04T10:00:00Z"), branch: null, site: null });
  let r = overlay(w); assert.equal(r.rows[0].reason, "NOT_ON_BRANCH"); assert.equal(r.complete, true); assert.ok(existsSync(join(w.siteDir, NEWS)));
  w = world({ main: null, branch: null, site: null });
  r = overlay(w); assert.equal(r.rows[0].status, "MISSING"); assert.equal(r.complete, false);
});

test("DB-6 · Pages legt den Datenzweig nach dem Bau und vor dem Rauchtest darueber, ohne Lesefehler zu verschlucken", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8");
  const build = wf.indexOf("scripts/vu2/build-release.mjs"), ov = wf.indexOf("scripts/ci/overlay-data-branch.mjs"), smoke = wf.indexOf("scripts/vu2/production-smoke.mjs");
  assert.ok(build > 0 && ov > build && ov < smoke, "Reihenfolge Bau → Datenzweig → Rauchtest");
  assert.match(wf, /DATA_BRANCH: data\/live/);
});

test("DB-7 · push-data-branch.sh: legt den Zweig an, schreibt nur die genannten Pfade, verweigert main", () => {
  const remote = mkdtempSync(join(tmpdir(), "db-remote-")), work = mkdtempSync(join(tmpdir(), "db-work-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", HOME: work };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE)$/.test(k)) delete env[k];
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, env, encoding: "utf8" });
  git(remote, "init", "-q", "--bare");
  git(work, "init", "-q", "-b", "main"); put(work, "code.js", "x"); put(work, NEWS, feed("2026-11-04T10:00:00Z"));
  git(work, "add", "."); git(work, "commit", "-qm", "c"); git(work, "remote", "add", "origin", remote); git(work, "push", "-q", "origin", "main");
  const script = join(ROOT, "scripts/ci/push-data-branch.sh");
  execFileSync("bash", [script, "data/live", NEWS], { cwd: work, env, encoding: "utf8" });
  assert.deepEqual(git(remote, "ls-tree", "-r", "--name-only", "data/live").trim().split("\n"), [NEWS], "nur Daten im Zweig");
  put(work, NEWS, feed("2026-11-04T16:00:00Z"));
  execFileSync("bash", [script, "data/live", NEWS], { cwd: work, env, encoding: "utf8" });
  assert.match(git(remote, "show", "data/live:" + NEWS), /16:00/);
  assert.equal(git(remote, "rev-list", "--count", "data/live").trim(), "2");
  assert.equal(git(remote, "rev-parse", "main").trim(), git(work, "rev-parse", "main").trim(), "main unberuehrt");
  assert.throws(() => execFileSync("bash", [script, "main", NEWS], { cwd: work, env, stdio: "pipe" }));
});
