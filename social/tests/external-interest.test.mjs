/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/external-interest.test.mjs

   EXTERNES INTERESSE IST EINE EIGENE DIMENSION

   Es waere bequem gewesen, fremde Aufmerksamkeit in `audienceInterest`
   einzurechnen. Dann haette eine einzige Zahl zwei verschiedene Dinge
   behauptet: dass UNSER Publikum ein Thema will, und dass IRGENDWER
   darueber spricht. Das erste ist eine Wirkung, das zweite eine
   Haeufigkeit.

   Diese Tests halten die Trennung fest — und die drei Weigerungen, die
   sie noetig macht:

     1. Ohne Beobachtungen wird nichts behauptet, auch nicht "wenig".
     2. Eine Zuordnung entsteht ueber beobachtete Hashtags, nie ueber
        Textaehnlichkeit.
     3. Was fehlt, ist SYSTEMISCH unmessbar und nicht "am Thema fehlend"
        — sonst haette das Anbinden einer Quelle jede bestehende
        Gelegenheit nachtraeglich schlechter gemacht.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SO = require("../engines/social-opportunity.js");
const Opportunity = require("../engines/opportunity.js");

const THEMA = { topicId: "t1", topic: "Halbleiter", family: "MARKT",
                sources: ["VU_QUANT"], observedHashtags: ["aktien", "chips"] };

function beobachtungen(n, kategorie) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push({ topicCategory: kategorie, hookArchetype: "QUESTION" });
  return out;
}

/* ------------------------------------------------- Die drei Weigerungen */

test("XI1 · Ohne externe Beobachtungen wird nichts behauptet", () => {
  const r = SO.externesInteresse(THEMA, [], {});
  assert.equal(r.available, false);
  assert.equal(r.value, null);
  /* Entscheidend ist die Begruendung: keine Messung, kein Befund. */
  assert.match(r.explanation, /Abwesenheit/);
  assert.doesNotMatch(r.explanation, /gering|niedrig|kein Interesse/i);
});

test("XI2 · Ohne beobachtete Hashtags gibt es keine Zuordnung", () => {
  const ohne = Object.assign({}, THEMA, { observedHashtags: [] });
  const r = SO.externesInteresse(ohne, beobachtungen(20, "aktien"), {});
  assert.equal(r.available, false);
  /* Zwanzig Beobachtungen liegen vor — sie betreffen dieses Thema nur
     nicht nachweislich. Eine Zuordnung ueber Textaehnlichkeit waere
     eine Erfindung. */
  assert.equal(r.value, null);
});

test("XI3 · Eine zu kleine Stichprobe ist eine Anekdote", () => {
  const b = beobachtungen(3, "aktien").concat(beobachtungen(20, "kochen"));
  const r = SO.externesInteresse(THEMA, b, {});
  assert.equal(r.available, false);
  assert.equal(r.sample, 3);
  assert.match(r.explanation, /ab 10/);
});

/* ------------------------------------------------------ Was gemessen wird */

test("XI4 · Gemessen wird ein Anteil, nie eine absolute Reichweite", () => {
  const b = beobachtungen(15, "aktien").concat(beobachtungen(5, "kochen"));
  const r = SO.externesInteresse(THEMA, b, {});
  assert.equal(r.available, true);
  assert.equal(r.value, 0.75);
  assert.equal(r.sample, 15);
  /* Die Erklaerung muss die Verwechslung ausschliessen, die das Mass
     nahelegt. */
  assert.match(r.explanation, /Haeufigkeit ist keine Wirkung/);
});

test("XI5 · Der Anteil bleibt relativ — zehnmal so viele Kanaele aendern ihn nicht", () => {
  const klein = SO.externesInteresse(THEMA, beobachtungen(15, "aktien").concat(beobachtungen(5, "kochen")), {});
  const gross = SO.externesInteresse(THEMA, beobachtungen(150, "aktien").concat(beobachtungen(50, "kochen")), {});
  assert.equal(klein.value, gross.value);
});

/* --------------------------------------------- Trennung im Score selbst */

