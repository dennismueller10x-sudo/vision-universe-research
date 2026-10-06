# Datenflüsse je Datenart

Jede Kette läuft **Quelle → Ingestion → Normalisierung → Speicher → abgeleitete Daten → API → Produkt → UI**.
Die kanonischen Artefakte stehen in `core/registry/domains.json`. Stand: 03.10.2026.

## EOD-Kurse {#eod}

| Stufe | Ort |
|---|---|
| Quelle | Tiingo EOD (`providers/tiingo/adapter.js#toPriceBar`): rohe OHLC, `adjustedClose` (nur wenn verifiziert), `splitFactor`, `divCash` |
| Ingestion | `scripts/market/ingest-tiingo.mjs --scope-from-preview --commercial` (Umfang: `quant/config/development-preview.json` → `eligibility.json`) |
| Normalisierung | `quant/engines/market-store.js#mergeBars`, `validateAdjustmentConsistency`, Ablehnungsregister (`rejection-lifecycle.js`) |
| Speicher | `.market-cache/tiingo/daily/` (Actions-Cache) → R2 (`sync-history-store.mjs`, `history-store.js`, `bar-codec.js`) |
| Abgeleitet | `publish-discover-series.mjs` → `discover-series/<securityId>.json` (1J, split-bereinigt, `roundClose`); `golden-preview/daily/` (5 Titel, volle OHLC); `publish-long-series.mjs` → `discover-series-long/` (Woche, MAX); `build-market-factors.mjs` → `factors/factors-FULL_UNIVERSE.json`; `guard-listing-continuity.mjs` (Symbolwiederverwendung) |
| API | `core/client.js#getPriceSeries/getLatestPrice`; `api/history.js` (R2, abgeschaltet: `VU_MARKET_HISTORY_API_ENABLED`) |
| Produkt | Discover (Karte, Seite, Chart), Screener (Build-Projektion), Quant (Liste, Seite), Supertrader (Signale aus Shards/Wochenreihen), Technical |
| UI | `discover/ui/cards.js`, `discover/ui/detail.js`, `quant/app/chart.js`, `supertrader/assets/st-chart.js`, `screener/ui/charts.js` |

**Zeitplan:** Mo–Fr 22:30 UTC (`market-data-refresh.yml`). Danach läuft die Materialisierung (`needs`), danach der Frischevertrag (`measure-pipeline-freshness.mjs`), danach `pages-release`.

## Intraday

| Stufe | Ort |
|---|---|
| Quelle | Tiingo IEX, 5 Minuten |
| Ingestion | `scripts/market/ingest-intraday.mjs` (Takt: `run-pacemaker.mjs` in `intraday-pacemaker.yml`; Nachholer: `intraday-delivery-watchdog.yml`; 21:35 UTC Universum: `intraday-snapshots.yml`) |
| Normalisierung | `quant/engines/realtime/intraday-snapshot.js`; `previousClose` aus `discover-series` |
| Speicher | `quant/data/market/intraday/<Sitzung>/<securityId>.json` + `index.json` (zwei Sitzungen + jüngste Universumssitzung) |
| API | `api/intraday.js` (mit `freshness.ageMinutes`), `core/client.js#getIntraday`; Realtime: `worker/` (vu-live) |
| Produkt/UI | Discover-Detail und Mikrochart, Quant-Chart (1T), Markets (Pulse), Supertrader (Live-Kurs); Zustand und Beschriftung: `quant/engines/realtime/source-state.js` |

## Fundamentals (SEC) {#fundamentals}

| Stufe | Ort |
|---|---|
| Quelle | SEC `companyfacts`/Submissions (data.sec.gov), Bulk `companyfacts.zip` |
| Ingestion | `scripts/quant/cli.py daily` (inkrementell), `cli.py consumer` (Bulk) |
| Normalisierung | `scripts/quant/sec/**` (Konzeptzuordnung, PIT: `availableAt <= decisionTime`) |
| Speicher | `quant/data/fundamentals/` (Emittenten-Shards), `quant/data/sec/` (Consumer, Quarterly). **Nicht ausgeliefert** (`build-release.mjs#permitted`), nur über Projektionen |
| Abgeleitet | `quant/data/sec/quant-factor-inputs.json`, Consumer-Bundle → `build-discover-data.mjs` (`geschaeftszahlen`, `fundamentals`), Release-Projektionen `quant/data/sec/quarterly/*.json.gz` |
| API/Produkt | Discover-Seite (`fundamentals`), Quant (Faktor-Inputs), Supertrader (CANSLIM/Minervini-Gewinnfilter), `core/client.js#getFundamentals` |

