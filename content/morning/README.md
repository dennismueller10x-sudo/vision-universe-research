# Vision Universe Morning Briefing

Jede Ausgabe liegt als eigene Markdown-Datei mit dem Namen `YYYY-MM-DD.md` in diesem Ordner. Nach einem Push auf `main` erzeugt die GitHub Action automatisch die Übersicht, das chronologische Archiv, die Detailseite und `morning/issues.json` für die aktuelle Startseiten-Kachel.

## Pflichtfelder

```yaml
---
date: 2026-09-05
time: 09:00
title: "Titel"
subtitle: "Deck der Ausgabe"
slug: "2026-09-05"
category: "Märkte"
readTime: "2 Min."
heroImage: "/morning/assets/2026-09-05-thema.png"
heroAlt: "Beschreibung des Titelbildes"
tickers: ["SPY", "QQQ"]
hashtags: ["Aktien", "Märkte"]
keyNumber: "42 %"
keyNumberLabel: "Kurze Einordnung der Zahl"
excerpt: "Teaser für Archiv und Startseite."
xHeadline: "VISION UNIVERSE BÖRSENGRUSS ☕️"
xText: "Vorbereiteter Social-Text"
xTickers: ["SPY", "QQQ"]
xHashtags: ["Aktien", "Märkte"]
sources: ["Primärquelle – Dokument oder Datensatz"]
---
```

Unter dem Frontmatter folgt der Artikel als Markdown-Fließtext. Erlaubte Hauptkategorien sind: Aktien, KI, Halbleiter, Robotik, Biotech, Märkte, Makro, Altersvorsorge, ETFs, China, Zukunftstechnologien und Unternehmen.

Das Titelbild muss 16:9 sein. Atlas wird immer aus dem unveränderten Originalasset `/assets/atlas.png` eingebunden.

Lokale Vorschau neu erzeugen:

```bash
node scripts/morning/build-morning.mjs
```
