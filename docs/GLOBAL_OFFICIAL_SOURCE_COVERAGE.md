# Official European filing source audit

2026-10-01. Zugangstests sind konkrete HTTP-Befunde dieser Umgebung, keine Garantie der regulatorischen oder historischen Coverage. Eine erreichbare HTML-Seite ist kein implementierter Datenfeed.

| Land | Offizielle Quelle / Einstieg | Befund und Implementierungsstand |
| --- | --- | --- |
| DE | [Unternehmensregister](https://www.unternehmensregister.de/) | 200; ESEF-Publikationen über nationales Register. Kein automatisierter Bulk-Downloader oder garantierter Interim-XBRL-Feed implementiert. |
| FR | [DILA / Info Financière](https://www.info-financiere.gouv.fr/) | 200; öffentliche Explore-v2.1-API tatsächlich abgefragt. Bounded ISIN-Discovery und normalisiertes LVMH-ESEF-Paket funktionieren. |
| NL | [AFM Financial Reporting Register](https://www.afm.nl/en/sector/registers/meldingenregisters/financiele-verslaggeving) | 200; Register untersucht, Download-/PIT-Adapter noch nicht angeschlossen. |
| BE | [FSMA STORI](https://stori.fsma.be/) | 503 im Probe-Lauf. Keine Umgehung oder behauptete funktionierende Integration. |
| ES | [CNMV](https://www.cnmv.es/portal/Consultas/EEE/InformacionESEF.aspx) | 403 im Probe-Lauf; keine Umgehung. Strukturierter Source-Adapter noch nicht angeschlossen. |
| IT | [eMarket STORAGE](https://www.emarketstorage.it/) | 200; möglicher nationaler OAM-Weg untersucht. Issuer/OAM-Zuordnung und maschinelle Feed-Coverage nicht als garantiert deklariert. |
| AT | [OeKB OAM](https://www.oekb.at/en/capital-market-services/notifications-and-filing-documents/notifications-of-listed-issuers-oam.html), [IssuerInfo](https://issuerinfo.oekb.at/) | OeKB-Einstieg 200; IssuerInfo 200 mit Redirect zum aktuellen OAM-Listing. Kein Autofeed implementiert. |
| SE | [Finansinspektionen Exchange Information](https://www.fi.se/en/our-registers/stock-exchange-information/) | 200; ESEF-/OAM-Adapter noch nicht angeschlossen. |
| DK | [Finanstilsynet OAM](https://oam.finanstilsynet.dk/) | 200, App-Shell; kein geprüfter Dokument-/PIT-API-Vertrag. |
| NO | [NewsWeb](https://newsweb.oslobors.no/) | 200, App-Shell; EWR-Quelle separat zu prüfen. Keine Quartals-XBRL-Coverage behauptet. |
| FI | [FIN-FSA issuer reporting](https://www.finanssivalvonta.fi/en/financial-market-participants/capital-markets/issuers-and-investors/) | 200; Regulator- und Issuer-Quellen sind noch zu konkretisieren. |
| GB | [FCA National Storage Mechanism](https://www.fca.org.uk/markets/primary-markets/regulatory-disclosures/national-storage-mechanism) | 200; eigene UK-Strukturierungs-/Taxonomiepolitik erforderlich. `UK_OFFICIAL` ist ein getrennter Ingestion-Typ, kein fertig angeschlossener FCA-Autofeed. |
| CH | [SIX Exchange Regulation](https://www.ser-ag.com/en/home.html) | 200; ältere Financial-Reporting-Deep-Links lieferten 404. `SWISS_OFFICIAL` bleibt getrennt; kein allgemeines ESEF-/iXBRL-Mandat oder funktionierender Autofeed unterstellt. |

## ESEF und IFRS

[ESMA Electronic Reporting](https://www.esma.europa.eu/issuer-disclosure/electronic-reporting) antwortete 200. Die offizielle [Conformance Suite 2025](https://www.esma.europa.eu/sites/default/files/2026-04/esef_conformance_suite_2025.zip) wurde tatsächlich heruntergeladen (2.132.841 Bytes); daraus wird **keine vollständige Conformance-Zertifizierung** abgeleitet. Der verwendete LVMH-Report enthält eine ESEF-2022-Taxonomie-Referenz und eine Issuer Extension; Jahreszahlen des Reports und der Taxonomie sind also ausdrücklich unterschiedlich.

Der echte Datenweg:

`französisches OAM → explizit überprüfter Manifest mit LEI/ISIN, Dokument, Veröffentlichung und Fiskalperioden → Original-ZIP im privaten Cache → Arelle inklusive catalog.xml/DTS/iXBRL → bestehende Concept Registry → Canonical FundamentalFact → bestehender FundamentalDataProvider-Vertrag`.

Der reale OAM-Datensatz `flux-amf-new-prod` enthält Identifier, Dokument-URL, AMF-Deposit- und Marktzeiten. ISIN `FR0000121014` liefert vier strukturierte LVMH-Pakete; der implementierte Adapter holt maximal drei Seiten mit je höchstens 100 Records und unterstützt Offset/Cache. Er produziert **Kandidaten**, keine ungeprüften Company-Merges oder automatisch angenommene Fiskalperioden. Sein tatsächlicher erster Lauf verbrauchte eine Anfrage und lieferte vier Kandidaten.

Die offiziellen OAM-Marktzeiten enthalten teilweise das Jahr 8887 als Sentinel. Die Discovery verwirft diese Zeit. Beim geprüften Manifest wird die vorhandene AMF-Deposit-Date 2025-03-25 konservativ zum Tagesende verwendet, ohne eine exakte frühere öffentliche Uhrzeit zu erfinden.

Die ersten echten Fakten decken Umsatz, EPS basic/diluted, Operating Cash Flow, Cash und Total Assets ab, für FY 2023 und FY 2024 in EUR. Die vier widersprüchlichen Kandidaten für Net Income/Equity bleiben fehlend. Das ist **keine vollständige LVMH-Fundamental-Coverage** und keine simulierte Unterstützung sämtlicher europäischen Unternehmen.

## Annual versus Interim

EU/EWR ESEF betrifft insbesondere jährliche konsolidierte IFRS-Berichte. Offizielle Halbjahres-/Quartalsberichte sind nicht automatisch iXBRL; der französische Datensatz enthält beispielsweise PDF-Interimsberichte. Diese werden nicht als Financial Source geparst. H1/H2/9M können kanonisch gespeichert werden, wenn ein verifizierter strukturierter Bericht sie tatsächlich liefert. Annual-only bleibt Annual-only; es gibt keine erfundenen Q1/Q3-, TTM-, Revisions- oder Analyst-Daten.

UK und Schweiz teilen keine automatisch identische ESEF-Quelle mit EU/EWR. Der gemeinsame Parser ist nutzbar, wenn dort ein tatsächliches offizielles strukturiertes Dokument mit validem Manifest vorliegt. Weitere Länder werden als zusätzliche Discovery-Adapter angebunden; Produkte benötigen dafür keine Taxonomy-Tags oder Provider-Abfragen.
