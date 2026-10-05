# Elliott-Impuls-Forensik (Mission VI, Track B)

Stand: 05.10.2026. Grundlage: elliott-3.2.2, unverändert. Zum ersten Mal mit optionalen Forensik-Zählern; die Ausgabe ist mit und ohne Zähler byte-identisch, geprüft auf 33 Fällen, im Replay des versiegelten Laufs und in Tests.

> **PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH.**
>
> **Datengrundlage:**
> * 35 geöffnete Practitioner-Fälle: DEVELOPMENT 26, VALIDATION 9. Die 43 Holdout-Fälle bleiben versiegelt; ihre Zeilen werden vor dem Lesen verworfen (`openedCases()`).
> * Die Holdout-Quelle Tiedje ist deshalb in keiner Zahl dieses Berichts enthalten.
> * Synthetischer Korpus: nur DEVELOPMENT bzw. einmal VALIDATION.

Daten in `quant/data/technical-intelligence/elliott-forensics/`:

| Datei | Inhalt |
|---|---|
| `impulse-forensics-3.2.2.json` | Basis und Ablationen |
| `impulse-taxonomy.json` | Taxonomie, Teilmengen |
| `variants-*.json` | Varianten |

Werkzeuge liegen unter `scripts/technical/elliott-forensics/`. Die Sichtprüfung je Fall ermöglicht `quant/research/elliott-impulse-debug/`.

## 1. Kernbefund

**In allen 25 auswertbaren Practitioner-Impulsfällen erzeugt VU intern gültige Impulslesarten.** Keine harte Regel verhindert den Impuls. Er wird aber nie Haupt- oder Alternativzählung. Er verliert im Rang.

Bei 12 der 25 Fälle gibt es eine **praktikernahe** Impulslesart: gleiche laufende Welle und gleiche Richtung. Ihr Median-Rang ist 111. Nach der Mission-VI-Taxonomie (§37) ist das „VALID INTERNAL COUNT, PRODUCT ABSTAINS“ und „CANDIDATE RANKED TOO LOW“, **nicht** „no valid count“.

## 2. Taxonomie (§4, §5)

| Kategorie · dominante Rangkomponente | n | Anteil | HIGH | MEDIUM | 1D | 1W | Quellenfamilien |
|---|---:|---:|---:|---:|---:|---:|---|
| gültiger Impuls, zu niedrig gerankt · **Unterteilung** | 15 | 60 % | 2 | 13 | 12 | 3 | ewf 2, cryptoknee 3, thefifthwave 5, yuchaosng 5 |
| gültiger Impuls, zu niedrig gerankt · **Vollständigkeit** | 6 | 24 % | 3 | 3 | 1 | 5 | ewf 4, cryptoknee 2 |
| gültiger Impuls, zu niedrig gerankt · **Dominanz des Ursprungs** | 4 | 16 % | 2 | 2 | 0 | 4 | ewf 4 |
| keine gültige Impulslesart · Pivots fehlen · Regel verworfen | 0 | 0 % | – | – | – | – | – |

**Rangabstand Sieger minus Impulslesart** (gewichtet, Mittel über 25 Fälle):

| Komponente | Abstand | Klasse (§7) |
|---|---:|---|
| Unterteilung | 0,146 | Definitionsevidenz (5 vs. 3), gemessen mit einem VU-Klassifikator im Skalenraum |
| Vollständigkeit | 0,067 | VU-Heuristik |
| Dominanz | 0,054 | VU-Heuristik |
| Musterprior | −0,040 | VU-Heuristik; begünstigt den Impuls |

**Gewinner:**
* abgeschlossene W-X-Y 16;
* Dreieck 9;
* Zickzack 5;
* Flat 3.

## 3. Spur von den Kursen bis zur Ausgabe (§6, §31–§36)

**Suche (Pivots → Pfade).** Impulspfade enden bei der Verlängerung aus diesen Gründen (Anteile an 65.565 Abbrüchen):

| Abbruchgrund | Anteil | Klasse (§7) |
|---|---:|---|
| Ende hinter dem Extrem an Motivposition | 38,5 % | VU-Umsetzung des orthodoxen Endes (EWP Kap. 2) |
| Ende hinter dem Extrem ohne orthodoxe Unterteilung | 29,1 % | VU-Umsetzung des orthodoxen Endes |
| Ähnlichkeitsschranke | 16,7 % | VU-Heuristik (NEoWave); laut Quellenmatrix keine VU-Regel |
| W4 im Gebiet von W1 | 6,6 % | klassische Regel |
| W2 hinter dem W1-Ursprung | 3,2 % | klassische Regel |
| Motivwelle hinter ihrem Start (Extrem innerhalb der Welle) | 2,9 % | klassische Regel an Intra-Extremen |
| W3 nicht über W1 hinaus | 2,0 % | klassische Regel |
| Ursprung zu schwach | 0,6 % | VU-Heuristik |
| W3 kürzeste | 0,2 % | klassische Regel |

**Gefunden** wurden trotzdem 1.268 Impulslesarten:
* 206 abgeschlossen;
* 201 laufend;
* 861 laufend mit innerem Rücksetzer.

