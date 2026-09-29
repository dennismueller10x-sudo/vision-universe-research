/* =========================================================================
   VISION UNIVERSE — measure-pipeline-freshness.mjs
                                            (pipeline-freshness-1.0.0)

   EIN GRUENER MARKTLAUF IST KEIN BELEG DAFUER, DASS QUANT AKTUELL IST.

   Gemessen am 29.09.2026: `market-data-refresh` lief um 03:44 UTC gruen
   durch, schrieb 12.515 Dateien und veroeffentlichte frische Tageskurse.
   Der Stichtag, den das Frontend liest, stand trotzdem seit vier Tagen
   auf 2026-09-25. Grund: die Produkt-Materialisierung ist ein zweiter
   Workflow, der ueber `workflow_run` haette folgen sollen und auf main
   NIE gefeuert hat - beide Laeufe, die es je gab, waren von Hand.

   Das ist gefaehrlicher als ein roter Lauf. Ein roter Lauf alarmiert.
   Hier war jede Nacht alles gruen, waehrend der Produktstand stand.

   DIESE DATEI IST DIE ANTWORT DARAUF: sie trennt drei Zustaende, die
   vorher zu einem verschmolzen waren.

     MARKET_STORE_CURRENT            Die dauerhafte Ablage traegt die
                                     letzte abgeschlossene Sitzung.
     PRODUCT_MATERIALIZATION_CURRENT Die Produkt-Artefakte, die das
                                     Frontend liest, tragen sie auch.
     PRODUCTION_CURRENT              Und der ausgelieferte Stand ebenso.

   Jeder Zustand hat seinen eigenen Rueckstand in Handelssitzungen, nicht
   in Kalendertagen - sonst meldet jedes Wochenende einen Fehlalarm:

     STORE_LAG_SESSIONS
     PRODUCT_LAG_SESSIONS
     PRODUCTION_LAG_SESSIONS

   Zielzustand nach einer vollstaendigen Nachtkette: alle drei auf 0.

   WAS DIESE DATEI NICHT TUT

   Sie misst nicht, ob Workflows gruen sind. Genau das war der blinde
   Fleck. Sie misst Stichtage in Artefakten - und wo sie einen nicht
   lesen kann, sagt sie UNKNOWN statt eine Zahl zu erfinden. Ein
   UNKNOWN ist kein PASS.
   ========================================================================= */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TS = require(join(ROOT, "quant/engines/realtime/trading-session.js"));
const CAL = JSON.parse(readFileSync(join(ROOT, "quant/config/market-calendar.json"), "utf8"));

export const SCHEMA = "pipeline-freshness-1.0.0";

const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");
const NOW = (() => { const a = argv.find((x) => x.startsWith("--now=")); return a ? new Date(a.slice(6)) : new Date(); })();
const OUT = (() => {
  const a = argv.find((x) => x.startsWith("--out="));
  if (!a) return join(ROOT, "quant/data/product/pipeline-freshness-v1.json");
  const wert = a.slice(6);
  /* Ein absoluter Pfad ist absolut gemeint. `join(ROOT, "/tmp/x")` legte
     die Datei unter ROOT/tmp/x ab - ein Bericht am falschen Ort ist kein
     Bericht. */
  return wert.startsWith("/") ? wert : join(ROOT, wert);
})();

/* ---------------------------------------------------------------------
   DIE LETZTE ABGESCHLOSSENE SITZUNG.

   In Sitzungen zu rechnen statt in Tagen ist der ganze Unterschied
   zwischen einem Waechter, der montags anschlaegt, und einem, der jedes
   Wochenende schreit. Der Kalender kennt Feiertage; `resolve` sagt, wo
   wir gerade stehen. --------------------------------------------------- */
export function letzteSitzung(now = NOW) {
  const lage = TS.resolve(now, { calendar: CAL });
  /* `lastCompletedSession` ist die letzte Sitzung, die WIRKLICH zu Ende
     ist - nicht die laufende. Ein Tagesschluss darf nur ihren Stichtag
     tragen. Waehrend der Handelszeit steht sie deshalb auf gestern, und
     genau das verhindert, dass ein Waechter mittags Alarm schlaegt. */
  const s = lage && lage.lastCompletedSession;
  return (s && s.sessionDate) || null;
}

