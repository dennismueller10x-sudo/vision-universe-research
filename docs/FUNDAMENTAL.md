# Fundamental 2.0

Produktwelt `/fundamental/` (Hash-Routen, ohne Abhängigkeiten). Zahlen und Abdeckung: [FUNDAMENTAL_DATA_COVERAGE.md](FUNDAMENTAL_DATA_COVERAGE.md) (erzeugt mit `scripts/fundamental/coverage-report.mjs`).

## Ansichten

| Route | Ansicht |
|---|---|
| `#/` | Startseite: Hero, Ranglisten-Einstiege, Branchen, Discover-Auswahlen |
| `#/entdecken`, `#/suche`, `#/methodik` | Ziele des Produkt-Docks (unverändert) |
| `#/rangliste/<id>`, `#/branche/<SIC2>` | Rangliste einer Kennzahl, Branche nach SIC-Hauptgruppe |
| `#/<T>` | Überblick: Kurs, Kennzahlen, Entwicklung, Umsatz & Gewinn, Branche |
| `#/<T>?ansicht=kennzahlen` | Katalog aller Kennzahlen mit Suche und Kategorien |
| `#/<T>?ansicht=kennzahl&k=<id>[&p=q]` | Detail: jährlich/quartalsweise, Zeiträume, Tabelle mit Quelle, Branchenvergleich |
| `#/<T>?ansicht=vergleich[&t=sektor]` | Branchenvergleich |
| `#/<T>?ansicht=finanzen[&t=bilanz\|cashflow][&p=q]` | GuV, Bilanz, Cashflow |
| `#/<T>?ansicht=mehr` und `?ansicht=dividende\|analysten\|bewertung\|aktie\|unternehmen\|quellen` | Weitere Bereiche |

Unteransichten stehen im Query-Teil, damit `core/stock-context.js#parse` die Adresse weiter als Aktie erkennt.

## Daten

| Quelle | Pfad (ausgeliefert) | Erzeuger | Inhalt |
|---|---|---|---|
| SEC-Historie | `/fundamental/data/history/<shardKey>.json.gz` | `scripts/fundamental/build-history.mjs` im Release (`build-release.mjs`), nie committet | Geschäftsjahre, eigenständige Quartale, LTM aller Kennzahlen der SEC-Verbraucherdateien, Meldung je Wert |
| Discover-Aktiendatei | `/discover/data/stocks/US_REAL/<T>.json` | Discover | Kurs, Bewertung (KGV, KUV, Börsenwert, FCF-Rendite), Ersatz-Reihen |
| Screener-Universum | `/screener/data/universe-US_REAL.json` | Screener im Release | Querschnitt: Branche, KBV, EV-Kennzahlen, ROIC … aller US-Aktien |
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

## Historisches KGV

`catalog.js#historicalPe`, nur in USD berichtende Unternehmen:

1. Kurs: letzter Wochenschluss höchstens 10 Tage vor dem Geschäftsjahresende aus der splitbereinigten Wochenreihe (ADR-002).
2. Gewinn je Aktie wie gemeldet. Eine Meldung bildet alle Splits vor ihrem Meldedatum ab; herausgerechnet werden nur Splits **nach** dem Meldedatum, laut Split-Beleg des Kursanbieters (`corporateActions.splits`, Quelle `PROVIDER_SPLIT_FACTOR`).
3. Gegenprobe: Nettogewinn ÷ ebenso bereinigte verwässerte Aktienzahl darf höchstens 10 % abweichen.
4. Die bereinigte Aktienzahl darf zu den Nachbarjahren nicht in Split-Größe springen – sonst wären Gewinn je Aktie und Aktienzahl gemeinsam unbereinigt und die Gegenprobe wertlos.
5. Bei Verlust kein KGV.

Jedes Jahr, das eine Prüfung nicht besteht, bleibt leer. Andere Bewertungskennzahlen (KUV, KBV, EV/EBITDA …) gibt es weiter nur zum aktuellen Kurs: Dafür fehlen geprüfte historische Unternehmenswerte (Schulden und Kasse je Stichtag in derselben Basis) bzw. ein Wechselkurs je Stichtag für Nicht-USD-Berichte.

## Grenzen

- **Segmentdaten** stehen nicht in den SEC-Companyfacts; nicht enthalten.
- **Quartale** reichen nur acht bis zehn Quartale zurück (Umfang der SEC-Verbraucherdateien).
- **Nachfolge-CIK** (z. B. XOM nach Umstrukturierung): Ist die neue CIK in den Companyfacts noch leer, zeigt Fundamental den Leerzustand. Die Zuordnung zur Vorgänger-CIK gehört in die SEC-Pipeline (`quant/data/universe/sec-universe.json#successor_cik`), nicht in Fundamental.
- **Banken und Versicherer** melden keinen Bruttogewinn, oft kein operatives Ergebnis und keine Finanzschulden im Sinne der Industrie; diese Kennzahlen bleiben leer.
- **Analysten** nur für 11 Titel.
- **Werte je Aktie im Verlauf** (EPS, Dividende je Aktie, Buchwert je Aktie) sind wie gemeldet; über einen Split ohne Rückrechnung sind sie nicht vergleichbar (Hinweis an der Kennzahl). Nur das historische KGV nutzt den Split-Beleg. Nacharbeit: dieselbe Bereinigung für alle Werte je Aktie.

## Tests

`node --test "fundamental/tests/*.test.mjs"` (Modell, Katalog, Projektion, KGV, Quartalsregel, Routen, Datenpfade) · `scripts/quality/vu3-regression-qa.mjs` (Wege, Theme, Visual-Bausteine, Kontrast) · `scripts/quality/shell-browser-qa.mjs`.
