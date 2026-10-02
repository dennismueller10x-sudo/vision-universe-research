# Technische Evidenz — Ergebnisse der VU-Studie

Methodik: `BACKTEST_METHODOLOGY.md`. Rohberichte: `quant/data/technical-intelligence/evidence/`. Alle Zahlen aus dem Lauf vom 02.10.2026 (Methodik `technical-intelligence-v2.0.0`, eingefroren). **Survivorship-Hinweis:** nur heute gelistete Titel — absolute Quoten können überhöht sein; Vergleiche gegen die Zufalls-Baseline sind davon weniger betroffen, weil die Baseline aus denselben Titeln stammt.

## 1. Datenbasis

| Studie | Universum | Zeitraum | Erkennungszeitpunkte | Szenarien | gefüllte Einstiege |
|---|---|---|---|---|---|
| Wochenuniversum | 6.348 Wochenschluss-Reihen (5.110 mit Ereignissen; 1.056 zu kurz) | 1993-01 – 2026-09 | 206.481 | 186.892 | **102.694** |
| Tages-Referenz | 5 Titel (AAPL, JPM, MSFT, NVDA, XOM), OHLCV | 2015-10 – 2026-09 | 351 | 320 | 213 |

## 2. Kernfrage: Erreicht das Hauptszenario Zielzone 1 vor der Invalidation?

| Zeitraum | n | Ziel 1 erreicht | Zufall, gleiche Geometrie | Lift (95 %-KI) | Ø Rendite je Signal nach Kosten |
|---|---|---|---|---|---|
| TRAIN (< 2013) | 41.335 | 42,0 % | 39,3 % | **+2,8 pp** (+2,2 … +3,3) | −0,1 % |
| VALIDATION (2013–18) | 18.557 | 42,3 % | 41,4 % | +0,9 pp (+0,1 … +1,7) | +0,6 % |
| **TEST (≥ 2019, einmalig)** | **42.802** | **41,9 %** | **40,1 %** | **+1,8 pp (+1,3 … +2,4)** | **−0,8 %** |
| Gesamt | 102.694 | 42,1 % | 40,0 % | +2,0 pp (+1,7 … +2,4) | −0,3 % |

Weitere Kennzahlen (gesamt): Füllquote 55,6 % (fast jede zweite Einstiegszone wird nicht erreicht), Invalidationsquote 51,0 %, Ziel 2 erreicht 23,9 %, Median-Dauer bis Ziel 1 **6 Wochen** (mittlere Hälfte 3–11 Wochen), Median-Risiko 8,8 %, Median-Abstand zu Ziel 1 13,5 %, Median MFE 0,74 R, MAE 1,02 R.

**Lesart:** Das Timing der Szenarien ist statistisch signifikant, aber nur geringfügig besser als Zufall mit derselben Geometrie; nach Kosten entsteht im Mittel kein Ertrag. Das Produkt stellt Szenarien deshalb als **Einordnung** dar, nicht als Signal — und zeigt diese Zahlen offen.

## 3. Segmente (gesamt, n ≥ 200)

| Segment | n | Ziel 1 | Zufall | Lift |
|---|---|---|---|---|
| Fortsetzung bullish | 35.754 | 46,1 % | 44,3 % | +1,8 |
| Rücksetzer bullish | 24.238 | 41,0 % | 39,7 % | +1,3 |
| Fortsetzung bearish | 25.304 | 40,2 % | 37,0 % | +3,2 |
| Rücksetzer bearish | 13.952 | 35,8 % | 33,8 % | +2,0 |
| Ausbruch/Rücktest bullish | 2.272 | 47,9 % | 47,5 % | +0,4 (n.s.) |
| Marktregime Risk-on, bullish | 35.002 | 43,5 % | 42,5 % | +1,0 |
| Marktregime Risk-off, bullish | 8.470 | 46,2 % | 42,1 % | **+4,1** |
| Marktregime Risk-off, bearish | 8.239 | 34,5 % | 30,5 % | **+4,1** |
| Volatilität extrem | 14.975 | 40,8 % | 37,3 % | +3,5 |
| Volatilität ruhig | 14.208 | 44,0 % | 42,3 % | +1,7 |
| Sektor Finanzen (SIC H) | 20.566 | 41,9 % | 38,1 % | +3,8 |
| Sektor Industrie (SIC D) | 39.302 | 41,8 % | 40,9 % | +0,9 |

