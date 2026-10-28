# Cover-Vorlage (Comic-Plakat)

Vorschaubild 1080 × 1920 im Stil der Kanalregeln („Pflicht ab Reel 2“ in `../../README.md`): Titel in Bangers mit dicker Kontur und hartem Schatten, Zeitungscollage aus eigenen Schlagzeilen und Charts in Graustufen, Figur groß in der Mitte. Alles Wichtige liegt im 3:4-Ausschnitt des Instagram-Rasters (y 240–1680).

```bash
cd brand-media/kanal-2/vorlagen/cover
node cover.mjs data=../../reels/<reel>/cover.json out=/tmp/cover.jpg   # PW=<pfad zu playwright> falls global installiert
```

`cover.json`:

| Feld | Bedeutung |
|---|---|
| `title` | 2–3 Zeilen, je Zeile automatisch auf höchstens 960 px Breite gesetzt |
| `color` | `gelb` (Standard), `blau`, `rot` (dringend), `gruen` |
| `figure` | Bildname aus `figuren/entwurf-1/v2/` ohne `.png`, z. B. `bulle-schock`; für Outfits mit Pfad, z. B. `outfits/outfit-sakko/bulle-schock` |
| `tag` | optional, z. B. `TEIL 1` oder `RECAP 28.10.` |
| `clippings` | Schlagzeilen für die Collage, `{h, big?, up?}`; `big` setzt eine große Zahl, `up` die Richtung der Linie |
| `seed` | feste Zufallszahl, damit das Cover bei jedem Rendern gleich aussieht |

Nur eigene Texte und Grafiken in der Collage, keine fremden Fotos oder Logos ohne Rechte.
