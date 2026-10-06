# Quant 2.0 — Pattern Research (M4)

`pattern-research-1.0.0` · engine `quant/engines/pattern-research.js` · study
`quant/data/product/pattern-research-v1/study.json`

## The question, and the question it is not

**Asked:** did titles that later rose a great deal look different *beforehand* from titles that
did not — measurably, across many cases, without hindsight?

**Not asked, and not answerable here:** whether any title will rise; how a strategy on a pattern
would have performed; which title is the next big winner. No field in the study carries a
forecast, and the publication gate throws on `prediction`, `forecast`, `probabilityOfSuccess`,
`expectedReturn`, `targetPrice` or `recommendation`.

## A correction that came first

The orchestrator state file said M4 was blocked: outcome labels over 12–60 months need deep
price history, the repository publishes 270 bars per title, the deep history lives in private R2.

That was wrong. It reasoned from the technical bundles and never checked what else was in the
repository. `quant/data/market/discover-series-long/` holds **6,308 titles of weekly
split-adjusted closes at MAX range** — 618 of them starting in 1990, an average of 763 weekly
points (about 14.7 years), up to 1,915 (about 36.8 years). It is the Discovery workstream's
canonical output, committed, and read here without a single write. M4 needed no R2 restore and
no credentials. It needed someone to measure what was already there.

## No pipeline, no Discovery change

The study reads two files: the canonical weekly series and its own pre-registration. It calls no
provider, fetches no history, writes nothing into Discovery's artifacts and creates no second
source of truth. It is wired into `product-intelligence-materialization.yml` beside the other
product-layer materializations.

## How hindsight is kept out — enforced, not promised

**The leakage contract is a check, not a comment.** A feature may read the series only up to and
including `t`; an outcome only strictly after `t`. Three tests hold it, and they are built to
fail loudly:

- truncating the series immediately after `t` must not change a single feature;
- overwriting everything after `t` with `1e9` must not change a single feature;
- overwriting everything before `t` must not change the outcome.

**The forbidden-feature list is enforced by absence.** Today's sector, index membership, market
cap and share count are future knowledge at a historical `t`. Market cap in particular would need
the share count *of that date*, and no such series exists here — so there is **no size feature**
rather than a wrong one. A test asserts none of the forbidden names is produced.

**A missing outcome is not a loss.** If a series ends before the horizon closes, the observation
is `OUTCOME_UNAVAILABLE`. It counts as neither winner nor non-winner and its number is reported.
Folding it into the non-winners would invent an observation and would flatter every pattern.

**Walk-forward folds are purged.** An observation whose outcome window still runs when the test
block opens is removed from training. Without that embargo train and test share the same future
and "out-of-sample" is a restatement of the training result. A test asserts that every training
observation satisfies `t + horizon < testStart` and that the embargo actually removed something.

**Hypotheses are pre-registered and counted.** The candidate list lives in
`quant/methodology/pattern-research-v1.json` and is fixed before measurement. Interactions are
pairs of those candidates — never a free search of the feature space, because whoever searches
long enough finds a pattern in any dataset and a correction can only correct what was counted.
Benjamini-Hochberg runs over the hypotheses that had enough support to be tested at all.

## Winners and non-winners, from one population

Every title with enough history at `t` is in the population. There is no curated list of famous
names. A pattern is reported only above **200 cases and 20 winners**; below that it is
`INSUFFICIENT_SUPPORT` and stays visible as such rather than being dropped, because a silently
filtered list is its own kind of cherry pick.

The study names no instrument at all. A test asserts the published JSON contains no ticker
field — a pattern is a population statement, so a single title in there would be the cherry pick
by construction.

## Both sides of every pattern

A pattern under which titles double more often **and** halve more often is not a better pattern.
Every finding therefore carries, beside its win statistics:

- `conditionalLossRate` and `lossLift` — the share that lost half or more, and its lift;
- `medianForwardReturn` — the median case, not the tail;
- `medianMaxDrawdownWithinHorizon` — what holding it felt like;
- `medianForwardReturnNetOfFrictions` — 20 bps round trip plus 10 bps slippage.

The frictions block is explicitly **not** an execution methodology. Its purpose is that a later
backtest stage cannot argue from a gross number.

## What the study does not claim to know

**Survivorship bias is present and partly unquantifiable.** The long series exist only for titles
the provider carries today. A company delisted in 2011 has no file and appears in no historical
cross-section. The security master lists 224 inactive titles; how many issuers vanished before it
was built is written nowhere in this repository.

