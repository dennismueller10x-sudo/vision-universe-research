# V12 REQUAL – Vorher/Nachher (P5) und vollständige Strategien (P6) auf der qualifizierten PIT-S&P-500-Population

Stand 29.10.2026. Evidenzart HISTORICAL_DEVELOPMENT_STUDY, `NOT_CERTIFIED`, `productionApproved: false`. Keine Datei unter `*/data`,
kein Produktpfad, kein Loader, keine Engine, kein Workflow geändert. Neu sind nur Research-Skripte (`scripts/quant/v12/requal/`),
Belege (hier) und Tests (`quant/tests/v12-requal.test.mjs`). Keine Alpha-Behauptung – aber auch keine Verallgemeinerung, Strategien
könnten keinen Mehrwert erzeugen: Die Messungen unten gelten für diese Population, diesen Zeitraum, diese Frequenz und diese Regeln.

## Was neu ist gegenüber V10/V11

V10/V11 rechneten auf dem heutigen Anbieteruniversum (4.329 Listings, fast nur Überlebende). Hier ist die Population die
**PIT-S&P-500 aus den SPY-Fondsbeständen** (`research-index-population.cjs`, Regeln 1.1.0): alle Mitglieder je Stichtag, auch spätere
Austritte, mit Rendite aus Wert/Stück der Bestandsmeldungen. Austritte ohne Folgepreis sind Schranken-Fälle und werden in zwei
Szenarien gerechnet: **ZERO** (Austritt 0 %, mehrdeutige Kapitalmaßnahme in der Mitte) als Punktschätzung und **LOWER**
(Austritt −100 %, mehrdeutig an der Untergrenze) als Survivorship-Untergrenze. Spanne 2009-09-30 … 2026-06-30, 47 Perioden
(halbjährlich bis 2019-03, danach quartalsweise); die drei nicht qualifizierten Perioden (2012-09, 2014-03, 2015-03) sind
enthalten, markiert und in einer Sensitivität ausgelassen. Fundamentaldaten/Marktkap.: korrigiertes PIT-Panel (MCAP 1.0.8).

Renditebasis: **Kurs gegen Kurs** auf beiden Seiten. Die Strategieseite ist nicht TR-fähig (die Bestandspreise enthalten keine
Dividenden). SPY-Gesamtrendite (N-30D-Ausschüttungen, Quartalsaufteilung) steht nur als gekennzeichnete Referenz daneben; gegen die
N-PORT-Gesamtrendite 2019-09+ weicht die Näherung je Quartal um Median −0,02 PP (−0,29 … +0,24 PP) ab.

## Vorab-Registrierung und Änderungen (offen gelegt)

| Datei | Commit | Inhalt |
|---|---|---|
| `registration-1.0.0.json` (sha256 `57b965b1…`) | `12137ff581` | vor jedem Ergebnis: Studien P5a–d, sechs Strategien, Parameter, Regime R1/R2, Szenarien, Kosten, Inferenz |
| `registration-1.0.1.json` (`79fc09f5…`) | `5cd068dbb1` | vor jedem Ergebnis: Wochenfenster 6 → 7 Tage (Karfreitagswochen, z. B. Bar 2016-03-24 für t₀ 2016-03-31; der erste P5a-Lauf brach ab, ohne Ergebnis) |
| `registration-1.0.2.json` (`9b712050…`) | `fe29cf11f5` | **nach** P5a–c, **vor** P6: Die V10-Bewertung verlangt ≥ 200 gültige Werte je Komponente; innerhalb der S&P-Teilmenge sind Profitabilität und Composite deshalb in allen 45 Perioden nicht verfügbar (P5c S3/S4). P6-Scores daher aus dem Gesamt-Frame-Panel (PIT, ohne Re-Normierung), Auswahl weiter nur unter S&P-Mitgliedern; P5c-Diagnose D2 ergänzt (Gesamt-Frame-Scores + Bestandsrendite). Kein Strategieparameter geändert. |