test("XI6 · Externes Interesse ist eine eigene Dimension, nicht Publikumsinteresse", () => {
  const nurExtern = Opportunity.score({
    vuSignalStrength: 0.8, externalInterest: 0.9, platformFit: 0.8,
    hoursSinceTrigger: 2, contentGap: 0.6, brandFit: 0.8
  }, { notApplicable: ["editorialBasis"] });
  assert.equal(nurExtern.components.externalInterest.available, true);
  /* Fremde Aufmerksamkeit beantwortet die Frage nach dem eigenen
     Publikum NICHT. */
  assert.equal(nurExtern.components.audienceInterest.available, false);
  assert.ok(nurExtern.missing.some((m) => m.dimension === "audienceInterest"));
});

test("XI7 · Eigenes Publikum wiegt schwerer als fremde Aufmerksamkeit", () => {
  const basis = { vuSignalStrength: 0.8, platformFit: 0.8, hoursSinceTrigger: 2,
                  contentGap: 0.6, brandFit: 0.8 };
  const opt = { notApplicable: ["editorialBasis"] };
  const eigen = Opportunity.score(Object.assign({}, basis, { audienceInterest: 1 }), opt);
  const fremd = Opportunity.score(Object.assign({}, basis, { externalInterest: 1 }), opt);
  const gEigen = eigen.components.audienceInterest;
  const gFremd = fremd.components.externalInterest;
  assert.equal(gEigen.available, true);
  assert.equal(gFremd.available, true);
  /* Beide mit Wert 1 — der Unterschied im Score kann nur aus dem
     Gewicht stammen. Dass er in DIESE Richtung zeigt, ist die
     inhaltliche Aussage: fremde Wirkung ist nicht unsere. */
  assert.ok(eigen.score > fremd.score,
    "Ein volles eigenes Publikumssignal muss mehr wiegen als ein volles fremdes");
});

/* --------------------------------- Die Dimension darf nichts rueckwirkend brechen */

test("XI8 · Eine fehlende externe Quelle ist systemisch, nicht Sache des Themas", () => {
  const eingang = { trendScore: 75, audienceInterest: 0.7, platformFit: 0.8,
                    hoursSinceTrigger: 3, contentGap: 0.6, brandFit: 0.8 };
  const alsLuecke = Opportunity.score(eingang, {});
  const alsSystemisch = Opportunity.score(eingang, {
    systemicallyUnavailable: ["externalInterest"] });
  /* Die BERICHTETE Abdeckung bleibt gleich: die Luecke wird nicht
     versteckt. */
  assert.equal(alsLuecke.coverage, alsSystemisch.coverage);
  /* Die ERREICHBARE steigt, weil das System die Frage nicht stellen
     kann — und das ist kein Befund ueber dieses Thema. */
  assert.ok(alsSystemisch.reachableCoverage > alsLuecke.reachableCoverage);
  assert.ok(alsSystemisch.systemicallyUnavailable.indexOf("externalInterest") !== -1);
});

test("XI9 · rank() erklaert externes Interesse als systemisch unmessbar, nicht als unanwendbar", () => {
  const erg = SO.rank([THEMA], {
    scorer: Opportunity.score,
    signals: { t1: { vuSignalStrength: 0.8, platformFit: 0.8, hoursSinceTrigger: 2,
                     contentGap: 0.6, brandFit: 0.8, audienceInterest: 0.5 } },
    externalObservations: []
  });
  const b = erg.ranked.concat(erg.rejected)[0];
  assert.equal(b.externalInterest.available, false);
  /* Nicht unanwendbar: die Frage stellt sich, sie ist nur unbeantwortet. */
  assert.equal(b.notApplicable.indexOf("externalInterest"), -1);
});

test("XI10 · Externe Beobachtungen tragen nie eine Leistungsprognose", () => {
  const erg = SO.rank([THEMA], {
    scorer: Opportunity.score,
    signals: { t1: { vuSignalStrength: 0.8, platformFit: 0.8, hoursSinceTrigger: 2,
                     contentGap: 0.6, brandFit: 0.8, audienceInterest: 0.5 } },
    externalObservations: beobachtungen(15, "aktien").concat(beobachtungen(5, "kochen"))
  });
  assert.equal(erg.predictsPerformance, false);
  const b = erg.ranked[0];
  assert.equal(b.externalInterest.available, true);
  assert.equal(b.predictsPerformance, false);
});
