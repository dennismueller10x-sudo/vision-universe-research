#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — verify-vu-live-e2e.mjs

   DIE GANZE KETTE, EINMAL DURCH (Zero-Cost Realtime V1, §17 und §18)

   Tiingo IEX (echt)
     -> tiingo-link          Upgrade, Anmeldung, Schluessel
     -> transport.js         Herzschlag, Abriss, Wiederanlauf
     -> providers/tiingo     Kursnachricht lesen
     -> subscription-manager Referenzzaehlung, Nachlauf
     -> bar-merge            laufende Kerze
     -> free-budget          Kontingentwaechter
     -> VuLive               Zusammenfassung, Verteilung
     -> Browser (Attrappe)   was wirklich ankommt

   WAS HIER NICHT DRIN IST, UND WARUM

   Der Sprung ueber Cloudflares Kante. Der Worker ist gebaut und
   getestet, aber nicht ausgerollt - CLOUDFLARE_API_TOKEN und
   CLOUDFLARE_ACCOUNT_ID liegen nicht vor. Gemessen wird deshalb alles,
   was Vision Universe selbst verantwortet, und der Bericht sagt genau
   das, statt eine Zahl auszuweisen, die niemand gemessen hat.

   WAS GEMESSEN WIRD

     §17 Last      1, 5, 10, 25, 50 gleichzeitig aktive Titel:
                   Ereignisrate, Rechenzeit, Speicher, Kontingent.
     §18 E2E       AAPL, NVDA, MSFT, VLO, PANW: kommt bei einem
                   Browser wirklich etwas an, und wie schnell.

   KEINE KURSE IM BERICHT (§34). Anzahlen, Abstaende, Zeiten.
   ========================================================================= */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { installiereLaufzeit, anfrage, papierZustand, anbieter } = await import(join(root, "worker", "tests", "harness.mjs"));
