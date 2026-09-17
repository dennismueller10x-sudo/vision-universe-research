#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — zero-cost-realtime-model.mjs   (Owner-Auftrag 2026-09-17)

   Passt echter Realtime-Betrieb in die kostenlosen Kontingente?

   DIE RECHNUNG, DIE ALLES ENTSCHEIDET

   Cloudflare verbucht eingehende WebSocket-Nachrichten im Verhaeltnis
   20:1 als Anfragen. Der kostenlose Tarif gibt 100.000 Anfragen am Tag.
   Daraus folgt eine einzige harte Zahl:

     100.000 Anfragen x 20 Nachrichten = 2.000.000 Nachrichten am Tag
     2.000.000 / 23.400 Sekunden Sitzung = 85 Nachrichten je Sekunde

   Achtundfuenfzig Mal weniger als der volle Firehose. Die Frage ist
   also nicht, ob Cloudflare Realtime kann - sondern ob wir unter 85
   Ereignissen je Sekunde bleiben. Und genau dafuer gibt es die
   Tickerliste, die auf Stufe 6 gemessen funktioniert.

   WOHER DIE ZAHLEN KOMMEN

   Ereignisraten je Titel: firehose-capability.json, Messung 16.09.2026.
   Freigrenzen und Verbuchung: Cloudflare-Dokumentation, Quelltext
   abgerufen am 17.09.2026. Beides steht im Bericht mit Quelle.

   Diese Datei rechnet. Sie baut nichts und ruft nichts auf.
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(root, "quant", "data", "market", "commercial");

/* ---------------------------------------------------- Freigrenzen (Doku) */
const FREI = {
  quelle: "cloudflare-docs @ raw.githubusercontent.com/cloudflare/cloudflare-docs/" +
          "production, abgerufen 2026-09-17",
  dateien: [
    "src/content/partials/durable-objects/durable-objects-pricing.mdx",
    "src/content/docs/durable-objects/platform/pricing.mdx",
    "src/content/docs/durable-objects/platform/limits.mdx",
    "src/content/docs/workers/platform/limits.mdx"
  ],
  durableObjects: {
    anfragenProTag: 100000,
    dauerGBsProTag: 13000,
    speicherProObjektMB: 128,
    nurSQLiteBackend: true,
    zeilenSchreibenProTag: 100000,
    hinweis: "Wird eine der Freigrenzen ueberschritten, schlagen weitere Operationen " +
             "dieser Art fehl. Die Tageswerte setzen sich um 00:00 UTC zurueck."
  },
  workers: {
    anfragenProTag: 100000,
    cpuMsProAnfrage: 10,
    speicherMB: 128,
    gleichzeitigeAusgehendeVerbindungenProAnfrage: 6
  },
  websocket: {
    verhaeltnisEingehend: 20,
    ausgehendKostenlos: true,
    verbindungsaufbau: "1 Anfrage je neuer WebSocket-Verbindung",
    pingsKostenlos: true
  },
  bezahlt: { basisUsd: 5, anfragenUsdJeMillion: 0.15, dauerUsdJeMillionGBs: 12.5,
             anfragenInklusive: 1000000, dauerInklusiveGBs: 400000 }
};

const SITZUNG_S = 6.5 * 3600;          /* 23.400 s regulaere Sitzung */
const HANDELSTAGE = 21;

/* ------------------------------------------- Gemessene Raten je Titel */
function ladeRaten() {
  const r = JSON.parse(readFileSync(join(OUT_DIR, "firehose-capability.json"), "utf8"));
  const m = (r.measurements || []).find((x) => x.scope === "firehoseMain");
  const dauer = m.durationSeconds;
  const raten = Object.entries(m.events.bySymbol)
    .filter(([s]) => s && s !== "?")
    .map(([s, n]) => [s, n / dauer])
    .sort((a, b) => b[1] - a[1]);
  return { raten, dauer, gesamtProSekunde: m.events.perSecond, titel: raten.length,
           bytesProSekunde: m.connection.payloadBytesPerSecond };
}

/* Summe der n aktivsten Titel - der ungünstigste Fall, weil Nutzer
   bevorzugt die bekannten und damit lebhaftesten Titel ansehen. */
