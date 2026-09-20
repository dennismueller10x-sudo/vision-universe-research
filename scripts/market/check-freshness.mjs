/* =========================================================================
   VISION UNIVERSE — check-freshness.mjs

   HEALTH-CHECK: ZEIGT DIE SEITE DEN STAND, DEN SIE BEHAUPTET?

   Der Vorfall vom 15.09.2026: "Letzter Handelstag · Freitag", obwohl der
   Montag gehandelt war. Niemand hat es gemerkt, weil nichts gemessen hat,
   ob die ausgelieferten Reihen zur letzten abgeschlossenen Sitzung passen.
   Dieses Skript misst genau das - lokal (Repository) oder gegen die
   veroeffentlichte Seite (--site=https://research.visionuniverse.de):

     Intraday   quant/data/market/intraday/index.json: Datenstand
                (dataSession), Eintraege des Discover-Umfangs, Universums-
                deckung der letzten abgeschlossenen Sitzung
     Tageskurse discover/data/meta.json (asOf des Universums) und eine
                Stichprobe der kompakten Reihen (discover-series)

   Jede Reihe bekommt ihren Befund aus dem Freshness-Vertrag
   (quant/engines/realtime/freshness.js): LIVE, LAST_SESSION, STALE,
   UNAVAILABLE. Das Ergebnis steht in quant/data/market/freshness/health.json
   (keine Kurse, nur Zaehlungen und Gruende) und im Workflow-Summary.

   --strict   Exit 2, wenn ein Bereich STALE ist (Monitoring: der Workflow
              wird rot, GitHub benachrichtigt).
   --now=ISO  Zeitpunkt fuer Tests.
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const hit = argv.find((a) => a.startsWith(name + "=")); return hit ? hit.slice(name.length + 1) : fallback; };
const flag = (name) => argv.includes(name);

const root = arg("--root", DEFAULT_ROOT);
const SITE = arg("--site", null);
const STRICT = flag("--strict");
const NOW = arg("--now", null) ? new Date(arg("--now")) : new Date();
const SAMPLE = parseInt(arg("--sample", "40"), 10);
const OUT = join(root, "quant", "data", "market", "freshness", "health.json");

const TS = require(join(root, "quant", "engines", "realtime", "trading-session.js"));
const Freshness = require(join(root, "quant", "engines", "realtime", "freshness.js"));
const CAL = JSON.parse(readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));
const PREVIEW = JSON.parse(readFileSync(join(root, "quant", "config", "development-preview.json"), "utf8"));
const INTRADAY = PREVIEW.intraday || {};
const OPTIONS = Object.assign({ refreshMinutes: INTRADAY.refreshMinutes || 10 }, INTRADAY.freshness || {});

console.log("Vision Universe — Freshness-Check" + (SITE ? " gegen " + SITE : " (Repository)") + "\n");

async function lade(relPath) {
  if (SITE) {
    const url = SITE.replace(/\/$/, "") + "/" + relPath.replace(/^\//, "");
    const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.json();
  }
  const f = join(root, relPath);
  if (!existsSync(f)) throw new Error("fehlt: " + relPath);
  return JSON.parse(readFileSync(f, "utf8"));
}

const lage = TradingSession();
function TradingSession() { return TS.resolve(NOW, { calendar: CAL }); }
const last = lage.lastCompletedSession;
console.log(`  Jetzt: ${lage.now} = ${lage.localDate} ${lage.localTime} New York · ${lage.marketState}`);
console.log(`  Erwartet: letzte abgeschlossene Sitzung ${last ? last.sessionDate : "?"}` +
            (lage.marketState === "OPEN" ? `, laufende Sitzung ${lage.currentSession.sessionDate}` : ""));

const report = {
  schemaVersion: "freshness-health-1.0.0",
  contractVersion: Freshness.CONTRACT_VERSION,
  checkedAt: NOW.toISOString(), target: SITE || "repository",
  market: { state: lage.marketState, localDate: lage.localDate, localTime: lage.localTime,
            lastCompletedSession: last ? last.sessionDate : null,
            currentSession: lage.currentSession ? lage.currentSession.sessionDate : null,
            expectedIntradaySession: lage.marketState === "OPEN" ? lage.currentSession.sessionDate : (last ? last.sessionDate : null) },
  intraday: null, daily: null, overall: "OK", findings: [],
  note: "Health-Check des Freshness-Vertrags (quant/engines/realtime/freshness.js). Keine Kurse - nur Zustaende, Zaehlungen, Gruende."
};
const befund = (s, kind, id) => Freshness.assess({ resolution: lage, series: s, kind, now: NOW, calendar: CAL, options: OPTIONS, identity: id });

/* ---------------------------------------------------------- Intraday */
try {
  const idx = await lade("/quant/data/market/intraday/index.json");
  const entries = idx.entries || {};
  const befunde = Object.keys(entries).map((sym) => {
    const e = entries[sym];
    return befund({ symbol: sym, securityId: e.securityId, sessionDate: e.sessionDate, asOf: e.asOf, asOfLocal: e.asOfLocal,
                    regularComplete: e.regularComplete }, "intraday");
  });
  const summe = Freshness.summarize(befunde);
  /* Datenstand des Verzeichnisses: dataSession (neu) oder aus den Sitzungen
     abgeleitet (aelteres Verzeichnis). */
  const sitzungen = Object.keys(idx.sessions || idx.available || {}).sort();
  const ds = idx.dataSession || (sitzungen.length ? { sessionDate: sitzungen[sitzungen.length - 1], asOf: null,
                                                      regularComplete: null, universe: null } : null);
  const stand = ds ? befund({ symbol: "INDEX", sessionDate: ds.sessionDate, asOf: ds.asOf, asOfLocal: ds.asOfLocal,
                              regularComplete: ds.regularComplete !== false }, "intraday") : befund(null, "intraday");
  /* Universumsdeckung: liegt die letzte abgeschlossene Sitzung fuer das
     Universum vor (Aktienseiten ausserhalb der Flaechen)? */
  const universeSessions = idx.universeSessions || [];
  const universumAktuell = last ? universeSessions.includes(last.sessionDate) : null;
  report.intraday = {
    indexGeneratedAt: idx.generatedAt || null, indexSchema: idx.schemaVersion || null,
    displaySession: idx.displaySession || null, dataSession: ds,
    dataState: stand.freshnessState, dataReason: stand.reason, dataLabel: stand.label.label,
    entries: summe.total, byState: summe.byState, byReason: summe.byReason, staleSample: summe.stale.slice(0, 25),
    universeSessions, universeCoversLastSession: universumAktuell,
    state: stand.freshnessState === "STALE" || (summe.total && summe.byState.STALE > summe.total / 2) ? "STALE"
         : stand.freshnessState === "UNAVAILABLE" ? "UNAVAILABLE" : "OK"
  };
  console.log(`\n  Intraday: Datenstand ${ds ? ds.sessionDate : "-"} -> ${stand.freshnessState} (${stand.reason}) · "${stand.label.label}"`);
  console.log(`            Eintraege ${summe.total}: ${JSON.stringify(summe.byState)}`);
  console.log(`            Universum liegt vor fuer: ${universeSessions.join(", ") || "-"}` +
              (last ? ` · letzte Sitzung ${last.sessionDate} ${universumAktuell ? "gedeckt" : "NICHT gedeckt"}` : ""));
  if (report.intraday.state === "STALE") report.findings.push(`Intraday STALE: Datenstand ${ds ? ds.sessionDate : "-"}, erwartet ${report.market.expectedIntradaySession} (${stand.reason})`);
  if (last && universumAktuell === false && lage.marketState !== "OPEN") {
    const alter = (NOW.getTime() - Date.parse(last.close)) / 3600000;
    /* Der Universumslauf kommt 21:35 UTC (1,5 h nach Schluss); nach drei
       Stunden fehlt er. */
    if (alter > 3) report.findings.push(`Universumslauf fehlt: Sitzung ${last.sessionDate} liegt nur fuer den Discover-Umfang vor (${alter.toFixed(1)} h nach Schluss)`);
  }
} catch (err) {
  report.intraday = { state: "UNAVAILABLE", error: String(err.message) };
  report.findings.push("Intraday-Verzeichnis nicht lesbar: " + err.message);
}

