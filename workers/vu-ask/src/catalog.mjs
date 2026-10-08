/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/src/catalog.mjs

   WAS DAS SPRACHMODELL UEBER VISION UNIVERSE WEISS

   Genau das, was hier steht - und das stammt nicht aus einer eigenen
   Liste, sondern aus der Filterbibliothek des Screeners
   (screener/engine/fields.js) und dem SIC-Woerterbuch des
   Universumsbaus. Wer dort ein Feld freischaltet, macht es damit auch
   fuer die Frage-Funktion verfuegbar; ein Feld, das es nicht gibt, kann
   das Modell nicht einmal hinschreiben, weil das Antwortschema nur die
   echten Feldnamen als Werte zulaesst.

   Das Modell rechnet nichts und kennt keinen Kurs. Es uebersetzt eine
   Frage in eine Screener-Abfrage; ausgewertet wird im Browser auf den
   Daten, die ohnehin ausgeliefert werden.
   ========================================================================= */
import Fields from "../../../screener/engine/fields.js";
import { SECTORS, MAJOR_GROUPS } from "../../../scripts/screener/sic.mjs";
import TIAITools from "../../../quant/engines/technical/ti/ai-tools.js";

export const STRATEGIES = ["MINERVINI_VCP", "MOMENTUM_BREAKOUT", "WEINSTEIN_STAGE", "DARVAS_BOX"];
export const MISSING_TYPES = ["field", "withheld", "estimates", "history", "product", "other"];
export const KINDS = ["screen", "stock", "off_topic", "forecast", "unclear"];

const AVAILABLE = Fields.FIELDS.filter((f) => f.available !== false);
const UNAVAILABLE = Fields.FIELDS.filter((f) => f.available === false);
export const FIELD_IDS = AVAILABLE.map((f) => f.id);
const NUMERIC_IDS = AVAILABLE.filter((f) => f.kind === "number").map((f) => f.id);

const UNIT_HINT = {
  pct: "Verhaeltnis (0.25 = 25 %)",
  pp: "Prozentpunkte (5 = 5 Pp.)",
  usd: "US-Dollar (3e8 = 300 Mio. $)",
  x: "Vielfaches",
  num: "Zahl",
  score: "0-100",
  count: "Stueck",
  year: "Jahr",
};

function fieldLine(f) {
  const kind = f.kind === "number" ? UNIT_HINT[f.unit] || "Zahl" : f.kind === "bool" ? "ja/nein" : "Liste";
  const desc = String(f.desc || "").replace(/\s+/g, " ").slice(0, 140);
  return `${f.id} | ${f.label} | ${kind} | ${desc}`;
}

const ENUM_VALUES = {
  sector: Object.keys(SECTORS),
  industry: Object.keys(MAJOR_GROUPS),
  exchange: ["NYSE", "NASDAQ", "AMEX", "BATS", "NYSE MKT", "NYSE ARCA"],
  companyType: Object.keys(Fields.ENUM_LABELS.companyType || {}),
  index: ["SP500", "NDX", "DJIA"],
  country: ["US"],
  region: ["NA"],
  tiOutlook: Object.keys(Fields.ENUM_LABELS.tiOutlook || {}),
  tiStructure: Object.keys(Fields.ENUM_LABELS.tiStructure || {}),
  tiElliottApplicable: Object.keys(Fields.ENUM_LABELS.tiElliottApplicable || {}),
};

/* Das einzige Werkzeug, das die Antwort im Browser aufruft: lesend, auf
   dem veroeffentlichten Chartbild-Index. Das Modell schaltet es nur ein
   (chartbild: true) und sieht seine Werte nie. */
export const CHARTBILD_TOOL = TIAITools.definitions().find((d) => d.name === "getChartbildLage");
const enumLine = (id) => `${id}: ` + ENUM_VALUES[id].map((k) => `${k} (${Fields.ENUM_LABELS[id][k]})`).join(", ");

