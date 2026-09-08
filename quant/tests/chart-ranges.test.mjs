/* =========================================================================
   PHASE 4A §17 — ZEITRAUM UND QUELLE

   Die Auswahl "1 Tag" oder "5 Jahre" sieht nach Darstellung aus und ist
   eine Datenfrage. Diese Datei haelt fest, dass sie auch so behandelt
   wird: kein Tageschart aus Tagesschlusskursen, kein stiller Rueckfall,
   und ein nicht verfuegbarer Zeitraum, der sagt woran es liegt.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Ranges = require("../engines/chart-ranges.js");
const Policy = require("../engines/display-policy.js");

const HEUTE = "2026-06-30";

function tagesreihe(tage) {
  const bars = [];
  const d = new Date(Date.UTC(2026, 5, 30));
  d.setUTCDate(d.getUTCDate() - tage + 1);
  for (let i = 0; i < tage; i++) {
    bars.push({ date: d.toISOString().slice(0, 10), open: 100, high: 102, low: 99,
                close: 100 + i * 0.05, volume: 1000000 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

function intradayreihe(punkte) {
  const bars = [];
  for (let i = 0; i < punkte; i++) {
    const min = 30 + i * 5;
    const t = new Date(Date.UTC(2026, 5, 30, 13, 0, 0));
    t.setUTCMinutes(t.getUTCMinutes() + min);
    bars.push({ date: t.toISOString(), open: 100, high: 101, low: 99.5,
                close: 100 + i * 0.01, volume: 5000 });
  }
  return bars;
}

const AUS = { ENABLE_LIVE_MARKET_DATA: false, ENABLE_PUBLIC_LIVE_MARKET_DATA: false };
const AN = { ENABLE_LIVE_MARKET_DATA: true, ENABLE_PUBLIC_LIVE_MARKET_DATA: false };

test("R1 · Ohne Gate gibt es keinen Tagesverlauf - und kein Ersatzstueck", () => {
  const res = Ranges.selectRange("1D", { eod: tagesreihe(800), intraday: intradayreihe(78) },
    { gates: AUS, today: HEUTE });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "gateDisabled");
  assert.equal(res.bars.length, 0, "es darf nichts geliefert werden, auch nicht ersatzweise");
  assert.match(res.message, /waere erfunden/);
  // Aber der Nutzer bleibt nicht ohne Antwort.
  assert.equal(res.suggestion, "1M");
});

test("R2 · Das Gate steht vor den Daten, nicht dahinter", () => {
  // Waere es umgekehrt, entschiede die Anwesenheit einer Datei ueber eine
  // Freigabe - und ein versehentlich abgelegter Datenstand waere eine
  // Erlaubnis.
  const res = Ranges.selectRange("1D", { eod: tagesreihe(800), intraday: [] },
    { gates: AUS, today: HEUTE });
  assert.equal(res.reason, "gateDisabled", "das Gate muss zuerst greifen");
});

test("R3 · Mit Gate und Daten zeichnet der Tageschart Intraday", () => {
  const res = Ranges.selectRange("1D", { eod: tagesreihe(800), intraday: intradayreihe(78) },
    { gates: AN, today: HEUTE });
  assert.equal(res.ok, true);
  assert.equal(res.source, "intraday");
  assert.equal(res.bars.length, 78);
});

test("R4 · Mit Gate, aber ohne Intraday-Bars, wird nicht auf Tagesdaten ausgewichen", () => {
  const res = Ranges.selectRange("5D", { eod: tagesreihe(800), intraday: [] },
    { gates: AN, today: HEUTE });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "noIntradayData");
  assert.equal(res.source, "intraday", "die Quelle bleibt benannt, auch wenn sie fehlt");
});

test("R5 · Lange Zeitraeume kommen aus Tagesdaten, ohne Gate", () => {
  const data = { eod: tagesreihe(2000), adjustmentStatus: "TOTAL_RETURN" };
  for (const id of ["1M", "6M", "YTD", "1Y", "5Y", "MAX"]) {
    const res = Ranges.selectRange(id, data, { gates: AUS, today: HEUTE });
    assert.equal(res.ok, true, id + " sollte ohne Gate funktionieren");
    assert.equal(res.source, "eod");
    assert.equal(res.adjustmentStatus, "TOTAL_RETURN",
      "die Bereinigungsstufe muss mitgereicht werden - sonst weiss die Anzeige nicht, was sie zeigt");
  }
});

test("R6 · Die Fenster sind gestaffelt und MAX ist das groesste", () => {
  const data = { eod: tagesreihe(2000) };
  const laengen = ["1M", "6M", "1Y", "5Y", "MAX"].map(
    (id) => Ranges.selectRange(id, data, { gates: AUS, today: HEUTE }).bars.length);
  for (let i = 1; i < laengen.length; i++) {
    assert.ok(laengen[i] >= laengen[i - 1],
      `Fenster ${i} (${laengen[i]}) ist kleiner als das vorige (${laengen[i - 1]})`);
  }
  assert.equal(laengen[laengen.length - 1], 2000, "MAX muss alles zeigen");
});

test("R7 · YTD beginnt am Jahresanfang, nicht vor zwoelf Monaten", () => {
  const res = Ranges.selectRange("YTD", { eod: tagesreihe(800) },
    { gates: AUS, today: HEUTE });
  assert.equal(res.from.slice(0, 4), "2026");
  assert.ok(res.from >= "2026-01-01");
  assert.ok(Ranges.selectRange("1Y", { eod: tagesreihe(800) }, { gates: AUS, today: HEUTE }).from
    < res.from, "ein Jahr zurueck muss weiter zurueckreichen als der Jahresanfang");
});

test("R8 · Eine kurze Reihe blendet die grossen Fenster nicht aus", () => {
  // Ein verschwundener Knopf ist eine unbeantwortete Frage. 5J auf einer
  // Reihe von 60 Tagen zeigt eben diese 60 Tage - das ist ehrlich, solange
  // die Achse es sagt.
  const bar = Ranges.rangeBar({ eod: tagesreihe(60) }, { gates: AUS, today: HEUTE });
  assert.equal(bar.length, 8);
  const fuenfJahre = bar.find((r) => r.id === "5Y");
  assert.equal(fuenfJahre.available, true);
  const tag = bar.find((r) => r.id === "1D");
  assert.equal(tag.available, false);
  assert.ok(tag.reason, "ein abgeblendeter Knopf muss seinen Grund tragen");
});

test("R9 · Ohne jede Reihe scheitert jeder Zeitraum, ohne Absturz", () => {
  const bar = Ranges.rangeBar({}, { gates: AN, today: HEUTE });
  assert.ok(bar.every((r) => r.available === false));
  const res = Ranges.selectRange("MAX", {}, { gates: AN, today: HEUTE });
  assert.equal(res.reason, "noData");
  assert.equal(res.suggestion, null, "wenn nichts geht, wird auch nichts vorgeschlagen");
});

test("R10 · Die ausgelieferte Konfiguration schaltet nichts frei", () => {
  // Der Standardzustand des Repositories. Waere hier eines der Gates an,
  // liefe die oeffentliche Seite mit Live-Daten, deren Lizenzlage
  // ungeklaert ist.
  const cfg = JSON.parse(readFileSync(join(ROOT, "quant", "config", "feature-gates.json"), "utf8"));
  const gates = Policy.gatesFromConfig(cfg);
  assert.equal(gates.ENABLE_LIVE_MARKET_DATA, false);
  assert.equal(gates.ENABLE_PUBLIC_LIVE_MARKET_DATA, false);
  for (const name of Object.keys(cfg.gates)) {
    assert.ok(cfg.gates[name].reason, name + " steht ohne Begruendung da");
  }
});

test("R11 · Nur ein ausdrueckliches true schaltet ein", () => {
  for (const wert of ["true", 1, "ja", {}, null, undefined]) {
    const gates = Policy.gatesFromConfig({ gates: { ENABLE_LIVE_MARKET_DATA: { enabled: wert } } });
    assert.equal(gates.ENABLE_LIVE_MARKET_DATA, false, `"${wert}" darf nicht einschalten`);
  }
  assert.equal(
    Policy.gatesFromConfig({ gates: { ENABLE_LIVE_MARKET_DATA: { enabled: true } } })
      .ENABLE_LIVE_MARKET_DATA, true);
  // Und eine fehlende Datei ist kein Freibrief.
  assert.equal(Policy.gatesFromConfig(null).ENABLE_LIVE_MARKET_DATA, false);
});

test("R12 · Das Gate allein macht die Anzeige nicht oeffentlich", () => {
  // Der Kern von §15: Gate UND Lizenz, nicht Gate ODER Lizenz.
  Policy.reset();
  const res = Policy.check({
    providerId: "tiingo", dataClass: "intraday", audience: "public", form: "realtime",
    gates: { ENABLE_LIVE_MARKET_DATA: true, ENABLE_PUBLIC_LIVE_MARKET_DATA: true }
  });
  assert.equal(res.allowed, false);
  assert.equal(res.reason, "notLicensed");
});

test("R13 · Ein voller Zeitstempel als Stichtag ist kein Absturz", () => {
  // Intraday-Bars tragen eine Uhrzeit, und ein Aufrufer reicht leicht
  // einen vollen Zeitstempel weiter. Ohne Kuerzung auf den Datumsteil
  // entstand daraus eine Ausnahme mitten im Rendern.
  const data = { eod: tagesreihe(400) };
  const mitZeit = Ranges.selectRange("1M", data, { gates: AUS, today: "2026-06-30T14:30:00.000Z" });
  const ohneZeit = Ranges.selectRange("1M", data, { gates: AUS, today: "2026-06-30" });
  assert.equal(mitZeit.ok, true);
  assert.equal(mitZeit.from, ohneZeit.from);
  assert.equal(mitZeit.to, ohneZeit.to);
  assert.equal(mitZeit.bars.length, ohneZeit.bars.length);

  // Auch YTD zieht das Jahr aus dem Datumsteil.
  assert.equal(Ranges.selectRange("YTD", data, { gates: AUS, today: "2026-03-02T09:00:00Z" })
    .from.slice(0, 4), "2026");
});

test("R14 · Ein unlesbarer Stichtag entfernt nicht einfach das Fenster", () => {
  // Der stille Fall: liefe isoMinusDays auf null hinaus und bliebe das
  // Fenster damit offen, zeigte "1 Monat" klaglos die ganze Historie.
  const res = Ranges.selectRange("1M", { eod: tagesreihe(400) },
    { gates: AUS, today: "kein Datum" });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "invalidDate");
  assert.equal(res.bars.length, 0);
});

test("R15 · Das Fenster endet am Stichtag, nicht am letzten Bar", () => {
  /* Ohne obere Grenze zeigt ein Chart mit Stichtag in der Mitte der Reihe
     auch die Tage danach - aus "Stand 15. Januar" wird eine Darstellung
     mit Blick in die Zukunft. Im Normalfall faellt der Stichtag auf den
     letzten Bar und die Grenze greift nicht; sie ist fuer den anderen
     Fall da. */
  const data = { eod: tagesreihe(400) };   // endet am 2026-06-30
  const stichtag = "2026-03-15";
  for (const id of ["1M", "6M", "YTD", "1Y", "MAX"]) {
    const res = Ranges.selectRange(id, data, { gates: AUS, today: stichtag });
    assert.ok(res.ok, id);
    assert.ok(res.to <= stichtag,
      `${id} zeigt ${res.to} und damit Tage nach dem Stichtag ${stichtag}`);
  }
  // Und ohne Stichtag reicht die Reihe erwartungsgemaess bis zum Ende.
  assert.equal(Ranges.selectRange("MAX", data, { gates: AUS }).to, "2026-06-30");
});
