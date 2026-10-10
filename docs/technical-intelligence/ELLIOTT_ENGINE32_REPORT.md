# Elliott Engine 3.2 — Mission III Report

Stand: 03.10.2026. Vorgänger: [ELLIOTT_ENGINE3_REPORT.md](ELLIOTT_ENGINE3_REPORT.md) (3.0/3.1, HOLDOUT-1/2). Vorab-Registrierung: [ELLIOTT_HOLDOUT3_PREREG.md](ELLIOTT_HOLDOUT3_PREREG.md). Unabhängige Prüfungen: [reviews/ELLIOTT_32_REDTEAM.md](reviews/ELLIOTT_32_REDTEAM.md), [reviews/ELLIOTT_GENERATOR_AUDIT.md](reviews/ELLIOTT_GENERATOR_AUDIT.md). Alle Zahlen stammen aus Dateien unter `quant/data/technical-intelligence/elliott-validation/` (Unterordner `taxonomy/`, `frontier/`, `holdout3/`, `corpus/`, `stability/`, `multires/`).

> **ENGINE QUALITY: FAIL.** Das Mission-III-Gate auf HOLDOUT-3 ist nicht bestanden: 9 von 16 Kriterien erfüllt, 7 verfehlt. Deshalb kein Prognose-Backtest. Elliott bleibt „Experimentelles Strukturmodell“ ohne Richtungsgewicht.

## 1. Was sich wirklich verbessert hat

* **Hard-Rule-Integrität:**
  * Das Red-Team fand in 3.2-Kandidaten ein Leck: Motivwellen korrektiver Muster liefen hinter ihren eigenen Start, besonders als laufende Wellen. Betroffen waren 9,4 % der Hauptzählungen in Layout A.
  * Das Leck ist behoben, und der unabhängige Prüfer prüft diese Regel jetzt mit.
  * HOLDOUT-3: **0 Verstöße** in allen ausgegebenen Zählungen, über rund 17.500 Fälle und Stufen.
* **Falsche Sicherheit und Enthaltung:**
  * Anwendbarkeit HOCH ist auf HOLDOUT-3 in 14,9 % der Fälle falsch (n = 148).
  * Engine 2.2 liegt auf denselben Layouts (VALIDATION) bei 97–98 % falscher Sicherheit, mit über 500 HOCH-Fällen je Layout.
  * Die Trennschärfe der Anwendbarkeit ist hoch (AUC 0,875). Unter HOCH+MITTEL stimmen 69,4 % der Hauptzählungen.
* **Stabilität auf echten Charts** (neues Zeitfenster bis 2016):
  * instabile Neuzuordnungen 0,43 % je Woche statt 0,87 % (2.2);
  * alle Neuzuordnungen 4,8 % statt 10,2 %.
* **Messung:**
  * Die Fehler-Taxonomie hat gezeigt, dass zwei Drittel der „groben Gradfehler“ auf HOLDOUT-2 falsche Generator-Wahrheiten waren.
  * Neue, realitätsnähere Generatoren C1, C2 (unabhängiger Autor) und C3 (echte Renditen) machen sichtbar, wie schwach die Engine außerhalb des alten Generators ist.
* **Produkt:** Engine 3.2 läuft jetzt in der Produktion (§11). Sie ist versioniert, als experimentell gekennzeichnet und enthält sich ehrlich.

**Was sich nicht verbessert hat:**
* Die Erkennungsquote auf realitätsnahen Daten bleibt deutlich unter dem Gate.
* Grobe Gradfehler: G5 32,5 % statt ≤ 25 %.
* Hohes Rauschen: 6,2 % statt ≥ 20 %.
* Laufende Muster: Wo die Engine HOCH meldet, ist sie immer falsch.
* Alle strukturellen Ranking-Änderungen für 3.2 wurden auf DEVELOPMENT oder VALIDATION **verworfen**. 3.2 unterscheidet sich von 3.1 durch Regelintegrität und ein neues Qualitätsmodell, nicht durch bessere Erkennung (§4).

## 2. Ursache G5 (Gradfehler)

Fehler-Taxonomie (`scripts/technical/elliott-failure-taxonomy.mjs`) über alle Fälle mit grobem Gradfehler. Zwei Achsen:
* **Geometrie:** Wo liegt die Hauptzählung relativ zu Kontext, Muster und Bestätigung?
* **Stufe:** Wo ging die wahre Lesart verloren: Pool, Suche, Bewertung oder Rang?

**HOLDOUT-2** (Layout B, Engine 3.1; n/l/m; 141 grobe Fehler):

