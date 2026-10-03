# HOLDOUT-3 — Vorab-Registrierung (Elliott Engine 3.2)

Stand: 03.10.2026. Geschrieben und committet **vor** dem Einfrieren von Engine 3.2.0 und **vor** jeder Auswertung der HOLDOUT-3-Fälle. Grundlage: Mission III §26–§31; Vorgänger: [ELLIOTT_ENGINE_QUALITY_PREREG.md](ELLIOTT_ENGINE_QUALITY_PREREG.md) (HOLDOUT-1, HOLDOUT-2). Gegenstand ist die **fachliche Qualität** (Methodentreue), nicht der Prognosewert. Ein Prognose-Backtest findet nur nach bestandenem Gate statt, mit eigener, neuer Vorab-Registrierung.

## 1. Was neu ist (und warum)

1. **HOLDOUT-2 ist verbraucht.** Die Fehler-Taxonomie (Mission III §3, `taxonomy/`) hat HOLDOUT-2-Fälle analysiert; sie gelten seither als Entwicklungsdaten. Gleiches gilt für Layout A/B insgesamt (Generator-Kopplung).
2. **Neue Generatoren** (Mission III §23–§25):
   * **C1** (`quant/tests/elliott-corpus-c.mjs`): zufällige Kontextschwünge mit Drift-Regimen, optional eine konkurrierende kleinere Struktur, unterteilte Bewegung in den Ursprung, Muster an zufälliger Position, unterteilte Bestätigung; Rauschen als mean-revertierender Log-Prozess mit GARCH(1,1), Student-t(4), AR(1), Schock-Bars und Sprüngen.
   * **C2** (`quant/tests/elliott-corpus-c2.mjs`): von einem **unabhängigen Autor** ohne Einsicht in Engine, Korpus und Auswertung geschrieben (Architektur „stochastischer Prozess + eingebettetes Muster“). Nach dem Generator-Audit (Schnitt nach Zeit statt am Extrem, Flat-B ≥ 90 %) und dem Red-Team (keine Rausch-Neuziehung bis zum sichtbaren Ursprungsextrem) vom selben Autor korrigiert.
   * **C3**: C1-Skelett mit **echten** trendbereinigten Wochenrenditen realer Titel als Rauschquelle (HOLDOUT-3: Titel der HOLDOUT-Emittentengruppe; nur Rauschquelle, die Labels sind synthetisch).
   * Fünf Auswertungsstufen je Fall: P60, P75, P90 (laufendes Muster) und C_EARLY, C_LATE (abgeschlossen, Schnitt zu zufälliger Zeit in der Bestätigung).
3. **Beobachtbare Wahrheit.** Grundlage: Die Fehler-Taxonomie zeigte, dass 65 % der groben Gradfehler auf HOLDOUT-2 keine Engine-Fehler waren, sondern Generator-Wahrheiten, deren Ursprung im Kursbild nicht das Extrem war. Rauschen verschiebt außerdem die sichtbaren Extreme. Die **beobachtbare Wahrheit** setzt jeden Musterpivot auf das sichtbare Extrem im Fenster ±35 % der angrenzenden Wellendauer (`observedPivots`). Der Fall gilt nur, wenn das Zielmuster dort regelkonform ist. Geprüft werden harte Regeln, Definitionen inklusive sichtbarer Unterteilung und Extreme innerhalb der Wellen (`observableTruth`).
   * **Selektionseinwand (Red-Team 3.2 H2), offen benannt:** Die beobachtbare Messung schließt Fälle aus, in denen das Muster im Kursbild nicht mehr regelkonform ist. Darunter sind schwere Fälle. Deshalb wird **jede** Kennzahl zusätzlich gegen die strikte Generator-Wahrheit auf **allen** Fällen berichtet, ebenso der Anteil gültiger Fälle. Das Gate gilt auf der beobachtbaren Wahrheit: Ein Label, das im Kursbild eine harte Regel verletzt, kann keine richtige Antwort definieren.

## 2. Eingefrorene Bestandteile

