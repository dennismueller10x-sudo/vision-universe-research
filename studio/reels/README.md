# Studio: Reel-Werkzeuge

Lokale Pipeline für Vision-Universe-Reels (HTML-Komposition im HyperFrames-Stil, Chromium, FFmpeg). Konzept und Formel: [docs/studio/REEL_PLAYBOOK.md](../../docs/studio/REEL_PLAYBOOK.md). Belege: [docs/studio/REEL_RESEARCH.md](../../docs/studio/REEL_RESEARCH.md).

Nichts hier veröffentlicht etwas. Veröffentlicht wird nur im Approval Center durch den Owner. Es liegen keine Medien, Schlüssel oder fremden Inhalte im Ordner.

## Inhalt

| Datei | Zweck |
|---|---|
| `tools/tighten.py` | Kürzt lange Wortlücken (über 0,26 s auf 0,13 s), hebt das Tempo (atempo), schreibt Wortzeiten; optional Nachlauf am Wortende (`… 1.14 0.2`), wenn End-Silben fehlen |
| `tools/synth_sfx.py` | Synthetisierte Einschläge, Riser und Ticks aus den Wortzeiten (rechtefrei) |
| `tools/mix_adv.py` | Stimme, Effekte und Musik mischen, Musik unter der Stimme abgesenkt |
| `tools/finalize_audio.sh` | Pegel auf −14,2 LUFS, Spitzenbegrenzung |
| `tools/render.mjs` | Rendert die Komposition als transparente Bildfolge (Playwright und Chromium) |
| `tools/compose.sh` | FFmpeg: Hintergrund (Variante `b` mit Clips), Bildfolge, Ton zu MP4 |
| `tools/build_script.py` | Skript-DSL (`[[s2]]`, `[[e:name]]`, `{gesprochen|Anzeige}`, `**fett**`) zu Sprechtext und Zeitplan |
| `tools/sfx_events.py` | Effekte aus den Ereignismarken des Skripts (statt fester Wortnummern) |
| `templates/tesla-ark/` | Referenzreel: Komposition, Zeitberechnung, Stimmentext, Caption |
| `templates/meta-muse/` | Hook ab Bild 1, Zeichnungen, Handy-Mock-up, Hintergrundbilder |
| `templates/quartalszahlen/` | datengesteuerte Zahlenvorlage (`data.json`), Beispiel Tesla Q3 |
| `templates/aktie-ausbruch/` | Aktie im Ausbruch aus Discover/Quant (echter Kurs, Grund aus SEC 8-K, Gegenstimme, nachgebaute Discover-Karte) |
| `templates/produkt-quant/` | Produktvideo Quant als Anzeige (Hook mit Radar-Zahl, 7-Achsen-Radar, Meldungen, Signal gegen Markt) |
| `templates/supertrader-erklaert/` | Erklär-Serie für Highlights (Teil 1 Minervini), iPhone-Mock-ups, Checkliste, Markt-Scan mit Platzhalter-Treffern |
| `templates/etf-earnings/` | eigene Daten im iPhone (echte Kurssprünge, SEC-Umsatz), ETF-Ring, Waage; `earn_moves.py` für Kursbewegungen nach Quartalszahlen |
| `templates/fremdclip/` | fremdes Video im Vordergrund (nur mit Freigabe des Owners), Grundfilm aus Clip-Abschnitten, Grafikebene darüber |
| `templates/tesla-robotaxi/` | ein Gedanke aus dem Quartalsbericht, Bilder aus der Präsentation, Route, Globus mit Zähler, Kurve, Uhr, Papierflieger |

## Ablauf in Kürze

Arbeitsordner anlegen, `assets/` mit `assets/fonts/inter-latin.woff2` (als `inter-latin.woff2`) und `assets/vision-universe-logo.png` aus dem Repo füllen. Playwright-Core und Chromium bereitstellen (in der Cloud-Sitzung `/opt/pw-browsers/chromium-*`).

```bash
# 1. Stimme (kostet Guthaben, nur nach Freigabe, ein Aufruf)
curl -X POST https://api.heygen.com/v3/voices/speech -H "Content-Type: application/json" \
     -H "Idempotency-Key: <neu je Aufruf>" -d @tts_request.json -o tts_response.json
# Stimme Helmut: voice_id e8b866d761284bd6b188848f3c9f5d4e, engine elevenlabs, model eleven_v3
# Aussprache: "Vision Universe" als "Wischn Juniwörs" schreiben, kein <break> am Textanfang

# 2. Audio laden, Pausen kürzen, Tempo 1,14
python3 -I tools/tighten.py tts_response.json vo_raw.wav vo.wav words.json 1.14

# 3. Transkript gegenprüfen (faster-whisper small), Aussprache und Wortgrenzen kontrollieren

# 4. Zeiten und Szenen (Skript anpassen: Wortanzahl und Szenengrenzen)
python3 -I templates/tesla-ark/build_timing.py words.json timing.json

# 5. Bilder rendern (vier Prozesse parallel, i0/i1 sind Bildnummern bei 30 fps)
node tools/render.mjs out=frames timing=timing.json i0=0 i1=361 &  # usw.

# 6. Ton
python3 -I tools/synth_sfx.py timing.json sfx.wav
ffmpeg -ss 15.6 -t <Länge+3> -i music.mp3 -ar 48000 -ac 2 music_slice.wav
python3 -I tools/mix_adv.py timing.json vo.wav sfx.wav music_slice.wav mixraw.wav 1.0
tools/finalize_audio.sh mixraw.wav mix.wav

# 7. Zusammensetzen (b = mit Hintergrund-Clips, a = nur Grafik)
bash tools/compose.sh b frames mix.wav out.mp4 timing.json [clip1.mp4 ...]
```

Hosting und Karte: HeyGen-Asset-Upload (`create_asset_upload`, PUT, `complete_asset_upload`) liefert eine stabile öffentliche Adresse mit Range-Unterstützung. Danach Workflow **Social Reel vorbereiten** (`social-reel.yml`, `action=prepare`) mit Content-ID, Video-Adresse und Caption.

## Hinweise

- Das Render-Werkzeug wiederholt Bilder bis zu dreimal. Bricht es dennoch mit `Target crashed` ab: `df -h /tmp` prüfen (Kontingent voll) und fehlende Bilder (`f00000.png` bis `f0NNNN.png`) in Blöcken nachrendern (`i0=… i1=…`).
- `render.mjs` nimmt `data=data.json` (setzt `window.DATA`) und `ovl=0` (undurchsichtiger Hintergrund).

- `templates/tesla-ark/composition.html` verweist auf zwei Bilddateien (`cab_duo.jpg`, `opt_duo.jpg`), die nicht im Repo liegen (Herkunft und Rechte der Bilder sind Sache des Owners). Für neue Reels diese Szenen durch eigenes Material oder reine Grafik ersetzen.
- Die Skripte schreiben nur in den Arbeitsordner, nie in `quant/data`, `discover/data` oder andere generierte Artefakte.
- Kosten je Reel: Stimme etwa 0,1 bis 0,15 USD, HeyGen-Clip 768p etwa 0,10 USD je 5 Sekunden.
