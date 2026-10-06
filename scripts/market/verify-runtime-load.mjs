#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — verify-runtime-load.mjs   (Owner-Auftrag 2026-09-17)

   Was kostet ein Provider-Ereignis an Rechenzeit?

   DIE FRAGE, UM DIE ES GEHT

   Der Firehose-Nachweis vom 16.09. hat gemessen: 1.022 Ereignisse je
   Sekunde, 6.429 verschiedene Titel in 120 Sekunden, 98 KB/s. Ein
   Durable Object ist ein EINZELNER Faden mit 128 MB. Die Frage ist
   nicht, ob Cloudflare einen Socket halten kann - das steht in der
   Dokumentation. Die Frage ist, ob ein einzelner Faden diese Last
   traegt, und wenn nicht, ab wann er es nicht mehr tut.

   Das laesst sich messen, ohne einen einzigen Cloudflare-Vertrag: die
   Arbeit je Ereignis ist dieselbe JavaScript-Arbeit, egal ob sie in
   Node oder in workerd laeuft. Beide fahren V8.

   WAS GEMESSEN WIRD - UND WAS NICHT

   Gemessen wird die Arbeitslast: Rechenzeit je Ereignis, aufgeteilt in
   die vier Stufen, aus denen die Runtime bestehen wuerde. Gemessen wird
   ausserdem der Arbeitsspeicher bei voller Titelzahl - die Zahl, die
   ueber "ein Objekt" oder "mehrere Objekte" entscheidet.

   NICHT gemessen wird die Plattform: Cloudflares eigene Buchung von
   CPU-Zeit, der Aufschlag ihrer Laufzeit, das Verhalten unter
   Verdraengung. Dafuer braucht es ein Konto, und das liegt nicht vor.
   Diese Datei sagt, WIE VIEL Arbeit anfaellt. Ob Cloudflare sie anders
   verbucht, ist eine zweite Messung.

   DIE NACHRICHTEN

   Nachgespielt wird die gemessene Form: {"service":"iex",
   "messageType":"A","data":[isoZeit, ticker, zahl]} - dieselbe
   typlose Form, die der Firehose am 16.09. geliefert hat, und dieselbe
   Titelverteilung (6.429 Titel mit ihren echten Ereigniszahlen aus
   firehose-capability.json).

   DIE KURSE SIND SYNTHETISCH UND BLEIBEN IM PROZESS. Sie werden nicht
   ausgegeben, nicht gespeichert und nie angezeigt. Fuer eine Messung
   der Rechenzeit ist die Zahl im Kurs gleichgueltig; fuer alles andere
   waere sie erfunden, und deshalb verlaesst sie diese Datei nicht.

   ZWEI BAUFORMEN

     A  ein Objekt macht alles: parsen, Zustand, Kerze, Buendelung
     B  Ingest parst und buendelt, Shards fuehren Zustand und Kerze

   Ausfuehren:
     node scripts/market/verify-runtime-load.mjs
     node scripts/market/verify-runtime-load.mjs --seconds 20 --rates 1,2,5
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const engines = join(root, "quant", "engines");

const BarMerge = require(join(engines, "realtime", "bar-merge.js"));
const TiingoRealtime = require(join(root, "providers", "tiingo", "realtime.js"));
const calendar = JSON.parse(
  readFileSync(join(root, "quant", "config", "market-calendar.json"), "utf8"));

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const OUT_DIR = arg("--out", join(root, "quant", "data", "market", "commercial"));
const BURST_EVENTS = Math.max(10000, parseInt(arg("--events", "200000"), 10) || 200000);
const PACED_SECONDS = Math.max(5, parseInt(arg("--seconds", "20"), 10) || 20);
const RATES = String(arg("--rates", "1,2,5,10")).split(",")
  .map((v) => parseFloat(v.trim())).filter((v) => v > 0);
/* Der Messbefund vom 16.09., als Bezugsgroesse. */
const GEMESSEN = { eventsPerSecond: 1021.94, bytesPerSecond: 98070, distinctSymbols: 6429 };
const COALESCE_MS = Math.max(100, parseInt(arg("--coalesce-ms", "1000"), 10) || 1000);

/* ---------------------------------------------------------------- Titel
   Die echte Titelverteilung aus dem Firehose-Nachweis. Ohne sie misst
   der Lauf eine Gleichverteilung, und die gibt es am Markt nicht: ein
   ETF traegt zweihundert Ereignisse, ein Nebenwert eines. */
