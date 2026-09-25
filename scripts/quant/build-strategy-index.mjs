#!/usr/bin/env node
/* =========================================================================
   Materialize the Strategy Screening Index.

   Reads only artifacts that already exist:
     quant/data/product/factor-evidence-v1/screening.json.gz
     quant/methodology/strategy-profiles-v1.json

   Writes quant/data/product/strategy-index-v1.json.gz.

   A strategy profile answers "does this share suit this style". The other
   half of the same question is "which shares suit it", and that is the same
   predicate read the other way round - same predicateHash, no second
   formulation and no second engine.

   Unlike the setup cascade there is no precedence here: a title may suit
   several profiles, and a profile's list is exactly its predicate's hit
   set. What has to stay apart instead are two different zeros - a profile
   no title matches, and a profile whose input the universe does not carry
   at all. The first is a finding about the market. The second is a gap in
   the data, and publishing it as "0 titles match" would be a claim this
   layer has not earned.
   ========================================================================= */
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const StrategyMatch = require(join(ROOT, "quant/engines/strategy-match.js"));
const Query = require(join(ROOT, "quant/engines/query.js"));

const SCREENING = join(ROOT, "quant/data/product/factor-evidence-v1/screening.json.gz");
const HISTORY_DIR = join(ROOT, "quant/data/product/factor-evidence-history");
/* Zwei Snapshots sind das Minimum, mit dem sich ueberhaupt etwas
   beobachten laesst: einer sagt, wie es heute steht. Die Zahl steht hier
   und nicht im Text, damit eine Aenderung daran im Diff sichtbar ist. */
