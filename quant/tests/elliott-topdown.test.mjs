// Elliott von oben (Owner 23.11.2026): Zaehlung des grossen Grades seit Handelsbeginn, Unterteilung, Pfad der Methode.
// Synthetische Reihen (keine Produktionsdaten): Abschnitte linear auf der log-Skala.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const require = createRequire(import.meta.url);
const TD = require(join(ROOT, "quant/engines/technical/elliott/elliott-topdown.js"));
const Big = require(join(ROOT, "elliott/bigpicture.js"));
const { topDownFor, monthly, sig } = await import(join(ROOT, "scripts/technical/lib/ti-topdown.mjs"));

/** Wochenreihe aus Abschnitten [Wochen, Zielkurs] ab start (log-linear), Datum ab 2010-01-01. */
function series(start, legs) {
  const c = [start];
  for (const [w, to] of legs) { const a = c[c.length - 1]; for (let k = 1; k <= w; k++) c.push(a * Math.pow(to / a, k / w)); }
  const t = c.map((_, i) => new Date(Date.UTC(2010, 0, 1) + i * 7 * 864e5).toISOString().slice(0, 10));
  return { close: c, times: t };
}

test("TD-1 · ZigZag: Ursprung am Extrem des ersten Abschnitts, Wendepunkte wechseln die Richtung", () => {
  const s = series(10, [[10, 8], [40, 40], [30, 20], [20, 25]]);
  const p = TD.zigzag(s.close, 0.5);
  assert.equal(p[0].i, 10, "Ursprung = Tief vor dem ersten Hoch, nicht der erste Kurs");
  for (let k = 2; k < p.length; k++) assert.ok((s.close[p[k].i] - s.close[p[k - 1].i]) * (s.close[p[k - 1].i] - s.close[p[k - 2].i]) < 0);
  assert.ok(p[p.length - 1].dev, "letzter Punkt = laufendes Extrem");
});

test("TD-2 · Impuls 1-2-3 aufwärts, Welle 3 läuft: Ungültig-Marke am Ende von Welle 2", () => {
  const s = series(10, [[60, 40], [40, 22], [50, 90]]);
  const r = TD.analyzeTopDown(s);
  assert.equal(r.status, "OK");
  assert.equal(r.primary.kind, "IMPULSE"); assert.equal(r.primary.direction, "UP"); assert.equal(r.primary.current.label, "3");
  assert.ok(Math.abs(r.primary.invalidation.price - 22) < 0.5 && r.primary.invalidation.direction === "below");
  assert.ok(r.primary.rules.some((x) => x.id === "W2_NOT_BEYOND_W1_ORIGIN" && x.passed));
});

test("TD-3 · Harte Regel: Welle 2 unter dem Ursprung von Welle 1 → kein Impuls ab diesem Ursprung", () => {
  const s = series(20, [[30, 70], [80, 6], [40, 25], [30, 9]]);   // Gestalt wie XPEV: Allzeithoch, Absturz unter den Start
  const r = TD.analyzeTopDown(s);
  const p = r.primary;
  const fromOrigin = p.kind === "IMPULSE" && p.direction === "UP" && Math.abs(p.waves[0].fromPrice - 20) < 0.01;
  assert.ok(!fromOrigin, "Ursprung vor dem Absturz darf nicht Welle 1 sein");
  assert.ok(p.anchor === 1, "Ursprung ist Extrem der Reihe");
});

test("TD-4 · Pfad: laufende Korrektur (4) mit Rücklauf 23,6–50 % von (3), danach (5) über das Ende von (3)", () => {
  const s = series(16, [[20, 33], [12, 20.5], [100, 179], [8, 146]]);
  const r = TD.analyzeTopDown(s);
  const st = r.path[0];
  assert.equal(st.label, "4"); assert.equal(st.direction, "DOWN"); assert.ok(st.developing);
  const len3 = 179 - 20.5, b = st.zone.tiers.find((z) => z.tier === "BASE");
  assert.ok(Math.abs(b.high - (179 - 0.236 * len3)) < 1.5 && Math.abs(b.low - (179 - 0.382 * len3)) < 1.5, JSON.stringify(b));
  const five = r.path[1];
  assert.equal(five.label, "5"); assert.ok(five.zone.tiers[0].low > 179, "Welle 5 übersteigt das Ende von Welle 3");
  assert.equal(five.zone.relation, "W5_NET13");
});

test("TD-5 · Log-Skala nur, wenn ein Abwärtsschritt linear unter ein Zehntel des Ankers liefe", () => {
  const s = series(15, [[50, 200], [120, 32], [30, 73], [20, 39]]);   // Gestalt wie CRSP
  const r = TD.analyzeTopDown(s);
  const down = r.path.find((x) => x.direction === "DOWN");
  assert.ok(down, "Abwärtsschritt im Pfad");
  assert.ok(down.zone.tiers.every((z) => z.low > 0));
  if (down.scale === "log") assert.ok(down.zone.tiers.some((z) => z.low < down.anchor * 0.5));
  assert.ok(r.path.every((x) => x.scale === "linear" || x.direction === "DOWN"), "aufwärts immer linear");
});

