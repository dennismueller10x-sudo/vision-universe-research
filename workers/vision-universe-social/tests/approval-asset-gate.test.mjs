/* =========================================================================
   vision-universe-social — DIE FREIGABESPERRE UND DIE HASHTAGS (§6/§15–§17)

   -------------------------------------------------------------------------
   WOGEGEN DIESE SUITE STEHT
   -------------------------------------------------------------------------

   Der Owner sah ein Approval Center mit einem leeren Bildrahmen und
   einem Knopf "Freigeben" darunter. Beides zusammen ist die
   gefaehrlichste Kombination, die diese Oberflaeche kennt: freigeben,
   was man nicht gesehen hat.

   Die Sperre hier ist NICHT die Deaktivierung eines Knopfes. Ein
   fehlender Knopf ist Kosmetik - ein abgeschicktes Formular kommt
   trotzdem an. Die Sperre sitzt im Server, in pruefeFreigabe, und die
   Oberflaeche zeigt sie nur an. Beide Seiten werden hier getrennt
   geprueft, und die Serverseite wird mit einem Formular geprueft, das
   die Oberflaeche nie ausgeliefert hat.

   -------------------------------------------------------------------------
   UNGEPRUEFT IST NICHT IN ORDNUNG
   -------------------------------------------------------------------------

   Ein Eintrag OHNE Messung ist gesperrt. Das ist der teurere Weg -
   eine aeltere Uebertragung sperrt sich damit selbst - und der
   richtige: "niemand hat nachgesehen" ist kein Nachweis, dass etwas
   da ist.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import worker, { __internals } from "../src/index.js";
import { createEnv, request, TEST_ADMIN_KEY , JPEG_SHA256} from "./harness.mjs";
import { contentHash } from "../src/redact.js";
import { finalerText } from "../src/public-text.js";
import { QUEUE_KEY, readDecision } from "../src/store.js";

const KEY = "?key=" + encodeURIComponent(TEST_ADMIN_KEY);
const ID = "cand_20260920_247c5e70";
const INHALT = "pkg_ca25cb404ae49dc4";
const BILD = "https://research.visionuniverse.de/assets/social/pkg_ca25cb404ae49dc4.jpg";

const BASIS = "Technical Opportunity Score, Stand heute: Exxon Mobil bei 52.\n\n" +
  "Der Wert beschreibt die Lage — nicht ihre Ursache. Keine Anlageberatung.";
const TAGS = ["#ExxonMobil", "#Aktienanalyse", "#Energie"];
const CAPTION = finalerText(BASIS, TAGS);

const ERREICHBAR = {
  zustand: "ASSET_PUBLICLY_REACHABLE", grund: null, erreichbar: true, url: BILD,
  satz: "Das Bild liegt unter genau dieser Adresse und ist abrufbar.",
  gemessenAm: "2026-09-21T10:00:00Z",
      sha256: JPEG_SHA256, dimensions: { width: 1080, height: 1350 }
};
const WEG = {
  zustand: "ASSET_NOT_REACHABLE", grund: "HTTP_404", erreichbar: false, url: BILD,
  satz: "Unter dieser Adresse liegt kein Bild.",
  gemessenAm: "2026-09-21T10:00:00Z",
      sha256: JPEG_SHA256, dimensions: { width: 1080, height: 1350 }
};
const UNGEPRUEFT = {
  zustand: "ASSET_REACHABILITY_UNVERIFIED", grund: "NOT_ASKED", erreichbar: false, url: BILD,
  satz: "Ob das Bild erreichbar ist, wurde zu dieser Uebertragung nicht gemessen.",
  gemessenAm: null
};

async function eintrag(over = {}) {
  const payload = Object.assign(
    { contentId: INHALT, imageUrl: BILD, caption: CAPTION }, over.payload || {});
  return Object.assign({
    candidateId: ID,
    state: "AWAITING_APPROVAL",
    contentHash: await contentHash(payload),
    payload,
    text: { captionBase: BASIS, hashtags: TAGS.slice(),
      hashtagSatz: "Drei Tags: Unternehmen, Inhaltsart, Sektor." },
    asset: ERREICHBAR,
    anzeige: { thema: { value: "Technisches Setup — XOM", basis: "presentation.topic" },
      hook: { value: "52 von 100.", basis: "presentation.hook" } },
    guete: { zustand: "BESTANDEN", score: 82, erklaerung: null, warnungen: [] },
    warum: {}
  }, Object.assign({}, over, { payload: undefined }), { payload });
}

function projektion(items) {
  return {
    version: __internals.QUEUE_VERSION, source: __internals.QUEUE_SOURCE,
    countedFiles: false, generatedAt: new Date().toISOString(),
    activeCount: items.length, complete: true,
    items, unresolved: [], held: [], decided: [], unknown: [], total: items.length
  };
}

/** Schlange ablegen, anmelden. Gibt env und Sitzungskeks zurueck. */
async function aufbauen(p) {
  const env = createEnv();
  const abgelegt = await worker.fetch(request("/social/approval/queue" + KEY, {
    method: "POST", body: JSON.stringify(p) }), env);
  const s = await worker.fetch(request("/approval/session", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ adminKey: TEST_ADMIN_KEY }) }), env);
  return { env, abgelegt, cookie: s.headers.get("set-cookie").split(";")[0] };
}

