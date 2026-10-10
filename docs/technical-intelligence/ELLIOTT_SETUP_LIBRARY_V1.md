# Elliott Setup Library V1

Stand: 07.10.2026 (Mission X). Maschinenlesbar: [`scripts/technical/elliott-setups/ELLIOTT_SETUP_SPEC.json`](../../scripts/technical/elliott-setups/ELLIOTT_SETUP_SPEC.json) (Spec-Version 1.0.0, SHA-256 `b7dd89d5…`).

Implementierung: [`setup-library.mjs`](../../scripts/technical/elliott-setups/setup-library.mjs). Dieselbe Funktion dient der historischen Auswertung und dem prospektiven Register. Freeze vor der Validierung: [MISSION10_SETUP_FREEZE.md](MISSION10_SETUP_FREEZE.md).

## Grundsatz

Die Library behauptet nicht, Elliott „funktioniere“. Sie benennt wenige, strukturell klar beschriebene Lagen der **eingefrorenen** Engine (`elliott-3.2.2`). Für jede Lage legt sie fest:
* was sie bestätigt;
* was sie ungültig macht;
* welche Zone die Engine projiziert;
* welche Evidenz es dafür gibt.

Die Engine wird nicht verändert.

## Auswahl: 4 Familien + 1 Modifikator, 1 verworfen

| Familie | Setup | Aufgenommen? | Begründung (Regel- und Quellenbasis im eingefrorenen Code) |
|---|---|---|---|
| A | **S1 Frühe Welle-3-Ausdehnung** | ja | Die Impulsregeln (W2 nicht unter Ursprung W1; W3 nie die kürzeste) und Projektionen W3 = 1,0 / 1,618 / 2,618 × W1 liegen in `rules.js` und `patterns.js`. Strategisch die wichtigste Lage. |
| B | **S2 Welle 4 → Welle 5** | ja | Die W4-Regel (keine Überlappung mit W1) und die W5-Projektionen (0,618/1,0 × W1, 0,618 × W1–3, Deckel bei kurzer W3) liegen im Code. |
| C | **S3 Abgeschlossene Korrektur → Fortsetzung** | ja | Abgeschlossene Zickzack/Flat/Doppel-/Dreifach-Zickzack/WXY. Projektion „Ursprung der Korrektur“ und „1,618 × Korrekturlänge“. Häufigster angezeigter Zustand der Engine. |
| D | **S4 Dreieck → Schlussstoß** | ja | Abgeschlossenes Dreieck; Projektion „Breite von Welle A“ (EWP Kap. 1) liegt im Code. |
| E | Höherer Grad gleichgerichtet | als **Modifikator** M_HD_ALIGNED | Keine eigene Lage, sondern eine Bedingung an S1–S4 (`higherDegree.current.direction`). |
| F | Motiv-Ausdehnung / Extension | **verworfen** | Die Engine gibt keine laufende Extension aus. `ext3` ist erst nach Abschluss von Welle 3 bekannt; das wäre keine kausale Setup-Bedingung. Im eingefrorenen Code gibt es keine Projektionsbasis für eine laufende Extension. |

Begrenzung auf vier Familien: Jede weitere Familie hätte keine eigene Regel- oder Projektionsbasis in der Engine oder wäre eine Variante einer bestehenden.

## Was die eingefrorene Engine tatsächlich erzeugt (Rekonstruktion vor der Definition)

Gezählt wurden die Erkennungspunkte der Wochen-Überlebenden (DEV-Hälfte, 193.826 Punkte).

| Primärzählung | Anteil | angezeigt (nicht enthalten) |
|---|---|---|
| abgeschlossene Korrekturen (WXY, Flat, Zickzack, Dreieck, Dreifach-Zickzack) | ≈ 90 % | nur ≈ 0,7 % aller Punkte, fast ausschließlich abgeschlossene Korrekturen |
| laufende Korrektur (Welle C, Y, E, B) | ≈ 8 % | praktisch nie |
| Impuls / Diagonale, abgeschlossen oder Welle 5 | ≈ 2 % | praktisch nie |
| **Impuls mit laufender Welle 2 oder 3** | **0** | **0** |
| Impuls mit Welle 4 | 34 | 0 |

**Folge:** S1 und S2 sind als *angezeigte* Setups der heutigen Engine praktisch leer. Das ist ein Befund über die Engine, kein Datenmangel. S1 wird deshalb zusätzlich über die nicht angezeigte Forschungskohorte **RESEARCH_ONLY_INTERNAL_WAVE3** beobachtet; sie fließt nie ins Produkt.

## Strukturelle Definitionen

Alle Definitionen gelten für die Wochen-Primärzählung im Analysegrad der Engine. Die Tagesreihe ist in V1 nicht Teil der Definition (Woche = These; Tag später nur Timing).

### S1 Frühe Welle-3-Ausdehnung (Familie A)

