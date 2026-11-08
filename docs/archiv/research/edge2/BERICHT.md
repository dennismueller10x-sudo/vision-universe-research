# Edge 2 – Teil 1 und 2: Bericht

**Forschung, nicht zertifiziert.** Lauf 42227928882 nach dem gepinnten [Protokoll](../../../research/edge2/PROTOKOLL.json) (SHA-256 `435f50f9…2fb49`). Zahlen stehen nur versiegelt in `results/edge2.sealed.owner.json`. Das Repository enthält keine Rendite- und keine Risikokennzahl.

## Urteil

- **Keine der 12 Varianten schlägt den S&P 500 (SPY-Gesamtrendite) im Fenster 2016-01 bis 2026-10.** Das gilt nach Holm über alle 12 Varianten, und es gilt auch roh: Keine Variante liegt über SPY. Ergebnis: 12 × „schlägt nicht“, mit und ohne DQ-K5 (Quarantäne).
- **Teil 2 (Risiko-Overlay auf Value Momentum N20): 4 × „nicht bestätigt“.** Keines der vier Overlays erreicht zugleich eine SPY-nahe Rendite, einen besseren Sharpe und einen kleineren maximalen Verlust. Die Overlays senken die Schwankung, kosten aber mehr Rendite, als sie an Risiko sparen. Die Umschichtungskosten steigen dabei deutlich.
- **Teil 1, Wirkung der Zone:** Der Einstieg erst an einer technischen Zone hilft bei Momentum Leader und Defensive Quality gegenüber dem sofortigen Kauf: höhere Rendite und kleinere Verluste. Bei Value Momentum hilft er nicht. Für einen Vorsprung vor SPY reicht der Effekt in keinem Fall.
- **Papierdepot:** Nach der Auswahlregel des Protokolls läuft `E2-T1-DQ-N20-ZONE` (Defensive Quality, 20 Plätze, Einstieg an Zone) ab dem 09.11.2026 als EDGE2-PAPER vorwärts (`paper/CONFIG.json`, Workflow `research-edge2-paper.yml`). Als Bestätigung zählt nur dieser Vorwärtslauf.

## Abdeckung

- Panel: 6.855 Titel (6.805 mit Fundamentaldaten), Gesamtrendite inklusive delisteter V13-Ketten, 561 Wochen.
- Zonenerkennung (dieselbe wie S2): 10.596 Analysen auf Tagesbalken, 992 Treffer, keine fehlende oder ungültige Historie.

## Grenzen

- 2016–2026 ist nicht unberührt (E3-Prüfteil, S2). Die Varianten wurden in Kenntnis der E3-Ergebnisse gewählt.
- Keine historische Indexmitgliedschaft. Die Population besteht aus den heute vorhandenen Kursdateien plus qualifizierten delisteten Ketten.
- Cash wird nicht verzinst. Das belastet Varianten mit Cash-Anteil, vor allem die Overlays und die Zonen-Varianten mit 10 Plätzen.
