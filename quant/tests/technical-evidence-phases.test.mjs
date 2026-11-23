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

test("Marktbreite je Datum: Anteil ueber dem SMA 200, Phase erst ab Mindestzahl Titel, kausal je Bar", async () => {
  const { breadthAccumulator, BREADTH_SLICES, BREADTH_LEVEL } = await import("../../scripts/technical/evidence-phases.mjs");
  assert.deepEqual(BREADTH_SLICES, ["BROAD", "NARROW"]);
  assert.equal(BREADTH_LEVEL, 0.5);
  const acc = breadthAccumulator(0.5, 4), dates = [day(0), day(1), day(2)];
  /* Tag 0: 3 von 4 darueber (BROAD); Tag 1: 1 von 4 (NARROW); Tag 2: nur 2 Titel mit SMA -> keine Phase */
  acc.add(dates, [11, 9, 11], [10, 10, 10]);
  acc.add(dates, [11, 9, 9], [10, 10, 10]);
  acc.add(dates, [11, 11, 5], [10, 10, null]);
  acc.add(dates, [9, 9, 5], [10, 10, NaN]);
  acc.add(dates, [50, 50], [10, 10, 10]); /* ungleiche Laengen: Titel zaehlt nicht */
  const b = acc.finish();
  assert.deepEqual(b.get(day(0)), { share: 0.75, n: 4, phase: "BROAD" });
  assert.deepEqual(b.get(day(1)), { share: 0.25, n: 4, phase: "NARROW" });
  assert.equal(b.has(day(2)), false, "unter der Mindestzahl keine Phase");
  /* genau auf der Schwelle zaehlt als BROAD; ein Schluss gleich dem SMA liegt nicht darueber */
  const edge = breadthAccumulator(0.5, 2);
  edge.add([day(0)], [11], [10]); edge.add([day(0)], [10], [10]);
  assert.equal(edge.finish().get(day(0)).phase, "BROAD");
});

test("Vergleichsgruppe: Anteil aller Titel ueber bzw. unter dem Querschnittsmittel, gemittelt ueber die Ereignisdaten", async () => {
  const { baseCounts, baseRate } = await import("../../scripts/technical/evidence-phases.mjs");
  /* Schiefe Verteilung: ein Ausreisser hebt das Mittel, nur 1 von 5 liegt darueber -> Vergleichsquote 20 %, nicht 50 % */
  const counts = baseCounts(new Map([["a", [0, 0, 0, 0, 1]], ["b", [-1, 1, 1, 1]], ["c", [1, 2]]]), 4);
  assert.deepEqual(counts.get("a"), { pos: 1, neg: 4, n: 5 });
  assert.deepEqual(counts.get("b"), { pos: 3, neg: 1, n: 4 });
  assert.equal(counts.has("c"), false, "unter der Mindestzahl keine Vergleichsgruppe");
  assert.ok(Math.abs(baseRate(["a"], 1, counts) - 0.2) < 1e-12);
  assert.ok(Math.abs(baseRate(["a"], -1, counts) - 0.8) < 1e-12, "baerische Lesart: Anteil darunter");
  /* Vielfachheit: zwei Ereignisse an a, eines an b; Datum ohne Vergleichsgruppe zaehlt nicht */
  assert.ok(Math.abs(baseRate(["a", "a", "b", "c"], 1, counts) - (0.2 + 0.2 + 0.75) / 3) < 1e-12);
  assert.equal(baseRate(["c"], 1, counts), null);
  /* Titel genau auf dem Mittel zaehlen weder darueber noch darunter */
  assert.deepEqual(baseCounts(new Map([["d", [1, 1, 1, 1]]]), 4).get("d"), { pos: 0, neg: 0, n: 4 });
});

test("Produktartefakt: Vergleichsquote und Marktbreite werden durchgereicht, die Einordnung bleibt unveraendert", async () => {
  const SE = await import("../../scripts/technical/world/signal-evidence.mjs");
  const row = (extra) => Object.assign({ event: "x", name: "X", direction: "BULLISH", titles: 9, stableSign: 1,
    h20: { n: 500, dates: 80, mean: 0.02, ci95: 0.01, hitRate: 0.55, significant: true } }, extra);
  const head = { schemaVersion: "s", engine: "e", window: { from: "a", to: "b" }, titles: 9, minN: 100 };
  const before = SE.compose(Object.assign({ events: [row()] }, head), Object.assign({ patterns: [] }, head));
  const withNew = row({ breadth: { BROAD: { n: 300, dates: 50, mean: 0.03, ci95: 0.01, hitRate: 0.6, baseHitRate: 0.48, extra: 1 }, NARROW: null } });
  withNew.h20.baseHitRate = 0.47;
  const after = SE.compose(Object.assign({ events: [withNew], baseRule: "B", breadthSplit: { rule: "R", dates: { BROAD: 50, NARROW: 30 } } }, head), Object.assign({ patterns: [] }, head));
  assert.match(after.schemaVersion, /^vu-technical-signal-evidence-1\.1\./);
  assert.equal(before.indicators[0].baseHitRate, undefined, "alte Quelle: kein Feld statt eines erfundenen Werts");
  assert.equal(after.indicators[0].baseHitRate, 0.47);
  assert.deepEqual(after.indicators[0].breadth, { BROAD: { n: 300, dates: 50, mean: 0.03, ci95: 0.01, hitRate: 0.6, baseHitRate: 0.48 }, NARROW: null });
  assert.equal(after.indicators[0].reading, before.indicators[0].reading);
  assert.equal(after.method.base, "B");
  assert.deepEqual(after.breadthDates, { BROAD: 50, NARROW: 30 });
});
