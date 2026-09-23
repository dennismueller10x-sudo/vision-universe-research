# Vision Universe® Quant 2.0 — Orchestrator State

Updated: 2026-09-23 UTC

## CURRENT_MAIN

- GitHub `main` at this state write: `7b08a6eec` (Intraday-Takt 16, Discovery-Takt, unrelated to Quant).
- Last merged Quant release: PR #173, merge `a0bb8742b684c4ebfe145b7b148d475b0c33b53d`, deployed 2026-09-22.
- This section's work branch: `claude/quant-2-orchestration-hmuo69`, branched from `7b08a6eec`.
- Production URL: `https://research.visionuniverse.de`.

## CURRENT_PHASE

`SETUP_TIER_LIVE_AND_SCREENABLE_ONE_OWNER_GATE_OPEN`

Factor Evidence, Change, Strategy Match and now the Setup Observation exist as versioned
product engines over the broad canonical universe, and the Quant Experience frontend renders
them. Quant V1 is untouched and marked LEGACY_IMMUTABLE; Quant V2 lives in its own catalog
namespace with no composite. The setup mapping is approved for the point-in-time
tier and materialized over 5,676 titles; the four course-of-events states sit behind their own
activation gate. Since this section the setup rules also *screen*: the published state index
answers "which titles stand here" from the cascade's own assignment, proven against each rule's
predicate. Backtest and Market Regime remain ahead, both for measured reasons recorded below.

## PRODUCT_MILESTONES

| Milestone | Scope | State |
|---|---|---|
| M1 | Factor + Change experience | **DONE** (this section) |
| M2 | Setup Engine + frontend | **LIVE (point-in-time tier)** — approved 2026-09-23; four course-of-events states behind their own gate |
| M3 | Strategy Match | **DONE** — 8 profiles over the V2 namespace, ranking and history withheld |
| M4 | Pattern Research Engine | **DONE** — two pre-registered families over 967k observations, 1992–2026 |
| M5 | Pattern Match product | **DONE** — 249 robuste Muster je Titel, Verlustseite neben Gewinnseite |
| M6 | Backtest integration | **BLOCKED, measured** — no total-return series, no historical index membership (see KNOWN_BLOCKERS) |
| M7 | Market Regime | OPEN — Owner methodology gate |
| M8 | Full Quant experience | OPEN |
| M9 | Setup screening (state index + parity) | **DONE** (this section) — one artifact, 6.8 KB, Aktienseite/Radar/Screener |

## OWNER_DECISION_2026-09-22 — METHODOLOGY NAMESPACES

Quant V1 stays LEGACY_IMMUTABLE. No silent re-pointing, no ambiguous dual-source behaviour.
Quant V2 gets its own explicitly versioned namespace. Implemented as decided:

- `quantV1` namespace: `quantScore`, `qualityScore`, `momentumScore`, `valueScore`,
  `growthScore`, `riskScore` keep their **exact field ids**, gain `immutable: true` and an
  explicit `QUANT_V1_*` alias token. A test carries the id list as a regression guard —
  those ids sit inside stored strategy `definitionHash` and signal `predicateHash` values.
- `quantV2.factorEvidence` namespace: seven factor fields plus `availableFactors`.
  `quantV2.factorEvidence.composite` **does not exist**; a rule written against it gets an
  unknown field from the catalog. That is the gate, and a test holds it.
- Consumers choose explicitly. The Screener has a methodology selector and refuses a query
  that mixes the two (`methodologyOf(query) === null` → `INVALID_SCREEN_RULES`). Switching
  resets the rules rather than carrying them across. Saved legacy links resolve unchanged.
- Row source follows the methodology, not the caller. Trading status comes from the Company
  Master in both cases; the evidence table never asserts it itself.

Documented in `docs/VU_QUANT_2_METHODOLOGY_NAMESPACES.md`.

## COMPLETED_THIS_SECTION

- **Two stale gates found and corrected, both by measuring rather than trusting the text.**
  The lesson had already cost one wrong blocker entry (M4), so the reasons the product gives
  were swept against current reality:
  - `setup-state-contract.js` returned `SETUP_STATE_HISTORY_NOT_MATERIALIZED`. That stopped
    being true on 2026-09-23 — the mapping is approved and 5,676 titles carry a published state
    with an ordered history behind them. It now says `SETUP_STATE_MAPPING_NOT_ACTIVE`, which is
    true of *its own* setup-state-1.0.0 mapping and was already in its vocabulary, so no enum
    changed. `AVAILABLE_OBSERVATIONS_ALLOWED` stays false.
  - **The stock page**, the more visited surface, told users "Dafür braucht es eine geordnete
    Historie veröffentlichter Beobachtungen und eine freigegebene Methodik; beides ist noch
    nicht aktiv" — while the state stood one click away on the quant page. It now reads the
    same published observation, with the same peer list.
