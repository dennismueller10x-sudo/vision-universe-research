# ETF-Primärquellen-Matrix (Vision Universe Vorsorge)

Stand: 04.10.2026. Grundlage: Recherche (vier parallele Agenten, öffentliche Code-Repositories, die die
Endpunkte zitieren, und Suchauszüge) und eine CI-Probe von GitHub Actions aus
(`vorsorge/data/sources/etf-source-probe.json`, Workflow `vorsorge-etf-sources.yml`, Marker `[vorsorge-etf-probe]`).
Die Probe hat **nur** Nutzungsbedingungen, robots.txt und die Form offener Quellen gelesen. Datenendpunkte
der Emittenten wurden **nicht** abgerufen.

## Ergebnis in einem Satz

Alle großen ETF-Emittenten erlauben ihre Website-Daten nur zur persönlichen bzw. nicht-kommerziellen
Nutzung oder verbieten Vervielfältigung und Weitergabe ohne schriftliche Zustimmung. Mehrere verbieten
Robots ausdrücklich, mehrere sitzen hinter Zugangsseiten oder Bot-Schutz. Automatisiert und ohne Lizenz
nutzbar sind die **regulatorischen** Quellen: SEC (gemeinfrei), ESMA FIRDS (Wiederverwendung mit
Quellenangabe) und GLEIF (CC0).

## Zusammenfassung

