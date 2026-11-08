# Discover · Konzept „Reihe für Reihe“ (Netflix der Aktienwelt)

Konzept vom 08.11.2026 für Discover (Startseite und Aktienseite) im CI des Redesigns 2027. **Vom Owner freigegeben am 08.11.2026.** Bauplan und Master-Prompt für die Umsetzung: [HANDOVER.md](HANDOVER.md).
Präsentation online (privat): https://claude.ai/artifact/La3y9L68RsQBDoKCnuETgK

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/discover-netflix-2026-11/`. |
| `deck.js` | Startseite: Mockups (Screens `n-*`) und Folien (K1–K2, DX01–DX06, U1–U4). |
| `deck-aktie.js` | Aktienseite NVIDIA: Mockups (Screens `a-*`) und Folien AX01–AX05. |
| `data-discover.js` | Echte Reihen, Treffer und Kursreihen (Datenstand 06.11.2026), erzeugt von `build-data.py`. |
| `bundle.py` | Packt alles in eine HTML-Datei (für den Artefakt-Link). |
| `lib/` | Kopie von `../redesign-2027/lib.js` und `data.js` (Bausteine, Chart). |
| `now/D01.jpg`, `now/D09.jpg` | Heutige Startseite und Aktienseite NVIDIA (08.11.2026). |

Die Präsentation ist keine Produktivseite und ändert keine Daten, Engines oder Gates.
Kern: Billboard „Heute im Blick“, Markt als eine Zeile, Genre-Chips, 14 wischbare Reihen aus den 23 fertigen Reihen in `discover/data/rows`, vier Kartenformate, Reihen-Seite, Vorschau-Sheet, „Alle Reihen“, neue Reihe „Fallen Angels“ (Regel-Entwurf), Schaufenster-Regel. Aktienseite („Überblick“): Story in drei Sätzen, sieben Kapitel statt 14 Abschnitte, Reihen der Aktie, „Mehr wie …“, nächste Aktie der Reihe.
