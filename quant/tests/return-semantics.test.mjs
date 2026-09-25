import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import contract from "../methodology/return-semantics-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Semantics = require("../engines/return-semantics.js");
const MarketFactors = require("../engines/market-factors.js");

const ROOT = new URL("../../", import.meta.url);
const bars = [{ close: 100, adjustedClose: 90 }, { close: 101, adjustedClose: 91 }];

test("the owner's split is written down machine-readably", () => {
  assert.deepEqual(Semantics.validate(contract), { valid: true, errors: [] });
  assert.equal(contract.approval.state, "APPROVED");
  assert.match(contract.approval.approvedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(
    { ...contract.gateStatus, note: undefined },
    { RETURN_SEMANTICS_CONTRACT_ACTIVE: "PASS",
      PRICE_MODULES_BASIS: "SPLIT_ADJUSTED_PRICE",
      PERFORMANCE_MODULES_BASIS: "TOTAL_RETURN",
      QUANT_V1: "LEGACY_IMMUTABLE",
      /* Owner-Entscheidung vom 2026-09-24, Option C: Kursstaerke und
         Anlegerrendite werden getrennt gefuehrt. */
      QUANT_V2_MOMENTUM_BASIS: "SPLIT_ADJUSTED_PRICE",
      QUANT_V2_MOMENTUM_DECISION: "APPROVED_2026-09-24_OPTION_C",
      TOTAL_RETURN_EVIDENCE: "SEPARATE",
      BACKTEST_RETURN_BASIS: "TOTAL_RETURN",
      PORTFOLIO_RETURN_BASIS: "TOTAL_RETURN",
      BENCHMARK_RETURN_BASIS: "TOTAL_RETURN",
      TECHNICAL_RETURN_BASIS: "SPLIT_ADJUSTED_PRICE",
      SETUP_RETURN_BASIS: "SPLIT_ADJUSTED_PRICE",
      ELLIOTT_RETURN_BASIS: "SPLIT_ADJUSTED_PRICE",
      /* 2026-09-25: eine widerlegte Gesamtrendite-Spalte sperrt die
         Gesamtrendite und nicht eine Reihe, die splitbereinigt
         rekonstruierbar ist. Die Pruefung selbst bleibt unveraendert -
         beides steht als Flag, damit es nicht aus Prosa gelesen werden
         muss. */
      REFUTED_TOTAL_RETURN_BLOCKS_ONLY_TOTAL_RETURN: "PASS",
      TOTAL_RETURN_VALIDATION_UNCHANGED: "PASS",
      note: undefined });
});

test("price modules take a price, performance modules take a total return", () => {
  /* The two halves of the decision, asserted as membership rather than
     restated as prose that can drift from the contract. */
  assert.deepEqual(Semantics.modulesByBasis("SPLIT_ADJUSTED_PRICE").sort(),
    ["chart", "elliott", "quantV2Momentum", "relativeStrengthBenchmark", "setup", "technical"]);
  assert.deepEqual(Semantics.modulesByBasis("TOTAL_RETURN").sort(),
    ["backtest", "benchmark", "investorReturnEvidence", "portfolioPerformance"]);
  for (const id of ["chart", "technical", "setup", "elliott", "relativeStrengthBenchmark", "quantV2Momentum"]) {
    assert.equal(Semantics.basisEntry(Semantics.requiredBasis(id)).includesDistributions, false, id);
  }
  for (const id of ["backtest", "portfolioPerformance", "benchmark", "investorReturnEvidence"]) {
    assert.equal(Semantics.basisEntry(Semantics.requiredBasis(id)).includesDistributions, true, id);
  }
});

test("a module is refused the wrong basis rather than quietly given it", () => {
  /* This is the whole contract in one assertion. Before it, priceBasis()
     took adjustedClose whenever a trustworthy adjusted column existed and
     did not distinguish split-adjusted from total-return. The provider
     reports splitAdjusted today, so nothing looked wrong; raising that to
     "adjusted" would have switched technical structure, setup states and
     momentum to total return with no code change and no published number
     announcing it. */
  assert.equal(MarketFactors.priceBasis(bars, "splitAdjusted", "technical"), "adjustedClose");
  assert.throws(() => MarketFactors.priceBasis(bars, "adjusted", "technical"),
    (error) => error.reason === "RETURN_BASIS_MISMATCH" &&
      error.wanted === "SPLIT_ADJUSTED_PRICE" && error.served === "TOTAL_RETURN");
  /* And symmetrically: a performance module may not be handed a price. */
  assert.equal(MarketFactors.priceBasis(bars, "adjusted", "backtest"), "adjustedClose");
  assert.throws(() => MarketFactors.priceBasis(bars, "splitAdjusted", "backtest"),
    (error) => error.reason === "RETURN_BASIS_MISMATCH");
});

test("the silent switch is impossible for every price module at once", () => {
  /* Named one by one, because a loop that ran over an empty list would
     pass just as loudly. */
  const priceModules = Semantics.modulesByBasis("SPLIT_ADJUSTED_PRICE");
  assert.ok(priceModules.length >= 4);
  for (const id of priceModules) {
    assert.throws(() => MarketFactors.priceBasis(bars, "adjusted", id),
      (error) => error.reason === "RETURN_BASIS_MISMATCH", id + " would silently switch to total return");
  }
});

test("Quant V1 is refused any basis at all", () => {
  /* Not "give it the old one": it is not this contract's to serve. A
     retroactive change to published V1 figures does not happen, whichever
     basis is better argued today. */
  assert.equal(Semantics.isLegacy("quantV1"), true);
  assert.equal(Semantics.requiredBasis("quantV1"), Semantics.LEGACY);
  const resolved = Semantics.resolveColumn("quantV1", "adjusted", true);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, "MODULE_IS_LEGACY_IMMUTABLE");
});

