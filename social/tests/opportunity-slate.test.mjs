/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/opportunity-slate.test.mjs

   Der Slate ist der Beweis, dass das System nicht mehr ticker-first
   denkt. Vorher konnte es genau eine Sorte Thema bilden:
   "Technisches Setup — <TICKER>".

   Er ist KEINE Veroeffentlichung. Er zeigt, was aus den bereits
   vorhandenen, kostenfreien Daten entstehen kann.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { baueSlate } from "../../scripts/social/build-opportunity-slate.mjs";

const require = createRequire(import.meta.url);
const U = require("../engines/content-universe.js");

const S = baueSlate();

test("OS1 · Der Slate traegt mehrere Content Families", () => {
  assert.ok(S.summary.families.length >= 3,
    "Gebaut: " + S.summary.families.join(", "));
});

test("OS2 · Es gibt Themen ohne Entitaet", () => {
  /* Die Datenstruktur darf keine Einzelaktie voraussetzen - und der
     reale Lauf muss zeigen, dass sie es auch nicht tut. */
  assert.ok(S.summary.entityLess > 0);
  assert.ok(S.topics.some((t) => t.entityType === "NONE"));
});

test("OS3 · Es gibt Themen mit mehreren Entitaeten", () => {
  assert.ok(S.summary.multiEntity > 0,
    "Eine Reihe ueber zehn Titel ist keine Einzelaktien-Story.");
});

test("OS4 · Jedes Thema im Slate ist strukturell gueltig", () => {
  for (const t of S.topics) {
    const v = U.validate(t);
    assert.equal(v.ok, true, t.topicId + ": " + v.explanation);
  }
});

test("OS5 · Kennungen sind eindeutig", () => {
  const ids = S.topics.map((t) => t.topicId);
  assert.equal(new Set(ids).size, ids.length,
    "Zwei Themen mit derselben Kennung waeren ein Thema.");
});

test("OS6 · Die Form kommt aus den Daten, nicht aus der Quelle", () => {
  /* Der erste Entwurf gab ALLEN Discover-Reihen hart RANKING - und
     reproduzierte damit genau die Kopplung Quelle->Form, die §26
     verbietet. Die Reihen tragen die Unterscheidung selbst: `theme`
     gesetzt heisst Thema, `rule` heisst zahlenmaessiger Filter. */
  const ausDiscover = S.topics.filter((t) => t.sources.includes("VU_DISCOVER"));
  const formen = new Set(ausDiscover.map((t) => t.family));
  assert.ok(formen.size > 1,
    "Eine Quelle, aus der nur eine Form entsteht, ist wieder die alte " +
    "Gleichsetzung. Gebaut: " + [...formen].join(", "));
  assert.ok(formen.has("MEGATREND") && formen.has("RANKING"));
});

test("OS7 · Leere Kategorien werden benannt, nicht gefuellt", () => {
  /* Eine Kategorie, die leer bleibt, ist ein ehrlicher Befund ueber
     die Datenlage. Eine Kategorie mit erfundenen Daten ist eine Luege
     darueber - und sie faellt erst auf, wenn jemand sie veroeffentlicht. */
  assert.ok(S.unavailableFamilies.length > 0);
  for (const f of S.unavailableFamilies) {
    assert.equal(f.availability, "UNAVAILABLE");
    assert.ok(f.reason && f.reason.length > 20, "Leer ohne Grund ist wertlos.");
  }
  /* Und keine leere Familie taucht zugleich unter den Themen auf. */
  const gebaut = new Set(S.topics.map((t) => t.family));
  for (const f of S.unavailableFamilies) assert.ok(!gebaut.has(f.family));
});

test("OS8 · Der Slate veroeffentlicht nichts", () => {
  assert.equal(S.purpose, "BREADTH_PROOF_ONLY");
  assert.ok(!("candidateId" in S));
});

test("OS9 · Kein Thema traegt ein nacktes Kuerzel als Entitaet", () => {
  /* Wo ein Klarname bekannt ist, muss er verwendet werden - sonst
     stolpert das Audience-Tor spaeter ueber genau diese Stelle. */
  const namen = require("../../discover/config/company-names.json").names;
  for (const t of S.topics) {
    for (const e of t.entities) {
      assert.ok(!namen[e],
        "Thema " + t.topicId + " nennt das Kuerzel " + e +
        ", obwohl der Klarname bekannt ist (" + namen[e] + ").");
    }
  }
});
