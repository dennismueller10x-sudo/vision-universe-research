#!/usr/bin/env node
/* =========================================================================
   WAS DIE UMSTELLUNG WIRKLICH GEAENDERT HAT — Punkt 9 der Owner-Entscheidung.

   Vergleicht die letzte Beobachtung der alten Methodikversion mit der
   der neuen. Beide liegen als eigene Reihen in der Snapshot-Historie;
   keine wird dafuer neu gerechnet, keine ueberschrieben.

   WAS DIESES SKRIPT BEANTWORTET

   - Abdeckung: hat die neue Basis Titel gekostet oder gebracht?
   - Rangverschiebung: wie weit bewegt sich die Momentumnote wirklich?
   - Die Gegenprobe: bewegen sich die SECHS ANDEREN Faktoren auch? Sie
     sollten es nicht. Tun sie es doch, ist entweder etwas
     durchgesickert, oder die Perzentile haben sich durch eine
     veraenderte Abdeckung mitverschoben - beides will man wissen und
     nicht annehmen.
   - Strategiezugehoerigkeit: wer faellt aus einem Stil heraus, wer kommt
     hinzu, und wie heissen sie.

   Was es NICHT tut: irgendetwas veraendern. Es liest zwei
   veroeffentlichte Beobachtungen und schreibt einen Bericht.
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Compare = require(join(ROOT, "quant/engines/return-basis-comparison.js"));

function arg(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}
const HISTORY = arg("--history", join(ROOT, "quant/data/product/factor-evidence-history"));
const OUT = arg("--out", join(ROOT, "quant/data/product/methodology-change-v1.json"));
const FROM = arg("--from", "vu-factor-evidence-1.0.0");
const TO = arg("--to", "vu-factor-evidence-2.0.0");

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d) => (finite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

function latestSnapshot(version) {
  const dir = join(HISTORY, version);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort();
  if (!files.length) return null;
  const name = files[files.length - 1];
  return { version, date: name.replace(".json.gz", ""),
           payload: JSON.parse(zlib.gunzipSync(readFileSync(join(dir, name)))) };
}

function strategyProfiles() {
  const payload = JSON.parse(readFileSync(join(ROOT, "quant/methodology/strategy-profiles-v1.json"), "utf8"));
  return payload.profiles || [];
}

/* Ein Profil gegen eine Beobachtung. Ein Titel ohne Wert erfuellt die
   Bedingung NICHT - er faellt nicht durch, weil er schlecht ist, sondern
   weil er nicht gemessen ist, und beides gleich zu behandeln waere eine
   erfundene Aussage. */
function members(profile, snapshot, index) {
  const out = [];
  for (const [ticker, row] of Object.entries(snapshot.payload.rows)) {
    let ok = true;
    for (const condition of profile.conditions) {
      const at = index[String(condition.field)];
      if (at === undefined) { ok = false; break; }
      const value = row[at];
      if (!finite(value)) { ok = false; break; }
      if (condition.operator === "gte" && !(value >= condition.value)) { ok = false; break; }
      if (condition.operator === "lte" && !(value <= condition.value)) { ok = false; break; }
    }
    if (ok) out.push(ticker);
  }
  return out;
}

