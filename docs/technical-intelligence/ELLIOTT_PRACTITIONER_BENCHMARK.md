# Elliott Practitioner Benchmark — Bericht (Mission V)

Stand: 04.10.2026. **Status: PILOT** — Qualitätsgate §107 verfehlt (78 < 100 Fälle, HIGH 29,5 % < 70 %).

> **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Gemessen wird, wie nah elliott-3.2.2 öffentlich publizierten Praktiker-Zählungen kommt — nicht, ob Praktiker oder VU recht haben. Methodenübereinstimmung und Ergebnis sind getrennte Fragen; die Ergebnisstudie steht separat in [PRACTITIONER_OUTCOME_STUDY.md](PRACTITIONER_OUTCOME_STUDY.md). Extraktion: LLM-dual aus Primärquelle, **nicht menschlich geprüft**. Intern, keine Produktaussage. Keine Aussage über HKCM (0 Fälle).

## 1. Ablauf (in dieser Reihenfolge, je eigener Commit)

| Schritt | Commit |
|---|---|
| Freeze PRACTITIONER_REFERENCE_V1, SHA-256 `7af25c9b…f489`, Holdout-Quelle `tiedje` festgeschrieben | `8985c6a06` |
| Blinder Lauf elliott-3.2.2 auf DEVELOPMENT + VALIDATION (35 Fälle), Versiegelung | `4faaa3acd` |
| Ergebnisstudie (erst nach der Versiegelung, gleicher Freeze-Hash) | `8bfd31071` |

Der VU-Replay sieht je Fall nur: vuSymbol, Reihe, Markt, Zeitrahmen und Stichtag. Er sieht keine Praktikerfelder.

**Versiegelt (nicht ausgewertet):**
* HOLDOUT_TEMPORAL: 32 Fälle, veröffentlicht ab 2025.
* HOLDOUT_SOURCE: 11 Fälle, Quellenfamilie `tiedje`.

Beide Holdouts bleiben für die Prüfung einer künftigen Engine 3.3 reserviert (§4). Konfidenzintervalle wurden nicht berechnet: Es gibt nur 4 Quellenfamilien-Cluster, nötig wären mindestens 5. Alle Raten sind daher **Punktwerte ohne Unsicherheitsangabe**.

## 2. Ergebnisse (DEVELOPMENT + VALIDATION)

* 35 Fälle ausgewertet: 33 wiedergegeben, 2 mit `INSUFFICIENT_DATA`.
* **J (Enthaltung): VU enthält sich in 33 / 33 Fällen.** Die Anwendbarkeit ist überall LOW; 24 Fälle sind AMBIGUOUS, 9 OK.
* VU erzeugt trotzdem in jedem Fall eine latente Zählung. Alle folgenden Kennzahlen vergleichen diese **latente, nicht ausgegebene** Zählung („includingAbstained“).
* Ohne die Enthaltungen bleibt n = 0.

| Kennzahl | Bedeutung | Treffer | Rate |
|---|---|---:|---:|
| A1 | Richtung der laufenden Bewegung | 21 / 33 | 64 % |
| A2 | Richtung nach der laufenden Welle | 4 / 8 | 50 % |
| B | Musterfamilie (MOTIVE/CORRECTIVE) | 8 / 33 | 24 % |
| C | laufende Welle | 1 / 31 | 3 % |
| D / E | Grad exakt / ±1 | 1 / 2 · 1 / 2 | – |
| F | exakte Zählung | 0 / 33 | 0 % |
| G | – | 1 / 33 | 3 % |
| K | – | 8 / 31 | 26 % |
| S | strukturelle Übereinstimmung | 16 / 33 | 48 % |
| H | Invalidation | n = 3, Median-Abstand 36 % bzw. 10 ATR | – |
| I | Zielzonen | 0 / 23 überlappend, Median-Abstand der Zonenmitten 27 % | – |

**Richtung gegen eine naive Basis.** Die Praktiker sehen 17 × UP und 16 × DOWN. Eine Regel „immer UP“ träfe 17 / 33 = 52 %. VU sagt 29 × UP und trifft A1 in 64 % der Fälle. Cohens κ (currentMove) = 0,26. Wenig über Zufall, ohne Konfidenzintervall.

