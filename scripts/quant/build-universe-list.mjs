#!/usr/bin/env node
/* =========================================================================
   DIE LISTE ALLER UNTERNEHMEN SOLL SAGEN, WER DAS IST UND WAS ES KOSTET.

   Gemessen am 26.09.2026 an der gebauten Oberflaeche - die Liste unter
   /vu2/?view=stocks zeigte Zeile fuer Zeile:

       A     | A    | Nicht verfuegbar | 0,5
       AA    | AA   | Nicht verfuegbar | -0,3
       AAAC  | AAAC | Nicht verfuegbar | 0,0

   Also: KEIN Kurs (5 von 6.875 Zeilen trugen einen, das sind 0,07 Prozent)
   und KEIN Name (0 von 6.875 - das Feld traegt den Ticker, und die Zeile
   schreibt ihn deshalb zweimal). Auf der Einstiegsseite stehen Name und Kurs
   fuer fuenf handverlesene Titel; fuer die anderen 6.870 war die Uebersicht
   eine Liste von Kuerzeln.

   Beides ist VEROEFFENTLICHT und lag nur nicht in einer Form, die eine Liste
   lesen kann:

     Kurse  6.482 Titel haben eine vertragsgepruefte Tagesreihe
            (6.429 mit Stand 2026-09-25) - dieselbe, die der Chart auf der
            Aktienseite zeichnet. Fuer die fuenf Paneltitel stimmt ihr
            letzter Punkt auf den Cent mit dem Panelkurs ueberein
            (AAPL 341,07 / MSFT 516,17 / NVDA 225,07 / JPM 343,06 /
            XOM 160,59), was die Quelle gleich mitbestaetigt.
     Namen  5.775 Titel stehen mit Namen im Company-Master-Suchindex -
            aber in 646 Shards, und eine Liste kann nicht 646 Dateien laden.

   Diese Datei macht daraus EIN kleines Artefakt (43 KB gzip fuer die Kurse,
   mit Namen etwa das Doppelte). Kein Anbieterzugriff, keine neue Quelle,
   keine Rechnung: sie liest, was schon veroeffentlicht ist, und schreibt es
   in eine Form, die eine Uebersicht in einem Zug lesen kann.

   WAS SIE NICHT TUT

   Sie erfindet keinen Kurs. Ein Titel ohne vertragsgepruefte Reihe bekommt
   keinen Eintrag, und die Oberflaeche sagt dann weiter, dass keiner
   veroeffentlicht ist. Sie datiert auch nichts um: jeder Kurs traegt das
   Datum SEINES letzten Punktes, auch wenn der aelter ist als heute (BCAR
   steht auf dem 27.08.), damit eine Liste keinen Handelstag behauptet, den
   es fuer diesen Titel nicht gab.

   Ausfuehren:
     node scripts/quant/build-universe-list.mjs [--out <pfad>]
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PublishedClose = createRequire(import.meta.url)(join(ROOT, "quant/engines/published-close.js"));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/product/universe-list-v1.json.gz"));
/* 1.1.0: zwei Felder mehr, an denselben Schluesseln - `v` traegt den Grund,
   aus dem der Boersenwert dieses Titels zurueckgehalten wird, `il` die Zahl
   der notierten Zeilen seines Emittenten. Ohne sie konnte die Aktienseite
   nicht wissen, was die Faktorschicht entschieden hat, und nannte drei Zeilen
   tiefer ein Kurs-Gewinn-Verhaeltnis, das genau auf der zurueckgehaltenen
   Zuordnung beruht (gemessen: 266 von 465 Titeln). Ein Leser dieser Datei,
   der 1.0.0 erwartet, verliert dadurch nichts: beide Felder sind optional. */
const SCHEMA_VERSION = "universe-list-1.1.0";
const HEUTE = new Date().toISOString().slice(0, 10);

const json = async (p) => JSON.parse(await readFile(p, "utf8"));

/* Dieselben Pruefungen, die der Kursverlauf auf der Aktienseite besteht.
   Eine Reihe, die dort nicht gezeichnet werden darf, liefert hier auch
   keinen Kurs - sonst zeigte die Liste eine Zahl, die die Detailseite
   verweigert. */
