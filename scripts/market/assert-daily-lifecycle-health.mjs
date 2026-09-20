#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — assert-daily-lifecycle-health.mjs

   EIN TAGESLAUF, DER NICHTS GEFRAGT HAT, IST NICHT GRUEN

   Am 17. und 18.09.2026 meldete der Marktdaten-Refresh "success". Er
   hatte 45 von 6.876 Titeln geholt, 6.831 wegen alter Ablehnungen
   uebersprungen, und die Tageskurse standen drei Sitzungen zurueck. Kein
   Schritt war rot; niemand hatte etwas falsch gemacht. Genau das ist der
   Fehler: es gab keine Stelle, die "ueberwiegend nicht einmal gefragt"
   als Zustand kennt.

   Dieses Skript ist diese Stelle. Es liest, was der Lauf hinterlassen hat
   (quant/data/market/tiingo-status.json) und was die Frische sagt
   (quant/data/market/freshness/health.json), und faellt ein Urteil:

     PASS      Der ueberwiegende Teil des Universums wurde geprueft, und
               die Tageskurse stehen auf der letzten abgeschlossenen
               Sitzung.

     WARNING   Etwas stimmt nicht ganz - ein groesserer Teil wurde
               zurueckgestellt, oder die Kurse sind eine Sitzung zurueck.
               Sichtbar, aber kein Abbruch.

     FAIL      Der Lauf hat den ueberwiegenden Teil des updatefaehigen
               Universums nicht einmal gefragt, oder die Kurse sind
               mehrere Sitzungen zurueck. Der Fall vom 18.09.2026.

   Ausfuehren:
     node scripts/market/assert-daily-lifecycle-health.mjs [--strict]
       --strict  FAIL beendet mit Exit-Code 1 (fuer den Workflow)
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TradingSession = require(join(root, "quant", "engines", "realtime", "trading-session.js"));
const Health = require(join(root, "quant", "engines", "daily-lifecycle-health.js"));
const kalender = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const STATUS = join(root, "quant", "data", "market", "tiingo-status.json");
const FRESH = join(root, "quant", "data", "market", "freshness", "health.json");
const OUT = join(root, "quant", "data", "market", "commercial", "daily-lifecycle-health.json");

function lies(pfad) {
  if (!existsSync(pfad)) return null;
  try { return JSON.parse(readFileSync(pfad, "utf8")); } catch (err) { return null; }
}

const status = lies(STATUS);
const frische = lies(FRESH);

/* Wie viele abgeschlossene Sitzungen liegen zwischen dem Datenstand und
   heute? Gerechnet wird mit dem Kalender der Boerse, nicht mit
   Kalendertagen - ein Wochenende ist kein Rueckstand. */
function sitzungenZurueck(asOf) {
  if (!asOf) return null;
  const r = TradingSession.resolve(new Date(), { calendar: kalender, exchange: "XNYS" });
  const letzte = r && r.lastCompletedSession ? r.lastCompletedSession.sessionDate : null;
  if (!letzte) return null;
  if (asOf >= letzte) return 0;
  /* Gezaehlt werden Handelstage, keine Kalendertage: ein Wochenende ist
     kein Rueckstand. */
  let zahl = 0, tag = asOf;
  for (let i = 0; i < 60 && tag < letzte; i++) {
    tag = TradingSession.nextTradingDay(tag, { calendar: kalender, exchange: "XNYS" });
    if (!tag) break;
    zahl++;
  }
  return zahl;
}

const zusammenfassung = (status && status.summary) || {};
const universum = zusammenfassung.requested || 0;
const gefragt = (zusammenfassung.requests || 0);
const zurueckgestellt = zusammenfassung.skipped || 0;
/* Der Frischebericht traegt die Tageskurse unter `daily`; aeltere
   Fassungen schrieben dieselben Felder flach. Beides wird gelesen. */
const tages = (frische && (frische.daily || frische)) || {};
const asOf = tages.universeAsOf || null;
const erwartet = tages.expectedSession || null;
const tagesZustand = tages.state || null;
const rueckstand = sitzungenZurueck(asOf);

/* "Geprueft" heisst: der Lauf hat den Titel wirklich angesehen - entweder
   gefragt oder festgestellt, dass er aktuell ist. Zurueckgestellte Titel
   zaehlen ausdruecklich NICHT dazu; genau ihr stilles Verschwinden war
   der Fehler. */
const aktuellOhneAbruf = Math.max(0, (zusammenfassung.ok || 0) - 0);
const geprueft = Math.min(universum, gefragt + Math.max(0, aktuellOhneAbruf - gefragt));
const anteil = universum ? geprueft / universum : 0;

/* Das Urteil faellt die Engine - dieselbe Ordnung, die der Test prueft. */
const lage = {
  hasStatus: !!status,
  universe: universum,
  checked: geprueft,
  deferred: zurueckgestellt,
  requests: gefragt,
  openRejections: (status && status.rejectionLedger) ? status.rejectionLedger.offen : null,
  sessionsBehind: rueckstand,
  asOf: asOf,
  expectedSession: erwartet
};
const beurteilung = Health.beurteile(lage);
const urteil = beurteilung.verdict;
const gruende = beurteilung.reasons;
const register = (status && status.rejectionLedger) || null;

const bericht = {
  schemaVersion: "daily-lifecycle-health-1.0.0",
  auftrag: "Owner 18.09.2026 P0: ein Tageslauf, der den ueberwiegenden Teil des Universums " +
           "nicht einmal fragt, darf nicht gruen sein",
  checkedAt: new Date().toISOString(),
  verdict: urteil,
  reasons: gruende,
  universe: universum,
  checked: geprueft,
  checkedShare: Math.round(anteil * 1000) / 1000,
  deferred: zurueckgestellt,
  deferredByClass: zusammenfassung.deferredByClass || null,
  retriedAfterRejection: zusammenfassung.retriedAfterRejection || 0,
  recoveredAfterRejection: zusammenfassung.recoveredAfterRejection || 0,
  requests: gefragt,
  rejectionLedger: register,
  dailyAsOf: asOf,
  dailyState: tagesZustand,
  expectedSession: erwartet,
  sessionsBehind: rueckstand,
  thresholds: beurteilung.thresholds
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bericht, null, 2) + "\n");

console.log("Taeglicher Lebenszyklus der Marktdaten");
console.log("");
console.log("  Universum:            " + universum);
console.log("  geprueft:             " + geprueft + " (" + Math.round(anteil * 100) + " %)");
console.log("  zurueckgestellt:      " + zurueckgestellt +
            (bericht.deferredByClass ? "  " + JSON.stringify(bericht.deferredByClass) : ""));
console.log("  Anfragen:             " + gefragt);
console.log("  offene Ablehnungen:   " + (register ? register.open : "unbekannt"));
console.log("  Tageskurse Stand:     " + (asOf || "-") + (erwartet ? "  erwartet " + erwartet : ""));
console.log("  Sitzungen zurueck:    " + (rueckstand === null ? "-" : rueckstand));
console.log("");
for (const g of gruende) console.log("  - " + g);
console.log("");
console.log("URTEIL: " + urteil);
console.log("Bericht: " + OUT.replace(root + "/", ""));

if (STRICT && urteil === "FAIL") process.exit(1);
