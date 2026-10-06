/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/source-registry.test.mjs

   NICHT AKTIVIERT IST NICHT KAPUTT

   Eine Quelle kann aus vier Gruenden nichts liefern, und drei davon
   sagen etwas ueber die Technik. Der vierte sagt etwas ueber eine
   Entscheidung: NOT_ACTIVATED_BY_OWNER.

   Diese Tests halten fest, was daraus folgt - und vor allem, was NICHT
   folgt: keine Anfrage, keine Warnung, kein Gewicht, und unter keinen
   Umstaenden eine 0.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require("../engines/source-registry.js");
const Opportunity = require("../engines/opportunity.js");

const AUS = {
  decidedAt: "2026-09-20",
  sources: {
    INSTAGRAM_PUBLIC_CONTENT: { state: "NOT_ACTIVATED_BY_OWNER", reason: "Owner-Entscheidung." },
    YOUTUBE_EXTERNAL_INTELLIGENCE: { state: "NOT_ACTIVATED_BY_OWNER", reason: "Owner-Entscheidung." }
  }
};

/* ------------------------------------------------ Der Zustand selbst */

test("SR1 · Null aktive Sensoren sind ein Betriebszustand, kein Mangel", () => {
  const s = R.status(AUS);
  assert.equal(s.activeCount, 0);
  assert.equal(s.externalIntelligence, "NO_ACTIVE_EXTERNAL_SOURCE");
  /* Der entscheidende Satz: der Graph laeuft weiter. */
  assert.equal(s.blocksGraph, false);
  assert.match(s.explanation, /gueltiger Betriebszustand/);
});

test("SR2 · Eine bewusst abgeschaltete Quelle warnt nicht", () => {
  /* Wer eine Entscheidung taeglich als Vorfall meldet, erzieht zum
     Wegsehen - und irgendwann uebersieht jemand den echten Vorfall. */
  const s = R.status(AUS);
  assert.equal(s.anyWarning, false);
  for (const x of s.sensors) assert.equal(x.warns, false);
});

test("SR3 · Ein echter Providerfehler warnt sehr wohl", () => {
  /* Die Gegenprobe: die Stille gilt der Entscheidung, nicht dem Defekt. */
  const kaputt = { sources: { INSTAGRAM_PUBLIC_CONTENT: { state: "PROVIDER_ERROR" },
    YOUTUBE_EXTERNAL_INTELLIGENCE: { state: "NOT_ACTIVATED_BY_OWNER" } } };
  const s = R.status(kaputt);
  assert.equal(s.anyWarning, true);
  assert.equal(s.sensors.find((x) => x.id === "INSTAGRAM_PUBLIC_CONTENT").warns, true);
  assert.equal(s.sensors.find((x) => x.id === "YOUTUBE_EXTERNAL_INTELLIGENCE").warns, false);
});

test("SR4 · Ohne Eintrag gilt: nicht aktiviert", () => {
  /* Die sichere Richtung. Eine Quelle, die niemand eingeschaltet hat,
     ist aus - nicht an. */
  const s = R.status(null);
  assert.equal(s.activeCount, 0);
  for (const x of s.sensors) assert.equal(x.state, "NOT_ACTIVATED_BY_OWNER");
});

/* --------------------------------------------- Keine Anfragen, nirgends */

test("SR5 · Gegen eine nicht aktivierte Quelle wird nicht angefragt", () => {
  for (const id of ["INSTAGRAM_PUBLIC_CONTENT", "YOUTUBE_EXTERNAL_INTELLIGENCE"]) {
    const d = R.darfAnfragen(AUS, id);
    assert.equal(d.allowed, false, id);
    assert.match(d.explanation, /kein Fehler, sondern die Entscheidung/);
  }
});

test("SR6 · Gegen eine aktive Quelle darf angefragt werden", () => {
  const an = { sources: { INSTAGRAM_PUBLIC_CONTENT: { state: "ACTIVE" } } };
  assert.equal(R.darfAnfragen(an, "INSTAGRAM_PUBLIC_CONTENT").allowed, true);
});

test("SR7 · Eine unbekannte Quelle wird nicht stillschweigend erlaubt", () => {
  const d = R.darfAnfragen(AUS, "GIBT_ES_NICHT");
  assert.equal(d.allowed, false);
});

/* ------------------------------------------- Die Dimension in der Bewertung */

test("SR8 · Die abgeschaltete Dimension ist NOT_ACTIVE und traegt kein Gewicht", () => {
  const d = R.dimensionZustand(AUS, "externalInterest");
  assert.equal(d.state, "NOT_ACTIVE");
  assert.equal(d.available, false);
  assert.equal(d.carriesWeight, false);
  /* Und ausdruecklich KEIN Wert - auch nicht 0. */
  assert.equal(d.value, null);
  assert.match(d.explanation, /keine Messung mit dem Ergebnis null/);
});