Bearische Szenarien haben niedrigere absolute Quoten und negative Ø-Renditen (Survivorship + Aufwärtsdrift der Aktien), aber einen ähnlichen Lift. Marktregime: SPY-26-Wochen-Rendite > +5 % = Risk-on, < −5 % = Risk-off.

## 4. Konfidenz — ist sie aussagekräftig?

| Label | n | Ziel 1 | Zufall |
|---|---|---|---|
| Hoch | 23.154 | 41,8 % | 39,7 % |
| Mittel | 64.367 | 42,2 % | 40,2 % |
| Niedrig | 15.173 | 41,8 % | 39,9 % |

| Einigkeit (Agreement) | n | Ziel 1 | Zufall | Lift |
|---|---|---|---|---|
| hoch | 58.123 | 42,1 % | 39,9 % | +2,2 |
| mittel | 35.040 | 42,0 % | 40,2 % | +1,8 |
| niedrig | 9.531 | 42,1 % | 40,1 % | +2,0 |

**Befund: Die Labels unterscheiden die Trefferquote nicht.** Hohe Einigkeit bedeutet nicht mehr Treffer, weil die Geometrie (Zonenabstände) sich anpasst. Konsequenzen im Produkt: (1) das Label heißt „Einigkeit der Verfahren" und wird als Übereinstimmung erklärt, nicht als Treffersicherheit; (2) der Fußtext sagt ausdrücklich, dass die Trefferquote nicht messbar davon abhing; (3) keine Prozentwerte. Kalibrierung (Abschnitt 7) folgerichtig nicht bestanden.

## 5. Ablation: Richtungsinformation je Methodenfamilie

Anteil, in dem das Vorzeichen der Familie das Vorzeichen der Rendite nach 13 Wochen trifft (alle Erkennungszeitpunkte).

| Familie | gesamt | TEST | Ø vorzeichenbereinigte Rendite (TEST) |
|---|---|---|---|
| Konfluenz | 52,0 % | 51,7 % | −6,5 % |
| Konfluenz stark (|A| ≥ 0,5) | 52,7 % | 51,8 % | −4,4 % |
| Trend | 51,9 % | 51,8 % | −6,2 % |
| Momentum | 51,4 % | 50,6 % | −4,8 % |
| Struktur | 51,4 % | 50,8 % | 0,0 % |
| Chartformation | 51,1 % | 50,2 % | +0,9 % |
| Elliott | 50,6 % | **50,0 %** | −5,3 % |
| Immer long | 52,2 % | 50,4 % | **+9,8 %** |
| Konfluenz ohne Elliott | 52,0 % | 51,8 % | — |
| Konfluenz ohne Trend | 51,9 % | 50,8 % | — |

**Lesart:** Keine Familie liefert eine wirtschaftlich nutzbare Richtungsprognose auf Wochenbasis; Trend und Konfluenz liegen knapp über 50 %, verlieren aber gegen „immer long" in der Rendite (bearische Signale in einem steigenden Markt 2019–2026). Elliott trägt zur Richtung nichts bei (Entfernen ändert die Konfluenz nicht). Das bestätigt die Literatur (Park & Irwin 2007; Sullivan et al. 1999) und rechtfertigt die niedrigen Gewichte.

Bedingte Trefferquote Ziel 1, wenn eine Familie das Hauptszenario **stützt** vs. **widerspricht**: Momentum 42,1 % vs. 40,1 %; Chartformation 43,0 % vs. 40,6 %; Elliott 42,2 % vs. 41,7 %; Struktur 41,6 % vs. 43,0 % (umgekehrt!).

## 6. Empirisches Elliott (Wochenuniversum, erste Erkennung je Zählung)

| Setup | n | Lehrbuch-Erwartung erfüllt | Zufall, gleiche Abstände | Lift (KI-Untergrenze) | TEST-Lift |
|---|---|---|---|---|---|
| Nach Welle 2: W3 übersteigt W1 | 29.001 | 89,0 % | 86,9 % | +2,1 (+1,7) | +3,0 |
| Nach Welle 4: W5 übersteigt W3 | 19.147 | 83,6 % | 83,6 % | 0,0 | −0,6 |
| **Zigzag nach B: C übersteigt A** | 14.302 | 66,0 % | 57,2 % | **+8,8 (+7,9)** | **+9,7** |
| Flat nach B: C übersteigt A | 31.042 | 54,8 % | 52,8 % | +2,0 (+1,3) | +2,9 |

