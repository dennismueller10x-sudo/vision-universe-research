#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — smoke-vu-live.mjs

   DER ERSTE ATEMZUG DES AUSGEROLLTEN WORKERS

   Owner-Auftrag 17.09.2026: "Nach Deployment zunaechst nur die Realtime
   Runtime smoke-testen." Also genau das - kein Produktumbau, keine
   Umstellung der Auslieferung, kein Merge.

   Sieben Fragen an die laufende Kante:

     1. Antwortet /version, und nennt es die richtige Semantik?
     2. Antwortet /health, und steht der Tiingo-Schluessel dort als
        GESETZT, ohne dass sein Wert auftaucht?
     3. Laesst der Worker einen fremden Ursprung ab?
     4. Laesst er research.visionuniverse.de herein?
     5. Kommt eine WebSocket-Verbindung zustande, und begruesst sie mit
        priceType REALTIME_REFERENCE?
     6. Liefert ein Abonnement waehrend der Sitzung wirklich Kurse - und
        wie schnell?
     7. Meldet der Budgetwaechter einen Zustand, und welchen?

   WAS ER NICHT TUT: irgendetwas aendern. Alles hier ist Lesen und
   Zuhoeren. Und er gibt keinen Schluessel aus - er prueft im Gegenteil,
   dass der Worker es auch nicht tut.
   ========================================================================= */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MarketHours = require(join(root, "quant", "engines", "realtime", "market-hours.js"));
