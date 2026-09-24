/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/web-research.test.mjs

   WEB-FIRST CONTENT RESEARCH (Owner-Direktive "DIRECT CREATIVE GOLDEN
   PATH — FINAL GO/NO-GO", 23.09.)
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WR = require("../engines/web-research.js");

const JETZT = new Date("2026-09-23T15:00:00Z");

function item(overrides) {
  return Object.assign({
    title: "Nvidia kuendigt Investition von 100 Milliarden USD in OpenAI-Infrastruktur an",
    description: "Der Chiphersteller Nvidia will in den kommenden Jahren bis zu 100 " +
      "Milliarden USD in den Ausbau von KI-Rechenzentren fuer OpenAI investieren, wie " +
      "das Unternehmen am Montag mitteilte. Die Aktie legte im vorboerslichen Handel " +
      "um 3,5 % zu.",
    link: "https://example.com/nvidia-openai-100bn",
    pubDate: "2026-09-23T06:00:00Z",
    source: "Reuters"
  }, overrides || {});
}

/* --------------------------------------------------------- WR1-WR3: Aktualitaet */
test("WR1 · aktuell() verwirft Items ohne lesbares Datum", () => {
  const r = WR.aktuell([item({ pubDate: "" }), item({ pubDate: "nicht-ein-datum" })],
    { now: JETZT });
  assert.equal(r.length, 0);
});

test("WR2 · aktuell() verwirft Items ausserhalb des Fensters", () => {
  const r = WR.aktuell([item({ pubDate: "2026-09-10T06:00:00Z" })],
    { now: JETZT, fensterStunden: 72 });
  assert.equal(r.length, 0);
});

test("WR3 · aktuell() behaelt frische Items und traegt ageHours", () => {
  const r = WR.aktuell([item()], { now: JETZT, fensterStunden: 72 });
  assert.equal(r.length, 1);
  assert.ok(r[0].ageHours >= 0 && r[0].ageHours < 72);
  assert.equal(r[0].publishedAt, "2026-09-23T06:00:00.000Z");
});

/* --------------------------------------------------------------- WR4-WR6: Fakten */
test("WR4 · sammleFakten() findet Zahlenbelege mit Einheit", () => {
  const f = WR.sammleFakten(item());
  assert.ok(f.some((x) => x.value === "100" && x.unit === "Milliarden"));
  assert.ok(f.some((x) => x.value === "3,5" && x.unit === "%"));
});

test("WR5 · sammleFakten() traegt den vollen Satz je Beleg, nicht nur die Zahl", () => {
  const f = WR.sammleFakten(item());
  const prozentBeleg = f.find((x) => x.unit === "%");
  assert.match(prozentBeleg.statement, /Aktie legte im vorboerslichen Handel um 3,5 % zu\.$/);
});

test("WR6 · sammleFakten() findet keine Zahl, wenn keine im Text steht", () => {
  const f = WR.sammleFakten(item({ title: "Ohne Zahl", description: "Reiner Fliesstext ohne Beleg." }));
  assert.equal(f.length, 0);
});

/* ----------------------------------------------------------- WR7-WR9: Story-Wahl */
test("WR7 · waehleStory() waehlt die hoechstbewertete aktuelle Story", () => {
  const stark = item();
  const schwach = item({
    title: "Kleine Randnotiz",
    description: "Nichts Besonderes.",
    link: "https://example.com/randnotiz"
  });
  const r = WR.waehleStory([schwach, stark], { now: JETZT });
  assert.equal(r.ok, true);
  assert.equal(r.gewaehlt.item.link, stark.link);
});

test("WR8 · waehleStory() meldet KEINE_AKTUELLEN_STORYS statt zu erfinden", () => {
  const r = WR.waehleStory([item({ pubDate: "" })], { now: JETZT });
  assert.equal(r.ok, false);
  assert.equal(r.grund, "KEINE_AKTUELLEN_STORYS");
});

test("WR9 · themaFuer() erkennt Themenwelten aus dem Text, ohne Zwang", () => {
  assert.equal(WR.themaFuer("Nvidia baut neue KI-Rechenzentren").id, "AI");
  assert.equal(WR.themaFuer("Ein Text ohne erkennbares Themenfeld"), null);
});

/* ------------------------------------------------------------- WR10-WR14: Hooks */
test("WR10 · hookKandidaten() liefert nur grounded Text (keine Erfindung)", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const kandidaten = WR.hookKandidaten(storyWahl.gewaehlt);
  assert.ok(kandidaten.length > 0);
  for (const k of kandidaten) {
    assert.equal(WR.grounded(k.text,
      item().title + " " + item().description), true);
  }
});

