/* =========================================================================
   VU SOCIAL — DIE LEITER IM ZYKLUS (LZ1–LZ14)

   §11/§12. Bis zu diesem Auftrag lagen zwei Dinge nebeneinander, die
   zusammengehoeren: der Zyklus, der Inhalte baut, und die Platte, die
   die ganze Breite des Hauses kennt. Der Zyklus bewertete vier
   Gelegenheiten aus dem Ticker; die Platte hielt 32 Themen aus fuenf
   Content Families, 22 davon belegt - und wurde nur angezeigt.

   Diese Datei prueft die Verbindung, und zwar an den Stellen, an denen
   sie brechen wuerde:

     - Nimmt der Zyklus seine Gelegenheiten wirklich aus der Leiter?
     - Faellt er ohne Platte auf den Ticker zurueck? (Er darf nicht.)
     - Bleibt das Evidenztor dasselbe fuer beide Herkuenfte?
     - Bekommt ein Thema ueber zehn Titel ein Format fuer zehn Titel?
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Universe = require("../engines/content-universe.js");
const Ladder   = require("../engines/content-ladder.js");
const Strategy = require("../engines/strategy.js");
const Schema   = require("../engines/schema.js");
const Visual   = require("../engines/visual.js");
const VI       = require("../engines/visual-intelligence.js");
const EP       = require("../engines/evidence-package.js");
const AF       = require("../engines/audience-frame.js");
const DiscoverEvidence = require("../engines/discover-evidence.js");
const AudienceFit = require("../engines/audience-fit.js");

const ZYKLUS = readFileSync(new URL("../../scripts/social/run-social-cycle.mjs",
  import.meta.url), "utf8");

/* -------------------------------------------------------------------
   PRUEFEN, WAS DER LAUF TUT - NICHT, WAS DANEBEN GESCHRIEBEN STEHT

   Ein frueherer Anlauf dieser Datei suchte `evidenceSufficient: false`
   im Quelltext und wurde von einem KOMMENTAR fuendig, der genau diese
   Zeile zitiert ("Bis eben stand hier ..."). Der Test meldete einen
   Fehler, den es nicht mehr gab. Also wird hier zuerst der Fliesstext
   entfernt.
   ------------------------------------------------------------------- */