- **The backtest gate explains rather than only refuses.** Five checks said "nicht validiert";
  two are now the measured facts (one membership snapshot per index; split-adjusted series with
  no distributions), and the other three say why too. The benchmark line claimed none was
  "freigegeben"; what is actually the case is that the repository publishes equity price series
  and no index levels at all — `ref_SPXC` is SPX Technologies, an equity, not the S&P 500. A
  test holds the bar and caught that line on its first run.
- **The ten rule texts are spelled in German.** They were ASCII-only and rendered straight at a
  reader, so "Der Trend traegt" sat beside the dictionary's "Die Rahmenlage trägt". Seven were
  rewritten; `setup.watch.bullish-trend` still hashes to `rule_5c480d3b784b077f`, because a
  predicate is built from filters and not from prose. A test rejects ASCII shorthand in copy a
  reader sees; ids, versions and enum values stay ASCII on purpose.
- **The `total_debt` concept census had never run.** The step was committed 2026-09-22 19:53;
  the last SEC run started 19:17 and its job list does not contain the step. The owner gate was
  waiting on a measurement nothing had produced. Dispatched as run `35862972083`.

- **Setup screening (M9)** — the other half of the same question, with no new engine and no new
  pipeline. `SetupEngine.screenIndex()` publishes the cascade's assignment per state;
  `reconcile()` / `assertParity()` run each rule's predicate over the very rows the cascade saw
  and account for every difference. Measured at 2026-09-10: the `setup.watch.bullish-trend`
  predicate matches **1,436** titles while the state holds **620** — 816 were claimed by a
  higher-priority rule. Shipping the predicate as the state list would have been wrong by a
  factor of 2.3, and every extra title is one that is actually further along. Artifacts:
  `screen-index.json.gz` (6.8 KB, one fetch instead of 634 shards) and `screen-parity.json`.
  A drifted index throws in the materializer rather than publishing with a warning. Surfaces:
  Aktienseite (*Situation*), Radar (*Lage im Markt*), Screener `?setupRule=`. The screener link
  opens a **result**, not an editable query — loading the rule into the editor would run the
  predicate and reproduce exactly the 816-title error. A closed tier publishes `null`, never a
  count of zero, because "INVALIDATED: 0" is a claim about the universe.

- **Factor Evidence Engine** `vu-factor-evidence-1.0.0`, derived from `quant-v2.0.0`:
  `quant/engines/factor-evidence.js` (normalization, assembly, bands, confidence, publication gate).
- **Change Engine** `vu-change-1.0.0`: `quant/engines/change-engine.js`, eleven measured positions,
  change measured on inputs and never on scores.
- **Broad materialization**: `scripts/quant/build-factor-evidence.mjs` →
  `quant/data/product/factor-evidence-v1/` (637 shards + summary, 7.5 MB).
  Reads only existing artifacts: `factors-FULL_UNIVERSE.json`, `quant/data/sec/consumer/`,
  `technical-signals-v1`, `sic-peer-taxonomy-v1`. No provider call, no R2 write, no second pipeline.
- **Quant Experience frontend**: `/vu2/?view=quant` rebuilt as Meaning → Explanation → Evidence →
  Workspace (Stock Hero, Factor DNA with per-component evidence, "Was verändert sich gerade?",
  Setup journey with observable conditions, data-provenance panel).
- **Explain Quant**: new `/vu2/?view=explain` beginner surface.
- **Publication gate is enforced, not documented**: `publicationViolations()` runs on write for every
  security and on read in the browser. No `quantScore`, no `rank`, no score on a closed factor.
- **Derived input added honestly**: `downsideVolatility252d` computed from the published 270-bar
  series, labelled `SPLIT_ADJUSTED` per component. This is what opened the Risk factor.
- **Operating income wired into the factors**: `operatingMarginStability`,
  `operatingMarginExpansion3y` and `operatingMarginTtm` now compute from data that was already
  in the repository. Profitability opened (0 → 1,154), Growth rose to 3,188 and Quality to 2,732.
  Six of seven factors are now broadly available; only Revisions is fully closed.
- **SEC consumer export widened**: `depreciation_and_amortization`, `pretax_income`,
  `income_tax_expense` and the already-derived `ebitda` now leave the SEC layer. The readers for
  `ebitdaYield`, `roicTtm` and `roicMedian3y` are wired and unit-tested; the ROIC tax rate is the
  issuer's reported effective rate, and a loss year or a tax benefit leaves the value empty
  rather than substituting a flat rate.