test("SR9 · Abgeschaltet zieht genauso wenig ab wie systemisch unmessbar", () => {
  /* Fuer die RECHNUNG verhalten sich beide gleich. Der Unterschied
     liegt in der Erklaerung - und die ist der Grund fuer das Feld. */
  const eingang = { trendScore: 75, audienceInterest: 0.7, platformFit: 0.8,
    hoursSinceTrigger: 3, contentGap: 0.6, brandFit: 0.8 };
  const systemisch = Opportunity.score(eingang,
    { systemicallyUnavailable: ["externalInterest"] });
  const abgeschaltet = Opportunity.score(eingang,
    { notActivated: ["externalInterest"] });

  assert.equal(abgeschaltet.score, systemisch.score);
  assert.equal(abgeschaltet.reachableCoverage, systemisch.reachableCoverage);
});

test("SR10 · Der Grund steht im Ergebnis, nicht nur in der Rechnung", () => {
  const eingang = { trendScore: 75, audienceInterest: 0.7, platformFit: 0.8,
    hoursSinceTrigger: 3, contentGap: 0.6, brandFit: 0.8 };
  const r = Opportunity.score(eingang, { notActivated: ["externalInterest"] });
  assert.deepEqual(r.notActivated, ["externalInterest"]);
  const m = r.missing.find((x) => x.dimension === "externalInterest");
  assert.equal(m.cause, "NOT_ACTIVATED");
  /* Und NICHT als systemisch unmessbar gefuehrt - ein Grund je
     Dimension, sonst stehen zwei Erklaerungen fuer eine Luecke. */
  assert.equal(r.systemicallyUnavailable.includes("externalInterest"), false);
});

test("SR11 · Abgeschaltet gewinnt gegen systemisch, wenn beides angegeben ist", () => {
  const eingang = { trendScore: 75, audienceInterest: 0.7, platformFit: 0.8,
    hoursSinceTrigger: 3, contentGap: 0.6, brandFit: 0.8 };
  const r = Opportunity.score(eingang, {
    systemicallyUnavailable: ["externalInterest"],
    notActivated: ["externalInterest"] });
  assert.deepEqual(r.notActivated, ["externalInterest"]);
  assert.deepEqual(r.systemicallyUnavailable, []);
});

/* ------------------------------------------- Der Code bleibt, er ruht nur */

test("SR12 · Jede ruhende Quelle nennt ihre Bestandteile und den Weg zurueck", () => {
  /* Die Liste ist keine Zierde: sie ist, was NICHT geloescht werden
     darf und was spaeter ohne Architekturumbau wieder angeht. */
  const s = R.status(AUS);
  for (const x of s.sensors) {
    assert.ok(x.components.length > 0, x.id);
    assert.ok(x.reactivation && x.reactivation.length > 10, x.id);
  }
});

test("SR13 · Die genannten Bestandteile existieren wirklich", () => {
  /* Eine Liste, die auf geloeschte Dateien zeigt, ist schlimmer als
     keine - sie behauptet, etwas sei erhalten geblieben. */
  const s = R.status(AUS);
  const fehlend = [];
  for (const x of s.sensors) {
    for (const p of x.components) if (!existsSync(p)) fehlend.push(p);
  }
  assert.deepEqual(fehlend, [], "Ruhend heisst erhalten: " + fehlend.join(", "));
});

test("SR14 · Der reale Bestand steht auf NOT_ACTIVATED_BY_OWNER", () => {
  /* Gegen die echte Datei, nicht gegen eine Fixture. */
  const pfad = "social/data/external-sources.json";
  assert.ok(existsSync(pfad));
  const b = JSON.parse(readFileSync(pfad, "utf8"));
  const s = R.status(b);
  assert.equal(s.externalIntelligence, "NO_ACTIVE_EXTERNAL_SOURCE");
  for (const x of s.sensors) {
    assert.equal(x.state, "NOT_ACTIVATED_BY_OWNER", x.id);
    /* Kein FAILED, kein UNAVAILABLE_FOREVER - der Auftrag nennt sie
       ausdruecklich als das, was hier NICHT stehen darf. */
    assert.notEqual(x.state, "FAILED");
    assert.notEqual(x.state, "PROVIDER_ERROR");
    assert.notEqual(x.state, "UNAVAILABLE_FOREVER");
    /* Und eine Begruendung, damit spaeter niemand raten muss. */
    assert.ok(x.reason && x.reason.length > 10, x.id);
  }
});
