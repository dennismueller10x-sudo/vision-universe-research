/* =========================================================================
   VISION UNIVERSE — build-preview-dataset.mjs

   BAUT DEN DATENSATZ FUER DIE GESCHUETZTE VORSCHAU.

   Er entsteht zur BAUZEIT und wird nie committet. Das ist der Kern der
   Trennung: dasselbe Repository speist zwei Auslieferungen, und nur die
   geschuetzte bekommt diese Dateien. GitHub Pages baut ohne diesen
   Schritt und bleibt damit Byte fuer Byte, was es war.

   WORAUS - UND WORAUS NICHT

   Quelle sind ausschliesslich die bereits geprueften, committeten
   Artefakte des FULL_UNIVERSE-Laufs. Es wird nichts beim Anbieter
   geholt, nichts nachgerechnet und nichts geschaetzt.

   ABGELEITETES UNIVERSUM ist nicht der KURSHISTORIEN-BESTAND.

   Was hier entsteht, sind Zustaende, Zaehlungen und Einordnungen je
   Titel. Die rund 7,4 GB Kursreihen sind NICHT dabei - sie lagen in der
   Arbeitsablage eines Actions-Laufs, der laengst freigegeben ist. Kein
   Kursniveau verlaesst diesen Schritt; das ist zugleich die
   Lizenzbedingung (§34) und der Grund, warum der Rest ausgeliefert
   werden darf.

   WAS FEHLT UND WARUM

   Die Faktorzeilen je Titel (SMA-Zustaende, Momentum, relative Staerke)
   fuer alle 5.639 auswertbaren Titel liegen ebenfalls nur in jener
   Arbeitsablage. Committet wurden Deckungsbilanz, Screener-Zaehlungen
   und der Canary-Satz - so sah es die Detailgrenze (§26) vor. Dieser
   Schritt erfindet sie nicht. Er liefert, was belegt ist, und sagt beim
   Rest, dass er fehlt.

   Ausfuehren:
     node scripts/preview/build-preview-dataset.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const GATE = arg("--gate", "FULL_UNIVERSE");
const OUT_DIR = arg("--out", join(root, "quant", "data", "preview"));

function lies(pfad) {
  if (!existsSync(pfad)) return null;
  try { return JSON.parse(readFileSync(pfad, "utf8")); } catch (err) { return null; }
}

const universum = lies(join(root, "quant/data/market/scale", `universe-${GATE}.json`));
const gate = lies(join(root, "quant/data/market/scale", `gate-${GATE}.json`));
const screener = lies(join(root, "quant/data/market/factors", `screener-${GATE}.json`));
const faktoren = lies(join(root, "quant/data/market/factors", `factors-${GATE}-summary.json`));
const technical = lies(join(root, "quant/data/technical/scale", `technical-coverage-${GATE}.json`));

/* DAS DAUERHAFTE FAKTORARTEFAKT.

   Bisher gab es Faktorzeilen nur fuer den Canary: die Zeilen aller Titel
   lagen in der Arbeitsablage des Runners und starben mit ihm. Liegt das
   committete Artefakt vor, kommen sie von dort - bei JEDEM Build, ohne
   eine einzige Anbieteranfrage.

   Fehlt es, aendert sich nichts am Verhalten von vorher: der Canary
   traegt Faktoren, alle anderen tragen NOT_IN_DELIVERED_ARTEFACTS. Ein
   fehlendes Artefakt darf nicht dazu fuehren, dass irgendwo eine Null
   steht, wo eine Aussage fehlt. */
const faktorArtefakt = lies(arg("--factor-artefact",
  join(root, "_preview-data", `factors-${GATE}.json`)));

/* fieldStatus steht im Artefakt einmal oben als Vorlage. Hier wird er je
   Zeile wieder aufgelegt - sonst traegt die Vorschau Werte ohne die
   Angabe, welche davon berechnet und welche zurueckgehalten sind. */
/* Die Vorlagen bleiben VORLAGEN, auch hier.

   Ein erster Versuch legte fieldStatus je Zeile wieder auf - und blies
   den Vorschaudatensatz von 3,8 MB auf 15 MB auf. Genau die
   Wiederholung, die im Artefakt herausgerechnet wurde, war damit wieder
   drin: dasselbe Schema 5.636 mal. Der Datensatz traegt die Vorlagen
   deshalb einmal oben, die Zeile verweist darauf. */
const fieldStatusVorlagen = (faktorArtefakt && faktorArtefakt.fieldStatusTemplates) || [];
const artefaktZeilen = new Map();
if (faktorArtefakt && Array.isArray(faktorArtefakt.securities)) {
  for (const z of faktorArtefakt.securities) artefaktZeilen.set(z.ticker, z);
}

/* Der Canary aus der Zusammenfassung traegt seinen fieldStatus als
   Objekt. Damit die Zeile EINE Form hat, bekommt er eine eigene Vorlage
   angehaengt - sonst haette dieselbe Angabe je nach Herkunft zwei
   Gestalten, und jeder Leser muesste beide kennen. */
function vorlagenVerweis(f) {
  if (typeof f.fieldStatusRef === "number") return f.fieldStatusRef;
  if (!f.fieldStatus) return null;
  const key = JSON.stringify(f.fieldStatus);
  for (let i = 0; i < fieldStatusVorlagen.length; i++) {
    if (JSON.stringify(fieldStatusVorlagen[i]) === key) return i;
  }
  fieldStatusVorlagen.push(f.fieldStatus);
  return fieldStatusVorlagen.length - 1;
}