test("WR11 · waehleHook() sperrt die zwei real benannten Negative Hook Fixtures", () => {
  const fixtur1 = WR.waehleStory(
    [item({ title: "493,78 USD Schlusskurs - MSFT.", description: "Reiner Kursstand." })],
    { now: JETZT });
  const h1 = WR.waehleHook(fixtur1.gewaehlt);
  assert.equal(h1.ok, false);

  const fixtur2 = WR.waehleStory(
    [item({ title: "420 von 5954 geprueften Titeln - Comeback?",
      description: "Reine Ranking-Aussage." })],
    { now: JETZT });
  const h2 = WR.waehleHook(fixtur2.gewaehlt);
  assert.equal(h2.ok, false);
});

test("WR12 · waehleHook() waehlt deterministisch die hoechste Punktzahl", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const h = WR.waehleHook(storyWahl.gewaehlt);
  assert.equal(h.ok, true);
  const sortiert = h.kandidaten.slice().sort((a, b) => b.punkte - a.punkte);
  assert.equal(h.gewaehlt.text, sortiert[0].text);
});

test("WR13 · kuerzen() kuerzt an einer Wortgrenze und markiert das Ende", () => {
  const lang = "Ein sehr langer Satz, der die maximale Hook-Laenge deutlich " +
    "ueberschreitet und deshalb gekuerzt werden muss, damit er auf dem Bild " +
    "noch lesbar bleibt und nicht ueberlaeuft.";
  const kurz = WR.kuerzen(lang, 60);
  assert.ok(kurz.length <= 61);
  assert.ok(kurz.endsWith("…"));
});

test("WR14 · grounded() lehnt frei erfundenen Text ab", () => {
  const quelle = "Nvidia baut ein neues Rechenzentrum in Texas.";
  assert.equal(WR.grounded("Apple verdoppelt seinen Umsatz in Europa komplett neu", quelle), false);
  assert.equal(WR.grounded("Nvidia baut ein neues Rechenzentrum in Texas", quelle), true);
});

/* ------------------------------------------------------------ WR15-WR17: Caption */
test("WR15 · baueCaption() wiederholt den Hook nicht woertlich als ersten Satz", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const hook = WR.waehleHook(storyWahl.gewaehlt);
  const caption = WR.baueCaption(storyWahl.gewaehlt, hook.gewaehlt.text);
  const ersterSatz = caption.split(/(?<=[.!?])\s+/)[0].toLowerCase().replace(/[.!?]+$/, "");
  assert.notEqual(ersterSatz, hook.gewaehlt.text.toLowerCase().replace(/[.!?]+$/, ""));
});

test("WR16 · baueCaption() traegt keine Anlageberatungs-Formel und die Quelle", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const caption = WR.baueCaption(storyWahl.gewaehlt, "irgendein Hook");
  assert.match(caption, /keine Kauf- oder Verkaufsempfehlung/);
  assert.match(caption, /Quelle: Reuters, 2026-09-23/);
});

test("WR17 · baueCaption() dedupliziert Saetze, die auch als Fakt auftauchen", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const caption = WR.baueCaption(storyWahl.gewaehlt, "irgendein Hook");
  const vorkommen = caption.split("Die Aktie legte im vorboerslichen Handel").length - 1;
  assert.equal(vorkommen, 1);
});

