# Screener – Zeitbezug veralteter Titel (`technical-screen-row-1.10.0`, AP1)

Fachmodell-PR zur Owner-Freigabe. Gehört zu [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md), Kriterien A3, F4 und J2 (P0).

## Befund

Der Screener hat einen Stichtag: den häufigsten letzten Bar im Universum, am 26.10.2026 also der 26.10. Ein Titel gilt als veraltet (`fresh = false`), wenn sein letzter Bar davor liegt. Das traf am 26.10. auf 82 von 5.657 Titeln zu. Ihr letzter Kurs lag zwischen dem 18.08. und dem 23.10. Bei den meisten endet die Reihe trotz aktivem Stamm (`MASTER_ACTIVE_SERIES_ENDED`, Marktdaten-Domäne).

Die Ereignis- und Stichtagsfelder dieser Titel zählten ab ihrem **eigenen** letzten Bar. Ein Ereignisfilter lieferte sie deshalb als aktuelle Treffer, obwohl das Ereignis Tage bis Monate zurückliegt. Beispiele:
- ATKR mit „Neues 52-Wochen-Hoch“ vom 16.10.;
- AVB mit „Schluss über SMA 200 gekreuzt“ vom 17.08.;
- 48 Titel mit NR7 und 26 mit einer Volumenspitze von einem alten Tag.

Ein solches Signal ist rückdatiert, ohne dass es als rückdatiert erkennbar ist.

**Zweiter Befund: eingefrorene Reihen.** Für 233 Titel liefert der Anbieter seit Wochen bis über ein Jahr denselben Schlusskurs, meist ohne Volumen. Das ist typisch nach Delisting oder Übernahme, z. B. CHL, TTM, CEO, OZON und ANSS. `core/listing-staleness.js` erkennt das als `STALE_TAIL`: mindestens 5 exakt gleiche Schlüsse, Schwelle und Verteilung sind dort begründet. Diese Titel galten trotzdem als „aktuell“, weil ihr letzter Bar auf den Stichtag fällt. Alle Kennzahlen entstanden aus erfundenen Bars:
- Ein konstanter Kurs ist immer sein eigenes 52-Wochen-Hoch. 64 der 188 Treffer für „Neues 52-Wochen-Hoch“ kamen daher.
- Flache Bars sind immer NR7. Das betraf 273 der 1.255 NR7-Treffer.
- RSI-Werte von 0 oder 100 hingen allein von der Rechenkonvention ab. Chart (270 Bars) und Screener (Vollhistorie) zeigten deshalb bei 36 Titeln verschiedene RSI-Werte, bis zu 100 Punkte auseinander.

## Regel (ab 1.10.0)

Für Titel mit `fresh = false` gilt:

| Art | Felder | Wert |
|---|---|---|
| Ereignisse „Tage seit“ und ihre Prüfräume | `goldenCrossDays`, `deathCrossDays`, `crossAboveSma200Days`, `crossBelowSma200Days`, `rsiExitOversoldDays`, `rsiExitOverboughtDays`, `newHigh52wDays`, `formationNewDays`, `candleBullDays`, `candleBearDays` und die Fenster `smaCrossWindow`, `sma200CrossWindow`, `rsiEventWindow`, `high52wWindow`, `formationWindow`, `candleWindow` | `null` |
| Zustände am Stichtag (Tag) | `chg1d`, `newHigh20d`, `newLow20d` | `null` |
| Zustände am Stichtag (Tag, Woche, Monat) | `newHigh52w`, `relVol`, `volAboveAvg`, `volSpike`, `insideBar`, `nr7`, `candleBullish`, `candleBearish`, `candleNeutral`, jeweils auch `@1W` und `@1M` | `null` |
| Niveaus und Lagen | RSI, Abstände, Lage zu Linien, ROC, Volatilität, Formationszustände, Schlusskurs | Stand des letzten Kurses, erkennbar an `fresh = false` und `asOf`. Die Oberfläche zeigt „Kurs vom …“. |