function ladeVerteilung() {
  const p = join(root, "quant", "data", "market", "commercial", "firehose-capability.json");
  if (!existsSync(p)) return null;
  const r = JSON.parse(readFileSync(p, "utf8"));
  const haupt = (r.measurements || []).find((m) => m.scope === "firehoseMain");
  const by = haupt && haupt.events && haupt.events.bySymbol;
  if (!by) return null;
  const paare = Object.entries(by).filter(([s]) => s && s !== "?");
  if (!paare.length) return null;
  return { quelle: "firehose-capability.json (Messung 2026-09-16)", paare };
}

/* Eine Ziehungstabelle: jeder Titel so oft, wie er gemessen wurde. Ein
   Zug daraus trifft die Verteilung des echten Bandes. */
function baueZiehung(verteilung) {
  const topf = [];
  for (const [sym, n] of verteilung.paare) {
    const mal = Math.max(1, Math.round(n));
    for (let i = 0; i < mal; i++) topf.push(sym);
  }
  return topf;
}

/* ------------------------------------------------------------ Nachrichten
   Vorgefertigt, damit die Messung die Verarbeitung misst und nicht das
   Erzeugen der Nachricht. */
function baueNachrichten(topf, anzahl) {
  const raus = new Array(anzahl);
  const basis = Date.now();
  /* Die Nachrichten tragen die Zeit, die sie am echten Band haetten:
     anzahl / gemessene Rate. Ohne das feuert kein Buendel-Takt, und die
     Messung der Buendelung misst nichts. */
  const spanneMs = anzahl / GEMESSEN.eventsPerSecond * 1000;
  /* Ein Startkurs je Titel, danach kleine Schritte - synthetisch, nur
     damit die Kerze etwas zu tun hat. Verlaesst den Prozess nicht. */
  const kurs = new Map();
  for (let i = 0; i < anzahl; i++) {
    const sym = topf[(Math.random() * topf.length) | 0];
    let k = kurs.get(sym);
    if (k === undefined) { k = 10 + (sym.length * 7) % 400; kurs.set(sym, k); }
    k = Math.round((k * (1 + (Math.random() - 0.5) * 0.0008)) * 10000) / 10000;
    kurs.set(sym, k);
    const t = new Date(basis + Math.round(i / anzahl * spanneMs)).toISOString().replace("Z", "-04:00");
    raus[i] = { data: '{"service":"iex","messageType":"A","data":["' + t + '","' +
                       sym.toLowerCase() + '",' + k + ']}' };
  }
  return raus;
}

/* ------------------------------------------------------------- Zustand
   Der VU Realtime State, so klein wie moeglich: was eine Karte und ein
   Chartkopf brauchen. Genau das, was spaeter im Shard liegen wuerde. */
function neuerZustand() {
  return new Map();
}
function zustandSetzen(state, sym, price, tsMs) {
  let e = state.get(sym);
  if (e === undefined) {
    e = { last: price, first: price, prevClose: null, at: tsMs, n: 0, dir: 0 };
    state.set(sym, e);
  } else {
    e.last = price;
    e.at = tsMs;
    e.n++;
    e.dir = price >= e.first ? 1 : -1;
  }
  return e;
}

/* --------------------------------------------------------------- Kerzen */
function kerzeFuer(serien, sym) {
  let s = serien.get(sym);
  if (s === undefined) {
    s = BarMerge.createSeries({ timeframe: "1m", interval: "1m", calendar,
                                exchange: "XNYS", adjustmentStatus: null });
    serien.set(sym, s);
  }
  return s;
}

/* =====================================================================
   SPEICHER einer ganzen Sitzung

   Die Frage, die ueber "ein Objekt" oder "viele" entscheidet: passt der
   Zustand des ganzen Bandes in die 128 MB, die ein Durable Object
   bekommt? Gemessen wird der Endzustand nach einer vollen regulaeren
   Sitzung: 390 Minutenkerzen je Titel.
   ===================================================================== */
