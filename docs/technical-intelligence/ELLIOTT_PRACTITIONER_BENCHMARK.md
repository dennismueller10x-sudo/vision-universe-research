# Elliott Practitioner Benchmark — Bericht (Mission V)

Stand: 04.10.2026. **Status: PILOT** — Qualitätsgate §107 verfehlt (78 < 100 Fälle, HIGH 29,5 % < 70 %).

> **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.** Gemessen wird, wie nah elliott-3.2.2 öffentlich publizierten Praktiker-Zählungen kommt — nicht, ob Praktiker oder VU recht haben. Methodenübereinstimmung und Ergebnis sind getrennte Fragen; die Ergebnisstudie steht in [PRACTITIONER_OUTCOME_STUDY.md](PRACTITIONER_OUTCOME_STUDY.md). Extraktion: LLM-dual aus Primärquelle, **nicht menschlich geprüft**. Intern, keine Produktaussage. Keine Aussage über HKCM (0 Fälle).

## 1. Ablauf (in dieser Reihenfolge, je eigener Commit)

| Schritt | Commit |
|---|---|
| Freeze PRACTITIONER_REFERENCE_V1, SHA-256 `7af25c9b…f489`, Holdout-Quelle `tiedje` festgeschrieben | `8985c6a06` |
| Erster blinder Lauf elliott-3.2.2 auf DEVELOPMENT + VALIDATION (35 Fälle), Versiegelung | `4faaa3acd` |
| Erste Ergebnisstudie | `8bfd31071` |
| Finales Red-Team (§122) findet Fehler in Kennzahl B/F/G, in der Ergebnisschicht und bei der Latenz → **Protokoll-Nachtrag 6** (nachträglich, vor jeder Entsiegelung, offengelegt) | `7c90df6f8` |
| Korrektur und Regressionstests (61/61); erster Lauf unverändert archiviert (`benchmark/archive-v1.0/`) | `1676e1124` |
| Neuer Lauf, neue Versiegelung | `61b930627` |
| Neue Ergebnisstudie (nach neuer Versiegelung) | `8d4393be7` |

**Was der Replay sieht.** Je Fall nur: vuSymbol, Reihe, Markt, Zeitrahmen und Stichtag. Keine Praktikerfelder.

**Was versiegelt bleibt.** Unverändert versiegelt sind:
* HOLDOUT_TEMPORAL: 32 Fälle, veröffentlicht ab 2025.
* HOLDOUT_SOURCE: 11 Fälle, Quellenfamilie `tiedje`.

Für diese Holdouts gilt Nachtrag 6 als vorab festgelegt.

**Keine Konfidenzintervalle.** Es gibt nur 4 Quellenfamilien-Cluster, nötig sind mindestens 5. Alle Raten sind daher **Punktwerte ohne Unsicherheitsangabe**.

**Eingangsdaten.** VUs Reihen sind reine Schlusskursreihen (O = H = L = C). Die Engine arbeitet hier ohne Hoch und Tief. Das ist ein möglicher Störfaktor für alle Befunde unten.

## 2. Ergebnisse (DEVELOPMENT + VALIDATION, Definition nach Nachtrag 6)

35 Fälle: 33 wiedergegeben, 2 mit `INSUFFICIENT_DATA`.

**J (Enthaltung): VU enthält sich in 33 / 33 Fällen.**
* Anwendbarkeit überall LOW (24 Fälle AMBIGUOUS, 9 OK).
* Der Nutzer sieht in keinem Fall eine Zählung.
* Alle Kennzahlen unten vergleichen deshalb die **latente, nicht ausgegebene** Zählung.

| Kennzahl | Bedeutung | Treffer | Rate | erster Lauf (archiviert) |
|---|---|---:|---:|---:|
| A1 | Richtung der laufenden Bewegung | 21 / 33 | 64 % | 21 / 33 |
| A2 | Richtung nach der laufenden Welle | 4 / 8 | 50 % | 4 / 8 |
| B | Familie der Struktur, die die laufende Welle enthält | 6 / 18 | 33 % | 8 / 33 (falsch definiert) |
| C | laufende Welle | 1 / 31 | 3 % | 1 / 31 |
| D / E | Grad exakt / ±1 | 1 / 2 · 1 / 2 | – | gleich |
| F | Muster + laufende Welle | 0 / 18 | 0 % | 0 / 33 |
| G | Primär- oder Alternativzählung gleich | 1 / 27 | 4 % | 1 / 33 |
| K | laufend vs. bestätigt | 8 / 31 | 26 % | gleich |
| S | Richtung + Rolle (+ Trend) | 16 / 33 | 48 % | gleich |
| H | Invalidation | n = 3, Median-Abstand 36 % (10 ATR) | – | gleich |
| I | Zielzonen | 0 / 23 überlappend, Median-Abstand der Zonenmitten 27 % | – | gleich |

