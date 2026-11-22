/* Vertragstest TI: Tests lesen keine veraenderlichen Produktionsartefakte mit festen Erwartungen.
   Hintergrund: Audit 10.11.2026 (OR14, model-depots, OV6/9/11, PF-8, vu2-chart, n-home).
   Ein neuer Test, der quant|discover|supertrader|social|technical|core/data liest, braucht entweder eine
   eingefrorene Fixture unter <produkt>/tests/fixtures/ oder einen Eintrag mit konkretem Grund in
   core/registry/test-input-allowlist.json. Die Liste darf nur kleiner werden. Siehe docs/quality/TESTARTEN.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, scanAll, scanFile, loadRegistry } from "../../scripts/quality/test-inputs.mjs";

const reg = loadRegistry();
const rows = scanAll();
const allowed = new Map(reg.eintraege.map((e) => [e.file, e]));

test("TI-1 · jeder Test, der Live-Artefakte liest, steht mit Grund in der Allowlist (sonst: Fixture)", () => {
  const neu = rows.filter((r) => r.reads && !allowed.has(r.file));
  assert.deepEqual(neu.map((r) => `${r.file}:${r.line}`), [],
    "Diese Tests lesen Produktionsdaten. Kopiere die benoetigte Eingabe als Fixture nach <produkt>/tests/fixtures/ "
    + "(README mit Quell-Commit) und lies sie von dort. Nur wenn der Test wirklich den Live-Stand pruefen muss "
    + "(Schema/Vertrag), trage ihn in core/registry/test-input-allowlist.json mit konkretem Grund ein.");
});

test("TI-2 · Eintraege sind vollstaendig: Datei existiert, Kategorie bekannt, Grund konkret", () => {
  const seen = new Set();
  for (const e of reg.eintraege) {
    assert.ok(!seen.has(e.file), "doppelt: " + e.file); seen.add(e.file);
    assert.ok(existsSync(join(ROOT, e.file)), "Datei fehlt, Eintrag entfernen: " + e.file);
    assert.ok(Object.hasOwn(reg.kategorien, e.kategorie), e.file + ": unbekannte Kategorie " + e.kategorie);
    assert.ok(typeof e.grund === "string" && e.grund.length >= 30, e.file + ": Grund fehlt oder ist zu kurz");
  }
});

test("TI-3 · Rueckbau wird eingefordert: ein Eintrag ohne Live-Zugriff (und nicht 'dynamisch') wird entfernt", () => {
  const liest = new Set(rows.filter((r) => r.reads).map((r) => r.file));
  const stale = reg.eintraege.filter((e) => !e.dynamisch && !liest.has(e.file)).map((e) => e.file);
  assert.deepEqual(stale, [], "Diese Tests lesen keine Live-Daten mehr (Fixture-Umstellung gelungen): Eintrag loeschen und docs/quality/TESTARTEN.md neu erzeugen.");
});

test("TI-4 · die Inventur nennt Registry und Regel (Tabelle wird mit scripts/quality/test-inputs.mjs --doc erzeugt)", () => {
  /* Bewusst kein Byte-Vergleich: parallele PRs entfernen Eintraege; die Tabelle wird gesammelt neu erzeugt. */
  const doc = readFileSync(join(ROOT, "docs/quality/TESTARTEN.md"), "utf8");
  assert.ok(doc.includes("core/registry/test-input-allowlist.json"));
});

