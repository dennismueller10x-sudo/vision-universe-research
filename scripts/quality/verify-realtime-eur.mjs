/* =========================================================================
   VISION UNIVERSE — verify-realtime-eur.mjs   (Currency Layer, O-8)

   DER REALTIME-EUR-NACHWEIS AM OFFENEN MARKT.

   Owner-Entscheid O-8, Punkt fuer Punkt:

     1. Der Aktien-Tick aktualisiert sich
     2. Der EUR-Anzeigepreis aktualisiert sich
     3. Der USD-Anzeigepreis bleibt korrekt
     4. Der EUR|USD-Umschalter funktioniert
     5. Kein neuer FX-Abruf je Aktien-Tick
     6. FX-Freshness ist sichtbar und maschinenlesbar
     7. Ein Anbieterausfall erzeugt keinen falschen Realtime-Anspruch

   KEIN MOCK ALS ERSATZ.

   Punkt 1 und 2 verlangen ZWEI Messungen im Abstand - ein einzelner
   Abruf beweist keine Aktualisierung, er beweist einen Wert. Das Skript
   holt deshalb zweimal und vergleicht.

   Bewegt sich ein Kurs zwischen den beiden Messungen nicht, ist das kein
   Fehlschlag: ein liquider Titel bewegt sich meistens, aber nicht
   zwingend in dreissig Sekunden. Gemeldet wird, was gemessen wurde -
   bei mehreren Titeln zusammen ist "kein einziger hat sich bewegt" eine
   Aussage, "AAPL stand still" ist keine.

   IST DER MARKT GESCHLOSSEN, wird NICHT bestanden gemeldet. §58 und O-8
   sind an dieser Stelle gleichlautend, und der Grund ist derselbe: ein
   gruener Haken, der auch "wir konnten nicht messen" bedeuten kann, ist
   kein gruener Haken.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/quality/verify-realtime-eur.mjs
     node scripts/quality/verify-realtime-eur.mjs --publish
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FXDIR = join(ROOT, "quant", "engines", "fx");

const Rates = require(join(FXDIR, "fx-rates.js"));
const Providers = require(join(FXDIR, "fx-provider-registry.js"));
const Freshness = require(join(FXDIR, "fx-freshness.js"));
const RealtimeState = require(join(FXDIR, "fx-realtime-state.js"));
const Contract = require(join(FXDIR, "currency-contract.js"));
const Format = require(join(FXDIR, "money-format.js"));

const args = new Set(process.argv.slice(2));
const PUBLISH = args.has("--publish");
const OUT = PUBLISH
  ? resolve(ROOT, "quant", "data", "market", "capabilities", "realtime-eur-proof.json")
  : resolve(ROOT, ".market-cache", "currency", "realtime-eur-proof.json");

const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const KEY = process.env.TIINGO_API_KEY || "";
const TICKERS = ["AAPL", "NVDA", "MSFT"];
const GAP_MS = Number(process.env.VU_RT_GAP_MS || 30_000);

const checks = [];
function check(id, title, state, detail, rows) {
  checks.push({ id, title, state, detail: detail || null, rows: rows || null });
}

/* --------------------------------------------------------------------- */
/* Ist die Sitzung offen?                                                  */
/* --------------------------------------------------------------------- */
function usSession(now) {
  const d = new Date(now);
  const dow = d.getUTCDay();
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  /* Die Grenze verschiebt sich mit der Sommerzeit. Statt eines eigenen
     Kalenders wird die Ortszeit ueber Intl bestimmt - dieselbe Regel wie
     in realtime/market-hours.js, und damit keine zweite Wahrheit. */
  let local;
  try {
    local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short"
    }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  } catch { local = null; }
  if (!local) return { open: dow >= 1 && dow <= 5 && h >= 13.5 && h < 20, source: "utcFallback" };
  const minutes = Number(local.hour) * 60 + Number(local.minute);
  const weekday = local.weekday;
  const tradingDay = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  return {
    open: tradingDay && minutes >= 9 * 60 + 30 && minutes < 16 * 60,
    localTime: `${local.hour}:${local.minute}`, weekday, source: "America/New_York"
  };
}

