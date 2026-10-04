#!/usr/bin/env node
/* Practitioner Reference Benchmark — Stichprobenrahmen und systematische Ziehung (Protokoll §4, Nachtrag 1 Punkt 2).

   Festgelegt VOR jeder Extraktion. Eingabe je Quelle: quant/data/technical-intelligence/practitioner-v1/frames/<sourceId>.json
   mit der vollstaendigen Plattform-Liste aller Beitraege im Fenster (items: [id, datum, titel] bzw. [id, datum, titel, kategorien],
   chronologisch AUFSTEIGEND in Plattform-Reihenfolge). Dieses Skript wendet die vorab festgelegten, ergebnisblinden Titelregeln an
   und zieht deterministisch:

     1. Fenster: nur Beitraege mit Datum in [window[0], window[1]] (Datum in der Zeitzone der Quelle).
     2. Ausschluss (Titel/Kategorie, in dieser Reihenfolge; nie nach Ergebnis):
          RETROSPECTIVE   Erfolgs-/Rueckblickstitel bzw. -kategorie (Protokoll §3)
          NON_ANALYSIS    Lehr-, Interview-, Werbe-, Community-Beitraege
          SYSTEM_SIGNALS  Signal-/Screener-Serien ohne Wellenzaehlung (nur Quelle tiedje: alles ohne Elliott-Kennzeichnung im Titel)
          NO_TARGET_INSTRUMENT  Titel nennt kein Zielinstrument (§4: US-/EU-Indizes, grosse US-Aktien, Krypto, Gold, Silber, Oel,
                          Erdgas, Nikkei, MSCI World, EEM; DAX/Euro Stoxx werden als Kandidaten gefuehrt, auch wenn UNMAPPED)
        Die uebrigen Beitraege bilden die Liste E (chronologisch).
     3. Systematische Stichprobe: k = max(1, floor(|E| / sampleTarget)); startIndex = SHA-256("20261004|" + sourceId) mod k
        (erste 8 Hex-Ziffern als Ganzzahl); Stichprobe S = E[startIndex + j·k], j = 0, 1, …
     4. Pilot: m = max(1, floor(|S| / pilotQuota)); p0 = SHA-256("20261004|pilot|" + sourceId) mod m; Pilot = S[p0 + j·m],
        j = 0 … pilotQuota−1 (zeitlich ueber das ganze Fenster gestreut).
     Fallinstrument = erstes im Titel genanntes Zielinstrument (eine Analyse = ein Fall; weitere Instrumente desselben Beitrags
     werden nicht extrahiert, um Klumpung innerhalb eines Beitrags zu vermeiden).

   node scripts/technical/practitioner/sampling-frame.mjs [--write] [--check] [sourceId …]
     ohne --write: Bericht; --write: berechnete Felder (eligibleCount, k, startIndex, sample, pilot, excludedCounts) in die
     Rahmendatei schreiben; --check: Abbruch, wenn gespeicherte und neu berechnete Ziehung abweichen. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PV1 } from "./lib.mjs";

export const FRAME_DIR = join(PV1, "frames");
export const FRAME_SEED = 20261004;
export const RULES_VERSION = "frame-rules-1.0.0";

const B = "(?<![\\p{L}\\p{N}])", E = "(?![\\p{L}\\p{N}])";
const rx = (alts) => new RegExp(B + "(?:" + alts + ")" + E, "iu");
/* Zielinstrumente (Titelerkennung). Reihenfolge = Prioritaet bei der Bestimmung des Fallinstruments, wenn zwei an derselben
   Titelposition beginnen; sonst zaehlt die fruehere Position im Titel. */
