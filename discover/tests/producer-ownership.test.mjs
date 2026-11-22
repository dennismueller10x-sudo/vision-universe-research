import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync,
  symlinkSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { followByTime } from "../../scripts/quant/lib/follow-artifact.mjs";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const builder = join(root, "scripts/discover/build-discover-data.mjs");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function snapshot(directory, prefix = "") {
  const files = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), relative = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, snapshot(path, relative + "/"));
    else files[relative] = digest(readFileSync(path));
  }
  return files;
}
/* Halbstand (Steuerung 22.11.2026): Der Neubau liest quant/data live. Hat ein Eignungs- oder Marktlauf einen Eingang NACH dem
   committeten Discover-Stand veraendert (Universum, Capability, Listing-Kontinuitaet, Faktoren, Technical-Index), weicht der Neubau
   bis zum naechsten Discover-Lauf ab, ohne dass Code falsch ist (Laeufe 41965210, 44913172). Bis 6 h nach dem Eingang wartet der
   Bytevergleich sichtbar (skip), danach ist er ein Fehler; ist kein Eingang juenger als der Stand, bleibt er streng. */
const EINGANG_STAND = ["quant/data/market/listing-continuity-v1.json", "quant/data/market/factors/factors-FULL_UNIVERSE.json",
  "quant/data/technical/index.json", "quant/data/universe/market-capability.json", "quant/data/universe/master-manifest.json"];
function neuesterEingang() {
  let best = null;
  for (const rel of EINGANG_STAND) {
    try {
      const at = JSON.parse(readFileSync(join(root, rel), "utf8")).generatedAt;
      if (Number.isFinite(Date.parse(at)) && (!best || Date.parse(at) > Date.parse(best))) best = at;
    } catch { /* fehlt: kein Eingang */ }
  }
  return best;
}
function ownedSnapshot(directory) {
  const files = snapshot(directory);
  for (const name of Object.keys(files)) if (name.startsWith("europe/") || name.startsWith("europe-esef/")) delete files[name];
  // The producer's documented sole nondeterministic output field.
  const meta = JSON.parse(readFileSync(join(directory, "meta.json")));
  delete meta.generatedAt;
  files["meta.json"] = digest(JSON.stringify(meta));
  return files;
}

test("actual Discover rebuild preserves only foreign Europe and Europe-ESEF directory bytes and regenerates its own outputs", { timeout: 650000 }, async (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "vu-discover-ownership-"));
  try {
    // Only inputs are linked. The real producer writes exclusively to private data.
    for (const entry of ["quant", "dashboard", "core"]) symlinkSync(join(root, entry), join(temporary, entry), "dir");
    mkdirSync(join(temporary, "scripts/discover"), { recursive: true });
    symlinkSync(join(root, "scripts/market"), join(temporary, "scripts/market"), "dir");
    writeFileSync(join(temporary, "scripts/discover/build-discover-data.mjs"), readFileSync(builder));
    writeFileSync(join(temporary, "scripts/discover/global-search-index.mjs"), readFileSync(join(root,"scripts/discover/global-search-index.mjs")));
    writeFileSync(join(temporary, "scripts/discover/not-delivered.mjs"), readFileSync(join(root, "scripts/discover/not-delivered.mjs")));
    mkdirSync(join(temporary, "discover"));
    for (const entry of ["engines", "config", "methodology"]) symlinkSync(join(root, "discover", entry), join(temporary, "discover", entry), "dir");
    const data = join(temporary, "discover/data");
    mkdirSync(data);
    const original = ownedSnapshot(join(root, "discover/data"));
    const committedGeneratedAt = JSON.parse(readFileSync(join(root, "discover/data/meta.json"), "utf8")).generatedAt;
    // Exercise the actual published directory when present; pre-publication
    // branches still verify opaque independent producer bytes below.
    if (existsSync(join(root, "discover/data/europe"))) cpSync(join(root, "discover/data/europe"), join(data, "europe"), { recursive: true });
    mkdirSync(join(data, "europe/nested"), { recursive: true });
    writeFileSync(join(data, "europe/opaque-fixture.json"), "opaque foreign payload, not JSON\n");
    writeFileSync(join(data, "europe/nested/sentinel.bin"), Buffer.from([0, 255, 13, 10, 128]));
    const europe = snapshot(join(data, "europe"));
    if (existsSync(join(root, "discover/data/europe-esef"))) cpSync(join(root, "discover/data/europe-esef"), join(data, "europe-esef"), { recursive: true });
    mkdirSync(join(data, "europe-esef"), { recursive: true });
    writeFileSync(join(data, "europe-esef/opaque-fixture.json"), "opaque foreign payload, not JSON\n");
    const esef = snapshot(join(data, "europe-esef"));
    /* Vorheriger Stand des Erzeugers (NEU-Etikett, #1663): der Bau liest membership/ und rows/ VOR dem Leeren
       und traegt firstSeen daraus weiter (build-discover-data.mjs#readPrevious). In Produktion laeuft er ueber
       dem eingecheckten discover/data; ohne diesen Stand kaeme firstSeen null heraus, und der Bytevergleich
       unten waere rot, sobald eine Karte ein Datum traegt (seit dem Marktlauf vom 09.11.2026). */
    for (const entry of ["membership", "rows"]) {
      if (existsSync(join(root, "discover/data", entry))) cpSync(join(root, "discover/data", entry), join(data, entry), { recursive: true });
    }
    mkdirSync(join(data, "rows/obsolete"), { recursive: true });
    writeFileSync(join(data, "rows/obsolete/stale.json"), "remove me");
    writeFileSync(join(data, "unknown-producer-entry"), "remove me");
    mkdirSync(join(data, "Europe"));
    writeFileSync(join(data, "Europe/wrong-case"), "remove me");
    writeFileSync(join(data, "meta.json"), "replace me");
    await run(process.execPath, [join(temporary, "scripts/discover/build-discover-data.mjs")], { cwd: temporary, timeout: 600000, maxBuffer: 1024 * 1024 });
    assert.deepEqual(snapshot(join(data, "europe")), europe, "foreign bytes must never be parsed, rewritten or removed");
    assert.deepEqual(snapshot(join(data, "europe-esef")), esef, "ESEF facts belong to their own producer");
    assert.equal(existsSync(join(data, "rows/obsolete")), false);
    assert.equal(existsSync(join(data, "unknown-producer-entry")), false);
    assert.equal(existsSync(join(data, "Europe")), false);
    const neu = ownedSnapshot(data);
    try { assert.deepEqual(neu, original, "all existing producer outputs must retain their exact bytes except meta.generatedAt"); }
    catch (e) {
      const folge = followByTime({ artifactAt: committedGeneratedAt, sourceAt: neuesterEingang() });
      if (folge.state !== "WAITING") throw e;
      t.skip("Halbstand: " + folge.reason);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
