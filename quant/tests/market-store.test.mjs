/* =========================================================================
   PHASE 4A §12/§13/§14/§30 — SPEICHER, CHECKPOINT UND ANZEIGERICHTLINIE

   Die drei Eigenschaften, an denen ein Import scheitert, wenn niemand sie
   geprueft hat: er laedt zu viel, er faengt nach einem Abbruch von vorn an,
   und er veroeffentlicht etwas, das nicht veroeffentlicht werden darf.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const MarketStore = require("../engines/market-store.js");
const DisplayPolicy = require("../engines/display-policy.js");

function tempStore() {
  const root = mkdtempSync(join(tmpdir(), "vu-store-"));
  return {
    root,
    store: MarketStore.createMarketStore({ root, providerId: "tiingo" }),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function bar(date, close, extra) {
  return Object.assign({
    securityId: "ref_AAPL", date, open: close, high: close * 1.01, low: close * 0.99,
    close, volume: 1000, adjustedClose: null, adjustmentStatus: "unknown",
    splitFactor: 1, dividend: 0, currency: "USD", dataSourceId: "ds_tiingo"
  }, extra || {});
}

/* ------------------------------------------------ §12 Inkrementell */

test("S1 · Ohne gespeicherte Daten wird ab dem Startdatum geladen", () => {
  const t = tempStore();
  try {
    assert.equal(t.store.lastStoredDate("ref_AAPL"), null);
    assert.equal(t.store.nextFetchFrom("ref_AAPL", { initialFrom: "2015-01-01" }), "2015-01-01");
  } finally { t.cleanup(); }
});

test("S2 · Mit gespeicherten Daten wird ab dem Folgetag geladen", () => {
  const t = tempStore();
  try {
    t.store.mergeBars("ref_AAPL", [bar("2026-09-02", 100), bar("2026-09-04", 102)]);
    assert.equal(t.store.lastStoredDate("ref_AAPL"), "2026-09-04");
    // Einen Tag spaeter: dieselbe Bar erneut zu holen kostet eine Anfrage
    // und erzeugt eine Dublette.
    assert.equal(t.store.nextFetchFrom("ref_AAPL"), "2026-09-05");
  } finally { t.cleanup(); }
});

test("S3 · Dasselbe zweimal einzuspielen aendert nichts", () => {
  const t = tempStore();
  try {
    const bars = [bar("2026-09-02", 100), bar("2026-09-03", 101)];
    const erst = t.store.mergeBars("ref_AAPL", bars);
    assert.equal(erst.added, 2);
    assert.equal(erst.total, 2);

    const nochmal = t.store.mergeBars("ref_AAPL", bars);
    assert.equal(nochmal.added, 0, "keine neuen Bars");
    assert.equal(nochmal.replaced, 2);
    assert.equal(nochmal.total, 2, "keine Dubletten");
  } finally { t.cleanup(); }
});

test("S4 · Eine nachtraeglich korrigierte Bar ersetzt die alte", () => {
  const t = tempStore();
  try {
    t.store.mergeBars("ref_AAPL", [bar("2026-09-02", 100)]);
    t.store.mergeBars("ref_AAPL", [bar("2026-09-02", 100.5)]);
    const stored = t.store.readBars("ref_AAPL");
    assert.equal(stored.bars.length, 1);
    assert.equal(stored.bars[0].close, 100.5, "die Korrektur ist der bessere Wert");
  } finally { t.cleanup(); }
});

test("S5 · Bars bleiben sortiert, auch wenn sie unsortiert kommen", () => {
  const t = tempStore();
  try {
    t.store.mergeBars("ref_AAPL", [bar("2026-09-04", 3), bar("2026-09-02", 1), bar("2026-09-03", 2)]);
    const stored = t.store.readBars("ref_AAPL");
    assert.deepEqual(stored.bars.map((b) => b.date),
      ["2026-09-02", "2026-09-03", "2026-09-04"]);
    assert.equal(stored.first, "2026-09-02");
    assert.equal(stored.last, "2026-09-04");
  } finally { t.cleanup(); }
});

/* -------------------------------------------------- §13 Checkpoint */

