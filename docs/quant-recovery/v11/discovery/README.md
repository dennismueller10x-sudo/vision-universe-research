# V11 – Strang DISCOVERY: Reverse Strategy Discovery & Alpha Attribution (Aufgaben 6–9)

**Status:** Studie abgeschlossen. `certificationStatus = NOT_CERTIFIED`, `productionApproved = false`. Evidenzart: `HISTORICAL_DEVELOPMENT_STUDY`. Die Oracle-Teile tragen das Label `ORACLE_LOOKAHEAD`. Die Python-Gegenrechnung ist `TECHNICAL_PARITY`.

Verbindliches Protokoll: [time-split-1.0.0.json](../protocol/time-split-1.0.0.json), SHA-256 `1ff32b61…0a69`, Regeln R1–R6.

**Ergebnis in einem Satz:** Keine der 24 auf TRAIN entwickelten Regeln hat in VALIDATION einen statistisch abgesicherten Überschuss (0/12 Holm je Familie, beide Endpunkte). Beide eingefrorenen Hypothesen verlieren in TEST gegenüber SPY. H1 (konzentrierte Qualität) ist dabei **signifikant schlechter** als SPY: −13,4 %/J, Holm-p 0,037.

## Firewall und Vorwissen (R4)

- **Nicht gelesen:** `v11/winners/`, `v11/decomposition/` und Ergebnisse anderer V11-Stränge.
- **Bekannt waren** (offengelegt in [registration-1.0.0.json](registration-1.0.0.json) unter `priorExposure`):
  - die V10-Befunde über 2000–2025, also über alle drei Perioden: Momentum-, Profitability- und Quality-ICs, Abklingen des NEW_52W_HIGH-Überschusses, Top-50 schlechter als die EW-Population;
  - die Literatur zu Momentum, 52-Wochen-Hoch, Low-Vol, Profitabilität und Qualität.
- **Mögliche Wirkung auf das Design:** Die Wahl der Familien (Momentum, Trendstabilität, Profitabilität, Qualität, Value) und des EW-Eigenuniversums als Selektions-Benchmark ist von diesem Vorwissen beeinflusst.

## Chronologie (Git belegt die Reihenfolge, Test `v11-discovery.test.mjs`)

| Commit | Inhalt |
|---|---|
| `7f0d20e9e1` | Registrierung: Plan, Endpunkte, Inferenz, Holm-Familien, **Auswahlregel für finale Hypothesen**. Kein Ergebnis berechnet. |
| `dadd1d9649` | TRAIN-Exploration (203 Varianten), Walk-Forward in TRAIN, Oracle TRAIN |
| `05ca5f85ed` | **Kandidaten eingefroren** (12 Kurs, 12 Fundamental) |
| `76480d017f` | Auswertungsskript; es läuft nur gegen committete, unveränderte Freeze-Dateien |
| `7a91051b6f` | **VALIDATION** einmal gerechnet |
| `108cb658c1` | Benchmark-Korrektur der kapitalgewichteten Population (siehe unten) |
| `7b10e91177` | **Finale Hypothesen eingefroren**. Die Regel aus `7f0d20e9e1` wurde mechanisch angewandt. |
| `245b852e33` | **TEST** einmal gerechnet und unverändert berichtet |
| danach | Oracle VALIDATION/TEST, Attribution, Marktkap.-Sensitivität, Python-Gegenrechnung, Tests |

## Methode

**Population**
- `createResearchLoader({identityEvidence, corporateActionEvidence, listingLifecycleEvidence})` mit der V10-Frame-Regel: 4.329 Listings.
- **Alle Reihen enden 2023 oder später.** TRAIN und VALIDATION enthalten deshalb keinen einzigen Delisting-Fall. Die Population ist bedingt auf Überleben bis mindestens 2023.
- Abdeckung der 10-K-Melder: 22 % (2010) bzw. 48 % (2020).
- In TEST gibt es 121 beendete Listings. Primär werden sie zum letzten Schluss verkauft. Schranken: −100 % und belegte Barabfindung. Bei H1/H2 kam es zu keinem erzwungenen Ausstieg.

