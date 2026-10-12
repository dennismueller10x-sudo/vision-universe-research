# German profiles and first-party source coverage

This work continues Discover V2 and the full per-issuer eligibility release. No UI,
Company Master, Quant factors, prices or access controls are changed.

## Authoritative baseline (12 October 2026)

Read-only Actions run 38239484276 restored the current private R2 state
`1cf694a2e69207ae97d4469b`. The checkpoint SHA-256 was
`a469433de4b4a614f66a43344cccc82996f126a1c340f95a5218fe96a192a473`.
The separately repeated current restoration contained 5,122 private payloads.

The live consumer baseline was `01a4e3078053f268937b099b`: 4,790 issuers,
5,089 securities and 45 German profiles. A current-Master projection instead
contains 4,784 issuers and 4,937 securities. These are distinct censuses.
The Master deliberately removed debt, ETNs, rights and warrants: 142 obsolete
listings across 70 still-present issuers, without issuer reassignment. PR #608
allows only removals independently proven by the current Master and retains
all other identity-remapping publication guards.

Profile classification over **all 5,122 private payloads**:

| Class | Count |
|---|---:|
| Approved German consumer profile | 45 |
| Source available, no reviewed German copy | 3,014 |
| Source weak, stale or withdrawn | 671 |
| No profile source | 1,382 |
| Mapping blocked | 9 |
| Source policy blocked | 1 |
| Source conflict / other | 0 |

There are 3,738 stored profile states including withdrawals, 3,684 available
source records and 3,670 exact English input matches against the committed
catalogue. Fourteen German profiles are persisted as German in the baseline;
31 additional profiles are projected from the previously reviewed editorial
catalogue. Do not mistake the former for total consumer coverage.

The 3,014 source candidates are **not 3,014 reviewed descriptions**. Extraction
can select a subsidiary, side activity or generic holding-company statement.
Such a fragment is not approved just because it has a valid SEC URL.

## Copy acceptance and recurring operation

`profile-reviewed-de.json` contains reviewed static German paraphrases, not
unreviewed translation drafts. Each description pins issuer, legal name,
English source-description hash, source-document hashes, review timestamp,
German text hash and profile version. Additional source evidence has its own
actual download hash and date; an old cached hash is never claimed to match a
new HTTP response.

Copy must describe an actual business, omit employee counts, promotion and
investment opinions, and distinguish clinical candidates from commercial
medicines. Existing profile/source validation, current-Master name checks and
first-party ownership checks remain required. A failed profile does not disable
other safe modules.

The importer uses only Python standard-library operations. No model, translation
service, new API or model package is installed in production. An offline,
free OPUS-MT preparation run produced implementation-only **unapproved drafts**;
the drafts and weights remain outside Git and production. Codex-assisted final
paraphrases are explicitly labelled `MODEL_ASSISTED_STATIC_PARAPHRASE`.

Reviewed copy is persisted into the full private ledger with its English review
source and audit entry. Annual-source changes, dated quarterly checks and
policy-safe material-event classifications queue source review. They do not
silently regenerate or overwrite German text. A news classification is a review
signal, not proof of an acquisition, disposition or medicine approval. A new
review can pin a changed annual source explicitly.

## Mandatory cases

**PayPal (PYPL, CIK 1633917):** an exact English annual-report description exists,
but the baseline has neither approved German copy nor registered news sources.
The 2025 10-K explicitly names `https://investor.pypl.com`. Native current-owner
verification independently accepted that root; this is not an ownership
exception. A one-issuer probe of its Q4 press-release RSS successfully ingested
10 records, all policy-allowed. This probe is not the production universe.

**Intellia (NTLA, CIK 1652130):** the old description is only a competitive Phase-3
claim. The checked 2025 annual and official company About page support the
reviewed CRISPR/clinical-development description. The baseline ledger has 10
news records and two proven registered GCS sources. All 10 primary news links
are HTTP and consequently all 10 are policy-excluded. The actual current owned
RSS supplies exact HTTPS links. The existing ingestion repair permits an
HTTP-to-HTTPS primary-link correction only for an exact headline, date and URL
reconfirmation from a verified first-party source; item IDs and discovery history
remain intact. HTTP and publisher policy are not relaxed.

Authoritative R2 ingestion, consumer delivery and actual live readback must be
recorded separately from these source probes before claiming resolution.

## Bounded source onboarding

The manual main-only profile/source workflow uses the existing full R2 restore,
SQLite backup, fresh R2 restore, consumer reproduction and atomic GOOD pointer.
It never initializes or promotes a smaller/cohort-only private state.

