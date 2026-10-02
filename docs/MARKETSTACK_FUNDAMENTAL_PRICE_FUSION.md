# Marketstack prices with existing canonical company fundamentals

The isolated experiment demonstrates that the existing SEC fundamental engine can consume a different price source without replacing its facts. It does **not** certify Marketstack for full Quant or publish new valuation metrics. All actual sampled valuations remain blocked by missing independent provider issuer verification and share-count/price corporate-action basis. Historical technical and methodology gates remain separate.

The machine report is [fundamental_price_fusion_validation.json](../reports/marketstack/fundamental_price_fusion_validation.json). It records 12 cases: AAPL, NVDA and TSM US controls; six actual European local listings; and the existing US SAP, ASML and NVO registrant references. The latter references do not establish a local European company join.

| Company / listing | Existing canonical fundamentals | Join evidence | Result |
| --- | --- | --- | --- |
| Apple / AAPL | SEC quarterly, TTM and annual; 24 unpriced existing-engine raw inputs | Existing canonical security ID → CIK/company ID | Diagnostic internal join; provider issuer and price/share action basis unverified |
| NVIDIA / NVDA | SEC quarterly, TTM and annual; 24 unpriced raw inputs | Existing canonical security ID → CIK/company ID | Same limitation |
| TSMC / TSM | SEC canonical, 11 unpriced raw inputs | Existing canonical security ID → CIK/company ID | Trading/reporting currency and listing share basis additionally block valuation |
| SAP / Xetra | No exactly linked local canonical fundamental document | Local ISIN and LEI retained; company ID remains null | Blocked; US SAP SEC facts are not inherited by name |
| Siemens / Xetra | No exactly linked canonical document | Local listing identity retained | Blocked |
| Rheinmetall / Xetra | No exactly linked canonical document | Local listing identity retained | Blocked |
| ASML / Amsterdam | No exactly linked local canonical document | Local ISIN/LEI retained | Blocked; US ASML SEC annual data does not prove the local share-class join |
| LVMH / Paris | Official ESEF FY 2023 and 2024: 12 facts, six metrics | Exact local LEI **and** ISIN match the existing official company | Isolated company projection works; partial annual coverage, no full Quant |
| Novo Nordisk / Copenhagen | No exactly linked local canonical document | Local ISIN/LEI retained | Blocked; US NVO SEC reference does not prove this local share class |

The existing US SAP, ASML and NVO SEC references provide 12, 12 and 13 unpriced raw inputs respectively, but lack complete comparable TTM coverage. The cached US ASML latest row also reports EUR for its expected USD listing, so its price is rejected. No local listing is relabeled as an ADR or receives an inferred ratio.

## Conditional valuation feasibility

Two explicit **counterfactual** runs assume the missing independent Marketstack issuer identity and verified share-count/price basis for AAPL and NVDA. The actual cached latest observations and existing real SEC documents then produce:

- Market capitalization, P/E, P/S, P/B and FCF yield for both controls.
- 30 fundamental raw inputs per control through the existing `FundamentalInputs.compute`, versus 24 without a market capitalization.
- No EV/Sales or EV/EBITDA: aligned current net-debt inputs are absent. Annual debt is not silently substituted for current debt.

These calculations prove conditional arithmetic and existing-engine compatibility, not the missing evidence. Their numerical values are not published in the public report. The actual safe valuation count and new full-Quant admission count are both **zero**. Existing Tiingo-based calculations continue unchanged.

P/B preserves the existing engine's maximum 400-day reported balance-sheet alignment policy. All other requested price-dependent ratios require the appropriate positive denominator and aligned canonical TTM/instant unit. Missing values remain null. A filed shares-outstanding observation alone does not prove a current post-split price basis.

## Hard gates and company ownership

The experiment reuses `quant/engines/fundamental-inputs.js` and `quant/engines/global-equities.js`. It requires exact canonical CIK/security membership, independent provider issuer verification, provider symbol/MIC agreement, valid native-currency EOD OHLC, the current-price coverage gate, PIT instant shares, one attributable security per issuer, and verified share-count/price corporate-action basis. ETFs, unknown share classes, weighted-average shares, future periods, future filings, unverified ADR ratios and incompatible currencies fail closed. No synthetic FX rate is supplied.