async function karte(p) {
  const { env, cookie, abgelegt } = await aufbauen(p);
  assert.equal(abgelegt.status, 200, "Der Aufbau selbst muss stimmen.");
  const r = await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env);
  return { status: r.status, html: await r.text(), env, cookie };
}

/** Ein Formular abschicken - auch eines, das die Seite nie zeigte. */
async function tun(env, cookie, pfad, felder) {
  const body = new URLSearchParams(felder).toString();
  return await worker.fetch(request(pfad, {
    method: "POST", headers: { cookie,
      "content-type": "application/x-www-form-urlencoded" }, body }), env);
}

/** Der Inhalt genau eines Absatzes — entschaerft, aber ungekuerzt. */
function absatz(html, klasse) {
  const m = html.match(new RegExp('<p class="' + klasse + '">([\\s\\S]*?)</p>'));
  if (!m) return null;
  return m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function text(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

/* ===================================================== Die Sperre im Server */

test("AG1 · Ein erreichbares Bild laesst die Freigabe zu", async () => {
  /* Die Gegenprobe zu allem, was folgt. Ohne sie koennte die Sperre
     aus einem beliebigen anderen Grund halten. */
  const e = await eintrag();
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  assert.equal(r.status, 200);
  assert.match(text(await r.text()), /Wirklich veroeffentlichen/);
});

test("AG2 · Ein verschwundenes Bild sperrt die Freigabe — im Server", async () => {
  const e = await eintrag({ asset: WEG });
  const { env, cookie } = await aufbauen(projektion([e]));
  /* Das Formular, das die Seite NICHT ausliefert. Wer den Knopf nur
     ausblendet, faellt hier durch. */
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  const t = text(await r.text());
  assert.notEqual(r.status, 200);
  assert.doesNotMatch(t, /Wirklich veroeffentlichen/);
  assert.match(t, /Bild/);
});

test("AG3 · Auch der Sendeknopf ist gesperrt, nicht nur die Rueckfrage", async () => {
  /* /publish ist der Schritt, der tatsaechlich hinausgeht. Eine Sperre
     nur auf /approve waere ein Tor neben dem Weg.

     Gemessen wird an der EINGETRAGENEN ENTSCHEIDUNG und nicht daran,
     dass die Antwort kein Erfolg ist: ohne Meta-Verbindung scheitert
     dieser Weg ohnehin, und ein Pruefer, der davon lebt, haelt auch
     dann noch, wenn das Tor weg ist. Genau das hat die Gegenprobe
     gezeigt. handlePublishDecision traegt die Entscheidung VOR dem
     Senden ein — wer bis dorthin kommt, hat das Tor passiert. */
  const gesperrt = await eintrag({ asset: WEG });
  const a = await aufbauen(projektion([gesperrt]));
  const r = await tun(a.env, a.cookie, "/approval/" + ID + "/publish",
    { fingerprint: gesperrt.contentHash });
  assert.notEqual(r.status, 200);
  assert.doesNotMatch(text(await r.text()), /Veroeffentlicht\./);
  assert.equal(await readDecision(a.env, ID), null,
    "Der Weg wurde betreten: eine Entscheidung steht im Briefkasten.");

  /* Die Gegenprobe im selben Test: mit erreichbarem Bild kommt
     derselbe Aufruf bis zum Eintrag. Ohne sie bewiese der erste Teil
     nur, dass irgendetwas nicht klappt. */
  const frei = await eintrag();
  const b = await aufbauen(projektion([frei]));
  await tun(b.env, b.cookie, "/approval/" + ID + "/publish",
    { fingerprint: frei.contentHash });
  const d = await readDecision(b.env, ID);
  assert.ok(d && d.decision === "APPROVED",
    "Ohne Sperre muesste der Weg bis zum Eintrag fuehren — sonst misst AG3 nichts.");
});

test("AG4 · Ohne Messung ist gesperrt — und das steht auch so da", async () => {
  const e = await eintrag({ asset: UNGEPRUEFT });
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  const t = text(await r.text());
  assert.notEqual(r.status, 200);
  /* Und NICHT "nicht erreichbar": das waere eine Messung, die es nicht
     gab. Ein Transportbefund darf nie zu einer Aussage ueber das Bild
     werden (§5). */
  assert.match(t, /nicht geprueft/);
  assert.doesNotMatch(t, /ist derzeit nicht erreichbar/);
});

test("AG5 · Ein Eintrag ganz ohne Bildzustand ist gesperrt", async () => {
  /* Eine aeltere Uebertragung kennt das Feld nicht. Sie wird
     angenommen - und sperrt sich selbst. Fehlend darf nie als
     bestanden durchgehen. */
  const e = await eintrag();
  delete e.asset;
  const { env, cookie, abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 200, "Fehlend ist kein Formfehler der Schlange.");
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  assert.notEqual(r.status, 200);
  assert.match(text(await r.text()), /nicht geprueft/);
});

test("AG6 · Ablehnen bleibt moeglich, wenn das Bild fehlt", async () => {
  /* Sonst waere ein Kandidat mit totem Bild unentscheidbar und bliebe
     fuer immer in der Schlange stehen. Die Sperre gilt dem
     Veroeffentlichen, nicht dem Owner. */
  const e = await eintrag({ asset: WEG });
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/reject",
    { fingerprint: e.contentHash, reason: "Das Bild passt nicht zum Thema." });
  assert.equal(r.status, 200);
  assert.match(text(await r.text()), /Abgelehnt/);
});

/* ==================================================== Die Sperre auf der Karte */

test("AG7 · Bei erreichbarem Bild traegt die Karte den Freigabeknopf", async () => {
  const { html } = await karte(projektion([await eintrag()]));
  assert.match(html, /action="\/approval\/[^"]+\/approve"/);
  assert.match(html, /<button type="submit">Freigeben<\/button>/);
});

test("AG8 · Bei fehlendem Bild traegt die Karte kein Freigabeformular", async () => {
  const { html } = await karte(projektion([await eintrag({ asset: WEG })]));
  assert.doesNotMatch(html, /action="\/approval\/[^"]+\/approve"/,
    "Ein Knopf, der nicht funktioniert, gehoert nicht auf die Seite.");
  /* Der Ablehnungsweg bleibt. */
  assert.match(html, /action="\/approval\/[^"]+\/reject"/);
  const t = text(html);
  assert.match(t, /Das Bild ist derzeit nicht erreichbar/);
  assert.match(t, /kann noch nicht freigegeben werden/);
  /* §5: kein Urteil ueber Thema, Text oder Visual-Strategie. */
  assert.match(t, /Am Beitrag liegt es nicht/);
});

