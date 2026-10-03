# Elliott Validation Report (Master Mission II)

**Frage:** Was genau kann Elliott in Vision Universe leisten, wenn es professionell, algorithmisch sauber, prospektiv, fair gebenchmarkt und empirisch überprüft wird?
**Antwort in einem Satz:** Die Engine prüft die harten Elliott-Regeln nachprüfbar (jede Regel mit Quelle und Test) und erkennt klare Lehrbuch-Impulse, Diagonalen und Dreiecke; bei Flats, trunkierten Impulsen und der Gradwahl bleibt sie deutlich hinter einem Experten zurück (§2, §3a, §4); auf unabhängigen Aktien liefert das Elliott-Label aber **keine zusätzliche Prognoseinformation** über die gleiche Kursstruktur hinaus. Elliott bleibt im Produkt **Struktursprache und Szenario-Rahmen (KEEP – CONTEXT ONLY)**, ohne Richtungsstimme.

Datengrundlage: Wochenschlusskurse (split-bereinigt) aller heute gelisteten US-Stammaktien mit ≥ 5 Jahren Historie. Engine `elliott-2.2.0` mit Persistenz, Regelwerk `elliott-rules-2.0.1`. Vorab-Registrierung: PREREGISTRATION.md (inkl. Änderung 1 nach unabhängigem Review, vor dem Öffnen der Bestätigungsstichprobe). Rohberichte: `quant/data/technical-intelligence/elliott-validation/`.

---

## 1. Welche Elliott-Regeln sind implementiert?

Vollständige, aus dem Code erzeugte Matrix: **ELLIOTT_RULE_MATRIX.md** (19 Regeln/Definitionen, 21 Richtlinien, 11 Qualitäts- und Audit-Kriterien; je Klasse, Quelle, Fundstelle, Qualität, Umsetzung, Test, Einfluss).
Harte Regeln: Richtungswechsel; W2 nie > 100 % von W1; W3 jenseits W1-Ende; W3 nie kürzeste; W4 nie im Gebiet von W1 (Impuls); Diagonale: W4 nie jenseits W3-Ursprung; Zigzag: B nie > 100 % von A; Dreieck: E innerhalb.
Definitionen: Diagonal-Überlappung und Keilform, Zigzag/Flat-Grenze (90 %, EWI-Zahlenwert), Dreiecksform, Kombinationen (W/Y dreiteilig, X nicht jenseits W-Ursprung, Y schreitet voran).
Eine VU-Festlegung ohne klassische Grundlage ist als solche gekennzeichnet: Flat-B ≤ 200 % von A (`VU_OPERATIONAL`).

## 2. Welche fehlen?

Triple Three, Triple Zigzag, Dreieck in Y-Position, Running Triangle; Kanal-Zielprojektion; Form-Alternation (scharf/seitwärts); Preis-Proportion gleicher Grade als Rangkriterium (nur im Audit); Zeitrelationen (bewusst: Literatur selbst unzuverlässig); NEoWave-Regeln (andere Schule, bewusst nicht übernommen).

## 3. Welche waren falsch implementiert?

| Fehler | Version | Behoben |
|---|---|---|
| C-Welle: harte Grenze am B-Ende statt am Ursprung (B-Ende ist Neuzuordnung) | 2.0.0 | 2.0.1 |
| keine Invalidation während Welle 1/A | 2.0.0 | 2.0.1 |
| kontrahierende Diagonale: W4-Regel auf laufender Welle nicht entscheidbar; falsche Grenze | 2.0.0 | 2.0.1 |
| expandierende Dreiecke falsch invalidiert | 2.0.0 | 2.0.1 |
| Grad = feste Skalenregel → Unterwellen statt dominanter Struktur gezählt | 2.0 | 2.2 (Mehrskalenwahl) |
| Eltern-Kind-Prüfung gegen die *nächste* Bewegung statt gegen die enthaltende Welle | 2.0 | 2.2 (`nestedFit`) |
| Zwangszählung ohne Enthaltung, Rauschen nicht erkannt | 2.0 | 2.1/2.2 (Anwendbarkeit, Rauschschwelle) |
| Erkennungsverzug-Feld las feinste Pivots ohne Bestätigungsfilter (Blick in die Zukunft) | 2.1 | 2.2 (Review) |
| Klassen: X-Regel als HARD statt DEFINITION, Flat-200 % als DEFINITION statt VU-Festlegung | 2.0 | Matrix-Abgleich (Test EV2-Q1) |

