# Final independent regression validation

Reviewed 8 October 2026 with Node 22.23.3 and restored exact baseline fixtures.
**All twelve non-Quant suite groups pass. Full Quant coverage completes at
2,528/2,533 passing, with exactly five independently reproduced baseline failures
and zero introduced integration failures.** Quant is not reported as green.
The validation does not authorize public delivery, production data replacement,
ranking admission, strategy execution or a new refresh schedule.

## Local suite evidence

| Suite | Passed | Failed/errors | Skipped | Total |
|---|---:|---:|---:|---:|
| Connector/foundation, final post-checkpoint collector and evidence fixes | 222 | 0 | 0 | 222 |
| Core | 94 | 0 | 0 | 94 |
| Identity | 26 | 0 | 0 | 26 |
| Market data | 55 | 0 | 0 | 55 |
| Discover | 345 | 0 | 7 | 352 |
| Screener | 32 | 0 | 1 | 33 |
| Quant, complete composite covering all 223 requested files | 2,528 | 5 baseline | 0 | 2,533 |
| ESEF/official-filings Europe contract | 15 | 0 | 0 | 15 |
| SEC Node | 57 | 0 | 0 | 57 |
| SEC Python | 490 | 0 | 0 | 490 |
| Existing SEC exporter/PIT Python guards | 32 | 0 | 0 | 32 |
| SuperTrader | 241 | 0 | 0 | 241 |
| Vorsorge | 158 | 0 | 0 | 158 |

These groups overlap; totals must not be added together. The owner restored
59,215 missing files (1,406,501,306 bytes) from the exact public baseline SHA
archive, verifying every Git blob hash and overwriting zero existing files.
The prior sparse failures disappeared from the completed suites; the old sparse
run is retained privately as history, not the final outcome. Quant reached the
harness's 900-second limit in the unchanged Elliott registry product-view module
after 470 ordered test results across 35 complete files. The unchanged heavy
module then passed 4/4 in isolation, and all 187 remaining files completed
2,055/2,059. This composite accounts for all 223 requested files without double-counting
results or repeating completed prefix cases. It reproduces the same five baseline failures
as #520 CI; the eleven additional tests are the isolated Europe Quant adapter.

All restored-data suites put Node22 first in PATH for child processes as well.
Discover's seven skips are four optional `sharp` image checks and three opt-in
browser scenarios. Screener skips its absent optional plain Technical index.
The separate explicit browser matrix passed all
10 tests without skips. Chromium mobile, WebKit desktop and WebKit iPhone13
emulation each recorded zero provider calls and zero axe violations across
existing US detail, European search, native-currency/raw-basis detail and dark
Watchlist reload. iPhone13 evidence is emulation, not physical hardware.

## Scope and data protection

Exact baseline main: `2165c4bb70542962d2d22741a018470f84815bcf`.
Current main observed during final review:
`884bbb961c277ff4bc2c00da7143680853fd2ffe`.

The reviewer recomputed Git blob hashes from filesystem bytes and compared
2,447 existing code/configuration/test files with exact baseline GitHub trees.
No existing paths are missing. Seven existing files differ: six intentional
Discover UI/route files and `screener/engine/adapters.js`. The Screener change
adds only an explicit EUROPE factory branch; existing static/remote US adapters
are unchanged. Existing Quant engines, configuration, methodology, tests,
Tiingo/SEC providers, core identity/client, SuperTrader engines/strategies,
Vorsorge source engines and existing workflow schedules match the baseline.
Europe code is otherwise additive and staged in separate product PRs.

Protected data-tree SHA-256 snapshots before and after the full restored broad
run were identical: **59,241 files, zero changed paths**. The complete Quant
continuation independently produced the same 59,241-file, zero-change result.
This is a test-run isolation proof. It cannot
detect a transient write followed by exact restoration. Tests may use read-only
Git metadata internally; the reviewer performed no Git mutations.

## Connector #520 CI diagnosis

Quant run `37795844740`, job `113374961933`: 2,517/2,522 pass; five failures,
zero introduced connector failures after both original secret false positives
were fixed without weakening the guard.

Four failures share one independently reproduced existing US source defect:
baseline JPM provider adjustment does not account for the reported dividend
on 6 October 2026. The unchanged canonical reconstruction correctly reports
`CONFLICT_CANONICAL_WINS`; the existing adjustment classifier reports one
`NO_ADJUSTMENT_AT_ALL` event. An exact unchanged provider verifier, run against
that baseline blob in a private mirror, returns `INCONSISTENT` and exit 1.
That explains CTR18, the Golden Five assertion and both verifier subprocess
tests. No price, dividend or adjustment was edited.

The fifth failure is a stale migration-specific alert assertion. Baseline
`alerts.json` explicitly has `previousIndex:true`, `suppressed:null` and no
events; the unchanged alert contract correctly returns `NONE`, while the test
expects `SUPPRESSED` from an older migration. A separate test-only correction
can keep explicit synthetic migration suppression cases and check current
clean-run behavior without modifying US data or methodology. The four JPM
failures require a separate source-quality/contract decision; deleting the
event, excluding the ticker or blindly accepting its adjusted values would
conceal the measured defect and is not an integration fix.

## Fixture provenance and retained outputs

Targeted CI reproducers fetched only the exact baseline JPM blob and alert
document into a private directory. The later complete fixture restoration uses
producer-owned files from that same baseline archive, not manufactured empty
substitutes or old Marketstack audit responses. It restores eligibility/universe
lists, golden-path research pages/charts, price/technical/strategy/fundamental
artifacts, SEC consumer/inspector/PIT output, SuperTrader output and Vorsorge
indexes/funding/intelligence data. The N-PORT fixture pipeline now passes with
the existing ETF index restored.

Private JSON status, suite logs, missing-path list, baseline scope proof,
byte-isolation proof, `quant-complete-composite.json` and browser evidence are retained at
`/workspace/marketstack-europe-private/restored-regression/`. The prior sparse
run and exact CI reproducers remain at
`/workspace/marketstack-europe-private/final-regression/`. Restoration provenance:
`/workspace/marketstack-europe-private/baseline-fixtures-restoration.json`.


The final frozen publisher/helper source was checked after the last adjustment
correction and the refreshed actual product replay: all **222 provider/foundation
tests pass**, with no skips. The admitted-series adjustment view is 258 PARTIAL
and 1 UNKNOWN; the full-raw diagnostic remains 206 INVALID, 52 PARTIAL and 1
UNKNOWN. Quarantined raw observations remain retained. These are distinct input
scopes and do not certify universal provider-adjusted prices. The final cost
report binds immutable equity manifest `2110b0aca8cd391ef31dc9cf8e808f7d32eea98766cc9ff1e9c7a27ce751a19b`;
its inventory remains 259 equity listings plus 40 ETF identities, and its monthly
scenario remains 9,770 credits. No other broad suites or paid calls were rerun.