test("AG9 · Die Karte nennt dem Owner keine Fehlercodes", async () => {
  const { html } = await karte(projektion([await eintrag({ asset: WEG })]));
  assert.doesNotMatch(html, /HTTP_404|ASSET_NOT_REACHABLE|NOT_ASKED/,
    "Ein Code ist eine Auskunft fuer den, der repariert — nicht fuer den, " +
    "der entscheidet.");
});

test("AG10 · Das Bild bleibt das echte Bild, auch wenn es tot ist", async () => {
  /* §3: kein Ersatzbild, kein Platzhalter. Der leere Rahmen ist die
     ehrliche Anzeige — der Satz darunter erklaert ihn. */
  const { html } = await karte(projektion([await eintrag({ asset: WEG })]));
  const src = (html.match(/<img[^>]+src="([^"]+)"/) || [])[1];
  assert.equal(src, BILD);
  assert.equal((html.match(/<img /g) || []).length, 1);
});

/* ======================================================= Hashtags (§15–§17) */

test("AG11 · Die Hashtags stehen VOR der Freigabe auf der Karte", async () => {
  /* Geprueft wird der EIGENE Block, nicht "die Zeichenfolge kommt
     irgendwo vor". Die Tags stehen ohnehin im Sendetext; wer nur
     danach sucht, prueft, dass die Caption gedruckt wird, und faellt
     nicht um, wenn der Block verschwindet. Die Gegenprobe hat genau
     das gezeigt. */
  const { html } = await karte(projektion([await eintrag()]));
  assert.match(html, /<h2>Hashtags<\/h2>/);
  assert.equal(absatz(html, "tags"), TAGS.join(" "));
});

