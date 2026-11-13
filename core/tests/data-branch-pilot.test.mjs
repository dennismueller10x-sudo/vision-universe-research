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
    if (d.repositoryOnly) assert.equal(reg.repositoryOnly, true, d.id + ": repositoryOnly im Steckbrief verlangt repositoryOnly in domains.json");
    for (const p of d.paths) {
      // Jede Datei gehoert hoechstens dieser Datenart; mindestens eine Datei der Datenart traegt ihren Vertrag (DB-1b).
      const c = contractFor(DOMAINS, p); assert.ok(!c || c.id === d.id, p + " gehoert " + (c && c.id));
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
    assert.ok(d.paths.some((p) => contractFor(DOMAINS, p)?.id === d.id), d.id + ": eine Datei traegt den Vertrag aus domains.json");
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
  const seed = wf.indexOf("scripts/ci/seed-data-branch.sh alle");
  assert.ok(seed > 0 && seed < build, "Datenzweig liegt schon vor dem Bau im Arbeitsbaum (abgeleitete Auslieferung)");
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

test("DB-13 · Begleitdateien ohne Vertrag entscheiden nicht ueber das Verzeichnis", () => {
  const w = dirWorld({ main: feed("2026-11-04T10:00:00Z"), branch: feed("2026-11-04T16:00:00Z"), site: feed("2026-11-04T10:00:00Z"),
    mainShards: { "A.json": "1" }, branchShards: { "A.json": "2" } });
  put(w.root, "begleit/bericht.json", "{\"a\":1}"); put(w.siteDir, "begleit/bericht.json", "{\"a\":1}");
  w.manifest.domains[0].paths.push("begleit/bericht.json");
  const r = overlay(w);
  assert.equal(r.rows.find((x) => x.path === "begleit/bericht.json").status, "KEPT_MAIN", "Begleitdatei fehlt im Zweig");
  assert.equal(r.rows.find((x) => x.kind === "prefix").status, "OVERLAID", "das Verzeichnis folgt der Vertragsdatei");
  assert.equal(r.complete, true);
});

test("DB-14 · Inventar: jede Datenart ist im Datenzweig oder im Plan mit Status und Grund", () => {
  const inBranch = new Set(MANIFEST.domains.filter((d) => d.phase === "BRANCH_ONLY").map((d) => d.id));
  const plan = (MANIFEST.plan && MANIFEST.plan.entries) || {};
  for (const d of DOMAINS.domains) {
    if (inBranch.has(d.id)) { assert.ok(!(d.id in plan), d.id + " ist fertig (BRANCH_ONLY) und steht noch im Plan"); continue; }
    const p = plan[d.id];
    assert.ok(p, d.id + " fehlt im Plan (core/registry/data-branch.json#plan)");
    assert.ok(["NEXT", "LATER", "LAST", "EXEMPT"].includes(p.status), d.id);
    assert.ok(p.grund && p.grund.length > 10, d.id + " braucht einen Grund");
  }
  for (const id of Object.keys(plan)) assert.ok(DOMAINS.domains.some((d) => d.id === id), "Plan nennt unbekannte Datenart " + id);
});

/* DB-15 · Wer Daten schreibt und eine BRANCH_ONLY-Datei liest, spielt vorher den Datenzweig ein.
   Sonst rechnet der Lauf mit der eingefrorenen Kopie in main weiter (08.11.2026: Musterdepots lasen
   die SPY-Reihe nach marketPulse BRANCH_ONLY aus main). Erkannt werden Skripte, die einen Pfad einer
   BRANCH_ONLY-Datenart nennen, und Workflows, die ein solches Skript aufrufen und committen/pushen.
   Pruef-Workflows ohne Schreiben pruefen den Code gegen die Kopie in main und sind ausgenommen. */
const DB15_AUSNAHMEN = {
  "scripts/market/assert-public-data-hygiene.mjs": "prueft Quellen-Freigaben im oeffentlichen Baum, nicht die Frische"
};
test("DB-15 · Schreibende Workflows, die BRANCH_ONLY-Daten lesen, saeen den Datenzweig", async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const nadeln = [];
  for (const d of MANIFEST.domains.filter((x) => x.phase === "BRANCH_ONLY")) for (const p of [...(d.paths || []), ...(d.prefixes || [])]) nadeln.push(p.replace(/\/$/, ""));
  const walk = (dir, out = []) => {
    for (const n of readdirSync(join(ROOT, dir))) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const rel = dir + "/" + n;
      if (statSync(join(ROOT, rel)).isDirectory()) { if (n !== "tests" && n !== "data") walk(rel, out); }
      else if (/\.(mjs|cjs|js|py|sh)$/.test(n)) out.push(rel);
    }
    return out;
  };
  const leser = ["scripts", "products", "quant/engines", "core"].filter((d) => existsSync(join(ROOT, d))).flatMap((d) => walk(d))
    .filter((f) => !DB15_AUSNAHMEN[f] && nadeln.some((p) => readFileSync(join(ROOT, f), "utf8").includes(p)));
  assert.ok(leser.includes("scripts/quant/portfolio/model-depots.cjs"), "Erkennung greift (Musterdepots lesen die SPY-Reihe)");
  const fehlt = [];
  for (const w of readdirSync(join(ROOT, ".github/workflows")).filter((f) => f.endsWith(".yml"))) {
    const t = readFileSync(join(ROOT, ".github/workflows", w), "utf8");
    if (t.includes("seed-data-branch.sh") || !/push-with-retry\.sh|commit-and-push\.sh|push-data-branch\.sh/.test(t)) continue;
    const treffer = leser.filter((f) => t.includes(f));
    if (treffer.length) fehlt.push(w + " ruft " + treffer.join(", "));
  }
  assert.deepEqual(fehlt, [], "scripts/ci/seed-data-branch.sh alle vor dem Lauf einbauen");
});