Nach Sicht auf die P6-Ergebnisse (offengelegt, keine Regeländerung): (a) Berichtsfehler korrigiert – die Spalte „Aktienquote“
zeigte die Zielquote statt der tatsächlichen; S3/S4 hatten 2010-03 … 2011-03 **kein** wählbares Mitglied (Profitabilität im Panel
erst ab 2011-09 verfügbar) und lagen in Cash (EFFR). (b) Zusätzlich eine **gemeinsame Spanne ab 2011-09-30** (erster Stichtag, an dem
jede Strategie wählbare Titel hat, mechanisch bestimmt) als Nachsensitivität. Primär bleibt die registrierte Spanne.

Vorwissen: alle V10/V11-Ergebnisse, SPXPOP-Perioden (kapitalgewichtete Rendite gegen SPY), INDEXPOP-Abdeckung, MCAP-Wirkung;
Momentum-, Low-Vol- und Qualitätsfamilien sind aus V7–V11 auf derselben Historie bekannt. Nichts hier ist konfirmatorisch.

## P5a – Populationseffekt und Survivorship innerhalb des Index (`p5a-population-1.0.0.json`)

CAGR 2009-09-30 … 2026-06-30, Periodenkauf-und-Halten, Kursrendite:

| Reihe | ZERO | LOWER |
|---|---:|---:|
| SPY (exakte Stichtage) | 12,39 % | 12,39 % |
| SPY Gesamtrendite (Referenz) | 14,40 % | – |
| EW alle PIT-S&P-500-Mitglieder (`EW_ALL`) | 10,60 % | 7,30 % |
| bestandsgewichtet alle Mitglieder (`CW_ALL`, Konsistenz ≈ SPY) | 12,00 % | 10,46 % |
| EW Mitglieder **mit** unserer Kursreihe, Bestandsrendite (`EW_WITH_H`) | 11,31 % | 11,28 % |
| EW Mitglieder **ohne** Kursreihe (`EW_WITHOUT_H`) | 8,50 % | −6,13 % |
| EW Mitglieder mit Kursreihe, Wochenreihen-Rendite (`EW_WITH_S`) | 11,43 % | 11,43 % |
| EW Survivor-Frame V10/V11 (`EW_FRAME`, 4.329 Listings) | 11,23 % | 11,11 % |
| EW Survivor-Frame wöchentlich rebalanciert (V11-Definition) | 12,67 % | 12,67 % |

Exakte additive Zerlegung je Periode (Restfehler < 1e-17), annualisiert als Summe der Periodendifferenzen / Jahre, ZERO (LOWER):

- **Universum** (Survivor-Titel außerhalb des Index): +0,53 PP (+0,41).
- **Messung** (Wochenreihe statt Bestandspreis, Datumsversatz): +0,07 PP (+0,11).
- **Survivorship innerhalb des S&P 500** (Mitglieder mit Reihe minus alle): **+0,67 PP** (+3,76); 31 von 47 Perioden positiv,
  Newey-West p 0,005. Halbjährliche Ära 2009–2019 +1,04 PP (17/20 positiv), quartalsweise 2019–2026 +0,11 PP. Mechanismus: Von 273
  Schranken-Fällen (Austritte ohne Folgepreis) hatten nur 11 eine Kursreihe; die Abdeckung der Mitglieder mit Reihe steigt von 61 %
  (2009) auf 93 % (2026). Das ist die direkt gemessene Verzerrung, die V11 (Befund M2) nur benennen konnte.
- **Gleichgewichtung innerhalb des Index** (EW_ALL − SPY): **−1,43 PP** (−4,56); 2009–2019 ±0, 2019–2026 −3,56 PP (Dominanz der
  Mega-Caps).
- Summe = Frame − SPY = −0,16 PP. Daneben: SPY-Gesamtrendite − Kursrendite +1,87 PP; wöchentliches Rebalancing des Frames +1,42 PP.

Lesart: Auf der qualifizierten Population gibt es im Zeitraum 2009–2026 **keinen Populationsvorsprung** vor SPY. Der V11-Term
„Population − SPY“ (+0,87 … +1,10 PP je 13 W) entstand 2000–2012 und auf einer Population ohne Austritte. Ein Teil der Lücke
CW_ALL − SPY (−0,39 PP p. a.) ist Messfehler der Bestandspopulation (nicht modellierte Abspaltungen, SPXPOP-Grenzen) und steckt
auch in EW_ALL. Nach Regime (R1, ZERO, Mittel je Periode): Gleichgewichtung kostet in Crash (−0,75 PP), Erholung (−0,89) und
Seitwärtsphasen (−2,34) und gewinnt leicht im Bullenmarkt (+0,16); der Universumsterm ist in Crashs negativ (−1,96), in Erholungen
positiv (+2,56) – die Survivor-Kleinwerte sind ein Hebel auf den Markt.

