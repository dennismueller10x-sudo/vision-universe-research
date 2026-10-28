# Aktienzoo Reel 2: „Warum ist Warren Buffett so reich?“

Erstes Reel nach den Stilregeln „Pflicht ab Reel 2“ (`../../README.md`). Stand 2026-10-28, nicht veröffentlicht.

- 73 s, 1080 × 1920, 30 fps, etwa −15 LUFS.
- Figuren in neuen Outfits: Bulle im Sakko, Bär im Pullover (`../../figuren/entwurf-1/outfits/`), Mund und Gesichter wie Reel 1.
- Bilddichte: Icons aus `../../icons/` springen bei Schlüsselwörtern ins Bild (bis zu drei je Satz), jede Szene in eigener Farbe mit Strahlen und Rasterpunkten.
- Schnitte: Zoom-Ruck an jedem Satzanfang, Wischblende mit Bewegungsunschärfe beim Szenenwechsel, Weißblitz und Wackler bei Schock-Momenten, Zeitstrahl, Vermögenskurve mit Schneeball, Split-Screen-Vergleich, Stempel.
- Ton: Stimmen wie Reel 1; Effekte aus `events.json`, das die Komposition selbst exportiert (`node render.mjs events=events.json`), damit jeder Effekt genau auf dem Bild sitzt.
- Cover aus `../../vorlagen/cover/` mit `cover.json`.
- Quelle und Rechenweg: `caption-instagram.txt`. Die Kurve ist eine Veranschaulichung aus Housels Eckwerten (0,3 Mrd. $ mit 50, rund 3 Mrd. $ Mitte 60, 84,5 Mrd. $ mit 89).

## Neu bauen

```bash
cd brand-media/kanal-2/reels/2026-10-28-buffett-zeit
WORK=/tmp/reel-buffett
python3 -I audio.py voice --out $WORK       # etwa 0,15 USD, nur nach Freigabe; danach timing_vo.json hierher kopieren
node render.mjs events=events.json          # nur nötig, wenn sich Komposition oder Timing ändern
node render.mjs video=$WORK/frames.mp4
python3 -I audio.py mix --out $WORK
ffmpeg -i $WORK/frames.mp4 -i $WORK/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $WORK/reel.mp4
(cd ../../vorlagen/cover && node cover.mjs data=../../reels/2026-10-28-buffett-zeit/cover.json out=$WORK/cover.jpg)
```
