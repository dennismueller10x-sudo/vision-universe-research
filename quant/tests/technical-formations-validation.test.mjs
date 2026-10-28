/* Formationsvalidierung (L5, scripts/technical/validate-formations.mjs, docs/technical/FORMATION_VALIDATION.md).
   Prueft die Pruefregeln selbst: Jede Regel erkennt einen konstruierten Verstoss und laesst den gueltigen Fall
   durch. Der Lauf ueber das Universum ist das Skript (25 s), nicht dieser Test. */
import test from "node:test";
import assert from "node:assert/strict";
import { check, mirrorBars } from "../../scripts/technical/validate-formations.mjs";

const CTX = { asOf: "2026-10-26", close: 100 };
const DQ = { atr: 2, bars: 270 };
const P = (time, price, side) => ({ time, price, side });
const L = (role, t0, p0, t1, p1) => ({ role, from: { time: t0, price: p0 }, to: { time: t1, price: p1 } });
function f(type, direction, extra) {
  return Object.assign({ id: type + "@2026-09-01", type, direction, state: "DETECTED", detectedAt: "2026-09-01", detectedIndex: -1, dataQuality: DQ, points: [], lines: [] }, extra);
}

test("gemeinsam: Kausalitaet, Zustand, Reihenfolge, Richtung", () => {
  assert.deepEqual(check(f("SUPPORT_TRENDLINE", "BULLISH", { lines: [L("support", "2026-07-01", 90, "2026-10-26", 98)] }), CTX), []);
  assert.ok(check(f("SUPPORT_TRENDLINE", "BULLISH", { detectedAt: "2026-10-27", lines: [L("support", "2026-07-01", 90, "2026-10-26", 98)] }), CTX).includes("ERKENNUNG_NACH_STICHTAG"));
  assert.ok(check(f("DOUBLE_TOP", "BEARISH", { points: [P("2026-07-01", 110, "HIGH"), P("2026-07-20", 100, "LOW"), P("2026-10-30", 110.5, "HIGH")] }), CTX).includes("PUNKT_NACH_STICHTAG"));
  assert.ok(check(f("GAP_UP", "BULLISH", { state: "UNKNOWN" }), CTX).includes("ZUSTAND"));
  assert.ok(check(f("BULL_FLAG", "BEARISH"), CTX).includes("RICHTUNG"));
  assert.ok(check(f("BULL_PENNANT", "BULLISH", { invalidatedAt: "2026-08-30" }), CTX).includes("INVALIDIERT_VOR_ERKENNUNG"));
  assert.ok(check(f("BULL_PENNANT", "BULLISH", { confirmedAt: "2026-08-30" }), CTX).includes("BESTAETIGT_VOR_ERKENNUNG"));
});

