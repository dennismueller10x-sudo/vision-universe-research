#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — run-pacemaker.mjs

   EIN LAUF HAELT DEN TAKT, STATT 78 LAEUFE AUF IHN ZU HOFFEN

   Der Vorfall, der dieses Skript begruendet, steht in
   quant/engines/realtime/pacemaker.js. Kurz: der Fuenf-Minuten-Zeitplan
   erzeugte ueber eine Stunde lang keinen einzigen Lauf, und niemand
   merkte es, weil ein nicht angelegter Lauf nirgends auftaucht.

   Dieses Skript ist der Koerper zur Regel. Es holt selbst nichts: jeder
   Zyklus ruft ingest-intraday.mjs auf - denselben Weg, ueber den
   Intraday-Daten seit jeher in dieses Repository kommen. Es gibt keine
   zweite Quelle, keinen zweiten Normalizer und keinen zweiten Vertrag.

   WAS ZEITKRITISCH IST UND WAS NICHT

   Zeitkritisch ist genau das, was zwischen dem Anbieter und der
   Consumer-Ansicht liegt: holen, schreiben, committen, pushen. Alles
   andere - Capability-Matrix, Produktfaehigkeiten, Verifier - beschreibt
   den Bestand, statt ihn zu aktualisieren. Es lief bisher in jedem der 78
   Laeufe mit und laeuft jetzt einmal am Blockende.

   DAS ZYKLUSREGISTER

   Jeder Zyklus schreibt seine Zeitstempel mit. Nicht zur Zierde: der
   Produktionsnachweis verlangt, dass jeder Schritt vom Ausloeser bis zum
   Browser eine gemessene Zahl hat. Wer das erst hinterher aus Protokollen
   zusammensucht, misst, was er finden kann, statt was er wissen wollte.

   Aufruf:
     node scripts/market/run-pacemaker.mjs [--interval-ms=300000]
                                           [--block-max-ms=...]
                                           [--max-cycles=N]   (Tests)
                                           [--no-push]        (Tests)
   ========================================================================= */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");
const Pacemaker = require(join(engines, "realtime", "pacemaker.js"));
const TradingSession = require(join(engines, "realtime", "trading-session.js"));
const CALENDAR = require(join(root, "quant", "config", "market-calendar.json"));

const arg = (name, fallback) => {
  const t = process.argv.find((a) => a.startsWith("--" + name + "="));
  return t ? t.split("=").slice(1).join("=") : fallback;
};
const flag = (name) => process.argv.includes("--" + name);

const INTERVAL_MS = parseInt(arg("interval-ms", "300000"), 10);
const BLOCK_MAX_MS = parseInt(arg("block-max-ms", String(Pacemaker.BLOCK_MAX_MS)), 10);
const MAX_CYCLES = parseInt(arg("max-cycles", "0"), 10) || Infinity;
const SCOPE = arg("scope", "discover");
const PUSH = !flag("no-push");
const BRANCH = process.env.GITHUB_REF_NAME || "main";

const STATUS = join(root, "quant", "data", "market", "intraday", "status.json");
const LEDGER = join(root, "quant", "data", "market", "intraday", "pacemaker-ledger.json");

/* Die Pfade, die ein Zyklus anfasst. Bewusst eng: `git add -A` wuerde
   fremde Arbeit mitnehmen, die zwischen zwei Zyklen auf demselben Branch
   gelandet ist. */
const ZYKLUS_PFADE = [
  "quant/data/market/intraday",
  "quant/data/market/freshness",
  "quant/data/market/commercial/intraday-delivery-watchdog.json"
];
/* Was nach dem Block nachgezogen wird - nicht in jedem Zyklus. */
const BLOCK_PFADE = [
  "quant/data/market/capabilities",
  "quant/data/product/capabilities-v1.json",
  "quant/data/product/capabilities-summary-v1.json"
];

function jetzt() { return Date.now(); }
function iso(ms) { return new Date(ms).toISOString(); }

