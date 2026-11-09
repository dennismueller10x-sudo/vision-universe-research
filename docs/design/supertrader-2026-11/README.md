# Supertrader · Konzept „Das Rezept eines Profis“

Konzept vom 08.11.2026, damit Supertrader verständlicher und intuitiver wird; gleicher Ansatz wie [Discover](../discover-netflix-2026-11/README.md), [Quant](../quant-2026-11/README.md) und [Fundamental + Screener](../fundamental-screener-2026-11/README.md). **Vom Owner freigegeben am 09.11.2026.** Bauplan und Master-Prompt: [HANDOVER.md](HANDOVER.md).
Präsentation online (privat): https://claude.ai/artifact/S8Tn3EDGAfAj2TeH3Ha9Mi

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/supertrader-2026-11/`. |
| `deck-st.js` | Mockups (Screens `t-*`) und Folien K1–K3, SX01–SX08, U1. Zahlen wie am 08.11.2026 auf /supertrader/ abgelesen (Datenstand 06.11.2026). |
| `data-st.js` | Kursreihen, erzeugt von `build-data.py`. |
| `now/T*.jpg` | Heutige Seiten auf 390 px (08.11.2026). |
| `bundle.py` | Packt alles in eine HTML-Datei. `lib/` ist eine Kopie der Redesign-Bausteine. |

Kern: eine Ablauf-Leiste mit klaren Wörtern statt zweier Stufen-Systeme (Erkennen: Muster erkannt · Regel erfüllt · Plan fertig; Musterdepot: Wartet · Aufgenommen · Im Musterdepot · Abgegeben); ein Name je Methode („Trader · Muster“); „Signale“ werden „Treffer“, „Backtests“ werden „Forschung“; Wortwahl nach docs/legal/WORTWAHL.md (keine Stop/Einstieg/„schlägt den Markt“), keine roten Pillen; Start, Methoden, Methode, Treffer, Aktie, Hausstrategie und Forschung im Muster der anderen Welten. Keine Regel, kein Musterdepot und kein Tageslauf ändert sich.
