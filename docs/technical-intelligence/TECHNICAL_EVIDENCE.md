# Technische Evidenz — Ergebnisse der VU-Studie

Methodik: `BACKTEST_METHODOLOGY.md`. Rohberichte: `quant/data/technical-intelligence/evidence/`. Alle Zahlen aus dem **korrigierten** Lauf vom 02.10.2026 (Methodik `technical-intelligence-v2.0.0`, eingefroren; Regelwerk `elliott-rules-2.0.1`). **Survivorship-Hinweis:** nur heute gelistete Titel — absolute Quoten können überhöht sein; Vergleiche gegen die Zufalls-Baseline sind davon weniger betroffen, weil die Baseline aus denselben Titeln stammt.

## 0. Protokoll: erster Lauf vs. korrigierter Lauf

Ein adversarialer Review nach dem ersten TEST-Lauf fand **Messfehler**, die das Ergebnis geschönt hatten (Liste: `quant/methodology/technical-intelligence-v2.json → protocol.postFreezeMeasurementFixes`). Die wichtigsten:

1. Eine Zonenberührung, deren Bar jenseits der Invalidation schloss, wurde als „kein Einstieg" verworfen statt als Verlust gezählt.
2. Die Baseline zählte Hoch/Tief der Einstiegsbar mit, obwohl der Einstieg zum Schluss erfolgte (Baseline zu günstig — wirkte gegenläufig zu 1).
3. Die Elliott-Studie enthielt 41.830 Fälle, deren Kurs bei Erkennung **bereits jenseits** des Bestätigungsniveaus lag — trivial „bestätigt".

Kein Parameter, Gewicht oder Schwellwert wurde verändert. Der TEST-Zeitraum ist damit **zweimal angesehen**.

| Kennzahl (TEST ≥ 2019) | erster Lauf (fehlerhaft) | korrigiert |
|---|---|---|
| gefüllte Einstiege | 42.802 | 45.328 |
| Ziel 1 erreicht | 41,9 % | **35,4 %** |
| Zufall, gleiche Geometrie | 40,1 % | **35,5 %** |
| Lift (95 %-KI) | +1,8 pp (+1,3 … +2,4) | **−0,2 pp (−0,7 … +0,3)** |
| Elliott Zigzag-C, Lift | +8,8 pp | **−2,3 pp** |
| Elliott W3 nach W2, Lift | +2,1 pp | **−12,0 pp** |

**Der im ersten Lauf berichtete kleine Vorteil war ein Messartefakt.**

### 0b. Nachlauf mit Elliott-Engine 2.2 und Elliott-Gewicht 0 (Mission II)

Nach der vorab registrierten Elliott-Entscheidung (`PREREGISTRATION.md`, `protocol.elliottDecision`: Elliott = Kontext, Konfluenzgewicht 0) wurde die Szenario-Studie **unverändert** erneut gerechnet — keine Parameter, Schwellen oder Gewichte außer dem vorab festgelegten Elliott-Gewicht wurden angefasst. Der TEST-Zeitraum ist damit **dreimal angesehen**; der Nachlauf dient nur der Dokumentation des ausgelieferten Zustands, nicht der Auswahl.

| Zeitraum | n | Ziel 1 | Zufall | Lift (95 %-KI) | Ø Rendite je Signal |
|---|---|---|---|---|---|
| TRAIN (< 2013) | 44.062 | 36,5 % | 35,3 % | +1,2 pp (+0,7 … +1,7) | +0,0 % |
| VALIDATION (2013–18) | 20.025 | 37,1 % | 38,3 % | −1,2 pp (−2,0 … −0,5) | +0,5 % |
| **TEST (≥ 2019)** | **46.544** | **35,6 %** | **35,9 %** | **−0,4 pp (−0,9 … +0,2)** | **−2,3 %** |

