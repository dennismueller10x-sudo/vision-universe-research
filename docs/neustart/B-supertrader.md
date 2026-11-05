# Strang B – Supertrader-Backtest (Stand 05.11.2026, nachmittags)

Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Produktdokument: [SUPERTRADER_9_HANDOVER.md](../SUPERTRADER_9_HANDOVER.md) §0.1.
Alle Backtest-Ergebnisse sind **Forschung, nicht zertifiziert**. Keine öffentlichen Renditeaussagen ohne Owner.

## Fertig
- V1 = Top 5 (C01, C02, C03, C08, C12). Lesarten PS-C01, PS-C03, PS-C08, PS-C12, FP-ST-03 und FP-ST-05 sind entschieden (#1327). Die übrigen acht Methoden stehen im Produkt als „in Forschung“.
- **Erster historischer Backtest der Top 5** (#1328, Lauf 41869479235):
  - Rahmen: DEV-Snapshot 2016-01-04 bis 2026-09-30, DQ-K5-Quarantäne (die 83 ungeklärten Kapitalmaßnahmen sind ausgeschlossen, E1), vier Kostenstufen, SPY-Vergleich, Universum B mit 229 V13-Delisting-Ketten.
  - Je Methode gerechnet: Trades, Trefferquote, Rendite, maximaler Verlust, Abstand zu SPY und Kosten.
  - Das Ergebnis liegt intern beim Owner (verschlüsselt im Lauf-Artefakt).
- V13-Studie (A gegen A+V13, Top 5): 41880752043 grün. Audit bestanden, Wiederholungsprüfung mit gleichem Hash. Davor endete 41861419543 mit Exit 4, Klärung in #1334: Ein Kauf am letzten Handelstag wird gezählt, ist aber kein Verstoß.
- Kandidaten-Tageslauf frisch: Stand 04.11. (Lauf A 42031553316, Lauf B 42033163619, Commit `1ba58b94`). Lauf A war zunächst am Datenbudget rot (42027770857): Mit Security Master 1.3.0 verdoppeln sich die Kandidaten (3.133 → 6.057, 22,1 MB öffentlich). Das Budget wurde deshalb auf 32 MB bzw. 4 MB je Datei angehoben (#1425 Core DQ-SF8-7, #1427 Workflow). Die übrigen DQ-Regeln und der Vertrag C1–C7 waren grün.
- Weitere Arbeit am 05.11., ohne Renditezahlen; die Ergebnisse liegen privat beim Owner:
  - E3-Export für Strang C (#1395).
  - Plausibilitätsprüfung Darvas/KK/Turtle: kein Umsetzungsfehler. Bei Darvas hängt das Ergebnis vor allem an der Annahme über die Reihenfolge innerhalb eines Balkens (#1408).
  - Screener-Kriterien (Z5, #1389).
  - C08-Treueprüfung: Regelabgleich (#1420, `docs/research/supertrader/C08-TREUE.md`), die Forschungsvarianten FID-1/FID-2 (#1418) und FID-2L mit Liquiditätsfilter (#1422). Der Lauf mit FID-1/FID-2 läuft.
- **Papierhandel SF6-PAPER-2027 eingeschaltet** (#1354): Protokoll 1.2.0 ist festgeschrieben (#1270, R1–R6, darunter R6 41864439485), Registry #1272 und #1273, E-P1 `COUNT_ONLY`, E-P2 Kappung 4. Der Wächter ist bis zum 31.12. untätig und zeichnet ab dem 04.01.2027 auf.
- Security Master 1.3.0 ist produktiv (Strang A, #1347). Damit ist S6 erfüllt, und die Eingangsprüfung stoppt am 11.11. nicht.
- Überholte Entwürfe geschlossen: #1099, #1142, #1315.

## Offen
- Dezember: F1–F3 (Forward-Namensraum befüllen) und ein Core-PR, der den Registry-Eintrag `supertrader-paper-2027-log` auf `ACTIVATING` stellt (mit JSONL-Leser), vor dem 04.01.2027.
- Kandidaten-Tageslauf: täglich die manuellen Läufe A und B, bis `SF8_AUTO_PUBLISH` gesetzt ist.
- Gate A ist noch nicht umgebaut (Strang A plant Vertragstests). C04–C13 bleiben „in Forschung“.
- C08: R-Verteilung und goldene Trades für FID-1/FID-2 auswerten, dann ein eigener Lauf für FID-2L. Danach die Fassung wählen, die einmal auf dem Holdout bestätigt wird (Regel vorher festschreiben). Anschließend dasselbe für C06/C07.
- Discovery-Regression NM3 (Firmennamen nach Security Master 1.3.0) und die Quant-Regression sind auf `main` rot. Sie gehören zu Strang A, C bzw. D und sind kein Supertrader-Thema. Supertrader-PRs werden bei sonst grünen Gates gemergt.
- C09-Entwürfe #1262 und #1263 ruhen, weil C09 in Forschung ist.

## Braucht Owner
- Repo-Variable `SF8_AUTO_PUBLISH=true` setzen. Empfehlung: jetzt. Jede Veröffentlichung prüft der Vertrag C1–C7 (fail closed).
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
