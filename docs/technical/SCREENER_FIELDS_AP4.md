# Screener – Ereignisse je Woche und Monat, 52-Wochen-Tief (AP4)

Fachmodell-PR zur Owner-Freigabe. Gehört zu [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md), Kriterium E3 (P1).
Versionen: `technical-mtf-1.2.0`, `technical-screen-row-1.11.0`, `technical-query-1.11.0`, `technical-query-text-1.8.0`, Vertrag `technical-screener-contract-1.1.0`.

## 1. Auswahl und Einordnung

Ausgewählt wird nach Bedeutung für den Screener und nach vorhandener Evidenz, nicht nach Anzahl. Dabei sind drei Ebenen zu unterscheiden:

| Ebene | Bedeutung | Gilt hier? |
|---|---|---|
| **Technisch definiertes Ereignis** | Eine eindeutige, nachrechenbare Regel. Beispiel: „der Wochenschluss liegt über der 40-Wochen-Linie, der Vorwochenschluss nicht“. | Ja, für alle Felder dieses PRs. Das ist ihr einziger Anspruch. |
| **Statistische historische Beobachtung** | Was nach dem Ereignis in der Vergangenheit im Mittel geschah, gemessen in [WEEKLY_EVIDENCE.md](WEEKLY_EVIDENCE.md): Überrendite gegen SPY über 13 Wochen, 1990–2026, 6.190 Titel, mit Robustheitsläufen. | Nur beschreibend und teils gegen die übliche Lesart, siehe unten. |
| **Handelbarer Strategievorteil** | Ein Vorteil nach Kosten, Ausführung, Liquidität und Out-of-Sample-Prüfung. | **Nein.** Für keines der Felder ist ein solcher Vorteil nachgewiesen. Die Felder sind keine Kauf- oder Verkaufssignale. |

Was die Wochen-Evidenz zu den Feldern sagt (nur Wochenbasis; für Monatswerte gibt es keine eigene Evidenz):

| Ereignis | Feld | Historische Beobachtung (Überrendite gegen SPY über 13 Wochen, gemessen in Signalrichtung: positiv heißt, der Kurs lief wie das Ereignis üblicherweise gelesen wird) | Bedeutung |
|---|---|---|---|
| Schluss kreuzt die 40-Wochen-Linie **aufwärts** | `crossAboveSma200Days@1W` | Die Titel liefen danach im Mittel **schlechter** als der Markt: −1,2 %, ab 5 $ −1,9 %. Das Vorzeichen ist in beiden Zeiträumen gleich. Mit einer Woche Verzug ist der Effekt ab 2016 nicht mehr signifikant. | Robust **entgegen** der üblichen Lesart als Kaufsignal. Kein Kaufsignal. |
| Schluss kreuzt die 40-Wochen-Linie **abwärts** | `crossBelowSma200Days@1W` | Das Vorzeichen ist uneinheitlich (alle −0,35 %, ab 5 $ +0,83 %). | Nicht robust. Aufgenommen als Gegenstück, damit beide Richtungen filterbar sind. |
| Wochen-RSI 14 **von unten über 30** | `rsiExitOversoldDays@1W` | Im Mittel **schlechter** als der Markt: −2,0 %, ab 5 $ −3,7 %. Das gilt vor und nach 2016. | Robust **entgegen** der üblichen Lesart als Erholungssignal. Kein Kaufsignal. |
| Wochen-RSI 14 **von oben unter 70** | `rsiExitOverboughtDays@1W` | −1,6 % in Signalrichtung, also eher gestiegen statt gefallen; ab 5 $ nicht signifikant. | Nicht robust. Aufgenommen als Gegenstück. |
| **Neues 52-Wochen-Tief** | `newLow52w@1W` | Mit einer Woche Verzug und ab 5 $ setzt sich der Rückgang im Mittel fort: +1,2 % bzw. +2,1 % in Signalrichtung, vor und nach 2016. Ohne Verzug ist das Vorzeichen uneinheitlich, und die erste Woche bringt im Mittel eine Gegenbewegung. | Der einzige richtungsgleiche robuste Befund. Auch er ist ein historischer Mittelwert, kein Verkaufssignal und kein Strategievorteil: Kosten, Leerverkaufsbeschränkungen und Survivorship Bias sind nicht berücksichtigt. |

Nicht aufgenommen:
- Golden/Death Cross der 10- und 40-Wochen-Linie: Das Vorzeichen ist zwischen den Zeiträumen uneinheitlich, und als technisches Ereignis bringen sie gegenüber den bestehenden Tagesfeldern wenig Neues.
- Weitere Katalogindikatoren je Woche: Dafür fehlt Evidenz.

In der Oberfläche heißen die Felder „Wochen seit …“ bzw. „Monate seit …“. Sie werden nicht als Signal, Empfehlung oder Chance bezeichnet. Die historische Einordnung steht in WEEKLY_EVIDENCE.md.

## 2. Regeln

