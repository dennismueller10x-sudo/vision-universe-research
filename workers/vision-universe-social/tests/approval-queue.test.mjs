/* =========================================================================
   vision-universe-social — DIE UEBERTRAGENE WARTESCHLANGE

   -------------------------------------------------------------------------
   ZWEI TORE AN EINEM GEGENSTAND
   -------------------------------------------------------------------------

   Dieselbe Schlange wird auf zwei Wegen angefasst, und die Wege duerfen
   sich nicht beruehren:

     POST /social/approval/queue   der Orchestrator legt ab.
                                   Admin-Schluessel, wie jeder
                                   maschinelle Endpunkt.

     GET  /approval                der Owner liest.
                                   Sitzungscookie, wie jede Seite im
                                   Approval Center.

   Ein Browser, der die Schlange ueberschreiben koennte, waere eine
   Oberflaeche, die ihre eigene Datengrundlage schreibt. Ein Skript, das
   sie ueber die Sitzung lesen koennte, waere ein zweiter Lesepfad. Beide
   Richtungen werden hier geprueft.

   -------------------------------------------------------------------------
   UND DIE FRAGE DAHINTER
   -------------------------------------------------------------------------

   Der Worker darf nicht wissen, was "wartet" bedeutet. Er speichert
   eine Antwort, die woanders berechnet wurde, und zeigt sie. Die
   Pruefung beim Ablegen ist deshalb keine Sicherheitsschranke - wer den
   Admin-Schluessel hat, ist ohnehin drin - sondern eine
   Herkunftsschranke: sie haelt fest, dass das Gezeigte aus der
   kanonischen Zustandsmaschine stammt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { __internals } from "../src/index.js";
import { createEnv, request, TEST_ADMIN_KEY } from "./harness.mjs";
import { QUEUE_KEY } from "../src/store.js";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const STUNDE = 60 * 60 * 1000;

/** Eine gueltige Projektion, wie sie publish-approval-queue.mjs sendet. */
function projektion(over = {}) {
  return Object.assign({
    version: __internals.QUEUE_VERSION,
    source: __internals.QUEUE_SOURCE,
    countedFiles: false,
    generatedAt: new Date().toISOString(),
    activeCount: 1,
    complete: true,
    items: [eintrag()],
    unresolved: [],
    held: [], decided: [], unknown: [], total: 1
  }, over);
}

function eintrag(over = {}) {
  return Object.assign({
    candidateId: "cand_20260920_4c7ee69c",
    state: "AWAITING_APPROVAL",
    contentHash: "b".repeat(64),
    payload: {
      contentId: "pkg_test",
      imageUrl: "https://research.visionuniverse.de/assets/social/pkg_test.jpg",
      caption: "Der Text, der hinausginge."
    },
    anzeige: {
      thema: { value: "Technisches Setup — XOM", basis: "presentation.topic" },
      hook: { value: "52 von 100 — und warum das keine Empfehlung ist.",
        basis: "presentation.hook" }
    },
    guete: { zustand: "BESTANDEN", score: 82, erklaerung: null, warnungen: [] },
    warum: {}
  }, over);
}

async function lege(env, p) {
  return worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(p)
  }), env);
}

async function anmelden(env) {
  const r = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY })
  }), env);
  return r.headers.get("set-cookie").split(";")[0];
}

/* ------------------------------------------------------ Die zwei Tore */

test("AQ1 · Ablegen verlangt den Admin-Schluessel", async () => {
  const env = createEnv();
  const ohne = await worker.fetch(request("/social/approval/queue", {
    method: "POST", body: JSON.stringify(projektion()) }), env);
  assert.equal(ohne.status, 401);
  assert.equal(await env.VU_SOCIAL_KV.get(QUEUE_KEY), null,
    "Eine abgewiesene Uebertragung darf nichts hinterlassen.");
});

test("AQ2 · Die Owner-Sitzung darf die Schlange NICHT ueberschreiben", async () => {
  /* Eine Oberflaeche, die ihre eigene Datengrundlage schreiben kann,
     hebt die Trennung auf, um derentwillen es die Projektion gibt. */
  const env = createEnv();
  const cookie = await anmelden(env);

  const versuch = await worker.fetch(request("/social/approval/queue", {
    method: "POST", headers: { cookie }, body: JSON.stringify(projektion()) }), env);
  assert.equal(versuch.status, 401);
  assert.equal(await env.VU_SOCIAL_KV.get(QUEUE_KEY), null);
});

test("AQ3 · Gelesen wird die Schlange hier nicht", async () => {
  const env = createEnv();
  await lege(env, projektion());
  const get = await worker.fetch(request("/social/approval/queue" + KEY), env);
  assert.equal(get.status, 405,
    "Ein zweiter Lesepfad waere eine zweite Oberflaeche.");
});

/* ------------------------------------------------- Die Herkunftsschranke */

