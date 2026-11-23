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
  const ro = E.roles([{ dir: "DOWN", disp: "(4)", tiers: [{ lo: 119, hi: 142, done: 0 }] }, { dir: "UP", disp: "(5)", tiers: [{ lo: 181, hi: 220, done: 0 }] }]);
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
