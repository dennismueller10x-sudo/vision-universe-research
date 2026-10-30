# V12 – Historische Datenqualität vor Strategieoptimierung (Plan)

Stand 29.10.2026. Auftrag des Owners nach V11: erst die zentralen Datenverzerrungen beheben oder eingrenzen, dann Studien wiederholen. Keine große Strategiesuche, keine Gate-Änderung, keine Produktaktivierung, kein Frontend, kein Merge. V10/V11-Ergebnisse bleiben unverändert dokumentiert; insbesondere wird weder ein Alpha behauptet noch abgeleitet, realistisch handelbare Strategien könnten grundsätzlich keinen Mehrwert erzeugen – V11 zeigt nur, dass ihn die bisherige Datenbasis nicht belastbar messen kann.

## Ausgangslage (gemessen)

- Studienpopulation = heutiges Anbieteruniversum (4.329 Listings), 99,3–99,8 % Survivors je Jahr, Abdeckung der SEC-10-K-Melder 14 % (2000) – 69 % (2026); vor 2023 praktisch keine Delistings im Frame.
- Security Master: 8.021 Zeilen, nur 224 INACTIVE – keine historische Listingpopulation.
- PIT-Marktkapitalisierung aus XBRL mit groben Skalenfehlern (149 Panelzeilen > 5e12 USD, bis 7,9e18; ≈ 2 % implizite Aktienzahlen > 5× vom Median).
- Total Return nur für 8 Titel; SPY-Ausschüttungen aus N-30D belegt.

## Bestandsprüfung der autorisierten Quellen

| Quelle | Zugang | Nutzen für V12 |
|---|---|---|
| SEC EDGAR companyfacts (Bulk, schon privat vorhanden) | frei, fair access | Aktienzahl-Vintages je Konzept (dei/us-gaap), Grundlage der Skalenkorrektur |
| SEC EDGAR Vollindizes (form/company.idx, 1993–2026) | frei | alle 10-K-Melder je Jahr, alle Form-25/15-Meldungen mit Datum → Delisting-Referenz |
| SEC Fonds-Bestandsmeldungen (N-PORT ab 2019 XML mit CUSIP; N-Q/N-CSR ab ≈ 2004 HTML/Text) von SPY, QQQ, DIA und iShares-Russell-ETFs | frei | vierteljährliche PIT-Indexmitgliedschaft inkl. später delisteter Titel, Stückzahl und Wert je Position (→ Quartalspreis auch für fehlende Titel) |
| Tiingo `supported_tickers` (öffentliche Datei des bestehenden Anbieters) | frei, ohne Schlüssel | Ticker mit Börse, Typ, Start- und Enddatum inkl. inaktiver → Listingreferenz (nur abgeleitete Zählungen ins Repo) |
| Tiingo/Marketstack-Kurse, R2-Historienablage, Actions-Caches | nur in Actions mit Secrets | Kurse delisteter Titel: Prüfung über die bestehenden manuellen Read-only-Jobs; neue Abrufe nur als Freigabevorlage |
| V9/V10-Register (Identität, CA, Lifecycle, TR) | Repo | Wiederverwendung |

## Arbeitspakete

1. **P1 Marktkapitalisierung/XBRL-Skalenfehler (Priorität):** quellenbelegtes Korrekturregister je CIK und Stichtag (Faktor 10^k gegen alternative Konzepte und Nachbarvintages, Stichprobe gegen Originalfiling), korrigierte PIT-Marktkapitalisierung als Research-Modul; Wirkung auf V10-Faktorstudie und V11 (vorher/nachher).
2. **P2 Historische Indexpopulation aus SEC-Fondsmeldungen:** PIT-Mitgliedschaft S&P 500 (SPY) und breiter Markt (iShares Russell 1000/2000/3000), Zuordnung zu CIK/Ticker/ref-ID, Abdeckung unserer Kursreihen je Quartal, Liste ausgeschiedener Mitglieder mit letztem Bestandsdatum, Quartalspreise aus Wert/Stück.
3. **P3 Listingreferenz:** Tiingo-Tickerliste + EDGAR-Vollindizes + Form 25 → historische US-Common-Population je Jahr (Börse, Klasse, Start/Ende, Delisting-Grund), Lückenmaß je Jahr und Größenklasse.
4. **P4 Qualifizierte Teilpopulation:** z. B. PIT-S&P-500-Mitglieder ab dem Jahr, ab dem die Kursabdeckung ≥ 95 % ist, mit Survivorship-Schranken aus P2 für die fehlenden Titel; transparente Abdeckungsangabe.
5. **P5 Vorher/Nachher:** bestehende Studien (V10 Signal, V11 Zerlegung, V10 Faktor) auf korrigierten Daten und der qualifizierten Teilpopulation neu rechnen; Effekt zerlegt nach Population, Auswahl, Kosten, Benchmark (inkl. SPY-Total-Return), Total Return, Portfolioaufbau.
6. **P6 Vollständige Handelsstrategien (erst nach P4):** kleine, vorab registrierte Menge (Ein-/Ausstieg, Marktfilter, Cash, Risikomanagement), Auswertung nach Marktphasen (Crash, Erholung, Seitwärts); keine Variantensuche.

Reihenfolge: P1–P3 parallel, dann P4, dann P5, P6 nur wenn P4 eine ausreichend qualifizierte Basis liefert.