**Universum**
- Kursfamilie: notierter (unbereinigter) Kurs ≥ 5 USD. Er wird aus dem bereinigten Schluss × spätere Split-Faktoren gebildet; dieser Kurs war damals öffentlich.
- Fundamentalfamilie: zusätzlich PIT-Marktkap. ≥ 300 Mio. USD.
- Kein Filter auf bereinigte Kurse: Er würde auf künftige Splits selektieren.

**Fundamentals**
- Quelle ist das private V10-PIT-Panel (`filed <` Stichtag), auf den Lifecycle-Frame geschnitten (230 Zeilen entfernt).
- Abdeckung je Stichtag steht in `coverage` der Ergebnisdateien. In TEST z. B. sind für H1 37 % der lebenden Frame-Titel zulässig, für H2 18 %.

**Ausführung und Kosten**
- Entscheidung am Wochenschluss, Ausführung am nächsten Wochenschluss.
- Kosten 10 + 5 bp je Seite, Stress 20 + 30 bp.
- **Renditebasis:** PRICE_RETURN auf beiden Seiten. SPY-Total-Return ist hier nicht belegt; TR existiert nur für 8 Titel und wird nicht gemischt.
- Bargeld wird mit 0 % verzinst.

**Ledger**
- `research-portfolio.cjs` (HISTORICAL_PRICE_SIMULATION, Numéraire 1) ist das offizielle Ledger.
- Ein schneller Simulator rechnet dieselbe Arithmetik. Parität je Kandidat ≤ 1e-14 (`engineLedger.parityWithSimulator`).

**Benchmarks**
- SPY (Kursrendite, ohne Kosten)
- EW-Eigenuniversum der Regel (Selektions-Benchmark)
- EW-Frame-Population
- PIT-kapitalgewichtete Population, 2010 und später

**Inferenz und Mehrfachtest**
- `research-validation.inferTemporalBlockMean` auf der wöchentlichen Renditedifferenz: Block 26 Wochen, Robustheit 52 Wochen, 1.999 Replikate. Zusätzlich Newey-West mit Lag 8.
- Holm je Familie.

## TRAIN-Exploration (R1) – „garden of forking paths“

Beleg: [train-exploration-log-1.0.0.json](train-exploration-log-1.0.0.json). Alle **203 Varianten** sind mit exakten Parametern geloggt: 108 Kurs, 66 Fundamental, 10 V10-Baselines, darin 3 Smoke-Läufe.

| Befund | Belegt durch |
|---|---|
| Die ungefilterten S1-Ergebnisse sind Survivorship-Artefakte (z. B. LOWBETA-N10 54 % CAGR, MOM3-N20 50 %). Sie stammen von Penny-Stock-Überlebenden (Mindestkurs < 1 USD: MITK, IESC, LPTH …). Darauf folgte der Kursfilter ≥ 5 USD (Designentscheidung nach TRAIN-Sicht, offengelegt). | S1 → S1b |
| Das EW-Universum (≥ 5 USD) erzielt in TRAIN 10,3 % gegenüber 1,3 % für SPY. Das ist vor allem Survivor-Konditionierung. Jede Regel „schlägt SPY“ in TRAIN; aussagekräftig ist nur der Vergleich mit dem EW-Eigenuniversum. | alle Stufen |
| „Let winners run“ (RUN) war in TRAIN durchweg schwach (Eigen-EW −6 … +1,7 %). Der Marktfilter (SPY > 40-W-SMA) halbiert den MaxDD (−25 % statt −70 %) und den Überschuss. | S2 |
| **Walk-Forward in TRAIN** ([train-walk-forward-1.0.0.json](train-walk-forward-1.0.0.json)): Die jeweils beste explorierte Variante (≥ 5 USD) erzielt out-of-sample −0,53 % je Intervall gegenüber dem EW-Eigenuniversum. Die durchschnittliche Variante liegt bei −0,23 %. Fundamental: −0,09 % gegenüber −0,12 %. **Die Auswahl der Besten hat schon innerhalb von TRAIN keinen Out-of-sample-Wert.** | WF |