test("S6 · Ein abgebrochener Lauf faengt nicht von vorn an", () => {
  const t = tempStore();
  try {
    const universe = ["a", "b", "c", "d", "e"];
    const cp = t.store.loadCheckpoint("initial");
    cp.done.push("a", "b");
    t.store.saveCheckpoint(cp);

    // Neuer Lauf, frisch geladener Checkpoint.
    const wieder = t.store.loadCheckpoint("initial");
    assert.deepEqual(wieder.done, ["a", "b"]);
    assert.deepEqual(t.store.remaining(wieder, universe), ["c", "d", "e"],
      "bei 50 Anfragen pro Stunde ist das keine Bequemlichkeit, sondern die Voraussetzung");
  } finally { t.cleanup(); }
});

test("S7 · Ein gescheiterter Titel gilt nicht als erledigt", () => {
  const t = tempStore();
  try {
    const cp = t.store.loadCheckpoint("initial");
    cp.done.push("a");
    cp.failed.push({ securityId: "b", reason: "rateLimited" });
    t.store.saveCheckpoint(cp);

    const wieder = t.store.loadCheckpoint("initial");
    assert.deepEqual(t.store.remaining(wieder, ["a", "b", "c"]), ["b", "c"],
      "b ist gescheitert, nicht erledigt - und wird erneut versucht");
  } finally { t.cleanup(); }
});

test("S8 · Ein Abbruch mitten im Schreiben hinterlaesst keine halbe Datei", () => {
  const t = tempStore();
  try {
    t.store.mergeBars("ref_AAPL", [bar("2026-09-02", 100)]);
    const file = join(t.root, ".market-cache", "tiingo", "daily", "ref_AAPL.json");
    assert.ok(existsSync(file));
    // Kein .tmp uebrig - es wird daneben geschrieben und dann umbenannt.
    assert.ok(!existsSync(file + ".tmp"));
    assert.doesNotThrow(() => JSON.parse(readFileSync(file, "utf8")));
  } finally { t.cleanup(); }
});

/* ------------------------------------------------------ §14 Ablage */

test("S9 · Die vollstaendige Historie bleibt aus dem Repository heraus", () => {
  const t = tempStore();
  try {
    const viele = [];
    for (let i = 0; i < 600; i++) {
      const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
      viele.push(bar(d, 100 + i));
    }
    t.store.mergeBars("ref_AAPL", viele);

    const p = t.store.publish("ref_AAPL", { limit: 400 });
    assert.equal(p.published, true);
    assert.equal(p.bars, 400, "nur der Ausschnitt wird ausgeliefert");
    assert.equal(p.of, 600, "die volle Historie bleibt in der Arbeitsablage");

    const veroeffentlicht = t.store.readBars("ref_AAPL", "published");
    assert.equal(veroeffentlicht.bars.length, 400);
    assert.ok(veroeffentlicht.note, "der Ausschnitt sagt, dass er einer ist");
    assert.equal(veroeffentlicht.truncatedFrom, 600);

    // Und die Arbeitsablage liegt ausserhalb von quant/data.
    assert.ok(t.store.workingDir.includes(".market-cache"));
    assert.ok(!t.store.workingDir.includes(join("quant", "data")));
  } finally { t.cleanup(); }
});

test("S10 · Der Bestand ist auswertbar, ohne die Dateien zu lesen", () => {
  const t = tempStore();
  try {
    t.store.mergeBars("ref_AAPL", [
      bar("2026-09-02", 100),
      bar("2026-09-03", 101, { splitFactor: 4 }),
      bar("2026-09-04", 102, { dividend: 0.25 })
    ], { adjustmentStatus: "unknown" });

    const inv = t.store.inventory("working");
    assert.equal(inv.length, 1);
    assert.equal(inv[0].bars, 3);
    assert.equal(inv[0].splits, 1);
    assert.equal(inv[0].dividends, 1);
    assert.ok(inv[0].bytes > 0);
  } finally { t.cleanup(); }
});

/* --------------------------------------- §30 Anzeigerichtlinie */

