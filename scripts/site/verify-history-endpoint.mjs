/* =========================================================================
   VISION UNIVERSE — verify-history-endpoint.mjs

   DIE HISTORIENFUNKTION AM ECHTEN SPEICHER.

   api/history.js ist der einzige Weg, auf dem Kursreihen in die
   geschuetzte Vorschau gelangen. Diese Datei ruft ihn so auf, wie der
   Browser es taete - mit einem nachgebauten req/res - und prueft, was
   zurueckkommt.

   Sie prueft ausdruecklich NICHT die Bauart des Speichers; das tut
   verify-history-store.mjs. Hier geht es um die Frage davor: kommt
   durch diesen Endpunkt eine brauchbare Kursreihe, und kommt NICHTS
   heraus, was nicht herauskommen darf.

   H1  Antwortet er ueberhaupt, und mit einer Reihe?
   H2  Ist die Standardnutzlast das Minimum (Datum + Schluss)?
   H3  Liefert columns=ohlcv genau OHLCV und nichts darueber hinaus?
   H4  Schneidet das Fenster?
   H5  Steht in der Antwort kein Zugangsmittel?
   H6  Wird der Anbieter NICHT gefragt?
   H7  Was sagt er zu einem Titel, den es nicht gibt?

   Ausfuehren (braucht die R2-Umgebungsvariablen):
     node scripts/site/verify-history-endpoint.mjs --tickers AAPL,NVDA
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const handler = require(join(root, "api", "history.js"));

const argv = process.argv.slice(2);
function arg(n, d) { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; }
const TICKERS = String(arg("--tickers", "AAPL")).split(",").map((t) => t.trim()).filter(Boolean);
const OUT = arg("--out", join(root, "quant", "data", "market", "history", "endpoint-check.json"));

/* Ein nachgebautes res. Kein Paket dafuer - zwoelf Zeilen. */
function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: null };
  return {
    get statusCode() { return r.statusCode; },
    set statusCode(v) { r.statusCode = v; },
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; },
    end(text) { r.body = text; },
    _: r
  };
}
async function ruf(pfad) {
  const res = fakeRes();
  await handler({ url: pfad, method: "GET", headers: {} }, res);
  let koerper = null;
  try { koerper = JSON.parse(res._.body); } catch (e) { koerper = null; }
  return { status: res._.statusCode, headers: res._.headers, body: koerper };
}

