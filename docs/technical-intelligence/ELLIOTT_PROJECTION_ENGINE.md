# VU Elliott Projection Engine (`elliott-projection-1.2.0`)

Stand: 09.10.2026.

* **Code:** `quant/engines/technical/projection/elliott-projection.js` (UMD, ohne Abhängigkeiten außer dem eingefrorenen Regelwerk `elliott/patterns.js`).
* **Produktschicht:** `scripts/technical/lib/ti-projection.mjs` (Build und Register).
* **Daten:** Feld `projection` (und für Tagestitel `projectionWeekly`) in `quant/data/technical-intelligence/v3/shards/*`, Spalte `proj` im Index, Lebenszyklus `v3/projection-theses.json`, Kennzahlen `meta.json → projection`.
* **Oberfläche:** Chartbild (`quant/app/page-chartbild.js`), Karte „Elliott-Projektion“, Chart-Ebene „Elliott-Projektion“ (`quant/ui/ti-chart.js`), Profi-Ansicht „Elliott-Projektion · Fachdetails“.
* **Tests:**
  * `quant/tests/elliott-projection.test.mjs` (P-1 bis P-26)
  * `quant/tests/elliott-explore.test.mjs` (X-1 bis X-15, Explore)
  * `quant/tests/corporate-action-evidence.test.mjs` (CA-1 bis CA-6, Split-Beleg)
  * `quant/tests/elliott-registry-product-view.test.mjs` (M11-P4 bis M11-P6, Registerform)

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

* Zonen statt Punktziele. Anzeige mit drei signifikanten Stellen, nach außen gerundet (untere Grenze ab-, obere aufgerundet). Grenzen (Invalidation, Bestätigung) werden nie gerundet angezeigt, sondern mit vier signifikanten Stellen.
* Zwischen zwei Stufen kann eine Lücke liegen (z. B. Welle 5: Erweitert ×W1, Extrem ×Strecke 1–3); die Bänder werden nicht künstlich verbunden.
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
* Zeigt das Produkt eine verfolgte These vorübergehend nicht (Engine enthält sich, Datenproblem), wird sie nicht umgedeutet: `WITHHELD`, Kurse werden weiter gegen die eingefrorene Revision geprüft, beim Wiedererscheinen `SHOWN_AGAIN`.
* Eine These, deren Grenze per Schluss bereits verletzt ist, wird weder gezeigt noch verfolgt (Hinweis `INVALID_THESIS`).
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

## 1.1.0 · Welle-3-Sichtbarkeit (nur PRODUKT-SICHTBARKEIT, keine Methodenänderung)

Stand 08.10.2026. Anlass: Die Projection Engine war live, aber kaum ein Titel zeigte eine laufende Welle-3-These. Diagnose an fünf Referenzfällen (SE, OSCR, XPEV, CGC, BTC – Referenz, keine Wahrheit) und am ganzen Universum.

**Wo die Information verloren ging:** gültiger Kandidat im Suchpool der Engine (bis 400 regelkonforme Lesarten) → Ranking → Ausgabe nur Primärzählung + 2 materiell verschiedene Alternativen (`maxAlternatives: 2`) → Enthaltung (98 % der Wochentitel) → Produkt zeigt bei Enthaltung nichts. Regelkonforme Welle-3-Lesarten mit niedrigerem Rang erreichten das Produkt nie.

**Was sich ändert (nur Sichtbarkeit):**
* `motiveCandidateFor` (`scripts/technical/lib/ti-projection.mjs`) ruft die **unveränderte** Engine ein zweites Mal mit derselben Eingabe und dem ausgabeneutralen Haken `debugAll` auf; die Identität (Primärzählung, Alternativen) wird geprüft.
* Aus dem Pool wird die **bestplatzierte** Lesart IMPULSE/LEADING_DIAGONAL mit laufender Welle 2 oder 3 genommen, die nicht schon angezeigt ist; die Regeln werden mit dem Regelwerk erneut geprüft; seit dem Ursprung darf kein Schluss jenseits der harten Grenze liegen.
* Nur dieser eine Kandidat wird gegen die Produkt-Leitplanken geprüft (vor der Auswertung festgelegt, aus Kriterien der Engine, nicht an Titeln eingestellt):

