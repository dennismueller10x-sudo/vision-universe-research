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
