/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/external-patterns.test.mjs

   Aus einem fremden Beitrag wird ein ARCHETYP. Der Text geht hinein und
   kommt nicht heraus.

   Das ist keine Absichtserklaerung, sondern eine pruefbare Eigenschaft:
   NS-Tests halten fest, dass die Struktur kein Textfeld HAT; diese hier
   halten fest, dass auch nichts durch ein anderes Feld entkommt.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { abstrahiere } from "../../scripts/social/ingest-external-observation.mjs";

const require = createRequire(import.meta.url);
const P = require("../engines/external-patterns.js");

const ROH = {
  observedAt: "2026-09-19T18:00:00Z",
  results: [{
    hashtag: "aktien", ok: true, edge: "top",
    media: [
      { id: "1", media_type: "CAROUSEL_ALBUM", like_count: 1200, comments_count: 85,
        timestamp: "2026-09-18T10:00:00+0000",
        caption: "Warum viele Anleger genau jetzt den größten Fehler machen" },
      { id: "2", media_type: "VIDEO", like_count: 3000, comments_count: 60,
        timestamp: "2026-09-18T12:00:00+0000",
        caption: "5 Aktien, die 2026 niemand auf dem Schirm hat" }
    ]
  }, {
    hashtag: "etf", ok: false, reason: "hashtagUnknown"
  }]
};

test("EP1 · Kein Buchstabe des fremden Textes verlaesst die Abstraktion", () => {
  /* Die eine Eigenschaft, auf die es ankommt. Gemessen, nicht
     zugesichert: die Ausgabe wird gegen die Eingabe durchsucht. */
  const e = abstrahiere(ROH);
  const ausgabe = JSON.stringify(e);
  for (const m of ROH.results[0].media) {
    for (const wort of m.caption.split(/\s+/).filter((w) => w.length > 5)) {
      assert.ok(!ausgabe.includes(wort),
        "Das Wort \"" + wort + "\" aus einer fremden Caption steht in der Ausgabe.");
    }
  }
});

test("EP2 · Der Archetyp kommt aus der Form, nicht aus dem Thema", () => {
  assert.equal(P.hookArchetype("Warum machen so viele denselben Fehler?"), "QUESTION");
  assert.equal(P.hookArchetype("5 Aktien, die niemand kennt"), "LIST");
  assert.equal(P.hookArchetype("Achtung: Finger weg von diesem Fonds"), "WARNING");
  assert.equal(P.hookArchetype(""), null);
  assert.equal(P.hookArchetype(null), null);
});

test("EP3 · Nur der Einstieg zaehlt", () => {
  /* Der Einstieg entscheidet, ob jemand weiterliest - der Rest der
     Caption ist eine andere Frage. */
  const lang = "Ein ganz normaler Satz ohne Merkmal. ".repeat(10) + "Warum eigentlich?";
  assert.equal(P.hookArchetype(lang), null,
    "Ein Fragezeichen nach 300 Zeichen ist kein Einstieg.");
});

test("EP4 · Ohne Bildanalyse wird kein Bildmuster geraten", () => {
  /* Es zu raten waere schlimmer, als es offenzulassen. */
  const m = P.ausMedium({ media_type: "IMAGE", caption: "Text", like_count: 10,
    comments_count: 1 });
  assert.equal(m.visualPattern, null);
  assert.equal(m.formatPattern, "SINGLE_IMAGE");
});

test("EP5 · Gemessen wird ein Verhaeltnis, keine absolute Zahl", () => {
  /* Absolute Zahlen fremder Kanaele sagen ueber unseren nichts. Das
     Verhaeltnis Kommentare zu Likes ist dagegen eine Formeigenschaft. */
  const m = P.ausMedium({ media_type: "IMAGE", caption: "x",
    like_count: 1000, comments_count: 50 });
  assert.equal(m.engagementRelative, 0.05);
  assert.equal(P.ausMedium({ media_type: "IMAGE", caption: "x" }).engagementRelative, null);
});