Details: ELLIOTT_AUDIT.md.

## 4. Wie ähnlich ist die Engine professioneller Elliott-Analyse?

| Fähigkeit eines erfahrenen Analysten | Engine 2.2 | Beleg |
|---|---|---|
| Regeln strikt anwenden, Richtlinien nur gewichten | ja (keine Kompensation; Test EV2-Q2) | Regel-Audit je Zählung |
| Lehrbuchstrukturen erkennen | teilweise: 8/15 Referenzstrukturen als Hauptzählung, 1 als Alternative, 6 verfehlt (alle Flats, trunkierter Impuls, expandierendes Dreieck) | §3a |
| auf dem richtigen Grad zählen | **schwach**: in der Audit-Stichprobe zählt die Engine nur in 37/80 Fällen auf dem Grad des Ereignisses, 18/80 auf der feinsten (rauschnahen) Skala | §3b |
| unklare Charts nicht zählen | schwach: Zählung an 99,9 % aller Wochen, Enthaltung nur an 12,1 %, 47 % der Wochen „mehrdeutig" gezählt | §8 |
| an einer Zählung festhalten, bis sie widerlegt ist | teilweise: Persistenz senkt Neuzuordnungen, aber 6,4 % aller Wochen bringen weiterhin eine Neuzuordnung | §7 |
| Kontext, Stimmung, Erzählung | nein | — |

### 3a. Referenzsammlung (Lehrbuchstrukturen, synthetisch rekonstruiert)

Quelle der Strukturen: Frost & Prechter, *Elliott Wave Principle*, Kap. 1 (Grundmuster, Extension, Truncation, Diagonalen, Zigzags, Flats, Dreiecke, Kombinationen). Nur generische Proportionen aus den Textbeschreibungen; keine Abbildungen kopiert. Ergebnis je Fall mit Begründung: `elliott-validation/reference-set.json`.

| ID | Struktur | erwartet | Engine (ohne Rauschen) | Übereinstimmung | Begründung |
|---|---|---|---|---|---|
| R01 | Grundmuster Impuls | Impuls | Impuls | ja | 5/5 harte Regeln, 9/10 Richtlinien |
| R02 | Extension Welle 1 | Impuls | Zigzag (Enthaltung) | nein (mit Rauschen: ja) | ohne Rauschen 5-3-5-Lesart gleichauf; Anwendbarkeit niedrig |
| R03 | Extension Welle 3 | Impuls | Impuls | ja | |
| R04 | Extension Welle 5 | Impuls | Impuls | ja | |
| R05 | Truncation | Impuls | Zigzag, Welle C | nein | Richtlinie „keine Truncation" (0,25) plus Gradwahl auf scale-2 |
| R06 | Leading Diagonal | Diagonale | Leading Diagonal | ja | |
| R07 | Ending Diagonal | Diagonale | Ending Diagonal | ja | |
| R08 | Zigzag | Zigzag | Zigzag (mit Rauschen: Impuls W4) | ja / nein | 5-3-5 ist geometrisch identisch mit 1-2-3 |
| R09 | Doppel-Zigzag | Doppel-Zigzag | Impuls; Doppel-Zigzag als Alternative 2 | Alternative | Impuls-Rang höher (höherer Grad 0,69 vs. 0,40) |
| R10–R12 | Flat regulär / expandiert / running | Flat | Impuls (scale-2) | nein | **Gradfehler**: die Engine zählt die 5-teilige C-Welle eine Skala tiefer |
| R13 | Dreieck kontrahierend | Dreieck | Dreieck | ja | |
| R14 | Dreieck expandierend | Dreieck | Flat, Welle C | nein | Richtlinie „expandierend selten" (0,4) |
| R15 | Double Three | W-X-Y | W-X-Y | ja | |

### 3b. Manuelle Audit-Stichprobe

80 Zählungen aus der Bestätigungsstichprobe (geschichtet nach Zeitblock × Label, fester Seed), mit Chart bis zum Erkennungszeitpunkt, Haupt- und Alternativzählung, Regel-Audit mit Quellen, Count-Quality-Zerlegung, Anwendbarkeit und — getrennt, auf Klick — dem späteren Ergebnis: **`/quant/research/elliott-audit/`**. Audit-Set, kein Optimierungsdatensatz.
Automatisch auswertbare Befunde: Grad der Engine = Grad des Ereignisses in 37/80; feinste Skala 18/80; Anwendbarkeit hoch 49, mittel 20, keine verlässliche Zählung 11; Count Quality hoch 30, mittel 37, niedrig 13; späterer Erfolg nach Count Quality: hoch 17/30, mittel 20/37, niedrig 7/13 (keine Trennung).