test("AG12 · Der gezeigte Text IST der Text, der hinausginge", async () => {
  /* Zeichen fuer Zeichen, in EINEM Absatz — nicht "alle Bestandteile
     kommen auf der Seite vor". Die Gegenprobe: zeigt die Karte den
     Basistext statt der Zusammensetzung, faellt dieser Test. Mit der
     zeilenweisen Suche fiel er nicht, weil der Tagblock die fehlende
     Zeile nachlieferte. */
  const { html } = await karte(projektion([await eintrag()]));
  assert.equal(absatz(html, "caption"), CAPTION);
  /* Und die Zusammensetzung stimmt mit der kanonischen Regel ueberein. */
  assert.equal(CAPTION, finalerText(BASIS, TAGS));
});

test("AG13 · Null Tags sind ein Ergebnis mit Begruendung, kein leeres Feld", async () => {
  const basis = "Ein Beitrag ohne passende Tags.";
  const e = await eintrag({
    payload: { contentId: INHALT, imageUrl: BILD, caption: basis },
    text: { captionBase: basis, hashtags: [],
      hashtagSatz: "Kein Tag war belegbar; lieber keiner als einer, der nicht passt." }
  });
  const { html } = await karte(projektion([e]));
  const t = text(html);
  assert.match(t, /Hashtags/);
  assert.match(t, /lieber keiner als einer, der nicht passt/);
});

test("AG14 · Eine Tagliste, die sich nicht zurueckrechnen laesst, wird gesagt", async () => {
  /* Die Karte zeigt zwei Dinge nebeneinander und behauptet damit, dass
     sie zusammengehoeren. Stimmt das nicht, sagt sie es — statt eine
     Aufteilung zu zeigen, die es nie gab. Die Schlange selbst weist
     diesen Fall zurueck (AG16); hier wird die Anzeige geprueft, falls
     er doch je durchkaeme. */
  const e = await eintrag();
  e.text = { captionBase: BASIS, hashtags: ["#EtwasGanzAnderes"], hashtagSatz: null };
  /* Am Ingest vorbei — der weist genau das zurueck (AG16). Geprueft
     wird hier die zweite Verteidigungslinie: die Anzeige. */
  const { env, cookie } = await aufbauen(projektion([await eintrag()]));
  await env.VU_SOCIAL_KV.put(QUEUE_KEY, JSON.stringify(projektion([e])));
  const r = await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env);
  const t = text(await r.text());
  assert.match(t, /laesst sich nicht aus dem Text oben zurueckrechnen/);
});

/* ================================= Die Schlange rechnet die Zusammensetzung nach */

test("AG15 · Eine stimmige Zusammensetzung wird angenommen", async () => {
  const { abgelegt } = await aufbauen(projektion([await eintrag()]));
  assert.equal(abgelegt.status, 200);
});

test("AG16 · Text plus Tags muss den Sendetext ergeben, sonst kommt nichts an", async () => {
  const e = await eintrag();
  e.text = { captionBase: BASIS, hashtags: ["#EtwasGanzAnderes"], hashtagSatz: null };
  const { abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 400);
  const b = await abgelegt.json();
  assert.equal(b.error, "textDoesNotComposePayload");
});