/* Die Pruefung stand hier und wird jetzt geteilt: seit dem 26.09.2026 liest
   der Faktorlauf denselben Kurs, um einen Boersenwert zu bilden, wo kein
   Technical-Buendel existiert. Zwei Kopien derselben Vertragspruefung waeren
   zwei Vertraege, sobald einer von ihnen ergaenzt wird. */
const letzterPunkt = (series) => PublishedClose.lastPoint(series, HEUTE);

async function namenAusCompanyMaster() {
  /* Der Suchindex ist die kanonische Namensquelle des Hauses - 646 Shards
     nach Symbolpraefix. Hier werden sie einmal gelesen und zu einer Tabelle
     verdichtet; die Oberflaeche liest danach keinen Shard mehr. */
  const dir = join(ROOT, "quant/data/universe/search/sym");
  if (!existsSync(dir)) return { namen: new Map(), typen: new Map(), shards: 0 };
  const namen = new Map(), typen = new Map();
  const dateien = (await readdir(dir)).filter((n) => n.endsWith(".json"));
  for (const datei of dateien) {
    const shard = await json(join(dir, datei));
    for (const eintrag of shard.entries || []) {
      if (!eintrag || !eintrag.s) continue;
      if (eintrag.n && eintrag.n !== eintrag.s) namen.set(eintrag.s, eintrag.n);
      if (eintrag.t) typen.set(eintrag.s, eintrag.t);
    }
  }
  return { namen, typen, shards: dateien.length };
}

