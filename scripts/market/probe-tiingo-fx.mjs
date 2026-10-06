/* =========================================================================
   VISION UNIVERSE — probe-tiingo-fx.mjs   (Currency Layer, O-1)

   MISST, WAS DER BESTEHENDE TIINGO-ZUGANG AN FX TATSAECHLICH LIEFERT.

   Der Owner-Entscheid O-1 ist eindeutig: keine Faehigkeit darf aus
   Dokumentation oder Vermutung als verfuegbar gelten. Gemessen wird.

   Dieses Skript ruft die FX-Endpunkte mit dem vorhandenen Schluessel auf
   und haelt je Faehigkeit fest, WAS GEANTWORTET HAT - Statuscode, Form der
   Antwort, Anzahl der Beobachtungen, aelteste Beobachtung,
   Zeitstempelsemantik, Verhalten an Wochenenden und Feiertagen.

   Es aendert nichts am Tarif. Es aktiviert nichts. Es bindet keine zweite
   Quelle an. Es liest, und es zaehlt jede Anfrage.

   ZUM SCHLUESSEL

   Er kommt ausschliesslich aus der Umgebung und steht im
   Authorization-Header, nie in der URL. Eine geloggte oder berichtete URL
   verraet ihn deshalb nicht. Zusaetzlich laeuft jeder Bericht vor dem
   Schreiben durch redact(): faende sich der Schluessel doch irgendwo in
   einer Fehlermeldung des Anbieters, wuerde er ersetzt, bevor die Datei
   entsteht. Zwei Verteidigungslinien, weil der Bericht committet wird.

   OHNE SCHLUESSEL bricht das Skript nicht ab. Es schreibt einen Bericht,
   in dem jede Faehigkeit `null` traegt (= ungeprueft), und endet mit 0.
   Ein fehlender Zugang ist eine Konfigurationsfrage, kein Baufehler.

   WAS DIESES SKRIPT NICHT BEANTWORTET

   Ob wir die Ergebnisse oeffentlich zeigen duerfen. Ein erfolgreicher
   Abruf ist eine technische Tatsache und keine Lizenz. Die Rechtsfrage
   beantwortet quant/engines/display-policy.js mit einem Eintrag, den
   jemand mit Datum und Grundlage setzt. Was hier gemessen werden KANN,
   ist die technische Seite der Produktionsnutzbarkeit: antwortet der
   Endpunkt, wie tief reicht die Historie, wie frisch ist der letzte Stand.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/probe-tiingo-fx.mjs
     node scripts/market/probe-tiingo-fx.mjs --dry-run
     node scripts/market/probe-tiingo-fx.mjs --publish
   ========================================================================= */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FxCapability = require(join(root, "quant", "engines", "fx", "fx-capability.js"));
const Capabilities = require(join(root, "quant", "engines", "capabilities.js"));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const PUBLISH = args.has("--publish");
const OUT = PUBLISH
  ? resolve(root, "quant", "data", "market", "capabilities", "tiingo-fx-probe.json")
  : resolve(root, ".market-cache", "currency", "tiingo-fx-probe.json");

const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const KEY = process.env.TIINGO_API_KEY || "";

/* --------------------------------------------------------------------- */
/* Schluessel-Redaktion                                                    */
/* --------------------------------------------------------------------- */
function redact(value) {
  if (!KEY || KEY.length < 8) return value;
  const json = JSON.stringify(value);
  if (!json.includes(KEY)) return value;
  return JSON.parse(json.split(KEY).join("[REDACTED]"));
}

/* --------------------------------------------------------------------- */
/* Welche Paare gebraucht werden - datengetrieben (O-3)                    */
/* --------------------------------------------------------------------- */
function requiredPairs() {
  const candidates = [
    resolve(root, "quant", "data", "market", "fx", "pair-requirements.json"),
    resolve(root, ".market-cache", "currency", "pair-requirements.json")
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const data = JSON.parse(readFileSync(file, "utf8"));
    return { source: file.replace(root + "/", ""), pairs: data.pairs || [] };
  }
  return { source: null, pairs: [] };
}

const REQUIREMENTS = requiredPairs();

/* Tiingo notiert FX-Paare als zusammengesetztes Kleinbuchstaben-Symbol. */
function tiingoTicker(base, quote) { return (base + quote).toLowerCase(); }

/* WELCHE RICHTUNG FUEHRT DER ANBIETER?

   Der erste Produktivlauf (35696630585) hat die Frage beantwortet, bevor
   sie jemand gestellt hatte: `eurusd` lieferte neun Tageszeilen, `usdeur`
   lieferte HTTP 200 mit einem LEEREN Array. Tiingo folgt der
   Marktkonvention - EUR/USD wird mit EUR als Basis notiert, die
   Gegenrichtung gibt es nicht als eigene Reihe.

   Der Lauf meldete daraufhin jede Faehigkeit als ungeprueft, weil alle
   Sonden auf `usdeur` liefen. Die Sonden waren richtig; das Symbol war
   eine Annahme.

   Deshalb wird die Richtung jetzt GEMESSEN, nicht gewaehlt: beide
   Schreibweisen werden einmal befragt, und die antwortende gewinnt. Was
   der Store daraus macht, ist ohnehin dasselbe - fx-rates.js invertiert
   (DERIVATION INVERSE, exakte Identitaet), und genau dafuer gibt es die
   Inversion.

   Ein leeres Array bei HTTP 200 ist bei diesem Anbieter die Antwort
   "dieses Paar fuehre ich nicht". Das ist eine Aussage ueber das PAAR,
   nicht ueber die FAEHIGKEIT - und die beiden auseinanderzuhalten ist
   der ganze Zweck dieses Schritts. */
