/* Modul-Steckbrief (module.json, Plan Neustart §3): Route, Navigation, Zugang, Status und Datenarten je Produkt.
   Der Steckbrief ist keine zweite Wahrheit: Erzeuger, Workflow, Zeitplan und Frische stehen nur in
   core/registry/domains.json, der Steckbrief verweist per Datenart-id. Menue (assets/site-navigation.js) und
   Statusseite (core/registry/modules.json -> /status/, system-health) entstehen aus den Steckbriefen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadModules, buildOutputs, PAGES } from "../../scripts/core/build-modules.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const Modules = createRequire(import.meta.url)("../modules.js");
const REG = JSON.parse(read("core/registry/domains.json"));
const MODS = loadModules(ROOT);
const NAV = read("assets/site-navigation.js");

/* Glob mit * nur im Dateinamen (z. B. quant/tests/*.test.mjs). */
function globCount(p) {
  if (!p.includes("*")) return existsSync(join(ROOT, p)) ? 1 : 0;
  const dir = dirname(p), re = new RegExp("^" + p.slice(dir.length + 1).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  return existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => re.test(f)).length : 0;
}

test("MM-1 · jedes Produkt hat einen Steckbrief; jede oberste Seite ist Produkt oder als Seite begruendet", () => {
  assert.ok(MODS.length >= 20, `nur ${MODS.length} Steckbriefe`);
  const withPage = readdirSync(ROOT).filter((d) => !d.startsWith(".") && !["node_modules", "docs"].includes(d) && statSync(join(ROOT, d)).isDirectory() && existsSync(join(ROOT, d, "index.html")));
  const known = new Set([...MODS.map((x) => x.dir), ...PAGES.map((p) => p.dir)]);
  assert.deepEqual(withPage.filter((d) => !known.has(d)), [], "Ordner mit index.html ohne Steckbrief und ohne Seiten-Begruendung (scripts/core/build-modules.mjs PAGES)");
  for (const p of PAGES) assert.ok(!MODS.some((x) => x.dir === p.dir) && p.reason, p.dir);
});

test("MM-2 · Schema: Pflichtfelder, Zugang free/pro/intern, Status, id = Ordner, Seite der Route existiert", () => {
  for (const { dir, m } of MODS) {
    assert.deepEqual(Modules.validate(m, REG), [], dir);
    assert.equal(m.id, dir, `${dir}: id muss dem Ordner gleichen`);
    assert.ok(existsSync(join(ROOT, m.route.replace(/^\//, ""), "index.html")), `${dir}: Seite ${m.route} fehlt`);
  }
});

test("MM-3 · Menue und Index entstehen aus den Steckbriefen (node scripts/core/build-modules.mjs)", () => {
  const { mods, indexText, navText } = buildOutputs(ROOT);
  for (const x of mods) assert.equal(x.text, Modules.format(x.m), `${x.file}: Schreibweise veraltet`);
  assert.equal(read("core/registry/modules.json"), indexText, "core/registry/modules.json veraltet");
  assert.equal(NAV, navText, "Menueblock in assets/site-navigation.js weicht von den Steckbriefen ab");
  for (const { m } of MODS.filter((x) => x.m.navigation)) assert.ok(NAV.includes(`'${m.navigation.href}'`), `${m.id}: Menueziel fehlt`);
});

test("MM-4 · Zugang: interne Produkte stehen nicht im Menue und sind noindex; Menueprodukte sind nicht intern", () => {
  for (const { dir, m } of MODS) {
    const html = read(join(m.route.replace(/^\//, ""), "index.html"));
    if (m.access === "intern") {
      assert.equal(m.navigation, null, `${dir}: intern, aber im Menue`);
      assert.ok(/<meta name="robots" content="noindex/.test(html), `${dir}: intern, aber ohne noindex`);
      assert.ok(!new RegExp(`\\['[^']+','${m.route.replace(/[/]/g, "\\/")}`).test(NAV), `${dir}: intern, aber im Menue verlinkt`);
    }
  }
  assert.equal(Modules.access(MODS.map((x) => x.m), "/status/"), "intern");
  assert.equal(Modules.access(MODS.map((x) => x.m), "/quant/#/screener"), "free");
  assert.equal(Modules.access(MODS.map((x) => x.m), "/konto/"), null);
});

test("MM-5 · Daten: jede Datenart ist in domains.json; jede Datenart hat hoechstens ein erzeugendes Produkt", () => {
  const owner = new Map();
  for (const { dir, m } of MODS) for (const d of m.data) {
    assert.ok(!owner.has(d), `${d}: erzeugt von ${owner.get(d)} und ${dir}`);
    owner.set(d, dir);
    const r = Modules.resolve(m, REG).find((x) => x.domain === d);
    assert.ok(r.producer && r.freshness, `${dir}/${d}: Erzeuger oder Frische fehlt in der Registry`);
  }
});

test("MM-6 · Tests: jeder genannte Vertragstest existiert", () => {
  for (const { dir, m } of MODS) for (const t of m.tests) assert.ok(globCount(t) > 0, `${dir}: Test ${t} fehlt`);
});

test("MM-7 · Statusseite und system-health lesen die Steckbriefe", () => {
  assert.match(read("status/status.js"), /\/core\/registry\/modules\.json/);
  assert.match(read("status/index.html"), /\/core\/modules\.js/);
  assert.match(read("scripts/core/system-health.mjs"), /productHealth/);
  const report = { domains: [{ id: "analystConsensus", status: "OK" }, { id: "analystRatings", status: "STALE" }] };
  const [a] = Modules.productHealth([MODS.find((x) => x.dir === "analysten").m], report);
  assert.equal(a.status, "STALE"); assert.deepEqual(a.cause, ["analystRatings"]);
  assert.equal(Modules.productHealth([{ id: "x", data: [], reads: [] }], report)[0].status, "NO_DATA");
});

test("MM-8 · Gegenprobe: falscher Zugang, unbekannte Datenart und internes Produkt im Menue fallen auf", () => {
  const m = MODS.find((x) => x.dir === "analysten").m;
  assert.ok(Modules.validate({ ...m, access: "vip" }, REG).length);
  assert.ok(Modules.validate({ ...m, data: ["gibtsNicht"] }, REG).length);
  assert.ok(Modules.validate({ ...m, access: "intern" }, REG).length);
  assert.ok(!Modules.navGroups([{ ...m, access: "intern" }]).includes("/analysten/"));
});

test("MM-9 · Ordnerstruktur: Steckbriefe nur unter products/<id>/, kein module.json mehr im Web-Ordner", () => {
  const stray = readdirSync(ROOT).filter((d) => !d.startsWith(".") && d !== "products" && d !== "node_modules" && statSync(join(ROOT, d)).isDirectory() && existsSync(join(ROOT, d, "module.json")));
  assert.deepEqual(stray, [], "module.json gehoert nach products/<id>/");
  for (const { dir, file } of MODS) assert.equal(file, join("products", dir, "module.json"));
});
