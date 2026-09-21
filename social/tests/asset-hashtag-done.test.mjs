/* =========================================================================
   VISION UNIVERSE SOCIAL — DER BERICHT ZUM ASSET-/HASHTAG-AUFTRAG (AH1–AH12)

   §26/§27.

   -------------------------------------------------------------------------
   WOGEGEN DIESE DATEI STEHT
   -------------------------------------------------------------------------

   §26 in einem Satz: "Keine Faehigkeit als aktiv melden, nur weil Code
   existiert." Ein Bericht, der prueft, ob eine Datei da ist, besteht
   jede Pruefung und sagt nichts.

   Deshalb rechnet diese Suite die beiden Kernzahlen des Berichts
   UNABHAENGIG nach - aus derselben Quelle, aber auf eigenem Weg. Weicht
   der Bericht ab, faellt sie. Ein Bericht, den niemand nachrechnet, ist
   eine Erzaehlung mit Zahlen darin.

   Und sie haelt die Lehre aus OD4 fest: UNGEPRUEFT ist nicht erfuellt,
   und eine Antwort, die nicht vom Worker kam, ist keine Auskunft ueber
   ihn.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKRIPT = join(ROOT, "scripts/social/asset-hashtag-done.mjs");
const quelle = readFileSync(SKRIPT, "utf8");

const Hashtags = require(join(ROOT, "social/engines/hashtags.js"));

/* Ein Worker-Ziel, das sicher niemand beantwortet: der Bericht soll
   daraus UNGEPRUEFT machen und nicht "nicht live". */
