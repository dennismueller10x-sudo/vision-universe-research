# Fundamental – Datenabdeckung und Konsistenz

Erzeugt mit `node scripts/fundamental/coverage-report.mjs --universe=<screener/data/universe-US_REAL.json> --out=docs/FUNDAMENTAL_DATA_COVERAGE.md` am 2026-10-23. Quellen: SEC-Verbraucherdateien (Projektion wie im Release), Discover-Aktiendateien, Wochenreihen mit Split-Beleg. Bewertungskennzahlen aus dem Screener-Universum (KBV, EV-Kennzahlen, Kurs/FCF, PEG) sind mitgezählt (`--universe=`).

## Umfang

| | Anzahl |
|---|---:|
| Discover-Aktiendateien | 6125 |
| mit SEC-Historie (Projektion) | 4882 |
| ohne SEC-Geschäftszahlen | 1063 |
| SEC-Datei ohne Jahres-/Quartalsreihen | 180 |
| Geschäftsjahre je Unternehmen (Median / 10 % / 90 %) | 12 / 5 / 12 |
| Eigenständige Quartale je Unternehmen (Median / 90 %) | 8 / 12 |

Die SEC-Verbraucherdateien führen höchstens die letzten acht bis zehn Quartale; ältere Quartale liegen nicht vor.

## Kennzahlen

Aktueller Wert = LTM, letztes Geschäftsjahr oder Kurs; Jahre = Geschäftsjahre mit Wert (Median über Unternehmen mit Reihe).

| Kennzahl | aktueller Wert | Jahre (Median) | auch quartalsweise |
|---|---:|---:|---:|
| Umsatzwachstum | 84,1 % | 9 | 62,0 % |
| Bruttogewinn-Wachstum | 55,5 % | 9 | 39,5 % |
| Wachstum operatives Ergebnis | 57,5 % | 7 | 34,1 % |
| Gewinnwachstum | 75,0 % | 7 | 45,2 % |
| Wachstum Gewinn je Aktie | 67,1 % | 7 | 43,5 % |
| Free-Cashflow-Wachstum | 67,1 % | 7 | 42,6 % |
| Umsatz | 85,9 % | 11 | 66,8 % |
| Bruttogewinn | 57,9 % | 10 | 44,3 % |
| Forschung & Entwicklung | 43,7 % | 9 | – |
| Operatives Ergebnis | 82,4 % | 11 | 65,5 % |
| EBITDA | 71,9 % | 11 | 58,7 % |
| Abschreibungen | 83,5 % | 12 | 70,1 % |
| Ergebnis vor Steuern | 88,8 % | 11 | 65,6 % |
| Ertragsteuern | 92,0 % | 11 | 69,2 % |
| Nettogewinn | 98,2 % | 12 | 80,4 % |
| Gewinn je Aktie (verwässert) | 92,6 % | 9 | 73,9 % |
| Aktienbasierte Vergütung | 81,7 % | 12 | – |
| Bruttomarge | 57,2 % | 10 | 42,7 % |
| Operative Marge | 68,8 % | 10 | 49,2 % |
| EBITDA-Marge | 62,9 % | 10 | 47,2 % |
| Nettomarge | 77,7 % | 10 | 56,6 % |
| Free-Cashflow-Marge | 72,4 % | 10 | 50,8 % |
| Eigenkapitalrendite (ROE) | 94,2 % | 10 | – |
| Gesamtkapitalrendite (ROA) | 98,0 % | 11 | – |
| Kapitalrendite (ROIC) | 45,0 % | 6 | – |
| Steuerquote | 70,8 % | 8 | 47,6 % |
| F&E-Quote | 35,9 % | 8 | – |
| Aktienvergütung zum Umsatz | 71,6 % | 10 | – |
| Operativer Cashflow | 98,0 % | 12 | 80,3 % |
| Investitionen (Capex) | 88,1 % | 11 | 67,0 % |
| Free Cashflow | 88,0 % | 11 | 67,0 % |
| Free Cashflow je Aktie | 83,0 % | 8 | – |
| Cash Conversion | 77,9 % | 8 | – |
| Investitionsquote | 78,8 % | 10 | 56,3 % |
| Bilanzsumme | 99,8 % | 11 | – |
| Eigenkapital | 99,2 % | 12 | – |
| Liquide Mittel | 99,5 % | 12 | 99,1 % |
| Finanzschulden | 54,3 % | 6 | 42,5 % |
| Langfristige Schulden | 66,9 % | 7 | – |
| Nettoverschuldung | 54,0 % | 6 | – |
| Eigenkapitalquote | 99,1 % | 11 | – |
| Verschuldungsgrad | 51,7 % | 6 | – |
| Nettoverschuldung / EBITDA | 33,8 % | 6 | – |
| Buchwert je Aktie | 86,9 % | 11 | – |
| Ausstehende Aktien | 87,8 % | 11 | 83,8 % |
| Aktienanzahl (verwässert) | 91,1 % | 9 | – |
| Veränderung der Aktienanzahl | 87,5 % | 8 | – |
| Gezahlte Dividenden | 41,4 % | 12 | – |
| Dividende je Aktie (gezahlt) | 38,8 % | 10 | – |
| Ausschüttungsquote | 38,1 % | 9 | – |
| Dividendenrendite | 28,0 % | nur aktuell | – |
| Marktkapitalisierung | 78,1 % | nur aktuell | – |
| Unternehmenswert (EV) | 29,1 % | nur aktuell | – |
| KGV | 41,1 % | aktuell + geprüfte GJ (unten) | – |
| KUV | 68,1 % | nur aktuell | – |
| KBV | 62,3 % | nur aktuell | – |
| Kurs / Free Cashflow | 37,1 % | nur aktuell | – |
| EV / Umsatz | 29,0 % | nur aktuell | – |
| EV / EBITDA | 19,0 % | nur aktuell | – |
| PEG | 16,4 % | nur aktuell | – |
| Free-Cashflow-Rendite | 71,9 % | nur aktuell | – |
| Gewinnrendite | 41,1 % | nur aktuell | – |

