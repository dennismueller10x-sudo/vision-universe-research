# Elliott Engine 3 — Quality Remediation Report

Stand: 03.10.2026. Gegenstand ist die **fachliche Qualität** der Elliott-Engine (Methodentreue), nicht ihr Prognosewert. Vorab-Registrierung, Splits und Gate: [ELLIOTT_ENGINE_QUALITY_PREREG.md](ELLIOTT_ENGINE_QUALITY_PREREG.md) (§1–7, Änderung 1 in §8). Alle Zahlen stammen aus Dateien unter `quant/data/technical-intelligence/elliott-validation/`; nichts davon wurde von Hand übertragen, ohne die Datei zu nennen.

**Kurzfassung.** Engine 3.1 erkennt synthetische Elliott-Strukturen auf getrennten, nie zuvor angesehenen Fällen etwa **fünfmal** so oft richtig wie Engine 2.2. Flats, Truncation und expandierende Dreiecke werden nicht mehr verfehlt. Gebrochene harte Regeln kommen in ausgegebenen Zählungen nicht mehr vor. Echte Wochencharts werden ehrlicher behandelt: Enthaltung statt falscher Sicherheit. Das vorab registrierte Gate ist auf HOLDOUT-2 **nicht vollständig bestanden**: G5 (grober Grad-Fehler) liegt bei 29 % statt ≤ 25 %, und bei hohem Rauschen (G1 10 % statt ≥ 20 %) bleibt die Engine nahe am Zufall. Deshalb gibt es **keinen** neuen Prognose-Backtest (Prereg §7). Elliott bleibt im Produkt „Experimentelles Strukturmodell". Eine Bewertung durch echte Experten gibt es nicht. Die Engine ist **nicht** „expert validated".

## 1. Ausgangslage (Engine 2.2)

| Defekt (Missionstext) | Befund im Audit |
|---|---|
| Grad 37/80 | Messartefakt: verglichen wurde mit der Skala des Rücklauf-Ereignisses, die fast immer die feinste ist (`degree-taxonomy-2.2.json`). Auf dem Korpus mit bekannter Wahrheit liegt 2.2 bei **11 %** Grad EXACT/NESTED (HOLDOUT-1); 56 % der Fehler zählen eine Ebene zu tief (LOWER). |
| Synthetisch 8/15 | Auf dem parametrischen Korpus v2 (zufällige Proportionen, verschachtelte Unterwellen, Kontext, Rauschen) liegt 2.2 bei **10,8 %** Haupttreffer. Die alte 8/15 galt für einzelne Lehrbuchpfade ohne Unterwellen. |
| Flats, Truncation, expandierendes Dreieck verfehlt | Ursache: Wellenenden nur an Zigzag-Pivots. Orthodoxe Enden (B jenseits des Ursprungs, verkürzte 5. Welle, E-Überschießen) gab es nicht. |
| 47 % mehrdeutig | 46,3 % der Wochen `AMBIGUOUS` (HOLDOUT-Emittenten, `stability-holdout-v2.json`), ohne Zerlegung nach Ursache. |
| Kein Experten-Abgleich | Unverändert (§9). |
| Schlechter bei hohem Rauschen | Ja; 2.2 bleibt bei hohem Rauschen trotzdem sehr sicher (G7 falsche Sicherheit 91,5 %). |
| Relabeling | 11,4 % Neuzuordnungen je Woche, 1,0 % instabil (HOLDOUT). |

## 2. Architektur Engine 3.x

`quant/engines/technical/elliott/elliott-v3.js` (aktuell `elliott-3.1.0`, Regeln `elliott-rules-3.1.0`). Umschaltbar über `methodology.elliottEngine = "v3"`; das Produkt läuft weiterhin auf 2.2 (§11).

