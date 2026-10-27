# Backtest V6 — Datenlücken, Quellen und Beschaffungsabnahme

Stand: 25.10.2026. Ausgangs-Main: `675eeb97f2fbe924a991d32fa72387502ded67c5` (vor Beginn gegen Remote geprüft). Dieser Bericht betrifft Datenfähigkeit; er erteilt weder Methodikzertifizierung noch Produktfreigabe. Öffentliche Anbieterdokumentation wurde lesend geprüft. Es wurden keine kostenpflichtigen Daten bestellt, keine Verträge geändert und keine produktiven Providerabrufe oder Scheduler eingerichtet.

## 1. Verbindliche Population und Zeitgrenzen

Grundpopulation sind historische **primäre US-Stammaktien** an NYSE, Nasdaq und NYSE American, einschließlich später delisteter Listings. Börse, Instrumentklasse, Primärlisting und Handelsstatus müssen zeitlich gültig belegt sein; heutige Klassifikationen reichen nicht. Indexstrategien benötigen zusätzlich die damalige Indexmitgliedschaft und gegebenenfalls Gewichte einschließlich Bekanntgabe- und Wirksamkeitszeit.

`MAX` ist das früheste **gemeinsam zulässige** Zeitfenster aller benötigten Eingaben, mit echtem Warm-up, Entry-Verfügbarkeit und Outcome-Nachlauf. Eine Preisreihe kann deutlich weiter reichen als ein Faktor- oder Membershipdatensatz. Ein längerer Preisbestand verlängert deren fachliche Zulässigkeit nicht. Es gibt weder ein allgemeines Jahr-2006-/2020-Limit noch eine pauschale fünfjährige Zukunftswartepflicht.

Drei Beweisarten bleiben getrennt: damaliges Originalarchiv, heute belegbar rekonstruierte Historie aus damals verfügbaren Eingaben und neue prospektive Beobachtung. Rekonstruktion erzeugt keine damalige Veröffentlichung eines VU-Snapshots. Bereits betrachtete historische Ergebnisse werden durch einen Providerwechsel oder erneute Berechnung kein unabhängiger Holdout.

## 2. Tatsächlich belegter Repositorybestand

Die folgenden Qualitätszahlen sind **bestehende versionierte Messstände**, keine in diesem Bericht neu durchgeführten Datenqualitätsläufe:

| Bestand | Nachweis | Reichweite und Grenze |
|---|---|---|
| Preisreplay | `BACKTEST_V6_HANDOFF.md`, `v6-securement/validation.json` | 6.190 Kandidaten, 4.451 Klasse B, 1.739 Klasse C; 22.255 Periodenergebnisse. Kein vollständiges damaliges Marktuniversum. |
| Langserien | `quant/data/market/discover-series-long/ref_*.json` | 6.190 Dateien plus Index am Ausgangs-Main; splitbereinigte Wochenhistorien sind nicht automatisch TR oder archivierte Provider-PIT-Vintages. |
| Kanonischer TR der separaten Signalstudie | `quant/data/product/total-return-quality-v1.json` | 6.036/6.174 Serien; 138 Ausschlüsse (101 CA-Widersprüche, 35 Dividenden-, 2 Splitlücken). Das ist eine andere Population als die Preisreplay-Generation. |
| TR-Gegenprobe | dieselbe Datei | 561 Gegenreihen-Konflikte. Ursache und Bedeutung sind je Fall zu prüfen; Konfliktzahl allein beweist nicht, welche Reihe falsch ist. |
| Delisting-Sensitivität | `quant/data/product/survivorship-control-v1.json` | 3.082 nutzbare Listings; private Manifest-/R2-Artefakte nur teilweise im öffentlichen Repository nachgewiesen. Nicht gleichbedeutend mit vollständigen terminalen Auszahlungen. |
| Security Master | `quant/data/market/security-master/` | Heutige/partielle historisierte Identität; kein Nachweis vollständiger damaliger Marktzugehörigkeit für die gesamte Kursgeschichte. |
| Indexarchive | `quant/data/market/index-membership/history/{DJIA,NDX,SP500}/` | Je sechs datierte Dateien von 15.09.–24.10.2026; 18 Dateien sind keine 18 unabhängigen historischen Monate. |
| Setup-Beobachtungen | `quant/data/product/setup-observation-history/setup-mapping-1.0.0/` | 20 datierte Dateien von 10.09.–23.10.2026. M6-Ausgänge sind nach bestehendem Stand noch nicht gereift. |
| Faktorbeobachtungen | `quant/data/product/factor-evidence-history/` | 20 Stände der Version 2.0.0 von 23.09.–23.10.2026; zusätzlich zwei ältere v1-Stände. Versionsketten dürfen nicht still zusammengeführt werden. |
| SEC | `quant/data/sec/`, `docs/SEC_PIT_METHODOLOGY.md` | Eingabe-/Normalisierungsmechanik vorhanden; Consumerexport ist kein vollständiger Vintage-Timeline-Ersatz. SEC ist kein Listing-/Delisting-/Indexfeed. |
| Regime | `quant/data/product/market-regime-history/`, `quant/methodology/market-regime-v1.json` | Junge originale Beobachtung des Produktuniversums; keine zertifizierte marktweite Langzeithistorie. |

