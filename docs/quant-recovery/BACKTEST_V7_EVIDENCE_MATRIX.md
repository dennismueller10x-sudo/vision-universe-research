# V7 – 13-Bereiche-Matrix

**V7_PARTIALLY_VALIDATED.** Berichtsversion `quant-v7-report-1.0.0`; kein Ersatz aktiver Zertifizierung. 0/6 Backtest-Arten zertifiziert; 2/7 Erweiterungsmethoden im unten definierten Methodenscope abgenommen; 2/13 Bereiche entsprechend abgenommen. Keine Produktfreigabe.

| Bereich | Daten/Rechnung | Methodik | Grenze |
|---|---|---|---|
| SAME_STOCK_REPLAY | begrenzt / geprüft | teilweise | Deskriptive und regelbasierte Einzelaktien; keine marktweite Population/Bestätigung |
| PATTERN_EVIDENCE | begrenzt / geprüft | teilweise | Zeitgleiche Kontrollen nur im benannten Survivor-Scope; überlappende Horizonte |
| SIGNAL_BACKTEST | begrenzt / geprüft | teilweise | Alle fünf unveränderten Regeln; Long-Ereignisse, keine Shortstrategie |
| SETUP_BACKTEST | begrenzt / geprüft | teilweise | Rekonstruktionen getrennt; Original-M6 unreif; Wochenproxies kein Vertragswechsel |
| STRATEGY_BACKTEST | begrenzt / geprüft | teilweise | Preisportfolio mit fixen Gewichten; keine PIT-Profil-/TR-Zertifizierung |
| FACTOR_RANKING_BACKTEST | begrenzt / geprüft | teilweise | Vier SEC-Beispiele; gespeicherte Accessionauswahl ist kein vollständiges Vintagearchiv |
| MONTE_CARLO | begrenzt / geprüft | abgenommen im definierten Scope | Bedingtes empirisches Resampling; IID nur Szenario, Blocklängen 4/13/26; keine Marktmodellzusage |
| WALK_FORWARD | begrenzt / geprüft | teilweise | Vier Fenster je Modus; letztes Validierungsfenster leer; keine vollständige Fit/Select/Test-Abnahme |
| OUT_OF_SAMPLE | begrenzt / geprüft | abgenommen im definierten Scope | Verwaltung/Expositionsschutz abgenommen; reale bekannte Historie wird korrekt abgewiesen |
| MARKET_REGIME | begrenzt / geprüft | teilweise | Ex-post SPY-Trend/Volatilität; keine ursprüngliche PIT-Regimehistorie |
| PARAMETER_SENSITIVITY | begrenzt / geprüft | teilweise | 72 vollständige Rasterpunkte; deskriptiv, keine valide p-Wert-/Holm-Abnahme |
| EVENT_DRIVEN | begrenzt / geprüft | teilweise | 97 gespeicherte SEC-Verfügbarkeitsereignisse; acht Original-XBRL-Dateien separat geprüft, keine vollständige Ereigniszeitprüfung |
| PORTFOLIO_REBALANCING | begrenzt / geprüft | teilweise | Drei reale Preisportfolios unabhängig nachgerechnet; reale CA/TR/terminale Fälle fehlen |

Die sieben gewünschten Achsen, Hashbindungen und separaten Zähler stehen in [evidence-matrix.json](v7/evidence-matrix.json). `INDEPENDENT_EVIDENCE` ist für konkrete Tradingregeln nicht etabliert. `ECONOMIC_ADVANTAGE` ist bei Monte Carlo und OOS-Verwaltung nicht erforderlich. Monte-Carlo-Abnahme betrifft bedingte empirische Szenariosimulation, OOS-Abnahme die Verwaltungsmechanik. Sie erklären keine Tradingregel für bestätigt. Die elf übrigen Bereiche bleiben methodisch/datenbedingt offen; ein fehlender Edge allein wäre kein Grund zur Ablehnung.
