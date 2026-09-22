/* =========================================================================
   VISION UNIVERSE — probe-tiingo-fx.mjs   (Currency Layer V1, §5, §38)

   MISST, WAS DER BESTEHENDE TIINGO-ZUGANG AN FX TATSAECHLICH LIEFERT.

   Der Auftrag beginnt mit einer Annahme: der vorhandene Vertrag umfasse
   FX-Daten. Dieses Skript prueft sie, statt sie zu uebernehmen. Es ruft
   die FX-Endpunkte mit dem vorhandenen Schluessel auf und haelt je
   Faehigkeit fest, WAS GEANTWORTET HAT - Statuscode, Form der Antwort,
   Anzahl der Beobachtungen, aelteste Beobachtung.

   Es aendert nichts am Tarif. Es aktiviert nichts. Es bindet keine zweite
   Quelle an. Es liest.

   OHNE SCHLUESSEL bricht es nicht ab. Es schreibt einen Bericht, in dem
   jede Faehigkeit `null` traegt (= ungeprueft), und endet mit 0. Ein
   fehlender Zugang ist eine Konfigurationsfrage, kein Baufehler - dieselbe
   Regel wie bei fetch-market-data.mjs.

   WAS DIESES SKRIPT NICHT BEANTWORTET

   Ob wir die Ergebnisse oeffentlich zeigen duerfen. Ein erfolgreicher
   Abruf ist eine technische Tatsache und keine Lizenz. Die Rechtsfrage
   beantwortet quant/engines/display-policy.js mit einem Eintrag, den
   jemand mit Datum und Grundlage setzt.

   Ausfuehren:
     TIINGO_API_KEY=... node scripts/market/probe-tiingo-fx.mjs
     node scripts/market/probe-tiingo-fx.mjs --dry-run
     node scripts/market/probe-tiingo-fx.mjs --publish   (Bericht dauerhaft ablegen)
   ========================================================================= */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FxCapability = require(join(root, "quant", "engines", "fx", "fx-capability.js"));
const Capabilities = require(join(root, "quant", "engines", "capabilities.js"));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

/* Der Bericht traegt einen Zeitstempel und aendert sich damit bei jedem
   Lauf. Er gehoert deshalb standardmaessig in die nicht ausgelieferte
   Arbeitsablage - sonst stolpert die CI ueber ihren eigenen Lauf: sie
   prueft mit `git diff --exit-code -- quant/data/market`, dass ein
   Abruf ohne Zugang den committeten Datenstand nicht veraendert.

   --publish schreibt den Bericht an seinen dauerhaften Platz. Das ist
   eine bewusste Handlung, kein Nebeneffekt eines Testlaufs. */
const PUBLISH = args.has("--publish");
const OUT = PUBLISH
  ? resolve(root, "quant", "data", "market", "capabilities", "tiingo-fx-probe.json")
  : resolve(root, ".market-cache", "currency", "tiingo-fx-probe.json");
const BASE = process.env.TIINGO_BASE_URL || "https://api.tiingo.com";
const KEY = process.env.TIINGO_API_KEY || "";

/* Die Paare, an denen gemessen wird. Klein gehalten: der Zweck ist eine
   Faehigkeitsaussage, nicht ein Datenbestand. Jede zusaetzliche Anfrage
   geht vom selben Kontingent ab wie die Kursabrufe. */
const PROBE_PAIRS = ["eurusd", "usdchf", "gbpusd"];

/* Was gemessen wird, und welche Faehigkeit die Antwort belegt. Bewusst
   ein Endpunkt je Faehigkeit: eine Antwort, die zwei Faehigkeiten
   gleichzeitig belegen soll, belegt am Ende keine. */