| Gate | Regel | Herkunft |
|---|---|---|
| G2 | `hierarchy = 1`: keine Kreuzung mit einer vergleichbar starken abgeschlossenen Struktur | Grad-Prüfung der Engine 3.2 |
| G3 | Signal/Rauschen der bestätigten Wellen ≥ 3,0 | Schwelle „voll“ der Anwendbarkeit |
| G4 | nur Wochenanalyse; Welle 1 ≥ 26 Wochen | Wochen zuerst, großer Grad |
| G5 | `trendContext ≥ 0,5` (nicht gegen den gemessenen Jahrestrend) | Trendkontext der Engine |
| G6 | Security Master: `EQUITY_COMMON` und `ELIGIBLE` | keine Vorzugsaktien, Anleihen, Optionsscheine, Units, SPACs |

* Danach gelten alle Leitplanken der Projektion (Datenfehler, ≤ 0, > 1.000 × Kurs, ungültig, ausgeschöpft).
* Ergebnis: `projection.motiveAlternative` – „Mögliche Welle 3 · Alternative Lesart“, Strukturklarheit niedrig, Rang im Pool, Leiter, Invalidation, Bestätigung, Fahrplan. Nie Hauptlesart; höchstens eine; keine, wenn eine angezeigte Alternative schon eine Welle-3-These ist. Sichtbar auch, wenn sich die Engine für die Hauptzählung enthält (die Hauptzählung bleibt zurückgehalten).
* Register 1.3.0: Kohorte `CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE` (eingefrorene These, Rang, Status, Versionen); `productVisible` der Forschungskohorte `RESEARCH_ONLY_INTERNAL_WAVE3` wird ab jetzt wahrheitsgemäß gesetzt. Bestehende Einträge unverändert.

**Nicht geändert:** Grammatik, harte Regeln, Grad-Logik, Pivots, Ranking, Enthaltung, historische Evidenz, Formeln der Leiter.

**Universum (5.130 Titel, Stand 06.10.2026):**

| Stufe | Titel |
|---|---|
| Pool enthält eine regelkonforme Welle-2/3-Motivlesart | 4.923 |
| ohne Leitplanken sichtbar (verworfen: Spam) | 3.223 (365 „Hochpotenzial“) |
| scheitert an G2 Grad | 3.208 |
| an G3 Rauschen | 936 |
| an G4 Grad/Woche | 404 |
| an G5 Trend | 54 |
| an G6 Wertpapierart | 62 |
| bereits angezeigt / kein Kandidat | 8 / 199 |
| **sichtbar nach allen Prüfungen** | **51** (45 abwärts, 6 aufwärts; 2 Hochpotenzial) |

Bekannte Grenze: Der Security Master führt einige börsengehandelte Anleihen als Stammaktie (z. B. AFGC, OXLCZ, KMPB); sie passieren G6.

**Referenzfälle:**

| Titel | Praktiker-Referenz | Kandidat in VU | gültig? | Grad | warum nicht sichtbar | Ergebnis |
|---|---|---|---|---|---|---|
| SE | keine verifizierbare datierte 2026-Zählung gefunden | IMPULSE W1 35,74→196,05, W2 → 78,16 (Rang 97/171) | harte Regeln ja | Woche, groß | kreuzt eine vergleichbar starke abgeschlossene Struktur (G2) – dieselbe Gradunsicherheit, aus der sich die Engine enthält | weiter verborgen |
| OSCR | nicht verifiziert | IMPULSE W3 läuft 2,21→22,93→11,14→32,77 (Rang 67/202) | ja | Woche | Split-Verdacht der Engine (+95 % in einer Woche, 03/2023) → Datensperre; zudem Rauschen (G3) | gesperrt (Daten) |
| XPEV | nicht verifiziert | beste Motivlesart abwärts (Welle 3 seit 2020); aufwärts nur Rang 234/256 | ja | Woche | bester Kandidat zu kleiner Grad (G4) | keine |
| CGC | nicht verifiziert | aktuelle Motivlesarten nur abwärts | ja | Woche | G4; keine gültige Aufwärts-Welle-3 | keine |
| BTC | FXEmpire 20.08.2026: W-3 aufwärts, Ziel ≈ 77.000, ungültig unter 65.418 | Welle 1 aufwärts ab 59.490 läuft; bester Welle-2/3-Kandidat abwärts (Rang 128/157) | ja | Woche (Referenz aus BTCUSD-Tagesreihe, nicht im Produktuniversum) | G2 | nicht im Produkt |

