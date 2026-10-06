#!/usr/bin/env node
/* =========================================================================
   FULL-UNIVERSE RETURN-BASIS AUDIT — Schritt 10: das Dokument.

   Rendert docs/VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md ausschliesslich
   aus den beiden maschinenlesbaren Artefakten. Kein Satz traegt eine
   Zahl, die nicht in einem Artefakt steht - und wo eine Messung fehlt,
   steht das da, statt dass der Absatz verschwindet.

   Der Grund ist nicht Bequemlichkeit. Ein von Hand geschriebenes
   Studiendokument altert gegen die Daten, aus denen es einmal entstand,
   und niemand merkt es. Dieses hier kann das nicht.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function arg(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}
const AUDIT = join(ROOT, "quant/data/providers/return-basis-input-audit.json");
const STUDY = arg("--study", join(ROOT, "quant/data/providers/return-basis-universe-study.json"));
const OUT = arg("--out", join(ROOT, "docs/VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md"));

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const num = (v, d = 2) => (finite(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const int = (v) => (finite(v) ? v.toLocaleString("de-DE") : "—");
const pct = (v, d = 2) => (finite(v) ? num(v * 100, d) + " %" : "—");

function load(file, label) {
  if (!existsSync(file)) {
    throw new Error("Artefakt fehlt: " + file + " (" + label + "). Erst messen, dann schreiben.");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

const audit = load(AUDIT, "Schritt 1");
const study = load(STUDY, "Schritte 2-9");

/* Ein Dokument mit der Ueberschrift "ueber das Produktuniversum", das in
   Wahrheit fuenf Titel gesehen hat, ist schlimmer als kein Dokument: der
   Warnkasten oben wird ueberlesen, die Tabellen darunter nicht. Deshalb
   entsteht es gar nicht erst, wenn der kanonische Bestand fehlte.

   --allow-partial gibt es fuer den Blick auf das Layout waehrend der
   Entwicklung; im Workflow steht es nicht. */
const ALLOW_PARTIAL = process.argv.includes("--allow-partial");
if (study.scope !== "CANONICAL_HISTORY" && !ALLOW_PARTIAL) {
  process.stderr.write("Studiendokument NICHT geschrieben: die Messung lief auf '" + study.scope +
    "'.\n" + study.scopeNote + "\n");
  process.exit(1);
}

const L = [];
const w = (line = "") => L.push(line);

/* ------------------------------------------------------------- Kopf */

w("# VISION UNIVERSE® QUANT 2.0 — Return-Basis-Studie über das Produktuniversum");
w();
w("> Erzeugt aus `" + AUDIT.replace(ROOT + "/", "") + "` und `" + STUDY.replace(ROOT + "/", "") +
  "`. Dieses Dokument wird gerendert, nicht geschrieben: keine Zahl darin stammt aus einer anderen Quelle als den Artefakten.");
w();
w("| | |");
w("|---|---|");
w("| Stand der Messung | " + study.generatedAt + " |");
w("| Bestand | `" + study.scope + "` |");
w("| Studienlogik | `" + study.versions.study_logic + "` · Reihen `" + study.versions.return_series +
  "` · Vergleich `" + study.versions.comparison + "` |");
w("| Entscheidung | **" + study.gateStatus.QUANT_V2_MOMENTUM_RETURN_BASIS + "** |");
w();
if (study.scope !== "CANONICAL_HISTORY") {
  w("> **Achtung.** " + study.scopeNote);
  w();
}
w("Diese Studie entscheidet nichts. Sie misst, was zwischen zwei Return-Basen wirklich passiert, damit die Entscheidung danach auf Zahlen steht statt auf fünf Titeln. Die Golden Five kommen darin ausschließlich als Regressionsfälle vor.");
w();

/* --------------------------------------------------- 1 Inputs */