const tickerCache = new Map();

async function resolveTicker(base, quote) {
  const key = `${base}/${quote}`;
  if (tickerCache.has(key)) return tickerCache.get(key);

  const window = `resampleFreq=1day&startDate=${isoDaysAgo(12)}`;
  const candidates = [
    { ticker: tiingoTicker(base, quote), direction: "DIRECT", base, quote },
    { ticker: tiingoTicker(quote, base), direction: "INVERSE", base: quote, quote: base }
  ];

  const attempts = [];
  for (const candidate of candidates) {
    const res = await call(`/tiingo/fx/${candidate.ticker}/prices?${window}`);
    const list = rows(res.body) || [];
    attempts.push({ ticker: candidate.ticker, direction: candidate.direction,
                    httpStatus: res.status, observations: list.length,
                    lastDate: list.length ? String(list[list.length - 1].date).slice(0, 10) : null });
    if (res.ok && list.length) {
      const resolved = { ...candidate, served: true, observations: list.length, attempts,
                         lastDate: attempts[attempts.length - 1].lastDate };
      tickerCache.set(key, resolved);
      return resolved;
    }
    /* 403/404 ist eine Zugangsaussage und gilt fuer beide Schreibweisen -
       dann lohnt die zweite Anfrage nicht. */
    if (res.status === 403 || res.status === 404) break;
  }

  const resolved = { ticker: null, direction: null, served: false, observations: 0, attempts,
                     base, quote,
                     reason: attempts.some((a) => a.httpStatus === 403 || a.httpStatus === 404)
                       ? "accessDenied" : "pairNotServed" };
  tickerCache.set(key, resolved);
  return resolved;
}

/* Die Paare, die gemessen werden. Bewusst nicht alle 62: jede Anfrage
   geht vom selben Kontingent ab wie die Kursabrufe, und eine
   Faehigkeitsaussage braucht Stichproben, keinen Vollbestand.

   Gewaehlt werden die groessten nach Titelzahl plus - falls nicht schon
   enthalten - die Gegenrichtung von USD/EUR. Beide Richtungen zu messen
   ist kein Luxus: liefert Tiingo nur eine, muss die Engine invertieren,
   und dann muss belegt sein, DASS sie invertieren muss. */
function pairsToProbe(limit = 6) {
  const ranked = REQUIREMENTS.pairs.slice().sort((a, b) => b.securities - a.securities);
  const chosen = [];
  for (const p of ranked) {
    if (chosen.length >= limit) break;
    if (chosen.some((c) => c.base === p.base && c.quote === p.quote)) continue;
    chosen.push({ base: p.base, quote: p.quote, securities: p.securities, priority: p.priority });
  }
  const hasUsdEur = chosen.some((c) => c.base === "USD" && c.quote === "EUR");
  const hasEurUsd = chosen.some((c) => c.base === "EUR" && c.quote === "USD");
  if (hasUsdEur && !hasEurUsd) chosen.push({ base: "EUR", quote: "USD", securities: null, priority: "DIRECTION_CHECK" });
  if (!hasUsdEur) chosen.unshift({ base: "USD", quote: "EUR", securities: null, priority: "DIRECTION_CHECK" });
  return chosen;
}

const PROBE_PAIRS = pairsToProbe();
const PRIMARY = PROBE_PAIRS[0] || { base: "USD", quote: "EUR" };

/* --------------------------------------------------------------------- */
/* Transport                                                               */
/* --------------------------------------------------------------------- */
let requestCount = 0;
const rateLimitHeaders = {};

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function call(path) {
  const url = BASE + path;
  requestCount++;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" }
    });
    const durationMs = Date.now() - started;
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* keine JSON-Antwort */ }

    /* Kontingentangaben, falls der Anbieter welche sendet. Sie werden
       gesammelt und nicht interpretiert: ein Header, den es nicht gibt,
       wird nicht zu einer Zahl. */
    for (const [name, value] of res.headers.entries()) {
      if (/rate|limit|quota|remaining|retry/i.test(name)) rateLimitHeaders[name] = value;
    }

    return { ok: res.ok, status: res.status, durationMs, body,
             sample: text.slice(0, 240), path };
  } catch (err) {
    return { ok: false, status: null, durationMs: Date.now() - started, body: null,
             sample: null, path, networkError: String(err && err.message || err) };
  }
}

/* --------------------------------------------------------------------- */
/* Befunde                                                                 */
/* --------------------------------------------------------------------- */
const findings = [];
const measured = {};
const evidence = {};

function note(capability, result, verificationLevel, detail, extra) {
  findings.push({ capability, result, verificationLevel, detail, ...(extra || {}) });
  /* Ein einmal belegtes true wird von einem spaeteren null nicht
     zurueckgenommen, und ein gemessenes false nicht von einem
     unschluessigen Lauf. Die staerkste Aussage gewinnt. */
  const rank = { true: 3, false: 2, null: 1 };
  const current = measured[capability];
  if (current === undefined || rank[String(result)] > rank[String(current)]) {
    measured[capability] = result;
    evidence[capability] = { verificationLevel, reason: detail, measuredAt: new Date().toISOString(), ...(extra || {}) };
  }
}