| Befund | Anteil |
|---|---|
| Wahrer Ursprung im Kursbild **kein Extrem**: Zufallspfad-Kontext unterschreitet ihn um mehr als 3 % von Welle 1. Die Engine zählt am echten Extrem, also Elliott-korrekt, und wird als Fehler gewertet. | **92 / 141 (65 %)** |
| davon Geometrie „Start im Kontext“ | 54 |
| Echte Engine-Fehler bei gültigem Ursprung | 49 (G5 auf diesen Fällen: 15,3 %) |
| – Bestätigungsbewegung eingebaut (Muster + Bestätigung als eine Struktur, Bestätigung als eigene Struktur) | 34 / 49 |
| – Ursprung durch Anker-Vorauswahl verworfen | 12 |
| – Rang: Sieger hat bessere Richtlinien (+0,16) und Unterteilung (+0,12) | 17 |

**Layout C1** (rauschfrei, 175 Fehlgriffe):
* 130 Fehlgriffe sind reine Rangfehler.
* Der Sieger hat vor allem einen „dominanteren“ Ursprung (+0,18). Die Komponente Dominanz setzt voraus, dass der Musterursprung der markanteste Pivot im Rückblick ist.
* Layout A erfüllte das immer; C1 mit zufälligen Kontextschwüngen nicht. Das ist die vom Red-Team (H2) vermutete Generator-Kopplung, jetzt gemessen.

**Getestete Lösungswege (alle dokumentiert, alle verworfen):**

| Ansatz (Mission §) | Ergebnis DEVELOPMENT | Entscheidung |
|---|---|---|
| Hierarchie zuerst (§5, §8): Widerspruch, wenn eine Lesart eine stärkere abgeschlossene Struktur kreuzt bzw. als kleine Unterwelle nach ihr beginnt | G5 überall besser (z. B. C1 42,8 → 39,6 %, B 22,3 → 20,4 %), G1 auf A/B leicht besser | VALIDATION: C1, C2 (unabhängig) und C3 schlechter (C2 G1 44,7 → 42,7 %, G2 56,9 → 52,1 %) → **verworfen** |
| Hierarchie asymmetrisch | B G1 +2,9 Pp. | kontrahierende Dreiecke brechen ein (43 → 13 %) → verworfen |
| Zeit-Preis-Proportion als Rangkomponente (§4, §6) | ohne Wirkung (C1 19,9 → 19,5 %) | als Rangkomponente verworfen; trägt aber stark zur **Anwendbarkeit** bei (Koeffizient +3,2) → dort verwendet |
| Dominanz 0,2 bzw. 0 | C +0,6 bis +2 Pp., A/B −1,5 bzw. −17 Pp. | verworfen |
| Anker-Vorauswahl lockern (0,15 · W1, 2 ATR) | keine Änderung: die wahre Lesart verliert danach im Rang | verworfen |
| 4 statt 2 Alternativen | G2 C1 +3,4 Pp. | verworfen (Bedienbarkeit, die Wahrheit liegt meist weit hinten) |

Mehrere Zeitebenen (§7) und echte hierarchische Segmentierung (§9) wurden nicht gebaut. Der einfache Hierarchie-Test, eine Annäherung an „Eltern zuerst“, hat sich auf unabhängigen Daten nicht bewährt. Ein vollständiger Architekturwechsel ohne Evidenz widerspräche §97.

## 3. Ursache hohes Rauschen

* **Echte Wochencharts sind „hohes Rauschen“:**
  * Rauschrealismus (`noise-realism.json`): echte Aktien haben eine Wochen-Std. von 5,6 %, Überschusswölbung 2,8 und |r|-Autokorrelation 0,09.
  * Am nächsten kommen C1/C2/C3 mit hohem Rauschen (Std. 4,7–5,8 %, Wölbung 1,7–3,9).
  * Layout A „hoch“ hatte weder dicke Ränder (Wölbung 0) noch Cluster.
* **Das Muster ist oft gar nicht mehr sichtbar:**
  * Bei hohem Rauschen ist das Zielmuster auf den sichtbaren Kursen nur in 26–31 % der Fälle überhaupt regelkonform (HOLDOUT-3).
  * Gegenüber der Generator-Wahrheit ist die Aufgabe dort also meist nicht lösbar.
* **Verbleibende Fehler bei sichtbarem Muster:**
  * Die Engine verliert die wahre Lesart überwiegend schon in der Suche: verschobene Extreme, kurze Enden ohne erkennbare Unterteilung.
  * Im Rang gehen die Fälle vor allem über die Unterteilung verloren (+0,19 für den falschen Sieger).
