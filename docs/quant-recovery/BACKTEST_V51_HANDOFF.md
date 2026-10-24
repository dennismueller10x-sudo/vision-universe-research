# Backtest V5.1 – Übergabevertrag für das neue Quant-UI

Vertrag: `real-backtest-read-1.0.0` (API-Aufrufe bleiben kompatibel; neue Generation mit Scope-/Runtime-Provenienz), Qualitätsvertrag `real-backtest-quality-1.0.0`, Auswahlvertrag `real-backtest-selection-1.0.0`. Keine UI, kein HTTP-Endpunkt und kein Hosting werden hier implementiert.

## Bestehender Service und unterstützte Komposition

`quant/api/product-services.js#create(...).getRealBacktest(ticker, options)` bleibt der zentrale Quant-Einstieg. Seine private Implementierung liegt in `quant/api/real-backtest-service.cjs` und wird im öffentlichen Browser weder geladen noch ausgeführt. Ohne expliziten privaten Store und `INTERNAL_REVIEW` liefert die Funktion `REAL_BACKTEST_PREVIEW_DISABLED`. Der Optionsname ist aus V3 übernommen; er startet keine Vorschau.

Für einen langlebigen **serverseitigen** Verbraucher die Komposition `server/quant-backtest-reader.cjs` verwenden. Sie nutzt denselben Service, aktualisiert dessen Identitäts-/Berechtigungskontext und ergänzt die Frischeprüfung. Kein zweiter Quant-Dienst und keine andere Rechenengine:

```js
const Reader = require('./server/quant-backtest-reader.cjs');
const Selection = require('./quant/api/real-backtest-selection.js');

const service = Reader.create({
  directory: PRIVATE_MATERIALIZED_DIRECTORY,
  enabled: true,
  audience: 'INTERNAL_REVIEW',
  allowedTickers: SERVER_AUTHORIZED_TICKERS
});
const adapter = Selection.create({ service });
const summary = await adapter.load('NVDA', { period: 'MAX' });
if (summary.state === 'AVAILABLE_LIMITED') {
  const equity = await adapter.read(summary.selection, 'equity');
  const trades = await adapter.read(summary.selection, 'trades');
}
```

`allowedTickers` muss aus einem vertrauenswürdigen Serverkontext kommen. Die Komposition ist **keine Benutzer-Authentifizierung**. Ein späterer Transport muss Identität und Berechtigung vor und nach asynchronen Reads prüfen, die private Datenablage abschirmen und Cache-Replay verhindern. Hier wird kein solcher Transport aktiviert. Anzeigerechte aus `development-preview.json` ersetzen diese Zugriffsprüfung nicht.

Im späteren Browser kann derselbe reine Auswahladapter mit einer autorisierten Transportimplementierung von `getRealBacktest` verwendet werden. Er besitzt keine `fetch`-, DOM-, Store- oder Berechnungsfunktion. Den Node-Dateispeicher niemals in den Browser verdrahten. Die bestehenden Quant-Ansichten werden in V5.1 nicht angefasst.

## Migration gespeicherter Ergebnisse

Bestehende Serviceaufrufe bleiben erhalten. Alte vorberechnete V3–V5-Generationen ohne den eindeutigen `kindScope` werden vom strengeren Reader zurückgewiesen und müssen mit dem Konsolidierungsstand neu materialisiert werden. Es gibt keine stille Metadaten-Aufwertung alter Ergebnisse. Die neue Generation wird erst vollständig veröffentlicht; Archive bleiben erhalten. Die aktuelle vollständige Generation ist bereits neu gerechnet und geprüft. Runtime-Metadaten sind für den exakten Reproduktionsnachweis zwingend; fehlende oder abweichende Runtime darf nicht durch einen tolerant bestandenen Hashvergleich ersetzt werden.

## Auswahl und Versionierung

- Ticker: kanonisches Produktkürzel; der Server löst Security-/Listing-Identität auf. Kein tickerbasierter Join historischer Kursreihen.
- Perioden: `1Y`, `3Y`, `5Y`, `10Y`, `MAX`.
- Sections: `summary`, `quality`, `equity`, `trades`.
- Optionale Basissicherungen: `expectedGeneration`, `expectedListingId`.
- Der Auswahladapter setzt diese Sicherungen bei jedem Detailabruf und prüft zusätzlich den Ergebnishash. Sein `selection`-Objekt ist eingefroren und serialisierbar.
- Unbekannte Optionen, Regel-, Kosten- oder Datumsüberschreibungen werden abgewiesen. Dieser Vertrag liefert genau die unveränderte `NEW_52W_HIGH`-Wochenrechnung.
- `MAX` folgt gespeicherter Historie, 53 Wochen Warm-up und verfügbarer Folgewochen-Ausführung. Es ist keine Jahreszahl.
- Feste Perioden starten jeweils mit eigenem Startkapital. Sie sind keine Ausschnitte der Kapitalbindung eines seit MAX laufenden Portfolios.
- Bei jüngeren Listings bleibt die angeforderte Periode erhalten, aber `result.complete=false` und die tatsächlichen Daten `result.from/to` müssen sichtbar werden. Kein stilles Etikett „10 Jahre“ über zwei Jahre Daten.

