# Quant V6 – Validierung und reproduzierbare Nachweise

Die maschinenlesbare Zusammenfassung steht in [validation-summary.json](v6/validation-summary.json), die sechs unabhängigen Statusachsen in [assessment.json](v6/assessment.json). Beide beziehen sich auf gehashte Quellen und tatsächliche Läufe. Private Preis-, Equity-, Trade-, Raster- und vollständige Simulationsdateien werden nicht eingecheckt.

## Neue Berechnungen

113 neue Node-Tests prüfen die Research-Verträge, Generationen, Coverage, Monte Carlo, Portfoliobuchführung, Walk-Forward/OOS/Sensitivität, Studien, Expositionsbaseline, reale Wochenquellen und die tatsächliche CLI. Die kombinierte neue Suite besteht vollständig, ohne übersprungene Tests. Zwei zusätzliche echte Unterprozessfälle sichern ab, dass ein fehlgeschlagener Kind-Testlauf trotz erfolgreicher Produktionsdaten-Isolation nicht als grüne Suite gewertet wird. Zusätzlich prüft eine unabhängige adversariale Suite unter anderem verspätete Labels, fehlende reife Ausgänge, unveränderte historische Nenner, exakte Kosten, Membership-Korrekturen und Ereignisverfügbarkeit.

Die Python-Referenzen importieren keine JavaScript-Finanzfunktionen:

| Nachweis | Tatsächlich unabhängig geprüft |
|---|---|
| `verify-research-monte-carlo.py` | PRNG/Resampling, gespeicherte Pfade und sämtliche Verteilungsstatistiken; auch vollständige Probe mit 10 Millionen Simulationsschritten |
| `verify-research-portfolio.py` | Decimal-Buchführung für finanzierten Kauf, gemischte Umschichtung, Split/Dividende/terminales Cash und belegten terminalen Nullwert; 4 Fälle |
| `verify-research-studies.py` | Fünf eingefrorene Signale, Replay-/Patternauswahl und Kontrollen, Setupvarianten, Netto-Outcomes, Faktorzuordnung, Ereigniszeit, Regime und Clusterinferenz; 526 Vergleiche und 25 Signalereignisse |
| `verify-research-validation.py` | Fensterpartitionen, Purging/Labelreife, registrierte Ausführung, OOS-Aggregation, Holm und Sensitivitätsrechnungen |
| `verify-real-weekly-backtest.py` | Reale NVDA-Käufe/Verkäufe, Kosten, Equity, offene Position und Benchmarks über alle fünf Perioden |

Die Referenzen und Tests enthalten ausdrücklich synthetische analytische Fixtures. Sie erzeugen keine erfundene historische Datenbasis und belegen keinen unabhängigen positiven Signaleffekt. Toleranzen der getrennten Implementierungen sind vorab im Code festgelegt; sie ersetzen nicht den exakten JS-Hashvergleich unter identischer numerischer Runtime.

## Reale gespeicherte Daten

Der vollständige bestehende Wochenbatch wurde erneut materialisiert und vollständig durch den privaten Reader geprüft:

- 6.190 Kandidaten: 4.451 Klasse B, 1.739 Klasse C, keine Klasse A.
- 22.255 Periodenergebnisse; alle Details und Hashes geprüft.
- Alle 6.190 Readerantworten geprüft; **0 Performance-Payloads für blockierte Listings**.
- NVDA 1Y/3Y/5Y/10Y/MAX jeweils identisch wiederholt und unabhängig mit Python nachgerechnet; MAX 21 abgeschlossene Trades und eine offene Position.
- Junge ARM-Historie, historische Zuordnungen und die bekannten gesperrten AAPL/BGC/AAAC/AACT-Fälle bleiben begrenzt beziehungsweise blockiert.
- Unveränderte Materialisierung wiederholt: 6.190 Wiederverwendungen, 0 Neuberechnungen.

Die Generation `23a3a9b70450c0cc8cedaafb33577e720ad1979d44935deb80ca26241e27bfff` stimmt mit dem gesicherten V5.1-Unterbau überein. Node 22.23.4, V8 12.4.254.21-node.57, Linux x64, glibc 2.41 und Node-Binärhash `94efd062ed066c1a0b332e18249859c905e920eeada5df55d24c99b919629a90` sind aufgezeichnet. Keine Finanzkennzahl wurde gerundet, um Hashabweichungen zu verdecken.