export const INSTRUMENT_RULES = [
  ["SPX", rx("s&p ?500|s&p|spx|spy|es_f|e-?mini s&p|sp ?500|us ?500")],
  ["NDX", rx("nasdaq(?: ?100)?|ndx|nq_f|nq|qqq|nas ?100|us ?100|tech ?100")],
  ["DJI", rx("dow(?: jones)?|dji|djia|ym_f|dia|us ?30")],
  ["RUT", rx("russell(?: ?2000)?|rut|iwm|rty|r2k")],
  ["DAX", rx("dax(?:[- ]?future)?|fdax|ger ?40|de ?40")],
  ["ESTX50", rx("euro ?stoxx(?: ?50)?|sx5e|estx ?50|eu ?50|fesx")],
  ["BTC", rx("bitcoin|btc(?:usd)?")],
  ["ETH", rx("ethereum|eth(?:usd)?")],
  ["SOL", rx("solana")],
  ["XRP", rx("xrp|ripple")],
  ["GOLD", rx("gold(?:preis)?|xau(?:usd)?|gc_f")],
  ["SILVER", rx("silver|silber|xag(?:usd)?|si_f")],
  ["OIL", rx("crude(?: oil)?|oil|öl|ölpreis|oelpreis|wti|brent|cl_f|usoil")],
  ["NATGAS", rx("natural gas|erdgas|natgas|ng_f")],
  ["NIKKEI", rx("nikkei(?: ?225)?|n225|jp ?225")],
  ["MSCIWORLD", rx("msci world|urth")],
  ["EEM", rx("eem")],
  ["USSTOCK", rx("apple|aapl|microsoft|msft|nvidia|nvda|amazon|amzn|alphabet|google|googl|meta|facebook|tesla|tsla|netflix|nflx|amd|intel|intc|palantir|pltr|coinbase|microstrategy|mstr|boeing|disney|paypal|pypl|berkshire|jpmorgan|jp morgan|visa|mastercard|broadcom|avgo|oracle|orcl|salesforce|crm|adobe|adbe|uber|micron|qualcomm|qcom|super micro|smci|exxon|xom|chevron|cvx|walmart|costco|mcdonald'?s|coca-cola|pfizer|moderna|nike|starbucks|gamestop|gme|amc|eli lilly|lly|unitedhealth|home depot|goldman sachs|bank of america|citigroup|wells fargo|caterpillar|ibm|cisco|arm holdings|snowflake|shopify|robinhood|hood")]
];
/* Ticker in Klammern/mit $ (z. B. "$AAPL", "(META)", "NYSE: V"): zaehlen als USSTOCK nur, wenn eine VU-Aktienreihe existiert. */
const TICKER_RE = /(?:\$([A-Z]{1,5})(?![A-Za-z])|\(([A-Z]{1,5})\)|(?:NYSE|NASDAQ|Nasdaq|NasdaqGS|AMEX)\s*:\s*\$?([A-Z]{1,5})(?![A-Za-z]))/g;
const NON_STOCK_CODES = new Set(["ES", "NQ", "YM", "RTY", "CL", "NG", "GC", "SI", "HG", "PL", "PA", "ZB", "ZN", "DX", "DXY", "VIX", "SPX", "NDX", "RUT", "DJI", "USD", "EUR", "JPY", "GBP", "AUD", "NZD", "CAD", "CHF", "FX", "ETF", "EW", "TNX", "BTC", "ETH", "XRP", "SOL"]);