An onboarding batch has an issuer limit, 200-request maximum and 600-second
network deadline. Candidates are existing known roots or explicit source-backed
root candidates; native current ownership verification remains mandatory. The
private inventory and per-issuer outcomes are checkpointed, so successful roots
are skipped and failures obey cooldowns. Registration is not polling proof:
new-source counts require a real successful ingestion and active source state.
Unapproved publishers never enter this lane. Programming errors stop acceptance
instead of being classified as upstream outages.

New sources automatically join the existing source-centric fair queue and its
HTTP validators, caching, backoff and tier scheduling. Routine refresh does not
run this discovery campaign or perform universe discovery.

## Capacity evidence and limits

Isolated full-state source run 38237224448 (`workflow_dispatch`, not schedule):
140 public requests + 84 SEC requests, 80 sources checked, 724.553 seconds engine
runtime, 1,543 seconds end-to-end. Its registry had 5,351 approved active sources;
5,260 were due and 5,180 deferred. This is an observed backlog, not proof that
every source is checked within four hours. The first-party network budget and
polling cadence are not multiplied when profiles or sources are added.

The initial authoritative audit distinguishes 1,970 issuers with proven pollable
sources from 44 registered but not polling-proven and 3,108 without an approved
registered source. In the current-Master eligible projection, 2,819 issuers have
no proven pollable source. The older 2,014 descriptor count includes the 44
unproven registrations; it is not the same metric.

Do not extrapolate a universal four-hour SLO from one pilot. Report actual
before/after requests, runtime, source age, backlog, R2 operations and public
asset bytes from the accepted release and subsequent scheduled refresh.

## QA, publication and recovery

Mandatory browser canaries include PYPL and NTLA. A separate seeded sample
uses recorded SEC business-country/SIC evidence and disclosed dated price/share
size estimates, with 50 US and 25 issuers in each requested additional group.
Missing metadata or inadequate group size is a reported failure, not invented
sample membership. Existing browser checks exercise Discover, gate, module
composition, source links, 390/430/768/1440 widths and dark/light modes.

Initial content acceptance precedes the private/public publication stages.
A production release must preserve the previous GOOD generation, restore the
complete authoritative ledger, validate source/copy/consumer contracts, pass
candidate browsers, reproduce all consumer bytes from fresh R2 restoration,
then publish using the existing atomic pointer. The existing Pages release
serves consumer-safe assets only. Actual production browsers and R2 observation
are required afterward. A subsequent **schedule** event must prove persistence;
a manual dispatch does not count.

Existing consumer rollback and global gate remain available. Rollback never
replaces the authoritative private universe with the 46-stock consumer subset.
Remote code, copy and public-safe evidence are preserved separately from private
R2 operational state. Publication statuses are recorded only after real proof.

## Additional acceptance defects found during this work

The old submissions compaction dropped SIC and business-country metadata. A
sample consequently reported zero verified US, European and sector groups.
The gate stopped the release instead of assigning countries from the US listing
venue. The correction retains public SIC and state/country metadata only,
excluding full addresses and personal details. Bounded one-time SEC metadata
completion supports the initial QA; normal budgeted submissions refresh retains
these fields afterward. Sampling remains seeded and requires actual approved
German copy in every language-quality group. Sparse pages without copy are
additional render tests, not successful German-language reviews.

An initial candidate reproduced all consumer bytes from fresh R2 restoration,
but a screenshot failed when existing price/screener hydration replaced the
chapter after its first ready marker. All content, identity, navigation and
width checks had passed. The browser harness now waits for the established
network-hydration completion helper and checks the exact complete reviewed
profile text, including the collapsed continuation. Assertions are retained.

Copy versions bind both wording and provenance; a source-document update can
therefore receive a new review even when the German wording stays identical.
Explicit revocation or removal withdraws the profile module, keeps the full
private description/history and leaves valid financials or news available.
Current name and ownership conflicts are checked on every import, including
unchanged copy. Conflicting website ownership also excludes affected IR sources
from the refresh queue and the consumer view; independently proven SEC content
remains available.

HTTPS repairs now re-poll the existing registered owned news RSS, not only a
newly discovered endpoint. One explicit fresh read prevents an old conditional
cache body from being accepted as new HTTPS evidence. Robots, network limits,
timeouts and source cooldowns remain enforced.

## Additional acceptance and corrective reviews — 12 October 2026

