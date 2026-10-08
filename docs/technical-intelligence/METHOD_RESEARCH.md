# Methoden-Research & Method Traceability Matrix

Jede implementierte Methode ist rückführbar auf **Quelle → Regel → formale Interpretation → Algorithmus → Test → historische Validierung → UI**. Research ohne Wirkung auf das Produkt wird nicht aufgeführt; abgelehnte Befunde stehen mit Begründung da.

Verifikation der Quellen: **[V]** online bestätigt (Recherche 02.10.2026), **[M]** bibliographisch aus Fachwissen, vor Veröffentlichung nachzuprüfen.

## 1. Quellenregister

### Elliott-Wellen
* Elliott, R. N. (1938): *The Wave Principle*; (1946): *Nature's Law* [M]
* **Frost, A. J. & Prechter, R. R.** (1978; 10. Aufl. 2005; 11. Aufl. 2017): *Elliott Wave Principle: Key to Market Behavior*, New Classics Library [M] — Primärquelle für Regeln und Richtlinien
* Gorman, W. & Kennedy, J. (2013): *Visual Guide to Elliott Wave Trading*, Bloomberg/Wiley (EWI) [M] — Flat-Definition B ≥ 90 % von A
* EWI Waveopedia (Diagonals, Triangles) [V, Existenz]; erweiterte Formen (expandierende Leading Diagonal, 3-3-3-3-3-Leading-Diagonal) laut EWI-Material [V, Sekundärquellen]
* Neely, G. (1990): *Mastering Elliott Wave* [M] — alternatives, strengeres Regelwerk (Flat B ≥ 61,8 %); **nicht** übernommen, dokumentiert als Abweichung
* Atsalakis, Dimitrakakis & Zopounidis (2011), *Expert Systems with Applications* 38(8), 9196–9206 [V]; Volná/Kotyrba (ECMS 2012/2013) [V] — Automatisierungsversuche ohne belastbaren Out-of-Sample-Nachweis

### Fibonacci, Support/Resistance
* Tsinaslanidis, Guijarro & Voukelatos (2022), *ESWA* 187:115893, doi:10.1016/j.eswa.2021.115893 [V]
* Shanaev & Gibson (2022), SSRN 4212430 (Working Paper) [V]
* Osler, C. L. (2000), *FRBNY Economic Policy Review* 6(2), 53–68 [V]; Osler (2003), *Journal of Finance* 58(5) [M]
* Kavajecz & Odders-White (2004), *Review of Financial Studies* 17(4) [M]

### Allgemeine Evidenz & Statistik
* Brock, Lakonishok & LeBaron (1992), *JF* 47(5) [M]; Sullivan, Timmermann & White (1999), *JF* 54(5) [M]
* Lo, Mamaysky & Wang (2000), *JF* 55(4) [M]; Savin, Weller & Zvingelis (2007), *J. Fin. Econometrics* 5(2) [V]
* Park & Irwin (2007), *J. Economic Surveys* 21(4) [M]; Bulkowski (2005), *Encyclopedia of Chart Patterns* [M]
* Marshall, Young & Rose (2006), *JBF* 30(8); Marshall, Young & Cahan (2008), *RQFA* 31 [V]; Marshall, Cahan & Cahan (2008), *JEF* 15(2) [V]
* Jegadeesh & Titman (1993), *JF* 48(1) [M]; George & Hwang (2004), *JF* 59(5) [M]; Moskowitz, Ooi & Pedersen (2012), *JFE* 104(2) [M]; Hurst, Ooi & Pedersen (2017), *JPM* 44(1) [V]; Zakamulin (2017), Palgrave [V]
* Harvey, Liu & Zhu (2016), *RFS* 29(1) [M]; Bailey & López de Prado (2014), *JPM* 40(5) [M]; López de Prado (2018), *Advances in Financial ML* [M]
* Wilson (1927), *JASA* 22 [M]; Brier (1950); Murphy (1973); Platt (1999); Zadrozny & Elkan (2002); Niculescu-Mizil & Caruana (2005) [M]

