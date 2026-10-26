# Studio: Highlights der Willkommensseite

Rezepte und Bauskript für die Videos in den Highlights von `/willkommen/`. Konzept, Sprechertexte und Regeln: [docs/studio/ERKLAERSERIE.md](../../docs/studio/ERKLAERSERIE.md).

## Aufbau

| Ort | Inhalt |
|---|---|
| `studio/stories/<id>/story.json` | Rezept: Quelle (Dropbox-Pfad), Version, Stimme, Texteinblendungen mit Zeiten |
| `studio/stories/<id>/voice-v<n>.m4a` | Sprecheraufnahme (Helmut), damit ein Neubau ohne neue Kosten geht |
| `studio/stories/build-story.mjs` | baut die App-Fassung aus Quelle und Rezept |
| `assets/stories/<id>-v<version>.mp4` und `.jpg` | ausgelieferte App-Fassung und Poster (im Repo) |
| `willkommen/config/stories.json` | welches Highlight welche Datei zeigt |

Die Quelldateien in voller Größe (Masters) bleiben in der Dropbox des Owners und kommen nie ins Repo.

## Benennung

`<id>-v<version>`: `id` ist das Highlight (`start`, später zum Beispiel `discover`, `quant`), `version` zählt jede neue Fassung hoch. Ein neuer Dateiname sorgt dafür, dass kein Browser eine alte Kopie aus dem Cache zeigt. Der Test der Willkommensseite prüft, dass Dateiname und Rezept zusammenpassen.

Jedes Erklärvideo hat einen Sprecher (Regel des Owners). Die Stimme liegt als `voice-v<n>.m4a` neben dem Rezept; `build-story.mjs` legt sie ab `voice.offset` über den Quellton und senkt diesen darunter ab.

## Neue Fassung, zum Beispiel wenn ein Modul dazukommt

1. Text in `studio/stories/<id>/story.json` ändern (`*Wort*` färbt Lime, `\n` bricht um), `version` um eins erhöhen. Ändert sich der gesprochene Text: neue Aufnahme mit Helmut (Kosten vorher nennen), `tighten.py`, als `voice-v<version>.m4a` ablegen, Einblendungen auf die neuen Wortzeiten legen.
2. Quelle aus der Dropbox laden und bauen:
   ```bash
   node studio/stories/build-story.mjs studio/stories/start/story.json --source "<Pfad zu THE ARRIVAL – Original.mp4>" --apply
   ```
   `--apply` setzt im Highlight die neue Datei, Dauer und Poster ein und erhöht `rev`, damit der Kreis wieder als neu leuchtet.
3. Die Datei der alten Version löschen (`git rm assets/stories/<id>-v<alt>.*`), die Git-Historie behält sie.
4. `node --test "willkommen/tests/*.test.mjs"`, MP4 an den Owner zur Freigabe, dann PR.

Ein neues Highlight bekommt einen eigenen Ordner `studio/stories/<id>/` und einen Eintrag in `willkommen/config/stories.json`.

## Speicher

Die App-Fassungen liegen im Repo und werden mit der Seite ausgeliefert (GitHub Pages). Das passt, solange sie klein bleiben:

- 720 × 1280, H.264, Ton −16 LUFS, etwa 3 MB für 20 Sekunden. Der Test lehnt Dateien über 6 MB ab.
- Zehn Highlights brauchen etwa 30 bis 50 MB. GitHub empfiehlt Repos unter 1 GB und Dateien unter 50 MB; die Seite selbst darf bis 1 GB groß sein.
- Jede neue Fassung bleibt in der Git-Historie (etwa 3 MB je Fassung). Bei seltenen Änderungen ist das unkritisch.

Wird es mehr (viele Videos, häufige Neufassungen, längere Filme), ziehen die Videos auf einen eigenen Speicher mit öffentlicher Adresse um, zum Beispiel einen HeyGen-Asset-Upload wie bei den Reels oder einen Cloudflare-Speicher. Dann ändert sich nur `src` in `willkommen/config/stories.json`; Seite und Rezepte bleiben gleich.
