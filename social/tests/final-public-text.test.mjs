/* =========================================================================
   VISION UNIVERSE SOCIAL — FINAL_PUBLIC_TEXT (§15–§17)

   -------------------------------------------------------------------------
   EINE REGEL, ZWEI AUSFUEHRUNGEN
   -------------------------------------------------------------------------

   Zusammengesetzt wird im Repository (social/engines/hashtags.js), vor
   der Freigabe, genau einmal. Nachgerechnet wird im Worker
   (workers/.../public-text.js), weil der die Node-Engine nicht
   importieren kann.

   Zwei Ausfuehrungen derselben Regel laufen auseinander, sobald eine
   von beiden angefasst wird - und das faellt erst auf, wenn ein
   Beitrag abgewiesen wird, der stimmt, oder einer durchgeht, der
   nicht stimmt. Dieselbe Lage wie bei contentHash, und dieselbe
   Antwort: beide Seiten werden hier an echten Faellen gegeneinander
   gehalten.

   -------------------------------------------------------------------------
   UND DIE INVARIANTE AM KANDIDATEN
   -------------------------------------------------------------------------

   VORSCHAU IST SENDUNG heisst hier: aus captionBase und hashtags muss
   sich wieder content.caption ergeben. Der Owner liest beides
   getrennt; gesendet wird eines. Stimmt die Rechnung nicht, sieht er
   eine Aufteilung, die es nie gab.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Hashtags = require(join(ROOT, "social/engines/hashtags.js"));
const Projektion = require(join(ROOT, "social/engines/approval-projection.js"));
const Abdruck = require(join(ROOT, "social/engines/content-hash.js"));

const Worker = await import(
  "../../workers/vision-universe-social/src/public-text.js");

/* Faelle, die sich wirklich unterscheiden - nicht fuenfmal derselbe. */
const FAELLE = [
  ["Ein Satz.", ["#Eins", "#Zwei"]],
  ["Ein Satz.", []],
  ["Ein Satz.", null],
  ["", ["#Eins"]],
  ["", []],
  ["  Randleerraum.  ", ["#Eins"]],
  ["Mehrzeilig.\n\nZweiter Absatz.", ["#Eins", "#Zwei", "#Drei"]],
  ["Umlaute.", ["#Energiewirtschaft", "#Gebuehren", "#Oel"]],
  ["Rauten doppelt.", ["##Eins", "#Zwei"]],
  ["Rauten fehlen.", ["Eins", "Zwei"]],
  ["Leere Tags.", ["#Eins", "", "   ", "#Zwei"]],
  ["Fuenf.", ["#A", "#B", "#C", "#D", "#E"]],
  [null, ["#Eins"]],
  [undefined, null]
];

test("FT1 · Repository und Worker setzen denselben Text zusammen", () => {
  for (const [basis, tags] of FAELLE) {
    assert.equal(
      Worker.finalerText(basis, tags),
      Hashtags.finalerText(basis, tags),
      "Die beiden Ausfuehrungen laufen auseinander bei:\n" +
        JSON.stringify([basis, tags]));
  }
});

test("FT2 · Auch bei zusammengewuerfelten Eingaben", () => {
  /* Deterministisch erzeugt, damit ein Fehlschlag wiederholbar ist. */
  const stuecke = ["", "a", "Ein Satz.", " \n ", "Zeile\nZeile", "Öl & Gas"];
  const tagmengen = [[], ["#A"], ["A", "#B"], ["#A", "", "#B"], ["  "], ["#Ä"]];
  let n = 0;
  for (const b of stuecke) {
    for (const t of tagmengen) {
      assert.equal(Worker.finalerText(b, t), Hashtags.finalerText(b, t),
        "Auseinander bei: " + JSON.stringify([b, t]));
      n++;
    }
  }
  assert.equal(n, stuecke.length * tagmengen.length);
});

test("FT3 · Die Obergrenze ist auf beiden Seiten dieselbe Zahl", () => {
  assert.equal(Worker.MAX_HASHTAGS, Hashtags.MAX_HASHTAGS);
});

