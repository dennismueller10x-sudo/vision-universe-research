/* Modul-Steckbrief (module.json, Plan Neustart §3): Route, Navigation, Zugang, Status, Erzeuger, Zeitplan und
   Frische-Grenze je Produkt. Pilot: analysten/module.json. Der Steckbrief ist keine zweite Wahrheit: Erzeuger,
   Workflow, Zeitplan und Frische muessen der Registry (core/registry/domains.json) gleichen, Route und Menue der
   Seite und der Navigation, und jeder genannte Pfad muss existieren. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const REG = JSON.parse(read("core/registry/domains.json"));
const DOMAINS = new Map((Array.isArray(REG.domains) ? REG.domains : Object.values(REG.domains || REG)).filter((x) => x && x.id).map((x) => [x.id, x]));
const NAV = read("assets/site-navigation.js");
const SKIP = new Set(["node_modules", ".git", "docs"]);
const MODULES = readdirSync(ROOT).filter((d) => !SKIP.has(d) && !d.startsWith(".") && statSync(join(ROOT, d)).isDirectory() && existsSync(join(ROOT, d, "module.json")))
  .map((d) => ({ dir: d, m: JSON.parse(read(join(d, "module.json"))) }));
const ACCESS = ["free", "pro", "intern"], STATUS = ["LIVE", "BETA", "PREPARED", "RETIRED"];

test("MM-1 · Pilot vorhanden: mindestens ein Steckbrief, darunter analysten", () => {
  assert.ok(MODULES.some((x) => x.dir === "analysten"), "analysten/module.json fehlt");
});

test("MM-2 · Schema: Pflichtfelder, Zugang free/pro/intern, Status, id = Ordner, Route = /<id>/ mit Seite", () => {
  for (const { dir, m } of MODULES) {
    assert.equal(m.schema, "vu-module-1", dir);
    for (const k of ["id", "label", "status", "route", "navigation", "access", "data", "tests"]) assert.ok(m[k] !== undefined, `${dir}: ${k} fehlt`);
    assert.equal(m.id, dir, `${dir}: id muss dem Ordner gleichen`);
    assert.ok(ACCESS.includes(m.access), `${dir}: Zugang ${m.access}`);
    assert.ok(STATUS.includes(m.status), `${dir}: Status ${m.status}`);
    assert.equal(m.route, "/" + dir + "/", `${dir}: Route`);
    assert.ok(existsSync(join(ROOT, dir, "index.html")), `${dir}: Seite ${m.route} fehlt`);
  }
});

test("MM-3 · Navigation: der Menueeintrag steht so in assets/site-navigation.js, in der genannten Gruppe", () => {
  for (const { dir, m } of MODULES) {
    const n = m.navigation, entry = `['${n.label}','${n.href}','${n.icon}']`;
    assert.equal(n.href, m.route, `${dir}: Menue-Ziel = Route`);
    const group = NAV.split("\n").find((l) => l.includes(`{id:'${n.group}'`));
    assert.ok(group, `${dir}: Menuegruppe ${n.group} fehlt`);
    assert.ok(group.includes(entry), `${dir}: ${entry} nicht in Gruppe ${n.group}`);
  }
});

test("MM-4 · Daten: Erzeuger, Workflow, Zeitplan und Frische gleich der Registry; Artefakt, Erzeuger und Workflow existieren", () => {
  for (const { dir, m } of MODULES) {
    assert.ok(Array.isArray(m.data), dir);
    for (const x of m.data) {
      const d = DOMAINS.get(x.domain);
      assert.ok(d, `${dir}: Datenart ${x.domain} nicht in domains.json`);
      for (const k of ["artifact", "producer", "workflow", "schedule"]) assert.equal(x[k], d[k], `${dir}/${x.domain}: ${k} weicht von der Registry ab`);
      assert.deepEqual(x.freshness, d.freshness, `${dir}/${x.domain}: Frische weicht von der Registry ab`);
      assert.ok((d.consumers || []).includes(m.route), `${dir}/${x.domain}: Registry nennt ${m.route} nicht als Verbraucher`);
      assert.ok(existsSync(join(ROOT, x.artifact.replace(/^\//, ""))), `${dir}/${x.domain}: Artefakt ${x.artifact} fehlt`);
      assert.ok(existsSync(join(ROOT, x.producer)), `${dir}/${x.domain}: Erzeuger ${x.producer} fehlt`);
      const wf = (x.workflow.match(/[\w.-]+\.ya?ml/) || [])[0];
      assert.ok(wf && existsSync(join(ROOT, ".github/workflows", wf)), `${dir}/${x.domain}: Workflow ${x.workflow} fehlt`);
      assert.ok(read(join(".github/workflows", wf)).includes(x.producer), `${dir}/${x.domain}: ${wf} ruft ${x.producer} nicht auf`);
    }
  }
});

test("MM-5 · Tests: jeder genannte Vertragstest existiert", () => {
  for (const { dir, m } of MODULES) for (const t of m.tests) assert.ok(existsSync(join(ROOT, t)), `${dir}: Test ${t} fehlt`);
});

test("MM-6 · Gegenprobe: eine abweichende Frische oder ein fehlender Menueeintrag faellt auf", () => {
  const { m } = MODULES.find((x) => x.dir === "analysten"), x = m.data[0], d = DOMAINS.get(x.domain);
  assert.notDeepEqual({ ...x.freshness, staleAfter: x.freshness.staleAfter + 1 }, d.freshness);
  assert.ok(!NAV.includes(`['${m.navigation.label}','/nicht-da/','${m.navigation.icon}']`));
});