## 5. Wie spät entstehen Counts? (Erkennungsverzug)

Je Ende einer Gegenbewegung (Bestätigungsstichprobe, 69.727 Fälle): Bestätigung auf der Ereignis-Skala im Median nach **3 Wochen**, frühestmöglich (feinste Skala) nach **2 Wochen**; bei Bestätigung ist im Median **57 %** des Weges zurück zum Leg-Ende bereits gelaufen; in **15 %** der Fälle ist das Leg-Ende dann schon überschritten.
**H6 (vorab registriert) bestätigt:** Der Einstieg in der *laufenden* Gegenbewegung schlägt den Einstieg nach der Engine-Bestätigung um **+3,9 Pp.** (95 %-KI +2,6 … +5,2), jeweils gemessen gegen Zufallszeitpunkte mit gleichen Abständen. Wichtig: Der Effekt ist **ein Zeitpunkt-Effekt, kein Elliott-Effekt** — Rückläufe ohne Fortsetzungs-Lesart zeigen dasselbe Muster (entwickelnd +0,5, bestätigt −1,7 Pp.). Diagnose: Ein Teil des früheren Negativbefunds war **Detection Failure** (zu späte Messung), aber das Elliott-Label selbst bringt auch bei früher Messung nichts zusätzlich (H2).

## 6. Wie häufig entstehen valide Counts? (Abdeckung)

Bestätigungsstichprobe: 1.784 Stammaktien → 1.311 mit ≥ 5 Jahren Historie → 1.110.566 analysierte Wochen → Zählung an 99,9 % → 69.791 Swing-Rückläufe → davon führt die Hauptzählung das Leg als jüngste Welle mit Fortsetzungs-Erwartung in 22.630 (CONT), mit Gegenrichtung in 8.246 (REV), gar nicht in 38.915 (NONE) → 66.403 mit Ergebnis (3.388 ohne Auflösung in 52 Wochen).

## 7. Wie stabil sind Counts? Wie häufig wird relabelt?

Neuzuordnung (andere Lesart, obwohl die vorige weder abgeschlossen noch gebrochen war): **6,4 %** aller Wochen; Neustart nach Abschluss/Bruch 5,1 %; mittlere Lebensdauer einer Zählung **5 Wochen** (Quartile 2–10); Gradwechsel 5,5 je 100 Wochen. Stabilere Zählungen (≥ 13 Wochen unverändert) erreichen das Ziel absolut häufiger (49,2 % vs. 44,4 %), aber nicht mehr als Zufall gleicher Geometrie (+0,7 vs. +1,6 Pp.) → Stabilität ist kein Prognosemerkmal.

## 8. Count Quality: zerlegbar, quellengebunden — und kalibriert?

Count Quality ist ein gewichtetes Mittel dokumentierter Bestandteile (ELLIOTT_RULE_MATRIX.md); jede Regelverletzung → **UNGÜLTIG**, kein Score. Je Zählung liegt ein vollständiges Regel-Audit vor (harte Regeln x/y, Definitionen x/y, Richtlinien erfüllt x/y mit Wert und Quelle, Grad, Proportion, Fibonacci, Alternation, Kanal, Extension, Überlappung, Momentum, Volumen).
**Kalibrierung (Bestätigungsstichprobe, Fortsetzungs-Fälle):**

| Count Quality | n | Ziel erreicht | Zufall gleiche Abstände | Überschuss (95 %-KI) |
|---|---|---|---|---|
| hoch | 7.964 | 46,2 % | 43,9 % | +2,4 (+0,7 … +4,1) |
| mittel | 10.758 | 44,8 % | 43,3 % | +1,5 (+0,3 … +2,7) |
| niedrig | 2.813 | 45,1 % | 44,2 % | +0,9 (−1,3 … +3,4) |

Hoch − niedrig: +1,4 Pp. (−1,6 … +4,0) — **nicht signifikant**; gegen das strukturelle Basismodell verschwindet der Unterschied ganz (H3: −0,9 Pp.). **Folgerung:** „Count Quality hoch" bedeutet bei Vision Universe ausschließlich *bessere methodische Übereinstimmung mit Elliott*, **keine** höhere Trefferwahrscheinlichkeit. Das Produkt sagt das so.