w("## 1 · Was an Daten wirklich da ist");
w();
w("Gemessen, nicht geschätzt. Ein Titel ohne Reihe zählt als fehlend und nicht als Null; ein Titel ohne Dividendenereignis ist etwas anderes als einer ohne Dividendenspalte.");
w();
w("| Größe | Titel |");
w("|---|---:|");
for (const [key, value] of Object.entries(audit.counters)) {
  w("| `" + key + "` | " + int(value) + " |");
}
w();
const ausschluss = Object.entries(audit.exclusions || {}).sort((a, b) => b[1] - a[1]);
if (ausschluss.length) {
  w("**Warum der Rest ausgeschlossen ist**");
  w();
  w("| Grund | Titel |");
  w("|---|---:|");
  for (const [reason, count] of ausschluss) w("| `" + reason + "` | " + int(count) + " |");
  w();
}
w("Quellen: " + Object.entries(audit.bySource || {}).map(([k, v]) => "`" + k + "` " + int(v)).join(" · ") +
  ". Bereinigungsstufe: " + Object.entries(audit.byAdjustmentStatus || {}).map(([k, v]) => "`" + k + "` " + int(v)).join(" · ") + ".");
w();

/* --------------------------------------------------- 2 Reihen */

w("## 2 · Die beiden Reihen");
w();
w("Aus **einem** Satz Bars entstehen zwei Reihen, und keine davon ist eine Umdeutung einer veröffentlichten Zahl.");
w();
w("- **A · `SPLIT_ADJUSTED_PRICE`** — rückwärts aus `close` und `splitFactor` rekonstruiert. Der Splitsprung fällt heraus, die Dividendenlücke bleibt stehen, weil sie am Markt wirklich passiert ist. Basis für Chart, Technical, Setup, Elliott und Kursmomentum.");
w("- **B · `TOTAL_RETURN`** — die `adjustedClose`-Spalte, deren Gesamtrendite-Eigenschaft nachgewiesen ist. Basis für Backtest, Portfolio-Performance, Benchmark und die empirische Momentumprüfung.");
w();
w("Bewusst **nicht** die adjClose-Spalte für A: sie ist gesamtrenditebereinigt und trüge damit genau das in die Kursanalyse, was dort nicht hineingehört.");
w();
w("**Beide Basen baubar:** " + int(study.gateStatus.DUAL_RETURN_SERIES_CAPABLE_UNIVERSE) + " Titel von " +
  int(study.counters.CANONICAL_PRODUCT_UNIVERSE) + " im Produktuniversum, " +
  int(study.counters.SERIES_FOUND) + " davon mit gefundener Reihe.");
w();
const studyExclusions = Object.entries(study.exclusions || {}).sort((a, b) => b[1] - a[1]);
if (studyExclusions.length) {
  w("| Ausschlussgrund | Titel |");
  w("|---|---:|");
  for (const [reason, count] of studyExclusions) w("| `" + reason + "` | " + int(count) + " |");
  w();
}

