#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — classify-rejections.mjs

   WER STEHT IM ABLEHNUNGSREGISTER, UND WARUM NOCH

   Am 18.09.2026 standen 6.831 von 6.876 Titeln im Register des
   EOD-Ingests - alle mit demselben Code, alle aus derselben Minute, alle
   fuer sieben Tage gesperrt. Kein Mensch hatte das entschieden, und
   niemand haette es gesehen: der Lauf meldete "erfolgreich".

   Dieses Skript macht das Register lesbar, bevor etwas daran geaendert
   wird. Es klassifiziert jeden Eintrag nach
   quant/engines/rejection-lifecycle.js (PERMANENT / TEMPORARY / STALE),
   zeigt Codes, Alter und Anzahl - und loescht auf Wunsch GENAU die
   Eintraege, die nach dieser Ordnung wieder faellig sind.

   Was strukturell und bestaetigt ist, bleibt stehen. Ein pauschales
   Loeschen des Registers gibt es hier nicht: es waere derselbe Fehler
   noch einmal, nur in die andere Richtung.

   Ausfuehren:
     node scripts/market/classify-rejections.mjs [--apply] [--json <pfad>]
       --apply   faellige Eintraege wirklich entfernen (sonst nur Bericht)
       --cache   Pfad der Arbeitsablage (Vorgabe .market-cache)
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Lifecycle = require(join(root, "quant", "engines", "rejection-lifecycle.js"));

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf("--" + n); return i === -1 ? d : args[i + 1]; };
const APPLY = args.includes("--apply");
const CACHE = arg("cache", join(root, ".market-cache"));
const OUT = arg("json", join(root, "quant", "data", "market", "commercial", "rejection-ledger.json"));
const STALE_MS = Number(arg("stale-days", "7")) * 86400000;

/* Die Checkpoints liegen je Lauf-Kennung in der Arbeitsablage des
   Anbieters - und zwar in einem eigenen Unterverzeichnis:
   quant/engines/market-store.js schreibt sie nach
   <ablage>/<anbieter>/checkpoints/<runId>.json.
 *
 * Bis zum 18.09.2026 hat dieses Skript eine Ebene zu hoch gesucht
 * (<ablage>/<anbieter>/checkpoint*.json) und deshalb in JEDEM Lauf
 * "kein Checkpoint" gemeldet - auch dann, wenn der Ingest im selben
 * Lauf ein Register mit 423 Eintraegen fuehrte. Der Bericht war leer,
 * und der Schritt "faellige Ablehnungen freigeben" hat nie eine
 * einzige freigegeben. Gruen gemeldet, nichts getan.
 *
 * Gesucht wird jetzt dort, wo der Erzeuger schreibt. Der alte Pfad
 * bleibt als zweiter Ort stehen, damit eine aeltere Arbeitsablage
 * nicht stillschweigend uebergangen wird. */
function checkpointDateien() {
  const orte = [join(CACHE, "tiingo", "checkpoints"), join(CACHE, "tiingo")];
  const gefunden = [];
  for (const dir of orte) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const voll = join(dir, f);
      if (!gefunden.includes(voll)) gefunden.push(voll);
    }
  }
  return gefunden;
}

const dateien = checkpointDateien();

const bericht = {
  schemaVersion: "rejection-ledger-1.0.0",
  auftrag: "Owner 18.09.2026 P0: Rejection-Checkpoint klassifizieren statt loeschen",
  checkedAt: new Date().toISOString(),
  applied: APPLY,
  staleAfterDays: STALE_MS / 86400000,
  /* Ohne Arbeitsablage gibt es kein Register. Das ist ein Zustand und
     kein Fehler - aber er gehoert in den Bericht, nicht in ein
     Schweigen. Vorher stieg das Skript hier aus, ohne die Datei zu
     schreiben; der Lauf 35366297664 war danach vollstaendig gruen und
     scheiterte trotzdem, weil `git add` die nie erzeugte Datei
     einsammeln sollte. Ein leeres Register ist eine Aussage. */
  checkpointsFound: dateien.length,
  files: []
};

let gesamtVorher = 0, gesamtFaellig = 0, gesamtBleibt = 0;

for (const datei of dateien) {
  const cp = JSON.parse(readFileSync(datei, "utf8"));
  const register = cp.rejected || {};
  const p = Lifecycle.pruefeRegister(register, { staleAfterMs: STALE_MS });

  /* Die aelteste und die juengste Ablehnung sagen, ob hier ein Ereignis
     stattgefunden hat oder ein Dauerzustand vorliegt. */
  const zeiten = Object.keys(register).map((id) => register[id].at).filter(Boolean).sort();
  const eintrag = {
    file: datei.replace(root + "/", ""),
    runId: cp.runId || null,
    total: p.total,
    byClass: p.byClass,
    byCode: p.byCode,
    retryDue: p.retry.length,
    keptBlocked: p.keep.length,
    oldest: zeiten[0] || null,
    newest: zeiten[zeiten.length - 1] || null,
    keptExamples: p.keep.slice(0, 10).map((id) => ({
      securityId: id, codes: p.entries[id].codes,
      class: p.entries[id].class, reason: p.entries[id].reason,
      at: register[id].at, confirmations: register[id].confirmations || 1
    }))
  };

  console.log("");
  console.log(eintrag.file + (cp.runId ? "  (" + cp.runId + ")" : ""));
  console.log("  Eintraege insgesamt: " + p.total);
  console.log("  aelteste Ablehnung:  " + (eintrag.oldest || "-"));
  console.log("  juengste Ablehnung:  " + (eintrag.newest || "-"));
  console.log("  nach Klasse:         " + JSON.stringify(p.byClass));
  console.log("  nach Code:           " + JSON.stringify(p.byCode));
  console.log("  wieder faellig:      " + p.retry.length);
  console.log("  bleibt gesperrt:     " + p.keep.length);
  for (const b of eintrag.keptExamples) {
    console.log("      " + b.securityId + "  " + b.class + "  " + b.codes.join(",") +
                "  (" + b.confirmations + "x, seit " + String(b.at).slice(0, 10) + ")");
  }

  if (APPLY && p.retry.length) {
    for (const id of p.retry) delete register[id];
    cp.rejected = register;
    writeFileSync(datei, JSON.stringify(cp, null, 2));
    console.log("  entfernt:            " + p.retry.length + " faellige Eintraege (geschrieben)");
    eintrag.removed = p.retry.length;
  }

  gesamtVorher += p.total; gesamtFaellig += p.retry.length; gesamtBleibt += p.keep.length;
  bericht.files.push(eintrag);
}

bericht.totals = { before: gesamtVorher, retryDue: gesamtFaellig, keptBlocked: gesamtBleibt,
                   removed: APPLY ? gesamtFaellig : 0 };

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bericht, null, 2) + "\n");

console.log("");
if (!dateien.length) {
  console.log("Kein Checkpoint unter " + join(CACHE, "tiingo") + " - kein Register, nichts zurueckgestellt.");
} else {
  console.log("Insgesamt: " + gesamtVorher + " Eintraege, " + gesamtFaellig + " wieder faellig, " +
              gesamtBleibt + " bleiben zurueckgestellt" + (APPLY ? " - faellige entfernt." : " (Probelauf)."));
}
console.log("Bericht: " + OUT.replace(root + "/", ""));
