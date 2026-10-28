# V11 – Strang DECOMPOSITION: Warum entsteht kein abgesicherter Vorteil?

**Periode `FULL_DESCRIPTIVE` (Protokoll `time-split-1.0.0`, SHA-256 `1ff32b61…`).** Nach Regel R4 darf der Strang DISCOVERY diese Ergebnisse nicht lesen. `NOT_CERTIFIED`, `productionApproved: false`, `HISTORICAL_DEVELOPMENT_STUDY`. Die Varianten unten dienen nur der Zuordnung von Ursachen. Sie sind keine Kandidaten, und es wurde nichts ausgewählt.

Die Registrierung wurde vor jeder Ergebnisberechnung committet: [registration-1.0.0.json](registration-1.0.0.json) (Hash `f3354b1f…`, Commit `26fc0670b0`). Die Population ist der V10-Lifecycle-Frame mit 4.329 Listings; der Manifest-Hash `2c27039f…` ist identisch mit dem V10-Lauf. Zeitraum der Signale: 2000–2025. Auf beiden Seiten wird die **Kursrendite** verglichen. Kosten: 10 + 5 bps je Seite. Gewichtung: je Ereignis gleich, im Portfolio siehe A3. Ereignisse sind voll investiert. Die finanzierte Strategie hält Slots zu je 1/N, leere Slots liegen in Cash zu 0 %. SPY wird voll investiert als Buy-and-hold geführt.

| Datei | Inhalt |
|---|---|
| [decomposition-results.json](decomposition-results.json) | A1 Zerlegung, A2 Ein-/Ausstieg, Kurve über die Ereigniszeit, A3 Portfoliobau, A4 Kosten, A7 Regime/Zeit, Abweichungen |
| [benchmark-reference-check.json](benchmark-reference-check.json) | A5: unabhängige Python-Referenz, Datums-/Definitionsprüfung, SPY-Ausschüttungen (SEC N-30D), Dividenden der Signal-Titel |
| [power-analysis.json](power-analysis.json) | A6: Standardfehler, N_eff, Mindesteffekt bei 80 % Power, abgesichert ja/nein je Zelle |
| [cause-matrix.json](cause-matrix.json) | A8: Ursachenmatrix je Regel (13 W und 52 W) mit Pp, Anteilen und erklärendem Text |

## Kernaussage

Die beobachtete „Überrendite“ gegenüber SPY ist **überwiegend kein Signal-Effekt**. Sie ist der Abstand zwischen der **gleichgewichteten Survivor-Population** und SPY. Dieser Abstand bestand vor allem 2000–2012 und ist danach verschwunden. Die eigentliche Auswahlqualität (Signal minus Population derselben Woche) liegt bei −0,6 bis +0,5 Pp je 13 W. Bei vier von fünf Regeln ist sie negativ. Der Mindesteffekt, den die Tests überhaupt nachweisen könnten, liegt bei ≈ 10–12 % p. a. Damit ist er 3- bis 10-mal größer als jede beobachtete Überrendite.

## A1 – Additive Zerlegung (Ereignismittel, Pp)

`Ereignisrendite netto = SPY + (Population − SPY) + (Signal − Population) − Kosten`. Die Identität gilt je Zelle exakt (Restfehler < 1e-14). Die SPY-Überschüsse stimmen mit V10 überein (n und Schätzer identisch).

| Regel | h | Roh netto | SPY | Pop − SPY | Signal − Pop | Kosten | SPY-Überschuss | Anteil Population am Brutto-Überschuss |
|---|---|---|---|---|---|---|---|---|
| MOMENTUM_IMPROVED | 13 | 2,79 | 2,31 | +1,09 | −0,30 | 0,31 | +0,48 | 138 % |
| MOMENTUM_DETERIORATED | 13 | 3,18 | 2,55 | +0,97 | −0,03 | 0,31 | +0,64 | 103 % |
| TREND_UP | 13 | 2,40 | 2,20 | +1,10 | **−0,59** | 0,31 | +0,20 | 215 % |
| TREND_DOWN | 13 | 2,62 | 2,60 | +0,70 | −0,37 | 0,31 | +0,02 | 211 % |
| NEW_52W_HIGH | 13 | 3,07 | 1,99 | +0,87 | +0,51 | 0,31 | +1,07 | 63 % |
| MOMENTUM_IMPROVED | 52 | 13,88 | 10,09 | +4,66 | −0,53 | 0,34 | +3,79 | 113 % |
| TREND_UP | 52 | 13,70 | 10,16 | +4,59 | −0,72 | 0,34 | +3,53 | 119 % |
| TREND_DOWN | 52 | 12,30 | 10,08 | +4,36 | −1,80 | 0,34 | +2,22 | 171 % |
| NEW_52W_HIGH | 52 | 12,48 | 9,09 | +3,23 | +0,49 | 0,34 | +3,39 | 87 % |

