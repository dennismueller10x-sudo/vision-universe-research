# Independent review — measured bootstrap and refresh report

Reviewed 2026-10-08 with Node 22.23.3. Final selective report/credits tests: **13/13 passed**, zero skips. No paid calls, schedules, production writes or author-module edits. Status: **APPROVED FOR PRIVATE CONSERVATIVE REPORTING** after both fixes below; bounded execution's durable ledger remains separately reviewed.

**G-R1, medium, fixed and independently reverified: impossible measured lease totals.** The original discovery summary with one request and 24,999 reserved credits now throws MEASURED_LEASE_ACCOUNTING_MISMATCH. The report uses the execution runner's frozen allocations (1,000 discovery, 14,000 foundation, 10,000 completion), rejects per-lease breaches, and validates supplied budget maxCredits/runId against that lease. A locally hashed summary records its bytes; it does not by itself authenticate paid transport or provider billing.

**G-R2, medium, fixed and independently reverified: refresh inventory listing identity.** Inventory keys now prefer existing listingId/listingKey and then exact MIC/providerSymbol/providerTicker; securityId alone never deduplicates price listings. The original XETR/XSWX alternatives now produce two listings/two daily symbol credits, while identical providerTicker/MIC observations deduplicate to one. Missing listing identities remain explicitly unresolved.

Verified safeguards: HTTP request counts remain separate from conservative symbol credits; failures/raw response coverage are visible; actual billed credits are null, safe monthly cost remains unverified, and no schedule is enabled. Monthly plan 100,000 is labelled user-stated. Per-MIC batching reduces requests rather than symbol credit units. The report sums supplied private observations and does not alter execution authorization.

Both original offline counterexamples were independently rerun against the fixes. No remaining inspected blocker for private scenario arithmetic. Actual run summaries and accepted listing inventories still need final evidence reconciliation; safe monthly capacity and actual billed credits remain unverified.
