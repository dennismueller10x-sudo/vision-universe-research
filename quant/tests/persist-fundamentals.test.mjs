/* =========================================================================
   DAUERHAFTE FUNDAMENTALABLAGE — Bauart-Kontrolle gegen ein Verzeichnis

   Dieselbe Ablage laeuft hier gegen den fs-Treiber, in CI gegen R2. Was
   hier bewiesen wird, gilt fuer beide: die Ablage nimmt nichts ueber
   den Dienst an.

   Vier Zusagen, jede geprueft:
     1. Ein Objekt je Factbook, byte-gleich, mit sha256 im Index.
     2. Ein zweiter Lauf ohne Aenderung schreibt NICHTS.
     3. Zurueckladen liefert dieselben Bytes und alle Vertragsfelder.
     4. Der Zeuge wirft bei jedem Schluessel ausserhalb des Praefixes -
        der Kursstore ist nicht "geschont", er ist unerreichbar.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mod = await import(join(root, "scripts", "quant", "sec", "persist-fundamentals.mjs"));
const { createFsDriver } = await import(join(root, "scripts", "market", "storage", "fs-driver.mjs"));

/* Ein Factbook in der echten Form des Speichers - nur kleiner. */
function factbook(cik, { currency = "USD", years = 3, quarterly = true, restated = false } = {}) {
  const timelines = [];
  for (let y = 2021; y < 2021 + years; y++) {
    const obs = (fp, end) => [{
      value: 1000 + y, unit: currency, filed: `${y + 1}-02-15`, available_from: `${y + 1}-02-15T10:00:00`,
      accession: `0000000000-${String(y).slice(2)}-000001`, period_end: end, period_start: `${y}-01-01`,
      quality: "HIGH", flags: [], provenance: { taxonomy: "us-gaap", concept: "Revenues", filed: `${y + 1}-02-15`,
                                                accession: `0000000000-${String(y).slice(2)}-000001` }
    }];
    timelines.push({ metric: "revenue", fiscal_year: y, fiscal_period: "FY", restated, observations: obs("FY", `${y}-12-31`) });
    if (quarterly) timelines.push({ metric: "revenue", fiscal_year: y, fiscal_period: "Q1", restated: false, observations: obs("Q1", `${y}-03-31`) });
  }
  return {
    cik, generated_at_utc: "2026-09-13T00:00:00+00:00",
    versions: { normalization_schema: "1.0.0", normalization_logic: "1.7.1", formula: "1.2.0",
                provider_adapter: "sec-edgar-1.0.0", quality_rules: "1.0.0",
                metric_registry: { schema_version: 1, mapping_version: "1.2.0" } },
    raw_companyfacts_sha256: "x".repeat(64),
    latest_filing: { accession: "0000000000-26-000001", form: "10-K", filing_date: "2026-02-15" },
    filing_years: {}, filing_index: [{ accession: "0000000000-26-000001", form: "10-K" }],
    profile: { name: `Test ${cik}`, sic: "7372", tickers: ["T" + cik.slice(-2)] },
    calendar: { fiscal_years: [] }, stats: {},
    quality: { summary: { total: 0, by_severity: {}, by_code: {} }, findings: [] },
    factbook: { cik, profile: null, calendar: null, timelines }
  };
}

function seed(dir, docs) {
  mkdirSync(dir, { recursive: true });
  for (const d of docs) writeFileSync(join(dir, d.cik + ".json.gz"), gzipSync(Buffer.from(JSON.stringify(d, null, 2) + "\n")));
}

test("ein Objekt je Factbook, byte-gleich, mit sha256 im Index", async () => {
  const facts = mkdtempSync(join(tmpdir(), "vu-facts-"));
  const bucket = mkdtempSync(join(tmpdir(), "vu-bucket-"));
  seed(facts, [factbook("0000000001"), factbook("0000000002", { currency: "EUR" })]);
  const driver = mod.witness(createFsDriver(bucket), mod.PREFIX + "/", []);
  const local = mod.localFacts(facts);
  const r = await mod.push(driver, { facts: local, dryRun: false, log: [] });
  assert.equal(r.changed, 2);
  assert.equal(r.unchanged, 0);
  assert.equal(r.objectCount, 2);
  const stored = readFileSync(join(bucket, mod.FACTS_PREFIX + "0000000002.json.gz"));
  assert.deepEqual(stored, local[1].buf, "byte-gleich, nicht nur inhaltsgleich");
  assert.equal(r.index.objects["0000000002"].sha256, local[1].sha256);
  assert.deepEqual(r.index.objects["0000000002"].currencies, ["EUR"], "die Waehrung steht im Index");
  assert.equal(r.index.objects["0000000001"].normalizationLogic, "1.7.1");
});