test("Dreiecke und Rechteck: erstes gegen letztes Hoch/Tief, Toleranz max(0,75 ATR, 2,5 %)", () => {
  const pts = (h1, l1, h2, l2, h3) => [P("2026-05-01", h1, "HIGH"), P("2026-06-01", l1, "LOW"), P("2026-07-01", h2, "HIGH"), P("2026-08-01", l2, "LOW"), P("2026-08-20", h3, "HIGH")];
  /* Kanten wie gezeichnet (ti-chart-patterns 1.3.0): aufsteigend = oben waagrecht, unten durch die Tiefs. */
  const asc = [L("upper", "2026-05-01", 110.5, "2026-08-20", 110.5), L("lower", "2026-06-01", 90, "2026-08-20", 99)];
  const sym = [L("upper", "2026-05-01", 110, "2026-08-20", 102), L("lower", "2026-06-01", 90, "2026-08-20", 99)];
  assert.deepEqual(check(f("ASCENDING_TRIANGLE", "BULLISH", { points: pts(110, 90, 104, 96, 110.5), lines: asc }), CTX), [], "Hochs gleich (mittleres Hoch zaehlt nicht), Tiefs steigen");
  /* Befund 28.10.2026: Unterkante waagrecht gezeichnet, obwohl die Tiefs steigen (ABEV), bzw. waagrechte Kante ab dem Preis des ersten Pivots. */
  const ascFlach = [L("upper", "2026-05-01", 110.5, "2026-08-20", 110.5), L("lower", "2026-06-01", 90, "2026-08-20", 90)];
  assert.deepEqual(check(f("ASCENDING_TRIANGLE", "BULLISH", { points: pts(110, 90, 104, 96, 110.5), lines: ascFlach }), CTX), ["LINIEN_PASSEN_NICHT_ZUM_TYP"]);
  const ascSchief = [L("upper", "2026-05-01", 110, "2026-08-20", 110.5), L("lower", "2026-06-01", 90, "2026-08-20", 99)];
  assert.deepEqual(check(f("ASCENDING_TRIANGLE", "BULLISH", { points: pts(110, 90, 104, 96, 110.5), lines: ascSchief }), CTX), ["LINIEN_PASSEN_NICHT_ZUM_TYP"]);
  assert.ok(check(f("SYMMETRICAL_TRIANGLE", "BULLISH", { directionOpen: true, points: pts(110, 90, 104, 96, 105) }), CTX).includes("LINIEN_FEHLEN"));
  assert.ok(check(f("ASCENDING_TRIANGLE", "BULLISH", { points: pts(110, 90, 104, 96, 120) }), CTX).includes("GEOMETRIE"), "Hochs 10 auseinander");
  assert.ok(check(f("ASCENDING_TRIANGLE", "BULLISH", { points: pts(110, 96, 104, 90, 110) }), CTX).includes("GEOMETRIE"), "Tiefs fallen");
  assert.deepEqual(check(f("SYMMETRICAL_TRIANGLE", "BULLISH", { directionOpen: true, points: pts(110, 90, 104, 96, 105), lines: sym }), CTX), []);
  assert.deepEqual(check(f("RECTANGLE", "BULLISH", { directionOpen: true, points: pts(110, 90, 104, 90.5, 110.2) }), CTX), []);
  assert.ok(check(f("RECTANGLE", "BULLISH", { directionOpen: true, points: pts(110, 108, 104, 108.5, 110.2) }), CTX).includes("GEOMETRIE"), "zu schmal (< 3 ATR)");
});

test("Keile und Kanaele: Richtung, Verengung um 25 %, Parallelitaet 35 %", () => {
  const wedgeOk = [L("upper", "2026-06-01", 100, "2026-09-01", 110), L("lower", "2026-06-01", 90, "2026-09-01", 107)];
  assert.deepEqual(check(f("RISING_WEDGE", "BEARISH", { lines: wedgeOk }), CTX), []);
  const noNarrow = [L("upper", "2026-06-01", 100, "2026-09-01", 110), L("lower", "2026-06-01", 90, "2026-09-01", 101)];
  assert.ok(check(f("RISING_WEDGE", "BEARISH", { lines: noNarrow }), CTX).includes("KEIN_VERENGEN"));
  assert.ok(check(f("FALLING_WEDGE", "BULLISH", { lines: wedgeOk }), CTX).includes("STEIGUNG_RICHTUNG"));
  const chan = [L("upper", "2026-06-01", 100, "2026-09-01", 110), L("lower", "2026-06-01", 90, "2026-09-01", 99)];
  assert.deepEqual(check(f("ASCENDING_CHANNEL", "BULLISH", { lines: chan }), CTX), []);
  const notParallel = [L("upper", "2026-06-01", 100, "2026-09-01", 110), L("lower", "2026-06-01", 90, "2026-09-01", 95)];
  assert.ok(check(f("ASCENDING_CHANNEL", "BULLISH", { lines: notParallel }), CTX).includes("NICHT_PARALLEL"));
});

