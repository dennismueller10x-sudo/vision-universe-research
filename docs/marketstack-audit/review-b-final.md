# Final independent review B — portable website/API parity artifacts

Reviewed 2026-10-07. Read-only verification; zero account requests or credits; no repository edits.

## Passed

- All 66 files in `website-raw-manifest.json` exist relative to `docs/marketstack-audit/`; every SHA256 matches.
- Every matrix evidence path resolves portably and its SHA256 matches.
- All 38 non-null preferred ticker/MIC pairs occur together in the referenced public raw website JSON. Schaeffler appropriately has no preferred domestic ticker.
- JSON and CSV each contain 39 cases: 27 stocks and 12 ETFs. Recomputed counts match reported values: 26 stock home listings, 27 any stock listings, 12 ETF listings.
- Every `authenticatedApiFound` is UNKNOWN and every raw latest/history result is NOT_TESTED. Every root cause remains UNKNOWN_PENDING_AUTHENTICATED_ACCOUNT. No website observation is asserted as current account API support or a negative provider coverage conclusion.
- `vuFound` identifies no Marketstack connector in the audited main baseline; it does not claim the issuer or US ADR is absent from the product universe.
- Representative primary provider candidates match observed website ticker/MIC pairs; Schaeffler stays unresolved. Candidate basis disclaims canonical identity. ASML.XAMS, MC.XPAR and AIR.XPAR are observed alternative notations for the same named listings, with identity still unverified.

## Blocking representative-plan issue

`representative-plan.json` promotes broad name-search results to executable `aliases`. Several are distinct issuers or funds:

| Target | Incorrect alias candidates | Raw identity |
|---|---|---|
| Siemens | ENR.DE, SHL.DE | Siemens Energy; Siemens Healthineers |
| Allianz | 0P0001MSJP, 0P0001L7DJ | Allianz investment funds |
| Fresenius | FME.DE | Fresenius Medical Care |
| ABB | ABT.SW | Abbott Laboratories |
| Nordea | 0P0000W9V5 | Nordea investment fund |

ABBNE.SW additionally needs independent share-class identity verification before alias use. A brand substring and identical MIC cannot prove same-security aliases. `resolveTicker` tries these candidates and can return success from exact symbol/MIC alone, so a failed primary candidate could wrongly resolve another issuer.

Required correction: remove unrelated search matches from executable `aliases`. Keep validated candidate notations only; retain broad search matches as explicitly unverified observations. Prefer renaming website matrix `aliases` to `observedSearchMatches` because its rows intentionally include broad unverified company-search matches, not established same-security aliases.

## Verdict

Portable evidence, counts, primary candidates and conservative API classifications PASS. Representative execution plan is BLOCKED until unrelated alias candidates are removed. No paid execution should rely on this alias set.

## Recheck after corrections — final disposition PASS

Rechecked updated repository artifacts 2026-10-07. All 42 representative plan cases have no executable aliases. All 39 matrix cases now use `observedSearchMatches`, preserving raw search observations without claiming same-security alias identity. Provider resolver explicitly returns `identityVerified:false` and `PROVIDER_OBSERVATION_ONLY`; this remains a provider observation and grants no canonical/product admission.

All 66 fixture manifest hashes and every matrix evidence hash/path pass again. Counts remain correct (27 stocks, 12 ETFs; 26 stock home listings, 27 any stock listings, 12 ETF listings). API/root-cause classifications remain UNKNOWN. The previously reported alias blocker is resolved. Final review B disposition: PASS, subject to the already documented absence of authenticated current-account API evidence. No paid requests or repository edits by reviewer.
