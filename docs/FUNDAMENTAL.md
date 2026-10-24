# Fundamental 2.0

Produktwelt `/fundamental/` (Hash-Routen, ohne Abhängigkeiten). Zahlen und Abdeckung: [FUNDAMENTAL_DATA_COVERAGE.md](FUNDAMENTAL_DATA_COVERAGE.md) (erzeugt mit `scripts/fundamental/coverage-report.mjs`).

## Ansichten

| Route | Ansicht |
|---|---|
| `#/` | Startseite: Hero, sechs Ranglisten-Karten (Name, Kürzel, Wert, Branchenmedian, Mini-Verlauf; auf dem iPhone waagerecht wischbar), Branchen, Discover-Auswahlen |
| `#/entdecken`, `#/suche`, `#/methodik` | Ziele des Produkt-Docks (unverändert) |
| `#/rangliste/<id>`, `#/branche/<SIC2>` | Rangliste einer Kennzahl, Branche nach SIC-Hauptgruppe |
| `#/<T>` | Überblick: Kurs, Kennzahlen, Entwicklung, Umsatz & Gewinn, Branche |
| `#/<T>?ansicht=kennzahlen` | Katalog aller Kennzahlen mit Suche und Kategorien; Kopfzeile: definiert · mit Wert · mit Verlauf |
| `#/<T>?ansicht=kennzahl&k=<id>[&p=q]` | Detail: jährlich/quartalsweise, 3J/5J/10J/Max, Balken oder Linie, Vergleich mit Branchenmedian oder Wettbewerbern, Einordnung, CAGR, Tabelle mit Veränderung und SEC-Quelle; Bewertung mit geprüftem Verlauf zum GJ-Ende |
| `#/<T>?ansicht=vergleich[&t=sektor]` | Branchenvergleich: Branche oder Sektor, Wettbewerber „Größte“ oder „Ähnliche Größe“, Anzahl gültiger Werte, Lage ohne Wertung, Entwicklung zum Branchenmedian |
| `#/<T>?ansicht=finanzen[&t=bilanz\|cashflow][&p=q]` | GuV, Bilanz, Cashflow (5J/10J/Alle bzw. 4Q/8Q/Alle) |
| `#/<T>?ansicht=mehr` und `?ansicht=dividende\|analysten\|bewertung\|aktie\|unternehmen\|quellen` | Weitere Bereiche |

Unteransichten stehen im Query-Teil, damit `core/stock-context.js#parse` die Adresse weiter als Aktie erkennt.

## Daten

| Quelle | Pfad (ausgeliefert) | Erzeuger | Inhalt |
|---|---|---|---|
| SEC-Historie | `/fundamental/data/history/<shardKey>.json.gz` | `scripts/fundamental/build-history.mjs` im Release (`build-release.mjs`), nie committet | Geschäftsjahre, eigenständige Quartale, LTM aller Kennzahlen der SEC-Verbraucherdateien, Meldung je Wert |
| Discover-Aktiendatei | `/discover/data/stocks/US_REAL/<T>.json` | Discover | Kurs, Bewertung (KGV, KUV, Börsenwert, FCF-Rendite), Ersatz-Reihen |
| Screener-Universum | `/screener/data/universe-US_REAL.json` | Screener im Release | Querschnitt: Branche, KBV, EV-Kennzahlen, ROIC … aller US-Aktien |
| Branchenmediane | `/fundamental/data/history/industry/<sic-NN\|sec-ID>.json` | `build-history.mjs#industryMedians` im Release | Median je Geschäftsjahr und Anzahl Unternehmen (mind. 5) für Quoten, Renditen, Wachstum und geprüfte Bewertung |
| Wochenreihe | `/quant/data/market/discover-series-long/<securityId>.json` | Markt-Pipeline | Kurs splitbereinigt + Split-Beleg des Anbieters |
| Analysten | `/dashboard/data/analyst_ratings.json` | Dashboard | 11 Titel, Finnhub + FMP |

Die Seite liest die SEC-Historie zuerst. Fehlt sie, nimmt sie den Discover-Block und **zeigt das an**: Hinweis „Volle Historie gerade nicht verfügbar“ und `data-fu-source="discover"` am Hauptelement. Der Release-Smoke (`scripts/vu2/production-smoke.mjs`) prüft, dass `/fundamental/#/NVDA` aus der Historie liest.