* **Getestete Lösungswege, alle auf niedrigem Rauschen schlechter oder ohne Gewinn:**
  * Rauschschwelle der Unterteilung in ATR: 1,0 ATR → G1 56 → 46 %.
  * Rauschschwelle über robustes σ (zweite Differenzen): 2σ und 3σ.
  * Unterteilungsevidenz nach Rauschabstand zum Neutralwert ziehen: zwei Einstellungen.
  * Gröbere Pivot-Pools: 1,5 und 2,5 ATR; hohes Rauschen B +4/190, dafür Verluste bei niedrigem Rauschen.
  * Adaptiver Pool: der Rauschanteil σ/ATR trennt die Stufen nicht (B hoch 0,90 vs. mittel 0,94).
* **Ergebnis:** Rund 6 % Erkennung bei hohem Rauschen (HOLDOUT-3, beobachtbar gültig) bei 97 % Enthaltung. Die Engine erzwingt keine Zählungen (§18).
  * Der Nachweis einer **Methodengrenze** ist weiterhin nur indirekt.
  * Bei z ≈ 1–1,5 sind die Unterwellen nicht von Rauschen zu trennen. Ob ein Mensch mehr erkennt, ist ohne Expertenannotation offen (§10).

## 4. Änderungen Engine 3.2 (gegenüber 3.1)

1. **Regelintegrität:**
   * Jede Welle mit Unterteilung „M“ (Impuls 1/3/5, Zigzag A/C, Flat C, Doppel-Zigzag a/c) läuft nie hinter ihren Start, auch nicht laufend.
   * Orthodoxes Überschießen ist nur an Korrekturpositionen erlaubt, mit sichtbarer Flat- oder Dreieck-Unterteilung, nie bei laufenden Wellen (Red-Team 3.2 H1).
2. **Qualitäts- und Anwendbarkeitsmodell 3.2 (§19–§21):**
   * Logistisch, geeicht auf DEVELOPMENT A/B/C1/C3 (je Layout gleich gewichtet), nur abgeschlossene Muster.
   * Merkmale: Zählqualität, Klarheit, Rauschabstand z, Hierarchie-Widerspruch, Zeit-Preis-Proportion.
   * Das Strukturmehrdeutigkeits-Merkmal ist entfernt. Es bewertete Lesarten mit konkurrierender Alternative höher (Red-Team M2).
   * Schwellen: HOCH ab 0,75, MITTEL ab 0,55.
   * Grenze (`frontier/applicability-frontier-validation-3.2.0.json`), AUC abgeschlossener Muster auf VALIDATION: A 0,89 · B 0,86 · C1 0,86 · C2 0,85 · C3 0,87.
3. **Laufende Zählungen** sind höchstens NIEDRIG. Keine laufende Hauptzählung mit MITTEL/HOCH war richtig (Red-Team H3). Im Produkt erscheinen sie als „mögliche Welle“.
4. **Grad- und Etikett-Mehrdeutigkeit** gilt nicht mehr als „klar“ (Red-Team M3).
5. **Diagnosemerkmale:** Hierarchie-Widerspruch und Proportion werden immer berechnet und ausgegeben, gehen aber nicht in den Rang ein.
6. Version `elliott-3.2.0`, Regeln `elliott-rules-3.1.0`, Freeze `freeze-elliott-3.2.0.json` (Parameter-Hash dbd645034edc948f, Commit ae51cb54d).

Laufzeit: Median 16–18 ms je Korpusfall (HOLDOUT-3).

## 5. Entwicklungsergebnisse (VALIDATION, Seeds 10–19, Endstand)

| Layout | G1 strikt | G1 beobachtbar | G2 strikt | G5 strikt | G5 beobachtbar | falsche Sicherheit (HOCH) |
|---|---|---|---|---|---|---|
| A | 61,3 % | 67,2 % | 69,8 % | 17,1 % | 12,6 % | 3,4 % (n = 59) |
| B | 49,4 % | 59,3 % | 62,7 % | 28,8 % | 18,9 % | 21,4 % (n = 28) |
| C1 | 19,3 % | 28,9 % | 26,7 % | 45,6 % | 43,4 % | 34,6 % (n = 26) |
| C2 | 46,7 % | 59,4 % | 58,3 % | 26,3 % | 18,4 % | 9,1 % (n = 44) |
| C3 | 19,9 % | 28,4 % | 27,9 % | 44,8 % | 42,8 % | 26,9 % (n = 26) |