## Konsistenz Jahr gegen Quartale

Geschäftsjahre, für die alle vier eigenständigen Quartale vorliegen: Summe der Quartale gegen den Jahreswert, Toleranz 1 %. Unstimmige Geschäftsjahre werden in Fundamental nicht quartalsweise gezeigt (`catalog.js#quarterMismatch`, Grund „Quartale ergeben nicht den Jahreswert“); der Jahreswert bleibt.

| Kennzahl | geprüfte Jahre | stimmig | gesperrt | betroffene Unternehmen |
|---|---:|---:|---:|---:|
| Umsatz | 3270 | 96,6 % | 112 | 108 |
| Bruttogewinn | 2197 | 95,2 % | 106 | 103 |
| Operatives Ergebnis | 3180 | 95,8 % | 133 | 131 |
| Nettogewinn | 3958 | 94,6 % | 215 | 209 |
| Operativer Cashflow | 3925 | 99,6 % | 16 | 16 |
| Free Cashflow | 3356 | 98,8 % | 39 | 39 |

LTM-Umsatz gegen Summe der letzten vier Quartale (Toleranz 0,5 %): 100,0 % von 2936 Unternehmen stimmig.

## Historisches KGV

Regel: `fundamental/engine/catalog.js#historicalPe` (Split-Beleg des Kursanbieters, Bereinigung nur für Splits nach dem Meldedatum, Gegenprobe Nettogewinn ÷ bereinigte Aktienzahl ±10 %, keine Aktienbasis-Sprünge, Wochenschluss ≤ 10 Tage vor GJ-Ende, positiver Gewinn).

| | Wert |
|---|---:|
| Unternehmen mit Kursreihe (USD-Bericht) | 4384 |
| davon mindestens ein geprüftes Jahr | 2741 (62,5 %) |
| Geschäftsjahre gesamt | 35361 |
| mit veröffentlichtem KGV | 19618 (55,5 %) |
| leer: Verlust in den letzten 12 Monaten | 7512 |
| leer: Gegenprobe nicht bestanden | 3771 |
| leer: Aktienbasis springt | 2403 |
| leer: kein Kurs zum GJ-Ende | 1227 |
| leer: keine Gegenprobe möglich | 830 |

## Repräsentative Aktien

