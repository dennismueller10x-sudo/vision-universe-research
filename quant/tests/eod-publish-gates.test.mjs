/* =========================================================================
   EOD-PUBLISH-GATES (Owner 24.09.2026)

   Vorfall 18.-23.09.2026: Die Regressionssuite lief erst nach dem Abruf;
   ein Test, der Signalereignisse auf dem gerade fortgeschriebenen Bestand
   zaehlte (5 !== 4), verwarf viermal einen vollstaendigen Tageslauf.

   EG1-EG3  Einteilung und Workflow-Reihenfolge (A vor jeder Anfrage,
            B vor dem Commit, C danach und nicht blockierend).
   EG4-EG6  Der Vorfall nachgespielt an einem Fixture-Root: derselbe Code,
            neue Daten, ein wertgebundener Test wird rot -> veroeffentlicht
            und gemeldet. Gegenproben: ein verletzter Datenvertrag
            blockiert, ein Code-Fehler verhindert den Abruf.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = join(ROOT, "scripts", "market", "run-eod-publish-gates.mjs");
const manifest = JSON.parse(readFileSync(join(ROOT, "quant", "config", "eod-publish-gates.json"), "utf8"));
const workflow = readFileSync(join(ROOT, ".github", "workflows", "market-data-refresh.yml"), "utf8");
const list = (phase) => spawnSync(process.execPath, [RUNNER, "--list=" + phase], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);

test("EG1 · A umfasst beide Suiten vollstaendig; B ist Teil davon; C ist der Rest - nichts faellt heraus", () => {
  const alle = ["quant/tests", "discover/tests"].flatMap((d) => readdirSync(join(ROOT, d)).filter((n) => n.endsWith(".test.mjs")).map((n) => d + "/" + n)).sort();
  const pre = list("pre"), integrity = list("integrity"), obs = list("observability");
  assert.deepEqual(pre.slice().sort(), alle);
  for (const f of integrity) { assert.ok(existsSync(join(ROOT, f)), f); assert.ok(pre.includes(f), f); }
  assert.deepEqual([...integrity, ...obs].sort(), alle);
  assert.equal(integrity.filter((f) => obs.includes(f)).length, 0);
  assert.ok(integrity.length >= 10, "B darf nicht leer gemacht werden");
});

test("EG2 · Die Vorfall-Tests sind Beobachtung, die Datenvertraege bleiben blockierend", () => {
  const integrity = list("integrity"), obs = list("observability");
  /* 22./23.09.: 5 !== 4; 21.09.: 6406 !== 6401 - Zaehlungen am Bestand. */
  assert.ok(obs.includes("quant/tests/market-signal-contract.test.mjs"));
  assert.ok(obs.includes("quant/tests/product-services.test.mjs"));
  for (const f of ["quant/tests/public-data-hygiene.test.mjs", "quant/tests/secrets.test.mjs",
                   "discover/tests/data.test.mjs", "discover/tests/klartext.test.mjs"]) assert.ok(integrity.includes(f), f);
  for (const s of ["verify-technical-data.mjs", "verify-discover-data.mjs", "assert-no-secrets.mjs",
                   "assert-daily-lifecycle-health.mjs --strict", "assert-public-data-hygiene.mjs"]) {
    assert.ok(manifest.classes.POST_FETCH_DATA_INTEGRITY.scripts.some((x) => x.endsWith(s)), s);
    assert.ok(workflow.includes(s), "Integritaets-Skript fehlt im Workflow: " + s);
  }
});

test("EG3 · Workflow: A vor jeder Anfrage, B vor dem Commit, C danach und ohne Einfluss auf Commit und Pages", () => {
  const schritte = workflow.split(/\n      - name: /).slice(1).map((b) => ({ name: b.split("\n")[0], body: b }));
  const idx = (re) => schritte.findIndex((s) => re.test(s.name + "\n" + s.body));
  const a = idx(/--phase=pre/), key = idx(/Ist ein Zugang hinterlegt/), cache = idx(/cache\/restore/),
        rej = idx(/classify-rejections\.mjs --apply/), ingest = idx(/ingest-tiingo\.mjs/),
        b = idx(/--phase=integrity/), commit = idx(/^Commit und Push/), c = idx(/--phase=observability/);
  for (const [n, v] of Object.entries({ a, key, cache, rej, ingest, b, commit, c })) assert.ok(v >= 0, n);
  assert.ok(a < key && a < cache && a < rej && a < ingest, "Gate A muss vor jedem Abruf stehen");
  assert.ok(ingest < b && b < commit, "Gate B muss zwischen Abruf und Commit stehen");
  assert.ok(commit < c, "Gate C laeuft erst nach dem Commit");
  assert.match(schritte[c].body, /continue-on-error: true/);
  assert.ok(!/if:/.test(schritte[commit].body.split("run:")[0]), "Commit haengt an keiner Sonderbedingung");
  /* Die alte, ungeteilte Suite vor dem Commit ist weg. */
  const vorCommit = schritte.slice(0, commit).map((s) => s.body).join("\n");
  assert.ok(!/node --test/.test(vorCommit), "keine ungeteilte Regressionssuite vor dem Commit");
  /* Warum C den Lauf nicht rot machen darf: Pages liefert nur bei success. */
  const pages = readFileSync(join(ROOT, ".github", "workflows", "pages-release.yml"), "utf8");
  assert.match(pages, /workflow_run\.conclusion == 'success'/);
});

