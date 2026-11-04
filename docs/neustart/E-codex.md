# Strang E – unabhängige Gegenprüfung

Stand: 04.11.2026. **Forschung, nicht zertifiziert.** Interner Methodenbericht, keine öffentliche Renditeaussage.

## E1 – Umfang und Urteil

Geprüfter main-Stand: `9dd496d83909732aad56dcf75764a94eb3c6bc65`. Einschließlich #1328, #1334 (B), #1332, #1333 (C) und der danach auf main vorliegenden Erzeuger/Ergebnisse. Keine Änderungen an B/C. „Bestätigt“ gilt jeweils nur für den beschriebenen Teil, nicht als Zertifizierung des ganzen Backtests.

**Urteil:** Rechenweg und die gespeicherten Quant-Kennzahlen sind in den unten genannten Teilen bestätigt. Vollständige historische Population und sämtliche Ausführungsannahmen sind nicht bestätigt. Konkrete Fehler im Quant-Datenpfad müssen vor einer belastbaren Performance-Aussage behoben werden. Supertrader-Ergebniszahlen bleiben mangels entschlüsselter Artefakte und privatem Snapshot ungeprüft; ein grüner Test ersetzt diese Reproduktion nicht.

### B – Supertrader

| Status | Prüfung / Befund | Datei und Zeile (geprüfter Stand) |
|---|---|---|
| bestätigt | Top 5 verwenden die bestehenden REF-Implementierungen; vier explizite Kostenstufen, keine nachträgliche Auswahl eines Gewinners im Runner. B wird nur zu REF gerechnet, also kein vollständiger Kostenvergleich A/B. | `scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs:60`, `:121`; `scripts/supertrader/source-faithful/research/sf6-references.mjs:18`; `scripts/supertrader/source-faithful/research/run-sf6-validation.mjs:45` |
| bestätigt | Gesamtrendite = End-Equity / 100.000 − 1; offene Positionen sind in der Kurve enthalten; Trefferquote nur geschlossene Trades. SPY wird über dieselben Kurvendaten geschnitten. | `scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs:42`; `scripts/supertrader/source-faithful/runner/metrics.mjs:27` |
| bestätigt | Split-adjustierte OHLC und Dividenden werden gemeinsam übernommen; Dividenden für am Vortag gehaltene Positionen als Cash, Kosten beim Kauf/Verkauf. Das ist eine Gesamtrendite mit Cashdividenden, nicht nur Kursrendite. | `scripts/supertrader/source-faithful/runner/snapshot-input.mjs:16`; `scripts/supertrader/source-faithful/methods/turtle.mjs:315`, `:384`; `scripts/supertrader/source-faithful/research/lifecycle-engine.mjs:188` |
| bestätigt | C12 verwendet finales Tagesvolumen erst nach Schluss, Kauf am nächsten Open; Lifecycle verarbeitet zuvor scharfgeschaltete Orders vor den neuen Schluss-Signalen. Turtle nutzt vorherige Kanäle/N. Kein Look-ahead an diesen geprüften Stellen. | `scripts/supertrader/source-faithful/research/moka-lifecycle.mjs:18`; `scripts/supertrader/source-faithful/research/lifecycle-engine.mjs:203`, `:238`; `scripts/supertrader/source-faithful/methods/turtle.mjs:197`, `:400` |
| bestätigt | #1334 erlaubt nur Käufe am letzten Tag mit vorhandenem Balken; spätere Käufe bleiben Verstöße. Ein bereits am Vortag scharfgeschalteter Auftrag kann an diesem Tag ausgeführt werden. Das ist keine Bestätigung eines tatsächlich liquidierbaren Delisting-Endwerts. | `scripts/supertrader/source-faithful/research/st9-hist-execution.mjs:82`; `scripts/supertrader/source-faithful/research/lifecycle-engine.mjs:226` |
| fraglich | Letzter Schluss abzüglich Slippage als Delisting-Erlös ist eine Annahme; bei Aussetzung/Insolvenz kein gesicherter Verkaufserlös. Datenlücken werden separat abgewickelt. Ausführungsunsicherheit nicht durch die Audit-Regel beseitigt. | `scripts/supertrader/source-faithful/research/st9-hist-execution.mjs:95`; `scripts/supertrader/source-faithful/research/lifecycle-engine.mjs:230`, `:237` |
| bestätigt | B ergänzt delistete Ketten mit Intervall-/Kalenderprüfung und Dedup anhand Security-ID, CIK und Kursreihe. | `scripts/supertrader/source-faithful/research/st9-v13-delisted-study.mjs:201` |
| fraglich | B ist kein Beweis einer vollständigen damaligen Population: kurze Endsegmente entfallen, manche Delistings werden als DATA_GAP zensiert. DQ-K5 schneidet rückblickend auffällige Kursstücke heraus. Sensitivität gegen die Auslassungen erforderlich; „survivorship-frei“ nicht belegt. | `scripts/supertrader/source-faithful/research/st9-v13-delisted-study.mjs:230`, `:244`, `:260` |
| fraglich | Audit prüft Stops/Fills teilweise mit Engine-Leveln bzw. wiederverwendeten Checks; Entry-/Add-Trigger sind nicht vollständig unabhängig hergeleitet. Top-5 speichert auch einen fehlgeschlagenen Audit ohne Abbruch. | `scripts/supertrader/source-faithful/research/st9-hist-execution.mjs:14`, `:19`, `:221`; `scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs:71` |
| fraglich | Gesamtrenditen der historischen Läufe nicht unabhängig reproduziert: Ausgabe hybrid verschlüsselt, Snapshot/R2 hier nicht vorhanden. Bericht bestätigt weder Höhe noch Gleichheit dieser privaten Ergebnisse. | `scripts/supertrader/source-faithful/research/run-st-hist-top5.mjs:99`, `:127`; `docs/neustart/B-supertrader.md:13` |