/** Ein HTTP-Fehler, der eine Aussage traegt - und einer, der keine traegt. */
function classifyFailure(res) {
  if (res.networkError) {
    return { result: null, level: "INCONCLUSIVE",
             detail: `Abruf fehlgeschlagen: ${res.networkError}. Ein Netzfehler belegt keine fehlende Faehigkeit.` };
  }
  if (res.status === 403 || res.status === 404) {
    return { result: false, level: "MEASURED_ABSENT",
             detail: `HTTP ${res.status}: der Zugang deckt diesen Endpunkt nicht ab.` };
  }
  if (res.status === 429) {
    return { result: null, level: "INCONCLUSIVE",
             detail: "HTTP 429: Kontingent erschoepft. Das ist eine Aussage ueber die Grenze, nicht ueber die Faehigkeit." };
  }
  return { result: null, level: "INCONCLUSIVE",
           detail: `HTTP ${res.status}: keine belastbare Aussage.` };
}

function rows(body) { return Array.isArray(body) ? body : null; }

/* --------------------------------------------------------------------- */
/* Die Messungen                                                           */
/* --------------------------------------------------------------------- */

async function probeQuote(resolvedPrimary) {
  if (!resolvedPrimary.served) {
    note("fxCurrent", resolvedPrimary.reason === "accessDenied" ? false : null,
      resolvedPrimary.reason === "accessDenied" ? "MEASURED_ABSENT" : "INCONCLUSIVE",
      `Weder ${resolvedPrimary.attempts.map((a) => a.ticker).join(" noch ")} wird gefuehrt. ` +
      "Ohne ein antwortendes Symbol laesst sich die Faehigkeit nicht messen.",
      { attempts: resolvedPrimary.attempts });
    return null;
  }
  const ticker = resolvedPrimary.ticker;
  const res = await call(`/tiingo/fx/top?tickers=${ticker}`);
  if (!res.ok) {
    const f = classifyFailure(res);
    note("fxCurrent", f.result, f.level, f.detail, { httpStatus: res.status, ticker });
    return null;
  }
  const list = rows(res.body);
  const first = list && list[0];
  const hasPrice = first && (typeof first.midPrice === "number" || typeof first.bidPrice === "number" ||
                             typeof first.askPrice === "number" || typeof first.last === "number");
  if (!hasPrice) {
    note("fxCurrent", null, "INCONCLUSIVE",
      `HTTP 200 fuer ${ticker}, aber die Antwort traegt kein auswertbares Preisfeld` +
      `${list && list.length === 0 ? " (leeres Array)" : ""}. Kein Beleg.`,
      { httpStatus: 200, ticker, returnedRows: list ? list.length : null, sample: res.sample });
    return null;
  }

  /* Zeitstempelsemantik: traegt der Quote eine Zeit, und wie alt ist sie?
     Das ist die Zahl, an der sich entscheidet, ob Realtime-Stufe A, B
     oder C ueberhaupt zur Debatte steht. */
  const stamp = first.quoteTimestamp || first.timestamp || first.date || null;
  const ageSeconds = stamp && !isNaN(Date.parse(stamp))
    ? Math.round((Date.now() - Date.parse(stamp)) / 1000) : null;

  note("fxCurrent", true, "MEASURED_PRESENT",
    `HTTP 200 fuer ${ticker}, Preisfeld vorhanden${stamp ? `, Zeitstempel ${stamp}` : ", ohne Zeitstempel"}` +
    `${ageSeconds !== null ? `, Alter ${ageSeconds} s` : ""}.`,
    { httpStatus: 200, ticker, servedDirection: resolvedPrimary.direction,
      timestamp: stamp, ageSeconds, fields: Object.keys(first).sort() });

  /* Realtime ist NICHT dasselbe wie "ein Quote kam an". Belegt wird sie
     nur durch ein Alter innerhalb der Realtime-Toleranz - und auch dann
     nur, wenn der Markt ueberhaupt offen ist. Ausserhalb der Handelszeit
     misst ein junger Zeitstempel gar nichts. */
  if (ageSeconds === null) {
    note("fxRealtime", null, "INCONCLUSIVE",
      "Der Quote traegt keinen Zeitstempel; ohne ihn laesst sich keine Verzoegerung messen.");
  } else if (ageSeconds <= 120) {
    note("fxRealtime", true, "MEASURED_PRESENT",
      `Der juengste Quote ist ${ageSeconds} s alt und liegt damit innerhalb der Realtime-Toleranz (120 s).`,
      { ageSeconds });
  } else {
    note("fxRealtime", null, "INCONCLUSIVE",
      `Der juengste Quote ist ${ageSeconds} s alt. Das kann Verzoegerung sein oder eine Marktpause - ` +
      "ohne Wissen ueber die Handelszeit des Paares ist es kein Beleg gegen Realtime.",
      { ageSeconds });
  }
  return first;
}