/* ---------------------------------------------------------- Tageskurse */
try {
  const meta = await lade("/discover/data/meta.json");
  const u = (meta.universes || [])[0] || {};
  const universumsStand = befund({ symbol: "DISCOVER", to: u.asOf, asOf: u.asOf, source: u.provider }, "daily");
  let stichprobe = null;
  try {
    const scope = await lade("/discover/data/live-scope/US_REAL.json");
    const symbole = (scope.symbols || []).slice(0, SAMPLE);
    const idxSeries = SITE ? null : JSON.parse(readFileSync(join(root, "quant", "data", "market", "discover-series", "index.json"), "utf8"));
    const befunde = [];
    for (const sym of symbole) {
      const id = "ref_" + sym.replace(/-/g, "_");
      let reihe;
      try { reihe = await lade("/quant/data/market/discover-series/" + id + ".json"); } catch (e) { befunde.push(befund(null, "daily", { symbol: sym })); continue; }
      befunde.push(befund({ symbol: sym, securityId: reihe.securityId, to: reihe.to, asOf: reihe.asOf, source: reihe.provider || reihe.source }, "daily"));
    }
    const s = Freshness.summarize(befunde);
    stichprobe = { sample: befunde.length, byState: s.byState, byReason: s.byReason, staleSample: s.stale.slice(0, 25),
                   seriesIndexCount: idxSeries ? idxSeries.count : null };
  } catch (e) { stichprobe = { error: String(e.message) }; }
  report.daily = {
    universeAsOf: u.asOf || null, generatedAt: meta.generatedAt || null,
    state: universumsStand.freshnessState, reason: universumsStand.reason, label: universumsStand.label.label,
    expectedSession: last ? last.sessionDate : null, sample: stichprobe
  };
  console.log(`\n  Tageskurse: Universum asOf ${u.asOf} -> ${universumsStand.freshnessState} (${universumsStand.reason}) · "${universumsStand.label.label}"`);
  if (stichprobe && stichprobe.byState) console.log(`              Stichprobe ${stichprobe.sample} Reihen: ${JSON.stringify(stichprobe.byState)}`);
  if (universumsStand.freshnessState === "STALE") report.findings.push(`Tageskurse STALE: asOf ${u.asOf}, erwartet ${last ? last.sessionDate : "?"} (${universumsStand.reason})`);
} catch (err) {
  report.daily = { state: "UNAVAILABLE", error: String(err.message) };
  report.findings.push("Discover-Meta nicht lesbar: " + err.message);
}

report.overall = report.findings.length ? "STALE" : "OK";
if (!SITE) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`\n  geschrieben: ${OUT.replace(root + "/", "")}`);
}
console.log(`\n  Ergebnis: ${report.overall}` + (report.findings.length ? "\n    - " + report.findings.join("\n    - ") : ""));
if (STRICT && report.overall !== "OK") process.exit(2);