SEC availability follows the existing conservative filing-date EOD contract; the experiment does not claim intraday acceptance-time certification. The ESEF join requires both LEI and ISIN, exact fact company ownership, the original normalized provenance, filing availability and currency. The LVMH facts remain company-owned; all listing projections point to one canonical document. The report never creates a second company ID from a similar name or duplicates a fundamental document per listing.

ESEF monetary facts use the existing `currency_m` canonical unit, while SEC consumer monetary values are absolute currency. This experiment keeps their source contracts distinct and does not pass millions as absolute values into the SEC consumer engine. LVMH annual facts do not become synthetic quarterly or TTM facts. Conflicting net-income/equity candidates remain quarantined.

## Fresh shared provider retest

The shared real request run `36964230530` was reused without further calls. Its AAPL history has 689/689 explicitly USD bars; NVDA has 396/689 explicitly USD bars, with other bars missing currency or reporting a conflicting currency. Both selected closing observations have exact XNAS identity and USD on the requested historical cutoff **2026-09-30**. Their closes match the retained September 30 latest observations (relative delta zero). This is a bounded closing-price retest, not certification of retroactive historical restatement or October 2 live freshness. Both actual fusion evaluations remain blocked by issuer verification and share-count/price action basis. The accepted US directory/latest coverage denominators are unchanged.

## Real-source replay and regression evidence

The retained official LVMH package was replayed through the existing official parser with `--offline`, into a private output directory. It returned **12 facts and 543 existing diagnostic issues**. After excluding retrieval/ingestion timestamps, every semantic field was identical to the committed artifact, and the diagnostic multiset was identical. No network request was made, no diagnostic was suppressed, and no SEC/ESEF production artifact was written.

The report records source byte hashes before/after reading, existing engine hashes and the replay hashes. All consumed protected source bytes remained unchanged. Marketstack Professional facts/concepts/submissions entitlement remains the previously measured restriction; this run does not repeat paid calls or claim a successful provider-fundamental comparison. SEC EDGAR remains primary and ESEF remains the official European architecture.

## Reproduction

```sh
python3 scripts/fundamentals/official.py \
  --manifest=quant/config/official-filings/lvmh-2024.json \
  --document=.market-cache/official-filings/27dc362ea0c99e1cc927a54e6dd85e7c0c3403ac39d072e6f7a4d855038c65d3.filing \
  --offline --out=/workspace/scratch/marketstack-fitness-esef-replay

node scripts/market/validate-marketstack-fundamental-price-fusion.mjs \
  --us-latest=/workspace/scratch/marketstack-probe-5/us-latest.json \
  --esef-replay=/workspace/scratch/marketstack-fitness-esef-replay/e445f306efaefa02af884472a00f9aa23548b05e46ed72b23579e1f2a9c8591c.json \
  --fresh-history=/workspace/scratch/marketstack-product-fitness-run-36964230530/probe.json \
  --as-of=2026-09-30 --generated-at=2026-10-02T04:30:00.000Z

node --test quant/tests/marketstack-fundamental-price-fusion.test.mjs \
  quant/tests/fundamental-inputs.test.mjs \
  quant/tests/global-equities.test.mjs \
  quant/tests/pit-fundamental-history.test.mjs
```

The last command passed **64 tests, zero failures, zero skips**: 28 new fusion tests plus 36 related existing tests. Real cached provider observations were used for the report and conditional calculations; unit tests use explicit disposable quotes alongside real SEC/ESEF documents. This component made no provider API calls or additional Marketstack charges. It reused the root-coordinated 75-credit validation snapshot as well as prior caches; the shared 75 credits are counted once in the overall run, not again here. Private cache paths can be relocated; reproduce with the original input bytes and the report's explicit as-of and generation dates. The replay itself records a new ingestion time, so reuse retained replay bytes to reproduce its byte hash; semantic comparison excludes only those ingestion/retrieval timestamps.