### C – Quant

| Status | Prüfung / Befund | Datei und Zeile (geprüfter Stand) |
|---|---|---|
| bestätigt | Faktoren/Risiko werden rollierend bis Entscheidung t geschätzt, Ausführung t+1. SEC-Sichtbarkeit konservativ erst vor dem Entscheidungstag; ORIGINAL-Auswahl statt zuletzt restatierter Fassung. Kein Look-ahead an diesen Filtern gefunden. Keine Aussage über Vollständigkeit der SEC-Rohhistorie. | `quant/engines/portfolio-backtest.cjs:45`, `:89`; `quant/engines/portfolio-pit-factors.cjs:59`; `scripts/quant/portfolio/build_pit_fundamentals.py:61` |
| bestätigt | Titel-/Branchengrenzen und Liquiditätsfilter sind konstruktiv umgesetzt. Risikoparität vor Projektion bedeutet nach Grenzen nicht zwingend gleiche Risikobeiträge. Liquidität ohne Tagesumsatz nur Marktkap.-Proxy. | `quant/engines/portfolio-construction.cjs:49`, `:87`, `:105` |
| bestätigt | Gebühren/Slippage im Ledger plus modellierter halber Spread auf jedes Handelsnotional. Spread belastet die Kurve multiplikativ nachträglich; kein identischer Cash-/Stückzahl-Replay eines Ledgers mit Spread. Diese Näherung ist als solche beschriftet. | `quant/engines/portfolio-backtest.cjs:162`, `:181`, `:206` |
| bestätigt | Unabhängige Gegenrechnung aus allen fünf gespeicherten Equity-Pfaden: Endwert/1 Mio. − 1, CAGR mit Kalendertagen/365,25, Drawdown als Minimum von Equity/laufendem Maximum − 1 sowie SPY-CAGR aus erstem/letztem Benchmarkwert. Abweichungen zu allen jeweiligen gespeicherten Kennzahlen exakt 0 in JavaScript. Das bestätigt die Aggregation, nicht die Richtigkeit der Rohdaten oder Trades. | `docs/quant/research/portfolio-v1/model-portfolios.json:1`; `quant/engines/backtest-metrics.cjs:127`, `:186` |
| Fehler | Übersicht nennt den angeforderten Zeitraum bis 31.10.2026; alle tatsächlichen Ergebniskurven enden am 02.10.2026. Runner nimmt den Benchmark-Kalender und verkürzt still. Angeforderten und realisierten Zeitraum getrennt ausweisen und fehlende Wochen alarmieren. | `docs/quant/research/portfolio-v1/MODEL_PORTFOLIOS.md:11`; `scripts/quant/portfolio/model-portfolios.cjs:105`; `quant/engines/portfolio-backtest.cjs:83`; Ergebnis-JSON `:1` (`results[*].window`) |
| Fehler | Historischer Rohschluss delisteter Titel = splitbereinigter Punkt × KONSTANTES Verhältnis letzter Rohschluss/letzter adjustierter Schluss. Das entfernt keine zeitabhängigen historischen Splits. Beispiel 2:1-Split: früherer adjustierter Schluss 50, tatsächlicher Rohschluss 100, Endverhältnis 1 → geliefert 50. Verzerrt Mindestkurs, Marktkap., Value und Liquidität; stattdessen datumsabhängige kanonische Faktoren/Rohkurse nötig. | `scripts/quant/portfolio/model-portfolios.cjs:165`, `:170`; Verbraucher `quant/engines/portfolio-pit-factors.cjs:69`; `quant/engines/portfolio-construction.cjs:50` |
| Fehler | TOTAL_RETURN-Panel akzeptiert delistete Titel ohne totalReturnPoints und nutzt dann Kursrendite gegen SPY-Gesamtrendite. Kein Abbruch und kein basisabhängiges Downgrade. Im gespeicherten Lauf ist `delistedPriceOnly=0`; dieser konkrete Fehler ist dort nach Metadaten nicht ausgelöst. | `scripts/quant/portfolio/model-portfolios.cjs:163`, `:169`; Ergebnis-JSON `:1` (`data.counts.delistedPriceOnly`) |
| Fehler | `ALL_THEN_TRADEABLE_LISTINGS` wird allein aus TOTAL_RETURN abgeleitet, selbst ohne Delisting-Verzeichnis. Basis ist tatsächlich heutiges Dateiverzeichnis plus qualifizierte V13-Ketten und heutige SIC. Ein Hash des Regeltexts/Zählers beweist keine vollständige damalige Population. Lauf enthält 976 ausgeschlossene heutige Titel ohne Branche und 58 ausgeschlossene delistete Titel. | `quant/engines/portfolio-backtest.cjs:151`; `scripts/quant/portfolio/model-portfolios.cjs:113`, `:180`; Ergebnis-JSON `:1` (`data.counts`) |
| fraglich | Ausführungsverfügbarkeit der Folgewoche fließt bereits in auf Entscheidungstag zurückdatierte Mitgliedschaft ein. Wirtschaftlich kann Cash bei nicht ausgeführter Order sinnvoll sein; PIT-Evidenz ist so jedoch rückwirkend. Geplante Mitgliedschaft und tatsächliche Fills separat halten. | `quant/engines/portfolio-backtest.cjs:98`, `:101` |
| fraglich | Endwert nach Delisting (100/70/0 %) ist Klassenannahme, kein beobachteter Erlös; fehlende Kurse werden fortgeschrieben. Sensitivität vorhanden, aber keine Garantie. Heutige SIC und eingeschränkte qualifizierte Delisting-Auswahl lassen Survivorship-/Klassifikationsbias offen. | `quant/engines/portfolio-backtest.cjs:21`, `:130`, `:141`; `scripts/quant/portfolio/model-portfolios.cjs:216` |
| fraglich | „Walk-forward“ bedeutet rollierende Schätzung mit festen Regeln, keine unabhängige Strategieauswahl im Training plus unangetasteter OOS-Periode. Kalender-Folds teilen denselben Pfad; keine Mehrfachtest-Korrektur für die Profilwahl. #1333 betrifft zukünftige Setup-OOS-Evidenz und validiert die historischen Musterportfolios nicht nachträglich. | `quant/engines/portfolio-backtest.cjs:12`, `:218`; `docs/neustart/C-quant.md:22` |