## P5b – V11-Zerlegung der fünf Signalregeln auf S&P-500-Mitgliedern (`p5b-signals-1.0.0.json`)

Gleicher V10/V11-Code (Erkennung, Eignung, Einstieg k+1, 10+5 bps je Seite), Signale 2009-10 … 2025-12. Spalten: V11 publiziert
(Frame 2000–2025) → Frame 2009–2025 (Zeitfenster) → S&P-Mitglieder mit Reihe (Population) → Schätzung „alle Mitglieder“
(Populationsterm um die P5a-Survivorship-Lücke verschoben; in Klammern LOWER). PP je Ereignis:

| Regel, h | SPY-Überschuss netto | Population − SPY | Signal − Population | n (S&P) |
|---|---|---|---|---:|
| NEW_52W_HIGH 13 W | +1,07 → −0,13 → −0,66 | +0,87 → −0,20 → −0,35 → −0,52 (−1,28) | +0,51 → +0,39 → 0,00 → +0,16 (+0,93) | 5.500 |
| TREND_UP 13 W | +0,20 → −0,64 → −0,80 | +1,10 → +0,02 → −0,33 → −0,51 | −0,59 → −0,35 → −0,16 → +0,03 | 6.951 |
| MOMENTUM_IMPROVED 13 W | +0,48 → −0,42 → −0,58 | +1,09 → +0,04 → −0,26 → −0,47 | −0,30 → −0,15 → −0,01 → +0,20 | 7.091 |
| NEW_52W_HIGH 52 W | +3,39 → −0,55 → −1,34 | +3,23 → −0,77 → −1,33 → −2,00 (−5,08) | +0,49 → +0,56 → +0,32 → +0,99 (+4,07) | 5.428 |
| TREND_DOWN 52 W | +2,22 → −1,05 → −1,86 | +4,36 → +0,37 → −1,10 → −1,83 | −1,80 → −1,08 → −0,42 → +0,31 | 6.977 |

(alle zehn Zellen in `bridge`). Erklärung der Differenz zur V11-Zerlegung: (1) **Zeitfenster** – auf demselben Frame fällt der
Populationsterm (13 W) von +0,70 … +1,10 PP (V11, 2000–2025) auf −0,20 … +0,14 PP (2009–2025); der V11-Vorsprung lag vor 2009. (2) **Population** – auf S&P-Mitgliedern
liegt der Populationsterm unter null (Gleichgewichtung großer Werte < SPY, wie P5a). (3) **Auswahl** – auf den S&P-Mitgliedern liegt
„Signal − Population“ zwischen −0,57 und +0,32 PP; das in V11 negativ abgesicherte TREND_UP 13 W (−0,59) schrumpft auf −0,16 und ist
nicht mehr abgesichert. Mit der geschätzten Survivorship-Verschiebung werden alle Auswahlterme leicht positiv (ZERO +0,03 … +0,99),
unter LOWER deutlich – das bestätigt die Richtung von V11-M2 (der Survivor-Frame benachteiligte die Auswahl), ist aber eine
**Schätzung** (Periodenlücke linear auf h Wochen umgelegt) und keine Messung. Holm (30 Terme je Stufe): 0 Ablehnungen auf dem Frame
2009–2025, 0 auf S&P. Kosten unverändert 0,31/0,34 PP je Ereignis.

## P5c – V10-Faktor-IC und Quintile auf PIT-S&P-500 (`p5c-factor-1.0.0.json`)

45 Perioden (t₀ 2010-03 … 2025-12, Rangdatum ≤ 35 Tage vor t₀). Mittlerer Rang-IC je Periode (Newey-West-p):

