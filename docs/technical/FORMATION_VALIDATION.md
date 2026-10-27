# Validierung der Chartformationen (L5)

Stand 27.10.2026, `technical-formations-1.2.0`, Datenstand 26.10.2026. Skript: `scripts/technical/validate-formations.mjs` (schreibt nur mit `--out`). Test der Prüfregeln: `quant/tests/technical-formations-validation.test.mjs`.

Die historische Evidenz (`formation-evidence.json`) beantwortet, ob eine Formation **wirkt**. Diese Validierung beantwortet die Frage davor: Ist das Erkannte geometrisch das, was der Name und die eigene Regel sagen?

## 1. Regelprüfung über das Universum

Grundlage: alle aktiven Formationen von 5.657 Titeln, zusammen 11.727 Erkennungen. Geprüft wird jede Erkennung.

**Gemeinsame Prüfung für alle Formationen:**
- Kausal: Punkte, Linienanfänge und Erkennung liegen nicht nach dem Stichtag.
- Preise sind endlich und > 0.
- Der Zustand ist gültig.
- Bestätigung und Invalidierung liegen nicht vor der Erkennung.
- Die Richtung passt zum Typ.

**Prüfung je Typ:**

| Typ | Kern der Prüfung |
|---|---|
| Dreiecke, Rechteck | erstes gegen letztes Hoch bzw. Tief der letzten fünf Pivots, wie die Engine. Aufsteigend: Hochs gleich, Tiefs steigen. Absteigend: Spiegelbild. Symmetrisch: Hochs fallen, Tiefs steigen. Rechteck: beide gleich, Breite ≥ 3 ATR. |
| Keile | beide Linien in Trendrichtung, Spanne verengt sich um ≥ 25 % |
| Kanäle | beide Linien gleichgerichtet, Steigungen weichen ≤ 35 % ab |
| Wimpel | obere Linie fallend, untere steigend, Mast ≥ 5 ATR |
| Flaggen | Mast ≥ 5 ATR, Invalidierung = Mastende ∓ 50 % des Masts |
| Doppeltop/-boden | beide Extrema innerhalb der Toleranz, Zwischenextrem auf der Gegenseite |
| SKS | Kopf ist das Extrem, Schultern innerhalb 1,5 Toleranzen |
| Trendlinien | Unterstützung steigt, Widerstand fällt |
| Lücken | Tagestief über Vortageshoch bzw. Tageshoch unter Vortagestief, Prüfung an den Tagesbars |

**Toleranz:** max(0,75 ATR, 2,5 % des Kurses) wie `ti/chart-patterns.js`. ATR und Kurs werden am Erkennungsbar gemessen, mit 15 % Reserve. Die Engine misst am Bestätigungsbar des jüngsten Pivots, und dieser Bar steht nicht in der Ausgabe.

### Ergebnis

| Typ | gültig | Verstöße |
|---|---|---|
| Aufwärts-/Abwärtskanal | 315/315, 514/514 | – |
| Aufsteigendes / absteigendes / symmetrisches Dreieck | 372/372, 542/544, 428/428 | 2 × Preis 0 (CPTAF, Datenfehler) |
| Rechteck | 261/261 | – |
| Steigender / fallender Keil | 38/38, 185/185 | – |
| Bullische / bärische Flagge | 82/82, 306/306 | – |
| Bullischer Wimpel | 103/159 | **56 invalidiert vor der Erkennung**, 1 Mast |
| Bärischer Wimpel | 241/310 | **66 invalidiert vor der Erkennung**, 4 Mast |
| Doppeltop / -boden | 547/547, 421/422 | 1 × Preis 0 (CPTAF) |
| SKS / inverse SKS | 270/270, 174/174 | – |
| Unterstützungs- / Widerstandslinie | 2.078/2.078, 2.291/2.291 | – |
| Lücke nach oben / unten | 368/410, 427/469 | **je 42 ohne Lücke** |
| Range- / Widerstandsausbruch, Volatilitätskontraktion, Tasse mit Henkel | alle | – |
| **gesamt** | **11.515 / 11.727 (98,2 %)** | |

### Befunde

