# Kostenanalyse: frühere HeyGen-Trailer vs. „Cinematic“ (Stand 2026-10-11)

Nur lesende Abfragen (Videoliste, Modell-Endpunkt, Doku, HeyGen-Blog). **Keine Generierung, keine Aufladung, keine Tests.** Rohdaten: `registry/heygen-production-history.json`.

## Kurzfazit
**Es ist tatsächlich ein anderes Produkt.** Die früheren Trailer-Clips (08.–10.10.2026) wurden mit dem Prompt-Videomodell **`heygen-video-1`** erzeugt (`POST /v3/models/videos`: text-/image-/reference-to-video, 5–15 s, Ton inklusive, Abrechnung **pro Sekunde**: HeyGen nennt 0,03 USD/s bei 768p, 0,09 USD/s bei 1080p). Der „Cinematic“-Clip, den ich vorgeschlagen habe, ist ein anderes Produkt: **`cinematic_avatar`** (`POST /v3/videos`, Seedance-basiert, Avatar-Looks als Referenz, **Pauschalpreis pro Clip**, laut Drittquelle 7,32 USD bei 720p). Ich habe vor dem Vorschlag die bestehenden Produktionen nicht ausgewertet und das teurere Produkt gewählt. Das war mein Fehler; der Preis von 7,32 USD ist eine unverifizierte Drittangabe, aber nicht „falsch gelesen“, sondern gehört zu einem anderen Modell.

## 1. Was im Konto tatsächlich liegt (76 Videos)
| Zeitraum | Anzahl | Produkt/Modell | Nachweis |
|---|---|---|---|
| Jan–Mai 2026 | 30 | „My Video“, „UGC Ad Video“, „Avatar IV Video“ (12–100 s) | Modell nicht ermittelbar (nicht über `/v3/models/videos` abrufbar) |
| Aug–Sep 2026 | 17 (2 fehlgeschlagen) | „Atlas – …“ Avatar-Reels (13–21 s) | Atlas-Avatare; Modell nicht ermittelbar, vermutlich Avatar-Endpunkte |
| **08.–10.10.2026** | **24 (4 fehlgeschlagen, 20 fertig)** | **`heygen-video-1`**, Prompt-Titel „Cinematic … pitch-black room. A man and a woman …“, „Photorealistic cinematic commercial shot, shot on ARRI Alexa …“ | Modell-Endpunkt liefert `model: heygen-video-1`, Seed, Auflösung, Dauer |
| 10.–11.10.2026 | 3 | meine Tests: Avatar IV (2,5 s, 12,1 s), Avatar V (5,2 s) | Messung per Wallet |
Die 20 fertigen heygen-video-1-Clips: 1 × 480p-Klasse (5 s), 9 × 768p-Klasse (75 s; 756×1344 bzw. 768×1344), 10 × 1080p-Klasse (111 s; 1080×1890). Formate: 9:16 (15 s, Text-/Referenz-Prompt) und 4:7 (5–6 s, Bild-zu-Video-Pushins aus einem Bild/Frame). Kontaktbogen: `docs/mission02/assets/earlier_trailers_contact_sheet.jpg`.
**Inhalt (Sichtprüfung dreier 15-s-Clips):** dunkler Raum, weiße Deckenleuchte, ein Mann und eine Frau in schwarzer Lederkleidung betreten den Raum, setzen sich an einen schwarzen Tisch, Kamera orbit/push-in; ein Clip springt auf ein Mann-Close-up. Das sind **zufällig generierte Personen**, nicht LEA/DAVID. Drohnenflüge habe ich in den geprüften Clips nicht gesehen; die vollständigen Prompts liefert die API nicht (Titel auf 64 Zeichen gekürzt), und im Repo liegt nichts dazu.

## 2. Kosten der früheren Clips
Abgerechnete Beträge sind über die API **nicht abrufbar**; es gibt keine Abrechnungshistorie. Schätzung aus HeyGens Listenpreisen (HeyGen-Blog, Stand 10.10.2026: 480p 0,02 (Oktober-Aktion 0,01), 768p 0,03, 1080p/2k 0,09 USD/s, inkl. Ton; die API-Doku bestätigt „1080p und 2k = 3 × 768p“):
| Klasse | Clips | Sekunden | Schätzung Liste |
|---|---|---|---|
| 480p | 1 | 5 | 0,10 USD |
| 768p | 9 | 75 | 2,25 USD (Aktion ≈ 1,12) |
| 1080p | 10 | 111 | 9,99 USD |
| **Summe** | 20 | 191 | **≈ 12,3 USD** (Aktion ≈ 11,2) |
Ein einzelner 15-s-Clip kostet damit **0,45 USD (768p) bzw. 1,35 USD (1080p)**, ein 5-s-Clip 0,15 bzw. 0,45 USD. „Wenige Cent“ stimmt nur für 480p mit Aktionspreis (5 s ≈ 0,05 USD); die 1080p-Clips sind nach Listenpreis deutlich teurer, aber immer noch ein Bruchteil des Cinematic-Pauschalpreises. Ob die Clips über das **API-Wallet** (API-Schlüssel) oder **Web-Credits** (OAuth/MCP) liefen, lässt sich nicht beweisen; sie sind per API-Schlüssel abrufbar, und der Wallet-Stand zu Beginn (3,67 USD) passt zu verbrauchten Beträgen in dieser Größenordnung, ist aber kein Beleg.