test("Quant V2 momentum is decided, and what it used to be is written down", () => {
  /* Die Entscheidung ist gefallen (Option C, 2026-09-24): Kursstaerke
     und Anlegerrendite werden getrennt gefuehrt. Entscheidend ist hier
     nicht, dass eine Basis dasteht, sondern dass die ALTE danebensteht.
     Der bisherige Bestand rechnete faktisch auf Gesamtrendite - waere
     das nicht festgehalten, waere die Umstellung genau die stille
     Umdefinition, die dieser Vertrag ausschliesst. */
  assert.equal(Semantics.isPending("quantV2Momentum"), false);
  assert.equal(Semantics.requiredBasis("quantV2Momentum"), "SPLIT_ADJUSTED_PRICE");
  const entry = Semantics.moduleEntry("quantV2Momentum");
  assert.equal(entry.decision.state, "APPROVED");
  assert.equal(entry.decision.approvedBasis, "SPLIT_ADJUSTED_PRICE");
  assert.equal(entry.decision.previousPublishedBasis, "TOTAL_RETURN");
  assert.ok(entry.decision.previousPublishedUnder,
    "Ohne die alte Methodikversion weiss niemand, unter welchem Contract die alte Bedeutung galt");
  assert.ok(entry.decision.whyTheChangeIsNotSilent.length > 120);
  assert.equal(entry.decision.boundToContract, true);
  /* Und die gemessene Wirkung steht dabei, nicht nur die Entscheidung. */
  assert.ok(entry.decision.measuredImpact.titlesMoving5Percentiles > 0);
  assert.ok(Array.isArray(entry.decision.evidence) && entry.decision.evidence.length > 0);
});