installiereLaufzeit();
const { VuLive, sitzung } = await import(join(root, "worker", "src", "vu-live.mjs"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const PHASEN = String(arg("--phases", "1,5,10,25,50")).split(",").map((v) => parseInt(v.trim(), 10)).filter(Boolean);
const PHASE_SECONDS = Math.max(10, parseInt(arg("--phase-seconds", "30"), 10) || 30);
const E2E_SECONDS = Math.max(10, parseInt(arg("--e2e-seconds", "60"), 10) || 60);
const CLIENTS = Math.max(1, parseInt(arg("--clients", "20"), 10) || 20);
const APIKEY = process.env.TIINGO_API_KEY || null;
/* TROCKENLAUF

   --fake ersetzt den Anbieter durch die Attrappe aus worker/tests und
   ueberspringt die Sitzungspruefung. Damit laesst sich VOR dem naechsten
   Handelstag pruefen, ob dieses Skript ueberhaupt einen wohlgeformten
   Bericht erzeugt - ohne ein Marktfenster dafuer zu verbrauchen.

   Die Zahlen eines Trockenlaufs sind KEINE Messung. Der Bericht traegt
   deshalb synthetic: true und das Ergebnis DRY_RUN; wer ihn fuer einen
   Nachweis haelt, hat die erste Zeile nicht gelesen. */
const FAKE = argv.includes("--fake");

/* §18 nennt sie ausdruecklich. Vier grosse und ein mittlerer Titel -
   VLO und PANW sind der Gegenprobe wegen dabei: wenn nur die vier
   groessten laufen, misst man den Markt und nicht das System. */
const E2E_SYMBOLE = ["AAPL", "NVDA", "MSFT", "VLO", "PANW"];
/* Fuer die Laststufen. Liquide US-Titel, damit eine Stufe von 50 auch
   wirklich 50 aktive Stroeme bedeutet und nicht 50 stille. */
const LIQUIDE = [
  "AAPL", "NVDA", "MSFT", "AMZN", "META", "GOOGL", "TSLA", "AVGO", "AMD", "NFLX",
  "JPM", "V", "MA", "XOM", "CVX", "UNH", "LLY", "COST", "WMT", "HD",
  "BAC", "PFE", "KO", "PEP", "CSCO", "INTC", "QCOM", "TXN", "ORCL", "CRM",
  "ADBE", "MU", "GS", "MS", "CAT", "BA", "GE", "T", "VZ", "DIS",
  "PANW", "VLO", "MRK", "ABBV", "TMO", "NKE", "MCD", "SBUX", "LOW", "UPS"
];

function schlafen(ms) { return new Promise((r) => setTimeout(r, ms)); }
function speicherMB() { return Math.round(process.memoryUsage().heapUsed / 1048576 * 10) / 10; }

/**
 * Cloudflares fetch-Upgrade, nachgebaut mit Nodes WebSocket.
 *
 * Der einzige Unterschied, der zaehlt: hier wird gewartet, bis die
 * Verbindung wirklich steht, bevor das Promise aufloest. In workerd ist
 * sie das bereits, wenn die Antwort kommt - genau deshalb darf
 * tiingo-link.mjs dort sofort senden.
 */
function nodeUpgradeFetch() {
  return function (url) {
    return new Promise((resolve, reject) => {
      if (typeof globalThis.WebSocket !== "function") { reject(new Error("kein WebSocket in dieser Laufzeit")); return; }
      const ws = new globalThis.WebSocket(url);
      const schale = {
        accept() { /* in Node schon angenommen */ },
        send(d) { ws.send(d); },
        close(c, r) { try { ws.close(c, r); } catch (e) { /* zu */ } },
        addEventListener(typ, fn) { ws.addEventListener(typ, fn); }
      };
      ws.addEventListener("open", () => resolve({ status: 101, webSocket: schale }), { once: true });
      ws.addEventListener("error", () => reject(new Error("Verbindungsaufbau fehlgeschlagen")), { once: true });
      setTimeout(() => reject(new Error("Verbindungsaufbau nach 20 s ohne Antwort")), 20000);
    });
  };
}

let taktgeber = null;

/* Fuer den Trockenlauf: um wie viel die Uhr vorgestellt werden muss,
   damit die Sitzung laeuft. Ohne das lehnt der Subscription Manager
   jedes Abonnement ab - zu Recht, denn ausserhalb der Sitzung gibt es
   nichts zu streamen. Im echten Lauf ist der Versatz null. */
function versatzInDieSitzung() {
  if (!FAKE) return 0;
  const jetzt = Date.now();
  for (let m = 0; m <= 60 * 24 * 5; m += 15) {
    const t = jetzt + m * 60000;
    if (sitzung(t).phase === "REGULAR") return t - jetzt;
  }
  return 0;
}
const VERSATZ = versatzInDieSitzung();
function uhr() { return Date.now() + VERSATZ; }

function baue() {
  const attrappe = FAKE ? anbieter() : null;
  const env = {
    TIINGO_API_KEY: APIKEY || (FAKE ? "trockenlauf" : null),
    TIINGO_DYNAMIC_SUBSCRIBE: process.env.TIINGO_DYNAMIC_SUBSCRIBE || "false",
    __fetch: attrappe ? attrappe.fetch : nodeUpgradeFetch()
  };
  if (FAKE) env.__now = uhr;
  const obj = new VuLive(papierZustand(null), env);
  if (attrappe) {
    /* Ein gleichmaessiger Kunstmarkt: 1,7 Ereignisse je Sekunde und
       Titel - die gemessene Hoechstrate aus dem Firehose-Nachweis. */
    if (taktgeber) clearInterval(taktgeber);
    taktgeber = setInterval(() => {
      if (!attrappe.aktuell) return;
      const liste = attrappe.tickers();
      liste.forEach((t) => {
        try { attrappe.kurs(t.toUpperCase(), 100 + Math.random(), uhr()); } catch (e) { /* zu */ }
      });
    }, Math.round(1000 / 1.7));
  }
  return { obj, env };
}

async function verbinde(obj) {
  const antwort = await obj.fetch(anfrage("https://vu-live/live", { Upgrade: "websocket" }));
  return antwort.webSocket;
}

/* Was ein Browser wirklich bekommt - ohne Kurse aufzuheben. */
function auswerten(sockets) {
  let nachrichten = 0, eintraege = 0, verzoegerungSumme = 0, verzoegerungAnzahl = 0;
  const verzoegerungen = [];
  const jeSymbol = Object.create(null);
  let abgelehnt = 0, statusmeldungen = 0;
  sockets.forEach((ws) => {
    ws.empfangen.forEach((n) => {
      if (!n || typeof n !== "object") return;
      if (n.op === "denied") { abgelehnt++; return; }
      if (n.op === "status") { statusmeldungen++; return; }
      if (n.op !== "u" || !Array.isArray(n.v)) return;
      nachrichten++;
      n.v.forEach((z) => {
        eintraege++;
        jeSymbol[z[0]] = (jeSymbol[z[0]] || 0) + 1;
        if (typeof z[2] === "number" && typeof n.t === "number") {
          const d = n.t - z[2];
          if (d >= 0 && d < 60000) { verzoegerungSumme += d; verzoegerungAnzahl++; verzoegerungen.push(d); }
        }
      });
    });
  });
  verzoegerungen.sort((a, b) => a - b);
  const p = (q) => verzoegerungen.length ? verzoegerungen[Math.min(verzoegerungen.length - 1,
              Math.round(q * (verzoegerungen.length - 1)))] : null;
  return {
    clientMessages: nachrichten, entries: eintraege,
    symbolsSeen: Object.keys(jeSymbol).length, perSymbol: jeSymbol,
    denied: abgelehnt, statusMessages: statusmeldungen,
    coalesceDelayMs: { count: verzoegerungAnzahl,
                       mean: verzoegerungAnzahl ? Math.round(verzoegerungSumme / verzoegerungAnzahl) : null,
                       p50: p(0.5), p95: p(0.95), max: verzoegerungen.length ? verzoegerungen[verzoegerungen.length - 1] : null }
  };
}

async function laststufe(n, bericht) {
  const symbole = LIQUIDE.slice(0, n);
  console.log("Laststufe " + n + " Titel, " + PHASE_SECONDS + " s, " + CLIENTS + " Zuschauer …");
  const { obj } = baue();
  const sockets = [];
  for (let i = 0; i < CLIENTS; i++) sockets.push(await verbinde(obj));
  /* Die Titel werden ueber die Zuschauer verteilt, damit bei fuenfzig
     Titeln auch wirklich fuenfzig laufen - ein Zuschauer je Titel ginge
     bei zwanzig Zuschauern nur bis zwanzig, und die Stufe waere eine
     andere als ihr Name.

     Sind weniger Titel als Zuschauer da, teilen sich mehrere denselben.
     Genau das ist der Fall, der nichts kosten darf: hundert Zuschauer
     auf NVDA sind ein Abonnement. */
  sockets.forEach((ws, i) => {
    const meine = symbole.filter((_, idx) => idx % CLIENTS === i);
    ws.send(JSON.stringify({ op: "subscribe",
                             symbols: meine.length ? meine : [symbole[i % symbole.length]] }));
  });

  const vorherCpu = process.cpuUsage();
  const vorherSpeicher = speicherMB();
  const t0 = Date.now();
  await schlafen(PHASE_SECONDS * 1000);
  const cpu = process.cpuUsage(vorherCpu);
  const dauer = Date.now() - t0;

  const stand = obj.budget.snapshot();
  const aus = auswerten(sockets);
  const providerNachrichten = stand.used.providerMessages;
  const stufe = {
    symbols: n, clients: CLIENTS, seconds: Math.round(dauer / 1000),
    providerMessages: providerNachrichten,
    providerEventsPerSecond: Math.round(providerNachrichten / (dauer / 1000) * 100) / 100,
    providerEventsPerSecondPerSymbol: Math.round(providerNachrichten / (dauer / 1000) / n * 100) / 100,
    client: aus,
    /* Das Verhaeltnis, auf dem der Nulltarif steht: viele Ereignisse
       herein, wenige Nachrichten hinaus. */
    fanIn: providerNachrichten ? Math.round(providerNachrichten / Math.max(1, aus.clientMessages) * 100) / 100 : null,
    cpu: { userMs: Math.round(cpu.user / 1000), systemMs: Math.round(cpu.system / 1000),
           sharePercent: Math.round((cpu.user + cpu.system) / 1000 / dauer * 10000) / 100 },
    memoryMB: { before: vorherSpeicher, after: speicherMB() },
    budget: { requests: stand.used.requests, requestShare: stand.share.requests,
              verdict: stand.verdict, symbolsPeak: stand.used.peakSymbols },
    managerState: obj.manager.status().state,
    subscribedSymbols: obj.manager.symbols().length,
    /* Wenn das nicht stimmt, misst die Stufe nicht, was ihr Name sagt. */
    coverageOk: obj.manager.symbols().length === n
  };
  console.log("   " + stufe.providerEventsPerSecond + " Ereignisse/s, " +
              aus.clientMessages + " Nachrichten an " + CLIENTS + " Zuschauer, CPU " +
              stufe.cpu.sharePercent + " %, Kontingent " + Math.round(stand.share.requests * 1000) / 10 + " %");
  sockets.forEach((ws) => ws.close(1000, "fertig"));
  obj.manager.shutdown("phaseEnde");
  bericht.load.push(stufe);
  await schlafen(1500);
}

async function e2e(bericht) {
  console.log("E2E: " + E2E_SYMBOLE.join(", ") + ", " + E2E_SECONDS + " s …");
  const { obj } = baue();
  const ws = await verbinde(obj);
  const angefragtAt = Date.now();
  ws.send(JSON.stringify({ op: "subscribe", symbols: E2E_SYMBOLE }));

  /* Wann kam der erste Kurs je Titel beim Browser an? Das ist die Zahl,
     die auf der Aktienseite den Unterschied macht - nicht der
     Durchsatz. */
  const ersterAt = Object.create(null);
  const beobachter = setInterval(() => {
    ws.empfangen.forEach((n) => {
      if (!n || n.op !== "u" || !Array.isArray(n.v)) return;
      n.v.forEach((z) => { if (!ersterAt[z[0]]) ersterAt[z[0]] = Date.now(); });
    });
  }, 100);

  await schlafen(E2E_SECONDS * 1000);
  clearInterval(beobachter);

  const aus = auswerten([ws]);
  const stand = obj.budget.snapshot();
  bericht.e2e = {
    symbols: E2E_SYMBOLE,
    seconds: E2E_SECONDS,
    firstTickMs: E2E_SYMBOLE.reduce((a, s) => {
      a[s] = ersterAt[s] ? ersterAt[s] - angefragtAt : null;
      return a;
    }, {}),
    delivered: E2E_SYMBOLE.reduce((a, s) => { a[s] = aus.perSymbol[s] || 0; return a; }, {}),
    client: aus,
    providerMessages: stand.used.providerMessages,
    budget: { requests: stand.used.requests, requestShare: stand.share.requests, verdict: stand.verdict },
    managerState: obj.manager.status().state,
    hello: ws.empfangen.find((n) => n && n.op === "hello") || null,
    note: "firstTickMs ist die Zeit vom subscribe des Browsers bis zum ersten Kurs desselben Titels " +
          "beim Browser - einschliesslich Verbindungsaufbau zum Anbieter und einem " +
          "Zusammenfassungsfenster von einer Sekunde. Der Sprung ueber Cloudflares Kante ist NICHT " +
          "enthalten: der Worker ist nicht ausgerollt."
  };
  console.log("   erste Kurse: " + JSON.stringify(bericht.e2e.firstTickMs));
  ws.close(1000, "fertig");
  obj.manager.shutdown("e2eEnde");
}

async function main() {
  const s = sitzung();
  const bericht = {
    schemaVersion: "vu-live-e2e-1.0.0",
    auftrag: "Zero-Cost Realtime V1 §17 (Last) und §18 (E2E)",
    checkedAt: new Date().toISOString(),
    session: { phase: s.phase, localDate: s.localDate, localTime: s.localTime, isOpen: s.isOpen },
    runtime: { node: process.version, platform: process.platform },
    scope: {
      included: "Tiingo IEX -> tiingo-link -> transport -> Parser -> subscription-manager -> bar-merge -> " +
                "free-budget -> VuLive -> Browser-Attrappe",
      excluded: "Cloudflares Kante (Worker nicht ausgerollt: CLOUDFLARE_API_TOKEN und " +
                "CLOUDFLARE_ACCOUNT_ID fehlen). Die gemessenen Zeiten enthalten diesen Sprung NICHT."
    },
    result: "UNKNOWN", reason: null,
    load: [], e2e: null
  };

  bericht.synthetic = FAKE;
  if (FAKE) {
    bericht.note = "TROCKENLAUF. Der Anbieter ist eine Attrappe und die Uhr ist um " +
                   Math.round(VERSATZ / 60000) + " Minuten in die naechste Sitzung vorgestellt; die Zahlen " +
                   "pruefen die Verkabelung dieses Skripts und nichts sonst.";
    bericht.session.simulatedPhase = sitzung(uhr()).phase;
  }
  if (!APIKEY && !FAKE) {
    bericht.reason = "noApiKey";
    return schreibe(bericht);
  }
  if (s.phase !== "REGULAR" && !FAKE) {
    bericht.reason = "marketClosed:" + s.phase;
    bericht.note = "Ausserhalb der regulaeren Sitzung gibt es keine Ereignisse. Eine Lastmessung ohne Last " +
                   "misst nichts; die Zahlen einer geschlossenen Boerse waeren keine Aussage ueber den Betrieb.";
    return schreibe(bericht);
  }

  for (const n of PHASEN) await laststufe(n, bericht);
  await e2e(bericht);

  const alleGeliefert = bericht.e2e && E2E_SYMBOLE.every((x) => (bericht.e2e.delivered[x] || 0) > 0);
  const imKontingent = bericht.load.every((l) => l.budget.verdict === "OK" || l.budget.verdict === "WARNING");
  bericht.coverageOk = bericht.load.every((l) => l.coverageOk);
  if (taktgeber) { clearInterval(taktgeber); taktgeber = null; }
  bericht.result = FAKE ? "DRY_RUN"
    : (alleGeliefert && imKontingent ? "PASS" : (alleGeliefert ? "PASS_WITH_BUDGET_WARNING" : "PARTIAL"));
  bericht.reason = alleGeliefert ? null : "nichtAlleTitelGeliefert";
  return schreibe(bericht);
}

function schreibe(bericht) {
  mkdirSync(OUT_DIR, { recursive: true });
  const pfad = join(OUT_DIR, "vu-live-e2e.json");
  writeFileSync(pfad, JSON.stringify(bericht, null, 2) + "\n");
  console.log("");
  console.log("ERGEBNIS: " + bericht.result + (bericht.reason ? " (" + bericht.reason + ")" : ""));
  console.log("Bericht: " + pfad);
  return bericht;
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Fehlgeschlagen: " + (err && err.message ? err.message : err));
  schreibe({ schemaVersion: "vu-live-e2e-1.0.0", checkedAt: new Date().toISOString(),
             result: "UNKNOWN", reason: "runError", message: (err && err.message) || String(err) });
  process.exit(0);
});
