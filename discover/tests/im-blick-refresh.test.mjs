/* =========================================================================
   IM BLICK - ZWEI-STUNDEN-TAKT, DER OHNE PUENKTLICHEN ZEITPLAN AUSKOMMT
   (discover/engines/refresh-plan.js, scripts/discover/build-im-blick-live.mjs,
    scripts/discover/check-im-blick-live.mjs, worker-waker/, Workflow)

   Hintergrund (12.10.2026): GitHub legte fuer den Stundenplan dieses
   Workflows keinen Lauf an. Der Lauf ist deshalb eine Fragestellung:
   "welcher Slot war zuletzt faellig, und ist er veroeffentlicht?"

   RF1   regulaerer US-Handelstag: Slots, Veroeffentlichung, Idempotenz
   RF2   US-Boersenfeiertag: kein Slot, kein Alarm
   RF3   verkuerzter Handelstag
   RF4   Sommer-/Winterzeit, einschliesslich der Wochen, in denen USA und
         Europa verschieden stehen
   RF5   verspaeteter Schedule: ein spaeter Ausloeser holt den Termin nach
   RF6   vollstaendig ausgefallener Schedule: die Ueberwachung schlaegt an,
         ein spaeter Lauf heilt, der Wecker deckt jeden Slot ab
   RF7   parallele Ausfuehrungen: nie eine halbe oder zerstoerte Datei
   RF8   fehlgeschlagener Anbieterabruf: die letzte gueltige Auswahl bleibt
   RF9   veraltete Kursdaten: nicht LIVE, und als Datenproblem benannt
   RF10  aeltere Veroeffentlichung nach neuerem Datenstand: wird nie ersetzt
   RF11  Browser-Cache und Service Worker
   RF12  Schlusskurs-Uebergang nach Handelsschluss
   RF13  Monitor: jedes verlangte Feld, Ueberwachung ohne Fehlalarm
   RF14  Workflow und Wecker: Vertrag (ADR-005, Namen, Kosten)
   RF15  Ueberwachung: jeder ausgefallene Slot wird an jedem Handelstag des
         Jahres von mindestens einem Pruefzeitpunkt gesehen, ohne Fehlalarm
   RF16  Befunde der unabhaengigen Reviews (12.10.2026): Vor dem ersten Slot,
         Drosselung, kein LIVE nach dem Schluss, DATA_STALE statt
         'nicht gestartet', Mindestabdeckung, kaputte Eingaben, Kalenderende
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "discover", "build-im-blick-live.mjs");
const CHECK = join(ROOT, "scripts", "discover", "check-im-blick-live.mjs");
const Identity = require(join(ROOT, "core", "identity.js"));
const Plan = require(join(ROOT, "discover", "engines", "refresh-plan.js"));
const CAL = JSON.parse(readFileSync(join(ROOT, "quant", "config", "market-calendar.json"), "utf8"));

/* ------------------------------------------------------------ Fixtures */
const TAG = "2026-10-14", VORTAG = "2026-10-13";           /* Mittwoch, EDT */
const NAMES = ["AAA", "BBB", "CCC", "DDD"];
const SEKTOREN = ["Technology", "Energy", "Health Care", "Financials"];   /* die Auswahl begrenzt auf 2 je Sektor */
const E = (s, o = {}) => Object.assign({ s, sec: SEKTOREN[Math.max(0, NAMES.indexOf(s))], tier: null, lp: 80, rs: 85, acc: 0.02, vol: 0.02, trend: true, age: 3, hi: 110, close: 100, eod: 50 }, o);
function snapshot(s, session, asOf, asOfLocal, o = {}) {
  return { schemaVersion: "intraday-snapshot-1.0.0", symbol: s, securityId: Identity.securityIdForTicker(s), sessionDate: session,
           asOf, asOfLocal, previousClose: o.prev === undefined ? 100 : o.prev, points: o.points || [["09:30", 100.5], ["10:30", 106], ["11:30", o.last || 112]] };
}
function detail(s) {
  return { symbol: s, companyName: s + " Inc", sector: "Technology", signals: {}, metrics: { leadershipPercentile: 80 }, metricStatus: {},
           badges: [], plain: { story: "Story " + s }, priceSeries: { status: "CALCULATED" }, asOf: VORTAG };
}
function fixture({ basisAsOf = VORTAG, session = TAG, asOf = null, asOfLocal = "11:15", snaps = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vu-imblick-rf-"));
  mkdirSync(join(dir, "discover", "data", "im-blick"), { recursive: true });
  mkdirSync(join(dir, "discover", "data", "stocks", "US_REAL"), { recursive: true });
  mkdirSync(join(dir, "out"), { recursive: true });
  writeFileSync(join(dir, "discover", "data", "im-blick", "basis-US_REAL.json"), JSON.stringify({ asOf: basisAsOf, stocks: NAMES.map((n) => E(n)) }));
  for (const n of NAMES) writeFileSync(join(dir, "discover", "data", "stocks", "US_REAL", n + ".json"), JSON.stringify(detail(n)));
  if (snaps && asOf) setzeSnapshots(dir, session, asOf, asOfLocal);
  return dir;
}
function setzeSnapshots(dir, session, asOf, asOfLocal) {
  const d = join(dir, "quant", "data", "market", "intraday", session);
  mkdirSync(d, { recursive: true });
  for (const n of NAMES) writeFileSync(join(d, Identity.securityIdForTicker(n) + ".json"), JSON.stringify(snapshot(n, session, asOf, asOfLocal)));
}
const OUTFILE = (dir) => join(dir, "out", "im-blick-US_REAL.json");
const MONFILE = (dir) => join(dir, "out", "monitor-US_REAL.json");
const lies = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
function lauf(dir, now, extra = []) {
  const r = spawnSync(process.execPath, [SCRIPT, ...extra, "--now", now, "--data-root", dir, "--out", OUTFILE(dir), "--source", "test"],
    { encoding: "utf8", env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: "", GITHUB_EVENT_NAME: "", GITHUB_RUN_ID: "" }) });
  return { code: r.status, out: r.stdout + r.stderr, live: lies(OUTFILE(dir)), mon: lies(MONFILE(dir)) };
}
const weg = (dir) => rmSync(dir, { recursive: true, force: true });
const pruefe = (dir, now, strict = true) => spawnSync(process.execPath, [CHECK, "--root=" + dir, "--now=" + now, ...(strict ? ["--strict"] : [])], { encoding: "utf8" });
/* Der Pruefer liest <root>/discover/live/...; die Fixture schreibt nach out/. */
function spiegleFuerPruefer(dir) {
  mkdirSync(join(dir, "discover", "live"), { recursive: true });
  for (const f of ["im-blick-US_REAL.json", "monitor-US_REAL.json"]) if (existsSync(join(dir, "out", f))) writeFileSync(join(dir, "discover", "live", f), readFileSync(join(dir, "out", f)));
  writeFileSync(join(dir, "discover", "data", "meta.json"), JSON.stringify({ universes: [{ id: "US_REAL", asOf: JSON.parse(readFileSync(join(dir, "discover", "data", "im-blick", "basis-US_REAL.json"), "utf8")).asOf }] }));
}
const hhmm = (iso) => iso.slice(11, 16);

