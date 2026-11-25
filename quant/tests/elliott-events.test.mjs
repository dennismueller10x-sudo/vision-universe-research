// Elliott-Alarme, Rückenwind und Wochen-Radar (Owner 23.11.2026): synthetische Zeilen, keine Produktionsdaten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(fileURLToPath(import.meta.url), "../../..");
const E = await import(join(ROOT, "scripts/technical/lib/ti-elliott-events.mjs"));
const H = await import(join(ROOT, "scripts/technical/elliott-home/home.mjs"));

const td = (over) => Object.assign({ k: "IMPULSE:UP:1:2024-04", cur: "1", kind: "IMPULSE", dir: "UP", inv: [16, "below"], e: { lo: 100, hi: 142, dir: "DOWN", l: "(4)" }, t1: { lo: 181, hi: 220, dir: "UP", l: "(5)" }, rw: "UP" }, over || {});
const row = (close, asOf, t = td()) => ({ t: "GH", close, asOf, td: t });

test("EE-1 · Einstiegszone erreicht nur beim Übergang, Kursziel erreicht, Zählung ungültig, Neuzählung", () => {
  assert.deepEqual(E.eventsFor(row(150, "2026-11-13"), row(140, "2026-11-20")).map((x) => x.type), ["ENTRY_REACHED"]);
  assert.deepEqual(E.eventsFor(row(139, "2026-11-13"), row(130, "2026-11-20")), [], "schon in der Zone: kein neues Ereignis");
  assert.deepEqual(E.eventsFor(row(170, "2026-11-13"), row(185, "2026-11-20")).map((x) => x.type), ["TARGET_REACHED"]);
  assert.deepEqual(E.eventsFor(row(20, "2026-11-13"), row(15, "2026-11-20", td({ k: "X" }))).map((x) => x.type), ["INVALIDATED"], "ungültig statt Neuzählung; Zone war schon erreicht");
  assert.deepEqual(E.eventsFor(row(150, "2026-11-13"), row(151, "2026-11-20", td({ k: "IMPULSE:UP:3:2024-04", cur: "3" }))).map((x) => x.type), ["RECOUNT"]);
  assert.deepEqual(E.eventsFor(row(150, "2026-11-20"), row(140, "2026-11-20")), [], "gleicher Stand: nichts");
});

test("EE-2 · Rückenwind: Trend, Momentum, Relative Stärke; Rollen wie im Großen Bild", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i), dn = up.slice().reverse();
  assert.deepEqual([E.tailwind(up, 0.9).dir, E.tailwind(dn, 0.1).dir, E.tailwind(up, 0.1).dir], ["UP", "DOWN", "MIXED"]);
  const ro = E.roles([{ l: "4", deg: "SUB", dir: "DOWN", disp: "(4)", tiers: [{ lo: 119, hi: 142, done: 0 }] }, { l: "5", deg: "SUB", dir: "UP", disp: "(5)", tiers: [{ lo: 181, hi: 220, done: 0 }] }]);
  assert.deepEqual([ro.entry.l, ro.target.l], ["(4)", "(5)"]);
});

test("EE-3 · Radar: nur Kurs in der Einstiegszone, Rückenwind zuerst; Alarme neueste zuerst", () => {
  const rows = [row(130, "2026-11-20"), { t: "AAA", close: 50, asOf: "2026-11-20", td: td({ e: { lo: 40, hi: 60, dir: "DOWN", l: "(2)" }, t1: { lo: 80, hi: 90, dir: "UP", l: "(3)" }, rw: "DOWN" }) }, row(300, "2026-11-20")];
  const r = H.radarOf(rows, null, null);
  assert.equal(r.count, 2); assert.deepEqual(r.rows.map((x) => x.t), ["GH", "AAA"]);
  assert.equal(r.rows[0].rwOk, true);
  const ev = H.eventsOf({ events: [{ t: "GH", asOf: "2026-11-13", type: "RECOUNT" }, { t: "AAA", asOf: "2026-11-20", type: "TARGET_REACHED" }] }, null, null);
  assert.deepEqual(ev.map((x) => x.t), ["AAA", "GH"]);
});