function summeAktivste(raten, n) {
  return raten.slice(0, n).reduce((a, x) => a + x[1], 0);
}

/* ------------------------------------------------------------ Bewertung */
function bewerte(name, opts) {
  const {
    ereignisseProSekunde, aktiveSekundenProTag, objekte, beschreibung,
    aktualitaetSekunden, komplexitaet, maxTitel, maxNutzer, grenze
  } = opts;

  const nachrichtenProTag = ereignisseProSekunde * aktiveSekundenProTag;
  const anfragenProviderProTag = Math.ceil(nachrichtenProTag / FREI.websocket.verhaeltnisEingehend);
  /* Reserve fuer Clientverbindungen, Abonnementwechsel und Wecker. */
  const anfragenOverheadProTag = opts.anfragenOverheadProTag === undefined ? 10000
                                                                          : opts.anfragenOverheadProTag;
  const anfragenProTag = anfragenProviderProTag + anfragenOverheadProTag;
  const dauerGBsProTag = objekte * (FREI.durableObjects.speicherProObjektMB / 1000) * aktiveSekundenProTag;

  const anteilAnfragen = anfragenProTag / FREI.durableObjects.anfragenProTag;
  const anteilDauer = dauerGBsProTag / FREI.durableObjects.dauerGBsProTag;
  const imFreibetrag = anteilAnfragen <= 1 && anteilDauer <= 1;

  /* Kosten, falls der Freibetrag gerissen wird: dann Workers Paid. */
  let kostenUsd = 0;
  if (!imFreibetrag) {
    const anfragenMonat = anfragenProTag * HANDELSTAGE;
    const ueber = Math.max(0, anfragenMonat - FREI.bezahlt.anfragenInklusive);
    const anfragenUsd = ueber / 1e6 * FREI.bezahlt.anfragenUsdJeMillion;
    const gbsMonat = dauerGBsProTag * HANDELSTAGE;
    const gbsUeber = Math.max(0, gbsMonat - FREI.bezahlt.dauerInklusiveGBs);
    const gbsAufgerundet = gbsUeber > 0 ? Math.ceil(gbsUeber / 1e6) * 1e6 : 0;
    const dauerUsd = gbsAufgerundet / 1e6 * FREI.bezahlt.dauerUsdJeMillionGBs;
    kostenUsd = Math.round((FREI.bezahlt.basisUsd + anfragenUsd + dauerUsd) * 100) / 100;
  }

  return {
    variante: name, beschreibung,
    ereignisseProSekunde: Math.round(ereignisseProSekunde * 10) / 10,
    aktiveSekundenProTag,
    objekte,
    nachrichtenProTag: Math.round(nachrichtenProTag),
    anfragenProTag,
    anfragenFreiAnteil: Math.round(anteilAnfragen * 1000) / 10,
    dauerGBsProTag: Math.round(dauerGBsProTag),
    dauerFreiAnteil: Math.round(anteilDauer * 1000) / 10,
    imFreibetrag,
    zusatzkostenUsdProMonat: kostenUsd,
    aktualitaetSekunden, maxGleichzeitigeTitel: maxTitel, maxNutzer,
    skalierungsgrenze: grenze, komplexitaet
  };
}