- **Fundamental inputs extracted** into `quant/engines/fundamental-inputs.js` so that a formula
  deciding whether a factor opens is testable on its own. Behaviour-preserving: identical counts
  before and after.
- **Three input gates closed at the engine**: `market-factors-1.0.0` now computes
  `downsideVolatility252d`, `beta252d` and `relativeStrength12M1M`. Beta pairs security and
  benchmark **by trading date** — a day without a counterpart is dropped, never shifted, because
  positional zipping would misprice every return after the first holiday. The three fields appear
  in the artifact on the next market-data run; until then the materializer derives downside
  volatility from the published bar series and leaves the other two typed-closed.
- CI: factor evidence materialization wired into `product-intelligence-materialization.yml`
  right after the technical bundles it reads; new tests run in Quant CI and in that workflow.
- **Strategy Match** `strategy-profiles-1.0.0`: `quant/methodology/strategy-profiles-v1.json` +
  `quant/engines/strategy-match.js`. Eight profiles, each condition a filter of the canonical
  rule predicate — no second rule engine, and a profile carries a stable `predicateHash`.
  Match = met weight / measurable weight; an unmeasurable condition leaves the denominator
  instead of counting as a failure. `ranking.state = WITHHELD` and
  `historicalEvidence = UNAVAILABLE / BACKTEST_NOT_CERTIFIED` on every profile.
- **Compact evidence table** `factor-evidence-screening-1.0.0` (6,404 rows, 90 KB gzipped).
  Its column names ARE the canonical catalog field ids, so no second naming scheme can drift
  from the one a rule is written against; the materializer aborts if catalog and published
  factor set disagree.
- **Snapshot history started** (`factor-evidence-snapshot-1.0.0`). It lives beside the
  rebuildable artifact rather than inside it, is versioned by methodology, and refuses two
  distinct failures: a stored file that no longer matches its own content hash (corrupt), and
  a run that would give a published date different content (a changed past). Both abort.
  This is the precondition the owner named for M2 and the only honest way `scoreMomentum`
  can open — a comparison point must be a value that was published on that date.
- **`change.scoreMomentum` wired** to that history with a 30-day velocity window from
  `quant-v2.0.0 temporal.scoreMomentum`. Still closed today with one snapshot, and it now
  distinguishes "no history yet" from "history too short" instead of reporting both as one.
- **A strategy rule also screens** (§20). `StrategyMatch.screenQuery(profile)` returns the same
  predicate as a screener query — same `predicateHash`, same filters. Wired both ways: each
  profile on the stock page opens the screener with its rule, and the screener loads a profile's
  rule into the editor. A test checks the two against each other: every title the predicate
  selects must score 100 % on that profile, and no unselected title may.
- **Watchlist carries the evidence**: a compact seven-factor strip per member in canonical
  order, plus "x von 7 bewertet" and a link into the Quant analysis. One fetch of the evidence
  table for the whole list, not one per title. A factor without a value stays visibly empty —
  six of seven must not look like seven.
- Browser QA extended to the rebuilt `quant` view, the new `explain` view, the Strategy Match
  section, the screener methodology switch, the profile round trip and the watchlist strip,
  both widths.

### M2 — Setup Observation (`setup-mapping-1.0.0`, engine `vu-setup-1.0.0`)

- **The mapping is written and machine-checked**, not described. Ten ordered rules, first match
  wins, ending in a catch-all. `validateMapping()` refuses a cascade that leaves one of the
  eight states unreachable, that would decide a path-dependent state without a history
  condition, that names a field the catalog does not have, or that does not end in a rule that
  always matches. The materializer runs it before evaluating a single title.
- **Every point-in-time rule IS a screener query.** Each is one canonical rule predicate over
  catalog fields; a test asserts the predicate and the query carry the same `predicateHash` in
  both directions. §20 holds here without a second evaluator: the rule that assigns the state
  screens for it.
- **Two tiers, never conflated.** `classification` answers "what does today's evidence look
  like"; `lifecycle` answers "where does this title stand in its course". `ACTIVE`,
  `RISK_RISING`, `INVALIDATED` and `EXIT` are skipped — reported `NOT_EVALUABLE`, not as a
  negative — while the ordered observation history is short. They are never reconstructed from
  a single cutoff.
- **A repainting input was found and replaced.** The catalog only exposed
  `technicalStructure`, whose regime counts close breaks a later pivot confirmation can take
  back; a state built on it would change retroactively. `technicalConfirmedStructure`
  (`technical.confirmed_structure`) now carries the pivot-confirmed regime the structure engine
  already computes, and a test asserts no state-deciding rule reads the revisable one.
- **Invalidation is measured against the level that was published then.** The analysis
  invalidation price and the first target zone are frozen into each observation; a later run
  compares today's close against those, never against levels recomputed today.
