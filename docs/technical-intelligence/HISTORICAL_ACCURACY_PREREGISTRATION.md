# Historical Accuracy Preregistration (Mission VIII — HSAB)

**Status: PREREGISTERED (06.10.2026), vor Öffnung der finalen Holdouts.**
* Diese Datei wird in einem eigenen Commit eingefroren; ihr SHA-256 steht in `scripts/technical/hsab/protocol.json → preregistration.sha256`.
* Der CI-Holdout-Lauf verweigert die Öffnung, wenn:
  * die Datei nicht unverändert im Eltern-Commit liegt;
  * der Öffnungs-Commit Code, Protokoll, Workflow oder diese Datei ändert;
  * die Engine-Hashes von `protocol.freeze.engineFiles` abweichen.
* Nach Öffnung wird **nichts** hiervon geändert. Abweichungen erscheinen im Bericht als Abweichung.

Grundlagen: `VU_HISTORICAL_REPLAY_METHODOLOGY.md`, `HISTORICAL_DATA_USAGE_REGISTER.md`, `reviews/MISSION8_CODE_REVIEW.md`, `reviews/MISSION8_METHODOLOGY_REDTEAM.md`.

## 1. Getestetes System (eingefroren)

| Bestandteil | Stand |
|---|---|
| Szenario-Engine | `ti-scenario-1.2.1` |
| Elliott | `elliott-3.2.2`, Regelwerk `elliott-rules-3.1.0`, Konfluenzgewicht 0, `PRODUCT_METHODOLOGY = { elliottEngine: "v3" }` |
| Familiengewichte | TREND 0,30 · MOMENTUM 0,20 · STRUCTURE 0,15 · HIGHER_TIMEFRAME 0,15 · VOLUME 0,10 · PATTERN 0,08 · ELLIOTT 0 · WYCKOFF 0 |
| Vorverarbeitung | `ti-data.mjs` (Wochenschluss O=H=L=C; Tag: Splits aus Bars rekonstruiert), `feature-store`, `pivot-engine` |
| Replay / Outcome / Auswertung | `hsab-replay-1.0.0`, `hsab-outcomes-1.0.0`, `hsab-evaluate-1.0.0` |
| Engine-Datei-Hashes | `protocol.json → freeze.engineFiles` |
| Daten | Überlebende: `discover-series-long` dieses Commits. Delisted-Bündel `delisted-weekly-bundle-1.0.0` (asOf 2026-10-01). Tageshistorie R2 `v1/tiingo/daily/US/` mit Erkennung bis 2026-09-30 |
| Stage-1-Siegel | siehe §10 |

## 2. Phasen

| Phase | Daten | Status |
|---|---|---|
| W_DEV | Überlebende Woche, Titel-Hash-Hälfte 0 | DEVELOPMENT, ausgewertet (Daten früher schon gesehen) |
| W_VAL | Überlebende Woche, Hälfte 1 | VALIDATION, nach DEV-Freeze ausgewertet (Daten früher schon gesehen) |
| D_DEV | Tag, 600 Titel, Erkennung ≤ 2016-06-30 | DEVELOPMENT |
| **W_HOLDOUT** | delistete Listings (Wochenschluss ab 2015, Erkennung ab 2018) | **FINAL HOLDOUT**, einmal |
| **D_HOLDOUT** | Tag, 1.200 Titel (deterministische Stichprobe, Obermenge der D_DEV-Titel), Erkennung 2017-01-01 – 2026-09-30 | **CONDITIONAL HOLDOUT**, einmal (Kalenderzeitraum früher wochenweise gesehen; Tagesengine nie ausgewertet) |

Es gibt **keinen makellosen Holdout** für heute gelistete Titel auf Wochenbasis. W_HOLDOUT ist nach einem künftigen Ereignis selektiert (Delisting: Übernahme, Insolvenz, Rückzug). Er prüft deshalb nur die **Übertragbarkeit des Lifts** und liefert keine Produkt-Trefferquote.

## 3. Ereignis, Ein- und Ausschlüsse

* Analysezeitpunkte: Bestätigung eines Pivots der Skala `scale-2`. Mindesthistorie 160 Wochen- bzw. 520 Tagesbars.
* Ereignis: gerichtetes Hauptszenario mit Ziel 1 und Invalidation; je Titel nicht überlappend (nächstes Ereignis erst nach Auflösung).
* Ausgeschlossen, aber gezählt:
  * tote Reihe (≥ 4 bzw. 10 gleiche Schlüsse);
  * Ziel 1 bei Anzeige schon erreicht (TRIVIAL_TARGET);
  * Kurs bei Anzeige schon jenseits der Invalidation;
  * Horizont nicht vollständig beobachtbar (INCOMPLETE_HORIZON; gleiche Regel für Kontrollen).
