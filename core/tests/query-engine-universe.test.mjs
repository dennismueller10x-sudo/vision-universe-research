// Universumstest der gemeinsamen Abfrage-Engine (core/query-engine.js).
//
// Die Momentaufnahme core/tests/fixtures/query-engine-universe.json.gz stammt von der ALTEN Implementierung
// (getrennte Engines in screener/engine/engine.js und quant/engines/technical/technical-query.js, Commit in
// `implementation`) und wurde mit
//   node scripts/core/query-universe-snapshot.mjs --impl <alter Stand> --screener <veroeffentlichtes Universum> --out <datei>
// erzeugt. Sie haelt je Abfrage den SHA-256 der vollstaendigen Ausgabe (Trefferliste in Ausgabereihenfolge,
// Trichter, Zaehler, Fehler). Dieser Test rechnet dieselben Abfragen mit der neuen Implementierung und
// vergleicht byte-genau.
//
// Passen die Daten nicht mehr zur Momentaufnahme (naechster Datenlauf), rechnet der Test die alte
// Implementierung aus der Git-Historie auf den aktuellen Daten neu (eigener Prozess, Ausgabe im Temp-Ordner).
// Ohne erreichbaren Commit (flacher Checkout) wird mit Begruendung uebersprungen.
//
// Screener-Universum: VU_SCREENER_UNIVERSE=<pfad> oder screener/data/universe-US_REAL.json
// (node scripts/screener/build-universe.mjs bzw. das veroeffentlichte Artefakt).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { snapshot, SNAPSHOT_SCHEMA } from "../../scripts/core/query-universe-snapshot.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const SCRIPT = join(ROOT, "scripts/core/query-universe-snapshot.mjs");
const fixture = JSON.parse(gunzipSync(readFileSync(join(ROOT, "core/tests/fixtures/query-engine-universe.json.gz"))).toString("utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

const PATHS = {
  screener: process.env.VU_SCREENER_UNIVERSE || join(ROOT, "screener/data/universe-US_REAL.json"),
  technical: join(ROOT, "technical/data/screener-v1.json")
};
function input(world) {
  if (!existsSync(PATHS[world])) return null;
  const bytes = readFileSync(PATHS[world]);
  return { path: PATHS[world], sha256: sha(bytes), json: JSON.parse(bytes.toString("utf8")) };
}

function diffs(expected, actual) {
  const by = new Map(actual.results.map((r) => [r.id, r]));
  const out = [];
  for (const e of expected) {
    const a = by.get(e.id);
    if (!a) out.push(e.id + ": fehlt");
    else if (a.sha256 !== e.sha256 || a.count !== e.count || a.error !== e.error) out.push(`${e.id}: alt ${e.count}/${e.error} ${e.sha256.slice(0, 12)} · neu ${a.count}/${a.error} ${a.sha256.slice(0, 12)}`);
  }
  return out;
}

/** Alte Implementierung aus der Git-Historie in einen Temp-Ordner; null, wenn der Commit nicht erreichbar ist. */
function legacyCheckout(ref) {
  const dir = mkdtempSync(join(tmpdir(), "vu-query-legacy-"));
  try {
    const tar = join(dir, "legacy.tar");
    execFileSync("git", ["-C", ROOT, "archive", "--output", tar, ref, "package.json", "screener/engine", "quant/engines/technical/technical-query.js", "technical/engine"], { stdio: "ignore" });
    execFileSync("tar", ["-xf", tar, "-C", dir], { stdio: "ignore" });
    return dir;
  } catch { rmSync(dir, { recursive: true, force: true }); return null; }
}

test("Momentaufnahme der alten Implementierung: Umfang und Abdeckung", () => {
  assert.equal(fixture.schema, SNAPSHOT_SCHEMA);
  assert.match(fixture.implementation, /^[0-9a-f]{40}$/, "Commit der alten Implementierung");
  assert.ok(fixture.results.length >= 2400, "Abfragen: " + fixture.results.length);
  const ids = new Set(fixture.results.map((r) => r.id));
  assert.equal(ids.size, fixture.results.length, "eindeutige Kennungen");
  /* jedes Feld beider Kataloge, jeder Zeitrahmen der Technical-Felder */
  const Fields = require("../../screener/engine/fields.js"), TQ = require("../../quant/engines/technical/technical-query.js"), TPL = require("../../technical/engine/templates.js");
  for (const f of Fields.FIELDS) assert.ok([...ids].some((id) => id.startsWith("sc:" + f.id + ":") || id === "sc:unavailable:" + f.id || id === "sc:empty:" + f.id), "Screener-Feld " + f.id);
  for (const f of TQ.FIELDS) for (const tf of f.tfs) assert.ok([...ids].some((id) => id.startsWith("tq:" + f.id + "@" + tf + ":")), "Technical-Feld " + f.id + "@" + tf);
  for (const t of TPL.TEMPLATES) assert.ok(ids.has("tpl:" + t.id), "Vorlage " + t.id);
  /* jeder Operator, jede Verknuepfung, Sortierungen, Fehler, leere und fehlende Werte */
  const ops = new Set(), logics = new Set(), groupOps = new Set();
  for (const r of fixture.results) {
    const q = r.query && r.query.groups ? r.query : null;
    if (!q) continue;
    logics.add(q.logic || "AND");
    for (const g of q.groups || []) { groupOps.add(g && g.op); for (const f of (g && g.filters) || []) ops.add(r.world + ":" + f.op); }
  }
  for (const op of ["gt", "gte", "lt", "lte", "between", "eq", "is", "in"]) assert.ok(ops.has("screener:" + op), "Screener-Operator " + op);
  for (const op of ["gt", "gte", "lt", "lte", "between", "is", "in", "nin"]) assert.ok(ops.has("technical:" + op), "Technical-Operator " + op);
  assert.ok(logics.has("AND") && logics.has("OR") && groupOps.has("AND") && groupOps.has("OR"));
  assert.ok(fixture.results.filter((r) => /:sort|sort[-:]/.test(r.id)).length >= 300, "Sortierungen");
  assert.ok(fixture.results.filter((r) => r.error).length >= 40, "Fehlerfaelle");
  assert.ok(fixture.results.some((r) => !r.error && r.count === 0), "Abfragen ohne Treffer");
  assert.ok(fixture.results.some((r) => r.id.includes(":win:")), "Ereignisfelder mit Pruefraum");
  assert.ok(fixture.results.some((r) => r.id === "sc:missing-heavy") && fixture.results.some((r) => r.id === "tq:sort-sparse-or:goldenCrossDays:asc"), "fehlende Werte");
});

for (const world of ["screener", "technical"]) {
  const worlds = world === "technical" ? ["technical", "template"] : ["screener"];
  const expected = fixture.results.filter((r) => worlds.includes(r.world));
  const inp = input(world);
  test(`${world}: Treffer alt = neu auf dem echten Universum (byte-genau, ${expected.length} Abfragen)`, { skip: !inp && "Universum fehlt: " + PATHS[world] }, (t) => {
    const art = { screenerArtifact: world === "screener" ? inp.json : null, technicalArtifact: world === "technical" ? inp.json : null };
    if (inp.sha256 === fixture.inputs[world].sha256) {
      const now = snapshot({ ...art, queries: expected.map((r) => ({ id: r.id, world: r.world, query: r.query })) });
      assert.equal(now.results.length, expected.length);
      const d = diffs(expected, now);
      assert.deepEqual(d.slice(0, 20), [], d.length + " Abweichungen");
      return;
    }
    /* Neue Daten: alte Implementierung aus der Historie auf denselben Daten neu rechnen. */
    const legacy = legacyCheckout(fixture.implementation);
    if (!legacy) return t.skip(`Daten seit der Momentaufnahme geaendert und Commit ${fixture.implementation.slice(0, 10)} nicht erreichbar (flacher Checkout)`);
    const out = mkdtempSync(join(tmpdir(), "vu-query-snap-"));
    try {
      const args = world === "screener" ? ["--screener", inp.path] : ["--technical", inp.path];
      execFileSync(process.execPath, [SCRIPT, ...args, "--impl", legacy, "--out", join(out, "old.json")], { stdio: "ignore" });
      execFileSync(process.execPath, [SCRIPT, ...args, "--queries", join(out, "old.json"), "--out", join(out, "new.json")], { stdio: "ignore" });
      const old = JSON.parse(readFileSync(join(out, "old.json"), "utf8")), now = JSON.parse(readFileSync(join(out, "new.json"), "utf8"));
      assert.ok(old.results.length >= expected.length * 0.9, "Abfragen: " + old.results.length);
      const d = diffs(old.results, now);
      assert.deepEqual(d.slice(0, 20), [], d.length + " Abweichungen");
    } finally { rmSync(out, { recursive: true, force: true }); rmSync(legacy, { recursive: true, force: true }); }
  });
}