function stufeSpeicherSitzung(symbole, barsJeTitel, maxBars) {
  if (global.gc) global.gc();
  const vorher = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  const serien = new Map();
  const state = neuerZustand();
  /* Die Kerzen muessen INNERHALB einer regulaeren Sitzung liegen. Der
     erste Lauf setzte sie auf "jetzt minus 390 Minuten" - das war
     nachts, bar-merge hat jeden Tick verworfen, und gemessen wurden
     6.429 leere Serien statt 6.429 vollen. Der Fehler fiel nur auf,
     weil die Bytes je Kerze null ergaben. */
  const sitzung = Date.UTC(2026, 8, 16, 13, 30, 0);   /* 2026-09-16 09:30 New York */
  const startMs = sitzung;
  /* Die Serie braucht eine Uhr, die mitlaeuft. Mit der echten Uhr ist
     jede historische Minute bereits abgeschlossen, und bar-merge lehnt
     den Tick zu Recht ab (rejectedConfirmed) - eine geschlossene Kerze
     wird nicht mehr angefasst. Genau diesen Weg gehen auch die Tests. */
  let uhr = startMs;
  let ticks = 0;
  for (const sym of symbole) {
    const s = BarMerge.createSeries({ timeframe: "1m", interval: "1m", calendar,
                                      exchange: "XNYS", adjustmentStatus: null,
                                      maxBars: maxBars, now: function () { return uhr; } });
    serien.set(sym, s);
    let kurs = 10 + (sym.length * 7) % 400;
    uhr = startMs;
    for (let b = 0; b < barsJeTitel; b++) {
      const at = startMs + b * 60000;
      uhr = at + 1000;
      kurs = kurs * (1 + (Math.random() - 0.5) * 0.002);
      s.applyTick({ price: kurs, size: null, timestamp: new Date(at).toISOString(),
                    receivedAt: at, currency: "USD", source: "tiingo",
                    dataClass: "REALTIME_STREAM" });
      zustandSetzen(state, sym, kurs, at);
      ticks++;
    }
  }
  if (global.gc) global.gc();
  const mem = process.memoryUsage();
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  /* Einen Zeiger halten, damit der Sammler die Serien nicht vor der
     Messung einsammelt. */
  const balkenGesamt = [...serien.values()].reduce((a, s) => a + s.length(), 0);
  const ersteStats = serien.size ? [...serien.values()][0].stats() : null;
  return {
    titel: serien.size, barsJeTitel, maxBars, ticks, balkenGesamt,
    heapNachMB: Math.round(mem.heapUsed / 1048576 * 10) / 10,
    heapDeltaMB: Math.round((mem.heapUsed - vorher) / 1048576 * 10) / 10,
    rssMB: Math.round(mem.rss / 1048576 * 10) / 10,
    bytesJeTitel: Math.round((mem.heapUsed - vorher) / serien.size),
    bytesJeBalken: balkenGesamt ? Math.round((mem.heapUsed - vorher) / balkenGesamt) : null,
    aufbauSekunden: Math.round(wallMs / 100) / 10,
    balkenJeTitel: serien.size ? Math.round(balkenGesamt / serien.size) : 0,
    mergeStatsErsteSerie: ersteStats,
    passtIn128MB: (mem.heapUsed - vorher) < 128 * 1048576
  };
}

/* ------------------------------------------------------------- Messhilfe */
function messen(fn) {
  if (global.gc) global.gc();
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  const heap0 = process.memoryUsage().heapUsed;
  const ergebnis = fn();
  const t1 = process.hrtime.bigint();
  const cpu1 = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    wallMs: Number(t1 - t0) / 1e6,
    cpuUserMs: cpu1.user / 1000,
    cpuSystemMs: cpu1.system / 1000,
    cpuTotalMs: (cpu1.user + cpu1.system) / 1000,
    heapDeltaBytes: mem.heapUsed - heap0,
    heapUsedBytes: mem.heapUsed,
    rssBytes: mem.rss,
    ergebnis
  };
}
const je = (ms, n) => Math.round(ms / n * 1e6) / 1e3;   /* ms gesamt -> Mikrosekunden je Ereignis */

/* =====================================================================
   STUFE 1  Parser
   ===================================================================== */
function stufeParser(nachrichten) {
  return messen(() => {
    let ok = 0, leer = 0;
    for (let i = 0; i < nachrichten.length; i++) {
      const r = TiingoRealtime.parseIexMessage(nachrichten[i]);
      if (r && r.tick) ok++; else leer++;
    }
    return { geparst: ok, verworfen: leer };
  });
}

/* =====================================================================
   STUFE 2  Zustand
   ===================================================================== */
function stufeZustand(ticks) {
  const state = neuerZustand();
  const m = messen(() => {
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i];
      zustandSetzen(state, t.symbol, t.price, t.atMs);
    }
    return { titel: state.size };
  });
  m.state = state;
  return m;
}

/* =====================================================================
   STUFE 3  Kerze (bar-merge, dieselbe Engine wie im Chart)
   ===================================================================== */
