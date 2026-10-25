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
| `#/<T>?ansicht=kennzahl&k=<id>&plus=<id>.<id>[&d=achsen\|index\|getrennt]` | Dieselbe Detailansicht mit bis zu drei weiteren Kennzahlen im gemeinsamen Verlauf („+ Kennzahl“), siehe „Mehrere Kennzahlen im Verlauf“ |
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
| Branchenmediane | `/fundamental/data/history/industry/<sic4-NNNN\|sic-NN\|sec-ID>.json` | `build-history.mjs#industryMedians` im Release | Median je Geschäftsjahr und Anzahl Unternehmen (mind. 5) für Quoten, Renditen, Wachstum und geprüfte Bewertung |
| Vergleichsgruppen | `/fundamental/data/history/peers.json` | `build-history.mjs#peerIndex` im Release | SIC-4-Code → Kürzel, SEC-Bezeichnung |
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

## Historische Bewertung (nach jedem Jahresbericht)

`catalog.js#historicalValuation`, nur in USD berichtende Unternehmen. Jeder Wert ist gebaut wie der aktuelle (Kurs ÷ zuletzt gemeldete Jahres- bzw. LTM-Zahl), nur zu einem früheren Datum – mit dem **Kurs nach der Veröffentlichung** und nie mit heutigem Kurs (zu später korrigierten Jahreszahlen siehe „Grenze“ unten):

1. **Datum:** Einreichung des Jahresberichts (10-K) bei der SEC. Quelle: SIC-Verlauf der SEC-Pipeline (`quant/data/sec/sic-history`, jedes 10-K/10-Q mit Annahmezeitpunkt), für Berichte nach dessen letztem Lauf das Meldedatum der Jahreswerte selbst (`build-history.mjs#publicationDates`). Ohne Datum kein Wert (`NO_PUBLICATION_DATE`).
2. **Kurs:** erster Wochenschluss **nach** diesem Datum (höchstens 10 Tage danach) aus der splitbereinigten Wochenreihe (ADR-002). Ein Kurs vor der Veröffentlichung würde einen damals unbekannten Gewinn verwenden (Look-ahead) – das KGV „am GJ-Ende“ wurde deshalb ersetzt.
3. **Splits:** Gewinn je Aktie und Aktienzahl wie gemeldet; herausgerechnet werden nur Splits **nach** dem Meldedatum, laut Split-Beleg des Kursanbieters (`corporateActions.splits`, Quelle `PROVIDER_SPLIT_FACTOR`).
4. **KGV:** Kurs ÷ bereinigter verwässerter Gewinn je Aktie des Geschäftsjahres (= LTM am Tag des Jahresberichts). Gegenprobe Nettogewinn ÷ bereinigte verwässerte Aktienzahl ±10 %, kein Sprung der Aktienbasis in Split-Größe (Faktor ≥ 1,8 oder ≤ 0,55). Bei Verlust kein KGV.
5. **Börsenwert:** Kurs × ausstehende Aktien (bereinigt wie oben); Gegenprobe gegen die verwässerte Durchschnittszahl ±10 %.
6. **Unternehmenswert:** Börsenwert + Finanzschulden − Zahlungsmittel aus der Bilanz dieses Geschäftsjahres (wie im Screener). Fehlt eines, kein EV.
7. **Verhältnisse:** KUV, KBV (Eigenkapital > 0), EV/Umsatz, EV/EBITDA (> 0), Free-Cashflow-Rendite (auch negativ), Dividendenrendite – jeweils Werte des Geschäftsjahres.

**Vergleichbarkeit:** Aktuelles KGV (Discover = Screener) = Schlusskurs ÷ verwässerter Gewinn je Aktie der letzten zwölf Monate laut letztem 10-Q/10-K; Querschnittsmedian aus denselben Werten (nur Unternehmen mit Gewinn). Historisches KGV und sein Branchenmedian folgen derselben Rechnung zum Tag des Jahresberichts. Beispiel NVIDIA: aktuell 212,21 $ (22.10.2026) ÷ 7,91 $ = 26,8; GJ 2026 nach dem 10-K vom 25.02.2026: 177,19 $ (27.02.2026) ÷ 4,90 $ = 36,2.