test("EP6 · Unter der Mindeststichprobe wird nichts ausgesagt", () => {
  /* Bei n=3 ist ein Median eine Anekdote mit Nachkommastellen. */
  const a = P.auswerten([
    { hookArchetype: "QUESTION", engagementRelative: 0.05 },
    { hookArchetype: "QUESTION", engagementRelative: 0.07 }
  ]);
  const q = a.archetypes.find((x) => x.archetype === "QUESTION");
  assert.equal(q.interpretable, false);
  assert.match(q.note, /wird daraus eine Aussage/);
});

test("EP7 · Haeufigkeit ist keine Wirkung, fremde Wirkung nicht unsere", () => {
  const a = P.auswerten([{ hookArchetype: "LIST" }]);
  assert.equal(a.causalClaim, false);
  assert.equal(a.predictsOwnPerformance, false);
  assert.match(a.explanation, /Haeufigkeit ist keine Wirkung/);
});

test("EP8 · Keine Beobachtung ist keine Aussage ueber fremde Muster", () => {
  const a = P.auswerten([]);
  assert.match(a.explanation, /Abwesenheit einer Messung/);
});

test("EP9 · Ein gescheiterter Hashtag zaehlt als null beobachtete Medien", () => {
  /* Damit der Portfolio-Manager ihn ausmustern kann, statt den Platz
     im naechsten Fenster noch einmal auszugeben. */
  const e = abstrahiere(ROH);
  const etf = e.perHashtag.find((h) => h.hashtag === "etf");
  assert.equal(etf.ok, false);
  assert.equal(etf.observedMediaCount, 0);
});

/* ============================================================ Themennaehe */

test("EP20 · Die Themennaehe zaehlt, sie zitiert nicht", () => {
  /* #frontline ist eine Reederei UND ein Alltagswort. Die Zahl der
     Medien unterscheidet beides nie - ob sie unsere Sprache sprechen,
     schon. Zurueck kommt eine Zahl, kein fremdes Wort. */
  const medien = [
    { caption: "Reederei im Aufwind #frontline #aktien #boerse" },
    { caption: "Danke an alle #frontline heroes" },
    { caption: "Ohne jeden Hashtag" }
  ];
  const n = P.themennaehe(medien, ["aktien", "boerse", "etf"], "frontline");
  assert.equal(n.measured, true);
  assert.equal(n.observed, 3);
  assert.equal(n.withVocabulary, 1);
  assert.equal(n.share, 0.333);
  const raus = JSON.stringify(n);
  assert.equal(raus.includes("Reederei"), false);
  assert.equal(raus.includes("heroes"), false);
});

test("EP21 · Der abgefragte Hashtag zaehlt nicht als eigener Beleg", () => {
  /* Sonst waere jede Messung 100 % - jeder Beitrag unter #aktien
     traegt #aktien. Eine Zahl, die immer dasselbe sagt, misst nichts. */
  const n = P.themennaehe([{ caption: "nur #aktien" }], ["aktien", "boerse"], "aktien");
  assert.equal(n.withVocabulary, 0);
});

test("EP22 · Gezaehlt wird als Hashtag, nicht als Teilwort", () => {
  /* "netflix" enthaelt "etf". Ohne das Rautezeichen waere jede
     Netflix-Erwaehnung ein ETF-Beleg. */
  const n = P.themennaehe([{ caption: "neue Serie bei netflix" }], ["etf"], "film");
  assert.equal(n.withVocabulary, 0);
  const m = P.themennaehe([{ caption: "mein #etf Sparplan" }], ["etf"], "film");
  assert.equal(m.withVocabulary, 1);
});

test("EP23 · Ohne Medien wird nichts behauptet", () => {
  const n = P.themennaehe([], ["aktien"], "x");
  assert.equal(n.measured, false);
  assert.equal(n.share, null);
  assert.match(n.explanation, /Abwesenheit/);
});

test("EP24 · Themennaehe ist ausdruecklich kein Qualitaetsurteil", () => {
  const n = P.themennaehe([{ caption: "#aktien" }], ["aktien", "boerse"], "boerse");
  assert.equal(n.isQualityJudgement, false);
  assert.match(n.explanation, /nicht, ob die Beitraege gut sind/);
});
