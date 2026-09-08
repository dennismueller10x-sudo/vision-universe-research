import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const navigation = readFileSync(join(root, "assets", "site-navigation.js"), "utf8");

test("PREVIEW1 · Die gemeinsame Navigation kennzeichnet jede Plattformseite als Development Preview", () => {
  assert.match(navigation, />Development Preview<\/span>/);
  assert.match(navigation, /aria-label="Vision Universe — Development Preview"/);
});

test("PREVIEW2 · Die Preview-Kennzeichnung bleibt im mobilen Header sichtbar", () => {
  assert.match(navigation, /@media\(max-width:760px\)[\s\S]*\.preview\{/);
  assert.doesNotMatch(navigation, /\.preview\{[^}]*display\s*:\s*none/);
});
