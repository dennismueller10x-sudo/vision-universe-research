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

## Two locks, held separately

The owner approved the methodology as version 1 on **2026-09-23** and, in the same decision,
kept the four course-of-events states shut. Those are two different questions, so they are two
different locks — and the second one is not "the methodology is still unapproved".

| Lock | Covers | State |
|---|---|---|
| `stateMapping.approval` | the methodology, and with it the four point-in-time states | **`APPROVED`** |
| `stateMapping.pathDependentActivation` | `ACTIVE`, `RISK_RISING`, `INVALIDATED`, `EXIT` | **`PENDING_HISTORY`** |

Machine-readable in `methodology.gateStatus`, so no consumer has to read prose:

```
SETUP_MAPPING_V1_APPROVED   = PASS
SNAPSHOT_STATES_ACTIVE      = PASS
PATH_DEPENDENT_STATES_ACTIVE = false
PATH_DEPENDENT_STATES_GATE   = PENDING_HISTORY
```

**A point-in-time state now publishes on its own evidence.** It needs no history, because it
makes no claim about one. The only remaining reason a lifecycle is `UNAVAILABLE` is
`SETUP_INPUTS_INCOMPLETE` — a title without complete technical evidence gets *no* state, and
specifically not `NO_SETUP`.

**A published point-in-time state never implies the other four were considered.** The
observation carries `pathTier` as its own field — `{ state: "CLOSED", reason:
"PATH_DEPENDENT_STATES_NOT_ACTIVATED" }` — and the publication gate throws if a path-dependent
state is published while that tier is closed. In the interface the four states stay visible in
the journey, greyed and labelled *noch nicht freigeschaltet*, so a reader can see they exist and
why they say nothing yet.

## The activation gate, measured rather than asserted

`quant/data/product/setup-observations-v1/activation-gate.json`, rebuilt on every
materialization. Seven checks, each `PASS`, `FAIL` or `NOT_EVALUABLE`:

| Check | Asks | Passes when |
|---|---|---|
| `TRANSITION_MATRIX` | which state-to-state transitions actually occur | every path state is reached from a valid predecessor, and no transition appears that the cascade cannot produce |
| `STATE_PERSISTENCE` | how long a state holds before it changes | the median run of each path state is at least two observations — one means noise, not a course of events |
| `REVERSAL_BEHAVIOUR` | how often a title snaps straight back | fewer than a fifth of transitions are immediate reversals |
| `INVALIDATION_BEHAVIOUR` | is `INVALIDATED` backed by the level stored then | every observed case is recomputable against the stored level; none without one |
| `EXIT_BEHAVIOUR` | is `EXIT` backed by the zone stored then | same, against the stored target zone |
| `NO_RETROACTIVE_STATE_CHANGE` | did a published state change afterwards | every stored observation still matches its own content hash |
| `SUFFICIENT_OBSERVATION_DURATION` | is there enough ordered history to say anything | at least 12 ordered observations over at least 90 days |

Too little history is reported as `NOT_EVALUABLE`, never `FAIL`: it is a "not yet", not a "no",
and it resolves by itself as observations accumulate. **An unmeasured check never counts as
passed.**

**The report never opens the gate.** Opening needs the report *and* the owner setting
`pathDependentActivation.state` to `ACTIVE`. Measured evidence alone would be self-approval; a
switch alone would be blind. `validateMapping()` refuses a contract that stands the tier open
while any check is not `PASS`, so the two locks cannot be short-circuited from either side.

Today, with one published observation: `NO_RETROACTIVE_STATE_CHANGE` passes, the other six read
`NOT_EVALUABLE`, measured readiness is `PENDING_HISTORY`.

## Measured breadth

At data cutoff `2026-09-10`, over 5,676 instruments — the full technical-capable universe,
with **0** titles missing required evidence:

| State | Count |
|---|---:|
| `NO_SETUP` | 4,017 |
| `WATCH` | 843 |
| `SETUP_FORMING` | 800 |
| `CONFIRMED` | 16 |
| `ACTIVE` / `RISK_RISING` / `INVALIDATED` / `EXIT` | 0 — path tier closed by its own gate |

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

---

# Die Screening-Seite derselben Regel

Eine Beobachtung beantwortet „wo steht dieser Titel". Die andere Hälfte derselben Produktfrage
ist „welche Titel stehen dort" — und das ist dieselbe Regel, andersherum gelesen. Jede
Punkt-in-der-Zeit-Regel ist ein kanonisches Regelprädikat (§20), trägt denselben
`predicateHash` und ist damit bereits eine Screener-Abfrage. Es entsteht keine zweite Engine,
kein zweites Vokabular und kein zweiter Schwellenwert.