function stufeKerze(ticks, nurTitel) {
  const serien = new Map();
  const filter = nurTitel ? new Set(nurTitel) : null;
  const m = messen(() => {
    let angewandt = 0;
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i];
      if (filter && !filter.has(t.symbol)) continue;
      const s = kerzeFuer(serien, t.symbol);
      s.applyTick({ price: t.price, size: null, timestamp: t.timestamp,
                    receivedAt: t.atMs, currency: "USD", source: "tiingo",
                    dataClass: "REALTIME_STREAM" });
      angewandt++;
    }
    return { serien: serien.size, angewandt };
  });
  m.serien = serien;
  return m;
}

/* =====================================================================
   STUFE 4  Buendelung zum Client (Coalescing)

   Nicht jedes Ereignis geht hinaus. Je Titel bleibt ein Schmutzflag
   stehen; im Takt wird EIN Wert je Titel gesendet, und nur an die, die
   ihn abonniert haben. Das ist die Stufe, die den Ausgang klein macht.
   ===================================================================== */
function stufeBuendelung(ticks, state, abos, taktMs) {
  const schmutzig = new Set();
  const m = messen(() => {
    let flushes = 0, gesendet = 0, bytes = 0;
    let letzterFlush = ticks.length ? ticks[0].atMs : 0;
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i];
      schmutzig.add(t.symbol);
      if (t.atMs - letzterFlush >= taktMs) {
        letzterFlush = t.atMs;
        flushes++;
        /* Je Abonnent: nur seine Titel, in einer Nachricht. */
        for (const [, titel] of abos) {
          const nutz = [];
          for (const sym of titel) {
            if (!schmutzig.has(sym)) continue;
            const e = state.get(sym);
            if (e) nutz.push([sym, e.last, e.dir]);
          }
          if (!nutz.length) continue;
          const text = JSON.stringify({ t: letzterFlush, u: nutz });
          bytes += text.length;
          gesendet++;
        }
        schmutzig.clear();
      }
    }
    return { flushes, gesendet, bytes };
  });
  return m;
}

/* =====================================================================
   BAUFORM B  Ingest buendelt nach Shard
   ===================================================================== */
function hashShard(sym, n) {
  let h = 5381;
  for (let i = 0; i < sym.length; i++) h = ((h << 5) + h + sym.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}
function stufeShardVerteilung(ticks, shards, batchMs) {
  const eimer = new Array(shards).fill(null).map(() => []);
  const m = messen(() => {
    let batches = 0, bytes = 0;
    let letzter = ticks.length ? ticks[0].atMs : 0;
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i];
      eimer[hashShard(t.symbol, shards)].push(t.symbol, t.price, t.atMs);
      if (t.atMs - letzter >= batchMs) {
        letzter = t.atMs;
        for (let s = 0; s < shards; s++) {
          if (!eimer[s].length) continue;
          /* Die Nachricht von Ingest zum Shard: flach, ohne Objekte. */
          bytes += JSON.stringify(eimer[s]).length;
          eimer[s].length = 0;
          batches++;
        }
      }
    }
    return { batches, bytes };
  });
  return m;
}

/* =====================================================================
   Getakteter Lauf: haelt die Last die echte Rate aus, ohne Rueckstau?
   ===================================================================== */
