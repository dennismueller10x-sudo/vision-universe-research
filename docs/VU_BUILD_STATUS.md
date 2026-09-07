# VU INVESTMENT INTELLIGENCE — BUILD STATUS

Letzte Aktualisierung: **Phase 2 abgeschlossen — Produktionsaudit und
Marktdatenanbindung vorbereitet.**

> **Phase 2** (September 2026) hat das V1-System auditiert und die
> Providerschicht fuer echte Marktdaten gebaut. Bericht:
> `docs/VU_PHASE2_IMPLEMENTATION_REPORT.md`, Befunde:
> `docs/VU_PHASE2_PRODUCTION_AUDIT.md`.
> **176 Tests gruen** (134 aus V1 unveraendert, 42 neu).
> Das System laeuft weiterhin vollstaendig ohne Anbieterzugang.

## Completed

Alle zehn Phasen sind umgesetzt. Der vollstaendige Bericht steht in
`docs/VU_IMPLEMENTATION_REPORT.md`.

| Phase | Inhalt | Status |
|---|---|---|
| 0 | Audit und Implementation Plan | ✓ |
| 1 | Foundation: Schema, Provider-Interfaces, Methodik, Query-AST, VUQL, Strategy Schema | ✓ |
| 2 | Mock Core: 500 Securities + 11 Edge-Case-Fixtures, MockProvider | ✓ |
| 3 | Quant Core: Normalisierung, Faktoren, VU Quant Score, Radar, Praekomputation | ✓ |
| 4 | Discovery: Quant Home, Ranking, Screener, Radar, Stock Detail, UI-Fundament | ✓ |
| 5 | Strategy Engine: Bibliothek, Strategy Lab, Versionierung, Lineage, Product API | ✓ |
| 6 | Backtest Engine: PIT, Ausfuehrung, Kosten, Metriken, Trust Score, Current Holdings | ✓ |
| 7 | AI Foundation: AIProvider, MockAI, Tool Registry, NL → AST, AI-Seite | ✓ |
| 8 | Watchlist Intelligence: Deltas, Faktorbewegungen, Events | ✓ |
| 9 | Quality Pass: Tests, Responsive, Zustaende, Dokumentation, CI | ✓ |

### Umfang

- **11 Produktseiten** (10 aus V1, `/quant/markt/` aus Phase 2), 23 Engine-Module
  (~6.700 Zeilen V1 + ~1.170 Zeilen Providerschicht), 4 versionierte Methodik-Dateien
- **176 Tests gruen** (`node --test "quant/tests/*.test.mjs"`, ~37 s), darunter die
  22 Acceptance-Kriterien aus Abschnitt 76 und die 8 Schluesselpruefungen aus Phase 2
- **20 Fachdokumente** unter `docs/` (13 aus V1, 7 aus Phase 2), 4 Provider-Vorbereitungen unter `providers/`
- CI: `.github/workflows/quant-ci.yml` — Tests, JSON-Validitaet, Seitenstruktur,
  Konsistenz zwischen praekomputierten Daten und Engines
- Am bestehenden Repository geaendert: **zwei Zeilen** (Menuepunkt + Positionierungsregel)

### Im Browser verifiziert

- Alle 10 Seiten: keine Konsolenfehler, kein horizontaler Ueberlauf, Leer- und
  Fehlerzustaende funktionieren
- Vollstaendige User Journey aus Abschnitt 96 end-to-end
- AI-Flow aus Abschnitt 97 (Strategie → Feedback → neue Version)
- Mobile (390 px): kein Ueberlauf auf einer der Seiten, Touch-Ziele ≥ 40 px

## Phase 2 — Produktionsaudit und Marktdaten

| Teil | Inhalt | Status |
|---|---|---|
| Audit | 0 CRITICAL, 2 HIGH, 6 MEDIUM, 4 LOW — beide HIGH und 5 MEDIUM behoben | ✓ |
| Providerschicht | Faehigkeiten, Symbolzuordnung, Transport, Qualitaet, Betriebsmodus | ✓ |
| Adapter | Twelve Data, serverseitig, Free Plan | ✓ |
| Pipeline | Abruf → Pruefung → JSON → GitHub Pages, als Workflow | ✓ |
| Schluesselsicherheit | 8 Tests ueber das Repository + Pruefung vor dem Commit | ✓ |
| Oberflaeche | Datenherkunft je Datenklasse, neue Seite `/quant/markt/` | ✓ |
| Pruefstand | `evaluate-provider.mjs` — dieselben Fragen an jeden Anbieter | ✓ |

