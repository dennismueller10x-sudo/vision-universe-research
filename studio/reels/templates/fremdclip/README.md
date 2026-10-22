# Vorlage „Fremdclip" (fremdes Video im Vordergrund, Beispiel Unitree H2-X)

Entstanden am 22.10.2026. **Ausnahme von Regel 4** (keine fremden Videos), ausdrücklich vom Owner für dieses Reel freigegeben. Quelle sichtbar im Bild („VIDEO: UNITREE ROBOTICS") und in der Caption. Vor jeder Wiederverwendung erneut beim Owner nachfragen.

- **Beschaffung:** YouTube sperrt `yt-dlp` aus der Cloud-Sitzung („Sign in to confirm you're not a bot", 403). Funktioniert hat Apify `streamers/youtube-video-downloader` (`storeInKVStore: true`, 1080p, mp4), 0,006 USD je MB, Obergrenze `maxTotalChargeUsd` mindestens 0,50 USD. Die Datei liegt rund 3 Tage im Apify-Speicher.
- **Grundfilm** (`build_base.py`): Clip-Abschnitte werden auf die Szenengrenzen der Stimme gestreckt oder gestaucht (Einbrecher 1,33×), Zeitlupe mit `minterpolate`, am Ende Standbild. Clip in voller 16:9-Breite (sonst schneidet der Rand Bewegungen ab), darunter derselbe Clip unscharf als Füllung. Originalton stumm.
- **Grafikebene** (`composition.html`, transparent gerendert): Schlagzeile über dem Clip, Icon-Karten darunter, Stempel „VORFÜHRUNG" bei der Einordnung, Aufrufzähler, Papierflieger, Endkarte. Dunkle Verläufe oben und unten, weil die unscharfe Füllung bei Tagszenen zu hell ist.
- **Zusammensetzen:** `ffmpeg -i base.mp4 -framerate 30 -i frames/f%05d.png -i mix.wav` mit `overlay` (statt `compose.sh`, das einen schwarzen Grund baut).
- **Hook:** Angst-Hook („Ein Mann mit Messer. Nachts. Vor deiner Tür.") passt zum ersten Bild des Clips; Hinweis „Vorführung, Puppen statt Menschen" als Re-Hook.
