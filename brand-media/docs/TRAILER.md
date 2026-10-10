# Trailer „ANDERE RATEN. DU VERSTEHST.“ – Produktionsplan

20 s · 9:16 · 1080×1920 · DE · 25 fps. **Noch nichts produziert.** Freigabe nötig.

## Shotliste
| # | Zeit | Shot | Kamera | Quelle | Anmerkung |
|---|---|---|---|---|---|
| 1 | 0–2 | Leerer Raum, Türlicht | CAM-D | Studio-Referenz `empty-room` → image_to_video | Schritte-SFX, Musik-Bett leise |
| 2 | 2–4 | Lea von links, David von rechts treten ein | CAM-D, Schnitt statt Fahrt | zwei Einzelshots (Lea, David), je Startframe aus Master-Looks | später im Schnitt montieren |
| 3 | 4–6 | Beide setzen sich | CAM-C | cinematic_avatar mit 2 Looks (Lea, David) oder 2 Einzelshots | Hände prüfen |
| 4 | 6–8 | Umkreisen: 3 kurze Winkel (A/B/C) | je 1,3 s | Stills aus Studioset + leichte Bewegung | statt Dauerfahrt |
| 5 | 8–10 | Lea: „Investierst du noch nach Bauchgefühl?“ | CAM-A, nah | `create_video_from_avatar`, Photo-Avatar Lea | DE-Stimme, Lippensync |
| 6 | 10–12 | David: „Nicht mehr.“ | CAM-A, nah | `create_video_from_avatar`, Photo-Avatar David | |
| 7 | 12–17 | 4 Produktschnitte à ~1,2 s: Discover, Quant, Technical, Supertrader | Screen | **echte** Screenrecordings der Plattform (Playwright, Seite `research.visionuniverse.de`) | keine erfundenen Zahlen; Daten-/Rechtecheck, Supertrader nur wenn öffentlich zulässig |
| 8 | 17–20 | Schwarz, Typo „Andere raten. / Du verstehst.“, Logo | – | HyperFrames/HTML, Logo aus `social/brand` | Schrift aus Brand-System |

## Pipeline
1. Alle Startframes aus APPROVED-Assets. 2. Shots einzeln generieren (4–6 s), QA je Shot. 3. Schnitt/Typo/Audio in HyperFrames (lokale Skills) oder ffmpeg. 4. Export 1080×1920 H.264, Untertitel (SRT) einbrennen. 5. Registry um Video-Einträge erweitern.

## Produktionsreife
Storyboard: bereit. Charaktere: Master vorhanden, Folgebilder fehlen. HeyGen-Avatare: nicht angelegt. Screenrecordings: nicht erstellt. Musik/SFX: Lizenzquelle offen (`search_audio_sounds` verfügbar). **Nicht produzierbar vor den Freigaben 1–4 in `HEYGEN_INTEGRATION.md`.**

## Drei Vortests (vor Trailer)
(a) Sitzen: Lea am Tisch, 5 s, CAM-C. (b) Sprechen: David „Nicht mehr.“, 3 s, Lippensync. (c) Kamerabewegung: Lea+David, 4 s, langsamer Schwenk CAM-A→CAM-C. Erfolgskriterium: Identity- und Video-Checkliste bestanden.