if (!universum || !gate) {
  console.error(`\n  Kein Universum oder Gate-Bericht fuer ${GATE}. Es wird nichts gebaut.\n`);
  process.exit(1);
}

/* ------------------------------------------------------------- Zeilen */

/* Je Titel: was aus den Artefakten wirklich hervorgeht.

   Die Felder sind bewusst ANDERS benannt als im synthetischen
   Modelluniversum. Dieselben Namen mit anderer Bedeutung waeren die
   schlimmste Variante: eine Oberflaeche, die "momentum12m" anzeigt, wo
   in Wahrheit nichts gerechnet wurde. */
const qualitaet = gate.perSymbol || {};
const technischeZeilen = (technical && technical.perSymbol) || {};
const canaryFaktoren = new Map(((faktoren && faktoren.canary) || []).map((c) => [c.ticker, c]));
const canarySatz = new Set((gate.canary && gate.canary.symbols) || []);

let mitQualitaet = 0, mitTechnical = 0, mitFaktoren = 0;

const zeilen = universum.securities.map((s) => {
  const q = qualitaet[s.ticker] || null;
  const t = technischeZeilen[s.ticker] || null;
  /* Das Artefakt zuerst, der Canary-Satz als Rueckfall. Beide tragen
     dieselbe Form; das Artefakt deckt alle Titel, der Canary fuenf. */
  const f = artefaktZeilen.get(s.ticker) || canaryFaktoren.get(s.ticker) || null;
  if (q) mitQualitaet++;
  if (t) mitTechnical++;
  if (f) mitFaktoren++;

  return {
    securityId: s.securityId,
    ticker: s.ticker,
    /* Der Firmenname fehlt im Zugang. Nicht den Ticker als Namen
       ausgeben - das saehe aus wie eine Auskunft. */
    name: s.company || null,
    nameStatus: s.company ? "PRESENT" : "SOURCE_MISSING",
    exchange: s.exchange || null,
    country: s.country || null,
    currency: s.currency || null,
    instrumentType: s.instrumentType || null,
    sector: s.sector || null,
    sectorStatus: s.sectorStatus || "SOURCE_MISSING",
    active: s.active === undefined ? null : s.active,
    listedSince: s.startDate || null,

    /* Belegte Historie und Qualitaet. Fuer Titel ohne eigene Zeile im
       Bericht steht hier ausdruecklich der Grund - nicht null als
       stiller Platzhalter (§30). */
    dataQuality: q ? q.status : (s.ticker ? "PASS_NOT_ITEMISED" : null),
    dataQualityReason: q ? (q.reason || null)
      : "Sauber durchgelaufen; PASS-Zeilen wurden nicht einzeln ausgeliefert (§26).",
    bars: q ? q.bars : null,
    historyFrom: q ? q.first : null,
    historyTo: q ? q.last : null,
    historyYears: q ? q.historyYears : null,
    staleTradingDays: q ? q.staleTradingDays : null,
    splits: q ? q.splits : null,
    dividends: q ? q.dividends : null,
    adjustment: q ? q.adjustmentInferred : null,
    factorReady: q ? q.factorReady : null,

    technical: t ? t.technical : null,
    elliott: t ? t.elliott : null,
    elliottConfidence: t ? (t.elliottConfidence === undefined ? null : t.elliottConfidence) : null,
    trend: t ? (t.trend || null) : null,

    /* Faktoren kommen aus dem dauerhaften Artefakt, wenn es vorliegt -
       sonst nur fuer den Canary. Fuer alle anderen ist das
       Feld ausdruecklich als fehlend gekennzeichnet, nicht leer. */
    factors: f ? { values: f.values, fieldStatusRef: vorlagenVerweis(f),
                   asOf: f.asOf, basis: f.basis } : null,
    factorsStatus: f ? "PRESENT" : "NOT_IN_DELIVERED_ARTEFACTS",
    factorsSource: f
      ? (artefaktZeilen.has(s.ticker) ? "DURABLE_ARTEFACT" : "CANARY_IN_SUMMARY")
      : null,

    isCanary: canarySatz.has(s.ticker),
    isMock: false
  };
});

/* --------------------------------------------------------- Datensatz */