Engine 2.2 auf denselben C-Layouts (VALIDATION): G1 strikt 3,5 % / 4,9 % / 3,6 %, falsche Sicherheit 97,6–97,7 % (n > 500 je Layout).

## 6. Unabhängige Prüfungen

* **Generator-Audit (4 HOCH, 7 MITTEL):**
  * Behoben vor HOLDOUT-3:
    * beobachtbare Wahrheit mit sichtbarer Unterteilung; WXY und Dreifach-Zigzag waren vorher nie gültig (M5);
    * C2 schneidet zufällig statt am Extrem: frische Extreme am Schnitt 26–44 % statt etwa 100 % (H3);
    * Flat-B ≥ 90 % (M3);
    * strengere „abgeschlossen“-Regel für laufende Stufen (M6);
    * G15 nur auf sauberen C2-Negativfällen (H2).
  * Offen und benannt:
    * Mean-Reversion des Rauschens; Varianzverhältnis über 52 Wochen 0,1 statt 0,56 (M1);
    * C2 ist nur im Code unabhängig (M4).
* **Red-Team 3.2 (4 HOCH, 6 MITTEL, 4 NIEDRIG):**
  * Behoben: H1 (Regelleck), H3 (laufende Zählungen), M2 (Vorzeichenfehler), M3 (DEGREE-Klarheit), H2 (beobachtbare Wahrheit). Außerdem H4: C2 zieht das Rauschen nicht mehr neu, bis der Ursprung sichtbar ist.
  * Die NIEDRIG-Befunde zu verschachtelten Treffern sind behoben.
  * Offen und benannt:
    * M1: Die HOCH-Schwelle überträgt sich auf C schlechter.
    * M6: Das 3.2-Design nutzte HOLDOUT-2-Befunde; HOLDOUT-2 ist deshalb verbraucht. Die C3-Rauschquelle nutzt früher ausgewertete Titel.
  * Kein Lookahead in 140 Abschneide-Tests, keine weiteren Regel- oder Absturzbefunde in rund 23.000 Korpusfällen und 320 Fuzz-Reihen.
* Ein **zweites** Red-Team nach den Fixes vor dem Einfrieren fand nicht statt. Die Fixes folgten den Befunden 1:1 und wurden auf DEVELOPMENT und VALIDATION geprüft.

## 7. HOLDOUT-3 — Vorab-Registrierung

Siehe [ELLIOTT_HOLDOUT3_PREREG.md](ELLIOTT_HOLDOUT3_PREREG.md):
* committet vor dem Einfrieren (ae51cb54d), Freeze danach (2583e9fcf), dann genau ein Lauf;
* C1/C2/C3, Seeds 60–79, fünf Stufen;
* echte Charts: HOLDOUT-Emittenten, neues Fenster bis 30.12.2016, Zeitebenen-Titel Rang 121–240.

## 8. HOLDOUT-3 — Ergebnis (einmal ausgewertet, unverändert)

`holdout3/holdout3-result-v32.json`, gepoolt über C1, C2, C3:

| # | Kriterium | Schwelle | Ergebnis | |
|---|---|---|---|---|
| G1 | Regelverstöße (alle Ausgaben) | 0 | **0** | ✅ PASS |
| G2 | Hauptzählung (beobachtbar, n/l/m) | ≥ 45 % | **42,9 %** (strikt 29,6 %) | ❌ FAIL |
| G3 | Haupt oder Alternative | ≥ 60 % | **55,9 %** (strikt 38,2 %) | ❌ FAIL |
| G4 | Grad exakt | ≥ 50 % | **43,6 %** (strikt 30,4 %) | ❌ FAIL |
| G5 | Grober Gradfehler | ≤ 25 % | **32,5 %** (strikt 38,1 %) | ❌ FAIL |
| G6 | Flats | ≥ 25 % | 56,7 % (n = 876) | ✅ PASS |
| G7 | Truncation | ≥ 25 % | 43,1 % (n = 248) | ✅ PASS |
| G8 | Dreiecke | ≥ 25 % | 59,5 % (n = 504) | ✅ PASS |
| G9 | Hohes Rauschen | ≥ 20 % | **6,2 %** (strikt 1,6 %) | ❌ FAIL |
| G10 | Falsche Sicherheit HOCH | ≤ 20 % | 14,9 % (n = 148) | ✅ PASS |
| G11 | Instabile Neuzuordnungen (echt) | ≤ 2.2 | 0,43 % vs. 0,87 % | ✅ PASS |
| G12 | Neuzuordnungen (echt) | ≤ 2.2 | 4,82 % vs. 10,23 % | ✅ PASS |
| G13 | Zeitebenen Woche/Tag | ≥ 70 % | **60 %** (n = 85) | ❌ FAIL |
| G14 | Enthaltungsqualität | AUC ≥ 0,75 und ≥ 65 % | AUC 0,875 · 69,4 % | ✅ PASS |
| G15 | Negativfälle (C2) | ≤ 5 % | 0,4 % | ✅ PASS |
| D2 | Laufende Zählungen, falsche Sicherheit | ≤ 30 % | **100 %** (24 von 24 HOCH falsch) | ❌ FAIL |