## Kandidaten (R2) und VALIDATION

Belege:
- [candidates-frozen-1.0.0.json](candidates-frozen-1.0.0.json)
- [validation-results-1.0.0.json](validation-results-1.0.0.json)
- [validation-capweight-correction-1.0.1.json](validation-capweight-correction-1.0.1.json)

Perioden: Kurs 2013–2018, Fundamental 2017–2020. Überschuss = annualisiertes Mittel der wöchentlichen Differenz bei Basiskosten. Holm-p gilt je Familie (12).

| Kand. | Regel | CAGR | ggü. SPY (Holm-p) | ggü. EW-Eigen (p) | Stress ggü. SPY |
|---|---|---|---|---|---|
| CP01 | MOM6+REV1 N20 Buffer | 10,8 % | +2,5 % (1,0) | +2,8 % (0,62) | −2,8 % |
| CP03 | MOM12-1+REV1 N20 InvVol | 14,4 % | +5,3 % (1,0) | +5,7 % (0,24) | −3,0 % |
| CP08 | MOM6 N20 quartalsweise | 2,2 % | −5,6 % (1,0) | −5,3 % | −7,8 % |
| CP09 | MOM6 N50 Buffer + Marktfilter | 9,3 % | 0,0 % (1,0) | +0,4 % | −2,2 % |
| CP12 | Let winners run (MOM6) | 6,7 % | −0,8 % (1,0) | −0,5 % | −1,9 % |
| übrige CP | Momentum-Varianten | 8,6–11,9 % | −0,5 … +2,2 % | | alle < 0 |
| CF01–CF05, CF11 | Value-haltige Regeln | −2,5 … 12,2 % | −9,8 … +0,2 % | −13,4 … −5,7 % | |
| CF06 | **Qualität N10 quartalsweise** | 31,4 % | **+15,7 % (0,16)** | +13,0 % (p 0,035) | +14,3 % |
| CF10 | **Profitabilität + Momentum N20 quartalsweise** | 28,2 % | **+13,5 % (0,16)** | +8,1 % (0,10) | +12,2 % |
| CF12 | Let winners run + Qualitätsausstieg | 31,8 % | +16,7 % (0,46) | +11,0 % (0,049) | +15,6 % |
| CF07–CF09 | Qualität / defensive Qualität | 16–19 % | +1,9 … +4,9 % | −1,2 … +1,8 % | |

SPY lag bei 10,6 % (Kurs) bzw. 14,0 % (Fundamental); die korrigierte kapitalgewichtete Population bei 10,0 % bzw. 13,1–13,4 %.

**0/12 Holm-Ablehnungen je Familie, für beide Endpunkte.** Die Überschüsse von CF06, CF10 und CF12 sind **beobachtet, nicht abgesichert**.

## Finale Hypothesen (R3) und TEST

Belege: [final-hypotheses-frozen-1.0.0.json](final-hypotheses-frozen-1.0.0.json) und [test-results-1.0.0.json](test-results-1.0.0.json).

**Auswahl.** Die Regel wurde vor VALIDATION festgelegt:
- zulässig, wenn der Überschuss ggü. SPY, ggü. dem EW-Eigenuniversum und unter Stresskosten jeweils > 0 ist;
- Rang nach Holm-p (SPY), dann nach p ggü. EW-Eigen;
- höchstens 3 insgesamt und 2 je Familie.

Zulässig waren CF06, CF07, CF10 und CF12. Gewählt wurden CF06 → **H1** und CF10 → **H2**. CF07 und CF12 fielen nur wegen der Grenze „max. 2 je Familie“ heraus. **Kein Kurskandidat war zulässig**, deshalb geht die Kursfamilie nicht in TEST.

TEST, Fundamental 2021–2025, Bewertung bis 2026-01; einmal gerechnet:

| | H1 Qualität N10 Q | H2 Profit.+Momentum N20 Q | SPY | EW-Eigen H1 / H2 | Kap.-gew. |
|---|---|---|---|---|---|
| CAGR | **−2,5 %** | 4,5 % | 13,2 % | 6,6 % / 6,1 % | 11,6 % |
| Überschuss ggü. SPY (p, Holm) | **−13,4 %/J (0,019; Holm 0,037 – signifikant negativ)** | −5,6 % (0,38; 0,38) | | | |
| ggü. EW-Eigen (p) | −8,0 % (0,16) | 0,0 % (1,0) | | | |
| MaxDD / Sharpe | −33 % / 0,01 | −34 % / 0,30 | | | |
| Erstes Jahr bis 2022-01-07 | +10,3 % | −7,2 % | +25,9 % | | |
| Danach (CAGR) | −5,4 % | +7,5 % | +10,1 % | | |
| Stress-CAGR | −3,8 % | +3,0 % | | | |

Zur Einordnung: TEST ist zeitlich getrennt, aber nicht unberührt. V10 kannte die ICs dieser Jahre. Auch ein Erfolg wäre keine bestätigende Vorwärtsevidenz gewesen.

## Oracle (R5, `ORACLE_LOOKAHEAD`, nur Obergrenze)

Belege:
- [oracle-train-1.0.0.json](oracle-train-1.0.0.json) (vor dem Kandidaten-Freeze gerechnet)
- [oracle-validation-1.0.0.json](oracle-validation-1.0.0.json)
- [oracle-test-1.0.0.json](oracle-test-1.0.0.json) (beide jeweils nach dem passenden Freeze)

Definition: Top-N nach realisierter Kursrendite im Haltefenster, gleichgewichtet, gleiche Kosten und gleicher Rhythmus.

**Größenordnung der Obergrenze** (TRAIN, ≥ 5 USD, N 20)
- je 4-Wochen-Intervall: 35 % brutto gegenüber 0,9 % für die Population;
- je 52-Wochen-Intervall: 185 % gegenüber 13 %.

**Oracle-Lücke**
- **(a) V10-Regeln** (N10, 13 W): Anteil an der Oracle-Prämie −1,4 … −0,1 % in TRAIN, −2,1 … −0,4 % in VALIDATION, +0,2 … +1,1 % in TEST. Die mittlere Perzentile der Zukunftsrendite der gewählten Titel liegt bei 0,46–0,54 (Zufall: 0,50). Die Trefferquote für die Oracle-Top-10 entspricht der Zufallsquote.
- **(b) Eigene Kandidaten:** 0–4 % der Prämie.
  - Kurs: Trefferquote Top-N 5–11 % gegenüber 1–3 % zufällig. Die Perzentile bleibt bei ≈ 0,48–0,51; die Titel liegen also öfter in beiden Extremen, weil Momentum hohe Volatilität wählt.
  - H1 in TEST: −1,5 %, Perzentile 0,46. H2: 0,0 %.
- **(c) Population:** definitionsgemäß 0 %.
- **Zerlegung:** Gewichtung (EW gegenüber Ist-Gewicht) und Timing/Cash sind gegenüber der Auswahl vernachlässigbar. **Die Lücke ist fast vollständig Auswahl.** Die Regeln erkennen die späteren Extremgewinner nicht besser als der Zufall.

## Attribution (Aufgabe 9)

Beleg: [attribution-1.0.0.json](attribution-1.0.0.json), alle 24 Kandidaten und beide Hypothesen.

Zerlegung: Beta gegen SPY, Effekt des EW-Universums gegenüber SPY, Querschnittsregression je Intervall (Momentum 12-1/3M, Volatilität, log-Marktkap., Qualität, Value, Wachstum, Profitabilität), spezifische Auswahl, Top-5-Konzentration, Kosten, Cash.

**Kurskandidaten in VALIDATION**
- Beta 0,9–1,5.
- Bruttoauswahl gegenüber dem Universum +4 … +11 %/J, fast ganz als **Momentum-Exposure** (+2 … +8 %/J). Kurzfrist-Momentum kostet die MOM3-Regeln −3 … −4 %/J.
- **Kosten 1–4 %/J** fressen den Rest (Umschlag 3–12×/J).
- Netto bleibt gegenüber SPY 0–5 %, nicht signifikant.

