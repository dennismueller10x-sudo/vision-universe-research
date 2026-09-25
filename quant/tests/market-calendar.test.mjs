/* =========================================================================
   DER HANDELSKALENDER, ZWEIFACH BELEGT.

   Der Anlass: zwei Pruefungen laufen die letzten 261 bis 270 Bars eines
   Titels durch und verwerfen ihn VOLLSTAENDIG, wenn eine Bar auf einem
   Datum liegt, fuer das der Kalender keine Deckung hat -
   TECHNICAL_CALENDAR_INVALID (208 Titel) und SIGNAL_INVALID_SIGNAL_SESSION
   (205 Titel) im Lauf vom 24.09.2026. Beide haben recht: ausserhalb der
   Deckung kann der Kalender einen Feiertag nicht von einem Handelstag
   unterscheiden, und eine unsichere Sitzungsaussage ist keine.

   Die Deckung beginnt deshalb jetzt 2022-01-01 statt 2025-01-01. Damit
   haengt an dieser Datei, welche Bars als gueltig gelten - und ein FALSCH
   eingetragener Feiertag verwirft echte Bars. Eingetragen wird deshalb nur,
   was zweifach belegt ist:

     1. REGEL - dritter Montag im Januar, letzter Montag im Mai, vierter
        Donnerstag im November, Karfreitag, beobachtete Verschiebung bei
        Wochenendfall. Hier nachgerechnet, nicht abgeschrieben.
     2. DATEN - an einem Feiertag traegt KEINE der fuenf tiefen
        Referenzreihen (AAPL, JPM, MSFT, NVDA, XOM, je 2.949 Bars ab 2015)
        eine Bar. Umgekehrt traegt an jedem Handelstag mindestens eine eine.

   Genau diese Gegenprobe hat einen fehlenden Eintrag gefunden, den keine
   Regel hergibt: 2025-01-09, der nationale Trauertag fuer Praesident
   Carter. Er stand nicht in der Liste, obwohl die Boerse geschlossen war.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Hours = require("../engines/realtime/market-hours.js");
const calendar = require("../config/market-calendar.json");
const XNYS = calendar.exchanges.XNYS;
const feiertage = new Set(XNYS.holidays);

const ROOT = new URL("../../", import.meta.url);
const PREVIEW = new URL("quant/data/market/golden-preview/daily/", ROOT);

/* ------------------------------------------------------- 1. Die Regel */

const wochentag = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** Der n-te <dow> eines Monats. */
function nterWochentag(jahr, monat, dow, n) {
  let gefunden = 0;
  for (let tag = 1; tag <= 31; tag++) {
    const d = new Date(Date.UTC(jahr, monat - 1, tag));
    if (d.getUTCMonth() !== monat - 1) break;
    if (d.getUTCDay() === dow && ++gefunden === n) return d.toISOString().slice(0, 10);
  }
  throw new Error("kein " + n + ". Wochentag " + dow + " in " + jahr + "-" + monat);
}
/** Der letzte <dow> eines Monats. */
function letzterWochentag(jahr, monat, dow) {
  for (let tag = 31; tag >= 1; tag--) {
    const d = new Date(Date.UTC(jahr, monat - 1, tag));
    if (d.getUTCMonth() !== monat - 1) continue;
    if (d.getUTCDay() === dow) return d.toISOString().slice(0, 10);
  }
  throw new Error("kein letzter Wochentag " + dow);
}
/** Beobachtete Verschiebung: Samstag -> Freitag davor, Sonntag -> Montag danach. */
function beobachtet(jahr, monat, tag) {
  const datum = iso(jahr, monat, tag), dow = wochentag(datum);
  if (dow === 6) return iso(jahr, monat, tag - 1);
  if (dow === 0) return iso(jahr, monat, tag + 1);
  return datum;
}
/** Ostersonntag (Gauss), fuer Karfreitag zwei Tage davor. */
function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(jahr, monat - 1, tag);
}
function karfreitag(jahr) {
  return new Date(ostersonntag(jahr) - 2 * 86400000).toISOString().slice(0, 10);
}

/** Die regelbasierten Schliessungen eines Jahres. Ein Wochenendfall ohne
    beobachtete Verschiebung faellt heraus - genau das ist der Grund, warum
    2022 nur neun Eintraege hat. */
function nachRegel(jahr) {
  const kandidaten = [
    beobachtet(jahr, 1, 1),                     /* Neujahr */
    nterWochentag(jahr, 1, 1, 3),               /* Martin Luther King */
    nterWochentag(jahr, 2, 1, 3),               /* Washingtons Geburtstag */
    karfreitag(jahr),
    letzterWochentag(jahr, 5, 1),               /* Memorial Day */
    beobachtet(jahr, 6, 19),                    /* Juneteenth, ab 2022 */
    beobachtet(jahr, 7, 4),
    nterWochentag(jahr, 9, 1, 1),               /* Labor Day */
    nterWochentag(jahr, 11, 4, 4),              /* Thanksgiving */
    beobachtet(jahr, 12, 25)
  ];
  /* Ein Neujahrstag, der auf Samstag faellt, wird an der NYSE NICHT am
     Freitag davor beobachtet - der liegt im Vorjahr. 2022 ist genau dieser
     Fall, und die Liste hat deshalb neun Eintraege statt zehn. */
  return kandidaten.filter((datum) => datum.slice(0, 4) === String(jahr));
}

