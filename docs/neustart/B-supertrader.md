# Strang B – Supertrader-Backtest (Abschluss 05.11.2026)

Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Produktdokument: [SUPERTRADER_9_HANDOVER.md](../SUPERTRADER_9_HANDOVER.md) §0.1.
Alle Backtest-Ergebnisse sind **Forschung, nicht zertifiziert**. Keine öffentlichen Renditeaussagen ohne Owner.
Strang B ist abgeschlossen (Owner-Entscheidung 05.11.2026). Neue Forschung gibt es nur mit neuem Auftrag.

## Was automatisch läuft

| Workflow | Zeitplan (UTC) | Was er tut | Woran man einen Fehler erkennt |
|---|---|---|---|
| `supertrader-signals.yml` | Di–Sa 06:17 | Nachtlauf der Signale. Den privaten Zustand holt und sichert er mit `scripts/supertrader/private-state.mjs`. Öffentlich schreibt er nur die Sicht ohne Kurse und ohne heutige Bestände (L2/L3). Danach stößt er den Kandidatenlauf an. | roter Lauf; `pipeline-alarm` |
| `supertrader-sf8-candidates.yml` | Di–Sa 11:43 und nach dem Signallauf | Research-Kandidaten (SF8), automatisch veröffentlicht, solange der Vertrag C1–C7 erfüllt ist (`SF8_AUTO_PUBLISH=true` seit 05.11.). Öffentlich ohne Plan und ohne Order- oder Stoppmarke; DQ-SF8-4 prüft das ab Stand 05.11. auf allen Stufen. | roter Lauf; Alarm-Issue; `BLOCKED` im Schritt-Bericht |
| `supertrader-house-live.yml` | Di–Sa 01:30, am 25. 03:15 (SEC) | Hausstrategie HS4-V03: Monatsentscheidung am letzten Handelstag. Der volle Ledger liegt privat; öffentlich stehen nur Zahl der Titel und Fingerabdruck, Bestände erst nach 365 Tagen. | roter Lauf; Abweichung privat/öffentlich bricht ab |
| `supertrader-paper-2027.yml` | Di–Sa 02:37 und 09:41 | Papierhandel SF6-PAPER-2027: Bis 31.12.2026 tut er nichts, ab 04.01.2027 zeichnet er auf. | roter Lauf |
| `supertrader-live-smoke.yml` | Mo–Fr 13:43 | Rauchtest der ausgelieferten Seiten | roter Lauf |

Manuell, nur bei Bedarf: `supertrader-st-hist-top5.yml` (historische Forschung, nur versiegelt, Holdout gesperrt), `supertrader-house.yml`, `supertrader-validation.yml`, `supertrader-research-snapshot.yml`.

## Was zu beobachten ist und welche Fristen gelten

- **Erste Läufe nach der Umstellung:**
  - **Kandidaten:** Der nächste automatische Kandidatenlauf veröffentlicht Stand 05.11. ohne Pläne. Danach muss DQ-SF8-4 in der Core-CI grün sein.
  - **Signale:** Der erste Signallauf nach #1479 übernimmt die Strategie-Ledger einmalig in die private Ablage (`private-state pull: MIGRATED_FROM_REPOSITORY`). Ab dem zweiten Lauf steht dort `PRIVATE`.
- **Dezember 2026, vor dem 04.01.2027:**
  - F1–F3 (Forward-Namensraum des Papierhandels befüllen).
  - Ein Core-PR stellt den Registry-Eintrag `supertrader-paper-2027-log` auf `ACTIVATING` (mit JSONL-Leser).
  - Ohne beides zeichnet der Papierhandel ab dem 04.01. auf, ohne dass Core die Daten kennt.
- **Security Master:**
  - Die SF8-Eingangsprüfung meldet den Stamm nach 60 Tagen als STALE (`AUX_MAX_AGE_DAYS.master`).
  - Stand 1.3.0 ist vom 05.11.2026; ohne Auffrischung durch Strang A ist er ab etwa 04.01.2027 veraltet.
  - Dann bricht der Kandidatenlauf mit Exit 3 ab, und der veröffentlichte Stand bleibt stehen.