async function getakteterLauf(topf, rate, sekunden, variante) {
  const proSekunde = Math.round(GEMESSEN.eventsPerSecond * rate);
  const taktMs = 50;
  const jeTakt = Math.max(1, Math.round(proSekunde * taktMs / 1000));
  const state = neuerZustand();
  const serien = new Map();
  const schmutzig = new Set();
  const vorrat = baueNachrichten(topf, jeTakt * 4);
  let vorratIndex = 0;

  let verarbeitet = 0, takte = 0, rueckstauMs = 0, maxTaktMs = 0;
  const cpu0 = process.cpuUsage();
  const start = process.hrtime.bigint();
  const ende = Date.now() + sekunden * 1000;
  let letzterFlush = Date.now(), flushes = 0, ausgangBytes = 0;

  while (Date.now() < ende) {
    const taktStart = process.hrtime.bigint();
    for (let i = 0; i < jeTakt; i++) {
      const nachricht = vorrat[vorratIndex++ % vorrat.length];
      const r = TiingoRealtime.parseIexMessage(nachricht);
      if (!r || !r.tick) continue;
      const sym = (r.tick.symbol || "?").toUpperCase();
      const at = Date.now();
      zustandSetzen(state, sym, r.tick.price, at);
      if (variante === "A") {
        kerzeFuer(serien, sym).applyTick({
          price: r.tick.price, size: null, timestamp: r.tick.timestamp,
          receivedAt: at, currency: "USD", source: "tiingo", dataClass: "REALTIME_STREAM" });
      }
      schmutzig.add(sym);
      verarbeitet++;
    }
    const jetzt = Date.now();
    if (jetzt - letzterFlush >= COALESCE_MS) {
      letzterFlush = jetzt; flushes++;
      let n = 0;
      for (const sym of schmutzig) { const e = state.get(sym); if (e) n++; }
      ausgangBytes += n * 24;          /* grobe Nutzlast je Titel im Ausgang */
      schmutzig.clear();
    }
    const dauer = Number(process.hrtime.bigint() - taktStart) / 1e6;
    maxTaktMs = Math.max(maxTaktMs, dauer);
    takte++;
    const rest = taktMs - dauer;
    if (rest > 0) await new Promise((r) => setTimeout(r, rest));
    else rueckstauMs += -rest;          /* der Takt hat laenger gebraucht als er darf */
  }

  const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
  const cpu = process.cpuUsage(cpu0);
  const mem = process.memoryUsage();
  return {
    variante, rateFaktor: rate, zielProSekunde: proSekunde,
    verarbeitet,
    tatsaechlichProSekunde: Math.round(verarbeitet / (wallMs / 1000)),
    wallMs: Math.round(wallMs),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    cpuAuslastung: Math.round((cpu.user + cpu.system) / 1000 / wallMs * 1000) / 1000,
    takte, maxTaktMs: Math.round(maxTaktMs * 100) / 100,
    rueckstauMs: Math.round(rueckstauMs),
    rueckstau: rueckstauMs > wallMs * 0.02,
    titel: state.size, serien: serien.size,
    flushes, ausgangBytesProSekunde: Math.round(ausgangBytes / (wallMs / 1000)),
    heapUsedMB: Math.round(mem.heapUsed / 1048576 * 10) / 10,
    rssMB: Math.round(mem.rss / 1048576 * 10) / 10
  };
}

