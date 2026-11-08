# Independent D review of B identity graph and admission

Reviewed `europe-review-resolution.mjs` and current official identity sources on
2026-10-09. Eighteen targeted tests passed independently, without skips.

Exact checksum-valid ISIN and LEI define share classes and issuers. Display
names do not merge companies. Distinct share classes stay separate; prior
canonical IDs are reused only for the same class and issuer. The independently
found new-class multi-listing ID bug was corrected: the single explicit primary
listing produces one Core ID, reused by secondary listings independent of input
order. Missing/multiple primary sources and protected US collisions quarantine.

New consumer admission additionally requires current-day scoped metadata,
current-day exact class/issuer official evidence, current-day source-scoped EOD,
a verified same-MIC calendar and current or immediately previous valid session.
Provider type conflicts remain review; listing country or display names do not
stand in for issuer jurisdiction. Quote currency and regulatory liquidity from
the Xetra reference are not transferred to foreign home listings. Previously
accepted identity can remain as dated identity while fresh price readiness is
unavailable; this does not certify current EOD or public eligibility.

The fresh source document contains 558 raw-verified active issuer/cash-share
identities and preserves 80 unresolved results. Its official Xetra CSV SHA256 is
`4cd88291d89a97ee46ed2746be6ba70a6c01fa2d672468a4550c72c80844a0e0`;
the observed update date is 2026-10-09. Original GLEIF query bytes, source paths,
SHA256 and retrieval times are retained outside the repository. The existing
authenticated raw replay and official-source reader remain the authority for
these proofs; graph/diagnostic helpers do not certify arbitrary caller objects.

The final universe, cohort counts and Core projection must be materialized from
the post-admission graph, after declines and prior-ID reuse. Pre-admission
foundation company/security arrays are not the final consumer cohort. This
integration consistency condition was sent to the producer before final output
generation. No approval of stale data as current or unsupported alias/MIC
equivalence is implied by this review.

The additional domestic regional-MIC preference was independently reviewed
against the original current ISO 10383 CSV. The authenticated reader rebuilt
2,883 records; source SHA256 is
`79de0f7704e260bd49b0d2439f3084891cabc93481da8bdbaa716e15a27211ed`.
FRAA retains its explicit XFRA operating relationship, while XMUN remains a
distinct operating MIC. MTAA and XNYS do not qualify. Three targeted policy tests
passed independently on Node 24.19.0, with no skips. Admission additionally
requires current domestic GLEIF/cash-share reference, regulatory liquidity,
scoped valid Xetra EUR EOD with positive volume and current/immediate-previous
calendar freshness. This is a product-primary preference; it does not assert
MIC equivalence, exchange-primary changes or public permission. The requested XETR self-operating and explicit expected-session membership,
uniqueness and ordering guards are now present. An additional independent
private regression covers inconsistent target operation, absent expected
session, duplicate sessions and reversed session order. All four regional
review tests pass, without skips. No open blocker remains in this scoped
policy; final integration counts still require the authenticated output chain.

The compiler's German-issuer index-policy exclusion was independently reviewed
and corrected without widening the existing exact cash-share predicate. A
meaningful independent actual-compiler regression passed: a DE issuer with
`regulatoryLiquid=false`, no twenty-session liquidity history and exact dated
DAX ISIN evidence can use the separate Xetra product-primary preference only
with valid recent positive-volume scoped EOD. Official XFRA primary remains
XFRA, class detail remains UNKNOWN, regulatory liquidity remains false and no
measured-liquidity evidence is created. Missing/wrong/future index evidence,
stale or invalid/nonpositive-volume EOD and US primary MIC fail admission.
Non-index measured liquidity still needs its twenty-session proof. Existing
Quant and strategy gates are not promoted. Roster membership retains its actual
`asOf`; a dated membership observation does not certify newer current index
membership or regulatory/measured liquidity.