function ohneKommentare(text) {
  return String(text).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/* Der Rumpf EINER Funktion - bis zur schliessenden Klammer am
   Zeilenanfang. Eine Suche "bis zur naechsten Funktion" nimmt den
   Kommentarblock davor mit und prueft damit fremden Text. */
function funktion(quelle, name) {
  const start = quelle.indexOf("function " + name);
  assert.ok(start >= 0, "Funktion nicht gefunden: " + name);
  const ende = quelle.indexOf("\n}\n", start);
  assert.ok(ende > start, "Funktionsende nicht gefunden: " + name);
  return quelle.slice(start, ende + 3);
}

/* ---------------------------------------------------------------- */

test("LZ1 · Der Zyklus nimmt seine Gelegenheiten aus der Leiter", () => {
  /* Die entscheidende Zeile. Stuende hier wieder
     `candidates = buildOpportunities(...)`, waere die ganze Breite
     erneut abgehaengt - und alles andere in dieser Datei wuerde es
     nicht merken. */
  assert.match(ZYKLUS, /const candidates = leiter\.gefunden\.map/,
    "Die Gelegenheiten des Laufs stammen nicht aus der Leiter");
  assert.match(ZYKLUS, /ContentLadder\.suche\(platte\.themen/,
    "Die Leiter sucht nicht auf der Platte");
});

test("LZ2 · Die Signalgelegenheiten speisen keinen zweiten Inhaltsweg", () => {
  /* Sie werden weiter gebaut und berichtet - als Quelle und fuer die
     Trend-Komponente. Was sie NICHT duerfen: an der Leiter vorbei in
     die Content-Stufe laufen. §12: ein internes Signal ist eine
     Opportunity Source, kein Veroeffentlichungsrecht. */
  const nachDerLeiter = ZYKLUS.slice(ZYKLUS.indexOf("const candidates = leiter.gefunden"));
  const contentTeil = nachDerLeiter.slice(0, nachDerLeiter.indexOf("--- MESSEN ---"));
  assert.ok(!/proposable\s*=\s*signalGelegenheiten/.test(contentTeil));
  assert.ok(!/signalGelegenheiten\.map\(\(c\) =>[\s\S]{0,80}Strategy\.decide/.test(contentTeil));
});

test("LZ3 · Ohne Platte entsteht kein Rueckfall auf den Ticker", () => {
  /* Fail closed. Eine fehlende Platte ist ein Befund, keine
     Einladung, wieder vier Kurssignale zu nehmen. */
  assert.match(ZYKLUS, /KEINE_PLATTE/);
  assert.match(ZYKLUS, /PLATTE_VERALTET/);
  assert.match(ZYKLUS, /PLATTE_OHNE_STAND/);
  /* Und der Leerfall gibt eine leere Themenmenge zurueck, keine
     Ersatzmenge. */
  const fn = ohneKommentare(funktion(ZYKLUS, "platteLesen"));
  assert.ok(!/signalGelegenheiten|buildOpportunities/.test(fn),
    "platteLesen greift im Fehlerfall auf Signale zurueck");
});

test("LZ4 · Ein unmessbares Alter gilt nicht als frisch", () => {
  const fn = funktion(ZYKLUS, "platteLesen");
  /* Die Reihenfolge ist der Punkt: erst wird geprueft, OB ein Alter
     messbar ist, dann, ob es zu gross ist. Andersherum waere
     `NaN > 36` false - und eine Platte ohne Stand ginge als frisch
     durch. */
  assert.ok(fn.indexOf("PLATTE_OHNE_STAND") < fn.indexOf("PLATTE_VERALTET"));
});

/* ------------------------------------------- DAS TOR BLEIBT DASSELBE */

test("LZ5 · Das Brief-Evidenztor hat genau eine Definition", () => {
  const quelle = readFileSync(new URL("../engines/discover-evidence.js",
    import.meta.url), "utf8");
  /* Genau eine Stelle vergleicht gegen die Mindestzahl. */
  const treffer = quelle.match(/n\s*<\s*MINDEST_BELEGE/g) || [];
  assert.equal(treffer.length, 1);
  /* Und die Platte rechnet sie nicht selbst nach. */
  const platte = readFileSync(new URL("../../scripts/social/build-opportunity-slate.mjs",
    import.meta.url), "utf8");
  assert.ok(!/evidenceSufficient:\s*(true|false)\b/.test(ohneKommentare(platte)),
    "Ein Quellenzweig der Platte setzt sein Urteil fest, statt es zu messen");
  assert.match(platte, /evidenceSufficient:\s*DiscoverEvidence\.genuegt/);
});

test("LZ6 · Die Leiter benutzt ohne eigene Angabe das Evidenztor", () => {
  /* Milder darf niemand: ohne `qualifiziert` gilt das Tor, nicht
     "alles zaehlt". */
  const themen = [
    { topicId: "t1", family: "RANKING", evidenceSufficient: false },
    { topicId: "t2", family: "RANKING", evidenceSufficient: true }
  ];
  const b = Ladder.suche(themen, { benoetigt: 1 });
  assert.deepEqual(b.gefunden.map((t) => t.topicId), ["t2"]);
});

/* ------------------------------------ EIN PAKET AUS EINEM THEMA */

test("LZ7 · Ein Thema mit Belegen traegt ein kanonisches Evidenzpaket", () => {
  const thema = {
    topicId: "t", title: "Eine Reihe", asOf: "2026-09-11", sources: ["VU_DISCOVER"],
    evidence: [
      { id: "row-rule", statement: "Die Regel, nach der diese Titel zusammenstehen.",
        source: "discover.row.x" },
      { id: "row-coverage", statement: "37 von 5947 erfuellen das.", source: "discover.row.x" },
      { id: "price-A", entity: "A", metric: "Kurs", value: 1, unit: "USD",
        statement: "A: Kurs 1 USD.", source: "discover.card", observedAt: "2026-09-11" },
      { id: "metric-A", entity: "A", metric: "Umsatz", value: 2,
        statement: "A: Umsatz 2.", source: "discover.card" },
      { id: "story-A", entity: "A", statement: "A macht dies und das.",
        source: "discover.card.plain" }
    ]
  };
  const p = EP.fromTopicEvidence(thema, { now: "2026-09-20T00:00:00Z" });
  assert.equal(p.ok, true);
  const urteil = EP.assessSufficiency(p);
  assert.equal(urteil.sufficient, true, urteil.explanation);
});

test("LZ8 · Die Einordnung ist der Satz UEBER das Thema, nicht ueber einen Titel", () => {
  /* Eine Firmenbeschreibung erklaert die Leitaussage einer Rangliste
     nicht. Wuerde sie als Einordnung zaehlen, bestuende jedes Thema
     mit einer einzigen Kartenerzaehlung das Tor. */
  const nurErzaehlung = {
    topicId: "t", title: "X", asOf: "2026-09-11",
    evidence: [
      { id: "story-A", entity: "A", statement: "A macht dies.", source: "s" },
      { id: "story-B", entity: "B", statement: "B macht das.", source: "s" },
      { id: "story-C", entity: "C", statement: "C macht jenes.", source: "s" },
      { id: "price-A", entity: "A", metric: "Kurs", value: 1, unit: "USD",
        statement: "A: Kurs 1 USD.", source: "s", observedAt: "2026-09-11" },
      { id: "price-B", entity: "B", metric: "Kurs", value: 2, unit: "USD",
        statement: "B: Kurs 2 USD.", source: "s", observedAt: "2026-09-11" }
    ]
  };
  const p = EP.fromTopicEvidence(nurErzaehlung, {});
  assert.ok(!p.evidence.some((e) => e.interpretation),
    "Ein Satz ueber einen einzelnen Titel gilt als Einordnung");
  assert.equal(EP.assessSufficiency(p).sufficient, false);
});

test("LZ9 · Das Sufficiency-Tor erkennt die Einordnung nicht mehr am Namen", () => {
  /* Vorher hing es an zwei festen Kennungen aus dem Quant-Bundle.
     Jede andere Bauart konnte es nie bestehen - nicht, weil ihr die
     Einordnung fehlte, sondern weil sie anders heisst. */
  const quelle = readFileSync(new URL("../engines/evidence-package.js",
    import.meta.url), "utf8");
  const stelle = quelle.slice(quelle.indexOf("var hatBedeutung"));
  assert.match(stelle.slice(0, 300), /e\.interpretation === true/);
});

/* ------------------------------------- EIN FORMAT FUER ZEHN TITEL */

test("LZ10 · Ein Archetyp fuer EINEN Titel passt nicht auf zehn", () => {
  const zehn = {
    opportunityId: "o1", timeSensitivity: "TIMELY", hasNumbers: true,
    hasCause: false, premise: "SECURITY_METRIC", entityCount: 10
  };
  const d = Strategy.decide(zehn, { archetypeKnowledge: {}, recentArchetypeUsage: {} },
    { currentHour: 12 });
  assert.equal(d.decidable, true, d.explanation);
  assert.notEqual(d.archetype, "STOCK_STORY",
    "Eine Rangliste ueber zehn Titel bekommt das Format fuer einen");
  /* `null` heisst hier "keine Formvorgabe fuer diese Familie" und ist
     erlaubt; `false` waere die Ablehnung, die nicht passiert sein
     darf. Auf `true` zu pruefen hiesse, jeder Familie eine Vorgabe zu
     unterstellen, die es nicht gibt. */
  assert.notEqual(Universe.archetypePassesEntityShape(d.archetype, 10), false);
});

test("LZ11 · Derselbe Anlass mit EINEM Titel darf STOCK_STORY sein", () => {
  /* Die Gegenprobe. Ohne sie koennte LZ10 auch dadurch gruen sein,
     dass STOCK_STORY ueberhaupt nie gewaehlt wird. */
  assert.equal(Universe.archetypePassesEntityShape("STOCK_STORY", 1), true);
  assert.equal(Universe.archetypePassesEntityShape("STOCK_STORY", 10), false);
});

test("LZ12 · Unbekannte Anzahl filtert nicht", () => {
  /* Eine Ablehnung ohne Wissen waere keine Pruefung. `null` heisst
     nicht entscheidbar - und dann wird nicht entschieden. */
  assert.equal(Universe.archetypePassesEntityShape("STOCK_STORY", null), null);
  assert.equal(Universe.archetypePassesEntityShape("STOCK_STORY", "viele"), null);
  assert.equal(Universe.archetypePassesEntityShape("NICHT_EXISTENT", 1), null);
});

/* --------------------------------------- EINE VOKABEL, EIN ORT */

test("LZ13 · Bildformen: visual.js und Schema kennen dieselbe Menge", () => {
  /* SCORE, PERFORMANCE und COMPARISON gab es in drei Stufen und im
     Schema nicht - der Zyklus brach ab, sobald eine davon gewaehlt
     wurde. Zwei Listen fuer eine Vokabel gehen auseinander. */
  const ausVisual = Object.keys(Visual.VISUAL_REQUIREMENTS || {});
  assert.ok(ausVisual.length > 0, "visual.js nennt keine Formen");
  for (const f of ausVisual) {
    assert.ok(Schema.VISUAL_TYPES.includes(f), "im Schema fehlt: " + f);
  }
  for (const f of Schema.VISUAL_TYPES) {
    assert.ok(VI.FORMEN[f], "keine Bildrichtung fuer: " + f);
  }
});

test("LZ14 · Die Familie eines Archetyps steht an genau einer Stelle", () => {
  assert.equal(AF.FAMILIE_AUS_ARCHETYP, Universe.FAMILY_FOR_ARCHETYPE,
    "audience-frame.js fuehrt eine eigene Kopie der Tabelle");
});

/* =========================================================================
   DER TEXT EINER REIHE (LZ15–LZ26)

   Der erste Lauf ueber die Content Ladder erzeugte fuenf Pakete - und
   der Einstieg lautete "412,53 USD - Valero Energy, Kurs." fuer eine
   Rangliste ueber zehn Unternehmen. Belegt, und trotzdem falsch am
   Platz.

   Alles hier prueft dieselbe Grundannahme, die an sechs Stellen
   steckte: dass ein Thema von GENAU EINEM Titel handelt.
   ========================================================================= */

const Template = require("../providers/authoring/template/adapter.js");
const German   = require("../engines/german-text.js");

test("LZ15 · Der Einstieg einer Reihe spricht ueber die Reihe", () => {
  const brief = {
    topic: "Bekannte Namen in Bewegung", entityNames: {}, evidence: [
      { id: "row-coverage", entity: null, metric: "von 5951 geprueften Titeln",
        value: 33, statement: "33 von 5951 geprueften Titeln erfuellen das.",
        source: "discover.row.x" },
      { id: "price-A", entity: "Valero Energy", metric: "Kurs", value: 412.53,
        unit: "USD", statement: "Valero Energy: Kurs 412,53 USD.", source: "discover.card" },
      { id: "price-B", entity: "Salesforce", metric: "Kurs", value: 242.85,
        unit: "USD", statement: "Salesforce: Kurs 242,85 USD.", source: "discover.card" },
      { id: "price-C", entity: "HP Inc", metric: "Kurs", value: 34.66,
        unit: "USD", statement: "HP Inc: Kurs 34,66 USD.", source: "discover.card" }
    ], constraints: {}, allowCausality: false
  };
  const r = Template.createTemplateAuthor({}).write(brief, {});
  assert.ok(r.variants.length > 0, r.reason);
  for (const v of r.variants) {
    assert.ok(/Bekannte Namen in Bewegung/.test(v.hook),
      "Der Einstieg nennt die Reihe nicht: " + v.hook);
    assert.ok(!/^412|^242|^34,66/.test(v.hook),
      "Der Einstieg beginnt mit dem Kurs EINES Mitglieds: " + v.hook);
    /* Und zwar mit den Mustern FUER eine Reihe. Ohne diese Zeile
       waere der Test auch dann gruen, wenn die Muster fuer einen
       einzelnen Titel zufaellig etwas Brauchbares ergeben - der
       Einstieg lautete dann "33 - Bekannte Namen in Bewegung, von
       5951 geprueften Titeln.", was ein Satz ist, aber keiner, den
       jemand geschrieben haette. */
    assert.match(v.pattern, /^group-/,
      "Kein Muster fuer eine Reihe: " + v.pattern);
  }
});

test("LZ15b · Der Leitbeleg ist der Satz ueber das Ganze, egal an welcher Stelle", () => {
  /* Die Reihenfolge der Belege ist nicht zugesichert. Steht ein Kurs
     vorn, darf der Einstieg trotzdem nicht ueber diesen einen Titel
     sprechen. */
  const brief = {
    topic: "Eine Reihe", entityNames: {}, evidence: [
      { id: "price-A", entity: "A", metric: "Kurs", value: 1.11, unit: "USD",
        statement: "A: Kurs 1,11 USD.", source: "s" },
      { id: "price-B", entity: "B", metric: "Kurs", value: 2.22, unit: "USD",
        statement: "B: Kurs 2,22 USD.", source: "s" },
      { id: "price-C", entity: "C", metric: "Kurs", value: 3.33, unit: "USD",
        statement: "C: Kurs 3,33 USD.", source: "s" },
      { id: "row-coverage", entity: null, metric: "von 100 geprueften Titeln",
        value: 7, statement: "7 von 100 geprueften Titeln erfuellen das.", source: "s" }
    ], constraints: {}, allowCausality: false
  };
  for (const v of Template.createTemplateAuthor({}).write(brief, {}).variants) {
    assert.match(v.pattern, /^group-/, v.pattern);
    assert.ok(/7 von 100/.test(v.hook), "Der Einstieg nimmt nicht den Satz " +
      "ueber das Ganze: " + v.hook);
  }
});

test("LZ16 · Bei genau einem Titel bleibt es beim Einstieg fuer diesen Titel", () => {
  /* Die Gegenprobe. Ohne sie koennte LZ15 auch dadurch gruen sein,
     dass die Muster fuer einen einzelnen Titel gar nicht mehr laufen. */
  const brief = {
    topic: "Technische Lage: Apple", entityNames: {}, evidence: [
      { id: "score", entity: "Apple", metric: "Score", value: 76,
        statement: "Apple: Score 76.", source: "vu.technical" }
    ], constraints: {}, allowCausality: false
  };
  const r = Template.createTemplateAuthor({}).write(brief, {});
  assert.ok(r.variants.length > 0, r.reason);
  assert.ok(r.variants.some((v) => /Apple/.test(v.hook)));
  assert.ok(Template.createTemplateAuthor({}).write(brief, {}).variants
    .every((v) => /^(value|subject|metric|limit)-/.test(v.pattern)),
    "Ein Einzeltitel bekommt die Muster einer Reihe");
});

test("LZ17 · Jeder zitierte Belegsatz traegt einen Claim", () => {
  /* Sonst findet die Faktenpruefung Geldbetraege ohne Beleg - obwohl
     der Beleg im Brief lag und nur nicht deklariert war. */
  const brief = {
    topic: "Eine Reihe", entityNames: {}, evidence: [
      { id: "row-coverage", entity: null, metric: "von 100 geprueften Titeln",
        value: 7, statement: "7 von 100 geprueften Titeln erfuellen das.", source: "s" },
      { id: "price-A", entity: "A", metric: "Kurs", value: 1.11, unit: "USD",
        statement: "A: Kurs 1,11 USD.", source: "s" },
      { id: "price-B", entity: "B", metric: "Kurs", value: 2.22, unit: "USD",
        statement: "B: Kurs 2,22 USD.", source: "s" },
      { id: "price-C", entity: "C", metric: "Kurs", value: 3.33, unit: "USD",
        statement: "C: Kurs 3,33 USD.", source: "s" }
    ], constraints: {}, allowCausality: false
  };
  for (const v of Template.createTemplateAuthor({}).write(brief, {}).variants) {
    const text = v.hook + " " + v.caption + " " + v.visualLine;
    for (const e of brief.evidence) {
      if (text.indexOf(e.statement) === -1) continue;
      assert.ok(v.claims.some((c) => String(c.text).indexOf(e.statement) !== -1 ||
                                     e.statement.indexOf(String(c.text)) !== -1),
        "Zitiert, aber nicht deklariert: " + e.statement + " (" + v.pattern + ")");
    }
  }
});

/* ------------------------------------------- DIE SCHREIBWEISE */

test("LZ18 · Versalien werden zu lesbaren Titeln", () => {
  assert.equal(German.titelfall("BEKANNTE NAMEN IN BEWEGUNG"), "Bekannte Namen in Bewegung");
  assert.equal(German.titelfall("CASHFLOW-MASCHINEN"), "Cashflow-Maschinen");
});

test("LZ19 · Was keine gewoehnliche Schreibweise ist, bleibt unberuehrt", () => {
  /* "S&p 500" waere eine Schreibweise, die es nicht gibt. */
  assert.match(German.titelfall("STÄRKSTE AKTIEN IM S&P 500"), /S&P 500/);
  assert.match(German.titelfall("3M UND CO"), /^3M /);
  /* Und ein Titel, der nicht durchgehend gross ist, wird nicht
     angefasst: dort hat jemand die Schreibweise entschieden. */
  assert.equal(German.titelfall("Bekannte Namen in Bewegung"), "Bekannte Namen in Bewegung");
});

test("LZ20 · Umschriebene Umlaute in 'fuellen' werden erkannt", () => {
  /* "uelle" steht in der Liste echter deutscher Folgen (aktuelle,
     Quelle) - und liess damit jede Form von "fuellen" durch beide
     Netze. Das Markentor sah nur den Fehler daneben. */
  assert.equal(German.clean("erfuellen").text, "erfüllen");
  assert.equal(German.clean("Fuelle").text, "Fülle");
  /* Die echten bleiben, wie sie sind. */
  assert.equal(German.clean("aktuelle").text, "aktuelle");
  assert.equal(German.clean("Quelle").text, "Quelle");
  assert.equal(German.clean("individuelle").text, "individuelle");
});

/* --------------------------------------- DIE SKALA IM EINSTIEG */

test("LZ21 · Eine benannte gezaehlte Menge erklaert ihre Zahl", () => {
  const k = (hook) => AudienceFit.check({ hook, caption: "x", names: {} })
    .criteria.find((c) => c.id === "scaleSelfExplaining");
  assert.equal(k("33 von 5951 geprüften Titeln — Bekannte Namen.").passed, true);
  assert.equal(k("12 von 30 Unternehmen erfüllen die Regel.").passed, true);
});

test("LZ22 · Eine blanke Skala bleibt erklaerungsbeduerftig", () => {
  const k = (hook) => AudienceFit.check({ hook, caption: "x", names: {} })
    .criteria.find((c) => c.id === "scaleSelfExplaining");
  assert.equal(k("Apple: 76 von 100.").passed, false);
  /* "im Vergleich" nennt nicht, WAS gemessen wurde - ein
     grossgeschriebenes Wort nach der Zahl genuegt also nicht. */
  assert.equal(k("Apple: 76 von 100 im Vergleich.").passed, false);
  assert.equal(k("Apple: 76 von 100 und damit stark.").passed, false);
});

/* ------------------------------------ DIE ZAHL, DIE GELESEN WIRD */

test("LZ23 · Die Anzeige der Quelle erklaert die Einheit", () => {
  const a = DiscoverEvidence.ausAnzeige("+159 %");
  assert.equal(a.ok, true);
  assert.equal(a.value, 159);
  assert.equal(a.unit, "%");
  /* Das typografische Minus der Anzeige ist kein Tastaturminus. Wer
     nur "-" prueft, liest jeden Verlust als Gewinn. */
  assert.equal(DiscoverEvidence.ausAnzeige("−1,4 %").value, -1.4);
  assert.equal(DiscoverEvidence.ausAnzeige("1.59171").ok, false);
  assert.equal(DiscoverEvidence.ausAnzeige("").ok, false);
});

test("LZ24 · Margen bleiben strikt, auch mit Anzeige", () => {
  /* Der Kopf von discover-evidence.js hat fuer Margen entschieden:
     nicht uebernehmen, solange die Quelle die Einheit nicht erklaert.
     Diese Entscheidung ueber die Anzeige zu umgehen waere genau das,
     was hier nie passieren soll. */
  const quelle = readFileSync(new URL("../engines/discover-evidence.js",
    import.meta.url), "utf8");
  assert.match(quelle, /istMarge\(z\.label\)\s*\?\s*\{\s*ok:\s*false/);
  const reihe = JSON.parse(readFileSync(new URL(
    "../../discover/data/rows/US_REAL/cashflow-maschinen.json", import.meta.url), "utf8"));
  const e = DiscoverEvidence.fromRow(reihe);
  assert.equal(e.evidence.filter((x) => /marge/i.test(x.metric || "")).length, 0);
});

/* ------------------------------------- DIE DRINGLICHKEIT UND DIE GRUPPE */

test("LZ25 · Die Dringlichkeit folgt dem Alter der Daten", () => {
  const F = require("../engines/fact-check.js");
  const jetzt = "2026-09-20T12:00:00Z";
  assert.equal(F.dringlichkeitFuer("2026-09-20T11:00:00Z", jetzt), "BREAKING");
  assert.equal(F.dringlichkeitFuer("2026-09-19T12:00:00Z", jetzt), "TIMELY");
  assert.equal(F.dringlichkeitFuer("2026-09-11", jetzt), "EVERGREEN");
  /* Ohne Stand keine Frische. */
  assert.equal(F.dringlichkeitFuer(null, jetzt), "EVERGREEN");
  /* Und die Platte behauptet sie nicht mehr selbst. */
  const platte = readFileSync(new URL("../../scripts/social/build-opportunity-slate.mjs",
    import.meta.url), "utf8");
  assert.ok(!/timeSensitivity:\s*"(TIMELY|BREAKING)"/.test(ohneKommentare(platte)),
    "Eine Quelle der Platte setzt ihre Dringlichkeit fest");
});

test("LZ26 · Die Familie entscheidet nur, wo sonst der Zufall entschied", () => {
  /* Als EIGNUNG war sie zu viel: fuer RANKING gibt es genau ein
     Format, und damit gaebe es nichts mehr zu erkunden. Gemessene
     Leistung muss sie schlagen koennen. */
  const gemessen = {
    archetypeKnowledge: { OPPORTUNITY_RISK: { mean: 0.8, sampleSize: 8 } },
    recentArchetypeUsage: {}
  };
  /* TIMELY, weil OPPORTUNITY_RISK nur dort zulaessig ist - ein
     Wettbewerber, der gar nicht antreten darf, beweist nichts. */
  const thema = {
    opportunityId: "o1", timeSensitivity: "TIMELY", hasNumbers: true,
    hasCause: false, premise: "SECURITY_METRIC", entityCount: 10, family: "RANKING"
  };
  const ohneWissen = Strategy.decide(thema,
    { archetypeKnowledge: {}, recentArchetypeUsage: {} }, { currentHour: 12 });
  assert.equal(ohneWissen.archetype, "RANKING_LIST", ohneWissen.explanation);

  const mitWissen = Strategy.decide(thema, gemessen, { currentHour: 12 });
  assert.equal(mitWissen.archetype, "OPPORTUNITY_RISK",
    "Gemessene Leistung wird von der Familientabelle ueberstimmt");
});
