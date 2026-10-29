# Screener – Ereignisse je Woche und Monat, 52-Wochen-Tief (AP4)

Fachmodell-PR zur Owner-Freigabe. Gehört zu [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md), Kriterium E3 (P1).
Versionen: `technical-mtf-1.2.0`, `technical-screen-row-1.11.0`, `technical-query-1.11.0`, `technical-query-text-1.8.0`, Vertrag `technical-screener-contract-1.1.0`.

## 1. Auswahl

Ausgewählt wird nach Evidenz und Bedeutung, nicht nach Anzahl. Grundlage ist [WEEKLY_EVIDENCE.md](WEEKLY_EVIDENCE.md): 36 Jahre, 6.190 Titel. Robust waren drei Wochenbefunde:

| Befund (WEEKLY_EVIDENCE.md) | neues Feld |
|---|---|
| Schluss kreuzt die 40-Wochen-Linie | `crossAboveSma200Days@1W`, `crossBelowSma200Days@1W` (Monat: 10-Monats-Linie) |
| Wochen-RSI 14 verlässt die überverkaufte Zone; Gegenstück: verlässt die überkaufte | `rsiExitOversoldDays@1W`, `rsiExitOverboughtDays@1W` (auch Monat) |
| Neues 52-Wochen-Tief setzt sich fort | `newLow52w` je Tag, Woche, Monat |

Nicht aufgenommen:
- Golden/Death Cross der 10- und 40-Wochen-Linie: Das Vorzeichen ist zwischen den Zeiträumen uneinheitlich.
- Weitere Katalogindikatoren je Woche: Dafür fehlt Evidenz; sie kämen nur nach Anzahl dazu.

Die Felder beschreiben. Sie sind keine Signale mit Erwartungswert: Die Erholungssignale liefen historisch schlechter als der Markt. Die Evidenz dazu steht in WEEKLY_EVIDENCE.md.

## 2. Regeln

**Ereignisse je Woche und Monat** (`multi-timeframe.js#blockAP4`). Die Rechnung ist dieselbe wie bei den Tagesereignissen (`screen-row.js#eventBlock`), nur auf den abgeschlossenen Wochen- bzw. Monatsbars aus der vollen Tageshistorie:
- Wert = Bars des Zeitrahmens seit dem jüngsten Ereignis. 0 heißt: am letzten abgeschlossenen Bar.
- Prüfraum (`sma200CrossWindow@1W`, `rsiEventWindow@1W` usw.) = die zusammenhängenden Bars vom Stichtag rückwärts, an denen das Ereignis entscheidbar ist.
- Ein leerer Wert mit Prüfraum W heißt „kein Ereignis in W Bars“. Beide Werte leer heißt „nicht entscheidbar“.
- Kreuzung an Bar i: am Vorbar nicht darüber (≤), an i darüber (>), bzw. umgekehrt. Jede Prüfung nutzt nur Bars ≤ i.
- Linie: 40 Wochen bzw. 10 Monate (wie `aboveSma200@1W/@1M`). RSI 14 nach Wilder, Schwellen 30 und 70.
- Abfrage: Der Prüfraum gehört zum Zeitrahmen der Bedingung (`technical-query.js`, `fenster@1W`). „Kreuzung vor mehr als 10 Wochen“ ist damit nur dann „ja“, wenn der Prüfraum das belegt (`whenAbsent`, wie beim Tag).

**52-Wochen-Tief:**
- Tag: Tagestief ≤ `low52w` der Vollhistorie. Das ist das Gegenstück zu `newHigh52w`, Tageshoch ≥ `high52w`.
- Woche und Monat: Schluss ≤ tiefster Schluss der letzten 52 Wochen bzw. 12 Monate, einschließlich des aktuellen Bars. Das ist das Gegenstück zu `newHigh52w@1W/@1M`.

