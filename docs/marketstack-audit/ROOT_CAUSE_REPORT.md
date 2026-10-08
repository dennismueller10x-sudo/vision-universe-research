# VISION UNIVERSE® — Marketstack Professional Capability & Connector Parity Audit

Stand: 7.10.2026 UTC. Der authentifizierte Audit wurde über den vorhandenen Actions-Secret ausgeführt. Raw Responses, Requests und normalisierte Beobachtungen sind getrennt erhalten. **Keine Produktionsdaten wurden geändert; PR #479 bleibt Draft und wurde nicht gemergt.**

## Baseline und Account

- main beim ursprünglichen Audit: `b39d8d7ddbd093d138e2844ddec2cb2bb07a6962`; Draft-Basis auf aktuellen main `829b35bdce417a78ed2cf44319df347d747ac615` gesetzt. Auf main liegt kein Marketstack-Connector. Die zuvor beobachtete Implementierung stammt aus offenen Feature-PRs, insbesondere #461 (`3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e`). Diese Implementierungen und deren Verbraucher wurden nicht migriert.
- Professional ist die Nutzerangabe; die offizielle aktuelle Planbeschreibung nennt 100.000 monatliche Requests. Der Actions-Key authentifiziert die tatsächlich geprüften Datenrouten. API-Antworten liefern keinen Account-Plan-Namen oder verifizierten Monats-Restzähler. Diese Angaben werden nicht erfunden.
- v2 über HTTPS; Key ausschließlich im Fetch, niemals in den gespeicherten Request-Parametern oder Reports. Originaltext vor Normalisierung gespeichert, Secret-Redaktion, SHA256 pro Antwort; verschlüsselte Actions-Artefakte, entschlüsselte Originale außerhalb des Repository.
- Client-Reservation vor jedem Fetch, ETF-Routen20-fach, sonst ein Credit pro angefragtem Symbol/Request. Offizielle FAQ: API-Fehler werden nicht berechnet. Die hier ausgewiesene Reservation zählt sie vorsichtshalber mit; sie ist **kein beobachteter Rechnungszähler**. Keine Retries, CacheTTL0, keine Schedules, keine Universe-Ingestion.
- Referenzclient: fünf Minuten Prozesscache und Inflight-Deduplikation; Audit umgeht auch warmen Cache ausdrücklich. Identitäts-/Adjustierungs-/Qualitätszulassung in bestehenden Produkten bleibt unverändert. Neuer Adapter ist ein inaktiver Beobachtungsvertrag, kein produktiver Provider.

## Connector-Dateien und Quality Gates

Im Draft: `providers/marketstack/client.js` (Transport/Budget/Cache/Pagination), `audit-adapter.js` (die neun Beobachtungsverträge und Normalisierung), `snapshot-exchange-mappings.json` (Raw-belegtes Venue-Mapping), `providers/marketstack/tests/*.test.mjs`, `scripts/marketstack/capability-audit.mjs` und `actions-audit.mjs` (begrenzt autorisierter Runner). [.github/workflows/marketstack-probe.yml](../../.github/workflows/marketstack-probe.yml) stellt ausschließlich den Auditzugriff auf den vorhandenen Secret bereit. [Mapping-Tabelle](exchange-mapping-independent.json) und die neue Code-/MIC-Evidence bleiben getrennt.

Der aus #461 gelesene Referenzadapter verlangt bestätigte Listing-/Währungszuordnung samt Quellen, bei Vorzugsaktien eine bestätigte Share-Class und für Intraday-Bar-Semantik ein separates Gate. Adjusted-OHLC benötigt eine datumsbezogene Quelle für SPLIT_AND_DIVIDEND_ADJUSTED; Volume-Evidence ist unabhängig. Diese Qualitätsregeln wurden nicht abgeschwächt. Der Draft liefert `identityVerified:false`, Raw-Beobachtungen und unbestätigte Adjustierung; keine Canonical-ISIN-Erfindung, kein Produkt-Consumer und keine Registrierung.

Der generische Client hat Defaults100 Requests/100 konservative Credits, zwei Retries, 30s Timeout und fünf Minuten Cache; reale Requests benötigen einen gemeinsamen Budget-Reservierer. Die Live-Pläne überschreiben dies bewusst mit der eingefrorenen Lease, maximal600 Requests, null Retries und CacheTTL0. Der Final-Test erhöht nur seinen begrenzten Request-Timeout auf90s. Globale Ausführung ist seriell; stockprice wird zusätzlich61s gepaced. Auth erfolgt ausschließlich als v2-`access_key` innerhalb des Fetch, HTTPS bleibt fest.

## Quellen und Evidence

