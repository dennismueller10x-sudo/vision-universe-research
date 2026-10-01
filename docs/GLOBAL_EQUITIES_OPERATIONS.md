# Global equity data layer

Stand: 2026-10-01. Geschützte Ausgangsbasis: `0ec4d2631de7bba4493c4b0665f3ce6e0cf26d55`.

## Tatsächlicher Umfang

- 39 **bereits vorhandene** internationale US-Listings werden anhand echter Tiingo-Verzeichnisdaten und SEC-Submissions zentral angereichert. Dies ist keine Behauptung über 39 neu importierte Aktien.
- 19 Unternehmensländer, 39 bestehende Kursreihen, 33 jährliche SEC-Fundamentals, sechs ohne jährliche Umsatz-Coverage. Alle 39 Listings handeln in USD; Reporting-Währungen bleiben separat erhalten.
- 40 Company-Identitäten: 39 SEC-Emittenten und LVMH als zusätzliche, durch offiziellen LEI identifizierte Filing-Entity. LVMH wird dadurch **nicht** als handelbares Listing aktiviert.
- LVMH ESEF 2024: zwölf tatsächliche kanonische Facts für FY 2023/2024; Umsatz 2024 = 84.683 Mio. EUR. Quelle ist das offizielle französische OAM-Paket, kein PDF, keine Schätzung. Vier semantisch widersprüchliche Net-Income-/Equity-Kandidaten bleiben quarantiniert.
- Keine neuen lokalen europäischen/asiatischen Listings, ETF-Preise, ETF-Fundamentals oder ETF-Produkte.

## Identität und zentrale Propagation

`quant/data/universe/global-equities.json` ist ein optionaler, validierter Zusatz zum bestehenden Security Master. Es enthält getrennte Company-Einträge und Listings. `companyId` ist bei SEC-Emittenten die bestehende `iss_cik_*`-Identität; `listingId` bleibt die bestehende `vu_*`-Instrument-ID; `securityId` bleibt der bestehende `ref_*`-Alias. Bei einer künftig belegten zweiten Security ist eine getrennte Security-Identität erforderlich. Es gibt keine Fusion nach Firmennamen und keine erfundenen ISIN/FIGI/LEI/ADR-Ratios.

`resolveProductUniverse` und die bestehenden Master-/Index-Builds projizieren die Metadaten. Membership, US-IDs, Eligibility, URL-Namespace `US_REAL`, US-Scoring und bestehende Kalender werden erhalten. `country` im alten Master bleibt das Listing-Land; das neue `companyCountry` und die kompakte Search-Spalte `cc` beschreiben das Unternehmensland. Grundlage ist ausdrücklich die SEC Business Address, **nicht** die Rechtsdomizilannahme. DB und LOGI bleiben wegen nicht belastbarer Adresszuordnung unangereichert; ihre bestehenden Listings werden nicht entfernt.

Discover, Screener und Produktidentitäten erhalten Company-/Listing-ID, Unternehmensland, Region, Trading-/Reporting-Währung und Coverage. Die globale Discover-Suche versteht beispielsweise „German stocks“ und „European equities“. Exakte bestehende Ticker haben Vorrang: `DE` bleibt Deere. Der bestehende Shard-Suchindex und dessen Payload-Grenzen bleiben erhalten; die vollständige Tiingo-Liste landet ausschließlich im ignorierten Cache.

Der Screener behält seine bestehenden USD-Monetary-Spalten und deren Safety-Gates. Fremdwährungsumsätze/-Cash-Werte werden dort weiterhin zurückgehalten; Unternehmensland, Reporting-Currency, Wachstum, Margen und Technik sind getrennt verfügbar. Das ist eine ausgewiesene Product-Coverage-Lücke, keine Datenkonvertierung oder Null-als-Zero-Behandlung.

Discover-Watchlists speichern neue Einträge mit Listing-ID in einem zusätzlichen Store. Alte Tickerlisten werden beim Lesen erhalten und nur bei expliziter Benutzerentfernung verändert. Neue Links tragen optional die Listing-ID; ein abweichendes Listing wird abgewiesen. Quant besitzt bereits Security-ID-Watchlists. Die übrigen noch tickerbasierten Materializer werden erst nach einem gesonderten Kollisionsnachweis für tatsächliche lokale Listings freigeschaltet.

Logos verwenden die vorhandene zentrale Asset-/Domain-/Fallback-Pipeline. Die Company-ID ist die zusätzliche kanonische Asset-Identität; bestehende Logo-URLs bleiben bestehen. Es wurde kein zweiter Provider und kein neues Scraping hinzugefügt.

## Tiingo Coverage und Marktzeiten

Quelle: <https://apimedia.tiingo.com/docs/tiingo/daily/supported_tickers.zip>; kompaktes Audit: `quant/data/universe/tiingo-global-coverage.json` mit Hash und Abrufzeit.