## 3. Gegenüberstellung der Modelle
| Produkt | Endpoint | Abrechnung | Preis | Status des Preises | Von uns genutzt |
|---|---|---|---|---|---|
| **HeyGen Video (heygen-video-1)** | `POST /v3/models/videos` | je Sekunde, Ton inklusive | 0,02 / **0,03** / 0,09 USD/s (480p / 768p / 1080p, 2k) | HeyGen-Blog 10.10.2026 + Doku „1080p = 3× 768p“; **nicht gemessen** | 20 Clips (08.–10.10.) |
| Avatar IV (Photo) | `POST /v3/videos`, `engine avatar_iv` | je Sekunde | **0,039 USD/s** (gemessen); HeyGen-Hilfe 2,31 USD/min passt | gemessen | 2 Clips (Test, Hook) |
| **Avatar V (Photo)** | `engine avatar_v` | je Sekunde | **0,116 USD/s** (gemessen); HeyGen-Hilfe 7,20 USD/min passt | gemessen | 1 Clip |
| Cinematic Avatar (Seedance) | `type cinematic_avatar` | **Pauschale je Clip**, 4–15 s | 7,32 (720p) / 17,70 USD (1080p); Web 60/150 Credits | nur Drittquelle, unverifiziert | nie genutzt |
| Video Agent | `create_video_agent` | unbekannt | nicht ermittelt | – | nie genutzt (laut Videoliste nicht erkennbar) |
| Photo-Avatar-Anlage | `POST /v3/avatars` | je Anlage | 1,32 USD | gemessen | 2 (LEA, DAVID) |
| TTS-Probe | `POST /v3/voices/speech` | je Audio | ≈ 0,01–0,02 USD | gemessen | 9 Proben |
Warum der Unterschied so groß ist: heygen-video-1 ist ein günstiges Prompt-Videomodell (Sekundenpreis, 768p-Klasse), Cinematic Avatar ist ein Premium-Produkt mit Seedance-Pipeline und Pauschalpreis je Clip. Beide Modelle erzeugen cineastische Kamerabewegung; sie unterscheiden sich in der Identitätsbindung (siehe unten).

## 4. Kann das günstige Modell unsere Szenen?
| Anforderung | heygen-video-1 | Beleg |
|---|---|---|
| Dunkler Raum, LEA und DAVID treten ein, setzen sich | **ja, vergleichbar zu den früheren Clips** (15 s) | gesichtet (Zufallspersonen) |
| Dynamische Kamera (Push-in, Orbit, Dolly) | ja, per Prompt; 4:7-Pushins per Bild-zu-Video | gesichtet |
| Eigene Gesichter erhalten | **unklar:** `reference_to_video` akzeptiert bis 9 Bilder/3 Videos als Referenz („keep people … you supply“), garantiert aber keine Identität über Clips; Avatar-Looks werden nicht unterstützt | Doku; nicht getestet |
| Ton | wird mitgeneriert (Schritte, Ambience, evtl. Stimmen) | Doku |
Konsequenz: Identität sichern wir **durch Bildaufbau**: Einstiege und Sitzen in Totalen/Halbtotalen (Gesichter klein, wie in den früheren Clips), alle Nahaufnahmen und Dialoge mit den festen Avataren (Avatar V). Erst ein Test zeigt, ob die Masterbilder als Referenz die Personen ausreichend halten.

## 5. Empfehlung: günstigster geeigneter Weg
**Trailer = heygen-video-1 für S01–S05 + Avatar V für S06/S07 + echte Plattformaufnahmen + HyperFrames-Schnitt.** (Cinematic Avatar entfällt.)
Kosten (Listenpreise, ungemessen; Avatar V gemessen):
| Posten | Rechnung | USD |
|---|---|---|
| Identitäts-Mini-Test: 5 s, reference_to_video, 768p, Masterbilder LEA+DAVID | 5 × 0,03 | **0,15** (Obergrenze bei 1080p: 0,45) |
| Hauptclip S01–S05: 15 s, 768p, bis 3 Versuche | 3 × 0,45 | 1,35 |
| Finale Version 1080p (15 s) | 1 × 1,35 | 1,35 |
| Avatar-V-Dialoge (LEA 3,2 s, DAVID 1,6 s, je 3 Takes) | 3 × 4,8 s × 0,116 | 1,67 |
| Nachbearbeitung, Plattformaufnahmen, Sounddesign | lokal | 0 |
| **Summe** | | **≈ 4,5 USD** (gegenüber 9–22 USD mit Cinematic Avatar) |
Wallet 14,72 USD reicht deutlich; keine Aufladung nötig. Sparvariante: finale Version in 768p (0,45) ⇒ ≈ 3,6 USD; Nachteil: Hochskalierung.
**Hartes Kostenlimit:** Abrechnung pro Sekunde (dokumentiert) ⇒ ein 5-s-Test kostet höchstens 0,45 USD, auch wenn 1080p gewählt würde. Damit wäre die frühere „2-USD-Grenze“ hier zuverlässig einhaltbar.
Offen/Risiko: Identität der Personen (Test nötig), Auflösung 1080×1890 (≈ 1,6 % beschneiden oder skalieren auf 1080×1920), Ton unkontrolliert (stummschalten, Sounddesign selbst), Listenpreise aus Blog (Oktober-Aktion kann enden).

## Entscheidung
Es wurde **nichts** generiert. Zur Freigabe vorgeschlagen: der Mini-Test (≈ 0,15 USD, max. 0,45 USD) mit den Masterbildern LEA und DAVID. Hinweis: die frühere Aussage „drei getrennte Cinematic-Clips ≈ 22 USD“ und die Empfehlung `CINEMATIC_TEST_PREP.md` sind damit überholt.