/* DB-16: Ein Release-Bau ausserhalb von pages-release.yml (Produkt-CI, Browserpruefungen) muss denselben Stand bauen wie die
   Auslieferung. BRANCH_ONLY-Daten liegen in main nur eingefroren; #1771 wurde rot, weil der Discover-Browsertest die Maerkte-Seite
   aus der eingefrorenen marketPulse-Kopie vom 08.11.2026 baute. Jeder Aufruf von build-release.mjs steht deshalb im selben Job
   hinter scripts/ci/seed-data-branch.sh alle. Company Intelligence bleibt ausgenommen (eigener Strang, EXEMPT). */
test("DB-16 · Jeder Release-Bau in einem Workflow saet vorher den Datenzweig wie pages-release.yml", async () => {
  const { readdirSync } = await import("node:fs");
  const AUSNAHMEN = { "company-intelligence.yml": "Company Intelligence bleibt EXEMPT und wird von diesem Strang nicht angefasst" };
  const fehlt = [];
  let gesehen = 0;
  for (const w of readdirSync(join(ROOT, ".github/workflows")).filter((f) => f.endsWith(".yml") && !AUSNAHMEN[f])) {
    const zeilen = readFileSync(join(ROOT, ".github/workflows", w), "utf8").split("\n");
    let job = null, gesaet = false;
    zeilen.forEach((z, i) => {
      if (/^  [A-Za-z0-9_-]+:\s*$/.test(z)) { job = z.trim().slice(0, -1); gesaet = false; }
      if (/^\s*#/.test(z)) return;
      if (z.includes("scripts/ci/seed-data-branch.sh alle")) gesaet = true;
      if (/node scripts\/vu2\/build-release\.mjs\s+--output/.test(z)) { gesehen++; if (!gesaet) fehlt.push(w + ":" + (i + 1) + " (Job " + job + ")"); }
    });
  }
  assert.ok(gesehen >= 8, "Erkennung greift (ci.yml baut in acht Jobs, pages-release.yml einmal): " + gesehen);
  assert.deepEqual(fehlt, [], "scripts/ci/seed-data-branch.sh alle vor dem Release-Bau einbauen");
});

test("DB-17 · repositoryOnly: nie in der Seite, nur auf ausdrueckliche Nennung im Arbeitsbaum; \"alle\" nimmt sie nicht mit", () => {
  const KEY = "fx-test/consumer_coverage.json", DIR = "fx-test/consumer/";
  const mk = () => {
    const root = mkdtempSync(join(tmpdir(), "db17-root-")), data = mkdtempSync(join(tmpdir(), "db17-data-")), site = mkdtempSync(join(tmpdir(), "db17-site-"));
    const cov = JSON.stringify({ generated_at_utc: "2026-11-13T07:30:00Z", n: 1 });
    put(data, KEY, cov); put(data, DIR + "index.json", "{\"a\":1}"); put(data, DIR + "CIK0000000001.json", "{\"b\":2}");
    const manifest = { branch: "data/live", domains: [{ id: "fundamentalsConsumer", phase: "BRANCH_ONLY", repositoryOnly: true, workflow: "sec-consumer-fundamentals.yml", paths: [KEY], prefixes: [DIR] }] };
    return { root, dataDir: data, siteDir: site, manifest, domains: DOMAINS };
  };
  // Pages-Stufe (kein --only): nichts davon gelangt in die Seite, der Bericht bleibt vollstaendig.
  let w = mk(); let r = overlay(w);
  assert.equal(r.complete, true); assert.equal(r.rows.length, 0); assert.deepEqual(r.repositoryOnlySkipped, ["fundamentalsConsumer"]);
  assert.ok(!existsSync(join(w.siteDir, "fx-test")), "repositoryOnly-Daten duerfen nicht in die Seite gelangen");
  // Verbraucher nennt die Datenart ausdruecklich (seed-data-branch.sh fundamentalsConsumer): Schluesseldatei und Verzeichnis kommen.
  w = mk(); r = overlay({ ...w, only: ["fundamentalsConsumer"], siteDir: w.root });
  assert.equal(r.complete, true);
  assert.ok(existsSync(join(w.root, KEY)) && existsSync(join(w.root, DIR + "CIK0000000001.json")));
  // "alle" (seed-data-branch.sh) waehlt nur BRANCH_ONLY ohne repositoryOnly.
  const sh = readFileSync(join(ROOT, "scripts/ci/seed-data-branch.sh"), "utf8");
  assert.match(sh, /d\.phase === "BRANCH_ONLY" && !d\.repositoryOnly/);
  // Die Seite prueft weiter, dass das Verzeichnis fehlt (pages-release.yml).
  assert.match(readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8"), /test ! -d "\$SITE_ROOT\/quant\/data\/sec\/consumer"/);
});