const PROBES = [
  { capability: "fxCurrent", label: "Aktuelle Kurse (top)",
    path: () => `/tiingo/fx/top?tickers=${PROBE_PAIRS[0]}`,
    verify: (body) => Array.isArray(body) && body.length > 0 &&
      (typeof body[0].midPrice === "number" || typeof body[0].bidPrice === "number") },

  { capability: "fxBulkQuotes", label: "Mehrere Paare je Anfrage",
    path: () => `/tiingo/fx/top?tickers=${PROBE_PAIRS.join(",")}`,
    verify: (body) => Array.isArray(body) && body.length >= 2 },

  { capability: "fxCrossPairs", label: "Kreuzpaare ohne USD",
    path: () => `/tiingo/fx/top?tickers=eurchf`,
    verify: (body) => Array.isArray(body) && body.length > 0 },

  { capability: "fxDaily", label: "Taeglicher Referenzkurs",
    path: () => `/tiingo/fx/${PROBE_PAIRS[0]}/prices?resampleFreq=1day&startDate=${isoDaysAgo(30)}`,
    verify: (body) => Array.isArray(body) && body.length > 0 && typeof body[0].close === "number" },

  { capability: "fxHistoricalDaily", label: "Historische Tiefe (10 Jahre)",
    path: () => `/tiingo/fx/${PROBE_PAIRS[0]}/prices?resampleFreq=1day&startDate=${isoDaysAgo(3650)}&endDate=${isoDaysAgo(3640)}`,
    verify: (body) => Array.isArray(body) && body.length > 0 && typeof body[0].close === "number" },

  { capability: "fxIntraday", label: "Intraday-Bars",
    path: () => `/tiingo/fx/${PROBE_PAIRS[0]}/prices?resampleFreq=1hour&startDate=${isoDaysAgo(3)}`,
    verify: (body) => Array.isArray(body) && body.length > 0 && typeof body[0].close === "number" }
];

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function runProbe(probe) {
  const url = BASE + probe.path();
  /* Der Schluessel steht im Header, nicht in der URL - dieselbe Regel wie
     im Aktienadapter. Eine geloggte URL verraet ihn dann nicht. */
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" }
    });
    const ms = Date.now() - started;
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* keine JSON-Antwort */ }

    if (!res.ok) {
      /* 403/404 auf einem FX-Endpunkt bei gueltigem Schluessel ist die
         belastbarste Aussage, die dieses Skript treffen kann: der Zugang
         deckt dieses Produkt NICHT ab. Das ist ein ausdrueckliches false,
         kein ungeprueft. */
      const explicit = res.status === 403 || res.status === 404;
      return {
        capability: probe.capability, label: probe.label,
        result: explicit ? false : null,
        httpStatus: res.status, durationMs: ms, observations: null, oldest: null,
        verificationLevel: explicit ? "MEASURED_ABSENT" : "INCONCLUSIVE",
        note: explicit
          ? `HTTP ${res.status}: der Zugang deckt diesen Endpunkt nicht ab.`
          : `HTTP ${res.status}: keine belastbare Aussage (Kontingent, Ausfall oder Netz).`,
        bodySample: text.slice(0, 200)
      };
    }

    const ok = probe.verify(body);
    const rows = Array.isArray(body) ? body.length : null;
    const oldest = Array.isArray(body) && body.length && body[0].date
      ? String(body[0].date).slice(0, 10) : null;
    return {
      capability: probe.capability, label: probe.label,
      result: ok ? true : null,
      httpStatus: res.status, durationMs: ms, observations: rows, oldest,
      verificationLevel: ok ? "MEASURED_PRESENT" : "INCONCLUSIVE",
      note: ok
        ? `HTTP 200, ${rows} Zeilen${oldest ? `, aelteste ${oldest}` : ""}.`
        : "HTTP 200, aber die Antwort hat die erwartete Form nicht. Kein Beleg.",
      bodySample: text.slice(0, 200)
    };
  } catch (err) {
    return {
      capability: probe.capability, label: probe.label,
      result: null, httpStatus: null, durationMs: Date.now() - started,
      observations: null, oldest: null,
      verificationLevel: "INCONCLUSIVE",
      note: `Abruf fehlgeschlagen: ${err && err.message}. Ein Netzfehler belegt keine fehlende Faehigkeit.`,
      bodySample: null
    };
  }
}

