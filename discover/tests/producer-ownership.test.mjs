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
function ownedSnapshot(directory) {
  const files = snapshot(directory);
  for (const name of Object.keys(files)) if (name.startsWith("europe/")) delete files[name];
  // The producer's documented sole nondeterministic output field.
  const meta = JSON.parse(readFileSync(join(directory, "meta.json")));
  delete meta.generatedAt;
  files["meta.json"] = digest(JSON.stringify(meta));
  return files;
}

test("actual Discover rebuild preserves only foreign Europe directory bytes and regenerates its own outputs", { timeout: 650000 }, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "vu-discover-ownership-"));
  try {
    // Only inputs are linked. The real producer writes exclusively to private data.
    for (const entry of ["quant", "dashboard", "core"]) symlinkSync(join(root, entry), join(temporary, entry), "dir");
    mkdirSync(join(temporary, "scripts/discover"), { recursive: true });
    symlinkSync(join(root, "scripts/market"), join(temporary, "scripts/market"), "dir");
    writeFileSync(join(temporary, "scripts/discover/build-discover-data.mjs"), readFileSync(builder));
    writeFileSync(join(temporary, "scripts/discover/global-search-index.mjs"), readFileSync(join(root,"scripts/discover/global-search-index.mjs")));
    mkdirSync(join(temporary, "discover"));
    for (const entry of ["engines", "config", "methodology"]) symlinkSync(join(root, "discover", entry), join(temporary, "discover", entry), "dir");
    const data = join(temporary, "discover/data");
    mkdirSync(data);
    const original = ownedSnapshot(join(root, "discover/data"));
    // Exercise the actual published directory when present; pre-publication
    // branches still verify opaque independent producer bytes below.
    if (existsSync(join(root, "discover/data/europe"))) cpSync(join(root, "discover/data/europe"), join(data, "europe"), { recursive: true });
    mkdirSync(join(data, "europe/nested"), { recursive: true });
    writeFileSync(join(data, "europe/opaque-fixture.json"), "opaque foreign payload, not JSON\n");
    writeFileSync(join(data, "europe/nested/sentinel.bin"), Buffer.from([0, 255, 13, 10, 128]));
    const europe = snapshot(join(data, "europe"));
    mkdirSync(join(data, "rows/obsolete"), { recursive: true });
    writeFileSync(join(data, "rows/obsolete/stale.json"), "remove me");
    writeFileSync(join(data, "unknown-producer-entry"), "remove me");
    mkdirSync(join(data, "Europe"));
    writeFileSync(join(data, "Europe/wrong-case"), "remove me");
    writeFileSync(join(data, "meta.json"), "replace me");
    await run(process.execPath, [join(temporary, "scripts/discover/build-discover-data.mjs")], { cwd: temporary, timeout: 600000, maxBuffer: 1024 * 1024 });
    assert.deepEqual(snapshot(join(data, "europe")), europe, "foreign bytes must never be parsed, rewritten or removed");
    assert.equal(existsSync(join(data, "rows/obsolete")), false);
    assert.equal(existsSync(join(data, "unknown-producer-entry")), false);
    assert.equal(existsSync(join(data, "Europe")), false);
    assert.deepEqual(ownedSnapshot(data), original, "all existing producer outputs must retain their exact bytes except meta.generatedAt");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