/* ----------------------------------------------------------------- RF1 */
test("RF1 · regulaerer Handelstag: Slot faellig -> LIVE mit Slot; zweiter Lauf desselben Slots aendert nichts", () => {
  const slots = Plan.slotsOf(Plan.sessionByDate(TAG, CAL)).map((s) => s.id + "@" + hhmm(s.dueAt));
  assert.deepEqual(slots, [TAG + "@I1@15:00", TAG + "@I2@17:00", TAG + "@I3@19:00", TAG + "@C@20:00".replace("20:00", "20:20")]);
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    const a = lauf(dir, TAG + "T15:35:00Z");
    assert.equal(a.code, 0, a.out);
    assert.equal(a.live.status, "LIVE");
    assert.equal(a.live.slot.id, TAG + "@I1");
    assert.equal(a.live.schemaVersion, "discover-im-blick-live-1.1.0");
    assert.ok(a.live.stocks.length >= 3);
    assert.equal(a.live.validUntil, TAG + "T18:30:00.000Z", "naechster Slot (17:00) + 90 Min. Karenz");
    const vorher = readFileSync(OUTFILE(dir), "utf8"), monVorher = readFileSync(MONFILE(dir), "utf8");
    const b = lauf(dir, TAG + "T15:50:00Z");
    assert.match(b.out, /UP_TO_DATE/);
    assert.equal(readFileSync(OUTFILE(dir), "utf8"), vorher, "Idempotenz: Datei unveraendert");
    assert.equal(readFileSync(MONFILE(dir), "utf8"), monVorher, "ein Leerlauf schreibt auch den Monitor nicht");
    /* Der naechste Slot rechnet neu, mit neuerem Datenstand. */
    setzeSnapshots(dir, TAG, TAG + "T17:10:00.000Z", "13:10");
    const c = lauf(dir, TAG + "T17:15:00Z");
    assert.equal(c.live.slot.id, TAG + "@I2");
    assert.equal(c.live.asOf, TAG + "T17:10:00.000Z");
    assert.equal(c.mon.history.length, 2);
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- RF2 */
test("RF2 · Boersenfeiertag (Thanksgiving 26.11.2026): kein Slot, kein Alarm", () => {
  const p = Plan.planAt("2026-11-26T16:00:00Z", CAL);
  assert.equal(p.marketState, "HOLIDAY");
  assert.equal(p.due.sessionDate, "2026-11-25", "faellig bleibt der Schlussslot des Vortags");
  assert.ok(!p.next || p.next.sessionDate === "2026-11-27");
  assert.ok(![...Array(48).keys()].some((h) => { const q = Plan.planAt(Date.parse("2026-11-26T00:00:00Z") + h * 1800000, CAL); return q.due && q.due.sessionDate === "2026-11-26" && Date.parse(q.due.dueAt) > Date.parse("2026-11-26T00:00:00Z") && Date.parse(q.due.dueAt) < Date.parse("2026-11-27T00:00:00Z"); }), "am Feiertag wird nie ein Slot faellig");
  /* Ohne Monitor, Abendlauf deckt den 25.11. ab: kein Alarm. */
  const r = Plan.assess(null, CAL, { nowMs: Date.parse("2026-11-26T18:00:00Z"), eodAsOf: "2026-11-25" });
  assert.equal(r.level, "OK");
});

/* ----------------------------------------------------------------- RF3 */
test("RF3 · verkuerzter Handelstag (27.11.2026, Schluss 13:00): 11:00 und Schluss + 20", () => {
  const s = Plan.sessionByDate("2026-11-27", CAL);
  assert.equal(s.closeLocal, "13:00");
  assert.deepEqual(Plan.slotsOf(s).map((x) => x.id.split("@")[1] + " " + hhmm(x.dueAt)), ["I1 16:00", "C 18:20"]);
  assert.equal(Plan.planAt("2026-11-27T17:00:00Z", CAL).due.id, "2026-11-27@I1");
  assert.equal(Plan.planAt("2026-11-27T18:30:00Z", CAL).due.id, "2026-11-27@C");
  const dir = fixture({ session: "2026-11-27", basisAsOf: "2026-11-25", asOf: "2026-11-27T17:55:00.000Z", asOfLocal: "12:55" });
  try {
    const r = lauf(dir, "2026-11-27T18:30:00Z");
    assert.equal(r.code, 0, r.out);
    assert.equal(r.live.slot.id, "2026-11-27@C");
    assert.equal(r.live.status, "SESSION_CLOSED", "nach 13:00 ist die Sitzung beendet, nicht LIVE");
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- RF4 */
test("RF4 · Sommer-/Winterzeit: dieselben New Yorker Zeiten, andere UTC-Zeiten; die Umstellungswochen von USA und Europa", () => {
  const u = (tag) => Plan.slotsOf(Plan.sessionByDate(tag, CAL)).map((x) => hhmm(x.dueAt)).join(",");
  assert.equal(u("2026-10-27"), "15:00,17:00,19:00,20:20", "USA noch Sommerzeit (EDT)");
  assert.equal(u("2026-10-28"), "15:00,17:00,19:00,20:20", "Europa schon Winterzeit (seit 25.10.), USA noch EDT: nur die New Yorker Zeit zaehlt");
  assert.equal(u("2026-11-03"), "16:00,18:00,20:00,21:20", "USA Winterzeit (EST) seit 1.11.");
  assert.equal(u("2026-03-16"), "15:00,17:00,19:00,20:20", "USA seit 8.3. EDT, Europa noch CET bis 29.3.");
  assert.equal(u("2026-03-02"), "16:00,18:00,20:00,21:20", "beide noch Winterzeit");
  /* Der Zeitplan (Min. 27, 15-21 UTC) und der Wecker (Min. 5/35, 15-21 UTC) decken jeden Slot des Jahres ab. */
  const { imBlickTick } = importWecker();
  let geprueft = 0;
  for (let t = Date.parse("2026-01-01T00:00:00Z"); t < Date.parse("2027-01-01T00:00:00Z"); t += 86400000) {
    const tag = new Date(t).toISOString().slice(0, 10);
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6 || CAL.exchanges.XNYS.holidays.some((h) => (h.date || h) === tag)) continue;
    for (const slot of Plan.slotsOf(Plan.sessionByDate(tag, CAL))) {
      const due = Date.parse(slot.dueAt);
      const tick = firstTick(due, imBlickTick);
      assert.ok(tick !== null && tick - due <= 35 * 60000, tag + " " + slot.id + ": Wecker-Tick spaetestens 35 Min. nach dem Slot (" + (tick && (tick - due) / 60000) + ")");
      assert.ok(cronMinute27(due) !== null, tag + " " + slot.id + ": GitHub-Rueckfall-Zeitplan kommt nach dem Slot");
      geprueft++;
    }
  }
  assert.ok(geprueft > 900, "ein ganzes Jahr: " + geprueft);
});
function firstTick(afterMs, imBlickTick) {
  for (let t = Math.ceil(afterMs / 300000) * 300000; t < afterMs + 6 * 3600000; t += 300000) if (imBlickTick(t)) return t;
  return null;
}
function cronMinute27(afterMs) {
  for (let t = Math.ceil(afterMs / 60000) * 60000; t < afterMs + 3 * 3600000; t += 60000) {
    const d = new Date(t);
    if (d.getUTCMinutes() === 27 && d.getUTCHours() >= 15 && d.getUTCHours() <= 21 && d.getUTCDay() >= 1 && d.getUTCDay() <= 5) return t;
  }
  return null;
}
let waker = null;
function importWecker() {
  if (!waker) { const src = readFileSync(join(ROOT, "worker-waker", "src", "index.mjs"), "utf8"); const m = /function imBlickTick[\s\S]*?\n\}/.exec(src); const konst = /const IMBLICK_MINUTEN[^\n]*\nconst IMBLICK_STUNDEN[^\n]*/.exec(src);
    waker = vm.runInNewContext(konst[0].replace(/^const /gm, "var ") + "\n" + m[0] + "\n({imBlickTick})"); }
  return waker;
}

/* ----------------------------------------------------------------- RF5 */
test("RF5 · verspaeteter Schedule: ein Ausloeser Stunden nach dem Termin rechnet gegen den dann aktuellen Stand und benennt den faelligen Slot", () => {
  const dir = fixture({ asOf: TAG + "T18:40:00.000Z", asOfLocal: "14:40" });
  try {
    /* I1 (15:00) und I2 (17:00) sind verpasst; der Ausloeser kommt um 18:45, 105 Min. nach I2. */
    const r = lauf(dir, TAG + "T18:45:00Z");
    assert.equal(r.live.slot.id, TAG + "@I2", "der zuletzt faellige Slot, nicht der ausgefallene erste");
    assert.equal(r.live.asOf, TAG + "T18:40:00.000Z", "der Datenstand ist der echte, nicht der des Termins");
    assert.equal(r.live.status, "LIVE");
    assert.equal(r.mon.lastRun.decision, "NO_PUBLISHED");
    /* Derselbe Slot, zweiter verspaeteter Ausloeser: nichts. */
    assert.match(lauf(dir, TAG + "T18:55:00Z").out, /UP_TO_DATE/);
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- RF6 */
test("RF6 · ausgefallener Schedule: die Ueberwachung erkennt den fehlenden Lauf (ohne dass ein Workflow ihn meldet); ein spaeter Lauf heilt", () => {
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    lauf(dir, TAG + "T15:35:00Z");                                       /* I1 veroeffentlicht */
    spiegleFuerPruefer(dir);
    const ok = (t) => pruefe(dir, t);
    assert.equal(ok(TAG + "T16:30:00Z").status, 0, "I1 erledigt, I2 noch nicht faellig");
    assert.equal(ok(TAG + "T17:30:00Z").status, 0, "I2 seit 30 Min. faellig: innerhalb der Toleranz");
    const warn = ok(TAG + "T17:55:00Z");
    assert.equal(warn.status, 0); assert.match(warn.stdout, /RECOMPUTE_LATE/);
    const fail = ok(TAG + "T18:40:00Z");
    assert.equal(fail.status, 2, "100 Min. ueberfaellig: FAIL (rot, GitHub benachrichtigt)");
    assert.match(fail.stdout, /::error title=Im Blick RECOMPUTE_OVERDUE::.*nicht gestartet/);
    /* Heilung: ein spaeter Ausloeser rechnet, die Pruefung wird wieder ruhig. */
    setzeSnapshots(dir, TAG, TAG + "T18:35:00.000Z", "14:35");
    assert.equal(lauf(dir, TAG + "T18:45:00Z").live.slot.id, TAG + "@I2");
    spiegleFuerPruefer(dir);
    assert.equal(ok(TAG + "T18:50:00Z").status, 0);
    /* Ausserhalb der Handelszeiten bleibt es still (Wochenende, Nacht, Abendlauf hat die Sitzung). */
    const nacht = Plan.assess(lies(MONFILE(dir)), CAL, { nowMs: Date.parse("2026-10-17T12:00:00Z"), eodAsOf: "2026-10-16" });
    assert.equal(nacht.level, "OK");
    assert.equal(Plan.assess(null, CAL, { nowMs: Date.parse(TAG + "T21:30:00Z"), eodAsOf: TAG }).level, "OK", "der Abendlauf deckt die Sitzung");
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- RF7 */
test("RF7 · parallele Ausfuehrungen: nie eine halbe oder widerspruechliche Datei", async () => {
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    const kinder = [...Array(6)].map(() => new Promise((res) => {
      const c = spawn(process.execPath, [SCRIPT, "--now", TAG + "T15:35:00Z", "--data-root", dir, "--out", OUTFILE(dir), "--source", "parallel"],
        { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: "" }) });
      c.on("close", (code) => res(code));
    }));
    const codes = await Promise.all(kinder);
    assert.ok(codes.every((c) => c === 0));
    const live = lies(OUTFILE(dir)), mon = lies(MONFILE(dir));       /* JSON.parse wirft bei einer halben Datei */
    assert.equal(live.slot.id, TAG + "@I1");
    assert.equal(live.status, "LIVE");
    assert.ok(mon.history.length >= 1 && mon.published.slot.id === live.slot.id);
    assert.ok(!existsSync(OUTFILE(dir) + ".tmp-" + process.pid));
    /* Schreibweise: Nachbardatei + Umbenennen. */
    assert.match(readFileSync(SCRIPT, "utf8"), /renameSync\(tmp, datei\)/);
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- RF8 */
test("RF8 · fehlgeschlagener Anbieterabruf: ohne Snapshots ehrlicher Zustand; mit gueltiger Auswahl bleibt diese stehen", () => {
  const dir = fixture({ snaps: false });
  try {
    const leer = lauf(dir, TAG + "T15:35:00Z");
    assert.equal(leer.code, 0);
    assert.equal(leer.live.status, "NO_INTRADAY", "kein Anbieterstand: ehrlich nichts");
    assert.deepEqual(leer.live.stocks, []);
    assert.equal(leer.mon.error.code, "NO_INTRADAY");
    assert.match(leer.out, /::warning title=Im Blick NO_INTRADAY/);
    /* Gueltige Auswahl veroeffentlichen, dann faellt der Abruf aus (Snapshots weg). */
    setzeSnapshots(dir, TAG, TAG + "T15:20:00.000Z", "11:20");
    assert.equal(lauf(dir, TAG + "T15:40:00Z", ["--force"]).live.status, "LIVE");
    rmSync(join(dir, "quant"), { recursive: true, force: true });
    const spaeter = lauf(dir, TAG + "T17:10:00Z");
    assert.equal(spaeter.live.status, "LIVE", "die letzte gueltige Auswahl bleibt");
    assert.equal(spaeter.live.slot.id, TAG + "@I1", "und wird nicht als neuer Slot ausgegeben");
    assert.equal(spaeter.mon.lastRun.result, "KEEP_LAST_VALID");
    assert.equal(spaeter.mon.error.code, "NO_INTRADAY");
    assert.equal(spaeter.mon.lastSuccess.slotId, TAG + "@I1", "der letzte Erfolg bleibt der echte");
    /* Ein Fehlversuch wird nicht im Minutentakt wiederholt: erst nach der Wartezeit. */
    assert.equal(Plan.decide(Plan.planAt(TAG + "T17:10:00Z", CAL), { slot: { dueAt: TAG + "T17:00:00.000Z" }, status: "NO_INTRADAY", generatedAt: TAG + "T17:05:00.000Z", eodAsOf: VORTAG, schemaVersion: "x" }, { nowMs: Date.parse(TAG + "T17:10:00Z"), basisAsOf: VORTAG, schemaVersion: "x" }).reason, "RETRY_LATER");
    assert.equal(Plan.decide(Plan.planAt(TAG + "T17:30:00Z", CAL), { slot: { dueAt: TAG + "T17:00:00.000Z" }, status: "NO_INTRADAY", generatedAt: TAG + "T17:05:00.000Z", eodAsOf: VORTAG, schemaVersion: "x" }, { nowMs: Date.parse(TAG + "T17:30:00Z"), basisAsOf: VORTAG, schemaVersion: "x" }).reason, "RETRY");
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- RF9 */
test("RF9 · veraltete Kursdaten: nicht LIVE, als Datenproblem benannt (nicht als ausgefallene Neuberechnung)", () => {
  const dir = fixture({ asOf: TAG + "T14:00:00.000Z", asOfLocal: "10:00" });         /* 95 Min. alt um 15:35 */
  try {
    const r = lauf(dir, TAG + "T15:35:00Z");
    assert.equal(r.live.status, "INTRADAY_STALE");
    assert.deepEqual(r.live.stocks, []);
    assert.equal(r.live.dataState.reason, "OPEN_DATA_OLD");
    assert.equal(r.mon.error.code, "INTRADAY_STALE");
    assert.ok(r.live.dataState.ageMin >= 90);
    /* Kein Slot-Alarm: die Rechnung lief; die Ueberwachung nennt die Ursache DATA/Anbieter, nicht RECOMPUTE. */
    spiegleFuerPruefer(dir);
    const p = pruefe(dir, TAG + "T15:40:00Z");
    assert.equal(p.status, 0);
    assert.doesNotMatch(p.stdout, /RECOMPUTE_OVERDUE/);
  } finally { weg(dir); }
  /* Nach dem Schluss muss der Stand aus der Schlussphase stammen. */
  const dir2 = fixture({ asOf: TAG + "T17:00:00.000Z", asOfLocal: "13:00" });
  try {
    const r = lauf(dir2, TAG + "T20:30:00Z");
    assert.equal(r.live.status, "INTRADAY_STALE");
    assert.equal(r.live.dataState.reason, "CLOSE_DATA_OLD");
  } finally { weg(dir2); }
});

/* ---------------------------------------------------------------- RF10 */
test("RF10 · eine aeltere Veroeffentlichung ersetzt nie eine neuere", () => {
  const dir = fixture({ asOf: TAG + "T17:10:00.000Z", asOfLocal: "13:10" });
  try {
    const neu = lauf(dir, TAG + "T17:15:00Z");
    assert.equal(neu.live.slot.id, TAG + "@I2");
    const inhalt = readFileSync(OUTFILE(dir), "utf8");
    /* Ein verspaeteter Lauf mit alter Uhr/altem Slot (z. B. ein gestauter Lauf): */
    const alt = lauf(dir, TAG + "T15:35:00Z");
    assert.match(alt.out, /PUBLISHED_NEWER/);
    assert.equal(readFileSync(OUTFILE(dir), "utf8"), inhalt);
    /* Auch erzwungen: die Ersetzungsregel haelt. */
    setzeSnapshots(dir, TAG, TAG + "T15:20:00.000Z", "11:20");
    const erzwungen = lauf(dir, TAG + "T15:35:00Z", ["--force"]);
    assert.equal(erzwungen.mon.lastRun.result, "PUBLISHED_NEWER");
    assert.equal(readFileSync(OUTFILE(dir), "utf8"), inhalt, "die neuere Auswahl bleibt");
    /* Reine Regel: gleicher Slot, aelterer Datenstand. */
    const pub = { sessionDate: TAG, eodAsOf: VORTAG, status: "LIVE", asOf: TAG + "T17:10:00.000Z", slot: { dueAt: TAG + "T17:00:00.000Z" } };
    assert.equal(Plan.mayReplace(pub, Object.assign({}, pub, { asOf: TAG + "T16:50:00.000Z" })).reason, "OLDER_DATA");
    assert.equal(Plan.mayReplace(pub, Object.assign({}, pub, { asOf: TAG + "T17:25:00.000Z" })).ok, true, "Gegenprobe: neuerer Stand ersetzt");
  } finally { weg(dir); }
});

/* ---------------------------------------------------------------- RF11 */
test("RF11 · Browser-Cache und Service Worker: eigener fetch mit no-cache und Fuenf-Minuten-Parameter; Gueltigkeit aus der Datei; kein Datencache im Service Worker", async () => {
  const D = {}; const abrufe = [];
  const live = { status: "LIVE", eodAsOf: VORTAG, generatedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 3600000).toISOString(), stocks: [{ symbol: "A" }, { symbol: "B" }, { symbol: "C" }] };
  const fetch = (url, opts) => { abrufe.push({ url, opts }); return Promise.resolve({ ok: true, json: () => Promise.resolve(live) }); };
  vm.runInNewContext(readFileSync(join(ROOT, "discover", "ui", "featured.js"), "utf8"), { window: { VUDiscover: D, QuantShell: { el() { return {}; } } }, Date, fetch, Math });
  let ersetzt = null; let n = 0;
  const view = { isConnected: true, className: "", dataset: {}, replaceWith(x) { ersetzt = x; } };
  D.Featured.live({ cards: [{ symbol: "EOD", asOf: VORTAG }] }, { universeId: "US_REAL" }, () => (++n === 1 ? view : { dataset: {}, className: "" }));
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(ersetzt);
  assert.equal(abrufe[0].opts.cache, "no-cache");
  assert.match(abrufe[0].url, /^\/discover\/live\/im-blick-US_REAL\.json\?t=\d+$/);
  const t = Number(abrufe[0].url.split("t=")[1]);
  assert.ok(Math.abs(t - Math.floor(Date.now() / 300000)) <= 1, "Fuenf-Minuten-Eimer");
  /* validUntil entscheidet, nicht nur das Alter. */
  const jetzt = Date.parse(TAG + "T20:00:00Z");
  const U = D.Featured.liveUsable;
  const basis = { status: "LIVE", eodAsOf: VORTAG, stocks: [{}, {}, {}], generatedAt: TAG + "T19:05:00.000Z", validUntil: TAG + "T20:30:00.000Z" };
  assert.equal(U(basis, VORTAG, jetzt), true);
  assert.equal(U(Object.assign({}, basis, { validUntil: TAG + "T19:59:00.000Z" }), VORTAG, jetzt), false, "abgelaufen trotz frischem generatedAt");
  assert.equal(U(Object.assign({}, basis, { validUntil: undefined, generatedAt: TAG + "T15:00:00.000Z" }), VORTAG, jetzt), false, "alte Datei ohne validUntil: drei Stunden");
  for (const st of ["INTRADAY_STALE", "NO_INTRADAY", "EOD_CURRENT", "EOD_STALE", "NO_EVENTS"]) assert.equal(U(Object.assign({}, basis, { status: st }), VORTAG, jetzt), false, st + " wird nie gezeigt");
  assert.equal(U(basis, "2026-10-12", jetzt), false, "andere Basis");
  /* Der Service Worker cached keine Daten. */
  const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
  assert.doesNotMatch(sw, /cache\.put|\.put\(/, "kein Schreiben von Antworten");
  assert.match(sw, /Bewusst minimal: Er cached KEINE Daten/);
  assert.match(sw, /PRECACHE = \['\/offline\.html'/);
});

/* ---------------------------------------------------------------- RF12 */
test("RF12 · Schlusskurs-Uebergang: nach Handelsschluss SESSION_CLOSED (nie LIVE), nach dem Abendlauf EOD_CURRENT", () => {
  const dir = fixture({ asOf: TAG + "T19:55:00.000Z", asOfLocal: "15:55" });
  try {
    const zu = lauf(dir, TAG + "T20:30:00Z");
    assert.equal(zu.live.slot.id, TAG + "@C");
    assert.equal(zu.live.status, "SESSION_CLOSED", "ausserhalb der Handelszeit keine LIVE-Kennzeichnung");
    assert.equal(zu.live.marketState, "AFTER_HOURS");
    assert.match(zu.live.reason, /Abendlauf/);
    assert.ok(zu.live.stocks.length >= 3);
    assert.equal(zu.live.dataState.stale, false);
    /* Waehrend der Sitzung (Gegenprobe) LIVE. */
    const dir2 = fixture({ asOf: TAG + "T19:55:00.000Z", asOfLocal: "15:55" });
    try { assert.equal(lauf(dir2, TAG + "T19:58:00Z").live.status, "LIVE"); } finally { weg(dir2); }
    /* Der Abendlauf schreibt die bestaetigte Basis (Stand = heute): der naechste Lauf meldet EOD_CURRENT. */
    writeFileSync(join(dir, "discover", "data", "im-blick", "basis-US_REAL.json"), JSON.stringify({ asOf: TAG, stocks: NAMES.map((n) => E(n)) }));
    const eod = lauf(dir, TAG + "T23:40:00Z");
    assert.equal(eod.live.status, "EOD_CURRENT");
    assert.equal(eod.mon.lastRun.decision, "BASIS_CHANGED");
    assert.deepEqual(eod.live.stocks, []);
    /* Der Client zeigt weder SESSION_CLOSED der alten Basis noch EOD_CURRENT. */
    const D = {}; vm.runInNewContext(readFileSync(join(ROOT, "discover", "ui", "featured.js"), "utf8"), { window: { VUDiscover: D, QuantShell: { el() { return {}; } } }, Date, Math, fetch() {} });
    assert.equal(D.Featured.liveUsable(zu.live, TAG, Date.parse(TAG + "T23:41:00Z")), false, "die Karten tragen jetzt die Schlusskurse vom " + TAG);
    assert.equal(D.Featured.liveUsable(eod.live, TAG, Date.parse(TAG + "T23:41:00Z")), false);
    /* Wochenende: nichts zu tun, keine Datei beruehrt. */
    const sa = lauf(dir, "2026-10-17T12:00:00Z");
    assert.match(sa.out, /UP_TO_DATE|PUBLISHED_NEWER|SLOT_DUE|BASIS_CHANGED|NO_PUBLISHED/);
  } finally { weg(dir); }
});

/* ---------------------------------------------------------------- RF13 */
test("RF13 · Monitor: jedes verlangte Feld; Ueberwachung ohne Fehlalarm", () => {
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    const r = lauf(dir, TAG + "T15:35:00Z", ["--event", "workflow_dispatch", "--source", "cloudflare-waker"]);
    const m = r.mon;
    assert.equal(m.schemaVersion, "discover-im-blick-monitor-1.0.0");
    assert.equal(m.plan.lastDueSlot.id, TAG + "@I1", "letzte geplante Ausfuehrung");
    assert.equal(m.plan.nextSlot.id, TAG + "@I2");
    assert.equal(m.lastRun.event, "workflow_dispatch", "letzte tatsaechlich gestartete Ausfuehrung: Ausloeser");
    assert.equal(m.lastRun.source, "cloudflare-waker");
    assert.ok(m.lastRun.startedAt && m.lastRun.finishedAt);
    assert.equal(m.lastSuccess.slotId, TAG + "@I1", "letzte erfolgreiche Berechnung");
    assert.ok(m.lastSuccess.computedAt);
    assert.equal(m.published.asOf, TAG + "T15:20:00.000Z", "letzter veroeffentlichter Datenstand");
    assert.equal(m.lastSuccess.dataAgeMinutes, 15, "Datenalter");
    assert.equal(m.plan.marketState, "OPEN", "Marktstatus");
    assert.equal(m.published.selected, r.live.stocks.length, "Anzahl der ausgewaehlten Aktien");
    assert.equal(m.error, null, "Fehlerstatus");
    assert.ok(Array.isArray(m.history));
    /* Fehlerursache wird benannt. */
    rmSync(join(dir, "quant"), { recursive: true, force: true });
    const f = lauf(dir, TAG + "T17:30:00Z");
    assert.equal(f.mon.error.code, "NO_INTRADAY");
    assert.ok(f.mon.error.message);
    /* Kein Fehlalarm: Mo-Fr 06:00 UTC (vor Sitzung), Nacht, Wochenende, Feiertag. */
    for (const t of ["2026-10-14T06:00:00Z", "2026-10-14T13:00:00Z", "2026-10-15T03:00:00Z", "2026-10-17T15:00:00Z", "2026-11-26T17:00:00Z"]) {
      const a = Plan.assess(null, CAL, { nowMs: Date.parse(t), eodAsOf: t.startsWith("2026-11-26") ? "2026-11-25" : (t >= "2026-10-15" ? "2026-10-14" : "2026-10-13") });
      assert.equal(a.level, "OK", t + " " + JSON.stringify(a.findings));
    }
  } finally { weg(dir); }
});

/* ---------------------------------------------------------------- RF14 */
test("RF14 · Workflow und Wecker: ADR-005, Namen, Kosten, Isolation", () => {
  const wf = readFileSync(join(ROOT, ".github", "workflows", "discover-im-blick-live.yml"), "utf8");
  assert.match(wf, /cron: '27 15-21 \* \* 1-5'/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /timeout-minutes: 10/, "kein Dauerlaeufer");
  assert.doesNotMatch(wf, /\bsleep\b|while true|seq 1/, "keine Endlosschleife, keine Wartezeit im Lauf");
  assert.match(wf, /scripts\/ci\/push-with-retry\.sh/);
  assert.match(wf, /cancel-in-progress: false/);
  assert.match(wf, /git add discover\/live\n/, "schreibt nur discover/live");
  assert.doesNotMatch(wf, /TIINGO|secrets\./);
  const pages = readFileSync(join(ROOT, ".github", "workflows", "pages-release.yml"), "utf8");
  assert.ok(pages.includes('- "' + wf.match(/^name:\s*(.+)$/m)[1] + '"'), "Name unveraendert: die Auslieferung haengt daran");
  const fm = readFileSync(join(ROOT, ".github", "workflows", "freshness-monitor.yml"), "utf8");
  assert.match(fm, /\n  imblick:\n/, "eigener Job fuer die Im-Blick-Pruefung");
  assert.match(fm, /check-im-blick-live\.mjs --strict/);
  assert.match(fm, /cron: '45 16-19 \* \* 1-5'/);
  assert.match(fm, /cron: '55 22 \* \* 1-5'/);
  /* Wecker: Im Blick getrennt vom Takt, Ausnahmen bleiben im Zweig, kein neues Recht. */
  const src = readFileSync(join(ROOT, "worker-waker", "src", "index.mjs"), "utf8");
  assert.match(src, /try \{ imBlick = await sorgeFuerImBlick/);
  assert.match(src, /const IMBLICK = "discover-im-blick-live\.yml"/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /\/contents\/|\/git\/refs|issues/);
  /* Kosten: Laeufe je Handelstag und Laufzeit. 14 Wecker-Ticks + 7 Zeitplan-Ereignisse, ~1,5 Min. => unter 35 Min. am Tag, Repository oeffentlich. */
  const lauefe = 7 * 2 + 7;
  assert.ok(lauefe * 1.5 < 35);
  /* Keine Anbieteranfrage im Rechenskript. */
  const sk = readFileSync(SCRIPT, "utf8");
  assert.doesNotMatch(sk, /\bfetch\(|https?:\/\/|process\.env\.(TIINGO|MARKETSTACK)/i);
  /* Isolation: nur discover/live. */
  assert.ok(statSync(join(ROOT, "discover", "engines", "refresh-plan.js")).isFile());
});


/* ---------------------------------------------------------------- RF15 */
function cronFeld(f, lo, hi) {
  const out = new Set();
  for (const teil of f.split(",")) {
    if (teil === "*") { for (let i = lo; i <= hi; i++) out.add(i); continue; }
    const m = /^(\d+)(?:-(\d+))?$/.exec(teil);
    if (!m) throw new Error("Cron-Feld nicht verstanden: " + f);
    for (let i = Number(m[1]); i <= Number(m[2] === undefined ? m[1] : m[2]); i++) out.add(i);
  }
  return out;
}
/** Pruefzeitpunkte (Minuten ab 00:00 UTC) je Wochentag (0=So) aus den Cron-Zeilen des Freshness-Monitors. */
function pruefzeiten() {
  const yml = readFileSync(join(ROOT, ".github", "workflows", "freshness-monitor.yml"), "utf8");
  const crons = [...yml.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const proTag = new Map([0, 1, 2, 3, 4, 5, 6].map((d) => [d, []]));
  for (const c of crons) {
    const [mi, st, , , dow] = c.split(/\s+/);
    for (const d of cronFeld(dow.replace("7", "0"), 0, 6)) for (const h of cronFeld(st, 0, 23)) for (const m of cronFeld(mi, 0, 59)) proTag.get(d).push(h * 60 + m);
  }
  return { crons, proTag };
}
const handelstage = (von, bis) => {
  const out = [];
  for (let t = Date.parse(von + "T00:00:00Z"); t <= Date.parse(bis + "T00:00:00Z"); t += 86400000) {
    const tag = new Date(t).toISOString().slice(0, 10), wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6 || CAL.exchanges.XNYS.holidays.some((h) => (h.date || h) === tag)) continue;
    out.push({ tag, t, wd });
  }
  return out;
};

test("RF15 · Ueberwachung: jeder ausgefallene Slot wird an jedem Handelstag von mindestens einem Pruefzeitpunkt gesehen - und ohne Ausfall schlaegt keiner an", () => {
  const { crons, proTag } = pruefzeiten();
  assert.ok(crons.includes("45 16-19 * * 1-5") && crons.includes("55 22 * * 1-5"));
  let tage = 0;
  for (const { tag, t, wd } of handelstage("2026-01-02", "2027-12-30")) {
    const slots = Plan.slotsOf(Plan.sessionByDate(tag, CAL));
    const vorSitzung = Plan.planAt(t, CAL).due.sessionDate;                 /* der Abendlauf von gestern ist durch */
    const zeiten = proTag.get(wd).map((m) => t + m * 60000);
    /* 1. Ab jedem Slot k fehlt alles: ein Pruefzeitpunkt muss FAIL melden. */
    slots.forEach((slot, k) => {
      const vorher = k === 0 ? null : slots[k - 1];
      const monitor = vorher ? { published: { status: "LIVE", slot: { dueAt: vorher.dueAt } }, lastRun: null, error: null } : null;
      const sieht = zeiten.some((z) => Plan.assess(monitor, CAL, { nowMs: z, eodAsOf: vorSitzung }).level === "FAIL");
      assert.ok(sieht, tag + ": fehlt alles ab " + slot.id + ", und kein Pruefzeitpunkt schlaegt an (" + zeiten.map((z) => new Date(z).toISOString().slice(11, 16)).join(",") + ")");
    });
    /* 2. Alles veroeffentlicht, was faellig ist: nie ein Alarm - auch nicht in der Toleranz. */
    for (const z of zeiten) {
      const p = Plan.planAt(z, CAL);
      const monitor = p.due ? { published: { status: "LIVE", slot: { dueAt: p.due.dueAt } }, lastRun: null, error: null } : null;
      const a = Plan.assess(monitor, CAL, { nowMs: z, eodAsOf: vorSitzung });
      assert.equal(a.level, "OK", tag + " " + new Date(z).toISOString().slice(11, 16) + " " + JSON.stringify(a.findings));
    }
    tage++;
  }
  assert.ok(tage > 480, "zwei Jahre Handelstage: " + tage);
  /* Wochenende und Feiertag: auch ohne alles still. */
  for (const z of ["2026-10-17T19:45:00Z", "2026-10-18T22:55:00Z", "2026-11-26T18:45:00Z", "2026-11-26T22:55:00Z", "2026-12-25T17:45:00Z"]) {
    const p = Plan.planAt(z, CAL);
    assert.equal(Plan.assess(null, CAL, { nowMs: Date.parse(z), eodAsOf: p.due ? p.due.sessionDate : null }).level, "OK", z);
  }
  /* Gegenprobe zum frueheren Termin 19:40: im Sommer sah er den Slot nur 40 Minuten nach dem Slot. */
  assert.equal(Plan.assess({ published: { status: "LIVE", slot: { dueAt: "2026-10-14T15:00:00.000Z" } } }, CAL, { nowMs: Date.parse("2026-10-14T19:40:00Z"), eodAsOf: "2026-10-13" }).level, "OK", "19:40 war im Sommer blind");
  assert.equal(Plan.assess({ published: { status: "LIVE", slot: { dueAt: "2026-10-14T15:00:00.000Z" } } }, CAL, { nowMs: Date.parse("2026-10-14T18:45:00Z"), eodAsOf: "2026-10-13" }).level, "FAIL", "18:45 sieht es");
});

/* ---------------------------------------------------------------- RF16 */
test("RF16a · vor dem ersten Slot (Winterzeit, 10:35 New York) wird nichts als LIVE unter dem Slot von gestern veroeffentlicht", () => {
  const W = "2026-11-03", V = "2026-11-02";                        /* EST: I1 um 16:00 UTC */
  const dir = fixture({ session: W, basisAsOf: V, asOf: W + "T15:20:00.000Z", asOfLocal: "10:20" });
  try {
    const frueh = lauf(dir, W + "T15:35:00Z");
    assert.match(frueh.out, /BEFORE_FIRST_SLOT/);
    assert.equal(frueh.live, null, "nichts geschrieben");
    setzeSnapshots(dir, W, W + "T16:05:00.000Z", "11:05");
    const spaeter = lauf(dir, W + "T16:10:00Z");
    assert.equal(spaeter.live.slot.id, W + "@I1");
    assert.equal(spaeter.live.status, "LIVE");
  } finally { weg(dir); }
});

test("RF16b · Anbieterausfall: Fehlversuche werden gebremst, ein gleicher Fehlversuch schreibt nichts, und die Ueberwachung sagt DATA_STALE statt 'nicht gestartet'", () => {
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    lauf(dir, TAG + "T15:35:00Z");                                  /* I1 LIVE */
    setzeSnapshots(dir, TAG, TAG + "T15:20:00.000Z", "11:20");        /* die Snapshots bleiben stehen */
    const a = lauf(dir, TAG + "T17:05:00Z");
    assert.equal(a.mon.lastRun.result, "KEEP_LAST_VALID");
    assert.equal(a.mon.error.code, "INTRADAY_STALE");
    const nachA = readFileSync(MONFILE(dir), "utf8");
    const b = lauf(dir, TAG + "T17:15:00Z");                         /* 10 Min. spaeter: gebremst */
    assert.match(b.out, /RETRY_LATER/);
    assert.equal(readFileSync(MONFILE(dir), "utf8"), nachA);
    const c = lauf(dir, TAG + "T17:35:00Z");                         /* 30 Min. spaeter: neuer Versuch, gleiches Ergebnis */
    assert.match(c.out, /unveraendert \(nicht neu geschrieben\)/);
    assert.equal(readFileSync(MONFILE(dir), "utf8"), nachA, "kein Commit fuer einen Fehlversuch mit demselben Ergebnis");
    /* Ueberwachung: der Lauf fand statt - Datenproblem, nicht 'nicht gestartet', kein FAIL. */
    spiegleFuerPruefer(dir);
    const p = pruefe(dir, TAG + "T18:45:00Z");
    assert.equal(p.status, 0, p.stdout);
    assert.match(p.stdout, /DATA_STALE/);
    assert.doesNotMatch(p.stdout, /RECOMPUTE_OVERDUE|nicht gestartet/);
    /* Gegenprobe: ohne jeden Lauf fuer diesen Slot ist es FAIL. */
    const ohne = Plan.assess({ published: a.mon.published, lastRun: { slotId: TAG + "@I1" }, error: null }, CAL, { nowMs: Date.parse(TAG + "T18:45:00Z"), eodAsOf: VORTAG });
    assert.equal(ohne.level, "FAIL");
  } finally { weg(dir); }
});

test("RF16c · nach dem Schluss wird eine noch gueltige LIVE-Auswahl nie als 'intraday' gekennzeichnet", () => {
  const dir = fixture({ asOf: TAG + "T19:55:00.000Z", asOfLocal: "15:55" });
  try {
    const r = lauf(dir, TAG + "T19:58:00Z");
    assert.equal(r.live.status, "LIVE");
    assert.equal(r.live.sessionClose, TAG + "T20:00:00.000Z");
    const D = {}; vm.runInNewContext(readFileSync(join(ROOT, "discover", "ui", "featured.js"), "utf8"), { window: { VUDiscover: D, QuantShell: { el() { return {}; } } }, Date, Math, fetch() {} });
    assert.equal(D.Featured.liveLabel(r.live, Date.parse(TAG + "T19:59:00Z")), "intraday");
    assert.equal(D.Featured.liveLabel(r.live, Date.parse(TAG + "T20:30:00Z")), "close-unconfirmed", "der Schlussslot kam nicht: unbestaetigt statt live");
    assert.equal(D.Featured.liveLabel({ status: "SESSION_CLOSED" }, 0), "close-unconfirmed");
  } finally { weg(dir); }
});

test("RF16d · LIVE braucht mindestens die Haelfte aktueller Snapshots (ab zehn Snapshots)", () => {
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    /* Zwoelf weitere Titel; der juengste Snapshot ist frisch, elf davon eine Stunde aelter. */
    const extra = [...Array(12)].map((_, i) => "X" + String(i).padStart(2, "0"));
    const basisDatei = join(dir, "discover", "data", "im-blick", "basis-US_REAL.json");
    const basis = JSON.parse(readFileSync(basisDatei, "utf8"));
    basis.stocks.push(...extra.map((n, i) => E(n, { sec: "S" + i })));
    writeFileSync(basisDatei, JSON.stringify(basis));
    const d = join(dir, "quant", "data", "market", "intraday", TAG);
    extra.forEach((n, i) => {
      writeFileSync(join(dir, "discover", "data", "stocks", "US_REAL", n + ".json"), JSON.stringify(detail(n)));
      writeFileSync(join(d, Identity.securityIdForTicker(n) + ".json"), JSON.stringify(snapshot(n, TAG, i === 0 ? TAG + "T15:20:00.000Z" : TAG + "T14:10:00.000Z", i === 0 ? "11:20" : "10:10")));
    });
    for (const n of NAMES) writeFileSync(join(d, Identity.securityIdForTicker(n) + ".json"), JSON.stringify(snapshot(n, TAG, TAG + "T14:10:00.000Z", "10:10")));
    const r = lauf(dir, TAG + "T15:35:00Z");
    assert.equal(r.live.status, "INTRADAY_STALE");
    assert.equal(r.live.dataState.reason, "FEW_FRESH");
    assert.match(r.live.reason, /Nur 1 von 16/);
  } finally { weg(dir); }
});

test("RF16e · kaputte Eingaben: Punkt null, ungueltiges --now, kaputte generatedAt, Kalenderende", () => {
  const dir = fixture({ asOf: TAG + "T15:20:00.000Z" });
  try {
    const f = join(dir, "quant", "data", "market", "intraday", TAG, Identity.securityIdForTicker("AAA") + ".json");
    const sn = JSON.parse(readFileSync(f, "utf8")); sn.points = [null, ["10:30", 106], 7]; writeFileSync(f, JSON.stringify(sn));
    const r = lauf(dir, TAG + "T15:35:00Z");
    assert.equal(r.code, 0, r.out);
    assert.equal(r.live.status, "LIVE");
    /* ungueltiges --now */
    for (const wert of ["garbage", "2026-13-45"]) {
      const x = spawnSync(process.execPath, [SCRIPT, "--now", wert, "--data-root", dir, "--out", OUTFILE(dir)], { encoding: "utf8" });
      assert.equal(x.status, 2, wert); assert.match(x.stderr, /Ungueltiges --now/);
      const y = spawnSync(process.execPath, [CHECK, "--now=" + wert], { encoding: "utf8" });
      assert.equal(y.status, 2, wert);
    }
  } finally { weg(dir); }
  /* kaputte oder zukuenftige generatedAt blockiert den Neuversuch nie */
  const plan = Plan.planAt(TAG + "T17:30:00Z", CAL);
  for (const g of ["2026-10-20T00:00:00.000Z", null, "kein Datum"]) {
    const d = Plan.decide(plan, { schemaVersion: "x", slot: { dueAt: plan.due.dueAt }, status: "NO_INTRADAY", generatedAt: g, eodAsOf: VORTAG }, { nowMs: Date.parse(TAG + "T17:30:00Z"), basisAsOf: VORTAG, schemaVersion: "x" });
    assert.equal(d.reason, "RETRY", String(g));
  }
  /* Kalenderende (2027-12-31): Feiertage sind unbekannt, die Ueberwachung stuft herab statt rot zu werden */
  const a = Plan.assess(null, CAL, { nowMs: Date.parse("2028-01-17T19:50:00Z"), eodAsOf: "2028-01-14" });
  assert.equal(a.level, "WARN");
  assert.ok(a.findings.some((x) => x.code === "CALENDAR_OUT_OF_RANGE"));
  assert.ok(!a.findings.some((x) => x.level === "FAIL"));
  assert.equal(Plan.assess(null, CAL, { nowMs: Date.parse("2027-01-18T19:50:00Z"), eodAsOf: "2027-01-15" }).level, "OK", "Gegenprobe: im Abdeckungszeitraum bleibt der Feiertag still");
});