function main() {
  const from = latestSnapshot(FROM);
  const to = latestSnapshot(TO);
  if (!from || !to) {
    process.stdout.write("Vergleich nicht moeglich: " +
      (!from ? FROM : TO) + " hat noch keine Beobachtung.\n");
    /* Kein Fehler. Vor der ersten Materialisierung der neuen Methodik
       ist das der normale Zustand, und ein Abbruch waere nur laut. */
    return;
  }

  const fieldIndex = (snapshot) => Object.fromEntries(
    snapshot.payload.fields.map((id, at) => [id, at]));
  const fromIndex = fieldIndex(from), toIndex = fieldIndex(to);

  /* Verglichen wird die Schnittmenge. Titel, die nur eine Seite kennt,
     sind eine Abdeckungsaenderung und keine Rangverschiebung - beides
     wird getrennt gezaehlt. */
  const fromTickers = new Set(Object.keys(from.payload.rows));
  const toTickers = new Set(Object.keys(to.payload.rows));
  const shared = [...fromTickers].filter((t) => toTickers.has(t)).sort();

  const factors = ["quality", "growth", "momentum", "value", "profitability", "revisions", "risk"];
  const drift = {};
  for (const factor of factors) {
    const field = "quantV2.factorEvidence." + factor;
    const a = fromIndex[field], b = toIndex[field];
    if (a === undefined || b === undefined) { drift[factor] = { state: "FIELD_MISSING" }; continue; }
    const before = Compare.rankField(shared.map((t) => from.payload.rows[t][a]));
    const after = Compare.rankField(shared.map((t) => to.payload.rows[t][b]));
    const stats = Compare.shiftStatistics(before, after);
    const churn = Compare.decileChurn(before, after);
    const identical = shared.every((t, i) =>
      from.payload.rows[t][a] === to.payload.rows[t][b]);
    drift[factor] = {
      scoredBefore: before.n, scoredAfter: after.n,
      valuesIdentical: identical,
      UNIVERSE_N: stats.UNIVERSE_N,
      SPEARMAN_RANK_CORRELATION: round(stats.SPEARMAN_RANK_CORRELATION, 6),
      MEDIAN_ABSOLUTE_RANK_CHANGE: round(stats.MEDIAN_ABSOLUTE_RANK_CHANGE, 1),
      P95_RANK_CHANGE: round(stats.P95_RANK_CHANGE, 1),
      MAX_RANK_CHANGE: round(stats.MAX_RANK_CHANGE, 1),
      TITLES_MOVING_5_PERCENTILES: stats.TITLES_MOVING_5_PERCENTILES,
      TITLES_MOVING_10_PERCENTILES: stats.TITLES_MOVING_10_PERCENTILES,
      TOP_DECILE_LEAVING: churn.LEAVING,
      TOP_DECILE_ENTERING: churn.ENTERING
    };
  }

  const strategyImpact = {};
  for (const profile of strategyProfiles()) {
    const before = members(profile, from, fromIndex);
    const after = members(profile, to, toIndex);
    const setBefore = new Set(before), setAfter = new Set(after);
    const leaving = before.filter((t) => !setAfter.has(t));
    const entering = after.filter((t) => !setBefore.has(t));
    strategyImpact[profile.profileId] = {
      label: profile.label,
      MEMBERS_BEFORE: before.length,
      MEMBERS_AFTER: after.length,
      LEAVING: leaving.length,
      ENTERING: entering.length,
      /* Vollstaendig, nicht als Beispiel: bei diesen Groessenordnungen
         passt die Liste in den Bericht, und eine gekuerzte Liste laedt
         dazu ein, ihre Laenge fuer die Antwort zu halten. */
      leavingTickers: leaving,
      enteringTickers: entering
    };
  }

  const report = {
    schemaVersion: "methodology-change-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    versions: { measurement_logic: "1.0.0", comparison: Compare.ENGINE_VERSION },
    change: {
      from: { methodologyVersion: from.version, derivedFrom: from.payload.derivedFrom, asOf: from.date },
      to: { methodologyVersion: to.version, derivedFrom: to.payload.derivedFrom, asOf: to.date },
      what: "Momentum von TOTAL_RETURN auf SPLIT_ADJUSTED_PRICE; Gesamtrendite als eigene Anlegerevidenz.",
      decidedBy: "Owner, 2026-09-24, Option C"
    },
    coverage: {
      ROWS_BEFORE: fromTickers.size,
      ROWS_AFTER: toTickers.size,
      SHARED: shared.length,
      ONLY_BEFORE: [...fromTickers].filter((t) => !toTickers.has(t)).length,
      ONLY_AFTER: [...toTickers].filter((t) => !fromTickers.has(t)).length,
      onlyBeforeTickers: [...fromTickers].filter((t) => !toTickers.has(t)).slice(0, 50),
      onlyAfterTickers: [...toTickers].filter((t) => !fromTickers.has(t)).slice(0, 50)
    },
    RANK_DRIFT: drift,
    STRATEGY_IMPACT: strategyImpact,
    /* WAS DIESER VERGLEICH NICHT TRENNEN KANN

       Die beiden Beobachtungen stammen von verschiedenen Tagen und aus
       einem veraenderten Universum. Damit steckt in jeder Zahl hier
       BEIDES: die Methodikaenderung und zwei Tage Marktbewegung samt
       Abdeckungswechsel. Perzentile sind relativ - faellt ein Titel aus
       dem Universum, bewegt sich jeder andere Rang ein Stueck.

       Das ist keine Schwaeche, die man wegschreibt, sondern eine, die
       man misst. Die sechs Faktoren, die die Methodik NICHT angefasst
       hat, sind dafuer der Kontrollversuch: was sie sich bewegen, ist
       reine Datenlage. Was Momentum darueber hinaus tut, ist die
       Methodik.

       Die saubere, unkonfundierte Messung der Methodikwirkung steht
       woanders: die Full-Universe-Studie hat beide Basen am SELBEN
       Stichtag ueber dasselbe Universum gerechnet. */
    confounding: (() => {
      const kontrollen = factors.filter((f) => f !== "momentum" && drift[f] &&
        !drift[f].state && drift[f].valuesIdentical === false)
        .map((f) => drift[f].MEDIAN_ABSOLUTE_RANK_CHANGE).filter(finite);
      const median = kontrollen.length
        ? kontrollen.slice().sort((a, b) => a - b)[Math.floor(kontrollen.length / 2)] : null;
      const momentumMedian = drift.momentum && !drift.momentum.state
        ? drift.momentum.MEDIAN_ABSOLUTE_RANK_CHANGE : null;
      return {
        sameDay: from.date === to.date,
        sameUniverse: shared.length === fromTickers.size && shared.length === toTickers.size,
        daysApart: Math.round((Date.parse(to.date + "T00:00:00Z") -
                               Date.parse(from.date + "T00:00:00Z")) / 86400000),
        CONTROL_FACTOR_MEDIAN_RANK_CHANGE: median,
        MOMENTUM_MEDIAN_RANK_CHANGE: momentumMedian,
        MOMENTUM_OVER_CONTROL: finite(median) && median > 0 && finite(momentumMedian)
          ? round(momentumMedian / median, 1) : null,
        note: "Die sechs nicht geaenderten Faktoren sind der Kontrollversuch. Ihre Bewegung ist Datenlage und Abdeckung, nicht Methodik. Nur der Abstand dazwischen gehoert der Umstellung.",
        cleanMeasurement: "docs/VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md - dort beide Basen am selben Stichtag ueber dasselbe Universum."
      };
    })(),
    /* Bewegt sich ausser Momentum noch etwas? Die Frage bleibt wichtig,
       aber die Antwort ist nur zusammen mit dem Konfundierungsblock
       lesbar: eine kleine Bewegung ist Datenlage, eine grosse waere ein
       Leck. */
    unexpectedFactorMovement: factors
      .filter((f) => f !== "momentum" && drift[f] && drift[f].valuesIdentical === false)
      .map((f) => ({ factor: f, titlesMoving5Percentiles: drift[f].TITLES_MOVING_5_PERCENTILES,
                     medianRankChange: drift[f].MEDIAN_ABSOLUTE_RANK_CHANGE,
                     spearman: drift[f].SPEARMAN_RANK_CORRELATION }))
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");

  process.stdout.write("METHODIKWECHSEL " + from.version + " (" + from.date + ")  ->  " +
    to.version + " (" + to.date + ")\n");
  process.stdout.write("  Abdeckung: " + report.coverage.ROWS_BEFORE + " -> " + report.coverage.ROWS_AFTER +
    " · gemeinsam " + report.coverage.SHARED +
    " · nur vorher " + report.coverage.ONLY_BEFORE + " · nur nachher " + report.coverage.ONLY_AFTER + "\n");
  for (const factor of factors) {
    const d = drift[factor];
    if (!d || d.state) { process.stdout.write("  " + factor.padEnd(14) + (d && d.state) + "\n"); continue; }
    process.stdout.write("  " + factor.padEnd(14) +
      (d.valuesIdentical ? "unveraendert" :
        "rho=" + String(d.SPEARMAN_RANK_CORRELATION).padEnd(9) +
        " med=" + String(d.MEDIAN_ABSOLUTE_RANK_CHANGE).padStart(5) +
        " p95=" + String(d.P95_RANK_CHANGE).padStart(6) +
        " >=5Pz=" + String(d.TITLES_MOVING_5_PERCENTILES).padStart(5) +
        " Dezil ab/zu=" + d.TOP_DECILE_LEAVING + "/" + d.TOP_DECILE_ENTERING) + "\n");
  }
  const k = report.confounding;
  if (!k.sameDay || !k.sameUniverse) {
    process.stdout.write("  Konfundiert: " + k.daysApart + " Tage auseinander" +
      (k.sameUniverse ? "" : ", Universum veraendert") +
      " · Kontrollfaktoren bewegen sich " + k.CONTROL_FACTOR_MEDIAN_RANK_CHANGE +
      " Raenge (Median), Momentum " + k.MOMENTUM_MEDIAN_RANK_CHANGE +
      (k.MOMENTUM_OVER_CONTROL ? " (" + k.MOMENTUM_OVER_CONTROL + "-fach)" : "") + "\n");
  }
  if (report.unexpectedFactorMovement.length) {
    process.stdout.write("  Auch bewegt (Datenlage, siehe Konfundierung): " +
      report.unexpectedFactorMovement.map((x) => x.factor + " " + x.medianRankChange).join(" · ") + "\n");
  }
  for (const [id, impact] of Object.entries(strategyImpact)) {
    process.stdout.write("  " + id.padEnd(22) +
      String(impact.MEMBERS_BEFORE).padStart(5) + " -> " + String(impact.MEMBERS_AFTER).padStart(5) +
      "  ab " + String(impact.LEAVING).padStart(3) + "  zu " + String(impact.ENTERING).padStart(3) + "\n");
  }
  process.stdout.write("  Bericht: " + OUT.replace(ROOT + "/", "") + "\n");
}

main();