- **Immutable observation history** beside the rebuildable artifact, per mapping version, with
  the same two aborts as the factor snapshots: a stored file that no longer matches its own
  content hash, and a run that would give a published date different content.
- **Materialized over the full technical-capable breadth**: 5,676 instruments, 0 without
  complete evidence — NO_SETUP 4,017 · WATCH 843 · SETUP_FORMING 800 · CONFIRMED 16, path tier
  0 and closed. Both WATCH paths are used (620 via trend, 223 via confirmed structure near the
  52-week high). Largest shard 4.6 KB gzipped.
- **The frontend stopped carrying its own definition.** The Setup section on `/vu2/?view=quant`
  previously listed seven conditions written in `experience.js`. It now renders the rule that
  actually decided the state, its conditions, the mapping version and the rule id. The journey
  steps come from the cascade, not from a hard-coded list.
- Wired into `product-intelligence-materialization.yml` right after the bundles it reads, with
  its tests and its summary in the run log and the retained evidence.

### M4 — Pattern Research (`pattern-research-1.0.0` + `pattern-research-fundamentals-1.0.0`)

- **The blocker entry was wrong, and measuring beat assuming.** M4 was recorded as needing deep
  canonical history from private R2. `quant/data/market/discover-series-long/` already held
  **6,308 titles of weekly split-adjusted closes at MAX range** — 618 starting in 1990, average
  763 weekly points, up to 1,915. No R2 restore, no credentials, no new pipeline. Discovery's
  artifacts are read and never written.
- **Two pre-registered hypothesis families, separately versioned and separately corrected.** The
  price family (15 candidates + their pairs) and the PIT fundamental family (15 candidates +
  pairs + cross pairs with the price family). The fundamental family is a separate file and a
  separate version precisely so the price study's hypothesis count was not changed after it had
  been measured — a correction over a retroactively changed count is not a correction.
- **Leakage is a check, not a comment.** Truncating the series after `t`, poisoning everything
  after `t` with `1e9`, and poisoning everything before `t` must each leave the numbers
  untouched; three tests hold it. There is deliberately **no size feature**, because market cap
  at a historical `t` needs that date's share count and no such series exists here.
- **A missing outcome is not a loss.** A series ending before the horizon closes is
  `OUTCOME_UNAVAILABLE` — neither winner nor non-winner — and its count is published.
- **Walk-forward folds are purged**: an observation whose outcome window still runs when the test
  block opens leaves the training block. A test asserts the embargo actually removed something.
- **Point-in-time means the filing date.** `pit-fundamental-history-1.0.0` reads a fiscal year
  only once it was filed, keeps the newest filing at or before `t`, and selects growth pairs
  **by fiscal year rather than list position** — a gap in a filed history would otherwise turn a
  three-year growth rate into a four-year one. A test caught exactly that during development.
- **Every finding carries its downside.** `conditionalLossRate`, `lossLift`, `asymmetry`
  (lift ÷ loss lift), the median outcome and the median worst drawdown. This is not decoration:
  the highest-lift patterns raise the chance of a double *and* of a halving by the same factor.
- **The fast path proves itself against the readable one** on real published series, field by
  field, for every candidate and an interaction. A boolean-only pattern is recorded as
  `NOT_APPLICABLE_NO_THRESHOLD` rather than "stable", because an absent test and a passed test
  must not look alike.
- Wired into `product-intelligence-materialization.yml` with both studies, their tests and their
  summaries in the run log and the retained evidence.

### M5 — VU Pattern Match (`pattern-match-1.0.0`)

- Per title: which of the 249 `ROBUST` patterns its current configuration satisfies, with the
  population statistics for those patterns. 5,569 titles, 1,496 of them without a visible
  filing (published as such, not silently treated as failing the fundamental conditions).
- **Only `ROBUST` findings appear beside an instrument.** A pattern that did not hold out of
  sample would read as evidence about that title. What was withheld is published as counts
  rather than disappearing.
- Every card shows the loss side beside the win side and the tilt ratio. A pattern under which
  titles double more often and halve more often renders as "beide Seiten gleich stark", not as
  a finding.
- A title satisfying none of them gets that as a full answer, not an empty section.
- Product copy is derived from the pre-registration rather than copied out of the study, so the
  wording a reader sees has one home; the materializer throws if a pattern names a candidate
  that has none.
- Largest browser shard 17.8 KB gzipped / 0.17 MiB uncompressed, inside the artifact caps.

### Product Language (`product-language-1.0.0`)

