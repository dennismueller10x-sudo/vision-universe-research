/* =========================================================================
   VU SOCIAL — ZWEI AUSLOESER, EIN PRODUKTIVER ZYKLUS (RL1–RL14)

   §5, §27–§31, §38. Der Fall, um den es geht: der Scheduler startet um
   06:35, und der Owner tippt um 06:35 auf JETZT PRUEFEN.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Lease = require("../engines/run-lease.js");

const NOW = "2026-09-20T12:00:00Z";
const vor = (minuten) => new Date(Date.parse(NOW) - minuten * 60000).toISOString();

/* ------------------------------------------------------ Die Engine */

test("RL1 · Ohne Lease darf gearbeitet werden", () => {
  const u = Lease.pruefe(null, { now: NOW, runId: "a" });
  assert.equal(u.darfArbeiten, true);
  assert.equal(u.grund, Lease.GRUND.FREI);
});

test("RL2 · Waehrend ein fremder Lauf arbeitet, nicht", () => {
  const fremd = Lease.nimm({ now: vor(5), runId: "b" });
  const u = Lease.pruefe(fremd, { now: NOW, runId: "a" });
  assert.equal(u.darfArbeiten, false);
  assert.equal(u.grund, Lease.GRUND.LAUF_AKTIV);
  assert.ok(u.wartetBis);
});

test("RL3 · Der eigene Lauf sperrt sich nicht selbst aus", () => {
  const eigen = Lease.nimm({ now: vor(5), runId: "a" });
  assert.equal(Lease.pruefe(eigen, { now: NOW, runId: "a" }).darfArbeiten, true);
});

test("RL4 · Eine verfallene Lease blockiert nicht ewig", () => {
  /* Ein Lauf, der mitten im Zyklus stirbt, darf die Maschine nicht
     dauerhaft anhalten. */
  const tot = Lease.nimm({ now: vor(Lease.ABLAUF_MINUTEN + 1), runId: "c" });
  const u = Lease.pruefe(tot, { now: NOW, runId: "a" });
  assert.equal(u.darfArbeiten, true);
  assert.equal(u.verfallen, true);
  /* Und sie wird BENANNT, nicht verschwiegen: eine verfallene Lease
     ist ein Hinweis auf einen abgebrochenen Lauf. */
  assert.match(u.erklaerung, /nie zurueckgegeben/);
});

test("RL5 · DER FALL: Scheduler und Owner gleichzeitig", () => {
  /* Der erste nimmt, arbeitet produktiv, gibt zurueck. Der zweite
     startet danach - und faehrt keinen zweiten Zyklus. */
  const scheduler = Lease.nimm({ now: vor(8), runId: "scheduler" });
  assert.equal(Lease.pruefe(scheduler, { now: vor(7), runId: "owner" }).darfArbeiten,
    false, "Zwei Laeufe gleichzeitig produktiv");

  const beendet = Lease.gib(scheduler, { now: vor(1), produktiv: true });
  const u = Lease.pruefe(beendet, { now: NOW, runId: "owner" });
  assert.equal(u.darfArbeiten, false);
  assert.equal(u.grund, Lease.GRUND.ABKLINGZEIT);
});

test("RL6 · Ein Lauf ohne Ergebnis haelt den naechsten nicht auf", () => {
  /* Die Gegenprobe zu RL5. Sonst blockierte jeder Leerlauf den
     naechsten Versuch - und JETZT PRUEFEN waere nach einem leeren
     Scheduler-Lauf zehn Minuten lang wirkungslos. */
  const leer = Lease.gib(Lease.nimm({ now: vor(8), runId: "scheduler" }),
    { now: vor(1), produktiv: false });
  assert.equal(Lease.pruefe(leer, { now: NOW, runId: "owner" }).darfArbeiten, true);
});

test("RL7 · Nach der Abklingzeit geht es wieder", () => {
  const beendet = Lease.gib(Lease.nimm({ now: vor(60), runId: "x" }),
    { now: vor(Lease.ABKLINGEN_MINUTEN + 1), produktiv: true });
  assert.equal(Lease.pruefe(beendet, { now: NOW, runId: "y" }).darfArbeiten, true);
});

test("RL8 · Die Abklingzeit steht keinem regulaeren Lauf im Weg", () => {
  /* Der Scheduler laeuft zweimal taeglich. Eine Sperre, die laenger
     haelt als dieser Abstand, waere keine gegen den doppelten Lauf
     mehr, sondern eine gegen den Betrieb. */
  assert.ok(Lease.ABKLINGEN_MINUTEN < 60);
  assert.ok(Lease.ABLAUF_MINUTEN < 12 * 60);
  /* Und die Lease muss laenger gelten als ein Lauf dauert, sonst
     nimmt ein zweiter sie mitten im ersten. */
  assert.ok(Lease.ABLAUF_MINUTEN > Lease.ABKLINGEN_MINUTEN);
});

/* --------------------------------------------- Ueber die echte CLI */

