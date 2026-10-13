/* =========================================================================
   Im Blick NACH DEM NACHTLAUF — Tests NL1-NL8

   Die Stufe `imblick` im Marktdaten-Refresh (market-data-refresh.yml) rechnet
   "Im Blick" nach refresh + materialize + freshness-contract auf der neuen
   Abendlauf-Basis neu (build-im-blick-live.mjs --nachtlauf). Hier wird der
   Vertrag geprueft, gegen die echten Skripte in Wegwerf-Verzeichnissen:

     NL1  Nachtlauf publiziert EOD_CURRENT auf der neuen Basis; ein zweiter
          Lauf ist ein SKIP (idempotent)
     NL2  Datenversion/Handelsdatum falsch -> nichts ersetzt, Exit 1, Monitor
          haelt den Fehler fest
     NL3  Eine aeltere Basis ersetzt nie eine neuere (auch nicht mit --force)
     NL4  Race Nachtlauf <-> Cloudflare-Slots, in beiden Reihenfolgen und
          parallel: die neuere Auswahl wird nie ueberschrieben
     NL5  Workflow: needs auf alle drei Stufen, continue-on-error, gleiche
          Concurrency-Gruppe, kein roter Nachtlauf, Alarm-Verdrahtung, keine
          Anbieter
     NL6  Ueberwachung: BASIS_NOT_PUBLISHED, nur als Hinweis
     NL7  Darstellung: die Startseite zeigt nie eine Datei zu einer anderen
          Basis; EOD_CURRENT ist nie "live"
     NL8  Isolation: keine Quant-/Screener-/Supertrader-/Emerging-Pfade
     NL9  Feiertag / Tag ohne neue Sitzung: kein Fehlalarm, nichts doppelt
     NL10 Winterzeit: Schluss 21:00Z, Nachtlauf 22:35Z
     NL11 Bremszeit nach einem Fehlversuch bleibt im Nachtlauf ein Fehler
     NL12 Alarm-Zuordnung: Jobfehler, Zeitablauf und Skriptfehler sind rot, alles andere nicht
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "discover", "build-im-blick-live.mjs");
const Identity = require(join(ROOT, "core", "identity.js"));
const Plan = require(join(ROOT, "discover", "engines", "refresh-plan.js"));
const CAL = JSON.parse(readFileSync(join(ROOT, "quant", "config", "market-calendar.json"), "utf8"));

/* ------------------------------------------------------------ Fixtures */
/* Mo 12.10. / Di 13.10. / Mi 14.10.2026, EDT: Boersenbeginn 13:30Z, Schluss 20:00Z. */
const MO = "2026-10-12", DI = "2026-10-13", MI = "2026-10-14", FR = "2026-10-09";
const NAMES = ["AAA", "BBB", "CCC", "DDD"];
const SEKTOREN = ["Technology", "Energy", "Health Care", "Financials"];
const E = (s) => ({ s, sec: SEKTOREN[NAMES.indexOf(s)], tier: null, lp: 80, rs: 85, acc: 0.02, vol: 0.02, trend: true, age: 3, hi: 110, close: 100, eod: 50 });
const snapshot = (s, session, asOf) => ({ schemaVersion: "intraday-snapshot-1.0.0", symbol: s, securityId: Identity.securityIdForTicker(s), sessionDate: session,
  asOf, asOfLocal: "15:55", previousClose: 100, points: [["09:30", 100.5], ["10:30", 106], ["11:30", 112]] });
const detail = (s) => ({ symbol: s, companyName: s + " Inc", sector: "Technology", signals: {}, metrics: { leadershipPercentile: 80 }, metricStatus: {},
  badges: [], plain: { story: "Story " + s }, priceSeries: { status: "CALCULATED" }, asOf: FR });