Je Layout (beobachtbar; strikt in Klammern):

| | G2 | G3 | G4 | G5 | G9 | falsche Sicherheit |
|---|---|---|---|---|---|---|
| C1 | 34,9 % (22,6) | 47,1 % | 35,8 % | 39,5 % (43,9) | 4,7 % | 22,9 % (n = 35) |
| C2 (unabhängig) | **57,1 %** (43,1) | **70,7 %** | **57,6 %** | **21,6 %** (27,4) | 10,2 % | 8,6 % (n = 81) |
| C3 (echte Renditen) | 34,6 % (23,1) | 47,6 % | 35,3 % | 38,1 % (43,0) | 3,0 % | 21,9 % (n = 32) |

Weitere Werte:
* Anteil beobachtbar gültiger Fälle: n/l/m 69,5 %, hohes Rauschen 27,7 %.
* Laufende Muster richtig erkannt (D1): 12,7 %.

**D2 im Detail:** Die laufende Zählung selbst ist auf NIEDRIG gedeckelt. Alle 24 HOCH-Fälle sind Fälle, in denen die Engine ein Muster für **abgeschlossen** hält, das in Wahrheit noch läuft (z. B. drei Wellen eines Impulses als fertiges Zigzag). Das ist echte Elliott-Mehrdeutigkeit, die die Engine mit Sicherheit falsch auflöst.

**Echte Charts:** Nur 39 der 100 vorab ausgewählten Reihen haben vor 2016 genug Historie. Die Stichprobe ist kleiner als geplant und wird so berichtet.

## 9. Gate-Urteil

**ENGINE QUALITY: FAIL** (G2, G3, G4, G5, G9, G13, D2).
* Kein Gate wurde nachträglich verändert.
* Eine neue Engine braucht einen neuen Holdout (HOLDOUT-4).
* Kein Prognose-Backtest.

## 10. Vorher/Nachher 2.2 · 3.0 · 3.1 · 3.2

### Synthetische Fälle

* Gleiche Fälle (VALIDATION, Seeds 10–19, C1/C2/C3 gepoolt), gleicher Auswerter und gleicher Gate-Code wie HOLDOUT-3.
* 3.0.0 und 3.1.0 laufen aus ihren Freeze-Commits.
* Datei: `engine-comparison-validation-C.json`.
* Muster und Grad: beobachtbar, abgeschlossen, Rauschen n/l/m; strikte Werte in Klammern.

| Kennzahl | 2.2 | 3.0.0 | 3.1.0 | **3.2.0** |
|---|---|---|---|---|
| Regelverstöße (unabhängiger Prüfer, neue Motivwellen-Regel) | 5 | 3.399 | 1.784 | **0** |
| Hauptzählung | 5,5 % (3,8) | 20,6 % (15,0) | 37,8 % (27,1) | **39,9 %** (28,6) |
| Haupt- oder Alternativzählung | 6,7 % | 37,8 % | 51,7 % | **52,9 %** |
| Grad exakt | 5,8 % | 21,2 % | 39,0 % | **41,1 %** |
| Grober Gradfehler | 58,1 % | 41,1 % | **31,3 %** | 34,1 % |
| Flats (Haupt+Alt) | 13,9 % | 44,3 % | 52,6 % | **53,8 %** |
| Truncation | 0 % | 17,5 % | 29,2 % | **30,8 %** |
| Dreiecke | 0,8 % | 48,8 % | 60,0 % | **62,7 %** |
| Hohes Rauschen | 2,3 % | 5,2 % | 8,1 % | **8,5 %** |
| Falsche Sicherheit (HOCH) | 97,2 % (n = 1.696) | 33,5 % (n = 328) | 31,0 % (n = 290) | **20,8 %** (n = 96) |
| Präzision unter HOCH+MITTEL | 2,9 % | 41,2 % | 50,6 % | **69,6 %** |
| Trennschärfe Anwendbarkeit (AUC) | 0,47 | **0,92** | 0,86 | 0,88 |
| Enthaltung (abgeschlossen) | 23 % | 76 % | 72 % | 88 % |
| Laufende Muster erkannt (D1) | 3,3 % | 11,0 % | 10,9 % | 10,9 % |
| Laufende Muster, falsche Sicherheit HOCH | 96,9 % (n = 1.930) | 100 % (n = 153) | 79,6 % (n = 186) | 100 % (n = 22) |
| Laufzeit Median je Analyse | 1 ms | 29 ms | 28 ms | 27 ms |

