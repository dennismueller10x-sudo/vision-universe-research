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
      if (d.phase === "DUAL_WRITE") {
        assert.ok(existsSync(join(ROOT, p)), p + " liegt als Rueckfall in main");
        // Rueckfall muss lesbar sein; die Mindestzahl prueft die Frische-Ueberwachung, nicht dieser Test.
        assert.notEqual(inspect(readFileSync(join(ROOT, p)), contractFor(DOMAINS, p)).reason, "INVALID_JSON", p);
      }
      // BRANCH_ONLY: die Daten liegen nur im Datenzweig. Fehlt der Pfad dort, bricht der Pages-Bau ab (MISSING, DB-5).
    }
    for (const p of d.prefixes || []) {
      assert.ok(p.endsWith("/") && !p.startsWith("/") && !p.includes(".."), d.id + " prefix " + p);
      assert.ok(d.paths.length > 0, d.id + ": ein Verzeichnis braucht eine Schluesseldatei, der es folgt");
      if (d.phase === "DUAL_WRITE") assert.ok(existsSync(join(ROOT, p)), p + " liegt als Rueckfall in main");
    }
    assert.match(readFileSync(join(ROOT, ".github/workflows", d.workflow), "utf8"), /scripts\/ci\/push-data-branch\.sh/, d.workflow);
  }
});

