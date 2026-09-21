/* =========================================================================
   DER TAKTGEBER AUF DEM PRUEFSTAND

   Jede Regel aus quant/engines/realtime/pacemaker.js bekommt einen Fall,
   und die scharfen bekommen eine Gegenprobe. Eine Pruefung, die nie
   ausloest, beweist nichts ueber sich selbst - deshalb steht hinter den
   Abbruchregeln jeweils der Nachweis, dass sie ohne ihren Ausloeser NICHT
   greifen.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Pacemaker = require(join(root, "quant", "engines", "realtime", "pacemaker.js"));

const MIN = 60000;
const TAKT = 5 * MIN;
const basis = (over) => Object.assign({
  nowMs: Date.parse("2026-09-21T14:00:00Z"),
  marketState: "OPEN",
  blockStartMs: Date.parse("2026-09-21T13:30:00Z"),
  blockMaxMs: 345 * MIN,
  nextOpenMs: null,
  intervalMs: TAKT,
  fehlerInFolge: 0
}, over || {});

/* --- Fall 6: laufende Sitzung ------------------------------------------ */

test("PM-1 bei offenem Markt wird getaktet", () => {
  const e = Pacemaker.entscheide(basis());
  assert.equal(e.action, "tick");
  assert.equal(e.reason, "marktOffen");
});

/* --- Faelle 11-13: geschlossen, Wochenende, Feiertag -------------------- */

test("PM-2 geschlossen ohne bekannte Eroeffnung beendet den Block", () => {
  for (const zustand of ["CLOSED", "AFTER", "HOLIDAY", "WEEKEND"]) {
    const e = Pacemaker.entscheide(basis({ marketState: zustand }));
    assert.equal(e.action, "stop", zustand + " haette beenden muessen");
    assert.equal(e.reason, "sitzungGeschlossen");
  }
});

test("PM-3 vor der Eroeffnung wird gewartet, nicht abgebrochen", () => {
  const jetzt = Date.parse("2026-09-21T13:00:00Z");
  const e = Pacemaker.entscheide(basis({
    nowMs: jetzt, marketState: "PRE",
    blockStartMs: jetzt,
    nextOpenMs: Date.parse("2026-09-21T13:30:00Z")
  }));
  assert.equal(e.action, "wait");
  assert.equal(e.reason, "vorEroeffnung");
  assert.equal(e.waitMs, 30 * MIN);
});

test("PM-4 Gegenprobe: liegt die Eroeffnung hinter dem Blockende, wird nicht gewartet", () => {
  const jetzt = Date.parse("2026-09-21T13:00:00Z");
  const e = Pacemaker.entscheide(basis({
    nowMs: jetzt, marketState: "PRE",
    blockStartMs: jetzt, blockMaxMs: 20 * MIN,
    nextOpenMs: Date.parse("2026-09-21T13:30:00Z")
  }));
  assert.equal(e.action, "stop");
  assert.equal(e.reason, "eroeffnungNachBlockEnde");
});

/* --- Fall 14: verkuerzter Schluss -------------------------------------- */

test("PM-5 ein verkuerzter Schluss beendet den Block wie jeder Schluss", () => {
  /* Der Taktgeber kennt keine Uhrzeiten - er fragt den Sitzungszustand.
     Damit ist ein verkuerzter Handelstag kein Sonderfall, sondern
     derselbe Fall: sobald die Sitzung nicht mehr OPEN sagt, ist Schluss. */
  const e = Pacemaker.entscheide(basis({
    nowMs: Date.parse("2026-11-27T18:05:00Z"), marketState: "AFTER",
    blockStartMs: Date.parse("2026-11-27T13:30:00Z")
  }));
  assert.equal(e.action, "stop");
  assert.equal(e.reason, "sitzungGeschlossen");
});

/* --- Fall 1: der Zeitplan faellt aus ------------------------------------ */

