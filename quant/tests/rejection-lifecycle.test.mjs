/* =========================================================================
   DER STILLSTAND VOM 16. BIS 18.09.2026

   Der Abendlauf holte eine einzige neue Bar je Titel, die Qualitaets-
   pruefung verlangte zwei, und 6.831 von 6.876 Titeln wurden mit
   `too_few_bars` abgelehnt - jeder davon sieben Tage gesperrt. Am
   naechsten Tag wurden 45 Titel geholt und 6.831 stillschweigend
   uebersprungen; die Tageskurse standen auf dem 15.09., waehrend der 16.
   und der 17. gehandelt wurden.

   Diese Tests halten die drei Lehren daraus fest:

     1. Eine Ablehnung, die aus dem Abfragefenster stammt, darf keinen
        Titel sperren.
     2. Eine einzelne Messung macht kein Instrument dauerhaft ungeeignet.
     3. Kein Titel bleibt fuer immer gesperrt - auch die lange Frist
        laeuft ab.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const R = require(join(root, "quant", "engines", "rejection-lifecycle.js"));

const T = (iso) => Date.parse(iso);

test("RL-1 · der Vorfall selbst: too_few_bars aus einem inkrementellen Abruf sperrt nicht", () => {
  const eintrag = { at: "2026-09-16T22:41:11.004Z", codes: "too_few_bars", window: "incremental" };
  const k = R.klassifiziere(eintrag, { now: T("2026-09-17T09:00:00Z") });
  assert.equal(k.class, "TEMPORARY_REJECT");
  assert.equal(k.retryDue, true, "der naechste Lauf muss diesen Titel wieder fragen");
  assert.match(k.reason, /Fensterartefakt/);
});

test("RL-2 · derselbe Code bei einem Vollabruf ist eine Aussage ueber den Titel", () => {
  const eintrag = { at: "2026-09-16T22:41:11.004Z", codes: "too_few_bars", window: "full" };
  const k = R.klassifiziere(eintrag, { now: T("2026-09-17T09:00:00Z") });
  assert.equal(k.retryDue, false, "bei vollem Fenster ist wenig Material ein Befund");
});

test("RL-3 · eine einzelne strukturelle Messung sperrt noch nicht dauerhaft", () => {
  const einmal = { at: "2026-09-17T22:00:00Z", codes: "insufficient_history", confirmations: 1 };
  assert.equal(R.klassifiziere(einmal, { now: T("2026-09-18T22:30:00Z") }).class, "TEMPORARY_REJECT");
  const zweimal = Object.assign({}, einmal, { confirmations: 2 });
  assert.equal(R.klassifiziere(zweimal, { now: T("2026-09-18T22:30:00Z") }).class, "PERMANENT_REJECT");
});

test("RL-4 · auch PERMANENT ist nicht fuer immer: nach dreissig Tagen wird neu gefragt", () => {
  const e = { at: "2026-08-01T00:00:00Z", codes: "unknown_security", confirmations: 4 };
  const frisch = R.klassifiziere(e, { now: T("2026-08-20T00:00:00Z") });
  assert.equal(frisch.class, "PERMANENT_REJECT");
  assert.equal(frisch.retryDue, false);
  const spaeter = R.klassifiziere(e, { now: T("2026-09-18T00:00:00Z") });
  assert.equal(spaeter.retryDue, true, "kein Titel bleibt dauerhaft ausgeschlossen");
});

test("RL-5 · eine temporaere Ablehnung ruht einen Tag, dann wird wieder gefragt", () => {
  const e = { at: "2026-09-17T22:00:00Z", codes: "stale_last_bar" };
  assert.equal(R.klassifiziere(e, { now: T("2026-09-18T02:00:00Z") }).retryDue, false);
  assert.equal(R.klassifiziere(e, { now: T("2026-09-18T20:00:00Z") }).retryDue, true);
});

test("RL-6 · aelter als die Frist heisst STALE und wird geprueft", () => {
  const e = { at: "2026-09-01T00:00:00Z", codes: "no_data" };
  const k = R.klassifiziere(e, { now: T("2026-09-18T00:00:00Z"), staleAfterMs: 7 * 86400000 });
  assert.equal(k.class, "STALE_REJECT");
  assert.equal(k.retryDue, true);
});

test("RL-7 · ohne Eintrag darf immer gefragt werden", () => {
  const u = R.darfAbfragen(null, { now: T("2026-09-18T00:00:00Z") });
  assert.equal(u.allowed, true);
  assert.equal(u.class, "RECOVERED");
});

test("RL-8 · ein unlesbarer Zeitpunkt sperrt nicht", () => {
  const k = R.klassifiziere({ at: "irgendwann", codes: "too_few_bars" }, { now: T("2026-09-18T00:00:00Z") });
  assert.equal(k.retryDue, true);
});

test("RL-9 · dieselbe Ursache zweimal ist eine Bestaetigung, eine andere faengt von vorn an", () => {
  const erst = R.fortschreiben(null, { at: "2026-09-16T22:00:00Z", codes: "insufficient_history" });
  assert.equal(erst.confirmations, 1);
  const zweit = R.fortschreiben(erst, { at: "2026-09-17T22:00:00Z", codes: "insufficient_history" });
  assert.equal(zweit.confirmations, 2);
  assert.equal(zweit.firstAt, "2026-09-16T22:00:00Z", "der erste Befund bleibt datiert");
  const anders = R.fortschreiben(zweit, { at: "2026-09-18T22:00:00Z", codes: "duplicate_bar" });
  assert.equal(anders.confirmations, 1, "eine andere Ursache ist keine Bestaetigung der alten");
});

test("RL-10 · das Register des Vorfalls: 6.831 Eintraege, alle wieder faellig", () => {
  const register = {};
  for (let i = 0; i < 6831; i++) {
    register["US_T" + i] = { at: "2026-09-16T22:41:11.004Z", codes: "too_few_bars", window: "incremental" };
  }
  /* Dazwischen drei, die wirklich nicht koennen. */
  register.US_DEAD1 = { at: "2026-09-16T22:41:11.004Z", codes: "unknown_security", confirmations: 5 };
  register.US_DEAD2 = { at: "2026-09-16T22:41:11.004Z", codes: "insufficient_history", confirmations: 3 };
  register.US_ALT = { at: "2026-08-20T00:00:00Z", codes: "no_data" };

  const p = R.pruefeRegister(register, { now: T("2026-09-18T06:00:00Z"), staleAfterMs: 7 * 86400000 });
  assert.equal(p.total, 6834);
  assert.equal(p.retry.length, 6832, "die Fensterartefakte und der veraltete Eintrag werden neu geprueft");
  assert.equal(p.keep.length, 2, "nur die beiden bestaetigt strukturellen bleiben zurueckgestellt");
  assert.equal(p.byClass.PERMANENT_REJECT, 2);
  assert.equal(p.byClass.STALE_REJECT, 1);
  assert.equal(p.byCode.too_few_bars, 6831);
});

test("RL-11 · dieselbe Ursache wiederholt verlaengert die Ruhe - bis zu einer Woche", () => {
  const stunden = (ms) => Math.round(ms / 3600000);
  assert.equal(stunden(R.temporaereFrist(1)), 20, "einmal gestolpert: der naechste Tageslauf fragt wieder");
  assert.equal(stunden(R.temporaereFrist(2)), 40);
  assert.equal(stunden(R.temporaereFrist(3)), 80);
  assert.equal(stunden(R.temporaereFrist(9)), 168, "Obergrenze: eine Woche, nicht mehr");

  /* Und danach wird trotzdem gefragt - die Frist ist eine Ruhe, keine Sperre. */
  const dauerhaft = { at: "2026-09-01T00:00:00Z", codes: "invalid_close", confirmations: 9 };
  assert.equal(R.klassifiziere(dauerhaft, { now: T("2026-09-09T00:00:00Z") }).retryDue, true);
});
