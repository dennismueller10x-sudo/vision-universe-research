/* Neu an der Boerse: weniger als 30 Schlusskurse (Steuerung 21.11.2026, ANT).
   Schlanke Seite ohne Scores, ohne Rangliste, ohne Rendite ueber die Tagesveraenderung hinaus. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const K = require("../engines/kurzhistorie.js");

const snap = (extra) => Object.assign({ publishable: true, sessionDate: "2026-11-20", points: [["09:30", 87.62], ["15:55", 88.47]] }, extra || {});

test("jungGenug: erster Handelstag hoechstens 60 Tage vor der letzten Sitzung", () => {
  assert.equal(K.jungGenug("2026-11-19", "2026-11-20"), true);
  assert.equal(K.jungGenug("2026-09-22", "2026-11-20"), true);
  assert.equal(K.jungGenug("2026-09-01", "2026-11-20"), false);
  assert.equal(K.jungGenug("2018-10-31", "2026-11-20"), false, "alter Titel mit kurzer Datenlage ist kein Neuemittent");
  assert.equal(K.jungGenug(null, "2026-11-20"), false);
  assert.equal(K.jungGenug("2026-11-21", "2026-11-20"), false, "Zukunft");
});

test("ausIntraday: letzter Punkt, Tagesveraenderung nur mit belegtem Vortagesschluss", () => {
  const a = K.ausIntraday(snap());
  assert.equal(a.close, 88.47);
  assert.equal(a.lastLocal, "15:55");
  assert.equal(a.changePercent, null, "ohne Vortagesschluss keine Veraenderung (nichts erfunden)");
  const b = K.ausIntraday(snap({ previousClose: 80 }));
  assert.equal(b.changePercent, 10.5875);
  assert.equal(K.ausIntraday(snap({ previousClose: 80, previousCloseWithheld: true })).changePercent, null);
});

test("ausIntraday: nicht veroeffentlichbar oder ohne Punkte gibt keine Seite", () => {
  assert.equal(K.ausIntraday(snap({ publishable: false })), null);
  assert.equal(K.ausIntraday(snap({ points: [] })), null);
  assert.equal(K.ausIntraday(null), null);
  assert.equal(K.ausIntraday(snap({ points: [["15:55", 0]] })), null);
});

test("block: Etikett und Schwelle 30 stehen sichtbar", () => {
  const b = K.block(K.ausIntraday(snap()), { firstTradeDate: "2026-11-19" });
  assert.equal(b.status, "ZU_KURZE_HISTORIE");
  assert.match(b.label, /Kennzahlen folgen ab 30 Handelstagen/);
  assert.equal(b.minBars, 30);
  assert.equal(b.firstTradeDate, "2026-11-19");
});

test("ausgelieferte Kurzhistorie-Seiten: kein Score, kein Rang, keine Reihe, im Stock-Index", () => {
  const dir = new URL("../data/stocks/US_REAL/", import.meta.url).pathname;
  const idx = JSON.parse(readFileSync(new URL("../data/stock-index/US_REAL.json", import.meta.url), "utf8"));
  let n = 0;
  for (const f of readdirSync(dir)) {
    const d = JSON.parse(readFileSync(dir + f, "utf8"));
    if (!d.kurzhistorie) continue;
    n++;
    assert.equal(d.kurzhistorie.status, "ZU_KURZE_HISTORIE", f);
    assert.ok(idx.symbols.includes(d.symbol), f + " fehlt im Stock-Index");
    for (const k of ["leadership", "momentum", "relativeStrength"]) assert.equal(d.scores[k].score, null, f + " " + k);
    assert.equal(d.ranks.leadershipPercentile, null, f);
    /* Ab 2 veroeffentlichten Schlusskursen traegt die Seite den Chart aus der Kurzreihe (839078db, 21.11.2026), davor keine Reihe. */
    if (d.kurzhistorie.bars >= 2) { assert.equal(d.series.available, true, f); assert.equal(d.series.source, "discover-series", f); assert.match(d.series.path, /^\/quant\/data\/market\/discover-series-kurz\/ref_/, f); }
    else assert.equal(d.series.available, false, f);
    assert.equal(d.priceSeries.status, "INSUFFICIENT_HISTORY", f);
    assert.equal(d.geschaeftszahlen.status, "INSUFFICIENT_HISTORY", f);
    for (const k of ["return1M", "return3M", "return6M", "return12M"]) assert.equal(d.metrics[k], null, f + " " + k);
  }
  assert.ok(n >= 0);
});

