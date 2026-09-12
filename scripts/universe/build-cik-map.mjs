/* =========================================================================
   VISION UNIVERSE — build-cik-map.mjs   (§23, §25)

   Baut die CIK-Zuordnung fuer das gesamte US-Universum aus den beiden
   offiziellen SEC-Verzeichnissen. Nicht von Hand, nicht je Titel eine
   Anfrage: zwei Dateien, und darin steht der ganze Markt.

     https://www.sec.gov/files/company_tickers.json
     https://www.sec.gov/files/company_tickers_exchange.json

   WAS DAS LOEST

   Zweierlei auf einmal. Erstens die CIK - ohne sie kann die
   SEC-Fundamentalpipeline einen Titel nicht abrufen, und bis hierher
   standen genau fuenf CIKs von Hand in quant/config/sec-universe.json.
   Zweitens den FIRMENNAMEN: die Tickerliste des Kursanbieters traegt
   keinen, und ohne Namen findet eine Suche nach "NVIDIA" nichts (§17).
   Die SEC fuehrt beides und stellt es ohne Vertrag und ohne Kosten
   bereit (§32).

   SEC-ETIKETTE (§25)

   Ein sprechender User-Agent mit Kontaktadresse, hoechstens fuenf
   Anfragen je Sekunde, Backoff bei 429/503, und ein Zwischenspeicher,
   damit ein zweiter Lauf gar nicht erst fragt. Fuer den ganzen Markt
   sind es ZWEI Anfragen - nicht tausende (§25).

   OHNE NETZ

   Ist sec.gov aus der Bauumgebung nicht erreichbar (Egress-Proxy), wird
   KEINE Ersatzzuordnung gebaut. Das Artefakt traegt dann status
   UNAVAILABLE mit dem HTTP-Befund, und der Company Master behaelt seine
   bestehenden CIKs. Eine geratene CIK zoege eine falsche Bilanz nach
   sich.

   Ausfuehren:
     node scripts/universe/build-cik-map.mjs
     SEC_USER_AGENT="Name kontakt@example.com" node scripts/universe/build-cik-map.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}

/* Ein absoluter Pfad bleibt absolut. join(root, "/tmp/x") ergibt
   "<root>/tmp/x" - die Datei landet dann im Repository statt dort, wo sie
   hin sollte. Gefunden hat das ein Test, der in ein Verzeichnis unter
   /tmp schreiben wollte und dabei das Arbeitsverzeichnis verschmutzt hat. */
function pfad(p) { return p.startsWith("/") ? p : join(root, p); }

const OUT_FILE = pfad(arg("--out", "quant/data/universe/cik-map.json"));
const CACHE_DIR = join(root, ".sec-cache", "universe");
const USER_AGENT = process.env.SEC_USER_AGENT || "VisionUniverseResearch info@visionuniverse.de";

const SOURCES = [
  { id: "company_tickers", url: "https://www.sec.gov/files/company_tickers.json" },
  { id: "company_tickers_exchange", url: "https://www.sec.gov/files/company_tickers_exchange.json" }
];

/* Fuenf Anfragen je Sekunde ist die Haelfte dessen, was die SEC nennt.
   Bei zwei Dateien spielt es keine Rolle - die Schranke steht hier,
   damit sie auch dann gilt, wenn jemand dieses Skript spaeter in eine
   Schleife stellt. */
const MIN_INTERVAL_MS = 200;
let lastRequest = 0;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson(url, attempt) {
  attempt = attempt || 1;
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequest));
  if (wait) await sleep(wait);
  lastRequest = Date.now();

  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json",
                 "Accept-Encoding": "gzip, deflate" }
    });
  } catch (err) {
    if (attempt < 3) { await sleep(1000 * Math.pow(2, attempt)); return fetchJson(url, attempt + 1); }
    throw new Error("Netzwerk: " + err.message);
  }
  if (res.status === 429 || res.status === 503) {
    if (attempt < 4) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
      await sleep(retryAfter ? retryAfter * 1000 : 1000 * Math.pow(2, attempt));
      return fetchJson(url, attempt + 1);
    }
  }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/** company_tickers.json: { "0": {cik_str, ticker, title}, ... } */