export const EXCLUSION_RULES = {
  RETROSPECTIVE: new RegExp([
    "as expected", "presented to members", "perfect reaction", "reaction (?:higher|lower|up|down)? ?from", "react(?:s|ed|ing)? (?:higher|lower|up|down|nicely|strongly)",
    "(?:rall(?:y|ies|ied)|bounce[sd]?|turn(?:s|ed)?|decline[sd]?|drop(?:s|ped)?|push(?:es|ed)?|respond(?:s|ed)?) (?:higher |lower |up |down )?from (?:the )?(?:blue box|equal legs|extreme|support|resistance)",
    "blue box (?:wins?|delivers|worked|reaction)", "targets? (?:hit|reached|achieved)", "hits? (?:the )?targets?", "reached (?:the )?targets?",
    "banking", "profits?(?![a-z])", "(?<![a-z])wins?(?![a-z])", "success", "volltreffer", "topp erwischt", "ging auf", "punktlandung", "hut ab", "bingo",
    "ziel erreicht", "im ziel", "hat geklappt", "wie erwartet", "wie prognostiziert", "treffer", "gewinne? (?:mitgenommen|realisiert|eingefahren)", "lehrbuch"
  ].join("|"), "iu"),
  RETROSPECTIVE_CATEGORIES: new Set(["Blue Box Wins", "Aidans Corner"]),
  NON_ANALYSIS: new RegExp([
    "lernen", "grundlagen", "interview", "abonnenten", "special", "webinar", "tutorial", "education(?:al)?", "lesson", "how to", "introduction",
    "einfach erklärt", "live[- ]?trading", "podcast", "q ?& ?a", "giveaway", "rabatt", "gewinnspiel", "in case you missed it", "sentiment speaks",
    "don.t bank on it", "dividend", "thank you", "newsletter", "ankündigung", "announcement"
  ].join("|"), "iu"),
  SYSTEM_SIGNALS: /einstiegs- und zielmarken|ten o.?clock postman|sweet sixteen|ice revelator|screener|trading-?service|wochenpass/iu,
  /* tiedje: Nur Beitraege, die der Autor selbst als Elliott-Analyse kennzeichnet ("EW Analyse", "EW-Analyse", "EW Video Analyse",
     "Elliott Wellen …"). Die Serien "DOW - …", "DAX - …", "ICE - …" sind Tabellen eines Handelssystems (ICE) ohne Wellenzaehlung
     (geprueft an drei Beispielen vor der Ziehung) → SYSTEM_SIGNALS. */
  TIEDJE_ELLIOTT_LABEL: /(?<![\p{L}])(?:EW|Elliott)(?![\p{L}])/iu
};

let _tickers = null;
function vuTickers() {
  if (_tickers) return _tickers;
  const dir = join(PV1, "..", "..", "market", "discover-series-long");
  _tickers = new Set(existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("ref_")).map((f) => f.slice(4, -5)) : []);
  return _tickers;
}
/** Erstes Zielinstrument im Titel (frueheste Position) oder null. */
export function titleInstrument(title, tickers = vuTickers()) {
  let best = null;
  INSTRUMENT_RULES.forEach(([key, re], pri) => { const m = re.exec(title); if (m && (!best || m.index < best.pos || (m.index === best.pos && pri < best.pri))) best = { key, pos: m.index, pri, text: m[0] }; });
  for (const m of String(title).matchAll(TICKER_RE)) {
    const t = m[1] || m[2] || m[3];
    if (t && !NON_STOCK_CODES.has(t) && tickers.has(t) && (!best || m.index < best.pos)) best = { key: "USSTOCK", pos: m.index, pri: 99, text: t };
  }
  return best ? { key: best.key, text: best.text } : null;
}
export function classifyItem(item, sourceId, opts = {}) {
  const [, , title, cats] = item;
  if ((cats || []).some((c) => EXCLUSION_RULES.RETROSPECTIVE_CATEGORIES.has(c))) return { status: "EXCLUDED_RETROSPECTIVE" };
  if (EXCLUSION_RULES.RETROSPECTIVE.test(title)) return { status: "EXCLUDED_RETROSPECTIVE" };
  if (EXCLUSION_RULES.NON_ANALYSIS.test(title)) return { status: "EXCLUDED_NON_ANALYSIS" };
  if (sourceId === "tiedje" && (EXCLUSION_RULES.SYSTEM_SIGNALS.test(title) || !EXCLUSION_RULES.TIEDJE_ELLIOTT_LABEL.test(title))) return { status: "EXCLUDED_SYSTEM_SIGNALS" };
  /* instrumentFilter "AT_DRAW": Titel der Quelle nennen das Instrument meist nicht (ewt-gilburt) → Instrument wird erst am gezogenen
     Beitrag bestimmt; kein Zielinstrument → dort als EXCLUDED_NO_TARGET_INSTRUMENT gezaehlt. */
  if (opts.instrumentFilter === "AT_DRAW") { const ins = titleInstrument(title); return { status: "ELIGIBLE", instrument: ins ? ins.key : "AT_DRAW" }; }
  const ins = titleInstrument(title);
  if (!ins) return { status: "EXCLUDED_NO_TARGET_INSTRUMENT" };
  return { status: "ELIGIBLE", instrument: ins.key, instrumentText: ins.text };
}
export const seedMod = (s, k) => parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16) % k;