test("TD-6 · Kausal: asOfIndex sieht keine späteren Kurse", () => {
  const s = series(10, [[60, 40], [40, 22], [50, 90], [30, 60]]);
  const a = 150, cut = { close: s.close.slice(0, a + 1), times: s.times.slice(0, a + 1) };
  const r1 = TD.analyzeTopDown({ close: s.close, times: s.times, asOfIndex: a }), r2 = TD.analyzeTopDown(cut);
  assert.deepEqual(JSON.parse(JSON.stringify(r1)), JSON.parse(JSON.stringify(r2)));
});

test("TD-7 · Produktform: Monatsreihe, 4 signifikante Stellen, zurückgehaltene Titel tragen keine Zählung", () => {
  const s = series(10, [[60, 40], [40, 22], [50, 90]]);
  const p = topDownFor({ timeframe: "1W", close: s.close, timestamps: s.times });
  assert.equal(p.status, "OK"); assert.equal(p.v, TD.VERSION);
  assert.ok(p.monthly.length >= 30 && p.monthly.length <= 40);
  assert.equal(sig(123.456), 123.5); assert.equal(sig(0.0123456), 0.01235);
  assert.deepEqual(monthly(["2020-01-03", "2020-01-31", "2020-02-07"], [1, 2, 3]), [["2020-01-31", 2], ["2020-02-07", 3]]);
  assert.equal(topDownFor({ timeframe: "1D", close: s.close, timestamps: s.times }), null, "nur Wochenreihe");
  const keep = readFileSync(join(ROOT, "scripts/technical/lib/ti-freshness.mjs"), "utf8").match(/const KEEP = \[([^\]]*)\]/)[1];
  assert.doesNotMatch(keep, /elliottTopDown/, "Datenstand-Richtlinie: zurückgehaltene Titel ohne laufende Zählung");
});

test("TD-8 · Großes Bild: Korrektur vor dem ersten Antriebsschritt ist Einstiegszone, danach Kursziele in dessen Richtung (elliott/engine/roles.js)", () => {
  const td = { close: 146, primary: { kind: "IMPULSE", dir: "UP" },
    path: [{ l: "4", deg: "SUB", dir: "DOWN", tiers: [{ t: "BASE", lo: 119, hi: 142, done: 0 }, { t: "EXTENDED", lo: 100, hi: 119, done: 0 }] },
           { l: "5", deg: "SUB", dir: "UP", tiers: [{ t: "BASE", lo: 181, hi: 220, done: 0 }] }, { l: "2", deg: "BIG", dir: "DOWN", tiers: [{ t: "BASE", lo: 94, hi: 118, done: 0 }] }, { l: "3", deg: "BIG", dir: "UP", tiers: [{ t: "BASE", lo: 297, hi: 423, done: 0 }] }] };
  const rows = Big.plan(td);
  assert.deepEqual(rows.map((r) => r.role + (r.n || "")), ["entry", "target1", "step", "target2"]);
  assert.deepEqual([rows[0].lo, rows[0].hi, rows[0].ext.lo], [119, 142, 100]);
  td.path[0].tiers[0].done = 1;
  assert.equal(Big.plan(td)[0].lo, 100, "erreichte Stufe: Kernzone = nächste offene Stufe");
});

test("TD-9 · Alternative mit eigener Unterteilung und eigenem Pfad, Mehrdeutigkeit gezählt", () => {
  const s = series(20, [[30, 70], [80, 6], [40, 25], [30, 9]]);
  const r = TD.analyzeTopDown(s);
  assert.ok(r.alternative, "zweitbeste Lesart vorhanden");
  assert.ok(Array.isArray(r.alternativePath));
  assert.ok(r.candidates.total >= 2 && r.candidates.near >= 1 && r.candidates.gap >= 0);
  const p = topDownFor({ timeframe: "1W", close: s.close, timestamps: s.times });
  assert.deepEqual(Object.keys(p.candidates).sort(), ["gap", "near", "total"]);
  const v = Big.viewOf(Object.assign({ altPath: [{ dir: "UP", tiers: [] }] }, p), "alt");
  assert.equal(v.primary, p.alternative, "Umschalter zeigt die Alternative");
  assert.equal(Big.viewOf(p, "main"), p);
});

/* 1.2.0 (Owner 25.11.2026): Proportion, laufende Welle in eigener Korrektur, Grenze einer laufenden Welle B */
const tslaLike = () => series(1.2, [[150, 60], [4, 28], [90, 400], [60, 110], [100, 480], [40, 346]]);

