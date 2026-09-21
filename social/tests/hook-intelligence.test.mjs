/* =========================================================================
   HOOK INTELLIGENCE — §9

   Der Hook als eigenes Optimierungsobjekt: benannte Archetypen,
   mehrere Kandidaten, eine Bewertung, eine begruendete Wahl.

   Die Tests pruefen vor allem die zwei Grenzen, an denen so etwas
   still kaputtgeht: ein Archetyp, der sich auch ohne Evidenz fuellen
   laesst, und eine Bewertung, in der sich ein Ausschluss durch einen
   Vorteil aufwiegen laesst.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const H = require("../engines/hook.js");
const Brand = require("../engines/brand.js");
const VQ = require("../engines/visual-quality.js");
const Content = require("../engines/content.js");

const NOW = "2026-09-16T10:00:00Z";

/** Ein Kontext, den mehrere Archetypen tragen. */
function reich(ueber) {
  return Object.assign({
    subjekt: "Russell 2000",
    kennzahl: { name: "Bewertungsabstand zum S&P 500", wert: -38, einheit: "%" },
    extrem: { richtung: "weit auseinander", seit: "1999" },
    vergleich: { eines: "Russell 2000", wertEines: 13.4,
      anderes: "S&P 500", wertAnderes: 21.6, einheit: "KGV" },
    ursache: "kleine Unternehmen ziehen seit 2021 weniger Kapital an",
    bedeutung: "wer breit anlegt, haelt beide Seiten dieses Abstands"
  }, ueber || {});
}

/* -------------------------------------------------- Archetypen (§9) */

test("HK1 · Es gibt benannte Archetypen, und jeder sagt, was er braucht", () => {
  assert.ok(H.ARCHETYP_IDS.length >= 5, H.ARCHETYP_IDS.join(","));
  for (const id of H.ARCHETYP_IDS) {
    const a = H.ARCHETYPEN[id];
    assert.ok(a.zweck, id + " ohne Zweck");
    assert.ok(Array.isArray(a.braucht) && a.braucht.length, id + " ohne braucht");
    assert.ok(a.risiko, id + " ohne benanntes Risiko");
    assert.equal(typeof a.formulieren, "function");
    /* Jede Voraussetzung muss es als Pruefung geben - sonst waere
       `braucht` eine Liste, die niemand liest. */
    for (const b of a.braucht) {
      assert.equal(typeof H.VORAUSSETZUNG[b], "function",
        id + " verlangt '" + b + "', wofuer es keine Voraussetzung gibt");
    }
  }
});

test("HK2 · Ohne Evidenz entsteht KEIN Kandidat - und nicht einer mit Luecke", () => {
  const r = H.kandidaten({});
  assert.equal(r.kandidaten.length, 0);
  assert.equal(r.verworfen.length, H.ARCHETYP_IDS.length);
  for (const v of r.verworfen) assert.ok(v.fehlt.length, v.archetyp);
});

test("HK3 · Ein Archetyp entsteht nur, wenn SEINE Evidenz da ist", () => {
  /* Nur Subjekt und Ursache: dann gibt es MECHANIK und sonst nichts
     aus dieser Gruppe. */
  const r = H.kandidaten({ subjekt: "Russell 2000", ursache: "weniger Kapital" });
  const ids = r.kandidaten.map((k) => k.archetyp);
  assert.deepEqual(ids, ["MECHANIK"], ids.join(","));
  assert.ok(r.verworfen.some((v) => v.archetyp === "EXTREM" &&
    v.fehlt.includes("extrem")));
});

test("HK4 · Ein reicher Kontext ergibt mehrere Kandidaten (§9)", () => {
  const r = H.kandidaten(reich());
  assert.ok(r.kandidaten.length >= 4, r.kandidaten.map((k) => k.archetyp).join(","));
  /* Und sie sind wirklich verschiedene Saetze, keine Umstellungen. */
  const texte = new Set(r.kandidaten.map((k) => k.text));
  assert.equal(texte.size, r.kandidaten.length);
});