**Vorauswahl:** Die Impulslesarten liegen innerhalb der 500 voll bewerteten Kandidaten. In der Bewertung wird keine verworfen.

**Ablationen auf denselben Fällen** (nur Diagnose, keine Produktänderung):

| Variante | Impuls Hauptzählung | Impuls Alternative |
|---|---:|---:|
| Suchbudget × 10 | 0 | 2 |
| Vorauswahl × 4 | 0 | 0 |
| ohne Ursprungsschranken | 0 | 0 |
| Pool 0,5 / 2,0 ATR | 0 | ≤ 1 |
| **ohne Ähnlichkeitsschranke** | **3** | **9** |

**Mehrere Pivot-Skalen (§32):** Praktikernahe Impulse existieren auch auf gröberen und feineren Skalen. Die Skala ist nicht der Engpass.

**Anzahl der Kandidaten (§35):** Die praktikernahe Lesart liegt in keinem Fall unter den Top 10. Ein Top-3/5/10-Behalt würde sie nicht retten.

## 4. Unterteilung: Klassifikator oder Daten?

**Echte Motivwellen auf synthetischen Daten** (`classifySegment`, Korpus DEVELOPMENT) werden als Motiv erkannt:

| Rauschen | Anteil Motiv |
|---|---:|
| ohne | 98 % |
| niedrig | 97 % |
| mittel | 82 % |
| hoch | 58 % (18 % unaufgelöst) |

Echte Korrekturwellen werden symmetrisch erkannt: 100 / 98 / 85 / 49 %. Der Klassifikator ist also nicht grundsätzlich verzerrt.

**Reale Practitioner-Fälle:** Die Motivwellen der besten Impulslesart werden nur in 17 von 49 Fällen als 5er-Struktur erkannt (35 %). Das liegt unter dem synthetischen „hohen Rauschen“. Reale Wochenreihen gleichen nach Mission III (Rauschrealismus) diesem Niveau.

**Gegenprobe mit Hoch/Tief und Tagesauflösung** (OHLC_ELLIOTT_STUDY.md): keine Verbesserung (11/64 bzw. 6/27).

**Deutung:**
* Auf realen Kursen sind die Unterwellen von Motivwellen oft nicht vom Rauschen zu trennen.
* Die strengen Motivregeln (W4, W3, W2) brechen dann eher als die großzügigen Korrekturregeln.
* Folge: Korrekturen sind der Auffangbehälter. Das ist eine **Messgrenze** und kein Implementierungsfehler.

## 5. Laufende vs. abgeschlossene Impulse (§40)

* **Practitioner:** 22 der 25 Impulsfälle sind laufend. Alle 12 praktikernahen Lesarten sind laufend.
* **Synthetisch, abgeschlossen:** Abgeschlossene Impulse werden bei niedrigem Rauschen gut erkannt. Bei ohne/niedrigem Rauschen ist die wahre Lesart in 80 % der Fälle Hauptzählung.
* **Synthetisch, laufend:** Die wahre laufende Impulslesart ist in 70 % der Fälle in der Liste. Ohne Rauschen gewinnt sie trotzdem nur in 4 von 30 Fällen.
  * Fast immer gewinnt ein **laufender Zickzack auf denselben Wellenenden** (1-2-3 gelesen als A-B-C).
  * Ursache ist die Vollständigkeits-Heuristik: Ein Zickzack in C gilt als 100 % vollständig, ein Impuls in Welle 3 als 67,5 %.
  * Nach EWP ist 1-2-3 gegen A-B-C bis Welle 4/5 nicht unterscheidbar. Entscheiden müsste der Trend des höheren Grades.
* **Developing-Deckel (§41):** Laufende Zählungen bleiben höchstens NIEDRIG. Unverändert.

## 6. Enthaltung (§37–§39)

* **Enthaltung insgesamt:** 33 von 33 Fällen.

  | Grund | Fälle |
  |---|---:|
  | W-X-Y-Deckel (3.2.2) | 14 |
  | laufend bzw. niedriger Wert | 9 |
  | Mehrdeutigkeit und niedriger Wert | 6 |
  | niedriger Anwendbarkeitswert | 3 |
  | Datenlage | 1 |

* **„Keine gültige Zählung“:** 0.
* **Übervorsicht ist nicht die Hauptursache.** Die enthaltenen Zählungen sind in keinem Fall Impulse. Weniger Enthaltung würde die falsche Familie zeigen.

## 7. Teilmengen (§16, §45–§49; Diagnose, keine Abstimmungsziele)

| Teilmenge | Impulsfälle | praktikernah vorhanden | dominant: Unterteilung / Vollständigkeit / Dominanz |
|---|---:|---:|---|
| alle | 25 | 12 | 15 / 6 / 4 |
| HIGH | 7 | 5 | 2 / 3 / 2 |
| MEDIUM | 18 | 7 | 13 / 3 / 2 |
| ohne BTC (Aktien/Index) | 16 | 10 | 7 / 5 / 4 |
| ohne EWF | 15 | 3 | 13 / 2 / 0 |
| ohne TradingView | 10 | 9 | 2 / 4 / 4 |
| 1D | 13 | 1 | 12 / 1 / 0 |
| 1W | 12 | 11 | 3 / 5 / 4 |
| DEVELOPMENT / VALIDATION | 20 / 5 | 10 / 2 | 12/4/4 · 3/2/0 |

