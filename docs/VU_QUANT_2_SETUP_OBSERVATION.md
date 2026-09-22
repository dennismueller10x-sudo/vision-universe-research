# Quant 2.0 — Setup Observation (M2)

`setup-mapping-1.0.0` · engine `vu-setup-1.0.0` · contract `setup-state-1.0.0`

The product question is *"is a situation forming here right now, and where does this title
stand in it"*. The answer is one of eight canonical states, reached by a written, versioned,
ordered cascade. What follows is the whole of that answer — there is no second definition
anywhere in the product.

## What this is not

It is not a second technical analysis. Every input is a value the existing technical engines
already published into `technical-product-artifact-1.0.0`; no bar is touched here.

It is not a second rule engine. Every point-in-time rule is one canonical rule predicate over
catalog fields (`rule-contract.js`, evaluated by `query.js`). The rule that assigns a state is
literally the query that screens for it, and carries the same `predicateHash` in both
directions. A test holds that identity.

It is not a recommendation. A state describes what is observable at a cutoff. It is not an
entry rule, not a success probability, and not a return statement. The publication gate
rejects a `probability`, `successRate`, `expectedReturn`, `targetPrice`, `winRate`, `hitRate`
or `confidenceOfSuccess` field outright.

## The two tiers, and why they are kept apart

| Tier | States | Needs history |
|---|---|---|
| `POINT_IN_TIME` | `NO_SETUP`, `WATCH`, `SETUP_FORMING`, `CONFIRMED` | no |
| `PATH_DEPENDENT` | `ACTIVE`, `RISK_RISING`, `INVALIDATED`, `EXIT` | yes — 2 ordered observations |

"Became invalid" is a statement about a course of events, not about a cutoff. It can only be
made from a state that was *actually observed and published* on an earlier date. Reconstructing
it from today's data would be hindsight wearing a lifecycle's clothes, so the engine refuses:
a path rule is skipped, not guessed, while the history is short, and its result is reported as
`NOT_EVALUABLE` rather than as a negative.

This is why an observation carries two separate things:

- `classification` — the point-in-time state. "This is what today's evidence looks like."
- `lifecycle` — the full journey state. "This is where the title stands in its course."

They are never conflated. A classification alone is never rendered as a lifecycle state, and
the publication gate throws if it is.

## The cascade

`FIRST_MATCH_WINS`, strictly ascending order, ending in a rule that always matches. A title
gets exactly one state; a state may be reachable by more than one rule, and the observation
names which one decided it. A rule set that leaves a state unreachable, that would decide a
path state without a history condition, or that does not end in a catch-all, is refused at
load — `validateMapping()` is run by the materializer before a single title is evaluated.

| # | Rule | State | Tier |
|---|---|---|---|
| 1 | `setup.invalidated.below-previous-invalidation` | `INVALIDATED` | path |
| 2 | `setup.exit.previous-target-reached` | `EXIT` | path |
| 3 | `setup.risk-rising.volatility-regime-high` | `RISK_RISING` | path |
| 4 | `setup.risk-rising.momentum-turns-negative` | `RISK_RISING` | path |
| 5 | `setup.active.entry-zone-running` | `ACTIVE` | path |
| 6 | `setup.confirmed.structure-trend-volume` | `CONFIRMED` | point-in-time |
| 7 | `setup.forming.complete-setup-awaiting-trigger` | `SETUP_FORMING` | point-in-time |
| 8 | `setup.watch.bullish-trend` | `WATCH` | point-in-time |
| 9 | `setup.watch.confirmed-structure-near-high` | `WATCH` | point-in-time |
| 10 | `setup.none.fallback` | `NO_SETUP` | point-in-time |

Rules 3 and 4 are two rules rather than one `OR`, because the canonical predicate deliberately
has no `OR` groups and because the result should say *which* way a title got there.

## Repainting: the one input that had to be added

The structure engine carries the repainting policy `CONFIRMS_WITH_DELAY`. Its published
`state.regime` counts close breaks that a later pivot confirmation can take back — so a state
built on it would change retroactively. `state.confirmedRegime` is pivot-confirmed only and
does not.

The catalog only exposed the revisable one. So `technicalConfirmedStructure` was added as its
own field (`technical.confirmed_structure` in the metric registry), passed through from the
value the structure engine already computes. The mapping reads that field, and a test asserts
that **no rule that decides a state reads `technicalStructure`**. `developingPivot`,
`scenarios` and `elliott` are named as excluded inputs for the same reason; Elliott stays
`EVIDENCE_ONLY` per the existing semantic boundary.

## Invalidation and exit levels come from the past, not the present

When a title is observed, the two levels it will later be measured against —
`analysisInvalidation.price` and the low edge of the first target zone — are frozen into that
observation. A later run compares today's close against *those* levels, never against levels it
recomputes today. That is the difference between "this broke" and "this looks broken in
hindsight", and a test holds it.

## The immutable observation history

`quant/data/product/setup-observation-history/<mappingVersion>/<cutoff>.json.gz`, a **sibling**
of the rebuildable artifact, not a child: `setup-observations-v1/` is deleted and rebuilt on
every run, and a published observation must not be something a rebuild can erase. Each
methodology version runs its own series.

Two distinct failures abort a run rather than write:

- a stored observation that no longer matches its own content hash — it is corrupt;
- a run that would give an already-published date different content — a published past is not
  rewritten. Publish a new mapping version instead.

## Publication is gated three ways

The lifecycle is `AVAILABLE` only when all three hold:

1. `stateMapping.approval.state === "APPROVED"` — **currently `PENDING_OWNER`**;
2. at least two ordered observations exist for that title;
3. the required technical evidence is complete.

Otherwise the lifecycle is `UNAVAILABLE` with one of four typed reasons:
`SETUP_MAPPING_NOT_APPROVED`, `SETUP_OBSERVATION_HISTORY_NOT_MATERIALIZED`,
`INSUFFICIENT_OBSERVATION_HISTORY`, `SETUP_INPUTS_INCOMPLETE`. A title without complete
technical evidence gets *no* state — and specifically not `NO_SETUP`. "No setup" and "not
assessable" are two different statements.

## The open owner gate

`VERSIONED_STATE_MAPPING_APPROVED` is the one gate a run cannot clear by itself. The mapping
above is written, versioned, machine-checked and materialized over the full breadth; what it
still needs is the owner's approval of the state semantics. Approval is one edit:

```json
"approval": { "state": "APPROVED", "approvedBy": "<owner>", "approvedAt": "<ISO timestamp>" }
```

Nothing else changes. Until then every surface says, in a typed reason rather than in prose,
that no lifecycle state is being claimed.

## Measured breadth

At data cutoff `2026-09-10`, over 5,676 instruments — the full technical-capable universe,
with **0** titles missing required evidence:

| State | Count |
|---|---:|
| `NO_SETUP` | 4,017 |
| `WATCH` | 843 |
| `SETUP_FORMING` | 800 |
| `CONFIRMED` | 16 |
| `ACTIVE` / `RISK_RISING` / `INVALIDATED` / `EXIT` | 0 — path tier closed |

Both `WATCH` paths earn their place: 620 titles via the trend rule, 223 via confirmed
structure near the 52-week high. `CONFIRMED` is deliberately rare — it asks structure, trend, a
complete setup and volume participation to agree on the same day.

Largest shard: 4.6 KB gzipped, 0.03 MiB uncompressed — far inside the browser artifact caps.