Die Zahlen 6.190, 6.174 und 3.082 dürfen nicht addiert oder als identische Grundgesamtheit verwendet werden. Ein Quellennenner muss aus zeitlich zulässigen Listings entstehen; Ausschlüsse/zensierte Fälle bleiben separat bilanziert.

### SEC-Consumerexport nicht rückdatieren

Der stichprobenartig gelesene Consumerexport `quant/data/sec/consumer/CIK0000001750.json` trägt `policy=as_of_latest` und `asOf=2026-10-25`. Historische Geschäftsjahreszeilen können aus späteren Vergleichsfilings stammen. Der spätere `filed`-/Accession-Bezug ist zu respektieren. Eine Filterung des heutigen Consumerexports kann frühere, dort nicht mehr enthaltene Vintages nicht wiederherstellen. Historische Faktoren brauchen die ursprünglichen accessiongebundenen Eingabetimelines und die existierende PIT-Normalisierung. Bei nur tagesgenauer Filingzeit ist ein Intraday-Entry desselben Tages nicht belegt. Veröffentlichung von Quartalszahlen kann vor SEC-Acceptance liegen; Acceptance ist keine erfundene Earnings-Uhrzeit.

## 3. Datensatzbezogene Lücken und Beschaffungsentscheidung

In jeder Zeile bedeutet Zeitraum: maximal verfügbare geeignete Geschichte für die deklarierte Studie, einschließlich nötigem Lookback/Nachlauf; keine willkürliche gemeinsame Jahresgrenze.

