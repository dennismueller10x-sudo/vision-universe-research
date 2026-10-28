# Test-Reel 2: „Dein Sparplan nach 30 Jahren“

Überarbeitung von Test-Reel 1 nach dem Feedback des Owners (28.10.2026). Nicht veröffentlicht.

Was sich gegenüber Fassung 1 ändert:

- **Kein Dauerwackeln.** Die Figuren stehen still und sprechen per Bildwechsel: Mund zu / halb / offen nach der Lautstärke der Stimme (`amp` in `timing_vo.json`, ein Wert je Videobild), Blinzeln, Gesichtsausdruck am Satzanfang. Bilder: `../../figuren/entwurf-1/v2/` (Qwen-Image-3-Bearbeitungen, nur Mund- bzw. Augenpartie auf die Grundfigur gesetzt, damit nichts springt).
- **Szenenwechsel wie in der Vorlage:** Figurenszene (harte Schnitte zwischen Totale und Nahaufnahme) im Wechsel mit einem Vollbild-Diagramm ohne Figuren.
- **Klarere Erklärung:** eine einzige Rechnung, Zeile für Zeile als Balken: eingezahlt, mit Rendite, minus ETF-Kosten, minus Steuer, was bleibt.
- **Untertitel in Wortgruppen** (bis drei Wörter, aktives Wort farbig), gesprochene Zahlen als Ziffern.
- **Natürlichere Pausen:** 0,3 s im selben Sprecher, 0,45 s beim Sprecherwechsel, Satzende nicht mehr hart abgeschnitten.

84 s, 1080 × 1920, 30 fps. Stimmen, Schriften und Bauweise wie Fassung 1.

## Neu bauen

```bash
cd brand-media/kanal-2/reels/2026-10-28-etf-sparplan-v2
WORK=/tmp/reel-etf-v2
python3 -I audio.py voice --out $WORK       # etwa 0,15 USD, nur nach Freigabe; danach timing_vo.json hierher kopieren
node render.mjs video=$WORK/frames.mp4
python3 -I audio.py mix --out $WORK         # braucht vo.wav und timing_vo.json im Arbeitsordner
ffmpeg -i $WORK/frames.mp4 -i $WORK/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $WORK/reel.mp4
```