## 1.2.0 · Explore Elliott („Weitere Elliott-Lesarten“) und Split-Beleg

Stand 09.10.2026. Nur Sichtbarkeit und Datenqualität. Unverändert bleiben:
- Grammatik, harte Regeln, Ranking, Kandidatensuche und Grad-Logik der Engine;
- Projektionsformeln;
- Hauptlesart, reguläre Alternative und Motiv-Alternative (Leitplanken G2–G6 unverändert).

### Drei Ebenen

| Ebene | Was | Freigabe |
|---|---|---|
| 1 Primär | bevorzugte Zählung der Engine | wie bisher |
| 2 Alternative | Engine-Alternative bzw. Motiv-Alternative (1.1.0), besteht alle Produkt-Leitplanken | wie bisher |
| 3 Explore | weitere regelkonforme Lesarten, die mindestens eine Produkt-Leitplanke G2–G5 verfehlen | eingeklappt, „Explorativ“, „Nicht als reguläre Alternative freigegeben“ |

### Zulassung (`ti-projection.mjs#exploreCandidatesFor`, vor der Auswertung festgelegt)

**Kandidat:**
- stammt aus dem Pool der unveränderten Engine (derselbe ausgabeneutrale Lauf `debugAll` wie für die Motiv-Alternative, einmal je Titel);
- nicht abgeschlossen, die letzte Welle läuft;
- Muster mit Projektionsformel: Impuls oder Diagonale mit laufender Welle 2–5; Zigzag, Flat oder W-X-Y mit laufender Welle B/C bzw. X/Y; Doppel- und Dreifach-Zigzag;
- nicht schon angezeigt (Primär, Alternativen, Motiv-Alternative), auch nicht mit derselben Thesenkennung (Muster, Ursprung, Richtung);
- **alle Regeln des Regelwerks erfüllt** (erneut geprüft), seit dem Ursprung kein Schluss jenseits der harten Grenze;
- harte Invalidation vorhanden und > 0;
- mindestens eine Projektionszone noch offen;
- **mindestens eine Produkt-Leitplanke G2–G5 verfehlt.** Eine Lesart ohne verfehlte Leitplanke gehört nicht in Explore.

**Titel:**
- nur Wochenanalyse (Tagestitel: aus ihrer Wochenreihe);
- Wertpapierart `EQUITY_COMMON/ELIGIBLE`. G6 sperrt den Titel und wird nie als Explore-Grund gezeigt.
- Datenintegrität sauber (`dataIntegrity`). Gesperrt bei: Kurs ≤ 0 oder nicht endlich, tote oder fixierte Reihe, Lücken (`maxGapBars ≥ 4` oder `gaps ≥ 3`), ungeklärter Split-Verdacht.

### Auswahl (Anti-Spam, deterministisch)

1. **Rangqualität:** nur Lesarten in der besseren Hälfte des Pools (Rang ≤ 50 %), für jeden Platz. Lesarten vom Ende des Pools sind Rauschen der Suche. Der Rang wird angezeigt: „Rang 44 von 171 gültigen Interpretationen“ (nie als Wahrscheinlichkeit).
2. **Platz 1:** die bestplatzierte Motiv-Lesart (These Welle 3); gibt es keine, der bestplatzierte Kandidat.
3. **Platz 2 und 3:** in Rangfolge, nur mit einer anderen Kombination aus Thesentyp und Richtung als alle gewählten und ohne gleichen Ursprung bei gleicher Richtung.
4. **Höchstens 3.** Ist nichts strukturell verschieden, bleibt es bei einer.
5. **Anzeige (Projection Engine):** verworfen werden nahezu gleiche Leitern, also die Mitte der erweiterten Stufe innerhalb von 10 % einer angezeigten These derselben Richtung und desselben Typs.

### Leitplanken in Kundensprache