- **Ein Wörterbuch, das die Oberfläche wirklich liest.** 58 Begriffe in sieben Kategorien in
  `quant/methodology/product-language-v1.json`, gelesen über `quant/engines/product-language.js`.
  `docs/VU_QUANT_2_PRODUCT_LANGUAGE.md` wird daraus **erzeugt**; ein Test regeneriert das
  Dokument und vergleicht es. Eine handgepflegte Kopie eines Wörterbuchs ist ein zweites
  Wörterbuch, und zwei Wörterbücher widersprechen sich binnen eines Monats.
- **Fail-closed statt Slug.** Ein fehlender Begriff wirft, statt seine eigene id vor einem
  Leser auszugeben. Lädt die Textquelle nicht, sagen die betroffenen Ansichten das — es werden
  keine Ersatzworte erfunden.
- **Drei parallele Beschriftungslisten sind verschwunden.** `SETUP_LABELS` in `experience.js`,
  die Faktornamen der Strategie-Seite (`momentum: 'Momentum'`) und die Faktorlabel der Engine
  liefen nebeneinander. Jetzt gibt es eine Quelle; ein Test hält Engine und Wörterbuch auf
  demselben Wort, und `quality` heißt überall „Unternehmensqualität".
- **Der Guard ist ein Test, keine Konvention.** Er liest die Primärpositionen aus
  `vu2/experience.js` — h1/h2/h3, Eyebrow, Chip, Badge — und schlägt fehl, sobald einer der 30
  internen Begriffe dort steht. Ein zweiter Test verbietet jeden rohen Enum-Wert als Copy. Die
  Browser-QA prüft dasselbe am gerenderten DOM.
- **Die Lesereihenfolge folgt der Frage, die ein Nutzer stellt**: wie stark → warum → was
  ändert sich → baut sich etwas auf → was spricht dafür und dagegen → wie sah das früher aus →
  welcher Anlagestil passt → wie belastbar ist das alles. Ein Test hält die Reihenfolge fest.
- **Zwei neue Sektionen, kein neuer Motor.** „Was spricht dafür, was dagegen?" sortiert
  ausschließlich, was Faktorevidenz, Veränderungsmessung und Musterabgleich bereits berechnet
  haben, und zeigt nie eine Seite ohne die andere. „Wie belastbar ist die historische Evidenz?"
  benennt Herkunft, Out-of-Sample-Prüfung, Überlebende-Verzerrung und Kursbasis und führt die
  Backtest-Schicht bereits in Einsteigersprache — fünf Größen oben, die Fachwerte eingeklappt,
  ohne eine einzige erfundene Zahl, weil das Gate geschlossen ist.
- **Interne Begriffe bleiben auffindbar.** Sie stehen in der eingeklappten Methodik-Ebene und
  als Beisatz — ein Profi soll `setup-mapping-1.0.0` oder `quantV2.factorEvidence` finden
  können, ein Anfänger soll nicht damit anfangen müssen.

## PRODUCTION_REALITY

Counts measured from the materialized artifact at data cutoff `2026-09-21`, after the
owner-authorized market-data and SEC consumer-export runs.