async function main() {
  const report = {
    schema: "vu-tiingo-fx-probe-1.0.0",
    generatedAtUtc: new Date().toISOString(),
    provider: "tiingo",
    baseUrl: BASE,
    configured: Boolean(KEY),
    dryRun: DRY_RUN,
    probes: [],
    capabilities: null,
    realtimeTier: null,
    secondSource: null,
    /* Die Faehigkeiten, die dieses Skript grundsaetzlich NICHT messen
       kann. Sie hier zu nennen ist der Unterschied zwischen einem
       Bericht und einem vollstaendigen Bericht. */
    notMeasured: {
      fxRealtime: "Verzoegerung laesst sich nur gegen einen unabhaengigen Referenzkurs messen; ein Abruf allein belegt keine Echtzeit.",
      fxWebsocket: "Eine Push-Verbindung wird hier nicht aufgebaut - sie haette einen eigenen Betriebszustand und gehoert in einen eigenen Nachweis.",
      requestLimits: "Kontingente zeigen sich erst unter Last. run-scale-gate.mjs ist dafuer da, nicht dieses Skript.",
      license: "Redistribution und oeffentliche Darstellung sind Rechtsfragen. display-policy.js entscheidet sie, nicht ein HTTP-Statuscode."
    }
  };

  if (!KEY) {
    report.note = "Kein TIINGO_API_KEY in der Umgebung. Es wurde kein Endpunkt befragt; " +
      "jede FX-Faehigkeit bleibt ungeprueft (null). Das ist der ehrliche Stand, nicht ein Ausfall.";
    report.capabilities = FxCapability.declareTiingoFx().sets.fx;
  } else if (DRY_RUN) {
    report.note = "--dry-run: die Endpunkte wurden aufgelistet, aber nicht aufgerufen.";
    report.probes = PROBES.map((p) => ({ capability: p.capability, label: p.label, url: BASE + p.path(), result: null }));
    report.capabilities = FxCapability.declareTiingoFx().sets.fx;
  } else {
    for (const probe of PROBES) {
      /* Nacheinander und nicht parallel: das Kontingent ist geteilt, und
         ein Probelauf darf einen Kursabruf nicht verdraengen. */
      report.probes.push(await runProbe(probe));
    }
    const measured = {};
    const evidence = {};
    for (const p of report.probes) {
      measured[p.capability] = p.result;
      evidence[p.capability] = {
        verificationLevel: p.verificationLevel, httpStatus: p.httpStatus,
        observations: p.observations, oldest: p.oldest, reason: p.note,
        measuredAt: report.generatedAtUtc
      };
    }
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
  }

  if (!report.realtimeTier) {
    const declaration = FxCapability.declareTiingoFx();
    report.realtimeTier = FxCapability.resolveRealtimeTier(declaration);
    report.secondSource = FxCapability.needsSecondSource(declaration);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  const states = Object.entries(report.capabilities || {});
  const yes = states.filter(([, v]) => v === true).length;
  const no = states.filter(([, v]) => v === false).length;
  const unknown = states.filter(([, v]) => v === null).length;

  console.log(`Tiingo-FX-Sondierung: ${yes} belegt, ${no} ausdruecklich nicht vorhanden, ${unknown} ungeprueft.`);
  console.log(`Realtime-Stufe: ${report.realtimeTier.tier || "keine"} — ${report.realtimeTier.reason}`);
  console.log(`Zweite Quelle noetig? ${report.secondSource.answer} (${report.secondSource.action})`);
  console.log(`Bericht: ${OUT}`);
  /* Ein ungepruefter Zustand ist kein Fehlschlag des Skripts. Es hat
     genau das getan, was es sollte: gemeldet, dass wir es nicht wissen. */
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
