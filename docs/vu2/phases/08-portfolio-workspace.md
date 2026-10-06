# Active phase — manually recorded portfolio positions

Base PR70 head9acee5dbc4be61e92aa60fa12c136e948689faad, dedicated workstream/vu2-portfolio-workspace. Requirements Master50/55/67/91. Research2: clear value, explanation and evidence, full professional links retained.

No existing portfolio store is replaced. Browser-local manually entered ticker/quantity positions start empty. Product service values only existing approved USD quotes, using unchanged market metrics. Missing/denied/future/non-USD prices, overflow or mixed dates suppress total and all weights; unknown held tickers remain visible. No broker execution, return, FX, sector classification or aggregate risk score invented. Existing legacy Watchlist/Strategies preserved.

Affected: portfolio-workspace.js, product service, VU2 route/CSS/index, focused tests, browser QA, ledger. Acceptance: exact input retention, numeric tolerance for ordinary floating-point valuation, complete weights, no partial total, corrupt-store errors, reload/add/edit/remove journey,1440/390 screenshots. Targeted tests before remote phase gate; no provider-scale tests needed. Rollback additive route/adapter; retain local record. Remaining gaps: accounts/sync, cash, currencies, transactions, historical returns and validated risk/exposure analytics.
