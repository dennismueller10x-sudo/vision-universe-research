# Independent D review of C quality wrapper

Reviewed `scripts/marketstack/europe21-quality.mjs` and targeted tests on
2026-10-09. The wrapper delegates bar validation and technical computation to
the existing engines. Additions are restricted to dates absent from the cached
raw observations; protected quarantine dates and existing dates cannot be
replaced. New invalid, duplicate, foreign-MIC, future and malformed-currency
observations stay quarantined. Research projections retain protected barriers
through `researchQuality` and never promote strict Quant/strategy/public gates.

Source authentication remains the existing raw-response loader's explicit
responsibility. Callers must pass the full authenticated cache, immutable prior
quarantine dates and project `researchQuality`, rather than its plain diagnostic
`quality` member. This is an upstream evidence contract, not provider-origin
certification by this helper. Prior cached observations are not inferred to be
current provider delay evidence.

The final seven targeted wrapper tests passed independently with zero skips. C
requires an explicit `protectedQuarantineDates` array and its missing-input
negative control passed. The producer overlay binds actual cached/new inputs,
prior quarantine dates and unchanged research output hashes, labels those as
local integrity receipts and retains the upstream source authentication
requirement. Changed calendar/identity conditions cannot release a protected
date: it is removed from both valid quality bars and research projections while
the original reference remains quarantined. No blocker
found in the reviewed source boundaries; existing quarantined bars are not
released.
