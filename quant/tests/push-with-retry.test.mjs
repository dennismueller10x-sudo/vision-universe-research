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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "ci", "push-with-retry.sh");
/* Keine automatische Wartung in den Testrepos: ein abgekoppeltes
   `git gc --auto` nach Fetch/Rebase schrieb noch in .git/objects, waehrend
   der Test aufraeumte (CI 04.10.2026, #395: ENOTEMPTY in rmSync, PR2). */
const ENV = Object.assign({}, process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t",
                                             GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
                                             GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "gc.auto", GIT_CONFIG_VALUE_0: "0",
                                             GIT_CONFIG_KEY_1: "maintenance.auto", GIT_CONFIG_VALUE_1: "false",
                                             GIT_CONFIG_KEY_2: "gc.autoDetach", GIT_CONFIG_VALUE_2: "false" });
const aufraeumen = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
  } finally { aufraeumen(w.root); }
});

test("PR2 · Gegenprobe: ein Konflikt in Kursdaten bricht ab, nichts wird geschoben", () => {
  const w = wettlauf(REIHE);
  try {
    assert.equal(w.r.status, 1);
    assert.match(w.r.stderr, /Konflikt ausserhalb erzeugter Artefakte: quant\/data\/market\/discover-series\/ref_AAPL\.json/);
    assert.equal(w.head, "intraday");
    assert.equal(w.lies(REIHE), "intraday");
  } finally { aufraeumen(w.root); }
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

/* PR4 · ZWEI EIGENE COMMITS, DER ZWEITE IM ECHTEN KONFLIKT.
   Der Taktgeber committet je Zyklus und schiebt nicht immer erfolgreich
   (run-pacemaker.mjs: ein fehlgeschlagener Push ist nicht fatal). Dann
   stehen mehrere eigene Commits an, und der Rebase haelt mehrmals.
   Vorher loeste das Skript den ersten Halt nach Erzeugerhoheit, rief
   `rebase --continue` - und meldete Erfolg, auch wenn der Rebase beim
   zweiten Commit im Konflikt stehen blieb. Geschoben wurde dann ein halb
   rebaster HEAD. Jetzt: jeder Halt wird geprueft; ein Konflikt ausserhalb
   der Erzeugerhoheit bricht ab, nichts wird geschoben, kein Rebase bleibt
   offen. */
function zweiCommits(zweiteDatei) {
  const root = mkdtempSync(join(tmpdir(), "vu-push2-"));
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const seed = join(root, "seed");
  git(root, "clone", "-q", remote, seed);
  for (const f of [MATRIX, PROJ, PROJ_SUM, REIHE]) schreibe(seed, f, { stand: "basis", n: 1 });
  git(seed, "add", "-A"); git(seed, "commit", "-q", "-m", "basis"); git(seed, "push", "-q", "origin", "HEAD:main");
  const takt = join(root, "takt"), andere = join(root, "andere");
  git(root, "clone", "-q", remote, takt); git(root, "clone", "-q", remote, andere);
  for (const f of [MATRIX, zweiteDatei]) schreibe(andere, f, { stand: "andere", n: 2 });
  git(andere, "add", "-A"); git(andere, "commit", "-q", "-m", "andere"); git(andere, "push", "-q", "origin", "HEAD:main");
  /* Zyklus 1: nur die Matrix (Erzeugerhoheit). Zyklus 2: die zweite Datei. */
  schreibe(takt, MATRIX, { stand: "takt-1", n: 3 });
  git(takt, "add", "-A"); git(takt, "commit", "-q", "-m", "takt-1");
  schreibe(takt, zweiteDatei, { stand: "takt-2", n: 4 });
  git(takt, "add", "-A"); git(takt, "commit", "-q", "-m", "takt-2");
  const r = spawnSync("bash", [SCRIPT, "main", "2"], { cwd: takt, env: ENV, encoding: "utf8" });
  const pruef = join(root, "pruef");
  git(root, "clone", "-q", remote, pruef);
  const lies = (f) => JSON.parse(readFileSync(join(pruef, f), "utf8")).stand;
  const rebaseOffen = spawnSync("git", ["rev-parse", "--git-path", "rebase-merge"], { cwd: takt, env: ENV, encoding: "utf8" }).stdout.trim();
  return { root, r, lies, head: git(pruef, "log", "-1", "--format=%s"), rebaseOffen: existsSync(join(takt, rebaseOffen)) };
}

test("PR4 · Zwei eigene Commits, beide in Erzeugerhoheit: beide landen, kein offener Rebase", () => {
  const w = zweiCommits(PROJ);
  try {
    assert.equal(w.r.status, 0, w.r.stdout + w.r.stderr);
    assert.equal(w.head, "takt-2");
    assert.equal(w.lies(MATRIX), "takt-1");
    assert.equal(w.lies(PROJ), "takt-2");
    assert.equal(w.rebaseOffen, false);
  } finally { aufraeumen(w.root); }
});

test("PR5 · Zweiter Commit im Kursdaten-Konflikt: Abbruch, nichts halb Rebastes wird geschoben", () => {
  const w = zweiCommits(REIHE);
  try {
    assert.equal(w.r.status, 1, w.r.stdout + w.r.stderr);
    assert.match(w.r.stderr, /Konflikt ausserhalb erzeugter Artefakte: quant\/data\/market\/discover-series\/ref_AAPL\.json/);
    assert.equal(w.head, "andere", "ein halb rebaster Stand wurde geschoben");
    assert.equal(w.lies(REIHE), "andere");
    assert.equal(w.lies(MATRIX), "andere");
    assert.equal(w.rebaseOffen, false, "der Rebase blieb offen");
  } finally { aufraeumen(w.root); }
});

test("PR6 · Konflikt im Intraday-Verzeichnis (von einem Feature-PR mitgebracht): eigener Stand, Push gelingt", () => {
  /* Lauf 37083168221: 5.237 geschriebene Tagesverlaeufe wurden an genau
     diesem Konflikt verworfen. */
  const w = wettlauf("quant/data/market/intraday/index.json");
  try {
    assert.equal(w.r.status, 0, w.r.stdout + w.r.stderr);
    assert.match(w.r.stdout, /Erzeugerhoheit aufgeloest \(eigener Stand\): quant\/data\/market\/intraday\/index\.json/);
    assert.equal(w.lies("quant/data/market/intraday/index.json"), "refresh");
  } finally { aufraeumen(w.root); }
});

test("PR7 · Ein Tagesverlauf im Sitzungsordner steht nie unter Erzeugerhoheit", () => {
  const w = wettlauf("quant/data/market/intraday/2026-10-02/ref_AAPL.json");
  try {
    assert.equal(w.r.status, 1);
    assert.equal(w.lies("quant/data/market/intraday/2026-10-02/ref_AAPL.json"), "intraday");
  } finally { aufraeumen(w.root); }
});

/* PR8-PR11 · ERZEUGERPFADE JE AUFRUFER (Okt. 2026)
   Laeufe 37085599297, 37120824516, 38063088760: der Refresh verwarf nach
   70 Minuten Abruf alles an Konflikten in discover/data, quant/data/technical
   und den Faktoren - Dateien, deren eingetragener Erzeuger er selbst ist.
   Ein Aufrufer nennt seine Erzeugerpfade in PUSH_OWNED_PATHS; die globale
   Liste (PR3) bleibt unveraendert. */
const KARTE = "discover/data/stocks/US_REAL/AAPL.json";
const EUROPA = "discover/data/europe/manifest.json";
function wettlaufMit(datei, env, { eigenLoeschen = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vu-push3-"));
  const remote = join(root, "remote.git");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  const seed = join(root, "seed");
  git(root, "clone", "-q", remote, seed);
  schreibe(seed, datei, { stand: "basis" });
  git(seed, "add", "-A"); git(seed, "commit", "-q", "-m", "basis"); git(seed, "push", "-q", "origin", "HEAD:main");
  const refresh = join(root, "refresh"), pr = join(root, "pr");
  git(root, "clone", "-q", remote, refresh); git(root, "clone", "-q", remote, pr);
  schreibe(pr, datei, { stand: "feature-pr" });
  git(pr, "add", "-A"); git(pr, "commit", "-q", "-m", "feature-pr"); git(pr, "push", "-q", "origin", "HEAD:main");
  if (eigenLoeschen) git(refresh, "rm", "-q", datei); else schreibe(refresh, datei, { stand: "refresh" });
  git(refresh, "add", "-A"); git(refresh, "commit", "-q", "-m", "refresh");
  const r = spawnSync("bash", [SCRIPT, "main", "2"], { cwd: refresh, env: Object.assign({}, ENV, env || {}), encoding: "utf8" });
  const pruef = join(root, "pruef");
  git(root, "clone", "-q", remote, pruef);
  const lies = (f) => existsSync(join(pruef, f)) ? JSON.parse(readFileSync(join(pruef, f), "utf8")).stand : null;
  return { root, r, lies, head: git(pruef, "log", "-1", "--format=%s") };
}
const EIGEN = { PUSH_OWNED_PATHS: "discover/data/ quant/data/technical/ !discover/data/europe/" };

test("PR8 · Erzeugerpfad des Aufrufers im Konflikt mit einem Feature-PR: eigener Stand, Push gelingt; ohne Angabe Abbruch wie bisher", () => {
  const mit = wettlaufMit(KARTE, EIGEN);
  try {
    assert.equal(mit.r.status, 0, mit.r.stdout + mit.r.stderr);
    assert.match(mit.r.stdout, /Erzeugerhoheit aufgeloest \(eigener Stand\): discover\/data\/stocks\/US_REAL\/AAPL\.json/);
    assert.equal(mit.head, "refresh");
    assert.equal(mit.lies(KARTE), "refresh");
  } finally { aufraeumen(mit.root); }
  const ohne = wettlaufMit(KARTE, {});
  try {
    assert.equal(ohne.r.status, 1);
    assert.equal(ohne.head, "feature-pr");
  } finally { aufraeumen(ohne.root); }
});

test("PR9 · modify/delete: der eigene Lauf hat die Datei geloescht -> die Loeschung gilt", () => {
  const w = wettlaufMit("quant/data/technical/snapshots/ref_X.json", EIGEN, { eigenLoeschen: true });
  try {
    assert.equal(w.r.status, 0, w.r.stdout + w.r.stderr);
    assert.equal(w.head, "refresh");
    assert.equal(w.lies("quant/data/technical/snapshots/ref_X.json"), null);
  } finally { aufraeumen(w.root); }
});

test("PR10 · Ausgeschlossener Unterpfad (!discover/data/europe/) bleibt fremder Erzeuger: Abbruch", () => {
  const w = wettlaufMit(EUROPA, EIGEN);
  try {
    assert.equal(w.r.status, 1);
    assert.match(w.r.stderr, /Konflikt ausserhalb erzeugter Artefakte: discover\/data\/europe\/manifest\.json/);
    assert.equal(w.lies(EUROPA), "feature-pr");
  } finally { aufraeumen(w.root); }
});

test("PR11 · Der Refresh nennt nur Pfade, die er committet und deren eingetragener Erzeuger er ist", () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const wf = readFileSync(join(ROOT, ".github/workflows/market-data-refresh.yml"), "utf8");
  const m = wf.match(/PUSH_OWNED_PATHS:\s*"([^"]+)"/);
  assert.ok(m, "Refresh nennt keine Erzeugerpfade");
  const eigene = m[1].trim().split(/\s+/).filter((p) => !p.startsWith("!"));
  const ausgeschlossen = m[1].trim().split(/\s+/).filter((p) => p.startsWith("!")).map((p) => p.slice(1));
  const committet = [...wf.match(/for pfad in ([\s\S]*?); do/)[1].matchAll(/((?:quant|discover)\/[\w./-]+)/g)].map((x) => x[1]);
  const reg = JSON.parse(readFileSync(join(ROOT, "core/registry/domains.json"), "utf8"));
  const domains = (Array.isArray(reg.domains) ? reg.domains : Object.values(reg.domains || {})).filter(Boolean);
  for (const p of eigene) {
    assert.ok(committet.some((c) => (c + "/").startsWith(p) || c === p.replace(/\/$/, "")), "nicht im Commit des Refresh: " + p);
    const name = p.replace(/\/$/, "").split("/").pop();
    const dom = domains.find((d) => /market-data-refresh\.yml/.test(String(d.workflow)) && d.artifact &&
      (d.artifact.startsWith("/" + p) || ("/" + p).startsWith(d.artifact) || String(d.role || "").includes(name)));
    assert.ok(dom, "kein Registereintrag mit dem Refresh als Erzeuger fuer " + p);
  }
  /* Fremde Erzeuger unter discover/data sind ausgeschlossen. */
  for (const d of domains) {
    if (!d.artifact || !d.artifact.startsWith("/discover/data/") || /market-data-refresh\.yml/.test(String(d.workflow))) continue;
    if (/build-discover-data|global-search-index/.test(String(d.producer))) continue;
    const pfad = d.artifact.slice(1);
    assert.ok(ausgeschlossen.some((x) => pfad.startsWith(x)), "fremder Erzeuger nicht ausgeschlossen: " + d.artifact);
  }
});
