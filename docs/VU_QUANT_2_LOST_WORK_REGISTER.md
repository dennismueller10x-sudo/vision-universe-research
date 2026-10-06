# Vision Universe® Quant 2.0 — Lost Work Register

Stichtag: 2026-09-20  
Code-Basis: `main@1a192f923a8dffc267272495091fa577780a8f0d`

## Zweck

Dieses Register benennt ohne Beschönigung, was in der ursprünglichen Vision spezifiziert war, heute fehlt, nur synthetisch existiert, im Code unverbunden liegt oder beim Übergang zur realen VU2-Experience nicht mitgenommen wurde. `LOST` bedeutet nicht zwingend gelöschter Code; häufig ist die produktive Verbindung verloren gegangen.

## Statuslegende

- `LOST`: früher klar vorgesehen, heute weder als zusammenhängende Spezifikation noch als reale Produktfunktion vorhanden.
- `MISSING`: Ziel ist bekannt, aber keine belastbare Implementierung/Spezifikation gefunden.
- `NOT_CONNECTED`: Code oder Daten existieren, werden vom realen VU2-Produkt aber nicht konsumiert.
- `NOT_VISIBLE`: funktionaler Kern existiert, die vorgesehene Produktfläche fehlt.
- `LEGACY`: ausgeliefert, aber synthetischer/alter Produktpfad.
- `DUPLICATED`: parallele Stores, UI oder Evaluatoren erzeugen Divergenzrisiko.
- `BLOCKED`: bewusstes Fail-Closed-Gate wegen fehlender Evidenz.

## Register