| ID / Datenart | Betroffene Funktionen | Benötigter Zeitraum und Population | Vorhandene Quelle / konkrete Lücke | Mögliche Ergänzung und Abnahme | Benötigte Nutzerentscheidung |
|---|---|---|---|---|---|
| D01 Listing-Lifecycle, Identität | alle sechs Arten, Regime, Event, Rebalance; indirekt übrige Validierungen | Alle damals zulässigen US-Listings, einschließlich Umbenennungen/Delistings, je Stichtag | Tiingo/interner Master; vollständige historische MIC-, Instrument-, Primärlisting- und Tickerintervalle fehlen | CRSP als zu prüfende lizenzierte Quelle; Crosswalk-PoC mit Wiedervergaben, Börsenwechseln, mehreren Klassen. Keine tickerbasierten Joins | Lizenzierte Lifecycle-Quelle und benötigte Historientiefe erst nach PoC/Angebot auswählen |
| D02 Delisting-Endwerte | Replay, Pattern/Signal/Setup-Outcomes, Strategy, Ranking, Monte Carlo, Rebalance | Alle innerhalb eines Outcomes/Bestands endenden Listings | Partielle Delistingreihen; unbekannte Barausgleiche, Liquidationserlöse und Wertpapierumtausche | Sourced terminal consideration, Verhältnis, Zahlung/Wirksamkeit und Listinggraph; CRSP bzw. spezialisierter CA-Anbieter im PoC. Vendor-Rückgabe ist kein automatischer Beweis | Budget und Rechte eines passenden Angebots; kein Kauf erfolgt |
| D03 Roh-OHLCV und Vintages | alle Preis-/Ausführungsfunktionen | Je Titel geeignete Wochen-/Tages-/gegebenenfalls Intradaygeschichte | Tiingo-Bestände; jüngste Korrekturstände sind nicht automatisch damals gelieferte Vintages | Vorhandenen Dailybestand/Privatcache zuerst nutzen; fehlende historisierte Revisionen/PIT-Bars explizit markieren. Marketstack-US-Konto-/Feldprobe nur im genehmigten Budget | Falls nötig zusätzlicher unveränderlicher Archivzugang; keine automatische Massennachfrage |
| D04 Splits, Dividenden, Spezial-CA | alle Anlage-/Forward-Outcomes | Ereignisse über sämtliche gehaltenen/ausgewerteten Intervalle, einschließlich delisteter Titel | Kanonischer TR plus Ausschlüsse/Gegenproben; Spezialereignisse und Ankündigungs-/Zahlungszeit teilweise offen | Primärbelege oder zweite lizenzierte Quelle; exakte Returnfaktor-/Cashparität pro Event, Revisionshistorie. Ungeklärtes bleibt blockiert | Quelle für ungedeckte Spezialereignisse und Nutzungsrechte auswählen |
| D05 Universum/Indexmembership | marktweite Pattern/Signal/Setup/Ranking, Strategy, Regime, Rebalance | Historische US-Grundpopulation bzw. jeweiliger Index, Bekanntgabe + effektive Zugehörigkeit | Junge DJIA/NDX/SP500-Snapshots; heutiges VU-Universum kein Ersatz | Lizenzierte Indexanbieter-/CRSP-Daten nach Feldprüfung. Gewicht, Adds/Removes und Publikationsvintage prüfen; Index-Trademark-/Derived-Rechte separat | Welche Indexstrategie zuerst; Angebot für echte historische Membership/Weights |
| D06 PIT-Fundamentals | Setup soweit fundamental, Strategy, Factor Ranking, Event | Je Studie damalige US-Emittenten; revisionssichere Filedaten, auch spätere Nichtüberlebende | SEC-Ingest vorhanden; Consumeransichten sind kein vollständiges historisches Originalarchiv | SEC-Originalfilings/Submissions/Companyfacts mit Accession-Timeline wiederverwenden. Pre-XBRL strukturelle Lücke; Estimates/Consensus benötigen zusätzliche Quelle | Falls benötigte Faktoren nicht SEC-rekonstruierbar: kommerzielle Vintagequelle wählen, kein heutiger Wert rückdatiert |
| D07 Historische Faktorquerschnitte | Factor Ranking, Strategy, gegebenenfalls Setup, Rebalance | Alle damals eligible Listings je Entscheidungszeit; gemeinsame Formelversion | Kurze originale Faktorhistorie; fehlende historische Inputs/Population | Berechnung ausschließlich aus belegten PIT-Inputs, mit Formel-/Inputhash und Rekonstruktionslabel; veröffentlichte Originalsnapshots bleiben getrennt | Fachlich zulässiger Nachweistyp pro bestehendem Gate; keine Senkung der 24-Monats-Gates |
| D08 Unternehmensereignisse | Event-Driven, Ereignisvarianten von Setup/Signal | Datierte US-Ereignisse mit genauem verfügbaren Zeitpunkt und Revision | SEC-Publikationsmechanik vorhanden; flächendeckende Earnings-Release-Zeit/Revision nicht belegt | SEC accessiongebundene Finanzberichte zuerst; Earnings erfordern Original-IR-/Newswire- oder lizenzierten Eventfeed. Identität, Zeitzone, Session und Korrektur testen | Priorisierte Ereignisklasse und gegebenenfalls Quelle nach PoC |
| D09 Regime | Regimeanalyse, regimeabhängige Zertifizierung aller betroffenen Studien | Je deklarierter Population; ausreichend unabhängige Zustands-/Stressepisoden | Junge Produktuniversums-Beobachtungen; keine lange unveränderliche Regime-Publikationshistorie | Ex-post Labels sind als Beschreibung zulässig, entsperren keine Original-PIT-Gates. Belegte historische Inputs/Archive prüfen; prospektiv gesammelt bleibt separat | Vorschläge zu Regimeumfang/Cluster-/Powerkriterien fachlich ratifizieren; keine pauschale Fünfjahrespflicht übernehmen |
| D10 Benchmarks/FX | alle vergleichenden Renditefunktionen | Exakte gemeinsame Bewertungsdaten, gleiche Returnbasis/Währung; SPY erst ab realer Historie | SPY-TR vorhanden für Teilfenster; ältere MAX-Zeiträume können SPY-unverfügbar sein. FX separat lizenziert | Passender vorregistrierter TR-Index nur bei Daten-/Lizenznachweis; keine synthetische SPY-Rückverlängerung. USD-Basis reduziert FX-Bedarf, ersetzt ihn bei Fremdwährungscashflows nicht | Passenden zusätzlichen Indexbenchmark gegebenenfalls lizenzieren; kommerzielle FX-Frage separat |
| D11 Historische Ausführungskosten | handelbare Replay/Signal/Setup/Strategy/Ranking, Sensitivität, Rebalance | Je Instrument und Datum relevante Liquidität/Spread/Impact | Gebühren-/Slippagemodelle vorhanden; Modell-bps sind keine historische Brokerabrechnung oder beobachteter Spread | Vorhandenes Volumen/PIT-Liquidität nutzen; für stärkere Ausführbarkeitsaussagen lizenzierte Quotes/Trades/Spreadprobe. Kostenstress bleibt Modell | Gewünschte Ausführungsgranularität und Datenbudget; keine implizite Intraday-Zertifizierung |
| D12 Unberührte Ergebnisse | Replay-Regel, Pattern/Signal/Setup/Strategy/Ranking, OOS/WF/Sensitivität | Vorregistrierte noch nicht betrachtete Kohorte; vollständig gereifte Zielhorizonte | Viel Historie bereits explorativ betrachtet; anderer Provider erzeugt keine neue Zeitunabhängigkeit | Nachweisbar versiegelte externe Kohorte oder prospektiver Test; Zugriff/Entsiegelung protokollieren. Technische Replikation separat fortsetzen | Analyse-/Entsiegelungsplan freigeben, sobald konkret; kein festes Zukunftsdatum versprechen |
| D13 Lizenz, Aufbewahrung, Zugriff | sämtliche Quelldaten und Ergebnisgenerationen | Gewähltes Team/Hosting/Nutzer-/Aufbewahrungsszenario | Bestehende scoped Owner-Grants, keine pauschale Erweiterung auf alle V6-Felder/Nutzungen | Schriftlich Speicherung, Bearbeitung, unabhängige Audits, Derived Data, Anzeige, Retention nach Vertragsende und Provider-/Indexweitergabe prüfen | Nur konkrete Vertrags-/Bestellangebote nach Prüfung freigeben; öffentliche V6-Auslieferung ist nicht beauftragt |

