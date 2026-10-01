# Measured adjustment and Global Select diagnostics

The machine evidence is in
`reports/marketstack/marketstack_scale_adjustments.json` and
`reports/marketstack/global_select_marketstack_coverage.json`. Analysis performs
no provider calls, reconstructed prices, production writes or Quant admission.
Cached observations retain their original retrieval dates and run provenance.
Final replay uses the accepted original Action snapshots and the corrected
scale provenance container; each observation retains its own original run or
explicit unknown attribution. Replay-container run IDs never become response
provenance. Requested trading-date
bounds and exact listing identity are checked before a row can establish
usable history. Complete issue counts are preserved; detailed issue dates
are sampled to the first 20 per window, with an explicit truncation flag and
the complete input evidence hash.

## Official action controls

| Listing | Official control | Measured provider behavior |
| --- | --- | --- |
| SAP.DE / XETR | Four-for-one ordinary-share split; listing amendment 2006-12-21 | Tested historical EOD window and split endpoint returned empty. The official SEC report says SAP ADS holders received no additional ADS; the local split must not be applied to the US ADS. |
| ADS.DE / XETR | Four-for-one Adidas split effective 2006-06-06 | Tested historical EOD window and split endpoint returned empty. No 2025 split is assumed. |
| NOVO-B.CO / XCSE | Official annual report states local split on 2023-09-13 | Raw and adjusted close both fall 1367.8 to 681.5 on 2023-09-12, a ratio of 2.0070. EOD split factors remain 1; the split endpoint returns empty. This exposes an unadjusted gap and a date discrepancy requiring investigation. |
| NVO / XNYS | Official report distinguishes ADR split on 2023-09-20 | Raw close 187.05 to 94.73, adjusted close 93.525 to 94.73; factor 2 and split endpoint date agree with the official control. This bounded control does not certify all history or adjusted-volume methodology. |
| 7974.T / XJPX | Nintendo ten-for-one, record 2022-09-30; legal effective 2022-10-01 | Reported raw close is continuous around provider factor 10 on 2022-09-29; split endpoint empty. A second price adjustment could introduce a false gap. The official source used does not establish an exchange ex-date. |
| 6758.T / XJPX | Sony five-for-one, record 2024-09-30; legal effective 2024-10-01 | Raw close drops 13775 to 2848 on 2024-09-26, while factor 5 appears on 2024-09-27. Adjusted close retains a roughly fivefold gap. Split endpoint empty; exchange ex-date remains unverified independently. |
| 7203.T / XJPX | Toyota five-for-one, record 2021-09-30; legal effective 2021-10-01 | Reported raw prices remain continuous, but EOD factor 5 appears twice, on 2021-09-29 and 2021-10-01. Split endpoint empty. Neither factor is automatically applied; no local split is applied to TM ADS data. |
| MBG.DE / XETR | Daimler Truck first listing/spinoff 2021-12-10 | The tested EOD series is broadly continuous. Split and dividend endpoints return empty. A spinoff cannot be validated or reconstructed as an ordinary scalar stock split. |
| ASML.AS / XAMS | Official issuer SEC-filed release establishes ex-entitlement 2012-11-26, 77 new shares for 100 old, and EUR 9.18 capital repayment | Fourteen valid raw bars return in the tested window. Raw close 57.9221 to 45.875 and adjusted close 52.3151 to 41.4342 retain the same 1.2626 event gap ratio. EOD action fields and both action endpoints show no event. The compound adjustment basis remains unresolved; no scalar factor or reconstructed prices are applied. |

Official source URLs, source content hashes and exact test bounds are retained
with each machine action reference. Adjacent price ratios are diagnostic
signatures; they do not establish which provider methodology is correct.

## German depth and dividends

SAP, Siemens, Rheinmetall, Allianz and Deutsche Telekom each returned ten raw
OHLC bars for the bounded 2010-01-01 through 2010-01-15 request, with observed
trading dates 2010-01-04 through 2010-01-15. These are observed depth controls,
not proof of the first available trading date or gap-free intervening history.
All five return adjusted close, but adjusted open/high/low and adjusted volume
are missing in those windows. Their adjusted-close/raw-close ratios are
approximately 0.824, 0.629, 0.719, 0.542 and 0.467 respectively.

