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
| Aufsteigendes / absteigendes / symmetrisches Dreieck | 372/372, 542/544, 428/428 | 2 × Preis 0 (CPTAF, Rundung bei Sub-Penny-Kursen, siehe §4) |
| Rechteck | 261/261 | – |
| Steigender / fallender Keil | 38/38, 185/185 | – |
| Bullische / bärische Flagge | 82/82, 306/306 | – |
| Bullischer Wimpel | 103/159 | **56 invalidiert vor der Erkennung**, 1 Mast |
| Bärischer Wimpel | 241/310 | **66 invalidiert vor der Erkennung**, 4 Mast |
| Doppeltop / -boden | 547/547, 421/422 | 1 × Preis 0 (CPTAF, Rundung, siehe §4) |
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
- CPTAF: Punktpreise von 0. Erste Einschätzung „Datenfehler“ war falsch; Ursache ist die Rundung der Punktpreise bei einem Sub-Penny-Titel (siehe §4).

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

## 4. Befund B-F3: Erkennungsdatum vor der ersten Sichtbarkeit (`technical-formations-1.2.2`, Fachmodell, Owner-Freigabe nötig)

**Neue Prüfung** in `validate-formations.mjs`: `NICHT_SICHTBAR_AM_ERKENNUNGSTAG`.
- Jede Formation am Stichtag muss auch erscheinen, wenn man die Engine am Erkennungstag mit den bis dahin bekannten Bars rechnet (`analyzeAt(detectedIndex)`, gleiche Id).
- Das ist die dokumentierte Bedeutung des Erkennungstags: der erste Tag, an dem die Formation mit dem damaligen Wissen sichtbar war.
- Die Prüfung in Abschnitt 1 hat nur die Reihenfolge der Zeitpunkte kontrolliert (Bestätigung/Invalidierung nicht vor der Erkennung). Diese Lücke hat sie nicht erfasst.

**Befund unter 1.2.1** (5.657 Titel, Stand 26.10.2026):

| Typ | nicht sichtbar am Erkennungstag | Verzug bis zur ersten Sichtbarkeit (Median / Max, Handelstage) |
|---|---|---|
| Bärischer Wimpel | 179 von 247 | 14 / 55 |
| Bullischer Wimpel | 73 von 104 | 14 / 101 |
| Widerstandslinie | 36 von 2.291 | 14 / 81 |
| Unterstützungslinie | 44 von 2.078 | 19 / 130 |
| alle übrigen 20 Typen | 0 | – |

**Ursachen:**
- **Wimpel.** Als Erkennungstag galt der früheste mögliche Bar: Mast-Pivot bestätigt und 5 Konsolidierungsbars. Sichtbar wird der Wimpel aber erst an dem Bar, an dem sich die Konsolidierung tatsächlich verengt, oft Wochen später.
- **Wimpel und Trendlinien (ATR).** Die ATR-Schwellen maßen die Engine an der ATR des Stands t: beim Wimpel Mastlänge und Tempo, bei der Trendlinie Anstieg und Toleranz. Fiel die ATR später, wurde eine frühere Struktur nachträglich gültig und trug ihr altes Datum.

**Korrektur 1.2.2:**
- **Wimpel.** Der Erkennungstag ist der erste Bar ab dem frühestmöglichen Bar, an dem sich die Konsolidierung verengt.
  - Kommt der Ausbruch oder die Invalidierung vor der ersten Sichtbarkeit, ist der Wimpel erst am Tag des Ausbruchs sichtbar. Er gilt dann am selben Tag als erkannt und bestätigt bzw. invalidiert.
  - Mast und Tempo werden an der ATR des frühestmöglichen Bars gemessen.
- **Trendlinien.** Die Toleranz kommt aus der ATR am Erkennungsbar, also an der Bestätigung des zweiten Pivots.

**Vorher/Nachher heutige Daten:**