test("FT4 · Die Projektion traegt die Bestandteile des Sendetextes", () => {
  const basis = "Exxon Mobil steht bei 52 von 100. Keine Anlageberatung.";
  const tags = ["#ExxonMobil", "#Aktienanalyse"];
  const caption = Hashtags.finalerText(basis, tags);

  const k = {
    candidateId: "cand_test", state: "AWAITING_APPROVAL",
    content: { contentId: "pkg_test", imageUrl: "https://example.test/b.jpg",
      caption },
    presentation: { captionBase: basis, hashtags: tags,
      hashtagSatz: "Zwei Tags: Unternehmen und Inhaltsart." },
    contentHash: "f".repeat(64)
  };

  const e = Projektion.eintrag(k);
  assert.equal(e.text.captionBase, basis);
  assert.deepEqual(e.text.hashtags, tags);
  /* Die Zusage, nachgerechnet und nicht behauptet. */
  assert.equal(Hashtags.finalerText(e.text.captionBase, e.text.hashtags),
    e.payload.caption);
});

test("FT5 · Ohne Tagangabe bleibt die Liste leer und wird nicht erfunden", () => {
  const e = Projektion.eintrag({
    content: { contentId: "x", imageUrl: "https://example.test/b.jpg",
      caption: "Nur Text." },
    presentation: {}
  });
  assert.deepEqual(e.text.hashtags, []);
  assert.equal(e.text.captionBase, null);
  assert.equal(e.text.hashtagSatz, null);
});

/* =========================================================================
   DIE ECHTEN KANDIDATEN IM REPOSITORY

   Keine Fixture: die Dateien, die der Orchestrator geschrieben hat.

   Und ein Befund, den erst dieser Test zutage gefoerderte: es gibt
   `presentation.hashtags` in diesem Bestand ZWEIMAL. Die aelteren
   Kandidaten - darunter der eine, der GERADE auf Freigabe wartet -
   tragen dort die drei festen Tags, die nie in einer Caption standen.
   Waere die Projektion ihnen gefolgt, haette das Approval Center dem
   Owner Tags gezeigt, die der Beitrag nicht traegt.
   ========================================================================= */
test("FT6 · Was die Projektion an Tags zeigt, steht auch im Sendetext", () => {
  const ordner = join(ROOT, "social/data/publish-candidates");
  if (!existsSync(ordner)) return;

  let mitTags = 0, ohneTags = 0;
  for (const datei of readdirSync(ordner).filter((f) => f.endsWith(".json"))) {
    let k = null;
    try { k = JSON.parse(readFileSync(join(ordner, datei), "utf8")); } catch { continue; }
    if (!k || !k.content) continue;

    const e = Projektion.eintrag(k);
    if (!e.text.hashtags.length) {
      /* Nichts zeigen ist erlaubt. Etwas zeigen, das nicht dazugehoert,
         nicht. */
      ohneTags++;
      continue;
    }
    assert.ok(e.text.hashtags.length <= Hashtags.MAX_HASHTAGS,
      datei + " zeigt " + e.text.hashtags.length + " Tags.");
    assert.equal(Hashtags.finalerText(e.text.captionBase, e.text.hashtags),
      e.payload.caption,
      datei + ": die gezeigten Tags ergeben zusammen mit dem Text nicht " +
      "das, was gesendet wuerde.");
    mitTags++;
  }
  /* Beide Zahlen sichtbar: ein Test, der still nichts geprueft hat,
     sieht aus wie einer, der bestanden hat. */
  console.log("FT6 · Kandidaten mit gezeigten Tags: " + mitTags +
    ", ohne: " + ohneTags);
  assert.ok(mitTags + ohneTags > 0, "Kein einziger Kandidat wurde geprueft.");
});

test("FT7 · Die alte Tagliste wird NICHT als Sendetext-Tag ausgegeben", () => {
  /* Der konkrete Fall aus dem Bestand: drei feste Tags, kein
     captionBase, und eine Caption, die keinen davon enthaelt. */
  const alt = {
    content: { contentId: "pkg_alt", imageUrl: "https://example.test/b.jpg",
      caption: "Ein Text ganz ohne Tags." },
    presentation: { hashtags: ["VisionUniverse", "Investment", "Daten"] }
  };
  const e = Projektion.eintrag(alt);
  assert.deepEqual(e.text.hashtags, []);
  assert.equal(e.text.captionBase, null);
  /* Und die Gegenprobe: mit Basistext werden dieselben Tags gezeigt. */
  const neu = {
    content: { contentId: "pkg_neu", imageUrl: "https://example.test/b.jpg",
      caption: Hashtags.finalerText("Ein Text.", ["#Eins"]) },
    presentation: { captionBase: "Ein Text.", hashtags: ["#Eins"] }
  };
  assert.deepEqual(Projektion.eintrag(neu).text.hashtags, ["#Eins"]);
});