/* Neuemittent nach dem Beginn des heutigen Listings (listing-continuity keptFrom), nicht nach der Stamm-Erstnotiz.
   Solange die Titel unter 30 Handelstagen sind, tragen ihre Seiten den richtigen Ersttag; danach gibt es die volle Seite. */
test("ANT und AXNX: Ersttag nach Listing-Beginn, nicht nach der Stamm-Erstnotiz 2018", () => {
  const dir = new URL("../data/stocks/US_REAL/", import.meta.url).pathname;
  const erwartet = { ANT: "2026-11-19", AXNX: "2026-10-13" };
  for (const [t, tag] of Object.entries(erwartet)) {
    const f = dir + t + ".json";
    if (!existsSync(f)) continue; /* schon die volle Seite (>= 30 Handelstage) oder noch ohne Intraday */
    const d = JSON.parse(readFileSync(f, "utf8"));
    if (!d.kurzhistorie) continue;
    assert.equal(d.kurzhistorie.firstTradeDate, tag, t);
    assert.ok(d.kurzhistorie.firstTradeDate > "2026-01-01", t + ": nicht die Stamm-Erstnotiz");
  }
});

test("block: mit veroeffentlichter Kurzreihe gilt der Tagesschluss (ADR-002), sonst der Intraday-Punkt", () => {
  const i = K.ausIntraday(snap());
  assert.equal(K.block(i, { firstTradeDate: "2026-11-19" }).stand.art, "INTRADAY_LETZTER_PUNKT");
  const b = K.block({ sessionDate: "2026-11-20", lastLocal: null }, { firstTradeDate: "2026-11-19", bars: 2 });
  assert.equal(b.stand.art, "TAGESSCHLUSS");
  assert.equal(b.bars, 2);
});

test("block/stand: mit Kurzreihe gilt der letzte Kurstag der Reihe, unabhaengig von der Intraday-Ablage (mit, ohne, alt, neu: gleiches Ergebnis)", () => {
  const mitAlt = {sessionDate: "2026-11-20", lastLocal: "15:55"}, mitNeu = {sessionDate: "2026-11-23", lastLocal: "15:55"}, fallback = {sessionDate: "2026-11-23", lastLocal: null};
  const ref = K.block(mitAlt, {firstTradeDate: "2026-11-19", bars: 3, letzterKurstag: "2026-11-23"});
  assert.deepEqual(ref.stand, {sessionDate: "2026-11-23", lokal: null, art: "TAGESSCHLUSS"});
  for (const info of [mitNeu, fallback, null]) assert.deepEqual(K.block(info, {firstTradeDate: "2026-11-19", bars: 3, letzterKurstag: "2026-11-23"}), ref, "info darf den Block nicht veraendern: " + JSON.stringify(info));
});
test("block/stand: ohne Kurzreihe bleibt der letzte Intraday-Punkt der Sitzung (INTRADAY_LETZTER_PUNKT), ohne info null", () => {
  assert.deepEqual(K.block({sessionDate: "2026-11-20", lastLocal: "15:55"}, {bars: null}).stand, {sessionDate: "2026-11-20", lokal: "15:55", art: "INTRADAY_LETZTER_PUNKT"});
  assert.equal(K.block(null, {bars: null}).stand, null);
});