/* ----------------------------------------- Tueren statt Gewichtungen */

test("HK5 · Eine unbelegte Zahl schliesst aus - sie wird nicht abgezogen", () => {
  const evidence = [{ statement: "Der Abstand liegt bei 38 %", value: 38 }];
  const b = H.bewerte({ archetyp: "AUTOR", text: "Der Abstand liegt bei 91 %." },
    { subjekt: "Russell 2000", evidence: evidence });
  assert.equal(b.zulaessig, false);
  assert.ok(b.ausschluss.some((a) => a.id === H.AUSSCHLUSS.UNBELEGTE_ZAHL),
    JSON.stringify(b.ausschluss));
});

test("HK6 · Kein Vorteil kauft einen Ausschluss frei", () => {
  /* Ein kurzer, konkreter, eigenstaendiger Satz - alles, was die
     Bewertung belohnt - mit einer Zahl, die nicht belegt ist. Er
     bleibt unzulaessig, egal wie viele Punkte er sammelt. */
  const evidence = [{ statement: "Der Abstand liegt bei 38 %", value: 38 }];
  const b = H.bewerte({ archetyp: "AUTOR", text: "91 % Abstand." },
    { subjekt: "Abstand", evidence: evidence });
  assert.equal(b.zulaessig, false);
  assert.ok(b.punkte > 0, "Der Satz sammelt durchaus Punkte");
});

test("HK7 · Verbotenes Register schliesst aus", () => {
  const b = H.bewerte({ archetyp: "AUTOR", text: "Geheimtipp: Russell 2000." },
    { subjekt: "Russell 2000" });
  assert.equal(b.zulaessig, false);
  assert.ok(b.ausschluss.some((a) => a.id === H.AUSSCHLUSS.REGISTER));
});

test("HK8 · Aber NUR was am Text liegt - kein Beitragsregel am Hook", () => {
  /* Der Pflichthinweis bei Einzelwerten ist eine Eigenschaft des
     Beitrags. Ein Hook kann ihn nicht tragen. Der erste Entwurf rief
     Brand.check() und schloss damit einen korrekten Kontrast aus. */
  const b = H.bewerte(
    { archetyp: "KONTRAST", text: "NVDA 13,4 KGV, AMD 21,6 KGV." },
    { subjekt: "NVDA" });
  assert.equal(b.zulaessig, true, JSON.stringify(b.ausschluss));
});

test("HK9 · Ein Versprechen, das der Text nicht einloest, schliesst aus", () => {
  const b = H.bewerte({ archetyp: "MECHANIK", text: "Warum f\u00e4llt der Kurs?" },
    { subjekt: "Kurs", body: "Der Kurs ist gefallen. Mehr dazu im Beitrag." });
  assert.equal(b.zulaessig, false);
  assert.ok(b.ausschluss.some((a) => a.id === H.AUSSCHLUSS.VERSPRECHEN_OFFEN));
});

test("HK10 · Ohne Text gibt es dazu noch gar nichts zu sagen", () => {
  /* Zur Hook-Zeit existiert der Beitragstext noch nicht. Ein
     Ausschluss waere dann eine Messung gegen etwas, das es nicht gibt. */
  const b = H.bewerte({ archetyp: "MECHANIK", text: "Warum f\u00e4llt der Kurs?" },
    { subjekt: "Kurs" });
  assert.equal(b.zulaessig, true, JSON.stringify(b.ausschluss));
});

test("HK11 · Ein Hook, der die Caption wiederholt, schliesst aus", () => {
  const satz = "Der Abstand ist so gross wie seit 1999 nicht.";
  const b = H.bewerte({ archetyp: "AUTOR", text: satz },
    { subjekt: "Abstand", caption: satz + " Mehr dazu unten." });
  assert.equal(b.zulaessig, false);
  assert.ok(b.ausschluss.some((a) => a.id === H.AUSSCHLUSS.DOPPELT_ZUR_CAPTION));
});

