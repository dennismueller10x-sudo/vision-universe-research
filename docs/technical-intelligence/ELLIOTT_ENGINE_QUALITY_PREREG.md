# Elliott Engine Quality — Vorab-Registrierung (Remediation, Engine 3.0)

Stand: 03.10.2026, **vor** jeder Arbeit an Engine 3.0 und vor jedem Blick auf VALIDATION- oder HOLDOUT-Fälle. Gegenstand ist die **fachliche Qualität** der Elliott-Engine (Methodentreue), nicht ihr Prognosewert. Ein neuer Prognose-Backtest findet erst statt, wenn dieses Gate bestanden ist (§7).

## 1. Warum ein neues Messinstrument

Die bisherige Grad-Kennzahl (37/80) verglich die gewählte Analyseskala mit der Skala, auf der das generische Rücklauf-Ereignis erkannt wurde. Diese Ereignisskala ist **kein Grad-Goldstandard** (sie ist fast immer die feinste Skala, siehe `degree-taxonomy-2.2.json`). Für Grad und Mustererkennung braucht es Fälle mit **bekannter** Struktur. Deshalb:

* **Synthetischer Korpus v2** (`quant/tests/elliott-corpus.mjs`): verschachtelte Muster (Grad 0 = Ziel, Grad −1 = regelkonforme Unterwellen), Proportionen zufällig **innerhalb** der legalen Bereiche, Kontextmuster davor, entscheidende Bestätigung danach, Wochen-Schlusskurse wie im Produkt, Rauschen none/low/medium/high (0 / 0,8 / 2 / 4 % je Woche), 16 Musterklassen + 3 Negativklassen.
* **Echte Charts** messen, was ohne Wahrheit messbar ist: Stabilität (berechtigte vs. instabile Neuzuordnung), Mehrdeutigkeit (echte vs. Engine- vs. Grad-Mehrdeutigkeit), Enthaltung, Invarianz. Grad-„Wahrheit" auf echten Charts gibt es nur über Praktiker-Referenzen (§6).

## 2. Splits (fest)

| Daten | DEVELOPMENT | VALIDATION | HOLDOUT |
|---|---|---|---|
| Synthetischer Korpus | Seeds 0–9 | Seeds 10–19 | Seeds 20–29 |
| Echte Charts (nur explorative Emittenten; die Bestätigungsstichprobe bleibt gesperrt) | `fnv1a(issuerRoot + "|ew3") mod 10` ∈ {0,1,2,3} | ∈ {4,5,6} | ∈ {7,8,9} |

DEVELOPMENT: Fehleranalyse und Entwicklung. VALIDATION: Architekturentscheidungen (höchstens drei Vergleiche, jeder dokumentiert). HOLDOUT: einmal, nach dem Einfrieren (Engine-Version und Parameter-Hash im Bericht).

## 3. Kennzahlen

**Muster.** Treffer = Hauptzählung ist das Zielmuster, abgeschlossen, mit denselben Wellenenden (± 20 % der medianen Wellendauer, mind. 2 Wochen) **oder** die Hauptzählung zählt eine Ebene höher und benennt die Unterteilung der passenden abgeschlossenen Welle als Zielmuster (verschachtelter Treffer). „Primär+Alternative" zusätzlich über die Alternativen.

**Grad.** EXACT / NESTED (richtig), PARTIAL (Teilmenge der Zielpivots), LOWER (zählt Unterwellen), HIGHER (Zielmuster nur Teil einer größeren Zählung, ohne Unterteilung benannt), OTHER, NONE. Grober Fehler = OTHER + NONE.

**Negativ.** False Accept = die Engine liest einen regelverletzenden Fall als das Zielmuster mit passenden Pivots.

**Falsche Sicherheit.** Anteil falscher Hauptzählungen unter den Fällen mit Anwendbarkeit HOCH.