Anwendbarkeit (Fortsetzungsfälle): hoch 45,9 % (Überschuss +1,8, KI +0,6 … +3,2, n = 15.481), mittel 44,0 % (+1,4, −0,6 … +3,1), keine verlässliche Zählung 44,9 % (+3,8, −0,7 … +8,0, n = 590) — keine Trennung (über alle Labels ebenso: 46,6 / 44,3 / 43,7 %). Selektive Anwendung (nur anwendbare Fälle): +1,7 statt +1,7 Pp. → **Enthaltung verbessert die Prognose nicht**; sie bleibt dennoch richtig, weil sie verhindert, dass auf verrauschten Charts eine Zählung vorgespiegelt wird.

## 9–12. Benchmarks und inkrementeller Wert (vorab registriert, Bestätigungsstichprobe)

| Vergleich | Ergebnis |
|---|---|
| A: Zufallszeitpunkt gleicher Abstände | CONT 45,4 % vs. 43,6 % (+1,7 Pp., KI +0,6 … +3,0) |
| A-T: zusätzlich gleicher Trendkontext | 43,9 % |
| B: gleiche Rückläufe ohne Fortsetzungs-Lesart | 46,1 % (CONT ist nicht besser) |
| C: Rücksetzer im Trend, mit vs. ohne Label | −0,3 Pp. (−1,7 … +1,1) |
| D: geschichtete Kontrolle (Richtung, Trend, Momentum, Volatilität, Regime, Zeitblock, Leggröße, Tiefe, Geometrie) | +0,2 Pp. (−0,9 … +1,0) |
| Modell: Nicht-Elliott-Basis vs. + Elliott (walk-forward, out-of-sample) | ΔLogLoss 0,0000 (−0,0001 … +0,0001), ΔAUC +0,0001 |

| Hypothese | Schätzer (95 %-KI) | Ergebnis |
|---|---|---|
| H1 Elliott verbessert Basismodell | ΔLogLoss 0,0000 (−0,0001 … 0,0001) | nicht bestätigt |
| H2 Fortsetzungs-Lesart vs. gleiche Struktur ohne | +0,15 Pp. (−0,65 … +0,97), Abdeckung 100 % | nicht bestätigt |
| H3 beste 20 % Count Quality | −0,9 Pp. (−3,2 … +1,3) | nicht bestätigt |
| H4 höherer Grad konsistent vs. Konflikt | +2,3 Pp. (−0,5 … +5,4), p = 0,06 | nicht bestätigt (Hinweis) |
| H5 hohe vs. niedrige Volatilität | **−3,2 Pp. (−5,2 … −0,9)** | widerlegt (Gegenrichtung) |
| H6 entwickelnder vs. bestätigter Einstieg | **+3,9 Pp. (+2,6 … +5,2)** | **bestätigt** (Zeitpunkt-Effekt) |
| H7 Fibonacci-Konfluenz | −0,6 Pp. (−1,9 … +0,7) | nicht bestätigt |

**Replikation auf der explorativen Stichprobe** (3.122 Emittenten, 168.773 Rückläufe, gleiche Engine): H1 +0,0001 (0 … +0,0001), H2 +0,3 Pp. (−0,3 … +0,8), H3 **−1,5 Pp. (−3,0 … −0,2)**, H4 −0,6 Pp. (−2,2 … +1,2), H5 **−2,8 Pp. (−3,9 … −1,4)**, H6 **+3,1 Pp. (+2,3 … +4,0)**, H7 −0,5 Pp. — dasselbe Bild; der H4-Hinweis der Bestätigungsstichprobe wiederholt sich **nicht**.

**Inkrementeller Wert von Elliott: keiner messbar.** Die Regime-Hypothese aus der ersten Studie (Vorteil bei hoher Volatilität) ist für Elliott-Fortsetzungen nicht nur nicht bestätigt, sondern umgekehrt.

### 12a. Vorher/Nachher: Engine 2.1 (Legacy) vs. 2.2 auf derselben explorativen Stichprobe

Gleiche Ereignisse (168.773 Rückläufe, 3.122 Emittenten), gleiche Auswertung; Unterschied nur die Engine (`--legacy`: eine Skala, kein verschachtelter höherer Grad, kein Signal-Rausch-Gate, keine Persistenz). Bericht: `report-exploratory-v21-legacy.json`.