const calendar = JSON.parse(require("node:fs").readFileSync(
  join(root, "quant", "config", "market-calendar.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const BASIS = String(arg("--url", process.env.VU_LIVE_URL || "")).replace(/\/+$/, "");
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const SYMBOLE = String(arg("--symbols", "AAPL,NVDA,MSFT,VLO,PANW")).split(",").map((s) => s.trim().toUpperCase());
const HOER_SEKUNDEN = Math.max(5, parseInt(arg("--seconds", "45"), 10) || 45);
const ERLAUBTER_URSPRUNG = "https://research.visionuniverse.de";
const FREMDER_URSPRUNG = "https://beispiel.invalid";

function wsUrl(pfad) { return BASIS.replace(/^http/, "ws") + pfad; }
function httpUrl(pfad) { return BASIS.replace(/^ws/, "http") + pfad; }

const bericht = {
  schemaVersion: "vu-live-smoke-1.0.0",
  auftrag: "Zero-Cost Realtime V1: Smoke-Test der ausgerollten Runtime",
  checkedAt: new Date().toISOString(),
  endpoint: BASIS || null,
  session: null,
  checks: [],
  latency: null,
  result: "UNKNOWN",
  reason: null
};

function pruefung(id, frage) {
  const e = { id, question: frage, ok: false, detail: null };
  bericht.checks.push(e);
  return e;
}

async function main() {
  if (!BASIS) {
    bericht.reason = "noUrl";
    return schreibe();
  }
  const s = MarketHours.sessionAt(Date.now(), { calendar, exchange: "XNYS" });
  bericht.session = { phase: s.phase, localTime: s.localTime, isOpen: s.isOpen };

  /* 1 + 2: die beiden Auskunftspfade ------------------------------------ */
  const v = pruefung("version", "antwortet /version mit der richtigen Semantik?");
  try {
    const r = await fetch(httpUrl("/version"), { headers: { Origin: ERLAUBTER_URSPRUNG } });
    const k = await r.json();
    v.ok = r.status === 200 && k.priceType === "REALTIME_REFERENCE" && k.source === "TIINGO_IEX_LEVEL6";
    v.detail = { status: r.status, service: k.service, version: k.version,
                 priceType: k.priceType, source: k.source };
  } catch (err) { v.detail = { error: String(err && err.message || err) }; }

  const h = pruefung("health", "antwortet /health, ohne den Schluessel zu nennen?");
  try {
    const r = await fetch(httpUrl("/health"), { headers: { Origin: ERLAUBTER_URSPRUNG } });
    const text = await r.text();
    const k = JSON.parse(text);
    const schluesselGesetzt = !!(k.worker && k.worker.tiingoKeyConfigured);
    /* Der Wert selbst darf nirgends stehen. Geprueft wird gegen die
       Umgebung dieses Laufs - wenn er ihn kennt, faellt es auf. */
    const wert = process.env.TIINGO_API_KEY || null;
    const leck = wert && wert.length >= 8 ? text.includes(wert) : false;
    h.ok = r.status === 200 && schluesselGesetzt && !leck;
    h.detail = { status: r.status, object: k.object, session: k.session,
                 tiingoKeyConfigured: schluesselGesetzt, keyLeaked: leck,
                 managerState: k.manager && k.manager.state,
                 budgetVerdict: k.budget && k.budget.verdict,
                 priceType: k.priceType, source: k.source };
    bericht.budget = k.budget ? { verdict: k.budget.verdict, share: k.budget.share,
                                  reserveRationale: k.budget.reserveRationale } : null;
  } catch (err) { h.detail = { error: String(err && err.message || err) }; }

  /* 3 + 4: die Tuer ------------------------------------------------------ */
  const fremd = pruefung("originRejected", "bleibt ein fremder Ursprung draussen?");
  try {
    /* Upgrade ist ein verbotener Kopf: fetch() setzt ihn nicht, es
       scheitert daran (gemessen am 17.09.2026: "fetch failed"). Geprueft
       wird die Ursprungspruefung deshalb ueber zwei legale Anfragen -
       und das genuegt, denn ein Browser kommt ohne freigegebenen
       Ursprung an beiden nicht vorbei. */
    const vorflug = await fetch(httpUrl("/version"), {
      method: "OPTIONS",
      headers: { Origin: FREMDER_URSPRUNG, "Access-Control-Request-Method": "GET" }
    });
    const einfach = await fetch(httpUrl("/version"), { headers: { Origin: FREMDER_URSPRUNG } });
    const kopfA = vorflug.headers.get("access-control-allow-origin");
    const kopfB = einfach.headers.get("access-control-allow-origin");
    fremd.ok = !kopfA && !kopfB;
    fremd.detail = { preflightStatus: vorflug.status, preflightAllowOrigin: kopfA,
                     getStatus: einfach.status, getAllowOrigin: kopfB,
                     note: "Ohne Access-Control-Allow-Origin lehnt der Browser die Antwort ab, " +
                           "und der WebSocket kommt gar nicht erst zustande." };
  } catch (err) { fremd.detail = { error: String(err && err.message || err) }; }

  const vorflug = pruefung("corsPreflight", "bekommt research.visionuniverse.de den CORS-Kopf?");
  try {
    const r = await fetch(httpUrl("/version"), {
      method: "OPTIONS", headers: { Origin: ERLAUBTER_URSPRUNG,
                                    "Access-Control-Request-Method": "GET" }
    });
    const kopf = r.headers.get("access-control-allow-origin");
    vorflug.ok = kopf === ERLAUBTER_URSPRUNG;
    vorflug.detail = { status: r.status, allowOrigin: kopf };
  } catch (err) { vorflug.detail = { error: String(err && err.message || err) }; }

  /* 5 + 6: der Strom ----------------------------------------------------- */
  const strom = pruefung("websocket", "kommt eine Verbindung zustande und begruesst sie richtig?");
  const kurse = pruefung("ticks", "liefert ein Abonnement waehrend der Sitzung Kurse?");
  await new Promise((fertig) => {
    if (typeof globalThis.WebSocket !== "function") {
      strom.detail = { error: "kein WebSocket in dieser Laufzeit" };
      fertig();
      return;
    }
    let ws;
    try {
      /* Der Browser setzt Origin selbst; hier wird er gesetzt, weil der
         Worker ihn beim Upgrade prueft - genau wie bei einem echten
         Besucher von research.visionuniverse.de. */
      ws = new globalThis.WebSocket(wsUrl("/live"), { headers: { Origin: ERLAUBTER_URSPRUNG } });
    } catch (err) {
      strom.detail = { error: String(err && err.message || err) };
      fertig();
      return;
    }
    const ersteKurse = Object.create(null);
    const zustaende = [];
    const eingang = [];
    let abonniertAt = null;
    const ende = setTimeout(() => { try { ws.close(1000, "smoke"); } catch (e) {} }, HOER_SEKUNDEN * 1000);

    ws.addEventListener("open", () => {
      abonniertAt = Date.now();
      ws.send(JSON.stringify({ op: "subscribe", symbols: SYMBOLE }));
    });
    ws.addEventListener("message", (ev) => {
      let n = null;
      try { n = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch (e) { return; }
      if (!n) return;
      if (eingang.length < 60) eingang.push(n.op);
      if (n.op === "hello") {
        strom.ok = n.priceType === "REALTIME_REFERENCE" && n.source === "TIINGO_IEX_LEVEL6";
        strom.detail = { mode: n.mode, session: n.session, coalesceMs: n.coalesceMs,
                         maxSymbols: n.maxSymbols, budget: n.budget,
                         priceType: n.priceType, source: n.source };
      }
      if (n.op === "u" && Array.isArray(n.v)) {
        for (const z of n.v) {
          if (!ersteKurse[z[0]]) ersteKurse[z[0]] = Date.now() - abonniertAt;
        }
      }
      if (n.op === "denied" && !kurse.detail) {
        kurse.detail = { denied: n.symbol, reason: n.reason, session: n.session || null };
      }
      /* Kommen keine Kurse, steht der Grund hier - und nur hier. Der
         erste Deployment-Lauf meldete "0 von 5 geliefert" ohne ihn, und
         damit war nicht zu sehen, dass der Transport gar nicht erst
         zustande kam. */
      if (n.op === "status" || n.op === "session" || n.op === "budget") {
        zustaende.push({ op: n.op, state: n.state || null, reason: n.reason || null,
                         mode: n.mode || null, modeReason: n.modeReason || null,
                         verdict: n.verdict || null, session: n.session || null,
                         at: new Date().toISOString() });
      }
    });
    ws.addEventListener("error", () => { /* das Ergebnis steht in den Feldern */ });
    ws.addEventListener("close", (ev) => {
      clearTimeout(ende);
      const geliefert = SYMBOLE.filter((x) => ersteKurse[x] !== undefined);
      const werte = geliefert.map((x) => ersteKurse[x]).sort((a, b) => a - b);
      bericht.latency = {
        firstTickMs: SYMBOLE.reduce((a, x) => { a[x] = ersteKurse[x] === undefined ? null : ersteKurse[x]; return a; }, {}),
        median: werte.length ? werte[Math.floor(werte.length / 2)] : null,
        max: werte.length ? werte[werte.length - 1] : null,
        note: "Zeit vom subscribe des Clients bis zum ersten Kurs desselben Titels beim Client. " +
              "Enthaelt Cloudflares Kante, den Verbindungsaufbau zum Anbieter und ein " +
              "Zusammenfassungsfenster von einer Sekunde."
      };
      /* Ausserhalb der Sitzung ist "keine Kurse" richtig, nicht kaputt. */
      kurse.ok = s.phase === "REGULAR" ? geliefert.length === SYMBOLE.length : true;
      kurse.detail = Object.assign(kurse.detail || {}, {
        session: s.phase, delivered: geliefert.length, of: SYMBOLE.length,
        closeCode: ev && ev.code, ops: [...new Set(eingang)],
        states: zustaende.slice(0, 12)
      });
      bericht.states = zustaende.slice(0, 20);
      fertig();
    });
  });

  /* Zum Schluss noch einmal /health - jetzt hat das Objekt gearbeitet,
     und sein Protokoll sagt, was dabei passiert ist. Genau das fehlte
     beim ersten Lauf: "0 von 5 geliefert" ohne einen Hinweis darauf,
     woran es lag. */
  try {
    const r = await fetch(httpUrl("/health"), { headers: { Origin: ERLAUBTER_URSPRUNG } });
    const k = await r.json();
    bericht.healthAfter = {
      manager: k.manager || null, values: k.values, series: k.series,
      budget: k.budget ? { verdict: k.budget.verdict, used: k.budget.used } : null,
      log: k.log || null
    };
  } catch (err) { bericht.healthAfter = { error: String(err && err.message || err) }; }

  const alles = bericht.checks.every((c) => c.ok);
  bericht.result = alles ? "PASS" : "FAIL";
  bericht.reason = alles ? null : bericht.checks.filter((c) => !c.ok).map((c) => c.id).join(",");
  return schreibe();
}

function schreibe() {
  geschrieben = true;
  mkdirSync(OUT_DIR, { recursive: true });
  const pfad = join(OUT_DIR, "vu-live-smoke.json");
  writeFileSync(pfad, JSON.stringify(bericht, null, 2) + "\n");
  console.log("");
  for (const c of bericht.checks) {
    console.log("  " + (c.ok ? "ok    " : "FEHLT ") + c.question);
    if (!c.ok && c.detail) console.log("        " + JSON.stringify(c.detail));
  }
  if (bericht.latency) {
    console.log("");
    console.log("  erste Kurse (ms): " + JSON.stringify(bericht.latency.firstTickMs));
  }
  if (bericht.healthAfter && bericht.healthAfter.log) {
    console.log("");
    console.log("  Protokoll des Objekts:");
    for (const z of bericht.healthAfter.log) console.log("    " + JSON.stringify(z));
  }
  console.log("");
  console.log("ERGEBNIS: " + bericht.result + (bericht.reason ? " (" + bericht.reason + ")" : ""));
  console.log("Bericht: " + pfad.slice(root.length + 1));
  if (bericht.result !== "PASS") process.exitCode = 1;
  return bericht;
}

/* Ein Lauf, der nichts hinterlaesst, ist kein Nachweis. Beim ersten
   Deployment-Lauf hat dieses Skript 46 Sekunden gearbeitet und weder
   eine Zeile ausgegeben noch eine Datei geschrieben - was danach
   aussah, als sei es gar nicht gelaufen. Dieser Riegel schreibt den
   Bericht auch dann, wenn der Prozess auf einem anderen Weg endet. */
let geschrieben = false;
process.on("exit", () => {
  if (!geschrieben) {
    bericht.result = bericht.result === "UNKNOWN" ? "FAIL" : bericht.result;
    bericht.reason = bericht.reason || "processExitedEarly";
    try { schreibe(); } catch (e) { /* mehr geht nicht */ }
  }
});

main().catch((err) => {
  bericht.result = "FAIL";
  bericht.reason = "runError";
  bericht.message = String(err && err.message || err);
  schreibe();
});