### Echte Wochencharts (Neuzuordnungen je Woche)

| | 2.2 | 3.0.0 | 3.1.0 | 3.2.0 |
|---|---|---|---|---|
| Fenster bis 2026 (HOLDOUT-1/2): gesamt / instabil | 11,4 % / 1,00 % | 6,4 % / 0,64 % | 5,1 % / 0,55 % | – |
| Fenster bis 2016 (HOLDOUT-3): gesamt / instabil | 10,2 % / 0,87 % | – | – | **4,8 % / 0,43 %** |
| Anwendbarkeit HOCH | 63 % bzw. 57 % der Wochen | 4,6 % | 2,5 % | 0,5 % |

### Lesart

3.2 ist gegenüber 3.1 vor allem **ehrlicher**:
* keine Regelverstöße;
* falsche Sicherheit 31 % → 21 %;
* Präzision unter HOCH+MITTEL 51 % → 70 %.

Die Erkennung ist nur leicht besser, die Gradfehler sind leicht schlechter (31,3 → 34,1 %). Die neue Motivwellen-Regel verwirft auch Lesarten, die 3.1 zufällig richtig hatte.

Der Erkennungsverzug wurde für 3.2 nicht neu gemessen. Hysterese und Suche sind gegenüber 3.1 unverändert; 3.0.0 lag bei 3 bzw. 4 Bars.


## 11. Produktmigration (Track C)

**Entscheidung (§33/§34):** Produktion läuft auf **Engine 3.2.1**, als „Experimentelles Strukturmodell“ ohne Richtungsgewicht. Begründung:
* 3.2 ist 2.2 in jeder gemessenen Dimension überlegen: Regeltreue, Muster, Grad, falsche Sicherheit, Stabilität und Enthaltung (§10).
* Es gibt keine bekannten Regel-Bugs.
* Das UI kennzeichnet den experimentellen Status.
* Es gibt keinen Prognoseanspruch.

Das verfehlte Quality-Gate spricht nicht gegen die Migration. Es spricht gegen einen Prognose-Test.

| Punkt | Stand |
|---|---|
| Methodik | `PRODUCT_METHODOLOGY = { elliottEngine: "v3" }` in `scripts/technical/lib/ti-product.mjs`, gemeinsam für Build und Drift-Prüfung |
| Engine-Version | `elliott-3.2.1` = 3.2.0 + Datenlage-Fix für Tagesreihen (Wochenenden zählten als „Lücken“; alle Tagesreihen enthielten sich fälschlich). Auf 3.140 Wochen-Validierungsfällen identisch mit 3.2.0 (`freeze-elliott-3.2.1.json`). |
| Neu berechnet | alle Titel: 5.292 Wochen- und 5 Tagesanalysen, 623 Shards, `index.json.gz`, `discover-rows.json`, Regelkatalog, Methoden-Evidenz, Replay-Schnappschüsse für Indexmitglieder (26 Schritte, Persistenz-Replay 52 Schritte je Titel) |
| API (§37) | je Titel `versions: { api, analysis, resultSchema, elliott, ruleSet, elliottStatus, dataAsOf }`; `meta.json` mit `elliott: { engine, status, confluenceWeight: 0, report }` (`API_V3_MIGRATION.md`) |
| Build | parallel in Worker-Threads (4 Kerne): 4.032 s (3.2.0) bzw. 3.678 s (3.2.1, 61 min); vorher seriell auf 2.2, kein Vergleichslauf |
| Datenmenge | 52 MB (vorher 49 MB) |
| Alerts | Die Migration erzeugte 132 scheinbare Ereignisse bei gleichem Datenstand (Zonenwechsel aus der Methodik, nicht aus Kursbewegung). Zurückgesetzt auf den Ausgangszustand mit Hinweis, damit Nutzer keine Fehlalarme sehen. |
| Drift-Prüfung (§38) | Build und Neuberechnung identisch für **106 Titel** (`verify-technical-intelligence.mjs --every 50`, vorher 18) |

**Produkt-Regression 2.2 → 3.2** (`product-regression-v22-to-v32.json`, alle 5.292 Titel):

