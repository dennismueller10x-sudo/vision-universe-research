# Discover · Konzept „Reihe für Reihe“ (Netflix der Aktienwelt)

Konzeptvorschlag vom 08.11.2026 für den Umbau der Discover-Startseite im CI des Redesigns 2027. Noch nicht freigegeben, noch nicht umgesetzt.
Präsentation online (privat): https://claude.ai/artifact/La3y9L68RsQBDoKCnuETgK

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/discover-netflix-2026-11/`. |
| `deck.js` | Mockups (Screens `n-*`) und Folien (K1–K2, DX01–DX06, U1–U4). |
| `data-discover.js` | Echte Reihen, Treffer und Kursreihen (Datenstand 06.11.2026), erzeugt von `build-data.py`. |
| `bundle.py` | Packt alles in eine HTML-Datei (für den Artefakt-Link). |
| `lib/` | Kopie von `../redesign-2027/lib.js` und `data.js` (Bausteine, Chart). |
| `now/D01.jpg` | Heutige Startseite, 390 px breit. |

Die Präsentation ist keine Produktivseite und ändert keine Daten, Engines oder Gates.
Kern: Billboard „Heute im Blick“, Markt als eine Zeile, Genre-Chips, 14 wischbare Reihen aus den 23 fertigen Reihen in `discover/data/rows`, vier Kartenformate, Reihen-Seite, Vorschau-Sheet, „Alle Reihen“, neue Reihe „Fallen Angels“ (Regel-Entwurf), Schaufenster-Regel.