| Signal | V10 publ. 13 W / 26 W | S1 Frame, alte MK | S2 Frame, korr. MK | S3 S&P, Wochenreihe | S4 S&P, Bestand inkl. Austritte (ZERO) | D2 S&P, Gesamt-Frame-Scores (ZERO) |
|---|---|---|---|---|---|---|
| quality | 0,028 / 0,035 | 0,035 (0,002) | 0,035 | 0,013 (0,41) | 0,014 (0,38) | 0,019 (0,25) |
| value | 0,034 / 0,039 | 0,055 (0,006) | 0,054 (0,008) | −0,012 | −0,011 | −0,004 |
| profitability | 0,044 / 0,051 | 0,051 (0,011) | 0,051 | n. v. | n. v. | 0,027 (0,28) |
| momentum | 0,045 / 0,063 | 0,051 (0,002) | 0,051 | 0,009 (0,70) | 0,008 (0,72) | 0,007 |
| risk | 0,059 / 0,074 | 0,076 (0,017) | 0,076 | −0,004 | −0,008 | −0,008 |
| composite | 0,048 / 0,066 | 0,056 (0,017) | 0,055 (0,019) | n. v. | n. v. | 0,041 (0,11) |
| growth | 0,012 / 0,014 | 0,009 | 0,009 | 0,024 | 0,022 | 0,022 |

Zerlegung: **Periodengitter** (V10 monatlich → Halbjahr/Quartal, S0 → S1) ändert wenig; **Marktkap.-Korrektur** (S1 → S2) wirkt nur auf
value/composite (−0,0016); **Population** (S2 → S3) nimmt praktisch den ganzen IC weg – innerhalb der großen S&P-Werte trennen die
V10-Faktoren kaum, ihr IC im Frame stammt aus der Streuung über Größenklassen und kleine Survivor-Titel; **Austritte** (S3 → S4)
verschieben die ICs um ≤ 0,004. Holm über 7 Signale (S4 und D2): keine Ablehnung. Q5 − SPY je Periode auf S&P: −1,0 … +0,8 PP.
„n. v.“ ist ein registriertes Ergebnis: Die V10-Komponentenschwelle (≥ 200 gültige Werte) wird in der S&P-Teilmenge nicht erreicht.

## P6 – Sechs vollständige Strategien (`p6-strategies-1.0.0.json`)

Rebalancing an jedem Populationsstichtag, Ziele fest bei t₀, Halten bis t₁ mit Bestandsrenditen (Austritte → Cash zum Szenariowert),
Cash zum EFFR, Kosten auf gehandeltes Volumen. Registrierte Spanne 2010-03-31 … 2026-03-31 (45 Perioden), ZERO, Basiskosten
(15 bps je Seite):

| Strategie | CAGR | Vol. | Sharpe | MaxDD (Stichtage) | Umschlag p. a. | Kosten PP p. a. | Ø Aktienquote | ggü. SPY | Stress | LOWER | gem. Spanne ab 2011-09 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| SPY (Kurs) | 11,32 % | – | 0,60 | −24,8 % (täglich −34,1 %) | – | – | 100 % | – | – | – | – |
| S1 EW S&P 500 | 9,48 % | 17,4 % | 0,43 | −27,4 % | 0,20 | 0,06 | 100 % | −1,83 | −1,99 | −5,04 | −2,16 |
| S2 Momentum-Q5 + Marktfilter | 6,38 % | 15,7 % | 0,30 | −24,6 % | 1,46 | 0,44 | 84 % | −4,93 | −6,02 | −5,00 | −4,81 |
| S3 Qualität+Profitabilität Q5 | 11,55 % | 17,6 % | 0,54 | −32,7 % | 0,68 | 0,20 | 93 % | +0,23 | −0,29 | +0,23 | −0,02 |
| S4 Momentum+QP Top 30, Vol-Ziel 15 % | 9,59 % | 14,6 % | 0,53 | −28,1 % | 1,05 | 0,31 | 75 % | −1,73 | −2,53 | −1,78 | −2,21 |
| S5 Low-Volatility Q1 | 9,16 % | 12,1 % | 0,59 | −18,7 % | 0,70 | 0,21 | 100 % | −2,15 | −2,69 | −2,17 | −3,45 |
| S6 EW + 10 % Puffer, Filter → 45 % | 7,10 % | 14,4 % | 0,37 | −24,6 % | 0,28 | 0,08 | 83 % | −4,21 | −4,42 | −6,87 | −4,84 |