## Warum das Prädikat allein die falsche Liste ergibt

Die Kaskade ist **erste passende Regel gewinnt**. Ein Titel, der das WATCH-Prädikat erfüllt,
aber bereits von CONFIRMED genommen wurde, ist CONFIRMED — nicht WATCH. Wer das Prädikat
direkt als Zustandsliste ausliefert, zeigt also weiter fortgeschrittene Titel als
zurückliegende. Gemessen am Stichtag 2026-09-10:

| Regel | Treffer des Prädikats | tatsächlich zugeordnet | von vorrangiger Regel belegt |
|---|---:|---:|---:|
| `setup.confirmed.structure-trend-volume` | 16 | 16 | 0 |
| `setup.forming.complete-setup-awaiting-trigger` | 808 | 800 | 8 |
| `setup.watch.bullish-trend` | 1.436 | 620 | 816 |
| `setup.watch.confirmed-structure-near-high` | 867 | 223 | 644 |

Beim Zustand *Beobachten* wäre die Liste um Faktor 2,3 zu lang gewesen, und jeder der 816
zusätzlichen Titel steht in Wahrheit weiter vorn. Deshalb kommt die veröffentlichte Liste aus
der **Zuordnung** der Kaskade, nicht aus dem Prädikat.

## Der Abgleich, der beides zusammenhält

`SetupEngine.reconcile()` führt für jede screenbare Regel das Prädikat über genau die Zeilen
aus, die die Kaskade gesehen hat, und ordnet jede Differenz einem Grund zu:

- **zugeordnet, aber vom Prädikat abgelehnt** — muss leer sein. Ein Eintrag hier hieße, dass
  zwei Auswerter zu verschiedenen Antworten gekommen sind.
- **vom Prädikat getroffen, von vorrangiger Regel belegt** — erwartet und gezählt.
- **unvollständige Eingaben** — der Titel hat gar keinen Zustand; er wird namentlich als
  solcher geführt und nicht stillschweigend weggelassen.
- **unerklärt** — muss leer sein.

`assertParity()` wirft, sobald eine der beiden Pflichtmengen nicht leer ist. Der Materializer
ruft sie **vor** dem Schreiben: ein abgedrifteter Index wird nicht mit einer Warnung
veröffentlicht, sondern gar nicht. Die Workflow-Zusammenfassung trägt den Bericht
(`screen-parity.json`) mit.

## Was veröffentlicht wird

`quant/data/product/setup-observations-v1/screen-index.json.gz` — 6,8 KB komprimiert, also weit
innerhalb der Browser-Grenzen (128 KiB komprimiert / 1 MiB entpackt), und in **einem** Abruf
statt über 634 Shards.

Zwei Dinge stehen bewusst nicht darin:

- **Der Auffangzustand trägt keine Titelliste.** `NO_SETUP` hat kein Prädikat; „alles, was keine
  andere Regel genommen hat" ist keine Eigenschaft eines Titels. Die Zahl bleibt, damit die
  Besetzungen zusammen das Universum ergeben.
- **Eine geschlossene Stufe trägt keine Null, sondern ihren Grund.** `count` ist `null`, solange
  `pathDependentActivation` nicht `ACTIVE` ist. Ein veröffentlichtes „INVALIDATED: 0" läse sich
  als „kein Titel ist invalidiert" — eine Aussage über das Universum, die diese Engine sich
  nicht verdient hat, solange die vier Verlaufszustände nie ausgewertet wurden.

## Wo es in der Oberfläche steht

| Fläche | Was sie zeigt |
|---|---|
| Aktienseite, Abschnitt *Situation* | „Welche Aktien stehen gerade an derselben Stelle?" — Anzahl und Titel in der Lage dieser Aktie |
| Radar | *Lage im Markt* — die Besetzung aller acht Zustände, geschlossene Stufen gedämpft mit Begründung statt Zahl |
| Screener, `?setupRule=…` | Die Trefferliste einer einzelnen Regel, als **Ergebnis** und nicht als bearbeitbare Abfrage |

Der letzte Punkt ist Absicht und kein fehlendes Feature: Würde die Regel in den Regeleditor
geladen, liefe dort das Prädikat — und damit exakt die Liste, die oben um 816 Titel zu lang ist.
Das Ergebnisfeld nennt stattdessen den `predicateHash` der Regel, aus der die Liste stammt.

Alle Nutzertexte dieser Flächen stammen aus dem Product-Language-Wörterbuch
(`setupScreen`, `setupStateCount`); ein Test prüft, dass keine Fläche die Regel selbst auswertet
und dass kein Zustandscode als Text auf die Seite gelangt.