[Endpoint-Inventar](endpoint-inventory.json), [Professional-Matrix](professional-capabilities.csv), [Usage-Matrix](connector-usage.csv), [Website-Originale](evidence/website), [Website-Hashmanifest](website-raw-manifest.json), [Capability-Flags](capabilities.json), [authentifizierte Evidence](live-account-evidence.json), [Raw-Hashmanifest](authenticated-raw-manifest.json), [Parität](website-api-vu-parity-matrix.csv), [Feldvergleich](raw-vs-normalized.csv), [Holdings](etf-holdings-live.csv), [Holdings-Feldvergleich](etf-holdings-raw-normalized-fields.csv).

Offizielle Quellen: [v2-OpenAPI](https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json), [API-Dokumentation](https://docs.apilayer.com/marketstack/docs/api-documentation), [Getting Started](https://docs.apilayer.com/marketstack/docs/getting-started), [Pricing](https://marketstack.com/pricing), [FAQ](https://marketstack.com/faq), [Website Search](https://marketstack.com/search). Aktuelle Credit-Zitate und Hashes: [credit-documentation-live.json](credit-documentation-live.json). Öffentliches Website-Backend ist ausdrücklich keine Account-API-Evidence.

## Nachgewiesene Root Causes

| Befund | Klassifikation | Evidence und Korrektur |
|---|---|---|
| Directory-Discovery fehlt im Referenzadapter; enge Symbolkandidaten enden voreilig in NOT_SUPPORTED | VU connector / diagnostic bug | Website und Account-API finden die fraglichen Listings; echte Directory-/Exchange-/exakte Metadatenverträge und UNKNOWN statt falschem Negativurteil ergänzt |
| Erste Seite kann deutsche Titel übersehen | VU discovery integration gap | Allianz-Suche 2350 Zeilen: ALV.DE erst Seite 3; SAP mit limit50: SAP.DE erst Seite 3 bei 144 Zeilen. Neue Discovery lädt alle Seiten und meldet Caps/Wiederholungen sichtbar |
| US-EOD wird trotz korrekter Daten verworfen | VU normalization bug | exchange_code=NASDAQ/NYSE ARCA ist Label; exchange=XNAS/ARCX ist MIC. Acht echte EOD-Responses fälschlich abgelehnt, korrigiert und erneut live getestet |
| stockprice mit dokumentiertem MIC-Filter findet selbst AAPL nicht | Provider documentation/parameter mismatch + VU connector usage bug | Unscoped AAPL liefert fünf Venues, exchange=XNAS404. Neuer Snapshot-Vertrag sendet keinen ungeeigneten MIC-Filter, nutzt expliziten expliziten nativen Endpoint-Ticker und wählt ein Listing über beobachtete Codes/Namen; alle Raw-Venues bleiben erhalten |
| Viele stockprice-Aufrufe429 | Provider throttling + fehlende operative Endpoint-Pacing | Global250ms reicht dort empirisch nicht. ≥61s pro stockprice eliminiert429 im zweiten Lauf; keine Entitlement-Ablehnung daraus abgeleitet |
| ETF directory ticker-filter wird ignoriert | Provider limitation | Zwölf unterschiedliche ticker-Parameter liefern dieselbe globale erste Seite1000/52429. Keine exakte ETF-Coverage aus dieser Seite; keine unnötigen53 Vollverzeichnis-Seiten |
| ETF holdings limit/offset werden ignoriert | Provider limitation | VOO/VTI/SCHD limit1offset1 byte-identisch zu limit1000offset0. Keine versteckten Folgepages in diesen Reports; gesamter gelieferter Report erhalten |
| Holdings/Prices vorhanden, Identität unvollständig | Provider metadata limitation / identity mapping problem | HENSOLDT/RENK ISIN leer trotz frischer EOD-Preise. Keine ISIN-Erfindung und keine Produktzulassung |
| Feldprojektion und Zeitsemantik zu schmal | VU normalization gap | Provider-Codes getrennt vom MIC; Metadaten-ISIN/LEI/Sector/Country und Holdings-Units/Balance/Currency erhalten. Exchange-Country ist keine Fondsdomain. Trade-Time wird nicht als Provider-Update-Time erfunden |
| Adjusted-Felder uneinheitlich/teilweise ungültig | Provider data quality limitation | AAPL adj_close>adj_high an drei Tagen; TSLA-Felder teilweise null und inkonsistente Split-Basis. Rohwerte erhalten; keine Quant-/Adjustierungsreparatur |

## Website → API → VU

Alle **26 beobachteten europäischen Hauptlistings und 12 ETF-Ticker** werden durch Directory und exakte Metadaten wiedergefunden. Alle 27 angefragten Firmen haben irgendeinen API-/Website-Treffer. Schaeffler hat ausschließlich alternative Listings; die separate Schaeffler India wird nicht als deutsches Hauptlisting gezählt. Explizite SHA.DE/SHA0.DE-Probes und XETR-Namenssuche finden keinen deutschen Kandidaten.

VU Found bezeichnet in der Matrix die **normalisierte Draft-Beobachtung**; auf main fehlt der Marketstack-Provider, und kein Titel wurde in Produkte übernommen. Provider-Beobachtung bedeutet keine bestätigte kanonische Identität.

adesso ADN1.DE und HelloFresh HFG.DE: exakte Metadaten einschließlich ISIN sowie frische EOD verfügbar — frühere Abwesenheit ist kein Provider-Coverage-Beweis. HENSOLDT HAG.DE und RENK R3NK.DE: Ticker und EOD verfügbar, ISIN in exakten Metadaten leer — Identity-Gates können dadurch blockieren. Schaeffler: 0RBK.L mit EOD 2.10.2024 bestätigt eine stark veraltete alternative Beobachtung; alternative Parität, fehlende beobachtete deutsche Hauptnotierung; keine pauschale Behauptung „Provider hat Schaeffler nicht“.

SIX: live ABBN.SW/SCMN.SW XSWX; BTEE aus dem kostenlosen alten Workbook ersetzt diese aktuelle MIC-Beobachtung nicht. Suffixe sind beobachtete Provider-Ticker, keine universelle `.DE`-/`.PA`-Regel. Breite Namenssuche liefert auch andere Firmen/Fonds; solche Treffer werden nicht als verifizierte Aliase verwendet.

## EOD-Freshness, Historie und Adjustierung

Während des Pre-Close-Tests ist 6.10. die letzte abgeschlossene kontinentaleuropäische Session. **22/26 geprüfte europäische Aktien** liefern dieses Datum; SAP/Siemens/Allianz/Telekom/ASML/LVMH/ABB sämtlich 6.10. Latest und enger historischer Bereich stimmen überein. Der frühere pauschale Befund „Europa nur bis 5.10.“ trifft aktuell nicht zu.

Vier konkrete primäre Kandidaten bleiben älter: ACT.DE 5.10., SANT.DE 1.4., EIN3.DE 13.4., NA9.DE 27.8. KTN.DE wird über aktuelle Tickersuche gefunden und liefert 6.10., während der alte SANT.DE-Kandidat im April endet. KTN.DE hat leeren Namen und leeren exakten Metadaten-Lookup; eine bestätigte Issuer-/ISIN-Verknüpfung fehlt. Daher kein stiller Produkt-Alias-Wechsel.

UCITS-EOD: SXR8/EUNL/XESC/VWCE/SPY5.DE 5.10.; XDWD.DE 12.8.; LCUW.DE 20.2.2025. Ungecachte Latest-, date-bound- und tickerbezogene Routen zeigen dieselben Zeitstände. Das ist Provider-Output bzw. eine Listing-Identity-Frage, kein nachgewiesener VU-Cache-/Normalisierungsverlust. Exakter interner Publication-/Server-Cache-Grund wird nicht von der API offengelegt. Der frühere Abruf kann ohne dessen Originalzeitpunkt/Cacheledger nicht rückwirkend erklärt werden.

SAP/ASML/AAPL liefern 1Y/5Y/10Y/15Y Boundary-Samples. Full-Sample beginnt SAP/ASML4.1.2010, AAPL7.10.1996; API-Totals4235/4279/7547. Das belegt vorhandene tiefe Historie, nicht lückenlose Validität aller Bars. Nur je eine Boundary-Zeile geladen, keine Vollhistorienimporte.

[Action-Evidence](action-semantics-live.json): Splits AAPL4:1, TSLA3:1, NVDA10:1 stimmen zwischen dedizierten Events und EOD-event-date/factor überein. AAPL/NVDA-Dividenden verfügbar; TSLA0 ist erwartbar. AAPL enthält bereits split-restatete close-Werte vor dem Split, NVDA abweichend unadjusted raw-close/adjusted-close-Basis. TSLA adjusted OHLC/volume null; einzelne pre-split adj_close-Werte ändern Basis. Drei AAPL-Adjusted-Bars verletzen adj_close≤adj_high. Deshalb adjustedOHLC und adjustedVolume PARTIAL, Adjustierungsstatus UNVERIFIED; bestehende Quality Gates/Quant bleiben unverändert.

## ETF-Holdings und Metadaten

| ETF | Rows | Originale Gewichtssumme % | Signed | Befund |
|---|---:|---:|---|---|
| VOO |516|99.916916230713|27.2.2025|STALE; Report516/516 erhalten; offset/limit ignoriert |
| VTI |3626|100.168847147443|28.5.2025|STALE; Report3626/3626 erhalten; offset/limit ignoriert |
| SCHD |101|99.693498783176|24.3.2025|STALE; Report101/101 erhalten; offset/limit ignoriert |
| SPY/QQQ |0|—|—|UNAVAILABLE in unbounded und explizitem2024–2026-Fenster |

Keine künstliche100%-Normalisierung, keine Entfernung negativer Gewichte oder Duplikate. Kein Provider-total; daher keine wirtschaftliche FULL-Zertifizierung. date_report_period/end_report_period/signature_date bleiben getrennt; ein period-end-Wert ist kein Fetch-/Update-/universeller As-of-Zeitpunkt.2026-Datumsfilter liefern für alle drei erfolgreichen Fonds keine neueren Reports. VTI3626 bei limit1000 widerlegt pauschales Top1000-Abschneiden.

Vorhanden: Fund-/Series-Name, CIK/FileNumber/LEI/ISIN, Report- und Signaturdaten; Positionen mit ISIN/CUSIP/LEI, Titel, units/balance/currency/value_usd, original percent_value, asset/issuer category, payoff/collateral/restriction/fairvalue, invested_country. Positions-Ticker und Sector fehlen in diesen drei Raw-Reports. ISIN verfügbar503/516,3569/3626,99/101; fehlende Identifier werden nicht erfunden.

Extended tickerinfo bestätigt alle zwölf ETFs. `about`-Strategieprosa ist für die fünf US-ETFs vorhanden; bei den sieben primären UCITS ist das Feld leer. Beispielsweise S&P500/Nasdaq100-Benchmark oder Sampling-/Replikationsbeschreibung sind **textuell verfügbar**. Strukturierte Benchmark-/Replication-Felder, TER/OCF/AUM/NAV/UCITS/AccDist/Domicile/Inception/FundCurrency und Sector-/Country-Allocation-Contracts werden daraus nicht hergestellt. XESC-Sector ist ein Provider-Label, keine Allocation oder geprüfte Fondsklassifikation. Fehlende strukturierte Felder sind endpoint-/sample-scoped Provider-Limits; keine providerweite Behauptung, dass solche Informationen nirgendwo existieren.

## Tests, Reviews und Isolation

103/103 Tests unter Node22 bestanden:41 Marketstack-Verträge/Runner/Actions plus62 Core-Identity/Provider/Tiingo/Realtime-Wiring-Regressionen. [TAP](node22-tests.tap). Produktionsisolation bestanden. Sechs unabhängige Live-Reviews [A](review-a-live.md), [B](review-b-live.md), [C](review-c-live.md), [D](review-d-live.md), [E](review-e-live.md), [F](review-f-live.md), zusätzlich [Action-Review](action-semantics-live.md).

Geändert wurden ausschließlich Provider-/Audit-Code, Tests, Dokumentation und der ausdrücklich autorisierte manuelle Workflow und ein signierter einmaliger Final-Start im Draft-Branch. Keine Production Data, Rankings, Quant-/ETF-Methodik, SuperTrader, Tiingo, Universe-/US-Datenmigration, Registrierung, Deployments, Merge oder Schedule-Aktivierung. Der Workflow hält nur Read-Permissions; Raw-Artefakte sind verschlüsselt, Source-SHA und einmalige Credit-Lease geprüft. Initial1800+verify1200+close400+final100=3500 maximale autorisierte Reservation; jede tatsächliche Reservation dauerhaft vor Fetch.

## Authentifizierte Runs und Credits

| Actions Run | Requests | Konservativ reservierte Credits | Raw Responses | Cap |
|---|---:|---:|---:|---:|
| [37636729908](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37636729908) | 326 | 782 | 325 | 1800 |
| [37638353777](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37638353777) | 145 | 411 | 143 | 1200 |
| [37642262870](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37642262870) | 55 | 302 | 53 | 400 |
| [37645399592](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37645399592) | 21 | 78 | 21 | 100 |

**Gesamt: 547 Requests, 1573 konservativ reservierte Credits, 542 erhaltene und hashgeprüfte Raw Responses.** Ziel <2.000 erreicht, Hard Cap 3.500 eingehalten. Die fünf früheren Client-Timeouts wurden vor dem Request reserviert; im Final-Run wurden alle21 Responses einschließlich dreier HTTP504-Antworten erhalten; eine ausbleibende Response wird nicht als leere Provider-Response erfunden. Alle Runs ohne Retries, Cache-Hits oder Produktionswrites; kein Entitlement-/Quota-/Auth-Denial. Ein Rechnungs- bzw. Monatsverbrauchszähler ist nicht verfügbar. Frozen Leases 1800+1200+400+100=3500 bleiben auch bei Fehlern verbraucht und können nicht wiederverwendet werden.

Final geprüfter Connector: `86c22095e57fb1cada304b10ea3e572efc52fee9`; signierter Marker-Child `0cf0f30402d7499b3c241688e770fd1db67cd5ab`. CLI-Authentifizierung lief nach dem dritten manuellen Start ab; der vorhandene GitHub-Connector startete deshalb den letzten Lauf durch einen kryptografisch signierten, auf exakten Parent/Branch/Lease beschränkten Marker. Dieser Trigger hat keinen Schedule und keine freie Code-/Parameterauswahl.

## Europa: Snapshot, Intraday und Realtime-Semantik

`/stockprice?ticker=<native ticker>` liefert globale Venue-Zeilen. Der dokumentierte MIC-Filter gibt selbst für AAPL/XNAS404; das tatsächlich zurückgegebene NASDAQ-Label funktioniert als Provider-Filter. Europa benötigt native SAP/SIE/ALV/DTE/ASML/MC/ABBN-Parameter und eine **Listing-Auswahl anhand beobachteter Provider-Codes**. Der finale Connector nutzt die Raw-belegten ETR→XETR, EPA→XPAR, AMS→XAMS und NASDAQ→XNAS Zuordnungen. Keine implizite Suffixentfernung, keine Auswahl nach Land/Währung allein. ALV/MC/DTE auf US-Venues bezeichnen auch andere Issuer; solche Zeilen werden nicht als europäische Kurse übernommen.

| Titel | Erwartete Heimatbörse | Snapshot-Zeitstempel Raw | Preis/Währung | Normalisiert akzeptiert | Ergebnis |
|---|---|---|---|---|---|
| SAP | XETR | 2026-10-07 17:17:24 | 186.92 EUR | True | SAME_DAY_SNAPSHOT_DELAY_UNCERTIFIED |
| Siemens | XETR | 2026-10-07 17:08:25 | 270.6 EUR | True | SAME_DAY_SNAPSHOT_DELAY_UNCERTIFIED |
| Allianz | XETR | 2026-10-07 17:17:59 | 416.1 EUR | True | SAME_DAY_SNAPSHOT_DELAY_UNCERTIFIED |
| Deutsche Telekom | XETR | 2026-10-07 17:14:10 | 27.04 EUR | True | SAME_DAY_SNAPSHOT_DELAY_UNCERTIFIED |
| ASML | XAMS | 2026-08-19 13:32:51 | 1550 EUR | True | STALE_HOME_SNAPSHOT_EOD_FRESHER |
| LVMH | XPAR | 2026-10-07 17:20:00 | 388 EUR | True | SAME_DAY_SNAPSHOT_DELAY_UNCERTIFIED |
| ABB | XSWX | — | — | False | NO_REQUESTED_HOME_VENUE |

Fünf europäische Heimatlistings liefern Tages-Snapshots, ASML nur einen alten AMS-Stand vom 19.8., ABB keinen Swiss-Home-Snapshot (nur Wien 18.8.). Die Raw-Trade-Zeitstempel enthalten **keine Zeitzone**, keinen gesonderten Provider-Update-Zeitpunkt und keinen verbindlichen Delay. Bei angenommener lokaler Börsenzeit sind die beobachteten europäischen Trades deutlich verzögert; diese Annahme wird nicht als gemessene SLA ausgegeben. Daher `realtimeEurope=PARTIAL`, aktuelle Last-Known-Trade-Snapshots verfügbar, **garantierte echte Realtime oder fester Delay unbestätigt**. Pro aktuellem Listing bleibt die präzise Realtime-/Delayed-Klassifikation UNCLEAR.

European Intraday 15min/1min: alle sieben getesteten Heimatlistings liefern leere Daten oder ungültige Symbole; kein Entitlement-Error. `intradayEurope=UNSUPPORTED` im getesteten Scope. AAPL-US-Kontrolle liefert IEXG15min und1min (1min Trade-Bar im beobachteten Abruf68s alt), aber keine verifizierte Tick-/BidAsk-Feed-Semantik. Realtime-Stockprice und US-IEX-Intraday sind unterschiedliche Fähigkeiten.

## UCITS-Holdings: abschließende Symbol-/Transportprüfung

- `SXR8.DE`: HTTP 504 / invalidResponse; Run 37645399592, Raw IDs 0001; Timeoutgrenze 90s, einmaliger Request.
- `CSPX.AS`: HTTP 504 / invalidResponse; Run 37645399592, Raw IDs 0002; Timeoutgrenze 90s, einmaliger Request.
- `SPY5.L`: HTTP 504 / invalidResponse; Run 37645399592, Raw IDs 0003; Timeoutgrenze 90s, einmaliger Request.

Die drei abschließenden langsamen Holdings-Abfragen lieferten jeweils eine originale HTML-504-Gateway-Antwort nach etwa60s. Der Client bewahrt status504/invalidResponse und das Raw-HTML, statt leere Holdings oder fehlende Berechtigung zu behaupten. Damit ist eine Provider-Betriebsstörung belegt; die underlying UCITS-Coverage dieser Routen bleibt unklar.

Primäre deutsche Ticker, native Parameterhypothesen und tatsächlich beobachtete alternative Listings wurden getrennt getestet. Alternative Treffer bestätigen keine Identität oder gleiche Share-Class. Besonders `SSSPF` ist **kein gültiger SPDR-Alias**: Directory nennt SPDR, exakte Metadaten nennen Shandong Sacred Power Sources; der Widerspruch wird als Provider-Identity-Konflikt erhalten. Encoded `S&amp;P` Namenssuche findet die tatsächlich hinterlegten ETF-Namen; literal `S&P` hatte diese übersehen. Die abschließenden CSPX.AS/SPY5.L-Probes stammen aus diesen echten Directory-Treffern, nicht aus erfundenen Suffixen.

`ETFHoldingsUCITS=UNSUPPORTED` bedeutet hier keine verifizierte Holdings-Lieferung im begrenzten Test-Scope. HTTP504 belegt einen Provider-Gateway-Fehler; weder dieser noch ein Client-Timeout belegt Provider-Abwesenheit noch fehlende Tarifberechtigung. Einzelne verbleibende Transportunsicherheiten stehen explizit in capabilities.json. Keine Plan-Limit-Klassifikation ohne tatsächlichen Entitlement-Error.

## Finale Antworten auf die14 Fragen

1. **Nutzen wir alle relevanten Professional-Endpoints?** Nein. Auf main gibt es keinen Marketstack-Connector. Der Referenzadapter nutzt nur einen Teil. Der Draft bietet die neun erforderlichen Verträge plus Directory und Metadaten; der Audit testet auch Index, Bond, Currency, Timezone und Commodity. Siehe Usage-Matrix je Route.

2. **Ist Ticker Discovery vollständig paginiert?** Im neuen Draft ja, sofern der Provider valide Pagination liefert und kein explizites Cap erreicht wird. Allianz mit 2.350 Rows, SAP mit 144 Rows und fünf Exchange-Seiten wurden live bestätigt. Ein Cap meldet Unvollständigkeit. Dem Referenzadapter fehlt diese Discovery.

3. **Finden API und Website dieselben deutschen/europäischen Aktien?** Ja: 26/26 beobachtete Heimatlistings und alternative Schaeffler-Firmenlistings. Dies ist eine Aussage über den Test-Scope, keine globale Vollständigkeitsbehauptung.

4. **Warum fehlten adesso, HelloFresh, HENSOLDT, RENK und Schaeffler?** adesso/HelloFresh: VU-Discovery-/Mapping-Lücke; API-Titel und ISIN vorhanden. HENSOLDT/RENK: Ticker und Kurse vorhanden, ISIN fehlt beim Provider. Die frühere Diagnose erklärte unaufgelöste Identität voreilig zur Provider-Abwesenheit. Schaeffler: nur alternative Listings belegt, deutsche Heimatnotierung im Test nicht gefunden.

5. **Liefert ein anderer Endpoint aktuellere Europa-Preise?** Ja. Native /stockprice-Abfragen für SAP, Siemens, Allianz, Telekom und LVMH liefern Tages-Trades gegenüber dem vorigen EOD. ASML und ABB liefern auf der gewünschten Heimatbörse keine aktuellen Snapshots.

6. **Was bedeutet Real-time Stock Market Prices praktisch für Europa?** Ein globaler Last-Known-Trade-Snapshot mit Endpoint-spezifischem Venue-Code. Ein kontinuierlicher Echtzeitstream ist nicht belegt; Zeitstempel und Verzögerung sind unzureichend spezifiziert.

7. **Können wir Europa-Realtime-/Delayed-Preise tatsächlich abrufen?** Tages-Snapshots für 5/7 Heimatlistings sind abrufbar: PARTIAL. Eine feste Realtime-/Delay-SLA ist nicht belegt. Europäische Intraday-Bar-Routen sind im Test UNSUPPORTED.

8. **Sind EOD-Daten nur wegen falscher Endpoint-/Cache-Nutzung veraltet?** Aktuell kein Nachweis: ungecachte Global-Latest-, Historical-, Ticker- und Exchange-Routen zeigen dieselben älteren Outputs. 22/26 Aktien sind zum letzten abgeschlossenen Handelstag frisch. KTN.DE ist ein aktueller, aber unbestätigter Identity-Kandidat für den alten SANT.DE. Die früheren Abruf-/Cache-Zustände sind nicht rückwirkend rekonstruierbar.

9. **Liefert ETF Holdings mehr Daten als bisher materialisiert?** Die Raw-Filings enthalten 3.626 VTI-, 516 VOO- und 101 SCHD-Positionen sowie zusätzliche Report-/Positionsfelder. Ob eine konkrete alte Materialisierung Rows verlor, benötigt deren Artefakt als Vergleich. Der aktuelle Draft erhält alle gelieferten Rows.

10. **Haben wir Holdings durch fehlende Pagination abgeschnitten?** Für die drei erfolgreichen Reports nein: offset/limit werden ignoriert, der Gesamtbody ist byte-identisch. VTI liefert mehr als 1.000 Rows trotz limit=1000. Provider-Total und wirtschaftliche Vollständigkeit sind nicht zertifiziert.

11. **Welche ETF-Metadaten sind vorhanden?** Tickerinfo liefert Identität, Name, Provider-Klassifikationsfelder und about-Strategieprosa. Holdings liefern Fund-/Series-/Report-Identifier, Report-/Signaturdaten sowie Positions-Identifier, Länder, Währungen, Kategorien, Mengen, Werte und Originalgewichte. Strukturierte AUM, TER, NAV, UCITS, Acc/Dist und Allocations fehlen in den geprüften Responses. Benchmark/Replikation sind teilweise als Prosa vorhanden.

12. **Welche Daten gehen bei Normalisierung verloren?** Die Referenzprojektion ließ diverse Metadaten, Original-Venue-Labels und Quote-Optionen weg beziehungsweise behandelte Trade-Time als Update-Time. Der neue Draft erhält das vollständige Raw, typed Metadaten und description; MIC/Code, Länder und Zeitsemantik bleiben getrennt. Unbekannte Felder bleiben im Raw. Nicht projizierte typed Felder nennt die Feldmatrix ausdrücklich.

13. **Welche Connector-Fixes sind notwendig?** Directory-/Exchange-Pagination, explizit beobachtete Aliase, MIC-/Code-Trennung, native Snapshot-Abfragen mit belegtem Venue-Mapping, 61s-Pacing, vollständige Raw-/Metadaten-/Holdings-Erhaltung sowie sichtbare Fehler und Unvollständigkeit. In #479 umgesetzt und getestet, ohne Produktmethodik zu ändern.

14. **Welche früheren Schlussfolgerungen müssen korrigiert werden?** Die behauptete Provider-Abwesenheit von adesso/HelloFresh/HENSOLDT/RENK ist falsch. Europa ist nicht grundsätzlich EOD-only; nicht alle EOD-Daten enden am 5.10. Ein Top-1.000-Holdings-Limit ist unbelegt und für VTI widerlegt. Benchmark-/Replikationsinformationen existieren teilweise in Prosa. MIC-404 und 429 bei stockprice belegen keine Tarifgrenze.

## Verbleibende Provider- und Evidenzgrenzen

Keine nachgewiesene Tarifgrenze. Verbleiben: fehlende/inkonsistente Issuer-Identifier und Share-Class-Zuordnung; fehlendes beobachtetes Schaeffler-Heimatlisting; staleEOD einiger Aktien/UCITS; stale/missingSnapshotHeimatvenues; unspezifizierteSnapshotZeitzone/Latency; europäischeIntradayRouten ohne bestätigte Daten; veraltete oder fehlende ETF-Filings ohneTotal/aktivePagination; etflist ignoriertTickerFilter; ProviderName-HTML-Encoding; widersprüchlicheAdjustedBars/Basis; fehlende strukturierteFundAttributes in den geprüftenResponses. InternerProviderCache/PublicationSchedule, tatsächlichesBilledCredits/AccountplanName sowie verbleibendeTimeoutCoverage können mit diesenResponses nicht eindeutig bestimmt werden.

Der Erfolg ist die belegte Trennung von ProviderOutput, Tarifberechtigung, ConnectorAbfrage und Normalisierung. Es gibt keine Produktionszulassung, keine Universe-Erweiterung und keinen Merge.

Die sieben Final-EOD-Abfragen erfolgten etwa 11–17 Minuten nach dem kontinentalen Börsenschluss und lieferten weiterhin den 6.10. Ohne verifizierte Veröffentlichungsfrist beweist das keine verspätete 7.10.-Publikation. Die vier deutlich älteren Aktienserien und alten UCITS bleiben separate Freshness-Befunde.

Die Paritätsmatrix umfasst 39 Fälle (27 europäische Firmen und 12 ETFs); der 42-Case-Plan enthält zusätzlich AAPL/TSLA/NVDA als separate US-History-/Corporate-Action-Kontrollen. VU Found bedeutet ausschließlich Marketstack-Provider-Beobachtung im Draft, keine Aussage über bestehende VU-Produktwerte anderer Provider.

Der Holdings-Feldvergleich prüft alle 4.243 gelieferten Positionen und die vollständigen basics/attributes/signature-Objekte direkt gegen das erste Raw-Filing. Raw-Verlust 0; nicht typisiert projizierte Zusatzfelder bleiben in jeder Originalposition erhalten.

## Verbindlicher Abschluss — 8.10.2026

Der technische Lauf ist beendet. Bei dieser Konsolidierung wurden ausschließlich vorhandene Tabellen gegengeprüft und Abschlussdokumentation ergänzt: **keine neuen Marketstack-Requests, Provider-Probes, Review-Schleifen, Tests oder Architektur-/Produktänderungen**. Die Summen aus Run-, Raw-, Paritäts- und Holdings-Tabellen stimmen überein:547 Requests,1.573 konservativ reservierte Credits,542 Raw Responses,39 Paritätsfälle und4.243 erhaltene Holdings-Positionen. Der abschließende Live-Run war erfolgreich;103 Tests und die bereits abgeschlossenen unabhängigen Reviews bleiben die Validierungsbasis.

### Verbleibende UNKNOWNs

| Punkt | Status | Warum offen / vorhandener Befund |
|---|---|---|
| UCITS-Holdings-Coverage bei SXR8.DE, CSPX.AS, SPY5.L | UNKNOWN | Die tatsächlichen HTTP504-Gatewayfehler belegen weder fehlende Daten noch eine Tarifgrenze. Das operative UNSUPPORTED-Flag bezeichnet ausschließlich fehlende verifizierte Lieferung im Test-Scope. |
| Exakte Snapshot-Zeitzone, Provider-Update-Zeit und Realtime-/Delay-SLA | UNKNOWN | Raw-Zeitstempel ohne Zeitzone; fünf aktuelle Europa-Snapshots vorhanden. Etwa24–34 Minuten Alter nur bei angenommener lokaler Börsenzeit, keine zertifizierte Latenz. |
| Interner EOD-Publication-/Provider-Cache-Grund und früherer VU-Cache-Zustand | UNKNOWN | Aktuelle ungecachte Routen stimmen überein. Frühere Abrufzustände und verbindliche Publication-Frist fehlen. Final-EOD kurz nach Close ist kein Overdue-Beweis. |
| Verifizierter Account-Planname, Monatsrestbudget und tatsächlich abgerechnete Credits | UNKNOWN | Professional ist Nutzerangabe; erfolgreiche Routen und konservative Reservierungen sind belegt. Kein Rechnungs-/Accountzähler in den Responses. |
| Kanonische Issuer-/Share-Class-Zuordnung unvollständiger Treffer | UNKNOWN | KTN.DE ist kein bestätigter Kontron-Alias; Schaeffler-Heimatlisting nicht gefunden; fehlende ISINs dürfen nicht erfunden werden. SSSPF ist als widersprüchlicher SPDR-Kandidat ausgeschlossen. |
| Wirtschaftliche Vollständigkeit und aktuelle Issuer-Coverage der Holdings | UNKNOWN | Alle gelieferten Rows erhalten, aber kein Provider-total; Filings stale. Keine FULL-Zertifizierung aus Gewichtssummen oder ignorierter Pagination. |
| Universelle Adjustierungs-/Volumenbasis und lückenlose Historie | UNKNOWN | Stichproben belegen tiefe Historie und Corporate Actions, zugleich Adjusted-Defekte. Keine universelle Basis-/Kontinuitätszulassung; europäische Corporate-Action-Vollständigkeit unbestätigt. |
| Anbieterweite Verfügbarkeit fehlender strukturierter ETF-Felder / Verlust in einer konkreten alten Materialisierung | UNKNOWN | Geprüfte Responses enthalten die angefragten strukturierten Attribute nicht. Anbieterweite Abwesenheit und historische Truncation benötigen zusätzliche, hier nicht erhobene Evidence. |

### Merge-Empfehlung

**READY für den isolierten Connector-/Audit-PR #479.** Die notwendigen Root-Cause-Fixes wurden getestet und abschließend live bestätigt; Originalfelder und Gewichte bleiben erhalten, Identitäts-/Qualitätsunsicherheiten werden sichtbar ausgewiesen, Produktzulassung bleibt gesperrt. Die offenen Provider-/Evidence-Fragen verhindern keine Zusammenführung dieses inaktiven Beobachtungsadapters und seiner Dokumentation.

**Keine Produktionsfreigabe:** Keine garantierte Europa-Realtime-SLA, keine bestätigte UCITS-Holdings-Coverage, keine universelle Adjusted-Basis und keine automatische Identitätszulassung. PR bleibt auf Nutzeranweisung Draft und ungemergt; diese Empfehlung führt keinen Merge aus. Keine Schedules oder Production Data wurden geändert. Der laufende Audit ist damit abgeschlossen.