Differenzen in PP CAGR. SPY-Gesamtrendite (Referenz) 13,32 %: gegen sie liegen alle Strategien 1,8–6,9 PP darunter (gemischte Basis).
Cash zu 0 % statt EFFR: S2 6,12 %, S4 9,24 %, S6 6,83 % (Rest unverändert).

**Zerlegung gegenüber SPY (ZERO, Basis):** Benchmark/Gleichgewichtung EW S&P − SPY −1,83 PP; wählbares Universum (Mitglieder mit
Panelzeile) − EW S&P +0,80 PP (Survivorship der Wählbarkeit, vgl. P5a); **Auswahl** gegenüber dem wählbaren EW-Universum: S3 +1,26,
S4 −0,70, S5 −1,12, S6 −3,18 (Aktienquote), S2 −3,90; Kosten 0,06–0,44 PP; Kurs- statt Gesamtrendite auf SPY-Seite +2,00 PP.

**Marktphasen (R1 aus SPY, Mittel je Periode ggü. SPY, PP):** S5 Low-Vol +3,56 in Crash/Bär (12 Perioden), −4,30 in Erholungen (10),
−1,63 im Bullenmarkt (19) – Schutz im Abschwung, Rückstand in der Erholung; S4 +2,24 / −3,37 / −1,05; S3 +1,47 / −0,03 / −0,36;
S2 −1,19 / **−6,46** / +0,49 – der Marktfilter steht an 8 Stichtagen auf Cash (2011-09, 2015-09, 2020-03, 2022-06/-09/-12, 2025-03,
2026-03), jeweils nach dem Einbruch, und verpasst die Erholung (2020-Q2, 2022-Q4/2023-Q1); S6 ebenso −4,49 in Erholungen. Die
Owner-Kalender-Phasen (R2) zeigen dasselbe Muster (`regimesR2`).

**Inferenz:** 45 Perioden, Blockbootstrap mit ~11 Blöcken (nicht belastbar) und Newey-West; Holm über 11 Tests je Szenario/Kostenstufe.
Unter ZERO ist **kein** Unterschied abgesichert, weder positiv noch negativ (kleinster Holm-p 0,10 NW / 0,04 Bootstrap, S6 unter SPY).
Bootstrap-Intervalle schließen null nur bei S2 (−9,6 … −0,1 PP) und S6 (−6,5 … −1,1 PP) aus – beobachtet, nicht abgesichert. Unter
LOWER sind S1 und S6 unter SPY abgesichert; das ist eine Aussage über die Untergrenze (alle Austritte −100 %), keine Punktschätzung.
Mindesteffekt bei 80 % Power: 3,6–7,2 PP p. a. unadjustiert, 4,7–9,4 PP im ungünstigsten Holm-Schritt (SE 1,3–2,6 PP). S3s +0,23 PP
liegt weit darunter. Für ehrliche Lesart: **beobachtet** sind Unterschiede im Risiko (Low-Vol: Vol 12,1 % vs. 17,4 % EW, MaxDD −18,7 %)
und in Phasen; **abgesichert** ist keine Überrendite.

## P5d – Zerlegung je Unterschied (`p5d-attribution-1.0.0.json`)

- **Population:** größter Effekt. Der V10/V11-„Vorsprung“ war Survivor-Population 2000–2012; auf der PIT-S&P-500 2009–2026 liegt die
  Gleichgewichtung 1,4 PP p. a. unter SPY, und innerhalb des Index überschätzt die Beschränkung auf Titel mit Kursreihe die Rendite um
  0,7 PP p. a. (Untergrenze 3,8 PP).
- **Auswahl:** Signal- und Faktor-Auswahl ist auf S&P-Mitgliedern ≈ 0 (P5b −0,6 … +0,3 PP je Ereignis; P5c |IC| ≤ 0,03); einzig
  Qualität+Profitabilität (S3) wählt in P6 beobachtet besser als ihr Universum (+1,3 PP p. a., nicht abgesichert, kostensensitiv).
