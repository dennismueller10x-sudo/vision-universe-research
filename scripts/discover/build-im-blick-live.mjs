#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE DISCOVER — build-im-blick-live.mjs

   "IM BLICK" WAEHREND DER SITZUNG NEU RECHNEN

   Die Eingangsflaeche kommt aus dem Abendlauf (Schlusskurse der letzten
   Sitzung). Waehrend der Sitzung schreibt der Intraday-Taktgeber alle fuenf
   Minuten Kurse fuer die Titel auf Discover-Flaechen
   (quant/data/market/intraday/<sitzung>/). Dieses Skript rechnet daraus
   die Auswahl neu - ohne eine einzige Anbieteranfrage:

     Basis   discover/data/im-blick/basis-<U>.json (Abendlauf, Schluss der
             Vorsitzung: Fuehrerschaft, RS, Trend, Schwankung, Schlusshoch)
     Kurs    letzter 5-Minuten-Punkt je Titel, Tageshoch aus den Punkten,
             previousClose aus dem Snapshot
     Engine  discover/engines/im-blick.js (scoreLive): intraday gibt es kein
             Schlusshoch, keinen Ausbruch und kein Volumen; die Karte sagt
             "im Tagesverlauf, Stand HH:MM, unbestaetigt"

   Zustaende (status):
     LIVE          Auswahl aus der laufenden oder gerade beendeten Sitzung
     NO_EVENTS     Sitzung laeuft, aber kein Titel erreicht den Mindestwert
     EOD_CURRENT   der Abendlauf deckt die juengste Sitzung bereits ab
                   (bestaetigte Schlusskurse haben Vorrang) oder es gibt
                   heute keine Sitzung
     EOD_STALE     die Basis ist nicht die Vorsitzung - dann waere das
                   Schlusshoch veraltet; ehrlich nichts statt falsch
     NO_INTRADAY   keine Snapshots der Sitzung

   Zusaetzlich (seit 12.10.2026):
     SESSION_CLOSED  die Sitzung ist beendet, der Abendlauf steht aus: die
                     Auswahl aus dem ganzen Tag, ausdruecklich NICHT "LIVE"
     INTRADAY_STALE  die Kursdaten sind fuer die Boersenlage zu alt
                     (Taktgeber/Anbieter) - keine Auswahl statt einer alten

   WANN ES RECHNET (discover/engines/refresh-plan.js)

   Der Lauf ist eine Fragestellung, kein Takt: er ermittelt den zuletzt
   faelligen Slot (ca. alle zwei Stunden, aus dem Boersenkalender) und rechnet
   nur, wenn dessen Ergebnis noch nicht veroeffentlicht ist. Ein verspaeteter
   oder doppelter Ausloeser aendert nichts (SKIP, keine Datei beruehrt). Ein
   aelteres Ergebnis ersetzt nie ein neueres; ein Fehler laesst die letzte
   gueltige Auswahl stehen. Daneben schreibt jede Rechnung
   discover/live/monitor-<U>.json (Plan, Lauf, Erfolg, Datenalter, Fehler).

   Europa: der Europa-Katalog fuehrt nur manuell veroeffentlichte
   Schlusskurse ohne Intraday-Quelle und ohne Rangfreigabe
   (core/registry/domains.json, europeDiscoverDisplay) - er ist nicht Teil
   dieser Rechnung.

   Aufruf: node scripts/discover/build-im-blick-live.mjs [--now <ISO>]
             [--data-root <dir>] [--out <datei>]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ImBlick = require(join(root, "discover", "engines", "im-blick.js"));
