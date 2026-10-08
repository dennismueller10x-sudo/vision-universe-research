# VU Elliott Projection Engine (`elliott-projection-1.0.0`)

Stand: 08.10.2026.

* **Code:** `quant/engines/technical/projection/elliott-projection.js` (UMD, ohne Abhängigkeiten außer dem eingefrorenen Regelwerk `elliott/patterns.js`).
* **Produktschicht:** `scripts/technical/lib/ti-projection.mjs` (Build und Register).
* **Daten:** Feld `projection` (und für Tagestitel `projectionWeekly`) in `quant/data/technical-intelligence/v3/shards/*`, Spalte `proj` im Index, Lebenszyklus `v3/projection-theses.json`, Kennzahlen `meta.json → projection`.
* **Oberfläche:** Chartbild (`quant/app/page-chartbild.js`), Karte „Elliott-Projektion“, Chart-Ebene „Elliott-Projektion“ (`quant/ui/ti-chart.js`), Profi-Ansicht „Elliott-Projektion · Fachdetails“.
* **Tests:** `quant/tests/elliott-projection.test.mjs` (P-1 bis P-20), `quant/tests/elliott-registry-product-view.test.mjs` (M11-P4, Registerform).

## Grundsatz

> **Projektion ≠ Wahrscheinlichkeit.**
> Die Zonen zeigen, wohin eine Welle rechnerisch laufen könnte, *wenn die Zählung stimmt*. Prozentwerte sind Arithmetik vom aktuellen Kurs (Zonengrenze ÷ Kurs − 1), keine Trefferquote. Für Projektionszonen gibt es noch keine Evidenz; das prospektive Register zeichnet sie ab jetzt auf.

Die Projection Engine sitzt **auf** der eingefrorenen Elliott-Ausgabe (`elliott-3.2.2`, Regelwerk `elliott-rules-3.1.0`). Sie ändert nichts an Grammatik, Ranking, harten Regeln, Grad, Pivots, Enthaltung oder der historischen Evidenz:

* Eingabe ist die **veröffentlichte Form** `pro.elliott` (dieselbe Zählung, die der Kunde sieht; im Register byte-gleich geprüft).
* Thesen entstehen nur aus Zählungen, die die Engine selbst ausgibt: Primärzählung, höherer Grad, `alternatives`. Interne Suchkandidaten (Forensik-Haken, Kohorte `RESEARCH_ONLY_INTERNAL_WAVE3`) werden **nicht** verwendet.
* Enthält sich die Engine, sieht der Kunde **keine** Projektion. Die Profi-Ansicht zeigt die rechnerische These mit dem Hinweis „Nur Fachansicht – keine Produktaussage“ (wie die zurückgehaltene Zählung selbst).

## Thesentypen

| Typ | Wann | Anker | Referenz | Bestätigung (Klasse) | Invalidation |
|---|---|---|---|---|---|
| `WAVE_3` | Impuls/Leading Diagonal, Welle 2 oder 3 läuft; höherer Grad: abgeschlossene Korrektur = Welle (2) | Ende Welle 2 (läuft W2: laufendes Extrem, **vorläufig**) | Welle 1 | Schluss jenseits W1-Ende (harte Regel `W3_BEYOND_W1_END`) | Ursprung W1 (`W2_NOT_BEYOND_W1_ORIGIN`); Neuzuordnung unter W2-Ende |
| `WAVE_5` | Impuls/Diagonale, Welle 4 oder 5 läuft; höherer Grad: Welle (4) abgeschlossen | Ende Welle 4 | Welle 1 (Diagonale: Welle 3), Strecke 1–3 | jenseits W3-Ende (Richtlinie `NO_TRUNCATION` / `THROW_OVER`) | Ende W1 (`W4_NO_OVERLAP_W1`) bzw. Ursprung W3 (Diagonale) |
| `WAVE_C` | Zigzag/Flat (C), W-X-Y (Y), Doppel-Zigzag (Y·c, W·c), Dreifach-Zigzag (Y, Z) | Ende B / X / X₂ | A bzw. W bzw. Y | jenseits A-Ende (Richtlinie `C_BEYOND_A_END`); Y/Z: Definition des Musters | Ursprung der Korrektur bzw. Flat-Grenze (Engine) |
| `NEXT_MOVE` | Korrektur abgeschlossen | Korrekturende | Korrekturlänge | jenseits Ende der vorletzten Welle (Setup-Definition S3, VU) | Korrekturende (`PATTERN_END`) |
| `THRUST` | Dreieck abgeschlossen | Ende E | Breite von Welle A | jenseits Ende D (Setup-Definition S4, VU) | Ende E |
| `REVERSAL` | Impuls/Diagonale abgeschlossen | Ende Welle 5 | Gesamtlänge | jenseits Ende Welle 4 (VU) | Ende Welle 5 |