async function probeBulkAndCross(resolvedPrimary, pairResolutions) {
  /* Sammelabfrage nur mit Symbolen, die der Anbieter fuehrt. Eine
     Sammelanfrage mit zwei ungefuehrten Symbolen misst die Symbole,
     nicht die Sammelfaehigkeit. */
  const served = pairResolutions.filter((r) => r.served).map((r) => r.ticker);
  const many = [...new Set(served)].slice(0, 3);
  if (many.length >= 2) {
    const res = await call(`/tiingo/fx/top?tickers=${many.join(",")}`);
    if (!res.ok) {
      const f = classifyFailure(res);
      note("fxBulkQuotes", f.result, f.level, f.detail, { httpStatus: res.status });
    } else {
      const list = rows(res.body) || [];
      /* Weniger Zeilen als Symbole heisst NICHT "keine Sammelabfrage".
         Es kann auch heissen, dass eines der Symbole gerade keinen
         aktuellen Quote hat. Ein `false` waere hier eine Aussage ueber
         die Faehigkeit, die die Messung nicht traegt - also null mit
         Grund. */
      if (list.length >= 2) {
        note("fxBulkQuotes", true, "MEASURED_PRESENT",
          `${many.length} gefuehrte Symbole angefragt (${many.join(", ")}), ${list.length} zurueck.`,
          { requested: many, returned: list.length });
      } else {
        note("fxBulkQuotes", null, "INCONCLUSIVE",
          `${many.length} gefuehrte Symbole angefragt (${many.join(", ")}), nur ${list.length} zurueck. ` +
          "Das kann eine fehlende Sammelfaehigkeit sein oder ein Symbol ohne aktuellen Quote - " +
          "die Messung unterscheidet das nicht.",
          { requested: many, returned: list.length });
      }
    }
  } else {
    note("fxBulkQuotes", null, "INCONCLUSIVE",
      `Es sind weniger als zwei gefuehrte Symbole bekannt (${served.length}); eine Sammelabfrage waere nicht aussagekraeftig.`);
  }

  /* Ein Kreuzpaar ohne USD. Wird es gefuehrt, spart das der Engine die
     Triangulation - wird es nicht gefuehrt, ist die Triangulation nicht
     Bequemlichkeit, sondern Notwendigkeit. Beide Schreibweisen werden
     versucht, sonst misst man wieder nur eine Konvention. */
  const cross = PROBE_PAIRS.find((p) => p.base !== "USD" && p.quote !== "USD");
  if (!cross) {
    note("fxCrossPairs", null, "NOT_ATTEMPTED", "Kein Kreuzpaar ohne USD im Bedarf.");
    return;
  }
  const resolved = await resolveTicker(cross.base, cross.quote);
  if (resolved.served) {
    note("fxCrossPairs", true, "MEASURED_PRESENT",
      `${cross.base}/${cross.quote} wird als ${resolved.ticker} gefuehrt (${resolved.observations} Zeilen).`,
      { pair: `${cross.base}/${cross.quote}`, ticker: resolved.ticker, direction: resolved.direction });
  } else {
    /* Ein nicht gefuehrtes Kreuzpaar ist ein gemessenes Fehlen - das
       Symbol antwortet, nur ohne Daten. Das ist etwas anderes als ein
       unschluessiger Lauf, und es hat eine klare Folge: die Engine MUSS
       triangulieren. */
    note("fxCrossPairs", false, resolved.reason === "accessDenied" ? "MEASURED_ABSENT" : "MEASURED_ABSENT",
      `${cross.base}/${cross.quote} wird weder als ${resolved.attempts.map((a) => a.ticker).join(" noch als ")} gefuehrt. ` +
      "Die Engine muss dieses Paar ueber USD triangulieren (fx-rates.js DERIVATION TRIANGULATED).",
      { pair: `${cross.base}/${cross.quote}`, attempts: resolved.attempts, reason: resolved.reason });
  }
}

