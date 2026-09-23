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

---

# Die zehn Regeln, zur Owner-Freigabe

Vorgelegt vor der Freigabe von `VERSIONED_STATE_MAPPING_APPROVED`. Nichts ist auf `APPROVED`
gesetzt; `approval.state` steht weiterhin auf `PENDING_OWNER`.

**PIT-stabil** heißt hier: Die Regel entscheidet ausschließlich aus dem Datenstand *eines*
Stichtags und ändert ihr Urteil über diesen Stichtag später nicht mehr. Alle Eingaben sind
nicht-repaintende Felder; insbesondere liest keine Regel `technicalStructure` (dessen Regime
Close-Brüche mitzählt, die eine spätere Pivot-Bestätigung zurücknimmt), sondern
`technicalConfirmedStructure`.

Die vier pfadabhängigen Regeln sind **nicht** PIT-stabil und sollen es nicht sein: sie sind
Aussagen über einen Verlauf und verlangen eine frühere, tatsächlich veröffentlichte Beobachtung.

| # | Zustand | Bedingung (alle Teile müssen zutreffen) | Inputs | Warum dieser Zustand | Wichtigste Invalidation | PIT-stabil |
|---|---|---|---|---|---|---|
| 1 | `INVALIDATED` | Vorzustand ∈ {SETUP_FORMING, CONFIRMED, ACTIVE, RISK_RISING} · Schlusskurs **unter** der in der früheren Beobachtung festgehaltenen Invalidationsgrenze | `previous.setupState`, `previous.invalidationPrice`, Schlusskurs | Die Lage, die zuletzt beobachtet wurde, ist gebrochen — gemessen an der Grenze von damals, nicht an einer heute neu gerechneten | *Ist* die Invalidation. Sie endet nur, wenn ein späterer Lauf wieder einen der Punkt-in-der-Zeit-Zustände erreicht | nein (Verlauf) |
| 2 | `EXIT` | Vorzustand ∈ {ACTIVE, RISK_RISING} · frühere Zielzone vorhanden · Schlusskurs **erreicht oder über** dieser Zone | `previous.setupState`, `previous.exitPrice`, Schlusskurs | Die damals dokumentierte Ausstiegsbedingung ist eingetreten. Kein Urteil über Erfolg | Ohne festgehaltene Zielzone entsteht `EXIT` nie | nein (Verlauf) |
| 3 | `RISK_RISING` | Vorzustand ∈ {CONFIRMED, ACTIVE, RISK_RISING} · Trend ≠ BEARISH · Volatilitätsregime = HIGH | `previous.setupState`, `technicalTrend`, `technicalVolatilityRegime` | Eine bestehende konstruktive Lage läuft in hohe Volatilität | Trend kippt auf BEARISH → Regel greift nicht mehr; Bruch der Grenze → Regel 1 | nein (Verlauf) |
| 4 | `RISK_RISING` | Vorzustand ∈ {CONFIRMED, ACTIVE, RISK_RISING} · Trend ≠ BEARISH · Momentum ∈ {NEGATIVE, STRONG_NEGATIVE} | `previous.setupState`, `technicalTrend`, `technicalMomentumState` | Dieselbe Lage verliert ihr Momentum. Zwei Regeln statt einer ODER-Bedingung, damit im Ergebnis steht, welcher Weg zutraf | wie 3 | nein (Verlauf) |
| 5 | `ACTIVE` | Vorzustand ∈ {CONFIRMED, ACTIVE} · Szenario-Richtung = BULLISH · Entry-Status = ACTIVE | `previous.setupState`, `technicalPrimaryDirection`, `technicalEntryStatus` | Die zuvor beobachtete Bestätigung läuft; der Kurs steht in der dokumentierten Einstiegszone | Entry-Status verlässt ACTIVE → Rückfall in die Kaskade; Grenzbruch → Regel 1 | nein (Verlauf) |
| 6 | `CONFIRMED` | bestätigte Struktur = BULLISH · Trend = BULLISH · Setup-Status = COMPLETE · Szenario-Richtung = BULLISH · Volumen ∈ {BREAKOUT_VOLUME_UP, EXPANSION} | `technicalConfirmedStructure`, `technicalTrend`, `technicalSetupStatus`, `technicalPrimaryDirection`, `technicalVolumeState` | Vier unabhängige Familien sagen am selben Stichtag dasselbe. Die Volumenbedingung verhindert, dass eine reine Kursbewegung ohne Beteiligung als Bestätigung zählt | Jede der fünf Bedingungen fällt weg → der Titel fällt in Regel 7 oder tiefer | **ja** |
| 7 | `SETUP_FORMING` | Trend = BULLISH · Setup-Status ∈ {COMPLETE, COMPLETE_LOW_RR} · Szenario-Richtung = BULLISH · Entry-Status ∈ {AWAITING_TRIGGER, AWAITING_PULLBACK} | `technicalTrend`, `technicalSetupStatus`, `technicalPrimaryDirection`, `technicalEntryStatus` | Ein vollständiges Long-Setup liegt vor, der Auslöser steht aus. `technicalSetupStatus` ist ausdrücklich **nicht** der Setup-Zustand — er ist eine von vier Bedingungen | Setup-Status fällt auf INCOMPLETE oder der Trend kippt → Regel 8/9 oder `NO_SETUP` | **ja** |
| 8 | `WATCH` | Trend = BULLISH | `technicalTrend` | Die Rahmenlage trägt, eine konkrete Situation gibt es noch nicht | Trend nicht mehr BULLISH → Regel 9 oder `NO_SETUP` | **ja** |
| 9 | `WATCH` | bestätigte Struktur = BULLISH · Abstand zum 52-Wochen-Hoch ≥ −15 % | `technicalConfirmedStructure`, `technicalDistanceTo52wHigh` | Zweiter Weg für Titel, deren Trendklassifikation noch NEUTRAL ist, deren bestätigte Struktur aber höher läuft | Struktur nicht mehr BULLISH oder Abstand > 15 % → `NO_SETUP` | **ja** |
| 10 | `NO_SETUP` | trifft immer zu | — | Auffangzustand. Eine vollwertige Antwort, keine Lücke | — | **ja** |

Reihenfolge ist Teil der Methodik: **erste passende Regel gewinnt**, ein Titel erhält genau einen
Zustand. Ein Titel ohne vollständige technische Evidenz erhält **keinen** Zustand und
insbesondere nicht `NO_SETUP` — „kein Setup" und „nicht bewertbar" sind zwei verschiedene
Aussagen.

Gemessene Verteilung über 5.676 Titel (Stichtag 2026-09-10, 0 ohne vollständige Evidenz):
`NO_SETUP` 4.017 · `WATCH` 843 (620 über Regel 8, 223 über Regel 9) · `SETUP_FORMING` 800 ·
`CONFIRMED` 16. Die vier pfadabhängigen Zustände stehen bei 0 und sind geschlossen.