**Ereignisse je Woche und Monat** (`multi-timeframe.js#blockAP4`). Die Rechnung ist dieselbe wie bei den Tagesereignissen (`screen-row.js#eventBlock`), nur auf den abgeschlossenen Wochen- bzw. Monatsbars aus der vollen Tageshistorie:
- Wert = Bars des Zeitrahmens seit dem jüngsten Ereignis. 0 heißt: am letzten abgeschlossenen Bar.
- Prüfraum (`sma200CrossWindow@1W`, `rsiEventWindow@1W` usw.) = die zusammenhängenden Bars vom Stichtag rückwärts, an denen das Ereignis entscheidbar ist.
- Ein leerer Wert mit Prüfraum W heißt „kein Ereignis in W Bars“. Beide Werte leer heißt „nicht entscheidbar“.
- Kreuzung an Bar i: am Vorbar nicht darüber (≤), an i darüber (>), bzw. umgekehrt. Jede Prüfung nutzt nur Bars ≤ i.
- Linie: 40 Wochen bzw. 10 Monate (wie `aboveSma200@1W/@1M`). RSI 14 nach Wilder, Schwellen 30 und 70.
- Abfrage: Der Prüfraum gehört zum Zeitrahmen der Bedingung (`technical-query.js`, `fenster@1W`). „Kreuzung vor mehr als 10 Wochen“ ist damit nur dann „ja“, wenn der Prüfraum das belegt (`whenAbsent`, wie beim Tag).

**52-Wochen-Tief: unterschiedliche Basis je Zeitrahmen**

| Zeitrahmen | Regel | Basis | Beschriftung |
|---|---|---|---|
| Tag | Tagestief ≤ `low52w`. Das ist das rollierende Minimum der **Tagestiefs** über 252 Handelstage aus der Vollhistorie (`feature-store.js`). | Tagestief, also Intraday-Tief | „Neues 52-Wochen-Tief: Tagestief auf dem tiefsten Tagestief der letzten 52 Wochen“ |
| Woche | Wochenschluss ≤ tiefster Wochenschluss der letzten 52 Wochen, einschließlich des aktuellen Bars | Schlusskurse | „52-Wochen-Schlusstief: Wochenschluss auf dem tiefsten Wochenschluss der letzten 52 Wochen“ |
| Monat | Monatsschluss ≤ tiefster Monatsschluss der letzten 12 Monate | Schlusskurse | „12-Monats-Schlusstief: Monatsschluss auf dem tiefsten Monatsschluss der letzten 12 Monate“ |

- Die Regeln sind das Gegenstück zu `newHigh52w` (Tag: Tageshoch, Woche und Monat: Schluss).
- Ein Titel kann deshalb am Tag ein neues Tief markieren, ohne dass der Wochenschluss ein Schlusstief ist, und umgekehrt.
- Fehlt Historie (weniger als 52 Wochen bzw. 12 Monate, oder kein `low52w`), ist der Wert `null`, nie `false`.

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
- Tagestief-Basis des Tagesfelds und Beschriftung je Zeitrahmen; fehlende Historie ergibt `null`.
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

### 5a. Ergebnis der Prüfung am 30.10.2026 (E3 ✔)

Prüfung 06:47–06:50 UTC, ohne Anbieterabruf und ohne Commit. Der Erzeuger lief lokal mit `--out`, damit der automatische Lauf unverfälscht bleibt.

- **Eingang:**
  - Materialisierung `9685f63` (06:44 UTC), Bündel `technical-mtf-1.2.0`, letzter Bar 29.10.
  - 5.661 Titel: 5.349 aktuell, 80 hinter dem Stichtag, 232 eingefroren; 42 s.
- **Prüfräume:** belegt für 100 % der aktuellen Titel (RSI Monat 98,6 %).
- **Ereignisse:** belegt, wo ein Ereignis im Prüfraum liegt (aktuelle Titel):

| | Linie auf | Linie ab | RSI über 30 | RSI unter 70 | 52-W-/12-M-Tief |
|---|---|---|---|---|---|
| Woche | 96,6 % (≤ 4 Bars: 757) | 96,7 % (1.040) | 92,5 % (319) | 91,7 % (218) | ja bei 940 |
| Monat | 95,2 % (≤ 4: 1.818) | 95,3 % (2.264) | 55,5 % | 65,8 % | ja bei 1.544 |
| Tag | 85,3 % | 88,1 % | 88,6 % | 89,3 % | ja bei 264 (Tagestief) |

- **Näherung aus §3** (≤ 4 Wochenbars): 803 / 1.080 / 346 / 215; gemessen 757 / 1.040 / 319 / 218. Die Abweichung liegt im erwarteten Rahmen.
- **Nicht aktuelle Titel:** in allen 21 Spalten leer (AP1).
- **Datenqualität:** DQ-TW-1..7 PASS (DQ-TW-5 0/60, DQ-TW-6 0/312, DQ-TW-7 0/5.661).
- **Am selben Tag automatisch committet:** Der Zeitplan-Lauf von technical-world (`b65def8`) hat dieselben Spalten in den Datensatz geschrieben.