const v = study.totalReturnVerification;
w("### Der Nachweis, dass Reihe B eine Gesamtrendite-Reihe ist");
w();
w("An einem Ex-Tag ohne Split muss gelten: `(adj_vor/close_vor) / (adj_jetzt/close_jetzt) = 1 − Dividende/close_vor`. Bei reiner Splitbereinigung stünde dort 1.");
w();
w("| | |");
w("|---|---:|");
w("| Urteil | **" + v.verdict + "** |");
w("| geprüfte Titel | " + int(v.securitiesChecked) + " |");
w("| geprüfte Ereignisse | " + int(v.eventsChecked) + " |");
w("| davon konsistent | " + int(v.eventsConsistent) + " |");
w("| schlechtester Fehler | " + pct(v.worstError, 4) + " |");
w("| Toleranz | " + pct(v.tolerance, 2) + " |");
w();
if (v.failureClasses && Object.keys(v.failureClasses).length) {
  w("**Nicht jeder Fehlschlag ist ein Befund.** Die Formel gilt für eine Bardividende und sonst nichts. Eine Abspaltung, eine Sachausschüttung, ein Bezugsrecht — jedes davon bereinigt der Anbieter, und keines steht vollständig in der Dividendenspalte. Deshalb wird jede Abweichung eingeordnet statt gezählt: die **implizite Ausschüttung** ist das, was die Bereinigung tatsächlich herausgenommen hat.");
  w();
  const erklaerung = {
    ADJUSTED_BUT_NOT_BY_THE_CASH_AMOUNT: "bereinigt, aber nicht um den gemeldeten Barbetrag — die Signatur einer Abspaltung: der Anbieter rechnet den Wert der verteilten Anteile am Ex-Tag heraus, nicht die Zahl in der Dividendenspalte",
    ADJUSTMENT_ON_NEIGHBOURING_DAY: "bereinigt am Nachbartag — ein Datumsversatz, keine fehlende Bereinigung",
    NO_ADJUSTMENT_AT_ALL: "**gar nicht bereinigt** — an diesem Tag ist die Spalte keine Gesamtrendite",
    ADJUSTMENT_INCONSISTENT: "bereinigt, aber weit außerhalb des Bandes um die Ausschüttung — was dort herausgerechnet wurde, erklärt diese Prüfung nicht"
  };
  w("| Einordnung | Ereignisse | |");
  w("|---|---:|---|");
  for (const [klass, count] of Object.entries(v.failureClasses).sort((a, b) => b[1] - a[1])) {
    w("| `" + klass + "` | " + int(count) + " | " + (erklaerung[klass] || "") + " |");
  }
  w();
  if (v.adjustmentBand) {
    w("Als *bereinigt* zählt ein Tag, dessen implizite Ausschüttung zwischen dem " +
      num(v.adjustmentBand[0], 2) + "- und dem " + num(v.adjustmentBand[1], 2) +
      "-fachen der gemeldeten liegt. Die Grenze entscheidet die Frage \"wurde überhaupt bereinigt\", nicht \"stimmt der Betrag\".");
    w();
  }
  if (v.byDistributionSize && Object.keys(v.byDistributionSize).length) {
    w("| Größe der Ausschüttung | " + Object.keys(erklaerung).filter((k) =>
      Object.values(v.byDistributionSize).some((b) => b[k])).map((k) => "`" + k + "`").join(" | ") + " |");
    const spalten = Object.keys(erklaerung).filter((k) =>
      Object.values(v.byDistributionSize).some((b) => b[k]));
    w("|---" + spalten.map(() => "|---:").join("") + "|");
    for (const [bucket, byClass] of Object.entries(v.byDistributionSize)) {
      w("| `" + bucket + "` | " + spalten.map((k) => int(byClass[k] || 0)).join(" | ") + " |");
    }
    w();
    w("`ORDINARY_DIVIDEND` ist eine Ausschüttung unter fünf Prozent des Kurses, `LARGE_DISTRIBUTION` alles darüber — der Sache nach meist eine Abspaltung oder Sonderausschüttung.");
    w();
  }
  if (finite(v.affectedSecurities)) {
    w("Betroffen sind " + int(v.affectedSecurities) + " von " + int(v.securitiesChecked) +
      " geprüften Titeln (" + pct(v.affectedSecuritiesShare, 2) + ").");
    w();
  }
  w("**Erklärt: " + int(v.explainedByCorporateAction) + " · unerklärt: " + int(v.unexplained) +
    "** (" + pct(v.unexplainedShare, 3) + " aller geprüften Ereignisse). Das Urteil steht auf den unerklärten: eine Reihe, die eine Dividende gar nicht oder nur zum Teil herausrechnet, ist an diesem Tag keine Gesamtrendite-Reihe, und keine Einordnung erklärt das weg.");
  w();
}
if (v.inconsistentSecurities && v.inconsistentSecurities.length) {
  w("Titel mit Abweichungen (erste " + Math.min(10, v.inconsistentSecurities.length) + " von " +
    int(v.inconsistentSecurities.length) + " aufgezeichneten): " +
    v.inconsistentSecurities.slice(0, 10).map((s) => "`" + s.securityId + "` " +
      s.consistent + "/" + s.checked).join(" · ") + ".");
  w();
}

/* ----------------------------------------- Veroeffentlichte Basis */

