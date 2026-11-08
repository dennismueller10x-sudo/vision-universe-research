# Musterstudie: Kursrendite gegen Gesamtrendite über den vollständigen Bestand

Entscheidung FV-5, Schritt 1 (Owner, 02.11.2026): „Die Gesamtrendite ist als Forschungsgrundlage sinnvoll. Bereite eine nachvollziehbare Vorher-Nachher-Prüfung für den vollständigen Datenbestand und die Zertifizierungsanbindung vor. Aktivierung erst nach fachlicher Prüfung.“

Dieser Bericht hält das Ergebnis des Prüflaufs fest. **Er aktiviert nichts.** Das Produktartefakt `quant/data/product/pattern-research-v1/study.json` bleibt Kursrendite, und das Zertifikat bleibt unverändert.

## Lauf

| | |
|---|---|
| Workflow | `.github/workflows/quant-pattern-total-return-check.yml` (`permissions: contents: read`, kein Commit) |
| Lauf | [41496424128](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41496424128), Commit `1de37ef8b6`, 02.11.2026 18:00–18:22 UTC, Ergebnis `success` |
| Tageshistorie | private Ablage, nur gelesen (`sync-history-store.mjs --pull --gate FULL_UNIVERSE`): 7.803 von 7.804 Reihen, 23,8 Mio. Tageskerzen, 0 Schreibzugriffe (Class A 0) |
| Vorher | `build-pattern-research.mjs --work-dir … --return-basis price --out $RUNNER_TEMP/pattern-price` |
| Nachher | `build-pattern-research.mjs --work-dir … --return-basis total --out $RUNNER_TEMP/pattern-tr` |
| Vergleich | `scripts/quant/research/compare-pattern-return-basis.mjs` |
| Kurzfassung | [`docs/quant/research/pattern-total-return-full-check.json`](research/pattern-total-return-full-check.json): bytegleich zum Laufartefakt, SHA-256 `9bc3d77d6d92f6fc2f2015f84a7ae612bf72e3c50316075f846ddc2a2913d84c` |
| Laufartefakt | `pattern-total-return-check`, 30 Tage: beide Studien, der volle Vergleich, die Zertifizierungsprobe, Preflight- und Sync-Bericht |

Der Vorher-Lauf reproduziert die committete Produktstudie exakt (`contentHash` `4f2d76fa107df79b`). Kurs- und Gesamtrenditelauf lesen also denselben Stand.

Die Kurzfassung enthält nur Aggregate: Abdeckung, Ausschlüsse nach Grund, Basisquoten, Urteile und Lifts je Hypothese. Sie enthält keinen Titel und keinen Kurs. Welche Titel ausgeschlossen sind, steht nur im Laufartefakt (`pattern-tr/study.json`, `population.totalReturnCoverage.excluded`).

## Abdeckung

| | |
|---|---|
| Zustand | **PASS** (kein `BELOW_MINIMUM_SHARE`) |
| bestätigte Gesamtrendite | 4.929 von 5.059 Reihen = **97,43 %** (Mindestanteil 95 %) |
| ausgeschlossen | 130 Reihen: `CORPORATE_ACTION_CONTRADICTED` 96, `DIVIDEND_MISSING` 32, `SPLIT_MISSING` 2 |
| Rekonstruktion | `TOTAL_RETURN_RECONSTRUCTED` 4.929 · `REJECTED_OTHER` 96 · `REJECTED_DIVIDEND_GAP` 32 · `REJECTED_SPLIT_GAP` 2 · `REJECTED_IDENTITY` 0 |
| Listing-Schnitte | 26 |
| Ergebnis ohne Gesamtrendite-Wochenwert | 0 in jedem Horizont (H12, H24, H36, H60) |
| Beobachtungen | 950.510 → 917.541 (−32.969, nur durch die ausgeschlossenen Titel) |

## Vorher/Nachher

