# Fundamental + Screener · Konzept „Verstehen. Finden.“

Konzept vom 08.11.2026 für /fundamental/ und /screener/, gleicher Ansatz wie [Discover](../discover-netflix-2026-11/README.md) und [Quant](../quant-2026-11/README.md); Maßstab: Funktionsumfang großer Analyse- und Screening-Seiten, Bedienung so leicht wie eine Neo-Broker-App. **Vom Owner freigegeben am 08.11.2026.** Bauplan und Master-Prompt: [HANDOVER.md](HANDOVER.md).
Präsentation online (privat): https://claude.ai/artifact/1Vq5qbDWt1415UeUWd7cyD

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/fundamental-screener-2026-11/`. |
| `deck-fs.js` | Mockups (Screens `f-*`, `s-*`) und Folien K1–K3, FX01–FX07, U1. |
| `data-fs.js` | Echte Werte (Stand 06.11.2026), erzeugt von `build-data.py` aus dem Screener-Universum. Das Universum entsteht lokal mit `node scripts/screener/build-universe.mjs` (`screener/data/` ist nicht eingecheckt). |
| `now/*.jpg` | Heutige Seiten auf 390 px (08.11.2026, lokal; die volle Fundamental-Historie lag lokal nicht vor). S05 nur die ersten 8.000 von 11.052 px. |
| `bundle.py` | Packt alles in eine HTML-Datei. `lib/` ist eine Kopie der Redesign-Bausteine. |

Kern: Fundamental-Aktie wie Discover und Quant (ein Satz, Kennzahlen-Streifen, ein Finanz-Chart, Checklisten, Kapitel); Kennzahl-Detail mit „+ Firma“; Screener mit Satz-Baustein und Trefferzahl je Ergänzung, Filter-Sheet mit Regler über der echten Verteilung, ruhige Trefferliste in 25ern, Vorschau-Sheet; drei Checklisten (Qualität, Wachstum, Bewertung) als neue, offene Regeln; Wortwahl („passt zu dir“, „Interessante Bewertungen“).