const pb = study.publishedBasis;
w("### Was die Produktion heute rechnet");
w();
w("Diese Frage stand im Return-Semantics-Vertrag als `UNKNOWN_UNTIL_MEASURED`. Sie ist jetzt gemessen — beantwortet, nicht entschieden.");
w();
w("| | |");
w("|---|---|");
w("| Artefakt | `" + pb.artefact + "` |");
w("| Einträge | " + int(pb.entries) + " |");
w("| Preisbasis | " + Object.entries(pb.priceBasisCounts).map(([k, n]) => "`" + k + "` " + int(n)).join(" · ") + " |");
w("| gemessene Quant-V2-Momentumbasis | **" + pb.measuredQuantV2MomentumBasis + "** |");
w();
if (study.specImplementationFindings && study.specImplementationFindings.length) {
  w("**Befund: Methodiktext und Rechnung sagen nicht dasselbe.**");
  w();
  w("| Komponente | Gewicht | beschrieben als | gerechnet auf |");
  w("|---|---:|---|---|");
  for (const f of study.specImplementationFindings) {
    w("| `" + f.component + "` | " + num(f.weightInFactor, 2) + " | " + f.declaredInput + " | `" + f.computedOn + "` |");
  }
  w();
  w("Zusammen " + num(study.specImplementationFindings.reduce((s, f) => s + (f.weightInFactor || 0), 0), 2) +
    " Gewicht der Momentumnote. Solange `adjustedClose` splitbereinigt wäre, fiele das nicht auf; sie ist nachweislich gesamtrenditebereinigt, also ist es ein Unterschied. Diese Studie korrigiert ihn nicht still — er gehört in die Entscheidung.");
  w();
}

/* ----------------------------------------- 3 Golden Five */

w("## 3 · Keine Entscheidung aus fünf Titeln");
w();
w("Die Golden Five stehen im Regressionsumfang (`quant/tests/return-series.test.mjs`) und nirgends sonst. Sie prüfen die Konstruktion der beiden Reihen — den Splitsprung, die Dividendenlücke, die Richtung bei einem Dividendenzahler. Als Methodikbasis kommen sie nicht vor.");
w();

/* ----------------------------------------- 4-7 Vergleich */

const MEASURES = ["3M", "6M", "12M", "12M-1M", "RELATIVE_STRENGTH"];
const primary = study.cutoffs[0];