| | 1.2.1 | 1.2.2 |
|---|---|---|
| Erkennungen gesamt | 11.525 | 11.426 |
| regelkonform inkl. Sichtbarkeit | 11.189 | 11.422 |
| nicht sichtbar am Erkennungstag | 332 | **0** |
| Bärischer / bullischer Wimpel | 247 / 104 | 161 / 57 |
| Widerstands- / Unterstützungslinie | 2.291 / 2.078 | 2.304 / 2.099 |
| alle übrigen Typen | unverändert | unverändert |

Rest: 1 Wimpel mit Mast knapp unter 5 ATR des Stichtags (ruhender Titel mit ATR 0 am Stichtag) und 3 × Kurs 0 bei CPTAF. Beide Fälle sind weiter unten aufgeklärt.

**Vorher/Nachher historische Evidenz** (`formation-evidence.mjs --out`):

| Typ | n | Titel | bestätigt in 20 T | invalidiert in 20 T | Überrendite 20 T | signifikant |
|---|---|---|---|---|---|---|
| Bärischer Wimpel | 1.418 → 901 | 1.246 → 833 | 44,6 → 38,3 % | 29,9 → 32,3 % | +1,69 ± 1,31 → +2,60 ± 1,73 % | nein → nein |
| Bullischer Wimpel | 593 → 413 | 568 → 402 | 27,8 → 27,6 % | 42,7 → 37,8 % | +1,76 ± 1,41 → +1,73 ± 1,77 % | nein → nein |
| Widerstandslinie | 8.759 → 8.544 | 4.586 → 4.550 | 57,6 → 59,0 % | 45,3 → 45,5 % | −0,38 ± 0,47 → −0,36 ± 0,47 % | nein → nein |
| Unterstützungslinie | 9.252 → 8.966 | 4.548 → 4.480 | 61,6 → 61,4 % | 46,0 → 45,6 % | −0,06 ± 0,40 → −0,02 ± 0,40 % | nein → nein |

**Lesart:**
- Die Evidenz misst schon unter 1.2.1 ab dem ersten Stand, an dem eine Formation sichtbar war, nicht ab `detectedAt`. Ihre Renditen waren von der Rückdatierung also nicht verfälscht.
- Bei den Wimpeln fällt rund ein Drittel der historischen Stichprobe weg. Grund ist die kausale ATR-Messung: Mast und Tempo werden jetzt an der ATR des frühestmöglichen Bars gemessen statt an der ATR des jeweiligen Stands. Wimpel, die das 5-ATR-Kriterium nur mit einer später gefallenen ATR erfüllten, entfallen.
- Keine Aussage zur Wirksamkeit ändert sich: weiterhin nirgends signifikant.

**Test:** In `technical-formations.test.mjs` prüft „B-F3“ an eingefrorenen echten Tagesbars von ADT, ABAT, ACVA und AIRG (`fixtures/technical-formations-visibility.json`): Für jeden Wimpel und jede Trendlinie in 20 Ständen muss die Formation am Erkennungstag sichtbar sein. Der Test schlägt auf 1.2.1 fehl und läuft auf 1.2.2 durch.

### Absicherung vor dem Merge von 1.2.2 (Owner-Freigabe 27.10.2026)