**Eingefrorene Reihe** (`frozenSince` = letzter echter Handelstag, neu als Spalte):
- Endet die Tagesreihe mit mindestens `ListingStaleness.DEFAULTS.dailyMinRun` (5) exakt gleichen Schlüssen, ist der Titel nie `fresh`.
- Zusätzlich zu den Feldern oben sind **alle Analysefelder** leer, das heißt jedes Abfragefeld außer Kurs und Datenqualität, je Tag/Woche/Monat, sowie die Formationsliste.
- Grund: Die Bars nach `frozenSince` sind keine Kurse. Auch Niveaus wären aus ihnen gerechnet.
- Es bleiben `close`, `asOf`, `bars`, `hasVolume`, `spark` und `frozenSince`. Die Trefferliste zeigt „Kurs unverändert seit …“.
- Grenzfälle: 67 der 233 Titel zeigen nach dem Einfrieren noch einzelne Bars mit Volumen oder Spanne bei gleichem Schluss. Teils füllt der Anbieter auf, teils sind es illiquide Vorzugsaktien und Aktienklassen ohne Kursänderung. Auch dort entsteht kein Signal mit Gehalt: Ohne Kursänderung gibt es keinen Ausbruch, kein Momentum und keinen Trend. Leer ist also vorsichtig, aber nicht falsch.

**Warum `null` und nicht „Tage + Rückstand“:**
- Zwischen dem letzten Bar und dem Stichtag fehlen Kurse. Ein Ereignis in dieser Lücke ist weder belegt noch ausgeschlossen.
- „Tage seit dem letzten bekannten Ereignis + Rückstand“ ist nur eine Obergrenze. Ein Filter „mehr als N Tage her“ würde daraus falsch „ja“ schließen.
- Auch der Prüfraum wird `null`. Sonst schlösse die Abfrage aus „kein Ereignis im Prüfraum“ auf „mindestens W Tage her“ (`technical-query.js`, `whenAbsent`).
- Ergebnis: Für einen veralteten Titel sind Ereignisfilter „unbekannt“. Er erscheint dort nicht als Treffer und zählt im Trichter als „fehlend“.

**Warum nicht der ganze Titel leer:** Niveaus bleiben eine wahre Aussage über den letzten Kurs. Der Titel bleibt suchbar und ist als veraltet gekennzeichnet.

**Woche und Monat:** Auch die `@1W`/`@1M`-Stichtagsfelder werden leer. Das ist bewusst vorsichtig. Ein um einen Tag veralteter Titel kann noch dieselbe abgeschlossene Woche haben. Das kommt selten vor (6 Titel am 26.10.), und ein falscher Treffer wiegt schwerer als ein fehlender.

## Umsetzung

- `quant/engines/technical/screen-row.js`:
  - `markStale(row)` und die Listen `STALE_EVENT_FIELDS`, `STALE_DAY_FIELDS`, `STALE_TF_FIELDS`;
  - `computeRow` wendet `markStale` an, wenn `universeAsOf` bekannt ist und abweicht.
- `screen-row.js#markFrozen(row, since, keys)`.
- `scripts/technical/world/build-screener.mjs`:
  - `frozenSince` je Titel aus `ListingStaleness.tailRun` (dieselbe Schwelle wie DQ-PX-6).
  - Nachdem der Stichtag bestimmt ist: `fresh = asOf = Stichtag und nicht eingefroren`. Eingefroren → `markFrozen` mit `analyticFields()` (Abfragekatalog ohne Kurs und Datenqualität). Sonst gilt: `fresh = false` → `markStale`.
- Trefferliste (`technical/app.js`): Hinweis „Kurs unverändert seit …“ statt „Kurs vom …“. Sonst keine Oberflächenänderung.
- **DQ-TW-6** (`core/data-quality.js`, WARN):
  - Kein veralteter Titel trägt einen Wert in diesen Spalten. Die Liste stammt aus `screen-row.js`.
  - Kein eingefrorener Titel trägt ein Analysefeld oder gilt als aktuell.
  - Das Einfrieren ermittelt die DQ-Prüfung **unabhängig** aus den Tagesbars der Materialisierung, und `frozenSince` muss damit übereinstimmen.