| Measure | Count/state |
|---|---:|
| Product Universe | 6,875 |
| `FACTOR_EVIDENCE_PUBLISHED` | 6,403 |
| `FACTOR_QUALITY_AVAILABLE` | 2,734 |
| `FACTOR_GROWTH_AVAILABLE` | 3,189 |
| `FACTOR_MOMENTUM_AVAILABLE` | 5,581 |
| `FACTOR_VALUE_AVAILABLE` | 2,003 |
| `FACTOR_PROFITABILITY_AVAILABLE` | 1,188 |
| `FACTOR_REVISIONS_AVAILABLE` | 0 (gate `PIT_ANALYST_CONSENSUS`) |
| `FACTOR_RISK_AVAILABLE` | 5,581 |
| `FACTOR_NOT_APPLICABLE_INDUSTRY` | 967 (banks, insurers, REITs) |
| `WITH_PIT_FUNDAMENTALS` | 5,010 |
| `WITH_MARKET_CAP` | 3,921 |
| `FACTORS_BROADLY_AVAILABLE` | 6 of 7 (Revisions is the exception) |
| `QUANT_V1_STATUS` | LEGACY_IMMUTABLE, field ids unchanged |
| `QUANT_V2_NAMESPACE` | `quantV2.factorEvidence`, 8 fields, no composite field |
| `STRATEGY_MATCH_PROFILES` | 8 (Earnings Revision Leader permanently UNAVAILABLE) |
| `STRATEGY_MATCH_RANKING` | WITHHELD |
| `STRATEGY_MATCH_HISTORICAL_EVIDENCE` | UNAVAILABLE / BACKTEST_NOT_CERTIFIED |
| `SCREENER_METHODOLOGIES` | 2, mixed queries refused |
| `STRATEGY_RULE_SCREENS` | yes — same predicate hash in both directions |
| `WATCHLIST_FACTOR_EVIDENCE` | seven-factor strip per member |
| `SNAPSHOT_HISTORY` | 2 snapshots (`2026-09-18`, `2026-09-21`), immutable, per-methodology |
| `SCORE_MOMENTUM` | closed — the two snapshots are 3 days apart, the window is 30 ± 10 |
| `CHANGE_ENGINE_STATE` | AVAILABLE, 9 of 11 positions measurable for a typical covered title |
| `COMPOSITE_SCORE` | WITHHELD |
| `QUANT_V2_STATUS` | SPECIFIED_NOT_ACTIVE |
| `STRATEGY_RANKING_STATUS` | UNAVAILABLE |
| `SETUP_OBSERVATION_UNIVERSE` | 5,676 observed, 0 without complete evidence |
| `SETUP_CLASSIFICATION` | NO_SETUP 4,017 · WATCH 843 · SETUP_FORMING 800 · CONFIRMED 16 |
| `SETUP_LIFECYCLE_STATUS` | FAIL_CLOSED — `SETUP_MAPPING_NOT_APPROVED` (owner gate) |
| `SETUP_OBSERVATION_HISTORY` | 1 observation (`2026-09-10`), immutable, per mapping version |
| `MARKET_REGIME_STATUS` | FAIL_CLOSED |
| `REVISIONS_STATUS` | BLOCKED_EXTERNAL |
| `RADAR_SIGNALS_CAPABLE_UNIVERSE` (20 EOD) | 5,888 |
| `WATCHLIST_SELECTABLE_UNIVERSE` | 6,875 |
| `WATCHLIST_TECHNICAL_CAPABLE_UNIVERSE` | 5,676 |
| `WATCHLIST_ELLIOTT_CAPABLE_UNIVERSE` | 5,590 |
| `FIVE_SCOPE_REMAINS` | false |
| `DISCOVERY_CHANGED` | false |

## VERIFICATION

- Full Quant suite: 1,513/1,513 passed locally (1,501 before, +12 product-language).
  SEC Python suite: 474/474 locally.
- Browser-QA über `quant` (NVDA, JPM, AAPL), `explain`, `strategies`, `watchlist` (mit
  gesetzter Auswahl) und `radar` bei 1440 px und 390 px: kein interner Begriff in einer
  Überschrift, einem Eyebrow, einem Chip oder einem Badge, kein horizontaler Überlauf, keine
  Seitenfehler.
- The shared study runner refactor was verified, not assumed: 1,482 fields across 114 findings
  compared against the pre-refactor run, zero differences. The only intended change was three
  boolean-only patterns moving from "stable" to `NOT_APPLICABLE_NO_THRESHOLD`.
- Public data hygiene guard: passed against the new artifact.
- A harness defect was found and fixed while doing this: the local QA server sent
  `Content-Encoding: gzip` for `.json.gz`, so the browser decompressed transparently and every
  compressed-artifact read failed. Production serves those files as opaque bytes and the page
  decompresses itself. The harness now does the same. Worth recording because the symptom
  looked exactly like a broken Quant page.
- Headless Chromium at 1440 px and 390 px, `quant` (NVDA, JPM, AAPL), `explain` and `screener`:
  one `h1` per page, no horizontal overflow, seven factors in canonical order, change groups
  rendered, setup conditions rendered, eight Strategy Match profiles rendered, the screener
  methodology switch offering only Quant V2 fields and returning Quant V2 rows, no page errors.
- Largest shard: 41 KB gzipped, 0.46 MiB uncompressed — inside the browser artifact caps.
- Production acceptance for this section is not yet claimed: it needs a merged release and a
  Pages deploy of the exact commit.

## OPEN_INPUT_GATES

Machine-readable in `quant/data/product/factor-evidence-v1/summary.json` → `openInputGates`.
Every gate a run can settle by itself is now **measured from that run's coverage**, not
asserted in a hand-written list. Three gates in the previous version of this file
(`CONSUMER_EXPORT_MATERIALIZATION`, `BETA_252D`, `RELATIVE_STRENGTH_12M1M_MATERIALIZATION`)
had already been cleared by the workflow runs and would have kept claiming a blockade that no
longer existed. A stale gate is worse than no gate, because someone acts on it.

| Gate | Blocks | Owner |
|---|---|---|
| `COMPONENT_INPUT_NARROW` | `profitability.roicTtm` (58), `value.ebitdaYield` (83), `value.salesYield` (97), `quality.netDebtToAssets` (462), `profitability.roicMedian3y` (535) | SEC normalization — see below |
| `PIT_ANALYST_CONSENSUS` | `revisions.*` | external licence |
| `INDUSTRY_TEMPLATES_BANKS_INSURERS_REITS` | Quality, Value, Profitability for 967 titles | quant-v2 methodology |
| `FACTOR_SNAPSHOT_HISTORY` | `change.scoreMomentum` | this materializer; two snapshots exist, they need to be ~30 days apart |