* Kalenderraster (Kundensicht): jede letzte Bar eines Kalendermonats mit gezeigtem Szenario, ohne Deduplikation.
* Liquidität: Woche ohne Volumen (kein Filter möglich, offengelegt). Tag: Segment Median-Dollarvolumen 20 Tage (< 1 Mio / 1–10 Mio / ≥ 10 Mio USD), Hauptgröße ohne Filter.

## 4. Hauptgröße (genau eine)

**PRIMARY SCENARIO STRUCTURAL SUCCESS (PSS) — Lift gegen Kontrolle D.**

* Je Ereignis: Erfolg (Ziel 1 berührt vor einem Schluss jenseits der Invalidation, innerhalb 26 Wochen / 126 Handelstage, kein Einstieg nötig; Ziel und Invalidation in derselben Bar = Misserfolg) minus Erfolgsquote der Kontrolle D.
* Kontrolle D: 5 Ziehungen, dasselbe Datum, zufällige andere Titel derselben Kohorte, gleiche Richtung, gleiche Abstände zu Ziel 1 und Invalidation in ATR-Einheiten, dieselbe Outcome- und Zensur-Regel.
* Schätzer: Summe Erfolge / n minus Summe Kontrolltreffer / Kontrollziehungen.
* Unsicherheit: Zweiweg-Cluster-Bootstrap (Titel × Kalenderhalbjahr), B = 1.000. Maßgeblich ist das **breiteste** der Intervalle SYMBOL / TIME / TWO_WAY.

**Die absolute PSS-Quote ist nie eine Schlagzeile.** Sie wird nur zusammen mit Kontrollquote, Random-Walk-Erwartung b/(a+b), Gegenrichtung, Erwartungswert in R, Median-Abstand und Median-Zeit berichtet.

## 5. Bestätigende Hypothesen

| ID | Hypothese | Test |
|---|---|---|
| **H1** | W_HOLDOUT: PSS-Lift gegen D > 0 | einseitig, α = 0,025 |
| **H2** | D_HOLDOUT: PSS-Lift gegen D > 0 | einseitig, α = 0,025 |

Beide müssen bestehen, damit ein Lift als **nachgewiesen** gilt. Einseitige Tests entsprechen der unteren Grenze des 95 %-Intervalls > 0.

**Robustheits-Gates** (alle in beiden Holdouts, für jede Vorteilsaussage nötig):
* G1: Lift gegen P (gleiches Datum, ebenfalls Pivot bestätigt) > 0, untere Grenze > −0,5 Pp.
* G2: Lift gegen C (gleicher Titel, zeitnah) mit unterer Grenze ≥ −0,5 Pp.
* G3: Lift gegen E (einfacher Trend + ATR-Terzil) ≥ 0.
* G4: PSS minus PSS der Gegenrichtung (gleiche Zeit, gleiche Abstände) > 0, untere Grenze > 0.
* G5: gleiches Vorzeichen des Lifts gegen D in allen Sensitivitäten:
  * Kundensicht im Kalenderraster;
  * Zonenmitte als Ziel;
  * Ziel nur per Schluss;
  * ohne groben Rundungsschritt;
  * Quartals- und Jahresblöcke;
  * D_HOLDOUT ohne die 600 D_DEV-Titel;
  * W_HOLDOUT mit Union-Pool-Kontrollen.

## 6. Relevanz (Produktsignifikanz) und Äquivalenz

| Ergebnis | Regel |
|---|---|
| **MEANINGFUL EDGE** | Lift ≥ +2,0 Pp. **und** untere Grenze ≥ +0,5 Pp. in **beiden** Holdouts **und** G1–G5 |
| DETECTABLE BUT NEGLIGIBLE | H1 und H2 bestanden, aber Relevanzregel verfehlt → keine Vorteilsaussage |
| NO EDGE (äquivalent) | 90 %-Intervall des Lifts liegt in beiden Holdouts innerhalb ±1,5 Pp. |
| INCONCLUSIVE | keines davon |
| HARM SIGNAL | obere Grenze < 0 in einem Holdout → Prüfung der Darstellung „Ziel“ |

