/* =========================================================================
   VISION UNIVERSE SOCIAL — DIE ZWOELF BEDINGUNGEN (OD1–OD14)

   §49/§50.

   -------------------------------------------------------------------------
   DER FEHLER, DEN DIESE DATEI FESTHAELT
   -------------------------------------------------------------------------

   Der erste Lauf von order-d-done.mjs meldete zwei Bedingungen als
   ERFUELLT:

       + DEPLOYT        /approval/run antwortet mit 403
       + SMOKE          /social/status -> 403, /approval -> 403

   Im Koerper beider Antworten stand:

       "Host not in allowlist: social.visionuniverse.de."

   Das war der Egress-Proxy dieser Umgebung. Der Worker hatte die
   Anfragen nie gesehen. Der Bericht haette bestaetigt, dass eine
   Fassung deployt ist, die es vielleicht gar nicht gibt - und dass ein
   Smoke bestanden wurde, der nie stattfand.

   Es ist dieselbe Form wie das Owner-Tor in §45 und wie
   SCHEDULER_NEVER_PUBLISHES in §46: eine Antwort, die richtig aussah
   und von der falschen Stelle kam.

   Diese Datei haelt beide Haelften fest: dass eine Antwort ohne
   Worker-Nachweis nicht zaehlt, und dass UNGEPRUEFT nicht erfuellt
   heisst.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKRIPT = join(ROOT, "scripts/social/order-d-done.mjs");
const quelle = readFileSync(SKRIPT, "utf8");

function lauf(extra = []) {
  try {
    return execFileSync("node", [SKRIPT, "--json", ...extra],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) { return String(err.stdout || ""); }
}

const bericht = JSON.parse(lauf());
const nach = (id) => bericht.conditions.find((c) => c.id === id);

/* ------------------------------------------------- Der Zuschnitt */

test("OD1 · Zwoelf Bedingungen, jede mit ihrem Paragraphen", () => {
  assert.equal(bericht.conditions.length, 12);
  for (const c of bericht.conditions) {
    assert.match(c.ref, /^§/, c.id + " ohne Bezug auf den Auftrag");
    /* Kurz ist erlaubt - "gemessen: false (soll false)" sagt alles.
       Leer ist es nicht. */
    assert.ok(c.satz && c.satz.length > 10, c.id + " ohne Begruendung");
    assert.ok(!/^(ok|erfuellt|true)$/i.test(c.satz.trim()),
      c.id + " nennt nur ein Urteil, keine Begruendung");
  }
});

test("OD2 · Die drei Schalter des Auftrags sind darunter", () => {
  for (const id of ["GLOBAL_AUTOPUBLISH_AUS", "VU_SOCIAL_AUTOPUBLISH_AUS",
                    "MAX_OPEN_CREATIVE_JOBS_IST_1"]) {
    assert.ok(nach(id), id + " fehlt in der Definition of Done");
  }
});

test("OD3 · Drei Zustaende, und UNGEPRUEFT ist keiner davon 'erfuellt'", () => {
  const erlaubt = ["ERFUELLT", "NICHT_ERFUELLT", "UNGEPRUEFT"];
  for (const c of bericht.conditions) assert.ok(erlaubt.includes(c.zustand));
  const offen = bericht.conditions.filter((c) => c.zustand !== "ERFUELLT");
  assert.deepEqual(bericht.open.sort(), offen.map((c) => c.id).sort());
  assert.equal(bericht.ORDER_D_DONE, offen.length === 0);
});

/* ------------------------------- DER BEFUND: der Proxy, nicht der Worker */

test("OD4 · Eine Antwort ohne Worker-Nachweis ist keine Auskunft ueber ihn", () => {
  /* Aus dieser Umgebung heraus antwortet der Egress-Proxy mit 403.
     Genau dieser Fall hat zwei Bedingungen faelschlich auf ERFUELLT
     gesetzt. Er muss UNGEPRUEFT ergeben - und der Grund muss dastehen. */
  const d = nach("DEPLOYT");
  const s = nach("BETRIEBS_SMOKE_OHNE_VEROEFFENTLICHUNG");
  for (const c of [d, s]) {
    if (c.zustand === "ERFUELLT") {
      /* In einer Umgebung MIT Zugang ist ERFUELLT richtig. Dann muss
         aber belegt sein, dass die Antwort vom Worker kam. */
      /* Nicht das WORT "vom Worker" - die KENNUNG. Eine cf-ray-Kennung
         entsteht in Cloudflares Netz und laesst sich vom Satz her nicht
         erfinden. Ein Test, der auf die Formulierung prueft, haelt auch
         dann, wenn der Nachweis ausgebaut wurde: genau das ist bei der
         ersten Fassung dieses Tests passiert. */
      assert.match(c.satz, /cf-ray [0-9a-f]{6,}/,
        c.id + " meldet ERFUELLT ohne cf-ray-Kennung: " + c.satz);
    } else {
      assert.equal(c.zustand, "UNGEPRUEFT", c.id + ": " + c.satz);
      assert.match(c.satz, /nicht vom Worker|nicht erreichbar/,
        c.id + " nennt nicht, warum es ungeprueft ist");
    }
  }
});