| Bedingung | Nachweis |
|---|---|
| Jede Formation ist am Erkennungstag mit den damaligen Daten erkennbar | Validator `NICHT_SICHTBAR_AM_ERKENNUNGSTAG` über alle 5.657 Titel: 0 Fälle (vorher 332). Test „B-F3“ an eingefrorenen echten Kursen; schlägt auf 1.2.1 fehl. |
| ATR-Schwellen nur aus damals bekannter Information | Wimpel: Mast und Tempo an der ATR des frühestmöglichen Erkennungsbars (≤ Erkennungstag). Trendlinien: Steigung und Toleranz an der ATR des Erkennungsbars. Alle übrigen Regeln messen an der ATR des Auswertungsstands t; dass dadurch kein Rückdatieren entsteht, belegt die Sichtbarkeitsprüfung für alle 24 Typen (0 Fälle). |
| Keine rückwirkend erzeugten Frühsignale | wie oben. Zusätzlich misst die historische Evidenz ab dem ersten sichtbaren Stand k mit Einstieg am Schluss von k, nie ab `detectedAt`. Neuer Test: der Messbeginn k liegt nie vor dem Erkennungstag. |
| Erst am Ausbruchstag erkennbar ≠ früheres Einstiegssignal | Solche Formationen tragen `confirmedAtDetection` (Erkennung = Bestätigung am selben Tag). Im Screener steht dafür das Kennzeichen „B“, im Chart Studio „Erkannt nach Ausbruch“. Die Evidenz misst sie ab dem Ausbruchsschluss. Neuer Test: Das Kennzeichen ist genau dann gesetzt, wenn die Bestätigung nicht nach der Erkennung liegt. Eine historische Strategie, die Formationen als Einstieg nutzt, muss `confirmedAtDetection` beachten. Heute gibt es außer der beschreibenden Evidenz keine solche Strategie im Repository: `formations.js` wird nur von Screener, Chart Studio, Evidenz und Validator gelesen. |

**Die vier verbleibenden Auffälligkeiten.** Jede wurde einzeln untersucht und keine stillschweigend als fehlerfrei gewertet.

| Titel | Formation | Prüfung | Befund | Status |
|---|---|---|---|---|
| CPTAF | DESCENDING_TRIANGLE@2026-09-29 und @2026-09-30 | PUNKT_PREIS | Kein Datenfehler (korrigiert gegenüber Abschnitt 1): Die Tagesbars sind positiv, CPTAF notiert im Sub-Penny-Bereich (Schluss 0,0001 $, Tief bis 0,000001 $). Die Altformationen (`ti/chart-patterns.js`) runden Punktpreise auf 4 Nachkommastellen; ein Tief von 0,000001 wird dadurch 0. | **Behoben in 1.2.3** (siehe unten). |
| CPTAF | DOUBLE_BOTTOM@2026-09-29 | PUNKT_PREIS | wie oben | **Behoben in 1.2.3.** |
| TECTP | BEAR_PENNANT@2026-01-22 | MAST_ZU_KURZ | Mast 1,87; 5 ATR am Erkennungsbar = 0,61, also erfüllt. Ursache war ein **Validatorfehler**: Bei ATR 0 am Stichtag (ruhender Titel) fiel der Validator auf einen undefinierten Wert zurück, und jeder Vergleich scheiterte. | **Validator korrigiert**: Er misst den Mast nur noch an positiver ATR. Die Engine ist unverändert. Danach regelkonform. |

**Stand nach der Validatorkorrektur:** 11.423 von 11.426 Erkennungen sind regelkonform. Offen waren danach nur die 3 CPTAF-Fälle. Sie entstanden durch die Rundung der Punktpreise bei einem Sub-Penny-Titel und sind mit 1.2.3 behoben.

## 5. Rundung `technical-formations-1.2.3` / `ti-chart-patterns-1.1.1` (keine Entscheidungsänderung)

**Ursache:** Beide Module runden jede Ausgabezahl auf 4 Nachkommastellen. Bei Kursen unter einem Cent wurde ein Punktpreis dadurch 0. Beispiel CPTAF: Tief 0,000001 $.

**Änderung:**
- Beträge ab 1 behalten 4 Nachkommastellen.
- Beträge darunter bekommen 4 signifikante Stellen, wie `published-close.js` bei Schlusskursen.
- 0 bleibt 0.

**Vorher/Nachher** (5.657 Titel, alle 11.426 Formationen am Stichtag):