Unbekannte terminale Werte werden weder durch Null, letzten Kurs noch −100 % ersetzt. Für relevante fehlende Outcomes sind zusätzlich vorregistrierte Zensierungs-/Sensitivitätsgrenzen nötig; die ungeklärten Fälle dürfen nicht ergebnisabhängig aus dem Universum entfernt werden.

## 4. Datenfähigkeit der 13 Funktionsbereiche

| Bereich | Zulässige vorhandene Grundlage | Verbleibende historische/independence Abhängigkeit |
|---|---|---|
| Same Stock Replay | Eigene echte Listinghistorie für deskriptive Fälle; technische Regeltests getrennt | D01–04, D10–12 für bestätigende/handelbare Aussage; ausgesuchter Überlebender keine Marktpopulation |
| Pattern Evidence | Bestehende Patternengine und explorative gespeicherte Geschichte | D01–05, D09–12; historische Kontrollpopulation, TR und unabhängige Validierung |
| Signal Backtest | Fünf vorhandene Regeln; NEW_52W_HIGH-Wochenledger als Mechanikreferenz | D01–05, D09–12; Delistings in Hauptpopulation, nicht nur Sensitivität |
| Setup Backtest | Originalbeobachtungen; korrekt gelabelte historische Rekonstruktion nach Inputs | D01–07, D10–12; M6-Reife und ursprüngliche Zustände nicht erfinden |
| Strategy Backtest | Bestehende PIT-Profil-/Portfoliomechanik | D01–07, D10–12; reale damalige Membership und vollständige Cash-/CA-/Terminalbuchhaltung |
| Factor Ranking | Faktor-/Forwardengine und junge Originalquerschnitte | D01–07, D10–12; keine aktuellen Rankings auf alte Population übertragen |
| Monte Carlo | Geeignete echte Netto-Trade-/Renditefolgen; synthetische Testfixtures für Mechanik | Modellannahmen, Stichprobeneignung, Abhängigkeit und Eingabeprovenienz; Simulation repariert D01–12 nicht |
| Walk-Forward | Chronologische Splits und Outcomeintervalle auf vorhandenen Daten | Vollständige PIT-Eingaben und gereifte Labels; bekannte Fenster bleiben bekannte History |
| Out-of-Sample | Register/Versiegelungsmechanik ist ohne neue Daten implementierbar | D12: bestätigende Evidenz nur nach realer unabhängiger Kohorte |
| Marktregime | Beschreibende Analyse verfügbarer Daten | D01/03/05/09; PIT-gesteuerte Handelbarkeit benötigt damalige verfügbare Regimeinputs |
| Parameter-Sensitivität | Vorregistriertes Raster und existierende Regeln/Kostenmodelle | D11/12; Nachbaroptimierung auf bekanntem Testbestand nicht als neue Bestätigung ausgeben |
| Event-Driven | Engine und accessiongebundene Berichtsevents, soweit nachgewiesen | D01–04/08/10–12; fehlende Ereignisdaten ergeben keine erfundenen Live-Ergebnisse |
| Portfolio-Rebalancing | Vorhandene Positions-/Cash-/Rebalancekomponenten | D01–07/10–12; echte Membership, Faktoren und Terminalwerte für reale universumsweite Läufe |