test("HK12 · Zu lang schliesst aus, und die Grenze kommt aus dem Brand Brain", () => {
  const lang = "x".repeat(Brand.LIMITS.maxHookLength + 1);
  const b = H.bewerte({ archetyp: "AUTOR", text: lang }, {});
  assert.ok(b.ausschluss.some((a) => a.id === H.AUSSCHLUSS.ZU_LANG));
  assert.equal(
    H.bewerte({ archetyp: "AUTOR", text: "x".repeat(Brand.LIMITS.maxHookLength) },
      {}).ausschluss.some((a) => a.id === H.AUSSCHLUSS.ZU_LANG), false);
});

/* ------------------------------------------------------------ Wahl */

test("HK13 · Die Wahl ist begruendet und nennt den Zweiten", () => {
  const r = H.waehle(reich());
  assert.equal(r.ok, true, r.erklaerung);
  assert.ok(H.ARCHETYP_IDS.includes(r.gewaehlt.archetyp));
  assert.match(r.erklaerung, /Punkten/);
  assert.ok(typeof r.abstand === "number");
});

test("HK14 · Die Unterlegenen bleiben stehen - sonst lernt niemand daraus", () => {
  const r = H.waehle(reich());
  assert.ok(r.bewertet.length >= 4);
  assert.ok(r.bewertet.some((b) => b.archetyp !== r.gewaehlt.archetyp));
  /* Auch die, die gar nicht entstanden sind, mit dem Grund. */
  assert.ok(r.verworfen.length >= 1);
});

test("HK15 · Keine mechanische Rotation: derselbe Kontext ergibt denselben Hook", () => {
  const a = H.waehle(reich()).gewaehlt;
  const b = H.waehle(reich()).gewaehlt;
  const c = H.waehle(reich()).gewaehlt;
  assert.equal(a.text, b.text);
  assert.equal(b.text, c.text);
});

test("HK16 · Eine gemessene Leistung verschiebt die Wahl", () => {
  const ohne = H.waehle(reich());
  const verlierer = ohne.bewertet
    .filter((b) => b.zulaessig && b.archetyp !== ohne.gewaehlt.archetyp)
    .sort((x, y) => x.punkte - y.punkte)[0];
  const mit = H.waehle(reich({ leistung: { [verlierer.archetyp]: 100 } }));
  assert.equal(mit.gewaehlt.archetyp, verlierer.archetyp);
  assert.equal(mit.gewaehlt.leistungGemessen, true);
});

test("HK17 · Ohne gemessene Leistung fliesst NICHTS ein - kein Mittelwert", () => {
  const r = H.waehle(reich());
  for (const b of r.bewertet) {
    assert.equal(b.leistungGemessen, false);
    assert.equal(b.teile.leistung, undefined,
      b.archetyp + " bekommt eine Leistung, die niemand gemessen hat");
  }
  assert.match(r.erklaerung, /Ohne gemessene Leistung/);
});

test("HK18 · Traegt die Evidenz nichts, wird kein Satz erfunden", () => {
  const r = H.waehle({});
  assert.equal(r.ok, false);
  assert.equal(r.grund, "KEIN_KANDIDAT");
  assert.equal(r.gewaehlt, null);
  assert.match(r.erklaerung, /kein Grund, einen\s+Satz zu erfinden/);
});

test("HK19 · Sind alle ausgeschlossen, wird keine Schwelle gesenkt", () => {
  const r = H.waehle({ subjekt: "Russell 2000",
    ursache: "Geheimtipp aus dem Casino", bedeutung: "Jackpot" });
  assert.equal(r.ok, false);
  assert.equal(r.grund, "ALLE_AUSGESCHLOSSEN");
  assert.match(r.erklaerung, /Schwelle wird dafuer nicht gesenkt/);
});

