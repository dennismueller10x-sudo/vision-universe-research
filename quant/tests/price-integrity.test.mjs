/* =========================================================================
   PREISINTEGRITAET (corporate-action-contract-1.1.0, price-integrity-1.0.0)
   V4-D1 / V4-D2: nicht gemeldete Reverse Splits, Fehlkurse, hohe Niveaus.

   Synthetische Tageskerzen mit Eroeffnung und Stueckvolumen. Die
   Anbieterspalte folgt der Anbieterkonvention; `providerMisses` laesst den
   Anbieter einen Split NICHT kennen (sein Faktor bleibt, die Spalte springt
   mit dem Rohkurs) - genau der Fall, der bisher durchlief.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CTR = require("../engines/canonical-total-return.js");
const PI = require("../engines/price-integrity.js");
const RS = require("../engines/return-series.js");
const OK = { identity: { state: "CONFIRMED", via: "test" } };

/* n Werktage ab 2024-01-02. events[i]: {split (gemeldet), jump (Rohkurs x, nicht gemeldet), volume, open, gapDays, stale} */
function bars(n, { start = 10, drift = 0.001, volume = 1e6, events = {}, providerMisses = new Set(), noProvider = false } = {}) {
  const out = []; let t = Date.parse("2024-01-02T00:00:00Z"), close = start;
  for (let i = 0; i < n; i++) {
    const e = events[i] || {};
    if (e.gapDays) t += e.gapDays * 864e5;
    while ([0, 6].includes(new Date(t).getUTCDay())) t += 864e5;
    const prev = close;
    if (i) close = e.stale ? prev : (close * (1 + (i % 2 ? drift : -drift / 2))) / (e.split || 1) * (e.jump || 1);
    const open = e.open !== undefined ? e.open * prev : i ? prev / (e.split || 1) * (e.jump || 1) : close;
    out.push({ date: new Date(t).toISOString().slice(0, 10), open, high: Math.max(open, close) * 1.01, low: Math.min(open, close) * 0.99, close,
      volume: e.stale ? 0 : (e.volume ?? volume), splitFactor: e.split || 1, dividend: 0 });
    t += 864e5;
  }
  if (noProvider) return out.map((b) => ({ ...b, adjustedClose: null }));
  const f = new Array(n); f[n - 1] = 1;
  for (let i = n - 1; i > 0; i--) { const s = providerMisses.has(i) ? 1 : out[i].splitFactor; f[i - 1] = f[i] * (out[i].close / (s * out[i].close)); }
  return out.map((b, i) => ({ ...b, adjustedClose: b.close * f[i] }));
}
const at = (b, date) => b.findIndex((x) => x.date === date);

test("PI1 normaler Forward Split 2:1 (gemeldet, Anbieter in Paritaet): rekonstruiert, Forensik CONFIRMED_SPLIT -> NORMALIZE", () => {
  const b = bars(120, { events: { 60: { split: 2, volume: 2e6 } } });
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(r.events.splits, 1);
  const x = PI.explainDay(b, 60, {});
  assert.equal(x.cause, "CONFIRMED_SPLIT");
  assert.equal(x.outcome, "NORMALIZE");
});

test("PI2 normaler Reverse Split 1:10 (gemeldet): rekonstruiert, Index stetig, Rohsprung 10x ist kein Befund", () => {
  const b = bars(120, { events: { 60: { split: 0.1, volume: 1e5 } } });
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(r.events.reverseSplits, 1);
  assert.ok(Math.abs(r.priceReturnIndex[60] / r.priceReturnIndex[59] - 1) < 0.01);
  assert.equal(r.events.unresolvedDiscontinuities, 0);
});

