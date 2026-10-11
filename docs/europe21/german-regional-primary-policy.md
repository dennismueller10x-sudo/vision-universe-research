# German regional reference primary and Xetra product preference

Private consumer identity admission may select Xetra for an identified German cash-share class whose reference primary is an active German regional market. This does not assert MIC equality or change the official primary market.

Policy `GERMANY_REGIONAL_PRIMARY_LIQUID_LOCAL_XETRA` requires exact valid ISIN and LEI, current GLEIF ACTIVE/GENERAL issuer jurisdiction DE, current source-bound active Xetra CS listing and regulatory-liquid flag, exact official ISO primary/operating records ACTIVE/DE, and a separately active XETR target record. ISO bytes are re-parsed and hash-checked; editable reference summaries are not identity evidence.

The same exact scoped listing must have valid EUR OHLC and positive volume from the last completed session or immediately preceding verified exchange session. Delayed observations remain DELAYED and count as zero fresh prices. ETF/type conflicts, explicit inactivity, foreign/US reference primaries, expired/ambiguous/old MIC records, malformed prices and stale EOD block the policy. Regulatory liquidity cannot transfer between venues; non-regulatory one-day turnover does not qualify.

The output retains `primaryMarketMic` and adds independent `primaryMic: XETR`, `regionalMicEvidence` and `regionalActivityEvidence`. Share-class detail remains UNKNOWN. Display rights, adjusted basis, Quant, SuperTrader and Backtesting gates are unchanged.