| Feld | Definition |
|---|---|
| Musterfamilie | IMPULSE, LEADING_DIAGONAL |
| Wellenzustand | unvollständig; aktuelle Welle 2 (W1 fertig) oder Welle 3 laufend |
| Richtung | Richtung von Welle 1 (`primary.direction`) |
| Grade | Analysegrad; kein Mindestgrad |
| Höherer Grad | Pure: keine Bedingung; Modifikator HD: `higherDegree.current.direction` = Setup-Richtung |
| Bestätigung | Schluss jenseits des Endes von Welle 1 |
| Invalidation | Engine-Invalidation der Primärzählung |
| Projektion | Phase „3“: primär = Zone höchsten Gewichts jenseits des Kurses, erweitert = fernste Zone |
| Alternative | `alternatives[0]` (Muster, Welle, nächste Richtung) |
| Enthaltung | Enthält sich die Engine, wird das Setup nicht angezeigt (nur ENGINE_PRIMARY) |
| Forschungskohorte | bester **interner** IMPULSE-Kandidat aufwärts, unvollständig, 2–3 markierte Wellen, letzte Marke ≤ 4 Wochen (Mission IX). Invalidation = Ursprung von W1; Projektion W3 = 1,0 / 1,618 / 2,618 × W1 ab Ende W2 |

### S2 Welle 4 → Welle 5 (Familie B)

| Feld | Definition |
|---|---|
| Musterfamilie | IMPULSE, LEADING_DIAGONAL, ENDING_DIAGONAL |
| Wellenzustand | unvollständig; aktuelle Welle 4 |
| Richtung | Richtung von Welle 1/3 |
| Bestätigung | Schluss jenseits des Endes von Welle 3 |
| Invalidation | Engine-Invalidation (Überlappung mit dem Ende von Welle 1) |
| Projektion | Phase „5“ (Zonen wie oben) |
| Höherer Grad, Alternative, Enthaltung | wie S1 |

### S3 Abgeschlossene Korrektur → Trendfortsetzung (Familie C)

| Feld | Definition |
|---|---|
| Musterfamilie | ZIGZAG, FLAT, DOUBLE_ZIGZAG, TRIPLE_ZIGZAG, WXY |
| Wellenzustand | abgeschlossen |
| Richtung | `primary.nextMove` (Gegenrichtung der Korrektur) |
| Bestätigung | Schluss jenseits des Endes der vorletzten Welle (B bzw. X) |
| Invalidation | Schluss jenseits des Endes der letzten Korrekturwelle (C bzw. Y/Z) |
| Projektion | Phase AFTER_CORRECTION: primär „Ursprung der Korrektur“, erweitert „1,618 × Korrekturlänge vom Korrekturende“ |
| Höherer Grad, Alternative, Enthaltung | wie S1. Abgeschlossene WXY sind in 3.2.2 höchstens NIEDRIG und damit praktisch immer enthalten. |

### S4 Dreieck → Schlussstoß (Familie D)

| Feld | Definition |
|---|---|
| Musterfamilie | TRIANGLE |
| Wellenzustand | abgeschlossen (Welle E beendet) |
| Richtung | `primary.nextMove` (Ausbruch gegen die Richtung von E) |
| Bestätigung | Schluss jenseits des Endes von Welle D |
| Invalidation | Schluss jenseits des Endes von Welle E |
| Projektion | Phase THRUST: „Breite von Welle A“ bzw. „0,618 × Breite“ |

### Gemeinsame Ausschlüsse

Das Setup gilt nicht (Status statt Ereignis), wenn:
* der Kurs schon jenseits der Invalidation liegt (ALREADY_INVALID_OR_UNDEFINED);
* keine Projektionszone mehr jenseits des Kurses liegt, das Ziel also schon erreicht ist (NO_PROJECTION_BEYOND_PRICE);
* die Engine keine Richtung angibt.

Liegt der Kurs schon jenseits des Bestätigungsniveaus, wird das festgehalten (ALREADY_CONFIRMED) und die Bestätigung nicht als Ergebnis gezählt.

## Varianten

| Variante | Regel (logisches UND, keine Gewichte) |
|---|---|
| **PURE** | Setup-Zustand der Primärzählung; die Engine enthält sich nicht (angezeigt). Nur Elliott-Information. |
| **PURE_RS** | PURE UND RS26 im obersten Quintil (lang) bzw. untersten (kurz) des Universums am selben Datum |
| **CONFIRMED** | PURE UND einfacher Trend gleichgerichtet (Schluss gegen 40-Wochen-Durchschnitt, Steigung über 4 Wochen) UND RS26 wie oben UND Marktstruktur gleichgerichtet (Vorzeichen der STRUCTURE-Stimme der Swing-Struktur). Volumen: nicht verfügbar (Wochenreihen ohne Volumen). |
| PURE_HD | PURE UND M_HD_ALIGNED |
| ENGINE_PRIMARY | Forschung: Setup-Zustand unabhängig von der Enthaltung (vom Produkt nicht angezeigt) |

Die Bestätigungen sind voneinander und von Elliott unabhängig. Elliott beantwortet „wo stehen wir strukturell?“, Trend „ist die größere Bewegung gleichgerichtet?“, RS „führt die Aktie?“, Marktstruktur „bestätigt das Kursverhalten?“. Mission VIII zeigte, dass eine gewichtete Konfluenz praktisch Trend allein ist; deshalb gibt es keine Gewichte.

## Ergebnisse und Einstufung

Siehe [ELLIOTT_SETUP_EVIDENCE.md](ELLIOTT_SETUP_EVIDENCE.md). Kurzfassung (angezeigte Variante PURE):
* S1 und S2: INSUFFICIENT EVIDENCE;
* S3: STRUCTURAL ONLY;
* S4: INSUFFICIENT EVIDENCE.

ROBUST EDGE ist nur über das [prospektive Register](ELLIOTT_PROSPECTIVE_REGISTRY.md) erreichbar.