Richtungs-Ablation im Holdout (Richtung nach 13 Wochen korrekt): Trend 52,0 % (51,6 … 52,3), Momentum 50,5 %, Struktur 50,9 %, Muster 50,1 %, Konfluenz 51,9 % — gegen 50,3 % „immer long" mit +8,4 % mittlerer Rendite; die vorzeichenbehafteten Renditen aller Methoden liegen darunter. Kalibrierung weiterhin nicht bestanden. **Der Elliott-Wegfall ändert das Gesamtbild nicht: kein messbarer Szenario-Vorteil.**

## 1. Datenbasis

| Studie | Universum | Zeitraum | Erkennungszeitpunkte | Szenarien | gefüllte Einstiege |
|---|---|---|---|---|---|
| Wochenuniversum | 6.348 Wochenschluss-Reihen (5.110 mit Ereignissen; 1.056 zu kurz) | 1993-01 – 2026-09 | 208.100 | 188.143 | **107.754** |
| Tages-Referenz | 5 Titel (AAPL, JPM, MSFT, NVDA, XOM), OHLCV | 2015-10 – 2026-09 | 351 | 320 | 215 |

## 2. Kernfrage: Erreicht das Hauptszenario Zielzone 1 vor der Invalidation?

Stand: Nachlauf Engine 2.2, Elliott-Gewicht 0 (§0b). Die Zahlen des korrigierten Laufs mit Elliott-Gewicht > 0 (TEST n = 45.328, 35,4 % vs. 35,5 %) stehen in §0.

| Zeitraum | n | Ziel 1 erreicht | Zufall, gleiche Geometrie | Lift (95 %-KI) | Ø Rendite je Signal nach Kosten |
|---|---|---|---|---|---|
| TRAIN (< 2013) | 44.062 | 36,5 % | 35,3 % | +1,2 pp (+0,7 … +1,7) | +0,0 % |
| VALIDATION (2013–18) | 20.025 | 37,1 % | 38,3 % | −1,2 pp (−2,0 … −0,5) | +0,5 % |
| **TEST (≥ 2019)** | **46.544** | **35,6 %** | **35,9 %** | **−0,4 pp (−0,9 … +0,2)** | **−2,3 %** |
| Gesamt | 110.631 | 36,2 % | 36,1 % | +0,1 pp (−0,2 … +0,4) | −0,9 % |

Weitere Kennzahlen (gesamt): Füllquote 58,6 % (41 % der Einstiegszonen werden nie erreicht), Invalidationsquote 57,5 %, Ziel 2 erreicht 20,4 %, Median-Dauer bis Ziel 1 **6 Wochen** (mittlere Hälfte 3–11 Wochen), Median-Risiko 7,8 %, Median-Abstand zu Ziel 1 14,8 %, Median MFE 0,72 R, MAE 0,98 R. Martingal-Erwartung b/(a+b): 35,1 %.

**Lesart:** Außerhalb der Entwicklungsdaten (VALIDATION, TEST) treffen die Hauptszenarien ihre Zielzone **nicht messbar häufiger** als zufällig gewählte Zeitpunkte mit denselben Abständen. Der kleine TRAIN-Vorteil generalisiert nicht. Nach Kosten entsteht im Mittel kein Ertrag. Das Chartbild ist damit **Einordnung** (Struktur, Zonen, Grenzen, Szenarien), kein Signalgeber — und das Produkt sagt das (Methodikseite und Evidenzbox je Aktie).

## 3. Segmente (gesamt, n ≥ 1.000; beschreibend, nicht für Mehrfachtests korrigiert)