Keine Identität außerhalb von `core/identity.js`: Scherben über `shardKey`, Kürzel → CIK aus der Discover-Aktiendatei.

## Regeln (fachlich)

- Nichts wird geschätzt. Fehlt eine Eingabe, bleibt der Zeitraum leer, mit Grund.
- **Jahr gegen Quartale:** Ergeben die vier Quartale eines Geschäftsjahres den Jahreswert nicht (±1 %), werden diese Quartale nicht gezeigt (`catalog.js#quarterMismatch`). Gewinn je Aktie ist ausgenommen (Aktienzahl je Quartal).
- **Splits ohne Rückrechnung:** Springt die verwässerte Aktienanzahl zwischen Jahren in Split-Größe (≥ 1,8 oder ≤ 0,55), gibt es über den Sprung keine Raten bei Werten je Aktie.
- **Währung:** Beträge in der Berichtswährung des Unternehmens. Im Querschnitt werden Beträge von Nicht-USD-Berichterstattern nicht mit Dollarwerten verglichen; Quoten schon.
- **Margen** über 150 % des Umsatzes gelten als nicht plausibel.
- **Ranglisten:** Größenuntergrenze und Plausibilitätsgrenzen stehen an jeder Liste (`catalog.js#RANKINGS`).
- **Kein Urteil:** Fundamental zeigt keine Einstufungen („stark“, „solide“) und keinen Score. Die Discover-Einstufungen und -Sätze werden bewusst nicht übernommen.

## Historische Bewertung (zum Geschäftsjahresende)

`catalog.js#historicalValuation`, nur in USD berichtende Unternehmen. Alles zum selben Stichtag – nie heutiger Kurs mit alten Zahlen:

1. **Kurs:** letzter Wochenschluss höchstens 10 Tage vor dem Geschäftsjahresende aus der splitbereinigten Wochenreihe (ADR-002).
2. **Splits:** Gewinn je Aktie und Aktienzahl wie gemeldet. Eine Meldung bildet alle Splits vor ihrem Meldedatum ab; herausgerechnet werden nur Splits **nach** dem Meldedatum, laut Split-Beleg des Kursanbieters (`corporateActions.splits`, Quelle `PROVIDER_SPLIT_FACTOR`).
3. **KGV:** Kurs ÷ bereinigter verwässerter Gewinn je Aktie. Gegenprobe: Nettogewinn ÷ ebenso bereinigte verwässerte Aktienzahl weicht höchstens 10 % ab; die Aktienzahl springt zu den Nachbarjahren nicht in Split-Größe (Faktor ≥ 1,8 oder ≤ 0,55). Bei Verlust kein KGV.
4. **Börsenwert:** Kurs × ausstehende Aktien (bereinigt wie oben). Gegenprobe: ausstehende und verwässerte Durchschnittszahl weichen höchstens 10 % ab (fängt u. a. Deckblattzahlen einer einzelnen Aktiengattung ab); kein Sprung in Split-Größe.
5. **Unternehmenswert:** Börsenwert + Finanzschulden − Zahlungsmittel aus der Bilanz desselben Geschäftsjahres (Definition wie im Screener; Wertpapiere zählen nicht zur Kasse). Fehlen Schulden oder Kasse, gibt es keinen EV – fehlend ist nicht null.
6. **Verhältnisse:** KUV = Börsenwert ÷ Umsatz, KBV = Börsenwert ÷ Eigenkapital (> 0), EV/Umsatz und EV/EBITDA (EV und Bezugsgröße > 0), Free-Cashflow-Rendite = Free Cashflow ÷ Börsenwert (auch negativ), Dividendenrendite = gezahlte Dividenden ÷ Börsenwert – jeweils Werte des Geschäftsjahres.