/* ===================================================================== */
async function main() {
  console.log("Vision Universe — Runtime-Lastmessung (Cloudflare-Vorpruefung)\n");
  const verteilung = ladeVerteilung();
  if (!verteilung) {
    console.error("  Kein Firehose-Bericht gefunden. Ohne die gemessene Titelverteilung " +
                  "waere dieser Lauf eine Gleichverteilung - und die gibt es am Markt nicht.");
    process.exit(1);
  }
  const topf = baueZiehung(verteilung);
  console.log(`  Verteilung: ${verteilung.paare.length} Titel, ${topf.length} Ziehungen`);
  console.log(`  Quelle:     ${verteilung.quelle}`);
  console.log(`  Bezug:      ${GEMESSEN.eventsPerSecond} Ereignisse/s gemessen\n`);

  /* ---------------------------------------------------- Stufen einzeln */
  console.log(`  Stufenmessung mit ${BURST_EVENTS.toLocaleString("de-DE")} Nachrichten ...`);
  const nachrichten = baueNachrichten(topf, BURST_EVENTS);

  const p = stufeParser(nachrichten);
  console.log(`    Parser        ${je(p.cpuTotalMs, BURST_EVENTS)} µs/Ereignis  ` +
              `(${Math.round(BURST_EVENTS / (p.wallMs / 1000)).toLocaleString("de-DE")}/s)`);

  /* Die Ticks einmal erzeugen, damit die folgenden Stufen nicht den
     Parser mitmessen. */
  const ticks = [];
  for (const n of nachrichten) {
    const r = TiingoRealtime.parseIexMessage(n);
    if (!r || !r.tick) continue;
    /* Die Empfangszeit ist die Zeit der Nachricht: sonst liegen alle
       Ereignisse auf derselben Millisekunde, und jeder zeitbasierte
       Takt (Buendelung, Shard-Batch, Kerzenwechsel) faellt aus. */
    const atMs = Date.parse(r.tick.timestamp);
    ticks.push({ symbol: (r.tick.symbol || "?").toUpperCase(),
                 price: r.tick.price, timestamp: r.tick.timestamp,
                 atMs: Number.isFinite(atMs) ? atMs : Date.now() });
  }
  const z = stufeZustand(ticks);
  console.log(`    Zustand       ${je(z.cpuTotalMs, ticks.length)} µs/Ereignis  ` +
              `(${z.ergebnis.titel} Titel, ${Math.round(z.heapDeltaBytes / 1024)} KB)`);

  const kAlle = stufeKerze(ticks, null);
  console.log(`    Kerze alle    ${je(kAlle.cpuTotalMs, kAlle.ergebnis.angewandt)} µs/Ereignis  ` +
              `(${kAlle.ergebnis.serien} Serien, ${Math.round(kAlle.heapDeltaBytes / 1048576 * 10) / 10} MB)`);

  /* Kerzen nur fuer die Titel, die jemand ansieht - der sparsame Fall. */
  const sichtbar = [...new Set(ticks.slice(0, 600).map((t) => t.symbol))].slice(0, 120);
  const kWenige = stufeKerze(ticks, sichtbar);
  console.log(`    Kerze ${String(sichtbar.length).padStart(3)} St. ${je(kWenige.cpuTotalMs, ticks.length)} µs/Ereignis  ` +
              `(nur betrachtete Titel, ${Math.round(kWenige.heapDeltaBytes / 1048576 * 10) / 10} MB)`);

  /* Abonnenten: so, wie Discover sie erzeugt - eine Aktienseite sieht
     einen Titel, eine Uebersicht ein paar Dutzend. */
  const abos = new Map();
  for (let i = 0; i < 50; i++) abos.set("client" + i, sichtbar.slice(0, 1 + (i % 30)));
  const b = stufeBuendelung(ticks, z.state, abos, COALESCE_MS);
  console.log(`    Buendelung    ${je(b.cpuTotalMs, ticks.length)} µs/Ereignis  ` +
              `(${abos.size} Abonnenten, ${b.ergebnis.flushes} Takte, ` +
              `${Math.round(b.ergebnis.bytes / 1024)} KB Ausgang)`);

  const shardTests = [2, 4, 8];
  const shardMessungen = shardTests.map((n) => {
    const s = stufeShardVerteilung(ticks, n, 250);
    console.log(`    Shard-Split ${n}  ${je(s.cpuTotalMs, ticks.length)} µs/Ereignis  ` +
                `(${s.ergebnis.batches} Buendel, ${Math.round(s.ergebnis.bytes / 1024)} KB intern)`);
    return { shards: n, cpuMsJeEreignis: je(s.cpuTotalMs, ticks.length) / 1000,
             mikrosekundenJeEreignis: je(s.cpuTotalMs, ticks.length),
             batches: s.ergebnis.batches, internBytes: s.ergebnis.bytes };
  });

  /* ------------------------------------------------ Speicher Sitzung */
  console.log("\n  Speicher nach einer vollen Sitzung ...");
  const alleTitel = verteilung.paare.map(([s]) => s);
  const speicherVoll = stufeSpeicherSitzung(alleTitel, 390, 400);
  console.log(`    alle ${speicherVoll.titel} Titel: ${speicherVoll.balkenJeTitel} Kerzen je Titel, ` +
              `${speicherVoll.balkenGesamt.toLocaleString("de-DE")} Kerzen gesamt, ` +
              `${speicherVoll.heapDeltaMB} MB  (${speicherVoll.bytesJeTitel} B/Titel, ` +
              `${speicherVoll.bytesJeBalken} B/Kerze)  ` +
              `${speicherVoll.passtIn128MB ? "passt in 128 MB" : "PASST NICHT in 128 MB"}`);
  /* Wie viele betrachtete Titel passen in ein Objekt? Und was bringt es,
     die Kerzenhistorie im Speicher zu deckeln (der Rest der Sitzung
     liegt ohnehin im statischen Pfad)? */
  const speicherKurve = [];
  for (const [n, bars, cap] of [[300, 390, 400], [1000, 390, 400], [2000, 390, 400],
                                [6429, 390, 60], [6429, 390, 15]]) {
    const r = stufeSpeicherSitzung(alleTitel.slice(0, n), bars, cap);
    speicherKurve.push(r);
    console.log(`    ${String(r.titel).padStart(4)} Titel, Deckel ${String(cap).padStart(3)} Kerzen: ` +
                `${String(r.heapDeltaMB).padStart(6)} MB  ` +
                `(${r.balkenJeTitel} Kerzen je Titel)  ` +
                `${r.passtIn128MB ? "passt" : "PASST NICHT"} in 128 MB`);
  }
  const speicherSparsam = speicherKurve[0];

  /* ------------------------------------------------- Getaktete Laeufe */
  console.log(`\n  Getaktete Laeufe, ${PACED_SECONDS} s je Lauf ...`);
  const laeufe = [];
  for (const rate of RATES) {
    for (const variante of ["A", "B"]) {
      const r = await getakteterLauf(topf, rate, PACED_SECONDS, variante);
      laeufe.push(r);
      console.log(`    ${variante}  ${String(r.zielProSekunde).padStart(6)}/s Ziel  ` +
                  `${String(r.tatsaechlichProSekunde).padStart(6)}/s erreicht  ` +
                  `CPU ${String(Math.round(r.cpuAuslastung * 100)).padStart(3)} %  ` +
                  `Takt max ${String(r.maxTaktMs).padStart(6)} ms  ` +
                  `Heap ${String(r.heapUsedMB).padStart(5)} MB  ` +
                  `${r.rueckstau ? "RUECKSTAU" : "ohne Rueckstau"}`);
      await new Promise((w) => setTimeout(w, 500));
    }
  }

  /* ----------------------------------------------------- Hochrechnung */
  const jeEreignisA = (je(p.cpuTotalMs, BURST_EVENTS) + je(z.cpuTotalMs, ticks.length) +
                       je(kAlle.cpuTotalMs, kAlle.ergebnis.angewandt) +
                       je(b.cpuTotalMs, ticks.length)) / 1000;      /* ms */
  const jeEreignisSparsam = (je(p.cpuTotalMs, BURST_EVENTS) + je(z.cpuTotalMs, ticks.length) +
                             je(kWenige.cpuTotalMs, ticks.length) +
                             je(b.cpuTotalMs, ticks.length)) / 1000;
  const jeEreignisIngest = (je(p.cpuTotalMs, BURST_EVENTS) +
                            shardMessungen[1].mikrosekundenJeEreignis) / 1000;
  const sitzungSekunden = 6.5 * 3600;
  const handelstage = 21;

  const hochrechnung = {
    basis: GEMESSEN,
    cpuMsJeEreignis: {
      bauformA_allesEinObjekt: Math.round(jeEreignisA * 1000) / 1000,
      bauformA_sparsam_nurBetrachteteKerzen: Math.round(jeEreignisSparsam * 1000) / 1000,
      bauformB_ingestAnteil: Math.round(jeEreignisIngest * 1000) / 1000
    },
    cpuAnteilBeiGemessenerRate: {
      bauformA: Math.round(jeEreignisA * GEMESSEN.eventsPerSecond / 1000 * 1000) / 1000,
      bauformA_sparsam: Math.round(jeEreignisSparsam * GEMESSEN.eventsPerSecond / 1000 * 1000) / 1000,
      bauformB_ingest: Math.round(jeEreignisIngest * GEMESSEN.eventsPerSecond / 1000 * 1000) / 1000
    },
    ereignisseJeSitzung: Math.round(GEMESSEN.eventsPerSecond * sitzungSekunden),
    ereignisseJeMonat: Math.round(GEMESSEN.eventsPerSecond * sitzungSekunden * handelstage),
    sitzungSekunden, handelstage
  };

  /* ------------------------------------ Kosten nach der Dokumentation */
  const PREISE = {
    quelle: "cloudflare-docs @ raw.githubusercontent.com/cloudflare/cloudflare-docs/production, " +
            "abgerufen 2026-09-17: durable-objects/platform/pricing (partial), " +
            "durable-objects/platform/limits, workers/platform/limits",
    workersPaidBasisUsd: 5,
    anfragenInklusive: 1000000,
    anfragenUsdJeMillion: 0.15,
    websocketVerhaeltnisEingehend: 20,
    dauerInklusiveGBs: 400000,
    dauerUsdJeMillionGBs: 12.5,
    speicherJeObjektGB: 0.128,
    aufrundung: "Abrechenbare Menge wird auf die naechste Abrechnungseinheit aufgerundet " +
                "(Beispiel der Dokumentation: 500.000 GB-s werden als 1.000.000 GB-s berechnet)."
  };
  function kosten(objekte) {
    const nachrichtenMonat = hochrechnung.ereignisseJeMonat;
    const anfragen = Math.ceil(nachrichtenMonat / PREISE.websocketVerhaeltnisEingehend);
    const anfragenUeber = Math.max(0, anfragen - PREISE.anfragenInklusive);
    const anfragenUsd = Math.round(anfragenUeber / 1e6 * PREISE.anfragenUsdJeMillion * 100) / 100;
    const gbs = objekte * PREISE.speicherJeObjektGB * sitzungSekunden * handelstage;
    const gbsUeber = Math.max(0, gbs - PREISE.dauerInklusiveGBs);
    const gbsAufgerundet = gbsUeber > 0 ? Math.ceil(gbsUeber / 1e6) * 1e6 : 0;
    const dauerUsd = Math.round(gbsAufgerundet / 1e6 * PREISE.dauerUsdJeMillionGBs * 100) / 100;
    return {
      objekte,
      eingehendeNachrichtenMonat: nachrichtenMonat,
      abrechenbareAnfragen: anfragen,
      anfragenUeberFreibetrag: anfragenUeber,
      anfragenUsd,
      dauerGBs: Math.round(gbs),
      dauerUeberFreibetragGBs: Math.round(gbsUeber),
      dauerUsd,
      gesamtUsdProMonat: Math.round((PREISE.workersPaidBasisUsd + anfragenUsd + dauerUsd) * 100) / 100
    };
  }
  const kostenmodelle = [1, 2, 3, 5, 9].map(kosten);

  console.log("\n  Kosten nach Dokumentation (20:1 auf eingehende WebSocket-Nachrichten):");
  for (const k of kostenmodelle) {
    console.log(`    ${k.objekte} Objekt(e): Anfragen ${k.anfragenUsd} USD + Dauer ${k.dauerUsd} USD ` +
                `+ Basis 5 USD = ${k.gesamtUsdProMonat} USD/Monat  ` +
                `(Dauer ${k.dauerGBs.toLocaleString("de-DE")} von ${PREISE.dauerInklusiveGBs.toLocaleString("de-DE")} GB-s inklusive)`);
  }

  const bericht = {
    generatedAt: new Date().toISOString(),
    scope: "cloudflareRuntimeLoad",
    note: "Gemessen wird die ARBEITSLAST je Provider-Ereignis in Node (V8), nicht die " +
          "Cloudflare-Plattform. Kurse im Lastlauf sind synthetisch, verlassen den Prozess " +
          "nicht und sind fuer eine Rechenzeitmessung ohne Bedeutung. Titelverteilung und " +
          "Ereignisrate stammen aus der echten Firehose-Messung vom 2026-09-16.",
    laufzeit: { node: process.version, platform: process.platform, arch: process.arch,
                cpus: (await import("node:os")).cpus().length,
                cpuModell: (await import("node:os")).cpus()[0].model },
    eingang: { verteilungsquelle: verteilung.quelle, titel: verteilung.paare.length,
               nachrichtenInStufenmessung: BURST_EVENTS, coalesceMs: COALESCE_MS },
    stufen: {
      parser: { mikrosekundenJeEreignis: je(p.cpuTotalMs, BURST_EVENTS),
                durchsatzJeSekunde: Math.round(BURST_EVENTS / (p.wallMs / 1000)),
                geparst: p.ergebnis.geparst, verworfen: p.ergebnis.verworfen },
      zustand: { mikrosekundenJeEreignis: je(z.cpuTotalMs, ticks.length),
                 titel: z.ergebnis.titel, heapBytes: z.heapDeltaBytes },
      kerzeAlleTitel: { mikrosekundenJeEreignis: je(kAlle.cpuTotalMs, kAlle.ergebnis.angewandt),
                        serien: kAlle.ergebnis.serien, heapBytes: kAlle.heapDeltaBytes },
      kerzeNurBetrachtete: { mikrosekundenJeEreignis: je(kWenige.cpuTotalMs, ticks.length),
                             serien: kWenige.ergebnis.serien, heapBytes: kWenige.heapDeltaBytes,
                             titel: sichtbar.length },
      buendelung: { mikrosekundenJeEreignis: je(b.cpuTotalMs, ticks.length),
                    abonnenten: abos.size, flushes: b.ergebnis.flushes,
                    ausgangBytes: b.ergebnis.bytes },
      shardVerteilung: shardMessungen
    },
    speicher: { ganzeSitzungAlleTitel: speicherVoll, nurBetrachteteTitel: speicherSparsam,
                kurve: speicherKurve },
    getakteteLaeufe: laeufe,
    hochrechnung,
    preise: PREISE,
    kostenmodelle,
    offen: [
      "Cloudflares eigene Verbuchung der CPU-Zeit und der Isolate-Aufschlag sind hier NICHT " +
      "gemessen. Dafuer braucht es ein Konto (Test 1).",
      "Ob eingehende Nachrichten eines AUSGEHENDEN WebSockets ebenso mit 20:1 verbucht werden " +
      "wie die eines angenommenen, steht in der Dokumentation nicht ausdruecklich. Die Rechnung " +
      "hier nimmt an, dass sie verbucht werden - die teurere Annahme."
    ]
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, "runtime-load-verification.json");
  writeFileSync(file, JSON.stringify(bericht, null, 2) + "\n");
  console.log(`\n  Bericht: ${file.replace(root + "/", "")}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