- **Kosten:** mechanisch, mit dem Umschlag (Momentum 1,5× p. a.: 0,4 PP Basis, 1,5 PP Stress).
- **Benchmark Kurs vs. TR:** SPY-Dividenden ≈ 2,0 PP p. a.; Kurs gegen Kurs ist die einzige saubere Basis, weil Mitgliedsdividenden fehlen.
- **Total Return:** für Strategien nicht verfügbar (Bestandspreise ohne Dividenden).
- **Portfolioaufbau:** wöchentliches Rebalancing des V11-EW-Index brachte +1,4 PP p. a. gegenüber Periodenhalten; Gleich- vs.
  Kapitalgewichtung ist ab 2019 der größte Einzelterm (−3,6 PP p. a.); Aktienquote/Marktfilter erklären bei S2/S6 den Großteil des
  Rückstands.

## Python-Gegenprüfung (`python-check-1.0.0.json`)

`python3 -I verify_requal.py` (stdlib, eigene Implementierung aus Rohdaten: Populationsdatei direkt geparst, exportierte Frame-Reihen,
SPY/EFFR-Rohreihen, N-30D-Ausschüttungen; eigene Volatilität aus Wochenreihen, eigenes Ledger): alle zehn P5a-Reihen in 47 Perioden und
beiden Szenarien gleich (max. Abweichung 5e-7 = Rundung der JS-Ausgabe), Mitglieds- und Frame-Zählungen in allen Perioden gleich; S5
Low-Vol (ZERO, Basis) CAGR identisch (9,1649 %), Periodenrenditen ≤ 5e-7. Eine zweite Sprache ist kein Holdout; Bootstrap und P5b/P5c
sind nicht unabhängig nachgerechnet.

## Grenzen

- Frequenz: halbjährlich bis 2019, quartalsweise danach; Drawdowns auf Stichtagsbasis unterschätzen (SPY −24,8 % vs. täglich −34,1 %),
  Marktfilter und Vol-Ziel wirken nur an Stichtagen.
- Signale nur für Mitglieder mit Panelzeile/Kursreihe (61–93 % der Mitglieder); die Wählbarkeit ist selbst survivor-verzerrt
  (+0,8 PP p. a., P6). Mitgliedschaft gilt als öffentlich zum Stichtag (S&P-Bekanntgaben), nicht ab SEC-Einreichung.
- P5b-„alle Mitglieder“ ist eine lineare Umlegung der Periodenlücke; P5c/P6-Fundamentaldaten aus dem V10-Panel (Fiskalkalender heutiger
  Stand, Panel ohne Lifecycle). Profitabilität ist im Panel erst ab 2011-09 für S&P-Werte verfügbar.
- Konsistenzfehler der Bestandspopulation (CW_ALL − SPY −0,39 PP p. a.) und drei nicht qualifizierte Perioden; Sensitivität ohne sie
  ändert die Vorzeichen nicht (`qualifiedOnly`).
- Ausgeschlossen/gezählt: Frame-Reihen mit Lücke am Stichtag 0; Frame-Enden LAST_CLOSE 88, TERMINAL_CASH 3 Beobachtungen.

## Reproduktion (Laufzeiten auf 4 Kernen)

```bash
P=<scratchpad>/v12-private
node scripts/quant/v12/requal/p5a-population.cjs --export $P/requal                    # 43 s
node scripts/quant/v12/requal/p5b-signals.cjs                                           # 84 s
node --max-old-space-size=6000 scripts/quant/v12/requal/p5c-factor.cjs --panels $P/mcap # 63 s
node --max-old-space-size=6000 scripts/quant/v12/requal/p6-strategies.cjs --panels $P/mcap   # 69 s
node scripts/quant/v12/requal/p5d-attribution.cjs
python3 -I scripts/quant/v12/requal/verify_requal.py "$PWD" $P/requal/frame-export.json.gz $P/mcap/after/panel.jsonl.gz docs/quant-recovery/v12/requal/python-check-1.0.0.json   # 18 s
node --test quant/tests/v12-requal.test.mjs                                              # < 1 s
```

Eingaben: Panels `mcap/{before,after}/panel.jsonl.gz` (sha256 in `p5c`/`p6`), Population-Datei laut SPXPOP-Manifest, SPY/EFFR-Reihen
(sha256 in der Registrierung). **SEC-Abrufe: 0.**