function lauf(extra = ["--worker", "http://127.0.0.1:9"]) {
  try {
    return execFileSync("node", [SKRIPT, "--json", ...extra],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) { return String(err.stdout || ""); }
}

const bericht = JSON.parse(lauf());
const zustand = (id) => bericht.states.find((s) => s.id === id);
const bedingung = (id) => bericht.conditions.find((c) => c.id === id);

/* ------------------------------------------------------ Der Zuschnitt */

test("AH1 · Die fuenfzehn Zustaende aus §26, keiner fehlt", () => {
  const SOLL = [
    "APPROVAL_CENTER_LIVE", "CURRENT_CANDIDATE", "ASSET_PUBLICLY_REACHABLE",
    "ASSET_PREVIEW_EQUALS_PUBLISH_ASSET", "HASHTAG_ENGINE_READY",
    "HASHTAG_COUNT_CURRENT_CANDIDATE", "FINAL_PUBLIC_TEXT_READY",
    "ACTIVE_APPROVAL_QUEUE_COUNT", "MANUAL_ORCHESTRATOR_RUN",
    "CONTENT_FALLBACK_LADDER_READY", "MAX_OPEN_CREATIVE_JOBS",
    "OWNER_PUBLISHING_GATE", "GLOBAL_AUTOPUBLISH", "VU_SOCIAL_AUTOPUBLISH",
    "CRITICAL_BLOCKERS"
  ];
  for (const id of SOLL) {
    assert.ok(zustand(id), "Der Bericht meldet " + id + " nicht.");
  }
  assert.equal(bericht.states.length, SOLL.length);
  /* Jeder Zustand traegt einen WERT und einen Satz. Eine Zeile ohne
     beides ist eine Ueberschrift, keine Messung. */
  for (const s of bericht.states) {
    assert.ok(typeof s.wert === "string" && s.wert.length, s.id + " ohne Wert");
    assert.ok(typeof s.satz === "string" && s.satz.trim().length,
      s.id + " ohne Satz");
  }
});

test("AH2 · Dreizehn Bedingungen, jede mit ihrem Paragraphen", () => {
  assert.equal(bericht.conditions.length, 13);
  for (const c of bericht.conditions) {
    assert.match(String(c.ref), /^§/, c.id + " ohne Bezug auf den Auftrag");
    assert.ok(c.satz && c.satz.trim().length, c.id + " ohne Satz");
  }
});

test("AH3 · Drei Zustaende, und UNGEPRUEFT ist keiner davon erfuellt", () => {
  const erlaubt = ["ERFUELLT", "NICHT_ERFUELLT", "UNGEPRUEFT"];
  for (const c of bericht.conditions) assert.ok(erlaubt.includes(c.zustand));

  const offen = bericht.conditions.filter((c) => c.zustand !== "ERFUELLT");
  if (offen.length) {
    assert.equal(bericht.ORDER_DONE, false,
      "Offene Bedingungen und trotzdem fertig: " +
        offen.map((c) => c.id).join(", "));
  }
});

test("AH4 · Ein unerreichbarer Worker heisst UNGEPRUEFT, nicht 'nicht live'", () => {
  /* Die Lehre aus §45/§49: ein 403 des Egress-Proxy sieht aus wie ein
     403 des Dienstes. Wer das verwechselt, verurteilt etwas, das er
     nie gesehen hat. */
  const live = zustand("APPROVAL_CENTER_LIVE");
  assert.equal(live.zustand, "UNGEPRUEFT");
  assert.equal(live.wert, "UNGEPRUEFT");
  assert.match(live.satz, /nicht erreichbar|nicht vom Worker/);

  const smoke = bedingung("PRODUCTION_SMOKE_OHNE_VEROEFFENTLICHUNG");
  assert.equal(smoke.zustand, "UNGEPRUEFT");
  assert.match(smoke.satz, /nicht stattgefunden|keiner/);
});

test("AH5 · Der Worker-Nachweis haengt an cf-ray und server", () => {
  assert.match(quelle, /cf-ray/,
    "Ohne diese Kennung ist jede Antwort nur eine Antwort von irgendwem.");
  assert.match(quelle, /server.*cloudflare|cloudflare/);
});

/* ------------------------------------------- Die Zahlen, nachgerechnet */

test("AH6 · Die Tagbreite ist gerechnet, nicht behauptet", () => {
  /* Unabhaengig nachgerechnet: aus demselben Themenbestand, auf
     eigenem Weg. Ein Bericht, der hier eine andere Zahl nennt, hat
     etwas anderes gemessen als er sagt. */
  const slate = JSON.parse(readFileSync(
    join(ROOT, "social/data/opportunity-slate.json"), "utf8"));
  const mengen = new Set();
  let maximal = 0;
  for (const t of slate.topics || []) {
    const tags = (Hashtags.ableiten({
      topic: t.title || t.topicId, entities: t.entities || [],
      entityType: t.entityType || null, family: t.family || null,
      question: t.question || null }) || {}).hashtags || [];
    maximal = Math.max(maximal, tags.length);
    mengen.add(tags.join(" "));
  }

  const b = zustand("HASHTAG_ENGINE_READY");
  assert.match(b.satz, new RegExp("\\b" + (slate.topics || []).length + " Themen"));
  assert.match(b.satz, new RegExp("\\b" + mengen.size + " verschiedene"));
  assert.match(b.satz, new RegExp("hoechstens " + maximal + " Tags"));

  /* Und die Aussage selbst: mehr als eine Tagmenge ueber den Bestand.
     Eine Engine, die unter jeden Beitrag dieselben fuenf schreibt,
     bestuende jede Existenzpruefung (§10). */
  assert.ok(mengen.size > 1,
    "Alle Themen bekommen dieselben Tags — das ist eine Signatur, " +
    "keine Hashtag-Engine.");
  assert.ok(maximal <= Hashtags.MAX_HASHTAGS);
});

test("AH7 · Die Warteschlangenzahl stammt aus der kanonischen Maschine", () => {
  const z = zustand("ACTIVE_APPROVAL_QUEUE_COUNT");
  assert.match(z.satz, /owner-decision\.warteschlange/);
  assert.match(z.satz, /nicht aus dem Ordner/);
  assert.match(z.wert, /^\d+$/);
});

test("AH8 · Vorschau gleich Sendung — unabhaengig nachgerendert", async () => {
  /* Die Gegenprobe zeigte, dass die erste Fassung dieses Tests nur
     nachsah, ob "candidatePage" im Quelltext vorkommt. Das ueberlebt
     jede Faelschung der Messung.

     Jetzt wird dieselbe Karte hier noch einmal gerendert - mit
     demselben Code, den der Worker deployt - und das Ergebnis gegen
     das gehalten, was der Bericht meldet. */
  const id = zustand("CURRENT_CANDIDATE").wert;
  const gemeldet = zustand("ASSET_PREVIEW_EQUALS_PUBLISH_ASSET").wert;

  if (id === "KEINER") {
    assert.equal(gemeldet, "NICHT_ANWENDBAR");
    return;
  }

  const datei = join(ROOT, "social/data/publish-candidates", id + ".json");
  assert.ok(existsSync(datei), "Der gemeldete Kandidat " + id + " liegt nicht vor.");
  const k = JSON.parse(readFileSync(datei, "utf8"));

  const Projektion = require(join(ROOT, "social/engines/approval-projection.js"));
  const { candidatePage } = await import(
    "../../workers/vision-universe-social/src/approval-ui.js");

  const html = await candidatePage(Projektion.eintrag(k),
    { nummer: 1, von: 1 }, null).text();
  const bilder = html.match(/<img[^>]+src="([^"]*)"/g) || [];
  const src = String((html.match(/<img[^>]+src="([^"]*)"/) || [])[1] || "")
    .replace(/&amp;/g, "&");

  const selbstGemessen = bilder.length === 1 &&
    src === k.content.imageUrl && !/^data:/.test(src);

  assert.equal(gemeldet, selbstGemessen ? "true" : "false",
    "Der Bericht meldet " + gemeldet + "; nachgerendert ergibt sich " +
    selbstGemessen + " (" + bilder.length + " Bild(er), src=" +
    src.slice(0, 70) + ").");
  /* Und die Zusage selbst, nicht nur die Uebereinstimmung. */
  assert.equal(bilder.length, 1, "Zwei Bilder lassen offen, welches gemeint ist.");
  assert.equal(src, k.content.imageUrl);
});

test("AH9 · CRITICAL_BLOCKERS zaehlt Gemessenes, nicht Ungeprueftes", () => {
  const z = zustand("CRITICAL_BLOCKERS");
  const gemessenOffen = bericht.conditions
    .filter((c) => c.zustand === "NICHT_ERFUELLT").map((c) => c.id);
  assert.equal(z.wert, String(gemessenOffen.length));
  assert.deepEqual(bericht.blockers, gemessenOffen);
  /* Aber ungeprueft verschwindet nicht: es steht getrennt da und
     haelt ORDER_DONE unten. */
  const ungeprueft = bericht.conditions
    .filter((c) => c.zustand === "UNGEPRUEFT").map((c) => c.id);
  assert.deepEqual(bericht.unverified, ungeprueft);
  if (ungeprueft.length) assert.equal(bericht.ORDER_DONE, false);
});

test("AH10 · Null Blocker allein macht den Auftrag nicht fertig", () => {
  /* Der Fall, in dem ein Bericht am liebsten luegen wuerde: nichts
     ist nachweislich kaputt, aber die Haelfte wurde nie gemessen. */
  assert.match(quelle,
    /fertig\s*=\s*blocker\.length === 0 && ungeprueft\.length === 0/,
    "ORDER_DONE darf nicht allein an den gemessenen Fehlern haengen.");
});

/* ------------------------------------------------- Was es NICHT tut */

test("AH11 · Der Bericht veroeffentlicht nichts und stoesst nichts an", () => {
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(ohneKommentare, /method:\s*["']POST["']/,
    "Ein Bericht schreibt nicht.");
  assert.doesNotMatch(ohneKommentare, /\/approval\/[^"'\s]*\/(approve|publish)/);
  assert.doesNotMatch(ohneKommentare, /workflow_dispatch|actions_run_trigger/);
  assert.doesNotMatch(ohneKommentare, /render-asset|request-creative/,
    "Es erzeugt kein Bild und verbraucht kein Work-Budget.");
});

test("AH12 · Er rechnet die Schlange nicht zum zweiten Mal", () => {
  /* Zwei Rechenwege fuer denselben Stand waeren zwei Staende. Der
     Bericht baut die Projektion EINMAL und liest alles daraus. */
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((ohneKommentare.match(/await baue\(/g) || []).length, 1);
  assert.match(ohneKommentare, /projektion\.activeCount/);
});

test("AH13 · Der Vergleich mit main holt main, statt ihn vorauszusetzen", () => {
  /* In einem CI-Checkout (fetch-depth 1, ein Zweig) gibt es
     `origin/main` erst nach einem fetch. Die erste Fassung fragte in
     zwei Bedingungen ohne fetch und meldete UNGEPRUEFT — eine Grenze,
     die es nicht gab.

     Gemessen wird am Ergebnis: die drei Bedingungen, die gegen main
     vergleichen, duerfen hier nicht an "origin/main nicht
     feststellbar" scheitern. */
  for (const id of ["CONTENT_FALLBACK_LADDER_UNCHANGED",
                    "MANUAL_ORCHESTRATOR_RUN_UNCHANGED",
                    "IN_MAIN_INTEGRIERT"]) {
    const c = bedingung(id);
    assert.ok(c, "Der Bericht meldet " + id + " nicht.");
    assert.doesNotMatch(c.satz, /nicht feststellbar/,
      id + " hat main nicht geholt: " + c.satz);
  }
  /* Und genau EINMAL geholt: drei fetches je Lauf waeren dreimal
     dieselbe Frage ans Netz. */
  const ohneKommentare = quelle
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal((ohneKommentare.match(/git\("fetch"/g) || []).length, 1);
});

test("AH14 · Ohne --out schreibt der Bericht nichts (§23)", () => {
  /* Die eigene Suite ruft dieses Skript auf. Schriebe es dabei nach
     social/data, veraenderte ein Testlauf Produktionsdaten — genau
     das, was §23 verbietet und was check-test-isolation misst.

     Gemessen am Ergebnis: der Lauf oben (ohne --out) lief bereits,
     und danach darf sich keine Datei geaendert haben. */
  const stand = execFileSync("git",
    ["status", "--porcelain", "--", "social/data", "assets/social"],
    { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(stand, "",
    "Der Bericht hat beim Lesen Produktionsdaten veraendert:\n" + stand);
});

test("AH15 · Mit --out schreibt er genau dorthin — und sonst nirgends", () => {
  const ziel = join(ROOT, "tmp", "ah15", "stand.json");
  lauf(["--worker", "http://127.0.0.1:9", "--out", ziel]);
  assert.ok(existsSync(ziel), "Nichts geschrieben, obwohl --out gesetzt war.");

  const b = JSON.parse(readFileSync(ziel, "utf8"));
  assert.equal(b.states.length, 15);
  assert.equal(b.conditions.length, 13);
  assert.equal(typeof b.commit, "string");
  assert.ok(Array.isArray(b.blockers) && Array.isArray(b.unverified));

  const stand = execFileSync("git",
    ["status", "--porcelain", "--", "social/data", "assets/social"],
    { cwd: ROOT, encoding: "utf8" }).trim();
  assert.equal(stand, "", "Auch mit --out darf nichts anderes wandern:\n" + stand);
});