The final ascending controls requested 1990-01-01 through 2026-09-30 with
`sort=ASC` and `limit=10` for SAP, Siemens, Rheinmetall, Allianz, Deutsche
Telekom, Adidas, LVMH, ASML, Novo Nordisk local and EUNL. All ten returned
correctly ascending pages starting 2010-01-04. This establishes the earliest
returned sample for those exact provider queries. It does not establish
complete, practical or gap-free coverage from that date, nor that there are
no earlier records outside the provider's returned scope. Their coverage
therefore remains partial.

The annual 2025 dividend endpoints returned empty for those five German
listings, although EOD rows contain 2025 dividends for SAP, Siemens, Allianz
and Deutsche Telekom. The tested Rheinmetall EOD data does not contain a 2025
dividend. Empty endpoints do not establish that an issuer paid no dividend.

Independent official issuer references verify Allianz EUR 17.10 and
2026-05-08 ex-dividend quotation, matching the EOD row. Deutsche Telekom's
official announcement verifies EUR 0.90 and 2025-04-14 payment; the EOD row
reports EUR 0.90 on 2025-04-10, but the announcement does not independently
certify that ex-date. Neither comparison certifies adjusted prices.

The tested distributing ETFs EXSA.DE and ISPA.DE report EOD dividends
0.604232 on 2025-06-16 and 0.575119 on 2025-07-15 respectively, while their
bounded dividend endpoints return empty. Adjusted close equals raw close
through every returned bar in those windows; adjusted OHLC and volume are
missing. No total-return claim follows from those fields.

## Final price-field compatibility refinement

`marketstack_adjustment_compatibility.json` separates raw display, continuous
adjusted charting, moving averages, 52-week highs, momentum, Quant and
backtesting for 17 exact-listing cached control windows. The supplementary
`marketstack_adjustment_controls.json` records issuer/SEC citations, document
hashes and distinct legal, market, record and payment dates. Its additional
public-source research consumed no Marketstack credits.

Real committed Tiingo golden-preview daily OHLC is compared on exact dates
with the retained Marketstack AAPL and NVDA split windows. Both adjusted-close
return sequences agree within one basis point after allowing a constant
normalization-level difference. AAPL's maximum daily-return discrepancy is
0.006 basis points; the precise NVDA value is in the artifact. Different dated
normalization bases can produce different absolute adjusted prices. This
comparison establishes numerical continuity in those bounded windows only.

The `close` field has no empirically universal raw-price basis. In the AAPL
2020 split window, Marketstack pre-split close is already divided by four
relative to Tiingo's as-traded close; post-split closes match. In the NVDA 2024
window, Marketstack `close` matches Tiingo's as-traded close on both sides of
the ten-for-one split. Multiplying or dividing every `close` by provider split
factors would therefore corrupt at least one of these observed series.
NVDA's historical provider currency field is missing. Its dimensionless
comparison is explicitly numerical-only; the script does not invent USD or
release its historical rows for native-currency display.

Volume has a separate observed adjustment basis. On 2024-06-03, NVDA
Marketstack reported volume is 438,391,796 versus Tiingo as-traded volume
43,839,176 and Tiingo adjusted volume 438,391,760; the price is still the
as-traded close. AAPL pre-split reported volume is similarly about four times
Tiingo raw volume, alongside an already divided close. `volume` therefore
cannot universally mean as-traded share volume. Applying split factors again
or multiplying NVDA's raw historical price by this reported volume would mix
bases. Volume-dependent technical strategies and historical turnover remain
unverified alongside price adjustments.

The retained IAU/ARCX series supplies a US reverse-split control. The issuer's
SEC-filed 2021 annual report explicitly confirms a one-for-two reverse split
at market open on 2021-05-24. Provider close and adjusted close both rise from
17.92 to 35.88; the factor is 0.5 on the verified date. Adjusted close therefore
retains the reverse-split gap in this window. IAU is a gold trust; this control
does not classify it as a common equity or certify its entire price history.

The final bounded COST/XNAS special-dividend test used exactly three new
requests (three estimated credits), Action run `36908664526`. All 18 returned
raw candles are structurally valid; the EOD and dividends endpoint both
report USD 15 on 2023-12-27. The SEC-filed issuer release independently
verifies the amount, record date 2023-12-28 and payment date 2024-01-12, but
not the exchange ex-date. The adjusted/raw factor step is 1.02274027 versus
1.02274037 under the simple backward-cash-dividend calculation, a difference
below 0.001 basis points. Four exact dated week-end closes also match the
existing Tiingo split-adjusted chart observations without interpolation.
Historical Marketstack currency is missing here too, so those comparisons
remain dimensionless diagnostics. This control demonstrates a visible
special-dividend adjustment step; it does not certify historical action
completeness, daily Tiingo OHLC, total-return methodology or Quant safety.