| Segment | n | Ziel 1 | Zufall | Lift (KI) |
|---|---|---|---|---|
| Fortsetzung bullish | 29.867 | 40,4 % | 40,5 % | −0,1 (−0,7 … +0,6) |
| Rücksetzer bullish | 34.607 | 36,9 % | 37,2 % | −0,3 (−0,9 … +0,3) |
| Fortsetzung bearish | 22.270 | 34,2 % | 32,9 % | +1,3 (+0,6 … +2,1) |
| Rücksetzer bearish | 20.467 | 30,7 % | 30,7 % | 0,0 (−0,7 … +0,7) |
| Ausbruch/Rücktest bullish | 2.235 | 40,5 % | 41,7 % | −1,2 (−3,6 … +1,1) |
| Marktregime Risk-off, bullish | 9.211 | 39,4 % | 36,6 % | +2,8 (+1,6 … +3,9) |
| Marktregime Risk-off, bearish | 8.752 | 29,4 % | 27,2 % | +2,3 (+1,2 … +3,4) |
| Marktregime Risk-on, bullish | 37.231 | 38,3 % | 39,3 % | −1,0 (−1,6 … −0,5) |
| Volatilität extrem | 16.397 | 35,7 % | 33,6 % | +2,2 (+1,3 … +3,0) |
| Volatilität komprimiert | 15.458 | 36,6 % | 37,7 % | −1,1 (−2,0 … −0,3) |
| Sektor Finanzen (SIC H) | 22.005 | 36,8 % | 34,5 % | +2,2 (+1,5 … +2,9) |
| Sektor Industrie (SIC D) | 42.347 | 35,9 % | 36,9 % | −1,0 (−1,6 … −0,5) |

Auffällig und über beide Neuberechnungen stabil: **Risk-off-Phasen und extreme Volatilität** (+2,2 bis +2,8 pp; im Lauf mit Elliott-Gewicht +2,4 bis +3,1). Das ist eine Hypothese für einen **neuen** Holdout, kein Produktversprechen (Mehrfachvergleiche, korrelierte Signale, Segmente nach Ansicht der Daten gewählt).

## 4. Strukturklarheit (vormals „Konfidenz") — ist sie aussagekräftig?

| Label | n | Ziel 1 | Zufall | Lift (KI) |
|---|---|---|---|---|
| Hoch | 40.676 | 36,6 % | 36,2 % | +0,3 (−0,2 … +0,9) |
| Mittel | 55.609 | 36,3 % | 36,1 % | +0,2 (−0,3 … +0,6) |
| Niedrig | 14.346 | 34,9 % | 35,7 % | −0,7 (−1,6 … +0,2) |

| Einigkeit (Agreement) | n | Ziel 1 | Zufall | Lift (KI) |
|---|---|---|---|---|
| hoch | 69.491 | 36,6 % | 36,3 % | +0,3 (−0,1 … +0,7) |
| mittel | 33.055 | 35,9 % | 35,8 % | +0,2 (−0,4 … +0,8) |
| niedrig | 8.085 | 34,2 % | 35,8 % | −1,7 (−2,9 … −0,5) |

**Befund unverändert: Die Labels unterscheiden die Trefferquote praktisch nicht** (einzige Ausnahme: geringe Einigkeit leicht schlechter). Konsequenzen im Produkt: „Einigkeit der Verfahren" wird als Übereinstimmung erklärt, nicht als Treffersicherheit; keine Prozentwerte.

## 5. Ablation: Richtungsinformation je Methodenfamilie

Anteil, in dem das Vorzeichen der Familie das Vorzeichen der Rendite nach 13 Wochen trifft (Elliott-Gewicht 0; Elliott hat daher keine eigene Richtungsstimme mehr — im Lauf davor: 50,1 % im TEST, −4,6 %).

| Familie | gesamt | TEST | Ø vorzeichenbereinigte Rendite (TEST) |
|---|---|---|---|
| Konfluenz | 52,0 % | 51,9 % | −4,9 % |
| Konfluenz stark (|A| ≥ 0,5) | 52,6 % | 51,9 % | −1,5 % |
| Trend | 51,9 % | 52,0 % | −4,8 % |
| Momentum | 51,3 % | 50,5 % | −3,7 % |
| Struktur | 51,4 % | 50,9 % | +1,6 % |
| Chartformation | 51,0 % | 50,1 % | +0,8 % |
| Immer long | 52,2 % | 50,3 % | **+8,4 %** |
| Konfluenz ohne Trend | 51,9 % | 50,9 % | −1,0 % |

