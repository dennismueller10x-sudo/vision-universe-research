/* Technical · Ticker-Wiederverwendung (quant/config/ticker-reuse-quarantine.json, IDENTITY_QUARANTINED).
   Screener und Technical Intelligence zeigen diese Titel nicht unter der falschen Identitaet.
   Fixture-Test im Temp-Verzeichnis (nie in committete Daten) plus statische Pruefung der Erzeuger. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIdentityQuarantine, QUARANTINE_REASON } from "../../scripts/technical/lib/identity-quarantine.mjs";
import { build } from "../../scripts/technical/world/build-screener.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTER = "quant/config/ticker-reuse-quarantine.json";
const register = JSON.parse(readFileSync(join(ROOT, REGISTER), "utf8"));

/** Temp-Wurzel: ein Shard mit INVN (im Register) und zwei Kontrolltiteln aus der veroeffentlichten Materialisierung. */
function fixtureRoot({ withRegister, records }) {
  const dir = mkdtempSync(join(tmpdir(), "vu-tech-quarantine-"));
  const shard = JSON.parse(gunzipSync(readFileSync(join(ROOT, "quant/data/product/technical-signals-v1/IN.json.gz"))).toString("utf8"));
  const keep = ["INVN"].concat(Object.keys(shard.instruments).filter((t) => t !== "INVN").sort().slice(0, 2));
  shard.instruments = Object.fromEntries(keep.map((t) => [t, shard.instruments[t]]));
  mkdirSync(join(dir, "quant/data/product/technical-signals-v1"), { recursive: true });
  writeFileSync(join(dir, "quant/data/product/technical-signals-v1/IN.json.gz"), gzipSync(JSON.stringify(shard)));
  if (withRegister) {
    mkdirSync(join(dir, "quant/config"), { recursive: true });
    writeFileSync(join(dir, REGISTER), JSON.stringify(Object.assign({}, register, { records: records || register.records.filter((r) => r.ticker === "INVN") })));
  }
  return { dir, keep };
}

test("Register · Laden ueber universe-source.mjs, fehlende Datei = nichts ausgelassen, fehlerhafte Datei bricht ab", () => {
  const real = loadIdentityQuarantine(ROOT);
  assert.equal(real.file, REGISTER);
  assert.equal(real.ids.size, register.records.length);
  for (const r of register.records) assert.ok(real.has(r.securityId), r.securityId);
  assert.ok(!real.has("ref_NVDA"));
  const empty = mkdtempSync(join(tmpdir(), "vu-tech-quarantine-"));
  try {
    const none = loadIdentityQuarantine(empty);
    assert.equal(none.ids.size, 0);
    assert.equal(none.file, null);
    mkdirSync(join(empty, "quant/config"), { recursive: true });
    writeFileSync(join(empty, REGISTER), JSON.stringify(Object.assign({}, register, { records: [Object.assign({}, register.records[0], { securityId: "ref_FALSCH" })] })));
    assert.throws(() => loadIdentityQuarantine(empty), /core\/identity\.js/);
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("Screener · markierte securityId fehlt mit Grund, alle anderen Zeilen unveraendert", () => {
  const a = fixtureRoot({ withRegister: false }), b = fixtureRoot({ withRegister: true });
  try {
    const before = build({ root: a.dir }), after = build({ root: b.dir });
    const sB = before.artifact.cols.s, sA = after.artifact.cols.s;
    assert.ok(sB.includes("INVN"), "ohne Register: INVN im Screener");
    assert.ok(!sA.includes("INVN"), "mit Register: INVN ausgelassen");
    assert.deepEqual(sA, sB.filter((t) => t !== "INVN"));
    assert.equal(after.meta.skipped[QUARANTINE_REASON], 1);
    assert.equal(before.meta.skipped[QUARANTINE_REASON], undefined);
    assert.equal(after.meta.sources.identityQuarantine, REGISTER);
    assert.equal(after.meta.counts.rows, before.meta.counts.rows - 1);
    assert.deepEqual(after.spark.s, sA);
    /* Kontrolltitel: jede Spalte gleich; einzige Querschnittsgroesse ist der RS-Rang (Rang unter den verbleibenden Titeln). */
    for (const col of Object.keys(before.artifact.cols)) {
      if (col === "rsRank") continue;
      const was = sA.map((t) => before.artifact.cols[col][sB.indexOf(t)]);
      assert.deepEqual(after.artifact.cols[col], was, col);
    }
    sA.forEach((t, i) => assert.deepEqual(after.spark.spark[i], before.spark.spark[sB.indexOf(t)], t));
  } finally { rmSync(a.dir, { recursive: true, force: true }); rmSync(b.dir, { recursive: true, force: true }); }
});

test("Screener · nicht markierte Titel bleiben, auch wenn das Register andere Ticker fuehrt", () => {
  const a = fixtureRoot({ withRegister: true, records: register.records.filter((r) => r.ticker !== "INVN") });
  try {
    const r = build({ root: a.dir });
    assert.ok(r.artifact.cols.s.includes("INVN"));
    assert.equal(r.meta.skipped[QUARANTINE_REASON], undefined);
  } finally { rmSync(a.dir, { recursive: true, force: true }); }
});

test("Statisch · beide Technical-Erzeuger lesen das Register und lassen markierte Titel aus", () => {
  const screener = readFileSync(join(ROOT, "scripts/technical/world/build-screener.mjs"), "utf8");
  assert.match(screener, /import \{ loadIdentityQuarantine, QUARANTINE_REASON \} from "\.\.\/lib\/identity-quarantine\.mjs"/);
  assert.match(screener, /loadIdentityQuarantine\(base\)/);
  assert.match(screener, /quarantine\.has\(Identity\.securityIdForTicker\(ticker\)\)\) \{ skipped\[QUARANTINE_REASON\]/);
  const ti = readFileSync(join(ROOT, "scripts/technical/build-technical-intelligence.mjs"), "utf8");
  assert.match(ti, /import \{ loadIdentityQuarantine \} from "\.\/lib\/identity-quarantine\.mjs"/);
  assert.match(ti, /loadIdentityQuarantine\(ROOT\)/);
  assert.match(ti, /wfiles = wfiles\.filter\(\(f\) => !quarantined\(f\)\); dailyFiles = dailyFiles\.filter\(\(f\) => !quarantined\(f\)\)/);
  assert.match(ti, /identityQuarantined \}/, "Zaehler in meta.counts");
  const lib = readFileSync(join(ROOT, "scripts/technical/lib/identity-quarantine.mjs"), "utf8");
  assert.match(lib, /from "\.\.\/\.\.\/market\/universe-source\.mjs"/, "eine Registerlogik (universe-source.mjs)");
  assert.doesNotMatch(lib, /"ref_"\s*\+/, "keine eigene securityId-Bildung (ADR-001)");
});
