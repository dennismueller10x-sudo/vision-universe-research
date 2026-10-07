# Independent review F — signed one-shot push fallback

**PASS**, no open blocker. No real provider request, network mutation or repository edit by this reviewer.

## Source and invocation controls

Reviewed `.github/workflows/marketstack-probe.yml`, `scripts/marketstack/actions-audit.mjs`, cumulative authorization manifest, final verification plan, adapter observed mapping extension and tests. Push events apply only to audit branch and exact `scripts/marketstack/final-live-trigger.json` path. No schedule or general push provider invocation was added. Run lease/title is fixed to final-20261007 for push, avoiding undefined-input replay identity. Manual runs retain owner and exact expectedSHA checks.

Push actor may be the configured MCP app; signer-bound source controls substitute for owner-actor authorization on this specific fallback. RSA-PSS SHA256 with explicit32-byte salt validates canonical payload binding PR479, exact ref, final lease and reviewed sourceSHA. Marker lease/SHA must match canonical payload; event.before must equal signed reviewed source, HEAD must have that sole parent, and diff from parent toHEAD must contain only exactmarker. Checkout fetch-depth2 supplies parent. Source-changing commits, merge commits, another lease/source, another changed path and invalid signature fail before provider-secret step. Marker contains no runtime arguments; bounded plan/cap come from reviewed parent manifest. Private signing/decryption key remains outside repo/Actions; committed public key and signature expose no secret.

## Replay, accounting and isolation

History scan now sees all audit-branch events, including push/manual. Same workflow/title lease cannot run twice even if first failed/cancelled. Missing currentrun or incomplete history fails closed. Runattempt1, concurrency, immutable event source, no retries/cache, durable pre-fetch credit reservation and encrypted-only artifacts remain. Publish reviewed source first without marker; then publish separate signed marker-only commit. Later documentation edits do not retrigger markerpath.

Frozen allocations1800+1200+400+100 exactly3500. Existing ids/caps remain unchanged; final100 is not reusable on failure. Final plan21 operations over same42cases:3 holdings×20=60 plus18 first attempts=18 =>78estimatedcredits, hard-bounded100.8 stockprice attempts require7×61sec=7m7s endpoint spacing.90-second complete body timeout is validated in1000..90000range; no extra retries introduced. Product/production write paths remain absent; token contents/actions permissions stay read-only, with no merge/deployment/schedule/product ingestion step.

## Connector observations

Static snapshot provider-code mappings are linked to actual raw stockprice and exact ticker metadata evidence (response ids+hashes), deeply frozen, and retain provenance in normalized observations. Canonical ticker selection is explicit caller input, no suffix invention. Generic code four-character strings are not inferredMICs. Conflicting reportedMIC, unknown venue and ambiguous selected venue still reject. Timestamp/freshness/delay conclusions remain evidence-dependent.

## Independent verification

103/103 combined Marketstack/Core identity/provider registry/Tiingo adapter/wiring tests passed on available Nodev24.19.0; output `/workspace/scratch/marketstack-audit/review-f-push-final.tap`. Signed-push unit cases reject mismatched eventbefore, multiple parents, extra source changedpath, wrong lease, wrong source and invalidsignature. Production-isolation gate passed with no production file changed. Parent separately handles Node22.

Safety review verifies technical readiness, not authenticated provider result. Final report must distinguish reserved estimatedcredits from observed accountbilling.

# Independent review F — final authenticated execution addendum

**PASS**, no open execution-safety blocker. Reviewer performed local read/replay/hash/signature checks only: zero paid provider calls, zero network mutations, zero repository edits.

## Actual durable accounting

Independently read each decrypted raw-run authorization, credits.json, summary.json, transport counters and raw response metadata. Durable reservations agree with transport attempted-request/estimated-credit counters; every run stayed within its frozen allocation.

| Run | Lease cap | Attempts | Reserved estimated credits | Stored raw responses |
|---|---:|---:|---:|---:|
|37636729908|1800|326|782|325|
|37638353777|1200|145|411|143|
|37642262870|400|55|302|53|
|37645399592|100|21|78|21|
|Total|3500|547|1573|542|

All four runs report zero retries, zero cache hits and zero production writes. Five attempts have no stored response; reservations still count those attempts, so transport failure cannot silently reclaim credits. All542 raw response bytes independently match their persisted SHA256 metadata. Reserved1573 is below target2000 and hard cap3500, but is not asserted as observed account billing. Frozen allocation total3500 is fully assigned and consumed leases cannot be reused.

## Signed final source

Independently verified the actual committed signature with existing recipient public key. Marker commit`0cf0f30402d7499b3c241688e770fd1db67cd5ab` has sole parent/reviewed source`86c22095e57fb1cada304b10ea3e572efc52fee9`; parent-to-marker diff contains only` scripts/marketstack/final-live-trigger.json`. Canonical signature binds PR479/ref/finallease/sourceSHA; final authorization binds markerSHA and run37645399592. Frozen final lease100 is unchanged. No production/deployment/merge/schedule operation appears in this execution path.

## Final response safety and limits

Final21 operations stored21 raw responses. Three UCITS-holdings probes(SXR8.DE,CSPX.AS,SPY5.L) returned providerHTTP504 HTML, preserved as original raw body and status; normalized result is`invalidResponse`. This is evidence of upstream gateway failure, not a missing JSON normalization fix, tariff rejection or universal unsupported UCITS coverage. No extra retries/provider calls were made to force a result. Seven snapshot results and seven EOD freshness results succeeded; one snapshot remained venue-unverified. Their provider capability/latency interpretation belongs in semantic reviews and must not be replaced by successful workflow status.

Prior full independent regression verification103/103 and production-isolation gate passed; no new connector code changed after reviewed signedsource for finalrun. Raw artifacts remain private/encrypted; report evidence publishes ids/hashes/observations rather than credentials or complete provider payloads. PR remains draft with no merge authorized/performed.

Final publication review: request/credit/raw totals and source verified. SAP pagination wording corrected to third page among144 rows; parity scope39 plus three separate action controls explicitly stated. UCITS operationalflag is scoped, underlying gateway-failure coverage remains UNCLEAR.