**Musterfamilie: systematischer Befund.** VUs latente Zählung liest **alle 33 Fälle als CORRECTIVE**. Die Praktiker lesen 25 von 33 als MOTIVE, κ = 0. Das ist die in Mission III/IV synthetisch gefundene WXY-Lesart laufender Impulse („WXY cap LOW“ in 3.2.2), jetzt **gegen Praktiker bestätigt**. B trifft genau die 8 korrektiven Praktikerfälle.

**Aufgeteilt (Punktwerte, kleine n):**

| Teilmenge | n | A1 | B | S |
|---|---:|---:|---:|---:|
| HIGH-Extraktion | 8 | 7 / 8 | 1 / 8 | 7 / 8 |
| 1W | 18 | 13 / 18 | 6 / 18 | 12 / 18 |
| 1D | 15 | 8 / 15 | 2 / 15 | 4 / 15 |
| ElliottWave-Forecast | 16 | 12 / 16 | 6 / 16 | 11 / 16 |
| TradingView (3 Autoren) | 17 | 9 / 17 | 2 / 17 | 5 / 17 |

Die HIGH-Teilmenge widerspricht dem Gesamtbild nicht. Die 8 geschlichteten Fälle mit mehreren abweichenden Kernfeldern verzerren es also nicht erkennbar.

**Mensch–Mensch.**
* Nur **1 Paar** erfüllt die Paarungsregel: SPY 1D, cryptoknee gegen thefifthwave, 2 Handelstage auseinander. Die beiden Autoren widersprechen sich in der Richtung (A1 MISMATCH); Musterfamilie und laufende Welle stimmen.
* Die Übereinstimmung der Praktiker untereinander ist damit **nicht messbar**. Das ist die wichtigste offene Zahl.

**Dynamik.**
* Revisionsrate der Praktiker: ewf 0, thefifthwave 0, cryptoknee 0,29, yuchaosng 0,40 Revisionen je Fall.
* VU ordnet 42 % der Fälle im Replay-Fenster neu zu.
* Erkennungslatenz: In 19 von 35 Fällen fand VU eine passende Struktur im Fenster ±10 Bars, median 10 Bars **vor** dem Praktiker-Stichtag. Das ist kein Vorsprung im Sinne einer Prognose.

## 3. Antworten auf §113

| # | Frage | Antwort |
|---|---|---|
| 1 | Wie viele Practitioner Cases? | 78 Originalfälle (99 Fassungen); verglichen 35 (DEV+VAL), 43 versiegelt |
| 2 | Welche Quellen? | ElliottWave-Forecast, André Tiedje (Holdout), TradingView cryptoknee / yuchaosng / thefifthwave; HKCM 0 |
| 3 | Welche Jahre? | 2022–2026 (2022 14 · 2023 20 · 2024 12 · 2025 20 · 2026 12) |
| 4 | Welche Assets? | 44 Instrumente: US-Aktien (52 Fälle), Krypto (17, v. a. BTC), US-ETFs/Indizes, Gold |
| 5 | Wie sicher war die Extraktion? | LLM-dual: A↔B-Übereinstimmung Familie 93 %, Welle 76 %, Richtung 95 %, Invalidation 92 %; HIGH 29,5 %; kein menschlicher Audit |
| 6 | Wie oft stimmen Praktiker untereinander überein? | nicht messbar (1 Paar, Richtung uneinig) |
| 7 | Wie oft stimmt VU mit einem Praktiker überein? | VU gibt **nie** eine Zählung aus (Enthaltung 33/33). Latent: Richtung 64 %, Struktur S 48 %, Familie 24 %, exakte Zählung 0 % |
| 8 | Grad exakt? | 1 / 2 vergleichbare Fälle — Praktiker nennen den Grad selten |
| 9 | Grad ±1? | 1 / 2 |
| 10 | Musterfamilie? | 24 %; VU liest systematisch korrektiv |
| 11 | Laufende Welle? | 3 % |
| 12 | Richtung? | A1 64 % (naive Basis 52 %); A2 4/8 |
| 13 | Invalidation? | nur 3 vergleichbar; Median 36 % entfernt |
| 14 | Ziele? | 0 / 23 Zonen überlappen |
| 15 | Enthaltung? | VU 100 %, Praktiker 0 % (veröffentlichen per Definition eine Zählung) |
| 16 | Neuzuordnungen? | VU 42 % im Fenster; Praktiker 0–0,4 Revisionen je Fall |
| 17 | Erkennungslatenz? | 19/35 gefunden, median −10 Bars (Struktur im Fenster, keine Prognose) |
| 18 | Wo versagt VU systematisch? | (a) **Familie: liest Impulse als korrektiv (WXY-Bias)**; (b) laufende Welle/Zählung praktisch nie gleich; (c) Ziele weit entfernt; (d) Anwendbarkeit überall LOW → keine Ausgabe |
| 19 | Wo sind Praktiker uneinig? | nicht messbar; Hinweis: das einzige Paar widerspricht sich in der Richtung |
| 20 | Konsequenz für Engine 3.3 | gezielte Korrektur des Familien-/WXY-Bias ist begründet; Bau nicht automatisch (§100), siehe §4 |

