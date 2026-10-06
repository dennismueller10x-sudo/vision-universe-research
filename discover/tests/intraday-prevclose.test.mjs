/* Vortagesschluss eines Tagesverlaufs: aus der Tagesreihe, sobald sie die
   Sitzung enthaelt (Splits eingerechnet). BGM 01.10.2026: Snapshot 0,25,
   Reihe 7,55 -> der Kopf zeigte +3.928 %. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "detail.js"), "utf8");
const body = src.slice(src.indexOf("function vortagAusReihe"), src.indexOf("function sliceBars"));
const vortagAusReihe = new Function("isNum", body + "\nreturn vortagAusReihe;")((v) => typeof v === "number" && Number.isFinite(v));

const reihe = [["2026-09-29", 7.1], ["2026-09-30", 7.55], ["2026-10-01", 8.16]];

test("Split nach dem Abholen: Vortagesschluss aus der Reihe", () => {
  const snap = { sessionDate: "2026-10-01", previousClose: 0.25, points: [] };
  const neu = vortagAusReihe(snap, reihe);
  assert.equal(neu.previousClose, 7.55);
  assert.equal(neu.previousCloseSource, "DAILY_SERIES");
  assert.equal(snap.previousClose, 0.25, "der Snapshot selbst bleibt unveraendert");
});

test("Reihe kennt die Sitzung noch nicht: Snapshot bleibt (Split evtl. nicht eingerechnet)", () => {
  const snap = { sessionDate: "2026-10-02", previousClose: 8.16 };
  assert.equal(vortagAusReihe({ ...snap }, reihe.slice(0, 2)).previousClose, 8.16);
});

test("Gleicher Wert oder fehlende Reihe: unveraendert, auch zurueckgehaltener Wert bleibt null ohne Reihe", () => {
  const snap = { sessionDate: "2026-10-01", previousClose: 7.55 };
  assert.equal(vortagAusReihe(snap, reihe), snap);
  const ohne = { sessionDate: "2026-10-01", previousClose: null, previousCloseWithheld: "SPLIT_SUSPECTED" };
  assert.equal(vortagAusReihe(ohne, null), ohne);
  assert.equal(vortagAusReihe(ohne, reihe).previousClose, 7.55, "mit Reihe gibt es wieder eine Bezugsgroesse");
});