const pruefungen = [];
function pruefe(id, ok, detail) {
  pruefungen.push({ id, status: ok ? "PASS" : "FAIL", detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${id.padEnd(34)} ${detail || ""}`);
  return ok;
}

console.log("Vision Universe — die Historienfunktion am echten Speicher\n");

const befunde = [];
let gelesen = 0, barsGesamt = 0;

for (const ticker of TICKERS) {
  console.log(`  ${ticker}`);
  const a = await ruf(`/api/history?ticker=${encodeURIComponent(ticker)}`);

  if (a.body && a.body.state === "NOT_CONFIGURED") {
    pruefe(`H1_${ticker}_ANTWORTET`, false,
      "Zugangsdaten fehlen in dieser Umgebung - der Speicher wurde nicht befragt.");
    befunde.push({ ticker, state: "NOT_CONFIGURED" });
    continue;
  }

  const da = !!(a.body && a.body.state === "AVAILABLE" && (a.body.bars || []).length);
  pruefe(`H1_${ticker}_ANTWORTET`, da,
    da ? `${a.body.barCount} Kerzen · ${a.body.first} bis ${a.body.last}`
       : `state=${a.body && a.body.state}`);
  if (!da) { befunde.push({ ticker, state: a.body && a.body.state }); continue; }

  gelesen++; barsGesamt += a.body.barCount;

  /* H2 — das Minimum, und wirklich nur das. */
  const felder = Object.keys(a.body.bars[0]).sort();
  pruefe(`H2_${ticker}_MINIMALE_NUTZLAST`,
    felder.length === 2 && felder[0] === "close" && felder[1] === "date",
    felder.join(", "));

  /* H3 — OHLCV auf ausdrueckliche Anfrage. */
  const b = await ruf(`/api/history?ticker=${encodeURIComponent(ticker)}&columns=ohlcv`);
  const vollFelder = b.body && b.body.bars && b.body.bars.length
    ? Object.keys(b.body.bars[0]).sort() : [];
  pruefe(`H3_${ticker}_OHLCV_AUF_ANFRAGE`,
    vollFelder.join(",") === "close,date,high,low,open,volume", vollFelder.join(", "));

  /* H4 — das Fenster schneidet. */
  const ab = a.body.bars[Math.max(0, a.body.bars.length - 20)].date.slice(0, 10);
  const c = await ruf(`/api/history?ticker=${encodeURIComponent(ticker)}&from=${ab}`);
  const geschnitten = c.body && c.body.barCount > 0 && c.body.barCount < a.body.barCount;
  pruefe(`H4_${ticker}_FENSTER_SCHNEIDET`, geschnitten,
    `${a.body.barCount} -> ${c.body && c.body.barCount} ab ${ab}`);

  /* H5 — kein Zugangsmittel in der Antwort. */
  const text = JSON.stringify(a.body) + JSON.stringify(a.headers);
  const leck = [/AKIA[0-9A-Z]{6,}/, /[0-9a-f]{40,}/i]
    .filter((re) => re.test(text));
  pruefe(`H5_${ticker}_KEIN_ZUGANGSMITTEL`, leck.length === 0,
    leck.length ? "VERDACHT: " + leck.join(", ") : "keine Zugangsdaten in der Antwort");

  /* H6 — der Anbieter wurde nicht gefragt. */
  pruefe(`H6_${ticker}_KEINE_ANBIETERANFRAGE`, a.body.providerRequests === 0,
    `providerRequests=${a.body.providerRequests} · source=${a.body.source}`);

  befunde.push({ ticker, state: "AVAILABLE", bars: a.body.barCount,
                 first: a.body.first, last: a.body.last,
                 adjustmentStatus: a.body.adjustmentStatus });
}

/* H7 — ein Titel, den es nicht gibt. */
const fehl = await ruf("/api/history?ticker=ZZZZZZ");
pruefe("H7_UNBEKANNTER_TITEL",
  !!(fehl.body && ["NOT_STORED", "NOT_CONFIGURED"].includes(fehl.body.state)),
  `state=${fehl.body && fehl.body.state}`);

/* Und eine Form, die kein Ticker ist. */
const krumm = await ruf("/api/history?ticker=../../etc/passwd");
pruefe("H8_UNGUELTIGE_FORM_ABGEWIESEN",
  krumm.status === 400 && krumm.body.state === "INVALID_IDENTITY",
  `status=${krumm.status} state=${krumm.body && krumm.body.state}`);

const fehler = pruefungen.filter((p) => p.status === "FAIL");
const bericht = {
  generatedAt: new Date().toISOString(),
  check: "HISTORY_ENDPOINT",
  tickers: TICKERS,
  seriesRead: gelesen,
  barsTotal: barsGesamt,
  R2_READ_STATUS: gelesen ? "OK" : "NOT_VERIFIED",
  checks: pruefungen,
  findings: befunde,
  verdict: fehler.length ? "FAIL" : (gelesen ? "PASS" : "NOT_VERIFIED"),
  note: "Geprueft wird der Endpunkt, nicht die Bauart des Speichers " +
        "(das tut verify-history-store.mjs). Kursniveaus stehen NICHT in " +
        "diesem Bericht - nur Anzahlen, Datumsgrenzen und Zustaende."
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bericht, null, 1) + "\n");

console.log(`\n  Reihen gelesen: ${gelesen}/${TICKERS.length} · Kerzen: ${barsGesamt}`);
console.log(`  Urteil: ${bericht.verdict}`);
console.log(`  ${OUT.replace(root + "/", "")}\n`);
if (fehler.length) process.exit(1);