const MIN_SNAPSHOTS = 2;
const OUT = join(ROOT, "quant/data/product/strategy-index-v1.json.gz");
const contract = JSON.parse(readFileSync(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8"));

/** Liest eine Zeilentabelle desselben Formats wie die Screening-Tabelle. */
function hydrate(payload) {
  const fields = payload.fields || [];
  return Object.keys(payload.rows || {}).map((ticker) => {
    const values = payload.rows[ticker];
    const row = { ticker };
    fields.forEach((field, i) => { row[field] = values[i]; });
    return row;
  });
}

/* =======================================================================
   WAS DIE VEROEFFENTLICHTE SNAPSHOT-REIHE SCHON BEANTWORTEN KANN

   Hier stand eine Konstante: historicalEvidence = UNAVAILABLE,
   FACTOR_HISTORY_NOT_AVAILABLE. Das war am Tag, an dem es geschrieben
   wurde, richtig - und es waere auch dann noch da gestanden, wenn die
   Reihe laengst gewachsen ist, weil eine Konstante nicht nachsieht.

   Sie sieht jetzt nach. Und sie beantwortet ausdruecklich NICHT die Frage
   "was hat dieser Stil abgeworfen": dafuer braucht es Vorwaertsrenditen
   auf Gesamtrenditebasis und eine punktgenaue Indexmitgliedschaft, und
   beides fehlt (siehe M6). Was zwei veroeffentlichte Snapshots hergeben,
   ist die BESTAENDIGKEIT der Zuordnung: wie viele Titel, die ein Profil
   beim vorigen Stand erfuellten, es beim jetzigen noch erfuellen.

   Das ist eine Beobachtung an veroeffentlichten Stichtagen und keine
   Ergebnisaussage. Sie wird auch so benannt, damit sie nicht als kleine
   Erfolgsquote gelesen wird.

   Gemischt wird ueber Methodikversionen NICHT: vu-factor-evidence-1.0.0
   rechnete auf Gesamtrendite, 2.0.0 auf splitbereinigtem Kurs. Zwei
   Snapshots verschiedener Versionen nebeneinander zu halten hiesse, die
   Methodikaenderung als Marktbewegung auszuweisen.
   ======================================================================= */
function historicalEvidence(methodologyVersion, contract, currentRows) {
  const leer = (reason, extra) => Object.assign(
    { state: "UNAVAILABLE", kind: null, reason: reason }, extra || {});
  if (!methodologyVersion) return leer("EVIDENCE_METHODOLOGY_VERSION_MISSING");

  let index = null;
  try { index = JSON.parse(readFileSync(join(HISTORY_DIR, "index.json"), "utf8")); }
  catch { return leer("FACTOR_HISTORY_INDEX_MISSING"); }
  const reihe = ((index.series || {})[methodologyVersion] || []).slice().sort();

  if (reihe.length < MIN_SNAPSHOTS) {
    /* Der Abstand, nicht nur das Nein. "Noch nicht" mit einer Zahl ist
       eine Auskunft; ohne eine ist es eine Vertroestung. */
    return { state: "PENDING_HISTORY", kind: null, reason: "FACTOR_HISTORY_TOO_SHORT",
             methodologyVersion: methodologyVersion, published: reihe.length,
             required: MIN_SNAPSHOTS, missing: MIN_SNAPSHOTS - reihe.length,
             publishedDates: reihe,
             note: "Bestaendigkeit der Zuordnung braucht zwei veroeffentlichte Snapshots " +
                   "derselben Methodikversion. Versionen werden nicht gemischt." };
  }

  const [vorher, jetzt] = [reihe[reihe.length - 2], reihe[reihe.length - 1]];
  let alt = null;
  try {
    alt = JSON.parse(gunzipSync(readFileSync(
      join(HISTORY_DIR, methodologyVersion, vorher + ".json.gz"))).toString("utf8"));
  } catch { return leer("FACTOR_HISTORY_SNAPSHOT_UNREADABLE", { snapshot: vorher }); }
  if (alt.methodologyVersion !== methodologyVersion) {
    return leer("FACTOR_HISTORY_VERSION_MISMATCH",
                { snapshot: vorher, carries: alt.methodologyVersion || null });
  }

  /* Gerechnet in der Engine, mit demselben Praedikat wie die Zuordnung. */
  const profiles = StrategyMatch.assignmentPersistence(contract, hydrate(alt), currentRows);

  return {
    state: "AVAILABLE",
    kind: "ASSIGNMENT_PERSISTENCE",
    methodologyVersion: methodologyVersion,
    from: vorher, to: jetzt,
    published: reihe.length,
    profiles: profiles,
    /* Was diese Zahl NICHT ist. Sie steht neben ihr, nicht in einer
       Fussnote - eine Quote ohne diesen Satz wird als Erfolgsquote
       gelesen. */
    isNot: ["RETURN", "HIT_RATE", "BACKTEST", "PROBABILITY"],
    note: "Anteil der Titel, die ein Profil am " + vorher + " erfuellten und am " + jetzt +
          " noch erfuellen. Eine Beobachtung an zwei veroeffentlichten Stichtagen - keine " +
          "Rendite, keine Trefferquote und kein Backtest."
  };
}

function main() {
  const screening = JSON.parse(gunzipSync(readFileSync(SCREENING)).toString("utf8"));
  /* The artifact stores one array per ticker against a shared field header,
     which is what keeps it small. Hydrated here exactly as the product
     service hydrates it, so the index is built over the same rows a
     screener would see rather than over a second reading of the file. */
  const fields = screening.fields || [];
  const rows = Object.keys(screening.rows || {}).map((ticker) => {
    const values = screening.rows[ticker];
    const row = { ticker };
    fields.forEach((field, i) => { row[field] = values[i]; });
    return row;
  });
  if (!rows.length) throw new Error("the factor evidence screening table is empty");

  /* DIE DEKLARIERTE EVIDENZVERSION MUSS DIE GELESENE SEIN.
  
     Bis zum 25.09.2026 deklarierte der Profilvertrag vu-factor-evidence-1.0.0,
     waehrend die Tabelle darunter laengst 2.0.0 war - und die Aktienseite
     schrieb dem Leser die 1.0.0 hin. Niemand hat es bemerkt, weil nichts es
     verglich. Ein Vertrag, der eine andere Version nennt als die, gegen die
     gerechnet wird, ist die stille Weiterfuehrung einer alten Bedeutung; die
     Owner-Entscheidung zu Option C schliesst genau das aus.
  
     Deshalb hier ein Abbruch und keine Warnung: ein veroeffentlichter Index
     mit falscher Versionsangabe ist schlimmer als keiner, weil alles
     Nachgelagerte die Angabe fuer bare Muenze nimmt. */
  if (contract.evidenceMethodologyVersion !== screening.methodologyVersion) {
    throw new Error("EVIDENCE_METHODOLOGY_VERSION_MISMATCH: the profile contract declares " +
      contract.evidenceMethodologyVersion + ", the screening table carries " +
      screening.methodologyVersion + ". Version the contract instead of publishing a wrong claim.");
  }

  const index = StrategyMatch.screenIndex(contract, rows, {
    evidenceNamespace: screening.namespace || "quantV2.factorEvidence"
  });

  /* The proof that the published list is the predicate's own answer, run
     through the query engine the screener uses rather than through a
     second comparison written here. An empty list is checked too: a
     profile that matches nothing must match nothing under the predicate
     as well, or the two sides have drifted. */
  const parity = index.profiles.map((entry) => {
    if (entry.availability.state !== "AVAILABLE") {
      return { profileId: entry.profileId, checked: false, reason: entry.availability.reason };
    }
    const profile = contract.profiles.find((p) => p.profileId === entry.profileId);
    const query = StrategyMatch.screenQuery(profile);
    const expected = rows.filter((row) => Query.matches(row, query.filters)).map((row) => row.ticker);
    const published = entry.tickers;
    const same = expected.length === published.length &&
      expected.slice().sort().join(",") === published.slice().sort().join(",");
    if (!same) {
      throw new Error("the published list for '" + entry.profileId + "' is not the predicate's answer: " +
        published.length + " published against " + expected.length + " matched");
    }
    return { profileId: entry.profileId, checked: true, matched: expected.length,
             predicateHash: entry.predicateHash };
  });

  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
  const payload = {
    ...index,
    generatedAt,
    asOf: screening.asOf || null,
    evidenceMethodologyVersion: screening.methodologyVersion || null,
    parity,
    /* Mit den Daten ausgewiesen und nicht in einer Bildunterschrift: was
       dieser Index sagt, ist welche Titel heute zu einem Stil passen. Was
       ein Stil ABGEWORFEN hat, sagt er nicht - das verlangt
       Vorwaertsrenditen und eine punktgenaue Indexmitgliedschaft. Was die
       veroeffentlichte Snapshot-Reihe hergibt, wird gemessen statt
       behauptet. */
    historicalEvidence: historicalEvidence(
      screening.methodologyVersion || null, contract, rows)
  };

  const bytes = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  if (bytes.length > 128 * 1024) {
    throw new Error("the strategy index is " + bytes.length + " compressed bytes, past the 128 KiB cap");
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, bytes);

  process.stdout.write("Strategy index " + index.methodologyVersion + " · " + index.universe + " Titel · " +
    (bytes.length / 1024).toFixed(1) + " KB komprimiert\n");
  const hist = payload.historicalEvidence;
  process.stdout.write("  Historische Evidenz: " + hist.state +
    (hist.state === "PENDING_HISTORY"
      ? " (" + hist.published + " von " + hist.required + " Snapshots unter " + hist.methodologyVersion + ")"
      : hist.state === "AVAILABLE"
        ? " · " + hist.kind + " " + hist.from + " → " + hist.to
        : " · " + hist.reason) + "\n");
  if (hist.state === "AVAILABLE") {
    for (const entry of hist.profiles) {
      process.stdout.write("    " + entry.profileId.padEnd(26) +
        (entry.persistence === null ? "     –" :
          (entry.persistence * 100).toFixed(1).padStart(6) + " %") +
        "  " + entry.stillMatching + " von " + entry.comparable + "\n");
    }
  }
  for (const entry of index.profiles) {
    process.stdout.write("  " + String(entry.count === null ? "–" : entry.count).padStart(5) + "  " +
      entry.profileId.padEnd(26) + (entry.availability.state === "AVAILABLE" ? "" :
      entry.availability.reason + " " + (entry.availability.fields || []).join(",")) + "\n");
  }
}

main();