| Kennzahl | 2.1 Legacy | 2.2 (Persistenz) |
|---|---|---|
| Enthaltung (Wochen ohne verlässliche Zählung) | 31,2 % | 12,1 % |
| Status OK / AMBIGUOUS | 39,6 % / 60,3 % | 52,9 % / 47,1 % |
| Ereignisse mit Fortsetzungs- / Umkehr-Label | 27.045 / 6.675 | 54.780 / 20.091 |
| Relabel-Quote je Woche | 6,1 % | 6,4 % |
| Skalenwechsel je 100 Wochen | 0,07 | 5,5 |
| Median-Lebensdauer einer Zählung | 5 Wochen | 5 Wochen |
| Erkennungsverzug (Median, Pivot-Bestätigung / frühestens)¹ | 3 / 2 Wochen | 3 / 2 Wochen |
| H1 ΔLogLoss | +0,0001 (0 … +0,0002) | +0,0001 (0 … +0,0001) |
| H2 CONT vs. ohne | −0,04 Pp. (−1,9 … +1,8) | +0,3 Pp. (−0,3 … +0,8) |
| H3 beste 20 % Count Quality | −0,9 Pp. (−4,9 … +2,5) | −1,5 Pp. (−3,0 … −0,2) |
| H4 höherer Grad | +0,2 Pp. (−2,6 … +3,5) | −0,6 Pp. (−2,2 … +1,2) |
| H5 hohe vs. niedrige Volatilität | −6,7 Pp. (−10,0 … −2,7) | −2,8 Pp. (−3,9 … −1,4) |
| H6 entwickelnd vs. bestätigt | +5,8 Pp. (+4,3 … +7,1) | +3,1 Pp. (+2,3 … +4,0) |

¹ Der Verzug wird an der Bestätigung der Gegenbewegung auf der Skala des Ereignisses gemessen (gemeinsame Pivot-Erkennung) und ist für beide Versionen per Konstruktion gleich; die Versionen unterscheiden sich in H6 nur über die Auswahl der gepaarten Fortsetzungsfälle.

**Lesart.** Engine 2.2 setzt mehr der Elliott-Methode um (Grad-Auswahl, verschachtelter höherer Grad, Rausch-Erkennung) und enthält sich auf echten Daten seltener. Im synthetischen Benchmark ist das Bild **gemischt**: Hauptzählung richtig 36/108 (2.2) vs. 32/108 (2.1); bei geringem Rauschen 20/36 vs. 14/36, bei hohem Rauschen aber nur 2/36 vs. 8/36 (Enthaltungen bei hohem Rauschen 20/36 vs. 32/36; Enthaltung und Rang der erwarteten Zählung werden getrennt gemessen). Je Muster: Diagonalen 7/18 vs. 0/18, Zigzag 3/9 vs. 0/9, doppelter Zigzag 0/9 vs. 3/9 als Hauptzählung (6/9 vs. 7/9 unter den ersten drei), trunkierter Impuls 1/9 vs. 3/9, Flats 1/27 vs. 1/27 — aber der Prognosewert ist in beiden Versionen null. Die Verbesserung der Methodentreue hat **keinen** Ergebnisvorteil erzeugt. Kehrseite der Mehrskalen-Auswahl: deutlich mehr Skalenwechsel (5,5 je 100 Wochen); die Relabel-Quote bleibt dank Persistenz auf Legacy-Niveau. Das Produkt zeigt Skalenwechsel als Relabeling-Risiko an.

### 12b. Parameter-Robustheit (Skalen-Multiplikator der Swing-Erkennung)

Explorative Stichprobe, 800 gleichmäßig verteilte Reihen, Engine 2.2 mit Persistenz. Der Multiplikator skaliert alle Swing-Schwellen (feinere bzw. gröbere Wellen); damit ändern sich auch die engine-unabhängigen Ereignisse. Berichte: `report-exploratory-v22-sticky-{x0.8-,x1.25-,}n800.json`.

| Multiplikator | Ereignisse | Enthaltung | Relabel/Woche | Skalenwechsel/100 W. | H2 | H3 | H4 | H5 | H6 |
|---|---|---|---|---|---|---|---|---|---|
| × 0,8 | 39.809 | 8,2 % | 7,2 % | 6,6 | −0,3 (−1,3 … +1,0) | −1,1 | +2,2 (−0,7 … +4,9) | −1,3 | **+3,5 (+2,0 … +5,1)** |
| × 1,0 | 31.751 | 11,6 % | 6,5 % | 5,6 | +0,8 (−0,3 … +2,1) | −0,3 | +0,3 | −3,0 (−5,6 … −0,4) | **+2,6 (+1,1 … +4,3)** |
| × 1,25 | 24.692 | 16,4 % | 5,7 % | 4,6 | +1,6 (+0,2 … +2,8) | −1,0 | +1,6 | −3,6 | **+4,0 (+2,1 … +5,8)** |

