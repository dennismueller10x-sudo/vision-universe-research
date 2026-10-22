# Vorlage „Meta Muse" (Hook ab Bild 1, Zeichnungen, Mock-up)

Entstanden am 22.10.2026 aus dem Meta-Q3-Call (Reel vom Owner veröffentlicht). Fassung 44 s, Stimme Helmut, Musik Dropbox-Track.

## Was die Vorlage zeigt

- **Hook ab Bild 1:** Die Großzahl „10 Mio." steht schon im ersten Bild. Szene 1 ist ab t=0 voll sichtbar (`scene(..., first=true)`), nichts baut sich erst nach einer leeren Sekunde auf. Gesprochen ab 0,0 s.
- **Zeichnungen:** SVG-Pfade mit `pathLength="1"`, `stroke-dasharray:1` und `stroke-dashoffset` (Hilfsfunktion `draw`). So zeichnen sich Schleife, Einkaufswagen, Chip, Pfeil, Zeitstrahlen und Unterstreichung selbst.
- **Mock-up:** Handy mit tippendem Chat und Produktkarte, immer mit Kennzeichnung „ILLUSTRATION". Keine Nachbauten fremder Oberflächen.
- **Marken:** Kein nachgebautes Fremdlogo. Statt des Logos eine neutrale Schleife und das Wort in unserer Schrift.
- **Hintergrundbilder des Owners** (`assets/bgA.jpg`, `assets/bgB.jpg`): nicht im Repo, Rechte beim Owner. Vorbereitet mit `ffmpeg … scale, crop, eq=brightness=-0.22:saturation=0.8`. Die Bilder werden vorab abgedunkelt und zugeschnitten, **kein CSS-`filter`/`mask`/Blur** auf großen Ebenen (siehe Lehren). In der Caption steht „Bildquelle: …".

## Ablauf mit dieser Vorlage

1. `script.txt` schreiben (Skript-DSL, siehe Kopf von `tools/build_script.py`). Jede Szene `[[s2]]…[[s6]]`, Ereignisse `[[e:name]]` für Grafiken.
2. `python3 -I tools/build_script.py script.txt tts tts_request.json`, Stimme aufnehmen, `tighten.py`, Whisper prüfen.
3. `python3 -I tools/build_script.py script.txt timing words.json timing.json`.
4. Komposition anpassen (Texte, Icons, Zahlen). Die Ereignisnamen in `render()` müssen zu den Marken im Skript passen.
5. Rendern: `node tools/render.mjs out=frames timing=timing.json` (vier Prozesse parallel über `i0` und `i1`).
6. Ton: `tools/sfx_events.py timing.json sfx.wav` (Einschläge und Ticks aus den Ereignissen), `mix_adv.py`, `finalize_audio.sh`, `compose.sh a …`.

Bildfehler werden vom Render-Werkzeug bis zu dreimal wiederholt.