This pushes absolute winner rates **upward**. It largely cancels in the **lift**, because the
same distortion sits in numerator and denominator — which is why lift is the reported headline
and the absolute rate, though published, carries this statement in a field on every study. A
publication gate rejects a study that omits it.

**Observations overlap.** The grid is monthly, the horizons are multi-year, so consecutive
observations of one title share almost all of their outcome. Nominal p-values therefore
understate uncertainty systematically. They are in the artifact, but they are not the criterion:
the criterion is lift in the purged out-of-sample block.

**Split-adjusted, not total return.** Dividends are not in these series. A high-payout title is
systematically weaker here than its true total return. This applies to winners and non-winners
alike and is not replaced by an estimate.

## Verdicts

Each pattern gets exactly one, in this order:

| Verdict | Meaning |
|---|---|
| `INSUFFICIENT_SUPPORT` | below 200 cases or 20 winners — not tested, not corrected, not counted |
| `NOT_SIGNIFICANT` | did not survive Benjamini-Hochberg over the tested hypotheses |
| `IN_SAMPLE_ONLY` | significant, but out-of-sample lift at or below 1 — it does not hold out |
| `PARAMETER_SENSITIVE` | holds out, but the lift moves more than 50 % across the threshold sweep |
| `ROBUST` | significant, out-of-sample lift above 1, and stable across the sweep |

`ROBUST` is the only verdict that means anything, and the publication gate refuses a finding
labelled `ROBUST` without an out-of-sample lift above 1.

## Parameter stability

Every candidate threshold is scaled by 0.8, 0.9, 1.0, 1.1 and 1.25 and the pattern is re-measured
at each. A pattern whose lift only holds at exactly one setting is fitted to this dataset, and is
marked `PARAMETER_SENSITIVE` rather than reported as a finding.

## The fast path has to prove itself

Running a hundred-odd patterns over a million observations needs more than the readable
implementation. Each observation is reduced once to two integers — which pre-registered
candidates it matches, and which of them were measurable — so a pattern test becomes two integer
ANDs. The all-time-peak lookup became a prefix-max array read instead of a scan.

Both are optimisations, not second definitions. A test builds observations **from the real
published series** and asserts that `evaluateMasked` returns exactly what `evaluatePattern`
returns, field by field, for every candidate and for an interaction. A fast path that agrees on a
fixture and diverges on production data is the worst kind of bug, because every number
downstream still looks plausible.

---

# The second family: PIT fundamental overlay

`pattern-research-fundamentals-1.0.0` · reader
`quant/engines/pit-fundamental-history.js` · study
`quant/data/product/pattern-research-fundamentals-v1/study.json`

The price study asks what the *chart* looked like before a title ran. This one asks what the
*company* looked like — and, in the cross pairs, whether a business property adds anything on
top of what the chart already said.

## Why it is a separate family and a separate version

Writing these candidates into the price study would have changed that study's hypothesis count
*after* it had been measured, and a correction over a retroactively changed count is not a
correction. The price study stays at `pattern-research-1.0.0`, unchanged and not restated. This
family has its own file, its own version and its own Benjamini-Hochberg correction over its own
hypotheses: fundamental singles, fundamental pairs, and cross pairs of one price with one
fundamental condition.

## Point-in-time means the filing date

A fiscal year becomes visible on the day it was **filed**, not on the day it ended. A 2019
balance sheet filed in March 2020 was not knowable in January 2020, and a January 2020
observation does not read it. Reading by fiscal-year end instead would hand every historical
observation a document that did not exist yet.

Restatements follow the same rule: what is visible at `t` is the newest filing made *at or
before* `t`. A later correction of the same fiscal year does not reach back into an earlier
observation. A test asserts both — including that nothing is visible the day before an issuer's
own first filing.

**Growth is selected by fiscal year, never by list position.** A company with a gap in its filed
history would otherwise have `rows[3]` be four years back, and a three-year growth rate would
quietly be a four-year one — a mismatch that never shows up as an error, only as a slightly
wrong number in everything downstream. A test caught exactly this during development.

## What the population is, and is not

Observations are restricted to dates where at least one filing was visible, and the base rate is
computed over **that** population. A lift against a base rate from a different population is not
a lift. Because filings reach useful breadth only from about 2017, this family's observation
window starts in 2018 — far shorter than the price study's, covering few market phases, with
four walk-forward blocks rather than five. That is in the artifact, and it is not a detail.