Holm über 60 Terme (5 Regeln × 4 Horizonte × 3 Terme): **1 Ablehnung**. TREND_UP 13 W, Signal − Population −0,59 Pp, Holm-p 0,03, ist **negativ** abgesichert. Kein Populations- und kein SPY-Term ist abgesichert. Die Reaktionswoche k → k+1 und die Werte ab Delay 0 sind ebenfalls nicht abgesichert. Abstimmung mit V10: Die V10-Basisrate schließt die Signal-Titel aus; der Unterschied zum Term `Signal − Pop` ist ≤ 0,15 Pp.

**Gleichgewichtung/Größe vs. Zusammensetzung (ab 2010, PIT-Marktkapitalisierung):** Ab 2010 ist Population − SPY nahe null (13 W: −0,33 bis +0,07 Pp). Er zerfällt in einen positiven Gleichgewichtungs-/Größeneffekt (+0,13 bis +0,49 Pp je 13 W, +0,9 bis +2,3 Pp je 52 W) und eine **negative** Differenz kapitalgewichtete Frame-Population − SPY (−0,08 bis −0,21 Pp je 13 W). Die Abdeckung (Population mit Marktkapitalisierung gegenüber ganzer Population) trägt −0,25 bis −0,37 Pp bei. Abdeckung der Marktkapitalisierung: 2010 23 %, ab 2012 ≈ 74 %. **Abweichung 1, offengelegt:** Das V10-Faktorpanel enthält grobe XBRL-Skalenfehler bei der Marktkapitalisierung, z. B. `ref_CB` 1,8e16 USD (2010-06), `ref_AEP`, `ref_ON`, `ref_STX`, `ref_AA` ≈ 1e15–1e16, `ref_PKG`/`ref_LTM` > 1e13. Ungefiltert hätten diese Fehler die Kapitalgewichtung dominiert. Nach dem ersten Lauf wurde deshalb ein ergebnisfreier Plausibilitätsfilter ergänzt: Kapitalisierung > 5e12 USD, oder implizite Aktienzahl um mehr als den Faktor 5 vom Median des Listings entfernt. Ausgeschlossen wurden 149 + 9.574 von 370.412 Werten. Die ungefilterten Werte stehen daneben. → **Offener Punkt für den Faktor-Strang/Owner.**

**Zensur/Datenabdeckung:** Die −100-%-Schranke für zensierte Outcomes (V10) verschiebt den SPY-Überschuss um −0,02 bis −0,03 Pp (13 W) bzw. −0,13 bis −0,17 Pp (52 W). Die eigentliche Survivorship-Lücke ist nicht messbar: 2000 sind nur 14 % der 10-K-Melder abgedeckt. Sie wirkt über den Populationsterm.

## A2 – Einstieg, Ausstieg, Haltedauer

