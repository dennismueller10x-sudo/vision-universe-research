# Elliott V2 — Spezifikation

**Module:** `quant/engines/technical/elliott/patterns.js` (Regelwerk `elliott-rules-2.0.1`), `quant/engines/technical/elliott/elliott-v2.js` (`elliott-2.0.0`)
**Primärquelle:** Frost & Prechter, *Elliott Wave Principle* (10. Aufl. 2005), ergänzt um EWI-Präzisierungen (Gorman & Kennedy 2013).
**Status:** BETA. Elliott ist im Produkt ein **Struktur-Prüfer und Geometrie-Lieferant**, kein Prognosemodell (Richtungstrefferquote im Test 50,0 %).

## 1. Begriffe

* **Punkte** p0…pn: p0 Ursprung von Welle 1/A, pk Ende von Welle k.
* **s**: Richtung der ersten Welle (+1 auf, −1 ab). **o(k) = s·pk**: orientierter Preis. Jede Regel wird so einmal formuliert und gilt gespiegelt für Abwärtsmuster (Test EV2-R1/R2 bullish **und** bearish).
* **Leg**: Bewegung zwischen zwei aufeinanderfolgenden bestätigten Pivots einer Skala. Das laufende Leg (bis zum Developing-Extrem) hat `status: DEVELOPING`.
* **Grad**: relative Stufe der Pivot-Hierarchie (scale-1…4), keine Kalenderzeit. Notation: höherer Grad `(1)`, Analysegrad `1`, tieferer Grad `i`.

## 2. Regelklassen (nie vermischt)

