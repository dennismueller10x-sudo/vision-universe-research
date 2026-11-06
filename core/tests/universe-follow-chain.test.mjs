/* Folgekette nach einer Universumsaenderung (Lehre vom 05.11.2026, docs/neustart/A-infrastruktur.md).
   Aendert sich das Produktuniversum (eligibility.json), muessen die Erzeuger aller Artefakte, deren Umfang
   die oeffentliche Hygienepruefung am Produktuniversum misst, im selben Lauf nachziehen. Sonst ist main bis
   zum naechsten Datenlauf rot (131 ETFs in Discover-Reihen, Intraday und Technical-Signalen).
   Vertrag:
   - UF-1: nur security-master-eligibility.yml schreibt eligibility.json (ein Erzeuger, eine Folgekette).
   - UF-2: jedes Verzeichnis, das assert-public-data-hygiene.mjs am Produktumfang misst, zieht die Folgekette nach:
           es gehoert zu PUSH_OWNED_PATHS des Folge-Schritts, oder (technical-signals-v1) der Lauf stoesst die
           Materialisierung an. Eine neue umfangsgepruefte Datenart ohne Folge macht diesen Test rot.
   - UF-3: der Folge-Schritt laeuft nach jeder uebernommenen Eignung, ruft die Erzeuger (kein Abruf) und
           endet mit der Hygienepruefung.
   - UF-4: Andere Workflows, die eligibility.json nur lesen, sind erlaubt (kein falscher Alarm). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WF_DIR = join(ROOT, ".github/workflows");
const ELIG = "quant/data/market/security-master/eligibility.json";
const OWNER = "security-master-eligibility.yml";
const HYGIENE = readFileSync(join(ROOT, "scripts/market/assert-public-data-hygiene.mjs"), "utf8");
const OWNER_SRC = readFileSync(join(WF_DIR, OWNER), "utf8");

/** Schritte eines Workflows grob in Bloecke ab "- name:" zerlegen. */
function steps(src) {
  const out = [];
  const re = /^ {6}- name: (.+)$/gm;
  const marks = [...src.matchAll(re)];
  marks.forEach((m, i) => out.push({ name: m[1].trim(), body: src.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : src.length) }));
  return out;
}
function ownedPaths(body) {
  const m = body.match(/PUSH_OWNED_PATHS:\s*(.+)$/m);
  return m ? m[1].trim().split(/\s+/) : [];
}
/** Schreibt dieser Workflow eligibility.json? (eigene Pfade oder git add) */
function writesEligibility(src) {
  for (const s of steps(src)) {
    if (ownedPaths(s.body).includes(ELIG)) return true;
    if (/git add[^\n]*security-master\/eligibility\.json/.test(s.body)) return true;
  }
  return false;
}
/** Verzeichnisse, die die Hygienepruefung am aufgeloesten Produktumfang misst. */
function scopedDirs() {
  const dirs = [];
  const re = /const (\w+) = join\(root, ((?:"[^"]+",?\s*)+)\);/g;
  const decls = [...HYGIENE.matchAll(re)];
  decls.forEach((d, i) => {
    const block = HYGIENE.slice(d.index, i + 1 < decls.length ? decls[i + 1].index : HYGIENE.length);
    if (!/resolveScope\(/.test(block)) return;
    const parts = [...d[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    dirs.push(parts.join("/") + "/");
  });
  return dirs;
}

const FOLLOW = steps(OWNER_SRC).find((s) => /^Umfangsfolgen - Reihen/.test(s.name));
const DISPATCH = steps(OWNER_SRC).find((s) => /^Umfangsfolgen - Materialisierung/.test(s.name));

test("UF-1 · nur security-master-eligibility.yml schreibt das Produktuniversum", () => {
  const writers = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => writesEligibility(readFileSync(join(WF_DIR, f), "utf8")));
  assert.deepEqual(writers, [OWNER], "ein zweiter Schreiber von eligibility.json braucht dieselbe Folgekette");
});

test("UF-2 · jedes am Produktumfang gepruefte Verzeichnis zieht nach einer Universumsaenderung nach", () => {
  const dirs = scopedDirs();
  assert.ok(dirs.length >= 4, `Hygiene-Parser findet zu wenig umfangsgepruefte Verzeichnisse: ${dirs.join(", ")}`);
  assert.ok(dirs.includes("quant/data/product/technical-signals-v1/"), dirs.join(", "));
  assert.ok(FOLLOW, `${OWNER}: Schritt "Umfangsfolgen - Reihen …" fehlt`);
  const owned = ownedPaths(FOLLOW.body);
  const ohneFolge = dirs.filter((d) => {
    if (owned.some((p) => d.startsWith(p) || p.startsWith(d))) return false;
    if (d === "quant/data/product/technical-signals-v1/") {
      return !(DISPATCH && /gh workflow run product-intelligence-materialization\.yml/.test(DISPATCH.body));
    }
    return true;
  });
  assert.deepEqual(ohneFolge, [], "umfangsgepruefte Datenart ohne Folge im Eignungslauf: Erzeuger in den Umfangsfolgen-Schritt aufnehmen");
});

test("UF-3 · der Folge-Schritt laeuft nach jeder uebernommenen Eignung, nutzt die Erzeuger und prueft am Ende", () => {
  assert.ok(FOLLOW);
  assert.match(FOLLOW.body, /if: steps\.commit\.outputs\.changed == 'true'/);
  const erzeuger = [
    "scripts/universe/build-company-master.mjs",
    "scripts/universe/build-universe-indexes.mjs",
    "scripts/market/build-capability-matrix.mjs",
    "scripts/vu2/build-product-capabilities.mjs",
    "scripts/market/publish-discover-series.mjs --prune-only",
    "scripts/market/publish-long-series.mjs --prune-only",
    "scripts/market/ingest-intraday.mjs --index-only",
    "scripts/discover/build-discover-data.mjs",
    "scripts/discover/verify-discover-data.mjs",
  ];
  for (const e of erzeuger) assert.ok(FOLLOW.body.includes("node " + e), `Folge-Schritt ruft ${e} nicht`);
  assert.ok(FOLLOW.body.indexOf("assert-public-data-hygiene.mjs") > FOLLOW.body.indexOf("build-discover-data.mjs"),
    "Hygienepruefung muss nach den Erzeugern laufen");
  assert.match(FOLLOW.body, /scripts\/ci\/push-with-retry\.sh/);
  assert.ok(DISPATCH && /steps\.folgen\.outcome == 'success'/.test(DISPATCH.body), "Materialisierung nur nach erfolgreicher Folge");
  /* Verbraucher ausserhalb der Hygienepruefung: Vorsorge las Reihen ausgeschiedener ETFs aus den Discover-Reihen (05.11.2026) */
  const vorsorge = steps(OWNER_SRC).find((s) => /^Umfangsfolgen - Vorsorge/.test(s.name));
  assert.ok(vorsorge && /gh workflow run vorsorge-etf-universe\.yml[^\n]*nur_zusatz=true/.test(vorsorge.body), "Vorsorge-Ingest fehlt in der Folgekette");
  assert.match(vorsorge.body, /steps\.folgen\.outcome == 'success'/);
});

test("UF-4 · der Parser erkennt Schreiber, nicht Leser", () => {
  const leser = "    steps:\n      - name: lesen\n        run: |\n          python3 -c 'open(\"quant/data/market/security-master/eligibility.json\")'\n";
  const schreiber = "    steps:\n      - name: schreiben\n        env:\n          PUSH_OWNED_PATHS: quant/data/market/security-master/eligibility.json\n        run: git add $PUSH_OWNED_PATHS\n";
  const add = "    steps:\n      - name: add\n        run: git add quant/data/market/security-master/eligibility.json\n";
  assert.equal(writesEligibility(leser), false);
  assert.equal(writesEligibility(schreiber), true);
  assert.equal(writesEligibility(add), true);
});