## One feature family deliberately left out

`total_debt`, `net_debt` and `roic` are excluded. They are the components behind the open
`COMPONENT_INPUT_NARROW` gate and cover a fraction of issuers; a condition containing one would
be unmeasurable for most titles and would silently narrow the sample to the well-tagged
issuers. It is left out rather than filled in, and a test asserts no finding uses one.

## The incremental question

For every cross pair the study reports the lift of **each half** beside the lift of the pair,
plus `incremental` (pair lift ÷ better half) and `addsOverBetterHalf`. Without it, a cross pair
that merely repeats its stronger half would read as a discovery.

---

# What the numbers actually say

This is the part that matters, and it is not the story anyone expects.

## Doubling frequency is mostly a volatility statistic

Over 24 months, in the price study, the patterns with the **highest** lift on "doubled" are all
variations of *beaten down and volatile*: far below the 52-week high, deep drawdown, wide
52-week range, high volatility, weak 12-month momentum. They raise the chance of a double from
the 10.9 % base rate to 23–26 %.

They raise the chance of **losing half** by very nearly the same factor — from an 11.5 % base to
26–30 %. Their **median** outcome is around 0 % to −6 % over two years, against +8.9 % for the
population, and the median worst drawdown along the way is −63 % to −68 %.

So the pattern that finds the next double is the same pattern that finds the next halving, and
the typical title carrying it does *worse* than an average one. This is why every finding
carries `asymmetry` = lift ÷ loss lift as its own field. Reporting the upside alone would have
been the whole trick.

## The "buy what already ran" story does worst of all

`very-strong-12m-momentum` — up 100 % or more over the prior year — has a doubling lift of
**1.27** and a loss lift of **2.27**. It is the worst asymmetry in the pre-registered set. The
narrative that picks one famous name that kept running is not what the population shows.

And the opposite corner is just as clear: `near-52w-high` (0.66), `at-all-time-high` (0.58),
`quiet-range` (0.45) and `low-volatility` (0.27) all double *less* often than average — and lose
half less often too. None of them held out of sample.

## Where something does tilt up

Only a handful of robust patterns have `asymmetry` meaningfully above 1, and they share a shape:
**washed out, but turning**.

- `quiet-range + high-volatility` — lift 2.12, loss lift 1.08, median +19 %, median drawdown
  −46 %. The one clearly asymmetric pattern, on thin support (477 cases) and with an
  out-of-sample lift of 1.68, well below its in-sample number.
- `weak-12m-momentum + six-month-thrust` and `+ three-month-thrust` — lift ≈ 2.05, loss lift
  ≈ 1.80, median +12 % to +14 %.

## What the fundamental overlay says — and a correction

An early smoke run over 400 series suggested that revenue growth was what the cross pairs were
picking up. **At full scale that is not what the data says, and the smoke run was never a
result.** It is recorded here because the difference is the point: a limited run is a check that
the code works, not a finding.

Over 4,209 issuers and 323,360 observations from 2018, base rate 11.56 % and base loss rate
14.62 %, the fundamental singles rank like this by asymmetry:

| Condition | lift | loss lift | asymmetry | median 24M |
|---|---|---|---|---|
| `profitable` | 0.83 | 0.52 | **1.60** | +9 % |
| `positive-free-cash-flow` | 0.88 | 0.59 | 1.49 | +9 % |
| `no-dilution` | 0.91 | 0.73 | 1.25 | +10 % |
| `shrinking-revenue` | 1.17 | 1.14 | 1.02 | +3 % |
| `high-revenue-growth` | 1.13 | 1.73 | 0.65 | −9 % |
| `heavy-dilution` | 1.13 | 1.77 | 0.64 | −9 % |
| `burning-cash` | 1.27 | 2.25 | 0.56 | −22 % |
| `cash-rich` | 1.21 | 2.16 | 0.56 | −23 % |
| **`very-high-revenue-growth`** | 1.17 | **2.14** | **0.55** | **−15 %** |

Revenue growth above 40 % a year raises the chance of a double barely at all and **doubles** the
chance of losing half, with a median two-year outcome of −15 %. Cash burn and a large cash pile
relative to the balance sheet — the profile of a company funding growth rather than earning it —
sit at −22 % and −23 %. That is the sharpest thing in the whole study, and it is the opposite of
the story a single famous name tells.

