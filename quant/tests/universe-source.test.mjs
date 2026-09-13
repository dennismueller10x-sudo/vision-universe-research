/* Die Universumsquelle: Company Master, wenn er da ist - sonst der
   bestehende Stand, mit benanntem Uebergabepunkt. Nie eine eigene Liste. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { resolveProductUniverse, resolveUniverse, HANDOVER, SECURITY_MASTER_FILE } from "../../scripts/market/universe-source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function withFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "vu-universe-"));
  try {
    mkdirSync(join(dir, "quant", "data", "market", "scale"), { recursive: true });
    mkdirSync(join(dir, "quant", "data", "market", "security-master"), { recursive: true });
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const entscheidung = (t, klasse, art) => ({ ticker: t, securityId: "ref_" + t, exchange: "NYSE",
  instrument_type: art || "EQUITY_COMMON", product_eligibility: klasse });

test("US1 · Liegt der Company Master vor, ist er die Quelle: alles ausser EXCLUDED", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, SECURITY_MASTER_FILE), JSON.stringify({
      version: "us-security-master-1.1.0",
      counts: { productUniverse: 3, ELIGIBLE: 1, SEPARATE_CLASS: 1, REVIEW: 1, EXCLUDED: 1 },
      decisions: [entscheidung("AAA", "ELIGIBLE"), entscheidung("BBB-P", "SEPARATE_CLASS", "PREFERRED"),
                  entscheidung("CCC", "REVIEW"), entscheidung("DDDW", "EXCLUDED", "WARRANT")]
    }));
    const r = resolveProductUniverse(dir);
    assert.equal(r.source, "SECURITY_MASTER");
    assert.deepEqual(r.securities.map((s) => s.ticker), ["AAA", "BBB-P", "CCC"]);
    assert.equal(r.counts.productUniverse, 3);
    assert.equal(r.counts.EXCLUDED, 1);
    assert.equal(r.handover.status, "INTEGRATED");
    assert.ok(r.sha256.length === 64);
  });
});

test("US2 · Eine Projektion, die von der Zaehlung der Quelle abweicht, entsteht nicht", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, SECURITY_MASTER_FILE), JSON.stringify({
      counts: { productUniverse: 5 }, decisions: [entscheidung("AAA", "ELIGIBLE")]
    }));
    assert.throws(() => resolveProductUniverse(dir), /productUniverse 1 statt 5/);
    writeFileSync(join(dir, SECURITY_MASTER_FILE), JSON.stringify({
      decisions: [entscheidung("AAA", "MAYBE")]
    }));
    assert.throws(() => resolveProductUniverse(dir), /unbekannte Eignungsklasse/);
  });
});

test("US3 · Ohne Company Master gibt es kein Produktuniversum - und keinen stillen Rueckfall", () => {
  withFixture((dir) => {
    writeFileSync(join(dir, "quant", "data", "market", "scale", "universe-FULL_UNIVERSE.json"), JSON.stringify({
      securities: [{ ticker: "ZZZ", securityId: "ref_ZZZ" }]
    }));
    assert.throws(() => resolveProductUniverse(dir), /Company Master fehlt/);
    /* Ein Gate-Universum bleibt ueber seinen Namen erreichbar - fuer die
       Skalierungs-Workflows, nicht als Produktuniversum. */
    assert.equal(resolveUniverse(dir, "FULL_UNIVERSE").securities.length, 1);
  });
});

test("US4 · Ohne beides ist es ein Fehler, keine leere Liste", () => {
  withFixture((dir) => { assert.throws(() => resolveProductUniverse(dir), /Company Master fehlt/); });
});

test("US5 · Das Repository loest heute auf eine echte Quelle auf - keine Zahl im Test", () => {
  const r = resolveProductUniverse(root);
  assert.equal(r.source, "SECURITY_MASTER", "seit der Uebernahme ist der Company Master die Quelle");
  assert.equal(r.handover.status, "INTEGRATED");
  assert.equal(r.counts.productUniverse, 7004);
  assert.ok(r.securities.length > 1000, "Produktuniversum ist keine Vorfuehrliste");
  assert.ok(r.securities.every((s) => s.securityId && s.ticker));
  assert.equal(new Set(r.securities.map((s) => s.ticker)).size, r.securities.length, "kein Ticker doppelt");
  /* Der Uebergabepunkt ist entweder eingeloest oder exakt benannt. */
  if (r.handover.status === "PENDING") assert.match(r.handover.message, /wartet auf claude\//);
  const g = resolveUniverse(root, "GATE_100");
  assert.equal(g.securities.length, 100);
});