test("ein zweiter Lauf ohne Aenderung schreibt nichts", async () => {
  const facts = mkdtempSync(join(tmpdir(), "vu-facts-"));
  const bucket = mkdtempSync(join(tmpdir(), "vu-bucket-"));
  seed(facts, [factbook("0000000001"), factbook("0000000002")]);
  const driver = mod.witness(createFsDriver(bucket), mod.PREFIX + "/", []);
  await mod.push(driver, { facts: mod.localFacts(facts), dryRun: false, log: [] });
  const vorher = readdirSync(join(bucket, mod.FACTS_PREFIX)).length;
  const r = await mod.push(driver, { facts: mod.localFacts(facts), dryRun: false, log: [] });
  assert.equal(r.changed, 0);
  assert.equal(r.unchanged, 2);
  assert.equal(r.spent.classA, 0, "kein einziger Schreibvorgang");
  assert.equal(readdirSync(join(bucket, mod.FACTS_PREFIX)).length, vorher);
});

test("ein geaendertes Factbook wird neu geschrieben, die anderen nicht", async () => {
  const facts = mkdtempSync(join(tmpdir(), "vu-facts-"));
  const bucket = mkdtempSync(join(tmpdir(), "vu-bucket-"));
  seed(facts, [factbook("0000000001"), factbook("0000000002")]);
  const driver = mod.witness(createFsDriver(bucket), mod.PREFIX + "/", []);
  await mod.push(driver, { facts: mod.localFacts(facts), dryRun: false, log: [] });
  seed(facts, [factbook("0000000002", { years: 5 })]);
  const r = await mod.push(driver, { facts: mod.localFacts(facts), dryRun: false, log: [] });
  assert.equal(r.changed, 1);
  assert.equal(r.unchanged, 1);
});

test("zurueckladen liefert dieselben Bytes und alle Vertragsfelder", async () => {
  const facts = mkdtempSync(join(tmpdir(), "vu-facts-"));
  const bucket = mkdtempSync(join(tmpdir(), "vu-bucket-"));
  const out = mkdtempSync(join(tmpdir(), "vu-reload-"));
  seed(facts, [factbook("0000000001", { years: 12, restated: true }), factbook("0000000003", { currency: "CAD", quarterly: false })]);
  const driver = mod.witness(createFsDriver(bucket), mod.PREFIX + "/", []);
  const local = mod.localFacts(facts);
  await mod.push(driver, { facts: local, dryRun: false, log: [] });
  const byCik = Object.fromEntries(local.map((f) => [f.cik, f]));
  const r = await mod.reload(driver, { ciks: ["0000000001", "0000000003", "0000000009"], localByCik: byCik, outDir: out, log: [] });
  const [a, b, fehlt] = r.results;
  assert.equal(a.pass, true, JSON.stringify(a));
  assert.equal(a.sha256MatchesLocal, true);
  assert.equal(a.hasAnnual, true);
  assert.equal(a.hasQuarterly, true);
  assert.equal(a.hasRestatementMetadata, true);
  assert.equal(a.observationsMissingPitFields, 0, "jede Beobachtung traegt filed, accession, period_end");
  assert.equal(a.summary.annualTimelines, 12);
  assert.equal(b.pass, true);
  assert.deepEqual(b.summary.currencies, ["CAD"], "die Waehrung ueberlebt den Rueckweg");
  assert.equal(b.hasQuarterly, false);
  assert.equal(fehlt.found, false, "was nicht da ist, wird nicht als da gemeldet");
  assert.equal(fehlt.pass, undefined);
  const zurueck = JSON.parse(gunzipSync(readFileSync(join(out, "0000000001.json.gz"))).toString());
  assert.equal(zurueck.versions.normalization_logic, "1.7.1");
});

test("der Zeuge wirft bei jedem Schluessel ausserhalb des Praefixes", async () => {
  const bucket = mkdtempSync(join(tmpdir(), "vu-bucket-"));
  const log = [];
  const driver = mod.witness(createFsDriver(bucket), mod.PREFIX + "/", log);
  await assert.rejects(() => driver.put("v1/tiingo/daily/US/AAPL.json.zst", Buffer.from("x")),
                       /PERSIST_TOUCHED_FOREIGN_KEY/);
  await assert.rejects(() => driver.get("v1/tiingo/daily/US/_index.json.zst"), /PERSIST_TOUCHED_FOREIGN_KEY/);
  await assert.rejects(() => driver.list("v1/tiingo/"), /PERSIST_TOUCHED_FOREIGN_KEY/);
  await driver.put(mod.FACTS_PREFIX + "0000000001.json.gz", Buffer.from("ok"));
  assert.equal(log.filter((l) => l.op === "PUT").length, 1, "nur der erlaubte Zugriff kam durch");
});

test("die Zusammenfassung haelt nie ein Factbook", () => {
  const s = mod.summarize(factbook("0000000001", { years: 4, currency: "GBP" }));
  assert.equal(s.annualTimelines, 4);
  assert.equal(s.quarterlyTimelines, 4);
  assert.equal(s.observations, 8);
  assert.equal(s.firstPeriodEnd, "2021-03-31");
  assert.equal(s.lastPeriodEnd, "2024-12-31");
  assert.deepEqual(s.currencies, ["GBP"]);
  assert.equal(JSON.stringify(s).length < 600, true, "der Index bleibt klein");
});