test("EE-4 · Setup-Score: feste Gewichte, Stufen, Richtung des Elliott-Plans", async () => {
  const { createRequire } = await import("node:module");
  const SS = createRequire(import.meta.url)(join(ROOT, "quant/engines/technical/elliott/setup-score.js"));
  assert.deepEqual(SS.WEIGHTS, { rs: 0.4, trend: 0.2, mom: 0.2, elliott: 0.2 });
  const top = SS.score({ rs: 0.95, trend: 1, mom: 1, elliott: "UP" }), low = SS.score({ rs: 0.05, trend: -1, mom: -1, elliott: "DOWN" });
  assert.equal(top.v, 98); assert.equal(top.level, "STRONG_UP"); assert.equal(low.v, 2); assert.equal(low.level, "STRONG_DOWN");
  assert.equal(SS.score({ rs: 0.5, trend: 1, mom: -1, elliott: null }).level, "MIXED");
  assert.equal(SS.planDir([{ dir: "DOWN" }, { dir: "UP" }]), "UP", "nach der Wende zählt die Richtung des Kursziels");
  assert.equal(SS.planDir([{ direction: "UP" }]), "UP");
  const H = await import(join(ROOT, "scripts/technical/elliott-home/home.mjs"));
  const r = H.radarOf([{ t: "A", close: 50, asOf: "2026-11-20", td: { cur: "2", e: { lo: 40, hi: 60, dir: "DOWN", l: "(2)" }, t1: { lo: 80, hi: 90, dir: "UP", l: "(3)" }, sc: [55, "MIXED"] } },
    { t: "B", close: 50, asOf: "2026-11-20", td: { cur: "2", e: { lo: 40, hi: 60, dir: "DOWN", l: "(2)" }, t1: { lo: 80, hi: 90, dir: "UP", l: "(3)" }, sc: [88, "STRONG_UP"] } }], null, null);
  assert.deepEqual(r.rows.map((x) => x.t), ["B", "A"], "hoher Score in Richtung des Ziels zuerst");
});

test("EE-5 · Rollen im Pfad: Kursziel in Richtung des ersten Antriebsschritts, Einstieg nur bei einer Korrektur davor", async () => {
  const { createRequire } = await import("node:module");
  const R = createRequire(import.meta.url)(join(ROOT, "elliott/engine/roles.js"));
  const z = (lo, hi) => [{ t: "BASE", lo, hi, r: [0.382, 0.618], done: 0 }];
  const st = (l, dir, deg, lo, hi) => ({ l, disp: deg === "SUB" ? "(" + l + ")" : "[" + l + "]", deg, dir, tiers: z(lo, hi) });
  const of = (P) => R.roles(P).roles.join(",");
  // laufende Welle 3: [3] ist das Kursziel, [4] kein Einstieg und kein Kursziel (Fehler bis 24.11.2026: „Einstieg Welle 3, Kursziel Welle 4“)
  assert.equal(of([st("3", "UP", "BIG"), st("4", "DOWN", "BIG"), st("5", "UP", "BIG")]), "target,step,target");
  // (C) beendet Welle 4: Einstieg, dann Kursziel Welle 5
  assert.equal(of([st("C", "DOWN", "SUB"), st("5", "UP", "BIG"), st("A", "DOWN", "BIG")]), "entry,target,step");
  // Korrektur A-B-C abwärts: A und C sind Kursziele, B nicht
  assert.equal(of([st("A", "DOWN", "BIG"), st("B", "UP", "BIG"), st("C", "DOWN", "BIG")]), "target,step,target");
  // Ende der Korrektur, dann neuer Impuls
  assert.equal(of([st("C", "DOWN", "BIG"), st("1", "UP", "BIG")]), "entry,target");
  // Unterwellen einer laufenden großen Korrektur führen zur Einstiegszone: (5) beendet Welle C, dann Welle 1 aufwärts
  assert.equal(R.roles([st("3", "DOWN", "SUB"), st("4", "UP", "SUB"), st("5", "DOWN", "SUB"), st("1", "UP", "BIG")], "C").roles.join(","), "step,step,entry,target");
  // Unter-(C) beendet eine große Antriebswelle 5: Kursziel
  assert.equal(R.roles([st("C", "UP", "SUB"), st("A", "DOWN", "BIG"), st("B", "UP", "BIG")], "5").roles.join(","), "target,step,step");
  // ohne Antriebsschritt: frühere Lesart (Wende nach dem ersten Schritt)
  assert.equal(of([st("C", "UP", "SUB"), st("C", "DOWN", "BIG")]), "entry,target");
  const ro = E.roles([st("3", "UP", "BIG", 0, 0), st("4", "DOWN", "BIG"), st("5", "UP", "BIG")].map((s, i) => Object.assign(s, { tiers: z(100 + i, 120 + i) })));
  assert.equal(ro.entry, null); assert.equal(ro.target.l, "[3]");
});