/* ------------------------------------------------ Ableitung + Belege */

test("HK20 · Der Kontext wird aus den Belegen abgeleitet, nicht erfunden", () => {
  const k = H.ableiten({
    facts: [{ metric: "KGV", value: 13.4, entity: "Russell 2000" },
      { metric: "KGV", value: 21.6, entity: "S&P 500" }],
    opportunity: { topic: "Small Caps" } });
  assert.equal(k.subjekt, "Russell 2000");
  assert.equal(k.kennzahl.name, "KGV");
  assert.equal(k.vergleich.anderes, "S&P 500");
  /* Was die Belege nicht hergeben, bleibt leer. */
  assert.equal(k.extrem, null);
  assert.equal(k.ursache, null);
  assert.equal(k.bedeutung, null);
});

test("HK21 · Ein Vergleich braucht EINE Achse", () => {
  /* Zwei verschiedene Kennzahlen sind kein Vergleich. */
  const k = H.ableiten({ facts: [
    { metric: "KGV", value: 13.4, entity: "Russell 2000" },
    { metric: "Dividendenrendite", value: 2.1, entity: "S&P 500" }] });
  assert.equal(k.vergleich, null);
});

test("HK22 · Die Zahl bringt ihren Beleg mit", () => {
  const quelle = { source: "vu.technical", state: "VERIFIED" };
  const k = H.ableiten({ facts: [
    { metric: "KGV", value: 13.4, entity: "Russell 2000", source: quelle }] });
  const r = H.waehle(k);
  assert.equal(r.ok, true, r.erklaerung);
  assert.ok(r.gewaehlt.belege.length >= 1,
    "Ohne Beleg ist die Zahl im Hook eine Behauptung");
  assert.equal(r.gewaehlt.belege[0].source, quelle);
});

test("HK23 · Eine Zahl wird nicht umgeschrieben", () => {
  /* Der Beleg sagt "184,20". Ein 52-Wochen-Hoch von 184,20 ist eine
     andere Angabe als eines von 184,2 - und die Faktenpruefung sieht
     genau das. */
  const k = H.ableiten({ facts: [
    { metric: "52-Wochen-Hoch", value: "184,20", unit: "USD", entity: "NVDA" }] });
  const r = H.waehle(k);
  assert.match(r.gewaehlt.text, /184,20/);
  assert.doesNotMatch(r.gewaehlt.text, /184,2 /);
});

test("HK24 · Der bestehende Autor tritt mit an und kann gewinnen", () => {
  const k = H.ableiten({ facts: [
    { metric: "KGV", value: 13.4, entity: "Russell 2000" }] });
  k.zusaetzlich = [{ archetyp: "AUTOR",
    text: "13,4 - so billig war der Russell 2000 selten." }];
  const r = H.waehle(k);
  assert.ok(r.bewertet.some((b) => b.archetyp === "AUTOR"));
  /* Und er steht bei Gleichstand hinten, nicht vorn: indexOf() liefert
     fuer einen Fremdling -1, und -1 waere der erste Platz. */
  const gleich = H.waehle(Object.assign(H.ableiten({ facts: [] }),
    { subjekt: "X", ursache: "Y",
      zusaetzlich: [{ archetyp: "AUTOR", text: "Warum X: Y" }] }));
  assert.equal(gleich.gewaehlt.archetyp, "MECHANIK",
    "Bei gleichem Text und gleichen Punkten gewinnt der benannte Archetyp");
});

/* --------------------------------------- Das Tor steht im Weg (§9) */

const CONTENT_QUELLE = readFileSync("social/engines/content.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("HK25 · content.js waehlt den Hook ueber die Engine, nicht am Schreiber vorbei", () => {
  assert.match(CONTENT_QUELLE, /Hook\s*\.\s*waehle/);
  assert.match(CONTENT_QUELLE, /Hook\s*\.\s*ableiten/);
});