| Segment | n | Elliott-Zählung geändert | Elliott enthält sich (vorher → nachher) | Szenario-Vorlage geändert | Ungültig-Linie geändert | Zielzone 1 geändert |
|---|---|---|---|---|---|---|
| alle | 5.292 | 95 % | 13 % → 96 % | 4,6 % | 5,6 % | 19,5 % |
| Large Cap (Indexmitglied) | 503 | 96 % | 10 % → 98 % | 6,8 % | 7,8 % | 21,1 % |
| volatile Technologie | 36 | 97 % | 8 % → 100 % | 0 % | 5,6 % | 11,1 % |
| defensiv | 57 | 97 % | 5 % → 95 % | 10,5 % | 12,3 % | 17,5 % |
| Small Cap / Nicht-Index | 4.789 | 95 % | 14 % → 96 % | 4,4 % | 5,4 % | 19,3 % |
| verrauscht | 545 | 95 % | 18 % → 96 % | 1,8 % | 6,1 % | 20,4 % |
| Trend | 2.929 | 96 % | 13 % → 96 % | 6,4 % | 5,8 % | 19,8 % |
| seitwärts | 378 | 93 % | 20 % → 97 % | 3,4 % | 1,6 % | 10,8 % |

Lesart:
* Elliott meldet jetzt fast überall „keine verlässliche Zählung“. Anwendbarkeit HOCH bei 35 statt 2.998 Titeln, MITTEL bei 178 statt 1.591.
* Szenarien, Ungültig-Linien und Einstiegszonen ändern sich nur bei rund 2–6 % der Titel; Elliott hat Konfluenzgewicht 0. Zielzonen ändern sich häufiger (Elliott-Projektionen fließen in die Zonen-Konfluenz ein).
* **Auffälligkeit:** Alle 11 Indexmitglieder mit Elliott-Anwendbarkeit über NIEDRIG sind abgeschlossene WXY-Korrekturen. Das ist ein Hinweis auf eine Schieflage des Anwendbarkeitsmodells zugunsten abgeschlossener Kombinationen und ist als Fehlerquelle für HOLDOUT-4 vermerkt.

## 12. UI (Track D)

**Neu im Chartbild:**

| Element | Missionspunkt | Inhalt |
|---|---|---|
| Elliott-Struktur-Karte | §41, §44, §47, §57 | „Mögliche Welle 4 · Impuls“; Modellstatus „Experimentell“, Strukturklarheit, Lesarten („Mehrere gültige Lesarten“). **Falsch, wenn:** Schlusskurs unter/über X. Hinweis: „Hauptlesart = derzeit bevorzugte Interpretation, nicht die richtige Zählung“. |
| Lesart-Umschalter | §45, §56 | Hauptlesart/Alternative im Chart (Alternative violett), nie beide gleichzeitig |
| „Was die Szenarien unterscheidet“ | §46 | ein Satz mit beiden Grenzen |
| Marktstruktur statt leerer Stelle | §98–§100 | bei Enthaltung: übergeordneter und mittelfristiger Trend, nächste Unterstützung und nächster Widerstand |
| Wellen-Inspektor | §60 | Status, Rücklauf, Ungültig-Grenze, höherer Grad, Zahl der Alternativen, Modellversion |
| Zeitreise | §61 | Marken für jeden Lesartwechsel auf der Leiste; Liste der Wechsel mit Grund |
| Profi-Ansicht | §35 | Engine-, Regel- und Datenversion aus `versions` statt fest im Code |
| Chart | UI-Audit | Wellenmarken weichen einander aus; Bedienleiste bricht um; Desktop-Hero zweispaltig, damit der Chart im ersten Bildschirm liegt |

**Bildschirm-Audit** (`scripts/technical/chartbild-ui-audit.mjs`; echte Daten, Chromium):
* 9 Bildschirme × 4 Breiten (390, 430, 768, 1280) × 2 Titel: AAPL (Tag, Elliott enthält sich) und ABBV (Woche, Elliott MITTEL), insgesamt 72 Aufnahmen.
* Ausgewählte Aufnahmen: `docs/technical-intelligence/ui-audit/` (Endstand nach dem Neubau mit 3.2.1: Chartbild-Bildschirme ohne Befund; offen nur Aktienseite: „Kursverlauf“-Überschrift abgeschnitten, 404 bei ABBV).