function parseTickerFile(payload) {
  const out = [];
  for (const row of Object.values(payload || {})) {
    if (!row || !row.ticker) continue;
    out.push({
      ticker: String(row.ticker).toUpperCase(),
      cik: String(row.cik_str).padStart(10, "0"),
      name: String(row.title || "").trim() || null,
      exchange: null
    });
  }
  return out;
}

/** company_tickers_exchange.json: { fields: [...], data: [[...], ...] } */
function parseExchangeFile(payload) {
  const fields = (payload && payload.fields) || [];
  const iCik = fields.indexOf("cik"), iName = fields.indexOf("name");
  const iTicker = fields.indexOf("ticker"), iExchange = fields.indexOf("exchange");
  if (iCik < 0 || iTicker < 0) return [];
  return (payload.data || []).map((row) => ({
    ticker: String(row[iTicker] || "").toUpperCase(),
    cik: String(row[iCik]).padStart(10, "0"),
    name: iName >= 0 && row[iName] ? String(row[iName]).trim() : null,
    exchange: iExchange >= 0 && row[iExchange] ? String(row[iExchange]).trim() : null
  })).filter((r) => r.ticker);
}

async function load(source) {
  const cacheFile = join(CACHE_DIR, source.id + ".json");
  try {
    const payload = await fetchJson(source.url);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(payload));
    return { status: "FETCHED", payload };
  } catch (err) {
    if (existsSync(cacheFile)) {
      return { status: "FROM_CACHE", payload: JSON.parse(readFileSync(cacheFile, "utf8")),
               error: err.message };
    }
    return { status: "UNAVAILABLE", payload: null, error: err.message };
  }
}