| | Anzahl |
|---|---|
| Formationen mit geänderter Id, Zustand, Erkennungs-, Bestätigungs- oder Invalidierungsdatum | **0** |
| Formationen mit genaueren Zahlen (Werte unter 1, meist Steigungen je Bar) | 2.853 (bei 2.467 Titeln) |
| Werte ab 1 | unverändert |
| Validator | 11.426 / 11.426 regelkonform (vorher 11.423) |

**Wirkung im Produkt:** Der Screener speichert keine Formationspreise, nur Typ, Zustand, Daten und Kennzeichen. Seine Spalten ändern sich nicht. Genauer werden nur die Zahlen im Chart Studio.

**Test:** Dieselbe konstruierte Reihe läuft einmal um 100 $ und einmal auf ein Millionstel skaliert. Erwartet werden gleiche Formationen und Zustände, jeder Punktpreis positiv und proportional. Der Test schlägt auf 1.2.2 fehl.

## 6. Ursachen der Spiegel-Asymmetrie und Dreiecksklassifikation `ti-chart-patterns-1.2.0` / `technical-formations-1.3.0` (Fachmodell, Owner-Freigabe nötig)

Abschnitt 2 nannte zwei Hypothesen für die Restasymmetrie: Prozentregeln und Gleichstände der Pivots. Geprüft wurden beide mit Experimenten in einer Kopie der Engine. Am Modell änderte das nichts.

| Variante | Spiegelquote |
|---|---|
| Stand `main` | 81–100 % je Typ (Abschnitt 2) |
| Pivot-Schwelle nur aus der ATR (ohne `minPct` von 2–15 % des Schlusses) | Kanäle, Flaggen, Wimpel, Keile, Trendlinien **100 %**; Dreiecke, Doppeltop/-boden, SKS, Rechteck 87–99 % |
| zusätzlich Toleranz der älteren Formationen nur aus der ATR (ohne 2,5 % des Schlusses) | 18 von 20 Typen **100 %**; aufsteigendes Dreieck 95,0 %, Lücke nach oben 99,7 % (ein Fall) |
| zusätzlich Gleichstandsregel des ersten Pivots umgekehrt (`upMove > downMove`) | unverändert |
| zusätzlich Klassifikation wie unten | alle Typen **100 %** außer einem Fall bei der Lücke nach oben (Verdachtsregel über das Kursverhältnis) |

**Befund:**
1. **Gleichstände sind nicht die Ursache.**
   - Die Pivot-Erkennung behandelt gleiche Hochs und Tiefs symmetrisch: Das erste Extrem bleibt, auf beiden Seiten.
   - Die einzige asymmetrische Gleichstandsregel betrifft den allerersten Pivot einer Reihe und ändert keine Formation.
2. **Fast die ganze Restasymmetrie kommt aus prozentualen Mindestschwellen.** Das sind die Pivot-Schwelle `max(Schluss · minPct, k · ATR)` und die Toleranz `max(0,75 ATR, 2,5 % des Schlusses)` der älteren Formationen. Die Spiegelung verschiebt das Kursniveau, deshalb dürfen solche Regeln anders ausfallen. Das ist eine **bewusste Modellwahl, kein Fehler:** Die Prozentschwelle verhindert bei ruhigen Titeln mit kleiner ATR übermäßig viele Pivots. Ohne sie steigt z. B. die Zahl der Rechtecke von 261 auf über 1.100. Eine Änderung wäre ein eigener Fachmodell-PR und ist hier nicht vorgeschlagen.
3. **Ein echter Geometriefehler in der Dreiecksklassifikation.**
   - „Flach“ heißt Abstand ≤ tol, „steigend/fallend“ heißt mehr als 0,5 tol. Beides kann zugleich gelten.
   - Gelten aufsteigendes Dreieck (Hochs flach, Tiefs steigen) und absteigendes Dreieck (Tiefs flach, Hochs fallen) zugleich, entschied die Reihenfolge der Prüfung: „aufsteigend“.
   - Das Spiegelbild eines solchen Musters wurde wieder „aufsteigend“ statt „absteigend“. Geometrisch konvergiert das Muster, denn die Hochs fallen und die Tiefs steigen.

