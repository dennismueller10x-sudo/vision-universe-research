# Phase 19 — preserve historical research selection

Base PR81 dd01dfb83c5ecc77768e6a4399123954093e71d5. Active Master §§21,39–42,64–67: exact identity, preserved research context, honest unavailable states. No SEC-owned contract edits.

Owned: Fundamentals view in vu2/experience.js, existing browser QA and execution docs. Existing Historical Fundamentals service remains authoritative.

Fix: valid unsupported tickers stay selected and unavailable rather than silently opening NVDA. Invalid ticker/metric/period links fail explicitly before a history request. Saved links carry all three choices, including unavailable TTM. Selection changes replace prior evidence with loading state while retaining request-order protection.

Acceptance: existing45 browser checks plus expanded history interactions at1440/390: saved net-income/TTM roundtrip, unsupported TSLA retained without chart, invalid metric rejected, return to valid revenue history. Syntax/diff checks targeted; remote visual gate required. No new formulas, period derivations, PIT claims or provider tests.

Rollback: revert the additive history navigation behavior. No data/storage mutation.

Initial Browser34684696201 PASS (45 checks). Desktop/390 screenshots inspected; added20px separation between reusable-link action and company evidence header. Refreshed visual gate pending.