test("HK26 · Der echte Durchlauf waehlt begruendet und traegt die Auswahl mit", () => {
  const res = Content.run({
    opportunity: { opportunityId: "opp_1", topic: "KI-Rechenzentren",
      entities: ["NVDA"], platform: "instagram" },
    sources: [{ source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: "2026-09-15T11:00:00Z" }],
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { timeSeries: true, keyNumber: true },
    writer: Content.createTemplateWriter()
  }, { now: NOW });

  assert.equal(res.ok, true, res.explanation);
  assert.ok(res.package.hookArchetype, "Der Archetyp reist nicht mit");
  assert.ok(res.package.hookSelection, "Die Auswahl reist nicht mit");
  assert.ok(res.package.hookSelection.bewertet.length >= 2,
    "Nur ein Kandidat - dann ist nichts optimiert worden");
  /* Und die Zahl im Hook ist belegt: die Faktenpruefung ist dieselbe
     wie fuer jeden anderen Satz. */
  assert.equal(res.package.validation.factCheck.passed, true);
});

test("HK27 · Die Einloesungsfrage wird nur an EINER Stelle beantwortet", () => {
  /* brand.js fuehrt HOOK_PROMISES; hook.js fragt danach, statt die
     Regeln zu kopieren. */
  assert.equal(typeof Brand.hookEinloesung, "function");
  const hookQuelle = readFileSync("social/engines/hook.js", "utf8");
  assert.doesNotMatch(hookQuelle, /HOOK_PROMISES\s*=/,
    "hook.js fuehrt eine eigene Versprechensliste");
  assert.match(hookQuelle, /Brand\.hookEinloesung/);
});

test("HK28 · Die Doppel-Schwelle ist dieselbe wie ueberall", () => {
  const hookQuelle = readFileSync("social/engines/hook.js", "utf8");
  assert.match(hookQuelle, /VQ\.GRENZEN\.redundanz/);
  assert.ok(typeof VQ.GRENZEN.redundanz === "number");
});

test("HK29 · Die Zahl des Hooks ist im fertigen Paket belegt", () => {
  /* Der Schreiber baut seine Claims aus den Fakten, die ER benutzt.
     Seit der Hook eigene Werte setzt, reicht das nicht: die
     Faktenpruefung meldete "184,20 USD ohne Beleg", und sie hatte
     recht. Dieser Test fragt am FERTIGEN Paket nach - dort, wo die
     Herkunft dreimal unterwegs verlorengehen kann (Kandidat,
     Feldliste, Nachtrag). */
  const res = Content.run({
    opportunity: { opportunityId: "opp_2", topic: "KI-Rechenzentren",
      entities: ["NVDA"], platform: "instagram" },
    sources: [{ source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: "2026-09-15T11:00:00Z" }],
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { timeSeries: true, keyNumber: true },
    writer: Object.assign(Content.createTemplateWriter(), {
      /* Ein Schreiber, dessen Claims den Hook NICHT decken. Mit der
         Vorlage decken sie ihn zufaellig mit ab, und dann kann dieser
         Test nicht durchfallen. */
      draft: () => ({
        caption: "Kleine Unternehmen ziehen seit Jahren weniger Kapital an, " +
          "und das sieht man inzwischen an der Bewertung sehr deutlich.",
        claims: [], cta: null, hashtags: [] })
    })
  }, { now: NOW });

  assert.equal(res.ok, true, res.explanation);
  const zahlen = String(res.package.hook).match(/\d+(?:[.,]\d+)?/g) || [];
  assert.ok(zahlen.length, "Dieser Hook traegt keine Zahl - der Test misst nichts");
  for (const z of zahlen) {
    assert.ok(res.package.claims.some((c) => String(c.text).indexOf(z) !== -1),
      "Die Zahl " + z + " steht im Hook und in keinem Claim");
  }
  assert.equal(res.package.validation.factCheck.passed, true);
});