w("## 4 & 5 · Der Rangvergleich über das Universum");
w();
if (!primary) {
  w("> Kein Stichtag messbar. Ohne Querschnitt gibt es keinen Rangvergleich.");
  w();
} else {
  w("Stichtag **" + primary.cutoffDate + "**, " + int(primary.securitiesWithCutoff) + " Titel mit ausreichender Historie.");
  w();
  const ausgeschlossen = study.cutoffs.reduce((sum, c) => sum + (c.excludedForUnexplainedAdjustment || 0), 0);
  if (ausgeschlossen > 0) {
    w("**Ausgeschlossen, weil die Gesamtrendite-Reihe in genau diesem Fenster nicht belegt ist:**");
    w();
    w("| Stichtag | Titel im Fenster | ausgeschlossen | verglichen | betroffene Titel |");
    w("|---|---:|---:|---:|---|");
    for (const c of study.cutoffs) {
      w("| " + c.cutoffDate + " | " + int(c.securitiesBeforeExclusion) + " | " +
        int(c.excludedForUnexplainedAdjustment) + " | " + int(c.securitiesWithCutoff) + " | " +
        (c.excludedForUnexplainedAdjustmentTickers || []).join(", ") + " |");
    }
    w();
    w("Diese Titel tragen einen Bereinigungstag, den die Prüfung oben nicht erklären kann, **innerhalb** des Fensters, über das hier gerechnet wird. Ihre Gesamtrendite-Reihe ist dort nicht belegt — also hat sie in einem Vergleich beider Basen nichts verloren. Die Alternative wäre eine Toleranz gewesen; die Zahl steht hier, damit sichtbar bleibt, wie klein der Ausschluss ist. Wären es viele, taugte die Studie nichts.");
    w();
  }
  w("Ein Faktorwert ist im Produkt kein Prozentwert, sondern ein Perzentil. Deshalb ist die Rangverschiebung die Messung und der Wertunterschied nur der Zwischenschritt.");
  w();
  w("| Messgröße | `UNIVERSE_N` | ρ | Median Rang | P90 | P95 | Max | ≥1 Pz | ≥5 Pz | ≥10 Pz | Dezil ab/zu |");
  w("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const measure of MEASURES) {
    const m = primary.measures[measure];
    if (!m) continue;
    if (m.state) {
      w("| `" + measure + "` | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 |");
      continue;
    }
    w("| `" + measure + "` | " + int(m.UNIVERSE_N) + " | " + num(m.SPEARMAN_RANK_CORRELATION, 4) + " | " +
      int(m.MEDIAN_ABSOLUTE_RANK_CHANGE) + " | " + int(m.P90_RANK_CHANGE) + " | " + int(m.P95_RANK_CHANGE) + " | " +
      int(m.MAX_RANK_CHANGE) + " | " + int(m.TITLES_MOVING_1_PERCENTILE) + " | " +
      int(m.TITLES_MOVING_5_PERCENTILES) + " | " + int(m.TITLES_MOVING_10_PERCENTILES) + " | " +
      int(m.topDecile.LEAVING) + " / " + int(m.topDecile.ENTERING) + " |");
  }
  w();
  for (const measure of MEASURES) {
    const m = primary.measures[measure];
    if (m && m.state) {
      w("> **`" + measure + "` · `" + m.state + "`** (`" + m.reason + "`). " + m.note);
      w();
    }
  }
  w("`ρ` ist die Spearman-Rangkorrelation zwischen beiden Basen, `Pz` Perzentilpunkte, `Dezil ab/zu` der Wechsel im obersten Zehntel. Aus einem Median allein folgt nichts: ein Median von null Rängen und ein P95 von mehreren hundert sind gleichzeitig wahr, und nur der zweite Wert entscheidet, ob ein Titel aus dem obersten Dezil fällt.");
  w();

  const leader = primary.measures["12M-1M"] || primary.measures["12M"];
  if (leader && !leader.state && leader.largestPercentileMoves && leader.largestPercentileMoves.length) {
    w("**Die größten Perzentilbewegungen** (Messgröße `" + (primary.measures["12M-1M"] ? "12M-1M" : "12M") + "`, die schwerste Momentumkomponente der Produktion)");
    w();
    w("| Titel | Sektor | Segment | Rendite Kurs | Rendite gesamt | Pz Kurs | Pz gesamt | Δ Pz | Δ Rang |");
    w("|---|---|---|---:|---:|---:|---:|---:|---:|");
    for (const row of leader.largestPercentileMoves) {
      w("| " + row.ticker + " | " + row.sector + " | `" + row.segment + "` | " + pct(row.PRICE_RETURN_VALUE, 1) +
        " | " + pct(row.TOTAL_RETURN_VALUE, 1) + " | " + num(row.PRICE_RETURN_PERCENTILE, 1) + " | " +
        num(row.TOTAL_RETURN_PERCENTILE, 1) + " | " + num(row.PERCENTILE_DELTA, 1) + " | " +
        num(row.RANK_DELTA, 0) + " |");
    }
    w();
  }

  /* 6 Dividendenschieflage */
  w("## 6 · Dividendenschieflage");
  w();
  w("Segmentiert nach nachlaufender Zwölfmonatsrendite: jede Ausschüttung gegen den Kurs **ihres** Tages, die Quotienten summiert — splitfest ohne Bereinigung.");
  w();
  for (const measure of ["12M-1M", "12M"]) {
    const m = primary.measures[measure];
    if (!m || m.state) continue;
    w("**`" + measure + "`**");
    w();
    w("| Segment | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |");
    w("|---|---:|---:|---:|---:|---:|");
    for (const segment of ["NO_DIVIDEND", "LOW_YIELD", "MEDIUM_YIELD", "HIGH_YIELD"]) {
      const s = m.DIVIDEND_BIAS[segment];
      if (!s) continue;
      w("| `" + segment + "` | " + int(s.N) + " | " + pct(s.MOMENTUM_DELTA_MEDIAN, 2) + " | " +
        num(s.RANK_DELTA_MEDIAN, 0) + " | " + num(s.FACTOR_PERCENTILE_DELTA_MEDIAN, 2) + " | " +
        num(s.FACTOR_PERCENTILE_DELTA_P95, 2) + " |");
    }
    w();
  }

  /* 7 Sektorschieflage */
  w("## 7 · Sektorschieflage");
  w();
  const taxonomy = study.inputs.sectorTaxonomy;
  if (taxonomy) {
    w("Klassifikation: **" + taxonomy.primary + "**, aus `" + taxonomy.source + "`. " + taxonomy.why);
    w();
  }
  const sectorMeasure = primary.measures["12M-1M"] || primary.measures["12M"];
  const sectorTable = (bias, label) => {
    const sectors = Object.entries(bias)
      .filter(([, s]) => s.N >= 10)
      .sort((a, b) => (b[1].FACTOR_PERCENTILE_DELTA_MEDIAN || 0) - (a[1].FACTOR_PERCENTILE_DELTA_MEDIAN || 0));
    if (!sectors.length) return;
    w("**" + label + "**");
    w();
    w("| Sektor | Titel | Δ Rendite (Median) | Δ Rang (Median) | Δ Perzentil (Median) | Δ Perzentil (P95) |");
    w("|---|---:|---:|---:|---:|---:|");
    for (const [sector, s] of sectors) {
      w("| " + sector + " | " + int(s.N) + " | " + pct(s.MOMENTUM_DELTA_MEDIAN, 2) + " | " +
        num(s.RANK_DELTA_MEDIAN, 0) + " | " + num(s.FACTOR_PERCENTILE_DELTA_MEDIAN, 2) + " | " +
        num(s.FACTOR_PERCENTILE_DELTA_P95, 2) + " |");
    }
    w();
  };
  if (sectorMeasure && !sectorMeasure.state) {
    if (sectorMeasure.NAMED_SECTOR_BIAS) {
      sectorTable(sectorMeasure.NAMED_SECTOR_BIAS, "Die acht benannten Sektoren des Auftrags");
      if (taxonomy && taxonomy.namedSectors) {
        w("> Einteilung `" + taxonomy.namedSectors.taxonomy + "`. " + taxonomy.namedSectors.note +
          " Die SIC-Bereiche: " + taxonomy.namedSectors.ranges.map((r) => r.sector + " " +
            r.ranges.map(([a, b]) => (a === b ? String(a) : a + "–" + b)).join("/")).join(" · ") + ".");
        w();
      }
    }
    sectorTable(sectorMeasure.SECTOR_BIAS, "Die Peertaxonomie des Produkts (SIC-Division)");
    w("Sektoren mit weniger als zehn Titeln sind ausgelassen: aus vier Titeln einen Sektorbefund zu machen wäre eine Zahl ohne Aussage.");
    w();
  }

  /* 8 Strategiewirkung */
  w("## 8 · Strategiewirkung");
  w();
  const sim = primary.simulation;
  w("Die Momentumnote wird auf beiden Basen aus denselben sechs Komponenten und denselben Gewichten wie in der Produktion nachgebaut, aber nur auf Universumsperzentilen — die Produktion mischt zusätzlich Peergruppen dazu. Wie nah die Simulation an der veröffentlichten Note liegt, steht daneben; ohne diese Zahl wäre die Strategiewirkung eine Behauptung über ein ungeprüftes Modell.");
  w();
  w("| | |");
  w("|---|---:|");
  w("| Grundlage | `" + (sim.strategyBasis || "—") + "` |");
  w("| veröffentlichtes Evidence vom | " + (sim.publishedEvidenceAsOf || "—") +
    (finite(sim.publishedEvidenceLagDays) ? " (" + int(sim.publishedEvidenceLagDays) + " Tage nach dem Stichtag)" : "") + " |");
  if (finite(sim.excludedForLateFundamentals)) {
    w("| ausgeschlossen, weil Fundamentaldaten erst nach dem Stichtag öffentlich | " + int(sim.excludedForLateFundamentals) + " |");
  }
  w("| ρ Simulation (Gesamtrendite) zur veröffentlichten Note | " + num(sim.SIMULATION_FIDELITY_TOTAL_VS_PUBLISHED, 4) + " |");
  w("| ρ Simulation (Kursrendite) zur veröffentlichten Note | " + num(sim.SIMULATION_FIDELITY_PRICE_VS_PUBLISHED, 4) + " |");
  w("| bewertete Titel: veröffentlicht / Kurs / gesamt | " + int(sim.publishedScored) + " / " +
    int(sim.simulatedScoredOnPrice) + " / " + int(sim.simulatedScoredOnTotal) + " |");
  w();
  if (sim.limitation) {
    w("> **Einschränkung, benannt statt weggelassen.** " + sim.limitation);
    w();
  }
  const shift = sim.momentumScoreShift;
  w("**Die Momentumnote selbst, Kurs gegen gesamt:** ρ " + num(shift.SPEARMAN_RANK_CORRELATION, 4) +
    " · Median " + int(shift.MEDIAN_ABSOLUTE_RANK_CHANGE) + " Ränge · P95 " + int(shift.P95_RANK_CHANGE) +
    " · Maximum " + int(shift.MAX_RANK_CHANGE) + " · " + int(shift.TITLES_MOVING_5_PERCENTILES) +
    " Titel bewegen sich um mindestens 5 Perzentilpunkte, " + int(shift.TITLES_MOVING_10_PERCENTILES) + " um mindestens 10.");
  w();
  if (primary.STRATEGY_IMPACT && !primary.STRATEGY_IMPACT.state) {
    w("| Strategie | Treffer auf Kursrendite | auf Gesamtrendite | fallen heraus | kommen hinzu | Wechselanteil |");
    w("|---|---:|---:|---:|---:|---:|");
    for (const [id, impact] of Object.entries(primary.STRATEGY_IMPACT)) {
      w("| " + impact.label + " (`" + id + "`) | " + int(impact.MEMBERS_ON_PRICE_RETURN) + " | " +
        int(impact.MEMBERS_ON_TOTAL_RETURN) + " | " + int(impact.LEAVING) + " | " + int(impact.ENTERING) + " | " +
        (finite(impact.MEMBERSHIP_CHURN_SHARE) ? pct(impact.MEMBERSHIP_CHURN_SHARE, 1) : "—") + " |");
    }
    w();
    w("Keine Produktionsstrategie wurde dabei überschrieben. Die Simulation läuft neben der Produktion.");
    w();
  } else if (primary.STRATEGY_IMPACT) {
    w("> `" + primary.STRATEGY_IMPACT.state + "` — " + primary.STRATEGY_IMPACT.note);
    w();
  }

  /* 9 Robustheit */
  w("## 9 · Historische Robustheit");
  w();
  w("Derselbe Vergleich an mehreren Stichtagen. Jeder Stichtag sieht ausschließlich Bars bis zu seinem eigenen Datum.");
  w();
  w("| Stichtag | Handelstage zurück | Titel | ρ `12M-1M` | Median Rang | P95 | ≥5 Pz | Dezil ab/zu |");
  w("|---|---:|---:|---:|---:|---:|---:|---|");
  for (const cutoff of study.cutoffs) {
    const m = cutoff.measures["12M-1M"] || cutoff.measures["12M"];
    if (!m || m.state) continue;
    w("| " + cutoff.cutoffDate + " | " + int(cutoff.tradingDaysBack) + " | " + int(cutoff.securitiesWithCutoff) + " | " +
      num(m.SPEARMAN_RANK_CORRELATION, 4) + " | " + int(m.MEDIAN_ABSOLUTE_RANK_CHANGE) + " | " +
      int(m.P95_RANK_CHANGE) + " | " + int(m.TITLES_MOVING_5_PERCENTILES) + " | " +
      int(m.topDecile.LEAVING) + " / " + int(m.topDecile.ENTERING) + " |");
  }
  w();
  const historical = study.cutoffs.filter((c) => !c.simulation.contemporaneousWithPublishedEvidence);
  if (historical.length) {
    w("An den historischen Stichtagen gibt es **keine** Strategiewirkung: die nicht-momentumbasierten Faktornoten liegen nur zu einem Stichtag vor, und sie auf ein früheres Datum zu legen wäre Future Leakage. Dort steht `" +
      historical[0].STRATEGY_IMPACT.reason + "` statt einer Zahl.");
    w();
  }
}