1. **Kausaler ATR-Pivotpool.** Alle Umkehrpunkte ≥ 1 ATR, keine festen Skalen. Damit entfällt die Skalenwahl, die in 2.2 Ursache der Grad-Fehler war.
2. **Extremale Nachfolger plus orthodoxe Enden.** Jede Welle endet am Extrem bis zum nächsten Gegen-Pivot. Zusätzlich gibt es Kandidaten für Überschießen (bis 40 % der Vorwelle, z. B. B im expandierten Flat) und für kurze Enden (bis 70 %, laufendes Flat, verkürzte 5., Dreieck). Seit 3.1 sind kurze Enden nur an Korrekturpositionen zulässig. Die Welle muss sich dann passend unterteilen (laufendes Flat, Dreieck, verkürzte Welle, Enddiagonale).
3. **DFS über Musterschablonen.** Für jede Musterklasse: harte Regeln an Wellenenden **und** gegen Preisextreme innerhalb jeder Welle (`intraOk`, seit 3.1). Lesarten sind abgeschlossen, entwickelnd (endet am aktuellen Kurs) oder intern (laufende Welle mit eigenem Rücklauf).
4. **Skalenraum-Unterteilung.** Jede Welle wird auf 7 relativen Rastern (4–40 % der Wellenlänge) als 3/5/7/9 Unterwellen gelesen; die Struktur muss zur Rolle passen (Impuls 5, Korrektur 3 …).
5. **Bewertung.** Gewichtete Komponenten: Unterteilung, Anker (Ursprungssignifikanz), Dominanz gegenüber Bewegungen vor p0, Abdeckung, Guidelines, Muster-Prior, Rest. Die Gewichte wurden ausschließlich auf DEVELOPMENT geeicht (`scripts/technical/elliott-calibration/`; Sensitivität ±50 % je Gewicht: kein Gewicht ändert die Trefferzahl um mehr als 6 %, außer Unterteilung (−6 %) und Prior (−4 %)).
6. **Grad.** Die Hauptzählung trägt `degree` (relative Ebene im Pool). `containing()` sucht die nächsthöhere Struktur, die die Hauptzählung als einzelne Welle enthält.
7. **Mehrdeutigkeit zerlegt.** Je Analyse `ambiguity.kind` NONE / DEGREE / LABEL / STRUCTURE (§6).
8. **Anwendbarkeit.** Logistisches Modell (Zählqualität, Klarheit, Bewegungsstärke z, Strukturmehrdeutigkeit, entwickelnd), angepasst auf DEVELOPMENT-**Struktur**treffern, nicht auf Kursergebnissen. HOCH ≥ 0,6, MITTEL ≥ 0,35, sonst Enthaltung.
9. **Datenqualität.** Lücken und vermutete Splits führen zur Enthaltung (`dataQuality`).
10. **Nachvollziehbarkeit.** `trace` (gewählte Zählung, abgelehnte Spitzenkandidaten mit Grund, Erklärungstext) im Pro-Panel als „Warum diese Zählung?".
11. **Hysterese.** Neue Hauptzählung nur bei Scoreabstand > 0,05 (§7).

Laufzeit: Median 41–44 ms je Wochenanalyse (G11 ≤ 50 ms).

## 3. Verlauf (nur DEVELOPMENT, Seeds 0–9, Layout A, alle Rauschstufen)

| Stand | Haupttreffer | Haupt+Alt |
|---|---|---|
| 2.2 (Ausgangswert, Prereg §4) | 9,2 % | 10,8 % |
| 3.0 erster Durchlauf (Pool, DFS, Unterteilung) | 21 % | – |
| + orthodoxe Enden, Dominanz, Kontext-Komponenten | 32 % | – |
| + Gewichtssuche, Anwendbarkeit, Hysterese (3.0.0) | 44–46 % | 58 % |
| 3.1.0 (Red-Team-Fixes, Neueichung A+B) | 56,3 % (n/l/m) | 71,5 % (n/l/m) |

Verworfene Lösungswege (alle auf DEVELOPMENT getestet und dokumentiert): Containment-Belohnung durch den höheren Grad (verschiebt Richtung Unterstrukturen, Gewicht → 0 bzw. nur Konfliktstrafe); Trendkontext-Komponente (Bias, Gewicht 0); Ähnlichkeitskomponente (kein Effekt); harte z-Schwelle für HOCH (`highMinZ`, ohne Wirkung auf G7); höhere bzw. informationsabhängige Hysterese (§7).

## 4. Prüfungen auf getrennten Fällen

### 4a. VALIDATION (Seeds 10–19, ≤ 3 Architekturvergleiche)