Invalidation und Neuzuordnung stammen aus der Engine (`count.invalidation`, `count.revision`) bzw. für den höheren Grad aus `patterns.invalidation()` – derselben eingefrorenen Funktion. Es gibt keinen „Stop für das Chance-Risiko-Verhältnis“.

## Projektionsleiter (Basis / Erweitert / Extrem)

Jede Stufe ist ein **Band** zwischen zwei Verhältnissen: `Anker + Richtung × Referenz × [von, bis]`. Die Bänder sind die Richtlinienbänder des eingefrorenen Regelwerks (`patterns.js`) bzw. die in der Literatur genannten Verhältnisse; wo die Literatur keinen Zahlenwert nennt, steht offen `VU_OPERATIONAL`.

| Leiter | Basis | Erweitert | Extrem | Quelle / Klasse |
|---|---|---|---|---|
| Welle 3 (Impuls) | 1,0–1,618 × W1 | 1,618–2,618 × W1 | 2,618–4,236 × W1 | EWP Kap. 4 (Multiples); Richtlinie `W3_EXTENSION` (ideal 1,618–2,618, zulässig 1,0–4,236) |
| Welle 3 (Leading Diagonal) | 0,618–1,0 × W1 | 1,0–1,618 × W1 (expandierend, VU) | – | EWP Kap. 1 (Diagonal Triangles) |
| Welle 5 (Impuls) | 0,618–1,0 × W1 | 1,0–1,618 × W1 | 1,0–1,618 × Strecke 1–3 | EWP Kap. 4, Kap. 2 (Wave Equality); Richtlinie `W5_PROPORTION` |
| Welle 5 (Diagonale, kontrahierend) | 0,618–1,0 × W3 (Deckel < W3) | – | – | EWP Kap. 1, Definition `DIAGONAL_W5_VS_W3` |
| Welle 5 (Diagonale, expandierend) | 1,0–1,618 × W3 | 1,618–2,618 × W3 | – | Definition (W5 > W3); Band VU |
| Welle C (Zigzag) | 0,618–1,0 × A | 1,0–1,618 × A | 1,618–2,618 × A (VU) | EWP Kap. 4; Richtlinie `C_PROPORTION` |
| Welle C (Flat, regulär) | 1,0–1,236 × A | 1,236–1,618 × A | – | Richtlinie `C_PROPORTION` (regulär) |
| Welle C (Flat, expandiert) | 1,382–1,618 × A | 1,618–2,618 × A | – | Richtlinie `C_PROPORTION` (expandiert) |
| Welle Y (W-X-Y) | 0,618–1,0 × W | 1,0–1,618 × W | 1,618–2,618 × W | Richtlinie `Y_PROPORTION` |
| Welle Z (Dreifach-Zigzag) | 0,618–1,0 × Y | 1,0–1,618 × Y | 1,618–2,618 × Y | Richtlinie `Z_PROPORTION` |
| Folgebewegung nach Korrektur | 0,618–1,0 × Korrektur | 1,0–1,618 × Korrektur | 1,618–2,618 (VU) | EWP Kap. 1/4; Engine-Relationen „Ursprung der Korrektur“, „1,618 × Korrekturlänge“ |
| Dreieck-Ausbruch | 0,618–1,0 × A | 1,0–1,618 × A (VU) | – | EWP Kap. 1 (Thrust ≈ breiteste Stelle) |
| Gegenbewegung nach Impuls | 0,382–0,5 × Impuls | 0,5–0,618 × Impuls | – | EWP Kap. 4 (Retracements) |
| nach Ending Diagonal | 0,618–1,0 × Diagonale | 1,0–1,618 (VU) | – | EWP Kap. 1 (Rücklauf zum Ursprung) |
| nach Leading Diagonal | 0,5–0,66 | 0,66–0,81 | – | Richtlinie `W2_DEEP` |