Engine-/Negativ-/Referenztests können mit eindeutig synthetischen Fixtures implementiert werden. Solche Fixtures sind keine historische Datenabdeckung und keine unabhängige Markt-Evidenz. Der technische Implementierungsstand wird in der separaten Zertifizierungsmatrix berichtet.

## 5. Bestehende Rechte respektieren, Scope nicht erfinden

- `quant/config/development-preview.json`: Owner-Erklärung vom 13.09.2026 zur Tiingo-Anzeige von Tageskursen/abgeleiteten Werten/Kursverläufen des Produktuniversums; Vertragstext nicht im Repository. Dieser bestehende Scope bleibt wirksam und wird nicht erneut zur Freigabe gestellt. Daraus folgen keine unbeschränkten neuen Vintage-/Index-/Delisting-/Audit-Retention-Rechte.
- `core/rights/marketstack-display.json`: `CONFIRMED_BY_OWNER`, kommerzielle normalisierte **europäische** Identitäts-/Close-Anzeige für Discover, Search, Watchlist, Close charts. Keine RAW-Redistribution, keine automatische analytische Zertifizierung. Kein Beleg eines vollständigen historischen US-PIT-/Delistingprodukts.
- `quant/config/fx-license.json`: Tiingo-FX-Development-Risikoentscheidung, keine bestätigte kommerzielle Lizenz; bestehende Entwicklungsfreigaben nicht widerrufen. V6 aktiviert keine neue öffentliche FX-/Backtestauslieferung.
- `providers/marketstack/README.md`: API-Methodenpräsenz beweist weder Kontorecht noch Feldabdeckung. Liveaudit benötigt expliziten Budgetrahmen, reserviert Seiten/Retrykosten und schreibt privat. Keine bestehende Credit-Lease für einen anderen Auftrag still wiederverwenden.

