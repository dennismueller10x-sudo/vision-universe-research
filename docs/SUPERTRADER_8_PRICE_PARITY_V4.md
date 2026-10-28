# Supertrader 8.0 – zentraler Preisabgleich der Research-Kurse (V4)

Stand 27.10.2026, gemessen auf dem Repository-Stand vom 26.10.2026 (`main` 7b6dcfe, enthält 1527253). Aktivierungsvoraussetzung V4 aus `docs/SUPERTRADER_8_DAILY_RUN.md` (#973).

Gilt weiter unverändert:
- Alle 13 Strategien sind `LIVE_NOT_APPROVED`; `VALIDATED_TRADE_SIGNAL` bleibt gesperrt.
- Keine neuen Datenanbieter, keine Abrufe; der Abgleich liest nur committete Dateien.

## Preiswahrheit (ADR-002)

| | Quelle | Leser |
|---|---|---|
| Research-Kurse | Tagesbalken `quant/data/product/technical-signals-v1` (split-adjustiert, 270 Sitzungen) | `eod-adapter.mjs` |
| Veröffentlichter Schluss | Discover-Tagesreihe `quant/data/market/discover-series/<securityId>.json` | ausschließlich `quant/engines/published-close.js` (`lastPoint`, `roundClose`) |

Neues Modul: `scripts/supertrader/source-faithful/product/price-parity.mjs` (`sf8-price-parity-1.0.0`). Es bildet keinen eigenen Kurs und keine eigene Adjustierung.

## Prüfung

Ergebnis im Datenqualitätsvertrag `sf8-data-quality-1.1.0` (Prüfungen `PRICE_PARITY`, `PRICE_HISTORY_PARITY`):

| Frage | Regel | Ergebnis bei Verstoß |
|---|---|---|
| Börsenlisting und Security-ID | `securityId` der Reihe = `core/identity.js#securityIdForTicker(ticker)` = Kennung des Titels; `ticker` und `instrumentId` = US-Ticker; Währung USD. Ein ADR wird nie mit dem Heimatlisting verglichen. | FAIL `PRICE_IDENTITY_MISMATCH` |
| Fehlender Preis | Referenzreihe fehlt | FAIL `PRICE_REFERENCE_MISSING` |
| Vertrag der Reihe | `lastPoint` verlangt echt, Tiingo, `SPLIT_ADJUSTED`, daily, Währung, Veröffentlichungsgrundlage, Schema `discover-series-1.1.0` | FAIL `PRICE_REFERENCE_INVALID` |
| Datum: veraltet | letzter veröffentlichter Punkt vor dem Stichtag (oder Titel ohne Balken am Stichtag) | FAIL `PRICE_REFERENCE_STALE` |
| Datum: neuer | Reihe schon über den Stichtag hinaus; seitdem kann nachadjustiert sein, ein Vergleich wäre nicht zeitgleich | FAIL `PRICE_REFERENCE_AHEAD` |
| Schluss am Stichtag | `roundClose(close) === lastPoint.close`. Es gibt **keine Toleranz**: Die einzige Umformung ist die Rundungsregel der Veröffentlichung (ab 1 $ Cent, darunter vier signifikante Stellen). | FAIL `PRICE_CLOSE_MISMATCH` |
| Verlauf | Jede gemeinsame Sitzung ist nach `roundClose` gleich; jede Sitzung liegt in beiden Reihen vor. | CAP `CHART_CANDIDATE` |
| Legitime Adjustierungsdifferenz | Die Abweichung ist **genau eine halbe** Rundungseinheit **und** nach dem Datum liegt im Fenster ein Split. Ein Beispiel: 14,93 / 2 = 7,465 wird zu 7,46 veröffentlicht. Am 26.10.2026 lagen alle 1.330 solchen Abweichungen genau dort. | INFO (keine Stufenwirkung) |

Begründung der Schwere:
- **FAIL am Stichtag:** Die Karte zeigt den Schluss. Ein Schluss ohne nachgewiesene Identität mit der veröffentlichten Preiswahrheit wird nicht gezeigt; der Titel wird nicht bewertet und der Grund gezählt (`dataQuality.failReasons.PRICE_PARITY`).
- **CAP im Verlauf:** Muster, Pivots und Pläne lesen die Historie. Ein ungeklärter Verlauf erlaubt deshalb höchstens den Chart-Kandidaten, ohne Plan und ohne Setup-Bestätigung.

**Rohkurs und adjustierter Kurs.** Am letzten Balken sind adjustierter und roher Schluss derselbe Wert, weil die Adjustierung auf den jüngsten Stand normiert (siehe `published-close.js`). Der gezeigte Schluss am Stichtag ist deshalb der Rohkurs. Frühere Kurse, Pivots und Stops sind adjustierte Werte. Ein Rohkurs-Verlauf existiert in den Tagesbalken nicht; es wird keiner erfunden.

**Zeitpunkt.** Beide Reihen sind Tagesschlüsse (EOD) derselben Sitzung. Intraday-Stände werden nie verglichen und nie gezeigt.

**Historische Wiederholung (`--as-of`).** Die Referenz wird am Stichtag abgeschnitten (`truncateReference`); beide Reihen haben dann die heutige Adjustierungsbasis. Der gezeigte Schluss ist in diesem Modus adjustiert und kein Rohkurs. Der Tageslauf nutzt `--as-of` nie.

**Pflicht statt stiller Pass.**
- `runPipeline` ohne `priceReferenceOf` bricht ab (`SF8_PRICE_REFERENCE_SOURCE_REQUIRED`).
- `assessSecurity` ohne `priceReference` bricht ab (`SF8_DQ_PRICE_REFERENCE_REQUIRED`).
- `SOURCES.priceReference` ist Pflichtquelle der Eingangsprüfung des Tageslaufs (`input-gate.mjs#missingSources`).

## Vorher/Nachher (voller Lauf, Stand 26.10.2026, 5.099 Titel)

| | vorher (`sf8-data-quality-1.0.0`) | nachher (`1.1.0`) |
|---|---|---|
| Kandidaten | 3.001 (2.023 / 953 / 25) | 3.001 (2.023 / 953 / 25) |
| neu / entfallen / umgestuft | – | 0 / 0 / 0 |
| DQ PASS / CAP / FAIL | 2.961 / 2.018 / 120 | 2.960 / 2.019 / 120 |
| FAIL-Gründe | FRESHNESS 9, IDENTITY_ACTIVE 7, SESSIONS 104 | dieselben + PRICE_PARITY 9 |

Abgleich je Titel:

| Ergebnis | Titel | Bemerkung |
|---|---|---|
| PASS am Stichtag | 5.090 | jeder veröffentlichte Kandidat (3.001 von 3.001) |
| `PRICE_REFERENCE_INVALID` (auch: Datei vorhanden, aber unlesbar) | 0 | – |
| `PRICE_REFERENCE_STALE` | 9 | ACA, ATII, ELME, GETY, LRHC, PAPL, PERF, VSME, WPRT; alle schon FRESHNESS-FAIL (gleiche Ursache in beiden Reihen) |
| Verlauf PASS | 4.900 | – |
| Verlauf INFO (Rundung vor Split) | 188 | z. B. ADIL, ADV, AEMD, AGL; in 56 Kandidatenansichten sichtbar |
| Verlauf ungeklärt (CAP) | 2 | YPF: Die Materialisierung hat den 18.11.2025, die Discover-Reihe nicht. Neu CAP CHART, ohne Kandidaten. ACHL: drei Sitzungen nur in der Materialisierung, schon FAIL (Liquidität/Sessions). |

Kein Kandidat änderte seine Stufe. Eine Toleranz wäre nicht nötig gewesen: Alle 3.001 Schlüsse stimmen auf den Cent.

## Tests

`scripts/supertrader/tests/sf-sf8-price-parity.test.mjs`:
- Golden Cases auf eingefrorenen echten Reihen (`fixtures/sf8-price-parity-golden.json`): AAPL PASS 343,91; ADIL 2 und AEMD 9 Rundungsfälle nach Split; YPF Sitzungsdifferenz; GETY veraltet.
- Adversariale Fälle:
  - ±1 Cent und Bruchteile am Stichtag;
  - Rundung unter 1 $;
  - fremde securityId, fremder Ticker, Heimatlisting, EUR, selbstgebildete `ref_`-Kennung;
  - veraltet, neuer, ohne Balken am Stichtag;
  - Mock, Rohkurs, nicht berechnet, altes Schema, Wochenreihe, anderer Anbieter;
  - Rundung ohne Split, Split vor dem Datum, eine volle Rundungseinheit (Gleitkommagrenze), unadjustierte Reihe, fehlende Sitzung.
- Pipeline:
  - kein Lauf ohne Preisquelle;
  - ein Titel mit 1 Cent Abweichung fällt mit Grund heraus;
  - ein ungeklärter Verlauf begrenzt alle Ansichten des Titels auf Chart-Kandidat ohne Plan.

Die bestehenden Golden Cases (`SF8-GOLDEN`) sind unverändert grün. Ihre Referenz wird aus denselben eingefrorenen Reihen gebildet (`sf8-reference-fixture.mjs`).

## Unabhängiges Review (27.10.2026)

| Befund | Behandlung |
|---|---|
| LOW 7: „kleiner als eine Rundungseinheit“ erlaubte bis 0,99 Cent | Jetzt gilt nur noch genau eine halbe Einheit. Das ist die gemessene Verteilung (1.330 von 1.330). Kandidaten und Ansichten bleiben unverändert (56 INFO, 0 CAP). Gegenproben: 7,461, 7,469 und 7,456 sind jeweils ungeklärt. |
| LOW 8: eine unlesbare Referenzdatei galt als fehlend | Sie gilt jetzt als `PRICE_REFERENCE_INVALID` (Grund `UNREADABLE`). Weiterhin FAIL. |
| HIGH 1 (Ansicht, nicht Preisabgleich): `closeVsGapLow` (C12) und Turtle `N`/`nPct` unterhalb von MODELED | Beide bleiben bewusst; die Begründung steht unten. |

Begründung zu HIGH 1:
- `closeVsGapLow` ist der Abstand zum Tief des Gap-Tags. Dieses Tief ist als Strukturmarke (`levels.gapDayLow`, Chartmarke `GAP_DAY_LOW` mit gleichem `pivot.distance`) schon ausgewiesen. Es ist ein Chartfakt, keine Order, und erscheint ohne Plan und ohne Risiko.
- `N`/`nPct` ist die Volatilitätseinheit. Ohne Einstiegsmarke, die unterhalb von MODELED nicht veröffentlicht wird, lässt sich daraus kein Stop bilden.
- Eine Änderung wäre eine fachliche Änderung der Ansicht in einem eigenen PR. DQ-SF8-4 (#1027) prüft unabhängig vom Erzeuger mit festgeschriebenen Strukturmarken und Markenarten je Methode und verbietet Zahlen unter Order-, Stop-, Limit- und Einstiegsnamen.