### Volumen, Wyckoff, Trend
* Wyckoff (1931, Kurs) [M]; Pruden (2007), *The Three Skills of Top Trading*, Wiley [M]; Villahermosa (2019) [V, Existenz]
* Shannon (2023), *Maximum Trading Gains With Anchored VWAP* [V]; Berkowitz, Logue & Noser (1988), *JF* 43(1) [M]; Steidlmayer & Koy (1986) [M]
* Karpoff (1987), *JFQA* 22(1); Gervais, Kaniel & Mingelgrin (2001), *JF* 56(3); Llorente et al. (2002), *RFS* 15(4); Lee & Swaminathan (2000); Blume, Easley & O'Hara (1994) [M]
* Hamilton (1922); Rhea (1932) [M]; **Brown, Goetzmann & Kumar (1998)**, *JF* 53(4), 1311–1333, doi:10.1111/0022-1082.00054 [V]; Weinstein (1988) [M]; O'Neil (2009) [M]
* Guillaume et al. (1997), *Finance & Stochastics* 1(2) [M]; Glattfelder, Dupuis & Olsen (2011), *Quantitative Finance* 11(4) [V]; Tsang et al. (2017) [V] — kausale Swing-Definition (Directional Change)
* Wilder (1978); Engle (1982); Bollerslev (1986); Parkinson (1980); Bollinger (2001) [M]

## 2. Evidenzgrade (Literatur) und VU-Messung

| Methode | Grad Literatur | VU-Befund (Wochenuniversum, siehe TECHNICAL_EVIDENCE.md) | Rolle im Produkt |
|---|---|---|---|
| Trend / Zeitreihen-Momentum | A | Richtungstreffer 51,9 % (TEST 51,8 %) — schwach, aber konsistent > 50 % | Stimmgewicht 0,30 |
| Momentum (Mehrhorizont) | A | 51,4 % gesamt, 50,6 % TEST | Bestätigung, Gewicht 0,20 |
| Volatilität (ATR, Regime) | A (Normierung) | Lift am höchsten im Extrem-Regime (+3,5 pp) | Zonenbreiten, Kontext |
| Struktur (Hochs/Tiefs, Dow) | B/C | 51,4 % | Gewicht 0,15, Invalidation |
| Höherer Zeitrahmen | B | nur Tagesstudie (5 Titel) | Gewicht 0,15 |
| Volumen | B | nur Tagesstudie | Gewicht 0,10 |
| Chartformationen | C | 51,1 %; Formation stützt Szenario: Ziel-1-Quote 43,0 % vs. 40,6 % bei Widerspruch | Gewicht 0,08 |
| Elliott (Richtung) | D | 50,6 % gesamt, **50,0 % TEST** — kein Richtungswert | Gewicht 0,08; Geometrie-Lieferant |
| Elliott (Lehrbuch-Erwartungen) | D | korrigiert: alle Lehrbuch-Erwartungen **unter** Zufall (W3 −12 pp, W5 −12,7, Zigzag-C −2,3, Flat-C −5,4); erster Lauf (+8,8 pp Zigzag-C) war Artefakt | Profi-Ansicht, Evidenz |
| Fibonacci-Niveaus | C | **keine** Häufung an 38,2/50/61,8 % (Verhältnis 0,97–1,05; n = 319.843) | nur Konfluenz |
| Wyckoff | D | Richtung < 50 % in Entwicklungsdaten | beschreibend, Gewicht 0 |
| Kerzenmuster | D (negativ) | nicht geprüft | **abgelehnt** |

## 3. Method Traceability Matrix

Typen: **HARD** = Regel (Verletzung → Kandidat ungültig), **DEF** = Klassengrenze (Verletzung → nicht dieses Muster), **GUIDE** = Richtlinie (rankt nur), **HEUR** = VU-Heuristik, **EMP** = empirische Eigenschaft (nur Evidence-Schicht).