/* ------------------------------------------------ der Vorfall, nachgespielt */

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vu-eod-gates-"));
  mkdirSync(join(dir, "t"), { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });
  const daten = (v) => writeFileSync(join(dir, "data", "bestand.json"), JSON.stringify(v));
  const t = (name, body) => writeFileSync(join(dir, "t", name), 'import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";\n' +
    'const d=()=>JSON.parse(readFileSync(new URL("../data/bestand.json",import.meta.url)));\n' + body + "\n");
  /* Code-Test ohne Daten. */
  t("code.test.mjs", 'test("rechnet",()=>assert.equal(1+1,2));');
  /* Wie market-signal-contract vor dem Fix: zaehlt am Bestand. */
  t("signale.test.mjs", 'test("vier Ereignisse",()=>assert.equal(d().ereignisse.length,4));');
  /* Datenvertrag: kein Datum in der Zukunft, keine Rohbars. */
  t("vertrag.test.mjs", 'test("Datenvertrag",()=>{const b=d();assert.ok(b.asOf<="2026-09-23");assert.equal(b.rohbars,0);});');
  const man = { suites: ["t/*.test.mjs"], classes: { POST_FETCH_DATA_INTEGRITY: { files: ["t/vertrag.test.mjs"] } } };
  writeFileSync(join(dir, "gates.json"), JSON.stringify(man));
  const lauf = (phase) => spawnSync(process.execPath, [RUNNER, "--phase=" + phase, "--root=" + dir, "--manifest=" + join(dir, "gates.json")],
                                    { encoding: "utf8", env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: "" }) });
  return { dir, daten, t, lauf };
}

test("EG4 · Der Vorfall: gruen vor dem Abruf, ein wertgebundener Test rot danach -> veroeffentlicht und gemeldet", () => {
  const f = fixture();
  try {
    f.daten({ asOf: "2026-09-18", rohbars: 0, ereignisse: [1, 2, 3, 4] });
    assert.equal(f.lauf("pre").status, 0, "vor dem Abruf gruen");
    /* Der Abruf: neue Sitzungen, ein neues Ereignis. */
    f.daten({ asOf: "2026-09-23", rohbars: 0, ereignisse: [1, 2, 3, 4, 5] });
    const b = f.lauf("integrity");
    assert.equal(b.status, 0, "Gate B: die Daten halten den Vertrag -> Commit\n" + b.stdout);
    const c = f.lauf("observability");
    assert.equal(c.status, 0, "Gate C blockiert nicht");
    assert.match(c.stdout, /::error title=Regressionstest nach dem Abruf rot \(nicht blockierend\),file=t\/signale\.test\.mjs,line=\d+::vier Ereignisse/);
    /* Gegenprobe: dieselbe Lage im alten Aufbau (eine Suite vor dem Commit) waere rot gewesen. */
    const env = Object.assign({}, process.env); delete env.NODE_TEST_CONTEXT;
    const alt = spawnSync(process.execPath, ["--test", "t/code.test.mjs", "t/signale.test.mjs", "t/vertrag.test.mjs"], { cwd: f.dir, env, encoding: "utf8" });
    assert.notEqual(alt.status, 0);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("EG5 · Gegenprobe: neue Daten verletzen den Datenvertrag -> Gate B rot, keine Veroeffentlichung", () => {
  const f = fixture();
  try {
    f.daten({ asOf: "2026-09-18", rohbars: 0, ereignisse: [1, 2, 3, 4] });
    assert.equal(f.lauf("pre").status, 0);
    f.daten({ asOf: "2026-09-23", rohbars: 12, ereignisse: [1, 2, 3, 4] });
    const b = f.lauf("integrity");
    assert.equal(b.status, 1);
    assert.match(b.stdout, /POST_FETCH_DATA_INTEGRITY rot/);
    f.daten({ asOf: "2099-01-01", rohbars: 0, ereignisse: [1, 2, 3, 4] });
    assert.equal(f.lauf("integrity").status, 1, "Zukunftsdatum blockiert ebenso");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("EG6 · Gegenprobe: ein Code-Fehler ist vor dem Abruf rot -> keine Anfrage", () => {
  const f = fixture();
  try {
    f.daten({ asOf: "2026-09-18", rohbars: 0, ereignisse: [1, 2, 3, 4] });
    f.t("code.test.mjs", 'test("rechnet",()=>assert.equal(1+1,3));');
    const a = f.lauf("pre");
    assert.equal(a.status, 1);
    assert.match(a.stdout, /PRE_FETCH_CODE_REGRESSION rot: kein Provider-Abruf/);
    /* Und ein B-Test ist Teil von A: auch er haelt den Abruf an, wenn der Code ihn bricht. */
    const f2 = fixture();
    try {
      f2.daten({ asOf: "2026-09-18", rohbars: 3, ereignisse: [1, 2, 3, 4] });
      assert.equal(f2.lauf("pre").status, 1);
    } finally { rmSync(f2.dir, { recursive: true, force: true }); }
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
