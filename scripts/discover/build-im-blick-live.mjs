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

   Europa: der Europa-Katalog fuehrt nur manuell veroeffentlichte
   Schlusskurse ohne Intraday-Quelle und ohne Rangfreigabe
   (core/registry/domains.json, europeDiscoverDisplay) - er ist nicht Teil
   dieser Rechnung.

   Aufruf: node scripts/discover/build-im-blick-live.mjs [--now <ISO>]
             [--data-root <dir>] [--out <datei>]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ImBlick = require(join(root, "discover", "engines", "im-blick.js"));
const Contract = require(join(root, "discover", "engines", "contract.js"));
const Identity = require(join(root, "core", "identity.js"));
const TradingSession = require(join(root, "quant", "engines", "realtime", "trading-session.js"));
const CALENDAR = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));
const METHODOLOGY = JSON.parse(readFileSync(join(root, "discover", "methodology", "discover-v1.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const DATA = arg("data-root", root);
const U = arg("universe", "US_REAL");
const OUT = arg("out", join(root, "discover", "live", "im-blick-" + U + ".json"));
const NOW = arg("now", null) ? new Date(arg("now")) : new Date();
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

function schreibe(payload) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload) + "\n");
  console.log(`Im Blick live (${U}): ${payload.status}` + (payload.stocks.length ? " · " + payload.stocks.map((c) => c.symbol).join(", ") : "") +
              (payload.reason ? " · " + payload.reason : ""));
}

const lage = TradingSession.resolve(NOW, { calendar: CALENDAR });
const basisDatei = join(DATA, "discover", "data", "im-blick", "basis-" + U + ".json");
const basis = lies(basisDatei);
const kopf = {
  schemaVersion: "discover-im-blick-live-1.0.0", universeId: U, engineVersion: ImBlick.ENGINE_VERSION,
  basis: "INTRADAY", generatedAt: NOW.toISOString(), marketState: lage.marketState,
  eodAsOf: basis ? basis.asOf : null, sessionDate: null, asOf: null, asOfLocal: null,
  rule: "Neu gerechnet aus 5-Minuten-Kursen (Tiingo IEX, verzoegert) gegen die Basis vom Schluss der Vorsitzung. " +
        "Intraday kein Schlusshoch, kein Ausbruch, kein Volumen; unbestaetigt bis zum Handelsschluss. " +
        "Nach dem Abendlauf gilt wieder die Auswahl aus den Schlusskursen.",
  coverage: { basis: basis ? basis.stocks.length : 0, withSnapshot: 0, stale: 0, missing: 0 },
  status: null, reason: null, stocks: []
};

const session = lage.displaySession ? lage.displaySession.sessionDate : null;
kopf.sessionDate = session;
if (!basis) {
  schreibe(Object.assign(kopf, { status: "EOD_STALE", reason: "Keine EOD-Basis (" + basisDatei.replace(DATA + "/", "") + ")." }));
  process.exit(0);
}
if (!session || session <= basis.asOf) {
  schreibe(Object.assign(kopf, { status: "EOD_CURRENT", reason: "Der Abendlauf deckt die juengste Sitzung ab (" + basis.asOf + ")." }));
  process.exit(0);
}
if (vorsitzung(session) !== basis.asOf) {
  schreibe(Object.assign(kopf, { status: "EOD_STALE",
    reason: "Basis " + basis.asOf + " ist nicht die Vorsitzung von " + session + " (" + vorsitzung(session) + ")." }));
  process.exit(0);
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
if (!staende.length) {
  schreibe(Object.assign(kopf, { status: "NO_INTRADAY", reason: "Keine Snapshots der Sitzung " + session + "." }));
  process.exit(0);
}
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
schreibe(Object.assign(kopf, { status: karten.length ? "LIVE" : "NO_EVENTS",
  reason: karten.length ? null : "Kein Titel erreicht im Tagesverlauf den Mindestwert " + (cfg.minScore || 40) + ".",
  stocks: karten }));