**B-F1: Wimpel invalidiert vor der Erkennung (122 Fälle).**
- `formations.js#pennantFrom` scannt die Konsolidierung ab dem Mastende. Bricht der Kurs schon dann unter die Invalidierungsmarke, wenn der Mast-Pivot noch nicht bestätigt ist (`k < detectIdx`), meldet die Engine trotzdem einen Wimpel. Er hat dann den Zustand „invalidiert“ mit `invalidatedAt` vor `detectedAt`.
- Zum Erkennungszeitpunkt war dieser Wimpel nie erkennbar. Er dürfte gar nicht erscheinen.
- Der Bestätigungszweig prüft das bereits (`if (k < detectIdx) return null`), der Invalidierungszweig nicht.
- Beispiel: AMZN, Wimpel erkannt am 14.08.2026, invalidiert am 12.08.2026.

**B-F2: Kurslücken bei ruhenden Titeln (42 Titel, je eine Lücke nach oben und nach unten).**
- Bei Titeln ohne jede Bewegung (O = H = L = C über Wochen, z. B. ADEX bei 5,38) ist die ATR 0. Eine „Lücke“ der Größe 0 erfüllt dann „≥ 0,5 ATR“.
- Ohne Volumendaten entfällt außerdem die Volumenprüfung.
- Folge: Am letzten Tag erscheinen eine Lücke nach oben **und** eine nach unten.

**Korrektur:** B-F1 und B-F2 ändern Fachmodell-Ausgaben (Formationszähler im Screener). Sie kommen deshalb als eigener PR mit Vorher/Nachher und brauchen eine Owner-Freigabe.

**Offen:**
- 5 Wimpel und Flaggen mit „Mast zu kurz“. Es sind ältere Formationen; die ATR am Ankerbar der Lebenszyklus-Auswertung ist aus der Ausgabe nicht rekonstruierbar. Ungeklärt, aber kein Hinweis auf einen Regelbruch.
- CPTAF: Kurse von 0 in den Tagesbars. Das ist ein Datenfehler, kein Engine-Fehler.

## 2. Spiegeltest

Jede Reihe wird linear um ihre Mitte gespiegelt: p′ = max + min − p, Hoch und Tief tauschen. Abstände und ATR bleiben dabei gleich. Jede Formation sollte am selben Tag als Gegenstück erscheinen. Aufruf: `validate-formations.mjs --mirror`.

| Typ → Gegenstück | gespiegelt | gleicher Zustand |
|---|---|---|
| Lücke unten → oben / oben → unten | 100,0 % / 99,8 % | 100 % |
| Aufwärtskanal → Abwärtskanal | 99,0 % | 100 % |
| Bullische Flagge / Wimpel | 96,3 % / 95,6 % | 100 % |
| Unterstützungslinie → Widerstandslinie | 95,5 % | 100 % |
| SKS → inverse SKS | 94,1 % (invers → SKS 92,0 %) | 100 % |
| Bärische Flagge | 93,5 % | 100 % |
| Steigender Keil → fallender Keil | 92,1 % (fallend → steigend 84,9 %) | 100 % |
| Widerstandslinie → Unterstützungslinie | 91,8 % | ≈ 100 % |
| Abwärtskanal → Aufwärtskanal | 89,9 % | 98 % |
| Doppeltop → -boden | 89,8 % (Boden → Top 86,0 %) | ≈ 100 % |
| Absteigendes → aufsteigendes Dreieck | 89,3 % (aufsteigend → absteigend 84,4 %) | ≈ 100 % |
| Bärischer Wimpel | 86,5 % | 100 % |
| Symmetrisches Dreieck, Rechteck | 86,0 %, 85,4 % | 100 % |

**Lesart:** Die Regeln sind weitgehend symmetrisch. Erscheint das Gegenstück, stimmt der Zustand fast immer.

**Ursachen der Restasymmetrie (Hypothesen, nicht bewiesen):**
- Prozentregeln (2,5 % des Kurses, Range ≤ 15 %) ändern sich, weil die Spiegelung das Kursniveau verschiebt.
- Bei ruhigen Titeln mit vielen gleichen Hochs und Tiefs liegt es an der Gleichstandsbehandlung der Pivot-Erkennung. Eine Einschränkung auf Titel mit enger Kursspanne (max/min < 1,25) verbessert die Quote nicht. Das spricht für die Gleichstände.

Eine gezielte Prüfung der Pivot-Gleichstände ist der nächste Schritt.

