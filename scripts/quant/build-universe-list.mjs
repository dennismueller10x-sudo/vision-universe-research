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
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const OUT = arg("out", join(ROOT, "quant/data/product/universe-list-v1.json.gz"));
const SCHEMA_VERSION = "universe-list-1.0.0";
const HEUTE = new Date().toISOString().slice(0, 10);

const json = async (p) => JSON.parse(await readFile(p, "utf8"));

/* Dieselben Pruefungen, die der Kursverlauf auf der Aktienseite besteht.
   Eine Reihe, die dort nicht gezeichnet werden darf, liefert hier auch
   keinen Kurs - sonst zeigte die Liste eine Zahl, die die Detailseite
   verweigert. */
function letzterPunkt(series) {
  if (!series || series.schemaVersion !== "discover-series-1.1.0") return null;
  if (series.dataMode !== "real" || series.source !== "tiingo" || series.provider !== "tiingo") return null;
  if (series.status !== "CALCULATED" || series.priceSeriesType !== "SPLIT_ADJUSTED") return null;
  if (series.grain !== "daily" || !series.publishBasis || !series.currency) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(series.asOf || "") || series.asOf > HEUTE) return null;
  if (!Array.isArray(series.points) || !series.points.length) return null;
  const last = series.points[series.points.length - 1];
  const datum = Array.isArray(last) ? last[0] : last && last.date;
  const kurs = Array.isArray(last) ? last[1] : last && last.close;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || "") || datum > HEUTE) return null;
  if (!Number.isFinite(kurs) || kurs <= 0) return null;
  return { close: kurs, date: datum, currency: series.currency };
}

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

  const entries = [];
  const staende = {};
  let mitKurs = 0, mitName = 0, ohneReihe = 0, reiheVerworfen = 0;
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
    entries.push({
      s: member.s,
      ...(name ? { n: name } : {}),
      ...(typen.get(member.s) ? { t: typen.get(member.s) } : {}),
      ...(preis ? { c: preis.close, d: preis.date, u: preis.currency } : {})
    });
  }

  const report = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    source: {
      universe: "quant/data/universe/market-capability.json",
      prices: "quant/data/market/discover-series (discover-series-1.1.0, split-adjusted daily)",
      names: "quant/data/universe/search/sym (company-master-1.0.0, " + shards + " shards)"
    },
    /* Die Deckung steht IM Artefakt, damit ein Leser sie nicht selbst
       ausrechnen muss und ein Test sie halten kann. */
    coverage: {
      universe: members.length, entries: entries.length,
      withName: mitName, withPrice: mitKurs,
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
  process.stdout.write("  mit Kurs   " + String(mitKurs).padStart(5) +
    "   (ohne Reihe " + ohneReihe + ", Reihe verworfen " + reiheVerworfen + ")\n");
  process.stdout.write("  Staende: " + Object.entries(report.coverage.priceDates)
    .map(([d, n]) => d + " " + n).join(" · ") + "\n");
  process.stdout.write("  " + OUT.replace(ROOT + "/", "") + " · " +
    kb(gzipSync(JSON.stringify(report)).length) + " gzip\n");
}

main();
