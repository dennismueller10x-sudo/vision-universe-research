# THE ROOM – Finaler 20-s-Trailer (Rohschnitt v2, Stand 2026-10-13)

Datei: `brand-media/video/trailer/the_room/final/vision_universe_the_room_20s_1080x1920.mp4` (1080×1920, 24 fps, 20,0 s, AAC; Smartphone-Vorschau 540×960 daneben).

## Aufbau
| Zeit | Inhalt | Quelle |
|---|---|---|
| 0,0–8,0 | Leerer Raum (0–1,6 s verlangsamt), Frau von links, Mann von rechts laufen herein, ziehen Stühle, setzen sich | heygen-video-1, Clip A (Referenzbild `room_reference_master.png`) |
| 7,6–13,1 | Fließender Drohnen-Orbit, Kamera steigt, Aufsicht | heygen-video-1, Clip B2 (Image-to-Video aus letztem Bild von A, Tempo 1,14×) |
| 8,0–12,8 | Off: „Tausende Aktien. Millionen Meinungen.“ / „Doch was zählt wirklich?“ | HeyGen Wolf Spencer (`ad9c4386ea934832b2de3ae2934005e9`, orca), Schnitt aus Hörprobe |
| 13,1–17,0 | Discover, Quant, Technical Intelligence, Supertrader, echte Aufnahmen, „Datenstand 09.10.2026 · letzter Handelstag“ | `platform_recordings_2026-10-09` (Supertrader nur Hero, keine Signale) |
| 17,0–20,0 | Hartschnitt auf Schwarz, ANDERE RATEN. DU VERSTEHST. + offizielles Logo; Claim gesprochen (Wolf Spencer, TTS) | HyperFrames, `assets/logo-white.png` |

Sound: synthetisches, lizenzfreies Bett (numpy, `tools/the-room-sounddesign.py`) + nativer HeyGen-Ton der Clips (echte Schritte, Stuhlrücken) + Off. Mix ca. −13 LUFS, Peak −2 dBFS.
Kennzeichnung: „KI-generierte Szenen“ (0,4–3 s) und „KI-generierte Szenen · Keine Anlageberatung“ (ab 17,5 s).

## Kosten (HeyGen-API-Wallet, gemessen)
Wallet 14,42 → 13,92 USD = **0,50 USD** von 4,00 USD Budget: Clip A 0,25 · B1 0,12 (verworfen) · B2 0,12 · Claim-TTS 0,01.
Image-to-Video kostete 0,12 USD für 7 s (≈ 0,017 USD/s), Referenz-zu-Video 0,25 USD für 8 s: niedriger als angenommen.

## Qualitätsbewertung
- Raum, Größenverhältnisse, Lichtkegel: stimmig und stabil, Referenz erkennbar getroffen.
- Hereinlaufen/Hinsetzen: Menschen laufen aus der Tiefe, kein Aufpoppen. Hände und Stühle in der Totalen unauffällig.
- Orbit B1 verworfen (Morphing), B2 sauber: ca. 100°, Kamera steigt, ruhig.
- Grenzen: Gesichter sind nur in der Totalen/Halbtotalen sichtbar (768p-Quelle, hochskaliert auf 1080p). Mikro-Details (Poren) nicht beurteilbar. Quelle 768p → Final-Re-Run in 1080p wäre 3× Kosten (A ≈ 0,75, B ≈ 0,36 USD), nur auf Wunsch.
- Offen: Hörprüfung durch Auftraggeber (Off-Stimme Wolf Spencer war die vorläufige Wahl, Ilya/Deep Dieter ohne Neukosten austauschbar, Claim-TTS dann ≈ 0,01 USD).
- Supertrader-Hero zeigt keine Daten (Signale veraltet); Datenstand 09.10.2026 ist eingeblendet.
