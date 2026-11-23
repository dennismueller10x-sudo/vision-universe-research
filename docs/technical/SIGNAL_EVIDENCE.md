# Historische Beobachtung im Produkt: Indikator-Ereignisse und Kerzenmuster (AP6, H4)

Fachmodell-PR zur Owner-Freigabe (Produktaussage). Gehört zu [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md), Kriterium H4 (P2).

## 1. Ziel und Grenzen

Bisher zeigte das Produkt nur die Evidenz der Formationen. Die Auswertungen zu Indikator-Ereignissen ([INDICATOR_EVIDENCE.md](INDICATOR_EVIDENCE.md)) und Kerzenmustern ([CANDLESTICK_EVIDENCE.md](CANDLESTICK_EVIDENCE.md)) standen nur in der Doku. Dieser PR macht sie auf der Methodik-Seite sichtbar, beschreibend und mit ihren Grenzen.

Drei Ebenen werden streng getrennt (wie in der Freigabe von #1106 verlangt):

| Ebene | Bedeutung | hier |
|---|---|---|
| Ereignis | technisch eindeutig definiert, nachrechenbar | jede Zeile |
| historische Beobachtung | was danach im Mittel geschah, gegen den Querschnitt aller Titel | die Tabelle |
| handelbarer Vorteil | nach Kosten, Ausführung, Prüfung außerhalb der Stichprobe | **für keine Zeile nachgewiesen**; das Produkt nennt keine Zeile Kauf- oder Verkaufssignal |

## 2. Artefakt

`technical/data/signal-evidence.json` (`vu-technical-signal-evidence-1.0.0`, rund 22 kB).
- Erzeuger: `scripts/technical/world/signal-evidence.mjs`. Er wird von `build-screener.mjs` aufgerufen, im regulären Lauf `technical-world.yml`, also ohne Anbieterabruf. Er liest nur die Materialisierung.
- Er verdichtet `indicator-evidence.mjs` und `candlestick-evidence.mjs` auf den 20-Tage-Horizont: n, Mittel, 95-%-Band, Trefferquote, Belastbarkeit und Phasenstabilität je Zeile.
- Laufzeit im Erzeuger: rund 63 s zusätzlich. Der gesamte Lauf mit Formations-Evidenz dauert rund 3,7 min, der Workflow erlaubt 30 min.

**Einordnung je Zeile (`reading`)**, nachrechenbar in `signal-evidence.mjs#readingOf`:

| Wert | Bedeutung | Anzeige |
|---|---|---|
| `NOT_SIGNIFICANT` | nach Bonferroni-Korrektur kein statistisch gesicherter Unterschied zum Querschnitt nachgewiesen. Das ist kein Nachweis von Gleichheit: bei rund einem Marktjahr kann ein kleiner Unterschied unentdeckt bleiben. | „kein gesicherter Unterschied“ |
| `MIXED` | belastbar im Gesamtmittel, aber das Vorzeichen wechselt zwischen Marktphasen (SPY über/unter SMA 50) oder Zeithälften | „uneinheitlich“ |
| `WITH_DIRECTION` | belastbar und in allen Teilmengen wie die übliche Lesart | „wie übliche Lesart“ |
| `AGAINST_DIRECTION` | belastbar und in allen Teilmengen gegen die übliche Lesart | „gegen übliche Lesart“ |
| `NEUTRAL_PATTERN` | Muster ohne Richtung (Doji u. a.) | „ohne Richtung“ |

**Datengrundlage:** je Titel die 270 veröffentlichten Tagesbars, also rund ein Marktjahr bis zum Stichtag. Das ist kein voller Zyklus. Die Anzeige sagt das ausdrücklich. Das Feld `window.from` im Artefakt reicht weiter zurück, weil einzelne eingefrorene Reihen alt sind, und wird deshalb nicht angezeigt.

## 3. Anzeige

Methodik-Seite, Abschnitt „Historische Beobachtung: Indikator-Ereignisse und Kerzenmuster“, unter den Indikatoren:
- Einleitung zu den drei Ebenen, Messmethode, Einordnung, Grenzen (Kosten, Survivorship Bias).
- Je Gruppe ein Satz mit der Zählung, zum Beispiel „18 ausgewiesen: 16 kein gesicherter Unterschied, 2 gegen übliche Lesart. Keine Zeile ist ein Kauf- oder Verkaufssignal.“
- Tabelle: Ereignis (übliche Lesart), Einordnung, Verlauf gegenüber dem Querschnitt nach 20 Tagen (nicht richtungsbereinigt: positiv heißt, der Titel lief besser), n. Als Tooltip steht je Zeile ein Satz (`model.js#signalEvidenceText`).
- Mobil (390 px): Die Einordnung steht in der zweiten Spalte und ist ohne Scrollen sichtbar.
- Fehlt die Datei, entfällt der Abschnitt.

Bewusst nicht im Chart: Kerzenmarken und Befundkarten bleiben ohne Statistik. So erscheint keine Zahl neben einem einzelnen Ereignis, die man als Erwartung lesen könnte.

## 4. Vorher/Nachher

| | vorher | nachher |
|---|---|---|
| `technical/data` | 4 Dateien | 5 Dateien (+ `signal-evidence.json`) |
| `screener-v1.json`, `index-v1.json`, `meta.json`, `formation-evidence.json` | – | unverändert (byte-gleich bis auf Laufzeitfelder) |
| Methodik-Seite | Formations-Evidenz | dazu 18 Indikator-Ereignisse und 77 Kerzenmuster |

Ergebnis, Stand 28.10.2026:

| | kein gesicherter Unterschied | uneinheitlich | wie übliche Lesart | gegen übliche Lesart | ohne Richtung |
|---|---|---|---|---|---|
| Indikator-Ereignisse (18) | 16 | 0 | 0 | 2 | – |
| Kerzenmuster (77) | 65 | 0 | 1 | 6 | 5 |

Die belastbaren Zeilen (Verlauf gegenüber dem Querschnitt nach 20 Handelstagen):

| Ereignis (Lesart) | n | Verlauf | Einordnung |
|---|---|---|---|
| MACD kreuzt Signallinie aufwärts (bullisch) | 32.071 | −2,1 % ± 0,9 | gegen übliche Lesart |
| Supertrend dreht aufwärts (bullisch) | 10.325 | −3,0 % ± 1,3 | gegen übliche Lesart |
| Grabstein-Doji (bärisch) | 31.407 | −1,9 % ± 0,8 | wie übliche Lesart |
| Matching Low (bullisch) | 25.421 | −1,9 % ± 0,8 | gegen übliche Lesart |
| Libellen-Doji (bullisch) | 23.642 | −3,0 % ± 0,8 | gegen übliche Lesart |
| Takuri (bullisch) | 23.480 | −2,9 % ± 0,8 | gegen übliche Lesart |
| Tweezer Top/Bottom (bullisch) | 17.590 | −2,0 % ± 0,9 | gegen übliche Lesart |
| Stick Sandwich (bullisch) | 1.998 | −2,9 % ± 1,5 | gegen übliche Lesart |
| Modifizierter Hikkake (bullisch) | 1.117 | −4,1 % ± 1,4 | gegen übliche Lesart |

Auch die belastbaren Zeilen sind historische Mittelwerte über rund ein Marktjahr: keine Prognose, kein Handelsvorteil.

## 5. Tests

`technical/tests/technical-world.test.mjs`:
- Vertrag: Schema, Horizont, `claims.strategyEdge = "nicht nachgewiesen"`.
- Jede Einordnung ist mit `readingOf` nachrechenbar.
- Nur Zeilen ab der Mindeststichprobe; „belastbar“ nur außerhalb des 95-%-Bands.
- Kein Satz enthält Signal- oder Empfehlungssprache.
- `technical/data` enthält genau die 5 Dateien.

## 6. Vergleichsgruppe und Marktbreite (signal-evidence 1.1.0, formation-evidence 1.1.0; 23.11.2026)

Fachmodell-PR, nur Daten: Die Oberfläche bleibt unverändert, bis sie die neuen Felder liest. Bestehende Felder, `reading`, `significant` und `stableSign` rechnen wie zuvor.

**Warum.** Die Anzeige vergleicht die Trefferquote eines Musters mit 50 %. Das ist die falsche Hürde: Gemessen wird gegen das Querschnitts*mittel*, und weil der Median der Renditen unter ihrem Mittel liegt, schlägt ein zufällig gewählter Titel das Mittel seltener als jeder zweite. Die richtige Hürde ist die Quote aller Titel an denselben Tagen.

**Neue Felder** (Regeln in `scripts/technical/evidence-phases.mjs`):

| Feld | Bedeutung |
|---|---|
| `baseHitRate` | Vergleichsquote: Anteil aller Titel desselben Datums über dem Querschnittsmittel (bei bärischer Lesart: darunter), gemittelt über die Ereignisdaten mit Vielfachheit. Nur Daten mit mindestens 50 Titeln. |
| `breadth.BROAD` / `breadth.NARROW` | dieselben Kennzahlen (n, Mittel, 95-%-Band, Trefferquote, Vergleichsquote) getrennt nach Marktbreite am Ereignistag: Anteil der Titel mit Schluss über dem eigenen SMA 200 (Vollhistorie, je Bar kausal); `BROAD` ab 50 %, sonst `NARROW`. |
| `breadthDates` | Zahl der Handelstage je Marktbreite im Fenster |
| `method.base`, `method.breadth` | die beiden Regeln als Text |

Formationen tragen `baseHitRate` und `breadth` je Typ (`excess20Mean`, `excess20Ci95`, `hitRate`, `baseHitRate`, `n`). Die Marktphase nach SPY/SMA 50 (`phases`, Grundlage von `stableSign`) bleibt daneben bestehen.

**Vorher/Nachher** (Probelauf mit `--out`, Materialisierung Stand 20.11.2026, 5.451 Titel; alter und neuer Code auf demselben Bestand):

| | vorher | nachher |
|---|---|---|
| bestehende Felder, 95 Zeilen Indikatoren und Kerzen | – | 0 Abweichungen |
| bestehende Felder, 24 Formationstypen | – | 0 Abweichungen |
| `signal-evidence.json` | 22 kB | 44 kB |
| `formation-evidence.json` | 9,5 kB | 15,5 kB |
| Laufzeit | 82 s + 178 s | 91 s + 168 s |

Ergebnis des Probelaufs (Fenster: 101 Tage breiter Markt, 174 Tage schmaler Markt):

- Vergleichsquote bei üblicher Lesart „steigend“ (44 Zeilen): 43,3 % bis 46,2 %, Median 45,5 %. Bei „fallend“ (46 Zeilen): 53,6 % bis 55,1 %, Median 54,6 %.
- Von 90 gerichteten Zeilen liegen 45 über 50 %, aber nur 29 über ihrer Vergleichsquote. 29 Zeilen liegen über 50 % und trotzdem nicht über der Vergleichsgruppe; 13 liegen unter 50 % und trotzdem darüber.
- Beispiel: „PSAR dreht abwärts“ zeigt 53,3 % Treffer, die Vergleichsgruppe an denselben Tagen 54,6 %. Das Muster lag also unter dem Zufall, obwohl die Zahl über 50 % steht.
- Die fünf Muster ohne Richtung liegen mit 44,6 % bis 45,5 % praktisch auf ihrer Vergleichsquote von 45,3 %: Die Vergleichsgruppe misst, was sie messen soll.
- Bei 27 von 88 Zeilen mit mindestens 100 Fällen in beiden Marktbreiten wechselt das Vorzeichen des Mittels zwischen breitem und schmalem Markt.
- Formationen: 16 von 23 veröffentlichten Typen liegen über 50 %, 14 über ihrer Vergleichsquote. Am deutlichsten „Ausbruch aus Range“: 58,4 % gegen 51,4 %, in beiden Marktbreiten (56,0 % gegen 50,8 % und 58,8 % gegen 51,5 %).

Die Zahlen sind beschreibend, über rund ein Marktjahr, ohne Kosten. Sie sind keine Prognose und kein Nachweis eines Handelsvorteils. Die veröffentlichten Artefakte schreibt weiterhin nur `build-screener.mjs` im regulären Lauf; bis dahin fehlen die Felder, und jeder Leser muss damit umgehen.

**Tests:** `quant/tests/technical-evidence-phases.test.mjs` (Marktbreite, Vergleichsgruppe, Durchreichen ohne Einfluss auf `reading`), `technical/tests/technical-world.test.mjs` (Quoten und Teilmengen am Artefakt, sobald vorhanden).
