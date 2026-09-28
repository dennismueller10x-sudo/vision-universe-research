#!/usr/bin/env node
/* =========================================================================
   DAS DOSSIER ZUR ZUORDNUNGSLUECKE — ALLES, WAS OHNE ZUGANG VORBEREITET
   WERDEN KANN.

   183 Emittenten tragen zusammen 43.953 rohe SEC-Tatsachen und `mapped = 0`:
   die Quelle hat geliefert, die Kennzahl-Registry hat keine einzige Tatsache
   zugeordnet. Welche Konzepte diese Emittenten verwenden, steht in den rohen
   Tatsachen - und die liegen nicht im Repository. `data.sec.gov` antwortet mit
   CONNECT 403.

   Dieses Dossier legt alles bereit, was von hier aus geht: die betroffenen
   Emittenten mit Aktennummer-faehiger CIK, die heutige Reichweite der
   Registry je Kennzahl, die Zweigipfeligkeit als Befund, und die genaue
   Angabe, welcher Abruf fehlt. Was es NICHT tut: eine Zuordnungsregel
   veroeffentlichen. Ohne Rohbeleg waere das geraten, und eine geratene
   Zuordnung aendert still, was eine veroeffentlichte Kennzahl bedeutet.

   Ausfuehren:
     node scripts/quant/build-sec-mapping-dossier.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/providers/sec-mapping-dossier-v1.json"));
const CONSUMER = join(ROOT, "quant/data/sec/consumer");

async function main() {
  const registry = JSON.parse(await readFile(join(ROOT, "quant/config/sec-metric-registry.json"), "utf8"));

  /* Wie weit die Registry heute reicht: je Kennzahl die gemappten Konzepte.
     Das ist die Liste, gegen die ein neuer Beleg geprueft werden muesste. */
  const registryDeckung = {};
  for (const [metric, def] of Object.entries(registry.metrics || {})) {
    registryDeckung[metric] = {
      kind: def.kind || null, statement: def.statement || null,
      concepts: (def.concepts || []).map((c) => (c.taxonomy ? c.taxonomy + ":" : "") + c.concept + " (Prio " + c.priority + ")")
    };
  }

  /* Die betroffenen Emittenten - gelesen aus den Exporten selbst, damit die
     Liste nicht aus einer Zwischenmessung stammt. */
  const betroffen = [];
  let dokumente = 0, mappedVerteilung = {};
  for (const datei of (await readdir(CONSUMER))) {
    if (!datei.endsWith(".json")) continue;
    const d = JSON.parse(await readFile(join(CONSUMER, datei), "utf8"));
    dokumente += 1;
    const cov = d.coverage || {};
    const mapped = cov.mapped || 0, roh = cov.rawFacts || 0;
    const eimer = mapped === 0 ? "0" : mapped < 5 ? "1-4" : mapped < 10 ? "5-9" : mapped < 20 ? "10-19" : "20+";
    mappedVerteilung[eimer] = (mappedVerteilung[eimer] || 0) + 1;
    if (mapped === 0 && roh > 0) {
      betroffen.push({ cik: d.cik, name: d.name || null, tickers: d.tickers || [],
        rawFacts: roh, mapped: mapped, asOf: d.asOf || null });
    }
  }
  betroffen.sort((a, b) => b.rawFacts - a.rawFacts);
  const rohSumme = betroffen.reduce((s, e) => s + e.rawFacts, 0);

  const bericht = {
    schemaVersion: "sec-mapping-dossier-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    question: "Was kann ohne Zugang zu data.sec.gov fuer die Zuordnungsluecke vorbereitet werden?",
    state: "BLOCKED_EXTERNAL_NETWORK",
    issuersAffected: betroffen.length,
    rawFactsUnused: rohSumme,
    consumerDocuments: dokumente,
    /* Die Zweigipfeligkeit ist der eigentliche Befund: es sind nicht "ein paar
       fehlende Tags", sondern ein struktureller Ausfall. */
    mappedDistribution: mappedVerteilung,
    bimodality: "Die Verteilung hat zwei Gipfel und fast nichts dazwischen. Das spricht gegen " +
      "einzelne fehlende Tags und fuer einen strukturellen Grund - etwa firmeneigene Konzepte " +
      "oder Tatsachen ohne Periodenrahmen bei Erstmeldern.",
    registryCoverageToday: registryDeckung,
    issuers: betroffen,
    whatIsMissing: {
      artifact: "companyfacts je betroffener CIK",
      host: "data.sec.gov",
      endpoint: "/api/xbrl/companyfacts/CIK##########.json",
      observed: "CONNECT 403 durch die Netzwerkpolitik der Umgebung (zuletzt 2026-09-26)",
      whyItIsNeeded: "Nur die rohen Tatsachen nennen die Konzepte, die diese Emittenten wirklich " +
        "verwenden. Die Exporte fuehren die Zahl der Tatsachen, nicht ihre Namen.",
      alternativeConsidered: "Der lokale kanonische Bestand fuehrt nur fuenf Titel, der Inspektor " +
        "ebenso; die 120 MB unter consumer/ SIND die SEC-Schicht dieses Hauses. Es gibt keinen " +
        "zweiten lokalen Ort, an dem die Konzepte stehen."
    },
    procedureWhenAccessExists: [
      "Fuer jede CIK dieser Liste companyfacts abrufen und die vorkommenden Konzepte je Taxonomie zaehlen.",
      "Die Haeufigkeit gegen registryCoverageToday stellen: welche Konzepte tragen Deckung und fehlen in der Registry?",
      "Nur Konzepte aufnehmen, die dieselbe Groesse messen wie die Zielkennzahl. Keine Aufnahme, " +
        "die eine veroeffentlichte Kennzahl umdeutet - das waere eine Methodikaenderung mit eigener Fassung.",
      "SPAC-, Trust- und Schuldtitel getrennt halten: ein Emittent ohne operatives Geschaeft " +
        "braucht keine Zuordnung, sondern eine Kennzeichnung.",
      "Das Ergebnis als Konzeptzensus veroeffentlichen - wie es fuer die Verschuldung schon " +
        "geschehen ist (quant/data/sec/concept-census.json) - und erst danach entscheiden."
    ],
    doNotDo: "Keine Zuordnungsregel ohne Rohbeleg. Keine Coverage, die aus einer plausiblen " +
      "Vermutung entsteht. Keine Verwechslung von Huelle, Treuhand, Schuldtitel und operativem Geschaeft."
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(bericht, null, 1) + "\n");

  process.stdout.write("\nDOSSIER ZUR ZUORDNUNGSLUECKE · " + betroffen.length + " Emittenten · " +
    rohSumme.toLocaleString("de-DE") + " ungenutzte Tatsachen\n");
  process.stdout.write("  Zustand: " + bericht.state + " (" + bericht.whatIsMissing.observed + ")\n");
  process.stdout.write("  Verteilung zugeordneter Kennzahlen: " + JSON.stringify(mappedVerteilung) + "\n\n");
  process.stdout.write("  Die zehn groessten ungenutzten Bestaende:\n");
  for (const e of betroffen.slice(0, 10)) {
    process.stdout.write("    " + String(e.rawFacts).padStart(5) + "  " + e.cik + "  " +
      (e.tickers.join(",") || "-").padEnd(12) + (e.name || "").slice(0, 40) + "\n");
  }
  process.stdout.write("\n  Registry heute: " + Object.keys(registryDeckung).length + " Kennzahlen, " +
    Object.values(registryDeckung).reduce((s, d) => s + d.concepts.length, 0) + " gemappte Konzepte\n");
  process.stdout.write("\n  " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