**Grenze (Restatements):** Werte stammen aus der jeweils neuesten Meldung (`as_of_latest` der Verbraucherdaten). Hat ein Unternehmen einen Jahreswert später korrigiert (10-K/A oder Vorjahresspalte des nächsten 10-K), steht im Verlauf der korrigierte Wert – zum Kurs nach dem *ursprünglichen* 10-K. Der Kurs ist damit look-ahead-frei, die Kennzahl im betroffenen Jahr nicht zwingend: sie kann vom am Meldetag sichtbaren Wert abweichen. Die ursprünglich gemeldeten Fassungen liegen in der Auslieferung nicht vor; companyfacts unterscheidet eine unveränderte Wiederholung in einer späteren Meldung nicht von einer Korrektur, deshalb wird kein Jahr als „korrigiert“ markiert. In der Oberfläche steht diese Einschränkung bei jeder historischen Bewertungskennzahl und in der Methodik.

Abdeckung: [FUNDAMENTAL_DATA_COVERAGE.md](FUNDAMENTAL_DATA_COVERAGE.md). **Nicht berechnet:** PEG und Verhältnisse für Berichte in anderer Währung.

## Zeiträume: Geschäftsjahr, Quartal, LTM

- **GJ:** Jahreswert aus dem 10-K (oder Summe von vier eigenständigen Quartalen). Das Jahresdiagramm zeigt nur abgeschlossene Geschäftsjahre.
- **Quartal:** eigenständige Quartale; Q4 ist Jahreswert minus neun Monate („berechnet“). Für Werte je Aktie wird ein so berechnetes Quartal **nicht** gezeigt (andere Aktienzahl je Zeitraum, `DERIVED_PER_SHARE`).
- **LTM:** Summe der letzten vier eigenständigen Quartale. Die Kopfzeile nennt die Quartale und das letzte Geschäftsjahr, z. B. NVIDIA: LTM = Q3 GJ 2026 bis Q2 GJ 2027 (bis 26.07.2026) 302,97 Mrd. $; GJ 2026 (bis 25.01.2026) 215,94 Mrd. $ – beides exakt die Summe der SEC-Quartalswerte.

## Datenstand und Aktualität

- Jede Aktienseite zeigt den neuesten Berichtszeitraum und das Datum der letzten verarbeiteten SEC-Meldung.
- Liegt bei der SEC bereits ein neuerer 10-Q/10-K vor (`quant/data/fundamentals/daily/state.json` der täglichen SEC-Pipeline), steht dort sichtbar, dass er in den verarbeiteten Daten noch fehlt. Zahlen aus Ergebnismitteilungen (Pressemitteilung, 8-K) werden nicht übernommen; maßgeblich sind die eingereichten 10-Q/10-K.
- **Ablauf:** tägliche SEC-Pipeline (`sec-fundamentals-daily.yml`, 06:15 UTC) erkennt neue Meldungen → Wächter `fundamental-sec-freshness.yml` (`scripts/fundamental/sec-freshness.mjs`) vergleicht mit den Verbraucherdateien und stößt bei neuen periodischen Meldungen den bestehenden Erzeuger `sec-consumer-fundamentals.yml` an (höchstens einmal je 18 Stunden; sonst wöchentlich montags) → dieser committet Verbraucher- und Discover-Daten → das Release (`pages-release.yml`, ausgelöst durch den Erzeuger) baut die Fundamental-Historie neu. Kein Code-Merge nötig.
- **Veröffentlichung prüfen:** Nach jedem Lauf des Erzeugers startet der Job `publish` desselben Wächters (Rückfall: täglich 19:50 UTC für den jüngsten Lauf der letzten 26 Stunden).
  - Lauf gescheitert (z. B. in der eigenen Regressionsprüfung des Erzeugers): nichts wurde committet → roter Lauf mit Hinweis, keine Wiederholung.
  - Lauf erfolgreich: wartet auf ein erfolgreiches `pages-release.yml` auf `main`, das danach entstanden ist (es startet per `workflow_run` und werktags ohnehin alle 5 Minuten). Kommt binnen 15 Minuten keines, wird es **einmal** per `workflow_dispatch` mit Standard-Eingaben angestoßen.
  - Danach vergleicht `scripts/fundamental/verify-publication.mjs` die Auslieferung mit `main`: `status.json` mit demselben `consumerAsOf` wie die Verbraucherdateien, und für bis zu 8 frisch übernommene 10-Q/10-K (laut `state.json`) muss die ausgelieferte Scherbe genau diese Meldung (Accession) enthalten. Bis zu 6 Versuche im Abstand von 2 Minuten (CDN); sonst roter Lauf.
  - Weder der Erzeuger noch `pages-release.yml` werden dafür verändert; der Wächter schreibt nichts ins Repository.