test("HK30 · Ein ausgeschlossener Kandidat wird auch nicht gewaehlt", () => {
  /* Das Flag allein genuegt nicht: entfernt man den Filter in
     waehle(), bleibt `zulaessig: false` korrekt stehen - und der
     Kandidat gewinnt trotzdem. Ein Ausschluss, der niemanden
     aufhaelt, ist keiner. */
  const r = H.waehle({ subjekt: "Russell 2000",
    ursache: "Geheimtipp aus dem Casino", bedeutung: "Jackpot" });
  assert.equal(r.ok, false);
  assert.equal(r.gewaehlt, null);
  assert.ok(r.bewertet.every((b) => !b.zulaessig));
});

/* ------------------------------------------------------------------ */
/* §19 — ABWECHSLUNG ENTSCHEIDET BEI GLEICHSTAND, NICHT STATT QUALITAET */
/* ------------------------------------------------------------------ */

const LAGE = {
  opportunity: { topic: "Kleine gegen grosse Unternehmen",
    entities: ["Russell 2000", "S&P 500"] },
  facts: [
    { entity: "Russell 2000", metric: "KGV", value: 13.4, source: "vu.technical" },
    { entity: "S&P 500", metric: "KGV", value: 21.6, source: "vu.technical" }],
  thesis: "Der Bewertungsabstand ist so gross wie lange nicht."
};

test("HK31 · Ein abgenutzter Archetyp verliert seinen Vorsprung", () => {
  /* Der Kreis, den §19 schliesst: feedVariation misst, alsAbschlag
     rechnet, und hier faellt die Entscheidung anders aus. Ohne den
     Abschlag gewinnt ZAHL_MIT_BEZUG mit 66 vor KONTRAST mit 63,33. */
  const ohne = H.waehle(H.ableiten(LAGE));
  assert.equal(ohne.gewaehlt.archetyp, "ZAHL_MIT_BEZUG");

  const mit = H.waehle(Object.assign(H.ableiten(LAGE),
    { abwechslung: { ZAHL_MIT_BEZUG: -H.ABSCHLAG_STAERKE } }));
  assert.equal(mit.gewaehlt.archetyp, "KONTRAST");
});

test("HK32 · Der Abschlag steht als eigener Posten, nicht in der Leistung", () => {
  /* Gemessene Leistung sagt: hat funktioniert. Abwechslung sagt: kam
     zuletzt zu oft. Verrechnet man sie, liesse der Bericht nicht mehr
     erkennen, ob gemessen oder gesteuert wurde. */
  const w = H.waehle(Object.assign(H.ableiten(LAGE), {
    leistung: { ZAHL_MIT_BEZUG: 4 },
    abwechslung: { ZAHL_MIT_BEZUG: -3 } }));
  const b = w.bewertet.find((x) => x.archetyp === "ZAHL_MIT_BEZUG");
  assert.equal(b.teile.leistung, 4);
  assert.equal(b.teile.abwechslung, -3);
  assert.equal(b.leistungGemessen, true);
});

test("HK33 · Ohne gemessene Enge fliesst nichts ein", () => {
  /* Ein Abschlag ohne Messung waere eine Behauptung - und erfundene
     Messungen sind in diesem Projekt schon als Bericht durchgegangen. */
  const w = H.waehle(H.ableiten(LAGE));
  w.bewertet.forEach((b) => {
    assert.equal("abwechslung" in b.teile, false, b.archetyp);
    assert.equal("abwechslungMuster" in b.teile, false, b.archetyp);
  });
});