| Leitplanke | Kunde | Fachansicht |
|---|---|---|
| G2 | Grad-Zuordnung uneindeutig – erfüllt alle Elliott-Regeln, der Wellengrad kollidiert aber mit einer anderen abgeschlossenen Struktur vergleichbarer Größe | `hierarchy` (= 1) |
| G3 | Struktur zu verrauscht – die Wellen heben sich nicht deutlich vom Kursrauschen ab | Signal/Rauschen (≥ 3,0) |
| G4 | Struktur für den Wochenchart noch zu kurz | Länge Welle 1 (≥ 26 Wochen) |
| G5 | Gegen aktuellen Trend | `trendContext` (≥ 0,5) |

Die Fachansicht trennt ausdrücklich „ELLIOTT-REGELN: ERFÜLLT“ (mit Regelkennungen) von „PRODUKT-LEITPLANKEN: VERFEHLT G…“ (Tabelle mit Wert und Schwelle), dazu Rang, Wellenanker, Formel je Stufe und Versionen.

### Oberfläche

- Eingeklappt unter Haupt- und Alternativlesart: „Weitere Elliott-Lesarten (n)“.
- Die Karte zeigt:
  - Kopf „Weitere Elliott-Lesart“ und Thesentyp (z. B. „Mögliche Welle 3 · Wochenchart“), Status „Explorativ“, Strukturklarheit „Niedrig“ und den Rang;
  - „Nicht als reguläre Alternative freigegeben:“ mit den Gründen;
  - Leiter Basis/Erweitert/Extrem, Invalidation und Bestätigung;
  - die Schaltfläche „Im Chart zeigen“ (eigene Wellen im Alternativ-Ton);
  - den Fahrplan eingeklappt.
- Neutrale, zurückhaltende Gestaltung; keine Hochpotenzial-Hervorhebung.

### Lebenszyklus und Register

- **Lebenszyklus:** Explore-Thesen werden verfolgt wie die Motiv-Alternative und nur bei Datenproblemen zurückgehalten. Wechselt eine These ihre Rolle, entsteht das Ereignis `ROLE_CHANGED`; Kennung, frühere Revisionen und Ereignisse bleiben.
- **Register 1.4.0:** Kohorte `CUSTOMER_PRODUCT_EXPLORE_ELLIOTT` (siehe `ELLIOTT_PROSPECTIVE_REGISTRY.md`).

### Split-Verdacht und Kapitalmaßnahmen-Beleg (OSCR)

**Befund:** OSCR war gesperrt (DATA_INVALID), weil die Woche zum 31.03.2023 von 3,36 auf 6,54 lief (Verhältnis 1,946, innerhalb 3 % von 2:1). Laut Anbieter gab es keinen Split. Tagesverlauf: 3,59 → 5,61 (28.03., 71 Mio. Stück) → 6,40 → 6,62 → 6,54. Die Bewegung ist echt.

**Ursache:** Die Wochenreihe trug keinen Beleg der Kapitalmaßnahmen. Die Verhältnisregel der Engine (`elliott-v3.js#dataQuality`, eingefroren) kann eine echte Bewegung in Split-Größe nicht von einer verpassten Bereinigung unterscheiden.

**Lösung:**
1. `publish-long-series.mjs` schreibt je Reihe `corporateActions` (`quant/engines/corporate-action-evidence.js`):
   - die Splittage des Anbieters (`splitFactor`);
   - jede Woche mit Sprung in Split-Größe, mit dem größten Tagesverhältnis dieser Woche.
2. Die Produktschicht löst einen Verdacht nur auf, wenn
   - der Anbieter in dieser Woche **keinen** Split führt **und**
   - der Sprung **nicht** an einem Tag in Split-Größe geschah (eine verpasste Bereinigung wirkt immer über Nacht in voller Größe).
3. Ohne Beleg (alte Reihe), mit verzeichnetem Split oder bei einem Tagessprung in Split-Größe bleibt die Sperre.

**Folge:**
- Die Engine selbst enthält sich weiter (eingefroren).
- Aufgelöste Titel gehen von DATA_INVALID auf ABSTAIN bzw. AVAILABLE. Das Produkt zeigt den Hinweis „Kurssprung in Split-Größe ist laut Anbieter keine Kapitalmaßnahme“.
- Explore wird dann geprüft.

Der Beleg erscheint mit dem nächsten Lauf von `long-series.yml`.