const Contract = require(join(root, "discover", "engines", "contract.js"));
const Identity = require(join(root, "core", "identity.js"));
const RefreshPlan = require(join(root, "discover", "engines", "refresh-plan.js"));
const TradingSession = require(join(root, "quant", "engines", "realtime", "trading-session.js"));
const CALENDAR = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));
const METHODOLOGY = JSON.parse(readFileSync(join(root, "discover", "methodology", "discover-v1.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const DATA = arg("data-root", root);
const U = arg("universe", "US_REAL");
const OUT = arg("out", join(root, "discover", "live", "im-blick-" + U + ".json"));
const NOW = arg("now", null) ? new Date(arg("now")) : new Date();
const MON = arg("monitor-out", join(dirname(OUT), "monitor-" + U + ".json"));
const FORCE = argv.includes("--force");
/* Wer hat diesen Lauf angestossen? Nur zur Beobachtung, nie zur Entscheidung. */
const TRIGGER = { event: arg("event", process.env.GITHUB_EVENT_NAME || "local"), source: arg("source", "unbekannt"), runId: process.env.GITHUB_RUN_ID || null };
const STARTED = new Date();
const SCHEMA = "discover-im-blick-live-1.1.0";
const MONITOR_SCHEMA = "discover-im-blick-monitor-1.0.0";
/* Ein Snapshot, der mehr als 45 Minuten hinter dem juengsten der Sitzung
   liegt, ist kein Stand dieser Stunde. */
const MAX_LAG_MS = 45 * 60000;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const lies = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

function vorsitzung(sessionDate) {
  /* Die Sitzung vor sessionDate: der Befund eine Minute vor ihrer Vorboerse. */
  const lage = TradingSession.resolve(new Date(Date.parse(sessionDate + "T08:00:00Z")), { calendar: CALENDAR });
  return lage.lastCompletedSession ? lage.lastCompletedSession.sessionDate : null;
}

/* Atomar: erst eine Nachbardatei, dann umbenennen - ein abgebrochener Lauf
   hinterlaesst nie eine halbe JSON-Datei. */
function schreibeAtomar(datei, payload) {
  mkdirSync(dirname(datei), { recursive: true });
  const tmp = datei + ".tmp-" + process.pid;
  writeFileSync(tmp, JSON.stringify(payload) + "\n");
  renameSync(tmp, datei);
}

const lage = TradingSession.resolve(NOW, { calendar: CALENDAR });
const basisDatei = join(DATA, "discover", "data", "im-blick", "basis-" + U + ".json");
const basis = lies(basisDatei);
const plan = RefreshPlan.planAt(NOW, CALENDAR);
const published = lies(OUT);
const decision = RefreshPlan.decide(plan, published, { nowMs: NOW.getTime(), basisAsOf: basis ? basis.asOf : null, schemaVersion: SCHEMA, force: FORCE });

/* Zusammenfassung fuer den Lauf (GitHub Step Summary, sonst Konsole). */
function zusammenfassung(zeilen) {
  const text = zeilen.join("\n") + "\n";
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) { try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, text); } catch { /* ohne Summary */ } }
}

if (decision.action === "SKIP") {
  /* Idempotent: nichts schreiben, nichts committen. */
  zusammenfassung(["### Discover Im Blick (Intraday) - nichts zu tun", "",
    "| Feld | Wert |", "|---|---|",
    "| Entscheidung | " + decision.reason + " |",
    "| Ausloeser | " + TRIGGER.event + " / " + TRIGGER.source + " |",
    "| Faelliger Slot | " + (plan.due ? plan.due.id + " (" + plan.due.dueAt + ")" : "-") + " |",
    "| Veroeffentlicht | " + (published ? (published.status + " · Slot " + (published.slot ? published.slot.id : "-") + " · Stand " + (published.asOf || "-")) : "-") + " |",
    "| Marktstatus | " + plan.marketState + " |"]);
  process.exit(0);
}