test("AG17 · Mehr als fuenf Tags werden nicht uebertragen", async () => {
  const tags = ["#Ein", "#Zwei", "#Drei", "#Vier", "#Fuenf", "#Sechs"];
  const caption = finalerText(BASIS, tags);
  const e = await eintrag({
    payload: { contentId: INHALT, imageUrl: BILD, caption },
    text: { captionBase: BASIS, hashtags: tags, hashtagSatz: null }
  });
  const { abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 400);
  assert.equal((await abgelegt.json()).error, "tooManyHashtags");
});

test("AG18 · Tags ohne Grundtext sind eine Behauptung und werden abgewiesen", async () => {
  const e = await eintrag();
  e.text = { captionBase: null, hashtags: TAGS.slice(), hashtagSatz: null };
  const { abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 400);
  assert.equal((await abgelegt.json()).error, "hashtagsWithoutBase");
});

test("AG19 · Ein unbekannter Bildzustand kommt nicht durch", async () => {
  const e = await eintrag({
    asset: { zustand: "VIELLEICHT", grund: null, satz: "Irgendwas." } });
  const { abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 400);
  assert.equal((await abgelegt.json()).error, "unknownAssetState");
});

test("AG20 · Ein Bildzustand ohne Satz kommt nicht durch", async () => {
  const e = await eintrag({ asset: { zustand: "ASSET_NOT_REACHABLE", satz: "  " } });
  const { abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 400);
  assert.equal((await abgelegt.json()).error, "assetWithoutSentence");
});

test("AG21 · erreichbar:true neben NICHT_ERREICHBAR kommt nicht durch", async () => {
  /* Genau der Weg, auf dem eine Sperre still aufginge: zwei Quellen
     fuer dieselbe Aussage, und die Oberflaeche glaubt der falschen. */
  const e = await eintrag({
    asset: { zustand: "ASSET_NOT_REACHABLE", grund: "HTTP_404", erreichbar: true,
      satz: "Unter dieser Adresse liegt kein Bild." } });
  const { abgelegt } = await aufbauen(projektion([e]));
  assert.equal(abgelegt.status, 400);
  assert.equal((await abgelegt.json()).error, "assetFlagContradictsState");
});

test("AG22 · Und die Anzeige glaubt dem Zustand, nicht der Fahne", async () => {
  /* Die zweite Haelfte derselben Frage: wenn so etwas doch je in die
     Oberflaeche geriete, entscheidet der Zustand. */
  const e = await eintrag();
  e.asset = { zustand: "ASSET_NOT_REACHABLE", grund: "HTTP_404",
    satz: "Unter dieser Adresse liegt kein Bild." };
  e.asset.erreichbar = true;
  /* Am Ingest vorbei: direkt in den Speicher, wie ihn die Karte liest. */
  const { env, cookie } = await aufbauen(projektion([await eintrag()]));
  await env.VU_SOCIAL_KV.put(QUEUE_KEY, JSON.stringify(projektion([e])));
  const r = await worker.fetch(request("/approval/" + ID, { headers: { cookie } }), env);
  const html = await r.text();
  assert.doesNotMatch(html, /action="\/approval\/[^"]+\/approve"/);
});

test("AG23 · Eine Karte ohne Messung zeigt keinen Freigabeknopf", async () => {
  /* Die Anzeigeseite von AG5. Die Gegenprobe zeigte, dass sie fehlte:
     bildLage() durfte "fehlt" als "erreichbar" lesen, ohne dass ein
     Test umfiel. Ein fehlendes Feld ist nie eine bestandene Pruefung. */
  const e = await eintrag();
  delete e.asset;
  const { html } = await karte(projektion([e]));
  assert.doesNotMatch(html, /action="\/approval\/[^"]+\/approve"/);
  const t = text(html);
  assert.match(t, /nicht geprueft/);
  /* Und keine Behauptung, das Bild sei weg: gemessen hat niemand. */
  assert.doesNotMatch(t, /ist derzeit nicht erreichbar/);
});

test("AG24 · Ungeprueft heisst nirgends auf der Karte \"nicht abrufbar\"", async () => {
  /* §5: ein Transportbefund darf nie zu einer Aussage ueber das Bild
     werden. Der erste Entwurf schrieb unter das Bild "Es ist dort
     gerade nicht abrufbar" — auch dann, wenn niemand nachgesehen
     hatte. Das ist dieselbe Verwechslung, nur eine Zeile hoeher. */
  const e = await eintrag({ asset: UNGEPRUEFT });
  const { html } = await karte(projektion([e]));
  const t = text(html);
  assert.doesNotMatch(t, /nicht abrufbar/);
  assert.match(t, /wurde nicht geprueft/);
  /* Und im geprueften Fall steht es sehr wohl da. */
  const w = await karte(projektion([await eintrag({ asset: WEG })]));
  assert.match(text(w.html), /nicht abrufbar/);
});