**Zeitbezug (AP1):**
- Veraltete Titel tragen keine Ereignisse, in keinem Zeitrahmen. `markStale` leert seit 1.11.0 die Ereignisfelder auch mit `@1W`/`@1M`; `newLow52w` ist Stichtagszustand.
- Eingefrorene Titel tragen kein Analysefeld.
- DQ-TW-6 prüft beides mit den erweiterten Listen.

## 3. Vorher/Nachher

Erzeuger `build-screener.mjs` auf dem Datenstand vom 28.10.2026 (5.659 Titel). Vorher = `main` (`92b010e`), nachher = dieser PR.

| | vorher | nachher |
|---|---|---|
| Spalten | 135 | 150 (+15) |
| bestehende Spalten | – | **alle 135 byte-gleich** |
| `newLow52w` (Tag) | – | 5.347 belegt, davon 308 ja |
| neue Wochen- und Monatsspalten (14) | – | `null`, weil die Bündel noch `technical-mtf-1.1.0` tragen; DQ-TW-5 meldet sie als „wartet auf Materialisierung“ |

Wie bei L7 füllt die nächste reguläre Materialisierung die Wochen- und Monatsspalten, ohne zusätzlichen Anbieterabruf.

Näherung aus den 270 veröffentlichten Tagesbars (`MTF.compute` je Titel, 5.659 Titel). Die volle Historie verlängert vor allem die Prüfräume:

| | Woche | Monat |
|---|---|---|
| Kreuzung aufwärts im Prüfraum / davon ≤ 4 Bars | 2.029 / 803 | 716 / 716 |
| Kreuzung abwärts im Prüfraum / davon ≤ 4 Bars | 2.626 / 1.080 | 1.320 / 1.320 |
| RSI von unten über 30 / ≤ 4 Bars | 1.930 / 346 | nicht entscheidbar (15 RSI-Bars nötig) |
| RSI von oben unter 70 / ≤ 4 Bars | 2.170 / 215 | nicht entscheidbar |
| 52-Wochen- bzw. 12-Monats-Tief ja | 1.028 | 1.664 |
| mittlerer Prüfraum der Linie | 16 Wochen | 2 Monate |

Die Monatswerte der Näherung sind kurz, weil 270 Tagesbars nur 13 Monate ergeben. Mit der vollen Historie (Median rund 138 Monatsbars) sind sie entscheidbar.

Die 232 eingefrorenen Titel zählen in der Näherung als Tief, weil ein konstanter Kurs immer sein eigenes Tief ist. Im Screener sind sie nach AP1 leer.

## 4. Tests

`quant/tests/technical-mtf-ap4.test.mjs`:
- Ereignisse und Tief an 40 Stichtagen gleich einer naiven, unabhängigen Nachrechnung (eigene Wochen-/Monatsbildung, SMA, RSI nach Wilder), kausal.
- Eine Wellenreihe übt Kreuzungen und RSI-Austritte an jedem Bar.
- Bestehende Wochen- und Monatswerte bleiben unverändert.
- Bündel 1.1.0 ergibt `null`, Bündel 1.2.0 wird übernommen.
- Veraltete Titel tragen kein Ereignis je Zeitrahmen.
- Die Abfrage nutzt den Prüfraum des Zeitrahmens; der Vertrag kennt die Prüfraum-Spalten.

Angepasst:
- `technical-events.test.mjs` (Zeitrahmen der vier Ereignisse);
- `technical-mtf-l7.test.mjs` (Version 1.2, Feldliste);
- `technical-screener-freshness.test.mjs` (Ereignisse je Zeitrahmen in der Stale-Liste).

## 5. Nach der Freigabe

1. Mergen. `technical/data` in diesem PR ist mit dem Erzeuger gebaut, nie von Hand.
2. Die nächste reguläre Materialisierung schreibt Bündel mit `technical-mtf-1.2.0`, danach füllt `technical-world.yml` die Spalten.
3. Prüfung wie in SCREENER_FIELDS_L7.md §2d: Füllgrad, Vergleich mit §3, DQ-TW-5 mit allen Wochen- und Monatsspalten.