No component is fully closed any more. `COMPONENT_INPUT_NOT_MATERIALIZED` is absent from the
artifact because nothing in the contract is at zero coverage.

### What the narrow components actually trace back to — measured

`total_debt`, not the metrics that were just exported. Across the 5,068 consumer files:

| Metric | annual | quarterly | TTM |
|---|---:|---:|---:|
| `operating_income` | 4,021 | 3,213 | 2,969 |
| `pretax_income` | 4,330 | 3,210 | 2,949 |
| `income_tax_expense` | 4,492 | 3,397 | 3,008 |
| `ebitda` | 3,502 | 2,886 | 2,661 |
| `stockholders_equity` | 4,848 | 0 | 0 (balance-sheet instant) |
| **`total_debt`** | **2,645** | **2,182** | **854** |

Of 5,068 issuers, exactly **325** carry all six ROIC inputs at once, and `total_debt` is the
first missing input for **4,214** of the rest — equity for 8, operating income for 484, the tax
pair for 37. The 325 then fall to 58 through period alignment and the positive-invested-capital
check. So `roicTtm` at 58 is not a wiring gap; it is `total_debt` TTM breadth in the SEC
normalization layer, and that is the next real input gate for Profitability and Value.

The cause is one line of the metric registry. `total_debt` maps to exactly two concepts —
`us-gaap:DebtLongtermAndShorttermCombinedAmount` and `ifrs-full:Borrowings` — and the first is
an optional combined disclosure most US filers do not tag. `long_term_debt`, which maps to
three commonly-used concepts, reaches 3,265 issuers.

**This is an owner decision, not a fix to make in passing.** Falling back to `long_term_debt`
would be a silent substitution: long-term debt excludes the current portion and short-term
borrowings, so `total_debt`, `net_debt`, `debt_to_equity` and every factor reading them would
quietly start meaning something else for 726 issuers — the same shape of change the owner
rejected for Quant V1. Widening the concept list properly needs to know which tags issuers
actually use, and that cannot be measured from this checkout: `companyfacts.zip` only exists
inside the SEC workflow.

So the measurement was built instead of the guess. `python3 scripts/quant/cli.py concept-census`
counts, per issuer, which mapped and which unmapped debt concepts the product universe tags,
and writes `quant/data/sec/concept-census.json`. It runs in the SEC workflow off the archive
already in the runner cache, downloads nothing, is `continue-on-error`, and changes no value,
no mapping and no metric. The next scheduled SEC run (Monday 07:30 UTC) produces the numbers;
the mapping decision is then taken against measurement rather than against a plausible guess.

## OWNER_DECISIONS

- GitHub/main, reviewed release artifacts and Production are the source of truth; chat history is not.
- Discovery is a separate product and remains a hard no-change gate.
- No second data pipeline, Fundamentals layer, Tiingo integration, realtime infrastructure,
  public R2 API or market-data architecture.
- A title receives intelligence by canonical identity and explicit capabilities, never by
  Legacy-Five membership.
- Browsers consume bounded materialized Product Data.
- Quant V2 composite, Revisions, Market Regime, Strategy ranking, SetupState activation and
  Backtesting stay fail-closed until their own contracts are certified.
- Per-factor evidence under an independently versioned contract is explicitly **not** the Quant V2
  composite and does not open that gate.
- Market Regime methodology remains an Owner gate; implementation must not invent thresholds.

## KNOWN_BLOCKERS

- Market Regime: no certified versioned method with exact thresholds, minimum breadth, state
  transitions/hysteresis, missing-data behaviour, benchmark/calendar rules.
- Revisions: no licensed, immutable historical PIT analyst-consensus source.
- **Backtesting (M6): blocked, and this time the blockade was measured rather than inherited.**
  Two of the required inputs do not exist in this repository at all:
  - **No total-return series.** The consumer price series carry
    `priceSeriesType: "SPLIT_ADJUSTED"` and no dividend-adjusted or total-return field. 615 of
    800 sampled SEC consumer bundles do carry `dividends_paid`, but that is an annual cash-flow
    figure, not a per-share dividend series aligned to price dates; deriving one from it would
    be a fabrication, not a reconstruction.
  - **No point-in-time universe.** `quant/data/market/index-membership/history/{DJIA,NDX,SP500}/`
    each hold **exactly one** file (`2026-09-15.json`; 498 members for SP500). A backtest over a
    single membership snapshot applies today's constituents to the whole past — the textbook
    survivorship and look-ahead error §40 forbids.
  Corporate actions, benchmark and execution methodology remain uncertified on top of that.
  A backtest built on this basis would be exactly the "falsche Backtests" the hard-safety rule
  names, so M6 stays shut on evidence, not on caution.