The full-state isolated acceptance run [38275465524](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38275465524), event `workflow_dispatch`, passed at code `7f00fb0f271379c303e3590589211ae4a95f4417`. It restored all 5,122 private payloads, produced consumer `fe08d75e8bb936bfcc1078ab`, uploaded the complete derivative privately and verified a fresh deterministic restoration. Consumer scope: 4,869 issuers / 5,022 securities; approved German profiles: 1,029, including 984 newly reviewed static descriptions. The language sample contained 200 stocks and 430 browser cases; all required groups passed with actual approved German profiles. Available group populations: US 181, Europe 35, ADR/global 423, small/micro 170, biotech/health 80, financial 90, industrial/consumer 173. This is isolated evidence, not production readback of later catalogue changes.

Three substantive reviews found and corrected separate defects:

1. **Language and business fidelity:** incorporation paragraphs, ancillary operations, unsupported product purpose, withdrawn/stale annual sources and some wrong-name fragments are withheld. Their exact source-description hashes bind the editorial decision; a changed source needs a new review. Clinical candidates remain candidates. Strong factual descriptions continue beyond convenient cohort sizes.
2. **Ownership and delivery:** shortened Master display names omitted legal suffixes and falsely rejected Pinnacle West's matching copyright. Only an exact-CIK SEC consumer name with the same complete base and a dated record can supplement verification, without modifying Master or export identities. Devon's standard self-copyright notice repeated the exact same legal owner; the verifier now recognizes that precise grammar while retaining tests rejecting different or extended subsidiary owners. Ordinary polls of already accepted IR feeds use their existing source checks. Robots failures remain fail-closed, with no repeated robots retry storm for every endpoint on the same origin.
3. **Sampling and durability:** the first small/micro profile sample used size evidence truncated to an unrelated browser sample. The corrected sampler uses the full structurally validated numeric inventory but keeps browser work bounded. Selected public SEC country/SIC records can be reused with exact CIK, date, field and logical-hash validation; no street addresses or private checkpoint rows are committed. Full private backup/fresh restore and public consumer integrity remain separate acceptance stages.

### Intellia exact URL observations

The GitHub runner reported `ROBOTS_UNAVAILABLE:HTTP_403` for the existing Intellia IR feed; that remains a source outage, not a successful runner poll. An independent native `PublicHTTP` read in this authorized workspace checked robots and read the same registered source successfully with two requests on 12 October at 16:38:08 UTC. Full RSS body SHA-256: `3b7410b7f97f6dada7fdf960c888d8564a7bb647317b1455433996f10ee1d252`. Only ten public headline/date/HTTPS-link observations are stored; the feed body and operational state are private.

The reviewed URL correction accepts only the already registered, approved, active source and a currently accepted owner, with an exact existing issuer/headline/publication timestamp/host/path match. It delegates the correction to the existing `Store.ingest` HTTPS reconfirmation rule, preserving IDs, first discovery and previous provenance. It registers no source, creates no news and never changes source-health success timestamps. Date-only records, changed titles/times, new paths, foreign domains and conflicting owners are refused. A private application marker survives restore; observation age is bounded for first use. Runner polling outages are still reported independently. Production delivery of these corrections remains pending until the current candidate is accepted and published.

The local full Python regression suite passed 743 tests after the URL correction. Later editorial additions require the same source/hash/style contract and full production-candidate acceptance before any live count is claimed.

## Additional data-honesty review: ACH

On 2026-10-12 the actual SEC submissions endpoint
`https://data.sec.gov/submissions/CIK0000075252.json` identified
`ACCENDRA HEALTH INC/VA/`, ticker `ACH`, exchange `NYSE`, formerly
`OWENS & MINOR INC/VA/`. The committed SEC consumer agrees, as of
2026-10-05. The current Master instead labels this security Aluminum
Corporation of China. This is a **consumer entity-name conflict**, not
proof that the current ACH-to-CIK pair is wrong. The existing operator
disable for this issuer prevents surfacing US healthcare financials under
the Chinese-company label in the next validated generation. No Master,
price, factor or security identifiers are changed. ACH becomes a permanent
negative browser canary. The separately required Master display correction
remains documented; normal Discover remains available.

The native `schedule` run 38287243830 (2026-10-12T17:53:40Z) was observed,
but failed before publication. It is not evidence of a successful scheduled
refresh. The previously opaque failure was reproduced in isolated run
38286748683: Ranger Energy Services (`iss_cik_0001699039`) disagreed with
the rendered Aktuelles module at the 90-day clock boundary. The export now
uses exact elapsed time for known publication clocks and calendar days for
date-only records; the UI retains date-only precision. The previous GOOD
was preserved. Local full suites passed 744 Python and 117 Node tests after
this correction; a source-bound German investment-wording test was added
subsequently. Production acceptance is still pending.

A further prose review removed 44 nonfactual padding sentences and withdrew
eight generic/legal-only descriptions. Approved catalogue counts are not
live coverage counts until the actual generation and production readback
are accepted.

## Complete catalogue review and pre-release evidence

