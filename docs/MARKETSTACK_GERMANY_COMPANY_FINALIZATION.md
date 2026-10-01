# German company, security and listing finalization

The 11,487 distinct broad-equity listing identities measured on German venues are a venue census, not a count of German companies. The accepted Marketstack and global identity layers remain unchanged. This audit introduces no production admission, provider switch, company merger or price rewrite.

## Measured identity levels

The exact observed census contains 11,612 provider observations, 11,487 listing identities after 125 provider aliases, and 10,808 security ISINs. Of those securities, 679 occur on both measured German venues. Listing deduplication uses `(ISIN, MIC, trading currency)`, security deduplication uses exact ISIN, and company deduplication uses independently verified issuer LEI. Names, ticker strings, DE ISIN prefixes and German trading venues never establish company domicile.

| Verified subset | Count |
| --- | ---: |
| German-domiciled ordinary/preferred share issuers | 432 companies |
| Of those, German incorporation jurisdiction | 427 companies |
| German ordinary shares with active venue reference | 424 security ISINs |
| German preferred shares with active venue reference | 17 security ISINs |
| Combined reference-active ordinary/preferred shares | 441 security ISINs |
| Their distinct German venue listings | 790 listing identities |
| Bounded identity/price/trading-validated German share candidates | 226 security ISINs |
| Proposed selected company listings, one per company | 218 listings |
| German share issuers without sufficient selection evidence | 214 companies |
| Verified foreign E-class share listings traded on German venues | 9,388 listing identities |
| Broad cash-equity candidates belonging to verified foreign issuers | 10,529 listing identities |
| Ambiguous issuer/domicile listing identities | 80 listing identities |

**Reference-active is not a claim of recent trading, complete history, liquidity or safe adjusted prices.** The full German company total remains `null`: the other venue directories still have unclassified instruments, and some exact observed listings retain unresolved issuer evidence.

The broad German-domiciled legal-security-issuer subset separately contains 437 issuer LEIs and 878 listing candidates. It includes 82 depositary-receipt ISINs and three collective-instrument-CFI securities associated with legal REIT companies. It must not be substituted for the 432 verified ordinary/preferred company count. The 83 receipt listings are reported separately and do not create ordinary German equities or new consumer entities. CFI collective instruments require legal-role review; they are not automatically ETFs or invalid companies.

Five verified share issuers have a German legal address but a foreign incorporation jurisdiction. Domicile in this audit means GLEIF legal-address country. Headquarters country and incorporation jurisdiction remain separate fields. Company counts identify legal security issuers, not automatically corporate groups or assumed depositary-receipt underlying companies.

## Official issuer and security evidence

One current GLEIF/ANNA bulk ISIN-to-LEI snapshot was downloaded and joined by exact ISIN. Current ESMA FIRDS published-reference facets supplement missing issuer links and establish CFI share classes. GLEIF legal-entity records establish the linked issuer's legal name, legal-address country, jurisdiction, headquarters and entity status. The source files, URLs, original response hashes and retrieval dates are retained in the machine artifacts. Each reporting-reference observation remains distinct from a traded listing.

Across the strict European and supplemental operator candidate input, 12,025 ISINs were checked: 11,895 issuer links are usable under their declared source tier, 88 GLEIF/FIRDS issuer disagreements remain quarantined, 32 FIRDS-only reporting-operator proxy cases are withheld, and ten lack usable issuer linkage. The reviewed proxy guard covers eight exact venue-operator LEIs, corroborated against 77 official ISO 10383 registrations. It does not veto verified ANNA/GLEIF security links or listed exchange parent companies. For example, a Japanese REIT record referring to Frankfurter Wertpapierbörse never gains German issuer domicile.

CFI `ES` identifies ordinary shares, `EP` preferred shares and `ED` depositary receipts. Generic T7 `CS` establishes a broad cash-equity instrument but does not establish ordinary-share rights. Unknown or contradictory rights remain explicit. A collective-instrument CFI can occur for a legal REIT company; a CFI category alone never invents fund domicile, ETF status or UCITS authorization.

The committed builders implement both enrichment and quarantine, and test CLI replay. The analysis used 233 public reference requests, including the bulk mapping, regulatory facets, legal-entity batches and ISO source. Cached public and Marketstack evidence was reused; **zero additional Marketstack credits** were spent on this German finalization.

## Consumer proposal rules