**Korrektur (1.2.0 / 1.3.0):**
- Gelten beide Bedingungen zugleich, ist das Muster ein **symmetrisches Dreieck**. Beide Kanten sind dann Linien durch die Pivots statt Waagerechte.
- Alle anderen Fälle bleiben unverändert. Auch ein absteigendes Dreieck mit leicht steigenden Tiefs innerhalb der Toleranz bleibt absteigend: Seine Unterkante ist flach.
- Ein zunächst erwogener breiterer Vorrang der Konvergenz hätte auch solche Dreiecke umgedeutet. Er wurde verworfen, weil die gezeichnete flache Kante dann nicht zur Einordnung gepasst hätte.

**Vorher/Nachher:**

| | vorher (1.2.3 / 1.1.1) | nachher (1.3.0 / 1.2.0) |
|---|---|---|
| Formationen gesamt (5.657 Titel) | 11.426 | 11.426 |
| aufsteigende Dreiecke | 372 | 355 (17 werden symmetrisch) |
| absteigende Dreiecke | 544 | 544 |
| symmetrische Dreiecke | 428 | 445 |
| Spiegelquote aufsteigend → absteigend | 84,4 % | 88,2 % |
| Validator | 11.426 / 11.426 | 11.426 / 11.426 |
| Screener: Titel mit geänderter Formationsliste | – | 19 von 5.657 |

**Screener im Einzelnen** (Erzeuger mit `main`-Code gegen diesen Stand):
- Nur die fünf Formationsspalten ändern sich (`formations`, `formationActive`, `formationConfirmed`, `formationOpen`, `formationNewDays`). Alle übrigen Spalten sind byte-gleich.
- 7 Titel: aufsteigend wird symmetrisch, im selben Zustand oder bestätigt.
- 7 Titel: Ein symmetrisches Dreieck kommt neu in die Liste. Als aufsteigendes Dreieck hatte ein Ausbruch nach unten es ungültig gemacht. Als symmetrisches Dreieck ist dieser Ausbruch gültig.
- 3 Titel: Das aufsteigende Dreieck fällt weg. Mit geneigten Kanten ist es bereits gebrochen und ungültig.
- 2 Titel: geänderte Kennzeichen oder Daten.
- `meta.json`:
  - aufsteigend erkannt 193 → 181, aufsteigend bestätigt 58 → 57;
  - symmetrisch erkannt 28 → 35, symmetrisch bestätigt 302 → 310.

**Test:** `quant/tests/technical-formations-triangles.test.mjs` nutzt echte Bars von INGM und TRMK (Fixture `technical-formations-triangles.json`), die genau diesen Fall zeigen. Geprüft wird:
- Das Muster ist symmetrisch, nicht aufsteigend.
- Die obere Kante fällt, die untere steigt.
- Jedes Dreieck hat sein Gegenstück im Spiegelbild am selben Erkennungstag.

Mit der alten Klassifikation schlagen vier der fünf Prüfungen fehl.

### Absicherung vor dem Merge (Owner-Freigabe 28.10.2026)

Datenstand: `main` nach #1035 (L9), Daten mit dem Erzeuger neu gebaut (`build-screener.mjs`). Wieder ändern sich genau dieselben 19 Titel, nur in den fünf Formationsspalten; alle übrigen 129 Spalten sind byte-gleich.

**Klassifikation und gezeichnete Kanten.** Jede Dreieckskante im Universum wurde gegen ihren Typ geprüft (symmetrisch: oben fallend, unten steigend; aufsteigend: oben waagrecht, unten steigend; absteigend: unten waagrecht, oben fallend):

