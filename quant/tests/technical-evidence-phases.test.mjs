/* Marktphasen und Zeithaelften der Tages-Evidenz (scripts/technical/evidence-phases.mjs). */
import test from "node:test";
import assert from "node:assert/strict";
import { dailyPhases, midDate, slicesOf, stable, loadPhases, PHASE_SMA, SLICES } from "../../scripts/technical/evidence-phases.mjs";

const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);

test("Phase: UP ueber dem SMA, DOWN darunter; erst ab vollem Fenster", () => {
  const pts = Array.from({ length: 10 }, (_, i) => [day(i), i < 6 ? 100 + i : 90]);
  const p = dailyPhases(pts, 3);
  assert.equal(p.has(day(1)), false, "vor vollem Fenster keine Phase");
  assert.equal(p.get(day(2)), "UP");
  assert.equal(p.get(day(6)), "DOWN");
});

test("Phase ist kausal: haengt nicht von spaeteren Schluessen ab", () => {
  const pts = Array.from({ length: 300 }, (_, i) => [day(i), 100 + 10 * Math.sin(i / 17)]);
  const full = dailyPhases(pts, 50);
  for (const cut of [80, 150, 260]) {
    const part = dailyPhases(pts.slice(0, cut), 50);
    for (const [d, v] of part) assert.equal(full.get(d), v, d);
  }
});

test("Zeithaelften und Teilmengen", () => {
  assert.equal(midDate(["2026-01-03", "2026-01-01", "2026-01-02", "2026-01-02"]), "2026-01-02");
  const ph = new Map([["2026-01-01", "UP"]]);
  assert.deepEqual(slicesOf("2026-01-01", ph, "2026-01-02"), ["UP", "H1"]);
  assert.deepEqual(slicesOf("2026-01-05", ph, "2026-01-02"), ["H2"], "ohne Phase nur die Haelfte");
});

test("Stabil nur bei gleichem Vorzeichen in allen vier Teilmengen", () => {
  const s = (m, n = 50) => ({ n, mean: m });
  assert.equal(stable({ UP: s(0.01), DOWN: s(0.02), H1: s(0.001), H2: s(0.03) }, 30), 1);
  assert.equal(stable({ UP: s(-0.01), DOWN: s(-0.02), H1: s(-0.001), H2: s(-0.03) }, 30), -1);
  assert.equal(stable({ UP: s(0.01), DOWN: s(-0.02), H1: s(0.001), H2: s(0.03) }, 30), 0);
  assert.equal(stable({ UP: s(0.01), DOWN: s(0.02, 10), H1: s(0.001), H2: s(0.03) }, 30), null, "zu wenig Ereignisse");
  assert.deepEqual(SLICES, ["UP", "DOWN", "H1", "H2"]);
});

test("Echte SPY-Reihe: beide Phasen im Tagesfenster vertreten (SMA 50)", () => {
  assert.equal(PHASE_SMA, 50);
  const p = loadPhases();
  let up = 0, down = 0;
  for (const [d, v] of p) if (d >= "2025-09-30" && d <= "2026-10-26") v === "UP" ? up++ : down++;
  assert.ok(up >= 100 && down >= 30, up + "/" + down);
});