async function probeDaily(resolvedPrimary) {
  if (!resolvedPrimary.served) {
    note("fxDaily", null, "INCONCLUSIVE",
      "Kein gefuehrtes Symbol fuer das Hauptpaar; die Tagesreihe kann nicht gemessen werden.");
    return null;
  }
  const ticker = resolvedPrimary.ticker;
  const start = isoDaysAgo(45);
  const res = await call(`/tiingo/fx/${ticker}/prices?resampleFreq=1day&startDate=${start}`);
  if (!res.ok) {
    const f = classifyFailure(res);
    note("fxDaily", f.result, f.level, f.detail, { httpStatus: res.status });
    return null;
  }
  const list = rows(res.body) || [];
  if (!list.length || typeof list[0].close !== "number") {
    note("fxDaily", null, "INCONCLUSIVE",
      `HTTP 200 fuer ${ticker}, aber keine Tagesschlusskurse in der Antwort.`,
      { ticker, returnedRows: list.length, sample: res.sample });
    return null;
  }

  const dates = list.map((r) => String(r.date || "").slice(0, 10)).filter(Boolean);
  const first = dates[0], last = dates[dates.length - 1];

  /* Zeitstempelsemantik: traegt `date` eine Zeitzone, und steht sie auf
     Mitternacht? Davon haengt ab, ob ein Tagesstand auf den Tag oder auf
     dessen Beginn gelegt werden darf - fx-freshness.js legt ihn bewusst
     auf das Tagesende. */
  const rawStamp = String(list[0].date || "");
  const timestampSemantics = {
    raw: rawStamp,
    hasTime: /T\d{2}:\d{2}/.test(rawStamp),
    hasZone: /(Z|[+-]\d{2}:\d{2})$/.test(rawStamp),
    midnight: /T00:00:00/.test(rawStamp)
  };

  /* Wochenenden: kommen sie als Zeile mit Kurs, oder fehlen sie? Das ist
     die Messung, die unsere PREVIOUS_AVAILABLE-Regel rechtfertigt oder
     ueberfluessig macht. */
  const weekendRows = dates.filter((d) => {
    const dow = new Date(Date.parse(d + "T00:00:00Z")).getUTCDay();
    return dow === 0 || dow === 6;
  });

  /* Luecken zwischen aufeinanderfolgenden Zeilen - Feiertage zeigen sich
     als Sprung von mehr als drei Kalendertagen ueber ein Wochenende. */
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((Date.parse(dates[i] + "T00:00:00Z") - Date.parse(dates[i - 1] + "T00:00:00Z")) / 86400000);
    if (days > 1) gaps.push({ from: dates[i - 1], to: dates[i], days });
  }

  note("fxDaily", true, "MEASURED_PRESENT",
    `${list.length} Tageszeilen fuer ${ticker} von ${first} bis ${last}.`,
    { ticker, observations: list.length, first, last, fields: Object.keys(list[0]).sort() });

  return { list, dates, timestampSemantics, weekendRows, gaps, first, last };
}

async function probeHistoricalDepth(resolvedPrimary) {
  if (!resolvedPrimary.served) {
    note("fxHistoricalDaily", null, "INCONCLUSIVE",
      "Kein gefuehrtes Symbol fuer das Hauptpaar; die historische Tiefe kann nicht gemessen werden.");
    return { reached: [], deepest: null };
  }
  const ticker = resolvedPrimary.ticker;
  /* Die Tiefe wird nicht erfragt, sondern eingegrenzt: drei Sonden in
     wachsendem Abstand. Ein Vollabruf ueber 20 Jahre kostet Bandbreite
     fuer eine Zahl, die drei kurze Fenster genauso liefern. */
  const marks = [
    { label: "1 Jahr", days: 365 },
    { label: "5 Jahre", days: 1826 },
    { label: "10 Jahre", days: 3652 },
    { label: "20 Jahre", days: 7305 }
  ];
  const reached = [];
  let deepest = null;
  for (const mark of marks) {
    const from = isoDaysAgo(mark.days);
    const to = isoDaysAgo(mark.days - 10);
    const res = await call(`/tiingo/fx/${ticker}/prices?resampleFreq=1day&startDate=${from}&endDate=${to}`);
    if (!res.ok) {
      const f = classifyFailure(res);
      reached.push({ ...mark, from, to, ok: false, httpStatus: res.status, detail: f.detail });
      /* 403/404 bei tiefer Historie heisst meist: der Tarif reicht nur so
         weit. Das ist eine Tiefenaussage, keine Faehigkeitsaussage. */
      break;
    }
    const list = rows(res.body) || [];
    reached.push({ ...mark, from, to, ok: list.length > 0, observations: list.length,
                   firstDate: list.length ? String(list[0].date).slice(0, 10) : null });
    if (list.length) deepest = mark;
    else break;
  }

  if (!deepest) {
    const worst = reached[0];
    note("fxHistoricalDaily", worst && worst.httpStatus === 403 ? false : null,
      worst && worst.httpStatus === 403 ? "MEASURED_ABSENT" : "INCONCLUSIVE",
      "Kein historisches Fenster lieferte Zeilen. " + (worst ? worst.detail || "" : ""),
      { probes: reached });
    return { reached, deepest: null, earliestAvailableDate: null };
  }

  /* DIE GRENZE GENAU BESTIMMEN, NICHT NUR EINGRENZEN.

     Der erste Ingest-Lauf (35696957318) hat alle 39 Paare verloren, und
     zwar an HTTP 400 - fuer jedes Paar, auch fuer eurusd, das die
     Sondierung Sekunden zuvor erfolgreich gelesen hatte. Der einzige
     Unterschied war startDate=2015-01-01.

     Tiingo lehnt ein Fenster ab, das vor dem Beginn seiner FX-Historie
     liegt. Das ist kein Fehler des Zugangs und kein fehlendes Paar - es
     ist eine Grenze, und sie war messbar, seit die Tiefensonde bei zehn
     Jahren auf 400 lief. Sie wurde nur nicht ausgelesen.

     Eine Angabe wie "mindestens fuenf Jahre" reicht dem Import nicht: er
     braucht ein Datum, ab dem er fragen darf. Die Bisektion liefert es
     mit etwa vier zusaetzlichen Anfragen - billiger als ein Import, der
     39 Paare gegen 400 laufen laesst. */
  let lo = deepest.days;                                   // funktioniert
  let hi = (reached.find((r) => !r.ok) || {}).days || null; // funktioniert nicht
  const bisection = [];

  if (hi !== null) {
    for (let step = 0; step < 5 && hi - lo > 120; step++) {
      const mid = Math.round((lo + hi) / 2);
      const from = isoDaysAgo(mid);
      const res = await call(`/tiingo/fx/${ticker}/prices?resampleFreq=1day&startDate=${from}&endDate=${isoDaysAgo(mid - 10)}`);
      const list = res.ok ? (rows(res.body) || []) : [];
      bisection.push({ days: mid, from, httpStatus: res.status, observations: list.length });
      if (res.ok && list.length) lo = mid; else hi = mid;
    }
  }

  /* Ein Sicherheitsabstand nach vorn: die Grenze wurde auf etwa vier
     Monate genau bestimmt, und ein Import, der genau auf ihr sitzt,
     scheitert beim naechsten Lauf an einem Tag Drift. */
  const earliestAvailableDate = isoDaysAgo(lo);
  const safeStartDate = isoDaysAgo(Math.max(0, lo - 30));

  note("fxHistoricalDaily", true, "MEASURED_PRESENT",
    `Historie von ${ticker} reicht bis mindestens ${earliestAvailableDate} zurueck` +
    (hi !== null ? `; ein Fenster ab ${isoDaysAgo(hi)} wird mit HTTP 400 abgelehnt.` : ".") +
    " Ein Import darf nicht frueher anfragen.",
    { ticker, earliestAvailableDate, depthAtLeast: deepest.label, probes: reached, bisection });

  return { reached, deepest, bisection, earliestAvailableDate, safeStartDate,
           note: "safeStartDate ist das Datum, ab dem build-fx-history.mjs anfragen darf. " +
                 "Frueher liefert der Anbieter HTTP 400 - das ist eine Fenstergrenze, kein fehlendes Paar." };
}

