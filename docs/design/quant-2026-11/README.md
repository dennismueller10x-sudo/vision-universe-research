# Quant · Konzept „Ein Profil je Aktie“

Konzept vom 08.11.2026, damit Quant verständlicher wird; gleicher Ansatz wie [Discover „Reihe für Reihe“](../discover-netflix-2026-11/README.md). **Vom Owner freigegeben am 08.11.2026.** Bauplan und Master-Prompt für die Umsetzung: [HANDOVER.md](HANDOVER.md).
Präsentation online (privat): https://claude.ai/artifact/YbbeGBt8qboxcusnmp9NUj

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/quant-2026-11/`. |
| `deck-quant.js` | Mockups (Screens `q-*`) und Folien K1–K2, QX01–QX08, U1. |
| `data-quant.js` | Echte Eigenschafts-Werte (factor-evidence-v1, Stand 06.11.2026), erzeugt von `build-data.py`. |
| `now/Q*.jpg` | Heutige Seiten auf 390 px (08.11.2026); Q10 (Radar) nur die ersten 8.000 von 20.813 px. |
| `bundle.py` | Packt alles in eine HTML-Datei. `lib/` ist eine Kopie der Redesign-Bausteine. |

Kern: ein Profil aus sieben Eigenschaften (ein Wort je Eigenschaft) klein in jeder Liste und groß auf der Aktie; Start mit „Heute bei Quant“ und Schienen; Radar wird „Meldungen“ (eine Zeile je Aktie); Screener mit Profilen, Profi hell; Anlagestile mit deutschem Namen; Aktie mit Profil, drei Sätzen und Kapiteln wie in Discover; Vergleich Profil gegen Profil; Backtests werden „Forschung, nicht zertifiziert“; Wortwahl nach docs/legal/WORTWAHL.md (keine Einstiegsmarke, Stopp-Marke, Zielzone).