test("DB-2 · Gleichstand (DUAL_WRITE) wird als IDENTICAL ausgeliefert", () => {
  const w = world({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T10:00:00Z"), site: feed("2026-11-04T10:00:00Z") });
  const r = overlay(w); assert.equal(r.complete, true); assert.deepEqual(r.counts, { IDENTICAL: 1, OVERLAID: 0, KEPT_MAIN: 0, MISSING: 0, PENDING_FIRST_RUN: 0 });
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
  // Neue Datenart vor ihrem ersten Lauf: nichts auszuliefern, kein Abbruch; danach gilt die volle Regel.
  w = world({ main: null, branch: null, site: null }); w.manifest.domains[0].pendingFirstRun = true;
  r = overlay(w); assert.equal(r.rows[0].status, "PENDING_FIRST_RUN"); assert.equal(r.complete, true);
  w = world({ main: null, branch: "{kaputt", site: null }); w.manifest.domains[0].pendingFirstRun = true;
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

test("DB-8 · interne Datenzweig-Pfade: Erzeuger und Workflows existieren, kein Overlay, kein Pfad in main", () => {
  for (const d of MANIFEST.internal || []) {
    assert.ok(existsSync(join(ROOT, ".github/workflows", d.workflow)), d.id + " Workflow");
    assert.ok(existsSync(join(ROOT, d.producer.split(" ")[0])), d.id + " Erzeuger");
    for (const c of d.consumers) assert.ok(existsSync(join(ROOT, ".github/workflows", c.split(" ")[0])), d.id + " Verbraucher " + c);
    assert.ok(d.pathPrefix.endsWith("/") && !d.pathPrefix.startsWith("/"), d.id);
    assert.ok(!MANIFEST.domains.some((x) => x.paths.some((p) => p.startsWith(d.pathPrefix))), d.id + " wird nicht ausgeliefert");
    assert.ok(!existsSync(join(ROOT, d.pathPrefix)), d.pathPrefix + " gehoert nicht nach main");
    const wf = readFileSync(join(ROOT, ".github/workflows", d.workflow), "utf8");
    assert.match(wf, new RegExp("push-data-branch\\.sh data/live .*" + d.pathPrefix.replace(/\//g, "\\/")), d.id + " schreibt in den Datenzweig");
  }
});

const SH = "dashboard/data/analysts/shards/";
function dirWorld({ main, branch, site, mainShards, branchShards }) {
  const w = world({ main, branch, site });
  for (const [k, v] of Object.entries(mainShards || {})) { put(w.root, SH + k, v); put(w.siteDir, SH + k, v); }
  for (const [k, v] of Object.entries(branchShards || {})) put(w.dataDir, SH + k, v);
  w.manifest.domains[0].prefixes = [SH];
  return w;
}
const ls = (dir) => { try { return execFileSync("find", [".", "-type", "f"], { cwd: dir, encoding: "utf8" }).trim().split("\n").filter(Boolean).sort(); } catch { return []; } };

test("DB-9 · Verzeichnisse folgen ihrer Schluesseldatei: gespiegelt aus dem Datenzweig oder ganz aus main, nie gemischt", () => {
  let w = dirWorld({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T16:00:00Z"), site: feed("2026-11-04T10:00:00Z"),
    mainShards: { "A.json": "1", "ALT.json": "x" }, branchShards: { "A.json": "2", "B.json": "3" } });
  let r = overlay(w); const pr = r.rows.find((x) => x.kind === "prefix");
  assert.equal(pr.status, "OVERLAID"); assert.equal(r.complete, true);
  assert.deepEqual(ls(join(w.siteDir, SH)), ["./A.json", "./B.json"], "veralteter Shard ist weg");
  assert.equal(readFileSync(join(w.siteDir, SH, "A.json"), "utf8"), "2");
  // Schluesseldatei kaputt -> Verzeichnis bleibt komplett beim Stand aus main
  w = dirWorld({ main: feed("2026-11-04T10:00:00Z"), branch: "{kaputt", site: feed("2026-11-04T10:00:00Z"),
    mainShards: { "A.json": "1" }, branchShards: { "A.json": "2" } });
  r = overlay(w); assert.equal(r.rows.find((x) => x.kind === "prefix").status, "KEPT_MAIN");
  assert.equal(readFileSync(join(w.siteDir, SH, "A.json"), "utf8"), "1");
  // Gleichstand
  w = dirWorld({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T10:00:00Z"), site: feed("2026-11-04T10:00:00Z"),
    mainShards: { "A.json": "1" }, branchShards: { "A.json": "1" } });
  assert.equal(overlay(w).rows.find((x) => x.kind === "prefix").status, "IDENTICAL");
  // Schluessel aus dem Zweig, Verzeichnis nirgends -> unvollstaendig
  w = dirWorld({ main: null, branch: feed("2026-11-04T10:00:00Z"), site: null });
  r = overlay(w); assert.equal(r.rows.find((x) => x.kind === "prefix").status, "MISSING"); assert.equal(r.complete, false);
});

test("DB-10 · Arbeitsbaum eines Laufs: --only waehlt Datenarten, --mirror false loescht nie", () => {
  const w = dirWorld({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T16:00:00Z"), site: null,
    mainShards: { "A.json": "1", "ALT.json": "x" }, branchShards: { "A.json": "2" } });
  assert.equal(overlay({ ...w, siteDir: w.root, only: ["anderes"], mirror: false }).rows.length, 0);
  const r = overlay({ ...w, siteDir: w.root, only: ["news"], mirror: false });
  assert.equal(r.complete, true);
  assert.match(readFileSync(join(w.root, NEWS), "utf8"), /16:00/);
  assert.equal(readFileSync(join(w.root, SH, "A.json"), "utf8"), "2");
  assert.ok(existsSync(join(w.root, SH, "ALT.json")), "im Arbeitsbaum wird nichts geloescht");
});

test("DB-11 · push-data-branch.sh spiegelt Verzeichnisse (auch Loeschungen) in den Zweig", () => {
  const remote = mkdtempSync(join(tmpdir(), "db-remote-")), work = mkdtempSync(join(tmpdir(), "db-work-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", HOME: work };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE)$/.test(k)) delete env[k];
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, env, encoding: "utf8" });
  git(remote, "init", "-q", "--bare");
  git(work, "init", "-q", "-b", "main"); put(work, "code.js", "x"); put(work, SH + "A.json", "1"); put(work, SH + "B.json", "1"); put(work, NEWS, feed("2026-11-04T10:00:00Z"));
  git(work, "add", "."); git(work, "commit", "-qm", "c"); git(work, "remote", "add", "origin", remote); git(work, "push", "-q", "origin", "main");
  const script = join(ROOT, "scripts/ci/push-data-branch.sh");
  execFileSync("bash", [script, "data/live", NEWS, SH], { cwd: work, env, encoding: "utf8" });
  assert.deepEqual(git(remote, "ls-tree", "-r", "--name-only", "data/live").trim().split("\n").sort(), [NEWS, SH + "A.json", SH + "B.json"].sort());
  execFileSync("rm", [join(work, SH, "B.json")]); put(work, SH + "C.json", "2");
  execFileSync("bash", [script, "data/live", SH.slice(0, -1)], { cwd: work, env, encoding: "utf8" });
  assert.deepEqual(git(remote, "ls-tree", "-r", "--name-only", "data/live").trim().split("\n").sort(), [NEWS, SH + "A.json", SH + "C.json"].sort());
});

test("DB-12 · eingespielte Datenzweig-Dateien sind fuer Git unsichtbar: git add -A committet sie nie nach main", async () => {
  const { hide } = await import("../../scripts/ci/seed-hide.mjs");
  const work = mkdtempSync(join(tmpdir(), "db-hide-")), data = mkdtempSync(join(tmpdir(), "db-hide-data-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", HOME: work };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE)$/.test(k)) delete env[k];
  const git = (...a) => execFileSync("git", a, { cwd: work, env, encoding: "utf8" });
  git("init", "-q", "-b", "main"); put(work, NEWS, feed("2026-11-04T10:00:00Z")); put(work, SH + "A.json", "1"); put(work, "code.js", "x");
  git("add", "."); git("commit", "-qm", "c");
  put(data, NEWS, feed("2026-11-04T16:00:00Z")); put(data, SH + "A.json", "2"); put(data, SH + "NEU.json", "3");
  const manifest = { branch: "data/live", domains: [{ id: "news", phase: "BRANCH_ONLY", paths: [NEWS], prefixes: [SH] }] };
  const rep = overlay({ root: work, dataDir: data, siteDir: work, manifest, domains: DOMAINS, mirror: false });
  assert.equal(rep.complete, true);
  const r = hide(rep.rows, work, env);
  assert.deepEqual(r, { hidden: 2, excluded: 1 });
  assert.match(readFileSync(join(work, NEWS), "utf8"), /16:00/, "der Lauf sieht den Datenzweig");
  put(work, "code.js", "y");
  git("add", "-A");
  assert.deepEqual(git("diff", "--cached", "--name-only").trim().split("\n"), ["code.js"], "nur die eigene Aenderung wird committet");
});
