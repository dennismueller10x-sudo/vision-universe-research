# EU-/UCITS-ETF: Datenlücken und Anforderungen an einen zweiten Anbieter

Stand: 05.10.2026. Grundlage: [ETF_EU_FREE_SOURCE_SCORECARD.md](ETF_EU_FREE_SOURCE_SCORECARD.md),
[ETF_DATA_RIGHTS.md](ETF_DATA_RIGHTS.md). Kein Anbieter wird hier ausgewählt – nur die
Felder, die nach Ausschöpfen der freien offiziellen Quellen fehlen.

## Lückenmatrix

| Feld | Freie offizielle Quelle | Abdeckung (UCITS-ETF-Anteilklassen) | Automatisierung | Anzeige | Lücke |
|---|---|---|---|---|---|
| Kurs (EOD OHLCV) | keine | 0 % | – | – | **ja** – Börsen-Websites nicht nutzbar, Xetra-PDS eingestellt, verzögerte Daten ohne Historie und nur ohne Kommerzialisierung |
| Bereinigte Kurse, Ausschüttungen, Splits | keine | 0 % | – | – | **ja** |
| ISIN | ESMA FIRDS | 100 % (Definition des Universums) | ja | ja, mit Quelle | nein |
| WKN | Deutsche Börse Instrumentenliste | Xetra-ETFs (siehe `xetra-refdata-stats.json`) | ja | **unklar** | **Freigabe nötig**; für nicht in Xetra gehandelte ETFs ohnehin Lücke |
| TER / laufende Kosten | Deutsche Börse Stammdatenblatt (Emittentenangabe) | Xetra-ETFs | ja | **unklar** | **Freigabe nötig**; KID/EMT nur beim Emittenten (nicht frei) |
| Fondsvolumen (AUM) | keine | 0 % | – | – | **ja** (Fonds- und Anteilklassenebene) |
| Holdings | keine | 0 % | – | – | **ja** – nur Emittenten (Lizenz) |
| UCITS-Status | ESMA-Fondsregister | Anteil mit eindeutiger Namenszuordnung (siehe Datenqualität) | ja | ja, mit Quelle | Rest: nur Hinweis aus dem Namen |
| Replikation | Deutsche Börse Stammdatenblatt | Xetra-ETFs | ja | **unklar** | **Freigabe nötig** |
| Ertragsverwendung | FIRDS (CFI-Attribut) · Deutsche Börse | CFI für alle mit Attribut | ja | ja (CFI) | gering |
| Index / Benchmark | Deutsche Börse Stammdatenblatt | Xetra-ETFs | ja | **unklar** | **Freigabe nötig** |
| NAV | keine | 0 % | – | – | **ja** |
| Tracking Difference | – | 0 % | – | – | **ja** – braucht Gesamtrendite des ETF **und** lizenzierte Indexstände |

## Anforderungen an Anbieter 2 (nur die verbleibenden Felder)

Pflicht, mit vertraglichem Recht zur **öffentlichen Anzeige auf einer Website** und zur
Ableitung eigener Kennzahlen (Rendite, Schwankung, Drawdown):

1. **EOD-Kurse (OHLCV)** für UCITS-ETF-Listings mindestens auf Xetra, Börse Frankfurt,
   Euronext (Paris, Amsterdam), London und SIX – mit Historie ab Auflage, in
   Handelswährung, mit Börsen- und Listing-Kennung (MIC, Ticker, ISIN).
2. **Corporate Actions**: Ausschüttungen (Ex-Tag, Betrag, Währung), Splits,
   Zusammenlegungen – für bereinigte Reihen und Gesamtrendite.
3. **NAV** je Anteilklasse, täglich, mit Historie.
4. **Fondsvolumen** je Fonds und je Anteilklasse, mit Stichtag und Währung.
5. **Holdings** je Fonds (vollständig oder Top-N mit Gewicht, ISIN, Land, Sektor,
   Anlageklasse), mit Stichtag – für Durchschau, Überschneidung und Änderungen.

Optional (falls die Deutsche Börse die Referenzdaten nicht freigibt):

6. **Laufende Kosten (TER/OGC)**, Replikation, Index, Ertragsverwendung, WKN.

Für **Tracking Difference** zusätzlich: Indexstände (Total Return) mit Lizenz des
jeweiligen Indexanbieters – oder die vom Emittenten veröffentlichte Tracking Difference
mit Weitergaberecht.

Abfragen beim späteren Vergleich: Abdeckung der genannten Börsen, Historientiefe,
bereinigt vs. roh, Lieferweg (Bulk-Dateien statt Einzelabfragen), Rate Limits,
**Display-/Redistribution-Lizenz für eine öffentliche Website**, Rechte an abgeleiteten
Daten, Quellenangabe.