3.0.0 vor dem Einfrieren: G1 60,4 / G2 73,8 / G3 46,7 / G4 62,1 / G5 15 / G6 0 / G7 14,5 / G9 100 bzw. 99,7 / G11 46,8 ms; instabile Neuzuordnungen 0,77 % vs. 2.2 1,10 % (VALIDATION-Emittenten).

### 4b. HOLDOUT-1 (Seeds 20–29, eingefroren 3.0.0, `freeze-elliott-3.0.0.json`, Hash 9a43273ad5a9629e)

| Kriterium | Schwelle | 3.0.0 | 2.2 | |
|---|---|---|---|---|
| G1 Haupttreffer | ≥ 45 % | **55,8 %** | 10,8 % | ✅ |
| G2 Haupt+Alt | ≥ 60 % | **68,8 %** | 13,1 % | ✅ |
| G3 schwächste Klasse | ≥ 25 % | **43,3 %** (Leitdiagonale) | 0 % | ✅ |
| G4 Grad EXACT/NESTED | ≥ 50 % | **56,9 %** | 11,0 % | ✅ |
| G5 grober Grad-Fehler | ≤ 25 % | **18,1 %** | 27,7 % | ✅ |
| G6 False Accept | ≤ 5 % | 0 % | 0 % | ✅ |
| G7 falsche Sicherheit | ≤ 25 % | **14,8 %** (n = 183) | 91,5 % | ✅ |
| G8 harte Regeln | 0 | **verletzt** (Red-Team H1) | – | ❌ |
| G9 Invarianz ×2 / +100 | ≥ 98 % | 100 / 98,9 % | – | ✅ |
| G10 instabile Neuzuordnungen | ≤ 2.2 | **0,64 %** | 1,00 % | ✅ |
| G11 Laufzeit Median | ≤ 50 ms | 41 ms | – | ✅ |

HOLDOUT-1 ist damit nicht bestanden (G8). Das Ergebnis wird unverändert berichtet. Mit hohem Rauschen gelang 3.0.0 der Haupttreffer in 9/160 Fällen (5,6 %), bei 85,6 % Enthaltung.

### 4c. Unabhängiges Red-Team-Review (nach HOLDOUT-1)

Ein getrennter Prüfer (eigener Agent, nur Code und Daten, keine Kenntnis der Gewichtssuche) fand:

* **H1** Harte Regeln wurden nur an Wellenenden geprüft; über kurze orthodoxe Enden konnte z. B. Welle 2 innerhalb ihres Verlaufs unter den Ursprung von Welle 1 fallen. Reproduziert: 165 Verstöße in 3.0.0-Ausgaben auf HOLDOUT-2.
* **H2** Generator und Engine teilen Annahmen (Kontextmuster endet am Ursprung, unstrukturierte Bestätigung, Auswertung am Extrem).
* **H3** Das Gate ließ das hohe Rauschen aus, das echten Wochencharts am nächsten liegt (Median z ≈ 1,5 auf echten Charts ≈ medium/high).
* **H4** „Grad-Mehrdeutigkeit" war zu weit (auch gegenläufige Alternativen) und hob die Anwendbarkeit.
* **M5–M9, L10–L14** u. a.: Parameter `alternativeMinInvalidationGapAtr` stand in einem Kommentar (L10); Dreifach-Zigzag akzeptierte beliebige Korrekturen als W/Y/Z.

Die erlaubten Änderungen wurden **vor** jeder Arbeit an 3.1 als Prereg-Änderung 1 festgeschrieben. Ebenso festgeschrieben wurde ein neuer, unabhängiger Prüfsatz HOLDOUT-2: Korpus-Layout B mit Zufallspfad-Kontext, unterteilter Bestätigung, zufälligem Auswertungszeitpunkt und Seeds 40–49.

### 4d. HOLDOUT-2 (Layout B, Seeds 40–49, eingefroren 3.1.0, `freeze-elliott-3.1.0.json`, Hash bf4eb583cc1e491f)

Einmal ausgewertet; dieselben Fälle auch für das eingefrorene 3.0.0 (Git-Worktree auf dem Freeze-Commit) und für 2.2.