| Bestandteil | Stand |
|---|---|
| Engine | `elliott-3.2.0`, Regeln `elliott-rules-3.1.0`; Parameter-Hash und Commit in `quant/data/technical-intelligence/elliott-validation/freeze-elliott-3.2.0.json` (wird vor dem Lauf geschrieben) |
| Generatoren | `elliott-corpus.mjs` (Formen, `observedPivots`), `elliott-corpus-c.mjs` (C1/C3), `elliott-corpus-c2.mjs` (C2) — Stand dieses Commits |
| Auswertung | `scripts/technical/elliott-corpus-eval.mjs` (`judge`, `judgeMid`, `degreeClass`, `intraViolations`, `observableTruth`, `caseC`), `scripts/technical/elliott-holdout3.mjs` (`gates3`) — Stand dieses Commits |
| Echte Charts | `scripts/technical/elliott-stability.mjs` (`--end`), `scripts/technical/elliott-multires.mjs` (`--offset`) |

## 3. Fälle

* **Synthetisch:** Layouts C1, C2, C3; Seeds **60–79** (vorher nie erzeugt); alle 16 Musterklassen und 3 Negativklassen; Rauschen none / low / medium / high; Stufen P60, P75, P90, C_EARLY, C_LATE (Negativklassen nur C-Stufen). P-Stufen mit weniger als zwei bestätigten Wellen entfallen; eine Welle gilt als bestätigt, wenn die Folgewelle ≥ 2 Bars bzw. 25 % ihrer Dauer gelaufen ist.
* **Echte Charts, Stabilität (G11, G12):** HOLDOUT-Emittenten (`ew3Split`), 100 Reihen (Hash-Auswahl wie bisher), **neues Zeitfenster**: sechs Jahre bis 30.12.2016. Bisher wurden nur die letzten sechs Jahre bis 2026 ausgewertet. Engine 3.2 und Engine 2.2 laufen auf denselben Reihen.
* **Echte Charts, Zeitebenen (G13):** HOLDOUT-Emittenten mit Tagesdaten, Hash-Rang 121–240 (bisher wurden nur Rang 1–120 ausgewertet).
* **Ausschlüsse:** keine außer den oben genannten. Fälle, deren Muster im Kursbild nicht regelkonform ist, zählen nicht für die beobachtbaren Kennzahlen; ihre Zahl wird berichtet.

## 4. Kennzahlen und Gates (vor dem Test festgelegt)

Gepoolt über C1, C2 und C3; „abgeschlossen“ = Stufen C_EARLY und C_LATE; Rauschen none/low/medium, sofern nicht anders angegeben. Grad-Klassen, Treffer und Toleranz wie im Vorgänger (±20 % der medianen Wellendauer, mindestens 2 Bars). Verschachtelte Treffer müssen seit dem Red-Team auch die inneren Wellenenden treffen.

| # | Kriterium | Definition | Schwelle |
|---|---|---|---|
| G1 | Harte Regeln | Verstöße in allen ausgegebenen Zählungen (Haupt- und Alternativzählungen), unabhängiger Prüfer inklusive Extreme innerhalb der Wellen und Motivwellen korrektiver Muster, alle Fälle und Stufen | **0** |
| G2 | Muster Hauptzählung | beobachtbar, abgeschlossen, n/l/m | ≥ 45 % |
| G3 | Haupt- oder Alternativzählung | dto. | ≥ 60 % |
| G4 | Grad exakt | EXACT oder NESTED, dto. | ≥ 50 % |
| G5 | Grober Gradfehler | OTHER oder NONE, dto. | ≤ 25 % |
| G6 | Flats | regulär, expandiert, laufend; Haupt oder Alternative, dto. | ≥ 25 % |
| G7 | Truncation | dto. | ≥ 25 % |
| G8 | Dreiecke | kontrahierend und expandierend, dto. | ≥ 25 % |
| G9 | Hohes Rauschen | Hauptzählung richtig, beobachtbar gültige Fälle mit hohem Rauschen | ≥ 20 % |
| G10 | Falsche Sicherheit | Anteil falscher Hauptzählungen unter Anwendbarkeit HOCH (abgeschlossen, alle Rauschstufen); bei < 20 HOCH-Fällen unter HOCH+MITTEL | ≤ 20 % (bzw. ≤ 35 %) |
| G11 | Stabilität | instabile Neuzuordnungen je Woche, echte Charts, gegenüber 2.2 auf denselben Reihen | ≤ 2.2 |
| G12 | Neuzuordnungen | alle Neuzuordnungen je Woche, dto. | ≤ 2.2 |
| G13 | Zeitebenen | Richtungsübereinstimmung Woche/Tag | ≥ 70 % |
| G14 | Enthaltungsqualität | AUC des Anwendbarkeitswerts für „Hauptzählung richtig“ (abgeschlossen, alle Rauschstufen) **und** Präzision unter HOCH+MITTEL | AUC ≥ 0,75 und ≥ 65 % |
| G15 | Negativfälle | falsch akzeptiert, nur C2 (Generator-Audit H2: A/B/C1/C3-Negative verletzen oft zwei Regeln); alle Layouts werden berichtet | ≤ 5 % |
| D2 | Laufende Zählungen | falsche Sicherheit unter HOCH; bei < 20 HOCH-Fällen unter HOCH+MITTEL | ≤ 30 % (bzw. ≤ 50 %) |

