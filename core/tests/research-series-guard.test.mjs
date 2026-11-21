// Loeschschutz fuer Forschungsreihen (Teil B1, Steuerung 21.11.2026): die Umfangsfolge loescht keine Kursreihe, auf die
// Forschung verweist (scripts/market/lib/research-series.mjs, Quellen core/registry/research-series-sources.json).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { researchSeriesIds, assertNoResearchSeries, loadSources } from "../../scripts/market/lib/research-series.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("RS-1 · die Quellen existieren und nennen die Faelle vom 17.11. (V10, Elliott M11-P6, Backtests)", () => {
  const ids = researchSeriesIds(ROOT);
  for (const id of ["ref_ALOT", "ref_HVII", "ref_AFBI", "ref_ANSC", "ref_GBTG", "ref_AACT"]) assert.ok(ids.has(id), id + " fehlt im Schutz");
  assert.ok(ids.size > 4000, "Rahmen der V10-Population fehlt? " + ids.size);
  const doc = loadSources(ROOT);
  assert.deepEqual(doc.guards, ["quant/data/market/discover-series-long/", "quant/data/market/discover-series/"]);
});

test("RS-2 · Abbruch vor dem Loeschen bei einer Forschungsreihe; gesichert oder fremd darf gehen", () => {
  const r = mkdtempSync(join(tmpdir(), "vu-rs-"));
  const put = (p, c) => { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), c); };
  put("core/registry/research-series-sources.json", JSON.stringify({ sources: [{ path: "a/frame.json" }, { glob: "t/*.test.mjs", mentions: "discover-series-long" }], securedIds: ["ref_SEC"] }));
  put("a/frame.json", '{"listings":[{"securityId":"ref_FROZEN"},{"securityId":"ref_SEC"}]}');
  put("t/x.test.mjs", 'const LONG="quant/data/market/discover-series-long"; const ID="ref_TESTED";');
  put("t/y.test.mjs", 'const ID="ref_NOTLONG";');
  assert.throws(() => assertNoResearchSeries(r, ["ref_FROZEN.json", "ref_OTHER.json"], "long"), (e) => e.code === "RESEARCH_SERIES_PROTECTED" && e.hits.length === 1);
  assert.throws(() => assertNoResearchSeries(r, ["ref_TESTED.json"], "long"), /RESEARCH_SERIES_PROTECTED/);
  assert.doesNotThrow(() => assertNoResearchSeries(r, ["ref_SEC.json", "ref_OTHER.json", "ref_NOTLONG.json"], "long"));
  assert.doesNotThrow(() => assertNoResearchSeries(r, [], "long"));
  put("core/registry/research-series-sources.json", JSON.stringify({ sources: [{ path: "a/fehlt.json" }] }));
  assert.throws(() => assertNoResearchSeries(r, ["ref_X.json"], "long"), /RESEARCH_SERIES_SOURCE_MISSING/, "fehlende Quelle: fail closed");
  rmSync(r, { recursive: true, force: true });
});

test("RS-3 · jede Loeschstelle fuer Reihen ausserhalb des Umfangs ruft den Schutz vor rmSync auf", () => {
  for (const f of ["scripts/market/publish-discover-series.mjs", "scripts/market/publish-long-series.mjs"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    const loesch = [...src.matchAll(/rmSync\(join\((outDir|OUT_DIR), name\)\)/g)].map((m) => m.index);
    const schutz = [...src.matchAll(/assertNoResearchSeries\(/g)].map((m) => m.index);
    assert.ok(loesch.length >= 2, f);
    for (const i of loesch) assert.ok(schutz.some((j) => j < i && i - j < 900), f + ": rmSync ohne vorherigen Loeschschutz (Position " + i + ")");
  }
});

test("RS-4 · die Bereinigung vom 17.11. waere am Schutz gestoppt", () => {
  const c = JSON.parse(readFileSync(join(ROOT, "docs/data/security-master/eligibility-cleanup-2026-11-17.json"), "utf8"));
  assert.throws(() => assertNoResearchSeries(ROOT, c.leave.map((x) => x.securityId + ".json"), "quant/data/market/discover-series-long/"), /RESEARCH_SERIES_PROTECTED/);
});