## 3. Korrektur `technical-formations-1.2.1` (Fachmodell, Owner-Freigabe nötig)

| Befund | Änderung in `formations.js` |
|---|---|
| B-F1 | `pennantFrom`: Der Invalidierungszweig bekommt dieselbe Prüfung `k < detectIdx → kein Wimpel` wie der Bestätigungszweig. Danach wird, wie bisher, das vorletzte Leg als Mast geprüft. |
| B-F2 | `gaps`: Eine Lücke verlangt ATR > 0 und Größe > 0. |

**Regressionstests** in `quant/tests/technical-formations.test.mjs`. Beide schlagen auf 1.2.0 fehl und laufen auf 1.2.1 durch:
- B-F1 an der AMZN-Geometrie vom 29.07. bis 14.08.2026, mit konstruiertem Vorlauf. An jedem Bar gilt: kein Wimpel, keine Invalidierung oder Bestätigung vor der Erkennung.
- B-F2 an einem ruhenden Titel ohne Volumen (O = H = L = C).

### Vorher/Nachher – heutige Daten (5.657 Titel, Stand 26.10.2026)

| Typ | 1.2.0 gültig / gesamt | 1.2.1 gültig / gesamt |
|---|---|---|
| Bullischer Wimpel | 103 / 159 | 104 / 104 |
| Bärischer Wimpel | 241 / 310 | 244 / 247 |
| Lücke nach oben | 368 / 410 | 368 / 368 |
| Lücke nach unten | 427 / 469 | 427 / 427 |
| alle anderen Typen | unverändert | unverändert |
| **gesamt** | **11.515 / 11.727** | **11.519 / 11.525** |

**Erläuterung zu den Zahlen:**
- 122 Wimpel und 84 Null-Lücken entfallen.
- 4 gültige Wimpel kommen neu hinzu. Sie wurden bisher von einem nie sichtbaren Wimpel auf dem jüngeren Mast verdrängt.
- Übrig sind 3 bärische Wimpel mit zu kurzem Mast (ungeklärt, siehe oben) und 3 Fälle mit Kurs 0 bei CPTAF.

### Vorher/Nachher – historische Evidenz (`formation-evidence.mjs --out`, gleiche Stichprobe)

| Typ | n | Titel | bestätigt in 20 Tagen | invalidiert in 20 Tagen | Überrendite 20 T (Mittel ± KI95) | signifikant |
|---|---|---|---|---|---|---|
| Bullischer Wimpel | 793 → 593 | 749 → 568 | 20,7 → 27,8 % | 57,4 → 42,7 % | +1,19 ± 1,16 → +1,76 ± 1,41 % | nein → nein |
| Bärischer Wimpel | 1.788 → 1.418 | 1.536 → 1.246 | 35,2 → 44,6 % | 44,6 → 29,9 % | +1,27 ± 1,16 → +1,69 ± 1,31 % | nein → nein |
| Lücke nach oben | 9.812 → 4.352 | 2.264 → 2.222 | 33,8 → 76,1 % | 18,3 → 41,2 % | −0,51 ± 0,28 → −1,65 ± 0,61 % | ja → ja |
| Lücke nach unten | 9.444 → 3.984 | 2.181 → 2.139 | 33,6 → 79,6 % | 16,4 → 39,0 % | −0,42 ± 0,25 → −0,46 ± 0,59 % | ja → **nein** |

**Lesart:**
- In der Historie waren **mehr als die Hälfte aller Lücken Null-Lücken** ruhender Titel. Sie standen meist ohne Ausgang da (rund 60 % „entfallen“).
- Ohne sie werden echte Lücken überwiegend bestätigt.
- Die Lücke nach unten verliert ihre Signifikanz.
- Die Lücke nach oben bleibt signifikant **negativ**: Nach echten Aufwärtslücken liegt die Rendite über 20 Tage im Mittel 1,65 % unter dem Markt.
- Bei den Wimpeln entfallen rund 25 % der Stichprobe. Wimpel bleiben ohne signifikante Überrendite.

**Daten:** Ein Neubau durch den Erzeugerlauf (`build-screener.mjs`, `formation-evidence.mjs`) übernimmt 1.2.1 in `technical/data`. Der PR bringt keine Artefakte mit.
