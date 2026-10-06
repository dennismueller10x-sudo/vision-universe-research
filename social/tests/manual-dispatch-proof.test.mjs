/* =========================================================================
   VISION UNIVERSE SOCIAL — DER NACHWEIS DES KNOPFDRUCKS (MD1–MD8)

   -------------------------------------------------------------------------
   WOGEGEN DIESE SUITE STEHT
   -------------------------------------------------------------------------

   Die beiden Antwortseiten des Workers heissen

       "Lauf angestossen"          und
       "Lauf nicht angestossen"

   Sie trennt EIN Wort in der Mitte. Ein Pruefer, der nach
   "angestossen" sucht, findet beide und meldet Erfolg, wenn der Lauf
   gescheitert ist — dieselbe Form wie ERFUELLT, das auch in
   NICHT_ERFUELLT steckt.

   Die erste Fassung dieses Kommentars behauptete, der eine Titel sei
   ein Teilstring des anderen. Das stimmt nicht, und die Gegenprobe hat
   es gezeigt: mit `includes` auf den GANZEN Titel fiel kein Test um,
   weil "Lauf nicht angestossen" den Satz "Lauf angestossen" gar nicht
   enthaelt. MD3 misst deshalb die Gefahr, die es wirklich gibt.

   -------------------------------------------------------------------------
   GEPRUEFT WIRD GEGEN DIE ECHTEN SEITEN
   -------------------------------------------------------------------------

   Der Server unten baut seine Antworten mit approval-ui.js — demselben
   Modul, das der Worker deployt. Keine nachgebaute Fixture: aendert
   sich der Wortlaut der Seite, faellt diese Suite mit ihm, statt
   weiter gegen eine Kopie zu pruefen, die es nicht mehr gibt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKRIPT = join(ROOT, "scripts/social/verify-manual-dispatch.mjs");
const quelle = readFileSync(SKRIPT, "utf8");

const UI = await import("../../workers/vision-universe-social/src/approval-ui.js");

/**
 * Ein Worker-Doppel, das GENAU die echten Seiten ausliefert.
 *
 * `drueckt` zaehlt die POSTs auf /approval/run — die Zahl ist der
 * eigentliche Messwert: ein Skript, das dreimal drueckt, waere kein
 * Nachweis, sondern ein Schaden.
 */
async function werkbank(antworten) {
  const zustand = { drueckt: 0, sitzungen: 0 };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/approval/session" && req.method === "POST") {
      zustand.sitzungen += 1;
      res.writeHead(303, {
        "set-cookie": "__Host-vu_social=abc123; Path=/; Secure; HttpOnly; SameSite=Strict",
        location: "/approval"
      });
      return res.end();
    }
    if (url.pathname === "/approval/run") {
      if (req.method !== "POST") {
        res.writeHead(405, { "content-type": "text/html" });
        return res.end("<!DOCTYPE html><title>Nicht erlaubt — Vision Universe® Social</title>");
      }
      zustand.drueckt += 1;
      const seite = await antworten(zustand.drueckt);
      const html = await seite.text();
      res.writeHead(seite.status, { "content-type": "text/html" });
      return res.end(html);
    }
    res.writeHead(404); res.end();
  });
  await new Promise((f) => server.listen(0, "127.0.0.1", f));
  zustand.url = "http://127.0.0.1:" + server.address().port;
  zustand.zu = () => new Promise((f) => server.close(f));
  return zustand;
}

function lauf(url, env = {}) {
  return new Promise((fertig) => {
    execFile("node", [SKRIPT, "--json", "--worker", url],
      { cwd: ROOT, env: Object.assign({}, process.env,
        { VU_SOCIAL_ADMIN_KEY: "k".repeat(64) }, env) },
      (err, stdout) => {
        let bericht = null;
        try { bericht = JSON.parse(stdout); } catch { bericht = null; }
        fertig({ code: err ? err.code : 0, bericht, stdout });
      });
  });
}

/* ------------------------------------------------- Der gute Fall */