/* ----------------------------------------- 10 Gates */

if (study.dataFreshnessFindings && study.dataFreshnessFindings.length) {
  w("## 9b · Was die Messung begrenzt hat");
  w();
  for (const f of study.dataFreshnessFindings) {
    w("**`" + f.finding + "`** — die kanonische Historie endet am " + f.canonicalStoreLastDate +
      ", das veröffentlichte Factor Evidence trägt den Stichtag " + f.publishedEvidenceAsOf + ": " +
      int(f.lagDays) + " Tage Abstand. " + f.note);
    w();
  }
}

w("## 10 · Maschinenlesbarer Stand");
w();
w("| Flag | Wert |");
w("|---|---|");
for (const [key, value] of Object.entries(study.gateStatus)) {
  const text = value && typeof value === "object"
    ? Object.entries(value).map(([k, n]) => "`" + k + "` " + (finite(n) ? num(n, 4) : String(n))).join(" · ")
    : "`" + String(value) + "`";
  w("| `" + key + "` | " + text + " |");
}
w();
w("Artefakte: `" + AUDIT.replace(ROOT + "/", "") + "` · `" + STUDY.replace(ROOT + "/", "") + "`");
w();

/* ----------------------------------------- 11 Alternativen */

w("## 11 · Die drei Alternativen");
w();
w("Zur Entscheidung durch den Owner. Diese Studie legt keine davon fest; `QUANT_V2_MOMENTUM_RETURN_BASIS` steht auf **" +
  study.gateStatus.QUANT_V2_MOMENTUM_RETURN_BASIS + "**.");
