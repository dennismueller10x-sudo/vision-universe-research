/* Stichprobenrahmen (Protokoll §4, Nachtrag 1 Punkt 2): Die gespeicherte Ziehung jeder Rahmendatei muss sich aus den Regeln in
   scripts/technical/practitioner/sampling-frame.mjs exakt reproduzieren lassen; die Regeln sind ergebnisblind (nur Titel/Kategorie). */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FRAME_DIR, drawFrame, classifyItem, titleInstrument, seedMod } from "../../scripts/technical/practitioner/sampling-frame.mjs";

const frames = readdirSync(FRAME_DIR).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(FRAME_DIR, f), "utf8")));

test("jede Rahmendatei: gespeicherte Ziehung = neu berechnete Ziehung", () => {
  assert.ok(frames.length >= 1);
  for (const f of frames) {
    const d = drawFrame(f);
    for (const k of ["frameSize", "eligibleCount", "stepK", "startIndex", "sample", "pilot", "pilotExtension", "phase2"]) assert.deepEqual(f.draw[k], d[k], `${f.sourceId}.${k}`);
    assert.equal(d.startIndex, seedMod("20261004|" + f.sourceId, d.stepK));
  }
});
test("Rahmen chronologisch aufsteigend und ohne doppelte IDs", () => {
  for (const f of frames) {
    const ids = new Set();
    for (const it of f.items) { assert.ok(!ids.has(it[0]), `${f.sourceId}: doppelt ${it[0]}`); ids.add(it[0]); }
    if (!f.itemsAreWindow) for (let i = 1; i < f.items.length; i++) assert.ok(f.items[i - 1][1].slice(0, 10) <= f.items[i][1].slice(0, 10), `${f.sourceId}: nicht chronologisch bei ${i}`);
  }
});
test("Titelregeln: Rueckblick/Erfolg ausgeschlossen, Zielinstrument erkannt", () => {
  assert.equal(classifyItem(["x", "2024-01-01", "SPX Elliott Wave: Another Trading Setup Presented to Members"], "ewf").status, "EXCLUDED_RETROSPECTIVE");
  assert.equal(classifyItem(["x", "2024-01-01", "EW Analyse - DAX Future - Topp erwischt - Volltreffer"], "tiedje").status, "EXCLUDED_RETROSPECTIVE");
  assert.equal(classifyItem(["x", "2024-01-01", "DOW - BOEING, IBM,..."], "tiedje").status, "EXCLUDED_SYSTEM_SIGNALS");
  assert.equal(classifyItem(["x", "2024-01-01", "Natural Gas Reacting Lower From Elliott Wave Blue Box Area"], "ewf").status, "EXCLUDED_RETROSPECTIVE");
  assert.equal(titleInstrument("Elliott Wave View: S&P 500 (SPX) Shows 5 Waves Down").key, "SPX");
  assert.equal(titleInstrument("In die Schlacht für den DAX?").key, "DAX");
  assert.equal(titleInstrument("Ölpreis vor dem Absturz?").key, "OIL");
  assert.equal(titleInstrument("CHFJPY – Taking Advantage of Weakening Yen"), null);
});