export const SYSTEM_PROMPT = [
  "Du bist die Fragefunktion von Vision Universe, einer Research-Plattform fuer US-Aktien (rund 5.400 Titel).",
  "Deine einzige Aufgabe: Die Frage eines Nutzers - oft gesprochen, umgangssprachlich, mit Fuellwoertern und Tippfehlern -",
  "in eine strukturierte Abfrage uebersetzen. Du nennst NIE selbst Zahlen, Kurse, Kennzahlenwerte oder Empfehlungen;",
  "die Werte kommen aus den Vision-Universe-Daten, nicht von dir.",
  "",
  "ARTEN (kind):",
  "- screen: Suche nach Aktien, die Bedingungen erfuellen (\"zeig mir\", \"welche Aktien\", \"gibt es Titel mit ...\").",
  "- stock: Frage zu einer oder mehreren bestimmten Aktien (\"wie stark ist der Cashflow bei Nvidia gewachsen\"). Ticker in tickers (z. B. NVDA), gewuenschte Kennzahlen in show.",
  "- forecast: Kursprognosen, Kursziele, \"wird die Aktie steigen\", Kaufempfehlungen. Vision Universe macht keine Prognosen.",
  "- off_topic: keine Investmentfrage.",
  "- unclear: Investmentfrage, aber zu unklar, um sie zu uebersetzen.",
  "",
  "FILTER: Nur die Felder unten. Operatoren fuer Zahlen: gt, gte, lt, lte, between (value = untere, value2 = obere Grenze), eq.",
  "Listenfelder: op \"in\" mit values. Ja/Nein-Felder: op \"is\" mit flag. Nicht benutzte Angaben: null bzw. leere Liste.",
  "Werte immer in der Einheit des Feldes: Verhaeltnisse als Dezimalzahl (20 % -> 0.2, \"hoechstens 5 % unter dem Hoch\" -> distance52wHigh gte -0.05),",
  "Dollarbetraege ausgeschrieben (300 Millionen -> 300000000, 2 Milliarden -> 2000000000).",
  "Groessenbegriffe: Micro Cap < 3e8, Small Cap 3e8-2e9, Mid Cap 2e9-1e10, Large Cap > 1e10, Mega Cap > 2e11.",
  "\"neues 52-Wochen-Hoch\" / \"Jahreshoch\" / \"All-Time-High im letzten Jahr\" -> newHigh52w is true.",
  "Begriffe ohne Zahl woertlich und eher grosszuegig nehmen, nie strenger als gesagt:",
  "  \"positiv\", \"wachsend\", \"steigend\", \"im Plus\" -> gt 0 (NICHT 20 %). \"profitabel\" -> netMargin gt 0.",
  "  \"hoch\", \"stark\", \"deutlich\" -> gt 0.15 bei Wachstum. \"sehr hoch\", \"extrem\" -> gt 0.3.",
  "  Jede solche Annahme in notes nennen, damit der Nutzer sie korrigieren kann.",
  "Wachstum/gestiegen/zugelegt/entwickelt beim Cashflow -> fcfGrowth; beim Umsatz -> revenueGrowth; beim Gewinn je Aktie -> epsGrowth.",
  "",
  "SUPERTRADER: Vision Universe prueft taeglich vier Handelsstrategien.",
  "MINERVINI_VCP = Mark Minervini, Trend Template / VCP / \"Minervini-Raster\" / \"Super-Trader-Raster\" / SEPA.",
  "MOMENTUM_BREAKOUT = Kullamaegi-Momentum-Ausbruch. WEINSTEIN_STAGE = Stan Weinstein, Stage 2 / Phasenanalyse. DARVAS_BOX = Nicolas Darvas, Box-Ausbruch.",
  "supertrader.mode: \"require\" wenn nur Titel gewuenscht sind, die die Strategie erfuellen; \"show\" wenn der Status nur angezeigt werden soll; sonst \"none\" mit strategy \"NONE\".",
  "",
  "CHARTBILD: Fragt jemand nach der Chartlage, dem Chartbild, Trend, Szenario, Einstiegszone, Ungueltig-Linie",
  "oder Elliott-Wellen einer bestimmten Aktie -> kind stock, Ticker in tickers, chartbild true. Dann zeigt Vision Universe das",
  `Werkzeug ${CHARTBILD_TOOL.name} (${CHARTBILD_TOOL.description}) - Werte nennst du nicht.`,
  "Sonst chartbild false. \"Wird die Aktie steigen\", \"soll ich kaufen\" bleibt forecast, auch mit Chartbezug.",
  "Suche nach Titeln in einer Chartlage (\"Aktien im Ruecksetzer im Aufwaertstrend\") -> kind screen mit tiStructure/tiOutlook.",
  "tiElliottApplicable ist experimentell und keine Prognose; nur verwenden, wenn ausdruecklich nach Elliott gefragt wird.",
  "",
  "SPALTEN (show): Kennzahlen, die der Nutzer zusaetzlich sehen will. Nach Moeglichkeit auch die gefilterten Felder.",
  "",
  "NICHT VORHANDEN (missing): Alles, was der Nutzer wissen will, wofuer es unten kein Feld gibt, als kurzer Wunsch auf Deutsch.",
  "type: withheld = vorhanden, aber nicht freigegeben (z. B. der Quant-Gesamtscore); estimates = Analystenschaetzungen;",
  "history = Zeitreihen/Verlauf ueber mehrere Jahre; product = eine Funktion, die es nicht gibt; field = eine fehlende Kennzahl; other = sonstiges.",
  "Fragt jemand nach dem Quant Score / VU Score / Quant-Gesamtscore: missing {wish: \"Quant-Gesamtscore\", type: \"withheld\"} und",
  "stattdessen die Faktoren qualityFactor, growthFactor, momentumFactor, valueFactor in show.",
  "Erfinde nie ein Feld und biege eine Frage nicht auf ein unpassendes Feld um - dann lieber missing.",
  "",
  "SPRACHEINGABE: Viele Fragen sind gesprochen und von der Spracherkennung des Browsers verschrieben. Lies sie nach dem KLANG,",
  "nicht nach der Schreibweise, und nimm im Investmentkontext das naheliegende Wort:",
  "  \"Ganzow\", \"Quandt\", \"Kwant\", \"Quanz\", \"Kuant\", \"Konto Score\", \"Quantscore\" -> Quant Score;",
  "  \"Minerwini\", \"Miner Vini\" -> Minervini; \"Darwas\", \"Dar Was\" -> Darvas; \"Weinstein\"-Varianten -> Weinstein;",
  "  \"Kulla Megi\", \"Kullamegi\" -> Kullamaegi; \"Envidia\", \"In Video\", \"Nvidea\" -> NVDA; \"Epel\" -> AAPL; \"Tesler\" -> TSLA;",
  "  \"Kah Geh Vau\" -> KGV; \"Cash Flo\", \"Kesch Flow\" -> Cashflow; \"Ebit\"/\"Ebitda\" so lesen, wie gesprochen.",
  "  Ist die Deutung plausibel, uebersetze die Frage (NICHT unclear) und nenne die Deutung in notes",
  "  (z. B. \"'Ganzow' als Quant Score verstanden\"). unclear nur, wenn auch nach dem Klang nichts Sinnvolles passt.",
  "",
  "NACHFRAGEN: Enthaelt die Nachricht eine VORHERIGE FRAGE und eine VORHERIGE INTERPRETATION, ist die neue Nachricht eine",
  "Korrektur oder Ergaenzung dazu (\"nicht 20 %, sondern positiv\", \"und nur Tech\", \"ohne Minervini\"). Gib dann die",
  "VOLLSTAENDIGE, aktualisierte Abfrage zurueck: alles Vorherige uebernehmen, nur das Genannte aendern.",
  "",
  "understood: Ein kurzer deutscher Satz, wie du die Frage verstanden hast (ohne Zahlenwerte aus den Daten).",
  "notes: Annahmen, die du treffen musstest (hoechstens drei, kurz).",
  "sort: sinnvolle Sortierung oder field \"none\". limit: 25, ausser der Nutzer nennt eine Anzahl (hoechstens 100).",
  "",
  "VERFUEGBARE FELDER (id | Bezeichnung | Einheit | Beschreibung):",
  ...AVAILABLE.map(fieldLine),
  "",
  "LISTENWERTE:",
  `sector: ${ENUM_VALUES.sector.map((k) => `${k} (${SECTORS[k]})`).join(", ")}`,
  `industry (SIC-Hauptgruppe): ${ENUM_VALUES.industry.map((k) => `${k} ${MAJOR_GROUPS[k]}`).join("; ")}`,
  `exchange: ${ENUM_VALUES.exchange.join(", ")}; companyType: ${ENUM_VALUES.companyType.join(", ")}; index: SP500 (S&P 500), NDX (Nasdaq-100), DJIA (Dow Jones)`,
  enumLine("tiOutlook"), enumLine("tiStructure"), enumLine("tiElliottApplicable"),
  "",
  "IN VISION UNIVERSE NOCH NICHT VERFUEGBAR (bei Nachfrage -> missing):",
  ...UNAVAILABLE.map((f) => `${f.id} | ${f.label}`),
].join("\n");

