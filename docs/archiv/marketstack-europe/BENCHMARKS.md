# European benchmark policy

Relative strength remains blocked until a benchmark's identity, price basis, currency, full historical series and calendar have been verified. These are intended reference families, not a statement that Marketstack supplies their histories. A latest index quote or a matching index name cannot pass the historical gate.

Select against the primary listing's market and quote currency, rather than the issuer's legal domicile. Retain an explicit reference ID and selection reason in each security projection. Never fall back to a US benchmark.

| Listing market | Intended reference | Required native currency |
| --- | --- | --- |
| Germany | DAX price-return variant (DAXK), not the performance variant | EUR |
| France | CAC 40 price-return variant | EUR |
| Netherlands | AEX price-return variant | EUR |
| Switzerland | SMI price-return variant | CHF |
| United Kingdom | FTSE 100 price-return variant | GBP |
| Sweden | OMX Stockholm 30 price-return variant | SEK |
| Denmark | OMX Copenhagen 25 price-return variant | DKK |
| Norway | Verified Norwegian broad/large-cap price-return variant; exact reference still open | NOK |
| Finland | OMX Helsinki 25 price-return variant | EUR |
| Spain | IBEX 35 price-return variant | EUR |
| Italy | FTSE MIB price-return variant | EUR |
| Austria | ATX price-return variant | EUR |
| Belgium | BEL 20 price-return variant | EUR |
| Explicit pan-European comparison | STOXX Europe 600 price-return EUR variant | EUR |
| Explicit euro-area comparison | EURO STOXX 50 price-return EUR variant | EUR |

Admission requires the unchanged canonical-series validator and engine data hash, an independently certified split/price basis, exact benchmark identity and return-type evidence, adequate common observations, and a verified European calendar. At least 253 relevant observations are needed for the current Technical readiness gate. A stock quote in GBX cannot be compared with a GBP index by silently changing units; a documented currency/unit projection is required. FX conversion and total-return comparisons require their own certified projections.

A UCITS fund tracking an index is a fund proxy, with expenses, distributions and tracking differences. Its name, domicile or accumulation label does not establish an equivalent price-return index series. It must be explicitly selected and separately certified; neither XESC nor EUN2 automatically opens RS.

This bootstrap has no certified benchmark history. Outputs therefore retain `RS_BLOCKED`, `benchmarkVerified: false`, and the unchanged engine's missing-input behavior. No scores or strategies are modified by this policy. A future benchmark producer is separate from source discovery and public-rights approval.