test("PM-6 ein Block taktet ohne ein einziges weiteres Zeitplan-Ereignis durch", () => {
  /* Genau das ist der Kern des Vorfalls: zwischen 09:09 und 10:13 kam
     kein Ereignis. Ein Block muss diese Stunde allein ueberbruecken. */
  const start = Date.parse("2026-09-21T13:30:00Z");
  let jetzt = start, takte = 0;
  for (let i = 0; i < 100; i++) {
    const e = Pacemaker.entscheide(basis({ nowMs: jetzt, blockStartMs: start }));
    if (e.action !== "tick") break;
    takte++;
    jetzt += TAKT;
  }
  assert.ok(takte >= 12, "eine Stunde braucht mindestens zwoelf Takte, waren " + takte);
  assert.ok(takte >= 60, "ein voller Block sollte deutlich mehr tragen, waren " + takte);
});

/* --- Fall 5: der Lauf dauert laenger als sein Takt ---------------------- */

test("PM-7 ein ueberlanger Zyklus holt nicht auf, sondern nimmt den naechsten Rasterpunkt", () => {
  const raster = Date.parse("2026-09-21T14:00:00Z");
  /* Ein Zyklus, der 5:20 gebraucht hat, endet nach dem naechsten
     Rasterpunkt. Nachholen hiesse: sofort wieder losfahren und den
     Anbieter zweimal dasselbe fragen. */
  const fertig = raster + 5 * MIN + 20000;
  const warten = Pacemaker.wartezeit(fertig, TAKT);
  assert.ok(warten > 0, "es muss gewartet werden");
  assert.equal(fertig + warten, raster + 10 * MIN, "Ziel ist der naechste freie Rasterpunkt");
});

test("PM-8 der Takt driftet nicht: zehn ueberlange Zyklen bleiben auf dem Raster", () => {
  let t = Date.parse("2026-09-21T14:00:00Z");
  for (let i = 0; i < 10; i++) {
    const fertig = t + 5 * MIN + 17000;          /* jedes Mal 17 s zu lang */
    t = fertig + Pacemaker.wartezeit(fertig, TAKT);
    assert.equal(t % TAKT, 0, "Zyklus " + i + " liegt neben dem Raster");
  }
});

test("PM-9 Gegenprobe: ein kurzer Zyklus wartet bis zum Raster, statt sofort erneut zu laufen", () => {
  const raster = Date.parse("2026-09-21T14:00:00Z");
  const fertig = raster + 45000;
  assert.equal(Pacemaker.wartezeit(fertig, TAKT), 4 * MIN + 15000);
});

/* --- Fall 18: kein Trigger-Sturm --------------------------------------- */

test("PM-10 drei Fehler in Folge beenden den Block, statt weiterzudrehen", () => {
  const e = Pacemaker.entscheide(basis({ fehlerInFolge: 3 }));
  assert.equal(e.action, "stop");
  assert.equal(e.reason, "zuVieleFehlerInFolge");
});

test("PM-11 Gegenprobe: zwei Fehler in Folge takten weiter", () => {
  assert.equal(Pacemaker.entscheide(basis({ fehlerInFolge: 2 })).action, "tick");
});

/* --- Blockende --------------------------------------------------------- */

test("PM-12 ein Zyklus wird nicht begonnen, wenn er nicht mehr hineinpasst", () => {
  const start = Date.parse("2026-09-21T13:30:00Z");
  const e = Pacemaker.entscheide(basis({
    blockStartMs: start, blockMaxMs: 60 * MIN,
    nowMs: start + 56 * MIN                      /* 4 min Rest, Takt 5 min */
  }));
  assert.equal(e.action, "stop");
  assert.equal(e.reason, "blockEnde");
});

test("PM-13 Gegenprobe: mit genug Rest laeuft derselbe Block weiter", () => {
  const start = Date.parse("2026-09-21T13:30:00Z");
  assert.equal(Pacemaker.entscheide(basis({
    blockStartMs: start, blockMaxMs: 60 * MIN, nowMs: start + 50 * MIN
  })).action, "tick");
});

/* --- Faelle 2, 3, 4: Ausloeser und Nebenlaeufigkeit im Workflow --------- */

