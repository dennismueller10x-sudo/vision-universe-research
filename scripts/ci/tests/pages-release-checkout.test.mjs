/* pages-release.yml checkt bei push/schedule/dispatch den Kopf von main aus
   (github.ref), prueft aber, dass der ausgelieferte Stand zum Ereignis passt.
   Ein spaet gestarteter Lauf sieht einen neueren Kopf. Zulaessig ist das nur,
   wenn der Kopf den Ereignis-Commit enthaelt (Vergleich "ahead"); vorher
   brach jeder solche Lauf ab, und der Kopf blieb unausgeliefert
   (05.10.2026, Lauf 37246080180). Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows", "pages-release.yml");
const text = readFileSync(FILE, "utf8");

/** Der Abschnitt zwischen der Kopf-Ermittlung und der Freigabe des Kopfes. */
export function mismatchBlock(src) {
  const a = src.indexOf('HEAD_SHA=$(git rev-parse HEAD)');
  const b = src.indexOf('export EXPECTED_COMMIT="$HEAD_SHA"');
  return a >= 0 && b > a ? src.slice(a, b) : "";
}

/** Laesst der Block einen abweichenden Kopf nur bei Vergleich "ahead" durch? */
export function acceptsOnlyAhead(block) {
  return /compare\/\$EVENT_SHA\.\.\.\$HEAD_SHA/.test(block) &&
         /\[ "\$STATUS" != "ahead" \]/.test(block) &&
         /CHECKOUT_COMMIT_MISMATCH[\s\S]*exit 1/.test(block);
}

test("Ein abweichender Kopf wird nur ausgeliefert, wenn er das Ereignis enthaelt", () => {
  const block = mismatchBlock(text);
  assert.ok(block, "Kopf-Pruefung in pages-release.yml nicht gefunden");
  assert.ok(acceptsOnlyAhead(block), "abweichender Kopf ohne Vorfahren-Pruefung oder ohne Abbruch");
});

test("Der Ausgabebericht muss weiterhin genau den ausgecheckten Commit tragen", () => {
  assert.match(text, /report\.sourceCommit!==process\.env\.EXPECTED_COMMIT\) throw Error\('RELEASE_COMMIT_MISMATCH'\)/);
});

test("Erkennung: ein bedingungsloser Abbruch und ein bedingungsloses Durchwinken fallen auf", () => {
  const hart = 'HEAD_SHA=$(git rev-parse HEAD)\nif [ x ]; then echo "CHECKOUT_COMMIT_MISMATCH"; exit 1; fi\nexport EXPECTED_COMMIT="$HEAD_SHA"';
  const lax = 'HEAD_SHA=$(git rev-parse HEAD)\nSTATUS=$(gh api "repos/x/compare/$EVENT_SHA...$HEAD_SHA")\nexport EXPECTED_COMMIT="$HEAD_SHA"';
  assert.equal(acceptsOnlyAhead(mismatchBlock(hart)), false);
  assert.equal(acceptsOnlyAhead(mismatchBlock(lax)), false);
});