Gemessen: 108.908 Verzeichniszeilen, darunter Stock/Fund/sonstige bestehende Typen. Währungen: USD 101.694, CNY 7.157, HKD 52, AUD 5. Es sind **keine EUR-, CHF-, GBP-, DKK-, SEK-, NOK-, JPY-, KRW-, TWD- oder INR-Zeilen** enthalten. Xetra, Frankfurt, Paris, Amsterdam, Brüssel, Madrid, Mailand, Wien, SIX und die nordischen Primary Venues sind im Verzeichnis nicht nachweisbar. London: elf LSE-Stock-Zeilen in USD; keine allgemeine GBP-LSE-Abdeckung ableitbar. SHG/SHE-Zeilen belegen Verzeichniseinträge, keine geprüfte Account-Coverage oder Importfreigabe.

Tiingo-Dokumentationsseiten und unauthentifizierte API-Probes lieferten in dieser Umgebung 403. Daraus wird **kein Tarifurteil** abgeleitet. Ein Tiingo-Key und Fallback-Credentials fehlen; neue authentifizierte EOD-/Intraday-/Realtime-Probes sind deshalb nicht durchgeführt. Bestehende lizenzierte US-Pipelines und ihre bisherigen Capability-Befunde bleiben erhalten. Der Status `VERIFIED` bei Kursen bedeutet hier nachgewiesene Repository-Historie, **nicht Live oder neuer erfolgreicher API-Abruf**.

Daily Bars erhalten die gemappte Originalwährung. Display-Currency wird nicht in die Raw Bars geschrieben. IEX wird für ausdrücklich lokale/non-USD Mappings abgewiesen; fremde Company-Adressen ändern die US-Handelszeiten ihrer US-Listings nicht. Ein unbekannter Exchange erbt keine NYSE-Sitzung. Bestehende exchangebezogene Kalender bleiben bestehen; fehlende lokale Feiertagsabdeckung wird nicht als vollständig erklärt.

## ADR-, Liquidity- und Valuation-Policy

Die zentrale Konfiguration enthält Discovery-Kandidaten, keine zugesicherten ADR-Eigenschaften. `selectPreferred` verlangt aktive Equity, belegte Kurs-Coverage, mindestens 250 Bars und mindestens 5 Mio. **USD-äquivalenten** Tagesumsatz. Rohwährungen bleiben erhalten; ohne belegte FX-/Liquidity-Basis wird keine lokale Listing-Auswahl getroffen. Geeignete belegte US-ADRs gehen Primary Listings vor; OTC-Erweiterung ist gesperrt.

Bei den 39 bestehenden Listings sind ADR-Status und Ratio mangels eindeutiger Depositary-Evidenz bewusst nullable/`UNVERIFIED`. Die alte Security-Type-Klassifikation allein genügt nicht als Ratio-Nachweis. Share-based Valuation wird bei unklarer Aktienbasis oder Reporting-/Trading-Währungsabweichung zurückgehalten; bestehender US-Grund `NON_USD_REPORTING` bleibt erhalten. Sieben zusätzliche Discover-Titel verlieren ungesicherte P/E-/P/S-/FCF-Yield-Inputs; sechs davon sind im vorhandenen Screener-Scope. Currency-neutrale Kennzahlen und Technik bleiben verfügbar. Der Quant Score wurde nicht neu gestaltet; bestehende Composite-/Ranking-Publication-Gates bleiben gültig.

`adrRatio` bedeutet Ordinary Shares pro ADR. Mit gesondert belegter Aktienbasis gilt ADR Share Count = Ordinary Shares / Ratio; Ordinary EPS wird mit Ratio auf ADR-EPS umgerechnet. `shareCountBasisSource` und `epsBasisSource` sind getrennte Pflichtnachweise für diese Berechnungen. Eine bekannte Ratio allein schaltet keinen unklaren Company Share Count frei; bei unbekannter EPS-Basis bleibt P/E fehlend. Historische ADR-Ratio-/Share-Class-/Corporate-Action-Reihen sind weiterhin vor einem globalen Valuation-Backtest gesondert nachzuweisen.

## Fundamentals und PIT

SEC bleibt der bestehende Datenweg, einschließlich vorhandener 20-F/40-F-/IFRS-Unterstützung. Company-Fundamentals bleiben nach CIK zentral. Echte SEC-Companyfacts-Abfragen für SAP, TSM, BABA und XPEV bestätigten jeweils den gespeicherten Jahresumsatz einschließlich Währung, Periodenende, Filing-Date und Accession exakt. TSMs hier gespeicherter bestätigter Umsatz betrifft FY 2024; es wird kein FY-2025-Wert erfunden.

