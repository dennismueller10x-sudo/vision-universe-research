# E3 – Edge-Studie: Vorbereitungsbefund

**Forschung, nicht zertifiziert. Status: BLOCKIERT – keine E3-Renditeergebnisse.**

Basis: main `dfa38ce2794b03267ef0c21b671e6ff50bffbf72`. Protokoll vor jedem E3-Lauf im Commit `e253393` eingefroren; SHA-256 `9d4c41e36418e1d4df4d020ec4c7fb015bbc91a7df8bb193eb629e397da6e818`.

Die Leitfrage ist derzeit nicht beantwortbar. Kein Strategie- oder Auswertungslauf wurde ausgeführt. Fehlende Evidenz wird nicht als Underperformance gewertet. Die drei gewünschten Ergebnisurteile dürfen erst nach einem gültigen Lauf vergeben werden.

## Verfügbarkeit und Grenzen

- **PRIVATE_INPUTS_NOT_RESTORED:** Keine hashverifizierten Tageshistorien inkl. V13-Delistings und originalen PIT-Bündeln lokal bereitgestellt. Kein automatischer Price-only-/Consumer-Fallback.
- **RESEARCH_ADAPTERS_NOT_IMPLEMENTED:** Kein geprüfter E3-Adapter für tägliche Filter-Ausführung, persistente Rebalancing-Uhr, gemeinsamen Kosten-/Terminal-Ledger und Top5-Sleeves. Unveränderte Supertrader-REF-Läufe allein erfüllen das Protokoll nicht.
- **BENCHMARK_COVERAGE_NOT_VALIDATED:** ETF-Metadaten vorhanden; gemeinsame Wochenstichtage, täglicher Filter-Warm-up und lückenlose Fenster müssen vor einem Strategielauf geprüft werden.

Der Runtime-Status meldete keine konfigurierten Secrets oder Identitäten. Die folgende Prüfung meldet ausschließlich Variablen-Präsenz, keinen Inhalt und keinen erfolgreichen Archivzugriff:

- V13_ARCHIVE_PRIVATE_KEY: nicht konfiguriert
- VU_HISTORY_S3_ENDPOINT: nicht konfiguriert
- VU_HISTORY_S3_ACCESS_KEY_ID: nicht konfiguriert
- VU_HISTORY_S3_SECRET_ACCESS_KEY: nicht konfiguriert

| Benchmark | Stand | Gesamtrendite | Prüfung |
|---|---|---|---|
| SPY | 2026-10-02 | TOTAL_RETURN_RECONSTRUCTED | METADATA_PRESENT_NOT_COVERAGE_VALIDATED |
| RSP | 2026-10-02 | TOTAL_RETURN_RECONSTRUCTED | METADATA_PRESENT_NOT_COVERAGE_VALIDATED |
| IWM | 2026-10-02 | TOTAL_RETURN_RECONSTRUCTED | METADATA_PRESENT_NOT_COVERAGE_VALIDATED |

2026 ist ein Teiljahr bis 02.10. Frühere Studien haben 2020–2026 bereits verwendet. Die E3-Prüfung wäre eine Replikation mit eingefrorenen Regeln und zeitlich getrennter Auswahl, kein neuer projektweiter Holdout. Ein späterer Vorwärtstest bleibt erforderlich.

## Vollständige Variantentabelle

96 Varianten, 192 gemeinsam zu korrigierende Hypothesen. „—“ bedeutet nicht berechnet. Bei einem späteren gültigen Lauf sind zusätzlich die SPY/RSP/IWM-Kennzahlen, Kosten, Turnover und Delisting-Zählungen gemäß Protokoll auszugeben. Es gibt noch keine Entwicklungs-Auswahl.

| Variante | Netto-TR | CAGR | Sharpe | Max. Verlust | Δ SPY/RSP/IWM | Holm p Rendite / Sharpe | Urteil |
|---|---:|---:|---:|---:|---|---|---|
| ST-C01-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C01-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C02-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C02-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C03-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C03-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C08-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C08-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C12-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-C12-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-TOP5-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| ST-TOP5-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-compounder-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-momentum-leader-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-quality-momentum-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-garp-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-future-leader-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-defensive-quality-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N10-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N10-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N10-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N10-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N15-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N15-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N15-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N15-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N20-W13-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N20-W13-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N20-W26-F0 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |
| Q-value-momentum-N20-W26-F1 | — | — | — | — | — / — / — | — / — | nicht bestimmbar (blockiert) |

## Empfehlung für die Produktdarstellung

Derzeit keine Methode als S&P-500-Sieger herausstellen. SPY-Gesamtrendite als passive Vergleichsbasis; vorhandene Strategien mit Kosten, Drawdown, Sharpe und Grenzen nebeneinander als „Forschung, nicht zertifiziert“. Für eine konkrete Methodenauswahl fehlt E3-Evidenz. Dieser PR ändert keine Produktdarstellung.

## Konkrete Fortsetzung

1. Bestehende R2-Archive nach dem vorhandenen Runbook hashverifiziert wiederherstellen; Tiingo-Tageshistorien und originale PIT-Bündel bereitstellen. Keine neuen Anbieter nötig.
2. Forschungsadapter ausschließlich unter scripts/research/edge/ implementieren; Ledger-Parität für Gebühren/Spread/Slippage, Terminal-Cash, Filterverkauf/Wiedereinstieg und Sleeve-Kapital prüfen. Vorhandene Engines nur importieren.
3. Datenabdeckung und Benchmarkkalender validieren. Dann 2012–2019 rechnen und Gewinner samt Eingabe-/Ergebnishashes unveränderlich festhalten; erst danach 2020–2026 öffnen. Alle 96 Varianten ausweisen, Holm über 192 Hypothesen.

Die Statistikfunktionen in study.cjs sind mit synthetischen Daten getestet. Sie sind kein ausführbarer Strategieadapter und kein Ersatz für diese offenen Schritte. Wiederholung der Vorprüfung: siehe README.md.
