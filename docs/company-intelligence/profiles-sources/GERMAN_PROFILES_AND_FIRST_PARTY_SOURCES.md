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
