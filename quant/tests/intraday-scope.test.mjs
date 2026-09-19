/* =========================================================================
   DIE PRIORITAET NACH DER GLOCKE

   Der Vorfall: 16:02 New York, Boerse zu, 519 von 6.876 Dateien vorhanden
   (7,5 %) -> die alte Regel entschied "universe", siebzig Minuten lang,
   und blockierte jeden Fuenf-Minuten-Lauf dahinter. Die sichtbaren Titel
   bekamen ihren Schlussstand zuletzt.

   Owner-Regel vom 19.09.2026: zuerst den Consumer-Umfang versiegeln.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Scope = require(join(root, "quant", "engines", "realtime", "intraday-scope.js"));

test("IC-1 · offene Boerse: immer der sichtbare Umfang", () => {
  const w = Scope.waehleUmfang({ marketState: "OPEN", discoverSealed: false, universeCoverage: 0.0 });
  assert.equal(w.scope, "discover");
  assert.equal(w.reason, "marketOpen");
});

test("IC-2 · DER VORFALL: 16:02, Universum bei 7,5 %, Discover unversiegelt -> discover", () => {
  const w = Scope.waehleUmfang({ marketState: "CLOSED", discoverSealed: false,
                                 universeCoverage: 0.075, universeThreshold: 0.5 });
  assert.equal(w.scope, "discover", "der sichtbare Umfang geht vor der Universumswartung");
  assert.equal(w.reason, "sealConsumerScopeFirst");
});

test("IC-3 · erst nach dem Siegel darf das Universum laufen", () => {
  const w = Scope.waehleUmfang({ marketState: "CLOSED", discoverSealed: true,
                                 universeCoverage: 0.075, universeThreshold: 0.5 });
  assert.equal(w.scope, "universe");
  assert.equal(w.reason, "universeBehindAfterSeal");
});

test("IC-4 · Siegel da und Universum gedeckt: nichts Grosses mehr noetig", () => {
  const w = Scope.waehleUmfang({ marketState: "CLOSED", discoverSealed: true,
                                 universeCoverage: 0.95, universeThreshold: 0.5 });
  assert.equal(w.scope, "discover");
  assert.equal(w.reason, "universeCovered");
});

test("IC-5 · Gegenprobe: ein unversiegelter Umfang kippt NIE auf universe", () => {
  /* Ohne diesen Test waere IC-2 nur ein einzelner Zahlenfall. */
  for (const deckung of [0, 0.075, 0.49, 0.5, 0.9, 1]) {
    const w = Scope.waehleUmfang({ marketState: "CLOSED", discoverSealed: false,
                                   universeCoverage: deckung, universeThreshold: 0.5 });
    assert.equal(w.scope, "discover", "Deckung " + deckung);
  }
});
