# Mein Bereich, Portfolios, AI-Atlas · Konzept

Konzept vom 09.11.2026 für die persönlichen Bereiche (Willkommensseite + Mein Dashboard), die Musterdepots unter /portfolios/ und den AI-Atlas (/ask/), im gleichen Muster wie die Produktwelten (Ordner nebenan). Version 2 nach Owner-Feedback (Dashboard unverändert; Willkommensseite, Musterdepot und Atlas neu gestaltet). Freigegeben am 09.11.2026 für Mein Dashboard, Portfolios und Atlas; die Willkommensseite bleibt wie heute (Owner). Bauplan und Master-Prompt: `HANDOVER.md`.
Präsentation online (privat): https://claude.ai/artifact/Tt79faCqfHwp9jP2oVKjc9

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/mein-bereich-2026-11/`. |
| `deck-mb.js` | Mockups (Screens `w-*`, `m-*`, `p-*`, `a-*`) und Folien K1, MX01–MX02, PX01–PX02, AX01–AX03, U1. |
| `data-mb.js` | Kurse und Kursreihen (Stand 06.11.2026), erzeugt von `build-data.py`. |
| `img/stories/*.jpg` | Vorschaubilder der 30-Sekunden-Videos (verkleinert aus `assets/stories/`). |
| `now/*.jpg` | Heutige Seiten auf 390 px (09.11.2026). Mein Dashboard mit simulierter Anmeldung im Browser (Konten sind bis zur Freigabe aus; nichts wurde gesendet); lokal fehlten die Watchlist-Kurse. |
| `bundle.py` | Packt alles in eine HTML-Datei. `lib/` ist eine Kopie der Redesign-Bausteine (Kopf-Logo über eingebettete Bilder). |

Kern (Version 2):
- **Willkommen** bleibt in der gewählten Reihenfolge: Trailer randlos oben, dann die 30-Sekunden-Videos als hohe Karten (neu/gesehen), ein Einstieg ins Dashboard und die Welten als Kacheln mit einer Zahl von heute, Atlas als zehnte Kachel. Ein geöffnetes Video zeigt den Player.
- **Mein Dashboard** unverändert aus Version 1: „Heute bei deinen Aktien“ mit Ereignissen aus allen Welten, nur gelesen.
- **Musterdepot** (Weinstein): Methode als Bild (vier Phasen, Phase 2 hervorgehoben), Verteilung inkl. Bargeld laut Gewicht, je Aktie Mini-Chart seit Aufnahme mit Ungültig-Marke, Protokoll. Die Übersicht zeigt das Methodenbild auf der Depot-Karte.
- **Atlas**: dunkler Kopf mit Eingabe, „Was Atlas kann“ (Finden, Vergleichen, Erklären), „Oft gefragt“; Antworten zeigen die übersetzten Regeln, das Ergebnis (echtes Screening: 14 von 5.354 US-Aktien) und die Quelle; Sheet auf jeder Aktie.

Konten bleiben aus bis zur Freigabe, nichts Neues wird gespeichert.