| Methode | Regel | Quelle | Typ | Algorithmus | Test | Backtest/Evidenz | UI |
|---|---|---|---|---|---|---|---|
| Elliott Impuls | W2 nie > 100 % von W1 | F&P S. 31 | HARD | `patterns.js impulseRules` W2_NOT_BEYOND_W1_ORIGIN (sofort prüfbar) | EV2-R2, R3 | Invalidation-Niveau der Szenarien | Regelprüfung (Profi), Ungültig-Linie |
| Elliott Impuls | W3 über W1-Ende | F&P S. 31 | HARD | W3_BEYOND_W1_END (offen, solange W3 läuft) | EV2-R2, R3 | „W3 nach W2"-Studie | Profi |
| Elliott Impuls | W3 nie kürzeste | F&P S. 31 | HARD | W3_NOT_SHORTEST; bei laufender W5 als Obergrenze (CAP) | EV2-R2, R3 | — | Profi (Projektion „Obergrenze") |
| Elliott Impuls | W4 nie im Gebiet von W1 | F&P S. 31 | HARD | W4_NO_OVERLAP_W1 | EV2-R2 | Invalidation bei laufender W4 | Ungültig-Linie |
| Elliott Impuls | 5-3-5-3-5 | F&P Kap. 1 | HARD (Theorie) → als Evidenz umgesetzt | `subdivide()` auf feinerer Skala + Regelprüfung der Unterwellen; Fit 0–1 | EV2-E1, E2 | **kein Mehrwert gemessen** (konsistent −1,7 pp vs. unaufgelöst +4,1 pp) | Profi (Unterwellen) |
| Elliott Impuls | Alternation W2/W4 | F&P Kap. 2 | GUIDE | Tiefe/Dauer-Differenz | EV2-R4 | — | Profi (Richtlinien) |
| Elliott Impuls | W2 50–61,8 %, W3 1,618, W4 23,6–38,2 %, W5 = W1 bei verlängerter W3 | F&P Kap. 4 | GUIDE | `band()`/`near()` | EV2-R4 | Extensionen: W3 erreicht 1,618×W1 in 39 % | Projektionszonen |
| Elliott Impuls | Kanal W2–W4 | F&P Kap. 2 | GUIDE | Abstand W5 zur Parallele | — | — | Profi |
| Elliott Impuls | Truncation | F&P Kap. 1 | GUIDE | NO_TRUNCATION 0,25 | — | — | Profi |
| Diagonale | W4 überlappt W1 | F&P S. 37 („almost always") | DEF | DIAGONAL_W4_OVERLAPS_W1; Diagonal-Kandidat erst, wenn sichtbar | EV2-R5 | — | Profi |
| Diagonale | Keilform kontrahierend/expandierend | F&P S. 36–40 | DEF | W4 vs. W2, W5 vs. W3 | EV2-R5 | — | Profi |
| Zigzag | B nie > 100 % von A | F&P S. 41 | HARD | B_NOT_BEYOND_A_ORIGIN | EV2-R6 | „Zigzag-C"-Studie | Profi |
| Zigzag/Flat | Grenze B 90 % von A | EWI (Gorman & Kennedy) | DEF | ZIGZAG_B_BELOW_90PCT / FLAT_B_AT_LEAST_90PCT | EV2-R6 | — | Profi |
| Zigzag | C jenseits A-Ende | F&P S. 41 („almost always") | GUIDE (nicht HARD) | C_BEYOND_A_END 0,15 bei Verfehlen | EV2-R6 | — | Profi |
| Flat | regulär / expandiert / running | F&P S. 44–47 | DEF (Variante) | `flatVariant()` | EV2-R6 | „Flat-C"-Studie | Profi |
| Dreieck | Grenzen kontrahierend/expandierend; E innerhalb C | F&P S. 50–55 | DEF/HARD | TRIANGLE_BOUNDARIES, TRIANGLE_E_INSIDE | EV2-R7 | — | Profi |
| Dreieck | Position nie W2 | F&P | HARD (Grammatik) | `positions` je Musterklasse (dokumentiert); Rang über Grammatik | — | — | — |
| W-X-Y / Double Zigzag | X < 100 % von W; Y über W-Ende | F&P S. 56–58 | HARD/DEF | wxyRules (verlangt aufgelöste 3er-Unterteilung), doubleZigzagRules | EV2-R8 | — | Profi |
| Elliott Grade | höherer Grad konsistent | F&P (Degrees) | HEUR (Rang) | `higherDegreeFit()` | EV2-E3 | relativ stärkster Baustein: Konflikt mit höherem Grad 9–12 pp schlechter als Konsistenz (W3, W5) | Profi „Höherer Grad" |
| Elliott Kausalität | bestätigte Labels nie umschreiben | VU Repainting-Policy | HARD (System) | lokaler Parser, Unterteilung eingefroren | EV2-C3 | — | Hinweis Profi |
| Fibonacci | Retracement/Extension nur von bestätigten Ankern | F&P Kap. 4 | HEUR | `levels.fibonacci()` | TI-E8 | **keine Häufung an Fib-Niveaus** | Konfluenz-Quelle, Hinweis Profi |
| S/R | Zonen aus geclusterten Swings + Lücken + 52W | Osler 2000/2003 | HEUR | `levels.supportResistance()` | TI-I1 | Ziele/Entry | Zonen im Chart |
| Dow | HH+HL = Aufwärtstrend; Ende bei Schluss unter letztem Tief | Hamilton 1922, Rhea 1932 | HARD (Def.) | `dow-trend.swingState()` | TI-E1 | Familie TREND | „Hochs, Tiefs und Trend" |
| Trend-MA | Kurs über steigender langer MA | Moskowitz et al. 2012; Zakamulin 2017 | HEUR | `maTrend()` | TI-E1 | Familie TREND | Warum-Liste |
| Weinstein-Stufen | 30-Wochen-Linie | Weinstein 1988 | HEUR | `weinsteinStage()` | — | — | Profi |
| Momentum | Mehrhorizont, Beschleunigung | JT 1993; MOP 2012 | HEUR | `analyzeMomentum()` | — | Familie MOMENTUM | Warum-Liste |
| Divergenz | neues Hoch, schwächerer RSI an Pivot-Bar | Wilder 1978 (Praktiker) | HEUR | `divergence()` | TI-E6 | — | Warum-Liste |
| Volatilität | ATR-Perzentil → Regime | Engle 1982; Bollerslev 1986 | HEUR | `analyzeVolatility()` | TI-E6 | Segment-Studie | Zonenbreite, Profi |
| Volumen | Up/Down-Volumen, RVOL | Karpoff 1987; GKM 2001; Llorente 2002 | HEUR | `volume-intelligence.analyze()` | TI-E7 | nur Tag (5 Titel) | Warum-Liste |
| AVWAP | VWAP ab großem Tief/Hoch | Shannon 2023 | HEUR (tagesbasiert) | `avwap()` | — | — | Profi |
| Volumenprofil | POC, Value Area 70 % | Steidlmayer & Koy 1986 | HEUR (Näherung) | `volumeProfile()` | — | — | Profi |
| Chartformationen | Doppelboden/-top, SKS, Dreiecke, Rechteck, Flagge, Cup & Handle | LMW 2000; SWZ 2007; Bulkowski; O'Neil | HEUR | `chart-patterns.analyze()` mit Erkennungszeit | TI-E2–E4 | Familie PATTERN | Profi, Warum-Liste, Reihe „Ausbrüche" |
| Wyckoff | SC/AR/ST/Spring/SOS/LPS, Phasen A–E | Wyckoff 1931; Pruden 2007 | HEUR (quantifiziert) | `wyckoff.analyze()` | TI-E5 | Richtung < 50 % → Gewicht 0 | Profi (beschreibend) |
| Konfluenz | gewichtete Richtung, Widerspruch sichtbar | Evidenzgrade | HEUR | `scenario.confluence()` | TI-I4 | Ablation | Ausblick, „Gemischt" |
| Szenarien | Entry/Ziele/Invalidation aus Konfluenz | — | HEUR | `scenario.directional()` | TI-I1 | Kern-Backtest | Zonen-Kacheln, Chart, Karten |
| Confidence | vier getrennte Größen | Spec §17 | HARD (System) | `overallConfidence()` | TI-I2–I4 | Kalibrierung **nicht bestanden** | „Einigkeit der Verfahren", Evidenzblock |

## 4. Research-Befund → Entscheidung → Umsetzung

| Befund | Entscheidung | Umsetzung | Test | Evidenz |
|---|---|---|---|---|
| Elliott-Regeln sind präzise, Zählung subjektiv; keine OOS-Evidenz | **angenommen** als Struktur-Prüfer, **nicht** als Prognosequelle | volle Grammatik, Gewicht 0,08 | EV2-* | Richtung 50,0 % im TEST |
| EWI-Präzisierungen (Flat 90 %, Diagonal-Overlap) | angenommen als DEFINITION | patterns.js | EV2-R5/R6 | — |
| Neely-Regelwerk | abgelehnt (abweichende Schule, Mischung wäre unsauber) | dokumentiert | — | — |
| Fibonacci-Niveaus haben keine Sonderstellung (Tsinaslanidis 2022) | angenommen; **eigene Prüfung bestätigt** | Fib nur als Konfluenz | TI-E8 | Fib-Häufungstest |
| S/R über Auftragsballung (Osler) | angenommen | Zonen statt Linien | TI-I1 | — |
| Trend/Momentum am besten belegt | angenommen → höchste Gewichte | Gewichte 0,30/0,20 | — | Ablation |
| Wyckoff ohne quantitative Tests | angenommen als beschreibend; Gewicht 0 nach VU-Messung | wyckoff.js | TI-E5 | < 50 % |
| Kerzenmuster ohne Wert (Marshall et al.) | **abgelehnt** | nicht implementiert | — | — |
| Lo-Mamaysky-Wang nutzen zentrierte Kernel-Fenster (Look-ahead live) | abgelehnt als Verfahren; Formationen nur aus bestätigten Pivots | chart-patterns.js | TI-E2 | — |
| Directional-Change-Rahmen (kausale Swings mit Bestätigungslatenz) | angenommen (entspricht pivot-engine) | pivotView | EV2-C1 | — |
| Multiple Testing / Overfitting (Harvey-Liu, López de Prado) | angenommen: TRAIN/VALIDATION/TEST, Einfrieren, ein Test-Lauf | ti-evidence --dev | — | Protokoll |
| Kalibrierung nur bei bestandenem Gate | angenommen | calibration() Gate | TI-I2 | nicht bestanden |

---

## 5. Elliott neu rekonstruiert (Master Mission II, §4–§5)

### 5.1 Was ein professioneller Elliott-Analyst tatsächlich tut

Quellen in Rangfolge: R. N. Elliott, *The Wave Principle* (1938) und *Nature's Law* (1946); Frost & Prechter, *Elliott Wave Principle* (10. Aufl., 2005); EWI-Lehrmaterial (Gorman & Kennedy 2013); Neely, *Mastering Elliott Wave* (1990, NEoWave); akademische Arbeiten (Abschnitt 5.4).

| Praktik | Quelle | Klasse | in der Engine |
|---|---|---|---|
| Drei unverletzliche Regeln (W2 < 100 %, W3 nie kürzeste, W4 kein Überlappen) | EWP S. 31 | Regel | ja (HARD) |
| Musterdefinitionen (Diagonale, Zigzag/Flat-Grenze, Dreieck, Kombinationen) | EWP Kap. 2 | Definition | ja; Triple Three/Triple Zigzag fehlen |
| Richtlinien (Alternation, Kanal, Extension, Gleichheit, Fibonacci-Verhältnisse, Tiefe von Korrekturen) | EWP Kap. 2–4 | Richtlinie | ja (Rang), Kanal nur W5 |
| Wellencharakter („Personality": W3 kräftig, W5 mit Divergenz, B trügerisch) | EWP Kap. 2 | Richtlinie, qualitativ | teilweise (W3-Tempo, W5-RSI-Divergenz in Count Quality) |
| Grad aus dem Gesamtbild wählen; Zählung muss auf allen Graden konsistent sein | EWP Kap. 1 „Degree" | Methode | 2.2: Mehrskalenwahl + Verschachtelung |
| Mit Alternativzählungen arbeiten, „preferred count" nur, bis der Markt widerspricht | EWP Kap. 8; EWI | Methode | ja (Alternativen, Kandidatenbaum); 2.2 Persistenz |
| Unklare Charts nicht zählen | Praktiker (Prechter: „when in doubt, stay out") | Haltung | 2.1/2.2: Anwendbarkeit + Enthaltung |
| Zeitrelationen (Fibonacci-Zeit) | EWP Kap. 4 (ausdrücklich unzuverlässig) | Richtlinie, schwach | nicht umgesetzt (bewusst) |

### 5.2 Schulen — nicht vermischt

| | klassisch (Frost & Prechter, EWI) | NEoWave (Neely) |
|---|---|---|
| Grundeinheit | Welle beliebigen Grades | „Monowave" mit festen Konstruktionsregeln |
| Gleicher Grad | nach Augenmaß und Proportion | **Rule of Similarity & Balance**: benachbarte Wellen gleichen Grades mindestens ⅓ in Preis *oder* Zeit |
| Zeit | Richtlinie | harte Grenzen (z. B. C ≤ A+B in der Zeit; E ≤ B+C+D) |
| Bestätigung | Bruch der 2-4-Linie usw. | „Post-pattern confirmation" als Pflicht |
| Mehrdeutigkeit | Alternativen | weniger Alternativen durch strengere Regeln |

Entscheidung: Die Engine bleibt **klassisch**. NEoWave-Regeln sind kein Konsens der Literatur und würden die Methode verändern statt sie abzubilden. Übernommen wird nur der Gedanke der Proportion als *Richtlinie* (Count Quality, Zeitproportion). Die fehlende Preis-Ähnlichkeit ist im Audit als Lücke dokumentiert.

### 5.3 Praktiker-Behauptung vs. Regel vs. Empirie (§108)

Praktiker berichten Erfolg mit Elliott. Das kann aus Risikomanagement (enge, regelbasierte Grenzen), Ermessen, Kontext und Kombination mehrerer Methoden entstehen, ohne dass einzelne Lehrbuchregeln isoliert einen statistischen Vorteil tragen. VU prüft deshalb nur die algorithmisch definierbaren Teile und benennt den Rest als nicht geprüft.

### 5.4 Akademische Arbeiten

Veröffentlichte Arbeiten zur automatischen Elliott-Erkennung (z. B. Vantuch, Zelinka & Vasant 2018; Studien zu Mustererkennung mit Klassifikatoren) berichten Richtungstreffer um 68–70 %. Sie vergleichen meist **nicht** mit einer Basis gleicher Geometrie und gleichen Marktkontexts; hohe Treffer entstehen schon durch Trendfortsetzung und Geometrie (VU-Befund: 59 % der Fälle sind bei Bestätigung schon überwiegend gelaufen). Ergebnisse dieser Art gelten hier als **nicht belastbar**, bis sie gegen eine strukturelle Kontrolle bestehen.

### 5.5 Ist die Engine „ZigZag + Pattern-Matcher"? (§5)

Teilweise ja — vor Mission II: Grad = feste Skala, keine Eltern-Kind-Prüfung, keine Enthaltung, zustandslos. Mit 2.2 kommen Mehrskalenwahl, Verschachtelung, Rauschgrenze, Anwendbarkeit, Count Quality und Persistenz dazu. Was weiterhin fehlt: Start an markanten Extremen, Preis-Proportion gleicher Grade, Triple-Kombinationen, Kanalziele, qualitative Wellencharakter-Merkmale (Breite, Stimmung). Details: ELLIOTT_AUDIT.md.