test("EE-6 · Fernziel: Welle (III) nach dem großen Impuls, Ende von Welle 5 bei laufendem Impuls, keins im Abwärtstrend", async () => {
  const { createRequire } = await import("node:module");
  const F = createRequire(import.meta.url)(join(ROOT, "elliott/engine/far-target.js"));
  const w = (l, fp, tp, dev) => ({ l, ft: "2010-01-01", fp, tt: "2012-01-01", tp, dev: dev ? 1 : 0 });
  const st = (l, deg, dir, lo, hi) => ({ l, deg, dir, tiers: [{ t: "BASE", lo, hi, done: 0 }] });
  // Impuls seit 10 $, Hoch 480 $ (Welle 3 über der Mitte der Zone 5): (I) = 10 → 480, (II) = 50 % = 245, (III) = 1,0–1,618 × 470 ab 245
  // Welle 4 läuft, Welle 5 steht im Pfad: Fernziel ist ihre Zone (1.2.0), nicht schon Welle III danach
  const a4 = F.far({ primary: { kind: "IMPULSE", dir: "UP", cur: "4", waves: [w("1", 10, 100), w("2", 100, 50), w("3", 50, 480), w("4", 480, 350, 1)] }, path: [st("C", "SUB", "DOWN", 230, 290), st("5", "BIG", "UP", 400, 500), st("A", "BIG", "DOWN", 260, 320)] });
  assert.equal(a4.kind, "5"); assert.ok(a4.inPath && a4.lo === 400 && a4.hi === 500, JSON.stringify(a4));
  // Welle 5 läuft (Ende im Pfad): die Wellen 1–5 bilden Welle I, danach II und III
  const a = F.far({ primary: { kind: "IMPULSE", dir: "UP", cur: "5", waves: [w("1", 10, 100), w("2", 100, 50), w("3", 50, 480), w("4", 480, 350), w("5", 350, 400, 1)] }, path: [st("5", "SUB", "UP", 400, 500), st("A", "BIG", "DOWN", 260, 320)] });
  assert.equal(a.kind, "III");
  assert.ok(Math.abs(a.lo - (245 + 470)) < 1 && Math.abs(a.hi - (245 + 1.618 * 470)) < 1, JSON.stringify(a));
  assert.ok(a.lo >= a.top, "harte Regel: (III) über dem Ende von (I)");
  // laufender Impuls in Welle 2, Welle 5 nicht im Pfad: Ende von Welle 5 über Welle 3 hinaus
  const b = F.far({ primary: { kind: "IMPULSE", dir: "UP", cur: "2", waves: [w("1", 5, 10), w("2", 10, 7, 1)] }, path: [st("C", "SUB", "DOWN", 5, 6), st("3", "BIG", "UP", 12, 14), st("4", "BIG", "DOWN", 11, 12)] });
  assert.equal(b.kind, "5"); assert.ok(b.lo >= 13 && b.hi > b.lo);
  assert.deepEqual(F.far({ primary: { kind: "IMPULSE", dir: "DOWN", cur: "3", waves: [w("1", 50, 20)] }, path: [] }), { none: "DOWN" });
  // Korrektur II tiefer als 88,6 % von Welle I: kein Fernziel; Kurs unter der Zone C: II mindestens bis zum Kurs
  const deep = F.far({ close: 20, primary: { kind: "IMPULSE", dir: "UP", cur: "C", waves: [w("1", 10, 100), w("2", 100, 50), w("3", 50, 480), w("4", 480, 350), w("5", 350, 500), w("A", 500, 300), w("B", 300, 400), w("C", 400, 20, 1)] }, path: [st("C", "SUB", "DOWN", 200, 250)] });
  assert.deepEqual(deep, { none: "DEEP" });
});