async function probeIntraday(resolvedPrimary) {
  if (!resolvedPrimary.served) {
    note("fxIntraday", null, "INCONCLUSIVE",
      "Kein gefuehrtes Symbol fuer das Hauptpaar; Intraday kann nicht gemessen werden.");
    return null;
  }
  const ticker = resolvedPrimary.ticker;
  const res = await call(`/tiingo/fx/${ticker}/prices?resampleFreq=1hour&startDate=${isoDaysAgo(4)}`);
  if (!res.ok) {
    const f = classifyFailure(res);
    note("fxIntraday", f.result, f.level, f.detail, { httpStatus: res.status });
    return null;
  }
  const list = rows(res.body) || [];
  if (!list.length || typeof list[0].close !== "number") {
    note("fxIntraday", null, "INCONCLUSIVE",
      `HTTP 200 fuer ${ticker}, aber keine Intraday-Bars.`, { ticker, returnedRows: list.length, sample: res.sample });
    return null;
  }
  const stamps = list.map((r) => String(r.date || ""));
  const lastStamp = stamps[stamps.length - 1];
  const ageSeconds = !isNaN(Date.parse(lastStamp))
    ? Math.round((Date.now() - Date.parse(lastStamp)) / 1000) : null;

  note("fxIntraday", true, "MEASURED_PRESENT",
    `${list.length} Stundenbars, juengste ${lastStamp}${ageSeconds !== null ? ` (${ageSeconds} s alt)` : ""}.`,
    { observations: list.length, newest: lastStamp, ageSeconds });
  return { list, lastStamp, ageSeconds };
}

async function probeDirections() {
  /* Beide Richtungen desselben Paares. Liefert Tiingo nur eine, ist die
     Inversion in fx-rates.js keine Kuer, sondern Voraussetzung - und das
     soll belegt sein, nicht angenommen.

     Diese Messung hat im ersten Produktivlauf den Befund geliefert, der
     die Symbolaufloesung ueberhaupt noetig machte: eurusd ja, usdeur
     nein. Sie bleibt deshalb ein eigener Schritt und nicht ein
     Nebenprodukt der Aufloesung. */
  const out = [];
  const closes = {};   // bleibt lokal, geht nie in den Bericht
  for (const [base, quote] of [["USD", "EUR"], ["EUR", "USD"]]) {
    const res = await call(`/tiingo/fx/${tiingoTicker(base, quote)}/prices?resampleFreq=1day&startDate=${isoDaysAgo(10)}`);
    const list = res.ok ? (rows(res.body) || []) : [];
    /* Bewusst OHNE den Kurswert. Dieser Bericht wird committet, und ein
       committeter Anbieterkurs ist genau die Weitergabe, die
       display-policy.js bis zur Lizenzklaerung untersagt. Gespeichert
       wird, DASS ein Schlusskurs kam - nicht, welcher. */
    const lastClose = list.length ? list[list.length - 1].close : null;
    closes[`${base}/${quote}`] = lastClose;
    out.push({ pair: `${base}/${quote}`, ticker: tiingoTicker(base, quote),
               ok: res.ok && list.length > 0, httpStatus: res.status, observations: list.length,
               closePresent: typeof lastClose === "number",
               lastDate: list.length ? String(list[list.length - 1].date).slice(0, 10) : null });
  }
  const both = out.every((o) => o.ok);
  const forward = out[0], backward = out[1];

  /* Wenn beide geliefert werden: ergibt das Produkt der beiden Kurse 1?
     Eine Abweichung ueber der Geld-Brief-Spanne hiesse, dass die beiden
     Reihen nicht dasselbe messen - und dass die Inversion in fx-rates.js
     etwas anderes liefert als das direkt gefuehrte Gegenpaar.

     Die Abweichung selbst verraet keinen Kurs: sie ist eine Zahl nahe
     null, aus der sich weder der eine noch der andere Stand ableiten
     laesst. Sie darf deshalb in den Bericht. */
  let consistency = null;
  const fwdClose = closes[forward.pair], bwdClose = closes[backward.pair];
  if (both && fwdClose && bwdClose && forward.lastDate === backward.lastDate) {
    const product = fwdClose * bwdClose;
    consistency = { checkedOn: forward.lastDate,
                    deviationFromOne: Math.abs(product - 1),
                    acceptable: Math.abs(product - 1) < 0.01,
                    note: "Produkt beider Richtungen; der Kurswert selbst steht nicht im Bericht." };
  }

  return { directions: out, bothDirectionsServed: both, inversionRequired: !both, consistency };
}