- Tests:
  - `quant/tests/technical-screener-freshness.test.mjs`:
    - frischer Titel unverändert;
    - veralteter Titel ohne Ereignisse, Niveaus erhalten;
    - jedes Abfragefeld mit Prüfraum ist erfasst, sodass ein neues Ereignisfeld ohne Entscheidung auffällt;
    - Abfrageverhalten.
  - `core/tests/data-quality.test.mjs`: DQ-TW-6.

## Vorher/Nachher

Datenstand 26.10.2026, 5.657 Titel. Erzeuger `build-screener.mjs --out`, vorher = `main` (`db2bec0`), nachher = dieser PR.

| Titel | Anzahl | geändert |
|---|---|---|
| aktuell (`fresh`) | 5.347 | 0 (keine Abweichung in allen 134 Spalten) |
| Kurs hinter dem Stichtag | 77 | 77, nur Ereignis- und Stichtagsfelder |
| eingefroren (`frozenSince`), davon vorher als aktuell geführt | 233, davon 228 | 233, alle Analysefelder |

Neue Spalte: `frozenSince`. Es entfällt keine Spalte, und kein Titel kommt hinzu oder fällt weg.

Wie lange die 233 Titel schon eingefroren sind (Handelstage, ungefähr):

| ≥ 5 | ≥ 10 | ≥ 20 | ≥ 60 | ≥ 120 | ≥ 250 |
|---|---|---|---|---|---|
| 229 | 215 | 202 | 187 | 164 | 104 |

| Abfrage (Tag) | Treffer vorher | Treffer nachher | weg |
|---|---|---|---|
| Golden Cross ≤ 10 Tage | 96 | 89 | 7 |
| Schluss über SMA 200 gekreuzt ≤ 5 Tage | 481 | 470 | 11 |
| Neues 52-Wochen-Hoch | 188 | 124 | **64** |
| Volumenspitze | 541 | 512 | 29 |
| NR7 | 1.255 | 982 | **273** |
| Inside Bar | 748 | 724 | 24 |
| Neue Formation ≤ 5 Tage | 1.576 | 1.543 | 33 |
| Tagesänderung > 5 % | 209 | 203 | 6 |
| RSI 14 < 30 | 740 | 704 | 36 |
| RSI 14 > 70 | 327 | 273 | 54 |
| Kurs über SMA 200 | 2.032 | 1.936 | 96 |
| ADX > 25 | 2.788 | 2.644 | 144 |
| Formation bestätigt (beliebiger Typ) | 2.613 | 2.585 | 28 |

Bei Niveaufiltern (RSI, SMA, ADX) fallen nur eingefrorene Titel weg. Titel, deren Kurs nur hinter dem Stichtag liegt, bleiben dort Treffer, wie vorgesehen.

**DQ-TW-6:**
- mit den Daten von `main`: FAIL, 543 Verstöße. Darunter sind 82 veraltete Titel mit Ereignissen und eingefrorene Titel, die als aktuell geführt werden, beides unabhängig aus den Bars erkannt.
- mit der Ausgabe dieses PRs: PASS, 310 geprüft (77 hinter dem Stichtag, 233 eingefroren), 0 Verstöße.

**Chart ↔ Screener:** Für alle 5.657 Titel wurde RSI 14 im Chart (aus 270 Bars) mit dem Screener-Wert (aus der Vollhistorie) verglichen. Median der Abweichung 0,003, 95. Perzentil 0,005; das ist Rundung. Die 36 Ausreißer über 1 Punkt sind ausschließlich eingefrorene Titel. Beim ADX gilt dasselbe für die Ausreißer.

## Nach der Freigabe

1. `technical/data` mit dem Erzeuger neu bauen (`node scripts/technical/world/build-screener.mjs`), nie von Hand.
2. DQ-TW-6 auf `main` prüfen.

Der Neubau übernimmt auch den Versionsstempel `technical-indicators-1.6.0` aus #1066.