Die beiden Studien sind **nicht gepaart**. Die Gesamtrenditestudie enthält die 130 ausgeschlossenen Titel nicht. Unterschiede vermischen deshalb zwei Effekte: den Wechsel der Renditebasis und die kleinere Population. Erkennung, Merkmale, Schwellen, Horizonte und Folds sind in beiden Läufen identisch (pattern-research-1.1.0). Die Trennung der beiden Effekte steht im Abschnitt [Gepaarter Vergleich](#gepaarter-vergleich).

**Primär H24 / W100 (Verdopplung in 24 Monaten)**

| | Kursrendite | Gesamtrendite |
|---|---|---|
| auswertbare Beobachtungen | 830.076 | 800.227 |
| Gewinner | 89.925 | 94.045 |
| Basisquote | 10,83 % | 11,75 % (+0,92 Pp) |
| Hypothesen | 163 | 163 |
| ROBUST | 96 | **97** (96 gehalten, 1 neu, 0 verloren) |
| IN_SAMPLE_ONLY / NOT_SIGNIFICANT / INSUFFICIENT_SUPPORT / PARAMETER_SENSITIVE | 46 / 11 / 9 / 1 | 48 / 10 / 8 / 0 |
| Median-Lift der 96 gehaltenen ROBUST-Befunde | 1,512 | 1,462 (Δ −0,055; OOS Δ −0,048) |

Vier Urteile wechseln. Dazu gehört `quiet-range+high-volatility`, das von PARAMETER_SENSITIVE auf ROBUST steigt (Lift 2,21 → 2,04, OOS 1,70 → 1,47).

**ROBUST je Horizont**

| Horizont | Basisquote W100 Kurs → TR | ROBUST Kurs → TR | gehalten / neu / verloren | Median-Δ Lift (gehaltene) |
|---|---|---|---|---|
| H12 | 5,63 % → 5,79 % | 98 → 99 | 98 / 1 / 0 | −0,008 |
| **H24 (primär)** | 10,83 % → 11,75 % | 96 → 97 | 96 / 1 / 0 | −0,055 |
| H36 | 15,61 % → 17,81 % | 97 → 91 | 91 / 0 / 6 | −0,079 |
| H60 | 25,29 % → 30,62 % | 68 → **43** | 43 / 0 / 25 | −0,118 |

**Basisquoten W200 / W400** (Kurs → TR): H12 1,89 → 1,90 % / 0,60 → 0,58 %; H24 3,92 → 4,09 % / 1,30 → 1,32 %; H36 5,97 → 6,49 % / 2,00 → 2,12 %; H60 11,71 → 13,84 % / 4,14 → 4,66 %.

### Fachliche Lesart (zur Prüfung, keine Entscheidung)

- **Primärbefund stabil.** Im registrierten Primärhorizont H24 bleiben alle 96 ROBUST-Befunde ROBUST, und einer kommt hinzu. Die Lifts sinken leicht, weil die Basisquote mit Dividenden steigt.
- **Lange Horizonte reagieren deutlich.** In H60 verlieren 25 von 68 ROBUST-Befunden die Robustheit, in H36 sind es 6 von 97. Betroffen sind fast nur Momentum- und Schubmuster (`six-month-thrust`, `three-month-thrust`, `near-52w-high`, `wide-range`, `high-volatility` und ihre Paare). Ihr Lift lag in Kursrendite knapp über 1 (1,02–1,14) und fällt in Gesamtrendite auf etwa 0,91–1,09.
- **Wahrscheinliche Erklärung.** Über fünf Jahre hebt die wiederangelegte Ausschüttung vor allem die Nicht-Gewinner-Population mit hoher Dividende über die Verdopplungsschwelle (Basisquote +5,3 Pp). Schubtitel schütten wenig aus und gewinnen dadurch kaum. Ihr Vorsprung in Kursrendite war also zum Teil ein Dividendeneffekt der Vergleichsgruppe.
- Das spricht **fachlich für** die Gesamtrendite als Grundlage. Für die Aktivierung gilt aber: Sekundärhorizonte verlieren Befunde. Was auf der Seite oder in Pattern Match von H36/H60-Befunden abhängt, muss im Fachmodell-PR benannt werden.

## Gepaarter Vergleich

Owner, 02.11.2026: „Noch keine Freigabe zur produktiven Aktivierung der Gesamtrendite-Musterstudie. Führe einen gepaarten Vorher-Nachher-Vergleich mit identischer Titelpopulation durch. Untersuche insbesondere die Robustheitsverluste bei H36 und H60 und trenne Populationseffekt und Renditeeffekt.“

### Aufbau

| Rechnung | Aufruf | Population | Ausgänge |
|---|---|---|---|
| **A** | `--return-basis price` | volle Population, 5.059 Reihen, 950.510 Beobachtungen | Kursrendite |
| **B** | `--return-basis price --population total-return` | genau die 4.929 Reihen mit bestätigter Gesamtrendite, 917.541 Beobachtungen | Kursrendite |
| **C** | `--return-basis total` | dieselben 4.929 Reihen, 917.541 Beobachtungen | Gesamtrendite |

- **Populationseffekt = B − A**, **Renditeeffekt = C − B**.
- `--population total-return` wählt nur die Population aus. Erkennung, Merkmale, Schwellen, Folds und der Studienlauf bleiben unverändert. Es ist ein reiner Forschungslauf: Er verlangt `--work-dir` und `--out`, schreibt nie den Produktpfad und lässt sich nicht mit `--return-basis total` kombinieren. Ohne den Schalter ist der Erzeuger bytegleich (Golden-Hashes der bestehenden Tests unverändert).
- Ein Test belegt die reine Populationsauswahl: B ist inhaltsgleich zur Kursstudie, wenn man sie nur auf den belegten Titeln rechnet.
- Der Vergleich prüft die Paarung von B und C und verweigert sonst: gleiche ausgeschlossene Kennungen, gleiche Beobachtungen, gleiche auswertbare Beobachtungen je Horizont. Beobachtungen, deren Ausgang nur in einer der beiden Basen messbar ist, gibt es keine (0 in jedem Horizont).
- Lauf [41506146031](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/41506146031), Commit `8aebaaa0a7`, 02.11.2026 19:02–19:29 UTC, `success`. A reproduziert die Produktstudie (`contentHash` `4f2d76fa107df79b`), C reproduziert den ersten Prüflauf (`5110fa213c63b0a8`). B hat `2db2b806bdbfe301`.
- Kurzfassung: [`docs/quant/research/pattern-total-return-paired.json`](research/pattern-total-return-paired.json). Sie ist bytegleich zum Laufartefakt `pattern-total-return-paired.json` (SHA-256 `d19644094a88fc6ee9c463e5499fd67fae0e161af6faa33203162edc567743a6`) und enthält nur Aggregate, keine Titel und keine Kurse.

### Ergebnis je Horizont (W100)

| Horizont | Basisquote A → B → C | Populationseffekt | Renditeeffekt | ROBUST A / B / C | Median-Lift der gehaltenen A / B / C |
|---|---|---|---|---|---|
| H12 | 5,63 → 5,58 → 5,79 % | −0,05 Pp | +0,20 Pp | 98 / 99 / 99 | 2,005 / 2,044 / 2,007 |
| **H24 (primär)** | 10,83 → 10,82 → 11,75 % | −0,02 Pp | +0,94 Pp | 96 / 98 / 97 | 1,509 / 1,527 / 1,461 |
| H36 | 15,61 → 15,63 → 17,81 % | +0,02 Pp | **+2,17 Pp** | 97 / 98 / 91 | 1,292 / 1,305 / 1,220 |
| H60 | 25,29 → 25,45 → 30,62 % | +0,16 Pp | **+5,18 Pp** | 68 / 69 / 43 | 1,286 / 1,300 / 1,161 |

### Zerlegung der Änderungen

| Horizont | gehalten | verloren durch Population | verloren durch Rendite | durch Population gewonnen | durch Population gewonnen, durch Rendite verloren |
|---|---|---|---|---|---|
| H12 | 98 | 0 | 0 | 1 | 0 |
| H24 | 96 | 0 | 0 | 1 | 1 |
| **H36** | 91 | **0** | **6** | 0 | 1 |
| **H60** | 43 | **0** | **25** | 0 | 1 |

Kein Befund wird durch die Rendite gewonnen. Kein Befund geht durch die Population verloren, und keiner wird durch die Rendite zurückgewonnen.

- **Die Robustheitsverluste in H36 und H60 sind vollständig ein Renditeeffekt.** Die Population verschiebt die Lifts der 31 verlorenen Befunde sogar leicht nach oben (Median ln-Lift +0,008). Der Wechsel auf Gesamtrendite senkt sie (Median ln-Lift −0,072 in H36, −0,109 in H60).
- **Der eine neue ROBUST-Befund in H24 und H12 ist ein Populationseffekt, kein Renditeeffekt.** `quiet-range+high-volatility` wird schon in B ROBUST, weil die 130 ausgeschlossenen Titel fehlen. In H24 sinkt sein Lift dabei von 2,21 über 2,22 auf 2,04.
- Je Horizont gibt es außerdem einen Befund, der nur in B ROBUST ist: in H24 `strong-12m-momentum` (Lift 1,03), in H36 `very-strong-12m-momentum+high-volatility` und in H60 `near-52w-high+three-month-thrust`. Alle drei liegen in A und C knapp unter der Schwelle.

### Die verlorenen Befunde

**H36:** 6 Befunde. Familien: Momentum 12M 3, Nähe Hoch 3, Schub 3, Spanne 1, Volumen 1. Ein Paar zählt in beiden Familien.

| Befund | Urteil C | Lift A / B / C | OOS-Lift A / B / C |
|---|---|---|---|
| `very-strong-12m-momentum+six-month-thrust` | NOT_SIGNIFICANT | 1,092 / 1,108 / 1,021 | 1,136 / 1,151 / 1,068 |
| `very-strong-12m-momentum+wide-range` | NOT_SIGNIFICANT | 1,088 / 1,100 / 1,012 | 1,128 / 1,139 / 1,052 |
| `weak-12m-momentum+near-52w-high` | NOT_SIGNIFICANT | 1,166 / 1,179 / 1,120 | 1,095 / 1,104 / 1,071 |
| `at-all-time-high+six-month-thrust` | NOT_SIGNIFICANT | 1,054 / 1,055 / 0,980 | 1,077 / 1,081 / 1,010 |
| `at-all-time-high+three-month-thrust` | NOT_SIGNIFICANT | 1,058 / 1,063 / 0,993 | 1,092 / 1,100 / 1,030 |
| `up-volume-dominance` | IN_SAMPLE_ONLY | 1,060 / 1,064 / 1,038 | 1,019 / 1,023 / 0,992 |

**H60:** 25 Befunde. Familien: Schub 15, Volumen 10, Spanne 5, Trend 5, Volatilität 5, Abstand vom Hoch 3, Momentum 12M 2, Nähe Hoch 2.

- 15 Befunde enden als IN_SAMPLE_ONLY: Der OOS-Lift fällt unter 1.
- 10 Befunde enden als NOT_SIGNIFICANT.
- Die Lifts in A lagen zwischen 1,02 und 1,14, in C liegen sie zwischen 0,91 und 1,09.
- Beispiele: `six-month-thrust` 1,054 / 1,061 / 0,955 (OOS 1,080 → 0,982), `three-month-thrust` 1,106 / 1,112 / 1,008, `trend-stacked+high-volatility` 1,110 / 1,120 / 1,005.
- Die vollständige Liste mit Lift und OOS-Lift A/B/C steht in der Kurzfassung (`horizons[].lost.findings`).

Unter den 43 gehaltenen H60-Befunden stellt die Familie **Abstand vom Hoch** (`deep-drawdown`, `far-below-52w-high` und ihre Paare) mit 23 Nennungen die Mehrheit.

### Ursache: Vergleichsgruppe statt Gewinnerquote

Lift = Gewinnerquote im Muster / Basisquote. Für jeden der 31 verlorenen Befunde (H36 und H60) gilt:

- **Die Gewinnerquote im Muster sinkt nicht, sie steigt.** In H60 liegt der Anstieg relativ bei +4 bis +16 %, typisch +8 %.
- **Die Basisquote steigt stärker** (H60: 25,45 → 30,62 %, +20 %). Ursache ist bei allen 31 `BASISQUOTE_STEIGT_STAERKER`; `GEWINNERQUOTE_SINKT` kommt bei keinem vor.
- Die Vergleichsgruppe außerhalb des Musters gewinnt relativ +20 bis +22 % Gewinner hinzu, das Muster nur +4 bis +16 %.

| je verlorenem Befund (H60, Spanne über 25 Befunde) | im Muster | Vergleichsgruppe |
|---|---|---|
| Anteil Ausschütter (ex ante, 52 Wochen ≥ 0,25 %) | 14–44 % | 57–60 % |
| Median-Ausschüttungsrendite der letzten 52 Wochen | 0,00 % (eine Ausnahme 0,01 %) | 0,87–1,10 % |
| relativer Zuwachs der Gewinnerquote durch Gesamtrendite | +4 bis +16 % | +20 bis +22 % |

In H36 zeigt sich dasselbe Bild schwächer: Anteil Ausschütter 17–48 % gegen 56–58 %, Zuwachs +5 bis +11 % gegen +14 bis +15 %.

### Mechanismus-Prüfung: „Dividenden heben die Vergleichsgruppe über die Verdopplungsschwelle“

Gepaarte Beobachtungen aus B und C: dieselben Beobachtungen, Ausgang in beiden Basen.

**Neue Gewinner** sind Beobachtungen, die nur in Gesamtrendite die Schwelle +100 % erreichen:

| Horizont | neue Gewinner | Gewinner nur in Kursrendite |
|---|---|---|
| H12 | 1.867 | 113 |
| H24 | 7.594 | 98 |
| H36 | 16.266 | 83 |
| H60 | 33.647 | 69 |

Die wenigen Gewinner, die es nur in Kursrendite gibt, liegen alle im Bucket ohne Ausschüttung. Das ist Rundung der zwei Wochenabtastungen.

**H60 nach der Ausschüttungsrendite der 52 Wochen vor der Beobachtung (ex ante):**

| Bucket | Anteil | Median-Rendite | Gewinnerquote Kurs → Gesamt | neue Gewinner je Beobachtung | Anteil an allen neuen Gewinnern |
|---|---|---|---|---|---|
| keine (< 0,25 %) | 43 % | 0,00 % | 30,5 → 31,5 % | 1,0 % | 8 % |
| Q1 | 14 % | 0,89 % | 27,8 → 31,6 % | 3,8 % | 10 % |
| Q2 | 14 % | 1,96 % | 23,7 → 30,4 % | 6,6 % | 18 % |
| Q3 | 14 % | 3,25 % | 19,4 → 28,8 % | 9,4 % | 26 % |
| Q4 | 14 % | 6,45 % | 15,3 → 29,0 % | 13,7 % | 38 % |

- In Kursrendite sinkt die Gewinnerquote mit der Ausschüttung von 30,5 auf 15,3 %. In Gesamtrendite ist sie über alle Buckets fast gleich (28,8–31,6 %).
- Die Kursrendite hat Ausschütter also systematisch als Nicht-Gewinner gezählt.
- Nach der im Horizont **realisierten** Ausschüttung ist das Bild noch schärfer: Das oberste Quartil (Median 34,5 % über fünf Jahre) steigt von 10,7 auf 25,2 %. Der Bucket ohne Ausschüttung bekommt 4 neue Gewinner von 33.647.

| Prüfung (vorab festgelegt im Vergleichsskript) | H36 | H60 |
|---|---|---|
| 1. Neue Gewinner kommen überproportional von Ausschüttern (Quote neuer Gewinner im obersten Quartil > ohne Ausschüttung) | ja: 5,7 % gegen 0,5 % | ja: 13,7 % gegen 1,0 % |
| 2. Die verlorenen Muster schütten weniger aus als ihre Vergleichsgruppe (≥ 2/3 der Befunde) | 6 von 6 | 25 von 25 |
| 3. Die Vergleichsgruppe gewinnt relativ mehr Gewinner hinzu als das Muster (≥ 2/3 der Befunde) | 6 von 6 | 25 von 25 |
| **Zustand** | **BESTÄTIGT** | **BESTÄTIGT** |

In H12 und H24 geht kein Befund verloren (Zustand NICHT_ANWENDBAR). Prüfung 1 ist auch dort erfüllt: H24 2,5 % gegen 0,25 %.

**Lesart:**

- Der H36/H60-Vorsprung der Schub-, Momentum- und Volatilitätsmuster war in Kursrendite überwiegend ein **Messartefakt der Vergleichsgruppe**. Diese Muster treffen fast nur Titel ohne Ausschüttung. Ihre Vergleichsgruppe enthält die Ausschütter, deren Verdopplung die Kursrendite nicht zählt.
- Mit Gesamtrendite verschwindet dieser Vorsprung über fünf Jahre (Lift ≈ 0,91–1,09).
- Die Methodik-Notiz in `pattern-research-v1.json` („betrifft Gewinner und Nicht-Gewinner gleichermaßen“) ist damit für lange Horizonte widerlegt.

### Was sich für Produktnutzer ändern würde (Konsumenten von `pattern-research-v1`, im Code geprüft)

| Konsument | liest | Änderung bei Aktivierung |
|---|---|---|
| **Pattern Match** (`build-pattern-match.mjs` → `pattern-match-v1`, Aktienseite über `quant/api/product-services.js`) | nur `study.findings` = H24, nur ROBUST | 97 statt 96 Kursmuster. Neu ist `quiet-range+high-volatility`, ein Populationseffekt. Kein Kursmuster fällt weg. Lifts und Gewinnerquoten werden kleiner (Median-Lift 1,51 → 1,46), die gezeigte Basisquote steigt von 10,83 auf 11,75 %. `caveats.totalReturn` ist dort fest `false` verdrahtet und muss aus der Studie gelesen werden. |
| **Fundamental-Überlagerung** (`build-pattern-research-fundamentals.mjs`) | eigene Studie, eigene Ausgänge in Kursrendite (`outcomeAfter` auf Wochenschlüssen), nur H24 | Sie ändert sich nicht. Pattern Match würde aber Kursmuster in Gesamtrendite und Fundamentalmuster in Kursrendite nebeneinander zeigen, mit **einer** gemeinsamen Basisquote im Kopf. Das wäre eine Mischung der Basen. |
| Evidenzstatus, Backtest-Readiness, Zertifizierung | Anzahl der H24-Befunde je Urteil, Renditebasis | ROBUST 96 → 97. Das Gate `returnBasis` von PATTERN_EVIDENCE besteht. PATTERN_EVIDENCE bleibt LIMITED (Überlebende, Backtest-Freigabe). |
| **H36/H60** (`secondaryHorizons`, `baseRateGrid`) | **kein Produktkonsument**, nur im Studienartefakt und in diesem Bericht | Die 31 Verluste sind auf keiner Seite sichtbar. Sie ändern weder Pattern Match noch eine Musterseite. Die Methodikseite (`quant/methodology/`) liest nur die Methodik-JSON. |

### Fachliche Empfehlung

**Aktivieren: ja, mit Bedingungen.** Die Aktivierung erfolgt über einen eigenen Fachmodell-PR `pattern-research-1.2.0`, nicht durch Umschalten des Workflows.

**Begründung aus der Zerlegung**

1. Im registrierten Primärhorizont H24 gibt es **keinen** Robustheitsverlust. Alle 96 Befunde bleiben ROBUST. Der Renditeeffekt senkt die Lifts nur maßvoll (Median 1,527 → 1,461).
2. Die Verluste in H36 und H60 sind **zu 100 % Renditeeffekt** (0 durch Population). Ihr Mechanismus ist in allen drei vorab festgelegten Prüfungen bestätigt. Gesamtrendite verliert dort keine echten Befunde. Sie **entfernt eine Verzerrung**: Die Kursrendite zählt Ausschütter als Nicht-Gewinner und begünstigt damit Muster, die fast nur Nicht-Ausschütter treffen.
3. Die 130 ausgeschlossenen Titel (2,6 %) verschieben nichts Wesentliches: Basisquoten ±0,2 Pp, kein verlorener Befund. Die Abdeckung von 97,43 % ist also für diese Studie unkritisch.

**Bedingungen (alle im Fachmodell-PR)**

- **B1 – Pre-Registration vor jeder neuen Messung:** Changelog `pattern-research-1.2.0` mit `registeredBeforeMeasurement`. Die Ausgänge wechseln auf `TOTAL_RETURN` (`canonical-total-return-1.0.0`, `weekly-total-return-1.0.0`, `mixed: false`), mit Mindestabdeckung 0,95 und Abbruch bei `BELOW_MINIMUM_SHARE`. **Unverändert bleiben:** Kandidaten, Paare, Schwellen, Horizonte, primärer Horizont H24/W100, Folds, `alpha`, `minimumSupport` und `flagIfTestLiftBelow`. Keine Schwelle wird an das Ergebnis angepasst. Die H36/H60-Ergebnisse dieses Berichts sind bekannt und dürfen keine Kandidaten- oder Schwellenwahl begründen.
- **B2 – Methodik-Text korrigieren:** `population.totalReturn: true` und eine neue `totalReturnNote`. Die alte Aussage „betrifft Gewinner und Nicht-Gewinner gleichermaßen“ wird gestrichen und durch den gemessenen Befund ersetzt: In Kursrendite wurden Ausschütter über lange Horizonte systematisch unterschätzt. Dazu die Ausschlussregel (Titel ohne bestätigte Gesamtrendite) und `METHODOLOGY_VERSION` 1.2.0 in `quant/engines/pattern-research.js`.
- **B3 – Keine Mischung in Pattern Match:** `build-pattern-match.mjs` liest `caveats.totalReturn` und die Renditebasis je Familie aus der Studie statt fest `false`. Solange die Fundamental-Überlagerung Kursrendite rechnet, gilt eine von zwei Varianten: (a) Die Fundamental-Familie wechselt im selben Fachmodell-PR ebenfalls auf Gesamtrendite (bevorzugt, eigener Vorher/Nachher-Abschnitt). (b) Pattern Match weist die Basis je Familie und Befund aus und zeigt keine gemeinsame Basisquote über beide Familien.
- **B4 – Lange Horizonte nicht nach außen tragen:** H36/H60 bleiben Studienkontext und werden auf keiner Seite als Musterbefund gezeigt (wie heute). Der Bericht hält fest, dass Schub- und Momentummuster über drei bis fünf Jahre in Gesamtrendite keinen robusten Vorsprung haben.
- **B5 – Ablauf:** Zuerst wird der Fachmodell-PR mit diesem Bericht als Vorher/Nachher gemergt. Danach stellt die nächste Materialisierung `--return-basis total` um, kein `force`. Das Zertifikat liest die neue Studie ohne weitere Codeänderung (`returnBasis` PASS, PATTERN_EVIDENCE weiter LIMITED).

**Risiken**

- **Abdeckungsdrift:** Fällt die bestätigte Gesamtrendite unter 95 %, bricht die Materialisierung ab und rechnet nicht still in Kursrendite (fail closed). Eine veraltete Studie ist dann sichtbar, kein Fehler. Heute liegt der Puffer bei 2,4 Pp (130 Titel, davon 96 `CORPORATE_ACTION_CONTRADICTED`).
- **Rekonstruktionsfehler bei Ausschüttungen:** Einzelne Ausreißer der realisierten Ausschüttungsrendite im obersten Quartil (Maximum über 100 % in H60) deuten auf Sonderausschüttungen oder Datenfehler hin. Der Median bleibt plausibel (H60-Q4 34,5 % über fünf Jahre), und die Gewinner-Zählung ist gegen Ausreißer robust. Vor der Aktivierung sollte trotzdem eine Stichprobe der obersten 0,1 % gegen die Quelle geprüft werden. Das geht über Laufartefakte und Runbook R3, nicht im Repository.
- **Wahrgenommene Verschlechterung:** Die Lifts in Pattern Match sinken leicht, und die Basisquote steigt. Ohne Hinweis kann das wie ein schwächeres Produkt wirken. Der Methodenwechsel gehört deshalb in die Methodikseite und den Changelog.
- **Überlebende:** Gesamtrendite löst die Überlebensverzerrung nicht. PATTERN_EVIDENCE bleibt LIMITED.

## Zertifizierungsanbindung (vorbereitet, nicht aktiv)

`scripts/quant/build-backtest-certification.mjs` liest das Gate `returnBasis` von PATTERN_EVIDENCE jetzt aus der Studie selbst (`patternTotalReturnStatus` in `quant/engines/backtest-artifact-consistency.js`). Das Gate besteht nur, wenn alle drei Bedingungen gelten:

- `returnType === "TOTAL_RETURN"`
- `returnBasis.mixed === false`
- `population.totalReturnCoverage.state === "PASS"` (Mindestanteil 95 %)

Fehlt eine davon, bleibt es beim bisherigen Grund `STUDY_RETURN_BASIS_NOT_TOTAL_RETURN`.

- **Committete Studie (Kursrendite):** Das Zertifikat wird mit `--out` und eingefrorener Uhr bytegleich zum committeten `quant/data/product/backtest-certification-v1.json` erzeugt. Das Gate bleibt exakt `FAIL`, mit Wert „Diese Musterstudie verwendet Kursrendite“ und Grund `STUDY_RETURN_BASIS_NOT_TOTAL_RETURN`.
- **Probe im Lauf mit der Gesamtrenditestudie** (`--pattern-study`, nur RUNNER_TEMP):
  - `returnBasis` steht auf `PASS` mit „Gesamtrendite (canonical-total-return-1.0.0, weekly-total-return-1.0.0)“.
  - PATTERN_EVIDENCE bleibt `LIMITED` mit Grund `PRESENT_AND_UNQUANTIFIED_IN_PART`, weil `survivorship` und `certifiedAsBacktest` weiter `FAIL` sind.
  - Das entspricht der Erwartung aus FV-5.
- **Keine geänderte Gate-Definition.** Das Gate heißt seit jeher „Gesamtrendite“ (Kategorie STRUCTURAL, `quant/methodology/backtest-certification-v1.json`: „strukturelle Lücke (z. B. Überlebende, Gesamtrendite)“). Für SIGNAL wird es bereits aus der Studie gelesen, mit denselben Bedingungen: mindestens 95 % Abdeckung und keine Mischung (`docs/VU_QUANT_BACKTEST_CERTIFICATION.md`, Abschnitt Signal-Studie). Bisher war der Wert für die Musterstudie fest auf `false` verdrahtet, weil sie keine Gesamtrendite tragen konnte. Das Lesen aus der Studie ist die vorgesehene Prüfung, keine Lockerung. Kategorie, Gate-Liste, Schwellen und Grundcode sind unverändert.
- **Methodik-Fingerabdruck:** Die Gruppe `evidence` ändert sich (`46d1b8e78b8a9a26` → `7bb81b962d6ba1cf`), weil `build-backtest-certification.mjs` und `backtest-artifact-consistency.js` zu ihr gehören. Die übrigen Gruppen bleiben gleich.
  - **Folge nach dem Merge:** Die nächste Materialisierung auf main erkennt `changed=evidence` und rechnet einmal neu, auch bei gleichem Stichtag und ohne `force`. Sie schreibt den Fingerabdruck danach selbst. Das Zertifikat bleibt inhaltlich gleich, weil die Studie Kursrendite bleibt.

## Verbleibende Schritte bis zur Aktivierung

1. **Fachliche Prüfung dieses Berichts** (Owner), besonders der Verluste in H36 und H60. Der gepaarte Vergleich ist erledigt: Die Verluste sind vollständig Renditeeffekt, der Mechanismus ist bestätigt. Die Empfehlung lautet „aktivieren mit Bedingungen B1–B5“ (Abschnitt [Fachliche Empfehlung](#fachliche-empfehlung)). Die Freigabe steht aus.
2. **Fachmodell-PR „pattern-research-1.2.0“** (eigener PR mit Vorher/Nachher aus diesem Bericht):
   - den regulären Schritt in `product-intelligence-materialization.yml` auf `--return-basis total` umstellen;
   - `quant/methodology/pattern-research-v1.json` anpassen: `population.totalReturn: true`, `totalReturnNote` und `returnBasis` (Verträge, Mindestabdeckung 0,95), Changelog `pattern-research-1.2.0` mit `registeredBeforeMeasurement`;
   - `METHODOLOGY_VERSION` in `quant/engines/pattern-research.js` anheben;
   - die Folgewirkung auf `build-pattern-match.mjs` und die Fundamental-Überlagerung prüfen.
3. **Danach** besteht `returnBasis` bei der nächsten Materialisierung ohne weitere Codeänderung: Die Anbindung aus diesem PR liest die neue Studie. PATTERN_EVIDENCE bleibt trotzdem LIMITED (Überlebende, Backtest-Freigabe).
