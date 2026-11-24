/* system-health liest Datenarten mit Phase BRANCH_ONLY (core/registry/data-branch.json) vom Datenzweig.
   Vorfall 22./24.11.2026: Im Repository-Stand von main zeigten fuenf Datenarten STALE (news, marketPulse, analystConsensus,
   fxReference, kiDepots), obwohl ihre Erzeuger gruen liefen; die Kopie in main ist eingefroren. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { branchOnlyKind, makeBranchAwareLoader, BRANCH_NOT_READABLE } from "../../scripts/core/lib.mjs";

const require = createRequire(import.meta.url);
const Health = require("../health.js");
const registry = JSON.parse(readFileSync("core/registry/domains.json", "utf8"));
const dataBranch = JSON.parse(readFileSync("core/registry/data-branch.json", "utf8"));

const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...a], { stdio: "ignore" });
function tempRepo(branchData) {
  const root = mkdtempSync(join(tmpdir(), "vu-sh-"));
  git(root, "init", "-q", "-b", "main");
  mkdirSync(join(root, "dashboard/data"), { recursive: true });
  writeFileSync(join(root, "dashboard/data/news_feed.json"), JSON.stringify({ generatedAt: "2026-11-11T05:18:00Z", items: [1] }));
  git(root, "add", "-A"); git(root, "commit", "-q", "-m", "alt");
  if (branchData) {
    git(root, "checkout", "-q", "-b", "data/live");
    writeFileSync(join(root, "dashboard/data/news_feed.json"), JSON.stringify(branchData));
    git(root, "commit", "-qam", "frisch"); git(root, "checkout", "-q", "main");
  }
  return root;
}

test("Die fuenf gemeldeten Datenarten sind BRANCH_ONLY und ihre Artefakte werden erkannt; main-eigene nicht", () => {
  const byId = Object.fromEntries(registry.domains.map((d) => [d.id, d]));
  for (const id of ["news", "marketPulse", "analystConsensus", "fxReference", "kiDepots"]) {
    assert.equal(branchOnlyKind(dataBranch, byId[id].artifact), id, id);
  }
  assert.equal(branchOnlyKind(dataBranch, "/technical/data/meta.json"), null);
});

test("BRANCH_ONLY-Pfad kommt vom Datenzweig, nicht aus der eingefrorenen Kopie in main", async () => {
  const root = tempRepo({ generatedAt: "2026-11-24T05:18:00Z", items: [1, 2] });
  const { load, state } = makeBranchAwareLoader(async () => { throw new Error("darf nicht gelesen werden"); }, dataBranch, { root, refs: ["data/live"] });
  const d = await load("/dashboard/data/news_feed.json");
  assert.equal(d.generatedAt, "2026-11-24T05:18:00Z");
  assert.equal(state.read["/dashboard/data/news_feed.json"], "data/live");
});

test("Pfade ausserhalb von BRANCH_ONLY laufen unveraendert durch den normalen Loader", async () => {
  const { load } = makeBranchAwareLoader(async (p) => ({ p }), dataBranch, { root: tempRepo(null), refs: ["data/live"] });
  assert.deepEqual(await load("/technical/data/meta.json"), { p: "/technical/data/meta.json" });
});

test("Zweig nicht lesbar: BRANCH_NOT_READABLE, in system-health 'nicht geprueft' statt STALE", async () => {
  const root = tempRepo(null);
  const { load, state } = makeBranchAwareLoader(async () => { throw new Error("nicht erreichbar"); }, dataBranch, { root, refs: ["origin/data/live", "data/live"] });
  await assert.rejects(load("/dashboard/data/news_feed.json"), (e) => e.message.startsWith(BRANCH_NOT_READABLE));
  assert.equal(state.notReadable["/dashboard/data/news_feed.json"], "news");
  const news = registry.domains.find((x) => x.id === "news");
  const now = new Date("2026-11-24T08:00:00Z");
  const old = Health.assessDomain(news, { ok: true, data: { generatedAt: "2026-11-11T05:18:00Z", items: [1] } }, { now, target: "repository" });
  assert.ok(Health.RANK[old.status] >= Health.RANK.DEGRADED, "die alte Kopie wuerde " + old.status + " zeigen");
  const out = Health.assessDomain(news, { ok: false, error: BRANCH_NOT_READABLE }, { now, target: "repository", branchNotChecked: { news: true } });
  assert.equal(out.status, "BRANCH_NOT_CHECKED");
  assert.match(out.warnings.join(" "), /Stand auf dem Datenzweig, nicht geprüft/);
  assert.equal(Health.RANK[out.status], 0);
});

test("Gegen die Seite (--site) gilt die Auslieferung: 'nicht geprueft' nur im Repository-Stand", () => {
  const news = registry.domains.find((x) => x.id === "news");
  const out = Health.assessDomain(news, { ok: true, data: { generatedAt: "2026-11-24T05:18:00Z", items: [1] } }, { now: new Date("2026-11-24T08:00:00Z"), target: "site", branchNotChecked: { news: true } });
  assert.notEqual(out.status, "BRANCH_NOT_CHECKED");
});
