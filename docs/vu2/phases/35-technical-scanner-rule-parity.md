# Technical Scanner — Canonical Rule parity

Baseline: `9916365cab53269b64f8cc3ac750c93ff482dd37` (`origin/main`).

## Scope

This tranche removes the Technical Scanner's second filter evaluator. Its legacy
request shape remains accepted only as an input adapter:

`{ field, op, value } → canonical field/operator → RuleContract → Query.matches`

No SetupState lifecycle transition, Radar/Signal/Watchlist consumer, historical
feature series, Backtest certification, data provider, pipeline or endpoint is
added. Discovery is untouched.

## Canonical current-snapshot fields

The existing four fields remain unchanged. Thirteen scanner fields are added to
the shared Catalog and Metric Registry:

| Legacy scanner field | Canonical field | Type / unit |
| --- | --- | --- |
| `scorePercentile` | `technicalOpportunityPercentile` | number / pctl |
| `riskReward` | `technicalRiskReward` | number / ratio |
| `structure` | `technicalStructure` | enum |
| `momentum` | `technicalMomentumState` | enum |
| `relativeStrength` | `technicalRelativeStrengthState` | enum |
| `rsPercentile` | `technicalRelativeStrengthPercentile` | number / pctl |
| `confidence` | `technicalScenarioConfidence` | number / score |
| `setupStatus` | `technicalSetupStatus` | enum |
| `entryStatus` | `technicalEntryStatus` | enum |
| `volatilityRegime` | `technicalVolatilityRegime` | enum |
| `volume` | `technicalVolumeState` | enum |
| `distanceTo52wHigh` | `technicalDistanceTo52wHigh` | decimal ratio |
| `momentum12M` | `technicalMomentum12MReturn` | decimal ratio |

All seventeen scanner-accessible canonical fields are explicitly
`CURRENT_SNAPSHOT_ONLY`, `NOT_CERTIFIED` for historical Backtesting, and not
probabilities. `technicalScenarioConfidence` is a methodology/confluence score,
not an outcome probability. The two decimal-return fields intentionally do not
alias the similarly named factor fields, whose units are percentage points.

## Fail-closed boundary

The old operators are translated to Query operators. A combination that the
canonical typed Query contract does not support is rejected; it is not evaluated
by fallback code. In particular, legacy numeric `in` is no longer accepted,
because `in` is defined only for string/enum fields. Enum membership remains
supported. Missing values never match, including `ne`.

The cross-sectional percentile fields remain tied to the scanner's declared
`universeId`/`universeVersion`. The adapter writes both values into the Rule
Contract as `constituentSetId`/`constituentSetVersion`; evaluation rejects a
predicate whose bound set differs from the scan. They do not claim a stable
historical rank.

## Recovery and acceptance

Rollback is a code revert. No stored product data or infrastructure is mutated.
Acceptance requires focused parity/adversarial tests, the full Quant suite and a
diff proving no `discover/**` or `discover-v2/**` change. Remote CI/deployment is
outside this local tranche.