- **Alarm:** Der tägliche Lauf des Wächters wird rot, wenn eine neue 10-Q/10-K seit mehr als 3 Tagen nicht in den Verbraucherdaten steht oder der Erzeuger seit 8 Tagen keinen erfolgreichen Lauf hatte; GitHub meldet gescheiterte Läufe dem Eigentümer. Ein gescheiterter Erzeugerlauf wird am Folgetag einmal neu angestoßen (18-Stunden-Sperre), nicht in einer Schleife.
- **Täglich, auch am Wochenende:** `sec-fundamentals-daily.yml` (06:15 UTC) und der Wächter (nach dem täglichen Lauf, Rückfall 14:40 UTC) laufen jeden Tag; `pages-release.yml` startet nach jedem Erzeugerlauf per `workflow_run`, unabhängig vom Wochentag.
- Meldungen, die ein Verbraucherlauf schon hatte und nicht übernommen hat, werden nur gemeldet (`notAdopted`), nicht täglich neu angestoßen. Ursachen je Meldung (fehlende SEC-Daten, Verarbeitungsgrenze, nicht unterstützt, sonstige): [FUNDAMENTAL_SEC_GAPS.md](FUNDAMENTAL_SEC_GAPS.md).

## Branchenmedian je Geschäftsjahr

`build-history.mjs#industryMedians` rechnet beim Release-Bau mit derselben Logik wie die Seite (`catalog.js`) je SEC-Branche (SIC-Hauptgruppe, Quelle `quant/data/product/sic-peer-taxonomy-v1.json`) und je Sektor (`scripts/screener/sic.mjs#sectorFromSic`) den Median jeder Quote, Rendite, Wachstumsrate und geprüften Bewertung je Geschäftsjahr. Ein Median braucht mindestens 5 Unternehmen mit Wert; die Anzahl steht an jedem Wert. Keine Beträge (Median sagt nichts, Währungen mischen sich). Geschäftsjahre enden unterschiedlich; verglichen wird je Geschäftsjahr, wie gemeldet.

## Vergleichsgruppen

| Gruppe | Definition | Datei |
|---|---|---|
| **Wettbewerber** (Standard) | gleicher vierstelliger SEC-SIC-Code (z. B. 3674 Halbleiter), mindestens 5 Unternehmen mit Börsenwert | `peers.json`, `industry/sic4-NNNN.json` |
| Branche | gleiche SIC-Hauptgruppe (zwei Stellen; 36 enthält z. B. auch GE mit SIC 3600) | `industry/sic-NN.json` |
| Sektor | sic-sector-1.0.0 | `industry/sec-ID.json` |

Quelle des Codes: `quant/data/product/sic-peer-taxonomy-v1.json` (wie Screener), Bezeichnung: `quant/data/sec/sic-history/sic-codes.json` (SEC, englisch). Median, Lage, Balken, Tabelle und Verlauf zum Median kommen immer aus derselben gewählten Gruppe; die Anzahl der Unternehmen mit gültigem Wert steht dabei. Kennzahl-Detail und Überblick nutzen die engste verfügbare Gruppe. Keine redaktionelle Auswahl: Der Code ist die offizielle, je Unternehmen von der SEC geführte Klassifikation; er kann veraltet sein oder Geschäftsmodelle grob zusammenfassen.