async function main() {
  const capability = await json(join(ROOT, "quant/data/universe/market-capability.json"));
  const members = capability.members || [];
  if (!members.length) throw new Error("EMPTY_CAPABILITY");
  const { namen, typen, shards } = await namenAusCompanyMaster();

  /* WIE VIELE HANDELSTAGE DIE FAKTOREN WIRKLICH GESEHEN HABEN.
   *
   * Die Seite soll einem zu jungen Titel sagen "fuer diese Auswertung werden
   * 252 Handelstage gebraucht, aktuell liegen 187 vor" - und diese Zahl gibt
   * es nur an einer Stelle: im Faktor-Artefakt, das sie selbst gezaehlt hat.
   * Die Bar-Zahl der Kapazitaetsdatei ist eine ANDERE Groesse: gemessen weicht
   * sie in allen 6.441 Faellen ab (bei AA 936 gegen 0), weil sie den Bestand
   * im Speicher zaehlt und nicht die Reihe, auf der gerechnet wurde. Sie hier
   * zu nehmen waere eine falsche Zahl in einem richtigen Satz. */
  const faktorBars = new Map();
  /* UND DIE ENTSCHEIDUNG UEBER DIE BEWERTUNG.
   *
   * Dieselbe Datei, dieselbe Schleife: der Faktorlauf hat schon entschieden,
   * ob sich der Boersenwert dieser Notierung ueberhaupt zuordnen laesst. Ohne
   * diese Angabe im Verzeichnis muesste die Aktienseite den Faktor-Shard
   * zusaetzlich laden, nur um zu erfahren, dass sie eine Zahl NICHT zeigen
   * darf - und bis M40 hat sie es deshalb gar nicht erfahren. */
  const bewertungGrund = new Map(), notierungen = new Map();
  const faktorDir = join(ROOT, "quant/data/product/factor-evidence-v1");
  if (existsSync(faktorDir)) {
    for (const datei of (await readdir(faktorDir))) {
      if (!datei.endsWith(".json.gz") || datei === "screening.json.gz" || datei === "summary.json.gz") continue;
      const shard = JSON.parse(gunzipSync(await readFile(join(faktorDir, datei))).toString("utf8"));
      for (const [ticker, row] of Object.entries(shard.securities || {})) {
        if (Number.isFinite(row.bars)) faktorBars.set(ticker, row.bars);
        if (typeof row.marketCapReason === "string" && row.marketCapReason) bewertungGrund.set(ticker, row.marketCapReason);
        if (Array.isArray(row.issuerListings) && row.issuerListings.length > 1) notierungen.set(ticker, row.issuerListings.length);
      }
    }
  }

  const entries = [];
  const staende = {};
  let mitKurs = 0, mitName = 0, ohneReihe = 0, reiheVerworfen = 0, mitBars = 0, mitBewertungsgrund = 0;
  for (const member of members) {
    const name = namen.get(member.s) || null;
    let preis = null;
    const pfad = join(ROOT, "quant/data/market/discover-series", member.m + ".json");
    if (!existsSync(pfad)) ohneReihe += 1;
    else {
      const punkt = letzterPunkt(await json(pfad).catch(() => null));
      if (punkt) preis = punkt; else reiheVerworfen += 1;
    }
    if (name) mitName += 1;
    if (preis) { mitKurs += 1; staende[preis.date] = (staende[preis.date] || 0) + 1; }
    /* Kurze Schluessel, weil die Datei 6.875 mal dasselbe Muster traegt.
       Ein Eintrag ohne Kurs bleibt drin, wenn er einen Namen hat - die
       Liste soll wenigstens sagen koennen, WER das ist. */
    if (!name && !preis) continue;
    const bars = faktorBars.has(member.s) ? faktorBars.get(member.s) : null;
    if (bars !== null) mitBars += 1;
    entries.push({
      s: member.s,
      ...(name ? { n: name } : {}),
      ...(typen.get(member.s) ? { t: typen.get(member.s) } : {}),
      ...(preis ? { c: preis.close, d: preis.date, u: preis.currency } : {}),
      ...(bars !== null ? { b: bars } : {}),
      ...(bewertungGrund.has(member.s) ? { v: bewertungGrund.get(member.s) } : {}),
      ...(notierungen.has(member.s) ? { il: notierungen.get(member.s) } : {})
    });
    if (bewertungGrund.has(member.s)) mitBewertungsgrund += 1;
  }

  const report = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    source: {
      universe: "quant/data/universe/market-capability.json",
      prices: "quant/data/market/discover-series (discover-series-1.1.0, split-adjusted daily)",
      names: "quant/data/universe/search/sym (company-master-1.0.0, " + shards + " shards)",
      factorBars: "quant/data/product/factor-evidence-v1 (die Zahl der Handelstage, auf denen der Faktorlauf gerechnet hat)",
      valuationReason: "quant/data/product/factor-evidence-v1 (marketCapReason und die Zahl der notierten Zeilen des Emittenten)"
    },
    /* Die Deckung steht IM Artefakt, damit ein Leser sie nicht selbst
       ausrechnen muss und ein Test sie halten kann. */
    coverage: {
      universe: members.length, entries: entries.length,
      withName: mitName, withPrice: mitKurs, withFactorBars: mitBars,
      withValuationReason: mitBewertungsgrund,
      withoutSeries: ohneReihe, seriesRejected: reiheVerworfen,
      priceDates: Object.fromEntries(Object.entries(staende).sort((a, b) => b[1] - a[1]).slice(0, 8))
    },
    note: "Namen und letzte Schlusskurse aus bereits veroeffentlichten Quellen, zusammengefasst fuer " +
          "Listenansichten. Keine Rechnung, kein Anbieterzugriff. Jeder Kurs traegt das Datum seines " +
          "letzten Punktes; fehlt eine vertragsgepruefte Reihe, fehlt der Kurs.",
    entries
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, gzipSync(JSON.stringify(report)));

  const kb = (n) => (n / 1024).toFixed(0) + " KB";
  process.stdout.write("Universums-Liste · " + entries.length + " Eintraege fuer " + members.length + " Titel\n");
  process.stdout.write("  mit Namen  " + String(mitName).padStart(5) + "\n");
  process.stdout.write("  mit Handelstagen " + String(mitBars).padStart(5) + "\n");
  process.stdout.write("  mit Kurs   " + String(mitKurs).padStart(5) +
    "   (ohne Reihe " + ohneReihe + ", Reihe verworfen " + reiheVerworfen + ")\n");
  process.stdout.write("  Staende: " + Object.entries(report.coverage.priceDates)
    .map(([d, n]) => d + " " + n).join(" · ") + "\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + " · " +
    kb(gzipSync(JSON.stringify(report)).length) + " gzip\n");
}

main();