| Breite | Ergebnis | Befunde | Behoben |
|---|---|---|---|
| 390 | kein horizontaler Überlauf, keine Konsolenfehler | Bedienleiste abgeschnitten („Wellen a…“); Wellenmarken der Alternative überlappten; Zurück-Link 38 × 38 px; doppelter Bedingungssatz; Rücklauf im Inspektor doppelt; Tagesreihen mit falscher Enthaltungsbegründung | alle |
| 430 | wie 390 | wie 390 | alle |
| 768 | kein Überlauf | – | – |
| 1280 | kein Überlauf | Chart erst unterhalb der ersten Bildschirmhöhe | zweispaltiger Hero |

Weitere Werte:
* Ladezeit Chartbild (Median, lokal, inklusive Replay-Schnappschüsse): rund 0,5 s, höchstens 0,74 s.
* Offen: Die Aktienseite (Teaser) lädt für ABBV eine fehlende Ressource (404); das betrifft nicht die Chartbild-Daten.

**Design-Selbstkritik (§92):**
* *Stärkster Bildschirm:*
  * Chartbild „Einfach“ auf 390 px: großer Ausblick, zwei getrennte Ebenen („Was der Chart zeigt“ / „Was die Historie nahelegt“), Szenario-Tabs direkt über dem Chart, Zonen beschriftet.
  * Die Ungültig-Linie ist sichtbar, aber nicht dominant. Die Elliott-Karte sagt ehrlich „mögliche“ bzw. „keine verlässliche Zählung“.
* *Schwächster Bildschirm:*
  * Profi-Ansicht: Sie ist vollständig, aber textlastig und wenig hierarchisch (Tabellen und Listen hintereinander).
  * „Struktur: Klar“ (Einigkeit der Verfahren) und „Mehrere gültige Lesarten“ (Elliott) stehen nah beieinander und können verwirren.
* *Verbleibende UI-Schulden:*
  * Profi-Ansicht visuell gliedern (Sektionen Zählung, Grad, Regeln, Richtlinien, Fibonacci, höherer Grad, Historie, Erkennungsverzug, Evidenz, Quellen als eigene Karten).
  * Szenario-zuerst-Darstellung (§43) mit sprechenden Titeln („Fortsetzung“, „Korrektur dehnt sich aus“, „Umkehr höheren Grades“) statt Haupt/Alternative/Rand.
  * Zeitreise-Leiste mit Datumsmarken auch für Gradwechsel.
  * Tablet-Layout ist eine gestreckte Mobilansicht.
* Ob das Produkt „Premium“ ist, entscheidet am Ende ein Nutzertest. Dieser Bericht bewertet nur gegen die Kriterien aus §51.

## 13. Expertenvalidierung

* **Status: BLOCKIERT.** Es liegen keine Annotationen echter Elliott-Praktiker vor. Die Engine ist nicht expert-validiert und heißt nirgends so.
* **Vorbereitet:**
  * Werkbank mit **Blindmodus** (`quant/research/elliott-workbench/index.html?blind=1`): Engine-Zählung, Alternativen, Historie und Referenzen sind verborgen, bis die eigene Zählung gespeichert ist. Pflichtfeld Person.
  * Neue Felder für Wellenenden, Ungültig-Grenze, Richtung und Status.
  * Auswertung `scripts/technical/elliott-expert-agreement.mjs`:
    * Engine ↔ Mensch: Muster, Wellenenden-F1, Grad über das Spannenverhältnis, Richtung, Ungültig-Niveau, Enthaltung.
    * Mensch ↔ Mensch: paarweise und Krippendorffs α.
    * Nur MANUAL_VU_REVIEW und EXTERNAL_PRACTITIONER zählen; AUTOMATED wird nie als Expertenurteil gezählt.
  * Ergebnisdatei derzeit `status: BLOCKED`.
* Praktiker-Referenzen (Mission II) bleiben ungeprüfte Suchzusammenfassungen.

## 14. Prognose-Evidenz

* Nicht neu geprüft: Das Quality-Gate ist nicht bestanden (§31, §105).
* Stand aus Mission II: kein Prognosebeitrag des Elliott-Labels (H1–H5, H7 nicht bestätigt); Konfluenzgewicht 0.

## 15. Abschlussstatus

| | Status |
|---|---|
| ENGINE QUALITY | **FAIL** (HOLDOUT-3: G2–G5, G9, G13, D2 verfehlt) |
| PRODUCT MIGRATION | **DONE** (Engine 3.2.1 in Produktion, versioniert, Drift-Prüfung 106 Titel OK) |
| UI AUDIT | **ISSUES** (alle gefundenen Mobil- und Desktop-Probleme behoben; offen: Profi-Ansicht-Hierarchie, szenario-zuerst-Titel, 404 auf der Aktienseite) |
| PROGNOSIS TEST | **NOT RUN** (Gate nicht bestanden) |

