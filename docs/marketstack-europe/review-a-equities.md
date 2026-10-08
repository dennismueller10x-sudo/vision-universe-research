# Independent review A — European equities

Reviewer: UCITS foundation agent, independent of the equity foundation author.
Scope: `scripts/marketstack/europe-universe.mjs`, its tests, corrected connector directory observation contract, and Core identity architecture. Offline only; no paid calls or production writes.

## Findings and reproducible cases

1. **Admission blocker: explicit share-class type conflict.** A provider observation with `type: "preferred stock"`, active SAP/XETR and checksum-valid ISIN `DE0007164600`, combined with verified identity evidence declaring `securityType: "common stock"`, initially produced `ACCEPTED`, `kind: "ORDINARY"`, no reasons. This bypasses preferred relevance. Explicit provider common/preferred evidence must conflict with a disagreeing verified type; broad ambiguous provider stock labels may still be resolved by verified evidence. Reported to author and lead.
2. **Same-listing currency conflict.** Two observations of the same symbol/MIC/ISIN with EUR and USD initially produced an accepted listing using the first EUR value. All raw observations survive, but the chosen normalized currency is not established. Require `CONFLICTING_LISTING_CURRENCY` and review instead of first-match selection.
3. **Invalid membership evidence date.** `{ index: "DAX", isin: "DE0007164600", asOf: "banana", source: "official" }` initially attached DAX membership. Require a real ISO calendar date, and exclude future membership evidence when the build has a known effective date.

These cases were executed against the author's working file and communicated directly. All three were corrected and independently rechecked: explicit common/preferred disagreement adds `CONFLICTING_INSTRUMENT_TYPE`; contradictory listing currency adds `CONFLICTING_LISTING_CURRENCY`; malformed and future effective membership dates are excluded.

## Positive controls

- The corrected connector's `{raw, normalized}` directory shape is handled, including `providerTicker` and MIC-valued `providerExchange`; provider acronym alone is not a MIC.
- Complete raw and input copies survive discovery, including unknown fields and duplicate observations.
- ISIN checksum, LEI checksum, provenance-backed issuer evidence, explicit issuer country, verified primary MIC, instrument type and active status gate admission independently.
- COMPANY / SECURITY / LISTING are distinct. Exact ISIN secondary listings share one primary security ID; names and listing countries do not create issuers.
- Canonical IDs use `core/identity.js`, and proposed provider-qualified symbols preserve US symbol namespaces. Protected-ID and separator-normalization collisions fail closed when the caller supplies the protected-ID set.
- Germany has first priority; all thirteen requested country groups are represented. Discovery has no 817 cap. Index membership uses exact ISIN rather than ticker/name guesses.
- The explicitly authorized `GERMANY_LIQUID_LOCAL_XETRA` product-primary policy keeps the regulatory primary-market MIC separate. Official Xetra `CS` evidence can admit an exact German liquid cash-equity share class only with the required active/liquid venue evidence, checksum-valid ISIN/LEI and hash-backed exact GLEIF issuer-jurisdiction evidence. Its share-class detail remains `UNKNOWN`; it does not invent an ordinary/preferred classification. Broad provider Equity alone still requires review.
- Private discovery does not authorize publication; all returned records remain behind price, readiness and rights gates.

## Scope limits

The caller must supply the complete protected US canonical-ID inventory, current verified issuer/share-class/primary-listing evidence, and dated index rosters. The function cannot infer missing index targets or bridge different issuer namespaces without evidence. Unknown issuer identity stays review, so listing availability must not be reported as accepted-company coverage.

## Final disposition

**PASS for private discovery foundation.** Final independent rerun on 2026-10-08: 19/19 equity tests passed, including the subsequently authorized official German cash-share policy. Equity test isolation passed with no production file changed. The in-progress inactive-listing regression was fixed, and inactive listings remain rejected. Listing activity evidence now requires the listing MIC plus exact symbol or exact ISIN, so a secondary venue cannot inherit the primary venue's active status.

No unresolved admission blocker was found after these corrections. No approval of public or production data delivery is implied by this code review; caller evidence completeness and price/rights gates remain required.