What does tilt up is the dull half of the ledger. `profitable` and `positive-free-cash-flow`
make a title double *less* often than average — and lose half far less often still.

**The best combinations are beaten down AND earning.** The chart signal doubles both the
doubling rate and the halving rate; adding profitability keeps most of the upside and collapses
the downside back toward the base rate:

| Pattern | lift | loss lift | asymmetry | vs. better half | median 24M |
|---|---|---|---|---|---|
| `far-below-52w-high + profitable` | 1.78 | 1.13 | 1.58 | ×1.14 | +15 % |
| `deep-drawdown + profitable` | 1.72 | 1.06 | 1.62 | ×1.10 | +12 % |
| `far-below-52w-high + positive-free-cash-flow` | 1.72 | 1.18 | 1.45 | ×1.10 | +12 % |
| `deep-drawdown + positive-free-cash-flow` | 1.68 | 1.09 | 1.54 | ×1.07 | +10 % |
| `low-gross-margin + profitable` | 1.07 | 0.45 | **2.38** | — | +15 % |

Each of the cross pairs beats its own better half, so the business condition is carrying
information the chart does not — just not the information the growth story predicted.

## What none of this licenses

A lift on a tail event is not a return expectation. The best asymmetric patterns move the median
two-year outcome from +8.9 % to roughly +12 % to +19 %, while their drawdown along the way is
deep. These are conditional frequencies in a survivorship-conditioned, split-adjusted,
overlapping-observation population — not a strategy, not a backtest, and not a forecast. The
backtest gate stays `NOT_CERTIFIED`, and the publication gate throws on any field that tries to
say otherwise.

## The horizon table, which settles it

The same patterns measured at 12, 24, 36 and 60 months, as `lift / loss lift`. Base rate for
"doubled" rises with the horizon — 5.68 %, 10.87 %, 15.57 %, 25.37 % — so every lift below is
already relative to its own horizon.

| Pattern | 12M | 24M | 36M | 60M |
|---|---|---|---|---|
| `far-below-52w-high` | 2.53 / 2.69 | 1.96 / 2.20 | 1.55 / 2.08 | 1.35 / 1.82 |
| `deep-drawdown` | 2.37 / 2.23 | 1.84 / 2.00 | 1.53 / 1.91 | 1.28 / 1.76 |
| `high-volatility` | 2.65 / 2.62 | 1.86 / 2.34 | 1.47 / 2.23 | 1.25 / 2.00 |
| `weak-12m-momentum` | 2.01 / 1.99 | 1.66 / 1.64 | 1.40 / 1.58 | 1.31 / 1.40 |
| `three-month-thrust` | 1.98 / 1.71 | 1.51 / 1.69 | 1.30 / 1.72 | 1.11 / 1.66 |
| **`very-strong-12m-momentum`** | 1.69 / 2.25 | 1.27 / 2.27 | 1.11 / 2.19 | **0.90 / 2.22** |
| `near-52w-high` | 0.49 / 0.40 | 0.66 / 0.56 | 0.79 / 0.61 | 0.87 / 0.69 |
| `at-all-time-high` | 0.33 / 0.34 | 0.58 / 0.50 | 0.75 / 0.54 | 0.82 / 0.63 |
| `low-volatility` | 0.07 / 0.16 | 0.27 / 0.31 | 0.47 / 0.37 | 0.64 / 0.48 |

Three things fall out of it, and none of them is the expected story.

**The beaten-down edge decays; the risk does not.** Every high-lift pattern loses most of its
edge as the horizon lengthens — `far-below-52w-high` from 2.53 to 1.35 — while its loss lift
stays high. It is a short-horizon volatility effect, not a long-run winner signal.

**"Buy what already ran" is the worst row in the table.** `very-strong-12m-momentum` — up 100 %
or more over the prior year — falls from 1.69 to **0.90** across horizons while its loss lift
sits flat at about 2.2. Over five years such a title doubles *less* often than an average one
and halves more than twice as often. Whatever the famous single-name story is, this is what the
population does.

**Calm titles near their highs double less often, consistently.** `at-all-time-high`,
`near-52w-high` and `low-volatility` stay below 1 at every horizon. They also lose half far less
often. That is the same coin, not a contradiction — and none of the three held out of sample.

The count of `ROBUST` patterns falls with the horizon too: 71 at 12 months, 69 at 24, 69 at 36,
50 at 60. The further out the question, the less the starting configuration explains.
