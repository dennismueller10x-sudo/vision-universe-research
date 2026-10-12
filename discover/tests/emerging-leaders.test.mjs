/* =========================================================================
   DISCOVER – EMERGING LEADERS (scripts/discover/build-emerging-leaders.mjs, ui/leaders.js)

   DEL1  Vertrag: Stichtag, Evidenzstatus samt Klartext, Europa ausdruecklich
         nicht abgedeckt, kein Intraday, keine Wahrscheinlichkeiten
   DEL2  Keine Kursniveaus im Artefakt (Weitergabe-Regel)
   DEL3  Reproduzierbar: zwei Laeufe auf denselben Eingaben sind gleich
         (ausser generatedAt) - die Signalhistorie braucht kein Gedaechtnis
   DEL4  Zustaende und Signalhistorie sind in sich stimmig; neue Signale sind
         nur Aufstiege
   DEL5  Oberflaeche nennt den Evidenzstatus und verspricht keine Prognose
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "el-discover-"));
function run(name, extra = []) {
  const out = join(dir, name);
  execFileSync(process.execPath, [join(ROOT, "scripts/discover/build-emerging-leaders.mjs"), "--fixture", "--out", out, "--study", join(dir, "fehlt.json"), ...extra], { stdio: "pipe" });
  return JSON.parse(readFileSync(out, "utf8"));
}
const A = run("a.json"), B = run("b.json");

test("DEL1 · Vertrag", () => {
  assert.equal(A.schemaVersion, "discover-emerging-leaders-1.0.0");
  assert.match(A.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(A.evidence.evidenceStatus, "EXPERIMENTAL");
  assert.equal(A.evidence.reason, "STUDY_NOT_RUN");
  assert.match(A.evidence.label, /Experimentell/);
  assert.equal(A.europe.status, "NOT_COVERED");
  assert.equal(A.intraday.available, false);
  assert.equal(A.noProbabilities, true);
  assert.equal(A.count, A.stocks.length);
});

test("DEL2 · keine Kursniveaus", () => {
  const text = JSON.stringify(A);
  assert.ok(!/"(close|open|high|low|price|pivot|sma\d+|high252|low252)"\s*:/.test(text), "Kursniveau im Artefakt");
});

test("DEL3 · reproduzierbar ohne Verlaufsdatei", () => {
  const strip = (x) => ({ ...x, generatedAt: null });
  assert.deepEqual(strip(A), strip(B));
});

test("DEL4 · Zustaende und Historie stimmig", () => {
  const states = A.states.order;
  assert.equal(A.history.dates.length, A.history.sessions);
  assert.equal(A.history.dates.at(-1), A.asOf);
  for (const x of A.stocks) {
    assert.ok(states.includes(x.state));
    assert.ok(x.score >= 0 && x.score <= 100);
    assert.ok(!x.since || A.history.dates.includes(x.since));
    if (x.previous) assert.notEqual(x.previous, x.state);
  }
  for (let i = 1; i < A.stocks.length; i++) assert.ok(A.stocks[i - 1].score >= A.stocks[i].score);
  /* Neue Signale sind nur Aufstiege, nie Abstiege */
  for (const t of A.history.transitions) { assert.ok(states.indexOf(t.to) > states.indexOf(t.from), JSON.stringify(t)); assert.ok(A.history.dates.includes(t.date)); }
  for (const x of A.stocks) assert.ok(x.stability.sessionsInState >= 1 && x.stability.sessionsInState <= x.stability.sessionsObserved);
  const sum = Object.values(A.states.counts).reduce((a, b) => a + b, 0);
  assert.equal(sum, A.universe.eligibleToday);
});

test("DEL5 · Oberflaeche nennt den Evidenzstatus, keine Prognose", () => {
  const ui = readFileSync(join(ROOT, "discover/ui/leaders.js"), "utf8");
  assert.match(ui, /evidenceBox\(data\)/);
  assert.match(ui, /Experimentell/);
  assert.match(ui, /keine Wahrscheinlichkeit|Keine Wahrscheinlichkeit/);
  assert.ok(!/Kaufen|Kaufsignal|Kursziel:|Trefferwahrscheinlichkeit/.test(ui));
});