test("TI-5 · der Scan erkennt Live-Zugriffe und ignoriert URL-Literale und Kommentare", () => {
  const root = mkdtempSync(join(tmpdir(), "ti-"));
  mkdirSync(join(root, "core/tests"), { recursive: true });
  const put = (n, s) => { writeFileSync(join(root, "core/tests", n), s); return "core/tests/" + n; };
  const live = put("a.test.mjs", 'import {readFileSync} from "node:fs";\nconst j = JSON.parse(readFileSync(join(ROOT, "quant/data/x.json")));\n');
  const live2 = put("b.test.mjs", 'import {readFileSync} from "node:fs";\nconst j = readFileSync(join(ROOT, "quant", "data", "x.json"));\n');
  const url = put("c.test.mjs", 'import {readFileSync} from "node:fs";\nconst p = "/quant/data/x.json"; readFileSync(tmp);\n');
  const kom = put("d.test.mjs", '// liest quant/data/x.json nicht\nimport {readFileSync} from "node:fs";\n');
  const fix = put("e.test.mjs", 'import {readFileSync} from "node:fs";\nreadFileSync(new URL("./fixtures/x/EURUSD.json", import.meta.url));\n');
  assert.equal(scanFile(root, live)?.reads, true);
  assert.equal(scanFile(root, live2)?.reads, true);
  assert.equal(scanFile(root, url), null);
  assert.equal(scanFile(root, kom), null);
  const rel = put("f.test.mjs", 'import {readFileSync} from "node:fs";\nconst d = new URL("./quant/data/", base); readFileSync(new URL("x.json", d));\n');
  assert.equal(scanFile(root, rel), null, "relativer Pfad unter einer Fixture-Wurzel");

  assert.equal(scanFile(root, fix), null);
});

test("TI-6 · Fixtures tragen ihren Quell-Commit (README neben den Daten)", () => {
  for (const d of ["discover/tests/fixtures/market-detail", "core/tests/fixtures/chart-standard"]) {
    assert.match(readFileSync(join(ROOT, d, "README.md"), "utf8"), /@ [0-9a-f]{7,}/, d);
  }
});

test("TI-7 · kein neuer fester Live-Wert: Kuerzel/Datum in Erwartungen eines Live-Lesers duerfen nicht mehr werden", () => {
  /* Anlass 22.11.2026: main war mehrfach rot, weil Tests, die Produktionsdaten lesen, ein festes Kuerzel (IBN, APGE, ANT, AACT, MEMY)
     oder einen Zaehler (6308) erwarteten und ein Datenlauf den Titel oder die Zahl aenderte. Jeder Eintrag der Allowlist traegt seine Basis
     (`harteWerte`, erzeugt mit `node scripts/quality/test-inputs.mjs --baseline`). Sie darf nur sinken. Wer ein neues Kuerzel braucht,
     friert die Eingabe ein (Muster scripts/quant/lib/data-fixture.mjs, #2122) oder wartet nach der Halbstand-Regel
     (scripts/quant/lib/follow-artifact.mjs). Ausdrueckliche Live-Pruefungen im Monitor tragen in den ersten 40 Zeilen `LIVE-PRUEFUNG: Monitor`. */
  const zuviel = [];
  for (const r of rows) {
    if (!r.reads || r.liveCheck) continue;
    const e = allowed.get(r.file);
    if (!e) continue; // TI-1 meldet den fehlenden Eintrag
    if (!Number.isInteger(e.harteWerte)) zuviel.push(`${r.file}: harteWerte fehlt (node scripts/quality/test-inputs.mjs --baseline)`);
    else if (r.harte > e.harteWerte) zuviel.push(`${r.file}: ${r.harte} feste Werte, Basis ${e.harteWerte}`);
  }
  assert.deepEqual(zuviel, [], "Feste Kuerzel/Daten in Erwartungen eines Tests, der Live-Daten liest. Fixture statt Live-Stand oder Halbstand-Regel (siehe oben).");
});