test("AQ4 · Eine Schlange ohne die Unterschrift der Engine wird abgewiesen", async () => {
  const env = createEnv();

  const faelle = [
    ["wrongSource", { source: "selbst gezaehlt" }],
    ["wrongSource", { source: undefined }],
    ["unknownVersion", { version: "approval-projection-v2" }],
    ["countedFiles", { countedFiles: true }],
    ["countedFiles", { countedFiles: undefined }]
  ];
  for (const [grund, patch] of faelle) {
    const r = await lege(env, projektion(patch));
    const b = await r.json();
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.equal(b.error, grund, JSON.stringify(patch));
    assert.equal(b.stored, false);
  }
  assert.equal(await env.VU_SOCIAL_KV.get(QUEUE_KEY), null);
});

test("AQ5 · countedFiles ist genau der Fehler, der hier schon passiert ist", async () => {
  /* Ein Ordner ist keine Warteschlange. Die Engine schreibt das in ihre
     eigene Antwort; der Worker nimmt nichts an, das es anders sagt. */
  const env = createEnv();
  const r = await lege(env, projektion({ countedFiles: true }));
  assert.match((await r.json()).message, /Ordner ist keine Warteschlange/);
});

test("AQ6 · Ein Eintrag ohne Sendung ist nicht freigebbar", async () => {
  const env = createEnv();
  const faelle = [
    ["itemWithoutId", eintrag({ candidateId: null })],
    ["itemWithoutPayload", eintrag({ payload: undefined })],
    ["itemWithoutPayload", eintrag({ payload: { contentId: "x" } })],
    ["itemWithoutHash", eintrag({ contentHash: null })],
    ["itemWithoutHash", eintrag({ contentHash: "zu kurz" })],
    ["insecureImageUrl", eintrag({ payload: { contentId: "x",
      imageUrl: "http://research.visionuniverse.de/x.jpg", caption: "" } })],
    ["insecureImageUrl", eintrag({ payload: { contentId: "x",
      imageUrl: "data:image/png;base64,AAAA", caption: "" } })]
  ];
  for (const [grund, i] of faelle) {
    const r = await lege(env, projektion({ items: [i] }));
    assert.equal((await r.json()).error, grund, JSON.stringify(i).slice(0, 90));
  }
});

test("AQ7 · Derselbe Kandidat darf nicht zweimal in der Schlange stehen", async () => {
  /* Zwei Karten fuer einen Beitrag heissen: der Owner entscheidet
     zweimal ueber dasselbe, und die zweite Entscheidung trifft etwas,
     das es nicht mehr gibt. */
  const env = createEnv();
  const r = await lege(env, projektion({ items: [eintrag(), eintrag()], activeCount: 2 }));
  assert.equal((await r.json()).error, "duplicateItem");
});

test("AQ8 · Ohne Zeitpunkt laesst sich das Alter nicht sagen", async () => {
  const env = createEnv();
  for (const wert of [undefined, "", "neulich", 1758000000000]) {
    const r = await lege(env, projektion({ generatedAt: wert }));
    assert.equal((await r.json()).error, "badTimestamp", String(wert));
  }
});

test("AQ9 · Eine unsinnige Zahl ist keine Anzahl", async () => {
  const env = createEnv();
  for (const wert of [-1, 1.5, "1", null, undefined]) {
    const r = await lege(env, projektion({ activeCount: wert }));
    assert.equal((await r.json()).error, "badCount", String(wert));
  }
});

test("AQ10 · Eine Projektion, die zu gross ist, wird nicht angenommen", async () => {
  const env = createEnv();
  const riesig = projektion({
    items: [eintrag({ payload: { contentId: "x",
      imageUrl: "https://x.invalid/y.jpg", caption: "z".repeat(600 * 1024) } })]
  });
  const r = await lege(env, riesig);
  assert.equal(r.status, 413);
  assert.equal((await r.json()).stored, false);
});

/* --------------------------------------------- Unvollstaendig heisst nicht falsch */

test("AQ11 · Eine unvollstaendige Schlange wird angenommen und benannt", async () => {
  /* Sie abzulehnen hiesse, den aelteren Stand zu zeigen - der genauso
     unvollstaendig waere, nur ohne es zu sagen. */
  const env = createEnv();
  const r = await lege(env, projektion({
    activeCount: 2, complete: false,
    unresolved: [{ candidateId: "cand_weg", reason: "KANDIDAT_NICHT_GELESEN" }]
  }));
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.stored, true);
  assert.equal(b.complete, false);
  assert.equal(b.unresolved, 1);
  assert.equal(b.activeCount, 2, "Die Zahl bleibt die der Maschine.");
});

test("AQ12 · Der Worker rechnet nichts nach", async () => {
  const env = createEnv();
  const b = await (await lege(env, projektion({ activeCount: 9 }))).json();
  assert.equal(b.activeCount, 9,
    "Der Worker hat gezaehlt. Er darf nicht wissen, was 'wartet' bedeutet.");
  assert.equal(b.items, 1);
  assert.match(b.note, /owner-decision\.warteschlange/);
});

/* ------------------------------------------------------------ Das Lesen */

