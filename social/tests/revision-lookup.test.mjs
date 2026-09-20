/* =========================================================================
   VISION UNIVERSE SOCIAL — social/tests/revision-lookup.test.mjs

   Eine Ueberarbeitung bekommt eine eigene Kennung, damit sie den Brief
   der Vorfassung nicht ueberschreibt. Der Preis ist, dass der Zyklus
   sie nicht mehr ueber die gerechnete Kennung findet — diese Tests
   halten fest, wie er sie stattdessen findet.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { juengsteFassung } = await import("../../scripts/social/run-social-cycle.mjs");

function platz(fassungen) {
  const wurzel = mkdtempSync(join(tmpdir(), "vu-rev-"));
  for (const [name, mitErgebnis] of Object.entries(fassungen)) {
    const d = join(wurzel, "authoring/requests", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "authoring-brief.json"), "{}");
    if (mitErgebnis) writeFileSync(join(d, "authoring-result.json"), "{}");
  }
  return wurzel;
}

test("RL1 · Ohne Ueberarbeitung bleibt es bei der Basiskennung", () => {
  const w = platz({ "vu-x-20260911": true });
  try {
    assert.equal(juengsteFassung("vu-x-20260911", w), "vu-x-20260911");
  } finally { rmSync(w, { recursive: true, force: true }); }
});

test("RL2 · Eine gelieferte Ueberarbeitung gewinnt", () => {
  const w = platz({ "vu-x-20260911": true, "vu-x-20260911-rev1": true });
  try {
    assert.equal(juengsteFassung("vu-x-20260911", w), "vu-x-20260911-rev1");
  } finally { rmSync(w, { recursive: true, force: true }); }
});

test("RL3 · Eine ausgeloeste, aber nicht gelieferte verdraengt nichts", () => {
  /* Der wichtige Fall. Zwischen dem Oeffnen des Request-PRs und dem
     Ergebnis liegt Zeit. Wuerde die leere Revision schon gewinnen,
     faende der Zyklus in diesem Fenster gar kein Creative Result — der
     Inhalt fiele auf den Vorlagen-Autor zurueck, und das gepruefte
     Ergebnis der Vorfassung waere unerreichbar. */
  const w = platz({ "vu-x-20260911": true, "vu-x-20260911-rev1": false });
  try {
    assert.equal(juengsteFassung("vu-x-20260911", w), "vu-x-20260911");
  } finally { rmSync(w, { recursive: true, force: true }); }
});

test("RL4 · Gezaehlt wird numerisch, nicht als Text", () => {
  /* Sonst laege rev10 vor rev2 — und die Auswahl haenge an der
     Schreibweise statt an der Reihenfolge. */
  const w = platz({ "vu-x-20260911": true, "vu-x-20260911-rev2": true,
    "vu-x-20260911-rev10": true });
  try {
    assert.equal(juengsteFassung("vu-x-20260911", w), "vu-x-20260911-rev10");
  } finally { rmSync(w, { recursive: true, force: true }); }
});

test("RL5 · Eine fremde Kennung wird nicht mitgenommen", () => {
  /* "vu-x-20260911-rev1" gehoert zu "vu-x-20260911", aber
     "vu-x-20260912-rev1" nicht — auch wenn der Name aehnlich aussieht. */
  const w = platz({ "vu-x-20260911": true, "vu-x-20260912-rev1": true });
  try {
    assert.equal(juengsteFassung("vu-x-20260911", w), "vu-x-20260911");
  } finally { rmSync(w, { recursive: true, force: true }); }
});
