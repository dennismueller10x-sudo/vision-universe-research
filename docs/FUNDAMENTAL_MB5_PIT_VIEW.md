# M-B5 – Historische Consumer lesen AS_REPORTED_AT_TIME

Stand 2026-10-08 · Kern 1.19.0 + PIT-Sicht (PR #505, gestapelt auf #481) · Zahlen: `scripts/fundamentals-audit/artifacts/FUNDAMENTAL-MB5-PIT-IMPACT.json`

## Vertrag

| Consumer-Klasse | Pfade | Sicht | Durchsetzung |
|---|---|---|---|
| HISTORICAL_VALUES | `build-pattern-research-fundamentals.mjs`, `build-pattern-match.mjs` | `AS_REPORTED_AT_TIME(as_of)` | `pit-fundamental-history` 2.0.0: Aufruf ohne `{view:"AS_REPORTED_AT_TIME"}`, mit LATEST oder Dokument ohne PIT-Sicht → `PIT_CONTRACT`-Fehler. Fehlender Speicher → Abbruch. |
| CURRENT | `build-factor-evidence.mjs` (`fundamental-inputs`), Screener, `quant/api`, Supertrader (Anzeige) | `LATEST_RESTATED` | `fundamental-inputs` 1.1.0: `{view:"LATEST_RESTATED"}` Pflicht; Stichtag > 14 Tage vor `asOf` → `VIEW_CONTRACT`-Fehler. |
| HISTORICAL_DATES_ONLY | CI `reporting_calendar.py`, `calendar_backtest.py` | Termine, keine Werte | – |
| DISPLAY_OF_HISTORY | Discover `priceVsFundamentals`, Journey, `fundamentals-contract.js` | Anzeige | – |

Kein impliziter Default: beide Engines verlangen die Deklaration.

## Datenmodell

`quant/data/sec/consumer-pit/CIK*.json` (eigener Speicher, `scripts/quant/cli.py consumer`):
`pit.annual[metric] = [[fy, end, v, known, accn], …]` – jede Fassung eines Jahreswerts mit dem Tag, ab dem sie öffentlich war. Wert zu `t` = jüngste Fassung mit `known <= t` („as known at date including available corrections“). Berechnet vom Kern selbst (`PeriodResolver.annual` bzw. `derived.reconstruct` zu jedem Einreichungstag), keine zweite Ableitung. Die letzte Fassung ist identisch mit dem LATEST-Wert (Test über 8 echte Emittenten).

Getrennter Speicher statt Block im Bundle: inline wären es 31–35 KB je Bundle gewesen, über dem bestehenden 30-KB-Budget. Das Budget bleibt; der PIT-Speicher hat ein eigenes (48 MB, gemessen 34,9 MB).

## Warum es nötig war

Die LATEST-Zeile eines Jahres trägt das Datum der jüngsten Einreichung, die den Wert wiederholt – meist die Vergleichsspalte im 10-K des Folgejahres. Als Historie gelesen erschien ein Jahr bis zu einem Jahr zu spät (USAU FY2015: bekannt 2015-08-13, LATEST-Zeile 2016-07-29; PIPR FY2024: 2025-02-27 vs. 2026-02-26), und ein korrigiertes Jahr zeigte den heutigen Wert (NEOG FY2017: 361,6 Mio. bekannt ab 2017-07-28, korrigiert auf 358,3 Mio. am 2018-10-05).

| Messung (5.072 Emittenten) | Wert |
|---|---|
| Kennzahl-Jahre | 361.328 |
| mit mehr als einer Fassung | 76.684 (21,2 %) |
| LATEST-Datum später als erste Bekanntheit | 314.754 (87,1 %) |
| Beobachtungen (Monatsende × Emittent) | 413.766 |
| nur mit PIT sichtbar | 46.801 |
| nur mit LATEST sichtbar | 0 |
| mindestens ein Merkmal anders | 349.807 (84,5 %) |

## Wirkung auf die Pattern-Studie (Methodik 1.0.0 → 1.0.1, nur Datenquelle)

| Lauf | ROBUST | IN_SAMPLE_ONLY | NOT_SIGNIFICANT | PARAMETER_SENSITIVE | INSUFFICIENT_SUPPORT |
|---|---|---|---|---|---|
| veröffentlicht (main, Kern 1.10, LATEST) | 184 | 110 | 39 | 3 | 1 |
| Kern 1.19, LATEST | 192 | 105 | 35 | 3 | 2 |
| Kern 1.19, AS_REPORTED_AT_TIME | 178 | 129 | 27 | 3 | 0 |

Allein durch die Sicht (Kern fest): 61 von 337 Urteilen ändern sich, 164 sind in beiden ROBUST. Hypothesen, Kandidaten, Fenster, Schwellen und Korrekturverfahren sind unverändert; nichts wurde nach dem Ergebnis angepasst.

## Migration

Der PIT-Speicher muss vor dem Code auf `main` liegen (ein Consumer-Lauf mit diesem Kern). Ohne ihn bricht der Pattern-Schritt der Materialisierung ab – gewollt, kein stiller Rückfall auf LATEST.