test("PI3 V4-D1: nicht gemeldeter Reverse Split 1:20, Anbieter kennt ihn auch nicht -> SPLIT_SUSPECTED_UNDECLARED (HOLD), keine stille Korrektur", () => {
  const b = bars(120, { start: 0.4, events: { 60: { jump: 20, volume: 6e4 } } });
  const before = CTR.reconstruct(b.slice(0, 60), OK);
  assert.equal(before.state, "TOTAL_RETURN_RECONSTRUCTED", "der Teil vor dem Ereignis bleibt gueltig");
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.state, "TOTAL_RETURN_UNAVAILABLE");
  assert.equal(r.reason, "SPLIT_SUSPECTED_UNDECLARED");
  assert.equal(r.bucket, "REJECTED_SPLIT_GAP");
  assert.equal(r.date, b[60].date);
  assert.equal(r.conventionalRatio, 20);
  assert.equal(r.tr, null, "keine korrigierte Reihe");
  const x = PI.explainDay(b, 60, { shares: [["2024-02-01", 2e8], ["2024-05-01", 1e7]] });
  assert.equal(x.cause, "UNDECLARED_REVERSE_SPLIT");
  assert.equal(x.confidence, "HIGH");
  assert.equal(x.outcome, "HOLD");
  assert.equal(x.reasonCode, "SPLIT_SUSPECTED_UNDECLARED");
  assert.equal(x.locus, "PROVIDER");
  assert.equal(x.evidence.providerFactorUnchanged, true);
  assert.equal(x.evidence.secSharesInverse, true);
});

test("PI4 Kausalitaet: die Signatur liest nur Kerzen bis zum Ereignistag (Praefix bis zum Tag = gleicher Befund)", () => {
  const b = bars(120, { start: 0.4, events: { 60: { jump: 20, volume: 6e4 } } });
  const p = CTR.reconstruct(b.slice(0, 61), OK), full = CTR.reconstruct(b, OK);
  assert.equal(p.reason, "SPLIT_SUSPECTED_UNDECLARED");
  assert.equal(p.date, full.date);
});

test("PI5 fehlende Corporate Action, die der Anbieter kennt: SPLIT_MISSING hat Vorrang (unser Input fehlt, nicht der Anbieter)", () => {
  const b = bars(120, { events: { 60: { jump: 10, volume: 1e5 } } });
  // Anbieter kennt den Split: seine Spalte springt NICHT mit dem Rohkurs
  const n = b.length, f = new Array(n); f[n - 1] = 1;
  for (let i = n - 1; i > 0; i--) f[i - 1] = f[i] * (i === 60 ? 10 : 1);
  const withProv = b.map((x, i) => ({ ...x, adjustedClose: x.close * f[i] }));
  const r = CTR.reconstruct(withProv, OK);
  assert.equal(r.reason, "SPLIT_MISSING");
});

test("PI6 widerspruechliche Split-Metadaten (1:10 gemeldet, Rohkurs bewegt sich nicht): CORPORATE_ACTION_CONTRADICTED, Forensik DECLARED_SPLIT_INCONSISTENT -> QUARANTINE", () => {
  const b = bars(120, { noProvider: true });
  b[60] = { ...b[60], splitFactor: 0.1 };
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.reason, "CORPORATE_ACTION_CONTRADICTED");
  const x = PI.explainDay(b, 60, {});
  assert.equal(x.cause, "DECLARED_SPLIT_INCONSISTENT");
  assert.equal(x.outcome, "QUARANTINE");
});

test("PI7 legitime Kursvervierfachung auf Nachricht (Volumen x40): kein Split, keine Sperre", () => {
  const b = bars(120, { start: 2, events: { 60: { jump: 4, volume: 4e7 } } });
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(PI.explainDay(b, 60, {}).cause, "GENUINE_PRICE_MOVE");
});

test("PI8 Verdopplung bei unveraendertem Volumen ist kein Split (Groesse allein beweist nichts)", () => {
  const b = bars(120, { start: 5, events: { 60: { jump: 2 } } });
  assert.equal(CTR.reconstruct(b, OK).state, "TOTAL_RETURN_RECONSTRUCTED");
});

test("PI9 >= 10-facher Sprung ohne Signatur (Volumen hoch): gezaehlt, nicht gesperrt, Forensik UNRESOLVED -> ACCEPT", () => {
  const b = bars(120, { start: 0.2, events: { 60: { jump: 12, volume: 5e7 } } });
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.state, "TOTAL_RETURN_RECONSTRUCTED");
  assert.equal(r.events.unresolvedDiscontinuities, 1);
  const x = PI.explainDay(b, 60, {});
  assert.equal(x.cause, "UNRESOLVED");
  assert.equal(x.outcome, "ACCEPT");
});