**Value-haltige Fundamentalregeln (VALIDATION)**
- Verlust −10 … −13 %/J, fast vollständig **Value-Beitrag (−8 … −15 %/J)**. Das ist der Value-Einbruch 2017–2020.

**CF06/H1 (Qualität N10)**
- VALIDATION: +13,4 %/J Auswahl. Davon Qualität +2,6, Profitabilität +1,0 und **spezifisch +9,0**. Top-5-Titel tragen 85 % des relativen Beitrags; das ist ein Konzentrationsergebnis.
- TEST: Das spezifische Glück kehrt sich um (−6,4 %/J). Das EW-Universum liegt −5,4 %/J hinter SPY, weil Mega-Caps 2021–2025 dominierten.
- Ergebnis −13,4 %/J.

**CF10/H2 (Profitabilität + Momentum)**
- VALIDATION: Value +4,9, Profitabilität +4,0 und Wachstum +2,6 %/J.
- TEST: Auswahl ≈ 0 (Momentum +4,1, Profitabilität −1,8, spezifisch −3,1). Der ganze Rückstand zu SPY ist der Universumseffekt (−5,6 %/J).

**Let-winners-run** (CP12/CF12): kein eigener Beitrag. Die relativen Beiträge hängen an wenigen Titeln; der Top-5-Anteil ist instabil, weil die Netto-Summe nahe 0 liegt.

## Datenqualität: PIT-Marktkapitalisierung

Das V10-Panel enthält XBRL-Skalenfehler, z. B. ON 3,5e18 USD (2013) und YUM 2,4e22 USD (2017).

**Wirkung:** Die kapitalgewichtete Population in `validation-results-1.0.0.json` ist dadurch **ungültig**; dort ist sie als `capWeighted` noch roh.

**Korrektur:**
- Plausibilitätsregel 1.0.1: Marktkap. ≤ 5e12 USD und implizite Aktienzahl innerhalb 0,2–5× gegenüber 12 Stichtagen zuvor.
- Festgelegt nach VALIDATION und vor TEST. Für TEST ist sie in `capWeighted` angewandt; die Rohvariante steht als `capWeightedRawPanelInvalid`.
- Für VALIDATION gibt es eine nachträgliche Korrekturdatei.

**Zählung:** 4.589 von 370.386 Zeilen sind unplausibel, davon 149 über 5e12.

**Sensitivität** ([mcap-plausibility-sensitivity-1.0.0.json](mcap-plausibility-sensitivity-1.0.0.json)): Fundamentalkandidaten mit plausibler Marktkap. im 300-Mio.-Filter weichen ≤ 1,1 Pp CAGR ab. H1 bleibt unverändert, H2 sinkt von 4,50 auf 4,37 %. Die eingefrorenen Spezifikationen wurden nicht geändert.

Resteinschränkungen:
- ADS-Aktienzahlen (z. B. HSBC) bleiben falsch.
- Value-Scores, die auf fehlerhafter Marktkap. beruhen, wurden nicht neu gerechnet.

## Python-Gegenrechnung

Beleg: [python-check-1.0.0.json](python-check-1.0.0.json), erzeugt mit `scripts/quant/v11/discovery/verify_discovery.py` (stdlib, `python3 -I`).

Getrennte Implementierung aus den exportierten Loader-Daten: Auswahl, Ledger mit Kosten, CAGR, MaxDD, Sharpe, SPY-Überschuss und Blockbootstrap-p.

Geprüft wurden CF06, CF10 (VALIDATION), H1, H2 (TEST) und die Oracle-Zelle TRAIN 52 W N20. **5/5 PASS**, max. Abweichung 2e-15, p identisch. Grenze: Die Loader-Qualifikation ist als Eingabe übernommen; eine zweite Sprache ist kein Holdout.

## Reproduktion

