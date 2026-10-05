/* Security-Review M4 (05.10.2026): der Schluessel-Scan (--all, laeuft vor
   jedem Deployment) deckte workers/, api/ und assets/ nicht ab und kannte
   die Schluessel von Ask, Cloudflare und der Historienablage nicht. Dieser
   Test haelt den Umfang fest, ohne Dateien ins Repository zu schreiben. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../scripts/market/assert-no-secrets.mjs", import.meta.url), "utf8");

test("--all prueft auch Worker, API und ausgelieferte Assets", () => {
  for (const dir of ["worker", "workers", "api", "assets", ".github/workflows"]) assert.ok(src.includes(`"${dir}"`), dir);
});

test("Die Werte aller Schluessel aus der Umgebung werden abgeglichen", () => {
  for (const name of ["TIINGO_API_KEY", "ANTHROPIC_API_KEY", "CLOUDFLARE_API_TOKEN",
                      "VU_HISTORY_S3_ACCESS_KEY_ID", "VU_HISTORY_S3_SECRET_ACCESS_KEY"]) {
    assert.ok(src.includes(`"${name}"`), name);
  }
});

test("Anthropic-Schluessel werden erkannt - der allgemeine sk-Ausdruck fing sie nicht", () => {
  const m = src.match(/name: "Anthropic-Schluessel", re: (\/.+\/)\s*\}/);
  assert.ok(m, "Muster fehlt");
  const re = new RegExp(m[1].slice(1, m[1].lastIndexOf("/")));
  const probe = "sk-ant-api03-" + "x".repeat(30);
  assert.ok(re.test(probe));
  assert.equal(/\bsk-[A-Za-z0-9]{16,}/.test(probe), false, "der allgemeine Ausdruck faengt es doch - Test ueberdenken");
});

test("Tests und Fixtures bleiben aussen vor, Ausgeliefertes nicht", () => {
  const m = src.match(/const TESTPFAD = (\/.+\/);/);
  assert.ok(m);
  const re = new RegExp(m[1].slice(1, -1));
  assert.ok(re.test("workers/vu-ask/tests/vu-ask.test.mjs"));
  assert.equal(re.test("workers/vu-ask/src/index.js"), false);
  assert.equal(re.test("assets/site-navigation.js"), false);
});
