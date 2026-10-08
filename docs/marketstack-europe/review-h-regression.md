# Independent H — regression safety

Reviewed 8 October 2026. Baseline main:
`2165c4bb70542962d2d22741a018470f84815bcf`.
Status: **APPROVED FOR ISOLATED PRIVATE FOUNDATION**, with independently verified
B/C admission fixes and public display gated.

## Independent baseline comparison

Without Git commands, the reviewer recomputed Git blob SHA-1 from local bytes
and compared 2,447 existing code/configuration/test paths with exact baseline
GitHub trees. Zero existing paths are missing. Exactly seven intentional files
differ: six Discover UI/route files and the explicit EUROPE factory branch in
`screener/engine/adapters.js`. Existing static/remote US adapter bodies are unchanged.
Existing Quant methods, configuration and tests, Tiingo/SEC providers, core
client/identity, SuperTrader strategies/engines, Vorsorge source engines and
existing workflow schedules match the baseline. Europe modules are additive.

The full fixture restoration reproduced 59,215 exact baseline files with every
Git blob hash verified and zero overwrites. SHA-256 snapshots of all 59,241
protected data files before and after the broad test run are identical. Final
scope proof and suite logs are retained privately in `restored-regression/`.

Connector transplant #520, head `dd51462f`, has passing Core, contract, marker and
other test checks. Quant run 37795844740/job 113374961933 reports 2,517/2,522 tests
passing and the same five existing failures: JPM canonical total-return conflict,
JPM no-adjustment event, two total-return verification subprocesses and the
technical watchlist migration alert expectation. Both #479 secret false positives
are resolved without weakening guards.

## Integration and isolation

The optional Europe contract delegates non-Europe reads to the existing US client
with unchanged arguments. Europe requires explicit region and canonical identity;
no IDs are formed in the product contract. Display/commercial evidence defaults
closed, with raw EOD licensing separate from canonical EOD. Optional product adapters integrate the existing UI only through explicit Europe
configuration and qualified rights evidence; the default US route is unchanged. Separate readiness produces no scores, ranking
admission, US population change or SuperTrader strategy change. D/F cross-security
and stale-series findings were corrected and independently reread.

Node 22.23.3 final connector/foundation suite passed 222/222 after the B/C
future/uncompleted-session/request-range and post-checkpoint collector fixes. Independent B/C and UCITS
compiler regression cases passed 52/52. All twelve non-Quant requested full suite
groups pass with restored fixtures. Full Quant coverage across 223 requested files
passes 2,528/2,533, retaining exactly the five independently reproduced baseline
failures and no new integration failures. Both broad and Quant continuation data
snapshots remain unchanged. Details are in `REGRESSION_VALIDATION.md`. The explicit Chromium/WebKit/iPhone13-emulation browser
matrix passed 10/10 with zero provider requests and zero axe violations. Private
raw responses and metadata are preserved with provenance; no recurring
Marketstack schedule or public licensed-data delivery is authorized.

Discover/Search/Charts, Screener/Technical, Quant, SuperTrader and Vorsorge product
changes remain separate later PRs under their existing isolation rules. A private
readiness status or successful ingestion does not authorize any of those merges
or public display of licensed data.