## 7. Nebengrößen (vorab registriert, Holm über 5)

Alle in W_HOLDOUT; dieselben in D_HOLDOUT nur berichtet.

| ID | Größe |
|---|---|
| S1 | Kundensicht (Kalenderraster): PSS-Lift gegen D > 0 |
| S2 | Ausführungsebene: Ziel 1 unter gefüllten Einstiegen gegen gematchte Kontrolle D (gleiche Zonen in ATR) > 0 |
| S3 | Erwartungswert in R: Ereignis-R minus Kontroll-R (D) > 0 |
| S4 | Selektivität: Lift gegen D in der Stufe Strukturklarheit CLEAR > 0 |
| S5 | Marktregime Risk-off (SPY 26 Wochen < −5 %): Lift gegen D > 0 (frühere explorative Hypothese, hier erstmals bestätigend) |

Alles Übrige ist **explorativ** und trägt BH-q-Werte, aber keinen Bestätigungsanspruch:
* Ablation und Familienbedingungen;
* Konfluenzzahl, Konflikt;
* Elliott (Filter, Hypothese, Motiv/Korrektur, Grad, prospektive Konsistenz);
* Segmente (Richtung, Vorlage, Volatilität, Sektor, Jahr, Historie, Formationen, Wyckoff, Fibonacci, S/R-Abstand, CRV, Abstände, Liquidität, Rundung, Richtungsalter);
* einfache Modelle, Abdeckung, Relabel.

Die extreme Volatilität (frühere explorative Hypothese) ist nur explorativ.

**Elliott:**
* Keine bestätigende Hypothese. Begründung: Elliott spricht in W_DEV nur an 0,44 % der Analysezeitpunkte (432 Ereignisse) und formt nie die Hauptszenario-Geometrie, weil das Gewicht 0 ist und die Anwendbarkeit fast immer NIEDRIG.
* Die Höhere-Grad-Hypothese (§53) wird nur beschreibend berichtet; Fallzahl < Mindestfallzahl.

## 8. Behandlung von Ziel, Invalidation, Lücken, Umdeutung

* Ziel 1: nahe Kante der Zielzone; intrabar berührt (Woche: Schluss). Sensitivität: Zonenmitte bzw. Schluss-Ziel.
* Invalidation: Schluss jenseits (wie im Produkt). Kursbewegungen über die Grenze hinweg (Gaps) werden ebenfalls am Schluss gewertet. Strukturelle Auflösung und Ausführung bleiben getrennt.
* Gleiche Bar Ziel + Invalidation: AMBIGUOUS_SAME_BAR = Misserfolg; als Sensitivität = Erfolg.
* Umdeutung: Richtungswechsel bzw. Rücknahme des Szenarios **strikt vor** der Auflösungsbar.
  * Gemessen an Analysezeitpunkten für alle Ereignisse, per Bar in der Stichprobe (`--perbar 20`).
  * Das Ergebnis gilt immer den eingefrorenen Niveaus.

## 9. Mindestfallzahlen, Mehrfachtests, Kundenaussagen

* Segmentzeilen < 300 Ereignisse: nur gezählt, nicht bewertet. Konzentration: Ereignisse je Titel, Top-10-Anteil, HHI.
* **Kundenaussagen** (`TECHNICAL_INTELLIGENCE_CLAIMS_MATRIX.md`):
  * Eine Vorteilsaussage braucht MEANINGFUL EDGE.
  * Eine Prozentaussage wie „X % erreichten Ziel 1“ ist nur zulässig mit Kontrollquote, Lift, Abdeckung, Zeitraum, Universum, Survivorship-Status und dem Hinweis, dass eine historische Häufigkeit keine Wahrscheinlichkeit ist.
  * Eine Aussage „VU-Elliott-Wellen sind zu X % richtig“ ist unzulässig.

## 10. Siegel und Freeze

* Engine-Hashes: `protocol.json → freeze.engineFiles`.
* Stage-1-Siegel der Holdout-Kohorten aus dem CI-Entwicklungslauf (nur Zähler, keine Ergebnisse): `protocol.json → freeze.ciStage1Seals`.
* CI-Entwicklungslauf (Commit `54e8ed2d92`), Stage 1 ohne Ergebnisse:

| Kohorte | Siegel | Reihen | Records | Persistenzprobe (Hauptszenario gleich) |
|---|---|---|---|---|
| W_HOLDOUT (delistet, Woche, mit Monatsraster) | `3983c2539e860605` | 1.619 (1.463 zu kurz) | 86.956 | 105 Proben, 100 % |
| D_HOLDOUT (Tag, 1.200er Stichprobe, 2017-01-01 – 2026-09-30, mit Monatsraster) | `a9ebe07579ee76ee` | 974 (226 zu kurz) | 163.498 | 213 Proben, 100 % |

* Der Holdout-Lauf berechnet Stage 1 neu und meldet das Siegel. Weicht es ab, wird das berichtet:
  * Ursache kann eine Datenaktualisierung sein, z. B. ein neuer Split oder ein neu abgerufenes Delisting.
  * Code-Änderungen sind über die Engine-Hashes ausgeschlossen.

## 11. Vor der Öffnung bekannte Ergebnisse (offengelegt)

Alle Zahlen: PSS-Lift gegen D, Cluster-KI 95 %.

| Phase | n | PSS | Kontrolle D | Lift | gegen C | Gegenrichtung | Urteil nach §6 |
|---|---|---|---|---|---|---|---|
| W_DEV | 94.686 | 59,3 % | 57,2 % | +2,1 (1,5 … 2,6) | −2,0 (−3,2 … −0,7) | +4,4 (2,1 … 6,6) | DETECTABLE_BUT_NEGLIGIBLE (G2 verfehlt) |
| W_VAL | 91.939 | 59,6 % | 57,3 % | +2,2 (1,6 … 2,8) | −2,1 (−3,5 … −0,7) | +4,7 (2,2 … 7,3) | DETECTABLE_BUT_NEGLIGIBLE (G2 verfehlt) |
| D_DEV | 21.481 | 70,2 % | 69,8 % | +0,4 (−0,3 … 1,1) | −1,3 (−2,6 … 0,1) | +2,8 (0,3 … 5,2) | INCONCLUSIVE |

Weitere bekannte Entwicklungsbefunde:
* FULL ist praktisch identisch mit TREND_ONLY: 99,9 % gleiche Szenarien, gepaarte Differenz −0,1 Pp.
* Unterstützung/Widerstand formt die Geometrie (gepaart +1,1 … +1,3 Pp.).
* Strukturklarheit ist monoton: CLEAR +2,8 / MODERATE +1,0 / AMBIGUOUS +0,2 Pp. Umdeutungsrate je Bar 12,5 / 26,4 / 42,5 %.
* Elliott spricht an 0,4 % der Zeitpunkte und formt nie ein Szenario.

Diese Ergebnisse waren vor der Formulierung der Gates bekannt. Die Gates folgen den Empfehlungen des Red Teams (`reviews/MISSION8_METHODOLOGY_REDTEAM.md`); sie wurden nicht auf ein gewünschtes Ergebnis hin gewählt. Gate G2 scheitert in DEV/VAL; es bleibt trotzdem unverändert.

## 12. Protokollnachträge vor der Öffnung

1. Nach dem Code-Review: siehe `reviews/MISSION8_CODE_REVIEW.md` (Disposition).
2. Nach dem Red Team:
   * Kontrollen P, P∩E, Gegenrichtung, Union-Pool;
   * gematchte Ausführungsebene;
   * Regel-Sensitivitäten;
   * Monatsraster;
   * eine Zensur-Regel;
   * Halbjahresblöcke;
   * Relevanz- und Äquivalenzregeln.
3. Nach W_VAL: R-Vielfache auf ±5 R winsorisiert, weil einzelne winzige Risikoabstände ±50 R erzeugten. Betrifft nur S3.
4. Treue-Prüfung (DEV, Viertel der Titel, Erkennung ab 2018): Historie erst ab 2015, wie bei den Delisted-Reihen.
   * 8,4 % der angezeigten Richtungen/Vorlagen ändern sich.
   * Lift +3,0 (1,7 … 4,2) gegen +2,6 (1,4 … 3,7) Pp. mit voller Historie.
   * Die kurze Historie der Delisted-Kohorte verzerrt den Lift nicht wesentlich.
5. Elliott-Persistenz (2.279 Proben, Überlebende):
   * Hauptszenario, Ausblick und Klarheit sind zu 100 % gleich mit der Produkt-Kette.
   * Die Elliott-Zählung selbst ist zu 75,8 % gleich.
   * Elliott-Stabilitätsaussagen stammen deshalb nur aus der Per-Bar-Stichprobe mit Kette.