**Noch nicht scharf geschaltet.** `quant/data/market/status.json` steht auf
`configured: false`; es sind keine echten Kursdaten committet. Dafuer fehlen
zwei Dinge: das Secret `TWELVE_DATA_API_KEY` und die Klaerung der drei
Veroeffentlichungsfragen aus `docs/VU_PROVIDER_LICENSE_CHECKLIST.md`.

## In Progress

Nichts. Beide Phasen sind abgeschlossen.

## Known Limitations

- **Alle Daten sind synthetisch**, solange kein Anbieterzugang konfiguriert ist. Auch
  mit echten Kursen bleiben die Fundamentaldaten synthetisch: die Ergebnisse belegen die
  Funktionsweise der Engine, nicht die historische Tragfaehigkeit einer Strategie an
  realen Maerkten. `backtestEligibility()` gibt dafuer `realEvidence: false` zurueck.
- **Reale Unternehmen bekommen keinen Quant Score.** Das Referenzuniversum
  (`ref_*`, 15 Titel) erhaelt ausschliesslich Kursdaten. Ein Score aus Kursdaten allein
  waere ein Momentum-Signal mit falschem Namen.
- Analyst Revisions sind im Schema vorgesehen, aber als `available: false` markiert —
  ohne lizenzierte PIT-Konsensdaten wird der Faktor nicht mit erfundenen Daten befuellt.
- Deflated Sharpe Ratio und Probability of Backtest Overfitting sind nicht implementiert;
  der Trust Score vergibt fuer diesen Block null Punkte statt ihn zu ueberspringen.
- Ein Universum (`US_EQUITIES`), eine Waehrung, keine Makro-, News- oder Ownership-Daten.
- Kein Nutzerkonto: Strategien, Backtests und Watchlist liegen im `localStorage`.
- Ein 20-Jahres-Backtest mit monatlichem Rebalancing dauert rund 19 Sekunden. Der Web
  Worker haelt die Oberflaeche bedienbar, beschleunigt die Rechnung aber nicht.
- Regulatorische Pruefung (MiFID II, WpIG, WpHG, MAR, EU AI Act, Datenlizenzen) steht aus
  und liegt ausserhalb dieses Builds.

## Next Phase

Punkt 1 der urspruenglichen Liste ist mit Phase 2 gebaut. Was bleibt:

1. **Zugang scharf schalten** — Secret hinterlegen, Lizenzfragen klaeren,
   Workflow mit `dry_run` starten. Konfiguration, kein Bauauftrag.
2. **Bereinigung verifizieren** — die Tageshistorie ist sehr wahrscheinlich
   splitbereinigt (Beleg in `VU_PROVIDER_CAPABILITIES.md`), zugesichert ist es
   nicht. Bis dahin bleibt `splitAdjustedPrices` auf `null`.
3. **US Point-in-Time Fundamentals** — der eigentliche Engpass. Davon haengt ab,
   ob ein Backtest jemals mehr belegt als die Funktionsweise der Engine. Der
   Pruefstand (`scripts/market/evaluate-provider.mjs`) markiert `pointInTime`
   und `delistedSecurities` als blockierend; Kandidaten stehen in
   `VU_PROVIDER_CAPABILITIES.md`. Vorher sind die drei Mock-Faelle
   (`MOCK_RESTATEMENT`, `MOCK_DELISTED`, `MOCK_FUTURE_DATA_LEAK`) mit echten
   Daten nachzubauen.
4. **Offen geblieben aus dem Audit**: MEDIUM-7 (die Alt-Pipeline unter
   `scripts/dashboard/` kennzeichnet ihre Bereinigungsstufe nicht), LOW-2 und
   LOW-3 (Barrierefreiheit der Tabellen). Begruendungen im Auditbericht.

Details in `docs/VU_PHASE2_IMPLEMENTATION_REPORT.md`.