function main() {
  const { raten, dauer, gesamtProSekunde, titel, bytesProSekunde } = ladeRaten();
  const median = raten[Math.floor(raten.length / 2)][1];

  /* Wie viele aktive Titel passen in die Freigrenze? Gesucht ist das
     groesste n, bei dem die Summe der n aktivsten Titel unter der
     tragbaren Rate bleibt. */
  const anfragenFuerProvider = FREI.durableObjects.anfragenProTag - 10000;
  const tragbareNachrichtenProTag = anfragenFuerProvider * FREI.websocket.verhaeltnisEingehend;
  const tragbareRate = tragbareNachrichtenProTag / SITZUNG_S;
  let maxAktiveTitel = 0;
  for (let n = 1; n <= raten.length; n++) {
    if (summeAktivste(raten, n) > tragbareRate) break;
    maxAktiveTitel = n;
  }
  const maxMedianTitel = Math.floor(tragbareRate / median);

  const varianten = [
    bewerte("A — Full Firehose dauerhaft", {
      beschreibung: "Ein Objekt haelt das ganze Band, die ganze Sitzung, unabhaengig von Nutzern.",
      ereignisseProSekunde: gesamtProSekunde, aktiveSekundenProTag: SITZUNG_S,
      objekte: 1, aktualitaetSekunden: 1, komplexitaet: "mittel",
      maxTitel: titel, maxNutzer: "praktisch unbegrenzt",
      grenze: "Anfragenkontingent, 12-fach ueberschritten"
    }),
    bewerte("B — Full Firehose nur bei aktiven Nutzern", {
      beschreibung: "Band nur offen, solange jemand da ist. Volle Rate, aber kuerzere Zeit.",
      ereignisseProSekunde: gesamtProSekunde, aktiveSekundenProTag: 3600,
      objekte: 1, aktualitaetSekunden: 1, komplexitaet: "mittel",
      maxTitel: titel, maxNutzer: "praktisch unbegrenzt",
      grenze: "rund 33 Minuten Nutzungszeit am Tag, dann ist das Kontingent leer"
    }),
    bewerte("C — Stream nur fuer betrachtete Titel", {
      beschreibung: "Tickerliste auf Stufe 6, nur was gerade jemand ansieht. Gemessen moeglich.",
      ereignisseProSekunde: summeAktivste(raten, 25), aktiveSekundenProTag: SITZUNG_S,
      objekte: 1, aktualitaetSekunden: 1, komplexitaet: "mittel",
      maxTitel: maxAktiveTitel, maxNutzer: "unabhaengig von der Nutzerzahl",
      grenze: `${maxAktiveTitel} gleichzeitig gestreamte aktive Titel, oder rund ` +
              `${maxMedianTitel} durchschnittliche`
    }),
    bewerte("D — vorhandener REST-/Snapshot-Pfad", {
      beschreibung: "Was heute laeuft: Workflow alle 5 Minuten, GitHub Pages, Live-Hub pollt.",
      ereignisseProSekunde: 0, aktiveSekundenProTag: 0, objekte: 0,
      anfragenOverheadProTag: 0,
      aktualitaetSekunden: 8 * 60, komplexitaet: "vorhanden, null Zusatzaufwand",
      maxTitel: 524, maxNutzer: "unbegrenzt (statische Auslieferung)",
      grenze: "GitHub-Cron, kleinster Takt 5 Minuten"
    })
  ];

  /* Variante C, feiner aufgeloest: wie viele aktive Titel kosten was? */
  const cKurve = [1, 5, 10, 25, 50, 75, 100, 200].map((n) => {
    const rate = summeAktivste(raten, n);
    const nachrichten = rate * SITZUNG_S;
    const anfragen = Math.ceil(nachrichten / FREI.websocket.verhaeltnisEingehend) + 10000;
    return { aktiveTitel: n, ereignisseProSekunde: Math.round(rate * 10) / 10,
             nachrichtenProTag: Math.round(nachrichten),
             anfragenProTag: anfragen,
             anteilFreibetragProzent: Math.round(anfragen / FREI.durableObjects.anfragenProTag * 1000) / 10,
             imFreibetrag: anfragen <= FREI.durableObjects.anfragenProTag };
  });

  const bericht = {
    generatedAt: new Date().toISOString(),
    scope: "zeroCostRealtimeModel",
    note: "Rechnung gegen die dokumentierten Freigrenzen mit den gemessenen Ereignisraten. " +
          "Keine Messung an einem Cloudflare-Konto - die Abrechnung selbst ist dokumentiert, " +
          "nicht nachgemessen.",
    messung: {
      quelle: "firehose-capability.json (2026-09-16)",
      fensterSekunden: dauer, titelImFenster: titel,
      gesamtrateProSekunde: gesamtProSekunde, bytesProSekunde,
      hoechsteTitelrate: Math.round(raten[0][1] * 1000) / 1000,
      medianTitelrate: Math.round(median * 1000) / 1000,
      summeAktivste: { 1: summeAktivste(raten, 1), 5: summeAktivste(raten, 5),
                       10: summeAktivste(raten, 10), 25: summeAktivste(raten, 25),
                       50: summeAktivste(raten, 50), 100: summeAktivste(raten, 100) },
      tickerlisteAufStufe6: "gemessen: Anmeldung mit [\"NVDA\"] lieferte 141 Ereignisse, " +
        "ausschliesslich NVDA; [\"AAPL\",\"MSFT\"] lieferte 131 Ereignisse, ausschliesslich " +
        "diese beiden. Die Auswahl geschieht beim Anbieter, nicht bei uns."
    },
    freigrenzen: FREI,
    ableitung: {
      tragbareNachrichtenProTag,
      tragbareRateProSekunde: Math.round(tragbareRate * 10) / 10,
      maxAktiveTitelImFreibetrag: maxAktiveTitel,
      maxDurchschnittlicheTitelImFreibetrag: maxMedianTitel,
      reserveAnfragenFuerClients: 10000
    },
    varianten,
    varianteCKurve: cKurve,
    offen: [
      "Ob Tiingo auf einer offenen Verbindung nachtraeglich abonnieren und abbestellen " +
      "laesst, ist NICHT gemessen. Die aufgezeichnete Bestaetigung war ein Heartbeat ohne " +
      "subscriptionId. Faellt die Antwort negativ aus, kostet ein Titelwechsel einen " +
      "Neuaufbau der Verbindung - eine Anfrage, kein Kostenproblem, aber eine Sekunde Latenz.",
      "Die Abrechnung eingehender Nachrichten eines AUSGEHENDEN Sockets ist dokumentiert " +
      "nur fuer eingehende Nachrichten allgemein. Die Rechnung nimmt die teurere Auslegung."
    ]
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, "zero-cost-realtime-model.json");
  writeFileSync(file, JSON.stringify(bericht, null, 2) + "\n");

  console.log("Vision Universe — Zero-Cost-Realtime, Rechnung gegen die Freigrenzen\n");
  console.log(`  Freigrenze Durable Objects: ${FREI.durableObjects.anfragenProTag.toLocaleString("de-DE")} Anfragen/Tag, ` +
              `${FREI.durableObjects.dauerGBsProTag.toLocaleString("de-DE")} GB-s/Tag`);
  console.log(`  20:1 auf eingehende Nachrichten  ->  ${tragbareNachrichtenProTag.toLocaleString("de-DE")} Nachrichten/Tag ` +
              `= ${Math.round(tragbareRate)} Ereignisse/s ueber eine Sitzung\n`);
  console.log("  Variante                                 Ereignisse/s  Anfragen/Tag  Frei?   Zusatzkosten");
  for (const v of varianten) {
    console.log("  " + v.variante.padEnd(40) +
                String(v.ereignisseProSekunde).padStart(12) +
                String(v.anfragenProTag.toLocaleString("de-DE")).padStart(14) +
                (v.imFreibetrag ? "   ja  " : "  NEIN ").padStart(8) +
                (v.zusatzkostenUsdProMonat ? `  ${v.zusatzkostenUsdProMonat} USD/Monat` : "   0 EUR"));
  }
  console.log("\n  Variante C im Detail - wie viele betrachtete Titel passen in den Freibetrag:");
  for (const k of cKurve) {
    console.log(`    ${String(k.aktiveTitel).padStart(3)} aktive Titel  ${String(k.ereignisseProSekunde).padStart(6)} Ereignisse/s  ` +
                `${String(k.anfragenProTag.toLocaleString("de-DE")).padStart(8)} Anfragen/Tag  ` +
                `${String(k.anteilFreibetragProzent).padStart(5)} %  ${k.imFreibetrag ? "frei" : "ueber der Grenze"}`);
  }
  console.log(`\n  Grenze: ${maxAktiveTitel} der aktivsten Titel gleichzeitig, oder rund ${maxMedianTitel} durchschnittliche.`);
  console.log(`\n  Bericht: ${file.replace(root + "/", "")}`);
}

main();