test("MD1 · Ein Druck stoesst an, der zweite wird gesperrt", async () => {
  const w = await werkbank((n) => n === 1
    ? UI.laufAngestossenSeite({ angestossenAt: new Date().toISOString() })
    : UI.laufNichtMoeglichSeite({ grund: "SCHON_ANGESTOSSEN",
        wartenSekunden: 300, satz: "Der Lauf wurde gerade schon angestossen." }));
  const r = await lauf(w.url);
  await w.zu();

  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.bericht.DISPATCH_CREDENTIAL_PRESENT, true);
  assert.equal(r.bericht.DOUBLE_RUN_PROTECTED, true);
  assert.equal(r.bericht.MANUAL_ORCHESTRATOR_DISPATCH, "ANGESTOSSEN_UND_GESPERRT");
  assert.equal(r.bericht.FIRST_PRESS.titel, "Lauf angestossen");
  assert.equal(r.bericht.SECOND_PRESS.grund, "SCHON_ANGESTOSSEN");
});

test("MD2 · Genau zwei Druecke, nicht mehr", async () => {
  /* Der Zweite ist die Messung der Sperre. Ein dritter waere Schaden. */
  const w = await werkbank((n) => n === 1
    ? UI.laufAngestossenSeite({})
    : UI.laufNichtMoeglichSeite({ grund: "SCHON_ANGESTOSSEN", wartenSekunden: 300 }));
  await lauf(w.url);
  const zahl = w.drueckt;
  await w.zu();
  assert.equal(zahl, 2, "Es wurde " + zahl + "-mal gedrueckt.");
});

/* ------------------------------------- Die Falle im Titel (MD3/MD4) */

test("MD3 · 'Lauf nicht angestossen' gilt NICHT als angestossen", async () => {
  /* Der Kern dieser Suite. Ein Pruefer mit includes() faellt hier
     durch — und genau so einer stand hier beinahe. */
  const w = await werkbank(() => UI.laufNichtMoeglichSeite({
    grund: "DISPATCH_FEHLGESCHLAGEN", status: 403,
    satz: "Der Lauf liess sich nicht anstossen." }));
  const r = await lauf(w.url);
  const zahl = w.drueckt;
  await w.zu();

  assert.notEqual(r.code, 0);
  assert.equal(r.bericht.MANUAL_ORCHESTRATOR_DISPATCH, "NICHT_ANGESTOSSEN");
  assert.equal(r.bericht.FIRST_PRESS.titel, "Lauf nicht angestossen");
  assert.equal(r.bericht.FIRST_PRESS.grund, "DISPATCH_FEHLGESCHLAGEN");
  /* Und nach einem gescheiterten Anstoss wird NICHT noch einmal
     gedrueckt: es gibt keine Sperre zu messen. */
  assert.equal(zahl, 1, "Nach dem Scheitern wurde erneut gedrueckt.");
});