/** Berechnet die Ziehung fuer eine Rahmendatei (rein, deterministisch). */
export function drawFrame(frame) {
  const { sourceId, window: w } = frame;
  /* itemsAreWindow: Liste ist bereits exakt auf das Fenster begrenzt (YouTube: Grenzen per exaktem Upload-Datum bestimmt,
     Einzeldaten nur ungefaehr) – dann kein Datumsfilter. */
  const inWin = frame.itemsAreWindow ? frame.items : frame.items.filter((it) => it[1].slice(0, 10) >= w[0] && it[1].slice(0, 10) <= w[1]);
  const excludedCounts = {}, eligible = [];
  inWin.forEach((it) => { const c = classifyItem(it, sourceId, { instrumentFilter: frame.instrumentFilter }); if (c.status === "ELIGIBLE") eligible.push({ id: it[0], date: it[1], instrument: c.instrument }); else excludedCounts[c.status] = (excludedCounts[c.status] || 0) + 1; });
  const k = Math.max(1, Math.floor(eligible.length / frame.sampleTarget));
  const startIndex = seedMod(FRAME_SEED + "|" + sourceId, k);
  const sample = [];
  for (let i = startIndex; i < eligible.length; i += k) sample.push(eligible[i]);
  const m = Math.max(1, Math.floor(sample.length / Math.max(1, frame.pilotQuota)));
  const p0 = seedMod(FRAME_SEED + "|pilot|" + sourceId, m);
  const pilot = [];
  for (let j = 0; j < frame.pilotQuota && p0 + j * m < sample.length; j++) pilot.push(sample[p0 + j * m]);
  /* Pilot-Erweiterung (vorab festgelegt, 04.10.2026, bevor eines dieser Elemente gesichtet wurde): reicht der Pilot nicht fuer
     20–30 Faelle, werden zusaetzlich die Mittelpunkte zwischen den Pilotpositionen gezogen: S[p0 + j·m + floor(m/2)],
     j = 0 … pilotExtensionQuota−1. Der urspruengliche Pilot bleibt unveraendert. */
  const ext = [], half = Math.floor(m / 2);
  for (let j = 0; j < (frame.pilotExtensionQuota || 0) && p0 + j * m + half < sample.length; j++) if (half > 0) ext.push(sample[p0 + j * m + half]);
  return { rulesVersion: RULES_VERSION, pilotExtension: ext.map((s) => [s.id, s.instrument]), frameSize: inWin.length, excludedCounts, eligibleCount: eligible.length, stepK: k, startIndex,
           sample: sample.map((s) => [s.id, s.instrument]), pilotStepM: m, pilotStartIndex: p0, pilot: pilot.map((s) => [s.id, s.instrument]) };
}

function main(argv) {
  const write = argv.includes("--write"), check = argv.includes("--check");
  const ids = argv.filter((a) => !a.startsWith("--"));
  const files = readdirSync(FRAME_DIR).filter((f) => f.endsWith(".json")).filter((f) => !ids.length || ids.includes(f.slice(0, -5)));
  let bad = 0;
  for (const f of files) {
    const p = join(FRAME_DIR, f), frame = JSON.parse(readFileSync(p, "utf8"));
    const d = drawFrame(frame);
    if (check) {
      const keys = ["frameSize", "eligibleCount", "stepK", "startIndex", "sample", "pilot", "pilotExtension"];
      const diff = keys.filter((k) => JSON.stringify(frame.draw && frame.draw[k]) !== JSON.stringify(d[k]));
      if (diff.length) { bad++; console.error(`${frame.sourceId}: gespeicherte Ziehung weicht ab (${diff.join(", ")})`); }
    }
    if (write) { frame.draw = d; writeFileSync(p, JSON.stringify(frame).replace(/\],\[/g, "],\n[") + "\n"); }
    console.log(`${frame.sourceId}: Rahmen ${d.frameSize}, ausgeschlossen ${JSON.stringify(d.excludedCounts)}, E=${d.eligibleCount}, k=${d.stepK}, start=${d.startIndex}, Stichprobe ${d.sample.length}, Pilot ${d.pilot.length} (m=${d.pilotStepM}, p0=${d.pilotStartIndex})`);
  }
  if (bad) process.exit(1);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