## 6. Ergänzende Quellen — tatsächlich geprüft und offen

Abrufdatum 25.10.2026; HTTP-Status, Abrufzeit und SHA256 erfolgreicher öffentlicher Seiten stehen in `v6/data-sources.json`. Es wurden ausschließlich öffentliche Informationsseiten gelesen. Kein Credential, kein Provider-Rohdatensatz und keine lizenzierte Kursreihe wird hier veröffentlicht.

| Quelle | Öffentlich belegter Nutzen | Preis-/Rechtestand | Integrationsaufwand und Beschaffungsurteil |
|---|---|---|---|
| Tiingo, vorhandener Bestand | Reale Kurs-/CA-Verarbeitung im Repository; kanonische Gegenprüfung vorhanden | Aktuelle offizielle Preis-/Dokuseiten hier HTTP 403; Kontovertrag und V6-Erweiterungspreis nicht neu verifiziert. Bestehende Owner-Grants wie oben | Zuerst vorhandene Langserien/Daily-/Privatarchive reparieren; Zusatzfelder/Vintages/terminal values nur nach Feldprobe. Kein pauschaler PIT- oder Vollständigkeits-Pass |
| Marketstack, vorhandener Adapter | HTTPS-v2 Auditadapter, explizite MIC-/Identitäts-/Pagination-/Budgetmechanik; US-MIC-Mapping ist kein US-Historiennachweis | Offizielle Produkt-/Dokuseiten hier HTTP 403. Bestehender europäischer Displaygrant; keine neue Preis-/US-Rechtebehauptung | Begrenzte US-Feldprobe könnte zweite Preis-/CA-Gegenquelle prüfen; keine Masseningestion oder Kontingentannahme |
| CRSP US Stock Databases | Offizielle Produktseite nennt über 100 Jahre, täglich/monatlich, Corporate Actions, über 36.000 aktive/inaktive Securities und permanente PERMNO/PERMCO | Preis nicht veröffentlicht/verifiziert: individuelles institutionelles Angebot erforderlich. Lizenz für Team, Derivate, Auditretention und etwaige Anzeige schriftlich klären | Starker PoC-Kandidat für Lifecycle/Identität/Returns; API-/Dateiformat, delisting consideration und Membership-Publikationsvintages gesondert prüfen. Produktbeschreibung allein kein Pass |
| SEC EDGAR APIs/Originalfilings | Offizielle Dokumentation: öffentlich ohne API-Key, Submissions und XBRL; XBRL seit Einführung ab 2009, Originalfilings/Accession für Vintagebindung | Kein Datenabonnementpreis laut öffentlicher API-Dokumentation; Ingestion-/Speicher-/Betriebskosten bleiben. Fair-Access-/Nutzungsbedingungen beachten | Bestehenden Ingest wiederverwenden; kein Security Master, kein Delistingfeed, keine Estimates. Intraday benötigt genaue Acceptance/Publikationszeit und gegebenenfalls Verbreitungsverzug |
| Norgate US Platinum/Diamond | Offizielle Paketseite: Platinum ab 1990, Diamond ab 1950, inkl. delisted securities/historical index constituents. Contentseite verneint Vollständigkeitsanspruch besonders 1950er/frühe 1960er; Fundamentals als **current** beschrieben | Öffentlich gelistete **persönliche** 12-Monats-Pakete: USD 630 / USD 787,50; 6 Monate USD 346,50 / USD 433,13. **Kein institutionelles Angebot.** FAQ sagt derzeit nur persönliche Nutzung, keine Business-/Commercial-Lizenz. EULA verbietet kommerzielle/professionelle Nutzung und erfordert Löschung von Content nach Aboende | Standardabo für den VU-Auftrag **NO_GO_LICENSE_SCOPE**. Nicht als billige kommerzielle Lösung empfehlen. Updater benötigt unterstütztes Windows; Exportverarbeitung anderswo ändert Lizenz nicht. Keine historischen PIT-Fundamentals zugesagt |
| Indexanbieter / weitere Fundamental-/Eventanbieter | Mögliche direkte Angebote von S&P DJI, Nasdaq, FTSE Russell bzw. spezialisierten Fundamental-/CA-/Eventanbietern | In diesem Lauf keine verifizierten passenden Angebote/Preise/Datensamples; **CANDIDATE_NOT_VERIFIED**, keine Eignungszusage | Erst konkret benötigte Felder/Population/Publikationsvintages anfragen; keine Integration allein aufgrund Marketingbezeichnung „PIT“ |