`providers/official-filings/adapter.js` implementiert denselben `FundamentalDataProvider`-Vertrag. Fakten werden einmal je Company gespeichert und erst beim Abruf auf ein Listing projiziert. Der Adapter besitzt keine Market-Data-Verbindung. Europäische Quellen sind weiterhin **teilweise** implementiert: Frankreich-Discovery und echte ESEF-Normalisierung funktionieren; die übrigen nationalen Discovery-Feeds und die automatische breite Company-/Listing-Zuordnung sind noch nicht angeschlossen. Bestehende öffentliche Release-Regeln schließen interne Canonical-Fundamentals aus; diese Regeln wurden nicht für einen ungesicherten neuen öffentlichen Filing-Feed geöffnet.

Der Parser verwendet gepinntes Arelle, verarbeitet XBRL/iXBRL, Transformationsformate, Sign/Scale, Einheiten und Taxonomy-Package-`catalog.xml`. Standardkonzepte nutzen die vorhandene SEC MetricRegistry. Issuer-Extensions erfordern nachgewiesene semantische Gleichheit mit Label-, Presentation-, Calculation- und Review-Evidenz. Name-Ähnlichkeit oder bloßes Wider-/Narrower-Anchoring genügt nicht. Dimensionale Facts, ungeklärte Kontexte/Einheiten und widersprüchliche Facts werden nicht geraten oder gemittelt. Für die allgemeine ESEF-Compliance-Zertifizierung ersetzt dies keinen vollständigen ESMA-Conformance-Lauf.

Provenienz enthält Dokument-URL/-Hash, Manifest-/Normalisierungsversion, Entity, Concept, Context, Währung, Original-/Normalized-Wert, Zeitraum, Filing- und Abrufzeit sowie Mappingstatus. Idempotency umfasst Company, Dokument, Hash, Publication, Revision, Manifest und Methodikversion. Neue Revisionen überschreiben frühere Dokumente nicht.

Verfügbarkeit gilt ab belegtem Veröffentlichungszeitpunkt, niemals ab Periodenende. Fehlt die Uhrzeit, gilt konservativ Tagesende. Vorhandene tägliche US-PIT-Abfragen bleiben unverändert; neue präzise Timestamps werden zeitlich statt lexikographisch verglichen. FY, H1/H2 und 9M bleiben unterschiedliche Perioden; Annual Coverage impliziert keine Quartals-Coverage. Das französische OAM enthält Marktzeit-Sentinels wie Jahr 8887: diese werden ausdrücklich verworfen und nicht als PIT-Zeit benutzt.

## Sichere Betriebsbefehle

Aus dem Repository-Root:

```sh
# Bounded discovery, bestehende Listings anreichern; Cache und atomare Writes.
python3 scripts/universe/global_equities.py --limit=60
python3 scripts/universe/global_equities.py --offline
# Ein gezielter Refresh; fehlgeschlagene Quellen erhalten den vorherigen Stand.
python3 scripts/universe/global_equities.py --refresh --limit=60

# Offizieller französischer Discovery-Adapter, maximal 3 Seiten pro Aufruf.
python3 -m scripts.fundamentals.french_oam --isin=FR0000121014 --pages=1
# --offset und nextOffset ermöglichen einen kontrollierten weiteren Lauf.

python3 -m pip install -r scripts/fundamentals/requirements.txt
# Echter überprüfter LVMH-Manifest; lädt nur das offizielle Paket.
python3 scripts/fundamentals/official.py --manifest=quant/config/official-filings/lvmh-2024.json
# Für Wiederholung ohne Netzwerk:
python3 scripts/fundamentals/official.py --manifest=quant/config/official-filings/lvmh-2024.json --document=PATH_TO_CACHED_ZIP --offline

node scripts/universe/validate-global-equities.mjs --out=/tmp/global-quality.json
# Authentifizierte, read-only Probe über den bestehenden Adapter: maximal
# acht Requests, keine neuen Preisartefakte und keine Rohpreise im Report.
node scripts/universe/probe-global-tiingo.mjs --out=/tmp/global-tiingo-probe.json
# Frisches isoliertes Ausgabeverzeichnis wählen; kein Production-Cleanup.
node scripts/discover/build-discover-data.mjs --out=/tmp/vu-global-discover
# Kontrollierter Initial-Rollout: gleicher Kursstichtag, bestehende IDs;
# schützt alle nicht-globalen US-Detaildateien byteweise.
node scripts/universe/materialize-global-equities.mjs --discover-build=/tmp/vu-global-discover
node scripts/universe/materialize-global-equities.mjs --discover-build=/tmp/vu-global-discover --apply
node scripts/screener/build-universe.mjs --out=/tmp/vu-global-screener

node --test quant/tests/*.test.mjs
node --test discover/tests/*.test.mjs screener/tests/*.test.mjs supertrader/tests/*.test.mjs
python3 -m unittest discover -s scripts/quant/tests
python3 -m unittest discover -s scripts/fundamentals/tests
```