| ID | Bereich | Wiedergefundener Sollzustand | Heutiger Befund | Status | Recovery / Gate |
|---|---|---|---|---|---|
| LW-001 | Realer VU Quant Score | transparenter Peer-/Global-Composite über echtes Universum | Score-Engine und 511er Modelluniversum existieren; reale VU2-Daten umfassen fünf Titel und liefern korrekt `INSUFFICIENT_PEER_UNIVERSE` | `NOT_CONNECTED` | realen, ausreichend breiten Factor Panel materialisieren; keine Fünf-Titel-Perzentile |
| LW-002 | Factor DNA Journey | aktive Faktoren, Subdimensionen, Peers, Coverage und Historie in VU2 | realer Fünf-Titel-Pfad zeigt Rohwerte; dedizierte VU2-DNA fehlt; breiter DNA-Pfad ist synthetisch | `PARTIAL` / `NOT_VISIBLE` | auf realen Quant-Panel-Vertrag aufsetzen |
| LW-003 | Faktor-Taxonomie | historisch fünf aktive Faktoren plus inaktive Revisionsdimension | Owner hat `quant-v2.0.0-full-7f` mit sieben disjunkten Faktoren und festen Gewichten entschieden; V1 bleibt Legacy | `RECOVERED_SPEC` | V2-Daten-/Publikationsgates erfüllen; keine Scores vor Evidenz |
| LW-004 | Score Momentum | PIT-konsistente Score-Historie, Velocity, Acceleration und Faktortreiber | Engine und synthetische Score-Historie vorhanden; keine reale materialisierte Historie | `NOT_CONNECTED` | erst nach realem Score-Panel und historischer Zeitsemantik |
| LW-005 | Quant Radar | Upgrades, Leaders, Breakouts, Deterioration und Setup-Events | sieben Legacy-Module auf Mock-Daten; VU2 Signals sind nur zwei EOD-Transitions | `LEGACY` / `NOT_CONNECTED` | Radar auf Rule Contract und reale Score-Snapshots migrieren |
| LW-006 | Market Regime | erklärbarer breiter Marktzustand | keine Produkt-Engine; VU2 lehnt Fünf-Titel-Regime korrekt ab | `MISSING` | nach breiter Market-Factor-Materialisierung entwickeln |
| LW-007 | Common Setup Engine | produktweite Lifecycle-Zustände mit Why Now, Entry, Invalidation und Exit | versionierter `SetupState`-Vertrag und inaktive Methodik sind rekonstruiert; aktuelle Technical-Evidenz umfasst noch keine geordnete Snapshotfolge | `RECOVERED_SPEC` / `DATA_BLOCKED` | Zustandsmapping freigeben und bestehende Technical-Materialisierung um kausal geordnete reale Snapshots erweitern; bis dahin fail-closed |
| LW-008 | Stock Journey | integrierter Pfad von Zustand bis Backtest-Evidenz und Exit | VU2 verbindet Header, Chart, Geschäftsevidenz und Links; Setup, Why Now, Strategy Match, Backtest, Risiko und Exit bleiben fragmentiert | `PARTIAL` | VU2-Stock-Seite als Orchestrator vervollständigen |
| LW-009 | Strategy Library 6–10 | Dividend Growth, Small Cap Quality, Revision Leaders, Defensive Quality, Value Momentum | nur Labels/Zielnamen; keine vollständigen ausführbaren Definitionen gefunden | `MISSING` | Owner-/Research-Spezifikation für alle Pflichtfelder; keine Regeln erfinden |
| LW-010 | Strategy Library 1–5 | fünf vollständige, reproduzierbare Strategien | Definitionen vorhanden; Entry/Confirmation/Exit/Invalidation/Benchmark nicht als vollständige First-Class-Verträge modelliert | `PARTIAL` | bestehende Definitionen versioniert ergänzen |
| LW-011 | Reales Strategy Lab | Regeln, aktueller Bestand, Backtest, Robustheit und Monitoring in einem Workflow | VU2 speichert einen lokalen Entwurf und previewt fünf Titel; Classic kann nur synthetisch backtesten | `NOT_CONNECTED` | gemeinsamer Persistenz-/Jobpfad nach Daten-Gates |
| LW-012 | Strategie-Persistenz | eine gemeinsame versionierte Lineage | VU2 und Classic verwenden getrennte, inkompatible LocalStorage-Stores | `DUPLICATED` | ein Product-Service-Contract; keine dritte Ablage |
| LW-013 | Reales Backtesting | PIT, historische Mitgliedschaft, Delistings, Corporate Actions, Execution und Kosten | Engine ist stark und fail-closed; Runtime erzeugt stets MockProvider; VU2 hat keinen realen Lauf | `BLOCKED` | historischer Provider-/Evidence-Vertrag vollständig erfüllen |
| LW-014 | Technical Backtest | Technical-Regeln aus derselben historischen Featurefolge | nur aktuelle zertifizierte Snapshots; vier Felder sind deshalb `NOT_CERTIFIED` | `BLOCKED` | materialisierte historische Snapshots mit As-of-Vertrag |
| LW-015 | Elliott Backtest | getrennte Szenarioevidenz über historische Zeitpunkte | aktueller Beta-Snapshot, keine historische Zertifizierung | `BLOCKED` | erst nach methodischem und historischem Gate |
| LW-016 | Backtest Trust Robustness | ausgeführte OOS-, Sensitivitäts-, Multiple-Testing- und Cross-Market-Prüfung | Trust Engine vorhanden; einige Robustheitsmerkmale sind Caller-Flags, DSR/PBO fehlt | `PARTIAL` | Prüfungen ausführen und Evidenzartefakte binden |
| LW-017 | Alert Product | dieselbe Regel wie Screener/Signal/Strategy/Backtest plus Subscription/Delivery | Alert Contract existiert nur in Tests; kein Scheduler, Store, UI oder Delivery | `NOT_CONNECTED` / `NOT_VISIBLE` | Consumer an Rule Contract anschließen |
| LW-018 | Signal Breadth | materialisierte Zustandsübergänge für kanonische Regeln | nur `momentum6m` und `priceTo200dma`, Golden Five, historisches EOD | `PARTIAL` | Rule-Fähigkeiten und materialisierte Beobachtungen erweitern |
| LW-019 | Rule-Engine-Konvergenz | ein Evaluator in allen Modulen | Kern-Predicate ist geteilt; Technical Scanner nutzt für weitere Setup-Felder noch Legacy-OPS | `DUPLICATED` | restliche Scanner-Felder katalogisieren und migrieren |
| LW-020 | Reales Volluniversum im Produkt | Suche, Stock, Quant, Technical, Screener und Strategy auf kanonischem Produktuniversum | Suche erreicht 6.875 Produkttitel; Full Intelligence bleibt exakt fünf | `LOST` / `NOT_CONNECTED` | Product Services auf materialisierte Capability-Matrix statt Preview-Scope stellen |
| LW-021 | Full-market factor artifacts | skalierbare Markt-Faktoren als Product Data | reale Full-Universe-Factor-/Screener-Artefakte existieren, haben keinen VU2-Consumer | `UNUSED` / `NOT_CONNECTED` | Semantik prüfen, dann über Product Service anbinden |
| LW-022 | Fundamentals-Breite | vorhandene SEC-Quelle in Product Data nutzbar | SEC-Quellfähigkeit ist breiter als ausgelieferte Consumer-Schicht; annual revenue ist für 3.647/6.875 verfügbar | `PARTIAL` | Quant-eigene Materialisierung/Join aktualisieren; Discovery nicht ändern |
| LW-023 | PIT/Revisionen in Backtests | interne vollständige Revision History als Cutoff-sicherer Input | Adapter und Tests existieren; kein produktiver Backtest-Job konsumiert ihn | `NOT_CONNECTED` | internen Materialisierungsjob an Backtest Provider binden; keine öffentliche PIT-API |
| LW-024 | Revisions Factor | historische Earnings-Revisions als Faktor und Radar-Treiber | Schema reserviert, keine zertifizierte lizenzierte Zeitreihe | `MISSING_DATA` | echtes Daten-/Lizenz-Gate; nicht aus SEC-Restatements vortäuschen |
| LW-025 | Valuation Journey | Multiples, Historienbänder, Peers, Growth-adjusted, Expectations/Reverse DCF | vier reale Multiples; keine eigene Journey oder Advanced Valuation | `PARTIAL` / `MISSING` | versionierte Valuation- und Expectations-Methodik |
| LW-026 | Portfolio Intelligence | Exposures, Faktor-/Sektorrisiko, Korrelation, Drawdown und Signalwirkung | nur Menge, aktueller USD-Wert und Gewicht über fünf Titel | `MISSING` | nach breitem Stock-/Quant-Service integrieren |
| LW-027 | Atlas Conversational Layer | NL → dieselben Regeln/Tools/Backtests, sichtbare Übersetzung | VU2 hat fünf read-only Tools und feste Fragen; Classic hat 15 Mock-Tools | `PARTIAL` / `LEGACY` | ein realer Tool Layer; kein eigener Evaluator |
| LW-028 | VUQL in VU2 | lesbare Darstellung des kanonischen AST in Screener/Strategy/Atlas | Parser/Serializer robust im Classic-Pfad; in VU2 nicht sichtbar | `NOT_CONNECTED` | VU2 nutzt exakt denselben AST/VUQL-Serializer |
| LW-029 | Watchlist Monitoring | beobachtete Regel-/Score-/Setup-Änderungen | VU2 und Classic haben getrennte Stores; VU2 ist auf fünf Intelligence-Titel begrenzt, ohne Monitoring | `DUPLICATED` / `PARTIAL` | gemeinsame Identity-/Signal-Consumer-Schicht |
| LW-030 | Technical Tool Layer | Technical als Tool-Input für Atlas und Strategy | `technical-tools.js` ist test-only; aktive Atlas Registry nutzt ihn nicht | `NOT_CONNECTED` | registrierte reale Tools auf Product Services abbilden |
| LW-031 | Strategy Packs | methodisch freigegebene regelbasierte Packs | Datei enthält nur Interface/Readiness und ungeprüfte geplante Namen | `MISSING` | nicht implementieren; Supertrader-Grenze und Rechtsprüfung respektieren |
| LW-032 | Search-to-analysis continuity | jedes Suchergebnis führt zu belegtem Capability-Zustand | breite Suche führt außerhalb der fünf meist zu identity-only/unavailable | `PARTIAL` | Capability-Matrix und abgestufte Stock Journey statt Five-or-nothing |
| LW-033 | Frische Produktionsdaten | klare, aktuelle EOD-/Intraday-Stände | EOD am Audit einen abgeschlossenen Handelstag zurück; UI markiert korrekt stale | `OPERATIONS_GAP` | Datenlauf/Deploy-Freshness überwachen, keine alte Zahl als aktuell labeln |
| LW-034 | Discovery-Schutz | gemeinsame Infrastruktur ohne Produktregression | aktueller Rematch hat Discovery nicht verändert; Regression Smoke grün | `PRESERVED` | als Hard Gate jeder folgenden Integration beibehalten |
| LW-035 | Originale Quant-2-Research-Anhänge | drei ursprüngliche V2-Berichte als Primärquellen | Git enthält nur Dateinamen, Hashes und Größen in `docs/vu2/inventory.json`; der übergreifende Deep-Research-Masterplan ist als Work-Artefakt wiedergefunden, die drei exakten Anhänge fehlen | `LOST_SOURCE` | Anhänge bei Gelegenheit hashgenau archivieren; bis dahin kondensierte Traceability plus Masterplan verwenden |
| LW-036 | Full-Universe Ranking Hygiene | unplausible Providerwerte vor Ranking quarantänisieren | Engine 2.0 und Producer-Integration rekonstituiert: Volluniversum wird vor Sortierung/Top-K geprüft, Rohwerte bleiben erhalten; Artefakt-Refresh/Production-Verify noch ausstehend | `RECOVERED_CODE` / `DEPLOY_PENDING` | bestehendes Market-Refresh ausführen, Quant/Discovery regressionsprüfen, Pages deployen und Production verifizieren |

## Explizit nicht als verlorene Quant-Arbeit zu behandeln

- Supertrader ist ein eigener Produktstrang.
- Minervini-, VCP-, Darvas-, Donchian- oder Stage-Analysis-Namen in `strategy-packs.js` sind geplante Interface-Tokens, keine implementierten oder wiedergefundenen Quant-Strategien.
- Ein öffentlicher PIT-/R2-Endpunkt war kein notwendiger Standardproduktbestandteil und bleibt entfernt.
- R2, SEC, Tiingo, Intraday, Realtime, Company Master und Discovery werden nicht neu gebaut.

## Owner-Gates

Nur folgende Registereinträge benötigen vor Implementierung eine echte Owner-Entscheidung:

1. **LW-009:** belastbare Regeln für die fünf historisch nicht belegten Strategien freigeben.
2. **LW-024:** Quelle/Lizenz für historische Earnings Revisions freigeben; Methodik ist in Quant V2 definiert.
4. Neue laufende Kosten oder Providerverträge, falls bestehende Pfade die Evidenzanforderungen objektiv nicht erfüllen.

Alle anderen Einträge sind dependency-correct innerhalb der bestehenden Architektur ausführbar.