| Typ | vorher (1.2.3) passend | nachher (1.3.0) passend |
|---|---|---|
| symmetrisch | 428 / 428 | 445 / 445 |
| aufsteigend | 145 / 372 | 145 / 355 |
| absteigend | 220 / 544 | 220 / 544 |

Die Korrektur macht 17 vorher unpassende Fälle passend und keinen passenden unpassend. Bei aufsteigenden und absteigenden Dreiecken bleibt ein **älterer, eigener Befund**, den diese Korrektur weder verursacht noch behebt:
- Die Kanten werden nach „flach“ statt nach dem Typ gewählt. Gilt die Unterkante auch als flach, wird ein aufsteigendes Dreieck mit waagrechter Unterkante gezeichnet (Beispiel ABEV 26.10.: Tiefs 2,75 → 2,83, gezeichnet 2,75 → 2,75).
- Die waagrechte Kante beginnt in `formations.js` am Preis des ersten Pivots statt auf ihrem Niveau (ABEV: 3,3296 → 3,35 statt 3,35 → 3,35).

Beides ändert Ausbruchs- und Invalidierungsniveaus und ist damit ein eigenes Fachmodell. Es kommt als getrennter PR mit Vorher/Nachher und einer Linienprüfung im Validator.

**Keine Rückdatierung.** `validate-formations.mjs --mirror` über 5.657 Titel und 11.426 Formationen meldet 0 × „nicht sichtbar am Erkennungstag“, 0 × „bestätigt vor Erkennung“, 0 × „invalidiert vor Erkennung“ und 0 Geometrieverstöße. `formations.js` bricht zudem bei jeder Erkennung nach dem Stand-Bar ab (`LOOKAHEAD`). Wo ein symmetrisches Dreieck „bei Erkennung ausgebrochen“ ist (LGCL, MC, QNME, XLO), lag der Ausbruch am Erkennungstag selbst, nicht davor; das ist die dokumentierte Kennzeichnung aus #938.

**Die 19 Titel** (Dreiecke vorher → nachher, Screener-Liste):

| Titel | vorher | nachher |
|---|---|---|
| CHNR | aufst. 2026-10-09 | symm. 2026-10-09 (offen) |
| CTWO | aufst. 2026-09-30 | – |
| ELLO | aufst. 2026-10-23 | symm. 2026-10-23 (offen) |
| FBDC | – | symm. 2026-09-09 (bestätigt 2026-09-24) |
| GSUN | aufst. 2026-09-17 | symm. 2026-09-17 (bestätigt 2026-10-02) |
| INGM | aufst. 2026-10-05 | symm. 2026-10-05 (offen) |
| KRNT | aufst. 2026-08-18 | symm. 2026-08-18 (offen) |
| LGCL | – | symm. 2026-08-04 (bestätigt 2026-08-04, bei Erkennung ausgebrochen) |
| LOCO | aufst. 2026-10-09 | symm. 2026-10-09 (offen) |
| MC | – | symm. 2026-09-14 (bestätigt 2026-09-14, bei Erkennung ausgebrochen) |
| NEOV | aufst. 2026-10-14 | symm. 2026-10-14 (bestätigt 2026-10-19) |
| QNME | – | symm. 2026-10-16 (bestätigt 2026-10-16, bei Erkennung ausgebrochen) |
| SFHG | aufst. 2026-09-17 | symm. 2026-09-17 (offen) |
| TRMK | aufst. 2026-10-23 | symm. 2026-10-23 (offen) |
| UTSI | aufst. 2026-10-05 | – |
| WBS-P-F | aufst. 2026-08-05 | – |
| WLKP | – | symm. 2026-09-02 (bestätigt 2026-10-12) |
| WSBK | aufst. 2026-07-30 (bestätigt 2026-10-26) | – |
| XLO | – | symm. 2026-10-16 (bestätigt 2026-10-16, bei Erkennung ausgebrochen) |