function neu() {
  const dir = mkdtempSync(join(tmpdir(), "vu-imblick-nl-"));
  mkdirSync(join(dir, "discover", "data", "im-blick"), { recursive: true });
  mkdirSync(join(dir, "discover", "data", "stocks", "US_REAL"), { recursive: true });
  mkdirSync(join(dir, "out"), { recursive: true });
  for (const n of NAMES) writeFileSync(join(dir, "discover", "data", "stocks", "US_REAL", n + ".json"), JSON.stringify(detail(n)));
  return dir;
}
/* Basis (Abendlauf) und meta.json tragen dieselbe Datenversion - oder gezielt nicht. */
function setzeBasis(dir, asOf, { meta = asOf, stocks = true, roh = null } = {}) {
  const datei = join(dir, "discover", "data", "im-blick", "basis-US_REAL.json");
  writeFileSync(datei, JSON.stringify(roh || { asOf, stocks: stocks ? NAMES.map(E) : [] }));
  writeFileSync(join(dir, "discover", "data", "meta.json"), JSON.stringify({ universes: [{ universeId: "US_REAL", asOf: meta, generatedAt: asOf + "T22:30:00.000Z" }] }));
}
function setzeSnapshots(dir, session, asOf) {
  const d = join(dir, "quant", "data", "market", "intraday", session);
  mkdirSync(d, { recursive: true });
  for (const n of NAMES) writeFileSync(join(d, Identity.securityIdForTicker(n) + ".json"), JSON.stringify(snapshot(n, session, asOf)));
}
const OUTFILE = (dir) => join(dir, "out", "im-blick-US_REAL.json");
const MONFILE = (dir) => join(dir, "out", "monitor-US_REAL.json");
const lies = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const roh = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const ENV = Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: "", GITHUB_EVENT_NAME: "", GITHUB_RUN_ID: "" });
function lauf(dir, now, { nacht = false, quelle = nacht ? "nachtlauf" : "cloudflare-waker", extra = [] } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...(nacht ? ["--nachtlauf"] : []), ...extra, "--now", now, "--data-root", dir, "--out", OUTFILE(dir), "--source", quelle],
    { encoding: "utf8", env: ENV });
  return { code: r.status, text: r.stdout + r.stderr, live: lies(OUTFILE(dir)), mon: lies(MONFILE(dir)) };
}
const weg = (dir) => rmSync(dir, { recursive: true, force: true });

/* Ausgangslage vieler Tests: Mo 12.10., der Schlussslot (20:20Z) lief mit der
   Basis vom Freitag und veroeffentlichte SESSION_CLOSED - der Abendlauf steht aus. */
function abendDesMontags() {
  const dir = neu();
  setzeBasis(dir, FR);
  setzeSnapshots(dir, MO, MO + "T19:55:00.000Z");
  const r = lauf(dir, MO + "T20:36:55Z");
  assert.equal(r.live.status, "SESSION_CLOSED");
  assert.equal(r.live.slot.id, MO + "@C");
  assert.equal(r.live.eodAsOf, FR);
  return dir;
}

