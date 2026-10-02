# Forensischer Audit der Elliott-Engine (Master Mission II, §3–§7)

Gegenstand: `quant/engines/technical/elliott/elliott-v2.js` (Stand vor Mission II: `elliott-2.0.0`/Regelwerk `elliott-rules-2.0.1`, danach `elliott-2.1.0` und `elliott-2.2.0`), `patterns.js`, `pivot-engine.js`.
Methode: Code gelesen, jede Regel auf Quelle → Spezifikation → Code → Test → **beobachtetes Verhalten** abgebildet. Das beobachtete Verhalten stammt aus drei Messungen:
(1) synthetischer Benchmark mit bekannten Strukturen (`scripts/technical/elliott-synthetic-benchmark.mjs`, 12 Muster × 3 Rauschstufen × 3 Seeds),
(2) Bar-für-Bar-Replay der Engine über das Wochenuniversum (`scripts/technical/elliott-validation.mjs`),
(3) Einzelfall-Debugging.

## 1. Regelkarte

| Regel / Baustein | Quelle | Klasse | Code | Test | Beobachtetes Verhalten |
|---|---|---|---|---|---|
| W2 nie jenseits W1-Ursprung | EWP S. 31 R1 | HARD | `impulseRules` `W2_NOT_BEYOND_W1_ORIGIN` | EV2-R2 | korrekt, sofort entscheidbar |
| W3 nie die kürzeste | EWP S. 31 R2 | HARD | `W3_NOT_SHORTEST` | EV2-R2/R3 | korrekt; offen solange W5 läuft, sofort verletzt wenn W5 > W3 < W1 |
| W4 nie im Gebiet von W1 | EWP S. 31 R3 | HARD | `W4_NO_OVERLAP_W1` | EV2-R2 | korrekt (Schlusskurs-Basis bei Wochenreihen) |
| W3 jenseits W1-Ende | EWP S. 31 (implizit) | HARD | `W3_BEYOND_W1_END` | EV2-R2 | korrekt; offen auf laufender W3 |
| Richtungswechsel der Wellen | EWP Kap. 1 | HARD | `alternation()` | EV2-R1 | korrekt |
| Diagonale: W4 überlappt W1 | EWP S. 36–40 | DEFINITION | `DIAGONAL_W4_OVERLAPS_W1` | EV2-R5 | korrekt; Diagonalen werden erst angeboten, wenn die Überlappung sichtbar ist |
| Diagonale Keilform (W3<W1, W4<W2, W5<W3 bzw. umgekehrt) | EWP S. 36–40 | DEFINITION | `diagonalRules` | EV2-R5/R10 | 2.0.0: W4-Regel auf laufender W4 nicht entscheidbar (Fehler, in 2.0.1 behoben) |
| Zigzag: B < 90 % von A, B nie jenseits A-Ursprung | EWP Kap. 2 | DEFINITION/HARD | `zigzagRules` | EV2-R6 | korrekt |
| Flat: B ≥ 90 % von A, ≤ 200 % | EWP Kap. 2 | DEFINITION | `flatRules`, `flatVariant` (regulär/expandiert/running) | EV2-R6 | korrekt |
| Dreieck: kontrahierend/expandierend, E innerhalb | EWP Kap. 2 | DEFINITION/HARD | `triangleRules` | EV2-R7/R10 | 2.0.0: expandierende Dreiecke falsch invalidiert (behoben 2.0.1) |
| W-X-Y, Doppel-Zigzag | EWP Kap. 2 | DEFINITION | `wxyRules`, `doubleZigzagRules` | EV2-R8 | vorhanden; **Triple Three, Triple Zigzag, Dreieck als Y: fehlen** |
| Alternation W2/W4 (Tiefe, Dauer) | EWP Kap. 2 | GUIDELINE | `ALTERNATION` | EV2-R4 | nur im Rang; keine Form-Alternation (scharf/seitwärts, einfach/komplex) |
| Kanal (2–4-Linie, Parallele durch 3) | EWP Kap. 2 | GUIDELINE | `CHANNEL` | — | nur W5-Endpassung; keine Kanal-Projektion als Ziel |
| Extension in genau einer Welle | EWP Kap. 1 | GUIDELINE | `EXTENSION_IN_ONE`, `W3_EXTENSION` | — | Rang |
| Truncation | EWP Kap. 1 | GUIDELINE | `NO_TRUNCATION` (0,25 statt 1) | Synthetik | trunkierte Impulse werden **nicht** als Impuls erkannt (0/9 als Hauptzählung) |
| Wellencharakter W3 (Momentum, Volumen) | EWP Kap. 2 „Personality" | GUIDELINE | `W3_MOMENTUM`, `W3_VOLUME` | — | grob (Preis je Bar); Volumen bei Wochenreihen nicht verfügbar |
| W5-Divergenz | EWP Kap. 2 | GUIDELINE | **neu 2.1**: `personalityScore` (RSI an W3- vs. W5-Ende) | — | nur Count Quality, nicht Rang |
| Proportion (Zeit) | EWP Kap. 2; NEoWave „Similarity & Balance" | GUIDELINE | **neu 2.1**: `proportionScore` | — | nur Count Quality |
| Ähnlichkeit gleicher Grade (Preis ≥ 1/3) | NEoWave (Neely) | Regel nur in NEoWave | **fehlt** | — | Legs sehr unterschiedlicher Größe können denselben Grad bilden |
| Zeitgrenzen (C ≤ A+B in der Zeit) | NEoWave | Regel nur in NEoWave | **fehlt** | — | bewusst nicht übernommen (andere Schule, s. METHOD_RESEARCH) |
| Invalidation hart / Neuzuordnung | EWP, EWI | — | `invalidation()` | EV2-R9/R10 | 2.0.0 hatte 4 Fehler (C-Welle, Welle 1, Diagonale, Dreieck) — in 2.0.1 behoben |
| Fibonacci-Projektion | EWP Kap. 4 | GUIDELINE | `projections()` | EV2-O1 | Zonen statt Punkte |