test("Wimpel und Flaggen: Konvergenz, Mast ≥ 5 ATR, Invalidierung bei 50 % des Masts", () => {
  const conv = [L("upper", "2026-08-01", 110, "2026-08-20", 108), L("lower", "2026-08-01", 104, "2026-08-20", 106)];
  assert.deepEqual(check(f("BULL_PENNANT", "BULLISH", { lines: conv, levels: { pole: 12 } }), CTX), []);
  assert.ok(check(f("BULL_PENNANT", "BULLISH", { lines: conv, levels: { pole: 8 } }), CTX).includes("MAST_ZU_KURZ"));
  const div = [L("upper", "2026-08-01", 110, "2026-08-20", 112), L("lower", "2026-08-01", 104, "2026-08-20", 106)];
  assert.ok(check(f("BULL_PENNANT", "BULLISH", { lines: div, levels: { pole: 12 } }), CTX).includes("KEINE_KONVERGENZ"));
  const flagPts = [P("2026-07-01", 90), P("2026-07-20", 110)];
  assert.deepEqual(check(f("BULL_FLAG", "BULLISH", { points: flagPts, levels: { invalidation: 100 } }), CTX), []);
  assert.ok(check(f("BULL_FLAG", "BULLISH", { points: flagPts, levels: { invalidation: 95 } }), CTX).includes("INVALIDIERUNG"));
  assert.deepEqual(check(f("BEAR_FLAG", "BEARISH", { points: [P("2026-07-01", 110), P("2026-07-20", 90)], levels: { invalidation: 100 } }), CTX), []);
});

test("Doppeltop, SKS, Trendlinien, Luecken", () => {
  assert.deepEqual(check(f("DOUBLE_TOP", "BEARISH", { points: [P("2026-07-01", 110, "HIGH"), P("2026-07-20", 100, "LOW"), P("2026-08-10", 110.8, "HIGH")] }), CTX), []);
  assert.ok(check(f("DOUBLE_TOP", "BEARISH", { points: [P("2026-07-01", 110, "HIGH"), P("2026-07-20", 100, "LOW"), P("2026-08-10", 120, "HIGH")] }), CTX).includes("EXTREMA_UNGLEICH"));
  const sks = (s2) => [P("2026-05-01", 105, "HIGH"), P("2026-05-20", 95, "LOW"), P("2026-06-10", 115, "HIGH"), P("2026-07-01", 95, "LOW"), P("2026-07-20", s2, "HIGH")];
  assert.deepEqual(check(f("HEAD_AND_SHOULDERS", "BEARISH", { points: sks(106) }), CTX), []);
  assert.ok(check(f("HEAD_AND_SHOULDERS", "BEARISH", { points: sks(116) }), CTX).includes("KOPF_NICHT_EXTREM"));
  assert.ok(check(f("RESISTANCE_TRENDLINE", "BEARISH", { lines: [L("resistance", "2026-07-01", 90, "2026-10-26", 98)] }), CTX).includes("STEIGUNG_RICHTUNG"));
  /* Luecke am Erkennungstag gegen die Tagesbars; ein ruhender Titel (O = H = L = C) hat keine Luecke. */
  const flat = { timestamps: ["2026-10-23", "2026-10-26"], open: [5.38, 5.38], high: [5.38, 5.38], low: [5.38, 5.38], close: [5.38, 5.38] };
  assert.ok(check(f("GAP_UP", "BULLISH", { detectedAt: "2026-10-26" }), { ...CTX, bars: flat }).includes("KEINE_LUECKE"));
  const gapBars = { timestamps: ["2026-10-23", "2026-10-26"], open: [5, 5.6], high: [5.4, 5.8], low: [4.9, 5.5], close: [5.3, 5.7] };
  assert.deepEqual(check(f("GAP_UP", "BULLISH", { detectedAt: "2026-10-26" }), { ...CTX, bars: gapBars }), []);
});

test("Spiegelung: Abstaende bleiben gleich, Hoch und Tief tauschen", () => {
  const b = { timestamps: ["a", "b"], open: [10, 12], high: [11, 13], low: [9, 11.5], close: [10.5, 12.5], volume: [1, 2] };
  const m = mirrorBars(b), K = 13 + 9;
  assert.deepEqual(m.high, [K - 9, K - 11.5]);
  assert.deepEqual(m.low, [K - 11, K - 13]);
  assert.equal(m.high[0] - m.low[0], b.high[0] - b.low[0], "Spanne gleich");
  assert.equal(m.close[1] - m.close[0], -(b.close[1] - b.close[0]), "Bewegung umgekehrt");
  assert.deepEqual(mirrorBars(m).close, b.close, "zweimal gespiegelt = Original");
});
