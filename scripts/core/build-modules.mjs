/* Baut aus den Modul-Steckbriefen (products/<id>/module.json, core/modules.js) den Index
   core/registry/modules.json und den Menueblock in assets/site-navigation.js.

     node scripts/core/build-modules.mjs           schreibt Index, Menueblock und Steckbrief-Schreibweise
     node scripts/core/build-modules.mjs --check   prueft nur; Exit 1, wenn etwas veraltet ist

   Neue Menueeintraege entstehen im Steckbrief des Produkts, nicht in site-navigation.js. */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Modules = createRequire(import.meta.url)("../../core/modules.js");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/* Seiten mit eigener Route, die kein Produkt sind (kein Steckbrief). Jede oberste Seite ist entweder Produkt oder hier begruendet. */
export const PAGES = [
  { dir: "aktie", reason: "Weiterleitung auf die Aktienansicht (Discover/Quant), kein eigenes Produkt" },
  { dir: "discover-v2", reason: "Altadresse, leitet auf /discover/ um" },
  { dir: "vu2", reason: "Altadresse des Neubaus, leitet um" },
  { dir: "infos", reason: "Info- und Rechtsseiten" },
  { dir: "konto", reason: "Konto und Tarif (Mein Bereich im Menue, workers/vu-account)" },
  { dir: "mein-dashboard", reason: "Mein Bereich (persoenliche Startseite), kein Produkt" },
  { dir: "landing", reason: "Kampagnenseiten" },
  { dir: "preise", reason: "Preisseite des Kontos" },
  { dir: "willkommen", reason: "Willkommensseite der Nutzerfuehrung" }
];

/* Steckbriefe liegen unter products/<id>/module.json (Plan Neustart §3: products/<id>/{module.json,web,engine,producer,tests}).
   Die Seite selbst bleibt unter /<id>/ (Pages-Pfade aendern sich nicht). */
export const PRODUCTS_DIR = "products";
export function loadModules(root = ROOT) {
  const base = join(root, PRODUCTS_DIR);
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((d) => statSync(join(base, d)).isDirectory() && existsSync(join(base, d, "module.json"))).sort()
    .map((d) => ({ dir: d, file: join(PRODUCTS_DIR, d, "module.json"), text: readFileSync(join(base, d, "module.json"), "utf8") }))
    .map((x) => ({ ...x, m: JSON.parse(x.text) }));
}

export function buildOutputs(root = ROOT) {
  const mods = loadModules(root), modules = mods.map((x) => x.m);
  const indexText = JSON.stringify(Modules.index(modules, PAGES), null, 1) + "\n";
  const nav = readFileSync(join(root, "assets/site-navigation.js"), "utf8");
  /* Block der Produktgruppen: Zeilen zwischen "const groups = [" und "];". Kommentarzeilen darin bleiben stehen
     (am Blockanfang), damit der Menueblock ohne Aenderung der UI-gesperrten Datei pruefbar ist. */
  const open = "  const groups = [\n", a = nav.indexOf(open);
  if (a < 0) throw new Error("Menueblock (const groups = [) fehlt in assets/site-navigation.js");
  const start = a + open.length, end = nav.indexOf("\n  ];\n", start);
  if (end < 0) throw new Error("Ende des Menueblocks fehlt in assets/site-navigation.js");
  const lines = nav.slice(start, end).split("\n");
  const comments = lines.filter((l) => /^\s*\/\*.*\*\/\s*$/.test(l));
  const current = lines.filter((l) => !/^\s*\/\*.*\*\/\s*$/.test(l)).join("\n");
  const generated = Modules.navGroups(modules);
  const navText = current === generated ? nav : nav.slice(0, start) + comments.concat(generated).join("\n") + nav.slice(end);
  return { mods, indexText, navText, nav };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const check = process.argv.includes("--check");
  const { mods, indexText, navText, nav } = buildOutputs();
  const stale = [];
  const put = (p, now, want) => { if (now !== want) { stale.push(p); if (!check) writeFileSync(join(ROOT, p), want); } };
  for (const x of mods) put(x.file, x.text, Modules.format(x.m));
  put("core/registry/modules.json", existsSync(join(ROOT, "core/registry/modules.json")) ? read("core/registry/modules.json") : "", indexText);
  put("assets/site-navigation.js", nav, navText);
  if (check && stale.length) { console.error("Veraltet (node scripts/core/build-modules.mjs): " + stale.join(", ")); process.exit(1); }
  console.log(`${mods.length} Steckbriefe · ${check ? "geprueft" : stale.length ? "geschrieben: " + stale.join(", ") : "unveraendert"}`);
}