test("HK34 · Die Bauform des Autors wird eigenstaendig abgeschlagen", () => {
  /* "AUTOR" ist eine Herkunft. Was den Satz baut, ist das Muster -
     und nur so laesst sich ein abgenutzter Schreiber ueberhaupt
     erkennen. */
  const k = H.ableiten(LAGE);
  k.zusaetzlich = [{ archetyp: "AUTOR", text: "Zwei Indizes, ein Abstand von 8,2.",
    muster: "group-count/group-rule-evidence" }];
  const ohne = H.waehle(Object.assign({}, k));
  const autorOhne = ohne.bewertet.find((b) => b.archetyp === "AUTOR");
  assert.equal(autorOhne.muster, "group-count/group-rule-evidence");
  assert.equal("abwechslungMuster" in autorOhne.teile, false);

  const mit = H.waehle(Object.assign({}, k, {
    abwechslungMuster: { "group-count/group-rule-evidence": -7 } }));
  const autorMit = mit.bewertet.find((b) => b.archetyp === "AUTOR");
  assert.equal(autorMit.teile.abwechslungMuster, -7);
  assert.equal(autorMit.punkte, Math.round((autorOhne.punkte - 7) * 100) / 100);
});

test("HK35 · Der Abschlag laesst einen schwachen Hook nicht gewinnen", () => {
  /* §4: keine Schwelle senken. Abwechslung soll bei Gleichstand
     entscheiden - ein Satz, der an einer Tuer scheitert, bleibt
     draussen, egal wie abgenutzt die Konkurrenz ist. */
  const k = H.ableiten(LAGE);
  k.zusaetzlich = [{ archetyp: "AUTOR", text: "Diese Aktie verdoppelt sich sicher." }];
  const w = H.waehle(Object.assign({}, k, {
    abwechslung: { ZAHL_MIT_BEZUG: -50, KONTRAST: -50 } }));
  assert.notEqual(w.gewaehlt.archetyp, "AUTOR");
  const autor = w.bewertet.find((b) => b.archetyp === "AUTOR");
  assert.equal(autor.zulaessig, false);
});

test("HK36 · Bauform und Abschlag reisen durch content.js bis zur Wahl", () => {
  /* Die Kette hat drei Glieder, und jedes ist schon einmal in diesem
     Projekt gerissen: der Schreiber nennt seine Bauform, content.js
     reicht sie an den Kandidaten weiter, hook.js rechnet mit ihr.
     Geprueft wird deshalb der ganze Weg, nicht das mittlere Glied. */
  const lage = {
    opportunity: { opportunityId: "opp_muster", topic: "KI-Rechenzentren",
      entities: ["NVDA"], platform: "instagram" },
    sources: [{ source: "vu.technical", provider: "tiingo", entity: "NVDA",
      metric: "52-Wochen-Hoch", value: "184,20", unit: "USD",
      state: "VERIFIED", observedAt: "2026-09-15T11:00:00Z" }],
    strategyDecision: { platform: "instagram", archetype: "DATA_STORY",
      timeSensitivity: "TIMELY" },
    visualAvailability: { timeSeries: true, keyNumber: true },
    writer: Object.assign(Content.createTemplateWriter(),
      { muster: "metric-frame/evidence-led" })
  };

  const ohne = Content.run(lage, { now: NOW });
  assert.equal(ohne.ok, true, ohne.explanation);
  const autorOhne = ohne.package.hookSelection.bewertet
    .find((b) => b.archetyp === "AUTOR");
  assert.ok(autorOhne, "Der Schreiber tritt nicht als Kandidat an.");
  assert.equal(autorOhne.muster, "metric-frame/evidence-led",
    "Die Bauform ist auf dem Weg verloren gegangen.");
  assert.equal("abwechslungMuster" in autorOhne.teile, false);

  const mit = Content.run(Object.assign({}, lage, {
    hookAbwechslung: { muster: { "metric-frame/evidence-led": -9 } }
  }), { now: NOW });
  const autorMit = mit.package.hookSelection.bewertet
    .find((b) => b.archetyp === "AUTOR");
  assert.equal(autorMit.teile.abwechslungMuster, -9,
    "Der Abschlag ist nicht bis zur Bewertung durchgekommen.");
  assert.equal(autorMit.punkte, Math.round((autorOhne.punkte - 9) * 100) / 100);
});
