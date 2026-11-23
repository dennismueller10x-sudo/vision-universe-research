/* pages-release-pfade.mjs: der push-Pfadfilter aus pages-release.yml (eine Quelle) und das Boersenfenster (Steuerung 23.11.2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { leseFilter, passiert, ausloesende, imBoersenfenster } from "../pages-release-pfade.mjs";

const YML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows", "pages-release.yml"), "utf8");
const F = leseFilter(YML);

test("PP-1 der Filter wird aus dem push-Block gelesen: beginnt mit '**', enthaelt die Ausnahmen und hebt pages-release.yml am Ende wieder auf", () => {
  assert.equal(F[0], "**");
  for (const m of ["!docs/**", "!scripts/ci/**", "!**/*.md", "!**/tests/**", "!**/*-qa.mjs", "!.github/**"]) assert.ok(F.includes(m), m);
  assert.equal(F[F.length - 1], ".github/workflows/pages-release.yml");
  assert.ok(!F.some((m) => m.includes("vu2/**")), "der PR-Filter (pull_request.paths) gehoert nicht dazu");
});
test("PP-2 loest aus: Produkt-, Registry- und Daten-Pfade, pages-release.yml selbst; loest nicht aus: Doku, Tests, QA-Skripte, scripts/ci, .github/**, *.md", () => {
  for (const p of ["landing/scripts/ratgeber.mjs", "web/ratgeber.css", "index.html", "core/registry/workflow-bundles.json", "quant/data/x.json", "scripts/other/x.mjs", ".github/workflows/pages-release.yml"]) assert.equal(passiert(p, F), true, p);
  for (const p of ["docs/a/b.html", "CLAUDE.md", "sub/dir/README.md", "news/tests/x.test.mjs", "tests/y.js", "scripts/discover/europe-public-live-qa.mjs", "scripts/ci/pages-frei.sh", ".github/workflows/ci.yml", ".gitignore", "worker/index.js"]) assert.equal(passiert(p, F), false, p);
  assert.deepEqual(ausloesende(["docs/a.md", "web/x.css", "scripts/ci/a.mjs"], F), ["web/x.css"]);
});
test("PP-3 Boersenfenster: Mo-Fr 13:30 <= UTC < 21:00, Grenzen und Wochenende", () => {
  const t = (iso) => imBoersenfenster(new Date(iso));
  assert.equal(t("2026-11-23T13:29:59Z"), false); assert.equal(t("2026-11-23T13:30:00Z"), true);
  assert.equal(t("2026-11-23T20:59:59Z"), true); assert.equal(t("2026-11-23T21:00:00Z"), false);
  assert.equal(t("2026-11-27T15:00:00Z"), true, "Freitag"); assert.equal(t("2026-11-28T15:00:00Z"), false, "Samstag"); assert.equal(t("2026-11-29T15:00:00Z"), false, "Sonntag");
});