### Nachvollziehbare Gegenrechnung

Ohne Produktionsdaten zu schreiben, im Repository ausführen (verwendet keine Kennzahlen-Engine):

```js
const d = require('./docs/quant/research/portfolio-v1/model-portfolios.json');
for (const r of d.results) {
  const a = r.equity, end = a.at(-1), years =
    (Date.parse(end[0]) - Date.parse(a[0][0])) / 86400000 / 365.25;
  let peak = 1e6, dd = 0;
  for (const p of a) { peak = Math.max(peak, p[1]); dd = Math.min(dd, p[1] / peak - 1); }
  console.log(r.profileId, end[1] / 1e6 - 1 - r.metrics.totalReturn,
    (end[1] / 1e6) ** (1 / years) - 1 - r.metrics.cagr,
    dd - r.metrics.maxDrawdown,
    (end[2] / a[0][2]) ** (1 / years) - 1 - r.metrics.benchmarkCagr);
}
```

Alle vier Differenzen in allen fünf Zeilen: 0. Private Tagesbalken, SEC-ORIGINAL-Bündel und Supertrader-Snapshot wurden nicht neu beschafft; eine vollständige End-to-End-Reproduktion bleibt offen. Keine Renditezahlen aus verschlüsselten Artefakten veröffentlicht.