test("TI-8 · der Zaehler erkennt feste Kuerzel in Erwartungen und nimmt Woerter und Monitor-Pruefungen aus", () => {
  const root = mkdtempSync(join(tmpdir(), "ti8-"));
  mkdirSync(join(root, "core/tests"), { recursive: true });
  const put = (n, s) => { writeFileSync(join(root, "core/tests", n), s); return "core/tests/" + n; };
  const kopf = 'import {readFileSync} from "node:fs";\nconst j = JSON.parse(readFileSync(join(ROOT, "quant/data/x.json")));\n';
  const a = scanFile(root, put("a.test.mjs", kopf + 'assert.equal(j.rows.find((r) => r.ticker === "NVDA").x, 1);\nassert.equal(j.status, "PASS");\n'));
  assert.equal(a.harte, 1, "NVDA zaehlt, PASS nicht");
  const b = scanFile(root, put("b.test.mjs", kopf + 'assert.deepEqual(j.top, ["IBN", "APGE"]);\nassert.equal(j.asOf, "2026-11-20");\n'));
  assert.equal(b.harte, 3);
  const c = scanFile(root, put("c.test.mjs", "// LIVE-PRUEFUNG: Monitor\n" + kopf + 'assert.ok(j.rows.some((r) => r.ticker === "NVDA"));\n'));
  assert.equal(c.liveCheck, true);
  const d = scanFile(root, put("d.test.mjs", kopf + 'const t = "NVDA"; // Hilfsvariable ausserhalb einer Erwartung\n'));
  assert.equal(d.harte, 0);
});

test("TI-9 · ein Test mit frozen-data.mjs und Buendel gilt nicht als Live-Leser; ohne Buendel bleibt er einer", () => {
  const root = mkdtempSync(join(tmpdir(), "ti9-"));
  mkdirSync(join(root, "core/tests/fixtures/frozen"), { recursive: true });
  const kopf = 'import "../../scripts/quant/lib/frozen-data.mjs";\nimport {readFileSync} from "node:fs";\nreadFileSync(join(ROOT, "quant/data/x.json"));\n';
  writeFileSync(join(root, "core/tests/a.test.mjs"), kopf);
  assert.equal(scanFile(root, "core/tests/a.test.mjs")?.reads, true, "ohne Buendel");
  writeFileSync(join(root, "core/tests/fixtures/frozen/a.json.gz"), "x");
  assert.equal(scanFile(root, "core/tests/a.test.mjs"), null, "mit Buendel");
});

test("TI-10 · Fixture-Buendel haben eine Obergrenze (Repo-Groesse): alle eingefrorenen Datenstaende zusammen hoechstens 21 MiB", () => {
  /* Steuerung 22.11.2026: Repo wird verschlankt; eingefrorene Stände (fixtures/frozen/*.json.gz und die benannten data.json.gz) zusammen
     ~20 MB. Wer ein Buendel braucht, das nicht mehr hineinpasst, teilt ein Buendel zwischen Tests (gleiche Dateien nur einmal) oder
     verzichtet. Je Buendel hoechstens 2 MiB (freeze-frozen-data.mjs), ausser den drei benannten Altbestaenden. */
  
  const gross = new Set(["quant/tests/fixtures/product-services/data.json.gz", "quant/tests/fixtures/canonical-product-search/data.json.gz"]);
  const dateien = [];
  const gehe = (dir) => {
    for (const n of readdirSync(join(ROOT, dir))) {
      if (n === "node_modules" || n === ".git" || n === "data") continue;
      const rel = dir ? dir + "/" + n : n;
      const st = statSync(join(ROOT, rel));
      if (st.isDirectory()) { if (/(^|\/)tests$|^(core|quant|discover|technical|screener|scripts|products)(\/.*)?$/.test(rel)) gehe(rel); continue; }
      if (/\/fixtures\/frozen\/[^/]+\.json\.gz$/.test(rel) || /\/fixtures\/[^/]+\/data\.json\.gz$/.test(rel)) dateien.push({ rel, bytes: st.size });
    }
  };
  for (const d of ["core/tests", "quant/tests", "discover/tests", "technical/tests", "screener/tests", "scripts/supertrader/tests", "products"]) gehe(d);
  const summe = dateien.reduce((s, f) => s + f.bytes, 0);
  const zuGross = dateien.filter((f) => f.bytes > 2 * 1048576 && !gross.has(f.rel)).map((f) => f.rel);
  assert.deepEqual(zuGross, [], "Buendel ueber 2 MiB");
  assert.ok(summe <= 21 * 1048576, `Fixture-Buendel zusammen ${(summe / 1048576).toFixed(1)} MiB (${dateien.length} Dateien), Grenze 21 MiB`);
});
