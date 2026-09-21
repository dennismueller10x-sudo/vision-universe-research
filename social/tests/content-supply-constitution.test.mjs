/* =========================================================================
   social/tests/content-supply-constitution.test.mjs

   CONTENT SUPPLY = ABUNDANT, PUBLISHING CAPACITY = BOUNDED (§7-§13)

   Die Verfassung eines leeren Tages. Sie besteht aus zwei Saetzen, die
   verwechselt wurden:

     Das ANGEBOT ist reichlich - fuenfzehn Familien, zehn Leiterstufen,
     und die letzte hat immer eine Frage.

     Die KAPAZITAET ist knapp - ein offener Creative Job, eine
     wartende Freigabe, ein Wochendach. Absichtlich.

   Ein leerer Tag aus Kapazitaet ist Betrieb. Ein leerer Tag aus
   angeblich fehlendem Angebot ist ein Befund.

   Gemessen wird hier nicht, ob die Saetze irgendwo stehen, sondern ob
   sie im Weg stehen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const K = require("../engines/content-cadence.js");
const NoPost = require("../engines/no-post.js");
const Ladder = require("../engines/content-ladder.js");
const Ideation = require("../engines/editorial-ideation.js");

function quelle(p) {
  return readFileSync(new URL(p, import.meta.url), "utf8");
}

/* Kommentare sind kein ausgefuehrter Code. Wer eine Verdrahtung im
   Quelltext sucht, muss sie vorher entfernen - sonst genuegt ein
   erklaerender Satz, um den Test zu bestehen. */