| Aktie | Währung | Geschäftsjahre | Quartale | Kennzahlen mit aktuellem Wert | Jahr = Σ Quartale | LTM = Σ 4 Q | KGV-Jahre geprüft | Aktienbasis-Sprünge | ohne Angabe |
|---|---|---|---:|---:|---:|---|---:|---:|---|
| AAL | USD | 2015–2025 | 8 | 51 / 62 | 5/5 | ok | 9/11 | 0 | Bruttogewinn-Wachstum, Bruttogewinn, Forschung & Entwicklung, Bruttomarge, F&E-Quote, Verschuldungsgrad, Dividendenrendite, KGV, KBV, PEG, Gewinnrendite |
| AAPL | USD | 2014–2025 | 8 | 62 / 62 | 6/6 | ok | 12/12 | 1 | – |
| AMZN | USD | 2014–2025 | 8 | 54 / 62 | 6/6 | ok | 10/12 | 1 | Forschung & Entwicklung, F&E-Quote, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Kurs / Free Cashflow, PEG |
| BRK-B | USD | 2014–2025 | 8 | 22 / 62 | 4/4 | ok | 0/0 | 0 | Bruttogewinn-Wachstum, Wachstum operatives Ergebnis, Wachstum Gewinn je Aktie, Bruttogewinn, Forschung & Entwicklung, Operatives Ergebnis, EBITDA, Gewinn je Aktie (verwässert), Aktienbasierte Vergütung, Bruttomarge, Operative Marge, EBITDA-Marge, Kapitalrendite (ROIC), F&E-Quote, Aktienvergütung zum Umsatz, Free Cashflow je Aktie, Finanzschulden, Langfristige Schulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Buchwert je Aktie, Ausstehende Aktien, Aktienanzahl (verwässert), Veränderung der Aktienanzahl, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Marktkapitalisierung, Unternehmenswert (EV), KGV, KUV, KBV, Kurs / Free Cashflow, EV / Umsatz, EV / EBITDA, PEG, Free-Cashflow-Rendite, Gewinnrendite |
| CMG | USD | 2014–2025 | 8 | 45 / 62 | 5/5 | ok | 12/12 | 1 | Bruttogewinn-Wachstum, Bruttogewinn, Forschung & Entwicklung, Bruttomarge, Kapitalrendite (ROIC), F&E-Quote, Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA |
| GOOGL | USD | 2014–2025 | 9 | 62 / 62 | 6/6 | ok | 4/11 | 0 | – |
| JNJ | USD | 2014–2025 | 8 | 56 / 62 | 5/5 | ok | 12/12 | 0 | Wachstum operatives Ergebnis, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, EV / EBITDA |
| JPM | USD | 2014–2025 | 10 | 35 / 62 | 2/2 | – | 12/12 | 0 | Bruttogewinn-Wachstum, Wachstum operatives Ergebnis, Free-Cashflow-Wachstum, Bruttogewinn, Forschung & Entwicklung, Operatives Ergebnis, EBITDA, Bruttomarge, Operative Marge, EBITDA-Marge, Free-Cashflow-Marge, Kapitalrendite (ROIC), F&E-Quote, Investitionen (Capex), Free Cashflow, Free Cashflow je Aktie, Investitionsquote, Finanzschulden, Langfristige Schulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Unternehmenswert (EV), Kurs / Free Cashflow, EV / Umsatz, EV / EBITDA, Free-Cashflow-Rendite |
| KO | USD | 2014–2025 | 13 | 57 / 62 | 6/6 | ok | 12/12 | 0 | Forschung & Entwicklung, F&E-Quote, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA |
| META | USD | 2014–2025 | 8 | 52 / 62 | 6/6 | ok | 12/12 | 0 | Kapitalrendite (ROIC), Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Buchwert je Aktie, Ausstehende Aktien, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA |
| MSFT | USD | 2014–2026 | 8 | 62 / 62 | 12/12 | ok | 13/13 | 0 | – |
| NVDA | USD | 2015–2026 | 10 | 62 / 62 | 6/6 | ok | 12/12 | 2 | – |
| O | USD | 2014–2025 | 8 | 43 / 62 | 4/4 | ok | 8/8 | 0 | Bruttogewinn-Wachstum, Wachstum operatives Ergebnis, Bruttogewinn, Forschung & Entwicklung, Operatives Ergebnis, EBITDA, Bruttomarge, Operative Marge, EBITDA-Marge, Kapitalrendite (ROIC), F&E-Quote, Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA, PEG |
| PLTR | USD | 2018–2025 | 8 | 49 / 62 | 6/6 | ok | 3/8 | 1 | Kapitalrendite (ROIC), Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA, PEG |
| SAP | EUR | 2014–2025 | 4 | 30 / 62 | – | – | nicht USD | 0 | Bruttogewinn-Wachstum, Free-Cashflow-Wachstum, Bruttogewinn, Forschung & Entwicklung, EBITDA, Abschreibungen, Aktienbasierte Vergütung, Bruttomarge, EBITDA-Marge, Free-Cashflow-Marge, F&E-Quote, Aktienvergütung zum Umsatz, Investitionen (Capex), Free Cashflow, Free Cashflow je Aktie, Investitionsquote, Nettoverschuldung / EBITDA, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Marktkapitalisierung, Unternehmenswert (EV), KGV, KUV, KBV, Kurs / Free Cashflow, EV / Umsatz, EV / EBITDA, PEG, Free-Cashflow-Rendite, Gewinnrendite |
| TSLA | USD | 2014–2025 | 8 | 57 / 62 | 6/6 | ok | 6/12 | 2 | Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, PEG |
| WMT | USD | 2015–2026 | 8 | 60 / 62 | 6/6 | ok | 12/12 | 1 | Forschung & Entwicklung, F&E-Quote |
| XOM | – | keine SEC-Historie | | | | | | | |
