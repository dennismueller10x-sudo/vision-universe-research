/* Die ausgelieferten Payloads: Form, Groesse und Zahl der Abrufe. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(root, "discover", "data");
const vorhanden = existsSync(join(DATA, "meta.json"));
const meta = vorhanden ? JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8")) : null;

function readJSON(p) { return JSON.parse(readFileSync(p, "utf8")); }
function kb(p) { return statSync(p).size / 1024; }

test("die Payloads sind gebaut", () => {
  assert.ok(vorhanden, "discover/data/meta.json fehlt - Build nicht ausgefuehrt");
});

test("Meta beschreibt beide Universen getrennt", { skip: !vorhanden }, () => {
  const ids = meta.universes.map((u) => u.universeId);
  assert.deepEqual(ids.sort(), ["US_REAL", "VU_MODEL"]);
  for (const u of meta.universes) {
    assert.ok(u.securities > 0);
    assert.ok(u.rankingScope.length > 0, "jedes Universum benennt seinen Ranglisten-Geltungsbereich");
    assert.ok(["real", "mock"].indexOf(u.kind) !== -1);
  }
});

test("Realtime wird nicht behauptet, solange das Gate aus ist", { skip: !vorhanden }, () => {
  if (meta.gates.ENABLE_PUBLIC_LIVE_MARKET_DATA === true) return;
  assert.equal(meta.realtime.available, false);
  assert.match(meta.realtime.message, /LIVE/);
});

test("eine Startseite kostet eine feste, kleine Zahl von Abrufen (§12)", { skip: !vorhanden }, () => {
  /* Discovery-first darf nicht heissen: ein Abruf je Titel. Die Startseite
     laedt meta + eine Datei je Zeile - unabhaengig von der Universumsgroesse. */
  for (const universe of meta.universes) {
    const zeilen = readdirSync(join(DATA, "rows", universe.universeId));
    const abrufe = 1 + zeilen.length;          // meta + Zeilen
    assert.ok(abrufe <= 10, universe.universeId + " braucht " + abrufe + " Abrufe");
    assert.ok(universe.securities > abrufe * 10,
      "der Vorteil der Vorberechnung muss deutlich sein");
  }
});

test("Zeilen-Payloads bleiben klein genug fuer einen schnellen Start", { skip: !vorhanden }, () => {
  for (const universe of meta.universes) {
    const dir = join(DATA, "rows", universe.universeId);
    for (const file of readdirSync(dir)) {
      assert.ok(kb(join(dir, file)) < 260,
        file + " ist " + Math.round(kb(join(dir, file))) + " KB gross");
    }
  }
});

test("der Suchindex laedt in einem Stueck", { skip: !vorhanden }, () => {
  for (const universe of meta.universes) {
    const file = join(DATA, "search", universe.universeId + ".json");
    assert.ok(existsSync(file));
    assert.ok(kb(file) < 120, universe.universeId + "-Suchindex ist zu gross");
    const index = readJSON(file);
    assert.equal(index.entries.length, universe.securities);
  }
});

test("jede Zeile benennt ihre Abdeckung, auch wenn sie leer ist", { skip: !vorhanden }, () => {
  for (const universe of meta.universes) {
    const dir = join(DATA, "rows", universe.universeId);
    for (const file of readdirSync(dir)) {
      const row = readJSON(join(dir, file));
      assert.ok(row.coverage, file + " ohne Abdeckungsangabe");
      assert.ok(row.asOf, file + " ohne Stichtag");
      if (row.rowId !== "sector-leaders") {
        assert.equal(typeof row.coverage.matched, "number");
        assert.ok(row.coverage.universeSize >= row.coverage.matched);
      }
    }
  }
});

test("stillstehende Kursreihen sind aus den Zeilen genommen und benannt", { skip: !vorhanden }, () => {
  const real = meta.universes.filter((u) => u.universeId === "US_REAL")[0];
  const ausgenommen = real.notTradingExcluded || [];
  for (const eintrag of ausgenommen) {
    const detail = readJSON(join(DATA, "stocks", "US_REAL", eintrag.symbol + ".json"));
    assert.equal(detail.discoveryEligible, false);
    assert.ok(detail.ineligibleMessage.length > 0);
    for (const key of Object.keys(detail.signals)) {
      assert.equal(detail.signals[key], false, eintrag.symbol + " traegt trotzdem ein Signal");
    }
  }
});

test("Detailseiten ohne Kursreihe nennen den Grund", { skip: !vorhanden }, () => {
  const dir = join(DATA, "stocks", "US_REAL");
  let ohneReihe = 0;
  for (const file of readdirSync(dir)) {
    const detail = readJSON(join(dir, file));
    if (detail.series.available) continue;
    ohneReihe++;
    assert.ok(detail.series.reason, file + " ohne Grund fuer die fehlende Kursreihe");
    assert.ok(detail.series.message, file + " ohne Erklaerung");
  }
  assert.ok(ohneReihe > 0, "im realen Universum wird nicht jede Reihe ausgeliefert");
});

test("Elliott wird nie erfunden", { skip: !vorhanden }, () => {
  for (const universe of meta.universes) {
    const dir = join(DATA, "stocks", universe.universeId);
    for (const file of readdirSync(dir)) {
      const wave = readJSON(join(dir, file)).technicalIntelligence.layers.elliottWave;
      assert.ok(["unavailable", "calculating", "available", "lowConfidence"].indexOf(wave.status) !== -1);
      if (wave.status === "unavailable") {
        assert.equal(wave.currentWave, null, file + " nennt eine Welle, obwohl keine vorliegt");
        assert.equal(wave.confidence, null);
        assert.ok(wave.message, file + " nennt keinen Grund");
      } else {
        assert.ok(wave.sourceEngine, file + " nennt keine Quell-Engine");
      }
    }
  }
});
