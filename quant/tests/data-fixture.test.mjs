// Eingefrorener Datenstand fuer Tests (scripts/quant/lib/data-fixture.mjs, Steuerung 18.11.2026).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { packFixture, mountFixture, dataDirOf, readFixture } from "../../scripts/quant/lib/data-fixture.mjs";

function repo() {
  const r = mkdtempSync(join(tmpdir(), "vu-fx-src-"));
  for (const [p, c] of Object.entries({ "a/data/x.json": '{"v":1}', "a/data/y.json": '{"v":2}', "a/data/z.json.gz": "GZ", "a/config/c.json": "{}", "a/code.js": "1", "b/data/q.json": "{}" })) {
    mkdirSync(join(r, p, ".."), { recursive: true }); writeFileSync(join(r, p), c);
  }
  return r;
}

test("DF-1 · nur Datendateien, Binaerdateien unveraendert, Spiegelwurzel: eingefrorene Daten, sonst Symlink", () => {
  const src = repo(), out = join(src, "fx.json.gz");
  assert.throws(() => packFixture(["a/config/c.json"], {}, src), /FIXTURE_NOT_DATA/);
  writeFileSync(out, packFixture(["a/data/x.json", "a/data/z.json.gz"], { sourceCommit: "abc" }, src));
  assert.equal(readFixture(out).meta.sourceCommit, "abc");
  writeFileSync(join(src, "a/data/x.json"), '{"v":99}');                         // spaeterer Live-Stand
  const { root } = mountFixture(out, { root: src });
  assert.equal(readFileSync(join(root, "a/data/x.json"), "utf8"), '{"v":1}', "der eingefrorene Stand gilt");
  assert.equal(readFileSync(join(root, "a/data/z.json.gz"), "utf8"), "GZ");
  assert.equal(existsSync(join(root, "a/data/y.json")), false, "nicht Eingefrorenes fehlt sichtbar");
  assert.ok(lstatSync(join(root, "a/config")).isSymbolicLink() && lstatSync(join(root, "a/code.js")).isSymbolicLink());
  assert.ok(lstatSync(join(root, "b")).isSymbolicLink(), "fremde Datenwurzel bleibt das Repository");
  assert.equal(dataDirOf("quant/data/product/x.json"), "quant/data");
  rmSync(root, { recursive: true, force: true });
  assert.equal(readFileSync(join(src, "a/config/c.json"), "utf8"), "{}", "Aufraeumen loescht keine Ziele");
  rmSync(src, { recursive: true, force: true });
});

test("DF-2 · das Bündel von product-services nennt Quelle und enthaelt nur Daten", () => {
  const b = readFixture(new URL("fixtures/product-services/data.json.gz", import.meta.url));
  assert.match(b.meta.sourceCommit, /^[0-9a-f]{40}$/);
  assert.ok(Object.keys(b.files).length > 50);
  assert.ok(Object.keys(b.files).every((p) => p.split("/").includes("data")));
});
