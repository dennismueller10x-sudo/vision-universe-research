#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — assert-intraday-delivery.mjs

   SIEHT EIN MENSCH GERADE DEN STAND, DEN ER SEHEN SOLLTE?

   Am 21.09.2026 meldete jede einzelne Stufe Erfolg, waehrend die Seite
   eine Stunde lang den Freitag zeigte. Der letzte Lauf war gruen, das
   letzte Deployment war gruen, der letzte Snapshot war gueltig - es gab
   nur keinen neuen Lauf, und "kein Lauf" ist nirgends ein Fehlerzustand.

   Dieser Waechter prueft nicht Schritte, sondern die Kette. Er holt
   dafuer zwei Staende und vergleicht sie:

     1. was im Repository liegt   (quant/data/market/intraday/index.json)
     2. was der Browser bekommt   (dieselbe Datei auf der Domain)

   Der zweite Abruf ist der Punkt. Ohne ihn meldete der Waechter PASS,
   waehrend ein Mensch Freitag sieht - denn im Repository ist dann alles
   in Ordnung.

   UNABHAENGIGKEIT (Auftrag §16)

   Ein Waechter, der nur ueber denselben GitHub-Zeitplan laeuft, der
   ausgefallen ist, faellt mit ihm aus. Deshalb laeuft dieselbe Pruefung
   an drei Stellen:

     a) in jedem Zyklus des Taktgebers (haengt nicht am Zeitplan, weil
        der Block bereits laeuft - findet alles ausser "es laeuft gar
        kein Block")
     b) aus einem eigenen Zeitplan als Rueckfall (gleicher Failure Mode,
        hier ausdruecklich benannt)
     c) aus einem Cloudflare-Cron - der einzige wirklich unabhaengige
        Pfad. Er braucht ein GitHub-Token mit actions:write und steht
        als Owner-Entscheidung aus.

   Aufruf:
     node scripts/market/assert-intraday-delivery.mjs [--site=https://...]
                                                      [--strict] [--quiet]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");
const Watchdog = require(join(engines, "realtime", "delivery-watchdog.js"));
const TradingSession = require(join(engines, "realtime", "trading-session.js"));
const CALENDAR = require(join(root, "quant", "config", "market-calendar.json"));

const arg = (n, d) => {
  const t = process.argv.find((a) => a.startsWith("--" + n + "="));
  return t ? t.split("=").slice(1).join("=") : d;
};
const STRICT = process.argv.includes("--strict");
const QUIET = process.argv.includes("--quiet");
const SITE = (arg("site", "https://research.visionuniverse.de") || "").replace(/\/$/, "");
const INTERVAL_MS = parseInt(arg("interval-ms", "300000"), 10);

const INDEX = join(root, "quant", "data", "market", "intraday", "index.json");
const LEDGER = join(root, "quant", "data", "market", "intraday", "pacemaker-ledger.json");
const ZIEL = join(root, "quant", "data", "market", "commercial", "intraday-delivery-watchdog.json");

function lies(pfad) {
  if (!existsSync(pfad)) return null;
  try { return JSON.parse(readFileSync(pfad, "utf8")); } catch (e) { return null; }
}

/* Der ausgelieferte Stand. Fehlt er, ist das ein eigener Befund - nicht
   gemessen ist nicht dasselbe wie in Ordnung. */
async function geliefert() {
  if (!SITE) return { ok: false, reason: "keineDomain" };
  const url = SITE + "/quant/data/market/intraday/index.json?w=" + Date.now();
  try {
    const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return { ok: false, reason: "http" + r.status };
    const d = await r.json();
    return {
      ok: true,
      sessionDate: d.dataSession ? d.dataSession.sessionDate : null,
      asOfMs: d.dataSession && d.dataSession.asOf ? Date.parse(d.dataSession.asOf) : null,
      generatedAt: d.generatedAt || null
    };
  } catch (e) {
    return { ok: false, reason: String(e && e.message || e).slice(0, 120) };
  }
}

const jetzt = Date.now();
const lage = TradingSession.resolve(new Date(jetzt), { calendar: CALENDAR });
const index = lies(INDEX);
const ledger = lies(LEDGER);
const letzterZyklus = ledger && Array.isArray(ledger.cycles) && ledger.cycles.length
  ? ledger.cycles[ledger.cycles.length - 1] : null;

const ausgeliefert = await geliefert();

const snapshot = index && index.dataSession ? {
  sessionDate: index.dataSession.sessionDate,
  asOfMs: index.dataSession.asOf ? Date.parse(index.dataSession.asOf) : null
} : null;

/* Welche Sitzung JETZT gelten sollte - aus dem Resolver, nicht aus der
   Uhr. Bei offener Boerse ist das die laufende. */
const erwartet = lage.marketState === "OPEN" && lage.displaySession
  ? lage.displaySession.sessionDate : null;

const urteil = Watchdog.beurteile({
  nowMs: jetzt,
  marketState: lage.marketState,
  expectedSession: erwartet,
  snapshot,
  delivered: ausgeliefert.ok ? ausgeliefert : null,
  lastCycle: letzterZyklus,
  intervalMs: INTERVAL_MS
});

const bericht = {
  schemaVersion: "intraday-delivery-watchdog-1.0.0",
  auftrag: "Owner 21.09.2026 §15/§16: unabhaengiger Waechter der Intraday-Auslieferung",
  checkedAt: new Date(jetzt).toISOString(),
  site: SITE || null,
  session: { marketState: lage.marketState, localTime: lage.localTime, localDate: lage.localDate },
  delivered: ausgeliefert,
  verdict: urteil.verdict,
  findings: urteil.findings,
  facts: urteil.facts,
  note: "Keine Kurse - nur Sitzungsdaten, Uhrzeiten und Gruende."
};

mkdirSync(dirname(ZIEL), { recursive: true });
writeFileSync(ZIEL, JSON.stringify(bericht, null, 2) + "\n");

if (!QUIET) {
  console.log("Intraday-Auslieferung · " + lage.localTime + " New York · " + lage.marketState);
  console.log("  erwartete Sitzung   " + (erwartet || "-"));
  console.log("  im Repository       " + (urteil.facts.snapshotSession || "-") +
              (urteil.facts.snapshotAgeMinutes === null ? "" : "  (" + urteil.facts.snapshotAgeMinutes + " min alt)"));
  console.log("  ausgeliefert        " + (urteil.facts.deliveredSession ||
              ("nicht gemessen (" + (ausgeliefert.reason || "?") + ")")));
  console.log("  letzter Zyklus      " + (urteil.facts.lastCycleAgeMinutes === null
              ? "keiner" : "vor " + urteil.facts.lastCycleAgeMinutes + " min"));
  console.log("");
  for (const f of urteil.findings) console.log("  " + f.severity.padEnd(8) + f.text);
  console.log("\nURTEIL: " + urteil.verdict);
}

if (STRICT && urteil.verdict === "FAIL") process.exit(1);
