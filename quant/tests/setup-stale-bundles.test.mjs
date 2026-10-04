// Veraltete Technical-Bundles: nicht als Beobachtung eines spaeteren Stichtags
// veroeffentlichen; bereits veroeffentlichte Wiederholungen ehrlich einordnen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyStaleRepeats } from "../../scripts/quant/build-setup-backtest.mjs";
import { observedAtCutoff } from "../../scripts/quant/build-setup-observations.mjs";

const pub = (rows) => new Map(Object.entries(rows));

test("Vorfall AMC: Zeile seit 09-10 unveraendert, an 09-10 exakt nachgerechnet -> Wiederholung, kein PIT-Fehler", () => {
  const z = ["SETUP_FORMING", 1.51, 2.6];
  const P = pub({ AMC: [{ asOf: "2026-09-10", row: z }, { asOf: "2026-09-24", row: z }, { asOf: "2026-10-02", row: z }] });
  const rows = [
    { ticker: "AMC", asOf: "2026-09-10", published: z, replay: z, same: true },
    { ticker: "AMC", asOf: "2026-09-24", published: z, replay: ["SETUP_FORMING", 2.24, 2.92], same: false },
    { ticker: "AMC", asOf: "2026-10-02", published: z, replay: ["WATCH", 2.22, 3.77], same: false }
  ];
  assert.equal(classifyStaleRepeats(rows, P), 2);
  assert.deepEqual(rows.map((r) => r.staleRepeatOf || null), [null, "2026-09-10", "2026-09-10"]);
});

test("Gegenprobe: ohne exakten Nachweis am Ursprung bleibt es ein PIT-Fehler", () => {
  const z = ["NO_SETUP", 4.9, 9.2];
  const P = pub({ CHPT: [{ asOf: "2026-09-10", row: z }, { asOf: "2026-09-24", row: z }] });
  const rows = [
    { ticker: "CHPT", asOf: "2026-09-10", published: z, replay: ["NO_SETUP", 4.8, 9.2], same: false },
    { ticker: "CHPT", asOf: "2026-09-24", published: z, replay: ["NO_SETUP", 4.8, 10], same: false }
  ];
  assert.equal(classifyStaleRepeats(rows, P), 0);
  assert.ok(rows.every((r) => !r.staleRepeatOf));
});

test("Gegenprobe: Zeile hat sich geaendert (keine Wiederholung) -> PIT-Fehler bleibt", () => {
  const P = pub({ X: [{ asOf: "2026-09-10", row: ["NO_SETUP", 1, 2] }, { asOf: "2026-09-24", row: ["WATCH", 1, 2] }] });
  const rows = [
    { ticker: "X", asOf: "2026-09-10", published: ["NO_SETUP", 1, 2], replay: ["NO_SETUP", 1, 2], same: true },
    { ticker: "X", asOf: "2026-09-24", published: ["WATCH", 1, 2], replay: ["NO_SETUP", 1, 2], same: false }
  ];
  assert.equal(classifyStaleRepeats(rows, P), 0);
});

test("Neue Beobachtungen: nur Bundles vom Stichtag selbst", () => {
  assert.equal(observedAtCutoff({ dataCutoff: "2026-10-02" }, "2026-10-02"), true);
  assert.equal(observedAtCutoff({ dataCutoff: "2026-09-10" }, "2026-10-02"), false);
  assert.equal(observedAtCutoff({ dataCutoff: null }, "2026-10-02"), false);
  const src = readFileSync(new URL("../../scripts/quant/build-setup-observations.mjs", import.meta.url), "utf8");
  assert.match(src, /if \(observedAtCutoff\(entry, cutoff\)\) historyRows\[entry\.ticker\] =/);
  assert.match(src, /summary\.staleBundles = \{ count: staleBundles\.length/);
});

test("Nachrechnung zaehlt Wiederholungen getrennt und weist sie aus", () => {
  const src = readFileSync(new URL("../../scripts/quant/build-setup-backtest.mjs", import.meta.url), "utf8");
  assert.match(src, /const parityStaleRepeats = classifyStaleRepeats\(parityRows, publishedByTicker\);\s*\n\s*parityMismatch -= parityStaleRepeats;/);
  assert.match(src, /staleRepeats: parityStaleRepeats,/);
});