test("P1 · Der Standard ist intern erlaubt, oeffentlich nichts", () => {
  DisplayPolicy.reset();
  const gates = { ENABLE_LIVE_MARKET_DATA: false, ENABLE_PUBLIC_LIVE_MARKET_DATA: false };

  assert.equal(DisplayPolicy.check({ providerId: "tiingo", dataClass: "marketData",
    audience: "internal", form: "raw", gates }).allowed, true,
    "sonst liesse sich gar nichts pruefen");

  const oeffentlich = DisplayPolicy.check({ providerId: "tiingo", dataClass: "marketData",
    audience: "public", form: "raw", gates });
  assert.equal(oeffentlich.allowed, false);
  assert.equal(oeffentlich.reason, "notLicensed");
});

test("P2 · Ein unbekannter Anbieter faellt auf den strengsten Standard", () => {
  DisplayPolicy.reset();
  const res = DisplayPolicy.check({ providerId: "voellig-unbekannt", dataClass: "marketData",
    audience: "public", form: "raw", gates: {} });
  assert.equal(res.allowed, false);
  assert.match(res.message, /nicht freigegeben/);
});

test("P3 · Gate und Erlaubnis muessen beide zutreffen", () => {
  DisplayPolicy.reset();
  // Erlaubnis eingetragen, Gate aus.
  DisplayPolicy.declare("tiingo", "realtime", {
    publicRealtimeAllowed: true,
    basis: "Testeintrag", checkedAt: "2026-09-07"
  });
  const gateAus = DisplayPolicy.check({ providerId: "tiingo", dataClass: "realtime",
    audience: "public", form: "realtime",
    gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: false } });
  assert.equal(gateAus.allowed, false);
  assert.equal(gateAus.reason, "gateDisabled");

  const gateAn = DisplayPolicy.check({ providerId: "tiingo", dataClass: "realtime",
    audience: "public", form: "realtime",
    gates: { ENABLE_PUBLIC_LIVE_MARKET_DATA: true } });
  assert.equal(gateAn.allowed, true);
  DisplayPolicy.reset();
});

test("P4 · Eine oeffentliche Erlaubnis ohne Grundlage wird abgelehnt", () => {
  DisplayPolicy.reset();
  assert.throws(() => DisplayPolicy.declare("x", "marketData", { publicRawDisplayAllowed: true }),
    /ohne Angabe der Grundlage/);
  assert.throws(() => DisplayPolicy.declare("x", "marketData",
    { publicRawDisplayAllowed: true, basis: "weil" }), /ohne Pruefdatum/);
  // Eine rein interne Erlaubnis braucht keine Grundlage.
  assert.doesNotThrow(() => DisplayPolicy.declare("x", "marketData", { internalUseAllowed: true }));
  DisplayPolicy.reset();
});

test("P5 · Live-Daten bleiben auch intern aus, solange das Gate aus ist", () => {
  DisplayPolicy.reset();
  const res = DisplayPolicy.check({ providerId: "tiingo", dataClass: "intraday",
    audience: "internal", form: "raw", gates: { ENABLE_LIVE_MARKET_DATA: false } });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "gateDisabled",
    "damit ein Abruf nicht durch blosse Anwesenheit eines Schluessels entsteht");
});

test("P6 · Die Gates kommen aus der Umgebung und sind standardmaessig aus", () => {
  assert.deepEqual(DisplayPolicy.gatesFromEnv({}),
    { ENABLE_LIVE_MARKET_DATA: false, ENABLE_PUBLIC_LIVE_MARKET_DATA: false });
  assert.equal(DisplayPolicy.gatesFromEnv({ ENABLE_LIVE_MARKET_DATA: "true" })
    .ENABLE_LIVE_MARKET_DATA, true);
  // Alles andere ist aus - auch "1", "yes", "on".
  for (const v of ["1", "yes", "on", "TRUE ", ""]) {
    assert.equal(DisplayPolicy.gatesFromEnv({ ENABLE_LIVE_MARKET_DATA: v })
      .ENABLE_LIVE_MARKET_DATA, v === "TRUE " ? false : false, `'${v}' galt als an`);
  }
  // Gross-/Kleinschreibung von "true" ist dagegen egal.
  assert.equal(DisplayPolicy.gatesFromEnv({ ENABLE_LIVE_MARKET_DATA: "True" })
    .ENABLE_LIVE_MARKET_DATA, true);
});