Keine Familie liefert eine wirtschaftlich nutzbare Richtungsprognose auf Wochenbasis; Elliott trägt zur Richtung nichts bei. Konsistent mit Park & Irwin (2007) und Sullivan et al. (1999).

Bedingte Trefferquote Ziel 1, wenn eine Familie das Hauptszenario **stützt** vs. **widerspricht**: Momentum 36,6 % vs. 33,3 %; Chartformation 37,3 % vs. 33,8 %; Trend 36,1 % vs. 33,8 % (n = 151); Elliott 36,3 % vs. 35,7 %; Struktur 35,6 % vs. 37,2 % (umgekehrt).

## 6. Empirisches Elliott (Wochenuniversum, erste Erkennung je Zählung) — historisch, Engine 2.1

> **Abgelöst** durch die vorab registrierte Studie in `ELLIOTT_VALIDATION_REPORT.md` (engine-unabhängige Ereignisse, Walk-forward, Cluster-Bootstrap, Holm). Die Tabellen unten stammen aus dem korrigierten Lauf mit Engine 2.1 und bleiben als Protokoll stehen. Insbesondere der Befund „höherer Grad relativ aussagekräftig" wurde als H4 vorab geprüft und **nicht bestätigt** (Bestätigung +2,3 Pp., KI −0,5 … +5,4; Replikation −0,6 Pp.).

Ausgeschlossen: 41.830 Fälle, deren Kurs bei Erkennung schon jenseits des Bestätigungsniveaus lag.

| Setup | n | Lehrbuch-Erwartung erfüllt | Zufall, gleiche Abstände | Lift (KI-Obergrenze < 0?) |
|---|---|---|---|---|
| Nach Welle 2: W3 übersteigt W1 | 10.487 | 71,9 % | 83,9 % | **−12,0** (ja) |
| Nach Welle 4: W5 übersteigt W3 | 8.866 | 66,4 % | 79,1 % | **−12,7** (ja) |
| Zigzag nach B: C übersteigt A | 8.770 | 46,0 % | 48,3 % | −2,3 (ja) |
| Flat nach B: C übersteigt A | 23.746 | 41,1 % | 46,5 % | −5,4 (ja) |

Das Vorzeichen ist in allen drei Zeiträumen gleich (z. B. W3 nach W2: TRAIN −14,2, VALIDATION −9,5, TEST −10,7).

Extensionen nach W2 (vor Invalidation, 52 Wochen): W3 erreicht 1,0 × W1 (ab W2-Ende) in 34 %, 1,618 × W1 in 13 %, 2,618 × W1 in 5 %. Nach W4: W5 = 0,618 × W1 in 61 %, = W1 in 45 %.

**Multi-Degree:**

| Kontext | Setup | n | erfüllt | Zufall | Lift |
|---|---|---|---|---|---|
| höherer Grad konsistent | W3 nach W2 | 9.414 | 72,9 % | 83,9 % | −11,0 |
| höherer Grad im Konflikt | W3 nach W2 | 671 | 59,3 % | 82,9 % | **−23,6** |
| höherer Grad konsistent | W5 nach W4 | 7.267 | 68,1 % | 79,5 % | −11,3 |
| höherer Grad im Konflikt | W5 nach W4 | 1.152 | 54,0 % | 74,4 % | **−20,4** |
| höherer Grad konsistent | Zigzag-C | 6.007 | 50,2 % | 51,0 % | −0,9 |
| höherer Grad neutral | Zigzag-C | 2.763 | 37,0 % | 42,0 % | −5,0 |
| Unterteilung konsistent | W3 nach W2 | 3.387 | 69,7 % | 84,9 % | −15,2 |
| Unterteilung nicht aufgelöst | W3 nach W2 | 5.863 | 72,6 % | 82,3 % | −9,7 |

