/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/request-creative-web-force-attempt.test.mjs

   DER ECHTE BEFUND, DER DIESE DATEI AUSGELOEST HAT

   Lauf 68 des Social Orchestrators (26.09., nach PR #251) waehlte
   erneut vu-web-4e4d3aaef2a999a2-20260926 als Top-Story — dieselbe,
   die bereits einen CREATIVE_JOB_VERIFIED Job im Register hatte (aus
   PR #250, VOR den drei Fixes dieses Tages). request-creative-web.mjs
   sah den VERIFIED Job, rief REUSE_VERIFIED_CREATIVE und beendete sich,
   OHNE einen neuen Brief mit den gefixten Prompts zu erzeugen — der
   Owner bekam dasselbe, bereits kritisierte Bild ein zweites Mal in
   die Approval Queue gestellt.

   HYDRATE BEFORE REGENERATE ist als STANDARD richtig: dieselbe Story
   soll nicht automatisch zweimal angefragt werden. Aber ohne einen
   expliziten Weg daran vorbei laesst sich eine Prompt-Aenderung nicht
   gegen genau die Story testen, die den Fehler zuerst zeigte, solange
   sie die Top-Story bleibt.

   Diese Tests decken NUR die neue, reine Entscheidungsfunktion
   (entscheideErzwungenenAnlauf) und das CLI-Validierungsverhalten ab —
   beides deterministisch, unabhaengig vom heutigen Datenstand. Der
   volle Schreibpfad (--write) wird hier bewusst NICHT ausgefuehrt, aus
   demselben Grund wie in creative-reuse.test.mjs: ein Test darf das
   reale Register/Ledger nicht veraendern.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { entscheideErzwungenenAnlauf } from "../../scripts/social/request-creative-web.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKRIPT = join(ROOT, "scripts/social/request-creative-web.mjs");

test("FA1 · Ohne --force-attempt bleibt alles beim Standardweg (attempt: null)", () => {
  const e = entscheideErzwungenenAnlauf(null, null);
  assert.equal(e.ok, true);
  assert.equal(e.attempt, null);
});

test("FA2 · --force-attempt 1 ist ungueltig — Anlauf 1 ist der Standardweg", () => {
  const e = entscheideErzwungenenAnlauf("1", "irgendein Grund");
  assert.equal(e.ok, false);
  assert.equal(e.reason, "invalidAttempt");
});

test("FA3 · --force-attempt 0 und negative Werte sind ungueltig", () => {
  assert.equal(entscheideErzwungenenAnlauf("0", "grund").ok, false);
  assert.equal(entscheideErzwungenenAnlauf("-2", "grund").ok, false);
});

test("FA4 · --force-attempt muss eine ganze Zahl sein — 2.5 wird abgewiesen", () => {
  const e = entscheideErzwungenenAnlauf("2.5", "grund");
  assert.equal(e.ok, false);
  assert.equal(e.reason, "invalidAttempt");
});

test("FA5 · --force-attempt ohne Text ist keine Zahl und wird abgewiesen", () => {
  const e = entscheideErzwungenenAnlauf("zwei", "grund");
  assert.equal(e.ok, false);
  assert.equal(e.reason, "invalidAttempt");
});

test("FA6 · --force-attempt 2 ohne --attempt-reason wird verweigert", () => {
  const e = entscheideErzwungenenAnlauf("2", null);
  assert.equal(e.ok, false);
  assert.equal(e.reason, "missingReason");
});

test("FA7 · --force-attempt 2 mit Begruendung ist gueltig", () => {
  const e = entscheideErzwungenenAnlauf("2", "Owner-Test der Atlas-/Hook-Fixes");
  assert.equal(e.ok, true);
  assert.equal(e.attempt, 2);
  assert.equal(e.reason, "Owner-Test der Atlas-/Hook-Fixes");
});

test("FA8 · Das echte CLI weist --force-attempt 1 mit Exit-Code 2 ab, ohne die " +
  "Web-Story-Auswahl je zu lesen", () => {
  let code = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath,
      [SKRIPT, "--force-attempt", "1", "--attempt-reason", "irgendein Grund"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  } catch (err) {
    code = err.status;
    stderr = String(err.stderr || "");
  }
  assert.equal(code, 2, "das Skript endete mit " + code);
  assert.match(stderr, /--force-attempt muss eine ganze Zahl >= 2 sein/);
});

test("FA9 · Das echte CLI weist --force-attempt 2 ohne --attempt-reason mit " +
  "Exit-Code 2 ab", () => {
  let code = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [SKRIPT, "--force-attempt", "2"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  } catch (err) {
    code = err.status;
    stderr = String(err.stderr || "");
  }
  assert.equal(code, 2, "das Skript endete mit " + code);
  assert.match(stderr, /--force-attempt verlangt --attempt-reason/);
});

test("FA10 · Ein gueltiger --force-attempt beeinflusst nie das Register oder " +
  "Ledger ohne --write", () => {
  const registerPfad = join(ROOT, "social/data/creative-jobs.json");
  const ledgerPfad = join(ROOT, "social/data/creative-invocations.json");
  const registerVorher = readFileSync(registerPfad, "utf8");
  const ledgerVorher = readFileSync(ledgerPfad, "utf8");

  try {
    execFileSync(process.execPath,
      [SKRIPT, "--force-attempt", "2", "--attempt-reason", "Testlauf ohne Schreiben"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  } catch { /* Exit-Code haengt vom heutigen Datenstand ab (z.B. Ledger-Sperre) -
               relevant ist hier ausschliesslich, dass nichts geschrieben wurde. */ }

  assert.equal(readFileSync(registerPfad, "utf8"), registerVorher,
    "Ohne --write darf das Job-Register unveraendert bleiben.");
  assert.equal(readFileSync(ledgerPfad, "utf8"), ledgerVorher,
    "Ohne --write darf das Invocation-Ledger unveraendert bleiben.");
});