/* --------------------------------------------------------- WR18-WR19: Hashtags */
test("WR18 · hashtagsAbleiten() liefert maximal 5, dynamisch aus der Story", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const h = WR.hashtagsAbleiten(storyWahl.gewaehlt);
  assert.ok(h.hashtags.length <= 5);
  assert.ok(h.hashtags.includes("Nvidia"));
});

test("WR19 · hashtagsAbleiten() vergibt keine Duplikate", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const h = WR.hashtagsAbleiten(storyWahl.gewaehlt);
  assert.equal(new Set(h.hashtags.map((t) => t.toLowerCase())).size, h.hashtags.length);
});

/* -------------------------------------------------------- WR20-WR21: Motiv/Kennung */
test("WR20 · motivFuerStory() verbietet Schrift und Logo im generativen Auftrag", () => {
  const storyWahl = WR.waehleStory([item()], { now: JETZT });
  const motiv = WR.motivFuerStory(storyWahl.gewaehlt);
  assert.match(motiv.instruction, /Keine Schrift, kein Logo/);
});

test("WR21 · contentIdFuer() ist stabil fuer denselben Link", () => {
  const a = WR.contentIdFuer({ link: "https://example.com/x", publishedAt: "2026-09-23T06:00:00.000Z" });
  const b = WR.contentIdFuer({ link: "https://example.com/x", publishedAt: "2026-09-23T06:00:00.000Z" });
  assert.equal(a, b);
  const c = WR.contentIdFuer({ link: "https://example.com/y", publishedAt: "2026-09-23T06:00:00.000Z" });
  assert.notEqual(a, c);
});

/* ------------------------------------------------------ WR22-WR25: waehle() (Gesamt) */
test("WR22 · waehle() liefert ein vollstaendiges Paket fuer MANUAL_NOW", () => {
  const r = WR.waehle([item()], { now: JETZT });
  assert.equal(r.ok, true);
  for (const feld of ["contentId", "story", "hook", "caption", "hashtags", "motiv"]) {
    assert.ok(r[feld] !== undefined && r[feld] !== null, "fehlt: " + feld);
  }
  assert.ok(r.hashtags.length > 0);
  assert.ok(r.caption.length > 0);
});

test("WR23 · waehle() mit themaFilter (POST ZU THEMA) waehlt nur passende Items", () => {
  const passend = item({ title: "AMD stellt neuen KI-Chip vor", description: "AMD zeigt einen neuen Beschleuniger fuer Rechenzentren.", link: "https://example.com/amd" });
  const unpassend = item({ title: "Ganz anderes Thema", description: "Nichts mit AMD.", link: "https://example.com/other" });
  const r = WR.waehle([unpassend, passend], { now: JETZT, themaFilter: "AMD" });
  assert.equal(r.ok, true);
  assert.equal(r.story.link, passend.link);
});

test("WR24 · waehle() erfindet kein Thema, wenn themaFilter nicht vorkommt", () => {
  const r = WR.waehle([item()], { now: JETZT, themaFilter: "Ein Thema, das nirgends vorkommt" });
  assert.equal(r.ok, false);
  assert.equal(r.grund, "KEINE_AKTUELLE_WEB_STORY_ZU_THEMA");
});

test("WR25 · waehle() bricht fail-closed ab, wenn alle Items die Negative-Hook-Fixture-Form haben", () => {
  const r = WR.waehle(
    [item({ title: "493,78 USD Schlusskurs - MSFT.", description: "Nur ein Kursstand." })],
    { now: JETZT });
  assert.equal(r.ok, false);
  assert.equal(r.grund, "KEIN_GROUNDED_HOOK");
});

