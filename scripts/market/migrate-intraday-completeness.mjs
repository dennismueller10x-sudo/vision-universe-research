#!/usr/bin/env node
/* =========================================================================
   DIE WAHRHEIT UEBER DEN SCHLUSS NACHTRAGEN - OHNE EINE EINZIGE ANFRAGE

   Bis zum 19.09.2026 schrieb der Ingest `regularComplete = now >= close`:
   eine Aussage ueber die Uhr, nicht ueber die Reihe. Die bereits
   ausgelieferten Snapshots tragen diesen Wert, und die
   Unveraenderlichkeitsregel friert sie ein - ein neuer Lauf wuerde sie
   nicht mehr anfassen.

   Die fehlenden Felder stehen aber in den Dateien selbst. Dieses Skript
   leitet sie ab, deterministisch und ohne Provider:

     fetchedAfterClose  = der alte regularComplete. Genau das hat er
                          bedeutet: nach dem Schluss geholt.
     lastRegularLocal   = der letzte regulaere Punkt der Reihe.
     finalSlotLocal     = Schluss minus ein Intervall (Bars sind auf den
                          Bar-ANFANG gestempelt: 16:00 Schluss, 5 Minuten
                          -> letzter Slot 15:55).
     coversFinalSlot    = erreicht die Reihe diesen Slot?
     regularComplete    = beides zusammen.

   Es wird nichts erfunden und nichts geloescht. Wer vorher als komplett
   galt, obwohl seine Reihe um 15:40 endet, gilt danach als das, was er
   ist: abgeschlossen, aber ohne spaeten Handel.

   Aufruf: node scripts/market/migrate-intraday-completeness.mjs [--apply]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(root, "quant", "data", "market", "intraday");
const APPLY = process.argv.includes("--apply");

function minutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function uhr(min) {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}

if (!existsSync(DIR)) { console.log("Kein Intraday-Verzeichnis."); process.exit(0); }

const tage = readdirSync(DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
let geprueft = 0, ergaenzt = 0, entwertet = 0;
const beispiele = [];

for (const tag of tage) {
  const ordner = join(DIR, tag);
  for (const name of readdirSync(ordner).filter((n) => n.endsWith(".json"))) {
    const pfad = join(ordner, name);
    let snap;
    try { snap = JSON.parse(readFileSync(pfad, "utf8")); } catch (e) { continue; }
    if (!snap || !Array.isArray(snap.points)) continue;
    geprueft++;
    if (snap.coversFinalSlot !== undefined) continue;

    const intervall = parseInt(snap.interval || "5min", 10) || 5;
    const schlussMin = minutes(snap.closeLocal || snap.sessionCloseLocal || "16:00");
    const letzterSlot = schlussMin === null ? null : uhr(schlussMin - intervall);
    const letzte = snap.points.length ? String(snap.points[snap.points.length - 1][0]).slice(0, 5) : null;
    const deckt = !!(letzte && letzterSlot && letzte >= letzterSlot);
    const nachSchluss = !!snap.regularComplete;

    const vorher = snap.regularComplete;
    snap.fetchedAfterClose = nachSchluss;
    snap.coversFinalSlot = deckt;
    snap.lastRegularLocal = letzte;
    snap.finalSlotLocal = letzterSlot;
    snap.regularComplete = nachSchluss && deckt;

    if (vorher === true && snap.regularComplete === false) {
      entwertet++;
      if (beispiele.length < 8) beispiele.push(`${tag} ${snap.symbol || name}: letzter ${letzte}, Slot ${letzterSlot}`);
    }
    ergaenzt++;
    if (APPLY) writeFileSync(pfad, JSON.stringify(snap, null, 2) + "\n");
  }
}

console.log(`Snapshots geprueft: ${geprueft}`);
console.log(`Felder ergaenzt:    ${ergaenzt}${APPLY ? "" : " (Probelauf - nichts geschrieben)"}`);
console.log(`Davon verlieren den Anspruch "komplett": ${entwertet}`);
for (const b of beispiele) console.log("  " + b);
if (!APPLY) console.log("\nMit --apply schreiben.");