**Lesart:**
* **Ergebnis stabil:** Der Kernbefund (gültiger Impuls, zu niedrig gerankt) gilt in **jeder** Teilmenge zu 100 %.
* **Mechanismus je Zeitrahmen:**
  * Tagesfälle sind überwiegend TradingView und BTC. Dort dominiert die Unterteilung.
  * Wochenfälle sind überwiegend EWF. Dort dominieren Vollständigkeit und Dominanz, und es gibt fast immer eine praktikernahe Lesart.
* **HIGH-only:** Die Schlussfolgerung ändert sich nicht. Unterteilung als Ursache tritt dort seltener auf, Vollständigkeit häufiger.

## 8. Practitioner-Seite (§9, §15, §42, §45–§47)

* **Impulsanteil der geöffneten Fälle:** 27 von 35 (77 %).

  | Teilmenge | Anteil |
  |---|---:|
  | EWF | 67 % |
  | 1D | 87 % |
  | 1W | 70 % |
  | BTC | 82 % |
  | HIGH | 89 % |

  Aus den Practitioner-Daten lässt sich keine Häufigkeit von Impulsen am Markt ableiten (Publikationsauswahl, §46).
* **A↔B-Übereinstimmung der Extraktion** (46 geöffnete Zeilen, PRACTITIONER_HUMAN_AUDIT.md):

  | Feld | Übereinstimmung |
  |---|---:|
  | Familie | 95,7 % |
  | laufende Welle | 71,1 % |
  | Richtung | 97,8 % |
  | Invalidation | 80,8 % |
  | Zeitrahmen | 97,8 % |

  Bei MEDIUM liegt die Übereinstimmung der laufenden Welle bei 60,6 %. **Die Familie ist das zuverlässigste Feld**; ein Überzählen von Impulsen durch die Extraktion ist daher wenig wahrscheinlich, aber ohne menschlichen Audit nicht ausgeschlossen.
* **Untertypen (§42):** Die Datensätze nennen fast nur „IMPULSE“. Verlängerung und Trunkierung wurden nicht extrahiert. Eine Aufteilung nach Untertyp ist nicht möglich.
* **Schulen (§9):** EWF zählt mit Wochencharts in „blue box“-Konvention, die TradingView-Autoren in gemischter Notation. Aus den Feldern ist keine Schule sicher ableitbar. Die Engine wurde **nicht** an eine Schule angepasst.

## 9. Antworten (§93 Fragen 1, 2, 10–14)

1. **Warum erkennt VU keine Impulse?** Die Impulse werden gefunden und verlieren im Rang. Hauptursachen:
   * Unterteilungsevidenz: Motivwellen zeigen auf realen Kursen selten eine sichtbare 5er-Struktur.
   * Vollständigkeits-Heuristik: laufendes 1-2-3 gegen A-B-C.
   * Dominanz des Ursprungs.
   * In der Suche zusätzlich die Ähnlichkeitsschranke: Ohne sie werden aus 25 Fällen 3 Haupt- und 9 Alternativzählungen.
2. **Anteile (25 Fälle):**

   | Ursache | Anteil |
   |---|---:|
   | Engine-Regeln | 0 % |
   | Pivots | 0 % |
   | Kandidatenbeschnitt (Vorauswahl, Top-N) | 0 % |
   | Rang: Unterteilung | 60 % |
   | Rang: Vollständigkeit | 24 % |
   | Rang: Dominanz | 16 % |
   | Grad bzw. Skala | 0 % als alleinige Ursache |
   | Datenauflösung | durch OHLC nicht behebbar |
   | Enthaltung | sekundär |
   | Unsicherheit der Practitioner-Extraktion | nicht bezifferbar (Audit READY, keine Ergebnisse) |

10. **War die Engine zu streng?**
    * Bei den klassischen Regeln: nein.
    * Bei VU-Heuristiken: teilweise. Die Ähnlichkeitsschranke ist strenger als EWP. Die Vollständigkeits-Heuristik bevorzugt 3er-Muster bei laufenden Zählungen.
11. **Gab es gültige Impulse, die beschnitten wurden?** Nicht beschnitten, sondern niedrig gerankt. Kein Vorauswahl- oder Top-N-Verlust.
12. **Ist Übervorsicht das Hauptproblem?** Nein.
13. **Ist der Grad das Hauptproblem?** Nein, in diesem Befund nicht. Die Skalen-Ablation ändert nichts.
14. **Sind laufende Impulse besonders problematisch?** Ja. Auch synthetisch: Laufende Motivmuster werden nur zu 11–12 % als Motiv gelesen.

Zur Entscheidung über Engine 3.3: siehe [ELLIOTT_ENGINE33_REPORT.md](ELLIOTT_ENGINE33_REPORT.md).
