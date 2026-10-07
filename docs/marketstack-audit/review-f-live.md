# Independent review F — final metadata preservation and closing plan

**PASS**, no open regression/safety blocker. No paid provider requests, network mutations or repository edits by reviewer.

Reviewed adapter metadata/normalization extension, tests, final focused plan and append-only frozen lease manifest. `getTicker`/`getTickerInfo` retain original `.data` transport shape and add cloned `.raw` plus typed `.observations`. `resolveTicker` adds typed observation without changing provider-observation-only identity admission. Issuer country/code now stay separate from exchange country/code, preventing venue country from being silently fabricated as issuer domicile. All original fields remain in raw.

Final plan:46 explicit operations, same42-case plan, no realtime/minute-paced probes.13 ETF-holdings requests reserve260 credits;33 other initial attempts reserve33, yielding293 minimum estimated credits. Directory/history pagination can increase this, safely bounded by closing lease400. Existing allocation1800 and verification1200 remain unchanged; closing400 gives cumulative frozen3400, leaving100 under hard cap3500. Prior run leases cannot be reused, even after failures. Existing exactSHA/manualevent/actor/ref/replay controls and encrypted-only artifacts remain unchanged.

Independent combined tests:97/97 passed on available Nodev24.19.0 (Marketstack plus Core identity/provider registry/Tiingo adapter/wiring); output saved `/workspace/scratch/marketstack-audit/review-f-final97.tap`. Product-isolation gate passed with no production file changed. Parent separately validates Node22.

Technical closing-plan readiness is confirmed; root must follow its stated sequence: review completed second-run raw evidence before deciding/dispatched final run. No inference about provider capabilities is made from test success or still-active second run. Final account credits must still distinguish conservative reservation estimate from observed billing.

## Final multi-venue snapshot fix recheck

**PASS**, no open blocker after live-proven stockprice query/venue correction. The snapshot request omits unsupported MIC query filtering, accepts only caller-explicit snapshot symbols, selects by actual provider MIC or explicit observed provider code/name mappings, requires mapping-source evidence for supplied mappings, rejects unknown or ambiguous venue selection, and preserves all provider venues in raw. Four-character generic provider codes such as BCBA are no longer inferred to be MICs. Conflicting reported MICs cannot be selected through a descriptive-code mapping. Country and timestamp semantics remain observational: snapshot country denotes exchange-country, delay remains UNKNOWN, timestamps without explicit offsets remain NOT_REPORTED.

Independent replay of actual second-run raw response0128: AAPL unscoped stockprice contained5 venues; corrected adapter selected exactlyNASDAQ335.36USD with XNAS mapping from observed EOD, retained raw all5 venues unchanged and retained delayUNKNOWN. Paid provider calls by replay:0.

Final plan now55 operations,9 stockprice attempts; minimum8×61sec=8m8s pacing fits25-minute job with other-request overhead.13 holdings attempts reserve260 plus42 other first attempts reserve42 =>302 estimate before additional pagination, bounded by unchanged final400 allocation/cumulative3400. Frozen prior allocations/replay/identity/source/encryption controls remain intact.

Latest independent full regression result:99/99 passed, zero failures; `/workspace/scratch/marketstack-audit/review-f-final99.tap`. Product-isolation gate passed. Reviewer uses available Nodev24.19.0; parent separately runs Node22. No provider request, repository edit or network mutation by reviewer.
