/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/revision-instruction.test.mjs

   Der erste Entwurf trug die Diagnose als festen Satz: "die Hooks
   stellten eine belegte Zahl voran, ohne ihr etwas entgegenzusetzen".
   Fuer Anlauf 1 stimmte das. Beim naechsten bestanden die Hooks 5 von
   6, und der Befund lag ganz auf der Caption - dieselbe Anweisung
   haette Nacharbeit an etwas verlangt, das bereits funktioniert.

   Ein Satz, der einmal wahr war, ist keine Messung.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { befundBlock, anweisung, erbeAus } from "../../scripts/social/request-creative-revision.mjs";

function variante(kriterien) {
  return { assessment: { criteria: kriterien } };
}
const k = (id, surface, passed, finding) => ({ id, surface, passed, finding });

test("RI1 · Die Diagnose nennt, was gemessen scheiterte", () => {
  const block = befundBlock([
    variante([k("storyValue", "caption", false, "zaehlt auf"),
              k("scrollStop", "hook", true, null)]),
    variante([k("storyValue", "caption", false, "zaehlt auf"),
              k("scrollStop", "hook", true, null)])
  ]);
  assert.match(block, /storyValue \(caption, in allen 2 Varianten\): zaehlt auf/);
});

test("RI2 · Was traegt, wird mitgeschickt und nicht nur was fehlt", () => {
  /* Ohne diesen Teil ist die naechste Fassung eine Neuschreibung -
     und eine Neuschreibung verliert, was schon stimmte. */
  const block = befundBlock([
    variante([k("storyValue", "caption", false, "zaehlt auf"),
              k("scrollStop", "hook", true, null),
              k("concreteTension", "hook", true, null)])
  ]);
  assert.match(block, /NICHT ANZUFASSEN IST: scrollStop, concreteTension/);
});

test("RI3 · Teilweises Scheitern wird als solches benannt", () => {
  const block = befundBlock([
    variante([k("complementarity", "both", false, "wiederholt den Hook")]),
    variante([k("complementarity", "both", true, null)]),
    variante([k("complementarity", "both", true, null)]),
    variante([k("complementarity", "both", true, null)])
  ]);
  assert.match(block, /in 1 von 4 Varianten/);
  /* Und es steht NICHT unter "traegt": in einer Variante reisst es. */
  assert.doesNotMatch(block, /NICHT ANZUFASSEN IST: complementarity/);
});

test("RI4 · NICHT GEPRUEFT ist weder bestanden noch gescheitert", () => {
  /* `passed === null` heisst, die Flaeche lag nicht vor. Das als
     Erfolg zu melden waere die teuerste Art zu luegen: der Agent
     bekaeme "nicht anfassen" fuer etwas, das nie geprueft wurde. */
  const block = befundBlock([
    variante([k("storyValue", "caption", false, "zaehlt auf"),
              k("curiosityGap", "both", null, "Nicht geprueft"),
              k("scrollStop", "hook", true, null)])
  ]);
  assert.doesNotMatch(block, /curiosityGap/);
  assert.match(block, /NICHT ANZUFASSEN IST: scrollStop\./);
});

test("RI5 · Ohne Befund entsteht kein Block statt eines leeren", () => {
  assert.equal(befundBlock([]), null);
  assert.equal(befundBlock(null), null);
  assert.equal(befundBlock([variante([k("scrollStop", "hook", true, null)])]), null,
    "Wo nichts scheiterte, gibt es nichts nachzuarbeiten.");
});

test("RI6 · Die Anweisung traegt die gemessene Diagnose und faellt sonst weg", () => {
  const story = {
    lead: { value: 76, statement: "76 von 100" },
    tension: {
      strength: { value: 27.35, max: 30, component: "TREND_STRUCTURE", evidence: { id: "a" } },
      drag: { value: 5, max: 10, component: "VOLATILITY", evidence: { id: "b" } },
      support: { statement: "12M-Entwicklung +47,6 %" },
      question: "Warum trotz dieser Trendstaerke nur 76?"
    }
  };
  const mit = anweisung(story, 12, [
    variante([k("storyValue", "caption", false, "zaehlt auf")])
  ]);
  assert.match(mit, /WORAN ES GEMESSEN LAG/);
  assert.match(mit, /zaehlt auf/);

  /* Ohne Vorbefund faellt der Block spurlos aus - kein leerer Absatz,
     keine erfundene Diagnose. */
  const ohne = anweisung(story, 12);
  assert.doesNotMatch(ohne, /WORAN ES GEMESSEN LAG/);
  assert.match(ohne, /AUFTRAGSART: TEXT_REVISION/);
});

/* ------------------------------------------------------------------ */
/* DIE KETTE VERLAENGERT SICH, DIE QUELLE NICHT                        */
/* ------------------------------------------------------------------ */

const EIGEN = {
  visual_variants: [{
    visual_variant_id: "vu-xom:ab:visual:FUTURE_TECH:01",
    asset_path: "authoring/requests/vu-xom/assets/visual-01.png",
    asset_sha256: "a".repeat(64), asset_byte_size: 1954408,
    mime_type: "image/png", width: 1122, height: 1402
  }]
};

const GEERBT = {
  inherited_visual: {
    source_content_id: "vu-xom",
    source_candidate_id: "cand_0001",
    source_visual_variant_id: "vu-xom:ab:visual:FUTURE_TECH:01",
    source_asset_path: "authoring/requests/vu-xom/assets/visual-01.png",
    source_asset_sha256: "a".repeat(64), source_byte_size: 1954408,
    source_mime_type: "image/png", source_width: 1122, source_height: 1402
  }
};

test("RI7 · Ein eigenes Visual wird als eigenes erkannt", () => {
  const b = erbeAus(EIGEN, "vu-xom");
  assert.equal(b.geerbt, false);
  assert.equal(b.originContentId, "vu-xom");
  assert.equal(b.asset_sha256, "a".repeat(64));
});

test("RI8 · Eine Revision einer Revision hat keine visual_variants", () => {
  /* Wer nur die erste Form kennt, haelt eine gueltige Kette
     faelschlich fuer "kein Bild vorhanden" - und bricht einen
     korrekten Auftrag ab. */
  const b = erbeAus(GEERBT, "vu-xom-rev2");
  assert.notEqual(b, null);
  assert.equal(b.geerbt, true);
  assert.equal(b.asset_path, "authoring/requests/vu-xom/assets/visual-01.png");
});

test("RI9 · Geerbt wird der URSPRUNG, nicht die Fassung dazwischen", () => {
  /* Zeigte rev3 auf rev2 und rev4 auf rev3, koennte am Ende niemand
     mehr das eine verifizierte Asset benennen: die Identitaet waere
     eine Behauptung ueber eine Behauptung. */
  const b = erbeAus(GEERBT, "vu-xom-rev2");
  assert.equal(b.originContentId, "vu-xom",
    "Nicht vu-xom-rev2 - ueber rev2 haben wir es nur gefunden.");
  assert.equal(b.candidateId, "cand_0001");
});

test("RI10 · Ohne Bild und ohne Erbe gibt es nichts zu erben", () => {
  assert.equal(erbeAus({}, "x"), null);
  assert.equal(erbeAus({ visual_variants: [] }, "x"), null);
  /* Ein halbes Erbe ist kein Erbe: ohne Hash ist die Identitaet
     nicht pruefbar, und ungeprueft geerbt wird nicht. */
  assert.equal(erbeAus({ inherited_visual: { source_asset_path: "a.png" } }, "x"), null);
  assert.equal(erbeAus(null, "x"), null);
});
