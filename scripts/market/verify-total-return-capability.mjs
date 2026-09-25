#!/usr/bin/env node
/* =========================================================================
   Measure whether the provider's adjusted series is total-return adjusted.

   WHY THIS EXISTS

   quant/data/providers/qualification.json carried "Nicht geprueft." for
   both `dividends` and `totalReturnPrices`, so the capability stood at
   UNKNOWN. The adapter nulls adjustedClose unless the capability says
   "adjusted", the pipeline therefore only ever published SPLIT_ADJUSTED
   series, and the backtest gate recorded "no total-return price series"
   as a missing input.

   That was wrong, and wrong in a specific way worth naming: the question
   had never been asked. The data was there the whole time. Every bar
   carries splitFactor and dividend precisely so this can be settled from
   evidence - the adapter says so itself: "Wer spaeter fragt, ob eine Reihe
   hochgestuft werden kann, findet die Antwort in splitFactor und dividend
   - nicht in einer Annahme."

   THE TEST

   On an ex-dividend day a split-only adjustment leaves adjClose/close
   unchanged from the previous day. A total-return adjustment steps that
   ratio by exactly (1 - dividend / previous close), because the dividend
   is treated as reinvested. So:

       (adjClose_prev / close_prev) / (adjClose_now / close_now)
         should equal 1 - dividend / close_prev

   Days carrying a split are skipped: two adjustments at once would not
   separate cleanly, and a test that cannot attribute its result proves
   nothing.

   This reads only committed files. It makes no provider call and changes
   no published value: it answers a question, and what follows from the
   answer is a separate decision.
   ========================================================================= */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAILY = join(ROOT, "quant/data/market/golden-preview/daily");
const OUT = join(ROOT, "quant/data/providers/total-return-verification.json");

/* A relative error this far above float noise would mean the adjustment is
   doing something else; below it, the dividend is accounted for. */
const TOLERANCE = 0.002;

function verify(bars) {
  const events = [];
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const previous = bars[i - 1];
    if (!(bar.dividend > 0)) continue;
    if (bar.splitFactor !== 1) continue;
    if (!(bar.adjustedClose > 0 && previous.adjustedClose > 0 && bar.close > 0 && previous.close > 0)) continue;
    const observed = (previous.adjustedClose / previous.close) / (bar.adjustedClose / bar.close);
    const expected = 1 - bar.dividend / previous.close;
    const error = Math.abs(observed - expected) / expected;
    events.push({ date: bar.date, dividend: bar.dividend, observed, expected, error, matches: error < TOLERANCE });
  }
  return events;
}

function main() {
  if (!existsSync(DAILY)) throw new Error("no golden preview series to verify against: " + DAILY);
  const series = [];
  let checked = 0;
  let matched = 0;
  let worst = 0;

  for (const file of readdirSync(DAILY).filter((f) => f.endsWith(".json")).sort()) {
    const payload = JSON.parse(readFileSync(join(DAILY, file), "utf8"));
    const events = verify(payload.bars || []);
    checked += events.length;
    matched += events.filter((e) => e.matches).length;
    for (const event of events) worst = Math.max(worst, event.error);
    series.push({
      securityId: payload.securityId,
      ticker: payload.ticker,
      adjustmentStatusClaimed: payload.adjustmentStatus,
      barCount: (payload.bars || []).length,
      from: payload.first || null,
      to: payload.last || null,
      dividendEvents: events.length,
      matching: events.filter((e) => e.matches).length,
      worstError: events.length ? Math.max(...events.map((e) => e.error)) : null,
      /* Named, not counted away: an event that does not match is the one
         thing a reader of this report needs to see. */
      mismatches: events.filter((e) => !e.matches).map((e) => ({ date: e.date, dividend: e.dividend, error: e.error }))
    });
  }

  /* Below this, a clean run says more about the sample than about the
     provider. Stated rather than left to the reader's judgement. */
  const MINIMUM_EVENTS = 30;
  const verdict = checked < MINIMUM_EVENTS ? "INSUFFICIENT_EVIDENCE"
    : matched === checked ? "TOTAL_RETURN_CONFIRMED"
    : matched === 0 ? "SPLIT_ADJUSTED_ONLY"
    : "INCONSISTENT";

  const report = {
    schemaVersion: "total-return-verification-1.0.0",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    versions: { verification_logic: "1.0.0" },
    method: "Auf einem Ex-Dividenden-Tag springt das Verhaeltnis adjClose/close um genau (1 - Dividende / Vortagsschluss), wenn die Reihe total-return-bereinigt ist. Bei reiner Splitbereinigung bleibt es unveraendert. Tage mit Split werden uebersprungen, weil zwei gleichzeitige Anpassungen sich nicht sauber trennen lassen.",
    tolerance: TOLERANCE,
    minimumEvents: MINIMUM_EVENTS,
    source: "quant/data/market/golden-preview/daily",
    seriesChecked: series.length,
    dividendEventsChecked: checked,
    dividendEventsMatching: matched,
    worstRelativeError: worst,
    verdict,
    note: "Nur eine Messung. Sie aendert keinen veroeffentlichten Wert und keine Kapabilitaet; was daraus folgt, ist eine eigene Entscheidung mit eigener Version.",
    series
  };

  writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n");
  process.stdout.write("Total-Return-Verifikation · " + series.length + " Reihen · " +
    matched + "/" + checked + " Dividendenereignisse stimmen · groesster Fehler " +
    (worst * 100).toFixed(3) + " %\n  Befund: " + verdict + "\n");
  for (const row of series) {
    process.stdout.write("  " + String(row.ticker).padEnd(6) + row.matching + "/" + row.dividendEvents +
      "  " + row.from + " → " + row.to + "  behauptet: " + row.adjustmentStatusClaimed + "\n");
  }
  if (verdict === "INCONSISTENT") process.exit(1);
}

main();
