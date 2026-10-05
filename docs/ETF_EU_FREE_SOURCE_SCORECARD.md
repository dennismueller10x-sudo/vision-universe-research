# EU-/UCITS-ETF: freie und offizielle Quellen – Scorecard

Stand: 05.10.2026. Faktische Abdeckung, kein Ranking. Status-Werte siehe
[ETF_DATA_RIGHTS.md](ETF_DATA_RIGHTS.md). Zahlen aus den CI-Läufen
(`vorsorge/data/sources/etf-eu-source-probe.json`, `xetra-refdata-stats.json`,
`vorsorge/data/eu/*.json`).

| Quelle | Felder | kostenlos | offiziell | strukturiert | Automatisierung | Kommerziell | Anzeige | Historie | Aktualisierung | Aufwand | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ESMA FIRDS (FULINS_C) | ISIN, Name, CFI (inkl. Ertragsverwendung), Währung, Emittenten-LEI, Handelsplätze, erster Handelstag | ja | ja (Regulierung) | XML | ja (Solr-Dateiliste) | ja | ja, mit Quellenangabe | Vollversion wöchentlich | wöchentlich | gering | **integriert** |
| GLEIF | Rechtlicher Name, Rechtsordnung (Domizil), Kategorie FUND | ja | ja | JSON-API | ja | ja (CC0) | ja | – | täglich | gering | **integriert** |
| ESMA-Fondsregister (Cross-border distribution, Solr `esma_registers_funds_cbdif`) | Rechtsrahmen UCITS/AIF, Fondsname, Verwaltungsgesellschaft, Herkunftsstaat, Aufsicht, Status, Vertriebsländer | ja | ja | JSON (Solr) | ja | ja | ja, mit Quellenangabe | Notifizierungsdaten | laufend | mittel (keine ISIN → Namenszuordnung) | **integriert (neu)** |
| ESMA FITRS (Transparenz) | Liquidität, Umsatz je ISIN (FULECR/FULNCR) | ja | ja | XML | ja | ja | ja, mit Quellenangabe | – | wöchentlich | gering | geprüft, nicht benötigt (kein Fondsstammdatum) |
| Deutsche Börse Xetra „All tradable instruments“ (CSV) | ISIN, **WKN**, Mnemonic, Instrumenttyp, Produktgruppe | ja | ja (Börse) | CSV | technisch ja | **unklar** | **unklar** | Tagesstand | täglich | gering | Pipeline fertig, **Rechte UNKNOWN – nicht veröffentlicht** |
| Deutsche Börse ETF/ETP-Stammdatenblatt (XLSX) | **laufende Kosten**, Replikation, Ertragsverwendung, Index, Fondswährung, Produktfamilie | ja | ja (Börse; Werte vom Emittenten gemeldet) | XLSX | technisch ja | **unklar** | **unklar** | Stichtag | monatlich/laufend | gering | Pipeline fertig, **Rechte UNKNOWN – nicht veröffentlicht** |
| BaFin Investmentfonds-Datenbank | ISIN, EU-OGAW, Vertriebszulassung DE | ja | ja | Webexport | aus GitHub Actions nicht erreichbar | ja | ja, mit Quellenangabe | – | laufend | mittel | nicht integriert (technisch) |
| Central Bank of Ireland – UCITS-Register | Umbrella/Teilfonds-Namen (PDF) | ja | ja | PDF, ohne ISIN | ja | ja | ja | – | monatlich | hoch | nicht integriert (redundant zum ESMA-Register) |
| CSSF Kennungslisten | Fonds/Teilfonds/Anteilklassen-Codes | ja | ja | ZIP | ja | **nein** | **nein** ohne Zustimmung | – | laufend | – | nicht integriert |
| EZB-Referenzkurse | Devisenkurse | ja | ja | SDMX/CSV | ja | ja | ja, unverändert mit Quelle | seit 1999 | täglich | gering | geprüft (für EU-Preise erst nach Preisquelle nötig) |
| ESEF | – | – | – | – | – | – | – | – | – | – | nicht anwendbar (offene Fonds fallen nicht unter die Transparenzrichtlinie) |
| ESAP (EU Single Access Point) | KID u. a. | ja | ja | – | – | – | – | – | – | – | noch nicht verfügbar (PRIIPs-KID ab 2028) |
| Emittenten (17) | Holdings, Kosten, KID, EMT/EPT | ja (Download) | ja | CSV/XLSX/PDF | **nein** | **nein** | **nein** ohne Zustimmung | – | täglich | – | nur manueller Import-Parser |
| Börsen-Websites (Euronext, SIX, LSE, Borsa Italiana, Tradegate, gettex, Stuttgart) | Kurse, Listen | ja | ja | teils | **nein** | **nein** | **nein** | – | – | – | nicht nutzbar |
| Xetra Public Data Set | 1-Min.-OHLCV | – | ja | CSV | eingestellt | nein (NC) | nein | ab 2017 | – | – | nicht nutzbar |
| Indexanbieter | Indexstände | teils | ja | Web | – | nein | nein (keine Ableitung) | – | – | – | nicht nutzbar → keine Tracking Difference |
| Tiingo | – | – | – | – | – | – | – | – | – | – | führt **keine** europäischen Börsen (geprüft über die Tickerliste) |

## Abdeckung (Lauf 37310881992, 05.10.2026)

| Kennzahl | Wert |
|---|---|
| ETF-Anteilklassen an EU-Handelsplätzen (FIRDS) | 8.084 (113.137 Handelsplatz-Datensätze) |
| Domizil aus Fonds-LEI (GLEIF) / aus ISIN-Präfix / unbekannt | 7.821 / 258 / 5 |
| Domizil IE / LU / DE / FR | 3.296 / 1.279 / 138 / 130 |
| amtlicher UCITS-Status (ESMA-Register, Namenszuordnung) | 3.144 Anteilklassen (22.173 UCITS-Fonds im Register) |
| davon Vertrieb in Deutschland gemeldet | 2.542 |
| Xetra-ETFs mit WKN / laufenden Kosten / Replikation (nicht veröffentlicht) | 3.013 / 3.008 / 2.491 |
| laufende Kosten (Xetra, nur Statistik) | Median 0,23 %, P10 0,09 %, P90 0,53 %, Max 3,5 % |

## Ergebnis

- **Frei, offiziell und veröffentlichbar** sind für UCITS-ETFs: Identität und Listings
  (FIRDS), Emittent und Domizil (GLEIF), amtlicher UCITS-Status, Verwaltungsgesellschaft
  und Vertriebsländer (ESMA-Fondsregister).
- **Gefunden, aber rechtlich offen**: WKN, laufende Kosten, Replikation,
  Ertragsverwendung, Index (Deutsche Börse). Die Pipeline ist fertig, die Werte werden
  ohne schriftliche Freigabe nicht gezeigt.
- **Nicht frei verfügbar**: Kurse/Historie, NAV, Fondsvolumen je Anteilklasse,
  Holdings, Indexstände (Tracking Difference).
