# Fundamental – Datenabdeckung und Konsistenz

Erzeugt mit `node scripts/fundamental/coverage-report.mjs --universe=<screener/data/universe-US_REAL.json> --out=docs/FUNDAMENTAL_DATA_COVERAGE.md` am 2026-10-24. Quellen: SEC-Verbraucherdateien (Projektion wie im Release), Discover-Aktiendateien, Wochenreihen mit Split-Beleg. Bewertungskennzahlen aus dem Screener-Universum (KBV, EV-Kennzahlen, Kurs/FCF, PEG) sind mitgezählt (`--universe=`).

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
| Dividendenrendite | 28,0 % | 9 (geprüft, GJ-Ende) | – |
| Marktkapitalisierung | 78,1 % | 8 (geprüft, GJ-Ende) | – |
| Unternehmenswert (EV) | 29,1 % | 5 (geprüft, GJ-Ende) | – |
| KGV | 41,1 % | 8 (geprüft, GJ-Ende) | – |
| KUV | 68,1 % | 8 (geprüft, GJ-Ende) | – |
| KBV | 62,3 % | 8 (geprüft, GJ-Ende) | – |
| EV / Umsatz | 29,0 % | 5 (geprüft, GJ-Ende) | – |
| EV / EBITDA | 19,0 % | 6 (geprüft, GJ-Ende) | – |
| PEG | 16,4 % | nur aktuell | – |
| Free-Cashflow-Rendite | 71,9 % | 8 (geprüft, GJ-Ende) | – |

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

## Bewertung zum Geschäftsjahresende

Regel: `fundamental/engine/catalog.js#historicalValuation`. Alles zum selben Stichtag: Wochenschluss ≤ 10 Tage vor GJ-Ende (splitbereinigt), ausstehende Aktien und Bilanz dieses Geschäftsjahres, Umsatz/EBITDA/Free Cashflow/Dividenden des Geschäftsjahres. Aktienzahl nur um Splits nach ihrem Meldedatum bereinigt; Gegenprobe gegen die bereinigte verwässerte Durchschnittszahl ±10 %, kein Sprung in Split-Größe. Unternehmenswert = Börsenwert + Finanzschulden − Zahlungsmittel. Nur USD-Berichte.

| Kennzahl | Unternehmen geprüft | mit ≥ 1 Jahr | Geschäftsjahre | mit Wert | häufigste Gründe für Lücken |
|---|---:|---:|---:|---:|---|
| KGV | 3498 | 2741 (78,4 %) | 37481 | 19618 (52,3 %) | Verlust in den letzten 12 Monaten (6973), kein Gewinn je Aktie (4804), Gegenprobe nicht bestanden (3134) |
| Marktkapitalisierung | 3498 | 3199 (91,5 %) | 37481 | 23944 (63,9 %) | keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307), keine Gegenprobe möglich (2872) |
| Unternehmenswert (EV) | 3498 | 1756 (50,2 %) | 37481 | 10794 (28,8 %) | Schulden oder Kasse fehlen (13150), keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307) |
| KUV | 3498 | 2799 (80,0 %) | 37481 | 21051 (56,2 %) | keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307), keine Gegenprobe möglich (2872) |
| KBV | 3498 | 3106 (88,8 %) | 37481 | 22810 (60,9 %) | keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307), keine Gegenprobe möglich (2872) |
| EV / Umsatz | 3498 | 1644 (47,0 %) | 37481 | 10067 (26,9 %) | Schulden oder Kasse fehlen (13150), keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307) |
| EV / EBITDA | 3498 | 1243 (35,5 %) | 37481 | 7677 (20,5 %) | Schulden oder Kasse fehlen (13150), keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307) |
| Free-Cashflow-Rendite | 3498 | 2889 (82,6 %) | 37481 | 21440 (57,2 %) | keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307), keine Gegenprobe möglich (2872) |
| Dividendenrendite | 3498 | 1552 (44,4 %) | 37481 | 12424 (33,1 %) | Bezugsgröße fehlt (10807), keine Aktienzahl (5274), Aktienzahl-Gegenprobe nicht bestanden (4307) |