test("MD4 · Der Vergleich prueft den Titel, nicht das Wort darin", () => {
  /* Die Gegenprobe zu MD3 von der anderen Seite: im Quelltext darf
     kein Wortvergleich stehen. Allein traegt dieser Test nichts — MD3
     ist die Messung. */
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(ohneKommentare, /titel1 === TITEL_ANGESTOSSEN/);
  assert.match(ohneKommentare, /titel2 === TITEL_NICHT/);
  assert.doesNotMatch(ohneKommentare, /includes\(\s*["'/]angestossen/i);
});

/* ------------------------------------- Der fehlende Credential (MD5) */

test("MD5 · Fehlt das Secret, sagt der Bericht welcher Name — nie ein Wert", async () => {
  const w = await werkbank(() => UI.laufNichtMoeglichSeite({
    grund: "NICHT_EINGERICHTET",
    fehlend: ["VU_GITHUB_DISPATCH_TOKEN"],
    satz: "Der Lauf laesst sich von hier aus noch nicht anstossen." }));
  const r = await lauf(w.url);
  const zahl = w.drueckt;
  await w.zu();

  assert.notEqual(r.code, 0);
  assert.equal(r.bericht.DISPATCH_CREDENTIAL_PRESENT, false);
  assert.deepEqual(r.bericht.missing, ["VU_GITHUB_DISPATCH_TOKEN"]);
  assert.equal(zahl, 1, "Ohne Credential darf kein zweiter Druck folgen.");
});

test("MD6 · Ohne Admin-Schluessel wird gar nicht erst gedrueckt", async () => {
  const w = await werkbank(() => UI.laufAngestossenSeite({}));
  const r = await lauf(w.url, { VU_SOCIAL_ADMIN_KEY: "" });
  const zahl = w.drueckt;
  await w.zu();
  assert.equal(r.code, 4);
  assert.equal(zahl, 0);
  assert.equal(w.sitzungen, 0);
});

/* --------------------------------------------- Was es niemals tut */

test("MD7 · Das Skript veroeffentlicht nichts und entscheidet nichts", () => {
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(ohneKommentare, /\/approve|\/publish|\/reject/,
    "Ein Nachweis des Knopfes entscheidet nicht ueber Beitraege.");
  assert.doesNotMatch(ohneKommentare, /smoke-publish|meta\/publish/);
});

test("MD8 · Der Schluessel steht nirgends im Bericht", async () => {
  const w = await werkbank((n) => n === 1
    ? UI.laufAngestossenSeite({})
    : UI.laufNichtMoeglichSeite({ grund: "SCHON_ANGESTOSSEN", wartenSekunden: 300 }));
  const r = await lauf(w.url);
  await w.zu();
  const roh = JSON.stringify(r.bericht) + r.stdout;
  assert.ok(!roh.includes("k".repeat(64)),
    "Der Admin-Schluessel ist in die Ausgabe gelangt.");
  /* Und der Name des Worker-Secrets darf nur dort stehen, wo er
     fehlt — nicht im guten Fall. */
  assert.ok(!roh.includes("VU_GITHUB_DISPATCH_TOKEN"),
    "Im Erfolgsfall hat der Name des Secrets nichts im Bericht zu suchen.");
});

test("MD9 · Eine Sperre, die nicht sperrt, wird auch nicht gemeldet", async () => {
  /* Die Gegenprobe deckte auf, dass niemand diesen Fall pruefte: ein
     Worker, der auf den zweiten Druck NOCH EINMAL anstoesst. Ohne
     diesen Test konnte man DOUBLE_RUN_PROTECTED durch `true` ersetzen,
     und alles blieb gruen. */
  const w = await werkbank(() => UI.laufAngestossenSeite({}));
  const r = await lauf(w.url);
  const zahl = w.drueckt;
  await w.zu();

  assert.equal(zahl, 2, "Der zweite Druck ist die Messung und muss stattfinden.");
  assert.equal(r.bericht.DOUBLE_RUN_PROTECTED, false);
  assert.equal(r.bericht.MANUAL_ORCHESTRATOR_DISPATCH,
    "ANGESTOSSEN_SPERRE_UNGEPRUEFT");
  assert.notEqual(r.code, 0, "Eine offene Sperre darf nicht gruen enden.");
});

test("MD10 · Ein Wortvergleich statt des Titels faellt auf", async () => {
  /* MD3 sagt, was der Pruefer NICHT darf. Dieser sagt, woran man es
     merkt: die gescheiterte Seite traegt das Wort, aber nicht den
     Titel. Beides zusammen macht den Unterschied messbar. */
  const seite = await UI.laufNichtMoeglichSeite({
    grund: "DISPATCH_FEHLGESCHLAGEN", status: 403 }).text();
  const titel = seite.match(/<title>([\s\S]*?)<\/title>/)[1];
  assert.match(titel, /angestossen/, "Das Wort steht in beiden Titeln.");
  assert.ok(!titel.startsWith("Lauf angestossen —"),
    "Der Titel selbst unterscheidet sich — daran haengt die Pruefung.");
});