**B, korrigiert.**
* **Nicht vergleichbar: 15 Fälle.** Dort ist VUs Hauptmuster abgeschlossen, und VU nennt keine enthaltende Struktur.
* **Vergleichbar: 18 Fälle.** VU liest alle 18 korrektiv. Die Praktiker sehen 12 davon motiv und 6 korrektiv. B trifft genau diese 6.
* Familien-κ ist **nicht definiert**: VU bewertet konstant, und n < 20.

**Die belastbare Beobachtung.** In **keiner** der 41 VU-Wiedergaben kommt ein **IMPULSE**-Muster vor:
* nicht als Hauptmuster;
* nicht als höherer Grad;
* nicht unter 82 Alternativen.

Gefunden hat VU nur korrektive Muster: WXY, FLAT, TRIANGLE, ZIGZAG, TRIPLE_ZIGZAG. Diagonalen kommen in 4 Wiedergaben als Alternative vor. Die Praktiker zählen dagegen in 62 von 78 Fällen einen Impuls bzw. ein motives Muster.

Der erste Bericht sprach von einer „WXY-Lesart laufender Impulse, gegen Praktiker bestätigt“. **Diese Aussage ist zurückgenommen.** Nur 16 von 33 VU-Hauptmustern waren WXY, und B war falsch definiert. Belegt ist nur das Fehlen jeder Impulslesart.

**S: Herkunft der Rolle.** S stammt überwiegend aus einer Ableitung des Vergleichs, nicht aus der Engine:
* Rolle von der Engine selbst (laufendes Muster): **3 / 9**.
* Rolle vom Vergleich abgeleitet (abgeschlossenes Muster, „nach Korrektur folgt Motiv“): **13 / 24**.

**Richtung gegen eine naive Basis.**
* Die Praktiker sehen 17 × UP und 16 × DOWN. „Immer UP“ träfe 17 / 33 = 52 %. Bei VUs 29 UP-Aussagen ergäbe Zufall ebenfalls ≈ 51 %.
* VU trifft 21 / 33. Das sind 4 Fälle mehr, ohne Konfidenzintervall und ohne gepaarten Test. Cohens κ (currentMove) = 0,26.
* **A1 ist von der naiven Basis nicht unterscheidbar.** Eine Momentum-Basis wurde nicht getestet und bleibt offen.

**Teilmengen (Punktwerte, kleine n).**

| Teilmenge | n | A1 | B (vergleichbar) | S |
|---|---:|---:|---:|---:|
| HIGH-Extraktion | 8 | 7 / 8 | 1 / 4 | 7 / 8 |
| 1W | 18 | 13 / 18 | 4 / 10 | 12 / 18 |
| 1D | 15 | 8 / 15 | 2 / 8 | 4 / 15 |
| ElliottWave-Forecast | 16 | 12 / 16 | 4 / 8 | 11 / 16 |
| TradingView (3 Autoren) | 17 | 9 / 17 | 2 / 10 | 5 / 17 |

Ob die 8 im dritten Durchgang geschlichteten Fälle das Bild verzerren, lässt sich aus der HIGH-Teilmenge nicht ableiten. Geschlichtete Fälle sind höchstens MEDIUM, die HIGH-Teilmenge enthält sie also nicht. Die Frage bleibt offen.

**Mensch–Mensch.** Nur **1 Paar** erfüllt die Paarungsregel:
* SPY 1D, cryptoknee gegen thefifthwave, 2 Handelstage auseinander.
* Uneinig in der Richtung; einig in Musterfamilie und laufender Welle.

Die Übereinstimmung der Praktiker untereinander ist **nicht messbar**.

**Dynamik.**
* Anteil revidierter Fälle in DEV+VAL: ewf 0 / 18, thefifthwave 0 / 5, cryptoknee 2 / 7, yuchaosng 2 / 5. yuchaosng hat 6 Revisionen auf 5 Fälle.
* VU ordnet 39 % der Fälle im Replay-Fenster neu zu.
* Erkennungslatenz: In 19 von 35 Fällen trifft VU die Praktiker-Lesart im Fenster ±10 Bars. **13 dieser 19 Treffer liegen am linken Fensterrand.** VU las dort also schon zu Fensterbeginn so. Der Median (−10) ist deshalb **keine Latenz**.

## 3. Antworten auf §113