The available 3,678-entry English catalogue was reviewed without an arbitrary
count cap. The final static catalogue contains 2,832 approved German copies:
2,829 match entries in that catalogue and three additional mandatory annual
source snapshots fill missing catalogue entries (Intel, ASML and Netflix).
Uber's newer annual snapshot replaces an inadequate older source fragment.
There are 812 hash-bound withheld fragments and 37 remaining catalogue entries
already covered by existing independently approved German copy. These sets do
not overlap. The private universe still contains 5,122 issuers, including issuers
without profile sources. Approved text bytes: 746,111; preparation catalogue:
2,768,761 bytes. These are preparation measurements, not production coverage.
No preparation catalogue is copied into the public Pages configuration.

Full local regressions passed 745 Python and 117 Node tests. The separate
explicit recovery contracts subsequently passed alongside the existing storage,
rollback and publication tests (15 cases). A seeded source/text review used
seed 20261012 and additional actual language-group samples; clinical status,
noncommercial development, mining/exploration, third-party manufacturing and
external management were checked against the underlying source text. Earlier
padding and ancillary-only fragments were withdrawn rather than counted.

Isolated authenticated run
[38290819358](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38290819358)
passed at code `849250fb5a0a6df20658bd584e011cf1345228f8` with 2,002 reviewed
copies, before the final catalogue. Complete private generation
`11b3bd67dc25889556426490`, fresh checkpoint SHA-256
`8b0ded0f62ab5b329eac240ec4fbe509901e1f832835f39ecc035adfc25ebe44`,
consumer `44c4c141bf995e3b5855cb18`: 4,906 issuers / 5,059 stocks,
2,046 German profiles, 5,532 assets and 100,769,718 consumer bytes.
All 432 broad browser cases plus 132 delta/permanent-canary cases passed.
Language groups required actual approved German profiles, with 202 sampled
stocks and all mandatory group targets met. This is not final production proof.

That run proved Intellia's ten existing ledger records reached the allowed
consumer news array: 10 ledger / 10 allowed / 0 excluded / 10 consumer.
PayPal remained 0 / 0 / 0 / 0; its missing news was not manufactured.
Source polling proof increased from 1,970 to 1,972 distinct issuers (three new
source rows, two newly covered issuers). The source registry contained 5,387
rows; registration and source-row counts are not issuer coverage. Source
onboarding used 87 requests for 16 bounded candidates from the existing
616-candidate resumable queue. It did not crawl the universe.

The observed full deep acceptance took 3,429 seconds, with 138 public and 84 SEC
routine requests, 709.814 seconds engine time, 80 sources checked and 5,171 due
sources deferred. One-time QA metadata completion and browser matrices are
additional release work; they are not inserted into the four-hour scheduler.
The growing number of eligible profile-only issuers can increase the public
no-pollable-source count even while genuine source coverage improves.

## Existing production rollback discovered during final readback

Production Pages run
[38289015350](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38289015350)
failed actual browser acceptance at 18:25 UTC on 12 October. The evidence shows
Apple's ordinary Discover page displayed "Gerade nicht erreichbar", with no
Company Intelligence requests and no JavaScript errors. The existing safety
handler rolled back the consumer to `80b801c85d5a33d0e57dc8d5`, selected
`ROLLBACK_46` and disabled the public gate. Subsequent successful Pages runs
verified gate-off behavior; they were not successful live Company Intelligence
acceptance. At 20:12 UTC both intelligence proof endpoints returned 404 and the
served rollout had `productionOff:true`. This is separate from the profile
candidate and the Ranger exact-clock defect.

An explicit `recover_full_scope` publication option handles this proven
operational state. It is main-only and requires the prior accepted full-eligible
receipt, a policy-approved full GOOD and freshly restored immutable 46-stock
rollback. It leaves both existing gates unchanged and publicly closed during
full private restore, profile/source processing, consumer contracts, broad
candidate browsers, R2 upload, fresh restore, byte reproduction and candidate
GOOD readback. Only that successful production candidate can restore the
existing full eligibility namespace and public gate. A failed activation
readback closes the public gate and restores the original scope pointer.
Normal scheduled refresh cannot invoke this explicit recovery option.
The gate's enable check validates the actually selected active GOOD, including
full eligibility, instead of accidentally validating only the legacy 46-stock
namespace. Existing source and per-issuer gates remain mandatory.

The production workflow then uses existing Pages deployment and actual live
browser acceptance. A material regression retains the existing rollback/OFF
handler. No source outage or mere successful private backup authorizes opening
an empty or inaccessible consumer generation. Final release evidence and the
subsequent real `schedule` event must still be recorded after publication.
