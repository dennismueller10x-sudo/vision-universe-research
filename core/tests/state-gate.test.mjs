/* Core · Zustandstests entkoppeln: scripts/ci/state-gate.mjs

   Querverträge über ERZEUGTE Daten zweier Produkte (core/tests/state/) bleiben
   verbindlich, blockieren aber nur dort, wo ihr Befund den PR betrifft.
   Hermetisch: eigene Wegwerf-Tests, keine Produktionsdaten. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(ROOT, "scripts", "ci", "state-gate.mjs");
const { globToRegExp, beruehrt, entscheide } = await import(GATE);
const lies = (rel) => readFileSync(join(ROOT, rel), "utf8");
const MANIFEST = JSON.parse(lies("core/tests/state/manifest.json"));
const EINTRAG = MANIFEST.tests[0];

test("SG1 · Globs: ** über Ebenen, * innerhalb einer Ebene, Punkte wörtlich", () => {
  const m = (g, f) => globToRegExp(g).test(f);
  assert.equal(m("supertrader/**", "supertrader/data/signals.json"), true);
  assert.equal(m("supertrader/**", "scripts/supertrader/build.mjs"), false, "anderer Wurzelpfad");
  assert.equal(m("scripts/supertrader/**", "scripts/supertrader/engine/x.mjs"), true);
  assert.equal(m("core/*.js", "core/client.js"), true);
  assert.equal(m("core/*.js", "core/registry/domains.json"), false);
  assert.equal(m("core/*.js", "core/tests/x.js"), false, "keine tieferen Ebenen");
  assert.equal(m(".github/workflows/supertrader-*.yml", ".github/workflows/supertrader-signals.yml"), true);
  assert.equal(m(".github/workflows/supertrader-*.yml", ".github/workflows/supertraderXsignals.yml"), false, "Punkt und Bindestrich wörtlich");
  assert.equal(m("a.b", "aXb"), false);
  assert.deepEqual(beruehrt(["a/x", "b/y"], ["a/**"]), ["a/x"]);
});

test("SG2 · Entscheidungstabelle: grün, streng, beteiligt, Datenbefund; Unbekanntes ist streng", () => {
  const e = (o) => entscheide(Object.assign({ event: "pull_request", strict: false, rot: true, geaendert: [], manifestEintrag: EINTRAG }, o));
  assert.equal(e({ rot: false }).exit, 0);
  for (const event of ["push", "schedule", "workflow_dispatch", "unbekannt"]) assert.equal(e({ event }).exit, 1, event);
  assert.equal(e({ strict: true }).exit, 1);
  assert.equal(e({ geaendert: ["supertrader/data/signals.json"] }).exit, 1);
  assert.equal(e({ geaendert: ["supertrader/data/signals.json"] }).art, "beteiligt");
  assert.equal(e({ geaendert: ["discover/engines/refresh-plan.js"] }).exit, 0);
  assert.equal(e({ geaendert: ["discover/engines/refresh-plan.js"] }).art, "datenbefund");
  assert.equal(e({ geaendert: null }).exit, 1, "Git-Fehler: nie still 'keine Dateien'");
  assert.equal(e({ manifestEintrag: null }).exit, 1, "Test ohne Manifest-Eintrag ist streng");
});

function fixture(tests, manifestTests) {
  const dir = mkdtempSync(join(tmpdir(), "vu-state-gate-"));
  mkdirSync(join(dir, "state"));
  for (const [name, rot] of Object.entries(tests)) {
    writeFileSync(join(dir, "state", name), `import test from "node:test";import assert from "node:assert/strict";\ntest("Fixture · ${name}", () => { assert.deepEqual(${rot ? '["QRVO: toter Link"]' : "[]"}, []); });\n`);
  }
  writeFileSync(join(dir, "state", "manifest.json"), JSON.stringify({ schema: "core-state-tests-1.0.0", tests: manifestTests }));
  return dir;
}
function lauf(dir, args, geaendert) {
  const dateiListe = join(dir, "changed.txt");
  if (geaendert) writeFileSync(dateiListe, geaendert.join("\n") + "\n");
  const r = spawnSync(process.execPath, [GATE, "--dir=" + join(dir, "state"), ...(geaendert ? ["--changed=" + dateiListe] : []), ...args],
    { encoding: "utf8", env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: "", GITHUB_EVENT_NAME: "" }) });
  return { code: r.status, text: r.stdout + r.stderr };
}
const eintrag = (file) => ({ file, title: "Fixture " + file, producers: ["A -> a.yml", "B -> b.yml"], remedy: "A laufen lassen", blockingWhenPrTouches: ["a/**", "core/*.js"] });

test("SG3 · Ende-zu-Ende: derselbe rote Test blockiert nur den beteiligten PR und immer die Daten (main, Zeitplan, strict)", () => {
  const dir = fixture({ "rot.test.mjs": true }, [eintrag("rot.test.mjs")]);
  try {
    const frei = lauf(dir, ["--event=pull_request"], ["discover/engines/x.js", "docs/y.md"]);
    assert.equal(frei.code, 0, frei.text);
    assert.match(frei.text, /::warning title=Zustandstest rot \(Datenbefund, nicht dieser PR\)/);
    assert.match(frei.text, /QRVO: toter Link/);
    assert.match(frei.text, /Erzeuger: A -> a\.yml · B -> b\.yml/);
    assert.match(frei.text, /Abhilfe: A laufen lassen/);
    const beteiligt = lauf(dir, ["--event=pull_request"], ["a/data/x.json"]);
    assert.equal(beteiligt.code, 1, beteiligt.text);
    assert.match(beteiligt.text, /::error title=Zustandstest rot::.*a\/data\/x\.json/);
    for (const ev of ["push", "schedule", "workflow_dispatch"]) assert.equal(lauf(dir, ["--event=" + ev], ["docs/y.md"]).code, 1, ev);
    assert.equal(lauf(dir, ["--event=pull_request", "--strict"], ["docs/y.md"]).code, 1, "--strict");
    /* Änderungen nicht ermittelbar (keine Liste, kein base/head): gilt als beteiligt */
    assert.equal(lauf(dir, ["--event=pull_request"]).code, 1);
    assert.equal(lauf(dir, ["--event=pull_request", "--base=0000000000000000000000000000000000000000", "--head=1111111111111111111111111111111111111111"]).code, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SG4 · grüner Test: Exit 0 in jedem Ereignis; ein nicht im Manifest geführter roter Test ist auch im PR streng", () => {
  let dir = fixture({ "gruen.test.mjs": false }, [eintrag("gruen.test.mjs")]);
  try {
    for (const ev of ["pull_request", "push", "schedule"]) assert.equal(lauf(dir, ["--event=" + ev], ["docs/y.md"]).code, 0, ev);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  dir = fixture({ "rot.test.mjs": true }, []);
  try {
    const r = lauf(dir, ["--event=pull_request"], ["docs/y.md"]);
    assert.equal(r.code, 1, r.text);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("SG5 · echtes Manifest: jede Zustandsdatei ist geführt, jeder Eintrag existiert, der Fall #637 blockiert nicht", () => {
  const dateien = readdirSync(join(ROOT, "core", "tests", "state")).filter((n) => n.endsWith(".test.mjs"));
  assert.deepEqual(dateien.sort(), MANIFEST.tests.map((t) => t.file).sort());
  for (const t of MANIFEST.tests) {
    assert.ok(existsSync(join(ROOT, "core", "tests", "state", t.file)), t.file);
    assert.ok(t.producers.length >= 2, "zwei Erzeuger: sonst wäre es ein Code-Test");
    assert.ok(t.remedy && t.blockingWhenPrTouches.length);
  }
  const blocks = (f) => beruehrt(f, EINTRAG.blockingWhenPrTouches).length > 0;
  /* Der PR, der den Blocker gezeigt hat (Im Blick nach dem Nachtlauf, #637) */
  assert.equal(blocks([".github/workflows/market-data-refresh.yml", "core/registry/domains.json", "discover/engines/refresh-plan.js", "scripts/discover/build-im-blick-live.mjs", "discover/tests/im-blick-nachtlauf.test.mjs", "docs/DISCOVER_IM_BLICK.md"]), false);
  /* Was den Test wirklich betrifft, blockiert weiter */
  for (const f of ["supertrader/data/signals.json", "scripts/supertrader/build.mjs", "supertrader/assets/supertrader.js", ".github/workflows/supertrader-signals.yml",
                   "discover/data/stock-index/US_REAL.json", "quant/data/market/factors/factors-FULL_UNIVERSE-summary.json", "core/client.js", "core/identity.js",
                   "core/tests/state/supertrader-discover.test.mjs", "scripts/ci/state-gate.mjs", ".github/workflows/core-ci.yml"])
    assert.equal(blocks([f]), true, f);
});

test("SG6 · Verdrahtung: Code-Tests ohne Zustandstests, Zustandstests im selben Job (ein Pflicht-Check), streng im Zeitplan", () => {
  const ci = lies(".github/workflows/core-ci.yml");
  assert.match(ci, /node --test "core\/tests\/\*\.test\.mjs"/, "der Glob schließt core/tests/state/ nicht ein");
  const core = ci.slice(ci.indexOf("\n  core:\n"), ci.indexOf("\n  live:\n"));
  const live = ci.slice(ci.indexOf("\n  live:\n"));
  assert.ok(core.indexOf("scripts/ci/state-gate.mjs") > core.indexOf("Core-Tests"), "nach den Code-Tests, im Job `core`");
  assert.match(core, /--event="\$EVENT"/);
  /* Im PR bekommt das Gate die geaenderten Dateien als Liste: Merge-Commit gegen seine Basis (erster Elternteil).
     Der Checkout muss die Basis erreichen (Tiefe 2 im PR), ein Git-Fehler darf nie still "0 Dateien" melden. */
  assert.match(core, /--changed="\$RUNNER_TEMP\/changed\.txt"/);
  assert.match(core, /fetch-depth: \$\{\{ github\.event_name == 'pull_request' && 2 \|\| 1 \}\}/, "PR: Merge-Commit samt Eltern");
  const liste = core.slice(core.indexOf("- name: Geaenderte Dateien des PR"), core.indexOf("- name: Core-Tests"));
  assert.match(liste, /set -euo pipefail/);
  assert.match(liste, /git rev-parse HEAD\^2\)" != "\$HEAD_SHA"/, "Checkout ist der Merge-Commit des PR-Kopfs");
  assert.match(liste, /git diff --name-only HEAD\^1 HEAD > "\$RUNNER_TEMP\/changed\.txt"/);
  assert.ok(core.indexOf("- name: Geaenderte Dateien des PR") < core.indexOf("scripts/ci/state-gate.mjs"), "Liste vor dem Gate");
  for (const aufruf of core.split("\n").filter((z) => z.includes("node scripts/ci/state-gate.mjs"))) {
    assert.ok(!aufruf.includes("${{"), "Eingaben nur über env:, nie im Shell-Text");
  }
  assert.match(live, /state-gate\.mjs --strict/, "Zeitplan/Dispatch: streng");
  /* Der Glob der Code-Tests nimmt die Unterordner nicht mit */
  assert.ok(readdirSync(join(ROOT, "core", "tests")).filter((n) => n.endsWith(".test.mjs")).every((n) => n !== "supertrader-discover.test.mjs"));
});

test("SG7 · die Querverträge sind unverändert übernommen: gleiche Prüfungen, nur an anderem Ort", () => {
  const neu = lies("core/tests/state/supertrader-discover.test.mjs");
  const golden = lies("core/tests/golden-paths.test.mjs");
  assert.doesNotMatch(golden, /Supertrader · /, "aus golden-paths entfernt");
  assert.equal((neu.match(/^test\(/gm) || []).length, 2);
  for (const zeile of [
    "assert.ok(symbole.length > 50);",
    'fehler.push(t + ": nicht im Discover-Universum und nicht als discoverAvailability.unavailable ausgewiesen (toter Link)");',
    'fehler.push(t + ": als nicht verfuegbar ausgewiesen, hat aber eine Discover-Seite (veralteter Ausweis)");',
    'fehler.push(t + ": keine kanonische Tagesreihe");',
    "assert.equal(sig.asOf, json(\"supertrader/data/build.json\").asOf);",
    "assert.ok(st <= eod, \"Supertrader vor den Kursen?\");",
    "assert.ok(d(st, eod) <= 4, \"Supertrader \" + st + \" vs Kurse \" + eod);"
  ]) assert.ok(neu.includes(zeile), zeile);
  /* keine Schwelle gelockert: Toleranz bleibt "höchstens 4 Tage" */
  assert.doesNotMatch(neu, /<=\s*(?:[5-9]|\d{2,})\)/);
});