test("the investor return is separate evidence, not a factor component", () => {
  /* Der Kern von Option C. Wuerde die Anlegerrendite in den
     Momentumfaktor eingehen, waere die Trennung wieder aufgehoben - und
     niemand saehe es, weil der Faktor gleich heisst. */
  assert.equal(Semantics.requiredBasis("investorReturnEvidence"), "TOTAL_RETURN");
  const entry = Semantics.moduleEntry("investorReturnEvidence");
  assert.equal(entry.isFactorComponent, false);
  assert.equal(entry.notToBeConfusedWith, "quantV2Momentum");
  assert.ok(entry.notAFactorBecause.length > 60);
  assert.ok(entry.distinction.length > 80);
  /* Die beiden Module duerfen nie dieselbe Basis tragen - sonst messen
     sie dasselbe und die Trennung ist nur noch ein Name. */
  assert.notEqual(Semantics.requiredBasis("investorReturnEvidence"),
                  Semantics.requiredBasis("quantV2Momentum"));
});

test("an unmeasured module still cannot be bound, and the contract refuses one that is", () => {
  /* Der Waechter bleibt, auch wenn kein Modul ihn mehr ausloest: er gilt
     fuer jedes kuenftige Modul, dessen Basis noch niemand gemessen hat.
     Geprueft wird er deshalb an einem Klon, der in genau diesen Zustand
     zurueckversetzt wird. */
  const broken = structuredClone(contract);
  const entry = broken.modules.find((m) => m.id === "quantV2Momentum");
  entry.basis = "PENDING_METHODOLOGY_DECISION";
  entry.decision.currentPublishedBasis = Semantics.UNMEASURED;
  entry.decision.boundToContract = true;
  assert.match(Semantics.validate(broken).errors.join("; "), /must not be bound/);
  delete entry.decision.whyNotBound;
  entry.decision.boundToContract = false;
  assert.match(Semantics.validate(broken).errors.join("; "), /without saying why/);
});



test("the empirical comparison exists, and is honest about what it cannot decide", () => {
  const study = JSON.parse(readFileSync(new URL("quant/data/providers/momentum-return-basis-study.json", ROOT), "utf8"));
  assert.ok(study.seriesStudied >= 3);
  assert.equal(study.canDecideTheFactor, false);
  assert.match(study.whyNot, /Rangfolge|RANGFOLGE/);
  assert.ok(study.whatWouldDecideIt.length > 40);
  /* The direction it DOES establish: every series is higher on total
     return, and the gap follows the payout. A momentum factor on total
     return would carry a dividend tilt it does not have on price. */
  assert.equal(study.yieldTilt.everySeriesHigherOnTotalReturn, true);
  assert.ok(study.yieldTilt.spearmanYieldVsDifference >= 0.7,
    "the yield relationship this sample showed is gone");
  assert.ok(study.yieldTilt.reading.includes("Rangwirkung"));
  /* And it changed nothing. */
  assert.match(study.note, /aendert keinen veroeffentlichten Wert/);
});

test("historical universe membership is not substituted by the current one", () => {
  /* Stated by the owner as its own certification gap. The backtest's
     basis being settled must not read as the backtest being closer to
     open than it is. */
  const backtest = Semantics.moduleEntry("backtest");
  assert.equal(backtest.activation.state, "CLOSED");
  assert.equal(backtest.activation.reason, "HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING");
  assert.match(backtest.activation.note, /kein Freigabeschritt/);
  /* Asserted on what the checker OUTPUTS, not on how its source is
     written. A first attempt matched the source text and failed on a
     string concatenation - it was testing formatting, not meaning, and
     the message that matters is the one a reader gets. */
  const output = execFileSync(process.execPath, ["scripts/quant/assert-product-completeness.mjs"],
    { cwd: new URL(".", ROOT).pathname, encoding: "utf8" });
  assert.match(output, /BLOCKED/);
  assert.match(output, /BACKTEST · Backtest integration stays shut/);
  assert.match(output, /historical index membership \(1 snapshot per index\)/);
  assert.match(output, /No measurement creates it retroactively/);
  /* Und die entschiedene Return-Basis hat den Backtest nicht
     stillschweigend naeher an OPEN gerueckt: die Gesamtrendite wird
     getrennt gefuehrt, nicht gegen diesen Blocker verrechnet. Seit
     Option C ist sie ein eigenes Modul - dass es existiert, ist die
     Bedingung dafuer, dass die alte OPEN-Zeile verschwinden darf. */
  assert.equal(/BACKTEST[^\n]*\n[^\n]*total-return/.test(output), false,
    "total return is still counted against the backtest blocker");
  const contract = JSON.parse(readFileSync(new URL("quant/methodology/return-semantics-v1.json", ROOT), "utf8"));
  assert.ok(contract.modules.some((m) => m.id === "investorReturnEvidence" && m.basis === "TOTAL_RETURN"),
    "Ohne eigenes Anlegerrendite-Modul darf die offene Zeile nicht entfallen");
});