w();
w("**A · Splitbereinigtes Kursmomentum.** Quant V2 Momentum rechnet auf Reihe A, wie Chart, Technical, Setup und Elliott. Ein Haus, eine Kursbasis; die Momentumnote ist dann dieselbe Bewegung, die der Nutzer im Chart sieht. Preis: Dividenden zählen im Momentum nicht mit, und die veröffentlichten Komponentennamen (`totalReturn12m1m`) müssten umbenannt werden, weil sie dann keine Gesamtrendite mehr sind.");
w();
w("**B · Gesamtrenditemomentum.** Quant V2 Momentum bleibt auf Reihe B — das ist die heute gerechnete Basis. Momentum misst dann, was ein Anleger wirklich verdient hat. Preis: zwei Komponenten der Note (`distanceTo52wHigh`, `distanceToSma200`) sind Kursstrukturmaße und stünden weiter auf einer Reihe, in der Dividenden den Abstand zum Hoch verändern.");
w();
w("**C · Getrennt geführt.** Kursmomentum als Faktor, Gesamtrendite als eigene, klar benannte Anlegerevidenz daneben. Der Faktor bleibt in derselben Welt wie die übrige Kursanalyse, und die Frage \"was hätte ich verdient\" bekommt ihre eigene Zahl statt in den Faktor hineingerechnet zu werden. Preis: zwei Größen statt einer, und die Oberfläche muss den Unterschied erklären können.");
w();
w("Welche Alternative die Zahlen oben stützen, steht bewusst nicht hier. Die Messung ist das Material der Entscheidung, nicht die Entscheidung.");
w();

writeFileSync(OUT, L.join("\n"));
process.stdout.write("Studiendokument gerendert: " + OUT.replace(ROOT + "/", "") + " (" + L.length + " Zeilen)\n");