function lauf(befehl, argumente, opts) {
  const r = spawnSync(befehl, argumente, {
    cwd: root, stdio: "inherit", encoding: "utf8", ...(opts || {})
  });
  return r.status === 0;
}
function leise(befehl, argumente) {
  const r = spawnSync(befehl, argumente, { cwd: root, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function lies(pfad) {
  if (!existsSync(pfad)) return null;
  try { return JSON.parse(readFileSync(pfad, "utf8")); } catch (e) { return null; }
}
function ledgerLesen() { return lies(LEDGER); }

/* Das Register wird fortgeschrieben, nicht ersetzt: der
   Produktionsnachweis braucht DREI AUFEINANDERFOLGENDE Zyklen, und die
   entstehen ueber mehrere Blocks hinweg. Behalten wird ein Tag. */
function ledgerSchreiben(zyklen, block) {
  const alt = ledgerLesen();
  const grenze = jetzt() - 24 * 3600000;
  const bisher = (alt && Array.isArray(alt.cycles) ? alt.cycles : [])
    .filter((c) => Date.parse(c.triggerAt || 0) > grenze);

  /* Ein Zyklus wird ZWEIMAL geschrieben: einmal vor dem Commit, damit er
     in demselben Commit landet wie die Daten, die er beschreibt - und
     einmal im naechsten Durchgang, wenn Commit-, Push- und
     Waechterzeitpunkt feststehen. Ohne Zusammenfuehrung stuende jeder
     Zyklus zweimal im Register, einmal halb und einmal ganz. Genau das
     stand um 15:16 darin.
     Zusammengefuehrt wird ueber Lauf und Nummer; der spaetere Eintrag
     gewinnt, weil er mehr weiss. */
  const nach = new Map();
  for (const c of bisher.concat(zyklen)) {
    nach.set((c.runId || "-") + "#" + c.cycle, Object.assign(nach.get((c.runId || "-") + "#" + c.cycle) || {}, c));
  }
  const inhalt = {
    schemaVersion: "intraday-pacemaker-ledger-1.1.0",
    note: "Zeitstempel je Zyklus. Keine Kurse - nur Uhrzeiten, Zahlen und Gruende.",
    block,
    updatedAt: new Date().toISOString(),
    cycles: Array.from(nach.values())
      .sort((a, b) => Date.parse(a.triggerAt || 0) - Date.parse(b.triggerAt || 0))
      .slice(-200)
  };
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(inhalt, null, 2) + "\n");
}

function statusLesen() {
  if (!existsSync(STATUS)) return null;
  try { return JSON.parse(readFileSync(STATUS, "utf8")); } catch (e) { return null; }
}

function gitEinrichten() {
  leise("git", ["config", "user.name", "vision-universe-bot"]);
  leise("git", ["config", "user.email", "actions@users.noreply.github.com"]);
}

/**
 * Committen und pushen - oder ehrlich melden, dass es nichts gab.
 * Rueckgabe traegt die Zeitstempel, die der Nachweis verlangt.
 */
function veroeffentlichen(pfade, nachricht) {
  const t = { addAt: null, commitAt: null, pushAt: null, sha: null, changed: false };
  t.addAt = iso(jetzt());
  for (const p of pfade) {
    if (existsSync(join(root, p))) leise("git", ["add", "--", p]);
  }
  const bereit = leise("git", ["diff", "--cached", "--quiet"]);
  if (bereit.ok) return t;                       /* nichts veraendert */
  t.changed = true;
  if (!leise("git", ["commit", "-m", nachricht]).ok) return t;
  t.commitAt = iso(jetzt());
  t.sha = leise("git", ["rev-parse", "HEAD"]).out.slice(0, 10);
  if (PUSH) {
    const ok = lauf("scripts/ci/push-with-retry.sh", [BRANCH]);
    t.pushAt = iso(jetzt());
    t.pushed = ok;
  }
  return t;
}

/* ------------------------------------------------------------------ Lauf */

const blockStart = jetzt();
const block = {
  startedAt: iso(blockStart),
  runId: process.env.GITHUB_RUN_ID || null,
  runNumber: process.env.GITHUB_RUN_NUMBER || null,
  trigger: process.env.GITHUB_EVENT_NAME || "lokal",
  intervalMs: INTERVAL_MS,
  blockMaxMs: BLOCK_MAX_MS,
  branch: BRANCH
};

console.log("TAKTGEBER");
console.log("  Block beginnt " + block.startedAt + ", Takt " + (INTERVAL_MS / 1000) + " s, " +
            "hoechstens " + Math.round(BLOCK_MAX_MS / 60000) + " min");
console.log("  Ausloeser: " + block.trigger + (block.runId ? " (Lauf " + block.runId + ")" : ""));

if (PUSH) gitEinrichten();

const zyklen = [];
let fehlerInFolge = 0;
let nummer = 0;
let grund = "unbestimmt";

while (nummer < MAX_CYCLES) {
  const n = jetzt();
  const lage = TradingSession.resolve(new Date(n), { calendar: CALENDAR });
  const entscheidung = Pacemaker.entscheide({
    nowMs: n,
    marketState: lage.marketState,
    blockStartMs: blockStart,
    blockMaxMs: BLOCK_MAX_MS,
    nextOpenMs: lage.nextOpen ? Date.parse(lage.nextOpen) : null,
    intervalMs: INTERVAL_MS,
    fehlerInFolge
  });

  if (entscheidung.action === "stop") { grund = entscheidung.reason; break; }

  if (entscheidung.action === "wait") {
    const s = Math.round(entscheidung.waitMs / 1000);
    console.log("\n  " + lage.localTime + " New York · " + lage.marketState +
                " - warten bis zur Eroeffnung (" + s + " s, " + entscheidung.reason + ")");
    await new Promise((r) => setTimeout(r, entscheidung.waitMs + 60000));
    continue;
  }

  /* ---------------------------------------------------------- ein Zyklus */
  nummer++;
  const zyklus = {
    cycle: nummer,
    runId: block.runId,
    triggerAt: iso(n),
    marketStateAtTrigger: lage.marketState,
    localTimeAtTrigger: lage.localTime,
    fetchStartAt: null, fetchEndAt: null,
    session: null, written: null, requests: null, notPublishable: null,
    addAt: null, commitAt: null, pushAt: null, sha: null, changed: false,
    ok: false, reason: null
  };
  console.log("\n=== Zyklus " + nummer + " · " + lage.localTime + " New York · " + lage.marketState + " ===");

  zyklus.fetchStartAt = iso(jetzt());
  const geholt = lauf(process.execPath, ["scripts/market/ingest-intraday.mjs", "--scope=" + SCOPE], {
    env: { ...process.env }
  });
  zyklus.fetchEndAt = iso(jetzt());

  /* Nur den Bericht DIESES Zyklus lesen. Der erste Rauchtest am
     21.09.2026 meldete "8 geschrieben" fuer einen Zyklus, der gar nichts
     geholt hatte - status.json lag noch vom Lauf davor da. Eine Zahl aus
     einer fremden Messung ist schlimmer als keine: sie sieht aus wie ein
     Beleg. Der Zeitstempel muss aus diesem Zyklus stammen. */
  const st = statusLesen();
  const ausDiesemZyklus = st && st.generatedAt &&
    Date.parse(st.generatedAt) >= Date.parse(zyklus.fetchStartAt);
  if (ausDiesemZyklus && st.summary) {
    zyklus.session = st.session ? st.session.sessionDate : null;
    zyklus.written = st.summary.written;
    zyklus.requests = st.summary.requests;
    zyklus.notPublishable = st.summary.notPublishable;
    zyklus.snapshotAt = st.generatedAt;
  } else if (st) {
    zyklus.reason = "statusberichtNichtAusDiesemZyklus";
  }

  if (!geholt) {
    fehlerInFolge++;
    zyklus.reason = "ingestFehlgeschlagen";
    console.log("  Zyklus " + nummer + ": Ingest fehlgeschlagen (" + fehlerInFolge + " in Folge)");
  } else {
    fehlerInFolge = 0;
    zyklus.ok = true;
    const nachricht = "Intraday-Takt " + nummer + ": " + SCOPE + " (" +
      (zyklus.session || "?") + " " + lage.marketState + ", " +
      (zyklus.written === null ? "?" : zyklus.written) + " geschrieben, " +
      (zyklus.requests === null ? "?" : zyklus.requests) + " Anfragen)";
    /* Das Register gehoert in denselben Commit wie die Daten, die es
       beschreibt. Sonst beschreibt es einen Stand, der noch nicht da ist. */
    ledgerSchreiben(zyklen.concat([zyklus]), block);
    Object.assign(zyklus, veroeffentlichen(ZYKLUS_PFADE, nachricht));
  }

  /* Der Waechter im eigenen Takt. Das ist der Kontrollpfad, der NICHT am
     GitHub-Zeitplan haengt: solange ein Block laeuft, prueft er sich
     selbst - inklusive der Frage, ob der Browser den Stand auch bekommt.
     Was er allein nicht finden kann, ist "es laeuft gar kein Block";
     dafuer steht der externe Wecker aus (Owner-Entscheidung). */
  const wacht = leise(process.execPath,
    ["scripts/market/assert-intraday-delivery.mjs", "--quiet"]);
  const wurteil = lies(join(root, "quant", "data", "market", "commercial",
                            "intraday-delivery-watchdog.json"));
  zyklus.watchdog = wurteil ? { verdict: wurteil.verdict,
                                codes: (wurteil.findings || []).map((f) => f.code) } : null;

  zyklen.push(zyklus);
  console.log("  Zyklus " + nummer + ": " + (zyklus.ok ? "ok" : "FEHLER") +
              (zyklus.changed ? ", committet " + zyklus.sha : ", nichts Neues") +
              (zyklus.watchdog ? " · Waechter " + zyklus.watchdog.verdict : ""));

  const fertigMs = jetzt();
  const warten = Pacemaker.wartezeit(fertigMs, INTERVAL_MS, fertigMs - n);
  if (nummer >= MAX_CYCLES) { grund = "maxCycles"; break; }
  console.log("  naechster Takt in " + Math.round(warten / 1000) + " s");
  await new Promise((r) => setTimeout(r, warten));
}

/* ------------------------------------------------- nicht zeitkritisch */
console.log("\nBlockende (" + grund + "). Nachgelagerte Arbeit:");
if (zyklen.some((z) => z.changed)) {
  lauf(process.execPath, ["scripts/market/build-capability-matrix.mjs"]);
  lauf(process.execPath, ["scripts/vu2/build-product-capabilities.mjs"]);
  ledgerSchreiben([], Object.assign({}, block, { endedAt: iso(jetzt()), reason: grund, cycles: nummer }));
  veroeffentlichen(BLOCK_PFADE.concat(["quant/data/market/intraday/pacemaker-ledger.json"]),
                   "Intraday-Takt: Faehigkeiten nach " + nummer + " Zyklen nachgezogen");
} else {
  console.log("  Kein Zyklus hat etwas veraendert - nichts nachzuziehen.");
  ledgerSchreiben([], Object.assign({}, block, { endedAt: iso(jetzt()), reason: grund, cycles: nummer }));
}

console.log("\nZyklen: " + nummer + " · Grund fuer das Ende: " + grund);
for (const z of zyklen) {
  console.log("  " + String(z.cycle).padStart(2) + "  " + z.localTimeAtTrigger +
              "  " + (z.written === null ? "?" : String(z.written)).padStart(4) + " geschrieben" +
              "  " + (z.changed ? z.sha : "-"));
}
if (grund === "zuVieleFehlerInFolge") process.exit(1);