test("PI10 Fehlkurs (x8, am Folgetag zurueck): PRICE_SPIKE_REVERTED ab dem Fehlkurs, erst am Folgetag erkennbar", () => {
  const b = bars(120, { events: { 60: { jump: 8, volume: 2e6 }, 61: { jump: 1 / 8 } } });
  assert.equal(CTR.reconstruct(b.slice(0, 61), OK).state, "TOTAL_RETURN_RECONSTRUCTED", "am Fehlkurstag selbst noch nicht erkennbar");
  const r = CTR.reconstruct(b, OK);
  assert.equal(r.reason, "PRICE_SPIKE_REVERTED");
  assert.equal(r.date, b[60].date);
  assert.equal(PI.explainDay(b, 60, {}).cause, "PROVIDER_SPIKE");
});

test("PI11 legitimer hoher Nominalkurs (400.000 $): keine Obergrenze, rekonstruiert, Hochniveau-Klasse LEGITIMATE_HIGH_NOMINAL_PRICE", () => {
  const b = bars(260, { start: 4e5, volume: 300 });
  assert.equal(CTR.reconstruct(b, OK).state, "TOTAL_RETURN_RECONSTRUCTED");
  const sec = { bars: b.map((x) => ({ ...x, rawClose: x.close, close: x.close * 3 })) };
  assert.equal(PI.explainHighLevel(sec).cause, "LEGITIMATE_HIGH_NOMINAL_PRICE");
});

test("PI12 V4-D2: Niveau > 1e6 aus gemeldeten Serien-Reverse-Splits ist Rechenergebnis, kein Fehler (NORMALIZE)", () => {
  const b = bars(400, { start: 20, events: { 100: { split: 0.01, volume: 1e4 }, 200: { split: 0.02, volume: 2e4 }, 300: { split: 0.05, volume: 5e4 } } });
  assert.equal(CTR.reconstruct(b, OK).state, "TOTAL_RETURN_RECONSTRUCTED");
  const f = RS.splitFactors(b);
  const sec = { bars: b.map((x, i) => ({ ...x, rawClose: x.close, close: x.close / f[i] })) };
  const h = PI.explainHighLevel(sec);
  assert.ok(sec.bars[0].close > 1e6);
  assert.equal(h.cause, "ADJUSTED_LEVEL_FROM_DECLARED_REVERSE_SPLITS");
  assert.equal(PI.POLICY_BY_CLASS[h.cause].outcome, "NORMALIZE");
});

test("PI13 Adjusted/Raw-Konsistenz: Kursindex der Rekonstruktion = splitbereinigte Reihe aus return-series (gleiche Split-Wahrheit)", () => {
  const b = bars(200, { events: { 50: { split: 0.1, volume: 1e5 }, 150: { split: 3, volume: 3e6 } } });
  const r = CTR.reconstruct(b, OK), adj = RS.splitAdjusted(b);
  for (let i = 1; i < b.length; i++) assert.ok(Math.abs(r.priceReturnIndex[i] / r.priceReturnIndex[i - 1] - adj[i] / adj[i - 1]) < 1e-9);
});

test("PI14 Ticker-/Listing-Wechsel: Luecke > 365 Tage = LISTING_DISCONTINUITY (REJECT), 40 Tage = Forensik LISTING_CHANGE", () => {
  const b = bars(120, { events: { 60: { gapDays: 400, jump: 30, volume: 1e4 } } });
  assert.equal(CTR.reconstruct(b, OK).reason, "LISTING_DISCONTINUITY");
  const c = bars(120, { events: { 60: { gapDays: 40, jump: 30, volume: 1e4 } } });
  const x = PI.explainDay(c, 60, { listing: { reusedLater: false } });
  assert.equal(x.cause, "LISTING_CHANGE");
  assert.equal(PI.explainDay(c, 60, { listing: { reusedLater: true } }).cause, "TICKER_IDENTITY_MISMATCH");
});

