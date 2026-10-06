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

/* Plattform-Audit 03.10.2026: das Discover-Siegel blieb dauerhaft offen. */
test("Siegel · Bindestrich-Ticker wird unter seiner kanonischen ID gefunden", () => {
  const S = require("../engines/realtime/intraday-scope.js");
  const Identity = require("../../core/identity.js");
  const dateien = { ref_AAPL: { regularComplete: true }, ref_MOG_A: { regularComplete: true } };
  const r = S.discoverSiegel(["AAPL", "MOG-A"], Identity.securityIdForTicker,
    (id) => dateien[id] || null, (id) => id in dateien);
  assert.deepEqual([r.versiegelt, r.fertig, r.gesamt, r.nieGeliefert], [true, 2, 2, []]);
  /* Gegenprobe mit der alten, rohen Bildung: MOG-A wird nicht gefunden. */
  const roh = S.discoverSiegel(["AAPL", "MOG-A"], (t) => "ref_" + t,
    (id) => dateien[id] || null, (id) => id in dateien);
  assert.deepEqual(roh.nieGeliefert, ["MOG-A"]);
});

test("Siegel · Ein nie gelieferter Titel blockiert nicht, wird aber ausgewiesen", () => {
  const S = require("../engines/realtime/intraday-scope.js");
  const dateien = { ref_AAPL: { regularComplete: true } };
  const r = S.discoverSiegel(["AAPL", "AKO-A"], (t) => "ref_" + t.replace(/[^A-Z0-9]/g, "_"),
    (id) => dateien[id] || null, (id) => id in dateien);
  assert.equal(r.versiegelt, true);
  assert.deepEqual(r.nieGeliefert, ["AKO-A"]);
});

test("Siegel · Ein frueher gelieferter, heute fehlender Titel haelt das Siegel offen", () => {
  const S = require("../engines/realtime/intraday-scope.js");
  const heute = { ref_AAPL: { regularComplete: true } };
  const r = S.discoverSiegel(["AAPL", "BH-A"], (t) => "ref_" + t.replace(/[^A-Z0-9]/g, "_"),
    (id) => heute[id] || null, (id) => id === "ref_BH_A" || id in heute);
  assert.equal(r.versiegelt, false);
  assert.deepEqual([r.fertig, r.gesamt], [1, 2]);
});

test("Split-Tag · Vortagesschluss im Split-Verhaeltnis wird zurueckgehalten, normale Bewegung nicht", () => {
  const Snap = require("../engines/realtime/intraday-snapshot.js");
  assert.deepEqual(Snap.previousCloseCheck(230.86, 234.1), { value: 230.86, withheld: null });
  assert.deepEqual(Snap.previousCloseCheck(1200, 121.3), { value: null, withheld: "SPLIT_SUSPECTED" }, "10:1-Split");
  assert.deepEqual(Snap.previousCloseCheck(100, 50.4), { value: null, withheld: "SPLIT_SUSPECTED" }, "2:1-Split");
  assert.deepEqual(Snap.previousCloseCheck(0.52, 10.4), { value: null, withheld: "SPLIT_SUSPECTED" }, "1:20-Reverse-Split");
  assert.deepEqual(Snap.previousCloseCheck(100, 70), { value: 100, withheld: null }, "-30 % ist kein Split");
  assert.deepEqual(Snap.previousCloseCheck(0.0123, 0.0125), { value: 0.0123, withheld: null }, "Penny ohne Cent-Rundung");
  assert.deepEqual(Snap.previousCloseCheck(null, 10), { value: null, withheld: null });
});
