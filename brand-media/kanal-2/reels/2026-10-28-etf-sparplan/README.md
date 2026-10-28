# Test-Reel 1: „Wer verdient an deinem Sparplan?“

Erstes Probe-Reel für Kanal 2, Stand 2026-10-28. Nicht veröffentlicht.

- Länge 64,5 s, 1080 × 1920, 30 fps, Ton etwa −15,8 LUFS.
- Figuren: `../../figuren/entwurf-1/` (Grok Image 2.0, Stil A, freigestellt). Nur eine Pose je Figur; Bewegung entsteht in `composition.html` (Atmen, Sprech-Wippen, Sprung, Schütteln, Neigen je Pose aus `lines.json`).
- Stimmen über HeyGen (Engine `orca`): Bulle „Florian – Dynamic & Punchy“, Bär „Deep Dieter“. Nicht die Vision-Universe-Stimme.
- Schriften Archivo Black und Nunito (SIL Open Font License), unter `../../fonts/`.
- Effekte synthetisch (`audio.py mix`), keine Musik.
- Fakten und Quellen: `caption.txt`.

## Neu bauen

```bash
cd brand-media/kanal-2/reels/2026-10-28-etf-sparplan
WORK=/tmp/reel-etf                          # Arbeitsordner außerhalb des Repos
python3 -I audio.py voice --out $WORK       # kostet etwa 0,10 USD, nur nach Freigabe
cp $WORK/timing_vo.json .                   # nur wenn die Stimmen neu erzeugt wurden
node render.mjs video=$WORK/frames.mp4      # Playwright und Chromium; PW=<pfad> falls global installiert
python3 -I audio.py mix --out $WORK
ffmpeg -i $WORK/frames.mp4 -i $WORK/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $WORK/reel.mp4
```

Standbilder zur Kontrolle: `node render.mjs times=2,9,37,52 out=$WORK/stills`.

## Offene Punkte für die nächste Fassung

- Posen je Figur (zeigt, schockiert, jubelt, grübelt; Mund offen und zu, Augen zu) als Bildauftrag mit `../../figuren/entwurf-1/*` als Vorlage.
- Kanalname festlegen, dann Endkarte anpassen.