Die vollständige Liste mit Formel, Klasse und Fundstelle steht im Code (`RELATIONSHIPS`) und wird je Titel im Feld `projection.relations` ausgeliefert (Profi-Ansicht). Test P-19 prüft, dass jede Stufe eine Beziehung mit Quelle hat und jede Richtlinie im Regelwerk existiert. Die Verhältnisse wurden **nicht** an Beispielen (PLTR, SE, OSCR …) eingestellt.

**Regelbedingte Unterschiede**
* *Deckel:* Ist Welle 3 kürzer als Welle 1, darf Welle 5 Welle 3 nicht übertreffen (harte Regel `W3_NOT_SHORTEST`); kontrahierende Diagonale: W5 < W3. Stufen jenseits des Deckels entfallen mit Begründung.
* *Verlängerte Welle 3:* Hinweis, dass Welle 5 dann zur Gleichheit mit Welle 1 tendiert (Richtlinie `EXTENSION_IN_ONE`); die Extrem-Stufe bleibt sichtbar, ist aber als seltener Fall erklärt.
* *Truncation:* Solange eine laufende Welle 5 das Ende von Welle 3 nicht überschritten hat, zeigt die These die Truncation-Grenze (zulässig, selten).
* *Running Flat:* Hinweis, dass C vor dem A-Ende enden kann.

## Zonen, Anzeige, Prozent

* Zonen statt Punktziele. Anzeige mit drei signifikanten Stellen, nach außen gerundet (untere Grenze ab-, obere aufgerundet).
* Je Zone: untere/obere Grenze, geometrische Mitte, Prozent vom Kurs (Arithmetik), Zustand `OPEN` / `INSIDE` / `PASSED`.
* Sind alle Zonen bereits erreicht: Status `EXHAUSTED` („Projektionszonen bereits erreicht“).

## Leitplanken (nur Datenfehler, nie Größe)

| Prüfung | Folge |
|---|---|
| kein gültiger Kurs, Kurs ≤ 0 | keine Projektion |
| tote/festgenagelte Reihe (`stalePriceBars`) | keine Projektion |
| Kurssprung im Split-Verhältnis (`dataQuality.suspectedSplits` der Engine) | keine Projektion |
| Sprung > 5× oder < 0,2× innerhalb der Ankerwellen | These entfällt, Hinweis |
| Zone ≤ 0 (abwärts) | Stufe entfällt („rechnerisch nicht darstellbar“) |
| Zone > 1.000 × Kurs oder nicht endlich | Stufe entfällt, Hinweis „Datenfehler wahrscheinlich“ |
| Kurs < 1 | Hinweis „kleine Kursänderungen → große Prozentwerte“ (keine Unterdrückung) |

Eine Projektion von +1.500 % oder mehr wird gezeigt, wenn die Struktur sie ergibt (Test P-13).

## Primär, Alternative, Hochpotenzial-Alternative

* **Hauptlesart:** These des höheren Grades, wenn er eine Motivwelle 3/5 ergibt und gleichgerichtet ist (Wochen-These); sonst die These der Primärzählung. Die kurzfristige Struktur bleibt als `subStructure` sichtbar.
* **Alternative:** erste Alternative der Engine mit Projektion.
* **Hochpotenzial-Alternative:** nur eine echte Alternative der Engine, Muster Impuls oder Leading Diagonal (Welle 3/5 aufwärts), Regelprüfung `VALID`, Mitte der erweiterten Stufe ≥ +100 % und ≥ doppelt so groß wie die der Hauptlesart. Sie wird **nie** zur Hauptlesart erhoben und ist als „nicht die bevorzugte Zählung, geringe Klarheit“ beschriftet. Ending Diagonals sind Endwellen und zählen nicht.

## Status und Fahrplan („Was als Nächstes passieren muss“)

