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

test("RS-5 · B2a: sichern, zuruecklesen, Manifest; geloescht wird nur Gesichertes mit gleichem Hash, nie mit Trockenlauf", async () => {
  const { backupFiles, manifest, plannedDeletions, PREFIX } = await import("../../scripts/market/backup-series.mjs");
  const r = mkdtempSync(join(tmpdir(), "vu-bk-"));
  const put = (p, c) => { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), c); };
  put("core/registry/research-series-sources.json", JSON.stringify({ sources: [] }));
  put("quant/data/market/discover-series-long/ref_IN.json", "{}"); put("quant/data/market/discover-series-long/ref_OUT.json", '{"a":1}');
  put("quant/data/market/discover-series-long/index.json", "{}"); put("quant/data/market/discover-series/ref_OUT.json", '{"b":2}');
  const plan = plannedDeletions(r, new Set(["ref_IN"]));
  assert.deepEqual(plan, ["quant/data/market/discover-series/ref_OUT.json", "quant/data/market/discover-series-long/ref_OUT.json"]);
  const store = new Map(), driver = { put: async (k, b) => { store.set(k, Buffer.from(b)); }, get: async (k) => store.get(k) || null };
  const entries = await backupFiles(driver, r, plan);
  assert.ok(store.has(PREFIX + "quant/data/market/discover-series-long/ref_OUT.json"));
  const mf = join(r, "m.json"); writeFileSync(mf, JSON.stringify(manifest(entries)));
  assert.doesNotThrow(() => assertNoResearchSeries(r, ["ref_OUT.json"], join(r, "quant/data/market/discover-series-long"), { manifestFile: mf }));
  assert.throws(() => assertNoResearchSeries(r, ["ref_IN.json"], join(r, "quant/data/market/discover-series-long"), { manifestFile: mf }), /SERIES_NOT_BACKED_UP/);
  put("quant/data/market/discover-series-long/ref_OUT.json", '{"a":2}');
  assert.throws(() => assertNoResearchSeries(r, ["ref_OUT.json"], join(r, "quant/data/market/discover-series-long"), { manifestFile: mf }), /Hash weicht ab/);
  writeFileSync(mf, JSON.stringify({ ...manifest(entries), dryRun: true }));
  assert.throws(() => assertNoResearchSeries(r, ["ref_OUT.json"], "quant/data/market/discover-series-long", { manifestFile: mf }), /Trockenlauf/);
  const bad = { put: async () => {}, get: async () => Buffer.from("anders") };
  await assert.rejects(backupFiles(bad, r, plan), /READBACK_MISMATCH/, "Lesetest");
  rmSync(r, { recursive: true, force: true });
});

test("RS-6 · B2b: fehlt die Reihe im Repo, kommen dieselben Bytes aus der privaten Kopie (Hash pruefen, Ueberlagerung)", async () => {
  const { restore, backupIndex, BACKUP_DIR } = await import("../../scripts/market/restore-research-series.mjs");
  const { PREFIX, sha256 } = await import("../../scripts/market/backup-series.mjs");
  const { createRequire } = await import("node:module");
  const { resolveSeriesFile, readSeries } = createRequire(import.meta.url)("../../quant/engines/research-series-path.cjs");
  const r = mkdtempSync(join(tmpdir(), "vu-rr-")), out = join(r, "priv");
  const put = (p, c) => { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), c); };
  const L = "quant/data/market/discover-series-long/";
  put(L + "ref_STAY.json", '{"s":1}');
  const gone = '{"g":1}', store = new Map([[PREFIX + L + "ref_GONE.json", Buffer.from(gone)]]);
  const mf = { schema: "vu-series-backup-manifest-1", files: [{ path: L + "ref_GONE.json", key: PREFIX + L + "ref_GONE.json", sha256: sha256(Buffer.from(gone)) }] };
  put(BACKUP_DIR + "/2026-11-22-1.json", JSON.stringify(mf));
  put(BACKUP_DIR + "/2026-11-22-0.json", JSON.stringify({ ...mf, dryRun: true, files: [{ path: L + "ref_DRY.json", key: "x", sha256: "y" }] }));
  assert.deepEqual([...backupIndex(r).keys()], [L + "ref_GONE.json"], "Trockenlauf zaehlt nie");
  const res = await restore({ get: async (k) => store.get(k) || null }, r, out, { overlay: true });
  assert.equal(res.restored, 1);
  assert.equal(readSeries(r, L + "ref_GONE.json", { VU_RESEARCH_SERIES_DIR: out }), gone, "Bytes gleich, also Hash gleich");
  assert.equal(resolveSeriesFile(r, L + "ref_STAY.json", { VU_RESEARCH_SERIES_DIR: out }), join(r, L + "ref_STAY.json"), "Repo vor Kopie");
  assert.equal(readFileSync(join(out, L, "ref_STAY.json"), "utf8"), '{"s":1}', "Ueberlagerung sieht Repo und Sicherung");
  await assert.rejects(restore({ get: async () => Buffer.from("falsch") }, r, join(r, "p2")), /SERIES_RESTORE_HASH_MISMATCH/);
  rmSync(r, { recursive: true, force: true });
});

test("RS-7 · B2b: der Forschungs-Loader nimmt die private Kopie, der festgenagelte Adapter bleibt unberuehrt", () => {
  const loader = readFileSync(join(ROOT, "quant/engines/research-weekly-loader.cjs"), "utf8");
  assert.match(loader, /require\('\.\/research-series-path\.cjs'\)/);
  assert.equal((loader.match(/fs\.readFileSync\(path\.join\(root, rel/g) || []).length, 0, "kein Direktzugriff auf die Repo-Reihe mehr");
  assert.doesNotMatch(readFileSync(join(ROOT, "quant/engines/weekly-real-adapter.cjs"), "utf8"), /research-series-path/);
});