const datensatz = {
  generatedAt: new Date().toISOString(),
  gate: GATE,
  kind: "DERIVED_UNIVERSE",
  asOf: (gate.historyCoverage && gate.historyCoverage.newestLastDate) || null,
  dataSnapshotId: `preview_${GATE}_${(gate.run && gate.run.commit || "unbekannt").slice(0, 12)}`,

  /* Die Unterscheidung, auf die es ankommt - maschinenlesbar, damit die
     Oberflaeche sie nicht erraten muss. */
  datasetScope: {
    derivedUniverse: {
      status: "PRESENT",
      securities: zeilen.length,
      note: "Zustaende, Zaehlungen und Einordnungen je Titel. Aus den geprueften " +
            "Artefakten des FULL_UNIVERSE-Laufs, ohne einen einzigen Kursabruf."
    },
    fullHistoricalOhlcvStore: {
      status: "NOT_DEPLOYED",
      approximateSize: "~7.4 GB",
      location: ".market-cache auf einem freigegebenen Actions-Runner",
      note: "Die Kursreihen sind NICHT ausgeliefert und liegen nirgends im " +
            "Repository. Wer sie braucht, braucht einen neuen Lauf und einen " +
            "Ablageort ausserhalb von Git."
    },
    priceLevels: {
      status: "WITHHELD_REDISTRIBUTION",
      note: "Absolute Kursniveaus bleiben zurueck (§34). Ausgeliefert werden " +
            "Zustaende, Abstaende und Renditen - nie ein Kurs."
    }
  },

  coverage: {
    securities: zeilen.length,
    withQualityRow: mitQualitaet,
    withoutQualityRow: zeilen.length - mitQualitaet,
    withTechnicalRow: mitTechnical,
    withFactorRow: mitFaktoren,
    resolved: gate.accounting.resolved,
    requested: gate.accounting.requested,
    dataQuality: gate.dataQuality || null,
    note: "withQualityRow zaehlt die Titel mit eigener Zeile im Gate-Bericht - das " +
          "sind alle NICHT-PASS-Titel. Die uebrigen sind sauber durchgelaufen, " +
          "aber nicht einzeln ausgewiesen (Detailgrenze §26)."
  },

  /* Die echten Screener-Zaehlungen und Ranglisten ueber alle auswertbaren
     Titel.

     HIER LAG EIN FEHLER, UND ZWAR MEINER. Die Rangfragen wurden auf
     q.tickers abgebildet - ein Feld, das nur die ZAEHLFRAGEN fuehren.
     Die Rangfragen legen ihre Namen unter q.top ab, mit Wert je Titel,
     und die lagen die ganze Zeit im Artefakt. Gemeldet habe ich
     stattdessen "die Rangliste fehlt in den ausgelieferten Artefakten".
     Es fehlte nichts; es wurde am falschen Feld gesucht.

     Die Zahlen sind vollstaendig; die Namenslisten sind auf 50 gekuerzt,
     weil das Artefakt sie so ausliefert. Beides steht dabei. */
  screenerQuestions: screener ? screener.questions.map((q) => {
    const rang = q.kind === "ranked";
    /* Der Rangwert kommt mit. Eine Rangliste ohne Werte laesst sich nicht
       nachrechnen - und bei diesen Daten ist genau das noetig: an der
       Spitze der Momentumliste stehen Titel mit Werten, die kein
       Kursverlauf hergibt, sondern eine Bereinigungsluecke. Der Wert
       daneben macht das sichtbar, ein blosser Name nicht.

       Deshalb steht auch die Datenqualitaet des Titels dabei: sie ist
       die Erklaerung fuer den Ausreisser, und ohne sie liest sich eine
       kaputte Reihe wie der staerkste Titel des Universums. */
    const eintraege = rang
      ? (q.top || []).map((t) => ({
          ticker: t.ticker,
          value: t.value,
          dataQuality: (qualitaet[t.ticker] && qualitaet[t.ticker].status) || "PASS_NOT_ITEMISED"
        }))
      : (q.tickers || []).map((t) => ({ ticker: t, value: null, dataQuality: null }));
    const gekuerzt = rang
      ? (q.evaluated || 0) > eintraege.length
      : !!q.tickersTruncated;
    return {
      id: q.id, label: q.label, kind: q.kind,
      direction: q.direction || null,
      matched: q.matched === undefined ? null : q.matched,
      notMatched: q.notMatched === undefined ? null : q.notMatched,
      notEvaluable: q.notEvaluable === undefined ? null : q.notEvaluable,
      evaluated: q.evaluated === undefined ? null : q.evaluated,
      evaluatedOf: q.evaluatedOf === undefined ? null : q.evaluatedOf,
      entries: eintraege,
      /* tickers bleibt als reine Namensliste erhalten - die Ansicht und
         aeltere Leser stuetzen sich darauf. */
      tickers: eintraege.map((e) => e.ticker),
      tickersTruncated: gekuerzt,
      tickersNote: gekuerzt
        ? "Die Namensliste ist im Artefakt auf 50 gekuerzt. Die Zahlen links sind vollstaendig."
        : null,
      /* Ob das Ergebnis da ist, sagt die Frage von sich aus. Eine leere
         Liste ohne Status rendert als nichts - und nichts liest sich wie
         "keine Treffer". */
      resultStatus: rang
        ? (eintraege.length ? "PRESENT" : "NOT_IN_DELIVERED_ARTEFACTS")
        : (q.matched === undefined || q.matched === null ? "NOT_IN_DELIVERED_ARTEFACTS" : "PRESENT"),
      resultStatusReason: rang && !eintraege.length
        ? "Rangliste braucht Faktorwerte je Titel; die liegen nicht in den " +
          "ausgelieferten Artefakten."
        : null
    };
  }) : [],

  /* Die fieldStatus-Vorlagen, auf die jede Faktorzeile verweist.
     Auflegen: zeile.factors.fieldStatus =
       datensatz.fieldStatusTemplates[zeile.factors.fieldStatusRef]. */
  fieldStatusTemplates: fieldStatusVorlagen,
  factorArtefact: faktorArtefakt
    ? { present: true, gate: faktorArtefakt.gate,
        securities: (faktorArtefakt.securities || []).length,
        generatedAt: faktorArtefakt.generatedAt,
        derivedFrom: faktorArtefakt.derivedFrom || null,
        entitlement: faktorArtefakt.entitlement ? faktorArtefakt.entitlement.delivery : null }
    : { present: false,
        note: "Ohne das dauerhafte Artefakt tragen nur die Canary-Titel Faktorzeilen. " +
              "Es entsteht im Gate-Lauf (scripts/preview/build-factor-artefact.mjs) und " +
              "wird committet - sonst stirbt es mit dem Runner." },
  factorCoverage: faktoren ? faktoren.coverage : null,
  technicalCoverage: technical ? { coverage: technical.coverage, elliott: technical.elliott } : null,

  rows: zeilen
};