function ohneKommentare(s) {
  return String(s).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ============================================ Eine Tabelle, kein zweites Register */

test("VF1 · Jeder benannte Grund hat genau eine Klasse", () => {
  /* Ein Grund ohne Eintrag waere ein Grund ohne Antwort auf die
     Frage, ob er einen Tag beenden darf - und `grundZulaessig` wuerde
     ihn als erfunden abweisen, obwohl er in GRUND steht. */
  for (const g of Object.keys(K.GRUND)) {
    const e = K.GRUND_KLASSE[g];
    assert.ok(e, "Der Grund " + g + " hat keine Klasse.");
    assert.ok(Object.values(K.KLASSE).includes(e.klasse),
      g + " traegt eine unbekannte Klasse: " + e.klasse);
    assert.ok(Object.values(K.ALLEIN).includes(e.allein),
      g + " traegt eine unbekannte Allein-Regel: " + e.allein);
  }
});

test("VF2 · NIE_ALLEIN wird abgeleitet und nicht daneben gepflegt", () => {
  /* Die Fehlerfamilie, die den Creative Slot eine Woche blockiert hat:
     zwei Register fuer dieselbe Tatsache, und nur eines wurde
     fortgeschrieben. Hier wird gemessen, dass es nur eines gibt. */
  const ausTabelle = Object.keys(K.GRUND_KLASSE)
    .filter((g) => K.GRUND_KLASSE[g].allein === K.ALLEIN.NEIN).sort();
  assert.deepEqual([...K.NIE_ALLEIN].sort(), ausTabelle);

  /* Und die Gegenprobe: die Liste ist nicht einfach leer oder alles. */
  assert.ok(ausTabelle.length >= 6, "Zu wenige Gruende in der Klasse.");
  assert.ok(ausTabelle.length < Object.keys(K.GRUND_KLASSE).length,
    "ALLE Gruende gelten als nie-allein - dann beendet nichts mehr einen Tag.");
});

test("VF3 · Ideenmangel beendet keinen Tag (§11)", () => {
  /* Die fuenf, die der Auftrag ausdruecklich nennt. NO_IDEA und
     NO_INTERESTING_TOPIC standen vorher in keiner Liste - sie waeren
     als 'unbekannter Grund' durchgefallen, also aus dem falschen
     Grund. Jetzt fallen sie als Angebotsgruende durch. */
  for (const g of ["NO_IDEA", "NO_INTERESTING_TOPIC", "NO_MARKET_SIGNAL",
    "NO_QUANT_SIGNAL", "NO_BREAKING_NEWS"]) {
    const p = K.grundZulaessig(g, { vollstaendigGesucht: true });
    assert.equal(p.zulaessig, false, g + " durfte einen Tag beenden.");
    assert.equal(p.klasse, K.KLASSE.ANGEBOT, g + " gilt nicht als Angebotsgrund.");
    assert.ok(!/Unbekannter Grund/.test(p.erklaerung),
      g + " faellt durch die falsche Tuer: " + p.erklaerung);
  }
});

test("VF4 · Knappe Kapazitaet beendet einen Tag sehr wohl", () => {
  /* Die andere Haelfte. Ein Tor, das auch hier zu waere, waere kein
     Tor, sondern eine Mauer - und der Betrieb stuende still. */
  for (const g of ["ACTIVE_APPROVAL_QUEUE_NOT_EMPTY", "CREATIVE_JOB_IN_FLIGHT",
    "DAILY_CONTENT_CAP_REACHED", "MINIMUM_SPACING_NOT_REACHED",
    "OWNER_HELD_STATE", "OPERATIONAL_BLOCKER", "CREATIVE_JOB_COUNT_UNKNOWN"]) {
    const p = K.grundZulaessig(g);
    assert.equal(p.zulaessig, true, g + " beendet keinen Tag mehr.");
    assert.equal(p.klasse, K.KLASSE.KAPAZITAET);
  }
});

test("VF5 · Ein gemessenes Qualitaetsurteil bleibt zulaessig (§13)", () => {
  /* Reichliches Angebot senkt keine Schwelle. Wer gemessen hat und
     zu schwach fand, hat einen gerechtfertigten leeren Tag - sonst
     muesste das System bei offenen Fragen irgendetwas senden. */
  for (const g of ["NO_OPPORTUNITY_PASSED_QUALITY", "INSUFFICIENT_EVIDENCE",
    "CONTENT_REPETITION", "PORTFOLIO_SATURATION"]) {
    const p = K.grundZulaessig(g);
    assert.equal(p.zulaessig, true, g + " beendet keinen Tag mehr.");
    assert.equal(p.klasse, K.KLASSE.QUALITAET);
  }
});

/* ============================================ Der Angebotsgrund mit Nachweis */

test("VF6 · 'Keine Familie trug ein Thema' braucht den Suchnachweis", () => {
  const mit = K.grundZulaessig("NO_TOPIC_IN_ANY_FAMILY",
    { vollstaendigGesucht: true });
  assert.equal(mit.zulaessig, true);

  const ohne = K.grundZulaessig("NO_TOPIC_IN_ANY_FAMILY",
    { vollstaendigGesucht: false });
  assert.equal(ohne.zulaessig, false);
  assert.equal(ohne.verlangt, "VOLLSTAENDIGE_SUCHE");
});

test("VF7 · Kein uebergebener Nachweis ist kein Nachweis", () => {
  /* Fail closed. Ein fehlendes Argument, das als `true` gelesen wird,
     ist dieselbe Form von 'unbekannt heisst ja', die den Creative
     Slot schon einmal geoeffnet hat. */
  for (const nachweis of [undefined, null, {}, { vollstaendigGesucht: "ja" },
    { vollstaendigGesucht: 1 }]) {
    assert.equal(K.grundZulaessig("NO_TOPIC_IN_ANY_FAMILY", nachweis).zulaessig,
      false, "Ein Nachweis wurde angenommen, den niemand gefuehrt hat: " +
        JSON.stringify(nachweis));
  }
});

test("VF8 · Der Owner-Satz nennt keinen einzigen Code", () => {
  /* Die erste Fassung stellte den Code voran. Ein Test hielt genau
     zwei Codes davon ab, im Owner-Text zu erscheinen; die uebrigen
     kamen durch - ein Tor an der falschen Stelle. Geprueft wird
     deshalb JEDER Code. */
  const codes = Object.keys(K.GRUND_KLASSE);
  for (const g of codes) {
    for (const nachweis of [{ vollstaendigGesucht: true },
      { vollstaendigGesucht: false }]) {
      const p = K.grundZulaessig(g, nachweis);
      if (!p.erklaerung) continue;
      for (const c of codes) {
        assert.ok(!p.erklaerung.includes(c),
          "Der Owner-Satz zu " + g + " nennt den Code " + c + ": " + p.erklaerung);
      }
    }
  }
});

/* ============================================ Die gemessene Verfassung */

test("VF9 · Die Verfassung misst und behauptet nicht", () => {
  const v = K.verfassung({
    leiterStufen: Ladder.LEITER.length,
    familien: Ladder.alleFamilien().length,
    ideationStufe: (Ladder.LEITER.find((s) => s.ideation) || {}).stufe,
    maxOpenCreativeJobs: 1, offeneCreativeJobs: 0, aktiveFreigaben: 0,
    dailyIntentMax: 2, maxPostsPer7Days: 4
  });
  assert.equal(v.contentSupply.modell, "ABUNDANT");
  assert.equal(v.publishingCapacity.modell, "BOUNDED");
  assert.equal(v.contentSupply.belegt, true,
    "Die Aussage 'reichlich' ist nicht belegt: " + v.contentSupply.erklaerung);

  /* Gegenprobe: ohne redaktionelle Schlussstufe ist sie NICHT belegt.
     Ohne diese Haelfte waere `belegt` ein Feld, das immer true ist. */
  const ohne = K.verfassung({ leiterStufen: 9, familien: 15, ideationStufe: null });
  assert.equal(ohne.contentSupply.belegt, false);
  assert.match(ohne.contentSupply.erklaerung, /nur behaupten/);
});

test("VF10 · Unbekannte Kapazitaet steht als unbekannt, nicht als null", () => {
  const v = K.verfassung({ offeneCreativeJobs: null, aktiveFreigaben: null });
  assert.equal(v.publishingCapacity.offeneCreativeJobs, null);
  assert.equal(v.publishingCapacity.aktiveFreigaben, null);
});

test("VF11 · Die letzte Leiterstufe ist die redaktionelle", () => {
  const letzte = Ladder.LEITER[Ladder.LEITER.length - 1];
  assert.equal(letzte.ideation, true);
  assert.equal(letzte.stufe, Ladder.LEITER.length);
  assert.ok(Ideation.ideen({ now: "2026-09-21T09:00:00Z" }).anzahl > 0,
    "Die letzte Stufe hat keine Frage - dann ist das Angebot doch endlich.");
});

/* ============================================ Steht es im Weg? */

test("VF12 · Der Zyklusbericht traegt alles, was der Nachweis liest", () => {
  /* -----------------------------------------------------------------
     DIE VON HAND GEPFLEGTE FELDLISTE

     `run-social-cycle.mjs` schreibt den Suchnachweis Feld fuer Feld in
     den Bericht. Genau so ist in diesem Projekt schon ein Feld
     verlorengegangen: die Engine liefert es, der Bericht laesst es
     weg, `no-post.js` liest `undefined`, und der Betrieb faellt zu -
     was vorsichtig aussieht und blind ist.

     Gemessen wird deshalb nicht "das eine Feld steht da", sondern:
     JEDES Feld, das `vollstaendigGesucht()` liest, steht im Bericht.
     Die Liste kommt aus dem Quelltext der Funktion, nicht aus diesem
     Test - sonst waere sie die dritte Abschrift.
     ----------------------------------------------------------------- */
  const noPost = ohneKommentare(quelle("../engines/no-post.js"));
  const fn = noPost.match(
    /function vollstaendigGesucht\s*\([\s\S]*?\n  \}/);
  assert.ok(fn, "vollstaendigGesucht() wurde im Quelltext nicht gefunden.");
  const gelesen = [...new Set(
    [...fn[0].matchAll(/\bl\.([A-Za-z]\w*)/g)].map((m) => m[1]))];
  assert.ok(gelesen.length >= 3,
    "Zu wenige gelesene Felder gefunden: " + gelesen.join(", "));

  const zyklus = ohneKommentare(
    readFileSync(new URL("../../scripts/social/run-social-cycle.mjs",
      import.meta.url), "utf8"));
  const block = zyklus.match(/ladder:\s*\{[\s\S]*?\n    \},/);
  assert.ok(block, "Der ladder-Block des Zyklusberichts wurde nicht gefunden.");

  for (const feld of gelesen) {
    assert.ok(new RegExp("\\b" + feld + "\\b").test(block[0]),
      "Der Nachweis liest `" + feld + "`, der Bericht schreibt es nicht.");
  }

  /* Gegenprobe: ohne das Feld faellt genau diese Pruefung. Ohne sie
     waere nicht zu sehen, ob der Test ueberhaupt etwas verlangt. */
  const verstuemmelt = block[0].replace(/redaktionelleFragenAnzahl/g, "x");
  assert.ok(gelesen.some((f) => !new RegExp("\\b" + f + "\\b").test(verstuemmelt)),
    "Ein fehlendes Feld faellt dieser Pruefung nicht auf.");
});

test("VF13 · Der Orchestrator druckt die Verfassung, er hat sie nicht nur", () => {
  /* Eine Verfassung, die niemand liest, ist ein Kommentar. Gesucht
     wird der AUFRUF - im Quelltext ohne Kommentare, damit nicht ein
     erklaerender Satz den Test besteht. */
  const o = ohneKommentare(readFileSync(
    new URL("../../scripts/social/run-orchestrator.mjs", import.meta.url), "utf8"));
  assert.match(o, /Kadenz\.verfassung\s*\(/,
    "Der Orchestrator ruft die Verfassung nicht auf.");
  assert.match(o, /ANGEBOT UND KAPAZITAET/,
    "Der Bericht hat keinen Abschnitt dafuer.");

  /* Und die Gegenprobe zur Entkommentierung selbst: ein Aufruf, der
     NUR im Kommentar steht, darf nicht zaehlen. */
  assert.ok(!/Kadenz\.verfassung\s*\(/.test(
    ohneKommentare("/* Kadenz.verfassung( ) */")),
    "Ein Aufruf im Kommentar wuerde als Verdrahtung gelten.");
});

test("VF14 · Der leere Tag mit offenen Fragen ist ein Befund, nicht Betrieb", () => {
  /* Die Verfassung, durch den ganzen Pfad gemessen: leere Platte ->
     Leiter bis Stufe 10 -> zwanzig offene Fragen -> kein
     gerechtfertigter leerer Tag. */
  const leiter = Ladder.suche([], { benoetigt: 1, now: "2026-09-21T09:00:00Z" });
  assert.equal(leiter.fallbackDepthReached, Ladder.LEITER.length);
  assert.ok(leiter.redaktionelleFragenAnzahl > 0);

  const b = NoPost.beurteile({ erzeugt: 0,
    kadenz: { darfErzeugen: true, grund: null, lage: {} },
    leiter: {
      familiesConsidered: leiter.familiesConsidered,
      familiesConsideredCount: leiter.familiesConsideredCount,
      opportunitiesConsidered: leiter.opportunitiesConsidered,
      fallbackDepthReached: leiter.fallbackDepthReached,
      rejectionReasons: leiter.rejectionReasons,
      nichtGefragt: leiter.nichtGefragt,
      redaktionelleFragenAnzahl: leiter.redaktionelleFragenAnzahl,
      gefunden: leiter.gefunden.length
    },
    ablehnungen: [] });
  assert.equal(b.zustand, NoPost.ZUSTAND.NO_POST_UNEXPLAINED);
  assert.ok(b.fehlendeTeile.includes(NoPost.TEILE.SUCHE));
});
