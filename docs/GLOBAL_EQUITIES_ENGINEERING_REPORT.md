# Global Equities — Engineering Report

## 1. Result

Additiver globaler Identity-/Coverage-Layer, Originalwährungsbehandlung, Listing-Kollisionsschutz, ID-basierte Discover-Watchlists, gemeinsame Geografie, Valuation-Safety-Gates und offizielle ESEF-Ingestion implementiert. 39 vorhandene internationale US-Listings zentral angereichert, 40 Company-Identitäten einschließlich einer echten zusätzlichen LVMH-Filing-Entity. Die vollständige Aktivierung lokaler Deutschland-/Europa-/Asien-Listings ist nicht abgeschlossen.

## 2. Global Universe

Deutschland: SAP und BNTX über ihre bestehenden US-Listings. Insgesamt 23 europäische Unternehmen und 16 Global-Select-Unternehmen, 19 Unternehmensländer, weiterhin US-Handelsplätze und USD-Trading. Unter anderem ASML, NVO, NVS, AZN, TSM, BABA, XPEV, SONY, TM und indische/brasilianische internationale Unternehmen. Keine neue ETF-Unterstützung; bestehende Nicht-Equity-Baseline unangetastet.

## 3. Tiingo Coverage

Offizielles Supported-Tickers-Verzeichnis real geladen und gehasht: 108.908 Einträge. Keine lokale EUR-/CHF-/GBP-/Nordics-/Japan-/Korea-/Taiwan-/Indien-Coverage im geprüften Verzeichnis nachgewiesen; elf USD-LSE-Stock-Einträge belegen keine allgemeine London-Coverage. Intraday, Live und Account-Entitlement werden daraus nicht abgeleitet. Eine zusätzliche begrenzte credentialed Probe ist als read-only Betriebsjob vorhanden; lokale Ausführung meldete korrekt `NOT_CONFIGURED`. Neue lokale Symbolkonventionen wurden nicht erfunden.

## 4. Fundamentals

- **SEC: WORKING.** Bestehende Pipeline und US-Daten unverändert; 33 der 39 angereicherten Listings mit Annual Coverage. Reale Companyfacts-Validierung für SAP, TSM, BABA, XPEV: Jahresumsatz, Währung, Periodenende, Filing-Date und Accession stimmten exakt mit dem gespeicherten Wert überein.
- **Europe / ESEF: PARTIAL.** Frankreich-OAM-Discovery, echtes Taxonomy-Package-/iXBRL-Parsing, Canonical Facts und FundamentalDataProvider funktionieren. LVMH: zwölf EUR-Facts für FY 2023/2024. Andere nationale Discovery-Feeds und breite automatische Company-/Listing-Zuordnung sind nicht fertig angeschlossen.
- **UK / Switzerland: PARTIAL.** Getrennte Source-Systeme und Jurisdiktionsprüfungen; Research vorhanden, keine behaupteten produktiven Autofeeds.
- **Global ADRs: PARTIAL.** SEC und Kurshistorien der vorhandenen US-Listings nutzbar. Unbelegte ADR-/Share-/EPS-Basis bleibt fehlend; Ratio allein berechtigt nicht zur Mischung von ADR-Preis und Ordinary Share Count.

## 5. Product Integration

Status bezieht sich auf die angereicherten bestehenden US-Listings; lokale Primary Listings bleiben ohne belegte Provider-Coverage gesperrt.