## 2. Architektur-Befunde (Ursachen A–H aus §2)

| # | Befund | Ursache | Beleg | Status |
|---|---|---|---|---|
| 1 | **Späte Erkennung.** Ein Wellenende gilt erst, wenn der Kurs um die Umkehrschwelle der Analyseskala (Woche: 15 % bzw. 3,5 ATR) zurückgelaufen ist. | B DETECTION | Replay: Median 6 Wochen bis zur Bestätigung, 2 Wochen auf der feinsten Skala; bei Bestätigung ist im Median **≈ 59 %** des Weges zurück zum Leg-Ende bereits gelaufen | gemessen (ELLIOTT_VALIDATION_REPORT §5); Entwicklungsmodus (Ereignis vor Bestätigung) als Prüfgegenstand |
| 2 | **Zwangszählung.** Die Engine liefert praktisch an jeder Bar eine Zählung (UNAVAILABLE ≈ 0,1 %), 60 % davon „AMBIGUOUS". 82 % aller Swing-Rückläufe werden als „Fortsetzung erwartet" gelabelt. | C LABELING | Replay V2.1 | 2.1: Anwendbarkeit + Enthaltung; 2.2: Rauschschwelle |
| 3 | **Grad = Pivot-Skala**, gewählt als „zweitgröbste Skala mit ≥ 8 Legs". Ist die dominante Struktur nur auf einer Skala mit wenigen Legs sichtbar, zählt die Engine deren Unterwellen. | D DEGREE | Synthetik: klarer Zigzag (scale-3) wurde auf scale-2 als „Flat, Welle C" gezählt | 2.2: Gradwahl über alle Skalen |
| 4 | **Eltern-Kind-Prüfung falsch.** Der höhere Grad wurde mit seiner *nächsten* Bewegung verglichen statt mit der Welle, die die Zählung zeitlich enthält. Eine korrekte Lesart („Impuls = Welle C des Zigzags") erhielt 0,35. | D DEGREE | Debug ZIGZAG-Synthetik | 2.2: `nestedFit` (Richtung + erwartete Unterteilung der enthaltenden Welle) |
| 5 | **Teilmuster schlagen ganze Muster.** Kurze Lesarten mit hoher Richtlinienpassung (3 Legs) übertreffen vollständige Muster, weil Abdeckung nur mit 0,14 gewichtet ist. | C LABELING | Debug FLAT/ZIGZAG-Synthetik | offen (Gewichtsänderung bewusst nicht vorgenommen — wäre ungeprüftes Tuning) |
| 6 | **Zustandslos.** Jede Bar wird neu gezählt; keine Hysterese. | C LABELING | Replay: 6 % aller Wochen bringen eine Neuzuordnung ohne Abschluss/Bruch; mittlere Lebensdauer einer Zählung 5 Wochen | 2.2: optionale Persistenz (`input.previous`, Rangabstand 0,03) |
| 7 | **Rauschen erkennt die Engine nicht.** Bei starkem Rauschen bleibt die Anwendbarkeit „hoch", weil Rauschen Richtlinien leicht erfüllt. | C LABELING | Synthetik „high" | 2.2: Signal/Rauschen-Schwelle 1,6 (reale Wochenreihen: Median 2,5, 10 %-Quantil 1,86) |
| 8 | **Zigzag ≡ Welle 1-2-3.** 5-3-5 ist geometrisch identisch; ohne Kontext entscheidet die Engine meist für den Impuls. | C (inhärent) | Synthetik | dokumentiert; Alternative wird gezeigt |
| 9 | **Truncation** wird kaum erkannt (Richtlinie 0,25). | E COVERAGE | Synthetik 0/9 | offen |
| 10 | **Fehlende Muster:** Triple Three, Triple Zigzag, Dreieck in Y-Position, Running Triangle. | E COVERAGE | Code | offen (selten; dokumentiert) |
| 11 | **Benchmark:** Die frühere Studie verglich gegen unbedingte Zufallsbars. Elliott-Erkennung setzt einen bestätigten Gegen-Swing voraus. | F BENCHMARK | — | neue Benchmark-Leiter A/A-T/B/C/D/Modell |
| 12 | **Ergebnisdefinition:** Die frühere Studie nutzte für C-Wellen die Neuzuordnungs- statt der Regelgrenze; Lehrbuch-Erwartung „W3 > W1" ist durch die Regel bereits erzwungen (wer sie verfehlt, ist kein W3) → Selektionseffekt. | G OUTCOME | — | neue Studie misst *gegen gleiche Struktur ohne Label* |
| 13 | **Daten:** nur heute gelistete Titel, Wochenschluss ohne Volumen/Hoch/Tief. | H DATA | — | offen; ausgewiesen |

## 3. Synthetischer Benchmark (Vorher/Nachher)

Erwartetes Muster unter Hauptzählung (P) bzw. unter Haupt- + 2 Alternativzählungen (Top-3), 36 Fälle je Rauschstufe; Enthaltung = Anwendbarkeit LOW.
Werte aus `quant/data/technical-intelligence/elliott-validation/synthetic-benchmark.json` (siehe ELLIOTT_VALIDATION_REPORT §3).

## 4. Mensch vs. Algorithmus (§109)

| Was ein guter Analyst tut | Engine vor Mission II | algorithmisierbar? | Stand |
|---|---|---|---|
| ignoriert unklare Charts | zählt immer | ja (Anwendbarkeit, Rauschschwelle) | 2.1/2.2 |
| beginnt Zählungen an markanten Extremen | jeder Leg der letzten 11 kann Start sein | ja (Startpunkt-Prominenz) | offen |
| wählt den Grad, auf dem die Struktur klar ist | feste Skalenregel | teilweise (Mehrskalenwahl) | 2.2 |
| prüft Verschachtelung über mehrere Grade | nur nächste Bewegung des höheren Grades | ja | 2.2 (`nestedFit`) |
| hält an einer Zählung fest, bis sie widerlegt ist | neu je Bar | ja (Persistenz) | 2.2 optional |
| nutzt Kontext/Erzählung (Stimmung, Nachrichten) | nein | kaum | nicht geplant |
| beurteilt Proportion visuell | nein | teilweise (Zeit-/Preisproportion) | 2.1 Zeit; Preis offen |
| arbeitet mit Risikomanagement statt Trefferquote | — | Produktfrage | Szenarien mit Grenze |
| wechselt zwischen Zeitebenen | Woche/Tag getrennt | ja | Wochenkontext im Tagesmodus |