const wf = readFileSync(join(root, ".github", "workflows", "intraday-pacemaker.yml"), "utf8");

test("PM-14 der Taktgeber nimmt einen externen Wecker entgegen", () => {
  assert.match(wf, /repository_dispatch:/, "ohne repository_dispatch kann Cloudflare nicht wecken");
  assert.match(wf, /types:\s*\[intraday-tick\]/);
  assert.match(wf, /workflow_dispatch:/, "Handbetrieb muss moeglich bleiben");
});

test("PM-15 ein zweiter Block bricht den laufenden nicht ab, sondern wartet", () => {
  assert.match(wf, /group:\s*intraday-pacemaker/);
  assert.match(wf, /cancel-in-progress:\s*false/,
               "cancel-in-progress: true wuerde mitten im Zyklus abschneiden");
});

test("PM-16 der alte Fuenf-Minuten-Zeitplan schreibt nicht mehr parallel", () => {
  const alt = readFileSync(join(root, ".github", "workflows", "intraday-snapshots.yml"), "utf8");
  const crons = alt.match(/^\s*-\s*cron:.*$/gm) || [];
  assert.ok(!crons.some((c) => /\*\/5/.test(c)),
            "zwei Workflows auf denselben Dateien sind ein Wettlauf um denselben Ref");
  assert.ok(crons.length >= 1, "der Universumslauf nach Schluss muss bleiben");
});

/* --- Fall 15: Zero Cost ------------------------------------------------ */

test("PM-17 der Taktgeber aktiviert nichts Kostenpflichtiges", () => {
  assert.ok(!/usage_model/.test(wf));
  assert.ok(!/runs-on:\s*(?!ubuntu-latest)/m.test(wf.replace(/runs-on: ubuntu-latest/g, "")),
            "nur der kostenlose Standard-Runner");
  assert.match(wf, /runs-on: ubuntu-latest/);
});

test("PM-18 der Block bleibt unter dem Sechs-Stunden-Limit der Plattform", () => {
  assert.ok(Pacemaker.BLOCK_MAX_MS < 6 * 3600000,
            "ein Block, den die Plattform abschneidet, verliert seinen letzten Zyklus");
  const m = /timeout-minutes:\s*(\d+)/.exec(wf);
  assert.ok(m && Number(m[1]) < 360, "auch das Netz darunter muss unter sechs Stunden liegen");
  assert.ok(Number(m[1]) * MIN > Pacemaker.BLOCK_MAX_MS,
            "das Netz muss spaeter greifen als die eigene Blockgrenze");
});

/* --- Der Fehlerpfad, der selbst fehlerhaft war ------------------------- */

test("PM-19 der Lauf ohne Zugang steigt sauber aus, statt abzustuerzen", () => {
  /* Gefunden beim ersten Rauchtest des Taktgebers: writeStatus() las
     `provider`, `abbruch` und `t0`, bevor sie initialisiert waren - der
     Weg ohne Schluessel endete in einem ReferenceError statt in einem
     Statusbericht. Im Betrieb liegt der Schluessel vor; genau deshalb ist
     es niemandem aufgefallen. Ein Taktgeber, der einen Absturz als
     Fehlversuch zaehlt, gibt nach drei Zyklen auf - dieser Fehlerpfad
     entscheidet also mit, ob der Takt haelt. */
  const r = spawnSync(process.execPath,
    [join(root, "scripts", "market", "ingest-intraday.mjs"), "--scope=AAPL", "--dry-run"],
    { cwd: root, encoding: "utf8", env: { ...process.env, TIINGO_API_KEY: "" } });
  assert.equal(r.status, 0, "ohne Zugang ist Aussteigen richtig, Abstuerzen nicht");
  assert.ok(!/ReferenceError/.test((r.stderr || "") + (r.stdout || "")),
            "temporale Totzone: " + (r.stderr || "").slice(0, 200));
  assert.match(r.stdout || "", /Kein TIINGO_API_KEY/);
});