## 4. Fehleranalyse und Entscheidung zu Engine 3.3 / HOLDOUT-4

1. **Familien-Bias (belegt, systematisch).** 33/33 latent korrektiv gegen 25/33 praktiker-motiv. Das ist kein Rauschen: Eine zufällige Lesart träfe nicht in allen Fällen dieselbe Familie. Die Ursache ist aus Mission IV bekannt: Laufende Impulse werden als W-X-Y gelesen. Die Deckelung in 3.2.2 („WXY cap LOW“) senkt nur die Anwendbarkeit, nicht die Lesart.
2. **Enthaltung 100 %.** Für die Ausgabe ist das konsistent: Schwache Lesarten werden nicht gezeigt. Gegenüber Praktikern heißt es aber, dass VU bei Tages- und Wochenstrukturen in dieser Stichprobe nie eine Zählung liefert.
3. **Richtung.** Die latente Richtung liegt mit 64 % leicht über der naiven Basis von 52 %. Eine Produktaussage lässt sich daraus nicht ableiten.

**Entscheidung:**
* **Engine 3.3 Needed: YES (gezielt, Familien-/WXY-Lesart laufender Impulse).**
* **Engine 3.3 Built: NO.** Kein automatischer Bau (§100). Der Bau ist ein eigener Auftrag:
  * nur auf DEVELOPMENT entwickeln;
  * auf VALIDATION abstimmen;
  * genau einmal gegen die versiegelten Holdouts prüfen.
* **HOLDOUT-4:** definiert, aber **NOT READY**. Bestandteile:
  * die versiegelten Practitioner-Holdouts (43 Fälle);
  * ein menschlich annotierter Real-Chart-Satz, BLOCKED wegen fehlender Experten;
  * ein kleiner synthetischer Regelsatz.

## 5. UI-Implikation (§118)

Eine einzelne Elliott-Zählung zeigt VU in dieser Stichprobe nie, und die latente Zählung weicht in der Familie systematisch ab. Das stützt die bestehende Produktreihenfolge:
1. Struktur
2. Hauptszenario
3. Alternative
4. Zone
5. Invalidation
6. Evidenz
7. Elliott-Lesart, nur optional

Ob Praktiker untereinander uneinig sind und Elliott deshalb grundsätzlich als Mehrdeutigkeit gezeigt werden müsste, bleibt ungemessen.

## 6. Finaler Status (§129)

| Bereich | Status |
|---|---|
| Practitioner Dataset | **PILOT** — V1 eingefroren, 78 Fälle, 5 Quellenfamilien, HIGH 29,5 %, LLM-dual ohne menschlichen Audit |
| HKCM Coverage | **0** (YouTube-Bot-Prüfung, hkcm.de nur für Mitglieder, trading-treff bis 2021; nicht umgangen) |
| Independent Sources | **5 Familien** (ElliottWave-Forecast, Tiedje, 3 TradingView-Autoren) |
| Human-Human Agreement | **NOT MEASURABLE** (1 Paar) |
| VU-Human Agreement | **MEASURED (Pilot, ohne KI)** — Ausgabe 0 % (Enthaltung 100 %); latent A1 64 %, S 48 %, B 24 %, F 0 % |
| Engine 3.3 Needed | **YES — gezielt (Familien-/WXY-Bias)** |
| Engine 3.3 Built | **NO** |
| HOLDOUT-4 Ready | **NO** (Practitioner-Holdouts versiegelt vorhanden; Real-Chart-Annotation BLOCKED) |
| Forecast Test | **RUN (deskriptiv, Pilot)** — siehe Ergebnisstudie; keine Prognoseevidenz |