mkdirSync(OUT_DIR, { recursive: true });
const datei = join(OUT_DIR, "universe.json");
writeFileSync(datei, JSON.stringify(datensatz));

/* Eine kleine Bilanz daneben - fuer den Zustandsbericht und fuer den
   Nachweis, ohne die grosse Datei laden zu muessen. */
const bilanz = Object.assign({}, datensatz, { rows: undefined, screenerQuestions: undefined });
delete bilanz.rows; delete bilanz.screenerQuestions;
bilanz.screenerQuestionCount = datensatz.screenerQuestions.length;
writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(bilanz, null, 2) + "\n");

/* ------------------------------------------------------- Die Ansicht

   Auch die Seite entsteht zur Bauzeit und wird nie committet. Damit
   bleibt GitHub Pages Byte fuer Byte, was es war: dort gibt es diese
   Datei schlicht nicht.

   Sie ist bewusst klein und eigenstaendig - kein Umbau der Anwendung,
   kein Vorgriff auf Vision Universe 2.0. Ein Fenster auf das, was
   gemessen wurde. */
const ansichtsVerzeichnis = join(root, "preview-universe");
mkdirSync(ansichtsVerzeichnis, { recursive: true });
writeFileSync(join(ansichtsVerzeichnis, "index.html"), `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Full Universe — Interne Vorschau</title>
<style>
 :root { color-scheme: dark; --bg:#0d1117; --karte:#161b22; --rand:#30363d;
         --text:#e6edf3; --leise:#8b949e; --gut:#3fb950; --warn:#d29922; --schlecht:#f85149; }
 * { box-sizing:border-box; }
 body { margin:0; background:var(--bg); color:var(--text); padding:20px 16px 60px;
        font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
 .huelle { max-width:1180px; margin:0 auto; }
 .marke { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--leise); }
 h1 { font-size:22px; margin:4px 0 12px; }
 .umfang { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
           margin:0 0 20px; }
 .feld { background:var(--karte); border:1px solid var(--rand); border-radius:8px; padding:12px 14px; }
 .feld b { display:block; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
           color:var(--leise); margin-bottom:4px; }
 .ja { color:var(--gut); } .nein { color:var(--schlecht); } .teil { color:var(--warn); }
 .zahlen { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin:0 0 20px; }
 .zahl { background:var(--karte); border:1px solid var(--rand); border-radius:8px; padding:12px 14px; }
 .zahl .n { font-size:22px; font-weight:600; }
 .zahl .b { font-size:11px; color:var(--leise); text-transform:uppercase; letter-spacing:.06em; }
 .werkzeuge { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 12px; }
 input,select { background:#0d1117; color:var(--text); border:1px solid var(--rand);
                border-radius:6px; padding:8px 10px; font-size:13px; }
 input { flex:1 1 220px; min-width:0; }
 table { width:100%; border-collapse:collapse; font-size:13px; }
 .tabellenrahmen { overflow-x:auto; border:1px solid var(--rand); border-radius:8px;
                   background:var(--karte); }
 th,td { padding:7px 10px; text-align:left; white-space:nowrap; border-bottom:1px solid #21262d; }
 th { position:sticky; top:0; background:#1c2128; font-size:11px; text-transform:uppercase;
      letter-spacing:.05em; color:var(--leise); cursor:pointer; user-select:none; }
 tbody tr:hover { background:#1c2128; }
 .PASS,.PASS_NOT_ITEMISED { color:var(--gut); } .WARNING { color:var(--warn); }
 .FAIL,.UNAVAILABLE { color:var(--schlecht); }
 .fehlt { color:var(--leise); font-style:italic; }
 .titel { background:var(--karte); border:1px solid var(--rand); border-radius:8px;
          padding:14px 16px; margin:0 0 16px; }
 .titel h2 { margin:0 0 2px; font-size:18px; }
 .titel .weg { float:right; background:none; border:1px solid var(--rand); color:var(--leise);
               border-radius:6px; padding:4px 10px; cursor:pointer; font-size:12px; }
 .titel dl { display:grid; gap:6px 18px; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
             margin:12px 0 0; }
 .titel dt { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--leise); }
 .titel dd { margin:0 0 6px; font-variant-numeric:tabular-nums; }
 .titel .luecke { margin:12px 0 0; padding:8px 10px; border-left:2px solid var(--warn);
                  color:var(--leise); font-size:12px; line-height:1.6; }
 .faktoren { margin:14px 0 0; padding:12px 0 0; border-top:1px solid var(--rand); }
 .faktoren > b { font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
 .faktoren .quelle { color:var(--leise); font-size:11px; }
 .faktoren .fgruppe { margin:10px 0 0; }
 .fkopf { display:block; font-size:11px; letter-spacing:.06em; text-transform:uppercase;
          color:var(--leise); margin-bottom:3px; }
 .fzeile { display:flex; justify-content:space-between; gap:12px; font-size:12px;
           padding:2px 0; border-bottom:1px solid #21262d; }
 .fzeile span:last-child { font-variant-numeric:tabular-nums; }
 tbody tr { cursor:pointer; }
 .fragen { margin:26px 0 0; }
 .rangfrage { border-bottom:1px solid #21262d; }
 .rangfrage summary { display:flex; justify-content:space-between; gap:12px; padding:8px 12px;
                      cursor:pointer; list-style:none; }
 .rangfrage summary::-webkit-details-marker { display:none; }
 .rangfrage summary:hover { background:#1c2128; }
 .rangfrage summary span:last-child { color:var(--leise); font-variant-numeric:tabular-nums; }
 .rangzeile { display:flex; justify-content:space-between; gap:12px;
              padding:4px 12px 4px 26px; font-size:12px; }
 .rangzeile span:last-child { font-variant-numeric:tabular-nums; color:var(--leise); }
 .rangzeile .WARNING { color:var(--warn); font-size:10px; letter-spacing:.05em; }
 .rangzeile .FAIL { color:var(--schlecht); font-size:10px; letter-spacing:.05em; }
 .rangzeile .PASS, .rangzeile .PASS_NOT_ITEMISED { color:var(--gut); font-size:10px;
              letter-spacing:.05em; }
 .hinweis { color:var(--leise); font-size:11px; padding:6px 12px 10px 26px; margin:0; }
 .frage { display:flex; justify-content:space-between; gap:12px; padding:8px 12px;
          border-bottom:1px solid #21262d; }
 .frage span:last-child { color:var(--leise); font-variant-numeric:tabular-nums; }
 footer { margin-top:28px; color:var(--leise); font-size:12px; line-height:1.6; }
 @media (max-width:480px){ h1{font-size:19px;} body{padding:16px 12px 48px;} }
</style></head><body><div class="huelle">
 <p class="marke">Vision Universe® — geschuetzte Vorschau</p>
 <h1>Full Universe</h1>
 <div class="umfang" id="umfang"></div>
 <div class="zahlen" id="zahlen"></div>
 <div class="titel" id="titel" hidden></div>
 <div class="werkzeuge">
   <input id="suche" type="search" placeholder="Ticker suchen" autocomplete="off">
   <select id="boerse"><option value="">Alle Boersen</option></select>
   <select id="guete"><option value="">Alle Qualitaeten</option></select>
   <select id="bereinigung"><option value="">Alle Bereinigungsstufen</option></select>
 </div>
 <p id="treffer" style="color:var(--leise);font-size:12px;margin:0 0 8px"></p>
 <div class="tabellenrahmen"><table>
   <thead><tr>
     <th data-s="ticker">Ticker</th><th data-s="exchange">Boerse</th>
     <th data-s="dataQuality">Qualitaet</th><th data-s="bars">Bars</th>
     <th data-s="historyFrom">ab</th><th data-s="historyTo">bis</th>
     <th data-s="historyYears">Jahre</th><th data-s="splits">Splits</th>
     <th data-s="dividends">Div.</th><th data-s="adjustment">Bereinigung</th>
     <th data-s="technical">Technical</th><th data-s="elliott">Elliott</th>
   </tr></thead><tbody id="koerper"></tbody>
 </table></div>
 <div class="fragen"><h2 style="font-size:15px">Screener — echte Zaehlungen ueber <span id="auswertbar">…</span> auswertbare Titel</h2>
   <p style="color:var(--leise);font-size:12px;margin:0 0 8px">Zaehlfragen tragen
   vollstaendige Zahlen. Rangfragen zeigen die ersten 50 mit ihrem Wert und der
   Datenqualitaet des Titels — ein Ausreisser an der Spitze ist fast immer eine
   Bereinigungsluecke und keine Kursbewegung. Aufklappen zeigt die Liste.</p>
   <div id="fragenliste"></div></div>
 <footer id="fuss"></footer>
</div>
<script>
(async function(){
  const d = await (await fetch("/quant/data/preview/universe.json")).json();
  const q = (id) => document.getElementById(id);

  const u = d.datasetScope;
  q("umfang").innerHTML =
    '<div class="feld"><b>Abgeleitetes Universum</b><span class="ja">VORHANDEN</span> — ' +
      u.derivedUniverse.securities.toLocaleString("de-DE") + ' Titel</div>' +
    '<div class="feld"><b>Kurshistorien-Bestand</b><span class="nein">NICHT AUSGELIEFERT</span> — ' +
      u.fullHistoricalOhlcvStore.approximateSize + '</div>' +
    '<div class="feld"><b>Kursniveaus</b><span class="teil">ZURUECKGEHALTEN</span> — Lizenzpruefung offen</div>';

  const c = d.coverage;
  q("zahlen").innerHTML = [
    ["Titel", c.securities], ["aufgeloest", c.resolved],
    ["mit Qualitaetszeile", c.withQualityRow], ["mit Technical-Zeile", c.withTechnicalRow],
    ["mit Faktorzeile", c.withFactorRow]
  ].map(([b,n]) => '<div class="zahl"><div class="n">' + n.toLocaleString("de-DE") +
     '</div><div class="b">' + b + '</div></div>').join("");

  const füll = (id, werte) => { const s = q(id);
    [...new Set(werte.filter(Boolean))].sort().forEach(v => {
      const o = document.createElement("option"); o.value = o.textContent = v; s.appendChild(o); }); };
  füll("boerse", d.rows.map(r => r.exchange));
  füll("guete", d.rows.map(r => r.dataQuality));
  füll("bereinigung", d.rows.map(r => r.adjustment));

  let sortSpalte = "ticker", sortAuf = true;
  const z = (v) => v === null || v === undefined ? '<span class="fehlt">—</span>' : v;

  function zeichne(){
    const s = q("suche").value.trim().toUpperCase();
    const b = q("boerse").value, g = q("guete").value, a = q("bereinigung").value;
    let r = d.rows.filter(x =>
      (!s || x.ticker.includes(s)) && (!b || x.exchange === b) &&
      (!g || x.dataQuality === g) && (!a || x.adjustment === a));
    r.sort((x,y) => { const p = x[sortSpalte], k = y[sortSpalte];
      if (p === k) return x.ticker < y.ticker ? -1 : 1;
      if (p === null || p === undefined) return 1;
      if (k === null || k === undefined) return -1;
      return (p < k ? -1 : 1) * (sortAuf ? 1 : -1); });
    q("treffer").textContent = r.length.toLocaleString("de-DE") + " von " +
      d.rows.length.toLocaleString("de-DE") + " Titeln" + (r.length > 500 ? " — erste 500 gezeigt" : "");
    q("koerper").innerHTML = r.slice(0,500).map(x =>
      '<tr><td><strong>' + x.ticker + '</strong></td><td>' + z(x.exchange) +
      '</td><td class="' + (x.dataQuality||"") + '">' + z(x.dataQuality) + '</td><td>' +
      (x.bars === null ? z(null) : x.bars.toLocaleString("de-DE")) + '</td><td>' + z(x.historyFrom) +
      '</td><td>' + z(x.historyTo) + '</td><td>' + z(x.historyYears) + '</td><td>' + z(x.splits) +
      '</td><td>' + z(x.dividends) + '</td><td>' + z(x.adjustment) + '</td><td>' + z(x.technical) +
      '</td><td>' + z(x.elliott) + '</td></tr>').join("");
  }

  /* EINZELTITEL — die Suche braucht ein Ziel.

     "Titel ausserhalb der Golden Five sind auffindbar" ist erst dann
     wahr, wenn man einen davon auch OEFFNEN kann. Die Ansicht zeigt
     ausschliesslich, was gemessen wurde, und benennt darunter, was in
     den ausgelieferten Artefakten fehlt - kein leeres Feld, das wie ein
     Nullwert aussieht. */
  function zeigeTitel(ticker){
    const x = d.rows.find(r => r.ticker === ticker);
    const k = q("titel");
    if (!x) { k.hidden = true; return; }
    const paare = [
      ["Boerse", z(x.exchange)], ["Anlageklasse", z(x.assetType)],
      ["Datenqualitaet", z(x.dataQuality)], ["Bars", x.bars === null ? z(null) : x.bars.toLocaleString("de-DE")],
      ["Historie ab", z(x.historyFrom)], ["Historie bis", z(x.historyTo)],
      ["Jahre", z(x.historyYears)], ["Handelstage veraltet", z(x.staleTradingDays)],
      ["Splits", z(x.splits)], ["Dividenden", z(x.dividends)],
      ["Bereinigung", z(x.adjustment)], ["Faktorbereit", x.factorReady === null ? z(null) : (x.factorReady ? "ja" : "nein")],
      ["Technical", z(x.technical)], ["Elliott", z(x.elliott)]
    ];
    /* DIE FAKTOREN. Sie liegen seit dem dauerhaften Artefakt fuer jeden
       auswertbaren Titel vor - sie hier nicht zu zeigen hiesse, einen
       57-Minuten-Lauf ins Leere rechnen zu lassen.

       Kursniveaus stehen NICHT dabei und koennen es nicht: das Artefakt
       traegt keine. Was dasteht, ist der Zustand und der ABSTAND - "3,4 %
       unter dem SMA200" ist eine abgeleitete Aussage, "das SMA200 liegt
       bei 184,20" waere der Kurs des Anbieters. Die Vorlage sagt das je
       Feld, und die Fusszeile des Blocks schreibt es hin. */
    let faktorBlock = "";
    if (x.factorsStatus === "PRESENT" && x.factors && x.factors.values) {
      const v = x.factors.values;
      const pz = (w) => w === null || w === undefined || !isFinite(w)
        ? '<span class="fehlt">—</span>'
        : '<span class="' + (w >= 0 ? "ja" : "nein") + '">' +
          (w >= 0 ? "+" : "") + (w * 100).toLocaleString("de-DE",
            { maximumFractionDigits: 1 }) + " %</span>";
      const zu = (b) => b === true ? '<span class="ja">darueber</span>'
        : b === false ? '<span class="nein">darunter</span>' : '<span class="fehlt">—</span>';
      const r = v.returns || {}, rs = v.relativeStrength || {};
      const gruppen = [
        ["Momentum", [["1 Monat", pz(r["1M"])], ["3 Monate", pz(r["3M"])],
                      ["6 Monate", pz(r["6M"])], ["12 Monate", pz(r["12M"])],
                      ["12M ohne den letzten", pz(v.return12M1M)]]],
        ["Relative Staerke", [["1 Monat", pz(rs["1M"])], ["3 Monate", pz(rs["3M"])],
                              ["6 Monate", pz(rs["6M"])], ["12 Monate", pz(rs["12M"])]]],
        ["Gleitende Durchschnitte", [
          ["SMA20", zu(v.priceAboveSMA20) + " " + pz(v.distanceToSMA20)],
          ["SMA50", zu(v.priceAboveSMA50) + " " + pz(v.distanceToSMA50)],
          ["SMA100", zu(v.priceAboveSMA100) + " " + pz(v.distanceToSMA100)],
          ["SMA200", zu(v.priceAboveSMA200) + " " + pz(v.distanceToSMA200)],
          ["ueber allen", v.aboveAllSMA === true ? '<span class="ja">ja</span>' : "nein"]]],
        ["52-Wochen-Fenster", [
          ["Abstand zum Hoch", pz(v.distanceTo52wHigh)],
          ["Abstand zum Tief", pz(v.distanceTo52wLow)],
          ["neues Hoch", v.newHigh52w === true ? '<span class="ja">ja</span>' : "nein"],
          ["innerhalb 5 %", v.within5PctOf52wHigh === true ? '<span class="ja">ja</span>' : "nein"]]],
        ["Risiko", [["Volatilitaet 20 T.", pz(v.volatility20d)],
                    ["Volatilitaet 60 T.", pz(v.volatility60d)],
                    ["Volatilitaet 252 T.", pz(v.volatility252d)],
                    ["max. Rueckgang 252 T.", pz(v.maxDrawdown252d)]]]
      ];
      faktorBlock = '<div class="faktoren"><b>Faktoren</b> <span class="quelle">' +
        (x.factorsSource === "DURABLE_ARTEFACT" ? "dauerhaftes Artefakt" : "Canary-Satz") +
        " · Stand " + (x.factors.asOf || "unbekannt") + " · gerechnet auf " +
        (x.factors.basis || "unbekannt") + '</span>' +
        gruppen.map(([titel, paare]) =>
          '<div class="fgruppe"><span class="fkopf">' + titel + '</span>' +
          paare.map(([b, w]) => '<div class="fzeile"><span>' + b + '</span><span>' + w +
            '</span></div>').join("") + '</div>').join("") +
        '<p class="hinweis">Zustaende und Abstaende, keine Kursniveaus: SMA-Werte und ' +
        '52-Wochen-Marken sind Anbieterkurse und bleiben zurueckgehalten ' +
        '(WITHHELD_REDISTRIBUTION).</p></div>';
    }

    const luecken = [];
    if (x.factorsStatus !== "PRESENT")
      luecken.push("Faktorzeile (Momentum, SMA-Abstand, 52-Wochen-Lage): " + x.factorsStatus +
                   " — die Zeilen entstanden im Lauf und liegen nicht in den ausgelieferten Artefakten.");
    if (x.nameStatus === "SOURCE_MISSING")
      luecken.push("Firmenname und Sektor: im Zugang nicht enthalten — ausgewiesen, nicht geraten.");
    luecken.push("Kursniveaus und Kursreihen: zurueckgehalten (Lizenzpruefung offen). " +
                 "Der Kurshistorien-Bestand von rund 7,4 GB ist nicht ausgeliefert.");
    k.hidden = false;
    k.innerHTML = '<button class="weg" id="titelZu">schliessen</button>' +
      '<h2>' + x.ticker + '</h2>' +
      '<p class="marke">' + (x.name ? x.name : 'Firmenname nicht im Zugang enthalten') + '</p>' +
      '<dl>' + paare.map(([b,w]) => '<dt>' + b + '</dt><dd>' + w + '</dd>').join("") + '</dl>' +
      faktorBlock +
      '<div class="luecke"><b>Nicht vorhanden</b><br>' + luecken.join("<br>") + '</div>';
    q("titelZu").addEventListener("click", () => {
      k.hidden = true;
      history.replaceState(null, "", location.pathname);
    });
    k.scrollIntoView({ block: "nearest" });
  }
  q("koerper").addEventListener("click", (e) => {
    const tr = e.target.closest("tr"); if (!tr) return;
    const t = tr.querySelector("strong").textContent;
    history.replaceState(null, "", location.pathname + "?ticker=" + encodeURIComponent(t));
    zeigeTitel(t);
  });

  ["suche","boerse","guete","bereinigung"].forEach(i => q(i).addEventListener("input", zeichne));
  document.querySelectorAll("th[data-s]").forEach(th => th.addEventListener("click", () => {
    const s = th.dataset.s; sortAuf = sortSpalte === s ? !sortAuf : true; sortSpalte = s; zeichne(); }));

  /* Zaehlfrage: eine Zeile mit Zahl. Rangfrage: aufklappbar mit den
     ersten 50, Wert und Qualitaetsmerkmal.

     Der Wert MUSS mit: an der Spitze der Momentumliste stehen Titel mit
     Werten, die kein Kursverlauf hergibt. Wer nur die Namen zeigt,
     verkauft eine Bereinigungsluecke als den staerksten Titel des
     Universums. */
  const zahl = (n) => n === null || n === undefined ? "—" : n.toLocaleString("de-DE");
  const prozent = (v) => (v * 100).toLocaleString("de-DE",
    { maximumFractionDigits: 1 }) + " %";
  q("fragenliste").innerHTML = d.screenerQuestions.map(f => {
    if (f.resultStatus !== "PRESENT")
      return '<div class="frage"><span>' + f.label + '</span><span class="fehlt" title="' +
             (f.resultStatusReason || "") + '">nicht ausgeliefert</span></div>';
    if (f.kind === "boolean")
      return '<div class="frage"><span>' + f.label + '</span><span>' + zahl(f.matched) +
             " Treffer" + (f.notEvaluable ? " · " + zahl(f.notEvaluable) +
             " nicht entscheidbar" : "") + '</span></div>';
    const liste = f.entries.map((e, i) =>
      '<div class="rangzeile"><span>' + (i + 1) + '. <strong>' + e.ticker + '</strong>' +
      ' <span class="' + (e.dataQuality || "") + '">' + (e.dataQuality || "") + '</span></span>' +
      '<span>' + prozent(e.value) + '</span></div>').join("");
    return '<details class="rangfrage"><summary><span>' + f.label + '</span><span>' +
      zahl(f.evaluated) + " von " + zahl(f.evaluatedOf) + " bewertet · erste " +
      f.entries.length + '</span></summary>' + liste +
      '<p class="hinweis">Sortiert ' + (f.direction === "asc" ? "aufsteigend" : "absteigend") +
      '. ' + zahl(f.notEvaluable) + ' Titel nicht entscheidbar — kein Wert, keine Null.</p>' +
      '</details>';
  }).join("");

  /* ZAHLEN GEHOEREN GELESEN, NICHT GETIPPT.

     Platzhalter und Screener-Ueberschrift trugen ihre Grundgesamtheit
     als festen Text. Der naechste FULL_UNIVERSE-Lauf loeste eine andere
     Zahl auf, und schon behauptete die Seite etwas, das ihr eigener
     Datensatz nicht hergab. Eine Oberflaeche, die ihre Grundgesamtheit
     tippt statt sie zu lesen, wird bei jedem Lauf ein Stueck unwahrer. */
  q("suche").placeholder = "Ticker suchen — alle " +
    d.rows.length.toLocaleString("de-DE") + " Titel";
  const auswertbar = d.screenerQuestions
    .map((f) => f.evaluatedOf).filter((n) => typeof n === "number");
  q("auswertbar").textContent = auswertbar.length
    ? Math.max(...auswertbar).toLocaleString("de-DE") : "—";

  /* Erster Aufbau. DIESER AUFRUF FEHLTE: die Seite zeigte Kopfzeile und
     Filter, aber eine leere Tabelle, bis jemand etwas tippte - genau die
     Sorte "erreichbar, aber nichts zu sehen", die schon einmal als
     bestanden durchging. */
  zeichne();

  /* Tiefer Link: /preview-universe/?ticker=ORCL oeffnet den Titel direkt. */
  const gewuenscht = new URLSearchParams(location.search).get("ticker");
  if (gewuenscht) {
    q("suche").value = gewuenscht.toUpperCase();
    zeichne();
    zeigeTitel(gewuenscht.toUpperCase());
  }

  q("fuss").innerHTML = "Stand " + (d.asOf || "unbekannt") + " · " + d.dataSnapshotId +
    "<br>Abgeleitetes Universum aus geprueften Artefakten. Keine Kursniveaus, keine Kursreihen. " +
    "Der Kurshistorien-Bestand von rund 7,4 GB ist NICHT ausgeliefert." +
    "<br>" + c.note;
})();
</script></body></html>`);

const mb = Math.round(JSON.stringify(datensatz).length / 1048576 * 10) / 10;
console.log("\nVision Universe — Vorschaudatensatz\n");
console.log(`  Gate:            ${GATE}`);
console.log(`  Titel:           ${zeilen.length}`);
console.log(`  mit Qualitaetszeile: ${mitQualitaet}  (ohne: ${zeilen.length - mitQualitaet}, sauber durchgelaufen)`);
console.log(`  mit Technical:   ${mitTechnical}`);
console.log(`  mit Faktoren:    ${mitFaktoren}  ` + (faktorArtefakt
  ? `(aus dem dauerhaften Artefakt, ${(faktorArtefakt.securities || []).length} Zeilen)`
  : "(nur Canary - ohne das dauerhafte Artefakt fehlt der Rest)"));
console.log(`  Screenerfragen:  ${datensatz.screenerQuestions.length}`);
console.log(`  Groesse:         ${mb} MB`);
console.log(`\n  ABGELEITETES UNIVERSUM: vorhanden`);
console.log(`  KURSHISTORIEN-BESTAND (~7,4 GB): NICHT ausgeliefert`);
console.log(`\n  ${datei.replace(root + "/", "")}`);
console.log(`  preview-universe/index.html\n`);