## Securities / Universum

```
Tiingo-Verzeichnis + Gate-Universen ──▶ build-us-security-master.mjs ──▶ us-security-master.json (8.021 Zeilen)
                                        build-us-eligibility.mjs      ──▶ eligibility.json (7.803 Entscheidungen, 6.853 nicht ausgeschlossen)
                                        build-company-master.mjs      ──▶ quant/data/universe/instruments/*.json (7.809), issuers/
SEC company_tickers                 ──▶ build-cik-map.mjs             ──▶ cik-map.json
Namen (Tiingo, SEC, kuratiert)      ──▶ build-company-names.mjs       ──▶ company-names.json
```

Verbraucher: Abrufumfang (`universe-source.mjs`), Faktoren, Discover, Screener (`screenerEligible`), Supertrader (über den Discover-Index), Suche (`instrument-directory.js`).
**Identität:** `core/identity.js` (ADR-001).
**Aktualität:** Kein geplanter Lauf baut `us-security-master.json` oder `eligibility.json` neu. Neuemissionen und Delistings kommen über Tiingo 2.0: `tiingo2-universe-refresh.yml` (werktags 08:20 UTC, nur lesend) erzeugt Discovery und Staging, `tiingo2-publication.mjs` veröffentlicht erst mit einem QA-Nachweis je Manifest ([docs/tiingo2/README.md](../tiingo2/README.md)). Der Systemzustand meldet das Alter (`securityMaster` in `core/registry/domains.json`).

## Index Membership

ETF-Bestände (SPY, DIA) und die Nasdaq-API → `build-index-membership.mjs` → `quant/data/market/index-membership/{SP500,NDX,DJIA}.json`.
Zuordnung zum Master über `matchKey` (ohne Trenner, nur bei Eindeutigkeit) → Discover-Reihen und Badges.

## Discover {#discover}

`scripts/discover/build-discover-data.mjs` (im Refresh und in fünf weiteren Workflows) liest:
- die Faktoren,
- `discover-series`,
- Golden-Preview,
- Company Master und Namen,
- Index-Mitgliedschaften,
- SEC-Consumer,
- Logos und Themen.

Daraus schreibt es `discover/data/`:
- `meta.json`
- `home/` (Startseite, gestückelt)
- `rows/` (Sammlungen)
- `stocks/US_REAL/<T>.json` (Aktienseiten)
- `stock-index/`, `search/`, `feed/`, `featured/`, `live-scope/`

Das UI ist `discover/index.html` mit Hash-Routing in `discover/app.js`.

## Quant {#quant}

Refresh → `build-market-factors.mjs` → Materialisierung (`product-intelligence-materialization.yml`) → `quant/data/product/**`.
Dort liegen Faktor-Evidenz, Setups, Muster, Signale, Regime, Radar und Backtest-Zertifizierung.
Gelesen wird über `quant/api/product-services.js` → Quant-SPA `quant/index.html` (Release-Bündel).
Methodik: `quant/methodology/`; Details: `quant/ARCHITECTURE.md`.

## Supertrader

Diese Eingaben laufen in `scripts/supertrader/build.mjs`:
- Shards der technischen Signale (`technical-signals-v1`),
- `discover-series-long`,
- SEC-Fundamentals,
- SPY (Multi-Asset).

Die Strategien (`engine/strategies/*`) und der Lebenszyklus (`engine/lifecycle.mjs`) erzeugen `supertrader/data/*.json` und 822 Aktienseiten.
Zeitplan: Di–Sa 06:17 UTC (`supertrader-signals.yml`).

## News und Content

- News: Primärquellen-RSS → `scripts/dashboard/update_news.mjs` → `dashboard/data/news_feed.json` → `/news/`. **Nur manuell, ohne Zeitplan.**
- Company Intelligence: `scripts/company_intelligence/` (isolierte Vorschau, Zustand `DISABLED` im ausgelieferten Index).
- Morning, Magazin: redaktionell, über `build-morning.yml`.
