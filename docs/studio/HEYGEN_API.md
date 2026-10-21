# HeyGen: Schnittstellen, Stimmen, Preise

Stand 2026-10-21. Gemessen in dieser Produktionsreihe. Der API-Schlüssel wird vom Proxy der Sitzung für `api.heygen.com` eingesetzt. Nie einen Schlüssel erfragen, speichern oder ausgeben.

**Regel:** Jeder Aufruf, der Guthaben kostet, wird vorher mit Preis genannt und vom Owner freigegeben. Pro Aufruf ein eigener `Idempotency-Key`. Keine automatischen Wiederholungen (ein zweiter Aufruf kostet doppelt).

## Guthaben prüfen (kostenlos)

```bash
curl -sS https://api.heygen.com/v3/users/me   # data.wallet.remaining_balance (USD), auto_reload.enabled
```

Auto-Reload ist aus. Fehler `402 insufficient_credit` heißt: Guthaben leer, der Owner muss aufladen. (Am 21.10.2026 aufgeladen auf 15 USD.)

## Stimme: Text zu Sprache

`POST /v3/voices/speech`, Header `Content-Type: application/json` und `Idempotency-Key`.

```json
{"voice_id":"e8b866d761284bd6b188848f3c9f5d4e","text":"…","language":"de","engine":"elevenlabs","settings":{"model_id":"eleven_v3"}}
```

Antwort `data`: `audio_url` (WAV), `duration`, `word_timestamps` (Liste `{word,start,end}` mit Platzhaltern `<start>`, `<end>`, `<break …>`). Die Wortzeiten steuern die Szenen. Preis: etwa 0,002 USD je Sekunde Rohaudio (50 s etwa 0,10 USD, 56 s etwa 0,12 USD).

Textregeln: Zahlen ausschreiben („dreihundertsiebzig"), „Vision Universe" als `Wischn Juniwörs`, kein `<break>` am Anfang, keine Sonderzeichen. Danach immer per Whisper gegenprüfen.

## Stimmen

| Name | voice_id | Hinweis |
|---|---|---|
| **Helmut** („German Epic Trailer Voice", aus ElevenLabs in HeyGen importiert) | `e8b866d761284bd6b188848f3c9f5d4e` | Standard seit Reel Altersvorsorgedepot v4. Tief, dramatisch. |
| Wolf Spencer | `ad9c4386ea934832b2de3ae2934005e9` | getestet |
| Dieter, Clemens, Heinrich | in HeyGen-Liste (`list_voices`) | getestet, nicht gewählt |

Avatare (Nora, Noah) wurden getestet. Der Owner möchte **keine HeyGen-Avatare**, Nora klang unecht. Gesucht ist weiter eine noch dramatischere Stimme (Owner prüft parallel).

ElevenLabs direkt: kein Schlüssel in der Sitzung. Die ElevenLabs-Musik-API gibt es nur im Bezahlplan (Aufladen ab 5 USD). Für Stimmen läuft ElevenLabs über HeyGen (`engine: elevenlabs`).

## Clips: Text zu Video

`POST /v3/models/videos` (Antwort 202, `data.video_id`), danach `GET /v3/models/videos/{id}` bis `status: completed` (`video_url`).

```json
{"model":"heygen-video-1","mode":"text_to_video","aspect_ratio":"9:16","duration":5,"prompt_enhancement":"quality","resolution":"768p","prompt":"… No text, no numbers, no logos, no watermark."}
```

- Dauer 5 bis 15 s, Auflösung 768p (768 × 1344) oder 1080p. Preis: 768p 5 s etwa 0,10 USD, 1080p etwa 0,25 USD.
- Prompts: „No text, no numbers, no letters, no logos". Bildstil passend zur Marke (dunkel, Lime-Licht, Nebel).
- Fotorealistische Marken-Nachbauten (Tesla, Optimus) vermeiden: Verwechslung mit echtem Material, Markenrecht, KI-Kennzeichnung. Generische, markenlose Szenen sind unkritischer.
- Clips werden gestreckt (1,3 bis 1,8×) und abgedunkelt unter die Grafik gelegt.

## Assets hosten (stabile öffentliche Adresse)

HeyGen-MCP: `create_asset_upload` (filename, contentType `video/mp4`, sizeBytes) liefert `upload_url`. Dann `PUT` der Datei mit Headern `content-type: video/mp4` und `x-amz-server-side-encryption: AES256`. Danach `complete_asset_upload`. Ergebnis: `https://resource2.heygen.ai/video/<asset_id>/original.mp4`, öffentlich, ohne Ablauf, mit Range-Unterstützung (ETag gleich MD5 der Datei). Das braucht der Worker für `social-reel.yml`. Maximal 200 MB.

## Nicht benutzt

`GET /v3/audio/sounds` (Musik- und Effektbibliothek; früher getestet, Lizenz nicht dokumentiert, deshalb nicht mehr genutzt), `/v3/hyperframes/renders`, Video-Agent `POST /v3/video-agents`, Avatar-Videos. Das HeyGen-HyperFrames-Studio ist ein Abo-Produkt (kein neues Abo ohne Freigabe).

## Preise gesamt (Stand Oktober 2026)

Reel mit Stimme etwa 0,1 bis 0,15 USD. Mit drei Clips zusätzlich etwa 0,3 USD. Apify-Läufe wenige Cent (Hashtag-Scraper 0,0026 USD je Ergebnis, X-Scraper 0,00015 USD je Zeile).