## 7. Entscheidung (§130)

**PATH C für das Produkt, mit einer gezielten PATH-B-Aufgabe für die Forschung.**
* **PATH A** (3.2.2 ist schon praktikernah) ist **widerlegt**: Die Familie trifft 24 %, die exakte Zählung 0 %, und VU enthält sich zu 100 %.
* **PATH B** (Engine 3.3 nötig) ist **für einen eng umrissenen Fehler belegt**: die korrektive Lesart laufender Impulse. Dieser Fehler ist messbar, und die Holdouts zur Prüfung liegen versiegelt bereit.
* **PATH C** (Elliott zu mehrdeutig, Szenario-Ebene priorisieren) bleibt das **Produktverhalten**:
  * Ohne Mensch–Mensch-Daten ist nicht gezeigt, dass Praktiker sich einig wären.
  * Selbst eine korrigierte Familienlesart ergäbe noch keine praktikernahe Zählung (C 3 %, F 0 %).

## 8. Selbstkritik (§131)

1. **Vollständig genug?** Nein. Pilot mit 78 Fällen, davon nur 35 ausgewertet, ohne Konfidenzintervalle.
2. **Welche Quellen dominieren?** ElliottWave-Forecast mit 58 % aller Fälle und 16 von 33 verglichenen. Deren Impulslastigkeit treibt den Familienbefund mit. Allerdings liest VU auch bei TradingView 15 von 17 Fällen anders als der Autor.
3. **Wie stark ist Publication Bias?** Wahrscheinlich erheblich: selbst gewählte öffentliche Beiträge, „blue box“-Erfolgsformate, gelöschte Inhalte unsichtbar. Gegenmaßnahmen: vorab festgelegter Rahmen, systematische Ziehung, Rückblicke ausgeschlossen.
4. **Wie sicher ist die Extraktion?** Reproduzierbar zwischen zwei LLM-Durchgängen (Familie 93 %, Richtung 95 %), bei der laufenden Welle schwach (76 %). Ein menschlicher Audit fehlt (BLOCKED). C = 3 % kann teilweise Extraktionsrauschen sein; B = 24 % kaum, denn die Familie ist das stabilste Feld.
5. **Wie häufig widersprechen sich Praktiker?** Unbekannt, nur 1 Paar. Für eine Messung bräuchte es gezielt gleichzeitige Analysen desselben Instruments.
6. **Ist die exakte Zählung ein sinnvolles Ziel?** Nein, F = 0 % bei VU, und die Welle ist selbst zwischen zwei Extraktionen nur zu 76 % stabil. Sinnvoll sind Richtung, Familie und Invalidation.
7. **Wo unterscheidet sich VU am stärksten?** Bei der Enthaltung (100 % gegen 0 %) und der Musterfamilie (alles korrektiv).
8. **Ist VU zu konservativ?** Bei der Ausgabe ja. Die latente Zählung ist aber in der Familie falsch. Weniger Enthaltung ohne Korrektur der Lesart würde mehr falsche Familien zeigen.
9. **Systematisch falscher Grad?** Kaum messbar (n = 2), weil Praktiker selten einen Grad nennen.
10. **Sind Praktiker instabil?** Je Quelle sehr verschieden (0 bis 0,4 Revisionen je Fall). Die Revisionen wurden nur unter gezogenen Elementen erkannt.
11. **Brauchen wir trotzdem bezahlte Blind-Annotatoren?** Ja. Nur sie liefern unselektierte, gleichzeitige Urteile für die Mensch–Mensch-Übereinstimmung und den menschlichen Audit der LLM-Extraktion.
12. **Wissenschaftlich sauberster nächster Schritt?**
    1. Menschlichen Audit von ≥ 20 % der V1-Zeilen nachholen.
    2. Engine 3.3 eng auf den Familien-/WXY-Bias entwickeln (nur DEV/VAL).
    3. Danach **einmalig** HOLDOUT_SOURCE und HOLDOUT_TEMPORAL entsiegeln.
    4. Parallel gezielt gleichzeitige Praktikeranalysen sammeln (V1.1), um die Mensch–Mensch-Übereinstimmung messbar zu machen.
