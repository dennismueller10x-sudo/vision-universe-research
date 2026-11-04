# Strang B – Supertrader-Backtest (Stand 04.11.2026, abends)

Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Produktdokument: [SUPERTRADER_9_HANDOVER.md](../SUPERTRADER_9_HANDOVER.md) §0.1.
Alle Backtest-Ergebnisse sind **Forschung, nicht zertifiziert**. Keine öffentlichen Renditeaussagen ohne Owner.

## Fertig
- V1 = Top 5 (C01, C02, C03, C08, C12). Lesarten PS-C01, PS-C03, PS-C08, PS-C12, FP-ST-03 und FP-ST-05 sind entschieden (#1327). Die übrigen acht Methoden stehen im Produkt als „in Forschung“.
- **Erster historischer Backtest der Top 5** (#1328, Lauf 41869479235):
  - Rahmen: DEV-Snapshot 2016-01-04 bis 2026-09-30, DQ-K5-Quarantäne (die 83 ungeklärten Kapitalmaßnahmen sind ausgeschlossen, E1), vier Kostenstufen, SPY-Vergleich, Universum B mit 229 V13-Delisting-Ketten.
  - Je Methode gerechnet: Trades, Trefferquote, Rendite, maximaler Verlust, Abstand zu SPY und Kosten.
  - Das Ergebnis liegt intern beim Owner (verschlüsselt im Lauf-Artefakt). Kurzfassung ohne Zahlen: Keine Methode schlägt SPY.
- V13-Studie (A gegen A+V13) lief erstmals: 41861419543. Secrets und Archiv 1.2.0 funktionieren. Exit 4 wegen des Audit-Befunds zum Kauf am letzten Handelstag; die Klärung steht in #1334.
- Kandidaten-Tageslauf wieder frisch: Stand 03.11. (Läufe 41862433422 und 41865789914, Commit `4decd3b7`).
- Papierhandel: #1272 gemergt. R6 41864439485 hat die Referenzgleichheit gezeigt, damit sind R1–R6 vollständig. Protokoll 1.2.0 ist festgeschrieben (`fde5283e…`, PREPARED_NOT_ACTIVE) in #1270, das #1268 enthält.
- Überholte Entwürfe geschlossen: #1099, #1142, #1315.

## Offen
- #1270 mergen (CI läuft). Danach #1268 als enthalten schließen, #1273 (Core-Registry) mergen, Schalter-PR: E-P1 `COUNT_ONLY`, E-P2 Kappung 4 in `snapshot/contract.mjs`, `activated: true`. Ziel: Merge vor dem 01.12.2026, Frist 31.12.2026.
- #1334 (Audit-Regel letzter Handelstag) mergen, danach die V13-Studie neu starten.
- `SF8_AUTO_PUBLISH`: Bis die Variable gesetzt ist, halte ich den Stand mit manuellen Läufen A und B frisch.
- C09-Entwürfe #1262 und #1263 ruhen, weil C09 in Forschung ist.

## Braucht Owner
- Repo-Variable `SF8_AUTO_PUBLISH=true` setzen. Empfehlung: jetzt. Jede Veröffentlichung prüft der Vertrag C1–C7 (fail closed).
- Buch (englische Originalausgabe Minervini) für FP-ST-05: eine Ausgabe, nur mit Freigabe.
- Öffentliche Darstellung von Backtest-Renditen: nur mit Freigabe.
- Lizenzanfragen für Kapitalmaßnahmen-Daten (FP-ST-01, Tabelle unten): Anfragen kosten nichts, ein Kauf braucht die Freigabe.

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