- **Einstieg:** Der Vorteil entsteht **vor** dem Signal. 4-Wochen-Anstieg bis zum Signal gegenüber SPY: NEW_52W_HIGH +14,6 Pp, TREND_UP +9,5 Pp, MOMENTUM_IMPROVED +6,7 Pp. Die Reaktionswoche k → k+1, die durch den Einstieg mit einer Woche Verzögerung verpasst wird, ist klein: +0,2 bis −0,2 Pp gegenüber SPY, −0,32 bis +0,24 Pp gegenüber der Population. Delay 0 statt 1 ändert den 13-W-Überschuss um höchstens 0,25 Pp. Delay 2 und 4 ändern ihn nicht systematisch. Eine Einstiegsverzögerung erklärt das fehlende Ergebnis also nicht.
- **Kurve über die Ereigniszeit (gegenüber der Population):** NEW_52W_HIGH baut bis 13 W +0,51 Pp auf und hält bis 52 W +0,49 Pp. Danach dreht die Kurve: 104 W −0,84 Pp. MOMENTUM_IMPROVED, TREND_UP und TREND_DOWN liegen ab Woche 1 unter der Population und fallen bis 104 W auf −1,3 bis −2,7 Pp. Gegenüber SPY steigen alle Kurven monoton. Das ist die Drift der Population.
- **Ausstieg:** Trailing-Stops (15 %/25 %) verschlechtern NEW_52W_HIGH gegenüber der Population: +0,4/+0,7 statt +1,5 Pp p. a. bei festem 13-W-Ausstieg (EW-Index). Bei den übrigen Regeln fällt der Wert weniger negativ aus als fix 13 W, bleibt aber negativ (−1,0 bis −2,1 Pp p. a.). Der Ausstieg beim Gegensignal liegt bei MOMENTUM_IMPROVED, TREND_UP und NEW_52W_HIGH über dem festen 13-W-Ausstieg (+1,0 bis +2,7 Pp p. a. gegenüber dem wöchentlich rebalancierten EW-Index). Nach Holm (50 Zellen) ist das **nicht abgesichert**. Abgesichert ist allein der negative Wert von TREND_UP fix 13 W gegenüber der Population. Der EW-Index (wöchentlich rebalanciert) liegt ≈ 0,2 Pp je 13 W über dem Buy-and-hold-Mittel der Population; das ist offengelegt.

## A3 – Portfoliobau der finanzierten Strategie (13 W, `research-portfolio`)

Der V10-Pfad wird exakt reproduziert (`resultHash` identisch für alle drei Regeln). Die Pfade mit N = 20 und 50 überschreiten das Operationsbudget der Engine. Sie laufen über einen Replica-Ledger (**Abweichung 2**). Parität zur Engine auf 60 Pfaden: CAGR-Differenz ≤ 5e-15.

| Regel | Hash-Pfad CAGR | 200 Zufalls-Tiebreaks: CAGR Median (p5–p95) | Anteil Pfade > SPY | Strategie − EW-Index (Hash / Median) |
|---|---|---|---|---|
| MOMENTUM_IMPROVED | 7,7 % | 5,6 % (1,4–9,9) | 46 % | −5,9 / −8,0 Pp |
| TREND_UP | 11,1 % | 6,3 % (1,7–10,5) | 56 % | −2,5 / −7,3 Pp |
| NEW_52W_HIGH | 16,4 % | 14,5 % (9,5–22,5) | 99 % | +2,8 / +0,9 Pp |

SPY-Kursrendite: 5,9 % CAGR. **Gleichgewichteter Frame-Index im selben Zeitraum: 13,6 % CAGR** (wöchentlich rebalanciert, ohne Kosten; Zusatzdiagnose, nicht registriert). Von den +10,5 Pp der NEW_52W_HIGH-Strategie gegenüber SPY stammen damit ≈ 7,7 Pp aus der Population, also aus der Gleichgewichtung der Survivor-Kohorte. Der Hash-Pfad von MOMENTUM_IMPROVED und TREND_UP lag zufällig im oberen Teil der Verteilung (Perzentil 79 % bzw. 97 %). Positionszahl 5/20/50: NEW_52W_HIGH 15,6 %/13,6 %/13,6 %; mit N = 50 ist die Streuung der Pfade klein (p5–p95 11,4–14,6 %). Volatilitätsgewichtung senkt die CAGR bei allen Regeln (NEW_52W_HIGH 13,7 %). Cash-Drag: investiert sind 98,8 % (EQUAL) gegenüber 99,7 % (voll investiert). Das ist unerheblich. Turnover: ≈ 4,2–4,8 × p. a. (einseitig). Kosten-Drag: 1,26–1,44 % p. a. Übersprungene Signale: 97,5 % (N 10), 87,8 % (N 50).

## A4 – Kosten

Break-even-Kosten je Seite auf Ereignisebene, bei denen der SPY-Überschuss null ist: 13 W bei 16–67 bps, 52 W bei 115–184 bps. Gegenüber der Population sind die Kosten symmetrisch; die Basisrate ist deshalb in erster Näherung kostenneutral. Finanziert, mit Excess-CAGR = 0: MOMENTUM_IMPROVED 35 bps, TREND_UP 71 bps, NEW_52W_HIGH 123 bps je Seite. Das unadjustierte p der NEW_52W_HIGH-Strategie gegenüber SPY überschreitet 0,05 ab ≈ 38 bps je Seite. Bei 20 + 30 bps ergibt sich p = 0,07, wie in V10.