Nicht berechnet: PEG (braucht je Stichtag ein dreijähriges, splitfestes Wachstum des Gewinns je Aktie) und Verhältnisse für Berichte in anderer Währung als US-Dollar (kein Wechselkurs je Stichtag in der Auslieferung).

## Zählung im Kennzahlenkatalog

Der Katalog definiert 60 Kennzahlen (Gewinnrendite und Kurs/Free Cashflow sind als Kehrwerte von KGV und Free-Cashflow-Rendite entfernt). Je Aktie zeigt die Kopfzeile drei Zahlen: definiert, mit Wert für dieses Unternehmen (aktueller Wert oder mindestens ein Jahreswert) und mit Verlauf (mindestens zwei Jahreswerte). Ohne Wert zählt eine Kennzahl nicht als verfügbar; sie steht unter „Ohne Angabe“ mit Grund.

Die frühere Anzeige „56“ bei NVDA stammte aus einer Zählung vor dem Laden der Vergleichsdaten (KBV, EV-Kennzahlen, Kurs/FCF, PEG kommen aus dem Screener-Universum); die Kopfzeile wurde danach nicht aktualisiert. Jetzt wird erst gezählt, wenn Vergleichsdaten und Kursreihe geladen sind.

## Repräsentative Aktien

| Aktie | Währung | Geschäftsjahre | Quartale | aktueller Wert | mit Verlauf | Jahr = Σ Quartale | LTM = Σ 4 Q | KGV-Jahre geprüft | KUV / KBV / EV/EBITDA geprüfte Jahre | Aktienbasis-Sprünge | ohne Angabe |
|---|---|---|---:|---:|---:|---:|---|---:|---|---:|---|
| AAL | USD | 2015–2025 | 8 | 50 / 60 | 51 | 5/5 | ok | 9/11 | 10 / 1 / 8 | 0 | Bruttogewinn-Wachstum, Bruttogewinn, Forschung & Entwicklung, Bruttomarge, F&E-Quote, Verschuldungsgrad, PEG |
| AAPL | USD | 2014–2025 | 8 | 60 / 60 | 59 | 6/6 | ok | 12/12 | 12 / 12 / 12 | 1 | – |
| AMZN | USD | 2014–2025 | 8 | 53 / 60 | 53 | 6/6 | ok | 10/12 | 12 / 12 / 12 | 1 | Forschung & Entwicklung, F&E-Quote, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, PEG |
| BRK-B | USD | 2014–2025 | 8 | 22 / 60 | 22 | 4/4 | ok | 0/0 | kein geprüftes Jahr | 0 | Bruttogewinn-Wachstum, Wachstum operatives Ergebnis, Wachstum Gewinn je Aktie, Bruttogewinn, Forschung & Entwicklung, Operatives Ergebnis, EBITDA, Gewinn je Aktie (verwässert), Aktienbasierte Vergütung, Bruttomarge, Operative Marge, EBITDA-Marge, Kapitalrendite (ROIC), F&E-Quote, Aktienvergütung zum Umsatz, Free Cashflow je Aktie, Finanzschulden, Langfristige Schulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Buchwert je Aktie, Ausstehende Aktien, Aktienanzahl (verwässert), Veränderung der Aktienanzahl, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Marktkapitalisierung, Unternehmenswert (EV), KGV, KUV, KBV, EV / Umsatz, EV / EBITDA, PEG, Free-Cashflow-Rendite |
| CMG | USD | 2014–2025 | 8 | 43 / 60 | 42 | 5/5 | ok | 12/12 | 9 / 11 / 0 | 1 | Bruttogewinn-Wachstum, Bruttogewinn, Forschung & Entwicklung, Bruttomarge, Kapitalrendite (ROIC), F&E-Quote, Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA |
| GOOGL | USD | 2014–2025 | 9 | 60 / 60 | 59 | 6/6 | ok | 4/11 | 4 / 4 / 4 | 0 | – |
| JNJ | USD | 2014–2025 | 8 | 54 / 60 | 47 | 5/5 | ok | 12/12 | 12 / 12 / 1 | 0 | Wachstum operatives Ergebnis, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite |
| JPM | USD | 2014–2025 | 10 | 34 / 60 | 33 | 2/2 | – | 12/12 | 12 / 12 / 0 | 0 | Bruttogewinn-Wachstum, Wachstum operatives Ergebnis, Free-Cashflow-Wachstum, Bruttogewinn, Forschung & Entwicklung, Operatives Ergebnis, EBITDA, Bruttomarge, Operative Marge, EBITDA-Marge, Free-Cashflow-Marge, Kapitalrendite (ROIC), F&E-Quote, Investitionen (Capex), Free Cashflow, Free Cashflow je Aktie, Investitionsquote, Finanzschulden, Langfristige Schulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA, Free-Cashflow-Rendite |
| KO | USD | 2014–2025 | 13 | 55 / 60 | 57 | 6/6 | ok | 12/12 | 12 / 12 / 10 | 0 | Forschung & Entwicklung, F&E-Quote |
| META | USD | 2014–2025 | 8 | 50 / 60 | 44 | 6/6 | ok | 12/12 | 0 / 0 / 0 | 0 | Kapitalrendite (ROIC), Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Buchwert je Aktie, Ausstehende Aktien, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA |
| MSFT | USD | 2014–2026 | 8 | 60 / 60 | 59 | 12/12 | ok | 13/13 | 13 / 13 / 13 | 0 | – |
| NVDA | USD | 2015–2026 | 10 | 60 / 60 | 59 | 6/6 | ok | 12/12 | 12 / 12 / 7 | 2 | – |
| O | USD | 2014–2025 | 8 | 41 / 60 | 41 | 4/4 | ok | 8/8 | 9 / 11 / 0 | 0 | Bruttogewinn-Wachstum, Wachstum operatives Ergebnis, Bruttogewinn, Forschung & Entwicklung, Operatives Ergebnis, EBITDA, Bruttomarge, Operative Marge, EBITDA-Marge, Kapitalrendite (ROIC), F&E-Quote, Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA, PEG |
| PLTR | USD | 2018–2025 | 8 | 47 / 60 | 47 | 6/6 | ok | 3/8 | 5 / 5 / 0 | 1 | Kapitalrendite (ROIC), Finanzschulden, Nettoverschuldung, Verschuldungsgrad, Nettoverschuldung / EBITDA, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Unternehmenswert (EV), EV / Umsatz, EV / EBITDA, PEG |
| SAP | EUR | 2014–2025 | 4 | 30 / 60 | 30 | – | – | nicht USD | Meldung nicht in US-Dollar | 0 | Bruttogewinn-Wachstum, Free-Cashflow-Wachstum, Bruttogewinn, Forschung & Entwicklung, EBITDA, Abschreibungen, Aktienbasierte Vergütung, Bruttomarge, EBITDA-Marge, Free-Cashflow-Marge, F&E-Quote, Aktienvergütung zum Umsatz, Investitionen (Capex), Free Cashflow, Free Cashflow je Aktie, Investitionsquote, Nettoverschuldung / EBITDA, Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, Marktkapitalisierung, Unternehmenswert (EV), KGV, KUV, KBV, EV / Umsatz, EV / EBITDA, PEG, Free-Cashflow-Rendite |
| TSLA | USD | 2014–2025 | 8 | 55 / 60 | 55 | 6/6 | ok | 6/12 | 9 / 9 / 7 | 2 | Gezahlte Dividenden, Dividende je Aktie (gezahlt), Ausschüttungsquote, Dividendenrendite, PEG |
| WMT | USD | 2015–2026 | 8 | 58 / 60 | 57 | 6/6 | ok | 12/12 | 12 / 12 / 12 | 1 | Forschung & Entwicklung, F&E-Quote |
| XOM | – | keine SEC-Historie | | | | | | | | | |