/* ----------------------------------------------------------------- NL1 */
test("NL1 · Nachtlauf: neue Basis -> EOD_CURRENT mit Datenversion und Handelsdatum; ein zweiter Lauf aendert nichts", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);                                         /* der Nachtlauf hat Montag geliefert */
    const a = lauf(dir, DI + "T04:30:00Z", { nacht: true });
    assert.equal(a.code, 0, a.text);
    assert.equal(a.live.status, "EOD_CURRENT");
    assert.equal(a.live.eodAsOf, MO, "Datenversion = Basis vom Montag");
    assert.equal(a.live.sessionDate, MO, "Handelsdatum = die abgeschlossene Sitzung");
    assert.equal(a.live.generatedAt, DI + "T04:30:00.000Z", "Veroeffentlichungszeit");
    assert.deepEqual(a.live.stocks, []);
    assert.equal(a.mon.lastRun.source, "nachtlauf");
    assert.equal(a.mon.lastRun.decision, "BASIS_CHANGED");
    assert.equal(a.mon.lastRun.result, "PUBLISHED");
    assert.equal(a.mon.published.status, "EOD_CURRENT");
    assert.equal(a.mon.error, null);
    /* Idempotent: dieselbe Frage nochmals -> nichts geschrieben. */
    const vorher = [roh(OUTFILE(dir)), roh(MONFILE(dir))];
    const b = lauf(dir, DI + "T04:31:00Z", { nacht: true });
    assert.equal(b.code, 0);
    assert.deepEqual([roh(OUTFILE(dir)), roh(MONFILE(dir))], vorher, "keine Datei beruehrt");
    assert.match(b.text, /UP_TO_DATE/);
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- NL2 */
test("NL2 · Datenversion oder Handelsdatum falsch: nichts wird ersetzt, Exit 1, der Monitor haelt den Fehler fest", () => {
  /* a) Basis und meta.json nennen verschiedene Handelsdaten */
  let dir = abendDesMontags();
  try {
    setzeBasis(dir, MO, { meta: FR });
    const vorher = roh(OUTFILE(dir));
    const r = lauf(dir, DI + "T04:30:00Z", { nacht: true });
    assert.equal(r.code, 1, r.text);
    assert.equal(roh(OUTFILE(dir)), vorher, "die letzte gueltige Auswahl bleibt unberuehrt");
    assert.equal(r.mon.error.code, "NIGHT_CHECK_FAILED");
    assert.match(r.mon.error.message, /Datenversion/);
    assert.equal(r.mon.lastRun.result, "NIGHT_NOT_CONCLUSIVE");
    assert.equal(r.mon.published.status, "SESSION_CLOSED", "veroeffentlicht bleibt der alte Stand");
    assert.match(r.text, /::error title=Im Blick NIGHT_CHECK_FAILED::/);
  } finally { weg(dir); }
  /* b) die Basis ist nicht die letzte abgeschlossene Sitzung (Freitag statt Montag), nichts veroeffentlicht */
  dir = neu();
  try {
    setzeBasis(dir, FR);
    const r = lauf(dir, DI + "T04:30:00Z", { nacht: true });
    assert.equal(r.code, 1, r.text);
    assert.equal(r.live, null, "ohne gueltige Grundlage entsteht keine Auswahl");
    assert.match(r.mon.error.message, /Handelsdatum/);
  } finally { weg(dir); }
  /* c) Basis ohne Titel, ohne Datei, mit kaputtem Datum */
  for (const [name, f] of [["ohne Titel", (d) => setzeBasis(d, MO, { stocks: false })],
                           ["ohne Basis-Datei", () => {}],
                           ["Datum kaputt", (d) => setzeBasis(d, MO, { roh: { asOf: "morgen", stocks: NAMES.map(E) } })]]) {
    dir = neu();
    try {
      f(dir);
      const r = lauf(dir, DI + "T04:30:00Z", { nacht: true });
      assert.equal(r.code, 1, name + ": " + r.text);
      assert.equal(r.live, null, name);
      assert.equal(r.mon.error.code, "NIGHT_CHECK_FAILED", name);
    } finally { weg(dir); }
  }
  /* d) derselbe Fehler ausserhalb des Nachtlaufs ist kein Alarm-Exit (nur der Nachtlauf-Modus ist streng) */
  dir = neu();
  try {
    setzeBasis(dir, FR);
    const r = lauf(dir, DI + "T04:30:00Z");
    assert.equal(r.code, 0, "Waker-Lauf bleibt exit 0: " + r.text);
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- NL3 */
test("NL3 · eine aeltere Basis ersetzt nie eine neuere - weder im Normalfall noch mit --force", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);
    lauf(dir, DI + "T04:30:00Z", { nacht: true });
    /* Dienstagabend: Nachtlauf liefert Dienstag. */
    setzeSnapshots(dir, DI, DI + "T19:55:00.000Z");
    setzeBasis(dir, DI);
    const n = lauf(dir, MI + "T04:30:00Z", { nacht: true });
    assert.equal(n.live.eodAsOf, DI);
    const stand = roh(OUTFILE(dir));
    /* Ein verspaeteter Rueckfall mit der alten Basis (Montag): SKIP, keine Datei beruehrt. */
    setzeBasis(dir, MO);
    const r = lauf(dir, MI + "T05:10:00Z", { nacht: true });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /BASIS_OLDER/);
    assert.equal(roh(OUTFILE(dir)), stand);
    /* Auch erzwungen: mayReplace verweigert (OLDER_BASIS), der Monitor sagt es. */
    const f = lauf(dir, MI + "T05:20:00Z", { extra: ["--force"] });
    assert.equal(f.code, 0, f.text);
    assert.equal(roh(OUTFILE(dir)), stand, "erzwungen ersetzt trotzdem nichts Neueres");
    assert.equal(f.mon.lastRun.result, "OLDER_BASIS");
    /* Die Regel selbst. */
    assert.equal(Plan.mayReplace({ eodAsOf: DI, sessionDate: DI, status: "EOD_CURRENT" }, { eodAsOf: MO, sessionDate: DI, status: "SESSION_CLOSED" }).reason, "OLDER_BASIS");
    assert.equal(Plan.mayReplace({ eodAsOf: MO, sessionDate: MO, status: "SESSION_CLOSED" }, { eodAsOf: DI, sessionDate: DI, status: "EOD_CURRENT" }).ok, true);
    assert.deepEqual(Plan.decide({ due: { dueAt: "x", sessionDate: DI } }, { slot: { dueAt: "x" }, eodAsOf: DI, status: "EOD_CURRENT", schemaVersion: "s" }, { basisAsOf: MO, schemaVersion: "s", nowMs: 0 }),
      { action: "SKIP", reason: "BASIS_OLDER" });
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- NL4 */
test("NL4a · Race: der Cloudflare-Slot war zuerst - ein spaeter Nachtlauf (gleiche Basis) ueberschreibt die Intraday-Auswahl nicht", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);
    /* Der Wecker kommt um 15:05Z (I1, Dienstag) vor dem verspaeteten Nachtlauf. */
    setzeSnapshots(dir, DI, DI + "T15:00:00.000Z");
    const w = lauf(dir, DI + "T15:05:00Z");
    assert.equal(w.live.status, "LIVE");
    assert.equal(w.live.slot.id, DI + "@I1");
    const stand = roh(OUTFILE(dir));
    const n = lauf(dir, DI + "T15:40:00Z", { nacht: true });
    assert.equal(n.code, 0, n.text);
    assert.match(n.text, /UP_TO_DATE/);
    assert.equal(roh(OUTFILE(dir)), stand, "LIVE bleibt");
  } finally { weg(dir); }
});