| Klasse | Bedeutung | Wirkung |
|---|---|---|
| HARD | Elliott-Regel („never/always" bei F&P) | Verletzung → Kandidat verworfen |
| DEFINITION | Klassengrenze zwischen Mustern | Verletzung → nicht dieses Muster (ein anderes kann gelten) |
| GUIDELINE | Tendenz („usually/often") | rankt 0–1, legitimiert nie |
| EMPIRICAL | VU-Messung | nur Evidence-Schicht (`TECHNICAL_EVIDENCE.md`) |

**Laufende Wellen:** „überschreitet"-Regeln (z. B. W3 über W1-Ende) sind auf einem laufenden Leg `passed: null` (offen), solange sie nicht erfüllt sind; „nicht-über"-Regeln (z. B. W2 nicht unter W1-Ursprung) sind sofort entscheidbar — ein laufendes Extrem kann nur weiterlaufen.

## 3. Musterklassen

| Muster | Wellen | Unterteilung | HARD | DEFINITION | GUIDELINE |
|---|---|---|---|---|---|
| Impuls | 1-2-3-4-5 | 5-3-5-3-5 | Alternation; W2 nie jenseits W1-Ursprung; W3 über W1-Ende; W4 nie im W1-Gebiet; W3 nie kürzeste (bei laufender W5: verletzt, sobald W5 > W3 < W1) | — | W2 50–61,8 %; W3 1,618–2,618×W1; W4 23,6–38,2 %; Alternation; W5 ≈ W1 bei verlängerter W3; genau eine Extension; keine Truncation; Kanal; W3-Momentum/Volumen |
| Leading Diagonal | 1–5 | 5-3-5-3-5 oder 3-3-3-3-3 | W2/W3/W4-Grenzen; W3 nie kürzeste | W4 überlappt W1; Keil (kontrahierend: 3<1, 4<2, 5<3; expandierend umgekehrt) | tiefe W2/W4 (66–81 %), Throw-over |
| Ending Diagonal | 1–5 | 3-3-3-3-3 | wie oben | wie oben | wie oben |
| Zigzag | A-B-C | 5-3-5 | Alternation; B nie jenseits A-Ursprung | B < 90 % von A | B 38,2–78,6 %; C jenseits A-Ende („almost always" → Guideline); C ≈ A / 1,618 / 0,618 |
| Flat | A-B-C | 3-3-5 | Alternation | B ≥ 90 % von A; B ≤ 200 % (VU-Grenze) | Varianten regulär/expandiert/running; B 90–138,2 %; C-Proportion je Variante |
| Dreieck | A-B-C-D-E | 3-3-3-3-3 | E innerhalb C (kontrahierend) | kontrahierend (C<A-Ende, D>B-Ende, E<C-Ende; Barrier-Toleranz) oder expandierend | Legs ≈ 0,618; expandierend selten |
| W-X-Y | W-X-Y | 3-3-3 | X nie jenseits W-Ursprung | W und Y **sichtbar** dreiteilig (ohne aufgelöste Unterteilung nicht von Zigzag/Flat unterscheidbar → nicht erzeugt) | X- und Y-Proportionen |
| Double Zigzag | W(abc)-X-Y(abc) | 5-3-5 – 3 – 5-3-5 | Zigzag-Regeln je Teil; X nie jenseits W-Ursprung | Y jenseits W-Ende | Zigzag-Richtlinien je Teil |

Triple Zigzag / W-X-Y-X-Z werden bewusst nicht gesucht (selten, 11 Legs, hohe Freiheitsgrade).

## 4. Unterteilung (Multi-Degree nach unten)

Jedes bestätigte Leg der Analyseskala wird auf der nächstfeineren Skala zerlegt (`subdivide`): feine Pivots strikt innerhalb des Legs, bestätigt **bis zur Bestätigung des Leg-Endes** (eingefroren → kein Repainting), Alternation erzwungen, innere Extreme innerhalb der Spanne.

| Beobachtung | Klasse | Prüfung |
|---|---|---|
| 1 Leg | „nicht aufgelöst" | Fit 0,5 (neutral) |
| 3 Legs | Korrektur | Zigzag/Flat-Regeln auf den Unterwellen |
| 5 Legs | Motiv | Impuls/Diagonal-Regeln; sonst Dreieck → Korrektur |
| 7 | Korrektur (Kombination) | — |
| 9 | Motiv (Extension) | — |

Fit je erwarteter Klasse M/K: Treffer 1,0 (regelkonform) bzw. 0,8; Widerspruch 0,12–0,15. Die Unterteilung ist in der Theorie HARD; weil die Sichtbarkeit von der Pivot-Auflösung abhängt, wirkt sie als Rang-Evidenz. **Empirisch brachte sie keinen messbaren Mehrwert** (siehe TECHNICAL_EVIDENCE §4) — Kandidat für Gewichtsreduktion in V2.1.

## 5. Höherer Grad (Multi-Degree nach oben)

Die nächstgröbere Skala wird ohne eigenen Kontext gezählt. Ihre aktuelle Welle (Rolle Motiv/Korrektur, Richtung) bewertet die Lesart der Analyseskala (`higherDegreeFit`): Motiv in Richtung des übergeordneten Motivs 1,0; Gegenkorrektur 0,8; gegenläufiges Motiv 0,25 usw. **Empirisch der stärkste Elliott-Befund** (Zigzag-C mit konsistentem höherem Grad +11,5 pp über Zufall; W3 mit Konflikt −22 pp).

Skalenwahl: Analysegrad = zweitgröbste Skala mit ≥ 8 bestätigten Legs (damit ein höherer Grad existiert); Tagesserien typischerweise scale-3 (≥ 8 % bzw. 5 ATR), Wochenserien eigene Schwellen (`ti/context.js`).

## 6. Historische Karte (kausal, nicht repaintend)

Links-nach-rechts-Parser über bestätigte Legs. An Position `pos` wird erst entschieden, wenn auch die längste Alternative (7 Legs) bewertbar ist. Optionen: alle gültigen Muster; Score = 0,55·Guideline-Fit + 0,45·Unterteilungs-Fit (Mindestscore 0,45); Rang = Score + 0,06·Legs (Erklärungskraft) + 0,08·Typ-Prior ± 0,1 Grammatik (nach Motiv Korrektur erwartet und umgekehrt). Eine Entscheidung hängt nur von den Legs ihres Fensters ab, deren Unterteilung eingefroren ist → bestätigte Muster bleiben Präfix (Test EV2-C3).

## 7. Aktuelle Zählung (Trailing) und Alternativen

Kandidaten: jedes Muster mit Start in den letzten 11 Legs, das am laufenden Leg endet (Welle k läuft) oder am letzten bestätigten Leg abgeschlossen ist. Diagonalen erst, wenn ihr Definitionsmerkmal sichtbar ist. Rang:

```
rank = 0,22·Guidelines + 0,22·Unterteilung + 0,14·Abdeckung + 0,16·Höherer Grad
     + 0,12·Trendkontext + 0,09·Grammatik + 0,05·Typ-Prior          (×0,75 bei nur 1 Leg)
```

Trendkontext: Vorzeichen der 1-Jahres-Rendite, nur wenn der Kurs auf derselben Seite seines 1-Jahres-Mittels liegt. Alternativen: bis zu 2 **materiell verschiedene** Lesarten (anderes Muster, andere Welle, andere nächste Bewegung oder Invalidation > 0,5 ATR entfernt; identische Leading/Ending-Diagonalen gelten als gleich).

**Klarheit** = Rangabstand zur besten Alternative (≥ 0,12 hoch, ≥ 0,05 mittel). **Kein** Prozentwert, `isProbability: false`, `confidenceType: structural_fit`. Status: OK / AMBIGUOUS / EARLY (nur Welle 1) / UNAVAILABLE (zu wenige Swings, keine regelkonforme Lesart).

## 8. Invalidation

| Laufende Welle | Harte Grenze (Muster tot) | Revision (Zuordnung ändert sich) |
|---|---|---|
| W1 / A (jedes Muster) | Ursprung des Musters | — |
| Impuls W2 | W1-Ursprung | — |
| Impuls W3 | W1-Ursprung | W2-Ende |
| Impuls W4 | W1-Ende | — |
| Impuls W5 | W1-Ende | W4-Ende |
| Diagonale W4, kontrahierend | W3-Ende − Länge W2 (W4 muss kürzer als W2 bleiben), sonst W3-Ursprung — je nachdem, was näher liegt | — |
| Diagonale W4, expandierend | W3-Ursprung | — |
| Diagonale W5 | W3-Ursprung | W4-Ende |
| Zigzag B / C | A-Ursprung | C läuft: B-Ende |
| Flat B / C | B jenseits 200 % von A | C läuft: B-Ende |
| Dreieck C/D/E, kontrahierend | Extrem zwei Wellen zuvor (D: + 5 % von A, Barrier-Toleranz wie in der Regelprüfung) | Start der laufenden Welle |
| Dreieck, expandierend | keine (expandierende Dreiecke haben keine Preisgrenze) | Start der laufenden Welle — dient im Produkt als Invalidation (`kind: "REVISION"`) |
| abgeschlossenes Muster | — | Musterende |

Regelentscheidbarkeit auf einer laufenden Welle: „nicht jenseits"-Regeln (z. B. kontrahierende Diagonale „W4 kürzer als W2", kontrahierendes Dreieck) sind sofort verletzbar; „jenseits"-Regeln (expandierend) bleiben offen (`null`), solange die Welle sie noch erfüllen kann. Regelwerk `elliott-rules-2.0.1` (2.0.0 → 2.0.1: Review-Korrekturen dieser Tabelle).

## 9. Projektionen

Alle Ziele tragen ihre Relation im Klartext. Impuls: W2-Zone 50/61,8 %; W3 = 1,0/1,618/2,618×W1; W4 = 23,6/38,2/50 % von W3; W5 = W1 bzw. 0,618×W1 und 0,618×(Strecke 1–3); **Obergrenze** W5 ≤ W3, wenn W3 < W1. Diagonalen: W2/W4 66–81 %. Zigzag: B 50/61,8/78,6 %, C = 0,618/1,0/1,618×A. Flat: B 90–123,6 %, C 1,0–1,236 (regulär) bzw. 1,382–1,618 (expandiert). Dreieck: Ausbruch ≈ Breite von A ab E. Nach Abschluss: Korrektur 38,2–61,8 % und Bereich der vorherigen Welle 4. Kandidaten werden ATR-tolerant zu Zonen (≥ 0,35 ATR Halbbreite) geclustert.

## 10. Was Elliott V2 bewusst nicht tut

* keine Wellenzählung aus Chartbildern oder durch ein Sprachmodell
* keine Wahrscheinlichkeit, kein „Kursziel"
* keine Zählung ohne Invalidation; keine Fake-Welle bei unklarer Struktur
* kein Umschreiben bestätigter historischer Labels
* keine Triple-Kombinationen; Neely-Regeln nicht gemischt