* `DEVELOPING`: Anker vorläufig oder Bestätigung offen („Im Aufbau · noch nicht bestätigt“).
* `CONFIRMED`: Bestätigungsniveau per Schluss überschritten und Anker fest.
* **Elliott-Anforderung** (aus der Zählung): Invalidation halten, Neuzuordnungsgrenze, Vorwelle abgeschlossen, Bestätigungsniveau, Deckel. Jede Zeile nennt ihre Klasse (harte Regel, Definition, Richtlinie, VU-Festlegung).
* **VU-Bestätigung** (unabhängig, verändert keine Formel): Trend (Dow-Theorie), Relative Stärke Top 20 % (26-Wochen-Rang im Querschnitt aller Titel des Laufs, Veränderung gegen vor 13 Wochen), Marktstruktur (Stimme STRUCTURE der Chartbild-Analyse: bestätigt / im Aufbau / widersprüchlich), Volumen (nur Tagesdaten), Wochen- und Tagesbild gleichgerichtet.

## Wochen zuerst

Für Titel mit Tagesanalyse (Golden-Preview) rechnet der Build zusätzlich die Wochenanalyse mit derselben Produktfunktion (`projectionWeekly`). Die Karte zeigt die Wochen-These zuerst und die Tagesstruktur als Ebene darunter („Detail und Timing innerhalb der Wochen-These – kein Widerspruch“). Das Chartbild selbst bleibt die Tagesanalyse.

## Lebenszyklus (`v3/projection-theses.json`)

* Erfasst werden nur **angezeigte** Thesen (Haupt, Alternative, Hochpotenzial).
* Eine Revision wird beim ersten Erscheinen eingefroren: Anker, Referenz, Zonen, Invalidation, Bestätigung, Versionen.
* Ändern sich Anker oder Grenzen, entsteht eine **neue Revision**; die vorige bleibt unverändert (`REVISED`).
* Ereignisse werden nur angehängt: `CREATED`, `CONFIRMED`, `BASE_/EXTENDED_/EXTREME_PROJECTION_REACHED`, `INVALIDATED`, `RELABELLED`, `ARCHIVED`, `REVISED`.
* Kurse werden nur nach dem letzten Prüfdatum gelesen; derselbe Stand ändert nichts (idempotent, Test P-20).
* Erscheint eine archivierte These wieder, bekommt sie eine neue Kennung (`…#2`).
* Die Seite zeigt „These seit …, Revision n, eingefroren am …“. Zonen werden nachträglich nie verschoben.

## Prospektives Register (Registry 1.2.0)

* Neue `CUSTOMER_PRODUCT`-Ereignisse tragen `projectionThesis` (eingefrorene These: Typ, Zonen, Invalidation, Bestätigung, Deckel, Status, Kurs, Trend, RS, Marktstruktur, Engine- und Projektionsversion) und `projectionEngine`.
* Der RUN-Eintrag nennt `code.projection`.
* Neue Revisionsarten nur für Ereignisse mit Projektionsthese: `PROJECTION_BASE_REACHED`, `PROJECTION_EXTENDED_REACHED`, `PROJECTION_EXTREME_REACHED`, `PROJECTION_INVALIDATED`.
* Bestehende Ereignisse und Revisionen bleiben unverändert (Kette, `verify.mjs --against-git`). Setup-Library, Kohorten, Auswertung und die zustandslose Sicht sind unverändert.

## Leistung

Die Projektion rechnet aus der fertigen Elliott-Ausgabe: alle 5.130 veröffentlichten Titel in rund 4 s (ein Kern, inkl. Entpacken der Shards). Keine historische Suche beim Seitenaufruf; die Seite rechnet nicht.

## Grenzen (ehrlich)

* Die eingefrorene Engine enthält sich bei rund 98 % der Wochentitel. Kundensichtbare Thesen gibt es deshalb nur für die Titel mit verlässlicher Zählung (Stand 08.10.2026: 45 von 5.130), überwiegend Folgebewegungen nach abgeschlossener Korrektur. Unvollständige Motivwellen als Primärzählung sind in der Engine selten; eine „mögliche Welle 3“ für Kunden entsteht nur, wenn die Engine sie ausgibt. Das ist gewollt: Die Engine wird für spannendere Ziele nicht geändert.
* Keine Evidenz für Projektionszonen. Die Stufen sind Literaturbänder, keine gemessenen Treffer.
* Relative Stärke ist ein Rang im Querschnitt des Laufs (Kurs, ohne Dividenden), nicht gegen einen Index.
* Wochenreihen ohne Volumen: Volumen-Bestätigung „nicht verfügbar“.
* Fundstellen auf Kapitelebene (wie `elliott/sources.js`), nicht gegen den Volltext geprüft.