| Quelle | Typ | Zugriff | Automatisierung | Status | Liefert |
|---|---|---|---|---|---|
| SEC Form N-PORT (DERA-Quartals-Datasets) | REGULATORY | ZIP/TSV, ohne Login | erlaubt (gemeinfrei, deklarierter User-Agent, ≤ 10 Anfragen/s) | **integriert** | US-ETF-Holdings je Serie, Nettofondsvermögen, Historie seit 2019 |
| SEC company_tickers_mf.json | REGULATORY | JSON | erlaubt | **integriert** | Ticker ↔ Serie ↔ Anteilklasse |
| SEC Risk/Return-Datasets (Prospekt-XBRL) | REGULATORY | ZIP/TSV | erlaubt | **integriert** | Expense Ratio, Netto-Expense-Ratio, Verwaltungsgebühr je Anteilklasse |
| SEC EDGAR submissions (Bulk) | REGULATORY | ZIP/JSON | erlaubt | **integriert** | SIC-Code je Emittent → Wirtschaftszweig |
| SEC Form N-CEN-Datasets | REGULATORY | ZIP/TSV | erlaubt | verfügbar, noch nicht genutzt | ETF-Kennzeichen, Börse, Indexfonds-Flag |
| ESMA FIRDS (FULINS_C, wöchentlich) | REGULATORY | ZIP/XML (ISO 20022) | erlaubt mit Quellenangabe, Transformation kenntlich | **integriert** | ISIN, Name, CFI (inkl. Ertragsverwendung), Währung, Emittenten-LEI, Handelsplätze (MIC), erster Handelstag |
| GLEIF Level-1 API | REGULATORY | JSON | CC0 | **integriert** | rechtlicher Name, Rechtsordnung (Domizil) je LEI |
| Deutsche Börse Xetra „All tradable instruments“ | Börse | CSV (Link wechselt) | Bedingungen nicht eindeutig geprüft | nicht integriert | WKN, Instrumenttyp, Mnemonic |
| FinDatEx EMT (Emittenten-Dateien) | PRIMARY_ISSUER | CSV/XLSX | Datei-Bedingungen des Emittenten | Parser bereit, kein Abruf | laufende Kosten (07100), Verwaltungsgebühr (07110) je ISIN |
| Tiingo | MARKET_DATA_PROVIDER | API mit Schlüssel | lizenziert | integriert (Vorgänger-PR #417) | US-Kurse, Ausschüttungen, Splits |

## Emittenten (alle: `automationAllowed = false`, `implementationStatus = MANUAL_IMPORT_READY`)

Spalten: provider · officialDomain · dataType · accessMethod · format · authRequired · rateLimit · updateFrequency ·
holdings/historicalHoldings · ISIN/WKN · TER/OngoingCharges · AUM · UCITS/Domizil · Replikation · Distribution ·
Benchmark · NAV · Listings · TrackingDifference · termsStatus · automationAllowed · implementationStatus · notes.

| Provider | Domain | Datenwege (laut Recherche, nicht abgerufen) | Format | Auth | Holdings (Hist.) | ISIN/WKN | TER/OC | AUM | UCITS/Dom. | Repl. | Dist. | Bench. | NAV | Listings | TD | Terms (Probe, 04.10.2026) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BLACKROCK (iShares) | ishares.com, blackrock.com | Produkt-Screener-JSON (`product-screener-v3.1.jsn`), Holdings-CSV `…ajax?fileType=csv`/`latest-holdings.csv`, `get-product-data`-JSON mit `asOfDate` | JSON, CSV, XLSX | nein | ja (ja, `asOfDate`) | ja/teilw. | ja/ja | ja | ja/ja | teilw. | ja | ja | ja | ja | nein | RESTRICTED: „solely for your personal, non-commercial use … may not distribute … for public or commercial purposes“ (US); UK: „not to be used for any commercial purposes“ |
| VANGUARD | vanguard.com, vanguardinvestor.co.uk | US `funddetail`, Holdings-JSON (Monatsende), UK GraphQL | JSON | nein | ja (Monatsende) | ja/– | ja | ja | ja | – | ja | ja | ja | teilw. | nein | RESTRICTED: „personal, informational and non-commercial use“; kommerziell nur mit schriftlicher Zustimmung |
| STATE_STREET (SPDR) | ssga.com | Fund-Finder-JSON, `spdr-product-data-us-en.xlsx`, `holdings-daily-us-en-<t>.xlsx` | JSON, XLSX | nein | ja (nein) | ja/– | ja | ja | ja | – | – | ja | ja | ja | nein | RESTRICTED: „may not copy, reproduce, … disseminate“ |
| INVESCO | invesco.com | `dng-api.invesco.com` Holdings-JSON je CUSIP/ISIN | JSON | nein | ja (nein) | ja/– | ja | ja | ja | – | ja | ja | ja | – | nein | RESTRICTED: „personal non-commercial or internal business use“; kein automatisierter Zugriff |
| AMUNDI | amundietf.de/.com | `mapi/ProductAPI/getProductsData` (POST, inkl. WKN, TER, AUM, UCITS, Replikation, Listings, Holdings) | JSON | nein (Disclaimer-Seite) | ja (nein) | ja/ja | ja | ja | ja/ja | ja | ja | ja | ja | ja | nein | RESTRICTED: Vervielfältigung ohne schriftliche Zustimmung untersagt; Download nur für den persönlichen Gebrauch |
| DWS (Xtrackers) | etf.dws.com, dws.com | Fondsfinder (hinter Entry Gate – nicht nutzbar), Constituents-XLSX/CSV, EMT-Portal `dws.com/mifid_emt` | XLSX, CSV, JSON | Entry Gate | ja (nein) | ja/ja | ja (EMT) | ja | ja | ja | ja | ja | ja | ja | nein | RESTRICTED: kein Herunterladen/Vervielfältigen ohne schriftliche Zustimmung |
| WISDOMTREE | wisdomtree.eu | `dataspanapi.wisdomtree.com` (EMT-Liste, Dokumente), Holdings-Modal (GUID) | JSON, PDF | API-Schlüssel (Dataspan) | ja | ja | ja (EMT) | ja | ja | – | ja | ja | ja | – | nein | Bedingungen in der Probe nicht lesbar (HTTP 403 = Bot-Abwehr); US-Bedingungen verbieten Vervielfältigung |
| UBS | ubs.com | EMT-Dateien je Rechtseinheit (Regulatory data information), Factsheet-PDFs | XLSX, CSV, PDF | WAF | – | ja | ja (EMT) | – | – | – | – | – | – | – | nein | RESTRICTED: „non-commercial, personal use only“ |
| JPMORGAN | am.jpmorgan.com | `FundsMarketingHandler/product-data` (inkl. Tagesbestand), XLSX | JSON, XLSX | Bot-Schutz | ja | ja | ja | ja | ja | – | – | – | – | – | nein | RESTRICTED: keine Nutzung/Speicherung ohne vorherige schriftliche Zustimmung; Robots ausdrücklich verboten |
| HSBC | assetmanagement.hsbc.* | Holdings-XLS je ISIN | XLS | nein | ja | ja | – | – | – | – | – | – | – | – | nein | RESTRICTED (Bedingungsseite in der Probe HTTP 404; regionale Bedingungen untersagen Vervielfältigung) |
| VANECK | vaneck.com | Holdings-Block-JSON, XLSX | JSON, XLSX | Cookies | ja | ja | – | – | – | – | – | – | – | – | nein | RESTRICTED (Probe ohne Antwort; Bedingungen: keine kommerzielle Vervielfältigung) |
| LEGAL_GENERAL | fundcentres.landg.com | Fund-Centre-JSON, Holdings-CSV mit `as_at_date` | JSON, CSV | nein | ja (ja) | ja | – | – | – | – | – | – | – | – | nein | RESTRICTED: Vervielfältigung nur zur privaten Ansicht |
| GLOBAL_X | globalxetfs.eu | Explore-JSON, Holdings-CSV | JSON, CSV | nein | ja | ja | – | – | – | – | – | – | – | – | nein | RESTRICTED: „must not use … for commercial purposes without obtaining a licence“ |
| FIDELITY | fidelity.lu | Holdings-XLSX je ISIN | XLSX | Bot-Schutz | ja | ja | – | – | – | – | – | – | – | – | nein | keine Freigabe gefunden |
| FRANKLIN_TEMPLETON | franklintempleton.co.uk | EMT/EPT/EET-Vorlagen | XLSX | nein | – | ja | ja (EMT) | – | – | – | – | – | – | – | nein | keine Weiterverwendungslizenz gefunden |
| BNP_PARIBAS | bnpparibas-am.com | Holdings-XLSX im Dokumentenreiter | XLSX | nein | ja | ja | – | – | – | – | – | – | – | – | nein | RESTRICTED: Vervielfältigung ohne ausdrückliche Genehmigung untersagt |

rateLimit: bei keinem Emittenten dokumentiert. updateFrequency: Holdings überwiegend täglich (T-1),
Vanguard US monatlich, SEC N-PORT quartalsweise mit 60 Tagen Verzögerung.

## Was das für die Umsetzung bedeutet

- **Emittenten-Adapter** (`scripts/vorsorge/adapters/issuers.mjs`) erfüllen den Vertrag `ETFPrimarySourceAdapter`
  (discoverProducts, fetchProductMetadata, fetchShareClasses, fetchListings, fetchHoldings, fetchHistoricalHoldings,
  fetchFundCharacteristics, healthCheck, normalise, validate). Alle `fetch*` liefern `NOT_PERMITTED`. Die Parser für
  die dokumentierten Formate (iShares-CSV US/DE, SSGA-XLSX, Xtrackers-XLSX, Amundi-JSON, Invesco-JSON, generische
  Tabellen, FinDatEx-EMT) sind getestet und für einen manuellen Import mit Erlaubnis bzw. Lizenz bereit.
- **Freischalten**: Liegt eine Lizenz oder Zustimmung vor, werden nur `automationAllowed` und die Abrufmethode
  ergänzt. Normalisierung, Snapshots, Qualitäts-Gates und Change Engine laufen unverändert.
- **Bestehender Befund außerhalb dieses PRs**: `scripts/market/build-index-membership.mjs` ruft täglich iShares-, SSGA-
  und Invesco-Bestände ab (Index-Mitgliedschaft). Nach den hier geprüften Bedingungen ist das ohne Zustimmung
  problematisch. Das sollte der Eigentümer prüfen. Dieser PR ändert daran nichts (Modulgrenze).

## Quellenpriorität je Feld (umgesetzt)

| Feld | Primär | Fallback | Abdeckung (öffentliches Universum) | Lücke |
|---|---|---|---|---|
| US-Kurse | Tiingo | – | 99,9 % | – |
| UCITS-Kurse | – | – | 0 % | europäischer Kursanbieter nötig |
| US-Holdings | SEC N-PORT (Quartal) | Emittent (Lizenz) | 63 % | Tagesbestände nur mit Emittentenlizenz; UITs (SPY, QQQ, DIA) und Rohstoff-Trusts melden kein N-PORT |
| UCITS-Holdings | – | – | 0 % | Emittentenlizenz |
| Kostenquote US | SEC Prospekt (Risk/Return) | – | 66 % | – |
| TER/laufende Kosten UCITS | – | EMT (Lizenz) | 0 % | Emittent/EMT |
| Fondsvermögen US | SEC N-PORT (Fondsebene) | – | 63 % | Anteilklassenebene nur beim Emittenten |
| ISIN | ESMA FIRDS (EU) | – | EU 100 %, US 0 % | US-ISIN nur über lizenzierte Quellen |
| WKN | – | – | 0 % | offizielle Quelle mit geklärter Lizenz |
| Domizil | SEC (US), GLEIF (EU) | – | 63 % US / EU fast vollständig | – |
| UCITS-Status | SEC (US-Fonds = kein UCITS) | EU: nur Hinweis aus amtlichem Namen | 63 % | verbindlich nur Emittent/KID |
| Ertragsverwendung | CFI (EU), beobachtete Ausschüttungen (US) | – | EU 98 % | „thesaurierend“ für US nicht belegbar |
| Replikation, NAV, Tracking Difference | – | – | 0 % | Emittent bzw. Indexdaten |