| Produkt / Komponente | Status | Konkreter Stand |
| --- | --- | --- |
| Central Master / identity APIs | WORKING | Company-/Listing-ID, Country/Region, Originalwährungen, Coverage und Kollisionsschutz. |
| Discover | WORKING | Persistierte globale Metadaten, Länder-/Regionssuche, bestehende Technik/Fundamentals; unsichere Valuation zurückgehalten. |
| Screener | PARTIAL | 5.399 echte Titel im Release-Build; Company-Country, Region, Exchange-/Currency-Filter, Wachstum/Margen/Technik. Fremdwährungs-Monetary-Spalten behalten ihre USD-Safety-Gates. |
| Quant / Factor DNA | PARTIAL | Gemeinsamer Universe-Zugang und Valuation-Gates; bestehende Missing-Data-/Publication-Gates und Score-Methodik erhalten. Keine erfundenen globalen Composite Scores. |
| Rankings | PARTIAL | Bestehende US-Rankings erhalten; keine neue internationale Ranking-/Backtest-Publication ohne ausreichende Datenbasis. |
| SuperTrader / Technical Analysis | PARTIAL | Bestehende US-Listing-Historien und technische Verbraucher erhalten; lokale Sessions/Realtime nicht aktiviert. |
| Markets / Market Intelligence | PARTIAL | Zentrale geografische Identität verfügbar; US-Market-Regime unverändert, keine behauptete neue lokale Breadth-Coverage. |
| Search | WORKING | Name/Ticker weiterhin; globale Geografie in Indexen, Listing-Kontext/IDs in zentraler Identität, exakte US-Ticker geschützt. |
| Watchlists | WORKING | Neue Discover-Einträge mit Listing-ID; bestehende Tickerlisten bleiben lesbar. Quant-ID-Storage erhalten. |
| Charts | WORKING | Bestehende echte Historien der US-Listings; Originalwährungsbehandlung und Fail-closed bei unbekanntem Exchange. Keine lokale Live-Abdeckung behauptet. |
| Research / Fundamental Analysis | PARTIAL | SEC-Consumer erhalten; zusätzliche offizielle Company-Facts persistiert und über denselben Provider-Vertrag abrufbar, noch kein breiter neuer öffentlicher European Serving Feed. |
| Logos / assets | WORKING | Vorhandene zentrale Pipeline, URLs und Fallbacks wiederverwendet; kanonische zusätzliche Company-Asset-Identität. |
| Intraday / live international local | BLOCKED | Keine nachgewiesene lokale Provider-/Entitlement-Coverage; US-IEX nicht auf lokale Börsen übertragen. |
| News / analyst revisions | PARTIAL | Bestehende CIK-/Company-Zuordnung erhalten; keine neue lizenzierte internationale Estimates-/Revisionsquelle vorhanden. |

## 6. Data Quality

Identity-/Duplicate-/Equity-/Currency-Gates; geprüfte Listing-Zuordnung; ADR-Ratio und getrennte Share-/EPS-Basis; PIT nach Veröffentlichung; XBRL-Units/Contexts/Dimensions/Conflicts; Pfad-/Checksum-Gates; read-only Price-/Freshness-Diagnose. 39 Listings geprüft, null Fehler, 39 ausgewiesene Valuation-/Share-Basis-Warnungen. Keine automatische Datenlöschung aufgrund von Heuristiken.

## 7. Tests

Untouched Baseline: Quant 2.054; SEC 484; Produkte 333 bestanden, fünf bestehende Skips. Nach Implementierung: Quant 2.066, Produkte 333, SEC 484 und sieben neue Python-Filing-/OAM-Tests bestanden; keine Failures. Zusätzliche gezielte Identity-/ADR-/Screener-Checks grün. Master-Verifikation: 683 bestanden, null Befunde. Gemeinsamer FX-Regression-Guard grün. Vorhandener Release-Build: PASS, Screener mit 5.399 Titeln. Isolierter vollständiger Discover-Build: 5.992 reale Details. Discovery/Initial-Rollout/Filing-Ingestion idempotent überprüft. Reale Quellen: Tiingo-Verzeichnis, vier SEC-Companyfacts und echtes LVMH-ESEF-Paket.

## 8. Regressions

Alle nicht angereicherten Stock-Detaildateien byteweise unverändert; keine Änderungen vorhandener Kurs-/SEC-Artefakte oder US-Membership. Zusätzliche globale Felder und Safety-Reasons sind additiv. Tägliche US-PIT-Semantik und bestehende Route-Namespaces erhalten. Keine Schema-Migration, kein UI-Redesign, keine neue Quant-Methodik, kein Production-Deployment.

## 9. Blockers

Lokale Market-Data-/Entitlement-Coverage ist beim bestehenden Provider nicht belegt; lokale Fallback-Credentials fehlen. Diese Arbeitsumgebung besitzt keinen Tiingo-Key; der vorhandene GitHub-Secret kann nur im kontrollierten read-only Probe-Job geprüft werden. Einzelne nationale Quellen antworteten hier 403/503. Dies blockiert keine bereits implementierte SEC-/ESEF-/Identity-Arbeit.

## 10. Next Actions

1. Credentialed Probe auswerten und geeigneten bereits erlaubten Provider für tatsächliche lokale Listings nachweisen; dann die noch tickerbasierten Materializer mit realen Listing-Kollisionen validieren.
2. Belegte ADR-/Share-/EPS-Ratios und deren historische Changes ergänzen; foreign Monetary-Serving über die vorhandene Currency-Infrastruktur vervollständigen.
3. Weitere offizielle nationale Filing-Discovery-Adapter und European Serving-Projektionen ergänzen; Annual/Interim-Coverage getrennt führen.

Details: [Architecture audit](GLOBAL_EQUITIES_ARCHITECTURE_AUDIT.md), [operations / decisions](GLOBAL_EQUITIES_OPERATIONS.md), [official source coverage](GLOBAL_OFFICIAL_SOURCE_COVERAGE.md).