Extensionen nach W2 (vor Invalidation, 52 Wochen): W3 erreicht 1,0×W1 in 62 %, **1,618×W1 in 39 %**, 2,618×W1 in 21 % (Median 5 bzw. 11 Wochen). Nach W4: W5 = 0,618×W1 in 75 %, = W1 in 63 %. Hohe Rohquoten (89 %) sind überwiegend **Geometrie**: bei Erkennung (Bestätigung des W2-Tiefs) ist das W1-Ende oft nah, die Invalidation fern.

**Multi-Degree-Befunde:**

| Kontext | Setup | n | erfüllt | Zufall | Lift |
|---|---|---|---|---|---|
| höherer Grad konsistent | Zigzag-C | 11.201 | 72,1 % | 60,6 % | **+11,5** |
| höherer Grad neutral | Zigzag-C | 3.101 | 43,8 % | 45,5 % | −1,7 |
| höherer Grad im Konflikt | W3 nach W2 | 711 | 61,6 % | 83,8 % | **−22,2** |
| höherer Grad im Konflikt | W5 nach W4 | 1.204 | 55,9 % | 76,2 % | **−20,3** |
| Unterteilung konsistent | W3 nach W2 | 7.677 | 85,8 % | 87,6 % | −1,7 |
| Unterteilung nicht aufgelöst | W3 nach W2 | 17.182 | 89,8 % | 85,8 % | +4,1 |

**Lesart:** Der übergeordnete Grad ist der wertvollste Elliott-Baustein (Konflikt mit dem höheren Grad = deutlich unterdurchschnittlich). Die sichtbare 5/3-Unterteilung brachte **keinen** Mehrwert — ein ehrlicher Negativbefund für die V2-Neuerung; ihr Ranggewicht wird in V2.1 (neuer Testzeitraum) reduziert, der höhere Grad erhöht. Klarheit (Rangabstand) unterscheidet die Erfüllungsquote kaum.

## 7. Kalibrierung

Zellen-Trefferquoten (TRAIN) vs. Beobachtung (TEST, n = 42.802): vorhergesagt 34,4 / 36,6 / 41,8 / 45,6 / 48,5 % → beobachtet 38,6 / 40,7 / 41,1 / 43,2 / 46,0 %. Brier 0,2440 vs. konstant 0,2435 (Skill −0,2 %). **Gate nicht bestanden → keine Wahrscheinlichkeiten im Produkt.**

## 8. Fibonacci

319.843 bestätigte Gegenbewegungen (Wochen): Verhältnis „genau am Niveau" zu „knapp daneben" (±1 pp-Bänder) — 38,2 %: **0,97**; 50 %: **1,05**; 61,8 %: **0,99**; 78,6 %: **0,97**. Keine Häufung von Wendepunkten an Fibonacci-Niveaus. Konsistent mit Tsinaslanidis et al. (2022). Fibonacci wirkt im Produkt nur als Konfluenz mehrerer Anker.

## 9. Tages-Referenz (5 Titel)

213 gefüllte Einstiege: Ziel 1 57,3 % vs. Zufall 55,2 % (Lift +2,0 pp, KI −5,7 … +9,7 — **nicht belastbar**). Median 13 Handelstage bis Ziel 1. Wochen- und Tageschart gleichgerichtet: 159 Fälle, 58,5 % vs. 59,5 %. Die Tagesstudie über das ganze Universum läuft in CI (`technical-intelligence-evidence.yml`), sobald gestartet.

## 10. Konsequenzen für das Produkt

1. Keine Prozent-Wahrscheinlichkeiten; historische Häufigkeiten immer **mit** Zufallsvergleich.
2. „Einigkeit der Verfahren" statt „Konfidenz" als Hauptlabel; Erklärung, dass sie keine Treffersicherheit misst.
3. Fibonacci und Wyckoff nur beschreibend/konfluent.
4. Elliott: Geometrie (Zonen, Invalidation) und Struktur-Erklärung; Hinweis auf Konflikt mit dem höheren Grad ist wertvoller als die Klarheit.
5. Typische Dauer (Wochen/Handelstage) nur aus empirischen Quartilen, nie aus Fibonacci-Zeitrelationen.
