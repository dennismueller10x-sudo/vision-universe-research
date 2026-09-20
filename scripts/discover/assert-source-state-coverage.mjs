#!/usr/bin/env node
/* =========================================================================
   KEIN TITELABHAENGIGER STILLER RUECKFALL

   Owner-Auftrag vom 19.09.2026, Punkt 8: nachweisen, dass es keinen
   stillen Rueckfall auf 5-Minuten-Daten ohne ehrliche Kennzeichnung gibt -
   an Nebius, den fuenf Smoke-Titeln und mindestens zehn zufaelligen
   Consumer-Titeln.

   Dieses Skript fragt nicht die Oberflaeche, sondern die Engine, die die
   Oberflaeche speist: fuer jeden Titel wird der Quellzustand aus dem
   AUSGELIEFERTEN Snapshot bestimmt und gegen den Vertrag geprueft.

   Geprueft wird je Titel:
     - der Zustand ist einer der vier
     - "Markt geoeffnet - Live" steht NUR bei REALTIME
     - FINAL_SESSION behauptet einen Schluss nur, wenn die Reihe ihn traegt
     - ein unvollstaendiger Stand wird nie als final dargestellt
     - die Quellenbezeichnung nennt den laufenden Kurs genau dann, wenn er
       beigetragen hat

   Aufruf:
     node scripts/discover/assert-source-state-coverage.mjs [--zufall=10]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");
const SourceState = require(join(engines, "realtime", "source-state.js"));
const MarketHours = require(join(engines, "realtime", "market-hours.js"));
const TradingSession = require(join(engines, "realtime", "trading-session.js"));
const kalender = require(join(root, "quant", "config", "market-calendar.json"));

const arg = (name, fallback) => {
  const t = process.argv.find((a) => a.startsWith("--" + name + "="));
  return t ? t.split("=")[1] : fallback;
};
const ZUFALL = Number(arg("zufall", "10"));
const PFLICHT = ["NBIS", "AAPL", "NVDA", "MSFT", "PANW", "VLO"];
/* Ein Titel, dessen Reihe den letzten Slot NICHT erreicht, muss in der
   Stichprobe sein. Sonst prueft der Lauf die schaerfste Regel nie: eine
   Pruefung, die nie ausloest, beweist nichts ueber sich selbst. Gesucht
   wird er aus den Daten, nicht aus einer festen Liste - wer heute
   illiquide ist, kann es morgen nicht mehr sein. */
function ersterUnvollstaendiger(scopeListe, ordnerPfad) {
  for (const t of scopeListe) {
    const f = join(ordnerPfad, "ref_" + t + ".json");
    if (!existsSync(f)) continue;
    try {
      const s = JSON.parse(readFileSync(f, "utf8"));
      if (s.coversFinalSlot === false) return t;
    } catch (e) { /* weiter */ }
  }
  return null;
}

const INTRA = join(root, "quant", "data", "market", "intraday");
const tage = existsSync(INTRA)
  ? readdirSync(INTRA).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
  : [];
if (!tage.length) { console.error("ABBRUCH: keine Intraday-Daten."); process.exit(1); }
const letzterTag = tage[tage.length - 1];
const ordner = join(INTRA, letzterTag);

const scopeDatei = join(root, "discover", "data", "live-scope", "US_REAL.json");
const scope = existsSync(scopeDatei) ? JSON.parse(readFileSync(scopeDatei, "utf8")).symbols || [] : [];

/* Deterministisch zufaellig: dieselbe Stichprobe bei jedem Lauf, damit ein
   Befund reproduzierbar ist und nicht beim naechsten Mal verschwindet. */
function streuung(liste, n, saat) {
  const gewaehlt = [];
  let x = saat;
  const rest = liste.slice();
  while (gewaehlt.length < n && rest.length) {
    x = (x * 1103515245 + 12345) % 2147483648;
    gewaehlt.push(rest.splice(x % rest.length, 1)[0]);
  }
  return gewaehlt;
}
const kandidaten = scope.filter((t) => !PFLICHT.includes(t) &&
  existsSync(join(ordner, "ref_" + t + ".json")));
const teilweise = ersterUnvollstaendiger(scope, ordner);
const pflicht = teilweise && !PFLICHT.includes(teilweise) ? PFLICHT.concat([teilweise]) : PFLICHT.slice();
if (!teilweise) {
  console.log("  Hinweis: kein unvollstaendiger Titel im Umfang - die Regel-4-Pruefung");
  console.log("           laeuft heute ohne Fall. Das ist ein Zustand, kein Nachweis.\n");
}
const stichprobe = pflicht.concat(streuung(kandidaten.filter((t) => t !== teilweise), ZUFALL, 20260919));