**Lesart:**
* Gegen zufällige Zeitpunkte mit denselben Abständen erfüllen Elliott-Zählungen ihre Lehrbuch-Erwartung **seltener**, nicht häufiger. Der frühere Positivbefund entstand aus trivial bestätigten Fällen.
* Ein Teil der Lücke kann ein **Konditionierungseffekt** sein (die Zählung wird erst erkannt, nachdem ein Gegen-Swing bestätigt ist; die Baseline ist unbedingt). Ob Elliott selbst schadet oder nur „nach einem bestätigten Rücklauf" schlechter ist als „irgendwann", trennt diese Studie nicht — ein Vergleich gegen „beliebiger bestätigter Swing gleicher Skala" steht in der ROADMAP.
* *(Historisch, durch H4 nicht bestätigt:)* Relativ schien der höhere Grad der aussagekräftigste Baustein: Konflikt mit dem höheren Grad ist rund 9–12 pp schlechter als Konsistenz. Die sichtbare 5/3-Unterteilung bringt **keinen** Mehrwert (konsistent eher schlechter).
* Klarheit (Rangabstand) unterscheidet die Erfüllungsquote kaum.

Konsequenz: Elliott bleibt im Produkt **Beschreibung der Struktur** (Zonen, Grenzen, Alternativen), nicht Vorhersage. Die Methodikseite sagt das ausdrücklich (datengetrieben).

## 7. Kalibrierung

Zellen-Trefferquoten (TRAIN) vs. Beobachtung (TEST, n = 46.544, Nachlauf §0b): vorhergesagt 29,1 / 30,6 / 36,9 / 39,9 / 42,5 % → beobachtet 32,8 / 33,9 / 36,3 / 36,1 / 38,9 %. Brier 0,2299 vs. konstant 0,2292 (Skill −0,3 %). **Gate nicht bestanden → keine Wahrscheinlichkeiten im Produkt.**

## 8. Fibonacci

319.843 bestätigte Gegenbewegungen (Wochen): Verhältnis „genau am Niveau" zu „knapp daneben" (±1 pp-Bänder) — 38,2 %: **0,97**; 50 %: **1,05**; 61,8 %: **0,99**; 78,6 %: **0,97**. Keine Häufung von Wendepunkten an Fibonacci-Niveaus (unabhängig von den Outcome-Korrekturen). Konsistent mit Tsinaslanidis et al. (2022).

## 9. Tages-Referenz (5 Titel)

215 gefüllte Einstiege: Ziel 1 56,7 % vs. Zufall 54,7 % (Lift +2,0 pp, KI −5,6 … +9,7 — **nicht belastbar**). Median 13 Handelstage bis Ziel 1. Wochen- und Tageschart gleichgerichtet: 161 Fälle, 57,8 % vs. 58,6 %. Die Tagesstudie über das ganze Universum läuft in CI (`technical-intelligence-evidence.yml`), sobald gestartet.

## 10. Konsequenzen für das Produkt

1. Keine Prozent-Wahrscheinlichkeiten; historische Häufigkeiten immer **mit** Zufallsvergleich.
2. „Strukturklarheit" statt „Konfidenz" als Hauptlabel; Erklärung, dass sie keine Treffersicherheit misst.
3. Fibonacci und Wyckoff nur beschreibend/konfluent.
4. Elliott: nur Geometrie (Zonen, Invalidation) und Struktur-Erklärung, keine Vorhersage; Konfluenzgewicht 0 (vorab registrierte Entscheidung). Auch der höhere Grad ist nicht bestätigt (H4).
5. Typische Dauer (Wochen/Handelstage) nur aus empirischen Quartilen, nie aus Fibonacci-Zeitrelationen.
6. Kein Vorteil gegenüber dem Zufall im Prüfzeitraum → die Methodikseite sagt das wörtlich (Text aus den Daten abgeleitet, nicht fest verdrahtet).