Selection requires an exact verified issuer link and German legal-address domicile; ordinary/preferred regulatory share type; an active official instrument reference and active legal entity; provider ISIN identity verification; an already validated recent OHLC sample within the existing three-calendar-day freshness gate; and at least one positive-volume observation in that bounded sample. Identity conflicts, inactive references, stale/invalid prices, absent volume and zero-volume-only samples remain excluded or pending evidence. Every company and listing retains its complete reasons.

No market-cap floor or new arbitrary turnover threshold was introduced. The protected global selection policy in `quant/config/global-equities.json` requires at least **250 history bars and USD 5 million average daily turnover** for all candidates, together with verified price coverage and the preferred primary/US-ADR listing rules in `global-equities.js#selectPreferred`. The research proposals do not bypass that policy. **Zero new German company proposals are verified to pass all existing production-selection and adjustment-safety gates; the actual eligible total remains `null`.** USD turnover, primary-listing proof and adjusted-price safety are missing, and raw EUR prices are never converted through assumed FX. Policy bytes and observed delivered history input hashes are recorded in the artifacts.

Positive volume across the existing short sample rejects demonstrably dead observations, but does not certify long-term liquidity or fill historical gaps. Liquidity confidence is `PARTIAL`. Eight proposals have observed median daily volume below 100 shares (a descriptive caution, not a new selection cutoff): SUR, SYT, DAM, E4C, MVV1, GTY, RSL2 and MXHN. These remain research candidates requiring turnover and history evidence, rather than certified liquid consumer admissions.

One candidate is proposed per verified company. Selection prefers Xetra, then greater observed median volume, then a deterministic identity-key order. Other share classes and venues remain represented in the audit. The 218 proposals include companies beyond the major indices and do not modify the live universe. No selected row enables Quant, SuperTrader, backtests or production routing. The 58 accepted global records and their charts remain preserved.

## Artifacts and deterministic replay

- `germany_company_issuer_reference.json`: exact official issuer links, legal reference fields, unresolved conflicts and proxy evidence.
- `germany_security_type_reference.json`: exact ISIN/CFI/issuer facets, complete source URLs and response hashes.
- `reporting_venue_issuer_proxy_reference.json`: official ISO registrations supporting the reviewed proxy guard.
- `germany_company_listing_finalization.json`: all 11,487 listing identities, issuer/security/company grouping, share rights and disjoint primary selection reasons.
- `germany_consumer_selection.json`: all German issuer decisions and the 218 proposals.
- `marketstack_canonical_regulatory_type_conflicts.json`: canonical broad-equity overlaps requiring regulatory-role review. The one observed case, QFG/XBRU, is metadata-only; no accepted baseline chart is changed.

The committed CLI pipeline is:

```sh
node scripts/market/build-marketstack-issuer-reference.mjs --mapping-subset=PATH_TO_CAPTURED_MAPPING_SUBSET --lei-record-index=PATH_TO_CAPTURED_GLEIF_INDEX --out=PATH_TO_DIRECT_REFERENCE
node scripts/market/build-marketstack-security-reference.mjs --captured=PATH_TO_CAPTURED_FIRDS_INDEX --out=reports/marketstack/germany_security_type_reference.json --issuer-reference=PATH_TO_DIRECT_REFERENCE --lei-record-index=PATH_TO_CAPTURED_GLEIF_INDEX --operator-reference=reports/marketstack/reporting_venue_issuer_proxy_reference.json --issuer-out=reports/marketstack/germany_company_issuer_reference.json
node scripts/market/finalize-marketstack-germany-companies.mjs --universe=reports/marketstack/germany_marketstack_universe.json --issuers=reports/marketstack/germany_company_issuer_reference.json --validation=reports/marketstack/germany_full_equity_validation.json --canonical=quant/data/global-market/listings.json --security-references=reports/marketstack/germany_security_type_reference.json --probe=PATH_TO_CAPTURED_MARKETSTACK_PROBE --out=reports/marketstack/germany_company_listing_finalization.json --consumer-out=reports/marketstack/germany_consumer_selection.json
```

The finalizer reads the unchanged existing global-equity policy by default (or an explicit `--policy` input) and records its SHA-256. It measures delivered chart-bar counts without treating close-only history as verified OHLC or adjustment evidence. No CLI performs network requests. `generatedAt` comes from stored source timestamps, with an optional explicit `--generated-at` override. The original market-data snapshot date is retained separately. Replay uses the same immutable inputs, including captured official responses; it does not re-query Marketstack.