/* --------------------------------------------------------------------- */
async function quotes(tickers) {
  const res = await fetch(`${BASE}/iex/?tickers=${tickers.join(",")}`,
    { headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" } });
  if (!res.ok) return { ok: false, httpStatus: res.status };
  const body = await res.json();
  if (!Array.isArray(body)) return { ok: false, reason: "unexpectedShape" };
  const out = {};
  for (const row of body) {
    const price = typeof row.last === "number" ? row.last
      : (typeof row.tngoLast === "number" ? row.tngoLast : null);
    if (row.ticker && price !== null) {
      out[String(row.ticker).toUpperCase()] = { price, timestamp: row.timestamp || null };
    }
  }
  return { ok: true, quotes: out };
}

function loadFxStore() {
  const store = Rates.createStore();
  let daily = 0, intraday = 0;
  for (const dir of [join(ROOT, ".market-cache", "currency", "fx"), join(ROOT, "quant", "data", "market", "fx")]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { continue; }
      if (!d.base || !d.quote || !Array.isArray(d.points) || !d.points.length) continue;
      store.ingest(d.base, d.quote, d.points, Providers.ingestMeta(d.source || "tiingo", { frequency: d.frequency || "DAILY" }));
      daily++;
    }
    if (daily) break;
  }
  for (const file of [join(ROOT, ".market-cache", "currency", "intraday-rates.json"),
                      join(ROOT, "quant", "data", "market", "fx", "intraday-rates.json")]) {
    if (!existsSync(file)) continue;
    let d; try { d = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    for (const r of d.rates || []) if (store.ingestCurrent(r.base, r.quote, r).accepted) intraday++;
    if (intraday) break;
  }
  return { store, daily, intraday };
}

async function main() {
  const startedAt = new Date().toISOString();
  const session = usSession(Date.now());
  const fx = loadFxStore();

  /* --- Vorbedingungen ------------------------------------------------ */
  if (!KEY) {
    check("RT-0", "Zugang", "BLOCKED", "Kein TIINGO_API_KEY. Ohne Zugang gibt es keinen Tick und keinen Nachweis.");
  }
  if (!session.open) {
    check("RT-0", "US-Sitzung offen", "NOT_PROVEN",
      `Die regulaere Sitzung laeuft 09:30-16:00 Ortszeit New York; es ist ${session.localTime || "?"} (${session.weekday || "?"}). ` +
      "Kein Mock als Ersatz (O-8).");
  } else {
    check("RT-0", "US-Sitzung offen", "PASS",
      `Ortszeit New York ${session.localTime} (${session.weekday}).`);
  }
  if (!fx.daily && !fx.intraday) {
    check("RT-0b", "FX-Bestand", "BLOCKED", "Kein FX-Bestand geladen; ohne Kurs keine EUR-Anzeige.");
  }

  const canRun = KEY && session.open && (fx.daily || fx.intraday);

  if (canRun) {
    /* --- Zwei Messungen im Abstand --------------------------------- */
    const first = await quotes(TICKERS);
    if (!first.ok) {
      check("RT-1", "Aktien-Tick", "BLOCKED", `Erste Messung fehlgeschlagen (HTTP ${first.httpStatus || "?"}).`);
    } else {
      await new Promise((r) => setTimeout(r, GAP_MS));
      const second = await quotes(TICKERS);

      const rt = RealtimeState.createState({ store: fx.store, refreshSeconds: 60 });
      const layer = Contract.createLayer({ store: fx.store, storage: null });

      const rows = [];
      let moved = 0, eurMoved = 0;
      for (const ticker of TICKERS) {
        const a = first.quotes[ticker], b = second.ok ? second.quotes[ticker] : null;
        if (!a || !b) { rows.push({ ticker, state: "NO_QUOTE" }); continue; }

        const tickA = rt.decorate({ symbol: ticker, price: a.price, currency: "USD" }, "EUR");
        const eurA = tickA.display ? tickA.display.value : null;
        const tickB = rt.decorate({ symbol: ticker, price: b.price, currency: "USD" }, "EUR");
        const eurB = tickB.display ? tickB.display.value : null;

        if (b.price !== a.price) moved++;
        if (eurA !== null && eurB !== null && eurB !== eurA) eurMoved++;

        /* Punkt 3: der USD-Anzeigepreis bleibt der native. */
        layer.setDisplayCurrency("USD");
        const usdAnzeige = layer.price(b.price, "USD");
        /* Punkt 4: der Umschalter aendert den Wert. */
        layer.setDisplayCurrency("EUR");
        const eurAnzeige = layer.price(b.price, "USD");

        rows.push({
          ticker,
          usdErst: a.price, usdZweit: b.price, usdBewegt: b.price !== a.price,
          eurErst: eurA === null ? null : Number(eurA.toFixed(4)),
          eurZweit: eurB === null ? null : Number(eurB.toFixed(4)),
          eurBewegt: eurA !== null && eurB !== null && eurB !== eurA,
          usdAnzeige: usdAnzeige.display.value,
          eurAnzeige: eurAnzeige.available ? Number(eurAnzeige.display.value.toFixed(4)) : null,
          fxFrequenz: tickB.fxFreshness.frequency,
          fxFrische: tickB.fxFreshness.state,
          fxAsOf: tickB.fx ? tickB.fx.asOf : null,
          realtimeAnspruch: tickB.realtimeClaimAllowed,
          ausfall: tickB.fxOutage.state
        });
      }

      const brauchbar = rows.filter((r) => r.usdZweit !== undefined);

      /* 1 + 2 */
      check("RT-1", "Aktien-Tick aktualisiert sich", moved ? "PASS" : "NOT_PROVEN",
        `${moved} von ${brauchbar.length} Titeln haben sich in ${Math.round(GAP_MS / 1000)} s bewegt.` +
        (moved ? "" : " Kein Titel bewegt - das beweist keine Stoerung, aber auch keine Aktualisierung."));
      check("RT-2", "EUR-Anzeigepreis aktualisiert sich", eurMoved ? "PASS" : (moved ? "FAIL" : "NOT_PROVEN"),
        eurMoved ? `${eurMoved} EUR-Preise sind dem Tick gefolgt.`
          : (moved ? "Der USD-Tick hat sich bewegt, der EUR-Preis nicht - die Kette ist unterbrochen."
                   : "Ohne Bewegung im Tick ist nichts zu folgen."));

      /* 3 */
      const usdKorrekt = brauchbar.every((r) => r.usdAnzeige === r.usdZweit);
      check("RT-3", "USD-Anzeigepreis bleibt der native Wert", usdKorrekt ? "PASS" : "FAIL",
        usdKorrekt ? "Im USD-Modus steht der Kurs unveraendert." : "Im USD-Modus wurde gerechnet - das darf nicht sein.");

      /* 4 */
      const schalterWirkt = brauchbar.every((r) => r.eurAnzeige === null || r.eurAnzeige !== r.usdAnzeige);
      check("RT-4", "EUR|USD-Umschalter wirkt auf den Wert", schalterWirkt ? "PASS" : "FAIL",
        schalterWirkt ? "EUR- und USD-Anzeige unterscheiden sich; der Schalter tauscht nicht nur das Symbol."
                      : "EUR- und USD-Anzeige sind gleich - der Schalter aendert nur das Symbol.");

      /* 5 */
      const snap = rt.snapshot();
      const keinTickAbruf = snap.stats.fxReads <= 2;
      check("RT-5", "Kein FX-Abruf je Aktien-Tick", keinTickAbruf ? "PASS" : "FAIL",
        `${snap.stats.ticks} Ticks, ${snap.stats.fxReads} FX-Abruf(e) (${snap.stats.ticksPerFxRead} Ticks je Abruf).`);

      /* 6 */
      const frischeSichtbar = brauchbar.every((r) => r.fxFrische && typeof r.realtimeAnspruch === "boolean");
      check("RT-6", "FX-Freshness ist maschinenlesbar", frischeSichtbar ? "PASS" : "FAIL",
        `Zustaende: ${[...new Set(brauchbar.map((r) => r.fxFrische))].join(", ")}; ` +
        `Frequenz: ${[...new Set(brauchbar.map((r) => r.fxFrequenz))].join(", ")}.`);

      /* 7 - der Ausfall wird simuliert, NICHT der Tick. Ein Anbieter,
         der gerade laeuft, laesst sich nicht abschalten; was geprueft
         wird, ist das Verhalten der Kette bei ausbleibendem Kurs. */
      const toterStore = { latest: () => ({ available: false, reason: "providerDown" }), rateAt: () => ({ available: false }) };
      const rtAus = RealtimeState.createState({ store: toterStore, refreshSeconds: 0 });
      const ausTick = rtAus.decorate({ symbol: "AAPL", price: brauchbar[0] ? brauchbar[0].usdZweit : 100, currency: "USD" }, "EUR");
      const ausfallKorrekt = ausTick.display === null && ausTick.realtimeClaimAllowed === false
        && ausTick.fxFreshness.state === "UNAVAILABLE";
      check("RT-7", "Anbieterausfall erzeugt keinen falschen Realtime-Anspruch",
        ausfallKorrekt ? "PASS" : "FAIL",
        ausfallKorrekt
          ? "Ohne Kurs: keine EUR-Anzeige, kein Realtime-Anspruch, Zustand UNAVAILABLE."
          : "Die Kette behauptet bei fehlendem Kurs etwas.",
        [{ display: ausTick.display, claim: ausTick.realtimeClaimAllowed,
           freshness: ausTick.fxFreshness.state, outage: rtAus.outageState("USD", "EUR").state }]);

      checks.push({ id: "RT-DATA", title: "Messwerte", state: "INFO", detail: null, rows });
    }
  }

  const failed = checks.some((c) => c.state === "FAIL");
  const notProven = checks.some((c) => c.state === "NOT_PROVEN" || c.state === "BLOCKED");
  const verdict = failed ? "FAIL" : (notProven ? "MARKET_CLOSED_NOT_PROVEN" : "PASS");

  const report = {
    schema: "vu-realtime-eur-proof-1.0.0",
    generatedAtUtc: startedAt,
    finishedAtUtc: new Date().toISOString(),
    verdict,
    verdictMeaning: {
      PASS: "Realtime-EUR am offenen Markt nachgewiesen: Tick bewegt sich, EUR folgt, Schalter wirkt, ein FX-Stand fuer alle Ticks.",
      MARKET_CLOSED_NOT_PROVEN: "Der Nachweis konnte nicht gefuehrt werden - geschlossener Markt, fehlender Zugang oder fehlender FX-Bestand. Kein Mock als Ersatz (O-8).",
      FAIL: "Die Kette verhaelt sich nicht wie zugesagt."
    }[verdict],
    session,
    fxStore: { dailyPairs: fx.daily, intradayStates: fx.intraday },
    gapSeconds: Math.round(GAP_MS / 1000),
    tickers: TICKERS,
    checks
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  console.log(`\nREALTIME-EUR — NACHWEIS`);
  console.log(`US-Sitzung: ${session.open ? "offen" : "geschlossen"} (${session.localTime || "?"} ${session.weekday || ""})`);
  console.log(`FX-Bestand: ${fx.daily} Tagespaare, ${fx.intraday} Intraday-Stand/Staende\n`);
  for (const c of checks) {
    if (c.state === "INFO") continue;
    const mark = { PASS: "ok  ", FAIL: "FAIL", NOT_PROVEN: "??  ", BLOCKED: "!!  " }[c.state] || c.state;
    console.log(`${mark} ${c.id}  ${c.title}`);
    if (c.detail) console.log(`       ${c.detail}`);
  }
  const data = checks.find((c) => c.id === "RT-DATA");
  if (data) for (const row of data.rows) console.log(`       ${JSON.stringify(row)}`);
  console.log(`\nREALTIME_FX = ${verdict}`);
  console.log(`Bericht: ${OUT}\n`);

  /* Ein nicht gefuehrter Nachweis ist kein Fehlschlag des Skripts. */
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