| # | Frage | Antwort |
|---|---|---|
| 1 | Wie viele Practitioner Cases? | 78 Originalfälle (99 Fassungen); verglichen 35 (DEV+VAL), 43 versiegelt |
| 2 | Welche Quellen? | ElliottWave-Forecast, André Tiedje (Holdout), TradingView cryptoknee / yuchaosng / thefifthwave; HKCM 0 |
| 3 | Welche Jahre? | 2022–2026 (2022 14 · 2023 20 · 2024 12 · 2025 20 · 2026 12) |
| 4 | Welche Assets? | 44 Instrumente: US-Aktien (52 Fälle), Krypto (17, alle BTC), US-ETFs/Indizes, Gold |
| 5 | Wie sicher war die Extraktion? | LLM-dual: A↔B Familie 93 %, Welle 76 %, Richtung 95 %, Invalidation 92 %; HIGH 29,5 %; kein menschlicher Audit |
| 6 | Wie oft stimmen Praktiker untereinander überein? | nicht messbar (1 Paar) |
| 7 | Wie oft stimmt VU mit einem Praktiker überein? | Ausgegeben: nie (Enthaltung 33/33). Latent: Richtung 64 % (nicht von naiver Basis unterscheidbar), Familie 6/18, laufende Welle 3 %, exakte Zählung 0/18 |
| 8 | Grad exakt? | 1 / 2 vergleichbare Fälle |
| 9 | Grad ±1? | 1 / 2 |
| 10 | Musterfamilie? | 6 / 18 vergleichbar; 15 nicht vergleichbar |
| 11 | Laufende Welle? | 1 / 31 |
| 12 | Richtung? | A1 21/33 (Basis 17/33); A2 4/8 |
| 13 | Invalidation? | nur 3 vergleichbar; Median 36 % entfernt |
| 14 | Ziele? | 0 / 23 Zonen überlappen |
| 15 | Enthaltung? | VU 100 %; Praktiker 0 % (veröffentlichen per Definition eine Zählung) |
| 16 | Neuzuordnungen? | VU 39 % im Fenster; Praktiker 0–40 % revidierte Fälle je Quelle |
| 17 | Erkennungslatenz? | nicht bestimmbar: 13 / 19 Treffer linkszensiert |
| 18 | Wo versagt VU systematisch? | (a) **keine Impulslesart** in 41 Wiedergaben; (b) laufende Welle und Zählung praktisch nie gleich; (c) Ziele weit entfernt; (d) Anwendbarkeit überall LOW |
| 19 | Wo sind Praktiker uneinig? | nicht messbar |
| 20 | Konsequenz für Engine 3.3 | Ursache des fehlenden Impulses zuerst diagnostizieren (Engine-Regeln vs. Schlusskurs-Eingang); kein Bau ohne Diagnose (§100) |

## 4. Fehleranalyse und Entscheidung zu Engine 3.3 / HOLDOUT-4

**1. Keine Impulslesart.** 41 / 41 Wiedergaben zeigen auf keiner Ebene einen Impuls. Die Praktiker zählen überwiegend Impulse. Zwei Ursachen sind möglich, die Daten trennen sie nicht:
* Die Impulsregeln der Engine sind auf echten Kursreihen zu streng.
* Der Eingang ist schlusskursbasiert (O = H = L = C). Überlappungs- und Längenregeln greifen dann anders als auf Hoch-/Tief-Charts, nach denen Praktiker zählen.

**2. Enthaltung 100 %.** Für die Ausgabe ist das konsistent: Schwache Lesarten werden nicht gezeigt. Gegenüber Praktikern heißt es aber, dass VU in dieser Stichprobe nie eine Zählung liefert.

**3. Richtung und S.** Die Richtung ist nicht von der naiven Basis unterscheidbar. S beruht zu drei Vierteln auf einer Ableitung im Vergleich. Nur 3 der 9 Fälle mit Engine-eigener Rolle stimmen.

**Entscheidung:**
* **Engine 3.3 Needed: INDICATED, NOT CONFIRMED.** Es gibt einen systematischen Befund (kein Impuls), aber die Ursache ist ungeklärt. Nächster Schritt ist eine Diagnose auf DEVELOPMENT: dieselben Fälle einmal mit OHLC-Reihen (wo vorhanden) und einmal mit gelockerten Impulsregeln wiedergeben. Erst danach wird über einen Bau entschieden.
* **Engine 3.3 Built: NO.**
* **HOLDOUT-4: NOT READY.** Bestandteile:
  * Practitioner-Holdouts, 43 Fälle, versiegelt vorhanden;
  * Real-Chart-Annotation, BLOCKED;
  * synthetischer Regelsatz.

## 5. UI-Implikation (§118)

VU zeigt in dieser Stichprobe nie eine Elliott-Zählung. Die latente Zählung kennt keine Impulse. Das stützt die bestehende Produktreihenfolge:
1. Struktur
2. Hauptszenario
3. Alternative
4. Zone
5. Invalidation
6. Evidenz
7. Elliott-Lesart, nur optional

Ob Praktiker untereinander uneinig sind, bleibt ungemessen.