Offizielle Quellen:

- https://www.tiingo.com/about/pricing — HTTP 403; kein aktueller Preis verifiziert.
- https://www.tiingo.com/documentation/end-of-day — HTTP 403.
- https://marketstack.com/product — HTTP 403; kein aktueller Preis verifiziert.
- https://marketstack.com/documentation — HTTP 403.
- https://www.crsp.org/research/crsp-us-stock-databases/ — Produktbeschreibung, keine Preisfreigabe.
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces — öffentliche API-Semantik.
- https://norgatedata.com/stockmarketpackages.php — Paketpreise und Historientiefe.
- https://norgatedata.com/data-content-tables.php — Dateninhalt und explizite Abdeckungslimits.
- https://norgatedata.com/faq.php — nur persönliche Nutzung, keine derzeitige kommerzielle Lizenz, Contentlöschung nach Ablauf.
- https://norgatedata.com/subscribe/eula.php — EULA `20261002`, Personal-Use-/Weitergabe-/Ablaufregeln.
- https://norgatedata.com/ndu-installation.php — Windows-/Speicheranforderungen.

Preise sind gelesene Listenpreise zum Prüfzeitpunkt, keine Angebote oder Kaufempfehlungen; insbesondere dürfen Norgate-Individualpreise nicht auf institutionelle Rechte übertragen werden. Fehlende überprüfbare Preise werden nicht geschätzt.

## 7. Verbindliche Daten-PoC-Abnahme vor einem Backfill

1. Vorregistrierte Probe umfasst aktive und delistete Stammaktien, Tickerwiedervergabe, Rename, mehrere Klassen, Börsenwechsel, Indexadds/-removes, Split/Reverse Split, normale/Sonderdividende, Cash-/Stock-Merger, Spin-off und unbekannten terminalen Fall.
2. Quelle liefert unveränderliche Listingzuordnung, zeitliche Zulässigkeit und belegte Eingabeverfügbarkeit; Ambiguität wird quarantänisiert. Keine heutige Klassifikation auf Vergangenheit übertragen.
3. Rohpreis-/CA-/TR-Parität und terminale Cash-/Stockbuchführung werden unabhängig nachgerechnet. Delisting-Grund und Auszahlung sind getrennte Felder.
4. Coverage wird nach Zeitraum, Klasse und Endstatus mit vollständigem Nenner gemessen. 99,5 % ist archivierter Vorschlag, kein bereits genehmigtes V6-Gate. Kein Prozentwert erlaubt ungeklärte Identitäts-/CA-Brüche im primären Sample.
5. Revisions-/Korrekturabrufe, Wiederholbarkeit, Hashes und Verfügbarkeitsstempel bestehen. Heutiges `retrieved_at` beweist keine frühere Veröffentlichung.
6. Speicherung, Engineeringteam, unabhängiger Audit, abgeleitete Ergebnisse und Auditretention sind passend belegt. Öffentliche Anzeige bleibt ein separater späterer Auftrag.
7. Erst danach ein begrenzter Adapter/Backfill mit Budget, Checkpoint, Fehlerbilanz und Generation; produktive Scheduler bleiben unverändert.

Erforderliche externe Entscheidungen sind somit konkrete Datensample-/Lizenz-/Budgetentscheidungen sowie fachliche Ratifikation offener Kriterien. Sie blockieren keine korrekt ausführbaren Engine-, Eingabevertrags-, Negativ- und Referenzarbeiten. Ein belegter No-Go-Datensatz darf nicht durch synthetische historische Werte, neue Etiketten oder niedrigere Gates ersetzt werden.