European observations likewise require individual treatment. Novo's local
adjusted close retains its ordinary split gap, while the independently dated
NVO ADR window removes its split gap. ASML's 2012 consolidation and EUR 9.18
capital repayment remain a compound-action control with an unresolved basis.
Allianz's 2025 EUR 15.40 large-dividend window has valid raw OHLC and a visible
adjusted-close factor change; the official page verifies the amount but does
not independently establish the historical ex-date. The 2026 EUR 17.10 event
matches the officially cited ex-date and amount, but seven of eight bounded
raw rows are invalid. Amount correspondence cannot release those price rows.
Deutsche Telekom's 2025 factor step matches the simple backward cash-dividend
calculation. EXSA and ISPA instead copy raw close through reported dividends;
those windows do not establish dividend-adjusted total returns.

| Use | Current safe interpretation |
| --- | --- |
| Raw historical display | Partial only where existing identity, quote-unit and row-quality gates accept it; missing currency and invalid OHLC remain blocked. Existing accepted charts remain unchanged. |
| Continuous adjusted charts | No general Marketstack certification; split/compound-action failures remain blocked. |
| Moving averages / 52-week high / momentum | Not admitted from these tests; require a complete, consistently adjusted series and sufficient valid history. |
| Quant | Blocked for unverified Marketstack histories; protected Tiingo computations continue unchanged. |
| Backtesting | Blocked until action completeness, adjustment basis and historical availability semantics are independently verified. |

No series is automatically re-adjusted, no missing bars are reconstructed, no
technical eligibility is changed, and no universal provider capability is
inferred from a passing control window. A cached control can demonstrate a
problem or a bounded consistency result; it cannot prove full-history safety.

Reproduction accepts repeatable `--probe` inputs and
`--official-controls=reports/marketstack/marketstack_adjustment_controls.json`.
Both read-only CLIs accept `--generated-at`; otherwise they use the latest
stored snapshot timestamp and reject missing timestamps. The compatibility
CLI additionally fingerprints the exact input bytes and committed Tiingo
reference files. Identical evidence and timestamp reproduce identical output.

## Global Select

The explicit 13-company validation scope contains Samsung Electronics,
SK Hynix, Toyota, Sony, Nintendo, Keyence, Tokyo Electron, Tencent, BYD,
MediaTek, Hon Hai/Foxconn, Reliance and MercadoLibre. Twelve local symbols have
verified exact provider metadata/MIC and bounded returned local history.
MercadoLibre has a measured valid US latest EOD observation in the complete-US
benchmark. This named sample is not a global universe definition.

Existing US TM, SONY and MELI consumer preferences remain protected. A local
provider name does not establish issuer identity or fundamentals. Returned
history remains partial; global realtime is unproven, and all newly assessed
adjustment bases remain unverified for technical-engine admission.

Final NVDA and SPY IEX latest requests succeeded at 2026-10-01 around
15:55 UTC, but both returned a market timestamp of 2026-09-30 20:00 UTC.
Their same-day bounded intraday queries returned empty. A successful response
with an old timestamp is not current realtime proof. The tested Samsung
intraday requests also returned empty. No new realtime claim or provider
replacement decision is made from these observations.

## Interrupted-run accounting recovery

`scripts/market/recover-marketstack-scale.mjs` uses read-only GitHub metadata
and artifact downloads before collection. It restores missing accounting and
response files from prior runs on the same branch, validates every referenced
response and ledger, takes per-run credit maxima, and retains newer cached
observations. It performs no Marketstack requests and prints aggregate status
or a sanitized `RECOVERY_REQUIRED` error.

Workflow retries require proof for previous attempts of the same run ID.
Artifacts use immutable attempt-specific names; legacy names can represent
only attempt one. A later interrupted attempt cannot silently reuse the
earlier attempt's smaller ledger. Missing, stale or incomplete started-run
artifacts block further collection. A completed cancelled run with an
officially reported zero-job history is a proven zero-spend exception; an
empty successful or failed job history remains unknown and blocks collection.