## Mehrere Kennzahlen im Verlauf

In jeder Kennzahl-Detailansicht mit Verlauf (alle außer PEG) blendet „+ Kennzahl“ bis zu drei weitere Kennzahlen desselben Unternehmens ein: Auswahl mit Suche, Kategorien und Vorschlägen. Jede lässt sich einzeln entfernen; die Hauptkennzahl bleibt. Die Auswahl steht in der Adresse (`&plus=`, `&d=`). Dann gibt es keinen Branchen- oder Wettbewerbervergleich und kein Balkendiagramm. Entfernt man alle weiteren Kennzahlen, ist die Ansicht wieder wie vorher, einschließlich Diagrammart und gewählter Vergleichsgruppe.

`fundamental/engine/compare.js` rechnet keine Kennzahl neu. Jede Reihe kommt unverändert aus `catalog.js#seriesOf`; compare.js legt nur fest, was sich zeitlich zusammenführen lässt:
- **Eine Zeitraum-Art je Diagramm:** Geschäftsjahre oder eigenständige Quartale, zusammengeführt über den Schlüssel des Zeitraums (gleiches Unternehmen, gleiche Geschäftsjahre). LTM wird nicht mit Jahren oder Quartalen gemischt.
- **Bewertung nur je Jahresbericht:** Kurs = erster Wochenschluss nach Einreichung des 10-K, mit den Zahlen desselben Geschäftsjahres. Diese Zahlen waren zum Kursdatum veröffentlicht. Liegt ein Kursdatum nicht nach der Veröffentlichung, wird der Wert verworfen (`LOOKAHEAD`). In Quartalsansichten gibt es keine Bewertung (`VALUATION_ANNUAL_ONLY`).
- **Berichtszeitraum und Veröffentlichung getrennt:** Beim Ablesen stehen das Ende des Berichtszeitraums und das Datum des Jahresberichts (Quartale: jüngste SEC-Meldung mit diesem Wert), bei Bewertung dazu Kurs und Kursdatum.
- **Lücken bleiben Lücken:** Es wird nicht interpoliert und keine Linie über eine Lücke gezogen. Eine Kennzahl ohne mindestens zwei Werte in der gewählten Zeitraum-Art steht nicht im Verlauf, mit Grund (z. B. `ANNUAL_ONLY` für ROE quartalsweise).
- **Einheiten:** Verschiedene Einheiten (Betrag, je Aktie, Aktien, Prozent, Faktor) teilen nie eine Achse.
  - Eine Einheit: eine Achse.
  - Zwei Einheiten: links und rechts (Hauptkennzahl links), mit Hinweis, dass Schnittpunkte nichts bedeuten.
  - Mehr Einheiten: „Index 100“ oder „Getrennt“ (ein Diagramm je Kennzahl, gemeinsame Zeitachse und gemeinsames Ablesen).
- **Index 100:** Jeder Wert ÷ Wert im ersten Zeitraum, in dem alle indexierten Kennzahlen positiv sind, × 100. Wachstumsraten werden nicht indexiert.

Farben je Platz der Auswahl (`--fu-m0` … `--fu-m3`, hell und dunkel getrennt gestuft und auf Farbsehschwächen geprüft); eine entfernte Kennzahl färbt die übrigen nicht um. „Alle Werte im Vergleich“ zeigt die Tabelle mit Grund je Lücke; „Vergrößern“ öffnet das Diagramm im Dialog.

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

`node --test "fundamental/tests/*.test.mjs"` (Modell, Katalog, Projektion, KGV, Quartalsregel, Routen, Datenpfade, Kennzahlenvergleich) · `scripts/quality/vu3-regression-qa.mjs` (Wege, Theme, Visual-Bausteine, Kontrast) · `scripts/quality/shell-browser-qa.mjs` · `scripts/quality/fundamental-compare-qa.mjs` (Kennzahlenvergleich, WebKit iPhone und Chromium).