## A5 – Benchmark und Renditedefinition

- **Python-Referenz** (`verify_decomposition.py`, stdlib, `python3 -I`, eigene Implementierung aus den Rohreihen): Alle A1-Terme für 13 und 52 W und alle Einstiegsverzögerungen stimmen überein (max. Abweichung 5,6e-15, alle n gleich). Die finanzierte NEW_52W_HIGH-Strategie stimmt ebenfalls (CAGR-Differenz 3e-15). Sitzungsdaten von Strategie und SPY sind identisch (1.370 Wochen, 2000-01-07 bis 2026-04-02). Beide Seiten sind Kursrendite und vom Anbieter split-bereinigt. Kosten fallen nur auf der Strategieseite an. Die Strategie ist im Mittel zu 98,8 % investiert, SPY zu 100 %. Zwei Befunde der Gegenrechnung: (a) Python ≥ 3.12 summiert in `sum()` kompensiert. An SMA-Gleichstandsgrenzen ändert das 1–5 TREND-Ereignisse; die Referenz nutzt deshalb einfache Addition. (b) Konventionsunterschied in V10: `research-portfolio` rechnet mit Jahren zu 365,25 Tagen, `weekly-benchmark.compare` mit 365,2425 Tagen. Die Wirkung auf die Excess-CAGR liegt bei ≈ 1e-6.
- **SPY-Dividenden (Quelle):** Sechs Jahresberichte N-30D des SPDR S&P 500 ETF Trust, CIK 884394, mit Akzession, URL, SHA-256 und Zitat. Die NAV-Kette der Geschäftsjahre 1999–2025 ist konsistent (26/26). Mittlere Ausschüttungsrendite GJ 2000–2025: **1,87 % p. a.** Annähernde NAV-Gesamtrendite 8,41 % gegenüber NAV-Kursrendite 6,54 % p. a.
- **Dividenden der Signal-Titel (Größenordnung, 2010+):** 1,30 % (NEW_52W_HIGH) bis 1,54 % (TREND_UP) p. a., Population 1,44 %, SPY 1,96 %. Der Vergleich Kurs gegen Kurs **begünstigt die Regeln gegenüber SPY um ≈ 0,4–0,7 Pp p. a.** (0,10–0,16 Pp je 13 W). Mit Gesamtrendite auf beiden Seiten (Schätzung) sinkt der Überschuss der NEW_52W_HIGH-Strategie von 10,5 auf ≈ 9,9 Pp p. a. Für 2000–2009 liegen keine Dividenden der Signal-Titel vor. Für ≈ 35 % der Ereignisse ist die Rendite unbekannt (ausgeschlossen, gezählt).

## A6 – Power

Die effektive Stichprobe ist klein. Die Kalenderabhängigkeit (alle Ereignisse einer Woche bewegen sich gemeinsam, überlappende Fenster) reduziert N_eff auf **1–9 %** der Ereigniszahl (13 W: 2–4 %). Mindesteffekt für 80 % Power im ungünstigsten Holm-Schritt (Familie 60): SPY-Überschuss 13 W ≈ 2,4–3,1 Pp, also **≈ 9,5–12,4 % p. a.** Bei 52 W liegt er bei 10,8–13,1 % p. a. Alle 20 SPY-Zellen sind „beobachtet, nicht abgesichert, unter dem Mindesteffekt“. Finanziert (Familie 3) liegt der Mindesteffekt bei 9–22 % p. a. Nur NEW_52W_HIGH ist gegenüber SPY abgesichert (N 10/50, vol., voll investiert), und dieser Überschuss ist größtenteils Populationseffekt (A3). Die V10-Familie: 7 abgesichert, 7 groß aber nicht abgesichert, 46 unter dem Mindesteffekt.

## A7 – Regime und Zeit