Zusätzlich wurden zwei Monte-Carlo-Modelle aus der realen NVDA-Referenz gerechnet und durch Python nachgeprüft: 21 abgeschlossene, nicht überlappende Trades sowie 1.395 aufeinanderfolgende Wochenrenditen. Der Equity-Basispunkt wird nicht als künstliche Nullrendite mitgezählt. Trade-Resampling enthält weder den offenen Trade noch einen Kalenderdauer-/Idle-Cash-Effekt; Wochen-Resampling enthält beobachtete Marken und bezahlte Kosten. Es bleibt eine konditionale Simulation einer ausgewählten überlebenden Aktie, keine Markt-/Zukunfts- oder Vorteilsaussage.

## Breite Regression und Isolation

Vollständige Quant-, Core-, SEC-, SEC/PIT- und relevante Consumerläufe sowie der Produktionsdaten-Isolationslauf werden im Maschinenartefakt mit exakten Zählern, Befehlen, Runtime und Loghashes erfasst. Die Quant-Suite enthält bereits Datenqualität, historische Identität, Corporate Actions, As-of/Look-ahead, Kosten, Benchmarks, Generationswechsel, Hashprüfung, Rechte-/Cacheentzug und Rollbacktests. Der erste vollständige Isolationslauf meldete unveränderte Produktionsdaten, sein Kind-Testlauf endete jedoch unter konkurrierender Last an der bestehenden 900-Sekunden-Grenze ohne vollständigen Testabschluss. Die Wiederholung wurde während der Limitunterbrechung ohne Abschlussbericht beendet und wird nicht als bestanden gezählt. Die anschließend gezielt ausgeführte Isolation aller neuen Research-Tests ist vollständig bestanden. Der neue Prüf-Runner trennt Isolations- und Kind-Teststatus ausdrücklich. Die ursprüngliche Zeitgrenze wurde nicht verändert.

Es wurde keine neue Browseroberfläche gebaut. Die UI bleibt bytegleich zur Ausgangsbasis; bestehende UI-Vertragstests laufen innerhalb der Quant-Suite. Neue manuelle Browser-/Accessibility-Zertifikate werden nicht behauptet. Die bestehenden GitHub-Prüfungen einschließlich Quant CI, Core, SEC, Browser QA, Currency/FX und Production-Package waren auf dem eingefrorenen Implementierungscommit d6760c493fc2af35db7057b042d294b3c123650c erfolgreich. Ein vorheriger Quant-CI-Lauf lieferte 2.989/2.989 Tests; für den späteren erfolgreichen Lauf sind Job-/Schrittmetadaten gesichert, der Raw-Log-Download war mit HTTP 403 gesperrt. Für diesen späteren Lauf wird kein nicht ausgelesener Testzähler behauptet.

## Ressourcen

Monte Carlo: 10 Millionen Schritte unter 10 s und 256 MiB im dokumentierten lokalen Benchmark. Portfolio: 2.000 synthetische Sessions × 20 Listings, rund 3,10 s und 236.476 KiB Peak-RSS. Studien: kleine ausdrücklich synthetische kombinierte Probe mit 360 Quellbars. Messwerte entstehen unter gleichzeitiger Regression und sind keine produktiven Durchsatz-SLAs. Code-/Runtime-/Inputhashes und gemessene Werte stehen im Maschinenartefakt.

Budgets begrenzen Samples, Simulationsschritte, gespeicherte Pfade, Quellbars, Kohorten-/Ergebniszeilen und Portfoliozustände. Überschreitungen werden abgewiesen; Historie wird nicht still gekürzt und kein MAX-Label über eine abgeschnittene Rechnung gelegt.

## Wiederholung

```sh
node --version  # Node 22; exakte Reproduktion zusätzlich mit aufgezeichneter Binary
node scripts/quant/validate-research-v6.cjs --out /private/v6-validation
node --test 'quant/tests/research-*.test.mjs'
node scripts/quant/materialize-real-backtest-read.cjs --output /private/v6-weekly
node scripts/quant/validate-real-backtest-read.cjs /private/v6-weekly
node scripts/quant/materialize-real-backtest-read.cjs --output /private/v6-weekly
```

Die Ausgabeverzeichnisse müssen außerhalb des Repositorys liegen. Es werden keine Provider abgefragt, keine produktiven Scheduler verändert und keine Ergebnisse öffentlich aktiviert.

## Interpretationsgrenzen

Grüne technische Prüfungen sind keine Zertifizierung. Historische Vollpopulation, Original-PIT-Vintages, terminale Werte, Nutzungsrechte und tatsächlich unabhängige Bestätigung bleiben gemäß [Abnahmematrix](BACKTEST_V6_CERTIFICATION_MATRIX.md) offen. Der PR bleibt zur fachlichen Prüfung bereitgestellt; er wird nicht automatisch gemergt. Externe Hosting-Checks werden mit ihrem tatsächlichen Status dokumentiert; ein Deployment-Ratenlimit wird nicht als bestandener Check umgedeutet.
