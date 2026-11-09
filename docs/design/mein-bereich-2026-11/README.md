# Mein Bereich, Portfolios, AI-Atlas · Konzept

Konzept vom 09.11.2026 für die persönlichen Bereiche (Willkommensseite + Mein Dashboard), die Musterdepots unter /portfolios/ und den AI-Atlas (/ask/), im gleichen Muster wie die Produktwelten (Ordner nebenan). Noch nicht freigegeben, noch nicht umgesetzt.
Präsentation online (privat): https://claude.ai/artifact/Tt79faCqfHwp9jP2oVKjc9

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation. Lokal: `python3 -m http.server` im Repo-Wurzelverzeichnis, dann `/docs/design/mein-bereich-2026-11/`. |
| `deck-mb.js` | Mockups (Screens `m-*`, `p-*`, `a-*`) und Folien K1, MX01–MX02, PX01–PX02, AX01–AX03, U1. |
| `data-mb.js` | Kurse und Kursreihen (Stand 06.11.2026), erzeugt von `build-data.py`. |
| `now/*.jpg` | Heutige Seiten auf 390 px (09.11.2026). Mein Dashboard mit simulierter Anmeldung im Browser (Konten sind bis zur Freigabe aus; nichts wurde gesendet); lokal fehlten die Watchlist-Kurse. |
| `bundle.py` | Packt alles in eine HTML-Datei. `lib/` ist eine Kopie der Redesign-Bausteine (Kopf-Logo über eingebettete Bilder). |

Kern: Willkommen und Mein Dashboard werden ein Ort „Mein Bereich“ mit „Heute bei deinen Aktien“ (Ereignisse aus allen Welten, nur gelesen) – das Willkommen bleibt für den ersten Besuch; Portfolios im neuen Design mit den Namen der Welten und drei Sätzen je Depot; Atlas mit einer Eingabe, einem Status, Antworten mit Rechenweg und Quelle, und als Sheet auf jeder Aktie. Konten bleiben aus bis zur Freigabe, nichts Neues wird gespeichert.