```bash
node scripts/quant/v11/discovery/explore-train.cjs scripts/quant/v11/discovery/stages/<stufe>.json   # TRAIN, privates Log
node scripts/quant/v11/discovery/wf-train.cjs && node scripts/quant/v11/discovery/oracle.cjs --period TRAIN --compare …
node scripts/quant/v11/discovery/compile-train.cjs && node scripts/quant/v11/discovery/freeze-candidates.cjs
node scripts/quant/v11/discovery/validate.cjs --stage VALIDATION      # verweigert ohne committete Freeze-Datei / bei vorhandenem Ergebnis
node scripts/quant/v11/discovery/select-final.cjs && node scripts/quant/v11/discovery/validate.cjs --stage TEST
node scripts/quant/v11/discovery/attribution.cjs; node scripts/quant/v11/discovery/mcap-sensitivity.cjs
node scripts/quant/v11/discovery/export-check-input.cjs && python3 -I scripts/quant/v11/discovery/verify_discovery.py <input> docs/quant-recovery/v11/discovery
node --test quant/tests/v11-discovery.test.mjs
```

Private Zwischenstände (Scratchpad `v11-private/discovery/`): TRAIN-Log mit Intervallrenditen, Pfade, Python-Eingabe. SEC-Abrufe: 0.

## Grenzen

- Survivor-Frame: TRAIN und VALIDATION ohne jeden Delisting-Fall.
- Kursrenditen ohne Dividenden.
- Wochenschlüsse, keine Kapazitäts- oder Volumenprüfung.
- Fiskalkalender der Fundamentals aus heutigem Stand (V10-Befund 10).
- Die Walk-Forward-Intervalle überlappen nicht, die Varianten sind aber stark korreliert.
- Der Blockbootstrap hat nur 8–14 Blöcke je Periode.
- Die Oracle-CAGR sind astronomisch und nur als Obergrenze lesbar.

## Nachträge aus der unabhängigen V11-Prüfung

- **m1:** H1 „signifikant schlechter als SPY“ ist fragil: Blockbootstrap p 0,0185 bei 10 Blöcken (Holm 0,037), Newey-West t −2,11 (p ≈ 0,035, Holm ≈ 0,07), Robustheit mit 52-W-Blöcken nur 5 Blöcke. Richtung und Größe tragen, die Signifikanz nicht sicher.
- **m2:** Die genannten XBRL-Fehlergrößen sind falsch: Panel-Maxima ON 3,86e15 (2013-05-31), YUM 3,15e16 (2016-10-28), CB 2,01e16; größter Wert EEFT 7,9e18 (2021); 149 Zeilen > 5e12. Die Plausibilitätsregel und ihre Wirkung sind davon unberührt (der Text in `rules.cjs`/`evaluate.cjs` nennt die alten Zahlen).
- **M2 (Survivorship):** Auch der Vergleich mit dem EW-Eigenuniversum ist regelabhängig verzerrt (VALIDATION ohne Delisting-Fall); „nur dieser Vergleich ist aussagekräftig“ ist zu stark.
- **m5:** Die Fundamental-TRAIN-Exploration (2011–2016) prüfte Momentum-Rangsummen über 2013–2016 = Kurs-VALIDATION, bevor die Kurskandidaten eingefroren wurden; das begünstigt die Kurskandidaten, deren VALIDATION trotzdem null blieb.
- **m6:** Die Einmal-Sperre ist mit `--out-dir` umgehbar; Dateisystem und Reflog zeigen keine weiteren Läufe.
- **m8:** „Spezifisch“ ist der Residualterm; Momentum-Exposure einer Momentum-Regel ist mechanisch. Für MOM3-Regeln (CP04–06) heben sich mom12 und mom3 fast auf, der Beitrag ist überwiegend spezifisch (+3,1 … +5,6 % p. a.). OLS auf Rohrenditen, fehlende Werte als 0.
- **m9:** Die Python-Gegenrechnung prüft 5 Zellen; der Bootstrap ist derselbe portierte Generator (Seed 1729) – „p identisch“ ist konstruktionsbedingt.
- **m11:** `canEnter` verlangt einen Schluss in der Folgewoche, und in der letzten Woche einer Reihe wird nicht gekauft (kleiner Look-ahead); bei H1/H2 ohne Wirkung (0 erzwungene Ausstiege).