- **Hausstrategie:** Die nächste Monatsentscheidung fällt am 30.11.2026. Sie liest den privaten Ledger.
- **Rot auf `main`, nicht durch Strang B verursacht:** die Quant-2.0-Regression und der vu3-Kontrastfehler auf `/supertrader/stock/NVDA/` (Redesign).

## Ergebnisse und wo sie liegen

- **V1 = Top 5** (C01, C02, C03, C08, C12):
  - Die Lesarten sind entschieden (#1327).
  - C04–C13 stehen im Produkt als „in Forschung“.
- **Historischer Backtest der Top 5** (DEV 2016–2026, DQ-K5-Quarantäne, vier Kostenstufen, SPY-Vergleich, Delisting-Neuläufe, V13-Studie):
  - Läufe 41984749745 und Folgeläufe.
  - Die Ergebnisse liegen nur versiegelt im Lauf-Artefakt und privat beim Owner.
  - Keine Methode liegt über SPY.
- **Historischer Backtest der übrigen 8 Methoden** (Strang H, Lauf 42170095105, gleiche Regeln, C09 auf IEX ab 2017, C10 als Short-Trade-Studie): versiegelt, keine Methode über SPY; Lesarten in SUPERTRADER_9_HANDOVER §0.1. Im Katalog tragen jetzt alle 13 Methoden den Status „getestet“ (Forschung, nicht zertifiziert).
- **Treueprüfungen:**
  - **C08 Kullamägi:** Bericht `docs/research/supertrader/C08-TREUE.md`, Diagnose der 16 belegten Trades. FID-4 ist vorregistriert (`certification/C08-FID4-PREREGISTRATION.json`) und hat die Regel auf DEV nicht erfüllt. Ergebnis: „Erkennung je Trade, Portfolio nicht bestätigt“.
  - **C06/C07 Minervini:** Referenz und 13 belegte Trades (#1447). FID-1 ist vorregistriert (`certification/C06-C07-FID1-PREREGISTRATION.json`) und hat die Regel auf DEV bei keiner der beiden Methoden erfüllt. Ergebnis: „Erkennung gemessen, Portfolio nicht bestätigt“.
  - **Holdout:** Der Holdout 2008–2015 ist verbraucht (Strang H, 06.11.2026, Läufe 42184335142 und 42184359288). Die Ergebnisse liegen versiegelt vor, keiner der 12 vorregistrierten Kandidaten schlägt SPY; Details in `docs/research/holdout/ERGEBNIS-2008-2015.md`.
- **Weitere Lieferungen:**
  - Plausibilitätsprüfung (#1408): Darvas hängt an der Annahme über die Reihenfolge innerhalb eines Balkens.
  - E3-Export für Strang C (#1395).
  - Screener-Kriterien Z5 (#1389).
- **Papierhandel SF6-PAPER-2027:** eingeschaltet (#1354), Protokoll 1.2.0 festgeschrieben (#1270).
- **Keine Empfehlungen (L2/L3, 05.11.):**
  - SF8-Ansichten ohne Plan (#1451) und DQ-SF8-4 auf allen Stufen (#1480).
  - Signaldateien ohne Kurse; Musterdepots privat, öffentlich erst nach 365 Tagen (#1479).
  - Hausstrategie ohne heutigen Bestand (#1452).
  - Die Oberfläche hat D2 umgestellt (#1446, #1473).
- **Private Ergebnisse:** liegen beim Owner, versiegelt mit `scripts/supertrader/validation/results-public-key.pem`; zum Lesen braucht es den privaten Schlüssel des Owners.

## Offen (nicht mehr Strang B)

- Dezember: F1–F3 und Registry `ACTIVATING`, siehe oben.
- Den Security Master vor Anfang Januar auffrischen (Strang A).
- Gate A ist durch Vertragstests ersetzt und nur noch ein Bericht (`core/registry/product-contracts.json`).
- C09-Entwürfe #1262 und #1263 ruhen, weil C09 in Forschung ist.
- Die alten öffentlichen Fassungen mit Beständen bleiben in der Git-Historie. Sie zu entfernen wäre endgültiges Löschen und braucht die Owner-Freigabe.

## Braucht Owner
- Öffentliche Darstellung von Backtest-Renditen: nur mit Freigabe.
- FP-ST-01 ruht (Owner, 05.11.): keine Anfragen an Anbieter. FP-ST-05: kein Buchkauf. Die Tabelle unten bleibt als Vergleich.

## FP-ST-01: Lizenzangebote für Kapitalmaßnahmen-Daten (Vergleich, nichts gekauft)

Stand 04.11.2026, Grundlage E7-1 (`SUPERTRADER_7_OWNER_DECISIONS_E7.md`) und eine Nachrecherche vom 04.11. Kommerzielle Preise veröffentlicht keiner der Anbieter; sie sind schriftlich anzufragen. Ein Kauf ist eine Ausgabe und braucht die Owner-Freigabe. Abnahme vor jedem Kauf (E1): mindestens 90 % Event-Treffer, 95 % exakte Ratio, 0 Falsch-Positive und 85 % Abdeckung 2008–2017 gegen die EDGAR-Labels der 83 Sitzungen.

| Anbieter | Splits / Faktoren | delistete Titel | Firmenlizenz | Preis (öffentlich) | Eignung für die 83 Fälle |
|---|---|---|---|---|---|
| Sharadar Core US Equities (Nasdaq Data Link) | ACTIONS ab 1998, `closeunadj` | ja, ca. 21.000 Ticker | nur über Nasdaq-Vertrieb | privat ab 299–499 USD/Jahr; kommerziell auf Anfrage | hoch, **erste Anfrage** |
| Massive (vormals Polygon) | eigener Endpunkt Splits/Dividenden seit 02/2026, Forward und Reverse getrennt | Referenzdaten ab 2003, Splits delisteter Titel unklar | Business-Plan auf Anfrage | Einzelnutzer ab 99 USD/Monat je Datensatz; Business auf Anfrage | mittel bis hoch, zweite Anfrage |
| CRSP (Morningstar) | täglich ab 1925, Faktor `FACPR` | Kern des Produkts | eigener kommerzieller Vertrag | nicht veröffentlicht, teuer | sehr hoch, nur wenn A und B scheitern |
| EODHD | Splits delisteter Titel nur bei Delisting nach 2018 | teilweise | kommerziell auf Anfrage | privat ab 199 USD/Jahr | gering für 2008–2017 |
| Databento | ab 05/2018 | ja | nicht veröffentlicht | ab ca. 299 USD/Monat | gering für 2008–2017 |
| Norgate | ab 1990 | ja | nur Privatpersonen | 630 USD/Jahr | lizenzrechtlich ungeeignet |
| Tiingo (bestehend) | Splits-Endpunkt (Beta, HTTP 403) | – | „internal commercial“ ohne Anzeige | 499 USD/Jahr | gering, keine unabhängige Prüfung |

Empfehlung: Anfragen ohne Kauf an Sharadar (Nasdaq) und Massive, jeweils mit Musterauszug der 83 Sitzungen und Frage nach dem Recht, abgeleitete Kennzahlen zu veröffentlichen. Quellen: [Nasdaq Data Link Preise](https://help.data.nasdaq.com/article/568-how-much-does-nasdaq-data-link-data-cost-how-do-i-find-pricing), [Massive Splits/Dividenden](https://massive.com/blog/new-splits-and-dividends-endpoints), [EODHD delistete Titel](https://eodhd.com/financial-academy/financial-faq/historical-stock-prices-for-delisted-companies).