async function probeMissingData(resolvedPrimary) {
  /* Ein Fenster, das ein Wochenende UND einen breit begangenen Feiertag
     enthaelt. Gemessen wird, welche Kalendertage FEHLEN - nicht, ob der
     Anbieter einen Kurs "richtig" liefert. Die Luecken sind der Befund. */
  if (!resolvedPrimary.served) return { ok: false, reason: "noServedTicker" };
  const ticker = resolvedPrimary.ticker;
  const year = new Date().getUTCFullYear() - 1;
  const from = `${year}-12-20`, to = `${year + 1}-01-06`;
  const res = await call(`/tiingo/fx/${ticker}/prices?resampleFreq=1day&startDate=${from}&endDate=${to}`);
  if (!res.ok) return { window: { from, to }, ok: false, httpStatus: res.status };

  const list = rows(res.body) || [];
  const present = new Set(list.map((r) => String(r.date || "").slice(0, 10)));
  const missing = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (present.has(iso)) continue;
    const dow = new Date(t).getUTCDay();
    missing.push({ date: iso, weekday: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][dow],
                   kind: (dow === 0 || dow === 6) ? "WEEKEND" : "HOLIDAY_OR_GAP" });
  }
  return {
    window: { from, to }, ok: true,
    calendarDays: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
    observations: list.length,
    missing,
    weekendGaps: missing.filter((m) => m.kind === "WEEKEND").length,
    holidayGaps: missing.filter((m) => m.kind === "HOLIDAY_OR_GAP").length
  };
}

