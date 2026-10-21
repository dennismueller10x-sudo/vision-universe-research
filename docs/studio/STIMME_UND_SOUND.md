# Stimme, Musik, Effekte, Lautheit

Stand 2026-10-21.

## Stimme

Helmut (siehe HEYGEN_API.md). Nach jeder Aufnahme:

1. Pausen über 0,26 s auf 0,13 s kürzen, Tempo 1,14 (`studio/reels/tools/tighten.py`). Das spart etwa 15 bis 18 % Länge. Höhere Tempi klingen künstlich.
2. Whisper (`faster-whisper small`) gegenprüfen. Typische Fehler: „Riester" wird „Rieser" oder „Leaster" (besonders nach `<break>`), „Vision Universe" wird deutsch gesprochen, „Ark" wird „Ag". Abhilfe: das betroffene Wortpaar aus einer früheren geprüften Aufnahme als Ausschnitt einsetzen (mit 12 ms Überblendung) und die Wortzeiten verschieben. Das hat bei „Riester ist vorbei." und bei „Wischn Juniwörs" und „Ark Invest" funktioniert.
3. Zahlen ausschreiben. „2027." wurde als Datum falsch betont, deshalb „zweitausendsiebenundzwanzig" oder umformulieren.

## Musik

- Eigener Track des Owners in Dropbox (Konto info@visionuniverse.de): `/System_Collapse_-_Dark_Hybrid_Trailer.mp3`, 240 s, mit starken Anstiegen bei etwa 16, 24, 40, 68, 146 und 204 s. Zweite Datei: `VISION UNIVERSE – THE ARRIVAL Voiceover Track.mp3`. Es ist der Track des Owners, lizenzrechtlich unkritisch.
- Ausschnitt für die Tesla-Reels: ab 15,6 s, Länge Reel plus 3 s. Beginnt direkt mit Energie. Per Ducking unter der Stimme abgesenkt (`mix_adv.py`, Musik-RMS auf 0,09 skaliert, bis 45 % Absenkung bei Sprache).
- Früher getestete Musik (Kennungen 197f5c42 und 76aef06a, kurze Trailer-Tracks): 76aef06a gefiel dem Owner. Herkunft und Lizenz sind nicht dokumentiert (HeyGen-Sound-Bibliothek bzw. Generierung), deshalb gilt ab dem Riester-Reel der Dropbox-Track. Die Musik-API von ElevenLabs gibt es nur im Bezahlplan.

## Effekte

`studio/reels/tools/synth_sfx.py` synthetisiert Einschläge (Sub-Bass plus Rauschen, mit Hall), Riser und Ticks aus den Wortzeiten. Rechtefrei, kein Download. Einschläge bei Hook, bei der wichtigsten Zahl, bei Szenenwechseln und bei „Modell, keine Prognose". Nichts, was den Hook überdeckt.

## Lautheit

Ziel −14,2 LUFS integriert (`studio/reels/tools/finalize_audio.sh`: Verstärkung messen, `alimiter 0.89`). Der Owner fand „zu leise" bei früheren Fassungen, daher nicht darunter.