| Kriterium | Schwelle | **3.1.0** | 3.0.0 | 2.2 | 3.1 |
|---|---|---|---|---|---|
| G1 Haupttreffer | ≥ 45 % | **51,3 %** | 26,9 % | 0,4 % | ✅ |
| G2 Haupt+Alt | ≥ 60 % | **62,5 %** | 44,0 % | 1,5 % | ✅ |
| G3 schwächste Klasse | ≥ 25 % | **36,7 %** (Impuls) | 6,7 % | 0 % | ✅ |
| G4 Grad EXACT/NESTED | ≥ 50 % | **51,9 %** | 26,9 % | 0,4 % | ✅ |
| G5 grober Grad-Fehler | ≤ 25 % | **29,0 %** | 52,5 % | 77,3 % | ❌ |
| G6 False Accept | ≤ 5 % | 0,8 % (1/120) | 0,8 % | 0 % | ✅ |
| G7 falsche Sicherheit | ≤ 25 % | **15,4 %** (n = 91) | 20,3 % | 100 % | ✅ |
| G8 Regelverstöße (unabh. Prüfer) | 0 | **0** | 165 | 1 | ✅ |
| G9 Invarianz ×2 / +100 | ≥ 98 % | 100 / 100 % | – | – | ✅ |
| G10 instabile Neuzuordnungen | ≤ 2.2 | siehe §7 | 0,64 % | 1,00 % | §7 |
| G11 Laufzeit Median | ≤ 50 ms | 43,9 ms (p90 63) | – | – | ✅ |
| hoch: G1 | ≥ 20 % | **10 %** | 5 % | 0 % | ❌ |
| hoch: G7 | ≤ 30 % | 66,7 % (**n = 3**) | 66,7 % (n = 3) | 100 % (n = 65) | ❌ |
| hoch: Enthaltung | – | 83,8 % | 85 % | 21,9 % | |

Lesart:
* Die Red-Team-Fixes sind wirksam. Auf dem neuen Layout fällt 3.0.0 auf 26,9 % mit 165 Regelverstößen; 3.1 hält 51,3 % mit 0 Verstößen. Ein Teil des HOLDOUT-1-Ergebnisses von 3.0.0 beruhte also auf den Generator-Annahmen (H2). 3.1 ist dagegen robust.
* **G5 verfehlt.** Wo 3.1 falsch liegt, liegt sie häufiger grob falsch (OTHER) als um eine Ebene daneben. Das betrifft vor allem den Auswertungszeitpunkt mitten in der unterteilten Bestätigung: Die Engine liest dann die Bestätigungsbewegung selbst als Struktur gleichen Grades.
* **Hohes Rauschen verfehlt.** 10 % Haupttreffer bei 84 % Enthaltung. G7 beruht auf nur 3 Fällen mit Anwendbarkeit HOCH (2 falsch) und ist statistisch nicht belastbar. Die Engine enthält sich hier richtigerweise fast immer. Sie erreicht aber keine brauchbare Erkennung.
* G6: ein False Accept (Negativklasse) bei 3.1 und 3.0.0, also 0,8 %, innerhalb der Schwelle.

**Gate-Status: NICHT BESTANDEN** (G5, hohes Rauschen). Gemäß Prereg §7 keine Nachjustierung auf HOLDOUT-2, kein Prognose-Backtest.

## 5. Grad (P0)

| | 2.2 HOLDOUT-1 | 3.0.0 HOLDOUT-1 | 3.1.0 HOLDOUT-2 |
|---|---|---|---|
| EXACT + NESTED (n/l/m) | 11,0 % | 56,9 % | 51,9 % |
| ±1 Ebene (EXACT/NESTED/LOWER/HIGHER/PARTIAL) | 72,3 % | 81,9 % | 71,0 % |
| LOWER (eine Ebene zu tief) | 268 / 640 | 53 / 640 | 79 / 640 |
| OTHER + NONE | 260 / 640 | 158 / 640 | 199 / 640 |

Grad-Verwechslung (alle Rauschstufen, positive Fälle, Hauptzählung) in `corpus-*.json` → `summary.degree`. Der Hauptfehler von 2.2, Unterwellen statt der Struktur zu zählen (LOWER), ist weitgehend behoben. Der verbleibende Fehler ist vor allem OTHER, also eine andere Struktur, kein Ebenenfehler.

