/* Vertragstest TI: Tests lesen keine veraenderlichen Produktionsartefakte mit festen Erwartungen.
   Hintergrund: Audit 10.11.2026 (OR14, model-depots, OV6/9/11, PF-8, vu2-chart, n-home).
   Ein neuer Test, der quant|discover|supertrader|social|technical|core/data liest, braucht entweder eine
   eingefrorene Fixture unter <produkt>/tests/fixtures/ oder einen Eintrag mit konkretem Grund in
   core/registry/test-input-allowlist.json. Die Liste darf nur kleiner werden. Siehe docs/quality/TESTARTEN.md. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, scanAll, scanFile, loadRegistry, renderDoc } from "../../scripts/quality/test-inputs.mjs";

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

test("TI-4 · docs/quality/TESTARTEN.md ist aus der Registry erzeugt und aktuell", () => {
  const doc = readFileSync(join(ROOT, "docs/quality/TESTARTEN.md"), "utf8");
  assert.equal(doc, renderDoc(rows, reg), "node scripts/quality/test-inputs.mjs --doc docs/quality/TESTARTEN.md");
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
  assert.equal(scanFile(root, fix), null);
});

test("TI-6 · Fixtures tragen ihren Quell-Commit (README neben den Daten)", () => {
  for (const d of ["discover/tests/fixtures/market-detail", "core/tests/fixtures/chart-standard"]) {
    assert.match(readFileSync(join(ROOT, d, "README.md"), "utf8"), /@ [0-9a-f]{7,}/, d);
  }
});
