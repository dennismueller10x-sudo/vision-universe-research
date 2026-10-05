/* Ein Push auf claude/** startet sec-fundamentals-daily.yml als Nachweis,
   dass der Lauf startet. Er darf dabei nichts holen, nichts nach R2
   schreiben und nichts committen: vorher landeten so Produktionsdaten vom
   Stand des Zweigs im Feature-Zweig (#386, #413, #421) und ein Merge haette
   neuere Daten auf main zurueckgerollt. Lauf: node --test "scripts/ci/tests/*.test.mjs" */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".github", "workflows", "sec-fundamentals-daily.yml");
const text = readFileSync(FILE, "utf8");

/** Erzwingt der Verarbeitungsschritt bei einem push-Ereignis --dry-run? */
export function pushForcesDryRun(src) {
  return /\[\s*"\$GITHUB_EVENT_NAME"\s*=\s*"push"\s*\][^\n]*args\+=\(--dry-run\)/.test(src);
}

test("Push-Laeufe der SEC-Daily-Pipeline sind Trockenlaeufe", () => {
  assert.ok(/^  push:\s*$/m.test(text), "kein push-Ausloeser mehr - dann ist dieser Test zu ueberdenken");
  assert.ok(pushForcesDryRun(text), "ein push-Lauf verarbeitet echt (R2, Commit auf den Zweig)");
});

test("Schreibende Schritte haengen am Trockenlauf-Kennzeichen", () => {
  const commit = text.split("\n      - name:").find((s) => /commit-and-push\.sh/.test(s)) || "";
  assert.match(commit, /if:\s*steps\.updated\.outputs\.dry != 'true'/);
});

test("Erkennung: ohne Push-Zwang schlaegt die Pruefung an", () => {
  assert.equal(pushForcesDryRun('[ "$IN_DRY_RUN" = "true" ] && args+=(--dry-run)'), false);
  assert.equal(pushForcesDryRun('if [ "$IN_DRY_RUN" = "true" ] || [ "$GITHUB_EVENT_NAME" = "push" ]; then args+=(--dry-run); fi'), true);
});