## 6. Finaler Status (§129)

| Bereich | Status |
|---|---|
| Practitioner Dataset | **PILOT** — V1 eingefroren, 78 Fälle, 5 Quellenfamilien, HIGH 29,5 %, LLM-dual ohne menschlichen Audit |
| HKCM Coverage | **0** (YouTube-Bot-Prüfung, hkcm.de nur für Mitglieder, trading-treff bis 2021; nicht umgangen) |
| Independent Sources | **5 Familien** (ElliottWave-Forecast, Tiedje, 3 TradingView-Autoren) |
| Human-Human Agreement | **NOT MEASURABLE** (1 Paar) |
| VU-Human Agreement | **MEASURED (Pilot, ohne Konfidenzintervall)** — ausgegeben 0 % (Enthaltung 100 %); latent A1 21/33, B 6/18, C 1/31, F 0/18 |
| Engine 3.3 Needed | **INDICATED, NOT CONFIRMED** (keine Impulslesart; Ursache ungeklärt) |
| Engine 3.3 Built | **NO** |
| HOLDOUT-4 Ready | **NO** |
| Forecast Test | **RUN (deskriptiv, Pilot)** — keine Prognoseevidenz |

## 7. Entscheidung (§130)

**PATH C für das Produkt. Für die Forschung als Nächstes eine Diagnose, kein Bau.**
* **PATH A** (3.2.2 schon praktikernah) wird **durch nichts gestützt**: Enthaltung 100 %, F 0/18, C 1/31, keine Impulslesart. Ohne Konfidenzintervall und menschlich geprüfte Referenz ist das kein formaler Gegenbeweis, aber es gibt keinen Hinweis darauf.
* **PATH B** (Engine 3.3) ist **indiziert**: Es gibt einen konkreten, messbaren Befund. Ob 3.3 ihn beheben würde oder ob es am Eingang liegt, klärt erst die Diagnose. Die versiegelten Holdouts stehen für die eine spätere Prüfung bereit.
* **PATH C** (Szenario-Ebene priorisieren, Elliott optional) bleibt das **Produktverhalten**.

## 8. Selbstkritik (§131)

1. **Vollständig genug?** Nein. Pilot mit 78 Fällen, 35 ausgewertet, ohne Konfidenzintervalle. Den ersten Bericht hat das Red-Team in einem Kernbefund widerlegt.
2. **Welche Quellen dominieren?** ElliottWave-Forecast mit 58 % aller Fälle und 16 von 33 verglichenen.
3. **Wie stark ist Publication Bias?** Wahrscheinlich erheblich: selbst gewählte öffentliche Beiträge, Erfolgsformate, gelöschte Inhalte unsichtbar. Gegenmaßnahmen: vorab festgelegter Rahmen, systematische Ziehung, Rückblicke ausgeschlossen.
4. **Wie sicher ist die Extraktion?** Reproduzierbar zwischen zwei LLM-Durchgängen (Familie 93 %, Richtung 95 %), bei der laufenden Welle schwach (76 %). Kein menschlicher Audit (BLOCKED).
5. **Wie häufig widersprechen sich Praktiker?** Unbekannt, nur 1 Paar.
6. **Ist die exakte Zählung ein sinnvolles Ziel?** Nein. Selbst zwei Extraktionen derselben Analyse stimmen bei der Welle nur zu 76 % überein.
7. **Wo unterscheidet sich VU am stärksten?** Bei der Enthaltung und beim Fehlen jeder Impulslesart.
8. **Ist VU zu konservativ?** Bei der Ausgabe ja. Die latente Zählung kennt aber keine Impulse. Weniger Enthaltung allein würde mehr Lesarten zeigen, die von Praktikern abweichen.
9. **Systematisch falscher Grad?** Nicht messbar (n = 2).
10. **Sind Praktiker instabil?** Je Quelle verschieden (0–40 % revidierte Fälle in DEV+VAL). Revisionen wurden nur unter gezogenen Elementen erkannt.
11. **Brauchen wir trotzdem bezahlte Blind-Annotatoren?** Ja. Nur sie liefern gleichzeitige, unselektierte Urteile für die Mensch–Mensch-Übereinstimmung und den Audit der LLM-Extraktion.
12. **Wissenschaftlich sauberster nächster Schritt?**
    1. Menschlicher Audit von ≥ 20 % der V1-Zeilen.
    2. Diagnose des fehlenden Impulses auf DEVELOPMENT: OHLC- gegen Schlusskurs-Eingang, Regelstrenge.
    3. Erst dann über Engine 3.3 entscheiden.
    4. Danach **einmalig** die Holdouts entsiegeln.
    5. Gezielt gleichzeitige Praktikeranalysen sammeln (V1.1).