/* --------------------------------------------------------------------
   WR26-WR29: echte Produktionsfunde vom 23.09. (Lauf 35898390148) —
   "10-year U.S. Treasury yield tops 5.1%, marking its highest level
   since 2007", Seeking Alpha Market Currents, description leer.
   Drei reale Fehler in einem einzigen Titel: "ki" mitten in "marKIng"
   (falsches KI-Thema/Hashtag), "2007" ohne Tausendertrennzeichen
   (zerbrach an \d{1,3} zu "200"+"7"), "U.S." als vermeintliches
   Satzende (Caption duplizierte den Titel-Rest). Fixiert als
   dauerhafte Regression-Fixture nach diesem Codebase-Muster (siehe
   §26/§52 zum Vorfall vom 21.09.). -------------------------------- */
function treasuryItem(overrides) {
  return Object.assign({
    title: "10-year U.S. Treasury yield tops 5.1%, marking its highest level since 2007",
    description: "",
    link: "https://seekingalpha.com/market-currents/treasury-5-1",
    pubDate: "2026-09-23T12:00:00.000Z",
    source: "Seeking Alpha Market Currents"
  }, overrides || {});
}

test("WR26 · enthaeltBegriff()/themaFuer() treffen 'ki' nicht mitten in 'marking' — " +
  "und finden stattdessen die echte Themenwelt MACRO_RATES (§3.2, 24.09.)", () => {
  /* Bis zur Erweiterung der Themenwelten (Owner-Direktive "WEB-FIRST +
     FULL-POST-GENERATION", 24.09., §3.2) fiel diese Story mangels
     Abdeckung auf thema=null zurueck und landete beim generischen
     Rechenzentrums-Motiv — der Motiv-Bruch, den §3.2 ausdruecklich
     verbietet. Jetzt greift MACRO_RATES ueber "treasury"/"rendite". */
  const storyWahl = WR.waehleStory([treasuryItem()], { now: JETZT });
  assert.ok(storyWahl.gewaehlt.thema, "Treasury-Story braucht jetzt eine Themenwelt");
  assert.equal(storyWahl.gewaehlt.thema.id, "MACRO_RATES",
    "'marking' darf keine KI-Themenwelt ausloesen — die echte Themenwelt ist Zinsen/Makro");
});

test("WR27 · hashtagsAbleiten() liefert kein 'KuenstlicheIntelligenz' fuer die Treasury-Story", () => {
  const storyWahl = WR.waehleStory([treasuryItem()], { now: JETZT });
  const h = WR.hashtagsAbleiten(storyWahl.gewaehlt);
  assert.ok(!h.hashtags.includes("KuenstlicheIntelligenz"),
    "falscher KI-Hashtag aus 'marKIng' darf nicht wieder auftreten");
});

test("WR28 · sammleFakten() zerlegt eine Jahreszahl ohne Trennzeichen nicht in Fragmente", () => {
  const storyWahl = WR.waehleStory([treasuryItem()], { now: JETZT });
  const werte = storyWahl.gewaehlt.fakten.map((f) => f.value);
  assert.ok(werte.includes("2007"), "die Jahreszahl 2007 muss als ganze Zahl erscheinen");
  assert.ok(!werte.includes("200"), "'2007' darf nicht in '200' zerbrechen");
  assert.ok(!werte.includes("7") || werte.filter((w) => w === "7").length === 0,
    "'2007' darf keinen '7'-Rest hinterlassen");
});

test("WR29 · baueCaption() dupliziert den Titel nicht an 'U.S.' als falschem Satzende", () => {
  const storyWahl = WR.waehleStory([treasuryItem()], { now: JETZT });
  const hookWahl = WR.waehleHook(storyWahl.gewaehlt);
  assert.equal(hookWahl.ok, true);
  const caption = WR.baueCaption(storyWahl.gewaehlt, hookWahl.gewaehlt.text);
  assert.ok(!/10-year U\.S\.\s+Treasury/i.test(caption) || caption.indexOf("10-year U.S.") ===
    caption.lastIndexOf("10-year U.S."), "der Titel-Anfang darf nicht doppelt vorkommen");
  const vorkommen = caption.split("10-year U.S.").length - 1;
  assert.ok(vorkommen <= 1, "'10-year U.S.' darf hoechstens einmal in der Caption stehen");
});