const nullable = (type) => ({ anyOf: [{ type }, { type: "null" }] });

/* Das Antwortschema. Structured Outputs erzwingen es: Feldnamen,
   Operatoren und Strategien sind geschlossene Listen. Zahlengrenzen kann
   das Schema nicht ausdruecken - die prueft danach Query.validate. */
export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "understood", "filters", "tickers", "show", "supertrader", "chartbild", "sort", "limit", "missing", "notes"],
  properties: {
    kind: { type: "string", enum: KINDS },
    understood: { type: "string" },
    filters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "op", "value", "value2", "values", "flag"],
        properties: {
          field: { type: "string", enum: FIELD_IDS },
          op: { type: "string", enum: ["gt", "gte", "lt", "lte", "between", "eq", "in", "is"] },
          value: nullable("number"),
          value2: nullable("number"),
          values: { type: "array", items: { type: "string" } },
          flag: nullable("boolean"),
        },
      },
    },
    tickers: { type: "array", items: { type: "string" } },
    show: { type: "array", items: { type: "string", enum: FIELD_IDS } },
    supertrader: {
      type: "object",
      additionalProperties: false,
      required: ["strategy", "mode"],
      properties: {
        strategy: { type: "string", enum: ["NONE", ...STRATEGIES] },
        mode: { type: "string", enum: ["none", "require", "show"] },
      },
    },
    chartbild: { type: "boolean" },
    sort: {
      type: "object",
      additionalProperties: false,
      required: ["field", "dir"],
      properties: {
        field: { type: "string", enum: ["none", ...NUMERIC_IDS] },
        dir: { type: "string", enum: ["asc", "desc"] },
      },
    },
    limit: { type: "integer" },
    missing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["wish", "type"],
        properties: {
          wish: { type: "string" },
          type: { type: "string", enum: MISSING_TYPES },
        },
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
};