Jedes Jahr, das eine Prüfung nicht besteht oder dem eine Eingabe fehlt, bleibt leer, mit Grund in der Tabelle. Abdeckung: [FUNDAMENTAL_DATA_COVERAGE.md](FUNDAMENTAL_DATA_COVERAGE.md#bewertung-zum-geschäftsjahresende). **Nicht berechnet:** PEG (kein splitfestes dreijähriges EPS-Wachstum je Stichtag) und Verhältnisse für Berichte in anderer Währung (kein Wechselkurs je Stichtag in der Auslieferung).

## Branchenmedian je Geschäftsjahr

`build-history.mjs#industryMedians` rechnet beim Release-Bau mit derselben Logik wie die Seite (`catalog.js`) je SEC-Branche (SIC-Hauptgruppe, Quelle `quant/data/product/sic-peer-taxonomy-v1.json`) und je Sektor (`scripts/screener/sic.mjs#sectorFromSic`) den Median jeder Quote, Rendite, Wachstumsrate und geprüften Bewertung je Geschäftsjahr. Ein Median braucht mindestens 5 Unternehmen mit Wert; die Anzahl steht an jedem Wert. Keine Beträge (Median sagt nichts, Währungen mischen sich). Geschäftsjahre enden unterschiedlich; verglichen wird je Geschäftsjahr, wie gemeldet.

## Vergleich ohne Wertung

Lage = „höher als x % der Gruppe“ (Anteil mit niedrigerem Wert). Ein höheres KGV oder ein höherer Verschuldungsgrad ist nicht „besser“; deshalb gibt es im Unternehmensvergleich keinen Platz und keine Farbe für gut oder schlecht. Ranglisten der Startseite sortieren eine Kennzahl mit sichtbarer Regel – sie sind getrennt von jeder Einordnung und keine Empfehlung.

## Kennzahlen zählen

Der Katalog definiert 60 Kennzahlen; Gewinnrendite und Kurs/Free Cashflow sind als Kehrwerte von KGV und Free-Cashflow-Rendite nicht enthalten. Je Aktie: „im Katalog“ (definiert), „mit Wert“ (aktueller Wert oder mindestens ein Jahreswert) und „mit Verlauf“ (mindestens zwei Jahreswerte). Gezählt wird erst, wenn Vergleichsdaten und Kursreihe geladen sind (vorher zeigte NVDA 56 statt 62, weil KBV, EV-Kennzahlen, Kurs/FCF und PEG aus dem Screener-Universum noch fehlten).

## Grenzen

- **Segmentdaten** stehen nicht in den SEC-Companyfacts; nicht enthalten.
- **Quartale** reichen nur acht bis zehn Quartale zurück (Umfang der SEC-Verbraucherdateien).
- **Nachfolge-CIK** (z. B. XOM nach Umstrukturierung): Ist die neue CIK in den Companyfacts noch leer, zeigt Fundamental den Leerzustand. Die Zuordnung zur Vorgänger-CIK gehört in die SEC-Pipeline (`quant/data/universe/sec-universe.json#successor_cik`), nicht in Fundamental.
- **Banken und Versicherer** melden keinen Bruttogewinn, oft kein operatives Ergebnis und keine Finanzschulden im Sinne der Industrie; diese Kennzahlen bleiben leer.
- **Analysten** nur für 11 Titel.
- **Werte je Aktie im Verlauf** (EPS, Dividende je Aktie, Buchwert je Aktie) sind wie gemeldet; über einen Split ohne Rückrechnung sind sie nicht vergleichbar (Hinweis an der Kennzahl, keine Rate über den Sprung). Die Bewertung zum GJ-Ende nutzt den Split-Beleg. Nacharbeit: dieselbe Bereinigung für die Reihen je Aktie.
- **Wettbewerber** folgen der SEC-Hauptgruppe (zwei Stellen); feinere Branchen (SIC 4) stehen nicht im ausgelieferten Universum.
- **Weitere Rohdaten** (Wertpapiere, Zinsaufwand, Segmente) sind in den SEC-Verbraucherdateien nicht enthalten; sie kämen nur über die SEC-Pipeline (Quant), nicht aus Fundamental.

## Tests

`node --test "fundamental/tests/*.test.mjs"` (Modell, Katalog, Projektion, KGV, Quartalsregel, Routen, Datenpfade) · `scripts/quality/vu3-regression-qa.mjs` (Wege, Theme, Visual-Bausteine, Kontrast) · `scripts/quality/shell-browser-qa.mjs`.