/** Die Boerse aus dem Kalender - XNYS, sonst die erste eingetragene. */
function boerse() {
  const ex = CAL.exchanges || {};
  return ex.XNYS || ex[Object.keys(ex)[0]] || null;
}

/** Abstand in HANDELSSITZUNGEN zwischen zwei ISO-Daten (a <= b). */
export function sitzungenZwischen(a, b) {
  if (!a || !b) return null;
  if (a === b) return 0;
  const ex = boerse();
  if (!ex) return null;
  let n = 0, cursor = a;
  /* Obergrenze, damit ein kaputter Kalender keine Endlosschleife baut. */
  for (let i = 0; i < 400 && cursor < b; i++) {
    cursor = TS.nextTradingDay(cursor, ex);
    if (!cursor) return null;
    n++;
  }
  /* Laeuft der Cursor ueber b hinaus, lag b selbst auf keinem Handelstag
     (etwa ein Stichtag vom Samstag). Dann ist der Abstand die Zahl der
     Schritte bis zum ersten Handelstag dahinter - nicht null. */
  return cursor >= b ? n : null;
}

/* ---------------------------------------------------------------------
   DIE VIER STICHTAGE. Jeder aus dem Artefakt, das ihn wirklich traegt -
   nicht aus einem Bericht ueber ihn. ---------------------------------- */

/**
 * Stichtag der dauerhaften Ablage.
 *
 * Gelesen aus dem, was der Marktlauf SELBST aus der Ablage gebaut hat:
 * `benchmark.last` in der Faktor-Zusammenfassung ist der letzte Balken
 * der Vergleichsreihe, also der Tagesschluss, den die Ablage zum
 * Zeitpunkt des Laufs hergab. Das ist die ehrlichste im Baum lesbare
 * Auskunft ueber die Ablage - die Ablage selbst liegt in R2 und ist von
 * hier aus nicht erreichbar.
 *
 * Der Intraday-Index ist ausdruecklich NICHT die Quelle: er traegt den
 * Snapshot-Strom, nicht den Tagesschluss, und er ist regelmaessig einen
 * Tag weiter. Wer ihn nimmt, misst die Ablage zu frisch und uebersieht
 * genau den Rueckstand, um den es hier geht.
 */
export function storeAsOf(root = ROOT) {
  const p = join(root, "quant/data/market/factors/factors-FULL_UNIVERSE-summary.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    const d = j.benchmark && j.benchmark.last;
    return d ? String(d).slice(0, 10) : null;
  } catch { return null; }
}

/** Stichtag der Produkt-Artefakte: die Shards, die das Frontend liest. */
export function productAsOf(root = ROOT) {
  const dir = join(root, "quant/data/product/factor-evidence-v1");
  if (!existsSync(dir)) return null;
  const dateien = readdirSync(dir).filter((f) => f.endsWith(".json.gz") && !f.startsWith("screening"));
  if (!dateien.length) return null;
  /* Der aelteste Shard bestimmt den Stand. Ein Mittelwert oder ein
     Maximum wuerde eine halbe Materialisierung als fertig ausweisen. */
  let aeltester = null;
  for (const f of dateien.slice(0, 40)) {
    try {
      const j = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
      const d = j.asOf ? String(j.asOf).slice(0, 10) : null;
      if (!d) continue;
      if (!aeltester || d < aeltester) aeltester = d;
    } catch { /* ein unlesbarer Shard ist kein Stichtag */ }
  }
  return aeltester;
}

/**
 * Stichtag des AUSGELIEFERTEN Stands.
 *
 * Aus einem gebauten Release messbar (--release=<pfad>). Ohne Release
 * bleibt der Wert UNKNOWN - und UNKNOWN ist kein PASS. Einen
 * Produktionsstand aus dem Repository zu behaupten waere genau die
 * Gleichsetzung, die diesen P0 verursacht hat.
 */
export function deployedAsOf(releaseRoot) {
  if (!releaseRoot) return null;
  return productAsOf(releaseRoot);
}