test("AQ13 · Keine Uebertragung ist nicht dasselbe wie keine Warteschlange", async () => {
  const env = createEnv();
  const cookie = await anmelden(env);
  const seite = await worker.fetch(request("/approval", { headers: { cookie } }), env);
  const html = await seite.text();

  assert.equal(seite.status, 200);
  assert.match(html, /Noch kein Stand/);
  assert.ok(!/wartet kein Beitrag/.test(html),
    "Blindheit als Ruhe anzuzeigen ist die bequemste Luege dieser Oberflaeche.");
});

test("AQ14 · Bei null wartenden steht genau der Satz, der dort stehen soll", async () => {
  const env = createEnv();
  await lege(env, projektion({ activeCount: 0, items: [],
    held: [{ candidateId: "a" }, { candidateId: "b" }, { candidateId: "c" }],
    decided: [{ candidateId: "d" }, { candidateId: "e" }, { candidateId: "f" }],
    total: 6 }));
  const cookie = await anmelden(env);
  const html = await (await worker.fetch(request("/approval", { headers: { cookie } }), env)).text();

  assert.match(html, /Aktuell wartet kein Beitrag auf deine Freigabe\./);
  /* Und der Bestand ist nicht weg, er wartet nur nicht. Sechs Dateien,
     null Wartende - der Unterschied, den einmal niemand sah. */
  assert.match(html, /3 entschieden oder abgeloest/);
  assert.match(html, /3 auf einem Haltegrund/);
});

test("AQ15 · Die gezeigte Zahl ist die der Maschine, nicht die der Karten", async () => {
  const env = createEnv();
  await lege(env, projektion({ activeCount: 3, complete: false,
    unresolved: [{ candidateId: "x", reason: "KANDIDAT_NICHT_GELESEN" },
                 { candidateId: "y", reason: "KANDIDAT_NICHT_GELESEN" }] }));
  const cookie = await anmelden(env);
  const html = await (await worker.fetch(request("/approval", { headers: { cookie } }), env)).text();

  assert.match(html, /3 Beitraege warten auf Freigabe\./);
  /* Und die Luecke wird benannt statt aufgeloest. */
  assert.match(html, /meldet 3/);
  assert.match(html, /uebertragen wurden 1/);
});

test("AQ16 · Ein alter Stand wird als alt gezeigt", async () => {
  const env = createEnv();
  await lege(env, projektion({
    generatedAt: new Date(Date.now() - 30 * STUNDE).toISOString() }));
  const cookie = await anmelden(env);
  const html = await (await worker.fetch(request("/approval", { headers: { cookie } }), env)).text();

  assert.match(html, /Stand: vor 1 Tag/);
  assert.match(html, /laenger her als ein Orchestratorlauf/);
});

test("AQ17 · Ein frischer Stand wird nicht als alt gezeigt", async () => {
  const env = createEnv();
  await lege(env, projektion());
  const cookie = await anmelden(env);
  const html = await (await worker.fetch(request("/approval", { headers: { cookie } }), env)).text();
  assert.ok(!/laenger her als ein Orchestratorlauf/.test(html));
});

/* ------------------------------------------------------------- §10 */

test("AQ18 · Ohne Sitzung kommt kein Wort des Beitrags heraus", async () => {
  /* Die scharfe Form der Anforderung: die Schlange ist VOLL, und ein
     Unangemeldeter darf davon nichts erfahren - nicht die Caption,
     nicht den Hook, nicht das Bild, nicht die Kennung, nicht die Zahl. */
  const env = createEnv();
  await lege(env, projektion());

  const geheim = ["Der Text, der hinausginge", "52 von 100",
    "cand_20260920_4c7ee69c", "pkg_test", "Technisches Setup"];

  for (const pfad of ["/approval", "/approval/cand_20260920_4c7ee69c",
    "/approval/queue", "/approval/session", "/health", "/"]) {
    const r = await worker.fetch(request(pfad), env);
    const text = await r.text();
    for (const wort of geheim) {
      assert.ok(!text.includes(wort),
        `${pfad} verraet "${wort}" ohne Anmeldung`);
    }
  }
});

test("AQ19 · Auch die blosse Anzahl ist eine Auskunft", async () => {
  const env = createEnv();
  await lege(env, projektion({ activeCount: 4 }));
  const html = await (await worker.fetch(request("/approval"), env)).text();
  assert.ok(!/\b4\b/.test(html.replace(/<style[\s\S]*?<\/style>/gi, "")),
    "Wie viel gerade ansteht, sagt etwas ueber den Betrieb.");
});

/* -------------------------------------------------------- Ohne Speicher */

test("AQ20 · Ohne KV wird nichts angenommen und nichts behauptet", async () => {
  const env = createEnv({ VU_SOCIAL_KV: undefined });
  const r = await lege(env, projektion());
  assert.equal(r.status, 503);
  assert.equal((await r.json()).stored, false);

  const cookie = await anmelden(env);
  const html = await (await worker.fetch(request("/approval", { headers: { cookie } }), env)).text();
  assert.match(html, /Noch kein Stand/,
    "Ohne Speicher wissen wir es nicht - und sagen nicht, dass nichts wartet.");
});