## 6. Mehrdeutigkeit (Zerlegung)

Auf echten Wochencharts (HOLDOUT-Emittenten) war die Statusmeldung `AMBIGUOUS` bei 2.2 und 3.0.0 gleich häufig (46,3 % bzw. 45,9 %). Sie ist jetzt zerlegt:
* **DEGREE** (dieselbe Bewegung, andere Ebene): keine echte Unsicherheit über die Struktur. Seit 3.1 nur, wenn die Alternative die Hauptzählung als einzelne Welle enthält **und** dieselbe laufende Richtung impliziert.
* **STRUCTURE** (andere Struktur, andere Richtung oder Invalidierung): echte Mehrdeutigkeit, senkt die Anwendbarkeit.
* **LABEL** (gleiche Pivots, anderer Name).

Echte Charts mit 3.0.0 (H4 noch offen): DEGREE 8.423 Wochen, STRUCTURE 8.617 Wochen. Werte für 3.1 siehe §7. Der Ambiguity Gap (Scoreabstand Haupt/Alternative) geht als Klarheit in die Anwendbarkeit ein, und zwar nur bei STRUCTURE.

**Enthaltung.** Auf echten Wochencharts (HOLDOUT-Emittenten) stuft 3.0.0 nur 4,6 % der Wochen als HOCH ein, 12,7 % als MITTEL und 82,7 % als NIEDRIG (Enthaltung). 2.2 stufte 63 % als HOCH ein, obwohl sie bei hohem Korpus-Rauschen fast nie richtig lag. Das ist die beabsichtigte Folge von H3: Echte Wochencharts haben ein Signal-Rausch-Verhältnis wie medium/high im Korpus. Die Produkt-Formulierung dafür lautet „Die aktuelle Kursstruktur lässt keine verlässliche Elliott-Zählung zu."

## 7. Stabilität, Hysterese, Latenz

Neuzuordnungen je Woche auf echten Wochencharts, HOLDOUT-Emittenten, 17.040 Wochen (`stability/`):

| | 2.2 | 3.0.0 | 3.1.0 |
|---|---|---|---|
| gleich | 84,7 % | 84,1 % | STAB31_SAME |
| Fortschritt (Welle schreitet fort) | 3,9 % | 9,5 % | STAB31_PROGRESS |
| berechtigt (vorige Lesart ungültig/abgeschlossen) | 6,1 % | 4,1 % | STAB31_JUSTIFIED |
| Grad | 4,3 % | 1,7 % | STAB31_DEGREE |
| **instabil** | **1,00 %** | **0,64 %** | **STAB31_UNSTABLE** |
| Neuzuordnungen gesamt | 11,4 % | 6,4 % | STAB31_RELABEL |
| Lebensdauer Median (HOCH) | 6 Wochen | 7 Wochen | STAB31_LIFE |

Hysterese: Stickiness 0,08 bzw. 0,15 hielt veraltete Zählungen fest. Die bestätigten Erkennungen fielen auf DEVELOPMENT von 308 auf 211 bzw. 76. Eine informationsabhängige Hysterese ergab 230 bestätigte und 1,05 % instabile. Gewählt wurde 0,05 (293 bestätigt, 0,66 % instabil vs. 2.2 0,92 %).

Latenz/Präzision (Korpus HOLDOUT-1, Stickiness 0,05): frühest mögliche entwickelnde Zählung im Median 3 Bars nach dem Musterende, bestätigt 4 Bars; 264/480 Fälle innerhalb von 20 Bars bestätigt; vorzeitige Abschlüsse 5,3 %. Die Kurve über mehrere Stickiness-Werte steht in `latency-frontier-*.json` und wurde nur auf DEVELOPMENT ausgewählt.

## 8. Mehrere Zeitebenen

Wochen- vs. Tagesanalyse derselben Emittenten (HOLDOUT, 90 Reihen, 3.0.0): Richtungsübereinstimmung 74 %, Tageszählung in der laufenden Wochenwelle enthalten 57 %. Enthaltung: Woche 83 %, Tag 100 %. Auf Tagesdaten erreicht die Engine bei echten Kursen nie HOCH oder MITTEL. Tageszählungen tragen deshalb keine eigene Aussage; das Produkt bleibt beim Wochenchart. Ein Universum-weiter Tageslauf ist erst nach Verbesserung bei hohem Rauschen sinnvoll.