test("NL4b · Race: der Nachtlauf war zuerst - der Wecker ersetzt EOD_CURRENT beim naechsten Slot durch die neuere Intraday-Auswahl", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);
    const n = lauf(dir, DI + "T04:30:00Z", { nacht: true });
    assert.equal(n.live.status, "EOD_CURRENT");
    setzeSnapshots(dir, DI, DI + "T15:00:00.000Z");
    const w = lauf(dir, DI + "T15:05:00Z");
    assert.equal(w.live.status, "LIVE");
    assert.equal(w.live.slot.id, DI + "@I1");
    assert.equal(w.mon.lastRun.decision, "SLOT_DUE");
  } finally { weg(dir); }
});

test("NL4c · Race: ein sehr spaeter Nachtlauf, solange I1 noch fehlt, rechnet den faelligen Slot selbst; der Wecker danach ist ein SKIP", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);
    setzeSnapshots(dir, DI, DI + "T15:00:00.000Z");
    const n = lauf(dir, DI + "T15:02:00Z", { nacht: true });
    assert.equal(n.code, 0, n.text);
    assert.equal(n.live.status, "LIVE", "es ist keine alte Auswahl, sondern der faellige Slot");
    assert.equal(n.live.slot.id, DI + "@I1");
    const stand = roh(OUTFILE(dir));
    const w = lauf(dir, DI + "T15:05:00Z");
    assert.match(w.text, /UP_TO_DATE/);
    assert.equal(roh(OUTFILE(dir)), stand);
  } finally { weg(dir); }
});

test("NL4d · Race: der regulaere Nachtlauf nach dem Schluss ersetzt SESSION_CLOSED durch die bestaetigte Auswahl; ein Wecker danach aendert nichts", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);
    lauf(dir, DI + "T04:30:00Z", { nacht: true });
    setzeSnapshots(dir, DI, DI + "T19:55:00.000Z");
    const c = lauf(dir, DI + "T20:36:00Z");
    assert.equal(c.live.status, "SESSION_CLOSED");
    assert.equal(c.live.eodAsOf, MO);
    setzeBasis(dir, DI);
    const n = lauf(dir, DI + "T22:45:00Z", { nacht: true });
    assert.equal(n.code, 0, n.text);
    assert.equal(n.live.status, "EOD_CURRENT");
    assert.equal(n.live.eodAsOf, DI);
    assert.equal(n.live.sessionDate, DI);
    const stand = roh(OUTFILE(dir));
    const w = lauf(dir, DI + "T23:00:00Z");
    assert.match(w.text, /UP_TO_DATE|nichts zu tun/);
    assert.equal(roh(OUTFILE(dir)), stand);
  } finally { weg(dir); }
});

