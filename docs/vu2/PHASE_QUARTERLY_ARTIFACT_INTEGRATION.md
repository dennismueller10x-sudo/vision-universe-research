# Quarterly history through existing release projection

Base: a3f3ebe8e6e8b77a7d196730e0787d4810387336 (PR117).
Existing delivery, SEC Consumer, Company Master and 8 MiB SEC budget remain authoritative.
No SEC generator/normalization, R2, Discovery, provider or serving configuration changes.

Active requirements: outside the five inspector names, consume existing standalone
quarterly facts in Quant historical fundamentals. Preserve units, fiscal periods,
filing dates, accession, derived flag and latest-as-of semantics. No new formula,
TTM claim, acceptedAt inference or PIT/backtest certification.

Measured existing input: 5,067 SEC consumer files / 87,198,341 bytes. Complete
consumer gzip per issuer still13,959,164bytes: cannot be delivered under8MiB.
Quarterly projection restricted to the ten existing history-workspace metrics and
required metadata measured5,259,622gzip bytes before eligibility filtering; plus
existing2,762,729bytes gives8,022,351 <8,388,608. The actual build gate must verify.
Do not copy whole consumer bundles or move SEC bytes outside budget accounting.

Implementation: extend scripts/vu2/build-release.mjs, the existing release generator,
with deterministic per-issuer compressed projections; eligible CIKs come from
Company Master. Every emitted compressed byte stays in existing SEC accounting.
Product Service resolves canonical identity before fetching one same-origin file;
bounded decompression then existing history presentation contract. No universe fanout.

Acceptance: preserved annual/inspector behavior, real TSLA quarterly rows match SEC
consumer exactly, currencies/derived rows preserved, invalid identity/time/schema
rejected, TTM remains unavailable, no mocks in production, unchanged Discovery.
Targeted projection/contract/service tests, release/SEC budget, remote Quant/SEC,
Browser/mobile/accessibility and actual production quarterly smoke required.
Rollback: base release. No canonical source mutation. Full PIT/revision history
and full-universe Quant/screener integration remain separate open ledger items.

Full local artifact validation found four source shares_outstanding tracks with
future period ends, not a serving/parser error. The common history validator now
also guards release projection: whole invalid metric withheld with explicit
unavailableMetrics reason. No source fact is altered, no future row delivered, and
unrelated valid metrics stay intact. Regression tests use all four real CIK cases.