Berichtet ohne Schwelle:
* D1 (Erkennung laufender Muster)
* alle strikten Kennzahlen
* Werte je Layout
* Anteil beobachtbar gültiger Fälle
* Invarianz und Laufzeit
* Anwendbarkeitsverteilung auf echten Charts
* Mehrdeutigkeitszerlegung

**Gesamturteil:** ENGINE QUALITY PASS nur, wenn G1–G15 und D2 bestanden sind. Ein einzelnes verfehltes Gate bedeutet FAIL. Es wird nicht relativiert und nicht nachträglich gelockert (Mission III §29, §88).

**Rundung und Gleichstände:** Prozentwerte auf eine Nachkommastelle; Vergleiche mit Schwellen auf dem gerundeten Wert. Bei G11/G12 entscheidet der Wert auf vier Nachkommastellen; Gleichstand gilt als bestanden. Die Engine ist deterministisch; Gleichstände im Rang löst die Engine selbst auf (Spanne, dann Mustername).

## 5. Ablauf (einmalig)

1. Engine 3.2.0 einfrieren: Freeze-Record mit Parameter-Hash und Commit.
2. `node scripts/technical/elliott-holdout3.mjs --phase synthetic --tag v32`
3. `node scripts/technical/elliott-holdout3.mjs --phase real --tag v32`
4. `node scripts/technical/elliott-holdout3.mjs --phase gates --tag v32` → `holdout3/holdout3-result-v32.json`
5. Bericht unverändert in `ELLIOTT_ENGINE32_REPORT.md`. Keine Änderung an Engine, Generatoren oder Auswertung nach Schritt 2. Bei FAIL: Ergebnis akzeptieren; eine neue Engine braucht einen neuen Holdout (Mission III §30, §113).

## 6. Erwartung (vor dem Test notiert, damit spätere Deutung nicht nachträglich passt)

Auf VALIDATION (Seeds 10–19) lag Engine 3.2 auf C1/C3 bei rund 28–29 % (beobachtbar G1) und auf C2 bei rund 59 %. Gepoolt ist ein **Verfehlen von G2–G5 und G9 wahrscheinlich**. Das Gate wird trotzdem nicht abgesenkt: Es misst, ob die Engine auf realitätsnäheren Daten professionelle Qualität erreicht.

## 7. Grenzen

* Alle Generatoren bilden Elliott-Grammatik ab. Echte Märkte folgen ihr nicht nachweislich.
* C2 ist im Code unabhängig, im Entwurf aber von derselben Aufgabenbeschreibung geleitet (Generator-Audit M4).
* Die C3-Rauschquelle nutzt Titel, deren Charts früher für Stabilitätskennzahlen ausgewertet wurden; Labels fließen nicht ein.
* Eine Bewertung durch echte Experten gibt es weiterhin nicht.
