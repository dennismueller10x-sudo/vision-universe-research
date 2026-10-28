# Screener – Zeitbezug veralteter Titel (`technical-screen-row-1.10.0`, AP1)

Fachmodell-PR zur Owner-Freigabe. Gehört zu [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md), Kriterien A3, F4 und J2 (P0).

## Befund

Der Screener hat einen Stichtag: den häufigsten letzten Bar im Universum, am 26.10.2026 also der 26.10. Ein Titel gilt als veraltet (`fresh = false`), wenn sein letzter Bar davor liegt. Das traf am 26.10. auf 82 von 5.657 Titeln zu. Ihr letzter Kurs lag zwischen dem 18.08. und dem 23.10. Bei den meisten endet die Reihe trotz aktivem Stamm (`MASTER_ACTIVE_SERIES_ENDED`, Marktdaten-Domäne).

Die Ereignis- und Stichtagsfelder dieser Titel zählten ab ihrem **eigenen** letzten Bar. Ein Ereignisfilter lieferte sie deshalb als aktuelle Treffer, obwohl das Ereignis Tage bis Monate zurückliegt. Beispiele:
- ATKR mit „Neues 52-Wochen-Hoch“ vom 16.10.;
- AVB mit „Schluss über SMA 200 gekreuzt“ vom 17.08.;
- 48 Titel mit NR7 und 26 mit einer Volumenspitze von einem alten Tag.

Ein solches Signal ist rückdatiert, ohne dass es als rückdatiert erkennbar ist.

## Regel (ab 1.10.0)

Für Titel mit `fresh = false` gilt:

| Art | Felder | Wert |
|---|---|---|
| Ereignisse „Tage seit“ und ihre Prüfräume | `goldenCrossDays`, `deathCrossDays`, `crossAboveSma200Days`, `crossBelowSma200Days`, `rsiExitOversoldDays`, `rsiExitOverboughtDays`, `newHigh52wDays`, `formationNewDays`, `candleBullDays`, `candleBearDays` und die Fenster `smaCrossWindow`, `sma200CrossWindow`, `rsiEventWindow`, `high52wWindow`, `formationWindow`, `candleWindow` | `null` |
| Zustände am Stichtag (Tag) | `chg1d`, `newHigh20d`, `newLow20d` | `null` |
| Zustände am Stichtag (Tag, Woche, Monat) | `newHigh52w`, `relVol`, `volAboveAvg`, `volSpike`, `insideBar`, `nr7`, `candleBullish`, `candleBearish`, `candleNeutral`, jeweils auch `@1W` und `@1M` | `null` |
| Niveaus und Lagen | RSI, Abstände, Lage zu Linien, ROC, Volatilität, Formationszustände, Schlusskurs | Stand des letzten Kurses, erkennbar an `fresh = false` und `asOf`. Die Oberfläche zeigt „Kurs vom …“. |

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
- `scripts/technical/world/build-screener.mjs`: Nachdem der Stichtag bestimmt ist, gilt `fresh = false` → `markStale`.
- **DQ-TW-6** (`core/data-quality.js`, WARN): Kein veralteter Titel trägt einen Wert in diesen Spalten. Die Liste stammt aus `screen-row.js`.
- Tests:
  - `quant/tests/technical-screener-freshness.test.mjs`:
    - frischer Titel unverändert;
    - veralteter Titel ohne Ereignisse, Niveaus erhalten;
    - jedes Abfragefeld mit Prüfraum ist erfasst, sodass ein neues Ereignisfeld ohne Entscheidung auffällt;
    - Abfrageverhalten.
  - `core/tests/data-quality.test.mjs`: DQ-TW-6.

## Vorher/Nachher

Datenstand 26.10.2026, 5.657 Titel, 82 veraltet. Erzeuger `build-screener.mjs --out`, vorher = `main` (`db2bec0`), nachher = dieser PR.

- **Frische Titel:** 0 Abweichungen in allen 134 Spalten.
- **Veraltete Titel:** alle 82 geändert, nur in den Spalten der Regel. Kein Titel kommt hinzu oder fällt weg, die Spaltenliste bleibt gleich.

| Abfrage (Tag) | Treffer vorher | Treffer nachher | davon veraltet: vorher → nachher | Beispiele, die wegfallen |
|---|---|---|---|---|
| Golden Cross ≤ 10 Tage | 96 | 95 | 1 → 0 | WBD (Kurs vom 07.10.) |
| Schluss über SMA 200 gekreuzt ≤ 5 Tage | 481 | 473 | 8 → 0 | AIXC (29.09.), ANY (15.09.), AVB (17.08.) |
| Neues 52-Wochen-Hoch | 188 | 182 | 6 → 0 | ATKR (16.10.), CCO (14.10.), DBRG (30.09.) |
| Volumenspitze | 541 | 515 | 26 → 0 | AIXC, AREN (28.08.), ATKR |
| NR7 | 1.255 | 1.207 | 48 → 0 | ACA (23.10.), APGE (04.09.), ATAI (11.09.) |
| Inside Bar | 748 | 724 | 24 → 0 | ACA, ANY, ATAI |
| Bullisches Kerzenmuster (5 Hauptmuster) | 293 | 290 | 3 → 0 | AREN, TWO-P-B, VRME |
| Neue Formation ≤ 5 Tage | 1.576 | 1.545 | 31 → 0 | ACA, AIXC, ANY |
| Tagesänderung > 5 % | 209 | 203 | 6 → 0 | AREN, HWH, MIMI |
| RSI 14 < 30 (Niveau, Gegenprobe) | 740 | 740 | 10 → 10 | unverändert, wie vorgesehen |

**Betroffene Spalten** (Zahl veralteter Titel mit vorher belegtem Wert):

| Spalten | veraltete Titel |
|---|---|
| `chg1d`, `newHigh52w` (Tag, Woche, Monat), `newHigh20d`, `newLow20d`, `insideBar`, `nr7`, alle sechs Prüfräume | 82 |
| `relVol`, `volAboveAvg`, `volSpike` | 81 (Woche 81, Monat 78) |
| Kerzenfelder | 76 |
| `crossBelowSma200Days` | 73 |
| `rsiExitOverboughtDays` | 73 |
| `rsiExitOversoldDays` | 68 |
| `crossAboveSma200Days` | 67 |
| `formationNewDays` | 58 |
| `deathCrossDays` | 50 |
| `goldenCrossDays` | 48 |
| `newHigh52wDays` | 20 |

**DQ-TW-6:**
- mit den Daten von `main`: WARN, 82 / 82 veraltete Titel verletzen die Regel;
- mit der Ausgabe dieses PRs: PASS, 82 geprüft, 0 Verstöße, 46 Spalten.

## Nach der Freigabe

1. `technical/data` mit dem Erzeuger neu bauen (`node scripts/technical/world/build-screener.mjs`), nie von Hand.
2. DQ-TW-6 auf `main` prüfen.

Der Neubau übernimmt auch den Versionsstempel `technical-indicators-1.6.0` aus #1066.