Die bestehenden Jobs bleiben die einzigen Preis-/SEC-/Logo-/Quant-Pipelines. Preis-Backfill nutzt `scripts/market/ingest-tiingo.mjs --initial --scope-from-preview --request-budget=20 --concurrency=1` und dessen vorhandenen Checkpoint, Cache, Backoff und Lizenzgates. Daily Incremental verwendet denselben Job ohne `--initial`; `--strict-incremental` bleibt wie bisher opt-in. Zuerst `--dry-run`; ohne konfigurierte Credentials keine Aussage über API-Erfolg. Keine automatische Erweiterung der freigegebenen Provider-Budgets oder Veröffentlichungsgates.

SEC: `python3 scripts/quant/cli.py ingest --limit 5 --run-id global-review` bzw. vorhandener `update --since YYYY-MM-DD`; Resume/Retry bleiben bestehen. Logos: vorhandener `scripts/discover/build-company-logos.mjs`, begrenzte Diagnose `--only=SAP,ASML,TSM --dry-run`. Das vorhandene Release-Paket baut den Screener automatisch aus den ausgelieferten Discover-Daten. Neue CI prüft die gesamte US-/Produkt-/SEC-Baseline sowie den Offline-Filing-Parser.

## Qualität und Troubleshooting

Identity-Gates: eindeutige Company-/Listing-/Security-IDs, exakter Ticker/Exchange/MIC-Abgleich, Equity-only, ISO-Währungen, belegte ADR-Ratio. Read-only Price-Gates: fehlende/negative/duplizierte/unsortierte Bars; extreme Sprünge sind **Review**, keine automatische Löschung. Stale-Reihen und die konkreten Valuation-Gründe sind im Diagnosebericht sichtbar. Coverage-Fehlbehauptungen gegenüber tatsächlichen Artefakten brechen den Check.

`REQUEST_BUDGET_REACHED`: mit Cache fortsetzen, kein unlimitierter Retry. `FileNotLoadable`/fehlende XBRL-Referenzen: Taxonomy-Package-Katalog und verfügbare offizielle Taxonomien prüfen; ohne geladenen DTS keine Zahlen. `NO_SAFE_MAPPINGS`: Source/Context/Mapping-Evidenz prüfen, keine Heuristik freischalten. `GLOBAL_*_MISMATCH`: Overlay nicht auf einen anderen gleichnamigen Ticker anwenden. `AMBIGUOUS_IDENTITY`: Listing-ID oder MIC angeben.

Provider-Verzeichnis-Rawdata und Original-Filing-Pakete bleiben im ignorierten Cache. Die französische Portal-Metadatenquelle verweist auf [Licence Ouverte](https://github.com/etalab/licence-ouverte/blob/master/LO.md); Quelle und Abruf werden mitgeführt. Daraus wird keine neue Tiingo-Display-Lizenz und keine Freigabe zur Veröffentlichung vollständiger Geschäftsberichte, PDFs oder enthaltenen Bildmaterials abgeleitet.

Der zusätzliche Provider-Probe-Workflow ist ausschließlich manuell oder durch eine ausdrückliche Commit-Marke auf einem Entwicklungsbranch aktiv. Er kann den vorhandenen GitHub-Secret nutzen, ohne ihn dieser Arbeitsumgebung offenzulegen; maximal acht Requests, kein Produktionsimport, keine Main-/Deployment-Schreibrechte. Ohne Secret meldet er `NOT_CONFIGURED`, niemals API-Erfolg.

## Kompakter Decision Log

1. Kein lokales Listing ohne tatsächlichen Provider-/Entitlement-/Identity-Nachweis. Kein Symbol-Suffix-Raten.
2. Existierende internationale US-Listings zuerst anreichern; Membership und US-Baseline nicht verändern.
3. SEC-CIK und offizieller LEI liefern Entity-Identität; Business Address und Domizil bleiben getrennt.
4. Keine ADR-Ratio aus Namen/Preis/Ordinary Share Count ableiten. Unbelegte Valuation fällt aus.
5. Offizielle ESEF-Pakete durch Arelle und vorhandene Registry normalisieren; unklare Konzepte bleiben fehlend.
6. UK und Schweiz besitzen getrennte Source-Systeme; kein fiktiver EU/ESEF-Autofeed.
7. Dateiweise atomare/idempotente Writes, bounded Discovery, unveränderte bestehende Backfills und Veröffentlichungsgates.
8. Gemeinsame Geografie/Coverage/Identity, Originalwährungen und echte PIT-Verfügbarkeit; kein eigenes Datenuniversum pro Produkt.
