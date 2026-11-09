# Supertrader – Darvas-Box, quellentreu (C03)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-2 (#785).

Code: `scripts/supertrader/source-faithful/methods/darvas.mjs`. Vertrag: `contracts/darvas.mjs`. Tests: `tests/sf-darvas.test.mjs` (19).

## 1. Explizite Box-State-Machine (#709 B06, Q&A S. 182–198)

| Zustand | Übergang | Regel | Golden Case |
|---|---|---|---|
| SEEK_TOP → TOP_PENDING | jedes neue Hoch ist Kandidat | DAR-Q1 | GC-DAR-TOP-CONFIRM |
| TOP_PENDING | höheres Hoch → neuer Kandidat | DAR-Q1 | GC-DAR-TOP-HIGHER-RESET |
| TOP_PENDING | Berührung (gleiches Hoch) → Zählung neu | DAR-Q1 | GC-DAR-TOP-TOUCH-RESET |
| TOP_PENDING → BOTTOM_SEARCH | drei Folgetage ohne Berührung → Deckel bestätigt | DAR-Q1 | GC-DAR-TOP-CONFIRM |
| BOTTOM_SEARCH | tieferes Tief → neuer Kandidat; Berührung → Zählung neu | DAR-Q2 | GC-DAR-BOTTOM-TOUCH-RESET |
| BOTTOM_SEARCH → BOX | drei Folgetage ohne Berührung → Boden bestätigt | DAR-Q2 | GC-DAR-BOTTOM-CONFIRM |
| BOTTOM_SEARCH → TOP_PENDING | Hoch über dem Deckel vor dem Boden → Neustart | DAR-Q1/Q2 (abgeleitet) | GC-DAR-TOP-EXCEEDED-BEFORE-BOTTOM |
| BOX → BREAKOUT | erster Tag mit Hoch ≥ Deckel + Bruchteil; kein Warten | DAR-Q3/Q4 | GC-DAR-BREAKOUT-NO-WAIT, GC-DAR-GAP-OPEN-FILL |
| BOX → SEEK_TOP | Tief unter dem Boden vor dem Ausbruch → Box aufgelöst | DAR-Q11 (abgeleitet) | GC-DAR-BOX-FAIL |

Ein rollierendes neues Hoch ohne bestätigte Box ist kein Signal (SF-DAR-NOT-ROLLING-HIGH). Darvas wird nicht auf einen Rolling-High-Breakout reduziert.

## 2. Stops (DAR-B6, DAR-Q5–Q8)

- Der Stop wird mit dem Kauf gesetzt, einen Bruchteil unter dem durchbrochenen Deckel.
- Er wird bei jeder späteren vollständigen, höheren Box einen Bruchteil unter deren Boden angehoben. Wirksam ist das ab dem Folgetag; der Stop wird nie gesenkt.
- Exit am ersten Tag mit Tief ≤ Stop, Füllung zu min(Eröffnung, Stop).
- Konvention für den Einstiegstag: Liegt das Tief am Initialstop, gilt der Exit pessimistisch noch am selben Tag (gezählt).

## 3. Offene Quellenpunkte, deklariert

- **„Ein Bruchteil“ (DAR-Q4/Q5)** ist nicht beziffert. Konvention: ein Roh-Cent, umgerechnet in die split-bereinigte Basis. Der Reviewer darf je Trade abweichen (DAR-C-THIO).
- **Beginn der Bodensuche (#709 VU-DAR UNRESOLVED).** Beide Lesarten sind umgesetzt (`AFTER_TOP_CONFIRMED` als Standard, `AFTER_TOP_DAY`); jeder Datensatz nennt die Variante (`SOURCE_AMBIGUOUS`).
- **Allzeithoch (DAR-Q9).** Gate innerhalb der verfügbaren Historie. Die Snapshot-Reihen beginnen 2015 (Warm-up), deshalb lautet der Status `ALL_TIME_HIGH_IN_AVAILABLE_HISTORY_UNVERIFIED`; Data Readiness: PARTIAL.

## 4. Manuelle Ebene (`MANUAL_REVIEW_REQUIRED`, nie BUY)

Folgende Punkte entscheidet der Reviewer:
- techno-fundamentale Auswahl (DAR-Q12/Q14, B9–B11);
- Volumen relativ zur eigenen Historie (DAR-Q10; die Maschine meldet das Verhältnis zum Box-Durchschnitt);
- Markt (DAR-Q13, B14);
- Größe, Piloten und Nachkäufe (DAR-B15/B18/B8);
- Re-Entry (DAR-Q11).

Persönliche Ausnahmen (Piloten mit 10 %-Stops 1959, Thiokol-Finanzierung) werden nicht verallgemeinert.

Abgeleiteter Status: `PARTIAL_MANUAL_REVIEW`. Ausführung: `MANUAL_REVIEW_SCREEN`. Backtest: `COMPONENT_SIGNAL_STUDY_ONLY`.

## 5. Behobene VU-Abweichungen (#709 VU-DAR)

| VU Darvas 3.0.x | Jetzt |
|---|---|
| Boden-Berührung setzt die Bestätigung nicht zurück | Touch-Reset für Deckel und Boden |
| 1 %-Stop, 20-Tage-Hoch, 3–25 % Boxhöhe, RS80, SPY200 (TraderFox), KK-Risiko | entfernt; nur Quellenregeln und der deklarierte Ein-Cent-Bruchteil |
| rollierender 252-Tage-Verdopplungsfilter | nicht übernommen (DAR-Q17) |

## 6. Komponentenstudie

`runner/run-research.mjs` erfasst jeden ATH-gefilterten Ausbruch im Research-Universum mit seinem mechanischen Exit. Die Trades sind gleich gewichtet, ohne Sizing und ohne Auswahl; Kosten 10 bp + 1 bp je Seite. Das Label lautet `COMPONENT_SIGNAL_STUDY_NOT_A_METHOD_RETURN`. Das Ergebnis ist keine Darvas-Rendite.