## Ergebnisfelder

| Bereich | Felder / Bedeutung |
|---|---|
| Identität | `identity.securityId`, `sourceSecurityId`, `listingId`, `ticker`, ggf. `requestedIdentity` bei blockierter historischer Zuordnung |
| Auswahl | `period`, `section`, `supportedPeriods`, `max` mit frühestem Kurs-/zulässigem Signalzeitpunkt, Warm-up und Abhängigkeiten |
| Versionen | `schemaVersion`, `generation`, `asOf`, `computedAt`, `calculationRuntime`, `executionModel` |
| Einordnung | `kindScope`, `availableBacktestKinds`, `returnBasis`, `certification`, `productionApproved` |
| Summary | `result.initialCapital`, `endCapital`, `metrics.totalReturn`, `cagr`, `maxDrawdown`, `completedTrades`, `fees`, `slippage`, `openPositions`, `from/to`, `complete`, `strategy`, `modelVersion`, `inputHash`, `resultHash`, `source` |
| Aktie Buy-and-Hold | `result.buyAndHold`: Endkapital, kumulative Rendite, CAGR, wöchentlicher Drawdown; gleicher Bewertungszeitraum, ohne Transaktionskosten |
| SPY | `benchmarkState`, `result.marketBenchmark`: nur bei vollständigen exakten Bewertungsdaten und passender Währung gültige Kennzahlen; sonst explizite Nichtverfügbarkeit |
| Equity | `result.equity[]`: `date`, Strategie-`value`, Aktien-Buy-and-Hold-`benchmark`; `marketBenchmarkEquity[]` separat oder null |
| Trades | `result.trades[]`: Signal, Entry/Exit-Datum und -Preis, Index/Haltedauer, Units, Kauf-/Verkaufsgebühren und Slippage, Nettoausgang/-rendite |
| Offene Position | `result.openPosition`: Einstieg und bezahlte Einstiegskosten, letzter Bewertungszeitpunkt/-preis und Wert, `completed=false`; kein erdachter Verkauf oder abgeschlossener M6-Ausgang |
| Qualität | `quality.class`, `technicallyExecutable`, `identityStatus`, `historicalPeriod`, `corporateActionStatus`, `returnBasis`, `benchmarkStatus`, `survivorship`, `exclusionReasons`, `limitations`, `dataVersion` |
| Frische | `delivery.state`, `changedDependencies`, `checkedAt`, `sourceAsOf`, `sourceAgeCalendarDays`; lokale Input-Konsistenz, kein Live-Datenversprechen |

**Geldbeträge haben die Währung `quality.currency`; NVDA und die hier geprüften Fälle sind USD.** Keine implizite FX-Umrechnung. `metrics.totalReturn` ist ein historischer Feldname für die kumulative **PRICE_RETURN**, keine Aussage über enthaltene Dividenden. Der maximale Drawdown wird auf Wochenmarken gemessen, nicht intraday.

`availableBacktestKinds` bezeichnet geeignete vorhandene Container. Maßgeblich ist zusätzlich `kindScope=SINGLE_LISTING_WEEKLY_REPLAY_NOT_AGGREGATE_SIGNAL_CERTIFICATION`. Daraus darf weder eine marktweite Signalstudie noch ein fertiger Pattern-, Setup-, Portfolio- oder Ranking-Backtest abgeleitet werden. Deren Status weiterhin aus `getBacktest('certification')` lesen.

## Unabhängige Statusdimensionen

| Dimension | Werte / Darstellungspflicht |
|---|---|
| Ausführbarkeit | `AVAILABLE_LIMITED`, `BLOCKED`, `UNAVAILABLE` |
| Qualität | Ausführbare Rechnungen derzeit Klasse B; blockierte Voraussetzungen Klasse C. Keine uneingeschränkte Klasse A. |
| Benchmark | `AVAILABLE`, `BENCHMARK_UNAVAILABLE`, `NOT_EVALUATED`; fehlender SPY verhindert nicht die reine Strategieausführung. |
| Zertifizierung | Immer `NOT_CERTIFIED`, `productionApproved=false`. `VALIDATED_EXECUTION_MODEL` gilt ausschließlich für die Mechanik. |
| Aktualität | `CURRENT_INPUT_SNAPSHOT` oder explizit `STALE_INPUT_SNAPSHOT`. Geänderte Master-/Produktidentität wird bis zur neuen Generation ohne Finanzdaten zurückgehalten. |