Erklärung der Fälle ohne direktes Gegenstück:
- **CTWO, UTSI, WBS-P-F:** Als symmetrisches Dreieck mit geneigten Kanten ist das Muster nach dem Ausbruch wieder gescheitert (invalidiert). Es fällt nach den bestehenden Listenregeln heraus.
- **WSBK:** Als symmetrisches Dreieck brach es am Erkennungstag (30.07.) nach unten aus und war am 31.07. ein Fehlausbruch. Als aufsteigendes Dreieck zählte nur der Ausbruch nach oben am 26.10.
- **FBDC, XLO, LGCL, MC, QNME, WLKP:** Als aufsteigendes Dreieck machte der Ausbruch nach unten es ungültig, oder es fiel nach den Listenregeln heraus. Als symmetrisches Dreieck ist derselbe Ausbruch eine bärische Bestätigung.

**Cloudflare Pages auf `8703280`.** Der Check meldete „Build failed“ mit Start = Ende (06:58:46 UTC). Ein Build hat also nicht stattgefunden. Er zählt nicht als erfolgreicher Build. Die Logs liegen nur im Cloudflare-Dashboard; von hier ist kein Zugriff und kein Neustart möglich. Die Ursache liegt bei Cloudflare:
- Der PR ändert keine Seiten- oder Build-Konfiguration.
- Derselbe Check baute vorher und nachher auf anderen Zweigen erfolgreich (#1035 um 07:40, #1044 um 08:01).
- Vercel meldete am selben Morgen sein Tageslimit.

Den tatsächlichen Bau belegen der Pflichtjob `package` (Pages-Paket, grün) und der Cloudflare-Lauf auf dem neuen Kopf dieses PRs.

## 7. Dreieckskanten nach Typ `ti-chart-patterns-1.3.0` / `technical-formations-1.4.0` (Fachmodell, Owner-Freigabe nötig)

**Befund (28.10.2026, Prüfung vor dem Merge von §6):** Bei aufsteigenden und absteigenden Dreiecken passten die gezeichneten Kanten nicht immer zum Typ: aufsteigend 210 von 355, absteigend 324 von 544 (Stand 1.3.0). Zwei Ursachen:
1. `chart-patterns.js` wählte die Kanten nach „flach“, nicht nach dem Typ. Galt auch die Gegenkante als flach (die Bereiche „flach“ und „steigend/fallend“ überlappen, §6), wurde sie waagrecht gezeichnet. Ein aufsteigendes Dreieck bekam so eine waagrechte Unterkante, obwohl die Tiefs steigen (ABEV 26.10.: Tiefs 2,75 → 2,83, Kante 2,75 → 2,75). Diese Kante bestimmt auch die Invalidierung.
2. `formations.js` ließ jede Kante am Preis des ersten Pivots beginnen. Eine waagrechte Kante begann damit schief (ABEV: 3,3296 → 3,35 statt 3,35 → 3,35).

**Korrektur:**
- Waagrecht ist nur die Oberkante des aufsteigenden und die Unterkante des absteigenden Dreiecks (beim Rechteck beide). Die Gegenkante ist die Linie durch die Pivots.
- Jede Kante beginnt auf ihrem eigenen Wert am ersten Pivot (`upperFrom`/`lowerFrom`).
- Die Klassifikation selbst ist unverändert.

**Neue Validatorregel** `LINIEN_PASSEN_NICHT_ZUM_TYP` (`validate-formations.mjs`):
- symmetrisch: oben fallend, unten steigend;
- aufsteigend: oben waagrecht, unten steigend;
- absteigend: unten waagrecht, oben fallend.

**Vorher/Nachher (5.657 Titel, Stand 26.10.2026, Daten mit dem Erzeuger gebaut):**

| | 1.3.0 | 1.4.0 |
|---|---|---|
| Regelkonform (alle Regeln inkl. Kanten) | 10.892 / 11.426 | 11.387 / 11.387 |
| Kanten passend: aufsteigend / absteigend / symmetrisch | 145/355 · 220/544 · 445/445 | 325/325 · 535/535 · 445/445 |
| nicht sichtbar am Erkennungstag, bestätigt oder invalidiert vor Erkennung | 0 | 0 |
| Spiegeltest aufsteigend / absteigend | – | 294/325 · 478/535 |

- **Screener:** 44 Titel ändern sich, nur in den fünf Formationsspalten.
  - Es fallen 31 aufsteigende (3 davon bestätigt) und 15 absteigende Dreiecke weg; neu kommt keines hinzu.
  - Grund: Mit der steigenden Unterkante bzw. fallenden Oberkante schließt der Kurs früher jenseits der Gegenkante. Nach den bestehenden Regeln ist das Muster dann invalidiert (bei Bruch vor der Erkennung nie gültig) und fällt aus der Liste.
  - Titel: ABEV (aufst. 2026-10-26), ALCYF (aufst. 2026-10-16), AUBN (aufst. 2026-09-29), BBDC (aufst. 2026-09-03), BML-P-J (abst. 2026-08-31), BML-P-L (aufst. 2026-10-15), BRIA (abst. 2026-10-05), BRK-A (aufst. 2026-09-21 bestätigt), BRK-B (aufst. 2026-09-21 bestätigt), BSAC (aufst. 2026-09-16), CLGN (aufst. 2026-10-02), CMS-P-B (aufst. 2026-10-16), CVBF (abst. 2026-10-20), EFC-P-C (abst. 2026-06-30), FEDU (aufst. 2026-10-19), FSHP (aufst. 2026-08-27), FUSB (abst. 2026-10-13, abst. 2026-10-05), GLAD (aufst. 2026-09-14), GRFS (aufst. 2026-10-16), HOLA (aufst. 2026-10-20), JBDI (aufst. 2026-09-03 bestätigt), KEY-P-L (aufst. 2026-07-27), KMB (abst. 2026-10-15), KNSA (aufst. 2026-10-26), MDLZ (abst. 2026-10-12), MGA (aufst. 2026-09-15), NBN (abst. 2026-09-15), OXLCO (aufst. 2026-10-02), PCG-P-C (aufst. 2026-10-01), PEB-P-H (aufst. 2026-07-20), RF-P-C (aufst. 2026-09-28), RGS (aufst. 2026-09-30), SB-P-D (aufst. 2026-09-10), SGU (abst. 2026-09-09), SPME (abst. 2026-09-29), SPOK (abst. 2026-09-18), SST (aufst. 2026-09-10), VBNK (abst. 2026-09-04), WBS-P-G (abst. 2026-08-05), WHLRD (abst. 2026-10-26), WRBY (aufst. 2026-08-06), WW (aufst. 2026-09-29), XRN-P-A (aufst. 2026-10-15, aufst. 2026-10-14), YETI (aufst. 2026-10-07).
- **Historische Evidenz** (`formation-evidence.json`, gleiche Stichprobe):

| Typ | n | bestätigt bis +20 | invalidiert bis +20 | Überrendite +20 (Mittel) | signifikant |
|---|---|---|---|---|---|
| aufsteigend | 2.292 → 2.240 | 40,2 % → 40,4 % | 62,1 % → 66,3 % | −0,23 % → −0,15 % | nein → nein |
| absteigend | 2.850 → 2.817 | 36,8 % → 36,5 % | 59,8 % → 62,2 % | +0,19 % → +0,18 % | nein → nein |
| symmetrisch, Rechteck | unverändert | | | | |

**Tests:**
- `technical-formations-validation.test.mjs`: konstruierte Kanten. Waagrechte statt steigender Unterkante und schief beginnende waagrechte Kante werden erkannt.
- `technical-formations-triangles.test.mjs`: Versionen.
- Daten bringt der PR nicht mit. Nach der Freigabe baut der Erzeuger `technical/data` neu.