H1 in allen Varianten ≈ 0 (ΔLogLoss ≤ 0,0003), H7 nie von null verschieden. **Lesart:** Das Gesamtbild ist robust gegenüber der Parameterwahl — nur H6 (Zeitpunkt) ist durchgehend positiv. Bei gröberen Wellen (× 1,25) liegt H2 einmal knapp über null; das ist eine von drei explorativen Varianten ohne Mehrfachtest-Korrektur und widerspricht der Bestätigungsstichprobe (+0,15, n. s.) nicht genug, um als Befund zu gelten. Notiert als Kandidat für eine künftige Präregistrierung (gröbere Grade).

### 12c. Cross-Market (explorativ, unterbesetzt)

13 auswertbare Reihen außerhalb des Aktienuniversums (Index-ETFs, Rohstoffe, Edelmetalle, Kryptowährungen; Wochenschluss), 872 Ereignisse. Keine Hypothese von null verschieden; Konfidenzintervalle ±5–40 Pp. — **nicht aussagekräftig**. Struktur-Kennzahlen ähnlich wie bei Aktien: Enthaltung 13,5 %, Relabel 5,0 % je Woche, Lebensdauer einer Zählung 5 Wochen. Bericht: `report-multi-v22-sticky.json`.

## 13–15. Unterschiede nach Regime, Muster und Grad (explorativ, BH-korrigiert)

Überschuss der Fortsetzungs-Fälle über das Basismodell, Bestätigungsstichprobe: nach Muster/Welle (z. B. Impuls W2 −1,2, W4 +0,4, Flat-B −3,3, Zigzag-B +0,2 Pp.) und nach Grad (scale-2 −0,7, scale-3 +1,6 Pp.) keine signifikanten Unterschiede; einzig signifikant nach Benjamini-Hochberg: obere Volatilitätsdrittel (−2,0 Pp.) und Börsenalter < 6 Jahre (−1,9 Pp.) — beide **negativ**. Höherer Grad konsistent: +1,1 vs. Konflikt −1,2 Pp. (Kontrast = H4, nicht bestätigt).

## 16. Verbleibende Grenzen

* Survivorship: nur heute gelistete Titel; absolute Quoten überhöht (Vergleiche weniger betroffen).
* Wochenschlusskurse ohne Hoch/Tief/Volumen; Volumen-Merkmale nicht prüfbar.
* Grad-Problem nicht gelöst (§4); Flats und trunkierte Impulse werden schlecht erkannt. → Nachtrag: in Engine 3.x weitgehend behoben (synthetisch, getrennte Fälle); Gate dennoch nicht bestanden, siehe ELLIOTT_ENGINE3_REPORT.md.
* Der Titel-Holdout ist nicht völlig unberührt (gleiche Kursreihen in der früheren aggregierten Studie, andere Frage).
* Fundstellen auf Kapitelebene; Volltext nicht geprüft (ELLIOTT_RULE_MATRIX.md).

## 17. Einstufung

| Komponente | Einstufung | Begründung |
|---|---|---|
| Elliott-Zählung (Richtung) | **KEEP – CONTEXT ONLY**, Konfluenzgewicht 0 | H1/H2 nicht bestätigt (vorab festgelegte Regel) |
| Elliott-Invalidation, Zonen, Szenarien | KEEP – CONTEXT | regelbasierte, prüfbare Grenzen; Sprache für Struktur |
| Count Quality | KEEP – nur als methodische Güte | nicht kalibriert; keine Trefferaussage |
| Höherer-Grad-Konsistenz | KEEP – CONTEXT (Profi-Anzeige, ohne Prognoseanspruch) | H4 verfehlt (Bestätigung p = 0,06, explorativ −0,6 Pp.) |
| Früher Einstieg im Rücklauf | KEEP – CONTEXT (Zeitpunkt-Wissen) | H6 bestätigt; **Abweichung von der vorab festgelegten Produktfolge** (PREREGISTRATION §6, Abweichung 1): entwickelnde Zählungen werden nicht zusätzlich hervorgehoben |
| Fibonacci | KEEP – CONTEXT | H7 nicht bestätigt, keine Häufung |