const jetzt = Date.now();
const aufloesung = TradingSession.resolve
  ? TradingSession.resolve(jetzt, { calendar: kalender, exchange: "XNYS" })
  : null;
const lage = MarketHours.sessionAt(jetzt, { calendar: kalender, exchange: "XNYS" });

console.log("Quellzustand-Deckung auf dem ausgelieferten Stand");
console.log("  Sitzung: " + lage.phase + " " + lage.localTime + " New York, offen: " + lage.isOpen);
console.log("  Datenstand: " + letzterTag + "\n");

const befunde = [];
const zeilen = [];
const zaehler = {};

for (const ticker of stichprobe) {
  const pfad = join(ordner, "ref_" + ticker + ".json");
  if (!existsSync(pfad)) { befunde.push(`${ticker}: kein Snapshot ausgeliefert`); continue; }
  const snap = JSON.parse(readFileSync(pfad, "utf8"));
  /* Kein Strom: die Boerse ist beim Pruefen geschlossen, und erfundene
     Ticks waeren genau die Mock-Daten, die der Auftrag verbietet. */
  const q = SourceState.bestimme({ resolution: aufloesung, snapshot: snap, live: null, now: new Date(jetzt) });
  zaehler[q.state] = (zaehler[q.state] || 0) + 1;

  if (!SourceState.ZUSTAENDE.includes(q.state)) befunde.push(`${ticker}: unbekannter Zustand ${q.state}`);
  if (/Markt geöffnet · Live/.test(q.label) && q.state !== "REALTIME") {
    befunde.push(`${ticker}: "Markt geoeffnet - Live" ohne REALTIME (${q.state})`);
  }
  if (q.state === "FINAL_SESSION") {
    const behauptetSchluss = /Schluss (\d{2}:\d{2})/.exec(q.label);
    if (behauptetSchluss && !snap.coversFinalSlot) {
      befunde.push(`${ticker}: behauptet "Schluss ${behauptetSchluss[1]}", Reihe endet ${snap.lastRegularLocal}`);
    }
  }
  if (q.state !== "FINAL_SESSION" && q.isFrozen) befunde.push(`${ticker}: eingefroren ohne FINAL_SESSION`);
  if (q.state === "STALE" && /Schluss folgt/.test(q.label)) {
    befunde.push(`${ticker}: die abgeschaffte Vertroestung "Schluss folgt"`);
  }
  if (q.sourceText && /laufenden Kurs/.test(q.sourceText) && q.state !== "REALTIME") {
    befunde.push(`${ticker}: Quellenbezeichnung nennt den laufenden Kurs ohne REALTIME`);
  }
  zeilen.push({ ticker, state: q.state, reason: q.reason, label: q.label,
                sourceText: q.sourceText, lastRegularLocal: snap.lastRegularLocal || null,
                coversFinalSlot: !!snap.coversFinalSlot });
}

for (const z of zeilen) {
  console.log("  " + z.ticker.padEnd(7) + z.state.padEnd(15) +
              (z.lastRegularLocal || "--").padEnd(7) +
              (z.coversFinalSlot ? "voll " : "teil ") + '"' + z.label + '"');
}
console.log("\n  Zustaende: " + JSON.stringify(zaehler));

const ergebnis = {
  schemaVersion: "source-state-coverage-1.0.0",
  auftrag: "Owner 19.09.2026 Punkt 8: kein titelabhaengiger stiller Rueckfall",
  checkedAt: new Date().toISOString(),
  session: { phase: lage.phase, localTime: lage.localTime, isOpen: lage.isOpen },
  dataSession: letzterTag,
  pflichttitel: pflicht, unvollstaendigerFall: teilweise,
  zufallstitel: stichprobe.slice(pflicht.length),
  states: zaehler, rows: zeilen, findings: befunde,
  verdict: befunde.length ? "FAIL" : "PASS",
  note: befunde.length ? null
    : "Geprueft ohne Strom - die Boerse war geschlossen. Der REALTIME-Nachweis " +
      "gehoert an eine offene Sitzung und wird nicht mit erfundenen Ticks ersetzt."
};
const ziel = join(root, "quant", "data", "market", "commercial");
mkdirSync(ziel, { recursive: true });
writeFileSync(join(ziel, "source-state-coverage.json"), JSON.stringify(ergebnis, null, 2) + "\n");

console.log("");
if (befunde.length) {
  befunde.forEach((b) => console.log("  BEFUND: " + b));
  console.log("\nURTEIL: FAIL");
  process.exit(1);
}
console.log("URTEIL: PASS   " + zeilen.length + " Titel, kein stiller Rueckfall");