function platz() {
  return mkdtempSync(join(tmpdir(), "vu-lease-"));
}
function orchestrator(datenDir, ...args) {
  return execFileSync(process.execPath,
    [join(ROOT, "scripts/social/run-orchestrator.mjs"), "--data", datenDir, ...args],
    { cwd: ROOT, encoding: "utf8" });
}

test("RL9 · Der echte Lauf nimmt und verwehrt die Lease", () => {
  const d = platz();
  try {
    assert.match(orchestrator(d, "--lease-claim", "lauf-1"), /Produktiv erlaubt: ja/);
    assert.match(orchestrator(d, "--lease-claim", "lauf-2"), /Produktiv erlaubt: nein/);
    assert.match(orchestrator(d, "--lease-claim", "lauf-2"), /LAUF_AKTIV/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("RL10 · Nach produktiver Rueckgabe klingt es ab", () => {
  const d = platz();
  try {
    orchestrator(d, "--lease-claim", "lauf-1");
    orchestrator(d, "--lease-release", "lauf-1", "--produktiv");
    const zweiter = orchestrator(d, "--lease-claim", "lauf-2");
    assert.match(zweiter, /Produktiv erlaubt: nein/);
    assert.match(zweiter, /ABKLINGZEIT/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("RL11 · Nach unproduktiver Rueckgabe nicht", () => {
  const d = platz();
  try {
    orchestrator(d, "--lease-claim", "lauf-1");
    orchestrator(d, "--lease-release", "lauf-1");
    assert.match(orchestrator(d, "--lease-claim", "lauf-2"), /Produktiv erlaubt: ja/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("RL12 · Eine fremde Lease gibt niemand zurueck", () => {
  /* Sonst hebt ein Lauf die Sperre eines anderen auf, und die Sperre
     waere keine. */
  const d = platz();
  try {
    orchestrator(d, "--lease-claim", "lauf-1");
    assert.match(orchestrator(d, "--lease-release", "lauf-2"), /FREMDE_LEASE/);
    assert.match(orchestrator(d, "--lease-claim", "lauf-2"), /Produktiv erlaubt: nein/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("RL13 · Die Lease setzt keine Zaehler zurueck (§38)", () => {
  /* Sie schreibt GENAU eine Datei. Was sonst im Datenverzeichnis
     stuende - Kandidaten, Kadenzzustand, Portfolio -, bleibt
     unberuehrt; hier wird das aufgezaehlt statt behauptet. */
  const d = platz();
  try {
    orchestrator(d, "--lease-claim", "lauf-1");
    assert.deepEqual(readdirSync(d), ["orchestrator-lease.json"]);
    orchestrator(d, "--lease-release", "lauf-1", "--produktiv");
    assert.deepEqual(readdirSync(d), ["orchestrator-lease.json"]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

/* ------------------------------------------------- Der Workflow */

test("RL14 · Die produktiven Schritte haengen an der Lease", () => {
  /* Eine Lease, an der nichts haengt, ist keine.

     Owner-Direktive "WEB-FIRST + FULL-POST-GENERATION" (24.09.): die
     Quant-getriebenen "CREATIVE JOB"-/"VORBEREITEN"-Schritte sind fuer
     JEDEN Modus stillgelegt (if: false) - `w.indexOf("- name: " +
     schritt)` faende sonst immer zuerst diese toten Schritte, deren
     if-Block die Lease-Bedingung nicht mehr traegt. Produktiv arbeiten
     jetzt nur noch die "(WEB)"-Schritte - an DEREN Lease-Bindung haengt
     die Aussage dieses Tests. */
  const w = readFileSync(join(ROOT, ".github/workflows/social-orchestrator.yml"), "utf8");
  assert.match(w, /--lease-claim/);
  assert.match(w, /--lease-release/);
  for (const schritt of ["WEB RESEARCH", "CREATIVE JOB (WEB)", "VORBEREITEN (WEB)"]) {
    const ab = w.indexOf("- name: " + schritt);
    assert.ok(ab > 0, "Schritt nicht gefunden: " + schritt);
    const block = w.slice(ab, ab + 400);
    assert.match(block, /steps\.lease\.outputs\.produktiv_erlaubt == 'true'/,
      schritt + " laeuft ohne Lease");
  }
  for (const schritt of ["CREATIVE JOB — Brief, Register, Request-PR (stillgelegt)",
    "VORBEREITEN — bis zum Publishing Gate, nicht darueber hinaus (stillgelegt)"]) {
    const ab = w.indexOf("- name: " + schritt);
    assert.ok(ab > 0, "Stillgelegter Schritt nicht gefunden: " + schritt);
    assert.match(w.slice(ab, ab + 200), /if:\s*false/,
      schritt + " muss fuer jeden Modus stillgelegt sein");
  }
  /* Und die Rueckgabe steht VOR dem Festschreiben - sonst ginge die
     beendete Lease nicht mit. */
  assert.ok(w.indexOf("--lease-release") < w.indexOf("- name: Festschreiben"));
});
