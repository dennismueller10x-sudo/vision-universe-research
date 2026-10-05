/* Quant-Aktienseite, Tagesverlauf: Vortagesschluss aus der
   split-bereinigten Tagesreihe, sobald sie die Sitzung enthaelt (BGM
   01.10.2026: Snapshot 0,25 $ statt 7,55 $, Kopf +3.928 %). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../app/chart.js", import.meta.url), "utf8");
const body = src.slice(src.indexOf("function vortagAusReihe"), src.indexOf("function create(o)"));
const vortag = new Function("isNum", body + "\nreturn vortagAusReihe;")((v) => typeof v === "number" && isFinite(v));
const reihe = [["2026-09-30", 7.55], ["2026-10-01", 8.16]];

test("Split nach dem Abholen: Basis aus der Reihe", () => {
  assert.equal(vortag({ sessionDate: "2026-10-01", previousClose: 0.25 }, reihe).previousClose, 7.55);
});
test("Reihe ohne die Sitzung oder ohne Bereinigung: Snapshot bleibt", () => {
  const snap = { sessionDate: "2026-10-02", previousClose: 8.16 };
  assert.equal(vortag(snap, reihe), snap);
  assert.equal(vortag(snap, null), snap);
  assert.match(src, /vortagAusReihe\(withLive\(p, st\.trade\), o\.adjusted \? eod : null\)/);
});

test("Die Seite erkennt beide Schreibweisen der Split-Bereinigung", () => {
  const page = readFileSync(new URL("../app/page-stock.js", import.meta.url), "utf8");
  assert.match(page, /adjusted: !!\(s\.chart && \/\^\(splitAdjusted\|SPLIT_ADJUSTED\)\$\/\.test/);
});
