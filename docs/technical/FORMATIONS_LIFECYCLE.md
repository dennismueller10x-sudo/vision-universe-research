# Formationen – Lebenszyklus Erkennung, Bestätigung, Invalidierung

Fachmodelländerung der Technical-Formationen. Eigener Zweig `claude/technical-formations-lifecycle` auf Basis von `claude/technical-e3` (PR #934). Die Entscheidung über den Merge liegt beim Owner. Generierte Daten (`technical/data/*`) sind **nicht** neu gebaut. Das übernimmt der Erzeuger nach der Entscheidung.

| | vorher | nachher |
|---|---|---|
| `quant/engines/technical/formations.js` | `technical-formations-1.1.0` | `technical-formations-1.2.0` |
| `quant/engines/technical/ti/chart-patterns.js` | `ti-chart-patterns-1.0.0` | `ti-chart-patterns-1.1.0` (neuer, abschaltbarer Lebenszyklus-Modus; ohne ihn identisch zu 1.0.0) |

`ti/engine.js` (TI-Analyse, Szenarien, Replays) ruft `chart-patterns.js` ohne den neuen Modus auf. Ihre Ergebnisse ändern sich nicht. Nur der Versionsstring des Bausteins ist neu. Die Suite `ti-*.test.mjs` (108 Tests) ist unverändert grün.

## 1. Befund (Evidenzstudie E3a, Basis)

Die Studie `scripts/technical/world/formation-evidence.mjs` zählt jede Formation einmal, und zwar am ersten Bar k, an dem sie sichtbar war. Danach liest sie den Zustand bei k+20. Auf der Basis zeigten sich drei Schwächen:

1. Bestandsformationen (Dreiecke, Rechteck, Doppeltop/-boden, SKS, Flaggen, Tasse) wurden **nie invalidiert**. 44 bis 95 % von ihnen „entfielen“ einfach.
2. **Flaggen** wurden praktisch nie bestätigt (bullisch 0,5 %, bärisch 0 %).
3. **Kanäle und Keile** waren schon beim ersten Sichtbarwerden zu 61 bis 93 % bestätigt.

## 2. Ursachen

### 2.1 Bestandsformationen verschwinden statt zu enden

`ti/chart-patterns.js#analyze` leitet jede Formation an jedem Bar t neu aus den **letzten** bestätigten Pivots ab (`last(1)…last(5)`). Sobald ein neuer Pivot bestätigt wird, verschiebt sich das Fenster, und die Formation kann nicht mehr abgeleitet werden.

Genau dieser neue Pivot ist aber fast immer die **Voraussetzung** der Invalidierung. Beispiel Doppeltop: Damit der Kurs über das höhere Hoch steigen kann, muss er vom Tief nach dem zweiten Hoch um mindestens `max(3 ATR, 4 %)` steigen. Das bestätigt dieses Tief als Pivot, und zwar spätestens am Bar der Invalidierung. `resolve()` konnte `FAILED` deshalb nur in Ausnahmefällen melden.

Dazu kommt ein zweiter Fehler: `pack()` gab `failedIndex` nicht weiter. `invalidatedAt` blieb deshalb auch in diesen Ausnahmefällen leer, und die Studie zählte 0 % invalidiert.

Die Tasse mit Henkel verschwand außerdem innerhalb ihres Fensters. Ein tieferer Henkel verletzte die Geometriebedingung, statt die Invalidierung auszulösen.

### 2.2 Flaggen werden nie bestätigt

Die Bestätigungsregel lautet „Schluss über dem Mast-Hoch“. Die Flagge ist erst sichtbar, wenn das Mast-Hoch p1 als Pivot bestätigt ist. Dafür muss der Kurs um `max(3 ATR, 4 %)` gefallen sein.

Um danach über p1 zu schließen, muss er vom Flaggentief mindestens denselben Betrag steigen. Das bestätigt das Flaggentief als Pivot, und zwar **vor oder mit** dem Ausbruch. Damit sind die letzten beiden Pivots (Mast-Hoch, Flaggentief) kein Mast mehr, und die Flagge ist an dem Bar, an dem sie bestätigt würde, schon verschwunden. Die Bestätigung war also strukturell unerreichbar. Ein Test belegt das an einer konstruierten Reihe.

### 2.3 Kanäle und Keile bei Erkennung schon bestätigt

- **Kanal:** Die Erkennung nahm das Fenster der letzten fünf Swing-Punkte. Die Bestätigungsregel „mindestens fünf Swing-Punkte im Kanal“ war deshalb schon bei der Erkennung erfüllt (`inside = win.length + touches ≥ 5`). Erkennung und Bestätigung waren dieselbe Bedingung. Mit jedem weiteren Pivot entstand außerdem eine neue ID, also eine Neuerkennung desselben Kanals, wieder „bestätigt“.
- **Keil:** Auch hier bestand die Erkennung aus fünf Punkten. Der Ausbruch wurde ab dem Pivot-Bar des letzten Punkts gesucht, die Erkennung lag aber erst bei dessen Bestätigung. Im sich verengenden Keil ist die Restbreite oft kleiner als die Pivot-Schwelle `max(3 ATR, 4 %)`. Die Bewegung, die den fünften Punkt bestätigt, bricht dann schon die Keillinie.

## 3. Entwurf

### 3.1 Bestandsformationen: Anker statt Zustand (zustandslos, kausal)

`formations.js#legacy` wertet die Bestandsregeln nicht nur Stand t aus, sondern an **Ankern**. Ein Anker ist t selbst oder der Bar unmittelbar vor einer Pivot-Bestätigung (Skala 2 und 3, für die Tasse) in den letzten `open + LEGACY_KEEP` Bars. Für den Tageschart ist `open = barsPerYear/12 = 21`. Am Anker a = c−1 war das vorige Pivot-Fenster zum letzten Mal aktuell. Dort waren also genau die Formationen zuletzt sichtbar, die der Pivot bei c verdrängt.

Je Anker gilt:

- Die Geometrie wird Stand a bestimmt: Pivots mit `confirmedIndex ≤ a`, ATR, Toleranzen.
- Ausbruch und Invalidierung werden mit Schlusskursen bis t verfolgt: `Pat.analyze(Ctx.at(prep, a), { lifecycle: true, until: t })`. Das ist dieselbe `resolve()`-Logik wie bisher, nur mit dem Suchende t.
- Kausal ist das, weil a ≤ t gilt, nur Pivots mit `confirmedIndex ≤ a` zählen und nur Kurse ≤ t gelesen werden.
- Gleiche ID an mehreren Ankern: Der jüngste Anker gewinnt. Das ID-Schema `type@detectedDate` bleibt unverändert.

Verbleib in der Liste:

| Zustand | gelistet |
|---|---|
| unaufgelöst, Fenster noch aktuell (a = t) | wie bisher (bis `maxAge` = ⅓ Jahr) |
| unaufgelöst, abgelöst (a < t) | höchstens `open` = 21 Bars nach dem Anker, danach verfallen |
| bestätigt, abgelöst | `LEGACY_KEEP` = 10 Bars nach der Bestätigung |
| invalidiert | `LEGACY_KEEP` = 10 Bars nach der Invalidierung (wie Ausbrüche der neuen Regeln) |
| vor der eigenen Erkennung invalidiert | nicht gemeldet (war nie eine gültige Formation) |

Warum zustandslos? Ein gespeicherter Zustand je Titel bräuchte Persistenz und eine Reihenfolge der Läufe. Die Anker liefern dasselbe aus den Daten ≤ t, in jedem Lauf, im Browser wie im Erzeuger. Die Kosten liegen bei etwa 3 bis 6 zusätzlichen `Pat.analyze`-Aufrufen je Stand. Das ist billig gegenüber `Ctx.prepare` (siehe Abschnitt 6).

Regeländerungen im Lebenszyklus-Modus von `chart-patterns.js`:

- **`failedIndex`** wird weitergegeben. Damit ist `invalidatedAt` gesetzt.
- **Fehlausbruch:** Bestätigt und danach invalidiert. Beide Zeitpunkte bleiben erhalten (`confirmedAt` und `invalidatedAt`). Der Regeltext nennt jetzt auch den Fehlausbruch („Nach dem Ausbruch: Schluss mehr als 0,5 ATR zurück hinter die Ausbruchslinie“). Diese Regel galt in `resolve()` schon immer.
- **Dreiecke:** Die Invalidierung wird je Bar an der (schrägen) Gegenlinie gemessen statt am Linienwert des Stand-Bars. Der alte Wert wanderte mit t und lag nach der Spitze symmetrischer Dreiecke auf der falschen Seite. Das gab Schein-Invalidierungen (Übergang I→B bei 133 heutigen symmetrischen Dreiecken). Aufsteigende Dreiecke brechen nur nach oben aus, ein Schluss unter der Unterkante invalidiert sie. Bei absteigenden Dreiecken gilt das spiegelbildlich, so wie es die Regeltexte schon sagten. Bisher wurde ein Bruch der Gegenseite als bärischer bzw. bullischer „Ausbruch“ bestätigt. Symmetrische Dreiecke und Rechtecke bleiben beidseitig.
- **Geometrie eingefroren je Pivot-Fenster:** ATR und Kurs für Toleranzen und Mindesthöhen stammen vom Bestätigungsbar des jüngsten Pivots, nicht vom Stand-Bar. Sonst kam und ging dieselbe Formation mit der Tagesvolatilität. Das war ein zweiter, kleinerer Grund für „entfallen“.
- **Tasse mit Henkel:** Der Henkel wird Stand der Bestätigung des rechten Rands gemessen. Invalidiert ist die Tasse beim Schluss unter der zulässigen Henkeltiefe (rechter Rand − min(15 %, halbe Tassentiefe)). Bisher war die Grenze das jeweils aktuelle Henkeltief. Das war zu streng, sobald der Henkel noch wuchs, und zu spät, weil die Tasse vorher verschwand.

### 3.2 Flaggen

- Die Flagge wird am **ersten** Bar erkannt, an dem Mast, Rücklauf (15 bis 50 %), Mindestdauer (3 Bars) und die Bestätigung des Mast-Extrems erfüllt sind (`knownIndex`). Sie wird nicht an jedem Bar neu geprüft.
- Über die Anker überlebt sie die Bestätigung des Flaggentiefs. Der Ausbruch über das Mast-Hoch bestätigt sie.
- **Zeitgrenze** als explizite Invalidierung: Ohne Ausbruch bis 1,5 × Mastdauer (mindestens 6 Bars) nach dem Mast-Extrem gilt die Flagge als invalidiert. Bisher fiel sie in diesem Fall still aus der Liste, weil `since ≤ 1,5 × Mastdauer` Teil der Erkennung war.
- `detectedAt` ist der erste Bar, an dem die Flagge erkennbar war. Bei Flaggen kann das nach der Pivot-Bestätigung liegen. Das ID-Schema bleibt gleich.

### 3.3 Kanäle und Keile

- **Erkennung mit vier Swing-Punkten** (2 Hochs, 2 Tiefs, Skala 2), am Bar der Bestätigung des vierten Punkts. Die Struktur ist an diesem Bar verankert: Linien und ATR-Toleranzen bleiben die des Erkennungsbars, die ID bleibt stabil.
- **Kanal bestätigt**, wenn der **fünfte** Swing-Punkt im Kanal liegt (±0,5 ATR). Das ist die bisherige Regel „fünf Swing-Punkte im Kanal“, jetzt mit einem echten fünften Punkt. Zeitpunkt ist dessen Pivot-Bestätigung.
- **Kanal invalidiert** beim Schluss mehr als 0,5 ATR jenseits der Schutzlinie (wie bisher) oder wenn ein späterer Swing-Punkt außerhalb des Kanals liegt.
- **Keil bestätigt** wie bisher mit dem Schluss jenseits der Ausbruchslinie. **Invalidiert** durch einen Schluss oder ein späteres Swing-Extrem mehr als 0,5 ATR jenseits der Trendseite. Das „höchste Formationshoch“ taugt bei vier Punkten nicht mehr: Im steigenden Keil übertrifft das nächste Hoch das letzte planmäßig.
- **Fortsetzung statt Neuerkennung:** Eine Struktur ab Swing-Punkt i ist keine neue Formation, solange die gleichartige Struktur ab i−1 bei ihrer Erkennung noch lebte. Weitergeführt wird bis zu sechs Swing-Punkte nach den vier erkennenden. Aufgelöste bleiben `LEGACY_KEEP` Bars gelistet.

**Warum Keile trotzdem oft „bei Erkennung bestätigt“ sind (51 bis 55 %):** In fast allen dieser Fälle (Stichprobe 300 Titel: 43 von 45 % bzw. 56 von 59 %) liegt der Ausbruchsschluss am Bestätigungsbar des vierten Punkts oder davor. Im verengten Keil ist die Restbreite kleiner als die Pivot-Schwelle `max(3 ATR, 4 %)`. Dieselbe Bewegung bestätigt den vierten Punkt und bricht die Linie.

Früher erkennen ginge nur mit unbestätigten (sich noch ändernden) Pivots. Das wäre instabil und verletzte das Prinzip „nur bestätigte Swing-Punkte“. Das Etikett „bestätigt“ ist hier deshalb sachlich richtig: Die Formation ist erst zusammen mit ihrem Ausbruch erkennbar.

Die Alternative wäre, solche Keile wie die Wimpel gar nicht zu melden (`k < detectIdx → null`). Das ist eine Owner-Entscheidung und hier **nicht** umgesetzt.

## 4. Vorher/Nachher – Evidenzstudie (gesamtes Universum)

5.649 Titel, je 270 Tagesbars, Erkennungen 25.02.2026 bis 25.09.2026 (ein Marktjahr, kein voller Zyklus). Horizont k+20. Überrendite = richtungsbereinigte 20-Tage-Rendite minus Querschnittsmittel desselben Datums. Signifikanz: Bonferroni über alle Typen, α = 5 %.

„Bestätigt“ und „invalidiert“ können sich überschneiden (erst bestätigt, dann Fehlausbruch bzw. Kanalbruch). „Entfallen“ heißt: vor k+20 nicht mehr gelistet, ohne festgehaltene Bestätigung oder Invalidierung. „Offen“ heißt: bei k+20 noch erkannt, unaufgelöst.

Aufruf: `node scripts/technical/world/formation-evidence.mjs --out <Datei>`.

### Vorher – `technical-formations-1.1.0` (Basis `claude/technical-e3`), 91.891 Erkennungen, 101 s

| Typ | n | bestätigt bei Erkennung | bestätigt bis k+20 | invalidiert bis k+20 | entfallen | offen | Überrendite 20 T. (±95 %) | signifikant |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| ASCENDING_CHANNEL | 3.358 | 81,5 % | 46,7 % | 53,2 % | 0,1 % | 0,1 % | +0,69 % ± 0,55 | nein |
| ASCENDING_TRIANGLE | 2.882 | 27,1 % | 28,6 % | 0,0 % | 50,3 % | 21,0 % | −0,32 % ± 0,65 | nein |
| BEAR_FLAG | 2.230 | 0,0 % | 0,0 % | 0,0 % | 94,0 % | 6,0 % | +0,97 % ± 0,96 | nein |
| BEAR_PENNANT | 1.783 | 19,1 % | 35,0 % | 44,6 % | 19,1 % | 1,3 % | +1,52 % ± 1,16 | nein |
| BULL_FLAG | 1.198 | 0,2 % | 0,5 % | 0,0 % | 95,3 % | 4,2 % | +2,33 % ± 1,02 | ja |
| BULL_PENNANT | 790 | 9,6 % | 20,8 % | 57,7 % | 20,9 % | 0,6 % | +0,98 % ± 1,15 | nein |
| CUP_WITH_HANDLE | 55 (n<100) | 0,0 % | 0,0 % | 0,0 % | 94,5 % | 5,5 % | +2,42 % ± 1,66 | nein |
| DESCENDING_CHANNEL | 3.026 | 93,1 % | 60,0 % | 39,8 % | 0,2 % | 0,1 % | −1,00 % ± 0,95 | nein |
| DESCENDING_TRIANGLE | 3.458 | 29,0 % | 30,6 % | 0,0 % | 45,8 % | 23,6 % | +0,17 % ± 0,70 | nein |
| DOUBLE_BOTTOM | 2.775 | 15,5 % | 29,6 % | 0,0 % | 54,3 % | 16,1 % | −0,41 % ± 0,82 | nein |
| DOUBLE_TOP | 2.658 | 19,3 % | 31,3 % | 0,0 % | 49,4 % | 19,3 % | −0,64 % ± 0,61 | nein |
| FALLING_WEDGE | 1.940 | 60,7 % | 76,9 % | 14,2 % | 8,0 % | 0,9 % | −2,87 % ± 1,26 | ja |
| GAP_DOWN | 9.428 | 4,0 % | 33,5 % | 16,3 % | 60,5 % | 0,0 % | −0,38 % ± 0,25 | nein |
| GAP_UP | 9.804 | 2,0 % | 33,8 % | 18,3 % | 59,5 % | 0,0 % | −0,54 % ± 0,28 | ja |
| HEAD_AND_SHOULDERS | 1.256 | 26,8 % | 28,7 % | 0,0 % | 49,6 % | 21,7 % | −0,79 % ± 1,06 | nein |
| INVERSE_HEAD_AND_SHOULDERS | 1.351 | 33,6 % | 38,9 % | 0,0 % | 44,5 % | 16,7 % | −0,31 % ± 1,09 | nein |
| RANGE_BREAKOUT | 7.690 | 0,7 % | 55,9 % | 12,7 % | 31,5 % | 0,0 % | +0,17 % ± 0,20 | nein |
| RECTANGLE | 1.388 | 12,8 % | 22,8 % | 0,0 % | 56,5 % | 20,7 % | +0,45 % ± 0,86 | nein |
| RESISTANCE_BREAKOUT | 11.350 | 1,1 % | 48,2 % | 46,1 % | 5,7 % | 0,0 % | −0,23 % ± 0,37 | nein |
| RESISTANCE_TRENDLINE | 8.765 | 4,2 % | 57,7 % | 45,1 % | 4,5 % | 31,0 % | −0,04 % ± 0,46 | nein |
| RISING_WEDGE | 838 | 82,7 % | 92,2 % | 3,9 % | 3,3 % | 0,5 % | −0,16 % ± 1,14 | nein |
| SUPPORT_TRENDLINE | 9.278 | 4,5 % | 61,6 % | 46,0 % | 6,1 % | 25,6 % | +0,08 % ± 0,40 | nein |
| SYMMETRICAL_TRIANGLE | 2.486 | 45,7 % | 30,4 % | 0,0 % | 45,4 % | 24,2 % | +0,21 % ± 0,81 | nein |
| VOLATILITY_CONTRACTION | 1.765 | 1,5 % | 59,7 % | 23,4 % | 16,5 % | 0,4 % | +0,51 % ± 0,74 | nein |

### Nachher – `technical-formations-1.2.0` (dieser Zweig), 87.870 Erkennungen, 109 s

| Typ | n | bestätigt bei Erkennung | bestätigt bis k+20 | invalidiert bis k+20 | entfallen | offen | Überrendite 20 T. (±95 %) | signifikant |
|---|---:|---:|---:|---:|---:|---:|---:|:---:|
| ASCENDING_CHANNEL | 2.334 | 1,2 % | 23,3 % | 74,8 % | 0,0 % | 15,4 % | +0,08 % ± 0,69 | nein |
| ASCENDING_TRIANGLE | 2.394 | 9,2 % | 39,9 % | 61,2 % | 1,0 % | 21,6 % | −0,19 % ± 0,68 | nein |
| BEAR_FLAG | 2.060 | 1,3 % | 16,2 % | 65,8 % | 0,9 % | 23,8 % | +0,74 % ± 1,07 | nein |
| BEAR_PENNANT | 1.783 | 19,1 % | 35,0 % | 44,6 % | 19,1 % | 1,3 % | +1,52 % ± 1,16 | nein |
| BULL_FLAG | 1.136 | 0,7 % | 21,9 % | 78,1 % | 0,1 % | 11,6 % | +1,90 % ± 1,09 | ja |
| BULL_PENNANT | 790 | 9,6 % | 20,8 % | 57,7 % | 20,9 % | 0,6 % | +0,98 % ± 1,15 | nein |
| CUP_WITH_HANDLE | 57 (n<100) | 0,0 % | 3,5 % | 82,5 % | 0,0 % | 14,0 % | +2,15 % ± 1,66 | nein |
| DESCENDING_CHANNEL | 2.316 | 3,3 % | 27,9 % | 68,3 % | 0,0 % | 18,1 % | −0,17 % ± 0,97 | nein |
| DESCENDING_TRIANGLE | 2.851 | 9,1 % | 36,8 % | 59,8 % | 0,4 % | 21,4 % | +0,33 % ± 0,75 | nein |
| DOUBLE_BOTTOM | 2.693 | 11,6 % | 49,8 % | 48,3 % | 1,4 % | 29,8 % | −0,71 % ± 0,78 | nein |
| DOUBLE_TOP | 2.632 | 19,4 % | 58,7 % | 48,7 % | 0,5 % | 23,7 % | −0,70 % ± 0,62 | nein |
| FALLING_WEDGE | 1.466 | 51,4 % | 87,9 % | 4,2 % | 0,0 % | 7,9 % | −1,20 % ± 1,51 | nein |
| GAP_DOWN | 9.428 | 4,0 % | 33,5 % | 16,3 % | 60,5 % | 0,0 % | −0,38 % ± 0,25 | nein |
| GAP_UP | 9.804 | 2,0 % | 33,8 % | 18,3 % | 59,5 % | 0,0 % | −0,54 % ± 0,28 | ja |
| HEAD_AND_SHOULDERS | 1.270 | 25,4 % | 47,3 % | 30,5 % | 4,5 % | 42,1 % | −0,42 % ± 1,03 | nein |
| INVERSE_HEAD_AND_SHOULDERS | 1.357 | 28,8 % | 57,7 % | 38,3 % | 4,4 % | 32,4 % | +0,13 % ± 1,11 | nein |
| RANGE_BREAKOUT | 7.690 | 0,7 % | 55,9 % | 12,7 % | 31,5 % | 0,0 % | +0,17 % ± 0,20 | nein |
| RECTANGLE | 1.364 | 11,6 % | 59,0 % | 32,3 % | 1,7 % | 39,3 % | −0,10 % ± 0,87 | nein |
| RESISTANCE_BREAKOUT | 11.350 | 1,1 % | 48,2 % | 46,1 % | 5,7 % | 0,0 % | −0,23 % ± 0,37 | nein |
| RESISTANCE_TRENDLINE | 8.765 | 4,2 % | 57,7 % | 45,1 % | 4,5 % | 31,0 % | −0,04 % ± 0,46 | nein |
| RISING_WEDGE | 678 | 55,2 % | 83,6 % | 14,0 % | 0,0 % | 2,4 % | +0,60 % ± 1,61 | nein |
| SUPPORT_TRENDLINE | 9.278 | 4,5 % | 61,6 % | 46,0 % | 6,1 % | 25,6 % | +0,08 % ± 0,40 | nein |
| SYMMETRICAL_TRIANGLE | 2.269 | 58,0 % | 96,3 % | 53,5 % | 0,0 % | 3,8 % | −0,01 % ± 0,81 | nein |
| VOLATILITY_CONTRACTION | 1.765 | 1,5 % | 59,7 % | 23,4 % | 16,5 % | 0,4 % | +0,51 % ± 0,74 | nein |

Neue Regeln ohne Kanal/Keil (Trendlinien, Wimpel, Ausbrüche, Kontraktion, Lücken) sind bitgleich. Das prüft die Tabelle und der Abgleich in Abschnitt 5.

### Kernaussagen

- **Entfallen** (Bestandsformationen) sinkt von 44 bis 95 % auf 0 bis 4,5 %. **Invalidiert** steigt von 0 % auf 30 bis 83 %. Der Rest sind vor allem abgelöste, unaufgelöste Formationen nach Ablauf der 21 Bars. Am Rand des Studienfensters (Start bei Bar 120) können sie bei k schon älter sein.
- **Flaggen:** bestätigt bis k+20 jetzt 21,9 % (bullisch) und 16,2 % (bärisch) statt 0,5 % bzw. 0 %. Der Großteil endet invalidiert, meist an der Zeitgrenze. Die bullische Flagge bleibt der einzige Bestandstyp mit signifikanter Überrendite (+1,90 % statt +2,33 %).
- **Kanäle:** bestätigt bei Erkennung 1 bis 3 % statt 81 bis 93 %. Mit vier Punkten erkannte Kanäle halten seltener: 68 bis 75 % sind binnen 20 Bars invalidiert, 23 bis 28 % bestätigt.
- **Keile:** bestätigt bei Erkennung 51 bis 55 % statt 61 bis 83 %. Der Rest ist strukturell bedingt (Abschnitt 3.3). Der fallende Keil verliert seine signifikant negative Überrendite (−2,87 % → −1,20 %, nicht signifikant).
- **Symmetrisches Dreieck:** Ohne die Schein-Invalidierung an der Spitze ist es fast immer binnen 20 Bars bestätigt (96 %, beidseitige Regel). Es bleibt zu 58 % schon bei Erkennung bestätigt. Siehe Risiken.
- Weniger Erkennungen insgesamt (87.870 statt 91.891): Kanal-Fortsetzungen zählen nicht mehr als neue Formation, und die eingefrorene Geometrie lässt keine Formation mehrfach „neu“ auftauchen.
- Keine Bestandsformation hat eine belastbare Überrendite außer der bullischen Flagge. Die Änderung ist eine Korrektur des Zustandsmodells, kein Renditemodell.

## 5. Heutige Daten (Stand 23.10.2026, 5.649 Titel)

`node scripts/technical/world/build-screener.mjs --out <Ordner>` auf Basis und Zweig. Zählung aus `meta.json` (`formations`, ohne Invalidierte, so wie der Screener sie führt):

| Typ | Erkannt vorher | Bestätigt vorher | Erkannt nachher | Bestätigt nachher |
|---|---:|---:|---:|---:|
| ASCENDING_CHANNEL | 0 | 174 | 150 | 48 |
| ASCENDING_TRIANGLE | 111 | 127 | 189 | 55 |
| BEAR_FLAG | 89 | 0 | 132 | 53 |
| BULL_FLAG | 21 | 0 | 29 | 7 |
| CUP_WITH_HANDLE | 4 | 0 | 9 | 2 |
| DESCENDING_CHANNEL | 0 | 306 | 233 | 144 |
| DESCENDING_TRIANGLE | 102 | 128 | 190 | 214 |
| DOUBLE_BOTTOM | 128 | 95 | 200 | 101 |
| DOUBLE_TOP | 99 | 178 | 180 | 228 |
| FALLING_WEDGE | 28 | 188 | 69 | 97 |
| HEAD_AND_SHOULDERS | 55 | 85 | 102 | 117 |
| INVERSE_HEAD_AND_SHOULDERS | 51 | 33 | 103 | 33 |
| RECTANGLE | 75 | 54 | 128 | 94 |
| RISING_WEDGE | 3 | 126 | 7 | 25 |
| SYMMETRICAL_TRIANGLE | 25 | 169 | 28 | 308 |

Unverändert sind BEAR_PENNANT, BULL_PENNANT, GAP_UP, GAP_DOWN, RANGE_BREAKOUT, RESISTANCE_BREAKOUT, RESISTANCE_TRENDLINE, SUPPORT_TRENDLINE und VOLATILITY_CONTRACTION.

Abgleich je Formations-ID, heutiger Stand, **einschließlich Invalidierter** (E = erkannt, B = bestätigt, I = invalidiert, – = nicht gelistet). 10.976 Formationen vorher, 11.690 nachher:

| Typ | gelistet vorher | gelistet nachher | gleicher Zustand | Zustand gewechselt | nur vorher | nur nachher | Übergänge (vorher → nachher) |
|---|---:|---:|---:|---:|---:|---:|---|
| ASCENDING_CHANNEL | 415 | 311 | 18 | 63 | 334 | 230 | I→– 223, B→– 111, –→I 95, –→E 87, B→E 63, –→B 48 |
| ASCENDING_TRIANGLE | 382 | 362 | 147 | 88 | 147 | 127 | B→– 79, –→I 68, I→– 60, –→E 48, I→E 39, B→I 26, I→B 22, –→B 11, E→– 8, E→I 1 |
| BEAR_FLAG | 89 | 314 | 67 | 0 | 22 | 247 | –→I 129, –→E 65, –→B 53, E→– 22 |
| BULL_FLAG | 21 | 83 | 17 | 0 | 4 | 66 | –→I 47, –→E 12, –→B 7, E→– 4 |
| CUP_WITH_HANDLE | 4 | 15 | 4 | 0 | 0 | 11 | –→E 5, –→I 4, –→B 2 |
| DESCENDING_CHANNEL | 445 | 508 | 22 | 94 | 329 | 392 | B→– 215, –→B 144, –→E 142, I→– 114, –→I 106, B→E 88, I→E 3, B→I 3 |
| DESCENDING_TRIANGLE | 498 | 538 | 193 | 159 | 146 | 186 | I→– 102, I→B 100, –→I 69, –→E 63, –→B 54, B→– 40, I→E 30, B→I 28, E→– 4, E→I 1 |
| DOUBLE_BOTTOM | 239 | 415 | 226 | 1 | 12 | 188 | –→I 101, –→E 73, –→B 14, B→– 7, I→– 4, E→– 1, B→I 1 |
| DOUBLE_TOP | 365 | 559 | 301 | 7 | 57 | 251 | –→I 119, –→E 83, I→– 53, –→B 49, I→B 5, B→– 2, B→I 2, E→– 2 |
| FALLING_WEDGE | 298 | 187 | 37 | 22 | 239 | 128 | B→– 157, –→B 66, I→– 62, –→E 46, E→– 20, –→I 16, I→E 12, I→B 4, B→E 4, E→B 1, B→I 1 |
| HEAD_AND_SHOULDERS | 173 | 269 | 143 | 5 | 25 | 121 | –→E 51, –→I 36, –→B 34, I→– 16, B→– 5, I→B 4, E→– 4, B→I 1 |
| INVERSE_HEAD_AND_SHOULDERS | 94 | 169 | 83 | 0 | 11 | 86 | –→E 53, –→I 31, I→– 8, –→B 2, B→– 2, E→– 1 |
| RECTANGLE | 143 | 261 | 122 | 1 | 20 | 138 | –→E 57, –→B 47, –→I 34, I→– 10, B→– 6, E→– 4, B→I 1 |
| RISING_WEDGE | 132 | 37 | 4 | 1 | 127 | 32 | B→– 121, –→B 21, –→E 6, –→I 5, E→– 3, I→– 3, B→E 1 |
| SYMMETRICAL_TRIANGLE | 450 | 434 | 208 | 133 | 109 | 93 | I→B 133, I→– 90, –→I 65, –→B 24, B→– 18, –→E 4, E→– 1 |

Lesart der größten Posten:

- **„–→I“, „–→E“ bei Bestandsformationen:** Formationen, deren Fenster ein neuer Pivot abgelöst hat. Sie bleiben jetzt sichtbar, bis sie aufgelöst oder verfallen sind.
- **„I→–“:** Fehlschläge, deren Invalidierung älter als 10 Bars ist. Die Basis führte sie unbegrenzt, solange das Fenster bestand, und dazu ohne `invalidatedAt`.
- **„I→B“ bei Dreiecken:** die Schein-Invalidierung an der Spitze (Abschnitt 3.1).
- **Kanäle „B→–“ / „–→E“:** Die Basis meldete je Pivot einen „neuen“, sofort bestätigten Kanal. Jetzt gilt eine ID je Kanal, erkannt mit vier Punkten.
- **Keile „B→–“:** Ausbrüche älter als 10 Bars werden nicht mehr geführt. Wo die Basis-Keile aus fünf Punkten bestanden, ergeben vier Punkte teils keinen Keil (sondern einen Kanal oder nichts).

## 6. Laufzeit

| Lauf | vorher | nachher |
|---|---:|---:|
| `build-screener.mjs` gesamt (5.649 Titel, inkl. Evidenz) | 2:11 min | 2:20 min |
| davon Screener-Zeilen | 30 s | 30 s |
| davon Formations-Evidenz (`analyzeAt` an jedem Bar, ≈ 0,85 Mio. Aufrufe) | 101 s | 111 s |
| `formation-evidence.mjs` allein | 101 s | 109 s |
| `analyzeAt` am letzten Bar, alle Titel (inkl. `prepare`) | 11,9 s | 11,9 s |

Die Anker kosten etwa 8 bis 10 % in der Evidenzstudie und im Screener nichts Messbares.

## 7. Tests

`quant/tests/technical-formations.test.mjs` (17 Tests, vorher 12):

- **Doppeltop endet invalidiert:** Ein neuer Pivot zwischen Erkennung und Invalidierung ist nachgewiesen. Die Formation bleibt mit derselben ID lückenlos gelistet, ist ab dem ersten Schluss über dem höheren Hoch INVALIDATED mit `invalidatedAt` und genau `LEGACY_KEEP` Bars danach nicht mehr gelistet.
- **Bullische Flagge bestätigt:** erkannt nach dem Mast, bestätigt am ersten Schluss über dem Mast-Hoch, obwohl das Flaggentief vorher als Pivot bestätigt wurde (die Ursache aus 2.2).
- **Flagge ohne Ausbruch:** invalidiert an der Zeitgrenze, nie bestätigt.
- **Aufwärtskanal:** erkannt mit vier Punkten (DETECTED am Erkennungsbar), bestätigt mit der Bestätigung des fünften Swing-Punkts, eine ID über die ganze Laufzeit.
- **Steigender Keil:** neue Testreihe. Erkannt mit vier Punkten, am Bar vor dem Bruch DETECTED, danach CONFIRMED.
- **Kein Look-ahead im Lebenszyklus:** Die drei konstruierten Reihen werden an jedem Bar abgeschnitten und mit vergifteter Zukunft geprüft. Das Ergebnis ist identisch.
- **AAPL real:** Die Look-ahead-Prüfung läuft jetzt an 23 statt 5 Ständen (jeder 11. Bar zusätzlich), damit Anker und Nachlaufzeiten mitgeprüft werden.

Ergebnisse auf diesem Zweig:

| Suite | Ergebnis |
|---|---|
| `node --test quant/tests/technical-*.test.mjs technical/tests/*.test.mjs` | 171/171 |
| `node --test "quant/tests/*.test.mjs"` | 2.931/2.931 |
| `node --test quant/tests/ti-*.test.mjs` (TI unverändert) | 108/108 |
| `node scripts/quality/check-test-isolation.mjs` | keine Produktionsdatei verändert |
| `node scripts/technical/world/browser-qa.mjs` | 48/48 Prüfungen |

## 8. Offene Risiken

- **Mehr Formationen im Screener:** Abgelöste, aber offene Bestandsformationen bleiben bis zu 21 Bars sichtbar. Die Filter „Formation erkannt oder bestätigt“ liefern deshalb mehr Treffer (Doppeltop 277 → 408 aktive). Das ist gewollt, ändert aber die Trefferlisten.
- **Symmetrische Dreiecke** sind jetzt fast immer binnen 20 Bars bestätigt (beidseitige Regel) und zu 58 % schon bei der Erkennung. Das ist dieselbe Ursache wie bei den Keilen (Ausbruch vor der Bestätigung des letzten Punkts) und hier nicht geändert.
- **Keile:** 51 bis 55 % „bei Erkennung bestätigt“ bleiben strukturell (Abschnitt 3.3). Die Alternative „nicht melden“ ist Owner-Entscheidung.
- **Kanäle aus vier Punkten** sind schwächer: 68 bis 75 % werden binnen 20 Bars invalidiert. Das zeigt die Grenze der Formation ehrlich, kann aber als „Rauschen“ wahrgenommen werden.
- **Rest „entfallen“ bis 4,5 %** bei Bestandsformationen: vor allem abgelöste, unaufgelöste Formationen nach Ablauf der 21 Bars. Das ist ein Verfall ohne eigenen Zustand. Das Zustandsmodell kennt nur drei Zustände, deshalb ist es hier nicht als „invalidiert“ gemeldet (anders als die Flaggen-Zeitgrenze, die eine Regel ist).
- **Historie im Browser** (`Formations.history`, 252 Bars) ruft `analyzeAt` je Pivot-Bestätigung auf. Mit Ankern sind das mehr `Pat.analyze`-Aufrufe je Stand. Die Browser-QA (48/48) ist grün, eine eigene Zeitmessung im Browser fehlt.
- **Nach dem Merge:** Der Erzeuger muss `technical/data/*` neu bauen (`screener-v1.json`, `meta.json`, `formation-evidence.json`). Die Engine-Version im Datensatz wechselt auf `technical-formations-1.2.0`.