/* --------------------------------------------------------------------- */
/* Lauf                                                                    */
/* --------------------------------------------------------------------- */
async function main() {
  const report = {
    schema: "vu-tiingo-fx-probe-2.0.0",
    generatedAtUtc: new Date().toISOString(),
    provider: "tiingo",
    baseUrl: BASE,
    configured: Boolean(KEY),
    dryRun: DRY_RUN,
    pairRequirements: {
      source: REQUIREMENTS.source,
      totalPairs: REQUIREMENTS.pairs.length,
      probed: PROBE_PAIRS.map((p) => `${p.base}/${p.quote}`)
    },
    findings: [],
    capabilities: null,
    realtimeTier: null,
    secondSource: null,
    timestampSemantics: null,
    missingDataBehaviour: null,
    directionality: null,
    historicalDepth: null,
    requests: { count: 0, rateLimitHeaders: {} },
    notMeasured: {
      fxWebsocket: "Eine Push-Verbindung wird hier nicht aufgebaut - sie haette einen eigenen Betriebszustand und gehoert in einen eigenen Nachweis.",
      requestLimits: "Kontingente zeigen sich erst unter Last. Dieses Skript zaehlt seine eigenen Anfragen und sammelt Kontingent-Header, es laeuft nicht gegen die Grenze.",
      license: "Redistribution und oeffentliche Darstellung sind Rechtsfragen. display-policy.js entscheidet sie, nicht ein HTTP-Statuscode."
    }
  };

  if (!KEY) {
    report.note = "Kein TIINGO_API_KEY in der Umgebung. Es wurde kein Endpunkt befragt; " +
      "jede FX-Faehigkeit bleibt ungeprueft (null). Das ist der ehrliche Stand, nicht ein Ausfall.";
    report.capabilities = FxCapability.declareTiingoFx().sets.fx;
    const d = FxCapability.declareTiingoFx();
    report.realtimeTier = FxCapability.resolveRealtimeTier(d);
    report.secondSource = FxCapability.needsSecondSource(d);
  } else if (DRY_RUN) {
    report.note = "--dry-run: die Paare wurden ausgewaehlt, aber kein Endpunkt aufgerufen.";
    report.capabilities = FxCapability.declareTiingoFx().sets.fx;
    const d = FxCapability.declareTiingoFx();
    report.realtimeTier = FxCapability.resolveRealtimeTier(d);
    report.secondSource = FxCapability.needsSecondSource(d);
  } else {
    /* Nacheinander und nicht parallel: das Kontingent ist mit den
       Kursabrufen geteilt, und ein Probelauf darf keinen Kursabruf
       verdraengen. */
    /* ZUERST das Symbol klaeren, DANN die Faehigkeiten messen. Der
       erste Produktivlauf hat in umgekehrter Reihenfolge gemessen und
       dadurch sieben Faehigkeiten als ungeprueft gemeldet, obwohl der
       Zugang sie bedient - nur unter dem anderen Symbol. */
    const resolutions = [];
    for (const p of PROBE_PAIRS.slice(0, 3)) {
      resolutions.push(await resolveTicker(p.base, p.quote));
    }
    const resolvedPrimary = resolutions[0];
    report.tickerResolution = {
      note: "Welche Schreibweise der Anbieter fuehrt, ist gemessen und nicht gewaehlt. " +
            "Die Gegenrichtung entsteht in fx-rates.js durch Inversion (exakte Identitaet).",
      primary: { pair: `${PRIMARY.base}/${PRIMARY.quote}`, ticker: resolvedPrimary.ticker,
                 direction: resolvedPrimary.direction, served: resolvedPrimary.served,
                 attempts: resolvedPrimary.attempts },
      /* Die ANGEFRAGTE Paarrichtung, nicht die gefuehrte. resolveTicker
         gibt bei INVERSE base und quote vertauscht zurueck - das ist fuer
         den Abruf richtig und fuer den Bericht irrefuehrend: er soll
         sagen, welches Paar gebraucht wurde und womit es bedient wird. */
      all: resolutions.map((r, i) => ({
        requestedPair: `${PROBE_PAIRS[i].base}/${PROBE_PAIRS[i].quote}`,
        servedAs: r.ticker,
        direction: r.direction,
        served: r.served,
        observations: r.observations
      }))
    };

    await probeQuote(resolvedPrimary);
    await probeBulkAndCross(resolvedPrimary, resolutions);
    const daily = await probeDaily(resolvedPrimary);
    if (daily) {
      report.timestampSemantics = daily.timestampSemantics;
      report.dailyWindow = { first: daily.first, last: daily.last,
                             weekendRows: daily.weekendRows, gaps: daily.gaps };
    }
    report.historicalDepth = await probeHistoricalDepth(resolvedPrimary);
    await probeIntraday(resolvedPrimary);
    report.directionality = await probeDirections();
    report.missingDataBehaviour = await probeMissingData(resolvedPrimary);

    /* fxWebsocket wurde nicht aufgebaut - das ist ein ausdrueckliches
       "nicht gemessen", kein stilles Fehlen. */
    note("fxWebsocket", null, "NOT_ATTEMPTED",
      "Es wurde keine Push-Verbindung aufgebaut. Der WebSocket-Nachweis gehoert in einen eigenen Lauf mit eigenem Betriebszustand.");

    const declaration = Capabilities.declare("tiingo", {
      plan: "commercial-internal-use",
      declaredAt: FxCapability.TIINGO_FX_UNVERIFIED.declaredAt,
      verifiedAt: report.generatedAtUtc,
      fx: measured, evidence
    });
    report.capabilities = declaration.sets.fx;
    report.realtimeTier = FxCapability.resolveRealtimeTier(declaration);
    report.secondSource = FxCapability.needsSecondSource(declaration);
    report.evidence = evidence;
    report.findings = findings;
  }

  report.requests.count = requestCount;
  report.requests.rateLimitHeaders = rateLimitHeaders;

  const states = Object.entries(report.capabilities || {});
  const yes = states.filter(([, v]) => v === true).length;
  const no = states.filter(([, v]) => v === false).length;
  const unknown = states.filter(([, v]) => v === null).length;

  /* Der Gesamtzustand, den das Merge Gate liest. MEASURED heisst: keine
     der Faehigkeiten, die der kanonische Vertrag braucht, steht noch auf
     ungeprueft. Es heisst NICHT, dass alle vorhanden sind - ein
     gemessenes false ist ebenso ein Messergebnis. */
  const CONTRACT_CRITICAL = ["fxCurrent", "fxDaily", "fxHistoricalDaily"];
  const openCritical = CONTRACT_CRITICAL.filter((c) => report.capabilities[c] === null);
  report.capabilityState = openCritical.length ? "UNVERIFIED" : "MEASURED";
  report.capabilityStateDetail = openCritical.length
    ? `Ungeprueft geblieben: ${openCritical.join(", ")}.`
    : `Alle vertragskritischen Faehigkeiten gemessen (${CONTRACT_CRITICAL.join(", ")}).`;
  report.summary = { measuredPresent: yes, measuredAbsent: no, unverified: unknown };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(redact(report), null, 2) + "\n");

  console.log(`Tiingo-FX-Sondierung (${requestCount} Anfragen)`);
  console.log(`  ${yes} belegt, ${no} ausdruecklich nicht vorhanden, ${unknown} ungeprueft.`);
  console.log(`  TIINGO_FX_CAPABILITIES = ${report.capabilityState} — ${report.capabilityStateDetail}`);
  console.log(`  Realtime-Stufe: ${report.realtimeTier.tier || "keine"} — ${report.realtimeTier.reason}`);
  console.log(`  Zweite Quelle noetig? ${report.secondSource.answer} (${report.secondSource.action})`);
  if (findings.length) {
    console.log(`\n  Befunde:`);
    for (const f of findings) {
      console.log(`    ${String(f.capability).padEnd(20)} ${String(f.result).padEnd(6)} ${f.verificationLevel}`);
      console.log(`      ${f.detail}`);
    }
  }
  console.log(`\nBericht: ${OUT}`);
  process.exit(0);
}

main().catch((err) => { console.error(redact(String(err && err.stack || err))); process.exit(1); });
