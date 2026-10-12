#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE DISCOVER — check-im-blick-live.mjs

   WURDE "IM BLICK" ZUM FAELLIGEN TERMIN NEU GERECHNET?

   Ein nicht gestarteter Workflow meldet keinen Fehler - es laeuft ja
   nichts, das ihn melden koennte. Dieses Skript fragt deshalb nicht den
   Workflow, sondern das Ergebnis: es liest discover/live/monitor-<U>.json
   (lokal oder von der veroeffentlichten Seite), ermittelt aus dem
   Boersenkalender, welcher Slot zuletzt faellig war, und vergleicht
   (discover/engines/refresh-plan.js, assess):

     RECOMPUTE_OVERDUE  faelliger Slot nicht veroeffentlicht,
                        und fuer den Slot lief KEIN Lauf      -> FAIL
     RECOMPUTE_LATE     faellig, noch nicht lange             -> WARN
     DATA_STALE         der Lauf fand statt, Kurse waren alt  -> WARN
     COMPUTE_ERROR      der Lauf fand statt, Fehler           -> WARN
     CALENDAR_OUT_OF_RANGE  Kalender deckt den Tag nicht ab   -> WARN (nie FAIL)

   Ausserhalb der Handelszeiten, an Feiertagen und nach dem Abendlauf bleibt
   es still: dort ist ein "ueberfaelliger" Slot nicht mehr aufholbar oder
   durch die Schlusskurse ersetzt.

   Aufruf: node scripts/discover/check-im-blick-live.mjs
             [--site=https://research.visionuniverse.de | --root=<dir>]
             [--now=ISO] [--strict]
     --strict   Exit 2 bei FAIL (der Workflow wird rot, GitHub benachrichtigt)
   Nicht erreichbar / nicht lesbar ist KEIN Alarm (kein Fehlalarm durch ein
   Netzproblem des Pruefers), steht aber in der Ausgabe.
   ========================================================================= */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RefreshPlan = require(join(ROOT, "discover", "engines", "refresh-plan.js"));
const CALENDAR = JSON.parse(readFileSync(join(ROOT, "quant", "config", "market-calendar.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (n, d) => { const hit = argv.find((a) => a.startsWith("--" + n + "=")); return hit ? hit.slice(n.length + 3) : d; };
const SITE = arg("site", null);
const DATA = arg("root", ROOT);
const U = arg("universe", "US_REAL");
const NOW = arg("now", null) ? new Date(arg("now")) : new Date();
const STRICT = argv.includes("--strict");
if (Number.isNaN(NOW.getTime())) { console.error("Ungueltiges --now (erwartet ISO 8601)."); process.exit(2); }

async function hole(pfad) {
  if (SITE) {
    const url = SITE.replace(/\/$/, "") + pfad + "?t=" + Math.floor(NOW.getTime() / 60000);
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + pfad);
    return res.json();
  }
  const datei = join(DATA, pfad);
  if (!existsSync(datei)) throw new Error("fehlt: " + pfad);
  return JSON.parse(readFileSync(datei, "utf8"));
}

let monitor = null, meta = null, lesefehler = null;
try { monitor = await hole("/discover/live/monitor-" + U + ".json"); } catch (e) { lesefehler = String(e.message || e); }
try { meta = await hole("/discover/data/meta.json"); } catch (e) { lesefehler = lesefehler || String(e.message || e); }
const eodAsOf = meta && Array.isArray(meta.universes) && meta.universes[0] ? meta.universes[0].asOf : null;

const zeilen = [];
let level = "OK";
if (lesefehler && !monitor) {
  /* Kein Monitor lesbar: ein Netzproblem oder eine Datei, die es noch nie gab.
     Nur im zweiten Fall ist das ein Befund; assess() entscheidet ueber FAIL,
     wenn ein Slot faellig ist und gar nichts veroeffentlicht wurde. */
  zeilen.push("Hinweis: Monitor nicht lesbar (" + lesefehler + ").");
  if (SITE && /HTTP (5\d\d|0)|fetch failed|timeout|aborted/i.test(lesefehler)) {
    zeilen.push("Netzproblem des Pruefers - kein Befund.");
    console.log(zeilen.join("\n"));
    process.exit(0);
  }
}
const r = RefreshPlan.assess(monitor, CALENDAR, { nowMs: NOW.getTime(), eodAsOf });
level = r.level;
zeilen.unshift("Im Blick live (" + U + "): " + level + " · Marktstatus " + r.plan.marketState +
  " · faelliger Slot " + (r.plan.due ? r.plan.due.id + " (vor " + r.plan.dueAgeMin + " Min.)" : "-") +
  " · naechster " + (r.plan.next ? r.plan.next.id + " " + r.plan.next.dueAt : "-") +
  " · Abendlauf-Stand " + (eodAsOf || "-"));
if (monitor && monitor.published) {
  zeilen.push("Veroeffentlicht: " + monitor.published.status + " · Slot " + (monitor.published.slot ? monitor.published.slot.id : "-") +
    " · Kursstand " + (monitor.published.asOf || "-") + " · berechnet " + monitor.published.generatedAt + " · " + monitor.published.selected + " Titel");
  if (monitor.lastRun) zeilen.push("Letzter Lauf: " + monitor.lastRun.startedAt + " · " + monitor.lastRun.event + "/" + monitor.lastRun.source + " · " + monitor.lastRun.result);
  if (monitor.lastSuccess) zeilen.push("Letzter Erfolg: " + monitor.lastSuccess.computedAt + " · Slot " + monitor.lastSuccess.slotId + " · Datenalter " + monitor.lastSuccess.dataAgeMinutes + " Min.");
}
for (const f of r.findings) {
  zeilen.push((f.level === "FAIL" ? "::error title=Im Blick " + f.code + "::" : "::warning title=Im Blick " + f.code + "::") + f.text);
}
console.log(zeilen.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, "#### Discover Im Blick - Pruefung\n```\n" + zeilen.filter((z) => !z.startsWith("::")).join("\n") + "\n```\n"); } catch { /* ohne Summary */ }
}
if (STRICT && level === "FAIL") process.exit(2);