**Stabilität (echte Charts).** Neuzuordnungen je Woche, klassifiziert: BERECHTIGT (vorige Lesart durch neuen Kurs ungültig oder abgeschlossen), INSTABIL (vorige Lesart weiter regelkonform, Kursänderung < 1 ATR), GRAD (gleiche Struktur, andere Ebene).

## 4. Ausgangswerte Engine 2.2 (DEVELOPMENT, gemessen vor der Registrierung)

Korpus DEVELOPMENT (600 positive Fälle, 120 negative): Hauptzählung richtig **55 (9,2 %)**, mit Alternativen **65 (10,8 %)**; Grad EXACT/NESTED 60, LOWER 252, OTHER 222; False Accept 0/120. Je Rauschen: none 22/190, low 21/190, medium 11/190, high 1/190.

## 5. Quality Gate (HOLDOUT, Rauschen none/low/medium; high getrennt)

Begründung der Schwellen: Für algorithmische Elliott-Zählung gibt es keinen veröffentlichten Benchmark. Die Ziele verlangen (a) eine **deutliche** Verbesserung gegenüber 2.2, (b) dass keine unterstützte Musterklasse bei null liegt, (c) dass Wochen-Schlusskurse (Unterwellen oft nur 1–2 Bars) keine Perfektion erlauben. Ein Grad-Fehler um eine Ebene wiegt weniger als ein grober Fehler; deshalb getrennte Schwellen.

| # | Kriterium | Schwelle |
|---|---|---|
| G1 | Mustertreffer Hauptzählung (inkl. verschachtelt) | ≥ 45 % |
| G2 | Mustertreffer Haupt- oder Alternativzählung | ≥ 60 % |
| G3 | Jede unterstützte Klasse (Haupt+Alt) — insbesondere alle drei Flats, Truncation, expandierendes Dreieck | ≥ 25 % |
| G4 | Grad EXACT oder NESTED | ≥ 50 % |
| G5 | Grober Grad-Fehler (OTHER + NONE) | ≤ 25 % |
| G6 | False Accept (Negativklassen, alle Rauschstufen) | ≤ 5 % |
| G7 | Falsche Sicherheit (alle Rauschstufen) | ≤ 25 % |
| G8 | Harte Regeln: keine ausgegebene Zählung verletzt eine HARD-Regel oder Definition (Fuzz-Test) | 0 Verstöße |
| G9 | Invarianz: identische Zählung bei Preis × 2 und Preis + 100 (Korpus none/low) | ≥ 98 % |
| G10 | Echte Charts (HOLDOUT-Emittenten): instabile Neuzuordnungen je Woche | ≤ Engine 2.2 auf denselben Reihen |
| G11 | Laufzeit je Analyse (Median, Wochenreihe) | ≤ 50 ms |

Berichtet ohne Schwelle: Rauschen high (Treffer, Enthaltung), Mehrdeutigkeitszerlegung, Erkennungsverzug (frühest möglich / Engine entwickelnd / bestätigt), Musterverwechslungsmatrix, Grad-Verwechslungsmatrix, Praktiker-Übereinstimmung (sofern Referenzen vorliegen).

## 6. Praktiker-Referenzen

Öffentlich dokumentierte Zählungen (Frost & Prechter, EWI, weitere) werden als **PRACTITIONER REFERENCE** geführt, nie als objektive Wahrheit; Fälle mit widersprüchlichen Referenzen als REFERENCE AMBIGUOUS. Keine erfundenen Expertenlabels; Quelle je Fall (Synthetic / Manual VU Review / External Practitioner). Ist das Material nicht ausreichend zugänglich, wird der Benchmark als teilweise blockiert dokumentiert; das Gate oben gilt unabhängig davon.

## 7. Danach

Erst nach bestandenem Gate: neue Vorab-Registrierung einer Prognoseprüfung mit neuem Holdout (TEST ab 2019 gilt als verbraucht), Vergleichsleiter A–E (Zufallszeitpunkt, Zufalls-Swing, strukturelle Kontrolle, technisches Basismodell, Basis + Elliott), Ergebnisgrößen über Zieltreffer hinaus (Richtung, MFE, MAE, bedingte Rendite, Drawdown, Zeit bis Ziel, Fehlschlag). Bis dahin trägt Elliott im Produkt den Status **„Experimentelles Strukturmodell"**.