function berechne() {
  const kopf = {
    schemaVersion: SCHEMA, universeId: U, engineVersion: ImBlick.ENGINE_VERSION,
    basis: "INTRADAY", generatedAt: NOW.toISOString(), marketState: lage.marketState,
    slot: plan.due ? { id: plan.due.id, kind: plan.due.kind, sessionDate: plan.due.sessionDate, dueAt: plan.due.dueAt } : null,
    validUntil: RefreshPlan.validUntil(plan), computedAt: NOW.toISOString(), dataState: null,
    eodAsOf: basis ? basis.asOf : null, sessionDate: null, asOf: null, asOfLocal: null,
    rule: "Neu gerechnet aus 5-Minuten-Kursen (Tiingo IEX, verzoegert) gegen die Basis vom Schluss der Vorsitzung. " +
          "Intraday kein Schlusshoch, kein Ausbruch, kein Volumen; unbestaetigt bis zum Handelsschluss. " +
          "Nach dem Abendlauf gilt wieder die Auswahl aus den Schlusskursen.",
    coverage: { basis: basis ? basis.stocks.length : 0, withSnapshot: 0, stale: 0, missing: 0 },
    status: null, reason: null, stocks: []
  };
  const session = lage.displaySession ? lage.displaySession.sessionDate : null;
  kopf.sessionDate = session;
  if (!basis) return Object.assign(kopf, { status: "EOD_STALE", reason: "Keine EOD-Basis (" + basisDatei.replace(DATA + "/", "") + ")." });
  if (!session || session <= basis.asOf) {
    return Object.assign(kopf, { status: "EOD_CURRENT", reason: "Der Abendlauf deckt die juengste Sitzung ab (" + basis.asOf + ")." });
  }
  if (vorsitzung(session) !== basis.asOf) {
    return Object.assign(kopf, { status: "EOD_STALE",
      reason: "Basis " + basis.asOf + " ist nicht die Vorsitzung von " + session + " (" + vorsitzung(session) + ")." });
  }

  /* Snapshots der Sitzung. */
  const dir = join(DATA, "quant", "data", "market", "intraday", session);
  const staende = [];
  for (const b of basis.stocks) {
    let id;
    try { id = Identity.securityIdForTicker(b.s); } catch { kopf.coverage.missing++; continue; }
    const snap = lies(join(dir, id + ".json"));
    if (!snap || snap.sessionDate !== session || !Array.isArray(snap.points) || !snap.points.length) { kopf.coverage.missing++; continue; }
    const preise = snap.points.map((p) => p[1]).filter(isNum);
    if (!preise.length) { kopf.coverage.missing++; continue; }
    staende.push({ b, snap, live: { price: preise[preise.length - 1], dayHigh: Math.max(...preise), previousClose: snap.previousClose },
                   asOfMs: Date.parse(snap.asOf) });
  }
  if (!staende.length) return Object.assign(kopf, { status: "NO_INTRADAY", reason: "Keine Snapshots der Sitzung " + session + "." });
  const juengster = Math.max(...staende.map((x) => x.asOfMs).filter(isNum));
  const frisch = staende.filter((x) => isNum(x.asOfMs) && juengster - x.asOfMs <= MAX_LAG_MS &&
                                       isNum(x.live.previousClose) && isNum(x.b.close) &&
                                       /* Der Vortagesschluss des Snapshots muss der Basis entsprechen. */
                                       Math.abs(x.live.previousClose / x.b.close - 1) < 0.005);
  kopf.coverage.withSnapshot = staende.length;
  kopf.coverage.stale = staende.length - frisch.length;
  const asOfSnap = frisch.length ? frisch.reduce((a, x) => (x.asOfMs > a.asOfMs ? x : a)).snap : null;
  kopf.asOf = asOfSnap ? asOfSnap.asOf : null;
  kopf.asOfLocal = asOfSnap ? asOfSnap.asOfLocal || null : null;

  /* Datenalter gegen die Boersenlage: veraltete KURSE (Taktgeber, Anbieter)
     sind etwas anderes als eine ausgefallene Neuberechnung. */
  kopf.dataState = RefreshPlan.dataState(plan, kopf.asOf, NOW.getTime(), lage.displaySession);
  if (kopf.dataState.stale) {
    return Object.assign(kopf, { status: "INTRADAY_STALE",
      reason: "Kursstand " + (kopf.asOf || "unbekannt") + " ist fuer die Boersenlage " + lage.marketState + " zu alt (" + kopf.dataState.reason + ", " + kopf.dataState.ageMin + " Min.)." });
  }

  const cfg = Object.assign({}, METHODOLOGY.imBlick || {});
  const bewertet = frisch.map((x) => Object.assign(ImBlick.scoreLive(x.b, x.live, cfg), { snap: x.snap }));
  const auswahl = ImBlick.select(bewertet.filter((e) => e.admissible), { config: cfg });

  const karten = [];
  for (const e of auswahl) {
    const detail = lies(join(DATA, "discover", "data", "stocks", U, e.inputs.symbol + ".json"));
    if (!detail) continue;
    const ev = ImBlick.evidence(e, "INTRADAY");
    ev.asOf = e.snap.asOf; ev.asOfLocal = e.snap.asOfLocal || null; ev.sessionDate = session;
    karten.push(Object.assign(Contract.toCard(detail), {
      plain: detail.plain || null,
      headline: ImBlick.headline(e),
      reasons: ImBlick.reasons(e).map((r) => ({ id: r.id, label: r.label, value: r.value, hint: null })),
      imBlick: ev,
      live: { price: e.snap.points[e.snap.points.length - 1][1], previousClose: e.snap.previousClose,
              changePercent: Math.round(e.inputs.return1D * 1e6) / 1e4, asOf: e.snap.asOf, asOfLocal: e.snap.asOfLocal || null },
      hasPriceSeries: detail.priceSeries ? detail.priceSeries.status === "CALCULATED" : false,
      leadershipPercentile: detail.metrics ? detail.metrics.leadershipPercentile : null
    }));
  }
  /* Nach dem Schluss nie "LIVE": die Auswahl der beendeten Sitzung, unbestaetigt. */
  const offen = lage.marketState === "OPEN";
  if (!karten.length) return Object.assign(kopf, { status: "NO_EVENTS", reason: "Kein Titel erreicht im Tagesverlauf den Mindestwert " + (cfg.minScore || 40) + ".", stocks: [] });
  return Object.assign(kopf, { status: offen ? "LIVE" : "SESSION_CLOSED",
    reason: offen ? null : "Die Sitzung " + session + " ist beendet; bestaetigt wird die Auswahl erst vom Abendlauf aus den Schlusskursen.",
    stocks: karten });
}