- ~~**Pattern Research (M4)**: needs deep canonical history from private R2.~~ **This entry was
  wrong and is corrected.** It reasoned from the 270-bar technical bundles and never checked
  what else the repository holds. `quant/data/market/discover-series-long/` carries **6,308
  titles of weekly split-adjusted closes at MAX range** — 618 of them starting in 1990, an
  average of 763 weekly points (about 14.7 years) and up to 1,915 (about 36.8 years). That is
  the Discovery workstream's canonical output, committed and read-only here. M4 needed no R2
  restore and no credentials; it needed someone to measure what was already there. Built this
  section.
- `GLMD` is the only canonical Product Universe member without a restored history object.
- Direct custom-domain reads remain blocked in this orchestration environment; production
  acceptance uses the exact Pages artifact, deploy job and CI probes.

## NEXT_DEPENDENCY_CORRECT_STEP

0. **One owner gate is open** and it does not block the next build: the `total_debt` concept
   mapping, which waits on the measurement the SEC workflow now produces.
1. **`setup-mapping-1.0.0` was approved on 2026-09-23** for the point-in-time tier; the four
   course-of-events states sit behind `PATH_DEPENDENT_STATES_ACTIVATION`, which opens only when
   its seven measured checks pass **and** the owner flips the contract. Nothing here waits on a
   person: the checks resolve as observations accumulate.
2. **Let both histories accumulate.** The factor snapshot series has `2026-09-18` and
   `2026-09-21`; `change.scoreMomentum` opens when one sits ~30 days back. The setup
   observation series has `2026-09-10`; the path tier (ACTIVE, RISK_RISING, INVALIDATED, EXIT)
   opens on the second one. Both append by themselves on each materialization run — there is
   nothing to build.
3. **`total_debt` is measured and lies with the owner.** The earlier entry here was wrong twice
   over and is corrected: there is no silent substitution to undo — `derived.py` already
   reconstructs `total_debt = long_term_debt + short_term_debt` with a per-row `derived` flag —
   and the concept census (5,148 issuers, `census_logic 1.1.0`, registry mapping `1.5.0`) shows
   there is **no composition that materially widens the metric without changing what it means**:

   | Option | Coverage | Δ | |
   |---|---:|---:|---|
   | A combined amount only | 864 | −2,065 | not the current state |
   | **B combined, else LT+ST** | **2,929** | — | **the current state** |
   | C long-term alone | 3,456 | +527 | a DIFFERENT metric under the same name |
   | D B and finance leases | 1,281 | −1,648 | requiring leases COSTS coverage |
   | E B, else leases alone | 3,401 | +472 | semantically weakest |

   Refusing the forbidden substitution C costs exactly 527 issuers — a measured price, not a
   guess. The five highest-coverage unmapped concepts are maturity schedules, cash-flow items
   and per-instrument disclosures: more reach than today's mapping and none of them a balance
   sheet total. Full write-up: `docs/VU_QUANT_2_TOTAL_DEBT_CENSUS.md`.

   1,692 issuers tag no long-term debt concept at all. That cohort is not only financials —
   Lumen Technologies and MasTec carry no debt metric in the export either. Which concepts that
   cohort does use is the one open measurement, and it is not blocking.
4. **Setup screening (M9) is built** — the point-in-time rules now answer both directions of
   the same question. Next in the same §20 direction and needing no new data: the same
   assignment as a watchlist filter and as an alert predicate, since a state change on a
   `predicateHash` is already what the alert contract describes.
5. **M6 (Backtest) is shut on measured grounds** (see KNOWN_BLOCKERS) and is not the next step.
   Two inputs would have to be acquired first: a dividend-adjusted price series and a historical
   index-membership series. Neither is a build task.
6. Market Regime stays on the Owner gate.

## RESUME_STATE

1. Re-read this file and current GitHub/main. Measure, do not assume the counts above.
2. Do not rebuild Technical/Signals/Elliott materialization, canonical history, the factor
   evidence artifact's inputs, or the serving architecture.
3. `vu-factor-evidence-1.0.0` is a published contract. Changing a formula means a new version,
   not a silent reinterpretation.
4. Keep `QUANT_V2_STATUS = SPECIFIED_NOT_ACTIVE`, composite WITHHELD, Revisions fail-closed,
   Market Regime fail-closed, Strategy ranking unavailable, Backtesting closed.
5. Preserve `DISCOVERY_CHANGED = false` and `DISCOVERY_REGRESSION = false`.
