/* =========================================================================
   PUSH-WITH-RETRY: ERZEUGERHOHEIT UEBER GETEILTE ARTEFAKTE

   Lauf 36078691085 (25.09.2026): Abruf, Gate A und Gate B gruen, dann
   stiess der Rebase auf den Intraday-Universumslauf, der dieselbe
   Produkt-Projektion der Faehigkeiten geschrieben hatte. Die Matrix wurde
   nach Erzeugerhoheit aufgeloest, die Projektion nicht - Abbruch, Kurse
   verworfen.

   PR1  die Projektion (beide Dateien) wird wie die Matrix aufgeloest:
        eigener Stand, Push gelingt, Matrix und Projektion stammen aus
        demselben Lauf.
   PR2  Gegenprobe: ein Konflikt in Kursdaten bricht weiterhin ab; nichts
        wird geschoben.
   Echt: ein lokales Remote, zwei Klone, derselbe Wettlauf.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "ci", "push-with-retry.sh");
const ENV = Object.assign({}, process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t",
                                             GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, env: ENV, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
};
const schreibe = (dir, rel, obj) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), JSON.stringify(obj, null, 2) + "\n"); };

const MATRIX = "quant/data/market/capabilities/matrix.json";
const PROJ = "quant/data/product/capabilities-v1.json";
const PROJ_SUM = "quant/data/product/capabilities-summary-v1.json";
const REIHE = "quant/data/market/discover-series/ref_AAPL.json";

function wettlauf(konfliktDatei) {
  const root = mkdtempSync(join(tmpdir(), "vu-push-"));
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const seed = join(root, "seed");
  git(root, "clone", "-q", remote, seed);
  for (const f of [MATRIX, PROJ, PROJ_SUM, REIHE]) schreibe(seed, f, { stand: "basis", n: 1 });
  git(seed, "add", "-A"); git(seed, "commit", "-q", "-m", "basis"); git(seed, "push", "-q", "origin", "HEAD:main");
  const refresh = join(root, "refresh"), intraday = join(root, "intraday");
  git(root, "clone", "-q", remote, refresh); git(root, "clone", "-q", remote, intraday);
  /* Der Intraday-Lauf landet zuerst. */
  for (const f of [MATRIX, PROJ, PROJ_SUM, konfliktDatei]) schreibe(intraday, f, { stand: "intraday", n: 2 });
  git(intraday, "add", "-A"); git(intraday, "commit", "-q", "-m", "intraday"); git(intraday, "push", "-q", "origin", "HEAD:main");
  /* Der Refresh hat dieselben Dateien aus seinem Lauf. */
  for (const f of [MATRIX, PROJ, PROJ_SUM, konfliktDatei]) schreibe(refresh, f, { stand: "refresh", n: 3 });
  git(refresh, "add", "-A"); git(refresh, "commit", "-q", "-m", "refresh");
  const r = spawnSync("bash", [SCRIPT, "main", "2"], { cwd: refresh, env: ENV, encoding: "utf8" });
  const pruef = join(root, "pruef");
  git(root, "clone", "-q", remote, pruef);
  const lies = (f) => JSON.parse(readFileSync(join(pruef, f), "utf8")).stand;
  return { root, r, lies, head: git(pruef, "log", "-1", "--format=%s") };
}

test("PR1 · Matrix und Produkt-Projektion im Konflikt: eigener Stand, Push gelingt", () => {
  const w = wettlauf(PROJ);
  try {
    assert.equal(w.r.status, 0, w.r.stdout + w.r.stderr);
    assert.match(w.r.stdout, /Erzeugerhoheit aufgeloest \(eigener Stand\): quant\/data\/product\/capabilities-v1\.json/);
    assert.equal(w.head, "refresh");
    for (const f of [MATRIX, PROJ, PROJ_SUM]) assert.equal(w.lies(f), "refresh", f);
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test("PR2 · Gegenprobe: ein Konflikt in Kursdaten bricht ab, nichts wird geschoben", () => {
  const w = wettlauf(REIHE);
  try {
    assert.equal(w.r.status, 1);
    assert.match(w.r.stderr, /Konflikt ausserhalb erzeugter Artefakte: quant\/data\/market\/discover-series\/ref_AAPL\.json/);
    assert.equal(w.head, "intraday");
    assert.equal(w.lies(REIHE), "intraday");
  } finally { rmSync(w.root, { recursive: true, force: true }); }
});

test("PR3 · Jeder Pfad, den der Refresh UND ein Intraday-/Takt-Lauf committen, steht unter Erzeugerhoheit", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const lies = (rel) => readFileSync(join(ROOT, rel), "utf8");
  const skript = lies("scripts/ci/push-with-retry.sh");
  const erzeugt = [...skript.match(/ERZEUGT=\(([\s\S]*?)\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  /* Refresh: die for-pfad-Liste im Commit-Schritt. */
  const refresh = lies(".github/workflows/market-data-refresh.yml");
  const refreshPfade = [...refresh.match(/for pfad in ([\s\S]*?); do/)[1].matchAll(/(quant\/[\w./-]+|discover\/[\w./-]+)/g)].map((m) => m[1]);
  /* Intraday: git add -A ...; Taktgeber: BLOCK_PFADE / Zyklus-Pfade. */
  const intraday = lies(".github/workflows/intraday-snapshots.yml").match(/git add -A ([^\n]*\\\n[^\n]*|[^\n]*)/)[1];
  const takt = lies("scripts/market/run-pacemaker.mjs");
  const andere = [...(intraday + "\n" + takt).matchAll(/(quant\/data\/[\w./-]+|discover\/data\/[\w./-]*)/g)].map((m) => m[1].replace(/\/$/, ""));
  const deckt = (p) => erzeugt.some((e) => (p + "/").startsWith(e) || p === e || e.startsWith(p.replace(/\/?$/, "/")) || (p + "/").startsWith(e.replace(/\/?$/, "/")));
  const geteilt = refreshPfade.filter((r) => andere.some((a) => a === r || a.startsWith(r.replace(/\/?$/, "/")) || r.startsWith(a.replace(/\/?$/, "/"))));
  assert.ok(geteilt.length >= 4, "Ueberschneidung erkannt: " + geteilt.join(", "));
  for (const p of geteilt) assert.ok(deckt(p), "geteilter Pfad ohne Erzeugerhoheit: " + p);
  /* Kursdaten stehen nie unter Erzeugerhoheit. */
  for (const e of erzeugt) assert.ok(!/discover-series|golden-preview|intraday\/20|discover\/data/.test(e), e);
});