test("an existing caller that names no module keeps computing what it computed", () => {
  /* The contract is enforced where a module asks for it. Changing every
     unnamed caller at once would have been exactly the silent
     redefinition it forbids. */
  assert.equal(MarketFactors.priceBasis(bars, "splitAdjusted"), "adjustedClose");
  assert.equal(MarketFactors.priceBasis(bars, "adjusted"), "adjustedClose");
  assert.equal(MarketFactors.priceBasis([{ close: 100 }], "unknown"), "close");
});

test("the factor build is bound to the decided basis and constructs the series it needs", () => {
  /* Ein Vertrag, den niemand aufruft, ist ein Dokument. Er bindet an den
     beiden Stellen, auf die es ankommt: der Momentumfaktor und die
     Vergleichsreihe der relativen Staerke.

     Der Kern der Bindung ist, dass die verlangte Reihe KONSTRUIERT wird
     statt ersetzt. Der Anbieter liefert eine gesamtrenditebereinigte
     Spalte; die splitbereinigte entsteht aus Rohkurs und Splitfaktor. Wer
     beides nicht hat, bekommt einen Fehler und keinen Rueckfall. */
  const build = readFileSync(new URL("scripts/market/build-market-factors.mjs", ROOT), "utf8");
  assert.match(build, /module: "quantV2Momentum"/);
  assert.match(build, /"relativeStrengthBenchmark"/);
  assert.match(build, /investorReturn/);

  const series = JSON.parse(readFileSync(new URL("quant/data/market/golden-preview/daily/ref_MSFT.json", ROOT), "utf8"));

  /* Ohne Modul bleibt das alte Verhalten unveraendert - ein Aufrufer, der
     sich nicht benennt, rechnet weiter genau das, was er rechnete. */
  const before = MarketFactors.computeFactors({ ticker: "MSFT", bars: series.bars, adjustmentStatus: "splitAdjusted" }, {});
  assert.equal(before.status, "OK");
  assert.equal(before.basis, "adjustedClose");

  /* Mit Modul: die gesamtrenditebereinigte Spalte wird NICHT genommen,
     sondern die splitbereinigte Reihe rekonstruiert. */
  const bound = MarketFactors.computeFactors(
    { ticker: "MSFT", bars: series.bars, adjustmentStatus: "adjusted" }, { module: "quantV2Momentum" });
  assert.equal(bound.status, "OK");
  assert.equal(bound.returnBasis, "SPLIT_ADJUSTED_PRICE");
  assert.equal(bound.priceSource, "RECONSTRUCTED_FROM_SPLIT_FACTOR");

  /* Und sie ist wirklich eine andere Zahl als die Gesamtrendite - sonst
     waere die ganze Umstellung folgenlos und der Test bloss Dekoration. */
  const totalReturn = MarketFactors.computeFactors(
    { ticker: "MSFT", bars: series.bars, adjustmentStatus: "adjusted" }, { module: "backtest" });
  assert.equal(totalReturn.basis, "adjustedClose");
  assert.notEqual(bound.values.returns["12M"], totalReturn.values.returns["12M"]);
  assert.ok(totalReturn.values.returns["12M"] > bound.values.returns["12M"],
    "Die Anlegerrendite eines Dividendenzahlers muss ueber der Kursrendite liegen");

  /* Ohne Splitfaktor gibt es keinen Rueckfall auf die naechstbeste
     Spalte, sondern eine Verweigerung mit Grund. */
  const ohneSplitfaktor = series.bars.map((b) => ({ ...b, splitFactor: undefined }));
  assert.throws(
    () => MarketFactors.computeFactors({ ticker: "MSFT", bars: ohneSplitfaktor, adjustmentStatus: "adjusted" },
      { module: "quantV2Momentum" }),
    (error) => error.reason === "SPLIT_ADJUSTED_PRICE_NOT_CONSTRUCTIBLE");

  /* Und die Gegenrichtung bleibt: ein Performancemodul bekommt keinen
     reinen Kurs untergeschoben. */
  assert.throws(() => MarketFactors.computeFactors(
    { ticker: "MSFT", bars: series.bars, adjustmentStatus: "splitAdjusted" }, { module: "backtest" }),
    (error) => error.reason === "RETURN_BASIS_MISMATCH");
});