test("NL4e · Race: Nachtlauf und Wecker gleichzeitig - nie eine halbe oder widerspruechliche Datei, nie ein Rueckschritt", async () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO);
    setzeSnapshots(dir, DI, DI + "T15:00:00.000Z");
    const start = (nacht, quelle) => new Promise((res) => {
      const c = spawn(process.execPath, [SCRIPT, ...(nacht ? ["--nachtlauf"] : []), "--now", DI + "T15:05:00Z", "--data-root", dir, "--out", OUTFILE(dir), "--source", quelle], { env: ENV });
      c.on("close", (code) => res(code));
    });
    const codes = await Promise.all([start(true, "nachtlauf"), start(false, "cloudflare-waker"), start(true, "nachtlauf"), start(false, "cloudflare-waker")]);
    assert.ok(codes.every((c) => c === 0), "Exit-Codes " + codes);
    const live = lies(OUTFILE(dir)), mon = lies(MONFILE(dir));         /* JSON.parse wirft bei einer halben Datei */
    assert.equal(live.status, "LIVE");
    assert.equal(live.slot.id, DI + "@I1");
    assert.equal(live.eodAsOf, MO);
    assert.equal(mon.published.slot.id, live.slot.id);
  } finally { weg(dir); }
});

/* ----------------------------------------------------------------- NL5 */
test("NL5 · Workflow: Stufe nach allen Pruefungen, kein roter Nachtlauf, gleiche Concurrency-Gruppe, Alarm, keine Anbieter", () => {
  const wf = readFileSync(join(ROOT, ".github", "workflows", "market-data-refresh.yml"), "utf8");
  const live = readFileSync(join(ROOT, ".github", "workflows", "discover-im-blick-live.yml"), "utf8");
  const teil = (text, kopf, bis) => { const i = text.indexOf(kopf); assert.ok(i >= 0, kopf); const j = bis ? text.indexOf(bis, i + kopf.length) : text.length; return text.slice(i, j < 0 ? text.length : j); };
  const job = teil(wf, "\n  imblick:\n", "\n  # ===");
  /* nach refresh + materialize + freshness-contract, alle drei muessen success sein */
  assert.match(job, /needs: \[refresh, materialize, freshness-contract\]/);
  for (const n of ["refresh", "materialize", "freshness-contract"]) assert.match(job, new RegExp("needs\\." + n + "\\.result == 'success'"), n);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /github\.event_name != 'push'/);
  /* KEINE Job-Concurrency: ein wartender Job wuerde verdraengt (cancelled) und der Nachtlauf damit nicht "success" */
  assert.doesNotMatch(job, /\n    concurrency:/);
  assert.match(job, /BEWUSST KEINE Job-Concurrency/);
  /* ADR-005 */
  assert.match(job, /ref: \$\{\{ github\.ref \}\}/);
  assert.match(job, /scripts\/ci\/push-with-retry\.sh/);
  assert.match(job, /set -euo pipefail/);
  assert.doesNotMatch(job, /\$\{\{\s*inputs\./);
  /* Jeder Schritt (auch Checkout und Node) darf den Nachtlauf nicht rot machen (pages-release verlangt success)
     und hat ein eigenes Zeitlimit, damit ein Zeitablauf ein Schrittfehler ist und kein roter Job */
  const schritte = job.split("\n      - ").slice(1);
  assert.equal(schritte.length, 5);
  for (const sch of schritte) {
    assert.match(sch, /continue-on-error: true/, sch.split("\n")[0]);
    assert.match(sch, /timeout-minutes: \d+/, sch.split("\n")[0]);
  }
  assert.match(job, /timeout-minutes: 25/);
  assert.match(job, /--nachtlauf --source nachtlauf/);
  /* nur der Alarm haengt an dieser Stufe */
  const andere = wf.replace(job, "");
  const mitNeeds = andere.split("\n").filter((z) => /needs:/.test(z) && /imblick/.test(z));
  assert.equal(mitNeeds.length, 1, "nur der Alarm-Job wartet auf imblick");
  assert.match(teil(wf, "\n  alarm:\n"), /needs: \[refresh, materialize, freshness-contract, imblick\]/);
  assert.match(wf, /RESULT_IMBLICK: \$\{\{ needs\.imblick\.result == 'failure' && 'failure' \|\| needs\.imblick\.outputs\.ergebnis == 'failure'/);
  assert.match(wf, /ALARM_DETAIL_FILE/);
  /* keine Anbieteranfrage in der Stufe und im Baustein */
  assert.doesNotMatch(job, /TIINGO|MARKETSTACK|curl |fetch\(/i);
  assert.doesNotMatch(readFileSync(SCRIPT, "utf8"), /process\.env\.(TIINGO|MARKETSTACK)|fetch\(|https?:\/\//);
  /* Berechtigung: nur contents: write fuer die Stufe */
  assert.match(teil(job, "permissions:", "# BEWUSST"), /contents: write\s*$/);
});

/* ----------------------------------------------------------------- NL6 */
test("NL6 · Ueberwachung: neue Basis nicht uebernommen -> Hinweis BASIS_NOT_PUBLISHED, nie FAIL; sonst still", () => {
  const monitor = (eodAsOf, status = "SESSION_CLOSED") => ({ published: { status, slot: { id: MO + "@C", dueAt: MO + "T20:20:00.000Z" }, eodAsOf, sessionDate: MO, generatedAt: MO + "T20:36:00.000Z" }, lastRun: { slotId: MO + "@C" }, error: null });
  const assess = (m, now, eodAsOf, eodGeneratedAt) => Plan.assess(m, CAL, { nowMs: Date.parse(now), eodAsOf, eodGeneratedAt });
  const gen = DI + "T04:14:42.397Z";
  /* seit 2 h + liegt die neue Basis, veroeffentlicht ist die alte */
  const a = assess(monitor(FR), DI + "T06:30:00Z", MO, gen);
  assert.equal(a.level, "WARN");
  assert.deepEqual(a.findings.map((f) => f.code), ["BASIS_NOT_PUBLISHED"]);
  assert.match(a.findings[0].text, /imblick/);
  /* frisch: die Stufe hat noch Zeit */
  assert.equal(assess(monitor(FR), DI + "T04:30:00Z", MO, gen).level, "OK");
  /* uebernommen */
  assert.equal(assess(monitor(MO, "EOD_CURRENT"), DI + "T06:30:00Z", MO, gen).level, "OK");
  /* ohne Angabe zur Erzeugung: kein Hinweis (kein Raten) */
  assert.equal(assess(monitor(FR), DI + "T06:30:00Z", MO, undefined).level, "OK");
  /* waehrend der Boerse zaehlt der Slot, nicht dieser Hinweis */
  const o = assess(monitor(FR), DI + "T14:00:00Z", MO, gen);
  assert.ok(!o.findings.some((f) => f.code === "BASIS_NOT_PUBLISHED"));
  /* ueber zwei Jahre: nie FAIL durch diesen Befund */
  for (let t = Date.parse("2026-10-13T00:00:00Z"); t < Date.parse("2027-12-31T00:00:00Z"); t += 3 * 3600000 + 17 * 60000) {
    const r = assess(monitor(FR), new Date(t).toISOString(), MO, gen);
    assert.ok(!r.findings.some((f) => f.code === "BASIS_NOT_PUBLISHED" && f.level === "FAIL"));
  }
});

/* ----------------------------------------------------------------- NL7 */
test("NL7 · Darstellung: EOD_CURRENT und eine Datei zu anderer Basis werden nie als Live-Auswahl gezeigt", () => {
  const D = {};
  vm.runInNewContext(readFileSync(join(ROOT, "discover", "ui", "featured.js"), "utf8"), { window: { VUDiscover: D, QuantShell: { el() { return {}; } } }, Date, fetch: () => Promise.reject(new Error("x")), Math });
  const U = D.Featured.liveUsable;
  const jetzt = Date.parse(DI + "T10:00:00Z");
  const drei = [{}, {}, {}];
  const datei = (status, eodAsOf) => ({ status, eodAsOf, stocks: drei, generatedAt: MO + "T20:36:55.000Z", validUntil: DI + "T16:30:00.000Z" });
  /* Nacht vorbei, Startseite steht auf der Basis vom Montag: die Datei vom Montagabend (Basis Freitag) wird ignoriert ... */
  assert.equal(U(datei("SESSION_CLOSED", FR), MO, jetzt), false, "alte Basis -> bestaetigte Schlusskurs-Auswahl bleibt");
  /* ... und die Datei nach dem Nachtlauf (EOD_CURRENT) ist nie eine Live-Karte. */
  assert.equal(U(datei("EOD_CURRENT", MO), MO, jetzt), false);
  /* Intraday-Datei zur selben Basis: ja - und nach dem Schluss nie "intraday". */
  assert.equal(U(datei("LIVE", MO), MO, jetzt), true);
  assert.equal(D.Featured.liveLabel({ status: "LIVE", sessionClose: DI + "T20:00:00.000Z" }, Date.parse(DI + "T20:30:00Z")), "close-unconfirmed");
  assert.equal(D.Featured.liveLabel({ status: "LIVE", sessionClose: DI + "T20:00:00.000Z" }, Date.parse(DI + "T16:00:00Z")), "intraday");
});

/* ----------------------------------------------------------------- NL8 */
test("NL8 · Isolation: kein Fachmodell, keine Produkte, keine geschuetzten Pfade im Baustein und in der Stufe", () => {
  const baustein = readFileSync(SCRIPT, "utf8");
  /* Scoring unveraendert: derselbe Aufruf wie zuvor, kein neuer Gewichtungs-Code */
  assert.match(baustein, /ImBlick\.scoreLive\(x\.b, x\.live, cfg\)/);
  assert.match(baustein, /ImBlick\.select\(bewertet\.filter/);
  for (const verboten of [/emerging/i, /supertrader/i, /screener/i, /quant\/engines/, /scripts\/market/, /scripts\/technical/])
    assert.doesNotMatch(baustein.replace(/\/\*[\s\S]*?\*\//g, ""), verboten, String(verboten));
  const wf = readFileSync(join(ROOT, ".github", "workflows", "market-data-refresh.yml"), "utf8");
  const i = wf.indexOf("\n  imblick:\n");
  const job = wf.slice(i, wf.indexOf("\n  # ===", i + 10));
  assert.doesNotMatch(job, /quant\/data|supertrader|screener|emerging/i, "die Stufe schreibt nur discover/live");
  assert.match(job, /git add -- discover\/live\/im-blick-US_REAL\.json discover\/live\/monitor-US_REAL\.json/);
  assert.doesNotMatch(job, /git add discover\/live\s/, "keine Sammelaufnahme (verwaiste tmp-Dateien)");
});

/* ----------------------------------------------------------------- NL9 */
test("NL9 · Feiertag (Thanksgiving 26.11.2026): der Nachtlauf ohne neue Sitzung ist kein Fehler und ein zweiter aendert nichts", () => {
  const dir = neu();
  try {
    setzeBasis(dir, "2026-11-25");
    const a = lauf(dir, "2026-11-26T04:30:00Z", { nacht: true });
    assert.equal(a.code, 0, a.text);
    assert.equal(a.live.status, "EOD_CURRENT");
    assert.equal(a.live.eodAsOf, "2026-11-25");
    const stand = [roh(OUTFILE(dir)), roh(MONFILE(dir))];
    const b = lauf(dir, "2026-11-26T22:30:00Z", { nacht: true });        /* Feiertag: der Nachtlauf laeuft, die Basis bleibt */
    assert.equal(b.code, 0, b.text);
    assert.match(b.text, /UP_TO_DATE/);
    assert.deepEqual([roh(OUTFILE(dir)), roh(MONFILE(dir))], stand);
  } finally { weg(dir); }
  /* Wochenende: Basis vom Freitag, Nachtlauf am Samstag und Sonntag - kein Fehler, nichts doppelt */
  const we = neu();
  try {
    setzeBasis(we, FR);
    const sa = lauf(we, "2026-10-10T22:30:00Z", { nacht: true });
    assert.equal(sa.code, 0, sa.text);
    assert.equal(sa.live.eodAsOf, FR);
    const stand = roh(OUTFILE(we));
    const so = lauf(we, "2026-10-11T22:30:00Z", { nacht: true });
    assert.equal(so.code, 0, so.text);
    assert.equal(roh(OUTFILE(we)), stand);
  } finally { weg(we); }
});

/* ---------------------------------------------------------------- NL10 */
test("NL10 · Winterzeit (1.12.2026, Schluss 21:00Z): Schlussslot 21:20Z, Nachtlauf 22:35Z ersetzt ihn durch die bestaetigte Auswahl", () => {
  const dir = neu();
  try {
    setzeBasis(dir, "2026-11-30");
    setzeSnapshots(dir, "2026-12-01", "2026-12-01T20:55:00.000Z");
    const c = lauf(dir, "2026-12-01T21:36:00Z");
    assert.equal(c.live.status, "SESSION_CLOSED");
    assert.equal(c.live.slot.id, "2026-12-01@C");
    assert.equal(c.live.slot.dueAt, "2026-12-01T21:20:00.000Z");
    setzeBasis(dir, "2026-12-01");
    const n = lauf(dir, "2026-12-01T22:35:00Z", { nacht: true });
    assert.equal(n.code, 0, n.text);
    assert.equal(n.live.status, "EOD_CURRENT");
    assert.equal(n.live.eodAsOf, "2026-12-01");
    assert.equal(n.live.sessionDate, "2026-12-01");
  } finally { weg(dir); }
});

/* ---------------------------------------------------------------- NL11 */
test("NL11 · nach einem Fehlversuch bleibt auch ein Wiederholungslauf in der Bremszeit ein Fehler (der Alarm wird nicht gruen), danach heilt er", () => {
  const dir = abendDesMontags();
  try {
    setzeBasis(dir, MO, { meta: FR });
    assert.equal(lauf(dir, DI + "T04:30:00Z", { nacht: true }).code, 1);
    const wieder = lauf(dir, DI + "T04:40:00Z", { nacht: true });
    assert.equal(wieder.code, 1, wieder.text);
    assert.match(wieder.text, /RETRY_LATER/);
    setzeBasis(dir, MO);                                           /* behoben */
    const heil = lauf(dir, DI + "T04:55:00Z", { nacht: true });
    assert.equal(heil.code, 0, heil.text);
    assert.equal(heil.live.status, "EOD_CURRENT");
    assert.equal(heil.mon.error, null);
  } finally { weg(dir); }
  /* Nachtlauf in laufender Sitzung mit alten Kursen: der Text nennt die Kursdaten, nicht den Nachtlauf */
  const d2 = abendDesMontags();
  try {
    setzeBasis(d2, MO);
    setzeSnapshots(d2, DI, DI + "T13:35:00.000Z");
    const r = lauf(d2, DI + "T16:20:00Z", { nacht: true });
    assert.equal(r.code, 1, r.text);
    assert.match(r.mon.error.message, /Kursdaten pruefen, nicht den Nachtlauf/);
  } finally { weg(d2); }
});

/* ---------------------------------------------------------------- NL12 */
test("NL12 · Alarm-Zuordnung: RESULT_IMBLICK aus dem echten Workflow-Ausdruck; rot bei Jobfehler, Zeitablauf und Skriptfehler, sonst nicht", async () => {
  const wf = readFileSync(join(ROOT, ".github", "workflows", "market-data-refresh.yml"), "utf8");
  const ausdruck = wf.match(/RESULT_IMBLICK: \$\{\{ (.+) \}\}/)[1];
  const bewerte = (result, ergebnis) => new Function("needs", "return (" + ausdruck + ");")({ imblick: { result, outputs: { ergebnis } } });
  const { auswertung } = { auswertung: null };
  const { auswerten } = await import(join(ROOT, "scripts", "ci", "pipeline-alarm.mjs"));
  const zustand = (r) => auswerten({ RESULT_REFRESH: "success", RESULT_MATERIALIZE: "success", RESULT_FRESHNESS: "success", RESULT_IMBLICK: r }).zustand;
  const faelle = [
    ["success", "success", "success", "gruen"],
    ["success", "failure", "failure", "rot"],      /* Skript/Push gescheitert (continue-on-error im Schritt) */
    ["failure", "success", "failure", "rot"],      /* Job selbst: Zeitablauf, Runner, Fehler in nicht abgesicherten Teilen */
    ["failure", "", "failure", "rot"],
    ["skipped", "", "skipped", "gruen"],           /* Vorstufe rot: die anderen Jobs zeigen es */
    ["cancelled", "", "skipped", "gruen"]
  ];
  for (const [result, ergebnis, erwartet, rot] of faelle) {
    assert.equal(bewerte(result, ergebnis), erwartet, result + "/" + ergebnis);
    assert.equal(zustand(erwartet), rot, result + "/" + ergebnis);
  }
  /* Ein roter Job oeffnet nicht das Gleiche wie ein gruener Lauf: der Detailtext reist mit */
  assert.match(wf, /ALARM_DETAIL_FILE="\$RUNNER_TEMP\/imblick-detail\.txt"/);
});