## 9. Experten- und Praktiker-Abgleich (teilweise blockiert)

* **Keine menschliche Expertenbewertung.** Es gibt keine Annotationen durch einen Elliott-Praktiker. Die Engine heißt deshalb nirgends „expert validated", und die Formulierung „professional-grade" wurde entfernt.
* **Praktiker-Referenzen** (`practitioner/practitioner-refs.json`, 74 Einträge, 39 auswertbar): Quelle sind öffentliche Zählungen aus Suchzusammenfassungen. Der Abruf der Originalseiten war in dieser Umgebung blockiert. Jeder Eintrag ist „PRACTITIONER REFERENCE — unverified", nie Wahrheit. Ergebnis: Keine Engine schlägt einfache Basismodelle (immer „aufwärts" 74 %). Rollenübereinstimmung 3.0.0 6/16, 2.2 18/23. Die Stichprobe ist klein, die Referenzen sind unsicher, und 2.2 gibt häufiger überhaupt eine Rolle aus. Das ist kein Beleg für die Qualität der einen oder anderen Engine.
* **Werkbank** (`quant/research/elliott-workbench/`, Schema `annotation-schema.json`): blinde Rekonstruktion ohne Engine-Ausgabe, danach Vergleich. Quellenfeld Synthetic / Manual VU Review / External Practitioner; mehrere Annotatoren je Fall; Übereinstimmungsmaße (Pivot-F1, Rollen-, Grad- und Musterübereinstimmung, Krippendorff-α über Annotatoren). Daten: `node scripts/technical/elliott-workbench-data.mjs`. **Das ist der notwendige nächste Schritt.**

## 10. Tests und Invarianten

`quant/tests/ti-elliott-v3.test.mjs` (11 Tests): Kausalität (keine Zukunftsdaten), Invarianz ×2 und +100, Regelintegrität aller Ausgaben, Fuzz, Negativklassen, Datenlücke, Split, Ausgabevertrag, Red-Team-H1-Regression, unabhängiger G8-Prüfer (Layout A und B). Die Regelmatrix wurde neu erzeugt (`ELLIOTT_RULE_MATRIX.md`, Dreifach-Zigzag-Regeln).

## 11. Vorher/Nachher (Remediation §107)

Synthetische Werte stammen aus **getrennten** Fällen. Gezählt sind abgeschlossene Muster ohne hohes Rauschen (n = 480), sofern nicht anders angegeben. Für Muster und Grad bedeutet ein Prozentwert den Anteil richtiger Fälle.

| Kennzahl | 2.2 HOLDOUT-1 | 3.0.0 HOLDOUT-1 | 2.2 HOLDOUT-2 | **3.1.0 HOLDOUT-2** |
|---|---|---|---|---|
| Grad exakt (EXACT+NESTED) | 11,0 % | 56,9 % | 0,4 % | **51,9 %** |
| Grad ±1 Ebene | 72,3 % | 81,9 % | 22,7 % | **71,0 %** |
| Synthetisch Haupttreffer | 10,8 % | 55,8 % | 0,4 % | **51,3 %** |
| Synthetisch Haupt+Alt | 13,1 % | 68,8 % | 1,5 % | **62,5 %** |
| Flats (regulär/expandiert/laufend, H+A) | 44,4 % | 77,8 % | 1,1 % | **68,9 %** |
| Truncation (H+A) | 3,3 % | 63,3 % | 0 % | **43,3 %** |
| Expandierendes Dreieck (H+A) | 6,7 % | 90,0 % | 6,7 % | **90,0 %** |
| Hohes Rauschen Haupttreffer (n = 160) | 3,1 % | 5,6 % | 0 % | **10,0 %** |
| Falsche Sicherheit (HOCH, aber falsch) | 91,5 % | 14,8 % | 100 % | **15,4 %** |
| Regelverstöße in Ausgaben | – | > 0 (H1) | 1 | **0** |
| Enthaltung (n/l/m) | 27,7 % | 33,1 % | 32,3 % | 54,6 % |
| Enthaltung (hohes Rauschen) | 13,8 % | 85,6 % | 21,9 % | 83,8 % |
| Echte Charts: mehrdeutige Wochen (Status) | 46,3 % | 45,9 % | | STAB31_AMB |
| Echte Charts: davon echte Strukturmehrdeutigkeit | nicht zerlegt | 50,6 % der Wochen | | STAB31_STRUCT |
| Echte Charts: Anwendbarkeit HOCH | 63,1 % | 4,6 % | | STAB31_HIGH |
| Neuzuordnungen je Woche (gesamt / instabil) | 11,4 % / 1,00 % | 6,4 % / 0,64 % | | STAB31_RELABEL / STAB31_UNSTABLE |
| Latenz Median (früh / bestätigt) | – | 3 / 4 Bars | | (wie 3.0.0, Hysterese unverändert) |
| Laufzeit Median | ~1 ms | 41 ms | | 43,9 ms |