test("the two split-adjusted reconstructions are one truth", () => {
  /* market-factors rekonstruiert aus der splitFactor-Spalte,
     canonical-bars aus den Corporate Actions. Zwei Wege zur selben
     Kurswelt sind in Ordnung; zwei ERGEBNISSE waeren es nicht - dann
     haette die Technical-Seite eine andere splitbereinigte Reihe als der
     Momentumfaktor, und niemand saehe es. */
  const Canonical = require("../engines/technical/canonical-bars.js");
  for (const ticker of ["AAPL", "JPM", "MSFT", "NVDA", "XOM"]) {
    const url = new URL(`quant/data/market/golden-preview/daily/ref_${ticker}.json`, ROOT);
    const payload = JSON.parse(readFileSync(url, "utf8"));
    const actions = payload.bars.filter((b) => b.splitFactor !== 1)
      .map((b) => ({ type: "split", exDate: b.date, ratio: b.splitFactor }));
    const canonical = Canonical.fromPriceBars(payload.bars, actions, { instrumentId: "ref_" + ticker }).SPLIT_ADJUSTED.close;
    const constructed = MarketFactors.priceSeries(payload.bars, payload.adjustmentStatus, "quantV2Momentum").close;
    for (let i = 0; i < canonical.length; i++) {
      if (!Number.isFinite(canonical[i]) || !Number.isFinite(constructed[i])) continue;
      const relative = Math.abs(canonical[i] - constructed[i]) / canonical[i];
      assert.ok(relative < 1e-6,
        `${ticker} am ${payload.bars[i].date}: ${canonical[i]} gegen ${constructed[i]}`);
    }
  }
});


test("the relative-strength series is not the performance benchmark", () => {
  /* Both are called "Vergleichsindex" and they mean different things.
     Relative strength compares price movement with price movement;
     the performance benchmark compares what an investor earned. Using one
     series for both is exactly the confusion this contract separates -
     and the distinction was missing from the contract until wiring it up
     surfaced the gap. */
  assert.equal(Semantics.requiredBasis("relativeStrengthBenchmark"), "SPLIT_ADJUSTED_PRICE");
  /* Seit der Owner-Entscheidung gebunden: relative Staerke ist eine
     Momentumkomponente, und Titel- und Vergleichsreihe muessen dieselbe
     Basis tragen - sonst misst die Differenz die Dividendenrendite des
     Index mit. */
  assert.equal(Semantics.moduleEntry("relativeStrengthBenchmark").boundToContract, true);
  assert.equal(Semantics.requiredBasis("benchmark"), "TOTAL_RETURN");
  const entry = Semantics.moduleEntry("relativeStrengthBenchmark");
  assert.equal(entry.notToBeConfusedWith, "benchmark");
  assert.ok(entry.distinction.length > 80);
});