test("every recurring holiday follows its published rule", () => {
  for (let jahr = 2022; jahr <= 2027; jahr++) {
    for (const datum of nachRegel(jahr)) {
      assert.ok(feiertage.has(datum),
        datum + " folgt der Regel, steht aber nicht im Kalender");
    }
  }
  /* Und umgekehrt: jeder Eintrag ist entweder regelbasiert oder
     ausdruecklich als Sonderschliessung benannt. Ohne diese Richtung
     koennte ein falsches Datum unbemerkt echte Bars verwerfen. */
  const ausRegel = new Set();
  for (let jahr = 2022; jahr <= 2027; jahr++) for (const d of nachRegel(jahr)) ausRegel.add(d);
  const sonder = calendar.coverage.specialClosures || {};
  for (const datum of feiertage) {
    if (ausRegel.has(datum)) continue;
    assert.ok(Object.prototype.hasOwnProperty.call(sonder, datum),
      datum + " folgt keiner Regel und ist nicht als Sonderschliessung benannt");
    assert.ok(String(sonder[datum]).length > 40, datum + " ist ohne Begruendung eingetragen");
  }
});

/* -------------------------------------------------------- 2. Die Daten */

function referenzreihen() {
  if (!existsSync(PREVIEW)) return [];
  return readdirSync(PREVIEW).filter((f) => f.endsWith(".json")).map((f) => ({
    name: f.replace(/^ref_|\.json$/g, ""),
    dates: new Set(JSON.parse(readFileSync(new URL(f, PREVIEW), "utf8")).bars.map((b) => b.date))
  }));
}

test("no reference series trades on a listed holiday, and every trading weekday has one", () => {
  const reihen = referenzreihen();
  if (reihen.length < 5) return;   /* Der Vorschauausschnitt fehlt in manchen Baeumen. */
  const von = reihen.map((r) => [...r.dates].sort()[0]).sort().at(-1);
  const bis = reihen.map((r) => [...r.dates].sort().at(-1)).sort()[0];

  let gepruefteFeiertage = 0, geprueftHandelstage = 0;
  for (let t = Date.parse(von + "T00:00:00Z"); t <= Date.parse(bis + "T00:00:00Z"); t += 86400000) {
    const d = new Date(t), dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const datum = d.toISOString().slice(0, 10);
    if (datum < calendar.coverage.from || datum > calendar.coverage.to) continue;
    const mitBar = reihen.filter((r) => r.dates.has(datum));
    if (feiertage.has(datum)) {
      gepruefteFeiertage += 1;
      assert.equal(mitBar.length, 0,
        datum + " ist als Feiertag eingetragen, aber " + mitBar.map((r) => r.name).join(",") +
        " haben eine Bar - ein falscher Eintrag verwirft echte Bars");
    } else {
      geprueftHandelstage += 1;
      assert.ok(mitBar.length > 0,
        datum + " ist ein Wochentag ohne Feiertagseintrag, aber keine Referenzreihe hat eine Bar" +
        " - entweder fehlt eine Schliessung oder die Reihen sind unvollstaendig");
    }
  }
  /* Die Pruefung soll etwas gesehen haben. Null gepruefte Tage waeren ein
     gruener Test ueber nichts. */
  assert.ok(gepruefteFeiertage >= 40, "nur " + gepruefteFeiertage + " Feiertage geprueft");
  assert.ok(geprueftHandelstage >= 900, "nur " + geprueftHandelstage + " Handelstage geprueft");
});

/* ------------------------------------- 3. Was die Deckung bewirken soll */

test("the window the technical and signal checks walk lies inside the coverage", () => {
  /* Beide Pruefungen laufen die letzten 261 bis 270 Bars durch. Reicht das
     Fenster eines Titels aus der Deckung heraus, verwerfen sie ihn
     vollstaendig. Gemessen: 152 der 6.482 veroeffentlichten Tagesreihen
     beginnen ihr Fenster vor 2025-01-01, die frueheste am 2023-01-03. */
  assert.ok(calendar.coverage.from <= "2023-01-03",
    "die Deckung beginnt nach dem fruehesten gemessenen Fensteranfang");
  const serien = new URL("quant/data/market/discover-series/", ROOT);
  if (!existsSync(serien)) return;
  const dateien = readdirSync(serien).filter((f) => f.endsWith(".json") && f !== "index.json");
  let ausserhalb = 0, geprueft = 0;
  for (const f of dateien) {
    const punkte = JSON.parse(readFileSync(new URL(f, serien), "utf8")).points;
    if (!Array.isArray(punkte) || !punkte.length) continue;
    geprueft += 1;
    const fenster = punkte.slice(-270);
    if (fenster[0][0] < calendar.coverage.from) ausserhalb += 1;
  }
  assert.ok(geprueft > 1000, "zu wenige Reihen geprueft: " + geprueft);
  assert.equal(ausserhalb, 0,
    ausserhalb + " von " + geprueft + " Reihen haben ihr 270-Bar-Fenster ausserhalb der Deckung");
});

test("a date inside the coverage answers with certainty, outside it does not", () => {
  /* Der Unterschied, um den es geht - und der Grund, warum die Deckung
     erweitert und die Pruefung NICHT gelockert wurde. */
  const drinnen = Hours.sessionAt("2024-03-29T12:00:00Z", { calendar, exchange: "XNYS" });
  assert.equal(drinnen.calendarCoverage, true);
  assert.equal(drinnen.isTradingDay, false, "Karfreitag 2024 ist kein Handelstag");

  const davor = Hours.sessionAt("2021-12-30T12:00:00Z", { calendar, exchange: "XNYS" });
  assert.equal(davor.calendarCoverage, false);
  /* Ausserhalb der Deckung entscheidet nur der Wochentag - und genau
     deshalb darf eine solche Aussage nichts verwerfen. */
  assert.equal(davor.isTradingDay, true);
});