Die Spalten zu 2.2 auf HOLDOUT-1 und HOLDOUT-2 zeigen, wie viel schwerer Layout B ist: 2.2 fällt dort fast auf null. Die Werte von 3.1 auf HOLDOUT-2 sind deshalb die vorsichtigere Schätzung.

## 12. Ehrliche Grenzen

1. **Generator-Kopplung.** Korpus, Layout B und Engine stammen vom selben Autor. Layout B entschärft H2, ist aber kein unabhängiger Datensatz. Die echte Prüfung ist die Werkbank mit externen Annotatoren.
2. **Hohes Rauschen = echte Wochencharts.** Auf dem Rauschniveau echter Charts erkennt die Engine Strukturen nur in etwa jedem zehnten Fall. Richtig ist, dass sie sich dort fast immer enthält. Das bedeutet: Auf den meisten echten Charts gibt es **keine** verlässliche Zählung. Diese Grenze ist methodisch und eher eine Grenze der Methode als des Codes: Bei z ≈ 1,5 sind Unterwellen von Rauschen nicht trennbar. Getestet wurden eine Anwendbarkeits-z-Schwelle (DEVELOPMENT, ohne Gewinn) und Tagesdaten (Enthaltung 100 %).
3. **G5 verfehlt** (29 % grobe Fehler auf HOLDOUT-2).
4. **Kein Prognosewert geprüft.** Prereg §7 verbietet einen neuen Backtest vor bestandenem Gate. Die frühere Studie (Engine 2.2) fand keinen Prognosebeitrag; für 3.x ist das offen.
5. **Praktiker-Abgleich blockiert** (Seitenabruf gesperrt; Referenzen ungeprüft).
6. **Produkt läuft auf 2.2.** Engine 3.1 ist über die Methodik-Option verfügbar und im Pro-Panel vorbereitet (Grad, Mehrdeutigkeitsart, „Warum diese Zählung?", Zählungs-Historie). Ein vollständiger Produkt-Neubau mit Replay dauert mehrere Stunden Rechenzeit und ist der nächste Schritt (ROADMAP).

## 13. Einstufung und nächste Schritte

* **Zustand A teilweise erreicht:** Die Qualität ist messbar und auf getrennten Fällen verbessert. Grad, Flats, Truncation, expandierendes Dreieck, falsche Sicherheit, Regeltreue und Stabilität sind deutlich besser als bei 2.2.
* **Gate nicht bestanden**, also kein Abschluss: G5 und hohes Rauschen fehlen. Elliott bleibt **„Experimentelles Strukturmodell"** ohne Richtungsstimme (Konfluenzgewicht 0).
* Nächste Schritte:
  1. Externe Annotationen über die Werkbank (blind, ≥ 2 Annotatoren).
  2. G5-Ursache „Bestätigung als Struktur gelesen" auf DEVELOPMENT angehen.
  3. Neuer, vorab registrierter Prüfsatz (HOLDOUT-3, eigene Seeds und neues Layout), bevor erneut ein Gate gemessen wird.
  4. Erst nach bestandenem Gate eine Prognoseprüfung mit Vergleichsleiter A–E auf neuem Holdout.