test("PI15 Stale Bar: sechs Kerzen ohne frischen Kurs vor dem Sprung = STALE_PRICE; STALE-Regel des Kerns unveraendert", () => {
  const ev = {}; for (let i = 54; i < 60; i++) ev[i] = { stale: true }; ev[60] = { jump: 5, volume: 1e6 };
  const b = bars(120, { events: ev });
  assert.equal(PI.explainDay(b, 60, {}).cause, "STALE_PRICE");
  const r = CTR.reconstruct(bars(50), { ...OK, asOf: "2024-06-30", maxStaleDays: 10 });
  assert.equal(r.reason, "STALE");
});

test("PI16 Uebernahme/Delisting: Index endet mit der letzten Kerze, Erloes unbekannt (DELISTING_PROCEEDS_UNKNOWN)", () => {
  const r = CTR.reconstruct(bars(80), { ...OK, delisted: true });
  assert.equal(r.terminal, "DELISTING_PROCEEDS_UNKNOWN");
});

test("PI17 ohne Eroeffnung/Volumen ist die Signatur nicht pruefbar: altes Verhalten (keine neue Sperre)", () => {
  const b = bars(120, { start: 0.4, events: { 60: { jump: 20, volume: 6e4 } } }).map(({ open, volume, ...x }) => x);
  assert.equal(CTR.reconstruct(b, OK).state, "TOTAL_RETURN_RECONSTRUCTED");
});

test("PI18 nicht gemeldeter Forward Split ist von einem Kurssturz nicht trennbar: keine Sperre, Forensik hoechstens POSSIBLE", () => {
  const b = bars(120, { start: 40, events: { 60: { jump: 1 / 4, volume: 4e6 } } });
  assert.equal(CTR.reconstruct(b, OK).state, "TOTAL_RETURN_RECONSTRUCTED");
  const x = PI.explainDay(b, 60, {});
  assert.ok(["UNDECLARED_FORWARD_SPLIT_POSSIBLE", "GENUINE_PRICE_MOVE"].includes(x.cause));
  assert.notEqual(x.outcome, "HOLD");
});

test("PI19 Policy ist vollstaendig: jede Ursache hat einen Ausgang aus ACCEPT/NORMALIZE/QUARANTINE/HOLD/REJECT und einen Reason Code", () => {
  const outcomes = new Set(["ACCEPT", "NORMALIZE", "QUARANTINE", "HOLD", "REJECT"]);
  for (const p of PI.POLICY) { assert.ok(outcomes.has(p.outcome), p.cls); assert.ok(/^[A-Z_]+$/.test(p.reason), p.cls); }
  for (const c of PI.ROOT_CAUSES) {
    const pc = PI.CAUSE_TO_POLICY[c];
    assert.ok(pc === null || PI.POLICY_BY_CLASS[pc], c);
    assert.ok(PI.CAUSE_LOCUS[c], c);
  }
  for (const k of ["CONFIRMED_SPLIT", "CONFLICTING_SPLIT", "SUSPECTED_UNDECLARED_SPLIT", "UNRESOLVED_PRICE_DISCONTINUITY", "LEGITIMATE_HIGH_NOMINAL_PRICE", "STALE_OR_UNAVAILABLE"]) assert.ok(PI.POLICY_BY_CLASS[k], k);
  assert.ok(!JSON.stringify(PI.POLICY).match(/price cap|Obergrenze von/i));
});

test("PI20 Vertragsversionen: neue Corporate-Action-Regeln aendern den Methodik-Fingerabdruck", () => {
  assert.deepEqual(CTR.contractVersions(), { totalReturn: "canonical-total-return-1.1.0", corporateActions: "corporate-action-contract-1.1.0", benchmark: "benchmark-contract-1.0.0" });
  assert.equal(CTR.bucketOf("SPLIT_SUSPECTED_UNDECLARED"), "REJECTED_SPLIT_GAP");
  assert.equal(CTR.bucketOf("PRICE_SPIKE_REVERTED"), "REJECTED_OTHER");
});