export function messen(opts = {}) {
  const now = opts.now || NOW;
  const sitzung = letzteSitzung(now);
  const store = storeAsOf(opts.root || ROOT);
  const product = productAsOf(opts.root || ROOT);
  const deployed = deployedAsOf(opts.release);

  const lag = (wert) => (wert && sitzung ? sitzungenZwischen(wert, sitzung) : null);
  const storeLag = lag(store), productLag = lag(product), deployedLag = lag(deployed);

  const zustand = (l) => (l === null ? "UNKNOWN" : l === 0 ? "CURRENT" : "BEHIND");

  const bericht = {
    schemaVersion: SCHEMA,
    generatedAtUtc: new Date().toISOString(),
    LATEST_MARKET_SESSION: sitzung,
    LATEST_DURABLE_STORE_ASOF: store,
    LATEST_PRODUCT_ASOF: product,
    LATEST_DEPLOYED_PRODUCT_ASOF: deployed,
    STORE_LAG_SESSIONS: storeLag,
    PRODUCT_LAG_SESSIONS: productLag,
    PRODUCTION_LAG_SESSIONS: deployedLag,
    MARKET_STORE_CURRENT: zustand(storeLag),
    PRODUCT_MATERIALIZATION_CURRENT: zustand(productLag),
    PRODUCTION_CURRENT: zustand(deployedLag),
  };

  /* DER SATZ, DER VORHER GEFEHLT HAT. Ein gruener Marktlauf allein darf
     nicht mehr wie ein aktueller Produktstand aussehen. */
  bericht.QUANT_CURRENT = (bericht.MARKET_STORE_CURRENT === "CURRENT"
    && bericht.PRODUCT_MATERIALIZATION_CURRENT === "CURRENT") ? "PASS" : "FAIL";
  bericht.headline = bericht.QUANT_CURRENT === "PASS"
    ? "Ablage und Produktstand tragen die letzte abgeschlossene Sitzung (" + sitzung + ")."
    : "Der Produktstand traegt die letzte abgeschlossene Sitzung NICHT."
      + (store && product && store !== product
        ? " Ablage steht auf " + store + ", Produkt auf " + product + " - die Materialisierung fehlt."
        : "");
  return bericht;
}

if (process.argv[1] && process.argv[1].endsWith("measure-pipeline-freshness.mjs")) {
  const releaseArg = argv.find((x) => x.startsWith("--release="));
  const bericht = messen({ release: releaseArg ? releaseArg.slice(10) : null });

  const z = (k) => String(bericht[k]).padEnd(9);
  console.log("\nPIPELINE-FRISCHE · " + SCHEMA + "\n");
  console.log("  Letzte abgeschlossene Sitzung   " + (bericht.LATEST_MARKET_SESSION || "unbekannt"));
  console.log("  Dauerhafte Ablage               " + (bericht.LATEST_DURABLE_STORE_ASOF || "unbekannt")
    + "   Rueckstand " + (bericht.STORE_LAG_SESSIONS ?? "?") + "   " + z("MARKET_STORE_CURRENT"));
  console.log("  Produkt-Materialisierung        " + (bericht.LATEST_PRODUCT_ASOF || "unbekannt")
    + "   Rueckstand " + (bericht.PRODUCT_LAG_SESSIONS ?? "?") + "   " + z("PRODUCT_MATERIALIZATION_CURRENT"));
  console.log("  Ausgelieferter Stand            " + (bericht.LATEST_DEPLOYED_PRODUCT_ASOF || "nicht gemessen")
    + "   Rueckstand " + (bericht.PRODUCTION_LAG_SESSIONS ?? "?") + "   " + z("PRODUCTION_CURRENT"));
  console.log("\n  QUANT_CURRENT = " + bericht.QUANT_CURRENT);
  console.log("  " + bericht.headline + "\n");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bericht, null, 2) + "\n");
  console.log("  Bericht: " + OUT + "\n");

  /* FAIL CLOSED. Mit --strict ist ein nicht aktueller Produktstand ein
     Fehlschlag und keine Notiz - sonst liest ihn wieder niemand. */
  if (STRICT && bericht.QUANT_CURRENT !== "PASS") {
    console.error("P0_DATA_PIPELINE_FROZEN: " + bericht.headline);
    process.exit(2);
  }
}
