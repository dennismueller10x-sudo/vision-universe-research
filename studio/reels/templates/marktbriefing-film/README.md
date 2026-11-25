# Vorlage „Marktbriefing-Film“ (zeitlos, helles Website-Design)

Produktfilm für das Marktbriefing, 39 s, 1080 × 1920, Stimme Helmut, Musik Dropbox-Track `System_Collapse_-_Dark_Hybrid_Trailer.mp3` ab 15,6 s, −14,2 LUFS. Entstanden am 24./25.11.2026; Owner hat den Hook „Profis starten den Börsentag mit einem Marktbriefing. Ab jetzt du auch.“ gewählt.

## Ablage

| Was | Wo |
|---|---|
| Original (1080 × 1920) | HeyGen-Asset `fe12a838468a4118beba93a4b8a31433` (`https://resource2.heygen.ai/video/fe12a838468a4118beba93a4b8a31433/original.mp4`) |
| Web-Fassung (720 × 1280, 2,6 MB) und Vorschaubild | `landing/marktbriefing/film/` – eingebunden oben auf `/marktbriefing/` (`www.js`, `filmBlock`) |
| Tages-Reel 23.11.2026 (Huang, Nvidia +31 %) | HeyGen-Asset `1b107f0ab6d24e2a8d7b75841b1eee7f` |

## Bau

Wie `studio/reels/README.md`: `build_script.py script.txt tts …`, Stimme, `tighten.py`, `build_script.py … timing`, `render.mjs` (vier Prozesse), `sfx.py`, `mix_adv.py`, `finalize_audio.sh`, `compose.sh a` mit **weißem** Grund (`c=0xffffff` statt `0x08080a`).

`assets/` braucht: `inter-latin.woff2`, `vision-universe-logo.png` (dunkel, ohne Invertieren), aus einer Ausgabe `landing/marktbriefing/<datum>/` die Bildschirme `bildschirm-01/04/07/14.jpg`, `titel.png`, `seite-02.png`, `seite-03.png`, dazu ein App-Bild mit geöffnetem Briefing (`app-story23.png`, Playwright auf `/willkommen/`, Kreis „Briefing“ antippen).

Regeln aus der Entstehung: keine Aktienanzahl und kein „US“ im Sprechertext (Universum kann wachsen, ETFs sind drin); kein „täglich“; Bildschirme sind Beispiele, die Caption sagt das.