test("TD-10 · Proportion: ein Rücklauf innerhalb einer Antriebswelle ist nie größer als die größte Korrekturwelle desselben Grades", () => {
  const r = TD.analyzeTopDown(tslaLike());
  for (const c of [r.primary, r.alternative].filter(Boolean)) {
    const L = (w) => Math.abs(Math.log(w.toPrice / w.fromPrice));
    const ref = Math.max(0, ...c.waves.filter((w) => /^[24B]$/.test(w.label) && w.status !== "DEVELOPING").map(L));
    const w3 = c.waves.find((w) => w.label === "3");
    // der Absturz 400 → 110 (−72 %) liegt nicht innerhalb einer Welle 3, wenn die Welle 2 flacher war
    if (w3 && ref > 0) assert.ok(!(w3.fromTime < "2016-11-01" && (w3.toTime > "2017-01-01")) || ref >= Math.log(400 / 110) - 1e-9, JSON.stringify(c.waves));
  }
});

test("TD-11 · Laufende Welle in eigener Korrektur: Welle 3 kürzer als Welle 1 läuft noch, ihr Extrem steht als peak", () => {
  const r = TD.analyzeTopDown(tslaLike());
  const cur = r.primary.waves[r.primary.waves.length - 1];
  assert.equal(r.primary.current.label, "3", JSON.stringify(r.primary.waves.map((w) => w.label + " " + w.toPrice.toFixed(0))));
  assert.ok(cur.peakPrice > 470 && cur.toPrice < cur.peakPrice, "Extrem 480, Kurs heute darunter");
  assert.equal(r.primary.invalidation.ruleId, "W3_START");
  const p = topDownFor({ timeframe: "1W", close: tslaLike().close, timestamps: tslaLike().times });
  assert.ok(p.primary.waves[p.primary.waves.length - 1].pk > 470, "kompakte Form trägt pk/pt");
  assert.ok(r.path.length >= 2 && r.path.some((s) => s.label === "5" && s.degree === "BIG"), "Pfad bis zum Ende von Welle 5");
});

test("TD-12 · Laufende Welle B ist ungültig, sobald sie mehr als 138,2 % von Welle A zurückläuft; Ungültig-Marke = diese Grenze", () => {
  // Impuls bis 120, A bis 70, danach steigt der Kurs bis 200 (B wäre 260 % von A)
  const s = series(10, [[60, 30], [30, 15], [60, 90], [30, 60], [40, 120], [30, 70], [40, 200]]);
  const all = TD._readAll(s);
  const bad = all.filter((c) => c.current === "B" && (() => { const A = c.waves.find((w) => w.label === "A"), B = c.waves.find((w) => w.label === "B");
    return Math.abs(c.pts[B.b].p - c.pts[B.a].p) / Math.abs(c.pts[A.b].p - c.pts[A.a].p) >= 1.382; })());
  assert.equal(bad.length, 0, "keine Lesart mit laufender Welle B jenseits 138,2 %");
  // innerhalb der Grenze: Marke = A-Ende + 1,382 × A in Richtung von B
  const s2 = series(10, [[60, 30], [30, 15], [60, 90], [30, 60], [40, 120], [30, 70], [20, 100]]);
  const r = TD.analyzeTopDown(s2);
  const withB = [r.primary, r.alternative].filter((c) => c && c.current.label === "B");
  withB.forEach((c) => { const A = c.waves.find((w) => w.label === "A");
    assert.equal(c.invalidation.ruleId, "B_NOT_BEYOND_138");
    assert.ok(Math.abs(c.invalidation.price - (A.toPrice + (c.current.direction === "UP" ? 1 : -1) * 1.382 * Math.abs(A.toPrice - A.fromPrice))) < 1e-6); });
});

test("TD-13 · Kalibrierung der Lernrunde: gültige Datei, je Wellenlage Tiefe 0–1 und Ausstieg kurz/fern; im Produkt als kal je Titel", async () => {
  const K = JSON.parse(readFileSync(join(ROOT, "quant/engines/technical/elliott/calibration.json"), "utf8"));
  assert.equal(K.schema, "vu-elliott-calibration-1"); assert.match(K.version, /^kal-\d{4}-\d{2}-\d{2}$/); assert.equal(K.label, "Forschung, nicht zertifiziert");
  for (const [k, r] of Object.entries(K.regeln)) { assert.match(k, /^[IC][1-5ABC]$/); assert.ok(r.einstiegsTiefe >= 0 && r.einstiegsTiefe <= 1); assert.ok(["kurz", "fern"].includes(r.ausstieg)); }
  const p = topDownFor({ timeframe: "1W", close: tslaLike().close, timestamps: tslaLike().times });
  assert.equal(p.kal.v, K.version); assert.equal(p.kal.lage, "I" + p.primary.cur);
});