Der Rückgang des NEW_52W_HIGH-SPY-Überschusses (13 W) von +5,08 Pp (2000–07) auf −0,70 Pp (2020–25) ist zu **90 % Benchmark/Population**: Pop − SPY fällt von +4,49 auf −0,72 Pp. Der Auswahlterm bleibt positiv: +0,91, −0,30, +0,80 und +0,33 Pp in den vier Teilperioden. Bei den übrigen Regeln erklärt Pop − SPY 119–163 % des Rückgangs; die Auswahl verbessert sich sogar leicht. Es gibt also **keinen Effektverfall der Auswahl**. Was zerfällt, ist der Vorsprung der gleichgewichteten Survivor-Population gegenüber SPY. Protokollperioden (deskriptiv), NEW_52W_HIGH 13 W, SPY-Überschuss / Pop − SPY / Auswahl: TRAIN +3,24 / +3,15 / +0,40; VALIDATION +0,57 / +0,16 / +0,72; TEST −0,90 / −1,04 / +0,45 Pp. Regime: In Phasen mit negativem SPY-Trend ist Pop − SPY groß (+3 bis +5 Pp je 13 W), und dort ist die Auswahl bei den Momentum- und Trendregeln am schlechtesten (−0,5 bis −1,4 Pp). Population: Die eligiblen Listings je Woche stiegen von 1.274 (2000) auf 3.851 (2025). Der Anteil junger Titel (< 3 Jahre im Datensatz) blieb bei 4–11 %. Das mediane Kap.-Perzentil der NEW_52W_HIGH-Ereignisse stieg von 0,47 (2010) auf 0,56–0,58 (2020/2025). Ein Zustrom kleiner oder junger Titel ist damit **nicht** die Ursache.

## A8 – Ursachenmatrix (13 W, Anteil an den additiven Beiträgen)

| Regel | Auswahl | Benchmark/Population | Kosten | Dividenden (Schätzung) | Unsicherheit (Mindesteffekt, Pp je 13 W) |
|---|---|---|---|---|---|
| MOMENTUM_IMPROVED | −0,30 (17 %) | +1,09 (60 %) | −0,31 (17 %) | −0,11 (6 %) | 3,10 |
| MOMENTUM_DETERIORATED | −0,03 (2 %) | +0,97 (68 %) | −0,31 (22 %) | −0,13 (9 %) | 2,71 |
| TREND_UP | −0,59 (28 %, abgesichert negativ) | +1,10 (52 %) | −0,31 (15 %) | −0,10 (5 %) | 3,03 |
| TREND_DOWN | −0,37 (24 %) | +0,70 (46 %) | −0,31 (20 %) | −0,14 (9 %) | 2,37 |
| NEW_52W_HIGH | +0,51 (27 %) | +0,87 (47 %) | −0,31 (17 %) | −0,16 (9 %) | 2,88 |

Die nicht additiven Diagnosen stehen in `cause-matrix.json`: Einstieg, Ausstieg/Haltedauer, Gewichtung/Tiebreak und Datenabdeckung, jeweils mit erklärendem Text je Zeile.

**Fazit je Regel.** NEW_52W_HIGH hat als einzige Regel eine positive Auswahl (+0,5 Pp/13 W ≈ 2 % p. a.). Diese liegt deutlich unter dem nachweisbaren Mindesteffekt. Der große finanzierte Vorsprung ist überwiegend die Survivor-/Gleichgewichtungsprämie von 2000–2012 und nicht kostenrobust. MOMENTUM_IMPROVED, TREND_UP und TREND_DOWN wählen schlechter als die Population. Ihr „Überschuss“ gegenüber SPY ist vollständig Populationseffekt. MOMENTUM_DETERIORATED ist neutral.

## Grenzen und Reproduktion

- Survivor-Universum; Kursrendite; SPY-Gesamtrendite und Dividenden der Signal-Titel sind Schätzungen. Die Kapitalgewichtung stützt sich auf ein fehlerbehaftetes Panel (Abweichung 1). Der EW-Index ist eine Zusatzdiagnose. Eine zweite Programmiersprache ist kein Holdout.
- Ablauf: `node scripts/quant/v11/decomposition/events.cjs --out <priv> --factor-panel <panel.jsonl.gz>` (≈ 6 min) · `portfolio.cjs --out <priv>` (1.440 Läufe, ≈ 22 min, 3 Worker) · `population-index.cjs` · `python3 -I spy_distributions.py <root> <cache> <out> [--fetch]` · `python3 -I dividends_signal.py …` (≈ 5 min) · `python3 -I verify_decomposition.py …` (≈ 1,5 min) · `assemble.cjs --run <priv> --out docs/quant-recovery/v11/decomposition`. Tests: `node --test quant/tests/v11-decomposition.test.mjs`.
- SEC-Abrufe: 8 (2 × Einreichungsliste/companyfacts für SPY, 6 × N-30D), ≤ 2/s über `http_client.py`. Den privaten Cache gibt es nur im Scratchpad.