test("OD5 · Der Worker-Nachweis haengt an cf-ray und server", () => {
  assert.match(quelle, /cf-ray/);
  assert.match(quelle, /server.*cloudflare|cloudflare.*server/s);
  assert.match(quelle, /if \(!ray && server !== "cloudflare"\)/,
    "Der Nachweis wird nicht verlangt, sondern nur erwaehnt");
});

test("OD6 · Ein Smoke, der nicht stattfand, ist kein bestandener", () => {
  assert.match(quelle.replace(/"\s*\+\s*\n?\s*"/g, ""),
    /Ein Smoke, der den Worker nie erreicht, ist kein bestandener/,
    "Der Satz, der diesen Fehler benennt, ist verschwunden");
});

/* --------------------------------------------- Die Bedingungen selbst */

test("OD7 · Ein leerer Tag ohne Suche ist UNEXPLAINED, mit Suche JUSTIFIED", () => {
  const c = nach("NO_POST_JUSTIFIED_MIT_NACHWEIS");
  assert.equal(c.zustand, "ERFUELLT", c.satz);
  assert.match(c.satz, /NO_POST_UNEXPLAINED/);
  assert.match(c.satz, /NO_POST_JUSTIFIED/);
  assert.match(c.satz, /verdrahtet: true/,
    "Gebaut und verdrahtet sind zwei verschiedene Aussagen: " + c.satz);
});

test("OD8 · Der Knopf startet die Datei, die auch der Zeitplan startet", () => {
  const c = nach("MANUELLER_LAUF_IST_DERSELBE_LAUF");
  assert.equal(c.zustand, "ERFUELLT", c.satz);
  assert.match(c.satz, /social-orchestrator\.yml/);
});

test("OD9 · Zwei produktive Laeufe gleichzeitig sind ausgeschlossen", () => {
  const c = nach("KEIN_ZWEITER_PRODUKTIVER_LAUF");
  assert.equal(c.zustand, "ERFUELLT", c.satz);
  /* Und zwar nicht dadurch, dass gar nichts mehr laeuft: der eigene
     Lauf und eine Lease aus der Zukunft duerfen weiterarbeiten. */
  assert.match(c.satz, /der eigene nicht \(true\)/, c.satz);
  assert.match(c.satz, /nicht fuer immer \(true\)/, c.satz);
  assert.match(c.satz, /haengen daran \(true\)/, c.satz);
});

test("OD10 · Das Lernen behauptet unter der Mindeststichprobe nichts", () => {
  const c = nach("FREQUENZLERNEN_OHNE_BEHAUPTUNG");
  assert.equal(c.zustand, "ERFUELLT", c.satz);
  assert.match(c.satz, /keine Empfehlung/);
  assert.match(c.satz, /nicht als Nullleistung/);
});

test("OD11 · Suiten und Isolation kommen aus dem Befund mit Stand", () => {
  for (const id of ["SUITEN_GRUEN", "TEST_PRODUKTIONS_ISOLATION"]) {
    const c = nach(id);
    if (c.zustand === "ERFUELLT") {
      assert.match(c.satz, /Stand [0-9a-f]{10}/,
        id + " nennt keinen Stand — dann gilt der Befund fuer nichts");
    } else {
      assert.match(c.satz, /Stand|Befund|sauber/, id + ": " + c.satz);
    }
  }
});

test("OD12 · Auf dem Zweig allein ist nichts integriert", () => {
  const c = nach("IN_MAIN_INTEGRIERT");
  /* Vor dem Merge NICHT_ERFUELLT, danach ERFUELLT. Beides ist richtig -
     falsch waere nur, es nicht zu messen. */
  assert.ok(["ERFUELLT", "NICHT_ERFUELLT", "UNGEPRUEFT"].includes(c.zustand));
  assert.match(c.satz, /main/);
});

/* ------------------------------------------------ Was es nicht tut */

test("OD13 · Das Skript veroeffentlicht nichts und stoesst nichts an", () => {
  assert.ok(!/method:\s*"POST"/.test(quelle),
    "Das Skript sendet eine POST-Anfrage");
  assert.ok(!/dispatches|\/social\/meta\/publish|\/approve\b/.test(quelle),
    "Das Skript ruft einen veroeffentlichenden oder anstossenden Weg");
  assert.ok(!/writeFileSync|appendFileSync|mkdirSync/.test(quelle),
    "Das Skript schreibt");
});

test("OD14 · Es rechnet nichts zum zweiten Mal", () => {
  /* Die Bedingungen holen ihre Antworten aus den bestehenden Engines
     und aus check-hard-invariants.mjs. Eine eigene Zweitrechnung fuer
     dieselbe Frage waere der Fehler, den dieses Projekt beim Namen
     nennt. */
  assert.match(quelle, /check-hard-invariants\.mjs/);
  assert.match(quelle, /hard-invariants\.js/);
  assert.ok(!/GLOBAL_AUTOPUBLISH.*kill-switch\.json/s.test(quelle),
    "Der Schalter wird hier ein zweites Mal gelesen statt gemessen zu werden");
});