const ergebnis = berechne();
const regel = RefreshPlan.mayReplace(published, ergebnis);
let veroeffentlicht = published;
if (regel.ok) { schreibeAtomar(OUT, ergebnis); veroeffentlicht = ergebnis; }

/* Fehlerbild: nur ein NICHT schluessiges Ergebnis ist ein Fehler. Dass eine
   aeltere Rechnung ausser Kraft bleibt, ist kein Fehler, sondern der Schutz. */
const schluessig = !!RefreshPlan.CONCLUSIVE[ergebnis.status];
const fehler = schluessig ? null : { code: ergebnis.status, message: ergebnis.reason };

/* Monitor: Plan, dieser Lauf, letzter Erfolg, was gerade veroeffentlicht ist. */
const vorher = lies(MON) || {};
const lauf = {
  startedAt: STARTED.toISOString(), finishedAt: new Date().toISOString(), event: TRIGGER.event, source: TRIGGER.source, runId: TRIGGER.runId,
  slotId: plan.due ? plan.due.id : null, decision: decision.reason, result: regel.ok ? (schluessig ? "PUBLISHED" : "PUBLISHED_INCONCLUSIVE") : regel.reason,
  status: ergebnis.status, stocks: ergebnis.stocks.length, asOf: ergebnis.asOf, dataAgeMinutes: ergebnis.dataState ? ergebnis.dataState.ageMin : null
};
const letzterErfolg = schluessig && regel.ok ? {
  computedAt: ergebnis.computedAt, slotId: plan.due ? plan.due.id : null, status: ergebnis.status, selected: ergebnis.stocks.length,
  asOf: ergebnis.asOf, dataAgeMinutes: ergebnis.dataState ? ergebnis.dataState.ageMin : null, dataState: ergebnis.dataState
} : (vorher.lastSuccess || null);
const monitor = {
  schemaVersion: MONITOR_SCHEMA, universeId: U, updatedAt: NOW.toISOString(), refreshPlanVersion: RefreshPlan.VERSION,
  plan: { lastDueSlot: plan.due, nextSlot: plan.next, marketState: plan.marketState },
  lastRun: lauf, lastSuccess: letzterErfolg,
  published: veroeffentlicht ? { status: veroeffentlicht.status, slot: veroeffentlicht.slot || null, sessionDate: veroeffentlicht.sessionDate,
    asOf: veroeffentlicht.asOf, generatedAt: veroeffentlicht.generatedAt, eodAsOf: veroeffentlicht.eodAsOf, selected: (veroeffentlicht.stocks || []).length,
    validUntil: veroeffentlicht.validUntil || null } : null,
  error: fehler,
  history: [lauf].concat(Array.isArray(vorher.history) ? vorher.history : []).slice(0, 20)
};
schreibeAtomar(MON, monitor);

const kurz = ergebnis.status + (ergebnis.stocks.length ? " · " + ergebnis.stocks.map((c) => c.symbol).join(", ") : "") + (ergebnis.reason ? " · " + ergebnis.reason : "");
console.log(`Im Blick live (${U}): ${kurz}`);
if (fehler) console.log(`::warning title=Im Blick ${fehler.code}::${fehler.message}`);
zusammenfassung(["### Discover Im Blick (Intraday)", "",
  "| Feld | Wert |", "|---|---|",
  "| Entscheidung | " + decision.reason + " |",
  "| Ausloeser | " + TRIGGER.event + " / " + TRIGGER.source + " |",
  "| Slot | " + (plan.due ? plan.due.id + " (faellig " + plan.due.dueAt + ", " + plan.dueAgeMin + " Min. her)" : "-") + " |",
  "| Ergebnis | " + ergebnis.status + " (" + lauf.result + ") |",
  "| Marktstatus | " + lage.marketState + " |",
  "| Kursstand | " + (ergebnis.asOf || "-") + " (Alter " + (lauf.dataAgeMinutes === null ? "-" : lauf.dataAgeMinutes + " Min.") + ") |",
  "| Ausgewaehlt | " + ergebnis.stocks.map((c) => c.symbol).join(", ") + " |",
  "| Abdeckung | " + JSON.stringify(ergebnis.coverage) + " |",
  "| Fehler | " + (fehler ? fehler.code + ": " + fehler.message : "-") + " |"]);