Wird das Gate verfehlt: keine Nachjustierung auf HOLDOUT. Der Bericht nennt das Ergebnis, die getesteten Lösungswege und die nachgewiesene Grenze (Remediation §3 B).

## 8. Änderung 1 — nach HOLDOUT-1 und unabhängigem Red-Team-Review (vor jeder Arbeit an 3.1)

Engine 3.0.0 wurde eingefroren (`freeze-elliott-3.0.0.json`) und auf HOLDOUT-1 (Korpus-Seeds 20–29, Emittenten-Split HOLDOUT) einmal geprüft; das Ergebnis wird unverändert berichtet. Ein unabhängiges Red-Team-Review fand unter anderem:

* **H1** Harte Regeln wurden nur an Wellenenden geprüft. Über „orthodoxe kurze Enden" konnte das Preisextrem innerhalb einer Welle eine harte Regel verletzen (z. B. Welle 2 unter dem Ursprung von Welle 1). → G8 ist für 3.0.0 **nicht erfüllt**.
* **H2** Generator und Engine teilen Annahmen (Kontextmuster endet am Ursprung, unstrukturierte Bestätigung, Auswertung am Bestätigungsextrem); ohne die darauf ansprechenden Gewichte bricht die Trefferquote ein.
* **H3** Das Gate lässt das hohe Rauschen aus, das echten Wochencharts am nächsten kommt.
* **H4** „Grad-Mehrdeutigkeit" war zu weit definiert (auch gegenläufige Alternativen) und erhöhte die Anwendbarkeit.
* **L10** Parameter `alternativeMinInvalidationGapAtr` stand versehentlich in einem Kommentar.

**Erlaubte Änderungen für Engine 3.1** (nur aus diesen Befunden, keine Gewichtssuche auf HOLDOUT-1):
1. Harte Regeln und Definitionen zusätzlich gegen die Preisextreme innerhalb jeder Welle prüfen (W2-Ursprung, W4-Überlappung, B-/X-Ursprung, Dreiecksgrenzen); kurze Enden nur an Korrekturpositionen.
2. DEGREE nur, wenn die Alternative die Hauptzählung als einzelne Welle enthält UND dieselbe laufende Richtung impliziert; sonst STRUCTURE.
3. L10 beheben; Dreifach-Zigzag: W, Y, Z müssen sich als Zigzag (bzw. Doppel-Zigzag) unterteilen, nicht als beliebige Korrektur.
4. Neueichung von Gewichten und Anwendbarkeit ausschließlich auf DEVELOPMENT (Layout A **und** Layout B, Seeds 0–9), weil 2. die Merkmale verschiebt.

**Neuer, unabhängiger Prüfsatz HOLDOUT-2** (wird erst nach dem Einfrieren von 3.1 einmal ausgewertet):
* **Korpus-Layout B**: Kontext ist ein Zufallspfad (kein Muster gleichen Grades); die Bestätigungsbewegung ist selbst unterteilt (3 oder 5 Unterwellen); Auswertung zu einem zufälligen Zeitpunkt zwischen 40 % und 100 % der Bestätigungsbewegung; Seeds **40–49**; alle vier Rauschstufen.
* **Gate für HOLDOUT-2**: G1–G7 wie §5, berechnet auf none/low/medium **und zusätzlich getrennt auf high** (high: G1 ≥ 20 %, G7 ≤ 30 % — Erwartung: überwiegend Enthaltung); G8 durch einen unabhängigen Prüfer (Regeln gegen Preisextreme in jeder Welle, alle ausgegebenen Zählungen); G9–G11 wie §5 auf HOLDOUT-Emittenten.
* Grenze der Unabhängigkeit: Layout B stammt vom selben Autor wie die Engine. Echte Expertenannotationen (Werkbank) bleiben der notwendige nächste Schritt.