Bei `BLOCKED` fehlt `result` vollständig – keine gültig wirkenden Nullen, Ersatzwerte oder alten Charts. Bei `UNAVAILABLE` ebenfalls keine Performance darstellen. Wichtige Gründe: `GENERATION_CHANGED`, `IDENTITY_MISMATCH`, `RESULT_CHANGED`, `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED`, `BACKTEST_ACCESS_CONTEXT_CHANGED`, `DISPLAY_NOT_PERMITTED`, `NOT_AUTHORIZED`, Schema-/Modell-/Runtime-Verletzungen und `REAL_BACKTEST_SOURCE_UNAVAILABLE`.

`LOADING` ist der Zustand des späteren UI-/Transportaufrufs bis zum Promise-Ergebnis; keine simulierte Serviceantwort. Nach Auswahlwechsel Antworten anhand des aktuellen Auswahlobjekts/Request-Revisions verwerfen. Bei Generationswechsel Summary neu laden, Details verwerfen und neue Auswahl verwenden. Keine alte Equity mit neuen Trades kombinieren.

## Berechnung und Aktualisierung

Nur vorberechnete, gehashte Ergebnisse liefern; keine vollständigen Berechnungen beim Seitenaufruf. Summary/Quality enthalten keine Equity-/Trade-Dateien. Details werden einzeln und begrenzt gelesen. Bestehende Store-Grenzen: JSON 256 KiB, gepacktes Detail 256 KiB, entpacktes Detail 2 MiB.

Offline-Materialisierung/Refresh und Auslieferung bleiben getrennt. Neue Preise, Corporate Actions, Identitäten, Benchmark, Ausführungsmodell und Berechnungscode bilden eine neue Generation. Die numerische Runtime einschließlich Node-Binärhash ist ebenfalls Eingabe und Cache-Abhängigkeit. Gleiche Runtime und gleiche Inputs müssen exakt dieselben Hashes liefern. Kein Runden von Kennzahlen, um unterschiedliche Laufzeiten passend zu machen.

Der kanonische Referenzlauf wird mit dem aufgezeichneten Node 22 ausgeführt. `validate-real-backtest-read.cjs` verweigert eine exakte Neuberechnung mit abweichender Runtime ausdrücklich. Eine andere Server-Runtime darf versionierte Ergebnisse lesen und ihre JSON-Hashes prüfen, solange sie nicht selbst neu berechnet. Legacy-Generationen ohne Runtime-Metadaten bleiben als eingeschränkte Archive lesbar; sie werden vom neuen exakten Reproduktionsnachweis nicht stillschweigend übernommen.

Vollständige Generationen werden atomar veröffentlicht; Writer-Lock und geprüfter Rollback bleiben erhalten. Fehler beschädigen den letzten vollständigen Stand nicht. Ein unveränderter Lauf rechnet keine Listings neu. Der manuell ausführbare Refresh ist kein Produktions-Cron und ruft keine Provider ab.

Änderungen an Lese-/Anzeigeberechtigung oder aktuellem Identitätskontext invalidieren Reader-Kontexte unabhängig von numerischen Ergebnissen. Sie werden nach asynchronen Reads erneut geprüft. Die kanonische Anzeigerichtlinie wird für private Reader mit separatem Registry-Zustand ausgeführt, damit weder entfernte Grants weiterwirken noch andere Produkte beeinflusst werden.

## Verbleibende UI-Arbeit

Die neue Quant-Designbasis entscheidet ausschließlich der UI-Refresh. Später dort den Auswahladapter an vorhandene Kennzahlen, Charts, Aufklapper und Tabellen anschließen; keine Rechenlogik ändern. Sichtbar bleiben PRICE_RETURN, NOT_CERTIFIED, tatsächliche Abdeckung und Qualitätsstatus. Kostenannahmen, ausgeschlossene Dividenden, modellierter Folgewochenschluss ohne garantierten Live-Fill, Survivorship und keine Zukunftsprognose gehören in vorhandene Erläuterungskomponenten.

Vor Aktivierung sind Berechtigungs-/Auslieferungsgrenzen und fachliche Anzeigeentscheidung gesondert abzunehmen. V5.1 schafft weder eine öffentliche Produktfunktion noch eine methodische Zertifizierung.