async function main() {
  console.log("Vision Universe — CIK-Zuordnung aus den SEC-Verzeichnissen\n");
  console.log("  User-Agent: " + USER_AGENT);

  const results = {};
  for (const s of SOURCES) {
    const r = await load(s);
    results[s.id] = r;
    console.log(`  ${s.id.padEnd(26)} ${r.status}${r.error ? "  (" + r.error + ")" : ""}`);
  }

  const rowsA = results.company_tickers.payload ? parseTickerFile(results.company_tickers.payload) : [];
  const rowsB = results.company_tickers_exchange.payload
    ? parseExchangeFile(results.company_tickers_exchange.payload) : [];

  if (!rowsA.length && !rowsB.length) {
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: "UNAVAILABLE",
      source: "sec.gov",
      reason: "Keines der beiden SEC-Verzeichnisse war abrufbar.",
      errors: SOURCES.map((s) => ({ id: s.id, url: s.url, error: results[s.id].error || null })),
      note: "Es wird ausdruecklich KEINE ersatzweise CIK-Zuordnung gebaut. Der Company Master " +
            "behaelt die CIKs, die er bereits hat; alles andere bleibt null und damit " +
            "HAS_SEC = false. Eine geratene CIK zieht eine falsche Fundamentalbilanz nach sich.",
      byTicker: {}
    }, null, 2) + "\n");
    console.log("\n  Nicht abrufbar. Artefakt mit status UNAVAILABLE geschrieben.");
    console.log("  " + OUT_FILE.replace(root + "/", ""));
    process.exitCode = 0;
    return;
  }

  /* Zusammenfuehren. Die Boersendatei ist die genauere Quelle (sie traegt
     den Handelsplatz), die Basisdatei die vollstaendigere. Wo beide etwas
     sagen, gewinnt die Boersendatei - und wo nur eine etwas sagt, steht
     das im Feld `source`. */
  const byTicker = new Map();
  const ambiguous = [];
  for (const r of rowsA) {
    if (!byTicker.has(r.ticker)) {
      byTicker.set(r.ticker, Object.assign({}, r, { source: "company_tickers", status: "RESOLVED" }));
    }
  }
  for (const r of rowsB) {
    const prev = byTicker.get(r.ticker);
    if (!prev) {
      byTicker.set(r.ticker, Object.assign({}, r,
        { source: "company_tickers_exchange", status: "RESOLVED" }));
      continue;
    }
    if (prev.cik !== r.cik) {
      /* Zwei SEC-Verzeichnisse, zwei CIKs fuer dasselbe Kuerzel.

         Frueher gewann hier die Boersendatei. Das war eine Wahl und
         keine Aufloesung: §3 verlangt ausdruecklich, dass ambige Faelle
         markiert werden und keine CIK geraten wird. Der Eintrag traegt
         deshalb AMBIGUOUS und BEIDE Kandidaten - und bekommt keine CIK.
         Wer ihn aufloesen will, braucht die Einreichungsuebersicht, nicht
         eine Vorrangregel. */
      ambiguous.push({ ticker: r.ticker, candidates: [
        { cik: prev.cik, name: prev.name, source: "company_tickers" },
        { cik: r.cik, name: r.name, exchange: r.exchange, source: "company_tickers_exchange" }
      ]});
      byTicker.set(r.ticker, {
        ticker: r.ticker, cik: null, name: r.name || prev.name,
        exchange: r.exchange || prev.exchange,
        source: "company_tickers+company_tickers_exchange",
        status: "AMBIGUOUS",
        candidates: [prev.cik, r.cik]
      });
      continue;
    }
    byTicker.set(r.ticker, {
      ticker: r.ticker,
      cik: r.cik,
      name: r.name || prev.name,
      exchange: r.exchange || prev.exchange,
      source: "company_tickers_exchange",
      status: "RESOLVED"
    });
  }

  /* Eine CIK mit mehreren Kuerzeln ist der Normalfall (Aktienklassen,
     Vorzuege) und kein Befund. Gezaehlt wird sie trotzdem: ohne die Zahl
     liest sich "12.000 Kuerzel" wie "12.000 Unternehmen". */
  const ciks = new Set();
  const tickersPerCik = new Map();
  for (const r of byTicker.values()) {
    if (!r.cik) continue;
    ciks.add(r.cik);
    tickersPerCik.set(r.cik, (tickersPerCik.get(r.cik) || 0) + 1);
  }
  const multi = Array.from(tickersPerCik.values()).filter((n) => n > 1).length;

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: results.company_tickers.status === "FETCHED" ||
            results.company_tickers_exchange.status === "FETCHED" ? "OK" : "FROM_CACHE",
    source: "sec.gov",
    sources: SOURCES.map((s) => ({ id: s.id, url: s.url, status: results[s.id].status,
                                   rows: s.id === "company_tickers" ? rowsA.length : rowsB.length,
                                   error: results[s.id].error || null })),
    userAgent: USER_AGENT,
    requests: SOURCES.length,
    totals: {
      tickers: byTicker.size,
      resolved: Array.from(byTicker.values()).filter((r) => r.status === "RESOLVED").length,
      ambiguous: ambiguous.length,
      distinctCiks: ciks.size,
      ciksWithMultipleTickers: multi,
      ciksWithMultipleTickersNote:
        "Kein Befund. Aktienklassen und Vorzuege desselben Emittenten teilen sich eine CIK - " +
        "genau deshalb gehoeren Fundamentaldaten an den Emittenten und nicht an das Papier (§15).",
      withExchange: Array.from(byTicker.values()).filter((r) => r.exchange).length,
      withName: Array.from(byTicker.values()).filter((r) => r.name).length
    },
    ambiguous,
    note: "Kuerzel -> CIK + Firmenname, wie die SEC sie fuehrt. Die SEC ist die Autoritaet fuer " +
          "die CIK; ein Kuerzel, das hier fehlt, hat keinen US-Einreicher - kein Fehler, sondern " +
          "ein Befund (auslaendische Emittenten ohne 20-F, ETFs, delistete Titel).",
    byTicker: Object.fromEntries(
      Array.from(byTicker.entries()).sort().map(([k, v]) => [k, {
        cik: v.cik, name: v.name, exchange: v.exchange, source: v.source,
        status: v.status, candidates: v.candidates || undefined
      }]))
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");

  console.log(`\n  ${out.totals.tickers} Kuerzel · ${out.totals.resolved} aufgeloest · ` +
              `${out.totals.ambiguous} ambig · ${out.totals.distinctCiks} CIKs · ` +
              `${out.totals.withName} mit Namen`);
  console.log("  " + OUT_FILE.replace(root + "/", ""));
}

main().catch((err) => { console.error(err); process.exit(1); });