/* =============================== Gemessen wurde eine Adresse (§22) */

test("AG25 · Ein Urteil ueber ein ANDERES Bild gibt dieses nicht frei", async () => {
  /* Preview ungleich Publish-Asset: das Bild wurde zwischen Messung
     und Anzeige ausgetauscht. Das alte "erreichbar" gehoert zur alten
     Adresse und sagt ueber die neue nichts. */
  const e = await eintrag({
    asset: Object.assign({}, ERREICHBAR, {
      url: "https://research.visionuniverse.de/assets/social/ein_anderes.jpg" }) });
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  assert.notEqual(r.status, 200);
  assert.doesNotMatch(text(await r.text()), /Wirklich veroeffentlichen/);
});

test("AG26 · Und die Karte zeigt dann keinen Freigabeknopf", async () => {
  const e = await eintrag({
    asset: Object.assign({}, ERREICHBAR, {
      url: "https://research.visionuniverse.de/assets/social/ein_anderes.jpg" }) });
  const { html } = await karte(projektion([e]));
  assert.doesNotMatch(html, /action="\/approval\/[^"]+\/approve"/);
  assert.match(text(html), /nicht geprueft/);
});

test("AG27 · Ein Urteil ohne Adresse gilt fuer gar nichts", async () => {
  const ohne = Object.assign({}, ERREICHBAR);
  delete ohne.url;
  const e = await eintrag({ asset: ohne });
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  assert.notEqual(r.status, 200);
});

/* ====================================================== §25: OHNE ABDRUCK NICHTS

   Bis hierher belegen AG1-AG27: unter DIESER Adresse lag ein gueltiges
   Bild. Was offen blieb, hat am 21.09. einen oeffentlichen Beitrag ohne
   ladbares Bild erzeugt - zwischen Messung und Sendung kann die Datei
   ausgetauscht werden, die Adresse bleibt.

   Der Byte-Abdruck ist die einzige Groesse, an der sich das feststellen
   laesst. Fehlt er, ist "Vorschau = Sendung" nicht pruefbar.
   ================================================================== */

async function ohneAbdruck() {
  const a = Object.assign({}, ERREICHBAR);
  delete a.sha256;
  return await eintrag({ asset: a });
}

test("AG28 · Ohne Byte-Abdruck wird nicht freigegeben", async () => {
  const e = await ohneAbdruck();
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });
  const html = text(await r.text());

  assert.match(html, /nicht belegt, dass die Vorschau das gesendete Bild ist/,
    "Der Owner bekommt keinen Satz zu dieser Lage: " + html.slice(0, 220));
  assert.doesNotMatch(html, /Wirklich veroeffentlichen/,
    "Die Rueckfrage kam, obwohl der Abdruck fehlt.");
});

test("AG29 · Auch der Sendeknopf selbst ist ohne Abdruck gesperrt", async () => {
  /* Die Rueckfrage laesst sich ueberspringen. Wer das Formular direkt
     abschickt, darf trotzdem nicht durchkommen - sonst waere das Tor
     eine Anzeige und keine Sperre. */
  const e = await ohneAbdruck();
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/publish",
    { fingerprint: e.contentHash });

  assert.match(text(await r.text()),
    /nicht belegt, dass die Vorschau das gesendete Bild ist/);
});

test("AG30 · Mit Abdruck bleibt die Freigabe moeglich", async () => {
  /* Die Gegenprobe. Ohne sie waere AG28 von einem Tor, das immer zu
     ist, nicht zu unterscheiden. */
  const e = await eintrag({ asset: ERREICHBAR });
  const { env, cookie } = await aufbauen(projektion([e]));
  const r = await tun(env, cookie, "/approval/" + ID + "/approve",
    { fingerprint: e.contentHash });

  assert.match(text(await r.text()), /Wirklich veroeffentlichen/,
    "Mit vollstaendiger Messung muss der Weg offen sein.");
});
